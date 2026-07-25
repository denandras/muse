import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getValidAccessToken, refreshOn401, mergeRefreshedCookies } from "@/lib/auth";

/**
 * GET /api/spotify/playlist-tracks?playlist_id=xxx
 *
 * Fetches all tracks from a Spotify playlist (100/page, max 20 pages = 2000 tracks).
 * Returns a lightweight array of { id, uri, name, artist, album, duration_ms, cover_url }
 * suitable for playback (playFromList) and display.
 *
 * This is separate from import-playlist because the user wants to preview/play
 * without committing to an import.
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

  interface PlaylistTrack {
    track: {
      id: string;
      uri: string;
      name: string;
      duration_ms: number;
      artists: Array<{ name: string }>;
      album: { id: string; name: string; images: Array<{ url: string }> };
    } | null;
  }

  interface PlaylistTracksPage {
    items: PlaylistTrack[];
    total: number;
    next: string | null;
  }

  const fetchPage = async (token: string, offset: number) => {
    const url = `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=100&offset=${offset}`;
    return fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  };

  const tracks: Array<{
    id: string;
    uri: string;
    name: string;
    artist: string;
    album: string;
    duration_ms: number;
    cover_url: string | null;
  }> = [];

  let offset = 0;
  let hasMore = true;
  let apiCalls = 0;
  const MAX_API_CALLS = 20;

  while (hasMore && apiCalls < MAX_API_CALLS) {
    let res = await fetchPage(accessToken, offset);

    if (res.status === 401) {
      const refreshed = await refreshOn401(request);
      if (refreshed.token) {
        accessToken = refreshed.token;
        tokenRefreshResponse = refreshed.refreshedResponse;
        res = await fetchPage(accessToken, offset);
      }
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Spotify API error ${res.status}`, detail: text.slice(0, 200) },
        { status: res.status }
      );
    }

    const data = (await res.json()) as PlaylistTracksPage;
    for (const item of data.items ?? []) {
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

    apiCalls++;
    if (data.next && data.items && data.items.length > 0) {
      offset += 100;
    } else {
      hasMore = false;
    }
  }

  const response = NextResponse.json({ tracks });
  mergeRefreshedCookies(response, tokenRefreshResponse);
  return response;
}