import type { VercelRequest, VercelResponse } from "@vercel/node";
import { computeWaitingQueue } from "./_lib/queue.js";
import { mapToken } from "./_lib/mappers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const { departmentId, doctorId } = req.query as Record<string, string>;

  try {
    const waitingTokens = await computeWaitingQueue(departmentId, doctorId);
    const enriched = waitingTokens.map((token: any) => mapToken(token));
    return res.status(200).json({ success: true, tokens: enriched });
  } catch (err: any) {
    console.error("[/api/queue]", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}
