/**
 * api/middleware/requestLogger.ts
 *
 * Attaches a unique request ID to every incoming request and logs
 * structured request / response lines with timing.
 *
 * Also records Prometheus HTTP metrics and detects slow requests.
 *
 * Vercel (serverless) usage — call at the top of each handler:
 *   const { reqLog, done } = startRequestLog(req, res);
 *   // ... handler logic ...
 *   done();   ← call when response is fully written
 *
 * Express (dev server) usage — register as middleware:
 *   app.use(expressRequestLogger);
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Request, Response, NextFunction } from 'express';
import { generateRequestId, httpLog } from '../config/logger.js';
import { timeHttpRequest } from '../monitoring/metrics.js';

const SLOW_REQUEST_MS = parseInt(process.env.SLOW_REQUEST_MS ?? '1000', 10);

// ── Normalise path to a route template for Prometheus cardinality control ─────

function normalisePath(rawPath: string): string {
  return rawPath
    // Replace UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    // Replace numeric IDs
    .replace(/\/\d+/g, '/:id')
    // Replace token patterns like tok-123456789
    .replace(/\/(tok|dep|doc|usr|pat|dev|log|rm|ann)-[a-z0-9]+/gi, '/:id')
    // Remove query strings
    .split('?')[0]
    .replace(/\/$/, '') || '/';
}

// ── Vercel serverless helper ───────────────────────────────────────────────────

export interface RequestLogContext {
  requestId: string;
  reqLog:    ReturnType<typeof httpLog.child>;
}

export function startRequestLog(
  req: VercelRequest,
  _res: VercelResponse
): RequestLogContext & { done: (statusCode?: number) => void } {
  const requestId = (req.headers['x-request-id'] as string) ?? generateRequestId();
  const method    = req.method ?? 'GET';
  const rawPath   = (req.url ?? '/').split('?')[0];
  const route     = normalisePath(rawPath);

  // Attach request ID to response headers so clients can correlate
  _res.setHeader('X-Request-Id', requestId);

  const reqLog  = httpLog.child({ requestId, method, path: rawPath });
  const stopMetric = timeHttpRequest(method, route);
  const startMs = Date.now();

  reqLog.info({ event: 'request.start', query: req.url?.split('?')[1] ?? '' }, `→ ${method} ${rawPath}`);

  const done = (statusCode = 200) => {
    const durationMs = Date.now() - startMs;
    stopMetric(statusCode);

    const logFn = statusCode >= 500 ? reqLog.error.bind(reqLog)
                : statusCode >= 400 ? reqLog.warn.bind(reqLog)
                : reqLog.info.bind(reqLog);

    logFn(
      { event: 'request.complete', statusCode, durationMs, slow: durationMs >= SLOW_REQUEST_MS },
      `← ${method} ${rawPath} ${statusCode} (${durationMs}ms)${durationMs >= SLOW_REQUEST_MS ? ' [SLOW]' : ''}`
    );
  };

  return { requestId, reqLog: reqLog as any, done };
}

// ── Express middleware ─────────────────────────────────────────────────────────

export function expressRequestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) ?? generateRequestId();
  const method    = req.method;
  const rawPath   = req.path;
  const route     = normalisePath(rawPath);

  // Expose on request object for use in handlers
  (req as any).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const reqLog     = httpLog.child({ requestId, method, path: rawPath });
  const stopMetric = timeHttpRequest(method, route);
  const startMs    = Date.now();

  reqLog.info({ event: 'request.start' }, `→ ${method} ${rawPath}`);

  res.on('finish', () => {
    const durationMs = Date.now() - startMs;
    const { statusCode } = res;
    stopMetric(statusCode);

    const logFn = statusCode >= 500 ? reqLog.error.bind(reqLog)
                : statusCode >= 400 ? reqLog.warn.bind(reqLog)
                : reqLog.info.bind(reqLog);

    logFn(
      { event: 'request.complete', statusCode, durationMs, slow: durationMs >= SLOW_REQUEST_MS },
      `← ${method} ${rawPath} ${statusCode} (${durationMs}ms)${durationMs >= SLOW_REQUEST_MS ? ' [SLOW]' : ''}`
    );
  });

  next();
}
