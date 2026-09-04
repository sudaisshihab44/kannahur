/**
 * api/utils/sanitization.ts
 *
 * Output sanitization utilities to prevent XSS attacks.
 * Sanitizes data before sending to client.
 */
import validator from 'validator';

/**
 * Sanitize string for HTML output
 */
export function sanitizeHtml(input: string): string {
  if (typeof input !== 'string') return '';
  return validator.escape(input);
}

/**
 * Sanitize object recursively
 */
export function sanitizeObject<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'string') {
    return sanitizeHtml(obj) as unknown as T;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item)) as unknown as T;
  }
  
  if (typeof obj === 'object') {
    const sanitized: any = {};
    
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        // Skip sensitive fields (don't include in output)
        if (isSensitiveField(key)) {
          continue;
        }
        
        sanitized[key] = sanitizeObject((obj as any)[key]);
      }
    }
    
    return sanitized as T;
  }
  
  return obj;
}

/**
 * Check if field is sensitive and should be excluded from output
 */
function isSensitiveField(fieldName: string): boolean {
  const sensitivePatterns = [
    /password/i,
    /secret/i,
    /token/i,
    /api[_-]?key/i,
    /private[_-]?key/i,
    /salt/i,
  ];
  
  return sensitivePatterns.some(pattern => pattern.test(fieldName));
}

/**
 * Sanitize API response
 */
export function sanitizeResponse<T>(data: T): T {
  return sanitizeObject(data);
}

/**
 * Remove sensitive fields from user object
 */
export function sanitizeUser(user: any): any {
  if (!user) return null;
  
  const {
    password,
    password_hash,
    password_salt,
    failed_login_attempts,
    locked_until,
    ...safeUser
  } = user;
  
  return sanitizeObject(safeUser);
}

/**
 * Sanitize error message (don't leak sensitive info)
 */
export function sanitizeError(error: any): { message: string; code?: string } {
  if (!error) {
    return { message: 'An unknown error occurred' };
  }
  
  // Never expose database errors directly
  const databasePatterns = [
    /duplicate key/i,
    /foreign key/i,
    /syntax error/i,
    /table.*doesn't exist/i,
    /column.*doesn't exist/i,
    /supabase/i,
    /postgres/i,
  ];
  
  const errorMessage = error.message || String(error);
  
  if (databasePatterns.some(pattern => pattern.test(errorMessage))) {
    return {
      message: 'A database error occurred. Please contact support.',
      code: 'DATABASE_ERROR',
    };
  }
  
  // Never expose stack traces in production
  if (process.env.NODE_ENV === 'production') {
    // Return generic message for unknown errors
    if (!error.code) {
      return { message: 'An error occurred while processing your request' };
    }
  }
  
  // Sanitize the error message
  return {
    message: sanitizeHtml(errorMessage),
    code: error.code,
  };
}

/**
 * Sanitize array of objects
 */
export function sanitizeArray<T>(arr: T[]): T[] {
  if (!Array.isArray(arr)) return [];
  return arr.map(item => sanitizeObject(item));
}

/**
 * Remove null bytes from string
 */
export function removeNullBytes(input: string): string {
  if (typeof input !== 'string') return '';
  return input.replace(/\0/g, '');
}

/**
 * Sanitize SQL-like string (for display only, NOT for queries)
 */
export function sanitizeSqlString(input: string): string {
  if (typeof input !== 'string') return '';
  
  // Remove SQL keywords and dangerous characters
  return input
    .replace(/['";\\]/g, '')
    .replace(/--/g, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '');
}

/**
 * Sanitize log message (prevent log injection)
 */
export function sanitizeLogMessage(message: string): string {
  if (typeof message !== 'string') return '';
  
  // Remove newlines and carriage returns (prevent log injection)
  return message
    .replace(/\r/g, '')
    .replace(/\n/g, ' ')
    .slice(0, 500); // Limit length
}

/**
 * Safe JSON stringify (handles circular references)
 */
export function safeStringify(obj: any, space?: number): string {
  const seen = new WeakSet();
  
  return JSON.stringify(obj, (key, value) => {
    // Skip sensitive fields
    if (isSensitiveField(key)) {
      return '[REDACTED]';
    }
    
    // Handle circular references
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    
    return value;
  }, space);
}
