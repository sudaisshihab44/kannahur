import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../_lib/supabase.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // DELETE /api/settings/announcements/:id
  if (req.method === "DELETE") {
    const { id } = req.query as { id: string };
    const { data: rows } = await supabase.from("settings").select("announcements").limit(1);
    const anns = (rows?.[0]?.announcements || []).filter((a: any) => a.id !== id);
    await supabase.from("settings").update({ announcements: anns }).eq("id", 1);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, message: "Method not allowed" });
}
