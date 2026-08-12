/**
 * api/cache/hospitalSettings.ts
 *
 * Cache layer for hospital settings, queue config, and announcements.
 *
 * Read path:
 *   1. Redis GET → hit: return JSON, set X-Cache: HIT
 *   2. Miss → query Supabase → write to Redis with TTL → return
 *
 * Write path (any admin mutation):
 *   1. Write through to Supabase
 *   2. Invalidate all settings keys (delPattern)
 *
 * TTLs:
 *   - Full settings:   60 s  (queue config changes occasionally)
 *   - Announcements:   30 s  (can change more rapidly)
 */

import { cacheManager } from '../utils/redisCache.js';
import { CacheKeys, RedisTTL } from './keys.js';
import { getSettings, updateSettings, getAnnouncements, saveAnnouncements } from '../repositories/settingsRepository.js';
import { mapSettings } from '../utils/mappers.js';

// ── Settings ──────────────────────────────────────────────────────────────────

/**
 * Get the full settings object, served from Redis when available.
 * Returns the mapped (camelCase) form used by the frontend.
 */
export async function getCachedSettings(): Promise<any | null> {
  const key = CacheKeys.settings();

  const hit = await cacheManager.get<any>(key);
  if (hit !== null) return hit;

  const raw = await getSettings();
  if (!raw) return null;

  const mapped = mapSettings(raw);
  await cacheManager.set(key, mapped, RedisTTL.SETTINGS);
  return mapped;
}

/**
 * Get only the config sub-document (queue config, wait times).
 */
export async function getCachedSettingsConfig(): Promise<any | null> {
  const key = CacheKeys.settingsConfig();

  const hit = await cacheManager.get<any>(key);
  if (hit !== null) return hit;

  const raw = await getSettings();
  if (!raw) return null;

  const config = raw.config ?? null;
  await cacheManager.set(key, config, RedisTTL.SETTINGS);
  return config;
}

/**
 * Get only the hospital_info sub-document.
 */
export async function getCachedHospitalInfo(): Promise<any | null> {
  const key = CacheKeys.hospitalInfo();

  const hit = await cacheManager.get<any>(key);
  if (hit !== null) return hit;

  const raw = await getSettings();
  if (!raw) return null;

  const info = raw.hospital_info ?? null;
  await cacheManager.set(key, info, RedisTTL.SETTINGS);
  return info;
}

/**
 * Partial-update settings and invalidate all settings cache keys.
 */
export async function updateCachedSettings(updates: Record<string, any>): Promise<void> {
  await updateSettings(updates);
  await invalidateSettingsCache();
}

// ── Announcements ─────────────────────────────────────────────────────────────

/**
 * Get announcements array, served from Redis when available.
 */
export async function getCachedAnnouncements(): Promise<any[]> {
  const key = CacheKeys.announcements();

  const hit = await cacheManager.get<any[]>(key);
  if (hit !== null) return hit;

  const anns = await getAnnouncements();
  await cacheManager.set(key, anns, RedisTTL.ANNOUNCEMENTS);
  return anns;
}

/**
 * Save announcements and invalidate cache.
 */
export async function saveCachedAnnouncements(announcements: any[]): Promise<void> {
  await saveAnnouncements(announcements);
  await cacheManager.del(CacheKeys.announcements());
}

// ── Invalidation ──────────────────────────────────────────────────────────────

/**
 * Wipe all settings-related keys.
 * Called after any admin settings mutation.
 */
export async function invalidateSettingsCache(): Promise<void> {
  await cacheManager.delPattern(CacheKeys.PREFIX.settings);
}
