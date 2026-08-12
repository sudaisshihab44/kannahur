/**
 * api/index.ts — Main API Router (Serverless Function #1 of 4)
 *
 * Enterprise-refactored thin router with ZERO business logic.
 * All logic delegated to controllers → services → repositories.
 *
 * Routes:
 *   GET  /api
 *   POST /api/login                           — ENHANCED: Returns JWT tokens
 *   POST /api/logout                          — NEW: Logout and revoke tokens
 *   POST /api/auth/refresh                    — NEW: Refresh access token
 *   GET  /api/auth/verify                     — NEW: Verify token validity
 *   GET  /api/auth/sessions                   — NEW: Get active sessions
 *   POST /api/auth/sessions/revoke-all        — NEW: Logout from all devices
 *   GET  /api/data
 *   GET  /api/queue
 *   POST /api/queue/pause
 *   POST /api/announcements
 *   DELETE /api/announcements/:id
 *   POST /api/patients
 *   GET  /api/devices
 *   POST /api/devices
 *   POST /api/devices/assign
 *   POST /api/devices/unassign
 *   GET  /api/track/:tokenId
 *   GET  /api/jobs/stats                      — NEW: BullMQ queue depth + worker status
 *   POST /api/jobs/:queue/retry               — NEW: Retry all failed jobs in a queue
 *   POST /api/jobs/:queue/discard             — NEW: Discard all failed jobs in a queue
 *   GET  /api/health                          — NEW: Full system health report
 *   GET  /api/ready                           — NEW: Readiness probe (Kubernetes)
 *   GET  /api/live                            — NEW: Liveness probe (Kubernetes)
 *   GET  /api/metrics                         — NEW: Prometheus metrics exposition
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from './middleware/corsMiddleware.js';
import { wrapAsync } from './middleware/errorHandler.js';
import { requireAuth } from './middleware/authMiddleware.js';
import { requireJwtAuth } from './middleware/jwtAuthMiddleware.js';
import { securityHeadersMiddleware } from './middleware/securityHeaders.js';
import { authRateLimiter, apiRateLimiter, publicRateLimiter } from './middleware/rateLimiter.js';
import { csrfProtection } from './middleware/csrfProtection.js';
import { loginHandler } from './controllers/authController.js';
import {
  enhancedLoginHandler,
  refreshTokenHandler,
  logoutHandler,
  verifyTokenHandler,
  getActiveSessionsHandler,
  revokeAllSessionsHandler,
} from './controllers/enhancedAuthController.js';
import { getDataHandler } from './controllers/dataController.js';
import {
  getQueueHandler,
  togglePauseHandler,
  addAnnouncementHandler,
  deleteAnnouncementHandler,
} from './controllers/queueController.js';
import { createPatientHandler } from './controllers/patientController.js';
import {
  listDevicesHandler,
  createDeviceHandler,
  assignDeviceHandler,
  unassignDeviceHandler,
} from './controllers/deviceController.js';
import { trackTokenHandler } from './controllers/trackController.js';
import { ensureDefaultCredentials } from './utils/seed.js';
import { sanitizeResponse } from './utils/sanitization.js';
import {
  getJobStatsHandler,
  retryQueueHandler,
  discardQueueHandler,
} from './controllers/jobsController.js';
import {
  healthHandler,
  readyHandler,
  liveHandler,
  metricsHandler,
} from './controllers/healthController.js';
import { startRequestLog } from './middleware/requestLogger.js';
import { initSentry } from './monitoring/sentry.js';

// Initialise Sentry once per cold start (no-op when SENTRY_DSN is unset)
initSentry();

// Seed once per cold start (non-blocking)
let seeded = false;
if (!seeded) {
  seeded = true;
  ensureDefaultCredentials().catch((e) => console.warn('[seed]', e?.message || e));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Apply CORS, handle preflight
  if (applyCors(req, res)) return;

  // Apply security headers (Helmet-style)
  await securityHeadersMiddleware(req, res);

  // Structured request logging + Prometheus timing
  const { done } = startRequestLog(req, res);

  const { method } = req;
  const path = (req.url ?? '/').split('?')[0].replace(/\/$/, '') || '/';

  // Monitoring endpoints — no auth, no rate-limit (probes must always reach the process)
  if (path === '/api/health'   && method === 'GET') { await healthHandler(req, res);  done(res.statusCode); return; }
  if (path === '/api/ready'    && method === 'GET') { await readyHandler(req, res);   done(res.statusCode); return; }
  if (path === '/api/live'     && method === 'GET') { liveHandler(req, res);          done(res.statusCode); return; }
  if (path === '/api/metrics'  && method === 'GET') { await metricsHandler(req, res); done(res.statusCode); return; }

  try {
    // ── GET /api ──────────────────────────────────────────────────────────────
    if (path === '/api' && method === 'GET') {
      // Public endpoint - use lenient rate limiting
      if (!(await publicRateLimiter(req, res))) return;
      return res.status(200).json({ status: 'ok', service: 'InclusyQ API', version: '2.0.0' });
    }

    // ── POST /api/login (ENHANCED - JWT tokens) ──────────────────────────────
    if (path === '/api/login' && method === 'POST') {
      // Auth endpoint - strict rate limiting
      if (!(await authRateLimiter(req, res))) return;
      return wrapAsync(enhancedLoginHandler)(req, res);
    }

    // ── POST /api/logout (NEW - JWT logout) ───────────────────────────────────
    if (path === '/api/logout' && method === 'POST') {
      if (!(await apiRateLimiter(req, res))) return;
      if (!(await csrfProtection(req, res))) return;
      return wrapAsync(logoutHandler)(req, res);
    }

    // ── POST /api/auth/refresh (NEW - refresh access token) ──────────────────
    if (path === '/api/auth/refresh' && method === 'POST') {
      if (!(await authRateLimiter(req, res))) return;
      return wrapAsync(refreshTokenHandler)(req, res);
    }

    // ── GET /api/auth/verify (NEW - verify token) ─────────────────────────────
    if (path === '/api/auth/verify' && method === 'GET') {
      if (!(await apiRateLimiter(req, res))) return;
      return wrapAsync(verifyTokenHandler)(req, res);
    }

    // ── GET /api/auth/sessions (NEW - get active sessions) ────────────────────
    if (path === '/api/auth/sessions' && method === 'GET') {
      if (!(await apiRateLimiter(req, res))) return;
      if (!(await requireJwtAuth(req, res))) return;
      return wrapAsync(getActiveSessionsHandler)(req, res);
    }

    // ── POST /api/auth/sessions/revoke-all (NEW - logout all devices) ─────────
    if (path === '/api/auth/sessions/revoke-all' && method === 'POST') {
      if (!(await apiRateLimiter(req, res))) return;
      if (!(await csrfProtection(req, res))) return;
      if (!(await requireJwtAuth(req, res))) return;
      return wrapAsync(revokeAllSessionsHandler)(req, res);
    }

    // ── GET /api/data ─────────────────────────────────────────────────────────
    if (path === '/api/data' && method === 'GET') {
      if (!(await apiRateLimiter(req, res))) return;
      if (!(await requireJwtAuth(req, res))) return;
      return wrapAsync(getDataHandler)(req, res);
    }

    // ── GET /api/queue ────────────────────────────────────────────────────────
    if (path === '/api/queue' && method === 'GET') {
      if (!(await publicRateLimiter(req, res))) return;
      return wrapAsync(getQueueHandler)(req, res);
    }

    // ── POST /api/queue/pause ─────────────────────────────────────────────────
    if (path === '/api/queue/pause' && method === 'POST') {
      if (!(await apiRateLimiter(req, res))) return;
      if (!(await csrfProtection(req, res))) return;
      if (!(await requireJwtAuth(req, res))) return;
      return wrapAsync(togglePauseHandler)(req, res);
    }

    // ── POST /api/announcements ───────────────────────────────────────────────
    if (path === '/api/announcements' && method === 'POST') {
      if (!(await apiRateLimiter(req, res))) return;
      if (!(await csrfProtection(req, res))) return;
      if (!(await requireJwtAuth(req, res))) return;
      return wrapAsync(addAnnouncementHandler)(req, res);
    }

    // ── DELETE /api/announcements/:id ─────────────────────────────────────────
    const annDeleteMatch = path.match(/^\/api\/announcements\/([^/]+)$/);
    if (annDeleteMatch && method === 'DELETE') {
      if (!(await apiRateLimiter(req, res))) return;
      if (!(await csrfProtection(req, res))) return;
      if (!(await requireJwtAuth(req, res))) return;
      const annId = annDeleteMatch[1];
      return wrapAsync(deleteAnnouncementHandler)(req, res, annId);
    }

    // ── POST /api/patients ────────────────────────────────────────────────────
    if (path === '/api/patients' && method === 'POST') {
      if (!(await apiRateLimiter(req, res))) return;
      if (!(await csrfProtection(req, res))) return;
      if (!(await requireJwtAuth(req, res))) return;
      return wrapAsync(createPatientHandler)(req, res);
    }

    // ── GET /api/devices ──────────────────────────────────────────────────────
    if (path === '/api/devices' && method === 'GET') {
      if (!(await apiRateLimiter(req, res))) return;
      if (!(await requireJwtAuth(req, res))) return;
      return wrapAsync(listDevicesHandler)(req, res);
    }

    // ── POST /api/devices ─────────────────────────────────────────────────────
    if (path === '/api/devices' && method === 'POST') {
      if (!(await apiRateLimiter(req, res))) return;
      if (!(await csrfProtection(req, res))) return;
      if (!(await requireJwtAuth(req, res))) return;
      return wrapAsync(createDeviceHandler)(req, res);
    }

    // ── POST /api/devices/assign ──────────────────────────────────────────────
    if (path === '/api/devices/assign' && method === 'POST') {
      if (!(await apiRateLimiter(req, res))) return;
      if (!(await csrfProtection(req, res))) return;
      if (!(await requireJwtAuth(req, res))) return;
      return wrapAsync(assignDeviceHandler)(req, res);
    }

    // ── POST /api/devices/unassign ────────────────────────────────────────────
    if (path === '/api/devices/unassign' && method === 'POST') {
      if (!(await apiRateLimiter(req, res))) return;
      if (!(await csrfProtection(req, res))) return;
      if (!(await requireJwtAuth(req, res))) return;
      return wrapAsync(unassignDeviceHandler)(req, res);
    }

    // ── GET /api/track/:tokenId ───────────────────────────────────────────────
    const trackMatch = path.match(/^\/api\/track\/([^/]+)$/);
    if (trackMatch && method === 'GET') {
      if (!(await publicRateLimiter(req, res))) return;
      const tokenId = trackMatch[1];
      return wrapAsync(trackTokenHandler)(req, res, tokenId);
    }

    // ── GET /api/jobs/stats ───────────────────────────────────────────────────
    if (path === '/api/jobs/stats' && method === 'GET') {
      if (!(await apiRateLimiter(req, res))) return;
      if (!(await requireJwtAuth(req, res))) return;
      return wrapAsync(getJobStatsHandler)(req, res);
    }

    // ── POST /api/jobs/:queue/retry ───────────────────────────────────────────
    const jobRetryMatch = path.match(/^\/api\/jobs\/([^/]+)\/retry$/);
    if (jobRetryMatch && method === 'POST') {
      if (!(await apiRateLimiter(req, res))) return;
      if (!(await requireJwtAuth(req, res))) return;
      return wrapAsync(retryQueueHandler)(req, res, jobRetryMatch[1]);
    }

    // ── POST /api/jobs/:queue/discard ─────────────────────────────────────────
    const jobDiscardMatch = path.match(/^\/api\/jobs\/([^/]+)\/discard$/);
    if (jobDiscardMatch && method === 'POST') {
      if (!(await apiRateLimiter(req, res))) return;
      if (!(await requireJwtAuth(req, res))) return;
      return wrapAsync(discardQueueHandler)(req, res, jobDiscardMatch[1]);
    }

    // ── 404 Not Found ─────────────────────────────────────────────────────────
    done(404);
    return res.status(404).json({ success: false, message: `No route: ${method} ${path}` });
  } catch (err: any) {
    done(500);
    console.error(`[api/index] ${method} ${path}`, err);
    return res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
}
