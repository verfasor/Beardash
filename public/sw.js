// Beardash service worker: makes the dashboard installable and lets it open offline.
//
// Rules:
//  - /api/* is NEVER cached or touched: those requests carry API keys in headers.
//  - /preview-frame (the script sandbox) is never cached.
//  - Dashboard pages: network first; the last good copy is kept so the app opens offline.
//  - /assets/* (content-hashed bundles) and /icons/*: cache first, capped so old versions don't pile up.
const CACHE = 'beardash-v2'
const SHELL = '/dashboard'
const MAX_ASSETS = 80

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.add(new Request(SHELL, { cache: 'reload' })))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

async function trim(cache) {
  const keys = (await cache.keys()).filter((r) => new URL(r.url).pathname.startsWith('/assets/'))
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(old)
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/preview-frame')) return

  if (req.mode === 'navigate' && url.pathname.startsWith('/dashboard')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(SHELL, copy))
          }
          return res
        })
        .catch(async () => (await caches.match(SHELL)) || Response.error()),
    )
    return
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then(async (c) => {
                await c.put(req, copy)
                await trim(c)
              })
            }
            return res
          }),
      ),
    )
  }
})
