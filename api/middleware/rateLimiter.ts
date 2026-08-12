/**
 * api/middleware/rateLimiter.ts
 *
 * Rate limiting middleware to prevent abuse and brute force attacks.
 * Uses in-memory store for serverless compatibility.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

// In-memory store (cleaned up periodically)
const rateLimitStore: RateLimitStore = {};

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  Object.keys(rateLimitStore).forEach(key => {
    if (rateLimitStore[key].resetTime < now) {
      delete rateLimitStore[key];
    }
  });
}, 5 * 60 * 1000);

/**
 * Get client identifier (IP address + user agent hash)
 */
function getClientId(req: VercelRequest): string {
  const ip = 
    req.headers['x-forwarded-for'] || 
    req.headers['x-real-ip'] || 
    req.socket?.remoteAddress || 
    'unknown';
  
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  // Simple hash for user agent (to save memory)
  const uaHash = userAgent.split('').reduce((hash, char) => {
    return ((hash << 5) - hash) + char.charCodeAt(0);
  }, 0);
  
  return `${ip}:${uaHash}`;
}

/**
 * Rate limiter factory
 * 
 * @param maxRequests - Maximum requests allowed
 * @param windowMs - Time window in milliseconds
 * @param message - Custom error message
 */
export function createRateLimiter(
  maxRequests: number,
  windowMs: number,
  message: string = 'Too many requests, please try again later.'
) {
  return async (req: VercelRequest, res: VercelResponse): Promise<boolean> => {
    const clientId = getClientId(req);
    const now = Date.now();
    
    // Initialize or get existing rate limit data
    if (!rateLimitStore[clientId] || rateLimitStore[clientId].resetTime < now) {
      rateLimitStore[clientId] = {
        count: 0,
        resetTime: now + windowMs,
      };
    }
    
    const clientData = rateLimitStore[clientId];
    clientData.count++;
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - clientData.count).toString());
    res.setHeader('X-RateLimit-Reset', new Date(clientData.resetTime).toISOString());
    
    // Check if limit exceeded
    if (clientData.count > maxRequests) {
      res.setHeader('Retry-After', Math.ceil((clientData.resetTime - now) / 1000).toString());
      res.status(429).json({
        success: false,
        message,
        retryAfter: Math.ceil((clientData.resetTime - now) / 1000),
      });
      return false;
    }
    
    return true;
  };
}

/**
 * Strict rate limiter for authentication endpoints
 * 5 requests per 15 minutes per IP
 */
export const authRateLimiter = createRateLimiter(
  5,
  15 * 60 * 1000, // 15 minutes
  'Too many authentication attempts. Please try again in 15 minutes.'
);

/**
 * Standard rate limiter for API endpoints
 * 100 requests per 15 minutes per IP
 */
export const apiRateLimiter = createRateLimiter(
  100,
  15 * 60 * 1000, // 15 minutes
  'Too many requests from this IP. Please try again later.'
);

/**
 * Strict rate limiter for sensitive operations
 * 10 requests per 15 minutes per IP
 */
export const sensitiveRateLimiter = createRateLimiter(
  10,
  15 * 60 * 1000, // 15 minutes
  'Too many requests for sensitive operations. Please try again later.'
);

/**
 * Lenient rate limiter for public endpoints
 * 200 requests per 15 minutes per IP
 */
export const publicRateLimiter = createRateLimiter(
  200,
  15 * 60 * 1000, // 15 minutes
  'Request limit exceeded. Please try again later.'
);
