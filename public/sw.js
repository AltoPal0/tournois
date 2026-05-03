// Cache uniquement les assets avec hash de contenu (JS, CSS).
// index.html n'est JAMAIS mis en cache : il change à chaque deploy
// et doit toujours venir du réseau pour pointer les bons bundles.
const CACHE_NAME = 'padel-assets-v3'

self.addEventListener('install', (e) => {
  // Pas de pre-cache : les assets seront mis en cache à la demande
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  // Supprimer tous les anciens caches (padel-v1, padel-v2, etc.)
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  if (e.request.url.includes('supabase.co')) return

  // Navigation (refresh, liens) → réseau direct, Vercel gère le routing SPA
  if (e.request.mode === 'navigate') return

  // Assets JS/CSS avec hash (/assets/index-XXXX.js) → cache-first
  const url = new URL(e.request.url)
  const isHashedAsset = url.pathname.startsWith('/assets/') &&
    /\.(js|css)$/.test(url.pathname)

  if (!isHashedAsset) return

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached
      return fetch(e.request).then(response => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone))
        }
        return response
      })
    })
  )
})
