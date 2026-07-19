"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart,
  Loader2,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import type { Track } from "@/lib/types";
import TrackRow from "@/components/TrackRow";

const STALE_MS = 5 * 60 * 1000;

export default function LikedPage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadTracks = useCallback(() => {
    fetch("/api/tracks?liked=true")
      .then((r) => r.json())
      .then((d) => setTracks(Array.isArray(d) ? d : d.tracks ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadTracks();
    fetch("/api/sync-state")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setLastSync(d.liked_tracks_synced_at);
        const ts = d.liked_tracks_synced_at
          ? new Date(d.liked_tracks_synced_at).getTime()
          : 0;
        if (!ts || Date.now() - ts > STALE_MS) {
          setSyncing(true);
          fetch("/api/spotify/import-liked", { method: "POST" })
            .finally(() => {
              setSyncing(false);
              loadTracks();
            });
        }
      })
      .catch(() => {});
  }, [loadTracks]);

  const unorganized = tracks.filter(
    (t) => t.is_liked && (t.genres?.length ?? 0) === 0 && (t.moods?.length ?? 0) === 0
  );
  const organized = tracks.filter(
    (t) => t.is_liked && ((t.genres?.length ?? 0) > 0 || (t.moods?.length ?? 0) > 0)
  );

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const res = await fetch("/api/spotify/remove-organized-from-liked", {
        method: "POST",
      });
      if (res.ok) {
        setToast("Organized tracks removed from Spotify liked songs.");
        loadTracks();
      } else {
        setToast("Failed to remove organized tracks.");
      }
    } finally {
      setRemoving(false);
      setConfirmOpen(false);
      setTimeout(() => setToast(null), 3500);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Heart className="text-rose-400 fill-rose-400" size={20} />
          <h1 className="text-xl font-semibold text-white/90">Liked Songs</h1>
        </div>
        <div className="flex items-center gap-2">
          {syncing && (
            <span className="inline-flex items-center gap-1.5 text-xs text-white/40">
              <RefreshCw size={12} className="animate-spin" />
              Syncing…
            </span>
          )}
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={organized.length === 0 || removing}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-rose-500/15 text-rose-300 border border-rose-500/30 text-sm hover:bg-rose-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 size={14} />
            Remove organized from liked
          </button>
        </div>
      </div>

      {/* Sync info */}
      <div className="flex items-center gap-3 text-xs text-white/40 px-1">
        <span>
          Unorganized: <span className="text-white/70">{unorganized.length}</span>
        </span>
        <span>
          Organized: <span className="text-white/70">{organized.length}</span>
        </span>
        {lastSync && (
          <span className="ml-auto inline-flex items-center gap-1">
            <CheckCircle2 size={11} className="text-green-400/70" />
            Last sync {formatRelative(lastSync)}
          </span>
        )}
      </div>

      <p className="text-sm text-white/50 max-w-2xl">
        Liked songs act as your pre-saving inbox. Tracks with no genre and no
        mood appear here for organizing. Once organized, you can remove them
        from your Spotify liked songs to keep that list tidy.
      </p>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="animate-spin text-white/40" size={24} />
        </div>
      ) : (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs uppercase tracking-wide text-white/40 px-1">
            Unorganized ({unorganized.length})
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
            {unorganized.length === 0 ? (
              <div className="text-center py-10 text-sm text-white/30 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                {organized.length === 0
                  ? "No liked songs imported yet. Sync will start shortly."
                  : "All liked songs are organized. Nice work!"}
              </div>
            ) : (
              unorganized.map((track) => (
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

          {organized.length > 0 && (
            <>
              <h2 className="text-xs uppercase tracking-wide text-white/40 px-1 pt-4">
                Already organized ({organized.length})
              </h2>
              <div className="flex flex-col gap-1.5 opacity-60">
                {organized.map((track) => (
                  <TrackRow key={track.id} track={track} readOnly />
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* Confirm modal */}
      <AnimatePresence>
        {confirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setConfirmOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-md w-full rounded-2xl glass-strong p-5 flex flex-col gap-4"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="text-amber-400 flex-shrink-0 mt-0.5" size={20} />
                <div>
                  <h3 className="text-base font-semibold text-white/90">
                    Remove {organized.length} organized track
                    {organized.length === 1 ? "" : "s"} from liked songs?
                  </h3>
                  <p className="text-sm text-white/50 mt-1">
                    This removes them from your Spotify liked songs list. The
                    tracks stay in Muse. This cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmOpen(false)}
                  className="h-9 px-4 rounded-xl bg-white/[0.06] text-white/70 text-sm hover:bg-white/[0.1] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRemove}
                  disabled={removing}
                  className="h-9 px-4 rounded-xl bg-rose-500 text-white text-sm hover:bg-rose-400 transition-colors disabled:opacity-50"
                >
                  {removing ? "Removing…" : "Remove"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl glass-strong px-4 py-2.5 text-sm text-white/90"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  async function rateTrack(trackId: string, stars: number) {
    await fetch(`/api/tracks/${trackId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stars }),
    });
    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, stars } : t))
    );
  }
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}