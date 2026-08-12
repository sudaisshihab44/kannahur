/**
 * api/repositories/deviceRepository.ts
 *
 * All Supabase data-access operations for the `tracking_devices` table.
 */
import { supabase } from '../config/supabase.js';

/** Fetch all devices, ordered by id. */
export async function findAllDevices() {
  const { data, error } = await supabase
    .from('tracking_devices')
    .select('*')
    .order('id', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Fetch a single device by id. */
export async function findDeviceById(id: string) {
  const { data } = await supabase
    .from('tracking_devices')
    .select('*')
    .eq('id', id)
    .single();
  return data ?? null;
}

/** Insert a new device row. Returns the inserted row. */
export async function insertDevice(row: Record<string, any>) {
  const { data, error } = await supabase
    .from('tracking_devices')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Partial update of a device by id. */
export async function updateDevice(id: string, updates: Record<string, any>) {
  await supabase.from('tracking_devices').update(updates).eq('id', id);
}

/** Mark device as available and clear its assignment. */
export async function releaseDevice(id: string) {
  await supabase.from('tracking_devices').update({
    status: 'available',
    assigned_token_id: null,
    assigned_token_number: null,
    last_seen_at: new Date().toISOString(),
  }).eq('id', id);
}

/** Check if the tracking_devices table exists (graceful degradation). */
export async function tryFindAllDevices(): Promise<any[]> {
  try {
    return await findAllDevices();
  } catch (_) {
    // Table may not yet be migrated — return empty array rather than crashing
    return [];
  }
}
