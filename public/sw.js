// public/sw.js
// Service worker — caches the app shell so it loads instantly and works
// offline for cached screens. JS files race the network against a short
// timeout (see the fetch handler below): fast enough, you get the latest
// deploy; too slow or unreachable (weak mobile signal, genuinely offline),
// you get the cached copy immediately instead of the page hanging.
//
// A pure network-first version of this (no timeout) shipped briefly and
// was a real regression: fetch() has no built-in timeout, so on a slow or
// flaky mobile connection every single app .js file could hang waiting on
// the network before the app even started running -- which is exactly the
// "stuck on the logo forever" symptom, and directly worked against this
// app's own offline-first design goal. The timeout race below is what
// fixes that while still keeping deploys effective (see CACHE_NAME below,
// which must be bumped on every deploy that changes a shell asset --
// without that, a stale cached copy would never get replaced at all,
// which was the ORIGINAL bug before that regression).
const CACHE_NAME = 'slvpg-v7';
const JS_NETWORK_TIMEOUT_MS = 3000;

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

// Fetch: network-first for API calls, network-raced-against-timeout for
// .js files, cache-first for everything else (images/manifest/icons)
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

  // App JS files: race the network against a short timeout, falling back
  // to cache immediately if the network doesn't answer in time (or fails
  // outright). This never hands `undefined` to respondWith() -- unlike a
  // bare `.catch(() => caches.match(...))`, which resolves to undefined
  // (and crashes the resource load) if nothing was cached yet -- it always
  // resolves to either a real cached Response or a real network attempt.
  if (url.pathname.endsWith('.js')) {
    event.respondWith((async () => {
      const cached = await caches.match(event.request);
      try {
        const response = await Promise.race([
          fetch(event.request),
          new Promise((_, reject) => setTimeout(() => reject(new Error('sw-fetch-timeout')), JS_NETWORK_TIMEOUT_MS)),
        ]);
        if (response.ok) {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        }
        return response;
      } catch {
        if (cached) return cached;
        return fetch(event.request); // last resort -- let a real offline error surface normally
      }
    })());
    return;
  }

  // Everything else (images/manifest/icons): these rarely change, so
  // cache-first is the right tradeoff -- serve from cache, fall back to
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
