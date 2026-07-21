import pg from 'pg';
const { Pool } = pg;

const pass = process.env.DB_PASS;
if (!pass || pass === 'your-db-password') {
  console.log('ERROR: Please set your real Supabase database password.');
  console.log('Find it at: Supabase Dashboard → Project Settings → Database → Database password');
  console.log('Usage: $env:DB_PASS="your-actual-password" ; node scratch/migrate.mjs');
  process.exit(1);
}

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

const configs = [
  // Session pooler
  { host: 'aws-0-ap-south-1.pooler.supabase.com', port: 5432, database: 'postgres', user: 'postgres.fjkogjwwnpsocdxoikiu', password: pass, ssl: { rejectUnauthorized: false } },
  // Transaction pooler
  { host: 'aws-0-ap-south-1.pooler.supabase.com', port: 6543, database: 'postgres', user: 'postgres.fjkogjwwnpsocdxoikiu', password: pass, ssl: { rejectUnauthorized: false } },
  // Direct
  { host: 'db.fjkogjwwnpsocdxoikiu.supabase.co', port: 5432, database: 'postgres', user: 'postgres', password: pass, ssl: { rejectUnauthorized: false } },
];

async function tryConnect(config, idx) {
  const pool = new Pool({ ...config, connectionTimeoutMillis: 8000 });
  try {
    console.log(`\nTrying [${idx + 1}/${configs.length}]: ${config.host}:${config.port} user=${config.user}`);
    const client = await pool.connect();
    console.log('✅ Connected! Running migration...');
    await client.query(migration);
    console.log('✅ Migration complete!');

    const { rows: devs } = await client.query('SELECT id, device_code, status FROM tracking_devices ORDER BY id');
    console.log('\nDevices in DB:');
    devs.forEach(d => console.log(`  ${d.id}: ${d.device_code} [${d.status}]`));

    const { rows: cols } = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='tokens' AND column_name='device_id'"
    );
    console.log('\ntokens.device_id column:', cols.length > 0 ? '✅ EXISTS' : '❌ NOT FOUND');

    client.release();
    await pool.end();
    return true;
  } catch (err) {
    console.log(`❌ Failed: ${err.message}`);
    await pool.end().catch(() => {});
    return false;
  }
}

for (let i = 0; i < configs.length; i++) {
  const ok = await tryConnect(configs[i], i);
  if (ok) {
    console.log('\n🎉 Migration successful! Refresh your app — the pager dropdown will now appear.');
    process.exit(0);
  }
}

console.log('\n❌ All connection attempts failed. Please run the SQL manually in Supabase:');
console.log('https://supabase.com/dashboard/project/fjkogjwwnpsocdxoikiu/sql/new');
process.exit(1);
