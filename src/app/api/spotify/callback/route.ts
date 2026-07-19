import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/?spotify_error=${error}`, request.url));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/?spotify_error=no_code", request.url));
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;
  // Must match the URI used in /api/spotify/auth for Spotify to accept the exchange
  const redirectUri =
    process.env.NODE_ENV === "production"
      ? process.env.SPOTIFY_REDIRECT_URI_PROD!
      : process.env.SPOTIFY_REDIRECT_URI_DEV!;

  // ── Exchange code for tokens ──────────────────────────────────────────────
  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    console.error("[spotify/callback] Token exchange failed:", tokenRes.status, text);
    return NextResponse.redirect(new URL("/?spotify_error=token_exchange", request.url));
  }

  const tokens = await tokenRes.json();
  const accessToken: string = tokens.access_token;
  const refreshToken: string = tokens.refresh_token;

  // ── Fetch Spotify user profile ────────────────────────────────────────────
  const meRes = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!meRes.ok) {
    console.error("[spotify/callback] /v1/me failed:", meRes.status);
    return NextResponse.redirect(new URL("/?spotify_error=profile_fetch", request.url));
  }

  const profile = await meRes.json();
  const spotifyId: string = profile.id;
  const displayName: string | null = profile.display_name ?? null;
  const email: string | null = profile.email ?? null;
  const avatarUrl: string | null = profile.images?.[0]?.url ?? null;
  const spotifyProduct: string | null = profile.product ?? null;

  // ── Upsert user into Supabase (service role bypasses RLS) ─────────────────
  const { data: existingUser } = await supabaseServer
    .from("users")
    .select("id")
    .eq("spotify_id", spotifyId)
    .maybeSingle();

  const isNewUser = !existingUser;

  await supabaseServer
    .from("users")
    .upsert(
      {
        spotify_id: spotifyId,
        display_name: displayName,
        email,
        avatar_url: avatarUrl,
        spotify_product: spotifyProduct,
      },
      { onConflict: "spotify_id" }
    )
    .select("id")
    .single();

  // ── Create sync_state and user_settings rows if new user ──────────────────
  if (isNewUser) {
    // Re-fetch to get the user id (upsert with no PK returns the row, but be safe)
    const { data: userRow } = await supabaseServer
      .from("users")
      .select("id")
      .eq("spotify_id", spotifyId)
      .single();

    if (userRow) {
      await supabaseServer.from("sync_state").insert({ user_id: userRow.id });
      await supabaseServer.from("user_settings").insert({ user_id: userRow.id });
    }
  }

  // ── Set cookies and redirect ──────────────────────────────────────────────
  const response = NextResponse.redirect(new URL("/library", request.url));

  response.cookies.set("spotify_access_token", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: tokens.expires_in, // typically 3600 (1 hour)
    path: "/",
  });

  response.cookies.set("spotify_refresh_token", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: "/",
  });

  // Note: redirect is server-side here. The client-side window.location.href
  // note in the spec applies to post-login flows from client components.
  return response;
}