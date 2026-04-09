// BUILD_ID is replaced at build time by the inline Vite plugin in
// vite.config.ts. Two purposes:
//   1. It gives sw.js a byte-different body on every build, so the
//      browser actually notices there's a new service worker to
//      install. Without this, sw.js is identical across deploys and
//      the browser never updates it — users get stuck forever.
//   2. It's baked into CACHE_NAME below so old caches get cleaned up
//      on activate.
const BUILD_ID = '__BUILD_ID__'
const CACHE_NAME = 'matchpoint-' + BUILD_ID
const API_CACHE_NAME = 'matchpoint-api-' + BUILD_ID

const SHELL_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
]

// Install: cache shell assets. NOTE: we deliberately do NOT call
// skipWaiting() here. We want the new SW to sit in the 'waiting' state
// so the app can show an "update available" prompt and let the user
// decide when to activate it. Auto-activating mid-session can cause
// old-page-running-under-new-SW weirdness.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  )
})

// The app posts { type: 'SKIP_WAITING' } when the user clicks "Reload"
// on the update prompt. That's the only path to activation for an
// update — first-time installs go straight to active because there's
// no previous SW to wait for.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// Activate: clean old caches. Because CACHE_NAME includes BUILD_ID,
// every deploy naturally produces a new cache namespace, and any
// cache whose name doesn't match the current pair gets purged.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== API_CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// Fetch: network-first for API calls, cache-first for assets
self.addEventListener('fetch', (event) => {
  const { request } = event

  // Skip non-GET requests
  if (request.method !== 'GET') return

  // Skip non-http(s) schemes (e.g. chrome-extension://)
  if (!request.url.startsWith('http')) return

  // For Supabase REST GET requests: network-first with cache fallback
  if (request.url.includes('supabase.co') && request.url.includes('/rest/') && request.method === 'GET') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(API_CACHE_NAME).then(cache => cache.put(request, clone))
          }
          return response
        })
        .catch(() => caches.match(request).then(r => r || new Response('{"error":"offline"}', {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })))
    )
    return
  }

  // Skip other Supabase and Anthropic API calls (auth, RPC, etc.)
  if (request.url.includes('supabase.co') || request.url.includes('anthropic.com')) return

  // Skip Google Fonts (they have their own caching)
  if (request.url.includes('fonts.googleapis.com') || request.url.includes('fonts.gstatic.com')) return

  // For navigation requests, serve index.html from cache (SPA routing)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/'))
    )
    return
  }

  // For other assets: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      }).catch(() => cached)

      return cached || fetchPromise
    })
  )
})
