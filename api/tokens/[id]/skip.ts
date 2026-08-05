import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../_lib/supabase.js";
import { mapToken } from "../../_lib/mappers.js";
import {
  addQueueLog, notifyTwoAheadPatients,
  getTokenRow, authorizeDeptAction,
} from "../../_lib/queue.js";
import { sendEmail } from "../../_lib/email.js";
import { TokenStatus } from "../../../src/types.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const { id } = req.query as { id: string };

    if (!await authorizeDeptAction(id, req, res)) return;

    const row = await getTokenRow(id);
    if (!row) return res.status(404).json({ success: false, message: "Token not found" });

    await supabase.from("tokens").update({ status: TokenStatus.SKIPPED }).eq("id", id);
    await addQueueLog(id, row.token_number, "skipped");
    await notifyTwoAheadPatients(row.department_id, sendEmail);

    const updated = await getTokenRow(id);
    return res.status(200).json({ success: true, token: mapToken(updated) });
  } catch (err: any) {
    console.error("[/api/tokens/[id]/skip]", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to skip token." });
  }
}
