"use client";

import { useState, useMemo } from "react";
import { Music, Disc3, Heart, ListMusic, ChevronLeft, ChevronRight } from "lucide-react";
import type { Track, Album } from "@/lib/types";

type FilterTab = "all" | "liked" | "albums" | "tracks";

interface MusicSectionProps {
  tracks: Track[];
  albums: Album[];
}

const PAGE_SIZE = 50;

export default function MusicSection({ tracks, albums }: MusicSectionProps) {
  const [tab, setTab] = useState<FilterTab>("all");
  const [page, setPage] = useState(0);

  const tabs: { key: FilterTab; label: string; icon: typeof Music; count: number }[] = [
    { key: "all", label: "All", icon: ListMusic, count: albums.length + tracks.length },
    { key: "liked", label: "Liked Songs", icon: Heart, count: tracks.filter((t) => t.is_liked).length },
    { key: "albums", label: "Albums", icon: Disc3, count: albums.length },
    { key: "tracks", label: "Tracks", icon: Music, count: tracks.length },
  ];

  // Build the filtered list based on the active tab
  const filteredItems = useMemo(() => {
    const likedTracks = tracks.filter((t) => t.is_liked);

    // Build a set of album spotify_ids for dedup (to avoid showing album
    // tracks as standalone when their album is also displayed)
    const albumSpotifyIds = new Set(
      albums.map((a) => a.spotify_id).filter(Boolean) as string[]
    );

    switch (tab) {
      case "liked":
        return likedTracks.map((t) => ({ type: "track" as const, item: t }));
      case "albums":
        return albums.map((a) => ({ type: "album" as const, item: a }));
      case "tracks":
        return tracks.map((t) => ({ type: "track" as const, item: t }));
      case "all":
      default: {
        // Albums first, then standalone tracks (not part of a displayed album)
        const albumItems = albums.map((a) => ({ type: "album" as const, item: a }));
        const standaloneTracks = tracks
          .filter((t) => !t.album_spotify_id || !albumSpotifyIds.has(t.album_spotify_id))
          .map((t) => ({ type: "track" as const, item: t }));
        return [...albumItems, ...standaloneTracks];
      }
    }
  }, [tab, tracks, albums]);

  // Reset page when tab changes
  const handleTabChange = (newTab: FilterTab) => {
    setTab(newTab);
    setPage(0);
  };

  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE);
  const pagedItems = filteredItems.slice(
    page * PAGE_SIZE,
    page * PAGE_SIZE + PAGE_SIZE
  );

  if (tracks.length === 0 && albums.length === 0) {
    return (
      <section className="rounded-2xl glass p-5">
        <h2 className="text-xs uppercase tracking-wide text-cream/40 mb-3">Music</h2>
        <p className="text-sm text-cream/30">No music imported yet.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl glass p-5">
      <h2 className="text-xs uppercase tracking-wide text-cream/40 mb-3">Music</h2>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => handleTabChange(t.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                active
                  ? "bg-cream/15 text-cream/90"
                  : "bg-cream/[0.04] text-cream/50 hover:text-cream/70 hover:bg-cream/[0.08]"
              }`}
            >
              <Icon size={12} />
              {t.label}
              <span className="text-cream/30">{t.count}</span>
            </button>
          );
        })}
      </div>

      {/* List */}
      {pagedItems.length === 0 ? (
        <p className="text-sm text-cream/30">Nothing in this category.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {pagedItems.map((entry, i) => {
            const displayNumber = page * PAGE_SIZE + i + 1;
            if (entry.type === "album") {
              const album = entry.item as Album;
              return (
                <div
                  key={`album-${album.id}`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-cream/[0.02] border border-cream/[0.04]"
                >
                  <span className="w-5 flex-shrink-0 text-right text-xs text-cream/30 tabular-nums select-none">
                    {displayNumber}
                  </span>
                  <div className="w-10 h-10 flex-shrink-0 rounded-lg overflow-hidden bg-cream/[0.06]">
                    {album.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={album.cover_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Disc3 size={14} className="text-cream/20" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-cream/90 truncate">
                      {album.title}
                    </div>
                    <div className="text-xs text-cream/40 truncate">
                      {album.artist}
                      {album.release_date ? ` · ${album.release_date.slice(0, 4)}` : ""}
                      {album.album_type ? ` · ${album.album_type}` : ""}
                    </div>
                  </div>
                  {album.is_favorite && (
                    <Heart size={12} className="text-secondary fill-secondary flex-shrink-0" />
                  )}
                  {album.stars != null && album.stars > 0 && (
                    <span className="text-xs text-accent flex-shrink-0">
                      {"★".repeat(album.stars)}
                    </span>
                  )}
                </div>
              );
            }
            const track = entry.item as Track;
            return (
              <div
                key={`track-${track.id}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-cream/[0.02] border border-cream/[0.04]"
              >
                <span className="w-5 flex-shrink-0 text-right text-xs text-cream/30 tabular-nums select-none">
                    {displayNumber}
                  </span>
                  <div className="w-10 h-10 flex-shrink-0 rounded-lg overflow-hidden bg-cream/[0.06]">
                    {track.album_cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={track.album_cover_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music size={14} className="text-cream/20" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-cream/90 truncate">
                        {track.title}
                      </span>
                      {track.is_liked && (
                        <Heart size={10} className="text-success fill-success flex-shrink-0" />
                      )}
                    </div>
                    <div className="text-xs text-cream/40 truncate">
                    {track.artist}
                    {track.album_title ? ` · ${track.album_title}` : ""}
                  </div>
                </div>
                {track.is_favorite && (
                  <Heart size={12} className="text-secondary fill-secondary flex-shrink-0" />
                )}
                {track.stars != null && track.stars > 0 && (
                  <span className="text-xs text-accent flex-shrink-0">
                    {"★".repeat(track.stars)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-4">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-cream/[0.04] hover:bg-cream/[0.08] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Previous page"
          >
            <ChevronLeft size={14} className="text-cream/60" />
          </button>
          <span className="text-xs text-cream/40 tabular-nums">
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-cream/[0.04] hover:bg-cream/[0.08] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Next page"
          >
            <ChevronRight size={14} className="text-cream/60" />
          </button>
        </div>
      )}
    </section>
  );
}