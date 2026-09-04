/**
 * api/config/logger.ts
 *
 * Pino logger singleton.
 *
 * Output strategy:
 *   production  → newline-delimited JSON (stdout) — ingest into Datadog, Loki, CloudWatch, etc.
 *   development → pino-pretty human-readable output
 *   test        → silent (level 'silent')
 *
 * Every log line carries a standard set of base fields:
 *   service, version, env, pid, hostname
 *
 * Child loggers bind additional context (requestId, errorId, userId, etc.)
 * so every line in a request trace shares the same correlation ID.
 */
import pino from 'pino';
import { randomUUID } from 'crypto';

const isDev  = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
const isTest = process.env.NODE_ENV === 'test';

// ── Base logger ───────────────────────────────────────────────────────────────

export const logger = pino({
  level: isTest ? 'silent' : (process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info')),

  // Standard base fields on every log line
  base: {
    service: 'inclusyq-api',
    version:  process.env.npm_package_version ?? '2.0.0',
    env:      process.env.NODE_ENV ?? 'development',
    pid:      process.pid,
  },

  // ISO timestamp instead of epoch
  timestamp: pino.stdTimeFunctions.isoTime,

  // Rename 'msg' → 'message' for compatibility with Datadog/CloudWatch
  messageKey: 'message',

  // Pretty-print in dev; raw JSON in prod (zero-overhead)
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize:        true,
          translateTime:   'SYS:HH:MM:ss.l',
          ignore:          'pid,hostname,service,version,env',
          messageKey:      'message',
          levelFirst:      true,
          singleLine:      false,
        },
      }
    : undefined,

  // Never log sensitive fields
  redact: {
    paths: [
      'password',
      'passwordHash',
      'password_hash',
      'refreshToken',
      'accessToken',
      'authorization',
      'req.headers.authorization',
      'req.headers.cookie',
      'body.password',
      'body.token',
      '*.secret',
      '*.apiKey',
      '*.api_key',
    ],
    censor: '[REDACTED]',
  },
});

// ── Child logger factories ────────────────────────────────────────────────────

/** Create a child logger bound to a specific request */
export function requestLogger(requestId: string, method: string, path: string) {
  return logger.child({ requestId, method, path, category: 'request' });
}

/** Create a child logger bound to a database operation */
export function dbLogger(operation: string, table: string) {
  return logger.child({ operation, table, category: 'database' });
}

/** Create a child logger bound to a background job */
export function jobLogger(queue: string, jobId: string, jobName: string) {
  return logger.child({ queue, jobId, jobName, category: 'job' });
}

/** Create a child logger for auth events */
export function authLogger(username?: string, ip?: string) {
  return logger.child({ username, ip, category: 'auth' });
}

// ── Error ID utility ──────────────────────────────────────────────────────────

/** Generate a short, human-readable error correlation ID */
export function generateErrorId(): string {
  // e.g. "ERR-3f8a2b1c"
  return `ERR-${randomUUID().split('-')[0]}`;
}

/** Generate a unique request ID */
export function generateRequestId(): string {
  // e.g. "REQ-7d4e9a2f-1234"
  return `REQ-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

// ── Category-specific loggers (singletons) ────────────────────────────────────

export const httpLog    = logger.child({ category: 'http' });
export const dbLog      = logger.child({ category: 'database' });
export const authLog    = logger.child({ category: 'auth' });
export const jobLog     = logger.child({ category: 'job' });
export const cacheLog   = logger.child({ category: 'cache' });
export const systemLog  = logger.child({ category: 'system' });
export const metricsLog = logger.child({ category: 'metrics' });
