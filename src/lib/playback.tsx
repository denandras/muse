"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

// ── Types ──────────────────────────────────────────────────────────────────

interface PlaybackState {
  currentTrackId: string | null;
  currentTrackTitle: string | null;
  currentTrackArtist: string | null;
  currentTrackAlbumArt: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  /** Number of tracks in the local play queue. */
  queueLength: number;
  /** Index of the currently playing track in the local queue (0-based). */
  queueIndex: number;
  /** Whether the Spotify SDK is loaded and a player is connected */
  spotifyReady: boolean;
  /** Whether the user is connected to Spotify (has valid tokens) */
  spotifyConnected: boolean;
  /** Whether the user has Spotify Premium. Play calls are gated on this. */
  isPremium: boolean;
  /** True when the Spotify SDK fired authentication_error — refresh token is dead. */
  authError: boolean;
  /** Play a single track by its id. Playback stops at the end of the track. */
  play: (trackId: string, title?: string, spotifyUri?: string | null) => void;
  /**
   * Play an album by queuing its tracks in order. Auto-advances to the next
   * track when the current one ends. Pass the ordered list of track entries.
   */
  playAlbum: (
    tracks: Array<{ id: string; title?: string; spotifyUri?: string | null }>
  ) => void;
  /** Pause playback. */
  pause: () => void;
  /** Resume playback after pause. */
  resume: () => void;
  /** Stop playback and reset position to zero. */
  stop: () => void;
  /** Seek to an absolute position (seconds). */
  seek: (time: number) => void;
  /** Skip to the next track in the user's queue. */
  next: () => void;
  /** Skip to the previous track in the user's queue. */
  previous: () => void;
  /** Set the player volume (0..1). */
  setVolume: (vol: number) => void;
}

// ── Spotify SDK type helpers ───────────────────────────────────────────────

interface SpotifyImage {
  url: string;
}

interface SpotifySdkTrack {
  uri: string;
  name: string;
  artists?: Array<{ name: string; uri: string }>;
  album: {
    uri: string;
    name: string;
    images: SpotifyImage[];
  };
}

interface SpotifyPlayerState {
  position: number;
  duration: number;
  paused: boolean;
  track_window: {
    current_track: SpotifySdkTrack;
  };
}

interface SpotifyPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  getCurrentState(): Promise<SpotifyPlayerState | null>;
  resume(): Promise<void>;
  pause(): Promise<void>;
  togglePlay(): Promise<void>;
  seek(seconds: number): Promise<void>;
  setVolume(vol: number): Promise<void>;
  nextTrack(): Promise<void>;
  previousTrack(): Promise<void>;
  addListener(event: string, cb: (...args: any[]) => void): void;
  removeListener(event: string, cb: (...args: any[]) => void): void;
}

interface SpotifyDeviceReadyEvent {
  device_id: string;
}

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify: {
      Player: new (config: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SpotifyPlayer;
    };
  }
}

// ── Context ────────────────────────────────────────────────────────────────

const PlaybackContext = createContext<PlaybackState | null>(null);

export function usePlayback(): PlaybackState {
  const ctx = useContext(PlaybackContext);
  if (!ctx) {
    throw new Error("usePlayback() must be used inside <PlaybackProvider>");
  }
  return ctx;
}

// ── Provider ────────────────────────────────────────────────────────────────

export function PlaybackProvider({ children }: { children: ReactNode }) {
  // Spotify player instance + device ID
  const spotifyPlayerRef = useRef<SpotifyPlayer | null>(null);
  const spotifyDeviceIdRef = useRef<string | null>(null);
  const spotifyTokenRef = useRef<string | null>(null);

  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [currentTrackTitle, setCurrentTrackTitle] = useState<string | null>(null);
  const [currentTrackArtist, setCurrentTrackArtist] = useState<string | null>(null);
  const [currentTrackAlbumArt, setCurrentTrackAlbumArt] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [spotifyReady, setSpotifyReady] = useState(false);
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [authError, setAuthError] = useState(false);

  // Keep refs to current values so event listeners see latest state
  const currentTrackIdRef = useRef<string | null>(null);
  currentTrackIdRef.current = currentTrackId;
  // Track the Spotify URI currently loaded so we know if we need to switch tracks
  const currentSpotifyUriRef = useRef<string | null>(null);

  // ── Local play queue ──────────────────────────────────────────────────────
  // A unified queue that serves both single-track and album/playlist playback.
  // Every play action populates this queue. next/previous navigate it.
  // Auto-advance at track end uses this queue too.
  // When the queue has exactly 1 entry, next/previous are no-ops (single track).
  interface QueueEntry {
    id: string;
    title?: string;
    spotifyUri: string;
  }
  const queueRef = useRef<QueueEntry[]>([]);
  const queueIndexRef = useRef<number>(0);
  const [queueLength, setQueueLength] = useState(0);
  const [queueIndex, setQueueIndex] = useState(0);
  // Ref to detect end-of-track inside the poll.
  const endedHandledRef = useRef<boolean>(false);

  // ── Pending play request ────────────────────────────────────────────────
  // When play() or playAlbum() is called before the Spotify player is ready
  // (e.g. on first track selection after page load, or after the tab returns
  // from background and the player's WebSocket died), we store the request
  // here. When the player's "ready" event fires, we execute the pending
  // request — so the user's first click actually starts playback instead
  // of silently doing nothing (requiring a second click).
  const pendingPlayRef = useRef<(() => void) | null>(null);

  // Ref to initPlayer so the 404 handler in spotifyPlayTrack can call it
  // without creating a circular dependency (spotifyPlayTrack has [] deps).
  const initPlayerRef = useRef<(() => void) | null>(null);

  // ── Position polling for Spotify ─────────────────────────────────────────
  // The Spotify SDK only fires player_state_changed on state transitions
  // (play/pause/seek), not continuously. We poll getCurrentState() every 500ms
  // to update the progress bar smoothly while playing AND to detect end-of-track.
  const spotifyPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopSpotifyPositionPolling = useCallback(() => {
    if (spotifyPollRef.current) {
      clearInterval(spotifyPollRef.current);
      spotifyPollRef.current = null;
    }
  }, []);

  // ── Helper: start playback on our Spotify device ─────────────────────────
  // IMPORTANT: declared before startSpotifyPositionPolling because the poll
  // calls it for album auto-advance.
  const spotifyPlayTrack = useCallback(async (spotifyUri: string) => {
    const deviceId = spotifyDeviceIdRef.current;
    if (!deviceId) {
      console.error("[Muse Playback] no device_id — player not ready");
      return;
    }

    // Fetch a fresh token for the Web API call
    const tokenRes = await fetch("/api/spotify/token");
    if (!tokenRes.ok) {
      console.error("[Muse Playback] failed to get token for play call");
      return;
    }
    const tokenData = await tokenRes.json();
    const token = tokenData.access_token;
    spotifyTokenRef.current = token;

    const isSameTrack = currentSpotifyUriRef.current === spotifyUri;

    // Detect URI type: album/artist URIs use context_uri, track URIs use uris[]
    const isAlbumUri = spotifyUri.startsWith("spotify:album:");
    const isArtistUri = spotifyUri.startsWith("spotify:artist:");
    const isContextUri = isAlbumUri || isArtistUri;

    // When resuming the same track, Spotify's /play with no body resumes from
    // the current position. But if the track finished (position == duration),
    // resuming does nothing — we must seek back to 0 first, then resume.
    if (isSameTrack) {
      try {
        const playerState = await spotifyPlayerRef.current?.getCurrentState();
        if (playerState && playerState.duration > 0 &&
            playerState.position >= playerState.duration - 1000) {
          await spotifyPlayerRef.current?.seek(0);
        }
      } catch {}
    }

    const body = isSameTrack
      ? undefined // Resume current track (or play from 0 if finished)
      : isContextUri
      ? JSON.stringify({ context_uri: spotifyUri })
      : JSON.stringify({ uris: [spotifyUri] });

    // Start playback on our device with the specified track.
    // Content-Type: application/json is REQUIRED by the Spotify API —
    // without it the body is silently ignored and the track loads but
    // stays paused (the device receives the track but playback never starts).
    const playRes = await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body,
      }
    );

    if (!playRes.ok) {
      const text = await playRes.text();
      console.error("[Muse Playback] play API error:", playRes.status, text);
      // 404 = device not found — the device may have gone stale (e.g. after
      // the tab was in the background). Re-init immediately so the pending
      // play request (if any) fires when the new player is ready.
      if (playRes.status === 404) {
        console.log("[Muse Playback] device 404 — trying to reconnect player");
        setSpotifyReady(false);
        spotifyDeviceIdRef.current = null;
        try {
          spotifyPlayerRef.current?.disconnect();
        } catch {}
        spotifyPlayerRef.current = null;
        // Re-init the player immediately (if initPlayer is available)
        initPlayerRef.current?.();
      }
      return;
    }

    currentSpotifyUriRef.current = spotifyUri;
  }, []);

  const startSpotifyPositionPolling = useCallback(() => {
    // Don't start a duplicate interval
    if (spotifyPollRef.current) return;
    spotifyPollRef.current = setInterval(async () => {
      const player = spotifyPlayerRef.current;
      if (!player) return;
      const state = await player.getCurrentState();
      if (!state) return;
      const posSec = state.position / 1000;
      const durSec = state.duration / 1000;
      setCurrentTime(posSec);

      // ── End-of-track detection ──────────────────────────────────────────
      // When the position is within 0.4s of the duration, the track is ending.
      // If there are more tracks in the queue, auto-advance to the next one.
      // Otherwise stop playback at the end.
      const nearEnd = durSec > 0 && posSec >= durSec - 0.4;
      if (nearEnd && !endedHandledRef.current) {
        endedHandledRef.current = true;
        const queue = queueRef.current;
        const idx = queueIndexRef.current;
        if (queue.length > 1 && idx < queue.length - 1) {
          // Advance to next track in the queue
          const nextIdx = idx + 1;
          queueIndexRef.current = nextIdx;
          setQueueIndex(nextIdx);
          const nextEntry = queue[nextIdx];
          console.log("[Muse Playback] auto-advance → track", nextIdx + 1);
          spotifyPlayTrack(nextEntry.spotifyUri);
        } else {
          // Last track in queue or single-track mode: stop at the end
          console.log("[Muse Playback] reached end — stopping");
          stopSpotifyPositionPolling();
          setIsPlaying(false);
          setCurrentTime(durSec);
        }
      }
      // Reset the ended flag when a new track starts (position drops near 0)
      if (posSec < 0.3 && durSec > 1) {
        endedHandledRef.current = false;
      }
    }, 500);
  }, [spotifyPlayTrack, stopSpotifyPositionPolling]);

  // ── Spotify SDK loading ──────────────────────────────────────────────────

  // Always load the Spotify SDK script on mount — it's just a script tag.
  // The actual player creation happens in onSpotifyWebPlaybackSDKReady,
  // which fetches a token. If the session is expired, the token fetch fails
  // and no player is created. When the user reconnects, the session poll
  // (below) re-triggers the callback to create the player.
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check session + Premium status.
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.authenticated) return;
        if (data.user?.spotify_product === "premium") {
          setIsPremium(true);
        }
      })
      .catch(() => {});

    // Load Spotify SDK script (always — it's lightweight until a player is created)
    const existing = document.querySelector(
      'script[src="https://sdk.scdn.co/spotify-player.js"]'
    );
    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      document.body.appendChild(script);
    }

    // Set up the SDK ready callback — this fires when the script loads.
    window.onSpotifyWebPlaybackSDKReady = () => {
      initPlayer();
    };

    // If the SDK script was already loaded, the callback may have already fired.
    if (window.Spotify && window.Spotify.Player) {
      initPlayer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Create the Spotify player ─────────────────────────────────────────
  const initPlayer = useCallback(() => {
    // Don't create a duplicate player
    if (spotifyPlayerRef.current) return;

    fetch("/api/spotify/token")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.access_token) {
          // Session expired — the poll will retry
          return;
        }

        spotifyTokenRef.current = data.access_token;
        setSpotifyConnected(true);
        setAuthError(false);

        const player = new window.Spotify.Player({
          name: "Muse Player",
          getOAuthToken: (cb: (token: string) => void) => {
            fetch("/api/spotify/token")
              .then((r) => (r.ok ? r.json() : null))
              .then((d) => {
                if (d?.access_token) {
                  spotifyTokenRef.current = d.access_token;
                  cb(d.access_token);
                }
              })
              .catch(() => {});
          },
          volume: 0.5,
        });

        player.addListener("ready", (event: SpotifyDeviceReadyEvent) => {
          console.log("[Muse Playback] Device ready:", event.device_id);
          spotifyDeviceIdRef.current = event.device_id;
          setSpotifyReady(true);
          setAuthError(false);
          // Execute any pending play request that was queued while the
          // player wasn't ready (e.g. user clicked play while the player
          // was reconnecting after returning from background).
          const pending = pendingPlayRef.current;
          if (pending) {
            pendingPlayRef.current = null;
            console.log("[Muse Playback] executing pending play request");
            // Small delay to ensure device_id is propagated
            setTimeout(pending, 100);
          }
        });

        player.addListener("not_ready", () => {
          console.warn("[Muse Playback] Device not ready — clearing player");
          spotifyDeviceIdRef.current = null;
          setSpotifyReady(false);
          try {
            spotifyPlayerRef.current?.disconnect();
          } catch {}
          spotifyPlayerRef.current = null;
          stopSpotifyPositionPolling();
        });

        player.addListener(
          "player_state_changed",
          (state: SpotifyPlayerState | null) => {
            if (!state) {
              console.log("[Muse Playback] state = null (device disconnected?)");
              return;
            }

            setCurrentTime(state.position / 1000);
            setDuration(state.duration / 1000);
            setIsPlaying(!state.paused);

            const t = state.track_window?.current_track;
            if (t) {
              if (t.name) setCurrentTrackTitle(t.name);
              if (t.artists?.length) {
                setCurrentTrackArtist(t.artists.map((a) => a.name).join(", "));
              }
              const art = t.album?.images?.[0]?.url ?? null;
              if (art) setCurrentTrackAlbumArt(art);
            }

            if (!state.paused) {
              startSpotifyPositionPolling();
            } else {
              stopSpotifyPositionPolling();
            }
          }
        );

        player.addListener("initialization_error", (err: any) =>
          console.error("[Muse Playback] init error:", err)
        );
        player.addListener("authentication_error", (err: any) => {
          console.error("[Muse Playback] auth error:", err);
          setAuthError(true);
        });
        player.addListener("account_error", (err: any) => {
          console.error("[Muse Playback] account error (Premium required?):", err);
          setIsPremium(false);
        });
        player.addListener("playback_error", (err: any) => {
          console.error("[Muse Playback] playback_error:", err);
        });

        // Set ref immediately to prevent the poll from creating a duplicate
        // while connect() is still pending.
        spotifyPlayerRef.current = player;
        player.connect().then((success: boolean) => {
          if (!success) {
            console.error("[Muse Playback] player.connect() returned false");
            spotifyPlayerRef.current = null;
          } else {
            console.log("[Muse Playback] player.connect() success");
          }
        }).catch((err: unknown) => {
          console.error("[Muse Playback] player.connect() threw:", err);
          spotifyPlayerRef.current = null;
        });
      })
      .catch(() => {});
  }, [startSpotifyPositionPolling, stopSpotifyPositionPolling]);

  // Keep initPlayerRef in sync so spotifyPlayTrack's 404 handler can call it
  // without creating a circular dependency (spotifyPlayTrack has [] deps).
  initPlayerRef.current = initPlayer;

  // ── Tab visibility listener ─────────────────────────────────────────────
  // When the tab returns to foreground after being in the background, the
  // Spotify SDK's WebSocket connection is likely dead (browsers suspend
  // background tab JS/timers). Proactively check the player's health and
  // re-init if it's gone stale, so the user's next play click works without
  // needing a manual second click.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      // If we think we're ready, verify the player is actually alive
      if (spotifyReady && spotifyPlayerRef.current) {
        spotifyPlayerRef.current.getCurrentState().catch(() => {
          // getCurrentState() rejects when the underlying WebSocket is dead
          console.log("[Muse Playback] player dead after background — re-initing");
          setSpotifyReady(false);
          spotifyDeviceIdRef.current = null;
          try {
            spotifyPlayerRef.current?.disconnect();
          } catch {}
          spotifyPlayerRef.current = null;
          stopSpotifyPositionPolling();
          initPlayer();
        });
      } else if (!spotifyPlayerRef.current) {
        // Player doesn't exist — re-init
        initPlayer();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [spotifyReady, initPlayer, stopSpotifyPositionPolling]);

  // Poll for session recovery — if the player isn't ready, re-check every 5s.
  useEffect(() => {
    if (spotifyReady) return;
    const interval = setInterval(() => {
      fetch("/api/spotify/token")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.access_token && !spotifyPlayerRef.current) {
            initPlayer();
          }
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [spotifyReady, initPlayer]);

  // ── API ──────────────────────────────────────────────────────────────────

  const play = useCallback(
    (trackId: string, title?: string, spotifyUri?: string | null) => {
      if (!spotifyUri) {
        console.error("[Muse Playback] play() requires a spotifyUri");
        return;
      }
      if (!isPremium) {
        console.warn("[Muse Playback] requires Spotify Premium. isPremium=false");
        fetch("/api/auth/session", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data?.authenticated && data.user?.spotify_product === "premium") {
              setIsPremium(true);
            }
          })
          .catch(() => {});
        return;
      }
      if (!spotifyReady || !spotifyPlayerRef.current) {
        console.warn("[Muse Playback] player not ready — queuing play request + re-init");
        // Queue this play request — it will execute when the new player's
        // "ready" event fires (see the ready listener in initPlayer).
        pendingPlayRef.current = () => {
          // Re-check readiness inside the callback (player may have failed)
          if (!spotifyDeviceIdRef.current) {
            console.warn("[Muse Playback] pending play: device still not ready");
            return;
          }
          // Single-track queue
          const entry: QueueEntry = { id: trackId, title, spotifyUri };
          queueRef.current = [entry];
          queueIndexRef.current = 0;
          setQueueLength(1);
          setQueueIndex(0);
          endedHandledRef.current = false;
          if (currentTrackIdRef.current !== trackId) {
            setCurrentTrackId(trackId);
            setCurrentTrackTitle(title ?? null);
          }
          spotifyPlayTrack(spotifyUri).catch((err) => {
            console.error("[Muse Playback] pending play error:", err);
          });
        };
        // Try to re-init the player immediately
        fetch("/api/spotify/token")
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data?.access_token) {
              spotifyTokenRef.current = data.access_token;
              setSpotifyConnected(true);
              setAuthError(false);
              if (!spotifyPlayerRef.current) {
                initPlayer();
              }
            }
          })
          .catch(() => {});
        return;
      }

      // Single-track mode: set queue to just this track.
      const entry: QueueEntry = { id: trackId, title, spotifyUri };
      queueRef.current = [entry];
      queueIndexRef.current = 0;
      setQueueLength(1);
      setQueueIndex(0);
      endedHandledRef.current = false;

      if (currentTrackIdRef.current !== trackId) {
        setCurrentTrackId(trackId);
        setCurrentTrackTitle(title ?? null);
      }

      spotifyPlayTrack(spotifyUri).catch((err) => {
        console.error("[Muse Playback] play error:", err);
      });
    },
    [isPremium, spotifyReady, spotifyPlayTrack, initPlayer]
  );

  const playAlbum = useCallback(
    (tracks: Array<{ id: string; title?: string; spotifyUri?: string | null }>) => {
      const valid = tracks.filter((t) => t.spotifyUri);
      if (valid.length === 0) {
        console.warn("[Muse Playback] playAlbum: no tracks with spotifyUri");
        return;
      }
      // Set queue to the album tracks — auto-advance at track end + next/previous.
      const entries: QueueEntry[] = valid.map((t) => ({
        id: t.id,
        title: t.title,
        spotifyUri: t.spotifyUri!,
      }));
      queueRef.current = entries;
      queueIndexRef.current = 0;
      setQueueLength(entries.length);
      setQueueIndex(0);
      endedHandledRef.current = false;

      // Play the first track via the standard play() path.
      const first = valid[0];
      if (!isPremium) {
        console.warn("[Muse Playback] playAlbum requires Spotify Premium");
        return;
      }
      if (!spotifyReady || !spotifyPlayerRef.current) {
        console.warn("[Muse Playback] player not ready for album — queuing + re-init");
        // Queue the album play — it will execute when the new player is ready.
        pendingPlayRef.current = () => {
          if (!spotifyDeviceIdRef.current) {
            console.warn("[Muse Playback] pending album play: device still not ready");
            return;
          }
          if (currentTrackIdRef.current !== first.id) {
            setCurrentTrackId(first.id);
            setCurrentTrackTitle(first.title ?? null);
          }
          spotifyPlayTrack(first.spotifyUri!).catch((err) => {
            console.error("[Muse Playback] pending album play error:", err);
          });
        };
        // Try to re-init the player immediately
        fetch("/api/spotify/token")
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data?.access_token) {
              spotifyTokenRef.current = data.access_token;
              setSpotifyConnected(true);
              setAuthError(false);
              if (!spotifyPlayerRef.current) {
                initPlayer();
              }
            }
          })
          .catch(() => {});
        return;
      }
      if (currentTrackIdRef.current !== first.id) {
        setCurrentTrackId(first.id);
        setCurrentTrackTitle(first.title ?? null);
      }
      spotifyPlayTrack(first.spotifyUri!).catch((err) => {
        console.error("[Muse Playback] playAlbum error:", err);
      });
    },
    [isPremium, spotifyReady, spotifyPlayTrack, initPlayer]
  );

  const pause = useCallback(() => {
    spotifyPlayerRef.current?.pause();
    stopSpotifyPositionPolling();
  }, [stopSpotifyPositionPolling]);

  const resume = useCallback(() => {
    if (!isPremium) return;
    spotifyPlayerRef.current?.resume();
    startSpotifyPositionPolling();
  }, [isPremium, startSpotifyPositionPolling]);

  const stop = useCallback(() => {
    const player = spotifyPlayerRef.current;
    if (player) {
      player.pause();
      player.seek(0);
    }
    stopSpotifyPositionPolling();
    setIsPlaying(false);
    setCurrentTime(0);
    currentSpotifyUriRef.current = null;
    queueRef.current = [];
    queueIndexRef.current = 0;
    setQueueLength(0);
    setQueueIndex(0);
  }, [stopSpotifyPositionPolling]);

  const seek = useCallback(
    (time: number) => {
      if (!isPremium) return;
      spotifyPlayerRef.current?.seek(time * 1000);
      setCurrentTime(time);
    },
    [isPremium]
  );

  const next = useCallback(() => {
    if (!isPremium) return;
    const queue = queueRef.current;
    const idx = queueIndexRef.current;
    if (queue.length === 0 || idx >= queue.length - 1) return;
    const nextIdx = idx + 1;
    const entry = queue[nextIdx];
    queueIndexRef.current = nextIdx;
    setQueueIndex(nextIdx);
    endedHandledRef.current = false;
    setCurrentTrackId(entry.id);
    setCurrentTrackTitle(entry.title ?? null);
    spotifyPlayTrack(entry.spotifyUri).catch((err: unknown) => {
      console.error("[Muse Playback] next track error:", err);
    });
  }, [isPremium, spotifyPlayTrack]);

  const previous = useCallback(() => {
    if (!isPremium) return;
    const queue = queueRef.current;
    const idx = queueIndexRef.current;
    if (queue.length === 0 || idx <= 0) return;
    const prevIdx = idx - 1;
    const entry = queue[prevIdx];
    queueIndexRef.current = prevIdx;
    setQueueIndex(prevIdx);
    endedHandledRef.current = false;
    setCurrentTrackId(entry.id);
    setCurrentTrackTitle(entry.title ?? null);
    spotifyPlayTrack(entry.spotifyUri).catch((err: unknown) => {
      console.error("[Muse Playback] previous track error:", err);
    });
  }, [isPremium, spotifyPlayTrack]);

  const setVolume = useCallback((vol: number) => {
    spotifyPlayerRef.current?.setVolume(vol).catch((err: unknown) => {
      console.error("[Muse Playback] setVolume error:", err);
    });
  }, []);

  const value: PlaybackState = {
    currentTrackId,
    currentTrackTitle,
    currentTrackArtist,
    currentTrackAlbumArt,
    isPlaying,
    currentTime,
    duration,
    queueLength,
    queueIndex,
    spotifyReady,
    spotifyConnected,
    isPremium,
    authError,
    play,
    playAlbum,
    pause,
    resume,
    stop,
    seek,
    next,
    previous,
    setVolume,
  };

  return (
    <PlaybackContext.Provider value={value}>
      {children}
    </PlaybackContext.Provider>
  );
}