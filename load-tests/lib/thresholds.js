/**
 * load-tests/lib/thresholds.js
 *
 * Service Level Objectives (SLOs) expressed as k6 thresholds.
 * Each tier has tighter/looser tolerances reflecting realistic expectations
 * at that user volume and the corresponding infrastructure.
 *
 * Threshold syntax:
 *   'metric_name': ['condition']
 *   e.g. 'http_req_duration': ['p(95)<500']  means p95 must be < 500 ms
 *
 * abortOnFail: true  stops the test immediately if the SLO is breached.
 */

// ── Tier definitions ──────────────────────────────────────────────────────────

/**
 * SMOKE (5 VUs, 1 minute)
 * Purpose: Confirm the API responds at all — not a performance test.
 * Pass/fail criteria: No errors, all endpoints respond.
 */
export const SMOKE_THRESHOLDS = {
  http_req_failed:            ['rate<0.01'],       // < 1% errors
  http_req_duration:          ['p(95)<2000'],       // p95 < 2 s (generous for cold start)
  'token_creation_time':      ['p(95)<1500'],
  'error_rate':               ['rate<0.01'],
};

/**
 * 1 000 CONCURRENT USERS
 * Infrastructure: 1 × 2vCPU / 2GB app node, 1 × Redis, Supabase free tier
 * Expected: Single Node.js process handles this comfortably with Redis caching.
 */
export const TIER_1K_THRESHOLDS = {
  http_req_failed:            ['rate<0.005'],       // < 0.5% errors
  http_req_duration:          ['p(50)<150', 'p(95)<400', 'p(99)<800'],
  'token_creation_time':      ['p(95)<600'],
  'token_call_time':          ['p(95)<400'],
  'queue_poll_time':          ['p(95)<150'],        // heavily cached
  'data_fetch_time':          ['p(95)<200'],        // Redis cache hit
  'auth_time':                ['p(95)<500'],
  'error_rate':               ['rate<0.005'],
  'slow_requests':            ['count<50'],         // < 50 slow requests total
};

/**
 * 5 000 CONCURRENT USERS
 * Infrastructure: 2 × 2vCPU / 4GB app nodes (horizontal scale), Redis cluster, Supabase Pro
 * Expected: Redis absorbs most read load; DB writes start to show latency.
 */
export const TIER_5K_THRESHOLDS = {
  http_req_failed:            ['rate<0.01'],
  http_req_duration:          ['p(50)<200', 'p(95)<600', 'p(99)<1200'],
  'token_creation_time':      ['p(95)<800'],
  'token_call_time':          ['p(95)<600'],
  'queue_poll_time':          ['p(95)<200'],
  'data_fetch_time':          ['p(95)<300'],
  'auth_time':                ['p(95)<700'],
  'error_rate':               ['rate<0.01'],
  'slow_requests':            ['count<200'],
};

/**
 * 10 000 CONCURRENT USERS
 * Infrastructure: 4 × 4vCPU / 8GB nodes (Railway Pro / Fly.io scale),
 *                Redis cluster (3 shards), Supabase Pro + PgBouncer pooling
 * Expected: DB connection pool saturation possible; Redis becomes critical.
 *           ~40% of /api/data requests served from Redis cache.
 */
export const TIER_10K_THRESHOLDS = {
  http_req_failed:            ['rate<0.02'],        // allow 2% (some queue contention)
  http_req_duration:          ['p(50)<300', 'p(95)<900', 'p(99)<2000'],
  'token_creation_time':      ['p(95)<1200'],
  'token_call_time':          ['p(95)<800'],
  'queue_poll_time':          ['p(95)<300'],
  'data_fetch_time':          ['p(95)<400'],
  'auth_time':                ['p(95)<1000'],
  'error_rate':               ['rate<0.02'],
  'slow_requests':            ['count<500'],
};

/**
 * 50 000 CONCURRENT USERS
 * Infrastructure: Kubernetes cluster (8-16 pods), Redis Cluster (6 nodes),
 *                Supabase Enterprise / dedicated Postgres (pgBouncer + read replica)
 * Expected: DB is the primary bottleneck. Cache hit rate must be >85%.
 *           BullMQ workers scaled to 4+ replicas.
 */
export const TIER_50K_THRESHOLDS = {
  http_req_failed:            ['rate<0.03'],
  http_req_duration:          ['p(50)<500', 'p(95)<1500', 'p(99)<3000'],
  'token_creation_time':      ['p(95)<2000'],
  'token_call_time':          ['p(95)<1500'],
  'queue_poll_time':          ['p(95)<500'],        // Redis-served
  'data_fetch_time':          ['p(95)<600'],        // mostly cache hits
  'auth_time':                ['p(95)<1500'],
  'error_rate':               ['rate<0.03'],
  'slow_requests':            ['count<2000'],
};

/**
 * 100 000 CONCURRENT USERS
 * Infrastructure: Multi-region Kubernetes (20+ pods), Redis Cluster (12 nodes),
 *                Dedicated Postgres (primary + 2 read replicas), CDN for static assets
 * Expected: This tier requires architectural changes (read replicas, edge caching,
 *           Supabase Realtime replaced by purpose-built pub/sub).
 *           Some SLOs are looser — at this scale, graceful degradation is acceptable.
 */
export const TIER_100K_THRESHOLDS = {
  http_req_failed:            ['rate<0.05'],        // 5% — graceful degradation
  http_req_duration:          ['p(50)<800', 'p(95)<2500', 'p(99)<5000'],
  'token_creation_time':      ['p(95)<3000'],
  'token_call_time':          ['p(95)<2000'],
  'queue_poll_time':          ['p(95)<800'],
  'data_fetch_time':          ['p(95)<1000'],
  'auth_time':                ['p(95)<2000'],
  'error_rate':               ['rate<0.05'],
  'slow_requests':            ['count<5000'],
};

/**
 * STRESS (spike test)
 * Purpose: Verify the system recovers after a sudden traffic spike.
 * Pass: Error rate returns to < 1% within 60 s of spike dropping.
 */
export const STRESS_THRESHOLDS = {
  http_req_failed:            ['rate<0.10'],        // up to 10% during spike
  http_req_duration:          ['p(95)<5000'],       // p95 can reach 5 s at spike
  'error_rate':               ['rate<0.10'],
};

/**
 * SOAK (sustained 30-minute load at 2k VUs)
 * Purpose: Detect memory leaks, connection pool exhaustion, Redis key growth.
 * Pass: No degradation in p95 over the 30-minute window.
 */
export const SOAK_THRESHOLDS = {
  http_req_failed:            ['rate<0.01'],
  http_req_duration:          ['p(95)<600'],        // must stay stable throughout
  'error_rate':               ['rate<0.01'],
};

/**
 * BREAKPOINT (ramp until failure)
 * Purpose: Find the exact VU count where the system starts failing.
 * No hard pass/fail — examine results manually.
 */
export const BREAKPOINT_THRESHOLDS = {
  http_req_failed:            ['rate<0.20'],        // stop when 20% fail
  http_req_duration:          ['p(95)<10000'],
};
