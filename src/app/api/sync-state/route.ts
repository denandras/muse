import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const auth = await getCurrentUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { supabase, user } = auth

  const { data: syncState, error } = await supabase
    .from('sync_state')
    .select(
      'liked_tracks_synced_at, saved_albums_synced_at, total_tracks_imported, total_albums_imported'
    )
    .eq('user_id', user.id)
    .single()

  if (error) {
    // No sync state row yet — return defaults
    if (error.code === 'PGRST116') {
      return NextResponse.json({
        sync_state: {
          liked_tracks_synced_at: null,
          saved_albums_synced_at: null,
          total_tracks_imported: 0,
          total_albums_imported: 0,
        },
      })
    }
    return NextResponse.json(
      { error: 'Failed to fetch sync state', detail: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ sync_state: syncState })
}