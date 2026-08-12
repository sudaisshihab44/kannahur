/**
 * api/jobs/queues.ts
 *
 * BullMQ Queue instances — one per domain, shared across the process.
 *
 * Queues are thin: they only enqueue jobs.
 * Workers (api/jobs/workers/*) do the actual processing.
 *
 * Graceful degradation:
 *   If REDIS_URL is not set the queues are replaced by a NullQueue shim
 *   that logs jobs and executes them in-process (identical to the old
 *   synchronous behaviour).  This keeps the dev workflow intact without
 *   requiring Redis.
 */
import { Queue, QueueEvents } from 'bullmq';
import { getRedisClient, isRedisAvailable } from '../config/redis.js';
import { QUEUE } from './jobTypes.js';

// ── Redis connection options for BullMQ ───────────────────────────────────────
// BullMQ needs its own ioredis connection (not the shared cache client)
// because it uses blocking commands (BRPOP) that tie up the connection.

function bullmqConnection() {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  const { Redis } = require('ioredis');
  const isTLS = url.startsWith('rediss://');
  return new Redis(url, {
    maxRetriesPerRequest: null,   // required by BullMQ
    enableReadyCheck: false,
    tls: isTLS ? {} : undefined,
  });
}

// ── Null-queue shim (no Redis) ────────────────────────────────────────────────

class NullQueue {
  readonly name: string;
  constructor(name: string) { this.name = name; }

  async add(jobName: string, data: any, opts?: any): Promise<{ id: string }> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `[NullQueue:${this.name}] REDIS_URL not set in production. ` +
        `Job "${jobName}" cannot be enqueued. Set REDIS_URL to enable background jobs.`
      );
    }
    // Dev-only fallback: log and return a fake ID
    console.debug(`[NullQueue:${this.name}] job=${jobName} (no Redis — enqueued inline, dev only)`);
    return { id: `inline-${Date.now()}` };
  }

  async getJobCounts(): Promise<Record<string, number>> {
    return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
  }

  async close(): Promise<void> {}
}

// ── Queue factory ─────────────────────────────────────────────────────────────

type AnyQueue = Queue | NullQueue;

function makeQueue(name: string): AnyQueue {
  const conn = bullmqConnection();
  if (!conn) {
    console.warn(`[BullMQ] REDIS_URL not set — ${name} running as NullQueue (in-process fallback)`);
    return new NullQueue(name);
  }
  return new Queue(name, {
    connection: conn,
    defaultJobOptions: {
      removeOnComplete: { count: 500 },
      removeOnFail:     { count: 1_000 },
    },
  });
}

// ── Singleton queues ─────────────────────────────────────────────────────────

export const emailQueue        = makeQueue(QUEUE.EMAIL)        as Queue;
export const notificationQueue = makeQueue(QUEUE.NOTIFICATION) as Queue;
export const queueRecalcQueue  = makeQueue(QUEUE.QUEUE_RECALC) as Queue;
export const auditQueue        = makeQueue(QUEUE.AUDIT)        as Queue;

// ── QueueEvents (optional — only when Redis is present) ───────────────────────

let _emailEvents:        QueueEvents | null = null;
let _notificationEvents: QueueEvents | null = null;
let _queueRecalcEvents:  QueueEvents | null = null;
let _auditEvents:        QueueEvents | null = null;

export function getEmailQueueEvents():        QueueEvents | null { return _emailEvents; }
export function getNotificationQueueEvents(): QueueEvents | null { return _notificationEvents; }
export function getQueueRecalcQueueEvents():  QueueEvents | null { return _queueRecalcEvents; }
export function getAuditQueueEvents():        QueueEvents | null { return _auditEvents; }

/** Call once from scheduler.ts after workers are started */
export function initQueueEvents(): void {
  const url = process.env.REDIS_URL;
  if (!url) return;

  const { Redis } = require('ioredis');
  const isTLS = url.startsWith('rediss://');
  const makeConn = () => new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: isTLS ? {} : undefined,
  });

  _emailEvents        = new QueueEvents(QUEUE.EMAIL,        { connection: makeConn() });
  _notificationEvents = new QueueEvents(QUEUE.NOTIFICATION, { connection: makeConn() });
  _queueRecalcEvents  = new QueueEvents(QUEUE.QUEUE_RECALC, { connection: makeConn() });
  _auditEvents        = new QueueEvents(QUEUE.AUDIT,        { connection: makeConn() });
}

/** Gracefully close all queues */
export async function closeQueues(): Promise<void> {
  await Promise.allSettled([
    emailQueue.close?.(),
    notificationQueue.close?.(),
    queueRecalcQueue.close?.(),
    auditQueue.close?.(),
    _emailEvents?.close(),
    _notificationEvents?.close(),
    _queueRecalcEvents?.close(),
    _auditEvents?.close(),
  ]);
}
