import React, { useState, useEffect, lazy, Suspense } from 'react';
import { 
  HeartPulse, ShieldAlert, MonitorPlay, Smartphone, LogOut, 
  RefreshCw, CheckCircle, Database, HelpCircle, ArrowRight, Sparkles, Search,
  Building, Users, Stethoscope, Sliders, Settings, DoorOpen, Activity, FileText, BarChart2
} from 'lucide-react';

import { 
  Department, Doctor, Token, QueueSettings, Patient, ReceptionUser, UserRole, TrackingDevice 
} from './types';

import { Routes, Route } from 'react-router-dom';

// Lazy-loaded page-level components — each becomes its own JS chunk
const LoginScreen      = lazy(() => import('./components/LoginScreen'));
const ReceptionDashboard = lazy(() => import('./components/ReceptionDashboard'));
const AdminDashboard   = lazy(() => import('./components/AdminDashboard'));
const TVDisplay        = lazy(() => import('./components/TVDisplay'));
const PatientTracker   = lazy(() => import('./components/PatientTracker'));
const TrackToken       = lazy(() => import('./pages/TrackToken'));

// Shared loading fallback
function AppLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
        <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase">Loading...</span>
      </div>
    </div>
  );
}

export default function App() {
  // Navigation / View state
  const [activeView, setActiveView] = useState<'login' | 'reception' | 'admin' | 'tv' | 'tracking'>('login');
  const [currentUser, setCurrentUser] = useState<ReceptionUser | null>(null);
  const [adminTab, setAdminTab] = useState<'dashboard' | 'departments' | 'doctors' | 'rooms' | 'staff' | 'queue-settings' | 'reports' | 'audit-logs' | 'hospital-settings'>('dashboard');

  // Synchronized database states
  const [departments, setDepartments] = useState<Department[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [users, setUsers] = useState<ReceptionUser[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [settings, setSettings] = useState<QueueSettings | null>(null);
  const [devices, setDevices] = useState<TrackingDevice[]>([]);

  // Connection and live updates sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);

  // Custom sign out state
  const [isSignOutModalOpen, setIsSignOutModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Toast auto-clear
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Primary API syncing handler
  const refreshDatabaseState = async () => {
    setIsSyncing(true);
    setSyncError(false);
    try {
      const response = await fetch('/api/data');
      if (response.ok) {
        const data = await response.json();
        setDepartments(data.departments || []);
        setDoctors(data.doctors || []);
        setUsers(data.users || []);
        setPatients(data.patients || []);
        setTokens(data.tokens || []);
        setSettings(data.settings || null);
        setDevices(data.devices || []);
      } else {
        setSyncError(true);
      }
    } catch (err) {
      setSyncError(true);
    } finally {
      setIsSyncing(false);
    }
  };

  // Toggle Hold/Pause Queue settings
  const handleTogglePause = async () => {
    try {
      const response = await fetch('/api/settings/toggle-pause', { method: 'POST' });
      if (response.ok) {
        await refreshDatabaseState();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Initial Sync & Polling trigger for real-time synchronization across TVs/Dashboard frames
  useEffect(() => {
    refreshDatabaseState();

    // Standard client polling (every 3 seconds) which acts as a reliable fallback in nested preview iframes
    const interval = setInterval(() => {
      refreshDatabaseState();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // URL Route / Tracking link detection
  useEffect(() => {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    if (path.includes('/track/') || params.has('tracker')) {
      setActiveView('tracking');
    }
  }, []);

  // Live updates are handled entirely by the 3-second polling interval above.
  // SSE was removed because Vercel Serverless Functions do not support
  // long-lived persistent connections. Supabase Realtime is used by the
  // TrackToken page for per-token live tracking.

  // Login successful handler
  const handleLoginSuccess = (user: ReceptionUser) => {
    setCurrentUser(user);
    if (user.role === UserRole.ADMIN) {
      setActiveView('admin');
    } else {
      setActiveView('reception');
    }
  };

  const handleLogout = () => {
    setIsSignOutModalOpen(true);
  };

  const executeSignOut = () => {
    setIsSignOutModalOpen(false);
    setCurrentUser(null);
    localStorage.clear();
    sessionStorage.clear();
    setActiveView('login');
    setToastMessage("Signed out successfully.");
  };

  if (window.location.pathname.includes('/track/')) {
    return (
      <Suspense fallback={<AppLoader />}>
        <Routes>
          <Route path="/track/:tokenId" element={<TrackToken />} />
        </Routes>
      </Suspense>
    );
  }

  // Skip rendering standard headers if displaying fullscreen TV board or Patient mobile app
  if (activeView === 'tv' && settings) {
    return (
      <Suspense fallback={<AppLoader />}>
        <TVDisplay 
          tokens={tokens} 
          settings={settings} 
          doctors={doctors}
          onBackToApp={() => {
            if (currentUser) {
              setActiveView(currentUser.role === UserRole.ADMIN ? 'admin' : 'reception');
            } else {
              setActiveView('login');
            }
          }} 
        />
      </Suspense>
    );
  }

  if (activeView === 'tracking' && settings) {
    return (
      <Suspense fallback={<AppLoader />}>
        <PatientTracker 
          tokens={tokens} 
          settings={settings} 
          onBackToApp={() => {
            if (currentUser) {
              setActiveView(currentUser.role === UserRole.ADMIN ? 'admin' : 'reception');
            } else {
              setActiveView('login');
            }
          }}
        />
      </Suspense>
    );
  }

  if (activeView === 'login') {
    return (
      <Suspense fallback={<AppLoader />}>
        <LoginScreen onLoginSuccess={handleLoginSuccess} users={users} />
      </Suspense>
    );
  }


  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f8fafc] font-sans">
      {/* Sidebar Navigation */}
      {settings && (
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between p-6 shrink-0 select-none">
          <div className="space-y-8">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-sm">
                Q
              </div>
              <div>
                <span className="text-xl font-display font-bold text-slate-900 tracking-tight">
                  Inclusy<span className="text-blue-600 font-extrabold">Q</span>
                </span>
                <span className="text-[10px] text-slate-400 block -mt-1 font-medium">Smart Token Hub</span>
              </div>
            </div>

            {/* Navigation links */}
            <nav className="space-y-1">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">
                Workspaces
              </div>
              
              {currentUser?.role === UserRole.RECEPTIONIST && (
                <button
                  onClick={() => setActiveView('reception')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    activeView === 'reception' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                  id="workspace-reception"
                >
                  <HeartPulse className="h-4 w-4 shrink-0" />
                  Reception Panel
                </button>
              )}

              {currentUser?.role === UserRole.ADMIN && (
                <>
                  <button
                    onClick={() => setActiveView('reception')}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      activeView === 'reception' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                    id="workspace-reception"
                  >
                    <HeartPulse className="h-4 w-4 shrink-0" />
                    Reception Panel
                  </button>

                  <button
                    onClick={() => {
                      setActiveView('admin');
                      setAdminTab('dashboard');
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      activeView === 'admin' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                    id="workspace-admin"
                  >
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    Admin Center
                  </button>

                  {activeView === 'admin' && (
                    <div className="pl-3.5 pr-1 py-2 border-l border-slate-100 ml-5 space-y-1 my-1 animate-fade-in" id="admin-sub-menu">
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 px-1.5">
                        Administration
                      </div>
                      {[
                        { id: 'dashboard', label: 'Dashboard', icon: BarChart2 },
                        { id: 'departments', label: 'Departments', icon: Building },
                        { id: 'doctors', label: 'Doctors', icon: Stethoscope },
                        { id: 'rooms', label: 'Consultation Rooms', icon: DoorOpen },
                        { id: 'staff', label: 'Reception Staff', icon: Users },
                        { id: 'queue-settings', label: 'Queue Settings', icon: Sliders },
                        { id: 'reports', label: 'Reports', icon: Activity },
                        { id: 'audit-logs', label: 'Audit Logs', icon: FileText },
                        { id: 'hospital-settings', label: 'Hospital Settings', icon: Settings }
                      ].map(tab => {
                        const Icon = tab.icon;
                        const isSelected = adminTab === tab.id;
                        return (
                          <button
                            key={tab.id}
                            onClick={() => setAdminTab(tab.id as any)}
                            className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-[11px] font-bold rounded-lg transition-all text-left cursor-pointer ${
                              isSelected 
                                ? 'bg-blue-50 text-blue-600 font-extrabold' 
                                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50/50'
                            }`}
                            id={`sidebar-tab-${tab.id}`}
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            <span>{tab.label}</span>
                          </button>
                        );
                      })}
                      
                      {/* Divider & Sign Out for Admin Center */}
                      <div className="h-[1px] bg-slate-100 my-2 mx-1.5"></div>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 text-[11px] font-bold rounded-lg transition-all text-left text-slate-500 hover:text-red-600 hover:bg-red-50/50 cursor-pointer"
                        id="sidebar-tab-signout"
                      >
                        <LogOut className="h-3.5 w-3.5 shrink-0" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  )}
                </>
              )}

              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pt-4 mb-2 px-2">
                Broadcast & Client
              </div>

              <button
                onClick={() => setActiveView('tv')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all"
                id="link-tv-display"
              >
                <MonitorPlay className="h-4 w-4 text-blue-500 shrink-0" />
                TV Display Board
              </button>

              <button
                onClick={() => setActiveView('tracking')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all"
                id="link-patient-app"
              >
                <Smartphone className="h-4 w-4 text-teal-500 shrink-0" />
                Patient Mobile App
              </button>
            </nav>
          </div>

          {/* Footer of Sidebar */}
          <div className="space-y-4">
            <div className="pt-4 border-t border-slate-100 flex items-center gap-3">
              <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center text-slate-700 font-bold text-xs select-none uppercase">
                {currentUser?.name ? currentUser.name.slice(0, 2) : 'OP'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-800 truncate">{currentUser?.name}</p>
                <p className="text-[10px] text-slate-400 font-medium capitalize truncate">
                  {currentUser?.role} Operator
                </p>
              </div>
            </div>

            {currentUser?.role === UserRole.RECEPTIONIST && (
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl text-xs font-semibold transition-all"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                Sign Out
              </button>
            )}
          </div>
        </aside>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Bar */}
        {settings && (
          <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 select-none">
            {/* Search query placeholder */}
            <div className="relative">
              <input 
                type="text" 
                className="w-80 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-full pl-9 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all" 
                placeholder="Search token, patient name or phone..."
              />
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="h-3.5 w-3.5" />
              </div>
            </div>

            {/* Hospital & Sync state */}
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-xs font-bold text-slate-800">{settings.hospitalInfo.name}</div>
                <div className="text-[10px] text-slate-400 font-semibold">{settings.hospitalInfo.tagline}</div>
              </div>

              <div className="h-6 w-[1px] bg-slate-200"></div>

              {/* Database Sync status indicator */}
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${syncError ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`}></span>
                <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                  {syncError ? 'Offline' : 'Sync Live'}
                </span>
              </div>
            </div>
          </header>
        )}

        {/* Dynamic view workspace wrapper with customized scrolling */}
        <div className={`flex-1 overflow-y-auto ${activeView === 'admin' ? '' : 'p-8'}`}>
          <Suspense fallback={
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
            </div>
          }>
            {activeView === 'reception' && settings && (
              <ReceptionDashboard
                departments={departments}
                doctors={doctors}
                tokens={tokens}
                patients={patients}
                settings={settings}
                devices={devices}
                onRefreshData={refreshDatabaseState}
                onTogglePause={handleTogglePause}
                currentUser={currentUser}
              />
            )}

            {activeView === 'admin' && settings && (
              <AdminDashboard
                departments={departments}
                doctors={doctors}
                tokens={tokens}
                users={users}
                settings={settings}
                onRefreshData={refreshDatabaseState}
                activeTab={adminTab}
                setActiveTab={setAdminTab}
                currentUser={currentUser}
                onLogout={handleLogout}
              />
            )}
          </Suspense>
        </div>

        {/* Mini Footer */}
        {settings && (
          <footer className="h-10 bg-white border-t border-slate-200 flex items-center justify-between px-8 text-[10px] text-slate-400 font-semibold select-none shrink-0">
            <div className="flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-slate-400" />
              <span>Database state: <strong>HIPAA Secured (In-Memory File Sandbox)</strong></span>
            </div>

            <div className="text-[10px] text-slate-400 flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-yellow-500" />
              InclusyQ • Enterprise SaaS Platform
            </div>
          </footer>
        )}
      </div>

      {/* Custom Sign Out Confirmation Modal */}
      {isSignOutModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" id="signout-modal-overlay">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-sm w-full p-6 space-y-6 animate-fade-in select-none" id="signout-modal-content">
            <div className="space-y-3">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-600" id="signout-modal-icon-container">
                <LogOut className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 font-sans" id="signout-modal-title">Sign Out</h3>
                <p className="text-xs text-slate-500 font-medium leading-relaxed font-sans mt-1" id="signout-modal-message">
                  Are you sure you want to sign out of InclusyQ Admin?
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3" id="signout-modal-actions">
              <button
                onClick={() => setIsSignOutModalOpen(false)}
                className="px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all cursor-pointer"
                id="btn-signout-cancel"
              >
                Cancel
              </button>
              <button
                onClick={executeSignOut}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm shadow-red-600/10"
                id="btn-signout-confirm"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Success Toast */}
      {toastMessage && (
        <div 
          className="fixed bottom-12 right-12 z-[100] bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-xl flex items-center gap-3 animate-fade-in border border-slate-800" 
          id="toast-success-signout"
        >
          <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold font-sans">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
