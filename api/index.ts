/**
 * api/index.ts — Master router (Function #1 of 4)
 *
 * Handles all general endpoints:
 *   GET  /api
 *   GET  /api/data
 *   POST /api/login
 *   GET  /api/queue
 *   POST /api/patients
 *   GET  /api/devices
 *   POST /api/devices
 *   POST /api/devices/assign
 *   POST /api/devices/unassign
 *   POST /api/settings/toggle-pause
 *   POST /api/settings/announcements
 *   DELETE /api/settings/announcements/:id
 *   GET  /api/track/:tokenId
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "./_lib/supabase.js";
import {
  mapDept, mapDoctor, mapPatient, mapToken,
  mapRoom, mapUser, mapQueueLog, mapDevice, mapSettings,
} from "./_lib/mappers.js";
import { computeWaitingQueue } from "./_lib/queue.js";
import { ensureDefaultCredentials } from "./_lib/seed.js";
import { Gender, UserRole } from "../src/types.js";

// Seed once per cold start (non-blocking)
let seeded = false;
if (!seeded) {
  seeded = true;
  ensureDefaultCredentials().catch((e) => console.warn("[seed]", e?.message || e));
}

// ─── tiny inline router ────────────────────────────────────────────────────────

function send(res: VercelResponse, status: number, body: unknown) {
  return res.status(status).json(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method } = req;
  // Strip query string from path, normalise trailing slash
  const path = (req.url ?? "/").split("?")[0].replace(/\/$/, "") || "/";

  // ── OPTIONS preflight ───────────────────────────────────────────────────────
  if (method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,x-operator-username");
    return res.status(204).end();
  }

  try {
    // ── GET /api ───────────────────────────────────────────────────────────────
    if (path === "/api" && method === "GET") {
      return send(res, 200, { status: "ok", service: "InclusyQ API", version: "2.0.0" });
    }

    // ── GET /api/data ──────────────────────────────────────────────────────────
    if (path === "/api/data" && method === "GET") {
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
        const { data: devs } = await supabase.from("tracking_devices").select("*").order("id", { ascending: true });
        devicesData = devs || [];
      } catch (_) { /* table not yet migrated */ }

      const settingsRow = settingsData?.[0];
      return send(res, 200, {
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
    }

    // ── POST /api/login ────────────────────────────────────────────────────────
    if (path === "/api/login" && method === "POST") {
      const { username, password, portal } = req.body || {};
      if (!username) return send(res, 400, { success: false, message: "Username is required" });

      const { data: rows } = await supabase.from("users").select("*").ilike("username", username.trim());
      const userRow = rows?.[0];
      if (!userRow) return send(res, 401, { success: false, message: "Invalid username or password." });

      const user = mapUser(userRow);
      const userPass = user.password || "password";
      if (password && userPass !== password)
        return send(res, 401, { success: false, message: "Invalid username or password." });
      if (user.isActive === false)
        return send(res, 403, { success: false, message: "This account is currently deactivated." });
      if (portal === "reception" && user.role !== UserRole.RECEPTIONIST)
        return send(res, 400, { success: false, message: "This account belongs to the Administrator Portal." });
      if (portal === "admin" && user.role !== UserRole.ADMIN)
        return send(res, 400, { success: false, message: "This account belongs to the Reception Portal." });

      return send(res, 200, { success: true, user });
    }

    // ── GET /api/queue ─────────────────────────────────────────────────────────
    if (path === "/api/queue" && method === "GET") {
      const { departmentId, doctorId } = req.query as Record<string, string>;
      const waitingTokens = await computeWaitingQueue(departmentId, doctorId);
      return send(res, 200, { success: true, tokens: waitingTokens.map((t: any) => mapToken(t)) });
    }

    // ── POST /api/patients ─────────────────────────────────────────────────────
    if (path === "/api/patients" && method === "POST") {
      const { name, mobile, age, gender, email } = req.body || {};
      if (!name || !mobile)
        return send(res, 400, { success: false, message: "Patient name and mobile are required." });

      const cleanMobile = mobile.trim();
      const { data: existing } = await supabase.from("patients").select("*").eq("mobile", cleanMobile);
      if (existing?.length) return send(res, 200, mapPatient(existing[0]));

      const newPatient = {
        id: `pat-${Date.now()}`,
        name: name.trim(),
        mobile: cleanMobile,
        email: (email || "").trim(),
        age: parseInt(age) || 30,
        gender: gender || Gender.MALE,
        created_at: new Date().toISOString(),
      };
      const { data: patData, error: patError } = await supabase.from("patients").insert(newPatient).select();
      if (patError || !patData?.length)
        return send(res, 500, { success: false, message: patError?.message || "Failed to create patient." });
      return send(res, 200, mapPatient(patData[0]));
    }

    // ── GET /api/devices ───────────────────────────────────────────────────────
    if (path === "/api/devices" && method === "GET") {
      const { data, error } = await supabase.from("tracking_devices").select("*").order("id", { ascending: true });
      if (error) return send(res, 500, { success: false, message: error.message });
      return send(res, 200, { success: true, devices: (data || []).map(mapDevice) });
    }

    // ── POST /api/devices ──────────────────────────────────────────────────────
    if (path === "/api/devices" && method === "POST") {
      const { deviceCode, name } = req.body || {};
      if (!deviceCode) return send(res, 400, { success: false, message: "Device code is required." });
      const newDevice = {
        id: `dev-${Date.now()}`,
        device_code: deviceCode.trim().toUpperCase(),
        name: (name || `Smart Pager ${deviceCode}`).trim(),
        status: "available",
        battery_level: 100,
        last_seen_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from("tracking_devices").insert(newDevice).select().single();
      if (error) return send(res, 500, { success: false, message: error.message });
      return send(res, 200, { success: true, device: mapDevice(data) });
    }

    // ── POST /api/devices/assign ───────────────────────────────────────────────
    if (path === "/api/devices/assign" && method === "POST") {
      const { deviceId, tokenId } = req.body || {};
      if (!deviceId || !tokenId)
        return send(res, 400, { success: false, message: "deviceId and tokenId are required." });

      const [{ data: tokenRow }, { data: deviceRow }] = await Promise.all([
        supabase.from("tokens").select("*").eq("id", tokenId).single(),
        supabase.from("tracking_devices").select("*").eq("id", deviceId).single(),
      ]);
      if (!tokenRow || !deviceRow)
        return send(res, 404, { success: false, message: "Token or device not found." });

      await supabase.from("tracking_devices").update({
        status: "in_use",
        assigned_token_id: tokenId,
        assigned_token_number: tokenRow.token_number,
        last_seen_at: new Date().toISOString(),
      }).eq("id", deviceId);
      await supabase.from("tokens").update({ device_id: deviceId }).eq("id", tokenId);
      await supabase.from("queue_logs").insert({
        id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        token_id: tokenId,
        token_number: tokenRow.token_number,
        action: "assigned_depts",
        user_id: `Assigned Hardware Pager ${deviceRow.device_code}`,
        timestamp: new Date().toISOString(),
      });
      return send(res, 200, { success: true, message: `Device ${deviceRow.device_code} assigned to ${tokenRow.token_number}.` });
    }

    // ── POST /api/devices/unassign ─────────────────────────────────────────────
    if (path === "/api/devices/unassign" && method === "POST") {
      const { deviceId } = req.body || {};
      if (!deviceId) return send(res, 400, { success: false, message: "deviceId is required." });

      const { data: deviceRow } = await supabase.from("tracking_devices").select("*").eq("id", deviceId).single();
      if (!deviceRow) return send(res, 404, { success: false, message: "Device not found." });

      if (deviceRow.assigned_token_id) {
        await supabase.from("tokens").update({ device_id: null }).eq("id", deviceRow.assigned_token_id);
      }
      await supabase.from("tracking_devices").update({
        status: "available",
        assigned_token_id: null,
        assigned_token_number: null,
        last_seen_at: new Date().toISOString(),
      }).eq("id", deviceId);
      return send(res, 200, { success: true, message: `Device ${deviceRow.device_code} is now available.` });
    }

    // ── POST /api/settings/toggle-pause ───────────────────────────────────────
    if (path === "/api/settings/toggle-pause" && method === "POST") {
      const { data: rows } = await supabase.from("settings").select("is_paused").limit(1);
      const newPaused = !rows?.[0]?.is_paused;
      await supabase.from("settings").update({ is_paused: newPaused }).eq("id", 1);
      return send(res, 200, { success: true, isPaused: newPaused });
    }

    // ── POST /api/settings/announcements ──────────────────────────────────────
    if (path === "/api/settings/announcements" && method === "POST") {
      const { text } = req.body || {};
      if (!text?.trim())
        return send(res, 400, { success: false, message: "Announcement text cannot be empty" });
      const { data: rows } = await supabase.from("settings").select("announcements").limit(1);
      const anns = rows?.[0]?.announcements || [];
      const newAnn = { id: `ann-${Date.now()}`, text: text.trim(), createdAt: new Date().toISOString() };
      anns.unshift(newAnn);
      await supabase.from("settings").update({ announcements: anns }).eq("id", 1);
      return send(res, 200, { success: true, announcement: newAnn });
    }

    // ── DELETE /api/settings/announcements/:id ────────────────────────────────
    const annDeleteMatch = path.match(/^\/api\/settings\/announcements\/([^/]+)$/);
    if (annDeleteMatch && method === "DELETE") {
      const annId = annDeleteMatch[1];
      const { data: rows } = await supabase.from("settings").select("announcements").limit(1);
      const anns = (rows?.[0]?.announcements || []).filter((a: any) => a.id !== annId);
      await supabase.from("settings").update({ announcements: anns }).eq("id", 1);
      return send(res, 200, { success: true });
    }

    // ── GET /api/track/:tokenId ────────────────────────────────────────────────
    const trackMatch = path.match(/^\/api\/track\/([^/]+)$/);
    if (trackMatch && method === "GET") {
      const tokenId = trackMatch[1];
      const { data: myToken, error: tokenErr } = await supabase
        .from("tokens").select("*").eq("id", tokenId).single();
      if (tokenErr || !myToken)
        return send(res, 404, { success: false, message: "Token not found." });

      const [{ data: currentServing }, { data: aheadList }] = await Promise.all([
        supabase.from("tokens").select("*")
          .eq("department_id", myToken.department_id)
          .eq("status", "called")
          .order("called_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("tokens").select("token_number")
          .eq("department_id", myToken.department_id)
          .eq("status", "waiting")
          .lt("position", myToken.position)
          .order("position", { ascending: true }),
      ]);
      return send(res, 200, {
        success: true,
        myToken,
        currentServing: currentServing || null,
        aheadCount: aheadList?.length ?? 0,
      });
    }

    return send(res, 404, { success: false, message: `No route: ${method} ${path}` });

  } catch (err: any) {
    console.error(`[api/index] ${method} ${path}`, err);
    return send(res, 500, { success: false, message: err.message || "Internal server error" });
  }
}
