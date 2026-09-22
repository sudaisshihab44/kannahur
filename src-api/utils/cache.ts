/**
 * api/utils/cache.ts
 *
 * Lightweight in-process cache for serverless functions.
 *
 * Because each Vercel serverless invocation may share a Node.js
 * process for a short time (warm lambda), a simple in-memory Map
 * provides meaningful cache hits during rapid sequential polls
 * (e.g. the 5-second frontend interval) without any external
 * infrastructure.
 *
 * Entries expire after `ttlMs` and the cache is bounded to
 * MAX_ENTRIES items (LRU-style eviction) to prevent unbounded growth.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  etag: string;
}

const MAX_ENTRIES = 50;

class InMemoryCache {
  private store = new Map<string, CacheEntry<any>>();

  set<T>(key: string, value: T, ttlMs: number): string {
    // Evict oldest entries when at capacity
    if (this.store.size >= MAX_ENTRIES) {
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }

    // ponytail: randomUUID etag is unique per write; no Math.random IDs.
    const etag = `"${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}"`;
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs, etag });
    return etag;
  }

  get<T>(key: string): { value: T; etag: string } | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return { value: entry.value as T, etag: entry.etag };
  }

  /** Return just the ETag without touching expiry (for If-None-Match checks) */
  etag(key: string): string | null {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.expiresAt) return null;
    return entry.etag;
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  invalidatePattern(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
  }
}

/** Singleton shared across all handlers in the same warm lambda */
export const cache = new InMemoryCache();

/** Cache TTLs (ms) */
export const TTL = {
  DATA:     5_000,   // /api/data — 5 s (matches poll interval)
  QUEUE:    3_000,   // /api/queue — 3 s (changes on every token action)
  SETTINGS: 30_000,  // settings row — changes infrequently
  STATIC:   60_000,  // departments, rooms — rarely change
} as const;
