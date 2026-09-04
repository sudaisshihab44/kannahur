/**
 * api/cache/dashboardCache.ts
 *
 * Pre-computed dashboard statistics served from Redis.
 *
 * Stats computed:
 *   - Total tokens today (all / by dept)
 *   - Waiting / called / completed / skipped counts
 *   - Average wait time across all waiting tokens
 *   - Per-department queue summary
 *
 * TTL: 10 s — fast enough for near-real-time feel, cheap enough to
 * avoid recomputing on every 5-second poll.
 *
 * Invalidation: called by invalidateQueueCache() and any token write.
 */

import { cacheManager } from '../utils/redisCache.js';
import { CacheKeys, RedisTTL } from './keys.js';
import { findTodayTokens } from '../repositories/tokenRepository.js';
import { mapToken } from '../utils/mappers.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalToday:     number;
  waiting:        number;
  called:         number;
  completed:      number;
  skipped:        number;
  cancelled:      number;
  avgWaitMinutes: number;
  byDepartment:   DeptQueueSummary[];
  lastUpdatedAt:  string;
}

export interface DeptQueueSummary {
  departmentId:   string;
  departmentName: string;
  waiting:        number;
  called:         number;
  completed:      number;
}

// ── Compute ───────────────────────────────────────────────────────────────────

async function computeDashboardStats(): Promise<DashboardStats> {
  const rows = await findTodayTokens();
  const tokens = rows.map(mapToken);

  let waiting = 0, called = 0, completed = 0, skipped = 0, cancelled = 0;
  let totalWait = 0, waitCount = 0;

  const byDept = new Map<string, DeptQueueSummary>();

  for (const t of tokens) {
    switch (t.status) {
      case 'waiting':   waiting++;   break;
      case 'called':    called++;    break;
      case 'completed': completed++; break;
      case 'skipped':   skipped++;   break;
      case 'cancelled': cancelled++; break;
    }

    if (t.status === 'waiting' && t.estimatedWaitTime != null) {
      totalWait += t.estimatedWaitTime;
      waitCount++;
    }

    // Per-department aggregation
    const deptId = t.departmentId;
    if (!byDept.has(deptId)) {
      byDept.set(deptId, {
        departmentId:   deptId,
        departmentName: t.departmentName ?? deptId,
        waiting: 0, called: 0, completed: 0,
      });
    }
    const d = byDept.get(deptId)!;
    if (t.status === 'waiting')   d.waiting++;
    if (t.status === 'called')    d.called++;
    if (t.status === 'completed') d.completed++;
  }

  return {
    totalToday:     tokens.length,
    waiting,
    called,
    completed,
    skipped,
    cancelled,
    avgWaitMinutes: waitCount > 0 ? Math.round(totalWait / waitCount) : 0,
    byDepartment:   Array.from(byDept.values()),
    lastUpdatedAt:  new Date().toISOString(),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return dashboard stats, served from Redis when available.
 */
export async function getCachedDashboardStats(): Promise<DashboardStats> {
  const key = CacheKeys.dashboardStats();

  const hit = await cacheManager.get<DashboardStats>(key);
  if (hit !== null) return hit;

  const stats = await computeDashboardStats();
  await cacheManager.set(key, stats, RedisTTL.DASHBOARD);
  return stats;
}

/**
 * Get queue summary for a single department.
 */
export async function getCachedDeptSummary(deptId: string): Promise<DeptQueueSummary | null> {
  const key = CacheKeys.deptQueueSummary(deptId);

  const hit = await cacheManager.get<DeptQueueSummary>(key);
  if (hit !== null) return hit;

  const stats = await getCachedDashboardStats();
  const dept = stats.byDepartment.find(d => d.departmentId === deptId) ?? null;

  if (dept) {
    await cacheManager.set(key, dept, RedisTTL.DASHBOARD);
  }

  return dept;
}

// ── Invalidation ──────────────────────────────────────────────────────────────

export async function invalidateDashboardCache(): Promise<void> {
  await cacheManager.delPattern(CacheKeys.PREFIX.dashboard);
}
