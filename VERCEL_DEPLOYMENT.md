# InclusyQ — Vercel Deployment Guide

## Architecture

```
Vercel (Hobby plan — 4 Serverless Functions)
├── api/index.ts    → all general API routes (/api/login, /api/data, /api/queue, …)
├── api/tokens.ts   → token CRUD (/api/tokens, /api/tokens/:id/*)
├── api/admin.ts    → admin CRUD (/api/admin/*)
└── api/upload.ts   → file upload (/api/admin/upload-logo)

src-api/            → shared backend modules (imported by the 4 functions above)
├── controllers/    → HTTP handlers
├── services/       → business logic
├── repositories/   → Supabase queries
├── middleware/     → auth, CORS, rate limiting, security headers
├── cache/          → Redis cache layers
├── jobs/           → BullMQ background jobs
├── monitoring/     → Prometheus, Sentry, health checks
└── utils/          → validation, sanitization, mappers

dist/               → Vite-built React SPA (served by Vercel CDN)
```

**SSE (`/api/events`) is NOT on Vercel.** Vercel Serverless Functions cannot hold open
persistent connections. Realtime is provided by:
- **Supabase Realtime** — used by `TrackToken.tsx` (per-token live tracking)
- **Polling** — `App.tsx` polls `/api/data` every 5 s (visibility-aware, pauses on hidden tab)

---

## Vercel Project Settings

| Setting | Value |
|---|---|
| Framework Preset | Other |
| Build Command | `vite build` |
| Output Directory | `dist` |
| Install Command | `npm ci --frozen-lockfile` |
| Node.js Version | 22.x |

---

## Required Environment Variables

Set all of these in **Vercel Dashboard → Project → Settings → Environment Variables**.

### Critical (deployment fails without these)

| Variable | Description | Example |
|---|---|---|
| `SUPABASE_URL` | Supabase project URL — used by API functions | `https://xxx.supabase.co` |
| `VITE_SUPABASE_URL` | Same URL, baked into frontend bundle at build time | `https://xxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key — baked into frontend | `eyJhbGc...` |
| `SUPABASE_SERVICE_ROLE_KEY` | **SECRET** — full DB access, server-only, never VITE_ | `eyJhbGc...` |
| `JWT_ACCESS_SECRET` | Random 64-char string — signs access tokens | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | Different random 64-char string — signs refresh tokens | `openssl rand -hex 32` |

### Important for correct operation

| Variable | Description | Default |
|---|---|---|
| `FRONTEND_URL` | Your Vercel deployment URL — used for CORS | `https://your-app.vercel.app` |
| `APP_URL` | Same as FRONTEND_URL — used in email links | `https://your-app.vercel.app` |
| `NODE_ENV` | Set to `production` | `production` |
| `STRICT_CSRF` | Leave blank to enforce CSRF protection | *(blank = strict)* |

### Optional

| Variable | Description |
|---|---|
| `REDIS_URL` | Upstash Redis URL — enables caching + BullMQ. Falls back to in-memory when blank |
| `GMAIL_USER` | Gmail address for email notifications |
| `GMAIL_APP_PASSWORD` | Gmail App Password (not your account password) |
| `SENTRY_DSN` | Sentry project DSN for error tracking |
| `METRICS_TOKEN` | Bearer token to protect `/api/metrics` |
| `SLOW_QUERY_MS` | DB queries slower than this are logged (default: `200`) |
| `SLOW_REQUEST_MS` | Requests slower than this are logged (default: `1000`) |

---

## Step-by-step Deployment

### 1. Login to Vercel (run in your terminal)

```bash
vercel login
```

Complete browser authentication when prompted.

### 2. Link the project

```bash
cd "c:\Users\DELL\Downloads\inclusyq (3)"
vercel link
```

Select your existing project or create a new one.

### 3. Set environment variables

In Vercel Dashboard → Project → Settings → Environment Variables, add:

```
SUPABASE_URL                = https://xxxx.supabase.co
VITE_SUPABASE_URL           = https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY      = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY   = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
JWT_ACCESS_SECRET           = (64 char random hex)
JWT_REFRESH_SECRET          = (64 char random hex — different from above)
FRONTEND_URL                = https://your-project.vercel.app
APP_URL                     = https://your-project.vercel.app
NODE_ENV                    = production
```

Generate JWT secrets:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Run twice — use one for ACCESS, one for REFRESH.

### 4. Deploy

```bash
vercel --prod
```

Or push to the `main` branch if GitHub Actions CI/CD is connected.

### 5. Verify the deployment

```bash
# Health check
curl https://your-project.vercel.app/api/live

# Login
curl -X POST https://your-project.vercel.app/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@123","portal":"admin"}'
```

Expected login response:
```json
{ "success": true, "user": { ... }, "accessToken": "eyJ..." }
```

---

## Local Development

```bash
# Install dependencies
npm install

# Copy env file
cp .env.example .env.local
# Edit .env.local with your real values

# Start dev server (Express + Vite on :3000)
npm run dev
```

All API calls are proxied through Vite to `http://localhost:3000`.

---

## Supabase Setup

1. Run migrations in order in the Supabase SQL Editor:
   ```
   supabase_schema.sql           — base schema
   supabase_migration.sql        — initial data
   migrations/001_*.sql          — indexes
   ...
   migrations/007a_cleanup_duplicates.sql
   migrations/007b_indexes.sql
   migrations/007c_functions.sql
   ```

2. Run password migration (converts plain passwords to bcrypt):
   ```bash
   npx tsx scripts/migrate-passwords.ts
   ```

3. Default credentials (created automatically on first server boot):
   - Admin: `admin` / `Admin@123`
   - Reception: `reception` / `Reception@123`

---

## Rollback

```bash
# List recent deployments
vercel ls

# Roll back to a previous deployment
vercel rollback [deployment-url]
```

Or in Vercel Dashboard → Deployments → click any previous deployment → "Promote to Production".

---

## Troubleshooting

### "Authentication required" on all API calls
- Check `JWT_ACCESS_SECRET` is set in Vercel env vars
- Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set (not `VITE_` prefixed)
- Confirm `FRONTEND_URL` matches your actual Vercel domain exactly (for CORS)

### "Invalid or expired token" after login
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` must be set and at least 32 chars
- They must be different from each other
- After changing secrets, all existing sessions are invalidated (users must log in again)

### Data not loading after login (blank dashboards)
- Check browser DevTools Network tab — `/api/data` should return 200, not 401
- If 401: the `Authorization: Bearer <token>` header is not being sent
- Verify `JWT_ACCESS_SECRET` is correct on the server

### CORS errors
- Set `FRONTEND_URL` in Vercel env vars to your exact deployment URL
  (e.g. `https://inclusyq-3.vercel.app` — no trailing slash)
- If using a custom domain, set `FRONTEND_URL` to that domain

### File upload failing
- Ensure Supabase Storage bucket `hospital-logos` is created (auto-created on first upload)
- Check `SUPABASE_SERVICE_ROLE_KEY` is set correctly

### Email not sending
- Set `GMAIL_USER` and `GMAIL_APP_PASSWORD` in Vercel env vars
- Use a Gmail App Password, not your main password:
  myaccount.google.com/apppasswords

### BullMQ jobs not running
- Set `REDIS_URL` to an Upstash Redis URL (`rediss://...`)
- Without Redis, all jobs fall back to in-process (works but no retries/DLQ)
- Vercel Serverless Functions cannot run persistent BullMQ workers
- For production job processing, deploy the worker separately on Railway/Fly.io

---

## Function Count

| Function | Routes served | Max Duration |
|---|---|---|
| `api/index.ts` | `/api/*` (general) | 30 s |
| `api/tokens.ts` | `/api/tokens/*` | 30 s |
| `api/admin.ts` | `/api/admin/*` | 30 s |
| `api/upload.ts` | `/api/upload/logo` | 60 s |
| **Total** | **4** | **≤ Hobby plan limit (12)** |

---

## Known Limitations on Vercel Hobby Plan

| Feature | Status | Notes |
|---|---|---|
| REST API | ✅ Full support | All endpoints work |
| Authentication (JWT) | ✅ Full support | |
| Database (Supabase) | ✅ Full support | |
| File uploads | ✅ Full support | Stored in Supabase Storage |
| Email | ✅ Full support | Via Nodemailer/Gmail |
| Queue polling | ✅ Works | Every 5 s, visibility-aware |
| Supabase Realtime | ✅ Works | Used by TrackToken page |
| SSE (`/api/events`) | ❌ Not available | Vercel cannot hold open connections |
| BullMQ workers | ❌ Not available | Workers need a persistent process |
| Redis caching | ⚠️ Optional | Requires Upstash Redis |
| WebSockets | ❌ Not available | Vercel limitation |
