import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../_lib/supabase.js";
import { mapRoom } from "../_lib/mappers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // POST /api/admin/rooms — create
  if (req.method === "POST") {
    const { roomNumber, roomName, assignedDoctorId, departmentId, status, displayScreenId } = req.body || {};
    if (!roomNumber || !roomName) {
      return res.status(400).json({ success: false, message: "Room number and name are required" });
    }
    const newRoom = {
      id: `rm-${Date.now()}`,
      room_number: roomNumber.trim(),
      room_name: roomName.trim(),
      assigned_doctor_id: assignedDoctorId || null,
      department_id: departmentId || null,
      status: status || "available",
      display_screen_id: (displayScreenId || "").trim(),
    };
    const { data, error } = await supabase.from("consultation_rooms").insert(newRoom).select();
    if (error || !data?.length) {
      return res.status(500).json({ success: false, message: error?.message || "Failed to create room" });
    }
    return res.status(200).json({ success: true, room: mapRoom(data[0]) });
  }

  return res.status(405).json({ success: false, message: "Method not allowed" });
}
