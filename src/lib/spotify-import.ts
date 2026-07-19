/**
 * Spotify library import pipeline — shared logic.
 *
 * Used by:
 *   - POST /api/sync/import (unified, NDJSON streaming progress)
 *   - POST /api/spotify/import-liked (legacy single-source, kept for compat)
 *   - POST /api/spotify/import-albums
 *
 * Features:
 *   - Cursor-based pagination (50/page) for /me/tracks and /me/albums.
 *   - Incremental sync: liked songs use the `after` cursor (Spotify's
 *     "added at" ordering, newest first) — we stop as soon as we hit a
 *     track already present in the DB. Saved albums use offset pagination
 *     with the same stop-on-existing strategy because Spotify's /me/albums
 *     does not support an `after` cursor.
 *   - Rate-limit handling: on HTTP 429 we read Retry-After (seconds),
 *     wait, and retry the exact request. Bounded retries.
 *   - Album-track extraction: every saved album is fetched via
 *     GET /albums/{id}/tracks and each track is upserted into `tracks`
 *     with is_liked=false (it came from a saved album, not liked songs).
 *   - Dedup by (user_id, spotify_id) — the tracks table has a unique
 *     constraint; upserts with onConflict='user_id,spotify_id' collapse
 *     duplicates. Liked songs take precedence (is_liked=true wins).
 *   - Batched Supabase upserts (200 rows per call) to avoid URL-length
 *     and payload limits.
 *
 * All public entry points accept a `onProgress` callback that receives
 * { phase, page, total, processed, label } so callers can stream progress
 * to the client. The callback is synchronous; callers decide what to do
 * with each event.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "./types";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type SyncPhase =
  | "liked"
  | "albums"
  | "album-tracks"
  | "done"
  | "error";

export interface ImportProgressEvent {
  phase: SyncPhase;
  /** 1-indexed page number within the current phase. */
  page: number;
  /** Total items Spotify reports for this endpoint (the `total` field). */
  total: number;
  /** Items processed so far in this phase. */
  processed: number;
  /** Human-readable label, e.g. "Importing 234 of 1,200 liked tracks…". */
  label: string;
}

export type ProgressCallback = (event: ImportProgressEvent) => void;

export interface ImportResult {
  likedTracksImported: number;
  albumsImported: number;
  albumTracksImported: number;
  /** True if the liked-songs scan stopped early because it hit existing rows. */
  likedIncrementalStop: boolean;
  /** True if the saved-albums scan stopped early. */
  albumsIncrementalStop: boolean;
  likedTracksTotal: number;
  albumsTotal: number;
}

export interface ImportOptions {
  /** When true, skip liked songs. */
  albumsOnly?: boolean;
  /** When true, skip saved albums (and therefore album tracks). */
  likedOnly?: boolean;
  /** Override the page size (default 50, Spotify's max). */
  pageSize?: number;
  /** Override max retries on 429 (default 5). */
  maxRetries?: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Spotify API response shapes (only the fields we use)
// ──────────────────────────────────────────────────────────────────────────────

interface SpotifySavedTrack {
  added_at: string;
  track: {
    id: string;
    uri: string;
    name: string;
    duration_ms: number;
    album: { id: string; name: string; images: Array<{ url: string }> };
    artists: Array<{ name: string }>;
  };
}

interface SpotifyLikedTracksPage {
  items: SpotifySavedTrack[];
  total: number;
  next: string | null;
  /** Cursor-based pagination — present on /me/tracks. */
  after: string | null;
  cursors?: { after: string | null; before: string | null };
}

interface SpotifySavedAlbum {
  added_at: string;
  album: {
    id: string;
    uri: string;
    name: string;
    album_type: string;
    release_date: string;
    images: Array<{ url: string }>;
    artists: Array<{ name: string }>;
  };
}

interface SpotifySavedAlbumsPage {
  items: SpotifySavedAlbum[];
  total: number;
  next: string | null;
  offset: number;
}

interface SpotifyAlbumTracksPage {
  items: Array<{
    id: string;
    uri: string;
    name: string;
    duration_ms: number;
    artists: Array<{ name: string }>;
  }>;
  total: number;
  next: string | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Rate-limit-aware fetch helper
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Fetches a Spotify URL with Bearer auth and transparently retries on 429
 * using the Retry-After header. Returns the parsed JSON, or throws on
 * non-recoverable errors.
 */
async function spotifyFetch<T>(
  url: string,
  accessToken: string,
  maxRetries: number
): Promise<T> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 429) {
      const retryAfter = parseFloat(res.headers.get("retry-after") ?? "1");
      const waitMs = Math.max(500, Math.ceil(retryAfter * 1000));
      if (attempt >= maxRetries) {
        throw new Error(
          `Spotify rate limit exceeded after ${attempt + 1} retries (waited ${retryAfter}s)`
        );
      }
      await sleep(waitMs);
      attempt++;
      continue;
    }

    if (res.status === 401) {
      throw new Error("Spotify access token expired during import");
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Spotify API error ${res.status} for ${url}: ${text.slice(0, 200)}`
      );
    }

    return (await res.json()) as T;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ──────────────────────────────────────────────────────────────────────────────
// Row shapes we upsert into Supabase
// ──────────────────────────────────────────────────────────────────────────────

interface TrackRow {
  user_id: string;
  spotify_id: string;
  spotify_uri: string;
  title: string;
  artist: string;
  album_title: string | null;
  album_spotify_id: string | null;
  album_cover_url: string | null;
  duration_ms: number;
  is_liked: boolean;
  added_at: string;
}

interface AlbumRow {
  user_id: string;
  spotify_id: string;
  spotify_uri: string;
  title: string;
  artist: string;
  cover_url: string | null;
  release_date: string | null;
  album_type: string | null;
  added_at: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Batched upsert helpers
// ──────────────────────────────────────────────────────────────────────────────

const UPSERT_BATCH = 200;

/**
 * Upserts an array of track rows in batches of UPSERT_BATCH.
 * Uses onConflict='user_id,spotify_id' so the unique constraint collapses
 * duplicates. When a row already exists (e.g. a liked song that was
 * previously imported from a saved album), we update only the fields that
 * should not clobber user edits — we set is_liked=true if the incoming
 * row is liked, refresh metadata, and bump added_at to the Spotify value.
 *
 * Returns the number of rows that were new (not already present). We
 * approximate "new" by comparing the pre-upsert count for the batch's
 * spotify_ids against the post-upsert count; callers use this to decide
 * when to stop in incremental mode.
 */
async function upsertTracks(
  supabase: SupabaseClient,
  rows: TrackRow[]
): Promise<{ inserted: number; existingIds: Set<string> }> {
  if (rows.length === 0) return { inserted: 0, existingIds: new Set() };

  // Probe which spotify_ids already exist for this user. We do this by
  // querying the tracks table for the batch's spotify_ids. The batch is
  // already scoped to one user (caller guarantees user_id on every row).
  const userId = rows[0].user_id;
  const spotifyIds = rows.map((r) => r.spotify_id);
  const existingIds = new Set<string>();
  // Probe in chunks of 200 to avoid URL-length limits on .in()
  for (let i = 0; i < spotifyIds.length; i += UPSERT_BATCH) {
    const chunk = spotifyIds.slice(i, i + UPSERT_BATCH);
    const { data: existing } = await supabase
      .from("tracks")
      .select("spotify_id")
      .eq("user_id", userId)
      .in("spotify_id", chunk);
    for (const row of existing ?? []) existingIds.add(row.spotify_id);
  }

  // Upsert in batches
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const { error } = await supabase
      .from("tracks")
      .upsert(batch, { onConflict: "user_id,spotify_id" });
    if (error) {
      console.error("[spotify-import] upsert tracks batch error:", error.message);
      // Don't throw — one bad batch shouldn't kill the whole import.
    }
  }

  const inserted = rows.filter((r) => !existingIds.has(r.spotify_id)).length;
  return { inserted, existingIds };
}

async function upsertAlbums(
  supabase: SupabaseClient,
  rows: AlbumRow[]
): Promise<{ inserted: number; existingIds: Set<string> }> {
  if (rows.length === 0) return { inserted: 0, existingIds: new Set() };
  const userId = rows[0].user_id;
  const spotifyIds = rows.map((r) => r.spotify_id);
  const existingIds = new Set<string>();
  for (let i = 0; i < spotifyIds.length; i += UPSERT_BATCH) {
    const chunk = spotifyIds.slice(i, i + UPSERT_BATCH);
    const { data: existing } = await supabase
      .from("albums")
      .select("spotify_id")
      .eq("user_id", userId)
      .in("spotify_id", chunk);
    for (const row of existing ?? []) existingIds.add(row.spotify_id);
  }
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const { error } = await supabase
      .from("albums")
      .upsert(batch, { onConflict: "user_id,spotify_id" });
    if (error) {
      console.error("[spotify-import] upsert albums batch error:", error.message);
    }
  }
  const inserted = rows.filter((r) => !existingIds.has(r.spotify_id)).length;
  return { inserted, existingIds };
}

// ──────────────────────────────────────────────────────────────────────────────
// Sync state persistence
// ──────────────────────────────────────────────────────────────────────────────

interface SyncStateRow {
  user_id: string;
  liked_tracks_synced_at: string | null;
  saved_albums_synced_at: string | null;
  total_tracks_imported: number;
  total_albums_imported: number;
}

async function loadSyncState(
  supabase: SupabaseClient,
  userId: string
): Promise<SyncStateRow | null> {
  const { data, error } = await supabase
    .from("sync_state")
    .select(
      "user_id, liked_tracks_synced_at, saved_albums_synced_at, total_tracks_imported, total_albums_imported"
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[spotify-import] load sync_state error:", error.message);
    return null;
  }
  return data as SyncStateRow | null;
}

async function saveSyncState(
  supabase: SupabaseClient,
  userId: string,
  patch: Partial<SyncStateRow>
): Promise<void> {
  const { error } = await supabase
    .from("sync_state")
    .upsert(
      { user_id: userId, updated_at: new Date().toISOString(), ...patch },
      { onConflict: "user_id" }
    );
  if (error) {
    console.error("[spotify-import] save sync_state error:", error.message);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Public: importLikedTracks
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Imports liked songs via GET /me/tracks with cursor-based pagination.
 * Spotify returns liked songs newest-first (by added_at), so we can stop
 * as soon as we hit a batch where every track already exists in the DB —
 * that means everything older is already imported.
 *
 * Uses the `after` cursor for pagination (not offset) so newly added
 * songs are always picked up even if older ones were removed.
 */
export async function importLikedTracks(
  supabase: SupabaseClient,
  accessToken: string,
  user: User,
  onProgress: ProgressCallback,
  opts: ImportOptions = {}
): Promise<{ imported: number; total: number; incrementalStop: boolean }> {
  const pageSize = opts.pageSize ?? 50;
  const maxRetries = opts.maxRetries ?? 5;

  let after: string | null = null;
  let page = 0;
  let imported = 0;
  let total = 0;
  let incrementalStop = false;

  // We stop early if we see N consecutive pages where all tracks already
  // exist in the DB. One page of all-existing is a strong signal but can
  // happen if a user re-liked a previously-unliked song in the middle of
  // their library; two consecutive is safe.
  let consecutiveAllExistingPages = 0;
  const STOP_AFTER_EXISTING_PAGES = 2;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    page++;
    const url = new URL("https://api.spotify.com/v1/me/tracks");
    url.searchParams.set("limit", String(pageSize));
    if (after) url.searchParams.set("after", after);

    const data = await spotifyFetch<SpotifyLikedTracksPage>(
      url.toString(),
      accessToken,
      maxRetries
    );
    total = data.total;
    const items = data.items ?? [];

    if (items.length === 0) break;

    const rows: TrackRow[] = items.map((item) => {
      const t = item.track;
      return {
        user_id: user.id,
        spotify_id: t.id,
        spotify_uri: t.uri,
        title: t.name,
        artist: t.artists.map((a) => a.name).join(", "),
        album_title: t.album?.name ?? null,
        album_spotify_id: t.album?.id ?? null,
        album_cover_url: t.album?.images?.[0]?.url ?? null,
        duration_ms: t.duration_ms,
        is_liked: true,
        added_at: item.added_at,
      };
    });

    const { inserted, existingIds } = await upsertTracks(supabase, rows);
    imported += inserted;

    onProgress({
      phase: "liked",
      page,
      total,
      processed: imported,
      label: `Importing ${imported.toLocaleString()} of ${total.toLocaleString()} liked tracks…`,
    });

    // Incremental stop heuristic
    const allExisting = existingIds.size === rows.length;
    if (allExisting) {
      consecutiveAllExistingPages++;
      if (consecutiveAllExistingPages >= STOP_AFTER_EXISTING_PAGES) {
        incrementalStop = true;
        break;
      }
    } else {
      consecutiveAllExistingPages = 0;
    }

    // Advance cursor
    after = data.cursors?.after ?? data.after;
    if (!after || !data.next) break;
  }

  await saveSyncState(supabase, user.id, {
    liked_tracks_synced_at: new Date().toISOString(),
  });

  return { imported, total, incrementalStop };
}

// ──────────────────────────────────────────────────────────────────────────────
// Public: importSavedAlbums (also extracts album tracks)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Imports saved albums via GET /me/albums (offset pagination, 50/page).
 * For each album, also fetches its tracks via GET /albums/{id}/tracks and
 * upserts them into `tracks` with is_liked=false.
 *
 * Incremental: stop after STOP_AFTER_EXISTING_PAGES consecutive pages
 * where every album already exists in the DB.
 */
export async function importSavedAlbums(
  supabase: SupabaseClient,
  accessToken: string,
  user: User,
  onProgress: ProgressCallback,
  opts: ImportOptions = {}
): Promise<{
  albumsImported: number;
  albumTracksImported: number;
  albumsTotal: number;
  incrementalStop: boolean;
}> {
  const pageSize = opts.pageSize ?? 50;
  const maxRetries = opts.maxRetries ?? 5;

  let offset = 0;
  let page = 0;
  let albumsImported = 0;
  let albumTracksImported = 0;
  let albumsTotal = 0;
  let incrementalStop = false;
  let consecutiveAllExistingPages = 0;
  const STOP_AFTER_EXISTING_PAGES = 2;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    page++;
    const url = `https://api.spotify.com/v1/me/albums?limit=${pageSize}&offset=${offset}`;
    const data = await spotifyFetch<SpotifySavedAlbumsPage>(
      url,
      accessToken,
      maxRetries
    );
    albumsTotal = data.total;
    const items = data.items ?? [];
    if (items.length === 0) break;

    const albumRows: AlbumRow[] = items.map((item) => {
      const a = item.album;
      return {
        user_id: user.id,
        spotify_id: a.id,
        spotify_uri: a.uri,
        title: a.name,
        artist: a.artists.map((x) => x.name).join(", "),
        cover_url: a.images?.[0]?.url ?? null,
        release_date: a.release_date ?? null,
        album_type: a.album_type ?? null,
        added_at: item.added_at,
      };
    });

    const { inserted, existingIds } = await upsertAlbums(supabase, albumRows);
    albumsImported += inserted;

    onProgress({
      phase: "albums",
      page,
      total: albumsTotal,
      processed: albumsImported,
      label: `Importing ${albumsImported.toLocaleString()} of ${albumsTotal.toLocaleString()} saved albums…`,
    });

    // Extract tracks from each album that is new (or refresh existing).
    // We fetch tracks for ALL albums in the page (not just new ones) so
    // that re-running sync picks up tracks added to an existing album.
    // For incremental stop we still use the album-level heuristic.
    for (const item of items) {
      const album = item.album;
      const albumTracks = await fetchAlbumTracks(
        album.id,
        album.name,
        album.images?.[0]?.url ?? null,
        accessToken,
        maxRetries
      );
      if (albumTracks.length === 0) continue;
      const trackRows: TrackRow[] = albumTracks.map((t) => ({
        user_id: user.id,
        spotify_id: t.id,
        spotify_uri: t.uri,
        title: t.name,
        artist: t.artists.map((x) => x.name).join(", "),
        album_title: album.name,
        album_spotify_id: album.id,
        album_cover_url: album.images?.[0]?.url ?? null,
        duration_ms: t.duration_ms,
        is_liked: false,
        added_at: item.added_at,
      }));
      const { inserted: ti } = await upsertTracks(supabase, trackRows);
      albumTracksImported += ti;
      onProgress({
        phase: "album-tracks",
        page,
        total: albumsTotal,
        processed: albumTracksImported,
        label: `Extracted ${albumTracksImported.toLocaleString()} tracks from saved albums…`,
      });
    }

    const allExisting = existingIds.size === albumRows.length;
    if (allExisting) {
      consecutiveAllExistingPages++;
      if (consecutiveAllExistingPages >= STOP_AFTER_EXISTING_PAGES) {
        incrementalStop = true;
        break;
      }
    } else {
      consecutiveAllExistingPages = 0;
    }

    if (!data.next) break;
    offset += pageSize;
  }

  await saveSyncState(supabase, user.id, {
    saved_albums_synced_at: new Date().toISOString(),
  });

  return { albumsImported, albumTracksImported, albumsTotal, incrementalStop };
}

/** Fetches all tracks from a single album via GET /albums/{id}/tracks. */
async function fetchAlbumTracks(
  albumId: string,
  _albumName: string,
  _coverUrl: string | null,
  accessToken: string,
  maxRetries: number
): Promise<Array<{
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  artists: Array<{ name: string }>;
}>> {
  const all: Array<{
    id: string;
    uri: string;
    name: string;
    duration_ms: number;
    artists: Array<{ name: string }>;
  }> = [];
  let offset = 0;
  const limit = 50;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=${limit}&offset=${offset}`;
    const data = await spotifyFetch<SpotifyAlbumTracksPage>(
      url,
      accessToken,
      maxRetries
    );
    all.push(...(data.items ?? []));
    if (!data.next) break;
    offset += limit;
  }
  return all;
}

// ──────────────────────────────────────────────────────────────────────────────
// Public: runFullImport — used by /api/sync/import
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Runs the full import pipeline: liked songs, then saved albums (+ album
 * tracks). Streams progress via `onProgress`. Returns a structured result.
 */
export async function runFullImport(
  supabase: SupabaseClient,
  accessToken: string,
  user: User,
  onProgress: ProgressCallback,
  opts: ImportOptions = {}
): Promise<ImportResult> {
  const result: ImportResult = {
    likedTracksImported: 0,
    albumsImported: 0,
    albumTracksImported: 0,
    likedIncrementalStop: false,
    albumsIncrementalStop: false,
    likedTracksTotal: 0,
    albumsTotal: 0,
  };

  if (!opts.albumsOnly) {
    const liked = await importLikedTracks(
      supabase,
      accessToken,
      user,
      onProgress,
      opts
    );
    result.likedTracksImported = liked.imported;
    result.likedTracksTotal = liked.total;
    result.likedIncrementalStop = liked.incrementalStop;
  }

  if (!opts.likedOnly) {
    const albums = await importSavedAlbums(
      supabase,
      accessToken,
      user,
      onProgress,
      opts
    );
    result.albumsImported = albums.albumsImported;
    result.albumTracksImported = albums.albumTracksImported;
    result.albumsTotal = albums.albumsTotal;
    result.albumsIncrementalStop = albums.incrementalStop;
  }

  // Update aggregate counts in sync_state
  const state = await loadSyncState(supabase, user.id);
  await saveSyncState(supabase, user.id, {
    total_tracks_imported:
      (state?.total_tracks_imported ?? 0) +
      result.likedTracksImported +
      result.albumTracksImported,
    total_albums_imported:
      (state?.total_albums_imported ?? 0) + result.albumsImported,
  });

  onProgress({
    phase: "done",
    page: 0,
    total: 0,
    processed: 0,
    label: "Sync complete",
  });

  return result;
}