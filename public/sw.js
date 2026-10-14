/*
 * StreetData service worker: makes the app installable and lets it open
 * without a connection. Only the app itself is cached; streets, parcels, map
 * tiles and searches always come from the network.
 */
const VERSION = 'streetdata-v1';
const SHELL = ['./', 'index.html', 'favicon.svg', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  let request = event.request;
  if (request.method !== 'GET') return;
  let url = new URL(request.url);

  if (request.mode === 'navigate') {
    // Pages: newest version first, the saved copy when offline.
    event.respondWith(fetch(request).then(response => {
      if (response.ok) {
        let copy = response.clone();
        caches.open(VERSION).then(cache => cache.put('index.html', copy));
      }
      return response;
    }).catch(() => caches.match('index.html')));
    return;
  }

  let sameOrigin = url.origin === self.location.origin;
  if (sameOrigin && url.pathname.includes('/api/')) return;

  if (sameOrigin || FONT_HOSTS.includes(url.hostname)) {
    // Built files have a hash in their name, so a cached copy never goes stale.
    event.respondWith(caches.match(request).then(cached => {
      let network = fetch(request).then(response => {
        if (response.ok || response.type === 'opaque') {
          let copy = response.clone();
          caches.open(VERSION).then(cache => cache.put(request, copy));
        }
        return response;
      });
      if (!cached) return network;
      network.catch(() => {}); // offline: the cached copy is enough
      return cached;
    }));
  }
});
