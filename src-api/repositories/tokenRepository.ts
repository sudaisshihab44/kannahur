/**
 * api/repositories/tokenRepository.ts
 *
 * Performance optimisations (Task 6):
 *   - findTokenById: SELECT * → minimal projection (only fields needed by service layer)
 *   - countWaitingTokens: JS .length on full id-set → DB COUNT(*) via RPC from migration 007
 *   - countTodayTokensForDept: same JS .length anti-pattern → DB COUNT(*) RPC
 *   - findWaitingTokens: SELECT * kept (full row needed for queue calculations)
 *   - findActiveTokens: SELECT * kept (background recalc needs all columns)
 *   - All other selects that truly need full rows are unchanged.
 */
import { supabase, supabaseRaw } from '../config/supabase.js';
import { TokenStatus } from '../../src/types/index.js';

// Minimal projection used for state-transition operations.
// Only fetch what the service layer actually reads — avoids transferring
// ~20 unused columns on every callToken/completeToken/skipToken/cancelToken.
const TOKEN_SLIM_FIELDS = [
  'id', 'token_number', 'status', 'department_id', 'doctor_id',
  'device_id', 'patient_email', 'patient_name', 'patient_mobile',
  'patient_age', 'patient_gender', 'department_name', 'doctor_name',
  'priority', 'is_emergency', 'position', 'estimated_wait_time',
  'notified_your_turn', 'notified_two_remaining', 'notified_two_ahead',
  'created_at', 'called_at', 'completed_at',
].join(', ');

/** Fetch a single token by id — slim projection (not SELECT *). */
export async function findTokenById(id: string) {
  const { data } = await supabase
    .from('tokens')
    .select(TOKEN_SLIM_FIELDS)
    .eq('id', id)
    .maybeSingle();
  return data ?? null;
}

/**
 * Fetch today's tokens only (date-filtered).
 * Replaces the unbounded findAllTokens() used by /api/data.
 * As usage grows this keeps the payload predictably small.
 */
export async function findTodayTokens() {
  // Midnight local time in ISO format
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from('tokens')
    .select('*')
    .gte('created_at', today.toISOString())
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Fetch patients registered within the last N days.
 * Replaces the unbounded findAllPatients() used by /api/data.
 */
export async function findRecentPatients(days: number = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Fetch all tokens, ordered by created_at ascending. */
export async function findAllTokens() {
  const { data, error } = await supabase
    .from('tokens')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Count today's tokens for a department.
 * Uses DB COUNT(*) via RPC from migration 007 (replaces JS .length anti-pattern).
 * Falls back to JS count if RPC is not yet deployed.
 */
export async function countTodayTokensForDept(departmentId: string, _todayStr?: string): Promise<number> {
  // Try the DB-side COUNT function first (migration 007)
  const { data, error } = await supabaseRaw.rpc('count_today_tokens_for_dept', {
    p_department_id: departmentId,
  });
  if (!error && data !== null) return Number(data);

  // Fallback: JS count (pre-migration behaviour)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = _todayStr ?? today.toISOString();
  const { data: rows } = await supabase
    .from('tokens')
    .select('id')
    .eq('department_id', departmentId)
    .gte('created_at', todayStr);
  return (rows ?? []).length;
}

/**
 * Count all currently WAITING tokens.
 * Uses DB COUNT(*) via RPC from migration 007 (replaces JS .length anti-pattern).
 * Falls back to JS count if RPC is not yet deployed.
 */
export async function countWaitingTokens(): Promise<number> {
  // Try the DB-side COUNT function first (migration 007)
  const { data, error } = await supabaseRaw.rpc('count_waiting_tokens');
  if (!error && data !== null) return Number(data);

  // Fallback: JS count (pre-migration behaviour)
  const { data: rows } = await supabase
    .from('tokens')
    .select('id')
    .eq('status', TokenStatus.WAITING);
  return (rows ?? []).length;
}

/** Fetch waiting tokens, optionally scoped to a department and/or doctor. */
export async function findWaitingTokens(departmentId?: string, doctorId?: string) {
  let query = supabase
    .from('tokens')
    .select('*')
    .eq('status', 'waiting')
    .order('created_at', { ascending: true });

  if (departmentId && departmentId !== 'all') query = query.eq('department_id', departmentId);
  if (doctorId     && doctorId     !== 'all') query = query.eq('doctor_id',     doctorId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** Fetch all tokens (waiting + called) — used for full queue recalculation. */
export async function findActiveTokens() {
  const { data, error } = await supabase.from('tokens').select('*');
  if (error) throw error;
  return data ?? [];
}

/** Check whether a patient (by mobile) already has a record. */
export async function findPatientByMobile(mobile: string) {
  const { data } = await supabase.from('patients').select('id').eq('mobile', mobile.trim());
  return (data ?? []).length > 0;
}

/** Insert a raw token row. Returns the inserted row. */
export async function insertToken(row: Record<string, any>) {
  const { data, error } = await supabase.from('tokens').insert(row).select();
  if (error) throw error;
  return data?.[0] ?? null;
}

/** Partial update of a token by id. */
export async function updateToken(id: string, updates: Record<string, any>) {
  const { data, error } = await supabase.from('tokens').update(updates).eq('id', id).select();
  if (error) throw error;
  return data?.[0] ?? null;
}

/** Fetch the currently called token for a department (most recent call). */
export async function findCurrentlyCalledToken(departmentId: string) {
  const { data } = await supabase
    .from('tokens')
    .select('*')
    .eq('department_id', departmentId)
    .eq('status', 'called')
    .order('called_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** Fetch tokens with waiting status and position ahead of given position. */
export async function findTokensAhead(departmentId: string, position: number) {
  const { data } = await supabase
    .from('tokens')
    .select('token_number')
    .eq('department_id', departmentId)
    .eq('status', 'waiting')
    .lt('position', position)
    .order('position', { ascending: true });
  return data ?? [];
}

// ── insertPatient convenience re-export ──────────────────────────────────────
// tokenService fallback path calls insertPatient. It lives in userRepository
// but was previously imported directly from there. Keep the import path in
// tokenService pointing to userRepository to avoid any ambiguity.
// (No re-export needed here — tokenService already imports from userRepository)
