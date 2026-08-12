/**
 * api/jobs/workers/auditWorker.ts
 *
 * Processes audit-log writes from the iq:audit queue.
 *
 * Audit logs are fire-and-forget: 1 attempt, never retried.
 * Writing them async means the HTTP response is not blocked by a
 * Supabase INSERT that the user doesn't need to wait for.
 */
import { Worker, type Job } from 'bullmq';
import { insertQueueLog, insertNotificationLog } from '../../repositories/settingsRepository.js';
import { QUEUE, JOB } from '../jobTypes.js';
import type { WriteQueueLogPayload, WriteNotificationLogPayload } from '../jobTypes.js';

async function processQueueLog(data: WriteQueueLogPayload): Promise<void> {
  await insertQueueLog({
    id:           data.id,
    token_id:     data.token_id,
    token_number: data.token_number,
    action:       data.action,
    user_id:      data.user_id,
    timestamp:    data.timestamp,
  });
}

async function processNotificationLog(data: WriteNotificationLogPayload): Promise<void> {
  await insertNotificationLog({
    id:             data.id,
    token_id:       data.token_id,
    token_number:   data.token_number,
    patient_name:   data.patient_name,
    patient_mobile: data.patient_mobile,
    message:        data.message,
    type:           data.type,
    status:         data.status,
    timestamp:      data.timestamp,
  });
}

// ── Worker factory ────────────────────────────────────────────────────────────

export function createAuditWorker(connection: any): Worker {
  return new Worker(
    QUEUE.AUDIT,
    async (job: Job) => {
      switch (job.name) {
        case JOB.WRITE_QUEUE_LOG:
          return processQueueLog(job.data as WriteQueueLogPayload);
        case JOB.WRITE_NOTIFICATION_LOG:
          return processNotificationLog(job.data as WriteNotificationLogPayload);
        default:
          throw new Error(`[auditWorker] Unknown job name: ${job.name}`);
      }
    },
    {
      connection,
      concurrency: 10,  // audit writes are pure inserts — high concurrency is fine
    }
  );
}
