import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../_lib/supabase.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // POST /api/settings/announcements  — add new announcement
  if (req.method === "POST") {
    const { text } = req.body || {};
    if (!text?.trim()) {
      return res.status(400).json({ success: false, message: "Announcement text cannot be empty" });
    }

    const { data: rows } = await supabase.from("settings").select("announcements").limit(1);
    const anns = rows?.[0]?.announcements || [];
    const newAnn = { id: `ann-${Date.now()}`, text: text.trim(), createdAt: new Date().toISOString() };
    anns.unshift(newAnn);
    await supabase.from("settings").update({ announcements: anns }).eq("id", 1);
    return res.status(200).json({ success: true, announcement: newAnn });
  }

  return res.status(405).json({ success: false, message: "Method not allowed" });
}
