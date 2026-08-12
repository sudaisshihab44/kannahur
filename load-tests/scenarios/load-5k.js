/**
 * load-tests/scenarios/load-5k.js
 *
 * 5 000 concurrent users — large hospital with 8–10 departments.
 *
 * User mix:
 *   65% queue pollers   (3 250 VUs) — TV boards across all departments
 *   25% receptionists   (1 250 VUs) — token operations
 *    7% admins          (  350 VUs) — data queries
 *    3% logins          (  150 VUs) — session starts
 *
 * Key changes vs 1k:
 *   - Longer ramp: 15 minutes to full load (realistic morning rush)
 *   - Higher queue poll arrival rate (3 500 req/s on /api/queue)
 *   - Auth rate limiter may trip — expected; check error_rate threshold
 *
 * Infrastructure required:
 *   2 app nodes (horizontal scale via Docker Swarm / Railway replicas)
 *   Redis Upstash Pro (100k ops/day, 256 MB)
 *   Supabase Pro plan (8GB, 4 CPU)
 *
 * Run:
 *   k6 run -e BASE_URL=https://your-app.com -e ADMIN_USER=admin -e ADMIN_PASS=pass \
 *          load-tests/scenarios/load-5k.js
 */
import { sleep } from 'k6';
import {
  login, fetchData, fetchQueue, createToken,
  callToken, completeToken, receptionistWorkflow,
  adminThink, BASE_URL,
} from '../lib/helpers.js';
import { TIER_5K_THRESHOLDS } from '../lib/thresholds.js';

export const options = {
  scenarios: {
    queue_pollers: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m',  target: 500  },
        { duration: '10m', target: 3250 },
        { duration: '20m', target: 3250 },
        { duration: '5m',  target: 0    },
      ],
      gracefulRampDown: '60s',
      exec: 'queuePoller',
      tags: { role: 'queue_poller' },
    },

    receptionists: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m',  target: 125  },
        { duration: '10m', target: 1250 },
        { duration: '20m', target: 1250 },
        { duration: '5m',  target: 0    },
      ],
      gracefulRampDown: '60s',
      exec: 'receptionist',
      tags: { role: 'receptionist' },
    },

    admins: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m',  target: 35  },
        { duration: '10m', target: 350 },
        { duration: '20m', target: 350 },
        { duration: '5m',  target: 0   },
      ],
      gracefulRampDown: '60s',
      exec: 'admin',
      tags: { role: 'admin' },
    },

    logins: {
      executor:         'constant-arrival-rate',
      rate:             10,
      timeUnit:         '1s',
      duration:         '40m',
      preAllocatedVUs:  50,
      maxVUs:           150,
      exec:             'loginFlow',
      tags:             { role: 'login' },
    },
  },

  thresholds: TIER_5K_THRESHOLDS,
  tags: { tier: '5k', scenario: 'load-5k' },
};

export function setup() {
  console.log(`[5k] Target: ${BASE_URL}`);
  const token = login(__ENV.ADMIN_USER || 'admin', __ENV.ADMIN_PASS || 'admin123', 'admin');
  return { adminToken: token };
}

export function queuePoller() {
  fetchQueue(null);
  sleep(4.5 + Math.random() * 1);
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
  sleep(1 + Math.random());
}
