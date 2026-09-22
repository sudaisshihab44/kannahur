-- ============================================================
-- InclusyQ — Enable Row Level Security (SQ-BLK-002 remediation)
-- 0002_enable_rls.sql
--
-- Run this ENTIRE script in the Supabase SQL Editor AFTER 0001:
-- https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql
--
-- Why a new file: 0001_recover_inclusyq.sql already ran in
-- production and migrations are immutable — never edit a
-- deployed migration. This forward-only migration remediates it.
--
-- Safety: additive/permissive-restricting only, NO data loss,
-- NO column/table drops, NO downtime (ENABLE RLS takes an
-- instant ACCESS EXCLUSIVE lock only, no table rewrite).
-- Backend uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS,
-- so all src-api/repositories + RPC functions keep working.
-- Rollback: re-run with ENABLE swapped for DISABLE (documents
-- re-exposure; prefer fixing forward instead).
-- Idempotent: safe to run multiple times.
-- ============================================================

-- ── 1. ENABLE RLS on all 15 tables ──────────────────────────

alter table departments         enable row level security;
alter table doctors             enable row level security;
alter table patients            enable row level security;
alter table tokens              enable row level security;
alter table tracking_devices    enable row level security;
alter table consultation_rooms  enable row level security;
alter table users               enable row level security;
alter table queue_logs          enable row level security;
alter table whatsapp_logs       enable row level security;
alter table settings            enable row level security;
alter table refresh_tokens      enable row level security;
alter table user_sessions       enable row level security;
alter table auth_audit_log      enable row level security;
alter table security_events     enable row level security;
alter table device_fingerprints enable row level security;

-- Do NOT use FORCE ROW LEVEL SECURITY: service_role must keep
-- bypassing RLS for server-side CRUD.

-- ── 2. Least-privilege policies ─────────────────────────────
-- Public display tables: anon + authenticated SELECT-only.
-- PHI / credential / audit tables: NO policies = deny-all for
-- anon/authenticated. Backend CRUD via service_role unaffected.

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

-- ── 3. Explicit grants (defense in depth) ───────────────────

revoke all on table patients, tokens, users, queue_logs, whatsapp_logs,
  tracking_devices, refresh_tokens, user_sessions, auth_audit_log,
  security_events, device_fingerprints
  from anon, authenticated;
grant select on table departments, doctors, consultation_rooms, settings
  to anon, authenticated;

-- ── 4. VERIFICATION (expect: 15 rows, all rls_enabled = true) ──

SELECT tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'departments','doctors','patients','tokens','tracking_devices',
    'consultation_rooms','users','queue_logs','whatsapp_logs','settings',
    'refresh_tokens','user_sessions','auth_audit_log',
    'security_events','device_fingerprints'
  )
ORDER BY tablename;

-- Expect exactly 8 policies, all SELECT on the 4 public tables:
-- SELECT tablename, policyname, roles, cmd FROM pg_policies
-- WHERE schemaname = 'public' ORDER BY tablename, policyname;
