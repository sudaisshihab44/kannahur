/**
 * api/controllers/uploadController.ts
 *
 * HTTP handler for multipart file upload (logo).
 * Uses busboy for streaming parse, uploads to Supabase Storage.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../config/supabase.js';
import { getSettings, updateSettings } from '../repositories/settingsRepository.js';
import Busboy from 'busboy';
import path from 'path';

function parseMultipart(req: VercelRequest): Promise<{ buffer: Buffer; mimetype: string; filename: string }> {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers as Record<string, string>, limits: { fileSize: 5 * 1024 * 1024 } });
    let resolved = false;

    bb.on('file', (_fieldname, stream, info) => {
      const { filename, mimeType } = info;
      const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
      if (!allowed.includes(mimeType)) {
        stream.resume();
        return reject(new Error('Only PNG, JPG, JPEG, and WEBP files are allowed.'));
      }
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        if (!resolved) {
          resolved = true;
          resolve({ buffer: Buffer.concat(chunks), mimetype: mimeType, filename });
        }
      });
      stream.on('error', reject);
    });

    bb.on('error', reject);
    bb.on('finish', () => { if (!resolved) reject(new Error('No file found in request.')); });
    req.pipe(bb);
  });
}

export async function uploadLogoHandler(req: VercelRequest, res: VercelResponse) {
  try {
    const file = await parseMultipart(req);

    const { data: buckets, error: bucketErr } = await supabase.storage.listBuckets();
    if (bucketErr) return res.status(500).json({ success: false, message: `Storage list error: ${bucketErr.message}` });

    if (!buckets?.some((b) => b.id === 'hospital-logos')) {
      const { error: createErr } = await supabase.storage.createBucket('hospital-logos', {
        public: true,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
        fileSizeLimit: 5 * 1024 * 1024,
      });
      if (createErr) return res.status(500).json({ success: false, message: `Bucket creation failed: ${createErr.message}` });
    }

    const ext = path.extname(file.filename) || '.png';
    const filename = `logo-${Date.now()}-${Math.random().toString(36).substr(2, 5)}${ext}`;

    const { error: uploadErr } = await supabase.storage.from('hospital-logos').upload(filename, file.buffer, {
      contentType: file.mimetype,
      cacheControl: '3600',
      upsert: true,
    });
    if (uploadErr) return res.status(500).json({ success: false, message: `Upload failed: ${uploadErr.message}` });

    const { data: publicUrlData } = supabase.storage.from('hospital-logos').getPublicUrl(filename);
    const logoUrl = publicUrlData?.publicUrl;
    if (!logoUrl) return res.status(500).json({ success: false, message: 'Failed to generate public URL.' });

    const settings = await getSettings();
    const hospitalInfo = { ...(settings?.hospital_info || {}), logoUrl };
    await updateSettings({ hospital_info: hospitalInfo });

    return res.status(200).json({ success: true, logoUrl });
  } catch (err: any) {
    console.error('[uploadController]', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to upload logo.' });
  }
}
