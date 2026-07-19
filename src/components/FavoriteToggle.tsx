"use client";

import { Heart } from "lucide-react";
import { motion } from "framer-motion";

interface FavoriteToggleProps {
  isFavorite: boolean;
  onChange?: (value: boolean) => void;
  size?: number;
}

export default function FavoriteToggle({
  isFavorite,
  onChange,
  size = 16,
}: FavoriteToggleProps) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.8 }}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.(!isFavorite);
      }}
      className={`transition-colors ${
        isFavorite
          ? "text-rose-500 hover:text-rose-400"
          : "text-white/30 hover:text-white/60"
      }`}
      aria-label={isFavorite ? "Unfavorite" : "Favorite"}
      aria-pressed={isFavorite}
    >
      <Heart
        size={size}
        className={isFavorite ? "fill-rose-500" : ""}
        strokeWidth={1.5}
      />
    </motion.button>
  );
}