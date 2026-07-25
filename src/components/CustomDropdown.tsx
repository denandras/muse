"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";

interface DropdownOption {
  value: string;
  label: string;
}

interface CustomDropdownProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  className?: string;
  /** Optional title attribute for the trigger button */
  title?: string;
}

/**
 * In-app CSS dropdown — replaces native <select> elements.
 * Styled to match the glass theme: dark panel, blur backdrop,
 * checkmark on selected option.
 *
 * Why not native <select>? On mobile, the browser opens a phone-style
 * picker that looks completely different from the app's theme. This
 * dropdown renders inside the app's DOM with consistent styling.
 */
export default function CustomDropdown({
  value,
  options,
  onChange,
  className = "",
  title,
}: CustomDropdownProps) {
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

  const selectedOption = options.find((o) => o.value === value);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full h-10 pl-3 pr-9 rounded-xl bg-cream/[0.04] border border-cream/[0.06] text-sm text-cream/80 focus:outline-none focus:border-cream/20 transition-colors cursor-pointer flex items-center justify-between"
        aria-expanded={open}
        title={title}
      >
        <span className="truncate">{selectedOption?.label ?? "Select…"}</span>
        <ChevronDown
          size={14}
          className={`absolute right-3 top-1/2 -translate-y-1/2 text-cream/30 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute z-50 mt-1.5 left-0 right-0 min-w-full max-w-[280px] rounded-xl border border-cream/10 bg-panel/95 backdrop-blur-xl shadow-2xl py-1.5 max-h-[300px] overflow-y-auto"
          >
            {options.map((opt) => {
              const selected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors ${
                    selected
                      ? "text-primary-light bg-primary/10"
                      : "text-cream/70 hover:bg-cream/[0.06]"
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {selected && <Check size={14} className="text-primary-light flex-shrink-0 ml-2" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}