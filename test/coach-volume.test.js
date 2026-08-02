/* GymTrack — Tests fuer Wochenvolumen und Frequenz je Muskelgruppe.

   Scharf gehalten werden drei Zusagen:
   1. Gezaehlt wird nur, was im Fenster liegt und vollstaendig ist. Eine halbe
      Zeile (ohne Muskelgruppe, ohne Satzzahl, mit kaputtem Zeitstempel) darf
      das Ergebnis weder verschieben noch werfen.
   2. Frequenz zaehlt TAGE, nicht Einheiten — zwei Einheiten am selben Tag sind
      ein Reiz. Sonst sieht ein Doppel am Samstag aus wie zweimal Training.
   3. Das Urteil haengt an den Richtwerten und die Reihenfolge an der
      Dringlichkeit: was zu wenig ist, steht oben. Wer die Liste von oben
      liest, liest die Handlung zuerst. */
const test = require('node:test');
const assert = require('node:assert');
const V = require('../js/coach-volume.js');

const TAG = 864e5;
const JETZT = 1700000000000;      // fester Zeitpunkt, keine Uhr im Test

test('weekLoad zaehlt Saetze je Muskelgruppe im Fenster', () => {
  const rows = [
    { ts: JETZT - 1 * TAG, mg: 'brust', sets: 6 },
    { ts: JETZT - 3 * TAG, mg: 'brust', sets: 6 },
    { ts: JETZT - 2 * TAG, mg: 'ruecken', sets: 4 },
  ];
  const l = V.weekLoad(rows, JETZT, 1);
  assert.strictEqual(l.byMuscle.brust.sets, 12);
  assert.strictEqual(l.byMuscle.ruecken.sets, 4);
  assert.strictEqual(l.totalSets, 16);
});

test('weekLoad laesst alles ausserhalb des Fensters liegen', () => {
  const rows = [
    { ts: JETZT - 2 * TAG, mg: 'beine', sets: 5 },
    { ts: JETZT - 9 * TAG, mg: 'beine', sets: 99 },   // vorige Woche
    { ts: JETZT + 1 * TAG, mg: 'beine', sets: 99 },   // Zukunft
  ];
  assert.strictEqual(V.weekLoad(rows, JETZT, 1).byMuscle.beine.sets, 5);
});

test('weekLoad ueberspringt unvollstaendige Zeilen, ohne zu werfen', () => {
  const rows = [
    { ts: JETZT - 1 * TAG, mg: 'arme', sets: 3 },
    { ts: JETZT - 1 * TAG, mg: '', sets: 5 },
    { ts: JETZT - 1 * TAG, mg: 'arme', sets: 0 },
    { ts: NaN, mg: 'arme', sets: 5 },
    null,
  ];
  const l = V.weekLoad(rows, JETZT, 1);
  assert.strictEqual(l.byMuscle.arme.sets, 3);
  assert.strictEqual(Object.keys(l.byMuscle).length, 1);
});

test('Frequenz zaehlt Tage, nicht Einheiten', () => {
  const rows = [
    { ts: JETZT - 2 * TAG, mg: 'brust', sets: 5 },
    { ts: JETZT - 2 * TAG + 3600e3, mg: 'brust', sets: 5 },   // gleicher Tag
  ];
  assert.strictEqual(V.weekLoad(rows, JETZT, 1).byMuscle.brust.days, 1);
});

test('Vier-Wochen-Fenster rechnet auf die Woche herunter', () => {
  const rows = [];
  for (let i = 1; i <= 4; i++) rows.push({ ts: JETZT - i * 7 * TAG + TAG, mg: 'beine', sets: 12 });
  const l = V.weekLoad(rows, JETZT, 4);
  assert.strictEqual(l.byMuscle.beine.sets, 48);
  assert.strictEqual(l.byMuscle.beine.setsPerWeek, 12);
});

test('verdict bindet das Urteil an die Richtwerte', () => {
  const l = V.weekLoad([
    { ts: JETZT - TAG, mg: 'brust', sets: 6 },     // unter MEV
    { ts: JETZT - TAG, mg: 'ruecken', sets: 14 },  // im Bereich
    { ts: JETZT - TAG, mg: 'beine', sets: 26 },    // ueber MAV
  ], JETZT, 1);
  const v = V.verdict(l);
  const of = mg => v.find(x => x.mg === mg);
  assert.strictEqual(of('brust').state, 'low');
  assert.strictEqual(of('ruecken').state, 'ok');
  assert.strictEqual(of('beine').state, 'high');
  assert.strictEqual(v[0].mg, 'brust');            // Dringlichstes zuerst
});

test('verdict meldet zu seltene Frequenz getrennt vom Volumen', () => {
  const l = V.weekLoad([{ ts: JETZT - TAG, mg: 'ruecken', sets: 14 }], JETZT, 1);
  const zeile = V.verdict(l)[0];
  assert.strictEqual(zeile.state, 'ok');
  assert.strictEqual(zeile.freqLow, true);         // alles an einem Tag
});

test('worstFirst nimmt zu wenig Volumen vor zu seltener Frequenz', () => {
  const l = V.weekLoad([
    { ts: JETZT - TAG, mg: 'brust', sets: 5 },
    { ts: JETZT - 2 * TAG, mg: 'ruecken', sets: 14 },
  ], JETZT, 1);
  assert.strictEqual(V.worstFirst(V.verdict(l)).mg, 'brust');
});

test('worstFirst schweigt, wenn nichts zu tun ist', () => {
  const rows = [
    { ts: JETZT - TAG, mg: 'brust', sets: 7 },
    { ts: JETZT - 4 * TAG, mg: 'brust', sets: 7 },
  ];
  assert.strictEqual(V.worstFirst(V.verdict(V.weekLoad(rows, JETZT, 1))), null);
});

test('eigene Richtwerte schlagen die Vorgaben', () => {
  const l = V.weekLoad([{ ts: JETZT - TAG, mg: 'core', sets: 8 }], JETZT, 1);
  assert.strictEqual(V.verdict(l, { mev: 6 })[0].state, 'ok');
});
