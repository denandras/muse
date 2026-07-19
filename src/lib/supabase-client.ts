import { createClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client using the anon key.
 * Respects RLS — use in client components only.
 */
export const supabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
);