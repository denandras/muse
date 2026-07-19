import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the service role key.
 * Bypasses RLS — use only in server API routes and server components.
 */
export const supabaseServer = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);