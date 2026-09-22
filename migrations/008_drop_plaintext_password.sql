-- ============================================================
-- Migration 008: Remove plaintext password column
-- ============================================================
-- Purpose: Drop users.password (plaintext) after the bcrypt migration.
--   Migration 006 added users.password_hash; the login path auto-upgrades
--   legacy rows to password_hash on next successful login, and the server
--   bootstrap now writes password_hash only (bcrypt, 12 rounds).
-- Impact: Plaintext credentials can no longer be stored or read back.
-- Risk: Low, but run once users.password_hash is populated for active
--   accounts. Any row still lacking password_hash must be reset via the
--   password-change flow before this migration.
-- Estimated time: < 1 minute
-- ============================================================

-- Safety: only drop when the bcrypt column exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'password_hash'
  ) THEN
    ALTER TABLE users DROP COLUMN IF EXISTS password;
  ELSE
    RAISE EXCEPTION 'Migration 008 aborted: users.password_hash is missing (run migration 006 first).';
  END IF;
END
$$;

-- ============================================================
-- ROLLBACK (not recommended — restores the vulnerable column)
-- ============================================================
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT;
