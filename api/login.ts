import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "./_lib/supabase.js";
import { mapUser } from "./_lib/mappers.js";
import { UserRole } from "../src/types.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const { username, password, portal } = req.body || {};

  if (!username) {
    return res.status(400).json({ success: false, message: "Username is required" });
  }

  const { data: rows } = await supabase
    .from("users")
    .select("*")
    .ilike("username", username.trim());

  const userRow = rows?.[0];
  if (!userRow) {
    return res.status(401).json({ success: false, message: "Invalid username or password." });
  }

  const user = mapUser(userRow);
  const userPass = user.password || "password";

  if (password && userPass !== password) {
    return res.status(401).json({ success: false, message: "Invalid username or password." });
  }
  if (user.isActive === false) {
    return res.status(403).json({ success: false, message: "This account is currently deactivated." });
  }
  if (portal === "reception" && user.role !== UserRole.RECEPTIONIST) {
    return res.status(400).json({ success: false, message: "This account belongs to the Administrator Portal." });
  }
  if (portal === "admin" && user.role !== UserRole.ADMIN) {
    return res.status(400).json({ success: false, message: "This account belongs to the Reception Portal." });
  }

  return res.status(200).json({ success: true, user });
}
