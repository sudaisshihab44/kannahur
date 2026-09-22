# InclusyQ — Hospital Queue Management System

![Build](https://img.shields.io/badge/build-passing-brightgreen)
![Security](https://img.shields.io/badge/security-A%2B-brightgreen)
![Stack](https://img.shields.io/badge/stack-React%2019%20%2B%20Express%204%20%2B%20Supabase-blue)
![License](https://img.shields.io/badge/license-TBD-lightgrey)

Reference deployment: **St. Jude Memorial Hospital**.

## Overview

InclusyQ manages the full outpatient queue lifecycle across departments, doctors, patients, and tokens: **create → call → complete / skip / cancel**.

Reception issues tokens, doctors call next, patients track position live via `?tracker=GEN-001`, and waiting halls follow along on a live queue TV display. Staff and admin portals, consultation rooms, announcements, smart pager tracking devices, audit logs, and email notifications (WhatsApp-ready logs) round out daily operations.

Live updates stream over **SSE**. Heavy work runs in **BullMQ** background jobs (email, notification, recalc, audit).

## Features

| Area | What it does |
| --- | --- |
| Queue lifecycle | Create, call, complete, skip, cancel tokens per department/doctor |
| Live TV display | Waiting-hall board with now-serving + up-next |
| Patient tracker | Public status page at `?tracker=GEN-001` |
| Smart pager | Tracking-device assignment and status |
| Announcements | Broadcast messages to TV / tracker |
| Rooms | Consultation-room assignment |
| Staff / admin portals | Reception ops, user/department/doctor management |
| Audit logs | Who did what, when |
| Notifications | Email via Nodemailer; WhatsApp-ready log hook |
| Jobs | BullMQ: email, notification, recalc, audit (+ DLQ Slack alert) |
| Monitoring | Prometheus metrics + Grafana dashboard, Sentry, Pino logs |

## Roles

- **Admin** — users, departments, doctors, rooms, settings, audit logs.
- **Reception** — register patients, issue tokens, call/skip/cancel, announcements, pager devices.
- **Patient (tracker)** — no login; check queue position via tracker ID.
- **TV display** — no login; read-only live board for waiting halls.

## Architecture

MVC backend (controllers → services → repositories → Supabase), thin Vercel serverless entry points, React SPA frontend. See [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the full diagram.

```text
React SPA (src/) → api/index|tokens|admin|upload.ts → src-api/{middleware,controllers,services,repositories} → Supabase Postgres + Storage
                                                              ↘ Redis / BullMQ jobs + SSE live updates
```

## Tech Stack

- **Frontend:** React 19 + Vite + Tailwind CSS + React Router
- **Backend:** Express 4 locally (`server.ts`); serverless on Vercel via `api/index.ts`, `tokens.ts`, `admin.ts`, `upload.ts`
- **Data:** Supabase Postgres + Storage (`supabase_schema.sql`, `supabase/migrations/`)
- **Jobs/cache:** Redis + BullMQ (in-memory/NullQueue fallback when `REDIS_URL` is blank)
- **Auth:** JWT dual-token (15 min access + 7 day httpOnly `SameSite=Strict` refresh), bcrypt 12
- **Hardening:** helmet/CSP, CORS, rate-limit, CSRF, validation/sanitization
- **Observability:** Prometheus + Grafana (`monitoring/`), Sentry, Pino; k6 load tests (`load-tests/`)

## Repo Structure

```text
api/            Vercel serverless entry points (index, tokens, admin, upload)
src-api/        Backend MVC: controllers/ services/ repositories/ middleware/ jobs/ validators/ utils/ cache/ config/
src/            React frontend: pages/ components/ contexts/ lib/ utils/ types
supabase/       Migrations (run after supabase_schema.sql)
supabase_schema.sql  Base schema
monitoring/     prometheus.yml, grafana-dashboard.json, grafana-provisioning/
load-tests/     k6 scenarios + config
server.ts       Local dev server only (Express + Vite middleware, NOT deployed)
Dockerfile docker-compose.yml docker-compose.prod.yml vercel.json
```

## Quickstart

```bash
npm install
copy .env.example .env.local   # fill in values below
# Supabase SQL editor, in order:
#   1. supabase_schema.sql
#   2. supabase/migrations/0001*.sql, 0002_enable_rls.sql, 008*.sql
npm run dev                    # http://localhost:3000
```

```bash
npm run build                  # frontend production build
docker compose up              # app + redis + prometheus + grafana
vercel deploy                  # production deploy
```

First-boot admin/reception accounts are created only from `BOOTSTRAP_*_PASSWORD` env vars when missing. Existing passwords are never overwritten. There are no hardcoded default credentials.

## Environment

| Var | Required | Notes |
| --- | --- | --- |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only; service key bypasses RLS, keep secret |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Yes | Baked into Vite bundle; safe with RLS |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Yes | 32+ random chars each; server fails fast without them |
| `REDIS_URL` | No | Blank = in-memory cache + in-process jobs; set for prod |
| `BOOTSTRAP_ADMIN_PASSWORD` / `BOOTSTRAP_RECEPTION_PASSWORD` | First boot | Seed missing accounts once; unset afterwards |
| `EMAIL_HOST/PORT/USER/PASSWORD/FROM` | For email | Nodemailer SMTP |
| `SENTRY_DSN` | No | Blank disables Sentry |
| `METRICS_TOKEN` | Prod yes | Bearer token for `GET /api/metrics` |
| `GRAFANA_ADMIN_USER/PASSWORD` | Compose | No default password; set long random value |

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Local dev (tsx server.ts, port 3000, frees 3000/24678) |
| `npm run build` | Vite production build |
| `npm run lint` / `npm run typecheck` | `tsc --noEmit` for app + api |
| `npm run db:migrate` | Password migration (`scripts/migrate-passwords.ts`) |
| `npm run test:smoke` | k6 smoke (`load-tests/scenarios/smoke.js`) |
| `npm run test:load:1k\|5k\|10k`, `test:stress`, `test:breakpoint` | k6 suites, JSON to `load-tests/results/` |

## Security Highlights

- Supabase **RLS** enforced; service-role key stays server-side.
- JWT access (15 m) + refresh (7 d, httpOnly, `SameSite=Strict`); account lockout + login rate limits; max 3 concurrent sessions.
- CORS allowlist, helmet/CSP, CSRF blocking (strict by default), express-validator + sanitization, bcrypt 12.
- Details: [SECURITY.md](./docs/SECURITY.md).

## Monitoring

- `GET /api/metrics` (Bearer `METRICS_TOKEN`), `GET /api/live` liveness (503 on high heap), slow request/query logging (`SLOW_REQUEST_MS` / `SLOW_QUERY_MS`).
- Local: `docker compose up` → Prometheus + Grafana with `monitoring/grafana-dashboard.json`.
- Errors: Sentry (`SENTRY_DSN`); structured logs: Pino.

## Deployment

- [DEPLOYMENT.md](./docs/DEPLOYMENT.md) + [DEPLOYMENT_CHECKLIST.md](./docs/DEPLOYMENT_CHECKLIST.md) — production runbook.
- [VERCEL_DEPLOYMENT.md](./docs/VERCEL_DEPLOYMENT.md) — Vercel env + routing notes.
- [START_HERE.md](./docs/START_HERE.md) — orientation; [ARCHITECTURE.md](./docs/ARCHITECTURE.md) — backend design.

## Docs Map

| Doc | Read when |
| --- | --- |
| [START_HERE.md](./docs/START_HERE.md) | First orientation (5 min) |
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Backend MVC + data flow |
| [SECURITY.md](./docs/SECURITY.md) | Auth, RLS, hardening details |
| [DEPLOYMENT.md](./docs/DEPLOYMENT.md) / [DEPLOYMENT_CHECKLIST.md](./docs/DEPLOYMENT_CHECKLIST.md) | Production runbook |
| [VERCEL_DEPLOYMENT.md](./docs/VERCEL_DEPLOYMENT.md) | Vercel env + routing |

## Local URLs

- App: `http://localhost:3000` · API: `http://localhost:3000/api` · Metrics: `http://localhost:3000/api/metrics`
- Tracker: `http://localhost:3000/?tracker=GEN-001` · TV: `http://localhost:3000/tv`
- Compose: Prometheus `:9090`, Grafana `:3001`.

## License

TBD — add a `LICENSE` file before public release.
