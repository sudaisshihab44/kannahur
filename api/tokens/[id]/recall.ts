import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../_lib/supabase.js";
import { mapToken } from "../../_lib/mappers.js";
import { addQueueLog, getTokenRow, authorizeDeptAction } from "../../_lib/queue.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const { id } = req.query as { id: string };

    if (!await authorizeDeptAction(id, req, res)) return;

    const row = await getTokenRow(id);
    if (!row) return res.status(404).json({ success: false, message: "Token not found" });

    await supabase.from("tokens").update({ called_at: new Date().toISOString() }).eq("id", id);
    await addQueueLog(id, row.token_number, "recalled");

    const updated = await getTokenRow(id);
    return res.status(200).json({ success: true, token: mapToken(updated) });
  } catch (err: any) {
    console.error("[/api/tokens/[id]/recall]", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to recall token." });
  }
}
