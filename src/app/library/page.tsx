"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, ChevronLeft, ChevronRight, Search, X, Play } from "lucide-react";
import type { Album, Genre, Mood, Track, ViewMode, SortKey, SortDirection } from "@/lib/types";
import FilterBar, { type FilterState } from "@/components/FilterBar";
import ViewModeSwitch from "@/components/ViewModeSwitch";
import TrackRow from "@/components/TrackRow";
import AlbumRow from "@/components/AlbumRow";
import SyncButton from "@/components/SyncButton";
import TrackDetailModal from "@/components/TrackDetailModal";
import AlbumDetailModal from "@/components/AlbumDetailModal";
import { usePlayback } from "@/lib/playback";

// --- sessionStorage cache for library data -------------------------------
// Caching avoids refetching ~1700 tracks every time the user navigates
// away and back. Data is shown instantly from cache; a background revalidate
// runs only when the cache is older than STALE_MS.
const CACHE_VERSION = 5;
const CACHE_KEY = `muse:library:v${CACHE_VERSION}`;
const STALE_MS = 10 * 60 * 1000; // 10 minutes

interface LibraryCache {
  ts: number;
  tracks: Track[];
  albums: Album[];
  genres: Genre[];
  moods: Mood[];
}

function readCache(): LibraryCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LibraryCache;
    if (
      !parsed ||
      !Array.isArray(parsed.tracks) ||
      !Array.isArray(parsed.albums)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(cache: LibraryCache) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // sessionStorage may be full (large libraries); silently ignore.
  }
}

function clearCache() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

// --- Unified list type ---------------------------------------------------
// Albums and tracks are merged into a single sorted list so they appear
// interleaved in sort order rather than as two separate sections.
type UnifiedItem =
  | { kind: "album"; album: Album }
  | { kind: "track"; track: Track };

function sortUnified(
  a: UnifiedItem,
  b: UnifiedItem,
  key: SortKey,
  direction: SortDirection
): number {
  const mul = direction === "asc" ? 1 : -1;
  const aTitle = a.kind === "album" ? a.album.title : a.track.title;
  const bTitle = b.kind === "album" ? b.album.title : b.track.title;
  const aArtist = a.kind === "album" ? a.album.artist : a.track.artist;
  const bArtist = b.kind === "album" ? b.album.artist : b.track.artist;
  const aStars = a.kind === "album" ? a.album.stars : a.track.stars;
  const bStars = b.kind === "album" ? b.album.stars : b.track.stars;
  const aAdded = a.kind === "album" ? a.album.added_at : a.track.added_at;
  const bAdded = b.kind === "album" ? b.album.added_at : b.track.added_at;
  switch (key) {
    case "title":
      return aTitle.localeCompare(bTitle) * mul;
    case "artist":
      return aArtist.localeCompare(bArtist) * mul;
    case "album":
      // For tracks, sort by album_title; for albums, sort by title (they ARE the album).
      {
        const aAlbum = a.kind === "album" ? a.album.title : (a.track.album_title ?? "");
        const bAlbum = b.kind === "album" ? b.album.title : (b.track.album_title ?? "");
        return aAlbum.localeCompare(bAlbum) * mul;
      }
    case "stars":
      return ((aStars ?? 0) - (bStars ?? 0)) * mul;
    case "play_count":
      // Albums have no play count; treat as 0.
      {
        const aCount = a.kind === "album" ? 0 : a.track.play_count_all_time;
        const bCount = b.kind === "album" ? 0 : b.track.play_count_all_time;
        return (aCount - bCount) * mul;
      }
    case "added_at":
      return (new Date(aAdded).getTime() - new Date(bAdded).getTime()) * mul;
    case "last_played_at": {
      const aVal = a.kind === "album" ? 0 : (a.track.last_played_at ? new Date(a.track.last_played_at).getTime() : 0);
      const bVal = b.kind === "album" ? 0 : (b.track.last_played_at ? new Date(b.track.last_played_at).getTime() : 0);
      return (aVal - bVal) * mul;
    }
    case "updated_at": {
      const aU = a.kind === "album" ? a.album.updated_at : a.track.updated_at;
      const bU = b.kind === "album" ? b.album.updated_at : b.track.updated_at;
      const aVal = aU ? new Date(aU).getTime() : 0;
      const bVal = bU ? new Date(bU).getTime() : 0;
      return (aVal - bVal) * mul;
    }
    default:
      return 0;
  }
}

// --- Pagination ----------------------------------------------------------
// Desktop (sm breakpoint and up) shows 50 items per page; mobile shows 20
// to avoid excessive scrolling on small screens.
const DESKTOP_PAGE_SIZE = 50;
const MOBILE_PAGE_SIZE = 20;

/** Returns true when the viewport is >= the Tailwind `sm` breakpoint (640px). */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 640 : true
  );
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 640px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

export default function LibraryPage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [moods, setMoods] = useState<Mood[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const [view, setView] = useState<ViewMode>("both");
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    genreFilters: {},
    moodFilters: {},
    stars: null,
    favoritesOnly: false,
    trackLevelStars: true,
    sort: "added_at",
    sortDirection: "desc",
  });

  const isDesktop = useIsDesktop();
  const pageSize = isDesktop ? DESKTOP_PAGE_SIZE : MOBILE_PAGE_SIZE;

  // Single pagination state for the unified list.
  const [unifiedPage, setUnifiedPage] = useState(0);

  // Track detail modal state
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  // Album detail modal state
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);

  const { playAlbum: playAlbumContext, currentTrackId } = usePlayback();

  // Read ?track=ID query param to open detail modal from MiniPlayer navigation
  const router = useRouter();

  // When tracks are loaded and a ?track=ID param is present, open the
  // detail modal for that track. Clears the param after opening so
  // navigating back doesn't re-open it.
  useEffect(() => {
    if (tracks.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const trackId = params.get("track");
    if (!trackId) return;
    const track = tracks.find((t) => t.id === trackId);
    if (track) {
      setEditingTrack(track);
      router.replace("/library", { scroll: false });
    }
  }, [tracks, router]);

  // Fetch all library data from the API and write to cache + state.
  const fetchLibrary = useCallback(async (): Promise<boolean> => {
    try {
      const [tRes, aRes, gRes, mRes] = await Promise.all([
        fetch("/api/tracks"),
        fetch("/api/albums"),
        fetch("/api/genres"),
        fetch("/api/moods"),
      ]);
      const [t, a, g, m] = await Promise.all([
        tRes.json(),
        aRes.json(),
        gRes.json(),
        mRes.json(),
      ]);
      const nextTracks = Array.isArray(t) ? t : t.tracks ?? [];
      const nextAlbums = Array.isArray(a) ? a : a.albums ?? [];
      const nextGenres = Array.isArray(g) ? g : g.genres ?? [];
      const nextMoods = Array.isArray(m) ? m : m.moods ?? [];
      setTracks(nextTracks);
      setAlbums(nextAlbums);
      setGenres(nextGenres);
      setMoods(nextMoods);
      setError(null);
      writeCache({
        ts: Date.now(),
        tracks: nextTracks,
        albums: nextAlbums,
        genres: nextGenres,
        moods: nextMoods,
      });
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  }, []);

  // On mount: hydrate from cache instantly; always refetch in background.
  // We always do a background fetch (even with fresh cache) to recover from
  // stale empty caches caused by previous auth failures.
  useEffect(() => {
    const cache = readCache();
    const hasCacheData = cache && (cache.tracks.length > 0 || cache.albums.length > 0);
    if (hasCacheData) {
      setTracks(cache.tracks);
      setAlbums(cache.albums);
      setGenres(cache.genres);
      setMoods(cache.moods);
      setLoading(false);
      setHydrated(true);
    } else {
      // No cache or empty cache — show spinner until first fetch completes.
      setHydrated(true);
      setLoading(true);
    }
    // Always refetch in background
    void fetchLibrary().then((ok) => {
      if (ok) setLoading(false);
    });
  }, [fetchLibrary]);

  // Public reload used by the Sync button — forces a fresh fetch.
  const loadLibrary = useCallback(() => {
    setLoading(true);
    void fetchLibrary().then((ok) => {
      if (ok) setLoading(false);
    });
  }, [fetchLibrary]);

  const updateFilters = useCallback(
    (next: Partial<FilterState>) =>
      setFilters((prev) => ({ ...prev, ...next })),
    []
  );

  // Reset pagination to first page whenever filters, view, or page size
  // change so the user always lands on a non-empty page. Page size changes
  // when the viewport crosses the sm breakpoint (desktop <-> mobile).
  useEffect(() => {
    setUnifiedPage(0);
  }, [filters, view, pageSize]);

  // Derive include/exclude sets from the tri-state genre filter.
  // When a parent genre is included/excluded, all its descendants are
  // automatically included/excluded too — selecting a parent filters by
  // all children, per the tree-structure requirement.
  const genreDescendantIds = useMemo(() => {
    // Build a map from genre id → set of all descendant ids (not including self).
    const descMap = new Map<string, Set<string>>();
    const collect = (genre: Genre): Set<string> => {
      const set = new Set<string>();
      if (genre.children?.length) {
        for (const child of genre.children) {
          set.add(child.id);
          for (const d of collect(child)) set.add(d);
        }
      }
      descMap.set(genre.id, set);
      return set;
    };
    genres.forEach(collect);
    return descMap;
  }, [genres]);

  const genreIncludeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, state] of Object.entries(filters.genreFilters)) {
      if (state === "include") {
        ids.add(id);
        // Add all descendant genres
        const desc = genreDescendantIds.get(id);
        if (desc) for (const d of desc) ids.add(d);
      }
    }
    return ids.size > 0 ? ids : null;
  }, [filters.genreFilters, genreDescendantIds]);

  const genreExcludeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, state] of Object.entries(filters.genreFilters)) {
      if (state === "exclude") {
        ids.add(id);
        const desc = genreDescendantIds.get(id);
        if (desc) for (const d of desc) ids.add(d);
      }
    }
    return ids.size > 0 ? ids : null;
  }, [filters.genreFilters, genreDescendantIds]);

  // Same for moods.
  const moodIncludeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, state] of Object.entries(filters.moodFilters)) {
      if (state === "include") ids.add(id);
    }
    return ids.size > 0 ? ids : null;
  }, [filters.moodFilters]);

  const moodExcludeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, state] of Object.entries(filters.moodFilters)) {
      if (state === "exclude") ids.add(id);
    }
    return ids.size > 0 ? ids : null;
  }, [filters.moodFilters]);

  const showAlbums = view === "albums" || view === "both";
  const showTracks = view === "tracks" || view === "both";

  // Filter albums (computed first so filteredTracks can exclude
  // tracks that are already shown inside a displayed album row).
  const filteredAlbums = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return albums
      .filter((a) => {
        if (filters.favoritesOnly && !a.is_favorite) return false;
        if (q) {
          const hay = `${a.title} ${a.artist}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        // Genre tri-state filter
        const aGenreIds = (a.genres ?? []).map((g) => g.id);
        if (genreIncludeIds) {
          // Must have at least one included genre
          if (!aGenreIds.some((id) => genreIncludeIds.has(id))) return false;
        }
        if (genreExcludeIds) {
          // Must NOT have any excluded genre
          if (aGenreIds.some((id) => genreExcludeIds.has(id))) return false;
        }
        // Mood tri-state filter
        const aMoodIds = (a.moods ?? []).map((m) => m.id);
        if (moodIncludeIds) {
          if (!aMoodIds.some((id) => moodIncludeIds.has(id))) return false;
        }
        if (moodExcludeIds) {
          if (aMoodIds.some((id) => moodExcludeIds.has(id))) return false;
        }
        if (filters.stars === "unrated") {
          if (a.stars !== null) return false;
        } else if (typeof filters.stars === "number") {
          if (a.stars === null || a.stars < filters.stars) return false;
        }
        return true;
      })
      .sort((a, b) => sortAlbums(a, b, filters.sort, filters.sortDirection));
  }, [albums, filters, genreIncludeIds, genreExcludeIds, moodIncludeIds, moodExcludeIds]);

  // Filter tracks.
  // When showing both albums and tracks, hide tracks that belong to a
  // displayed album — they're already visible inside the album row.
  //
  // Star filter behavior depends on the trackLevelStars toggle:
  // - trackLevelStars=true (default): tracks are filtered by their own
  //   star rating. A 4-star track inside a 3-star album shows up when
  //   the filter is 4+ (the album is hidden, the track shows standalone).
  // - trackLevelStars=false: tracks inherit their album's star rating
  //   for filtering. A 4-star track inside a 3-star album is hidden when
  //   the filter is 4+ (because the album doesn't match).
  const filteredTracks = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const albumSpotifyIds = new Set(
      showAlbums ? filteredAlbums.map((a) => a.spotify_id).filter(Boolean) : []
    );
    // When trackLevelStars is false, build a map of album spotify_id → album stars
    // so we can check the album's star rating for tracks that don't have their own.
    const albumStarsBySpotifyId = new Map<string, number | null>();
    if (!filters.trackLevelStars) {
      for (const a of albums) {
        if (a.spotify_id) albumStarsBySpotifyId.set(a.spotify_id, a.stars);
      }
    }
    return tracks
      .filter((t) => {
        if (showAlbums && t.album_spotify_id && albumSpotifyIds.has(t.album_spotify_id)) {
          return false;
        }
        if (filters.favoritesOnly && !t.is_favorite) return false;
        if (q) {
          const hay = `${t.title} ${t.artist} ${t.album_title ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        // Genre tri-state filter
        const tGenreIds = (t.genres ?? []).map((g) => g.id);
        if (genreIncludeIds) {
          if (!tGenreIds.some((id) => genreIncludeIds.has(id))) return false;
        }
        if (genreExcludeIds) {
          if (tGenreIds.some((id) => genreExcludeIds.has(id))) return false;
        }
        // Mood tri-state filter
        const tMoodIds = (t.moods ?? []).map((m) => m.id);
        if (moodIncludeIds) {
          if (!tMoodIds.some((id) => moodIncludeIds.has(id))) return false;
        }
        if (moodExcludeIds) {
          if (tMoodIds.some((id) => moodExcludeIds.has(id))) return false;
        }
        if (filters.stars === "unrated") {
          // When trackLevelStars is false, "unrated" means the album is unrated
          if (!filters.trackLevelStars && t.album_spotify_id) {
            const albumStars = albumStarsBySpotifyId.get(t.album_spotify_id);
            if (albumStars !== undefined && albumStars !== null) return false;
          } else {
            if (t.stars !== null) return false;
          }
        } else if (typeof filters.stars === "number") {
          if (!filters.trackLevelStars && t.album_spotify_id) {
            // Use the album's star rating instead of the track's
            const albumStars = albumStarsBySpotifyId.get(t.album_spotify_id);
            if (albumStars === undefined) {
              // Album not found — fall back to track's own stars
              if (t.stars === null || t.stars < filters.stars) return false;
            } else {
              if (albumStars === null || albumStars < filters.stars) return false;
            }
          } else {
            if (t.stars === null || t.stars < filters.stars) return false;
          }
        }
        return true;
      })
      .sort((a, b) => sortTracks(a, b, filters.sort, filters.sortDirection));
  }, [tracks, filters, genreIncludeIds, genreExcludeIds, moodIncludeIds, moodExcludeIds, showAlbums, filteredAlbums, albums]);

  // Merge filtered albums and tracks into a single sorted list.
  // Tracks belonging to a displayed album are already hidden by
  // filteredTracks (the dedup logic above), so we just concatenate.
  const unifiedList = useMemo(() => {
    const items: UnifiedItem[] = [];
    if (showAlbums) {
      for (const a of filteredAlbums) items.push({ kind: "album", album: a });
    }
    if (showTracks) {
      for (const t of filteredTracks) items.push({ kind: "track", track: t });
    }
    items.sort((a, b) => sortUnified(a, b, filters.sort, filters.sortDirection));
    return items;
  }, [showAlbums, showTracks, filteredAlbums, filteredTracks, filters.sort, filters.sortDirection]);

  // Paginate the unified list. Only the current page slice is rendered,
  // which keeps filter toggles instant even with 1700+ items.
  const unifiedPageCount = Math.max(1, Math.ceil(unifiedList.length / pageSize));
  const safeUnifiedPage = Math.min(unifiedPage, unifiedPageCount - 1);
  const pagedItems = useMemo(
    () =>
      unifiedList.slice(
        safeUnifiedPage * pageSize,
        safeUnifiedPage * pageSize + pageSize
      ),
    [unifiedList, safeUnifiedPage, pageSize]
  );

  // Tracks grouped by album spotify id (for album expansion).
  // Sorted by disc_number, then track_number so album tracks appear in
  // their actual album order (not import/added_at order).
  const tracksByAlbum = useMemo(() => {
    const map = new Map<string, Track[]>();
    tracks.forEach((t) => {
      if (!t.album_spotify_id) return;
      const arr = map.get(t.album_spotify_id) ?? [];
      arr.push(t);
      map.set(t.album_spotify_id, arr);
    });
    // Sort each album's tracks by disc_number, then track_number.
    // When track_number/disc_number are NULL (pre-backfill), fall back to
    // title as a deterministic tiebreaker so the order is stable across
    // page loads (PostgREST returns tracks with the same added_at in an
    // undefined order, making the sort non-deterministic without a
    // tiebreaker).
    map.forEach((arr) => {
      arr.sort((a, b) => {
        const discDiff = (a.disc_number ?? 99) - (b.disc_number ?? 99);
        if (discDiff !== 0) return discDiff;
        const tnDiff = (a.track_number ?? 99) - (b.track_number ?? 99);
        if (tnDiff !== 0) return tnDiff;
        return a.title.localeCompare(b.title);
      });
    });
    return map;
  }, [tracks]);

  // Mutation helpers.
  const rateTrack = useCallback(async (trackId: string, stars: number | null) => {
    await fetch(`/api/tracks/${trackId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stars }),
    });
    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, stars } : t))
    );
    // Keep cache in sync with optimistic local state.
    writeCache({
      ts: Date.now(),
      tracks: tracks.map((t) => (t.id === trackId ? { ...t, stars } : t)),
      albums,
      genres,
      moods,
    });
  }, [tracks, albums, genres, moods]);

  const toggleTrackFavorite = useCallback(
    async (trackId: string, value: boolean) => {
      // Optimistic update — flip the heart immediately
      const nextTracks = tracks.map((t) =>
        t.id === trackId ? { ...t, is_favorite: value } : t
      );
      setTracks(nextTracks);
      try {
        await fetch(`/api/tracks/${trackId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_favorite: value }),
        });
        writeCache({ ts: Date.now(), tracks: nextTracks, albums, genres, moods });
      } catch {
        // Revert on failure
        const reverted = tracks.map((t) =>
          t.id === trackId ? { ...t, is_favorite: !value } : t
        );
        setTracks(reverted);
        writeCache({ ts: Date.now(), tracks: reverted, albums, genres, moods });
      }
    },
    [tracks, albums, genres, moods]
  );

  const rateAlbum = useCallback(async (albumId: string, stars: number | null) => {
    await fetch(`/api/albums/${albumId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stars }),
    });
    setAlbums((prev) =>
      prev.map((a) => (a.id === albumId ? { ...a, stars } : a))
    );
  }, []);

  const toggleAlbumFavorite = useCallback(
    async (albumId: string, value: boolean) => {
      // Optimistic update
      const nextAlbums = albums.map((a) =>
        a.id === albumId ? { ...a, is_favorite: value } : a
      );
      setAlbums(nextAlbums);
      try {
        await fetch(`/api/albums/${albumId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_favorite: value }),
        });
        writeCache({ ts: Date.now(), tracks, albums: nextAlbums, genres, moods });
      } catch {
        // Revert on failure
        const reverted = albums.map((a) =>
          a.id === albumId ? { ...a, is_favorite: !value } : a
        );
        setAlbums(reverted);
        writeCache({ ts: Date.now(), tracks, albums: reverted, genres, moods });
      }
    },
    [tracks, albums, genres, moods]
  );

  // Remove a deleted track from local state + cache. The actual DELETE API
  // call is made by the detail modal (TrackDetailModal.handleDelete), which
  // only invokes this callback on res.ok. This function must NOT re-call the
  // API — a second DELETE would 404 (already deleted) and the early return
  // would prevent the state update, leaving the item stuck in the UI.
  const deleteTrack = useCallback(
    (trackId: string) => {
      setTracks((prev) => {
        const next = prev.filter((t) => t.id !== trackId);
        writeCache({ ts: Date.now(), tracks: next, albums, genres, moods });
        return next;
      });
    },
    [albums, genres, moods]
  );

  // Remove a deleted album from local state + cache. The actual DELETE API
  // call is made by AlbumDetailModal.handleDelete, which only invokes this
  // callback on res.ok. Same rationale as deleteTrack above.
  const deleteAlbum = useCallback(
    (albumId: string) => {
      setAlbums((prev) => {
        const next = prev.filter((a) => a.id !== albumId);
        writeCache({ ts: Date.now(), tracks, albums: next, genres, moods });
        return next;
      });
    },
    [tracks, genres, moods]
  );

  // Play all currently visible items in seen order. Albums expand to
  // their track list (in disc/track-number order), standalone tracks play
  // as themselves. Builds a flat ordered list from the unified page and
  // hands it to the album context player so it auto-advances through everything.
  const playAllVisible = useCallback(() => {
    const list: Array<{ id: string; title?: string; spotifyUri?: string | null; artist?: string | null; albumArt?: string | null }> = [];
    for (const item of pagedItems) {
      if (item.kind === "album") {
        const album = item.album;
        const albumTracks = album.spotify_id
          ? tracksByAlbum.get(album.spotify_id) ?? []
          : album.tracks ?? [];
        if (albumTracks.length > 0) {
          for (const t of albumTracks) {
            if (t.spotify_uri) {
              list.push({ id: t.id, title: t.title, spotifyUri: t.spotify_uri, artist: t.artist, albumArt: t.album_cover_url });
            }
          }
        } else if (album.spotify_uri) {
          list.push({ id: album.id, title: album.title, spotifyUri: album.spotify_uri, artist: album.artist, albumArt: album.cover_url });
        }
      } else {
        const t = item.track;
        if (t.spotify_uri) {
          list.push({ id: t.id, title: t.title, spotifyUri: t.spotify_uri, artist: t.artist, albumArt: t.album_cover_url });
        }
      }
    }
    if (list.length === 0) return;
    playAlbumContext(list);
  }, [pagedItems, tracksByAlbum, playAlbumContext]);

  // Track detail modal save — PATCH track metadata, then sync tags.
  const handleTrackSave = useCallback(
    async (updates: {
      id: string;
      title?: string;
      artist?: string;
      album_title?: string | null;
      musical_key?: string | null;
      notes?: string | null;
      stars?: number | null;
      is_favorite?: boolean;
      genreIds: string[];
      moodIds: string[];
    }) => {
      const trackId = updates.id;
      const patchBody: Record<string, unknown> = {};
      for (const k of [
        "title",
        "artist",
        "album_title",
        "musical_key",
        "notes",
        "stars",
        "is_favorite",
      ] as const) {
        if (updates[k] !== undefined) patchBody[k] = updates[k];
      }
      // Always send album_title/musical_key/notes so empty strings persist
      if (updates.album_title !== undefined) patchBody.album_title = updates.album_title;
      if (updates.musical_key !== undefined) patchBody.musical_key = updates.musical_key;
      if (updates.notes !== undefined) patchBody.notes = updates.notes;

      await Promise.all([
        Object.keys(patchBody).length > 0
          ? fetch(`/api/tracks/${trackId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(patchBody),
            })
          : Promise.resolve(),
        fetch(`/api/tracks/${trackId}/tags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            genreIds: updates.genreIds,
            moodIds: updates.moodIds,
          }),
        }),
      ]);

      // Refetch the single track to get fresh genres/moods in joined shape.
      const res = await fetch(`/api/tracks/${trackId}`).then((r) => r.json());
      const fresh = res.track as Track | undefined;
      setTracks((prev) => {
        const next = prev.map((t) => (t.id === trackId ? (fresh ?? t) : t));
        writeCache({ ts: Date.now(), tracks: next, albums, genres, moods });
        return next;
      });
    },
    [albums, genres, moods]
  );

  // Album detail modal save — PATCH album metadata, then sync tags.
  const handleAlbumSave = useCallback(
    async (updates: {
      id: string;
      title?: string;
      artist?: string;
      notes?: string | null;
      stars?: number | null;
      is_favorite?: boolean;
      genreIds: string[];
      moodIds: string[];
    }) => {
      const albumId = updates.id;
      const patchBody: Record<string, unknown> = {};
      for (const k of [
        "title",
        "artist",
        "notes",
        "stars",
        "is_favorite",
      ] as const) {
        if (updates[k] !== undefined) patchBody[k] = updates[k];
      }
      if (updates.notes !== undefined) patchBody.notes = updates.notes;

      await Promise.all([
        Object.keys(patchBody).length > 0
          ? fetch(`/api/albums/${albumId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(patchBody),
            })
          : Promise.resolve(),
        fetch(`/api/albums/${albumId}/tags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            genreIds: updates.genreIds,
            moodIds: updates.moodIds,
          }),
        }),
      ]);

      const res = await fetch(`/api/albums/${albumId}`).then((r) => r.json());
      const fresh = res.album as Album | undefined;
      setAlbums((prev) => {
        const next = prev.map((a) => (a.id === albumId ? (fresh ?? a) : a));
        writeCache({ ts: Date.now(), tracks, albums: next, genres, moods });
        return next;
      });
    },
    [tracks, genres, moods]
  );

  // Hard refresh + cache bust (used by SyncButton via loadLibrary already,
  // but expose a clearCache helper for completeness).
  void clearCache;

  // Show a spinner only on the very first load when we have no data yet.
  if (loading && tracks.length === 0 && albums.length === 0) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="animate-spin text-cream/40" size={24} />
      </div>
    );
  }

  if (error && tracks.length === 0 && albums.length === 0) {
    return (
      <div className="p-6">
        <div className="rounded-xl bg-secondary/10 border border-secondary/30 px-4 py-3 text-sm text-secondary-hover">
          Failed to load library: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 flex flex-col gap-4">
      {/* Header row: search + sync + view mode + play all.
          Single row at all viewport widths — no flex-wrap. Search is the
          only flexible element (flex-1 min-w-0); all sibling buttons keep
          their natural width via flex-shrink-0. */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Search — the only flexible element. flex-1 + min-w-0 lets it
            absorb available space and shrink on narrow screens. */}
        <div className="relative flex-1 min-w-0">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-cream/30 pointer-events-none"
          />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => updateFilters({ search: e.target.value })}
            placeholder="Search…"
            className="w-full h-9 pl-9 pr-9 rounded-xl bg-cream/[0.04] border border-cream/[0.06] text-sm text-cream/90 placeholder:text-cream/30 focus:outline-none focus:border-cream/20 transition-colors"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => updateFilters({ search: "" })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-cream/30 hover:text-cream/70 transition-colors"
              aria-label="Clear search"
            >
              <X size={15} />
            </button>
          )}
        </div>
        <SyncButton onSyncComplete={loadLibrary} variant="header" />
        <ViewModeSwitch value={view} onChange={setView} />
        <button
          type="button"
          onClick={playAllVisible}
          disabled={pagedItems.length === 0}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-cream/[0.06] hover:bg-cream/[0.12] text-sm text-cream/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
          aria-label="Play all visible"
          title="Play all visible items in order"
        >
          <Play size={14} className="text-cream/70" fill="currentColor" />
          <span className="hidden sm:inline">Play all</span>
        </button>
      </div>

      <FilterBar
        filters={filters}
        onChange={updateFilters}
        genres={genres}
        moods={moods}
      />

      {/* Summary */}
      <div className="flex items-center gap-4 text-xs text-cream/40">
        <span>{filteredTracks.length} tracks</span>
        <span>{filteredAlbums.length} albums</span>
      </div>

      {/* Unified list — albums and tracks interleaved in sort order */}
      <section className="flex flex-col gap-2">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.015 } },
          }}
          className="flex flex-col gap-1.5"
        >
          {pagedItems.length === 0 ? (
            <EmptyState label="No items match your filters." />
          ) : (
            pagedItems.map((item, i) => (
              <motion.div
                key={item.kind === "album" ? `a-${item.album.id}` : `t-${item.track.id}`}
                variants={{
                  hidden: { opacity: 0, y: 6 },
                  visible: { opacity: 1, y: 0 },
                }}
              >
                {item.kind === "album" ? (
                  <AlbumRow
                    album={item.album}
                    tracks={
                      item.album.spotify_id
                        ? tracksByAlbum.get(item.album.spotify_id) ?? []
                        : item.album.tracks ?? []
                    }
                    onRate={(s) => rateAlbum(item.album.id, s)}
                    onToggleFavorite={(v) => toggleAlbumFavorite(item.album.id, v)}
                    onRateTrack={(tid, s) => rateTrack(tid, s)}
                    onToggleTrackFavorite={(tid, v) =>
                      toggleTrackFavorite(tid, v)
                    }
                    onOpenTrackDetail={(tid) => {
                      const t = tracks.find((x) => x.id === tid) ?? null;
                      setEditingTrack(t);
                    }}
                    onOpenAlbumDetail={() => setEditingAlbum(item.album)}
                    currentTrackId={currentTrackId}
                  />
                ) : (
                  <TrackRow
                    track={item.track}
                    displayNumber={view === "tracks" ? safeUnifiedPage * pageSize + i + 1 : undefined}
                    showLikedBadge={false}
                    queueTracks={pagedItems
                      .filter((p) => p.kind === "track")
                      .map((p) => (p as { kind: "track"; track: Track }).track)}
                    onRate={(s) => rateTrack(item.track.id, s)}
                    onToggleFavorite={(v) => toggleTrackFavorite(item.track.id, v)}
                    onOpenDetail={() => setEditingTrack(item.track)}
                  />
                )}
              </motion.div>
            ))
          )}
        </motion.div>

        {unifiedPageCount > 1 && (
          <Pagination
            page={safeUnifiedPage}
            pageCount={unifiedPageCount}
            total={unifiedList.length}
            pageSize={pageSize}
            onChange={setUnifiedPage}
          />
        )}
      </section>

      {/* Track detail modal */}
      <TrackDetailModal
        track={editingTrack}
        genres={genres}
        moods={moods}
        onClose={() => setEditingTrack(null)}
        onSave={async (updates) => {
          await handleTrackSave(updates);
          // Also reflect updated state in the editing track reference so
          // re-render uses the new data; the parent setTracks above handles
          // the canonical state.
        }}
        // Only allow deleting tracks the user individually saved (liked
        // songs). Album tracks that aren't liked aren't individually saved
        // in the library, so there's nothing to delete — removing the whole
        // album is the way to drop them.
        onDelete={
          editingTrack?.is_liked
            ? (trackId: string) => deleteTrack(trackId)
            : undefined
        }
      />

      {/* Album detail modal */}
      <AlbumDetailModal
        album={editingAlbum}
        genres={genres}
        moods={moods}
        onClose={() => setEditingAlbum(null)}
        onSave={handleAlbumSave}
        onDelete={(albumId: string) => deleteAlbum(albumId)}
      />
    </div>
  );
}

function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
}) {
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-xs text-cream/50">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-cream/[0.04] border border-cream/[0.06] hover:bg-cream/[0.08] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="tabular-nums">
          {page + 1} / {pageCount}
        </span>
        <button
          onClick={() => onChange(Math.min(pageCount - 1, page + 1))}
          disabled={page >= pageCount - 1}
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-cream/[0.04] border border-cream/[0.06] hover:bg-cream/[0.08] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Next page"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-center py-10 text-sm text-cream/30 rounded-xl bg-cream/[0.02] border border-cream/[0.04]">
      {label}
    </div>
  );
}

function sortTracks(
  a: Track,
  b: Track,
  key: FilterState["sort"],
  direction: FilterState["sortDirection"]
): number {
  const mul = direction === "asc" ? 1 : -1;
  switch (key) {
    case "title":
      return a.title.localeCompare(b.title) * mul;
    case "artist":
      return a.artist.localeCompare(b.artist) * mul;
    case "album":
      return (a.album_title ?? "").localeCompare(b.album_title ?? "") * mul;
    case "stars":
      return ((a.stars ?? 0) - (b.stars ?? 0)) * mul;
    case "play_count":
      return (a.play_count_all_time - b.play_count_all_time) * mul;
    case "added_at":
      return (new Date(a.added_at).getTime() - new Date(b.added_at).getTime()) * mul;
    case "last_played_at": {
      const av = a.last_played_at ? new Date(a.last_played_at).getTime() : 0;
      const bv = b.last_played_at ? new Date(b.last_played_at).getTime() : 0;
      return (av - bv) * mul;
    }
    case "updated_at": {
      const av = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const bv = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return (av - bv) * mul;
    }
    default:
      return 0;
  }
}

function sortAlbums(
  a: Album,
  b: Album,
  key: FilterState["sort"],
  direction: FilterState["sortDirection"]
): number {
  const mul = direction === "asc" ? 1 : -1;
  switch (key) {
    case "title":
      return a.title.localeCompare(b.title) * mul;
    case "artist":
      return a.artist.localeCompare(b.artist) * mul;
    case "stars":
      return ((a.stars ?? 0) - (b.stars ?? 0)) * mul;
    case "play_count":
      return 0; // albums have no play count
    case "added_at":
      return (new Date(a.added_at).getTime() - new Date(b.added_at).getTime()) * mul;
    case "last_played_at":
      return 0;
    default:
      return 0;
  }
}