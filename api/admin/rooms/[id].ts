import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../_lib/supabase.js";
import { mapRoom } from "../../_lib/mappers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query as { id: string };

  // PUT /api/admin/rooms/:id — update
  if (req.method === "PUT") {
    const { roomNumber, roomName, assignedDoctorId, departmentId, status, displayScreenId } = req.body || {};
    const updates: any = {};
    if (roomNumber) updates.room_number = roomNumber.trim();
    if (roomName) updates.room_name = roomName.trim();
    if (assignedDoctorId !== undefined) updates.assigned_doctor_id = assignedDoctorId;
    if (departmentId !== undefined) updates.department_id = departmentId;
    if (status) updates.status = status;
    if (displayScreenId !== undefined) updates.display_screen_id = displayScreenId.trim();

    const { data } = await supabase.from("consultation_rooms").update(updates).eq("id", id).select();
    if (!data?.length) return res.status(404).json({ success: false, message: "Room not found" });
    return res.status(200).json({ success: true, room: mapRoom(data[0]) });
  }

  // DELETE /api/admin/rooms/:id
  if (req.method === "DELETE") {
    await supabase.from("consultation_rooms").delete().eq("id", id);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, message: "Method not allowed" });
}
