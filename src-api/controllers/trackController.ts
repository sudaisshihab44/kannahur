/**
 * api/controllers/trackController.ts
 *
 * HTTP handler for GET /api/track/:tokenId — patient-facing token tracker.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { findTokenById, findCurrentlyCalledToken, findTokensAhead } from '../repositories/tokenRepository.js';

export async function trackTokenHandler(req: VercelRequest, res: VercelResponse, tokenId: string) {
  try {
    const myToken = await findTokenById(tokenId);
    if (!myToken) {
      return res.status(404).json({ success: false, message: 'Token not found.' });
    }

    const [currentServing, aheadList] = await Promise.all([
      findCurrentlyCalledToken(myToken.department_id),
      findTokensAhead(myToken.department_id, myToken.position),
    ]);

    return res.status(200).json({
      success: true,
      myToken,
      currentServing: currentServing || null,
      aheadCount: aheadList.length,
    });
  } catch (err: any) {
    console.error('[trackController]', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to fetch tracking data.' });
  }
}
