/**
 * api/repositories/authRepository.ts
 *
 * Database operations for authentication, sessions, and tokens.
 */
import { supabase } from '../config/supabase.js';
import { v4 as uuidv4 } from 'uuid';

// ── REFRESH TOKENS ────────────────────────────────────────────────────────────

export async function insertRefreshToken(data: {
  userId: string;
  token: string;
  expiresAt: Date;
  ipAddress: string;
  userAgent: string;
  deviceInfo: Record<string, any>;
}) {
  const { data: result, error } = await supabase
    .from('refresh_tokens')
    .insert({
      id: uuidv4(),
      user_id: data.userId,
      token: data.token,
      expires_at: data.expiresAt.toISOString(),
      ip_address: data.ipAddress,
      user_agent: data.userAgent,
      device_info: data.deviceInfo,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw error;
  return result;
}

export async function findRefreshTokenByToken(token: string) {
  const { data } = await supabase
    .from('refresh_tokens')
    .select('*')
    .eq('token', token)
    .eq('is_active', true)
    .single();

  return data ?? null;
}

export async function revokeRefreshToken(tokenId: string, revokedBy?: string) {
  const { error } = await supabase
    .from('refresh_tokens')
    .update({
      is_active: false,
      revoked_at: new Date().toISOString(),
      revoked_by: revokedBy || null,
    })
    .eq('id', tokenId);

  if (error) throw error;
}

export async function revokeAllUserRefreshTokens(userId: string, exceptTokenId?: string) {
  let query = supabase
    .from('refresh_tokens')
    .update({
      is_active: false,
      revoked_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('is_active', true);

  if (exceptTokenId) {
    query = query.neq('id', exceptTokenId);
  }

  const { error } = await query;
  if (error) throw error;
}

export async function cleanExpiredRefreshTokens() {
  const { error } = await supabase.rpc('clean_expired_refresh_tokens');
  if (error) throw error;
}

// ── USER SESSIONS ─────────────────────────────────────────────────────────────

export async function insertSession(data: {
  userId: string;
  refreshTokenId: string;
  sessionToken: string;
  expiresAt: Date;
  ipAddress: string;
  userAgent: string;
  deviceType: string;
  deviceId?: string;
  deviceName: string;
  browser: string;
  os: string;
  locationCity?: string;
  locationCountry?: string;
}) {
  const { data: result, error } = await supabase
    .from('user_sessions')
    .insert({
      id: uuidv4(),
      user_id: data.userId,
      refresh_token_id: data.refreshTokenId,
      session_token: data.sessionToken,
      expires_at: data.expiresAt.toISOString(),
      ip_address: data.ipAddress,
      user_agent: data.userAgent,
      device_type: data.deviceType,
      device_id: data.deviceId || null,
      device_name: data.deviceName,
      browser: data.browser,
      os: data.os,
      location_city: data.locationCity || null,
      location_country: data.locationCountry || null,
      is_active: true,
      last_active_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return result;
}

export async function findSessionByToken(sessionToken: string) {
  const { data } = await supabase
    .from('user_sessions')
    .select('*')
    .eq('session_token', sessionToken)
    .eq('is_active', true)
    .single();

  return data ?? null;
}

export async function updateSessionActivity(sessionId: string) {
  const { error } = await supabase
    .from('user_sessions')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) throw error;
}

export async function endSession(sessionId: string) {
  const { error } = await supabase
    .from('user_sessions')
    .update({
      is_active: false,
      ended_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (error) throw error;
}

export async function getUserActiveSessions(userId: string) {
  const { data, error } = await supabase.rpc('get_user_active_sessions', {
    p_user_id: userId,
  });

  if (error) throw error;
  return data ?? [];
}

export async function revokeAllUserSessions(userId: string, exceptSessionId?: string) {
  const { data, error } = await supabase.rpc('revoke_all_user_sessions', {
    p_user_id: userId,
    p_except_session_id: exceptSessionId || null,
  });

  if (error) throw error;
  return data;
}

// ── AUTH AUDIT LOG ────────────────────────────────────────────────────────────

export async function logAuthEvent(data: {
  userId?: string;
  username: string;
  action: string;
  success: boolean;
  failureReason?: string;
  ipAddress: string;
  userAgent: string;
  deviceInfo: Record<string, any>;
  portal?: string;
}) {
  const { error } = await supabase.from('auth_audit_log').insert({
    id: uuidv4(),
    user_id: data.userId || null,
    username: data.username,
    action: data.action,
    success: data.success,
    failure_reason: data.failureReason || null,
    ip_address: data.ipAddress,
    user_agent: data.userAgent,
    device_info: data.deviceInfo,
    portal: data.portal || null,
    timestamp: new Date().toISOString(),
  });

  if (error) {
    console.error('[logAuthEvent] Error:', error);
    // Don't throw - audit logging should not break auth flow
  }
}

export async function getAuthAuditLogs(userId?: string, limit = 100) {
  let query = supabase
    .from('auth_audit_log')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ── SECURITY EVENTS ───────────────────────────────────────────────────────────

export async function logSecurityEvent(data: {
  userId?: string;
  eventType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  ipAddress: string;
  userAgent: string;
  metadata?: Record<string, any>;
}) {
  const { error } = await supabase.from('security_events').insert({
    id: uuidv4(),
    user_id: data.userId || null,
    event_type: data.eventType,
    severity: data.severity,
    description: data.description,
    ip_address: data.ipAddress,
    user_agent: data.userAgent,
    metadata: data.metadata || {},
    timestamp: new Date().toISOString(),
  });

  if (error) {
    console.error('[logSecurityEvent] Error:', error);
  }
}

export async function getSecurityEvents(userId?: string, limit = 100) {
  let query = supabase
    .from('security_events')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ── DEVICE FINGERPRINTS ───────────────────────────────────────────────────────

export async function upsertDeviceFingerprint(data: {
  userId: string;
  fingerprintHash: string;
  deviceName: string;
  deviceType: string;
  browser: string;
  os: string;
  trusted?: boolean;
}) {
  const { data: result, error } = await supabase
    .from('device_fingerprints')
    .upsert(
      {
        id: uuidv4(),
        user_id: data.userId,
        fingerprint_hash: data.fingerprintHash,
        device_name: data.deviceName,
        device_type: data.deviceType,
        browser: data.browser,
        os: data.os,
        trusted: data.trusted ?? false,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,fingerprint_hash' }
    )
    .select()
    .single();

  if (error) throw error;
  return result;
}

export async function isDeviceKnown(userId: string, fingerprintHash: string): Promise<boolean> {
  const { data } = await supabase
    .from('device_fingerprints')
    .select('id')
    .eq('user_id', userId)
    .eq('fingerprint_hash', fingerprintHash)
    .single();

  return !!data;
}

export async function getUserDevices(userId: string) {
  const { data, error } = await supabase
    .from('device_fingerprints')
    .select('*')
    .eq('user_id', userId)
    .order('last_seen_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}
