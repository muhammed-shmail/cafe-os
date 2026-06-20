/* ChayaOne — minimal service worker for the installable customer PWA.
   Conservative by design: it only handles the /app shell + static assets, and
   lets POS / KDS / dashboard / admin / API requests go straight to the network
   (never cached), so staff surfaces are unaffected. */
const CACHE = 'chayaone-pwa-v1';
const SHELL = ['/app', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isApp = url.pathname === '/app' || url.pathname.startsWith('/app/');
  const isStatic = url.pathname.startsWith('/_next/static') || url.pathname.startsWith('/icons/') ||
    /\.(?:png|jpg|jpeg|svg|webp|gif|ico|woff2?)$/.test(url.pathname);

  // Everything else (POS/KDS/dashboard/admin/api) → straight to network, untouched.
  if (!isApp && !isStatic) return;

  if (isApp) {
    // network-first so the app stays fresh; fall back to cache when offline
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match('/app'))),
    );
  } else {
    // cache-first for immutable static assets
    event.respondWith(
      caches.match(req).then((m) =>
        m ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        }),
      ),
    );
  }
});
