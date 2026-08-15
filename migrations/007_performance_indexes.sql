-- ============================================================
-- Migration 007: Full Performance Migration
-- ============================================================
-- If the Supabase SQL editor fails mid-run, use the split files instead:
--   007a_cleanup_duplicates.sql  (run first)
--   007b_indexes.sql             (run second)
--   007c_functions.sql           (run third)
-- ============================================================

-- ============================================================
-- Migration 007a: Clean up duplicate token numbers
-- ============================================================
-- Run this FIRST in Supabase SQL Editor.
-- Removes older duplicate (token_number, department_id) rows,
-- keeping only the most recently created one per pair.
-- Safe to run multiple times (idempotent).
-- ============================================================

DELETE FROM tokens
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY token_number, department_id
             ORDER BY created_at DESC
           ) AS rn
    FROM tokens
  ) ranked
  WHERE rn > 1
);


-- ============================================================
-- Migration 007b: Performance Indexes
-- ============================================================
-- Run AFTER 007a in Supabase SQL Editor.
-- Each statement is independent â€” if one fails, the rest still run.
-- ============================================================

-- â”€â”€ tokens â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE INDEX IF NOT EXISTS idx_tokens_status_created
  ON tokens (status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_tokens_dept_status_created
  ON tokens (department_id, status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_tokens_doctor_status_created
  ON tokens (doctor_id, status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_tokens_created_at
  ON tokens (created_at ASC);

CREATE INDEX IF NOT EXISTS idx_tokens_dept_created
  ON tokens (department_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_tokens_dept_called
  ON tokens (department_id, status, called_at DESC)
  WHERE status = 'called';

CREATE INDEX IF NOT EXISTS idx_tokens_active_today
  ON tokens (doctor_id, status, created_at)
  WHERE status IN ('waiting', 'called');

CREATE INDEX IF NOT EXISTS idx_tokens_number_dept
  ON tokens (token_number, department_id);

-- â”€â”€ patients â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

-- patients.mobile is already UNIQUE in the schema (unique constraint exists).
-- This index makes the constraint lookup explicit and faster.
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_mobile
  ON patients (mobile);

-- â”€â”€ users â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

-- Functional lower() index so ILIKE queries can use the index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower
  ON users (lower(username));

-- â”€â”€ doctors â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE INDEX IF NOT EXISTS idx_doctors_department
  ON doctors (department_id);

-- â”€â”€ queue_logs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE INDEX IF NOT EXISTS idx_queue_logs_timestamp
  ON queue_logs (timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_queue_logs_token
  ON queue_logs (token_id);

-- â”€â”€ whatsapp_logs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_timestamp
  ON whatsapp_logs (timestamp DESC);


-- ============================================================
-- Migration 007c: Database Functions (COUNT + Atomic RPCs)
-- ============================================================
-- Run AFTER 007b in Supabase SQL Editor.
-- ============================================================

-- â”€â”€ COUNT helpers (replaces JS .length anti-pattern) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

CREATE OR REPLACE FUNCTION count_waiting_tokens()
RETURNS bigint
LANGUAGE sql STABLE
AS $$
  SELECT COUNT(*) FROM tokens WHERE status = 'waiting';
$$;

CREATE OR REPLACE FUNCTION count_today_tokens_for_dept(p_department_id text)
RETURNS bigint
LANGUAGE sql STABLE
AS $$
  SELECT COUNT(*)
  FROM tokens
  WHERE department_id = p_department_id
    AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC');
$$;

-- â”€â”€ Atomic token creation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Upserts patient + inserts token in one server-side transaction.
-- Replaces 2â€“3 sequential round-trips with a single RPC call.

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
  -- Upsert patient â€” do nothing if mobile already exists
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

  -- Insert token and return the full row
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

-- â”€â”€ Atomic call-next (by doctor) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Selects the highest-priority waiting patient for a doctor,
-- marks them as 'called', and returns the row atomically.
-- FOR UPDATE SKIP LOCKED prevents two receptionists calling the same patient.

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

  IF v_token_id IS NULL THEN
    RETURN;  -- no waiting patients
  END IF;

  RETURN QUERY
  UPDATE tokens
  SET status    = 'called',
      called_at = now()
  WHERE id = v_token_id
  RETURNING *;
END;
$$;

-- â”€â”€ Atomic call-specific-token â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Called when receptionist explicitly selects a specific token.
-- Validates it is still 'waiting' before updating â€” prevents double-call.

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
    AND status = 'waiting'  -- guard: only succeeds if still waiting
  RETURNING *;
  -- Returns empty set if the token was already called/completed
END;
$$;
