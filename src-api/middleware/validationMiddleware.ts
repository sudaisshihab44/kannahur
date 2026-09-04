/**
 * api/middleware/validationMiddleware.ts
 *
 * Validation middleware wrapper for controllers.
 * Validates request body and sanitizes output.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ValidationError } from '../utils/validation.js';
import { sanitizeResponse, sanitizeError } from '../utils/sanitization.js';

/**
 * Wrap controller with input validation and output sanitization
 */
export function withValidation<T>(
  validator: (body: any) => T,
  handler: (req: VercelRequest, res: VercelResponse, validatedData: T, ...args: any[]) => Promise<void>
) {
  return async (req: VercelRequest, res: VercelResponse, ...args: any[]) => {
    try {
      // Validate input
      const validatedData = validator(req.body);
      
      // Call handler with validated data
      await handler(req, res, validatedData, ...args);
    } catch (error: any) {
      // Handle validation errors
      if (error instanceof ValidationError) {
        const sanitized = sanitizeError(error);
        return res.status(400).json({
          success: false,
          message: sanitized.message,
          field: error.field,
          code: error.code,
        });
      }
      
      // Handle other errors
      console.error('[validationMiddleware] Error:', error);
      const sanitized = sanitizeError(error);
      return res.status(500).json({
        success: false,
        message: sanitized.message,
      });
    }
  };
}

/**
 * Wrap response data with sanitization
 */
export function sanitizedResponse(
  res: VercelResponse,
  statusCode: number,
  data: any
): void {
  const sanitized = sanitizeResponse(data);
  res.status(statusCode).json(sanitized);
}

/**
 * Success response helper with sanitization
 */
export function successResponse(
  res: VercelResponse,
  data: any,
  message?: string
): void {
  sanitizedResponse(res, 200, {
    success: true,
    message: message || 'Operation successful',
    data,
  });
}

/**
 * Error response helper with sanitization
 */
export function errorResponse(
  res: VercelResponse,
  statusCode: number,
  error: any,
  message?: string
): void {
  const sanitized = sanitizeError(error);
  res.status(statusCode).json({
    success: false,
    message: message || sanitized.message,
    code: sanitized.code,
  });
}
