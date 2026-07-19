import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const auth = await getCurrentUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { supabase, user } = auth

  // Query filters: ?liked=true  ?favorite=true
  const sp = request.nextUrl.searchParams
  const likedOnly = sp.get('liked') === 'true'
  const favoriteOnly = sp.get('favorite') === 'true'

  let query = supabase
    .from('tracks')
    .select(
      `
      *,
      track_genres(genre_id, genres(id, name, parent_id, depth, sort_order)),
      track_moods(mood_id, moods(id, name, color, sort_order))
    `
    )
    .eq('user_id', user.id)

  if (likedOnly) query = query.eq('is_liked', true)
  if (favoriteOnly) query = query.eq('is_favorite', true)

  // Supabase caps responses at 1000 rows by default. For users with
  // large libraries (1687+ liked tracks), we need to raise the limit.
  // 10000 is safely above any realistic personal library.
  const { data: tracks, error } = await query
    .order('added_at', { ascending: false })
    .limit(10000)

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch tracks', detail: error.message },
      { status: 500 }
    )
  }

  // Flatten the join structure into a more convenient shape
  const result = (tracks ?? []).map((t: Record<string, unknown>) => ({
    ...t,
    genres: (t.track_genres as Array<{ genres: Record<string, unknown> }>)?.map(
      (g) => g.genres
    ) ?? [],
    moods: (t.track_moods as Array<{ moods: Record<string, unknown> }>)?.map(
      (m) => m.moods
    ) ?? [],
    track_genres: undefined,
    track_moods: undefined,
  }))

  return NextResponse.json({ tracks: result })
}

export async function POST(request: NextRequest) {
  const auth = await getCurrentUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { supabase, user } = auth

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    spotify_id,
    spotify_uri,
    title,
    artist,
    album_title,
    album_spotify_id,
    album_cover_url,
    duration_ms,
  } = body

  if (!title || !artist) {
    return NextResponse.json(
      { error: 'title and artist are required' },
      { status: 400 }
    )
  }

  const { data: track, error } = await supabase
    .from('tracks')
    .insert({
      user_id: user.id,
      spotify_id: (spotify_id as string) ?? null,
      spotify_uri: (spotify_uri as string) ?? null,
      title: title as string,
      artist: artist as string,
      album_title: (album_title as string) ?? null,
      album_spotify_id: (album_spotify_id as string) ?? null,
      album_cover_url: (album_cover_url as string) ?? null,
      duration_ms: (duration_ms as number) ?? null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      { error: 'Failed to create track', detail: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ track }, { status: 201 })
}