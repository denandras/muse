import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const auth = await getCurrentUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { supabase, user } = auth

  let body: { track_id?: string; genre_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { track_id, genre_id } = body
  if (!track_id || !genre_id) {
    return NextResponse.json(
      { error: 'track_id and genre_id are required' },
      { status: 400 }
    )
  }

  // Verify ownership of both track and genre
  const { data: track } = await supabase
    .from('tracks')
    .select('id')
    .eq('id', track_id)
    .eq('user_id', user.id)
    .single()
  if (!track) {
    return NextResponse.json({ error: 'Track not found' }, { status: 404 })
  }

  const { data: genre } = await supabase
    .from('genres')
    .select('id')
    .eq('id', genre_id)
    .eq('user_id', user.id)
    .single()
  if (!genre) {
    return NextResponse.json({ error: 'Genre not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('track_genres')
    .upsert({ track_id, genre_id }, { onConflict: 'track_id,genre_id' })
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      { error: 'Failed to assign genre', detail: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ track_genre: data }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const auth = await getCurrentUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { supabase, user } = auth

  // Support both query params (DELETE with body is awkward in fetch)
  const searchParams = request.nextUrl.searchParams
  const track_id = searchParams.get('track_id')
  const genre_id = searchParams.get('genre_id')

  if (!track_id || !genre_id) {
    return NextResponse.json(
      { error: 'track_id and genre_id query params are required' },
      { status: 400 }
    )
  }

  // Verify the track belongs to the user (genre ownership implied via track)
  const { data: track } = await supabase
    .from('tracks')
    .select('id')
    .eq('id', track_id)
    .eq('user_id', user.id)
    .single()
  if (!track) {
    return NextResponse.json({ error: 'Track not found' }, { status: 404 })
  }

  const { error } = await supabase
    .from('track_genres')
    .delete()
    .eq('track_id', track_id)
    .eq('genre_id', genre_id)

  if (error) {
    return NextResponse.json(
      { error: 'Failed to remove genre', detail: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}