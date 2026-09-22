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
import { v4 as uuidv4 } from 'uuid';

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const ALLOWED_EXT = ['.png', '.jpg', '.jpeg', '.webp'];
const EXT_BY_MIME: Record<string, string[]> = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/jpg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
};

// ponytail: magic-byte check is the real gate; mime+ext are defense-in-depth.
function hasValidMagicBytes(buffer: Buffer, mimetype: string): boolean {
  if (buffer.length < 12) return false;
  if (mimetype === 'image/png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  if (mimetype === 'image/jpeg' || mimetype === 'image/jpg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimetype === 'image/webp') {
    return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}

function safeExtension(filename: string, mimetype: string): string | null {
  const dot = filename.lastIndexOf('.');
  const ext = (dot >= 0 ? filename.slice(dot) : '').toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) return null;
  if (!EXT_BY_MIME[mimetype]?.includes(ext)) return null;
  return ext;
}

function parseMultipart(req: VercelRequest): Promise<{ buffer: Buffer; mimetype: string; filename: string }> {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers as Record<string, string>, limits: { fileSize: 5 * 1024 * 1024 } });
    let resolved = false;

    bb.on('file', (_fieldname, stream, info) => {
      const { filename, mimeType } = info;
      if (!ALLOWED_MIME.includes(mimeType)) {
        stream.resume();
        return reject(new Error('Invalid file type.'));
      }
      if (!safeExtension(filename, mimeType)) {
        stream.resume();
        return reject(new Error('Invalid file type.'));
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

    if (!hasValidMagicBytes(file.buffer, file.mimetype)) {
      return res.status(400).json({ success: false, message: 'Invalid file type.' });
    }
    const ext = safeExtension(file.filename, file.mimetype);
    if (!ext) {
      return res.status(400).json({ success: false, message: 'Invalid file type.' });
    }

    const { data: buckets, error: bucketErr } = await supabase.storage.listBuckets();
    if (bucketErr) {
      console.error('[uploadController] listBuckets failed:', bucketErr.message);
      return res.status(500).json({ success: false, message: 'Storage unavailable. Please try again.' });
    }

    if (!buckets?.some((b) => b.id === 'hospital-logos')) {
      const { error: createErr } = await supabase.storage.createBucket('hospital-logos', {
        public: false,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
        fileSizeLimit: 5 * 1024 * 1024,
      });
      if (createErr) {
        console.error('[uploadController] createBucket failed:', createErr.message);
        return res.status(500).json({ success: false, message: 'Storage unavailable. Please try again.' });
      }
    }

    const filename = `logo-${uuidv4()}${ext}`;

    const { error: uploadErr } = await supabase.storage.from('hospital-logos').upload(filename, file.buffer, {
      contentType: file.mimetype,
      cacheControl: '3600',
      upsert: false,
    });
    if (uploadErr) {
      console.error('[uploadController] upload failed:', uploadErr.message);
      return res.status(500).json({ success: false, message: 'Failed to upload logo.' });
    }

    const { data: signedData, error: signedErr } = await supabase.storage
      .from('hospital-logos')
      .createSignedUrl(filename, 7 * 24 * 3600);
    const logoUrl = signedData?.signedUrl;
    if (signedErr || !logoUrl) {
      console.error('[uploadController] signed URL failed:', signedErr?.message);
      return res.status(500).json({ success: false, message: 'Failed to upload logo.' });
    }

    const settings = await getSettings();
    const hospitalInfo = { ...(settings?.hospital_info || {}), logoUrl };
    await updateSettings({ hospital_info: hospitalInfo });

    return res.status(200).json({ success: true, logoUrl });
  } catch (err: any) {
    console.error('[uploadController]', err?.message || err);
    return res.status(500).json({ success: false, message: 'Failed to upload logo.' });
  }
}
