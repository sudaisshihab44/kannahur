/**
 * src-api/config/jwtConfig.ts
 *
 * JWT and security configuration.
 *
 * All security-sensitive values are now read from environment variables so
 * they can be tuned per deployment without a code change.
 *
 * Environment variables (see .env.example for documentation):
 *
 *   JWT_ACCESS_SECRET        required
 *   JWT_REFRESH_SECRET       required
 *   JWT_ACCESS_EXPIRES       default "15m"
 *   JWT_REFRESH_EXPIRES      default "7d"
 *   COOKIE_DOMAIN            optional
 *   NODE_ENV                 default "development"
 *   MAX_FAILED_ATTEMPTS      default 5   (account lockout after N wrong passwords)
 *   LOCKOUT_DURATION_MINUTES default 15  (minutes the account stays locked)
 *   MAX_CONCURRENT_SESSIONS  default 3
 *   SESSION_TIMEOUT_HOURS    default 24
 *   BCRYPT_ROUNDS            default 12
 */

const MAX_FAILED_ATTEMPTS     = parseInt(process.env.MAX_FAILED_ATTEMPTS      ?? '5',  10);
const LOCKOUT_DURATION_MINUTES= parseInt(process.env.LOCKOUT_DURATION_MINUTES ?? '15', 10);
const MAX_CONCURRENT_SESSIONS = parseInt(process.env.MAX_CONCURRENT_SESSIONS  ?? '3',  10);
const SESSION_TIMEOUT_HOURS   = parseInt(process.env.SESSION_TIMEOUT_HOURS    ?? '24', 10);
const BCRYPT_ROUNDS           = parseInt(process.env.BCRYPT_ROUNDS            ?? '12', 10);

export const jwtConfig = {
  // ── Access token (short-lived) ──────────────────────────────────────────────
  accessToken: {
    secret:    process.env.JWT_ACCESS_SECRET  || 'inclusyq-access-secret-change-in-production',
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
  },

  // ── Refresh token (long-lived) ──────────────────────────────────────────────
  refreshToken: {
    secret:    process.env.JWT_REFRESH_SECRET  || 'inclusyq-refresh-secret-change-in-production',
    expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d',
  },

  // ── Cookie settings ─────────────────────────────────────────────────────────
  cookie: {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge:   7 * 24 * 60 * 60 * 1000,   // 7 days in ms (matches refresh token)
    path:     '/',
    domain:   process.env.COOKIE_DOMAIN,  // e.g. '.yourdomain.com'
  },

  // ── Security settings (all env-configurable) ────────────────────────────────
  security: {
    bcryptRounds:          BCRYPT_ROUNDS,
    maxFailedAttempts:     MAX_FAILED_ATTEMPTS,
    lockoutDuration:       LOCKOUT_DURATION_MINUTES * 60 * 1000, // → ms
    sessionTimeout:        SESSION_TIMEOUT_HOURS   * 60 * 60 * 1000, // → ms
    maxConcurrentSessions: MAX_CONCURRENT_SESSIONS,
  },
};

// ── JWT payload interface ─────────────────────────────────────────────────────

export interface JwtPayload {
  userId:       string;
  username:     string;
  role:         string;
  permissions?: string[];
  sessionId:    string;
  tokenType:    'access' | 'refresh';
  iat?:         number;
  exp?:         number;
}
