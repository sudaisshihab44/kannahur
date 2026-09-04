/**
 * api/config/redis.ts
 *
 * Redis connection singleton with graceful fallback.
 * Uses ioredis (named export) for ESM compatibility.
 */
import { Redis } from 'ioredis';

type RedisInstance = InstanceType<typeof Redis>;

let redisClient: RedisInstance | null = null;
let connectionAttempted = false;

export function getRedisClient(): RedisInstance | null {
  if (connectionAttempted) return redisClient;
  connectionAttempted = true;

  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn(
      '[Redis] REDIS_URL not set — running with in-memory fallback only. ' +
      'Set REDIS_URL in .env.local to enable Redis caching.'
    );
    return null;
  }

  try {
    const isTLS = url.startsWith('rediss://');

    redisClient = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 5) return null;
        return Math.min(times * 200, 10_000);
      },
      tls: isTLS ? {} : undefined,
      lazyConnect: false,
      enableOfflineQueue: true,
      commandTimeout: 5_000,
    });

    redisClient.on('ready', () => { console.log('[Redis] Connected ✓'); });
    redisClient.on('error', (err: Error) => {
      console.error('[Redis] Connection error:', err.message);
    });
    redisClient.on('reconnecting', () => { console.warn('[Redis] Reconnecting…'); });

    return redisClient;
  } catch (err: any) {
    console.error('[Redis] Failed to initialise client:', err.message);
    redisClient = null;
    return null;
  }
}

export function isRedisAvailable(): boolean {
  return redisClient?.status === 'ready';
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    connectionAttempted = false;
  }
}
