"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import type { Album, Genre, Mood, Track, ViewMode } from "@/lib/types";
import FilterBar, { type FilterState } from "@/components/FilterBar";
import ViewModeSwitch from "@/components/ViewModeSwitch";
import TrackRow from "@/components/TrackRow";
import AlbumRow from "@/components/AlbumRow";
import SyncButton from "@/components/SyncButton";
import TrackDetailModal from "@/components/TrackDetailModal";
import AlbumDetailModal from "@/components/AlbumDetailModal";

export default function LibraryPage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [moods, setMoods] = useState<Mood[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<ViewMode>("both");
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    genreId: null,
    includeSubgenres: false,
    moodId: null,
    stars: null,
    favoritesOnly: false,
    sort: "added_at",
    sortDirection: "desc",
  });

  // Track detail modal state
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  // Album detail modal state
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);

  // Load library data.
  const loadLibrary = useCallback(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      fetch("/api/tracks").then((r) => r.json()),
      fetch("/api/albums").then((r) => r.json()),
      fetch("/api/genres").then((r) => r.json()),
      fetch("/api/moods").then((r) => r.json()),
    ])
      .then(([t, a, g, m]) => {
        if (!active) return;
        setTracks(Array.isArray(t) ? t : t.tracks ?? []);
        setAlbums(Array.isArray(a) ? a : a.albums ?? []);
        setGenres(Array.isArray(g) ? g : g.genres ?? []);
        setMoods(Array.isArray(m) ? m : m.moods ?? []);
        setError(null);
      })
      .catch((e) => active && setError(String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const cleanup = loadLibrary();
    return cleanup;
  }, [loadLibrary]);

  const updateFilters = useCallback(
    (next: Partial<FilterState>) =>
      setFilters((prev) => ({ ...prev, ...next })),
    []
  );

  // Collect descendant genre ids when "include subgenres" is on.
  const expandedGenreIds = useMemo(() => {
    if (!filters.genreId || !filters.includeSubgenres) return null;
    const ids = new Set<string>([filters.genreId]);
    let changed = true;
    const flat = genres.flatMap((g) => [g, ...(g.children ?? [])]);
    while (changed) {
      changed = false;
      flat.forEach((g) => {
        if (g.parent_id && ids.has(g.parent_id) && !ids.has(g.id)) {
          ids.add(g.id);
          changed = true;
        }
      });
    }
    return ids;
  }, [filters.genreId, filters.includeSubgenres, genres]);

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
        if (filters.genreId) {
          const ok =
            expandedGenreIds
              ? (a.genres ?? []).some((g) => expandedGenreIds.has(g.id))
              : (a.genres ?? []).some((g) => g.id === filters.genreId);
          if (!ok) return false;
        }
        if (filters.moodId && !(a.moods ?? []).some((m) => m.id === filters.moodId))
          return false;
        if (filters.stars === "unrated") {
          if (a.stars !== null) return false;
        } else if (typeof filters.stars === "number") {
          if (a.stars === null || a.stars < filters.stars) return false;
        }
        return true;
      })
      .sort((a, b) => sortAlbums(a, b, filters.sort, filters.sortDirection));
  }, [albums, filters, expandedGenreIds]);

  // Filter tracks.
  // When showing both albums and tracks, hide tracks that belong to a
  // displayed album — they're already visible inside the album row.
  const filteredTracks = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const albumSpotifyIds = new Set(
      showAlbums ? filteredAlbums.map((a) => a.spotify_id).filter(Boolean) : []
    );
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
        if (filters.genreId) {
          const ok =
            expandedGenreIds
              ? (t.genres ?? []).some((g) => expandedGenreIds.has(g.id))
              : (t.genres ?? []).some((g) => g.id === filters.genreId);
          if (!ok) return false;
        }
        if (filters.moodId && !(t.moods ?? []).some((m) => m.id === filters.moodId))
          return false;
        if (filters.stars === "unrated") {
          if (t.stars !== null) return false;
        } else if (typeof filters.stars === "number") {
          if (t.stars === null || t.stars < filters.stars) return false;
        }
        return true;
      })
      .sort((a, b) => sortTracks(a, b, filters.sort, filters.sortDirection));
  }, [tracks, filters, expandedGenreIds, showAlbums, filteredAlbums]);

  // Tracks grouped by album spotify id (for album expansion).
  const tracksByAlbum = useMemo(() => {
    const map = new Map<string, Track[]>();
    tracks.forEach((t) => {
      if (!t.album_spotify_id) return;
      const arr = map.get(t.album_spotify_id) ?? [];
      arr.push(t);
      map.set(t.album_spotify_id, arr);
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
  }, []);

  const toggleTrackFavorite = useCallback(
    async (trackId: string, value: boolean) => {
      // Optimistic update — flip the heart immediately
      setTracks((prev) =>
        prev.map((t) => (t.id === trackId ? { ...t, is_favorite: value } : t))
      );
      try {
        await fetch(`/api/tracks/${trackId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_favorite: value }),
        });
      } catch {
        // Revert on failure
        setTracks((prev) =>
          prev.map((t) => (t.id === trackId ? { ...t, is_favorite: !value } : t))
        );
      }
    },
    []
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
      setAlbums((prev) =>
        prev.map((a) => (a.id === albumId ? { ...a, is_favorite: value } : a))
      );
      try {
        await fetch(`/api/albums/${albumId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_favorite: value }),
        });
      } catch {
        // Revert on failure
        setAlbums((prev) =>
          prev.map((a) => (a.id === albumId ? { ...a, is_favorite: !value } : a))
        );
      }
    },
    []
  );

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
      setTracks((prev) =>
        prev.map((t) => (t.id === trackId ? (fresh ?? t) : t))
      );
    },
    []
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
      setAlbums((prev) =>
        prev.map((a) => (a.id === albumId ? (fresh ?? a) : a))
      );
    },
    []
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="animate-spin text-white/40" size={24} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-4 py-3 text-sm text-rose-300">
          Failed to load library: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <SyncButton onSyncComplete={loadLibrary} variant="header" />
        <ViewModeSwitch value={view} onChange={setView} />
      </div>

      <FilterBar
        filters={filters}
        onChange={updateFilters}
        genres={genres}
        moods={moods}
      />

      {/* Summary */}
      <div className="flex items-center gap-4 text-xs text-white/40">
        <span>{filteredTracks.length} tracks</span>
        <span>{filteredAlbums.length} albums</span>
      </div>

      {/* Albums */}
      {showAlbums && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs uppercase tracking-wide text-white/40 px-1">
            Albums
          </h2>
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.02 } },
            }}
            className="flex flex-col gap-1.5"
          >
            {filteredAlbums.length === 0 ? (
              <EmptyState label="No albums match your filters." />
            ) : (
              filteredAlbums.map((album) => (
                <motion.div
                  key={album.id}
                  variants={{
                    hidden: { opacity: 0, y: 6 },
                    visible: { opacity: 1, y: 0 },
                  }}
                >
                  <AlbumRow
                    album={album}
                    tracks={
                      album.spotify_id
                        ? tracksByAlbum.get(album.spotify_id) ?? []
                        : album.tracks ?? []
                    }
                    onRate={(s) => rateAlbum(album.id, s)}
                    onToggleFavorite={(v) => toggleAlbumFavorite(album.id, v)}
                    onRateTrack={(tid, s) => rateTrack(tid, s)}
                    onToggleTrackFavorite={(tid, v) =>
                      toggleTrackFavorite(tid, v)
                    }
                    onOpenTrackDetail={(tid) => {
                      const t = tracks.find((x) => x.id === tid) ?? null;
                      setEditingTrack(t);
                    }}
                    onOpenAlbumDetail={() => setEditingAlbum(album)}
                  />
                </motion.div>
              ))
            )}
          </motion.div>
        </section>
      )}

      {/* Tracks (only when not inside an album view) */}
      {showTracks && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs uppercase tracking-wide text-white/40 px-1">
            Tracks
          </h2>
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.015 } },
            }}
            className="flex flex-col gap-1.5"
          >
            {filteredTracks.length === 0 ? (
              <EmptyState label="No tracks match your filters." />
            ) : (
              filteredTracks.map((track) => (
                <motion.div
                  key={track.id}
                  variants={{
                    hidden: { opacity: 0, y: 6 },
                    visible: { opacity: 1, y: 0 },
                  }}
                >
                  <TrackRow
                    track={track}
                    showLikedBadge={false}
                    onRate={(s) => rateTrack(track.id, s)}
                    onToggleFavorite={(v) => toggleTrackFavorite(track.id, v)}
                    onOpenDetail={() => setEditingTrack(track)}
                    onRemoveFromLiked={() =>
                      setTracks((prev) =>
                        prev.map((t) =>
                          t.id === track.id ? { ...t, is_liked: false } : t
                        )
                      )
                    }
                  />
                </motion.div>
              ))
            )}
          </motion.div>
        </section>
      )}

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
      />

      {/* Album detail modal */}
      <AlbumDetailModal
        album={editingAlbum}
        genres={genres}
        moods={moods}
        onClose={() => setEditingAlbum(null)}
        onSave={handleAlbumSave}
      />
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-center py-10 text-sm text-white/30 rounded-xl bg-white/[0.02] border border-white/[0.04]">
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