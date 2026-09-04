/**
 * api/utils/jwtUtils.ts
 *
 * JWT token generation, verification, and utility functions.
 */
import jwt from 'jsonwebtoken';
import { jwtConfig, JwtPayload } from '../config/jwtConfig.js';

/**
 * Generate an access token (short-lived).
 */
export function generateAccessToken(payload: Omit<JwtPayload, 'tokenType' | 'iat' | 'exp'>): string {
  return jwt.sign(
    { ...payload, tokenType: 'access' },
    jwtConfig.accessToken.secret,
    { expiresIn: jwtConfig.accessToken.expiresIn as any }
  );
}

/**
 * Generate a refresh token (long-lived).
 */
export function generateRefreshToken(payload: Omit<JwtPayload, 'tokenType' | 'iat' | 'exp'>): string {
  return jwt.sign(
    { ...payload, tokenType: 'refresh' },
    jwtConfig.refreshToken.secret,
    { expiresIn: jwtConfig.refreshToken.expiresIn as any }
  );
}

/**
 * Verify an access token.
 */
export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, jwtConfig.accessToken.secret) as JwtPayload;
    
    if (decoded.tokenType !== 'access') {
      return null;
    }
    
    return decoded;
  } catch (error) {
    // Token expired, invalid, or malformed
    return null;
  }
}

/**
 * Verify a refresh token.
 */
export function verifyRefreshToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, jwtConfig.refreshToken.secret) as JwtPayload;
    
    if (decoded.tokenType !== 'refresh') {
      return null;
    }
    
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Decode a token without verification (for debugging/logging).
 * WARNING: Do not use for authentication!
 */
export function decodeToken(token: string): JwtPayload | null {
  try {
    return jwt.decode(token) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Extract token from Authorization header.
 * Supports: "Bearer <token>" or just "<token>"
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  
  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
    return parts[1];
  }
  
  // If no "Bearer" prefix, treat entire string as token
  return authHeader;
}

/**
 * Calculate token expiration timestamp.
 */
export function getTokenExpiration(expiresIn: string): Date {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid expiresIn format: ${expiresIn}`);
  }
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  const now = new Date();
  
  switch (unit) {
    case 's': // seconds
      return new Date(now.getTime() + value * 1000);
    case 'm': // minutes
      return new Date(now.getTime() + value * 60 * 1000);
    case 'h': // hours
      return new Date(now.getTime() + value * 60 * 60 * 1000);
    case 'd': // days
      return new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
    default:
      throw new Error(`Unknown time unit: ${unit}`);
  }
}
