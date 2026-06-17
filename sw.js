/* GymTrack — Service Worker */
const CACHE = 'gymtrack-v202606171400';
const SHELL = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
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

/* ── Workout-Erinnerungs-Timer ── */
let _workoutTimers = [];

/* ── Message ── */
self.addEventListener('message', e => {
  if (!e.data) return;

  if (e.data.type === 'SKIP_WAITING') self.skipWaiting();

  /* Workout-Erinnerungen planen */
  if (e.data.type === 'SCHEDULE_WORKOUT_NOTIFS') {
    _workoutTimers.forEach(t => clearTimeout(t));
    _workoutTimers = [];
    (e.data.notifications || []).forEach(n => {
      const delay = n.timestamp - Date.now();
      if (delay <= 0) return;
      const t = setTimeout(() => {
        self.registration.showNotification('Zeit fürs Training! 💪', {
          body: n.day + ': ' + n.label,
          tag: 'workout-' + n.timestamp,
          icon: './icon-192.png',
          requireInteraction: false
        });
      }, delay);
      _workoutTimers.push(t);
    });
  }

  /* Workout-Erinnerungen abbrechen */
  if (e.data.type === 'CANCEL_WORKOUT_NOTIFS') {
    _workoutTimers.forEach(t => clearTimeout(t));
    _workoutTimers = [];
  }
});

/* ── Fetch-Strategien ──
   - index.html + sw.js: NETWORK-FIRST (immer neueste Version wenn online)
     → fixt das Problem, dass Updates hängen bleiben
   - Andere Shell-Dateien (Icons, Chart.js): cache-first (Performance, ändern sich selten)
   - Rest: network-first mit Cache-Fallback                                         */
self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (e.request.method !== 'GET') return;

  const isCriticalShell = url.includes('index.html') || url.endsWith('/') || url.includes('sw.js') || url.includes('manifest.json');
  const isStaticShell   = SHELL.some(s => {
    const name = s.replace('./', '');
    return name && !name.includes('index.html') && !name.includes('manifest.json') && url.includes(name);
  });

  if (isCriticalShell) {
    // Network-first: immer frisch, Cache nur als Offline-Fallback
    e.respondWith(
      fetch(e.request).then(r => {
        if (r && r.ok) {
          const rc = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, rc)).catch(()=>{});
        }
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  if (isStaticShell) {
    // Cache-first für statische Assets (Icons, Chart.js)
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request).then(r2 => {
        const rc = r2.clone();
        caches.open(CACHE).then(c => c.put(e.request, rc)).catch(()=>{});
        return r2;
      }))
    );
    return;
  }

  // Alles andere: network-first
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});