/**
 * load-tests/scenarios/load-10k.js
 *
 * 10 000 concurrent users — hospital network (multiple branches).
 *
 * At this scale, the in-memory rate limiter (per-process) breaks down
 * across multiple app instances. Redis-backed distributed rate limiting
 * must be in place before this test.
 *
 * Critical bottlenecks expected:
 *   1. Supabase connection pool (default 100 connections)
 *      Fix: PgBouncer transaction-mode pooling configured in Supabase settings
 *   2. Redis command throughput (~50k ops/s needed)
 *      Fix: Redis Cluster or Upstash Pay-as-you-go tier
 *   3. Node.js single-process CPU saturation
 *      Fix: 4+ app replicas behind a load balancer
 *
 * Infrastructure required:
 *   4 × 4vCPU / 8GB app nodes
 *   Redis Cluster (3 primaries, 3 replicas) or Upstash Pro 1M ops/day
 *   Supabase Pro + PgBouncer transaction pooling
 *   Load balancer (Railway/Fly automatic; or Nginx/HAProxy on VPS)
 *
 * Run:
 *   k6 run -e BASE_URL=https://your-app.com -e ADMIN_USER=admin -e ADMIN_PASS=pass \
 *          --out json=load-tests/results/10k-$(date +%Y%m%d-%H%M).json \
 *          load-tests/scenarios/load-10k.js
 */
import { sleep } from 'k6';
import {
  login, fetchData, fetchQueue, createToken,
  callToken, completeToken, trackToken,
  receptionistWorkflow, adminThink, BASE_URL,
} from '../lib/helpers.js';
import { TIER_10K_THRESHOLDS } from '../lib/thresholds.js';

export const options = {
  scenarios: {
    // 65% — TV boards + patient trackers
    queue_pollers: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m',  target: 1000 },
        { duration: '10m', target: 6500 },
        { duration: '25m', target: 6500 },
        { duration: '5m',  target: 0    },
      ],
      gracefulRampDown: '90s',
      exec: 'queuePoller',
      tags: { role: 'queue_poller' },
    },

    // 25% — active receptionists
    receptionists: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m',  target: 250  },
        { duration: '10m', target: 2500 },
        { duration: '25m', target: 2500 },
        { duration: '5m',  target: 0    },
      ],
      gracefulRampDown: '90s',
      exec: 'receptionist',
      tags: { role: 'receptionist' },
    },

    // 7% — admin + dashboard users
    admins: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m',  target: 70  },
        { duration: '10m', target: 700 },
        { duration: '25m', target: 700 },
        { duration: '5m',  target: 0   },
      ],
      gracefulRampDown: '90s',
      exec: 'admin',
      tags: { role: 'admin' },
    },

    // 3% — login sessions
    logins: {
      executor:        'constant-arrival-rate',
      rate:            20,
      timeUnit:        '1s',
      duration:        '45m',
      preAllocatedVUs: 100,
      maxVUs:          300,
      exec:            'loginFlow',
      tags:            { role: 'login' },
    },

    // Continuous patient tracker polling (separate from queue pollers)
    patient_trackers: {
      executor: 'constant-arrival-rate',
      rate:     50,                          // 50 tracker polls/second
      timeUnit: '1s',
      duration: '45m',
      preAllocatedVUs: 200,
      maxVUs:          500,
      exec:            'patientTracker',
      tags:            { role: 'patient_tracker' },
    },
  },

  thresholds: TIER_10K_THRESHOLDS,
  tags: { tier: '10k', scenario: 'load-10k' },
};

export function setup() {
  console.log(`[10k] Target: ${BASE_URL}`);
  console.log('[10k] Ensure: 4+ app replicas, Redis Cluster, PgBouncer active');
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
  // Use a random token number from today's pool
  const num = String(Math.floor(Math.random() * 200) + 1).padStart(3, '0');
  const dept = ['OPD', 'ENT', 'CARD', 'ORTHO'][Math.floor(Math.random() * 4)];
  trackToken(`${dept}-${num}`);
  sleep(4 + Math.random() * 2);
}
