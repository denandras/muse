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
          ? "bg-violet-500/30 text-violet-200 border border-violet-400/40"
          : "bg-white/[0.06] text-white/60 hover:bg-white/[0.1] hover:text-white/80 border border-transparent"
      }`}
    >
      {genre.name}
    </button>
  );
}