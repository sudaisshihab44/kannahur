import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, User, Lock, ArrowRight, ArrowLeft, 
  HeartPulse, Sparkles, Eye, EyeOff, Building,
  ChevronRight, Info, CheckCircle2, ServerCrash
} from 'lucide-react';
import { ReceptionUser } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface LoginScreenProps {
  onLoginSuccess: (user: ReceptionUser) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  // Get auth context for JWT authentication
  const { login: authLogin } = useAuth();
  
  // Navigation / Portal Selection State
  const [selectedPortal, setSelectedPortal] = useState<'none' | 'reception' | 'admin'>('none');
  
  // Form input states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  
  // Feedback states
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Custom dialogs/notices
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);

  // Load remembered username on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('inclusyq_remembered_user');
    if (savedUser) {
      setUsername(savedUser);
      setRememberMe(true);
    }
  }, []);

  const handlePortalSelect = (portal: 'reception' | 'admin') => {
    setSelectedPortal(portal);
    setError('');
    // Do not clear username if remembered
    if (!rememberMe) {
      setUsername('');
    }
    setPassword('');
  };

  const handleBackToPortals = () => {
    setSelectedPortal('none');
    setError('');
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please enter your authorized username.');
      return;
    }
    if (!password) {
      setError('Please enter your secure access key.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Use new JWT authentication
      await authLogin(username.trim(), password, selectedPortal);
      
      // If login successful, get user data from localStorage (set by AuthContext)
      const userData = localStorage.getItem('user');
      if (userData) {
        const user = JSON.parse(userData);
        
        // Handle remember me
        if (rememberMe) {
          localStorage.setItem('inclusyq_remembered_user', username.trim());
        } else {
          localStorage.removeItem('inclusyq_remembered_user');
        }
        
        onLoginSuccess(user);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen h-screen w-full flex overflow-hidden font-sans">
      {/* Left Panel: Full-height dark branding sidebar */}
      <div className="hidden lg:flex w-[42%] xl:w-[38%] bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] flex-col justify-between relative text-white overflow-hidden p-10 xl:p-12 shrink-0">
        {/* Ambient glow blobs */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-500/10 rounded-full filter blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-teal-500/10 rounded-full filter blur-3xl pointer-events-none"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none"></div>

          {/* Logo & Corporate Tagline */}
          <div className="space-y-1.5 z-10 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/20 text-white flex items-center justify-center border border-white/10">
                <HeartPulse className="h-5.5 w-5.5" />
              </div>
              <span className="text-2xl font-bold tracking-tight text-white font-sans">
                Inclusy<span className="text-blue-400 font-extrabold">Q</span>
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold font-mono">
                Enterprise Clinical Workflow Suite
              </p>
            </div>
          </div>

          {/* Title & Subtitle */}
          <div className="space-y-2 z-10 mt-5 shrink-0">
            <h2 className="text-lg lg:text-xl font-extrabold tracking-tight text-white leading-tight">
              Hospital Queue & Token Management System
            </h2>
            <p className="text-[11px] text-slate-300 font-medium leading-relaxed">
              A secure platform to manage patient queues, reduce waiting time, and improve the outpatient experience.
            </p>
          </div>

          {/* Abstract Medical Graphics / Feature Bento Grid */}
          <div className="grid grid-cols-2 gap-3.5 z-10 my-auto py-4">
            <div className="bg-white/[0.04] hover:bg-white/[0.08] backdrop-blur-md border border-white/5 rounded-2xl p-3 transition-colors flex flex-col justify-between h-24">
              <div>
                <span className="text-sm block mb-1">📋</span>
                <h4 className="text-[11px] font-bold text-white tracking-tight">Smart Token Generation</h4>
              </div>
              <p className="text-[9px] text-slate-400 font-medium leading-normal">Generate digital tokens instantly for every patient.</p>
            </div>

            <div className="bg-white/[0.04] hover:bg-white/[0.08] backdrop-blur-md border border-white/5 rounded-2xl p-3 transition-colors flex flex-col justify-between h-24">
              <div>
                <span className="text-sm block mb-1">⏱</span>
                <h4 className="text-[11px] font-bold text-white tracking-tight">Live Queue Tracking</h4>
              </div>
              <p className="text-[9px] text-slate-400 font-medium leading-normal">Track patient queues and estimated waiting times in real time.</p>
            </div>

            <div className="bg-white/[0.04] hover:bg-white/[0.08] backdrop-blur-md border border-white/5 rounded-2xl p-3 transition-colors flex flex-col justify-between h-24">
              <div>
                <span className="text-sm block mb-1">📱</span>
                <h4 className="text-[11px] font-bold text-white tracking-tight">WhatsApp Notifications</h4>
              </div>
              <p className="text-[9px] text-slate-400 font-medium leading-normal">Automatically notify patients about their queue status and estimated turn.</p>
            </div>

            <div className="bg-white/[0.04] hover:bg-white/[0.08] backdrop-blur-md border border-white/5 rounded-2xl p-3 transition-colors flex flex-col justify-between h-24">
              <div>
                <span className="text-sm block mb-1">🏥</span>
                <h4 className="text-[11px] font-bold text-white tracking-tight">Multi-Department Support</h4>
              </div>
              <p className="text-[9px] text-slate-400 font-medium leading-normal">Manage queues independently for each hospital department.</p>
            </div>

            <div className="bg-white/[0.04] hover:bg-white/[0.08] backdrop-blur-md border border-white/5 rounded-2xl p-3 transition-colors flex flex-col justify-between h-24">
              <div>
                <span className="text-sm block mb-1">🔒</span>
                <h4 className="text-[11px] font-bold text-white tracking-tight">Secure Role-Based Access</h4>
              </div>
              <p className="text-[9px] text-slate-400 font-medium leading-normal">Separate Administrator and Reception access with controlled permissions.</p>
            </div>

            <div className="bg-white/[0.04] hover:bg-white/[0.08] backdrop-blur-md border border-white/5 rounded-2xl p-3 transition-colors flex flex-col justify-between h-24">
              <div>
                <span className="text-sm block mb-1">📊</span>
                <h4 className="text-[11px] font-bold text-white tracking-tight">Real-Time Dashboard</h4>
              </div>
              <p className="text-[9px] text-slate-400 font-medium leading-normal">Monitor today's tokens, waiting patients, and queue performance.</p>
            </div>
          </div>

        {/* Left Panel Footer */}
        <div className="text-[10px] text-slate-400 font-semibold z-10 flex justify-between border-t border-white/5 pt-4 shrink-0">
          <span className="flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>ISO 27001 Secured</span>
          </span>
          <span>v2.4.0 (Enterprise)</span>
        </div>
      </div>

      {/* Right Panel: Portal selection — fills remaining space */}
      <div className="flex-1 flex flex-col bg-[#f8fafc] relative overflow-y-auto">  
        {/* Light grid overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:3rem_3rem] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_60%,transparent_100%)] opacity-30 pointer-events-none"></div>
        <div className="absolute top-0 right-0 w-[60vw] h-[60vh] bg-blue-50/60 rounded-full filter blur-[120px] pointer-events-none"></div>

        {/* Mobile header — only shown when left panel is hidden */}
        <div className="flex lg:hidden items-center justify-between p-5 border-b border-slate-200 bg-white shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-600 rounded-xl shadow-md text-white flex items-center justify-center">
              <HeartPulse className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-900">
              Inclusy<span className="text-blue-600 font-extrabold">Q</span>
            </span>
          </div>
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest bg-slate-100 px-2.5 py-1 rounded-md">
            Hospital SaaS
          </span>
        </div>

        {/* Centered content area */}
        <div className="flex-1 flex items-center justify-center p-8 xl:p-12 relative z-10">  
          <div className="w-full max-w-xl">
            
            {/* STAGE 1: Portal Selector (Two Professional Login Options) */}
            {selectedPortal === 'none' && (
              <div className="space-y-8 animate-fade-in" id="portal-selection-container">
                <div className="space-y-2.5">
                  <div className="hidden lg:inline-flex items-center gap-1.5 mb-1 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                    <Sparkles className="h-3 w-3 text-blue-600" />
                    <span>Secure Clinician Sign-In</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-sans leading-tight">
                    Welcome to InclusyQ
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 font-medium max-w-md leading-relaxed">
                    Select your designated hospital workspace portal to authenticate operations and manage queue status.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* OPTION 1: RECEPTION PORTAL */}
                  <button
                    type="button"
                    onClick={() => handlePortalSelect('reception')}
                    className="flex flex-col text-left p-6 bg-white hover:bg-slate-50/40 border border-slate-200 hover:border-blue-500 rounded-[24px] shadow-[0_2px_8px_rgba(15,23,42,0.01)] hover:shadow-[0_16px_36px_-10px_rgba(59,130,246,0.12)] transition-all cursor-pointer group hover:-translate-y-1 relative"
                    id="btn-portal-reception"
                  >
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl mb-5 group-hover:bg-blue-600 group-hover:text-white transition-all w-12 h-12 flex items-center justify-center shadow-sm">
                      <HeartPulse className="h-5.5 w-5.5" />
                    </div>
                    
                    <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                      Reception Portal
                    </h3>
                    
                    <p className="text-[11px] text-slate-500 mt-2 line-clamp-3 font-medium leading-relaxed flex-1">
                      Generate tokens, manage queues, register patients, call next patients, and review local patient waiting files.
                    </p>

                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-blue-600 w-full group-hover:text-blue-700">
                      <span>Access Reception</span>
                      <ChevronRight className="h-4 w-4 transform group-hover:translate-x-1 transition-transform" />
                    </div>
                  </button>

                  {/* OPTION 2: ADMINISTRATOR PORTAL */}
                  <button
                    type="button"
                    onClick={() => handlePortalSelect('admin')}
                    className="flex flex-col text-left p-6 bg-white hover:bg-slate-50/40 border border-slate-200 hover:border-indigo-500 rounded-[24px] shadow-[0_2px_8px_rgba(15,23,42,0.01)] hover:shadow-[0_16px_36px_-10px_rgba(79,70,229,0.12)] transition-all cursor-pointer group hover:-translate-y-1 relative"
                    id="btn-portal-admin"
                  >
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl mb-5 group-hover:bg-indigo-600 group-hover:text-white transition-all w-12 h-12 flex items-center justify-center shadow-sm">
                      <Building className="h-5.5 w-5.5" />
                    </div>
                    
                    <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                      Administrator Portal
                    </h3>
                    
                    <p className="text-[11px] text-slate-500 mt-2 line-clamp-3 font-medium leading-relaxed flex-1">
                      Manage departments, doctors, consultation rooms, reception staff, reports, queue settings and hospital configuration.
                    </p>

                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-indigo-600 w-full group-hover:text-indigo-700">
                      <span>Access Administrator</span>
                      <ChevronRight className="h-4 w-4 transform group-hover:translate-x-1 transition-transform" />
                    </div>
                  </button>
                </div>

                <div className="flex items-start gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-slate-500 text-[11px] leading-relaxed">
                  <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                  <span className="font-medium">
                    Authorization Notice: To synchronize TV boards or Patient mobile flow screens, launch this panel inside your authorized clinical active session.
                  </span>
                </div>
              </div>
            )}

            {/* STAGE 2: Portal Specific Login Form */}
            {selectedPortal !== 'none' && (
              <div className="space-y-6 animate-fade-in" id="portal-login-form-container">
                <button
                  type="button"
                  onClick={handleBackToPortals}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors group mb-2"
                  id="btn-back-to-portals"
                >
                  <ArrowLeft className="h-3.5 w-3.5 transform group-hover:-translate-x-0.5 transition-transform" />
                  <span>Back to Portal Selection</span>
                </button>

                <div>
                  <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight font-sans" id="login-header-title">
                    {selectedPortal === 'reception' ? 'Reception Login' : 'Administrator Login'}
                  </h1>
                  <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                    {selectedPortal === 'reception' 
                      ? 'Access patient registry and active token ticker controls.' 
                      : 'Access hospital master configurations, staff list, and audit reports.'}
                  </p>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3.5 rounded-2xl text-xs flex items-start gap-3 animate-shake shadow-sm" id="login-error-display">
                    <ServerCrash className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
                    <span className="font-semibold leading-relaxed">{error}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Username Field */}
                  <div className="space-y-1.5">
                    <label htmlFor="username" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Username / Email
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                        <User className="h-4.5 w-4.5" />
                      </div>
                      <input
                        id="username"
                        name="username"
                        type="text"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="block w-full pl-11 pr-4 py-3 bg-slate-50/50 border border-slate-200/80 hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-2xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 font-semibold focus:outline-none transition-all"
                        placeholder="Clinical credentials ID"
                      />
                    </div>
                  </div>

                  {/* Password Field */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label htmlFor="password" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Secure Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsForgotModalOpen(true)}
                        className="text-[11px] font-bold text-blue-600 hover:text-blue-700 focus:outline-none transition-colors"
                        id="btn-forgot-password-link"
                      >
                        Forgot Password?
                      </button>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                        <Lock className="h-4.5 w-4.5" />
                      </div>
                      <input
                        id="password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="block w-full pl-11 pr-12 py-3 bg-slate-50/50 border border-slate-200/80 hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-2xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 font-semibold focus:outline-none transition-all"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                        id="btn-toggle-password-visibility"
                      >
                        {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Remember Me Toggle */}
                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none group">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30 h-4 w-4 cursor-pointer"
                        id="chk-remember-me"
                      />
                      <span className="text-xs text-slate-600 font-bold group-hover:text-slate-900 transition-colors">
                        Remember my username
                      </span>
                    </label>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={loading}
                    className={`w-full flex justify-center items-center gap-2 py-3.5 px-4 rounded-2xl text-xs sm:text-sm font-bold text-white transition-all cursor-pointer shadow-md ${
                      selectedPortal === 'reception'
                        ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/10 hover:shadow-blue-600/20'
                        : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/10 hover:shadow-indigo-600/20'
                    } disabled:opacity-50`}
                    id="btn-login-submit"
                  >
                    {loading ? 'Authorizing Credentials...' : 'Sign In'}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="text-center mt-8 relative z-10 pb-6">
            <p className="text-[11px] text-slate-400 font-bold flex items-center justify-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span>InclusyQ Smart Token Hub • HIPAA Clinical Security Standards</span>
            </p>
          </div>
        </div>
      </div>

      {/* Forgot Password IT Modal */}
      {isForgotModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" id="forgot-password-modal-overlay">
          <div className="bg-white rounded-[24px] border border-slate-100 shadow-2xl max-w-sm w-full p-6 space-y-6 animate-fade-in text-slate-900 select-none">
            <div className="space-y-3.5">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 shadow-sm">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Credential Recovery</h3>
                <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1.5">
                  This workstation is integrated with active clinical directory standards. For HIPAA security compliance:
                </p>
                <div className="mt-3.5 p-3.5 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-600 leading-relaxed font-bold">
                  ⚠️ Please contact the Hospital IT Administrator or Medical Director desk to reset your login password or retrieve credentials.
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end">
              <button
                onClick={() => setIsForgotModalOpen(false)}
                className="px-4.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm shadow-blue-600/10"
                id="btn-forgot-password-close"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
