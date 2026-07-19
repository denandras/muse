import { NextRequest, NextResponse } from "next/server";

/**
 * Refreshes an expired Spotify access token using the refresh_token cookie.
 * Updates the access_token cookie on success.
 */
export async function GET(request: NextRequest) {
  const refreshToken = request.cookies.get("spotify_refresh_token")?.value;

  if (!refreshToken) {
    return NextResponse.json({ error: "No refresh token" }, { status: 401 });
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
    const text = await res.text();
    console.error("[spotify/refresh] Token refresh failed:", res.status, text);
    return NextResponse.json({ error: "Refresh failed" }, { status: 401 });
  }

  const data = await res.json();

  const response = NextResponse.json({
    access_token: data.access_token,
    expires_in: data.expires_in,
  });

  response.cookies.set("spotify_access_token", data.access_token, {
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