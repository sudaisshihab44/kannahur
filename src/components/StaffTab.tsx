import React, { useState, useMemo } from 'react';
import { Search, PlusCircle, Pencil, Trash2, XCircle } from 'lucide-react';
import { ReceptionUser, UserRole, Department } from '../types';
import { authFetch } from '../utils/authFetch';

interface Props { users: ReceptionUser[]; departments: Department[]; onRefreshData: () => Promise<void>; currentUser?: ReceptionUser | null; }

const ALL_PERMS = [
  { id: 'register_patient', label: 'Register patients' },
  { id: 'generate_token',   label: 'Generate tokens'  },
  { id: 'set_priority',     label: 'Set priority'     },
  { id: 'call_token',       label: 'Call token'       },
  { id: 'complete_token',   label: 'Complete token'   },
  { id: 'skip_token',       label: 'Skip token'       },
  { id: 'cancel_token',     label: 'Cancel token'     },
  { id: 'pause_queue',      label: 'Pause queue'      },
  { id: 'manage_hospital',  label: 'Manage hospital'  },
];

const DEFAULT_PERMS = ['register_patient','generate_token','call_token','complete_token'];
const EMPTY_FORM = { username:'', name:'', role:'receptionist', departmentId:'', assignedDepartmentIds:[] as string[], password:'', permissions: DEFAULT_PERMS, isActive: true };

export default function StaffTab({ users, departments, onRefreshData, currentUser }: Props) {
  const [search, setSearch]     = useState('');
  const [roleF, setRoleF]       = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState<string | null>(null);
  const [form, setForm]         = useState({ ...EMPTY_FORM });
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => users.filter(u => {
    if (roleF && u.role !== roleF) return false;
    if (search && !u.name.toLowerCase().includes(search.toLowerCase()) && !u.username.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [users, search, roleF]);

  const openAdd  = () => { setForm({ ...EMPTY_FORM, assignedDepartmentIds: [] }); setEditId(null); setError(''); setShowForm(true); };
  const openEdit = (u: ReceptionUser) => {
    setForm({ username: u.username, name: u.name, role: u.role, departmentId: u.departmentId ?? '', assignedDepartmentIds: u.assignedDepartmentIds ?? [], password: '', permissions: u.permissions ?? DEFAULT_PERMS, isActive: u.isActive ?? true });
    setEditId(u.id); setError(''); setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditId(null); setError(''); };

  const togglePerm = (p: string) => {
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(p) ? f.permissions.filter(x => x !== p) : [...f.permissions, p],
    }));
  };

  const toggleDept = (id: string) => {
    setForm(f => ({
      ...f,
      assignedDepartmentIds: f.assignedDepartmentIds.includes(id)
        ? f.assignedDepartmentIds.filter(x => x !== id)
        : [...f.assignedDepartmentIds, id],
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username.trim() || !form.name.trim()) { setError('Username and name are required.'); return; }
    if (!editId && !form.password) { setError('Password is required for new staff.'); return; }
    setSaving(true); setError('');
    try {
      const payload: any = { username: form.username, name: form.name, role: form.role, departmentId: form.departmentId || null, assignedDepartmentIds: form.assignedDepartmentIds, permissions: form.permissions, isActive: form.isActive };
      if (form.password) payload.password = form.password;
      const url = editId ? `/api/admin/staff/${editId}` : '/api/admin/staff';
      const res = await authFetch(url, { method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) { setError(data.message ?? 'Failed.'); return; }
      await onRefreshData(); closeForm();
    } catch (err: any) { setError(err.message); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await authFetch(`/api/admin/users/${deleteId}`, { method: 'DELETE' });
    setDeleteId(null); await onRefreshData();
  };

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#AAACB0' }} />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search staff…" className="search-input" />
          </div>
          <select value={roleF} onChange={e => setRoleF(e.target.value)} className="select" style={{ width: '130px' }}>
            <option value="">All roles</option>
            <option value="admin">Admin</option>
            <option value="receptionist">Reception</option>
          </select>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAdd}><PlusCircle size={13} /> Add staff</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div className="empty-state"><div style={{ fontWeight: 500 }}>No staff found</div></div>
        ) : (
          <table className="iq-table">
            <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Department</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {filtered.map(u => {
                const dept = departments.find(d => d.id === u.departmentId);
                const isSelf = u.id === currentUser?.id;
                return (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 500, color: '#202124' }}>
                      {u.name}
                      {isSelf && <span style={{ marginLeft: '6px', fontSize: '0.6875rem', color: '#8C8F95' }}>(you)</span>}
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: '#54575C', fontFamily: 'monospace' }}>{u.username}</td>
                    <td><span className={u.role === UserRole.ADMIN ? 'badge badge-emergency' : 'badge badge-active'}>{u.role}</span></td>
                    <td style={{ color: '#54575C', fontSize: '0.8125rem' }}>{dept?.name ?? (u.assignedDepartmentIds?.length ? `${u.assignedDepartmentIds.length} dept` : '—')}</td>
                    <td><span className={u.isActive === false ? 'badge badge-inactive' : 'badge badge-active'}>{u.isActive === false ? 'Inactive' : 'Active'}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}><Pencil size={12} /></button>
                        {!isSelf && <button className="btn btn-ghost btn-sm" onClick={() => setDeleteId(u.id)} style={{ color: '#C9826B' }}><Trash2 size={12} /></button>}
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
              <h3 style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#202124' }}>{editId ? 'Edit staff' : 'Add staff'}</h3>
              <button onClick={closeForm} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#AAACB0' }}><XCircle size={16} /></button>
            </div>
            <div className="drawer-body">
              {error && <div style={{ marginBottom: '16px', padding: '10px 12px', background: '#FCF4F2', border: '1px solid #E8B9A8', borderRadius: '8px', fontSize: '0.8125rem', color: '#7A3620' }}>{error}</div>}
              <form id="staff-form" onSubmit={handleSave} className="space-y-4">
                <div><label className="field-label">Full name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" placeholder="Claire Redfield" /></div>
                <div><label className="field-label">Username *</label><input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase() }))} className="input" placeholder="claire.r" disabled={!!editId} /></div>
                <div><label className="field-label">{editId ? 'New password (leave blank to keep)' : 'Password *'}</label><input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="input" placeholder={editId ? '••••••••' : 'Set password'} /></div>
                <div>
                  <label className="field-label">Role</label>
                  <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="select">
                    <option value="receptionist">Receptionist</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">Primary department</label>
                  <select value={form.departmentId} onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))} className="select">
                    <option value="">None (all departments)</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label" style={{ marginBottom: '8px' }}>Assigned departments</label>
                  <div className="space-y-1.5">
                    {departments.map(d => (
                      <label key={d.id} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={form.assignedDepartmentIds.includes(d.id)} onChange={() => toggleDept(d.id)} style={{ accentColor: '#6F8F7A', width: '14px', height: '14px' }} />
                        <span style={{ fontSize: '0.8125rem', color: '#54575C' }}>{d.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="field-label" style={{ marginBottom: '8px' }}>Permissions</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ALL_PERMS.map(p => (
                      <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={form.permissions.includes(p.id)} onChange={() => togglePerm(p.id)} style={{ accentColor: '#6F8F7A', width: '14px', height: '14px' }} />
                        <span style={{ fontSize: '0.75rem', color: '#54575C' }}>{p.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} style={{ accentColor: '#6F8F7A', width: '14px', height: '14px' }} />
                  <span style={{ fontSize: '0.8125rem', color: '#54575C' }}>Active account</span>
                </label>
              </form>
            </div>
            <div className="drawer-footer">
              <button type="button" className="btn btn-ghost btn-sm" onClick={closeForm}>Cancel</button>
              <button type="submit" form="staff-form" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </>
      )}

      {deleteId && (
        <div className="modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="modal" style={{ maxWidth: '360px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontWeight: 600, color: '#202124', marginBottom: '8px' }}>Remove staff member?</h3>
            <p style={{ fontSize: '0.875rem', color: '#54575C', marginBottom: '24px' }}>This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost btn-sm" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="btn btn-danger btn-sm" onClick={handleDelete}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
