import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../_lib/supabase.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const {
      name, tagline, address, phone, logoUrl, logoColor,
      workingHours, queueOperatingHours,
      registrationNumber, email, city, state, country, pincode,
      website, description, emergencyContact,
    } = req.body || {};

    const { data: rows, error: selectErr } = await supabase
      .from("settings")
      .select("hospital_info")
      .limit(1);

    if (selectErr) return res.status(500).json({ success: false, message: selectErr.message });

    const hospitalInfo = { ...(rows?.[0]?.hospital_info || {}) };

    if (name !== undefined) hospitalInfo.name = name.trim();
    if (tagline !== undefined) hospitalInfo.tagline = tagline.trim();
    if (address !== undefined) hospitalInfo.address = address.trim();
    if (phone !== undefined) hospitalInfo.phone = phone.trim();
    if (logoUrl !== undefined) hospitalInfo.logoUrl = logoUrl ? logoUrl.trim() : "";
    if (logoColor !== undefined) hospitalInfo.logoColor = logoColor.trim();
    if (workingHours !== undefined) hospitalInfo.workingHours = workingHours.trim();
    if (queueOperatingHours !== undefined) hospitalInfo.queueOperatingHours = queueOperatingHours.trim();
    if (registrationNumber !== undefined) hospitalInfo.registrationNumber = registrationNumber.trim();
    if (email !== undefined) hospitalInfo.email = email.trim();
    if (city !== undefined) hospitalInfo.city = city.trim();
    if (state !== undefined) hospitalInfo.state = state.trim();
    if (country !== undefined) hospitalInfo.country = country.trim();
    if (pincode !== undefined) hospitalInfo.pincode = pincode.trim();
    if (website !== undefined) hospitalInfo.website = website.trim();
    if (description !== undefined) hospitalInfo.description = description.trim();
    if (emergencyContact !== undefined) hospitalInfo.emergencyContact = emergencyContact.trim();

    const { error: updateErr } = await supabase
      .from("settings")
      .update({ hospital_info: hospitalInfo })
      .eq("id", 1);

    if (updateErr) return res.status(500).json({ success: false, message: updateErr.message });

    return res.status(200).json({ success: true, hospitalInfo });
  } catch (err: any) {
    console.error("[/api/admin/hospital-info]", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to update hospital info" });
  }
}
