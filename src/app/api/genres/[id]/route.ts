import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, mergeRefreshedCookies } from '@/lib/auth'

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

      // Prevent cycles: new parent cannot be the genre itself or any of its descendants
      if (allowed.parent_id === id) {
        return NextResponse.json(
          { error: 'A genre cannot be its own parent' },
          { status: 400 }
        )
      }

      // Check if the new parent is a descendant of this genre
      const { data: allGenresCycle } = await supabase
        .from('genres')
        .select('id, parent_id')
        .eq('user_id', user.id)

      if (allGenresCycle) {
        const descendantIds = new Set<string>([id])
        let changed = true
        while (changed) {
          changed = false
          for (const g of allGenresCycle) {
            if (g.parent_id && descendantIds.has(g.parent_id) && !descendantIds.has(g.id)) {
              descendantIds.add(g.id)
              changed = true
            }
          }
        }
        if (descendantIds.has(allowed.parent_id as string)) {
          return NextResponse.json(
            { error: 'Cannot move a genre under its own descendant — this would create a cycle' },
            { status: 400 }
          )
        }
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

    // Recompute depths for all descendants of the moved genre.
    // We need the new depth of this genre first, then BFS through children.
    const { data: updatedGenre } = await supabase
      .from('genres')
      .update({ depth: allowed.depth })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, depth')
      .single()

    if (updatedGenre) {
      // Fetch all genres for this user to recompute descendant depths
      const { data: allGenres } = await supabase
        .from('genres')
        .select('id, parent_id, depth')
        .eq('user_id', user.id)

      if (allGenres) {
        // BFS from the moved genre
        const genreMap = new Map(allGenres.map(g => [g.id, g]))
        const queue: string[] = [id]
        while (queue.length > 0) {
          const currentId = queue.shift()!
          const currentGenre = genreMap.get(currentId)
          if (!currentGenre) continue
          const currentDepth = currentId === id ? (allowed.depth as number) : currentGenre.depth

          // Find all children
          for (const g of allGenres) {
            if (g.parent_id === currentId && g.id !== id) {
              const childDepth = currentDepth + 1
              if (g.depth !== childDepth) {
                // Update this child's depth
                await supabase
                  .from('genres')
                  .update({ depth: childDepth })
                  .eq('id', g.id)
                  .eq('user_id', user.id)
                g.depth = childDepth // update in-memory
              }
              queue.push(g.id)
            }
          }
        }
      }
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

  const response = NextResponse.json({ genre })
  mergeRefreshedCookies(response, auth.refreshedResponse)
  return response
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

  const response = NextResponse.json({ success: true })
  mergeRefreshedCookies(response, auth.refreshedResponse)
  return response
}