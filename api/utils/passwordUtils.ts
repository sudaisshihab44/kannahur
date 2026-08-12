/**
 * api/utils/passwordUtils.ts
 *
 * Password hashing and verification utilities using bcrypt.
 */
import bcrypt from 'bcrypt';
import { jwtConfig } from '../config/jwtConfig.js';

/**
 * Hash a plain text password using bcrypt.
 * @param password Plain text password
 * @returns Hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, jwtConfig.security.bcryptRounds);
}

/**
 * Verify a password against a hash.
 * @param password Plain text password to verify
 * @param hash Stored password hash
 * @returns True if password matches
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    console.error('[verifyPassword] Error:', error);
    return false;
  }
}

/**
 * Check if a password needs rehashing (if bcrypt rounds have changed).
 * @param hash Stored password hash
 * @returns True if rehashing recommended
 */
export function needsRehash(hash: string): boolean {
  try {
    const rounds = bcrypt.getRounds(hash);
    return rounds < jwtConfig.security.bcryptRounds;
  } catch {
    return false;
  }
}

/**
 * Validate password strength.
 * @param password Plain text password
 * @returns Validation result with messages
 */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
