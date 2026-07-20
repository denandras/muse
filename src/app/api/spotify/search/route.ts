import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, getValidAccessToken } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const auth = await getCurrentUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { token: accessToken } = await getValidAccessToken(request)
  if (!accessToken) {
    return NextResponse.json({ error: 'Spotify token expired' }, { status: 401 })
  }
  const searchParams = request.nextUrl.searchParams
  const q = searchParams.get('q')
  const type = searchParams.get('type') ?? 'tracks,albums'

  if (!q || q.trim().length === 0) {
    return NextResponse.json(
      { error: 'Missing required query parameter: q' },
      { status: 400 }
    )
  }

  const params = new URLSearchParams({
    q,
    type,
    limit: '20',
  })

  const res = await fetch(
    `https://api.spotify.com/v1/search?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json(
      { error: `Spotify API error: ${res.status}`, detail: text },
      { status: 502 }
    )
  }

  const data = await res.json()
  return NextResponse.json(data)
}