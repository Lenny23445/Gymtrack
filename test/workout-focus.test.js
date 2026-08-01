/* GymTrack — Tests fuer js/workout-focus.js (Fokus-Modus im Training)

   Geprueft wird die Einheiten-Logik (Superset = EINE Einheit), die
   Zielwahl fuers Auto-Weiterscrollen (vorwaerts, Wrap, nie die eigene
   Einheit) und die Geometrie-Auswahl inkl. Karten, die hoeher als der
   Sichtbereich sind. */
const test = require('node:test');
const assert = require('node:assert');
const F = require('../js/workout-focus.js');

const open = () => ({ sets: [{ done: false }] });
const done = () => ({ sets: [{ done: true }, { done: true }] });
const ss = (l, g) => Object.assign(l, { ssGroup: g });

test('focusUnitOf: Einzeluebung ist ihre eigene Einheit', () => {
  assert.deepStrictEqual(F.focusUnitOf([open(), open()], 1), [1]);
});

test('focusUnitOf: Superset-Partner bilden eine Einheit', () => {
  const logs = [open(), ss(open(), 'g1'), ss(open(), 'g1'), open()];
  assert.deepStrictEqual(F.focusUnitOf(logs, 2), [1, 2]);
});

test('focusUnitOf: ungueltiger Index liefert leere Einheit', () => {
  assert.deepStrictEqual(F.focusUnitOf([open()], 5), []);
  assert.deepStrictEqual(F.focusUnitOf([open()], -1), []);
});

test('nextOpenUnit: springt zur naechsten Uebung mit offenem Satz', () => {
  assert.strictEqual(F.nextOpenUnit([done(), open()], 0), 1);
});

test('nextOpenUnit: ueberspringt fertige Einheiten und wrappt an den Anfang', () => {
  assert.strictEqual(F.nextOpenUnit([open(), done(), done()], 2), 0);
});

test('nextOpenUnit: Superset zaehlt als eine Einheit — Ziel ist die ERSTE Karte', () => {
  const logs = [done(), ss(open(), 'g1'), ss(open(), 'g1')];
  assert.strictEqual(F.nextOpenUnit(logs, 0), 1);
});

test('nextOpenUnit: die eigene Einheit ist nie das Ziel', () => {
  const logs = [ss(open(), 'g1'), ss(open(), 'g1')];
  assert.strictEqual(F.nextOpenUnit(logs, 0), null);
});

test('nextOpenUnit: alles fertig -> null', () => {
  assert.strictEqual(F.nextOpenUnit([done(), done()], 0), null);
  assert.strictEqual(F.nextOpenUnit([], 0), null);
});

test('pickFocused: Karte unterm Mittelpunkt gewinnt — auch eine sehr hohe', () => {
  const rects = [{ top: 0, bottom: 80 }, { top: 80, bottom: 900 }];
  assert.strictEqual(F.pickFocused(rects, 400), 1);
});

test('pickFocused: ohne Ueberdeckung gewinnt die naechste Kartenmitte', () => {
  const rects = [{ top: -200, bottom: -20 }, { top: 30, bottom: 90 }];
  assert.strictEqual(F.pickFocused(rects, 0), 1);
});

test('pickFocused: leere Liste -> -1', () => {
  assert.strictEqual(F.pickFocused([], 100), -1);
});

test('pickFocusedStable: ohne Vorzustand wie pickFocused', () => {
  const rects = [{ top: 0, bottom: 80 }, { top: 80, bottom: 900 }];
  assert.strictEqual(F.pickFocusedStable(rects, 400, -1, 56), 1);
  assert.strictEqual(F.pickFocusedStable(rects, 400, null, 56), 1);
  assert.strictEqual(F.pickFocusedStable([], 10, 0, 56), -1);
});

test('pickFocusedStable: gewaehlte Karte behaelt den Fokus, solange sie die Mitte beruehrt', () => {
  const rects = [{ top: 0, bottom: 300 }, { top: 300, bottom: 600 }];
  // 299 liegt in Karte 0 — Karte 1 darf sie nicht wegschnappen
  assert.strictEqual(F.pickFocusedStable(rects, 299, 0, 56), 0);
});

test('pickFocusedStable: knapper Herausforderer verliert (das war das Flackern)', () => {
  // Mitte 210: Karte 0 (Mitte 100) ist 110 weg, Karte 1 (Mitte 300) 90 — Karte 1
  // liegt naeher, aber nur um 20 px. Mit 56 px Vorsprung bleibt der Fokus stehen.
  const rects = [{ top: 80, bottom: 120 }, { top: 280, bottom: 320 }];
  assert.strictEqual(F.pickFocused(rects, 210), 1);
  assert.strictEqual(F.pickFocusedStable(rects, 210, 0, 56), 0);
});

test('pickFocusedStable: deutlich naeherer Herausforderer gewinnt', () => {
  const rects = [{ top: -400, bottom: -360 }, { top: 190, bottom: 230 }];
  assert.strictEqual(F.pickFocusedStable(rects, 210, 0, 56), 1);
});

test('pickFocusedStable: unbrauchbares cur oder slack bricht nichts', () => {
  const rects = [{ top: 0, bottom: 80 }, { top: 80, bottom: 900 }];
  assert.strictEqual(F.pickFocusedStable(rects, 400, 99, 56), 1);
  assert.strictEqual(F.pickFocusedStable(rects, 400, 0, NaN), 1);
});
