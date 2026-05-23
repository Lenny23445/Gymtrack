/* GymTrack — Service Worker */
const CACHE = 'gymtrack-v202605232213';
const SHELL = [
  './index.html',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

/* ── Install ── */
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
});

/* ── Activate: clean old caches ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ── Message ── */
self.addEventListener('message', e => {
  if (!e.data) return;
  if (e.data.type === 'SKIP_WAITING') self.skipWaiting();

  if (e.data.type === 'CARDIO_DONE') {
    self.registration.showNotification('Cardio geschafft!', {
      body: 'Dein Timer ist abgelaufen. Super Leistung! 💪',
      tag: 'cardio-done',
      requireInteraction: false
    });
  }

  if (e.data.type === 'NOTIFY_UPDATE') {
    self.registration.showNotification('🆕 GymTrack Update verfügbar', {
      body: 'Tippe hier, um die App neu zu starten und das Update zu installieren.',
      tag: 'gymtrack-update',
      requireInteraction: true
    });
  }
});

/* ── Notification click ── */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.notification.tag !== 'gymtrack-update') return;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cls => {
      const c = cls.find(w => 'focus' in w);
      if (c) { c.focus(); c.postMessage({ type: 'DO_UPDATE' }); }
      else    { clients.openWindow('./?update=1'); }
    })
  );
});

/* ── Fetch: Cache-first for app shell, network-first for rest ── */
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
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});