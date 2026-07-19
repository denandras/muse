"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

const navItems = [
  { href: "/", label: "Library" },
  { href: "/genres", label: "Genres" },
  { href: "/moods", label: "Moods" },
  { href: "/favorites", label: "Favorites" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="glass-strong sticky top-0 z-50 px-6 py-4">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Muse
        </Link>
        <div className="flex gap-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative rounded-lg px-4 py-2 text-sm transition-colors ${
                  isActive
                    ? "text-white"
                    : "text-white/60 hover:text-white/90"
                }`}
              >
                {item.label}
                {isActive && (
                  <motion.div
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-lg bg-white/[0.08]"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}