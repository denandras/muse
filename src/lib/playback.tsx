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
  /** Whether the Spotify SDK is loaded and a player is connected */
  spotifyReady: boolean;
  /** Whether the user is connected to Spotify (has valid tokens) */
  spotifyConnected: boolean;
  /** Whether the user has Spotify Premium. Play calls are gated on this. */
  isPremium: boolean;
  /** True when the Spotify SDK fired authentication_error — refresh token is dead. */
  authError: boolean;
  /** Play a track by its id. Pass the Spotify URI to play via the Web Playback SDK. */
  play: (trackId: string, title?: string, spotifyUri?: string | null) => void;
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

  // ── Position polling for Spotify ─────────────────────────────────────────
  // The Spotify SDK only fires player_state_changed on state transitions
  // (play/pause/seek), not continuously. We poll getCurrentState() every 500ms
  // to update the progress bar smoothly while playing.
  const spotifyPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopSpotifyPositionPolling = useCallback(() => {
    if (spotifyPollRef.current) {
      clearInterval(spotifyPollRef.current);
      spotifyPollRef.current = null;
    }
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
      setCurrentTime(posSec);
    }, 500);
  }, []);

  // ── Helper: start playback on our Spotify device ─────────────────────────
  // This uses the Web API to play a specific track URI on our device.
  // IMPORTANT: Use the device_id captured from the 'ready' event — NOT the
  // /v1/me/player/devices API, which can resume the user's last song on
  // another device.
  const spotifyPlayTrack = useCallback(async (spotifyUri: string) => {
    const deviceId = spotifyDeviceIdRef.current;
    if (!deviceId) {
      console.error("Spotify playback: no device_id");
      return;
    }

    // Fetch a fresh token for the Web API call
    const tokenRes = await fetch("/api/spotify/token");
    if (!tokenRes.ok) {
      console.error("Spotify playback: failed to get token");
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

    const body = isSameTrack
      ? undefined // Resume current track if same
      : isContextUri
      ? JSON.stringify({ context_uri: spotifyUri })
      : JSON.stringify({ uris: [spotifyUri] });

    // Start playback on our device with the specified track
    const playRes = await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body,
      }
    );

    if (!playRes.ok) {
      const text = await playRes.text();
      console.error("Spotify play API error:", playRes.status, text);
      return;
    }

    currentSpotifyUriRef.current = spotifyUri;
  }, []);

  // ── Spotify SDK loading ──────────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check session + Premium status first.
    // /api/auth/session returns the user object (with spotify_product) when
    // authenticated. We use that to gate playback and to decide whether to
    // even attempt loading the SDK — the SDK hard-requires Premium.
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.authenticated) return;
        if (data.user?.spotify_product === "premium") {
          setIsPremium(true);
        }
      })
      .catch(() => {});

    // Check if already connected (has tokens). We still attempt to load the
    // SDK even for non-Premium so we can show a clear message via the
    // account_error event, but we only wire up the player when we have a token.
    fetch("/api/spotify/token")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.access_token) {
          setSpotifyConnected(true);
          spotifyTokenRef.current = data.access_token;
        }
      })
      .catch(() => {});

    // Load Spotify SDK script
    const existing = document.querySelector(
      'script[src="https://sdk.scdn.co/spotify-player.js"]'
    );
    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      document.body.appendChild(script);
    }

    // Set up the SDK ready callback
    window.onSpotifyWebPlaybackSDKReady = () => {
      // Fetch a fresh token for the player
      fetch("/api/spotify/token")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data?.access_token) return;

          spotifyTokenRef.current = data.access_token;
          setSpotifyConnected(true);

          const player = new window.Spotify.Player({
            name: "Muse Player",
            getOAuthToken: (cb: (token: string) => void) => {
              // The SDK calls this when it needs a token.
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

          // Player ready — capture the device_id!
          player.addListener("ready", (event: SpotifyDeviceReadyEvent) => {
            spotifyDeviceIdRef.current = event.device_id;
            setSpotifyReady(true);
          });

          // Player not ready (e.g. errors)
          player.addListener("not_ready", () => {
            spotifyDeviceIdRef.current = null;
            setSpotifyReady(false);
          });

          // Playback state updates
          player.addListener(
            "player_state_changed",
            (state: SpotifyPlayerState | null) => {
              if (!state) return;

              setCurrentTime(state.position / 1000);
              setDuration(state.duration / 1000);
              setIsPlaying(!state.paused);

              // Update track metadata from the SDK's track window so the
              // player bar shows real album art / artist when the user skips
              // tracks via Spotify controls outside our play() call.
              const t = state.track_window?.current_track;
              if (t) {
                if (t.name) setCurrentTrackTitle(t.name);
                if (t.artists?.length) {
                  setCurrentTrackArtist(t.artists.map((a) => a.name).join(", "));
                }
                const art = t.album?.images?.[0]?.url ?? null;
                if (art) setCurrentTrackAlbumArt(art);
              }

              // Start/stop the position polling based on play state
              if (!state.paused) {
                startSpotifyPositionPolling();
              } else {
                stopSpotifyPositionPolling();
              }
            }
          );

          player.addListener("initialization_error", (err: any) =>
            console.error("Spotify init error:", err)
          );
          player.addListener("authentication_error", (err: any) => {
            console.error("Spotify auth error:", err);
            setAuthError(true);
          });
          player.addListener("account_error", (err: any) => {
            console.error("Spotify account error (Premium required?):", err);
            // Surface the non-Premium state — the player will not become ready.
            setIsPremium(false);
          });

          player.connect();
          spotifyPlayerRef.current = player;
        })
        .catch(() => {});
    };

    return () => {
      stopSpotifyPositionPolling();
      if (spotifyPlayerRef.current) {
        spotifyPlayerRef.current.disconnect();
        spotifyPlayerRef.current = null;
      }
    };
  }, [startSpotifyPositionPolling, stopSpotifyPositionPolling]);

  // ── API ──────────────────────────────────────────────────────────────────

  const play = useCallback(
    (trackId: string, title?: string, spotifyUri?: string | null) => {
      if (!isPremium) {
        console.warn("Playback requires Spotify Premium.");
        return;
      }
      if (!spotifyUri) {
        console.error("play() requires a spotifyUri for Spotify playback");
        return;
      }
      if (!spotifyReady || !spotifyPlayerRef.current) {
        console.error("Spotify player not ready");
        return;
      }

      // If switching tracks, update state
      if (currentTrackIdRef.current !== trackId) {
        setCurrentTrackId(trackId);
        setCurrentTrackTitle(title ?? null);
        // Artist/album art will be filled in by player_state_changed once
        // the new track starts.
      }

      spotifyPlayTrack(spotifyUri).catch((err) => {
        console.error("Spotify playback error:", err);
      });
    },
    [isPremium, spotifyReady, spotifyPlayTrack]
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
    spotifyPlayerRef.current?.nextTrack().catch((err: unknown) => {
      console.error("Spotify nextTrack error:", err);
    });
  }, [isPremium]);

  const previous = useCallback(() => {
    if (!isPremium) return;
    spotifyPlayerRef.current?.previousTrack().catch((err: unknown) => {
      console.error("Spotify previousTrack error:", err);
    });
  }, [isPremium]);

  const setVolume = useCallback((vol: number) => {
    spotifyPlayerRef.current?.setVolume(vol).catch((err: unknown) => {
      console.error("Spotify setVolume error:", err);
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
    spotifyReady,
    spotifyConnected,
    isPremium,
    authError,
    play,
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