import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../_lib/supabase.js";
import { mapToken } from "../../_lib/mappers.js";
import {
  addQueueLog, recalculateQueueWaitTimes,
  notifyTwoAheadPatients, getTokenRow, authorizeDeptAction,
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

    const { data: calledToken, error: updateError } = await supabase
      .from("tokens")
      .update({ status: TokenStatus.CALLED, called_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (updateError || !calledToken) {
      return res.status(500).json({ success: false, message: updateError?.message || "Failed to update token status." });
    }

    await addQueueLog(id, row.token_number, "called");

    const { data: docData } = await supabase
      .from("doctors")
      .select("room_number")
      .eq("id", calledToken.doctor_id)
      .maybeSingle();
    const roomStr = docData?.room_number ? `Room ${docData.room_number}` : "the consultation room";

    if (calledToken.patient_email?.trim() && !calledToken.notified_your_turn) {
      const msg = `It's your turn now! Please proceed to ${roomStr} to see Dr. ${calledToken.doctor_name}.`;
      await sendEmail(
        calledToken.patient_email.trim(),
        calledToken.patient_name,
        calledToken.token_number,
        calledToken.department_name,
        calledToken.doctor_name,
        msg,
        calledToken.id,
        new Date().toISOString()
      );
      await supabase.from("tokens").update({ notified_your_turn: true }).eq("id", calledToken.id);
    }

    await recalculateQueueWaitTimes();
    await notifyTwoAheadPatients(calledToken.department_id, sendEmail);

    const updated = await getTokenRow(id);
    return res.status(200).json({ success: true, token: mapToken(updated) });
  } catch (err: any) {
    console.error("[/api/tokens/[id]/call]", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to call token." });
  }
}
