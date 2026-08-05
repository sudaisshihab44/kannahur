import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../_lib/supabase.js";
import { mapDept } from "../_lib/mappers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // POST /api/admin/departments — create
  if (req.method === "POST") {
    const { name, prefix, description, isEnabled, defaultConsultationTime } = req.body || {};
    if (!name || !prefix) {
      return res.status(400).json({ success: false, message: "Department name and prefix are required" });
    }
    const cleanPrefix = prefix.trim().toUpperCase();
    const { data: existing } = await supabase.from("departments").select("id").eq("prefix", cleanPrefix);
    if (existing?.length) {
      return res.status(400).json({ success: false, message: "Department prefix already exists" });
    }
    const newDept = {
      id: `dep-${Date.now()}`,
      name: name.trim(),
      prefix: cleanPrefix,
      description: (description || "").trim(),
      is_enabled: isEnabled !== undefined ? isEnabled : true,
      default_consultation_time: defaultConsultationTime ? parseInt(defaultConsultationTime) : 15,
    };
    const { data, error } = await supabase.from("departments").insert(newDept).select();
    if (error || !data?.length) {
      return res.status(500).json({ success: false, message: error?.message || "Failed to create department" });
    }
    return res.status(200).json({ success: true, department: mapDept(data[0]) });
  }

  return res.status(405).json({ success: false, message: "Method not allowed" });
}
