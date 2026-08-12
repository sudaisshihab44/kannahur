-- ============================================================
-- Migration 006: Add Authentication & Security Tables
-- ============================================================
-- Purpose: Add JWT tokens, sessions, audit logs, and device tracking
-- Impact: Enables secure authentication with refresh tokens
-- Risk: Low (adds new tables only, doesn't modify existing)
-- Estimated time: 2 minutes
-- ============================================================

-- ============================================================
-- 1. REFRESH TOKENS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_by TEXT,
  device_info JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active ON refresh_tokens(is_active) WHERE is_active = TRUE;

COMMENT ON TABLE refresh_tokens IS 'JWT refresh tokens for maintaining user sessions';

-- ============================================================
-- 2. USER SESSIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_id TEXT REFERENCES refresh_tokens(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  device_type TEXT,
  device_id TEXT,
  device_name TEXT,
  browser TEXT,
  os TEXT,
  location_city TEXT,
  location_country TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON user_sessions(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_sessions_device ON user_sessions(device_id) WHERE device_id IS NOT NULL;

COMMENT ON TABLE user_sessions IS 'Active user sessions with device tracking';

-- ============================================================
-- 3. AUTHENTICATION AUDIT LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS auth_audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  username TEXT,
  action TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  failure_reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  device_info JSONB DEFAULT '{}'::jsonb,
  portal TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_audit_user ON auth_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_audit_timestamp ON auth_audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_auth_audit_action ON auth_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_auth_audit_success ON auth_audit_log(success);

COMMENT ON TABLE auth_audit_log IS 'Comprehensive audit trail of all authentication events';

-- Valid actions for audit log
ALTER TABLE auth_audit_log
ADD CONSTRAINT chk_auth_audit_action
CHECK (action IN (
  'login_success',
  'login_failed',
  'logout',
  'token_refresh',
  'token_revoked',
  'session_expired',
  'password_changed',
  'account_locked',
  'account_unlocked'
));

-- ============================================================
-- 4. SECURITY EVENTS LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  description TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_timestamp ON security_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);

COMMENT ON TABLE security_events IS 'Security-related events (suspicious activity, brute force, etc)';

-- Valid event types
ALTER TABLE security_events
ADD CONSTRAINT chk_security_event_type
CHECK (event_type IN (
  'brute_force_attempt',
  'suspicious_login',
  'multiple_failed_logins',
  'concurrent_sessions',
  'token_theft_suspected',
  'unusual_location',
  'unusual_device'
));

-- Valid severity levels
ALTER TABLE security_events
ADD CONSTRAINT chk_security_severity
CHECK (severity IN ('low', 'medium', 'high', 'critical'));

-- ============================================================
-- 5. UPDATE USERS TABLE FOR PASSWORD HASHING
-- ============================================================

-- Add new columns for enhanced authentication
ALTER TABLE users
ADD COLUMN IF NOT EXISTS password_hash TEXT,
ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_login_ip TEXT,
ADD COLUMN IF NOT EXISTS require_password_change BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS two_factor_secret TEXT;

-- Index for locked accounts
CREATE INDEX IF NOT EXISTS idx_users_locked ON users(locked_until) WHERE locked_until IS NOT NULL;

COMMENT ON COLUMN users.password_hash IS 'Bcrypt hashed password (replaces plain password column)';
COMMENT ON COLUMN users.failed_login_attempts IS 'Counter for brute force protection';
COMMENT ON COLUMN users.locked_until IS 'Account locked until this timestamp';

-- ============================================================
-- 6. DEVICE FINGERPRINTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS device_fingerprints (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fingerprint_hash TEXT NOT NULL,
  device_name TEXT,
  device_type TEXT,
  browser TEXT,
  os TEXT,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  trusted BOOLEAN DEFAULT FALSE,
  UNIQUE(user_id, fingerprint_hash)
);

CREATE INDEX IF NOT EXISTS idx_device_fingerprints_user ON device_fingerprints(user_id);
CREATE INDEX IF NOT EXISTS idx_device_fingerprints_hash ON device_fingerprints(fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_device_fingerprints_trusted ON device_fingerprints(trusted) WHERE trusted = TRUE;

COMMENT ON TABLE device_fingerprints IS 'Known devices for detecting unusual access patterns';

-- ============================================================
-- 7. HELPER FUNCTIONS
-- ============================================================

-- Function to clean expired tokens
CREATE OR REPLACE FUNCTION clean_expired_refresh_tokens()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM refresh_tokens
  WHERE expires_at < NOW()
    AND is_active = FALSE;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Function to clean expired sessions
CREATE OR REPLACE FUNCTION clean_expired_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  UPDATE user_sessions
  SET is_active = FALSE,
      ended_at = NOW()
  WHERE expires_at < NOW()
    AND is_active = TRUE;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Function to get active sessions for a user
CREATE OR REPLACE FUNCTION get_user_active_sessions(p_user_id TEXT)
RETURNS TABLE (
  id TEXT,
  device_name TEXT,
  device_type TEXT,
  browser TEXT,
  os TEXT,
  ip_address TEXT,
  location_city TEXT,
  location_country TEXT,
  created_at TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ,
  is_current BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.device_name,
    s.device_type,
    s.browser,
    s.os,
    s.ip_address,
    s.location_city,
    s.location_country,
    s.created_at,
    s.last_active_at,
    (s.last_active_at > NOW() - INTERVAL '5 minutes') as is_current
  FROM user_sessions s
  WHERE s.user_id = p_user_id
    AND s.is_active = TRUE
    AND s.expires_at > NOW()
  ORDER BY s.last_active_at DESC;
END;
$$;

-- Function to revoke all user sessions
CREATE OR REPLACE FUNCTION revoke_all_user_sessions(p_user_id TEXT, p_except_session_id TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  revoked_count INTEGER;
BEGIN
  UPDATE user_sessions
  SET is_active = FALSE,
      ended_at = NOW()
  WHERE user_id = p_user_id
    AND is_active = TRUE
    AND (p_except_session_id IS NULL OR id != p_except_session_id);
  
  GET DIAGNOSTICS revoked_count = ROW_COUNT;
  
  UPDATE refresh_tokens
  SET is_active = FALSE,
      revoked_at = NOW()
  WHERE user_id = p_user_id
    AND is_active = TRUE
    AND (p_except_session_id IS NULL OR id NOT IN (
      SELECT refresh_token_id FROM user_sessions WHERE id = p_except_session_id
    ));
  
  RETURN revoked_count;
END;
$$;

-- ============================================================
-- 8. CLEANUP JOBS (Optional - can be scheduled via cron)
-- ============================================================

-- Cleanup expired tokens and sessions older than 30 days
CREATE OR REPLACE FUNCTION cleanup_old_auth_data()
RETURNS TABLE (
  expired_tokens_deleted INTEGER,
  expired_sessions_deleted INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  tokens_deleted INTEGER;
  sessions_deleted INTEGER;
BEGIN
  -- Clean tokens expired more than 30 days ago
  DELETE FROM refresh_tokens
  WHERE expires_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS tokens_deleted = ROW_COUNT;
  
  -- Clean sessions expired more than 30 days ago
  DELETE FROM user_sessions
  WHERE expires_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS sessions_deleted = ROW_COUNT;
  
  RETURN QUERY SELECT tokens_deleted, sessions_deleted;
END;
$$;

-- ============================================================
-- VERIFICATION
-- ============================================================

-- List all new tables
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN (
    'refresh_tokens',
    'user_sessions',
    'auth_audit_log',
    'security_events',
    'device_fingerprints'
  )
ORDER BY table_name;

-- List all new functions
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'clean_expired_refresh_tokens',
    'clean_expired_sessions',
    'get_user_active_sessions',
    'revoke_all_user_sessions',
    'cleanup_old_auth_data'
  )
ORDER BY routine_name;

-- ============================================================
-- ROLLBACK (if needed)
-- ============================================================

/*
DROP TABLE IF EXISTS device_fingerprints CASCADE;
DROP TABLE IF EXISTS security_events CASCADE;
DROP TABLE IF EXISTS auth_audit_log CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;

ALTER TABLE users 
  DROP COLUMN IF EXISTS password_hash,
  DROP COLUMN IF EXISTS password_changed_at,
  DROP COLUMN IF EXISTS failed_login_attempts,
  DROP COLUMN IF EXISTS locked_until,
  DROP COLUMN IF EXISTS last_login_at,
  DROP COLUMN IF EXISTS last_login_ip,
  DROP COLUMN IF EXISTS require_password_change,
  DROP COLUMN IF EXISTS two_factor_enabled,
  DROP COLUMN IF EXISTS two_factor_secret;

DROP FUNCTION IF EXISTS clean_expired_refresh_tokens();
DROP FUNCTION IF EXISTS clean_expired_sessions();
DROP FUNCTION IF EXISTS get_user_active_sessions(TEXT);
DROP FUNCTION IF EXISTS revoke_all_user_sessions(TEXT, TEXT);
DROP FUNCTION IF EXISTS cleanup_old_auth_data();
*/
