import React, { useState, useEffect, useCallback, memo } from 'react';
import {
  Search, Clock, Users, ChevronRight, RefreshCw,
  Smartphone, MapPin, AlertCircle, CheckCircle,
} from 'lucide-react';
import { Token, TokenStatus, QueueSettings } from '../types';
import { getPriorityWeight } from '../utils/priority';

interface PatientTrackerProps {
  tokens: Token[];
  settings: QueueSettings;
  onBackToApp?: () => void;
}

export default memo(function PatientTracker({ tokens, settings, onBackToApp }: PatientTrackerProps) {
  const [searchQuery,    setSearchQuery]    = useState('');
  const [selectedToken,  setSelectedToken]  = useState<Token | null>(null);
  const [errorMsg,       setErrorMsg]       = useState('');
  const [isRefreshing,   setIsRefreshing]   = useState(false);
  const [trackedTokenId, setTrackedTokenId] = useState<string | null>(null);
  const [myToken,        setMyToken]        = useState<Token | null>(null);
  const [currentServingToken, setCurrentServingToken] = useState<any>(null);
  const [aheadCount,     setAheadCount]     = useState<number>(0);

  // ── Extract tokenId from URL on mount ────────────────────────────────────
  useEffect(() => {
    const path = window.location.pathname;
    if (path.includes('/track/')) {
      const id = path.split('/track/').pop();
      if (id) { setTrackedTokenId(id); return; }
    }
    const params       = new URLSearchParams(window.location.search);
    const trackerParam = params.get('tracker');
    if (trackerParam) {
      if (trackerParam.startsWith('tok-')) {
        setTrackedTokenId(trackerParam);
      } else {
        const found = tokens.find(t => t.tokenNumber.toUpperCase() === trackerParam.toUpperCase());
        if (found) setTrackedTokenId(found.id);
      }
    }
  }, [tokens]);

  // ── Fetch from /api/track/:id ─────────────────────────────────────────────
  const fetchTrackData = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/track/${id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.myToken) {
          const mt = data.myToken;
          const mapped: Token = {
            id: mt.id, tokenNumber: mt.token_number, patientName: mt.patient_name,
            patientMobile: mt.patient_mobile, patientEmail: mt.patient_email,
            patientAge: mt.patient_age, patientGender: mt.patient_gender,
            departmentId: mt.department_id, departmentName: mt.department_name,
            doctorId: mt.doctor_id, doctorName: mt.doctor_name,
            reasonForVisit: mt.reason_for_visit, status: mt.status,
            createdAt: mt.created_at, calledAt: mt.called_at, completedAt: mt.completed_at,
            isEmergency: mt.is_emergency, priority: mt.priority, notes: mt.notes,
            position: mt.position,
            estimatedConsultationTime: mt.estimated_consultation_time,
            estimatedWaitTime: mt.estimated_wait_time,
            expectedConsultationStartTime: mt.expected_consultation_start_time,
            lastNotifiedWaitTime: mt.last_notified_wait_time,
            notifiedTwoRemaining: mt.notified_two_remaining,
            notifiedYourTurn: mt.notified_your_turn,
          };
          setMyToken(mapped);
          setSelectedToken(mapped);
          setCurrentServingToken(data.currentServing);
          setAheadCount(data.aheadCount);
          setErrorMsg('');
        } else {
          setErrorMsg('Token tracking information not found.');
        }
      } else {
        setErrorMsg('Failed to retrieve queue tracking information.');
      }
    } catch {
      setErrorMsg('Network error. Unable to contact queue tracker.');
    }
  }, []);

  useEffect(() => {
    if (!trackedTokenId) return;
    fetchTrackData(trackedTokenId);
  }, [trackedTokenId, fetchTrackData]);

  // Auto-select first waiting token if none set
  useEffect(() => {
    if (!trackedTokenId && !selectedToken && tokens.length > 0) {
      const waiting = tokens.find(t => t.status === TokenStatus.WAITING || t.status === TokenStatus.CALLED);
      if (waiting) { setSelectedToken(waiting); setSearchQuery(waiting.tokenNumber); }
    }
  }, [tokens, trackedTokenId, selectedToken]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const query = searchQuery.trim();
    if (!query) { setErrorMsg('Please enter a valid token number or reference ID.'); return; }
    if (query.toLowerCase().startsWith('tok-')) { setTrackedTokenId(query); return; }
    const found = tokens.find(t => t.tokenNumber.toUpperCase() === query.toUpperCase() || t.id === query);
    if (found) { setTrackedTokenId(found.id); setSelectedToken(found); }
    else { setErrorMsg(`Token "${query}" not found. Please verify your receipt.`); setSelectedToken(null); setTrackedTokenId(null); }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    if (trackedTokenId) {
      fetchTrackData(trackedTokenId).finally(() => setIsRefreshing(false));
    } else if (selectedToken) {
      const fresh = tokens.find(t => t.id === selectedToken.id);
      if (fresh) setSelectedToken(fresh);
      setIsRefreshing(false);
    } else {
      setIsRefreshing(false);
    }
  };

  // ── Queue stats calculation ───────────────────────────────────────────────
  const getQueueStats = (token: Token) => {
    if (token.status === TokenStatus.COMPLETED)  return { ahead: 0, time: 0, progress: 100, expectedTurn: '' };
    if (token.status === TokenStatus.CALLED)     return { ahead: 0, time: 0, progress: 90,  expectedTurn: '' };
    if (token.status === TokenStatus.CANCELLED || token.status === TokenStatus.SKIPPED)
      return { ahead: 0, time: 0, progress: 0, expectedTurn: '' };

    if (myToken && trackedTokenId === token.id) {
      const time = myToken.estimatedWaitTime ?? 0;
      let expectedTurn = '';
      if (myToken.expectedConsultationStartTime) {
        expectedTurn = new Date(myToken.expectedConsultationStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      const progress = aheadCount > 0 ? Math.max(10, Math.round((1 / (aheadCount + 1)) * 100)) : 50;
      return { ahead: aheadCount, time, progress, expectedTurn };
    }

    const doctorWaiting = tokens
      .filter(t => t.doctorId === token.doctorId && t.status === TokenStatus.WAITING)
      .sort((a, b) => {
        const diff = getPriorityWeight(b.priority) - getPriorityWeight(a.priority);
        return diff !== 0 ? diff : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
    const myIndex = doctorWaiting.findIndex(t => t.id === token.id);
    const ahead   = myIndex === -1 ? 0 : myIndex;
    const time    = token.estimatedWaitTime !== undefined ? token.estimatedWaitTime : ahead * (token.estimatedConsultationTime || 12);
    let expectedTurn = '';
    if (token.expectedConsultationStartTime) {
      expectedTurn = new Date(token.expectedConsultationStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      expectedTurn = new Date(Date.now() + time * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const total    = doctorWaiting.length;
    const progress = total > 0 ? Math.max(10, Math.round(((total - ahead) / total) * 100)) : 50;
    return { ahead, time, progress, expectedTurn };
  };

  const getActiveDeptToken = (deptId: string) => {
    if (myToken && trackedTokenId === selectedToken?.id && currentServingToken) {
      return currentServingToken.token_number;
    }
    const called = tokens.find(t => t.departmentId === deptId && t.status === TokenStatus.CALLED);
    if (called) return called.tokenNumber;
    const done = tokens
      .filter(t => t.departmentId === deptId && t.status === TokenStatus.COMPLETED)
      .sort((a, b) => new Date(b.completedAt || '').getTime() - new Date(a.completedAt || '').getTime())[0];
    return done ? `${done.tokenNumber} (Done)` : 'None active';
  };

  const stats = selectedToken ? getQueueStats(selectedToken) : null;

  // ── Status colour helpers ─────────────────────────────────────────────────
  const statusColor = (s: TokenStatus) => {
    if (s === TokenStatus.CALLED)    return 'var(--color-sage-600)';
    if (s === TokenStatus.COMPLETED) return 'var(--color-charcoal-400)';
    if (s === TokenStatus.SKIPPED || s === TokenStatus.CANCELLED) return 'var(--color-terra-600)';
    return 'var(--color-charcoal-600)';
  };
  const statusLabel = (s: TokenStatus) => {
    if (s === TokenStatus.WAITING)   return 'Waiting';
    if (s === TokenStatus.CALLED)    return 'Called — Go Now';
    if (s === TokenStatus.COMPLETED) return 'Completed';
    if (s === TokenStatus.SKIPPED)   return 'Skipped';
    if (s === TokenStatus.CANCELLED) return 'Cancelled';
    return s;
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-cream-100)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '1.5rem 1rem 4rem',
      fontFamily: 'var(--font-sans)',
    }}>
      {/* Card shell — mimics a mobile app */}
      <div style={{
        width: '100%', maxWidth: 420,
        background: '#fff',
        borderRadius: '1.25rem',
        border: '1px solid var(--color-cream-200)',
        boxShadow: '0 4px 24px rgba(32,33,36,0.08)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 640,
      }}>

        {/* ── App-style header ───────────────────────────────────────────── */}
        <div style={{
          background: 'var(--color-forest-700)',
          padding: '1.1rem 1.25rem 1rem',
          color: '#fff',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
            <div>
              <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: '#fff' }}>
                {settings.hospitalInfo.name}
              </p>
              <p style={{ margin: 0, fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)', marginTop: '0.1rem' }}>
                Patient Live Tracker
              </p>
            </div>
            <button
              onClick={handleRefresh}
              title="Refresh"
              style={{
                width: 32, height: 32, borderRadius: '50%', border: 'none',
                background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <RefreshCw style={{ width: 14, height: 14 }} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Search bar */}
          <form onSubmit={handleSearch} style={{ position: 'relative' }}>
            <Search style={{
              position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)',
              width: 14, height: 14, color: 'rgba(255,255,255,0.35)', pointerEvents: 'none',
            }} />
            <input
              type="text"
              placeholder="Enter your token (e.g. GEN-002)"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '0.6rem',
                padding: '0.6rem 5.5rem 0.6rem 2.25rem',
                fontSize: '0.75rem', color: '#fff', outline: 'none',
                fontFamily: 'var(--font-sans)',
              }}
            />
            <button
              type="submit"
              style={{
                position: 'absolute', right: '0.3rem', top: '50%', transform: 'translateY(-50%)',
                padding: '0.3rem 0.7rem', fontSize: '0.65rem', fontWeight: 700,
                background: 'var(--color-sage-600)', border: 'none',
                borderRadius: '0.4rem', color: '#fff', cursor: 'pointer',
              }}
            >
              Track
            </button>
          </form>

          {errorMsg && (
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.65rem', color: 'var(--color-terra-200)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <AlertCircle style={{ width: 12, height: 12, flexShrink: 0 }} />
              {errorMsg}
            </p>
          )}
        </div>

        {/* ── Queue paused banner ────────────────────────────────────────── */}
        {settings.isPaused && (
          <div style={{
            background: 'var(--color-terra-50)', borderBottom: '1px solid var(--color-terra-200)',
            padding: '0.5rem 1rem', fontSize: '0.65rem', color: 'var(--color-terra-700)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontWeight: 500,
          }}>
            <AlertCircle style={{ width: 12, height: 12, flexShrink: 0 }} />
            Queue is currently on hold. Please bear with us.
          </div>
        )}

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, padding: '1.1rem 1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {selectedToken ? (
            <>
              {/* Token ticket */}
              <div style={{
                background: 'var(--color-cream-50)',
                border: '1px solid var(--color-cream-200)',
                borderRadius: '0.75rem',
                padding: '0.9rem 1rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{
                      display: 'inline-block', fontSize: '0.55rem', fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.07em',
                      padding: '0.15rem 0.5rem', borderRadius: '2rem',
                      background: 'var(--color-sage-100)', color: 'var(--color-sage-800)',
                    }}>
                      {selectedToken.departmentName}
                    </span>
                    <p style={{ margin: '0.35rem 0 0.1rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-charcoal-900)' }}>
                      {selectedToken.patientName}
                    </p>
                    <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--color-charcoal-400)' }}>
                      {selectedToken.doctorName}
                    </p>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: '0 0 0.1rem', fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-charcoal-300)' }}>
                      Your Token
                    </p>
                    <span className="text-token" style={{
                      fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.03em',
                      color: 'var(--color-forest-700)',
                    }}>
                      {selectedToken.tokenNumber}
                    </span>
                  </div>
                </div>

                <div style={{
                  marginTop: '0.75rem', paddingTop: '0.6rem',
                  borderTop: '1px solid var(--color-cream-200)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontSize: '0.62rem', color: 'var(--color-charcoal-400)',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Smartphone style={{ width: 11, height: 11 }} />
                    {selectedToken.patientMobile}
                  </span>
                  <span>Age {selectedToken.patientAge} · {selectedToken.patientGender}</span>
                </div>

                {/* Status badge */}
                <div style={{
                  marginTop: '0.6rem',
                  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                  padding: '0.25rem 0.6rem', borderRadius: '2rem', fontSize: '0.6rem', fontWeight: 700,
                  background: `${statusColor(selectedToken.status)}20`,
                  color: statusColor(selectedToken.status),
                  border: `1px solid ${statusColor(selectedToken.status)}40`,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: statusColor(selectedToken.status),
                    display: 'inline-block',
                  }} />
                  {statusLabel(selectedToken.status)}
                </div>
              </div>

              {/* Waiting stats row */}
              {selectedToken.status === TokenStatus.WAITING && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                  {[
                    { icon: <Users style={{ width: 12, height: 12 }} />, label: 'Ahead', value: String(stats?.ahead ?? 0), accent: 'var(--color-charcoal-900)' },
                    { icon: <Clock style={{ width: 12, height: 12 }} />, label: 'Est. Wait', value: `${stats?.time ?? 0} min`, accent: 'var(--color-sage-700)' },
                    { icon: <Clock style={{ width: 12, height: 12 }} />, label: 'Your Turn', value: stats?.expectedTurn || '—', accent: 'var(--color-forest-700)' },
                  ].map(card => (
                    <div key={card.label} style={{
                      background: 'var(--color-cream-50)',
                      border: '1px solid var(--color-cream-200)',
                      borderRadius: '0.6rem', padding: '0.6rem 0.5rem', textAlign: 'center',
                    }}>
                      <span style={{ fontSize: '0.5rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-charcoal-300)', display: 'block' }}>
                        {card.label}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.2rem', marginTop: '0.2rem', color: 'var(--color-charcoal-400)', fontSize: '0.6rem' }}>
                        {card.icon}
                      </span>
                      <span style={{ fontSize: '0.95rem', fontWeight: 800, color: card.accent, display: 'block', lineHeight: 1.1, marginTop: '0.15rem', fontVariantNumeric: 'tabular-nums' }}>
                        {card.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Status-specific banners ─────────────────────────────── */}
              {selectedToken.status === TokenStatus.CALLED && (
                <div style={{
                  background: 'var(--color-sage-50)',
                  border: '1px solid var(--color-sage-200)',
                  borderRadius: '0.75rem', padding: '1rem', textAlign: 'center',
                }}>
                  <CheckCircle style={{ width: 28, height: 28, color: 'var(--color-sage-600)', margin: '0 auto 0.4rem' }} />
                  <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-sage-900)' }}>
                    It's your turn!
                  </p>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.65rem', color: 'var(--color-sage-700)' }}>
                    Please proceed to <strong>{selectedToken.doctorName}'s</strong> consultation room now.
                  </p>
                </div>
              )}

              {selectedToken.status === TokenStatus.COMPLETED && (
                <div style={{
                  background: 'var(--color-cream-50)',
                  border: '1px solid var(--color-cream-200)',
                  borderRadius: '0.75rem', padding: '1rem', textAlign: 'center',
                }}>
                  <CheckCircle style={{ width: 28, height: 28, color: 'var(--color-charcoal-300)', margin: '0 auto 0.4rem' }} />
                  <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-charcoal-700)' }}>
                    Visit completed
                  </p>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.65rem', color: 'var(--color-charcoal-400)' }}>
                    Session with {selectedToken.doctorName} completed
                    {selectedToken.completedAt
                      ? ` at ${new Date(selectedToken.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : ''}
                    .
                  </p>
                </div>
              )}

              {(selectedToken.status === TokenStatus.SKIPPED || selectedToken.status === TokenStatus.CANCELLED) && (
                <div style={{
                  background: 'var(--color-terra-50)',
                  border: '1px solid var(--color-terra-200)',
                  borderRadius: '0.75rem', padding: '1rem', textAlign: 'center',
                }}>
                  <AlertCircle style={{ width: 28, height: 28, color: 'var(--color-terra-500)', margin: '0 auto 0.4rem' }} />
                  <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-terra-800)' }}>
                    Token {selectedToken.status === TokenStatus.SKIPPED ? 'skipped' : 'cancelled'}
                  </p>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.65rem', color: 'var(--color-terra-600)' }}>
                    Please visit the reception desk to recall or re-register your token.
                  </p>
                </div>
              )}

              {/* ── Progress bar (waiting only) ─────────────────────────── */}
              {selectedToken.status === TokenStatus.WAITING && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'var(--color-charcoal-400)', marginBottom: '0.35rem' }}>
                    <span>Now serving:</span>
                    <span style={{ fontWeight: 700, color: 'var(--color-charcoal-700)' }}>
                      {getActiveDeptToken(selectedToken.departmentId)}
                    </span>
                  </div>
                  <div style={{ height: 6, background: 'var(--color-cream-200)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${stats?.progress ?? 10}%`,
                      background: 'linear-gradient(90deg, var(--color-sage-500), var(--color-forest-600))',
                      borderRadius: 999, transition: 'width 0.6s ease',
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.55rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-charcoal-300)', marginTop: '0.3rem' }}>
                    <span>Arrived</span>
                    <span>Waiting</span>
                    <span>In-Consultation</span>
                  </div>
                </div>
              )}

              {/* ── Wayfinding ──────────────────────────────────────────── */}
              <div style={{
                background: 'var(--color-cream-50)', border: '1px solid var(--color-cream-200)',
                borderRadius: '0.6rem', padding: '0.65rem 0.75rem',
                display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
              }}>
                <MapPin style={{ width: 14, height: 14, color: 'var(--color-sage-600)', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ margin: 0, fontSize: '0.65rem', fontWeight: 600, color: 'var(--color-charcoal-800)' }}>Where to wait?</p>
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.6rem', color: 'var(--color-charcoal-400)' }}>
                    Please stay in the General Waiting Lounge and keep notifications on.
                  </p>
                </div>
              </div>

              {/* ── Receipt mockup ──────────────────────────────────────── */}
              <div style={{
                border: '1px dashed var(--color-cream-300)', borderRadius: '0.75rem',
                padding: '0.85rem 1rem', textAlign: 'center',
                background: 'var(--color-cream-50)',
              }}>
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-charcoal-300)' }}>
                  Reception Receipt
                </p>
                {/* Stylised QR mock */}
                <div style={{
                  width: 80, height: 80, margin: '0 auto',
                  background: '#fff', border: '1px solid var(--color-cream-200)',
                  borderRadius: '0.5rem', padding: '0.4rem',
                  display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 3,
                }}>
                  {[1,1,0,1,1, 1,0,1,0,1, 0,1,1,1,0, 1,0,0,1,1, 1,1,0,1,1].map((cell, i) => (
                    <div key={i} style={{
                      background: cell ? 'var(--color-charcoal-900)' : 'transparent',
                      borderRadius: 1,
                    }} />
                  ))}
                </div>
                <span style={{ display: 'inline-block', marginTop: '0.4rem', fontSize: '0.55rem', fontFamily: 'var(--font-mono)', color: 'var(--color-charcoal-300)' }}>
                  REF-{selectedToken.id.split('-')[1] ?? selectedToken.id.substring(0, 8)}
                </span>
              </div>
            </>
          ) : (
            /* Empty state */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem', gap: '0.75rem', textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--color-cream-200)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Smartphone style={{ width: 24, height: 24, color: 'var(--color-charcoal-300)' }} />
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-charcoal-700)' }}>No token loaded</p>
              <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--color-charcoal-300)', maxWidth: 240 }}>
                Search your token number above (e.g. GEN-001) to begin real-time tracking.
              </p>
            </div>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div style={{
          padding: '0.6rem 1rem',
          background: 'var(--color-cream-50)',
          borderTop: '1px solid var(--color-cream-200)',
          textAlign: 'center',
          fontSize: '0.55rem', color: 'var(--color-charcoal-300)', fontWeight: 500,
        }}>
          Powered by InclusyQ Smart Token Systems
        </div>
      </div>

      {onBackToApp && (
        <button
          onClick={onBackToApp}
          style={{
            marginTop: '1.25rem', padding: '0.55rem 1.1rem',
            fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer',
            background: '#fff', border: '1px solid var(--color-cream-300)',
            borderRadius: '0.5rem', color: 'var(--color-charcoal-500)',
            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
            boxShadow: '0 1px 4px rgba(32,33,36,0.06)',
          }}
        >
          Return to Hospital Workspace
          <ChevronRight style={{ width: 14, height: 14 }} />
        </button>
      )}
    </div>
  );
});
