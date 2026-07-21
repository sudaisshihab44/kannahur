const { Pool } = require('pg');

// Supabase direct connection — password is the one set in Supabase dashboard
// Try common connection strings
const configs = [
  // Transaction pooler (port 6543)
  { host: 'aws-0-ap-south-1.pooler.supabase.com', port: 6543, database: 'postgres', user: 'postgres.fjkogjwwnpsocdxoikiu', password: process.env.DB_PASS || 'Admin@123', ssl: { rejectUnauthorized: false } },
  // Session pooler (port 5432)
  { host: 'aws-0-ap-south-1.pooler.supabase.com', port: 5432, database: 'postgres', user: 'postgres.fjkogjwwnpsocdxoikiu', password: process.env.DB_PASS || 'Admin@123', ssl: { rejectUnauthorized: false } },
  // Direct connection
  { host: 'db.fjkogjwwnpsocdxoikiu.supabase.co', port: 5432, database: 'postgres', user: 'postgres', password: process.env.DB_PASS || 'Admin@123', ssl: { rejectUnauthorized: false } },
];

const migration = `
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS device_id text;

CREATE TABLE IF NOT EXISTS tracking_devices (
  id text PRIMARY KEY,
  device_code text UNIQUE NOT NULL,
  name text,
  status text DEFAULT 'available',
  assigned_token_id text REFERENCES tokens(id) ON DELETE SET NULL,
  assigned_token_number text,
  battery_level integer DEFAULT 100,
  last_seen_at timestamptz DEFAULT now()
);

ALTER TABLE tracking_devices DISABLE ROW LEVEL SECURITY;

INSERT INTO tracking_devices (id, device_code, name, status, battery_level) VALUES
  ('dev-1', 'DEVICE-01', 'Smart Pager #01', 'available', 100),
  ('dev-2', 'DEVICE-02', 'Smart Pager #02', 'available', 95),
  ('dev-3', 'DEVICE-03', 'Smart Pager #03', 'available', 88),
  ('dev-4', 'DEVICE-04', 'Smart Pager #04', 'available', 100),
  ('dev-5', 'DEVICE-05', 'Smart Pager #05', 'available', 72)
ON CONFLICT (id) DO NOTHING;
`;

async function tryConnect(config, idx) {
  const pool = new Pool({ ...config, connectionTimeoutMillis: 8000 });
  try {
    console.log(`\nTrying config ${idx + 1}: ${config.host}:${config.port} user=${config.user}`);
    const client = await pool.connect();
    console.log('Connected! Running migration...');
    await client.query(migration);
    console.log('Migration ran successfully!');
    
    // Verify
    const { rows } = await client.query('SELECT id, device_code, status FROM tracking_devices');
    console.log('Devices in DB:', rows);
    
    const { rows: cols } = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'tokens' AND column_name = 'device_id'");
    console.log('tokens.device_id column:', cols.length > 0 ? 'EXISTS' : 'NOT FOUND');
    
    client.release();
    await pool.end();
    return true;
  } catch (err) {
    console.log('Failed:', err.message);
    await pool.end().catch(() => {});
    return false;
  }
}

async function main() {
  const pass = process.env.DB_PASS;
  if (!pass) {
    console.log('Usage: DB_PASS=<your-supabase-db-password> node scratch/migrate.js');
    console.log('Find the password at: Supabase Dashboard → Project Settings → Database → Database password');
    process.exit(1);
  }
  
  for (let i = 0; i < configs.length; i++) {
    const ok = await tryConnect(configs[i], i);
    if (ok) break;
  }
}

main().catch(console.error);
