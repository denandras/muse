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

const ACCESS_TOKEN_COOKIE = 'spotify_access_token'
const REFRESH_TOKEN_COOKIE = 'spotify_refresh_token'
const USER_ID_COOKIE = 'spotify_user_id'
const SECURE = process.env.NODE_ENV === 'production'
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 // 30 days

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
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    })
  }
  return response
}

/**
 * Authenticates the current request.
 *
 * Session identity is based on the `spotify_user_id` cookie (long-lived,
 * 30 days) + Supabase user lookup. This decouples "is the user logged in"
 * from "does the Spotify access token work" — the access token is only
 * needed for Spotify API calls, not for session validation.
 *
 * The access token is refreshed on-demand if the caller needs it (via
 * `getValidAccessToken`), not during session check.
 *
 * Returns `{ user, supabase, accessToken, refreshedResponse }` on success,
 * or `null` if not authenticated. `accessToken` may be null or expired —
 * callers that need a live Spotify token should call `getValidAccessToken`.
 */
export async function getCurrentUser(
  request: NextRequest
): Promise<AuthResult | null> {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value
  const userIdCookie = request.cookies.get(USER_ID_COOKIE)?.value
  const pendingProfile = request.cookies.get('spotify_pending_profile')?.value

  // Case 1: No identity cookie, but we have a pending profile flag.
  // This happens when the callback skipped /v1/me to avoid timeouts.
  // First check: can we match the user via the access token by trying /v1/me?
  // But before that — if /v1/me is rate-limited, we can't get the ID.
  // However, if there's only ONE user in the database (single-user app),
  // we can just use that user. This is a pragmatic shortcut for now.
  if (!userIdCookie && pendingProfile) {
    // Try /v1/me first
    let profile = await tryFetchProfile(accessToken)

    if (!profile && refreshToken) {
      const refreshed = await refreshAccessToken(refreshToken)
      if (refreshed) {
        profile = await tryFetchProfile(refreshed.access_token)
      }
    }

    if (profile) {
      // Got the profile! Create/upsert user and set up the identity.
      const upsertData: Record<string, string | null> = { spotify_id: profile.id };
      if (profile.display_name) upsertData.display_name = profile.display_name;
      if (profile.email) upsertData.email = profile.email;
      if (profile.images?.[0]?.url) upsertData.avatar_url = profile.images[0].url;
      if (profile.product) upsertData.spotify_product = profile.product;

      const { data: user } = await supabaseServer
        .from('users')
        .upsert(upsertData, { onConflict: 'spotify_id' })
        .select('id, spotify_id, display_name, email, avatar_url, spotify_product, profile_public')
        .single()

      if (!user) return null

      await supabaseServer.from('sync_state').upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true })
      await supabaseServer.from('user_settings').upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true })

      // Upgrade the pending cookie to a real user_id cookie
      const upgradeResponse = NextResponse.json({ ok: true })
      upgradeResponse.cookies.delete('spotify_pending_profile')
      upgradeResponse.cookies.set(USER_ID_COOKIE, profile.id, {
        httpOnly: true,
        secure: SECURE,
        sameSite: 'lax',
        maxAge: COOKIE_MAX_AGE,
        path: '/',
      })

      return {
        user: user as unknown as User,
        supabase: supabaseServer,
        accessToken: accessToken ?? '',
        refreshedResponse: upgradeResponse,
      }
    }

    // /v1/me failed (rate limited, timeout, etc.).
    // Do NOT fall back to grabbing a random user from the database —
    // that would assign someone else's identity to this session.
    // Return null; the caller will see "not authenticated" and the
    // user can retry. The access/refresh token cookies are still set,
    // so the next request will retry /v1/me automatically.
    return null
  }

  // Case 2: No identity at all → not logged in
  if (!userIdCookie) return null

  // Case 3: We have a user_id cookie — look up the user in Supabase.
  // This is the fast path: no Spotify API call needed for session validation.
  const { data: user } = await supabaseServer
    .from('users')
    .select(
      'id, spotify_id, display_name, email, avatar_url, spotify_product, profile_public'
    )
    .eq('spotify_id', userIdCookie)
    .maybeSingle()

  if (!user) {
    // User not in DB but we have the cookie — try to fetch profile and create
    if (!accessToken && !refreshToken) return null

    let profile = await tryFetchProfile(accessToken)
    if (!profile && refreshToken) {
      const refreshed = await refreshAccessToken(refreshToken)
      if (refreshed) {
        profile = await tryFetchProfile(refreshed.access_token)
      }
    }

    if (!profile) return null

    const upsertData: Record<string, string | null> = { spotify_id: profile.id };
    if (profile.display_name) upsertData.display_name = profile.display_name;
    if (profile.email) upsertData.email = profile.email;
    if (profile.images?.[0]?.url) upsertData.avatar_url = profile.images[0].url;
    if (profile.product) upsertData.spotify_product = profile.product;

    const { data: newUser } = await supabaseServer
      .from('users')
      .upsert(upsertData, { onConflict: 'spotify_id' })
      .select('id, spotify_id, display_name, email, avatar_url, spotify_product, profile_public')
      .single()

    if (!newUser) return null

    await supabaseServer.from('sync_state').upsert({ user_id: newUser.id }, { onConflict: 'user_id', ignoreDuplicates: true })
    await supabaseServer.from('user_settings').upsert({ user_id: newUser.id }, { onConflict: 'user_id', ignoreDuplicates: true })

    return {
      user: newUser as unknown as User,
      supabase: supabaseServer,
      accessToken: accessToken ?? '',
      refreshedResponse: null,
    }
  }

  return {
    user: user as unknown as User,
    supabase: supabaseServer,
    accessToken: accessToken ?? '',
    refreshedResponse: null,
  }
}

/** Helper: try fetching /v1/me with a token, returns null on any failure. */
async function tryFetchProfile(token: string | undefined): Promise<SpotifyMeResponse | null> {
  if (!token) return null
  try {
    const res = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    return (await res.json()) as SpotifyMeResponse
  } catch {
    return null
  }
}

/**
 * Returns a valid (non-expired) Spotify access token for the current request.
 * If the current access token is expired, refreshes it using the refresh
 * token and returns the new token along with a `refreshedResponse` that
 * the caller should merge onto their response to persist the new cookie.
 *
 * Use this when you need to make Spotify API calls (not for session checks).
 */
export async function getValidAccessToken(
  request: NextRequest
): Promise<{ token: string | null; refreshedResponse: NextResponse | null }> {
  let accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value

  // No tokens at all
  if (!accessToken && !refreshToken) {
    return { token: null, refreshedResponse: null }
  }

  // If we have an access token, return it. The caller will get a 401 from
  // Spotify if it's expired, and can call refreshAndRetry. We don't
  // pre-validate with /v1/me because that wastes an API call and can
  // trigger rate-limiting.
  if (accessToken) {
    return { token: accessToken, refreshedResponse: null }
  }

  // No access token but we have a refresh token — refresh now
  if (refreshToken) {
    const refreshed = await refreshAccessToken(refreshToken)
    if (refreshed) {
      return {
        token: refreshed.access_token,
        refreshedResponse: buildRefreshResponse(refreshed),
      }
    }
  }

  return { token: null, refreshedResponse: null }
}

/**
 * Refreshes the access token using the refresh_token cookie.
 * Use this when a Spotify API call returns 401 — it returns the new
 * token and a refreshedResponse that the caller should merge onto
 * their response to persist the new cookie.
 */
export async function refreshOn401(
  request: NextRequest
): Promise<{ token: string | null; refreshedResponse: NextResponse | null }> {
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value
  if (!refreshToken) {
    return { token: null, refreshedResponse: null }
  }
  const refreshed = await refreshAccessToken(refreshToken)
  if (refreshed) {
    return {
      token: refreshed.access_token,
      refreshedResponse: buildRefreshResponse(refreshed),
    }
  }
  return { token: null, refreshedResponse: null }
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

/** Cookie name constants for routes that need to set/clear them. */
export const COOKIE_NAMES = {
  ACCESS_TOKEN: ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN: REFRESH_TOKEN_COOKIE,
  USER_ID: USER_ID_COOKIE,
} as const

export { SECURE, COOKIE_MAX_AGE }