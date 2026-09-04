/**
 * api/controllers/enhancedAuthController.ts
 *
 * Enhanced authentication HTTP handlers with JWT tokens, refresh, and logout.
 * BACKWARD COMPATIBLE: Maintains same API contracts as old authController.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loginWithCredentials, refreshAccessToken, logout, verifySession, revokeAllSessions } from '../services/enhancedAuthService.js';
import { getClientIp } from '../utils/deviceUtils.js';
import { extractBearerToken } from '../utils/jwtUtils.js';
import { getUserActiveSessions } from '../repositories/authRepository.js';
import { parseCookie, stringifySetCookie } from 'cookie';
import { resetAuthLimiter } from '../middleware/rateLimiter.js';

/** Minimal cookie serialize helper matching the old cookie.serialize() API */
function serializeCookie(name: string, val: string, options: Record<string, any> = {}): string {
  const parts = [`${name}=${encodeURIComponent(val)}`];
  if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.expires) parts.push(`Expires=${options.expires instanceof Date ? options.expires.toUTCString() : options.expires}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join('; ');
}
import { jwtConfig } from '../config/jwtConfig.js';

/**
 * POST /api/login
 * BACKWARD COMPATIBLE: Returns same response format + JWT tokens.
 */
export async function enhancedLoginHandler(req: VercelRequest, res: VercelResponse) {
  const { username, password, portal } = req.body || {};
  const ipAddress = getClientIp(req.headers as Record<string, string | string[] | undefined>);
  const userAgent = req.headers['user-agent'] || 'unknown';

  const result = await loginWithCredentials(username, password, portal, {
    ipAddress,
    userAgent,
  });

  if (!result.success) {
    return res.status(result.message?.includes('deactivated') ? 403 : 401).json({
      success: false,
      message: result.message,
    });
  }

  // Set refresh token in HTTP-only cookie (most secure)
  if (result.refreshToken) {
    res.setHeader('Set-Cookie', serializeCookie('refreshToken', result.refreshToken, {
      ...jwtConfig.cookie,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: jwtConfig.cookie.maxAge,
      path: '/',
    }));
  }

  // Reset the per-username rate limit counter so the user is not locked
  // out on their next page load if they previously mistyped their password.
  resetAuthLimiter(result.user?.username ?? username, ipAddress);

  // Return tokens + user data (BACKWARD COMPATIBLE)
  return res.status(200).json({
    success: true,
    user: result.user,
    // New JWT fields
    accessToken: result.accessToken,
    refreshToken: result.refreshToken, // Also return in body for flexibility
    sessionId: result.sessionId,
    expiresIn: result.expiresIn,
  });
}

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token.
 */
export async function refreshTokenHandler(req: VercelRequest, res: VercelResponse) {
  // Try to get refresh token from cookie first, then body
  const cookies = parseCookie(req.headers.cookie || '');
  const refreshToken = cookies.refreshToken || req.body?.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({
      success: false,
      message: 'Refresh token not provided',
    });
  }

  const ipAddress = getClientIp(req.headers as Record<string, string | string[] | undefined>);
  const userAgent = req.headers['user-agent'] || 'unknown';

  const result = await refreshAccessToken(refreshToken, {
    ipAddress,
    userAgent,
  });

  if (!result.success) {
    // Clear invalid refresh token cookie
    res.setHeader('Set-Cookie', serializeCookie('refreshToken', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 0,
      path: '/',
    }));

    return res.status(401).json({
      success: false,
      message: result.message,
    });
  }

  return res.status(200).json({
    success: true,
    accessToken: result.accessToken,
    expiresIn: result.expiresIn,
    user: result.user,
  });
}

/**
 * POST /api/logout
 * Logout and revoke tokens.
 */
export async function logoutHandler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization as string;
  const accessToken = extractBearerToken(authHeader);

  if (!accessToken) {
    return res.status(401).json({
      success: false,
      message: 'Access token required',
    });
  }

  const ipAddress = getClientIp(req.headers as Record<string, string | string[] | undefined>);
  const userAgent = req.headers['user-agent'] || 'unknown';

  const result = await logout(accessToken, {
    ipAddress,
    userAgent,
  });

  // Clear refresh token cookie
  res.setHeader('Set-Cookie', serializeCookie('refreshToken', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  }));

  return res.status(200).json(result);
}

/**
 * GET /api/auth/verify
 * Verify access token and return user data.
 */
export async function verifyTokenHandler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization as string;
  const accessToken = extractBearerToken(authHeader);

  if (!accessToken) {
    return res.status(401).json({
      valid: false,
      message: 'Access token required',
    });
  }

  const result = await verifySession(accessToken);

  if (!result.valid) {
    return res.status(401).json({
      valid: false,
      message: result.message,
    });
  }

  return res.status(200).json({
    valid: true,
    user: result.user,
  });
}

/**
 * GET /api/auth/sessions
 * Get all active sessions for current user.
 */
export async function getActiveSessionsHandler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization as string;
  const accessToken = extractBearerToken(authHeader);

  if (!accessToken) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
  }

  const sessionCheck = await verifySession(accessToken);
  if (!sessionCheck.valid) {
    return res.status(401).json({
      success: false,
      message: 'Invalid session',
    });
  }

  const sessions = await getUserActiveSessions(sessionCheck.user.id);

  return res.status(200).json({
    success: true,
    sessions,
  });
}

/**
 * POST /api/auth/sessions/revoke-all
 * Revoke all sessions except current (logout from all devices).
 */
export async function revokeAllSessionsHandler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization as string;
  const accessToken = extractBearerToken(authHeader);

  if (!accessToken) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
  }

  const sessionCheck = await verifySession(accessToken);
  if (!sessionCheck.valid) {
    return res.status(401).json({
      success: false,
      message: 'Invalid session',
    });
  }

  const { keepCurrent } = req.body || {};
  const currentSessionId = keepCurrent ? sessionCheck.user.sessionId : undefined;

  const result = await revokeAllSessions(sessionCheck.user.id, currentSessionId);

  return res.status(200).json({
    success: true,
    message: `Revoked ${result.revokedCount} session(s)`,
    revokedCount: result.revokedCount,
  });
}
