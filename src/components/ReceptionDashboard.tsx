import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Search, PlusCircle, XCircle, ChevronDown, AlertTriangle } from 'lucide-react';
import { getPriorityWeight } from '../utils/priority';
import {
  Department, Doctor, Token, TokenStatus, Gender,
  QueueSettings, Patient, ReceptionUser, UserRole, TrackingDevice,
} from '../types';
import { authFetch } from '../utils/authFetch';

interface Props {
  departments:   Department[];
  doctors:       Doctor[];
  tokens:        Token[];
  patients:      Patient[];
  settings:      QueueSettings;
  devices?:      TrackingDevice[];
  onRefreshData: () => Promise<void>;
  onTogglePause: () => Promise<void>;
  currentUser?:  ReceptionUser | null;
}

export default memo(function ReceptionDashboard({
  departments, doctors, tokens, patients, settings,
  devices = [], onRefreshData, onTogglePause, currentUser,
}: Props) {

  const hasPriorityPerm = currentUser?.role === UserRole.ADMIN ||
    (currentUser?.permissions ?? []).includes('set_priority');

  // ── Optimistic tokens ─────────────────────────────────────────────────────
  const [optimisticTokens, setOptimisticTokens] = useState<Token[]>([]);
  const [actionInFlight, setActionInFlight]     = useState<Set<string>>(new Set());

  const setInFlight   = useCallback((id: string) => setActionInFlight(p => new Set(p).add(id)), []);
  const clearInFlight = useCallback((id: string) => setActionInFlight(p => { const n = new Set(p); n.delete(id); return n; }), []);

  // ── Filtered data ─────────────────────────────────────────────────────────
  const allowedDepts = useMemo(() => departments.filter(d => {
    if (!currentUser || currentUser.role === UserRole.ADMIN) return true;
    const ids = currentUser.assignedDepartmentIds ?? (currentUser.departmentId ? [currentUser.departmentId] : []);
    return ids.includes(d.id);
  }), [departments, currentUser]);

  const allowedDoctors = useMemo(() => doctors.filter(d => {
    if (!currentUser || currentUser.role === UserRole.ADMIN) return true;
    const ids = currentUser.assignedDepartmentIds ?? (currentUser.departmentId ? [currentUser.departmentId] : []);
    return ids.includes(d.departmentId);
  }), [doctors, currentUser]);

  const allowedTokens = useMemo(() => {
    const serverIds = new Set(tokens.map(t => t.id));
    const pending   = optimisticTokens.filter(t => !serverIds.has(t.id));
    const combined  = [...pending, ...tokens];
    if (!currentUser || currentUser.role === UserRole.ADMIN) return combined;
    const ids = currentUser.assignedDepartmentIds ?? (currentUser.departmentId ? [currentUser.departmentId] : []);
    return combined.filter(t => ids.includes(t.departmentId));
  }, [tokens, optimisticTokens, currentUser]);

  // ── Search / filter ───────────────────────────────────────────────────────
  const [search, setSearch]           = useState('');
  const [deptFilter, setDeptFilter]   = useState('');
  const [docFilter, setDocFilter]     = useState('');
  const [showForm, setShowForm]       = useState(false);

  // ── Form state ────────────────────────────────────────────────────────────
  const [phone, setPhone]       = useState('');
  const [pName, setPName]       = useState('');
  const [pEmail, setPEmail]     = useState('');
  const [pAge, setPAge]         = useState('');
  const [pGender, setPGender]   = useState<Gender>(Gender.MALE);
  const [deptId, setDeptId]     = useState('');
  const [docId, setDocId]       = useState('');
  const [reason, setReason]     = useState('');
  const [priority, setPriority] = useState('Normal');
  const [estTime, setEstTime]   = useState('');
  const [deviceId, setDeviceId] = useState('');

  const [registering, setRegistering] = useState(false);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formError, setFormError]     = useState('');

  // Auto-select single dept
  useEffect(() => {
    if (allowedDepts.length === 1) {
      setDeptFilter(allowedDepts[0].id);
      setDeptId(allowedDepts[0].id);
    }
  }, [allowedDepts]);

  // ── Memoised stats ────────────────────────────────────────────────────────
  const waitingCount   = useMemo(() => allowedTokens.filter(t => t.status === TokenStatus.WAITING).length, [allowedTokens]);
  const calledCount    = useMemo(() => allowedTokens.filter(t => t.status === TokenStatus.CALLED).length, [allowedTokens]);
  const completedCount = useMemo(() => allowedTokens.filter(t => t.status === TokenStatus.COMPLETED).length, [allowedTokens]);

  const activeCalledToken = useMemo(() =>
    allowedTokens
      .filter(t => t.status === TokenStatus.CALLED)
      .sort((a, b) => new Date(b.calledAt ?? 0).getTime() - new Date(a.calledAt ?? 0).getTime())[0] ?? null,
  [allowedTokens]);

  const filteredDoctorsForForm = useMemo(() =>
    allowedDoctors.filter(d =>
      ['active','available','busy'].includes(d.status) &&
      (!deptId || d.departmentId === deptId)
    ),
  [allowedDoctors, deptId]);

  const tokenStatsMap = useMemo(() => {
    const map = new Map<string, { wait: number; ahead: number }>();
    const byDoc = new Map<string, Token[]>();
    for (const t of allowedTokens) {
      if (t.status !== TokenStatus.WAITING) continue;
      const arr = byDoc.get(t.doctorId) ?? [];
      arr.push(t);
      byDoc.set(t.doctorId, arr);
    }
    byDoc.forEach((toks, docId) => {
      const doc = doctors.find(d => d.id === docId);
      const dur = doc?.avgConsultationTime ?? 15;
      toks.sort((a, b) => {
        const diff = getPriorityWeight(b.priority) - getPriorityWeight(a.priority);
        return diff !== 0 ? diff : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
      let acc = 0;
      toks.forEach((t, i) => {
        map.set(t.id, { wait: acc, ahead: i });
        acc += t.estimatedConsultationTime ?? dur;
      });
    });
    return map;
  }, [allowedTokens, doctors]);

  const sortedTokens = useMemo(() => {
    const lo = search.toLowerCase();
    const filtered = allowedTokens.filter(t => {
      const matchSearch = !search ||
        t.tokenNumber.toLowerCase().includes(lo) ||
        t.patientName.toLowerCase().includes(lo) ||
        t.patientMobile.includes(search);
      const matchDept = !deptFilter || t.departmentId === deptFilter;
      const matchDoc  = !docFilter  || t.doctorId     === docFilter;
      return matchSearch && matchDept && matchDoc;
    });
    const rank: Record<string, number> = {
      [TokenStatus.CALLED]: 1, [TokenStatus.WAITING]: 2,
      [TokenStatus.COMPLETED]: 3, [TokenStatus.SKIPPED]: 4, [TokenStatus.CANCELLED]: 5,
    };
    return filtered.sort((a, b) => {
      const rd = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
      if (rd !== 0) return rd;
      if (a.status === TokenStatus.WAITING) {
        const wd = getPriorityWeight(b.priority) - getPriorityWeight(a.priority);
        if (wd !== 0) return wd;
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [allowedTokens, search, deptFilter, docFilter]);

  // ── Phone lookup ──────────────────────────────────────────────────────────
  const handlePhoneLookup = useCallback(() => {
    if (!phone.trim()) return;
    const p = patients.find(pt => pt.mobile.replace(/\s+/g,'') === phone.trim().replace(/\s+/g,''));
    if (p) {
      setPName(p.name);
      if (p.email) setPEmail(p.email);
      setPAge(String(p.age));
      setPGender(p.gender);
      setFormSuccess(`Found: ${p.name}`);
      setTimeout(() => setFormSuccess(null), 3000);
    }
  }, [phone, patients]);

  // ── Generate token ────────────────────────────────────────────────────────
  const handleGenerateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pName.trim() || !phone.trim() || !pAge.trim() || !deptId || !docId) {
      setFormError('Please fill in all required fields.');
      return;
    }
    setRegistering(true);
    setFormError('');
    setFormSuccess(null);
    try {
      const res = await authFetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName: pName, patientMobile: phone, patientEmail: pEmail,
          patientAge: pAge, patientGender: pGender,
          departmentId: deptId, doctorId: docId, reasonForVisit: reason,
          priority, estimatedConsultationTime: estTime ? parseInt(estTime) : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (deviceId && data.token?.id) {
          await authFetch('/api/devices/assign', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId, tokenId: data.token.id }),
          }).catch(() => {});
        }
        setOptimisticTokens(prev => [data.token, ...prev.filter(t => t.id !== data.token.id)]);
        setFormSuccess(`Token ${data.token.tokenNumber} created`);
        setPName(''); setPhone(''); setPEmail(''); setPAge('');
        setReason(''); setPriority('Normal'); setEstTime(''); setDeviceId('');
        setShowForm(false);
        onRefreshData().catch(() => {});
      } else {
        setFormError(data.message ?? 'Failed to create token.');
      }
    } catch (err: any) {
      setFormError(err?.message ?? 'Connection error.');
    } finally {
      setRegistering(false);
    }
  };

  // ── Token actions ──────────────────────────────────────────────────────────
  const action = useCallback(async (tokenId: string, act: string) => {
    if (actionInFlight.has(tokenId)) return;
    setInFlight(tokenId);
    try {
      const res = await authFetch(`/api/tokens/${tokenId}/${act}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setFormError(data.message ?? `Failed to ${act} token.`);
      else onRefreshData().catch(() => {});
    } catch (err: any) {
      setFormError(err?.message ?? 'Error.');
    } finally {
      clearInFlight(tokenId);
    }
  }, [actionInFlight, setInFlight, clearInFlight, onRefreshData]);

  const handleCallNext = useCallback(async () => {
    const next = allowedTokens
      .filter(t => t.status === TokenStatus.WAITING)
      .sort((a, b) => {
        const w = getPriorityWeight(b.priority) - getPriorityWeight(a.priority);
        return w !== 0 ? w : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      })[0];
    if (!next) { setFormError('No patients waiting.'); setTimeout(() => setFormError(''), 3000); return; }
    await action(next.id, 'call');
  }, [allowedTokens, action]);

  const handleUnassignDevice = async (dId: string) => {
    await authFetch('/api/devices/unassign', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: dId }),
    });
    await onRefreshData();
  };

  // ── Priority label ─────────────────────────────────────────────────────────
  const priorityLabel = (p?: string) => {
    if (!p || p === 'Normal') return null;
    return <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#9C4829', marginLeft: '6px' }}>↑ {p}</span>;
  };

  const statusBadgeClass = (s: TokenStatus) => {
    switch (s) {
      case TokenStatus.WAITING:   return 'badge badge-waiting';
      case TokenStatus.CALLED:    return 'badge badge-called';
      case TokenStatus.COMPLETED: return 'badge badge-completed';
      case TokenStatus.SKIPPED:   return 'badge badge-skipped';
      case TokenStatus.CANCELLED: return 'badge badge-cancelled';
      default: return 'badge';
    }
  };

  return (
    <div className="max-w-6xl space-y-5">

      {/* ── Feedback banners ─────────────────────────────────────────────── */}
      {formError && (
        <div className="flex items-center gap-2" style={{ padding: '10px 14px', background: '#FCF4F2', border: '1px solid #E8B9A8', borderRadius: '8px' }}>
          <AlertTriangle size={14} style={{ color: '#B5603A', flexShrink: 0 }} />
          <span style={{ fontSize: '0.8125rem', color: '#7A3620' }}>{formError}</span>
          <button onClick={() => setFormError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#AAACB0', fontSize: '0.75rem' }}>✕</button>
        </div>
      )}
      {formSuccess && (
        <div style={{ padding: '10px 14px', background: '#E5F0EC', border: '1px solid #CCDFD8', borderRadius: '8px', fontSize: '0.8125rem', color: '#29443A', fontWeight: 500 }}>
          {formSuccess}
        </div>
      )}

      {/* ── Top strip: stats + actions ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">

        {/* Compact metrics */}
        <div className="flex items-center gap-1" style={{ background: '#FFFFFF', border: '1px solid #E7E5E4', borderRadius: '10px', padding: '6px 8px', gap: '0' }}>
          {[
            { v: waitingCount,   l: 'Waiting'   },
            { v: calledCount,    l: 'In consult' },
            { v: completedCount, l: 'Done today' },
          ].map((m, i) => (
            <React.Fragment key={m.l}>
              {i > 0 && <div style={{ width: '1px', height: '28px', background: '#E7E5E4', margin: '0 10px' }} />}
              <div style={{ padding: '0 10px', textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: '1.125rem', color: '#202124', lineHeight: 1 }}>{m.v}</div>
                <div style={{ fontSize: '0.625rem', color: '#8C8F95', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginTop: '2px' }}>{m.l}</div>
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            className="btn btn-ghost btn-sm"
            onClick={onTogglePause}
            title={settings.isPaused ? 'Resume queue' : 'Pause queue'}
          >
            {settings.isPaused ? 'Resume queue' : 'Pause queue'}
          </button>
          <button
            className="btn btn-call"
            onClick={handleCallNext}
          >
            Call next
          </button>
          <button
            className="btn btn-sage btn-sm"
            onClick={() => setShowForm(v => !v)}
          >
            <PlusCircle size={14} />
            Register patient
          </button>
        </div>
      </div>

      {/* ── Now serving banner ───────────────────────────────────────────── */}
      {activeCalledToken && (
        <div
          className="flex items-center justify-between"
          style={{ padding: '14px 18px', background: '#F2F8F5', border: '1px solid #CCDFD8', borderRadius: '10px' }}
        >
          <div className="flex items-center gap-4">
            <div>
              <div className="text-label" style={{ marginBottom: '2px' }}>Now serving</div>
              <div className="text-token" style={{ fontSize: '1.5rem', fontWeight: 700, color: '#29443A', lineHeight: 1 }}>
                {activeCalledToken.tokenNumber}
              </div>
            </div>
            <div style={{ height: '36px', width: '1px', background: '#CCDFD8' }} />
            <div>
              <div style={{ fontWeight: 500, fontSize: '0.9375rem', color: '#202124' }}>{activeCalledToken.patientName}</div>
              <div style={{ fontSize: '0.8125rem', color: '#6B6E73' }}>
                {activeCalledToken.departmentName} · {activeCalledToken.doctorName}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn btn-sage btn-sm" onClick={() => action(activeCalledToken.id, 'complete')} disabled={actionInFlight.has(activeCalledToken.id)}>
              {actionInFlight.has(activeCalledToken.id) ? '…' : 'Complete'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => action(activeCalledToken.id, 'recall')} disabled={actionInFlight.has(activeCalledToken.id)}>
              Recall
            </button>
          </div>
        </div>
      )}

      {/* ── Registration form ────────────────────────────────────────────── */}
      {showForm && (
        <div className="card animate-fade-in" style={{ borderColor: '#ADC5BA' }}>
          <div className="flex items-center justify-between mb-5">
            <h3 style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#202124' }}>Register patient</h3>
            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#AAACB0' }}>
              <XCircle size={16} />
            </button>
          </div>
          <form onSubmit={handleGenerateToken}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">

              {/* Phone */}
              <div>
                <label className="field-label">Mobile number *</label>
                <div className="flex gap-2">
                  <input type="text" value={phone} onChange={e => setPhone(e.target.value)} onBlur={handlePhoneLookup} placeholder="+91 98765 43210" className="input flex-1" />
                  <button type="button" onClick={handlePhoneLookup} className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}>Lookup</button>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="field-label">Full name *</label>
                <input type="text" value={pName} onChange={e => setPName(e.target.value)} placeholder="Patient name" className="input" />
              </div>

              {/* Age */}
              <div>
                <label className="field-label">Age *</label>
                <input type="number" value={pAge} onChange={e => setPAge(e.target.value)} placeholder="30" className="input" min="0" max="150" />
              </div>

              {/* Gender */}
              <div>
                <label className="field-label">Gender</label>
                <div className="flex gap-2">
                  {Object.values(Gender).map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setPGender(g)}
                      className="btn btn-sm flex-1"
                      style={{
                        background: pGender === g ? '#29443A' : '#FFFFFF',
                        color: pGender === g ? '#FFFFFF' : '#54575C',
                        borderColor: pGender === g ? '#29443A' : '#D6D3D1',
                        textTransform: 'capitalize',
                      }}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="field-label">Email</label>
                <input type="email" value={pEmail} onChange={e => setPEmail(e.target.value)} placeholder="Optional" className="input" />
              </div>

              {/* Reason */}
              <div>
                <label className="field-label">Reason for visit</label>
                <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Brief description" className="input" />
              </div>

              {/* Department */}
              <div>
                <label className="field-label">Department *</label>
                <select value={deptId} onChange={e => { setDeptId(e.target.value); setDocId(''); }} className="select">
                  <option value="">Select department</option>
                  {allowedDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              {/* Doctor */}
              <div>
                <label className="field-label">Doctor *</label>
                <select value={docId} onChange={e => setDocId(e.target.value)} className="select" disabled={!deptId}>
                  <option value="">Select doctor</option>
                  {filteredDoctorsForForm.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="field-label">Priority</label>
                <select value={priority} onChange={e => setPriority(e.target.value)} className="select" disabled={!hasPriorityPerm}>
                  <option value="Normal">Normal</option>
                  <option value="Senior Citizen">Senior Citizen</option>
                  <option value="Pregnant Woman">Pregnant Woman</option>
                  <option value="Person with Disability">Person with Disability</option>
                  <option value="VIP">VIP</option>
                </select>
              </div>

              {/* Est consult time */}
              <div>
                <label className="field-label">Est. consultation time</label>
                <select value={estTime} onChange={e => setEstTime(e.target.value)} className="select">
                  <option value="">Default</option>
                  {[5,10,15,20,30,45,60].map(n => <option key={n} value={String(n)}>{n} min</option>)}
                </select>
              </div>

              {/* Device */}
              {devices.filter(d => d.status === 'available').length > 0 && (
                <div className="sm:col-span-2">
                  <label className="field-label">Assign pager device</label>
                  <select value={deviceId} onChange={e => setDeviceId(e.target.value)} className="select">
                    <option value="">No pager</option>
                    {devices.filter(d => d.status === 'available').map(d => (
                      <option key={d.id} value={d.id}>{d.name ?? d.deviceCode}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={registering}>
                {registering ? 'Generating…' : 'Generate token'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#AAACB0' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search token, name, phone…"
            className="search-input"
          />
        </div>
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="select" style={{ width: '160px' }}>
          <option value="">All departments</option>
          {allowedDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={docFilter} onChange={e => setDocFilter(e.target.value)} className="select" style={{ width: '160px' }}>
          <option value="">All doctors</option>
          {allowedDoctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {(search || deptFilter || docFilter) && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { setSearch(''); setDeptFilter(allowedDepts.length === 1 ? allowedDepts[0].id : ''); setDocFilter(''); }}
          >
            Clear
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#AAACB0' }}>
          {sortedTokens.length} token{sortedTokens.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Queue table ───────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {sortedTokens.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
            </div>
            <div style={{ fontWeight: 500, color: '#202124' }}>No tokens found</div>
            <div style={{ fontSize: '0.8125rem', color: '#8C8F95' }}>
              {search || deptFilter || docFilter ? 'Try adjusting the filters.' : 'Register a patient to generate the first token.'}
            </div>
          </div>
        ) : (
          <table className="iq-table">
            <thead>
              <tr>
                <th>Token</th>
                <th>Patient</th>
                <th>Department</th>
                <th>Doctor</th>
                <th>Wait</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedTokens.map(t => {
                const stats = tokenStatsMap.get(t.id);
                const inFlight = actionInFlight.has(t.id);
                const isRow = t.status === TokenStatus.CALLED ? 'token-row-calling' : '';
                const isEmerg = t.isEmergency || (t.priority && t.priority !== 'Normal');
                return (
                  <tr key={t.id} className={`${isRow} ${isEmerg && t.status === TokenStatus.WAITING ? 'token-row-emergency' : ''}`}>
                    {/* Token # */}
                    <td>
                      <span className="text-token" style={{ fontWeight: 600, fontSize: '0.9375rem', color: t.status === TokenStatus.CALLED ? '#29443A' : '#202124' }}>
                        {t.tokenNumber}
                      </span>
                      {priorityLabel(t.priority)}
                    </td>

                    {/* Patient */}
                    <td>
                      <div style={{ fontWeight: 500, fontSize: '0.875rem', color: '#202124' }}>{t.patientName}</div>
                      <div style={{ fontSize: '0.75rem', color: '#8C8F95' }}>{t.patientMobile}</div>
                    </td>

                    {/* Dept */}
                    <td style={{ fontSize: '0.8125rem', color: '#54575C' }}>{t.departmentName}</td>

                    {/* Doctor */}
                    <td style={{ fontSize: '0.8125rem', color: '#54575C' }}>{t.doctorName}</td>

                    {/* Wait */}
                    <td style={{ fontSize: '0.8125rem', color: '#6B6E73' }}>
                      {t.status === TokenStatus.WAITING && stats
                        ? `~${stats.wait}m`
                        : t.status === TokenStatus.CALLED
                        ? 'In consult'
                        : '—'}
                    </td>

                    {/* Status */}
                    <td>
                      <span className={statusBadgeClass(t.status)}>{t.status}</span>
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: 'right' }}>
                      <div className="flex items-center justify-end gap-1.5">
                        {t.status === TokenStatus.WAITING && (
                          <>
                            <button className="btn btn-sage btn-sm" disabled={inFlight} onClick={() => action(t.id, 'call')}>
                              {inFlight ? '…' : 'Call'}
                            </button>
                            <button className="btn btn-ghost btn-sm" disabled={inFlight} onClick={() => action(t.id, 'skip')}>Skip</button>
                            <button
                              disabled={inFlight}
                              onClick={() => action(t.id, 'cancel')}
                              style={{ background: 'none', border: 'none', cursor: inFlight ? 'not-allowed' : 'pointer', color: '#AAACB0', padding: '4px' }}
                              title="Cancel"
                            >
                              <XCircle size={15} />
                            </button>
                          </>
                        )}
                        {t.status === TokenStatus.CALLED && (
                          <>
                            <button className="btn btn-primary btn-sm" disabled={inFlight} onClick={() => action(t.id, 'complete')}>
                              {inFlight ? '…' : 'Complete'}
                            </button>
                            <button className="btn btn-ghost btn-sm" disabled={inFlight} onClick={() => action(t.id, 'recall')}>Recall</button>
                            <button
                              disabled={inFlight}
                              onClick={() => action(t.id, 'cancel')}
                              style={{ background: 'none', border: 'none', cursor: inFlight ? 'not-allowed' : 'pointer', color: '#AAACB0', padding: '4px' }}
                              title="Cancel"
                            >
                              <XCircle size={15} />
                            </button>
                          </>
                        )}
                        {(t.status === TokenStatus.SKIPPED || t.status === TokenStatus.CANCELLED) && (
                          <button className="btn btn-ghost btn-sm" disabled={inFlight} onClick={() => action(t.id, 'call')}>
                            {inFlight ? '…' : 'Recall'}
                          </button>
                        )}
                        {t.deviceId && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleUnassignDevice(t.deviceId!)}
                            title="Return pager"
                            style={{ fontSize: '0.6875rem' }}
                          >
                            📟 Return
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
});
