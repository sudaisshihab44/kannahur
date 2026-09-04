/**
 * api/jobs/scheduler.ts
 *
 * Starts all BullMQ workers and attaches DLQ listeners.
 * Returns a shutdown function for graceful teardown.
 *
 * Usage (in server.ts):
 *   import { startWorkers } from './api/jobs/scheduler.js';
 *   const stopWorkers = await startWorkers();
 *   // on SIGTERM:
 *   await stopWorkers();
 *
 * When REDIS_URL is not set, workers are not started
 * (jobs fall back to in-process execution via NullQueue).
 */
import type { Worker } from 'bullmq';
import { createEmailWorker }        from './workers/emailWorker.js';
import { createNotificationWorker } from './workers/notificationWorker.js';
import { createQueueRecalcWorker }  from './workers/queueRecalcWorker.js';
import { createAuditWorker }        from './workers/auditWorker.js';
import {
  emailQueue, notificationQueue, queueRecalcQueue, auditQueue,
  initQueueEvents,
  getEmailQueueEvents, getNotificationQueueEvents,
  getQueueRecalcQueueEvents, getAuditQueueEvents,
  closeQueues,
} from './queues.js';
import { attachDlqListeners } from './dlq.js';
import { QUEUE } from './jobTypes.js';

let workers: Worker[] = [];
let started = false;

/**
 * Build a fresh ioredis connection for BullMQ workers.
 * Each worker must have its own connection because BullMQ uses blocking commands.
 */
function makeWorkerConnection() {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  const { Redis } = require('ioredis');
  const isTLS = url.startsWith('rediss://');
  return new Redis(url, {
    maxRetriesPerRequest: null,  // required by BullMQ
    enableReadyCheck: false,
    tls: isTLS ? {} : undefined,
    retryStrategy: (times: number) => {
      if (times > 5) return null;
      return Math.min(times * 500, 10_000);
    },
  });
}

/**
 * Start all background workers.
 * Safe to call multiple times — will not start duplicate workers.
 * Returns a shutdown callback.
 */
export async function startWorkers(): Promise<() => Promise<void>> {
  if (started) {
    console.log('[Scheduler] Workers already running — skipping duplicate start.');
    return stopWorkers;
  }

  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn(
      '[Scheduler] REDIS_URL not set — BullMQ workers NOT started. ' +
      'Jobs will execute in-process (NullQueue fallback).'
    );
    return async () => {};
  }

  console.log('[Scheduler] Starting BullMQ workers…');

  // Each worker gets its own dedicated Redis connection
  const emailConn        = makeWorkerConnection();
  const notifConn        = makeWorkerConnection();
  const recalcConn       = makeWorkerConnection();
  const auditConn        = makeWorkerConnection();

  workers = [
    createEmailWorker(emailConn),
    createNotificationWorker(notifConn),
    createQueueRecalcWorker(recalcConn),
    createAuditWorker(auditConn),
  ];

  // Attach cross-cutting event handlers
  for (const w of workers) {
    w.on('completed', job => {
      console.log(`[Worker:${w.name}] ✓ ${job.name} id=${job.id}`);
    });

    w.on('failed', (job, err) => {
      console.error(
        `[Worker:${w.name}] ✗ ${job?.name ?? '?'} id=${job?.id ?? '?'} ` +
        `attempt=${job?.attemptsMade ?? '?'} — ${err.message}`
      );
    });

    w.on('error', err => {
      console.error(`[Worker:${w.name}] Worker error:`, err.message);
    });
  }

  // Initialise QueueEvents and attach DLQ listeners
  initQueueEvents();

  const emailEvents        = getEmailQueueEvents();
  const notifEvents        = getNotificationQueueEvents();
  const recalcEvents       = getQueueRecalcQueueEvents();
  const auditEvents        = getAuditQueueEvents();

  if (emailEvents && notifEvents && recalcEvents && auditEvents) {
    attachDlqListeners([
      { queueName: QUEUE.EMAIL,        events: emailEvents,   queue: emailQueue        as any },
      { queueName: QUEUE.NOTIFICATION, events: notifEvents,   queue: notificationQueue as any },
      { queueName: QUEUE.QUEUE_RECALC, events: recalcEvents,  queue: queueRecalcQueue  as any },
      { queueName: QUEUE.AUDIT,        events: auditEvents,   queue: auditQueue        as any },
    ]);
  }

  started = true;
  console.log(`[Scheduler] ✓ ${workers.length} workers started.`);
  return stopWorkers;
}

/**
 * Gracefully shut down all workers and close all queue connections.
 */
async function stopWorkers(): Promise<void> {
  console.log('[Scheduler] Shutting down workers…');
  await Promise.allSettled(workers.map(w => w.close()));
  await closeQueues();
  workers = [];
  started = false;
  console.log('[Scheduler] All workers stopped.');
}

/**
 * Return high-level worker health info (for /api/jobs/stats).
 */
export function getWorkerStatus(): Array<{ name: string; running: boolean; concurrency: number }> {
  return workers.map(w => ({
    name:        w.name,
    running:     !w.closing,
    concurrency: (w as any).opts?.concurrency ?? 1,
  }));
}
