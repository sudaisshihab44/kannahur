/**
 * api/middleware/authMiddleware.ts
 *
 * Authentication middleware — extracts and validates operator username from headers.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { findUserByUsername } from '../repositories/userRepository.js';

export async function requireAuth(req: VercelRequest, res: VercelResponse): Promise<boolean> {
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
