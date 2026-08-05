import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../_lib/supabase.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const { tokenId } = req.query as { tokenId: string };

    const { data: myToken, error: tokenErr } = await supabase
      .from("tokens")
      .select("*")
      .eq("id", tokenId)
      .single();

    if (tokenErr || !myToken) {
      return res.status(404).json({ success: false, message: "Token not found." });
    }

    const { data: currentServing } = await supabase
      .from("tokens")
      .select("*")
      .eq("department_id", myToken.department_id)
      .eq("status", "called")
      .order("called_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: aheadList } = await supabase
      .from("tokens")
      .select("token_number")
      .eq("department_id", myToken.department_id)
      .eq("status", "waiting")
      .lt("position", myToken.position)
      .order("position", { ascending: true });

    return res.status(200).json({
      success: true,
      myToken,
      currentServing: currentServing || null,
      aheadCount: aheadList?.length ?? 0,
    });
  } catch (err: any) {
    console.error("[/api/track/[tokenId]]", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to fetch tracking data." });
  }
}
