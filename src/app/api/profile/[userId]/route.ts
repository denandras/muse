import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }

  // Look up the user by spotify_id (not the internal UUID)
  const { data: user, error: userError } = await supabaseServer
    .from('users')
    .select('id, display_name, avatar_url, profile_public')
    .eq('spotify_id', userId)
    .single()

  if (userError || !user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (!user.profile_public) {
    return NextResponse.json({ error: 'Profile is private' }, { status: 404 })
  }

  // Totals: tracks + albums
  const [tracksCount, albumsCount] = await Promise.all([
    supabaseServer
      .from('tracks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabaseServer
      .from('albums')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
  ])

  const totals = {
    tracks: tracksCount.count ?? 0,
    albums: albumsCount.count ?? 0,
  }

  // Genres with track counts via track_genres join
  const { data: genresRows } = await supabaseServer
    .from('genres')
    .select('id, name, track_genres(track_id)')
    .eq('user_id', user.id)

  const genres = (genresRows ?? [])
    .map((g: Record<string, unknown>) => ({
      id: g.id as string,
      name: g.name as string,
      track_count: (g.track_genres as Array<unknown> | null)?.length ?? 0,
    }))
    .filter((g) => g.track_count > 0)
    .sort((a, b) => b.track_count - a.track_count)

  // Moods with track counts via track_moods join
  const { data: moodsRows } = await supabaseServer
    .from('moods')
    .select('id, name, color, track_moods(track_id)')
    .eq('user_id', user.id)

  const moods = (moodsRows ?? [])
    .map((m: Record<string, unknown>) => ({
      id: m.id as string,
      name: m.name as string,
      color: (m.color as string | null) ?? null,
      track_count: (m.track_moods as Array<unknown> | null)?.length ?? 0,
    }))
    .filter((m) => m.track_count > 0)
    .sort((a, b) => b.track_count - a.track_count)

  return NextResponse.json({
    user: {
      id: user.id,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      profile_public: user.profile_public,
    },
    genres,
    moods,
    totals,
  })
}