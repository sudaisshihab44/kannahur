import React, { useState } from 'react';
import { 
  BarChart2, TrendingUp, Users, CheckCircle, Clock, AlertTriangle, 
  Download, Calendar, Award, Activity, Heart, ShieldAlert,
  ChevronDown, FileText, CheckCircle2, AlertCircle, Sparkles, HelpCircle
} from 'lucide-react';
import { Token, Doctor, Department, TokenStatus } from '../types';

interface ReportsTabProps {
  tokens: Token[];
  doctors: Doctor[];
  departments: Department[];
}

export default function ReportsTab({
  tokens,
  doctors,
  departments
}: ReportsTabProps) {
  const [selectedReportRange, setSelectedReportRange] = useState<'today' | 'weekly' | 'monthly'>('today');

  // Filter tokens based on range
  const getFilteredTokens = () => {
    const now = new Date();
    return tokens.filter(t => {
      const created = new Date(t.createdAt);
      if (selectedReportRange === 'today') {
        return created.toDateString() === now.toDateString();
      } else if (selectedReportRange === 'weekly') {
        const diff = now.getTime() - created.getTime();
        return diff <= 7 * 24 * 60 * 60 * 1000;
      } else {
        const diff = now.getTime() - created.getTime();
        return diff <= 30 * 24 * 60 * 60 * 1000;
      }
    });
  };

  const activeTokens = getFilteredTokens();

  // Dynamic Metrics Calculations
  const totalPatients = activeTokens.length;
  const completedCount = activeTokens.filter(t => t.status === TokenStatus.COMPLETED).length;
  const waitingCount = activeTokens.filter(t => t.status === TokenStatus.WAITING).length;
  const skippedCount = activeTokens.filter(t => t.status === TokenStatus.SKIPPED).length;
  const cancelledCount = activeTokens.filter(t => t.status === TokenStatus.CANCELLED).length;
  const emergencyCount = activeTokens.filter(t => t.priority && t.priority !== 'Normal').length;

  // Average wait duration
  const completedWithWait = activeTokens.filter(t => t.status === TokenStatus.COMPLETED && t.calledAt);
  let avgWaitMinutes = 12;
  if (completedWithWait.length > 0) {
    const totalWait = completedWithWait.reduce((acc, curr) => {
      const start = new Date(curr.createdAt).getTime();
      const call = new Date(curr.calledAt || "").getTime();
      return acc + (call - start);
    }, 0);
    avgWaitMinutes = Math.round(totalWait / completedWithWait.length / 60000);
  }

  // Calculate Peak Hours
  const getPeakHours = () => {
    const hoursCount: Record<number, number> = {};
    activeTokens.forEach(t => {
      const hr = new Date(t.createdAt).getHours();
      hoursCount[hr] = (hoursCount[hr] || 0) + 1;
    });
    let peakHr = 9;
    let maxCount = 0;
    Object.entries(hoursCount).forEach(([hr, count]) => {
      if (count > maxCount) {
        maxCount = count;
        peakHr = parseInt(hr);
      }
    });
    const formatHr = (h: number) => {
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayH = h % 12 || 12;
      return `${displayH}:00 ${ampm}`;
    };
    return `${formatHr(peakHr)} - ${formatHr(peakHr + 1)}`;
  };

  const peakHours = totalPatients > 0 ? getPeakHours() : "09:00 AM - 10:00 AM";

  // Department Performance
  const getDeptPerformance = () => {
    return departments.map(dept => {
      const deptTokens = activeTokens.filter(t => t.departmentId === dept.id);
      const total = deptTokens.length;
      const completed = deptTokens.filter(t => t.status === TokenStatus.COMPLETED).length;
      const skipped = deptTokens.filter(t => t.status === TokenStatus.SKIPPED).length;
      const completedWithWait = deptTokens.filter(t => t.status === TokenStatus.COMPLETED && t.calledAt);
      
      let deptAvgWait = 15;
      if (completedWithWait.length > 0) {
        const totalWait = completedWithWait.reduce((acc, curr) => {
          const start = new Date(curr.createdAt).getTime();
          const call = new Date(curr.calledAt || "").getTime();
          return acc + (call - start);
        }, 0);
        deptAvgWait = Math.round(totalWait / completedWithWait.length / 60000);
      }

      return {
        id: dept.id,
        name: dept.name,
        prefix: dept.prefix,
        total,
        completed,
        skipped,
        avgWait: deptAvgWait
      };
    });
  };

  const deptPerformance = getDeptPerformance();

  // Doctor Performance
  const getDocPerformance = () => {
    return doctors.map(doc => {
      const docTokens = activeTokens.filter(t => t.doctorId === doc.id);
      const total = docTokens.length;
      const completed = docTokens.filter(t => t.status === TokenStatus.COMPLETED).length;
      const skipped = docTokens.filter(t => t.status === TokenStatus.SKIPPED).length;
      const activeTime = docTokens.filter(t => t.status === TokenStatus.COMPLETED && t.calledAt && t.completedAt);
      
      let avgConsult = 14;
      if (activeTime.length > 0) {
        const totalConsult = activeTime.reduce((acc, curr) => {
          const start = new Date(curr.calledAt || "").getTime();
          const end = new Date(curr.completedAt || "").getTime();
          return acc + (end - start);
        }, 0);
        avgConsult = Math.round(totalConsult / activeTime.length / 60000);
      }

      return {
        id: doc.id,
        name: doc.name,
        specialization: doc.specialization,
        total,
        completed,
        skipped,
        avgConsult
      };
    });
  };

  const docPerformance = getDocPerformance();

  // Export handlers
  const triggerExport = (type: 'daily' | 'monthly') => {
    const content = JSON.stringify({
      reportType: type,
      generatedAt: new Date().toISOString(),
      summary: {
        totalPatients,
        completedCount,
        waitingCount,
        skippedCount,
        cancelledCount,
        emergencyCount,
        avgWaitMinutes,
        peakHours
      },
      departments: deptPerformance,
      doctors: docPerformance,
      rawTokens: activeTokens
    }, null, 2);

    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `InclusyQ_Export_${type}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-8 animate-fade-in" id="reports-and-analytics-root">
      
      {/* Upper Navigation & Export Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-100 shadow-sm" id="reports-top-controls">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            <span>Admin Center</span>
            <span>/</span>
            <span className="text-slate-600 font-sans">Business Intelligence</span>
          </div>
          <h2 className="text-2xl font-display font-extrabold text-slate-900 tracking-tight">Clinical Audits & Analytics</h2>
          <p className="text-xs text-slate-500 mt-1">Real-time statistics on patient flow metrics, waiting times, and consultation durations.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="bg-slate-50 border border-slate-200 p-1 rounded-xl flex items-center">
            {(['today', 'weekly', 'monthly'] as const).map(range => (
              <button
                key={range}
                onClick={() => setSelectedReportRange(range)}
                className={`px-4 py-2 text-[10px] font-extrabold rounded-lg uppercase tracking-wider transition-all cursor-pointer ${
                  selectedReportRange === range 
                    ? 'bg-white text-blue-600 shadow-xs border border-slate-100' 
                    : 'text-slate-400 hover:text-slate-800'
                }`}
              >
                {range}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => triggerExport('daily')}
              className="px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer border border-blue-100"
              id="btn-daily-export"
            >
              <Download className="h-4 w-4 shrink-0" />
              <span>Export Daily JSON</span>
            </button>

            <button
              onClick={() => triggerExport('monthly')}
              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer"
              id="btn-monthly-export"
            >
              <Download className="h-4 w-4 shrink-0" />
              <span>Export Monthly Report</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid of 8 Beautiful Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in" id="reports-kpi-grid">
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Outpatient Bookings</span>
            <span className="text-3xl font-display font-extrabold text-slate-900 mt-1 block">{totalPatients}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Total registered patients</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Completed Sessions</span>
            <span className="text-3xl font-display font-extrabold text-emerald-600 mt-1 block">{completedCount}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Examined & completed</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">In-Queue Waiting</span>
            <span className="text-3xl font-display font-extrabold text-blue-600 mt-1 block">{waitingCount}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Currently inside lobby</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">No-Shows (Skipped)</span>
            <span className="text-3xl font-display font-extrabold text-amber-600 mt-1 block">{skippedCount}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Awaiting secondary recall</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Cancelled Tokens</span>
            <span className="text-3xl font-display font-extrabold text-slate-500 mt-1 block">{cancelledCount}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Discarded/revoked tokens</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Priority Patients</span>
            <span className="text-3xl font-display font-extrabold text-rose-600 mt-1 block">{emergencyCount}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Special care priorities</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Average Wait Duration</span>
            <span className="text-3xl font-display font-extrabold text-indigo-600 mt-1 block">{avgWaitMinutes} min</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Registration to call average</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Peak Outpatient Load</span>
            <span className="text-sm font-display font-extrabold text-slate-800 mt-3 block">{peakHours}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2.5 block font-medium">Max registration rate hour</span>
        </div>
      </div>

      {/* Grid of Tables & Lists: Department and Doctor audits */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="reports-tables-grid">
        
        {/* Department Performance Table */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col justify-between" id="report-dept-perf">
          <div>
            <div className="p-6 border-b border-slate-100 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Clinical Specialty Indexes</h3>
                <p className="text-xs text-slate-400">Wait ratios, skipped tokens, and average examination times by department</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/70 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    <th className="py-4 px-6">Division</th>
                    <th className="py-4 px-6 text-center">Total Bookings</th>
                    <th className="py-4 px-6 text-center">Examined</th>
                    <th className="py-4 px-6 text-center">No-Show</th>
                    <th className="py-4 px-6 text-right">Avg Wait Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {deptPerformance.map(dept => (
                    <tr key={dept.id} className="hover:bg-slate-50/30 transition-all">
                      <td className="py-4 px-6 font-extrabold text-slate-900">
                        {dept.name} 
                        <span className="text-[10px] font-mono font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md ml-2 border border-blue-100">
                          {dept.prefix}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center font-bold">{dept.total}</td>
                      <td className="py-4 px-6 text-center text-emerald-600 font-extrabold">{dept.completed}</td>
                      <td className="py-4 px-6 text-center text-amber-600 font-bold">{dept.skipped}</td>
                      <td className="py-4 px-6 text-right font-extrabold text-slate-800">{dept.avgWait} mins</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="p-4 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 font-medium">
            Calculated over the active filter range selection period.
          </div>
        </div>

        {/* Doctor Performance Table */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col justify-between" id="report-doc-perf">
          <div>
            <div className="p-6 border-b border-slate-100 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                <Award className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Physician Case Rates</h3>
                <p className="text-xs text-slate-400">Total patient caseloads and average consultation session times</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/70 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    <th className="py-4 px-6">Physician Name</th>
                    <th className="py-4 px-6 text-center">Specialty</th>
                    <th className="py-4 px-6 text-center">Total Seen</th>
                    <th className="py-4 px-6 text-center font-semibold text-emerald-600">Completed</th>
                    <th className="py-4 px-6 text-right">Avg Consult Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {docPerformance.map(doc => (
                    <tr key={doc.id} className="hover:bg-slate-50/30 transition-all">
                      <td className="py-4 px-6 font-extrabold text-slate-900">
                        {doc.name}
                      </td>
                      <td className="py-4 px-6 text-center text-slate-400 font-semibold">{doc.specialization}</td>
                      <td className="py-4 px-6 text-center font-bold">{doc.total}</td>
                      <td className="py-4 px-6 text-center text-emerald-600 font-extrabold">{doc.completed}</td>
                      <td className="py-4 px-6 text-right font-extrabold text-indigo-600">{doc.avgConsult} mins</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 font-medium">
            Active physician rosters mapped to clinical divisions.
          </div>
        </div>

      </div>

    </div>
  );
}

export { TokenStatus };
