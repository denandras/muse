"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Plus, Minus, ChevronRight } from "lucide-react";

// Tri-state filter value for a single genre/mood item.
// - null/absent = no filter (empty circle)
// - "include" = must have this tag (plus icon)
// - "exclude" = must NOT have this tag (minus icon)
export type TriState = "include" | "exclude";

export type TriStateMap = Record<string, TriState>;

export interface FlatItem {
  id: string;
  label: string;
  depth: number;
  parentId: string | null;
  hasChildren: boolean;
}

interface TriStateFilterProps {
  label: string;            // "Genres" or "Moods"
  items: FlatItem[];        // flattened tree in DFS order, with parent/child info
  values: TriStateMap;      // current state
  onChange: (next: TriStateMap) => void;
}

// Cycle: empty → include → exclude → empty
function nextTriState(current: TriState | undefined): TriState | undefined {
  if (!current) return "include";
  if (current === "include") return "exclude";
  return undefined; // exclude → empty
}

export default function TriStateFilter({
  label,
  items,
  values,
  onChange,
}: TriStateFilterProps) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
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

  const activeCount = Object.keys(values).length;
  const includeCount = Object.values(values).filter((v) => v === "include").length;
  const excludeCount = Object.values(values).filter((v) => v === "exclude").length;

  // Build a compact button label
  const buttonText = activeCount === 0
    ? `All ${label.toLowerCase()}`
    : `${includeCount > 0 ? `+${includeCount}` : ""}${excludeCount > 0 ? `${includeCount > 0 ? " " : ""}-${excludeCount}` : ""}`;

  const handleClick = (id: string) => {
    const next = nextTriState(values[id]);
    const newValues = { ...values };
    if (next) {
      newValues[id] = next;
    } else {
      delete newValues[id];
    }
    onChange(newValues);
  };

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange({});
  };

  // Compute visible items: skip descendants of collapsed parents.
  // Items are in DFS order, so we track a "skipDepth" — when a parent is
  // collapsed, all subsequent items with depth > skipDepth are hidden until
  // we return to the same or shallower depth.
  const visibleItems = useMemo(() => {
    const result: FlatItem[] = [];
    let skipDepth = -1;
    for (const item of items) {
      if (skipDepth >= 0 && item.depth > skipDepth) continue; // inside collapsed branch
      skipDepth = -1; // exited the collapsed branch
      result.push(item);
      if (item.hasChildren && collapsed.has(item.id)) {
        skipDepth = item.depth;
      }
    }
    return result;
  }, [items, collapsed]);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-sm transition-colors cursor-pointer ${
          activeCount > 0
            ? "bg-primary/15 border-primary/30 text-primary-hover"
            : "bg-cream/[0.04] border-cream/[0.06] text-cream/60 hover:text-cream/80"
        }`}
        aria-expanded={open}
      >
        <span className="select-none">{label}</span>
        {activeCount > 0 && (
          <span className="text-xs tabular-nums opacity-80">{buttonText}</span>
        )}
        {activeCount > 0 && (
          <span
            role="button"
            tabIndex={-1}
            onClick={clearAll}
            className="ml-0.5 -mr-1 w-4 h-4 flex items-center justify-center rounded hover:bg-cream/10 text-cream/40 hover:text-cream/80"
            title="Clear filters"
          >
            <span className="text-xs">×</span>
          </span>
        )}
        <ChevronDown
          size={14}
          className={`text-cream/30 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 mt-1.5 left-0 min-w-[220px] max-w-[340px] max-h-[340px] overflow-y-auto rounded-xl border border-cream/10 bg-panel/95 backdrop-blur-xl shadow-2xl py-1.5">
          {items.length === 0 ? (
            <div className="px-3 py-2 text-xs text-cream/30">
              No {label.toLowerCase()} available
            </div>
          ) : (
            visibleItems.map((item) => {
              const state = values[item.id];
              const isCollapsed = collapsed.has(item.id);
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-cream/70 hover:bg-cream/[0.06] transition-colors"
                  style={{ paddingLeft: `${12 + item.depth * 16}px` }}
                >
                  {/* Expand/collapse chevron (or spacer for leaf nodes) */}
                  {item.hasChildren ? (
                    <button
                      type="button"
                      onClick={() => toggleCollapse(item.id)}
                      className="flex items-center justify-center w-4 h-4 flex-shrink-0 text-cream/40 hover:text-cream/80 transition-colors"
                      aria-label={isCollapsed ? "Expand" : "Collapse"}
                    >
                      <ChevronRight
                        size={12}
                        className={`transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                      />
                    </button>
                  ) : (
                    <span className="w-4 h-4 flex-shrink-0" />
                  )}
                  {/* Tri-state toggle button */}
                  <button
                    type="button"
                    onClick={() => handleClick(item.id)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <span
                      className={`flex items-center justify-center w-4 h-4 rounded border transition-colors flex-shrink-0 ${
                        state === "include"
                          ? "bg-primary/80 border-primary-hover text-cream"
                          : state === "exclude"
                          ? "bg-secondary/80 border-secondary-hover text-cream"
                          : "bg-transparent border-cream/20 text-transparent"
                      }`}
                    >
                      {state === "include" && <Plus size={10} strokeWidth={3} />}
                      {state === "exclude" && <Minus size={10} strokeWidth={3} />}
                    </span>
                    <span className="truncate min-w-0">{item.label}</span>
                  </button>
                </div>
              );
            })
          )}
          {/* Footer: clear all */}
          {activeCount > 0 && (
            <div className="sticky bottom-0 mt-1 pt-1.5 pb-1 px-2 border-t border-cream/[0.06] bg-panel/95">
              <button
                type="button"
                onClick={() => onChange({})}
                className="w-full text-center text-xs text-cream/40 hover:text-cream/70 py-1 transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}