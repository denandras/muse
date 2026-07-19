// Shared domain types for Muse frontend.

export interface Genre {
  id: string;
  user_id: string;
  name: string;
  parent_id: string | null;
  depth: number;
  sort_order: number;
  spotify_playlist_id: string | null;
  children?: Genre[];
  track_count?: number;
}

export interface Mood {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  sort_order: number;
  track_count?: number;
}

export interface Track {
  id: string;
  spotify_id: string | null;
  spotify_uri: string | null;
  title: string;
  artist: string;
  album_title: string | null;
  album_spotify_id: string | null;
  album_cover_url: string | null;
  duration_ms: number | null;
  is_liked: boolean;
  is_favorite: boolean;
  stars: number | null;
  musical_key: string | null;
  notes: string | null;
  play_count_all_time: number;
  play_count_2026: number;
  play_count_30d: number;
  last_played_at: string | null;
  added_at: string;
  updated_at: string;
  genres?: Genre[];
  moods?: Mood[];
}

export interface Album {
  id: string;
  spotify_id: string | null;
  spotify_uri: string | null;
  title: string;
  artist: string;
  cover_url: string | null;
  release_date: string | null;
  album_type: string | null;
  stars: number | null;
  notes: string | null;
  is_favorite: boolean;
  added_at: string;
  updated_at: string;
  genres?: Genre[];
  moods?: Mood[];
  tracks?: Track[];
}

export interface User {
  id: string;
  spotify_id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  spotify_product: string | null;
  profile_public: boolean;
}

export interface UserSettings {
  play_count_window: "all_time" | "this_year" | "30d";
  default_view_mode: "albums" | "tracks" | "both";
  theme: string;
}

export interface SyncState {
  liked_tracks_synced_at: string | null;
  saved_albums_synced_at: string | null;
  total_tracks_imported: number;
  total_albums_imported: number;
}

export type ViewMode = "albums" | "tracks" | "both";
export type SortKey =
  | "title"
  | "artist"
  | "album"
  | "stars"
  | "play_count"
  | "added_at"
  | "last_played_at"
  | "updated_at";