import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getCurrentUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { supabase, user } = auth
  const { id } = await params

  const { data: track, error } = await supabase
    .from('tracks')
    .select(
      `
      *,
      track_genres(genre_id, genres(id, name, parent_id, depth, sort_order)),
      track_moods(mood_id, moods(id, name, color, sort_order))
    `
    )
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !track) {
    return NextResponse.json({ error: 'Track not found' }, { status: 404 })
  }

  const t = track as Record<string, unknown>
  const result = {
    ...t,
    genres:
      (t.track_genres as Array<{ genres: Record<string, unknown> }>)?.map(
        (g) => g.genres
      ) ?? [],
    moods:
      (t.track_moods as Array<{ moods: Record<string, unknown> }>)?.map(
        (m) => m.moods
      ) ?? [],
    track_genres: undefined,
    track_moods: undefined,
  }

  return NextResponse.json({ track: result })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getCurrentUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { supabase, user } = auth
  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const allowed: Record<string, unknown> = {}
  for (const key of [
    'stars',
    'musical_key',
    'notes',
    'is_favorite',
    'play_count_all_time',
    'play_count_2026',
    'play_count_30d',
    'last_played_at',
    'is_liked',
    'album_title',
    'album_spotify_id',
    'album_cover_url',
    'title',
    'artist',
  ]) {
    if (body[key] !== undefined) {
      allowed[key] = body[key]
    }
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  allowed.updated_at = new Date().toISOString()

  // Validate stars 1-5
  if (allowed.stars !== undefined && allowed.stars !== null) {
    const stars = allowed.stars as number
    if (stars < 1 || stars > 5 || !Number.isInteger(stars)) {
      return NextResponse.json(
        { error: 'stars must be an integer between 1 and 5' },
        { status: 400 }
      )
    }
  }

  const { data: track, error } = await supabase
    .from('tracks')
    .update(allowed)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error || !track) {
    return NextResponse.json(
      { error: 'Failed to update track', detail: error?.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ track })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getCurrentUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { supabase, user } = auth
  const { id } = await params

  const { error } = await supabase
    .from('tracks')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json(
      { error: 'Failed to delete track', detail: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}