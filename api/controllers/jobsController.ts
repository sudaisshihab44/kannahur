/**
 * api/controllers/jobsController.ts
 *
 * GET  /api/jobs/stats          — queue depth + worker status for all queues
 * POST /api/jobs/:queue/retry   — retry all failed jobs in a queue (admin only)
 * POST /api/jobs/:queue/discard — discard all failed jobs in a queue (admin only)
 *
 * These endpoints require REDIS_URL to be set.
 * When Redis is unavailable every count returns 0 and workers shows empty.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  emailQueue, notificationQueue, queueRecalcQueue, auditQueue,
} from '../jobs/queues.js';
import { QUEUE } from '../jobs/jobTypes.js';
import { getDlqStats, retryFailedJobs, discardFailedJobs } from '../jobs/dlq.js';
import { getWorkerStatus } from '../jobs/scheduler.js';
import { isRedisAvailable } from '../config/redis.js';

// Map queue-name slug to Queue instance
const QUEUE_MAP: Record<string, any> = {
  email:        emailQueue,
  notification: notificationQueue,
  'queue-recalc': queueRecalcQueue,
  audit:        auditQueue,
};

// ── GET /api/jobs/stats ───────────────────────────────────────────────────────

export async function getJobStatsHandler(
  req: VercelRequest, res: VercelResponse
): Promise<void> {
  const redisUp = isRedisAvailable();

  if (!redisUp) {
    res.status(200).json({
      success: true,
      redisAvailable: false,
      message: 'REDIS_URL not set — BullMQ running in NullQueue (in-process) mode.',
      queues: [],
      workers: [],
    });
    return;
  }

  try {
    // Collect per-queue job counts in parallel
    const [emailCounts, notifCounts, recalcCounts, auditCounts] = await Promise.all([
      emailQueue.getJobCounts(),
      notificationQueue.getJobCounts(),
      queueRecalcQueue.getJobCounts(),
      auditQueue.getJobCounts(),
    ]);

    const dlqStats = await getDlqStats([
      { name: QUEUE.EMAIL,        queue: emailQueue        as any },
      { name: QUEUE.NOTIFICATION, queue: notificationQueue as any },
      { name: QUEUE.QUEUE_RECALC, queue: queueRecalcQueue  as any },
      { name: QUEUE.AUDIT,        queue: auditQueue        as any },
    ]);

    const queues = [
      { name: QUEUE.EMAIL,        slug: 'email',        counts: emailCounts  },
      { name: QUEUE.NOTIFICATION, slug: 'notification', counts: notifCounts  },
      { name: QUEUE.QUEUE_RECALC, slug: 'queue-recalc', counts: recalcCounts },
      { name: QUEUE.AUDIT,        slug: 'audit',        counts: auditCounts  },
    ].map((q) => {
      const dlq = dlqStats.find((d) => d.queue === q.name);
      return {
        name:         q.name,
        slug:         q.slug,
        waiting:      q.counts.waiting    ?? 0,
        active:       q.counts.active     ?? 0,
        completed:    q.counts.completed  ?? 0,
        failed:       q.counts.failed     ?? 0,
        delayed:      q.counts.delayed    ?? 0,
        dlqCount:     dlq?.failedCount    ?? 0,
        paused:       q.counts.paused     ?? 0,
      };
    });

    res.status(200).json({
      success:        true,
      redisAvailable: true,
      timestamp:      new Date().toISOString(),
      queues,
      workers:        getWorkerStatus(),
      totals: {
        waiting:   queues.reduce((s, q) => s + q.waiting,   0),
        active:    queues.reduce((s, q) => s + q.active,    0),
        failed:    queues.reduce((s, q) => s + q.failed,    0),
        completed: queues.reduce((s, q) => s + q.completed, 0),
      },
    });
  } catch (err: any) {
    console.error('[jobsController] getJobStats error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

// ── POST /api/jobs/:queue/retry ───────────────────────────────────────────────

export async function retryQueueHandler(
  req: VercelRequest, res: VercelResponse, queueSlug: string
): Promise<void> {
  const queue = QUEUE_MAP[queueSlug];
  if (!queue) {
    res.status(404).json({ success: false, message: `Unknown queue: ${queueSlug}` });
    return;
  }
  if (!isRedisAvailable()) {
    res.status(503).json({ success: false, message: 'Redis not available' });
    return;
  }
  try {
    const count = await retryFailedJobs(queue);
    res.status(200).json({ success: true, retriedCount: count });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// ── POST /api/jobs/:queue/discard ─────────────────────────────────────────────

export async function discardQueueHandler(
  req: VercelRequest, res: VercelResponse, queueSlug: string
): Promise<void> {
  const queue = QUEUE_MAP[queueSlug];
  if (!queue) {
    res.status(404).json({ success: false, message: `Unknown queue: ${queueSlug}` });
    return;
  }
  if (!isRedisAvailable()) {
    res.status(503).json({ success: false, message: 'Redis not available' });
    return;
  }
  try {
    const count = await discardFailedJobs(queue);
    res.status(200).json({ success: true, discardedCount: count });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}
