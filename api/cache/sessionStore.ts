/**
 * api/cache/sessionStore.ts
 *
 * Redis-backed JWT session store.
 *
 * Design
 * ──────
 * Each active session is stored as:
 *   iq:session:<sessionId>  → JSON { userId, username, role, … }   EX 7d
 *
 * A user's session set is stored as a Redis Set:
 *   iq:session:user:<userId>:sessions  → { sessionId, sessionId, … }   EX 7d
 *
 * This lets us:
 *   1. Verify a session in O(1) without a Supabase query on every request.
 *   2. List all active sessions for a user in O(1).
 *   3. Revoke a single session or all sessions atomically.
 *
 * Fallback behaviour (Redis unavailable)
 * ───────────────────────────────────────
 * All operations fall through to the Supabase auth repository so the
 * system remains fully functional without Redis.
 */

import { cacheManager } from '../utils/redisCache.js';
import { CacheKeys, RedisTTL } from './keys.js';
import { getRedisClient, isRedisAvailable } from '../config/redis.js';
import {
  insertSession,
  findSessionByToken,
  updateSessionActivity,
  endSession,
  getUserActiveSessions,
  revokeAllUserSessions,
} from '../repositories/authRepository.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CachedSession {
  id: string;
  userId: string;
  username: string;
  role: string;
  permissions: string[];
  deviceName: string;
  ipAddress: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Store a newly created session in Redis AND Supabase.
 */
export async function storeSession(
  sessionData: Parameters<typeof insertSession>[0],
  sessionPayload: Omit<CachedSession, 'id'>
): Promise<string> {
  // 1. Persist to Supabase (source of truth)
  const dbSession = await insertSession(sessionData);

  // 2. Cache in Redis for fast verification
  if (isRedisAvailable()) {
    const sessionId = sessionData.sessionToken;
    const full: CachedSession = { id: dbSession.id, ...sessionPayload };

    const redis = getRedisClient()!;
    const pipeline = redis.pipeline();

    // Session record
    pipeline.set(
      CacheKeys.session(sessionId),
      JSON.stringify(full),
      'EX',
      RedisTTL.SESSION
    );

    // Add sessionId to user's set
    pipeline.sadd(CacheKeys.userSessionSet(sessionPayload.userId), sessionId);
    pipeline.expire(CacheKeys.userSessionSet(sessionPayload.userId), RedisTTL.SESSION);

    await pipeline.exec();
  }

  return dbSession.id;
}

// ── Read / Verify ─────────────────────────────────────────────────────────────

/**
 * Verify a session ID and return the cached session data.
 *
 * 1. Try Redis first (O(1)).
 * 2. On miss: fall back to Supabase, re-hydrate Redis.
 * 3. If session is expired/inactive: return null.
 */
export async function getSession(sessionId: string): Promise<CachedSession | null> {
  const key = CacheKeys.session(sessionId);

  // ── Redis fast path ──────────────────────────────────────────────────────
  if (isRedisAvailable()) {
    const raw = await cacheManager.get<CachedSession>(key);
    if (raw !== null) {
      // Slide the TTL on access (keep active sessions alive)
      await cacheManager.expire(key, RedisTTL.SESSION);
      return raw;
    }
  }

  // ── Supabase fallback ────────────────────────────────────────────────────
  const dbSession = await findSessionByToken(sessionId);
  if (!dbSession || !dbSession.is_active) return null;

  if (new Date(dbSession.expires_at) < new Date()) {
    await endSession(dbSession.id);
    return null;
  }

  // Re-hydrate Redis
  const payload: CachedSession = {
    id:           dbSession.id,
    userId:       dbSession.user_id,
    username:     dbSession.username ?? '',
    role:         dbSession.role ?? 'receptionist',
    permissions:  dbSession.permissions ?? [],
    deviceName:   dbSession.device_name ?? '',
    ipAddress:    dbSession.ip_address ?? '',
    createdAt:    dbSession.created_at,
    lastActiveAt: dbSession.last_active_at,
    expiresAt:    dbSession.expires_at,
  };

  if (isRedisAvailable()) {
    await cacheManager.set(key, payload, RedisTTL.SESSION);
  }

  return payload;
}

// ── Activity ping ─────────────────────────────────────────────────────────────

/**
 * Update last-active timestamp.  Writes to Redis synchronously;
 * Supabase update is fire-and-forget (non-blocking).
 */
export async function touchSession(sessionId: string): Promise<void> {
  const key = CacheKeys.session(sessionId);
  const cached = await cacheManager.get<CachedSession>(key);

  if (cached) {
    cached.lastActiveAt = new Date().toISOString();
    await cacheManager.set(key, cached, RedisTTL.SESSION);
  }

  // Non-blocking Supabase write
  findSessionByToken(sessionId).then(dbSession => {
    if (dbSession) updateSessionActivity(dbSession.id);
  }).catch(() => { /* ignore */ });
}

// ── Revoke ────────────────────────────────────────────────────────────────────

/**
 * Revoke a single session — deletes from Redis and marks inactive in Supabase.
 */
export async function revokeSession(sessionId: string): Promise<void> {
  await cacheManager.del(CacheKeys.session(sessionId));

  const dbSession = await findSessionByToken(sessionId);
  if (dbSession) {
    await endSession(dbSession.id);
    // Remove from user's session set
    if (isRedisAvailable()) {
      const redis = getRedisClient()!;
      await redis.srem(CacheKeys.userSessionSet(dbSession.user_id), sessionId);
    }
  }
}

/**
 * Revoke all sessions for a user, optionally keeping the current one.
 */
export async function revokeAllUserSessionsCache(
  userId: string,
  exceptSessionId?: string
): Promise<number> {
  // 1. Get session IDs from Redis set
  if (isRedisAvailable()) {
    const redis = getRedisClient()!;
    const sessionIds = await redis.smembers(CacheKeys.userSessionSet(userId));

    const pipeline = redis.pipeline();
    for (const sid of sessionIds) {
      if (sid !== exceptSessionId) {
        pipeline.del(CacheKeys.session(sid));
      }
    }
    // Clear the set
    if (!exceptSessionId) {
      pipeline.del(CacheKeys.userSessionSet(userId));
    } else {
      for (const sid of sessionIds) {
        if (sid !== exceptSessionId) {
          pipeline.srem(CacheKeys.userSessionSet(userId), sid);
        }
      }
    }
    await pipeline.exec();
  }

  // 2. Supabase authoritative revoke
  const count = await revokeAllUserSessions(userId, exceptSessionId);
  return count ?? 0;
}

// ── List ──────────────────────────────────────────────────────────────────────

/**
 * List all active sessions for a user.
 * Returns Supabase records (authoritative) enriched by Redis timestamps.
 */
export async function listUserSessions(userId: string): Promise<any[]> {
  return getUserActiveSessions(userId);
}
