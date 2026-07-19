import { NextResponse } from "next/server";

const SCOPES = [
  "streaming",
  "user-modify-playback-state",
  "user-read-playback-state",
  "user-read-currently-playing",
  "user-library-read",
  "user-library-modify",
  "user-read-private",
  "user-read-email",
  "playlist-read-private",
].join(" ");

export async function GET() {
  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  // Use the environment-appropriate redirect URI. In production
  // (NODE_ENV=production) we use the public domain; in dev, localhost.
  const redirectUri =
    process.env.NODE_ENV === "production"
      ? process.env.SPOTIFY_REDIRECT_URI_PROD!
      : process.env.SPOTIFY_REDIRECT_URI_DEV!;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES,
    // show_dialog forces Spotify to always show the consent screen,
    // which ensures a fresh authorization even if the user is already
    // logged in to Spotify with a stale session.
    show_dialog: "true",
  });

  const response = NextResponse.redirect(
    `https://accounts.spotify.com/authorize?${params.toString()}`
  );

  // Clear stale tokens before re-authenticating so the callback
  // starts fresh. Without this, old expired cookies can interfere
  // with the new token flow.
  response.cookies.delete("spotify_access_token");
  response.cookies.delete("spotify_refresh_token");

  return response;
}