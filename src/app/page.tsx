"use client";

import { Suspense, useEffect } from "react";
import { motion } from "framer-motion";
import { Music2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/useAuth";

const SPOTIFY_ERROR_MESSAGES: Record<string, string> = {
  token_exchange: "Failed to connect to Spotify. Please try signing in again.",
  profile_fetch: "Could not retrieve your Spotify profile. Please try again.",
  no_code: "Spotify did not return an authorization code. Please try again.",
  state_mismatch: "Security check failed. Please try signing in again.",
};

function SpotifyErrorBanner() {
  const searchParams = useSearchParams();
  const spotifyError = searchParams.get("spotify_error");

  if (!spotifyError) return null;

  return (
    <div className="w-full max-w-md rounded-2xl bg-danger/10 border border-danger/30 px-4 py-3 text-sm text-danger-light">
      {SPOTIFY_ERROR_MESSAGES[spotifyError] ??
        "An unexpected error occurred during Spotify login."}
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();

  // Redirect to library if already authenticated
  useEffect(() => {
    if (isAuthenticated) router.replace("/library");
  }, [isAuthenticated, router]);

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden min-h-screen">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(139,168,136,0.15),_transparent_55%),radial-gradient(ellipse_at_bottom_left,_rgba(94,157,163,0.12),_transparent_50%),radial-gradient(ellipse_at_bottom_right,_rgba(196,122,94,0.12),_transparent_50%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-overlay/40 to-overlay/70" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 flex flex-col items-center gap-8 px-6 text-center"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="w-20 h-20 rounded-3xl glass-strong flex items-center justify-center"
        >
          <Music2 size={36} className="text-cream/90" />
        </motion.div>

        <div className="flex flex-col items-center gap-3">
          <h1 className="text-6xl sm:text-7xl font-bold tracking-tight text-cream">
            Muse
          </h1>
          <p className="text-base sm:text-lg text-cream/50 max-w-md">
            Organize your Spotify library with custom genres, moods, star
            ratings, and powerful filtering.
          </p>
        </div>

        <Suspense fallback={null}>
          <SpotifyErrorBanner />
        </Suspense>

        {loading ? (
          <div className="h-12 w-64 rounded-2xl glass animate-pulse" />
        ) : (
          <motion.a
            href="/api/spotify/auth"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center justify-center gap-2 h-12 px-7 rounded-2xl bg-spotify text-base font-semibold text-base hover:bg-spotify-hover transition-colors shadow-[0_0_40px_rgba(95,168,95,0.25)]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
            Sign in with Spotify
          </motion.a>
        )}

        <p className="text-xs text-cream/30 mt-2">
          Premium required for playback · Read-only sync from Spotify
        </p>
      </motion.div>
    </div>
  );
}