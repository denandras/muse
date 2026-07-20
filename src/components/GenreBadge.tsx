import type { Genre } from "@/lib/types";

export default function GenreBadge({
  genre,
  onClick,
  active = false,
}: {
  genre: Genre;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
        active
          ? "bg-primary/30 text-primary-light border border-primary-hover/40"
          : "bg-cream/[0.06] text-cream/60 hover:bg-cream/[0.1] hover:text-cream/80 border border-transparent"
      }`}
    >
      {genre.name}
    </button>
  );
}