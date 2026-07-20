"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Download,
  ChevronDown,
  ChevronRight,
  X,
  Check,
  Music,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import type { Genre, Mood } from "@/lib/types";

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

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [moods, setMoods] = useState<Mood[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Import config for the expanded playlist
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [playlistsRes, genresRes, moodsRes] = await Promise.allSettled([
        fetch("/api/spotify/playlists"),
        fetch("/api/genres"),
        fetch("/api/moods"),
      ]);

      // Genres + moods are non-fatal if they fail.
      if (genresRes.status === "fulfilled") {
        try {
          const g = await genresRes.value.json();
          setGenres(Array.isArray(g) ? g : g?.genres ?? []);
        } catch {
          /* ignore parse error */
        }
      }
      if (moodsRes.status === "fulfilled") {
        try {
          const m = await moodsRes.value.json();
          setMoods(Array.isArray(m) ? m : m?.moods ?? []);
        } catch {
          /* ignore parse error */
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
      // Ensure it's actually an array — API could return null/undefined
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
              ? `Imported ${data.imported} new tracks (${data.total} total in playlist)`
              : `All ${data.total} tracks already in library`;
          setToast(msg);
        } else {
          setToast(`Error: ${data.error ?? "Failed to import"}`);
        }
      } catch {
        setToast("Failed to import playlist");
      } finally {
        setImporting(null);
        setExpandedId(null);
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

  // Flatten genres for display
  const flatGenres: { id: string; label: string }[] = [];
  const walk = (list: Genre[], prefix: string) => {
    list.forEach((g) => {
      const label = prefix ? `${prefix} / ${g.name}` : g.name;
      flatGenres.push({ id: g.id, label });
      if (g.children?.length) walk(g.children, label);
    });
  };
  walk(genres, "");

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 flex flex-col gap-4">
      <p className="text-sm text-cream/50 max-w-2xl">
        Import tracks from your Spotify playlists into Muse. Optionally assign
        genres and moods to all imported tracks at once.
      </p>

      {loading ? (
        <PlaylistsSkeleton />
      ) : error ? (
        <div className="rounded-xl bg-warning/10 border border-warning/30 px-4 py-4 text-sm text-warning-light flex items-start gap-3">
          <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-medium mb-0.5">Couldn&apos;t load playlists</div>
            <div className="text-warning-light/80 mb-3">
              {error}
            </div>
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
          {playlists.map((pl) => (
            <div
              key={pl.id}
              className="rounded-xl bg-cream/[0.02] border border-cream/[0.04] overflow-hidden"
            >
              {/* Playlist row */}
              <div
                className="flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-cream/[0.04] transition-colors"
                onClick={() => {
                  setExpandedId(expandedId === pl.id ? null : pl.id);
                  setSelectedGenres([]);
                  setSelectedMoods([]);
                }}
              >
                <button className="text-cream/40 flex-shrink-0">
                  {expandedId === pl.id ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </button>

                {/* Cover */}
                <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-cream/[0.06]">
                  {pl.images?.[0]?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pl.images[0].url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music size={18} className="text-cream/20" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-cream/90 truncate">
                    {pl.name}
                  </div>
                  <div className="text-xs text-cream/40 truncate">
                    {pl.tracks?.total ?? 0} tracks
                    {pl.owner?.display_name ? ` · by ${pl.owner.display_name}` : ""}
                    {pl.public ? "" : " · Private"}
                  </div>
                </div>

                {pl.description && (
                  <div className="hidden sm:block text-xs text-cream/30 truncate max-w-xs">
                    {pl.description}
                  </div>
                )}
              </div>

              {/* Expand: import controls */}
              <AnimatePresence initial={false}>
                {expandedId === pl.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 pt-1 flex flex-col gap-3">
                      {/* Genre selection */}
                      <div>
                        <div className="text-xs text-cream/50 mb-1.5">
                          Assign genres (optional)
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {flatGenres.length === 0 ? (
                            <span className="text-xs text-cream/30">
                              No genres yet — create some on the Genres page
                            </span>
                          ) : (
                            flatGenres.map((g) => (
                              <button
                                key={g.id}
                                onClick={() => toggleGenre(g.id)}
                                className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs transition-colors ${
                                  selectedGenres.includes(g.id)
                                    ? "bg-primary/20 text-primary-light border border-primary/40"
                                    : "bg-cream/[0.04] text-cream/50 border border-cream/[0.06] hover:bg-cream/[0.08]"
                                }`}
                              >
                                {selectedGenres.includes(g.id) && (
                                  <Check size={11} />
                                )}
                                {g.label}
                              </button>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Mood selection */}
                      <div>
                        <div className="text-xs text-cream/50 mb-1.5">
                          Assign moods (optional)
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

                      {/* Import button */}
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => handleImport(pl.id)}
                          disabled={importing === pl.id}
                          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-success/20 text-success-light border border-success/30 text-sm hover:bg-success/30 transition-colors disabled:opacity-50"
                        >
                          {importing === pl.id ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              Importing…
                            </>
                          ) : (
                            <>
                              <Download size={14} />
                              Import {pl.tracks?.total ?? 0} tracks
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setExpandedId(null);
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
          ))}
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

function PlaylistsSkeleton() {
  return (
    <div className="flex flex-col gap-1.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl bg-cream/[0.02] border border-cream/[0.04] px-3 py-3 flex items-center gap-3 animate-pulse"
        >
          <div className="w-3.5 h-3.5 rounded bg-cream/[0.06]" />
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