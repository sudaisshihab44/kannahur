/**
 * api/admin.ts — Admin CRUD Router (Serverless Function #3 of 4)
 *
 * Enterprise-refactored thin router with ZERO business logic.
 * All logic delegated to controllers → services → repositories.
 *
 * Routes:
 *   POST   /api/admin/doctors
 *   PUT    /api/admin/doctors/:id
 *   DELETE /api/admin/doctors/:id
 *   POST   /api/admin/doctors/:id/toggle
 *   POST   /api/admin/departments
 *   PUT    /api/admin/departments/:id
 *   DELETE /api/admin/departments/:id
 *   POST   /api/admin/rooms
 *   PUT    /api/admin/rooms/:id
 *   DELETE /api/admin/rooms/:id
 *   POST   /api/admin/staff
 *   PUT    /api/admin/staff/:id
 *   DELETE /api/admin/staff/:id
 *   PUT    /api/admin/settings/queue
 *   PUT    /api/admin/settings/hospital
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from '../src-api/middleware/corsMiddleware.js';
import { wrapAsync } from '../src-api/middleware/errorHandler.js';
import { requireAdmin } from '../src-api/middleware/authMiddleware.js';
import { requireJwtAdmin } from '../src-api/middleware/jwtAuthMiddleware.js';
import { securityHeadersMiddleware } from '../src-api/middleware/securityHeaders.js';
import { sensitiveRateLimiter } from '../src-api/middleware/rateLimiter.js';
import { csrfProtection } from '../src-api/middleware/csrfProtection.js';
import {
  createDoctorHandler,
  updateDoctorHandler,
  deleteDoctorHandler,
  toggleDoctorStatusHandler,
  createDepartmentHandler,
  updateDepartmentHandler,
  deleteDepartmentHandler,
  createRoomHandler,
  updateRoomHandler,
  deleteRoomHandler,
  createStaffHandler,
  updateStaffHandler,
  deleteStaffHandler,
  updateQueueConfigHandler,
  updateHospitalInfoHandler,
} from '../src-api/controllers/adminController.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Apply CORS, handle preflight
  if (applyCors(req, res)) return;

  // Apply security headers
  await securityHeadersMiddleware(req, res);

  // Apply strict rate limiting for admin operations
  if (!(await sensitiveRateLimiter(req, res))) return;

  const { method } = req;
  const path = (req.url ?? '/').split('?')[0].replace(/\/$/, '') || '/';

  try {
    // Require JWT admin auth for ALL routes in this file (backward compatible)
    if (!(await requireJwtAdmin(req, res))) return;

    // Apply CSRF protection for all state-changing methods
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method || '')) {
      if (!(await csrfProtection(req, res))) return;
    }

    // ── DOCTORS ───────────────────────────────────────────────────────────────

    if (path === '/api/admin/doctors' && method === 'POST') {
      return wrapAsync(createDoctorHandler)(req, res);
    }

    const doctorIdMatch = path.match(/^\/api\/admin\/doctors\/([^/]+)$/);
    if (doctorIdMatch) {
      const id = doctorIdMatch[1];
      if (method === 'PUT') return wrapAsync(updateDoctorHandler)(req, res, id);
      if (method === 'DELETE') return wrapAsync(deleteDoctorHandler)(req, res, id);
    }

    const doctorToggleMatch = path.match(/^\/api\/admin\/doctors\/([^/]+)\/toggle$/);
    if (doctorToggleMatch && method === 'POST') {
      const id = doctorToggleMatch[1];
      return wrapAsync(toggleDoctorStatusHandler)(req, res, id);
    }

    // ── DEPARTMENTS ───────────────────────────────────────────────────────────

    if (path === '/api/admin/departments' && method === 'POST') {
      return wrapAsync(createDepartmentHandler)(req, res);
    }

    const deptIdMatch = path.match(/^\/api\/admin\/departments\/([^/]+)$/);
    if (deptIdMatch) {
      const id = deptIdMatch[1];
      if (method === 'PUT') return wrapAsync(updateDepartmentHandler)(req, res, id);
      if (method === 'DELETE') return wrapAsync(deleteDepartmentHandler)(req, res, id);
    }

    // ── ROOMS ─────────────────────────────────────────────────────────────────

    if (path === '/api/admin/rooms' && method === 'POST') {
      return wrapAsync(createRoomHandler)(req, res);
    }

    const roomIdMatch = path.match(/^\/api\/admin\/rooms\/([^/]+)$/);
    if (roomIdMatch) {
      const id = roomIdMatch[1];
      if (method === 'PUT') return wrapAsync(updateRoomHandler)(req, res, id);
      if (method === 'DELETE') return wrapAsync(deleteRoomHandler)(req, res, id);
    }

    // ── STAFF / USERS ─────────────────────────────────────────────────────────

    if (path === '/api/admin/staff' && method === 'POST') {
      return wrapAsync(createStaffHandler)(req, res);
    }

    const staffIdMatch = path.match(/^\/api\/admin\/staff\/([^/]+)$/);
    if (staffIdMatch) {
      const id = staffIdMatch[1];
      if (method === 'PUT') return wrapAsync(updateStaffHandler)(req, res, id);
      if (method === 'DELETE') return wrapAsync(deleteStaffHandler)(req, res, id);
    }

    // ── SETTINGS ──────────────────────────────────────────────────────────────

    if (path === '/api/admin/settings/queue' && method === 'PUT') {
      return wrapAsync(updateQueueConfigHandler)(req, res);
    }

    if (path === '/api/admin/settings/hospital' && method === 'PUT') {
      return wrapAsync(updateHospitalInfoHandler)(req, res);
    }

    // ── 404 Not Found ─────────────────────────────────────────────────────────

    return res.status(404).json({ success: false, message: `No route: ${method} ${path}` });
  } catch (err: any) {
    console.error(`[api/admin] ${method} ${path}`, err);
    return res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
}
