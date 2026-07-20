import Link from "next/link";
import { Music2, Lock } from "lucide-react";
import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase-server";
import type { Track, Album, Genre, Mood } from "@/lib/types";
import MusicSection from "./MusicSection";

interface ProfileData {
  user: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    profile_public: boolean;
  };
  genres: { id: string; name: string; track_count: number }[];
  moods: { id: string; name: string; color: string | null; track_count: number }[];
  totals: { tracks: number; albums: number };
  tracks: Track[];
  albums: Album[];
}

async function getProfileData(userId: string): Promise<ProfileData | null> {
  try {
    // Look up the user by spotify_id (NOT the internal UUID)
    const { data: user, error: userError } = await supabaseServer
      .from("users")
      .select("id, display_name, avatar_url, profile_public")
      .eq("spotify_id", userId)
      .single();

    if (userError || !user) return null;
    if (!user.profile_public) return null;

    // Totals: tracks + albums
    const [tracksCount, albumsCount] = await Promise.all([
      supabaseServer
        .from("tracks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
      supabaseServer
        .from("albums")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
    ]);

    const totals = {
      tracks: tracksCount.count ?? 0,
      albums: albumsCount.count ?? 0,
    };

    // Genres with track counts via track_genres join
    const { data: genresRows } = await supabaseServer
      .from("genres")
      .select("id, name, track_genres(track_id)")
      .eq("user_id", user.id);

    const genres = (genresRows ?? [])
      .map((g: Record<string, unknown>) => ({
        id: g.id as string,
        name: g.name as string,
        track_count:
          (g.track_genres as Array<unknown> | null)?.length ?? 0,
      }))
      .filter((g) => g.track_count > 0)
      .sort((a, b) => b.track_count - a.track_count);

    // Moods with track counts via track_moods join
    const { data: moodsRows } = await supabaseServer
      .from("moods")
      .select("id, name, color, track_moods(track_id)")
      .eq("user_id", user.id);

    const moods = (moodsRows ?? [])
      .map((m: Record<string, unknown>) => ({
        id: m.id as string,
        name: m.name as string,
        color: (m.color as string | null) ?? null,
        track_count:
          (m.track_moods as Array<unknown> | null)?.length ?? 0,
      }))
      .filter((m) => m.track_count > 0)
      .sort((a, b) => b.track_count - a.track_count);

    // Fetch tracks with genre/mood joins (paginated to bypass 1000-row cap)
    const trackFields =
      "id, spotify_id, spotify_uri, title, artist, album_title, album_spotify_id, album_cover_url, duration_ms, track_number, disc_number, is_liked, is_favorite, stars, musical_key, added_at, updated_at, track_genres(genre_id, genres(id, name, parent_id, depth, sort_order)), track_moods(mood_id, moods(id, name, color, sort_order))";
    const allTrackRows: Record<string, unknown>[] = [];
    let trackOffset = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data: trackPage } = await supabaseServer
        .from("tracks")
        .select(trackFields)
        .eq("user_id", user.id)
        .order("added_at", { ascending: false })
        .range(trackOffset, trackOffset + 999);
      if (!trackPage || trackPage.length === 0) break;
      allTrackRows.push(...trackPage);
      if (trackPage.length < 1000) break;
      trackOffset += 1000;
    }

    const tracks: Track[] = allTrackRows.map((t: Record<string, unknown>) => {
      const { track_genres, track_moods, ...rest } = t;
      return {
        ...(rest as unknown as Track),
        genres:
          (track_genres as Array<{ genres: Record<string, unknown> }> | null)?.map(
            (g) => g.genres as unknown as Genre
          ) ?? [],
        moods:
          (track_moods as Array<{ moods: Record<string, unknown> }> | null)?.map(
            (m) => m.moods as unknown as Mood
          ) ?? [],
      };
    });

    // Fetch albums with genre/mood joins (paginated to bypass 1000-row cap)
    const albumFields =
      "id, spotify_id, spotify_uri, title, artist, cover_url, release_date, album_type, stars, notes, is_favorite, added_at, updated_at, album_genres(genre_id, genres(id, name, parent_id, depth, sort_order)), album_moods(mood_id, moods(id, name, color, sort_order))";
    const allAlbumRows: Record<string, unknown>[] = [];
    let albumOffset = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data: albumPage } = await supabaseServer
        .from("albums")
        .select(albumFields)
        .eq("user_id", user.id)
        .order("added_at", { ascending: false })
        .range(albumOffset, albumOffset + 999);
      if (!albumPage || albumPage.length === 0) break;
      allAlbumRows.push(...albumPage);
      if (albumPage.length < 1000) break;
      albumOffset += 1000;
    }

    const albums: Album[] = allAlbumRows.map((a: Record<string, unknown>) => {
      const { album_genres, album_moods, ...rest } = a;
      return {
        ...(rest as unknown as Album),
        genres:
          (album_genres as Array<{ genres: Record<string, unknown> }> | null)?.map(
            (g) => g.genres as unknown as Genre
          ) ?? [],
        moods:
          (album_moods as Array<{ moods: Record<string, unknown> }> | null)?.map(
            (m) => m.moods as unknown as Mood
          ) ?? [],
      };
    });

    return {
      user: {
        id: user.id,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        profile_public: user.profile_public,
      },
      genres,
      moods,
      totals,
      tracks,
      albums,
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ userId: string }>;
}): Promise<Metadata> {
  const { userId } = await params;
  const data = await getProfileData(userId);
  if (!data || !data.user.profile_public) {
    return { title: "Profile · Muse" };
  }
  return {
    title: `${data.user.display_name || "Muse user"} · Muse`,
    description: `Organized music by ${data.user.display_name ?? "this user"}.`,
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const data = await getProfileData(userId);

  if (!data || !data.user.profile_public) {
    return (
      <div className="max-w-2xl mx-auto p-6 sm:p-10 flex flex-col items-center gap-4 text-center">
        <div className="w-14 h-14 rounded-2xl glass flex items-center justify-center">
          <Lock className="text-cream/50" size={22} />
        </div>
        <h1 className="text-lg font-semibold text-cream/90">Private profile</h1>
        <p className="text-sm text-cream/40 max-w-sm">
          This user hasn’t enabled public profile sharing.
        </p>
        <Link
          href="/"
          className="text-sm text-cream/60 hover:text-cream/90 underline underline-offset-4"
        >
          Back to Muse
        </Link>
      </div>
    );
  }

  const { user, genres, moods, totals, tracks, albums } = data;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 flex flex-col gap-6">
      <div className="flex items-center gap-4">
        {user.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatar_url}
            alt=""
            className="w-16 h-16 rounded-full object-cover"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-cream/10 flex items-center justify-center">
            <Music2 size={22} className="text-cream/60" />
          </div>
        )}
        <div>
          <h1 className="text-xl font-semibold text-cream/90">
            {user.display_name || "Muse user"}
          </h1>
          <div className="text-xs text-cream/40 mt-0.5">
            {totals.tracks} tracks · {totals.albums} albums · {genres.length}{" "}
            genres · {moods.length} moods
          </div>
        </div>
      </div>

      <section className="rounded-2xl glass p-5">
        <h2 className="text-xs uppercase tracking-wide text-cream/40 mb-3">
          Genres
        </h2>
        {genres.length === 0 ? (
          <p className="text-sm text-cream/30">No genres.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {genres.map((g) => (
              <span
                key={g.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cream/[0.06] text-xs text-cream/70"
              >
                {g.name}
                <span className="text-cream/30">{g.track_count}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl glass p-5">
        <h2 className="text-xs uppercase tracking-wide text-cream/40 mb-3">
          Moods
        </h2>
        {moods.length === 0 ? (
          <p className="text-sm text-cream/30">No moods.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {moods.map((m) => {
              const color = m.color || "var(--mood-fallback)";
              return (
                <span
                  key={m.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
                  style={{
                    backgroundColor: `${color}22`,
                    color,
                    border: `1px solid ${color}55`,
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  {m.name}
                  <span className="opacity-50">{m.track_count}</span>
                </span>
              );
            })}
          </div>
        )}
      </section>

      <MusicSection tracks={tracks} albums={albums} />

      <p className="text-xs text-cream/30 text-center">
        Read-only public profile · Powered by Muse
      </p>
    </div>
  );
}