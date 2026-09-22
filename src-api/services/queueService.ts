/**
 * api/services/queueService.ts
 *
 * Business logic for queue management.
 *
 * Key changes from previous version:
 *   - sendWhatsApp() replaced by BullMQ notification jobs (non-blocking)
 *   - insertNotificationLog() replaced by BullMQ audit jobs (non-blocking)
 *   - Cache invalidation expanded to include dashboard cache
 *   - recalculateQueueWaitTimes() still executes synchronously when called
 *     by the queueRecalcWorker — the worker itself is what's async from
 *     the HTTP request's perspective
 */
import { findWaitingTokens, updateToken, findActiveTokens } from '../repositories/tokenRepository.js';
import { batchUpdateTokens } from '../repositories/optimizedTokenRepository.js';
import { getSettings, insertQueueLog } from '../repositories/settingsRepository.js';
import { invalidateDataCache } from '../controllers/dataController.js';
import { invalidateQueueCache } from '../cache/queueStatus.js';
import { invalidateDashboardCache } from '../cache/dashboardCache.js';
import { getCachedSettingsConfig } from '../cache/hospitalSettings.js';
import { TokenStatus } from '../../src/types/index.js';
import { mapToken } from '../utils/mappers.js';
import { v4 as uuidv4 } from 'uuid';

// BullMQ queues
import { notificationQueue, auditQueue } from '../jobs/queues.js';
import { JOB, DEFAULT_JOB_OPTIONS } from '../jobs/jobTypes.js';
import type {
  NotifyWelcomePayload,
  NotifyUpdatePayload,
  NotifyTwoRemainingPayload,
  NotifyYourTurnPayload,
  WriteNotificationLogPayload,
} from '../jobs/jobTypes.js';

// ── Priority ─────────────────────────────────────────────────────────────────

export function getPriorityWeight(priority: string | undefined): number {
  switch (priority) {
    case 'VIP':                    return 4;
    case 'Person with Disability': return 3;
    case 'Pregnant Woman':         return 2;
    case 'Senior Citizen':         return 1;
    default:                       return 0;
  }
}

// ── Queue logs ────────────────────────────────────────────────────────────────

export async function addQueueLog(
  tokenId: string, tokenNumber: string, action: string, userId?: string
): Promise<void> {
  await insertQueueLog({
    id:           `log-${uuidv4()}`,
    token_id:     tokenId,
    token_number: tokenNumber,
    action,
    user_id:      userId,
    timestamp:    new Date().toISOString(),
  });
}

export async function addAuditLog(action: string, detailText: string, userId?: string): Promise<void> {
  await insertQueueLog({
    id:           `log-${uuidv4()}`,
    token_id:     '',
    token_number: detailText,
    action,
    user_id:      userId,
    timestamp:    new Date().toISOString(),
  });
}

// ── Cumulative wait-time calculation ──────────────────────────────────────────

export async function computeWaitingQueue(departmentId?: string, doctorId?: string) {
  const waitingTokens = await findWaitingTokens(departmentId, doctorId);
  const config     = await getCachedSettingsConfig();
  const defaultAvg = config?.defaultWaitingTime || 10;
  const now        = new Date();
  let cumulative   = 0;

  return waitingTokens.map((token: any, index: number) => {
    const estimatedWaitMinutes = cumulative;
    const expectedConsultTime  = new Date(now.getTime() + cumulative * 60_000);
    const thisDuration         =
      token.estimated_consultation_time ||
      token.consultation_duration_minutes ||
      defaultAvg;
    cumulative += thisDuration;

    return {
      ...token,
      patientsAhead: index,
      estimatedWaitMinutes,
      expectedConsultTime:          expectedConsultTime.toISOString(),
      expectedConsultDate:          expectedConsultTime.toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
      }),
      expectedConsultTimeFormatted: expectedConsultTime.toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: true,
      }),
      registeredDate: new Date(token.created_at).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
      }),
    };
  });
}

// ── Full queue recalculation ───────────────────────────────────────────────────
//
// Called by queueRecalcWorker (background) — NOT directly from HTTP handlers.
// WhatsApp notifications are now enqueued as BullMQ jobs instead of being
// awaited inline, so this function returns much faster.

export async function recalculateQueueWaitTimes(): Promise<void> {
  const [allTokens, settings] = await Promise.all([
    findActiveTokens(),
    getSettings(),
  ]);

  const { supabase } = await import('../config/supabase.js');
  const { data: doctorsData } = await supabase.from('doctors').select('*');
  if (!doctorsData || !allTokens) return;

  const enableUpdates = settings?.config?.enableWhatsAppUpdates !== false;
  const threshold     = settings?.config?.minWaitTimeNotificationThreshold ?? 5;
  const hospitalName  = settings?.hospital_info?.name || 'St. Jude Memorial Hospital';
  const appUrl        = process.env.APP_URL || 'http://localhost:3000';

  const tokenUpdates: Array<{ id: string; updates: Record<string, any> }> = [];

  for (const doc of doctorsData) {
    const docTokens   = allTokens.filter((t: any) => t.doctor_id === doc.id);
    const calledToken = docTokens.find((t: any) => t.status === TokenStatus.CALLED);

    let currentCalledRemaining = 0;

    if (calledToken) {
      const duration    = calledToken.estimated_consultation_time || doc.avg_consultation_time || 15;
      const calledAt    = calledToken.called_at ? new Date(calledToken.called_at) : new Date();
      const elapsedMins = Math.floor((Date.now() - calledAt.getTime()) / 60_000);
      currentCalledRemaining = Math.max(0, duration - elapsedMins);

      // "your_turn" notification (via BullMQ — non-blocking)
      if (enableUpdates && !calledToken.notified_your_turn && calledToken.patient_mobile) {
        const room = doc.room_number || 'G-12';
        const yourTurnPayload: NotifyYourTurnPayload = {
          tokenId:       calledToken.id,
          tokenNumber:   calledToken.token_number,
          patientName:   calledToken.patient_name,
          patientMobile: calledToken.patient_mobile,
          roomLabel:     `Room ${room}`,
        };
        await notificationQueue.add(
          JOB.NOTIFY_YOUR_TURN,
          yourTurnPayload,
          DEFAULT_JOB_OPTIONS.notification
        );
        tokenUpdates.push({ id: calledToken.id, updates: { notified_your_turn: true } });
      }
    }

    const waitingTokens = docTokens
      .filter((t: any) => t.status === TokenStatus.WAITING)
      .sort((a: any, b: any) => {
        const diff = getPriorityWeight(b.priority) - getPriorityWeight(a.priority);
        return diff !== 0 ? diff
          : new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

    let accumulated = currentCalledRemaining;

    for (let i = 0; i < waitingTokens.length; i++) {
      const token         = waitingTokens[i];
      const estimatedWait = accumulated;
      const expectedStart = new Date(Date.now() + accumulated * 60_000);
      const trackerLink   = `${appUrl}/?tracker=${token.token_number}`;

      const updates: Record<string, any> = {
        estimated_wait_time:              estimatedWait,
        expected_consultation_start_time: expectedStart.toISOString(),
      };

      if (enableUpdates && token.patient_mobile) {
        // "welcome" notification — first time this token is seen
        if (token.last_notified_wait_time == null) {
          const welcomePayload: NotifyWelcomePayload = {
            tokenId:          token.id,
            tokenNumber:      token.token_number,
            patientName:      token.patient_name,
            patientMobile:    token.patient_mobile,
            departmentName:   token.department_name,
            patientsAhead:    i,
            estimatedWaitMins: estimatedWait,
            expectedTime:     expectedStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            trackerLink,
            hospitalName,
          };
          await notificationQueue.add(
            JOB.NOTIFY_WELCOME,
            welcomePayload,
            DEFAULT_JOB_OPTIONS.notification
          );
          updates.last_notified_wait_time = estimatedWait;

        } else {
          // "update" notification — only when wait time changed significantly
          const diff = Math.abs(estimatedWait - token.last_notified_wait_time);
          if (diff >= threshold) {
            const updatePayload: NotifyUpdatePayload = {
              tokenId:           token.id,
              tokenNumber:       token.token_number,
              patientName:       token.patient_name,
              patientMobile:     token.patient_mobile,
              estimatedWaitMins: estimatedWait,
              expectedTime:      expectedStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              trackerLink,
            };
            await notificationQueue.add(
              JOB.NOTIFY_UPDATE,
              updatePayload,
              DEFAULT_JOB_OPTIONS.notification
            );
            updates.last_notified_wait_time = estimatedWait;
          }
        }

        // "two_remaining" notification — patient is position 2
        if (i === 2 && !token.notified_two_remaining) {
          const twoPayload: NotifyTwoRemainingPayload = {
            tokenId:       token.id,
            tokenNumber:   token.token_number,
            patientName:   token.patient_name,
            patientMobile: token.patient_mobile,
          };
          await notificationQueue.add(
            JOB.NOTIFY_TWO_REMAINING,
            twoPayload,
            DEFAULT_JOB_OPTIONS.notification
          );
          updates.notified_two_remaining = true;
        }
      }

      tokenUpdates.push({ id: token.id, updates });
      accumulated += token.estimated_consultation_time || doc.avg_consultation_time || 15;
    }
  }

  // Single batch write instead of N sequential UPDATEs
  if (tokenUpdates.length > 0) {
    try {
      await batchUpdateTokens(tokenUpdates);
    } catch (batchErr) {
      console.warn('[queueService] batchUpdateTokens failed, falling back to sequential:', batchErr);
      for (const { id, updates } of tokenUpdates) {
        await updateToken(id, updates);
      }
    }
  }

  // Invalidate all caches
  await Promise.all([
    invalidateDataCache(),
    invalidateQueueCache(),
    invalidateDashboardCache(),
  ]);
}

// ── "2 patients ahead" email trigger ──────────────────────────────────────────
//
// Called by queueRecalcWorker after recalculateQueueWaitTimes().
// The sendEmailFn parameter is injected so the worker can pass
// the real sendEmail from emailService without a circular import.

export async function notifyTwoAheadPatients(
  departmentId: string,
  sendEmailFn: (
    email: string, name: string, tokenNum: string,
    deptName: string, docName: string, msg: string,
    tokenId: string, expectedTime?: string
  ) => Promise<void>
): Promise<void> {
  const queue = await computeWaitingQueue(departmentId);
  if (!queue || queue.length === 0) return;

  // Batch-update positions and wait times
  const positionUpdates = queue.map((t: any) => ({
    id:      t.id,
    updates: {
      position:                         t.patientsAhead + 1,
      estimated_wait_time:              t.estimatedWaitMinutes,
      expected_consultation_start_time: t.expectedConsultTime,
    },
  }));

  try {
    await batchUpdateTokens(positionUpdates);
  } catch {
    for (const { id, updates } of positionUpdates) {
      await updateToken(id, updates);
    }
  }

  const twoAhead = queue.find((t: any) => t.patientsAhead === 2 && !t.notified_two_ahead);
  if (!twoAhead) return;

  const msg =
    `Only 2 patients ahead of you. ` +
    `Please move near ${twoAhead.department_name}. ` +
    `Est. wait: ~${twoAhead.estimatedWaitMinutes} mins.`;

  if (twoAhead.patient_email) {
    await sendEmailFn(
      twoAhead.patient_email,
      twoAhead.patient_name,
      twoAhead.token_number,
      twoAhead.department_name,
      twoAhead.doctor_name,
      msg,
      twoAhead.id,
      twoAhead.expectedConsultTime
    );
  }

  await updateToken(twoAhead.id, { notified_two_ahead: true });
}
