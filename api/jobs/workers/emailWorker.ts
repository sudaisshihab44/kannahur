/**
 * api/jobs/workers/emailWorker.ts
 *
 * Processes email jobs from the iq:email queue.
 *
 * Job types handled:
 *   send-token-confirmation  — sent when a new token is created
 *   send-your-turn           — sent when a token is called
 *   send-two-ahead           — sent when patient is 2 spots from consultation
 *
 * Retry strategy: 3 attempts, exponential back-off (5 s, 10 s, 20 s).
 * After all retries the job lands in the failed set (DLQ handler picks it up).
 */
import { Worker, type Job } from 'bullmq';
import nodemailer from 'nodemailer';
import { insertNotificationLog } from '../../repositories/settingsRepository.js';
import { QUEUE, JOB } from '../jobTypes.js';
import type {
  SendTokenConfirmationPayload,
  SendYourTurnPayload,
  SendTwoAheadPayload,
} from '../jobTypes.js';

// ── Nodemailer transporter ────────────────────────────────────────────────────

let _transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  return _transporter;
}

const APP_URL = () => process.env.APP_URL || 'http://localhost:3000';

// ── HTML helpers ──────────────────────────────────────────────────────────────

function wrapHtml(body: string): string {
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px;
                border:1px solid #e5e7eb;border-radius:12px">
      ${body}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
      <p style="color:#9ca3af;font-size:12px;margin:0">
        InclusyQ Hospital Queue System
      </p>
    </div>`;
}

function formatTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' • ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  );
}

// ── Processors ────────────────────────────────────────────────────────────────

async function processTokenConfirmation(data: SendTokenConfirmationPayload) {
  const trackingUrl = `${APP_URL()}/?tracker=${data.tokenNumber}`;
  const expectedHtml = data.expectedConsultTime
    ? `<p style="margin:0 0 12px;color:#1e40af;font-size:14px">
         <strong>Expected Consult:</strong> ${formatTime(data.expectedConsultTime)}
       </p>`
    : '';

  await getTransporter().sendMail({
    from: `"InclusyQ Hospital" <${process.env.GMAIL_USER}>`,
    to: data.patientEmail,
    subject: `Your Queue Number: ${data.tokenNumber}`,
    html: wrapHtml(`
      <h2 style="color:#16a34a;margin:0 0 16px">🏥 InclusyQ Queue Confirmation</h2>
      <p style="margin:0 0 8px">Hello <strong>${data.patientName}</strong>,</p>
      <p style="margin:0 0 16px">
        Your queue number for <strong>${data.departmentName}</strong> is
        <strong style="font-size:1.4em;color:#1d4ed8">${data.tokenNumber}</strong>,
        with Dr. ${data.doctorName}.
      </p>
      ${expectedHtml}
      <p style="margin:0 0 16px;color:#374151">${data.customMessage}</p>
      <a href="${trackingUrl}"
         style="display:inline-block;background:#16a34a;color:#fff;padding:12px 24px;
                border-radius:8px;text-decoration:none;font-weight:600;margin-bottom:24px">
        📍 Track My Queue Live
      </a>`),
  });

  await insertNotificationLog({
    token_id: data.tokenId,
    type: 'email_token_created',
    patient_mobile: data.patientEmail,
    message: data.customMessage,
    status: 'sent',
    timestamp: new Date().toISOString(),
  });
}

async function processYourTurn(data: SendYourTurnPayload) {
  const msg = `It's your turn now! Please proceed to ${data.roomLabel} to see Dr. ${data.doctorName}.`;

  await getTransporter().sendMail({
    from: `"InclusyQ Hospital" <${process.env.GMAIL_USER}>`,
    to: data.patientEmail,
    subject: `🔔 It's Your Turn — Token ${data.tokenNumber}`,
    html: wrapHtml(`
      <h2 style="color:#16a34a;margin:0 0 16px">🔔 It's Your Turn!</h2>
      <p style="margin:0 0 8px">Hello <strong>${data.patientName}</strong>,</p>
      <p style="margin:0 0 16px;font-size:1.1em">
        Please proceed to <strong>${data.roomLabel}</strong> now.
      </p>
      <p style="margin:0 0 16px;color:#374151">Your token: <strong>${data.tokenNumber}</strong></p>`),
  });

  await insertNotificationLog({
    token_id: data.tokenId,
    type: 'email_your_turn',
    patient_mobile: data.patientEmail,
    message: msg,
    status: 'sent',
    timestamp: new Date().toISOString(),
  });
}

async function processTwoAhead(data: SendTwoAheadPayload) {
  const msg =
    `Only 2 patients ahead of you. Please move near ${data.departmentName}. ` +
    `Est. wait: ~${data.estimatedWaitMins} mins.`;

  await getTransporter().sendMail({
    from: `"InclusyQ Hospital" <${process.env.GMAIL_USER}>`,
    to: data.patientEmail,
    subject: `⏳ Almost Your Turn — Token ${data.tokenNumber}`,
    html: wrapHtml(`
      <h2 style="color:#d97706;margin:0 0 16px">⏳ Almost Your Turn</h2>
      <p style="margin:0 0 8px">Hello <strong>${data.patientName}</strong>,</p>
      <p style="margin:0 0 16px">
        Only <strong>2 patients</strong> remain before your consultation.
      </p>
      <p style="margin:0 0 16px;color:#374151">
        Please move near the <strong>${data.departmentName}</strong> area now.<br>
        Estimated wait: <strong>~${data.estimatedWaitMins} mins</strong>
      </p>`),
  });

  await insertNotificationLog({
    token_id: data.tokenId,
    type: 'email_two_ahead',
    patient_mobile: data.patientEmail,
    message: msg,
    status: 'sent',
    timestamp: new Date().toISOString(),
  });
}

// ── Worker factory ────────────────────────────────────────────────────────────

export function createEmailWorker(connection: any): Worker {
  return new Worker(
    QUEUE.EMAIL,
    async (job: Job) => {
      switch (job.name) {
        case JOB.SEND_TOKEN_CONFIRMATION:
          return processTokenConfirmation(job.data as SendTokenConfirmationPayload);
        case JOB.SEND_YOUR_TURN:
          return processYourTurn(job.data as SendYourTurnPayload);
        case JOB.SEND_TWO_AHEAD:
          return processTwoAhead(job.data as SendTwoAheadPayload);
        default:
          throw new Error(`[emailWorker] Unknown job name: ${job.name}`);
      }
    },
    {
      connection,
      concurrency: 3,           // 3 emails in parallel
      limiter: {
        max: 10,                // max 10 emails
        duration: 1_000,        // per 1 second (Gmail rate limit safety)
      },
    }
  );
}
