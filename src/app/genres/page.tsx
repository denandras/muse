"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderTree,
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
  const [includeSubgenres, setIncludeSubgenres] = useState(false);
  const [filterId, setFilterId] = useState<string | null>(null);

  // Modal state
  const [modal, setModal] = useState<
    | { kind: "create" }
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

  // Visible ids when filtering (with optional subgenre expansion).
  const visibleIds = (() => {
    if (!filterId) return null;
    const ids = new Set<string>([filterId]);
    if (includeSubgenres) {
      let changed = true;
      while (changed) {
        changed = false;
        genres.forEach((g) => {
          if (g.parent_id && ids.has(g.parent_id) && !ids.has(g.id)) {
            ids.add(g.id);
            changed = true;
          }
        });
      }
    }
    return ids;
  })();

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FolderTree className="text-violet-400" size={20} />
          <h1 className="text-xl font-semibold text-white/90">Genres</h1>
        </div>
        <button
          onClick={() => setModal({ kind: "create" })}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-violet-500/20 text-violet-200 border border-violet-500/30 text-sm hover:bg-violet-500/30 transition-colors"
        >
          <Plus size={14} />
          New genre
        </button>
      </div>

      {/* Filter controls */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select
          value={filterId ?? ""}
          onChange={(e) => setFilterId(e.target.value || null)}
          className="h-8 px-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white/70 text-xs"
        >
          <option value="">All genres</option>
          {flatten(tree).map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1.5 text-white/40 cursor-pointer">
          <input
            type="checkbox"
            checked={includeSubgenres}
            onChange={(e) => setIncludeSubgenres(e.target.checked)}
            className="w-3.5 h-3.5 accent-violet-500"
          />
          Include subgenres
        </label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="animate-spin text-white/40" size={24} />
        </div>
      ) : genres.length === 0 ? (
        <div className="text-center py-16 text-sm text-white/30 rounded-xl bg-white/[0.02] border border-white/[0.04]">
          No genres yet. Create your first genre to start organizing.
        </div>
      ) : (
        <div className="rounded-2xl glass p-3 flex flex-col gap-1">
          {tree.map((g) => (
            <GenreTreeItem
              key={g.id}
              genre={g}
              depth={0}
              visibleIds={visibleIds}
              onRename={(genre) => setModal({ kind: "rename", genre })}
              onDelete={(genre) => setModal({ kind: "delete", genre })}
              onCreateChild={() => setModal({ kind: "create" })}
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
  visibleIds: Set<string> | null;
  onRename: (g: Genre) => void;
  onDelete: (g: Genre) => void;
  onCreateChild: () => void;
}

function GenreTreeItem({
  genre,
  depth,
  visibleIds,
  onRename,
  onDelete,
  onCreateChild,
}: TreeItemProps) {
  const [open, setOpen] = useState(true);
  if (visibleIds && !visibleIds.has(genre.id)) return null;
  const hasChildren = (genre.children?.length ?? 0) > 0;
  return (
    <div>
      <motion.div
        layout
        className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/[0.04] group"
        style={{ paddingLeft: depth * 20 + 8 }}
      >
        <button
          onClick={() => hasChildren && setOpen((v) => !v)}
          className="w-5 h-5 flex items-center justify-center text-white/30"
        >
          {hasChildren ? (
            open ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400/50" />
          )}
        </button>
        <span className="text-sm text-white/90 flex-1">{genre.name}</span>
        {typeof genre.track_count === "number" && (
          <span className="text-xs text-white/30">
            {genre.track_count} tracks
          </span>
        )}
        <div className="flex items-center gap-1 opacity-40 hover:opacity-100 transition-opacity">
          <button
            onClick={onCreateChild}
            className="w-7 h-7 rounded-md hover:bg-white/10 text-white/40 hover:text-white/80 flex items-center justify-center"
            title="Add child"
          >
            <Plus size={13} />
          </button>
          <button
            onClick={() => onRename(genre)}
            className="w-7 h-7 rounded-md hover:bg-white/10 text-white/40 hover:text-white/80 flex items-center justify-center"
            title="Rename"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => onDelete(genre)}
            className="w-7 h-7 rounded-md hover:bg-rose-500/15 text-white/40 hover:text-rose-300 flex items-center justify-center"
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
                visibleIds={visibleIds}
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
    | { kind: "create" }
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
    setParentId(null);
  }, [modal]);

  if (!modal) return null;

  const submit = async () => {
    if (!name.trim()) return;
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
                ? "Create genre"
                : modal.kind === "rename"
                ? "Rename genre"
                : "Delete genre"}
            </h3>
            <button onClick={onClose} className="text-white/40 hover:text-white/80">
              <X size={18} />
            </button>
          </div>

          {modal.kind === "delete" ? (
            <p className="text-sm text-white/60">
              Delete <span className="text-white/90">{modal.genre.name}</span>?
              Subgenres and associations are also removed. This cannot be undone.
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
                  placeholder="e.g. Electronic"
                  className="h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus:border-white/20"
                />
              </label>
              {modal.kind === "create" && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-white/50">Parent (optional)</span>
                  <select
                    value={parentId ?? ""}
                    onChange={(e) => setParentId(e.target.value || null)}
                    className="h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white/70"
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
                  : "bg-violet-500 text-white hover:bg-violet-400"
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
  // Sort by sort_order then name.
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