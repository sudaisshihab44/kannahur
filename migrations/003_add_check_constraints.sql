-- ============================================================
-- Migration 003: Add CHECK Constraints for Data Validation
-- ============================================================
-- Purpose: Enforce valid enum values at database level
-- Impact: Prevents invalid status/role/priority values
-- Risk: Low (validates data integrity)
-- Estimated time: 1 minute
-- ============================================================

-- ── TOKENS TABLE ─────────────────────────────────────────────

-- Valid token status values
ALTER TABLE tokens
ADD CONSTRAINT chk_tokens_status
CHECK (status IN ('waiting', 'called', 'completed', 'skipped', 'cancelled'));

-- Valid priority values
ALTER TABLE tokens
ADD CONSTRAINT chk_tokens_priority
CHECK (priority IN ('Normal', 'Senior Citizen', 'Pregnant Woman', 'Person with Disability', 'VIP'));

-- Position must be positive
ALTER TABLE tokens
ADD CONSTRAINT chk_tokens_position_positive
CHECK (position > 0);

-- Estimated wait time cannot be negative
ALTER TABLE tokens
ADD CONSTRAINT chk_tokens_wait_time_positive
CHECK (estimated_wait_time IS NULL OR estimated_wait_time >= 0);

-- ── DOCTORS TABLE ────────────────────────────────────────────

-- Valid doctor status values
ALTER TABLE doctors
ADD CONSTRAINT chk_doctors_status
CHECK (status IN ('active', 'inactive', 'available', 'busy', 'break', 'leave', 'offline'));

-- Avg consultation time must be positive
ALTER TABLE doctors
ADD CONSTRAINT chk_doctors_consult_time_positive
CHECK (avg_consultation_time > 0);

-- Max patients per day must be positive
ALTER TABLE doctors
ADD CONSTRAINT chk_doctors_max_patients_positive
CHECK (max_patients_per_day > 0);

-- ── TRACKING_DEVICES TABLE ───────────────────────────────────

-- Valid device status values
ALTER TABLE tracking_devices
ADD CONSTRAINT chk_devices_status
CHECK (status IN ('available', 'in_use', 'offline', 'charging'));

-- Battery level must be between 0-100
ALTER TABLE tracking_devices
ADD CONSTRAINT chk_devices_battery_range
CHECK (battery_level >= 0 AND battery_level <= 100);

-- ── CONSULTATION_ROOMS TABLE ─────────────────────────────────

-- Valid room status values
ALTER TABLE consultation_rooms
ADD CONSTRAINT chk_rooms_status
CHECK (status IN ('available', 'occupied', 'maintenance', 'inactive'));

-- ── USERS TABLE ──────────────────────────────────────────────

-- Valid user role values
ALTER TABLE users
ADD CONSTRAINT chk_users_role
CHECK (role IN ('admin', 'receptionist'));

-- Username must not be empty
ALTER TABLE users
ADD CONSTRAINT chk_users_username_not_empty
CHECK (LENGTH(TRIM(username)) > 0);

-- ── PATIENTS TABLE ───────────────────────────────────────────

-- Valid gender values
ALTER TABLE patients
ADD CONSTRAINT chk_patients_gender
CHECK (gender IN ('male', 'female', 'other'));

-- Mobile number must not be empty
ALTER TABLE patients
ADD CONSTRAINT chk_patients_mobile_not_empty
CHECK (LENGTH(TRIM(mobile)) > 0);

-- Age must be reasonable (0-150)
ALTER TABLE patients
ADD CONSTRAINT chk_patients_age_range
CHECK (age >= 0 AND age <= 150);

-- ── DEPARTMENTS TABLE ────────────────────────────────────────

-- Prefix must be uppercase and non-empty
ALTER TABLE departments
ADD CONSTRAINT chk_departments_prefix_format
CHECK (prefix = UPPER(prefix) AND LENGTH(TRIM(prefix)) > 0);

-- Default consultation time must be positive
ALTER TABLE departments
ADD CONSTRAINT chk_departments_consult_time_positive
CHECK (default_consultation_time > 0);

-- ── QUEUE_LOGS TABLE ─────────────────────────────────────────

-- Valid queue action values
ALTER TABLE queue_logs
ADD CONSTRAINT chk_queue_logs_action
CHECK (action IN ('created', 'called', 'completed', 'skipped', 'cancelled', 'recalled', 'assigned_depts'));

-- ── WHATSAPP_LOGS TABLE ──────────────────────────────────────

-- Valid notification type values
ALTER TABLE whatsapp_logs
ADD CONSTRAINT chk_whatsapp_logs_type
CHECK (type IN ('welcome', 'update', 'two_remaining', 'your_turn'));

-- ============================================================
-- VERIFICATION
-- ============================================================

-- List all check constraints
SELECT
  conname AS constraint_name,
  conrelid::regclass AS table_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE contype = 'c'
  AND connamespace = 'public'::regnamespace
  AND conname LIKE 'chk_%'
ORDER BY table_name, constraint_name;

-- ============================================================
-- ROLLBACK (if needed)
-- ============================================================

/*
-- Tokens
ALTER TABLE tokens DROP CONSTRAINT IF EXISTS chk_tokens_status;
ALTER TABLE tokens DROP CONSTRAINT IF EXISTS chk_tokens_priority;
ALTER TABLE tokens DROP CONSTRAINT IF EXISTS chk_tokens_position_positive;
ALTER TABLE tokens DROP CONSTRAINT IF EXISTS chk_tokens_wait_time_positive;

-- Doctors
ALTER TABLE doctors DROP CONSTRAINT IF EXISTS chk_doctors_status;
ALTER TABLE doctors DROP CONSTRAINT IF EXISTS chk_doctors_consult_time_positive;
ALTER TABLE doctors DROP CONSTRAINT IF EXISTS chk_doctors_max_patients_positive;

-- Tracking Devices
ALTER TABLE tracking_devices DROP CONSTRAINT IF EXISTS chk_devices_status;
ALTER TABLE tracking_devices DROP CONSTRAINT IF EXISTS chk_devices_battery_range;

-- Consultation Rooms
ALTER TABLE consultation_rooms DROP CONSTRAINT IF EXISTS chk_rooms_status;

-- Users
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_role;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_username_not_empty;

-- Patients
ALTER TABLE patients DROP CONSTRAINT IF EXISTS chk_patients_gender;
ALTER TABLE patients DROP CONSTRAINT IF EXISTS chk_patients_mobile_not_empty;
ALTER TABLE patients DROP CONSTRAINT IF EXISTS chk_patients_age_range;

-- Departments
ALTER TABLE departments DROP CONSTRAINT IF EXISTS chk_departments_prefix_format;
ALTER TABLE departments DROP CONSTRAINT IF EXISTS chk_departments_consult_time_positive;

-- Queue Logs
ALTER TABLE queue_logs DROP CONSTRAINT IF EXISTS chk_queue_logs_action;

-- WhatsApp Logs
ALTER TABLE whatsapp_logs DROP CONSTRAINT IF EXISTS chk_whatsapp_logs_type;
*/
