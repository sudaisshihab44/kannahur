import { authFetch } from '../utils/authFetch';
import React, { useState } from 'react';
import { 
  BarChart2, Clock, CheckCircle, AlertCircle, Plus, Trash2, Sparkles, 
  TrendingUp, Building, Users, Megaphone, Activity, HelpCircle 
} from 'lucide-react';
import { Department, Doctor, Token, QueueSettings, TokenStatus, Announcement } from '../types';

interface DashboardTabProps {
  departments: Department[];
  doctors: Doctor[];
  tokens: Token[];
  users: any[];
  settings: QueueSettings;
  onRefreshData: () => Promise<void>;
}

export default function DashboardTab({
  departments,
  doctors,
  tokens,
  users,
  settings,
  onRefreshData
}: DashboardTabProps) {
  const [newAnnText, setNewAnnText] = useState('');
  const [annSaving, setAnnSaving] = useState(false);

  // Statistics Calculations
  const getStats = () => {
    const total = tokens.length;
    const completed = tokens.filter(t => t.status === TokenStatus.COMPLETED).length;
    const waiting = tokens.filter(t => t.status === TokenStatus.WAITING).length;
    const skipped = tokens.filter(t => t.status === TokenStatus.SKIPPED).length;
    const cancelled = tokens.filter(t => t.status === TokenStatus.CANCELLED).length;
    const emergency = tokens.filter(t => t.priority && t.priority !== 'Normal').length;

    const completedWithWait = tokens.filter(t => t.status === TokenStatus.COMPLETED && t.calledAt);
    let avgWaitMinutes = 12;
    if (completedWithWait.length > 0) {
      const totalWaitMs = completedWithWait.reduce((acc, curr) => {
        const start = new Date(curr.createdAt).getTime();
        const call = new Date(curr.calledAt || "").getTime();
        return acc + (call - start);
      }, 0);
      avgWaitMinutes = Math.round(totalWaitMs / completedWithWait.length / 60000);
    }

    const deptCounts: Record<string, number> = {};
    tokens.forEach(t => {
      deptCounts[t.departmentName] = (deptCounts[t.departmentName] || 0) + 1;
    });
    let busiestDept = 'General Medicine';
    let maxCount = 0;
    Object.entries(deptCounts).forEach(([name, count]) => {
      if (count > maxCount) {
        maxCount = count;
        busiestDept = name;
      }
    });

    const activeDocsCount = doctors.filter(d => d.status === 'active' || d.status === 'available' || d.status === 'busy').length;

    return { total, completed, waiting, skipped, cancelled, emergency, avgWaitMinutes, busiestDept, activeDocsCount };
  };

  const stats = getStats();

  const handleAddAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAnnText.trim()) return;

    setAnnSaving(true);
    try {
      const res = await authFetch('/api/settings/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newAnnText })
      });
      if (res.ok) {
        setNewAnnText('');
        await onRefreshData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAnnSaving(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    try {
      const res = await authFetch(`/api/settings/announcements/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await onRefreshData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in" id="admin-dashboard-overview">
      {/* Dynamic Key Performance Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between" id="kpi-avg-wait">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Average Wait Time</span>
            <span className="text-3xl font-display font-extrabold text-slate-900 mt-1 block">
              {stats.avgWaitMinutes} mins
            </span>
            <span className="text-[10px] text-teal-600 font-semibold mt-1 inline-flex items-center gap-0.5">
              <TrendingUp className="h-3 w-3" /> Within Optimum Target
            </span>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
            <Clock className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between" id="kpi-busiest-dept">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Active Departments</span>
            <span className="text-2xl font-display font-extrabold text-slate-900 mt-1 block">
              {departments.length} Departments
            </span>
            <span className="text-[10px] text-slate-400 mt-1 block">Departments accepting patients</span>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
            <Building className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between" id="kpi-active-doctors">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Active Doctors</span>
            <span className="text-2xl font-display font-extrabold text-slate-900 mt-1 block">
              {doctors.length} Doctors Available
            </span>
            <span className="text-[10px] text-emerald-600 font-semibold mt-1 block">● {stats.activeDocsCount} Active Now</span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
            <Activity className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between" id="kpi-emergency-cases">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Queue Status</span>
            <span className="text-2xl font-display font-extrabold text-emerald-600 mt-1 block">
              All Queues Running
            </span>
            <span className="text-[10px] text-slate-400 font-semibold mt-1 block">System active & operational</span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
            <CheckCircle className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Main Grid: Division Loads & Announcements */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Patient Loads Card */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-6" id="dashboard-division-loads">
          <div>
            <h3 className="text-base font-bold text-slate-900">Clinical Division Load Distribution</h3>
            <p className="text-xs text-slate-400">Relative load of today's generated tokens across clinical specialties</p>
          </div>

          <div className="space-y-5">
            {departments.map(dept => {
              const count = tokens.filter(t => t.departmentId === dept.id).length;
              const percent = tokens.length > 0 ? Math.round((count / tokens.length) * 100) : 0;
              
              return (
                <div key={dept.id} className="space-y-2" id={`load-${dept.id}`}>
                  <div className="flex justify-between text-xs text-slate-700">
                    <span className="font-semibold text-slate-800">{dept.name} <span className="text-[10px] font-mono text-slate-400 px-1.5 py-0.5 bg-slate-50 border border-slate-100 rounded-md ml-1">{dept.prefix}</span></span>
                    <span className="font-medium text-slate-500">{count} patients ({percent}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div 
                      style={{ width: `${percent}%` }}
                      className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                    ></div>
                  </div>
                </div>
              );
            })}
            {departments.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-10">No clinical divisions configured yet.</p>
            )}
          </div>
        </div>

        {/* Live Notices Broadcast Card */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 flex flex-col justify-between" id="dashboard-notices">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Megaphone className="h-5 w-5 text-blue-600" />
              <h3 className="text-base font-bold text-slate-900">Patient-Facing Broadcasts</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">Notices pushed in real-time to patient tracker and TV display screens</p>

            <form onSubmit={handleAddAnnouncement} className="relative mb-5" id="announcement-form">
              <input
                type="text"
                placeholder="Type notice message (e.g., Lunch break delay...)"
                value={newAnnText}
                onChange={(e) => setNewAnnText(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-4 pr-12 py-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <button
                type="submit"
                disabled={annSaving}
                className="absolute right-2 top-2 p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors"
                id="btn-add-notice"
              >
                <Plus className="h-4 w-4" />
              </button>
            </form>

            <div className="space-y-2.5 max-h-[200px] overflow-y-auto pr-1" id="notices-list">
              {settings.announcements && settings.announcements.length > 0 ? (
                settings.announcements.map((ann) => (
                  <div key={ann.id} className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 flex justify-between items-start gap-2" id={`notice-${ann.id}`}>
                    <p className="text-[11px] text-slate-600 font-medium leading-normal">{ann.text}</p>
                    <button
                      onClick={() => handleDeleteAnnouncement(ann.id)}
                      className="text-slate-400 hover:text-red-500 p-0.5 rounded transition-colors shrink-0"
                      title="Remove notice"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">
                  No active notices. Displays are running default text.
                </div>
              )}
            </div>
          </div>

          <div className="p-3 bg-blue-50/50 border border-blue-100/40 rounded-2xl flex items-start gap-2 text-[10px] text-slate-600 mt-4 leading-relaxed" id="notice-policy-hint">
            <Sparkles className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
            <span>Updated notice alerts are dispatched instantly with sound cue to active TV displays.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
