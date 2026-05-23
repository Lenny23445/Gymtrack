/* GymTrack — Service Worker */
const CACHE = 'gymtrack-v1';
const SHELL = [
  './index.html',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

/* ── Install: cache app shell ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

/* ── Activate: clean old caches ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch: Cache-first for app shell, network-first for rest ── */
self.addEventListener('fetch', e => {
  const url = e.request.url;

  /* Always fetch POST/non-GET from network */
  if (e.request.method !== 'GET') return;

  /* Cache-first for known shell files */
  if (SHELL.some(s => url.includes(s.replace('./', '')))) {
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request).then(r2 => {
        const rc = r2.clone();
        caches.open(CACHE).then(c => c.put(e.request, rc));
        return r2;
      }))
    );
    return;
  }

  /* Network-first for everything else */
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
