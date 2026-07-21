import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function inspect() {
  // Check each table
  const tables = [
    "departments","doctors","patients","tokens",
    "consultation_rooms","users","queue_logs","whatsapp_logs","settings"
  ];

  for (const t of tables) {
    const { data, error } = await supabase.from(t).select("*").limit(1);
    if (error) {
      console.log(`❌ ${t}: ${error.message}`);
    } else {
      const cols = data && data.length > 0 ? Object.keys(data[0]) : "(empty)";
      console.log(`✅ ${t}: exists | cols: ${cols}`);
    }
  }

  // Try inserting a test department to see exact error
  console.log("\n--- Test INSERT departments ---");
  const { data, error } = await supabase.from("departments").insert({
    id: `dep-test-${Date.now()}`,
    name: "Test Dept",
    prefix: `TST${Date.now()}`,
    is_enabled: true,
    default_consultation_time: 15
  }).select();
  if (error) console.log("INSERT error:", error.message, error.details, error.hint);
  else { console.log("INSERT ok:", data); 
    // clean up
    await supabase.from("departments").delete().eq("name", "Test Dept");
  }
}

inspect();
