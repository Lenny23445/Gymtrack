/* GymTrack — Tests fuer die Wochen-Serie ueber Zeitumstellungen hinweg

   calcStreak (js/app-streak.js) zaehlt Wochen, in denen mindestens einmal
   trainiert wurde. Jede Woche wird als Zeitstempel ihres Montags (lokal, 00:00)
   in einem Set gehalten und EXAKT verglichen.

   Der Fallstrick: eine Woche hat nicht immer 7*86400000 ms. Ueber eine
   Zeitumstellung hinweg sind es 167 bzw. 169 Stunden. Wer mit festen
   Millisekunden rueckwaerts zaehlt, landet eine Stunde neben dem gespeicherten
   Montag — der Set-Vergleich schlaegt fehl und eine lueckenlose Serie reisst
   scheinbar genau an der naechsten Umstellung ab. Mit TZ=Europe/Berlin lieferten
   160 durchgehend trainierte Wochen so nur 19; die Reihe der besten Serie kam
   auf 30 und die 12-Wochen-Punkte im Streak-Sheet zeigten "nicht trainiert" fuer
   Wochen, in denen trainiert wurde.

   calcStreak liest das globale S und die Uhr, ist also nicht rein, und die Datei
   ist kein Modul (geteilter globaler Scope, CLAUDE.md Regel 3) — sie laesst sich
   nicht require()n. Deshalb wird der Quelltext herausgeschnitten und mit
   injiziertem S und injizierter Uhr ausgewertet.

   WICHTIG: die Testdaten entstehen bewusst KALENDERBASIERT (setDate), nie ueber
   Millisekunden. Sonst haetten sie denselben Fehler wie der Code und wuerden ihn
   gegenseitig aufheben, statt ihn zu zeigen. */

// Der Fehler existiert nur in einer Zone mit Zeitumstellung; npm test setzt
// keine TZ. Die Zone deshalb hier festnageln, sonst laeuft der Test in UTC blind.
process.env.TZ = 'Europe/Berlin';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const QUELLE = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'app-streak.js'), 'utf8');

// Top-Level-Funktion: die schliessende Klammer steht am Zeilenanfang.
const TREFFER = /^function calcStreak\s*\([\s\S]*?^\}/m.exec(QUELLE);
assert.ok(TREFFER, 'calcStreak nicht in js/app-streak.js gefunden');

// Uhr faelschen: parameterloses new Date() liefert den Stichtag, jeder Aufruf
// mit Argument geht unveraendert an das echte Date.
function uhr(jetztMs) {
  return new Proxy(Date, {
    construct: (Z, args) => (args.length ? new Z(...args) : new Z(jetztMs)),
  });
}

function streakAm(stichtag, sessions) {
  const bauen = new Function('S', 'Date', TREFFER[0] + '; return calcStreak;');
  return bauen({ sessions }, uhr(stichtag.getTime()))();
}

// Montag (lokal, 00:00) der Woche, in der d liegt.
function montag(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

// Ein Training am Montag 10:00 fuer jede angegebene Woche (0 = Woche des
// Stichtags, 1 = die davor, ...).
function trainingsAn(stichtag, wochen) {
  const mo = montag(stichtag);
  return wochen.map(i => {
    const d = new Date(mo);
    d.setDate(mo.getDate() - i * 7);
    d.setHours(10, 0, 0, 0);
    return { date: d.toISOString() };
  });
}

const reihe = (n, ab = 0) => Array.from({ length: n }, (_, i) => i + ab);

// Stichtage rund um die Berliner Umstellungen (letzter Sonntag im Maerz/Oktober).
const NACH_VORSTELLEN  = new Date(2026, 2, 31, 12);  // Di, 31.03.2026 (Umstellung 29.03.)
const NACH_ZURUECK     = new Date(2025, 10, 5, 12);  // Mi, 05.11.2025 (Umstellung 26.10.)
const IRGENDWANN       = new Date(2026, 7, 6, 12);   // Do, 06.08.2026

test('Vorbedingung: die Testzone stellt die Uhr wirklich um', () => {
  const winter = new Date(2026, 0, 15).getTimezoneOffset();
  const sommer = new Date(2026, 6, 15).getTimezoneOffset();
  assert.notStrictEqual(winter, sommer,
    'ohne Zeitumstellung pruefen die folgenden Tests nichts');
});

test('Serie: 160 lueckenlose Wochen bleiben 160, nicht 19', () => {
  const st = streakAm(IRGENDWANN, trainingsAn(IRGENDWANN, reihe(160)));
  assert.strictEqual(st.weeks, 160, 'laufende Serie darf an keiner Umstellung abreissen');
  assert.strictEqual(st.bestWeeks, 160, 'beste Serie darf an keiner Umstellung abreissen');
  assert.strictEqual(st.totalWeeks, 160);
});

test('Serie: das Vorstellen im Maerz (167-Stunden-Woche) bricht sie nicht', () => {
  const st = streakAm(NACH_VORSTELLEN, trainingsAn(NACH_VORSTELLEN, reihe(6)));
  assert.strictEqual(st.weeks, 6);
  assert.strictEqual(st.bestWeeks, 6);
});

test('Serie: das Zurueckstellen im Oktober (169-Stunden-Woche) bricht sie nicht', () => {
  const st = streakAm(NACH_ZURUECK, trainingsAn(NACH_ZURUECK, reihe(6)));
  assert.strictEqual(st.weeks, 6);
  assert.strictEqual(st.bestWeeks, 6);
});

test('Serie: laeuft auch weiter, wenn diese Woche noch nicht trainiert wurde', () => {
  // Woche 0 fehlt — gezaehlt wird ab der Vorwoche, ueber die Umstellung hinweg.
  const st = streakAm(NACH_ZURUECK, trainingsAn(NACH_ZURUECK, reihe(20, 1)));
  assert.strictEqual(st.weeksThis, false);
  assert.strictEqual(st.weeks, 20);
});

test('Verlauf: alle 12 Punkte zeigen "trainiert", auch ueber die Umstellung', () => {
  const st = streakAm(NACH_ZURUECK, trainingsAn(NACH_ZURUECK, reihe(12)));
  assert.strictEqual(st.weekHistory.length, 12);
  assert.strictEqual(st.weekHistory.filter(w => w.trained).length, 12);
  assert.strictEqual(st.weekHistory.filter(w => w.isCurrent).length, 1,
    'genau der letzte Punkt ist die laufende Woche');
  assert.strictEqual(st.weekHistory[11].isCurrent, true);
});

test('Verlauf: die 12 Punkte stehen genau eine Kalenderwoche auseinander', () => {
  const st = streakAm(NACH_ZURUECK, trainingsAn(NACH_ZURUECK, reihe(12)));
  st.weekHistory.forEach((w, i) => {
    const d = new Date(w.ts);
    assert.strictEqual(d.getDay(), 1, 'Punkt ' + i + ' ist kein Montag');
    assert.strictEqual(d.getHours(), 0, 'Punkt ' + i + ' liegt nicht auf Mitternacht');
  });
});

test('Serie: eine echte Luecke beendet sie weiterhin', () => {
  // Der Fix darf nicht ins Gegenteil kippen und Luecken ueberspringen.
  const wochen = [0, 1, 2, ...reihe(6, 4)];   // Woche 3 fehlt
  const st = streakAm(IRGENDWANN, trainingsAn(IRGENDWANN, wochen));
  assert.strictEqual(st.weeks, 3, 'laufende Serie endet an der Luecke');
  assert.strictEqual(st.bestWeeks, 6, 'der laengere Block davor bleibt die beste Serie');
  assert.strictEqual(st.totalWeeks, 9);
});

test('Serie: mehrere Trainings derselben Woche zaehlen einmal', () => {
  const mo = montag(NACH_ZURUECK);
  const sessions = trainingsAn(NACH_ZURUECK, reihe(4));
  // Zusaetzlich Samstag der laufenden Woche — gleiche Woche, gleicher Montag.
  const sa = new Date(mo); sa.setDate(mo.getDate() + 5); sa.setHours(18, 30, 0, 0);
  sessions.push({ date: sa.toISOString() });
  const st = streakAm(NACH_ZURUECK, sessions);
  assert.strictEqual(st.totalWeeks, 4);
  assert.strictEqual(st.weeks, 4);
});

test('Serie: ohne Trainings gibt es nichts zu zaehlen', () => {
  const st = streakAm(IRGENDWANN, []);
  assert.strictEqual(st.weeks, 0);
  assert.strictEqual(st.bestWeeks, 0);
  assert.deepStrictEqual(st.weekHistory, []);
});
