/**
 * api/middleware/corsMiddleware.ts
 *
 * CORS middleware for Vercel serverless functions.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
  process.env.APP_URL,
  // On Vercel: set FRONTEND_URL to your actual deployment URL
  // e.g. https://inclusyq-3.vercel.app  or  https://your-custom-domain.com
].filter((o): o is string => typeof o === 'string' && o.length > 0);

// ponytail: exact hostname match only — no wildcard/substring matching.
function isAllowedOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  return ALLOWED_ORIGINS.some((allowed) => {
    try {
      const a = new URL(allowed);
      return a.protocol === url.protocol && a.host === url.host;
    } catch {
      return false;
    }
  });
}

export function applyCors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin || '';

  // Strict allowlist: echo a verified origin with credentials, otherwise send
  // NO Access-Control-Allow-Origin header (never '*' together with credentials).
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-operator-username');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }

  return false;
}
