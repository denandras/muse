"use client";

import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, CheckCircle2, AlertCircle, X } from "lucide-react";

interface SyncState {
  liked_tracks_synced_at: string | null;
  saved_albums_synced_at: string | null;
  total_tracks_imported: number;
  total_albums_imported: number;
}

interface ProgressEvent {
  phase: "liked" | "albums" | "album-tracks" | "done" | "error";
  page: number;
  total: number;
  processed: number;
  label: string;
}

interface ImportResult {
  likedTracksImported: number;
  albumsImported: number;
  albumTracksImported: number;
  likedIncrementalStop: boolean;
  albumsIncrementalStop: boolean;
  likedTracksTotal: number;
  albumsTotal: number;
  /** When >0, more album pages remain — send albumOffset=N in the next batch. */
  albumNextOffset: number;
  /** True if all album pages were scanned. */
  albumsComplete: boolean;
}

interface ProgressState {
  phase: "liked" | "albums" | "album-tracks" | "done" | "error";
  processed: number;
  total: number;
  label: string;
}

interface SyncButtonProps {
  onSyncComplete?: () => void;
  variant?: "header" | "panel";
}

/**
 * Button that triggers POST /api/sync/import and streams NDJSON progress.
 * Shows live progress text and a spinner while running. On completion,
 * calls onSyncComplete so the parent can refetch library data.
 */
export default function SyncButton({
  onSyncComplete,
  variant = "header",
}: SyncButtonProps) {
  const [running, setRunning] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runSync = useCallback(async () => {
    setRunning(true);
    setProgressLabel("Starting sync…");
    setProgress({ phase: "liked", processed: 0, total: 0, label: "Starting sync…" });
    setResult(null);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;

    /**
     * Runs one phase of the sync (either liked or albums) by posting to
     * /api/sync/import with the appropriate query param, streaming NDJSON
     * progress, and returning the ImportResult for that phase.
     *
     * For albums, the client sends albumOffset + albumMaxPages so the server
     * processes a bounded batch (not all albums at once). This prevents 524
     * server timeouts on large libraries (1000+ albums). If the server
     * returns albumNextOffset > 0, the caller sends a follow-up request.
     */
    const runPhase = async (
      phase: "liked" | "albums",
      query: string
    ): Promise<ImportResult | null> => {
      const res = await fetch(`/api/sync/import?${query}`, {
        method: "POST",
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        // Vercel/Cloudflare return full HTML error pages (524 timeout, etc).
        // Strip HTML tags and trim to a short, actionable message.
        const clean = text
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 80);
        const reason =
          res.status === 524
            ? "server timeout (batch too large — will retry in smaller chunks)"
            : res.status === 429
            ? "Spotify rate limit — try again in a minute"
            : clean || res.statusText;
        setError(`Sync (${phase}) failed (${res.status}): ${reason}`);
        return null;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let phaseResult: ImportResult | null = null;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let obj: Record<string, unknown>;
          try {
            obj = JSON.parse(line);
          } catch {
            continue;
          }
          if (obj.error) {
            setError(String(obj.error));
          } else if (obj.result) {
            phaseResult = obj.result as ImportResult;
          } else if (obj.phase === "done") {
            // Server signals phase finished — clear the progress label
            // so stale text doesn't persist between phases or after completion.
            setProgressLabel(null);
            setProgress(null);
          } else if (obj.label) {
            setProgressLabel(String(obj.label));
            const processed = typeof obj.processed === "number" ? obj.processed : 0;
            const total = typeof obj.total === "number" ? obj.total : 0;
            const p = (obj.phase as ProgressState["phase"]) ?? phase;
            setProgress({ phase: p, processed, total, label: String(obj.label) });
          }
        }
      }
      return phaseResult;
    };

    /**
     * Runs the album sync in bounded batches. Each batch processes
     * ALBUM_BATCH_PAGES pages (50 albums per page) so each request stays well
     * within Vercel's 300s function timeout. If a batch fails (524, network
     * error), it is retried up to MAX_BATCH_RETRIES times with exponential
     * backoff. Already-synced batches are not re-processed because the
     * server tracks progress via albumStartOffset and only fetches new
     * albums (existing ones are skipped cheaply).
     */
    const ALBUM_BATCH_PAGES = 4; // 4 pages × 50 = 200 albums per batch
    const MAX_BATCH_RETRIES = 3;
    const runAlbumBatches = async (): Promise<ImportResult | null> => {
      let albumOffset = 0;
      let merged: ImportResult | null = null;
      let batchNum = 0;

      while (true) {
        batchNum++;
        let batchResult: ImportResult | null = null;
        let batchError: Error | null = null;

        // Retry loop for this batch
        for (let attempt = 0; attempt <= MAX_BATCH_RETRIES; attempt++) {
          if (attempt > 0) {
            const backoffMs = Math.min(2000 * 2 ** (attempt - 1), 16000);
            setProgressLabel(
              `Retrying album batch ${batchNum} (attempt ${attempt + 1})…`
            );
            await new Promise((r) => setTimeout(r, backoffMs));
          }

          const query = `albumsOnly=true&albumOffset=${albumOffset}&albumMaxPages=${ALBUM_BATCH_PAGES}`;
          batchResult = await runPhase("albums", query);

          if (batchResult) {
            batchError = null;
            break; // success
          }
          // runPhase already set the error message; record for retry logic
          batchError = new Error("Batch failed");
        }

        if (batchError || !batchResult) {
          // All retries exhausted — stop the sync with the error already set
          return merged;
        }

        // Merge this batch's result into the running total
        if (!merged) {
          merged = { ...batchResult };
        } else {
          merged.albumsImported += batchResult.albumsImported;
          merged.albumTracksImported += batchResult.albumTracksImported;
          merged.albumsTotal = batchResult.albumsTotal;
          merged.albumsIncrementalStop = batchResult.albumsIncrementalStop;
          merged.albumNextOffset = batchResult.albumNextOffset;
          merged.albumsComplete = batchResult.albumsComplete;
        }

        // Check if there are more batches to process
        if (!batchResult.albumNextOffset || batchResult.albumNextOffset <= 0) {
          break; // all albums synced
        }
        albumOffset = batchResult.albumNextOffset;
        // Continue to next batch
      }

      return merged;
    };

    try {
      // Phase 1: liked songs (its own timeout budget)
      const likedResult = await runPhase("liked", "likedOnly=true");
      // Show transition label so the progress bar doesn't disappear
      // between the two HTTP requests (which look like a page refresh).
      setProgressLabel("Liked songs done — starting albums…");
      setProgress((prev) => prev ? { ...prev, phase: "albums", label: "Starting album sync…" } : prev);
      // Phase 2: saved albums in bounded batches (prevents 524 timeout)
      const albumsResult = await runAlbumBatches();

      // Merge the two phase results into one ImportResult for the toast.
      if (likedResult || albumsResult) {
        const merged: ImportResult = {
          likedTracksImported: likedResult?.likedTracksImported ?? 0,
          albumsImported: albumsResult?.albumsImported ?? 0,
          albumTracksImported: albumsResult?.albumTracksImported ?? 0,
          likedIncrementalStop: likedResult?.likedIncrementalStop ?? false,
          albumsIncrementalStop: albumsResult?.albumsIncrementalStop ?? false,
          likedTracksTotal: likedResult?.likedTracksTotal ?? 0,
          albumsTotal: albumsResult?.albumsTotal ?? 0,
          albumNextOffset: albumsResult?.albumNextOffset ?? 0,
          albumsComplete: albumsResult?.albumsComplete ?? true,
        };
        setResult(merged);
        setProgressLabel(null);
        setProgress(null);
        onSyncComplete?.();
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // user cancelled — stay quiet
      } else {
        setError(err instanceof Error ? err.message : "Sync failed");
      }
    } finally {
      setRunning(false);
      setProgressLabel(null);
      setProgress(null);
      abortRef.current = null;
    }
  }, [onSyncComplete]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
    setProgressLabel(null);
    setProgress(null);
  }, []);

  const dismissResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  if (variant === "header") {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={runSync}
          disabled={running}
          className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl bg-white/[0.06] text-white/80 text-sm hover:bg-white/[0.1] transition-colors disabled:opacity-60 flex-shrink-0 min-w-[72px]"
          title="Import from Spotify"
        >
          {running ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          <span className="hidden sm:inline">
            {running ? "Syncing…" : "Sync"}
          </span>
        </button>
        <AnimatePresence>
          {running && progressLabel && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              className="hidden md:flex items-center gap-2 text-xs text-white/50"
            >
              <span>{progressLabel}</span>
              <button
                onClick={cancel}
                className="text-white/30 hover:text-white/70"
                aria-label="Cancel sync"
              >
                <X size={12} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <SyncProgressBar progress={progress} onCancel={cancel} />
        <SyncToast
          result={result}
          error={error}
          onDismiss={dismissResult}
        />
      </div>
    );
  }

  // panel variant — larger, for a settings/dashboard card
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <button
          onClick={runSync}
          disabled={running}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[#1DB954] text-black font-medium text-sm hover:bg-[#1ed760] transition-colors disabled:opacity-60"
        >
          {running ? (
            <RefreshCw size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
          {running ? "Syncing…" : "Import from Spotify"}
        </button>
        {running && (
          <button
            onClick={cancel}
            className="text-sm text-white/50 hover:text-white/80"
          >
            Cancel
          </button>
        )}
      </div>
      {running && progressLabel && (
        <div className="text-sm text-white/60">{progressLabel}</div>
      )}
      <SyncProgressBar progress={progress} onCancel={cancel} />
      <SyncToast result={result} error={error} onDismiss={dismissResult} />
    </div>
  );
}

function SyncProgressBar({
  progress,
  onCancel,
}: {
  progress: ProgressState | null;
  onCancel: () => void;
}) {
  if (!progress) return null;

  // Show a clean x/n counter instead of an animated bar.
  // The label from the server already contains human-readable text like
  // "Importing 5 of 3,000 liked tracks…" — we just show that + a counter.
  // No animation: the sync runs at API speed (1 page per network round-trip),
  // so a smooth bar would look janky and low-fps.
  const counter =
    progress.total > 0
      ? `${progress.processed.toLocaleString()}/${progress.total.toLocaleString()}`
      : progress.processed > 0
        ? `${progress.processed.toLocaleString()}`
        : null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        className="fixed top-0 left-0 right-0 z-[55] pointer-events-none"
      >
        <div className="mx-auto max-w-3xl px-4 pt-2">
          <div className="glass-strong rounded-xl px-3 py-2.5 flex items-center gap-3 pointer-events-auto">
            <RefreshCw size={14} className="animate-spin text-yellow-400 flex-shrink-0" />
            <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
              <span className="text-xs text-white/70 truncate">
                {progress.label}
              </span>
              {counter && (
                <span className="text-xs tabular-nums text-yellow-300 font-medium flex-shrink-0">
                  {counter}
                </span>
              )}
            </div>
            <button
              onClick={onCancel}
              className="text-white/30 hover:text-white/70 transition-colors flex-shrink-0"
              aria-label="Cancel sync"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function SyncToast({
  result,
  error,
  onDismiss,
}: {
  result: ImportResult | null;
  error: string | null;
  onDismiss: () => void;
}) {
  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl glass-strong px-4 py-3 text-sm text-rose-300 flex items-start gap-2 max-w-sm"
      >
        <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
        <span className="flex-1 min-w-0">{error}</span>
        <button onClick={onDismiss} className="flex-shrink-0 text-white/40 hover:text-white/80 mt-0.5">
          <X size={14} />
        </button>
      </motion.div>
    );
  }
  if (!result) return null;
  const newTracks = result.likedTracksImported + result.albumTracksImported;
  const note =
    (result.likedIncrementalStop || result.albumsIncrementalStop)
      ? " · incremental (stopped early)"
      : "";
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl glass-strong px-4 py-2.5 text-sm text-white/90 flex items-center gap-2"
    >
      <CheckCircle2 size={16} className="text-green-400" />
      <span>
        {newTracks === 0 && result.albumsImported === 0
          ? "Already up to date"
          : `Imported ${newTracks} new track${newTracks === 1 ? "" : "s"}${
              result.albumsImported > 0
                ? `, ${result.albumsImported} album${result.albumsImported === 1 ? "" : "s"}`
                : ""
            }`}
        {note}
      </span>
      <button onClick={onDismiss} className="ml-2 text-white/40 hover:text-white/80">
        <X size={14} />
      </button>
    </motion.div>
  );
}

export type { SyncState, ProgressEvent, ImportResult };