const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/coach-intent.js');

const SNAP = {
  exercises: [{ id: 'ex1', name: 'Bankdruecken', muscleGroup: 'brust' },
              { id: 'ex2', name: 'Kniebeuge', muscleGroup: 'beine' }],
  bestSet:  { ex1: { w: 80, r: 8, date: '2026-07-20' } },
  lastDone: { ex1: '2026-07-20' },
  // setsTotal/setsDone bewusst NICHT 4/2: die Differenz (links) darf keinen der
  // beiden Eingabewerte treffen, sonst wuerde ein Bug (z.B. links=setsDone statt
  // setsTotal-setsDone) denselben Text erzeugen und der Test wuerde nicht kippen.
  active:   { exId: 'ex1', setsTotal: 5, setsDone: 2, nextW: 82.5 },
  restLeftSec: 45,
  recovery: { Brust: 92, Beine: 40 },
  weekVolumeKg: 12500,
  todayText: 'Beine stehen heute an.'
};

test('naechstes Gewicht', () => {
  const r = R.resolveIntent('wie viel gewicht beim naechsten satz?', SNAP);
  assert.strictEqual(r.intent, 'nextWeight');
  assert.ok(r.answer.includes('82,5'));
});

test('Rekord bei einer Uebung', () => {
  const r = R.resolveIntent('was ist mein rekord bei bankdruecken?', SNAP);
  assert.strictEqual(r.intent, 'best');
  assert.ok(r.answer.includes('80 kg'));
  // Nicht bloss includes('8') pruefen: das waere durch '80' schon erfuellt und
  // haette nie testen koennen, ob die Wiederholungszahl ueberhaupt im Text steht.
  assert.ok(r.answer.includes('mal 8 Wiederholungen'));
});

test('verbleibende Saetze', () => {
  const r = R.resolveIntent('wie viele saetze noch?', SNAP);
  assert.strictEqual(r.intent, 'setsLeft');
  assert.ok(r.answer.includes('3'));
});

test('Restpause', () => {
  const r = R.resolveIntent('wie lange noch pause?', SNAP);
  assert.strictEqual(r.intent, 'rest');
  assert.ok(r.answer.includes('45'));
});

test('Erholung einer Muskelgruppe', () => {
  const r = R.resolveIntent('wie erholt ist meine brust?', SNAP);
  assert.strictEqual(r.intent, 'recovery');
  assert.ok(r.answer.includes('92'));
});

test('letzte Ausfuehrung', () => {
  const r = R.resolveIntent('wann hatte ich zuletzt bankdruecken?', SNAP);
  assert.strictEqual(r.intent, 'lastDone');
  assert.ok(r.answer.includes('20.07.2026'));
});

test('Wochenvolumen', () => {
  const r = R.resolveIntent('wie viel volumen diese woche?', SNAP);
  assert.strictEqual(r.intent, 'volume');
  assert.ok(r.answer.includes('12.500'));
});

test('was steht heute an', () => {
  const r = R.resolveIntent('was steht heute an?', SNAP);
  assert.strictEqual(r.intent, 'today');
  assert.strictEqual(r.answer, 'Beine stehen heute an.');
});

test('englische Frage wird erkannt', () => {
  const r = R.resolveIntent('what is my record on bench press?', {
    ...SNAP,
    exercises: [{ id: 'ex1', name: 'Bench Press', muscleGroup: 'brust' }]
  });
  assert.strictEqual(r.intent, 'best');
});

test('Rekord fuer unbekannte Uebung geht ans Modell', () => {
  assert.strictEqual(R.resolveIntent('was ist mein rekord bei nackenziehen?', SNAP), null);
});

test('offene Frage geht ans Modell', () => {
  assert.strictEqual(R.resolveIntent('soll ich heute lieber cardio machen oder beine?', SNAP), null);
});

test('Planwunsch geht ans Modell', () => {
  assert.strictEqual(R.resolveIntent('erstell mir einen trainingsplan fuer 4 tage', SNAP), null);
});

test('Schmerzmeldung geht ans Modell', () => {
  assert.strictEqual(R.resolveIntent('meine schulter tut beim bankdruecken weh', SNAP), null);
});

test('naechster Satz ohne Gewichtsbezug geht ans Modell (Uebungswahl)', () => {
  // "naechste[nsr]? satz" darf nicht als eigenstaendige Alternative ohne
  // Gewichtskontext feuern -- sonst antwortet der Router konfident falsch auf
  // Fragen zur Uebungswahl statt gar nicht zu antworten.
  assert.strictEqual(R.resolveIntent('was mache ich beim naechsten satz?', SNAP), null);
});

test('naechster Satz ohne Gewichtsbezug geht ans Modell (Wiederholungen)', () => {
  assert.strictEqual(
    R.resolveIntent('wie viele wiederholungen beim naechsten satz?', SNAP),
    null
  );
});

test('Gewichtsfrage mit "naechster Satz"-Phrasierung bleibt erkannt', () => {
  const r = R.resolveIntent('gewicht fuer den naechsten satz?', SNAP);
  assert.strictEqual(r.intent, 'nextWeight');
  assert.ok(r.answer.includes('82,5'));
});

test('fehlende Daten ergeben kein Ergebnis', () => {
  assert.strictEqual(R.resolveIntent('wie lange noch pause?', { restLeftSec: 0 }), null);
  assert.strictEqual(R.resolveIntent('wie viele saetze noch?', {}), null);
});

test('leere Eingabe ergibt null', () => {
  assert.strictEqual(R.resolveIntent('', SNAP), null);
  assert.strictEqual(R.resolveIntent(null, SNAP), null);
});
