/* Build fuer Cloudflare Pages.
 *
 * Anders als build.js (das www/ fuer die native App fuellt) erzeugt dieses
 * Skript dist/ — den Ordner, den Cloudflare ins Netz stellt. Der Unterschied
 * ist Absicht: GitHub Pages hat bisher das GESAMTE Repository ausgeliefert,
 * also auch ai-worker/, ios/, test/ und die Provisioning-Profile. Hier wird
 * ausdruecklich nur aufgenommen, was ein Browser braucht.
 *
 * Bewusst ordner- statt dateibasiert: eine vierte Modulliste neben index.html,
 * build.js und sw.js wuerde beim naechsten neuen Modul wieder auseinanderlaufen.
 */
const fs = require('fs');
const path = require('path');

const OUT = 'dist';

// Einzeldateien im Wurzelverzeichnis.
const DATEIEN = ['index.html', 'sw.js', 'manifest.json', 'privacy.html'];

// Komplette Ordner. Alles, was nicht hier steht, geht NICHT ins Netz.
// .well-known traegt die apple-app-site-association (Universal Links). Cloudflare
// Pages ueberspringt sonst jeden Ordner, der mit einem Punkt beginnt — .well-known
// ist die einzige Ausnahme, deshalb darf die Datei genau dort und nirgends sonst
// liegen. Ohne sie oeffnet ein ?ref=-Link auf iOS wieder Safari statt der App.
const ORDNER = ['js', 'css', 'img', 'screenshots', 'web', 'dashboard', '.well-known'];

// Icons liegen im Wurzelverzeichnis und heissen alle icon-*.png.
const ICON_MUSTER = /^icon-[\w-]+\.png$/;

// Innerhalb der kopierten Ordner trotzdem aussortieren.
const AUSNAHMEN = new Set(['.DS_Store']);

let anzahl = 0;

function kopiere(von, nach) {
  fs.mkdirSync(path.dirname(nach), { recursive: true });
  fs.copyFileSync(von, nach);
  anzahl++;
}

function kopiereOrdner(rel) {
  if (!fs.existsSync(rel)) return;
  for (const eintrag of fs.readdirSync(rel, { withFileTypes: true })) {
    if (AUSNAHMEN.has(eintrag.name)) continue;
    const p = path.join(rel, eintrag.name);
    if (eintrag.isDirectory()) kopiereOrdner(p);
    else kopiere(p, path.join(OUT, p));
  }
}

fs.rmSync(OUT, { recursive: true, force: true });

for (const f of DATEIEN) {
  if (!fs.existsSync(f)) {
    console.error('BUILD ABGEBROCHEN — ' + f + ' fehlt.');
    process.exit(1);
  }
  kopiere(f, path.join(OUT, f));
}

for (const d of ORDNER) kopiereOrdner(d);

for (const f of fs.readdirSync('.')) {
  if (ICON_MUSTER.test(f)) kopiere(f, path.join(OUT, f));
}

/* _headers steuert das Caching. Der Service Worker darf NICHT lange gecacht
   werden: sonst bekommt ein Nutzer die neue Version erst, wenn der alte
   Worker von sich aus ablaeuft. Die App prueft Updates ueber einen
   Direktvergleich von sw.js — der geht ins Leere, wenn ein Zwischenspeicher
   die alte Datei ausliefert. */
const HEADERS = [
  '/sw.js',
  '  Cache-Control: no-cache, must-revalidate',
  '',
  '/index.html',
  '  Cache-Control: no-cache, must-revalidate',
  '',
  '/js/*',
  '  Cache-Control: public, max-age=0, must-revalidate',
  '',
  '/css/*',
  '  Cache-Control: public, max-age=0, must-revalidate',
  '',
  '/img/*',
  '  Cache-Control: public, max-age=604800',
  '',
  '/screenshots/*',
  '  Cache-Control: public, max-age=604800',
  '',
  // Apple laedt die Datei ohne Endung — ohne diesen Content-Type liefert Pages
  // sie als octet-stream aus und iOS verwirft sie stillschweigend (der Link
  // oeffnet dann wieder Safari, ohne jede Fehlermeldung).
  '/.well-known/apple-app-site-association',
  '  Content-Type: application/json',
  '  Cache-Control: public, max-age=3600',
  '',
].join('\n');
fs.writeFileSync(path.join(OUT, '_headers'), HEADERS);
anzahl++;

/* Kontrollausgabe: taucht hier etwas auf, das nicht ins Netz gehoert, faellt
   es sofort auf — der Build laeuft bei jedem Deploy. */
const wurzel = fs.readdirSync(OUT).sort().join(' ');
console.log('OK — ' + anzahl + ' Dateien nach ' + OUT + '/');
console.log('Inhalt: ' + wurzel);
