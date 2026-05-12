// ── Pitching Chart Service Worker ──
const CACHE = 'pc-v1';
const SHELL = ['/', '/index.html'];

// Install: cache the app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - Supabase API calls → network only, fail silently offline (app handles queue)
// - Everything else → cache first, fall back to network, update cache
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Let Supabase calls go straight to network — don't cache API responses
  if (url.hostname.includes('supabase.co')) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // App shell: cache first, network fallback
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        // Cache successful GET responses for the app shell
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => {
        // Offline and not cached — return the cached index.html as fallback
        return caches.match('/index.html');
      });
    })
  );
});
