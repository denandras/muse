import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, getValidAccessToken, mergeRefreshedCookies } from '@/lib/auth'

/**
 * Removes a single track from the user's Spotify "Liked Songs" by calling
 * DELETE /v1/me/tracks on the Spotify Web API, and updates the local
 * `is_liked` flag to false so the UI reflects the change immediately.
 *
 * Body: { track_id: string }  (the Muse internal track UUID)
 */
export async function DELETE(request: NextRequest) {
  const auth = await getCurrentUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { supabase, user } = auth

  const { token: accessToken, refreshedResponse: tokenRefresh } = await getValidAccessToken(request)
  if (!accessToken) {
    return NextResponse.json({ error: 'Spotify token expired' }, { status: 401 })
  }

  // Parse the track id from the URL search params (?track_id=...) for a DELETE
  // — DELETE bodies are awkward to send from fetch in the browser.
  const trackId = request.nextUrl.searchParams.get('track_id')
  if (!trackId) {
    return NextResponse.json(
      { error: 'Missing track_id query parameter' },
      { status: 400 }
    )
  }

  // Fetch the track to get its spotify_id
  const { data: track, error: trackError } = await supabase
    .from('tracks')
    .select('id, spotify_id, is_liked')
    .eq('id', trackId)
    .eq('user_id', user.id)
    .single()

  if (trackError || !track) {
    return NextResponse.json({ error: 'Track not found' }, { status: 404 })
  }

  if (!track.spotify_id) {
    return NextResponse.json(
      { error: 'Track has no Spotify id; cannot remove from Liked Songs' },
      { status: 400 }
    )
  }

  if (!track.is_liked) {
    // Already not liked — idempotent success.
    const response = NextResponse.json({ ok: true, already: true })
    mergeRefreshedCookies(response, tokenRefresh)
    return response
  }

  // DELETE from Spotify Liked Songs
  const res = await fetch(
    `https://api.spotify.com/v1/me/tracks?ids=${track.spotify_id}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!res.ok) {
    const text = await res.text()
    const response = NextResponse.json(
      { error: `Spotify delete error: ${res.status}`, detail: text },
      { status: 502 }
    )
    mergeRefreshedCookies(response, tokenRefresh)
    return response
  }

  // Update local DB — flip is_liked to false
  const { error: updateError } = await supabase
    .from('tracks')
    .update({ is_liked: false })
    .eq('id', trackId)
    .eq('user_id', user.id)

  if (updateError) {
    const response = NextResponse.json(
      {
        error: 'Removed from Spotify but failed to update DB',
        detail: updateError.message,
      },
      { status: 500 }
    )
    mergeRefreshedCookies(response, tokenRefresh)
    return response
  }

  const response = NextResponse.json({ ok: true })
  mergeRefreshedCookies(response, tokenRefresh)
  return response
}