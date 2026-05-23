/* GymTrack â€” Service Worker */
const CACHE = 'gymtrack-v202605231658';
const SHELL = [
  './index.html',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

/* â”€â”€ Install: cache app shell, dann WARTEN (kein sofortiges skipWaiting) â”€â”€ */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL))
    /* Kein self.skipWaiting() â†’ Update wird erst auf Knopfdruck installiert */
  );
});

/* â”€â”€ Activate: clean old caches â”€â”€ */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* â”€â”€ Message: Update auf Knopfdruck â”€â”€ */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* â”€â”€ Fetch: Cache-first for app shell, network-first for rest â”€â”€ */
self.addEventListener('fetch', e => {
  const url = e.request.url;

  if (e.request.method !== 'GET') return;

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

  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});











