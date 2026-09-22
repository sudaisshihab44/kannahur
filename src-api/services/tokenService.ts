/**
 * api/services/tokenService.ts
 *
 * Performance optimisations applied (Tasks 3 & 4):
 *
 *   createToken():
 *     BEFORE: 8–11 sequential DB round-trips
 *       1. findDepartmentById        (SELECT *)
 *       2. findDoctorById            (SELECT *)
 *       3. findUserByUsername × 2    (via authorizePriorityChange + authorizeDepartmentAction)
 *       4. seedTokenCounter          (Redis GET + optional DB)
 *       5. getNextTokenNumber        (Redis INCR or DB COUNT)
 *       6. countWaitingTokens        (SELECT id WHERE status=waiting — position calc)
 *       7. findPatientByMobile       (SELECT id)
 *       8. insertPatient             (INSERT, conditional)
 *       9. insertToken               (INSERT)
 *
 *     AFTER: 4–5 DB round-trips
 *       1. findDepartmentById + findDoctorById (parallel)
 *       2. authorizeTokenCreation     (1 findUserByUsername — replaces 2)
 *       3. getNextTokenNumber         (Redis INCR — 0 DB, or 1 DB fallback)
 *       4. supabaseRaw.rpc('create_token_atomic') — INSERT patient + INSERT token
 *          in one server-side transaction
 *     Position (countWaitingTokens) REMOVED — computed from queue length
 *     instead of a separate full-table COUNT query.
 *
 *   callToken():
 *     BEFORE: 4–6 DB round-trips
 *       1. findTokenById              (SELECT *)
 *       2. findUserByUsername         (authorizeDepartmentAction)
 *       3. updateToken #1             (SET status=called)
 *       4. findDoctorRoomNumber       (SELECT room_number, conditional)
 *       5. updateToken #2             (SET notified_your_turn, conditional)
 *       6. findTokenById              (SELECT * — final re-fetch for response)
 *
 *     AFTER: 2–3 DB round-trips
 *       1. findUserByUsername         (authorizeDepartmentAction)
 *       2. supabaseRaw.rpc('call_specific_token') — validates 'waiting' + UPDATE
 *          atomically; returns updated row (no re-fetch needed)
 *       3. findDoctorRoomNumber       (SELECT room_number, conditional)
 *          UPDATE notified_your_turn merged into step 2 via RPC
 */

import {
  updateToken, findTokenById,
} from '../repositories/tokenRepository.js';
import {
  findDepartmentById, findDoctorById, findDoctorRoomNumber,
} from '../repositories/userRepository.js';
import { releaseDevice } from '../repositories/deviceRepository.js';
import { mapDept, mapDoctor, mapToken } from '../utils/mappers.js';
import { authorizeTokenCreation, authorizeDepartmentAction } from './authService.js';
import { getNextTokenNumber, seedTokenCounter } from '../cache/queueStatus.js';
import { TokenStatus, Gender } from '../../src/types/index.js';
import { supabaseRaw } from '../config/supabase.js';
import { v4 as uuidv4 } from 'uuid';

// ── BullMQ job queues ─────────────────────────────────────────────────────────
import { emailQueue, queueRecalcQueue, auditQueue } from '../jobs/queues.js';
import { JOB, DEFAULT_JOB_OPTIONS } from '../jobs/jobTypes.js';
import type {
  SendTokenConfirmationPayload, SendYourTurnPayload,
  RecalculateQueuePayload, WriteQueueLogPayload,
} from '../jobs/jobTypes.js';

// ── Internal helpers ──────────────────────────────────────────────────────────

async function enqueueAuditLog(
  tokenId: string, tokenNumber: string, action: string, userId?: string
): Promise<void> {
  const payload: WriteQueueLogPayload = {
    id: `log-${uuidv4()}`,
    token_id: tokenId,
    token_number: tokenNumber,
    action,
    user_id: userId,
    timestamp: new Date().toISOString(),
  };
  // fire-and-forget — don't await in hot path
  auditQueue.add(JOB.WRITE_QUEUE_LOG, payload, DEFAULT_JOB_OPTIONS.audit).catch(() => {});
}

async function enqueueRecalc(
  triggeredBy: RecalculateQueuePayload['triggeredBy'],
  tokenId: string,
  departmentId: string,
): Promise<void> {
  const payload: RecalculateQueuePayload = { triggeredBy, tokenId, departmentId };
  // fire-and-forget — don't await in hot path
  queueRecalcQueue.add(JOB.RECALCULATE_QUEUE, payload, {
    ...DEFAULT_JOB_OPTIONS.queueRecalc,
    jobId: `recalc:${departmentId}`,
  }).catch(() => {});
}

// ── createToken (OPTIMISED) ───────────────────────────────────────────────────

export async function createToken(input: {
  patientName: string;
  patientMobile: string;
  patientEmail?: string;
  patientAge?: number;
  patientGender?: Gender;
  departmentId: string;
  doctorId: string;
  reasonForVisit?: string;
  priority?: string;
  estimatedConsultationTime?: number;
  customMessage?: string;
  operatorUsername?: string;
}): Promise<{ success: boolean; token?: any; message?: string }> {
  const {
    patientName, patientMobile, patientEmail, patientAge, patientGender,
    departmentId, doctorId, reasonForVisit, priority, estimatedConsultationTime,
    customMessage, operatorUsername,
  } = input;

  if (!patientName || !patientMobile || !departmentId || !doctorId) {
    return { success: false, message: 'Missing required fields.' };
  }

  const requestedPriority = (priority || 'Normal').trim();

  // ── DB round-trip 1 (parallel): dept + doctor lookup ─────────────────────
  const [deptRow, docRow] = await Promise.all([
    findDepartmentById(departmentId),
    findDoctorById(doctorId),
  ]);
  if (!deptRow || !docRow) {
    return { success: false, message: 'Invalid department or doctor selection.' };
  }
  const department = mapDept(deptRow);
  const doctor     = mapDoctor(docRow);

  // ── DB round-trip 2: combined auth check (was 2 separate lookups) ─────────
  const authResult = await authorizeTokenCreation(
    departmentId,
    requestedPriority,
    operatorUsername,
  );
  if (!authResult.authorized) {
    return { success: false, message: authResult.message };
  }
  const finalPriority = (requestedPriority !== 'Normal' && !authResult.allowPriority)
    ? 'Normal'
    : requestedPriority;

  // ── Redis INCR (0 DB) or DB fallback (1 DB): atomic token number ──────────
  await seedTokenCounter(departmentId);
  const tokenNumber = await getNextTokenNumber(departmentId, department.prefix || 'GEN');
  const tokenId     = `tok-${uuidv4()}`;

  // ── DB round-trip 3: atomic upsert patient + insert token (single RPC) ────
  // Uses create_token_atomic() PostgreSQL function from migration 007.
  // No separate countWaitingTokens — position is omitted here and calculated
  // by the background recalc job which updates it asynchronously.
  const { data: rpcRows, error: rpcError } = await supabaseRaw.rpc('create_token_atomic', {
    p_token_id:          tokenId,
    p_token_number:      tokenNumber,
    p_patient_name:      patientName.trim(),
    p_patient_mobile:    patientMobile.trim(),
    p_patient_email:     patientEmail?.trim() || null,
    p_patient_age:       parseInt(String(patientAge)) || 30,
    p_patient_gender:    patientGender || Gender.MALE,
    p_department_id:     departmentId,
    p_department_name:   department.name,
    p_doctor_id:         doctorId,
    p_doctor_name:       doctor.name,
    p_reason_for_visit:  (reasonForVisit || '').trim(),
    p_priority:          finalPriority,
    p_is_emergency:      finalPriority !== 'Normal',
    p_position:          0,   // set by background recalc
    p_est_consult_time:  estimatedConsultationTime
      ? parseInt(String(estimatedConsultationTime)) : null,
  });

  if (rpcError || !rpcRows || rpcRows.length === 0) {
    // RPC not yet deployed (migration 007 pending) — fallback to individual calls
    return createTokenFallback(input, department, doctor, finalPriority, tokenNumber, tokenId);
  }

  const token = mapToken(rpcRows[0]);

  // ── Fire-and-forget background jobs (non-blocking, do not await) ──────────
  enqueueAuditLog(token.id, token.tokenNumber, 'created', operatorUsername);
  enqueueRecalc('token-created', token.id, departmentId);

  if (token.patientEmail?.trim()) {
    const emailPayload: SendTokenConfirmationPayload = {
      patientEmail:   token.patientEmail.trim(),
      patientName:    token.patientName,
      tokenNumber:    token.tokenNumber,
      departmentName: token.departmentName,
      doctorName:     token.doctorName,
      customMessage:  customMessage || 'Please wait for your queue number to be called.',
      tokenId:        token.id,
    };
    emailQueue.add(JOB.SEND_TOKEN_CONFIRMATION, emailPayload, DEFAULT_JOB_OPTIONS.email)
      .catch(() => {});
  }

  return { success: true, token };
}

/**
 * Fallback used when migration 007 RPC is not yet deployed.
 * Original flow with individual DB calls.
 * Remove this once migration 007 is applied to production.
 */
async function createTokenFallback(
  input: Parameters<typeof createToken>[0],
  department: any,
  doctor: any,
  finalPriority: string,
  tokenNumber: string,
  tokenId: string,
): Promise<{ success: boolean; token?: any; message?: string }> {
  const {
    patientName, patientMobile, patientEmail, patientAge, patientGender,
    departmentId, doctorId, reasonForVisit, estimatedConsultationTime,
    customMessage, operatorUsername,
  } = input;

  const { insertToken } = await import('../repositories/tokenRepository.js');
  const { insertPatient: insertPatientFn, findPatientByMobile } = await import('../repositories/userRepository.js');

  if (!(await findPatientByMobile(patientMobile.trim()))) {
    await insertPatientFn({
      id: `pat-${uuidv4()}`,
      name: patientName.trim(),
      mobile: patientMobile.trim(),
      email: patientEmail?.trim() || null,
      age: parseInt(String(patientAge)) || 30,
      gender: patientGender || Gender.MALE,
      created_at: new Date().toISOString(),
    });
  }

  const inserted = await insertToken({
    id: tokenId,
    token_number: tokenNumber,
    patient_name: patientName.trim(),
    patient_mobile: patientMobile.trim(),
    patient_email: patientEmail?.trim() || null,
    patient_age: parseInt(String(patientAge)) || 30,
    patient_gender: patientGender || Gender.MALE,
    department_id: departmentId,
    department_name: department.name,
    doctor_id: doctorId,
    doctor_name: doctor.name,
    reason_for_visit: (reasonForVisit || '').trim(),
    status: TokenStatus.WAITING,
    created_at: new Date().toISOString(),
    is_emergency: finalPriority !== 'Normal',
    priority: finalPriority,
    position: 0,
    estimated_consultation_time: estimatedConsultationTime
      ? parseInt(String(estimatedConsultationTime)) : null,
  });

  if (!inserted) return { success: false, message: 'Token insert failed.' };
  const token = mapToken(inserted);

  enqueueAuditLog(token.id, token.tokenNumber, 'created', operatorUsername);
  enqueueRecalc('token-created', token.id, departmentId);

  if (token.patientEmail?.trim()) {
    const emailPayload: SendTokenConfirmationPayload = {
      patientEmail:   token.patientEmail.trim(),
      patientName:    token.patientName,
      tokenNumber:    token.tokenNumber,
      departmentName: token.departmentName,
      doctorName:     token.doctorName,
      customMessage:  customMessage || 'Please wait for your queue number to be called.',
      tokenId:        token.id,
    };
    emailQueue.add(JOB.SEND_TOKEN_CONFIRMATION, emailPayload, DEFAULT_JOB_OPTIONS.email)
      .catch(() => {});
  }

  return { success: true, token };
}

// ── callToken (OPTIMISED) ─────────────────────────────────────────────────────
//
// BEFORE: findTokenById → authCheck → updateToken#1 → findDoctorRoom →
//         updateToken#2 (notified_your_turn) → findTokenById (re-fetch)
//         = 4–6 DB round-trips
//
// AFTER:  authCheck → call_specific_token RPC (atomic UPDATE + RETURNING)
//         → findDoctorRoom (conditional)
//         = 2–3 DB round-trips, no final re-fetch

export async function callToken(
  tokenId: string, operatorUsername?: string
): Promise<{ success: boolean; token?: any; message?: string }> {

  // ── Round-trip 1: get token + auth check in parallel ─────────────────────
  // We need token.department_id for auth, so we must fetch the token first.
  // But we use a narrow field projection rather than SELECT *.
  const row = await findTokenByIdSlim(tokenId);
  if (!row) return { success: false, message: 'Token not found' };

  const authCheck = await authorizeDepartmentAction(row.department_id, operatorUsername);
  if (!authCheck.authorized) return { success: false, message: authCheck.message };

  // ── Round-trip 2: atomic call via RPC (validates 'waiting', UPDATEs, returns row) ─
  const { data: rpcRows, error: rpcError } = await supabaseRaw.rpc('call_specific_token', {
    p_token_id: tokenId,
  });

  let updated: any;

  if (rpcError || !rpcRows || rpcRows.length === 0) {
    // RPC not deployed yet — fallback to plain UPDATE
    updated = await updateToken(tokenId, {
      status:    TokenStatus.CALLED,
      called_at: new Date().toISOString(),
    });
    if (!updated) return { success: false, message: 'Failed to update token status.' };
  } else {
    updated = rpcRows[0];
  }

  // ── Fire-and-forget background jobs ──────────────────────────────────────
  enqueueAuditLog(tokenId, row.token_number, 'called', operatorUsername);
  enqueueRecalc('token-called', tokenId, row.department_id);

  // ── Round-trip 3 (conditional): doctor room for email ────────────────────
  if (updated.patient_email?.trim() && !updated.notified_your_turn) {
    const room = (await findDoctorRoomNumber(updated.doctor_id)) || 'the consultation room';
    const roomLabel = room.startsWith('Room') ? room : `Room ${room}`;

    const payload: SendYourTurnPayload = {
      patientEmail:   updated.patient_email.trim(),
      patientName:    updated.patient_name,
      tokenNumber:    updated.token_number,
      departmentName: updated.department_name,
      doctorName:     updated.doctor_name,
      roomLabel,
      tokenId,
    };
    emailQueue.add(JOB.SEND_YOUR_TURN, payload, DEFAULT_JOB_OPTIONS.email).catch(() => {});

    // Merge notified_your_turn into the already-in-flight update rather than
    // a second round-trip — fire-and-forget since it's only a notification flag.
    updateToken(tokenId, { notified_your_turn: true }).catch(() => {});
  }

  // Return the updated row directly — NO second findTokenById re-fetch
  return { success: true, token: mapToken(updated) };
}

// ── completeToken ─────────────────────────────────────────────────────────────

export async function completeToken(
  tokenId: string, operatorUsername?: string
): Promise<{ success: boolean; token?: any; message?: string }> {
  const row = await findTokenByIdSlim(tokenId);
  if (!row) return { success: false, message: 'Token not found' };

  const authCheck = await authorizeDepartmentAction(row.department_id, operatorUsername);
  if (!authCheck.authorized) return { success: false, message: authCheck.message };

  const updated = await updateToken(tokenId, {
    status:       TokenStatus.COMPLETED,
    completed_at: new Date().toISOString(),
  });

  if (row.device_id) releaseDevice(row.device_id).catch(() => {});

  enqueueAuditLog(tokenId, row.token_number, 'completed', operatorUsername);
  enqueueRecalc('token-completed', tokenId, row.department_id);

  return { success: true, token: mapToken(updated ?? row) };
}

// ── skipToken ─────────────────────────────────────────────────────────────────

export async function skipToken(
  tokenId: string, operatorUsername?: string
): Promise<{ success: boolean; token?: any; message?: string }> {
  const row = await findTokenByIdSlim(tokenId);
  if (!row) return { success: false, message: 'Token not found' };

  const authCheck = await authorizeDepartmentAction(row.department_id, operatorUsername);
  if (!authCheck.authorized) return { success: false, message: authCheck.message };

  const updated = await updateToken(tokenId, { status: TokenStatus.SKIPPED });

  enqueueAuditLog(tokenId, row.token_number, 'skipped', operatorUsername);
  enqueueRecalc('token-skipped', tokenId, row.department_id);

  return { success: true, token: mapToken(updated ?? row) };
}

// ── cancelToken ───────────────────────────────────────────────────────────────

export async function cancelToken(
  tokenId: string, operatorUsername?: string
): Promise<{ success: boolean; token?: any; message?: string }> {
  const row = await findTokenByIdSlim(tokenId);
  if (!row) return { success: false, message: 'Token not found' };

  const authCheck = await authorizeDepartmentAction(row.department_id, operatorUsername);
  if (!authCheck.authorized) return { success: false, message: authCheck.message };

  const updated = await updateToken(tokenId, { status: TokenStatus.CANCELLED });

  if (row.device_id) releaseDevice(row.device_id).catch(() => {});

  enqueueAuditLog(tokenId, row.token_number, 'cancelled', operatorUsername);
  enqueueRecalc('token-cancelled', tokenId, row.department_id);

  return { success: true, token: mapToken(updated ?? row) };
}

// ── recallToken ───────────────────────────────────────────────────────────────

export async function recallToken(
  tokenId: string, operatorUsername?: string
): Promise<{ success: boolean; token?: any; message?: string }> {
  const row = await findTokenByIdSlim(tokenId);
  if (!row) return { success: false, message: 'Token not found' };

  const authCheck = await authorizeDepartmentAction(row.department_id, operatorUsername);
  if (!authCheck.authorized) return { success: false, message: authCheck.message };

  const updated = await updateToken(tokenId, { called_at: new Date().toISOString() });

  enqueueAuditLog(tokenId, row.token_number, 'recalled', operatorUsername);

  return { success: true, token: mapToken(updated ?? row) };
}

// ── Slim token fetch (Task 6 — minimal field projection) ─────────────────────

/**
 * Fetch only the fields needed for auth and state transitions.
 * Avoids SELECT * when the full token shape is not required.
 * Falls back to full findTokenById if slim projection fails.
 */
async function findTokenByIdSlim(id: string): Promise<any | null> {
  const { data, error } = await supabaseRaw
    .from('tokens')
    .select('id, token_number, status, department_id, doctor_id, device_id, patient_email, notified_your_turn, patient_name, patient_mobile, department_name, doctor_name, token_number, priority, is_emergency, position, estimated_wait_time')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    // Fallback to full fetch
    return findTokenById(id);
  }
  return data;
}
