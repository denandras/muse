import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { importSavedAlbums, type ImportProgressEvent } from "@/lib/spotify-import";

/**
 * POST /api/spotify/import-albums
 * Legacy single-source endpoint. Streams NDJSON progress.
 * Prefer POST /api/sync/import for the unified pipeline.
 */
export async function POST(request: NextRequest) {
  const auth = await getCurrentUser(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { supabase, accessToken, user, refreshedResponse } = auth;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };
      try {
        const res = await importSavedAlbums(
          supabase,
          accessToken,
          user,
          (ev: ImportProgressEvent) =>
            send(ev as unknown as Record<string, unknown>),
          {}
        );
        send({ result: res });
      } catch (err) {
        send({
          phase: "error",
          error: err instanceof Error ? err.message : "Import failed",
        });
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
  if (refreshedResponse) {
    const setCookies = refreshedResponse.headers.getSetCookie?.() ?? [];
    for (const cookie of setCookies) {
      response.headers.append("set-cookie", cookie);
    }
  }
  return response;
}