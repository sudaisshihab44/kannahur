/**
 * api/controllers/tokenController.ts
 *
 * HTTP handlers for token CRUD and state transitions.
 * Delegates all business logic to tokenService.
 * Invalidates Redis caches after every write.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createToken, callToken, completeToken, skipToken, cancelToken, recallToken } from '../services/tokenService.js';
import { invalidateQueueCache, invalidateDeptQueueCache } from '../cache/queueStatus.js';
import { invalidateDashboardCache } from '../cache/dashboardCache.js';
import { invalidateDataCache } from './dataController.js';

/** Centralised post-write invalidation */
async function invalidateAfterTokenWrite(deptId?: string): Promise<void> {
  await Promise.all([
    invalidateDataCache(),
    invalidateDashboardCache(),
    deptId ? invalidateDeptQueueCache(deptId) : invalidateQueueCache(),
  ]);
}

export async function createTokenHandler(req: VercelRequest, res: VercelResponse) {
  try {
    const operatorUsername = req.headers['x-operator-username'] as string;
    const result = await createToken({ ...req.body, operatorUsername });

    if (!result.success) {
      return res.status(result.message?.includes('not authorized') ? 403 : 400).json(result);
    }

    await invalidateAfterTokenWrite(result.token?.departmentId);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[tokenController] create', err);
    return res.status(500).json({ success: false, message: err.message || 'Unexpected server error.' });
  }
}

export async function callTokenHandler(req: VercelRequest, res: VercelResponse, tokenId: string) {
  try {
    const operatorUsername = req.headers['x-operator-username'] as string;
    const result = await callToken(tokenId, operatorUsername);

    if (!result.success) {
      const status = result.message?.includes('not authorized') ? 403
        : result.message === 'Token not found' ? 404 : 500;
      return res.status(status).json(result);
    }

    await invalidateAfterTokenWrite(result.token?.departmentId);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[tokenController] call', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to call token.' });
  }
}

export async function completeTokenHandler(req: VercelRequest, res: VercelResponse, tokenId: string) {
  try {
    const operatorUsername = req.headers['x-operator-username'] as string;
    const result = await completeToken(tokenId, operatorUsername);

    if (!result.success) {
      const status = result.message?.includes('not authorized') ? 403
        : result.message === 'Token not found' ? 404 : 500;
      return res.status(status).json(result);
    }

    await invalidateAfterTokenWrite(result.token?.departmentId);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[tokenController] complete', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to complete token.' });
  }
}

export async function skipTokenHandler(req: VercelRequest, res: VercelResponse, tokenId: string) {
  try {
    const operatorUsername = req.headers['x-operator-username'] as string;
    const result = await skipToken(tokenId, operatorUsername);

    if (!result.success) {
      const status = result.message?.includes('not authorized') ? 403
        : result.message === 'Token not found' ? 404 : 500;
      return res.status(status).json(result);
    }

    await invalidateAfterTokenWrite(result.token?.departmentId);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[tokenController] skip', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to skip token.' });
  }
}

export async function cancelTokenHandler(req: VercelRequest, res: VercelResponse, tokenId: string) {
  try {
    const operatorUsername = req.headers['x-operator-username'] as string;
    const result = await cancelToken(tokenId, operatorUsername);

    if (!result.success) {
      const status = result.message?.includes('not authorized') ? 403
        : result.message === 'Token not found' ? 404 : 500;
      return res.status(status).json(result);
    }

    await invalidateAfterTokenWrite(result.token?.departmentId);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[tokenController] cancel', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to cancel token.' });
  }
}

export async function recallTokenHandler(req: VercelRequest, res: VercelResponse, tokenId: string) {
  try {
    const operatorUsername = req.headers['x-operator-username'] as string;
    const result = await recallToken(tokenId, operatorUsername);

    if (!result.success) {
      const status = result.message?.includes('not authorized') ? 403
        : result.message === 'Token not found' ? 404 : 500;
      return res.status(status).json(result);
    }

    await invalidateAfterTokenWrite(result.token?.departmentId);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[tokenController] recall', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to recall token.' });
  }
}
