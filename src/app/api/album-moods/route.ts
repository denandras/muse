import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, mergeRefreshedCookies } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const auth = await getCurrentUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { supabase, user } = auth

  let body: { album_id?: string; mood_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { album_id, mood_id } = body
  if (!album_id || !mood_id) {
    return NextResponse.json(
      { error: 'album_id and mood_id are required' },
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

  const { data: mood } = await supabase
    .from('moods')
    .select('id')
    .eq('id', mood_id)
    .eq('user_id', user.id)
    .single()
  if (!mood) {
    return NextResponse.json({ error: 'Mood not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('album_moods')
    .upsert({ album_id, mood_id }, { onConflict: 'album_id,mood_id' })
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      { error: 'Failed to assign mood', detail: error.message },
      { status: 500 }
    )
  }

  const response = NextResponse.json({ album_mood: data }, { status: 201 })
  mergeRefreshedCookies(response, auth.refreshedResponse)
  return response
}

export async function DELETE(request: NextRequest) {
  const auth = await getCurrentUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { supabase, user } = auth

  const searchParams = request.nextUrl.searchParams
  const album_id = searchParams.get('album_id')
  const mood_id = searchParams.get('mood_id')

  if (!album_id || !mood_id) {
    return NextResponse.json(
      { error: 'album_id and mood_id query params are required' },
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
    .from('album_moods')
    .delete()
    .eq('album_id', album_id)
    .eq('mood_id', mood_id)

  if (error) {
    return NextResponse.json(
      { error: 'Failed to remove mood', detail: error.message },
      { status: 500 }
    )
  }

  const response = NextResponse.json({ success: true })
  mergeRefreshedCookies(response, auth.refreshedResponse)
  return response
}