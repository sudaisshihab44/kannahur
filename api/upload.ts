/**
 * api/upload.ts — File Upload Router (Serverless Function #4 of 4)
 *
 * Enterprise-refactored thin router with ZERO business logic.
 * All logic delegated to uploadController.
 *
 * MUST be separate file because Vercel's bodyParser config is per-function.
 * Multipart/form-data requires bodyParser: false.
 *
 * Routes:
 *   POST /api/upload/logo
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from './middleware/corsMiddleware.js';
import { wrapAsync } from './middleware/errorHandler.js';
import { requireAdmin } from './middleware/authMiddleware.js';
import { requireJwtAdmin } from './middleware/jwtAuthMiddleware.js';
import { securityHeadersMiddleware } from './middleware/securityHeaders.js';
import { sensitiveRateLimiter } from './middleware/rateLimiter.js';
import { csrfProtection } from './middleware/csrfProtection.js';
import { uploadLogoHandler } from './controllers/uploadController.js';

// Disable Vercel's built-in body parser so busboy can read the raw stream
export const config = {
  api: { bodyParser: false },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Apply CORS, handle preflight
  if (applyCors(req, res)) return;

  // Apply security headers
  await securityHeadersMiddleware(req, res);

  // Apply strict rate limiting for upload operations
  if (!(await sensitiveRateLimiter(req, res))) return;

  const { method } = req;
  const path = (req.url ?? '/').split('?')[0].replace(/\/$/, '') || '/';

  try {
    // Require JWT admin auth for ALL routes in this file (backward compatible)
    if (!(await requireJwtAdmin(req, res))) return;

    // Apply CSRF protection
    if (!(await csrfProtection(req, res))) return;

    // ── POST /api/upload/logo ────────────────────────────────────────────────
    if (path === '/api/upload/logo' && method === 'POST') {
      return wrapAsync(uploadLogoHandler)(req, res);
    }

    // ── 404 Not Found ────────────────────────────────────────────────────────
    return res.status(404).json({ success: false, message: `No route: ${method} ${path}` });
  } catch (err: any) {
    console.error(`[api/upload] ${method} ${path}`, err);
    return res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
}
