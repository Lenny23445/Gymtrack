/* GymTrack — Tests fuer js/workout-bar.js (Zahlen der Trainings-Leiste) */
const test = require('node:test');
const assert = require('node:assert');
const B = require('../js/workout-bar.js');

const log = (...done) => ({ sets: done.map(d => ({ done: d })) });

test('setProgress: leere Liste ergibt 0 von 0', () => {
  assert.deepStrictEqual(B.setProgress([]), { done: 0, total: 0 });
});

test('setProgress: zaehlt ueber alle Uebungen', () => {
  assert.deepStrictEqual(B.setProgress([log(true, false), log(true, true, false)]),
                         { done: 3, total: 5 });
});

test('setProgress: Aufwaermsaetze zaehlen mit — es ist eine Anzeige', () => {
  const logs = [{ sets: [{ done: true, type: 'warmup' }, { done: false }] }];
  assert.deepStrictEqual(B.setProgress(logs), { done: 1, total: 2 });
});

test('setProgress: haelt Unsinn aus', () => {
  assert.deepStrictEqual(B.setProgress(null), { done: 0, total: 0 });
  assert.deepStrictEqual(B.setProgress([{}, { sets: null }]), { done: 0, total: 0 });
});

test('restFraction: verbleibender Anteil, geklemmt', () => {
  assert.strictEqual(B.restFraction(90, 90), 1);
  assert.strictEqual(B.restFraction(45, 90), 0.5);
  assert.strictEqual(B.restFraction(0, 90), 0);
  assert.strictEqual(B.restFraction(120, 90), 1);
  assert.strictEqual(B.restFraction(-5, 90), 0);
});

test('restFraction: ohne sinnvolle Gesamtzeit 0', () => {
  assert.strictEqual(B.restFraction(30, 0), 0);
  assert.strictEqual(B.restFraction(30, -1), 0);
  assert.strictEqual(B.restFraction(30, null), 0);
});

/* revealDelta: Bezug ist die Buehne — oben verdeckt die klebende Leiste pad
   Pixel, unten ist bei stage Schluss. Rand 8 px. */
test('revealDelta: was schon ganz im Bild steht, bleibt liegen', () => {
  assert.strictEqual(B.revealDelta(200, 400, 800, 100), 0);
});

test('revealDelta: was unten rausragt, wird hochgeholt', () => {
  assert.strictEqual(B.revealDelta(600, 900, 800, 100), 108);
});

test('revealDelta: was unter der klebenden Leiste liegt, kommt darunter hervor', () => {
  assert.strictEqual(B.revealDelta(40, 300, 800, 100), -68);
});

test('revealDelta: passt der Kasten nicht ins Bild, gewinnt die Oberkante', () => {
  // 1000 hoch bei 800 Buehne: nach dem Hochholen laege der Kopf ausserhalb,
  // also zaehlt er — man muss sehen, WORUM es geht.
  assert.strictEqual(B.revealDelta(300, 1300, 800, 100), 192);
});

test('revealDelta: Zwerg-Verschiebungen zaehlen nicht als Bewegung', () => {
  assert.strictEqual(B.revealDelta(110, 791, 800, 100), 0);
});

test('revealDelta: haelt Unsinn aus', () => {
  assert.strictEqual(B.revealDelta(NaN, 100, 800, 100), 0);
  assert.strictEqual(B.revealDelta(100, NaN, 800, 100), 0);
  assert.strictEqual(B.revealDelta(100, 200, NaN, 100), 0);
});
