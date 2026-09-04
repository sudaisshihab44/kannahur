import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { 
  Users, RefreshCw, PlusCircle, Search, Calendar, UserCheck, 
  AlertOctagon, CheckCircle2, ChevronRight, XCircle, BellRing, 
  Pause, Play, ShieldAlert, Heart, Smartphone, HelpCircle, UserPlus 
} from 'lucide-react';
import { getPriorityWeight } from '../utils/priority';
import { Department, Doctor, Token, TokenStatus, Gender, QueueSettings, Patient, ReceptionUser, UserRole, TrackingDevice } from '../types';
import { authFetch } from '../utils/authFetch';

interface ReceptionDashboardProps {
  departments: Department[];
  doctors: Doctor[];
  tokens: Token[];
  patients: Patient[];
  settings: QueueSettings;
  devices?: TrackingDevice[];
  onRefreshData: () => Promise<void>;
  onTogglePause: () => Promise<void>;
  currentUser?: ReceptionUser | null;
}

export default memo(function ReceptionDashboard({
  departments,
  doctors,
  tokens,
  patients,
  settings,
  devices = [],
  onRefreshData,
  onTogglePause,
  currentUser
}: ReceptionDashboardProps) {

  const hasPriorityPermission = currentUser && (
    currentUser.role === UserRole.ADMIN || 
    (currentUser.permissions && currentUser.permissions.includes('set_priority'))
  );

  // ── Optimistic local token list (Task 7) ──────────────────────────────────
  // Declared BEFORE the allowedTokens useMemo that references it.
  // When a token is successfully created we optimistically prepend it to the
  // local list so the receptionist sees it instantly without waiting for the
  // next polling cycle to return from the server.
  const [optimisticTokens, setOptimisticTokens] = useState<Token[]>([]);

  // ── Per-token action in-flight guard (Task 8) ─────────────────────────────
  // Tracks which tokenIds have an in-flight action so the receptionist
  // cannot double-click Call / Complete / Skip on the same token.
  // Declared BEFORE any useMemo that might reference it.
  const [actionInFlight, setActionInFlight] = useState<Set<string>>(new Set());

  const setTokenInFlight = useCallback((tokenId: string) => {
    setActionInFlight(prev => new Set(prev).add(tokenId));
  }, []);

  const clearTokenInFlight = useCallback((tokenId: string) => {
    setActionInFlight(prev => {
      const next = new Set(prev);
      next.delete(tokenId);
      return next;
    });
  }, []);

  // ── Memoized filtered lists — only recompute when source arrays change ──
  const allowedDepartments = useMemo(() => departments.filter(dept => {
    if (!currentUser || currentUser.role === UserRole.ADMIN) return true;
    const assignedIds = currentUser.assignedDepartmentIds || (currentUser.departmentId ? [currentUser.departmentId] : []);
    return assignedIds.includes(dept.id);
  }), [departments, currentUser]);

  const allowedDoctors = useMemo(() => doctors.filter(doc => {
    if (!currentUser || currentUser.role === UserRole.ADMIN) return true;
    const assignedIds = currentUser.assignedDepartmentIds || (currentUser.departmentId ? [currentUser.departmentId] : []);
    return assignedIds.includes(doc.departmentId);
  }), [doctors, currentUser]);

  const allowedTokens = useMemo(() => {
    // Merge server tokens with optimistic tokens.
    // If the server has already returned the optimistic token (same id), deduplicate.
    const serverIds = new Set(tokens.map(t => t.id));
    const pendingOptimistic = optimisticTokens.filter(t => !serverIds.has(t.id));
    const combined = [...pendingOptimistic, ...tokens];

    if (!currentUser || currentUser.role === UserRole.ADMIN) return combined;
    const assignedIds = currentUser.assignedDepartmentIds || (currentUser.departmentId ? [currentUser.departmentId] : []);
    return combined.filter(t => assignedIds.includes(t.departmentId));
  }, [tokens, optimisticTokens, currentUser]);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('');
  const [selectedDocFilter, setSelectedDocFilter] = useState('');

  // Patient Registration state
  const [phoneQuery, setPhoneQuery] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientEmail, setPatientEmail] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientGender, setPatientGender] = useState<Gender>(Gender.MALE);
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [selectedDocId, setSelectedDocId] = useState('');
  const [reason, setReason] = useState('');
  const [priority, setPriority] = useState('Normal');
  const [estConsultTime, setEstConsultTime] = useState('');
  const [customEstConsultTime, setCustomEstConsultTime] = useState('');
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  
  // Registration Form feedback
  const [isRegistering, setIsRegistering] = useState(false);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState('');

  const handleUnassignDevice = async (deviceId: string) => {
    try {
      await authFetch('/api/devices/unassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId })
      });
      await onRefreshData();
    } catch (err) {
      console.error('Failed to unassign device:', err);
    }
  };

  // Default select if only 1 department is assigned
  useEffect(() => {
    if (allowedDepartments.length === 1) {
      const singleDeptId = allowedDepartments[0].id;
      setSelectedDeptFilter(singleDeptId);
      setSelectedDeptId(singleDeptId);
    }
  }, [allowedDepartments]);

  // ── Memoized per-token wait-time stats map ───────────────────────────────
  // Pre-computes stats for ALL waiting tokens once per allowedTokens change
  // instead of re-computing on every render inside the token list map.
  const tokenStatsMap = useMemo(() => {
    const map = new Map<string, { estimatedWait: number; expectedStart: string; patientsAhead: number }>();

    // Group waiting tokens by doctor (one sort per doctor, not per token)
    const byDoctor = new Map<string, Token[]>();
    for (const t of allowedTokens) {
      if (t.status !== TokenStatus.WAITING) continue;
      const arr = byDoctor.get(t.doctorId) ?? [];
      arr.push(t);
      byDoctor.set(t.doctorId, arr);
    }

    // Sort each doctor's queue once
    byDoctor.forEach((docTokens, docId) => {
      docTokens.sort((a, b) => {
        const diff = getPriorityWeight(b.priority) - getPriorityWeight(a.priority);
        if (diff !== 0) return diff;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

      const doctorObj    = doctors.find(d => d.id === docId);
      const defaultDur   = doctorObj?.avgConsultationTime || 15;
      let accumulated    = 0;

      docTokens.forEach((token, index) => {
        const estimatedWait   = accumulated;
        const consultDateTime = new Date(Date.now() + estimatedWait * 60000);
        const expectedStart   =
          consultDateTime.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
          ' • ' +
          consultDateTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

        map.set(token.id, { estimatedWait, expectedStart, patientsAhead: index });
        accumulated += token.estimatedConsultationTime || defaultDur;
      });
    });

    return map;
  }, [allowedTokens, doctors]);

  // Convenience accessor (keeps call-sites identical to the old function)
  const getReceptionTokenStats = useCallback((token: Token) => {
    if (token.status !== TokenStatus.WAITING) return { estimatedWait: 0, expectedStart: '', patientsAhead: 0 };
    return tokenStatsMap.get(token.id) ?? { estimatedWait: 0, expectedStart: '', patientsAhead: 0 };
  }, [tokenStatsMap]);

  // ── Memoized form doctor list ─────────────────────────────────────────────
  const filteredDoctorsForForm = useMemo(() => allowedDoctors.filter(
    doc => (doc.status === 'active' || doc.status === 'available' || doc.status === 'busy') &&
           (!selectedDeptId || doc.departmentId === selectedDeptId)
  ), [allowedDoctors, selectedDeptId]);

  // Auto-fill form when a matching patient is found via phone query
  const handlePhoneLookup = () => {
    if (!phoneQuery.trim()) return;
    const existing = patients.find(p => p.mobile.replace(/\s+/g, '') === phoneQuery.trim().replace(/\s+/g, ''));
    if (existing) {
      setPatientName(existing.name);
      if (existing.email) setPatientEmail(existing.email);
      setPatientAge(String(existing.age));
      setPatientGender(existing.gender);
      setFormSuccess(`Found existing patient record: ${existing.name}!`);
      setTimeout(() => setFormSuccess(null), 3000);
    }
  };

  // Trigger Token Registration API
  const handleGenerateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess(null);

    if (!patientName.trim() || !phoneQuery.trim() || !patientAge.trim() || !selectedDeptId || !selectedDocId) {
      setFormError('Please complete all required fields (Name, Mobile, Age, Department, Doctor).');
      return;
    }

    let finalEstTime: number | undefined = undefined;
    if (estConsultTime === 'custom') {
      finalEstTime = parseInt(customEstConsultTime) || undefined;
    } else if (estConsultTime) {
      finalEstTime = parseInt(estConsultTime) || undefined;
    }

    // ── Optimistic UI: disable the button immediately (Task 7) ────────────
    setIsRegistering(true);

    try {
      const response = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Operator-Username': currentUser?.username || ''
        },
        body: JSON.stringify({
          patientName,
          patientMobile: phoneQuery,
          patientEmail,
          patientAge,
          patientGender,
          departmentId: selectedDeptId,
          doctorId: selectedDocId,
          reasonForVisit: reason,
          priority,
          estimatedConsultationTime: finalEstTime
        })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        if (selectedDeviceId && data.token?.id) {
          try {
            await authFetch('/api/devices/assign', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ deviceId: selectedDeviceId, tokenId: data.token.id })
            });
          } catch (devErr) {
            console.error('Device assignment failed:', devErr);
          }
        }

        // ── Optimistic update: prepend real token to local list (Task 7) ──
        // The server returned the real token — show it immediately in the
        // queue list without waiting for the next polling cycle.
        setOptimisticTokens(prev => [data.token, ...prev.filter(t => t.id !== data.token.id)]);

        setFormSuccess(`Token ${data.token.tokenNumber} created successfully!`);
        // Reset form
        setPatientName('');
        setPhoneQuery('');
        setPatientEmail('');
        setPatientAge('');
        setReason('');
        setPriority('Normal');
        setEstConsultTime('');
        setCustomEstConsultTime('');
        setSelectedDeviceId('');

        // Trigger server refresh in background — do not await (non-blocking)
        onRefreshData().catch(() => {});
      } else {
        setFormError(data.message || 'Failed to create token.');
      }
    } catch (err: any) {
      setFormError(`Connection failure. Could not contact the server. ${err?.message || ''}`.trim());
    } finally {
      setIsRegistering(false);
    }
  };

  // Queue Operations Actions — with per-token duplicate-click guard (Task 8)
  const handleCallToken = async (tokenId: string) => {
    if (actionInFlight.has(tokenId)) return;       // ← guard: reject double-click
    setTokenInFlight(tokenId);
    try {
      const res = await fetch(`/api/tokens/${tokenId}/call`, { 
        method: 'POST',
        headers: { 'X-Operator-Username': currentUser?.username || '' }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.message || 'Failed to call token.');
      } else {
        onRefreshData().catch(() => {});
      }
    } catch (err: any) {
      setFormError(`Server error: ${err?.message || 'Could not call token.'}`);
    } finally {
      clearTokenInFlight(tokenId);
    }
  };

  const handleCompleteToken = async (tokenId: string) => {
    if (actionInFlight.has(tokenId)) return;
    setTokenInFlight(tokenId);
    try {
      const res = await fetch(`/api/tokens/${tokenId}/complete`, { 
        method: 'POST',
        headers: { 'X-Operator-Username': currentUser?.username || '' }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.message || 'Failed to complete token.');
      } else {
        onRefreshData().catch(() => {});
      }
    } catch (err: any) {
      setFormError(`Server error: ${err?.message || 'Could not complete token.'}`);
    } finally {
      clearTokenInFlight(tokenId);
    }
  };

  const handleSkipToken = async (tokenId: string) => {
    if (actionInFlight.has(tokenId)) return;
    setTokenInFlight(tokenId);
    try {
      const res = await fetch(`/api/tokens/${tokenId}/skip`, { 
        method: 'POST',
        headers: { 'X-Operator-Username': currentUser?.username || '' }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.message || 'Failed to skip token.');
      } else {
        onRefreshData().catch(() => {});
      }
    } catch (err: any) {
      setFormError(`Server error: ${err?.message || 'Could not skip token.'}`);
    } finally {
      clearTokenInFlight(tokenId);
    }
  };

  const handleCancelToken = async (tokenId: string) => {
    if (actionInFlight.has(tokenId)) return;
    setTokenInFlight(tokenId);
    try {
      const res = await fetch(`/api/tokens/${tokenId}/cancel`, { 
        method: 'POST',
        headers: { 'X-Operator-Username': currentUser?.username || '' }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.message || 'Failed to cancel token.');
      } else {
        onRefreshData().catch(() => {});
      }
    } catch (err: any) {
      setFormError(`Server error: ${err?.message || 'Could not cancel token.'}`);
    } finally {
      clearTokenInFlight(tokenId);
    }
  };

  const handleRecallToken = async (tokenId: string) => {
    if (actionInFlight.has(tokenId)) return;
    setTokenInFlight(tokenId);
    try {
      const res = await fetch(`/api/tokens/${tokenId}/recall`, { 
        method: 'POST',
        headers: { 'X-Operator-Username': currentUser?.username || '' }
      });
      if (res.ok) {
        setFormSuccess(`Recalled token successfully! Alert broadcasted to TV display.`);
        setTimeout(() => setFormSuccess(null), 3000);
        onRefreshData().catch(() => {});
      }
    } catch (err) {
      // silent — recall is non-critical
    } finally {
      clearTokenInFlight(tokenId);
    }
  };

  // Automated Call Next logic (grabs the first waiting token based on priorities)
  const handleCallNext = async () => {
    // Sort waiting tokens: Priority first, then chronological
    const waiting = allowedTokens
      .filter(t => t.status === TokenStatus.WAITING)
      .sort((a, b) => {
        const weightA = getPriorityWeight(a.priority);
        const weightB = getPriorityWeight(b.priority);
        if (weightA !== weightB) {
          return weightB - weightA;
        }
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

    if (waiting.length === 0) {
      setFormError('All queues are completed! No patients waiting.');
      setTimeout(() => setFormError(''), 4000);
      return;
    }

    const nextToken = waiting[0];
    await handleCallToken(nextToken.id);
  };

  // ── Memoized derived values — only recompute when allowedTokens or filters change
  const activeCalledToken = useMemo(() =>
    allowedTokens
      .filter(t => t.status === TokenStatus.CALLED)
      .sort((a, b) => new Date(b.calledAt || '').getTime() - new Date(a.calledAt || '').getTime())[0] || null,
    [allowedTokens]);

  const waitingCount   = useMemo(() => allowedTokens.filter(t => t.status === TokenStatus.WAITING).length, [allowedTokens]);
  const emergencyCount = useMemo(() => allowedTokens.filter(t => t.status === TokenStatus.WAITING && t.priority && t.priority !== 'Normal').length, [allowedTokens]);
  const completedCount = useMemo(() => allowedTokens.filter(t => t.status === TokenStatus.COMPLETED).length, [allowedTokens]);

  const sortedTokensForList = useMemo(() => {
    const filtered = allowedTokens.filter(t => {
      const lo = searchTerm.toLowerCase();
      const matchesSearch =
        t.tokenNumber.toLowerCase().includes(lo) ||
        t.patientName.toLowerCase().includes(lo) ||
        t.patientMobile.includes(searchTerm);
      const matchesDept = !selectedDeptFilter || t.departmentId === selectedDeptFilter;
      const matchesDoc  = !selectedDocFilter  || t.doctorId     === selectedDocFilter;
      return matchesSearch && matchesDept && matchesDoc;
    });

    const STATUS_RANK: Record<string, number> = {
      [TokenStatus.CALLED]: 1, [TokenStatus.WAITING]: 2,
      [TokenStatus.COMPLETED]: 3, [TokenStatus.SKIPPED]: 4, [TokenStatus.CANCELLED]: 5,
    };

    return filtered.sort((a, b) => {
      const rankDiff = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
      if (rankDiff !== 0) return rankDiff;
      if (a.status === TokenStatus.WAITING) {
        const weightDiff = getPriorityWeight(b.priority) - getPriorityWeight(a.priority);
        if (weightDiff !== 0) return weightDiff;
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [allowedTokens, searchTerm, selectedDeptFilter, selectedDocFilter]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* LEFT COLUMN: Registration & Token Spawning */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 h-fit">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
            <UserPlus className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Patient Registration</h2>
            <p className="text-[11px] text-slate-400">Search existing profile or register a new token</p>
          </div>
        </div>

        {formSuccess && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-3.5 py-2.5 rounded-2xl text-xs flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="font-medium">{formSuccess}</span>
          </div>
        )}

        {formError && (
          <div className="mb-4 bg-red-50 border border-red-100 text-red-700 px-3.5 py-2.5 rounded-2xl text-xs flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span className="font-medium">{formError}</span>
          </div>
        )}

        <form onSubmit={handleGenerateToken} className="space-y-4">
          
          {/* Quick Lookup Mobile Row */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Mobile Number (Quick Search)
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1 rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Smartphone className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  placeholder="e.g. +1 (555) 019-2831"
                  value={phoneQuery}
                  onChange={(e) => setPhoneQuery(e.target.value)}
                  onBlur={handlePhoneLookup}
                  className="block w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <button
                type="button"
                onClick={handlePhoneLookup}
                className="px-3 py-2.5 bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-xs rounded-xl hover:bg-slate-200 transition-colors"
                title="Search registered database"
              >
                Search
              </button>
            </div>
          </div>

          {/* Email Field */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Patient Email (Optional)
            </label>
            <input
              type="email"
              value={patientEmail}
              onChange={(e) => setPatientEmail(e.target.value)}
              placeholder="Patient email (optional)"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Patient Full Name
              </label>
              <input
                type="text"
                placeholder="John Doe"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Age
              </label>
              <input
                type="number"
                placeholder="30"
                value={patientAge}
                onChange={(e) => setPatientAge(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Biological Gender
            </label>
            <div className="grid grid-cols-3 gap-2">
              {Object.values(Gender).map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setPatientGender(g)}
                  className={`py-2 text-xs font-semibold rounded-xl border text-center transition-all ${
                    patientGender === g 
                      ? 'bg-blue-600 border-blue-600 text-white' 
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Division Selection
              </label>
              <select
                value={selectedDeptId}
                onChange={(e) => setSelectedDeptId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Choose Dept...</option>
                {allowedDepartments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Assigned Doctor
              </label>
              <select
                value={selectedDocId}
                onChange={(e) => setSelectedDocId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Choose Physician...</option>
                {filteredDoctorsForForm.map(doc => (
                  <option key={doc.id} value={doc.id}>{doc.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Reason for Consultation (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Mild throat infection, checkup"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Estimated Consultation Time (Minutes)
            </label>
            <div className="flex gap-2">
              <select
                value={estConsultTime}
                onChange={(e) => setEstConsultTime(e.target.value)}
                className="block w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Auto (Use Doctor or Dept Default)</option>
                <option value="5">5 Minutes</option>
                <option value="10">10 Minutes</option>
                <option value="15">15 Minutes</option>
                <option value="20">20 Minutes</option>
                <option value="30">30 Minutes</option>
                <option value="45">45 Minutes</option>
                <option value="60">60 Minutes</option>
                <option value="custom">Custom Duration...</option>
              </select>

              {estConsultTime === 'custom' && (
                <input
                  type="number"
                  placeholder="Minutes"
                  min="1"
                  max="180"
                  value={customEstConsultTime}
                  onChange={(e) => setCustomEstConsultTime(e.target.value)}
                  className="w-24 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              )}
            </div>
          </div>

          {/* Priority Select dropdown with authorization checks */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Queue Priority Level
            </label>
            <div className={`relative flex items-center p-3 rounded-2xl border transition-colors ${
              !hasPriorityPermission 
                ? 'bg-slate-50 border-slate-100 text-slate-400' 
                : priority !== 'Normal'
                  ? 'bg-red-50/50 border-red-100'
                  : 'bg-slate-50/50 border-slate-200'
            }`}>
              <div className="flex gap-2 items-start w-full">
                <ShieldAlert className={`h-5 w-5 mt-0.5 ${priority !== 'Normal' ? 'text-red-600' : 'text-slate-400'}`} />
                <div className="flex-1">
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    disabled={!hasPriorityPermission}
                    className="block w-full bg-transparent border-0 p-0 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-0 cursor-pointer disabled:cursor-not-allowed disabled:text-slate-400"
                  >
                    <option value="Normal">Normal Priority</option>
                    <option value="Senior Citizen">👴 Senior Citizen Priority</option>
                    <option value="Pregnant Woman">🤰 Pregnant Woman Priority</option>
                    <option value="Person with Disability">♿ Person with Disability Priority</option>
                    <option value="VIP">🌟 VIP Priority</option>
                  </select>
                  {!hasPriorityPermission ? (
                    <span className="text-[9px] text-slate-400 block mt-1">
                      ⚠️ Requires 'Assign Queue Priority' permission to elevate.
                    </span>
                  ) : priority !== 'Normal' ? (
                    <span className="text-[9px] text-red-600 block mt-1">
                      Bypasses standard care queue chronologically based on level.
                    </span>
                  ) : (
                    <span className="text-[9px] text-slate-400 block mt-1">
                      Patients are queued chronologically.
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Hardware Pager Assignment */}
          {devices.length > 0 && (
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                📟 Assign Hardware Pager (Optional)
              </label>
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="block w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">No pager — patient uses phone/screen</option>
                {devices
                  .filter(d => d.status === 'available')
                  .map(d => (
                    <option key={d.id} value={d.id}>{d.id} — Available</option>
                  ))}
              </select>
              <span className="text-[9px] text-slate-400 block mt-1">
                For elderly or non-smartphone patients. Pager auto-returns when consultation ends.
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={isRegistering}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-2xl shadow-md hover:shadow-lg transition-all flex justify-center items-center gap-2 disabled:opacity-50"
          >
            <PlusCircle className="h-4.5 w-4.5" />
            {isRegistering ? 'Generating Token...' : 'Generate Patient Token'}
          </button>
        </form>
      </div>

      {/* RIGHT COLUMN: Interactive Queue Workspace */}
      <div className="lg:col-span-2 space-y-4">
        
        {/* Rapid Actions Header Panel */}
        <div className="bg-slate-900 text-white p-5 rounded-3xl border border-slate-800 shadow-md flex justify-between items-center">
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Currently Called</span>
            <div className="text-3xl font-display font-extrabold text-white mt-1">
              {activeCalledToken ? activeCalledToken.tokenNumber : 'None'}
            </div>
            <span className="text-xs text-blue-400 truncate block max-w-[200px] mt-0.5">
              {activeCalledToken ? activeCalledToken.doctorName : 'All rooms clear'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCallNext}
              className="py-3 px-5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 animate-call-pulse"
              title="Summon the next waiting patient"
            >
              <BellRing className="h-4 w-4" /> Call Next
            </button>

            <button
              onClick={onTogglePause}
              className={`p-3 rounded-2xl border transition-all ${
                settings.isPaused 
                  ? 'bg-amber-600/20 text-amber-400 border-amber-500/40 hover:bg-amber-600/30' 
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
              title={settings.isPaused ? "Resume general queue" : "Hold general queue"}
            >
              {settings.isPaused ? <Play className="h-5 w-5 fill-amber-400 text-amber-400" /> : <Pause className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Real-time State Quick Metrics */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm text-center">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Total Waiting</span>
            <span className="text-2xl font-display font-extrabold text-slate-900 mt-1 block">{waitingCount}</span>
            {emergencyCount > 0 && (
              <span className="text-[9px] text-red-500 font-bold tracking-tight block mt-0.5">
                ({emergencyCount} Emergencies)
              </span>
            )}
          </div>
          <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm text-center">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Completed Visit</span>
            <span className="text-2xl font-display font-extrabold text-green-600 mt-1 block">{completedCount}</span>
          </div>
          <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm text-center">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Active Queue Status</span>
            <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full mt-2.5 uppercase tracking-wide ${
              settings.isPaused ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
            }`}>
              {settings.isPaused ? 'On Hold' : 'Live'}
            </span>
          </div>
        </div>

        {/* Interactive Wait List & Timeline Filters */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
          <div className="flex flex-col md:flex-row gap-2 justify-between items-center">
            <span className="text-sm font-bold text-slate-900 shrink-0 uppercase tracking-wide">Queue List</span>
            
            {/* Filters Row */}
            <div className="flex gap-2 w-full justify-end">
              <select
                value={selectedDeptFilter}
                onChange={(e) => setSelectedDeptFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-[10px] font-semibold text-slate-600 rounded-xl px-2.5 py-1.5 focus:outline-none"
              >
                <option value="">All Depts</option>
                {allowedDepartments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              
              <select
                value={selectedDocFilter}
                onChange={(e) => setSelectedDocFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-[10px] font-semibold text-slate-600 rounded-xl px-2.5 py-1.5 focus:outline-none"
              >
                <option value="">All Doctors</option>
                {allowedDoctors.map(doc => (
                  <option key={doc.id} value={doc.id}>{doc.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Search Token Query */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search by Patient name, phone or Token code (e.g. GEN-001)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-950 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="h-4 w-4" />
            </div>
          </div>

          {/* Active List Timeline rendering */}
          <div className="space-y-3.5 max-h-[460px] overflow-y-auto pr-1">
            {sortedTokensForList.length > 0 ? (
              sortedTokensForList.map((token) => (
                <div 
                  key={token.id} 
                  className={`p-4 rounded-2xl border transition-all flex flex-col gap-3 relative ${
                    token.status === TokenStatus.CALLED 
                      ? 'bg-blue-50/60 border-blue-200/80 animate-call-pulse shadow-sm' 
                      : token.priority && token.priority !== 'Normal' && token.status === TokenStatus.WAITING
                        ? token.priority === 'VIP' ? 'bg-amber-50/40 border-amber-200' :
                          token.priority === 'Person with Disability' ? 'bg-purple-50/40 border-purple-200' :
                          token.priority === 'Pregnant Woman' ? 'bg-pink-50/40 border-pink-200' :
                          'bg-emerald-50/40 border-emerald-200' // Senior Citizen
                        : 'bg-slate-50/50 border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {/* Status Badging absolute markers */}
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-base font-display font-extrabold tracking-tight text-slate-950">
                          {token.tokenNumber}
                        </span>
                        
                        <span className="text-[10px] text-slate-400 font-medium">
                          • {token.departmentName}
                        </span>

                        {token.priority && token.priority !== 'Normal' && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider ${
                            token.priority === 'VIP' ? 'bg-amber-100 text-amber-800' :
                            token.priority === 'Person with Disability' ? 'bg-purple-100 text-purple-800' :
                            token.priority === 'Pregnant Woman' ? 'bg-pink-100 text-pink-800' :
                            'bg-emerald-100 text-emerald-800' // Senior Citizen
                          }`}>
                            {token.priority}
                          </span>
                        )}
                      </div>

                      <h4 className="text-xs font-bold text-slate-900 mt-1">{token.patientName}</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">Assigned: {token.doctorName}</p>
                      
                      {token.status === TokenStatus.WAITING && (() => {
                        const stats = getReceptionTokenStats(token);
                        return (
                          <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-dashed border-slate-200/60 bg-slate-100/30 p-2 rounded-xl text-center text-[10px]">
                            <div>
                              <span className="block text-slate-400 font-bold uppercase tracking-wider text-[8px]">Est. Wait</span>
                              <span className="font-extrabold text-slate-700">{stats.estimatedWait} mins</span>
                            </div>
                            <div>
                              <span className="block text-slate-400 font-bold uppercase tracking-wider text-[8px]">Expected Consult</span>
                              <span className="font-extrabold text-slate-700">{stats.expectedStart}</span>
                            </div>
                            <div>
                              <span className="block text-slate-400 font-bold uppercase tracking-wider text-[8px]">Remaining Patients</span>
                              <span className="font-extrabold text-slate-700">{stats.patientsAhead} ahead</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="text-right">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                        token.status === TokenStatus.CALLED ? 'bg-blue-100 text-blue-800' :
                        token.status === TokenStatus.WAITING ? 'bg-slate-100 text-slate-600' :
                        token.status === TokenStatus.COMPLETED ? 'bg-green-100 text-green-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {token.status}
                      </span>
                      <span className="text-[9px] text-slate-400 font-mono block mt-1">
                        {new Date(token.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  {/* Hardware Pager Badge */}
                  {token.deviceId && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200/80 rounded-xl">
                      <span className="text-[10px] font-bold text-indigo-700 flex items-center gap-1.5">
                        📟 Pager: <span className="font-mono">{token.deviceId}</span>
                      </span>
                      <button
                        onClick={() => handleUnassignDevice(token.deviceId!)}
                        className="ml-auto text-[9px] font-bold text-indigo-500 hover:text-red-600 border border-indigo-200 hover:border-red-300 px-2 py-0.5 rounded-lg transition-colors"
                        title="Return pager to pool"
                      >
                        ✕ Return Pager
                      </button>
                    </div>
                  )}

                  {/* Actions Bar inside card depending on status */}
                  <div className="pt-2 border-t border-slate-200/40 flex justify-between items-center">
                    
                    {/* Secondary details */}
                    <span className="text-[10px] text-slate-400 italic font-medium truncate max-w-[140px]" title={token.reasonForVisit}>
                      {token.reasonForVisit ? `"${token.reasonForVisit}"` : 'No diagnosis recorded'}
                    </span>

                    {/* Operational Triggers — disabled when this token has an action in-flight */}
                    <div className="flex gap-1.5">
                      {token.status === TokenStatus.WAITING && (
                        <>
                          <button
                            onClick={() => handleCallToken(token.id)}
                            disabled={actionInFlight.has(token.id)}
                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] rounded-lg transition-colors flex items-center gap-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {actionInFlight.has(token.id) ? '...' : 'Call'}
                          </button>
                          <button
                            onClick={() => handleSkipToken(token.id)}
                            disabled={actionInFlight.has(token.id)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold text-[10px] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Skip
                          </button>
                          <button
                            onClick={() => handleCancelToken(token.id)}
                            disabled={actionInFlight.has(token.id)}
                            className="px-2 py-1 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Cancel Token"
                          >
                            <XCircle className="h-4.5 w-4.5" />
                          </button>
                        </>
                      )}

                      {token.status === TokenStatus.CALLED && (
                        <>
                          <button
                            onClick={() => handleCompleteToken(token.id)}
                            disabled={actionInFlight.has(token.id)}
                            className="px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white font-bold text-[10px] rounded-lg transition-colors flex items-center gap-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {actionInFlight.has(token.id) ? '...' : 'Complete'}
                          </button>
                          <button
                            onClick={() => handleRecallToken(token.id)}
                            disabled={actionInFlight.has(token.id)}
                            className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] rounded-lg transition-colors flex items-center gap-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Flash again on TV Display"
                          >
                            Recall
                          </button>
                          <button
                            onClick={() => handleCancelToken(token.id)}
                            disabled={actionInFlight.has(token.id)}
                            className="px-2 py-1 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Cancel Token"
                          >
                            <XCircle className="h-4.5 w-4.5" />
                          </button>
                        </>
                      )}

                      {(token.status === TokenStatus.SKIPPED || token.status === TokenStatus.CANCELLED) && (
                        <button
                          onClick={() => handleCallToken(token.id)}
                          disabled={actionInFlight.has(token.id)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold text-[10px] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {actionInFlight.has(token.id) ? '...' : 'Recall Patient'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-3xl">
                No active token logs matched your search filters.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
