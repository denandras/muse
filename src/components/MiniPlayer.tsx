"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
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
    currentTrackId,
    currentTrackTitle,
    currentTrackArtist,
    currentTrackAlbumArt,
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

  const router = useRouter();
  const [volume, setVolumeState] = useState(0.5);
  const [muted, setMuted] = useState(false);

  const [seeking, setSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);

  const hasTrack = currentTrackTitle !== null;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Navigate to library with query param to open track detail modal
  const openTrackDetail = () => {
    if (!currentTrackId) return;
    router.push(`/library?track=${encodeURIComponent(currentTrackId)}`);
  };

  // Next/Prev are disabled when: not Premium, OR at queue boundary.
  const canPrev = isPremium && queueLength > 1 && queueIndex > 0;
  const canNext = isPremium && queueLength > 1 && queueIndex < queueLength - 1;

  // Seek slider — supports both click and continuous drag on mobile/desktop.
  // While dragging, show the seekValue instead of currentTime so the thumb
  // follows the finger/mouse. On release, call seek() with the final value.
  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSeeking(true);
    setSeekValue(Number(e.target.value));
  };

  const handleSeekCommit = () => {
    if (duration > 0) {
      seek((seekValue / 100) * duration);
    }
    setSeeking(false);
  };

  const displayProgress = seeking ? seekValue : progress;

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
              {/* Album art — click to open full-size in new tab */}
              <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-cream/[0.06]">
                {currentTrackAlbumArt ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a href={currentTrackAlbumArt} target="_blank" rel="noopener noreferrer" title="Open cover image">
                    <img
                      src={currentTrackAlbumArt}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </a>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Music size={16} className="text-cream/30" />
                  </div>
                )}
              </div>

              {/* Track info — click to open track detail */}
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={openTrackDetail}
                  className="block w-full text-left truncate text-sm font-medium text-cream/90 hover:underline cursor-pointer"
                >
                  {currentTrackTitle}
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openTrackDetail}
                    className="truncate text-xs text-cream/50 hover:underline cursor-pointer text-left"
                  >
                    {currentTrackArtist ?? "—"}
                  </button>
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

              {/* Seek bar + time (inside blurred container) — draggable slider */}
              <div className="mt-2 flex items-center gap-2 px-1">
                <span className="text-[10px] tabular-nums text-cream/40 w-9 text-right">
                  {formatTime(seeking ? (seekValue / 100) * duration : currentTime)}
                </span>
                <div className="relative flex-1 h-4 flex items-center">
                  {/* Visual track background */}
                  <div className="absolute left-0 right-0 h-1.5 rounded-full bg-cream/10 pointer-events-none" />
                  {/* Filled portion */}
                  <div
                    className="absolute left-0 h-1.5 rounded-full bg-cream/70 pointer-events-none"
                    style={{ width: `${displayProgress}%` }}
                  />
                  {/* Native range input overlaid — transparent, handles all drag/click */}
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={0.1}
                    value={displayProgress}
                    onChange={handleSeekChange}
                    onMouseUp={handleSeekCommit}
                    onTouchEnd={handleSeekCommit}
                    disabled={duration <= 0}
                    className="absolute left-0 right-0 w-full h-4 opacity-0 cursor-pointer disabled:cursor-default"
                    aria-label="Seek"
                  />
                  {/* Visible thumb */}
                  <div
                    className="absolute w-3 h-3 rounded-full bg-cream shadow-md pointer-events-none -translate-x-1/2 transition-transform"
                    style={{ left: `${displayProgress}%`, transform: `translateX(-50%) scale(${seeking ? 1.3 : 1})` }}
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}