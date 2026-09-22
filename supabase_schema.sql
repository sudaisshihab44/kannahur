-- InclusyQ Supabase Schema
-- Run this entire script in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/fjkogjwwnpsocdxoikiu/sql

-- ============================================================
-- 1. TABLES
-- ============================================================

create table if not exists departments (
  id text primary key,
  name text not null,
  prefix text not null unique,
  description text,
  is_enabled boolean default true,
  default_consultation_time integer default 15
);
alter table departments enable row level security;

create table if not exists doctors (
  id text primary key,
  name text not null,
  department_id text references departments(id) on delete set null,
  specialization text,
  status text default 'active',
  room_number text,
  avg_consultation_time integer default 15,
  start_time text default '08:00',
  end_time text default '17:00',
  max_patients_per_day integer default 40,
  is_enabled boolean default true
);
alter table doctors enable row level security;

create table if not exists patients (
  id text primary key,
  name text not null,
  mobile text unique not null,
  email text,
  age integer,
  gender text,
  created_at timestamptz default now()
);
alter table patients enable row level security;

create table if not exists tokens (
  id text primary key,
  token_number text not null,
  patient_name text,
  patient_mobile text,
  patient_email text,
  patient_age integer,
  patient_gender text,
  department_id text,
  department_name text,
  doctor_id text,
  doctor_name text,
  reason_for_visit text,
  status text default 'waiting',
  created_at timestamptz default now(),
  called_at timestamptz,
  completed_at timestamptz,
  is_emergency boolean default false,
  priority text default 'Normal',
  notes text,
  position integer,
  estimated_consultation_time integer,
  estimated_wait_time integer,
  expected_consultation_start_time timestamptz,
  last_notified_wait_time integer,
  notified_two_remaining boolean default false,
  notified_your_turn boolean default false,
  notified_two_ahead boolean default false,
  device_id text
);
alter table tokens enable row level security;

create table if not exists tracking_devices (
  id text primary key,
  device_code text unique not null,
  name text,
  status text default 'available',
  assigned_token_id text references tokens(id) on delete set null,
  assigned_token_number text,
  battery_level integer default 100,
  last_seen_at timestamptz default now()
);
alter table tracking_devices enable row level security;

create table if not exists consultation_rooms (
  id text primary key,
  room_number text not null,
  room_name text not null,
  assigned_doctor_id text,
  department_id text,
  status text default 'available',
  display_screen_id text
);
alter table consultation_rooms enable row level security;

create table if not exists users (
  id text primary key,
  username text unique not null,
  name text not null,
  role text not null,
  department_id text,
  assigned_department_ids jsonb default '[]',
  permissions jsonb default '[]',
  password_hash text,
  is_active boolean default true
);
alter table users enable row level security;

create table if not exists queue_logs (
  id text primary key,
  token_id text,
  token_number text,
  action text,
  user_id text,
  timestamp timestamptz default now()
);
alter table queue_logs enable row level security;

create table if not exists whatsapp_logs (
  id text primary key,
  token_id text,
  token_number text,
  patient_name text,
  patient_mobile text,
  message text,
  timestamp timestamptz default now(),
  type text
);
alter table whatsapp_logs enable row level security;

-- Single-row settings table
create table if not exists settings (
  id integer primary key default 1,
  is_paused boolean default false,
  hospital_info jsonb default '{}',
  announcements jsonb default '[]',
  config jsonb default '{}'
);
alter table settings enable row level security;

-- ============================================================
-- 1b. ROW LEVEL SECURITY (SQ-BLK-002 remediation)
-- Backend uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS) for all
-- CRUD via src-api/repositories + /api/track. Anon/authenticated
-- get SELECT-only on public display tables. PHI tables (patients,
-- tokens, users, queue_logs, whatsapp_logs, tracking_devices)
-- have NO policies = deny-all for anon/authenticated.
-- Idempotent: safe to re-run (DROP POLICY IF EXISTS first).
-- ============================================================

-- Public display tables: read-only for anon + authenticated
drop policy if exists anon_select_departments on departments;
create policy anon_select_departments on departments
  for select to anon using (true);
drop policy if exists auth_select_departments on departments;
create policy auth_select_departments on departments
  for select to authenticated using (true);

drop policy if exists anon_select_doctors on doctors;
create policy anon_select_doctors on doctors
  for select to anon using (is_enabled = true);
drop policy if exists auth_select_doctors on doctors;
create policy auth_select_doctors on doctors
  for select to authenticated using (is_enabled = true);

drop policy if exists anon_select_rooms on consultation_rooms;
create policy anon_select_rooms on consultation_rooms
  for select to anon using (true);
drop policy if exists auth_select_rooms on consultation_rooms;
create policy auth_select_rooms on consultation_rooms
  for select to authenticated using (true);

drop policy if exists anon_select_settings on settings;
create policy anon_select_settings on settings
  for select to anon using (true);
drop policy if exists auth_select_settings on settings;
create policy auth_select_settings on settings
  for select to authenticated using (true);

-- Defense in depth: explicit grants (policies alone are not enough
-- if a permissive policy is added later). service_role/postgres
-- untouched, so backend CRUD keeps working.
revoke all on table patients, tokens, users, queue_logs, whatsapp_logs, tracking_devices
  from anon, authenticated;
grant select on table departments, doctors, consultation_rooms, settings
  to anon, authenticated;

-- ============================================================
-- 2. SEED DEFAULT DATA
-- ============================================================

insert into departments (id, name, prefix, is_enabled, default_consultation_time) values
  ('dep-1', 'General Medicine', 'GEN', true, 15),
  ('dep-2', 'Pediatrics', 'PEDS', true, 15),
  ('dep-3', 'Cardiology', 'CARD', true, 15),
  ('dep-4', 'Orthopedics', 'ORTH', true, 15),
  ('dep-5', 'Ophthalmology', 'EYE', true, 15)
on conflict (id) do nothing;

insert into doctors (id, name, department_id, specialization, status, room_number, avg_consultation_time, start_time, end_time, max_patients_per_day, is_enabled) values
  ('doc-1', 'Dr. Sarah Jenkins', 'dep-1', 'Primary Care / Family Medicine', 'active', '101', 15, '08:00', '17:00', 40, true),
  ('doc-2', 'Dr. Robert Chen', 'dep-1', 'Internal Medicine', 'active', 'G-12', 15, '08:00', '17:00', 40, true),
  ('doc-3', 'Dr. Alisha Patel', 'dep-3', 'Interventional Cardiology', 'active', '302', 15, '08:00', '17:00', 40, true),
  ('doc-4', 'Dr. Marcus Vance', 'dep-4', 'Bone & Joint Surgery', 'active', 'G-12', 15, '08:00', '17:00', 40, true),
  ('doc-5', 'Dr. Emily Wong', 'dep-2', 'General Pediatrics', 'active', '204', 15, '08:00', '17:00', 40, true),
  ('doc-6', 'Dr. Arthur Pendelton', 'dep-5', 'Refractive Surgery', 'active', 'G-12', 15, '08:00', '17:00', 40, true)
on conflict (id) do nothing;

-- NOTE: default users carry NO password. Set BOOTSTRAP_ADMIN_PASSWORD /
-- BOOTSTRAP_RECEPTION_PASSWORD in the environment on first boot; the server
-- hashes them with bcrypt (12 rounds) into password_hash. Never store or log
-- plaintext credentials.
insert into users (id, username, name, role, department_id, assigned_department_ids, permissions, is_active) values
  ('user-1', 'admin', 'Dr. Helen Vance (Chief Administrator)', 'admin', null, '[]',
   '["manage_hospital","manage_doctors","manage_departments","manage_rooms","manage_staff","manage_config"]',
   true),
  ('user-2', 'reception', 'Claire Redfield (Senior Registrar)', 'receptionist', 'dep-1', '["dep-1"]',
   '["register_patient","generate_token","call_token","complete_token","skip_token","cancel_token","pause_queue"]',
   true),
  ('user-3', 'reception2', 'Leon S. Kennedy (Junior Clerk)', 'receptionist', null, '[]',
   '["register_patient","generate_token","call_token","complete_token","skip_token","cancel_token","pause_queue"]',
   true)
on conflict (id) do nothing;

insert into consultation_rooms (id, room_number, room_name, assigned_doctor_id, department_id, status) values
  ('rm-1', '101', 'Room 101 (Primary Care)', 'doc-1', 'dep-1', 'available'),
  ('rm-2', '204', 'Room 204 (Pediatrics)', 'doc-5', 'dep-2', 'available'),
  ('rm-3', '302', 'Room 302 (Cardiology)', 'doc-3', 'dep-3', 'available')
on conflict (id) do nothing;

insert into tracking_devices (id, device_code, name, status, battery_level) values
  ('dev-1', 'DEVICE-01', 'Smart Pager #01', 'available', 100),
  ('dev-2', 'DEVICE-02', 'Smart Pager #02', 'available', 95),
  ('dev-3', 'DEVICE-03', 'Smart Pager #03', 'available', 88),
  ('dev-4', 'DEVICE-04', 'Smart Pager #04', 'available', 100),
  ('dev-5', 'DEVICE-05', 'Smart Pager #05', 'available', 72)
on conflict (id) do nothing;
