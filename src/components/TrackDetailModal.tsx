"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Music,
  StickyNote,
  Key as KeyIcon,
  Tag,
  Palette,
  Star,
  Save,
  Loader2,
  Plus,
  Check,
  Trash2,
} from "lucide-react";
import type { Track, Genre, Mood } from "@/lib/types";
import StarRating from "./StarRating";
import FavoriteToggle from "./FavoriteToggle";
import { useScrollLock } from "@/lib/useScrollLock";

interface TrackDetailModalProps {
  track: Track | null;
  genres: Genre[];
  moods: Mood[];
  onClose: () => void;
  onSave: (updates: {
    id: string;
    title?: string;
    artist?: string;
    album_title?: string | null;
    musical_key?: string | null;
    notes?: string | null;
    stars?: number | null;
    is_favorite?: boolean;
    genreIds: string[];
    moodIds: string[];
  }) => Promise<void>;
  /**
   * Delete this track from the library (Spotify + DB). If absent, no delete
   * button is shown. Only passed for tracks the user individually saved
   * (liked songs) — album tracks that aren't liked cannot be deleted here
   * because they aren't individually saved in the user's library.
   */
  onDelete?: (trackId: string) => void;
}

const MUSICAL_KEYS = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
  "Cm", "C#m", "Dm", "D#m", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "A#m", "Bm",
];

export default function TrackDetailModal({
  track,
  genres,
  moods,
  onClose,
  onSave,
  onDelete,
}: TrackDetailModalProps) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [albumTitle, setAlbumTitle] = useState("");
  const [musicalKey, setMusicalKey] = useState("");
  const [notes, setNotes] = useState("");
  const [stars, setStars] = useState<number | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedGenreIds, setSelectedGenreIds] = useState<Set<string>>(new Set());
  const [selectedMoodIds, setSelectedMoodIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showGenrePicker, setShowGenrePicker] = useState(false);
  const [showMoodPicker, setShowMoodPicker] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Lock background scroll while the modal is open
  useScrollLock(!!track);

  // Sync form state when track changes
  useEffect(() => {
    if (!track) return;
    setTitle(track.title);
    setArtist(track.artist);
    setAlbumTitle(track.album_title ?? "");
    setMusicalKey(track.musical_key ?? "");
    setNotes(track.notes ?? "");
    setStars(track.stars);
    setIsFavorite(track.is_favorite);
    setSelectedGenreIds(new Set((track.genres ?? []).map((g) => g.id)));
    setSelectedMoodIds(new Set((track.moods ?? []).map((m) => m.id)));
    setDirty(false);
    setShowGenrePicker(false);
    setShowMoodPicker(false);
  }, [track]);

  // ESC to close
  useEffect(() => {
    if (!track) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [track, saving, onClose]);

  // Build genre tree for picker
  const genreTree = useMemo(() => buildTree(genres), [genres]);

  const toggleGenre = useCallback((id: string) => {
    setSelectedGenreIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setDirty(true);
  }, []);

  const toggleMood = useCallback((id: string) => {
    setSelectedMoodIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setDirty(true);
  }, []);

  const handleSave = async () => {
    if (!track) return;
    setSaving(true);
    try {
      await onSave({
        id: track.id,
        // title & artist are static — never send them in the update
        // album_title is also static (not editable)
        musical_key: musicalKey !== (track.musical_key ?? "") ? musicalKey : undefined,
        notes: notes !== (track.notes ?? "") ? notes : undefined,
        stars: stars !== track.stars ? stars : undefined,
        is_favorite: isFavorite !== track.is_favorite ? isFavorite : undefined,
        genreIds: Array.from(selectedGenreIds),
        moodIds: Array.from(selectedMoodIds),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!track) return;
    const trackLabel =
      track.title && track.artist
        ? `"${track.title}" by ${track.artist}`
        : "this track";
    if (
      !window.confirm(
        `Remove ${trackLabel} from your Liked Songs? This also removes it from your Muse library.`
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/tracks/${encodeURIComponent(track.id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onDelete?.(track.id);
        onClose();
      }
    } finally {
      setDeleting(false);
    }
  };

  // Selected genres/moods resolved objects for display
  const selectedGenres = useMemo(
    () => genres.filter((g) => selectedGenreIds.has(g.id)),
    [genres, selectedGenreIds]
  );
  const selectedMoods = useMemo(
    () => moods.filter((m) => selectedMoodIds.has(m.id)),
    [moods, selectedMoodIds]
  );

  return (
    <AnimatePresence>
      {track && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-overlay/70 backdrop-blur-sm flex items-center justify-center p-4 pb-28"
          onClick={() => !saving && onClose()}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 10 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="max-w-lg w-full max-h-[85vh] overflow-y-auto rounded-2xl glass-strong flex flex-col"
          >
            {/* Header */}
            <div className="flex items-start gap-3 p-5 border-b border-cream/[0.06]">
              <div className="w-14 h-14 flex-shrink-0 rounded-xl overflow-hidden bg-cream/[0.06]">
                {track.album_cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={track.album_cover_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Music size={20} className="text-cream/20" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Star size={14} className="text-cream/30" />
                  <span className="text-[10px] uppercase tracking-wide text-cream/40">
                    Track details
                  </span>
                </div>
                <h3 className="text-base font-semibold text-cream/90 truncate mt-0.5">
                  {track.title}
                </h3>
                <p className="text-xs text-cream/40 truncate">{track.artist}</p>
              </div>
              <button
                onClick={() => !saving && onClose()}
                className="text-cream/40 hover:text-cream/80 transition-colors flex-shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-col gap-4 p-5">
              {/* Title + Artist — static, not editable */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-cream/50">Title</span>
                  <div className="h-10 px-3 rounded-xl bg-cream/[0.02] border border-cream/[0.04] text-sm text-cream/90 flex items-center">
                    {title || "—"}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-cream/50">Artist</span>
                  <div className="h-10 px-3 rounded-xl bg-cream/[0.02] border border-cream/[0.04] text-sm text-cream/90 flex items-center">
                    {artist || "—"}
                  </div>
                </div>
              </div>

              {/* Album + Musical Key */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-cream/50">Album</span>
                  <div className="h-10 px-3 rounded-xl bg-cream/[0.02] border border-cream/[0.04] text-sm text-cream/90 flex items-center">
                    {albumTitle || "—"}
                  </div>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-cream/50 flex items-center gap-1">
                    <KeyIcon size={11} /> Musical key
                  </span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={musicalKey}
                      onChange={(e) => { setMusicalKey(e.target.value); setDirty(true); }}
                      placeholder="e.g. Cm"
                      list="musical-keys"
                      className="h-10 flex-1 px-3 rounded-xl bg-cream/[0.04] border border-cream/[0.06] text-sm text-cream/90 placeholder:text-cream/20 focus:outline-none focus:border-cream/20 transition-colors"
                    />
                    <datalist id="musical-keys">
                      {MUSICAL_KEYS.map((k) => (
                        <option key={k} value={k} />
                      ))}
                    </datalist>
                  </div>
                </label>
              </div>

              {/* Favorite (left) + Rating (right) */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-cream/[0.02] border border-cream/[0.04]">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-cream/50">Favorite</span>
                  <FavoriteToggle
                    isFavorite={isFavorite}
                    onChange={(v) => { setIsFavorite(v); setDirty(true); }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Star size={14} className="text-accent/60" />
                  <span className="text-xs text-cream/50">Rating</span>
                  <StarRating value={stars} onChange={(v) => { setStars(v); setDirty(true); }} size={16} />
                  {stars !== null && (
                    <button
                      onClick={() => { setStars(null); setDirty(true); }}
                      className="text-xs text-cream/30 hover:text-cream/60 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Notes */}
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-cream/50 flex items-center gap-1">
                  <StickyNote size={11} /> Notes
                </span>
                <textarea
                  value={notes}
                  onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
                  placeholder="Personal notes about this track..."
                  rows={3}
                  className="px-3 py-2 rounded-xl bg-cream/[0.04] border border-cream/[0.06] text-sm text-cream/90 placeholder:text-cream/20 focus:outline-none focus:border-cream/20 transition-colors resize-none"
                />
              </label>

              {/* Genres */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-cream/50 flex items-center gap-1">
                    <Tag size={11} /> Genres
                  </span>
                  <button
                    onClick={() => {
                      setShowMoodPicker(false);
                      setShowGenrePicker((v) => !v);
                    }}
                    className="inline-flex items-center gap-1 text-xs text-primary-hover hover:text-primary-light transition-colors"
                  >
                    <Plus size={12} />
                    {showGenrePicker ? "Done" : "Assign"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                  {selectedGenres.length === 0 ? (
                    <span className="text-xs text-cream/30">No genres assigned</span>
                  ) : (
                    selectedGenres.map((g) => (
                      <span
                        key={g.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary/20 text-primary-light border border-primary-hover/30"
                      >
                        {genrePath(g, genres)}
                        <button
                          onClick={() => toggleGenre(g.id)}
                          className="hover:text-cream transition-colors"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <AnimatePresence>
                  {showGenrePicker && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="rounded-xl bg-cream/[0.03] border border-cream/[0.04] p-2 max-h-48 overflow-y-auto">
                        {genreTree.length === 0 ? (
                          <p className="text-xs text-cream/30 p-2">
                            No genres yet. Create some in the Genres page.
                          </p>
                        ) : (
                          genreTree.map((g) => (
                            <GenrePickerItem
                              key={g.id}
                              genre={g}
                              depth={0}
                              selectedIds={selectedGenreIds}
                              onToggle={toggleGenre}
                            />
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Moods */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-cream/50 flex items-center gap-1">
                    <Palette size={11} /> Moods
                  </span>
                  <button
                    onClick={() => {
                      setShowGenrePicker(false);
                      setShowMoodPicker((v) => !v);
                    }}
                    className="inline-flex items-center gap-1 text-xs text-secondary-hover hover:text-secondary-light transition-colors"
                  >
                    <Plus size={12} />
                    {showMoodPicker ? "Done" : "Assign"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                  {selectedMoods.length === 0 ? (
                    <span className="text-xs text-cream/30">No moods assigned</span>
                  ) : (
                    selectedMoods.map((m) => {
                      const color = m.color || "var(--mood-fallback)";
                      return (
                        <span
                          key={m.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
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
                          {m.name}
                          <button
                            onClick={() => toggleMood(m.id)}
                            className="hover:text-cream transition-colors"
                          >
                            <X size={10} />
                          </button>
                        </span>
                      );
                    })
                  )}
                </div>
                <AnimatePresence>
                  {showMoodPicker && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="rounded-xl bg-cream/[0.03] border border-cream/[0.04] p-2 max-h-48 overflow-y-auto flex flex-wrap gap-1.5">
                        {moods.length === 0 ? (
                          <p className="text-xs text-cream/30 p-2">
                            No moods yet. Create some in the Moods page.
                          </p>
                        ) : (
                          moods.map((m) => {
                            const selected = selectedMoodIds.has(m.id);
                            const color = m.color || "var(--mood-fallback)";
                            return (
                              <button
                                key={m.id}
                                onClick={() => toggleMood(m.id)}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                                  selected ? "ring-1 ring-cream/40" : "opacity-60 hover:opacity-100"
                                }`}
                                style={{
                                  backgroundColor: `${color}22`,
                                  color,
                                  border: `1px solid ${color}55`,
                                }}
                              >
                                {selected && <Check size={11} />}
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: color }}
                                />
                                {m.name}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Meta info (read-only) */}
              <div className="grid grid-cols-3 gap-2 text-xs pt-1">
                <Meta label="Plays (all)" value={String(track.play_count_all_time)} />
                <Meta label="Duration" value={formatDuration(track.duration_ms)} />
                <Meta label="Added" value={formatDate(track.added_at)} />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 p-5 border-t border-cream/[0.06]">
              <span className="text-xs text-cream/30">
                {dirty ? "Unsaved changes" : "All changes saved"}
              </span>
              <div className="flex gap-2">
                {onDelete && (
                  <button
                    onClick={handleDelete}
                    disabled={deleting || saving}
                    className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-xl bg-secondary/15 text-secondary-light border border-secondary/30 text-sm hover:bg-secondary/25 transition-colors disabled:opacity-50 min-w-[90px]"
                  >
                    {deleting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                    {deleting ? "Deleting…" : "Delete"}
                  </button>
                )}
                <button
                  onClick={() => !saving && onClose()}
                  className="h-9 px-4 rounded-xl bg-cream/[0.06] text-cream/70 text-sm hover:bg-cream/[0.1] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-xl bg-primary text-cream text-sm hover:bg-primary-hover transition-colors disabled:opacity-50 min-w-[90px]"
                >
                  {saving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Save size={14} />
                  )}
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function GenrePickerItem({
  genre,
  depth,
  selectedIds,
  onToggle,
}: {
  genre: Genre;
  depth: number;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = (genre.children?.length ?? 0) > 0;
  const selected = selectedIds.has(genre.id);

  return (
    <div>
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-cream/[0.04] cursor-pointer"
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={() => onToggle(genre.id)}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) setOpen((v) => !v);
          }}
          className="w-4 h-4 flex items-center justify-center text-cream/30 flex-shrink-0"
        >
          {hasChildren ? (open ? "▾" : "▸") : ""}
        </button>
        <div
          className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors ${
            selected
              ? "bg-primary border-primary-hover"
              : "border-cream/20"
          }`}
        >
          {selected && <Check size={10} className="text-cream" />}
        </div>
        <span className={`text-sm ${selected ? "text-primary-light" : "text-cream/70"}`}>
          {genre.name}
        </span>
      </div>
      {hasChildren && open && (
        <div>
          {genre.children!.map((child) => (
            <GenrePickerItem
              key={child.id}
              genre={child}
              depth={depth + 1}
              selectedIds={selectedIds}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-1.5 rounded-lg bg-cream/[0.03]">
      <div className="text-[10px] uppercase tracking-wide text-cream/30">
        {label}
      </div>
      <div className="text-cream/70">{value}</div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  const sec = Math.round(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Build tree from flat list
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

// Get full path for a genre (e.g. "Electronic / House")
function genrePath(genre: Genre, all: Genre[]): string {
  const parts: string[] = [genre.name];
  let current = genre;
  while (current.parent_id) {
    const parent = all.find((g) => g.id === current.parent_id);
    if (!parent) break;
    parts.unshift(parent.name);
    current = parent;
  }
  return parts.join(" / ");
}