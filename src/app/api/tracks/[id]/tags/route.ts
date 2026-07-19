import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

// POST /api/tracks/[id]/tags
// Body: { genreIds: string[], moodIds: string[] }
// Reconciles the track's genre and mood assignments to match the given arrays
// (adds missing, removes extra). Idempotent.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getCurrentUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { supabase, user } = auth
  const { id } = await params

  // Verify ownership
  const { data: track } = await supabase
    .from('tracks')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()
  if (!track) {
    return NextResponse.json({ error: 'Track not found' }, { status: 404 })
  }

  let body: { genreIds?: string[]; moodIds?: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const genreIds = Array.isArray(body.genreIds) ? body.genreIds : []
  const moodIds = Array.isArray(body.moodIds) ? body.moodIds : []

  // Fetch current assignments
  const [currGenres, currMoods] = await Promise.all([
    supabase.from('track_genres').select('genre_id').eq('track_id', id),
    supabase.from('track_moods').select('mood_id').eq('track_id', id),
  ])

  const currentGenreIds = new Set((currGenres.data ?? []).map((r: { genre_id: string }) => r.genre_id))
  const currentMoodIds = new Set((currMoods.data ?? []).map((r: { mood_id: string }) => r.mood_id))

  const toAddGenres = genreIds.filter((g) => !currentGenreIds.has(g))
  const toRemoveGenres = [...currentGenreIds].filter((g) => !genreIds.includes(g))
  const toAddMoods = moodIds.filter((m) => !currentMoodIds.has(m))
  const toRemoveMoods = [...currentMoodIds].filter((m) => !moodIds.includes(m))

  // Validate that all referenced genres/moods belong to this user before insert
  if (toAddGenres.length > 0) {
    const { data: validGenres, error: ge } = await supabase
      .from('genres')
      .select('id')
      .in('id', toAddGenres)
      .eq('user_id', user.id)
    if (ge) {
      return NextResponse.json({ error: 'Genre validation failed', detail: ge.message }, { status: 500 })
    }
    const validIds = new Set((validGenres ?? []).map((g: { id: string }) => g.id))
    const invalid = toAddGenres.filter((g) => !validIds.has(g))
    if (invalid.length > 0) {
      return NextResponse.json({ error: 'Genre not found', detail: { invalid } }, { status: 404 })
    }
  }

  if (toAddMoods.length > 0) {
    const { data: validMoods, error: me } = await supabase
      .from('moods')
      .select('id')
      .in('id', toAddMoods)
      .eq('user_id', user.id)
    if (me) {
      return NextResponse.json({ error: 'Mood validation failed', detail: me.message }, { status: 500 })
    }
    const validIds = new Set((validMoods ?? []).map((m: { id: string }) => m.id))
    const invalid = toAddMoods.filter((m) => !validIds.has(m))
    if (invalid.length > 0) {
      return NextResponse.json({ error: 'Mood not found', detail: { invalid } }, { status: 404 })
    }
  }

  // Execute adds and removes in parallel
  const ops: Promise<void>[] = []

  if (toAddGenres.length > 0) {
    ops.push(
      (async () => {
        const r = await supabase
          .from('track_genres')
          .upsert(toAddGenres.map((genre_id) => ({ track_id: id, genre_id })), { onConflict: 'track_id,genre_id' })
        if (r.error) throw r.error
      })()
    )
  }
  if (toRemoveGenres.length > 0) {
    ops.push(
      (async () => {
        const r = await supabase
          .from('track_genres')
          .delete()
          .eq('track_id', id)
          .in('genre_id', toRemoveGenres)
        if (r.error) throw r.error
      })()
    )
  }
  if (toAddMoods.length > 0) {
    ops.push(
      (async () => {
        const r = await supabase
          .from('track_moods')
          .upsert(toAddMoods.map((mood_id) => ({ track_id: id, mood_id })), { onConflict: 'track_id,mood_id' })
        if (r.error) throw r.error
      })()
    )
  }
  if (toRemoveMoods.length > 0) {
    ops.push(
      (async () => {
        const r = await supabase
          .from('track_moods')
          .delete()
          .eq('track_id', id)
          .in('mood_id', toRemoveMoods)
        if (r.error) throw r.error
      })()
    )
  }

  try {
    await Promise.all(ops)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'Tag sync failed', detail: msg }, { status: 500 })
  }

  // Bump updated_at on the track
  await supabase.from('tracks').update({ updated_at: new Date().toISOString() }).eq('id', id)

  return NextResponse.json({
    track_id: id,
    genreIds,
    moodIds,
    addedGenres: toAddGenres.length,
    removedGenres: toRemoveGenres.length,
    addedMoods: toAddMoods.length,
    removedMoods: toRemoveMoods.length,
  })
}