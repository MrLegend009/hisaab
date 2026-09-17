/* Hisaab service worker — makes the app open with ZERO internet.
   Strategy:
   - App shell (page, manifest, icons): cache-first  → instant open offline
   - Google Script API calls: NOT intercepted (the app page handles queueing itself)
   - On 'sync' event (fires when internet returns): wake the app page to push queued entries
*/
var CACHE = 'hisaab-v1';
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

  // Never touch API traffic to Google Scripts — page manages it.
  if (url.hostname.indexOf('script.google.com') !== -1) return;

  if (e.request.method !== 'GET') return;

  // App page navigations: cache-first, fall back to cached page offline
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('./index.html');
      })
    );
    return;
  }

  // Other same-origin assets: cache-first, then network (and cache it)
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

// Ask any open app page to push its queue to the Google Sheet
function nudgeClients() {
  self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(function (cs) {
    cs.forEach(function (c) { c.postMessage({ type: 'TRY_SYNC' }); });
  });
}
self.addEventListener('sync', function (e) {
  if (e.tag === 'hisaab-sync') e.waitUntil(nudgeClients());
});
self.addEventListener('periodicsync', function (e) {
  if (e.tag === 'hisaab-sync') e.waitUntil(nudgeClients());
});
self.addEventListener('message', function (e) {
  if (e.data === 'SYNC_NOW') nudgeClients();
});
