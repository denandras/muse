import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PlaybackProvider } from "@/lib/playback";
import MiniPlayer from "@/components/MiniPlayer";

export const metadata: Metadata = {
  title: "Muse — Music Organizer",
  description: "Organize your Spotify music library with genres, moods, and ratings.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-[#0a0a0a] text-white">
        <PlaybackProvider>
          {children}
          <MiniPlayer />
        </PlaybackProvider>
      </body>
    </html>
  );
}