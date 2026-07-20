"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Plus, Minus, Check } from "lucide-react";

// Tri-state filter value for a single genre/mood item.
// - null/absent = no filter (empty circle)
// - "include" = must have this tag (plus icon)
// - "exclude" = must NOT have this tag (minus icon)
export type TriState = "include" | "exclude";

export type TriStateMap = Record<string, TriState>;

interface FlatItem {
  id: string;
  label: string;
  depth: number;
}

interface TriStateFilterProps {
  label: string;            // "Genres" or "Moods"
  items: FlatItem[];        // flattened, already indented by depth
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

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange({});
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-sm transition-colors cursor-pointer ${
          activeCount > 0
            ? "bg-violet-500/15 border-violet-500/30 text-violet-300"
            : "bg-white/[0.04] border-white/[0.06] text-white/60 hover:text-white/80"
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
            className="ml-0.5 -mr-1 w-4 h-4 flex items-center justify-center rounded hover:bg-white/10 text-white/40 hover:text-white/80"
            title="Clear filters"
          >
            <span className="text-xs">×</span>
          </span>
        )}
        <ChevronDown
          size={14}
          className={`text-white/30 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 mt-1.5 left-0 min-w-[220px] max-w-[320px] max-h-[340px] overflow-y-auto rounded-xl border border-white/10 bg-[#1a1a1f]/95 backdrop-blur-xl shadow-2xl py-1.5">
          {items.length === 0 ? (
            <div className="px-3 py-2 text-xs text-white/30">
              No {label.toLowerCase()} available
            </div>
          ) : (
            items.map((item) => {
              const state = values[item.id];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleClick(item.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-white/70 hover:bg-white/[0.06] transition-colors cursor-pointer text-left"
                  style={{ paddingLeft: `${12 + item.depth * 16}px` }}
                >
                  {/* Tri-state visual indicator */}
                  <span
                    className={`flex items-center justify-center w-4 h-4 rounded border transition-colors flex-shrink-0 ${
                      state === "include"
                        ? "bg-violet-500/80 border-violet-400 text-white"
                        : state === "exclude"
                        ? "bg-rose-500/80 border-rose-400 text-white"
                        : "bg-transparent border-white/20 text-transparent"
                    }`}
                  >
                    {state === "include" && <Plus size={10} strokeWidth={3} />}
                    {state === "exclude" && <Minus size={10} strokeWidth={3} />}
                  </span>
                  <span className="truncate min-w-0">{item.label}</span>
                </button>
              );
            })
          )}
          {/* Footer: clear all */}
          {activeCount > 0 && (
            <div className="sticky bottom-0 mt-1 pt-1.5 pb-1 px-2 border-t border-white/[0.06] bg-[#1a1a1f]/95">
              <button
                type="button"
                onClick={() => onChange({})}
                className="w-full text-center text-xs text-white/40 hover:text-white/70 py-1 transition-colors"
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