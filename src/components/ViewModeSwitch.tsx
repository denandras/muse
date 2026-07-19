"use client";

import type { ViewMode } from "@/lib/types";
import { motion } from "framer-motion";
import { Disc3, ListMusic, LayoutGrid } from "lucide-react";

const MODES: { value: ViewMode; label: string; icon: typeof Disc3 }[] = [
  { value: "albums", label: "Albums", icon: Disc3 },
  { value: "tracks", label: "Tracks", icon: ListMusic },
  { value: "both", label: "Both", icon: LayoutGrid },
];

export default function ViewModeSwitch({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-xl glass">
      {MODES.map((mode) => {
        const active = value === mode.value;
        const Icon = mode.icon;
        return (
          <button
            key={mode.value}
            type="button"
            onClick={() => onChange(mode.value)}
            className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              active ? "text-white" : "text-white/40 hover:text-white/70"
            }`}
          >
            {active && (
              <motion.span
                layoutId="viewmode-pill"
                className="absolute inset-0 rounded-lg bg-white/[0.1]"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <Icon size={14} className="relative z-10" />
            <span className="relative z-10 hidden sm:inline">{mode.label}</span>
          </button>
        );
      })}
    </div>
  );
}