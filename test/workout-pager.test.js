/* GymTrack — Tests fuer js/workout-pager.js (Seiten-Pager im Training)

   Geprueft wird die Seiteneinteilung (Supersatz-Gruppe = EINE Seite,
   Abschluss-Seite immer zuletzt) und die Umrechnung zwischen Scrollstand und
   Seitenindex inkl. der Faelle, in denen die Seitenhoehe noch nicht bekannt
   ist. */
const test = require('node:test');
const assert = require('node:assert');
const P = require('../js/workout-pager.js');

const ex = () => ({ sets: [{ done: false }] });
const ss = (l, g) => Object.assign(l, { ssGroup: g });

test('pagesOf: jede Einzeluebung bekommt eine eigene Seite', () => {
  const pages = P.pagesOf([ex(), ex(), ex()]);
  assert.strictEqual(pages.length, 4);                 // 3 Uebungen + Abschluss
  assert.deepStrictEqual(pages.map(p => p.unit), [[0], [1], [2], []]);
  assert.deepStrictEqual(pages.map(p => p.key), ['0', '1', '2', 'end']);
});

test('pagesOf: Supersatz-Gruppe teilt sich EINE Seite', () => {
  const logs = [ex(), ss(ex(), 'g1'), ss(ex(), 'g1'), ex()];
  const pages = P.pagesOf(logs);
  assert.deepStrictEqual(pages.map(p => p.unit), [[0], [1, 2], [3], []]);
  assert.deepStrictEqual(pages.map(p => p.key), ['0', '1', '3', 'end']);
});

test('pagesOf: Abschluss-Seite steht auch ohne Uebungen bereit', () => {
  assert.deepStrictEqual(P.pagesOf([]), [{ unit: [], key: 'end' }]);
  assert.deepStrictEqual(P.pagesOf(null), [{ unit: [], key: 'end' }]);
});

test('pageIndexFor: trifft die Rastpunkte', () => {
  assert.strictEqual(P.pageIndexFor(0, 800, 4), 0);
  assert.strictEqual(P.pageIndexFor(800, 800, 4), 1);
  assert.strictEqual(P.pageIndexFor(2400, 800, 4), 3);
});

test('pageIndexFor: rundet zur naeheren Seite', () => {
  assert.strictEqual(P.pageIndexFor(399, 800, 4), 0);
  assert.strictEqual(P.pageIndexFor(401, 800, 4), 1);
});

test('pageIndexFor: klemmt an beiden Raendern', () => {
  assert.strictEqual(P.pageIndexFor(-500, 800, 4), 0);   // Gummikante oben
  assert.strictEqual(P.pageIndexFor(99999, 800, 4), 3);  // Gummikante unten
});

test('pageIndexFor: unbekannte Seitenhoehe liefert die erste Seite, nie NaN', () => {
  assert.strictEqual(P.pageIndexFor(500, 0, 4), 0);
  assert.strictEqual(P.pageIndexFor(500, -10, 4), 0);
  assert.strictEqual(P.pageIndexFor(NaN, 800, 4), 0);
  assert.strictEqual(P.pageIndexFor(500, 800, 0), 0);
});

test('scrollTopFor: ist die Umkehrung an den Rastpunkten', () => {
  for (let i = 0; i < 5; i++) {
    assert.strictEqual(P.pageIndexFor(P.scrollTopFor(i, 800), 800, 5), i);
  }
});

test('scrollTopFor: haelt sich bei unbrauchbaren Eingaben an 0', () => {
  assert.strictEqual(P.scrollTopFor(2, 0), 0);
  assert.strictEqual(P.scrollTopFor(-3, 800), 0);
  assert.strictEqual(P.scrollTopFor(NaN, 800), 0);
});

test('pageOfLi: beide Uebungen eines Supersatzes zeigen auf dieselbe Seite', () => {
  const pages = P.pagesOf([ex(), ss(ex(), 'g1'), ss(ex(), 'g1'), ex()]);
  assert.strictEqual(P.pageOfLi(pages, 1), 1);
  assert.strictEqual(P.pageOfLi(pages, 2), 1);
  assert.strictEqual(P.pageOfLi(pages, 3), 2);
});

test('pageOfLi: unbekannte Uebung liefert -1', () => {
  assert.strictEqual(P.pageOfLi(P.pagesOf([ex()]), 7), -1);
  assert.strictEqual(P.pageOfLi(null, 0), -1);
});
