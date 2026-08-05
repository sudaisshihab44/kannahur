import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../_lib/supabase.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const { data: rows } = await supabase.from("settings").select("is_paused").limit(1);
    const newPaused = !rows?.[0]?.is_paused;
    await supabase.from("settings").update({ is_paused: newPaused }).eq("id", 1);
    return res.status(200).json({ success: true, isPaused: newPaused });
  } catch (err: any) {
    console.error("[/api/settings/toggle-pause]", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}
