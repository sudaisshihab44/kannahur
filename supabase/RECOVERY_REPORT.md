# InclusyQ — Database Recovery Report

## Source of truth
All schema information was reconstructed exclusively from the InclusyQ
source code — repositories, migrations, SQL files, and seed utilities.
Nothing was invented.

---

## 1. Tables Discovered from Code (14 + 1 view)

| Table | Source | Backend Routes |
|---|---|---|
| `departments` | supabase_schema.sql, userRepository | /api/admin/departments, /api/data |
| `doctors` | supabase_schema.sql, userRepository | /api/admin/doctors, /api/data |
| `patients` | supabase_schema.sql, tokenRepository | POST /api/tokens (upsert) |
| `tokens` | supabase_schema.sql, tokenRepository | /api/tokens/*, /api/data |
| `tracking_devices` | supabase_schema.sql, deviceRepository | /api/devices/*, /api/data |
| `consultation_rooms` | supabase_schema.sql, userRepository | /api/admin/rooms, /api/data |
| `users` | supabase_schema.sql, userRepository | /api/login, /api/admin/staff |
| `queue_logs` | supabase_schema.sql, settingsRepository | /api/data (last 200 rows) |
| `whatsapp_logs` | supabase_schema.sql, settingsRepository | /api/data (last 100 rows) |
| `settings` | supabase_schema.sql, settingsRepository | /api/admin/settings/*, /api/data |
| `refresh_tokens` | migration 006, authRepository | POST /api/auth/refresh |
| `user_sessions` | migration 006, authRepository | GET /api/auth/sessions |
| `auth_audit_log` | migration 006, authRepository | Admin audit tab |
| `security_events` | migration 006, authRepository | Security monitoring |
| `device_fingerprints` | migration 006, authRepository | Login (new device detection) |
| `active_queue` (VIEW) | migration 004 | optimizedTokenRepository |

---

## 2. Tables That Must Be Recreated

All 14 tables + the view. The recovery migration creates them with
`CREATE TABLE IF NOT EXISTS` so it is safe to run even if some tables
already exist.

---

## 3. Columns Per Table (key columns)

### `departments`
`id TEXT PK, name TEXT NOT NULL, prefix TEXT UNIQUE NOT NULL, description TEXT, is_enabled BOOL DEFAULT TRUE, default_consultation_time INT DEFAULT 15`

### `doctors`
`id TEXT PK, name TEXT NOT NULL, department_id TEXT FK→departments, specialization TEXT, status TEXT DEFAULT 'active', room_number TEXT, avg_consultation_time INT DEFAULT 15, start_time TEXT, end_time TEXT, max_patients_per_day INT, is_enabled BOOL`

### `patients`
`id TEXT PK, name TEXT NOT NULL, mobile TEXT UNIQUE NOT NULL, email TEXT, age INT, gender TEXT, created_at TIMESTAMPTZ`

### `tokens`
`id TEXT PK, token_number TEXT NOT NULL, patient_name/mobile/email/age/gender, department_id FK, department_name, doctor_id FK, doctor_name, reason_for_visit, status TEXT DEFAULT 'waiting', created_at, called_at, completed_at, is_emergency BOOL, priority TEXT DEFAULT 'Normal', notes, position INT, device_id TEXT, estimated_consultation_time INT, estimated_wait_time INT, expected_consultation_start_time TIMESTAMPTZ, last_notified_wait_time INT, notified_two_remaining BOOL, notified_your_turn BOOL, notified_two_ahead BOOL`

### `tracking_devices`
`id TEXT PK, device_code TEXT UNIQUE NOT NULL, name TEXT, status TEXT DEFAULT 'available', assigned_token_id FK→tokens, assigned_token_number TEXT, battery_level INT DEFAULT 100, last_seen_at TIMESTAMPTZ`

### `consultation_rooms`
`id TEXT PK, room_number TEXT NOT NULL, room_name TEXT NOT NULL, assigned_doctor_id FK→doctors, department_id FK→departments, status TEXT DEFAULT 'available', display_screen_id TEXT`

### `users`
`id TEXT PK, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, department_id FK, assigned_department_ids JSONB DEFAULT [], permissions JSONB DEFAULT [], password TEXT, password_hash TEXT, password_changed_at TIMESTAMPTZ, failed_login_attempts INT DEFAULT 0, locked_until TIMESTAMPTZ, last_login_at TIMESTAMPTZ, last_login_ip TEXT, require_password_change BOOL, two_factor_enabled BOOL, is_active BOOL DEFAULT TRUE`

### `queue_logs`
`id TEXT PK, token_id TEXT, token_number TEXT, action TEXT, user_id TEXT, timestamp TIMESTAMPTZ`

### `whatsapp_logs`
`id TEXT PK, token_id TEXT, token_number TEXT, patient_name TEXT, patient_mobile TEXT, message TEXT, type TEXT, status TEXT, timestamp TIMESTAMPTZ`

### `settings`
`id INTEGER PK DEFAULT 1, is_paused BOOL DEFAULT FALSE, hospital_info JSONB, announcements JSONB, config JSONB`

### `refresh_tokens`
`id TEXT PK, user_id FK→users CASCADE, token TEXT UNIQUE, expires_at TIMESTAMPTZ, created_at, revoked_at, revoked_by, device_info JSONB, ip_address TEXT, user_agent TEXT, is_active BOOL DEFAULT TRUE`

### `user_sessions`
`id TEXT PK, user_id FK→users CASCADE, refresh_token_id FK→refresh_tokens CASCADE, session_token TEXT UNIQUE, ip_address, user_agent, device_type, device_id, device_name, browser, os, location_city, location_country, created_at, last_active_at, expires_at TIMESTAMPTZ NOT NULL, ended_at, is_active BOOL`

### `auth_audit_log`
`id TEXT PK, user_id FK→users SET NULL, username TEXT, action TEXT, success BOOL, failure_reason TEXT, ip_address, user_agent, device_info JSONB, portal TEXT, timestamp TIMESTAMPTZ`

### `security_events`
`id TEXT PK, user_id FK→users SET NULL, event_type TEXT, severity TEXT, description TEXT, ip_address, user_agent, metadata JSONB, timestamp TIMESTAMPTZ`

### `device_fingerprints`
`id TEXT PK, user_id FK→users CASCADE, fingerprint_hash TEXT, device_name, device_type, browser, os, first_seen_at, last_seen_at, trusted BOOL, UNIQUE(user_id, fingerprint_hash)`

---

## 4. Relationships

```
departments  ←── doctors            (ON DELETE SET NULL)
departments  ←── tokens             (ON DELETE SET NULL)
departments  ←── consultation_rooms (ON DELETE SET NULL)
departments  ←── users              (ON DELETE SET NULL)
doctors      ←── tokens             (ON DELETE SET NULL)
doctors      ←── consultation_rooms (ON DELETE SET NULL)
tokens       ←── tracking_devices   (ON DELETE SET NULL)
users        ←── refresh_tokens     (ON DELETE CASCADE)
users        ←── user_sessions      (ON DELETE CASCADE)
users        ←── auth_audit_log     (ON DELETE SET NULL)
users        ←── security_events    (ON DELETE SET NULL)
users        ←── device_fingerprints(ON DELETE CASCADE)
refresh_tokens ←── user_sessions    (ON DELETE CASCADE)
```

---

## 5. Indexes (29 total)

Critical path indexes on `tokens`:
- `(status, created_at)` — queue listing
- `(department_id, status, created_at)` — per-dept queue
- `(doctor_id, status, created_at)` — per-doctor queue
- Partial index on `(department_id, status, called_at)` WHERE status='called'
- `(token_number, department_id)` — tracker lookups

Other:
- `patients(mobile)` — patient deduplication
- `users(lower(username))` — case-insensitive login
- `queue_logs(timestamp DESC)`, `whatsapp_logs(timestamp DESC)` — sorted reads
- All auth table indexes for session/token lookups

---

## 6. RLS Policies

**Current setting: RLS disabled on all tables** (`ALTER TABLE x DISABLE ROW LEVEL SECURITY`).

The application uses a service-role key on the backend for all database
access. The frontend connects to Supabase only for Realtime subscriptions
(TrackToken.tsx) using the anonymous key, which accesses no tables directly.

This is acceptable for the pilot deployment. The service-role key is
never exposed to the browser.

---

## 7. Functions / RPCs

| Function | Called by | Purpose |
|---|---|---|
| `batch_update_tokens(updates JSONB)` | queueRecalcWorker | Update N token wait times in one trip |
| `count_waiting_tokens()` | tokenRepository | Fast COUNT(*) |
| `count_today_tokens_for_dept(p_department_id)` | tokenRepository | Daily token counter |
| `create_token_atomic(...)` | tokenService | Patient upsert + token insert atomically |
| `call_specific_token(p_token_id)` | tokenService | Atomic call — validates 'waiting' |
| `call_next_patient(p_doctor_id, p_department_id)` | tokenService | Priority-sorted atomic call-next |
| `get_waiting_queue(p_department_id, p_doctor_id)` | optimizedTokenRepository | Enriched waiting queue |
| `get_today_token_count(p_department_id)` | optimizedTokenRepository | Daily count |
| `get_user_active_sessions(p_user_id)` | authRepository | List active sessions |
| `revoke_all_user_sessions(p_user_id, p_except_session_id)` | enhancedAuthService | Logout all devices |
| `clean_expired_refresh_tokens()` | authRepository | Maintenance |
| `clean_expired_sessions()` | authRepository | Maintenance |

---

## 8. Realtime Requirements

Only `TrackToken.tsx` uses Supabase Realtime:
```ts
supabase.channel("tokens-live")
  .on("postgres_changes", { event: "*", schema: "public", table: "tokens" }, callback)
  .subscribe();
```

**Required:** Enable Realtime publication for the `tokens` table in
Supabase Dashboard → Database → Replication → Add table → `tokens`.

All other dashboards use 5-second polling via `GET /api/data`.

---

## 9. Storage Buckets

Logo uploads go to Supabase Storage bucket **`hospital-logos`**.

Accessed via `api/upload.ts` → `uploadController` → Supabase Storage SDK.
The bucket is created automatically on first upload (handled in the upload
controller). No manual setup required.

---

## 10. Seed Data Available

| Data | Source | Included in recovery |
|---|---|---|
| 5 departments | supabase_schema.sql | ✅ |
| 6 doctors | supabase_schema.sql | ✅ |
| 3 consultation rooms | supabase_schema.sql | ✅ |
| 5 tracking devices | supabase_schema.sql | ✅ |
| 3 users (admin, reception, reception2) | supabase_schema.sql + seed.ts | ✅ |
| Hospital settings (config + hospital_info) | supabase_schema.sql + seed.ts | ✅ |
| 2 default announcements | seed.ts | ✅ |

No patient records or historical tokens are seeded (correct — do not invent production data).

---

## 11. Unknown / Missing Information

- **`whatsapp_logs.status` column**: Not in the original `supabase_schema.sql`
  but referenced in `insertNotificationLog`. Added to the recovery migration.
- **`tracking_devices` RLS**: Table did not exist in early versions;
  `tryFindAllDevices()` silently returns `[]` if the table is missing.
  Added to the recovery migration.

---

## 12. Critical Security Issues

### ⚠️ CRITICAL: Plain-text passwords in `users` table

The `users.password` column stores plain-text passwords (`Admin@123`,
`Reception@123`). The application's `enhancedAuthService` checks
`userRow.password_hash` (bcrypt) first, then falls back to
`userRow.password` (plain-text). On successful plain-text login, it
automatically upgrades to bcrypt and clears the plain-text column.

**Impact:** Anyone with database read access (e.g. via Supabase dashboard)
can see plain-text passwords.

**Fix (post-pilot):** Run the password migration script after initial login:
```bash
npx tsx scripts/migrate-passwords.ts
```

This is a known architectural transition — not a regression from recovery.

---

## 13. Performance Issues

All resolved by the recovery migration:
- `batch_update_tokens` replaces N sequential UPDATEs (N+1 fix)
- `count_waiting_tokens` / `count_today_tokens_for_dept` use server-side
  `COUNT(*)` instead of fetching all rows and calling `.length` in JS
- `call_specific_token` / `call_next_patient` use `FOR UPDATE SKIP LOCKED`
  preventing double-calling the same patient under concurrent load
- 29 indexes covering all hot-path WHERE / ORDER BY clauses

---

## 14. Files Created

```
supabase/
├── RECOVERY_REPORT.md              ← this file
└── migrations/
    └── 0001_recover_inclusyq.sql   ← complete recovery migration (883 lines)
```

---

## 15. Steps to Restore the Database in Supabase

### Step 1 — Open Supabase SQL Editor

Go to: https://supabase.com/dashboard/project/fjkogjwwnpsocdxoikiu/sql

### Step 2 — Run the recovery migration

Copy the entire contents of:
```
supabase/migrations/0001_recover_inclusyq.sql
```
Paste into the SQL Editor and click **Run**.

### Step 3 — Verify (built into the migration)

The last query in the migration lists all 14 tables with their column counts.
You should see all 14 tables returned.

### Step 4 — Enable Realtime for the tokens table

Supabase Dashboard → Database → Replication → Supabase Realtime  
→ Source → Add table → select `tokens` → Save.

This is required for the `TrackToken.tsx` patient-facing tracker page to
receive live queue updates.

### Step 5 — Set Supabase environment variables

In Vercel (or `.env.local` for local development):
```
SUPABASE_URL             = https://fjkogjwwnpsocdxoikiu.supabase.co
VITE_SUPABASE_URL        = https://fjkogjwwnpsocdxoikiu.supabase.co
VITE_SUPABASE_ANON_KEY   = <your anon key>
SUPABASE_SERVICE_ROLE_KEY= <your service role key>
```

### Step 6 — Start the application

```bash
npm run dev
```

Login with:
- Admin:     `admin`      / `Admin@123`
- Reception: `reception`  / `Reception@123`

### Step 7 — Upgrade passwords to bcrypt (optional but recommended)

After first login, run:
```bash
npx tsx scripts/migrate-passwords.ts
```

This converts all remaining plain-text passwords to bcrypt hashes.
