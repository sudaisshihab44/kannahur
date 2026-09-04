/**
 * api/controllers/adminController.ts
 *
 * HTTP handlers for all admin CRUD endpoints.
 * Delegates to adminService, then invalidates the appropriate Redis cache.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  createDoctor, modifyDoctor, removeDoctor, toggleDoctorStatus,
  createDepartment, modifyDepartment, removeDepartment,
  createRoom, modifyRoom, removeRoom,
  createStaff, modifyStaff, removeStaff,
  updateQueueConfig, updateHospitalInfo,
} from '../services/adminService.js';
import {
  invalidateDoctorsCache,
  invalidateDepartmentsCache,
  invalidateRoomsCache,
  invalidateUsersCache,
} from '../cache/staticData.js';
import { invalidateSettingsCache } from '../cache/hospitalSettings.js';
import { invalidateDataCache } from './dataController.js';
import { invalidateDashboardCache } from '../cache/dashboardCache.js';
import { invalidateLegacyUserCache } from '../middleware/jwtAuthMiddleware.js';

// ── Doctors ───────────────────────────────────────────────────────────────────

export async function createDoctorHandler(req: VercelRequest, res: VercelResponse) {
  const result = await createDoctor(req.body);
  if (result.success) await invalidateDoctorsCache();
  return res.status(result.success ? 200 : 400).json(result);
}

export async function updateDoctorHandler(req: VercelRequest, res: VercelResponse, id: string) {
  const result = await modifyDoctor(id, req.body);
  if (result.success) await invalidateDoctorsCache();
  return res.status(result.success ? 200 : 404).json(result);
}

export async function deleteDoctorHandler(req: VercelRequest, res: VercelResponse, id: string) {
  const result = await removeDoctor(id);
  await invalidateDoctorsCache();
  return res.status(200).json(result);
}

export async function toggleDoctorStatusHandler(req: VercelRequest, res: VercelResponse, id: string) {
  const result = await toggleDoctorStatus(id);
  if (result.success) await invalidateDoctorsCache();
  return res.status(result.success ? 200 : 404).json(result);
}

// ── Departments ───────────────────────────────────────────────────────────────

export async function createDepartmentHandler(req: VercelRequest, res: VercelResponse) {
  const result = await createDepartment(req.body);
  if (result.success) await invalidateDepartmentsCache();
  return res.status(result.success ? 200 : 400).json(result);
}

export async function updateDepartmentHandler(req: VercelRequest, res: VercelResponse, id: string) {
  const result = await modifyDepartment(id, req.body);
  if (result.success) await invalidateDepartmentsCache();
  return res.status(result.success ? 200 : 404).json(result);
}

export async function deleteDepartmentHandler(req: VercelRequest, res: VercelResponse, id: string) {
  const result = await removeDepartment(id);
  await invalidateDepartmentsCache();
  return res.status(200).json(result);
}

// ── Rooms ─────────────────────────────────────────────────────────────────────

export async function createRoomHandler(req: VercelRequest, res: VercelResponse) {
  const result = await createRoom(req.body);
  if (result.success) await invalidateRoomsCache();
  return res.status(result.success ? 200 : 400).json(result);
}

export async function updateRoomHandler(req: VercelRequest, res: VercelResponse, id: string) {
  const result = await modifyRoom(id, req.body);
  if (result.success) await invalidateRoomsCache();
  return res.status(result.success ? 200 : 404).json(result);
}

export async function deleteRoomHandler(req: VercelRequest, res: VercelResponse, id: string) {
  const result = await removeRoom(id);
  await invalidateRoomsCache();
  return res.status(200).json(result);
}

// ── Users / Staff ─────────────────────────────────────────────────────────────

export async function createStaffHandler(req: VercelRequest, res: VercelResponse) {
  const operatorUsername = req.headers['x-operator-username'] as string;
  const result = await createStaff(req.body, operatorUsername);
  if (result.success) await invalidateUsersCache();
  return res.status(result.success ? 200 : 400).json(result);
}

export async function updateStaffHandler(req: VercelRequest, res: VercelResponse, id: string) {
  const operatorUsername = req.headers['x-operator-username'] as string;
  const result = await modifyStaff(id, req.body, operatorUsername);
  if (result.success) {
    await invalidateUsersCache();
    // Bust the legacy auth cache for this user so permission changes take effect immediately
    if (result.user?.username) await invalidateLegacyUserCache(result.user.username);
    if (req.body.username)     await invalidateLegacyUserCache(req.body.username);
  }
  return res.status(result.success ? 200 : 404).json(result);
}

export async function deleteStaffHandler(req: VercelRequest, res: VercelResponse, id: string) {
  // Look up username before deletion so we can bust the legacy auth cache
  const { findUserById } = await import('../repositories/userRepository.js');
  const userRow = await findUserById(id).catch(() => null);

  const result = await removeStaff(id);
  await invalidateUsersCache();

  // Bust the legacy auth cache for the deleted user so subsequent requests
  // are rejected immediately instead of serving stale cached credentials
  if (userRow?.username) await invalidateLegacyUserCache(userRow.username);

  return res.status(200).json(result);
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function updateQueueConfigHandler(req: VercelRequest, res: VercelResponse) {
  const result = await updateQueueConfig(req.body);
  await Promise.all([invalidateSettingsCache(), invalidateDataCache()]);
  return res.status(200).json(result);
}

export async function updateHospitalInfoHandler(req: VercelRequest, res: VercelResponse) {
  const result = await updateHospitalInfo(req.body);
  await Promise.all([invalidateSettingsCache(), invalidateDataCache()]);
  return res.status(200).json(result);
}
