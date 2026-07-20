"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2,
  X,
} from "lucide-react";
import type { Genre } from "@/lib/types";

export default function GenresPage() {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modal, setModal] = useState<
    | { kind: "create"; parentId?: string }
    | { kind: "rename"; genre: Genre }
    | { kind: "delete"; genre: Genre }
    | null
  >(null);

  const load = useCallback(() => {
    fetch("/api/genres")
      .then((r) => r.json())
      .then((d) => setGenres(Array.isArray(d) ? d : d.genres ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Build tree from flat list.
  const tree = buildTree(genres);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 flex flex-col gap-4">
      {/* Header: title + plus icon */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium text-cream/90">Genres</h1>
        <button
          onClick={() => setModal({ kind: "create" })}
          className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-cream/[0.06] text-cream/70 hover:bg-cream/[0.12] transition-colors"
          title="New genre"
        >
          <Plus size={18} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="animate-spin text-cream/40" size={24} />
        </div>
      ) : genres.length === 0 ? (
        <div className="text-center py-16 text-sm text-cream/30 rounded-xl bg-cream/[0.02] border border-cream/[0.04]">
          No genres yet. Click + to create your first genre.
        </div>
      ) : (
        <div className="rounded-2xl glass p-3 flex flex-col gap-1">
          {tree.map((g) => (
            <GenreTreeItem
              key={g.id}
              genre={g}
              depth={0}
              onRename={(genre) => setModal({ kind: "rename", genre })}
              onDelete={(genre) => setModal({ kind: "delete", genre })}
              onCreateChild={(parentId) => setModal({ kind: "create", parentId })}
            />
          ))}
        </div>
      )}

      <GenreModals
        modal={modal}
        onClose={() => setModal(null)}
        genres={genres}
        onCreate={async (name, parentId) => {
          await fetch("/api/genres", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, parent_id: parentId }),
          });
          load();
        }}
        onRename={async (id, name) => {
          await fetch(`/api/genres/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          });
          load();
        }}
        onDelete={async (id) => {
          await fetch(`/api/genres/${id}`, { method: "DELETE" });
          load();
        }}
      />
    </div>
  );
}

interface TreeItemProps {
  genre: Genre;
  depth: number;
  onRename: (g: Genre) => void;
  onDelete: (g: Genre) => void;
  onCreateChild: (parentId: string) => void;
}

function GenreTreeItem({
  genre,
  depth,
  onRename,
  onDelete,
  onCreateChild,
}: TreeItemProps) {
  const [open, setOpen] = useState(true);
  const hasChildren = (genre.children?.length ?? 0) > 0;
  return (
    <div>
      <motion.div
        layout
        className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-cream/[0.04] group"
        style={{ paddingLeft: depth * 20 + 8 }}
      >
        <button
          onClick={() => hasChildren && setOpen((v) => !v)}
          className="w-5 h-5 flex items-center justify-center text-cream/30"
        >
          {hasChildren ? (
            open ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-primary-hover/50" />
          )}
        </button>
        <span className="text-sm text-cream/90 flex-1">{genre.name}</span>
        {typeof genre.track_count === "number" && (
          <span className="text-xs text-cream/30">
            {genre.track_count} tracks
          </span>
        )}
        <div className="flex items-center gap-1 opacity-60 sm:opacity-40 sm:hover:opacity-100 transition-opacity">
          <button
            onClick={() => onCreateChild(genre.id)}
            className="w-7 h-7 rounded-md hover:bg-cream/10 text-cream/50 hover:text-cream/90 flex items-center justify-center transition-colors"
            title="Add child"
          >
            <Plus size={13} />
          </button>
          <button
            onClick={() => onRename(genre)}
            className="w-7 h-7 rounded-md hover:bg-cream/10 text-cream/50 hover:text-cream/90 flex items-center justify-center transition-colors"
            title="Rename"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => onDelete(genre)}
            className="w-7 h-7 rounded-md hover:bg-secondary/15 text-cream/50 hover:text-secondary-hover flex items-center justify-center transition-colors"
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </motion.div>
      <AnimatePresence initial={false}>
        {open && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {genre.children!.map((child) => (
              <GenreTreeItem
                key={child.id}
                genre={child}
                depth={depth + 1}
                onRename={onRename}
                onDelete={onDelete}
                onCreateChild={onCreateChild}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function GenreModals({
  modal,
  onClose,
  genres,
  onCreate,
  onRename,
  onDelete,
}: {
  modal:
    | { kind: "create"; parentId?: string }
    | { kind: "rename"; genre: Genre }
    | { kind: "delete"; genre: Genre }
    | null;
  onClose: () => void;
  genres: Genre[];
  onCreate: (name: string, parentId: string | null) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(modal?.kind === "rename" ? modal.genre.name : "");
    setParentId(modal?.kind === "create" ? (modal.parentId ?? null) : null);
  }, [modal]);

  if (!modal) return null;

  const submit = async () => {
    if (modal.kind !== "delete" && !name.trim()) return;
    setBusy(true);
    try {
      if (modal.kind === "create") {
        await onCreate(name.trim(), parentId);
      } else if (modal.kind === "rename") {
        await onRename(modal.genre.id, name.trim());
      } else if (modal.kind === "delete") {
        await onDelete(modal.genre.id);
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
                ? "Create genre"
                : modal.kind === "rename"
                ? "Rename genre"
                : "Delete genre"}
            </h3>
            <button onClick={onClose} className="text-cream/40 hover:text-cream/80">
              <X size={18} />
            </button>
          </div>

          {modal.kind === "delete" ? (
            <p className="text-sm text-cream/60">
              Delete <span className="text-cream/90">{modal.genre.name}</span>?
              Subgenres and associations are also removed. This cannot be undone.
            </p>
          ) : (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-cream/50">Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  placeholder="e.g. Electronic"
                  className="h-10 px-3 rounded-xl bg-cream/[0.04] border border-cream/[0.06] text-sm text-cream/90 placeholder:text-cream/30 focus:outline-none focus:border-cream/20"
                />
              </label>
              {modal.kind === "create" && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-cream/50">Parent (optional)</span>
                  <select
                    value={parentId ?? ""}
                    onChange={(e) => setParentId(e.target.value || null)}
                    className="h-10 px-3 rounded-xl bg-cream/[0.04] border border-cream/[0.06] text-sm text-cream/70"
                  >
                    <option value="">— Top level —</option>
                    {flatten(buildTree(genres)).map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
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
              disabled={busy || (modal.kind !== "delete" && !name.trim())}
              className={`h-9 px-4 rounded-xl text-sm transition-colors disabled:opacity-50 ${
                modal.kind === "delete"
                  ? "bg-secondary text-cream hover:bg-secondary-hover"
                  : "bg-primary text-cream hover:bg-primary-hover"
              }`}
            >
              {busy
                ? "Working…"
                : modal.kind === "create"
                ? "Create"
                : modal.kind === "rename"
                ? "Rename"
                : "Delete"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// Helpers

function buildTree(flat: Genre[]): Genre[] {
  const map = new Map<string, Genre>();
  flat.forEach((g) => map.set(g.id, { ...g, children: [] }));
  const roots: Genre[] = [];
  map.forEach((g) => {
    if (g.parent_id && map.has(g.parent_id)) {
      map.get(g.parent_id)!.children!.push(g);
    } else {
      roots.push(g);
    }
  });
  const sortRec = (list: Genre[]) => {
    list.sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
    );
    list.forEach((g) => g.children && sortRec(g.children));
  };
  sortRec(roots);
  return roots;
}

function flatten(tree: Genre[]): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const walk = (list: Genre[], prefix: string) => {
    list.forEach((g) => {
      const label = prefix ? `${prefix} / ${g.name}` : g.name;
      out.push({ id: g.id, label });
      if (g.children?.length) walk(g.children, label);
    });
  };
  walk(tree, "");
  return out;
}