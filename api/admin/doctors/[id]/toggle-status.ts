import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../../_lib/supabase.js";
import { mapDoctor } from "../../../_lib/mappers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const { id } = req.query as { id: string };

  const { data: rows } = await supabase.from("doctors").select("status").eq("id", id);
  if (!rows?.length) return res.status(404).json({ success: false, message: "Doctor not found" });

  const newStatus = rows[0].status === "active" ? "inactive" : "active";
  const { data, error } = await supabase.from("doctors").update({ status: newStatus }).eq("id", id).select();

  if (error || !data?.length) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to toggle doctor status" });
  }

  return res.status(200).json({ success: true, doctor: mapDoctor(data[0]) });
}
