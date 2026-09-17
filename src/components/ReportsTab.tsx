import React, { useState } from 'react';
import {
  BarChart2, Download, Activity, Award, Clock
} from 'lucide-react';
import { Token, Doctor, Department, TokenStatus } from '../types';

interface ReportsTabProps {
  tokens: Token[];
  doctors: Doctor[];
  departments: Department[];
}

export default function ReportsTab({ tokens, doctors, departments }: ReportsTabProps) {
  const [selectedReportRange, setSelectedReportRange] = useState<'today' | 'weekly' | 'monthly'>('today');

  // ── Filter tokens by selected range ──────────────────────────────────────
  const getFilteredTokens = () => {
    const now = new Date();
    return tokens.filter(t => {
      const created = new Date(t.createdAt);
      if (selectedReportRange === 'today') {
        return created.toDateString() === now.toDateString();
      } else if (selectedReportRange === 'weekly') {
        return now.getTime() - created.getTime() <= 7 * 24 * 60 * 60 * 1000;
      } else {
        return now.getTime() - created.getTime() <= 30 * 24 * 60 * 60 * 1000;
      }
    });
  };

  const activeTokens = getFilteredTokens();

  const totalPatients   = activeTokens.length;
  const completedCount  = activeTokens.filter(t => t.status === TokenStatus.COMPLETED).length;
  const waitingCount    = activeTokens.filter(t => t.status === TokenStatus.WAITING).length;
  const skippedCount    = activeTokens.filter(t => t.status === TokenStatus.SKIPPED).length;
  const cancelledCount  = activeTokens.filter(t => t.status === TokenStatus.CANCELLED).length;
  const emergencyCount  = activeTokens.filter(t => t.priority && t.priority !== 'Normal').length;

  const completedWithWait = activeTokens.filter(t => t.status === TokenStatus.COMPLETED && t.calledAt);
  let avgWaitMinutes = 0;
  if (completedWithWait.length > 0) {
    const totalWait = completedWithWait.reduce((acc, curr) => {
      return acc + (new Date(curr.calledAt!).getTime() - new Date(curr.createdAt).getTime());
    }, 0);
    avgWaitMinutes = Math.round(totalWait / completedWithWait.length / 60000);
  }

  const getPeakHours = () => {
    const hoursCount: Record<number, number> = {};
    activeTokens.forEach(t => {
      const hr = new Date(t.createdAt).getHours();
      hoursCount[hr] = (hoursCount[hr] || 0) + 1;
    });
    let peakHr = 9, maxCount = 0;
    Object.entries(hoursCount).forEach(([hr, count]) => {
      if (count > maxCount) { maxCount = count; peakHr = parseInt(hr); }
    });
    const fmt = (h: number) => `${h % 12 || 12}:00 ${h >= 12 ? 'PM' : 'AM'}`;
    return `${fmt(peakHr)} – ${fmt(peakHr + 1)}`;
  };
  const peakHours = totalPatients > 0 ? getPeakHours() : '—';

  // ── Department performance ────────────────────────────────────────────────
  const deptPerformance = departments.map(dept => {
    const dt = activeTokens.filter(t => t.departmentId === dept.id);
    const cw = dt.filter(t => t.status === TokenStatus.COMPLETED && t.calledAt);
    let avgWait = 0;
    if (cw.length > 0) {
      avgWait = Math.round(cw.reduce((acc, c) => acc + (new Date(c.calledAt!).getTime() - new Date(c.createdAt).getTime()), 0) / cw.length / 60000);
    }
    return {
      id: dept.id, name: dept.name, prefix: dept.prefix,
      total: dt.length,
      completed: dt.filter(t => t.status === TokenStatus.COMPLETED).length,
      skipped: dt.filter(t => t.status === TokenStatus.SKIPPED).length,
      avgWait,
    };
  });

  // ── Doctor performance ────────────────────────────────────────────────────
  const docPerformance = doctors.map(doc => {
    const dt = activeTokens.filter(t => t.doctorId === doc.id);
    const ct = dt.filter(t => t.status === TokenStatus.COMPLETED && t.calledAt && t.completedAt);
    let avgConsult = 0;
    if (ct.length > 0) {
      avgConsult = Math.round(ct.reduce((acc, c) => acc + (new Date(c.completedAt!).getTime() - new Date(c.calledAt!).getTime()), 0) / ct.length / 60000);
    }
    return {
      id: doc.id, name: doc.name, specialization: doc.specialization,
      total: dt.length,
      completed: dt.filter(t => t.status === TokenStatus.COMPLETED).length,
      skipped: dt.filter(t => t.status === TokenStatus.SKIPPED).length,
      avgConsult,
    };
  });

  // ── Export ────────────────────────────────────────────────────────────────
  const triggerExport = (type: 'daily' | 'monthly') => {
    const content = JSON.stringify({
      reportType: type,
      generatedAt: new Date().toISOString(),
      range: selectedReportRange,
      summary: { totalPatients, completedCount, waitingCount, skippedCount, cancelledCount, emergencyCount, avgWaitMinutes, peakHours },
      departments: deptPerformance,
      doctors: docPerformance,
      rawTokens: activeTokens,
    }, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `InclusyQ_${type}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── KPI card helper ───────────────────────────────────────────────────────
  const Metric = ({ label, value, sub, accent }: { label: string; value: string | number; sub: string; accent?: string }) => (
    <div className="metric-block">
      <div>
        <span className="metric-label">{label}</span>
        <span className={`metric-value ${accent ?? ''}`}>{value}</span>
      </div>
      <span className="metric-sub">{sub}</span>
    </div>
  );

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ── Header row ─────────────────────────────────────────────────────── */}
      <div className="topbar" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <p style={{ fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-charcoal-400)', marginBottom: '0.2rem' }}>
            Admin Centre <span style={{ color: 'var(--color-charcoal-300)' }}>/ Reports</span>
          </p>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--color-charcoal-900)', margin: 0 }}>
            Clinical Analytics
          </h2>
          <p style={{ fontSize: '0.7rem', color: 'var(--color-charcoal-400)', marginTop: '0.15rem' }}>
            Patient flow, wait times, and consultation statistics.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Range toggle */}
          <div style={{
            display: 'flex', background: 'var(--color-cream-100)', border: '1px solid var(--color-cream-300)',
            borderRadius: '0.5rem', padding: '0.2rem', gap: '0.15rem',
          }}>
            {(['today', 'weekly', 'monthly'] as const).map(r => (
              <button
                key={r}
                onClick={() => setSelectedReportRange(r)}
                style={{
                  padding: '0.3rem 0.75rem',
                  fontSize: '0.625rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  borderRadius: '0.35rem',
                  border: selectedReportRange === r ? '1px solid var(--color-cream-300)' : '1px solid transparent',
                  background: selectedReportRange === r ? '#fff' : 'transparent',
                  color: selectedReportRange === r ? 'var(--color-sage-800)' : 'var(--color-charcoal-400)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >{r}</button>
            ))}
          </div>

          <button onClick={() => triggerExport('daily')} className="btn btn-ghost" style={{ fontSize: '0.7rem' }}>
            <Download style={{ width: 13, height: 13 }} /> Daily JSON
          </button>
          <button onClick={() => triggerExport('monthly')} className="btn btn-primary" style={{ fontSize: '0.7rem' }}>
            <Download style={{ width: 13, height: 13 }} /> Monthly Report
          </button>
        </div>
      </div>

      {/* ── KPI grid ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
        <Metric label="Total Registered"    value={totalPatients}            sub="Outpatient bookings"          />
        <Metric label="Completed"           value={completedCount}           sub="Examined &amp; discharged"    accent="text-sage"    />
        <Metric label="In Queue"            value={waitingCount}             sub="Currently waiting"            />
        <Metric label="No-shows"            value={skippedCount}             sub="Awaiting secondary recall"    accent="text-terra"   />
        <Metric label="Cancelled"           value={cancelledCount}           sub="Revoked tokens"               />
        <Metric label="Priority Patients"   value={emergencyCount}           sub="Special care"                 accent="text-terra"   />
        <Metric label="Avg Wait"            value={avgWaitMinutes ? `${avgWaitMinutes} min` : '—'} sub="Registration to call" />
        <Metric label="Peak Load"           value={peakHours}                sub="Max registration hour"        />
      </div>

      {/* ── Tables ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1rem' }}>

        {/* Department table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-cream-200)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ width: 32, height: 32, borderRadius: '0.4rem', background: 'var(--color-sage-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Activity style={{ width: 16, height: 16, color: 'var(--color-sage-700)' }} />
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--color-charcoal-900)', margin: 0 }}>Department Performance</p>
              <p style={{ fontSize: '0.65rem', color: 'var(--color-charcoal-400)', margin: 0 }}>Wait ratios and completion rates by department</p>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="iq-table">
              <thead>
                <tr>
                  <th>Division</th>
                  <th style={{ textAlign: 'center' }}>Bookings</th>
                  <th style={{ textAlign: 'center' }}>Completed</th>
                  <th style={{ textAlign: 'center' }}>Skipped</th>
                  <th style={{ textAlign: 'right' }}>Avg Wait</th>
                </tr>
              </thead>
              <tbody>
                {deptPerformance.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-charcoal-300)', padding: '1.5rem' }}>No data</td></tr>
                ) : deptPerformance.map(dept => (
                  <tr key={dept.id}>
                    <td style={{ fontWeight: 600 }}>
                      {dept.name}
                      <span style={{
                        marginLeft: '0.4rem', fontSize: '0.6rem', fontFamily: 'var(--font-mono)',
                        background: 'var(--color-sage-100)', color: 'var(--color-sage-800)',
                        padding: '0.1rem 0.4rem', borderRadius: '0.25rem', border: '1px solid var(--color-sage-200)',
                      }}>{dept.prefix}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>{dept.total}</td>
                    <td style={{ textAlign: 'center', color: 'var(--color-sage-700)', fontWeight: 600 }}>{dept.completed}</td>
                    <td style={{ textAlign: 'center', color: 'var(--color-terra-600)', fontWeight: 600 }}>{dept.skipped}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{dept.avgWait ? `${dept.avgWait} min` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ padding: '0.6rem 1.25rem', background: 'var(--color-cream-50)', borderTop: '1px solid var(--color-cream-200)', fontSize: '0.625rem', color: 'var(--color-charcoal-300)' }}>
            Calculated over the selected time range.
          </div>
        </div>

        {/* Doctor table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-cream-200)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ width: 32, height: 32, borderRadius: '0.4rem', background: 'var(--color-terra-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Award style={{ width: 16, height: 16, color: 'var(--color-terra-700)' }} />
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--color-charcoal-900)', margin: 0 }}>Physician Case Rates</p>
              <p style={{ fontSize: '0.65rem', color: 'var(--color-charcoal-400)', margin: 0 }}>Caseloads and average consultation times</p>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="iq-table">
              <thead>
                <tr>
                  <th>Physician</th>
                  <th style={{ textAlign: 'center' }}>Specialty</th>
                  <th style={{ textAlign: 'center' }}>Seen</th>
                  <th style={{ textAlign: 'center' }}>Done</th>
                  <th style={{ textAlign: 'right' }}>Avg Consult</th>
                </tr>
              </thead>
              <tbody>
                {docPerformance.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-charcoal-300)', padding: '1.5rem' }}>No data</td></tr>
                ) : docPerformance.map(doc => (
                  <tr key={doc.id}>
                    <td style={{ fontWeight: 600 }}>{doc.name}</td>
                    <td style={{ textAlign: 'center', color: 'var(--color-charcoal-400)', fontSize: '0.7rem' }}>{doc.specialization}</td>
                    <td style={{ textAlign: 'center' }}>{doc.total}</td>
                    <td style={{ textAlign: 'center', color: 'var(--color-sage-700)', fontWeight: 600 }}>{doc.completed}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-charcoal-700)' }}>{doc.avgConsult ? `${doc.avgConsult} min` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ padding: '0.6rem 1.25rem', background: 'var(--color-cream-50)', borderTop: '1px solid var(--color-cream-200)', fontSize: '0.625rem', color: 'var(--color-charcoal-300)' }}>
            Active physician rosters mapped to clinical divisions.
          </div>
        </div>

      </div>
    </div>
  );
}
