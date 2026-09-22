/**
 * api/middleware/authMiddleware.ts
 *
 * Legacy passwordless header auth — DISABLED unless ALLOW_LEGACY_AUTH=true.
 * Prefer requireJwtAuth (JWT Bearer) for all routes. This file is retained
 * only for transitional legacy clients; it is currently unreferenced.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { findUserByUsername } from '../repositories/userRepository.js';

function legacyAuthBlocked(res: VercelResponse): boolean {
  if (process.env.ALLOW_LEGACY_AUTH === 'true') return false;
  res.status(401).json({ success: false, message: 'Authentication required. Provide a Bearer token.' });
  return true;
}

export async function requireAuth(req: VercelRequest, res: VercelResponse): Promise<boolean> {
  if (legacyAuthBlocked(res)) return false;
  const operatorUsername = req.headers['x-operator-username'] as string;

  if (!operatorUsername?.trim()) {
    res.status(401).json({ success: false, message: 'Authentication required. Missing x-operator-username header.' });
    return false;
  }

  const user = await findUserByUsername(operatorUsername);
  if (!user) {
    res.status(401).json({ success: false, message: 'Invalid authentication credentials.' });
    return false;
  }

  if (user.status === 'deactivated') {
    res.status(403).json({ success: false, message: 'Your account has been deactivated.' });
    return false;
  }

  return true;
}

export async function requireAdmin(req: VercelRequest, res: VercelResponse): Promise<boolean> {
  if (legacyAuthBlocked(res)) return false;
  const operatorUsername = req.headers['x-operator-username'] as string;

  if (!operatorUsername?.trim()) {
    res.status(401).json({ success: false, message: 'Authentication required.' });
    return false;
  }

  const user = await findUserByUsername(operatorUsername);
  if (!user) {
    res.status(401).json({ success: false, message: 'Invalid authentication credentials.' });
    return false;
  }

  if (user.status === 'deactivated') {
    res.status(403).json({ success: false, message: 'Your account has been deactivated.' });
    return false;
  }

  if (user.role !== 'admin') {
    res.status(403).json({ success: false, message: 'Administrator access required.' });
    return false;
  }

  return true;
}
