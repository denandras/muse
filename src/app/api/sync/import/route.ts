import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getValidAccessToken, mergeRefreshedCookies } from "@/lib/auth";
import {
  runFullImport,
  type ImportProgressEvent,
  type ImportResult,
} from "@/lib/spotify-import";

/**
 * POST /api/sync/import
 *
 * Unified Spotify library import. Streams NDJSON progress events to the
 * client as the import runs — one JSON object per line, each a ProgressEvent
 * or a final result/error line.
 *
 * Query params:
 *   ?albumsOnly=true   skip liked songs
 *   ?likedOnly=true    skip saved albums (and album tracks)
 *
 * Response body (Content-Type: application/x-ndjson):
 *   {"phase":"liked","page":1,"total":1234,"processed":50,"label":"…"}
 *   {"phase":"liked","page":2,...}
 *   {"phase":"done",...}
 *   {"result":{...ImportResult}}
 * or on error:
 *   {"error":"...","phase":"error"}
 *
 * The client reads this with a ReadableStream reader and parses each line.
 */
// Hobby plan allows up to 300s (5 min) with Fluid compute (default).
// Sync of a large library can take a couple minutes.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const auth = await getCurrentUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { supabase, user } = auth;

  // Ensure we have a valid (non-expired) Spotify access token.
  const { token: accessToken, refreshedResponse: tokenRefreshResponse } =
    await getValidAccessToken(request);
  if (!accessToken) {
    return NextResponse.json(
      { error: "Spotify token expired — please reconnect" },
      { status: 401 }
    );
  }

  const sp = request.nextUrl.searchParams;
  const albumsOnly = sp.get("albumsOnly") === "true";
  const likedOnly = sp.get("likedOnly") === "true";
  // Batched album sync: client sends albumOffset to resume from where the
  // previous batch stopped. albumMaxPages caps how many pages (of 50 albums
  // each) this invocation processes — prevents 524 server timeout on large
  // libraries.
  const albumOffset = parseInt(sp.get("albumOffset") ?? "0", 10) || 0;
  const albumMaxPages = parseInt(sp.get("albumMaxPages") ?? "0", 10) || undefined;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };

      const onProgress = (event: ImportProgressEvent) => {
        send(event as unknown as Record<string, unknown>);
      };

      try {
        const result: ImportResult = await runFullImport(
          supabase,
          accessToken,
          user,
          onProgress,
          { albumsOnly, likedOnly, albumStartOffset: albumOffset, albumMaxPages }
        );
        send({ result });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Import failed unexpectedly";
        send({ phase: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  const response = new NextResponse(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });

  // If the token was refreshed, persist the new cookies on this
  // streaming response too.
  if (tokenRefreshResponse) {
    const setCookies = tokenRefreshResponse.headers.getSetCookie?.() ?? [];
    for (const cookie of setCookies) {
      response.headers.append("set-cookie", cookie);
    }
  }

  return response;
}

/**
 * GET /api/sync/import
 * Returns the current sync_state row so the UI can show last-sync times
 * and totals without triggering an import.
 */
export async function GET(request: NextRequest) {
  const auth = await getCurrentUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { supabase, user } = auth;
  const { data, error } = await supabase
    .from("sync_state")
    .select(
      "liked_tracks_synced_at, saved_albums_synced_at, total_tracks_imported, total_albums_imported"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch sync state", detail: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({
    sync_state:
      data ?? {
        liked_tracks_synced_at: null,
        saved_albums_synced_at: null,
        total_tracks_imported: 0,
        total_albums_imported: 0,
      },
  });
}