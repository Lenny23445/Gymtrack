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

test('Frage zum Ruhetag ist keine Restpause-Frage (geht ans Modell)', () => {
  // "how long.*rest" allein hat kein Themen-Anker: "rest day" (Ruhetag) triggert
  // denselben Wildcard-Bug wie bei Intent 1/3 -- der Router wuerde konfident (aber
  // falsch) den laufenden Pausen-Timer nennen, obwohl nach einem Ruhetag gefragt wird.
  assert.strictEqual(
    R.resolveIntent('How long has it been since my last rest day?', SNAP),
    null
  );
});

test('"rest" als normales englisches Pronomen matcht nicht (geht ans Modell)', () => {
  // Hier ist "rest" gar kein Fitness-Wort, sondern das Pronomen "der Rest" (of my
  // friends). Ohne Themen-Anker matcht "how long.*rest" trotzdem.
  assert.strictEqual(
    R.resolveIntent('How long till the rest of my friends arrive?', SNAP),
    null
  );
});

test('echte Frage zum laufenden Pausen-Timer bleibt erkannt', () => {
  const r = R.resolveIntent('How long until my rest is over?', SNAP);
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

// --- Strukturelles Gate (Baustein 3, Nachaudit) ---------------------------
// "volume", "record" und "rest" sind ausserhalb des Trainingskontexts ganz
// normale Alltagswoerter. Das Gate verlangt fuer diese Ankerworte ein
// zweites, unabhaengiges Fitness-Wort im selben Satz -- ohne das bleibt der
// Treffer aus, auch wenn Snapshot-Daten (weekVolumeKg, bestSet) vorhanden
// waeren, die frueher trotzdem eine konfident falsche Antwort ausloesten.

test('Lautstaerke-Frage ist kein Trainingsvolumen (geht ans Modell)', () => {
  // Frueher matchte /volumen|volume|tonnage/ auf das nackte Wort "volume"
  // und beantwortete die Frage faelschlich mit dem Wochenvolumen.
  assert.strictEqual(R.resolveIntent('Can you turn up the volume?', SNAP), null);
});

test('"record" als Verb (Tagebuch fuehren) ist kein Rekord-Abruf (geht ans Modell)', () => {
  // Frueher matchte bare "record" plus der zufaellig im Satz enthaltene
  // Uebungsname "bankdruecken" -- der Router antwortete konfident mit dem
  // Bankdruecken-Rekord, obwohl der Nutzer sein Training nur protokollieren
  // (nicht abfragen) wollte.
  assert.strictEqual(
    R.resolveIntent('I want to record my bankdruecken workout in a journal', SNAP),
    null
  );
});

test('Restpause-Fragen ohne "rest timer"-Wortlaut bleiben lokal beantwortbar', () => {
  // Die vorherige Verschaerfung (nur noch "rest timer|rest is over|rest left"
  // nach "how long") hat diese vier echten Fragen zum laufenden Pausen-Timer
  // mitgetroffen und faelschlich null zurueckgegeben. Das Gate "my rest" /
  // "rest ... left" erkennt sie wieder, ohne die Ruhetag-/Freunde-Faelle
  // oben erneut durchzulassen.
  const phrasings = [
    'How long is my rest?',
    'how long left on my rest',
    'how long till my rest ends',
    'how much rest do i have left'
  ];
  phrasings.forEach((text) => {
    const r = R.resolveIntent(text, SNAP);
    assert.strictEqual(r && r.intent, 'rest', 'erwartet rest-Intent fuer: ' + text);
    assert.ok(r.answer.includes('45'), 'erwartet Pausenzeit im Text fuer: ' + text);
  });
});
