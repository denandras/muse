import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, mergeRefreshedCookies } from '@/lib/auth'
import type { SupabaseClient } from '@supabase/supabase-js'

const MAX_DEPTH = 15

/**
 * POST /api/genres/[id]/merge
 * Body: { target_id: string }
 *
 * Merges the source genre (the [id] in the URL) into the target genre.
 * - Reassigns all track_genres and album_genres rows from source → target
 *   (upsert with onConflict absorbs duplicates — tracks/albums already
 *   tagged with target simply keep their existing row).
 * - Reparents all child genres of source to target.
 * - Recomputes depth for the reparented subtree via BFS.
 * - Deletes the source genre. ON DELETE CASCADE cleans up any residual
 *   junction rows (e.g. where source existed alongside target).
 *
 * The media (tracks/albums) never needs to know — junction IDs are
 * transparent to the M2M relationship.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getCurrentUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { supabase, user } = auth
  const sourceId = await params.then((p) => p.id)

  let body: { target_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const targetId = body.target_id
  if (!targetId || typeof targetId !== 'string') {
    return NextResponse.json({ error: 'target_id is required' }, { status: 400 })
  }

  if (targetId === sourceId) {
    return NextResponse.json({ error: 'Cannot merge a genre into itself' }, { status: 400 })
  }

  // Fetch both source and target in parallel
  const [sourceRes, targetRes] = await Promise.all([
    supabase.from('genres').select('id, name, parent_id, depth').eq('id', sourceId).eq('user_id', user.id).single(),
    supabase.from('genres').select('id, name, parent_id, depth').eq('id', targetId).eq('user_id', user.id).single(),
  ])

  if (sourceRes.error || !sourceRes.data) {
    return NextResponse.json({ error: 'Source genre not found' }, { status: 404 })
  }
  if (targetRes.error || !targetRes.data) {
    return NextResponse.json({ error: 'Target genre not found' }, { status: 404 })
  }

  const source = sourceRes.data
  const target = targetRes.data

  // Prevent merging into a descendant (would create a cycle)
  const descendantIds = await collectDescendantIds(supabase, sourceId, user.id)
  if (descendantIds.has(targetId)) {
    return NextResponse.json(
      { error: 'Cannot merge into a descendant genre — would create a cycle' },
      { status: 400 }
    )
  }

  // ── Step 1: Reassign junction rows (source → target) ──

  // track_genres: upsert rows pointing to target for every track that had source
  const { data: trackGenreRows } = await supabase
    .from('track_genres')
    .select('track_id')
    .eq('genre_id', sourceId)

  if (trackGenreRows && trackGenreRows.length > 0) {
    const upsertRows = trackGenreRows.map((r: { track_id: string }) => ({
      track_id: r.track_id,
      genre_id: targetId,
    }))
    const { error: tgError } = await supabase
      .from('track_genres')
      .upsert(upsertRows, { onConflict: 'track_id,genre_id' })
    if (tgError) {
      return NextResponse.json(
        { error: 'Failed to reassign track genres', detail: tgError.message },
        { status: 500 }
      )
    }
  }

  // album_genres: same pattern
  const { data: albumGenreRows } = await supabase
    .from('album_genres')
    .select('album_id')
    .eq('genre_id', sourceId)

  if (albumGenreRows && albumGenreRows.length > 0) {
    const upsertRows = albumGenreRows.map((r: { album_id: string }) => ({
      album_id: r.album_id,
      genre_id: targetId,
    }))
    const { error: agError } = await supabase
      .from('album_genres')
      .upsert(upsertRows, { onConflict: 'album_id,genre_id' })
    if (agError) {
      return NextResponse.json(
        { error: 'Failed to reassign album genres', detail: agError.message },
        { status: 500 }
      )
    }
  }

  // ── Step 2: Reparent source's children to target ──

  const { data: children } = await supabase
    .from('genres')
    .select('id, depth')
    .eq('parent_id', sourceId)
    .eq('user_id', user.id)

  let reparentedCount = 0
  if (children && children.length > 0) {
    const childNewDepth = (target.depth as number) + 1
    if (childNewDepth >= MAX_DEPTH) {
      return NextResponse.json(
        { error: `Merging would exceed maximum depth of ${MAX_DEPTH} levels (target is already at depth ${target.depth})` },
        { status: 400 }
      )
    }

    // Reparent all direct children to target
    const { error: reparentError } = await supabase
      .from('genres')
      .update({ parent_id: targetId, depth: childNewDepth })
      .eq('parent_id', sourceId)
      .eq('user_id', user.id)

    if (reparentError) {
      return NextResponse.json(
        { error: 'Failed to reparent child genres', detail: reparentError.message },
        { status: 500 }
      )
    }

    reparentedCount = children.length

    // Recompute depths for all descendants of each reparented child
    for (const child of children) {
      await recomputeSubtreeDepths(supabase, child.id as string, user.id, childNewDepth)
    }
  }

  // ── Step 3: Delete the source genre ──
  // ON DELETE CASCADE removes any residual junction rows (e.g. where a track
  // had both source and target — the upsert above already created the target
  // row, so the source row is now a duplicate that CASCADE removes).
  const { error: deleteError } = await supabase
    .from('genres')
    .delete()
    .eq('id', sourceId)
    .eq('user_id', user.id)

  if (deleteError) {
    return NextResponse.json(
      { error: 'Failed to delete source genre', detail: deleteError.message },
      { status: 500 }
    )
  }

  const response = NextResponse.json({
    success: true,
    merged: source.name,
    into: target.name,
    target_id: targetId,
    reassignedTracks: trackGenreRows?.length ?? 0,
    reassignedAlbums: albumGenreRows?.length ?? 0,
    reparentedChildren: reparentedCount,
  })
  mergeRefreshedCookies(response, auth.refreshedResponse)
  return response
}

/**
 * Collect all descendant genre IDs of the given genre (not including itself).
 * Uses iterative BFS.
 */
async function collectDescendantIds(
  supabase: SupabaseClient,
  rootId: string,
  userId: string
): Promise<Set<string>> {
  const ids = new Set<string>()
  let queue = [rootId]
  while (queue.length > 0) {
    const { data: children } = await supabase
      .from('genres')
      .select('id')
      .eq('parent_id', queue[0])
      .eq('user_id', userId)
    queue.shift()
    if (children) {
      for (const c of children) {
        if (!ids.has(c.id)) {
          ids.add(c.id)
          queue.push(c.id)
        }
      }
    }
  }
  return ids
}

/**
 * Recompute depths for all descendants of `rootId` using BFS.
 * `rootNewDepth` is the new depth of the root's direct children.
 */
async function recomputeSubtreeDepths(
  supabase: SupabaseClient,
  rootId: string,
  _userId: string,
  rootChildDepth: number
): Promise<void> {
  let queue: string[] = [rootId]
  const visited = new Set<string>()
  let currentChildDepth = rootChildDepth

  while (queue.length > 0) {
    const nextQueue: string[] = []
    for (const nodeId of queue) {
      if (visited.has(nodeId)) continue
      visited.add(nodeId)

      const { data: children } = await supabase
        .from('genres')
        .select('id')
        .eq('parent_id', nodeId)

      if (children) {
        for (const c of children) {
          // Update this child's depth
          await supabase
            .from('genres')
            .update({ depth: currentChildDepth })
            .eq('id', c.id)
          nextQueue.push(c.id)
        }
      }
    }
    queue = nextQueue
    currentChildDepth++
  }
}