-- ============================================================
-- MIGRATION: Add Hardware Tracking Devices Support
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- Step 1: Add device_id column to tokens table (if not already present)
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS device_id text;

-- Step 2: Create tracking_devices table
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

-- Step 3: Disable RLS (same as other tables in this project)
ALTER TABLE tracking_devices DISABLE ROW LEVEL SECURITY;

-- Step 4: Seed 5 default smart pagers
INSERT INTO tracking_devices (id, device_code, name, status, battery_level) VALUES
  ('dev-1', 'DEVICE-01', 'Smart Pager #01', 'available', 100),
  ('dev-2', 'DEVICE-02', 'Smart Pager #02', 'available', 95),
  ('dev-3', 'DEVICE-03', 'Smart Pager #03', 'available', 88),
  ('dev-4', 'DEVICE-04', 'Smart Pager #04', 'available', 100),
  ('dev-5', 'DEVICE-05', 'Smart Pager #05', 'available', 72)
ON CONFLICT (id) DO NOTHING;
