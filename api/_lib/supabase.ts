import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client using the service role key.
// Only imported by api/ serverless functions — never bundled into browser code.
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
