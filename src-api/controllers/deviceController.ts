/**
 * api/controllers/deviceController.ts
 *
 * HTTP handlers for tracking device CRUD and assignment operations.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { findAllDevices, findDeviceById, insertDevice, updateDevice, releaseDevice } from '../repositories/deviceRepository.js';
import { findTokenById, updateToken } from '../repositories/tokenRepository.js';
import { addQueueLog } from '../services/queueService.js';
import { mapDevice } from '../utils/mappers.js';

export async function listDevicesHandler(req: VercelRequest, res: VercelResponse) {
  try {
    const devices = await findAllDevices();
    return res.status(200).json({ success: true, devices: devices.map(mapDevice) });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message || 'Device query failed' });
  }
}

export async function createDeviceHandler(req: VercelRequest, res: VercelResponse) {
  try {
    const { deviceCode, name } = req.body || {};
    if (!deviceCode) return res.status(400).json({ success: false, message: 'Device code is required.' });

    const newDevice = {
      id: `dev-${Date.now()}`,
      device_code: deviceCode.trim().toUpperCase(),
      name: (name || `Smart Pager ${deviceCode}`).trim(),
      status: 'available',
      battery_level: 100,
      last_seen_at: new Date().toISOString(),
    };

    const inserted = await insertDevice(newDevice);
    return res.status(200).json({ success: true, device: mapDevice(inserted) });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message || 'Failed to create device' });
  }
}

export async function assignDeviceHandler(req: VercelRequest, res: VercelResponse) {
  try {
    const { deviceId, tokenId } = req.body || {};
    if (!deviceId || !tokenId) {
      return res.status(400).json({ success: false, message: 'deviceId and tokenId are required.' });
    }

    const [tokenRow, deviceRow] = await Promise.all([
      findTokenById(tokenId),
      findDeviceById(deviceId),
    ]);

    if (!tokenRow || !deviceRow) {
      return res.status(404).json({ success: false, message: 'Token or device not found.' });
    }

    await updateDevice(deviceId, {
      status: 'in_use',
      assigned_token_id: tokenId,
      assigned_token_number: tokenRow.token_number,
      last_seen_at: new Date().toISOString(),
    });

    await updateToken(tokenId, { device_id: deviceId });

    await addQueueLog(
      tokenId,
      tokenRow.token_number,
      'assigned_depts',
      `Assigned Hardware Pager ${deviceRow.device_code}`
    );

    return res.status(200).json({
      success: true,
      message: `Device ${deviceRow.device_code} assigned to ${tokenRow.token_number}.`,
    });
  } catch (err: any) {
    console.error('[deviceController] assign', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to assign device.' });
  }
}

export async function unassignDeviceHandler(req: VercelRequest, res: VercelResponse) {
  try {
    const { deviceId } = req.body || {};
    if (!deviceId) return res.status(400).json({ success: false, message: 'deviceId is required.' });

    const deviceRow = await findDeviceById(deviceId);
    if (!deviceRow) return res.status(404).json({ success: false, message: 'Device not found.' });

    if (deviceRow.assigned_token_id) {
      await updateToken(deviceRow.assigned_token_id, { device_id: null });
    }

    await releaseDevice(deviceId);

    return res.status(200).json({ success: true, message: `Device ${deviceRow.device_code} is now available.` });
  } catch (err: any) {
    console.error('[deviceController] unassign', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to unassign device.' });
  }
}
