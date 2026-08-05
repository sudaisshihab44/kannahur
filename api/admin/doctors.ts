import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../_lib/supabase.js";
import { mapDoctor } from "../_lib/mappers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // POST /api/admin/doctors — create
  if (req.method === "POST") {
    const { name, departmentId, specialization, status, roomNumber, avgConsultationTime, startTime, endTime, maxPatientsPerDay, isEnabled } = req.body || {};
    if (!name || !departmentId) {
      return res.status(400).json({ success: false, message: "Doctor name and department are required" });
    }
    const newDoc = {
      id: `doc-${Date.now()}`,
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
    if (error || !data?.length) {
      return res.status(500).json({ success: false, message: error?.message || "Failed to create doctor" });
    }
    return res.status(200).json({ success: true, doctor: mapDoctor(data[0]) });
  }

  return res.status(405).json({ success: false, message: "Method not allowed" });
}
