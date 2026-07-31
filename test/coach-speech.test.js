/* GymTrack — Tests fuer den Sprach-Parser im Training (Coach-Leiste).

   Der Parser entscheidet, ob eine DIKTIERTE Aeusserung eine HANDLUNG ist
   (Satz eintragen, Satz anhaengen) oder eine Frage, die weiterlaufen soll.
   Genau diese Trennung wird hier festgenagelt — beide Richtungen:
   was er greifen MUSS und was er in Ruhe lassen muss.

   Die Ausfallrichtung ist ueberall dieselbe: im Zweifel null. Ein null laesst
   die Aeusserung an den Intent-Router und danach ans Modell weiterlaufen, ein
   falscher Treffer traegt ungefragt Zahlen ins Trainingsprotokoll ein. */
const test = require('node:test');
const assert = require('node:assert');
const SP = require('../js/coach-speech.js');

const DE = { lang: 'de' };
const EN = { lang: 'en' };

/* ---------- Modul-Vertrag ---------- */

test('Modul haengt sich auch an globalThis (Browser-Verdrahtung)', () => {
  assert.strictEqual(globalThis.CoachSpeech, SP);
});

test('Leere und unsinnige Eingaben ergeben null', () => {
  assert.strictEqual(SP.parse('', DE), null);
  assert.strictEqual(SP.parse(null, DE), null);
  assert.strictEqual(SP.parse('   ', DE), null);
});

/* ---------- Satz diktieren: Gewicht + Wiederholungen ---------- */

test('Gewicht und Wiederholungen mit Einheiten', () => {
  assert.deepStrictEqual(SP.parse('80 Kilo 8 Wiederholungen', DE),
    { kind: 'logSet', weight: 80, unit: 'kg', reps: 8 });
});

test('Kurzform "80 mal 8" — erst Gewicht, dann Wiederholungen', () => {
  assert.deepStrictEqual(SP.parse('80 mal 8', DE),
    { kind: 'logSet', weight: 80, unit: null, reps: 8 });
});

test('Umgekehrte Reihenfolge: Wiederholungen zuerst', () => {
  assert.deepStrictEqual(SP.parse('8 Wiederholungen mit 80 Kilo', DE),
    { kind: 'logSet', weight: 80, unit: 'kg', reps: 8 });
});

test('Kommazahl bleibt eine Zahl (82,5 kg)', () => {
  assert.deepStrictEqual(SP.parse('82,5 kg 6 Wdh', DE),
    { kind: 'logSet', weight: 82.5, unit: 'kg', reps: 6 });
});

test('Punkt als Dezimaltrenner ebenso', () => {
  assert.deepStrictEqual(SP.parse('82.5 kg 6 Wdh', DE),
    { kind: 'logSet', weight: 82.5, unit: 'kg', reps: 6 });
});

test('Ganzer Satz mit Fuellwoertern', () => {
  assert.deepStrictEqual(SP.parse('ich hab 100 Kilo 5 mal gemacht', DE),
    { kind: 'logSet', weight: 100, unit: 'kg', reps: 5 });
});

test('Pfund/lbs wird als Einheit gemeldet, NICHT umgerechnet', () => {
  // Umrechnen darf nur die App (dispToKg) — das Modul kennt den Einheitenmodus
  // des Nutzers nicht und wuerde sonst zweimal umrechnen.
  assert.deepStrictEqual(SP.parse('185 lbs 5 reps', EN),
    { kind: 'logSet', weight: 185, unit: 'lbs', reps: 5 });
});

test('Nur Wiederholungen, ohne Gewicht', () => {
  assert.deepStrictEqual(SP.parse('8 Wiederholungen', DE),
    { kind: 'logSet', weight: null, unit: null, reps: 8 });
});

test('Nur Gewicht, ohne Wiederholungen', () => {
  assert.deepStrictEqual(SP.parse('80 Kilo', DE),
    { kind: 'logSet', weight: 80, unit: 'kg', reps: null });
});

test('Zahlwoerter werden verstanden', () => {
  assert.deepStrictEqual(SP.parse('acht Wiederholungen', DE),
    { kind: 'logSet', weight: null, unit: null, reps: 8 });
  assert.deepStrictEqual(SP.parse('twelve reps', EN),
    { kind: 'logSet', weight: null, unit: null, reps: 12 });
});

test('Englische Kurzform', () => {
  assert.deepStrictEqual(SP.parse('80 kilos for 8 reps', EN),
    { kind: 'logSet', weight: 80, unit: 'kg', reps: 8 });
});

/* ---------- Satz diktieren: was NICHT eingetragen werden darf ---------- */

test('Blosse Zahl ohne Einheit und ohne zweite Zahl ist mehrdeutig -> null', () => {
  assert.strictEqual(SP.parse('80', DE), null);
  assert.strictEqual(SP.parse('acht', DE), null);
});

test('Frage mit Zahl wird NICHT als Satz eingetragen', () => {
  assert.strictEqual(SP.parse('sind 80 Kilo zu viel?', DE), null);
  assert.strictEqual(SP.parse('warum 80 Kilo?', DE), null);
  assert.strictEqual(SP.parse('schaffe ich 8 Wiederholungen?', DE), null);
  assert.strictEqual(SP.parse('is 185 lbs too heavy?', EN), null);
});

test('Gesundheitssignal beendet den Parser vollstaendig', () => {
  // Dasselbe globale Gate wie im Intent-Router: eine Aeusserung mit
  // Krankheits-/Beschwerdesignal wird NIE lokal behandelt.
  assert.strictEqual(SP.parse('80 Kilo 8 Wiederholungen, Schulter tut weh', DE), null);
  assert.strictEqual(SP.parse('soll ich noch einen Topsatz machen? Mein Knie zwickt', DE), null);
  assert.strictEqual(SP.parse('ich bin erkaeltet, 80 Kilo 8 Wiederholungen', DE), null);
});

test('Unplausible Werte werden verworfen', () => {
  assert.strictEqual(SP.parse('900 Kilo 8 Wiederholungen', DE), null);
  assert.strictEqual(SP.parse('80 Kilo 300 Wiederholungen', DE), null);
});

test('Drei Zahlen sind kein eindeutiger Satz', () => {
  assert.strictEqual(SP.parse('80 8 12', DE), null);
});

/* ---------- Satz anhaengen ---------- */

test('Topsatz-Frage wird als Handlung erkannt', () => {
  assert.deepStrictEqual(SP.parse('soll ich noch einen Topsatz machen?', DE),
    { kind: 'addSet', top: true, weight: null, unit: null });
});

test('Topsatz auch ohne Frageform', () => {
  assert.deepStrictEqual(SP.parse('Topsatz', DE),
    { kind: 'addSet', top: true, weight: null, unit: null });
  assert.deepStrictEqual(SP.parse('top set', EN),
    { kind: 'addSet', top: true, weight: null, unit: null });
});

test('Normaler Zusatzsatz ist KEIN Topsatz', () => {
  assert.deepStrictEqual(SP.parse('noch einen Satz', DE),
    { kind: 'addSet', top: false, weight: null, unit: null });
  assert.deepStrictEqual(SP.parse('one more set', EN),
    { kind: 'addSet', top: false, weight: null, unit: null });
});

test('Zusatzsatz mit Wunschgewicht', () => {
  assert.deepStrictEqual(SP.parse('noch einen Satz mit 90 Kilo', DE),
    { kind: 'addSet', top: false, weight: 90, unit: 'kg' });
});

test('Blosses "Satz" ohne Zusatzwort ist zu duenn -> null', () => {
  assert.strictEqual(SP.parse('Satz', DE), null);
  assert.strictEqual(SP.parse('set', EN), null);
});

test('Fragen UEBER Saetze bleiben Fragen', () => {
  assert.strictEqual(SP.parse('wie viele Saetze habe ich noch?', DE), null);
  assert.strictEqual(SP.parse('war das mein letzter Satz?', DE), null);
  assert.strictEqual(SP.parse('how many sets are left?', EN), null);
});

/* ---------- Uebung erklaeren ---------- */

test('Ausfuehrungsfragen werden als Erklaerwunsch erkannt', () => {
  assert.strictEqual(SP.parse('wie fuehre ich die Uebung aus?', DE).kind, 'explain');
  assert.strictEqual(SP.parse('erklaer mir Bankdruecken', DE).kind, 'explain');
  assert.strictEqual(SP.parse('worauf muss ich achten?', DE).kind, 'explain');
  assert.strictEqual(SP.parse('how do I do this exercise?', EN).kind, 'explain');
});

test('Erklaerwunsch reicht den Originaltext durch (Uebungsname loest die App auf)', () => {
  assert.strictEqual(SP.parse('erklaer mir Bankdruecken', DE).q, 'erklaer mir Bankdruecken');
});

test('Ein Satz-Diktat ist kein Erklaerwunsch, auch wenn "richtig" drin steht', () => {
  assert.strictEqual(SP.parse('80 Kilo 8 Wiederholungen', DE).kind, 'logSet');
});

test('Gesundheitsfrage wird nie zum Erklaerwunsch', () => {
  assert.strictEqual(SP.parse('wie fuehre ich das aus, ohne dass mein Ruecken schmerzt?', DE), null);
});
