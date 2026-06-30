/**
 * sw.js — Service worker para uso offline.
 * Estrategia: stale-while-revalidate (responde desde caché al instante y
 * actualiza en segundo plano). Sube CACHE_VERSION al cambiar los archivos.
 */
var CACHE_VERSION = 'viaje-v1';
var ASSETS = [
  './',
  './index.html',
  './style.css',
  './js/storage.js',
  './js/budget.js',
  './js/ui.js',
  './js/app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(ASSETS);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_VERSION) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.match(req).then(function (cached) {
        var network = fetch(req).then(function (resp) {
          if (resp && resp.status === 200) cache.put(req, resp.clone());
          return resp;
        }).catch(function () {
          // Sin conexión: para navegaciones cae al index cacheado (SPA).
          if (req.mode === 'navigate') return cache.match('./index.html');
          return cached;
        });
        return cached || network;
      });
    })
  );
});
