/**
 * load-tests/scenarios/smoke.js
 *
 * Smoke test — 5 virtual users, 2 minutes.
 * Purpose: Sanity-check that every endpoint responds before running real load tests.
 * Run: k6 run --env BASE_URL=http://localhost:3000 load-tests/scenarios/smoke.js
 */
import { sleep, check } from 'k6';
import http from 'k6/http';
import {
  login, fetchData, fetchQueue, createToken,
  callToken, completeToken, trackToken, checkHealth,
  BASE_URL,
} from '../lib/helpers.js';
import { SMOKE_THRESHOLDS } from '../lib/thresholds.js';

export const options = {
  vus:        5,
  duration:   '2m',
  thresholds: SMOKE_THRESHOLDS,
  tags: { scenario: 'smoke' },
};

// ── Setup (runs once before VUs start) ────────────────────────────────────────
export function setup() {
  console.log(`[Smoke] Target: ${BASE_URL}`);

  // Verify health before starting
  const health = http.get(`${BASE_URL}/api/live`);
  check(health, { 'server is alive': (r) => r.status === 200 });

  const token = login(
    __ENV.ADMIN_USER || 'admin',
    __ENV.ADMIN_PASS || 'admin123',
    'admin'
  );

  if (!token) {
    console.error('[Smoke] Login failed — check credentials and BASE_URL');
  }

  return { token };
}

// ── Main VU function ──────────────────────────────────────────────────────────
export default function ({ token }) {
  const scenario = [
    () => { checkHealth(); sleep(1); },
    () => { fetchQueue(null); sleep(1); },
    () => { fetchData(token); sleep(1); },
    () => {
      const r = createToken(token);
      if (r.status === 200) {
        const id = r.json('token.id');
        sleep(0.5);
        callToken(token, id);
        sleep(0.5);
        completeToken(token, id);
      }
      sleep(1);
    },
    () => { trackToken('OPD-001'); sleep(1); },
  ];

  // Each VU cycles through all scenarios sequentially
  for (const fn of scenario) fn();
}

// ── Teardown ──────────────────────────────────────────────────────────────────
export function teardown() {
  console.log('[Smoke] Complete.');
}
