import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const auth = await getCurrentUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { supabase, user } = auth

  let body: { album_id?: string; genre_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { album_id, genre_id } = body
  if (!album_id || !genre_id) {
    return NextResponse.json(
      { error: 'album_id and genre_id are required' },
      { status: 400 }
    )
  }

  const { data: album } = await supabase
    .from('albums')
    .select('id')
    .eq('id', album_id)
    .eq('user_id', user.id)
    .single()
  if (!album) {
    return NextResponse.json({ error: 'Album not found' }, { status: 404 })
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
    .from('album_genres')
    .upsert({ album_id, genre_id }, { onConflict: 'album_id,genre_id' })
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      { error: 'Failed to assign genre', detail: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ album_genre: data }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const auth = await getCurrentUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { supabase, user } = auth

  const searchParams = request.nextUrl.searchParams
  const album_id = searchParams.get('album_id')
  const genre_id = searchParams.get('genre_id')

  if (!album_id || !genre_id) {
    return NextResponse.json(
      { error: 'album_id and genre_id query params are required' },
      { status: 400 }
    )
  }

  const { data: album } = await supabase
    .from('albums')
    .select('id')
    .eq('id', album_id)
    .eq('user_id', user.id)
    .single()
  if (!album) {
    return NextResponse.json({ error: 'Album not found' }, { status: 404 })
  }

  const { error } = await supabase
    .from('album_genres')
    .delete()
    .eq('album_id', album_id)
    .eq('genre_id', genre_id)

  if (error) {
    return NextResponse.json(
      { error: 'Failed to remove genre', detail: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}