import React, { useState, useMemo } from 'react';
import { Search, PlusCircle, Pencil, Trash2, XCircle } from 'lucide-react';
import { Department, Doctor } from '../types';
import { authFetch } from '../utils/authFetch';

interface Props {
  departments: Department[];
  doctors:     Doctor[];
  onRefreshData: () => Promise<void>;
}

const EMPTY = { name: '', prefix: '', description: '', isEnabled: true, defaultConsultationTime: 15 };

export default function DepartmentsTab({ departments, doctors, onRefreshData }: Props) {
  const [search, setSearch]       = useState('');
  const [showForm, setShowForm]   = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [form, setForm]           = useState({ ...EMPTY });
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [deleteId, setDeleteId]   = useState<string | null>(null);

  const filtered = useMemo(() =>
    departments.filter(d => !search || d.name.toLowerCase().includes(search.toLowerCase()) || d.prefix.toLowerCase().includes(search.toLowerCase())),
  [departments, search]);

  const openAdd = () => { setForm({ ...EMPTY }); setEditId(null); setError(''); setShowForm(true); };
  const openEdit = (d: Department) => { setForm({ name: d.name, prefix: d.prefix, description: d.description ?? '', isEnabled: d.isEnabled ?? true, defaultConsultationTime: d.defaultConsultationTime ?? 15 }); setEditId(d.id); setError(''); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditId(null); setError(''); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.prefix.trim()) { setError('Name and prefix are required.'); return; }
    setSaving(true); setError('');
    try {
      const url  = editId ? `/api/admin/departments/${editId}` : '/api/admin/departments';
      const method = editId ? 'PUT' : 'POST';
      const res  = await authFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, prefix: form.prefix.toUpperCase() }) });
      const data = await res.json();
      if (!res.ok) { setError(data.message ?? 'Failed to save.'); return; }
      await onRefreshData();
      closeForm();
    } catch (err: any) { setError(err.message ?? 'Error.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await authFetch(`/api/admin/departments/${deleteId}`, { method: 'DELETE' });
    setDeleteId(null);
    await onRefreshData();
  };

  const doctorCount = (id: string) => doctors.filter(d => d.departmentId === id).length;

  return (
    <div className="max-w-4xl space-y-5">

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative">
          <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#AAACB0' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search departments…" className="search-input" />
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAdd}><PlusCircle size={13} /> Add department</button>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon"><Building size={20} /></div><div style={{ fontWeight: 500 }}>No departments</div></div>
        ) : (
          <table className="iq-table">
            <thead>
              <tr><th>Name</th><th>Prefix</th><th>Doctors</th><th>Default time</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.id}>
                  <td>
                    <div style={{ fontWeight: 500, color: '#202124' }}>{d.name}</div>
                    {d.description && <div style={{ fontSize: '0.75rem', color: '#8C8F95' }}>{d.description}</div>}
                  </td>
                  <td><span className="text-token" style={{ fontSize: '0.8125rem', color: '#29443A', fontWeight: 600 }}>{d.prefix}</span></td>
                  <td style={{ color: '#54575C' }}>{doctorCount(d.id)}</td>
                  <td style={{ color: '#54575C' }}>{d.defaultConsultationTime ?? 15} min</td>
                  <td><span className={d.isEnabled === false ? 'badge badge-inactive' : 'badge badge-active'}>{d.isEnabled === false ? 'Disabled' : 'Active'}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="flex items-center justify-end gap-1.5">
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(d)}><Pencil size={12} /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setDeleteId(d.id)} style={{ color: '#C9826B' }}><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Form drawer */}
      {showForm && (
        <>
          <div className="drawer-overlay" onClick={closeForm} />
          <div className="drawer animate-slide-in-right">
            <div className="drawer-header">
              <h3 style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#202124' }}>{editId ? 'Edit department' : 'Add department'}</h3>
              <button onClick={closeForm} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#AAACB0' }}><XCircle size={16} /></button>
            </div>
            <div className="drawer-body">
              {error && <div style={{ marginBottom: '16px', padding: '10px 12px', background: '#FCF4F2', border: '1px solid #E8B9A8', borderRadius: '8px', fontSize: '0.8125rem', color: '#7A3620' }}>{error}</div>}
              <form id="dept-form" onSubmit={handleSave} className="space-y-4">
                <div><label className="field-label">Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" placeholder="General Medicine" /></div>
                <div><label className="field-label">Prefix *</label><input value={form.prefix} onChange={e => setForm(f => ({ ...f, prefix: e.target.value.toUpperCase() }))} className="input" placeholder="GEN" maxLength={8} /></div>
                <div><label className="field-label">Description</label><input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input" placeholder="Optional" /></div>
                <div><label className="field-label">Default consult time (min)</label><input type="number" value={form.defaultConsultationTime} onChange={e => setForm(f => ({ ...f, defaultConsultationTime: parseInt(e.target.value) || 15 }))} className="input" min="1" max="120" /></div>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={form.isEnabled} onChange={e => setForm(f => ({ ...f, isEnabled: e.target.checked }))} style={{ width: '15px', height: '15px', accentColor: '#6F8F7A' }} />
                  <span style={{ fontSize: '0.8125rem', color: '#54575C' }}>Active</span>
                </label>
              </form>
            </div>
            <div className="drawer-footer">
              <button type="button" className="btn btn-ghost btn-sm" onClick={closeForm}>Cancel</button>
              <button type="submit" form="dept-form" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="modal" style={{ maxWidth: '360px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontWeight: 600, color: '#202124', marginBottom: '8px' }}>Delete department?</h3>
            <p style={{ fontSize: '0.875rem', color: '#54575C', marginBottom: '24px' }}>This action cannot be undone. Tokens for this department will remain.</p>
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

function Building({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4"/></svg>;
}
