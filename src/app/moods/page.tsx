"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
  GitMerge,
} from "lucide-react";
import type { Mood } from "@/lib/types";

const DEFAULT_COLORS = [
  "#b85c4e",
  "#c47a5e",
  "#d4a857",
  "#7ba876",
  "#5e9da3",
  "#6b8aad",
  "#8ba888",
  "#c4944e",
  "#8a8378",
];

export default function MoodsPage() {
  const [moods, setMoods] = useState<Mood[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<
    | { kind: "create" }
    | { kind: "rename"; mood: Mood }
    | { kind: "delete"; mood: Mood }
    | { kind: "merge"; mood: Mood }
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
      {/* Header: title + plus icon */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium text-cream/90">Moods</h1>
        <button
          onClick={() => setModal({ kind: "create" })}
          className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-cream/[0.06] text-cream/70 hover:bg-cream/[0.12] transition-colors"
          title="New mood"
        >
          <Plus size={18} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="animate-spin text-cream/40" size={24} />
        </div>
      ) : moods.length === 0 ? (
        <div className="text-center py-16 text-sm text-cream/30 rounded-xl bg-cream/[0.02] border border-cream/[0.04]">
          No moods yet. Click + to create moods like Running, Studying, or Chill.
        </div>
      ) : (
        <div className="rounded-2xl glass p-3 flex flex-col gap-1">
          {moods.map((m) => (
            <motion.div
              key={m.id}
              layout
              className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-cream/[0.04] group"
            >
              {/* Color dot */}
              {m.color ? (
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: m.color }}
                />
              ) : (
                <span className="w-3 h-3 rounded-full bg-cream/20 flex-shrink-0" />
              )}
              <span className="text-sm text-cream/90 flex-1">{m.name}</span>
              {typeof m.track_count === "number" && (
                <span className="text-xs text-cream/30">
                  {m.track_count} tracks
                </span>
              )}
              <div className="flex items-center gap-1 opacity-60 sm:opacity-40 sm:hover:opacity-100 transition-opacity">
                <button
                  onClick={() => setModal({ kind: "merge", mood: m })}
                  className="w-7 h-7 rounded-md hover:bg-cream/10 text-cream/50 hover:text-cream/90 flex items-center justify-center transition-colors"
                  title="Merge into…"
                >
                  <GitMerge size={13} />
                </button>
                <button
                  onClick={() => setModal({ kind: "rename", mood: m })}
                  className="w-7 h-7 rounded-md hover:bg-cream/10 text-cream/50 hover:text-cream/90 flex items-center justify-center transition-colors"
                  title="Edit"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => setModal({ kind: "delete", mood: m })}
                  className="w-7 h-7 rounded-md hover:bg-secondary/15 text-cream/50 hover:text-secondary-hover flex items-center justify-center transition-colors"
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <MoodModals
        modal={modal}
        onClose={() => setModal(null)}
        moods={moods}
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
          const res = await fetch(`/api/moods/${id}`, { method: "DELETE" });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.error("Failed to delete mood:", res.status, err);
            alert(`Failed to delete mood: ${err.error ?? res.statusText}`);
          }
          load();
        }}
        onMerge={async (sourceId, targetId) => {
          const res = await fetch(`/api/moods/${sourceId}/merge`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target_id: targetId }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.error("Failed to merge mood:", res.status, err);
            alert(`Failed to merge mood: ${err.error ?? res.statusText}`);
          }
          load();
        }}
      />
    </div>
  );
}

function MoodModals({
  modal,
  onClose,
  moods,
  onCreate,
  onRename,
  onDelete,
  onMerge,
}: {
  modal:
    | { kind: "create" }
    | { kind: "rename"; mood: Mood }
    | { kind: "delete"; mood: Mood }
    | { kind: "merge"; mood: Mood }
    | null;
  onClose: () => void;
  moods: Mood[];
  onCreate: (name: string, color: string | null) => Promise<void>;
  onRename: (id: string, name: string, color: string | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onMerge: (sourceId: string, targetId: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(modal?.kind === "rename" ? modal.mood.name : "");
    setColor(modal?.kind === "rename" ? modal.mood.color : null);
    setMergeTargetId(null);
  }, [modal]);

  if (!modal) return null;

  // For merge: list all moods except the source
  const mergeTargets = modal?.kind === "merge"
    ? moods.filter((m) => m.id !== modal.mood.id)
    : [];

  const submit = async () => {
    if (modal.kind !== "delete" && modal.kind !== "merge" && !name.trim()) return;
    if (modal.kind === "merge" && !mergeTargetId) return;
    setBusy(true);
    try {
      if (modal.kind === "create") {
        await onCreate(name.trim(), color);
      } else if (modal.kind === "rename") {
        await onRename(modal.mood.id, name.trim(), color);
      } else if (modal.kind === "delete") {
        await onDelete(modal.mood.id);
      } else if (modal.kind === "merge") {
        await onMerge(modal.mood.id, mergeTargetId!);
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
        className="fixed inset-0 z-50 bg-overlay/60 backdrop-blur-sm flex items-center justify-center p-4"
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
            <h3 className="text-base font-semibold text-cream/90">
              {modal.kind === "create"
                ? "Create mood"
                : modal.kind === "rename"
                ? "Edit mood"
                : modal.kind === "merge"
                ? "Merge mood"
                : "Delete mood"}
            </h3>
            <button onClick={onClose} className="text-cream/40 hover:text-cream/80">
              <X size={18} />
            </button>
          </div>

          {modal.kind === "delete" ? (
            <p className="text-sm text-cream/60">
              Delete <span className="text-cream/90">{modal.mood.name}</span>?
              Associations are removed. This cannot be undone.
            </p>
          ) : modal.kind === "merge" ? (
            <>
              <p className="text-sm text-cream/60">
                Merge <span className="text-cream/90">{modal.mood.name}</span> into
                another mood. All tracks and albums assigned to{" "}
                <span className="text-cream/90">{modal.mood.name}</span> will be
                moved to the target. The source mood will be deleted.
              </p>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-cream/50">Merge into</span>
                <select
                  value={mergeTargetId ?? ""}
                  onChange={(e) => setMergeTargetId(e.target.value || null)}
                  className="h-10 px-3 rounded-xl bg-cream/[0.04] border border-cream/[0.06] text-sm text-cream/70"
                >
                  <option value="">Select target mood…</option>
                  {mergeTargets.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              {mergeTargets.length === 0 && (
                <p className="text-xs text-cream/30">
                  No other moods to merge into. Create at least one more mood first.
                </p>
              )}
            </>
          ) : (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-cream/50">Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  placeholder="e.g. Running"
                  className="h-10 px-3 rounded-xl bg-cream/[0.04] border border-cream/[0.06] text-sm text-cream/90 placeholder:text-cream/30 focus:outline-none focus:border-cream/20"
                />
              </label>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-cream/50">Color</span>
                <div className="flex flex-wrap items-center gap-2">
                  {DEFAULT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-7 h-7 rounded-full transition-transform ${
                        color === c ? "ring-2 ring-cream/80 scale-110" : ""
                      }`}
                      style={{ backgroundColor: c }}
                      aria-label={`Color ${c}`}
                    />
                  ))}
                  <label className="relative w-7 h-7 rounded-full overflow-hidden border border-cream/20 cursor-pointer">
                    <input
                      type="color"
                      value={color ?? "var(--mood-fallback)"}
                      onChange={(e) => setColor(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <span
                      className="absolute inset-0"
                      style={{ backgroundColor: color ?? "var(--mood-fallback)" }}
                    />
                  </label>
                  {color && (
                    <button
                      type="button"
                      onClick={() => setColor(null)}
                      className="text-xs text-cream/40 hover:text-cream/70"
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
              className="h-9 px-4 rounded-xl bg-cream/[0.06] text-cream/70 text-sm hover:bg-cream/[0.1] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={
                busy ||
                (modal.kind === "delete"
                  ? false
                  : modal.kind === "merge"
                  ? !mergeTargetId
                  : !name.trim())
              }
              className={`h-9 px-4 rounded-xl text-sm transition-colors disabled:opacity-50 ${
                modal.kind === "delete"
                  ? "bg-secondary text-cream hover:bg-secondary-hover"
                  : modal.kind === "merge"
                  ? "bg-primary text-cream hover:bg-primary-hover"
                  : "bg-secondary text-cream hover:bg-secondary-hover"
              }`}
            >
              {busy
                ? "Working…"
                : modal.kind === "create"
                ? "Create"
                : modal.kind === "rename"
                ? "Save"
                : modal.kind === "merge"
                ? "Merge"
                : "Delete"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}