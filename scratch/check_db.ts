import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const { data: settings } = await supabase.from("settings").select("*");
  console.log("Settings:", JSON.stringify(settings, null, 2));

  const { data: users } = await supabase.from("users").select("*");
  console.log("Users:", JSON.stringify(users, null, 2));
}

check();
