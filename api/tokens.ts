/**
 * api/tokens.ts — Token Operations Router (Serverless Function #2 of 4)
 *
 * Enterprise-refactored thin router with ZERO business logic.
 * All logic delegated to controllers → services → repositories.
 *
 * Routes:
 *   POST /api/tokens                    — create token
 *   POST /api/tokens/:id/call           — call token
 *   POST /api/tokens/:id/complete       — complete token
 *   POST /api/tokens/:id/skip           — skip token
 *   POST /api/tokens/:id/cancel         — cancel token
 *   POST /api/tokens/:id/recall         — recall token
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from '../src-api/middleware/corsMiddleware.js';
import { wrapAsync } from '../src-api/middleware/errorHandler.js';
import { requireAuth } from '../src-api/middleware/authMiddleware.js';
import { requireJwtAuth } from '../src-api/middleware/jwtAuthMiddleware.js';
import { securityHeadersMiddleware } from '../src-api/middleware/securityHeaders.js';
import { apiRateLimiter } from '../src-api/middleware/rateLimiter.js';
import { csrfProtection } from '../src-api/middleware/csrfProtection.js';
import {
  createTokenHandler,
  callTokenHandler,
  completeTokenHandler,
  skipTokenHandler,
  cancelTokenHandler,
  recallTokenHandler,
} from '../src-api/controllers/tokenController.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Apply CORS, handle preflight
  if (applyCors(req, res)) return;

  // Apply security headers
  await securityHeadersMiddleware(req, res);

  // Apply rate limiting
  if (!(await apiRateLimiter(req, res))) return;

  const { method } = req;
  const path = (req.url ?? '/').split('?')[0].replace(/\/$/, '') || '/';

  try {
    // ── POST /api/tokens (create) ────────────────────────────────────────────
    if (path === '/api/tokens' && method === 'POST') {
      if (!(await csrfProtection(req, res))) return;
      if (!(await requireJwtAuth(req, res))) return;
      return wrapAsync(createTokenHandler)(req, res);
    }

    // ── POST /api/tokens/:id/:action ─────────────────────────────────────────
    const actionMatch = path.match(/^\/api\/tokens\/([^/]+)\/(call|complete|skip|cancel|recall)$/);
    if (actionMatch && method === 'POST') {
      if (!(await csrfProtection(req, res))) return;
      if (!(await requireJwtAuth(req, res))) return;

      const [, tokenId, action] = actionMatch;

      switch (action) {
        case 'call':
          return wrapAsync(callTokenHandler)(req, res, tokenId);
        case 'complete':
          return wrapAsync(completeTokenHandler)(req, res, tokenId);
        case 'skip':
          return wrapAsync(skipTokenHandler)(req, res, tokenId);
        case 'cancel':
          return wrapAsync(cancelTokenHandler)(req, res, tokenId);
        case 'recall':
          return wrapAsync(recallTokenHandler)(req, res, tokenId);
        default:
          return res.status(400).json({ success: false, message: 'Invalid action' });
      }
    }

    // ── 404 Not Found ────────────────────────────────────────────────────────
    return res.status(404).json({ success: false, message: `No route: ${method} ${path}` });
  } catch (err: any) {
    console.error(`[api/tokens] ${method} ${path}`, err);
    return res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
}
