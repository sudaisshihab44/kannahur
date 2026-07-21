import React, { useState, useEffect } from 'react';
import { Search, HeartPulse, Clock, Users, ChevronRight, RefreshCw, Smartphone, MapPin, AlertCircle, CheckCircle } from 'lucide-react';
import { Token, TokenStatus, QueueSettings } from '../types';

interface PatientTrackerProps {
  tokens: Token[];
  settings: QueueSettings;
  onBackToApp?: () => void;
}

const getPriorityWeight = (priority: string | undefined): number => {
  if (!priority) return 0;
  switch (priority) {
    case 'VIP': return 4;
    case 'Person with Disability': return 3;
    case 'Pregnant Woman': return 2;
    case 'Senior Citizen': return 1;
    case 'Normal':
    default:
      return 0;
  }
};

export default function PatientTracker({ tokens, settings, onBackToApp }: PatientTrackerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Dynamic tracking states
  const [trackedTokenId, setTrackedTokenId] = useState<string | null>(null);
  const [myToken, setMyToken] = useState<any>(null);
  const [currentServingToken, setCurrentServingToken] = useState<any>(null);
  const [aheadCount, setAheadCount] = useState<number>(0);

  // Extract tokenId from URL path '/track/:tokenId' or query param '?tracker=...'
  useEffect(() => {
    const path = window.location.pathname;
    if (path.includes('/track/')) {
      const parts = path.split('/track/');
      const id = parts[parts.length - 1];
      if (id) {
        setTrackedTokenId(id);
        return;
      }
    }

    const params = new URLSearchParams(window.location.search);
    const trackerParam = params.get('tracker');
    if (trackerParam) {
      if (trackerParam.startsWith('tok-')) {
        setTrackedTokenId(trackerParam);
      } else {
        // Fallback for legacy token numbers
        const found = tokens.find(t => t.tokenNumber.toUpperCase() === trackerParam.toUpperCase());
        if (found) {
          setTrackedTokenId(found.id);
        }
      }
    }
  }, [tokens]);

  const fetchTrackData = async (id: string) => {
    try {
      const res = await fetch(`/api/track/${id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.myToken) {
          const mappedToken: Token = {
            id: data.myToken.id,
            tokenNumber: data.myToken.token_number,
            patientName: data.myToken.patient_name,
            patientMobile: data.myToken.patient_mobile,
            patientEmail: data.myToken.patient_email,
            patientAge: data.myToken.patient_age,
            patientGender: data.myToken.patient_gender,
            departmentId: data.myToken.department_id,
            departmentName: data.myToken.department_name,
            doctorId: data.myToken.doctor_id,
            doctorName: data.myToken.doctor_name,
            reasonForVisit: data.myToken.reason_for_visit,
            status: data.myToken.status,
            createdAt: data.myToken.created_at,
            calledAt: data.myToken.called_at,
            completedAt: data.myToken.completed_at,
            isEmergency: data.myToken.is_emergency,
            priority: data.myToken.priority,
            notes: data.myToken.notes,
            position: data.myToken.position,
            estimatedConsultationTime: data.myToken.estimated_consultation_time,
            estimatedWaitTime: data.myToken.estimated_wait_time,
            expectedConsultationStartTime: data.myToken.expected_consultation_start_time,
            lastNotifiedWaitTime: data.myToken.last_notified_wait_time,
            notifiedTwoRemaining: data.myToken.notified_two_remaining,
            notifiedYourTurn: data.myToken.notified_your_turn,
          };
          setMyToken(mappedToken);
          setSelectedToken(mappedToken);
          setCurrentServingToken(data.currentServing);
          setAheadCount(data.aheadCount);
          setErrorMsg('');
        } else {
          setErrorMsg('Token tracking information not found.');
        }
      } else {
        setErrorMsg('Failed to retrieve queue tracking information.');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Network error. Unable to contact queue tracker.');
    }
  };

  useEffect(() => {
    if (!trackedTokenId) return;

    fetchTrackData(trackedTokenId);
    const interval = setInterval(() => {
      fetchTrackData(trackedTokenId);
    }, 3000);

    return () => clearInterval(interval);
  }, [trackedTokenId]);

  // Auto look up first waiting token if none is selected and no active tracker URL
  useEffect(() => {
    if (!trackedTokenId && !selectedToken && tokens.length > 0) {
      const waiting = tokens.find(t => t.status === TokenStatus.WAITING || t.status === TokenStatus.CALLED);
      if (waiting) {
        setSelectedToken(waiting);
        setSearchQuery(waiting.tokenNumber);
      }
    }
  }, [tokens, trackedTokenId, selectedToken]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const query = searchQuery.trim();
    if (!query) {
      setErrorMsg('Please enter a valid token number or reference ID');
      return;
    }

    if (query.toUpperCase().startsWith('TOK-') || query.toLowerCase().startsWith('tok-')) {
      setTrackedTokenId(query);
      return;
    }

    const found = tokens.find(t => t.tokenNumber.toUpperCase() === query.toUpperCase() || t.id === query);
    if (found) {
      setTrackedTokenId(found.id);
      setSelectedToken(found);
    } else {
      setErrorMsg(`Token "${query}" was not found. Please verify your receipt.`);
      setSelectedToken(null);
      setTrackedTokenId(null);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    if (trackedTokenId) {
      fetchTrackData(trackedTokenId).finally(() => setIsRefreshing(false));
    } else if (selectedToken) {
      const fresh = tokens.find(t => t.id === selectedToken.id);
      if (fresh) {
        setSelectedToken(fresh);
      }
      setIsRefreshing(false);
    } else {
      setIsRefreshing(false);
    }
  };

  // Calculations for selected token
  const getQueueStats = (token: Token) => {
    if (token.status === TokenStatus.COMPLETED) {
      return { ahead: 0, time: 0, progress: 100, expectedTurn: '' };
    }
    if (token.status === TokenStatus.CALLED) {
      return { ahead: 0, time: 0, progress: 90, expectedTurn: '' };
    }
    if (token.status === TokenStatus.CANCELLED || token.status === TokenStatus.SKIPPED) {
      return { ahead: 0, time: 0, progress: 0, expectedTurn: '' };
    }

    if (myToken && trackedTokenId === token.id) {
      const time = myToken.estimatedWaitTime ?? 0;
      let expectedTurn = '';
      if (myToken.expectedConsultationStartTime) {
        expectedTurn = new Date(myToken.expectedConsultationStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      const progress = aheadCount > 0 ? Math.max(10, Math.round((1 / (aheadCount + 1)) * 100)) : 50;
      return { ahead: aheadCount, time, progress, expectedTurn };
    }

    // Filter tokens of the SAME doctor that are waiting and ahead of this one!
    const doctorTokens = tokens.filter(t => t.doctorId === token.doctorId);
    const doctorWaitingTokens = doctorTokens
      .filter(t => t.status === TokenStatus.WAITING)
      .sort((a, b) => {
        const weightA = getPriorityWeight(a.priority);
        const weightB = getPriorityWeight(b.priority);
        if (weightA !== weightB) {
          return weightB - weightA;
        }
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

    const myIndex = doctorWaitingTokens.findIndex(t => t.id === token.id);
    const ahead = myIndex === -1 ? 0 : myIndex;

    // Use stored server values if they exist!
    const time = token.estimatedWaitTime !== undefined ? token.estimatedWaitTime : (ahead * (token.estimatedConsultationTime || 12));
    
    // Expected Turn
    let expectedTurn = '';
    if (token.expectedConsultationStartTime) {
      expectedTurn = new Date(token.expectedConsultationStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      const startMs = Date.now() + (time * 60000);
      expectedTurn = new Date(startMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // Progress bar calculation
    const totalDoctorWaiting = doctorWaitingTokens.length;
    const progress = totalDoctorWaiting > 0 ? Math.max(10, Math.round(((totalDoctorWaiting - ahead) / totalDoctorWaiting) * 100)) : 50;

    return { ahead, time, progress, expectedTurn };
  };

  // Get current active token for the department of the selected token
  const getActiveDeptToken = (deptId: string) => {
    if (myToken && trackedTokenId === selectedToken?.id && currentServingToken) {
      return currentServingToken.token_number;
    }

    const called = tokens.find(t => t.departmentId === deptId && t.status === TokenStatus.CALLED);
    if (called) return called.tokenNumber;
    
    // Fallback to last completed
    const completed = tokens
      .filter(t => t.departmentId === deptId && t.status === TokenStatus.COMPLETED)
      .sort((a, b) => new Date(b.completedAt || "").getTime() - new Date(a.completedAt || "").getTime())[0];
    
    return completed ? `${completed.tokenNumber} (Done)` : "None Active";
  };

  const stats = selectedToken ? getQueueStats(selectedToken) : null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 sm:p-6 select-none font-sans pb-16">
      {/* Container wrapper mimicking modern mobile app layout */}
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden flex flex-col min-h-[680px]">
        
        {/* Mobile App Header */}
        <div className="bg-slate-900 text-white p-5 relative">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-600 rounded-xl text-white">
                <HeartPulse className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-sm font-semibold tracking-tight">{settings.hospitalInfo.name}</h1>
                <p className="text-[10px] text-slate-400">Patient Live Tracker</p>
              </div>
            </div>
            
            <button 
              onClick={handleRefresh}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-300 hover:text-white transition-all"
              title="Refresh Queue State"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <form onSubmit={handleSearch} className="relative mt-2">
            <input
              type="text"
              placeholder="Enter your Token (e.g. GEN-002)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800/80 border border-slate-700 rounded-2xl pl-11 pr-4 py-3 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="h-4.5 w-4.5" />
            </div>
            <button 
              type="submit"
              className="absolute right-2 top-2 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors"
            >
              Track
            </button>
          </form>

          {errorMsg && (
            <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {errorMsg}
            </p>
          )}
        </div>

        {/* Info Banner if Queue is Paused */}
        {settings.isPaused && (
          <div className="bg-amber-50 border-y border-amber-100 text-amber-800 px-4 py-2.5 text-xs text-center flex items-center justify-center gap-1.5">
            <AlertCircle className="h-4 w-4 text-amber-500 animate-pulse" />
            <span className="font-medium">Queue is currently on hold. Please bear with us.</span>
          </div>
        )}

        {/* Tracking Body */}
        <div className="flex-1 p-5 space-y-5 overflow-y-auto">
          {selectedToken ? (
            <>
              {/* Token Ticket Status Card */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full -translate-x-4 -translate-y-4"></div>
                
                <div className="flex justify-between items-start">
                  <div>
                    <span className="inline-block px-2.5 py-0.5 bg-blue-100 text-blue-800 font-semibold text-[10px] rounded-full uppercase tracking-wider">
                      {selectedToken.departmentName}
                    </span>
                    <h4 className="text-sm font-bold text-slate-900 mt-1">{selectedToken.patientName}</h4>
                    <p className="text-xs text-slate-500">{selectedToken.doctorName}</p>
                  </div>

                  <div className="text-right">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Your Token</p>
                    <div className="text-2xl font-display font-extrabold text-blue-600 tracking-tight">
                      {selectedToken.tokenNumber}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200/60 flex justify-between items-center text-xs">
                  <span className="text-slate-500 flex items-center gap-1">
                    <Smartphone className="h-3.5 w-3.5 text-slate-400" />
                    {selectedToken.patientMobile}
                  </span>
                  <span className="text-slate-500">
                    Age: {selectedToken.patientAge} • {selectedToken.patientGender}
                  </span>
                </div>
              </div>

              {/* Status Visual Representation */}
              {selectedToken.status === TokenStatus.WAITING && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-blue-50/50 rounded-2xl p-3 border border-blue-100/30 flex flex-col justify-between text-center">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Patients Ahead</span>
                    <div className="flex items-baseline justify-center gap-1 mt-1">
                      <span className="text-2xl font-display font-bold text-slate-900">{stats?.ahead}</span>
                    </div>
                    <span className="text-[9px] text-slate-400 mt-1 flex items-center justify-center gap-1">
                      <Users className="h-3 w-3 shrink-0" /> Ahead
                    </span>
                  </div>

                  <div className="bg-teal-50/30 rounded-2xl p-3 border border-teal-100/30 flex flex-col justify-between text-center">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Estimated Wait</span>
                    <div className="flex items-baseline justify-center gap-1 mt-1">
                      <span className="text-2xl font-display font-bold text-teal-600">{stats?.time}</span>
                    </div>
                    <span className="text-[9px] text-slate-400 mt-1 flex items-center justify-center gap-1">
                      <Clock className="h-3 w-3 shrink-0" /> Minutes
                    </span>
                  </div>

                  <div className="bg-indigo-50/40 rounded-2xl p-3 border border-indigo-100/30 flex flex-col justify-between text-center">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Expected Turn</span>
                    <div className="flex items-baseline justify-center gap-1 mt-1">
                      <span className="text-xs font-display font-extrabold text-indigo-600 truncate w-full">{stats?.expectedTurn}</span>
                    </div>
                    <span className="text-[9px] text-slate-400 mt-1 flex items-center justify-center gap-1">
                      <Clock className="h-3 w-3 shrink-0" /> Expected
                    </span>
                  </div>
                </div>
              )}

              {/* Special Status Banners */}
              {selectedToken.status === TokenStatus.CALLED && (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center space-y-2 animate-call-pulse">
                  <CheckCircle className="h-8 w-8 text-green-600 mx-auto" />
                  <h4 className="text-sm font-bold text-green-900">Your Token is Active!</h4>
                  <p className="text-xs text-green-700">
                    Please proceed immediately to <strong>{selectedToken.doctorName}'s</strong> consultation room.
                  </p>
                </div>
              )}

              {selectedToken.status === TokenStatus.COMPLETED && (
                <div className="bg-slate-100 border border-slate-200 rounded-2xl p-4 text-center space-y-1">
                  <CheckCircle className="h-8 w-8 text-slate-600 mx-auto" />
                  <h4 className="text-sm font-bold text-slate-800">Visit Completed</h4>
                  <p className="text-xs text-slate-500">
                    Your session with {selectedToken.doctorName} was marked complete at{" "}
                    {selectedToken.completedAt ? new Date(selectedToken.completedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'recently'}.
                  </p>
                </div>
              )}

              {(selectedToken.status === TokenStatus.SKIPPED || selectedToken.status === TokenStatus.CANCELLED) && (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-center space-y-1">
                  <AlertCircle className="h-8 w-8 text-red-500 mx-auto animate-bounce" />
                  <h4 className="text-sm font-bold text-red-800">Token {selectedToken.status === TokenStatus.SKIPPED ? 'Skipped' : 'Cancelled'}</h4>
                  <p className="text-xs text-red-600">
                    Please visit the main receptionist desk immediately to recall or re-register your token number.
                  </p>
                </div>
              )}

              {/* Department Status / Progress Bar */}
              {selectedToken.status === TokenStatus.WAITING && (
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between items-center text-xs text-slate-500">
                    <span>Department Active Running:</span>
                    <span className="font-bold text-slate-800">{getActiveDeptToken(selectedToken.departmentId)}</span>
                  </div>
                  
                  {/* Progress Line */}
                  <div className="relative pt-1">
                    <div className="overflow-hidden h-2.5 text-xs flex rounded-full bg-slate-100">
                      <div 
                        style={{ width: `${stats?.progress}%` }} 
                        className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-600 transition-all duration-500"
                      ></div>
                    </div>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 font-semibold tracking-wide uppercase">
                    <span>Arrived</span>
                    <span>Waiting</span>
                    <span>In-Consultation</span>
                  </div>
                </div>
              )}

              {/* Wayfinding directions helper */}
              <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100 flex items-start gap-2.5">
                <MapPin className="h-4.5 w-4.5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-xs font-semibold text-slate-800">Where to wait?</h5>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Please stay within the 2nd Floor General Waiting Lounge. Keep your notifications turned ON.
                  </p>
                </div>
              </div>

              {/* High-fidelity Ticket Mock (QR Code display) */}
              <div className="border border-dashed border-slate-200 rounded-2xl p-4 text-center space-y-2 bg-slate-50/50">
                <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Fast-Scan Reception Receipt</p>
                
                {/* Generates a beautiful vector QR mockup using styling */}
                <div className="w-28 h-28 bg-white p-2 border border-slate-200 rounded-xl mx-auto flex items-center justify-center">
                  <div className="grid grid-cols-5 gap-1.5 w-full h-full p-1">
                    {/* Visual representation of a QR grid */}
                    <div className="bg-slate-950 rounded-xs"></div>
                    <div className="bg-slate-950 rounded-xs"></div>
                    <div className="bg-slate-50"></div>
                    <div className="bg-slate-950 rounded-xs"></div>
                    <div className="bg-slate-950 rounded-xs"></div>

                    <div className="bg-slate-950 rounded-xs"></div>
                    <div className="bg-slate-50"></div>
                    <div className="bg-slate-950 rounded-xs"></div>
                    <div className="bg-slate-50"></div>
                    <div className="bg-slate-950 rounded-xs"></div>

                    <div className="bg-slate-50"></div>
                    <div className="bg-slate-950 rounded-xs"></div>
                    <div className="bg-slate-950 rounded-xs"></div>
                    <div className="bg-slate-950 rounded-xs"></div>
                    <div className="bg-slate-50"></div>

                    <div className="bg-slate-950 rounded-xs"></div>
                    <div className="bg-slate-50"></div>
                    <div className="bg-slate-50"></div>
                    <div className="bg-slate-950 rounded-xs"></div>
                    <div className="bg-slate-950 rounded-xs"></div>

                    <div className="bg-slate-950 rounded-xs"></div>
                    <div className="bg-slate-950 rounded-xs"></div>
                    <div className="bg-slate-50"></div>
                    <div className="bg-slate-950 rounded-xs"></div>
                    <div className="bg-slate-950 rounded-xs"></div>
                  </div>
                </div>
                
                <span className="inline-block text-[10px] font-mono text-slate-400">
                  REF-{selectedToken.id.split('-')[1]}
                </span>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
              <div className="p-4 bg-slate-100 rounded-full text-slate-400">
                <Smartphone className="h-10 w-10" />
              </div>
              <div className="space-y-1 px-4">
                <h4 className="text-base font-semibold text-slate-800">No active token loaded</h4>
                <p className="text-xs text-slate-400">
                  Search your unique token (e.g., GEN-001) in the top query bar to start real-time tracking.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100/60 text-center text-[10px] text-slate-400">
          Powered by InclusyQ Smart Token Systems
        </div>
      </div>

      {onBackToApp && (
        <button
          onClick={onBackToApp}
          className="mt-6 text-xs text-slate-500 hover:text-slate-700 bg-white border border-slate-200 px-4 py-2 rounded-2xl shadow-sm hover:shadow-md transition-all font-semibold flex items-center gap-1.5"
        >
          Return to Hospital Operator Workspace
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
