/* GymTrack — Service Worker */
const CACHE = 'gymtrack-v202605232221';
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

/* ── Cardio-Timer im SW (läuft kurz weiter wenn App im Hintergrund) ── */
let _cardioTimer = null;

/* ── Message ── */
self.addEventListener('message', e => {
  if (!e.data) return;

  if (e.data.type === 'SKIP_WAITING') self.skipWaiting();

  /* Cardio-Timer planen: SW zeigt Notification wenn Zeit abläuft */
  if (e.data.type === 'SCHEDULE_CARDIO') {
    if (_cardioTimer) clearTimeout(_cardioTimer);
    const delay = Math.max(0, e.data.endTime - Date.now());
    _cardioTimer = setTimeout(() => {
      _cardioTimer = null;
      self.registration.showNotification('Cardio geschafft! 🎉', {
        body: 'Dein Timer ist abgelaufen. Super Leistung! 💪',
        tag: 'cardio-done',
        requireInteraction: false
      });
    }, delay);
  }

  /* Cardio-Timer abbrechen (Pause / Reset) */
  if (e.data.type === 'CANCEL_CARDIO') {
    if (_cardioTimer) { clearTimeout(_cardioTimer); _cardioTimer = null; }
  }

  /* Cardio fertig aus dem Foreground heraus */
  if (e.data.type === 'CARDIO_DONE') {
    if (_cardioTimer) { clearTimeout(_cardioTimer); _cardioTimer = null; }
    self.registration.showNotification('Cardio geschafft! 🎉', {
      body: 'Dein Timer ist abgelaufen. Super Leistung! 💪',
      tag: 'cardio-done',
      requireInteraction: false
    });
  }
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