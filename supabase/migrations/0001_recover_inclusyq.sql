-- ============================================================
-- InclusyQ — Complete Database Recovery Migration
-- 0001_recover_inclusyq.sql
--
-- Run this ENTIRE script in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql
--
-- This script is IDEMPOTENT — safe to run multiple times.
-- It creates tables only if they don't already exist, adds
-- columns only if missing, and upserts seed data safely.
--
-- Sections:
--   1.  Core application tables (9 tables)
--   2.  Authentication & security tables (5 tables)
--   3.  Performance indexes
--   4.  Database functions & views
--   5.  Seed data (departments, doctors, rooms, devices, users, settings)
-- ============================================================

-- ============================================================
-- SECTION 1 — CORE APPLICATION TABLES
-- ============================================================

-- ── departments ───────────────────────────────────────────────────────────────
-- Referenced by: doctors, tokens, consultation_rooms, users
-- Routes: /api/admin/departments (CRUD), /api/data

CREATE TABLE IF NOT EXISTS departments (
  id                        TEXT        PRIMARY KEY,
  name                      TEXT        NOT NULL,
  prefix                    TEXT        NOT NULL,
  description               TEXT,
  is_enabled                BOOLEAN     NOT NULL DEFAULT TRUE,
  default_consultation_time INTEGER     NOT NULL DEFAULT 15
);

ALTER TABLE departments DISABLE ROW LEVEL SECURITY;

-- Unique prefix (e.g. GEN, OPD, CARD) — enforced so token numbers are unique per dept
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'departments_prefix_key'
  ) THEN
    ALTER TABLE departments ADD CONSTRAINT departments_prefix_key UNIQUE (prefix);
  END IF;
END $$;

-- ── doctors ───────────────────────────────────────────────────────────────────
-- Referenced by: tokens, consultation_rooms
-- Routes: /api/admin/doctors (CRUD), /api/data

CREATE TABLE IF NOT EXISTS doctors (
  id                   TEXT        PRIMARY KEY,
  name                 TEXT        NOT NULL,
  department_id        TEXT        REFERENCES departments(id) ON DELETE SET NULL,
  specialization       TEXT,
  status               TEXT        NOT NULL DEFAULT 'active',
  room_number          TEXT,
  avg_consultation_time INTEGER    NOT NULL DEFAULT 15,
  start_time           TEXT        NOT NULL DEFAULT '08:00',
  end_time             TEXT        NOT NULL DEFAULT '17:00',
  max_patients_per_day INTEGER     NOT NULL DEFAULT 40,
  is_enabled           BOOLEAN     NOT NULL DEFAULT TRUE
);

ALTER TABLE doctors DISABLE ROW LEVEL SECURITY;

-- ── patients ──────────────────────────────────────────────────────────────────
-- Stored separately from tokens so the same patient can have multiple visits.
-- Routes: /api/patients (POST), referenced by token generation

CREATE TABLE IF NOT EXISTS patients (
  id         TEXT        PRIMARY KEY,
  name       TEXT        NOT NULL,
  mobile     TEXT        NOT NULL,
  email      TEXT,
  age        INTEGER,
  gender     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE patients DISABLE ROW LEVEL SECURITY;

-- Unique mobile (one patient record per phone number)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'patients_mobile_key'
  ) THEN
    ALTER TABLE patients ADD CONSTRAINT patients_mobile_key UNIQUE (mobile);
  END IF;
END $$;

-- ── tokens ────────────────────────────────────────────────────────────────────
-- Core table.  One row per patient visit / queue slot.
-- Routes: POST /api/tokens, POST /api/tokens/:id/:action, GET /api/data

CREATE TABLE IF NOT EXISTS tokens (
  id                               TEXT        PRIMARY KEY,
  token_number                     TEXT        NOT NULL,
  patient_name                     TEXT,
  patient_mobile                   TEXT,
  patient_email                    TEXT,
  patient_age                      INTEGER,
  patient_gender                   TEXT,
  department_id                    TEXT        REFERENCES departments(id) ON DELETE SET NULL,
  department_name                  TEXT,
  doctor_id                        TEXT        REFERENCES doctors(id) ON DELETE SET NULL,
  doctor_name                      TEXT,
  reason_for_visit                 TEXT,
  status                           TEXT        NOT NULL DEFAULT 'waiting',
  created_at                       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  called_at                        TIMESTAMPTZ,
  completed_at                     TIMESTAMPTZ,
  is_emergency                     BOOLEAN     NOT NULL DEFAULT FALSE,
  priority                         TEXT        NOT NULL DEFAULT 'Normal',
  notes                            TEXT,
  "position"                         INTEGER,
  device_id                        TEXT,
  estimated_consultation_time      INTEGER,
  estimated_wait_time              INTEGER,
  expected_consultation_start_time TIMESTAMPTZ,
  last_notified_wait_time          INTEGER,
  notified_two_remaining           BOOLEAN     NOT NULL DEFAULT FALSE,
  notified_your_turn               BOOLEAN     NOT NULL DEFAULT FALSE,
  notified_two_ahead               BOOLEAN     NOT NULL DEFAULT FALSE
);

ALTER TABLE tokens DISABLE ROW LEVEL SECURITY;

-- ── tracking_devices ─────────────────────────────────────────────────────────
-- Hardware pager devices assigned to patients at token generation.
-- Routes: GET /api/devices, POST /api/devices/assign, POST /api/devices/unassign

CREATE TABLE IF NOT EXISTS tracking_devices (
  id                    TEXT        PRIMARY KEY,
  device_code           TEXT        NOT NULL,
  name                  TEXT,
  status                TEXT        NOT NULL DEFAULT 'available',
  assigned_token_id     TEXT        REFERENCES tokens(id) ON DELETE SET NULL,
  assigned_token_number TEXT,
  battery_level         INTEGER     NOT NULL DEFAULT 100,
  last_seen_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tracking_devices DISABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tracking_devices_device_code_key'
  ) THEN
    ALTER TABLE tracking_devices ADD CONSTRAINT tracking_devices_device_code_key UNIQUE (device_code);
  END IF;
END $$;

-- ── consultation_rooms ────────────────────────────────────────────────────────
-- Doctor consultation rooms displayed on TV board and admin dashboard.
-- Routes: GET/POST/PUT/DELETE /api/admin/rooms, /api/data

CREATE TABLE IF NOT EXISTS consultation_rooms (
  id                TEXT    PRIMARY KEY,
  room_number       TEXT    NOT NULL,
  room_name         TEXT    NOT NULL,
  assigned_doctor_id TEXT   REFERENCES doctors(id) ON DELETE SET NULL,
  department_id     TEXT    REFERENCES departments(id) ON DELETE SET NULL,
  status            TEXT    NOT NULL DEFAULT 'available',
  display_screen_id TEXT
);

ALTER TABLE consultation_rooms DISABLE ROW LEVEL SECURITY;

-- ── users ─────────────────────────────────────────────────────────────────────
-- Reception staff and admin accounts.
-- Routes: POST /api/login, GET /api/admin/staff, /api/data

CREATE TABLE IF NOT EXISTS users (
  id                      TEXT        PRIMARY KEY,
  username                TEXT        NOT NULL,
  name                    TEXT        NOT NULL,
  role                    TEXT        NOT NULL,
  department_id           TEXT        REFERENCES departments(id) ON DELETE SET NULL,
  assigned_department_ids JSONB       NOT NULL DEFAULT '[]'::jsonb,
  permissions             JSONB       NOT NULL DEFAULT '[]'::jsonb,
  -- Authentication columns
  password                TEXT        DEFAULT 'password',   -- legacy plain text (migrated to password_hash)
  password_hash           TEXT,                             -- bcrypt hash (preferred)
  password_changed_at     TIMESTAMPTZ,
  failed_login_attempts   INTEGER     NOT NULL DEFAULT 0,
  locked_until            TIMESTAMPTZ,
  last_login_at           TIMESTAMPTZ,
  last_login_ip           TEXT,
  require_password_change BOOLEAN     NOT NULL DEFAULT FALSE,
  two_factor_enabled      BOOLEAN     NOT NULL DEFAULT FALSE,
  two_factor_secret       TEXT,
  is_active               BOOLEAN     NOT NULL DEFAULT TRUE
);

ALTER TABLE users DISABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_username_key'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
  END IF;
END $$;

-- ── queue_logs ────────────────────────────────────────────────────────────────
-- Audit trail of every token action (create, call, complete, skip, cancel).
-- Routes: GET /api/data (returns last 200), audit log admin tab

CREATE TABLE IF NOT EXISTS queue_logs (
  id           TEXT        PRIMARY KEY,
  token_id     TEXT,
  token_number TEXT,
  action       TEXT,
  user_id      TEXT,
  timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE queue_logs DISABLE ROW LEVEL SECURITY;

-- ── whatsapp_logs ─────────────────────────────────────────────────────────────
-- Log of all WhatsApp/email notifications sent to patients.
-- Routes: GET /api/data (returns last 100)

CREATE TABLE IF NOT EXISTS whatsapp_logs (
  id             TEXT        PRIMARY KEY,
  token_id       TEXT,
  token_number   TEXT,
  patient_name   TEXT,
  patient_mobile TEXT,
  message        TEXT,
  type           TEXT,
  status         TEXT,
  timestamp      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE whatsapp_logs DISABLE ROW LEVEL SECURITY;

-- ── settings ──────────────────────────────────────────────────────────────────
-- Single-row table (id = 1) — hospital config, announcements, queue settings.
-- Routes: /api/admin/settings/*, /api/queue/pause, /api/data

CREATE TABLE IF NOT EXISTS settings (
  id            INTEGER     PRIMARY KEY DEFAULT 1,
  is_paused     BOOLEAN     NOT NULL DEFAULT FALSE,
  hospital_info JSONB       NOT NULL DEFAULT '{}'::jsonb,
  announcements JSONB       NOT NULL DEFAULT '[]'::jsonb,
  config        JSONB       NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE settings DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- SECTION 2 — AUTHENTICATION & SECURITY TABLES
-- ============================================================

-- ── refresh_tokens ────────────────────────────────────────────────────────────
-- JWT refresh tokens.  Active = valid; is_active = false = revoked.
-- Routes: POST /api/auth/refresh, POST /api/logout

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          TEXT        PRIMARY KEY,
  user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ,
  revoked_by  TEXT,
  device_info JSONB       NOT NULL DEFAULT '{}'::jsonb,
  ip_address  TEXT,
  user_agent  TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE
);

ALTER TABLE refresh_tokens DISABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'refresh_tokens_token_key'
  ) THEN
    ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_token_key UNIQUE (token);
  END IF;
END $$;

-- ── user_sessions ─────────────────────────────────────────────────────────────
-- Active login sessions with device tracking.  session_token = JWT sessionId.
-- Routes: GET /api/auth/sessions, POST /api/auth/sessions/revoke-all

CREATE TABLE IF NOT EXISTS user_sessions (
  id               TEXT        PRIMARY KEY,
  user_id          TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_id TEXT        REFERENCES refresh_tokens(id) ON DELETE CASCADE,
  session_token    TEXT        NOT NULL,
  ip_address       TEXT,
  user_agent       TEXT,
  device_type      TEXT,
  device_id        TEXT,
  device_name      TEXT,
  browser          TEXT,
  os               TEXT,
  location_city    TEXT,
  location_country TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ NOT NULL,
  ended_at         TIMESTAMPTZ,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE
);

ALTER TABLE user_sessions DISABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_sessions_session_token_key'
  ) THEN
    ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_session_token_key UNIQUE (session_token);
  END IF;
END $$;

-- ── auth_audit_log ────────────────────────────────────────────────────────────
-- All login/logout/refresh events.  Used for security monitoring and audit tab.

CREATE TABLE IF NOT EXISTS auth_audit_log (
  id             TEXT        PRIMARY KEY,
  user_id        TEXT        REFERENCES users(id) ON DELETE SET NULL,
  username       TEXT,
  action         TEXT        NOT NULL,
  success        BOOLEAN     NOT NULL,
  failure_reason TEXT,
  ip_address     TEXT,
  user_agent     TEXT,
  device_info    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  portal         TEXT,
  timestamp      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE auth_audit_log DISABLE ROW LEVEL SECURITY;

-- ── security_events ───────────────────────────────────────────────────────────
-- Brute-force attempts, unusual devices, concurrent session alerts.

CREATE TABLE IF NOT EXISTS security_events (
  id          TEXT        PRIMARY KEY,
  user_id     TEXT        REFERENCES users(id) ON DELETE SET NULL,
  event_type  TEXT        NOT NULL,
  severity    TEXT        NOT NULL,
  description TEXT        NOT NULL,
  ip_address  TEXT,
  user_agent  TEXT,
  metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE security_events DISABLE ROW LEVEL SECURITY;

-- ── device_fingerprints ───────────────────────────────────────────────────────
-- Known devices per user — used to detect logins from new devices.

CREATE TABLE IF NOT EXISTS device_fingerprints (
  id               TEXT        PRIMARY KEY,
  user_id          TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fingerprint_hash TEXT        NOT NULL,
  device_name      TEXT,
  device_type      TEXT,
  browser          TEXT,
  os               TEXT,
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trusted          BOOLEAN     NOT NULL DEFAULT FALSE
);

ALTER TABLE device_fingerprints DISABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'device_fingerprints_user_id_fingerprint_hash_key'
  ) THEN
    ALTER TABLE device_fingerprints
      ADD CONSTRAINT device_fingerprints_user_id_fingerprint_hash_key
      UNIQUE (user_id, fingerprint_hash);
  END IF;
END $$;

-- ============================================================
-- SECTION 3 — PERFORMANCE INDEXES
-- ============================================================

-- tokens — most-queried table in the entire application
CREATE INDEX IF NOT EXISTS idx_tokens_status_created      ON tokens (status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_tokens_dept_status_created ON tokens (department_id, status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_tokens_doctor_status       ON tokens (doctor_id, status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_tokens_created_at          ON tokens (created_at ASC);
CREATE INDEX IF NOT EXISTS idx_tokens_dept_created        ON tokens (department_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_tokens_status              ON tokens (status);
CREATE INDEX IF NOT EXISTS idx_tokens_dept_called         ON tokens (department_id, status, called_at DESC)
  WHERE status = 'called';
CREATE INDEX IF NOT EXISTS idx_tokens_active_today        ON tokens (doctor_id, status, created_at)
  WHERE status IN ('waiting', 'called');
CREATE INDEX IF NOT EXISTS idx_tokens_number_dept         ON tokens (token_number, department_id);

-- patients
CREATE INDEX IF NOT EXISTS idx_patients_mobile    ON patients (mobile);
CREATE INDEX IF NOT EXISTS idx_patients_created   ON patients (created_at DESC);

-- users
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (lower(username));
CREATE INDEX IF NOT EXISTS idx_users_locked ON users (locked_until) WHERE locked_until IS NOT NULL;

-- doctors
CREATE INDEX IF NOT EXISTS idx_doctors_department ON doctors (department_id);

-- queue_logs
CREATE INDEX IF NOT EXISTS idx_queue_logs_timestamp ON queue_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_queue_logs_token     ON queue_logs (token_id);

-- whatsapp_logs
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_timestamp ON whatsapp_logs (timestamp DESC);

-- auth tables
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user    ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token   ON refresh_tokens (token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active  ON refresh_tokens (is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_sessions_user          ON user_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token         ON user_sessions (session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_active        ON user_sessions (is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_auth_audit_user        ON auth_audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_audit_timestamp   ON auth_audit_log (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_user   ON security_events (user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_ts     ON security_events (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_device_fingerprints_user ON device_fingerprints (user_id);

-- ============================================================
-- SECTION 4 — DATABASE FUNCTIONS & VIEWS
-- ============================================================

-- ── batch_update_tokens ───────────────────────────────────────────────────────
-- Called by queueRecalcWorker to update wait times for N tokens in one trip.
-- RPC: supabase.rpc('batch_update_tokens', { updates: JSON.stringify([...]) })

CREATE OR REPLACE FUNCTION batch_update_tokens(updates JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  rec         JSONB;
  rows_done   INTEGER := 0;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(updates)
  LOOP
    UPDATE tokens SET
      estimated_wait_time              = COALESCE((rec->'updates'->>'estimated_wait_time')::integer,    estimated_wait_time),
      expected_consultation_start_time = COALESCE((rec->'updates'->>'expected_consultation_start_time')::timestamptz, expected_consultation_start_time),
      last_notified_wait_time          = COALESCE((rec->'updates'->>'last_notified_wait_time')::integer, last_notified_wait_time),
      notified_two_remaining           = COALESCE((rec->'updates'->>'notified_two_remaining')::boolean,  notified_two_remaining),
      notified_your_turn               = COALESCE((rec->'updates'->>'notified_your_turn')::boolean,      notified_your_turn),
      notified_two_ahead               = COALESCE((rec->'updates'->>'notified_two_ahead')::boolean,      notified_two_ahead),
      "position"                         = COALESCE((rec->'updates'->>'position')::integer, "position")
    WHERE id = (rec->>'id');
    rows_done := rows_done + 1;
  END LOOP;
  RETURN rows_done;
END;
$$;

-- ── count_waiting_tokens ──────────────────────────────────────────────────────
-- Fast COUNT(*) replacing JS .length anti-pattern.
-- RPC: supabase.rpc('count_waiting_tokens')

CREATE OR REPLACE FUNCTION count_waiting_tokens()
RETURNS bigint
LANGUAGE sql STABLE
AS $$
  SELECT COUNT(*) FROM tokens WHERE status = 'waiting';
$$;

-- ── count_today_tokens_for_dept ───────────────────────────────────────────────
-- Fast dept-scoped daily COUNT.
-- RPC: supabase.rpc('count_today_tokens_for_dept', { p_department_id: '...' })

CREATE OR REPLACE FUNCTION count_today_tokens_for_dept(p_department_id text)
RETURNS bigint
LANGUAGE sql STABLE
AS $$
  SELECT COUNT(*)
  FROM tokens
  WHERE department_id = p_department_id
    AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC');
$$;

-- ── create_token_atomic ───────────────────────────────────────────────────────
-- Patient upsert + token insert in one server-side transaction.
-- Prevents race conditions on concurrent token generation.
-- RPC: supabase.rpc('create_token_atomic', { p_token_id: '...', ... })

CREATE OR REPLACE FUNCTION create_token_atomic(
  p_token_id           text,
  p_token_number       text,
  p_patient_name       text,
  p_patient_mobile     text,
  p_patient_email      text,
  p_patient_age        integer,
  p_patient_gender     text,
  p_department_id      text,
  p_department_name    text,
  p_doctor_id          text,
  p_doctor_name        text,
  p_reason_for_visit   text,
  p_priority           text,
  p_is_emergency       boolean,
  p_position           integer,
  p_est_consult_time   integer
)
RETURNS SETOF tokens
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO patients (id, name, mobile, email, age, gender, created_at)
  VALUES (
    'pat-' || extract(epoch from now())::bigint,
    p_patient_name, p_patient_mobile, p_patient_email,
    p_patient_age,  p_patient_gender, now()
  )
  ON CONFLICT (mobile) DO NOTHING;

  RETURN QUERY
  INSERT INTO tokens (
    id, token_number, patient_name, patient_mobile, patient_email,
    patient_age, patient_gender, department_id, department_name,
    doctor_id, doctor_name, reason_for_visit, status, priority,
    is_emergency, "position", estimated_consultation_time, created_at
  )
  VALUES (
    p_token_id, p_token_number, p_patient_name, p_patient_mobile, p_patient_email,
    p_patient_age, p_patient_gender, p_department_id, p_department_name,
    p_doctor_id, p_doctor_name, p_reason_for_visit, 'waiting', p_priority,
    p_is_emergency, p_position, p_est_consult_time, now()
  )
  RETURNING *;
END;
$$;

-- ── call_specific_token ───────────────────────────────────────────────────────
-- Atomic call — validates 'waiting' before updating.  Prevents double-call.
-- RPC: supabase.rpc('call_specific_token', { p_token_id: '...' })

CREATE OR REPLACE FUNCTION call_specific_token(p_token_id text)
RETURNS SETOF tokens
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE tokens
  SET status    = 'called',
      called_at = now()
  WHERE id     = p_token_id
    AND status = 'waiting'
  RETURNING *;
END;
$$;

-- ── call_next_patient ─────────────────────────────────────────────────────────
-- Selects the highest-priority waiting patient for a doctor atomically.
-- FOR UPDATE SKIP LOCKED prevents two receptionists calling the same patient.
-- RPC: supabase.rpc('call_next_patient', { p_doctor_id: '...', p_department_id: '...' })

CREATE OR REPLACE FUNCTION call_next_patient(
  p_doctor_id     text,
  p_department_id text
)
RETURNS SETOF tokens
LANGUAGE plpgsql
AS $$
DECLARE
  v_token_id text;
BEGIN
  SELECT id INTO v_token_id
  FROM tokens
  WHERE doctor_id = p_doctor_id
    AND status    = 'waiting'
  ORDER BY
    CASE priority
      WHEN 'VIP'                    THEN 4
      WHEN 'Person with Disability' THEN 3
      WHEN 'Pregnant Woman'         THEN 2
      WHEN 'Senior Citizen'         THEN 1
      ELSE 0
    END DESC,
    created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_token_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  UPDATE tokens
  SET status    = 'called',
      called_at = now()
  WHERE id = v_token_id
  RETURNING *;
END;
$$;

-- ── get_waiting_queue ─────────────────────────────────────────────────────────
-- Returns enriched waiting-queue rows with department and doctor info.
-- RPC: supabase.rpc('get_waiting_queue', { p_department_id, p_doctor_id })

CREATE OR REPLACE FUNCTION get_waiting_queue(
  p_department_id TEXT DEFAULT NULL,
  p_doctor_id     TEXT DEFAULT NULL
)
RETURNS TABLE (
  id                   TEXT,
  token_number         TEXT,
  patient_name         TEXT,
  patient_mobile       TEXT,
  status               TEXT,
  department_name      TEXT,
  doctor_name          TEXT,
  room_number          TEXT,
  "position"             INTEGER,
  created_at           TIMESTAMPTZ,
  estimated_wait_time  INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id, t.token_number, t.patient_name, t.patient_mobile, t.status,
    d.name, doc.name, doc.room_number, t."position", t.created_at, t.estimated_wait_time
  FROM tokens t
  LEFT JOIN departments d   ON t.department_id = d.id
  LEFT JOIN doctors     doc ON t.doctor_id     = doc.id
  WHERE t.status = 'waiting'
    AND (p_department_id IS NULL OR p_department_id = 'all' OR t.department_id = p_department_id)
    AND (p_doctor_id     IS NULL OR p_doctor_id     = 'all' OR t.doctor_id     = p_doctor_id)
  ORDER BY t.created_at ASC;
END;
$$;

-- ── get_today_token_count ─────────────────────────────────────────────────────
-- RPC: supabase.rpc('get_today_token_count', { p_department_id })

CREATE OR REPLACE FUNCTION get_today_token_count(p_department_id TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  n INTEGER;
BEGIN
  SELECT COUNT(*) INTO n
  FROM tokens
  WHERE created_at >= CURRENT_DATE
    AND (p_department_id IS NULL OR department_id = p_department_id);
  RETURN n;
END;
$$;

-- ── active_queue view ─────────────────────────────────────────────────────────
-- Used by optimizedTokenRepository.getActiveQueue()

CREATE OR REPLACE VIEW active_queue AS
SELECT
  t.*,
  d.name        AS dept_name_joined,
  doc.name      AS doctor_name_joined,
  doc.room_number,
  doc.avg_consultation_time
FROM tokens t
LEFT JOIN departments d   ON t.department_id = d.id
LEFT JOIN doctors     doc ON t.doctor_id     = doc.id
WHERE t.status IN ('waiting', 'called')
ORDER BY
  CASE t.status WHEN 'called' THEN 0 ELSE 1 END,
  t.created_at ASC;

-- ── auth helper functions ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_user_active_sessions(p_user_id TEXT)
RETURNS TABLE (
  id               TEXT,
  device_name      TEXT,
  device_type      TEXT,
  browser          TEXT,
  os               TEXT,
  ip_address       TEXT,
  location_city    TEXT,
  location_country TEXT,
  created_at       TIMESTAMPTZ,
  last_active_at   TIMESTAMPTZ,
  is_current       BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id, s.device_name, s.device_type, s.browser, s.os, s.ip_address,
    s.location_city, s.location_country, s.created_at, s.last_active_at,
    (s.last_active_at > NOW() - INTERVAL '5 minutes') AS is_current
  FROM user_sessions s
  WHERE s.user_id    = p_user_id
    AND s.is_active  = TRUE
    AND s.expires_at > NOW()
  ORDER BY s.last_active_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION revoke_all_user_sessions(
  p_user_id            TEXT,
  p_except_session_id  TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  n INTEGER;
BEGIN
  UPDATE user_sessions
  SET is_active = FALSE, ended_at = NOW()
  WHERE user_id = p_user_id
    AND is_active = TRUE
    AND (p_except_session_id IS NULL OR id <> p_except_session_id);
  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE refresh_tokens
  SET is_active = FALSE, revoked_at = NOW()
  WHERE user_id = p_user_id
    AND is_active = TRUE
    AND (p_except_session_id IS NULL OR id NOT IN (
      SELECT refresh_token_id FROM user_sessions WHERE id = p_except_session_id
    ));

  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION clean_expired_refresh_tokens()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE n INTEGER; BEGIN
  DELETE FROM refresh_tokens WHERE expires_at < NOW() AND is_active = FALSE;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION clean_expired_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE n INTEGER; BEGIN
  UPDATE user_sessions SET is_active = FALSE, ended_at = NOW()
  WHERE expires_at < NOW() AND is_active = TRUE;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ============================================================
-- SECTION 5 — SEED DATA
-- ============================================================

-- Settings (single row, id = 1)
INSERT INTO settings (id, is_paused, hospital_info, announcements, config)
VALUES (
  1,
  FALSE,
  '{"name":"St. Jude Memorial Hospital","tagline":"Compassionate Care, Advanced Medicine","address":"742 Evergreen Terrace, Medical District, Sector 4","phone":"+1 (555) 010-9900","logoColor":"text-blue-600"}',
  '[{"id":"ann-1","text":"Welcome to St. Jude Memorial Hospital. Please wait for your token to flash on the live queue TV display.","createdAt":"2026-07-17T08:00:00Z"},{"id":"ann-2","text":"Note: Patients under emergency token designations will be expedited immediately to critical care units.","createdAt":"2026-07-17T08:05:00Z"}]',
  '{"tokenPrefix":"","dailyTokenReset":true,"queueStartNumber":1,"emergencyQueue":true,"walkInQueue":true,"maxQueueSize":100,"defaultWaitingTime":15,"numberFormat":"001","maxDailyTokens":500,"consultationStartTime":"09:00","consultationEndTime":"17:00","autoSkipTimeout":180,"maxWaitingTime":120,"minWaitTimeNotificationThreshold":5,"enableWhatsAppUpdates":true}'
)
ON CONFLICT (id) DO UPDATE SET
  hospital_info = EXCLUDED.hospital_info,
  config        = EXCLUDED.config;

-- Departments (5 clinical divisions)
INSERT INTO departments (id, name, prefix, is_enabled, default_consultation_time) VALUES
  ('dep-1', 'General Medicine',  'GEN',  TRUE, 15),
  ('dep-2', 'Pediatrics',        'PEDS', TRUE, 15),
  ('dep-3', 'Cardiology',        'CARD', TRUE, 15),
  ('dep-4', 'Orthopedics',       'ORTH', TRUE, 15),
  ('dep-5', 'Ophthalmology',     'EYE',  TRUE, 15)
ON CONFLICT (id) DO NOTHING;

-- Doctors (6 physicians across 5 departments)
INSERT INTO doctors (id, name, department_id, specialization, status, room_number, avg_consultation_time, start_time, end_time, max_patients_per_day, is_enabled) VALUES
  ('doc-1', 'Dr. Sarah Jenkins',     'dep-1', 'Primary Care / Family Medicine', 'active', '101', 15, '08:00', '17:00', 40, TRUE),
  ('doc-2', 'Dr. Robert Chen',       'dep-1', 'Internal Medicine',              'active', 'G-12',15, '08:00', '17:00', 40, TRUE),
  ('doc-3', 'Dr. Alisha Patel',      'dep-3', 'Interventional Cardiology',      'active', '302', 15, '08:00', '17:00', 40, TRUE),
  ('doc-4', 'Dr. Marcus Vance',      'dep-4', 'Bone & Joint Surgery',           'active', 'G-12',15, '08:00', '17:00', 40, TRUE),
  ('doc-5', 'Dr. Emily Wong',        'dep-2', 'General Pediatrics',             'active', '204', 15, '08:00', '17:00', 40, TRUE),
  ('doc-6', 'Dr. Arthur Pendelton', 'dep-5', 'Refractive Surgery',             'active', 'G-12',15, '08:00', '17:00', 40, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Consultation rooms (3 rooms)
INSERT INTO consultation_rooms (id, room_number, room_name, assigned_doctor_id, department_id, status) VALUES
  ('rm-1', '101', 'Room 101 (Primary Care)', 'doc-1', 'dep-1', 'available'),
  ('rm-2', '204', 'Room 204 (Pediatrics)',   'doc-5', 'dep-2', 'available'),
  ('rm-3', '302', 'Room 302 (Cardiology)',   'doc-3', 'dep-3', 'available')
ON CONFLICT (id) DO NOTHING;

-- Tracking devices (5 smart pagers)
INSERT INTO tracking_devices (id, device_code, name, status, battery_level) VALUES
  ('dev-1', 'DEVICE-01', 'Smart Pager #01', 'available', 100),
  ('dev-2', 'DEVICE-02', 'Smart Pager #02', 'available', 95),
  ('dev-3', 'DEVICE-03', 'Smart Pager #03', 'available', 88),
  ('dev-4', 'DEVICE-04', 'Smart Pager #04', 'available', 100),
  ('dev-5', 'DEVICE-05', 'Smart Pager #05', 'available', 72)
ON CONFLICT (id) DO NOTHING;

-- Users
-- IMPORTANT: passwords are stored as plain text here so the application's
-- existing authService (which checks userRow.password first) can authenticate.
-- The next login will automatically upgrade these to bcrypt hashes.
-- Admin credentials:    admin      / Admin@123
-- Reception credentials: reception  / Reception@123

INSERT INTO users (id, username, name, role, department_id, assigned_department_ids, permissions, password, password_hash, is_active) VALUES
  (
    'user-admin-default',
    'admin',
    'Dr. Helen Vance (Chief Administrator)',
    'admin',
    NULL,
    '[]'::jsonb,
    '["manage_hospital","manage_doctors","manage_departments","manage_rooms","manage_staff","manage_config"]'::jsonb,
    'Admin@123',
    NULL,
    TRUE
  ),
  (
    'user-reception-default',
    'reception',
    'Claire Redfield (Senior Registrar)',
    'receptionist',
    'dep-1',
    '["dep-1"]'::jsonb,
    '["register_patient","generate_token","call_token","complete_token","skip_token","cancel_token","pause_queue"]'::jsonb,
    'Reception@123',
    NULL,
    TRUE
  ),
  (
    'user-reception2',
    'reception2',
    'Leon S. Kennedy (Junior Clerk)',
    'receptionist',
    NULL,
    '[]'::jsonb,
    '["register_patient","generate_token","call_token","complete_token","skip_token","cancel_token","pause_queue"]'::jsonb,
    'password',
    NULL,
    TRUE
  )
ON CONFLICT (id) DO UPDATE SET
  password      = EXCLUDED.password,
  password_hash = NULL,          -- clear stale bcrypt hash so plain-text auth works
  is_active     = TRUE;

-- ============================================================
-- SECTION 6 — VERIFICATION QUERY
-- ============================================================
-- After running, execute this to confirm all 14 tables exist:

SELECT table_name, (
  SELECT COUNT(*) FROM information_schema.columns c
  WHERE c.table_name = t.table_name AND c.table_schema = 'public'
) AS column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_type   = 'BASE TABLE'
  AND table_name IN (
    'departments','doctors','patients','tokens','tracking_devices',
    'consultation_rooms','users','queue_logs','whatsapp_logs','settings',
    'refresh_tokens','user_sessions','auth_audit_log',
    'security_events','device_fingerprints'
  )
ORDER BY table_name;
