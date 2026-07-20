import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PlaybackProvider } from "@/lib/playback";
import MiniPlayer from "@/components/MiniPlayer";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Muse — Music Organizer",
  description: "Organize your Spotify music library with genres, moods, and ratings.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#181614",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-base text-cream">
        <PlaybackProvider>
          <AppShell>{children}</AppShell>
          <MiniPlayer />
        </PlaybackProvider>
      </body>
    </html>
  );
}