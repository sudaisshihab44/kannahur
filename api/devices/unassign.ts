import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../_lib/supabase.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const { deviceId } = req.body || {};
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
      last_seen_at: new Date().toISOString(),
    }).eq("id", deviceId);

    return res.status(200).json({ success: true, message: `Device ${deviceRow.device_code} is now available.` });
  } catch (err: any) {
    console.error("[/api/devices/unassign]", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to unassign device." });
  }
}
