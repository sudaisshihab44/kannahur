import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../_lib/supabase.js";
import { mapUser } from "../_lib/mappers.js";
import { addAuditLog } from "../_lib/queue.js";
import { UserRole } from "../../src/types.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // POST /api/admin/users — create
  if (req.method === "POST") {
    const { username, name, role, departmentId, assignedDepartmentIds, permissions, password, isActive } = req.body || {};
    if (!username || !name || !role) {
      return res.status(400).json({ success: false, message: "Username, name, and role are required" });
    }

    const { data: existing } = await supabase.from("users").select("id").ilike("username", username.trim());
    if (existing?.length) {
      return res.status(400).json({ success: false, message: "Username already exists" });
    }

    const newUser = {
      id: `usr-${Date.now()}`,
      username: username.trim().toLowerCase(),
      name: name.trim(),
      role,
      department_id: departmentId || null,
      assigned_department_ids: assignedDepartmentIds || (departmentId ? [departmentId] : []),
      permissions: permissions || (role === UserRole.ADMIN
        ? ["manage_hospital", "manage_doctors", "manage_departments", "manage_rooms", "manage_staff", "manage_config"]
        : ["register_patient", "generate_token", "call_token", "complete_token", "skip_token", "cancel_token", "pause_queue"]),
      password: password || "password",
      is_active: isActive !== undefined ? isActive : true,
    };

    const { data, error: insertErr } = await supabase.from("users").insert(newUser).select();
    if (insertErr || !data?.length) {
      return res.status(500).json({ success: false, message: insertErr?.message || "Failed to create user" });
    }

    const user = mapUser(data[0]);

    if (user.role === UserRole.RECEPTIONIST) {
      const depts = user.assignedDepartmentIds || [];
      const { data: deptRows } = await supabase.from("departments").select("name").in("id", depts);
      const deptNames = (deptRows || []).map((d: any) => d.name).join(", ");
      const operatorUsername = (req.headers["x-operator-username"] as string) || "admin";
      await addAuditLog("assigned_depts", `Assigned Receptionist "${user.name}" to Departments: ${deptNames || "None"}`, operatorUsername);
    }

    return res.status(200).json({ success: true, user });
  }

  return res.status(405).json({ success: false, message: "Method not allowed" });
}
