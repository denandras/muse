import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAMES, SECURE, COOKIE_MAX_AGE } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  // Use forwarded host for correct redirect URL on Vercel
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const origin = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : new URL(request.url).origin;

  if (error) {
    return NextResponse.redirect(new URL(`/?spotify_error=${error}`, origin));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/?spotify_error=no_code", origin));
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;
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
    return NextResponse.redirect(new URL("/?spotify_error=token_exchange", origin));
  }

  const tokens = await tokenRes.json();
  const accessToken: string = tokens.access_token;
  const refreshToken: string = tokens.refresh_token;

  if (!accessToken || !refreshToken) {
    console.error("[spotify/callback] Missing token in exchange response");
    return NextResponse.redirect(new URL("/?spotify_error=token_exchange", origin));
  }

  // ── Set cookies and redirect immediately ───────────────────────────────────
  // NO /v1/me call here — that was causing timeouts on Vercel Hobby (10s limit).
  // The profile fetch and Supabase upsert happen lazily in getCurrentUser
  // when the session is checked on /library.
  const response = NextResponse.redirect(new URL("/library", origin));

  // Set the pending profile cookie — tells getCurrentUser to fetch /v1/me
  // on the first session check and create the user row + spotify_user_id cookie.
  response.cookies.set("spotify_pending_profile", "1", {
    httpOnly: true,
    secure: SECURE,
    sameSite: "lax",
    maxAge: 300, // 5 min
    path: "/",
  });

  response.cookies.set(COOKIE_NAMES.ACCESS_TOKEN, accessToken, {
    httpOnly: true,
    secure: SECURE,
    sameSite: "lax",
    maxAge: tokens.expires_in ?? 3600,
    path: "/",
  });

  response.cookies.set(COOKIE_NAMES.REFRESH_TOKEN, refreshToken, {
    httpOnly: true,
    secure: SECURE,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });

  // Try to fetch /v1/me with a short timeout to get the user ID and set
  // the long-lived spotify_user_id cookie immediately. If this fails
  // (timeout, rate-limit), the pending_profile path in getCurrentUser
  // will handle it on the next session check.
  try {
    const meRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(3000),
    });
    if (meRes.ok) {
      const me = await meRes.json();
      if (me.id) {
        response.cookies.set(COOKIE_NAMES.USER_ID, String(me.id), {
          httpOnly: true,
          secure: SECURE,
          sameSite: "lax",
          maxAge: COOKIE_MAX_AGE,
          path: "/",
        });
        // No longer need the pending profile cookie
        response.cookies.delete("spotify_pending_profile");
      }
    }
  } catch {
    // Timeout or error — pending_profile will handle it lazily
  }

  return response;
}