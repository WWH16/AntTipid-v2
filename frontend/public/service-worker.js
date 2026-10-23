// Offline app shell. Built assets under /assets/ have hashed names, so they're served cache first.
// Everything else (pages, icons, manifest) goes network first and falls back to the cache when offline.
// API calls and other origins (Supabase, Google sign-in) are never cached, so records always come from the server.
const CACHE = 'anttipid-v1'
const SHELL = ['/', '/brand/logo-color.svg']

// File list from Vite's build manifest: every page chunk, so the whole app opens offline.
async function precache() {
  const cache = await caches.open(CACHE)
  const manifest = await (await fetch('/asset-manifest.json')).json()
  const files = Object.values(manifest).flatMap((e) => [e.file, ...(e.css ?? []), ...(e.assets ?? [])])
  await cache.addAll([...SHELL, ...new Set(files.map((f) => `/${f}`))])
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Every route is the same SPA page, so pages are cached under '/'.
async function fromNetwork(request, key) {
  const res = await fetch(request)
  if (res.ok) {
    const copy = res.clone()
    caches.open(CACHE).then((cache) => cache.put(key, copy))
  }
  return res
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return

  const key = request.mode === 'navigate' ? '/' : request
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(request, { ignoreVary: true }).then((hit) => hit || fromNetwork(request, key)))
  } else {
    event.respondWith(fromNetwork(request, key).catch(() => caches.match(key, { ignoreVary: true }).then((hit) => hit || Response.error())))
  }
})
