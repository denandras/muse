import { NextRequest, NextResponse } from "next/server";

/**
 * Returns the current Spotify user access token to the client.
 * The access token is stored in an httpOnly cookie, so the client
 * cannot read it directly. This endpoint proxies it.
 *
 * CRITICAL: This route is called frequently — by the SDK's
 * getOAuthToken callback (every ~60s internally + on demand), by the
 * 5-second readiness poll, and by play/playAlbum. Pre-validating with
 * /v1/me on every call causes 429 rate-limiting from Spotify, which
 * silently kills audio playback on desktop (the SDK can't get a token
 * → audio stops, but no player_state_changed fires → UI still shows
 * "playing").
 *
 * Instead: return the cookie token as-is (no pre-validation). The
 * token has a 1-hour TTL; it's almost always valid. If it's expired,
 * the SDK fires `authentication_error` and the client re-inits with a
 * refreshed token.
 */
export async function GET(request: NextRequest) {
  let accessToken = request.cookies.get("spotify_access_token")?.value;
  const refreshToken = request.cookies.get("spotify_refresh_token")?.value;

  if (!accessToken && !refreshToken) {
    return NextResponse.json({ error: "Not connected to Spotify" }, { status: 401 });
  }

  // Return the cookie token as-is — no /v1/me pre-validation.
  if (accessToken) {
    return NextResponse.json({ access_token: accessToken });
  }

  // No access token — try refreshing with the refresh token
  if (!refreshToken) {
    return NextResponse.json({ error: "No refresh token available" }, { status: 401 });
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Token refresh failed" }, { status: 401 });
  }

  const data = await res.json();
  accessToken = data.access_token;

  const response = NextResponse.json({
    access_token: accessToken,
    expires_in: data.expires_in,
  });

  response.cookies.set("spotify_access_token", accessToken!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: data.expires_in,
    path: "/",
  });

  if (data.refresh_token) {
    response.cookies.set("spotify_refresh_token", data.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });
  }

  return response;
}