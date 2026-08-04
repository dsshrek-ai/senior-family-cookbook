const CACHE = 'll-v4';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  '../icon-192.png',
  '../icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Network first for API reads, with an empty-recipes fallback when offline.
  // Writes (login/add/update/delete are all POST) are left untouched so a
  // real network failure surfaces as a real error instead of a silently
  // "successful" empty response.
  if (e.request.url.includes('seniorfamily.org/api/')) {
    if (e.request.method === 'GET') {
      e.respondWith(
        fetch(e.request).catch(() => new Response('{"recipes":[]}', { headers: { 'Content-Type': 'application/json' }}))
      );
    }
    return;
  }

  // Cache first for app assets
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// Notify clients when a new version is available
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
