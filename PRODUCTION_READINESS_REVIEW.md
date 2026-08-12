# InclusyQ — Production Readiness Review

**Date:** August 2026  
**Codebase:** 97 TypeScript/TSX files · ~8 000 source lines  
**Auditor:** Kiro AI Engineering Review

---

## Executive Summary

InclusyQ is a well-architected hospital queue management system that has been
iteratively hardened with enterprise patterns: Redis caching, BullMQ background
jobs, JWT authentication, Prometheus metrics, Sentry error tracking, structured
logging, security headers, and Docker-based deployment. The engineering quality is
high. The system is **production-capable for up to ~5 000 concurrent users today**
with specific configuration changes.

Three blockers prevent a clean production stamp at full scale:

1. **Zero test coverage** — no unit, integration, or contract tests exist.
2. **Rate limiter is in-process** — does not survive multiple replicas.
3. **TypeScript `strict: false`** in the API tsconfig — 196 `any` types go unchecked.

---

## Scores

| Category | Score | Grade |
|---|---|---|
| **Architecture** | 82 / 100 | B+ |
| **Security** | 76 / 100 | B |
| **Performance** | 84 / 100 | A– |
| **Scalability** | 68 / 100 | C+ |
| **Maintainability** | 61 / 100 | C |
| **Code Quality** | 65 / 100 | C |
| **Testing** | 3 / 100 | F |
| **Monitoring** | 88 / 100 | A– |
| **Deployment** | 79 / 100 | B |
| **DevOps** | 73 / 100 | B– |
| **Overall** | **68 / 100** | **C+** |

---

## Category 1 — Architecture (82/100)

### Strengths
- Clean MVC separation: controllers → services → repositories
- Redis cache layers per domain with typed key registry
- BullMQ background jobs with DLQ, retry, and graceful shutdown
- Supabase query builder used throughout (parameterized, safe)
- Lazy-loaded frontend chunks with correct code splitting

### Weaknesses

#### W1 — Monolithic `/api/data` endpoint
**Problem:** A single `GET /api/data` endpoint fetches 10 tables in parallel and returns a 65 kB JSON payload. Every dashboard, TV display, and receptionist polls this every 5 seconds.

**Impact:** At 5 000 concurrent users, this endpoint alone generates 200 req/s × 65 kB = 13 MB/s of outbound data from the API server. The response contains data the caller does not need (patients list on TV, users list on TVDisplay, etc.).

**Priority:** High

**Solution:** Introduce granular domain endpoints. Split into `GET /api/state/queue`, `GET /api/state/settings`, `GET /api/state/static`. Each client fetches only its slice. Pair with Supabase Realtime subscriptions to eliminate polling entirely for queue state.

**Estimated effort:** 3 days backend + 2 days frontend

---

#### W2 — 5-second polling instead of push
**Problem:** `App.tsx` uses `setInterval(refreshDatabaseState, 5000)`. At scale, 10 000 open tabs generate 2 000 req/s to a single origin, the majority being cache hits on unchanged data.

**Impact:** 100% avoidable network traffic. Each poll wakes the event loop, deserializes 65 kB JSON, and re-renders all state-consuming components.

**Priority:** High

**Solution:**
```ts
// Replace setInterval in App.tsx with Supabase Realtime:
supabase.channel('queue-updates')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tokens' }, 
      (payload) => updateLocalToken(payload.new))
  .subscribe();
```
`TrackToken.tsx` already does this correctly — replicate the pattern app-wide.

**Estimated effort:** 2 days

---

#### W3 — `require()` in ESM TypeScript files
**Problem:** `api/jobs/queues.ts` and `api/jobs/scheduler.ts` use `require('ioredis')` inside TypeScript ESM modules. The project uses `"module": "NodeNext"` in `tsconfig.api.json` which means these calls bypass TypeScript's module graph and cannot be statically analyzed or tree-shaken.

**Impact:** Build warnings, potential runtime failures in strict ESM environments, breaks IDE import resolution.

**Priority:** Medium

**Solution:** Replace `require('ioredis')` with a proper ESM import:
```ts
import { Redis } from 'ioredis';
```
Move the instantiation into a factory function that is only called at runtime.

**Estimated effort:** 2 hours

---

#### W4 — Auth not integrated with App.tsx polling
**Problem:** `AuthContext.tsx` manages JWT tokens and auto-refresh, but `App.tsx`'s `refreshDatabaseState()` uses a plain `fetch('/api/data')` call with no `Authorization` header. All polling requests are unauthenticated.

**Impact:** `/api/data` works today because it does not require auth, but this means the data endpoint is publicly readable — any unauthenticated user can poll full hospital state including patient names, mobile numbers, and queue data.

**Priority:** Critical

**Solution:** The `apiClient` in `src/utils/apiClient.ts` already handles JWT injection. Replace the raw `fetch('/api/data')` in `App.tsx` with `apiClient.get('/api/data')`. Require `requireJwtAuth` on `GET /api/data`.

**Estimated effort:** 2 hours

---

## Category 2 — Security (76/100)

### Strengths
- JWT dual-token with HTTP-only refresh cookie, SameSite=Strict
- Bcrypt 12 rounds, brute-force protection, account lockout
- Security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy)
- SQL injection impossible: 100% parameterized queries via Supabase builder
- Input validation schemas for all admin endpoints
- Output sanitization, sensitive field stripping

### Weaknesses

#### S1 — `/api/data` is publicly readable
**Problem:** `GET /api/data` has no authentication check. It returns all patients (last 30 days), all doctors, all users, all tokens, and hospital settings.

**Impact:** Any unauthenticated request to `https://your-app.com/api/data` returns PII: patient names, phone numbers, ages, genders. This is a HIPAA violation and a GDPR violation.

**Priority:** Critical (blocker)

**Solution:**
```ts
// api/index.ts — add before getDataHandler:
if (!(await requireJwtAuth(req, res))) return;
```

**Estimated effort:** 30 minutes

---

#### S2 — Access token stored in `localStorage`
**Problem:** `AuthContext.tsx` stores the JWT access token in `localStorage`. LocalStorage is accessible to any JavaScript running on the page, including injected third-party scripts. An XSS attack (even from a CDN dependency) can exfiltrate the token.

**Impact:** Token theft leads to full account compromise for the token's 15-minute lifetime. The refresh token in an HTTP-only cookie is protected — but the access token is not.

**Priority:** High

**Solution:** Store the access token in memory only (React state). On page refresh, immediately call `POST /api/auth/refresh` to get a new access token using the HTTP-only cookie. The access token never touches disk or localStorage.

```ts
// AuthContext.tsx — remove:
localStorage.setItem('accessToken', data.accessToken);
// Keep only in React state: setAccessToken(data.accessToken);
```

**Estimated effort:** 4 hours

---

#### S3 — CSRF protection is `opt-in` disabled by default
**Problem:** `csrfProtection.ts` allows all requests through unless `STRICT_CSRF=true` is set. Without this env var, the `console.warn('⚠️ Potential CSRF attempt...')` fires but the request proceeds.

**Impact:** A malicious website can make state-changing requests (creating tokens, calling patients) on behalf of logged-in users using their cookies, because the CSRF check is a soft warning by default.

**Priority:** High

**Solution:** Flip the default. Block unless explicitly allowed:
```ts
// csrfProtection.ts
if (process.env.STRICT_CSRF !== 'false') {  // block by default
  return res.status(403).json({ ... });
}
```

**Estimated effort:** 1 hour

---

#### S4 — `console.log` in `AuthContext.tsx` leaks auth events to the browser console
**Problem:** `AuthContext.tsx` contains multiple `console.log('[Auth] Login successful:', data.user.username)` and `console.log('[Auth] Token refreshed...')` calls that log auth state to the browser console in production.

**Impact:** Browser console output is visible to anyone with DevTools open. In a hospital public terminal, this exposes the current user's identity. The Vite `esbuild.drop: ['console']` in production builds should strip these — but only if `NODE_ENV=production` is set at build time with VITE_ vars.

**Priority:** Medium

**Solution:** Use the Pino logger for server-side; for client-side, conditional debug only:
```ts
if (process.env.NODE_ENV === 'development') console.log('[Auth]', ...);
```

**Estimated effort:** 1 hour

---

#### S5 — `unsafe-inline` and `unsafe-eval` in CSP
**Problem:** The Content Security Policy in `securityHeaders.ts` allows `'unsafe-inline'` and `'unsafe-eval'` for scripts. This effectively disables the script injection protection that CSP provides.

**Impact:** XSS through injected inline scripts is not blocked by the CSP. The header is present but does not provide meaningful protection.

**Priority:** Medium

**Solution:** Vite nonces are needed for truly strict CSP with a bundled app. In the interim, remove `unsafe-eval` (Vite production builds do not need it) and move toward nonce-based CSP.

**Estimated effort:** 1 day (testing required)

---

#### S6 — `validateObjectKeys` breaks backward compatibility
**Problem:** `validateObjectKeys` in `validation.ts` throws if any key is not in the allowed list. The token creation payload in real usage likely includes fields like `estimatedConsultationTime`, `customMessage`, `patientEmail` — but these are not in `validateCreateTokenRequest`'s `allowedKeys`. 

**Impact:** Legitimate requests from the frontend that include additional fields will return 400 errors.

**Priority:** Medium

**Solution:** Audit all allowed-key lists against actual frontend payloads. Run the smoke test with the validator enabled to catch mismatches.

**Estimated effort:** 2 hours

---

## Category 3 — Performance (84/100)

### Strengths
- Redis cache with domain-specific TTLs and ETag/304 support
- `batchUpdateTokens` RPC — eliminates N+1 write pattern
- `React.memo()` on all 4 heavy components
- `useMemo` on all derived arrays in ReceptionDashboard
- `useCallback` on `refreshDatabaseState`
- Visibility-aware polling (pauses on hidden tab)
- BullMQ job deduplication (same dept → same jobId)
- Lazy-loaded React chunks, 91% smaller main bundle

### Weaknesses

#### P1 — `getReceptionTokenStats` still runs per render when tokens change
**Problem:** The memoized `tokenStatsMap` in `ReceptionDashboard.tsx` is correct, but it recomputes on every `allowedTokens` change. Since `allowedTokens` is also memoized with `[tokens, currentUser]` deps, and `tokens` is replaced every 5 seconds, the full O(n log n) sort runs every 5 seconds.

**Impact:** With 100 tokens and 5 doctors, each recalculation is cheap (~1 ms). But it confirms polling is the root cause of all rendering overhead, not memoization quality.

**Priority:** Low (addressed by eliminating polling, W2)

**Solution:** Eliminate the interval. The recalc cost drops to zero.

---

#### P2 — Database query instrumentation is a Proxy, not native hooks
**Problem:** `api/config/supabase.ts` wraps the Supabase client in a JavaScript `Proxy` to intercept `.from()` and `.rpc()` calls. This adds 1–3 function call layers per query.

**Impact:** Negligible at 1k users (~5 µs per query). At 50k users with 6 000 DB queries/min, the Proxy interception adds ~0.5% CPU overhead — not meaningful but architecturally fragile.

**Priority:** Low

**Solution:** Supabase does not expose native query hooks. The Proxy is acceptable for now. Remove when migrating to a direct Postgres driver (pg/postgres.js) at the 50k tier.

---

## Category 4 — Scalability (68/100)

### Strengths
- Redis cache absorbs ~90% of `/api/queue` reads
- BullMQ allows horizontal worker scaling
- Domain-specific cache invalidation (not full-cache flush)
- Dockerfile and docker-compose ready
- k6 load tests defined for all 5 tiers

### Weaknesses

#### SC1 — In-process rate limiter does not work across replicas
**Problem:** `api/middleware/rateLimiter.ts` stores rate limit counts in a module-level JavaScript object (`const rateLimitStore: RateLimitStore = {}`). Each process instance has its own store. With 4 app replicas, a user can make 4× the allowed requests by hitting different replicas.

**Impact:** At 5 000+ users (which requires 2+ replicas), brute-force protection is ineffective. An attacker can attempt 20 login tries in 15 minutes (5 per replica × 4 replicas) instead of 5.

**Priority:** High (must fix before horizontal scaling)

**Solution:** The Redis `CacheKeys.loginAttempts` key and `cacheManager.incr()` are already implemented. Wire `rateLimiter.ts` to use Redis when available:

```ts
// api/middleware/rateLimiter.ts
export function createRateLimiter(maxRequests, windowMs, message) {
  return async (req, res) => {
    const clientId = getClientId(req);
    const key = `iq:ratelimit:${clientId}`;

    // Redis path (distributed, correct)
    if (isRedisAvailable()) {
      const count = await cacheManager.incr(key, Math.ceil(windowMs / 1000));
      if (count > maxRequests) { return res.status(429)...; }
      return true;
    }
    // In-memory fallback (single-node only — acceptable for dev)
    ...
  };
}
```

**Estimated effort:** 3 hours

---

#### SC2 — `setInterval` in `rateLimiter.ts` runs in every Vercel function instance
**Problem:** `rateLimiter.ts` calls `setInterval()` at module load time to clean the in-memory store. In Vercel serverless, each cold start creates a new interval. In Express, multiple require() calls do not, but it still runs on every warm process.

**Impact:** Memory leak risk in long-lived processes. Minor in serverless (each instance is short-lived).

**Priority:** Low

**Solution:** Upgrade to Redis-backed rate limiting (SC1) which eliminates the need for the interval entirely.

---

#### SC3 — `NullQueue` silently drops jobs when Redis is unavailable in production
**Problem:** When `REDIS_URL` is not set, `NullQueue.add()` logs a debug message and returns `{ id: 'inline-...' }` — but the job is never actually executed. Emails, WhatsApp notifications, queue recalculations, and audit logs are silently discarded.

**Impact:** If `REDIS_URL` is accidentally unset in production, the system appears to work (no errors) but emails stop, queue wait times stop updating, and audit logs are lost.

**Priority:** High

**Solution:** In production, fail loudly:
```ts
// api/jobs/queues.ts NullQueue.add()
if (process.env.NODE_ENV === 'production') {
  throw new Error(`[NullQueue] REDIS_URL not set in production — job ${jobName} cannot be enqueued`);
}
// Dev-only fallback below
```

**Estimated effort:** 30 minutes

---

## Category 5 — Maintainability (61/100)

### Strengths
- Controllers are thin, services own business logic
- Repository pattern isolates all DB access
- Consistent file naming conventions
- Typed job payloads (jobTypes.ts)
- Single-source-of-truth for cache keys (keys.ts)

### Weaknesses

#### M1 — `strict: false` in API TypeScript config
**Problem:** `tsconfig.api.json` has `"strict": false`. This means null checks, implicit any, and optional chaining issues are not caught at compile time. Confirmed: 196 instances of `: any` or `as any` across the API codebase.

**Impact:** Every `as any` is a potential runtime `TypeError` or security issue that TypeScript would catch if strict mode were enabled. Example: `(req as any).user` is used in 8 places — if `requireJwtAuth` is not called first, `user` is `undefined` and the cast hides this.

**Priority:** High

**Solution:** Enable `"strict": true` in `tsconfig.api.json` and fix the resulting errors. Address `any` types incrementally. Start with the security-critical paths (`(req as any).user`).

**Estimated effort:** 2–3 days (fix cascade)

---

#### M2 — No linting or formatting toolchain
**Problem:** There is no `.eslintrc`, `eslint.config.js`, or `.prettierrc` file. Code style is enforced only by convention.

**Impact:** No automated enforcement of import order, unused variables, consistent arrow function style, or React hook rules. Inconsistencies accumulate over time.

**Priority:** Medium

**Solution:**
```bash
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin \
  eslint-plugin-react-hooks prettier eslint-config-prettier
```
Add to CI pipeline: `npm run lint && npm run format:check`.

**Estimated effort:** 4 hours setup + 1 day fixing existing violations

---

#### M3 — `server.ts` uses `require()` inside an `import()` call path at runtime
**Problem:** `server.ts` uses `const { generateErrorId } = require('./api/config/logger.js')` in the Express error handler. This is a CommonJS `require()` inside an ESM module, which works in Node.js due to interop but is fragile and bypasses TypeScript type checking.

**Impact:** If `api/config/logger.js` changes its export structure, this silently becomes `undefined` at runtime rather than failing at compile time.

**Priority:** Low

**Solution:** Replace with an ESM import at the top of the file.

---

#### M4 — Hardcoded hospital name fallback
**Problem:** `api/services/queueService.ts` contains the string `'St. Jude Memorial Hospital'` as a hardcoded fallback when `settings.hospital_info.name` is null. This is a demo artifact that should not ship.

**Impact:** If the settings row is missing, all WhatsApp notifications will be sent from the wrong hospital name. Low probability but hard to debug.

**Priority:** Low

**Solution:** Remove the fallback. Throw an error or return empty string, requiring explicit configuration.

---

#### M5 — Footer displays `(In-Memory File Sandbox)` text
**Problem:** `App.tsx` renders `"Database state: HIPAA Secured (In-Memory File Sandbox)"` in the footer on every authenticated view. This is legacy copy from the prototyping phase.

**Impact:** Looks unprofessional in production. Patients and staff see "File Sandbox" which undermines confidence.

**Priority:** Low

**Solution:** Update to `"Supabase · End-to-End Encrypted"` or similar accurate copy.

**Estimated effort:** 5 minutes

---

## Category 6 — Code Quality (65/100)

### Strengths
- Consistent async/await throughout
- No circular dependencies detected
- ESM-first with proper `.js` extensions in imports
- Well-commented infrastructure code
- Structured error types (ValidationError, etc.)

### Weaknesses

#### Q1 — 196 `any` types in API code
See M1 above. This is the primary code quality issue.

---

#### Q2 — `refreshToken` in `AuthContext.tsx` is inside a `useEffect` dependency array violation
**Problem:** The `useEffect` at line ~160 of `AuthContext.tsx` calls `refreshToken()` inside, but `refreshToken` is not in the dependency array. The eslint-plugin-react-hooks rule `exhaustive-deps` would flag this.

**Impact:** The auto-refresh interval captured the `refreshToken` from the first render. If `logout()` was called and `accessToken` changed, the interval still holds a stale closure of `refreshToken`.

**Priority:** Medium

**Solution:** Wrap `refreshToken` in `useCallback` with `[logout]` as deps, or restructure with a `useRef` to always call the latest version.

---

#### Q3 — Smoke test `setup()` blocks VUs if login fails
**Problem:** In `load-tests/scenarios/smoke.js`, if `login()` fails in `setup()`, the function logs a warning and returns `{ token: null }`. All 5 VUs then proceed to call `receptionistWorkflow(null)` which calls `createToken(null)` — sending `Authorization: Bearer null` headers to the API.

**Impact:** The smoke test produces misleading results (appears to run, but all token operations fail silently).

**Priority:** Low

**Solution:**
```js
export function setup() {
  const token = login(...);
  if (!token) fail('[Smoke] Login failed — aborting test');
  return { token };
}
```

---

## Category 7 — Testing (3/100)

### Current State
**Zero test files.** No unit tests, no integration tests, no API contract tests, no component tests. The `3/100` score reflects that k6 load test scripts exist (the only executable test artefacts).

### What is missing

| Test type | Purpose | Coverage today |
|---|---|---|
| Unit tests (services) | Verify `tokenService`, `queueService`, `authService` logic | 0% |
| Integration tests (API) | Verify HTTP handler → service → DB flows | 0% |
| Component tests (React) | Verify UI renders correctly for all states | 0% |
| Contract tests | Verify frontend API calls match backend schemas | 0% |
| Security tests | Verify auth, CSRF, rate limit enforcement | 0% |
| Load tests (k6) | Verify performance at scale | Defined, not executed |

### Weaknesses

#### T1 — Zero automated tests is a production blocker
**Problem:** There are no automated tests of any kind.

**Impact:**
- Every deployment is a manual smoke test
- Refactors risk silent regressions
- No way to verify that security fixes actually work
- Cannot confidently merge PRs

**Priority:** Critical (blocker)

**Solution — Minimum viable test suite (implement in order):**

1. **API integration tests** (highest ROI — test the full stack):
```bash
npm install -D vitest @vitest/coverage-v8 supertest msw
```

```ts
// api/__tests__/tokens.test.ts
describe('POST /api/tokens', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/tokens').send({...});
    expect(res.status).toBe(401);
  });
  it('creates a token with valid JWT', async () => { ... });
  it('validates required fields', async () => { ... });
});
```

2. **Service unit tests** (pure functions, fast):
```ts
// api/__tests__/queueService.test.ts
describe('getPriorityWeight', () => {
  it.each([
    ['VIP', 4], ['Senior Citizen', 1], ['Normal', 0],
  ])('"%s" → %d', (priority, expected) => {
    expect(getPriorityWeight(priority)).toBe(expected);
  });
});
```

3. **Auth security tests:**
```ts
describe('brute force protection', () => {
  it('locks account after 5 failed attempts', async () => { ... });
  it('rejects expired JWT', async () => { ... });
  it('prevents token replay after logout', async () => { ... });
});
```

**Target for production readiness:** 60% coverage on services, 80% on auth flows.

**Estimated effort:** 5–8 days initial suite

---

## Category 8 — Monitoring (88/100)

### Strengths
- Pino structured JSON logging with redaction
- Prometheus metrics: HTTP, DB, cache, job, token, auth, memory
- Health / readiness / liveness endpoints
- Sentry error tracking with `errorId` correlation
- Request IDs propagated through log lines
- Grafana dashboard (15 panels, ready to import)
- DLQ alerting hooks for BullMQ failures
- DB query timing via Supabase Proxy wrapper
- Slow request detection

### Weaknesses

#### MN1 — Pino `logger.ts` is created but never imported in main request path
**Problem:** `api/config/logger.ts` defines the Pino singleton but `api/index.ts` still uses `startRequestLog` from `requestLogger.ts` which imports from `logger.ts`. The logger works via `requestLogger`. However, most service files (`tokenService.ts`, `queueService.ts`, `adminController.ts`) still use `console.log/error` rather than the structured logger.

**Impact:** Service-layer errors go to unstructured stdout instead of structured JSON, breaking log aggregation pipelines (Datadog, Loki, CloudWatch).

**Priority:** Medium

**Solution:** Replace `console.log/error` in service files with `import { logger } from '../config/logger.js'`:
```ts
// Before:
console.error('[tokenService] create error:', err);
// After:
logger.child({ service: 'tokenService' }).error({ err }, 'Token creation failed');
```

**Estimated effort:** 4 hours

---

#### MN2 — No alerting rules defined
**Problem:** The Prometheus config scrapes metrics but no alerting rules exist (`rule_files` in `prometheus.yml` is commented out). No `ALERT` rules for high error rate, slow DB, heap pressure, or DLQ depth.

**Impact:** Issues are visible in Grafana dashboards but do not trigger pages or Slack alerts automatically.

**Priority:** Medium

**Solution:** Create `monitoring/alerts.yml`:
```yaml
groups:
  - name: inclusyq
    rules:
      - alert: HighErrorRate
        expr: rate(iq_http_requests_total{status_code=~"5.."}[5m]) > 0.05
        for: 2m
        annotations:
          summary: "Error rate above 5% for 2 minutes"
      - alert: SlowQueries
        expr: rate(iq_db_slow_queries_total[5m]) > 1
        for: 1m
```

**Estimated effort:** 3 hours

---

## Category 9 — Deployment (79/100)

### Strengths
- Multi-stage Dockerfile (deps → builder → production)
- Non-root user in container
- `tini` as PID 1 for proper signal handling
- HEALTHCHECK in Dockerfile using `/api/live`
- Docker Compose with full monitoring stack
- Production override (`docker-compose.prod.yml`)
- CI validates Docker build without pushing

### Weaknesses

#### D1 — Dockerfile copies all `api/` TypeScript and runs with `tsx` in production
**Problem:** The production Dockerfile copies `.ts` source files and runs them with `tsx` at startup. `tsx` is a development transpiler — it JIT-compiles TypeScript on every cold start. This adds 2–5 seconds to cold start time and means TypeScript errors are caught at runtime, not at build time.

**Impact:** Slower startup. Docker image contains unnecessary TypeScript source files (security concern — source code visible if container is compromised). TypeScript errors only surface at runtime.

**Priority:** Medium

**Solution:** Add a proper `tsc` compilation step to the Dockerfile and run the compiled JavaScript directly:
```dockerfile
FROM builder AS compiler
RUN npx tsc -p tsconfig.api.json --outDir dist/api --noEmit false

FROM production
COPY --from=compiler /app/dist/api ./api
CMD ["node", "server.js"]
```

**Estimated effort:** 4 hours

---

#### D2 — No database migration CI step
**Problem:** The CI pipeline (`.github/workflows/ci.yml`) has no step to validate migrations. If a migration SQL file contains a syntax error, it is not caught until manual execution.

**Impact:** A broken migration file passes CI but fails in production, causing deployment rollback.

**Priority:** Medium

**Solution:** Add a migration validation step to CI using Supabase CLI:
```yaml
- name: Validate migrations
  run: |
    npx supabase db diff --local 2>&1 | grep -q "No schema changes"
    echo "Migrations are clean"
```

**Estimated effort:** 2 hours

---

#### D3 — Image tag `latest` used in production deploy
**Problem:** `docker-compose.prod.yml` uses `${IMAGE_TAG:-latest}`. If `IMAGE_TAG` is not set, it deploys `latest` — which could be any image.

**Impact:** Accidental rollback or forward deployment to an unintended image version.

**Priority:** Low

**Solution:** Remove the `:latest` fallback. Require `IMAGE_TAG` explicitly:
```yaml
image: ghcr.io/${GITHUB_REPOSITORY}/inclusyq:${IMAGE_TAG:?IMAGE_TAG is required}
```

---

## Category 10 — DevOps (73/100)

### Strengths
- GitHub Actions CI: typecheck, build, security audit, Docker validate
- CD pipeline: build + push to GHCR + Railway deploy + health check
- SLSA Level 2 provenance attestation on Docker images
- SBOM generation
- Slack failure notifications
- `npm ci --frozen-lockfile` enforced
- Graceful SIGTERM/SIGINT shutdown in server.ts

### Weaknesses

#### DV1 — No `engines` field in `package.json`
**Problem:** `package.json` has no `"engines": { "node": ">=22" }` field. Contributors can run the project on Node 18 or 20 where some ES2022 features behave differently.

**Priority:** Low

**Solution:**
```json
"engines": { "node": ">=22.0.0", "npm": ">=10.0.0" }
```
Add `--use-node-version 22` to the Railway project settings.

**Estimated effort:** 10 minutes

---

#### DV2 — Security audit is `continue-on-error: true`
**Problem:** In `ci.yml`, `npm audit --audit-level=high` has `continue-on-error: true` meaning high/critical vulnerabilities do not fail CI.

**Impact:** High-severity vulnerabilities are discovered and logged but do not block merge. Over time, the audit becomes noise.

**Priority:** Medium

**Solution:** Remove `continue-on-error: true`. Address the current `10 vulnerabilities (4 moderate, 6 high)` from installed packages before flipping this switch. Most are likely transitive dependencies with `npm audit fix` available.

**Estimated effort:** 2 hours to fix + CI change

---

#### DV3 — No `CHANGELOG.md` or `LICENSE` file
**Problem:** There is no changelog tracking what changed between deployments, and no LICENSE file.

**Impact:** Operational: without a changelog, it is impossible to know what a deployed version contains. Legal: without a LICENSE, the code is technically "all rights reserved" and cannot be used by contributors or deployed commercially.

**Priority:** Low (unless commercial deployment)

**Estimated effort:** 1 hour

---

---

# Production Readiness Roadmap

```
CURRENT STATE                   PRODUCTION READY              ENTERPRISE READY           100k USERS
(today)                         (30 days)                     (90 days)                  (6–12 months)
     │                               │                              │                         │
     ▼                               ▼                              ▼                         ▼
```

## Phase 0 → Phase 1: Production Ready (30 days)

**These are blockers. Do not deploy to production without them.**

| # | Task | Owner | Effort | Priority |
|---|---|---|---|---|
| 0.1 | Require auth on `GET /api/data` (W4, S1) | Backend | 30 min | 🔴 Critical |
| 0.2 | Move access token out of localStorage (S2) | Frontend | 4h | 🔴 Critical |
| 0.3 | Flip CSRF to block-by-default (S3) | Backend | 1h | 🔴 Critical |
| 0.4 | Fix NullQueue to throw in production (SC3) | Backend | 30 min | 🔴 Critical |
| 0.5 | Write minimum viable test suite — auth + token service (T1) | Backend | 5 days | 🔴 Critical |
| 0.6 | Migrate rate limiter to Redis (SC1) | Backend | 3h | 🔴 High |
| 0.7 | Fix `require()` → ESM imports (W3) | Backend | 2h | 🟠 High |
| 0.8 | Enable `strict: true` in tsconfig.api.json + fix errors (M1) | Backend | 2 days | 🟠 High |
| 0.9 | Remove `console.log` from `AuthContext.tsx` (S4) | Frontend | 1h | 🟠 High |
| 0.10 | Add ESLint + Prettier to project and CI (M2) | DevOps | 4h | 🟠 High |
| 0.11 | Fix smoke test to `fail()` on login error (Q3) | QA | 30 min | 🟡 Medium |
| 0.12 | Remove hardcoded hospital name fallback (M4) | Backend | 15 min | 🟡 Medium |
| 0.13 | Update footer copy (M5) | Frontend | 5 min | 🟢 Low |

**Exit criteria for Phase 1:**
- [ ] `GET /api/data` returns 401 without a valid JWT
- [ ] Access token is memory-only, never in localStorage
- [ ] `npm test` runs and passes with >60% service coverage
- [ ] `npm run lint` returns 0 errors
- [ ] All 10 npm audit vulnerabilities resolved
- [ ] Smoke test passes with real credentials

---

## Phase 1 → Phase 2: Enterprise Ready (90 days)

**These harden the system for multi-team, multi-hospital use with SLAs.**

| # | Task | Owner | Effort | Priority |
|---|---|---|---|---|
| 1.1 | Replace polling with Supabase Realtime (W2) | Full-stack | 2 days | 🔴 Critical |
| 1.2 | Split `/api/data` into domain endpoints (W1) | Backend | 3 days | 🔴 High |
| 1.3 | Compile TypeScript API at build time, run JS (D1) | DevOps | 4h | 🟠 High |
| 1.4 | Add Prometheus alerting rules (MN2) | DevOps | 3h | 🟠 High |
| 1.5 | Replace `console.*` in services with Pino (MN1) | Backend | 4h | 🟠 High |
| 1.6 | Add integration test suite — all API endpoints (T1) | QA | 5 days | 🟠 High |
| 1.7 | Add React component test suite (T1) | Frontend | 3 days | 🟠 High |
| 1.8 | Add migration CI validation (D2) | DevOps | 2h | 🟠 High |
| 1.9 | Remove `unsafe-inline`/`unsafe-eval` from CSP (S5) | Security | 1 day | 🟡 Medium |
| 1.10 | Multi-tenancy: add `hospital_id` to all tables | Backend | 1 week | 🟡 Medium |
| 1.11 | Add role permission management UI | Full-stack | 3 days | 🟡 Medium |
| 1.12 | Add `engines` to package.json, pin Node version (DV1) | DevOps | 10 min | 🟢 Low |
| 1.13 | Fix `continue-on-error` on security audit (DV2) | DevOps | 2h | 🟢 Low |
| 1.14 | Add CHANGELOG.md and LICENSE (DV3) | Admin | 1h | 🟢 Low |

**Exit criteria for Phase 2:**
- [ ] Zero polling on frontend — all updates via Realtime
- [ ] Test coverage: >80% services, >70% API endpoints, >60% components
- [ ] All `console.*` replaced with structured Pino logging
- [ ] Prometheus alerts firing correctly (test with `amtool alert add`)
- [ ] Multi-tenant data isolation verified by test
- [ ] 0 `any` types in auth-critical code paths

---

## Phase 2 → Phase 3: 100k Concurrent Users (6–12 months)

**These require architectural changes and infrastructure investment.**

| # | Task | Owner | Effort | Priority |
|---|---|---|---|---|
| 2.1 | Kubernetes deployment with HPA (min 8, max 50) | DevOps | 1 week | 🔴 Critical |
| 2.2 | Redis Cluster (6-node, 3 primary + 3 replica) | Infra | 3 days | 🔴 Critical |
| 2.3 | Postgres primary + 2 read replicas, PgBouncer pool=1000 | Infra | 3 days | 🔴 Critical |
| 2.4 | Separate BullMQ worker Deployment (not co-located with API) | DevOps | 1 day | 🔴 Critical |
| 2.5 | Cloudflare Worker to serve `/api/queue` from edge | Frontend | 2 days | 🟠 High |
| 2.6 | Multi-region deployment (Singapore + India + UAE) | Infra | 1 week | 🟠 High |
| 2.7 | Database sharding by `hospital_id` | Backend | 2 weeks | 🟠 High |
| 2.8 | Replace `/api/data` with WebSocket subscriptions | Full-stack | 2 weeks | 🟠 High |
| 2.9 | Distributed tracing (OpenTelemetry → Jaeger/Tempo) | DevOps | 3 days | 🟡 Medium |
| 2.10 | Performance regression CI (k6 baseline comparison) | QA | 2 days | 🟡 Medium |
| 2.11 | Chaos engineering tests (pod kill, Redis failover) | QA | 1 week | 🟡 Medium |
| 2.12 | API versioning (`/api/v2/`) for backward compat | Backend | 2 days | 🟡 Medium |
| 2.13 | GDPR data export and deletion endpoints | Backend | 3 days | 🟡 Medium |
| 2.14 | SOC 2 / HIPAA audit trail report generation | Backend | 1 week | 🟡 Medium |

**Exit criteria for Phase 3:**
- [ ] k6 load-10k test passes all thresholds on staging
- [ ] Single pod restart triggers zero request failures (readiness probe correct)
- [ ] Redis node failure triggers automatic failover within 30 s
- [ ] `/api/metrics` shows cache hit rate >90% under 10k user load
- [ ] p95 < 900 ms under 10k concurrent users (per thresholds.js)
- [ ] Zero data leakage between hospital tenants (multi-tenant test)

---

## Summary Score Card

```
Phase 0 (Production Ready — 30 days)
  ├── Security fixes:       2.5 days
  ├── Testing foundation:   5 days
  ├── Type safety:          2 days
  └── Config/lint:          1.5 days
  Total: ~11 days of engineering work

Phase 1 (Enterprise Ready — 90 days)
  ├── Realtime + API split: 5 days
  ├── Testing maturity:     8 days
  ├── Multi-tenancy:        1 week
  └── DevOps hardening:     3 days
  Total: ~4–5 weeks of engineering work

Phase 2 (100k users — 6–12 months)
  ├── Infrastructure:       3 weeks
  ├── Architecture changes: 6 weeks
  ├── Compliance:           2 weeks
  └── Testing & chaos:      2 weeks
  Total: ~3 months of engineering work
```

---

## The Single Most Important Action

Before any other work: **add the `requireJwtAuth` check to `GET /api/data`.**

The current API is leaking patient PII (names, phone numbers, ages) and complete hospital operational data to any unauthenticated HTTP request. This is a production blocker that takes 30 minutes to fix.

```ts
// api/index.ts — add these two lines:
if (path === '/api/data' && method === 'GET') {
  if (!(await apiRateLimiter(req, res))) return;
  if (!(await requireJwtAuth(req, res))) return;   // ← ADD THIS
  return wrapAsync(getDataHandler)(req, res);
}
```
