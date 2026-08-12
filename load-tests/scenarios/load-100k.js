/**
 * load-tests/scenarios/load-100k.js
 *
 * 100 000 concurrent users — nationwide hospital chain or health ministry platform.
 *
 * At this scale, the current single-tenant architecture requires significant
 * architectural changes to sustain the load without graceful degradation.
 * This test is aspirational — it defines the target, not the current capability.
 *
 * ARCHITECTURAL CHANGES REQUIRED (see SCALE_ANALYSIS.md §7):
 * ──────────────────────────────────────────────────────────
 * 1. Multi-region deployment (Singapore + India + Middle East)
 * 2. Edge caching: /api/queue served from CDN edge (Cloudflare Workers)
 *    — reduces origin hits by ~80%
 * 3. Supabase Realtime → Dedicated pub/sub (Ably / Pusher / self-hosted NATS)
 *    — current 5-second polling generates 20 000 req/s; Realtime eliminates it
 * 4. Database sharding by hospital_id
 * 5. Redis Cluster (12 nodes, 3 regions)
 * 6. 20+ Kubernetes pods (HPA min=10, max=50, CPU target 60%)
 * 7. Rate limiter must use Redis INCR (not in-memory — already implemented)
 * 8. /api/data must be split into smaller endpoints or replaced with WebSocket
 *    subscriptions to avoid 65 kB JSON payloads at 100k user scale
 *
 * RUN THIS TEST WITH k6 CLOUD OR DISTRIBUTED k6:
 *   k6 cloud load-tests/scenarios/load-100k.js
 *
 * Single-machine memory requirement: ~200 GB RAM. Not feasible locally.
 */
import { sleep } from 'k6';
import {
  login, fetchData, fetchQueue, createToken,
  callToken, completeToken, trackToken,
  receptionistWorkflow, adminThink, BASE_URL,
} from '../lib/helpers.js';
import { TIER_100K_THRESHOLDS } from '../lib/thresholds.js';

export const options = {
  scenarios: {
    queue_pollers: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15m', target: 10000 },
        { duration: '20m', target: 65000 },
        { duration: '30m', target: 65000 },
        { duration: '15m', target: 0     },
      ],
      gracefulRampDown: '5m',
      exec: 'queuePoller',
      tags: { role: 'queue_poller' },
    },

    receptionists: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15m', target: 2500  },
        { duration: '20m', target: 25000 },
        { duration: '30m', target: 25000 },
        { duration: '15m', target: 0     },
      ],
      gracefulRampDown: '5m',
      exec: 'receptionist',
      tags: { role: 'receptionist' },
    },

    admins: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15m', target: 500  },
        { duration: '20m', target: 5000 },
        { duration: '30m', target: 5000 },
        { duration: '15m', target: 0    },
      ],
      gracefulRampDown: '5m',
      exec: 'admin',
      tags: { role: 'admin' },
    },

    logins: {
      executor:        'constant-arrival-rate',
      rate:            200,
      timeUnit:        '1s',
      duration:        '80m',
      preAllocatedVUs: 1000,
      maxVUs:          3000,
      exec:            'loginFlow',
      tags:            { role: 'login' },
    },

    patient_trackers: {
      executor:        'constant-arrival-rate',
      rate:            1000,                    // 1 000 tracker polls/second
      timeUnit:        '1s',
      duration:        '80m',
      preAllocatedVUs: 5000,
      maxVUs:          10000,
      exec:            'patientTracker',
      tags:            { role: 'patient_tracker' },
    },
  },

  thresholds: TIER_100K_THRESHOLDS,
  tags: { tier: '100k', scenario: 'load-100k' },
};

export function setup() {
  console.log(`[100k] Target: ${BASE_URL}`);
  console.log('[100k] WARNING: This requires k6 Cloud or distributed execution.');
  const token = login(__ENV.ADMIN_USER || 'admin', __ENV.ADMIN_PASS || 'admin123', 'admin');
  return { adminToken: token };
}

export function queuePoller() {
  fetchQueue(null);
  sleep(4 + Math.random() * 2);
}

export function receptionist({ adminToken }) {
  receptionistWorkflow(adminToken);
}

export function admin({ adminToken }) {
  fetchData(adminToken);
  adminThink();
}

export function loginFlow() {
  login(__ENV.ADMIN_USER || 'admin', __ENV.ADMIN_PASS || 'admin123', 'reception');
  sleep(0.5 + Math.random());
}

export function patientTracker() {
  const num  = String(Math.floor(Math.random() * 1000) + 1).padStart(3, '0');
  const dept = ['OPD', 'ENT', 'CARD', 'ORTHO', 'PEDS', 'ONCO',
                'NEURO', 'DERM', 'GYN', 'UROL', 'PSYCH', 'SURG']
    [Math.floor(Math.random() * 12)];
  trackToken(`${dept}-${num}`);
  sleep(4 + Math.random() * 2);
}
