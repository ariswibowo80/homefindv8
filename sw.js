// ─────────────────────────────────────────────
//  HomeFind Service Worker
//  Strategy:
//    • HTML / JS / JSON  → Network-first (always fresh, falls back to cache)
//    • Images / Icons    → Cache-first (stable assets, saves bandwidth)
// ─────────────────────────────────────────────

const CACHE = 'homefind-v10';
const STATIC = ['/index.html', '/manifest.json'];

// ── Install: pre-cache static shell ──────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC))
  );
  self.skipWaiting(); // activate immediately, don't wait for old SW to die
});

// ── Activate: wipe ALL old caches ────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => {
        console.log('[SW] Deleting old cache:', k);
        return caches.delete(k);
      }))
    )
  );
  self.clients.claim(); // take control of all open tabs immediately
});

// ── Fetch: smart routing ──────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip non-GET and cross-origin requests (Firebase, Google APIs, CDN)
  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  const isImage = /\.(png|jpg|jpeg|webp|gif|ico|svg)$/i.test(url.pathname);

  if (isImage) {
    // Cache-first for images — stable, saves data
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        });
      })
    );
  } else {
    // Network-first for HTML, JS, JSON — always get latest
    e.respondWith(
      fetch(e.request)
        .then(res => {
          // Cache the fresh response for offline fallback
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => {
          // Network failed → serve from cache (offline mode)
          return caches.match(e.request)
            .then(cached => cached || caches.match('/index.html'));
        })
    );
  }
});

// ── Message: force update from app ───────────
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
