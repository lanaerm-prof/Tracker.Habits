/* Service Worker: офлайн-доступ к оболочке приложения (PWA) + уведомления */
const CACHE = 'ritm-tracker-v8';

const SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/icons.js',
  './js/store.js',
  './js/ui.js',
  './js/views.js',
  './js/app.js',
  './fonts/manrope-latin-wght-normal.woff2',
  './fonts/manrope-cyrillic-wght-normal.woff2',
  './manifest.webmanifest',
  './icons/icon.svg?v=2',
  './icons/icon-192.png?v=2',
  './icons/icon-512.png?v=2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Сеть сначала (чтобы обновления подтягивались), кеш как запасной вариант
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || caches.match('./index.html'))
      )
  );
});

/* Клик по уведомлению — открываем/фокусируем приложение */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
      return undefined;
    })
  );
});
