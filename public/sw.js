const CACHE_NAME = 'padel-v2'
const STATIC_ASSETS = ['/', '/index.html']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  // Laisser passer les requêtes Supabase (API + WebSocket)
  if (e.request.url.includes('supabase.co')) return
  if (e.request.method !== 'GET') return

  // Requêtes de navigation (refresh page, liens) → servir index.html depuis le cache
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match('/index.html').then(cached => cached ?? fetch(e.request))
    )
    return
  }

  // Assets statiques → cache first
  e.respondWith(
    caches.match(e.request).then(cached => cached ?? fetch(e.request))
  )
})
