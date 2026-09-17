import React, { useState, useMemo } from 'react';
import { Search, PlusCircle, Pencil, Trash2, XCircle } from 'lucide-react';
import { ConsultationRoom, Doctor, Department } from '../types';
import { authFetch } from '../utils/authFetch';

interface Props { rooms: ConsultationRoom[]; doctors: Doctor[]; departments: Department[]; onRefreshData: () => Promise<void>; }

const STATUSES = ['available','occupied','maintenance','inactive'];
const EMPTY = { roomNumber:'', roomName:'', assignedDoctorId:'', departmentId:'', status:'available', displayScreenId:'' };

const statusBadge: Record<string, string> = {
  available: 'badge badge-available', occupied: 'badge badge-busy', maintenance: 'badge badge-break', inactive: 'badge badge-inactive',
};

export default function RoomsTab({ rooms, doctors, departments, onRefreshData }: Props) {
  const [search, setSearch]     = useState('');
  const [statusF, setStatusF]   = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState<string | null>(null);
  const [form, setForm]         = useState({ ...EMPTY });
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => rooms.filter(r => {
    if (statusF && r.status !== statusF) return false;
    if (search && !r.roomName.toLowerCase().includes(search.toLowerCase()) && !r.roomNumber.includes(search)) return false;
    return true;
  }), [rooms, search, statusF]);

  const openAdd  = () => { setForm({ ...EMPTY }); setEditId(null); setError(''); setShowForm(true); };
  const openEdit = (r: ConsultationRoom) => {
    setForm({ roomNumber: r.roomNumber, roomName: r.roomName, assignedDoctorId: r.assignedDoctorId ?? '', departmentId: r.departmentId ?? '', status: r.status, displayScreenId: r.displayScreenId ?? '' });
    setEditId(r.id); setError(''); setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditId(null); setError(''); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.roomNumber.trim() || !form.roomName.trim()) { setError('Room number and name are required.'); return; }
    setSaving(true); setError('');
    try {
      const url = editId ? `/api/admin/rooms/${editId}` : '/api/admin/rooms';
      const res = await authFetch(url, { method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, assignedDoctorId: form.assignedDoctorId || null, departmentId: form.departmentId || null }) });
      const data = await res.json();
      if (!res.ok) { setError(data.message ?? 'Failed.'); return; }
      await onRefreshData(); closeForm();
    } catch (err: any) { setError(err.message); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await authFetch(`/api/admin/rooms/${deleteId}`, { method: 'DELETE' });
    setDeleteId(null); await onRefreshData();
  };

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#AAACB0' }} />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search rooms…" className="search-input" />
          </div>
          <select value={statusF} onChange={e => setStatusF(e.target.value)} className="select" style={{ width: '140px' }}>
            <option value="">All statuses</option>
            {STATUSES.map(s => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s}</option>)}
          </select>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAdd}><PlusCircle size={13} /> Add room</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div className="empty-state"><div style={{ fontWeight: 500 }}>No rooms found</div></div>
        ) : (
          <table className="iq-table">
            <thead><tr><th>Room</th><th>Name</th><th>Department</th><th>Assigned doctor</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {filtered.map(r => {
                const doc  = doctors.find(d => d.id === r.assignedDoctorId);
                const dept = departments.find(d => d.id === r.departmentId);
                return (
                  <tr key={r.id}>
                    <td><span className="text-token" style={{ fontWeight: 700, color: '#29443A' }}>{r.roomNumber}</span></td>
                    <td style={{ fontWeight: 500, color: '#202124' }}>{r.roomName}</td>
                    <td style={{ color: '#54575C', fontSize: '0.8125rem' }}>{dept?.name ?? '—'}</td>
                    <td style={{ color: '#54575C', fontSize: '0.8125rem' }}>{doc?.name ?? '—'}</td>
                    <td><span className={statusBadge[r.status] ?? 'badge'}>{r.status}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}><Pencil size={12} /></button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setDeleteId(r.id)} style={{ color: '#C9826B' }}><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <>
          <div className="drawer-overlay" onClick={closeForm} />
          <div className="drawer animate-slide-in-right">
            <div className="drawer-header">
              <h3 style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#202124' }}>{editId ? 'Edit room' : 'Add room'}</h3>
              <button onClick={closeForm} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#AAACB0' }}><XCircle size={16} /></button>
            </div>
            <div className="drawer-body">
              {error && <div style={{ marginBottom: '16px', padding: '10px 12px', background: '#FCF4F2', border: '1px solid #E8B9A8', borderRadius: '8px', fontSize: '0.8125rem', color: '#7A3620' }}>{error}</div>}
              <form id="room-form" onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="field-label">Room number *</label><input value={form.roomNumber} onChange={e => setForm(f => ({ ...f, roomNumber: e.target.value }))} className="input" placeholder="101" /></div>
                  <div><label className="field-label">Room name *</label><input value={form.roomName} onChange={e => setForm(f => ({ ...f, roomName: e.target.value }))} className="input" placeholder="General Consult" /></div>
                </div>
                <div>
                  <label className="field-label">Department</label>
                  <select value={form.departmentId} onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))} className="select">
                    <option value="">None</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">Assigned doctor</label>
                  <select value={form.assignedDoctorId} onChange={e => setForm(f => ({ ...f, assignedDoctorId: e.target.value }))} className="select">
                    <option value="">None</option>
                    {doctors.filter(d => !form.departmentId || d.departmentId === form.departmentId).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="select">
                    {STATUSES.map(s => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s}</option>)}
                  </select>
                </div>
                <div><label className="field-label">Display screen ID</label><input value={form.displayScreenId} onChange={e => setForm(f => ({ ...f, displayScreenId: e.target.value }))} className="input" placeholder="Optional" /></div>
              </form>
            </div>
            <div className="drawer-footer">
              <button type="button" className="btn btn-ghost btn-sm" onClick={closeForm}>Cancel</button>
              <button type="submit" form="room-form" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </>
      )}

      {deleteId && (
        <div className="modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="modal" style={{ maxWidth: '360px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontWeight: 600, color: '#202124', marginBottom: '8px' }}>Delete room?</h3>
            <p style={{ fontSize: '0.875rem', color: '#54575C', marginBottom: '24px' }}>This action cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost btn-sm" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="btn btn-danger btn-sm" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
