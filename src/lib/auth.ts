import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from './supabase-server'
import type { User } from './types'

export interface AuthResult {
  user: User
  supabase: typeof supabaseServer
  accessToken: string
  /** The response object if a cookie was refreshed during this call.
   *  Callers that return a NextResponse should copy cookies from this onto
   *  their own response so the refreshed token persists. */
  refreshedResponse: NextResponse | null
}

interface SpotifyMeResponse {
  id: string
  display_name: string | null
  email: string | null
  product: string | null
  images?: Array<{ url: string }>
}

interface TokenRefreshResult {
  access_token: string
  expires_in: number
  refresh_token?: string
}

const ACCESS_TOKEN_COOKIE='spotify_access_token'
const REFRESH_TOKEN_COOKIE='spotify_refresh_token'
const SECURE = process.env.NODE_ENV === 'production'

/**
 * Refreshes an expired access token using the refresh_token cookie.
 * Returns the new token data, or null on failure.
 */
async function refreshAccessToken(
  refreshToken: string
): Promise<TokenRefreshResult | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID!
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })
    if (!res.ok) return null
    return (await res.json()) as TokenRefreshResult
  } catch {
    return null
  }
}

/** Builds a NextResponse that carries the refreshed token cookies. */
function buildRefreshResponse(data: TokenRefreshResult): NextResponse {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(ACCESS_TOKEN_COOKIE, data.access_token, {
    httpOnly: true,
    secure: SECURE,
    sameSite: 'lax',
    maxAge: data.expires_in,
    path: '/',
  })
  if (data.refresh_token) {
    response.cookies.set(REFRESH_TOKEN_COOKIE, data.refresh_token, {
      httpOnly: true,
      secure: SECURE,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    })
  }
  return response
}

/**
 * Authenticates the current request by:
 * 1. Reading the `spotify_access_token` httpOnly cookie.
 * 2. Fetching the Spotify profile via GET /v1/me.
 * 3. If the access token is expired and a refresh token cookie exists,
 *    refreshing it automatically and updating the cookie.
 * 4. Looking up the user in Supabase by spotify_id (service role, bypasses RLS).
 *
 * Returns `{ user, supabase, accessToken, refreshedResponse }` on success,
 * or `null` if not authenticated. If `refreshedResponse` is non-null, the
 * caller should merge its cookies onto their own response.
 */
export async function getCurrentUser(
  request: NextRequest
): Promise<AuthResult | null> {
  let accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value

  if (!accessToken && !refreshToken) return null

  let spotifyProfile: SpotifyMeResponse | null = null
  let refreshedResponse: NextResponse | null = null

  // Try the existing access token first
  if (accessToken) {
    try {
      const res = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (res.ok) {
        spotifyProfile = (await res.json()) as SpotifyMeResponse
      }
    } catch {
      // Network error — fall through to refresh if possible
    }
  }

  // Access token missing or expired — try refresh
  if (!spotifyProfile && refreshToken) {
    const refreshed = await refreshAccessToken(refreshToken)
    if (refreshed) {
      accessToken = refreshed.access_token
      refreshedResponse = buildRefreshResponse(refreshed)

      try {
        const res = await fetch('https://api.spotify.com/v1/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (res.ok) {
          spotifyProfile = (await res.json()) as SpotifyMeResponse
        }
      } catch {
        return null
      }
    }
  }

  if (!spotifyProfile || !accessToken) return null

  const { data: user, error } = await supabaseServer
    .from('users')
    .select(
      'id, spotify_id, display_name, email, avatar_url, spotify_product, profile_public'
    )
    .eq('spotify_id', spotifyProfile.id)
    .single()

  if (error || !user) return null

  return {
    user: user as unknown as User,
    supabase: supabaseServer,
    accessToken,
    refreshedResponse,
  }
}

/**
 * Copies refreshed-session cookies (if any) from `refreshedResponse` onto
 * the caller's response. Use after getCurrentUser when you're returning a
 * NextResponse of your own — otherwise the refreshed access token won't be
 * persisted for the next request.
 */
export function mergeRefreshedCookies(
  response: NextResponse,
  refreshedResponse: NextResponse | null
): void {
  if (!refreshedResponse) return
  const setCookies = refreshedResponse.headers.getSetCookie?.() ?? []
  for (const cookie of setCookies) {
    response.headers.append('set-cookie', cookie)
  }
}