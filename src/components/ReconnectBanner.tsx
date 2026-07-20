"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, X } from "lucide-react";
import { useState, useEffect } from "react";

/**
 * Global reconnect banner. Shows when the Spotify session has expired
 * (refresh token dead, or SDK fired authentication_error).
 *
 * The user can click "Reconnect" to go through OAuth immediately,
 * or dismiss the banner to stay on the page.
 */
export default function ReconnectBanner({
  show,
}: {
  show: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);

  // If the flag flips back to false (e.g. user reconnected), reset dismissed
  if (!show && dismissed) {
    setDismissed(false);
  }

  const visible = show && !dismissed;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed top-0 left-0 right-0 z-[60] pointer-events-none"
        >
          <div className="mx-auto max-w-2xl px-4 pt-2">
            <div className="glass-strong rounded-xl px-4 py-3 flex items-center gap-3 pointer-events-auto border border-amber-500/30 bg-amber-500/[0.08]">
              <AlertCircle size={18} className="text-amber-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-amber-100/90">
                  Spotify session expired
                </span>
                <span className="text-xs text-amber-200/50 ml-1.5">
                  Your token couldn&apos;t be refreshed.
                </span>
              </div>
              <a
                href="/api/spotify/auth"
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#1DB954] text-black text-sm font-medium hover:bg-[#1ed760] transition-colors flex-shrink-0"
              >
                Reconnect
              </a>
              <button
                onClick={() => setDismissed(true)}
                className="text-amber-200/40 hover:text-amber-200/80 transition-colors flex-shrink-0"
                aria-label="Dismiss"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}