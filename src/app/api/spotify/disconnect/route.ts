import { NextResponse } from "next/server";

/**
 * Disconnects the user from Spotify by clearing the token cookies.
 */
export async function POST() {
  const response = NextResponse.json({ success: true });

  response.cookies.delete("spotify_access_token");
  response.cookies.delete("spotify_refresh_token");

  return response;
}