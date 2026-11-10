const CACHE_NAME = 'fichero-studio-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/main.css',
  './css/controls.css',
  './css/preview.css',
  './js/app.js',
  './js/ui/ui.js',
  './js/state/store.js',
  './js/protocol/escpos.js',
  './js/bluetooth/bleClient.js',
  './js/dithering/ditherEngine.js',
  './js/canvas/viewportManager.js',
  './js/generators/testPatterns.js',
  './js/generators/textRenderer.js',
  './js/generators/barcode.js',
  './js/generators/drawingPad.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});
