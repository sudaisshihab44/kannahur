-- ============================================================
-- Migration 007b: Performance Indexes
-- ============================================================
-- Run AFTER 007a in Supabase SQL Editor.
-- Each statement is independent — if one fails, the rest still run.
-- ============================================================

-- ── tokens ───────────────────────────────────────────────────────────────────

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

-- ── patients ──────────────────────────────────────────────────────────────────

-- patients.mobile is already UNIQUE in the schema (unique constraint exists).
-- This index makes the constraint lookup explicit and faster.
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_mobile
  ON patients (mobile);

-- ── users ─────────────────────────────────────────────────────────────────────

-- Functional lower() index so ILIKE queries can use the index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower
  ON users (lower(username));

-- ── doctors ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_doctors_department
  ON doctors (department_id);

-- ── queue_logs ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_queue_logs_timestamp
  ON queue_logs (timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_queue_logs_token
  ON queue_logs (token_id);

-- ── whatsapp_logs ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_timestamp
  ON whatsapp_logs (timestamp DESC);
