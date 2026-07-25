"use client";

import { Heart } from "lucide-react";
import { motion } from "framer-motion";

interface FavoriteToggleProps {
  isFavorite: boolean;
  onChange?: (value: boolean) => void;
  size?: number;
  readOnly?: boolean;
}

export default function FavoriteToggle({
  isFavorite,
  onChange,
  size = 16,
  readOnly = false,
}: FavoriteToggleProps) {
  return (
    <motion.button
      type="button"
      disabled={readOnly}
      whileTap={readOnly ? undefined : { scale: 0.8 }}
      onClick={(e) => {
        e.stopPropagation();
        if (readOnly) return;
        onChange?.(!isFavorite);
      }}
      className={`transition-colors ${
        readOnly ? "cursor-default" : ""
      } ${
        isFavorite
          ? "text-secondary hover:text-secondary"
          : "text-cream/30 hover:text-cream/60"
      }`}
      aria-label={isFavorite ? "Unfavorite" : "Favorite"}
      aria-pressed={isFavorite}
    >
      <Heart
        size={size}
        className={isFavorite ? "fill-secondary" : ""}
        strokeWidth={1.5}
      />
    </motion.button>
  );
}