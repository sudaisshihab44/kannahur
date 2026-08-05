import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "./_lib/supabase.js";
import { mapDevice } from "./_lib/mappers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // GET /api/devices
  if (req.method === "GET") {
    try {
      const { data, error } = await supabase
        .from("tracking_devices")
        .select("*")
        .order("id", { ascending: true });
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true, devices: (data || []).map(mapDevice) });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err?.message || "Device query failed" });
    }
  }

  // POST /api/devices  — create new device
  if (req.method === "POST") {
    try {
      const { deviceCode, name } = req.body || {};
      if (!deviceCode) return res.status(400).json({ success: false, message: "Device code is required." });

      const newDevice = {
        id: `dev-${Date.now()}`,
        device_code: deviceCode.trim().toUpperCase(),
        name: (name || `Smart Pager ${deviceCode}`).trim(),
        status: "available",
        battery_level: 100,
        last_seen_at: new Date().toISOString(),
      };

      const { data, error } = await supabase.from("tracking_devices").insert(newDevice).select().single();
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true, device: mapDevice(data) });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err?.message || "Failed to create device" });
    }
  }

  return res.status(405).json({ success: false, message: "Method not allowed" });
}
