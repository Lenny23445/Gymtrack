/* Laedt index.html im echten Browser und prueft, dass der Modul-Split nichts
   zerrissen hat: keine eigenen Konsolenfehler, kein unbehandelter Fehler, und die
   Kernfunktionen sind definiert.

   Laeuft bewusst NICHT unter `node --test` (braucht Puppeteer und dauert Sekunden).
   Aufruf direkt:  node test/smoke-module.js

   Das ist das eigentliche Sicherheitsnetz des Splits: `npm test` prueft nur die
   Coach-Module und Konstantennamen — ob die App ueberhaupt noch startet, sieht nur
   ein echter Ladevorgang. */
const puppeteer = require('puppeteer');
const path = require('path');
const http = require('http');
const fs = require('fs');

const WURZEL = __dirname;

/* Eigener Mini-Server statt file://. Unter file:// blockiert die CORS-Regel des
   Browsers manifest.json und die sw.js-Abfrage — lauter Fehler, die es in
   Produktion nicht gibt und die einen echten Fehler zudecken wuerden. Ueber
   http:// laedt die App genau wie auf GitHub Pages. */
const TYPEN = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml'
};

function serverStarten() {
  const server = http.createServer((req, res) => {
    const pfad = decodeURIComponent(req.url.split('?')[0]);
    const datei = path.join(WURZEL, pfad === '/' ? 'index.html' : pfad);
    // Kein Ausbruch aus dem Projektverzeichnis
    if (!datei.startsWith(WURZEL)) { res.writeHead(403); return res.end(); }
    fs.readFile(datei, (err, buf) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPEN[path.extname(datei)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  return new Promise(fertig => server.listen(0, '127.0.0.1', () => fertig(server)));
}

const KERN = [
  'setTheme', 'persist', 'goTab', 'isWorkoutActive', 'tr', 'setAppLang',
  'muscleLabel', 'unitLabel', 'exHistory', 'buildPlannedSets',
  'moveTabIndicator', 'openOv', 'closeOv'
];

(async () => {
  const server = await serverStarten();
  const port = server.address().port;
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const fehler = [];

  /* "Failed to load resource" ist nur das URL-lose Echo eines Ladefehlers — der
     response-Handler unten meldet denselben Vorgang mit URL. Waere es hier drin,
     koennte eine gefilterte Fremd-URL trotzdem als Fehler durchrutschen. */
  page.on('console', m => {
    if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) {
      fehler.push('console: ' + m.text());
    }
  });
  page.on('pageerror', e => fehler.push('pageerror: ' + e.message));
  page.on('requestfailed', r => fehler.push('request: ' + r.url() + ' ' + r.failure().errorText));
  /* 404 ist fuer den Browser eine erfolgreiche Antwort — requestfailed feuert dabei
     nicht. Genau dieser Fall ist beim Split aber der wahrscheinlichste Fehler:
     Modul angelegt, aber das <script src>-Tag zeigt woandershin. */
  page.on('response', r => { if (r.status() >= 400) fehler.push('http ' + r.status() + ': ' + r.url()); });

  await page.goto('http://127.0.0.1:' + port + '/index.html',
                  { waitUntil: 'networkidle2', timeout: 30000 });

  const fehlend = await page.evaluate(namen =>
    namen.filter(n => typeof window[n] !== 'function'), KERN);

  await browser.close();
  server.close();

  /* Fremde Quellen (Firebase, Google Identity, Chart.js vom CDN) sind vom Netz
     abhaengig und nicht Gegenstand des Splits. Gefiltert wird nach HERKUNFT,
     nicht nach Fehlertext: ein echter Fehler aus eigenem Code soll auch dann
     auffallen, wenn er zufaellig aehnlich klingt. */
  const fremd = /gstatic\.com|googleapis\.com|accounts\.google\.com|jsdelivr\.net|firebase|favicon\.ico/i;
  const echte = fehler.filter(f => !fremd.test(f));

  if (echte.length) {
    console.error('FEHLER beim Laden:');
    echte.forEach(f => console.error('  ' + f));
  }
  if (fehlend.length) {
    console.error('FEHLENDE Kernfunktionen: ' + fehlend.join(', '));
  }
  if (echte.length || fehlend.length) process.exit(1);

  console.log('Rauchtest OK — 0 eigene Fehler, ' + KERN.length + ' Kernfunktionen vorhanden');
})();
