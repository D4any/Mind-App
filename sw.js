/* ═══════════════════════════════════════════════════════════
   SERVICE WORKER — Dual N-Back PWA
   Cache-first strategy for full offline support
   ═══════════════════════════════════════════════════════════ */

const CACHE_NAME = 'dnb-v3';
const ASSETS = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/storage.js',
    '/js/audio.js',
    '/js/game.js',
    '/js/dashboard.js',
    '/js/history.js',
    '/js/ui.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// Install: cache all core assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Fetch strategy:
// - Navigation + core app shell (html/js/css): network-first (prevents stale refresh bugs)
// - External CDN: network-first with cache fallback
// - Other local assets: cache-first
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // For CDN resources (fonts, chart.js, tailwind, lucide), try network first
    if (url.origin !== self.location.origin) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    const isNavigation = event.request.mode === 'navigate';
    const isAppShellAsset = /\.(?:html|js|css)$/.test(url.pathname);

    if (isNavigation || isAppShellAsset) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // For other local assets, cache-first
    event.respondWith(
        caches.match(event.request)
            .then(cached => cached || fetch(event.request).then(response => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return response;
            }))
    );
});
