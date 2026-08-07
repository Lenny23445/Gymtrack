/* GymTrack — Service Worker */
const CACHE = 'gymtrack-v202608071020';
const SHELL = [
  './index.html',
  './manifest.json',
  './css/app.css',
  './icon-192.png',
  './icon-512.png',
  // Stock-Motive der Share-Card: muessen offline da sein, sonst faellt der
  // Post ohne eigenes Foto auf die alte Verlaufs-Karte zurueck.
  './img/stock/gym1.jpg',
  './img/stock/gym2.jpg',
  './img/stock/gym3.jpg',
  './img/stock/gym4.jpg',
  './img/stock/gym5.jpg',
  './img/stock/gym6.jpg',
  './js/coach-memory.js',
  './js/coach-log.js',
  './js/coach-intent.js',
  './js/coach-cache.js',
  './js/coach-persona.js',
  './js/coach-voice.js',
  './js/coach-session.js',
  './js/coach-warmup.js',
  './js/coach-cues.js',
  './js/coach-rpe.js',
  './js/coach-analyze.js',
  './js/coach-volume.js',
  './js/coach-notify.js',
  './js/coach-report.js',
  './js/coach-charts.js',
  './js/workout-focus.js',
  './js/workout-bar.js',
  './js/app-reveal.js',
  './js/app-i18n.js',
  './js/app-native.js',
  './js/app-ui.js',
  './js/app-session.js',
  './js/app-plans.js',
  './js/app-workout.js',
  './js/app-exdb.js',
  './js/app-streak.js',
  './js/app-community.js',
  './js/app-crew.js',
  './js/app-coach.js',
  './js/app-coach-setup.js',
  './js/app-update.js',
  './js/app-boot.js',
  './js/app-tabbar.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

/* Kern der App: ohne diese Dateien startet die Web-/PWA-Version offline gar
   nicht erst. Alles andere (Icons, Stock-Motive, Chart.js vom CDN) ist Beiwerk,
   das notfalls beim ersten Online-Aufruf nachgecacht wird. */
const isCore = u => /^\.\/(index\.html$|css\/|js\/)/.test(u);

/* ── Install ──
   Bewusst KEIN cache.addAll: das ist all-or-nothing. Ein Aussetzer des Chart.js-
   CDN liess damit den kompletten Install scheitern — Ergebnis war GAR KEIN
   Offline-Cache, obwohl alle eigenen Dateien erreichbar waren. Jede Datei wird
   deshalb einzeln gecacht; nur ein fehlender Kern-Eintrag kippt den Install noch. */
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c =>
    Promise.allSettled(SHELL.map(u => c.add(u))).then(res => {
      const failed = SHELL.filter((u, i) => res[i].status === 'rejected');
      if (failed.length) console.warn('[SW] nicht gecacht:', failed.join(', '));
      const fatal = failed.filter(isCore);
      if (fatal.length) throw new Error('Kern-Dateien nicht cachebar: ' + fatal.join(', '));
    })
  ));
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
        self.registration.showNotification('Zeit fürs Training', {
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
   - index.html + sw.js + ./js/coach-*.js + ./js/workout-*.js + ./js/app-*.js: NETWORK-FIRST (immer
     neueste Version wenn online) → fixt das Problem, dass Updates hängen bleiben.
     Die Coach-Module sind Anwendungslogik (Dossier/Log/Intent-Router), keine
     unveraenderlichen Assets — sie muessen so aktuell bleiben wie index.html,
     das sie aufruft. Cache-first waere hier riskant: ein Client koennte ein
     frisches index.html gegen ein veraltetes coach-intent.js laufen lassen,
     ohne dass ein CACHE-Bump das je bemerkt (Review Wichtig 1).
     Fuer die app-*-Module gilt dasselbe in noch schaerferer Form: seit dem
     Modul-Split steckt die KOMPLETTE App in diesen 13 Dateien. Ein veralteter
     Stand darunter ist nicht ein kaputtes Feature, sondern eine kaputte App.
   - Andere Shell-Dateien (Icons, Chart.js): cache-first (Performance, ändern sich selten,
     Chart.js ist ohnehin per Versions-Pin in der URL fixiert)
   - Rest: network-first mit Cache-Fallback                                         */
self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (e.request.method !== 'GET') return;

  const isCriticalShell = url.includes('index.html') || url.endsWith('/') || url.includes('sw.js') || url.includes('manifest.json') || url.includes('/js/coach-') || url.includes('/js/workout-') || url.includes('/js/app-') || url.includes('/css/app.css');
  const isStaticShell   = SHELL.some(s => {
    const name = s.replace('./', '');
    return name && !name.includes('index.html') && !name.includes('manifest.json') && !name.startsWith('js/coach-') && !name.startsWith('js/workout-') && !name.startsWith('js/app-') && !name.startsWith('css/') && url.includes(name);
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