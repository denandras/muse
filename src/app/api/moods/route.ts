import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, mergeRefreshedCookies } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const auth = await getCurrentUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { supabase, user } = auth

  const { data: moods, error } = await supabase
    .from('moods')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch moods', detail: error.message },
      { status: 500 }
    )
  }

  const response = NextResponse.json({ moods: moods ?? [] })
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

  const { name, color, sort_order } = body

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const { data: mood, error } = await supabase
    .from('moods')
    .insert({
      user_id: user.id,
      name: name as string,
      color: (color as string) ?? null,
      sort_order: (sort_order as number) ?? 0,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'A mood with this name already exists' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: 'Failed to create mood', detail: error.message },
      { status: 500 }
    )
  }

  const response = NextResponse.json({ mood }, { status: 201 })
  mergeRefreshedCookies(response, auth.refreshedResponse)
  return response
}