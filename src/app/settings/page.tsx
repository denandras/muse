"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Loader2, LogOut, RefreshCw } from "lucide-react";
import type { User, UserSettings } from "@/lib/types";
import SyncButton from "@/components/SyncButton";
import type { SyncState } from "@/components/SyncButton";

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadSyncState = useCallback(() => {
    fetch("/api/sync/import", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSyncState(d.sync_state as SyncState))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/user").then((r) => r.json()),
      fetch("/api/user/settings").then((r) => r.json()),
    ])
      .then(([u, s]) => {
        if (!active) return;
        setUser(u.user ?? u);
        setSettings(s.settings ?? s);
      })
      .finally(() => active && setLoading(false));
    loadSyncState();
    return () => {
      active = false;
    };
  }, [loadSyncState]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const updateSettings = useCallback(
    async (patch: Partial<UserSettings>) => {
      setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
      setSaving(true);
      try {
        await fetch("/api/user/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        showToast("Saved");
      } finally {
        setSaving(false);
      }
    },
    [showToast]
  );

  const toggleProfilePublic = useCallback(async () => {
    if (!user) return;
    const next = !user.profile_public;
    setUser({ ...user, profile_public: next });
    setSaving(true);
    try {
      await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_public: next }),
      });
      showToast(next ? "Profile is public" : "Profile is private");
    } finally {
      setSaving(false);
    }
  }, [user, showToast]);

  const disconnect = useCallback(async () => {
    await fetch("/api/spotify/disconnect", { method: "POST" });
    window.location.href = "/";
  }, []);

  if (loading || !user || !settings) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="animate-spin text-white/40" size={24} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 flex flex-col gap-5">
      {/* Profile card */}
      <section className="rounded-2xl glass p-5 flex flex-col gap-4">
        <div className="flex items-center gap-4">
          {user.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatar_url}
              alt=""
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-2xl text-white/60">
              {(user.display_name || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="text-base font-medium text-white/90 truncate">
              {user.display_name || "Unknown"}
            </div>
            {user.email && (
              <div className="text-sm text-white/40 truncate">{user.email}</div>
            )}
            <div className="text-xs text-white/30 mt-0.5">
              Spotify ID: {user.spotify_id}
            </div>
          </div>
        </div>

        {/* Profile public toggle */}
        <label className="flex items-center justify-between gap-3 pt-2 border-t border-white/[0.06]">
          <div>
            <div className="text-sm text-white/80">Public profile</div>
            <div className="text-xs text-white/40">
              Allow others to view your organized music at /profile/&lt;id&gt;
            </div>
          </div>
          <Toggle
            checked={user.profile_public}
            onChange={toggleProfilePublic}
            disabled={saving}
          />
        </label>
      </section>

      {/* Spotify connection */}
      <section className="rounded-2xl glass p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                user.spotify_product ? "bg-green-400" : "bg-white/30"
              }`}
            />
            <span className="text-sm text-white/80">
              Connected · {user.spotify_product === "premium" ? "Premium" : "Free"}
            </span>
          </div>
          <button
            onClick={disconnect}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-white/[0.06] text-white/70 text-sm hover:bg-rose-500/20 hover:text-rose-300 transition-colors"
          >
            <LogOut size={14} />
            Disconnect
          </button>
        </div>
      </section>

      {/* Spotify sync */}
      <section className="rounded-2xl glass p-5 flex flex-col gap-4">
        <p className="text-sm text-white/60">
          Import your liked songs and saved albums into Muse. Re-running
          sync only fetches new items.
        </p>
        <SyncButton onSyncComplete={loadSyncState} variant="panel" />
        {syncState && (
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/[0.06] text-xs">
            <div>
              <div className="text-white/40">Liked tracks synced</div>
              <div className="text-white/80">
                {syncState.liked_tracks_synced_at
                  ? new Date(syncState.liked_tracks_synced_at).toLocaleString()
                  : "Never"}
              </div>
            </div>
            <div>
              <div className="text-white/40">Saved albums synced</div>
              <div className="text-white/80">
                {syncState.saved_albums_synced_at
                  ? new Date(syncState.saved_albums_synced_at).toLocaleString()
                  : "Never"}
              </div>
            </div>
            <div>
              <div className="text-white/40">Total tracks imported</div>
              <div className="text-white/80">
                {syncState.total_tracks_imported.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-white/40">Total albums imported</div>
              <div className="text-white/80">
                {syncState.total_albums_imported.toLocaleString()}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Preferences */}
      <section className="rounded-2xl glass p-5 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-white/80">Play count window</span>
          <span className="text-xs text-white/40">
            Which play count column to emphasize across the app.
          </span>
          <select
            value={settings.play_count_window}
            onChange={(e) =>
              updateSettings({
                play_count_window: e.target.value as UserSettings["play_count_window"],
              })
            }
            className="h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white/80"
          >
            <option value="all_time">All time</option>
            <option value="this_year">This year</option>
            <option value="30d">Last 30 days</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-white/80">Default view mode</span>
          <span className="text-xs text-white/40">
            Initial view for the library page.
          </span>
          <select
            value={settings.default_view_mode}
            onChange={(e) =>
              updateSettings({
                default_view_mode: e.target
                  .value as UserSettings["default_view_mode"],
              })
            }
            className="h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white/80"
          >
            <option value="both">Both (albums + tracks)</option>
            <option value="albums">Albums only</option>
            <option value="tracks">Tracks only</option>
          </select>
        </label>
      </section>

      <AnimateToast toast={toast} />
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
        checked ? "bg-green-500/80" : "bg-white/15"
      } disabled:opacity-50`}
      aria-pressed={checked}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

function AnimateToast({ toast }: { toast: string | null }) {
  if (!toast) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl glass-strong px-4 py-2.5 text-sm text-white/90"
    >
      {toast}
    </motion.div>
  );
}