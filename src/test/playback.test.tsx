import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PlaybackProvider, usePlayback } from '@/lib/playback'

// Test harness component to access the context
function TestConsumer() {
  const playback = usePlayback()
  return (
    <div>
      <div data-testid="is-playing">{String(playback.isPlaying)}</div>
      <div data-testid="spotify-ready">{String(playback.spotifyReady)}</div>
      <div data-testid="spotify-connected">{String(playback.spotifyConnected)}</div>
      <div data-testid="is-premium">{String(playback.isPremium)}</div>
      <div data-testid="current-track">{playback.currentTrackId ?? 'none'}</div>
      <div data-testid="current-title">{playback.currentTrackTitle ?? 'none'}</div>
      <div data-testid="current-artist">{playback.currentTrackArtist ?? 'none'}</div>
      <div data-testid="current-art">{playback.currentTrackAlbumArt ?? 'none'}</div>
      <button onClick={() => playback.play('track-1', 'Test Track', 'spotify:track:1')}>Play</button>
      <button onClick={() => playback.pause()}>Pause</button>
      <button onClick={() => playback.resume()}>Resume</button>
      <button onClick={() => playback.stop()}>Stop</button>
      <button onClick={() => playback.seek(30)}>Seek 30</button>
      <button onClick={() => playback.next()}>Next</button>
      <button onClick={() => playback.previous()}>Previous</button>
      <button onClick={() => playback.setVolume(0.5)}>Set Vol</button>
    </div>
  )
}

describe('PlaybackProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear the DOM
    document.body.innerHTML = ''
    // Reset window.Spotify
    ;(window as any).Spotify = undefined
    ;(window as any).onSpotifyWebPlaybackSDKReady = undefined
  })

  it('provides default playback state', () => {
    render(
      <PlaybackProvider>
        <TestConsumer />
      </PlaybackProvider>
    )

    expect(screen.getByTestId('is-playing').textContent).toBe('false')
    expect(screen.getByTestId('spotify-ready').textContent).toBe('false')
    expect(screen.getByTestId('spotify-connected').textContent).toBe('false')
    expect(screen.getByTestId('is-premium').textContent).toBe('false')
    expect(screen.getByTestId('current-track').textContent).toBe('none')
    expect(screen.getByTestId('current-artist').textContent).toBe('none')
    expect(screen.getByTestId('current-art').textContent).toBe('none')
    expect(screen.getByTestId('queue-length').textContent).toBe('0')
    expect(screen.getByTestId('queue-index').textContent).toBe('0')
  })

  it('throws when usePlayback is used outside provider', () => {
    // Suppress console.error for this test
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<TestConsumer />)).toThrow('usePlayback() must be used inside <PlaybackProvider>')
    spy.mockRestore()
  })

  it('renders children correctly', () => {
    render(
      <PlaybackProvider>
        <div data-testid="child">Hello Muse</div>
      </PlaybackProvider>
    )
    expect(screen.getByTestId('child').textContent).toBe('Hello Muse')
  })
})