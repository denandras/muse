"use client";

import { ChevronDown, ArrowUp, ArrowDown, Heart } from "lucide-react";
import type { Genre, Mood, SortKey, SortDirection } from "@/lib/types";
import TriStateFilter, {
  type TriStateMap,
} from "./TriStateFilter";

export interface FilterState {
  search: string;
  genreFilters: TriStateMap;
  moodFilters: TriStateMap;
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

  // Flatten moods (no hierarchy).
  const flatMoods = moods.map((m) => ({ id: m.id, label: m.name, depth: 0 }));

  return (
    <div className="flex flex-wrap items-center gap-2 p-2 sm:p-3 rounded-2xl glass">
      {/* Genre — custom tri-state dropdown */}
      <TriStateFilter
        label="Genres"
        items={flatGenres}
        values={filters.genreFilters}
        onChange={(next) => onChange({ genreFilters: next })}
      />

      {/* Mood — custom tri-state dropdown */}
      <TriStateFilter
        label="Moods"
        items={flatMoods}
        values={filters.moodFilters}
        onChange={(next) => onChange({ moodFilters: next })}
      />

      {/* Stars */}
      <div className="relative">
        <select
          value={filters.stars ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ stars: v === "" ? null : v === "unrated" ? "unrated" : Number(v) });
          }}
          className="appearance-none h-9 pl-3 pr-8 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white/80 focus:outline-none focus:border-white/20 transition-colors cursor-pointer"
        >
          {STARS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
      </div>

      {/* Favorites only — heart icon toggle */}
      <button
        type="button"
        onClick={() => onChange({ favoritesOnly: !filters.favoritesOnly })}
        className={`flex items-center justify-center h-9 w-9 rounded-xl border transition-colors ${
          filters.favoritesOnly
            ? "bg-rose-500/15 border-rose-500/30 text-rose-400"
            : "bg-white/[0.04] border-white/[0.06] text-white/30 hover:text-white/60"
        }`}
        title={filters.favoritesOnly ? "Showing favorites only" : "Show favorites only"}
        aria-pressed={filters.favoritesOnly}
        aria-label="Toggle favorites only"
      >
        <Heart size={15} className={filters.favoritesOnly ? "fill-rose-400" : ""} strokeWidth={1.5} />
      </button>

      {/* Sort + direction toggle */}
      <div className="flex items-center gap-1 sm:ml-auto">
        <div className="relative">
          <select
            value={filters.sort}
            onChange={(e) => onChange({ sort: e.target.value as SortKey })}
            className="appearance-none h-9 pl-3 pr-8 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white/80 focus:outline-none focus:border-white/20 transition-colors cursor-pointer"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
        </div>
        <button
          type="button"
          onClick={() => onChange({ sortDirection: filters.sortDirection === "asc" ? "desc" : "asc" })}
          className="h-9 w-9 flex items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white/60 hover:text-white/90 hover:bg-white/[0.08] transition-colors"
          title={filters.sortDirection === "asc" ? "Ascending" : "Descending"}
          aria-label={`Sort ${filters.sortDirection === "asc" ? "ascending" : "descending"}`}
        >
          {filters.sortDirection === "asc" ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
        </button>
      </div>
    </div>
  );
}