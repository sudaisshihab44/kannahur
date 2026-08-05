import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../_lib/supabase.js";
import { mapDoctor } from "../../_lib/mappers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query as { id: string };

  // PUT /api/admin/doctors/:id — update
  if (req.method === "PUT") {
    const { name, departmentId, specialization, status, roomNumber, avgConsultationTime, startTime, endTime, maxPatientsPerDay, isEnabled } = req.body || {};
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
    if (!data?.length) return res.status(404).json({ success: false, message: "Doctor not found" });
    return res.status(200).json({ success: true, doctor: mapDoctor(data[0]) });
  }

  // DELETE /api/admin/doctors/:id
  if (req.method === "DELETE") {
    await supabase.from("doctors").delete().eq("id", id);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, message: "Method not allowed" });
}
