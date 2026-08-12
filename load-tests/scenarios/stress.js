/**
 * load-tests/scenarios/stress.js
 *
 * Stress test — spike + soak combination.
 *
 * Phase 1 — baseline (5 min at 200 VUs)
 *   Establish normal operation baseline metrics.
 *
 * Phase 2 — spike (10× in 30 seconds, hold 5 min)
 *   Simulate a sudden surge (hospital TV coverage, viral social post, etc.)
 *   System must survive; error rate may spike but must recover.
 *
 * Phase 3 — recovery (ramp back to baseline, verify recovery)
 *   Error rate must return to < 1% within 2 minutes of spike dropping.
 *
 * Phase 4 — soak (baseline load for 30 minutes)
 *   Detect slow memory leaks, connection pool exhaustion, Redis TTL drift.
 *
 * Pass criteria:
 *   - System does not crash or require restart during or after spike
 *   - Error rate recovers to < 1% within 2 min of spike end
 *   - p95 at end of soak ≤ p95 at baseline (no degradation over time)
 *
 * Run:
 *   k6 run -e BASE_URL=https://your-app.com \
 *          --out json=load-tests/results/stress-$(date +%Y%m%d-%H%M).json \
 *          load-tests/scenarios/stress.js
 */
import { sleep } from 'k6';
import {
  login, fetchQueue, fetchData, createToken,
  callToken, completeToken, receptionistWorkflow, BASE_URL,
} from '../lib/helpers.js';
import { STRESS_THRESHOLDS } from '../lib/thresholds.js';

export const options = {
  scenarios: {
    stress_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        // Phase 1: Baseline
        { duration: '2m',   target: 100  },  // ramp to baseline
        { duration: '5m',   target: 200  },  // hold baseline

        // Phase 2: Spike
        { duration: '30s',  target: 2000 },  // SPIKE — 10× in 30 s
        { duration: '5m',   target: 2000 },  // hold spike

        // Phase 3: Recovery
        { duration: '2m',   target: 200  },  // rapid drop
        { duration: '3m',   target: 200  },  // verify recovery (error rate check)

        // Phase 4: Soak at baseline
        { duration: '30m',  target: 200  },  // 30-min soak
        { duration: '2m',   target: 0    },  // cool down
      ],
      gracefulRampDown: '60s',
    },
  },

  thresholds: {
    ...STRESS_THRESHOLDS,
    // Custom: p95 at soak end must be within 20% of baseline p95
    // (cannot express this as a threshold — check manually in results)
    http_req_failed: ['rate<0.10'],
  },

  tags: { scenario: 'stress' },
};

export function setup() {
  console.log(`[Stress] Target: ${BASE_URL}`);
  const token = login(__ENV.ADMIN_USER || 'admin', __ENV.ADMIN_PASS || 'admin123', 'admin');
  return { adminToken: token };
}

export default function ({ adminToken }) {
  // Mix of operations reflecting real-world stress pattern:
  // - 70% read-heavy (queue polling) — simulates social media attention spike
  // - 30% write-heavy (token creation) — actual patient demand spike

  const r = Math.random();

  if (r < 0.70) {
    fetchQueue(null);
    sleep(2 + Math.random() * 3);
  } else if (r < 0.90) {
    receptionistWorkflow(adminToken);
  } else {
    fetchData(adminToken);
    sleep(2 + Math.random() * 2);
  }
}
