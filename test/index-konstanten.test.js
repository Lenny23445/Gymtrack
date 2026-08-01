/* GymTrack — Waechter gegen benutzte, aber nicht deklarierte Konstanten in index.html

   Anlass (01.08.2026): Beim Entfernen einer temporaeren Bildschirm-Diagnose
   fielen WK_SW_MIN und WK_SW_ACHSE mit heraus — benutzt wurden sie weiter.
   Folge: jeder touchmove im Training warf ReferenceError, die Wischachse stand
   nie fest, _wkStep() lief nie, und weil touch-action:none das native Scrollen
   abschaltet, bewegte sich im Training gar nichts mehr.

   Geprueft werden nur GROSS_GESCHRIEBENE Namen mit Unterstrich — genau die Form,
   die im Code als Schwellwert/Tabelle vorkommt. Zugriffe auf Fremdobjekte
   (x.MAX_SAFE_INTEGER) und Objektschluessel (FOO_BAR:) bleiben aussen vor, sonst
   schlaegt der Waechter bei Browser-Eigenschaften an. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/* Kommentare raus, bevor gesucht wird: die Datei erklaert an vielen Stellen
   Konstanten fremder Module (CoachReport.MIN_WEEKS, COACH_SCHEMA im Worker),
   und ein Waechter, der Prosa anmeckert, wird abgeschaltet statt gelesen. */
const CODE = HTML
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function benutzte() {
  const treffer = new Set();
  const rx = /(^|[^.\w$'"`])([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b(?!\s*:)/g;
  let m;
  while ((m = rx.exec(CODE)) !== null) treffer.add(m[2]);
  return [...treffer];
}

function deklariert(name) {
  return new RegExp('\\b(?:const|let|var|function|class)\\s+' + name + '\\b').test(HTML)
      || new RegExp('\\b' + name + '\\s*=[^=]').test(HTML);
}

test('jede GROSS_KONSTANTE in index.html ist auch deklariert', () => {
  const fehlend = benutzte().filter(n => !deklariert(n));
  assert.deepStrictEqual(fehlend, [], 'Nicht deklariert: ' + fehlend.join(', '));
});

test('die Wisch-Schwellen des Trainings stehen im Code', () => {
  // Namentlich festgenagelt, weil genau diese beiden schon einmal verschwanden.
  for (const n of ['WK_SW_MIN', 'WK_SW_ACHSE']) {
    assert.ok(new RegExp('const\\s+' + n + '\\s*=\\s*\\d+').test(HTML), n + ' fehlt');
  }
});
