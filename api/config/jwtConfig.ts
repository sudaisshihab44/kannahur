/**
 * api/config/jwtConfig.ts
 *
 * JWT configuration and environment variables.
 */

export const jwtConfig = {
  // Access token (short-lived) - used for API requests
  accessToken: {
    secret: process.env.JWT_ACCESS_SECRET || 'inclusyq-access-secret-change-in-production',
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m', // 15 minutes
  },

  // Refresh token (long-lived) - used to get new access tokens
  refreshToken: {
    secret: process.env.JWT_REFRESH_SECRET || 'inclusyq-refresh-secret-change-in-production',
    expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d', // 7 days
  },

  // Cookie settings
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'strict' as const,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    path: '/',
    domain: process.env.COOKIE_DOMAIN, // Optional: '.yourdomain.com'
  },

  // Security settings
  security: {
    bcryptRounds: 12, // Higher = more secure but slower
    maxFailedAttempts: 5,
    lockoutDuration: 15 * 60 * 1000, // 15 minutes in milliseconds
    sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
    maxConcurrentSessions: 3,
  },
};

// JWT payload interface
export interface JwtPayload {
  userId: string;
  username: string;
  role: string;
  permissions?: string[];
  sessionId: string;
  tokenType: 'access' | 'refresh';
  iat?: number; // issued at
  exp?: number; // expires at
}
