import React, { useState, useCallback, memo } from 'react';
import { Department, Doctor, Token, QueueSettings, ReceptionUser, ConsultationRoom, QueueLog } from '../types';

import DashboardTab      from './DashboardTab';
import DepartmentsTab    from './DepartmentsTab';
import DoctorsTab        from './DoctorsTab';
import RoomsTab          from './RoomsTab';
import StaffTab          from './StaffTab';
import QueueSettingsTab  from './QueueSettingsTab';
import ReportsTab        from './ReportsTab';
import AuditLogsTab      from './AuditLogsTab';
import HospitalSettingsTab from './HospitalSettingsTab';

interface AdminDashboardProps {
  departments:   Department[];
  doctors:       Doctor[];
  tokens:        Token[];
  users:         ReceptionUser[];
  settings:      QueueSettings;
  rooms:         ConsultationRoom[];
  queueLogs:     QueueLog[];
  onRefreshData: () => Promise<void>;
  currentUser?:  ReceptionUser | null;
  activeTab?:    'dashboard' | 'departments' | 'doctors' | 'rooms' | 'staff' | 'queue-settings' | 'reports' | 'audit-logs' | 'hospital-settings';
  setActiveTab?: (tab: 'dashboard' | 'departments' | 'doctors' | 'rooms' | 'staff' | 'queue-settings' | 'reports' | 'audit-logs' | 'hospital-settings') => void;
  onLogout?:     () => void;
}

export default memo(function AdminDashboard({
  departments, doctors, tokens, users, settings, rooms, queueLogs,
  onRefreshData, currentUser, activeTab: controlledTab, setActiveTab: controlledSetActiveTab, onLogout,
}: AdminDashboardProps) {

  const [internalTab, setInternalTab] = useState<NonNullable<typeof controlledTab>>('dashboard');
  const activeTab    = controlledTab          ?? internalTab;
  const setActiveTab = controlledSetActiveTab ?? setInternalTab;

  const handleTabChange = useCallback((tab: typeof activeTab) => setActiveTab(tab), [setActiveTab]);

  const content = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardTab departments={departments} doctors={doctors} tokens={tokens} users={users} settings={settings} onRefreshData={onRefreshData} />;
      case 'departments':
        return <DepartmentsTab departments={departments} doctors={doctors} onRefreshData={onRefreshData} />;
      case 'doctors':
        return <DoctorsTab doctors={doctors} departments={departments} onRefreshData={onRefreshData} />;
      case 'rooms':
        return <RoomsTab rooms={rooms} doctors={doctors} departments={departments} onRefreshData={onRefreshData} />;
      case 'staff':
        return <StaffTab users={users} departments={departments} onRefreshData={onRefreshData} currentUser={currentUser} />;
      case 'queue-settings':
        return <QueueSettingsTab settings={settings} onRefreshData={onRefreshData} />;
      case 'reports':
        return <ReportsTab tokens={tokens} doctors={doctors} departments={departments} />;
      case 'audit-logs':
        return <AuditLogsTab logs={queueLogs} tokens={tokens} departments={departments} users={users} />;
      case 'hospital-settings':
        return <HospitalSettingsTab settings={settings} onRefreshData={onRefreshData} currentUser={currentUser} />;
      default:
        return null;
    }
  };

  // Controlled mode: App.tsx drives the tab — just render the content
  if (controlledTab) return <div id="admin-root-controlled">{content()}</div>;

  // Standalone fallback (not used in production App.tsx but kept for compatibility)
  return (
    <div id="admin-root">
      {content()}
    </div>
  );
});
