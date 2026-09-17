import React, { useState, useMemo } from 'react';
import { Search, PlusCircle, Pencil, Trash2, XCircle } from 'lucide-react';
import { Doctor, Department } from '../types';
import { authFetch } from '../utils/authFetch';

interface Props { doctors: Doctor[]; departments: Department[]; onRefreshData: () => Promise<void>; }

const STATUSES = ['active', 'available', 'busy', 'break', 'leave', 'offline', 'inactive'];
const EMPTY_FORM = { name:'', departmentId:'', specialization:'', roomNumber:'', avgConsultationTime:15, startTime:'08:00', endTime:'17:00', maxPatientsPerDay:40, status:'active', isEnabled:true };

const badgeClass: Record<string, string> = {
  active:'badge badge-active', available:'badge badge-available', busy:'badge badge-busy',
  break:'badge badge-break', leave:'badge badge-inactive', offline:'badge badge-inactive', inactive:'badge badge-inactive',
};

export default function DoctorsTab({ doctors, departments, onRefreshData }: Props) {
  const [search, setSearch]   = useState('');
  const [statusF, setStatusF] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]   = useState<string | null>(null);
  const [form, setForm]       = useState({ ...EMPTY_FORM });
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => doctors.filter(d => {
    if (statusF && d.status !== statusF) return false;
    if (search && !d.name.toLowerCase().includes(search.toLowerCase()) && !d.specialization?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [doctors, search, statusF]);

  const openAdd  = () => { setForm({ ...EMPTY_FORM }); setEditId(null); setError(''); setShowForm(true); };
  const openEdit = (d: Doctor) => {
    setForm({ name: d.name, departmentId: d.departmentId, specialization: d.specialization ?? '', roomNumber: d.roomNumber ?? '', avgConsultationTime: d.avgConsultationTime ?? 15, startTime: d.startTime ?? '08:00', endTime: d.endTime ?? '17:00', maxPatientsPerDay: d.maxPatientsPerDay ?? 40, status: d.status, isEnabled: d.isEnabled ?? true });
    setEditId(d.id); setError(''); setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditId(null); setError(''); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.departmentId) { setError('Name and department are required.'); return; }
    setSaving(true); setError('');
    try {
      const url = editId ? `/api/admin/doctors/${editId}` : '/api/admin/doctors';
      const res = await authFetch(url, { method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) { setError(data.message ?? 'Failed.'); return; }
      await onRefreshData(); closeForm();
    } catch (err: any) { setError(err.message); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await authFetch(`/api/admin/doctors/${deleteId}`, { method: 'DELETE' });
    setDeleteId(null); await onRefreshData();
  };

  const handleQuickStatus = async (id: string, status: string) => {
    await authFetch(`/api/admin/doctors/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    await onRefreshData();
  };

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#AAACB0' }} />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search doctors…" className="search-input" />
          </div>
          <select value={statusF} onChange={e => setStatusF(e.target.value)} className="select" style={{ width: '140px' }}>
            <option value="">All statuses</option>
            {STATUSES.map(s => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s}</option>)}
          </select>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAdd}><PlusCircle size={13} /> Add doctor</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div className="empty-state"><div style={{ fontWeight: 500 }}>No doctors found</div></div>
        ) : (
          <table className="iq-table">
            <thead><tr><th>Name</th><th>Department</th><th>Specialization</th><th>Room</th><th>Avg. time</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {filtered.map(d => {
                const dept = departments.find(dep => dep.id === d.departmentId);
                return (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 500, color: '#202124' }}>{d.name}</td>
                    <td style={{ color: '#54575C' }}>{dept?.name ?? '—'}</td>
                    <td style={{ color: '#54575C', fontSize: '0.8125rem' }}>{d.specialization || '—'}</td>
                    <td style={{ color: '#54575C' }}>{d.roomNumber ? `Room ${d.roomNumber}` : '—'}</td>
                    <td style={{ color: '#54575C' }}>{d.avgConsultationTime ?? 15} min</td>
                    <td>
                      <select
                        value={d.status}
                        onChange={e => handleQuickStatus(d.id, e.target.value)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.6875rem', fontWeight: 600, color: '#29443A', outline: 'none', textTransform: 'uppercase', letterSpacing: '0.04em' }}
                      >
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(d)}><Pencil size={12} /></button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setDeleteId(d.id)} style={{ color: '#C9826B' }}><Trash2 size={12} /></button>
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
              <h3 style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#202124' }}>{editId ? 'Edit doctor' : 'Add doctor'}</h3>
              <button onClick={closeForm} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#AAACB0' }}><XCircle size={16} /></button>
            </div>
            <div className="drawer-body">
              {error && <div style={{ marginBottom: '16px', padding: '10px 12px', background: '#FCF4F2', border: '1px solid #E8B9A8', borderRadius: '8px', fontSize: '0.8125rem', color: '#7A3620' }}>{error}</div>}
              <form id="doc-form" onSubmit={handleSave} className="space-y-4">
                <div><label className="field-label">Full name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" placeholder="Dr. Sarah Jenkins" /></div>
                <div>
                  <label className="field-label">Department *</label>
                  <select value={form.departmentId} onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))} className="select">
                    <option value="">Select department</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div><label className="field-label">Specialization</label><input value={form.specialization} onChange={e => setForm(f => ({ ...f, specialization: e.target.value }))} className="input" placeholder="General Medicine" /></div>
                <div><label className="field-label">Room number</label><input value={form.roomNumber} onChange={e => setForm(f => ({ ...f, roomNumber: e.target.value }))} className="input" placeholder="101" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="field-label">Avg. consult (min)</label><input type="number" value={form.avgConsultationTime} onChange={e => setForm(f => ({ ...f, avgConsultationTime: parseInt(e.target.value) || 15 }))} className="input" min="1" max="120" /></div>
                  <div><label className="field-label">Max patients/day</label><input type="number" value={form.maxPatientsPerDay} onChange={e => setForm(f => ({ ...f, maxPatientsPerDay: parseInt(e.target.value) || 40 }))} className="input" min="1" /></div>
                  <div><label className="field-label">Start time</label><input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} className="input" /></div>
                  <div><label className="field-label">End time</label><input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} className="input" /></div>
                </div>
                <div>
                  <label className="field-label">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="select">
                    {STATUSES.map(s => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s}</option>)}
                  </select>
                </div>
              </form>
            </div>
            <div className="drawer-footer">
              <button type="button" className="btn btn-ghost btn-sm" onClick={closeForm}>Cancel</button>
              <button type="submit" form="doc-form" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </>
      )}

      {deleteId && (
        <div className="modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="modal" style={{ maxWidth: '360px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontWeight: 600, color: '#202124', marginBottom: '8px' }}>Delete doctor?</h3>
            <p style={{ fontSize: '0.875rem', color: '#54575C', marginBottom: '24px' }}>Their tokens will remain in the system.</p>
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
