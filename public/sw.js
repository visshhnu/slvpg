// public/sw.js
// Service worker — caches the app shell so it loads instantly and works
// offline for cached screens. Uses a cache-first strategy for static
// assets, network-first for API calls (so live data stays fresh).

const CACHE_NAME = 'slvpg-v1';

// Static assets to cache on install — the "app shell"
const SHELL_ASSETS = [
  '/manage.html',
  '/app.js',
  '/dashboard.js',
  '/residents.js',
  '/rent.js',
  '/rooms.js',
  '/expenses.js',
  '/settings.js',
  '/reports.js',
  '/pgs.js',
  '/image-upload.js',
  '/manifest.json',
  '/icon.svg',
];

// Install: pre-cache the app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clear old caches from previous versions
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for static assets, network-first for API calls
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API calls always go to network — we need live data
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'You are offline. Please reconnect.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // Static assets: serve from cache, fall back to network, then cache the result
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
