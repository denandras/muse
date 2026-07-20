import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getValidAccessToken, refreshOn401, mergeRefreshedCookies } from "@/lib/auth";

/**
 * GET /api/spotify/playlists
 * Lists the current user's Spotify playlists (owned + followed).
 * Fetches the first 50 playlists (one API call).
 */
export async function GET(request: NextRequest) {
  const auth = await getCurrentUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get a token — may be expired, we'll refresh on 401
  const { token: accessToken, refreshedResponse: tokenRefreshResponse } =
    await getValidAccessToken(request);
  if (!accessToken) {
    return NextResponse.json(
      { error: "Spotify token expired — please reconnect" },
      { status: 401 }
    );
  }

  interface SpotifyPlaylist {
    id: string;
    name: string;
    uri: string;
    images: Array<{ url: string }>;
    owner: { id: string; display_name: string | null };
    tracks: { total: number };
    public: boolean;
    collaborative: boolean;
    description: string | null;
  }

  interface PlaylistsPage {
    items: SpotifyPlaylist[];
    total: number;
    next: string | null;
    offset: number;
  }

  let activeToken = accessToken;
  let refreshResponse = tokenRefreshResponse;

  const fetchPlaylists = async (token: string) => {
    const url = `https://api.spotify.com/v1/me/playlists?limit=50&offset=0`;
    return fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  };

  let res = await fetchPlaylists(activeToken);

  // If 401, refresh the token and retry once
  if (res.status === 401) {
    const refreshed = await refreshOn401(request);
    if (refreshed.token) {
      activeToken = refreshed.token;
      refreshResponse = refreshed.refreshedResponse;
      res = await fetchPlaylists(activeToken);
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `Spotify API error ${res.status}`, detail: text.slice(0, 200) },
      { status: res.status }
    );
  }

  const data = (await res.json()) as PlaylistsPage;
  // Guard against Spotify returning null items array or null fields
  const rawItems = Array.isArray(data?.items) ? data.items : [];
  const all = rawItems.map((pl) => ({
    id: pl.id,
    name: pl.name,
    uri: pl.uri,
    images: Array.isArray(pl?.images) ? pl.images : [],
    owner: pl?.owner ?? null,
    tracks: pl?.tracks ?? null,
    public: pl?.public ?? false,
    collaborative: pl?.collaborative ?? false,
    description: pl?.description ?? null,
  }));

  const response = NextResponse.json({
    playlists: all,
    total: data.total,
    hasMore: !!data.next,
  });
  mergeRefreshedCookies(response, refreshResponse);
  return response;
}