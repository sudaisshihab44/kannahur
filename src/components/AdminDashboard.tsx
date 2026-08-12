import React, { useState, useCallback, memo } from 'react';
import { 
  Building, Users, Stethoscope, Sliders, Settings, 
  DoorOpen, Activity, FileText, BarChart2, ShieldAlert, LogOut
} from 'lucide-react';
import { Department, Doctor, Token, QueueSettings, ReceptionUser, ConsultationRoom, QueueLog } from '../types';

// Tab Components Imports
import DashboardTab from './DashboardTab';
import DepartmentsTab from './DepartmentsTab';
import DoctorsTab from './DoctorsTab';
import RoomsTab from './RoomsTab';
import StaffTab from './StaffTab';
import QueueSettingsTab from './QueueSettingsTab';
import ReportsTab from './ReportsTab';
import AuditLogsTab from './AuditLogsTab';
import HospitalSettingsTab from './HospitalSettingsTab';

interface AdminDashboardProps {
  departments: Department[];
  doctors: Doctor[];
  tokens: Token[];
  users: ReceptionUser[];
  settings: QueueSettings;
  /** Passed from App.tsx so this component never double-fetches /api/data */
  rooms: ConsultationRoom[];
  queueLogs: QueueLog[];
  onRefreshData: () => Promise<void>;
  currentUser?: ReceptionUser | null;
  activeTab?: 'dashboard' | 'departments' | 'doctors' | 'rooms' | 'staff' | 'queue-settings' | 'reports' | 'audit-logs' | 'hospital-settings';
  setActiveTab?: (tab: 'dashboard' | 'departments' | 'doctors' | 'rooms' | 'staff' | 'queue-settings' | 'reports' | 'audit-logs' | 'hospital-settings') => void;
  onLogout?: () => void;
}

export default memo(function AdminDashboard({ 
  departments, 
  doctors, 
  tokens, 
  users,
  settings, 
  rooms,
  queueLogs,
  onRefreshData,
  currentUser,
  activeTab: controlledTab,
  setActiveTab: controlledSetActiveTab,
  onLogout
}: AdminDashboardProps) {
  
  const [internalTab, setInternalTab] = useState<
    'dashboard' | 'departments' | 'doctors' | 'rooms' | 'staff' | 'queue-settings' | 'reports' | 'audit-logs' | 'hospital-settings'
  >('dashboard');

  const activeTab    = controlledTab          || internalTab;
  const setActiveTab = controlledSetActiveTab || setInternalTab;

  // Stable tab change handler — no extra fetches needed since
  // rooms and queueLogs are now passed down from App's polling state.
  const handleTabChange = useCallback((tab: typeof activeTab) => {
    setActiveTab(tab);
  }, [setActiveTab]);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardTab 
            departments={departments}
            doctors={doctors}
            tokens={tokens}
            users={users}
            settings={settings}
            onRefreshData={onRefreshData}
          />
        );
      case 'departments':
        return (
          <DepartmentsTab 
            departments={departments}
            doctors={doctors}
            onRefreshData={onRefreshData}
          />
        );
      case 'doctors':
        return (
          <DoctorsTab 
            doctors={doctors}
            departments={departments}
            onRefreshData={onRefreshData}
          />
        );
      case 'rooms':
        return (
          <RoomsTab 
            rooms={rooms}
            doctors={doctors}
            departments={departments}
            onRefreshData={onRefreshData}
          />
        );
      case 'staff':
        return (
          <StaffTab 
            users={users}
            departments={departments}
            onRefreshData={onRefreshData}
            currentUser={currentUser}
          />
        );
      case 'queue-settings':
        return (
          <QueueSettingsTab 
            settings={settings}
            onRefreshData={onRefreshData}
          />
        );
      case 'reports':
        return (
          <ReportsTab 
            tokens={tokens}
            doctors={doctors}
            departments={departments}
          />
        );
      case 'audit-logs':
        return (
          <AuditLogsTab 
            logs={queueLogs}
            tokens={tokens}
            departments={departments}
            users={users}
          />
        );
      case 'hospital-settings':
        return (
          <HospitalSettingsTab 
            settings={settings}
            onRefreshData={onRefreshData}
            currentUser={currentUser}
          />
        );
      default:
        return null;
    }
  };

  // If controlledTab is provided, do NOT render the nested sidebar layout. Just render the main content.
  if (controlledTab) {
    return (
      <div className="w-full h-full bg-slate-50/30 p-8" id="admin-root-controlled">
        {renderContent()}
      </div>
    );
  }

  // Fallback standalone layout (uncontrolled)
  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col lg:flex-row" id="admin-root">
      {/* Sidebar Navigation */}
      <aside className="w-full lg:w-64 bg-white border-b lg:border-b-0 lg:border-r border-slate-100 shrink-0 p-5 flex flex-col justify-between" id="admin-sidebar">
        <div className="space-y-6">
          <div className="flex items-center gap-2 px-1">
            <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-extrabold text-sm font-display">
              H
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Control Desk</span>
              <span className="text-sm font-display font-extrabold text-slate-900 block leading-none mt-0.5">Administrator</span>
            </div>
          </div>

          <nav className="space-y-1" id="admin-nav-menu">
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
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id as any)}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                    isSelected 
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/10' 
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50/80'
                  }`}
                  id={`nav-tab-${tab.id}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}

            {onLogout && (
              <>
                <div className="h-[1px] bg-slate-100 my-2 mx-1"></div>
                <button
                  onClick={onLogout}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold rounded-xl transition-all cursor-pointer text-slate-500 hover:text-red-600 hover:bg-red-50"
                  id="admin-fallback-signout"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  <span>Sign Out</span>
                </button>
              </>
            )}
          </nav>
        </div>

        <div className="p-3 bg-blue-50/50 border border-blue-100/40 rounded-2xl flex items-start gap-2 text-[10px] text-slate-500 mt-6 leading-normal" id="sidebar-auth-hint">
          <ShieldAlert className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          <span>Authenticated under Administrator credentials. Full access granted.</span>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <main className="flex-1 p-6 lg:p-8 overflow-y-auto max-w-7xl mx-auto w-full" id="admin-workspace">
        <div className="border-b border-slate-100 pb-5 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4" id="workspace-header">
          <div>
            <h1 className="text-xl font-display font-extrabold text-slate-900 tracking-tight capitalize" id="workspace-title">
              {activeTab.replace('-', ' ')}
            </h1>
          </div>
        </div>
        <div className="min-h-[500px]" id="tab-view-container">
          {renderContent()}
        </div>
      </main>
    </div>
  );
});
