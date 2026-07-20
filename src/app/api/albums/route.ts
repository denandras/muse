import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, mergeRefreshedCookies } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const auth = await getCurrentUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { supabase, user } = auth

  const sp = request.nextUrl.searchParams
  const favoriteOnly = sp.get('favorite') === 'true'

  let query = supabase
    .from('albums')
    .select(
      `
      *,
      album_genres(genre_id, genres(id, name, parent_id, depth, sort_order)),
      album_moods(mood_id, moods(id, name, color, sort_order))
    `
    )
    .eq('user_id', user.id)

  if (favoriteOnly) query = query.eq('is_favorite', true)

  // Paginate to bypass Supabase's 1000-row default cap.
  const PAGE_SIZE = 1000
  let allAlbums: Record<string, unknown>[] = []
  let offset = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: page, error } = await query
      .order('added_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch albums', detail: error.message },
        { status: 500 }
      )
    }

    allAlbums = allAlbums.concat(page ?? [])
    if (!page || page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  const result = allAlbums.map((a: Record<string, unknown>) => ({
    ...a,
    genres:
      (a.album_genres as Array<{ genres: Record<string, unknown> }>)?.map(
        (g) => g.genres
      ) ?? [],
    moods:
      (a.album_moods as Array<{ moods: Record<string, unknown> }>)?.map(
        (m) => m.moods
      ) ?? [],
    album_genres: undefined,
    album_moods: undefined,
  }))

  const response = NextResponse.json({ albums: result })
  mergeRefreshedCookies(response, auth.refreshedResponse)
  return response
}

export async function POST(request: NextRequest) {
  const auth = await getCurrentUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { supabase, user } = auth

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    spotify_id,
    spotify_uri,
    title,
    artist,
    cover_url,
    release_date,
    album_type,
  } = body

  if (!title || !artist) {
    return NextResponse.json(
      { error: 'title and artist are required' },
      { status: 400 }
    )
  }

  const { data: album, error } = await supabase
    .from('albums')
    .insert({
      user_id: user.id,
      spotify_id: (spotify_id as string) ?? null,
      spotify_uri: (spotify_uri as string) ?? null,
      title: title as string,
      artist: artist as string,
      cover_url: (cover_url as string) ?? null,
      release_date: (release_date as string) ?? null,
      album_type: (album_type as string) ?? null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      { error: 'Failed to create album', detail: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ album }, { status: 201 })
}