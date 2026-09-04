/**
 * api/monitoring/metrics.ts
 *
 * Prometheus metrics registry — single source of truth for all instrumentation.
 *
 * Metrics exported:
 *   iq_http_request_duration_seconds   histogram   HTTP response time by route/method/status
 *   iq_http_requests_total             counter     Total HTTP requests
 *   iq_http_active_requests            gauge       In-flight requests
 *   iq_db_query_duration_seconds       histogram   Supabase query time by table/operation
 *   iq_db_slow_queries_total           counter     Queries exceeding SLOW_QUERY_MS threshold
 *   iq_cache_operations_total          counter     Cache hits/misses by key prefix
 *   iq_job_duration_seconds            histogram   BullMQ job execution time
 *   iq_job_failures_total              counter     Failed jobs by queue/name
 *   iq_token_actions_total             counter     Token state changes
 *   iq_process_cpu_usage               gauge       Node.js CPU seconds (mirrors default)
 *   iq_nodejs_memory_bytes             gauge       Heap used / heap total / rss
 *   iq_uptime_seconds                  gauge       Process uptime
 *
 * Default Node.js metrics (gc, eventloop, etc.) are also collected.
 */
import {
  Registry, collectDefaultMetrics,
  Counter, Histogram, Gauge,
  type LabelValues,
} from 'prom-client';

// ── Shared registry ───────────────────────────────────────────────────────────

export const registry = new Registry();

registry.setDefaultLabels({
  service: 'inclusyq-api',
  env:     process.env.NODE_ENV ?? 'development',
});

// Collect Node.js built-ins (GC, event loop lag, file descriptors, etc.)
collectDefaultMetrics({ register: registry, prefix: 'iq_nodejs_' });

// ── HTTP metrics ──────────────────────────────────────────────────────────────

export const httpRequestDuration = new Histogram({
  name:       'iq_http_request_duration_seconds',
  help:       'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets:    [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers:  [registry],
});

export const httpRequestsTotal = new Counter({
  name:       'iq_http_requests_total',
  help:       'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers:  [registry],
});

export const httpActiveRequests = new Gauge({
  name:      'iq_http_active_requests',
  help:      'Number of HTTP requests currently in-flight',
  registers: [registry],
});

// ── Database metrics ──────────────────────────────────────────────────────────

export const dbQueryDuration = new Histogram({
  name:       'iq_db_query_duration_seconds',
  help:       'Supabase query duration in seconds',
  labelNames: ['table', 'operation'] as const,
  buckets:    [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers:  [registry],
});

export const dbSlowQueriesTotal = new Counter({
  name:       'iq_db_slow_queries_total',
  help:       'Number of database queries exceeding the slow-query threshold',
  labelNames: ['table', 'operation'] as const,
  registers:  [registry],
});

export const dbErrorsTotal = new Counter({
  name:       'iq_db_errors_total',
  help:       'Total database query errors',
  labelNames: ['table', 'operation'] as const,
  registers:  [registry],
});

// ── Cache metrics ─────────────────────────────────────────────────────────────

export const cacheOperationsTotal = new Counter({
  name:       'iq_cache_operations_total',
  help:       'Cache get/set/del operations and their results',
  labelNames: ['operation', 'result', 'prefix'] as const,
  registers:  [registry],
});

// ── Job metrics ───────────────────────────────────────────────────────────────

export const jobDuration = new Histogram({
  name:       'iq_job_duration_seconds',
  help:       'BullMQ job execution duration in seconds',
  labelNames: ['queue', 'job_name'] as const,
  buckets:    [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30, 60],
  registers:  [registry],
});

export const jobFailuresTotal = new Counter({
  name:       'iq_job_failures_total',
  help:       'Number of permanently failed BullMQ jobs (DLQ)',
  labelNames: ['queue', 'job_name'] as const,
  registers:  [registry],
});

export const jobQueueDepth = new Gauge({
  name:       'iq_job_queue_depth',
  help:       'Current number of waiting jobs per queue',
  labelNames: ['queue'] as const,
  registers:  [registry],
});

// ── Domain metrics ────────────────────────────────────────────────────────────

export const tokenActionsTotal = new Counter({
  name:       'iq_token_actions_total',
  help:       'Token lifecycle actions (created, called, completed, skipped, cancelled)',
  labelNames: ['action', 'department_id'] as const,
  registers:  [registry],
});

export const authEventsTotal = new Counter({
  name:       'iq_auth_events_total',
  help:       'Authentication events (login_success, login_failed, logout, token_refresh)',
  labelNames: ['event', 'role'] as const,
  registers:  [registry],
});

// ── Process / system metrics ──────────────────────────────────────────────────

export const processUptimeGauge = new Gauge({
  name:      'iq_process_uptime_seconds',
  help:      'Node.js process uptime in seconds',
  registers: [registry],
  collect() { this.set(process.uptime()); },
});

export const memoryHeapUsed = new Gauge({
  name:      'iq_memory_heap_used_bytes',
  help:      'Node.js heap used in bytes',
  registers: [registry],
  collect() { this.set(process.memoryUsage().heapUsed); },
});

export const memoryHeapTotal = new Gauge({
  name:      'iq_memory_heap_total_bytes',
  help:      'Node.js heap total in bytes',
  registers: [registry],
  collect() { this.set(process.memoryUsage().heapTotal); },
});

export const memoryRss = new Gauge({
  name:      'iq_memory_rss_bytes',
  help:      'Node.js resident set size in bytes',
  registers: [registry],
  collect() { this.set(process.memoryUsage().rss); },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const SLOW_QUERY_MS = parseInt(process.env.SLOW_QUERY_MS ?? '200', 10);

/**
 * Time a database operation and record it in Prometheus.
 * Returns a stop function — call it when the query completes.
 */
export function timeDbQuery(table: string, operation: string) {
  const end = dbQueryDuration.startTimer({ table, operation });
  const startMs = Date.now();

  return (error?: boolean) => {
    end();
    const durationMs = Date.now() - startMs;

    if (durationMs >= SLOW_QUERY_MS) {
      dbSlowQueriesTotal.inc({ table, operation });
    }
    if (error) {
      dbErrorsTotal.inc({ table, operation });
    }
  };
}

/**
 * Time an HTTP request and record it in Prometheus.
 * Returns a stop function — call it when the response is finished.
 */
export function timeHttpRequest(method: string, route: string) {
  const end = httpRequestDuration.startTimer({ method, route });
  httpActiveRequests.inc();
  return (statusCode: number) => {
    end({ status_code: String(statusCode) });
    httpRequestsTotal.inc({ method, route, status_code: String(statusCode) });
    httpActiveRequests.dec();
  };
}

/**
 * Time a BullMQ job execution.
 */
export function timeJob(queue: string, jobName: string) {
  return jobDuration.startTimer({ queue, job_name: jobName });
}

/**
 * Record a cache operation result.
 */
export function recordCacheOp(
  operation: 'get' | 'set' | 'del' | 'incr',
  result:    'hit' | 'miss' | 'ok' | 'error',
  keyPrefix: string
): void {
  cacheOperationsTotal.inc({ operation, result, prefix: keyPrefix });
}
