/**
 * src/lib/supabase.ts
 *
 * Shared Supabase client singleton for the browser bundle.
 * Import from here instead of calling createClient() directly
 * in each component — avoids multiple client instances.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  || '';
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnon);
