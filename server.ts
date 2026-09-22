/**
 * server.ts — LOCAL DEVELOPMENT ONLY
 *
 * This file is used exclusively when running `npm run dev` locally.
 * On Vercel, all traffic is handled by the individual serverless functions
 * under /api/*.  This file is NOT deployed to Vercel.
 *
 * The Express app exported here is kept so that the local dev workflow
 * (tsx server.ts → Vite middleware + Express on :3000) continues to work
 * without any changes to the developer experience.
 */
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import multer from "multer";
import nodemailer from "nodemailer";
import {
  TokenStatus, UserRole, Gender, DeviceStatus,
  Token, Department, Doctor, ReceptionUser, QueueSettings,
  Patient, ConsultationRoom, QueueLog, TrackingDevice
} from "./src/types.js";

// Load .env.local before importing supabaseServer
dotenv.config({ path: ".env.local" });

import { supabase } from "./src/lib/supabaseServer.js";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { cacheManager } from "./src-api/utils/redisCache.js";
import { sanitizeObject, sanitizeUser, sanitizeError } from "./src-api/utils/sanitization.js";
import { validateTextLength, validatePhoneNumber, sanitizeString } from "./src-api/utils/validation.js";

// ── Monitoring bootstrap ──────────────────────────────────────────────────────
// Must happen before any request is served so Sentry catches startup errors.
import { initSentry } from './src-api/monitoring/sentry.js';
initSentry();

// ============================================================
// Row Mappers  (DB snake_case → TypeScript camelCase)
// ============================================================

function mapDept(r: any): Department {
  return {
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    description: r.description,
    isEnabled: r.is_enabled,
    defaultConsultationTime: r.default_consultation_time,
  };
}

function mapDoctor(r: any): Doctor {
  return {
    id: r.id,
    name: r.name,
    departmentId: r.department_id,
    specialization: r.specialization,
    status: r.status,
    roomNumber: r.room_number,
    avgConsultationTime: r.avg_consultation_time,
    startTime: r.start_time,
    endTime: r.end_time,
    maxPatientsPerDay: r.max_patients_per_day,
    isEnabled: r.is_enabled,
  };
}

function mapPatient(r: any): Patient {
  return {
    id: r.id,
    name: r.name,
    mobile: r.mobile,
    email: r.email,
    age: r.age,
    gender: r.gender as Gender,
    createdAt: r.created_at,
  };
}

function mapToken(r: any): Token {
  return {
    id: r.id,
    tokenNumber: r.token_number,
    patientName: r.patient_name,
    patientMobile: r.patient_mobile,
    patientEmail: r.patient_email,
    patientAge: r.patient_age,
    patientGender: r.patient_gender as Gender,
    departmentId: r.department_id,
    departmentName: r.department_name,
    doctorId: r.doctor_id,
    doctorName: r.doctor_name,
    reasonForVisit: r.reason_for_visit,
    status: r.status as TokenStatus,
    createdAt: r.created_at,
    calledAt: r.called_at,
    completedAt: r.completed_at,
    isEmergency: r.is_emergency,
    priority: r.priority,
    notes: r.notes,
    position: r.position,
    estimatedConsultationTime: r.estimated_consultation_time,
    estimatedWaitTime: r.estimated_wait_time,
    expectedConsultationStartTime: r.expected_consultation_start_time,
    lastNotifiedWaitTime: r.last_notified_wait_time,
    notifiedTwoRemaining: r.notified_two_remaining,
    notifiedYourTurn: r.notified_your_turn,
    deviceId: r.device_id,
  };
}

function mapRoom(r: any): ConsultationRoom {
  return {
    id: r.id,
    roomNumber: r.room_number,
    roomName: r.room_name,
    assignedDoctorId: r.assigned_doctor_id,
    departmentId: r.department_id,
    status: r.status,
    displayScreenId: r.display_screen_id,
  };
}

function mapUser(r: any): ReceptionUser {
  return {
    id: r.id,
    username: r.username,
    name: r.name,
    role: r.role as UserRole,
    departmentId: r.department_id,
    assignedDepartmentIds: r.assigned_department_ids || [],
    permissions: r.permissions || [],
    // password intentionally omitted — never expose credentials (SQ-MAJ-004)
    isActive: r.is_active,
  };
}

function mapQueueLog(r: any): QueueLog {
  return {
    id: r.id,
    tokenId: r.token_id,
    tokenNumber: r.token_number,
    action: r.action,
    userId: r.user_id,
    timestamp: r.timestamp,
  };
}

function mapDevice(r: any): TrackingDevice {
  return {
    id: r.id,
    deviceCode: r.device_code,
    name: r.name,
    status: r.status as DeviceStatus,
    assignedTokenId: r.assigned_token_id,
    assignedTokenNumber: r.assigned_token_number,
    batteryLevel: r.battery_level,
    lastSeenAt: r.last_seen_at,
  };
}

function mapSettings(r: any): QueueSettings {
  return {
    isPaused: r.is_paused,
    hospitalInfo: r.hospital_info,
    announcements: r.announcements || [],
    config: r.config,
  };
}

// ============================================================
// Priority helper
// ============================================================

function getPriorityWeight(priority: string | undefined): number {
  if (!priority) return 0;
  switch (priority) {
    case "VIP": return 4;
    case "Person with Disability": return 3;
    case "Pregnant Woman": return 2;
    case "Senior Citizen": return 1;
    default: return 0;
  }
}

// ============================================================
// Dev hardening helpers (SQ-MAJ-004 + SQ-MAJ-001 parity)
// ============================================================

// ponytail: fixed-window limiter on cacheManager; fail-closed on error.
async function devApiRateLimiter(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
      || req.socket?.remoteAddress || "unknown";
    const count = await cacheManager.incr(`ratelimit:dev:${ip}`, 15 * 60);
    if (typeof count !== "number" || count > 100) {
      return res.status(429).json({ success: false, message: "Too many requests. Please try again later." });
    }
    next();
  } catch {
    return res.status(429).json({ success: false, message: "Too many requests. Please try again later." });
  }
}

function genericError(res: express.Response, logPrefix: string, err: any, fallback = "An error occurred. Please try again.") {
  console.error(logPrefix, err?.message || err);
  const sanitized = sanitizeError(err);
  // Never echo raw DB/driver messages — generic user message only.
  return res.status(500).json({ success: false, message: fallback, code: sanitized.code });
}

const DEV_ALLOWED_EXT = [".png", ".jpg", ".jpeg", ".webp"];

function devSafeUploadExt(originalname: string, mimetype: string): string | null {
  const allowedMime = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
  if (!allowedMime.includes(mimetype)) return null;
  const dot = originalname.lastIndexOf(".");
  const ext = (dot >= 0 ? originalname.slice(dot) : "").toLowerCase();
  if (!DEV_ALLOWED_EXT.includes(ext)) return null;
  return ext;
}

function devHasValidMagicBytes(buffer: Buffer, mimetype: string): boolean {
  if (buffer.length < 12) return false;
  if (mimetype === "image/png") {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  if (mimetype === "image/jpeg" || mimetype === "image/jpg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimetype === "image/webp") {
    return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  }
  return false;
}

// ============================================================
// SSE
// ============================================================

let sseClients: any[] = [];

function broadcastUpdate() {
  const payload = { type: "UPDATE", timestamp: new Date().toISOString() };
  sseClients.forEach((client) =>
    client.write(`data: ${JSON.stringify(payload)}\n\n`)
  );
}

// ============================================================
// WhatsApp helper
// ============================================================

async function sendWhatsApp(
  token: Token,
  type: "welcome" | "update" | "two_remaining" | "your_turn",
  messageText: string
) {
  console.log(`[WhatsApp API - ${type.toUpperCase()}] To: ${token.patientMobile} (${token.patientName})`);
  console.log(messageText);
  console.log("------------------------------------------");

  await supabase.from("whatsapp_logs").insert({
    id: `wa-${uuidv4()}`,
    token_id: token.id,
    token_number: token.tokenNumber,
    patient_name: token.patientName,
    patient_mobile: token.patientMobile,
    message: messageText,
    timestamp: new Date().toISOString(),
    type,
  });
}

// ============================================================
// Email helper
// ============================================================

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

async function sendEmail(
  patientEmail: string,
  patientName: string,
  tokenNumber: string,
  departmentName: string,
  doctorName: string,
  customMessage: string,
  tokenId: string,
  expectedConsultTime?: string
) {
  const trackingUrl = `${process.env.APP_URL || "http://localhost:3000"}/?tracker=${tokenNumber}`;
  let expectedTimeHtml = "";
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

    await supabase.from("whatsapp_logs").insert({
      token_id: tokenId,
      type: "email_token_created",
      patient_mobile: patientEmail, // reusing this column for email during testing
      message: customMessage,
      status: "sent",
    });
  } catch (err) {
    console.error("[Email] send failed", err);
  }
}

// ============================================================
// Queue / Audit logging
// ============================================================

async function addQueueLog(
  tokenId: string,
  tokenNumber: string,
  action: string,
  userId?: string
) {
  await supabase.from("queue_logs").insert({
    id: `log-${uuidv4()}`,
    token_id: tokenId,
    token_number: tokenNumber,
    action,
    user_id: userId,
    timestamp: new Date().toISOString(),
  });
}

async function addAuditLog(action: string, detailText: string, userId?: string) {
  await supabase.from("queue_logs").insert({
    id: `log-${uuidv4()}`,
    token_id: "",
    token_number: detailText,
    action,
    user_id: userId,
    timestamp: new Date().toISOString(),
  });
}

// ============================================================
// Recalculate queue wait-times (Supabase-backed)
// ============================================================

async function recalculateQueueWaitTimes() {
  const [{ data: doctorsData }, { data: tokensData }, { data: settingsData }] =
    await Promise.all([
      supabase.from("doctors").select("*"),
      supabase.from("tokens").select("*"),
      supabase.from("settings").select("*").limit(1),
    ]);

  if (!doctorsData || !tokensData) return;

  const doctors = doctorsData.map(mapDoctor);
  const tokens = tokensData.map(mapToken);
  const settingsRow = settingsData?.[0];
  const enableUpdates = settingsRow?.config?.enableWhatsAppUpdates !== false;
  const threshold = settingsRow?.config?.minWaitTimeNotificationThreshold ?? 5;
  const hospitalName =
    settingsRow?.hospital_info?.name || "St. Jude Memorial Hospital";

  // Batch token updates to reduce Supabase round-trips
  const tokenUpdates: Array<{ id: string; updates: Record<string, any> }> = [];

  for (const doc of doctors) {
    const docTokens = tokens.filter((t) => t.doctorId === doc.id);
    const calledToken = docTokens.find((t) => t.status === TokenStatus.CALLED);

    let currentCalledRemaining = 0;
    if (calledToken) {
      const duration =
        calledToken.estimatedConsultationTime || doc.avgConsultationTime || 15;
      const calledAt = calledToken.calledAt
        ? new Date(calledToken.calledAt)
        : new Date();
      const elapsedMins = Math.floor(
        (Date.now() - calledAt.getTime()) / 60000
      );
      currentCalledRemaining = Math.max(0, duration - elapsedMins);

      if (enableUpdates && !calledToken.notifiedYourTurn) {
        const roomNumber = doc.roomNumber || "G-12";
        const msg = `It is now your turn.\n\nPlease proceed to Room ${roomNumber}.`;
        await sendWhatsApp(calledToken, "your_turn", msg);
        tokenUpdates.push({
          id: calledToken.id,
          updates: { notified_your_turn: true },
        });
      }
    }

    const waitingTokens = docTokens
      .filter((t) => t.status === TokenStatus.WAITING)
      .sort((a, b) => {
        const wa = getPriorityWeight(a.priority);
        const wb = getPriorityWeight(b.priority);
        if (wa !== wb) return wb - wa;
        return (
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      });

    let accumulatedWait = currentCalledRemaining;
    for (let i = 0; i < waitingTokens.length; i++) {
      const token = waitingTokens[i];
      const estimatedWaitTime = accumulatedWait;
      const expectedStart = new Date(Date.now() + accumulatedWait * 60000);

      const updates: Record<string, any> = {
        estimated_wait_time: estimatedWaitTime,
        expected_consultation_start_time: expectedStart.toISOString(),
      };

      if (enableUpdates) {
        const trackerLink = `${process.env.APP_URL || "http://localhost:3000"}/?tracker=${token.tokenNumber}`;

        if (
          token.lastNotifiedWaitTime !== undefined &&
          token.lastNotifiedWaitTime !== null
        ) {
          const diff = Math.abs(estimatedWaitTime - token.lastNotifiedWaitTime);
          if (diff >= threshold) {
            const msg = `Queue Update\n\nYour revised estimated waiting time is:\n${estimatedWaitTime} minutes\n\nExpected consultation:\n${expectedStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}\n\nTrack live queue:\n${trackerLink}`;
            await sendWhatsApp(
              { ...token, estimatedWaitTime },
              "update",
              msg
            );
            updates.last_notified_wait_time = estimatedWaitTime;
          }
        } else {
          const welcomeMsg = `🏥 Welcome to ${hospitalName}\n\nHello ${token.patientName}\n\nYour Token:\n${token.tokenNumber}\n\nDepartment:\n${token.departmentName}\n\nPatients Ahead:\n${i}\n\nEstimated Waiting Time:\n${estimatedWaitTime} minutes\n\nExpected Consultation Time:\n${expectedStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}\n\nTrack your queue here:\n${trackerLink}`;
          await sendWhatsApp(
            { ...token, estimatedWaitTime },
            "welcome",
            welcomeMsg
          );
          updates.last_notified_wait_time = estimatedWaitTime;
        }

        if (i === 2 && !token.notifiedTwoRemaining) {
          const remainMsg = `Only 2 patients remain before your consultation.\n\nPlease proceed near the consultation room.`;
          await sendWhatsApp(
            { ...token, estimatedWaitTime },
            "two_remaining",
            remainMsg
          );
          updates.notified_two_remaining = true;
        }
      }

      tokenUpdates.push({ id: token.id, updates });

      const patientDuration =
        token.estimatedConsultationTime || doc.avgConsultationTime || 15;
      accumulatedWait += patientDuration;
    }
  }

  // Apply all updates
  for (const { id, updates } of tokenUpdates) {
    await supabase.from("tokens").update(updates).eq("id", id);
  }
}

// ============================================================
// Reusable Queue Calculation Helper
// ============================================================

async function computeWaitingQueue(departmentId?: string, doctorId?: string) {
  let query = supabase
    .from("tokens")
    .select("*")
    .eq("status", "waiting")
    .order("created_at", { ascending: true });

  if (departmentId && departmentId !== "all") {
    query = query.eq("department_id", departmentId);
  }
  if (doctorId && doctorId !== "all") {
    query = query.eq("doctor_id", doctorId);
  }

  const { data: waitingTokens, error } = await query;
  if (error) throw error;

  const { data: settingsRow } = await supabase.from("settings").select("config").single();
  const defaultAvgMinutes = settingsRow?.config?.defaultWaitingTime || 10;
  const now = new Date();

  let cumulativeMinutes = 0;

  return (waitingTokens || []).map((token, index) => {
    const estimatedWaitMinutes = cumulativeMinutes;
    const expectedConsultTime = new Date(now.getTime() + estimatedWaitMinutes * 60000);
    const thisPatientDuration =
      token.estimated_consultation_time ||
      token.consultation_duration_minutes ||
      defaultAvgMinutes;
    cumulativeMinutes += thisPatientDuration;

    return {
      ...token,
      patientsAhead: index,
      estimatedWaitMinutes,
      expectedConsultTime: expectedConsultTime.toISOString(),
      expectedConsultDate: expectedConsultTime.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      expectedConsultTimeFormatted: expectedConsultTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
      registeredDate: new Date(token.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    };
  });
}

// ============================================================
// Recalculate queue + send "2 patients ahead" notifications
// ============================================================

async function notifyTwoAheadPatients(departmentId: string) {
  const queue = await computeWaitingQueue(departmentId);
  if (!queue || queue.length === 0) return;

  // Sync positions & computed wait times in DB
  for (const t of queue) {
    await supabase
      .from("tokens")
      .update({
        position: t.patientsAhead + 1,
        estimated_wait_time: t.estimatedWaitMinutes,
        expected_consultation_start_time: t.expectedConsultTime,
      })
      .eq("id", t.id);
  }

  const twoAheadPatient = queue.find(t => t.patientsAhead === 2 && !t.notified_two_ahead);
  if (!twoAheadPatient) return;

  const msg = `Only 2 patients ahead of you. Please move to the waiting area near ${twoAheadPatient.department_name}. Estimated wait: ~${twoAheadPatient.estimatedWaitMinutes} mins.`;

  if (twoAheadPatient.patient_email) {
    await sendEmail(
      twoAheadPatient.patient_email,
      twoAheadPatient.patient_name,
      twoAheadPatient.token_number,
      twoAheadPatient.department_name,
      twoAheadPatient.doctor_name,
      msg,
      twoAheadPatient.id,
      twoAheadPatient.expectedConsultTime
    );
  }
  // if (twoAheadPatient.patient_mobile) await sendWhatsApp(...) — once WhatsApp is live

  await supabase.from("tokens").update({ notified_two_ahead: true }).eq("id", twoAheadPatient.id);
}

async function recalculateQueueAndNotify(departmentId: string) {
  await notifyTwoAheadPatients(departmentId);
}

// ============================================================
// Department-action authorization middleware
// ============================================================

async function authorizeDeptAction(
  tokenId: string,
  req: express.Request,
  res: express.Response
): Promise<boolean> {
  const operatorUsername = req.headers["x-operator-username"] as string;
  if (!operatorUsername) return true;

  const { data: userRows } = await supabase
    .from("users")
    .select("*")
    .ilike("username", operatorUsername.trim());
  const operator = userRows?.[0] ? mapUser(userRows[0]) : null;

  if (operator && operator.role === UserRole.RECEPTIONIST) {
    const { data: tokenRows } = await supabase
      .from("tokens")
      .select("department_id")
      .eq("id", tokenId);
    const tokenRow = tokenRows?.[0];
    if (tokenRow) {
      const assignedDepts =
        operator.assignedDepartmentIds ||
        (operator.departmentId ? [operator.departmentId] : []);
      if (!assignedDepts.includes(tokenRow.department_id)) {
        res.status(403).json({
          success: false,
          message: "You are not authorized to manage tokens for this department.",
        });
        return false;
      }
    }
  }
  return true;
}

async function ensureDefaultCredentials() {
  try {
    console.log("[InclusyQ] Verifying default settings and credentials in Supabase...");

    // 0. Verify / Seed settings
    const { data: settingsData, error: settingsError } = await supabase.from("settings").select("*").eq("id", 1);
    if (settingsError) throw settingsError;

    const defaultHospitalInfo = {
      name: "St. Jude Memorial Hospital",
      tagline: "Compassionate Care, Advanced Medicine",
      address: "742 Evergreen Terrace, Medical District, Sector 4",
      phone: "+1 (555) 010-9900",
      logoColor: "text-blue-600"
    };

    const defaultAnnouncements = [
      { id: "ann-1", text: "Welcome to St. Jude Memorial Hospital. Please wait for your token to flash on the live queue TV display.", createdAt: "2026-07-17T08:00:00Z" },
      { id: "ann-2", text: "Note: Patients under emergency token designations will be expedited immediately to critical care units.", createdAt: "2026-07-17T08:05:00Z" }
    ];

    const defaultConfig = {
      tokenPrefix: "",
      dailyTokenReset: true,
      queueStartNumber: 1,
      emergencyQueue: true,
      walkInQueue: true,
      maxQueueSize: 100,
      defaultWaitingTime: 15,
      numberFormat: "001",
      maxDailyTokens: 500,
      emergencyTokenPrefix: "EMR",
      vipTokenPrefix: "VIP",
      walkInTokenPrefix: "WLK",
      consultationStartTime: "09:00",
      consultationEndTime: "17:00",
      autoSkipTimeout: 180,
      maxWaitingTime: 120,
      minWaitTimeNotificationThreshold: 5,
      enableWhatsAppUpdates: true
    };

    if (!settingsData || settingsData.length === 0) {
      await supabase.from("settings").insert({
        id: 1,
        is_paused: false,
        hospital_info: defaultHospitalInfo,
        announcements: defaultAnnouncements,
        config: defaultConfig
      });
      console.log("[InclusyQ] Default settings initialized.");
    } else {
      const row = settingsData[0];
      if (!row.hospital_info || !row.config || !row.announcements || row.announcements.length === 0) {
        await supabase.from("settings").update({
          hospital_info: row.hospital_info || defaultHospitalInfo,
          announcements: row.announcements && row.announcements.length > 0 ? row.announcements : defaultAnnouncements,
          config: row.config || defaultConfig
        }).eq("id", 1);
        console.log("[InclusyQ] Default settings repaired.");
      }
    }
    
    // 1. Get first department (for reception user fallback)
    const { data: depts, error: deptsError } = await supabase.from("departments").select("id").limit(1);
    if (deptsError) throw deptsError;
    const deptId = depts && depts.length > 0 ? depts[0].id : null;

    // 2. Bootstrap admin user once — env password only, never overwrite.
    // Creates the account only when missing AND BOOTSTRAP_ADMIN_PASSWORD is
    // set. Existing accounts are never touched here (no password resets on
    // boot). Hash stored with bcrypt (12 rounds); plaintext column unused.
    const { data: admins, error: adminsError } = await supabase
      .from("users")
      .select("*")
      .eq("username", "admin");
    if (adminsError) throw adminsError;

    if (!admins || admins.length === 0) {
      const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
      if (!bootstrapPassword) {
        console.warn("[InclusyQ] No admin user found and BOOTSTRAP_ADMIN_PASSWORD is not set — skipping admin bootstrap.");
      } else {
        const password_hash = await bcrypt.hash(bootstrapPassword, 12);
        const { error: insertError } = await supabase.from("users").insert({
          id: "user-admin-default",
          username: "admin",
          name: "Dr. Helen Vance (Chief Administrator)",
          role: "admin",
          permissions: ["manage_hospital", "manage_doctors", "manage_departments", "manage_rooms", "manage_staff", "manage_config"],
          password_hash,
          is_active: true,
          assigned_department_ids: []
        });
        if (insertError) throw insertError;
        console.log("[InclusyQ] Default Administrator account created.");
      }
    }

    // 3. Bootstrap reception user once — same rules as admin above.
    const { data: receptions, error: receptionsError } = await supabase
      .from("users")
      .select("*")
      .eq("username", "reception");
    if (receptionsError) throw receptionsError;

    if (!receptions || receptions.length === 0) {
      const bootstrapPassword = process.env.BOOTSTRAP_RECEPTION_PASSWORD;
      if (!bootstrapPassword) {
        console.warn("[InclusyQ] No reception user found and BOOTSTRAP_RECEPTION_PASSWORD is not set — skipping reception bootstrap.");
      } else {
        const password_hash = await bcrypt.hash(bootstrapPassword, 12);
        const { error: insertError } = await supabase.from("users").insert({
          id: "user-reception-default",
          username: "reception",
          name: "Claire Redfield (Senior Registrar)",
          role: "receptionist",
          department_id: deptId,
          assigned_department_ids: deptId ? [deptId] : [],
          permissions: ["register_patient", "generate_token", "call_token", "complete_token", "skip_token", "cancel_token", "pause_queue"],
          password_hash,
          is_active: true
        });
        if (insertError) throw insertError;
        console.log("[InclusyQ] Default Reception account created.");
      }
    }

    // 4. Seed default tracking devices if empty
    try {
      const { data: existingDevs } = await supabase.from("tracking_devices").select("id").limit(1);
      if (!existingDevs || existingDevs.length === 0) {
        await supabase.from("tracking_devices").insert([
          { id: "dev-1", device_code: "DEVICE-01", name: "Smart Pager #01", status: "available", battery_level: 100 },
          { id: "dev-2", device_code: "DEVICE-02", name: "Smart Pager #02", status: "available", battery_level: 95 },
          { id: "dev-3", device_code: "DEVICE-03", name: "Smart Pager #03", status: "available", battery_level: 88 },
          { id: "dev-4", device_code: "DEVICE-04", name: "Smart Pager #04", status: "available", battery_level: 100 },
          { id: "dev-5", device_code: "DEVICE-05", name: "Smart Pager #05", status: "available", battery_level: 72 }
        ]);
        console.log("[InclusyQ] Default tracking devices initialized (5 pagers).");
      }
    } catch (devErr) {
      // Ignore if table not created yet
    }
  } catch (err: any) {
    console.warn("[InclusyQ] Warning: Database tables might not exist yet. Please run the SQL schema in Supabase.", err?.message || err);
  }
}

// ============================================================
// Main server
// ============================================================

// Start background credentials verification asynchronously
ensureDefaultCredentials().catch((err) => {
  console.warn("[InclusyQ] Credentials initialization warning:", err?.message || err);
});

// ── BullMQ workers ────────────────────────────────────────────────────────────
// Workers are started after env is loaded (dotenv.config runs above).
// They are no-ops when REDIS_URL is not set — jobs fall back to in-process.
import { startWorkers } from './src-api/jobs/scheduler.js';
import { expressRequestLogger } from './src-api/middleware/requestLogger.js';
import {
  healthHandler, readyHandler, liveHandler, metricsHandler,
} from './src-api/controllers/healthController.js';
import { verifyAccessToken } from './src-api/utils/jwtUtils.js';

// ── Lightweight auth helper for Express (dev server only) ────────────────────
// Mirrors requireJwtAuth in jwtAuthMiddleware.ts but avoids
// the Redis / session-store dependency so it works before those tables exist.
//
// Accepts:
//   1. Bearer <JWT access token>   — verified by signature only (no DB lookup)
//   2. x-operator-username header  — ONLY when ALLOW_LEGACY_AUTH=true
//      (transitional legacy clients; disabled by default — header is ignored)
//
// Returns true (allowed) / false (rejected with 401 already sent).
function devRequireAuth(req: express.Request, res: express.Response): boolean {
  const authHeader = req.headers['authorization'] as string | undefined;
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    const decoded = verifyAccessToken(token);
    if (!decoded) {
      res.status(401).json({ success: false, message: 'Invalid or expired access token' });
      return false;
    }
    (req as any).user = decoded;
    return true;
  }

  // Legacy: x-operator-username — gated, never a silent bypass
  if (process.env.ALLOW_LEGACY_AUTH === 'true') {
    const legacyUser = req.headers['x-operator-username'];
    if (legacyUser) return true;
  }

  res.status(401).json({ success: false, message: 'Authentication required' });
  return false;
}

let stopWorkers: (() => Promise<void>) | null = null;

startWorkers()
  .then((stop) => { stopWorkers = stop; })
  .catch((err) => {
    console.warn('[InclusyQ] BullMQ worker startup warning:', err?.message || err);
  });

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// Helper: wraps async route handlers so any thrown error is forwarded
// to Express's error handler instead of causing a silent hang.
const wa = (fn: Function) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res, next)).catch(next);

  app.use(express.json());

  // ── Structured request logger (replaces plain console.log middleware) ──────
  app.use(expressRequestLogger);

  // ── Auth middleware — gates all API routes except the public allowlist ──────
  // Mirrors the per-route requireJwtAuth calls in api/index.ts (Vercel) so
  // local dev behaviour matches production exactly.
  const PUBLIC_ROUTES_RE = [
    /^\/api\/login$/,
    /^\/api\/auth\/refresh$/,
    /^\/api\/queue$/,
    /^\/api\/track\//,
    /^\/api\/events$/,
    /^\/api\/health$/,
    /^\/api\/ready$/,
    /^\/api\/live$/,
    /^\/api\/metrics$/,
  ];

  app.use('/api', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const isPublic = PUBLIC_ROUTES_RE.some(re => re.test(req.path === '/' ? '/api' : `/api${req.path}`));
    if (isPublic) return next();
    if (!devRequireAuth(req, res)) return; // 401 already sent
    next();
  });

  // ── Monitoring endpoints (no auth — probes must always be reachable) ───────
  app.get('/api/health',  (req, res) => healthHandler(req as any, res as any));
  app.get('/api/ready',   (req, res) => readyHandler(req as any, res as any));
  app.get('/api/live',    (req, res) => liveHandler(req as any, res as any));
  app.get('/api/metrics', (req, res) => metricsHandler(req as any, res as any));

  // ------ SSE ------
  app.get("/api/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    sseClients.push(res);
    req.on("close", () => {
      sseClients = sseClients.filter((c) => c !== res);
    });
  });

  // ------ GET full DB state ------
  app.get("/api/data", devApiRateLimiter, async (req, res) => {
    try {
      const [
        { data: depts },
        { data: docs },
        { data: usersData },
        { data: patientsData },
        { data: tokensData },
        { data: rooms },
        { data: logsData },
        { data: waLogs },
        { data: settingsData },
      ] = await Promise.all([
        supabase.from("departments").select("*"),
        supabase.from("doctors").select("*"),
        supabase.from("users").select("*"),
        supabase.from("patients").select("*").order("created_at", { ascending: false }),
        supabase.from("tokens").select("*").order("created_at", { ascending: true }),
        supabase.from("consultation_rooms").select("*"),
        supabase.from("queue_logs").select("*").order("timestamp", { ascending: false }).limit(200),
        supabase.from("whatsapp_logs").select("*").order("timestamp", { ascending: false }).limit(100),
        supabase.from("settings").select("*").limit(1),
      ]);

      // Fetch devices separately — graceful fallback if table not yet migrated
      let devicesData: any[] = [];
      try {
        const { data: devs } = await supabase
          .from("tracking_devices")
          .select("*")
          .order("id", { ascending: true });
        devicesData = devs || [];
      } catch (_) {
        // table not yet created — return empty array, app still works
      }

      const settingsRow = settingsData?.[0];
      res.json(sanitizeObject({
        departments: (depts || []).map(mapDept),
        doctors: (docs || []).map(mapDoctor),
        users: (usersData || []).map((u: any) => sanitizeUser(mapUser(u))),
        patients: (patientsData || []).map(mapPatient),
        tokens: (tokensData || []).map(mapToken),
        consultation_rooms: (rooms || []).map(mapRoom),
        queue_logs: (logsData || []).map(mapQueueLog),
        whatsapp_logs: waLogs || [],
        devices: devicesData.map(mapDevice),
        settings: settingsRow ? mapSettings(settingsRow) : null,
      }));
    } catch (err) {
      return genericError(res, "/api/data error:", err, "Database error");
    }
  });


  // ------ Tracking Devices Endpoints ------

  app.get("/api/devices", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("tracking_devices")
        .select("*")
        .order("id", { ascending: true });
      if (error) {
        console.error("[/api/devices]", error.message);
        return res.status(500).json({ success: false, message: "Device query failed" });
      }
      res.json({ success: true, devices: (data || []).map(mapDevice) });
    } catch (err: any) {
      return genericError(res, "[/api/devices]", err, "Device query failed");
    }
  });

  app.post("/api/devices", wa(async (req, res) => {
    const { deviceCode, name } = req.body;
    if (!deviceCode) return res.status(400).json({ success: false, message: "Device code is required." });

    const newDevice = {
      id: `dev-${uuidv4()}`,
      device_code: deviceCode.trim().toUpperCase(),
      name: (name || `Smart Pager ${deviceCode}`).trim(),
      status: "available",
      battery_level: 100,
      last_seen_at: new Date().toISOString()
    };

    const { data, error } = await supabase.from("tracking_devices").insert(newDevice).select().single();
    if (error) {
      console.error("[/api/devices] insert:", error.message);
      return res.status(500).json({ success: false, message: "Failed to create device." });
    }

    broadcastUpdate();
    res.json({ success: true, device: mapDevice(data) });
  }));

  app.post("/api/devices/assign", wa(async (req, res) => {
    const { deviceId, tokenId } = req.body;
    if (!deviceId || !tokenId) return res.status(400).json({ success: false, message: "deviceId and tokenId are required." });

    const [{ data: tokenRow }, { data: deviceRow }] = await Promise.all([
      supabase.from("tokens").select("*").eq("id", tokenId).single(),
      supabase.from("tracking_devices").select("*").eq("id", deviceId).single()
    ]);

    if (!tokenRow || !deviceRow) return res.status(404).json({ success: false, message: "Token or device not found." });

    // Link device to token
    await supabase.from("tracking_devices").update({
      status: "in_use",
      assigned_token_id: tokenId,
      assigned_token_number: tokenRow.token_number,
      last_seen_at: new Date().toISOString()
    }).eq("id", deviceId);

    await supabase.from("tokens").update({
      device_id: deviceId
    }).eq("id", tokenId);

    await addQueueLog(tokenId, tokenRow.token_number, "assigned_depts", `Assigned Hardware Pager ${deviceRow.device_code}`);
    broadcastUpdate();

    res.json({ success: true, message: `Device ${deviceRow.device_code} assigned to ${tokenRow.token_number}.` });
  }));

  app.post("/api/devices/unassign", wa(async (req, res) => {
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ success: false, message: "deviceId is required." });

    const { data: deviceRow } = await supabase.from("tracking_devices").select("*").eq("id", deviceId).single();
    if (!deviceRow) return res.status(404).json({ success: false, message: "Device not found." });

    if (deviceRow.assigned_token_id) {
      await supabase.from("tokens").update({ device_id: null }).eq("id", deviceRow.assigned_token_id);
    }

    await supabase.from("tracking_devices").update({
      status: "available",
      assigned_token_id: null,
      assigned_token_number: null,
      last_seen_at: new Date().toISOString()
    }).eq("id", deviceId);

    broadcastUpdate();
    res.json({ success: true, message: `Device ${deviceRow.device_code} is now available.` });
  }));

  // ------ Login (delegates to the same enhancedLoginHandler used by Vercel) ------
  // The old inline implementation used plain-text password comparison and
  // never issued a JWT, causing AuthContext.login() to get a response without
  // 'accessToken', leaving isAuthenticated=false and the UI stuck on login.
  app.post("/api/login", wa(async (req, res) => {
    // Adapt the Express req/res to the VercelRequest/VercelResponse interface
    // that enhancedLoginHandler expects.  The handler only reads:
    //   req.body, req.headers, res.setHeader(), res.status(), res.json()
    // All of which are present on the Express objects — the cast is safe.
    const { enhancedLoginHandler } = await import('./src-api/controllers/enhancedAuthController.js');
    return enhancedLoginHandler(req as any, res as any);
  }));

  // ------ Token refresh (mirrors api/index.ts) ------
  app.post("/api/auth/refresh", wa(async (req, res) => {
    const { refreshTokenHandler } = await import('./src-api/controllers/enhancedAuthController.js');
    return refreshTokenHandler(req as any, res as any);
  }));

  // ------ Logout (mirrors api/index.ts) ------
  app.post("/api/logout", wa(async (req, res) => {
    const { logoutHandler } = await import('./src-api/controllers/enhancedAuthController.js');
    return logoutHandler(req as any, res as any);
  }));


  // ------ Live Queue Endpoint (Cumulative Running Total) ------
  app.get("/api/queue", wa(async (req, res) => {
    const { departmentId, doctorId } = req.query as Record<string, string>;
    try {
      const waitingTokens = await computeWaitingQueue(departmentId, doctorId);
      const enriched = waitingTokens.map(token => sanitizeObject(mapToken(token)));
      res.json({ success: true, tokens: enriched });
    } catch (error: any) {
      return genericError(res, "[/api/queue]", error, "Failed to fetch queue.");
    }
  }));

  // ------ Live Token Tracking ------
  app.get("/api/track/:tokenId", async (req, res) => {

    try {
      const { data: myToken, error: tokenErr } = await supabase
        .from("tokens")
        .select("*")
        .eq("id", req.params.tokenId)
        .single();

      if (tokenErr || !myToken) {
        return res.status(404).json({ success: false, message: "Token not found." });
      }

      // Currently being served in the same department
      const { data: currentServing } = await supabase
        .from("tokens")
        .select("*")
        .eq("department_id", myToken.department_id)
        .eq("status", "called")
        .order("called_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // How many waiting tokens are ahead of this one (lower position)
      const { data: aheadList } = await supabase
        .from("tokens")
        .select("token_number")
        .eq("department_id", myToken.department_id)
        .eq("status", "waiting")
        .lt("position", myToken.position)
        .order("position", { ascending: true });

      res.json({
        success: true,
        myToken: sanitizeObject(mapToken(myToken)),
        currentServing: currentServing ? sanitizeObject(mapToken(currentServing)) : null,
        aheadCount: aheadList?.length ?? 0,
      });
    } catch (err: any) {
      return genericError(res, "[/api/track ERROR]", err, "Failed to fetch tracking data.");
    }
  });

  // ------ Create / Find Patient ------
  app.post("/api/patients", devApiRateLimiter, async (req, res) => {
    try {
      const { name, mobile, age, gender } = req.body || {};
      if (!name || !mobile) {
        return res.status(400).json({ success: false, message: "Patient name and mobile are required." });
      }
      let cleanMobile: string;
      let cleanName: string;
      try {
        cleanName = validateTextLength(String(name), 1, 100, "name");
        cleanMobile = validatePhoneNumber(String(mobile));
      } catch (e: any) {
        return res.status(400).json({ success: false, message: e?.message || "Invalid patient input." });
      }

      const { data: existing } = await supabase
        .from("patients")
        .select("*")
        .eq("mobile", cleanMobile);
      if (existing?.length) return res.json(sanitizeObject(mapPatient(existing[0])));

      const newPatient = {
        id: `pat-${uuidv4()}`,
        name: cleanName,
        mobile: cleanMobile,
        email: (req.body.email || "").trim(),
        age: parseInt(age) || 30,
        gender: gender || Gender.MALE,
        created_at: new Date().toISOString(),
      };
      const { data: patData, error: patError } = await supabase.from("patients").insert(newPatient).select();
      if (patError || !patData?.length) {
        console.error("[/api/patients] insert failed:", patError?.message);
        return res.status(500).json({ success: false, message: "Failed to create patient record." });
      }
      res.json(sanitizeObject(mapPatient(patData[0])));
    } catch (err: any) {
      return genericError(res, "[/api/patients ERROR]", err, "Unexpected server error creating patient.");
    }
  });

  // ------ Create Token ------
  app.post("/api/tokens", devApiRateLimiter, async (req, res) => {
    try {
    const {
      patientName, patientMobile, patientEmail, patientAge, patientGender,
      departmentId, doctorId, reasonForVisit, priority, estimatedConsultationTime,
    } = req.body || {};

    if (!patientName || !patientMobile || !departmentId || !doctorId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: patientName, patientMobile, departmentId, doctorId."
      });
    }

    // Reuse shared validators (SQ-MAJ-004) — reject malformed input early.
    let cleanName: string;
    let cleanMobile: string;
    try {
      cleanName = validateTextLength(String(patientName), 1, 100, "patientName");
      cleanMobile = validatePhoneNumber(String(patientMobile));
    } catch (e: any) {
      return res.status(400).json({ success: false, message: e?.message || "Invalid token input." });
    }

    const [{ data: depts }, { data: docs }] = await Promise.all([
      supabase.from("departments").select("*").eq("id", departmentId),
      supabase.from("doctors").select("*").eq("id", doctorId),
    ]);
    if (!depts?.length || !docs?.length)
      return res.status(400).json({ success: false, message: "Invalid department or doctor selection" });

    const department = mapDept(depts[0]);
    const doctor = mapDoctor(docs[0]);

    // Priority authorization
    let finalPriority = (priority || "Normal").trim();
    if (finalPriority !== "Normal") {
      const operatorUsername = req.headers["x-operator-username"] as string;
      let isAuthorized = false;
      if (operatorUsername) {
        const { data: opRows } = await supabase
          .from("users")
          .select("*")
          .ilike("username", operatorUsername.trim());
        const op = opRows?.[0] ? mapUser(opRows[0]) : null;
        if (
          op &&
          (op.role === UserRole.ADMIN ||
            op.permissions?.includes("set_priority"))
        )
          isAuthorized = true;
      }
      if (!isAuthorized) finalPriority = "Normal";
    }

    // Department authorization for receptionist
    const operatorUsername = req.headers["x-operator-username"] as string;
    if (operatorUsername) {
      const { data: opRows } = await supabase
        .from("users")
        .select("*")
        .ilike("username", operatorUsername.trim());
      const op = opRows?.[0] ? mapUser(opRows[0]) : null;
      if (op && op.role === UserRole.RECEPTIONIST) {
        const assignedDepts =
          op.assignedDepartmentIds ||
          (op.departmentId ? [op.departmentId] : []);
        if (!assignedDepts.includes(departmentId))
          return res.status(403).json({ success: false, message: "You are not authorized to generate tokens for this department." });
      }
    }

    // Token number
    const prefix = department.prefix || "GEN";
    const todayStr = new Date().toISOString().split("T")[0];
    const { data: todayTokens } = await supabase
      .from("tokens")
      .select("id")
      .eq("department_id", departmentId)
      .gte("created_at", todayStr);
    const nextSeqNum = (todayTokens?.length || 0) + 1;
    const tokenNumber = `${prefix}-${String(nextSeqNum).padStart(3, "0")}`;

    // Queue position
    const { data: waitingTokens } = await supabase
      .from("tokens")
      .select("id")
      .eq("status", TokenStatus.WAITING);
    const position = (waitingTokens?.length || 0) + 1;

    const newToken = {
      id: `tok-${uuidv4()}`,
      token_number: tokenNumber,
      patient_name: cleanName,
      patient_mobile: cleanMobile,
      patient_email: patientEmail && String(patientEmail).trim() ? String(patientEmail).trim() : null,
      patient_age: parseInt(patientAge) || 30,
      patient_gender: patientGender,
      department_id: departmentId,
      department_name: department.name,
      doctor_id: doctorId,
      doctor_name: doctor.name,
      reason_for_visit: sanitizeString(String(reasonForVisit || "")),
      status: TokenStatus.WAITING,
      created_at: new Date().toISOString(),
      is_emergency: finalPriority !== "Normal",
      priority: finalPriority,
      position,
      estimated_consultation_time: estimatedConsultationTime
        ? parseInt(estimatedConsultationTime)
        : null,
    };

    // Ensure patient exists
    const { data: existingPat } = await supabase
      .from("patients")
      .select("id")
      .eq("mobile", cleanMobile);
    if (!existingPat?.length) {
      await supabase.from("patients").insert({
        id: `pat-${uuidv4()}`,
        name: cleanName,
        mobile: cleanMobile,
        email: patientEmail && String(patientEmail).trim() ? String(patientEmail).trim() : null,
        age: parseInt(patientAge) || 30,
        gender: patientGender,
        created_at: new Date().toISOString(),
      });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("tokens")
      .insert(newToken)
      .select();

    if (insertError || !inserted || inserted.length === 0) {
      console.error("[TOKEN INSERT ERROR]", insertError?.message);
      return res.status(500).json({
        success: false,
        message: "Failed to create token. Please try again."
      });
    }

    const token = sanitizeObject(mapToken(inserted[0]));
    await addQueueLog(token.id, token.tokenNumber, "created");
    await recalculateQueueWaitTimes();
    broadcastUpdate();

    if (token.patientEmail && token.patientEmail.trim()) {
      const queue = await computeWaitingQueue(token.departmentId);
      const tokenQueueEntry = queue.find((t: any) => t.id === token.id);
      const expectedTime = tokenQueueEntry?.expectedConsultTime;

      await sendEmail(
        token.patientEmail.trim(),
        token.patientName,
        token.tokenNumber,
        token.departmentName,
        token.doctorName,
        req.body.customMessage || "Please wait for your queue number to be called.",
        token.id,
        expectedTime
      );
    }

    res.json({ success: true, token });
    } catch (err: any) {
      return genericError(res, "[/api/tokens ERROR]", err, "Unexpected server error creating token.");
    }
  });

  // ------ Token actions ------

  const getToken = async (id: string) => {
    const { data } = await supabase.from("tokens").select("*").eq("id", id);
    return data?.[0] || null;
  };

  app.post("/api/tokens/:id/call", async (req, res) => {
    try {
      const { id } = req.params;
      if (!await authorizeDeptAction(id, req, res)) return;
      const row = await getToken(id);
      if (!row) return res.status(404).json({ success: false, message: "Token not found" });
      
      const { data: calledToken, error: updateError } = await supabase
        .from("tokens")
        .update({ status: TokenStatus.CALLED, called_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (updateError || !calledToken) {
        return res.status(500).json({ success: false, message: updateError?.message || "Failed to update token status." });
      }

      await addQueueLog(id, row.token_number, "called");

      // Fetch doctor to get the consultation room
      const { data: docData } = await supabase
        .from("doctors")
        .select("room_number")
        .eq("id", calledToken.doctor_id)
        .maybeSingle();
      const roomStr = docData?.room_number ? `Room ${docData.room_number}` : "the consultation room";

      // fire "your turn" notification
      if (calledToken.patient_email && calledToken.patient_email.trim() && !calledToken.notified_your_turn) {
        const msg = `It's your turn now! Please proceed to ${roomStr} to see Dr. ${calledToken.doctor_name}.`;
        await sendEmail(
          calledToken.patient_email.trim(),
          calledToken.patient_name,
          calledToken.token_number,
          calledToken.department_name,
          calledToken.doctor_name,
          msg,
          calledToken.id,
          new Date().toISOString()
        );
        await supabase
          .from("tokens")
          .update({ notified_your_turn: true })
          .eq("id", calledToken.id);
      }

      await recalculateQueueWaitTimes();
      await notifyTwoAheadPatients(calledToken.department_id);
      broadcastUpdate();
      
      const updated = await getToken(id);
      res.json({ success: true, token: sanitizeObject(mapToken(updated)) });
    } catch (err: any) {
      return genericError(res, "[/api/tokens/call ERROR]", err, "Failed to call token.");
    }
  });

  app.post("/api/tokens/:id/complete", async (req, res) => {
    try {
      const { id } = req.params;
      if (!await authorizeDeptAction(id, req, res)) return;
      const row = await getToken(id);
      if (!row) return res.status(404).json({ success: false, message: "Token not found" });
      await supabase
        .from("tokens")
        .update({ status: TokenStatus.COMPLETED, completed_at: new Date().toISOString() })
        .eq("id", id);

      if (row.device_id) {
        await supabase.from("tracking_devices").update({
          status: "available",
          assigned_token_id: null,
          assigned_token_number: null,
          last_seen_at: new Date().toISOString()
        }).eq("id", row.device_id);
      }

      await addQueueLog(id, row.token_number, "completed");
      await recalculateQueueWaitTimes();
      await notifyTwoAheadPatients(row.department_id);
      broadcastUpdate();
      const updated = await getToken(id);
      res.json({ success: true, token: sanitizeObject(mapToken(updated)) });
    } catch (err: any) {
      return genericError(res, "[/api/tokens/complete ERROR]", err, "Failed to complete token.");
    }
  });

  app.post("/api/tokens/:id/skip", async (req, res) => {
    try {
      const { id } = req.params;
      if (!await authorizeDeptAction(id, req, res)) return;
      const row = await getToken(id);
      if (!row) return res.status(404).json({ success: false, message: "Token not found" });
      await supabase.from("tokens").update({ status: TokenStatus.SKIPPED }).eq("id", id);
      await addQueueLog(id, row.token_number, "skipped");
      await notifyTwoAheadPatients(row.department_id);
      broadcastUpdate();
      const updated = await getToken(id);
      res.json({ success: true, token: sanitizeObject(mapToken(updated)) });
    } catch (err: any) {
      return genericError(res, "[/api/tokens/skip ERROR]", err, "Failed to skip token.");
    }
  });

  app.post("/api/tokens/:id/cancel", async (req, res) => {
    try {
      const { id } = req.params;
      if (!await authorizeDeptAction(id, req, res)) return;
      const row = await getToken(id);
      if (!row) return res.status(404).json({ success: false, message: "Token not found" });
      await supabase.from("tokens").update({ status: TokenStatus.CANCELLED }).eq("id", id);

      if (row.device_id) {
        await supabase.from("tracking_devices").update({
          status: "available",
          assigned_token_id: null,
          assigned_token_number: null,
          last_seen_at: new Date().toISOString()
        }).eq("id", row.device_id);
      }

      await addQueueLog(id, row.token_number, "cancelled");
      await notifyTwoAheadPatients(row.department_id);
      broadcastUpdate();
      const updated = await getToken(id);
      res.json({ success: true, token: sanitizeObject(mapToken(updated)) });
    } catch (err: any) {
      return genericError(res, "[/api/tokens/cancel ERROR]", err, "Failed to cancel token.");
    }
  });

  app.post("/api/tokens/:id/recall", async (req, res) => {
    try {
      const { id } = req.params;
      if (!await authorizeDeptAction(id, req, res)) return;
      const row = await getToken(id);
      if (!row) return res.status(404).json({ success: false, message: "Token not found" });
      await supabase
        .from("tokens")
        .update({ called_at: new Date().toISOString() })
        .eq("id", id);
      await addQueueLog(id, row.token_number, "recalled");
      broadcastUpdate();
      const updated = await getToken(id);
      res.json({ success: true, token: sanitizeObject(mapToken(updated)) });
    } catch (err: any) {
      return genericError(res, "[/api/tokens/recall ERROR]", err, "Failed to recall token.");
    }
  });

  // ------ Settings ------

  app.post("/api/settings/toggle-pause", async (req, res) => {
    const { data: rows } = await supabase
      .from("settings")
      .select("is_paused")
      .limit(1);
    const newPaused = !rows?.[0]?.is_paused;
    await supabase.from("settings").update({ is_paused: newPaused }).eq("id", 1);
    broadcastUpdate();
    res.json({ success: true, isPaused: newPaused });
  });

  app.post("/api/settings/announcements", async (req, res) => {
    const { text } = req.body;
    if (!text?.trim())
      return res.status(400).json({ success: false, message: "Announcement text cannot be empty" });
    const { data: rows } = await supabase
      .from("settings")
      .select("announcements")
      .limit(1);
    const anns = rows?.[0]?.announcements || [];
    const newAnn = {
      id: `ann-${uuidv4()}`,
      text: sanitizeString(text).trim(),
      createdAt: new Date().toISOString(),
    };
    anns.unshift(newAnn);
    await supabase.from("settings").update({ announcements: anns }).eq("id", 1);
    broadcastUpdate();
    res.json({ success: true, announcement: newAnn });
  });

  app.delete("/api/settings/announcements/:id", async (req, res) => {
    const { id } = req.params;
    const { data: rows } = await supabase
      .from("settings")
      .select("announcements")
      .limit(1);
    const anns = (rows?.[0]?.announcements || []).filter(
      (a: any) => a.id !== id
    );
    await supabase.from("settings").update({ announcements: anns }).eq("id", 1);
    broadcastUpdate();
    res.json({ success: true });
  });

  // ------ Admin: Doctors ------

  app.post("/api/admin/doctors", async (req, res) => {
    const { name, departmentId, specialization, status, roomNumber, avgConsultationTime, startTime, endTime, maxPatientsPerDay, isEnabled } = req.body;
    if (!name || !departmentId)
      return res.status(400).json({ success: false, message: "Doctor name and department are required" });
    const newDoc = {
      id: `doc-${uuidv4()}`,
      name: name.trim(),
      department_id: departmentId,
      specialization: (specialization || "General").trim(),
      status: status || "active",
      room_number: (roomNumber || "").trim(),
      avg_consultation_time: parseInt(avgConsultationTime) || 15,
      start_time: startTime || "08:00",
      end_time: endTime || "17:00",
      max_patients_per_day: parseInt(maxPatientsPerDay) || 40,
      is_enabled: isEnabled !== undefined ? isEnabled : true,
    };
    const { data, error } = await supabase.from("doctors").insert(newDoc).select();
    if (error || !data?.length) return res.status(500).json({ success: false, message: error?.message || "Failed to create doctor" });
    broadcastUpdate();
    res.json({ success: true, doctor: mapDoctor(data[0]) });
  });

  app.put("/api/admin/doctors/:id", async (req, res) => {
    const { id } = req.params;
    const { name, departmentId, specialization, status, roomNumber, avgConsultationTime, startTime, endTime, maxPatientsPerDay, isEnabled } = req.body;
    const updates: any = {};
    if (name) updates.name = name.trim();
    if (departmentId) updates.department_id = departmentId;
    if (specialization) updates.specialization = specialization.trim();
    if (status) updates.status = status;
    if (roomNumber !== undefined) updates.room_number = roomNumber.trim();
    if (avgConsultationTime !== undefined) updates.avg_consultation_time = parseInt(avgConsultationTime) || 15;
    if (startTime !== undefined) updates.start_time = startTime;
    if (endTime !== undefined) updates.end_time = endTime;
    if (maxPatientsPerDay !== undefined) updates.max_patients_per_day = parseInt(maxPatientsPerDay) || 40;
    if (isEnabled !== undefined) updates.is_enabled = isEnabled;
    const { data } = await supabase.from("doctors").update(updates).eq("id", id).select();
    if (!data?.length)
      return res.status(404).json({ success: false, message: "Doctor not found" });
    broadcastUpdate();
    res.json({ success: true, doctor: mapDoctor(data[0]) });
  });

  app.delete("/api/admin/doctors/:id", async (req, res) => {
    await supabase.from("doctors").delete().eq("id", req.params.id);
    broadcastUpdate();
    res.json({ success: true });
  });

  app.post("/api/admin/doctors/:id/toggle-status", async (req, res) => {
    const { id } = req.params;
    const { data: rows } = await supabase.from("doctors").select("status").eq("id", id);
    if (!rows?.length)
      return res.status(404).json({ success: false, message: "Doctor not found" });
    const newStatus = rows[0].status === "active" ? "inactive" : "active";
    const { data, error } = await supabase.from("doctors").update({ status: newStatus }).eq("id", id).select();
    if (error || !data?.length) return res.status(500).json({ success: false, message: error?.message || "Failed to toggle doctor status" });
    broadcastUpdate();
    res.json({ success: true, doctor: mapDoctor(data[0]) });
  });

  // ------ Admin: Departments ------

  app.post("/api/admin/departments", async (req, res) => {
    const { name, prefix, description, isEnabled, defaultConsultationTime } = req.body;
    if (!name || !prefix)
      return res.status(400).json({ success: false, message: "Department name and prefix are required" });
    const cleanPrefix = prefix.trim().toUpperCase();
    const { data: existing } = await supabase
      .from("departments")
      .select("id")
      .eq("prefix", cleanPrefix);
    if (existing?.length)
      return res.status(400).json({ success: false, message: "Department prefix already exists" });
    const newDept = {
      id: `dep-${uuidv4()}`,
      name: name.trim(),
      prefix: cleanPrefix,
      description: (description || "").trim(),
      is_enabled: isEnabled !== undefined ? isEnabled : true,
      default_consultation_time: defaultConsultationTime ? parseInt(defaultConsultationTime) : 15,
    };
    const { data, error } = await supabase.from("departments").insert(newDept).select();
    if (error || !data?.length) return res.status(500).json({ success: false, message: error?.message || "Failed to create department" });
    broadcastUpdate();
    res.json({ success: true, department: mapDept(data[0]) });
  });

  app.put("/api/admin/departments/:id", async (req, res) => {
    const { id } = req.params;
    const { name, prefix, description, isEnabled, defaultConsultationTime } = req.body;
    const updates: any = {};
    if (name) updates.name = name.trim();
    if (prefix) {
      const cleanPrefix = prefix.trim().toUpperCase();
      const { data: existing } = await supabase
        .from("departments")
        .select("id")
        .eq("prefix", cleanPrefix)
        .neq("id", id);
      if (existing?.length)
        return res.status(400).json({ success: false, message: "Department prefix already exists" });
      updates.prefix = cleanPrefix;
    }
    if (description !== undefined) updates.description = description.trim();
    if (isEnabled !== undefined) updates.is_enabled = isEnabled;
    if (defaultConsultationTime !== undefined)
      updates.default_consultation_time = defaultConsultationTime
        ? parseInt(defaultConsultationTime)
        : 15;
    const { data } = await supabase.from("departments").update(updates).eq("id", id).select();
    if (!data?.length)
      return res.status(404).json({ success: false, message: "Department not found" });
    broadcastUpdate();
    res.json({ success: true, department: mapDept(data[0]) });
  });

  app.delete("/api/admin/departments/:id", async (req, res) => {
    await supabase.from("departments").delete().eq("id", req.params.id);
    broadcastUpdate();
    res.json({ success: true });
  });

  // ------ Admin: Rooms ------

  app.post("/api/admin/rooms", async (req, res) => {
    const { roomNumber, roomName, assignedDoctorId, departmentId, status, displayScreenId } = req.body;
    if (!roomNumber || !roomName)
      return res.status(400).json({ success: false, message: "Room number and name are required" });
    const newRoom = {
      id: `rm-${uuidv4()}`,
      room_number: roomNumber.trim(),
      room_name: roomName.trim(),
      assigned_doctor_id: assignedDoctorId || null,
      department_id: departmentId || null,
      status: status || "available",
      display_screen_id: (displayScreenId || "").trim(),
    };
    const { data, error } = await supabase.from("consultation_rooms").insert(newRoom).select();
    if (error || !data?.length) return res.status(500).json({ success: false, message: error?.message || "Failed to create room" });
    broadcastUpdate();
    res.json({ success: true, room: mapRoom(data[0]) });
  });

  app.put("/api/admin/rooms/:id", async (req, res) => {
    const { id } = req.params;
    const { roomNumber, roomName, assignedDoctorId, departmentId, status, displayScreenId } = req.body;
    const updates: any = {};
    if (roomNumber) updates.room_number = roomNumber.trim();
    if (roomName) updates.room_name = roomName.trim();
    if (assignedDoctorId !== undefined) updates.assigned_doctor_id = assignedDoctorId;
    if (departmentId !== undefined) updates.department_id = departmentId;
    if (status) updates.status = status;
    if (displayScreenId !== undefined) updates.display_screen_id = displayScreenId.trim();
    const { data } = await supabase.from("consultation_rooms").update(updates).eq("id", id).select();
    if (!data?.length)
      return res.status(404).json({ success: false, message: "Room not found" });
    broadcastUpdate();
    res.json({ success: true, room: mapRoom(data[0]) });
  });

  app.delete("/api/admin/rooms/:id", async (req, res) => {
    await supabase.from("consultation_rooms").delete().eq("id", req.params.id);
    broadcastUpdate();
    res.json({ success: true });
  });

  // ------ Admin: Staff / Users ------

  app.post("/api/admin/users", async (req, res) => {
    const { username, name, role, departmentId, assignedDepartmentIds, permissions, password, isActive } = req.body;
    if (!username || !name || !role)
      return res.status(400).json({ success: false, message: "Username, name, and role are required" });
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .ilike("username", username.trim());
    if (existing?.length)
      return res.status(400).json({ success: false, message: "Username already exists" });
    const newUser = {
      id: `usr-${uuidv4()}`,
      username: username.trim().toLowerCase(),
      name: name.trim(),
      role,
      department_id: departmentId || null,
      assigned_department_ids:
        assignedDepartmentIds || (departmentId ? [departmentId] : []),
      permissions:
        permissions ||
        (role === UserRole.ADMIN
          ? ["manage_hospital", "manage_doctors", "manage_departments", "manage_rooms", "manage_staff", "manage_config"]
          : ["register_patient", "generate_token", "call_token", "complete_token", "skip_token", "cancel_token", "pause_queue"]),
      password: password || "password",
      is_active: isActive !== undefined ? isActive : true,
    };
    const { data, error: insertErr } = await supabase.from("users").insert(newUser).select();
    if (insertErr || !data?.length) {
      console.error("[/api/admin/users] insert:", insertErr?.message);
      return res.status(500).json({ success: false, message: "Failed to create user." });
    }
    const user = sanitizeUser(mapUser(data[0]));

    if (user.role === UserRole.RECEPTIONIST) {
      const depts = user.assignedDepartmentIds || [];
      const { data: deptRows } = await supabase
        .from("departments")
        .select("name")
        .in("id", depts);
      const deptNames = (deptRows || []).map((d: any) => d.name).join(", ");
      const operatorUsername = (req.headers["x-operator-username"] as string) || "admin";
      await addAuditLog(
        "assigned_depts",
        `Assigned Receptionist "${user.name}" to Departments: ${deptNames || "None"}`,
        operatorUsername
      );
    }
    broadcastUpdate();
    res.json({ success: true, user });
  });

  app.put("/api/admin/users/:id", async (req, res) => {
    const { id } = req.params;
    const { username, name, role, departmentId, assignedDepartmentIds, permissions, password, isActive } = req.body;
    const { data: existing } = await supabase.from("users").select("*").eq("id", id);
    if (!existing?.length)
      return res.status(404).json({ success: false, message: "Staff user not found" });
    const oldUser = mapUser(existing[0]);

    const updates: any = {};
    if (username) {
      const cleanUsername = username.trim().toLowerCase();
      if (cleanUsername !== oldUser.username) {
        const { data: dup } = await supabase
          .from("users")
          .select("id")
          .ilike("username", cleanUsername)
          .neq("id", id);
        if (dup?.length)
          return res.status(400).json({ success: false, message: "Username already exists" });
      }
      updates.username = cleanUsername;
    }
    if (name) updates.name = name.trim();
    if (role) updates.role = role;
    if (departmentId !== undefined) updates.department_id = departmentId;
    if (assignedDepartmentIds !== undefined) updates.assigned_department_ids = assignedDepartmentIds;
    if (permissions !== undefined) updates.permissions = permissions;
    if (password) updates.password = password;
    if (isActive !== undefined) updates.is_active = isActive;

    const { data, error: updateErr } = await supabase.from("users").update(updates).eq("id", id).select();
    if (updateErr || !data?.length) {
      console.error("[/api/admin/users] update:", updateErr?.message);
      return res.status(500).json({ success: false, message: "Failed to update user." });
    }
    const user = sanitizeUser(mapUser(data[0]));

    if (user.role === UserRole.RECEPTIONIST && assignedDepartmentIds !== undefined) {
      const operatorUsername = (req.headers["x-operator-username"] as string) || "admin";
      const { data: deptRows } = await supabase
        .from("departments")
        .select("name")
        .in("id", assignedDepartmentIds);
      const deptNames = (deptRows || []).map((d: any) => d.name).join(", ");
      await addAuditLog(
        "assigned_depts",
        `Assigned Receptionist "${user.name}" to Departments: ${deptNames || "None"}`,
        operatorUsername
      );
    }
    broadcastUpdate();
    res.json({ success: true, user });
  });

  app.delete("/api/admin/users/:id", async (req, res) => {
    await supabase.from("users").delete().eq("id", req.params.id);
    broadcastUpdate();
    res.json({ success: true });
  });

  // ------ Admin: Queue Config ------

  app.post("/api/admin/queue-config", async (req, res) => {
    const config = { ...req.body };
    if (config.tokenPrefix !== undefined) config.tokenPrefix = config.tokenPrefix.trim();
    if (config.dailyTokenReset !== undefined) config.dailyTokenReset = !!config.dailyTokenReset;
    if (config.queueStartNumber !== undefined) config.queueStartNumber = parseInt(config.queueStartNumber) || 1;
    if (config.emergencyQueue !== undefined) config.emergencyQueue = !!config.emergencyQueue;
    if (config.walkInQueue !== undefined) config.walkInQueue = !!config.walkInQueue;
    if (config.maxQueueSize !== undefined) config.maxQueueSize = parseInt(config.maxQueueSize) || 100;
    if (config.defaultWaitingTime !== undefined) config.defaultWaitingTime = parseInt(config.defaultWaitingTime) || 15;
    if (config.maxDailyTokens !== undefined) config.maxDailyTokens = parseInt(config.maxDailyTokens) || 500;
    if (config.autoSkipTimeout !== undefined) config.autoSkipTimeout = parseInt(config.autoSkipTimeout) || 180;
    if (config.maxWaitingTime !== undefined) config.maxWaitingTime = parseInt(config.maxWaitingTime) || 120;
    if (config.minWaitTimeNotificationThreshold !== undefined)
      config.minWaitTimeNotificationThreshold = parseInt(config.minWaitTimeNotificationThreshold) || 5;
    if (config.enableWhatsAppUpdates !== undefined) config.enableWhatsAppUpdates = !!config.enableWhatsAppUpdates;
    await supabase.from("settings").update({ config }).eq("id", 1);
    broadcastUpdate();
    res.json({ success: true, config });
  });

  // ------ Admin: Hospital Info ------

  app.post("/api/admin/hospital-info", async (req, res) => {
    try {
      const {
        name, tagline, address, phone, logoUrl, logoColor, workingHours, queueOperatingHours,
        registrationNumber, email, city, state, country, pincode, website, description, emergencyContact
      } = req.body;

      const { data: rows, error: selectErr } = await supabase
        .from("settings")
        .select("hospital_info")
        .limit(1);
      
      if (selectErr) {
        console.error("[/api/admin/hospital-info] select:", selectErr.message);
        return res.status(500).json({ success: false, message: "Failed to update hospital info." });
      }

      const hospitalInfo = { ...(rows?.[0]?.hospital_info || {}) };

      if (name !== undefined) hospitalInfo.name = name.trim();
      if (tagline !== undefined) hospitalInfo.tagline = tagline.trim();
      if (address !== undefined) hospitalInfo.address = address.trim();
      if (phone !== undefined) hospitalInfo.phone = phone.trim();
      if (logoUrl !== undefined) hospitalInfo.logoUrl = logoUrl ? logoUrl.trim() : "";
      if (logoColor !== undefined) hospitalInfo.logoColor = logoColor.trim();
      if (workingHours !== undefined) hospitalInfo.workingHours = workingHours.trim();
      if (queueOperatingHours !== undefined) hospitalInfo.queueOperatingHours = queueOperatingHours.trim();
      
      if (registrationNumber !== undefined) hospitalInfo.registrationNumber = registrationNumber.trim();
      if (email !== undefined) hospitalInfo.email = email.trim();
      if (city !== undefined) hospitalInfo.city = city.trim();
      if (state !== undefined) hospitalInfo.state = state.trim();
      if (country !== undefined) hospitalInfo.country = country.trim();
      if (pincode !== undefined) hospitalInfo.pincode = pincode.trim();
      if (website !== undefined) hospitalInfo.website = website.trim();
      if (description !== undefined) hospitalInfo.description = description.trim();
      if (emergencyContact !== undefined) hospitalInfo.emergencyContact = emergencyContact.trim();

      const { error: updateErr } = await supabase
        .from("settings")
        .update({ hospital_info: hospitalInfo })
        .eq("id", 1);

      if (updateErr) {
        console.error("[/api/admin/hospital-info] update:", updateErr.message);
        return res.status(500).json({ success: false, message: "Failed to update hospital info." });
      }

      broadcastUpdate();
      res.json({ success: true, hospitalInfo: sanitizeObject(hospitalInfo) });
    } catch (err: any) {
      return genericError(res, "/api/admin/hospital-info error:", err, "Failed to update hospital info.");
    }
  });

  // Multer setup: use memory storage
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024, // 5 MB
    },
    fileFilter: (req, file, cb) => {
      const allowedMimes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Only PNG, JPG, JPEG, and WEBP image files are allowed."));
      }
    }
  });

  app.post("/api/admin/upload-logo", upload.single("logo"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: "No image file provided." });
      }

      const file = req.file;
      const ext = devSafeUploadExt(file.originalname, file.mimetype);
      if (!ext) {
        return res.status(400).json({ success: false, message: "Invalid file type." });
      }
      if (!devHasValidMagicBytes(file.buffer, file.mimetype)) {
        return res.status(400).json({ success: false, message: "Invalid file type." });
      }

      // 1. Ensure bucket "hospital-logos" exists (private)
      const { data: buckets, error: bucketErr } = await supabase.storage.listBuckets();
      if (bucketErr) {
        console.error("[/api/admin/upload-logo] listBuckets:", bucketErr.message);
        return res.status(500).json({ success: false, message: "Storage unavailable. Please try again." });
      }

      if (!buckets?.some((b) => b.id === "hospital-logos")) {
        const { error: createErr } = await supabase.storage.createBucket("hospital-logos", {
          public: false,
          allowedMimeTypes: ["image/png", "image/jpeg", "image/jpg", "image/webp"],
          fileSizeLimit: 5242880,
        });
        if (createErr) {
          console.error("[/api/admin/upload-logo] createBucket:", createErr.message);
          return res.status(500).json({ success: false, message: "Storage unavailable. Please try again." });
        }
      }

      // 2. UUID filename, no overwrite
      const filename = `logo-${uuidv4()}${ext}`;

      // 3. Upload file
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from("hospital-logos")
        .upload(filename, file.buffer, {
          contentType: file.mimetype,
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadErr) {
        console.error("[/api/admin/upload-logo] upload:", uploadErr.message);
        return res.status(500).json({ success: false, message: "Failed to upload logo." });
      }

      // 4. Signed URL (private bucket)
      const { data: signedData, error: signedErr } = await supabase.storage
        .from("hospital-logos")
        .createSignedUrl(filename, 7 * 24 * 3600);

      const logoUrl = signedData?.signedUrl;
      if (signedErr || !logoUrl) {
        console.error("[/api/admin/upload-logo] signed URL:", signedErr?.message);
        return res.status(500).json({ success: false, message: "Failed to upload logo." });
      }

      // 5. Save the signed URL into the settings table (hospital_info)
      const { data: rows, error: selectErr } = await supabase
        .from("settings")
        .select("hospital_info")
        .limit(1);

      if (selectErr) {
        console.error("[/api/admin/upload-logo] settings select:", selectErr.message);
        return res.status(500).json({ success: false, message: "Failed to upload logo." });
      }

      const hospitalInfo = { ...(rows?.[0]?.hospital_info || {}) };
      hospitalInfo.logoUrl = logoUrl;

      const { error: updateErr } = await supabase
        .from("settings")
        .update({ hospital_info: hospitalInfo })
        .eq("id", 1);

      if (updateErr) {
        console.error("[/api/admin/upload-logo] settings update:", updateErr.message);
        return res.status(500).json({ success: false, message: "Failed to upload logo." });
      }

      broadcastUpdate();
      res.json({ success: true, logoUrl });
    } catch (err: any) {
      return genericError(res, "/api/admin/upload-logo error:", err, "Failed to upload logo.");
    }
  });

  // ------ Vite dev / static ------

// ------ Vite dev / static ------

if (process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1" && !process.env.VERCEL) {
  createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  }).then((vite) => {
    app.use(vite.middlewares);
  }).catch((err) => {
    console.error("[Vite] Failed to start dev server middleware:", err);
  });
} else if (process.env.VERCEL !== "1" && !process.env.VERCEL) {
  // In production non-Vercel mode, serve the built dist/ statically
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) =>
    res.sendFile(path.join(distPath, "index.html"))
  );
}

// ------ Global error handler (catches unhandled route errors) ------
app.use((err: any, req: any, res: any, next: any) => {
  // Inline errorId generation — avoids require() of logger module
  const errorId = `ERR-${Date.now().toString(36)}`;
  const status  = err.status || 500;
  console.error(`[UNHANDLED ERROR] errorId=${errorId} ${req.method} ${req.path}:`, err?.message || err);
  // Generic user message — never echo raw internals (SQ-MAJ-004).
  res.status(status).json({ success: false, message: "Internal server error.", errorId });
});

export default app;

// only listen when running locally, not on Vercel
if (process.env.VERCEL !== "1" && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`[InclusyQ Server] Listening on http://0.0.0.0:${PORT}`);
    console.log(`[InclusyQ] Connected to Supabase: ${process.env.SUPABASE_URL}`);
  });

  // Graceful shutdown: flush BullMQ workers before the process exits
  const shutdown = async (signal: string) => {
    console.log(`\n[InclusyQ] ${signal} received — shutting down gracefully…`);
    if (stopWorkers) await stopWorkers();
    process.exit(0);
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT',  () => shutdown('SIGINT'));
}

