import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, mergeRefreshedCookies } from '@/lib/auth'

/**
 * POST /api/moods/[id]/merge
 * Body: { target_id: string }
 *
 * Merges the source mood (the [id] in the URL) into the target mood.
 * - Reassigns all track_moods and album_moods rows from source → target
 *   (upsert with onConflict absorbs duplicates — tracks/albums already
 *   tagged with target simply keep their existing row).
 * - Deletes the source mood. ON DELETE CASCADE cleans up residual junction
 *   rows.
 *
 * Moods are flat (no hierarchy), so this is simpler than genre merge.
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
    return NextResponse.json({ error: 'Cannot merge a mood into itself' }, { status: 400 })
  }

  // Fetch both source and target in parallel
  const [sourceRes, targetRes] = await Promise.all([
    supabase.from('moods').select('id, name').eq('id', sourceId).eq('user_id', user.id).single(),
    supabase.from('moods').select('id, name').eq('id', targetId).eq('user_id', user.id).single(),
  ])

  if (sourceRes.error || !sourceRes.data) {
    return NextResponse.json({ error: 'Source mood not found' }, { status: 404 })
  }
  if (targetRes.error || !targetRes.data) {
    return NextResponse.json({ error: 'Target mood not found' }, { status: 404 })
  }

  const source = sourceRes.data
  const target = targetRes.data

  // ── Step 1: Reassign junction rows (source → target) ──

  // track_moods
  const { data: trackMoodRows } = await supabase
    .from('track_moods')
    .select('track_id')
    .eq('mood_id', sourceId)

  if (trackMoodRows && trackMoodRows.length > 0) {
    const upsertRows = trackMoodRows.map((r: { track_id: string }) => ({
      track_id: r.track_id,
      mood_id: targetId,
    }))
    const { error: tmError } = await supabase
      .from('track_moods')
      .upsert(upsertRows, { onConflict: 'track_id,mood_id' })
    if (tmError) {
      return NextResponse.json(
        { error: 'Failed to reassign track moods', detail: tmError.message },
        { status: 500 }
      )
    }
  }

  // album_moods
  const { data: albumMoodRows } = await supabase
    .from('album_moods')
    .select('album_id')
    .eq('mood_id', sourceId)

  if (albumMoodRows && albumMoodRows.length > 0) {
    const upsertRows = albumMoodRows.map((r: { album_id: string }) => ({
      album_id: r.album_id,
      mood_id: targetId,
    }))
    const { error: amError } = await supabase
      .from('album_moods')
      .upsert(upsertRows, { onConflict: 'album_id,mood_id' })
    if (amError) {
      return NextResponse.json(
        { error: 'Failed to reassign album moods', detail: amError.message },
        { status: 500 }
      )
    }
  }

  // ── Step 2: Delete the source mood ──
  const { error: deleteError } = await supabase
    .from('moods')
    .delete()
    .eq('id', sourceId)
    .eq('user_id', user.id)

  if (deleteError) {
    return NextResponse.json(
      { error: 'Failed to delete source mood', detail: deleteError.message },
      { status: 500 }
    )
  }

  const response = NextResponse.json({
    success: true,
    merged: source.name,
    into: target.name,
    target_id: targetId,
    reassignedTracks: trackMoodRows?.length ?? 0,
    reassignedAlbums: albumMoodRows?.length ?? 0,
  })
  mergeRefreshedCookies(response, auth.refreshedResponse)
  return response
}