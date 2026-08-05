/**
 * api/admin.ts — Admin router (Function #3 of 4)
 *
 * Handles all admin endpoints (except upload-logo which needs bodyParser:false):
 *   POST   /api/admin/doctors
 *   PUT    /api/admin/doctors/:id
 *   DELETE /api/admin/doctors/:id
 *   POST   /api/admin/doctors/:id/toggle-status
 *   POST   /api/admin/departments
 *   PUT    /api/admin/departments/:id
 *   DELETE /api/admin/departments/:id
 *   POST   /api/admin/rooms
 *   PUT    /api/admin/rooms/:id
 *   DELETE /api/admin/rooms/:id
 *   POST   /api/admin/users
 *   PUT    /api/admin/users/:id
 *   DELETE /api/admin/users/:id
 *   POST   /api/admin/queue-config
 *   POST   /api/admin/hospital-info
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "./_lib/supabase.js";
import { mapDoctor, mapDept, mapRoom, mapUser } from "./_lib/mappers.js";
import { addAuditLog } from "./_lib/queue.js";
import { UserRole } from "../src/types.js";

function send(res: VercelResponse, status: number, body: unknown) {
  return res.status(status).json(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method } = req;
  const path = (req.url ?? "/").split("?")[0].replace(/\/$/, "");

  if (method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,x-operator-username");
    return res.status(204).end();
  }

  try {

    // ════════════════════════════════════════════════════════════════════════
    // DOCTORS
    // ════════════════════════════════════════════════════════════════════════

    if (path === "/api/admin/doctors" && method === "POST") {
      const { name, departmentId, specialization, status, roomNumber, avgConsultationTime, startTime, endTime, maxPatientsPerDay, isEnabled } = req.body || {};
      if (!name || !departmentId)
        return send(res, 400, { success: false, message: "Doctor name and department are required" });

      const newDoc = {
        id: `doc-${Date.now()}`,
        name: name.trim(),
        department_id: departmentId,
        specialization: (specialization || "General").trim(),
        status: status || "active",
        room_number: (roomNumber || "").trim(),
        avg_consultation_time: parseInt(avgConsultationTime) || 15,
        start_time: startTime || "08:00",
        end_time: endTime || "17:00",
        max_patients_per_day: parseInt(maxPatientsPerDay) || 40,
        is_enabled: isEnabled !== undefined ? isEnabled : true,
      };
      const { data, error } = await supabase.from("doctors").insert(newDoc).select();
      if (error || !data?.length) return send(res, 500, { success: false, message: error?.message || "Failed to create doctor" });
      return send(res, 200, { success: true, doctor: mapDoctor(data[0]) });
    }

    const doctorIdMatch = path.match(/^\/api\/admin\/doctors\/([^/]+)$/);
    if (doctorIdMatch) {
      const id = doctorIdMatch[1];

      if (method === "PUT") {
        const { name, departmentId, specialization, status, roomNumber, avgConsultationTime, startTime, endTime, maxPatientsPerDay, isEnabled } = req.body || {};
        const updates: any = {};
        if (name) updates.name = name.trim();
        if (departmentId) updates.department_id = departmentId;
        if (specialization) updates.specialization = specialization.trim();
        if (status) updates.status = status;
        if (roomNumber !== undefined) updates.room_number = roomNumber.trim();
        if (avgConsultationTime !== undefined) updates.avg_consultation_time = parseInt(avgConsultationTime) || 15;
        if (startTime !== undefined) updates.start_time = startTime;
        if (endTime !== undefined) updates.end_time = endTime;
        if (maxPatientsPerDay !== undefined) updates.max_patients_per_day = parseInt(maxPatientsPerDay) || 40;
        if (isEnabled !== undefined) updates.is_enabled = isEnabled;
        const { data } = await supabase.from("doctors").update(updates).eq("id", id).select();
        if (!data?.length) return send(res, 404, { success: false, message: "Doctor not found" });
        return send(res, 200, { success: true, doctor: mapDoctor(data[0]) });
      }

      if (method === "DELETE") {
        await supabase.from("doctors").delete().eq("id", id);
        return send(res, 200, { success: true });
      }
    }

    const doctorToggleMatch = path.match(/^\/api\/admin\/doctors\/([^/]+)\/toggle-status$/);
    if (doctorToggleMatch && method === "POST") {
      const id = doctorToggleMatch[1];
      const { data: rows } = await supabase.from("doctors").select("status").eq("id", id);
      if (!rows?.length) return send(res, 404, { success: false, message: "Doctor not found" });
      const newStatus = rows[0].status === "active" ? "inactive" : "active";
      const { data, error } = await supabase.from("doctors").update({ status: newStatus }).eq("id", id).select();
      if (error || !data?.length) return send(res, 500, { success: false, message: error?.message || "Failed to toggle" });
      return send(res, 200, { success: true, doctor: mapDoctor(data[0]) });
    }

    // ════════════════════════════════════════════════════════════════════════
    // DEPARTMENTS
    // ════════════════════════════════════════════════════════════════════════

    if (path === "/api/admin/departments" && method === "POST") {
      const { name, prefix, description, isEnabled, defaultConsultationTime } = req.body || {};
      if (!name || !prefix)
        return send(res, 400, { success: false, message: "Department name and prefix are required" });
      const cleanPrefix = prefix.trim().toUpperCase();
      const { data: existing } = await supabase.from("departments").select("id").eq("prefix", cleanPrefix);
      if (existing?.length) return send(res, 400, { success: false, message: "Department prefix already exists" });
      const newDept = {
        id: `dep-${Date.now()}`,
        name: name.trim(),
        prefix: cleanPrefix,
        description: (description || "").trim(),
        is_enabled: isEnabled !== undefined ? isEnabled : true,
        default_consultation_time: defaultConsultationTime ? parseInt(defaultConsultationTime) : 15,
      };
      const { data, error } = await supabase.from("departments").insert(newDept).select();
      if (error || !data?.length) return send(res, 500, { success: false, message: error?.message || "Failed to create department" });
      return send(res, 200, { success: true, department: mapDept(data[0]) });
    }

    const deptIdMatch = path.match(/^\/api\/admin\/departments\/([^/]+)$/);
    if (deptIdMatch) {
      const id = deptIdMatch[1];

      if (method === "PUT") {
        const { name, prefix, description, isEnabled, defaultConsultationTime } = req.body || {};
        const updates: any = {};
        if (name) updates.name = name.trim();
        if (prefix) {
          const cleanPrefix = prefix.trim().toUpperCase();
          const { data: existing } = await supabase.from("departments").select("id").eq("prefix", cleanPrefix).neq("id", id);
          if (existing?.length) return send(res, 400, { success: false, message: "Department prefix already exists" });
          updates.prefix = cleanPrefix;
        }
        if (description !== undefined) updates.description = description.trim();
        if (isEnabled !== undefined) updates.is_enabled = isEnabled;
        if (defaultConsultationTime !== undefined) updates.default_consultation_time = defaultConsultationTime ? parseInt(defaultConsultationTime) : 15;
        const { data } = await supabase.from("departments").update(updates).eq("id", id).select();
        if (!data?.length) return send(res, 404, { success: false, message: "Department not found" });
        return send(res, 200, { success: true, department: mapDept(data[0]) });
      }

      if (method === "DELETE") {
        await supabase.from("departments").delete().eq("id", id);
        return send(res, 200, { success: true });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // ROOMS
    // ════════════════════════════════════════════════════════════════════════

    if (path === "/api/admin/rooms" && method === "POST") {
      const { roomNumber, roomName, assignedDoctorId, departmentId, status, displayScreenId } = req.body || {};
      if (!roomNumber || !roomName)
        return send(res, 400, { success: false, message: "Room number and name are required" });
      const newRoom = {
        id: `rm-${Date.now()}`,
        room_number: roomNumber.trim(),
        room_name: roomName.trim(),
        assigned_doctor_id: assignedDoctorId || null,
        department_id: departmentId || null,
        status: status || "available",
        display_screen_id: (displayScreenId || "").trim(),
      };
      const { data, error } = await supabase.from("consultation_rooms").insert(newRoom).select();
      if (error || !data?.length) return send(res, 500, { success: false, message: error?.message || "Failed to create room" });
      return send(res, 200, { success: true, room: mapRoom(data[0]) });
    }

    const roomIdMatch = path.match(/^\/api\/admin\/rooms\/([^/]+)$/);
    if (roomIdMatch) {
      const id = roomIdMatch[1];

      if (method === "PUT") {
        const { roomNumber, roomName, assignedDoctorId, departmentId, status, displayScreenId } = req.body || {};
        const updates: any = {};
        if (roomNumber) updates.room_number = roomNumber.trim();
        if (roomName) updates.room_name = roomName.trim();
        if (assignedDoctorId !== undefined) updates.assigned_doctor_id = assignedDoctorId;
        if (departmentId !== undefined) updates.department_id = departmentId;
        if (status) updates.status = status;
        if (displayScreenId !== undefined) updates.display_screen_id = displayScreenId.trim();
        const { data } = await supabase.from("consultation_rooms").update(updates).eq("id", id).select();
        if (!data?.length) return send(res, 404, { success: false, message: "Room not found" });
        return send(res, 200, { success: true, room: mapRoom(data[0]) });
      }

      if (method === "DELETE") {
        await supabase.from("consultation_rooms").delete().eq("id", id);
        return send(res, 200, { success: true });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // USERS / STAFF
    // ════════════════════════════════════════════════════════════════════════

    if (path === "/api/admin/users" && method === "POST") {
      const { username, name, role, departmentId, assignedDepartmentIds, permissions, password, isActive } = req.body || {};
      if (!username || !name || !role)
        return send(res, 400, { success: false, message: "Username, name, and role are required" });

      const { data: existing } = await supabase.from("users").select("id").ilike("username", username.trim());
      if (existing?.length) return send(res, 400, { success: false, message: "Username already exists" });

      const defaultPerms = role === UserRole.ADMIN
        ? ["manage_hospital", "manage_doctors", "manage_departments", "manage_rooms", "manage_staff", "manage_config"]
        : ["register_patient", "generate_token", "call_token", "complete_token", "skip_token", "cancel_token", "pause_queue"];

      const newUser = {
        id: `usr-${Date.now()}`,
        username: username.trim().toLowerCase(),
        name: name.trim(),
        role,
        department_id: departmentId || null,
        assigned_department_ids: assignedDepartmentIds || (departmentId ? [departmentId] : []),
        permissions: permissions || defaultPerms,
        password: password || "password",
        is_active: isActive !== undefined ? isActive : true,
      };
      const { data, error: insertErr } = await supabase.from("users").insert(newUser).select();
      if (insertErr || !data?.length) return send(res, 500, { success: false, message: insertErr?.message || "Failed to create user" });

      const user = mapUser(data[0]);
      if (user.role === UserRole.RECEPTIONIST) {
        const depts = user.assignedDepartmentIds || [];
        const { data: deptRows } = await supabase.from("departments").select("name").in("id", depts);
        const deptNames = (deptRows || []).map((d: any) => d.name).join(", ");
        await addAuditLog("assigned_depts", `Assigned Receptionist "${user.name}" to Departments: ${deptNames || "None"}`, (req.headers["x-operator-username"] as string) || "admin");
      }
      return send(res, 200, { success: true, user });
    }

    const userIdMatch = path.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (userIdMatch) {
      const id = userIdMatch[1];

      if (method === "PUT") {
        const { username, name, role, departmentId, assignedDepartmentIds, permissions, password, isActive } = req.body || {};
        const { data: existing } = await supabase.from("users").select("*").eq("id", id);
        if (!existing?.length) return send(res, 404, { success: false, message: "Staff user not found" });
        const oldUser = mapUser(existing[0]);
        const updates: any = {};
        if (username) {
          const cleanUsername = username.trim().toLowerCase();
          if (cleanUsername !== oldUser.username) {
            const { data: dup } = await supabase.from("users").select("id").ilike("username", cleanUsername).neq("id", id);
            if (dup?.length) return send(res, 400, { success: false, message: "Username already exists" });
          }
          updates.username = cleanUsername;
        }
        if (name) updates.name = name.trim();
        if (role) updates.role = role;
        if (departmentId !== undefined) updates.department_id = departmentId;
        if (assignedDepartmentIds !== undefined) updates.assigned_department_ids = assignedDepartmentIds;
        if (permissions !== undefined) updates.permissions = permissions;
        if (password) updates.password = password;
        if (isActive !== undefined) updates.is_active = isActive;

        const { data, error: updateErr } = await supabase.from("users").update(updates).eq("id", id).select();
        if (updateErr || !data?.length) return send(res, 500, { success: false, message: updateErr?.message || "Update failed" });
        const user = mapUser(data[0]);
        if (user.role === UserRole.RECEPTIONIST && assignedDepartmentIds !== undefined) {
          const { data: deptRows } = await supabase.from("departments").select("name").in("id", assignedDepartmentIds);
          const deptNames = (deptRows || []).map((d: any) => d.name).join(", ");
          await addAuditLog("assigned_depts", `Assigned Receptionist "${user.name}" to Departments: ${deptNames || "None"}`, (req.headers["x-operator-username"] as string) || "admin");
        }
        return send(res, 200, { success: true, user });
      }

      if (method === "DELETE") {
        await supabase.from("users").delete().eq("id", id);
        return send(res, 200, { success: true });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // QUEUE CONFIG
    // ════════════════════════════════════════════════════════════════════════

    if (path === "/api/admin/queue-config" && method === "POST") {
      const config = { ...req.body };
      if (config.tokenPrefix !== undefined) config.tokenPrefix = config.tokenPrefix.trim();
      if (config.dailyTokenReset !== undefined) config.dailyTokenReset = !!config.dailyTokenReset;
      if (config.queueStartNumber !== undefined) config.queueStartNumber = parseInt(config.queueStartNumber) || 1;
      if (config.emergencyQueue !== undefined) config.emergencyQueue = !!config.emergencyQueue;
      if (config.walkInQueue !== undefined) config.walkInQueue = !!config.walkInQueue;
      if (config.maxQueueSize !== undefined) config.maxQueueSize = parseInt(config.maxQueueSize) || 100;
      if (config.defaultWaitingTime !== undefined) config.defaultWaitingTime = parseInt(config.defaultWaitingTime) || 15;
      if (config.maxDailyTokens !== undefined) config.maxDailyTokens = parseInt(config.maxDailyTokens) || 500;
      if (config.autoSkipTimeout !== undefined) config.autoSkipTimeout = parseInt(config.autoSkipTimeout) || 180;
      if (config.maxWaitingTime !== undefined) config.maxWaitingTime = parseInt(config.maxWaitingTime) || 120;
      if (config.minWaitTimeNotificationThreshold !== undefined) config.minWaitTimeNotificationThreshold = parseInt(config.minWaitTimeNotificationThreshold) || 5;
      if (config.enableWhatsAppUpdates !== undefined) config.enableWhatsAppUpdates = !!config.enableWhatsAppUpdates;
      await supabase.from("settings").update({ config }).eq("id", 1);
      return send(res, 200, { success: true, config });
    }

    // ════════════════════════════════════════════════════════════════════════
    // HOSPITAL INFO
    // ════════════════════════════════════════════════════════════════════════

    if (path === "/api/admin/hospital-info" && method === "POST") {
      const {
        name, tagline, address, phone, logoUrl, logoColor,
        workingHours, queueOperatingHours, registrationNumber,
        email, city, state, country, pincode, website, description, emergencyContact,
      } = req.body || {};

      const { data: rows, error: selectErr } = await supabase.from("settings").select("hospital_info").limit(1);
      if (selectErr) return send(res, 500, { success: false, message: selectErr.message });

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

      const { error: updateErr } = await supabase.from("settings").update({ hospital_info: hospitalInfo }).eq("id", 1);
      if (updateErr) return send(res, 500, { success: false, message: updateErr.message });
      return send(res, 200, { success: true, hospitalInfo });
    }

    return send(res, 404, { success: false, message: `No route: ${method} ${path}` });

  } catch (err: any) {
    console.error(`[api/admin] ${method} ${path}`, err);
    return send(res, 500, { success: false, message: err.message || "Internal server error" });
  }
}
