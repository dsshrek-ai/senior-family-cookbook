const CACHE = 'sfc-v25';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
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
  // Network first for the recipe list specifically, with an empty-recipes
  // fallback when offline. Every other API request -- whoAmI, login,
  // add/update/delete -- is left untouched so a real failure surfaces as a
  // real error. This matters for whoAmI in particular: a fake "success"
  // here would look like a valid (but edit-less) response and incorrectly
  // report canEdit as false instead of leaving auth state alone.
  if (e.request.url.includes('seniorfamily.org/api/')) {
    if (e.request.method === 'GET' && e.request.url.includes('action=getAllRecipes')) {
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
