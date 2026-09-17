import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Clock, CheckCircle, AlertCircle, Users } from 'lucide-react';

export default function TrackToken() {
  const { tokenId } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  const fetchStatus = async () => {
    if (!tokenId) return;
    try {
      const res = await fetch(`/api/track/${tokenId}`);
      if (res.ok) {
        setData(await res.json());
        setError(false);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Scope the realtime subscription to only this specific token's row.
    // Without a filter, the subscription would fire on every token change
    // across all patients — leaking change events via the anon key since
    // no RLS policies are configured on the tokens table.
    const channel = supabase
      .channel(`token-${tokenId}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'tokens',
          filter: `id=eq.${tokenId}`,
        },
        fetchStatus
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tokenId]);

  // ── Shared page wrapper ───────────────────────────────────────────────────
  const Page = ({ children }: { children: React.ReactNode }) => (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-cream-100)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem 1rem',
      fontFamily: 'var(--font-sans)',
    }}>
      {children}
    </div>
  );

  if (loading) return (
    <Page>
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        border: '3px solid var(--color-cream-300)',
        borderTopColor: 'var(--color-sage-600)',
        animation: 'spin 0.8s linear infinite',
        marginBottom: '0.75rem',
      }} />
      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-charcoal-400)' }}>
        Loading your queue status…
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Page>
  );

  if (error || !data?.myToken) return (
    <Page>
      <div style={{
        maxWidth: 360, width: '100%',
        background: '#fff',
        border: '1px solid var(--color-cream-200)',
        borderRadius: '1rem',
        padding: '2rem 1.5rem',
        textAlign: 'center',
        boxShadow: '0 4px 20px rgba(32,33,36,0.07)',
      }}>
        <AlertCircle style={{ width: 36, height: 36, color: 'var(--color-terra-500)', margin: '0 auto 0.75rem' }} />
        <p style={{ margin: '0 0 0.35rem', fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-charcoal-900)' }}>
          Token not found
        </p>
        <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--color-charcoal-400)' }}>
          We couldn't load queue status for this token. Please check your receipt or visit the reception desk.
        </p>
      </div>
    </Page>
  );

  const { myToken, currentServing, aheadCount } = data;
  const progress = Math.max(5, 100 - (aheadCount ?? 0) * 20);
  const estimatedWait = myToken.estimated_wait_time ?? 0;
  const expectedTime  = new Date(Date.now() + estimatedWait * 60000)
    .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const isCalled    = myToken.status === 'called';
  const isCompleted = myToken.status === 'completed';
  const isSkipped   = myToken.status === 'skipped';
  const isCancelled = myToken.status === 'cancelled';

  return (
    <Page>
      <div style={{
        maxWidth: 400, width: '100%',
        background: '#fff',
        border: '1px solid var(--color-cream-200)',
        borderRadius: '1.25rem',
        overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(32,33,36,0.09)',
      }}>

        {/* Header */}
        <div style={{
          background: 'var(--color-forest-700)',
          padding: '1.25rem 1.5rem',
          textAlign: 'center',
        }}>
          <p style={{ margin: '0 0 0.2rem', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)' }}>
            {myToken.department_name} · Dr. {myToken.doctor_name}
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>Token</span>
            <span className="text-token" style={{
              fontSize: 'clamp(2.2rem, 8vw, 3rem)',
              fontWeight: 800,
              color: '#fff',
              letterSpacing: '-0.03em',
              lineHeight: 1,
            }}>
              {myToken.token_number}
            </span>
          </div>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
            {myToken.patient_name}
          </p>
        </div>

        <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* ── Called — go now ─────────────────────────────────────────── */}
          {isCalled && (
            <div style={{
              background: 'var(--color-sage-50)',
              border: '1px solid var(--color-sage-200)',
              borderRadius: '0.75rem', padding: '1.25rem', textAlign: 'center',
            }}>
              <CheckCircle style={{ width: 36, height: 36, color: 'var(--color-sage-600)', margin: '0 auto 0.5rem' }} />
              <p style={{ margin: '0 0 0.3rem', fontSize: '1rem', fontWeight: 800, color: 'var(--color-sage-900)' }}>
                It's your turn!
              </p>
              <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--color-sage-700)' }}>
                Please proceed to the consultation room immediately.
              </p>
            </div>
          )}

          {/* ── Completed ───────────────────────────────────────────────── */}
          {isCompleted && (
            <div style={{
              background: 'var(--color-cream-50)',
              border: '1px solid var(--color-cream-200)',
              borderRadius: '0.75rem', padding: '1.25rem', textAlign: 'center',
            }}>
              <CheckCircle style={{ width: 32, height: 32, color: 'var(--color-charcoal-300)', margin: '0 auto 0.4rem' }} />
              <p style={{ margin: '0 0 0.25rem', fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-charcoal-700)' }}>Visit completed</p>
              <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--color-charcoal-400)' }}>Thank you for visiting. We hope you feel better soon.</p>
            </div>
          )}

          {/* ── Skipped / Cancelled ─────────────────────────────────────── */}
          {(isSkipped || isCancelled) && (
            <div style={{
              background: 'var(--color-terra-50)',
              border: '1px solid var(--color-terra-200)',
              borderRadius: '0.75rem', padding: '1.25rem', textAlign: 'center',
            }}>
              <AlertCircle style={{ width: 32, height: 32, color: 'var(--color-terra-500)', margin: '0 auto 0.4rem' }} />
              <p style={{ margin: '0 0 0.25rem', fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-terra-800)' }}>
                Token {isSkipped ? 'skipped' : 'cancelled'}
              </p>
              <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--color-terra-600)' }}>
                Please visit the reception desk to re-register or recall your token.
              </p>
            </div>
          )}

          {/* ── Waiting state ────────────────────────────────────────────── */}
          {!isCalled && !isCompleted && !isSkipped && !isCancelled && (
            <>
              {/* Now serving */}
              <div style={{
                background: 'var(--color-cream-50)',
                border: '1px solid var(--color-cream-200)',
                borderRadius: '0.75rem', padding: '0.85rem 1rem',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-charcoal-300)' }}>
                    Now Serving
                  </p>
                  <span className="text-token" style={{
                    fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.03em',
                    color: 'var(--color-forest-700)', lineHeight: 1, display: 'block', marginTop: '0.1rem',
                  }}>
                    {currentServing?.token_number ?? '—'}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-charcoal-300)' }}>
                    Ahead of You
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'flex-end', marginTop: '0.1rem' }}>
                    <Users style={{ width: 14, height: 14, color: 'var(--color-charcoal-400)' }} />
                    <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-charcoal-800)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                      {aheadCount ?? 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div>
                <div style={{ height: 8, background: 'var(--color-cream-200)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${progress}%`,
                    background: 'linear-gradient(90deg, var(--color-sage-500), var(--color-forest-600))',
                    borderRadius: 999,
                    transition: 'width 0.7s ease',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem', fontSize: '0.55rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-charcoal-300)' }}>
                  <span>Registered</span>
                  <span>Waiting</span>
                  <span>Your Turn</span>
                </div>
              </div>

              {/* Wait info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                <div style={{
                  background: 'var(--color-cream-50)', border: '1px solid var(--color-cream-200)',
                  borderRadius: '0.6rem', padding: '0.75rem', textAlign: 'center',
                }}>
                  <Clock style={{ width: 16, height: 16, color: 'var(--color-sage-500)', margin: '0 auto 0.25rem' }} />
                  <p style={{ margin: 0, fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-charcoal-300)' }}>Est. Wait</p>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-sage-800)', fontVariantNumeric: 'tabular-nums' }}>
                    ~{estimatedWait} min
                  </p>
                </div>
                <div style={{
                  background: 'var(--color-cream-50)', border: '1px solid var(--color-cream-200)',
                  borderRadius: '0.6rem', padding: '0.75rem', textAlign: 'center',
                }}>
                  <Clock style={{ width: 16, height: 16, color: 'var(--color-terra-400)', margin: '0 auto 0.25rem' }} />
                  <p style={{ margin: 0, fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-charcoal-300)' }}>Expected At</p>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-charcoal-800)', fontVariantNumeric: 'tabular-nums' }}>
                    {expectedTime}
                  </p>
                </div>
              </div>

              {/* Alert when almost time */}
              {(aheadCount ?? 0) <= 2 && (aheadCount ?? 0) >= 0 && (
                <div style={{
                  background: 'var(--color-terra-50)',
                  border: '1px solid var(--color-terra-200)',
                  borderRadius: '0.6rem', padding: '0.7rem 0.9rem',
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                }}>
                  <AlertCircle style={{ width: 16, height: 16, color: 'var(--color-terra-500)', flexShrink: 0 }} />
                  <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-terra-700)' }}>
                    Almost your turn — please be near the waiting area!
                  </p>
                </div>
              )}
            </>
          )}

        </div>

        {/* Footer */}
        <div style={{
          padding: '0.6rem 1rem',
          background: 'var(--color-cream-50)',
          borderTop: '1px solid var(--color-cream-200)',
          textAlign: 'center',
          fontSize: '0.55rem', color: 'var(--color-charcoal-300)', fontWeight: 500,
        }}>
          Live updates via InclusyQ · Refreshes automatically
        </div>
      </div>
    </Page>
  );
}
