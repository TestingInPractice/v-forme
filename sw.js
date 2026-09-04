const CACHE_NAME = 'fitness-v1';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/src/css/style.css',
  '/src/js/app.js',
  '/src/js/modules/db.js',
  '/src/js/modules/settings.js',
  '/src/js/modules/music.js',
  '/src/js/modules/workout.js',
  '/src/js/modules/runner.js',
  '/src/js/modules/history.js',
  '/src/js/modules/ui.js',
  '/data/exercises.js',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Network-first for everything, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
