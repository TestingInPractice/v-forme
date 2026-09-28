const CACHE_NAME = 'fitness-v9';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/css/style.css',
  './src/js/app.js',
  './src/js/modules/db.js',
  './src/js/modules/catalog.js',
  './src/js/modules/admin.js',
  './src/js/modules/settings.js',
  './src/js/modules/music.js',
  './src/js/modules/workout.js',
  './src/js/modules/runner.js',
  './src/js/modules/history.js',
  './src/js/modules/plans.js',
  './src/js/modules/backup.js',
  './src/js/modules/ui.js',
  './src/js/modules/voice.js',
  './data/exercises.js',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './assets/sounds/voice/speak_pullup_5.ogg',
  './assets/sounds/voice/speak_pushup_10.ogg',
  './assets/sounds/voice/speak_squat_15.ogg',
  './assets/sounds/voice/speak_rest_next_pushup.ogg',
  './assets/sounds/voice/speak_rest_next_squat.ogg',
  './assets/sounds/voice/speak_round_done.ogg',
  './assets/sounds/voice/speak_round2_pullup_5.ogg',
  './assets/sounds/voice/speak_round2_pushup_10.ogg',
  './assets/sounds/voice/speak_round2_squat_15.ogg',
  './assets/sounds/voice/speak_round3_pullup_5.ogg',
  './assets/sounds/voice/speak_round3_pushup_10.ogg',
  './assets/sounds/voice/speak_round3_squat_15.ogg',
  './assets/sounds/voice/speak_workout_done.ogg',
  './src/css/og.css',
  './src/js/og/index.js',
  './src/js/og/router.js',
  './src/js/og/store.js',
  './src/js/og/i18n.js',
  './src/js/og/format.js',
  './src/js/og/onerm.js',
  './src/js/og/effort.js',
  './src/js/og/progression.js',
  './src/js/og/historyLogic.js',
  './src/js/og/supersetFlow.js',
  './src/js/og/sessionBuild.js',
  './src/js/og/workoutFinish.js',
  './src/js/og/sound.js',
  './src/js/og/bar.js',
  './src/js/og/coach.js',
  './src/js/og/qr.js',
  './src/js/og/scan.js',
  './src/js/og/favorites.js',
  './src/js/og/equipment.js',
  './src/js/og/backup.js',
  './src/js/og/checkin.js',
  './src/js/og/screens/_workout-core.js',
  './src/js/og/screens/home.js',
  './src/js/og/screens/workout.js',
  './src/js/og/screens/backfill.js',
  './src/js/og/screens/library.js',
  './src/js/og/screens/routines.js',
  './src/js/og/screens/routine-editor.js',
  './src/js/og/screens/stats.js',
  './src/js/og/screens/history.js',
  './src/js/og/screens/settings.js',
  './src/js/og/screens/checkin.js',
  './src/js/og/screens/coach.js',
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
  // Network-first for everything, fallback to cache. no-store: bypass heuristic browser HTTP cache (no Cache-Control on this server)
  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
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
