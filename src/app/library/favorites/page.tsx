"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Star, Loader2 } from "lucide-react";
import type { Album, Track } from "@/lib/types";
import TrackRow from "@/components/TrackRow";
import AlbumRow from "@/components/AlbumRow";

export default function FavoritesPage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/tracks?favorite=true").then((r) => r.json()),
      fetch("/api/albums?favorite=true").then((r) => r.json()),
    ])
      .then(([t, a]) => {
        if (!active) return;
        setTracks(Array.isArray(t) ? t : t.tracks ?? []);
        setAlbums(Array.isArray(a) ? a : a.albums ?? []);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

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
      // Optimistic update
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
        setAlbums((prev) =>
          prev.map((a) => (a.id === albumId ? { ...a, is_favorite: !value } : a))
        );
      }
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

  const total = tracks.length + albums.length;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Star className="text-amber-400 fill-amber-400" size={20} />
        <h1 className="text-xl font-semibold text-white/90">Favorites</h1>
        <span className="text-xs text-white/40">({total})</span>
      </div>

      <p className="text-sm text-white/50 max-w-2xl">
        Your cross-everything collection of favorite tracks and albums.
      </p>

      {total === 0 ? (
        <div className="text-center py-16 text-sm text-white/30 rounded-xl bg-white/[0.02] border border-white/[0.04]">
          No favorites yet. Click the heart on any track or album to add it here.
        </div>
      ) : (
        <>
          {albums.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-xs uppercase tracking-wide text-white/40 px-1">
                Albums ({albums.length})
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
                {albums.map((album) => (
                  <motion.div
                    key={album.id}
                    variants={{
                      hidden: { opacity: 0, y: 6 },
                      visible: { opacity: 1, y: 0 },
                    }}
                  >
                    <AlbumRow
                      album={album}
                      tracks={album.tracks ?? []}
                      onRate={(s) => rateAlbum(album.id, s)}
                      onToggleFavorite={(v) => toggleAlbumFavorite(album.id, v)}
                      onRateTrack={(tid, s) => rateTrack(tid, s)}
                      onToggleTrackFavorite={(tid, v) =>
                        toggleTrackFavorite(tid, v)
                      }
                    />
                  </motion.div>
                ))}
              </motion.div>
            </section>
          )}

          {tracks.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-xs uppercase tracking-wide text-white/40 px-1">
                Tracks ({tracks.length})
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
                {tracks.map((track) => (
                  <motion.div
                    key={track.id}
                    variants={{
                      hidden: { opacity: 0, y: 6 },
                      visible: { opacity: 1, y: 0 },
                    }}
                  >
                    <TrackRow
                      track={track}
                      onRate={(s) => rateTrack(track.id, s)}
                      onToggleFavorite={(v) => toggleTrackFavorite(track.id, v)}
                    />
                  </motion.div>
                ))}
              </motion.div>
            </section>
          )}
        </>
      )}
    </div>
  );
}