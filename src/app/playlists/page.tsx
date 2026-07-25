"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Download,
  Check,
  Music,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  X,
  Tag,
  Palette,
  Play,
  Pause,
} from "lucide-react";
import type { Genre, Mood } from "@/lib/types";
import { usePlayback } from "@/lib/playback";

interface SpotifyPlaylist {
  id: string;
  name: string;
  uri: string;
  images: Array<{ url: string }>;
  owner: { id: string; display_name: string | null } | null;
  tracks: { total: number } | null;
  public: boolean;
  description: string | null;
}

interface PlaylistTrack {
  id: string;
  uri: string;
  name: string;
  artist: string;
  album: string;
  duration_ms: number;
  cover_url: string | null;
}

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [moods, setMoods] = useState<Mood[]>([]);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importMenuId, setImportMenuId] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [tracksError, setTracksError] = useState<string | null>(null);

  // Track list preview state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<PlaylistTrack[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);

  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);

  const { playFromList, isPlaying, currentTrackId } = usePlayback();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [playlistsRes, genresRes, moodsRes, importedRes] =
        await Promise.allSettled([
          fetch("/api/spotify/playlists"),
          fetch("/api/genres"),
          fetch("/api/moods"),
          fetch("/api/spotify/imported-playlist-ids"),
        ]);

      if (genresRes.status === "fulfilled") {
        try {
          const g = await genresRes.value.json();
          setGenres(Array.isArray(g) ? g : g?.genres ?? []);
        } catch {
          /* ignore */
        }
      }
      if (moodsRes.status === "fulfilled") {
        try {
          const m = await moodsRes.value.json();
          setMoods(Array.isArray(m) ? m : m?.moods ?? []);
        } catch {
          /* ignore */
        }
      }
      if (importedRes.status === "fulfilled") {
        try {
          const i = await importedRes.value.json();
          setImportedIds(new Set(i.importedIds ?? []));
        } catch {
          /* ignore */
        }
      }

      if (playlistsRes.status === "rejected") {
        setError("Failed to reach the Spotify playlists API.");
        return;
      }

      const playlistsResponse = playlistsRes.value;
      let payload: unknown = null;
      try {
        payload = await playlistsResponse.json();
      } catch {
        setError("Spotify playlists API returned an invalid response.");
        return;
      }

      const obj = (payload ?? {}) as Record<string, unknown>;

      if (playlistsResponse.status === 401) {
        setError(
          (obj.error as string | undefined) ??
            "Spotify returned 401 (unauthorized)."
        );
        return;
      }

      if (!playlistsResponse.ok) {
        setError(
          (obj.error as string | undefined) ??
            `Spotify API error ${playlistsResponse.status}`
        );
        return;
      }

      const rawList = Array.isArray(payload)
        ? (payload as SpotifyPlaylist[])
        : (obj.playlists as SpotifyPlaylist[] | undefined) ?? [];
      const list = Array.isArray(rawList) ? rawList : [];
      setPlaylists(list);
      if (obj.error && !obj.playlists) {
        setError(String(obj.error));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleImport = useCallback(
    async (playlistId: string) => {
      setImporting(playlistId);
      try {
        const res = await fetch("/api/spotify/import-playlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playlist_id: playlistId,
            genreIds: selectedGenres,
            moodIds: selectedMoods,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          const msg =
            data.imported > 0
              ? `Imported ${data.imported} new track${data.imported === 1 ? "" : "s"} (${data.total} total in playlist)`
              : `All ${data.total} tracks already in library`;
          setToast(msg);
          setImportedIds((prev) => new Set(prev).add(playlistId));
        } else {
          setToast(`Error: ${data.error ?? "Failed to import"}`);
        }
      } catch {
        setToast("Failed to import playlist");
      } finally {
        setImporting(null);
        setImportMenuId(null);
        setSelectedGenres([]);
        setSelectedMoods([]);
        setTimeout(() => setToast(null), 4000);
      }
    },
    [selectedGenres, selectedMoods]
  );

  const toggleGenre = (id: string) => {
    setSelectedGenres((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleMood = (id: string) => {
    setSelectedMoods((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Fetch track list for a playlist (for preview + play)
  const fetchPlaylistTracks = useCallback(async (playlistId: string) => {
    setTracksLoading(true);
    setTracksError(null);
    try {
      const res = await fetch(
        `/api/spotify/playlist-tracks?playlist_id=${encodeURIComponent(playlistId)}`
      );
      const data = await res.json();
      if (res.ok && data.tracks) {
        setPlaylistTracks(data.tracks);
        if (data.followed) {
          setTracksError("Followed playlists can't be previewed — Spotify only allows track access for playlists you own or collaborate on.");
        }
      } else {
        setTracksError(data.error ?? `Error ${res.status}`);
        setPlaylistTracks([]);
      }
    } catch (e) {
      setTracksError(String(e));
      setPlaylistTracks([]);
    } finally {
      setTracksLoading(false);
    }
  }, []);

  const handleExpand = useCallback(
    (pl: SpotifyPlaylist) => {
      if (expandedId === pl.id) {
        setExpandedId(null);
        setPlaylistTracks([]);
        setTracksError(null);
      } else {
        setExpandedId(pl.id);
        setPlaylistTracks([]);
        setTracksError(null);
        void fetchPlaylistTracks(pl.id);
      }
    },
    [expandedId, fetchPlaylistTracks]
  );

  const playPlaylist = useCallback(
    (tracks: PlaylistTrack[], startIndex = 0) => {
      const list = tracks
        .filter((t) => t.uri)
        .map((t) => ({
          id: t.id,
          title: t.name,
          spotifyUri: t.uri,
          artist: t.artist,
          albumArt: t.cover_url,
        }));
      if (list.length > 0) {
        playFromList(list, startIndex);
      }
    },
    [playFromList]
  );

  const formatDuration = (ms: number): string => {
    const sec = Math.round(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const genreTree = useMemo(() => buildGenreTree(genres), [genres]);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 flex flex-col gap-4">
      {loading ? (
        <PlaylistsSkeleton />
      ) : error ? (
        <div className="rounded-xl bg-warning/10 border border-warning/30 px-4 py-4 text-sm text-warning-light flex items-start gap-3">
          <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-medium mb-0.5">Couldn&apos;t load playlists</div>
            <div className="text-warning-light/80 mb-3">{error}</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setError(null);
                  setLoading(true);
                  void load();
                }}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-cream/[0.08] text-cream/80 text-sm hover:bg-cream/[0.12] transition-colors"
              >
                <RefreshCw size={14} />
                Retry
              </button>
              <a
                href="/api/spotify/auth"
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-spotify text-base text-sm font-medium hover:bg-spotify-hover transition-colors"
              >
                Reconnect Spotify
              </a>
            </div>
          </div>
        </div>
      ) : playlists.length === 0 ? (
        <div className="text-center py-16 text-sm text-cream/30 rounded-xl bg-cream/[0.02] border border-cream/[0.04]">
          No playlists found. Make sure your Spotify account has playlists.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {playlists.map((pl) => {
            const isImported = importedIds.has(pl.id);
            const menuOpen = importMenuId === pl.id;
            const isImporting = importing === pl.id;
            const isExpanded = expandedId === pl.id;

            return (
              <div
                key={pl.id}
                className="rounded-xl bg-cream/[0.02] border border-cream/[0.04] overflow-hidden"
              >
                {/* Playlist row */}
                <div className="flex items-center gap-3 px-3 py-3 hover:bg-cream/[0.04] transition-colors">
                  {/* Cover — click to expand track list */}
                  <div
                    className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-cream/[0.06] cursor-pointer"
                    onClick={() => handleExpand(pl)}
                  >
                    {pl.images?.[0]?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={pl.images[0].url}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music size={18} className="text-cream/20" />
                      </div>
                    )}
                  </div>

                  {/* Info — click to expand */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => handleExpand(pl)}
                  >
                    <div className="text-sm font-medium text-cream/90 truncate">
                      {pl.name}
                    </div>
                    <div className="text-xs text-cream/40 truncate">
                      {pl.tracks?.total ?? 0} tracks
                      {pl.owner?.display_name
                        ? ` · by ${pl.owner.display_name}`
                        : ""}
                      {pl.public ? "" : " · Private"}
                    </div>
                  </div>

                  {/* Play button — plays entire playlist */}
                  <button
                    onClick={async () => {
                      if (isExpanded && playlistTracks.length > 0) {
                        playPlaylist(playlistTracks, 0);
                      } else {
                        // Expand and fetch, then play
                        setExpandedId(pl.id);
                        setTracksLoading(true);
                        try {
                          const res = await fetch(
                            `/api/spotify/playlist-tracks?playlist_id=${encodeURIComponent(pl.id)}`
                          );
                          const data = await res.json();
                          if (res.ok && data.tracks) {
                            setPlaylistTracks(data.tracks);
                            playPlaylist(data.tracks, 0);
                          }
                        } catch {
                          /* ignore */
                        } finally {
                          setTracksLoading(false);
                        }
                      }
                    }}
                    disabled={tracksLoading && isExpanded}
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-cream/[0.06] hover:bg-cream/[0.12] text-cream/70 hover:text-cream transition-colors flex-shrink-0 disabled:opacity-30"
                    title="Play playlist"
                  >
                    {tracksLoading && isExpanded ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Play size={16} className="ml-0.5" fill="currentColor" />
                    )}
                  </button>

                  {/* Import status / button */}
                  <button
                    onClick={() => {
                      if (menuOpen) {
                        setImportMenuId(null);
                        setSelectedGenres([]);
                        setSelectedMoods([]);
                      } else {
                        setImportMenuId(pl.id);
                        setSelectedGenres([]);
                        setSelectedMoods([]);
                      }
                    }}
                    className="flex items-center gap-1.5 text-xs flex-shrink-0 px-2.5 h-8 rounded-xl border transition-colors"
                    style={
                      isImported && !menuOpen
                        ? {
                            backgroundColor: "rgba(34,197,94,0.1)",
                            borderColor: "rgba(34,197,94,0.3)",
                            color: "rgb(134,239,172)",
                          }
                        : {
                            backgroundColor: "rgba(255,255,255,0.04)",
                            borderColor: "rgba(255,255,255,0.06)",
                            color: "rgba(255,255,255,0.5)",
                          }
                    }
                  >
                    {isImported && !menuOpen ? (
                      <>
                        <Check size={14} className="text-success" />
                        <span className="hidden sm:inline">Imported</span>
                      </>
                    ) : (
                      <>
                        <Download size={14} />
                        <span className="hidden sm:inline">
                          {menuOpen ? "Close" : "Import"}
                        </span>
                      </>
                    )}
                  </button>
                  <ChevronRight
                    size={14}
                    className={`text-cream/30 transition-transform flex-shrink-0 ${
                      isExpanded ? "rotate-90" : ""
                    }`}
                  />
                </div>

                {/* Expand: track list preview */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="overflow-hidden border-t border-cream/[0.04]"
                    >
                      <div className="px-3 py-2 flex flex-col gap-0.5 max-h-[400px] overflow-y-auto">
                        {/* Play all button */}
                        {playlistTracks.length > 0 && (
                          <button
                            onClick={() => playPlaylist(playlistTracks, 0)}
                            className="self-start inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-success/15 text-success-light border border-success/25 text-xs hover:bg-success/25 transition-colors mb-1"
                          >
                            <Play size={12} fill="currentColor" />
                            Play all
                          </button>
                        )}

                        {tracksLoading ? (
                          <div className="flex items-center gap-2 py-4 text-sm text-cream/40">
                            <Loader2 size={14} className="animate-spin" />
                            Loading tracks…
                          </div>
                        ) : tracksError ? (
                          <div className="py-4 text-sm text-secondary-light">
                            {tracksError}
                          </div>
                        ) : playlistTracks.length === 0 ? (
                          <div className="py-4 text-sm text-cream/30">
                            No playable tracks found.
                          </div>
                        ) : (
                          playlistTracks.map((track, index) => {
                            const isCurrent =
                              currentTrackId === track.id ||
                              currentTrackId === track.uri;
                            return (
                              <div
                                key={track.id}
                                className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-cream/[0.04] cursor-pointer group transition-colors ${
                                  isCurrent ? "bg-success/[0.06]" : ""
                                }`}
                                onClick={() =>
                                  playPlaylist(playlistTracks, index)
                                }
                              >
                                {/* Play / pause indicator */}
                                <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                                  {isCurrent && isPlaying ? (
                                    <Pause
                                      size={12}
                                      className="text-success"
                                      fill="currentColor"
                                    />
                                  ) : (
                                    <Play
                                      size={12}
                                      className="text-cream/30 group-hover:text-cream/70 transition-colors ml-0.5"
                                      fill="currentColor"
                                    />
                                  )}
                                </div>

                                {/* Cover */}
                                <div className="w-8 h-8 rounded flex-shrink-0 overflow-hidden bg-cream/[0.06]">
                                  {track.cover_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={track.cover_url}
                                      alt=""
                                      className="w-full h-full object-cover"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <Music
                                        size={12}
                                        className="text-cream/20"
                                      />
                                    </div>
                                  )}
                                </div>

                                {/* Title + artist */}
                                <div className="flex-1 min-w-0">
                                  <div
                                    className={`text-xs truncate ${
                                      isCurrent
                                        ? "text-success-light"
                                        : "text-cream/80"
                                    }`}
                                  >
                                    {track.name}
                                  </div>
                                  <div className="text-[11px] text-cream/40 truncate">
                                    {track.artist}
                                  </div>
                                </div>

                                {/* Duration */}
                                <span className="text-[11px] text-cream/30 tabular-nums flex-shrink-0">
                                  {formatDuration(track.duration_ms)}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Import menu */}
                <AnimatePresence initial={false}>
                  {menuOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-3 pt-1 flex flex-col gap-3 border-t border-cream/[0.04]">
                        <div className="text-xs text-cream/50 pt-1">
                          {isImported
                            ? "Update import — new tracks will be added, existing tracks stay (tags are layered)."
                            : `Import all ${pl.tracks?.total ?? 0} tracks into your Muse library.`}
                        </div>

                        {/* Genre tree picker */}
                        <div>
                          <div className="text-xs text-cream/50 mb-1.5 flex items-center gap-1">
                            <Tag size={11} /> Assign genres (optional)
                          </div>
                          {genreTree.length === 0 ? (
                            <span className="text-xs text-cream/30">
                              No genres yet — create some on the Genres page
                            </span>
                          ) : (
                            <div className="rounded-xl bg-cream/[0.03] border border-cream/[0.04] p-2 max-h-48 overflow-y-auto">
                              {genreTree.map((g) => (
                                <GenreCheckItem
                                  key={g.id}
                                  genre={g}
                                  depth={0}
                                  selectedIds={new Set(selectedGenres)}
                                  onToggle={toggleGenre}
                                />
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Mood picker */}
                        <div>
                          <div className="text-xs text-cream/50 mb-1.5 flex items-center gap-1">
                            <Palette size={11} /> Assign moods (optional)
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {moods.length === 0 ? (
                              <span className="text-xs text-cream/30">
                                No moods yet — create some on the Moods page
                              </span>
                            ) : (
                              moods.map((m) => (
                                <button
                                  key={m.id}
                                  onClick={() => toggleMood(m.id)}
                                  className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs transition-colors ${
                                    selectedMoods.includes(m.id)
                                      ? "bg-secondary/20 text-secondary-light border border-secondary/40"
                                      : "bg-cream/[0.04] text-cream/50 border border-cream/[0.06] hover:bg-cream/[0.08]"
                                  }`}
                                >
                                  {selectedMoods.includes(m.id) && (
                                    <Check size={11} />
                                  )}
                                  {m.color && (
                                    <span
                                      className="w-2 h-2 rounded-full"
                                      style={{ backgroundColor: m.color }}
                                    />
                                  )}
                                  {m.name}
                                </button>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Import button + cancel */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => handleImport(pl.id)}
                            disabled={isImporting}
                            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-success/20 text-success-light border border-success/30 text-sm hover:bg-success/30 transition-colors disabled:opacity-50"
                          >
                            {isImporting ? (
                              <>
                                <Loader2 size={14} className="animate-spin" />
                                Importing…
                              </>
                            ) : (
                              <>
                                <Download size={14} />
                                {isImported
                                  ? "Update import"
                                  : `Import ${pl.tracks?.total ?? 0} tracks`}
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => {
                              setImportMenuId(null);
                              setSelectedGenres([]);
                              setSelectedMoods([]);
                            }}
                            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-cream/[0.04] text-cream/50 border border-cream/[0.06] text-sm hover:bg-cream/[0.08] transition-colors"
                          >
                            <X size={14} />
                            Cancel
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl glass-strong text-sm text-cream/90 border border-cream/10 shadow-lg"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Genre tree checkbox item for the import menu
function GenreCheckItem({
  genre,
  depth,
  selectedIds,
  onToggle,
}: {
  genre: Genre;
  depth: number;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = (genre.children?.length ?? 0) > 0;
  const selected = selectedIds.has(genre.id);

  return (
    <div>
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-cream/[0.04] cursor-pointer"
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={() => onToggle(genre.id)}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) setOpen((v) => !v);
          }}
          className="w-4 h-4 flex items-center justify-center text-cream/30 flex-shrink-0"
        >
          {hasChildren ? (open ? "▾" : "▸") : ""}
        </button>
        <div
          className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors ${
            selected ? "bg-primary border-primary-hover" : "border-cream/20"
          }`}
        >
          {selected && <Check size={10} className="text-cream" />}
        </div>
        <span
          className={`text-sm ${selected ? "text-primary-light" : "text-cream/70"}`}
        >
          {genre.name}
        </span>
      </div>
      {hasChildren && open && (
        <div>
          {genre.children!.map((child) => (
            <GenreCheckItem
              key={child.id}
              genre={child}
              depth={depth + 1}
              selectedIds={selectedIds}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PlaylistsSkeleton() {
  return (
    <div className="flex flex-col gap-1.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl bg-cream/[0.02] border border-cream/[0.04] px-3 py-3 flex items-center gap-3 animate-pulse"
        >
          <div className="w-12 h-12 rounded-lg bg-cream/[0.06]" />
          <div className="flex-1 flex flex-col gap-1.5">
            <div className="h-3 w-1/3 rounded bg-cream/[0.06]" />
            <div className="h-2.5 w-1/4 rounded bg-cream/[0.04]" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Build tree from flat genre list
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