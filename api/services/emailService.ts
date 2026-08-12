/**
 * api/services/emailService.ts
 *
 * Email notification service using Nodemailer + Gmail SMTP.
 * Logs every send to whatsapp_logs for audit trail.
 */
import nodemailer from 'nodemailer';
import { insertNotificationLog } from '../repositories/settingsRepository.js';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

/**
 * Send an email to a patient with queue tracking link.
 * Logs send attempt to notification logs.
 */
export async function sendEmail(
  patientEmail: string,
  patientName: string,
  tokenNumber: string,
  departmentName: string,
  doctorName: string,
  customMessage: string,
  tokenId: string,
  expectedConsultTime?: string
) {
  const trackingUrl = `${process.env.APP_URL || 'https://localhost:3000'}/?tracker=${tokenNumber}`;

  let expectedTimeHtml = '';
  if (expectedConsultTime) {
    const d = new Date(expectedConsultTime);
    const dateFormatted = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeFormatted = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    expectedTimeHtml = `<p style="margin:0 0 12px;color:#1e40af;font-size:14px"><strong>Expected Consult:</strong> ${dateFormatted} • ${timeFormatted}</p>`;
  }

  try {
    await transporter.sendMail({
      from: `"InclusyQ Hospital" <${process.env.GMAIL_USER}>`,
      to: patientEmail,
      subject: `Your Queue Number: ${tokenNumber}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
          <h2 style="color:#16a34a;margin:0 0 16px">🏥 InclusyQ Queue Confirmation</h2>
          <p style="margin:0 0 8px">Hello <strong>${patientName}</strong>,</p>
          <p style="margin:0 0 16px">Your queue number for <strong>${departmentName}</strong> is <strong style="font-size:1.4em;color:#1d4ed8">${tokenNumber}</strong>, with Dr. ${doctorName}.</p>
          ${expectedTimeHtml}
          <p style="margin:0 0 16px;color:#374151">${customMessage}</p>
          <a href="${trackingUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-bottom:24px">📍 Track My Queue Live</a>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
          <p style="color:#9ca3af;font-size:12px;margin:0">Thank you for your patience — InclusyQ Hospital Queue System</p>
        </div>
      `,
    });

    // Log successful send (reusing whatsapp_logs table for email audit)
    await insertNotificationLog({
      token_id: tokenId,
      type: 'email_token_created',
      patient_mobile: patientEmail, // repurposed column
      message: customMessage,
      status: 'sent',
    });
  } catch (err: any) {
    console.error('[EmailService] Send failed:', err);
    throw err;
  }
}
