import type { VercelRequest, VercelResponse } from "@vercel/node";

// Health-check endpoint — GET /api
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ status: "ok", service: "InclusyQ API", version: "2.0.0" });
}
