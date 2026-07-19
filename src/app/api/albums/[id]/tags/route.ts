import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

// POST /api/albums/[id]/tags
// Body: { genreIds: string[], moodIds: string[] }
// Reconciles the album's genre and mood assignments to match the given arrays.
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

  const { data: album } = await supabase
    .from('albums')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()
  if (!album) {
    return NextResponse.json({ error: 'Album not found' }, { status: 404 })
  }

  let body: { genreIds?: string[]; moodIds?: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const genreIds = Array.isArray(body.genreIds) ? body.genreIds : []
  const moodIds = Array.isArray(body.moodIds) ? body.moodIds : []

  const [currGenres, currMoods] = await Promise.all([
    supabase.from('album_genres').select('genre_id').eq('album_id', id),
    supabase.from('album_moods').select('mood_id').eq('album_id', id),
  ])

  const currentGenreIds = new Set((currGenres.data ?? []).map((r: { genre_id: string }) => r.genre_id))
  const currentMoodIds = new Set((currMoods.data ?? []).map((r: { mood_id: string }) => r.mood_id))

  const toAddGenres = genreIds.filter((g) => !currentGenreIds.has(g))
  const toRemoveGenres = [...currentGenreIds].filter((g) => !genreIds.includes(g))
  const toAddMoods = moodIds.filter((m) => !currentMoodIds.has(m))
  const toRemoveMoods = [...currentMoodIds].filter((m) => !moodIds.includes(m))

  if (toAddGenres.length > 0) {
    const { data: valid, error: ge } = await supabase
      .from('genres')
      .select('id')
      .in('id', toAddGenres)
      .eq('user_id', user.id)
    if (ge) {
      return NextResponse.json({ error: 'Genre validation failed', detail: ge.message }, { status: 500 })
    }
    const validIds = new Set((valid ?? []).map((g: { id: string }) => g.id))
    const invalid = toAddGenres.filter((g) => !validIds.has(g))
    if (invalid.length > 0) {
      return NextResponse.json({ error: 'Genre not found', detail: { invalid } }, { status: 404 })
    }
  }

  if (toAddMoods.length > 0) {
    const { data: valid, error: me } = await supabase
      .from('moods')
      .select('id')
      .in('id', toAddMoods)
      .eq('user_id', user.id)
    if (me) {
      return NextResponse.json({ error: 'Mood validation failed', detail: me.message }, { status: 500 })
    }
    const validIds = new Set((valid ?? []).map((m: { id: string }) => m.id))
    const invalid = toAddMoods.filter((m) => !validIds.has(m))
    if (invalid.length > 0) {
      return NextResponse.json({ error: 'Mood not found', detail: { invalid } }, { status: 404 })
    }
  }

  const ops: Promise<void>[] = []

  if (toAddGenres.length > 0) {
    ops.push(
      (async () => {
        const r = await supabase
          .from('album_genres')
          .upsert(toAddGenres.map((genre_id) => ({ album_id: id, genre_id })), { onConflict: 'album_id,genre_id' })
        if (r.error) throw r.error
      })()
    )
  }
  if (toRemoveGenres.length > 0) {
    ops.push(
      (async () => {
        const r = await supabase
          .from('album_genres')
          .delete()
          .eq('album_id', id)
          .in('genre_id', toRemoveGenres)
        if (r.error) throw r.error
      })()
    )
  }
  if (toAddMoods.length > 0) {
    ops.push(
      (async () => {
        const r = await supabase
          .from('album_moods')
          .upsert(toAddMoods.map((mood_id) => ({ album_id: id, mood_id })), { onConflict: 'album_id,mood_id' })
        if (r.error) throw r.error
      })()
    )
  }
  if (toRemoveMoods.length > 0) {
    ops.push(
      (async () => {
        const r = await supabase
          .from('album_moods')
          .delete()
          .eq('album_id', id)
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

  await supabase.from('albums').update({ updated_at: new Date().toISOString() }).eq('id', id)

  return NextResponse.json({
    album_id: id,
    genreIds,
    moodIds,
    addedGenres: toAddGenres.length,
    removedGenres: toRemoveGenres.length,
    addedMoods: toAddMoods.length,
    removedMoods: toRemoveMoods.length,
  })
}