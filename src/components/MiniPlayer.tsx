"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Heart,
  Music,
  Sparkles,
} from "lucide-react";
import { usePlayback } from "@/lib/playback";

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function MiniPlayer() {
  const {
    currentTrackTitle,
    currentTrackArtist,
    currentTrackAlbumArt,
    currentTrackId,
    isPlaying,
    isPremium,
    spotifyConnected,
    currentTime,
    duration,
    pause,
    resume,
    seek,
    next,
    previous,
    setVolume,
  } = usePlayback();

  const [volume, setVolumeState] = useState(0.5);
  const [muted, setMuted] = useState(false);
  // Local "liked" status for the currently-playing track — the MiniPlayer
  // doesn't have the full Track record, so this is a soft hint driven by the
  // user pressing the heart here. The authoritative per-track button lives
  // in TrackRow.
  const [likedHint, setLikedHint] = useState(true);
  const [removing, setRemoving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const hasTrack = currentTrackTitle !== null;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    seek(ratio * duration);
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value) / 100;
    setVolumeState(v);
    setMuted(v === 0);
    setVolume(v);
  };

  const toggleMute = () => {
    if (muted) {
      setVolume(volume || 0.5);
      setMuted(false);
    } else {
      setVolume(0);
      setMuted(true);
    }
  };

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const handleRemoveFromLiked = async () => {
    if (!currentTrackId) return;
    setRemoving(true);
    try {
      const res = await fetch(
        `/api/spotify/remove-from-liked?track_id=${encodeURIComponent(currentTrackId)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setLikedHint(false);
        showToast("Removed from Liked Songs");
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "Failed to remove from liked");
      }
    } finally {
      setRemoving(false);
    }
  };

  return (
    <AnimatePresence>
      {hasTrack && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed bottom-0 left-0 right-0 z-50 p-3 pb-4 md:pb-3"
        >
          <div className="mx-auto max-w-3xl">
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2.5 backdrop-blur-xl">
              {/* Album art */}
              <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-white/[0.06]">
                {currentTrackAlbumArt ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentTrackAlbumArt}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Music size={16} className="text-white/30" />
                  </div>
                )}
              </div>

              {/* Track info */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white/90">
                  {currentTrackTitle}
                </p>
                <p className="truncate text-xs text-white/50">
                  {currentTrackArtist ?? "—"}
                </p>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={previous}
                  disabled={!isPremium}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Previous"
                >
                  <SkipBack size={16} />
                </button>
                <button
                  onClick={() => (isPlaying ? pause() : resume())}
                  disabled={!isPremium}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black transition hover:scale-105 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <Pause size={18} fill="currentColor" />
                  ) : (
                    <Play size={18} fill="currentColor" className="ml-0.5" />
                  )}
                </button>
                <button
                  onClick={next}
                  disabled={!isPremium}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Next"
                >
                  <SkipForward size={16} />
                </button>
              </div>

              {/* Remove from liked (only if it's currently liked) */}
              {likedHint && currentTrackId && (
                <button
                  onClick={handleRemoveFromLiked}
                  disabled={removing}
                  className="hidden sm:flex w-8 h-8 items-center justify-center rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                  aria-label="Remove from Liked Songs"
                  title="Remove from Liked Songs"
                >
                  <Heart size={15} className="fill-rose-400" />
                </button>
              )}

              {/* Volume (desktop only) */}
              <div className="hidden lg:flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={toggleMute}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-white/50 hover:text-white transition-colors"
                  aria-label={muted ? "Unmute" : "Mute"}
                >
                  {muted || volume === 0 ? (
                    <VolumeX size={16} />
                  ) : (
                    <Volume2 size={16} />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={muted ? 0 : Math.round(volume * 100)}
                  onChange={handleVolume}
                  className="w-20 accent-white/70"
                  aria-label="Volume"
                />
              </div>
            </div>

            {/* Seek bar + time */}
            <div className="mt-1 flex items-center gap-2 px-2">
              <span className="text-[10px] tabular-nums text-white/40 w-9 text-right">
                {formatTime(currentTime)}
              </span>
              <div
                onClick={handleSeek}
                className="group relative flex-1 h-1.5 cursor-pointer rounded-full bg-white/10"
              >
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-white/70 transition-[width] duration-150 group-hover:bg-white"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-[10px] tabular-nums text-white/40 w-9">
                {formatTime(duration)}
              </span>
            </div>

            {/* Non-Premium banner */}
            {!isPremium && spotifyConnected && (
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-200">
                <Sparkles size={14} className="flex-shrink-0" />
                <span>
                  Spotify Premium is required for playback. You can still
                  browse, organize, and manage your library.
                </span>
              </div>
            )}
          </div>

          {/* Toast */}
          <AnimatePresence>
            {toast && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="fixed bottom-24 left-1/2 -translate-x-1/2 rounded-xl glass-strong px-4 py-2 text-sm text-white/90"
              >
                {toast}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}