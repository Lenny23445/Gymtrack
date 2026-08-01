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
