// All imports at the top — required by TypeScript/ESM module rules
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "./supabase.js";
import { mapToken, mapUser } from "./mappers.js";
import type { Token } from "../../src/types.js";
import { TokenStatus, UserRole } from "../../src/types.js";

// ── Audit / Queue Logs ───────────────────────────────────────────────────────

export async function addQueueLog(
  tokenId: string,
  tokenNumber: string,
  action: string,
  userId?: string
) {
  await supabase.from("queue_logs").insert({
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    token_id: tokenId,
    token_number: tokenNumber,
    action,
    user_id: userId,
    timestamp: new Date().toISOString(),
  });
}

export async function addAuditLog(action: string, detailText: string, userId?: string) {
  await supabase.from("queue_logs").insert({
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    token_id: "",
    token_number: detailText,
    action,
    user_id: userId,
    timestamp: new Date().toISOString(),
  });
}

// ── Priority helper ──────────────────────────────────────────────────────────

export function getPriorityWeight(priority: string | undefined): number {
  switch (priority) {
    case "VIP": return 4;
    case "Person with Disability": return 3;
    case "Pregnant Woman": return 2;
    case "Senior Citizen": return 1;
    default: return 0;
  }
}

// ── Fetch a single token row ─────────────────────────────────────────────────

export async function getTokenRow(id: string) {
  const { data } = await supabase.from("tokens").select("*").eq("id", id);
  return data?.[0] || null;
}

// ── Cumulative wait-time queue calculation ───────────────────────────────────

export async function computeWaitingQueue(departmentId?: string, doctorId?: string) {
  let query = supabase
    .from("tokens")
    .select("*")
    .eq("status", "waiting")
    .order("created_at", { ascending: true });

  if (departmentId && departmentId !== "all") query = query.eq("department_id", departmentId);
  if (doctorId && doctorId !== "all") query = query.eq("doctor_id", doctorId);

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
      expectedConsultDate: expectedConsultTime.toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric",
      }),
      expectedConsultTimeFormatted: expectedConsultTime.toLocaleTimeString("en-IN", {
        hour: "2-digit", minute: "2-digit", hour12: true,
      }),
      registeredDate: new Date(token.created_at).toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric",
      }),
    };
  });
}

// ── WhatsApp (logged-only) notification ──────────────────────────────────────

export async function sendWhatsApp(
  token: Token,
  type: "welcome" | "update" | "two_remaining" | "your_turn",
  messageText: string
) {
  console.log(`[WhatsApp API - ${type.toUpperCase()}] To: ${token.patientMobile} (${token.patientName})`);
  await supabase.from("whatsapp_logs").insert({
    id: `wa-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    token_id: token.id,
    token_number: token.tokenNumber,
    patient_name: token.patientName,
    patient_mobile: token.patientMobile,
    message: messageText,
    timestamp: new Date().toISOString(),
    type,
  });
}

// ── Full queue recalculation + WhatsApp notifications ────────────────────────

export async function recalculateQueueWaitTimes() {
  const [{ data: doctorsData }, { data: tokensData }, { data: settingsData }] =
    await Promise.all([
      supabase.from("doctors").select("*"),
      supabase.from("tokens").select("*"),
      supabase.from("settings").select("*").limit(1),
    ]);

  if (!doctorsData || !tokensData) return;

  const settingsRow = settingsData?.[0];
  const enableUpdates = settingsRow?.config?.enableWhatsAppUpdates !== false;
  const threshold = settingsRow?.config?.minWaitTimeNotificationThreshold ?? 5;
  const hospitalName = settingsRow?.hospital_info?.name || "St. Jude Memorial Hospital";

  const tokenUpdates: Array<{ id: string; updates: Record<string, any> }> = [];

  for (const doc of doctorsData) {
    const docTokens = tokensData.filter((t: any) => t.doctor_id === doc.id);
    const calledToken = docTokens.find((t: any) => t.status === TokenStatus.CALLED);

    let currentCalledRemaining = 0;
    if (calledToken) {
      const duration = calledToken.estimated_consultation_time || doc.avg_consultation_time || 15;
      const calledAt = calledToken.called_at ? new Date(calledToken.called_at) : new Date();
      const elapsedMins = Math.floor((Date.now() - calledAt.getTime()) / 60000);
      currentCalledRemaining = Math.max(0, duration - elapsedMins);

      if (enableUpdates && !calledToken.notified_your_turn) {
        const roomNumber = doc.room_number || "G-12";
        const msg = `It is now your turn.\n\nPlease proceed to Room ${roomNumber}.`;
        await sendWhatsApp(mapToken(calledToken), "your_turn", msg);
        tokenUpdates.push({ id: calledToken.id, updates: { notified_your_turn: true } });
      }
    }

    const waitingTokens = docTokens
      .filter((t: any) => t.status === TokenStatus.WAITING)
      .sort((a: any, b: any) => {
        const wa = getPriorityWeight(a.priority);
        const wb = getPriorityWeight(b.priority);
        if (wa !== wb) return wb - wa;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
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
        const trackerLink = `${process.env.APP_URL || "http://localhost:3000"}/?tracker=${token.token_number}`;

        if (token.last_notified_wait_time !== undefined && token.last_notified_wait_time !== null) {
          const diff = Math.abs(estimatedWaitTime - token.last_notified_wait_time);
          if (diff >= threshold) {
            const msg = `Queue Update\n\nYour revised estimated waiting time is:\n${estimatedWaitTime} minutes\n\nExpected consultation:\n${expectedStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}\n\nTrack live queue:\n${trackerLink}`;
            await sendWhatsApp({ ...mapToken(token), estimatedWaitTime }, "update", msg);
            updates.last_notified_wait_time = estimatedWaitTime;
          }
        } else {
          const welcomeMsg = `🏥 Welcome to ${hospitalName}\n\nHello ${token.patient_name}\n\nYour Token:\n${token.token_number}\n\nDepartment:\n${token.department_name}\n\nPatients Ahead:\n${i}\n\nEstimated Waiting Time:\n${estimatedWaitTime} minutes\n\nExpected Consultation Time:\n${expectedStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}\n\nTrack your queue here:\n${trackerLink}`;
          await sendWhatsApp({ ...mapToken(token), estimatedWaitTime }, "welcome", welcomeMsg);
          updates.last_notified_wait_time = estimatedWaitTime;
        }

        if (i === 2 && !token.notified_two_remaining) {
          const remainMsg = `Only 2 patients remain before your consultation.\n\nPlease proceed near the consultation room.`;
          await sendWhatsApp({ ...mapToken(token), estimatedWaitTime }, "two_remaining", remainMsg);
          updates.notified_two_remaining = true;
        }
      }

      tokenUpdates.push({ id: token.id, updates });
      const patientDuration = token.estimated_consultation_time || doc.avg_consultation_time || 15;
      accumulatedWait += patientDuration;
    }
  }

  for (const { id, updates } of tokenUpdates) {
    await supabase.from("tokens").update(updates).eq("id", id);
  }
}

// ── "2 patients ahead" email notifications ───────────────────────────────────

export async function notifyTwoAheadPatients(
  departmentId: string,
  sendEmailFn: (
    email: string, name: string, tokenNum: string,
    deptName: string, docName: string, msg: string,
    tokenId: string, expectedTime?: string
  ) => Promise<void>
) {
  const queue = await computeWaitingQueue(departmentId);
  if (!queue || queue.length === 0) return;

  for (const t of queue) {
    await supabase.from("tokens").update({
      position: t.patientsAhead + 1,
      estimated_wait_time: t.estimatedWaitMinutes,
      expected_consultation_start_time: t.expectedConsultTime,
    }).eq("id", t.id);
  }

  const twoAheadPatient = queue.find(t => t.patientsAhead === 2 && !t.notified_two_ahead);
  if (!twoAheadPatient) return;

  const msg = `Only 2 patients ahead of you. Please move to the waiting area near ${twoAheadPatient.department_name}. Estimated wait: ~${twoAheadPatient.estimatedWaitMinutes} mins.`;

  if (twoAheadPatient.patient_email) {
    await sendEmailFn(
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

  await supabase.from("tokens").update({ notified_two_ahead: true }).eq("id", twoAheadPatient.id);
}

// ── Department-action authorization check ────────────────────────────────────

export async function authorizeDeptAction(
  tokenId: string,
  req: VercelRequest,
  res: VercelResponse
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
