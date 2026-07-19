import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, mergeRefreshedCookies } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const auth = await getCurrentUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const response = NextResponse.json({ user: auth.user })
  mergeRefreshedCookies(response, auth.refreshedResponse)
  return response
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
  for (const key of ['profile_public', 'display_name', 'avatar_url']) {
    if (body[key] !== undefined) {
      allowed[key] = body[key]
    }
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // Type-check profile_public
  if (
    allowed.profile_public !== undefined &&
    typeof allowed.profile_public !== 'boolean'
  ) {
    return NextResponse.json(
      { error: 'profile_public must be a boolean' },
      { status: 400 }
    )
  }

  const { data: updatedUser, error } = await supabase
    .from('users')
    .update(allowed)
    .eq('id', user.id)
    .select(
      'id, spotify_id, display_name, email, avatar_url, spotify_product, profile_public'
    )
    .single()

  if (error || !updatedUser) {
    return NextResponse.json(
      { error: 'Failed to update user', detail: error?.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ user: updatedUser })
}