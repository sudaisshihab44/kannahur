import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "./_lib/supabase.js";
import { mapDept, mapDoctor, mapToken, mapUser } from "./_lib/mappers.js";
import { addQueueLog, recalculateQueueWaitTimes, computeWaitingQueue } from "./_lib/queue.js";
import { sendEmail } from "./_lib/email.js";
import { TokenStatus, UserRole, Gender } from "../src/types.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const {
      patientName, patientMobile, patientEmail, patientAge, patientGender,
      departmentId, doctorId, reasonForVisit, priority, estimatedConsultationTime,
      customMessage,
    } = req.body || {};

    if (!patientName || !patientMobile || !departmentId || !doctorId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: patientName, patientMobile, departmentId, doctorId.",
      });
    }

    const [{ data: depts }, { data: docs }] = await Promise.all([
      supabase.from("departments").select("*").eq("id", departmentId),
      supabase.from("doctors").select("*").eq("id", doctorId),
    ]);

    if (!depts?.length || !docs?.length) {
      return res.status(400).json({ success: false, message: "Invalid department or doctor selection" });
    }

    const department = mapDept(depts[0]);
    const doctor = mapDoctor(docs[0]);
    const operatorUsername = req.headers["x-operator-username"] as string;

    // --- Priority authorization ---
    let finalPriority = (priority || "Normal").trim();
    if (finalPriority !== "Normal" && operatorUsername) {
      const { data: opRows } = await supabase.from("users").select("*").ilike("username", operatorUsername.trim());
      const op = opRows?.[0] ? mapUser(opRows[0]) : null;
      const isAuthorized = op && (op.role === UserRole.ADMIN || op.permissions?.includes("set_priority"));
      if (!isAuthorized) finalPriority = "Normal";
    } else if (finalPriority !== "Normal") {
      finalPriority = "Normal";
    }

    // --- Department authorization for receptionists ---
    if (operatorUsername) {
      const { data: opRows } = await supabase.from("users").select("*").ilike("username", operatorUsername.trim());
      const op = opRows?.[0] ? mapUser(opRows[0]) : null;
      if (op && op.role === UserRole.RECEPTIONIST) {
        const assignedDepts = op.assignedDepartmentIds || (op.departmentId ? [op.departmentId] : []);
        if (!assignedDepts.includes(departmentId)) {
          return res.status(403).json({ success: false, message: "You are not authorized to generate tokens for this department." });
        }
      }
    }

    // --- Token number ---
    const prefix = department.prefix || "GEN";
    const todayStr = new Date().toISOString().split("T")[0];
    const { data: todayTokens } = await supabase
      .from("tokens")
      .select("id")
      .eq("department_id", departmentId)
      .gte("created_at", todayStr);
    const nextSeqNum = (todayTokens?.length || 0) + 1;
    const tokenNumber = `${prefix}-${String(nextSeqNum).padStart(3, "0")}`;

    // --- Queue position ---
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

    // --- Ensure patient record exists ---
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
      return res.status(500).json({
        success: false,
        message: insertError?.message || "Token insert failed.",
      });
    }

    const token = mapToken(inserted[0]);
    await addQueueLog(token.id, token.tokenNumber, "created");
    await recalculateQueueWaitTimes();

    // --- Send confirmation email ---
    if (token.patientEmail?.trim()) {
      const queue = await computeWaitingQueue(token.departmentId);
      const entry = queue.find((t: any) => t.id === token.id);
      await sendEmail(
        token.patientEmail.trim(),
        token.patientName,
        token.tokenNumber,
        token.departmentName,
        token.doctorName,
        customMessage || "Please wait for your queue number to be called.",
        token.id,
        entry?.expectedConsultTime
      );
    }

    return res.status(200).json({ success: true, token });
  } catch (err: any) {
    console.error("[/api/tokens]", err);
    return res.status(500).json({ success: false, message: err.message || "Unexpected server error." });
  }
}
