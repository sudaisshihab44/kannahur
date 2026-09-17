import React, { useState, useEffect, useRef, useMemo, memo } from 'react';
import { Volume2, VolumeX, Maximize2, Minimize2, Bell, Tv } from 'lucide-react';
import { Token, TokenStatus, QueueSettings, Doctor } from '../types';
import { getPriorityWeight } from '../utils/priority';

interface TVDisplayProps {
  tokens: Token[];
  settings: QueueSettings;
  doctors?: Doctor[];
  onBackToApp?: () => void;
}

export default memo(function TVDisplay({ tokens, settings, doctors = [], onBackToApp }: TVDisplayProps) {
  const [isFullscreen, setIsFullscreen]   = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const containerRef   = useRef<HTMLDivElement>(null);
  const lastCalledIdRef = useRef<string | null>(null);

  // ── Derived arrays ────────────────────────────────────────────────────────
  const calledTokens = useMemo(() =>
    tokens
      .filter(t => t.status === TokenStatus.CALLED)
      .sort((a, b) => new Date(b.calledAt || '').getTime() - new Date(a.calledAt || '').getTime()),
    [tokens]);

  const currentActive = calledTokens[0] ?? null;
  const otherCalled   = calledTokens.slice(1, 4);

  const upNextTokens = useMemo(() =>
    tokens
      .filter(t => t.status === TokenStatus.WAITING)
      .sort((a, b) => {
        const diff = getPriorityWeight(b.priority) - getPriorityWeight(a.priority);
        return diff !== 0 ? diff : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      })
      .slice(0, 5),
    [tokens]);

  // ── Speech synthesis ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentActive || !isAudioEnabled || lastCalledIdRef.current === currentActive.id) return;
    lastCalledIdRef.current = currentActive.id;

    const timeout = setTimeout(() => {
      try {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const prefixSpelled = currentActive.tokenNumber.split('-')[0].split('').join(' ');
          const numberSpelled = currentActive.tokenNumber.split('-')[1];
          const text = `Attention please. Token number ${prefixSpelled} ${numberSpelled}, patient ${currentActive.patientName}, please proceed to ${currentActive.doctorName}'s consultation room.`;
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate  = 0.9;
          utterance.pitch = 1.0;
          const voices = window.speechSynthesis.getVoices();
          const englishVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google'));
          if (englishVoice) utterance.voice = englishVoice;
          window.speechSynthesis.speak(utterance);
        }
      } catch (err) {
        console.warn('Speech synthesis failed:', err);
      }
    }, 600);

    return () => clearTimeout(timeout);
  }, [currentActive, isAudioEnabled]);

  // ── Fullscreen ────────────────────────────────────────────────────────────
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => console.error(err));
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ── Live clock ────────────────────────────────────────────────────────────
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  useEffect(() => {
    const id = setInterval(() =>
      setClock(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })), 10000);
    return () => clearInterval(id);
  }, []);

  const totalWaiting = tokens.filter(t => t.status === TokenStatus.WAITING).length;

  return (
    <div
      ref={containerRef}
      style={{
        minHeight: '100vh',
        background: 'var(--color-forest-800)',
        color: '#fff',
        fontFamily: 'var(--font-sans)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle warm overlay texture */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 70% 50% at 80% 10%, rgba(201,130,107,0.08) 0%, transparent 60%), radial-gradient(ellipse 50% 60% at 10% 90%, rgba(111,143,122,0.10) 0%, transparent 60%)',
      }} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header style={{
        padding: '1rem 1.5rem',
        background: 'rgba(26,48,40,0.85)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 10,
        position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {settings.hospitalInfo.logoUrl ? (
            <img
              src={settings.hospitalInfo.logoUrl}
              alt="Logo"
              referrerPolicy="no-referrer"
              loading="lazy"
              decoding="async"
              width={48}
              height={48}
              style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: '0.5rem', background: '#fff', padding: '0.2rem' }}
            />
          ) : (
            <div style={{
              width: 44, height: 44, borderRadius: '0.5rem',
              background: 'var(--color-terra-500)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Tv style={{ width: 22, height: 22, color: '#fff' }} />
            </div>
          )}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>
                {settings.hospitalInfo.name}
              </h1>
              <span style={{
                fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
                padding: '0.15rem 0.5rem', borderRadius: '2rem',
                background: 'rgba(111,143,122,0.3)', color: 'var(--color-sage-200)',
                border: '1px solid rgba(111,143,122,0.35)',
              }}>Live Queue</span>
            </div>
            {settings.hospitalInfo.tagline && (
              <p style={{ margin: 0, fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', marginTop: '0.1rem' }}>
                {settings.hospitalInfo.tagline}
              </p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginRight: '0.25rem', fontVariantNumeric: 'tabular-nums' }}>
            {clock}
          </span>

          {onBackToApp && !isFullscreen && (
            <button
              onClick={onBackToApp}
              style={{
                padding: '0.4rem 0.9rem', fontSize: '0.7rem', fontWeight: 600,
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '0.4rem', color: 'rgba(255,255,255,0.7)', cursor: 'pointer',
              }}
            >
              Exit Display
            </button>
          )}

          <button
            onClick={() => setIsAudioEnabled(!isAudioEnabled)}
            title={isAudioEnabled ? 'Mute voice alerts' : 'Enable voice alerts'}
            style={{
              padding: '0.4rem', borderRadius: '0.4rem', cursor: 'pointer', border: '1px solid',
              background: isAudioEnabled ? 'rgba(111,143,122,0.2)' : 'rgba(255,255,255,0.06)',
              borderColor: isAudioEnabled ? 'rgba(111,143,122,0.4)' : 'rgba(255,255,255,0.1)',
              color: isAudioEnabled ? 'var(--color-sage-200)' : 'rgba(255,255,255,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {isAudioEnabled
              ? <Volume2 style={{ width: 16, height: 16 }} />
              : <VolumeX  style={{ width: 16, height: 16 }} />}
          </button>

          <button
            onClick={toggleFullscreen}
            title="Toggle fullscreen"
            style={{
              padding: '0.4rem', borderRadius: '0.4rem', cursor: 'pointer',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {isFullscreen
              ? <Minimize2 style={{ width: 16, height: 16 }} />
              : <Maximize2 style={{ width: 16, height: 16 }} />}
          </button>
        </div>
      </header>

      {/* ── Main board ─────────────────────────────────────────────────────── */}
      <main style={{
        flex: 1, padding: '1.25rem 1.5rem',
        display: 'grid',
        gridTemplateColumns: '3fr 2fr',
        gap: '1.25rem',
        zIndex: 10,
        position: 'relative',
      }}>

        {/* Left: Currently serving */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Hero card */}
          <div style={{
            flex: 1,
            background: 'rgba(26,48,40,0.6)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '1rem',
            padding: '1.75rem 2rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Accent bar */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 3,
              background: 'linear-gradient(90deg, var(--color-terra-500), var(--color-sage-400))',
              borderRadius: '1rem 1rem 0 0',
            }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Bell style={{ width: 16, height: 16, color: 'var(--color-terra-400)' }} />
                <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-terra-300)' }}>
                  Now Calling
                </span>
              </div>
              {currentActive && (
                <span style={{
                  fontSize: '0.6rem', fontWeight: 600,
                  padding: '0.2rem 0.6rem', borderRadius: '2rem',
                  background: 'rgba(201,130,107,0.15)',
                  border: '1px solid rgba(201,130,107,0.3)',
                  color: 'var(--color-terra-300)',
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                }}>
                  {currentActive.departmentName}
                </span>
              )}
            </div>

            {currentActive ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                {/* Big token number */}
                <div className="text-token" style={{
                  fontSize: 'clamp(5rem, 12vw, 9rem)',
                  fontWeight: 800,
                  color: '#fff',
                  letterSpacing: '-0.03em',
                  lineHeight: 1,
                  animation: 'iq-pulse 2s ease-in-out infinite',
                }}>
                  {currentActive.tokenNumber}
                </div>

                <div style={{ marginTop: '1rem' }}>
                  <p style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
                    {currentActive.doctorName}
                  </p>
                  {(() => {
                    const room = doctors.find(d => d.id === currentActive.doctorId)?.roomNumber;
                    return room ? (
                      <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Room {room}
                      </p>
                    ) : null;
                  })()}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                <Tv style={{ width: 48, height: 48, color: 'rgba(255,255,255,0.15)', margin: '0 auto 0.75rem' }} />
                <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'rgba(255,255,255,0.3)' }}>
                  No active call
                </p>
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)' }}>
                  Waiting for reception to call the next patient.
                </p>
              </div>
            )}

            {currentActive && (
              <div style={{
                paddingTop: '1rem',
                borderTop: '1px solid rgba(255,255,255,0.07)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)',
              }}>
                <span>Patient: <strong style={{ color: 'rgba(255,255,255,0.65)' }}>{currentActive.patientName}</strong></span>
                {currentActive.priority && currentActive.priority !== 'Normal' && (
                  <span style={{
                    padding: '0.15rem 0.5rem', borderRadius: '2rem', fontSize: '0.6rem',
                    fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
                    background: 'rgba(201,130,107,0.2)', border: '1px solid rgba(201,130,107,0.35)',
                    color: 'var(--color-terra-300)',
                  }}>
                    {currentActive.priority}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Secondary called tokens */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
            {otherCalled.length > 0 ? otherCalled.map(t => (
              <div key={t.id} style={{
                background: 'rgba(26,48,40,0.5)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '0.75rem',
                padding: '0.85rem 1rem',
              }}>
                <span style={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.3)', display: 'block' }}>
                  {t.departmentName}
                </span>
                <span className="text-token" style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-sage-300)', display: 'block', marginTop: '0.25rem', letterSpacing: '-0.02em' }}>
                  {t.tokenNumber}
                </span>
                <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'rgba(255,255,255,0.55)', display: 'block', marginTop: '0.25rem' }}>
                  {t.doctorName}
                </span>
              </div>
            )) : (
              <div style={{
                gridColumn: '1 / -1',
                padding: '0.75rem 1rem',
                textAlign: 'center',
                fontSize: '0.65rem',
                color: 'rgba(255,255,255,0.2)',
                border: '1px dashed rgba(255,255,255,0.07)',
                borderRadius: '0.75rem',
              }}>
                No other active rooms calling.
              </div>
            )}
          </div>
        </div>

        {/* Right: Up next list */}
        <div style={{
          background: 'rgba(26,48,40,0.6)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '1rem',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            paddingBottom: '0.75rem', marginBottom: '0.75rem',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
          }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)' }}>
              Up Next
            </span>
            <span style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--color-sage-300)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Waiting Queue
            </span>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {upNextTokens.length > 0 ? upNextTokens.map((t, index) => (
              <div key={t.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.65rem 0.75rem',
                borderRadius: '0.6rem',
                background: t.priority && t.priority !== 'Normal'
                  ? 'rgba(201,130,107,0.12)'
                  : 'rgba(255,255,255,0.04)',
                border: `1px solid ${t.priority && t.priority !== 'Normal'
                  ? 'rgba(201,130,107,0.25)'
                  : 'rgba(255,255,255,0.06)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ width: 18, fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                    {index + 1}
                  </span>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span className="text-token" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
                        {t.tokenNumber}
                      </span>
                      {t.priority && t.priority !== 'Normal' && (
                        <span style={{
                          fontSize: '0.5rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
                          padding: '0.1rem 0.35rem', borderRadius: '2rem',
                          background: 'rgba(201,130,107,0.25)', color: 'var(--color-terra-300)',
                        }}>
                          {t.priority}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', display: 'block' }}>
                      {t.doctorName}
                    </span>
                  </div>
                </div>
                <span style={{ fontSize: '0.6rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textAlign: 'right' }}>
                  {t.departmentName}
                </span>
              </div>
            )) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 0', gap: '0.5rem' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(111,143,122,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '1rem' }}>✓</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.3)' }}>Queue clear</p>
                <p style={{ margin: 0, fontSize: '0.6rem', color: 'rgba(255,255,255,0.2)', textAlign: 'center', maxWidth: 160 }}>
                  No patients waiting in the general queue.
                </p>
              </div>
            )}
          </div>

          {/* Summary strip */}
          <div style={{
            marginTop: '0.75rem', paddingTop: '0.75rem',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', textAlign: 'center',
          }}>
            <div>
              <span style={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.3)', display: 'block' }}>
                Total Waiting
              </span>
              <span className="text-token" style={{ fontSize: '1.75rem', fontWeight: 700, color: '#fff', display: 'block', marginTop: '0.1rem', lineHeight: 1 }}>
                {totalWaiting}
              </span>
            </div>
            <div>
              <span style={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.3)', display: 'block' }}>
                Serving Now
              </span>
              <span className="text-token" style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-sage-300)', display: 'block', marginTop: '0.1rem', lineHeight: 1 }}>
                {calledTokens.length}
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* ── Ticker ─────────────────────────────────────────────────────────── */}
      <footer style={{
        height: '2.75rem',
        background: 'rgba(13,30,23,0.9)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        zIndex: 10,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Label pill */}
        <div style={{
          padding: '0 1rem',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          background: 'rgba(201,130,107,0.15)',
          borderRight: '1px solid rgba(201,130,107,0.2)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-terra-300)' }}>
            Notice
          </span>
        </div>

        {/* Scrolling announcements */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <div
            className="animate-marquee"
            style={{
              display: 'inline-flex',
              whiteSpace: 'nowrap',
              gap: '3rem',
              fontSize: '0.7rem',
              fontWeight: 500,
              color: 'rgba(255,255,255,0.55)',
              letterSpacing: '0.01em',
            }}
          >
            {settings.announcements.map((ann, index) => (
              <span key={ann.id || index} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem' }}>
                {ann.text}
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--color-sage-400)', display: 'inline-block', flexShrink: 0 }} />
              </span>
            ))}
            {/* Duplicate for seamless loop */}
            {settings.announcements.map((ann, index) => (
              <span key={`dup-${ann.id || index}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem' }}>
                {ann.text}
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--color-sage-400)', display: 'inline-block', flexShrink: 0 }} />
              </span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
});
