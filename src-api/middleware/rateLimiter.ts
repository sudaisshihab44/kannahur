/**
 * src-api/middleware/rateLimiter.ts
 *
 * Rate limiting middleware — in-memory store for serverless compatibility.
 *
 * ── Design decisions ──────────────────────────────────────────────────────────
 *
 * LOGIN rate limiter  (authRateLimiter)
 *   Key:     username:IP  — account-scoped, not IP-only
 *   Why:     Hospital networks share a single public IP.  IP-only limiting
 *            would lock every receptionist the moment one person mistyped.
 *            Keying on username means only the targeted account is throttled.
 *   Limit:   AUTH_MAX_ATTEMPTS  (default 10) per AUTH_WINDOW_SECONDS (900 s)
 *   Reset:   Successful login clears the counter immediately via
 *            resetAuthLimiter(username, ip) called from the login controller.
 *
 * TOKEN REFRESH rate limiter  (refreshRateLimiter)
 *   Key:     IP only — username is not available without decoding the token
 *   Limit:   REFRESH_MAX_ATTEMPTS (default 30) per REFRESH_WINDOW_SECONDS (900 s)
 *   Why:     Higher limit: refresh fires on every page load and every 14 min.
 *            A hospital with 10 staff, each refreshing on load = 10 requests.
 *            30 per 15 min comfortably handles this while blocking bots.
 *
 * API rate limiters  (apiRateLimiter / sensitiveRateLimiter / publicRateLimiter)
 *   Key:     IP only (unchanged) — already on large-quota buckets.
 *
 * ── Environment variables ─────────────────────────────────────────────────────
 *
 *   AUTH_MAX_ATTEMPTS       number  default 10
 *   AUTH_WINDOW_SECONDS     number  default 900  (15 min)
 *   AUTH_LOCKOUT_SECONDS    number  default 900  (15 min) — Retry-After header
 *   REFRESH_MAX_ATTEMPTS    number  default 30
 *   REFRESH_WINDOW_SECONDS  number  default 900  (15 min)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── Config (env-driven) ───────────────────────────────────────────────────────

const AUTH_MAX_ATTEMPTS      = parseInt(process.env.AUTH_MAX_ATTEMPTS      ?? '10',  10);
const AUTH_WINDOW_MS         = parseInt(process.env.AUTH_WINDOW_SECONDS    ?? '900', 10) * 1000;
const AUTH_LOCKOUT_SECS      = parseInt(process.env.AUTH_LOCKOUT_SECONDS   ?? '900', 10);
const REFRESH_MAX_ATTEMPTS   = parseInt(process.env.REFRESH_MAX_ATTEMPTS   ?? '30',  10);
const REFRESH_WINDOW_MS      = parseInt(process.env.REFRESH_WINDOW_SECONDS ?? '900', 10) * 1000;

// ── In-memory store ───────────────────────────────────────────────────────────

interface RateLimitEntry {
  count:     number;
  resetTime: number;
}

const rateLimitStore: Record<string, RateLimitEntry> = {};

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(rateLimitStore)) {
    if (rateLimitStore[key].resetTime < now) {
      delete rateLimitStore[key];
    }
  }
}, 5 * 60 * 1000);

// ── IP extraction ─────────────────────────────────────────────────────────────

/**
 * Extract the best-available client IP.
 *
 * On Vercel, x-forwarded-for is populated by the edge and contains the
 * real client IP as the first value.  We take only the first entry to
 * avoid spoofing via client-controlled header values.
 */
function getClientIp(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) {
    // x-forwarded-for: client, proxy1, proxy2 — take only the first
    const first = (Array.isArray(fwd) ? fwd[0] : fwd).split(',')[0].trim();
    if (first) return first;
  }
  return (req.headers['x-real-ip'] as string) || req.socket?.remoteAddress || 'unknown';
}

// ── Generic rate limiter factory ──────────────────────────────────────────────

export function createRateLimiter(
  maxRequests: number,
  windowMs: number,
  message:     string = 'Too many requests, please try again later.',
  keyFn:       (req: VercelRequest) => string = getClientIp,
) {
  return async (req: VercelRequest, res: VercelResponse): Promise<boolean> => {
    const key = keyFn(req);
    const now = Date.now();

    // Initialise or reset expired window
    if (!rateLimitStore[key] || rateLimitStore[key].resetTime < now) {
      rateLimitStore[key] = { count: 0, resetTime: now + windowMs };
    }

    const entry = rateLimitStore[key];
    entry.count++;

    res.setHeader('X-RateLimit-Limit',     maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - entry.count).toString());
    res.setHeader('X-RateLimit-Reset',     new Date(entry.resetTime).toISOString());

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter.toString());
      res.status(429).json({ success: false, message, retryAfter });
      return false;
    }
    return true;
  };
}

// ── Auth rate limiter  (username:IP key) ──────────────────────────────────────
//
// Keyed on   username:ip   — not IP alone.
// Result:    One hospital IP = independent buckets per staff account.
//            Brute-forcing "admin" from the hospital network does not
//            block "reception" or any other account.

function loginKey(req: VercelRequest): string {
  const ip       = getClientIp(req);
  const username = (req.body?.username ?? 'unknown').toString().toLowerCase().trim();
  return `login:${username}:${ip}`;
}

export const authRateLimiter = createRateLimiter(
  AUTH_MAX_ATTEMPTS,
  AUTH_WINDOW_MS,
  `Too many authentication attempts. Please try again in ${Math.ceil(AUTH_LOCKOUT_SECS / 60)} minutes.`,
  loginKey,
);

/**
 * Reset the login rate-limit counter for a given username+IP after a
 * successful authentication.  Called by the login controller.
 *
 * This prevents a user who mistyped their password several times (but
 * eventually succeeded) from being locked out on the next page load.
 */
export function resetAuthLimiter(username: string, ipAddress: string): void {
  const key = `login:${username.toLowerCase().trim()}:${ipAddress}`;
  delete rateLimitStore[key];
}

// ── Token-refresh rate limiter  (IP key, higher quota) ───────────────────────
//
// Separate from authRateLimiter so that automatic background refreshes
// (every 14 min, plus on page load) never eat into the login budget.

export const refreshRateLimiter = createRateLimiter(
  REFRESH_MAX_ATTEMPTS,
  REFRESH_WINDOW_MS,
  'Too many token refresh requests. Please try again later.',
  getClientIp,   // IP only — username not reliably available without decoding
);

// ── API rate limiter  (100 req / 15 min per IP) ───────────────────────────────

export const apiRateLimiter = createRateLimiter(
  100,
  15 * 60 * 1000,
  'Too many requests from this IP. Please try again later.',
);

// ── Sensitive operations  (10 req / 15 min per IP) ────────────────────────────

export const sensitiveRateLimiter = createRateLimiter(
  10,
  15 * 60 * 1000,
  'Too many requests for sensitive operations. Please try again later.',
);

// ── Public endpoints  (200 req / 15 min per IP) ───────────────────────────────

export const publicRateLimiter = createRateLimiter(
  200,
  15 * 60 * 1000,
  'Request limit exceeded. Please try again later.',
);
