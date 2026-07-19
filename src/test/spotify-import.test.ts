/**
 * Unit tests for the Spotify import pipeline (src/lib/spotify-import.ts).
 *
 * Mocks `fetch` for Spotify Web API responses and a fake Supabase client
 * for DB upserts/selects. Exercises:
 *   - Cursor pagination across multiple pages
 *   - Dedup by (user_id, spotify_id) via upsert onConflict
 *   - Incremental stop after 2 consecutive all-existing pages
 *   - 429 rate-limit retry honoring Retry-After
 *   - Album-track extraction from saved albums
 *   - runFullImport end-to-end with both phases
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  importLikedTracks,
  importSavedAlbums,
  runFullImport,
} from "@/lib/spotify-import";

const USER = { id: "user-1", spotify_id: "spotify-1" } as any;

// ──────────────────────────────────────────────────────────────────────────────
// Fake Supabase client
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Tracks rows "in the DB" so select probes reflect prior upserts.
 * Keyed by table name; each is a Map of `${user_id}:${spotify_id}` -> row.
 */
const tables: Record<string, Map<string, any>> = {};

function resetTables() {
  tables.tracks = new Map();
  tables.albums = new Map();
  tables.sync_state = new Map();
}

function makeSupabase() {
  const supabase: any = {
    from(table: string) {
      // Builder accumulates state; upsert runs immediately, select is
      // resolved via .then (thenable) since the real client awaits it.
      const state: {
        _eq: Record<string, any>;
        _in: Record<string, any[]>;
        _select: string | null;
        _maybeSingle: boolean;
      } = {
        _eq: {},
        _in: {},
        _select: null,
        _maybeSingle: false,
      };

      const builder: any = {
        eq(col: string, val: any) {
          state._eq[col] = val;
          return builder;
        },
        in(col: string, vals: any[]) {
          state._in[col] = vals;
          return builder;
        },
        select(cols?: string) {
          state._select = cols ?? "*";
          return builder;
        },
        maybeSingle() {
          state._maybeSingle = true;
          return builder;
        },
        async upsert(
          input: any | any[],
          _opts?: { onConflict?: string }
        ) {
          const t = tables[table] ?? (tables[table] = new Map());
          // sync_state upserts a single object; tracks/albums upsert arrays.
          const rows = Array.isArray(input) ? input : [input];
          for (const r of rows) {
            // sync_state rows are keyed by user_id only; other tables by
            // user_id:spotify_id.
            const key =
              table === "sync_state"
                ? r.user_id
                : `${r.user_id}:${r.spotify_id}`;
            const existing = t.get(key);
            if (existing && r.is_liked === false && existing.is_liked === true) {
              // Don't clobber a liked track with a non-liked album track.
              t.set(key, { ...existing, ...r, is_liked: true });
            } else {
              t.set(key, { ...existing, ...r });
            }
          }
          return { data: null, error: null };
        },
        // Thenable: awaited select queries resolve here.
        async then(resolve: any) {
          const t = tables[table] ?? (tables[table] = new Map());
          let rows = Array.from(t.values());
          for (const [col, val] of Object.entries(state._eq)) {
            rows = rows.filter((r) => r[col] === val);
          }
          for (const [col, vals] of Object.entries(state._in)) {
            rows = rows.filter((r) => (vals as any[]).includes(r[col]));
          }
          if (state._select && state._select !== "*") {
            const cols = state._select.split(",").map((c: string) => c.trim());
            rows = rows.map((r: any) => {
              const out: any = {};
              for (const c of cols) out[c] = r[c];
              return out;
            });
          }
          const result = state._maybeSingle ? rows[0] ?? null : rows;
          return resolve({ data: result, error: null });
        },
      };
      return builder;
    },
  };
  return supabase;
}

// ──────────────────────────────────────────────────────────────────────────────
// Fetch mocking
// ──────────────────────────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;

type FetchHandler = (url: string) => Response | Promise<Response>;

function mockFetch(handler: FetchHandler) {
  globalThis.fetch = ((url: string | URL | Request) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    return handler(urlStr);
  }) as typeof fetch;
}

function jsonRes(body: any, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers to build Spotify pages
// ──────────────────────────────────────────────────────────────────────────────

function likedTrackPage(
  ids: string[],
  total: number,
  after: string | null,
  next: string | null
) {
  return {
    items: ids.map((id, i) => ({
      added_at: `2024-01-${String(10 + i).padStart(2, "0")}T00:00:00Z`,
      track: {
        id,
        uri: `spotify:track:${id}`,
        name: `Track ${id}`,
        duration_ms: 180000 + i,
        album: { id: `alb-${id}`, name: `Album ${id}`, images: [{ url: `https://img/${id}` }] },
        artists: [{ name: `Artist ${id}` }],
      },
    })),
    total,
    next,
    after,
    cursors: { after, before: null },
  };
}

function albumPage(
  albumIds: string[],
  total: number,
  offset: number,
  next: string | null
) {
  return {
    items: albumIds.map((id, i) => ({
      added_at: `2024-02-${String(10 + i).padStart(2, "0")}T00:00:00Z`,
      album: {
        id,
        uri: `spotify:album:${id}`,
        name: `Album ${id}`,
        album_type: "album",
        release_date: "2024-01-01",
        images: [{ url: `https://img/${id}` }],
        artists: [{ name: `Artist ${id}` }],
      },
    })),
    total,
    next,
    offset,
  };
}

function albumTracksPage(trackIds: string[], next: string | null) {
  return {
    items: trackIds.map((id) => ({
      id,
      uri: `spotify:track:${id}`,
      name: `Track ${id}`,
      duration_ms: 200000,
      artists: [{ name: `Artist ${id}` }],
    })),
    total: trackIds.length,
    next,
  };
}

// ──────────────────────────────────────────────────────────────────────────────

describe("spotify-import", () => {
  beforeEach(() => {
    resetTables();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("paginates liked tracks with cursor and upserts all pages", async () => {
    const pages = [
      likedTrackPage(["t1", "t2", "t3"], 6, "cursor-1", "next-url-1"),
      likedTrackPage(["t4", "t5", "t6"], 6, "cursor-2", null),
    ];
    let call = 0;
    mockFetch((url) => {
      if (url.startsWith("https://api.spotify.com/v1/me/tracks")) {
        return jsonRes(pages[call++]);
      }
      return jsonRes({}, 404);
    });

    const supabase = makeSupabase();
    const events: any[] = [];
    const res = await importLikedTracks(
      supabase,
      "token",
      USER,
      (e) => events.push(e),
      { pageSize: 3 }
    );

    expect(call).toBe(2); // two pages fetched
    expect(res.imported).toBe(6);
    expect(res.total).toBe(6);
    expect(res.incrementalStop).toBe(false);
    // All 6 tracks upserted with is_liked=true
    expect(tables.tracks.size).toBe(6);
    for (const row of tables.tracks.values()) {
      expect(row.is_liked).toBe(true);
      expect(row.album_cover_url).toBeTypeOf("string");
      expect(row.album_title).toBeTypeOf("string");
    }
    // Progress events emitted
    expect(events.length).toBe(2);
    expect(events[0].phase).toBe("liked");
    expect(events[0].page).toBe(1);
  });

  it("stops incrementally after 2 consecutive all-existing pages", async () => {
    // Page 1: 3 existing tracks. Page 2: 3 existing. Should stop (2 consecutive).
    const pages = [
      likedTrackPage(["t1", "t2", "t3"], 9, "c1", "next1"),
      likedTrackPage(["t4", "t5", "t6"], 9, "c2", "next2"),
      likedTrackPage(["t7", "t8", "t9"], 9, "c3", null),
    ];
    // Pre-populate DB with all 9 so every page is "all existing"
    for (const id of ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9"]) {
      tables.tracks.set(`user-1:${id}`, {
        user_id: "user-1",
        spotify_id: id,
        is_liked: true,
        title: `Old ${id}`,
      });
    }
    let call = 0;
    mockFetch((url) => {
      if (url.startsWith("https://api.spotify.com/v1/me/tracks")) {
        return jsonRes(pages[call++]);
      }
      return jsonRes({}, 404);
    });

    const supabase = makeSupabase();
    const res = await importLikedTracks(supabase, "token", USER, () => {}, {
      pageSize: 3,
    });

    expect(res.incrementalStop).toBe(true);
    expect(call).toBe(2); // stopped after page 2, never fetched page 3
    expect(res.imported).toBe(0); // nothing new
  });

  it("retries on 429 using Retry-After then succeeds", async () => {
    const page = likedTrackPage(["t1", "t2"], 2, "c1", null);
    let calls = 0;
    mockFetch((url) => {
      if (url.startsWith("https://api.spotify.com/v1/me/tracks")) {
        calls++;
        if (calls === 1) {
          return jsonRes({ error: "rate limited" }, 429, {
            "retry-after": "0",
          });
        }
        return jsonRes(page);
      }
      return jsonRes({}, 404);
    });

    const supabase = makeSupabase();
    const res = await importLikedTracks(supabase, "token", USER, () => {}, {
      pageSize: 2,
      maxRetries: 3,
    });

    expect(calls).toBe(2); // retried once
    expect(res.imported).toBe(2);
    expect(tables.tracks.size).toBe(2);
  });

  it("dedups album tracks and liked songs by spotify_id", async () => {
    // Liked song "shared" and album track "shared" should collapse to one row
    // with is_liked=true (liked takes precedence).
    const likedPage = likedTrackPage(["shared", "liked-only"], 2, "c1", null);
    const albumPage1 = albumPage(["alb-1"], 1, 0, null);
    const albumTracks = albumTracksPage(["shared", "album-only"], null);

    const supabase = makeSupabase();

    // Phase 1: liked tracks
    let likedCalls = 0;
    mockFetch((url) => {
      if (url.startsWith("https://api.spotify.com/v1/me/tracks")) {
        likedCalls++;
        return jsonRes(likedPage);
      }
      return jsonRes({}, 404);
    });
    await importLikedTracks(supabase, "token", USER, () => {}, { pageSize: 50 });

    // Phase 2: saved albums
    let albumCalls = 0;
    mockFetch((url) => {
      if (url.includes("/me/albums")) {
        albumCalls++;
        return jsonRes(albumPage1);
      }
      if (url.includes("/albums/alb-1/tracks")) {
        return jsonRes(albumTracks);
      }
      return jsonRes({}, 404);
    });
    const albumRes = await importSavedAlbums(
      supabase,
      "token",
      USER,
      () => {},
      { pageSize: 50 }
    );

    // 3 distinct tracks total: shared, liked-only, album-only
    expect(tables.tracks.size).toBe(3);
    // "shared" must be is_liked=true (liked precedence over album track)
    const shared = tables.tracks.get("user-1:shared");
    expect(shared?.is_liked).toBe(true);
    expect(albumRes.albumTracksImported).toBe(1); // album-only is new; shared existed
  });

  it("extracts tracks from saved albums across album-track pagination", async () => {
    const savedAlbums = albumPage(["a1", "a2"], 2, 0, null);
    // Album 1 has 3 tracks across 2 pages
    const a1p1 = albumTracksPage(["a1t1", "a1t2"], "next-a1");
    const a1p2 = albumTracksPage(["a1t3"], null);
    // Album 2 has 1 track
    const a2p1 = albumTracksPage(["a2t1"], null);

    mockFetch((url) => {
      if (url.includes("/me/albums")) return jsonRes(savedAlbums);
      if (url.includes("/albums/a1/tracks")) {
        return url.includes("offset=50") ? jsonRes(a1p2) : jsonRes(a1p1);
      }
      if (url.includes("/albums/a2/tracks")) return jsonRes(a2p1);
      return jsonRes({}, 404);
    });

    const supabase = makeSupabase();
    const res = await importSavedAlbums(supabase, "token", USER, () => {}, {
      pageSize: 50,
    });

    expect(res.albumsImported).toBe(2);
    expect(res.albumTracksImported).toBe(4); // 3 + 1
    // Album tracks have is_liked=false, album metadata attached
    const t = tables.tracks.get("user-1:a1t1");
    expect(t?.is_liked).toBe(false);
    expect(t?.album_spotify_id).toBe("a1");
    expect(t?.album_title).toBe("Album a1");
    expect(t?.album_cover_url).toBe("https://img/a1");
  });

  it("runFullImport runs both phases and updates sync_state", async () => {
    const likedPage = likedTrackPage(["l1"], 1, "c1", null);
    const savedAlbums = albumPage(["a1"], 1, 0, null);
    const a1tracks = albumTracksPage(["a1t1"], null);

    mockFetch((url) => {
      if (url.includes("/me/tracks")) return jsonRes(likedPage);
      if (url.includes("/me/albums")) return jsonRes(savedAlbums);
      if (url.includes("/albums/a1/tracks")) return jsonRes(a1tracks);
      return jsonRes({}, 404);
    });

    const supabase = makeSupabase();
    const events: any[] = [];
    const res = await runFullImport(supabase, "token", USER, (e) => events.push(e), {});

    expect(res.likedTracksImported).toBe(1);
    expect(res.albumsImported).toBe(1);
    expect(res.albumTracksImported).toBe(1);
    expect(tables.tracks.size).toBe(2); // l1 + a1t1
    // sync_state updated
    const state = tables.sync_state.get("user-1");
    expect(state?.liked_tracks_synced_at).toBeTypeOf("string");
    expect(state?.saved_albums_synced_at).toBeTypeOf("string");
    expect(state?.total_tracks_imported).toBe(2);
    expect(state?.total_albums_imported).toBe(1);
    // Final event is "done"
    const doneEvent = events.find((e) => e.phase === "done");
    expect(doneEvent).toBeDefined();
  });

  it("respects likedOnly and albumsOnly options", async () => {
    const likedPage = likedTrackPage(["l1"], 1, "c1", null);
    const savedAlbums = albumPage(["a1"], 1, 0, null);

    mockFetch((url) => {
      if (url.includes("/me/tracks")) return jsonRes(likedPage);
      if (url.includes("/me/albums")) return jsonRes(savedAlbums);
      return jsonRes({}, 404);
    });

    const supabase = makeSupabase();
    const res = await runFullImport(supabase, "token", USER, () => {}, {
      likedOnly: true,
    });

    expect(res.likedTracksImported).toBe(1);
    expect(res.albumsImported).toBe(0);
    expect(tables.albums.size).toBe(0);
  });
});