/**
 * api/controllers/authController.ts
 *
 * HTTP handlers for authentication endpoints.
 * Delegates to authService, returns HTTP responses.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticateUser } from '../services/authService.js';

export async function loginHandler(req: VercelRequest, res: VercelResponse) {
  const { username, password, portal } = req.body || {};
  const result = await authenticateUser(username, password, portal);

  if (!result.success) {
    return res.status(result.message?.includes('deactivated') ? 403 : 401).json(result);
  }

  return res.status(200).json(result);
}
