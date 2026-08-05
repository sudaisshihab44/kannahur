/**
 * api/tokens.ts — Token router (Function #2 of 4)
 *
 * Handles all token endpoints:
 *   POST /api/tokens                    — create token
 *   POST /api/tokens/:id/call
 *   POST /api/tokens/:id/complete
 *   POST /api/tokens/:id/skip
 *   POST /api/tokens/:id/cancel
 *   POST /api/tokens/:id/recall
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "./_lib/supabase.js";
import { mapDept, mapDoctor, mapToken, mapUser } from "./_lib/mappers.js";
import {
  addQueueLog, recalculateQueueWaitTimes,
  notifyTwoAheadPatients, getTokenRow, authorizeDeptAction,
  computeWaitingQueue,
} from "./_lib/queue.js";
import { sendEmail } from "./_lib/email.js";
import { TokenStatus, UserRole, Gender } from "../src/types.js";

function send(res: VercelResponse, status: number, body: unknown) {
  return res.status(status).json(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method } = req;
  const path = (req.url ?? "/").split("?")[0].replace(/\/$/, "");

  if (method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,x-operator-username");
    return res.status(204).end();
  }

  try {
    // ── POST /api/tokens — create ──────────────────────────────────────────────
    if (path === "/api/tokens" && method === "POST") {
      const {
        patientName, patientMobile, patientEmail, patientAge, patientGender,
        departmentId, doctorId, reasonForVisit, priority, estimatedConsultationTime,
        customMessage,
      } = req.body || {};

      if (!patientName || !patientMobile || !departmentId || !doctorId) {
        return send(res, 400, { success: false, message: "Missing required fields: patientName, patientMobile, departmentId, doctorId." });
      }

      const [{ data: depts }, { data: docs }] = await Promise.all([
        supabase.from("departments").select("*").eq("id", departmentId),
        supabase.from("doctors").select("*").eq("id", doctorId),
      ]);
      if (!depts?.length || !docs?.length)
        return send(res, 400, { success: false, message: "Invalid department or doctor selection" });

      const department = mapDept(depts[0]);
      const doctor = mapDoctor(docs[0]);
      const operatorUsername = req.headers["x-operator-username"] as string;

      // Priority authorization
      let finalPriority = (priority || "Normal").trim();
      if (finalPriority !== "Normal" && operatorUsername) {
        const { data: opRows } = await supabase.from("users").select("*").ilike("username", operatorUsername.trim());
        const op = opRows?.[0] ? mapUser(opRows[0]) : null;
        if (!op || (op.role !== UserRole.ADMIN && !op.permissions?.includes("set_priority"))) finalPriority = "Normal";
      } else if (finalPriority !== "Normal") {
        finalPriority = "Normal";
      }

      // Department authorization for receptionists
      if (operatorUsername) {
        const { data: opRows } = await supabase.from("users").select("*").ilike("username", operatorUsername.trim());
        const op = opRows?.[0] ? mapUser(opRows[0]) : null;
        if (op && op.role === UserRole.RECEPTIONIST) {
          const assignedDepts = op.assignedDepartmentIds || (op.departmentId ? [op.departmentId] : []);
          if (!assignedDepts.includes(departmentId))
            return send(res, 403, { success: false, message: "You are not authorized to generate tokens for this department." });
        }
      }

      // Token number
      const prefix = department.prefix || "GEN";
      const todayStr = new Date().toISOString().split("T")[0];
      const { data: todayTokens } = await supabase.from("tokens").select("id").eq("department_id", departmentId).gte("created_at", todayStr);
      const tokenNumber = `${prefix}-${String((todayTokens?.length || 0) + 1).padStart(3, "0")}`;

      // Queue position
      const { data: waitingTokens } = await supabase.from("tokens").select("id").eq("status", TokenStatus.WAITING);
      const position = (waitingTokens?.length || 0) + 1;

      const newToken = {
        id: `tok-${Date.now()}`,
        token_number: tokenNumber,
        patient_name: patientName.trim(),
        patient_mobile: patientMobile.trim(),
        patient_email: patientEmail?.trim() || null,
        patient_age: parseInt(patientAge) || 30,
        patient_gender: patientGender || Gender.MALE,
        department_id: departmentId,
        department_name: department.name,
        doctor_id: doctorId,
        doctor_name: doctor.name,
        reason_for_visit: (reasonForVisit || "").trim(),
        status: TokenStatus.WAITING,
        created_at: new Date().toISOString(),
        is_emergency: finalPriority !== "Normal",
        priority: finalPriority,
        position,
        estimated_consultation_time: estimatedConsultationTime ? parseInt(estimatedConsultationTime) : null,
      };

      // Ensure patient record exists
      const { data: existingPat } = await supabase.from("patients").select("id").eq("mobile", patientMobile.trim());
      if (!existingPat?.length) {
        await supabase.from("patients").insert({
          id: `pat-${Date.now()}`,
          name: patientName.trim(),
          mobile: patientMobile.trim(),
          email: patientEmail?.trim() || null,
          age: parseInt(patientAge) || 30,
          gender: patientGender || Gender.MALE,
          created_at: new Date().toISOString(),
        });
      }

      const { data: inserted, error: insertError } = await supabase.from("tokens").insert(newToken).select();
      if (insertError || !inserted?.length) {
        console.error("[TOKEN INSERT ERROR]", insertError);
        return send(res, 500, { success: false, message: insertError?.message || "Token insert failed." });
      }

      const token = mapToken(inserted[0]);
      await addQueueLog(token.id, token.tokenNumber, "created");
      await recalculateQueueWaitTimes();

      if (token.patientEmail?.trim()) {
        const queue = await computeWaitingQueue(token.departmentId);
        const entry = queue.find((t: any) => t.id === token.id);
        await sendEmail(token.patientEmail.trim(), token.patientName, token.tokenNumber,
          token.departmentName, token.doctorName,
          customMessage || "Please wait for your queue number to be called.",
          token.id, entry?.expectedConsultTime);
      }

      return send(res, 200, { success: true, token });
    }

    // ── Token action routes: POST /api/tokens/:id/:action ─────────────────────
    const actionMatch = path.match(/^\/api\/tokens\/([^/]+)\/(call|complete|skip|cancel|recall)$/);
    if (actionMatch && method === "POST") {
      const [, id, action] = actionMatch;

      if (!await authorizeDeptAction(id, req, res)) return;
      const row = await getTokenRow(id);
      if (!row) return send(res, 404, { success: false, message: "Token not found" });

      if (action === "call") {
        const { data: calledToken, error: updateError } = await supabase
          .from("tokens")
          .update({ status: TokenStatus.CALLED, called_at: new Date().toISOString() })
          .eq("id", id).select().single();

        if (updateError || !calledToken)
          return send(res, 500, { success: false, message: updateError?.message || "Failed to update token status." });

        await addQueueLog(id, row.token_number, "called");

        const { data: docData } = await supabase.from("doctors").select("room_number").eq("id", calledToken.doctor_id).maybeSingle();
        const roomStr = docData?.room_number ? `Room ${docData.room_number}` : "the consultation room";

        if (calledToken.patient_email?.trim() && !calledToken.notified_your_turn) {
          await sendEmail(
            calledToken.patient_email.trim(), calledToken.patient_name,
            calledToken.token_number, calledToken.department_name, calledToken.doctor_name,
            `It's your turn now! Please proceed to ${roomStr} to see Dr. ${calledToken.doctor_name}.`,
            calledToken.id, new Date().toISOString()
          );
          await supabase.from("tokens").update({ notified_your_turn: true }).eq("id", calledToken.id);
        }

        await recalculateQueueWaitTimes();
        await notifyTwoAheadPatients(calledToken.department_id, sendEmail);
      }

      if (action === "complete") {
        await supabase.from("tokens").update({ status: TokenStatus.COMPLETED, completed_at: new Date().toISOString() }).eq("id", id);
        if (row.device_id) {
          await supabase.from("tracking_devices").update({
            status: "available", assigned_token_id: null, assigned_token_number: null,
            last_seen_at: new Date().toISOString(),
          }).eq("id", row.device_id);
        }
        await addQueueLog(id, row.token_number, "completed");
        await recalculateQueueWaitTimes();
        await notifyTwoAheadPatients(row.department_id, sendEmail);
      }

      if (action === "skip") {
        await supabase.from("tokens").update({ status: TokenStatus.SKIPPED }).eq("id", id);
        await addQueueLog(id, row.token_number, "skipped");
        await notifyTwoAheadPatients(row.department_id, sendEmail);
      }

      if (action === "cancel") {
        await supabase.from("tokens").update({ status: TokenStatus.CANCELLED }).eq("id", id);
        if (row.device_id) {
          await supabase.from("tracking_devices").update({
            status: "available", assigned_token_id: null, assigned_token_number: null,
            last_seen_at: new Date().toISOString(),
          }).eq("id", row.device_id);
        }
        await addQueueLog(id, row.token_number, "cancelled");
        await notifyTwoAheadPatients(row.department_id, sendEmail);
      }

      if (action === "recall") {
        await supabase.from("tokens").update({ called_at: new Date().toISOString() }).eq("id", id);
        await addQueueLog(id, row.token_number, "recalled");
      }

      const updated = await getTokenRow(id);
      return send(res, 200, { success: true, token: mapToken(updated) });
    }

    return send(res, 404, { success: false, message: `No route: ${method} ${path}` });

  } catch (err: any) {
    console.error(`[api/tokens] ${method} ${path}`, err);
    return send(res, 500, { success: false, message: err.message || "Internal server error" });
  }
}
