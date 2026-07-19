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
} from "lucide-react";
import type { Genre, Mood } from "@/lib/types";

interface SpotifyPlaylist {
  id: string;
  name: string;
  uri: string;
  images: Array<{ url: string }>;
  owner: { id: string; display_name: string | null };
  tracks: { total: number };
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

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [playlistsRes, genresRes, moodsRes] = await Promise.allSettled([
          fetch("/api/spotify/playlists"),
          fetch("/api/genres"),
          fetch("/api/moods"),
        ]);

        if (!active) return;

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
        if (!active) return;

        const obj = (payload ?? {}) as Record<string, unknown>;

        // Spotify API 401 — user hasn't granted playlist-read-private.
        // Show a friendly error state instead of crashing.
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

        const list = Array.isArray(payload)
          ? (payload as SpotifyPlaylist[])
          : (obj.playlists as SpotifyPlaylist[] | undefined) ?? [];
        setPlaylists(list);
        if (obj.error && !obj.playlists) {
          setError(String(obj.error));
        }
      } catch (e) {
        if (active) setError(String(e));
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

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
      <p className="text-sm text-white/50 max-w-2xl">
        Import tracks from your Spotify playlists into Muse. Optionally assign
        genres and moods to all imported tracks at once.
      </p>

      {loading ? (
        <PlaylistsSkeleton />
      ) : error ? (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-4 text-sm text-amber-200 flex items-start gap-3">
          <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-medium mb-0.5">Couldn&apos;t load playlists</div>
            <div className="text-amber-200/80">
              {error}. You may need to sign out and reconnect Spotify to grant
              playlist access (the <code>playlist-read-private</code> scope).
            </div>
          </div>
        </div>
      ) : playlists.length === 0 ? (
        <div className="text-center py-16 text-sm text-white/30 rounded-xl bg-white/[0.02] border border-white/[0.04]">
          No playlists found. Make sure your Spotify account has playlists.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {playlists.map((pl) => (
            <div
              key={pl.id}
              className="rounded-xl bg-white/[0.02] border border-white/[0.04] overflow-hidden"
            >
              {/* Playlist row */}
              <div
                className="flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-white/[0.04] transition-colors"
                onClick={() => {
                  setExpandedId(expandedId === pl.id ? null : pl.id);
                  setSelectedGenres([]);
                  setSelectedMoods([]);
                }}
              >
                <button className="text-white/40 flex-shrink-0">
                  {expandedId === pl.id ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </button>

                {/* Cover */}
                <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-white/[0.06]">
                  {pl.images?.[0]?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pl.images[0].url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music size={18} className="text-white/20" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white/90 truncate">
                    {pl.name}
                  </div>
                  <div className="text-xs text-white/40 truncate">
                    {pl.tracks.total} tracks
                    {pl.owner.display_name ? ` · by ${pl.owner.display_name}` : ""}
                    {pl.public ? "" : " · Private"}
                  </div>
                </div>

                {pl.description && (
                  <div className="hidden sm:block text-xs text-white/30 truncate max-w-xs">
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
                        <div className="text-xs text-white/50 mb-1.5">
                          Assign genres (optional)
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {flatGenres.length === 0 ? (
                            <span className="text-xs text-white/30">
                              No genres yet — create some on the Genres page
                            </span>
                          ) : (
                            flatGenres.map((g) => (
                              <button
                                key={g.id}
                                onClick={() => toggleGenre(g.id)}
                                className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs transition-colors ${
                                  selectedGenres.includes(g.id)
                                    ? "bg-violet-500/20 text-violet-200 border border-violet-500/40"
                                    : "bg-white/[0.04] text-white/50 border border-white/[0.06] hover:bg-white/[0.08]"
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
                        <div className="text-xs text-white/50 mb-1.5">
                          Assign moods (optional)
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {moods.length === 0 ? (
                            <span className="text-xs text-white/30">
                              No moods yet — create some on the Moods page
                            </span>
                          ) : (
                            moods.map((m) => (
                              <button
                                key={m.id}
                                onClick={() => toggleMood(m.id)}
                                className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs transition-colors ${
                                  selectedMoods.includes(m.id)
                                    ? "bg-rose-500/20 text-rose-200 border border-rose-500/40"
                                    : "bg-white/[0.04] text-white/50 border border-white/[0.06] hover:bg-white/[0.08]"
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
                          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-green-500/20 text-green-200 border border-green-500/30 text-sm hover:bg-green-500/30 transition-colors disabled:opacity-50"
                        >
                          {importing === pl.id ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              Importing…
                            </>
                          ) : (
                            <>
                              <Download size={14} />
                              Import {pl.tracks.total} tracks
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setExpandedId(null);
                            setSelectedGenres([]);
                            setSelectedMoods([]);
                          }}
                          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-white/[0.04] text-white/50 border border-white/[0.06] text-sm hover:bg-white/[0.08] transition-colors"
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
            className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl glass-strong text-sm text-white/90 border border-white/10 shadow-lg"
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
          className="rounded-xl bg-white/[0.02] border border-white/[0.04] px-3 py-3 flex items-center gap-3 animate-pulse"
        >
          <div className="w-3.5 h-3.5 rounded bg-white/[0.06]" />
          <div className="w-12 h-12 rounded-lg bg-white/[0.06]" />
          <div className="flex-1 flex flex-col gap-1.5">
            <div className="h-3 w-1/3 rounded bg-white/[0.06]" />
            <div className="h-2.5 w-1/4 rounded bg-white/[0.04]" />
          </div>
        </div>
      ))}
    </div>
  );
}