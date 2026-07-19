"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  ChevronDown,
  ChevronRight,
  StickyNote,
  Music,
  Heart,
  HeartCrack,
  Pencil,
} from "lucide-react";
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
  onRemoveFromLiked?: () => void;
  onOpenDetail?: () => void;
  defaultExpanded?: boolean;
  showAlbumCover?: boolean;
  indent?: number;
  readOnly?: boolean;
}

export default function TrackRow({
  track,
  onRate,
  onToggleFavorite,
  onRemoveFromLiked,
  onOpenDetail,
  defaultExpanded = false,
  showAlbumCover = true,
  indent = 0,
  readOnly = false,
}: TrackRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [removingFromLiked, setRemovingFromLiked] = useState(false);
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

  const handleRemoveFromLiked = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (removingFromLiked) return;
      setRemovingFromLiked(true);
      try {
        const res = await fetch(
          `/api/spotify/remove-from-liked?track_id=${encodeURIComponent(track.id)}`,
          { method: "DELETE" }
        );
        if (res.ok) {
          onRemoveFromLiked?.();
        }
      } finally {
        setRemovingFromLiked(false);
      }
    },
    [removingFromLiked, track.id, onRemoveFromLiked]
  );

  return (
    <motion.div
      layout
      className="group rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] transition-colors"
      style={{ marginLeft: indent * 24 }}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Play button */}
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetail?.();
              }}
              className={`text-sm font-medium truncate text-left hover:underline ${
                isCurrent ? "text-green-400" : "text-white/90"
              } ${readOnly ? "cursor-default hover:no-underline" : ""}`}
              disabled={readOnly && !onOpenDetail}
            >
              {track.title}
            </button>
            {track.is_liked && (
              <Heart size={11} className="text-rose-400 fill-rose-400 flex-shrink-0" />
            )}
            {!readOnly && onOpenDetail && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDetail();
                }}
                className="text-white/20 hover:text-white/70 transition-colors opacity-0 group-hover:opacity-100"
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
          <span className="hidden sm:inline-flex text-[11px] text-white/40 font-mono px-2 py-0.5 rounded bg-white/[0.04]">
            {track.musical_key}
          </span>
        )}

        {/* Notes icon */}
        {track.notes && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="text-white/30 hover:text-white/70 transition-colors"
            title="Notes"
          >
            <StickyNote size={14} />
          </button>
        )}

        {/* Favorite */}
        <FavoriteToggle
          isFavorite={track.is_favorite}
          onChange={readOnly ? undefined : onToggleFavorite}
        />

        {/* Stars */}
        <StarRating value={track.stars} onChange={readOnly ? undefined : onRate} readOnly={readOnly} />

        {/* Expand chevron */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-white/30 hover:text-white/70 transition-colors"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? (
            <ChevronDown size={14} />
          ) : (
            <ChevronRight size={14} />
          )}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 flex flex-col gap-3">
              {/* Badges full */}
              <div className="flex flex-wrap items-center gap-1.5">
                {(track.genres ?? []).map((g) => (
                  <GenreBadge key={g.id} genre={g} />
                ))}
                {(track.moods ?? []).map((m) => (
                  <MoodBadge key={m.id} mood={m} />
                ))}
                {track.genres?.length === 0 &&
                  track.moods?.length === 0 && (
                    <span className="text-xs text-white/30">
                      No genres or moods assigned
                    </span>
                  )}
              </div>

              {/* Meta grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <Meta label="Plays (all)" value={String(track.play_count_all_time)} />
                <Meta label="Plays (30d)" value={String(track.play_count_30d)} />
                <Meta
                  label="Last played"
                  value={track.last_played_at ? formatDate(track.last_played_at) : "—"}
                />
                <Meta
                  label="Added"
                  value={formatDate(track.added_at)}
                />
              </div>

              {/* Remove from Liked Songs — only for currently-liked tracks */}
              {track.is_liked && !readOnly && (
                <button
                  type="button"
                  onClick={handleRemoveFromLiked}
                  disabled={removingFromLiked}
                  className="inline-flex items-center gap-1.5 self-start h-8 px-3 rounded-xl bg-rose-500/10 text-rose-300 border border-rose-500/25 text-xs hover:bg-rose-500/20 transition-colors disabled:opacity-50"
                >
                  <HeartCrack size={13} />
                  {removingFromLiked
                    ? "Removing…"
                    : "Remove from Liked Songs"}
                </button>
              )}

              {track.notes && (
                <div className="text-xs text-white/50 italic px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                  “{track.notes}”
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-1.5 rounded-lg bg-white/[0.03]">
      <div className="text-[10px] uppercase tracking-wide text-white/30">
        {label}
      </div>
      <div className="text-white/70">{value}</div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}