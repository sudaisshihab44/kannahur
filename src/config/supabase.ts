/**
 * src/config/supabase.ts
 *
 * Browser-side Supabase client — uses the public anon key.
 * Safe to bundle into the frontend.
 *
 * Usage: import { supabase } from '../config/supabase'
 */
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || '',
  import.meta.env.VITE_SUPABASE_ANON_KEY || ''
);
