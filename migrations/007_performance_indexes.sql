-- ============================================================
-- Migration 007: Performance Indexes for Hot-Path Queries
-- ============================================================
-- Run in Supabase SQL Editor.
-- Each index is justified with the exact query it accelerates.
-- ============================================================

-- ── tokens table ─────────────────────────────────────────────────────────────

-- 1. findTokenById: SELECT * FROM tokens WHERE id = $1
--    Already covered by the PRIMARY KEY index — no new index needed.

-- 2. findWaitingTokens / computeWaitingQueue:
--    SELECT * FROM tokens WHERE status = 'waiting' ORDER BY created_at ASC
--    SELECT * FROM tokens WHERE status = 'waiting' AND department_id = $1
--    SELECT * FROM tokens WHERE status = 'waiting' AND doctor_id = $1
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tokens_status_created
  ON tokens (status, created_at ASC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tokens_dept_status_created
  ON tokens (department_id, status, created_at ASC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tokens_doctor_status_created
  ON tokens (doctor_id, status, created_at ASC);

-- 3. findTodayTokens: SELECT * FROM tokens WHERE created_at >= $today ORDER BY created_at
--    Covered by idx_tokens_status_created partial; also:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tokens_created_at
  ON tokens (created_at ASC);

-- 4. countTodayTokensForDept (used as fallback when Redis unavailable):
--    SELECT id FROM tokens WHERE department_id=$1 AND created_at >= $today
--    idx_tokens_dept_status_created covers department_id; add date-scoped:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tokens_dept_created
  ON tokens (department_id, created_at ASC);

-- 5. countWaitingTokens (fallback position counter):
--    SELECT id FROM tokens WHERE status = 'waiting'
--    Covered by idx_tokens_status_created (leading column = status).

-- 6. findCurrentlyCalledToken:
--    SELECT * FROM tokens WHERE department_id=$1 AND status='called'
--    ORDER BY called_at DESC LIMIT 1
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tokens_dept_called
  ON tokens (department_id, status, called_at DESC)
  WHERE status = 'called';

-- 7. recalculateQueueWaitTimes — findActiveTokens:
--    SELECT * FROM tokens  (no filter — full scan is unavoidable for recalc,
--    but scoped to today+recent keeps it fast)
--    Partial index for today's tokens only:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tokens_active_today
  ON tokens (doctor_id, status, created_at)
  WHERE status IN ('waiting', 'called');

-- 8. Token number uniqueness (token_number is used in tracker links)
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_tokens_number_unique
  ON tokens (token_number, department_id);

-- ── patients table ────────────────────────────────────────────────────────────

-- 9. findPatientByMobile: SELECT * FROM patients WHERE mobile = $1
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_patients_mobile
  ON patients (mobile);

-- ── users table ───────────────────────────────────────────────────────────────

-- 10. findUserByUsername: SELECT * FROM users WHERE username ILIKE $1
--     ILIKE (case-insensitive) cannot use a plain btree index.
--     Use a functional lower() index so ILIKE lower($1) can hit it:
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_users_username_lower
  ON users (lower(username));

-- 11. findUserById: covered by PRIMARY KEY.

-- ── doctors table ─────────────────────────────────────────────────────────────

-- 12. findDoctorById: covered by PRIMARY KEY.
-- 13. findDoctorsByDept:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_doctors_department
  ON doctors (department_id);

-- ── queue_logs table ──────────────────────────────────────────────────────────

-- 14. findQueueLogs: SELECT * FROM queue_logs ORDER BY timestamp DESC LIMIT 200
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queue_logs_timestamp
  ON queue_logs (timestamp DESC);

-- 15. queue_logs by token for audit trail:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queue_logs_token
  ON queue_logs (token_id);

-- ── whatsapp_logs table ───────────────────────────────────────────────────────

-- 16. findNotificationLogs: SELECT * FROM whatsapp_logs ORDER BY timestamp DESC LIMIT 100
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_whatsapp_logs_timestamp
  ON whatsapp_logs (timestamp DESC);

-- ============================================================
-- Database-side COUNT functions (replaces JS .length anti-pattern)
-- ============================================================

-- 17. Fast count of waiting tokens (replaces countWaitingTokens SELECT id)
CREATE OR REPLACE FUNCTION count_waiting_tokens()
RETURNS bigint
LANGUAGE sql STABLE
AS $$
  SELECT COUNT(*) FROM tokens WHERE status = 'waiting';
$$;

-- 18. Fast count of today's tokens for a department
--     (replaces countTodayTokensForDept SELECT id + JS .length)
CREATE OR REPLACE FUNCTION count_today_tokens_for_dept(p_department_id text)
RETURNS bigint
LANGUAGE sql STABLE
AS $$
  SELECT COUNT(*)
  FROM tokens
  WHERE department_id = p_department_id
    AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC');
$$;

-- ============================================================
-- Atomic token creation RPC
-- ============================================================
-- Replaces 3 sequential DB round-trips with 1:
--   1. Insert patient (upsert on mobile)
--   2. Count today's tokens for dept (already in Redis; this is the DB fallback)
--   3. Insert token
--
-- Returns the inserted token row.
-- Call from Node.js: supabase.rpc('create_token_atomic', {...})
-- ============================================================

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
  -- Upsert patient (do nothing if mobile already exists)
  INSERT INTO patients (id, name, mobile, email, age, gender, created_at)
  VALUES (
    'pat-' || extract(epoch from now())::bigint,
    p_patient_name,
    p_patient_mobile,
    p_patient_email,
    p_patient_age,
    p_patient_gender,
    now()
  )
  ON CONFLICT (mobile) DO NOTHING;

  -- Insert token and return the row
  RETURN QUERY
  INSERT INTO tokens (
    id, token_number, patient_name, patient_mobile, patient_email,
    patient_age, patient_gender, department_id, department_name,
    doctor_id, doctor_name, reason_for_visit, status, priority,
    is_emergency, position, estimated_consultation_time, created_at
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

-- ============================================================
-- Atomic call-next RPC
-- ============================================================
-- Selects the highest-priority waiting token for a doctor,
-- marks it as 'called', and returns it — all in one transaction.
-- Prevents two receptionists from calling the same patient.
-- ============================================================

CREATE OR REPLACE FUNCTION call_next_patient(
  p_doctor_id      text,
  p_department_id  text
)
RETURNS SETOF tokens
LANGUAGE plpgsql
AS $$
DECLARE
  v_token_id text;
BEGIN
  -- Select the next patient with row lock (SKIP LOCKED prevents deadlocks)
  -- Priority: VIP(4) > Disability(3) > Pregnant(2) > Senior(1) > Normal(0)
  -- Within same priority: oldest first (FCFS)
  SELECT id INTO v_token_id
  FROM tokens
  WHERE doctor_id = p_doctor_id
    AND status = 'waiting'
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

  IF v_token_id IS NULL THEN
    -- No waiting patients for this doctor
    RETURN;
  END IF;

  -- Atomically mark as called and return updated row
  RETURN QUERY
  UPDATE tokens
  SET status    = 'called',
      called_at = now()
  WHERE id = v_token_id
  RETURNING *;
END;
$$;

-- ============================================================
-- Atomic call-specific-token RPC
-- ============================================================
-- Used when receptionist explicitly calls a specific token ID.
-- Validates it is still 'waiting' before updating.
-- ============================================================

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
    AND status = 'waiting'   -- only update if still waiting (prevents double-call)
  RETURNING *;
  -- Returns empty set if token was not in 'waiting' state
END;
$$;
