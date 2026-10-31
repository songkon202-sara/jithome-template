const CACHE = 'jithome-20261031a'
// path สัมพัทธ์ — ใช้ได้ทั้ง <user>.github.io/<ชื่อ repo>/ และโดเมนของหน่วยงาน
const OFFLINE_URL = new URL('index.html', self.registration.scope).href

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.add(OFFLINE_URL))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  if (url.origin !== self.location.origin) return

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) { const clone=res.clone(); caches.open(CACHE).then(c => c.put(e.request, clone)) }
        return res
      })
      .catch(() =>
        caches.match(e.request).then(cached => {
          if (cached) return cached
          if (e.request.mode === 'navigate') return caches.match(OFFLINE_URL)
          return new Response('', { status: 503 })
        })
      )
  )
})
