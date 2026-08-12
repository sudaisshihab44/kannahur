/**
 * load-tests/k6.config.js
 *
 * Shared execution config for all InclusyQ k6 load test scenarios.
 *
 * This file is NOT imported by k6 directly — it documents the recommended
 * CLI flags for each test tier. Use the npm scripts in package.json.
 *
 * Output formats supported:
 *   --out json=...        raw JSON for post-analysis in Excel / Pandas
 *   --out influxdb=...    live streaming to InfluxDB + Grafana
 *   --out cloud           k6 Cloud (required for 50k+ VUs)
 *
 * Useful CLI flags:
 *   --http-debug          log every request/response
 *   --no-connection-reuse simulate cold connections
 *   --insecure-skip-tls-verify  skip TLS validation (dev/staging)
 *   --summary-trend-stats 'p(50),p(95),p(99),max'
 *   --tag testid=$(date +%s)  tag runs for InfluxDB correlation
 */

export const SCENARIOS = {
  smoke:     { file: 'scenarios/smoke.js',      vus: 5,      duration: '2m',   prereqs: [] },
  '1k':      { file: 'scenarios/load-1k.js',    vus: 1000,   duration: '30m',  prereqs: ['redis'] },
  '5k':      { file: 'scenarios/load-5k.js',    vus: 5000,   duration: '40m',  prereqs: ['redis', '2x-nodes'] },
  '10k':     { file: 'scenarios/load-10k.js',   vus: 10000,  duration: '45m',  prereqs: ['redis', '4x-nodes', 'pgbouncer'] },
  '50k':     { file: 'scenarios/load-50k.js',   vus: 50000,  duration: '70m',  prereqs: ['redis-cluster', 'k8s-hpa', 'read-replica', 'k6-cloud'] },
  '100k':    { file: 'scenarios/load-100k.js',  vus: 100000, duration: '80m',  prereqs: ['redis-cluster', 'multi-region', 'cdn', 'k6-cloud'] },
  stress:    { file: 'scenarios/stress.js',      vus: 2000,   duration: '50m',  prereqs: ['redis'] },
  breakpoint:{ file: 'scenarios/breakpoint.js', vus: 'auto', duration: 'auto', prereqs: ['staging-only'] },
};

/**
 * Recommended k6 CLI invocation for each scenario.
 * Replace <BASE_URL>, <ADMIN_USER>, <ADMIN_PASS> with real values.
 */
export const CLI_COMMANDS = {
  smoke: `k6 run \\
  -e BASE_URL=http://localhost:3000 \\
  -e ADMIN_USER=admin \\
  -e ADMIN_PASS=admin123 \\
  --summary-trend-stats 'p(50),p(95),p(99),max' \\
  load-tests/scenarios/smoke.js`,

  '1k': `k6 run \\
  -e BASE_URL=https://your-staging.railway.app \\
  -e ADMIN_USER=admin \\
  -e ADMIN_PASS=yourpassword \\
  -e DEPT_ID=dep-1 \\
  -e DOCTOR_ID=doc-1 \\
  --out json=load-tests/results/1k-\$(date +%Y%m%d-%H%M).json \\
  --summary-trend-stats 'p(50),p(95),p(99),max' \\
  load-tests/scenarios/load-1k.js`,

  '5k': `k6 run \\
  -e BASE_URL=https://your-app.com \\
  -e ADMIN_USER=admin \\
  -e ADMIN_PASS=yourpassword \\
  --out json=load-tests/results/5k-\$(date +%Y%m%d-%H%M).json \\
  --out influxdb=http://localhost:8086/k6 \\
  load-tests/scenarios/load-5k.js`,

  '10k': `k6 run \\
  -e BASE_URL=https://your-app.com \\
  -e ADMIN_USER=admin \\
  -e ADMIN_PASS=yourpassword \\
  --out json=load-tests/results/10k-\$(date +%Y%m%d-%H%M).json \\
  load-tests/scenarios/load-10k.js`,

  '50k': `k6 cloud \\
  -e BASE_URL=https://your-app.com \\
  -e ADMIN_USER=admin \\
  -e ADMIN_PASS=yourpassword \\
  load-tests/scenarios/load-50k.js`,

  '100k': `k6 cloud \\
  -e BASE_URL=https://your-app.com \\
  -e ADMIN_USER=admin \\
  -e ADMIN_PASS=yourpassword \\
  load-tests/scenarios/load-100k.js`,

  stress: `k6 run \\
  -e BASE_URL=https://your-staging.com \\
  -e ADMIN_USER=admin \\
  -e ADMIN_PASS=yourpassword \\
  --out json=load-tests/results/stress-\$(date +%Y%m%d-%H%M).json \\
  load-tests/scenarios/stress.js`,

  breakpoint: `k6 run \\
  -e BASE_URL=https://your-STAGING.com \\
  -e ADMIN_USER=admin \\
  -e ADMIN_PASS=yourpassword \\
  --out json=load-tests/results/breakpoint-\$(date +%Y%m%d-%H%M).json \\
  load-tests/scenarios/breakpoint.js`,
};
