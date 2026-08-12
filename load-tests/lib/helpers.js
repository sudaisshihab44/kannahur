/**
 * load-tests/lib/helpers.js
 *
 * Shared utilities for all k6 load test scenarios.
 * Import with: import { ... } from '../lib/helpers.js';
 */
import http from 'k6/http';
import { check, fail } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { sleep } from 'k6';

// ── Base URL ──────────────────────────────────────────────────────────────────
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// ── Custom metrics ────────────────────────────────────────────────────────────
export const tokenCreationTime  = new Trend('token_creation_time',  true);
export const tokenCallTime      = new Trend('token_call_time',      true);
export const queuePollTime      = new Trend('queue_poll_time',      true);
export const authTime           = new Trend('auth_time',            true);
export const dataFetchTime      = new Trend('data_fetch_time',      true);
export const cacheHits          = new Counter('cache_hits');
export const cacheMisses        = new Counter('cache_misses');
export const errorRate          = new Rate('error_rate');
export const slowRequests       = new Counter('slow_requests');

const SLOW_THRESHOLD_MS = parseInt(__ENV.SLOW_THRESHOLD_MS || '500', 10);

// ── Headers ───────────────────────────────────────────────────────────────────
export function jsonHeaders(token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Login as admin or receptionist and return JWT access token.
 * Call once in setup() and pass the token through __ENV or VU state.
 */
export function login(username, password, portal = 'admin') {
  const start = Date.now();
  const res = http.post(
    `${BASE_URL}/api/login`,
    JSON.stringify({ username, password, portal }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'auth/login' } }
  );
  authTime.add(Date.now() - start);

  const ok = check(res, {
    'login: status 200':       (r) => r.status === 200,
    'login: has accessToken':  (r) => r.json('accessToken') !== null,
    'login: success true':     (r) => r.json('success') === true,
  });

  if (!ok) {
    errorRate.add(1);
    return null;
  }
  errorRate.add(0);
  return res.json('accessToken');
}

/**
 * Refresh an expired access token using the refresh token cookie.
 */
export function refreshToken() {
  const res = http.post(
    `${BASE_URL}/api/auth/refresh`,
    null,
    { tags: { name: 'auth/refresh' } }
  );
  if (res.status !== 200) return null;
  return res.json('accessToken');
}

// ── Core API calls ────────────────────────────────────────────────────────────

/** GET /api/data — full state snapshot (most expensive endpoint) */
export function fetchData(token) {
  const start = Date.now();
  const res = http.get(`${BASE_URL}/api/data`, {
    headers: jsonHeaders(token),
    tags: { name: 'api/data' },
  });
  const dur = Date.now() - start;
  dataFetchTime.add(dur);
  if (dur > SLOW_THRESHOLD_MS) slowRequests.add(1);

  const cached = res.headers['X-Cache'] || res.headers['x-cache'];
  if (cached === 'HIT') cacheHits.add(1);
  else cacheMisses.add(1);

  check(res, {
    'data: status 200 or 304': (r) => r.status === 200 || r.status === 304,
  }) ? errorRate.add(0) : errorRate.add(1);

  return res;
}

/** GET /api/queue — waiting queue (high-frequency TV/patient polling) */
export function fetchQueue(token, deptId) {
  const start = Date.now();
  const url = deptId
    ? `${BASE_URL}/api/queue?departmentId=${deptId}`
    : `${BASE_URL}/api/queue`;
  const res = http.get(url, {
    headers: jsonHeaders(token),
    tags: { name: 'api/queue' },
  });
  const dur = Date.now() - start;
  queuePollTime.add(dur);
  if (dur > SLOW_THRESHOLD_MS) slowRequests.add(1);

  check(res, { 'queue: status 200': (r) => r.status === 200 })
    ? errorRate.add(0) : errorRate.add(1);

  return res;
}

/** POST /api/tokens — create a patient token */
export function createToken(token, payload) {
  const defaults = {
    patientName:    `Test Patient ${Math.floor(Math.random() * 99999)}`,
    patientMobile:  `+91${9000000000 + Math.floor(Math.random() * 999999999)}`,
    departmentId:   __ENV.DEPT_ID || 'dep-1',
    doctorId:       __ENV.DOCTOR_ID || 'doc-1',
    patientAge:     30,
    patientGender:  'male',
    priority:       'Normal',
  };
  const body = Object.assign({}, defaults, payload || {});

  const start = Date.now();
  const res = http.post(`${BASE_URL}/api/tokens`, JSON.stringify(body), {
    headers: jsonHeaders(token),
    tags: { name: 'api/tokens/create' },
  });
  const dur = Date.now() - start;
  tokenCreationTime.add(dur);
  if (dur > SLOW_THRESHOLD_MS) slowRequests.add(1);

  check(res, {
    'create token: status 200':   (r) => r.status === 200,
    'create token: has tokenId':  (r) => r.json('token.id') !== null,
  }) ? errorRate.add(0) : errorRate.add(1);

  return res;
}

/** POST /api/tokens/:id/call — call a patient token */
export function callToken(token, tokenId) {
  const start = Date.now();
  const res = http.post(
    `${BASE_URL}/api/tokens/${tokenId}/call`,
    null,
    { headers: jsonHeaders(token), tags: { name: 'api/tokens/call' } }
  );
  const dur = Date.now() - start;
  tokenCallTime.add(dur);

  check(res, { 'call token: status 200': (r) => r.status === 200 })
    ? errorRate.add(0) : errorRate.add(1);

  return res;
}

/** POST /api/tokens/:id/complete */
export function completeToken(token, tokenId) {
  return http.post(
    `${BASE_URL}/api/tokens/${tokenId}/complete`,
    null,
    { headers: jsonHeaders(token), tags: { name: 'api/tokens/complete' } }
  );
}

/** POST /api/tokens/:id/skip */
export function skipToken(token, tokenId) {
  return http.post(
    `${BASE_URL}/api/tokens/${tokenId}/skip`,
    null,
    { headers: jsonHeaders(token), tags: { name: 'api/tokens/skip' } }
  );
}

/** GET /api/track/:tokenNumber — public patient tracker */
export function trackToken(tokenNumber) {
  return http.get(
    `${BASE_URL}/api/track/${tokenNumber}`,
    { tags: { name: 'api/track' } }
  );
}

/** GET /api/health — liveness probe */
export function checkHealth() {
  const res = http.get(`${BASE_URL}/api/live`, { tags: { name: 'api/live' } });
  check(res, {
    'live: status 200': (r) => r.status === 200,
    'live: alive true': (r) => r.json('alive') === true,
  });
  return res;
}

// ── Think times (realistic user pacing) ───────────────────────────────────────

/** Receptionist pacing — fast actions, short pauses */
export function receptionistThink()  { sleep(0.5 + Math.random() * 1.5); }

/** TV display pacing — 5-second polling loop */
export function tvDisplayThink()     { sleep(4.5 + Math.random() * 1);   }

/** Patient tracker pacing — 5-second polling */
export function patientTrackerThink(){ sleep(4 + Math.random() * 2);     }

/** Admin pacing — reading / configuration, longer pauses */
export function adminThink()         { sleep(2 + Math.random() * 4);     }

// ── Scenario helpers ──────────────────────────────────────────────────────────

/**
 * Typical receptionist workflow:
 *   1. Fetch /api/data snapshot
 *   2. Create a token
 *   3. Poll queue
 *   4. Call next token
 *   5. Complete consultation
 */
export function receptionistWorkflow(token) {
  fetchData(token);
  receptionistThink();

  const createRes = createToken(token);
  const newTokenId = createRes.status === 200 ? createRes.json('token.id') : null;
  receptionistThink();

  fetchQueue(token);
  receptionistThink();

  if (newTokenId) {
    callToken(token, newTokenId);
    receptionistThink();
    completeToken(token, newTokenId);
  }
}

/**
 * TV display workflow:
 *   Poll /api/queue every 5 seconds continuously.
 */
export function tvWorkflow() {
  fetchQueue(null);
  tvDisplayThink();
}

/**
 * Patient tracker workflow:
 *   Poll /api/track/:id every 5 seconds.
 */
export function patientTrackerWorkflow(tokenNumber) {
  trackToken(tokenNumber);
  patientTrackerThink();
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Random item from an array */
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/** Generate a random Indian mobile number */
export function randomMobile() {
  return `+91${9000000000 + Math.floor(Math.random() * 999999999)}`;
}

/** Log a section header to k6 console */
export function section(title) {
  console.log(`\n${'─'.repeat(60)}\n  ${title}\n${'─'.repeat(60)}`);
}
