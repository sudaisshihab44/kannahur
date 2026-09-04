/**
 * api/controllers/queueController.ts
 *
 * HTTP handlers for queue read operations and settings mutations.
 * Uses Redis-backed cache layers for all reads.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCachedWaitingQueue, invalidateQueueCache } from '../cache/queueStatus.js';
import { invalidateDashboardCache } from '../cache/dashboardCache.js';
import {
  getCachedAnnouncements,
  saveCachedAnnouncements,
  updateCachedSettings,
  invalidateSettingsCache,
} from '../cache/hospitalSettings.js';
import { getSettings } from '../repositories/settingsRepository.js';
import { invalidateDataCache } from './dataController.js';
import { RedisTTL } from '../cache/keys.js';

export async function getQueueHandler(req: VercelRequest, res: VercelResponse) {
  try {
    const { departmentId, doctorId } = req.query as Record<string, string>;
    const tokens = await getCachedWaitingQueue(departmentId, doctorId);

    res.setHeader('Cache-Control', `private, max-age=${RedisTTL.QUEUE}`);
    return res.status(200).json({ success: true, tokens });
  } catch (err: any) {
    console.error('[queueController] getQueue', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function togglePauseHandler(req: VercelRequest, res: VercelResponse) {
  try {
    const settings = await getSettings();
    const newPaused = !settings?.is_paused;
    await updateCachedSettings({ is_paused: newPaused });

    // Cascade invalidations
    await Promise.all([
      invalidateDataCache(),
      invalidateQueueCache(),
      invalidateDashboardCache(),
    ]);

    return res.status(200).json({ success: true, isPaused: newPaused });
  } catch (err: any) {
    console.error('[queueController] togglePause', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function addAnnouncementHandler(req: VercelRequest, res: VercelResponse) {
  const { text } = req.body || {};
  if (!text?.trim()) {
    return res.status(400).json({ success: false, message: 'Announcement text cannot be empty' });
  }

  const anns = await getCachedAnnouncements();
  const newAnn = { id: `ann-${Date.now()}`, text: text.trim(), createdAt: new Date().toISOString() };
  anns.unshift(newAnn);
  await saveCachedAnnouncements(anns);
  await invalidateDataCache();

  return res.status(200).json({ success: true, announcement: newAnn });
}

export async function deleteAnnouncementHandler(req: VercelRequest, res: VercelResponse, annId: string) {
  const anns = await getCachedAnnouncements();
  await saveCachedAnnouncements(anns.filter((a: any) => a.id !== annId));
  await invalidateDataCache();

  return res.status(200).json({ success: true });
}
