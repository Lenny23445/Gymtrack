/* GymTrack — Tests fuer die Taktung der Aufbau-Animation (js/app-reveal.js)

   Anlass (05.08.2026): Die Erholungs-Batterien im Statistik-Tab "luden sich
   nicht". Die Mechanik lief einwandfrei — Versatz wurde gesetzt, Farbe wurde
   wiederhergestellt, der Uebergang startete. Trotzdem sah niemand einen
   Ladevorgang, und zwar aus einem Grund, den kein Vorhandensein-Test findet:
   fuenf Striche mit 30 ms Abstand bei 450 ms Uebergangsdauer ueberlappen zu
   ueber 90 %. Sichtbar war ein gemeinsames Einfaerben, kein Nacheinander.

   Deshalb prueft diese Datei nicht, DASS getaktet wird, sondern WIE:

   1. Der Abstand zwischen zwei Strichen muss gross genug gegen ihre
      Uebergangsdauer sein — sonst verschmelzen sie wieder.
   2. Eine Reihe mit fuenf Strichen und eine mit zwoelf muessen ungefaehr
      gleich lange brauchen. Sonst tickert die lange doppelt so lange wie die
      kurze, obwohl beide dasselbe meinen.

   Der DOM-Teil des Moduls ist hier bewusst nicht abgedeckt — er braucht einen
   echten Browser (Layout, Uebergaenge) und steht im Rauchtest. Geprueft wird
   die Rechnung, und die ist genau die Stelle, an der der Fehler sass. */
const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/app-reveal.js');

test('segSchritt: eine einzelne Zelle braucht keinen Abstand', () => {
  assert.strictEqual(R.segSchritt(1), 0);
  assert.strictEqual(R.segSchritt(0), 0);
});

test('segSchritt: Striche zuenden sichtbar nacheinander, nicht ineinander', () => {
  // Die Grenze ist nicht willkuerlich: liegt der Abstand deutlich unter der
  // Uebergangsdauer, sieht man ein gemeinsames Einfaerben statt einer Reihe.
  // Genau das war der gemeldete Fehler.
  for (const n of [2, 3, 5, 8, 12]) {
    const schritt = R.segSchritt(n);
    assert.ok(schritt >= R.SEG_MS / 4,
      n + ' Striche: Abstand ' + schritt + ' ms ist zu klein gegen ' + R.SEG_MS + ' ms Uebergang');
  }
});

test('segSchritt: kurze und lange Reihe brauchen aehnlich lange', () => {
  const dauer = n => (n - 1) * R.segSchritt(n) + R.SEG_MS;
  const kurz = dauer(5), lang = dauer(12);
  assert.ok(Math.abs(kurz - lang) < 250,
    'fuenf Striche ' + kurz + ' ms gegen zwoelf Striche ' + lang + ' ms');
});

test('segSchritt: keine Reihe zieht sich ueber eine Sekunde', () => {
  for (const n of [2, 5, 8, 12, 20]) {
    const dauer = (n - 1) * R.segSchritt(n) + R.SEG_MS;
    assert.ok(dauer <= 1000, n + ' Striche dauern ' + dauer + ' ms');
  }
});

test('segSchritt: haelt Unsinn aus', () => {
  assert.strictEqual(R.segSchritt(null), 0);
  assert.strictEqual(R.segSchritt(NaN), 0);
  assert.strictEqual(R.segSchritt(-3), 0);
});

test('verzug: waechst je Element und wird gedeckelt', () => {
  assert.strictEqual(R.verzug(0), 0);
  assert.strictEqual(R.verzug(1), R.STUFE);
  assert.strictEqual(R.verzug(999), R.MAX_VERZUG);
  assert.strictEqual(R.verzug(null), 0);
});
