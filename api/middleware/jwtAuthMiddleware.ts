/**
 * api/middleware/jwtAuthMiddleware.ts
 *
 * JWT-based authentication middleware with role-based access control.
 * BACKWARD COMPATIBLE: Also supports x-operator-username header for legacy clients.
 *
 * Performance optimisation (Task 5):
 *   The legacy x-operator-username path previously hit the DB on EVERY request.
 *   ReceptionDashboard.tsx uses this path exclusively, so every token create,
 *   call, complete, skip, and cancel paid a SELECT * on users with an ILIKE scan.
 *
 *   Fix: cache the resolved user row in Redis (TTL = 60 s).
 *   Key: iq:auth:user-legacy:<lowercase-username>
 *
 *   Security properties preserved:
 *     - Cache entries expire in 60 s, so role/permission/deactivation changes
 *       propagate within 1 minute.
 *     - Deactivated accounts are re-verified from cache; if is_active = false
 *       the request is rejected immediately from cache without a DB trip.
 *     - Cache is invalidated by the admin user-update controller (Task 5b below).
 *     - JWT path is unchanged — it uses the Redis session store already.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySession } from '../services/enhancedAuthService.js';
import { findUserByUsername } from '../repositories/userRepository.js';
import { extractBearerToken } from '../utils/jwtUtils.js';
import { mapUser } from '../utils/mappers.js';
import { cacheManager } from '../utils/redisCache.js';

// Cache TTL for legacy user lookups.  Short enough that permission / deactivation
// changes propagate quickly; long enough to cover a burst of rapid requests
// (e.g. a receptionist creates 5 tokens in 30 s → 4 of those are cache hits).
const LEGACY_USER_CACHE_TTL_SECS = 60;

function legacyUserCacheKey(username: string): string {
  return `iq:auth:user-legacy:${username.toLowerCase()}`;
}

// ── Exported helper so adminController can bust the cache on user update ──────
export async function invalidateLegacyUserCache(username: string): Promise<void> {
  await cacheManager.del(legacyUserCacheKey(username));
}

// ── Internal: cached user lookup for legacy path ──────────────────────────────
async function findUserCached(username: string): Promise<any | null> {
  const key = legacyUserCacheKey(username);

  // 1. Try Redis first
  const cached = await cacheManager.get<any>(key);
  if (cached !== null) return cached;

  // 2. Miss → DB query (the expensive SELECT * users WHERE lower(username) ILIKE ...)
  const userRow = await findUserByUsername(username);
  if (!userRow) return null;

  // 3. Store in Redis (store raw row, not mapped, so we can re-map after retrieval)
  await cacheManager.set(key, userRow, LEGACY_USER_CACHE_TTL_SECS);
  return userRow;
}

// ── requireJwtAuth ────────────────────────────────────────────────────────────

export async function requireJwtAuth(req: VercelRequest, res: VercelResponse): Promise<boolean> {
  // ── JWT path (Bearer token) ───────────────────────────────────────────────
  const authHeader   = req.headers.authorization as string;
  const accessToken  = extractBearerToken(authHeader);

  if (accessToken) {
    const result = await verifySession(accessToken);

    if (!result.valid) {
      res.status(401).json({
        success: false,
        message: result.message || 'Authentication required',
      });
      return false;
    }

    (req as any).user          = result.user;
    (req as any).authenticated = true;
    (req as any).authMethod    = 'jwt';
    return true;
  }

  // ── Legacy path (x-operator-username header) — now Redis-cached ───────────
  const operatorUsername = (req.headers['x-operator-username'] as string)?.trim();

  if (operatorUsername) {
    const userRow = await findUserCached(operatorUsername);  // ← Redis first, DB on miss

    if (!userRow) {
      res.status(401).json({
        success: false,
        message: 'Invalid authentication credentials',
      });
      return false;
    }

    const user = mapUser(userRow);

    if (user.isActive === false) {
      // Invalidate cache immediately for deactivated accounts
      await cacheManager.del(legacyUserCacheKey(operatorUsername));
      res.status(403).json({
        success: false,
        message: 'Your account has been deactivated',
      });
      return false;
    }

    (req as any).user          = user;
    (req as any).authenticated = true;
    (req as any).authMethod    = 'legacy';
    return true;
  }

  // ── No authentication provided ────────────────────────────────────────────
  res.status(401).json({
    success: false,
    message: 'Authentication required. Provide Bearer token or x-operator-username header.',
  });
  return false;
}

// ── requireJwtAdmin ───────────────────────────────────────────────────────────

export async function requireJwtAdmin(req: VercelRequest, res: VercelResponse): Promise<boolean> {
  if (!(req as any).authenticated) {
    if (!(await requireJwtAuth(req, res))) return false;
  }

  const user = (req as any).user;
  if (!user || user.role !== 'admin') {
    res.status(403).json({ success: false, message: 'Administrator access required' });
    return false;
  }
  return true;
}

// ── requirePermission ─────────────────────────────────────────────────────────

export async function requirePermission(
  req: VercelRequest,
  res: VercelResponse,
  permission: string
): Promise<boolean> {
  if (!(req as any).authenticated) {
    if (!(await requireJwtAuth(req, res))) return false;
  }

  const user = (req as any).user;
  if (user.role === 'admin') return true;

  if (!user.permissions?.includes(permission)) {
    res.status(403).json({
      success: false,
      message: `Permission denied. Required: ${permission}`,
    });
    return false;
  }
  return true;
}

// ── optionalJwtAuth ───────────────────────────────────────────────────────────

export async function optionalJwtAuth(req: VercelRequest, res: VercelResponse): Promise<void> {
  const authHeader  = req.headers.authorization as string;
  const accessToken = extractBearerToken(authHeader);

  if (accessToken) {
    const result = await verifySession(accessToken);
    if (result.valid) {
      (req as any).user          = result.user;
      (req as any).authenticated = true;
      (req as any).authMethod    = 'jwt';
    }
    return;
  }

  const operatorUsername = (req.headers['x-operator-username'] as string)?.trim();
  if (operatorUsername) {
    const userRow = await findUserCached(operatorUsername);
    if (userRow) {
      const user = mapUser(userRow);
      if (user.isActive !== false) {
        (req as any).user          = user;
        (req as any).authenticated = true;
        (req as any).authMethod    = 'legacy';
      }
    }
  }
}
