/**
 * api/utils/sqlProtection.ts
 *
 * SQL injection protection utilities.
 * Ensures all database queries use parameterized queries.
 */

/**
 * Detect SQL injection patterns
 */
export function detectSqlInjection(input: string): boolean {
  if (typeof input !== 'string') return false;
  
  const sqlInjectionPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|SCRIPT)\b)/gi,
    /--/g,
    /;[\s]*$/g,
    /\/\*/g,
    /\*\//g,
    /xp_/gi,
    /sp_/gi,
    /0x[0-9a-f]+/gi,
    /(\b(AND|OR)\b[\s]+[\d]+[\s]*=[\s]*[\d]+)/gi,
    /'[\s]*(OR|AND)[\s]+'/gi,
    /WAITFOR[\s]+DELAY/gi,
    /BENCHMARK/gi,
    /SLEEP\(/gi,
  ];
  
  return sqlInjectionPatterns.some(pattern => pattern.test(input));
}

/**
 * Validate input for SQL injection attempts
 * Throws error if injection detected
 */
export function validateNoSqlInjection(input: string, fieldName: string = 'input'): void {
  if (detectSqlInjection(input)) {
    console.error(`⚠️  SQL injection attempt detected in ${fieldName}: ${input.substring(0, 50)}...`);
    throw new Error(`Invalid ${fieldName}: potentially dangerous content detected`);
  }
}

/**
 * Safe string for SQL LIKE queries (escapes wildcards)
 */
export function escapeLikePattern(input: string): string {
  if (typeof input !== 'string') return '';
  
  // Escape special LIKE characters
  return input
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

/**
 * Parameterized query builder for Supabase
 * Ensures all values are properly escaped
 */
export class SafeQueryBuilder {
  /**
   * Build safe equality filter
   */
  static eq<T>(
    query: any,
    column: string,
    value: any
  ): any {
    // Validate column name (prevent injection)
    this.validateColumnName(column);
    
    return query.eq(column, value);
  }

  /**
   * Build safe IN filter
   */
  static in<T>(
    query: any,
    column: string,
    values: any[]
  ): any {
    this.validateColumnName(column);
    
    if (!Array.isArray(values)) {
      throw new Error('Values must be an array for IN query');
    }
    
    return query.in(column, values);
  }

  /**
   * Build safe LIKE filter
   */
  static like(
    query: any,
    column: string,
    pattern: string
  ): any {
    this.validateColumnName(column);
    
    // Escape the pattern
    const safePattern = escapeLikePattern(pattern);
    
    return query.like(column, `%${safePattern}%`);
  }

  /**
   * Validate column name (alphanumeric + underscore only)
   */
  private static validateColumnName(column: string): void {
    if (typeof column !== 'string') {
      throw new Error('Column name must be a string');
    }
    
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column)) {
      throw new Error(`Invalid column name: ${column}`);
    }
  }
}

/**
 * Validate table name (prevent injection)
 */
export function validateTableName(tableName: string): void {
  if (typeof tableName !== 'string') {
    throw new Error('Table name must be a string');
  }
  
  // Only allow alphanumeric and underscore
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }
  
  // Check for SQL keywords
  const sqlKeywords = [
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
    'EXEC', 'EXECUTE', 'UNION', 'WHERE', 'FROM', 'JOIN',
  ];
  
  if (sqlKeywords.includes(tableName.toUpperCase())) {
    throw new Error(`Table name cannot be a SQL keyword: ${tableName}`);
  }
}

/**
 * Sanitize order by clause
 */
export function sanitizeOrderBy(orderBy: string): string {
  if (typeof orderBy !== 'string') return 'created_at';
  
  // Only allow column name and optional DESC/ASC
  const match = orderBy.match(/^([a-zA-Z_][a-zA-Z0-9_]*)(\s+(ASC|DESC))?$/i);
  
  if (!match) {
    console.warn(`Invalid ORDER BY clause: ${orderBy}, using default`);
    return 'created_at';
  }
  
  return match[1] + (match[2] || '');
}

/**
 * Validate limit value for pagination
 */
export function validateLimit(limit: any, max: number = 100): number {
  const parsed = parseInt(limit, 10);
  
  if (isNaN(parsed) || parsed < 1) {
    return 10; // Default
  }
  
  if (parsed > max) {
    return max; // Cap at maximum
  }
  
  return parsed;
}

/**
 * Validate offset value for pagination
 */
export function validateOffset(offset: any): number {
  const parsed = parseInt(offset, 10);
  
  if (isNaN(parsed) || parsed < 0) {
    return 0; // Default
  }
  
  return parsed;
}

/**
 * Build safe pagination parameters
 */
export interface PaginationParams {
  limit: number;
  offset: number;
  page: number;
}

export function buildPagination(
  page: any = 1,
  pageSize: any = 10,
  maxPageSize: number = 100
): PaginationParams {
  const validPage = Math.max(1, parseInt(page, 10) || 1);
  const validPageSize = validateLimit(pageSize, maxPageSize);
  const offset = (validPage - 1) * validPageSize;
  
  return {
    limit: validPageSize,
    offset,
    page: validPage,
  };
}

/**
 * Escape string for safe insertion (fallback, prefer parameterized queries)
 */
export function escapeString(input: string): string {
  if (typeof input !== 'string') return '';
  
  return input
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "''")
    .replace(/"/g, '""')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\0/g, '');
}

/**
 * Log potential SQL injection attempts
 */
export function logSqlInjectionAttempt(
  input: string,
  fieldName: string,
  ipAddress?: string
): void {
  console.error('⚠️  SQL INJECTION ATTEMPT DETECTED');
  console.error(`Field: ${fieldName}`);
  console.error(`Input: ${input.substring(0, 100)}${input.length > 100 ? '...' : ''}`);
  if (ipAddress) {
    console.error(`IP: ${ipAddress}`);
  }
  console.error(`Timestamp: ${new Date().toISOString()}`);
  
  // TODO: Log to security_events table
  // This should be implemented to track security incidents
}
