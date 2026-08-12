/**
 * api/middleware/securityHeaders.ts
 *
 * Security headers middleware using Helmet.
 * Protects against common web vulnerabilities.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Apply comprehensive security headers
 * 
 * Headers applied:
 * - X-Content-Type-Options: nosniff (prevent MIME sniffing)
 * - X-Frame-Options: DENY (prevent clickjacking)
 * - X-XSS-Protection: 1; mode=block (XSS protection for older browsers)
 * - Strict-Transport-Security: force HTTPS
 * - Content-Security-Policy: restrict resource loading
 * - Referrer-Policy: control referrer information
 * - Permissions-Policy: restrict browser features
 */
export function applySecurityHeaders(req: VercelRequest, res: VercelResponse): void {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking attacks
  res.setHeader('X-Frame-Options', 'DENY');

  // Enable XSS protection in older browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Force HTTPS (31536000 seconds = 1 year)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Content Security Policy
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  
  res.setHeader('Content-Security-Policy', csp);

  // Control referrer information
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Restrict browser features
  const permissionsPolicy = [
    'geolocation=()',
    'microphone=()',
    'camera=()',
    'payment=()',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()',
  ].join(', ');
  
  res.setHeader('Permissions-Policy', permissionsPolicy);

  // Remove powered-by header
  res.removeHeader('X-Powered-By');

  // Prevent DNS prefetching for privacy
  res.setHeader('X-DNS-Prefetch-Control', 'off');

  // Vary header ensures CDN/proxy caches store separate responses
  // for compressed vs uncompressed versions
  res.setHeader('Vary', 'Accept-Encoding');

  // Disable client-side caching for sensitive endpoints
  if (req.url?.includes('/api/login') || req.url?.includes('/api/auth')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}

/**
 * Middleware wrapper for easier integration
 */
export async function securityHeadersMiddleware(
  req: VercelRequest,
  res: VercelResponse
): Promise<boolean> {
  applySecurityHeaders(req, res);
  return true; // Continue processing
}
