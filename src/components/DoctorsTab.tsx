import React, { useState } from 'react';
import { 
  Plus, Edit, Trash2, AlertCircle, Stethoscope, Clock, ShieldAlert, 
  Search, SlidersHorizontal, RefreshCw, ChevronLeft, ChevronRight,
  Info, Activity, Heart, CheckCircle2, MoreVertical, Sparkles, HelpCircle, ArrowRight, X, Check
} from 'lucide-react';
import { Doctor, Department } from '../types';

interface DoctorsTabProps {
  doctors: Doctor[];
  departments: Department[];
  onRefreshData: () => Promise<void>;
}

export default function DoctorsTab({
  doctors,
  departments,
  onRefreshData
}: DoctorsTabProps) {
  // Modal / drawer state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);

  // Form fields
  const [docName, setDocName] = useState('');
  const [docDept, setDocDept] = useState('');
  const [docSpec, setDocSpec] = useState('');
  const [docRoom, setDocRoom] = useState('');
  const [docAvgTime, setDocAvgTime] = useState('15');
  const [docStart, setDocStart] = useState('08:00');
  const [docEnd, setDocEnd] = useState('17:00');
  const [docMaxPatients, setDocMaxPatients] = useState('45');
  const [docStatus, setDocStatus] = useState<Doctor['status']>('available');

  const [docSaving, setDocSaving] = useState(false);
  const [docError, setDocError] = useState('');

  // Filter toolbar state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'busy' | 'break' | 'leave' | 'offline'>('all');
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'time-asc' | 'patients-desc'>('name-asc');
  const [showFilters, setShowFilters] = useState(false);
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
    showToast('Physician directory synchronized');
  };

  const handleOpenCreateModal = () => {
    setEditingDocId(null);
    setDocName('');
    setDocDept('');
    setDocSpec('');
    setDocRoom('');
    setDocAvgTime('15');
    setDocStart('08:00');
    setDocEnd('17:00');
    setDocMaxPatients('45');
    setDocStatus('available');
    setDocError('');
    setIsFormOpen(true);
  };

  const handleSaveDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    setDocError('');
    if (!docName || !docDept) {
      setDocError('Doctor name and department are required');
      return;
    }

    setDocSaving(true);
    const url = editingDocId ? `/api/admin/doctors/${editingDocId}` : '/api/admin/doctors';
    const method = editingDocId ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: docName,
          departmentId: docDept,
          specialization: docSpec || "General",
          status: docStatus,
          roomNumber: docRoom,
          avgConsultationTime: parseInt(docAvgTime) || 15,
          startTime: docStart,
          endTime: docEnd,
          maxPatientsPerDay: parseInt(docMaxPatients) || 45,
          isEnabled: true
        })
      });
      if (res.ok) {
        setIsFormOpen(false);
        setEditingDocId(null);
        setDocName('');
        setDocDept('');
        setDocSpec('');
        setDocRoom('');
        setDocAvgTime('15');
        setDocStart('08:00');
        setDocEnd('17:00');
        setDocMaxPatients('45');
        setDocStatus('available');
        await onRefreshData();
        showToast(editingDocId ? 'Physician parameters updated' : 'New physician added to roster');
      } else {
        const d = await res.json();
        setDocError(d.message || 'Error occurred while saving doctor record');
      }
    } catch (err) {
      setDocError('Failed to communicate with API server');
    } finally {
      setDocSaving(false);
    }
  };

  const handleEditClick = (doc: Doctor) => {
    setEditingDocId(doc.id);
    setDocName(doc.name);
    setDocDept(doc.departmentId);
    setDocSpec(doc.specialization);
    setDocRoom(doc.roomNumber || '');
    setDocAvgTime(String(doc.avgConsultationTime || '15'));
    setDocStart(doc.startTime || '08:00');
    setDocEnd(doc.endTime || '17:00');
    setDocMaxPatients(String(doc.maxPatientsPerDay || '45'));
    setDocStatus(doc.status || 'available');
    setDocError('');
    setIsFormOpen(true);
  };

  const handleDeleteDoctor = async (id: string) => {
    if (!confirm("Are you sure you want to delete this physician record permanently?")) return;
    try {
      const res = await fetch(`/api/admin/doctors/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await onRefreshData();
        showToast('Physician record deleted successfully');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleQuickStatusChange = async (docId: string, newStatus: Doctor['status']) => {
    try {
      const res = await fetch(`/api/admin/doctors/${docId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        await onRefreshData();
        showToast(`Physician status changed to ${newStatus}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Derived Statistics
  const totalDoctors = doctors.length;
  const availableDocs = doctors.filter(d => d.status === 'available').length;
  const busyDocs = doctors.filter(d => d.status === 'busy').length;
  const offlineDocs = doctors.filter(d => d.status === 'offline' || !d.status).length;
  const totalMaxLoad = doctors.reduce((acc, curr) => acc + (curr.maxPatientsPerDay || 45), 0);

  // Filter and sort physicians
  const filteredDoctors = doctors.filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          doc.specialization.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (doc.roomNumber && doc.roomNumber.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesStatus = statusFilter === 'all' || doc.status === statusFilter;

    return matchesSearch && matchesStatus;
  }).sort((a, b) => {
    if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
    if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
    if (sortBy === 'time-asc') return (a.avgConsultationTime || 15) - (b.avgConsultationTime || 15);
    if (sortBy === 'patients-desc') return (b.maxPatientsPerDay || 45) - (a.maxPatientsPerDay || 45);
    return 0;
  });

  return (
    <div className="space-y-8 animate-fade-in" id="doctors-tab-root">
      
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-12 right-12 z-50 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-xl flex items-center gap-3 animate-fade-in border border-slate-800" id="toast-success-doc">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold font-sans">{toastMessage}</span>
        </div>
      )}

      {/* 5 Top KPI Statistic Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4" id="doctors-top-statistics">
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Doctors</span>
            <span className="text-2xl font-display font-extrabold text-slate-900 mt-1 block">{totalDoctors}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">
            Rostered in service
          </span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Available Now</span>
            <span className="text-2xl font-display font-extrabold text-emerald-600 mt-1 block">{availableDocs}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Ready for consultations</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Currently Busy</span>
            <span className="text-2xl font-display font-extrabold text-amber-600 mt-1 block">{busyDocs}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Active sessions</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Offline / Logged Out</span>
            <span className="text-2xl font-display font-extrabold text-slate-500 mt-1 block">{offlineDocs}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">On leave or offline</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between col-span-2 lg:col-span-1">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Max Load / Cap</span>
            <span className="text-2xl font-display font-extrabold text-blue-600 mt-1 block">{totalMaxLoad}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Daily medical load cap</span>
        </div>
      </div>

      {/* Header Block with Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4" id="doctors-header-block">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            <span>Admin Center</span>
            <span>/</span>
            <span className="text-slate-600">Physicians</span>
          </div>
          <h2 className="text-2xl font-display font-extrabold text-slate-900 tracking-tight">Physician Management</h2>
          <p className="text-xs text-slate-500 mt-1">Configure clinical consultation hours, room numbers, daily limits, and real-time availability states.</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleOpenCreateModal}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer"
            id="btn-add-physician"
          >
            <Plus className="h-4 w-4 stroke-[3px]" />
            <span>Add Physician</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3" id="doctors-filter-toolbar">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search physicians by name, specialization, or room..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 hover:bg-slate-100/50 border border-slate-200 rounded-xl pl-9.5 pr-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
            id="search-doctor"
          />
          <Search className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 h-full w-5" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
            id="select-doctor-status-filter"
          >
            <option value="all">All Statuses</option>
            <option value="available">Available</option>
            <option value="busy">Busy / Consultation</option>
            <option value="break">On Break</option>
            <option value="leave">On Leave</option>
            <option value="offline">Offline</option>
          </select>

          <select
            value={sortBy}
            onChange={(e: any) => setSortBy(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
            id="select-doctor-sort-filter"
          >
            <option value="name-asc">Sort by: Name (A-Z)</option>
            <option value="name-desc">Sort by: Name (Z-A)</option>
            <option value="time-asc">Sort by: Shortest Session</option>
            <option value="patients-desc">Sort by: Highest Max Load</option>
          </select>

          <button
            onClick={handleRefresh}
            className={`p-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-all cursor-pointer flex items-center justify-center ${
              isRefreshing ? 'animate-spin text-blue-600' : ''
            }`}
            title="Refresh Doctor Directory"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="w-full" id="doctors-main-grid">
        
        {/* Large Data Table */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col justify-between min-h-[400px]" id="doctors-table-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" id="doctors-table">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-4 px-6">Physician Details</th>
                  <th className="py-4 px-6">Clinical Department</th>
                  <th className="py-4 px-6">Room Assigned</th>
                  <th className="py-4 px-6">Service Hours & Load</th>
                  <th className="py-4 px-6 text-center">Status</th>
                  <th className="py-4 px-6 text-right rounded-r-lg">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredDoctors.map(doc => {
                  const dept = departments.find(d => d.id === doc.departmentId);
                  
                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/40 transition-all group" id={`row-doc-${doc.id}`}>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                            <Stethoscope className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <span className="font-extrabold text-slate-900 text-[13px] block leading-snug">{doc.name}</span>
                            <span className="text-[10px] text-slate-400 block font-normal mt-0.5 line-clamp-1">
                              {doc.specialization || 'Clinical Practitioner'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-6">
                        <span className="font-bold text-slate-800">
                          {dept ? dept.name : 'General Outpatient'}
                        </span>
                      </td>

                      <td className="py-4 px-6">
                        {doc.roomNumber ? (
                          <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                            Suite {doc.roomNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">Unassigned</span>
                        )}
                      </td>

                      <td className="py-4 px-6">
                        <div className="text-slate-700 font-medium flex items-center gap-1">
                          <Clock className="h-3 w-3 text-slate-400" />
                          <span>{doc.startTime || '08:00'} - {doc.endTime || '17:00'}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 font-medium">
                          {doc.avgConsultationTime || 15} mins/patient • Max {doc.maxPatientsPerDay || 45} patients
                        </div>
                      </td>

                      <td className="py-4 px-6 text-center">
                        <select
                          value={doc.status || 'offline'}
                          onChange={(e) => handleQuickStatusChange(doc.id, e.target.value as any)}
                          className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border focus:outline-none cursor-pointer uppercase transition-all ${
                            doc.status === 'available'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                              : doc.status === 'busy' 
                              ? 'bg-amber-50 text-amber-700 border-amber-100'
                              : doc.status === 'break'
                              ? 'bg-blue-50 text-blue-700 border-blue-100'
                              : doc.status === 'leave'
                              ? 'bg-rose-50 text-rose-700 border-rose-100'
                              : 'bg-slate-50 text-slate-500 border-slate-100'
                          }`}
                        >
                          <option value="available">Available</option>
                          <option value="busy">Busy</option>
                          <option value="break">On Break</option>
                          <option value="leave">On Leave</option>
                          <option value="offline">Offline</option>
                        </select>
                      </td>

                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleEditClick(doc)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition-all cursor-pointer"
                            title="Edit physician parameters"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          
                          <button
                            onClick={() => handleDeleteDoctor(doc.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                            title="Delete physician record"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredDoctors.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-slate-400 text-xs">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Info className="h-8 w-8 text-slate-300" />
                        <span className="font-medium text-slate-500">No physician roster records match search keywords.</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer with pagination */}
          <div className="p-5 bg-slate-50/60 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-3">
            <span className="text-[11px] text-slate-400 font-medium">
              Showing <strong>{filteredDoctors.length}</strong> of <strong>{doctors.length}</strong> rostered medical practitioners
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
        <div className="fixed inset-0 z-50 flex justify-end" id="doctor-slide-over">
          
          <div 
            onClick={() => setIsFormOpen(false)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300"
          />

          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col justify-between z-10 animate-fade-in border-l border-slate-100">
            
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <Stethoscope className="h-5 w-5 text-blue-600" />
                  {editingDocId ? "Edit Physician Parameters" : "Add Medical Physician"}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Configure physician details, limits and duty profiles</p>
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
              {docError && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-2xl text-xs flex items-start gap-2 animate-fade-in" id="doc-error-alert">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span className="font-medium leading-relaxed">{docError}</span>
                </div>
              )}

              <form id="doc-slideover-form" className="space-y-4" onSubmit={handleSaveDoctor}>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Full Physician Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Dr. Arthur Pendelton"
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    id="input-doc-name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Department</label>
                    <select
                      value={docDept}
                      onChange={(e) => setDocDept(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer font-bold"
                      id="select-doc-dept"
                    >
                      <option value="">Choose...</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Consult Room</label>
                    <input
                      type="text"
                      placeholder="e.g. 101"
                      value={docRoom}
                      onChange={(e) => setDocRoom(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      id="input-doc-room"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Medical Specialization</label>
                  <input
                    type="text"
                    placeholder="e.g. Interventional Cardiology"
                    value={docSpec}
                    onChange={(e) => setDocSpec(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    id="input-doc-spec"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Consult Time (Mins)</label>
                    <input
                      type="number"
                      value={docAvgTime}
                      onChange={(e) => setDocAvgTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900"
                      id="input-doc-avg-time"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Daily Patient Limit</label>
                    <input
                      type="number"
                      value={docMaxPatients}
                      onChange={(e) => setDocMaxPatients(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900"
                      id="input-doc-max-patients"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Duty Start</label>
                    <input
                      type="time"
                      value={docStart}
                      onChange={(e) => setDocStart(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Duty End</label>
                    <input
                      type="time"
                      value={docEnd}
                      onChange={(e) => setDocEnd(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Queue Duty Status</label>
                  <select
                    value={docStatus}
                    onChange={(e) => setDocStatus(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer font-bold"
                    id="select-doc-status"
                  >
                    <option value="available">Available (Accepting Tokens)</option>
                    <option value="busy">Busy (In consultation)</option>
                    <option value="break">On Break (Paused)</option>
                    <option value="leave">On Leave (Absent)</option>
                    <option value="offline">Offline / Logged Out</option>
                  </select>
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
                form="doc-slideover-form"
                disabled={docSaving}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                id="btn-save-doc"
              >
                {docSaving ? 'Saving...' : editingDocId ? 'Update Physician' : 'Add Physician'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
