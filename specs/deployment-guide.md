# Deployment Guide — InclusyQ (SQ-MAJ-005 + SQ-CRIT-003 hardening)

## 1. Endpoints

| Endpoint | Auth | Purpose | Notes |
|---|---|---|---|
| `GET /api/live` | None | Liveness probe (process-only, heap check) | Public LB/K8s probe. `Cache-Control: no-store` |
| `GET /api/ready` | None | Readiness (Supabase reachable) | Traffic gate. `Cache-Control: no-store` |
| `GET /api/health` | None | Full report (deps, memory, loadAvg) | Verbose by design — keep behind VPC/internal LB in prod; never cache (`no-store` kept) |
| `GET /api/metrics` | Bearer `METRICS_TOKEN` (when set) | Prometheus exposition | **Must** have token in prod/staging. `Cache-Control: no-store` kept |

## 2. Environment variables

| Var | Required | Scope |
|---|---|---|
| `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD` | Yes (compose fails fast if unset) | Compose monitoring only |
| `METRICS_TOKEN` | Yes in prod/staging, blank dev-only | App + Prometheus `bearer_token_file` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only, never `VITE_` prefixed |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Yes, 64+ hex chars | Server-only |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Yes at build | Baked into bundle (public, RLS-protected) |
| `SENTRY_DSN` | Optional | Error tracking |

Copy `.env.example` → gitignored `.env` / `.env.local`. Secrets only via env vars or secret store — never in code, images, or `prometheus.yml`.

## 3. Build & run

```bash
npm ci && npm run build          # frontend → dist/
docker build -t inclusyq:latest .                      # multi-stage, non-root `inclusyq`
docker compose up --build          # dev: app + redis + prometheus + grafana
docker compose up app redis        # without monitoring
```

Prometheus with token: `printf '%s' "$METRICS_TOKEN" > monitoring/.metrics_token && chmod 600`,
then uncomment `bearer_token_file` in `monitoring/prometheus.yml` + the volume in `docker-compose.yml`.

## 4. Monitoring

Prometheus scrapes `app:3000/api/metrics` every 15s. Ports bound to `127.0.0.1`
(redis 6379, prometheus 9090, grafana 3001) — no LAN exposure.
Prometheus `--web.enable-lifecycle` / `--web.enable-admin-api` removed (had `/-/quit` + admin API).
Alerts: error-rate >1%/5min (critical), p95 >2s (warning), SSL <14d (warning).

## 5. Rollback

```bash
docker tag inclusyq:latest inclusyq:rollback-$(date +%Y%m%d-%H%M%S)
# re-deploy previous tag, then:
curl --fail http://localhost:3000/api/live && curl --fail http://localhost:3000/api/ready
```

DB migrations: backup before deploy (`pg_dump`), migration job separate from app rollout.

## 6. Verification (2026-09-22)

- `docker compose config` without Grafana vars → fails fast with guidance ✅
- Rendered config: env creds, 3× `127.0.0.1`, `METRICS_TOKEN` passthrough, no admin-api flags ✅
- `npm audit`: 15 → 13 vulns; express/multer/qs entries cleared, `xss-clean` purged from lockfile ✅
- `.dockerignore` covers `.env*` + `db.json`; Dockerfile copies no secrets/PII; `db.json` (synthetic PII) now gitignored ✅

## 7. Follow-ups (not DevOps scope)

- `@node-developer`: fail startup when `NODE_ENV=production` and `METRICS_TOKEN` blank; confirm `validator`+`dompurify` cover all former `xss-clean` paths (no imports remain — safe).
- Remaining `npm audit` items (transitive: react-router, nodemailer, nanoid, esbuild, postcss, vercel) → scheduled `npm audit fix` + major-bump review.
