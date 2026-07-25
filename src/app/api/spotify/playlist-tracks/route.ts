import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getValidAccessToken, refreshOn401, mergeRefreshedCookies } from "@/lib/auth";

/**
 * GET /api/spotify/playlist-tracks?playlist_id=xxx
 *
 * Fetches all tracks from a Spotify playlist.
 *
 * Spotify has two relevant endpoints:
 * - GET /playlists/{id}/items — the new endpoint, but ONLY works for playlists
 *   the user owns or collaborates on. Followed playlists return 403.
 * - GET /playlists/{id} — returns playlist metadata, sometimes with tracks inline.
 *
 * Strategy: try /items first (works for owned/collaborative). If 403, the playlist
 * is followed — return an empty tracks array with a flag so the UI can show
 * "followed playlists can't be previewed" instead of an error.
 *
 * Returns: { tracks: Array<{id,uri,name,artist,album,duration_ms,cover_url}> }
 */
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const auth = await getCurrentUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const playlistId = request.nextUrl.searchParams.get("playlist_id");
  if (!playlistId) {
    return NextResponse.json(
      { error: "playlist_id query param is required" },
      { status: 400 }
    );
  }

  let { token: accessToken, refreshedResponse: tokenRefreshResponse } =
    await getValidAccessToken(request);
  if (!accessToken) {
    return NextResponse.json(
      { error: "Spotify token expired — please reconnect" },
      { status: 401 }
    );
  }

  interface TrackItem {
    track: {
      id: string;
      uri: string;
      name: string;
      duration_ms: number;
      artists: Array<{ name: string }>;
      album: { id: string; name: string; images: Array<{ url: string }> } | null;
    } | null;
  }

  interface ItemsPage {
    items: TrackItem[];
    total: number;
    next: string | null;
    offset: number;
    limit: number;
  }

  const extractTracks = (items: TrackItem[]) => {
    const tracks: Array<{
      id: string;
      uri: string;
      name: string;
      artist: string;
      album: string;
      duration_ms: number;
      cover_url: string | null;
    }> = [];
    for (const item of items) {
      if (!item.track) continue;
      const t = item.track;
      tracks.push({
        id: t.id,
        uri: t.uri,
        name: t.name,
        artist: t.artists.map((a) => a.name).join(", "),
        album: t.album?.name ?? "",
        duration_ms: t.duration_ms,
        cover_url: t.album?.images?.[0]?.url ?? null,
      });
    }
    return tracks;
  };

  // Use GET /playlists/{id}/items — the new (non-deprecated) endpoint.
  // Only works for playlists the user owns or collaborates on.
  // Followed playlists will 403 — we handle that gracefully.
  const fetchPage = async (url: string, token: string) => {
    return fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  };

  const firstUrl = `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=100&offset=0`;

  let res = await fetchPage(firstUrl, accessToken);

  if (res.status === 401) {
    const refreshed = await refreshOn401(request);
    if (refreshed.token) {
      accessToken = refreshed.token;
      tokenRefreshResponse = refreshed.refreshedResponse;
      res = await fetchPage(firstUrl, accessToken);
    }
  }

  if (res.status === 403) {
    // Followed playlist — Spotify's /items endpoint only works for owned/
    // collaborative playlists. Return empty tracks so the UI doesn't crash.
    const response = NextResponse.json({
      tracks: [],
      followed: true,
    });
    mergeRefreshedCookies(response, tokenRefreshResponse);
    return response;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[playlist-tracks] Spotify API error:", res.status, "playlist:", playlistId, "body:", text.slice(0, 500));
    return NextResponse.json(
      { error: `Spotify API error ${res.status}`, detail: text.slice(0, 200) },
      { status: res.status }
    );
  }

  const firstData = (await res.json()) as ItemsPage;
  const tracks = extractTracks(firstData.items ?? []);

  // Follow next URLs for pagination
  let nextUrl: string | null = firstData.next;
  let apiCalls = 1;
  const MAX_API_CALLS = 20;

  while (nextUrl && apiCalls < MAX_API_CALLS) {
    let pageRes = await fetchPage(nextUrl, accessToken);

    if (pageRes.status === 401) {
      const refreshed = await refreshOn401(request);
      if (refreshed.token) {
        accessToken = refreshed.token;
        tokenRefreshResponse = refreshed.refreshedResponse;
        pageRes = await fetchPage(nextUrl, accessToken);
      }
    }

    if (!pageRes.ok) {
      const text = await pageRes.text().catch(() => "");
      console.error("[playlist-tracks] pagination error:", pageRes.status, "body:", text.slice(0, 200));
      break;
    }

    const pageData = (await pageRes.json()) as ItemsPage;
    tracks.push(...extractTracks(pageData.items ?? []));
    apiCalls++;
    nextUrl = pageData.next;
  }

  const response = NextResponse.json({ tracks });
  mergeRefreshedCookies(response, tokenRefreshResponse);
  return response;
}