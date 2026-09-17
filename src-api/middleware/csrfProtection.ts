/**
 * api/middleware/csrfProtection.ts
 *
 * CSRF (Cross-Site Request Forgery) protection.
 * Validates CSRF tokens for state-changing operations.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

/**
 * Generate CSRF token
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Verify CSRF token from request
 * Checks both header and body for token
 */
export function verifyCsrfToken(req: VercelRequest, expectedToken: string): boolean {
  // Get token from header or body
  const token = 
    req.headers['x-csrf-token'] || 
    req.headers['csrf-token'] ||
    (req.body && req.body.csrfToken);
  
  if (!token || typeof token !== 'string') {
    return false;
  }
  
  // Timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(token),
    Buffer.from(expectedToken)
  );
}

/**
 * CSRF protection middleware
 * 
 * Note: For APIs consumed by mobile apps or external clients,
 * CSRF protection may not be necessary. This is primarily for
 * browser-based sessions.
 * 
 * Alternative CSRF protection strategies:
 * 1. SameSite cookies (already implemented for refresh tokens)
 * 2. Origin/Referer header validation
 * 3. Custom headers (APIs can require custom headers that browsers can't send cross-origin)
 */
export async function csrfProtection(
  req: VercelRequest,
  res: VercelResponse
): Promise<boolean> {
  const method = req.method?.toUpperCase();
  
  // Only check CSRF for state-changing methods
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method || '')) {
    return true; // Allow GET, HEAD, OPTIONS
  }
  
  // Skip CSRF check for API authentication (uses other mechanisms)
  if (req.url?.includes('/api/login') || req.url?.includes('/api/auth')) {
    return true;
  }
  
  // Validate Origin/Referer header (simpler CSRF protection)
  const origin = req.headers.origin || req.headers.referer;
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    process.env.APP_URL,
    process.env.COOKIE_DOMAIN,
    'http://localhost:3000',
    'http://localhost:5173', // Vite dev server
  ].filter(Boolean);

  // If origin is provided, validate it.
  // Same-origin requests (e.g. Vite proxy, server-side fetches) carry no
  // Origin header — treat absence as same-origin (allowed).
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const isAllowed = allowedOrigins.some(allowed => {
        if (!allowed) return false;
        try {
          const allowedUrl = new URL(allowed.startsWith('http') ? allowed : `http://${allowed}`);
          return originUrl.hostname === allowedUrl.hostname;
        } catch {
          return originUrl.hostname === allowed;
        }
      });

      if (!isAllowed) {
        console.warn(`⚠️  CSRF: Rejected request from origin: ${origin}`);
        res.status(403).json({
          success: false,
          message: 'Invalid request origin',
          code: 'INVALID_ORIGIN',
        });
        return false;
      }
    } catch {
      // Malformed origin header — block it
      res.status(403).json({
        success: false,
        message: 'Invalid request origin',
        code: 'INVALID_ORIGIN',
      });
      return false;
    }
  }
  // No origin header → same-origin request → pass through
  
  // Check for custom API header (prevents simple form-based CSRF)
  // Modern browsers require CORS preflight for custom headers
  const hasCustomHeader = 
    req.headers['x-requested-with'] === 'XMLHttpRequest' ||
    req.headers['authorization'] || // JWT tokens indicate intentional API call
    req.headers['x-api-key'];
  
  if (hasCustomHeader) {
    return true; // Custom headers require CORS preflight
  }
  
  // In production, block requests that lack proper auth headers (CSRF guard).
  // Set STRICT_CSRF=false to disable (only for debugging or legacy clients).
  if (process.env.STRICT_CSRF !== 'false') {
    res.status(403).json({
      success: false,
      message: 'CSRF validation failed — missing required headers',
      code: 'CSRF_VALIDATION_FAILED',
    });
    return false;
  }
  
  return true;
}

/**
 * Validate same-site request using cookies
 * More lenient than full CSRF token validation
 */
export function validateSameSite(req: VercelRequest): boolean {
  // SameSite cookies provide CSRF protection
  // If refresh token cookie is present, request is same-site
  const cookies = req.headers.cookie || '';
  const hasRefreshToken = cookies.includes('refreshToken=');
  
  return hasRefreshToken;
}

/**
 * Get CSRF token from session (for traditional session-based apps)
 * For JWT-based apps, CSRF is less critical due to token-based auth
 */
export function getCsrfTokenFromSession(sessionId: string): string | null {
  // TODO: Implement session store lookup if using traditional sessions
  // For now, return null (we use JWT tokens, not sessions)
  return null;
}
