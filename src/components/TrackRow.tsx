"use client";

import { Play, Pause, Music, Check, Pencil } from "lucide-react";
import { motion } from "framer-motion";
import type { Track } from "@/lib/types";
import { usePlayback } from "@/lib/playback";
import StarRating from "./StarRating";
import FavoriteToggle from "./FavoriteToggle";
import GenreBadge from "./GenreBadge";
import MoodBadge from "./MoodBadge";

/**
 * Track display-number scheme (see also src/lib/types.ts → Track).
 *
 * Every track has TWO numbers:
 *
 * 1. Stable identifier — `track.id` (DB UUID).
 *    This is the same in every view. It is used as the React key and for
 *    dedup / equality checks. It never changes and is never displayed.
 *
 * 2. Display number — `displayNumber` prop (1-based, human-visible).
 *    Context-dependent, computed deterministically by the PARENT:
 *
 *    a) Album tracklist (inside AlbumRow):
 *       Use `track.track_number` (Spotify's position on the album disc).
 *       Fallback when track_number is null (pre-backfill rows): 1-based
 *       index within the album's sorted (disc_number, track_number) list.
 *       This is the track's "real" position on the album and is stable
 *       across re-syncs.
 *
 *    b) Standalone track list (library tracks view, liked songs, singles
 *       shown as individual tracks): 1-based sequential position within
 *       the full filtered + sorted + paginated view, computed as
 *       `pageOffset + indexInPage + 1` (e.g. page 2 of 50 → 51, 52, …).
 *       This is a list-position, not a stable property — it recomputes
 *       when filters or sort order change, which is the desired behavior
 *       ("handles reordering gracefully").
 *
 * Rules:
 *  - No duplicate display numbers within a single rendered list.
 *  - No skipped numbers (sequential lists are contiguous; album lists
 *    use Spotify's track_number which may have gaps if the source album
 *    has gaps — that's accurate, not a bug).
 *  - The same track may show different display numbers in different
 *    contexts (e.g. track 3 on an album vs. position 47 in liked songs).
 *    That's correct — the number reflects the context, not the identity.
 *  - The stable `track.id` is always the same regardless of context.
 */
interface TrackRowProps {
  track: Track;
  /** 1-based display number shown to the left of the title. Omit to hide. */
  displayNumber?: number;
  onRate?: (stars: number | null) => void;
  onToggleFavorite?: (value: boolean) => void;
  onOpenDetail?: () => void;
  showAlbumCover?: boolean;
  indent?: number;
  readOnly?: boolean;
  /** Show the "In Liked Songs" badge. Default true; set false on the Liked page. */
  showLikedBadge?: boolean;
  /**
   * The list of tracks this row belongs to (e.g. all visible tracks on the
   * current page, or all tracks in an album). When provided, clicking play
   * uses playFromList to populate the full queue so next/previous navigate
   * the entire list. When omitted, falls back to single-track play().
   */
  queueTracks?: Track[];
}

export default function TrackRow({
  track,
  displayNumber,
  onRate,
  onToggleFavorite,
  onOpenDetail,
  showAlbumCover = true,
  indent = 0,
  readOnly = false,
  showLikedBadge = true,
  queueTracks,
}: TrackRowProps) {
  const { play, playFromList, pause, isPlaying, currentTrackId } = usePlayback();

  const isCurrent = currentTrackId === track.id;
  const isPlayingThis = isCurrent && isPlaying;

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCurrent) {
      isPlaying ? pause() : play(track.id, track.title, track.spotify_uri, track.artist, track.album_cover_url);
    } else if (queueTracks && queueTracks.length > 1) {
      // Find this track's index in the queue and play from there —
      // populates the full queue so next/previous navigate the list.
      const idx = queueTracks.findIndex((t) => t.id === track.id);
      playFromList(
        queueTracks
          .filter((t) => t.spotify_uri)
          .map((t) => ({
            id: t.id,
            title: t.title,
            spotifyUri: t.spotify_uri,
            artist: t.artist,
            albumArt: t.album_cover_url,
          })),
        Math.max(0, idx)
      );
    } else {
      play(track.id, track.title, track.spotify_uri, track.artist, track.album_cover_url);
    }
  };

  return (
    <motion.div
      layout
      className="group rounded-xl bg-cream/[0.02] hover:bg-cream/[0.05] border border-cream/[0.04] transition-colors"
      style={{ marginLeft: indent * 24 }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Display number (1-based, context-dependent — see docblock above) */}
        {displayNumber != null && (
          <span className="w-5 flex-shrink-0 text-right text-xs text-cream/30 tabular-nums select-none">
            {displayNumber}
          </span>
        )}

        {/* Album cover thumbnail */}
        {showAlbumCover && (
          <div className="w-10 h-10 flex-shrink-0 rounded-lg overflow-hidden bg-cream/[0.06]">
            {track.album_cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={track.album_cover_url}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Music size={14} className="text-cream/20" />
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
                isCurrent ? "text-success" : "text-cream/90"
              } ${readOnly ? "cursor-default hover:no-underline" : ""}`}
              disabled={readOnly && !onOpenDetail}
            >
              {track.title}
            </button>
            {track.is_liked && showLikedBadge && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-success/80 font-medium flex-shrink-0">
                <Check size={11} className="text-success" strokeWidth={2.5} />
              </span>
            )}
            {!readOnly && onOpenDetail && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDetail();
                }}
                className="text-cream/20 hover:text-cream/70 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                title="Edit details"
              >
                <Pencil size={11} />
              </button>
            )}
          </div>
          <div className="text-xs text-cream/40 truncate">
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
          <span className="hidden sm:inline-flex text-[11px] text-cream/40 font-mono px-2 py-0.5 rounded bg-cream/[0.04] flex-shrink-0">
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
          className="w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center bg-cream/[0.06] hover:bg-cream/[0.12] transition-colors"
          aria-label={isPlayingThis ? "Pause" : "Play"}
        >
          {isPlayingThis ? (
            <Pause size={14} className="text-cream" />
          ) : (
            <Play size={14} className="text-cream/70 ml-0.5" />
          )}
        </button>
      </div>
    </motion.div>
  );
}