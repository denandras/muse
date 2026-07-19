import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

const VALID_PLAY_COUNT_WINDOWS = ['all_time', 'this_year', '30d']
const VALID_VIEW_MODES = ['albums', 'tracks', 'both']
const VALID_THEMES = ['dark', 'light']

export async function GET(request: NextRequest) {
  const auth = await getCurrentUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { supabase, user } = auth

  const { data: settings, error } = await supabase
    .from('user_settings')
    .select('play_count_window, default_view_mode, theme')
    .eq('user_id', user.id)
    .single()

  if (error) {
    // No settings row yet — return defaults
    if (error.code === 'PGRST116') {
      return NextResponse.json({
        settings: {
          play_count_window: 'all_time',
          default_view_mode: 'both',
          theme: 'dark',
        },
      })
    }
    return NextResponse.json(
      { error: 'Failed to fetch settings', detail: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ settings })
}

export async function PATCH(request: NextRequest) {
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

  const allowed: Record<string, unknown> = {}
  for (const key of ['play_count_window', 'default_view_mode', 'theme']) {
    if (body[key] !== undefined) {
      allowed[key] = body[key]
    }
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  if (
    allowed.play_count_window !== undefined &&
    !VALID_PLAY_COUNT_WINDOWS.includes(allowed.play_count_window as string)
  ) {
    return NextResponse.json(
      {
        error: `play_count_window must be one of: ${VALID_PLAY_COUNT_WINDOWS.join(', ')}`,
      },
      { status: 400 }
    )
  }

  if (
    allowed.default_view_mode !== undefined &&
    !VALID_VIEW_MODES.includes(allowed.default_view_mode as string)
  ) {
    return NextResponse.json(
      { error: `default_view_mode must be one of: ${VALID_VIEW_MODES.join(', ')}` },
      { status: 400 }
    )
  }

  if (
    allowed.theme !== undefined &&
    !VALID_THEMES.includes(allowed.theme as string)
  ) {
    return NextResponse.json(
      { error: `theme must be one of: ${VALID_THEMES.join(', ')}` },
      { status: 400 }
    )
  }

  const { data: settings, error } = await supabase
    .from('user_settings')
    .upsert(
      { user_id: user.id, ...allowed },
      { onConflict: 'user_id' }
    )
    .select('play_count_window, default_view_mode, theme')
    .single()

  if (error) {
    return NextResponse.json(
      { error: 'Failed to update settings', detail: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ settings })
}