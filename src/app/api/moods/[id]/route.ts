import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

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
  for (const key of ['name', 'color', 'sort_order']) {
    if (body[key] !== undefined) {
      allowed[key] = body[key]
    }
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data: mood, error } = await supabase
    .from('moods')
    .update(allowed)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'A mood with this name already exists' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: 'Failed to update mood', detail: error.message },
      { status: 500 }
    )
  }

  if (!mood) {
    return NextResponse.json({ error: 'Mood not found' }, { status: 404 })
  }

  return NextResponse.json({ mood })
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

  // ON DELETE CASCADE handles track_moods and album_moods
  const { error } = await supabase
    .from('moods')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json(
      { error: 'Failed to delete mood', detail: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}