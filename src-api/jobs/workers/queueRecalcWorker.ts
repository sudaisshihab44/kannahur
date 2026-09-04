/**
 * api/jobs/workers/queueRecalcWorker.ts
 *
 * Processes queue recalculation jobs from iq:queue-recalc.
 *
 * Design decisions:
 *   - Job ID is `recalc:<departmentId>` — BullMQ deduplicates by jobId so
 *     multiple simultaneous token actions on the same department collapse
 *     into a single recalculation, preventing stampedes.
 *   - The worker calls the same recalculateQueueWaitTimes() that was
 *     called inline before, so all notification logic (WhatsApp, "2 ahead")
 *     is still executed — just asynchronously and with retry support.
 *   - Concurrency is 1 to prevent concurrent recalculations on the same
 *     data corrupting wait-time estimates.
 */
import { Worker, type Job } from 'bullmq';
import { recalculateQueueWaitTimes, notifyTwoAheadPatients } from '../../services/queueService.js';
import { sendEmail } from '../../services/emailService.js';
import { QUEUE, JOB } from '../jobTypes.js';
import type { RecalculateQueuePayload } from '../jobTypes.js';
import { invalidateDataCache } from '../../controllers/dataController.js';
import { invalidateQueueCache } from '../../cache/queueStatus.js';
import { invalidateDashboardCache } from '../../cache/dashboardCache.js';

async function processRecalculate(data: RecalculateQueuePayload): Promise<void> {
  // Full queue recalculation (updates wait times, sends WhatsApp notifications)
  await recalculateQueueWaitTimes();

  // "2 patients ahead" email notification for the affected department
  await notifyTwoAheadPatients(data.departmentId, sendEmail);

  // Cache invalidation
  await Promise.all([
    invalidateDataCache(),
    invalidateQueueCache(),
    invalidateDashboardCache(),
  ]);

  console.log(
    `[queueRecalcWorker] Completed recalc for dept=${data.departmentId} ` +
    `trigger=${data.triggeredBy} token=${data.tokenId}`
  );
}

// ── Worker factory ────────────────────────────────────────────────────────────

export function createQueueRecalcWorker(connection: any): Worker {
  return new Worker(
    QUEUE.QUEUE_RECALC,
    async (job: Job) => {
      switch (job.name) {
        case JOB.RECALCULATE_QUEUE:
          return processRecalculate(job.data as RecalculateQueuePayload);
        default:
          throw new Error(`[queueRecalcWorker] Unknown job name: ${job.name}`);
      }
    },
    {
      connection,
      // Single concurrency: recalculations must not overlap
      concurrency: 1,
    }
  );
}
