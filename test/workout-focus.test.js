/* GymTrack — Tests fuer js/workout-focus.js (Fokus-Modus im Training)

   Geprueft wird die Einheiten-Logik (Superset = EINE Einheit), die
   Zielwahl fuers Auto-Weiterscrollen (vorwaerts, Wrap, nie die eigene
   Einheit). Die Geometrie-Auswahl ist mit dem Seiten-Pager entfallen — welche
   Uebung "dran" ist, ist dort der Seitenindex (s. js/workout-pager.js). */
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

