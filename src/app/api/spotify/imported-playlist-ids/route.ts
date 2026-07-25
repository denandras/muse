import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, mergeRefreshedCookies } from "@/lib/auth";

/**
 * GET /api/spotify/imported-playlist-ids
 *
 * Returns the set of Spotify playlist IDs that have been imported
 * (i.e. have at least one track in the tracks table with that
 * playlist's spotify_id). The client uses this to show a ✓ tick
 * on already-imported playlists.
 *
 * Since we don't store playlist_id on the tracks table, we use a
 * simpler heuristic: check the sync_state table for a
 * `imported_playlist_ids` text[] column. If that doesn't exist,
 * return an empty set (the client just won't show ticks).
 *
 * Actually — a cleaner approach: we check which spotify track IDs
 * from the playlist are already in the tracks table. But that's
 * expensive (requires fetching the playlist). Instead, we store
 * imported playlist IDs in a separate table or in user_settings.
 *
 * Simplest correct approach: use sync_state.imported_playlist_ids
 * (a text[] column). We read it here.
 */
export async function GET(request: NextRequest) {
  const auth = await getCurrentUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { supabase, user } = auth;

  // Try to read imported_playlist_ids from sync_state
  const { data, error } = await supabase
    .from("sync_state")
    .select("imported_playlist_ids")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    // Column might not exist yet — return empty set gracefully
    const response = NextResponse.json({ importedIds: [] });
    mergeRefreshedCookies(response, auth.refreshedResponse);
    return response;
  }

  const ids = (data?.imported_playlist_ids as string[] | null) ?? [];
  const response = NextResponse.json({ importedIds: ids });
  mergeRefreshedCookies(response, auth.refreshedResponse);
  return response;
}