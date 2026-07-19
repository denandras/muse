-- Muse — Music Organizer Database Schema
-- Project: pmgecxbscythmzqgtmed.supabase.co

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================
-- USERS (mirrors Spotify user identity)
-- =============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spotify_id TEXT UNIQUE NOT NULL,
    display_name TEXT,
    email TEXT,
    avatar_url TEXT,
    spotify_product TEXT,
    profile_public BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- GENRES (user-created, hierarchical via parent_id, max 15 levels)
-- =============================================
CREATE TABLE IF NOT EXISTS genres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_id UUID REFERENCES genres(id) ON DELETE CASCADE,
    depth INT NOT NULL DEFAULT 0,
    spotify_playlist_id TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, name, parent_id)
);

-- =============================================
-- MOODS (user-created, flat)
-- =============================================
CREATE TABLE IF NOT EXISTS moods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, name)
);

-- =============================================
-- TRACKS
-- =============================================
CREATE TABLE IF NOT EXISTS tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    spotify_id TEXT,
    spotify_uri TEXT,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album_title TEXT,
    album_spotify_id TEXT,
    album_cover_url TEXT,
    duration_ms INT,
    preview_url TEXT,
    is_liked BOOLEAN NOT NULL DEFAULT FALSE,
    is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
    stars INT,
    musical_key TEXT,
    notes TEXT,
    play_count_all_time INT NOT NULL DEFAULT 0,
    play_count_2026 INT NOT NULL DEFAULT 0,
    play_count_30d INT NOT NULL DEFAULT 0,
    last_played_at TIMESTAMPTZ,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, spotify_id)
);

CREATE INDEX IF NOT EXISTS idx_tracks_user_id ON tracks(user_id);
CREATE INDEX IF NOT EXISTS idx_tracks_spotify_id ON tracks(spotify_id);
CREATE INDEX IF NOT EXISTS idx_tracks_is_liked ON tracks(user_id, is_liked);
CREATE INDEX IF NOT EXISTS idx_tracks_is_favorite ON tracks(user_id, is_favorite);
CREATE INDEX IF NOT EXISTS idx_tracks_stars ON tracks(user_id, stars);

-- =============================================
-- TRACK_GENRES
-- =============================================
CREATE TABLE IF NOT EXISTS track_genres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    genre_id UUID NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(track_id, genre_id)
);
CREATE INDEX IF NOT EXISTS idx_track_genres_track ON track_genres(track_id);
CREATE INDEX IF NOT EXISTS idx_track_genres_genre ON track_genres(genre_id);

-- =============================================
-- TRACK_MOODS
-- =============================================
CREATE TABLE IF NOT EXISTS track_moods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    mood_id UUID NOT NULL REFERENCES moods(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(track_id, mood_id)
);
CREATE INDEX IF NOT EXISTS idx_track_moods_track ON track_moods(track_id);
CREATE INDEX IF NOT EXISTS idx_track_moods_mood ON track_moods(mood_id);

-- =============================================
-- ALBUMS
-- =============================================
CREATE TABLE IF NOT EXISTS albums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    spotify_id TEXT,
    spotify_uri TEXT,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    cover_url TEXT,
    release_date TEXT,
    album_type TEXT,
    stars INT,
    notes TEXT,
    is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, spotify_id)
);
CREATE INDEX IF NOT EXISTS idx_albums_user ON albums(user_id);
CREATE INDEX IF NOT EXISTS idx_albums_spotify_id ON albums(spotify_id);

-- =============================================
-- ALBUM_GENRES
-- =============================================
CREATE TABLE IF NOT EXISTS album_genres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    genre_id UUID NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(album_id, genre_id)
);
CREATE INDEX IF NOT EXISTS idx_album_genres_album ON album_genres(album_id);
CREATE INDEX IF NOT EXISTS idx_album_genres_genre ON album_genres(genre_id);

-- =============================================
-- ALBUM_MOODS
-- =============================================
CREATE TABLE IF NOT EXISTS album_moods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    mood_id UUID NOT NULL REFERENCES moods(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(album_id, mood_id)
);
CREATE INDEX IF NOT EXISTS idx_album_moods_album ON album_moods(album_id);
CREATE INDEX IF NOT EXISTS idx_album_moods_mood ON album_moods(mood_id);

-- =============================================
-- SYNC_STATE
-- =============================================
CREATE TABLE IF NOT EXISTS sync_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    liked_tracks_synced_at TIMESTAMPTZ,
    saved_albums_synced_at TIMESTAMPTZ,
    total_tracks_imported INT NOT NULL DEFAULT 0,
    total_albums_imported INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- USER_SETTINGS
-- =============================================
CREATE TABLE IF NOT EXISTS user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    play_count_window TEXT NOT NULL DEFAULT 'all_time',
    default_view_mode TEXT NOT NULL DEFAULT 'both',
    theme TEXT NOT NULL DEFAULT 'dark',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- updated_at trigger
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_genres_updated ON genres;
CREATE TRIGGER trg_genres_updated BEFORE UPDATE ON genres FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_moods_updated ON moods;
CREATE TRIGGER trg_moods_updated BEFORE UPDATE ON moods FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_tracks_updated ON tracks;
CREATE TRIGGER trg_tracks_updated BEFORE UPDATE ON tracks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_albums_updated ON albums;
CREATE TRIGGER trg_albums_updated BEFORE UPDATE ON albums FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_sync_state_updated ON sync_state;
CREATE TRIGGER trg_sync_state_updated BEFORE UPDATE ON sync_state FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_settings_updated ON user_settings;
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON user_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- RLS
-- =============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE moods ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_moods ENABLE ROW LEVEL SECURITY;
ALTER TABLE albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE album_genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE album_moods ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_self" ON users;
CREATE POLICY "users_self" ON users FOR ALL USING (auth.uid() = id OR id::text = current_setting('app.current_user_id', true));
DROP POLICY IF EXISTS "genres_self" ON genres;
CREATE POLICY "genres_self" ON genres FOR ALL USING (user_id = current_setting('app.current_user_id', true)::uuid);
DROP POLICY IF EXISTS "moods_self" ON moods;
CREATE POLICY "moods_self" ON moods FOR ALL USING (user_id = current_setting('app.current_user_id', true)::uuid);
DROP POLICY IF EXISTS "tracks_self" ON tracks;
CREATE POLICY "tracks_self" ON tracks FOR ALL USING (user_id = current_setting('app.current_user_id', true)::uuid);
DROP POLICY IF EXISTS "track_genres_self" ON track_genres;
CREATE POLICY "track_genres_self" ON track_genres FOR ALL USING (track_id IN (SELECT id FROM tracks WHERE user_id = current_setting('app.current_user_id', true)::uuid));
DROP POLICY IF EXISTS "track_moods_self" ON track_moods;
CREATE POLICY "track_moods_self" ON track_moods FOR ALL USING (track_id IN (SELECT id FROM tracks WHERE user_id = current_setting('app.current_user_id', true)::uuid));
DROP POLICY IF EXISTS "albums_self" ON albums;
CREATE POLICY "albums_self" ON albums FOR ALL USING (user_id = current_setting('app.current_user_id', true)::uuid);
DROP POLICY IF EXISTS "album_genres_self" ON album_genres;
CREATE POLICY "album_genres_self" ON album_genres FOR ALL USING (album_id IN (SELECT id FROM albums WHERE user_id = current_setting('app.current_user_id', true)::uuid));
DROP POLICY IF EXISTS "album_moods_self" ON album_moods;
CREATE POLICY "album_moods_self" ON album_moods FOR ALL USING (album_id IN (SELECT id FROM albums WHERE user_id = current_setting('app.current_user_id', true)::uuid));
DROP POLICY IF EXISTS "sync_state_self" ON sync_state;
CREATE POLICY "sync_state_self" ON sync_state FOR ALL USING (user_id = current_setting('app.current_user_id', true)::uuid);
DROP POLICY IF EXISTS "user_settings_self" ON user_settings;
CREATE POLICY "user_settings_self" ON user_settings FOR ALL USING (user_id = current_setting('app.current_user_id', true)::uuid);

DROP POLICY IF EXISTS "users_public_read" ON users;
CREATE POLICY "users_public_read" ON users FOR SELECT USING (profile_public = true);

-- =============================================
-- REALTIME
-- =============================================
ALTER TABLE tracks REPLICA IDENTITY FULL;
ALTER TABLE track_genres REPLICA IDENTITY FULL;
ALTER TABLE track_moods REPLICA IDENTITY FULL;
ALTER TABLE albums REPLICA IDENTITY FULL;
ALTER TABLE genres REPLICA IDENTITY FULL;
ALTER TABLE moods REPLICA IDENTITY FULL;

DO $$
BEGIN
    PERFORM 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'tracks';
    IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE tracks; END IF;
    PERFORM 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'track_genres';
    IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE track_genres; END IF;
    PERFORM 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'track_moods';
    IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE track_moods; END IF;
    PERFORM 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'albums';
    IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE albums; END IF;
    PERFORM 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'genres';
    IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE genres; END IF;
    PERFORM 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'moods';
    IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE moods; END IF;
END $$;
