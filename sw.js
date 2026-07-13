/* Atlast service worker — offline app-shell cache.
 *
 * Caches only the STATIC SHELL (the HTML, icons, manifest) so Atlast opens with no
 * network — e.g. in a clinic with no signal. It deliberately does NOT cache data:
 *   - Microsoft sign-in and OneDrive/Graph are cross-origin and always hit the network.
 *   - health-data.json is never cached (data must be live).
 *   - The app's own localStorage cache supplies the last-synced data when offline.
 *
 * Strategy: network-first for the same-origin shell, so a fresh GitHub deploy shows up
 * on the next online load; falls back to the cached shell only when the network fails.
 *
 * Deploy note: this file must be uploaded to GitHub alongside index.html. When the shell
 * changes meaningfully and you want to force old caches out, bump CACHE (v1 -> v2).
 */
const CACHE = 'atlast-shell-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon-32.png',
  './apple-touch-icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
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
  if (req.method !== 'GET') return;                       // never touch writes / auth POSTs

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // OneDrive / Graph / MSAL / CDN -> network only
  if (/health-data.*\.json$/.test(url.pathname)) return;  // data is always live, never cached

  // Network-first for the local shell; fall back to cache offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
