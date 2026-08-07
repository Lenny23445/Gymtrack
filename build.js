const fs = require('fs');
const path = require('path');

if (!fs.existsSync('www')) fs.mkdirSync('www');

const files = ['index.html', 'sw.js', 'manifest.json', 'privacy.html', 'css/app.css', 'icon-192.png', 'icon-512.png', 'icon-1024.png', 'icon-gold-192.png', 'icon-white-192.png',
               'js/coach-memory.js', 'js/coach-log.js', 'js/coach-intent.js', 'js/coach-cache.js',
               'js/coach-persona.js', 'js/coach-voice.js', 'js/coach-session.js', 'js/coach-warmup.js',
               'js/coach-cues.js', 'js/coach-rpe.js', 'js/coach-analyze.js', 'js/coach-volume.js',
               'js/coach-notify.js', 'js/coach-report.js', 'js/coach-charts.js',
               'js/workout-focus.js', 'js/workout-bar.js', 'js/app-reveal.js',
               // App-Module (Reihenfolge = Ladereihenfolge in index.html).
               // Fehlt hier eines, startet die native App ohne diese Datei.
               'js/app-i18n.js', 'js/app-native.js', 'js/app-ui.js', 'js/app-session.js',
               'js/app-plans.js', 'js/app-workout.js', 'js/app-exdb.js', 'js/app-streak.js', 'js/app-community.js',
               'js/app-crew.js', 'js/app-plate.js',
               'js/app-coach.js', 'js/app-coach-setup.js', 'js/app-referral.js', 'js/app-review.js',
               'js/app-update.js', 'js/app-boot.js',
               'js/app-tabbar.js',
               // Stock-Motive der Share-Card (Post ohne eigenes Foto)
               'img/stock/gym1.jpg', 'img/stock/gym2.jpg', 'img/stock/gym3.jpg',
               'img/stock/gym4.jpg', 'img/stock/gym5.jpg', 'img/stock/gym6.jpg'];

/* Die Modulliste wird an drei Stellen gepflegt: script-Tags in index.html
   (Ladereihenfolge), die Kopierliste hier (native App) und SHELL in sw.js
   (Offline-Cache). Weicht eine ab, faellt das erst beim Nutzer auf — als
   fehlendes Feature in der nativen App bzw. offline. Deshalb der Abgleich. */
const norm = s => s.replace(/^\.\//, '');
const isExtern = s => /^(https?:)?\/\//.test(s);
const isModule = s => /^js\/[\w.-]+\.js$/.test(s);

function abort(msg) {
  console.error('BUILD ABGEBROCHEN — ' + msg);
  process.exit(1);
}

function modulesFromIndex() {
  const html = fs.readFileSync('index.html', 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const rx = /<script[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi;
  const out = [];
  let m;
  while ((m = rx.exec(html))) {
    const src = norm(m[1]);
    if (!isExtern(src) && isModule(src)) out.push(src);
  }
  return out;
}

function modulesFromSw() {
  const sw = fs.readFileSync('sw.js', 'utf8');
  const block = sw.match(/const SHELL\s*=\s*\[([\s\S]*?)\n\];/);
  if (!block) abort('sw.js: SHELL-Liste nicht gefunden (Format geaendert?)');
  // Nur ganze Kommentarzeilen entfernen — ein blindes //-Strippen wuerde die
  // CDN-URL in der Liste zerschneiden.
  const body = block[1].replace(/^\s*\/\/.*$/gm, '');
  const rx = /['"]([^'"]+)['"]/g;
  const out = [];
  let m;
  while ((m = rx.exec(body))) {
    const s = norm(m[1]);
    if (!isExtern(s) && isModule(s)) out.push(s);
  }
  return out;
}

const lists = {
  'build.js': files.filter(f => isModule(norm(f))).map(norm),
  'index.html': modulesFromIndex(),
  'sw.js': modulesFromSw()
};

const names = Object.keys(lists);
const dupes = [];
names.forEach(n => {
  const seen = new Set();
  lists[n].forEach(m => { if (seen.has(m)) dupes.push(m + ' (doppelt in ' + n + ')'); seen.add(m); });
});
const all = [...new Set(names.flatMap(n => lists[n]))].sort();
const drift = all
  .map(m => ({ mod: m, fehlt: names.filter(n => !lists[n].includes(m)) }))
  .filter(x => x.fehlt.length);

if (drift.length || dupes.length) {
  abort('Modullisten laufen auseinander:\n' +
    drift.map(x => '  ' + x.mod + ' — fehlt in: ' + x.fehlt.join(', ')).join('\n') +
    (dupes.length ? '\n  ' + dupes.join('\n  ') : '') +
    '\nJedes Modul muss in index.html (script-Tag), build.js (Kopierliste) und sw.js (SHELL) stehen.');
}

const missing = files.filter(f => !fs.existsSync(f));
if (missing.length) {
  abort('Dateien fehlen (Tippfehler in der Kopierliste oder Datei geloescht):\n  ' + missing.join('\n  '));
}

if (!fs.existsSync(path.join('www', 'js'))) fs.mkdirSync(path.join('www', 'js'), { recursive: true });
if (!fs.existsSync(path.join('www', 'css'))) fs.mkdirSync(path.join('www', 'css'), { recursive: true });
if (!fs.existsSync(path.join('www', 'img', 'stock'))) fs.mkdirSync(path.join('www', 'img', 'stock'), { recursive: true });
files.forEach(file => {
  fs.copyFileSync(file, path.join('www', file));
  console.log('Copied', file);
});
console.log('OK — ' + files.length + ' Dateien, ' + lists['build.js'].length + ' Module deckungsgleich in index.html/build.js/sw.js');
