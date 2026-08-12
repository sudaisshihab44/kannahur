/**
 * api/controllers/dataController.ts
 *
 * GET /api/data — returns full app state.
 *
 * Cache strategy:
 *   1. Redis GET with ETag (iq:api:data:full)  → 304 / 200 with X-Cache: HIT
 *   2. In-memory fallback (same key via CacheManager)
 *   3. Supabase (cache miss) → write to Redis + in-memory → return
 *
 * Each sub-dataset is sourced from its own domain cache layer so that
 * targeted invalidations (e.g. a doctor update) bust only the relevant
 * entry rather than the entire composite payload.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cacheManager } from '../utils/redisCache.js';
import { CacheKeys, RedisTTL } from '../cache/keys.js';
import { getCachedDepartments } from '../cache/staticData.js';
import { getCachedDoctors } from '../cache/staticData.js';
import { getCachedRooms } from '../cache/staticData.js';
import { getCachedUsers } from '../cache/staticData.js';
import { getCachedSettings } from '../cache/hospitalSettings.js';
import { getCachedTodayTokens } from '../cache/queueStatus.js';
import { findRecentPatients } from '../repositories/tokenRepository.js';
import { tryFindAllDevices } from '../repositories/deviceRepository.js';
import { findQueueLogs, findNotificationLogs } from '../repositories/settingsRepository.js';
import { mapPatient, mapDevice, mapQueueLog } from '../utils/mappers.js';

const CACHE_KEY = CacheKeys.apiDataFull();

export async function getDataHandler(req: VercelRequest, res: VercelResponse) {
  try {
    // ── ETag fast path ────────────────────────────────────────────────────────
    const cached = await cacheManager.getWithEtag<object>(CACHE_KEY);
    if (cached) {
      const clientEtag = req.headers['if-none-match'];
      if (clientEtag && clientEtag === cached.etag) {
        res.setHeader('ETag', cached.etag);
        res.setHeader('Cache-Control', 'private, no-cache');
        return res.status(304).end();
      }
      res.setHeader('ETag', cached.etag);
      res.setHeader('Cache-Control', `private, max-age=${RedisTTL.API_DATA}`);
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cached.value);
    }

    // ── Cache miss — assemble from domain caches ───────────────────────────
    // Domain caches each have their own TTLs and are invalidated independently.
    // Non-cached data (logs, patients) is fetched directly.
    const [
      departments,
      doctors,
      rooms,
      users,
      settings,
      tokens,
      patientsRaw,
      logsRaw,
      waLogsRaw,
      devicesRaw,
    ] = await Promise.all([
      getCachedDepartments(),
      getCachedDoctors(),
      getCachedRooms(),
      getCachedUsers(),
      getCachedSettings(),
      getCachedTodayTokens(),
      findRecentPatients(30),
      findQueueLogs(200),
      findNotificationLogs(100),
      tryFindAllDevices(),
    ]);

    const payload = {
      departments,
      doctors,
      users,
      patients:           patientsRaw.map(mapPatient),
      tokens,
      consultation_rooms: rooms,
      queue_logs:         logsRaw.map(mapQueueLog),
      whatsapp_logs:      waLogsRaw,
      devices:            devicesRaw.map(mapDevice),
      settings,
    };

    // Store composite payload with ETag
    const etag = await cacheManager.setWithEtag(CACHE_KEY, payload, RedisTTL.API_DATA);

    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', `private, max-age=${RedisTTL.API_DATA}`);
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(payload);

  } catch (err: any) {
    console.error('[dataController]', err);
    return res.status(500).json({ success: false, message: 'Database error' });
  }
}

/**
 * Invalidate the composite /api/data key.
 * Called after any write that changes the data snapshot.
 */
export async function invalidateDataCache(): Promise<void> {
  await cacheManager.del(CACHE_KEY);
}
