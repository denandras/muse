"use client";

import { Star } from "lucide-react";
import { motion } from "framer-motion";

interface StarRatingProps {
  value: number | null;
  onChange?: (stars: number | null) => void;
  size?: number;
  readOnly?: boolean;
}

export default function StarRating({
  value,
  onChange,
  size = 14,
  readOnly = false,
}: StarRatingProps) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = value !== null && n <= value;
        return (
          <motion.button
            key={n}
            type="button"
            disabled={readOnly}
            whileTap={readOnly ? undefined : { scale: 0.85 }}
            onClick={(e) => {
              e.stopPropagation();
              if (readOnly) return;
              // Click same value again clears it (sets to 0/null).
              onChange?.(value === n ? 0 : n);
            }}
            className={`${
              readOnly ? "cursor-default" : "cursor-pointer"
            } text-white/30 hover:text-yellow-400 transition-colors disabled:hover:text-white/30`}
            aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
          >
            <Star
              size={size}
              className={filled ? "fill-yellow-400 text-yellow-400" : ""}
              strokeWidth={1.5}
            />
          </motion.button>
        );
      })}
    </div>
  );
}