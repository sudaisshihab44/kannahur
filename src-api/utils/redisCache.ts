/**
 * api/utils/redisCache.ts
 *
 * Unified CacheManager
 * ─────────────────────
 * Single interface used by every cache layer.
 * Transparently delegates to Redis when available; falls back to the
 * in-process InMemoryCache (api/utils/cache.ts) when Redis is absent
 * or returns an error.
 *
 * Public API
 * ──────────
 *   get<T>(key)                → T | null
 *   set(key, value, ttlSec)    → void
 *   del(key)                   → void
 *   delPattern(prefix)         → void   (Redis SCAN + DEL; in-mem prefix scan)
 *   incr(key, ttlSec?)         → number (atomic Redis INCR; in-mem fallback)
 *   expire(key, ttlSec)        → void
 *   mget<T>(keys)              → (T|null)[]
 *   mset(entries, ttlSec)      → void
 *   etag(key)                  → string | null
 *   setWithEtag(key, v, ttlSec)→ string  (returns etag)
 *   invalidate(key)            → void   (alias for del)
 *   invalidatePattern(prefix)  → void   (alias for delPattern)
 *   flush()                    → void   (wipe all — use with care)
 */

import { getRedisClient } from '../config/redis.js';
import { cache as memCache, TTL } from './cache.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function serialize(value: unknown): string {
  return JSON.stringify(value);
}

function deserialize<T>(raw: string | null): T | null {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Generate a short ETag from a stable hash of the serialised value */
function makeEtag(value: unknown): string {
  const str = serialize(value);
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) >>> 0;
  }
  return `"${h.toString(36)}-${str.length}"`;
}

// ── CacheManager class ────────────────────────────────────────────────────────

class CacheManager {
  // ── READ ────────────────────────────────────────────────────────────────────

  async get<T>(key: string): Promise<T | null> {
    const redis = getRedisClient();
    if (redis) {
      try {
        return deserialize<T>(await redis.get(key));
      } catch (e: any) {
        console.warn(`[CacheManager] Redis get("${key}") failed:`, e.message);
      }
    }
    // Fallback
    return memCache.get<T>(key)?.value ?? null;
  }

  // ── WRITE ───────────────────────────────────────────────────────────────────

  async set(key: string, value: unknown, ttlSec: number): Promise<void> {
    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.set(key, serialize(value), 'EX', ttlSec);
        return;
      } catch (e: any) {
        console.warn(`[CacheManager] Redis set("${key}") failed:`, e.message);
      }
    }
    memCache.set(key, value, ttlSec * 1_000);
  }

  // ── DELETE ──────────────────────────────────────────────────────────────────

  async del(key: string): Promise<void> {
    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.del(key);
        return;
      } catch (e: any) {
        console.warn(`[CacheManager] Redis del("${key}") failed:`, e.message);
      }
    }
    memCache.invalidate(key);
  }

  /** Delete all keys that start with `prefix` */
  async delPattern(prefix: string): Promise<void> {
    const redis = getRedisClient();
    if (redis) {
      try {
        const pattern = prefix.endsWith('*') ? prefix : `${prefix}*`;
        let cursor = '0';
        do {
          const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
          cursor = next;
          if (keys.length) await redis.del(...keys);
        } while (cursor !== '0');
        return;
      } catch (e: any) {
        console.warn(`[CacheManager] Redis delPattern("${prefix}") failed:`, e.message);
      }
    }
    memCache.invalidatePattern(prefix);
  }

  // ── ATOMIC COUNTER ──────────────────────────────────────────────────────────

  /** Atomically increment and optionally set TTL on first increment */
  async incr(key: string, ttlSec?: number): Promise<number> {
    const redis = getRedisClient();
    if (redis) {
      try {
        const val = await redis.incr(key);
        if (ttlSec && val === 1) {
          // First increment — set the TTL
          await redis.expire(key, ttlSec);
        }
        return val;
      } catch (e: any) {
        console.warn(`[CacheManager] Redis incr("${key}") failed:`, e.message);
      }
    }
    // In-memory fallback — not truly atomic but acceptable without Redis
    const current = (memCache.get<number>(key)?.value ?? 0) + 1;
    memCache.set(key, current, (ttlSec ?? 86400) * 1_000);
    return current;
  }

  async expire(key: string, ttlSec: number): Promise<void> {
    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.expire(key, ttlSec);
      } catch { /* non-critical */ }
    }
  }

  // ── BATCH READ ──────────────────────────────────────────────────────────────

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (!keys.length) return [];
    const redis = getRedisClient();
    if (redis) {
      try {
        const raws = await redis.mget(...keys);
        return raws.map(r => deserialize<T>(r));
      } catch (e: any) {
        console.warn('[CacheManager] Redis mget failed:', e.message);
      }
    }
    return keys.map(k => memCache.get<T>(k)?.value ?? null);
  }

  // ── BATCH WRITE ─────────────────────────────────────────────────────────────

  async mset(entries: { key: string; value: unknown }[], ttlSec: number): Promise<void> {
    const redis = getRedisClient();
    if (redis) {
      try {
        const pipeline = redis.pipeline();
        for (const { key, value } of entries) {
          pipeline.set(key, serialize(value), 'EX', ttlSec);
        }
        await pipeline.exec();
        return;
      } catch (e: any) {
        console.warn('[CacheManager] Redis mset failed:', e.message);
      }
    }
    for (const { key, value } of entries) {
      memCache.set(key, value, ttlSec * 1_000);
    }
  }

  // ── ETAG HELPERS ────────────────────────────────────────────────────────────

  /** Return the stored ETag for a key, or null if cache miss */
  async etag(key: string): Promise<string | null> {
    const raw = await this.get<{ _etag: string; _data: unknown }>(key);
    return raw?._etag ?? null;
  }

  /** Store value with an embedded ETag; return the ETag */
  async setWithEtag(key: string, value: unknown, ttlSec: number): Promise<string> {
    const etag = makeEtag(value);
    await this.set(key, { _etag: etag, _data: value }, ttlSec);
    return etag;
  }

  /** Read value + ETag together */
  async getWithEtag<T>(key: string): Promise<{ value: T; etag: string } | null> {
    const raw = await this.get<{ _etag: string; _data: T }>(key);
    if (!raw) return null;
    return { value: raw._data, etag: raw._etag };
  }

  // ── CONVENIENCE ALIASES ─────────────────────────────────────────────────────

  invalidate = this.del.bind(this);
  invalidatePattern = this.delPattern.bind(this);

  async flush(): Promise<void> {
    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.flushdb();
        return;
      } catch { /* ignore */ }
    }
    memCache.clear();
  }
}

/** Application-wide singleton */
export const cacheManager = new CacheManager();

/** Re-export TTL constants for convenience in cache layer modules */
export { TTL };
