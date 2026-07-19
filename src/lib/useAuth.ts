"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { User } from "@/lib/types";

interface UseAuthState {
  /** null = still checking, true = logged in, false = not logged in */
  isAuthenticated: boolean | null;
  user: User | null;
  /** true while the initial session check is in progress */
  loading: boolean;
  /** Error message if the session check failed */
  error: string | null;
  /** Re-check session status by calling /api/auth/session */
  refresh: () => Promise<void>;
  /** Disconnect from Spotify (clears cookies, resets state) */
  disconnect: () => Promise<void>;
}

/**
 * Client-side hook for Spotify OAuth session management.
 * Checks session status via /api/auth/session on mount and exposes
 * refresh/disconnect helpers.
 */
export function useAuth(): UseAuthState {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const checkSession = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      if (!res.ok) {
        if (mounted.current) {
          setIsAuthenticated(false);
          setUser(null);
        }
        return;
      }
      const data = await res.json();
      if (!mounted.current) return;
      setIsAuthenticated(data.authenticated === true);
      setUser(data.user ?? null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : "Session check failed");
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await fetch("/api/spotify/disconnect", { method: "POST" });
    } catch {
      // ignore — cookies are the source of truth
    } finally {
      if (mounted.current) {
        setIsAuthenticated(false);
        setUser(null);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    checkSession();
    return () => {
      mounted.current = false;
    };
  }, [checkSession]);

  return {
    isAuthenticated,
    user,
    loading,
    error,
    refresh: checkSession,
    disconnect,
  };
}