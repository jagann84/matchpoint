const CACHE_NAME = 'matchpoint-v1'
const SHELL_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
]

// Install: cache shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  )
  self.skipWaiting()
})

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== 'matchpoint-api-v1').map((k) => caches.delete(k)))
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
            caches.open('matchpoint-api-v1').then(cache => cache.put(request, clone))
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
