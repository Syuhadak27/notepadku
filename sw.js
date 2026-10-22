/* ============================================================
   Service Worker — Catatan 2.0
   Strategi:
     - Precache seluruh shell & modul saat install
     - Network-first untuk navigasi (fallback cache/offline)
     - Stale-while-revalidate untuk aset lokal
     - Cache lama Catatan Premium dibersihkan saat aktivasi
   ============================================================ */

const CACHE_NAME = 'catatan-shell-v8';

const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './utils.js',
  './icons.js',
  './db.js',
  './backup.js',
  './editor.js',
  './ui.js',
  './modals.js',
  './drawing.js',
  './audio.js',
  './app.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.svg',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch((err) => console.warn('SW: sebagian aset gagal di-precache', err))
  );
  // Tidak skipWaiting otomatis; pengguna memilih lewat banner pembaruan.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && (
            key.startsWith('catatan-') ||
            key.startsWith('catatan-premium-')
          ))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!/^https?:$/.test(url.protocol)) return;

  // Navigasi: network-first, fallback ke cache lalu index offline.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req, { ignoreSearch: true });
          return cached || caches.match('./index.html') || caches.match('./');
        })
    );
    return;
  }

  // Aset statis: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
