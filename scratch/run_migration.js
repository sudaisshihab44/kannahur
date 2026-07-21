const https = require('https');

const sql = [
  "ALTER TABLE tokens ADD COLUMN IF NOT EXISTS device_id text;",
  "CREATE TABLE IF NOT EXISTS tracking_devices (id text PRIMARY KEY, device_code text UNIQUE NOT NULL, name text, status text DEFAULT 'available', assigned_token_id text REFERENCES tokens(id) ON DELETE SET NULL, assigned_token_number text, battery_level integer DEFAULT 100, last_seen_at timestamptz DEFAULT now());",
  "ALTER TABLE tracking_devices DISABLE ROW LEVEL SECURITY;",
  "INSERT INTO tracking_devices (id, device_code, name, status, battery_level) VALUES ('dev-1', 'DEVICE-01', 'Smart Pager #01', 'available', 100), ('dev-2', 'DEVICE-02', 'Smart Pager #02', 'available', 95), ('dev-3', 'DEVICE-03', 'Smart Pager #03', 'available', 88), ('dev-4', 'DEVICE-04', 'Smart Pager #04', 'available', 100), ('dev-5', 'DEVICE-05', 'Smart Pager #05', 'available', 72) ON CONFLICT (id) DO NOTHING;"
].join('\n');

// Try via Supabase REST pg_net or direct SQL
// The Supabase JS client can run raw SQL via the admin API using service role
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fjkogjwwnpsocdxoikiu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqa29nand3bnBzb2NkeG9pa2l1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDM4MjU3MCwiZXhwIjoyMDk5OTU4NTcwfQ.zePx50xYb6z5XlTZTYorVANtODR--I7gY6I0hX_MFNk',
  { auth: { persistSession: false } }
);

async function runMigration() {
  console.log('Running migration...');

  // Step 1: ALTER tokens table
  const { error: e1 } = await supabase.rpc('exec_sql', { sql: 'ALTER TABLE tokens ADD COLUMN IF NOT EXISTS device_id text' });
  if (e1) console.log('Step 1 rpc error (expected if no exec_sql):', e1.message);

  // Step 2: Try inserting into tracking_devices directly
  // If table doesn't exist this will fail — we need DDL
  const { error: e2 } = await supabase.from('tracking_devices').select('id').limit(1);
  console.log('Table check error:', e2 ? e2.message : 'Table exists!');

  // Try creating via a known Supabase approach — query the auth admin
  const resp = await fetch('https://fjkogjwwnpsocdxoikiu.supabase.co/rest/v1/', {
    headers: {
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqa29nand3bnBzb2NkeG9pa2l1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDM4MjU3MCwiZXhwIjoyMDk5OTU4NTcwfQ.zePx50xYb6z5XlTZTYorVANtODR--I7gY6I0hX_MFNk',
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqa29nand3bnBzb2NkeG9pa2l1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDM4MjU3MCwiZXhwIjoyMDk5OTU4NTcwfQ.zePx50xYb6z5XlTZTYorVANtODR--I7gY6I0hX_MFNk'
    }
  });
  const text = await resp.text();
  console.log('REST root response:', resp.status, text.substring(0, 200));
}

runMigration().catch(console.error);
