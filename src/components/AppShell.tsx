"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Library,
  FolderTree,
  Palette,
  Settings,
  Music2,
  ListMusic,
} from "lucide-react";
import type { User } from "@/lib/types";
import { usePlayback } from "@/lib/playback";
import ReconnectBanner from "@/components/ReconnectBanner";

const NAV_ITEMS = [
  { href: "/library", label: "Library", icon: Library },
  { href: "/playlists", label: "Playlists", icon: ListMusic },
  { href: "/genres", label: "Genres", icon: FolderTree },
  { href: "/moods", label: "Moods", icon: Palette },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const isLanding = pathname === "/";
  const { authError: sdkAuthError } = usePlayback();

  // Show reconnect banner if either the server says the session is dead
  // (401 from /api/user) or the Spotify SDK fired authentication_error.
  // Note: we do NOT auto-redirect to landing page. The reconnect banner
  // lets the user re-authenticate without losing their current page context.
  const showReconnect = sessionExpired || sdkAuthError;

  useEffect(() => {
    if (isLanding) return;
    fetch("/api/user", { cache: "no-store" })
      .then((r) => {
        if (r.status === 401) {
          setSessionExpired(true);
          return null;
        }
        setSessionExpired(false);
        return r.ok ? r.json() : null;
      })
      .then(setUser)
      .catch(() => setUser(null));
  }, [isLanding, pathname]);

  // Landing page renders standalone without nav.
  if (isLanding) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <ReconnectBanner show={showReconnect} />

      {/* Sidebar nav (desktop) */}
      <aside className="hidden md:flex flex-col w-56 flex-shrink-0 border-r border-cream/[0.06] bg-cream/[0.02] p-4 gap-1">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} {...item} active={pathname === item.href} />
        ))}
        <div className="mt-auto pt-4 border-t border-cream/[0.06]">
          {user && (
            <Link
              href="/settings"
              className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-cream/5 transition-colors"
            >
              {user.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatar_url}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center text-xs text-cream/70">
                  <Music2 size={14} />
                </div>
              )}
              <div className="min-w-0">
                <div className="text-sm text-cream/90 truncate">
                  {user.display_name || user.spotify_id || "User"}
                </div>
                <div className="text-xs text-cream/40 truncate">
                  {user.spotify_product === "premium" ? "Premium" : "Free"}
                </div>
              </div>
            </Link>
          )}
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 glass-strong border-t border-cream/[0.08] flex items-center justify-around px-2 py-1.5">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] transition-colors flex-1 ${
                active ? "text-cream" : "text-cream/40"
              }`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Main content with page transitions */}
      <main className="flex-1 min-w-0 pb-16 md:pb-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="min-h-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Library;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors ${
        active
          ? "bg-cream/[0.08] text-cream"
          : "text-cream/50 hover:text-cream/90 hover:bg-cream/5"
      }`}
    >
      <Icon size={16} />
      {label}
    </Link>
  );
}