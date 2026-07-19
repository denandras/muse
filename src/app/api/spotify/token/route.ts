import { NextRequest, NextResponse } from "next/server";

/**
 * Returns the current Spotify user access token to the client.
 * The access token is stored in an httpOnly cookie, so the client
 * cannot read it directly. This endpoint proxies it.
 *
 * If the token is expired (checked via /v1/me), it auto-refreshes
 * using the refresh token cookie and updates the cookie.
 */
export async function GET(request: NextRequest) {
  let accessToken = request.cookies.get("spotify_access_token")?.value;
  const refreshToken = request.cookies.get("spotify_refresh_token")?.value;

  if (!accessToken && !refreshToken) {
    return NextResponse.json({ error: "Not connected to Spotify" }, { status: 401 });
  }

  // If we have an access token, check if it's still valid
  if (accessToken) {
    const checkRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (checkRes.ok) {
      return NextResponse.json({ access_token: accessToken });
    }
    // Token expired — fall through to refresh
  }

  if (!refreshToken) {
    return NextResponse.json({ error: "No refresh token available" }, { status: 401 });
  }

  // Refresh the token
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