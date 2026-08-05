/**
 * api/upload.ts — File upload handler (Function #4 of 4)
 *
 * Must be a separate function because bodyParser must be disabled
 * for multipart/form-data parsing. Vercel applies config.api.bodyParser
 * per-function — it cannot be toggled per-route inside a shared router.
 *
 * Handles:
 *   POST /api/admin/upload-logo
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "./_lib/supabase.js";
import Busboy from "busboy";
import path from "path";

// Disable Vercel's built-in body parser so busboy can read the raw stream.
export const config = {
  api: { bodyParser: false },
};

/** Parse multipart/form-data and resolve with the first file found. */
function parseMultipart(req: VercelRequest): Promise<{
  buffer: Buffer;
  mimetype: string;
  filename: string;
}> {
  return new Promise((resolve, reject) => {
    const bb = Busboy({
      headers: req.headers as Record<string, string>,
      limits: { fileSize: 5 * 1024 * 1024 },
    });

    let resolved = false;

    bb.on("file", (_fieldname, stream, info) => {
      const { filename, mimeType } = info;
      const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
      if (!allowed.includes(mimeType)) {
        stream.resume();
        return reject(new Error("Only PNG, JPG, JPEG, and WEBP files are allowed."));
      }
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => {
        if (!resolved) {
          resolved = true;
          resolve({ buffer: Buffer.concat(chunks), mimetype: mimeType, filename });
        }
      });
      stream.on("error", reject);
    });

    bb.on("error", reject);
    bb.on("finish", () => { if (!resolved) reject(new Error("No file found in request.")); });
    req.pipe(bb);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const file = await parseMultipart(req);

    // Ensure bucket exists
    const { data: buckets, error: bucketErr } = await supabase.storage.listBuckets();
    if (bucketErr) return res.status(500).json({ success: false, message: `Storage list error: ${bucketErr.message}` });

    if (!buckets?.some((b) => b.id === "hospital-logos")) {
      const { error: createErr } = await supabase.storage.createBucket("hospital-logos", {
        public: true,
        allowedMimeTypes: ["image/png", "image/jpeg", "image/jpg", "image/webp"],
        fileSizeLimit: 5 * 1024 * 1024,
      });
      if (createErr) return res.status(500).json({ success: false, message: `Bucket creation failed: ${createErr.message}` });
    }

    const ext = path.extname(file.filename) || ".png";
    const filename = `logo-${Date.now()}-${Math.random().toString(36).substr(2, 5)}${ext}`;

    const { error: uploadErr } = await supabase.storage.from("hospital-logos").upload(filename, file.buffer, {
      contentType: file.mimetype,
      cacheControl: "3600",
      upsert: true,
    });
    if (uploadErr) return res.status(500).json({ success: false, message: `Upload failed: ${uploadErr.message}` });

    const { data: publicUrlData } = supabase.storage.from("hospital-logos").getPublicUrl(filename);
    const logoUrl = publicUrlData?.publicUrl;
    if (!logoUrl) return res.status(500).json({ success: false, message: "Failed to generate public URL." });

    const { data: rows } = await supabase.from("settings").select("hospital_info").limit(1);
    const hospitalInfo = { ...(rows?.[0]?.hospital_info || {}), logoUrl };
    await supabase.from("settings").update({ hospital_info: hospitalInfo }).eq("id", 1);

    return res.status(200).json({ success: true, logoUrl });
  } catch (err: any) {
    console.error("[api/upload]", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to upload logo." });
  }
}
