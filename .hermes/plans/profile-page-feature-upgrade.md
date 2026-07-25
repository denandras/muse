# Profile Page Full-Featured Upgrade

## Goal
Transform the public profile page from a read-only view into a rich, interactive browsing experience — with playback (for signed-in users), genre tree filters, mood filters, sorting, and duration filtering. Visitors who aren't signed in see a "Sign in to play" prompt.

## Current State
- `/profile/[userId]` — Server Component, fetches all data via Supabase directly
- `MusicSection.tsx` — Client component with basic tab filtering (All/Liked/Albums/Tracks)
- Genres shown as flat pill list (not a tree, not clickable)
- Moods shown as flat pill list (not clickable)
- No playback, no sort, no duration filter, no search
- No interactive filtering at all (only tab-based category switching)

## Implementation Plan

### 1. Convert profile page to pass full data to a new client-side `ProfileMusicExplorer` component
- The Server Component (`page.tsx`) stays as the data fetcher (Supabase queries)
- Pass `tracks`, `albums`, `genres` (flat with parent_id), `moods` to a new comprehensive client component
- Pass whether the viewer is signed in (check via cookie/API)

### 2. Create `ProfileMusicExplorer.tsx` — the main interactive component
Replaces `MusicSection.tsx`. Includes:

#### a) Playback integration
- Import `usePlayback` from `@/lib/playback`
- Check if user is signed in + has Spotify Premium via `usePlayback()` (spotifyConnected, isPremium)
- Each track row gets a Play button (same style as TrackRow)
- "Play all" button at the top (plays all filtered tracks in order via `playFromList`)
- If NOT signed in: show "Sign in to play" text/button linking to `/api/spotify/auth` where the play button would be
- If signed in but Free tier: show non-Premium banner (same as MiniPlayer)

#### b) Genre tree filter (multi-state, same as dashboard)
- Build tree from flat genre list (same `buildGenreTree` as FilterBar)
- Use `TriStateFilter` component (include/exclude/empty cycle)
- Genres with track_count = 0 are hidden
- Selecting a parent genre includes all descendants (same descendant expansion as library)

#### c) Mood filter (multi-state)
- Use `TriStateFilter` for moods (flat, no hierarchy)
- Moods with track_count = 0 are hidden

#### d) Sort dropdown
- Use `CustomDropdown` component
- Sort options: Title, Artist, Album, Stars, Date added
- Sort direction toggle (asc/desc arrow button)

#### e) Duration filter
- Same dual-thumb slider as FilterBar's `DurationFilter`
- Range scaled to actual min/max track durations in the profile's tracks
- Quick presets: Any, ≤3:00, 3–5 min, 5:00+

#### f) Search
- Simple text search input (title + artist + album_title)

#### g) Star filter
- Same `CustomDropdown` as FilterBar (Any stars, 5, 4+, 3+, 2+, 1+, Unrated)

#### h) Favorites filter
- Heart icon toggle (show favorites only)

### 3. Track/Album rendering
- Reuse `TrackRow` and `AlbumRow` components where possible
- Pass `readOnly={true}` since this is a public profile (no editing)
- Pass `onOpenDetail` as undefined (no detail modal on profile page)
- Tracks inside albums shown via `AlbumRow` expansion (same as library)
- Build `tracksByAlbum` map (same as library page)
- Unified interleaved list (albums + tracks mixed in sort order, same as library)

### 4. Genre/Mood display sections (top of page)
- Genres: show as a collapsible tree (like Genres page), with track counts, but read-only (no add/rename/delete buttons)
- Moods: show as flat list with color dots and track counts
- These sections are informational only — the actual filtering happens in the FilterBar-style controls

### 5. View mode tabs
- Keep the All/Liked/Albums/Tracks tabs but integrate with the new filter system
- Tabs control which item types appear (like the library's ViewModeSwitch)
- Pagination (50 items per page, same as current)

### 6. "Sign in to play" UX
- When not signed in: Play buttons on tracks show a small "▶" but clicking shows a tooltip/badge "Sign in to play"
- "Play all" button replaced with "Sign in to play" link button
- Non-intrusive — the user can still browse, filter, sort, see everything
- The signed-in state is determined by a simple `useEffect` fetch to `/api/auth/session` (returns `{ authenticated: boolean }`)

### 7. Profile page header
- Keep the avatar + name + stats header
- Add a "Sign in to play" hint below the header if not signed in
- Keep "Read-only public profile · Powered by Muse" footer

## Files to create/modify
- `src/app/profile/[userId]/page.tsx` — pass more data to client component
- `src/app/profile/[userId]/ProfileMusicExplorer.tsx` — NEW: replaces MusicSection
- `src/app/profile/[userId]/MusicSection.tsx` — DELETE (replaced by ProfileMusicExplorer)
- Reuse: `src/components/FilterBar.tsx` (TriStateFilter, DurationFilter), `src/components/CustomDropdown.tsx`, `src/components/TrackRow.tsx`, `src/components/AlbumRow.tsx`

## Constraints
- Profile page is a Server Component that fetches data — the interactive part is a client island
- No Supabase writes from the profile page (read-only browsing)
- Playback requires the viewer to be signed in with Spotify Premium
- Must work on mobile (responsive layout, touch-friendly controls)
- Genre tree must be a proper hierarchy (not flat pills)
- All filters must work together (genre AND mood AND stars AND duration AND search AND favorites)