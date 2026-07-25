"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Loader2, ChevronLeft, ChevronRight, Search, X, Play, LogIn } from "lucide-react";
import type { Album, Genre, Mood, Track, ViewMode, SortKey, SortDirection } from "@/lib/types";
import FilterBar, { type FilterState } from "@/components/FilterBar";
import ViewModeSwitch from "@/components/ViewModeSwitch";
import TrackRow from "@/components/TrackRow";
import AlbumRow from "@/components/AlbumRow";
import { usePlayback } from "@/lib/playback";

// ── Types ──────────────────────────────────────────────────────────────────

interface ProfileMusicExplorerProps {
  tracks: Track[];
  albums: Album[];
  genres: Genre[];
  moods: Mood[];
}

// Unified list type — albums and tracks interleaved in sort order,
// same pattern as the library page.
type UnifiedItem =
  | { kind: "album"; album: Album }
  | { kind: "track"; track: Track };

// ── Helpers ─────────────────────────────────────────────────────────────────

// Build a tree from the flat genre list (same as FilterBar / library page).
// The API returns flat rows with parent_id but no children array.
function buildGenreTree(flat: Genre[]): Genre[] {
  const map = new Map<string, Genre>();
  flat.forEach((g) => map.set(g.id, { ...g, children: [] }));
  const roots: Genre[] = [];
  map.forEach((g) => {
    if (g.parent_id && map.has(g.parent_id)) {
      map.get(g.parent_id)!.children!.push(g);
    } else {
      roots.push(g);
    }
  });
  const sortRec = (list: Genre[]) => {
    list.sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
    );
    list.forEach((g) => g.children && sortRec(g.children));
  };
  sortRec(roots);
  return roots;
}

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
    case "album": {
      const aAlbum = a.kind === "album" ? a.album.title : (a.track.album_title ?? "");
      const bAlbum = b.kind === "album" ? b.album.title : (b.track.album_title ?? "");
      return aAlbum.localeCompare(bAlbum) * mul;
    }
    case "stars":
      return ((aStars ?? 0) - (bStars ?? 0)) * mul;
    case "play_count": {
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

function sortTracks(
  a: Track,
  b: Track,
  key: SortKey,
  direction: SortDirection
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
  key: SortKey,
  direction: SortDirection
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
      return 0;
    case "added_at":
      return (new Date(a.added_at).getTime() - new Date(b.added_at).getTime()) * mul;
    case "last_played_at":
      return 0;
    case "updated_at": {
      const av = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const bv = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return (av - bv) * mul;
    }
    default:
      return 0;
  }
}

// ── Viewport hook ───────────────────────────────────────────────────────────

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

const DESKTOP_PAGE_SIZE = 50;
const MOBILE_PAGE_SIZE = 20;

// ── Component ──────────────────────────────────────────────────────────────

export default function ProfileMusicExplorer({
  tracks,
  albums,
  genres,
  moods,
}: ProfileMusicExplorerProps) {
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
    minDuration: null,
    maxDuration: null,
  });

  const isDesktop = useIsDesktop();
  const pageSize = isDesktop ? DESKTOP_PAGE_SIZE : MOBILE_PAGE_SIZE;
  const [unifiedPage, setUnifiedPage] = useState(0);

  // Viewer session state — determines whether playback is available.
  // A visitor who isn't signed in to Muse (with Spotify Premium) sees a
  // "Sign in to play" prompt instead of play buttons.
  const [viewerSession, setViewerSession] = useState<{
    checked: boolean;
    authenticated: boolean;
    isPremium: boolean;
  }>({ checked: false, authenticated: false, isPremium: false });

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        setViewerSession({
          checked: true,
          authenticated: !!data.authenticated,
          isPremium: data.user?.spotify_product === "premium",
        });
      })
      .catch(() => {
        if (!active) return;
        setViewerSession({ checked: true, authenticated: false, isPremium: false });
      });
    return () => {
      active = false;
    };
  }, []);

  const { playAlbum: playAlbumContext, currentTrackId } = usePlayback();

  // Can the viewer play music? Only if they're signed in with Spotify Premium.
  const canPlay = viewerSession.authenticated && viewerSession.isPremium;

  const updateFilters = useCallback(
    (next: Partial<FilterState>) =>
      setFilters((prev) => ({ ...prev, ...next })),
    []
  );

  // Reset pagination on filter/view/page-size changes.
  useEffect(() => {
    setUnifiedPage(0);
  }, [filters, view, pageSize]);

  // ── Genre tree + descendant expansion ──────────────────────────────────
  // Same descendant-expansion logic as the library page: selecting a parent
  // genre includes/excludes all its descendants too.

  // The profile page passes genres as a flat list (with parent_id + depth).
  // For the descendant computation, we need a tree — build it once.
  const genreTree = useMemo(() => buildGenreTree(genres), [genres]);

  const genreDescendantIds = useMemo(() => {
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
    genreTree.forEach(collect);
    return descMap;
  }, [genreTree]);

  const genreIncludeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, state] of Object.entries(filters.genreFilters)) {
      if (state === "include") {
        ids.add(id);
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

  // ── Duration range ──────────────────────────────────────────────────────
  const durationRange = useMemo(() => {
    let min = Infinity;
    let max = 0;
    for (const t of tracks) {
      if (t.duration_ms && t.duration_ms > 0) {
        if (t.duration_ms < min) min = t.duration_ms;
        if (t.duration_ms > max) max = t.duration_ms;
      }
    }
    if (min === Infinity) min = 0;
    return { min: Math.floor(min / 1000), max: Math.ceil(max / 1000) };
  }, [tracks]);

  // ── tracksByAlbum map ────────────────────────────────────────────────────
  // MUST be declared before filteredAlbums (which uses it for the duration
  // filter) — useMemo TDZ ordering rule.
  const tracksByAlbum = useMemo(() => {
    const map = new Map<string, Track[]>();
    tracks.forEach((t) => {
      if (!t.album_spotify_id) return;
      const arr = map.get(t.album_spotify_id) ?? [];
      arr.push(t);
      map.set(t.album_spotify_id, arr);
    });
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

  // ── Filter albums ────────────────────────────────────────────────────────
  const filteredAlbums = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return albums
      .filter((a) => {
        if (filters.favoritesOnly && !a.is_favorite) return false;
        if (q) {
          const hay = `${a.title} ${a.artist}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        const aGenreIds = (a.genres ?? []).map((g) => g.id);
        if (genreIncludeIds) {
          if (!aGenreIds.some((id) => genreIncludeIds.has(id))) return false;
        }
        if (genreExcludeIds) {
          if (aGenreIds.some((id) => genreExcludeIds.has(id))) return false;
        }
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
        // Duration filter: album passes if any track is in range.
        if (filters.minDuration !== null || filters.maxDuration !== null) {
          const albumTracks = a.spotify_id
            ? tracksByAlbum.get(a.spotify_id) ?? []
            : a.tracks ?? [];
          if (albumTracks.length > 0) {
            const anyInRange = albumTracks.some((t) => {
              if (!t.duration_ms) return false;
              const durSec = t.duration_ms / 1000;
              if (filters.minDuration !== null && durSec < filters.minDuration) return false;
              if (filters.maxDuration !== null && durSec > filters.maxDuration) return false;
              return true;
            });
            if (!anyInRange) return false;
          }
        }
        return true;
      })
      .sort((a, b) => sortAlbums(a, b, filters.sort, filters.sortDirection));
  }, [albums, filters, genreIncludeIds, genreExcludeIds, moodIncludeIds, moodExcludeIds, tracksByAlbum]);

  // ── Filter tracks ────────────────────────────────────────────────────────
  const filteredTracks = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const albumSpotifyIds = new Set(
      showAlbums ? filteredAlbums.map((a) => a.spotify_id).filter(Boolean) : []
    );
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
        const tGenreIds = (t.genres ?? []).map((g) => g.id);
        if (genreIncludeIds) {
          if (!tGenreIds.some((id) => genreIncludeIds.has(id))) return false;
        }
        if (genreExcludeIds) {
          if (tGenreIds.some((id) => genreExcludeIds.has(id))) return false;
        }
        const tMoodIds = (t.moods ?? []).map((m) => m.id);
        if (moodIncludeIds) {
          if (!tMoodIds.some((id) => moodIncludeIds.has(id))) return false;
        }
        if (moodExcludeIds) {
          if (tMoodIds.some((id) => moodExcludeIds.has(id))) return false;
        }
        if (filters.stars === "unrated") {
          if (!filters.trackLevelStars && t.album_spotify_id) {
            const albumStars = albumStarsBySpotifyId.get(t.album_spotify_id);
            if (albumStars !== undefined && albumStars !== null) return false;
          } else {
            if (t.stars !== null) return false;
          }
        } else if (typeof filters.stars === "number") {
          if (!filters.trackLevelStars && t.album_spotify_id) {
            const albumStars = albumStarsBySpotifyId.get(t.album_spotify_id);
            if (albumStars === undefined) {
              if (t.stars === null || t.stars < filters.stars) return false;
            } else {
              if (albumStars === null || albumStars < filters.stars) return false;
            }
          } else {
            if (t.stars === null || t.stars < filters.stars) return false;
          }
        }
        if (t.duration_ms) {
          const durSec = t.duration_ms / 1000;
          if (filters.minDuration !== null && durSec < filters.minDuration) return false;
          if (filters.maxDuration !== null && durSec > filters.maxDuration) return false;
        }
        return true;
      })
      .sort((a, b) => sortTracks(a, b, filters.sort, filters.sortDirection));
  }, [tracks, filters, genreIncludeIds, genreExcludeIds, moodIncludeIds, moodExcludeIds, showAlbums, filteredAlbums, albums]);

  // ── Unified list ─────────────────────────────────────────────────────────
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

  // ── Play all visible ─────────────────────────────────────────────────────
  const playAllVisible = useCallback(() => {
    if (!canPlay) return;
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
  }, [pagedItems, tracksByAlbum, playAlbumContext, canPlay]);

  // ── Empty state ──────────────────────────────────────────────────────────
  if (tracks.length === 0 && albums.length === 0) {
    return (
      <section className="rounded-2xl glass p-5">
        <h2 className="text-xs uppercase tracking-wide text-cream/40 mb-3">Music</h2>
        <p className="text-sm text-cream/30">No music imported yet.</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {/* Header row: search + view mode + play all */}
      <div className="flex items-center gap-2 sm:gap-3">
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
        <ViewModeSwitch value={view} onChange={setView} />
        {canPlay ? (
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
        ) : (
          <Link
            href="/api/spotify/auth"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-primary/10 hover:bg-primary/15 border border-primary/20 text-sm text-primary-hover transition-colors flex-shrink-0"
            title="Sign in to play music"
          >
            <LogIn size={14} />
            <span className="hidden sm:inline">Sign in to play</span>
          </Link>
        )}
      </div>

      {/* Non-premium banner for signed-in free-tier users */}
      {viewerSession.checked && viewerSession.authenticated && !viewerSession.isPremium && (
        <div className="rounded-xl bg-cream/[0.04] border border-cream/[0.06] px-4 py-2.5 text-xs text-cream/50">
          Spotify Premium is required for playback. You can still browse and filter the library.
        </div>
      )}

      <FilterBar
        filters={filters}
        onChange={updateFilters}
        genres={genres}
        moods={moods}
        durationMin={durationRange.min}
        durationMax={durationRange.max}
      />

      {/* Summary */}
      <div className="flex items-center gap-4 text-xs text-cream/40">
        <span>{filteredTracks.length} tracks</span>
        <span>{filteredAlbums.length} albums</span>
      </div>

      {/* Unified list — albums and tracks interleaved in sort order */}
      <div className="flex flex-col gap-2">
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
            <div className="text-center py-10 text-sm text-cream/30 rounded-xl bg-cream/[0.02] border border-cream/[0.04]">
              No items match your filters.
            </div>
          ) : (
            pagedItems.map((item) => (
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
                    readOnly
                    currentTrackId={currentTrackId}
                  />
                ) : (
                  <TrackRow
                    track={item.track}
                    readOnly
                    showLikedBadge
                    queueTracks={pagedItems
                      .filter((p) => p.kind === "track")
                      .map((p) => (p as { kind: "track"; track: Track }).track)}
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
      </div>
    </section>
  );
}

// ── Pagination sub-component ───────────────────────────────────────────────

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