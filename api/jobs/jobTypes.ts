/**
 * api/jobs/jobTypes.ts
 *
 * Single source of truth for every BullMQ job name and its payload type.
 * Import job names as constants so typos are caught at compile time.
 */

// ── Queue names ───────────────────────────────────────────────────────────────

export const QUEUE = {
  EMAIL:        'iq:email',
  NOTIFICATION: 'iq:notification',
  QUEUE_RECALC: 'iq:queue-recalc',
  AUDIT:        'iq:audit',
} as const;

export type QueueName = typeof QUEUE[keyof typeof QUEUE];

// ── Job names ─────────────────────────────────────────────────────────────────

export const JOB = {
  // Email jobs
  SEND_TOKEN_CONFIRMATION:   'send-token-confirmation',
  SEND_YOUR_TURN:            'send-your-turn',
  SEND_TWO_AHEAD:            'send-two-ahead',

  // Notification jobs (WhatsApp / SMS stub)
  NOTIFY_WELCOME:            'notify-welcome',
  NOTIFY_UPDATE:             'notify-update',
  NOTIFY_TWO_REMAINING:      'notify-two-remaining',
  NOTIFY_YOUR_TURN:          'notify-your-turn',

  // Queue processing
  RECALCULATE_QUEUE:         'recalculate-queue',

  // Audit
  WRITE_QUEUE_LOG:           'write-queue-log',
  WRITE_NOTIFICATION_LOG:    'write-notification-log',
} as const;

export type JobName = typeof JOB[keyof typeof JOB];

// ── Payload interfaces ────────────────────────────────────────────────────────

// -- Email ---------------------------------------------------------------

export interface SendTokenConfirmationPayload {
  patientEmail:    string;
  patientName:     string;
  tokenNumber:     string;
  departmentName:  string;
  doctorName:      string;
  customMessage:   string;
  tokenId:         string;
  expectedConsultTime?: string;
}

export interface SendYourTurnPayload {
  patientEmail:   string;
  patientName:    string;
  tokenNumber:    string;
  departmentName: string;
  doctorName:     string;
  roomLabel:      string;   // "Room G-12" or "the consultation room"
  tokenId:        string;
}

export interface SendTwoAheadPayload {
  patientEmail:      string;
  patientName:       string;
  tokenNumber:       string;
  departmentName:    string;
  doctorName:        string;
  tokenId:           string;
  estimatedWaitMins: number;
  expectedConsultTime?: string;
}

// -- Notification (WhatsApp / SMS) ----------------------------------------

export interface NotifyWelcomePayload {
  tokenId:         string;
  tokenNumber:     string;
  patientName:     string;
  patientMobile:   string;
  departmentName:  string;
  patientsAhead:   number;
  estimatedWaitMins: number;
  expectedTime:    string;
  trackerLink:     string;
  hospitalName:    string;
}

export interface NotifyUpdatePayload {
  tokenId:            string;
  tokenNumber:        string;
  patientName:        string;
  patientMobile:      string;
  estimatedWaitMins:  number;
  expectedTime:       string;
  trackerLink:        string;
}

export interface NotifyTwoRemainingPayload {
  tokenId:       string;
  tokenNumber:   string;
  patientName:   string;
  patientMobile: string;
}

export interface NotifyYourTurnPayload {
  tokenId:       string;
  tokenNumber:   string;
  patientName:   string;
  patientMobile: string;
  roomLabel:     string;
}

// -- Queue recalculation ---------------------------------------------------

export interface RecalculateQueuePayload {
  /** Trigger source for audit trail */
  triggeredBy:  'token-created' | 'token-called' | 'token-completed' | 'token-skipped' | 'token-cancelled';
  tokenId:      string;
  departmentId: string;
}

// -- Audit log ------------------------------------------------------------

export interface WriteQueueLogPayload {
  id:          string;
  token_id:    string;
  token_number: string;
  action:      string;
  user_id?:    string;
  timestamp:   string;
}

export interface WriteNotificationLogPayload {
  id?:             string;
  token_id:        string;
  token_number?:   string;
  patient_name?:   string;
  patient_mobile?: string;
  message:         string;
  type:            string;
  status?:         string;
  timestamp:       string;
}

// ── Default retry options per queue ──────────────────────────────────────────

export const DEFAULT_JOB_OPTIONS = {
  /** Email: 3 attempts, exponential back-off starting at 5 s */
  email: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 5_000 },
    removeOnComplete: { count: 200 },
    removeOnFail:     { count: 500 },
  },

  /** Notification: 2 attempts (WhatsApp is a stub so 1 real attempt + 1 safety) */
  notification: {
    attempts: 2,
    backoff: { type: 'fixed' as const, delay: 3_000 },
    removeOnComplete: { count: 500 },
    removeOnFail:     { count: 1_000 },
  },

  /** Queue recalc: 3 attempts, deduplicated via jobId */
  queueRecalc: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 2_000 },
    removeOnComplete: { count: 50 },
    removeOnFail:     { count: 100 },
    // Callers should pass jobId: `recalc:${departmentId}` to deduplicate
  },

  /** Audit: fire-and-forget, 1 attempt, never retried */
  audit: {
    attempts: 1,
    removeOnComplete: { count: 100 },
    removeOnFail:     { count: 200 },
  },
} as const;
