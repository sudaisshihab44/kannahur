import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Ensure env vars are loaded when this module is first imported
dotenv.config({ path: ".env.local" });

export const supabase = createClient(
  // Accept either SUPABASE_URL (explicit server-only) or VITE_SUPABASE_URL
  (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
