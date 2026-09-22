/**
 * api/jobs/workers/notificationWorker.ts
 *
 * Processes WhatsApp / SMS notification jobs from the iq:notification queue.
 *
 * Currently the WhatsApp API is a stub (logs only).
 * Swap `sendWhatsAppApi` below for your real provider (e.g. Twilio, Meta,
 * WhatsApp Business API) without touching the rest of the system.
 *
 * Job types handled:
 *   notify-welcome         — new token created, welcome message
 *   notify-update          — wait time updated by ≥ threshold
 *   notify-two-remaining   — 2 patients ahead
 *   notify-your-turn       — patient is being called now
 */
import { Worker, type Job } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { insertNotificationLog } from '../../repositories/settingsRepository.js';
import { QUEUE, JOB } from '../jobTypes.js';
import type {
  NotifyWelcomePayload,
  NotifyUpdatePayload,
  NotifyTwoRemainingPayload,
  NotifyYourTurnPayload,
} from '../jobTypes.js';

// ── WhatsApp provider stub ────────────────────────────────────────────────────
// Replace this function body with your real WhatsApp API call.

async function sendWhatsAppApi(
  mobile: string,
  message: string,
  type: string
): Promise<void> {
  // TODO: integrate real WhatsApp Business API / Twilio / other provider
  console.log(`[WhatsApp:${type.toUpperCase()}] To: ${mobile}`);
  console.log(`  ${message.split('\n')[0]}…`);
  // Real implementation example (Twilio):
  // await twilioClient.messages.create({ to: `whatsapp:${mobile}`, from: ..., body: message });
}

// ── Processors ────────────────────────────────────────────────────────────────

async function processWelcome(data: NotifyWelcomePayload): Promise<void> {
  const msg = [
    `🏥 Welcome to ${data.hospitalName}`,
    `Hello ${data.patientName}`,
    `Your Token: ${data.tokenNumber}`,
    `Department: ${data.departmentName}`,
    `Patients Ahead: ${data.patientsAhead}`,
    `Est. Wait: ${data.estimatedWaitMins} mins`,
    `Expected Time: ${data.expectedTime}`,
    `Track: ${data.trackerLink}`,
  ].join('\n\n');

  await sendWhatsAppApi(data.patientMobile, msg, 'welcome');
  await logNotification(data.tokenId, data.tokenNumber, data.patientName, data.patientMobile, msg, 'welcome');
}

async function processUpdate(data: NotifyUpdatePayload): Promise<void> {
  const msg = [
    'Queue Update',
    `Revised estimated waiting time: ${data.estimatedWaitMins} mins`,
    `Expected consultation: ${data.expectedTime}`,
    `Track live: ${data.trackerLink}`,
  ].join('\n\n');

  await sendWhatsAppApi(data.patientMobile, msg, 'update');
  await logNotification(data.tokenId, data.tokenNumber, '', data.patientMobile, msg, 'update');
}

async function processTwoRemaining(data: NotifyTwoRemainingPayload): Promise<void> {
  const msg = 'Only 2 patients remain before your consultation.\n\nPlease proceed near the consultation room.';

  await sendWhatsAppApi(data.patientMobile, msg, 'two_remaining');
  await logNotification(data.tokenId, data.tokenNumber, data.patientName, data.patientMobile, msg, 'two_remaining');
}

async function processYourTurn(data: NotifyYourTurnPayload): Promise<void> {
  const msg = `It is now your turn.\n\nPlease proceed to ${data.roomLabel}.`;

  await sendWhatsAppApi(data.patientMobile, msg, 'your_turn');
  await logNotification(data.tokenId, data.tokenNumber, data.patientName, data.patientMobile, msg, 'your_turn');
}

async function logNotification(
  tokenId: string,
  tokenNumber: string,
  patientName: string,
  patientMobile: string,
  message: string,
  type: string
): Promise<void> {
  await insertNotificationLog({
    id: `wa-${uuidv4()}`,
    token_id: tokenId,
    token_number: tokenNumber,
    patient_name: patientName,
    patient_mobile: patientMobile,
    message,
    type,
    timestamp: new Date().toISOString(),
  });
}

// ── Worker factory ────────────────────────────────────────────────────────────

export function createNotificationWorker(connection: any): Worker {
  return new Worker(
    QUEUE.NOTIFICATION,
    async (job: Job) => {
      switch (job.name) {
        case JOB.NOTIFY_WELCOME:        return processWelcome(job.data as NotifyWelcomePayload);
        case JOB.NOTIFY_UPDATE:         return processUpdate(job.data as NotifyUpdatePayload);
        case JOB.NOTIFY_TWO_REMAINING:  return processTwoRemaining(job.data as NotifyTwoRemainingPayload);
        case JOB.NOTIFY_YOUR_TURN:      return processYourTurn(job.data as NotifyYourTurnPayload);
        default:
          throw new Error(`[notificationWorker] Unknown job name: ${job.name}`);
      }
    },
    {
      connection,
      concurrency: 5,   // notifications are cheap — high concurrency
    }
  );
}
