/**
 * api/monitoring/health.ts
 *
 * Health-check logic shared by the healthController.
 *
 * Three checks — following Kubernetes conventions:
 *
 *   /api/health   — Overall system health (HTTP 200 = healthy, 503 = degraded)
 *                   Includes all dependency statuses, memory, uptime.
 *
 *   /api/ready    — Readiness: can the process serve traffic?
 *                   Fails if a critical dependency (Supabase) is unreachable.
 *                   Kubernetes uses this to gate traffic routing.
 *
 *   /api/live     — Liveness: is the process alive?
 *                   Never checks external deps — only process state.
 *                   Kubernetes uses this to decide whether to restart the pod.
 */
import os from 'os';
import { supabase } from '../config/supabase.js';
import { getRedisClient, isRedisAvailable } from '../config/redis.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CheckStatus = 'up' | 'down' | 'degraded';

export interface DependencyCheck {
  status:      CheckStatus;
  latencyMs?:  number;
  message?:    string;
}

export interface HealthReport {
  status:      CheckStatus;
  timestamp:   string;
  uptime:      number;
  version:     string;
  process: {
    pid:         number;
    memory:      NodeJS.MemoryUsage;
    cpuUser:     number;
    cpuSystem:   number;
    platform:    string;
    nodeVersion: string;
  };
  system: {
    loadAvg:      number[];
    totalMemMB:   number;
    freeMemMB:    number;
    memUsagePct:  number;
    cpuCount:     number;
  };
  dependencies: {
    supabase: DependencyCheck;
    redis:    DependencyCheck;
  };
}

// ── Supabase ping ─────────────────────────────────────────────────────────────

async function checkSupabase(): Promise<DependencyCheck> {
  const start = Date.now();
  try {
    const { error } = await supabase.from('settings').select('id').limit(1).maybeSingle();
    const latencyMs = Date.now() - start;
    if (error) {
      return { status: 'down', latencyMs, message: error.message };
    }
    return { status: 'up', latencyMs };
  } catch (err: any) {
    return { status: 'down', latencyMs: Date.now() - start, message: err.message };
  }
}

// ── Redis ping ────────────────────────────────────────────────────────────────

async function checkRedis(): Promise<DependencyCheck> {
  const redis = getRedisClient();
  if (!redis) {
    return { status: 'degraded', message: 'REDIS_URL not configured (in-memory fallback)' };
  }
  const start = Date.now();
  try {
    const reply = await redis.ping();
    const latencyMs = Date.now() - start;
    return reply === 'PONG'
      ? { status: 'up', latencyMs }
      : { status: 'down', latencyMs, message: `Unexpected PING reply: ${reply}` };
  } catch (err: any) {
    return { status: 'down', latencyMs: Date.now() - start, message: err.message };
  }
}

// ── Process stats ─────────────────────────────────────────────────────────────

function getProcessStats() {
  const mem  = process.memoryUsage();
  const cpu  = process.cpuUsage();
  const load = os.loadavg();

  const totalMemMB  = Math.round(os.totalmem() / 1024 / 1024);
  const freeMemMB   = Math.round(os.freemem()  / 1024 / 1024);
  const memUsagePct = Math.round(((totalMemMB - freeMemMB) / totalMemMB) * 100);

  return {
    process: {
      pid:         process.pid,
      memory:      mem,
      cpuUser:     cpu.user,
      cpuSystem:   cpu.system,
      platform:    process.platform,
      nodeVersion: process.version,
    },
    system: {
      loadAvg:     load,
      totalMemMB,
      freeMemMB,
      memUsagePct,
      cpuCount:    os.cpus().length,
    },
  };
}

// ── Health check ──────────────────────────────────────────────────────────────

export async function getHealthReport(): Promise<HealthReport> {
  const [supabaseCheck, redisCheck] = await Promise.all([
    checkSupabase(),
    checkRedis(),
  ]);

  // Overall status: down > degraded > up
  let status: CheckStatus = 'up';
  if (supabaseCheck.status === 'down') status = 'down';
  else if (supabaseCheck.status === 'degraded' || redisCheck.status === 'down') status = 'degraded';

  const stats = getProcessStats();

  return {
    status,
    timestamp: new Date().toISOString(),
    uptime:    process.uptime(),
    version:   process.env.npm_package_version ?? '2.0.0',
    ...stats,
    dependencies: {
      supabase: supabaseCheck,
      redis:    redisCheck,
    },
  };
}

// ── Readiness check ───────────────────────────────────────────────────────────

export interface ReadinessReport {
  ready:     boolean;
  timestamp: string;
  checks: {
    supabase: DependencyCheck;
  };
}

export async function getReadinessReport(): Promise<ReadinessReport> {
  const supabaseCheck = await checkSupabase();
  return {
    ready:     supabaseCheck.status === 'up',
    timestamp: new Date().toISOString(),
    checks:    { supabase: supabaseCheck },
  };
}

// ── Liveness check ────────────────────────────────────────────────────────────

export interface LivenessReport {
  alive:     boolean;
  timestamp: string;
  uptime:    number;
  pid:       number;
  memory: {
    heapUsedMB:  number;
    heapTotalMB: number;
    rssMB:       number;
  };
}

const HEAP_LIMIT_MB = parseInt(process.env.HEAP_LIMIT_MB ?? '512', 10);

export function getLivenessReport(): LivenessReport {
  const mem         = process.memoryUsage();
  const heapUsedMB  = Math.round(mem.heapUsed  / 1024 / 1024);
  const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
  const rssMB       = Math.round(mem.rss       / 1024 / 1024);

  // Liveness fails only if heap has grown past the limit (memory leak signal)
  const alive = heapUsedMB < HEAP_LIMIT_MB;

  return {
    alive,
    timestamp: new Date().toISOString(),
    uptime:    process.uptime(),
    pid:       process.pid,
    memory:    { heapUsedMB, heapTotalMB, rssMB },
  };
}
