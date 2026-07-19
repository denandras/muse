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

  const { data: album, error } = await supabase
    .from('albums')
    .select(
      `
      *,
      album_genres(genre_id, genres(id, name, parent_id, depth, sort_order)),
      album_moods(mood_id, moods(id, name, color, sort_order))
    `
    )
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !album) {
    return NextResponse.json({ error: 'Album not found' }, { status: 404 })
  }

  const a = album as Record<string, unknown>
  const result = {
    ...a,
    genres:
      (a.album_genres as Array<{ genres: Record<string, unknown> }>)?.map(
        (g) => g.genres
      ) ?? [],
    moods:
      (a.album_moods as Array<{ moods: Record<string, unknown> }>)?.map(
        (m) => m.moods
      ) ?? [],
    album_genres: undefined,
    album_moods: undefined,
  }

  return NextResponse.json({ album: result })
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
    'notes',
    'is_favorite',
    'title',
    'artist',
    'cover_url',
    'release_date',
    'album_type',
  ]) {
    if (body[key] !== undefined) {
      allowed[key] = body[key]
    }
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  allowed.updated_at = new Date().toISOString()

  if (allowed.stars !== undefined && allowed.stars !== null) {
    const stars = allowed.stars as number
    if (stars < 1 || stars > 5 || !Number.isInteger(stars)) {
      return NextResponse.json(
        { error: 'stars must be an integer between 1 and 5' },
        { status: 400 }
      )
    }
  }

  const { data: album, error } = await supabase
    .from('albums')
    .update(allowed)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error || !album) {
    return NextResponse.json(
      { error: 'Failed to update album', detail: error?.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ album })
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
    .from('albums')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json(
      { error: 'Failed to delete album', detail: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}