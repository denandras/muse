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
  for (const key of ['name', 'parent_id', 'sort_order', 'spotify_playlist_id']) {
    if (body[key] !== undefined) {
      allowed[key] = body[key]
    }
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // If moving parent, recompute depth and check max depth
  if (allowed.parent_id !== undefined) {
    const MAX_DEPTH = 15
    if (allowed.parent_id === null) {
      allowed.depth = 0
    } else {
      const { data: parent, error: parentError } = await supabase
        .from('genres')
        .select('id, depth, user_id')
        .eq('id', allowed.parent_id)
        .single()

      if (parentError || !parent) {
        return NextResponse.json(
          { error: 'Parent genre not found' },
          { status: 400 }
        )
      }

      if (parent.user_id !== user.id) {
        return NextResponse.json(
          { error: 'Parent genre does not belong to current user' },
          { status: 403 }
        )
      }

      // Prevent cycles: new parent cannot be a descendant of this genre
      if (allowed.parent_id === id) {
        return NextResponse.json(
          { error: 'A genre cannot be its own parent' },
          { status: 400 }
        )
      }

      const newDepth = (parent.depth as number) + 1
      if (newDepth >= MAX_DEPTH) {
        return NextResponse.json(
          { error: `Maximum genre depth of ${MAX_DEPTH} levels exceeded` },
          { status: 400 }
        )
      }
      allowed.depth = newDepth
    }
  }

  const { data: genre, error } = await supabase
    .from('genres')
    .update(allowed)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'A genre with this name already exists at this level' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: 'Failed to update genre', detail: error.message },
      { status: 500 }
    )
  }

  if (!genre) {
    return NextResponse.json({ error: 'Genre not found' }, { status: 404 })
  }

  return NextResponse.json({ genre })
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

  // ON DELETE CASCADE handles track_genres, album_genres, and child genres
  const { error } = await supabase
    .from('genres')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json(
      { error: 'Failed to delete genre', detail: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}