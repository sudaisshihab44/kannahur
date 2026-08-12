/**
 * api/repositories/userRepository.ts
 *
 * All Supabase data-access operations for the `users`, `patients`,
 * `departments`, `doctors`, and `consultation_rooms` tables.
 */
import { supabase } from '../config/supabase.js';

// ── Users ─────────────────────────────────────────────────────────────────────

/** Case-insensitive username lookup. Returns the first match or null. */
export async function findUserByUsername(username: string) {
  const { data } = await supabase
    .from('users')
    .select('*')
    .ilike('username', username.trim());
  return data?.[0] ?? null;
}

/** Find user by primary key. */
export async function findUserById(id: string) {
  const { data } = await supabase.from('users').select('*').eq('id', id);
  return data?.[0] ?? null;
}

/** Fetch all users. */
export async function findAllUsers() {
  const { data, error } = await supabase.from('users').select('*');
  if (error) throw error;
  return data ?? [];
}

/** Check username uniqueness, optionally excluding a specific id. */
export async function isUsernameTaken(username: string, excludeId?: string) {
  let query = supabase.from('users').select('id').ilike('username', username.trim());
  if (excludeId) query = query.neq('id', excludeId);
  const { data } = await query;
  return (data ?? []).length > 0;
}

/** Insert a new user row. Returns inserted row. */
export async function insertUser(row: Record<string, any>) {
  const { data, error } = await supabase.from('users').insert(row).select();
  if (error) throw error;
  return data?.[0] ?? null;
}

/** Partial update of a user by id. Returns updated row. */
export async function updateUser(id: string, updates: Record<string, any>) {
  const { data, error } = await supabase.from('users').update(updates).eq('id', id).select();
  if (error) throw error;
  return data?.[0] ?? null;
}

/** Delete a user by id. */
export async function deleteUser(id: string) {
  await supabase.from('users').delete().eq('id', id);
}

// ── Patients ──────────────────────────────────────────────────────────────────

/** Find patient by mobile number. */
export async function findPatientByMobile(mobile: string) {
  const { data } = await supabase.from('patients').select('*').eq('mobile', mobile.trim());
  return data?.[0] ?? null;
}

/** Fetch all patients, newest first. */
export async function findAllPatients() {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Insert a new patient row. Returns inserted row. */
export async function insertPatient(row: Record<string, any>) {
  const { data, error } = await supabase.from('patients').insert(row).select();
  if (error) throw error;
  return data?.[0] ?? null;
}

// ── Departments ───────────────────────────────────────────────────────────────

/** Fetch all departments. */
export async function findAllDepartments() {
  const { data, error } = await supabase.from('departments').select('*');
  if (error) throw error;
  return data ?? [];
}

/** Find department by id. */
export async function findDepartmentById(id: string) {
  const { data } = await supabase.from('departments').select('*').eq('id', id);
  return data?.[0] ?? null;
}

/** Check if a prefix already exists (optionally excluding a dept id). */
export async function isPrefixTaken(prefix: string, excludeId?: string) {
  let query = supabase.from('departments').select('id').eq('prefix', prefix.trim().toUpperCase());
  if (excludeId) query = query.neq('id', excludeId);
  const { data } = await query;
  return (data ?? []).length > 0;
}

/** Insert a new department row. */
export async function insertDepartment(row: Record<string, any>) {
  const { data, error } = await supabase.from('departments').insert(row).select();
  if (error) throw error;
  return data?.[0] ?? null;
}

/** Update a department by id. */
export async function updateDepartment(id: string, updates: Record<string, any>) {
  const { data, error } = await supabase.from('departments').update(updates).eq('id', id).select();
  if (error) throw error;
  return data?.[0] ?? null;
}

/** Delete a department by id. */
export async function deleteDepartment(id: string) {
  await supabase.from('departments').delete().eq('id', id);
}

/** Fetch department names for an array of ids. */
export async function findDepartmentNamesByIds(ids: string[]) {
  const { data } = await supabase.from('departments').select('name').in('id', ids);
  return (data ?? []).map((d: any) => d.name as string);
}

// ── Doctors ───────────────────────────────────────────────────────────────────

/** Fetch all doctors. */
export async function findAllDoctors() {
  const { data, error } = await supabase.from('doctors').select('*');
  if (error) throw error;
  return data ?? [];
}

/** Find doctor by id. */
export async function findDoctorById(id: string) {
  const { data } = await supabase.from('doctors').select('*').eq('id', id);
  return data?.[0] ?? null;
}

/** Find doctor room number for notification copy. */
export async function findDoctorRoomNumber(doctorId: string): Promise<string | null> {
  const { data } = await supabase
    .from('doctors')
    .select('room_number')
    .eq('id', doctorId)
    .maybeSingle();
  return data?.room_number ?? null;
}

/** Insert a new doctor row. */
export async function insertDoctor(row: Record<string, any>) {
  const { data, error } = await supabase.from('doctors').insert(row).select();
  if (error) throw error;
  return data?.[0] ?? null;
}

/** Update a doctor by id. */
export async function updateDoctor(id: string, updates: Record<string, any>) {
  const { data, error } = await supabase.from('doctors').update(updates).eq('id', id).select();
  if (error) throw error;
  return data?.[0] ?? null;
}

/** Delete a doctor by id. */
export async function deleteDoctor(id: string) {
  await supabase.from('doctors').delete().eq('id', id);
}

// ── Consultation Rooms ────────────────────────────────────────────────────────

/** Fetch all consultation rooms. */
export async function findAllRooms() {
  const { data, error } = await supabase.from('consultation_rooms').select('*');
  if (error) throw error;
  return data ?? [];
}

/** Insert a new room. */
export async function insertRoom(row: Record<string, any>) {
  const { data, error } = await supabase.from('consultation_rooms').insert(row).select();
  if (error) throw error;
  return data?.[0] ?? null;
}

/** Update a room by id. */
export async function updateRoom(id: string, updates: Record<string, any>) {
  const { data, error } = await supabase.from('consultation_rooms').update(updates).eq('id', id).select();
  if (error) throw error;
  return data?.[0] ?? null;
}

/** Delete a room by id. */
export async function deleteRoom(id: string) {
  await supabase.from('consultation_rooms').delete().eq('id', id);
}
