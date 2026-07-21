import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function runRpc() {
  const testSql = "SELECT 1 as val;";
  console.log("Attempting to run RPC 'exec_sql'...");
  const { data: d1, error: e1 } = await supabase.rpc("exec_sql", { query: testSql });
  console.log("RPC exec_sql (query):", d1, e1?.message);

  const { data: d2, error: e2 } = await supabase.rpc("exec_sql", { sql: testSql });
  console.log("RPC exec_sql (sql):", d2, e2?.message);

  const { data: d3, error: e3 } = await supabase.rpc("run_sql", { sql: testSql });
  console.log("RPC run_sql (sql):", d3, e3?.message);
}

runRpc();
