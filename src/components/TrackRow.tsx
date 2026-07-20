"use client";

import { Play, Pause, Music, Check, Pencil } from "lucide-react";
import { motion } from "framer-motion";
import type { Track } from "@/lib/types";
import { usePlayback } from "@/lib/playback";
import StarRating from "./StarRating";
import FavoriteToggle from "./FavoriteToggle";
import GenreBadge from "./GenreBadge";
import MoodBadge from "./MoodBadge";

interface TrackRowProps {
  track: Track;
  onRate?: (stars: number | null) => void;
  onToggleFavorite?: (value: boolean) => void;
  onOpenDetail?: () => void;
  showAlbumCover?: boolean;
  indent?: number;
  readOnly?: boolean;
  /** Show the "In Liked Songs" badge. Default true; set false on the Liked page. */
  showLikedBadge?: boolean;
}

export default function TrackRow({
  track,
  onRate,
  onToggleFavorite,
  onOpenDetail,
  showAlbumCover = true,
  indent = 0,
  readOnly = false,
  showLikedBadge = true,
}: TrackRowProps) {
  const { play, pause, isPlaying, currentTrackId } = usePlayback();

  const isCurrent = currentTrackId === track.id;
  const isPlayingThis = isCurrent && isPlaying;

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCurrent) {
      isPlaying ? pause() : play(track.id, track.title, track.spotify_uri);
    } else {
      play(track.id, track.title, track.spotify_uri);
    }
  };

  return (
    <motion.div
      layout
      className="group rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] transition-colors"
      style={{ marginLeft: indent * 24 }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Album cover thumbnail */}
        {showAlbumCover && (
          <div className="w-10 h-10 flex-shrink-0 rounded-lg overflow-hidden bg-white/[0.06]">
            {track.album_cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={track.album_cover_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Music size={14} className="text-white/20" />
              </div>
            )}
          </div>
        )}

        {/* Title + artist */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetail?.();
              }}
              className={`text-sm font-medium truncate text-left hover:underline min-w-0 ${
                isCurrent ? "text-green-400" : "text-white/90"
              } ${readOnly ? "cursor-default hover:no-underline" : ""}`}
              disabled={readOnly && !onOpenDetail}
            >
              {track.title}
            </button>
            {track.is_liked && showLikedBadge && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-green-400/80 font-medium flex-shrink-0">
                <Check size={11} className="text-green-400" strokeWidth={2.5} />
              </span>
            )}
            {!readOnly && onOpenDetail && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDetail();
                }}
                className="text-white/20 hover:text-white/70 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                title="Edit details"
              >
                <Pencil size={11} />
              </button>
            )}
          </div>
          <div className="text-xs text-white/40 truncate">
            {track.artist}
            {track.album_title ? ` · ${track.album_title}` : ""}
          </div>
        </div>

        {/* Badges (hidden on narrow) */}
        <div className="hidden lg:flex items-center gap-1 flex-shrink-0 max-w-xs overflow-hidden">
          {(track.genres ?? []).slice(0, 2).map((g) => (
            <GenreBadge key={g.id} genre={g} />
          ))}
          {(track.moods ?? []).slice(0, 2).map((m) => (
            <MoodBadge key={m.id} mood={m} />
          ))}
        </div>

        {/* Musical key */}
        {track.musical_key && (
          <span className="hidden sm:inline-flex text-[11px] text-white/40 font-mono px-2 py-0.5 rounded bg-white/[0.04] flex-shrink-0">
            {track.musical_key}
          </span>
        )}

        {/* Stars */}
        <StarRating value={track.stars} onChange={readOnly ? undefined : onRate} readOnly={readOnly} />

        {/* Favorite */}
        <FavoriteToggle
          isFavorite={track.is_favorite}
          onChange={readOnly ? undefined : onToggleFavorite}
        />

        {/* Play button (right side) */}
        <button
          type="button"
          onClick={handlePlay}
          className="w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center bg-white/[0.06] hover:bg-white/[0.12] transition-colors"
          aria-label={isPlayingThis ? "Pause" : "Play"}
        >
          {isPlayingThis ? (
            <Pause size={14} className="text-white" />
          ) : (
            <Play size={14} className="text-white/70 ml-0.5" />
          )}
        </button>
      </div>
    </motion.div>
  );
}