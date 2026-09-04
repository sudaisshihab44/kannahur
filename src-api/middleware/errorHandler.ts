/**
 * api/middleware/errorHandler.ts
 *
 * Global error handler wrapper for controller functions.
 * Integrates Pino structured logging and Sentry error reporting.
 * Every unhandled exception receives a unique errorId that is:
 *   - logged with full stack trace (server-side)
 *   - sent to Sentry with request context
 *   - returned in the JSON response so clients can quote it in support requests
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { logger, generateErrorId } from '../config/logger.js';
import { captureError } from '../monitoring/sentry.js';

type AsyncHandler = (req: VercelRequest, res: VercelResponse, ...args: any[]) => Promise<any>;

const errLog = logger.child({ category: 'error' });

export function wrapAsync(handler: AsyncHandler): AsyncHandler {
  return async (req: VercelRequest, res: VercelResponse, ...args: any[]) => {
    try {
      return await handler(req, res, ...args);
    } catch (err: any) {
      const errorId   = generateErrorId();
      const requestId = (req.headers['x-request-id'] as string) ?? 'unknown';
      const method    = req.method ?? 'UNKNOWN';
      const path      = (req.url ?? '/').split('?')[0];

      // Structured log — full stack on server, never leaked to client
      errLog.error({
        errorId,
        requestId,
        method,
        path,
        status: err.status ?? err.statusCode ?? 500,
        err: {
          name:    err.name,
          message: err.message,
          stack:   err.stack,
          code:    err.code,
        },
      }, `Unhandled exception: ${err.message}`);

      // Report to Sentry with request context
      captureError(err, {
        errorId,
        requestId,
        tags: { method, path },
        extra: { args: args.length },
      });

      if (res.headersSent) return;

      const status  = err.status ?? err.statusCode ?? 500;
      const message = err.message ?? 'Internal server error';

      return res.status(status).json({
        success: false,
        message,
        errorId,                                                          // ← correlation ID
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
      });
    }
  };
}
