import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import {
  LayoutGrid, Users, Stethoscope, Building, Sliders, Settings,
  DoorOpen, Activity, FileText, BarChart2, MonitorPlay, Smartphone,
  LogOut, AlertTriangle, RefreshCw,
} from 'lucide-react';

import {
  Department, Doctor, Token, QueueSettings, Patient, ReceptionUser, UserRole,
  TrackingDevice, ConsultationRoom, QueueLog,
} from './types';

import { Routes, Route } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { authFetchState, authFetch } from './utils/authFetch';

const LoginScreen        = lazy(() => import('./components/LoginScreen'));
const ReceptionDashboard = lazy(() => import('./components/ReceptionDashboard'));
const AdminDashboard     = lazy(() => import('./components/AdminDashboard'));
const TVDisplay          = lazy(() => import('./components/TVDisplay'));
const PatientTracker     = lazy(() => import('./components/PatientTracker'));
const TrackToken         = lazy(() => import('./pages/TrackToken'));

// ── Full-screen spinner — shown while auth state is initialising ──────────────
function AppLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F7F4EE' }}>
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: '#6F8F7A', borderTopColor: 'transparent' }}
        />
        <span style={{ fontSize: '0.75rem', color: '#AAACB0', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
          Verifying session…
        </span>
      </div>
    </div>
  );
}

// ── Dashboard skeleton — shown while authenticated but data still loading ─────
function DashboardSkeleton() {
  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="skeleton" style={{ height: '28px', width: '220px', borderRadius: '6px' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="skeleton" style={{ height: '88px', borderRadius: '10px' }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: '320px', borderRadius: '10px' }} />
    </div>
  );
}

type AdminTabId = 'dashboard' | 'departments' | 'doctors' | 'rooms' | 'staff' | 'queue-settings' | 'reports' | 'audit-logs' | 'hospital-settings';

const ADMIN_NAV: { id: AdminTabId; label: string; Icon: React.ElementType }[] = [
  { id: 'dashboard',         label: 'Dashboard',         Icon: LayoutGrid  },
  { id: 'departments',       label: 'Departments',       Icon: Building    },
  { id: 'doctors',           label: 'Doctors',           Icon: Stethoscope },
  { id: 'rooms',             label: 'Rooms',             Icon: DoorOpen    },
  { id: 'staff',             label: 'Staff',             Icon: Users       },
  { id: 'queue-settings',    label: 'Queue Settings',    Icon: Sliders     },
  { id: 'reports',           label: 'Reports',           Icon: Activity    },
  { id: 'audit-logs',        label: 'Audit Logs',        Icon: FileText    },
  { id: 'hospital-settings', label: 'Hospital Settings', Icon: Settings    },
];

export default function App() {
  // activeView drives which screen is shown. It starts as 'login' and is only
  // changed by: handleLoginSuccess, session-restore effect, or executeSignOut.
  // It is NEVER changed by loading=true, null, or network errors.
  const [activeView, setActiveView] = useState<'login' | 'reception' | 'admin' | 'tv' | 'tracking'>('login');
  const [currentUser, setCurrentUser] = useState<ReceptionUser | null>(null);
  const [adminTab, setAdminTab]       = useState<AdminTabId>('dashboard');

  const { accessToken, user: authUser, isLoading: authIsLoading } = useAuth();

  // ── Derived auth status ─────────────────────────────────────────────────────
  // 'loading'         → spinner, never login screen
  // 'authenticated'   → dashboard
  // 'unauthenticated' → login screen (only after confirmed no session)
  //
  // IMPORTANT: 'loading' is NEVER treated as 'unauthenticated'.
  const authStatus: 'loading' | 'authenticated' | 'unauthenticated' =
    authIsLoading
      ? 'loading'
      : accessToken && authUser
        ? 'authenticated'
        : 'unauthenticated';

  // ── Application data ────────────────────────────────────────────────────────
  const [departments, setDepartments] = useState<Department[]>([]);
  const [doctors, setDoctors]         = useState<Doctor[]>([]);
  const [users, setUsers]             = useState<ReceptionUser[]>([]);
  const [patients, setPatients]       = useState<Patient[]>([]);
  const [tokens, setTokens]           = useState<Token[]>([]);
  const [settings, setSettings]       = useState<QueueSettings | null>(null);
  const [devices, setDevices]         = useState<TrackingDevice[]>([]);
  const [rooms, setRooms]             = useState<ConsultationRoom[]>([]);
  const [queueLogs, setQueueLogs]     = useState<QueueLog[]>([]);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [syncError,          setSyncError]          = useState(false);
  const [sessionExpired,     setSessionExpired]     = useState(false);
  const [isSignOutModalOpen, setIsSignOutModalOpen] = useState(false);
  const [toastMessage,       setToastMessage]       = useState<string | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // ── Data fetch via authFetch ────────────────────────────────────────────────
  // Does NOT redirect to login on 401 — shows a reconnect banner instead.
  const refreshDatabaseState = useCallback(async () => {
    setSyncError(false);
    try {
      const response = await authFetch('/api/data');
      if (response.ok) {
        setSessionExpired(false);
        const data = await response.json();
        setDepartments(data.departments      || []);
        setDoctors(data.doctors              || []);
        setUsers(data.users                  || []);
        setPatients(data.patients            || []);
        setTokens(data.tokens                || []);
        setSettings(data.settings            || null);
        setDevices(data.devices              || []);
        setRooms(data.consultation_rooms     || []);
        setQueueLogs(data.queue_logs         || []);
      } else if (response.status === 401) {
        setSessionExpired(true);
      } else {
        setSyncError(true);
      }
    } catch {
      setSyncError(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTogglePause = useCallback(async () => {
    try {
      const response = await authFetch('/api/queue/pause', { method: 'POST' });
      if (response.ok) await refreshDatabaseState();
    } catch { /* ignore */ }
  }, [refreshDatabaseState]);

  // ── Data polling — gated on accessToken ────────────────────────────────────
  useEffect(() => {
    if (accessToken) refreshDatabaseState();
  }, [accessToken]); // eslint-disable-line

  useEffect(() => {
    if (!accessToken) return;
    const POLL_MS = 5000;
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!interval) interval = setInterval(refreshDatabaseState, POLL_MS); };
    const stop  = () => { if (interval) { clearInterval(interval); interval = null; } };
    const onVis = () => { if (document.hidden) stop(); else { refreshDatabaseState(); start(); } };
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [accessToken, refreshDatabaseState]);

  // ── Patient tracker URL detection ───────────────────────────────────────────
  useEffect(() => {
    const p = window.location.pathname;
    const q = new URLSearchParams(window.location.search);
    if (p.includes('/track/') || q.has('tracker')) setActiveView('tracking');
  }, []);

  // ── Session restore on page reload ─────────────────────────────────────────
  // Fires once AuthContext finishes its mount refresh. If a valid session was
  // restored but activeView is still 'login', transitions to the dashboard.
  useEffect(() => {
    if (authIsLoading) return;
    if (!accessToken || !authUser) return;
    if (activeView !== 'login') return;
    if (window.location.pathname.includes('/track/')) return;

    setCurrentUser(authUser as unknown as ReceptionUser);
    setActiveView(authUser.role === UserRole.ADMIN ? 'admin' : 'reception');
  }, [authIsLoading, accessToken, authUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoginSuccess = (user: ReceptionUser) => {
    setSessionExpired(false);
    setCurrentUser(user);
    setActiveView(user.role === UserRole.ADMIN ? 'admin' : 'reception');
    refreshDatabaseState();
  };

  const executeSignOut = () => {
    setIsSignOutModalOpen(false);
    setCurrentUser(null);
    setSessionExpired(false);
    localStorage.removeItem('user');
    localStorage.removeItem('accessToken');
    sessionStorage.clear();
    setActiveView('login');
    setToastMessage('Signed out successfully.');
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // RENDER GATE
  // ══════════════════════════════════════════════════════════════════════════════

  // 1. Auth initialising — spinner only, never login screen
  if (authStatus === 'loading') return <AppLoader />;

  // 2. Public patient route
  if (window.location.pathname.includes('/track/')) {
    return (
      <Suspense fallback={<AppLoader />}>
        <Routes><Route path="/track/:tokenId" element={<TrackToken />} /></Routes>
      </Suspense>
    );
  }

  // 3. TV display
  if (activeView === 'tv' && settings) {
    return (
      <Suspense fallback={<AppLoader />}>
        <TVDisplay tokens={tokens} settings={settings} doctors={doctors}
          onBackToApp={() => setActiveView(currentUser?.role === UserRole.ADMIN ? 'admin' : 'reception')} />
      </Suspense>
    );
  }

  // 4. Patient tracker
  if (activeView === 'tracking' && settings) {
    return (
      <Suspense fallback={<AppLoader />}>
        <PatientTracker tokens={tokens} settings={settings}
          onBackToApp={() => setActiveView(currentUser?.role === UserRole.ADMIN ? 'admin' : 'reception')} />
      </Suspense>
    );
  }

  // 5. Login — only when auth is CONFIRMED unauthenticated
  if (activeView === 'login' || authStatus === 'unauthenticated') {
    return (
      <Suspense fallback={<AppLoader />}>
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
      </Suspense>
    );
  }

  // 6. Authenticated dashboard shell
  const isAdmin      = currentUser?.role === UserRole.ADMIN;
  const hospitalName = settings?.hospitalInfo?.name ?? 'InclusyQ';

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: '#F7F4EE' }}>

      <aside className="sidebar flex-col justify-between h-full overflow-y-auto" style={{ paddingTop: 0, paddingBottom: 0 }}>
        <div>
          <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid #E7E5E4' }}>
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center rounded-lg flex-shrink-0"
                style={{ width: 32, height: 32, background: '#29443A' }}>
                <Stethoscope size={16} color="#ADC5BA" />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#202124', lineHeight: 1 }}>InclusyQ</div>
                <div style={{ fontSize: '0.625rem', color: '#AAACB0', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, marginTop: 2 }}>
                  {isAdmin ? 'Administrator' : 'Reception'}
                </div>
              </div>
            </div>
          </div>

          <div style={{ padding: '12px 12px 0' }}>
            <div className="sidebar-section-label">Workspace</div>
            <button className={`sidebar-nav-item ${activeView === 'reception' ? 'active' : ''}`}
              onClick={() => setActiveView('reception')} id="workspace-reception">
              <LayoutGrid size={15} /><span>Reception Queue</span>
            </button>

            {isAdmin && (
              <>
                <div className="sidebar-section-label" style={{ marginTop: 12 }}>Administration</div>
                {ADMIN_NAV.map(({ id, label, Icon }) => (
                  <button key={id}
                    className={`sidebar-nav-item ${activeView === 'admin' && adminTab === id ? 'active' : ''}`}
                    onClick={() => { setActiveView('admin'); setAdminTab(id); }}
                    id={`sidebar-tab-${id}`}>
                    <Icon size={14} /><span>{label}</span>
                  </button>
                ))}
              </>
            )}

            <div className="sidebar-section-label" style={{ marginTop: 12 }}>Displays</div>
            <button className="sidebar-nav-item" onClick={() => setActiveView('tv')} id="link-tv-display">
              <MonitorPlay size={14} /><span>TV Queue Board</span>
            </button>
            <button className="sidebar-nav-item" onClick={() => setActiveView('tracking')} id="link-patient-app">
              <Smartphone size={14} /><span>Patient Tracker</span>
            </button>
          </div>
        </div>

        <div style={{ padding: 12, borderTop: '1px solid #E7E5E4' }}>
          <div className="flex items-center gap-2.5 mb-2" style={{ padding: '8px 10px' }}>
            <div className="flex items-center justify-center rounded-full flex-shrink-0 font-semibold"
              style={{ width: 28, height: 28, background: '#E5F0EC', color: '#29443A', fontSize: '0.6875rem' }}>
              {(currentUser?.name ?? 'U').slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#202124', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentUser?.name ?? 'User'}
              </div>
              <div style={{ fontSize: '0.6875rem', color: '#8C8F95', textTransform: 'capitalize' }}>
                {currentUser?.role}
              </div>
            </div>
          </div>
          <button className="sidebar-nav-item" onClick={() => setIsSignOutModalOpen(true)} style={{ color: '#78716C' }}>
            <LogOut size={14} /><span>Sign out</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="topbar">
          <div>
            {activeView === 'reception' && (
              <h1 style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#202124' }}>Queue &amp; Tokens</h1>
            )}
            {activeView === 'admin' && (
              <h1 style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#202124', textTransform: 'capitalize' }}>
                {ADMIN_NAV.find(n => n.id === adminTab)?.label ?? 'Dashboard'}
              </h1>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: syncError ? '#C9826B' : '#6F8F7A' }} />
              <span style={{ fontSize: '0.6875rem', color: '#AAACB0', fontWeight: 500 }}>
                {syncError ? 'Offline' : 'Live'}
              </span>
            </div>
            <div className="divider-v" style={{ height: 20 }} />
            <span style={{ fontSize: '0.8125rem', color: '#54575C', fontWeight: 500 }}>{hospitalName}</span>
          </div>
        </header>

        {/* Session-expired banner — shown on 401, does not log out */}
        {sessionExpired && (
          <div style={{
            background: '#FCF4F2', borderBottom: '1px solid #E8B9A8',
            padding: '8px 20px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={14} style={{ color: '#B5603A', flexShrink: 0 }} />
              <span style={{ fontSize: '0.8125rem', color: '#7A3620', fontWeight: 500 }}>
                Your session token has expired. Refresh to continue, or sign out.
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={refreshDatabaseState}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <RefreshCw size={12} /> Retry
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => setIsSignOutModalOpen(true)}>
                Sign out
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto" style={{ padding: 24 }}>
          <Suspense fallback={
            <div className="flex items-center justify-center h-48">
              <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: '#6F8F7A', borderTopColor: 'transparent' }} />
            </div>
          }>
            {activeView === 'reception' && (
              settings
                ? <ReceptionDashboard departments={departments} doctors={doctors} tokens={tokens}
                    patients={patients} settings={settings} devices={devices}
                    onRefreshData={refreshDatabaseState} onTogglePause={handleTogglePause}
                    currentUser={currentUser} />
                : <DashboardSkeleton />
            )}
            {activeView === 'admin' && (
              settings
                ? <AdminDashboard departments={departments} doctors={doctors} tokens={tokens}
                    users={users} settings={settings} rooms={rooms} queueLogs={queueLogs}
                    onRefreshData={refreshDatabaseState} activeTab={adminTab}
                    setActiveTab={setAdminTab} currentUser={currentUser}
                    onLogout={() => setIsSignOutModalOpen(true)} />
                : <DashboardSkeleton />
            )}
          </Suspense>
        </main>
      </div>

      {isSignOutModalOpen && (
        <div className="modal-overlay" onClick={() => setIsSignOutModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()} id="signout-modal-content">
            <h3 style={{ fontWeight: 600, fontSize: '1rem', color: '#202124', marginBottom: 8 }}>Sign out?</h3>
            <p style={{ fontSize: '0.875rem', color: '#54575C', marginBottom: 24, lineHeight: 1.6 }}>
              You'll need to sign in again to access the dashboard.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button className="btn btn-ghost btn-sm" onClick={() => setIsSignOutModalOpen(false)} id="btn-signout-cancel">Cancel</button>
              <button className="btn btn-danger btn-sm" onClick={executeSignOut} id="btn-signout-confirm">Sign out</button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="toast" id="toast-success-signout">
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#ADC5BA' }} />
          {toastMessage}
        </div>
      )}
    </div>
  );
}
