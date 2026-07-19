import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, mergeRefreshedCookies } from "@/lib/auth";

/**
 * GET /api/spotify/playlists
 * Lists the current user's Spotify playlists (owned + followed).
 * Paginates 50 at a time until all are collected.
 */
export async function GET(request: NextRequest) {
  const auth = await getCurrentUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { accessToken, refreshedResponse } = auth;

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

  const all: SpotifyPlaylist[] = [];
  let offset = 0;
  const limit = 50;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = `https://api.spotify.com/v1/me/playlists?limit=${limit}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Spotify API error ${res.status}`, detail: text.slice(0, 200) },
        { status: res.status }
      );
    }

    const data = (await res.json()) as PlaylistsPage;
    all.push(...(data.items ?? []));
    if (!data.next) break;
    offset += limit;
  }

  const response = NextResponse.json({ playlists: all, total: all.length });
  mergeRefreshedCookies(response, refreshedResponse);
  return response;
}