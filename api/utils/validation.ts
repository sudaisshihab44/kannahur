/**
 * api/utils/validation.ts
 *
 * Input validation and sanitization utilities.
 * Protects against injection attacks and malformed input.
 */
import validator from 'validator';

/**
 * Validation error class
 */
export class ValidationError extends Error {
  public field: string;
  public code: string;

  constructor(field: string, message: string, code: string = 'INVALID_INPUT') {
    super(message);
    this.field = field;
    this.code = code;
    this.name = 'ValidationError';
  }
}

/**
 * Sanitize string input (remove dangerous characters)
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return '';
  
  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  // Escape HTML entities (basic XSS protection)
  sanitized = validator.escape(sanitized);
  
  return sanitized;
}

/**
 * Validate and sanitize email
 */
export function validateEmail(email: string): string {
  const sanitized = sanitizeString(email);
  
  if (!validator.isEmail(sanitized)) {
    throw new ValidationError('email', 'Invalid email address', 'INVALID_EMAIL');
  }
  
  return validator.normalizeEmail(sanitized) || sanitized;
}

/**
 * Validate username (alphanumeric + underscore + hyphen only)
 */
export function validateUsername(username: string): string {
  const sanitized = sanitizeString(username);
  
  if (!sanitized || sanitized.length < 3) {
    throw new ValidationError('username', 'Username must be at least 3 characters', 'USERNAME_TOO_SHORT');
  }
  
  if (sanitized.length > 50) {
    throw new ValidationError('username', 'Username must not exceed 50 characters', 'USERNAME_TOO_LONG');
  }
  
  // Only allow alphanumeric, underscore, hyphen, and dot
  if (!/^[a-zA-Z0-9._-]+$/.test(sanitized)) {
    throw new ValidationError(
      'username',
      'Username can only contain letters, numbers, dots, underscores, and hyphens',
      'INVALID_USERNAME'
    );
  }
  
  return sanitized;
}

/**
 * Validate password (check strength but don't sanitize)
 */
export function validatePassword(password: string): string {
  if (typeof password !== 'string') {
    throw new ValidationError('password', 'Password must be a string', 'INVALID_PASSWORD');
  }
  
  if (password.length < 8) {
    throw new ValidationError('password', 'Password must be at least 8 characters', 'PASSWORD_TOO_SHORT');
  }
  
  if (password.length > 128) {
    throw new ValidationError('password', 'Password must not exceed 128 characters', 'PASSWORD_TOO_LONG');
  }
  
  // Don't sanitize passwords (they should support special characters)
  return password;
}

/**
 * Validate UUID
 */
export function validateUUID(uuid: string, fieldName: string = 'id'): string {
  const sanitized = sanitizeString(uuid);
  
  if (!validator.isUUID(sanitized)) {
    throw new ValidationError(fieldName, `Invalid ${fieldName} format`, 'INVALID_UUID');
  }
  
  return sanitized;
}

/**
 * Validate integer
 */
export function validateInteger(
  value: any,
  fieldName: string = 'value',
  min?: number,
  max?: number
): number {
  const parsed = parseInt(value, 10);
  
  if (isNaN(parsed)) {
    throw new ValidationError(fieldName, `${fieldName} must be a valid integer`, 'INVALID_INTEGER');
  }
  
  if (min !== undefined && parsed < min) {
    throw new ValidationError(fieldName, `${fieldName} must be at least ${min}`, 'VALUE_TOO_SMALL');
  }
  
  if (max !== undefined && parsed > max) {
    throw new ValidationError(fieldName, `${fieldName} must not exceed ${max}`, 'VALUE_TOO_LARGE');
  }
  
  return parsed;
}

/**
 * Validate phone number
 */
export function validatePhoneNumber(phone: string): string {
  const sanitized = sanitizeString(phone);
  
  // Remove common formatting characters
  const cleaned = sanitized.replace(/[\s\-\(\)\.]/g, '');
  
  // Check if it's a valid phone number (10-15 digits, optional + prefix)
  if (!/^\+?[0-9]{10,15}$/.test(cleaned)) {
    throw new ValidationError('phone', 'Invalid phone number format', 'INVALID_PHONE');
  }
  
  return cleaned;
}

/**
 * Validate enum value
 */
export function validateEnum<T extends string>(
  value: string,
  allowedValues: readonly T[],
  fieldName: string = 'value'
): T {
  const sanitized = sanitizeString(value) as T;
  
  if (!allowedValues.includes(sanitized)) {
    throw new ValidationError(
      fieldName,
      `${fieldName} must be one of: ${allowedValues.join(', ')}`,
      'INVALID_ENUM'
    );
  }
  
  return sanitized;
}

/**
 * Validate boolean
 */
export function validateBoolean(value: any, fieldName: string = 'value'): boolean {
  if (typeof value === 'boolean') return value;
  
  const sanitized = sanitizeString(String(value)).toLowerCase();
  
  if (sanitized === 'true' || sanitized === '1' || sanitized === 'yes') return true;
  if (sanitized === 'false' || sanitized === '0' || sanitized === 'no') return false;
  
  throw new ValidationError(fieldName, `${fieldName} must be a boolean value`, 'INVALID_BOOLEAN');
}

/**
 * Validate URL
 */
export function validateURL(url: string, fieldName: string = 'url'): string {
  const sanitized = sanitizeString(url);
  
  if (!validator.isURL(sanitized, { require_protocol: true })) {
    throw new ValidationError(fieldName, `Invalid ${fieldName} format`, 'INVALID_URL');
  }
  
  return sanitized;
}

/**
 * Validate date (ISO 8601 format)
 */
export function validateDate(date: string, fieldName: string = 'date'): string {
  const sanitized = sanitizeString(date);
  
  if (!validator.isISO8601(sanitized)) {
    throw new ValidationError(fieldName, `Invalid ${fieldName} format (use ISO 8601)`, 'INVALID_DATE');
  }
  
  return sanitized;
}

/**
 * Validate object keys (prevent prototype pollution)
 */
export function validateObjectKeys(obj: any, allowedKeys: string[]): void {
  if (typeof obj !== 'object' || obj === null) {
    throw new ValidationError('object', 'Invalid object', 'INVALID_OBJECT');
  }
  
  const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
  
  Object.keys(obj).forEach(key => {
    // Check for dangerous keys
    if (dangerousKeys.includes(key.toLowerCase())) {
      throw new ValidationError('object', 'Potentially dangerous object key detected', 'DANGEROUS_KEY');
    }
    
    // Check if key is allowed
    if (!allowedKeys.includes(key)) {
      throw new ValidationError('object', `Unexpected key: ${key}`, 'UNEXPECTED_KEY');
    }
  });
}

/**
 * Validate JSON string
 */
export function validateJSON(jsonString: string, fieldName: string = 'json'): any {
  const sanitized = sanitizeString(jsonString);
  
  try {
    return JSON.parse(sanitized);
  } catch (error) {
    throw new ValidationError(fieldName, `Invalid ${fieldName} format`, 'INVALID_JSON');
  }
}

/**
 * Sanitize filename (prevent directory traversal)
 */
export function sanitizeFilename(filename: string): string {
  const sanitized = sanitizeString(filename);
  
  // Remove path traversal attempts
  const cleaned = sanitized.replace(/\.\./g, '').replace(/[\/\\]/g, '');
  
  // Remove dangerous characters
  const safe = cleaned.replace(/[^a-zA-Z0-9._-]/g, '_');
  
  if (!safe || safe.length === 0) {
    throw new ValidationError('filename', 'Invalid filename', 'INVALID_FILENAME');
  }
  
  return safe;
}

/**
 * Validate text length
 */
export function validateTextLength(
  text: string,
  minLength: number,
  maxLength: number,
  fieldName: string = 'text'
): string {
  const sanitized = sanitizeString(text);
  
  if (sanitized.length < minLength) {
    throw new ValidationError(
      fieldName,
      `${fieldName} must be at least ${minLength} characters`,
      'TEXT_TOO_SHORT'
    );
  }
  
  if (sanitized.length > maxLength) {
    throw new ValidationError(
      fieldName,
      `${fieldName} must not exceed ${maxLength} characters`,
      'TEXT_TOO_LONG'
    );
  }
  
  return sanitized;
}

/**
 * Remove XSS attempts from string
 */
export function removeXSS(input: string): string {
  if (typeof input !== 'string') return '';
  
  let cleaned = input;
  
  // Remove script tags
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove event handlers
  cleaned = cleaned.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
  cleaned = cleaned.replace(/on\w+\s*=\s*[^\s>]*/gi, '');
  
  // Remove javascript: protocols
  cleaned = cleaned.replace(/javascript:/gi, '');
  
  // Remove data: protocols (except images)
  cleaned = cleaned.replace(/data:(?!image\/)/gi, '');
  
  // Escape HTML entities
  cleaned = validator.escape(cleaned);
  
  return cleaned;
}
