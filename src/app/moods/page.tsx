"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Palette, Plus, Pencil, Trash2, Loader2, X } from "lucide-react";
import type { Mood } from "@/lib/types";

const DEFAULT_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
];

export default function MoodsPage() {
  const [moods, setMoods] = useState<Mood[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<
    | { kind: "create" }
    | { kind: "rename"; mood: Mood }
    | { kind: "delete"; mood: Mood }
    | null
  >(null);

  const load = useCallback(() => {
    fetch("/api/moods")
      .then((r) => r.json())
      .then((d) => setMoods(Array.isArray(d) ? d : d.moods ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Palette className="text-pink-400" size={20} />
          <h1 className="text-xl font-semibold text-white/90">Moods</h1>
        </div>
        <button
          onClick={() => setModal({ kind: "create" })}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-pink-500/20 text-pink-200 border border-pink-500/30 text-sm hover:bg-pink-500/30 transition-colors"
        >
          <Plus size={14} />
          New mood
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="animate-spin text-white/40" size={24} />
        </div>
      ) : moods.length === 0 ? (
        <div className="text-center py-16 text-sm text-white/30 rounded-xl bg-white/[0.02] border border-white/[0.04]">
          No moods yet. Create moods like “Running”, “Studying”, or “Chill”.
        </div>
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.04 } },
          }}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
        >
          {moods.map((m) => (
            <motion.div
              key={m.id}
              variants={{
                hidden: { opacity: 0, scale: 0.95 },
                visible: { opacity: 1, scale: 1 },
              }}
              whileHover={{ y: -2 }}
              className="group rounded-2xl glass p-4 flex flex-col gap-3 relative"
            >
              <div
                className="w-full h-20 rounded-xl"
                style={{
                  background: m.color
                    ? `linear-gradient(135deg, ${m.color}, ${m.color}88)`
                    : "linear-gradient(135deg, #444, #222)",
                }}
              />
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-white/90">{m.name}</div>
                  {typeof m.track_count === "number" && (
                    <div className="text-xs text-white/40">
                      {m.track_count} tracks
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setModal({ kind: "rename", mood: m })}
                    className="w-7 h-7 rounded-md hover:bg-white/10 text-white/40 hover:text-white/80 flex items-center justify-center"
                    title="Edit"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => setModal({ kind: "delete", mood: m })}
                    className="w-7 h-7 rounded-md hover:bg-rose-500/15 text-white/40 hover:text-rose-300 flex items-center justify-center"
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      <MoodModals
        modal={modal}
        onClose={() => setModal(null)}
        onCreate={async (name, color) => {
          await fetch("/api/moods", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, color }),
          });
          load();
        }}
        onRename={async (id, name, color) => {
          await fetch(`/api/moods/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, color }),
          });
          load();
        }}
        onDelete={async (id) => {
          await fetch(`/api/moods/${id}`, { method: "DELETE" });
          load();
        }}
      />
    </div>
  );
}

function MoodModals({
  modal,
  onClose,
  onCreate,
  onRename,
  onDelete,
}: {
  modal:
    | { kind: "create" }
    | { kind: "rename"; mood: Mood }
    | { kind: "delete"; mood: Mood }
    | null;
  onClose: () => void;
  onCreate: (name: string, color: string | null) => Promise<void>;
  onRename: (id: string, name: string, color: string | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(modal?.kind === "rename" ? modal.mood.name : "");
    setColor(modal?.kind === "rename" ? modal.mood.color : null);
  }, [modal]);

  if (!modal) return null;

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (modal.kind === "create") {
        await onCreate(name.trim(), color);
      } else if (modal.kind === "rename") {
        await onRename(modal.mood.id, name.trim(), color);
      } else if (modal.kind === "delete") {
        await onDelete(modal.mood.id);
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="max-w-md w-full rounded-2xl glass-strong p-5 flex flex-col gap-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white/90">
              {modal.kind === "create"
                ? "Create mood"
                : modal.kind === "rename"
                ? "Edit mood"
                : "Delete mood"}
            </h3>
            <button onClick={onClose} className="text-white/40 hover:text-white/80">
              <X size={18} />
            </button>
          </div>

          {modal.kind === "delete" ? (
            <p className="text-sm text-white/60">
              Delete <span className="text-white/90">{modal.mood.name}</span>?
              Associations are removed. This cannot be undone.
            </p>
          ) : (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-white/50">Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  placeholder="e.g. Running"
                  className="h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus:border-white/20"
                />
              </label>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-white/50">Color</span>
                <div className="flex flex-wrap items-center gap-2">
                  {DEFAULT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-7 h-7 rounded-full transition-transform ${
                        color === c ? "ring-2 ring-white/80 scale-110" : ""
                      }`}
                      style={{ backgroundColor: c }}
                      aria-label={`Color ${c}`}
                    />
                  ))}
                  <label className="relative w-7 h-7 rounded-full overflow-hidden border border-white/20 cursor-pointer">
                    <input
                      type="color"
                      value={color ?? "#888888"}
                      onChange={(e) => setColor(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <span
                      className="absolute inset-0"
                      style={{ backgroundColor: color ?? "#888888" }}
                    />
                  </label>
                  {color && (
                    <button
                      type="button"
                      onClick={() => setColor(null)}
                      className="text-xs text-white/40 hover:text-white/70"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="h-9 px-4 rounded-xl bg-white/[0.06] text-white/70 text-sm hover:bg-white/[0.1] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={busy || (modal.kind !== "delete" && !name.trim())}
              className={`h-9 px-4 rounded-xl text-sm transition-colors disabled:opacity-50 ${
                modal.kind === "delete"
                  ? "bg-rose-500 text-white hover:bg-rose-400"
                  : "bg-pink-500 text-white hover:bg-pink-400"
              }`}
            >
              {busy
                ? "Working…"
                : modal.kind === "create"
                ? "Create"
                : modal.kind === "rename"
                ? "Save"
                : "Delete"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}