# InclusyQ — Scale Analysis & Bottleneck Report

## How to Read This Document

This analysis models InclusyQ's capacity at five user tiers.
**"Concurrent users"** means browser tabs / devices with an open session
and actively making requests — not total registered users.

Each tier defines:
- Traffic profile (requests per second per endpoint)
- Expected CPU, RAM, database load
- Primary bottlenecks and the fix for each
- Infrastructure required
- SLO targets (matched to `load-tests/lib/thresholds.js`)

---

## Traffic Model

InclusyQ has three distinct traffic patterns:

| Pattern | Endpoint | Frequency | Volume driver |
|---|---|---|---|
| **Queue polling** | `GET /api/queue` | Every 5 s per TV/patient | 80% of total requests |
| **Token operations** | `POST /api/tokens/*` | ~2/min per receptionist | Write-heavy, cache-busting |
| **Data snapshot** | `GET /api/data` | Every 5 s per dashboard | Large payload (65 kB) |

**Key insight:** At all scales, ~70–80% of requests are `GET /api/queue`.
Redis caching of this endpoint is the single highest-leverage optimisation.

---

## Tier 1 — 1 000 Concurrent Users

### Traffic profile

| Endpoint | req/s |
|---|---|
| `GET /api/queue` | 120 |
| `GET /api/data` | 40 |
| `POST /api/tokens/*` | 8 |
| `GET /api/track/*` | 15 |
| `POST /api/login` | 3 |
| **Total** | **~186 req/s** |

### Resource projections

| Resource | Estimated usage | Headroom |
|---|---|---|
| Node.js CPU | 0.4–0.6 vCPU | Large (single core ~1 vCPU) |
| Node.js RAM | 180–240 MB | Comfortable on 512 MB |
| Redis ops/s | 500–800 | Upstash free tier: 10k/day OK |
| Supabase queries/min | 180 | Free tier (500k/month) |
| DB connections | 8–12 | Well within default pool |
| Network (outbound) | ~5 MB/s | Trivial |

### Primary bottleneck

**None at this scale.** A single 2vCPU / 2GB node handles 1k users comfortably
with Redis caching in place. Redis cache hit rate on `/api/queue` should be >90%
(5 s TTL, 120 req/s → effectively 1 DB query per 5 s per department).

### Infrastructure

```
1 × Railway Starter ($5/mo)  — Node.js app
1 × Upstash Redis free tier  — caching + BullMQ
    Supabase free tier        — database
```

### SLO targets

| Metric | Target |
|---|---|
| p50 response | < 150 ms |
| p95 response | < 400 ms |
| Error rate | < 0.5% |
| Token creation p95 | < 600 ms |

---

## Tier 2 — 5 000 Concurrent Users

### Traffic profile

| Endpoint | req/s |
|---|---|
| `GET /api/queue` | 600 |
| `GET /api/data` | 200 |
| `POST /api/tokens/*` | 40 |
| `GET /api/track/*` | 75 |
| `POST /api/login` | 15 |
| **Total** | **~930 req/s** |

### Resource projections

| Resource | Estimated usage | Notes |
|---|---|---|
| Node.js CPU | 1.5–2.5 vCPU total | Single process saturates at ~2k req/s |
| Node.js RAM | 400–600 MB per node | 2 nodes needed |
| Redis ops/s | 2 500–4 000 | Upstash Pay-as-you-go; ~$10/mo |
| Supabase queries/min | 600 | Pro plan needed (4 CPU, 8GB) |
| DB connections | 25–40 | Within default pool (100) |
| Network | ~25 MB/s | 65 kB × 200 data fetches/s |

### Primary bottlenecks

1. **Node.js single-process CPU** — single-threaded JS cannot exceed ~1 core.
   Fix: Add a second app replica behind Railway's automatic load balancer.
   The in-memory rate limiter breaks across replicas — **Redis rate limiting must
   be active** (already implemented via `CacheKeys.loginAttempts`).

2. **`GET /api/data` payload size** — 200 req/s × 65 kB = 13 MB/s outbound.
   Fix: Verify Redis cache is achieving >85% hit rate. If not, increase TTL
   from 5 s to 10 s during off-peak hours.

### Infrastructure

```
2 × Railway Pro ($20/mo each)  — 2 app replicas
1 × Upstash Redis Pay-as-you-go (~$10/mo)
    Supabase Pro ($25/mo)
```

### SLO targets

| Metric | Target |
|---|---|
| p50 response | < 200 ms |
| p95 response | < 600 ms |
| Error rate | < 1% |
| Queue poll p95 | < 200 ms |

---

## Tier 3 — 10 000 Concurrent Users

### Traffic profile

| Endpoint | req/s |
|---|---|
| `GET /api/queue` | 1 200 |
| `GET /api/data` | 400 |
| `POST /api/tokens/*` | 80 |
| `GET /api/track/*` | 150 |
| `POST /api/login` | 30 |
| **Total** | **~1 860 req/s** |

### Resource projections

| Resource | Estimated usage | Notes |
|---|---|---|
| Node.js CPU | 3–5 vCPU total | 4 replicas × 1–1.5 vCPU each |
| Node.js RAM | 400–500 MB per replica | 4 × 512 MB = 2 GB total |
| Redis ops/s | 5 000–9 000 | Upstash Pro 1M ops/day |
| Supabase queries/min | 1 100 | Pro plan, enable PgBouncer |
| DB connections | 60–80 | **PgBouncer required** (pool=200) |
| Network | ~50 MB/s | Significant — CDN helps |

### Primary bottlenecks

1. **Database connection pool exhaustion** — Supabase default Postgres allows 100
   direct connections. 4 replicas × 20 connections each = 80 connections, approaching limit.
   Fix: Enable **PgBouncer transaction-mode pooling** in Supabase settings.
   This lets 1 000+ app requests share 100 DB connections via queueing.

2. **Rate limiter divergence** — each of the 4 app replicas has its own in-process
   counter. A user could make 4× the allowed attempts by hitting different replicas.
   Fix: The Redis-backed `loginAttempts` counter already solves this — verify it
   is the active path (not the in-memory fallback).

3. **Queue recalculation stampede** — with 80 token writes/s, 80 recalc jobs/s
   are enqueued. Each recalc queries all tokens. Fix: The existing jobId
   deduplication (`jobId: 'recalc:<deptId>'`) collapses concurrent recalcs
   into one per department — verify this is working via `/api/jobs/stats`.

4. **`/api/data` response size** — 65 kB × 400 req/s = 26 MB/s purely for
   this endpoint. At this scale, consider splitting into smaller domain
   endpoints (`/api/departments`, `/api/doctors`, `/api/queue`) so clients
   fetch only what changed.

### Infrastructure

```
4 × 2vCPU / 4GB nodes (Fly.io Performance-2x or Railway Pro)
1 × Upstash Redis Pro (1M ops/day, $60/mo)
    Supabase Pro + PgBouncer enabled
1 × Load balancer (Fly.io automatic / Nginx)
```

### Required code changes

- None — architecture already supports this with the existing Redis caching.
- Verify PgBouncer is on in Supabase Dashboard → Settings → Database → Connection Pooling.

### SLO targets

| Metric | Target |
|---|---|
| p50 response | < 300 ms |
| p95 response | < 900 ms |
| Error rate | < 2% |
| DB slow queries | < 5/min |
| Cache hit rate | > 85% |

---

## Tier 4 — 50 000 Concurrent Users

### Traffic profile

| Endpoint | req/s |
|---|---|
| `GET /api/queue` | 6 000 |
| `GET /api/data` | 2 000 |
| `POST /api/tokens/*` | 400 |
| `GET /api/track/*` | 750 |
| `POST /api/login` | 150 |
| **Total** | **~9 300 req/s** |

### Resource projections

| Resource | Estimated usage | Notes |
|---|---|---|
| Node.js CPU | 18–25 vCPU total | 12–16 replicas |
| Node.js RAM | 6–8 GB total | 500 MB × 12–16 |
| Redis ops/s | 30 000–50 000 | Redis Cluster required |
| DB queries/min | 6 000 | Dedicated Postgres required |
| DB connections | 400–600 (via PgBouncer) | Pool size = 1 000 |
| Network outbound | ~300 MB/s | CDN caching essential |

### Critical bottlenecks

1. **`GET /api/queue` volume** — 6 000 req/s × 5 s TTL = Redis serves 99% of
   requests. Without Redis, this would be 6 000 Supabase queries/s, which would
   immediately saturate the database. **Redis is load-bearing at this tier.**

2. **`GET /api/data` payload** — 2 000 req/s × 65 kB = 130 MB/s.
   Fix: Deploy Cloudflare or CloudFront in front of the app. Cache `/api/queue`
   at the CDN edge with a 3–5 s TTL. This moves 80% of queue polling off
   the origin entirely.

3. **Supabase shared infrastructure** — Supabase Pro is shared compute.
   At this volume you will hit rate limits on the shared Postgres instance.
   Fix: Supabase Enterprise plan OR self-hosted Postgres on dedicated compute.
   Add a Postgres read replica; route all SELECT queries to the replica.

4. **BullMQ worker throughput** — 400 token writes/s = 400 recalc jobs + 400
   email jobs/s. 4 workers are insufficient.
   Fix: Scale BullMQ workers to 8–12 replicas as a separate Kubernetes deployment.

### Infrastructure changes required

```
Kubernetes cluster:
  12–16 pods for API (HPA: min=8, max=20, CPU target=60%)
  8–12 pods for BullMQ workers (separate Deployment)

Database:
  Supabase Enterprise OR self-hosted Postgres 16 on 16vCPU / 64GB
  1 read replica routing all SELECT queries
  PgBouncer transaction mode, pool_size=1000

Redis:
  Redis Cluster: 6 nodes (3 primary + 3 replica)
  OR Upstash Redis Enterprise ($300+/mo)

CDN:
  Cloudflare Pro in front of origin
  Cache /api/queue: 5 s edge TTL
  Cache static assets: immutable (already configured)

Estimated monthly cost: $800–1 500/mo
```

### Required code changes

1. **Split `/api/data`** into domain-specific endpoints to reduce payload size.
2. **Add Cloudflare Cache-Control headers** to `/api/queue` responses.
3. **Move BullMQ workers** to separate Kubernetes Deployment (not co-located with API).
4. **Distribute rate limiter** — currently uses `CacheKeys.loginAttempts` in Redis,
   but the in-memory `rateLimiter.ts` fallback must be disabled. Set `REDIS_URL`
   to always use the Redis path.

### SLO targets

| Metric | Target |
|---|---|
| p50 response | < 500 ms |
| p95 response | < 1 500 ms |
| Error rate | < 3% |
| Cache hit rate | > 90% |
| DB connections (active) | < 800 |

---

## Tier 5 — 100 000 Concurrent Users

### Traffic profile

| Endpoint | req/s |
|---|---|
| `GET /api/queue` | 12 000 |
| `GET /api/data` | 4 000 |
| `POST /api/tokens/*` | 800 |
| `GET /api/track/*` | 1 500 |
| `POST /api/login` | 300 |
| **Total** | **~18 600 req/s** |

### Resource projections

| Resource | Estimated usage |
|---|---|
| Node.js CPU | 40–60 vCPU across pods |
| Node.js RAM | 15–25 GB total |
| Redis ops/s | 80 000–120 000 |
| DB queries/min | 12 000 (SELECT heavy) |
| Network outbound | 600–800 MB/s |

### Hard architectural limits hit at this scale

**1. The 5-second polling model is unsustainable.**

12 000 `GET /api/queue` req/s means each queue poll response must be served in
< 83 µs on average for the system to keep up — impossible for any origin server.
The polling model must be replaced with **push-based updates**:

- Replace `setInterval(refreshDatabaseState, 5000)` with a **Supabase Realtime**
  subscription or a dedicated pub/sub (Ably, Pusher, NATS).
- TV boards subscribe to `tokens:UPDATE` events; no polling.
- This alone reduces origin traffic by ~80%.

**2. Single-tenant Supabase is no longer viable.**

At 12 000 DB queries/min on a shared platform, query queue buildup is inevitable.
Options:
- Self-hosted Postgres 16 on 32vCPU / 128GB dedicated compute
- Neon Serverless Postgres with auto-scaling
- Database sharding by `hospital_id` (multi-tenant architecture)

**3. `/api/data` must be retired or replaced.**

The 65 kB response × 4 000 req/s = 260 MB/s. Even with Redis caching,
the serialisation and deserialisation cost per request (JSON.parse of 65 kB)
consumes significant CPU. Replace with:
- Granular endpoints (`/api/tokens/today`, `/api/settings`)
- WebSocket subscription for incremental updates

**4. Multi-region deployment required.**

A hospital platform serving 100 000 concurrent users is likely national or
multi-city. A single-region deployment adds 50–200 ms latency for distant clients.
Deploy in 2–3 regions (Singapore, India, UAE) with GeoDNS routing.

### Infrastructure blueprint

```
Region: Primary (Singapore)
  Kubernetes: 20–30 API pods (HPA)
  Kubernetes: 15–20 BullMQ worker pods
  Redis Cluster: 12 nodes across 3 AZs
  Postgres Primary: 32vCPU / 128GB
  Postgres Replica ×2: read-only
  CDN: Cloudflare with edge workers serving /api/queue

Region: Secondary (India)
  Kubernetes: 10–15 API pods
  Redis Cluster: 6 nodes (replica of primary)
  Postgres Read Replica: local reads

Region: Tertiary (UAE)
  Kubernetes: 5–10 API pods
  Postgres Read Replica

Global:
  Cloudflare Load Balancer (GeoDNS)
  Cloudflare Workers: serve /api/queue from edge cache

Estimated monthly cost: $5 000–15 000/mo
```

### Required code changes (breaking)

1. **Replace polling with Supabase Realtime** in `App.tsx`:
   ```ts
   // Remove:
   setInterval(refreshDatabaseState, 5000);
   // Add:
   supabase.channel('tokens').on('postgres_changes', ..., (payload) => { ... }).subscribe();
   ```

2. **Split `/api/data`** into `GET /api/state/tokens`, `GET /api/state/settings`.

3. **Add `hospital_id` sharding** to all database queries.

4. **Deploy Cloudflare Workers** to serve `/api/queue` from the edge.

### SLO targets

| Metric | Target |
|---|---|
| p50 response | < 800 ms |
| p95 response | < 2 500 ms |
| Error rate | < 5% |
| Cache hit rate | > 95% |
| Realtime push latency | < 200 ms |

---

## Infrastructure Scaling Summary

| Users | Nodes | vCPU | RAM | Redis | Postgres | Monthly Cost |
|---|---|---|---|---|---|---|
| 1 000 | 1 | 2 | 2 GB | Free | Free | ~$5 |
| 5 000 | 2 | 4 total | 8 GB | Pay-as-you-go | Pro ($25) | ~$70 |
| 10 000 | 4 | 16 total | 32 GB | Pro 1M ops | Pro + PgBouncer | ~$250 |
| 50 000 | 12–16 pods | 48–64 | 96–128 GB | Cluster 6 nodes | Dedicated | ~$1 200 |
| 100 000 | 30+ pods | 120+ | 256 GB+ | Cluster 12 nodes | Multi-region | ~$8 000 |

---

## Bottleneck Priority Matrix

| Bottleneck | Affects tiers | Severity | Fix already in codebase? |
|---|---|---|---|
| Polling 5 s flood on `/api/queue` | ALL | 🔴 Critical | ✅ Redis 5 s TTL mitigates; Realtime needed at 50k+ |
| Single Node.js process CPU | 5k+ | 🔴 Critical | ✅ Horizontal scale via replicas |
| DB connection pool (100 default) | 10k+ | 🔴 Critical | ⚠️ PgBouncer config in Supabase dashboard |
| In-process rate limiter divergence | 5k+ | 🟠 High | ✅ Redis-backed `loginAttempts` key exists |
| `/api/data` payload size (65 kB) | 10k+ | 🟠 High | ⚠️ Needs endpoint split at 50k+ |
| BullMQ recalc stampede | 10k+ | 🟠 High | ✅ jobId deduplication already implemented |
| Redis single-node SPOF | 50k+ | 🟠 High | ❌ Needs Redis Cluster config |
| Supabase shared infra limits | 50k+ | 🟠 High | ❌ Needs Enterprise/self-hosted |
| Polling model at 100k | 100k | 🔴 Breaking | ❌ Needs Realtime/WebSocket replacement |
| Single-region latency | 100k | 🟡 Medium | ❌ Multi-region deployment |

**Legend:**  
✅ Already implemented  ⚠️ Config change only  ❌ Requires development

---

## k6 Load Test Execution Guide

### Prerequisites

```bash
# Install k6 (macOS)
brew install k6

# Install k6 (Linux)
sudo gpg -k
sudo gpg --no-default-keyring \
    --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
    --keyserver hkp://keyserver.ubuntu.com:80 \
    --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] \
    https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Install k6 (Windows)
winget install k6
```

### Test execution order

Always run in this order — each test builds on the previous:

```bash
# 1. Sanity check (local)
npm run test:smoke

# 2. Baseline performance (staging)
BASE_URL=https://staging.your-app.com ADMIN_USER=admin ADMIN_PASS=pass npm run test:load:1k

# 3. Medium load (staging with 2 replicas)
BASE_URL=https://staging.your-app.com ADMIN_USER=admin ADMIN_PASS=pass npm run test:load:5k

# 4. High load (staging with 4 replicas + PgBouncer)
BASE_URL=https://staging.your-app.com ADMIN_USER=admin ADMIN_PASS=pass npm run test:load:10k

# 5. Find the breakpoint
BASE_URL=https://staging.your-app.com ADMIN_USER=admin ADMIN_PASS=pass npm run test:breakpoint

# 6. Validate resilience
BASE_URL=https://staging.your-app.com ADMIN_USER=admin ADMIN_PASS=pass npm run test:stress
```

### Reading results

Key metrics to capture after each run:

```
http_req_duration..............: avg=XX    min=XX    med=XX    max=XX    p(90)=XX p(95)=XX
http_req_failed................: X.XX%
token_creation_time............: avg=XX    p(95)=XX
queue_poll_time................: avg=XX    p(95)=XX
cache_hits.....................: XXXXX
cache_misses...................: XXXXX
slow_requests..................: XXX
error_rate.....................: X.XX%
```

**Cache hit rate** = `cache_hits / (cache_hits + cache_misses)`.
Target: > 85% for `/api/queue` at all tiers.

**Breakpoint indicator**: When `http_req_failed` crosses 1% during ramp-up,
note the arrival rate (req/s) — that is your current system capacity.

### Result storage

Results are saved to `load-tests/results/`. Add to `.gitignore`:
```
load-tests/results/*.json
```

For trend analysis across runs, stream to InfluxDB:
```bash
k6 run --out influxdb=http://localhost:8086/k6 load-tests/scenarios/load-1k.js
```
Then import the k6 InfluxDB dashboard into Grafana (dashboard ID: 2587).
