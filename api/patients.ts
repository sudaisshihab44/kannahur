import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "./_lib/supabase.js";
import { mapPatient } from "./_lib/mappers.js";
import { Gender } from "../src/types.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const { name, mobile, age, gender, email } = req.body || {};

    if (!name || !mobile) {
      return res.status(400).json({ success: false, message: "Patient name and mobile are required." });
    }

    const cleanMobile = mobile.trim();
    const cleanName = name.trim();

    const { data: existing } = await supabase.from("patients").select("*").eq("mobile", cleanMobile);
    if (existing?.length) {
      return res.status(200).json(mapPatient(existing[0]));
    }

    const newPatient = {
      id: `pat-${Date.now()}`,
      name: cleanName,
      mobile: cleanMobile,
      email: (email || "").trim(),
      age: parseInt(age) || 30,
      gender: gender || Gender.MALE,
      created_at: new Date().toISOString(),
    };

    const { data: patData, error: patError } = await supabase
      .from("patients")
      .insert(newPatient)
      .select();

    if (patError || !patData?.length) {
      return res.status(500).json({ success: false, message: patError?.message || "Failed to create patient record." });
    }

    return res.status(200).json(mapPatient(patData[0]));
  } catch (err: any) {
    console.error("[/api/patients]", err);
    return res.status(500).json({ success: false, message: err.message || "Unexpected server error." });
  }
}
