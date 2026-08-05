import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../_lib/supabase.js";
import { mapUser } from "../../_lib/mappers.js";
import { addAuditLog } from "../../_lib/queue.js";
import { UserRole } from "../../../src/types.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query as { id: string };

  // PUT /api/admin/users/:id — update
  if (req.method === "PUT") {
    const { username, name, role, departmentId, assignedDepartmentIds, permissions, password, isActive } = req.body || {};

    const { data: existing } = await supabase.from("users").select("*").eq("id", id);
    if (!existing?.length) return res.status(404).json({ success: false, message: "Staff user not found" });

    const oldUser = mapUser(existing[0]);
    const updates: any = {};

    if (username) {
      const cleanUsername = username.trim().toLowerCase();
      if (cleanUsername !== oldUser.username) {
        const { data: dup } = await supabase.from("users").select("id").ilike("username", cleanUsername).neq("id", id);
        if (dup?.length) return res.status(400).json({ success: false, message: "Username already exists" });
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
    if (updateErr || !data?.length) {
      return res.status(500).json({ success: false, message: updateErr?.message || "User not found or update failed" });
    }

    const user = mapUser(data[0]);

    if (user.role === UserRole.RECEPTIONIST && assignedDepartmentIds !== undefined) {
      const operatorUsername = (req.headers["x-operator-username"] as string) || "admin";
      const { data: deptRows } = await supabase.from("departments").select("name").in("id", assignedDepartmentIds);
      const deptNames = (deptRows || []).map((d: any) => d.name).join(", ");
      await addAuditLog("assigned_depts", `Assigned Receptionist "${user.name}" to Departments: ${deptNames || "None"}`, operatorUsername);
    }

    return res.status(200).json({ success: true, user });
  }

  // DELETE /api/admin/users/:id
  if (req.method === "DELETE") {
    await supabase.from("users").delete().eq("id", id);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, message: "Method not allowed" });
}
