/**
 * api/utils/response.ts
 *
 * HTTP response helper utilities for consistent API responses.
 * All responses are automatically sanitized to prevent XSS.
 */
import type { VercelResponse } from '@vercel/node';
import { sanitizeResponse, sanitizeError } from './sanitization.js';

export function sendSuccess(res: VercelResponse, data: any, status = 200) {
  const sanitized = sanitizeResponse(data);
  return res.status(status).json({ success: true, ...sanitized });
}

export function sendError(res: VercelResponse, message: string, status = 500, extra?: any) {
  const sanitizedMessage = typeof message === 'string' ? message : String(message);
  const sanitizedExtra = extra ? sanitizeResponse(extra) : {};
  return res.status(status).json({ 
    success: false, 
    message: sanitizedMessage, 
    ...sanitizedExtra 
  });
}

export function sendNotFound(res: VercelResponse, resource = 'Resource') {
  return res.status(404).json({ success: false, message: `${resource} not found.` });
}

export function sendUnauthorized(res: VercelResponse, message = 'Authentication required.') {
  return res.status(401).json({ success: false, message });
}

export function sendForbidden(res: VercelResponse, message = 'Access forbidden.') {
  return res.status(403).json({ success: false, message });
}

export function sendBadRequest(res: VercelResponse, message: string) {
  return res.status(400).json({ success: false, message });
}

export function sendValidationError(res: VercelResponse, error: any) {
  const sanitized = sanitizeError(error);
  return res.status(400).json({
    success: false,
    message: sanitized.message,
    code: sanitized.code || 'VALIDATION_ERROR',
  });
}
