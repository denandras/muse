import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase browser client (Client Component).
 * Uses the publishable (anon) key — RLS policies gate access.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}