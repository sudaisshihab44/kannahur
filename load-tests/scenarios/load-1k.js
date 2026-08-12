/**
 * load-tests/scenarios/load-1k.js
 *
 * 1 000 concurrent users — hospital with 2–3 departments, busy morning session.
 *
 * User mix:
 *   60% patient trackers    — poll /api/queue every 5 s (TV boards + patients)
 *   25% receptionists       — create tokens, call/complete (realistic workflow)
 *   10% admin staff         — fetch /api/data, update settings
 *    5% background logins   — new sessions opening
 *
 * Ramp profile:
 *   0→200 VUs  over 2 min  (staff arriving at start of session)
 *   200→1000   over 5 min  (morning rush)
 *   1000       hold 20 min (peak load)
 *   1000→0     over 3 min  (session winding down)
 *
 * Infrastructure target:
 *   1 × 2vCPU / 2GB Node.js app  +  Redis (Upstash free tier)
 *   Supabase free tier (500MB, 2 CPU burst)
 *
 * Run:
 *   k6 run \
 *     --env BASE_URL=https://your-app.railway.app \
 *     --env ADMIN_USER=admin \
 *     --env ADMIN_PASS=yourpassword \
 *     load-tests/scenarios/load-1k.js
 */
import { sleep } from 'k6';
import {
  login, fetchData, fetchQueue, createToken,
  callToken, completeToken, trackToken, checkHealth,
  receptionistWorkflow, tvWorkflow, patientTrackerWorkflow,
  adminThink, section, BASE_URL,
} from '../lib/helpers.js';
import { TIER_1K_THRESHOLDS } from '../lib/thresholds.js';

export const options = {
  scenarios: {
    // ── TV displays / patient tracker boards ─────────────────────────────────
    queue_pollers: {
      executor:        'ramping-vus',
      startVUs:        0,
      stages: [
        { duration: '2m',  target: 120 },   // ramp up
        { duration: '5m',  target: 600 },   // rush
        { duration: '20m', target: 600 },   // peak
        { duration: '3m',  target: 0   },   // wind down
      ],
      gracefulRampDown: '30s',
      exec: 'queuePoller',
      tags: { role: 'queue_poller' },
    },

    // ── Active receptionists ──────────────────────────────────────────────────
    receptionists: {
      executor:        'ramping-vus',
      startVUs:        0,
      stages: [
        { duration: '2m',  target: 25  },
        { duration: '5m',  target: 250 },
        { duration: '20m', target: 250 },
        { duration: '3m',  target: 0   },
      ],
      gracefulRampDown: '30s',
      exec: 'receptionist',
      tags: { role: 'receptionist' },
    },

    // ── Admin staff ───────────────────────────────────────────────────────────
    admins: {
      executor:        'ramping-vus',
      startVUs:        0,
      stages: [
        { duration: '2m',  target: 5  },
        { duration: '5m',  target: 50 },
        { duration: '20m', target: 50 },
        { duration: '3m',  target: 0  },
      ],
      gracefulRampDown: '30s',
      exec: 'admin',
      tags: { role: 'admin' },
    },

    // ── New logins ────────────────────────────────────────────────────────────
    logins: {
      executor: 'constant-arrival-rate',
      rate:     3,                          // 3 new logins/second at peak
      timeUnit: '1s',
      duration: '30m',
      preAllocatedVUs: 20,
      maxVUs:          50,
      exec: 'loginFlow',
      tags: { role: 'login' },
    },
  },

  thresholds: TIER_1K_THRESHOLDS,
  tags: { tier: '1k', scenario: 'load-1k' },
};

// ── Setup ─────────────────────────────────────────────────────────────────────
export function setup() {
  section('Load Test — 1 000 Users');
  console.log(`Target:    ${BASE_URL}`);
  console.log(`Peak VUs:  1 000`);
  console.log(`Duration:  ~30 minutes`);

  const token = login(
    __ENV.ADMIN_USER || 'admin',
    __ENV.ADMIN_PASS || 'admin123',
    'admin'
  );
  return { adminToken: token };
}

// ── Scenario executors ────────────────────────────────────────────────────────

export function queuePoller() {
  fetchQueue(null);
  sleep(4.5 + Math.random() * 1);           // ~5 s polling interval
}

export function receptionist({ adminToken }) {
  receptionistWorkflow(adminToken);
}

export function admin({ adminToken }) {
  fetchData(adminToken);
  adminThink();
}

export function loginFlow() {
  const t = login(
    __ENV.ADMIN_USER || 'admin',
    __ENV.ADMIN_PASS || 'admin123',
    'reception'
  );
  sleep(1);
}
