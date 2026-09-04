import { authFetch } from '../utils/authFetch';
import React, { useState } from 'react';
import { 
  Plus, Edit, Trash2, AlertCircle, Shield, User, Key, Check,
  Search, SlidersHorizontal, RefreshCw, ChevronLeft, ChevronRight,
  Info, Activity, Heart, CheckCircle2, MoreVertical, Sparkles, HelpCircle, ArrowRight, X
} from 'lucide-react';
import { ReceptionUser, Department, UserRole } from '../types';

interface StaffTabProps {
  users: ReceptionUser[];
  departments: Department[];
  onRefreshData: () => Promise<void>;
  currentUser?: ReceptionUser | null;
}

const AVAILABLE_PERMISSIONS = [
  { key: 'register_patient', label: 'Register Patient' },
  { key: 'generate_token', label: 'Generate Token' },
  { key: 'set_priority', label: 'Assign Queue Priority' },
  { key: 'call_token', label: 'Call Patient (Queue Duty)' },
  { key: 'complete_token', label: 'Complete Patient' },
  { key: 'skip_token', label: 'Skip Patient' },
  { key: 'cancel_token', label: 'Cancel Token' },
  { key: 'pause_queue', label: 'Pause/Resume Ticker' },
  { key: 'manage_hospital', label: 'Hospital Settings Profile' }
];

export default function StaffTab({
  users,
  departments,
  onRefreshData,
  currentUser
}: StaffTabProps) {
  // Modal / drawer state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  // Form fields
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.RECEPTIONIST);
  const [deptId, setDeptId] = useState('');
  const [assignedDeptIds, setAssignedDeptIds] = useState<string[]>([]);
  const [isDeptDropdownOpen, setIsDeptDropdownOpen] = useState(false);
  const [deptSearch, setDeptSearch] = useState('');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([
    'register_patient', 'generate_token', 'call_token', 'complete_token'
  ]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Filter toolbar state
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'receptionist'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Success toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefreshData();
    setIsRefreshing(false);
    showToast('Staff directories synchronized');
  };

  const handleOpenCreateModal = () => {
    setEditingUserId(null);
    setUsername('');
    setFullName('');
    setRole(UserRole.RECEPTIONIST);
    setDeptId('');
    setAssignedDeptIds([]);
    setIsDeptDropdownOpen(false);
    setDeptSearch('');
    setPassword('');
    setIsActive(true);
    setSelectedPermissions(['register_patient', 'generate_token', 'call_token', 'complete_token']);
    setError('');
    setIsFormOpen(true);
  };

  const handlePermissionChange = (permKey: string) => {
    setSelectedPermissions(prev => 
      prev.includes(permKey) 
        ? prev.filter(k => k !== permKey) 
        : [...prev, permKey]
    );
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username || !fullName) {
      setError('Username and full name are required');
      return;
    }

    setSaving(true);
    const url = editingUserId ? `/api/admin/users/${editingUserId}` : '/api/admin/users';
    const method = editingUserId ? 'PUT' : 'POST';

    const payload = {
      username: username.toLowerCase().trim(),
      name: fullName.trim(),
      role,
      departmentId: assignedDeptIds[0] || undefined,
      assignedDepartmentIds: assignedDeptIds,
      permissions: selectedPermissions,
      isActive,
      password: password || undefined
    };

    try {
      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'X-Operator-Username': currentUser?.username || 'admin'
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setIsFormOpen(false);
        setEditingUserId(null);
        setUsername('');
        setFullName('');
        setRole(UserRole.RECEPTIONIST);
        setDeptId('');
        setAssignedDeptIds([]);
        setIsDeptDropdownOpen(false);
        setDeptSearch('');
        setPassword('');
        setIsActive(true);
        setSelectedPermissions(['register_patient', 'generate_token', 'call_token', 'complete_token']);
        await onRefreshData();
        showToast(editingUserId ? 'Staff parameters updated' : 'New clinical operator registered');
      } else {
        const d = await res.json();
        setError(d.message || 'Error occurred while saving staff details');
      }
    } catch (err) {
      setError('Failed server communication');
    } finally {
      setSaving(false);
    }
  };

  const handleEditClick = (user: ReceptionUser) => {
    setEditingUserId(user.id);
    setUsername(user.username);
    setFullName(user.name);
    setRole(user.role);
    setDeptId(user.departmentId || '');
    setAssignedDeptIds(user.assignedDepartmentIds || (user.departmentId ? [user.departmentId] : []));
    setIsDeptDropdownOpen(false);
    setDeptSearch('');
    setPassword('');
    setIsActive(user.isActive !== false);
    setSelectedPermissions(user.permissions || []);
    setError('');
    setIsFormOpen(true);
  };

  const handleDeleteStaff = async (id: string) => {
    if (id === 'user-1' || id === 'usr-1') {
      alert("System chief admin account cannot be deleted.");
      return;
    }
    if (!confirm("Are you sure you want to delete this staff user record permanently?")) return;
    try {
      const res = await authFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await onRefreshData();
        showToast('Staff credentials revoked');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Derived Statistics
  const totalStaff = users.length;
  const activeStaff = users.filter(u => u.isActive !== false).length;
  const adminCount = users.filter(u => u.role === UserRole.ADMIN).length;
  const receptionistCount = users.filter(u => u.role === UserRole.RECEPTIONIST).length;
  const totalPermissionsAssigned = users.reduce((acc, curr) => acc + (curr.permissions || []).length, 0);

  // Filter and sort staff
  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          user.username.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-8 animate-fade-in" id="staff-tab-root">
      
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-12 right-12 z-50 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-xl flex items-center gap-3 animate-fade-in border border-slate-800" id="toast-success-staff">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold font-sans">{toastMessage}</span>
        </div>
      )}

      {/* 5 Top KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4" id="staff-top-statistics">
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Staff</span>
            <span className="text-2xl font-display font-extrabold text-slate-900 mt-1 block">{totalStaff}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Registered logons</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Active Accounts</span>
            <span className="text-2xl font-display font-extrabold text-emerald-600 mt-1 block">{activeStaff}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Fully enabled access</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Administrators</span>
            <span className="text-2xl font-display font-extrabold text-indigo-600 mt-1 block">{adminCount}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Full dashboard keys</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Receptionists</span>
            <span className="text-2xl font-display font-extrabold text-slate-800 mt-1 block">{receptionistCount}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Desk operators</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between col-span-2 lg:col-span-1">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Permissions Scope</span>
            <span className="text-2xl font-display font-extrabold text-blue-600 mt-1 block">{totalPermissionsAssigned}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Granular keys assigned</span>
        </div>
      </div>

      {/* Header Block with Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4" id="staff-header-block">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            <span>Admin Center</span>
            <span>/</span>
            <span className="text-slate-600">Receptionists & Admins</span>
          </div>
          <h2 className="text-2xl font-display font-extrabold text-slate-900 tracking-tight">Staff Credentials</h2>
          <p className="text-xs text-slate-500 mt-1">Configure user login profiles, assigned clinics, and select direct granular system authorization permissions.</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleOpenCreateModal}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer"
            id="btn-add-staff"
          >
            <Plus className="h-4 w-4 stroke-[3px]" />
            <span>Add Desk Staff</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3" id="staff-filter-toolbar">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search staff by full name or username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 hover:bg-slate-100/50 border border-slate-200 rounded-xl pl-9.5 pr-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
            id="search-staff"
          />
          <Search className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 h-full w-5" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={roleFilter}
            onChange={(e: any) => setRoleFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
            id="select-staff-role-filter"
          >
            <option value="all">All Roles</option>
            <option value="admin">Administrator</option>
            <option value="receptionist">Receptionist</option>
          </select>

          <button
            onClick={handleRefresh}
            className={`p-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-all cursor-pointer flex items-center justify-center ${
              isRefreshing ? 'animate-spin text-blue-600' : ''
            }`}
            title="Refresh Staff Roster"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="w-full" id="staff-main-grid">
        
        {/* Large Data Table */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col justify-between min-h-[400px]" id="staff-table-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" id="staff-table">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-4 px-6">Staff Member</th>
                  <th className="py-4 px-6">Login Username ID</th>
                  <th className="py-4 px-6">Assigned Department Focus</th>
                  <th className="py-4 px-6">Assigned Permissions Count</th>
                  <th className="py-4 px-6 text-center">Status</th>
                  <th className="py-4 px-6 text-right rounded-r-lg">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredUsers.map(user => {
                  const dept = departments.find(d => d.id === user.departmentId);
                  const isUserActive = user.isActive !== false;
                  
                  return (
                    <tr key={user.id} className="hover:bg-slate-50/40 transition-all group" id={`row-staff-${user.id}`}>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                            {user.role === UserRole.ADMIN ? (
                              <Shield className="h-5 w-5 text-blue-600" />
                            ) : (
                              <User className="h-5 w-5 text-blue-600" />
                            )}
                          </div>
                          <div>
                            <span className="font-extrabold text-slate-900 text-[13px] block leading-snug">{user.name}</span>
                            <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider mt-0.5">
                              {user.role}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-6">
                        <span className="font-mono font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded text-[11px]">
                          @{user.username}
                        </span>
                      </td>

                      <td className="py-4 px-6">
                        <span className="font-bold text-slate-800">
                          {user.role === UserRole.ADMIN ? (
                            <span className="text-blue-600 font-extrabold">All Departments (Global)</span>
                          ) : dept ? (
                            dept.name
                          ) : (
                            <span className="text-slate-400 text-[10px]">Unassigned (Global Intake)</span>
                          )}
                        </span>
                      </td>

                      <td className="py-4 px-6 font-bold text-slate-700">
                        {user.permissions ? (
                          <span className="bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg text-xs font-mono">
                            {user.permissions.length} Keys
                          </span>
                        ) : (
                          <span className="text-slate-400">0 Keys</span>
                        )}
                      </td>

                      <td className="py-4 px-6 text-center">
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-extrabold border uppercase ${
                          isUserActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                            : 'bg-rose-50 text-rose-700 border-rose-100'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${isUserActive ? 'bg-emerald-600' : 'bg-rose-600'}`}></span>
                          {isUserActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleEditClick(user)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition-all cursor-pointer"
                            title="Edit user profile"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          
                          <button
                            onClick={() => handleDeleteStaff(user.id)}
                            disabled={user.id === 'user-1' || user.id === 'usr-1'}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer disabled:opacity-30 disabled:hover:bg-transparent"
                            title="Delete staff record"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-slate-400 text-xs">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Info className="h-8 w-8 text-slate-300" />
                        <span className="font-medium text-slate-500">No staff credentials match keywords.</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer */}
          <div className="p-5 bg-slate-50/60 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-3">
            <span className="text-[11px] text-slate-400 font-medium">
              Showing <strong>{filteredUsers.length}</strong> of <strong>{users.length}</strong> registered staff login credentials
            </span>

            <div className="flex items-center gap-1">
              <button disabled className="p-1.5 bg-white border border-slate-200 text-slate-400 rounded-lg text-xs font-semibold cursor-not-allowed">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold shadow-sm">1</button>
              <button disabled className="p-1.5 bg-white border border-slate-200 text-slate-400 rounded-lg text-xs font-semibold cursor-not-allowed">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Slide-over Form Drawer */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex justify-end" id="staff-slide-over">
          
          <div 
            onClick={() => setIsFormOpen(false)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300"
          />

          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col justify-between z-10 animate-fade-in border-l border-slate-100">
            
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-blue-600" />
                  {editingUserId ? "Edit Staff User Profile" : "Add Clinical Staff"}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Configure login profiles, security scopes & direct permissions</p>
              </div>
              
              <button 
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 hover:bg-slate-50 text-slate-400 hover:text-slate-900 rounded-xl transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form Fields body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-2xl text-xs flex items-start gap-2 animate-fade-in" id="staff-error-alert">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span className="font-medium leading-relaxed">{error}</span>
                </div>
              )}

              <form id="staff-slideover-form" className="space-y-4" onSubmit={handleSaveStaff}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Username ID</label>
                    <input
                      type="text"
                      placeholder="receptionistA"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={!!editingUserId}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
                      id="input-staff-username"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">User Role</label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as UserRole)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer font-bold animate-none"
                      id="select-staff-role"
                    >
                      <option value={UserRole.RECEPTIONIST}>Receptionist</option>
                      <option value={UserRole.ADMIN}>Administrator</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Full Operator Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Sarah Connor"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    id="input-staff-fullname"
                  />
                </div>

                {role === UserRole.RECEPTIONIST ? (
                  <div className="relative">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex justify-between items-center">
                      <span>Assigned Departments</span>
                      {assignedDeptIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setAssignedDeptIds([])}
                          className="text-[9px] text-rose-500 hover:text-rose-700 font-bold uppercase transition-colors cursor-pointer"
                        >
                          Clear All
                        </button>
                      )}
                    </label>
                    
                    <button
                      type="button"
                      onClick={() => setIsDeptDropdownOpen(!isDeptDropdownOpen)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 flex justify-between items-center font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      id="btn-dept-dropdown"
                    >
                      <span className="truncate">
                        {assignedDeptIds.length === 0 
                          ? 'Choose assigned departments...' 
                          : `${assignedDeptIds.length} department(s) selected`}
                      </span>
                      <SlidersHorizontal className="h-4 w-4 text-slate-400 shrink-0" />
                    </button>

                    {/* Dropdown Menu */}
                    {isDeptDropdownOpen && (
                      <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-2xl shadow-xl p-3 space-y-2 max-h-60 overflow-y-auto" id="dept-dropdown-menu">
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Search departments..."
                            value={deptSearch}
                            onChange={(e) => setDeptSearch(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
                            id="search-dept-dropdown"
                          />
                          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                        </div>

                        <div className="space-y-1.5 pt-1">
                          {departments
                            .filter(d => d.name.toLowerCase().includes(deptSearch.toLowerCase()))
                            .map(d => {
                              const isChecked = assignedDeptIds.includes(d.id);
                              return (
                                <label
                                  key={d.id}
                                  className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer text-xs font-semibold text-slate-700 select-none"
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {
                                      if (isChecked) {
                                        setAssignedDeptIds(prev => prev.filter(id => id !== d.id));
                                      } else {
                                        setAssignedDeptIds(prev => [...prev, d.id]);
                                      }
                                    }}
                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30 h-4 w-4 cursor-pointer"
                                  />
                                  <span>{d.name}</span>
                                </label>
                              );
                            })}
                          {departments.filter(d => d.name.toLowerCase().includes(deptSearch.toLowerCase())).length === 0 && (
                            <div className="text-center text-[11px] text-slate-400 py-2">
                              No matching departments
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Selected Departments Tags */}
                    {assignedDeptIds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2 font-sans" id="assigned-dept-tags">
                        {assignedDeptIds.map(id => {
                          const dept = departments.find(d => d.id === id);
                          if (!dept) return null;
                          return (
                            <span
                              key={id}
                              className="inline-flex items-center gap-1 bg-blue-50 border border-blue-100/60 text-blue-700 px-2.5 py-1 rounded-lg text-[10px] font-bold"
                            >
                              <span>{dept.name}</span>
                              <button
                                type="button"
                                onClick={() => setAssignedDeptIds(prev => prev.filter(dId => dId !== id))}
                                className="text-blue-500 hover:text-blue-700 cursor-pointer"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Assigned Station Department</label>
                    <div className="bg-slate-50 border border-slate-100/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-400 font-semibold cursor-not-allowed italic">
                      Administrator has complete hospital access
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    {editingUserId ? "Reset Password (Optional)" : "Password Setup"}
                  </label>
                  <input
                    type="password"
                    placeholder={editingUserId ? "••••••••" : "Define password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-mono"
                    id="input-staff-password"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Granular Authorization Keys</label>
                  <div className="bg-slate-50/50 p-3 rounded-2xl border border-slate-100 max-h-[160px] overflow-y-auto space-y-2">
                    {AVAILABLE_PERMISSIONS.map(perm => {
                      const checked = selectedPermissions.includes(perm.key);
                      return (
                        <div key={perm.key} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`chk-perm-${perm.key}`}
                            checked={checked}
                            onChange={() => handlePermissionChange(perm.key)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30 h-4 w-4 cursor-pointer"
                          />
                          <label htmlFor={`chk-perm-${perm.key}`} className="text-xs text-slate-700 cursor-pointer select-none font-medium">
                            {perm.label}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-2.5 py-2 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                  <input 
                    type="checkbox"
                    id="chk-staff-active"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30 h-4 w-4 cursor-pointer"
                  />
                  <div>
                    <label htmlFor="chk-staff-active" className="text-xs font-bold text-slate-700 cursor-pointer">
                      Activate Login Credentials
                    </label>
                    <span className="text-[10px] text-slate-400 block leading-tight">Revoking deactivates direct logins instantly.</span>
                  </div>
                </div>
              </form>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-50 transition-all cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                form="staff-slideover-form"
                disabled={saving}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                id="btn-save-staff"
              >
                {saving ? 'Saving...' : editingUserId ? 'Update operator' : 'Create operator'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
