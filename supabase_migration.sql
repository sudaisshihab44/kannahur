-- ============================================================
-- InclusyQ Complete Database Schema Synchronization Migration
-- Run this entire script in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/fjkogjwwnpsocdxoikiu/sql
-- ============================================================

-- 1. DEPARTMENTS: add missing columns & disable RLS
alter table departments add column if not exists description text;
alter table departments add column if not exists is_enabled boolean default true;
alter table departments add column if not exists default_consultation_time integer default 15;
alter table departments disable row level security;

-- 2. DOCTORS: add missing columns & disable RLS
alter table doctors add column if not exists specialization text;
alter table doctors add column if not exists status text default 'active';
alter table doctors add column if not exists room_number text;
alter table doctors add column if not exists avg_consultation_time integer default 15;
alter table doctors add column if not exists start_time text default '08:00';
alter table doctors add column if not exists end_time text default '17:00';
alter table doctors add column if not exists max_patients_per_day integer default 40;
alter table doctors add column if not exists is_enabled boolean default true;
alter table doctors disable row level security;

-- 3. PATIENTS: add missing columns & disable RLS
alter table patients add column if not exists email text;
alter table patients add column if not exists age integer;
alter table patients add column if not exists gender text;
alter table patients add column if not exists created_at timestamptz default now();
alter table patients disable row level security;

-- 4. TOKENS: add missing columns & disable RLS
alter table tokens add column if not exists token_number text;
alter table tokens add column if not exists patient_name text;
alter table tokens add column if not exists patient_mobile text;
alter table tokens add column if not exists patient_email text;
alter table tokens add column if not exists patient_age integer;
alter table tokens add column if not exists patient_gender text;
alter table tokens add column if not exists department_id text;
alter table tokens add column if not exists department_name text;
alter table tokens add column if not exists doctor_id text;
alter table tokens add column if not exists doctor_name text;
alter table tokens add column if not exists reason_for_visit text;
alter table tokens add column if not exists status text default 'waiting';
alter table tokens add column if not exists created_at timestamptz default now();
alter table tokens add column if not exists called_at timestamptz;
alter table tokens add column if not exists completed_at timestamptz;
alter table tokens add column if not exists is_emergency boolean default false;
alter table tokens add column if not exists priority text default 'Normal';
alter table tokens add column if not exists notes text;
alter table tokens add column if not exists position integer;
alter table tokens add column if not exists estimated_consultation_time integer;
alter table tokens add column if not exists estimated_wait_time integer;
alter table tokens add column if not exists expected_consultation_start_time timestamptz;
alter table tokens add column if not exists last_notified_wait_time integer;
alter table tokens add column if not exists notified_two_remaining boolean default false;
alter table tokens add column if not exists notified_your_turn boolean default false;
alter table tokens add column if not exists notified_two_ahead boolean default false;
alter table tokens disable row level security;

-- 5. CONSULTATION_ROOMS: add missing columns & disable RLS
alter table consultation_rooms add column if not exists room_number text;
alter table consultation_rooms add column if not exists room_name text;
alter table consultation_rooms add column if not exists assigned_doctor_id text;
alter table consultation_rooms add column if not exists department_id text;
alter table consultation_rooms add column if not exists status text default 'available';
alter table consultation_rooms add column if not exists display_screen_id text;
alter table consultation_rooms disable row level security;

-- 6. USERS: add missing columns & disable RLS
alter table users add column if not exists department_id text;
alter table users add column if not exists assigned_department_ids jsonb default '[]';
alter table users add column if not exists permissions jsonb default '[]';
alter table users add column if not exists password text default 'password';
alter table users add column if not exists is_active boolean default true;
alter table users disable row level security;

-- 7. QUEUE_LOGS: add missing columns & disable RLS
alter table queue_logs add column if not exists token_id text;
alter table queue_logs add column if not exists token_number text;
alter table queue_logs add column if not exists action text;
alter table queue_logs add column if not exists user_id text;
alter table queue_logs add column if not exists timestamp timestamptz default now();
alter table queue_logs disable row level security;

-- 8. WHATSAPP_LOGS: add missing columns & disable RLS
alter table whatsapp_logs add column if not exists token_id text;
alter table whatsapp_logs add column if not exists token_number text;
alter table whatsapp_logs add column if not exists patient_name text;
alter table whatsapp_logs add column if not exists patient_mobile text;
alter table whatsapp_logs add column if not exists message text;
alter table whatsapp_logs add column if not exists timestamp timestamptz default now();
alter table whatsapp_logs add column if not exists type text;
alter table whatsapp_logs disable row level security;

-- 9. SETTINGS: add missing columns & disable RLS
alter table settings add column if not exists is_paused boolean default false;
alter table settings add column if not exists hospital_info jsonb default '{}';
alter table settings add column if not exists announcements jsonb default '[]';
alter table settings add column if not exists config jsonb default '{}';
alter table settings disable row level security;

-- 10. FOREIGN KEY CONSTRAINTS (Safe Re-creation)
alter table doctors drop constraint if exists doctors_department_id_fkey, add constraint doctors_department_id_fkey foreign key (department_id) references departments (id) on delete set null;
alter table tokens drop constraint if exists tokens_department_id_fkey, add constraint tokens_department_id_fkey foreign key (department_id) references departments (id) on delete set null;
alter table tokens drop constraint if exists tokens_doctor_id_fkey, add constraint tokens_doctor_id_fkey foreign key (doctor_id) references doctors (id) on delete set null;
alter table consultation_rooms drop constraint if exists consultation_rooms_assigned_doctor_id_fkey, add constraint consultation_rooms_assigned_doctor_id_fkey foreign key (assigned_doctor_id) references doctors (id) on delete set null;
alter table consultation_rooms drop constraint if exists consultation_rooms_department_id_fkey, add constraint consultation_rooms_department_id_fkey foreign key (department_id) references departments (id) on delete set null;
alter table users drop constraint if exists users_department_id_fkey, add constraint users_department_id_fkey foreign key (department_id) references departments (id) on delete set null;

-- 11. INDEXES FOR PERFORMANCE
create index if not exists idx_tokens_status on tokens(status);
create index if not exists idx_tokens_doctor_id on tokens(doctor_id);
create index if not exists idx_tokens_department_id on tokens(department_id);
create index if not exists idx_doctors_department_id on doctors(department_id);
create index if not exists idx_users_username on users(username);

-- 12. DEFAULT SETTINGS ROW SEED
insert into settings (id, is_paused, hospital_info, announcements, config)
values (
  1, 
  false, 
  '{"name":"St. Jude Memorial Hospital","tagline":"Compassionate Care, Advanced Medicine","address":"742 Evergreen Terrace, Medical District, Sector 4","phone":"+1 (555) 010-9900","logoColor":"text-blue-600"}',
  '[{"id":"ann-1","text":"Welcome to St. Jude Memorial Hospital. Please wait for your token to flash on the live queue TV display.","createdAt":"2026-07-17T08:00:00Z"},{"id":"ann-2","text":"Note: Patients under emergency token designations will be expedited immediately to critical care units.","createdAt":"2026-07-17T08:05:00Z"}]',
  '{"tokenPrefix":"","dailyTokenReset":true,"queueStartNumber":1,"emergencyQueue":true,"walkInQueue":true,"maxQueueSize":100,"defaultWaitingTime":15,"numberFormat":"001","maxDailyTokens":500,"emergencyTokenPrefix":"EMR","vipTokenPrefix":"VIP","walkInTokenPrefix":"WLK","consultationStartTime":"09:00","consultationEndTime":"17:00","autoSkipTimeout":180,"maxWaitingTime":120,"minWaitTimeNotificationThreshold":5,"enableWhatsAppUpdates":true}'
)
on conflict (id) do update set
  hospital_info = coalesce(settings.hospital_info, excluded.hospital_info),
  announcements = coalesce(settings.announcements, excluded.announcements),
  config = coalesce(settings.config, excluded.config);

-- 13. DEFAULT DEPARTMENTS SEED
insert into departments (id, name, prefix, is_enabled, default_consultation_time) values
  ('dep-1', 'General Medicine', 'GEN', true, 15),
  ('dep-2', 'Pediatrics', 'PEDS', true, 15),
  ('dep-3', 'Cardiology', 'CARD', true, 15),
  ('dep-4', 'Orthopedics', 'ORTH', true, 15),
  ('dep-5', 'Ophthalmology', 'EYE', true, 15)
on conflict (id) do nothing;

-- 14. DEFAULT DOCTORS SEED
insert into doctors (id, name, department_id, specialization, status, room_number, avg_consultation_time, start_time, end_time, max_patients_per_day, is_enabled) values
  ('doc-1', 'Dr. Sarah Jenkins', 'dep-1', 'Primary Care / Family Medicine', 'active', '101', 15, '08:00', '17:00', 40, true),
  ('doc-2', 'Dr. Robert Chen', 'dep-1', 'Internal Medicine', 'active', 'G-12', 15, '08:00', '17:00', 40, true),
  ('doc-3', 'Dr. Alisha Patel', 'dep-3', 'Interventional Cardiology', 'active', '302', 15, '08:00', '17:00', 40, true),
  ('doc-4', 'Dr. Marcus Vance', 'dep-4', 'Bone & Joint Surgery', 'active', 'G-12', 15, '08:00', '17:00', 40, true),
  ('doc-5', 'Dr. Emily Wong', 'dep-2', 'General Pediatrics', 'active', '204', 15, '08:00', '17:00', 40, true),
  ('doc-6', 'Dr. Arthur Pendelton', 'dep-5', 'Refractive Surgery', 'active', 'G-12', 15, '08:00', '17:00', 40, true)
on conflict (id) do nothing;

-- 15. DEFAULT ROOMS SEED
insert into consultation_rooms (id, room_number, room_name, assigned_doctor_id, department_id, status) values
  ('rm-1', '101', 'Room 101 (Primary Care)', 'doc-1', 'dep-1', 'available'),
  ('rm-2', '204', 'Room 204 (Pediatrics)', 'doc-5', 'dep-2', 'available'),
  ('rm-3', '302', 'Room 302 (Cardiology)', 'doc-3', 'dep-3', 'available')
on conflict (id) do nothing;
