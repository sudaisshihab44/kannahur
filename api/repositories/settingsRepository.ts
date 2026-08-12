/**
 * api/repositories/settingsRepository.ts
 *
 * All Supabase data-access operations for the `settings` table,
 * `announcements` (stored as a JSONB array inside settings), and
 * `queue_logs` / `whatsapp_logs` audit tables.
 */
import { supabase } from '../config/supabase.js';

// ── Settings ─────────────────────────────────────────────────────────────────

/** Fetch the single settings row. */
export async function getSettings() {
  const { data, error } = await supabase.from('settings').select('*').limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

/** Fetch only the config column from settings. */
export async function getSettingsConfig() {
  const { data } = await supabase.from('settings').select('config').single();
  return data ?? null;
}

/** Partial update on the single settings row (id = 1). */
export async function updateSettings(updates: Record<string, any>) {
  const { error } = await supabase.from('settings').update(updates).eq('id', 1);
  if (error) throw error;
}

// ── Announcements ─────────────────────────────────────────────────────────────

/** Read current announcements array from settings. */
export async function getAnnouncements(): Promise<any[]> {
  const { data } = await supabase.from('settings').select('announcements').limit(1);
  return data?.[0]?.announcements ?? [];
}

/** Overwrite the announcements array in settings. */
export async function saveAnnouncements(announcements: any[]) {
  await supabase.from('settings').update({ announcements }).eq('id', 1);
}

// ── Queue logs ────────────────────────────────────────────────────────────────

/** Insert a single queue/audit log row. */
export async function insertQueueLog(row: Record<string, any>) {
  await supabase.from('queue_logs').insert(row);
}

/** Fetch queue logs, most recent first, up to a limit. */
export async function findQueueLogs(limit = 200) {
  const { data, error } = await supabase
    .from('queue_logs')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// ── WhatsApp / notification logs ──────────────────────────────────────────────

/** Insert a single WhatsApp or email log row. */
export async function insertNotificationLog(row: Record<string, any>) {
  await supabase.from('whatsapp_logs').insert(row);
}

/** Fetch notification logs, most recent first, up to a limit. */
export async function findNotificationLogs(limit = 100) {
  const { data, error } = await supabase
    .from('whatsapp_logs')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
