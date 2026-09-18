/* Hisaab v2 service worker — offline shell + sync nudge */
var CACHE = 'hisaab-v4-shell';
var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); })
    .then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);

  // never touch traffic to Google — the app manages its own verified sync
  if (url.hostname.indexOf('script.google.com') !== -1) return;
  if (e.request.method !== 'GET') return;

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
        return res;
      }).catch(function () { return caches.match('./index.html'); })
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (res) {
        if (res.ok && url.origin === location.origin) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      });
    })
  );
});

function nudge() {
  self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(function (cs) {
    cs.forEach(function (c) { c.postMessage({ type: 'TRY_SYNC' }); });
  });
}
self.addEventListener('sync', function (e) { if (e.tag === 'hisaab-sync') e.waitUntil(nudge()); });
self.addEventListener('periodicsync', function (e) { if (e.tag === 'hisaab-sync') e.waitUntil(nudge()); });
self.addEventListener('message', function (e) { if (e.data === 'SYNC_NOW') nudge(); });
