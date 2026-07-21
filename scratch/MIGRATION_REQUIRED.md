# 🔴 CRITICAL: Run This in Supabase SQL Editor

## Root Cause

The Supabase tables were created **without all the required columns** — the schema
was partially applied (only `CREATE TABLE` ran, not `ALTER TABLE` for columns).

Specifically, `departments` is missing `default_consultation_time`, `description`,
and `is_enabled`. Same issue across `doctors`, `tokens`, `consultation_rooms`, etc.

## Fix (2 steps)

### Step 1 — Open Supabase SQL Editor

👉 https://supabase.com/dashboard/project/fjkogjwwnpsocdxoikiu/sql

### Step 2 — Run the migration file

Copy the entire contents of `supabase_migration.sql` and click **Run**.

This will:
- Add all missing columns to existing tables (safe, uses `ADD COLUMN IF NOT EXISTS`)
- Disable RLS on all tables
- Seed departments, doctors, rooms if they're empty
- Does NOT delete any existing data

## After Running

Refresh http://localhost:3000 — all CRUD operations should work immediately.
