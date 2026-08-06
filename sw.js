const CACHE_NAME = 'god-ae86-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

function isSameOrigin(url) {
  try { return new URL(url).origin === self.location.origin; }
  catch { return false; }
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  // Skip non-GET and range requests (video)
  if (e.request.headers.get('range')) return;

  // For cross-origin API calls: network first, no cache write (CORS issues)
  if (!isSameOrigin(e.request.url)) {
    e.respondWith(
      fetch(e.request).catch(() => 
        caches.match(e.request).then(c => c || new Response(JSON.stringify({error:'offline'}), {
          headers: {'Content-Type':'application/json'}
        }))
      )
    );
    return;
  }

  // For same-origin: cache first, then network
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchPromise = fetch(e.request).then(networkResponse => {
        if (networkResponse && networkResponse.ok) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return networkResponse;
      }).catch(() => cached);
      return cached || fetchPromise || new Response('Offline', {status: 200});
    })
  );
});
