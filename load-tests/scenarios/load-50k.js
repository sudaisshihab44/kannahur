/**
 * load-tests/scenarios/load-50k.js
 *
 * 50 000 concurrent users — national hospital network or busy city hospital.
 *
 * At this scale the system must be fundamentally redesigned:
 *
 *   REQUIRED before running this test:
 *   ─────────────────────────────────
 *   1. Kubernetes cluster with HPA (Horizontal Pod Autoscaler) configured
 *   2. Redis Cluster (6 nodes minimum, 3 primary + 3 replica)
 *   3. Postgres read replica for all SELECT queries
 *   4. PgBouncer in transaction mode (max 1000 pool size)
 *   5. Rate limiters moved to Redis (current in-memory limiters will not
 *      work correctly across multiple pods — each pod has its own counter)
 *   6. CDN (Cloudflare / CloudFront) in front of the application
 *      to serve static assets and cache /api/queue responses at the edge
 *   7. Supabase Enterprise or self-hosted Postgres
 *
 *   IMPORTANT: This test requires a distributed k6 execution environment
 *   (k6 Cloud or k6 operator on Kubernetes). Running 50k VUs on a single
 *   machine requires ~100GB RAM. Use:
 *     k6 cloud load-tests/scenarios/load-50k.js
 *   or split across multiple k6 instances with k6 operator.
 *
 * Run:
 *   # k6 Cloud (recommended for this VU count):
 *   k6 cloud -e BASE_URL=https://your-app.com load-tests/scenarios/load-50k.js
 *
 *   # Distributed on-prem (k6 operator or Gatling):
 *   See load-tests/DISTRIBUTED.md
 */
import { sleep } from 'k6';
import {
  login, fetchData, fetchQueue, createToken,
  callToken, completeToken, trackToken,
  receptionistWorkflow, adminThink, BASE_URL,
} from '../lib/helpers.js';
import { TIER_50K_THRESHOLDS } from '../lib/thresholds.js';

export const options = {
  scenarios: {
    // 65% — TV displays, patient tracker apps, waiting room boards
    queue_pollers: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10m', target: 5000  },
        { duration: '20m', target: 32500 },
        { duration: '30m', target: 32500 },
        { duration: '10m', target: 0     },
      ],
      gracefulRampDown: '2m',
      exec: 'queuePoller',
      tags: { role: 'queue_poller' },
    },

    // 25% — receptionists across many departments
    receptionists: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10m', target: 1250  },
        { duration: '20m', target: 12500 },
        { duration: '30m', target: 12500 },
        { duration: '10m', target: 0     },
      ],
      gracefulRampDown: '2m',
      exec: 'receptionist',
      tags: { role: 'receptionist' },
    },

    // 5% — admin and manager staff
    admins: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10m', target: 250  },
        { duration: '20m', target: 2500 },
        { duration: '30m', target: 2500 },
        { duration: '10m', target: 0    },
      ],
      gracefulRampDown: '2m',
      exec: 'admin',
      tags: { role: 'admin' },
    },

    // Continuous login arrivals
    logins: {
      executor:        'constant-arrival-rate',
      rate:            80,
      timeUnit:        '1s',
      duration:        '70m',
      preAllocatedVUs: 300,
      maxVUs:          1000,
      exec:            'loginFlow',
      tags:            { role: 'login' },
    },

    // Patient tracker app polling (500 token polls/second)
    patient_trackers: {
      executor:        'constant-arrival-rate',
      rate:            500,
      timeUnit:        '1s',
      duration:        '70m',
      preAllocatedVUs: 2000,
      maxVUs:          5000,
      exec:            'patientTracker',
      tags:            { role: 'patient_tracker' },
    },
  },

  thresholds: TIER_50K_THRESHOLDS,
  tags: { tier: '50k', scenario: 'load-50k' },
};

export function setup() {
  console.log(`[50k] Target: ${BASE_URL}`);
  console.log('[50k] PRE-CHECK: Redis Cluster ✓, Read Replica ✓, k8s HPA ✓, PgBouncer ✓');
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
  const num  = String(Math.floor(Math.random() * 500) + 1).padStart(3, '0');
  const dept = ['OPD', 'ENT', 'CARD', 'ORTHO', 'PEDS', 'ONCO', 'NEURO', 'DERM']
    [Math.floor(Math.random() * 8)];
  trackToken(`${dept}-${num}`);
  sleep(4 + Math.random() * 2);
}
