import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "./_lib/supabase.js";
import {
  mapDept, mapDoctor, mapPatient, mapToken,
  mapRoom, mapUser, mapQueueLog, mapDevice, mapSettings,
} from "./_lib/mappers.js";
import { ensureDefaultCredentials } from "./_lib/seed.js";

// Run seed/verification once per cold start (non-blocking)
let seeded = false;
if (!seeded) {
  seeded = true;
  ensureDefaultCredentials().catch((e) =>
    console.warn("[seed]", e?.message || e)
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const [
      { data: depts },
      { data: docs },
      { data: usersData },
      { data: patientsData },
      { data: tokensData },
      { data: rooms },
      { data: logsData },
      { data: waLogs },
      { data: settingsData },
    ] = await Promise.all([
      supabase.from("departments").select("*"),
      supabase.from("doctors").select("*"),
      supabase.from("users").select("*"),
      supabase.from("patients").select("*").order("created_at", { ascending: false }),
      supabase.from("tokens").select("*").order("created_at", { ascending: true }),
      supabase.from("consultation_rooms").select("*"),
      supabase.from("queue_logs").select("*").order("timestamp", { ascending: false }).limit(200),
      supabase.from("whatsapp_logs").select("*").order("timestamp", { ascending: false }).limit(100),
      supabase.from("settings").select("*").limit(1),
    ]);

    let devicesData: any[] = [];
    try {
      const { data: devs } = await supabase
        .from("tracking_devices")
        .select("*")
        .order("id", { ascending: true });
      devicesData = devs || [];
    } catch (_) {
      // table not yet migrated — safe to return empty array
    }

    const settingsRow = settingsData?.[0];

    return res.status(200).json({
      departments: (depts || []).map(mapDept),
      doctors: (docs || []).map(mapDoctor),
      users: (usersData || []).map(mapUser),
      patients: (patientsData || []).map(mapPatient),
      tokens: (tokensData || []).map(mapToken),
      consultation_rooms: (rooms || []).map(mapRoom),
      queue_logs: (logsData || []).map(mapQueueLog),
      whatsapp_logs: waLogs || [],
      devices: devicesData.map(mapDevice),
      settings: settingsRow ? mapSettings(settingsRow) : null,
    });
  } catch (err: any) {
    console.error("[/api/data]", err);
    return res.status(500).json({ success: false, message: "Database error" });
  }
}
