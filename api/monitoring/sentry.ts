/**
 * api/monitoring/sentry.ts
 *
 * Sentry error tracking and performance monitoring.
 *
 * Initialisation:
 *   Call initSentry() once at process start (server.ts / api/index.ts cold start).
 *   Safe to call multiple times — subsequent calls are no-ops.
 *
 * Usage:
 *   import { captureError, captureMessage, sentryScopeFromRequest } from './sentry.js';
 *
 * Graceful degradation:
 *   When SENTRY_DSN is not set, every call is a no-op. The system runs normally
 *   without Sentry.
 */
import * as Sentry from '@sentry/node';
import type { VercelRequest } from '@vercel/node';
import { generateErrorId } from '../config/logger.js';

let initialised = false;

// ── Initialisation ────────────────────────────────────────────────────────────

export function initSentry(): void {
  if (initialised) return;
  initialised = true;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.warn('[Sentry] SENTRY_DSN not set — error reporting disabled.');
    return;
  }

  Sentry.init({
    dsn,
    environment:      process.env.NODE_ENV ?? 'development',
    release:          `inclusyq@${process.env.npm_package_version ?? '2.0.0'}`,

    // Performance tracing — sample 10% of requests in production, 100% in dev
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Never send PII
    sendDefaultPii: false,

    beforeSend(event) {
      // Strip auth headers from breadcrumbs
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }
      return event;
    },
  });

  console.log('[Sentry] Initialised ✓');
}

// ── Error capture ─────────────────────────────────────────────────────────────

interface CaptureOptions {
  errorId?:   string;
  requestId?: string;
  userId?:    string;
  username?:  string;
  tags?:      Record<string, string>;
  extra?:     Record<string, unknown>;
  level?:     Sentry.SeverityLevel;
}

/**
 * Capture an exception and send it to Sentry with structured context.
 * Returns the errorId so it can be included in the error response.
 */
export function captureError(err: unknown, options: CaptureOptions = {}): string {
  const errorId = options.errorId ?? generateErrorId();

  if (!process.env.SENTRY_DSN) return errorId;

  Sentry.withScope((scope) => {
    if (options.requestId) scope.setTag('requestId', options.requestId);
    if (options.userId)    scope.setUser({ id: options.userId, username: options.username });
    if (options.tags)      Object.entries(options.tags).forEach(([k, v]) => scope.setTag(k, v));
    if (options.extra)     scope.setContext('extra', options.extra);
    if (options.level)     scope.setLevel(options.level);

    scope.setTag('errorId', errorId);
    Sentry.captureException(err);
  });

  return errorId;
}

/**
 * Capture a message (non-exception event).
 */
export function captureMessage(
  message: string,
  level:   Sentry.SeverityLevel = 'info',
  extra?:  Record<string, unknown>
): void {
  if (!process.env.SENTRY_DSN) return;

  Sentry.withScope((scope) => {
    if (extra) scope.setContext('extra', extra);
    Sentry.captureMessage(message, level);
  });
}

// ── Performance transaction ───────────────────────────────────────────────────

/**
 * Start a Sentry performance span for an operation.
 * Returns a finish function — call it when the operation completes.
 *
 * @example
 *   const finish = startSpan('db.query', 'SELECT tokens');
 *   const result = await supabase.from('tokens').select('*');
 *   finish();
 */
export function startSpan(op: string, description: string): () => void {
  if (!process.env.SENTRY_DSN) return () => {};

  const span = Sentry.startInactiveSpan({ op, name: description });
  return () => { span?.end(); };
}

// ── Request context helper ────────────────────────────────────────────────────

/**
 * Extract request metadata for Sentry scope (Vercel).
 */
export function sentryContextFromRequest(
  req: VercelRequest,
  requestId: string
): CaptureOptions {
  return {
    requestId,
    tags: {
      method: req.method ?? 'UNKNOWN',
      path:   (req.url ?? '/').split('?')[0],
    },
  };
}

// ── Flush (call before process exit) ─────────────────────────────────────────

export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  await Sentry.close(timeoutMs);
}
