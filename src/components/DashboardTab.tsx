import React, { useState, useMemo } from 'react';
import { TokenStatus } from '../types';
import type { Department, Doctor, Token, QueueSettings } from '../types';
import { authFetch } from '../utils/authFetch';

interface Props {
  departments: Department[];
  doctors:     Doctor[];
  tokens:      Token[];
  users:       any[];
  settings:    QueueSettings;
  onRefreshData: () => Promise<void>;
}

export default function DashboardTab({ departments, doctors, tokens, users, settings, onRefreshData }: Props) {

  const today = tokens; // already date-filtered by backend

  const stats = useMemo(() => {
    const total     = today.length;
    const waiting   = today.filter(t => t.status === TokenStatus.WAITING).length;
    const completed = today.filter(t => t.status === TokenStatus.COMPLETED).length;
    const called    = today.filter(t => t.status === TokenStatus.CALLED).length;
    const emergency = today.filter(t => t.isEmergency || (t.priority && t.priority !== 'Normal')).length;

    const completedWithTimes = today.filter(t => t.status === TokenStatus.COMPLETED && t.calledAt && t.createdAt);
    const avgWait = completedWithTimes.length > 0
      ? Math.round(completedWithTimes.reduce((sum, t) => {
          const wait = (new Date(t.calledAt!).getTime() - new Date(t.createdAt).getTime()) / 60000;
          return sum + wait;
        }, 0) / completedWithTimes.length)
      : 0;

    return { total, waiting, completed, called, emergency, avgWait };
  }, [today]);

  // Per-department queue summary
  const deptSummary = useMemo(() => {
    return departments.map(dept => {
      const deptTokens = today.filter(t => t.departmentId === dept.id);
      const waiting    = deptTokens.filter(t => t.status === TokenStatus.WAITING).length;
      const called     = deptTokens.filter(t => t.status === TokenStatus.CALLED);
      const calledToken = called[0];
      const doctor     = calledToken ? doctors.find(d => d.id === calledToken.doctorId) : null;
      return { dept, waiting, nowServing: calledToken?.tokenNumber ?? null, doctor: doctor?.name ?? null, room: doctor?.roomNumber ?? null };
    }).filter(d => d.waiting > 0 || d.nowServing);
  }, [departments, doctors, today]);

  // Announcements
  const [newAnn, setNewAnn]   = useState('');
  const [annSaving, setAnnSaving] = useState(false);

  const handleAddAnnouncement = async () => {
    if (!newAnn.trim()) return;
    setAnnSaving(true);
    try {
      await authFetch('/api/announcements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: newAnn.trim() }) });
      setNewAnn('');
      await onRefreshData();
    } finally { setAnnSaving(false); }
  };

  const handleDeleteAnn = async (id: string) => {
    await authFetch(`/api/announcements/${id}`, { method: 'DELETE' });
    await onRefreshData();
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6 max-w-5xl">

      {/* Header */}
      <div>
        <h2 style={{ fontWeight: 600, fontSize: '1.25rem', color: '#202124', marginBottom: '2px' }}>
          {greeting}
        </h2>
        <p style={{ fontSize: '0.875rem', color: '#6B6E73' }}>
          Here's today's hospital activity.
        </p>
      </div>

      {/* ── Metrics row ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Patients today',   value: stats.total,     sub: 'registered' },
          { label: 'Waiting',          value: stats.waiting,   sub: 'in queue' },
          { label: 'Being seen',       value: stats.called,    sub: 'in consultation' },
          { label: 'Completed',        value: stats.completed, sub: 'today' },
          { label: 'Avg. wait',        value: stats.avgWait > 0 ? `${stats.avgWait}m` : '—', sub: 'minutes' },
        ].map(m => (
          <div key={m.label} className="metric-block">
            <div className="metric-label">{m.label}</div>
            <div className="metric-value">{m.value}</div>
            <div className="metric-sub">{m.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Department queue table ─────────────────────────────────────── */}
      {deptSummary.length > 0 && (
        <div>
          <h3 style={{ fontWeight: 600, fontSize: '0.875rem', color: '#202124', marginBottom: '12px' }}>
            Live queue by department
          </h3>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="iq-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Waiting</th>
                  <th>Now serving</th>
                  <th>Doctor</th>
                  <th>Room</th>
                </tr>
              </thead>
              <tbody>
                {deptSummary.map(({ dept, waiting, nowServing, doctor, room }) => (
                  <tr key={dept.id}>
                    <td style={{ fontWeight: 500, color: '#202124' }}>{dept.name}</td>
                    <td>
                      {waiting > 0
                        ? <span style={{ fontWeight: 600, color: '#202124' }}>{waiting}</span>
                        : <span style={{ color: '#AAACB0' }}>—</span>}
                    </td>
                    <td>
                      {nowServing
                        ? <span className="text-token" style={{ fontSize: '0.875rem', color: '#29443A', fontWeight: 600 }}>{nowServing}</span>
                        : <span style={{ color: '#AAACB0' }}>—</span>}
                    </td>
                    <td style={{ color: '#54575C' }}>{doctor ?? '—'}</td>
                    <td style={{ color: '#54575C' }}>{room ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {deptSummary.length === 0 && (
        <div className="card">
          <div className="empty-state" style={{ padding: '32px 24px' }}>
            <div className="empty-state-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
            </div>
            <div style={{ fontWeight: 500, color: '#202124', marginBottom: '4px' }}>No active queues</div>
            <div style={{ fontSize: '0.8125rem', color: '#8C8F95' }}>No patients are currently waiting or in consultation.</div>
          </div>
        </div>
      )}

      {/* ── Doctor status ──────────────────────────────────────────────── */}
      {doctors.filter(d => d.status === 'active' || d.status === 'available' || d.status === 'busy').length > 0 && (
        <div>
          <h3 style={{ fontWeight: 600, fontSize: '0.875rem', color: '#202124', marginBottom: '12px' }}>
            Doctors on duty
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {doctors.filter(d => d.status !== 'inactive' && d.status !== 'leave' && d.status !== 'offline').map(doc => {
              const dept = departments.find(d => d.id === doc.departmentId);
              const docTokens = today.filter(t => t.doctorId === doc.id && t.status === TokenStatus.WAITING);
              return (
                <div key={doc.id} className="card card-sm" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    className="flex items-center justify-center rounded-full flex-shrink-0 font-semibold"
                    style={{ width: '36px', height: '36px', background: '#E5F0EC', color: '#29443A', fontSize: '0.75rem' }}
                  >
                    {doc.name.split(' ').slice(-1)[0].slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div style={{ fontWeight: 500, fontSize: '0.875rem', color: '#202124', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#8C8F95' }}>
                      {dept?.name ?? '—'} {doc.roomNumber ? `· Room ${doc.roomNumber}` : ''}
                    </div>
                  </div>
                  {docTokens.length > 0 && (
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#C9826B', flexShrink: 0 }}>
                      {docTokens.length} waiting
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Announcements ─────────────────────────────────────────────── */}
      <div>
        <h3 style={{ fontWeight: 600, fontSize: '0.875rem', color: '#202124', marginBottom: '12px' }}>
          Announcements
        </h3>
        <div className="card">
          {/* Add new */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newAnn}
              onChange={e => setNewAnn(e.target.value)}
              placeholder="Type an announcement for the TV board…"
              className="input flex-1"
              onKeyDown={e => e.key === 'Enter' && handleAddAnnouncement()}
            />
            <button
              className="btn btn-sage btn-sm"
              onClick={handleAddAnnouncement}
              disabled={annSaving || !newAnn.trim()}
            >
              {annSaving ? 'Saving…' : 'Add'}
            </button>
          </div>

          {/* List */}
          {settings.announcements.length === 0 ? (
            <p style={{ fontSize: '0.8125rem', color: '#AAACB0' }}>No active announcements.</p>
          ) : (
            <div className="space-y-2">
              {settings.announcements.map((ann: any) => (
                <div
                  key={ann.id}
                  className="flex items-start justify-between gap-3"
                  style={{ padding: '10px 12px', background: '#F7F4EE', borderRadius: '8px', border: '1px solid #EDE8DC' }}
                >
                  <p style={{ fontSize: '0.875rem', color: '#3C3F44', lineHeight: 1.5, flex: 1 }}>{ann.text}</p>
                  <button
                    onClick={() => handleDeleteAnn(ann.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#AAACB0', flexShrink: 0, padding: '2px', fontSize: '0.75rem' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
