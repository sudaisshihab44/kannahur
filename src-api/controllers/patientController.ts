/**
 * api/controllers/patientController.ts
 *
 * HTTP handler for patient registration (POST /api/patients).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { findPatientByMobile, insertPatient } from '../repositories/userRepository.js';
import { mapPatient } from '../utils/mappers.js';
import { Gender } from '../../src/types/index.js';

export async function createPatientHandler(req: VercelRequest, res: VercelResponse) {
  try {
    const { name, mobile, age, gender, email } = req.body || {};

    if (!name || !mobile) {
      return res.status(400).json({ success: false, message: 'Patient name and mobile are required.' });
    }

    const cleanMobile = mobile.trim();
    const existing = await findPatientByMobile(cleanMobile);
    if (existing) {
      return res.status(200).json(mapPatient(existing));
    }

    const newPatient = {
      id: `pat-${crypto.randomUUID()}`,
      name: name.trim(),
      mobile: cleanMobile,
      email: (email || '').trim(),
      age: parseInt(age) || 30,
      gender: gender || Gender.MALE,
      created_at: new Date().toISOString(),
    };

    const inserted = await insertPatient(newPatient);
    if (!inserted) {
      return res.status(500).json({ success: false, message: 'Failed to create patient record.' });
    }

    return res.status(200).json(mapPatient(inserted));
  } catch (err: any) {
    console.error('[patientController]', err);
    return res.status(500).json({ success: false, message: err.message || 'Unexpected server error.' });
  }
}
