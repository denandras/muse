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
    queueLength,
    queueIndex,
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

  // Next/Prev are disabled when: not Premium, OR at queue boundary.
  // queueIndex is 0-based; queueLength is the total count.
  // Single track (queueLength ≤ 1): both disabled.
  // First track (queueIndex === 0): prev disabled.
  // Last track (queueIndex === queueLength - 1): next disabled.
  const canPrev = isPremium && queueLength > 1 && queueIndex > 0;
  const canNext = isPremium && queueLength > 1 && queueIndex < queueLength - 1;

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
          className="fixed left-0 right-0 z-40 p-3 pb-3
                     bottom-16 md:bottom-0 md:pb-3"
        >
          <div className="mx-auto max-w-3xl">
            <div className="rounded-2xl border border-cream/10 bg-cream/[0.05] backdrop-blur-xl px-3 py-2.5">
              {/* Controls row */}
              <div className="flex items-center gap-3">
              {/* Album art */}
              <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-cream/[0.06]">
                {currentTrackAlbumArt ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentTrackAlbumArt}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Music size={16} className="text-cream/30" />
                  </div>
                )}
              </div>

              {/* Track info */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-cream/90">
                  {currentTrackTitle}
                </p>
                <div className="flex items-center gap-2">
                  <p className="truncate text-xs text-cream/50">
                    {currentTrackArtist ?? "—"}
                  </p>
                  {queueLength > 1 && (
                    <span className="text-[10px] tabular-nums text-cream/30 flex-shrink-0">
                      {queueIndex + 1}/{queueLength}
                    </span>
                  )}
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={previous}
                  disabled={!canPrev}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-cream/60 hover:text-cream hover:bg-cream/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Previous"
                >
                  <SkipBack size={16} />
                </button>
                <button
                  onClick={() => (isPlaying ? pause() : resume())}
                  disabled={!isPremium}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cream text-base transition hover:scale-105 disabled:opacity-30 disabled:cursor-not-allowed"
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
                  disabled={!canNext}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-cream/60 hover:text-cream hover:bg-cream/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
                  className="hidden sm:flex w-8 h-8 items-center justify-center rounded-lg text-secondary hover:text-secondary-hover hover:bg-secondary/10 transition-colors disabled:opacity-50"
                  aria-label="Remove from Liked Songs"
                  title="Remove from Liked Songs"
                >
                  <Heart size={15} className="fill-secondary" />
                </button>
              )}

              {/* Volume (desktop only) */}
              <div className="hidden lg:flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={toggleMute}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-cream/50 hover:text-cream transition-colors"
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
                  className="w-20 accent-cream/70"
                  aria-label="Volume"
                />
              </div>
              </div>

              {/* Seek bar + time (inside blurred container) */}
              <div className="mt-2 flex items-center gap-2 px-1">
                <span className="text-[10px] tabular-nums text-cream/40 w-9 text-right">
                  {formatTime(currentTime)}
                </span>
                <div
                  onClick={handleSeek}
                  className="group relative flex-1 h-1.5 cursor-pointer rounded-full bg-cream/10"
                >
                  <div
                    className="absolute left-0 top-0 h-full rounded-full bg-cream/70 transition-[width] duration-150 group-hover:bg-cream"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-[10px] tabular-nums text-cream/40 w-9">
                  {formatTime(duration)}
                </span>
              </div>

              {/* Non-Premium banner */}
              {!isPremium && spotifyConnected && (
                <div className="mt-2 flex items-center gap-2 rounded-xl bg-warning/10 border border-warning/30 px-3 py-2 text-xs text-warning-light">
                  <Sparkles size={14} className="flex-shrink-0" />
                  <span>
                    Spotify Premium is required for playback. You can still
                    browse, organize, and manage your library.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Toast */}
          <AnimatePresence>
            {toast && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="fixed bottom-36 md:bottom-24 left-1/2 -translate-x-1/2 rounded-xl glass-strong px-4 py-2 text-sm text-cream/90"
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