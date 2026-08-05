import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../_lib/supabase.js";
import { mapDept } from "../../_lib/mappers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query as { id: string };

  // PUT /api/admin/departments/:id — update
  if (req.method === "PUT") {
    const { name, prefix, description, isEnabled, defaultConsultationTime } = req.body || {};
    const updates: any = {};
    if (name) updates.name = name.trim();
    if (prefix) {
      const cleanPrefix = prefix.trim().toUpperCase();
      const { data: existing } = await supabase.from("departments").select("id").eq("prefix", cleanPrefix).neq("id", id);
      if (existing?.length) {
        return res.status(400).json({ success: false, message: "Department prefix already exists" });
      }
      updates.prefix = cleanPrefix;
    }
    if (description !== undefined) updates.description = description.trim();
    if (isEnabled !== undefined) updates.is_enabled = isEnabled;
    if (defaultConsultationTime !== undefined) {
      updates.default_consultation_time = defaultConsultationTime ? parseInt(defaultConsultationTime) : 15;
    }

    const { data } = await supabase.from("departments").update(updates).eq("id", id).select();
    if (!data?.length) return res.status(404).json({ success: false, message: "Department not found" });
    return res.status(200).json({ success: true, department: mapDept(data[0]) });
  }

  // DELETE /api/admin/departments/:id
  if (req.method === "DELETE") {
    await supabase.from("departments").delete().eq("id", id);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, message: "Method not allowed" });
}
