// sw.js — Caches only the static app shell (HTML/CSS/JS). Deliberately
// does NOT cache Open Food Facts responses: product data should always
// be fetched fresh, and if the tablet is offline the add-item flow will
// simply fall back to manual entry (handled in app.js).

// sw.js — Caches only the static app shell.
const CACHE_NAME = 'fridge-tracker-shell-v4';

const SHELL_FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/db.js',
  './js/openFoodFacts.js',
  './js/scanner.js',
  './js/recommend.js',
  './js/app.js',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use addAll, but ensure we don't try to cache non-existent or absolute paths
      return cache.addAll(SHELL_FILES).catch(err => {
        console.error('Cache addAll failed', err);
      });
    })
  );
  self.skipWaiting();
});
// ... rest of sw.js ...

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin GET requests for shell files.
  // Everything else (Open Food Facts API, the html5-qrcode CDN script)
  // goes straight to the network, untouched.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
