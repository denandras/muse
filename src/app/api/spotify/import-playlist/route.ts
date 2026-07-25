import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getValidAccessToken, refreshOn401, mergeRefreshedCookies } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase-server";

/**
 * POST /api/spotify/import-playlist
 * Body: { playlist_id: string, genreIds?: string[], moodIds?: string[] }
 *
 * Fetches ALL tracks from the given Spotify playlist (paginating 100/page)
 * and upserts them into the tracks table (is_liked=false). Optionally
 * assigns the given genre/mood IDs to every imported track.
 *
 * Re-importing (user pushes import twice, or updates an imported playlist
 * because they saved new tracks since last import) is idempotent: the
 * (user_id, spotify_id) unique constraint collapses duplicates, and genre/
 * mood tags are upserted with ignoreDuplicates so existing tags stay.
 *
 * Returns: { imported: number, total: number, skipped: number }
 */
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const auth = await getCurrentUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { supabase, user } = auth;

  // Get a token — may be expired, we'll refresh on 401
  let { token: accessToken, refreshedResponse: tokenRefreshResponse } =
    await getValidAccessToken(request);
  if (!accessToken) {
    return NextResponse.json(
      { error: "Spotify token expired — please reconnect" },
      { status: 401 }
    );
  }

  let body: { playlist_id?: string; genreIds?: string[]; moodIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const playlistId = body.playlist_id;
  if (!playlistId) {
    return NextResponse.json(
      { error: "playlist_id is required" },
      { status: 400 }
    );
  }

  const genreIds = body.genreIds ?? [];
  const moodIds = body.moodIds ?? [];

  interface PlaylistTrack {
    item: {
      id: string;
      uri: string;
      name: string;
      type: string;
      duration_ms: number;
      artists: Array<{ name: string }>;
      album: { id: string; name: string; images: Array<{ url: string }> } | null;
    } | null;
    added_at: string;
  }

  interface ItemsPage {
    items: PlaylistTrack[];
    total: number;
    next: string | null;
    offset: number;
  }

  // Use GET /playlists/{id}/items — the new (non-deprecated) endpoint.
  // Only works for playlists the user owns or collaborates on.
  // Followed playlists will 403 — we return an error to the client.
  const fetchUrl = async (url: string, token: string) => {
    return fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  };

  const firstUrl = `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=100&offset=0`;

  const trackRows: Array<Record<string, unknown>> = [];
  let total = 0;
  let apiCalls = 0;
  const MAX_API_CALLS = 40; // safety valve

  // Fetch first page
  let res = await fetchUrl(firstUrl, accessToken);

  if (res.status === 401) {
    const refreshed = await refreshOn401(request);
    if (refreshed.token) {
      accessToken = refreshed.token;
      tokenRefreshResponse = refreshed.refreshedResponse;
      res = await fetchUrl(firstUrl, accessToken);
    }
  }

  if (res.status === 403) {
    const response = NextResponse.json(
      { error: "This is a followed playlist. Spotify only allows importing playlists you own or collaborate on." },
      { status: 403 }
    );
    mergeRefreshedCookies(response, tokenRefreshResponse);
    return response;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `Spotify API error ${res.status}`, detail: text.slice(0, 200) },
      { status: res.status }
    );
  }

  const firstData = (await res.json()) as ItemsPage;
  total = firstData.total;

  const processItems = (items: PlaylistTrack[]) => {
    for (const item of items) {
      if (!item.item) continue;
      const t = item.item;
      if (t.type && t.type !== "track") continue;
      trackRows.push({
        user_id: user.id,
        spotify_id: t.id,
        spotify_uri: t.uri,
        title: t.name,
        artist: t.artists.map((a) => a.name).join(", "),
        album_title: t.album?.name ?? null,
        album_spotify_id: t.album?.id ?? null,
        album_cover_url: t.album?.images?.[0]?.url ?? null,
        duration_ms: t.duration_ms,
        is_liked: false,
        added_at: item.added_at,
      });
    }
  };

  processItems(firstData.items ?? []);
  apiCalls++;

  // Follow next URLs for pagination
  let nextUrl: string | null = firstData.next;

  while (nextUrl && apiCalls < MAX_API_CALLS) {
    let pageRes = await fetchUrl(nextUrl, accessToken);

    if (pageRes.status === 401) {
      const refreshed = await refreshOn401(request);
      if (refreshed.token) {
        accessToken = refreshed.token;
        tokenRefreshResponse = refreshed.refreshedResponse;
        pageRes = await fetchUrl(nextUrl, accessToken);
      }
    }

    if (!pageRes.ok) {
      const text = await pageRes.text().catch(() => "");
      console.error("[import-playlist] pagination error:", pageRes.status, text.slice(0, 200));
      break;
    }

    const pageData = (await pageRes.json()) as ItemsPage;
    processItems(pageData.items ?? []);
    apiCalls++;
    nextUrl = pageData.next;
  }

  if (trackRows.length === 0) {
    const response = NextResponse.json({
      imported: 0,
      total,
      skipped: 0,
    });
    mergeRefreshedCookies(response, tokenRefreshResponse);
    return response;
  }

  // Upsert tracks in batches of 200
  const BATCH = 200;
  let inserted = 0;
  const insertedTrackIds: string[] = [];

  for (let i = 0; i < trackRows.length; i += BATCH) {
    const batch = trackRows.slice(i, i + BATCH);

    // Check which already exist
    const spotifyIds = batch.map((r) => r.spotify_id as string);
    const existingIds = new Set<string>();
    for (let j = 0; j < spotifyIds.length; j += BATCH) {
      const chunk = spotifyIds.slice(j, j + BATCH);
      const { data: existing } = await supabase
        .from("tracks")
        .select("spotify_id")
        .eq("user_id", user.id)
        .in("spotify_id", chunk);
      for (const row of existing ?? []) existingIds.add(row.spotify_id);
    }

    const { error } = await supabase
      .from("tracks")
      .upsert(batch, { onConflict: "user_id,spotify_id" });

    if (error) {
      console.error("[import-playlist] upsert error:", error.message);
    }

    // Track inserted (new) tracks
    for (const row of batch) {
      const sid = row.spotify_id as string;
      if (!existingIds.has(sid)) {
        inserted++;
      }
      insertedTrackIds.push(sid);
    }
  }

  // Get the internal UUIDs for all upserted tracks (needed for tag assignment)
  const trackInternalIds: string[] = [];
  for (let i = 0; i < insertedTrackIds.length; i += BATCH) {
    const chunk = insertedTrackIds.slice(i, i + BATCH);
    const { data } = await supabase
      .from("tracks")
      .select("id, spotify_id")
      .eq("user_id", user.id)
      .in("spotify_id", chunk);
    for (const row of data ?? []) trackInternalIds.push(row.id);
  }

  // Record this playlist as imported (for the ✓ tick on the playlists page).
  // We store it in sync_state.imported_playlist_ids (text[]). If the column
  // doesn't exist or the update fails, we silently skip — the import itself
  // already succeeded.
  try {
    // First try to read the current imported_playlist_ids
    const { data: stateRow } = await supabase
      .from("sync_state")
      .select("imported_playlist_ids")
      .eq("user_id", user.id)
      .maybeSingle();

    const existingIds = (stateRow?.imported_playlist_ids as string[] | null) ?? [];
    if (!existingIds.includes(playlistId)) {
      const updatedIds = [...existingIds, playlistId];
      await supabase
        .from("sync_state")
        .upsert(
          { user_id: user.id, imported_playlist_ids: updatedIds },
          { onConflict: "user_id" }
        );
    }
  } catch {
    // Column might not exist yet — not critical, the import succeeded
  }

  // Assign genres/moods if provided.
  // Re-importing with different tags is fine: upsert with ignoreDuplicates
  // keeps existing tags and adds new ones. The user can layer tags across
  // multiple imports without losing previous assignments.
  if ((genreIds.length > 0 || moodIds.length > 0) && trackInternalIds.length > 0) {
    if (genreIds.length > 0) {
      const genreRows: Array<{ track_id: string; genre_id: string }> = [];
      for (const tid of trackInternalIds) {
        for (const gid of genreIds) {
          genreRows.push({ track_id: tid, genre_id: gid });
        }
      }
      // Insert in batches, ignore duplicates
      for (let i = 0; i < genreRows.length; i += BATCH) {
        await supabase
          .from("track_genres")
          .upsert(genreRows.slice(i, i + BATCH), {
            onConflict: "track_id,genre_id",
            ignoreDuplicates: true,
          });
      }
    }

    if (moodIds.length > 0) {
      const moodRows: Array<{ track_id: string; mood_id: string }> = [];
      for (const tid of trackInternalIds) {
        for (const mid of moodIds) {
          moodRows.push({ track_id: tid, mood_id: mid });
        }
      }
      for (let i = 0; i < moodRows.length; i += BATCH) {
        await supabase
          .from("track_moods")
          .upsert(moodRows.slice(i, i + BATCH), {
            onConflict: "track_id,mood_id",
            ignoreDuplicates: true,
          });
      }
    }
  }

  const response = NextResponse.json({
    imported: inserted,
    total: trackRows.length,
    skipped: trackRows.length - inserted,
    taggedWith: {
      genres: genreIds.length,
      moods: moodIds.length,
    },
  });
  mergeRefreshedCookies(response, tokenRefreshResponse);
  return response;
}