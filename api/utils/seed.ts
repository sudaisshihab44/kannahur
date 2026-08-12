/**
 * api/utils/seed.ts
 *
 * Database seeding utility — ensures default settings, admin/reception users, and tracking devices.
 * Moved from api/_lib/seed.ts during enterprise refactor.
 */
import { supabase } from "../config/supabase.js";

/**
 * Verifies default settings, admin, reception, and tracking device seeds.
 * Called once per cold start from api/index.ts data endpoint.
 */
export async function ensureDefaultCredentials() {
  try {
    console.log("[InclusyQ] Verifying default settings and credentials in Supabase...");

    const defaultHospitalInfo = {
      name: "St. Jude Memorial Hospital",
      tagline: "Compassionate Care, Advanced Medicine",
      address: "742 Evergreen Terrace, Medical District, Sector 4",
      phone: "+1 (555) 010-9900",
      logoColor: "text-blue-600",
    };

    const defaultAnnouncements = [
      { id: "ann-1", text: "Welcome to St. Jude Memorial Hospital. Please wait for your token to flash on the live queue TV display.", createdAt: "2026-07-17T08:00:00Z" },
      { id: "ann-2", text: "Note: Patients under emergency token designations will be expedited immediately to critical care units.", createdAt: "2026-07-17T08:05:00Z" },
    ];

    const defaultConfig = {
      tokenPrefix: "",
      dailyTokenReset: true,
      queueStartNumber: 1,
      emergencyQueue: true,
      walkInQueue: true,
      maxQueueSize: 100,
      defaultWaitingTime: 15,
      numberFormat: "001",
      maxDailyTokens: 500,
      emergencyTokenPrefix: "EMR",
      vipTokenPrefix: "VIP",
      walkInTokenPrefix: "WLK",
      consultationStartTime: "09:00",
      consultationEndTime: "17:00",
      autoSkipTimeout: 180,
      maxWaitingTime: 120,
      minWaitTimeNotificationThreshold: 5,
      enableWhatsAppUpdates: true,
    };

    const { data: settingsData } = await supabase.from("settings").select("*").eq("id", 1);

    if (!settingsData || settingsData.length === 0) {
      await supabase.from("settings").insert({
        id: 1,
        is_paused: false,
        hospital_info: defaultHospitalInfo,
        announcements: defaultAnnouncements,
        config: defaultConfig,
      });
    } else {
      const row = settingsData[0];
      if (!row.hospital_info || !row.config || !row.announcements || row.announcements.length === 0) {
        await supabase.from("settings").update({
          hospital_info: row.hospital_info || defaultHospitalInfo,
          announcements: row.announcements?.length ? row.announcements : defaultAnnouncements,
          config: row.config || defaultConfig,
        }).eq("id", 1);
      }
    }

    const { data: depts } = await supabase.from("departments").select("id").limit(1);
    const deptId = depts?.[0]?.id || null;

    // Admin user
    const { data: admins } = await supabase.from("users").select("*").eq("username", "admin");
    if (!admins || admins.length === 0) {
      await supabase.from("users").insert({
        id: "user-admin-default",
        username: "admin",
        name: "Dr. Helen Vance (Chief Administrator)",
        role: "admin",
        permissions: ["manage_hospital", "manage_doctors", "manage_departments", "manage_rooms", "manage_staff", "manage_config"],
        password: "Admin@123",
        is_active: true,
        assigned_department_ids: [],
      });
    } else {
      const a = admins[0];
      if (a.password !== "Admin@123" || a.role !== "admin" || !a.is_active) {
        await supabase.from("users").update({ password: "Admin@123", role: "admin", is_active: true }).eq("username", "admin");
      }
    }

    // Reception user
    const { data: receptions } = await supabase.from("users").select("*").eq("username", "reception");
    if (!receptions || receptions.length === 0) {
      await supabase.from("users").insert({
        id: "user-reception-default",
        username: "reception",
        name: "Claire Redfield (Senior Registrar)",
        role: "receptionist",
        department_id: deptId,
        assigned_department_ids: deptId ? [deptId] : [],
        permissions: ["register_patient", "generate_token", "call_token", "complete_token", "skip_token", "cancel_token", "pause_queue"],
        password: "Reception@123",
        is_active: true,
      });
    } else {
      const r = receptions[0];
      if (r.password !== "Reception@123" || r.role !== "receptionist" || !r.is_active) {
        await supabase.from("users").update({ password: "Reception@123", role: "receptionist", is_active: true }).eq("username", "reception");
      }
    }

    // Tracking devices seed
    try {
      const { data: existingDevs } = await supabase.from("tracking_devices").select("id").limit(1);
      if (!existingDevs || existingDevs.length === 0) {
        await supabase.from("tracking_devices").insert([
          { id: "dev-1", device_code: "DEVICE-01", name: "Smart Pager #01", status: "available", battery_level: 100 },
          { id: "dev-2", device_code: "DEVICE-02", name: "Smart Pager #02", status: "available", battery_level: 95 },
          { id: "dev-3", device_code: "DEVICE-03", name: "Smart Pager #03", status: "available", battery_level: 88 },
          { id: "dev-4", device_code: "DEVICE-04", name: "Smart Pager #04", status: "available", battery_level: 100 },
          { id: "dev-5", device_code: "DEVICE-05", name: "Smart Pager #05", status: "available", battery_level: 72 },
        ]);
      }
    } catch (_) {
      // table not yet created — safe to ignore
    }
  } catch (err: any) {
    console.warn("[InclusyQ] Warning: Database tables may not exist yet.", err?.message || err);
  }
}
