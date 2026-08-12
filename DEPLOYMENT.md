# InclusyQ — Production Deployment Guide

## Why Vercel Is Partially Unsuitable for This Stack

InclusyQ has grown well beyond what Vercel's Serverless Functions model supports cleanly. Here's a precise breakdown:

| Feature | Vercel Serverless | Status |
|---|---|---|
| React frontend (SPA) | ✅ Excellent fit | Fully supported |
| REST API (stateless handlers) | ✅ Good fit | Supported via `api/*.ts` |
| JWT auth, Supabase queries | ✅ Good fit | Works fine |
| **BullMQ background workers** | ❌ Incompatible | Workers need a persistent process. Vercel functions terminate after the response is sent. BullMQ cannot run workers inside serverless functions — they need their own long-lived Node.js process. |
| **Redis connections** | ⚠️ Limited | Upstash HTTP-based Redis works, but `ioredis` (which BullMQ requires) uses persistent TCP connections that Vercel cold-starts tear down between requests, causing reconnect overhead on every invocation. |
| **Prometheus metrics** | ❌ Incompatible | `GET /api/metrics` requires an in-process counter store that persists between requests. Serverless functions have no shared memory between invocations — metrics reset on every cold start, making Prometheus scraping meaningless. |
| **Server-Sent Events** | ❌ Incompatible | Vercel functions have a hard 30-second response timeout. SSE connections require a persistent open socket. |
| **WebSockets** | ❌ Incompatible | Same reason as SSE. |
| **Health/liveness probes** | ⚠️ Partial | `/api/health` and `/api/live` work but metrics inside them (uptime, memory) reset per cold start. |

### Recommendation

**Split the deployment into two tiers:**

```
┌─────────────────────────────────────────────────────────────┐
│  TIER 1: Vercel (keep what works)                           │
│    - React SPA (dist/)                                      │
│    - Stateless API routes (api/index.ts, api/admin.ts,      │
│      api/tokens.ts, api/upload.ts)                          │
│    - CDN edge caching for static assets                     │
│    - Free SSL, global PoPs, zero-config deploys             │
└─────────────────────────────────────────────────────────────┘
             │  /api/* proxy
             ▼
┌─────────────────────────────────────────────────────────────┐
│  TIER 2: Railway / Fly.io / VPS (persistent process)        │
│    - BullMQ workers (email, notification, recalc, audit)    │
│    - Prometheus metrics endpoint                            │
│    - Redis (Upstash or managed)                             │
│    - Grafana (or Grafana Cloud)                             │
└─────────────────────────────────────────────────────────────┘
```

For most hospital deployments, **Railway** is the simplest option. **Fly.io** gives more control. A **Docker VPS** (DigitalOcean Droplet, Hetzner) is cheapest at scale.

---

## Option A: Railway (Recommended — easiest)

Railway runs your Docker container as a persistent process. BullMQ workers, metrics, and Redis all work without changes.

### Setup

1. **Create a Railway account** at [railway.app](https://railway.app).

2. **Add a Redis service** inside Railway:
   ```
   Railway Dashboard → New → Database → Redis
   ```
   Copy the `REDIS_URL` from the Variables tab.

3. **Deploy the app service**:
   ```bash
   npm install -g @railway/cli
   railway login
   railway init          # creates a new project
   railway up            # builds + deploys using Dockerfile
   ```

4. **Set environment variables** in the Railway dashboard Variables tab — copy from `.env.production.example`.

5. **Set the start command** (Railway auto-detects from Dockerfile `CMD`):
   ```
   node_modules/.bin/tsx server.ts
   ```

6. **Configure a custom domain** in the Railway networking tab.

### CI/CD via GitHub Actions

The included `.github/workflows/deploy.yml` handles everything automatically:
1. Builds the Docker image and pushes it to `ghcr.io`
2. Deploys to Railway via `railway up`
3. Verifies `/api/ready` returns `{ ready: true }` after deploy

Required GitHub Secrets:
```
RAILWAY_TOKEN           ← from railway.app → Account → Tokens
VITE_SUPABASE_URL       ← baked into frontend bundle
VITE_SUPABASE_ANON_KEY  ← baked into frontend bundle
APP_URL                 ← your production URL for health check
SLACK_DLQ_WEBHOOK       ← optional, for deploy failure alerts
```

---

## Option B: Fly.io

Fly runs containers close to your users on shared VMs.

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Create the app
fly launch --name inclusyq --region sin    # Singapore region

# Set secrets
fly secrets set \
  SUPABASE_SERVICE_ROLE_KEY="..." \
  JWT_ACCESS_SECRET="..." \
  JWT_REFRESH_SECRET="..." \
  REDIS_URL="rediss://..."

# Add a Redis volume (or use Upstash)
fly redis create

# Deploy
fly deploy
```

Add a `fly.toml` at the project root:
```toml
app       = "inclusyq"
primary_region = "sin"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 3000
  force_https   = true
  auto_stop_machines  = "stop"
  auto_start_machines = true
  min_machines_running = 1

[[vm]]
  size   = "shared-cpu-1x"
  memory = "512mb"

[checks]
  [checks.health]
    grace_period = "60s"
    interval     = "30s"
    method       = "GET"
    path         = "/api/live"
    timeout      = "10s"
```

---

## Option C: Docker on a VPS (DigitalOcean / Hetzner / AWS EC2)

Use the included `docker-compose.yml` + `docker-compose.prod.yml`.

### Prerequisites
- Ubuntu 22.04 server
- Docker + Docker Compose installed
- Domain pointing to server IP

### Deploy

```bash
# 1. Clone the repository
git clone https://github.com/your-org/inclusyq.git
cd inclusyq

# 2. Create production env file
cp .env.production.example .env.production
nano .env.production    # fill in real values

# 3. Pull the pre-built image (built by CI)
docker pull ghcr.io/your-org/inclusyq:latest

# 4. Start production stack (app + nginx; Redis is external)
IMAGE_TAG=latest \
  docker compose \
    -f docker-compose.yml \
    -f docker-compose.prod.yml \
  up -d

# 5. Check health
curl https://your-domain.com/api/health
```

### TLS with Let's Encrypt

```bash
# Install certbot
apt-get install -y certbot

# Get certificate (nginx must NOT be running)
certbot certonly --standalone -d your-domain.com

# Certificates will be at /etc/letsencrypt/live/your-domain.com/
# The nginx container mounts /etc/letsencrypt:ro — no extra config needed.

# Auto-renew (add to crontab)
0 12 * * * certbot renew --quiet && docker restart inclusyq-nginx
```

---

## Local Development with Docker

```bash
# Start everything (app + Redis + Prometheus + Grafana)
docker compose up

# App:        http://localhost:3000
# Prometheus: http://localhost:9090
# Grafana:    http://localhost:3001  (admin/admin)

# Stop and clean up
docker compose down -v
```

---

## Database Migrations

Run migrations against your Supabase project before the first deploy and after each schema change:

```bash
# Open Supabase SQL editor and run in order:
# 1. supabase_schema.sql          (initial schema)
# 2. migrations/001_*.sql
# 3. migrations/002_*.sql
# 4. ...
# 5. migrations/006_add_authentication_tables.sql

# Migrate passwords to bcrypt (run once):
npx tsx scripts/migrate-passwords.ts
```

---

## Secrets Management

### Never store secrets in:
- Git repository (even private)
- Docker images
- `process.env` at build time (except `VITE_*` frontend vars)

### Use:
| Platform | Method |
|---|---|
| Railway | Dashboard Variables (encrypted) |
| Fly.io | `fly secrets set` (encrypted) |
| Docker VPS | `.env.production` with `chmod 600` owned by `root` |
| GitHub CI | Repository → Settings → Secrets and Variables |
| AWS | AWS Secrets Manager + IAM task role |
| Kubernetes | `kubectl create secret generic` |

### Required secrets checklist

- [ ] `SUPABASE_SERVICE_ROLE_KEY` — full DB access
- [ ] `JWT_ACCESS_SECRET` — 64+ char random string
- [ ] `JWT_REFRESH_SECRET` — 64+ char random string, different from access
- [ ] `REDIS_URL` — with TLS (`rediss://`)
- [ ] `GMAIL_APP_PASSWORD` — app-specific password
- [ ] `SENTRY_DSN` — error tracking
- [ ] `METRICS_TOKEN` — Prometheus scrape auth

Generate JWT secrets:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## CI/CD Pipeline Overview

```
Push to any branch
  ├── typecheck (tsc --noEmit)
  ├── build (vite build)
  ├── security (npm audit)
  └── docker-validate (docker build --no-push)

Push to main (all CI passes)
  ├── build-and-push → ghcr.io/org/inclusyq:sha-xxxxx
  │                              :latest
  ├── deploy-railway → railway up
  └── health-check → GET /api/ready
        └── notify-failure → Slack (on failure)
```

---

## Health Endpoints

| Endpoint | Purpose | Auth | Returns 503 when |
|---|---|---|---|
| `GET /api/health` | Full report | None | Supabase down |
| `GET /api/ready` | Readiness probe | None | Supabase unreachable |
| `GET /api/live` | Liveness probe | None | Heap > `HEAP_LIMIT_MB` |
| `GET /api/metrics` | Prometheus | Bearer token | Redis error |

### Kubernetes probe config
```yaml
livenessProbe:
  httpGet:
    path: /api/live
    port: 3000
  initialDelaySeconds: 60
  periodSeconds: 30
  timeoutSeconds: 10
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /api/ready
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
```

---

## Monitoring Stack

### Prometheus

Prometheus scrapes `GET /api/metrics` every 15 seconds. See `monitoring/prometheus.yml`.

For production, use **Grafana Cloud** (free tier: 10k series):
1. Create a Grafana Cloud account
2. Get the Prometheus remote-write URL
3. Add to `prometheus.yml` as a `remote_write` target

### Grafana Dashboard

The dashboard at `monitoring/grafana-dashboard.json` contains 15 panels:
- HTTP request rate, p50/p95/p99 latency, error rate
- DB query latency by table/operation, slow query count
- Heap / RSS memory usage
- BullMQ queue depth, job duration, failure count
- Token actions per hour (created/called/completed)
- Auth events (login success/failure)
- Cache hit rate

Import: Grafana → Dashboards → Import → Upload JSON file.

### Sentry

Set `SENTRY_DSN` to enable automatic error capture. Every unhandled exception:
- Gets a unique `errorId` (e.g. `ERR-3f8a2b1c`)
- Is sent to Sentry with request context and user info
- The `errorId` is returned in the API error response so users can quote it to support

---

## Post-Deploy Checklist

- [ ] `/api/health` returns `{ "status": "up" }`
- [ ] `/api/ready` returns `{ "ready": true }`
- [ ] Login works and returns JWT tokens
- [ ] Token creation enqueues BullMQ jobs (check `/api/jobs/stats`)
- [ ] Redis is connected (check `dependencies.redis.status` in `/api/health`)
- [ ] Prometheus is scraping `/api/metrics` (verify in Prometheus targets UI)
- [ ] Grafana dashboard shows data
- [ ] Sentry receives a test event (`captureMessage('deploy ok')`)
- [ ] Database migrations applied
- [ ] Passwords migrated to bcrypt
- [ ] HTTPS enforced (HTTP → HTTPS redirect)
- [ ] `COOKIE_SECURE=true` set
- [ ] `NODE_ENV=production` set
- [ ] No secrets in environment variables starting with `VITE_` except the Supabase public keys
