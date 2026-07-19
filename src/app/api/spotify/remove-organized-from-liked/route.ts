import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

interface OrganizedTrack {
  id: string
  spotify_id: string | null
}

export async function POST(request: NextRequest) {
  const auth = await getCurrentUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { supabase, accessToken, user } = auth

  // Find liked tracks that have at least one genre OR one mood assigned.
  // We query tracks with is_liked=true and then filter by existence of
  // a row in track_genres or track_moods for that track.
  const { data: likedTracks, error: likedError } = await supabase
    .from('tracks')
    .select('id, spotify_id')
    .eq('user_id', user.id)
    .eq('is_liked', true)

  if (likedError) {
    return NextResponse.json(
      { error: 'Failed to query liked tracks', detail: likedError.message },
      { status: 500 }
    )
  }

  if (!likedTracks || likedTracks.length === 0) {
    return NextResponse.json({ removed: 0 })
  }

  const trackIds = likedTracks.map((t) => t.id)

  // Fetch genre assignments for these tracks
  const { data: trackGenreRows } = await supabase
    .from('track_genres')
    .select('track_id')
    .in('track_id', trackIds)

  // Fetch mood assignments for these tracks
  const { data: trackMoodRows } = await supabase
    .from('track_moods')
    .select('track_id')
    .in('track_id', trackIds)

  const organizedTrackIds = new Set<string>()
  for (const row of trackGenreRows ?? []) organizedTrackIds.add(row.track_id)
  for (const row of trackMoodRows ?? []) organizedTrackIds.add(row.track_id)

  if (organizedTrackIds.size === 0) {
    return NextResponse.json({ removed: 0 })
  }

  const organizedTracks = likedTracks.filter((t) =>
    organizedTrackIds.has(t.id)
  ) as OrganizedTrack[]

  const spotifyIds = organizedTracks
    .map((t) => t.spotify_id)
    .filter((id): id is string => id !== null)

  // DELETE from Spotify in batches of 50
  const BATCH = 50
  for (let i = 0; i < spotifyIds.length; i += BATCH) {
    const batch = spotifyIds.slice(i, i + BATCH)
    const idsParam = batch.join(',')
    const res = await fetch(
      `https://api.spotify.com/v1/me/tracks?ids=${idsParam}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { error: `Spotify delete error: ${res.status}`, detail: text },
        { status: 502 }
      )
    }
  }

  // Mark is_liked=false in DB
  const { error: updateError } = await supabase
    .from('tracks')
    .update({ is_liked: false })
    .in('id', Array.from(organizedTrackIds))

  if (updateError) {
    return NextResponse.json(
      {
        error: 'Removed from Spotify but failed to update DB',
        detail: updateError.message,
      },
      { status: 500 }
    )
  }

  return NextResponse.json({ removed: organizedTrackIds.size })
}