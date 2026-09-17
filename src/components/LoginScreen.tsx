import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, ArrowLeft, AlertCircle, Stethoscope, ShieldCheck } from 'lucide-react';
import { ReceptionUser } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface LoginScreenProps {
  onLoginSuccess: (user: ReceptionUser) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  // Destructure `user` from context so we can read it synchronously
  // after authLogin() resolves — avoids the localStorage read-back race.
  const { login: authLogin, user: authUser } = useAuth();

  const [selectedPortal, setSelectedPortal] = useState<'none' | 'reception' | 'admin'>('none');
  const [username, setUsername]   = useState('');
  const [password, setPassword]   = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [isForgotOpen, setIsForgotOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('inclusyq_remembered_user');
    if (saved) { setUsername(saved); setRememberMe(true); }
  }, []);

  const handlePortalSelect = (portal: 'reception' | 'admin') => {
    setSelectedPortal(portal);
    setError('');
    if (!rememberMe) setUsername('');
    setPassword('');
  };

  const handleBack = () => {
    setSelectedPortal('none');
    setError('');
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) { setError('Please enter your username.'); return; }
    if (!password)        { setError('Please enter your password.'); return; }
    setLoading(true);
    setError('');
    try {
      await authLogin(username.trim(), password, selectedPortal);

      // authLogin() called storeToken() which wrote to localStorage.
      // Wrap JSON.parse so a corrupted storage value surfaces a clear message.
      let resolvedUser: ReceptionUser | null = null;
      const rawStored = localStorage.getItem('user');
      if (rawStored) {
        try {
          resolvedUser = JSON.parse(rawStored) as ReceptionUser;
        } catch {
          localStorage.removeItem('user');
          // Fall back to the context user set in memory by storeToken()
          resolvedUser = authUser as unknown as ReceptionUser | null;
        }
      } else {
        resolvedUser = authUser as unknown as ReceptionUser | null;
      }

      if (resolvedUser) {
        if (rememberMe) localStorage.setItem('inclusyq_remembered_user', username.trim());
        else localStorage.removeItem('inclusyq_remembered_user');
        onLoginSuccess(resolvedUser);
      } else {
        throw new Error('Login succeeded but user data was not returned. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#F7F4EE' }}>

      {/* ── Left branding panel ─────────────────────────────────────────── */}
      <div
        className="hidden lg:flex flex-col justify-between w-80 xl:w-96 flex-shrink-0 p-10 xl:p-12"
        style={{ background: '#29443A', color: '#FFFFFF' }}
      >
        {/* Logo */}
        <div>
          <div className="flex items-center gap-3 mb-8">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.16)' }}
            >
              <Stethoscope size={18} style={{ color: '#ADC5BA' }} />
            </div>
            <div>
              <span className="font-semibold text-lg tracking-tight" style={{ color: '#FFFFFF' }}>InclusyQ</span>
              <span className="block" style={{ fontSize: '0.625rem', color: '#ADC5BA', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>Hospital Queue System</span>
            </div>
          </div>

          <h1 className="font-semibold leading-snug mb-4" style={{ fontSize: '1.5rem', color: '#FFFFFF' }}>
            Streamlined care,<br />
            <span style={{ color: '#ADC5BA' }}>every patient.</span>
          </h1>

          <p style={{ fontSize: '0.875rem', color: 'rgba(173,197,186,0.8)', lineHeight: 1.7 }}>
            A calm, efficient queue management platform built for busy hospital departments.
          </p>
        </div>

        {/* Feature list */}
        <div className="space-y-5">
          {[
            { label: 'Token generation', sub: 'Atomic, concurrency-safe numbering' },
            { label: 'Live queue board', sub: 'TV display with voice announcements' },
            { label: 'Priority routing', sub: 'VIP, emergency, and disability queues' },
            { label: 'Role-based access', sub: 'Admin, reception, and patient views' },
          ].map(f => (
            <div key={f.label} className="flex items-start gap-3">
              <div
                className="mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(111,143,122,0.3)' }}
              >
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#ADC5BA' }} />
              </div>
              <div>
                <div style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#FFFFFF' }}>{f.label}</div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(173,197,186,0.7)' }}>{f.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ fontSize: '0.6875rem', color: 'rgba(173,197,186,0.5)' }} className="flex items-center gap-1.5">
          <ShieldCheck size={13} style={{ color: '#ADC5BA' }} />
          <span>Secure · HIPAA-ready · End-to-end encrypted</span>
        </div>
      </div>

      {/* ── Right login panel ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 lg:p-12">

        {/* Mobile logo */}
        <div className="flex lg:hidden items-center gap-2 mb-8 self-start">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#29443A' }}>
            <Stethoscope size={16} color="#ADC5BA" />
          </div>
          <span className="font-semibold" style={{ color: '#202124' }}>InclusyQ</span>
        </div>

        <div className="w-full max-w-sm">

          {/* ── Stage 1: portal selection ─────────────────────────────── */}
          {selectedPortal === 'none' && (
            <div className="animate-fade-in">
              <h2 className="font-semibold mb-1" style={{ fontSize: '1.375rem', color: '#202124', letterSpacing: '-0.01em' }}>
                Sign in
              </h2>
              <p style={{ fontSize: '0.875rem', color: '#6B6E73', marginBottom: '28px' }}>
                Select your portal to continue.
              </p>

              <div className="space-y-3">
                {/* Reception portal */}
                <button
                  type="button"
                  onClick={() => handlePortalSelect('reception')}
                  className="w-full text-left group"
                  style={{
                    padding: '16px 18px',
                    background: '#FFFFFF',
                    border: '1px solid #E7E5E4',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    transition: 'border-color 120ms ease, box-shadow 120ms ease',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = '#ADC5BA';
                    (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 12px rgba(111,143,122,0.12)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = '#E7E5E4';
                    (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                  }}
                  id="btn-portal-reception"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#202124', marginBottom: '3px' }}>
                        Reception
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: '#8C8F95' }}>
                        Register patients, generate tokens, manage queue
                      </div>
                    </div>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ADC5BA', flexShrink: 0 }} />
                  </div>
                </button>

                {/* Admin portal */}
                <button
                  type="button"
                  onClick={() => handlePortalSelect('admin')}
                  className="w-full text-left group"
                  style={{
                    padding: '16px 18px',
                    background: '#FFFFFF',
                    border: '1px solid #E7E5E4',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    transition: 'border-color 120ms ease, box-shadow 120ms ease',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = '#ADC5BA';
                    (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 12px rgba(111,143,122,0.12)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = '#E7E5E4';
                    (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                  }}
                  id="btn-portal-admin"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#202124', marginBottom: '3px' }}>
                        Administrator
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: '#8C8F95' }}>
                        Departments, doctors, staff, settings, analytics
                      </div>
                    </div>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#C9826B', flexShrink: 0 }} />
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* ── Stage 2: login form ────────────────────────────────────── */}
          {selectedPortal !== 'none' && (
            <div className="animate-fade-in">
              {/* Back */}
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-1.5 mb-6"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8C8F95', fontSize: '0.8125rem', padding: 0 }}
                id="btn-back-to-portals"
              >
                <ArrowLeft size={14} />
                <span>Back</span>
              </button>

              <h2 className="font-semibold mb-1" style={{ fontSize: '1.375rem', color: '#202124', letterSpacing: '-0.01em' }}>
                {selectedPortal === 'reception' ? 'Reception login' : 'Administrator login'}
              </h2>
              <p style={{ fontSize: '0.875rem', color: '#6B6E73', marginBottom: '24px' }}>
                Enter your credentials to continue.
              </p>

              {/* Error */}
              {error && (
                <div
                  className="flex items-start gap-2.5 mb-5"
                  style={{ background: '#FCF4F2', border: '1px solid #E8B9A8', borderRadius: '8px', padding: '10px 14px' }}
                  id="login-error-display"
                >
                  <AlertCircle size={15} style={{ color: '#B5603A', flexShrink: 0, marginTop: '1px' }} />
                  <span style={{ fontSize: '0.8125rem', color: '#7A3620', fontWeight: 500, lineHeight: 1.5 }}>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Username */}
                <div>
                  <label className="field-label" htmlFor="username">Username</label>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Enter username"
                    autoComplete="username"
                    className="input"
                    required
                  />
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-[5px]">
                    <label className="field-label" htmlFor="password" style={{ marginBottom: 0 }}>Password</label>
                    <button
                      type="button"
                      onClick={() => setIsForgotOpen(true)}
                      style={{ fontSize: '0.75rem', color: '#6F8F7A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter password"
                      autoComplete="current-password"
                      className="input"
                      style={{ paddingRight: '40px' }}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#AAACB0', padding: 0 }}
                      id="btn-toggle-password-visibility"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Remember me */}
                <label className="flex items-center gap-2.5 cursor-pointer" style={{ userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    id="chk-remember-me"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    style={{ width: '15px', height: '15px', accentColor: '#6F8F7A', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.8125rem', color: '#54575C' }}>Remember username</span>
                </label>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  id="btn-login-submit"
                  className="btn btn-primary w-full btn-lg"
                  style={{ marginTop: '8px' }}
                >
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Bottom meta */}
        <p style={{ marginTop: '48px', fontSize: '0.75rem', color: '#AAACB0', textAlign: 'center' }}>
          InclusyQ &nbsp;·&nbsp; Hospital Queue Management &nbsp;·&nbsp; v2.0
        </p>
      </div>

      {/* ── Forgot password modal ─────────────────────────────────────────── */}
      {isForgotOpen && (
        <div className="modal-overlay" onClick={() => setIsForgotOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-2" style={{ fontSize: '1rem', color: '#202124' }}>Password recovery</h3>
            <p style={{ fontSize: '0.875rem', color: '#54575C', lineHeight: 1.6, marginBottom: '20px' }}>
              To reset your password, please contact your Hospital IT Administrator or Department Head. They can reset credentials through the Admin panel.
            </p>
            <button
              onClick={() => setIsForgotOpen(false)}
              id="btn-forgot-password-close"
              className="btn btn-ghost btn-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
