/* GymTrack — Tests fuer die Satz-Rueckfrage (Task 15).
   Reine Logik, keine DOM-Abhaengigkeit: die drei Chips liefern eine Antwort,
   daraus folgen RPE-Wert, naechster Gewichtsvorschlag und Trend.
   Die Gewichte werden auf exakte Werte geprueft, nicht auf "kleiner/groesser":
   ein Vorschlag von 63,7 kg ist nicht auflegbar und muss auffallen. */
const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/coach-rpe.js');

/* ---------- Modul-Vertrag ---------- */

test('Modul haengt sich auch an globalThis (Browser-Verdrahtung)', () => {
  assert.strictEqual(globalThis.CoachRpe, R);
});

/* ---------- toRpe ---------- */

test('toRpe ordnet die deutschen Antworten zu', () => {
  assert.strictEqual(R.toRpe('leicht'), 6);
  assert.strictEqual(R.toRpe('passend'), 8);
  assert.strictEqual(R.toRpe('schwer'), 9.5);
});

test('toRpe ordnet die englischen Antworten gleich zu', () => {
  assert.strictEqual(R.toRpe('easy'), 6);
  assert.strictEqual(R.toRpe('ok'), 8);
  assert.strictEqual(R.toRpe('hard'), 9.5);
});

test('toRpe vertraegt Gross-Kleinschreibung und Leerzeichen', () => {
  assert.strictEqual(R.toRpe(' Leicht '), 6);
  assert.strictEqual(R.toRpe('HARD'), 9.5);
});

test('toRpe liefert bei unbekannter Antwort null, keinen stillen Default', () => {
  assert.strictEqual(R.toRpe('quatsch'), null);
  assert.strictEqual(R.toRpe(''), null);
  assert.strictEqual(R.toRpe(7), null);
});

test('unbeantwortete Rueckfrage ist ein gueltiger Zustand: toRpe(null) ist null', () => {
  assert.strictEqual(R.toRpe(null), null);
  assert.strictEqual(R.toRpe(undefined), null);
});

/* ---------- adjustNext ---------- */

test('schwer senkt um genau eine Schrittweite', () => {
  assert.strictEqual(R.adjustNext(60, 'schwer', 2.5), 57.5);
});

test('leicht hebt um genau eine Schrittweite', () => {
  assert.strictEqual(R.adjustNext(60, 'leicht', 2.5), 62.5);
});

test('passend laesst das Gewicht unveraendert stehen', () => {
  assert.strictEqual(R.adjustNext(60, 'passend', 2.5), 60);
  assert.strictEqual(R.adjustNext(60, 'ok', 2.5), 60);
});

test('unbekannte Antwort bewegt nichts', () => {
  assert.strictEqual(R.adjustNext(60, 'weissnicht', 2.5), 60);
});

test('unbeantwortete Rueckfrage bewegt nichts', () => {
  assert.strictEqual(R.adjustNext(60, null, 2.5), 60);
  assert.strictEqual(R.adjustNext(60, undefined, 2.5), 60);
});

test('der Sprung ist genau eine Stufe — bei jeder Schrittweite', () => {
  [1.25, 2.5, 5].forEach(function (step) {
    assert.strictEqual(R.adjustNext(80, 'leicht', step), 80 + step, 'leicht step ' + step);
    assert.strictEqual(R.adjustNext(80, 'schwer', step), 80 - step, 'schwer step ' + step);
  });
});

test('das Ergebnis bleibt ein Vielfaches der Schrittweite', () => {
  assert.strictEqual(R.adjustNext(62.5, 'leicht', 2.5), 65);
  assert.strictEqual(R.adjustNext(62.5, 'schwer', 2.5), 60);
});

test('krummes Ausgangsgewicht landet auf der naechsten Raster-Stufe', () => {
  // 61 und 63,7 kg liegen nicht auf dem 2,5er-Raster. Ergebnis ist die
  // naechste auflegbare Stufe in die gewuenschte Richtung — nie mehr als
  // eine Schrittweite vom tatsaechlich gehobenen Gewicht entfernt.
  assert.strictEqual(R.adjustNext(61, 'leicht', 2.5), 62.5);
  assert.strictEqual(R.adjustNext(61, 'schwer', 2.5), 60);
  assert.strictEqual(R.adjustNext(63.7, 'leicht', 2.5), 65);
  assert.strictEqual(R.adjustNext(63.7, 'schwer', 2.5), 62.5);
});

test('Maschine mit festem 5er-Raster bleibt auf dem Raster', () => {
  assert.strictEqual(R.adjustNext(35, 'leicht', 5), 40);
  assert.strictEqual(R.adjustNext(35, 'schwer', 5), 30);
  assert.strictEqual(R.adjustNext(37, 'leicht', 5), 40);
  assert.strictEqual(R.adjustNext(37, 'schwer', 5), 35);
});

test('das Gewicht faellt nie unter eine Schrittweite', () => {
  assert.strictEqual(R.adjustNext(2.5, 'schwer', 2.5), 2.5);
  assert.strictEqual(R.adjustNext(1.25, 'schwer', 1.25), 1.25);
  assert.strictEqual(R.adjustNext(5, 'schwer', 5), 5);
});

test('sehr schwere Gewichte bleiben exakt und bleiben Zahlen', () => {
  const up = R.adjustNext(217.5, 'leicht', 1.25);
  assert.strictEqual(up, 218.75);
  assert.strictEqual(typeof up, 'number');
  assert.strictEqual(R.adjustNext(200, 'schwer', 5), 195);
});

test('fehlende oder unbrauchbare Schrittweite fuehrt auf 2,5 kg zurueck', () => {
  assert.strictEqual(R.adjustNext(60, 'leicht'), 62.5);
  assert.strictEqual(R.adjustNext(60, 'schwer', 0), 57.5);
  assert.strictEqual(R.adjustNext(60, 'leicht', -5), 62.5);
});

test('ohne brauchbares Gewicht gibt es keinen Vorschlag', () => {
  assert.strictEqual(R.adjustNext(null, 'leicht', 2.5), null);
  assert.strictEqual(R.adjustNext(0, 'leicht', 2.5), null);
  assert.strictEqual(R.adjustNext(NaN, 'schwer', 2.5), null);
});

/* ---------- ackFor ---------- */

test('ackFor liefert Schluessel und Platzhalter, keinen Satz', () => {
  assert.deepStrictEqual(R.ackFor('leicht', 62.5), { key: 'setAckEasy', vars: { kg: 62.5 } });
  assert.deepStrictEqual(R.ackFor('schwer', 57.5), { key: 'setAckHard', vars: { kg: 57.5 } });
});

test('ackFor schweigt bei passend und bei fehlender Antwort', () => {
  assert.strictEqual(R.ackFor('passend', 60), null);
  assert.strictEqual(R.ackFor(null, 60), null);
  assert.strictEqual(R.ackFor('quatsch', 60), null);
});

/* ---------- summarize ---------- */

test('summarize zaehlt und erkennt einen harten Trend', () => {
  assert.deepStrictEqual(R.summarize(['schwer', 'schwer', 'schwer']),
    { easy: 0, ok: 0, hard: 3, trend: 'hard' });
});

test('summarize erkennt einen leichten Trend', () => {
  assert.deepStrictEqual(R.summarize(['leicht', 'leicht', 'passend']),
    { easy: 2, ok: 1, hard: 0, trend: 'easy' });
});

test('summarize behauptet bei Gleichstand keinen Trend', () => {
  assert.deepStrictEqual(R.summarize(['leicht', 'schwer', 'passend']),
    { easy: 1, ok: 1, hard: 1, trend: 'ok' });
  assert.strictEqual(R.summarize(['schwer', 'schwer', 'leicht', 'leicht']).trend, 'ok');
});

test('eine einzelne Antwort macht keinen Trend', () => {
  assert.strictEqual(R.summarize(['schwer']).trend, 'ok');
  assert.strictEqual(R.summarize(['leicht']).trend, 'ok');
});

test('Mehrheit ab zwei Antworten setzt den Trend', () => {
  assert.strictEqual(R.summarize(['schwer', 'schwer', 'leicht']).trend, 'hard');
  assert.strictEqual(R.summarize(['leicht', 'leicht', 'schwer']).trend, 'easy');
});

test('summarize wirft nicht bei leerer oder fehlender Liste', () => {
  assert.deepStrictEqual(R.summarize([]), { easy: 0, ok: 0, hard: 0, trend: 'ok' });
  assert.deepStrictEqual(R.summarize(null), { easy: 0, ok: 0, hard: 0, trend: 'ok' });
});

test('summarize zaehlt unbeantwortet und Unsinn nicht als passend', () => {
  assert.deepStrictEqual(R.summarize(['leicht', null, 'quatsch', undefined]),
    { easy: 1, ok: 0, hard: 0, trend: 'ok' });
});

test('summarize mischt deutsche und englische Antworten', () => {
  assert.deepStrictEqual(R.summarize(['hard', 'schwer', 'ok']),
    { easy: 0, ok: 1, hard: 2, trend: 'hard' });
});
