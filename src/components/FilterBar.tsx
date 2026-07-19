"use client";

import { Search, ChevronDown, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import type { Genre, Mood, SortKey, SortDirection } from "@/lib/types";

export interface FilterState {
  search: string;
  genreId: string | null;
  includeSubgenres: boolean;
  moodId: string | null;
  stars: number | "unrated" | null;
  favoritesOnly: boolean;
  sort: SortKey;
  sortDirection: SortDirection;
}

interface FilterBarProps {
  filters: FilterState;
  onChange: (next: Partial<FilterState>) => void;
  genres: Genre[];
  moods: Mood[];
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "title", label: "Title" },
  { value: "artist", label: "Artist" },
  { value: "album", label: "Album" },
  { value: "stars", label: "Stars" },
  { value: "play_count", label: "Play count" },
  { value: "added_at", label: "Date added" },
  { value: "last_played_at", label: "Last played" },
  { value: "updated_at", label: "Recently updated" },
];

const STARS_OPTIONS = [
  { value: "", label: "Any stars" },
  { value: "5", label: "5 stars" },
  { value: "4", label: "4+ stars" },
  { value: "3", label: "3+ stars" },
  { value: "2", label: "2+ stars" },
  { value: "1", label: "1+ stars" },
  { value: "unrated", label: "Unrated" },
];

export default function FilterBar({
  filters,
  onChange,
  genres,
  moods,
}: FilterBarProps) {
  // Flatten genre tree for dropdown display with indentation.
  const flatGenres: { id: string; label: string; depth: number }[] = [];
  const walk = (list: Genre[], depth: number, prefix: string) => {
    list.forEach((g) => {
      const label = prefix ? `${prefix} / ${g.name}` : g.name;
      flatGenres.push({ id: g.id, label, depth });
      if (g.children?.length) walk(g.children, depth + 1, label);
    });
  };
  walk(genres, 0, "");

  return (
    <div className="flex flex-col gap-3 p-4 rounded-2xl glass">
      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
        />
        <input
          type="search"
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
          placeholder="Search title, artist, album..."
          className="w-full h-10 pl-9 pr-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus:border-white/20 transition-colors"
        />
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Genre */}
        <div className="relative">
          <select
            value={filters.genreId ?? ""}
            onChange={(e) =>
              onChange({ genreId: e.target.value || null })
            }
            className="appearance-none h-9 pl-3 pr-8 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white/80 focus:outline-none focus:border-white/20 transition-colors cursor-pointer"
          >
            <option value="">All genres</option>
            {flatGenres.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none"
          />
        </div>

        {/* Include subgenres checkbox */}
        <label className="inline-flex items-center gap-1.5 text-xs text-white/50 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filters.includeSubgenres}
            onChange={(e) =>
              onChange({ includeSubgenres: e.target.checked })
            }
            className="w-3.5 h-3.5 rounded accent-violet-500"
          />
          Include subgenres
        </label>

        {/* Mood */}
        <div className="relative">
          <select
            value={filters.moodId ?? ""}
            onChange={(e) =>
              onChange({ moodId: e.target.value || null })
            }
            className="appearance-none h-9 pl-3 pr-8 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white/80 focus:outline-none focus:border-white/20 transition-colors cursor-pointer"
          >
            <option value="">All moods</option>
            {moods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none"
          />
        </div>

        {/* Stars */}
        <div className="relative">
          <select
            value={filters.stars ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onChange({
                stars: v === "" ? null : v === "unrated" ? "unrated" : Number(v),
              });
            }}
            className="appearance-none h-9 pl-3 pr-8 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white/80 focus:outline-none focus:border-white/20 transition-colors cursor-pointer"
          >
            {STARS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none"
          />
        </div>

        {/* Favorites only */}
        <label className="inline-flex items-center gap-1.5 text-xs text-white/50 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filters.favoritesOnly}
            onChange={(e) =>
              onChange({ favoritesOnly: e.target.checked })
            }
            className="w-3.5 h-3.5 rounded accent-rose-500"
          />
          Favorites only
        </label>

        {/* Sort + direction toggle */}
        <div className="flex items-center gap-1 ml-auto">
          <div className="relative">
            <select
              value={filters.sort}
              onChange={(e) => onChange({ sort: e.target.value as SortKey })}
              className="appearance-none h-9 pl-3 pr-8 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white/80 focus:outline-none focus:border-white/20 transition-colors cursor-pointer"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  Sort: {o.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none"
            />
          </div>
          {/* Sort direction toggle: click to flip asc/desc */}
          <button
            type="button"
            onClick={() =>
              onChange({ sortDirection: filters.sortDirection === "asc" ? "desc" : "asc" })
            }
            className="h-9 w-9 flex items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white/60 hover:text-white/90 hover:bg-white/[0.08] transition-colors"
            title={filters.sortDirection === "asc" ? "Ascending (click for descending)" : "Descending (click for ascending)"}
            aria-label={`Sort ${filters.sortDirection === "asc" ? "ascending" : "descending"}`}
          >
            {filters.sortDirection === "asc" ? (
              <ArrowUp size={15} />
            ) : (
              <ArrowDown size={15} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}