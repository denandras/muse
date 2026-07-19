"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  Play,
  Disc3,
  Pencil,
} from "lucide-react";
import type { Album, Track } from "@/lib/types";
import { usePlayback } from "@/lib/playback";
import StarRating from "./StarRating";
import FavoriteToggle from "./FavoriteToggle";
import GenreBadge from "./GenreBadge";
import MoodBadge from "./MoodBadge";
import TrackRow from "./TrackRow";

interface AlbumRowProps {
  album: Album;
  tracks?: Track[];
  onRate?: (stars: number | null) => void;
  onRateTrack?: (trackId: string, stars: number | null) => void;
  onToggleFavorite?: (value: boolean) => void;
  onToggleTrackFavorite?: (trackId: string, value: boolean) => void;
  onOpenTrackDetail?: (trackId: string) => void;
  onOpenAlbumDetail?: () => void;
}

export default function AlbumRow({
  album,
  tracks = [],
  onRate,
  onToggleFavorite,
  onRateTrack,
  onToggleTrackFavorite,
  onOpenTrackDetail,
  onOpenAlbumDetail,
}: AlbumRowProps) {
  const [expanded, setExpanded] = useState(false);
  const { play } = usePlayback();

  const playAlbum = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (album.spotify_uri) {
      play(album.id, album.title, album.spotify_uri);
    } else if (tracks[0]) {
      play(tracks[0].id, tracks[0].title, tracks[0].spotify_uri);
    }
  };

  return (
    <motion.div
      layout
      className="rounded-xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.04] transition-colors"
    >
      {/* Album header */}
      <div
        className="group flex items-center gap-3 px-3 py-3 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Expand chevron */}
        <button
          type="button"
          className="text-white/40 hover:text-white/80 transition-colors flex-shrink-0"
          aria-label={expanded ? "Collapse album" : "Expand album"}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {/* Cover */}
        <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-white/[0.06]">
          {album.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={album.cover_url}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Disc3 size={18} className="text-white/20" />
            </div>
          )}
        </div>

        {/* Title + artist */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenAlbumDetail?.();
              }}
              className="text-sm font-medium text-white/90 truncate text-left hover:underline"
            >
              {album.title}
            </button>
            {onOpenAlbumDetail && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenAlbumDetail();
                }}
                className="text-white/20 hover:text-white/70 transition-colors opacity-0 group-hover:opacity-100"
                title="Edit album details"
              >
                <Pencil size={11} />
              </button>
            )}
          </div>
          <div className="text-xs text-white/40 truncate">
            {album.artist}
            {album.release_date ? ` · ${album.release_date.slice(0, 4)}` : ""}
            {album.album_type ? ` · ${album.album_type}` : ""}
            {tracks.length > 0 ? ` · ${tracks.length} tracks` : ""}
          </div>
        </div>

        {/* Badges */}
        <div className="hidden lg:flex items-center gap-1 flex-shrink-0 max-w-xs overflow-hidden">
          {(album.genres ?? []).slice(0, 2).map((g) => (
            <GenreBadge key={g.id} genre={g} />
          ))}
          {(album.moods ?? []).slice(0, 2).map((m) => (
            <MoodBadge key={m.id} mood={m} />
          ))}
        </div>

        {/* Play album */}
        <button
          type="button"
          onClick={playAlbum}
          className="w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center bg-white/[0.06] hover:bg-white/[0.12] transition-colors"
          aria-label="Play album"
        >
          <Play size={14} className="text-white/70 ml-0.5" />
        </button>

        <FavoriteToggle
          isFavorite={album.is_favorite}
          onChange={onToggleFavorite}
        />
        <StarRating value={album.stars} onChange={onRate} />
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 flex flex-col gap-2">
              {/* Album-level badges */}
              {(album.genres?.length || album.moods?.length) ? (
                <div className="flex flex-wrap items-center gap-1.5 pb-1">
                  {(album.genres ?? []).map((g) => (
                    <GenreBadge key={g.id} genre={g} />
                  ))}
                  {(album.moods ?? []).map((m) => (
                    <MoodBadge key={m.id} mood={m} />
                  ))}
                </div>
              ) : null}

              {album.notes && (
                <div className="text-xs text-white/50 italic px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.04] mb-1">
                  “{album.notes}”
                </div>
              )}

              {/* Tracks inside the album */}
              {tracks.length === 0 ? (
                <div className="text-xs text-white/30 px-3 py-3">
                  No imported tracks for this album.
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {tracks.map((t) => (
                    <TrackRow
                      key={t.id}
                      track={t}
                      showAlbumCover={false}
                      onRate={(s) => onRateTrack?.(t.id, s)}
                      onToggleFavorite={(v) =>
                        onToggleTrackFavorite?.(t.id, v)
                      }
                      onOpenDetail={() => onOpenTrackDetail?.(t.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}