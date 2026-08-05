import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../_lib/supabase.js";
import multer from "multer";
import path from "path";

// Multer with memory storage — compatible with Vercel serverless (no disk access needed)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PNG, JPG, JPEG, and WEBP files are allowed."));
    }
  },
});

// Promisify multer middleware for use in async handlers
function runMiddleware(req: any, res: any, fn: Function): Promise<void> {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) return reject(result);
      resolve(result);
    });
  });
}

export const config = {
  api: {
    bodyParser: false, // Required: let multer handle the multipart body
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    await runMiddleware(req, res, upload.single("logo"));

    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({ success: false, message: "No image file provided." });
    }

    // Ensure bucket exists
    const { data: buckets, error: bucketErr } = await supabase.storage.listBuckets();
    if (bucketErr) {
      return res.status(500).json({ success: false, message: `Storage list error: ${bucketErr.message}` });
    }

    if (!buckets?.some((b) => b.id === "hospital-logos")) {
      const { error: createErr } = await supabase.storage.createBucket("hospital-logos", {
        public: true,
        allowedMimeTypes: ["image/png", "image/jpeg", "image/jpg", "image/webp"],
        fileSizeLimit: 5242880,
      });
      if (createErr) {
        return res.status(500).json({ success: false, message: `Bucket creation failed: ${createErr.message}` });
      }
    }

    const extension = path.extname(file.originalname) || ".png";
    const filename = `logo-${Date.now()}-${Math.random().toString(36).substr(2, 5)}${extension}`;

    const { error: uploadErr } = await supabase.storage
      .from("hospital-logos")
      .upload(filename, file.buffer, {
        contentType: file.mimetype,
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadErr) {
      return res.status(500).json({ success: false, message: `Upload failed: ${uploadErr.message}` });
    }

    const { data: publicUrlData } = supabase.storage.from("hospital-logos").getPublicUrl(filename);
    const logoUrl = publicUrlData?.publicUrl;

    if (!logoUrl) {
      return res.status(500).json({ success: false, message: "Failed to generate public URL." });
    }

    // Save logo URL into settings
    const { data: rows } = await supabase.from("settings").select("hospital_info").limit(1);
    const hospitalInfo = { ...(rows?.[0]?.hospital_info || {}), logoUrl };
    await supabase.from("settings").update({ hospital_info: hospitalInfo }).eq("id", 1);

    return res.status(200).json({ success: true, logoUrl });
  } catch (err: any) {
    console.error("[/api/admin/upload-logo]", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to upload logo." });
  }
}
