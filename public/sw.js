// public/sw.js
// Service worker — caches the app shell so it loads instantly and works
// offline for cached screens. Uses a cache-first strategy for static
// assets, network-first for API calls (so live data stays fresh).

const CACHE_NAME = 'slvpg-v5';

// Static assets to cache on install — the "app shell".
// Note: manage.html itself is intentionally NOT cached — page navigations
// are always left to the network/browser (see the fetch handler below).
const SHELL_ASSETS = [
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
  '/logo.png',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
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

  // Page navigations (typing a URL, refreshing, following a link) are left
  // entirely to the browser's normal network fetch. Intercepting these
  // ourselves is what caused "redirect mode is not follow" failures —
  // navigation requests carry redirect:"manual", and re-issuing them from
  // inside the service worker breaks if the network response is itself a
  // redirect. Not calling respondWith() here means the browser handles the
  // request exactly as if there were no service worker at all.
  if (event.request.mode === 'navigate') {
    return;
  }

  // Static assets (css/js/images/fonts): serve from cache, fall back to
  // network, then cache the result.
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
