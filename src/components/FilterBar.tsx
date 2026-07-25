"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { ArrowUp, ArrowDown, Heart, ListMusic, Clock } from "lucide-react";
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
  /** Duration filter in seconds. null = no filter. */
  minDuration: number | null;
  maxDuration: number | null;
}

interface FilterBarProps {
  filters: FilterState;
  onChange: (next: Partial<FilterState>) => void;
  genres: Genre[];
  moods: Mood[];
  /** Min track duration in seconds across the library (for the duration slider range). */
  durationMin?: number;
  /** Max track duration in seconds across the library (for the duration slider range). */
  durationMax?: number;
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
  durationMin = 0,
  durationMax = 600,
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

      {/* Duration filter */}
      <DurationFilter
        minDuration={filters.minDuration}
        maxDuration={filters.maxDuration}
        rangeMin={durationMin}
        rangeMax={durationMax}
        onChange={(min, max) => onChange({ minDuration: min, maxDuration: max })}
      />

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

// ── Duration filter ────────────────────────────────────────────────────────
// A dropdown with a dual-thumb range slider. The slider range is set from
// the actual min/max track durations in the library so the user can scrub
// from shortest to longest. The values are in seconds.
function formatDurationShort(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function DurationFilter({
  minDuration,
  maxDuration,
  rangeMin,
  rangeMax,
  onChange,
}: {
  minDuration: number | null;
  maxDuration: number | null;
  rangeMin: number;
  rangeMax: number;
  onChange: (min: number | null, max: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"min" | "max" | null>(null);

  // Current slider values (default to range bounds when null)
  const minVal = minDuration ?? rangeMin;
  const maxVal = maxDuration ?? rangeMax;
  const isActive = minDuration !== null || maxDuration !== null;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Handle drag on slider track
  useEffect(() => {
    if (!dragging || !open) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!sliderRef.current) return;
      const rect = sliderRef.current.getBoundingClientRect();
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const value = Math.round(rangeMin + ratio * (rangeMax - rangeMin));

      if (dragging === "min") {
        onChange(Math.min(value, maxVal - 5), maxDuration);
      } else {
        onChange(minDuration, Math.max(value, minVal + 5));
      }
    };

    const handleUp = () => setDragging(null);

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    document.addEventListener("touchmove", handleMove);
    document.addEventListener("touchend", handleUp);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      document.removeEventListener("touchmove", handleMove);
      document.removeEventListener("touchend", handleUp);
    };
  }, [dragging, open, minVal, maxVal, minDuration, maxDuration, rangeMin, rangeMax, onChange]);

  const minPercent = ((minVal - rangeMin) / (rangeMax - rangeMin)) * 100;
  const maxPercent = ((maxVal - rangeMin) / (rangeMax - rangeMin)) * 100;

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null, null);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-sm transition-colors cursor-pointer ${
          isActive
            ? "bg-primary/15 border-primary/30 text-primary-hover"
            : "bg-cream/[0.04] border-cream/[0.06] text-cream/60 hover:text-cream/80"
        }`}
        aria-expanded={open}
      >
        <Clock size={14} />
        <span className="select-none hidden sm:inline">Length</span>
        {isActive && (
          <span className="text-xs tabular-nums opacity-80">
            {formatDurationShort(minVal)}–{formatDurationShort(maxVal)}
          </span>
        )}
        {isActive && (
          <span
            role="button"
            tabIndex={-1}
            onClick={handleClear}
            className="ml-0.5 -mr-1 w-4 h-4 flex items-center justify-center rounded hover:bg-cream/10 text-cream/40 hover:text-cream/80"
            title="Clear length filter"
          >
            <span className="text-xs">×</span>
          </span>
        )}
      </button>
      {open && (
        <div className="absolute z-50 mt-1.5 left-0 min-w-[240px] max-w-[320px] rounded-xl border border-cream/10 bg-panel/95 backdrop-blur-xl shadow-2xl p-4">
          <div className="text-xs text-cream/50 mb-3">Filter by track length</div>
          {/* Dual-thumb slider */}
          <div
            ref={sliderRef}
            className="relative h-6 flex items-center"
          >
            {/* Track */}
            <div className="absolute left-0 right-0 h-1.5 rounded-full bg-cream/10" />
            {/* Active range */}
            <div
              className="absolute h-1.5 rounded-full bg-primary/60"
              style={{ left: `${minPercent}%`, right: `${100 - maxPercent}%` }}
            />
            {/* Min thumb */}
            <div
              onMouseDown={(e) => { e.preventDefault(); setDragging("min"); }}
              onTouchStart={(e) => { e.preventDefault(); setDragging("min"); }}
              className="absolute w-4 h-4 rounded-full bg-cream border-2 border-primary shadow-md cursor-grab active:cursor-grabbing -translate-x-1/2 z-10"
              style={{ left: `${minPercent}%` }}
            />
            {/* Max thumb */}
            <div
              onMouseDown={(e) => { e.preventDefault(); setDragging("max"); }}
              onTouchStart={(e) => { e.preventDefault(); setDragging("max"); }}
              className="absolute w-4 h-4 rounded-full bg-cream border-2 border-primary shadow-md cursor-grab active:cursor-grabbing -translate-x-1/2 z-10"
              style={{ left: `${maxPercent}%` }}
            />
          </div>
          {/* Labels */}
          <div className="flex justify-between mt-2 text-xs text-cream/50">
            <span className="tabular-nums">{formatDurationShort(minVal)}</span>
            <span className="tabular-nums">{formatDurationShort(maxVal)}</span>
          </div>
          {/* Quick presets */}
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-cream/[0.06]">
            <button
              type="button"
              onClick={() => onChange(null, null)}
              className="h-7 px-2.5 rounded-lg text-xs bg-cream/[0.04] border border-cream/[0.06] text-cream/60 hover:bg-cream/[0.08] transition-colors"
            >
              Any
            </button>
            <button
              type="button"
              onClick={() => onChange(null, 180)}
              className="h-7 px-2.5 rounded-lg text-xs bg-cream/[0.04] border border-cream/[0.06] text-cream/60 hover:bg-cream/[0.08] transition-colors"
            >
              ≤ 3:00
            </button>
            <button
              type="button"
              onClick={() => onChange(180, 300)}
              className="h-7 px-2.5 rounded-lg text-xs bg-cream/[0.04] border border-cream/[0.06] text-cream/60 hover:bg-cream/[0.08] transition-colors"
            >
              3–5 min
            </button>
            <button
              type="button"
              onClick={() => onChange(300, null)}
              className="h-7 px-2.5 rounded-lg text-xs bg-cream/[0.04] border border-cream/[0.06] text-cream/60 hover:bg-cream/[0.08] transition-colors"
            >
              5:00+
            </button>
          </div>
        </div>
      )}
    </div>
  );
}