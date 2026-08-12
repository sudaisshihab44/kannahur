/**
 * api/controllers/healthController.ts
 *
 * HTTP handlers for all monitoring endpoints:
 *
 *   GET /api/health    — full system health report (JSON)
 *   GET /api/ready     — readiness probe (JSON)
 *   GET /api/live      — liveness probe (JSON)
 *   GET /api/metrics   — Prometheus text exposition (protected by METRICS_TOKEN)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getHealthReport, getReadinessReport, getLivenessReport } from '../monitoring/health.js';
import { registry } from '../monitoring/metrics.js';
import { systemLog } from '../config/logger.js';

// ── GET /api/health ───────────────────────────────────────────────────────────

export async function healthHandler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const report = await getHealthReport();
    const status = report.status === 'up' ? 200 : report.status === 'degraded' ? 200 : 503;

    res.setHeader('Cache-Control', 'no-store');
    res.status(status).json(report);
  } catch (err: any) {
    systemLog.error({ err }, 'Health check failed');
    res.status(503).json({ status: 'down', error: err.message });
  }
}

// ── GET /api/ready ────────────────────────────────────────────────────────────

export async function readyHandler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const report = await getReadinessReport();
    res.setHeader('Cache-Control', 'no-store');
    res.status(report.ready ? 200 : 503).json(report);
  } catch (err: any) {
    res.status(503).json({ ready: false, error: err.message });
  }
}

// ── GET /api/live ─────────────────────────────────────────────────────────────

export function liveHandler(req: VercelRequest, res: VercelResponse): void {
  const report = getLivenessReport();
  res.setHeader('Cache-Control', 'no-store');
  res.status(report.alive ? 200 : 503).json(report);
}

// ── GET /api/metrics ──────────────────────────────────────────────────────────

export async function metricsHandler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Optional bearer-token protection so Prometheus metrics are not public
  const metricsToken = process.env.METRICS_TOKEN;
  if (metricsToken) {
    const authHeader = req.headers['authorization'] ?? '';
    const provided   = authHeader.replace(/^Bearer\s+/i, '');
    if (provided !== metricsToken) {
      res.status(401).json({ success: false, message: 'Invalid metrics token' });
      return;
    }
  }

  try {
    const metrics = await registry.metrics();
    res.setHeader('Content-Type', registry.contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(metrics);
  } catch (err: any) {
    systemLog.error({ err }, 'Failed to collect metrics');
    res.status(500).json({ success: false, message: 'Failed to collect metrics' });
  }
}
