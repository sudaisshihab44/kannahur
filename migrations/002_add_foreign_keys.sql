-- ============================================================
-- Migration 002: Add Foreign Key Constraints
-- ============================================================
-- Purpose: Enforce referential integrity between tables
-- Impact: Prevents orphaned records, ensures data consistency
-- Risk: Medium (may fail if orphaned records exist)
-- Estimated time: 1-2 minutes
-- ============================================================

-- ============================================================
-- PRE-MIGRATION: Check for Orphaned Records
-- ============================================================

-- Check for orphaned doctors (department_id references non-existent department)
SELECT 
  'ORPHANED DOCTORS' as issue_type,
  COUNT(*) as count
FROM doctors d
WHERE d.department_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM departments WHERE id = d.department_id);

-- Check for orphaned tokens (invalid department or doctor references)
SELECT 
  'ORPHANED TOKENS (dept)' as issue_type,
  COUNT(*) as count
FROM tokens t
WHERE t.department_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM departments WHERE id = t.department_id);

SELECT 
  'ORPHANED TOKENS (doctor)' as issue_type,
  COUNT(*) as count
FROM tokens t
WHERE t.doctor_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM doctors WHERE id = t.doctor_id);

-- Check for orphaned tracking_devices (invalid token reference)
SELECT 
  'ORPHANED DEVICES' as issue_type,
  COUNT(*) as count
FROM tracking_devices td
WHERE td.assigned_token_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tokens WHERE id = td.assigned_token_id);

-- Check for orphaned users (invalid department reference)
SELECT 
  'ORPHANED USERS' as issue_type,
  COUNT(*) as count
FROM users u
WHERE u.department_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM departments WHERE id = u.department_id);

-- ============================================================
-- CLEANUP: Fix Orphaned Records (if any found above)
-- ============================================================

-- Clean orphaned doctors
UPDATE doctors 
SET department_id = NULL 
WHERE department_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM departments WHERE id = doctors.department_id);

-- Clean orphaned tokens (set to NULL, don't delete tokens)
UPDATE tokens 
SET department_id = NULL 
WHERE department_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM departments WHERE id = tokens.department_id);

UPDATE tokens 
SET doctor_id = NULL 
WHERE doctor_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM doctors WHERE id = tokens.doctor_id);

-- Clean orphaned tracking devices
UPDATE tracking_devices 
SET assigned_token_id = NULL, assigned_token_number = NULL, status = 'available'
WHERE assigned_token_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tokens WHERE id = tracking_devices.assigned_token_id);

-- Clean orphaned users
UPDATE users 
SET department_id = NULL 
WHERE department_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM departments WHERE id = users.department_id);

-- ============================================================
-- ADD FOREIGN KEY CONSTRAINTS
-- ============================================================

-- ── DOCTORS → DEPARTMENTS ────────────────────────────────────

ALTER TABLE doctors
ADD CONSTRAINT fk_doctors_department
FOREIGN KEY (department_id)
REFERENCES departments(id)
ON DELETE SET NULL  -- If department deleted, doctor becomes unassigned
ON UPDATE CASCADE;

-- ── TOKENS → DEPARTMENTS ─────────────────────────────────────

ALTER TABLE tokens
ADD CONSTRAINT fk_tokens_department
FOREIGN KEY (department_id)
REFERENCES departments(id)
ON DELETE SET NULL  -- If department deleted, token keeps other data
ON UPDATE CASCADE;

-- ── TOKENS → DOCTORS ─────────────────────────────────────────

ALTER TABLE tokens
ADD CONSTRAINT fk_tokens_doctor
FOREIGN KEY (doctor_id)
REFERENCES doctors(id)
ON DELETE SET NULL  -- If doctor deleted, token keeps other data
ON UPDATE CASCADE;

-- ── TOKENS → TRACKING_DEVICES ────────────────────────────────

ALTER TABLE tokens
ADD CONSTRAINT fk_tokens_device
FOREIGN KEY (device_id)
REFERENCES tracking_devices(id)
ON DELETE SET NULL  -- If device deleted, token keeps other data
ON UPDATE CASCADE;

-- ── TRACKING_DEVICES → TOKENS ────────────────────────────────

ALTER TABLE tracking_devices
ADD CONSTRAINT fk_devices_assigned_token
FOREIGN KEY (assigned_token_id)
REFERENCES tokens(id)
ON DELETE SET NULL  -- If token deleted, device becomes available
ON UPDATE CASCADE;

-- ── USERS → DEPARTMENTS ──────────────────────────────────────

ALTER TABLE users
ADD CONSTRAINT fk_users_department
FOREIGN KEY (department_id)
REFERENCES departments(id)
ON DELETE SET NULL  -- If department deleted, user becomes unassigned
ON UPDATE CASCADE;

-- ── CONSULTATION_ROOMS → DOCTORS ─────────────────────────────

ALTER TABLE consultation_rooms
ADD CONSTRAINT fk_rooms_assigned_doctor
FOREIGN KEY (assigned_doctor_id)
REFERENCES doctors(id)
ON DELETE SET NULL  -- If doctor deleted, room becomes unassigned
ON UPDATE CASCADE;

-- ── CONSULTATION_ROOMS → DEPARTMENTS ─────────────────────────

ALTER TABLE consultation_rooms
ADD CONSTRAINT fk_rooms_department
FOREIGN KEY (department_id)
REFERENCES departments(id)
ON DELETE SET NULL
ON UPDATE CASCADE;

-- ============================================================
-- VERIFICATION
-- ============================================================

-- List all foreign key constraints
SELECT
  conname AS constraint_name,
  conrelid::regclass AS table_name,
  a.attname AS column_name,
  confrelid::regclass AS referenced_table,
  af.attname AS referenced_column,
  CASE confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS on_delete_action,
  CASE confupdtype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS on_update_action
FROM pg_constraint AS c
JOIN pg_attribute AS a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
JOIN pg_attribute AS af ON af.attrelid = c.confrelid AND af.attnum = ANY(c.confkey)
WHERE c.contype = 'f'
  AND c.connamespace = 'public'::regnamespace
ORDER BY table_name, constraint_name;

-- ============================================================
-- ROLLBACK (if needed)
-- ============================================================

/*
ALTER TABLE doctors DROP CONSTRAINT IF EXISTS fk_doctors_department;
ALTER TABLE tokens DROP CONSTRAINT IF EXISTS fk_tokens_department;
ALTER TABLE tokens DROP CONSTRAINT IF EXISTS fk_tokens_doctor;
ALTER TABLE tokens DROP CONSTRAINT IF EXISTS fk_tokens_device;
ALTER TABLE tracking_devices DROP CONSTRAINT IF EXISTS fk_devices_assigned_token;
ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_department;
ALTER TABLE consultation_rooms DROP CONSTRAINT IF EXISTS fk_rooms_assigned_doctor;
ALTER TABLE consultation_rooms DROP CONSTRAINT IF EXISTS fk_rooms_department;
*/
