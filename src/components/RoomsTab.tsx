import React, { useState } from 'react';
import { 
  Plus, Edit, Trash2, AlertCircle, DoorOpen, Monitor, CheckCircle,
  Search, SlidersHorizontal, RefreshCw, ChevronLeft, ChevronRight,
  Info, Activity, Heart, CheckCircle2, MoreVertical, Sparkles, HelpCircle, ArrowRight, X, Check
} from 'lucide-react';
import { ConsultationRoom, Doctor, Department } from '../types';

interface RoomsTabProps {
  rooms: ConsultationRoom[];
  doctors: Doctor[];
  departments: Department[];
  onRefreshData: () => Promise<void>;
}

export default function RoomsTab({
  rooms,
  doctors,
  departments,
  onRefreshData
}: RoomsTabProps) {
  // Modal / drawer state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);

  // Form fields
  const [roomNumber, setRoomNumber] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomDoc, setRoomDoc] = useState('');
  const [roomDept, setRoomDept] = useState('');
  const [roomStatus, setRoomStatus] = useState<ConsultationRoom['status']>('available');
  const [displayScreenId, setDisplayScreenId] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Filter toolbar state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'occupied' | 'inactive' | 'maintenance'>('all');
  const [sortBy, setSortBy] = useState<'number-asc' | 'name-asc'>('number-asc');
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
    showToast('Consultation room inventory synchronized');
  };

  const handleOpenCreateModal = () => {
    setEditingRoomId(null);
    setRoomNumber('');
    setRoomName('');
    setRoomDoc('');
    setRoomDept('');
    setRoomStatus('available');
    setDisplayScreenId('');
    setError('');
    setIsFormOpen(true);
  };

  const handleSaveRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!roomNumber || !roomName) {
      setError('Room number and friendly name are required');
      return;
    }

    setSaving(true);
    const url = editingRoomId ? `/api/admin/rooms/${editingRoomId}` : '/api/admin/rooms';
    const method = editingRoomId ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomNumber,
          roomName,
          assignedDoctorId: roomDoc || undefined,
          departmentId: roomDept || undefined,
          status: roomStatus,
          displayScreenId: displayScreenId || undefined
        })
      });
      if (res.ok) {
        setIsFormOpen(false);
        setEditingRoomId(null);
        setRoomNumber('');
        setRoomName('');
        setRoomDoc('');
        setRoomDept('');
        setRoomStatus('available');
        setDisplayScreenId('');
        await onRefreshData();
        showToast(editingRoomId ? 'Consultation suite updated' : 'New consultation suite created');
      } else {
        const d = await res.json();
        setError(d.message || 'Failed saving consultation room details');
      }
    } catch (err) {
      setError('Server communication failure');
    } finally {
      setSaving(false);
    }
  };

  const handleEditClick = (room: ConsultationRoom) => {
    setEditingRoomId(room.id);
    setRoomNumber(room.roomNumber);
    setRoomName(room.roomName);
    setRoomDoc(room.assignedDoctorId || '');
    setRoomDept(room.departmentId || '');
    setRoomStatus(room.status || 'available');
    setDisplayScreenId(room.displayScreenId || '');
    setError('');
    setIsFormOpen(true);
  };

  const handleDeleteRoom = async (id: string) => {
    if (!confirm("Are you sure you want to delete this consultation room record?")) return;
    try {
      const res = await fetch(`/api/admin/rooms/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await onRefreshData();
        showToast('Consultation suite removed successfully');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Derived Statistics
  const totalRooms = rooms.length;
  const availableRooms = rooms.filter(r => r.status === 'available').length;
  const busyRooms = rooms.filter(r => r.status === 'occupied').length;
  const screenCount = [...new Set(rooms.map(r => r.displayScreenId).filter(Boolean))].length;
  const assignedDocsCount = rooms.filter(r => r.assignedDoctorId).length;

  // Filter and sort rooms
  const filteredRooms = rooms.filter(room => {
    const matchesSearch = room.roomNumber.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          room.roomName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (room.displayScreenId && room.displayScreenId.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesStatus = statusFilter === 'all' || room.status === statusFilter;

    return matchesSearch && matchesStatus;
  }).sort((a, b) => {
    if (sortBy === 'number-asc') return a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
    if (sortBy === 'name-asc') return a.roomName.localeCompare(b.roomName);
    return 0;
  });

  return (
    <div className="space-y-8 animate-fade-in" id="rooms-tab-root">
      
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-12 right-12 z-50 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-xl flex items-center gap-3 animate-fade-in border border-slate-800" id="toast-success-rooms">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold font-sans">{toastMessage}</span>
        </div>
      )}

      {/* 5 Top KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4" id="rooms-top-statistics">
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Suites</span>
            <span className="text-2xl font-display font-extrabold text-slate-900 mt-1 block">{totalRooms}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Physical rooms</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Available Suites</span>
            <span className="text-2xl font-display font-extrabold text-emerald-600 mt-1 block">{availableRooms}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Ready for patients</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Active / Busy</span>
            <span className="text-2xl font-display font-extrabold text-amber-600 mt-1 block">{busyRooms}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Sessions in progress</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Connected Screen IDs</span>
            <span className="text-2xl font-display font-extrabold text-slate-500 mt-1 block">{screenCount}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Smart TV display links</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between col-span-2 lg:col-span-1">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Assigned Doctors</span>
            <span className="text-2xl font-display font-extrabold text-blue-600 mt-1 block">{assignedDocsCount}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Mapped to physical suites</span>
        </div>
      </div>

      {/* Header Block with Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4" id="rooms-header-block">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            <span>Admin Center</span>
            <span>/</span>
            <span className="text-slate-600">Suites</span>
          </div>
          <h2 className="text-2xl font-display font-extrabold text-slate-900 tracking-tight">Consultation Rooms</h2>
          <p className="text-xs text-slate-500 mt-1">Configure clinical consultation suites, doctor links, and hardware television display identifiers.</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleOpenCreateModal}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer"
            id="btn-add-room"
          >
            <Plus className="h-4 w-4 stroke-[3px]" />
            <span>Add Consultation Room</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3" id="rooms-filter-toolbar">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search rooms by number, name, or hardware screen ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 hover:bg-slate-100/50 border border-slate-200 rounded-xl pl-9.5 pr-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
            id="search-room"
          />
          <Search className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 h-full w-5" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
            id="select-room-status-filter"
          >
            <option value="all">All Statuses</option>
            <option value="available">Available</option>
            <option value="occupied">Occupied</option>
            <option value="maintenance">Maintenance</option>
            <option value="inactive">Inactive / Closed</option>
          </select>

          <select
            value={sortBy}
            onChange={(e: any) => setSortBy(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
            id="select-room-sort-filter"
          >
            <option value="number-asc">Sort by: Room Number</option>
            <option value="name-asc">Sort by: Friendly Name</option>
          </select>

          <button
            onClick={handleRefresh}
            className={`p-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-all cursor-pointer flex items-center justify-center ${
              isRefreshing ? 'animate-spin text-blue-600' : ''
            }`}
            title="Refresh Rooms"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="w-full" id="rooms-main-grid">
        
        {/* Large Data Table */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col justify-between min-h-[400px]" id="rooms-table-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" id="rooms-table">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-4 px-6">Consultation Room</th>
                  <th className="py-4 px-6">Assigned Medical Specialty</th>
                  <th className="py-4 px-6">Primary Doctor</th>
                  <th className="py-4 px-6">Hardware Display Screen ID</th>
                  <th className="py-4 px-6 text-center">Status</th>
                  <th className="py-4 px-6 text-right rounded-r-lg">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredRooms.map(room => {
                  const dept = departments.find(d => d.id === room.departmentId);
                  const doc = doctors.find(d => d.id === room.assignedDoctorId);
                  
                  return (
                    <tr key={room.id} className="hover:bg-slate-50/40 transition-all group" id={`row-room-${room.id}`}>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                            <DoorOpen className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <span className="font-extrabold text-slate-900 text-[13px] block leading-snug">Suite {room.roomNumber}</span>
                            <span className="text-[10px] text-slate-400 block font-normal mt-0.5 line-clamp-1">
                              {room.roomName || 'Standard outpatient cabin'}
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
                        {doc ? (
                          <span className="font-bold text-slate-800 flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full shrink-0"></span>
                            {doc.name}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px] italic">Unassigned</span>
                        )}
                      </td>

                      <td className="py-4 px-6">
                        {room.displayScreenId ? (
                          <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg text-xs">
                            {room.displayScreenId}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px] italic">No display connected</span>
                        )}
                      </td>

                      <td className="py-4 px-6 text-center">
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-extrabold border uppercase ${
                          room.status === 'available'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                            : room.status === 'occupied'
                            ? 'bg-amber-50 text-amber-700 border-amber-100 animate-pulse'
                            : room.status === 'maintenance'
                            ? 'bg-blue-50 text-blue-700 border-blue-100'
                            : 'bg-slate-50 text-slate-500 border-slate-100'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${room.status === 'available' ? 'bg-emerald-600' : room.status === 'occupied' ? 'bg-amber-600' : 'bg-slate-500'}`}></span>
                          {room.status || 'available'}
                        </span>
                      </td>

                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleEditClick(room)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition-all cursor-pointer"
                            title="Edit consultation suite profile"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          
                          <button
                            onClick={() => handleDeleteRoom(room.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                            title="Delete consultation room"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredRooms.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-slate-400 text-xs">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Info className="h-8 w-8 text-slate-300" />
                        <span className="font-medium text-slate-500">No rooms match keywords.</span>
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
              Showing <strong>{filteredRooms.length}</strong> of <strong>{rooms.length}</strong> registered consultation rooms
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
        <div className="fixed inset-0 z-50 flex justify-end" id="room-slide-over">
          
          <div 
            onClick={() => setIsFormOpen(false)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300"
          />

          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col justify-between z-10 animate-fade-in border-l border-slate-100">
            
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <DoorOpen className="h-5 w-5 text-blue-600" />
                  {editingRoomId ? "Modify Room Profile" : "Add Consultation Room"}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Configure consultation cabin numbers, friendly designations, & screen links</p>
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
                <div className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-2xl text-xs flex items-start gap-2 animate-fade-in" id="room-error-alert">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span className="font-medium leading-relaxed">{error}</span>
                </div>
              )}

              <form id="room-slideover-form" className="space-y-4" onSubmit={handleSaveRoom}>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Room No.</label>
                    <input
                      type="text"
                      placeholder="e.g. 101"
                      value={roomNumber}
                      onChange={(e) => setRoomNumber(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      id="input-room-number"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Room Friendly Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Consultation Suite A"
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none"
                      id="input-room-name"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Assigned Specialty</label>
                    <select
                      value={roomDept}
                      onChange={(e) => setRoomDept(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2.5 text-xs text-slate-900 cursor-pointer font-bold"
                      id="select-room-dept"
                    >
                      <option value="">Unassigned</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Primary Physician</label>
                    <select
                      value={roomDoc}
                      onChange={(e) => setRoomDoc(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2.5 text-xs text-slate-900 cursor-pointer font-bold"
                      id="select-room-doc"
                    >
                      <option value="">Unassigned</option>
                      {doctors.map(doc => (
                        <option key={doc.id} value={doc.id}>{doc.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Hardware Display Screen ID</label>
                  <input
                    type="text"
                    placeholder="e.g. SCREEN_101_LED"
                    value={displayScreenId}
                    onChange={(e) => setDisplayScreenId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 uppercase font-mono"
                    id="input-display-screen-id"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Connects a TV display. Example: CARD_ROOM_1.</span>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Suite Current Status</label>
                  <select
                    value={roomStatus}
                    onChange={(e) => setRoomStatus(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900 cursor-pointer font-bold"
                    id="select-room-status"
                  >
                    <option value="available">Available / Serving Patients</option>
                    <option value="occupied">Occupied / Active Consultation</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="inactive">Inactive / Closed</option>
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
                form="room-slideover-form"
                disabled={saving}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                id="btn-save-room"
              >
                {saving ? 'Saving...' : editingRoomId ? 'Modify Suite' : 'Create Suite'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
