import type { Mood } from "@/lib/types";

export default function MoodBadge({
  mood,
  onClick,
  active = false,
}: {
  mood: Mood;
  onClick?: () => void;
  active?: boolean;
}) {
  const color = mood.color || "var(--mood-fallback)";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-all ${
        active ? "ring-1 ring-cream/40" : ""
      }`}
      style={{
        backgroundColor: `${color}22`,
        color,
        border: `1px solid ${color}55`,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {mood.name}
    </button>
  );
}