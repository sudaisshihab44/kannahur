/**
 * api/jobs/dlq.ts
 *
 * Dead Letter Queue handler.
 *
 * BullMQ's "failed" set acts as the DLQ: after all retry attempts are
 * exhausted a job lands there permanently.
 *
 * This module:
 *   1. Attaches `failed` event listeners to every QueueEvents instance.
 *   2. Logs the failure with context (queue, job name, error, attempt count).
 *   3. Optionally alerts via console.error / a webhook (swap in PagerDuty,
 *      Slack, SNS, etc. by replacing `alertDlq`).
 *   4. Exports `drainDlq(queueName)` — useful for an admin endpoint that
 *      retries or discards all failed jobs.
 */
import { Queue, QueueEvents } from 'bullmq';
import type { QueueName } from './jobTypes.js';

// ── Alert sink (override in production) ──────────────────────────────────────

async function alertDlq(payload: {
  queue:     QueueName;
  jobId:     string;
  jobName:   string;
  attempt:   number;
  error:     string;
  data:      any;
}): Promise<void> {
  // Simple console alert — replace with Slack webhook, PagerDuty, SNS, etc.
  console.error(
    `[DLQ] ⚠️  Job permanently failed\n` +
    `  Queue   : ${payload.queue}\n` +
    `  Job     : ${payload.jobName} (id=${payload.jobId})\n` +
    `  Attempt : ${payload.attempt}\n` +
    `  Error   : ${payload.error}\n` +
    `  Payload : ${JSON.stringify(payload.data).slice(0, 200)}`
  );

  // TODO: POST to Slack webhook
  // const SLACK_WEBHOOK = process.env.SLACK_DLQ_WEBHOOK;
  // if (SLACK_WEBHOOK) await fetch(SLACK_WEBHOOK, { method: 'POST', body: JSON.stringify({ text: ... }) });
}

// ── Event listener attachment ─────────────────────────────────────────────────

/**
 * Attach failed-job event listeners to all QueueEvents instances.
 * Call once from scheduler.ts after workers are started.
 */
export function attachDlqListeners(
  listeners: Array<{ queueName: QueueName; events: QueueEvents; queue: Queue }>
): void {
  for (const { queueName, events, queue } of listeners) {
    events.on('failed', async ({ jobId, failedReason, prev }) => {
      try {
        const job = await queue.getJob(jobId);
        if (!job) return;

        // Only alert when all attempts are exhausted (no more retries)
        const maxAttempts = job.opts?.attempts ?? 1;
        const attemptsMade = job.attemptsMade ?? 0;
        if (attemptsMade < maxAttempts) return; // still has retries left

        await alertDlq({
          queue:   queueName,
          jobId,
          jobName: job.name,
          attempt: attemptsMade,
          error:   failedReason || 'Unknown error',
          data:    job.data,
        });
      } catch (err) {
        // DLQ handler must never throw
        console.error('[DLQ] alertDlq threw:', err);
      }
    });

    console.log(`[DLQ] Listening on queue: ${queueName}`);
  }
}

// ── Management helpers ────────────────────────────────────────────────────────

/**
 * Return counts of failed jobs per queue.
 * Used by the /api/jobs/stats monitoring endpoint.
 */
export async function getDlqStats(queues: Array<{ name: QueueName; queue: Queue }>):
  Promise<Array<{ queue: QueueName; failedCount: number }>> {
  return Promise.all(
    queues.map(async ({ name, queue }) => ({
      queue: name,
      failedCount: await queue.getFailedCount(),
    }))
  );
}

/**
 * Retry all failed jobs in a given queue.
 * Returns the number of jobs retried.
 */
export async function retryFailedJobs(queue: Queue, limit = 100): Promise<number> {
  const failed = await queue.getFailed(0, limit - 1);
  await Promise.allSettled(failed.map(j => j.retry()));
  return failed.length;
}

/**
 * Discard (permanently delete) all failed jobs in a given queue.
 */
export async function discardFailedJobs(queue: Queue, limit = 100): Promise<number> {
  const failed = await queue.getFailed(0, limit - 1);
  await Promise.allSettled(failed.map(j => j.remove()));
  return failed.length;
}
