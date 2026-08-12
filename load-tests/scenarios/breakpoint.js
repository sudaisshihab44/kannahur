/**
 * load-tests/scenarios/breakpoint.js
 *
 * Breakpoint test — ramp VUs until the system starts failing.
 *
 * Purpose: Find the exact concurrent-user count at which the system:
 *   a) Error rate exceeds 1% (soft limit)
 *   b) Error rate exceeds 5% (hard limit — abort)
 *   c) p95 latency exceeds 5 s (performance cliff)
 *
 * The abortOnFail threshold stops the test automatically at the breakpoint
 * so the server is not overwhelmed past the point of useful measurement.
 *
 * What to look at in results:
 *   1. The VU count when http_req_failed first exceeds 1% is the
 *      "soft capacity" of the current deployment.
 *   2. The VU count when abortOnFail triggers is the "hard capacity."
 *   3. Compare soft_capacity ÷ infrastructure_cost to guide scaling decisions.
 *
 * Run:
 *   k6 run -e BASE_URL=https://your-app.com \
 *          --out json=load-tests/results/breakpoint-$(date +%Y%m%d-%H%M).json \
 *          load-tests/scenarios/breakpoint.js
 *
 * NOTE: Run this test against a STAGING environment only.
 *       It will take the target service to its limits.
 */
import { sleep } from 'k6';
import {
  login, fetchQueue, fetchData, createToken,
  callToken, completeToken, receptionistWorkflow, BASE_URL,
} from '../lib/helpers.js';
import { BREAKPOINT_THRESHOLDS } from '../lib/thresholds.js';

export const options = {
  scenarios: {
    breakpoint: {
      executor: 'ramping-arrival-rate',    // arrival-rate is more realistic than VU count
      startRate:       10,
      timeUnit:        '1s',
      preAllocatedVUs: 500,
      maxVUs:          20000,
      stages: [
        { duration: '5m',  target: 50   },  // gentle warm-up
        { duration: '5m',  target: 200  },  // controlled ramp
        { duration: '5m',  target: 500  },  // medium load
        { duration: '5m',  target: 1000 },  // high load
        { duration: '5m',  target: 2000 },  // very high
        { duration: '5m',  target: 4000 },  // extreme
        { duration: '5m',  target: 8000 },  // breaking point territory
        { duration: '5m',  target: 16000},  // way past expected limit
      ],
    },
  },

  thresholds: {
    http_req_failed: [
      { threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '30s' },
    ],
    http_req_duration: [
      { threshold: 'p(95)<5000', abortOnFail: true, delayAbortEval: '30s' },
    ],
  },

  tags: { scenario: 'breakpoint' },
};

export function setup() {
  console.log(`[Breakpoint] Target: ${BASE_URL}`);
  console.log('[Breakpoint] WARNING: This test will push the system to failure.');
  console.log('[Breakpoint] Use STAGING only. Test auto-aborts at 5% error rate.');
  const token = login(__ENV.ADMIN_USER || 'admin', __ENV.ADMIN_PASS || 'admin123', 'admin');
  return { adminToken: token };
}

export default function ({ adminToken }) {
  // Realistic mix under extreme load
  const r = Math.random();

  if (r < 0.60) {
    fetchQueue(null);
    sleep(0.5 + Math.random());
  } else if (r < 0.85) {
    const res = createToken(adminToken);
    if (res.status === 200) {
      const id = res.json('token.id');
      sleep(0.3);
      callToken(adminToken, id);
    }
    sleep(0.5 + Math.random());
  } else {
    fetchData(adminToken);
    sleep(1 + Math.random() * 2);
  }
}

export function teardown(data) {
  console.log('[Breakpoint] Test complete. Check results for breakpoint VU count.');
}
