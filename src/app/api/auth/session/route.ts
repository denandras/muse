import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, mergeRefreshedCookies } from '@/lib/auth'

/**
 * Lightweight session check endpoint.
 * Returns { authenticated: true, user } when a valid Spotify session exists,
 * or { authenticated: false } when not. Used by the client-side useAuth hook.
 *
 * If the access token was refreshed during this call, the new cookies are
 * merged onto the response so subsequent requests see the updated token.
 */
export async function GET(request: NextRequest) {
  const auth = await getCurrentUser(request)

  if (!auth) {
    return NextResponse.json({ authenticated: false })
  }

  const response = NextResponse.json({
    authenticated: true,
    user: auth.user,
  })
  mergeRefreshedCookies(response, auth.refreshedResponse)
  return response
}