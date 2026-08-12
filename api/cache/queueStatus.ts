/**
 * api/cache/queueStatus.ts
 *
 * Cache layer for live queue state and the daily token counter.
 *
 * Queue state  (TTL: 5 s)
 * ──────────────────────
 *   getCachedWaitingQueue(deptId?, doctorId?)
 *   getCachedTodayTokens()
 *   invalidateQueueCache()
 *
 * Atomic token counter  (TTL: until midnight)
 * ───────────────────────────────────────────
 *   getNextTokenNumber(deptId, prefix) → "OPD-007"
 *
 * The token counter uses Redis INCR which is truly atomic — two
 * simultaneous token registrations for the same department can never
 * receive the same sequential number.  The counter key auto-expires at
 * midnight (86 400 s TTL on first increment) so the daily sequence
 * resets cleanly without a cron job.
 *
 * When Redis is unavailable the fallback path queries the tokens table
 * directly (same as before), so token numbering remains correct even
 * during a Redis outage.
 */

import { cacheManager } from '../utils/redisCache.js';
import { CacheKeys, RedisTTL } from './keys.js';
import { computeWaitingQueue } from '../services/queueService.js';
import { findTodayTokens, countTodayTokensForDept } from '../repositories/tokenRepository.js';
import { mapToken } from '../utils/mappers.js';
import { isRedisAvailable } from '../config/redis.js';

// ── Waiting queue ─────────────────────────────────────────────────────────────

/**
 * Get the waiting queue, served from Redis when available.
 * The waiting queue changes on every token action so TTL is kept to 5 s.
 */
export async function getCachedWaitingQueue(
  deptId?: string,
  doctorId?: string
): Promise<any[]> {
  const key = CacheKeys.waitingQueue(deptId, doctorId);
  const hit = await cacheManager.get<any[]>(key);
  if (hit !== null) return hit;

  const queue = await computeWaitingQueue(deptId, doctorId);
  await cacheManager.set(key, queue, RedisTTL.QUEUE);
  return queue;
}

// ── Today's tokens snapshot ───────────────────────────────────────────────────

/**
 * Get today's tokens, served from Redis when available.
 * Used for the full /api/data payload.
 */
export async function getCachedTodayTokens(): Promise<any[]> {
  const key = CacheKeys.todayTokens();
  const hit = await cacheManager.get<any[]>(key);
  if (hit !== null) return hit;

  const rows = await findTodayTokens();
  const mapped = rows.map(mapToken);
  await cacheManager.set(key, mapped, RedisTTL.QUEUE);
  return mapped;
}

// ── Atomic daily token counter ────────────────────────────────────────────────

/**
 * Get the next sequential token number for a department on today's date.
 *
 * Uses Redis INCR for atomicity when Redis is available.
 * Falls back to a Supabase COUNT query when Redis is unavailable.
 *
 * @param deptId    Department UUID
 * @param prefix    Token prefix, e.g. "OPD", "ENT"
 * @returns         Formatted token string, e.g. "OPD-007"
 */
export async function getNextTokenNumber(
  deptId: string,
  prefix: string
): Promise<string> {
  const dateStr = new Date().toISOString().split('T')[0]; // "2026-07-27"
  const counterKey = CacheKeys.tokenCounter(deptId, dateStr);

  let sequence: number;

  if (isRedisAvailable()) {
    // Redis INCR is atomic — safe under concurrent requests
    sequence = await cacheManager.incr(counterKey, RedisTTL.TOKEN_COUNTER);
  } else {
    // Fallback: count existing tokens from Supabase
    const todayStr = `${dateStr}T00:00:00.000Z`;
    const count = await countTodayTokensForDept(deptId, todayStr);
    sequence = count + 1;
  }

  return `${prefix}-${String(sequence).padStart(3, '0')}`;
}

/**
 * Seed the Redis counter from the actual Supabase count.
 * Useful when Redis is restarted mid-day and the counter is lost.
 * Called lazily on first token creation if the counter key is missing.
 */
export async function seedTokenCounter(deptId: string): Promise<void> {
  if (!isRedisAvailable()) return;

  const dateStr = new Date().toISOString().split('T')[0];
  const counterKey = CacheKeys.tokenCounter(deptId, dateStr);

  // Only seed if the key does not exist
  const existing = await cacheManager.get<number>(counterKey);
  if (existing !== null) return;

  const todayStr = `${dateStr}T00:00:00.000Z`;
  const count = await countTodayTokensForDept(deptId, todayStr);

  if (count > 0) {
    // SET only if not exists (NX), so we don't race with a concurrent INCR
    const redis = (await import('../config/redis.js')).getRedisClient();
    if (redis) {
      await redis.set(counterKey, String(count), 'EX', RedisTTL.TOKEN_COUNTER, 'NX');
    }
  }
}

// ── Cache invalidation ────────────────────────────────────────────────────────

/**
 * Invalidate all queue-related keys.
 * Called after any token state change (create, call, complete, skip, cancel).
 */
export async function invalidateQueueCache(): Promise<void> {
  await cacheManager.delPattern(CacheKeys.PREFIX.queue);
}

/**
 * Invalidate queue keys for a specific department only.
 */
export async function invalidateDeptQueueCache(deptId: string): Promise<void> {
  await cacheManager.delPattern(`iq:queue:waiting:${deptId}`);
  await cacheManager.del(CacheKeys.todayTokens());
  await cacheManager.del(CacheKeys.apiDataFull());
}
