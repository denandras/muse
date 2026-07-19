"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Library,
  Heart,
  Star,
  FolderTree,
  Palette,
  Settings,
  Music2,
} from "lucide-react";
import type { User } from "@/lib/types";

const NAV_ITEMS = [
  { href: "/library", label: "Library", icon: Library },
  { href: "/library/liked", label: "Liked", icon: Heart },
  { href: "/library/favorites", label: "Favorites", icon: Star },
  { href: "/genres", label: "Genres", icon: FolderTree },
  { href: "/moods", label: "Moods", icon: Palette },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const isLanding = pathname === "/";

  useEffect(() => {
    if (isLanding) return;
    fetch("/api/user", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setUser)
      .catch(() => setUser(null));
  }, [isLanding]);

  // Landing page renders standalone without nav.
  if (isLanding) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar nav (desktop) */}
      <aside className="hidden md:flex flex-col w-56 flex-shrink-0 border-r border-white/[0.06] bg-white/[0.02] p-4 gap-1">
        <Link
          href="/library"
          className="flex items-center gap-2 px-3 py-2 mb-4 text-sm font-semibold text-white/90"
        >
          <Music2 size={18} className="text-white/70" />
          Muse
        </Link>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} {...item} active={pathname === item.href} />
        ))}
        <div className="mt-auto pt-4 border-t border-white/[0.06]">
          {user && (
            <Link
              href="/settings"
              className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors"
            >
              {user.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatar_url}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs text-white/60">
                  {(user.display_name || "?").slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-sm text-white/90 truncate">
                  {user.display_name || "User"}
                </div>
                <div className="text-xs text-white/40 truncate">
                  {user.spotify_product === "premium" ? "Premium" : "Free"}
                </div>
              </div>
            </Link>
          )}
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 glass-strong border-b border-white/[0.08] px-4 py-3 flex items-center justify-between">
        <Link
          href="/library"
          className="flex items-center gap-2 text-sm font-semibold text-white/90"
        >
          <Music2 size={16} className="text-white/70" />
          Muse
        </Link>
        {user && (
          <Link href="/settings" className="flex items-center gap-2">
            {user.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatar_url}
                alt=""
                className="w-7 h-7 rounded-full object-cover"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs text-white/60">
                {(user.display_name || "?").slice(0, 1).toUpperCase()}
              </div>
            )}
          </Link>
        )}
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 glass-strong border-t border-white/[0.08] flex items-center justify-around px-2 py-1.5">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] transition-colors ${
                active ? "text-white" : "text-white/40"
              }`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Main content with page transitions */}
      <main className="flex-1 min-w-0 pt-14 pb-16 md:pt-0 md:pb-0">
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
          ? "bg-white/[0.08] text-white"
          : "text-white/50 hover:text-white/90 hover:bg-white/5"
      }`}
    >
      <Icon size={16} />
      {label}
    </Link>
  );
}