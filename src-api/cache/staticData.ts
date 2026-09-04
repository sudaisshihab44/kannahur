/**
 * api/cache/staticData.ts
 *
 * Cache layer for slow-changing reference data:
 *   - Departments
 *   - Doctors
 *   - Consultation Rooms
 *   - Users / Staff
 *
 * TTL: 5 minutes (STATIC).
 * Any admin CRUD operation on these entities calls the appropriate
 * invalidation function, so stale data never lasts more than the TTL
 * even if invalidation is missed.
 *
 * Each entity is cached separately so an update to one doctor does not
 * evict the entire departments list.
 */

import { cacheManager } from '../utils/redisCache.js';
import { CacheKeys, RedisTTL } from './keys.js';
import {
  findAllDepartments,
  findAllDoctors,
  findAllRooms,
  findAllUsers,
} from '../repositories/userRepository.js';
import { mapDept, mapDoctor, mapRoom, mapUser } from '../utils/mappers.js';

// ── Departments ───────────────────────────────────────────────────────────────

export async function getCachedDepartments(): Promise<any[]> {
  const key = CacheKeys.departments();
  const hit = await cacheManager.get<any[]>(key);
  if (hit !== null) return hit;

  const rows = await findAllDepartments();
  const mapped = rows.map(mapDept);
  await cacheManager.set(key, mapped, RedisTTL.STATIC);
  return mapped;
}

export async function invalidateDepartmentsCache(): Promise<void> {
  await cacheManager.del(CacheKeys.departments());
  // Also bust the composite API data payload
  await cacheManager.del(CacheKeys.apiDataFull());
}

// ── Doctors ───────────────────────────────────────────────────────────────────

export async function getCachedDoctors(): Promise<any[]> {
  const key = CacheKeys.doctors();
  const hit = await cacheManager.get<any[]>(key);
  if (hit !== null) return hit;

  const rows = await findAllDoctors();
  const mapped = rows.map(mapDoctor);
  await cacheManager.set(key, mapped, RedisTTL.STATIC);
  return mapped;
}

export async function invalidateDoctorsCache(): Promise<void> {
  await cacheManager.del(CacheKeys.doctors());
  await cacheManager.del(CacheKeys.apiDataFull());
  // Doctor changes affect the queue display
  await cacheManager.delPattern(CacheKeys.PREFIX.queue);
}

// ── Consultation Rooms ────────────────────────────────────────────────────────

export async function getCachedRooms(): Promise<any[]> {
  const key = CacheKeys.rooms();
  const hit = await cacheManager.get<any[]>(key);
  if (hit !== null) return hit;

  const rows = await findAllRooms();
  const mapped = rows.map(mapRoom);
  await cacheManager.set(key, mapped, RedisTTL.STATIC);
  return mapped;
}

export async function invalidateRoomsCache(): Promise<void> {
  await cacheManager.del(CacheKeys.rooms());
  await cacheManager.del(CacheKeys.apiDataFull());
}

// ── Users / Staff ─────────────────────────────────────────────────────────────

export async function getCachedUsers(): Promise<any[]> {
  const key = CacheKeys.users();
  const hit = await cacheManager.get<any[]>(key);
  if (hit !== null) return hit;

  const rows = await findAllUsers();
  const mapped = rows.map(mapUser);
  await cacheManager.set(key, mapped, RedisTTL.STATIC);
  return mapped;
}

export async function invalidateUsersCache(): Promise<void> {
  await cacheManager.del(CacheKeys.users());
  await cacheManager.del(CacheKeys.apiDataFull());
}

// ── Bulk invalidation ─────────────────────────────────────────────────────────

/** Wipe all static-data keys (called after any bulk admin import) */
export async function invalidateAllStaticCache(): Promise<void> {
  await cacheManager.delPattern(CacheKeys.PREFIX.static);
  await cacheManager.del(CacheKeys.apiDataFull());
}
