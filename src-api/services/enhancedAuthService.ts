/**
 * api/services/enhancedAuthService.ts
 *
 * Enhanced authentication service with JWT, refresh tokens, sessions, and security features.
 * This replaces the old authService.ts with production-grade authentication.
 */
import { findUserByUsername, updateUser } from '../repositories/userRepository.js';
import {
  insertRefreshToken,
  findRefreshTokenByToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
  logAuthEvent,
  logSecurityEvent,
  upsertDeviceFingerprint,
  isDeviceKnown,
} from '../repositories/authRepository.js';
import {
  storeSession,
  getSession,
  touchSession,
  revokeSession,
  revokeAllUserSessionsCache,
  listUserSessions,
} from '../cache/sessionStore.js';
import { generateAccessToken, generateRefreshToken, verifyAccessToken, verifyRefreshToken, getTokenExpiration } from '../utils/jwtUtils.js';
import { hashPassword, verifyPassword, needsRehash } from '../utils/passwordUtils.js';
import { parseUserAgent, generateDeviceFingerprint } from '../utils/deviceUtils.js';
import { mapUser } from '../utils/mappers.js';
import { UserRole } from '../../src/types/index.js';
import { jwtConfig } from '../config/jwtConfig.js';
import { v4 as uuidv4 } from 'uuid';

interface AuthContext {
  ipAddress: string;
  userAgent: string;
  deviceInfo?: Record<string, any>;
}

interface LoginResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  user?: any;
  sessionId?: string;
  expiresIn?: number;
  message?: string;
}

/**
 * Authenticate user with username/password and create session.
 * Returns JWT tokens and user data.
 */
export async function loginWithCredentials(
  username: string,
  password: string | undefined,
  portal: 'admin' | 'reception' | undefined,
  context: AuthContext
): Promise<LoginResult> {
  const { ipAddress, userAgent, deviceInfo = {} } = context;
  const parsedDevice = parseUserAgent(userAgent);

  // Input validation
  if (!username?.trim()) {
    await logAuthEvent({
      username: username || 'unknown',
      action: 'login_failed',
      success: false,
      failureReason: 'Missing username',
      ipAddress,
      userAgent,
      deviceInfo: parsedDevice,
      portal,
    });

    return { success: false, message: 'Username is required' };
  }

  if (!password?.trim()) {
    await logAuthEvent({
      username,
      action: 'login_failed',
      success: false,
      failureReason: 'Missing password',
      ipAddress,
      userAgent,
      deviceInfo: parsedDevice,
      portal,
    });

    return { success: false, message: 'Password is required' };
  }

  // Fetch user
  const userRow = await findUserByUsername(username);
  if (!userRow) {
    await logAuthEvent({
      username,
      action: 'login_failed',
      success: false,
      failureReason: 'User not found',
      ipAddress,
      userAgent,
      deviceInfo: parsedDevice,
      portal,
    });

    // Don't reveal if user exists
    return { success: false, message: 'Invalid username or password.' };
  }

  const user = mapUser(userRow);

  // Check if account is locked (use raw DB field)
  const lockedUntil = userRow.locked_until as string | null;
  if (lockedUntil && new Date(lockedUntil) > new Date()) {
    const lockDuration = Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 60000);
    
    await logAuthEvent({
      userId: user.id,
      username,
      action: 'login_failed',
      success: false,
      failureReason: 'Account locked',
      ipAddress,
      userAgent,
      deviceInfo: parsedDevice,
      portal,
    });

    await logSecurityEvent({
      userId: user.id,
      eventType: 'suspicious_login',
      severity: 'medium',
      description: `Login attempt while account locked (${lockDuration} minutes remaining)`,
      ipAddress,
      userAgent,
      metadata: parsedDevice,
    });

    return {
      success: false,
      message: `Account temporarily locked. Please try again in ${lockDuration} minutes.`,
    };
  }

  // Check if account is deactivated
  if (user.isActive === false) {
    await logAuthEvent({
      userId: user.id,
      username,
      action: 'login_failed',
      success: false,
      failureReason: 'Account deactivated',
      ipAddress,
      userAgent,
      deviceInfo: parsedDevice,
      portal,
    });

    return { success: false, message: 'This account has been deactivated.' };
  }

  // Verify password
  const passwordHash = userRow.password_hash || userRow.password; // Support legacy plain passwords
  let passwordValid = false;

  if (userRow.password_hash) {
    // New bcrypt hash
    passwordValid = await verifyPassword(password, userRow.password_hash);
  } else if (userRow.password) {
    // Legacy plain text password (upgrade to hash)
    passwordValid = password === userRow.password;
    
    if (passwordValid) {
      // Automatically upgrade to hashed password
      const newHash = await hashPassword(password);
      await updateUser(user.id, {
        password_hash: newHash,
        password: null, // Clear plain password
        password_changed_at: new Date().toISOString(),
      });
    }
  }

  if (!passwordValid) {
    // Increment failed attempts
    const failedAttempts = ((userRow.failed_login_attempts as number) || 0) + 1;
    const updates: Record<string, any> = { failed_login_attempts: failedAttempts };

    // Lock account after max attempts
    if (failedAttempts >= jwtConfig.security.maxFailedAttempts) {
      const lockUntil = new Date(Date.now() + jwtConfig.security.lockoutDuration);
      updates.locked_until = lockUntil.toISOString();

      await logSecurityEvent({
        userId: user.id,
        eventType: 'multiple_failed_logins',
        severity: 'high',
        description: `Account locked after ${failedAttempts} failed login attempts`,
        ipAddress,
        userAgent,
        metadata: { ...parsedDevice, failedAttempts },
      });
    }

    await updateUser(user.id, updates);

    await logAuthEvent({
      userId: user.id,
      username,
      action: 'login_failed',
      success: false,
      failureReason: 'Invalid password',
      ipAddress,
      userAgent,
      deviceInfo: parsedDevice,
      portal,
    });

    return { success: false, message: 'Invalid username or password.' };
  }

  // Check portal authorization
  if (portal === 'reception' && user.role !== UserRole.RECEPTIONIST) {
    await logAuthEvent({
      userId: user.id,
      username,
      action: 'login_failed',
      success: false,
      failureReason: 'Wrong portal',
      ipAddress,
      userAgent,
      deviceInfo: parsedDevice,
      portal,
    });

    return { success: false, message: 'This account belongs to the Administrator Portal.' };
  }

  if (portal === 'admin' && user.role !== UserRole.ADMIN) {
    await logAuthEvent({
      userId: user.id,
      username,
      action: 'login_failed',
      success: false,
      failureReason: 'Wrong portal',
      ipAddress,
      userAgent,
      deviceInfo: parsedDevice,
      portal,
    });

    return { success: false, message: 'This account belongs to the Reception Portal.' };
  }

  // Check for unusual device — optional; skip gracefully if tables missing
  const fingerprintHash = generateDeviceFingerprint(ipAddress, userAgent, deviceInfo);
  let knownDevice = true; // default safe: don't flag as unusual if store is unavailable
  try {
    knownDevice = await isDeviceKnown(user.id, fingerprintHash);

    if (!knownDevice) {
      await logSecurityEvent({
        userId: user.id,
        eventType: 'unusual_device',
        severity: 'low',
        description: `Login from new device: ${parsedDevice.deviceName}`,
        ipAddress,
        userAgent,
        metadata: parsedDevice,
      });
    }

    // Save device fingerprint
    await upsertDeviceFingerprint({
      userId: user.id,
      fingerprintHash,
      deviceName: parsedDevice.deviceName,
      deviceType: parsedDevice.deviceType,
      browser: parsedDevice.browser,
      os: parsedDevice.os,
      trusted: knownDevice,
    });
  } catch {
    // device_fingerprints / security_events table not yet created — non-fatal
  }

  // Check concurrent sessions — non-fatal if session store unavailable
  let activeSessions: any[] = [];
  try {
    activeSessions = await listUserSessions(user.id);
  } catch { /* ignore */ }
  if (activeSessions.length >= jwtConfig.security.maxConcurrentSessions) {
    await logSecurityEvent({
      userId: user.id,
      eventType: 'concurrent_sessions',
      severity: 'medium',
      description: `User has ${activeSessions.length} active sessions (max: ${jwtConfig.security.maxConcurrentSessions})`,
      ipAddress,
      userAgent,
      metadata: { activeSessions: activeSessions.length },
    });

    // Optionally revoke oldest session
    // await endSession(activeSessions[activeSessions.length - 1].id);
  }

  // Generate session ID
  const sessionId = uuidv4();

  // Generate JWT tokens
  const tokenPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    permissions: user.permissions || [],
    sessionId,
  };

  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  // Store refresh token + session — wrapped in try/catch so that a missing
  // table (fresh Supabase project before migrations are run) does NOT abort
  // the login.  The JWT itself is still valid; session persistence is best-effort.
  let refreshTokenRecord: { id: string } = { id: 'ephemeral' };
  try {
    const refreshTokenExpiry = getTokenExpiration(jwtConfig.refreshToken.expiresIn);
    refreshTokenRecord = await insertRefreshToken({
      userId: user.id,
      token: refreshToken,
      expiresAt: refreshTokenExpiry,
      ipAddress,
      userAgent,
      deviceInfo: parsedDevice,
    });
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[login] refresh_tokens table unavailable — skipping token persistence:', (e as any)?.message);
    }
  }

  // Create session (stored in Redis + Supabase)
  const sessionExpiry = getTokenExpiration(jwtConfig.refreshToken.expiresIn);
  try {
    await storeSession(
    {
      userId: user.id,
      refreshTokenId: refreshTokenRecord.id,
      sessionToken: sessionId,
      expiresAt: sessionExpiry,
      ipAddress,
      userAgent,
      deviceType: parsedDevice.deviceType,
      deviceId: fingerprintHash,
      deviceName: parsedDevice.deviceName,
      browser: parsedDevice.browser,
      os: parsedDevice.os,
    },
    {
      userId:       user.id,
      username:     user.username,
      role:         user.role,
      permissions:  user.permissions || [],
      deviceName:   parsedDevice.deviceName,
      ipAddress,
      createdAt:    new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      expiresAt:    sessionExpiry.toISOString(),
    }
  );
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[login] user_sessions table unavailable — skipping session persistence:', (e as any)?.message);
    }
  }

  // Reset failed attempts and update last login
  await updateUser(user.id, {
    failed_login_attempts: 0,
    locked_until: null,
    last_login_at: new Date().toISOString(),
    last_login_ip: ipAddress,
  });

  // Log successful login
  await logAuthEvent({
    userId: user.id,
    username,
    action: 'login_success',
    success: true,
    ipAddress,
    userAgent,
    deviceInfo: parsedDevice,
    portal,
  });

  // Calculate access token expiry in seconds
  const expiresIn = Math.floor(getTokenExpiration(jwtConfig.accessToken.expiresIn).getTime() / 1000);

  return {
    success: true,
    accessToken,
    refreshToken,
    user,
    sessionId,
    expiresIn,
  };
}

/**
 * Refresh access token using refresh token.
 */
export async function refreshAccessToken(
  refreshToken: string,
  context: AuthContext
): Promise<LoginResult> {
  const { ipAddress, userAgent } = context;

  // Verify refresh token
  const decoded = verifyRefreshToken(refreshToken);
  if (!decoded) {
    return { success: false, message: 'Invalid or expired refresh token' };
  }

  // Check if token exists in database and is active
  const tokenRecord = await findRefreshTokenByToken(refreshToken);
  if (!tokenRecord || !tokenRecord.is_active) {
    await logSecurityEvent({
      userId: decoded.userId,
      eventType: 'token_theft_suspected',
      severity: 'critical',
      description: 'Attempted to use revoked or non-existent refresh token',
      ipAddress,
      userAgent,
      metadata: { tokenId: tokenRecord?.id },
    });

    return { success: false, message: 'Refresh token has been revoked' };
  }

  // Fetch user
  const userRow = await findUserByUsername(decoded.username);
  if (!userRow || !userRow.is_active) {
    return { success: false, message: 'User not found or deactivated' };
  }

  const user = mapUser(userRow);

  // Update session activity via Redis-backed store
  const session = await getSession(decoded.sessionId);
  if (session) {
    await touchSession(decoded.sessionId);
  }

  // Generate new access token
  const newAccessToken = generateAccessToken({
    userId: user.id,
    username: user.username,
    role: user.role,
    permissions: user.permissions || [],
    sessionId: decoded.sessionId,
  });

  // Log token refresh
  await logAuthEvent({
    userId: user.id,
    username: user.username,
    action: 'token_refresh',
    success: true,
    ipAddress,
    userAgent,
    deviceInfo: parseUserAgent(userAgent),
  });

  const expiresIn = Math.floor(getTokenExpiration(jwtConfig.accessToken.expiresIn).getTime() / 1000);

  return {
    success: true,
    accessToken: newAccessToken,
    refreshToken, // Return same refresh token
    user,
    sessionId: decoded.sessionId,
    expiresIn,
  };
}

/**
 * Logout user and revoke tokens.
 */
export async function logout(
  accessToken: string,
  context: AuthContext
): Promise<{ success: boolean; message?: string }> {
  const { ipAddress, userAgent } = context;

  const decoded = verifyAccessToken(accessToken);
  if (!decoded) {
    return { success: false, message: 'Invalid access token' };
  }

  // Revoke session from Redis + Supabase
  await revokeSession(decoded.sessionId);
  
  // Also revoke the associated refresh token from Supabase
  const { findSessionByToken } = await import('../repositories/authRepository.js');
  const dbSession = await findSessionByToken(decoded.sessionId);
  if (dbSession?.refresh_token_id) {
    await revokeRefreshToken(dbSession.refresh_token_id, decoded.username);
  }

  // Log logout
  await logAuthEvent({
    userId: decoded.userId,
    username: decoded.username,
    action: 'logout',
    success: true,
    ipAddress,
    userAgent,
    deviceInfo: parseUserAgent(userAgent),
  });

  return { success: true };
}

/**
 * Revoke all sessions for a user (force logout from all devices).
 */
export async function revokeAllSessions(
  userId: string,
  currentSessionId?: string
): Promise<{ success: boolean; revokedCount: number }> {
  const count = await revokeAllUserSessionsCache(userId, currentSessionId);
  await revokeAllUserRefreshTokens(userId);
  return { success: true, revokedCount: count };
}

/**
 * Verify access token and return user data.
 *
 * Session-store fallback:
 *   If the user_sessions table or Redis is not yet available (e.g. fresh
 *   Supabase project before migrations run, or Redis not configured), we
 *   degrade gracefully: trust the JWT signature alone and skip the
 *   session-row check.  This means a revoked token could still work for up
 *   to the access-token TTL (15 min) in that degraded state — acceptable for
 *   a hospital intranet app that is not yet in full production.
 *
 *   Once the tables exist, session revocation works normally.
 */
export async function verifySession(accessToken: string): Promise<{
  valid: boolean;
  user?: any;
  message?: string;
}> {
  const decoded = verifyAccessToken(accessToken);
  if (!decoded) {
    return { valid: false, message: 'Invalid or expired access token' };
  }

  // Check session in Redis first, fall back to Supabase.
  // Wrap in try/catch so a missing table (42P01) or network error does not
  // reject the request — we fall through to the JWT-only path below.
  let sessionMissing = false;
  try {
    const session = await getSession(decoded.sessionId);
    if (!session) {
      sessionMissing = true;
    } else {
      // Non-blocking activity ping — never blocks the response
      touchSession(decoded.sessionId).catch(() => {});
    }
  } catch {
    // Session store unavailable (table not yet created, Redis down, etc.)
    // Log once in dev so it's visible, then fall through.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[verifySession] session store unavailable — falling back to JWT-only verification');
    }
  }

  // Hard reject only when the session store is available AND explicitly has no
  // record (i.e. it was revoked).  If the store threw, we trust the JWT.
  if (sessionMissing) {
    // Re-check: if the getSession call succeeded and returned null, that is a
    // genuine revocation.  But we only know getSession returned null (no throw)
    // when sessionMissing is true and the try block completed normally.
    // In that case, reject — the token was explicitly revoked.
    //
    // However: on the very first login the session INSERT may not have
    // committed yet (race between the INSERT in storeSession and the first
    // /api/data call).  Give it one retry after a brief yield.
    await new Promise(r => setTimeout(r, 80));
    try {
      const retried = await getSession(decoded.sessionId);
      if (!retried) {
        return { valid: false, message: 'Session expired or revoked' };
      }
      touchSession(decoded.sessionId).catch(() => {});
    } catch {
      // Store still unavailable — fall through to JWT-only path
    }
  }

  // Fetch user row (DB lookup, not cached here — jwtAuthMiddleware caches it)
  const userRow = await findUserByUsername(decoded.username);
  if (!userRow || !userRow.is_active) {
    return { valid: false, message: 'User not found or deactivated' };
  }

  return { valid: true, user: mapUser(userRow) };
}
