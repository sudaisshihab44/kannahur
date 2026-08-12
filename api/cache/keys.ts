/**
 * api/cache/keys.ts
 *
 * Single source of truth for every Redis / in-memory cache key used in
 * the application.  All key factories live here so typos and collisions
 * are caught at compile time rather than at runtime.
 *
 * Naming convention:
 *   iq:<domain>:<sub-domain>:<id?>
 *
 * "iq" namespace prefix prevents collisions when InclusyQ shares a
 * Redis instance with other services.
 */

export const CacheKeys = {

  // ── Static / slow-changing data ──────────────────────────────────────────

  /** All departments (rarely changes) */
  departments: () => 'iq:static:departments',

  /** All doctors (changes on admin edits) */
  doctors: () => 'iq:static:doctors',

  /** All consultation rooms */
  rooms: () => 'iq:static:rooms',

  /** All users / staff */
  users: () => 'iq:static:users',

  // ── Hospital settings ─────────────────────────────────────────────────────

  /** Full settings row (config + hospital_info + announcements) */
  settings: () => 'iq:settings:full',

  /** Only the config sub-document (queue config, wait times, etc.) */
  settingsConfig: () => 'iq:settings:config',

  /** Hospital info sub-document (name, logo, address) */
  hospitalInfo: () => 'iq:settings:hospital_info',

  /** Announcements array */
  announcements: () => 'iq:settings:announcements',

  // ── Queue / token state ───────────────────────────────────────────────────

  /** Today's snapshot of all tokens */
  todayTokens: () => 'iq:queue:tokens:today',

  /** Waiting queue for a department, or all departments */
  waitingQueue: (deptId = 'all', doctorId = 'all') =>
    `iq:queue:waiting:${deptId}:${doctorId}`,

  /** The full /api/data composite payload */
  apiDataFull: () => 'iq:api:data:full',

  /** Atomic daily token counter per department */
  tokenCounter: (deptId: string, dateStr: string) =>
    `iq:counter:tokens:${deptId}:${dateStr}`,

  // ── Dashboard stats ───────────────────────────────────────────────────────

  /** Pre-computed dashboard metrics */
  dashboardStats: () => 'iq:dashboard:stats',

  /** Per-department queue summary (waiting count, called, etc.) */
  deptQueueSummary: (deptId: string) => `iq:dashboard:dept:${deptId}`,

  // ── Session store ─────────────────────────────────────────────────────────

  /** Active session record (keyed by session/jti token) */
  session: (sessionId: string) => `iq:session:${sessionId}`,

  /** Set of active session IDs for a user (for "list sessions") */
  userSessionSet: (userId: string) => `iq:session:user:${userId}:sessions`,

  /** Refresh token validity flag (key exists → valid; deleted → revoked) */
  refreshToken: (tokenId: string) => `iq:auth:refresh:${tokenId}`,

  /** Rate-limit counter for login attempts per IP */
  loginAttempts: (ip: string) => `iq:ratelimit:login:${ip}`,

  /** Account lockout flag */
  accountLock: (username: string) => `iq:auth:lock:${username}`,

  // ── Pattern prefixes (for bulk invalidation) ─────────────────────────────

  PREFIX: {
    static:      'iq:static:',
    settings:    'iq:settings:',
    queue:       'iq:queue:',
    dashboard:   'iq:dashboard:',
    session:     'iq:session:',
    auth:        'iq:auth:',
    ratelimit:   'iq:ratelimit:',
    all:         'iq:',
  },

} as const;

// ── TTL constants (seconds) ───────────────────────────────────────────────────

export const RedisTTL = {
  /** Static data changes only on admin edits */
  STATIC:        300,   // 5 minutes

  /** Hospital settings — config/info change infrequently */
  SETTINGS:       60,   // 1 minute

  /** Announcements change more frequently */
  ANNOUNCEMENTS:  30,   // 30 seconds

  /** Queue state — changes on every token action */
  QUEUE:           5,   // 5 seconds

  /** Full /api/data composite */
  API_DATA:        5,   // 5 seconds

  /** Dashboard stats */
  DASHBOARD:      10,   // 10 seconds

  /** Session records — match JWT refresh token expiry (7 days) */
  SESSION:    7 * 24 * 3600,   // 7 days

  /** Refresh token validity flag */
  REFRESH_TOKEN: 7 * 24 * 3600,

  /** Daily token counter — expire at midnight (max 86400 s) */
  TOKEN_COUNTER: 86_400,

  /** Login rate-limit window */
  LOGIN_WINDOW:   900,  // 15 minutes
} as const;
