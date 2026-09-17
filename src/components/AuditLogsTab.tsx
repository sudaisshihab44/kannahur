import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { QueueLog, Token, Department, ReceptionUser } from '../types';

interface Props { logs: QueueLog[]; tokens: Token[]; departments: Department[]; users: ReceptionUser[]; }

const ACTION_LABELS: Record<string, string> = {
  created: 'Token registered', called: 'Token called', completed: 'Consultation complete',
  skipped: 'Token skipped', cancelled: 'Token cancelled', recalled: 'Token recalled', assigned_depts: 'Departments assigned',
};

const ACTION_BADGE: Record<string, string> = {
  created:'badge badge-called', called:'badge badge-active', completed:'badge badge-completed',
  skipped:'badge badge-skipped', cancelled:'badge badge-cancelled', recalled:'badge badge-break', assigned_depts:'badge badge-inactive',
};

export default function AuditLogsTab({ logs, tokens, departments, users }: Props) {
  const [search, setSearch]     = useState('');
  const [actionF, setActionF]   = useState('');
  const [deptF, setDeptF]       = useState('');
  const [page, setPage]         = useState(1);
  const PER_PAGE = 25;

  const filtered = useMemo(() => {
    return logs.filter(l => {
      if (actionF && l.action !== actionF) return false;
      if (search && !l.tokenNumber?.toLowerCase().includes(search.toLowerCase())) return false;
      if (deptF) {
        const t = tokens.find(tk => tk.id === l.tokenId);
        if (!t || t.departmentId !== deptF) return false;
      }
      return true;
    });
  }, [logs, search, actionF, deptF, tokens]);

  const total = filtered.length;
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#AAACB0' }} />
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search token number…" className="search-input" />
        </div>
        <select value={actionF} onChange={e => { setActionF(e.target.value); setPage(1); }} className="select" style={{ width: '180px' }}>
          <option value="">All actions</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={deptF} onChange={e => { setDeptF(e.target.value); setPage(1); }} className="select" style={{ width: '160px' }}>
          <option value="">All departments</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#AAACB0' }}>{total} entries</span>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {paginated.length === 0 ? (
          <div className="empty-state"><div style={{ fontWeight: 500 }}>No log entries</div></div>
        ) : (
          <table className="iq-table">
            <thead><tr><th>Time</th><th>Token</th><th>Action</th><th>Patient</th><th>Operator</th></tr></thead>
            <tbody>
              {paginated.map(l => {
                const tok = tokens.find(t => t.id === l.tokenId);
                const usr = users.find(u => u.id === l.userId);
                return (
                  <tr key={l.id}>
                    <td style={{ fontSize: '0.75rem', color: '#8C8F95', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      {new Date(l.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} {new Date(l.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>
                      {l.tokenNumber
                        ? <span className="text-token" style={{ fontWeight: 600, fontSize: '0.875rem', color: '#29443A' }}>{l.tokenNumber}</span>
                        : <span style={{ color: '#AAACB0' }}>—</span>}
                    </td>
                    <td><span className={ACTION_BADGE[l.action] ?? 'badge badge-inactive'}>{ACTION_LABELS[l.action] ?? l.action}</span></td>
                    <td style={{ fontSize: '0.8125rem', color: '#54575C' }}>{tok?.patientName ?? '—'}</td>
                    <td style={{ fontSize: '0.8125rem', color: '#6B6E73' }}>{usr?.name ?? l.userId ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {total > PER_PAGE && (
        <div className="flex items-center justify-between">
          <span style={{ fontSize: '0.8125rem', color: '#8C8F95' }}>
            Page {page} of {Math.ceil(total / PER_PAGE)}
          </span>
          <div className="flex items-center gap-2">
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.min(Math.ceil(total / PER_PAGE), p + 1))} disabled={page >= Math.ceil(total / PER_PAGE)}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
