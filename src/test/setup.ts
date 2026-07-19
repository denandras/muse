// Test setup — runs before all tests
import '@testing-library/jest-dom/vitest'

// Mock fetch with a default 401 response (so Spotify checks fail gracefully)
const defaultFetch = globalThis.fetch
globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
  const urlStr = typeof url === 'string' ? url : url.toString()
  // Return 401 for Spotify token checks by default
  if (urlStr.includes('/api/spotify/token')) {
    return Promise.resolve(new Response(JSON.stringify({ error: 'Not connected' }), { status: 401 }))
  }
  if (urlStr.includes('/api/user')) {
    return Promise.resolve(new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 }))
  }
  // Default: pass through to real fetch (for other URLs)
  return defaultFetch(url, init)
}) as typeof fetch

// Polyfill matchMedia (jsdom doesn't have it)
if (!globalThis.matchMedia) {
  globalThis.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

// Polyfill IntersectionObserver
if (!globalThis.IntersectionObserver) {
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  } as any
}