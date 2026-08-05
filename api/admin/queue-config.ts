import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../_lib/supabase.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const config = { ...req.body };

    if (config.tokenPrefix !== undefined) config.tokenPrefix = config.tokenPrefix.trim();
    if (config.dailyTokenReset !== undefined) config.dailyTokenReset = !!config.dailyTokenReset;
    if (config.queueStartNumber !== undefined) config.queueStartNumber = parseInt(config.queueStartNumber) || 1;
    if (config.emergencyQueue !== undefined) config.emergencyQueue = !!config.emergencyQueue;
    if (config.walkInQueue !== undefined) config.walkInQueue = !!config.walkInQueue;
    if (config.maxQueueSize !== undefined) config.maxQueueSize = parseInt(config.maxQueueSize) || 100;
    if (config.defaultWaitingTime !== undefined) config.defaultWaitingTime = parseInt(config.defaultWaitingTime) || 15;
    if (config.maxDailyTokens !== undefined) config.maxDailyTokens = parseInt(config.maxDailyTokens) || 500;
    if (config.autoSkipTimeout !== undefined) config.autoSkipTimeout = parseInt(config.autoSkipTimeout) || 180;
    if (config.maxWaitingTime !== undefined) config.maxWaitingTime = parseInt(config.maxWaitingTime) || 120;
    if (config.minWaitTimeNotificationThreshold !== undefined) {
      config.minWaitTimeNotificationThreshold = parseInt(config.minWaitTimeNotificationThreshold) || 5;
    }
    if (config.enableWhatsAppUpdates !== undefined) config.enableWhatsAppUpdates = !!config.enableWhatsAppUpdates;

    await supabase.from("settings").update({ config }).eq("id", 1);
    return res.status(200).json({ success: true, config });
  } catch (err: any) {
    console.error("[/api/admin/queue-config]", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}
