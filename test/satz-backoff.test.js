/* GymTrack — Tests fuer den Backoff-Satz

   Zwei Regeln tragen den neuen Satztyp, und beide sind reine Rechnungen:

   1. _coachIsBackoff (js/app-coach.js) entscheidet, ob ein eingetragener Satz
      ein GEPLANTER Backoff ist. Faellt die Entscheidung falsch, meldet der
      Live-Coach "Gewicht eingebrochen" zu einem Satz, den der Nutzer bewusst
      so gefahren hat — oder er schweigt zu einem echten Einbruch. Beides ist
      schlimmer als gar kein Coach.
   2. setTypeMul (js/app-plans.js) bestimmt, wie stark der Satz auf die
      Erholung schlaegt. Die Zahl allein sagt wenig; entscheidend ist ihre
      LAGE zwischen den anderen Satztypen. Genau die pruefen die Tests.

   Beide Funktionen stehen in Dateien, die keine Module sind (geteilter
   globaler Scope, siehe CLAUDE.md Regel 3) — sie lassen sich nicht
   require()n. Deshalb wird ihr Quelltext herausgeschnitten und ausgewertet.
   Das geht nur, WEIL sie rein sind: kein S, kein wkLogs, keine Uhr, keine
   Oberflaeche. Waere das nicht so, waere schon das Herausschneiden unmoeglich
   — der Test ist damit zugleich ein Waechter gegen ein spaeteres Verdrahten
   dieser Regeln mit dem Rest der App. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function ausschneiden(datei, name) {
  const quelle = fs.readFileSync(path.join(__dirname, '..', datei), 'utf8');
  // Top-Level-Funktion: schliessende Klammer steht am Zeilenanfang.
  const rx = new RegExp('^function ' + name + '\\s*\\([\\s\\S]*?^\\}', 'm');
  const m = rx.exec(quelle);
  assert.ok(m, name + ' nicht in ' + datei + ' gefunden');
  return new Function(m[0] + '; return ' + name + ';')();
}

const istBackoff  = ausschneiden('js/app-coach.js', '_coachIsBackoff');
const setTypeMul  = ausschneiden('js/app-plans.js', 'setTypeMul');

// Ein Uebungs-Log aus Kurzformen: ['100x5', '85x8'] -> zwei Saetze.
function logAus(...saetze) {
  return {
    sets: saetze.map(s => {
      if (typeof s === 'object') return s;
      const [w, r] = String(s).split('x');
      return { w: w, r: r };
    })
  };
}

// ── _coachIsBackoff ────────────────────────────────────────────────────────

test('Backoff: weniger Gewicht UND mehr Wdh. nach dem schwersten Satz', () => {
  // 100 kg x 5, danach 85 kg x 8 — der Lehrbuchfall.
  assert.strictEqual(istBackoff(logAus('100x5', '85x8'), 1, 85, 8), true);
});

test('Backoff: gleiche Wdh. sind KEIN Backoff, sondern ein Einbruch', () => {
  // Genau hier soll der Coach weiterhin etwas sagen duerfen.
  assert.strictEqual(istBackoff(logAus('100x5', '85x5'), 1, 85, 5), false);
});

test('Backoff: weniger Wdh. sind erst recht kein Backoff', () => {
  assert.strictEqual(istBackoff(logAus('100x5', '85x3'), 1, 85, 3), false);
});

test('Backoff: unter 8 % Abstand ist Rauschen, keine Absicht', () => {
  // 95 von 100 = 5 % — das ist eine Hantelstufe, keine Entscheidung.
  assert.strictEqual(istBackoff(logAus('100x5', '95x8'), 1, 95, 8), false);
});

test('Backoff: ueber 20 % Abstand ist ein Drop-Satz, kein Backoff', () => {
  assert.strictEqual(istBackoff(logAus('100x5', '70x12'), 1, 70, 12), false);
});

test('Backoff: die Grenzen selbst zaehlen noch dazu (8 % und 20 %)', () => {
  assert.strictEqual(istBackoff(logAus('100x5', '92x8'), 1, 92, 8), true);
  assert.strictEqual(istBackoff(logAus('100x5', '80x9'), 1, 80, 9), true);
});

test('Backoff: der vorige Satz muss der schwerste gewesen sein', () => {
  // 120 stand vorher — 100 ist schon der Rueckzug, 85 danach ist einfach
  // der naechste Satz einer absteigenden Reihe.
  assert.strictEqual(istBackoff(logAus('120x3', '100x5', '85x8'), 2, 85, 8), false);
});

test('Backoff: Aufwaermsaetze verschieben den Spitzenwert nicht', () => {
  // Ein (unsinnig) schweres Aufwaermen darf den Vergleich nicht kippen.
  const log = logAus({ w: '110', r: '5', type: 'warmup' }, '100x5', '85x8');
  assert.strictEqual(istBackoff(log, 2, 85, 8), true);
});

test('Backoff: direkt nach einem Aufwaermsatz gibt es keinen Backoff', () => {
  const log = logAus({ w: '60', r: '10', type: 'warmup' }, '50x12');
  assert.strictEqual(istBackoff(log, 1, 50, 12), false);
});

test('Backoff: der erste Satz einer Uebung kann keiner sein', () => {
  assert.strictEqual(istBackoff(logAus('85x8'), 0, 85, 8), false);
});

test('Backoff: haelt fehlende und unsinnige Zahlen aus', () => {
  assert.strictEqual(istBackoff(null, 1, 85, 8), false);
  assert.strictEqual(istBackoff(logAus('100x5', '85x8'), 1, 0, 8), false);
  assert.strictEqual(istBackoff(logAus('100x5', '85x8'), 1, 85, 0), false);
  assert.strictEqual(istBackoff(logAus({ w: '', r: '' }, '85x8'), 1, 85, 8), false);
});

// ── setTypeMul ─────────────────────────────────────────────────────────────

test('Erholung: Backoff liegt zwischen normalem Satz und Drop-Satz', () => {
  const normal = setTypeMul('normal');
  const back   = setTypeMul('backoff');
  const drop   = setTypeMul('drop');
  assert.ok(back > normal, 'Backoff muss mehr zehren als ein normaler Satz');
  assert.ok(back < drop,   'Backoff darf nicht so stark zehren wie ein Drop-Satz');
});

test('Erholung: die ganze Staffel steht in der richtigen Reihenfolge', () => {
  const reihe = ['warmup', 'normal', 'backoff', 'drop', 'top', 'fail'].map(setTypeMul);
  for (let i = 1; i < reihe.length; i++) {
    assert.ok(reihe[i] > reihe[i - 1],
      'Satztyp ' + i + ' muss staerker zehren als der davor: ' + reihe.join(' < '));
  }
});

test('Erholung: Gross-/Kleinschreibung und Leerwert aendern nichts', () => {
  assert.strictEqual(setTypeMul('BACKOFF'), setTypeMul('backoff'));
  assert.strictEqual(setTypeMul(null), setTypeMul('normal'));
});
