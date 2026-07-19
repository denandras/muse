import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js 16 proxy (formerly middleware.ts).
 * Protects authenticated routes by checking the spotify_access_token cookie.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("spotify_access_token")?.value;

  // Allow Spotify OAuth endpoints without auth
  const isAuthEndpoint =
    pathname === "/api/spotify/auth" || pathname === "/api/spotify/callback";

  if (isAuthEndpoint) {
    return NextResponse.next();
  }

  // Protected routes — redirect to / if no token
  if (!token) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/library/:path*",
    "/genres/:path*",
    "/moods/:path*",
    "/settings/:path*",
    "/api/spotify/token",
    "/api/spotify/refresh",
    "/api/spotify/disconnect",
  ],
};