import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const auth = await getCurrentUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { supabase, user } = auth

  let body: { track_id?: string; mood_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { track_id, mood_id } = body
  if (!track_id || !mood_id) {
    return NextResponse.json(
      { error: 'track_id and mood_id are required' },
      { status: 400 }
    )
  }

  const { data: track } = await supabase
    .from('tracks')
    .select('id')
    .eq('id', track_id)
    .eq('user_id', user.id)
    .single()
  if (!track) {
    return NextResponse.json({ error: 'Track not found' }, { status: 404 })
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
    .from('track_moods')
    .upsert({ track_id, mood_id }, { onConflict: 'track_id,mood_id' })
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      { error: 'Failed to assign mood', detail: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ track_mood: data }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const auth = await getCurrentUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { supabase, user } = auth

  const searchParams = request.nextUrl.searchParams
  const track_id = searchParams.get('track_id')
  const mood_id = searchParams.get('mood_id')

  if (!track_id || !mood_id) {
    return NextResponse.json(
      { error: 'track_id and mood_id query params are required' },
      { status: 400 }
    )
  }

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
    .from('track_moods')
    .delete()
    .eq('track_id', track_id)
    .eq('mood_id', mood_id)

  if (error) {
    return NextResponse.json(
      { error: 'Failed to remove mood', detail: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}