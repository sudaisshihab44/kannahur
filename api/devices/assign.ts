import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../_lib/supabase.js";
import { addQueueLog } from "../_lib/queue.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const { deviceId, tokenId } = req.body || {};
    if (!deviceId || !tokenId) {
      return res.status(400).json({ success: false, message: "deviceId and tokenId are required." });
    }

    const [{ data: tokenRow }, { data: deviceRow }] = await Promise.all([
      supabase.from("tokens").select("*").eq("id", tokenId).single(),
      supabase.from("tracking_devices").select("*").eq("id", deviceId).single(),
    ]);

    if (!tokenRow || !deviceRow) {
      return res.status(404).json({ success: false, message: "Token or device not found." });
    }

    await supabase.from("tracking_devices").update({
      status: "in_use",
      assigned_token_id: tokenId,
      assigned_token_number: tokenRow.token_number,
      last_seen_at: new Date().toISOString(),
    }).eq("id", deviceId);

    await supabase.from("tokens").update({ device_id: deviceId }).eq("id", tokenId);

    await addQueueLog(tokenId, tokenRow.token_number, "assigned_depts", `Assigned Hardware Pager ${deviceRow.device_code}`);

    return res.status(200).json({
      success: true,
      message: `Device ${deviceRow.device_code} assigned to ${tokenRow.token_number}.`,
    });
  } catch (err: any) {
    console.error("[/api/devices/assign]", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to assign device." });
  }
}
