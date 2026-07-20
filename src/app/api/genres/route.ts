import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, mergeRefreshedCookies } from '@/lib/auth'

const MAX_DEPTH = 15

export async function GET(request: NextRequest) {
  const auth = await getCurrentUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { supabase, user } = auth

  const { data: genres, error } = await supabase
    .from('genres')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch genres', detail: error.message },
      { status: 500 }
    )
  }

  const response = NextResponse.json({ genres: genres ?? [] })
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

  const { name, parent_id, color, sort_order } = body

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  let depth = 0

  if (parent_id) {
    // Look up parent genre to compute depth and validate max depth
    const { data: parent, error: parentError } = await supabase
      .from('genres')
      .select('id, depth, user_id')
      .eq('id', parent_id)
      .single()

    if (parentError || !parent) {
      return NextResponse.json(
        { error: 'Parent genre not found' },
        { status: 400 }
      )
    }

    if (parent.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Parent genre does not belong to current user' },
        { status: 403 }
      )
    }

    depth = (parent.depth as number) + 1

    if (depth >= MAX_DEPTH) {
      return NextResponse.json(
        { error: `Maximum genre depth of ${MAX_DEPTH} levels exceeded` },
        { status: 400 }
      )
    }
  }

  const { data: genre, error } = await supabase
    .from('genres')
    .insert({
      user_id: user.id,
      name: name as string,
      parent_id: (parent_id as string) ?? null,
      depth,
      sort_order: (sort_order as number) ?? 0,
    })
    .select()
    .single()

  if (error) {
    // Unique constraint violation: (user_id, name, parent_id)
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'A genre with this name already exists at this level' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: 'Failed to create genre', detail: error.message },
      { status: 500 }
    )
  }

  const response = NextResponse.json({ genre }, { status: 201 })
  mergeRefreshedCookies(response, auth.refreshedResponse)
  return response
}