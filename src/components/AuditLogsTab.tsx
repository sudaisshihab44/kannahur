import React, { useState } from 'react';
import { 
  Search, Calendar, User, Building, AlertCircle, FileText, CheckCircle,
  Clock, ShieldAlert, Sparkles, ChevronLeft, ChevronRight, HelpCircle
} from 'lucide-react';
import { QueueLog, Token, Department, ReceptionUser } from '../types';

interface AuditLogsTabProps {
  logs: QueueLog[];
  tokens: Token[];
  departments: Department[];
  users: ReceptionUser[];
}

export default function AuditLogsTab({
  logs = [],
  tokens = [],
  departments = [],
  users = []
}: AuditLogsTabProps) {
  const [filterUser, setFilterUser] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterDate, setFilterDate] = useState('');

  // Human readable description mapping for audit actions
  const getActionDescription = (action: string, tokenNum: string) => {
    switch (action) {
      case 'created': return `Registered Patient & Generated Token ${tokenNum}`;
      case 'called': return `Called Token ${tokenNum} to Consultation Suite`;
      case 'completed': return `Completed Examination for Token ${tokenNum}`;
      case 'skipped': return `Marked Token ${tokenNum} as Delayed/No-Show`;
      case 'cancelled': return `Cancelled Registration Token ${tokenNum}`;
      case 'recalled': return `Re-called/Recalled Token ${tokenNum} to television display`;
      case 'assigned_depts': return tokenNum;
      default: return `Executed action: ${action} on Token ${tokenNum}`;
    }
  };

  const getActionBadgeColor = (action: string) => {
    switch (action) {
      case 'created': return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'called': return 'bg-amber-50 text-amber-700 border-amber-100 animate-pulse';
      case 'completed': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'skipped': return 'bg-yellow-50 text-yellow-700 border-yellow-100';
      case 'cancelled': return 'bg-rose-50 text-rose-700 border-rose-100';
      case 'assigned_depts': return 'bg-purple-50 text-purple-700 border-purple-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  const filteredLogs = logs.filter(log => {
    // 1. User Filter
    if (filterUser && log.userId !== filterUser) return false;

    // Retrieve Token details for relation lookups (e.g. department)
    const token = tokens.find(t => t.id === log.tokenId);

    // 2. Department Filter
    if (filterDept && token?.departmentId !== filterDept) return false;

    // 3. Action Filter
    if (filterAction && log.action !== filterAction) return false;

    // 4. Date Filter
    if (filterDate) {
      const logDateStr = new Date(log.timestamp).toISOString().split('T')[0];
      if (logDateStr !== filterDate) return false;
    }

    return true;
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Statistics
  const totalLogs = logs.length;
  const createdLogs = logs.filter(l => l.action === 'created').length;
  const calledLogs = logs.filter(l => l.action === 'called' || l.action === 'recalled').length;
  const completedLogs = logs.filter(l => l.action === 'completed').length;
  const skipCancelLogs = logs.filter(l => l.action === 'skipped' || l.action === 'cancelled').length;

  return (
    <div className="space-y-8 animate-fade-in" id="audit-logs-tab-root">
      
      {/* 5 Top KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4" id="audit-top-statistics">
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Log Volume</span>
            <span className="text-2xl font-display font-extrabold text-slate-900 mt-1 block">{totalLogs}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Full historical logs</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Registrations</span>
            <span className="text-2xl font-display font-extrabold text-blue-600 mt-1 block">{createdLogs}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">New patient tokens</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Calls & Recalls</span>
            <span className="text-2xl font-display font-extrabold text-amber-600 mt-1 block">{calledLogs}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Doctor room calls</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Completed Cases</span>
            <span className="text-2xl font-display font-extrabold text-emerald-600 mt-1 block">{completedLogs}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Fully resolved logs</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between col-span-2 lg:col-span-1">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Bypass & Cancels</span>
            <span className="text-2xl font-display font-extrabold text-slate-500 mt-1 block">{skipCancelLogs}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Skipped/revoked tokens</span>
        </div>
      </div>

      {/* Header Block */}
      <div>
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
          <span>Admin Center</span>
          <span>/</span>
          <span className="text-slate-600 font-sans">Audit Logs</span>
        </div>
        <h2 className="text-2xl font-display font-extrabold text-slate-900 tracking-tight">Security Audit Logs</h2>
        <p className="text-xs text-slate-500 mt-1">Read-only, cryptographically ordered logs tracking active patient registrations, room summons, & operator transactions.</p>
      </div>

      {/* Search & Filters Bar */}
      <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4" id="audit-filters">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-slate-400" /> Date Filter
          </label>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-bold"
            id="filter-audit-date"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <User className="h-3.5 w-3.5 text-slate-400" /> Authorized Operator
          </label>
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2.5 text-xs text-slate-900 focus:outline-none font-bold cursor-pointer"
            id="filter-audit-user"
          >
            <option value="">All Users...</option>
            <option value="admin">Chief Admin (admin)</option>
            <option value="reception">Registrar (reception)</option>
            {users.map(u => (
              <option key={u.id} value={u.username}>{u.name} ({u.username})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Building className="h-3.5 w-3.5 text-slate-400" /> Clinical Division
          </label>
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2.5 text-xs text-slate-900 focus:outline-none font-bold cursor-pointer"
            id="filter-audit-dept"
          >
            <option value="">All Divisions...</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Search className="h-3.5 w-3.5 text-slate-400" /> Action Category
          </label>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2.5 text-xs text-slate-900 focus:outline-none font-bold cursor-pointer"
            id="filter-audit-action"
          >
            <option value="">All actions...</option>
            <option value="created">Created (Registered)</option>
            <option value="called">Called</option>
            <option value="completed">Completed</option>
            <option value="skipped">Skipped (No-Show)</option>
            <option value="cancelled">Cancelled</option>
            <option value="recalled">Recalled</option>
          </select>
        </div>
      </div>

      {/* Logs Results Table */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col justify-between min-h-[400px]" id="audit-logs-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse" id="audit-logs-table">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-4 px-6">Timestamp / Date</th>
                <th className="py-4 px-6">Authorized User</th>
                <th className="py-4 px-6">Specialty Desk</th>
                <th className="py-4 px-6">Executed Audit Action Log</th>
                <th className="py-4 px-6 text-right rounded-r-lg">Event Tag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {filteredLogs.map(log => {
                const token = tokens.find(t => t.id === log.tokenId);
                const dept = token ? departments.find(d => d.id === token.departmentId) : null;
                const userObj = users.find(u => u.username === log.userId) || { name: log.userId === 'admin' ? 'Chief Administrator' : log.userId === 'reception' ? 'Senior Registrar' : log.userId || 'System Automator' };
                
                const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const dateStr = new Date(log.timestamp).toLocaleDateString([], { month: 'short', day: '2-digit' });

                return (
                  <tr key={log.id} className="hover:bg-slate-50/40 transition-all font-mono text-slate-600" id={`row-log-${log.id}`}>
                    <td className="py-4 px-6 whitespace-nowrap text-slate-900 font-sans">
                      <span className="font-extrabold">{dateStr}</span> <span className="text-slate-400 ml-1 font-normal">• {timeStr}</span>
                    </td>
                    <td className="py-4 px-6 font-bold text-slate-800 whitespace-nowrap font-sans">
                      {userObj.name}
                    </td>
                    <td className="py-4 px-6 font-bold font-sans">
                      {dept ? dept.name : <span className="text-slate-400 font-normal italic">All Desks</span>}
                    </td>
                    <td className="py-4 px-6 text-slate-900 font-sans font-medium">
                      {getActionDescription(log.action, log.tokenNumber)}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[9px] font-extrabold uppercase border ${getActionBadgeColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-slate-400 text-xs font-sans">
                    <div className="flex flex-col items-center gap-2 justify-center">
                      <FileText className="h-8 w-8 text-slate-300" />
                      <span className="font-medium text-slate-500">No matching audit logs found. Adjust filters or generate active tokens.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="p-5 bg-slate-50/60 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-3">
          <span className="text-[11px] text-slate-400 font-medium font-sans flex items-center gap-1.5">
            <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>Audit trails are read-only, cryptographically ordered logs compliant with clinic security guidelines.</span>
          </span>

          <div className="flex items-center gap-1 font-sans">
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
  );
}
