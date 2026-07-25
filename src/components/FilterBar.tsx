"use client";

import { useMemo } from "react";
import { ArrowUp, ArrowDown, Heart, ListMusic } from "lucide-react";
import type { Genre, Mood, SortKey, SortDirection } from "@/lib/types";
import TriStateFilter, {
  type TriStateMap,
} from "./TriStateFilter";
import CustomDropdown from "./CustomDropdown";

// Build a tree from the flat genre list returned by the API.
// The API returns { genres: [...] } where each genre has a parent_id
// but no children array. The TriStateFilter needs depth/hierarchy info.
function buildGenreTree(flat: Genre[]): Genre[] {
  const map = new Map<string, Genre>();
  flat.forEach((g) => map.set(g.id, { ...g, children: [] }));
  const roots: Genre[] = [];
  map.forEach((g) => {
    if (g.parent_id && map.has(g.parent_id)) {
      map.get(g.parent_id)!.children!.push(g);
    } else {
      roots.push(g);
    }
  });
  const sortRec = (list: Genre[]) => {
    list.sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
    );
    list.forEach((g) => g.children && sortRec(g.children));
  };
  sortRec(roots);
  return roots;
}

export interface FilterState {
  search: string;
  genreFilters: TriStateMap;
  moodFilters: TriStateMap;
  stars: number | "unrated" | null;
  favoritesOnly: boolean;
  /** When true, tracks with matching stars show even if their album doesn't match the star filter. Default: true. */
  trackLevelStars: boolean;
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
  // Build a tree from the flat genre list (the API returns flat rows,
  // not nested). Without this, every genre has children=undefined and
  // they all render at depth 0 — flat instead of hierarchical.
  const genreTree = useMemo(() => buildGenreTree(genres), [genres]);

  // Flatten genre tree for dropdown display with hierarchy info.
  // Items are in DFS order so the TriStateFilter can show/hide subtrees
  // when a parent is collapsed.
  const flatGenres: { id: string; label: string; depth: number; parentId: string | null; hasChildren: boolean }[] = [];
  const walk = (list: Genre[], depth: number, parentId: string | null) => {
    list.forEach((g) => {
      const hasChildren = !!g.children?.length;
      flatGenres.push({ id: g.id, label: g.name, depth, parentId, hasChildren });
      if (hasChildren) walk(g.children!, depth + 1, g.id);
    });
  };
  walk(genreTree, 0, null);

  // Flatten moods (no hierarchy).
  const flatMoods = moods.map((m) => ({ id: m.id, label: m.name, depth: 0, parentId: null, hasChildren: false }));

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
      <CustomDropdown
        value={filters.stars === null ? "" : filters.stars === "unrated" ? "unrated" : String(filters.stars)}
        options={STARS_OPTIONS}
        onChange={(v) => {
          onChange({ stars: v === "" ? null : v === "unrated" ? "unrated" : Number(v) });
        }}
        className="w-auto"
      />

      {/* Track-level star filter toggle — when ON, tracks with matching
          individual star ratings appear even if their album doesn't match
          the star filter. When OFF, only album-level stars are used (in
          album/both view, tracks inside albums use the album's rating). */}
      {filters.stars !== null && filters.stars !== "unrated" && (
        <button
          type="button"
          onClick={() => onChange({ trackLevelStars: !filters.trackLevelStars })}
          className={`flex items-center justify-center h-9 px-2.5 rounded-xl border transition-colors ${
            filters.trackLevelStars
              ? "bg-violet-500/15 border-violet-400/30 text-violet-300"
              : "bg-cream/[0.04] border-cream/[0.06] text-cream/30 hover:text-cream/60"
          }`}
          title={
            filters.trackLevelStars
              ? "Showing tracks with matching individual stars (even if album doesn't match)"
              : "Only showing albums/tracks that match the star filter"
          }
          aria-pressed={filters.trackLevelStars}
        >
          <ListMusic size={15} />
        </button>
      )}

      {/* Favorites only — heart icon toggle */}
      <button
        type="button"
        onClick={() => onChange({ favoritesOnly: !filters.favoritesOnly })}
        className={`flex items-center justify-center h-9 w-9 rounded-xl border transition-colors ${
          filters.favoritesOnly
            ? "bg-secondary/15 border-secondary/30 text-secondary"
            : "bg-cream/[0.04] border-cream/[0.06] text-cream/30 hover:text-cream/60"
        }`}
        title={filters.favoritesOnly ? "Showing favorites only" : "Show favorites only"}
        aria-pressed={filters.favoritesOnly}
        aria-label="Toggle favorites only"
      >
        <Heart size={15} className={filters.favoritesOnly ? "fill-secondary" : ""} strokeWidth={1.5} />
      </button>

      {/* Sort + direction toggle */}
      <div className="flex items-center gap-1 sm:ml-auto">
        <CustomDropdown
          value={filters.sort}
          options={SORT_OPTIONS}
          onChange={(v) => onChange({ sort: v as SortKey })}
          className="w-auto"
        />
        <button
          type="button"
          onClick={() => onChange({ sortDirection: filters.sortDirection === "asc" ? "desc" : "asc" })}
          className="h-9 w-9 flex items-center justify-center rounded-xl bg-cream/[0.04] border border-cream/[0.06] text-sm text-cream/60 hover:text-cream/90 hover:bg-cream/[0.08] transition-colors"
          title={filters.sortDirection === "asc" ? "Ascending" : "Descending"}
          aria-label={`Sort ${filters.sortDirection === "asc" ? "ascending" : "descending"}`}
        >
          {filters.sortDirection === "asc" ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
        </button>
      </div>
    </div>
  );
}