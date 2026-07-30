/* GymTrack — Tests fuer js/coach-warmup.js (Task 14, Block 3)

   Kern der Pruefung ist nicht das Prozentschema (das ist eine Konstante),
   sondern die Rundung: ein Aufwaermgewicht, das mit echtem Hantelmaterial
   nicht auflegbar ist, ist als Ansage wertlos. Darum pruefen mehrere Faelle
   das Scheibenraster und die harten Zusicherungen (nie >= Arbeitsgewicht,
   streng steigend, keine Doppelstufe) statt nur einzelner Zahlen. */
const test = require('node:test');
const assert = require('node:assert');
const W = require('../js/coach-warmup.js');

// Scheibenraster: 'step' ist die kleinste Scheibe JE SEITE, an der Stange
// liegen Scheiben paarweise -> die kleinste Gesamtstufe ueber der Stange ist
// 2*step. Ohne Stange (Maschine/Steckgewicht) ist step die Stufe selbst.
function inc(step, bar) { return bar > 0 ? step * 2 : step; }

function kgs(sets) { return sets.map(s => s.kg); }

test('roundToPlate rundet nur den Anteil ueber der Stange, nach oben', () => {
  // Gesamtgewicht-Rundung ergaebe hier 42,5 kg (Scheibenpaar ignoriert).
  assert.strictEqual(W.roundToPlate(43.7, 2.5, 20), 45);
});

test('roundToPlate rundet nur den Anteil ueber der Stange, nach unten', () => {
  assert.strictEqual(W.roundToPlate(41.2, 2.5, 20), 40);
});

test('roundToPlate ohne Stange rundet auf die Stufe der Maschine', () => {
  assert.strictEqual(W.roundToPlate(52, 5, 0), 50);
});

test('roundToPlate faellt nie unter das Stangengewicht', () => {
  assert.strictEqual(W.roundToPlate(12, 2.5, 20), 20);
});

test('roundToPlate trifft ueber einen Bereich immer das Scheibenraster', () => {
  const step = 2.5, bar = 20, i = inc(step, bar);
  for (let kg = 30; kg <= 200; kg += 0.1) {
    const r = W.roundToPlate(kg, step, bar);
    const rest = Math.round(((r - bar) / i) * 1000) / 1000;
    assert.strictEqual(rest, Math.round(rest), 'nicht auflegbar bei ' + kg + ': ' + r);
    assert.ok(Math.abs(r - kg) <= i / 2 + 1e-9, 'zu weit weg bei ' + kg + ': ' + r);
  }
});

test('warmupSets haelt sich an das Schema 50/70/85 mit 5/3/1', () => {
  const sets = W.warmupSets(100, { step: 2.5, barKg: 20 });
  assert.strictEqual(sets.length, 3);
  assert.deepStrictEqual(sets.map(s => s.reps), [5, 3, 1]);
  assert.deepStrictEqual(sets.map(s => s.pct), [50, 70, 85]);
  assert.deepStrictEqual(kgs(sets), [50, 70, 85]);
});

test('kein Aufwaermsatz erreicht das Arbeitsgewicht', () => {
  [60, 82.5, 100, 140, 47.5].forEach(kg => {
    const sets = W.warmupSets(kg);
    assert.ok(sets.length > 0, 'keine Aufwaermsaetze bei ' + kg);
    sets.forEach(s => assert.ok(s.kg < kg, s.kg + ' >= Arbeitsgewicht ' + kg));
  });
});

test('auch bei grober Stufe erreicht kein Aufwaermsatz das Arbeitsgewicht', () => {
  // 85 % von 40 sind 34 und runden bei 20er-Stufen AUF 40 — genau das
  // Arbeitsgewicht. Wer nach dem Runden nicht mehr filtert, liefert hier
  // einen 'Aufwaermsatz' auf Arbeitsgewicht.
  const sets = W.warmupSets(40, { step: 20, barKg: 0 });
  assert.ok(sets.length > 0, 'Liste unerwartet leer');
  sets.forEach(s => assert.ok(s.kg < 40, s.kg + ' >= Arbeitsgewicht 40'));
});

test('die Aufwaermsaetze steigen streng an', () => {
  const sets = W.warmupSets(120, { step: 2.5, barKg: 20 });
  assert.strictEqual(sets.length, 3, 'ohne drei Saetze prueft die Schleife nichts');
  for (let i = 1; i < sets.length; i++) {
    assert.ok(sets[i].kg > sets[i - 1].kg, 'nicht streng steigend: ' + kgs(sets).join(','));
  }
});

test('zu leichtes oder fehlendes Arbeitsgewicht ergibt keine Aufwaermsaetze', () => {
  [25, 0, null, undefined, -80, NaN, '100'].forEach(v => {
    assert.deepStrictEqual(W.warmupSets(v), [], 'nicht leer bei ' + String(v));
  });
});

test('eine Stange schwerer als das Arbeitsgewicht ergibt keine Aufwaermsaetze', () => {
  assert.deepStrictEqual(W.warmupSets(60, { step: 2.5, barKg: 60 }), []);
});

test('die Schrittweite der Maschine wird eingehalten', () => {
  const sets = W.warmupSets(80, { step: 5, barKg: 0 });
  assert.ok(sets.length > 0);
  sets.forEach(s => assert.strictEqual(s.kg % 5, 0, 'nicht auf 5er-Stufe: ' + s.kg));
});

test('fehlende Option faellt auf den Standardwert zurueck', () => {
  // barKg fehlt -> 20 kg Langhantel, step 5 -> 10er-Stufen ueber der Stange.
  const sets = W.warmupSets(100, { step: 5 });
  assert.ok(sets.length > 0);
  sets.forEach(s => assert.strictEqual((s.kg - 20) % 10, 0, 'nicht auflegbar: ' + s.kg));
});

test('gleich gerundete Prozentstufen werden zu einem Satz zusammengefasst', () => {
  // 50 % und 70 % von 30 kg landen beide auf der leeren 20-kg-Stange.
  const sets = W.warmupSets(30, { step: 2.5, barKg: 20 });
  assert.ok(sets.length >= 1, 'Liste unerwartet leer');
  assert.ok(sets.length < 3, 'Doppelstufe nicht zusammengefasst: ' + kgs(sets).join(','));
  assert.strictEqual(new Set(kgs(sets)).size, sets.length, 'doppeltes Gewicht in ' + kgs(sets).join(','));
});

test('format schreibt die Sätze in der Sprache des Nutzers', () => {
  const sets = [{ kg: 22.5, reps: 5 }, { kg: 30, reps: 3 }];
  assert.strictEqual(W.format(sets, 'de'), '22,5 kg × 5, 30 kg × 3');
  assert.strictEqual(W.format(sets, 'en'), '22.5 kg × 5, 30 kg × 3');
  assert.strictEqual(W.format(sets), '22,5 kg × 5, 30 kg × 3');
});

test('format einer leeren Liste bleibt leer', () => {
  assert.strictEqual(W.format([], 'de'), '');
  assert.strictEqual(W.format(null, 'de'), '');
});

// ── Typkontrakt: Zahlen sind Zahlen ───────────────────────────────────────
// Ein Zahlstring ist keine Zahl. Frueher lieferte roundToPlate('60', 2.5, 20)
// stumm 20 — also 'Aufwaermen mit 20 kg' statt mit 45. Ein stiller falscher
// Wert ist teurer als gar keiner: null zwingt die Aufrufstelle zur Umwandlung.

test('roundToPlate lehnt einen Zahlstring ab, statt still die Stange zu liefern', () => {
  assert.strictEqual(W.roundToPlate('60', 2.5, 20), null);
  assert.strictEqual(W.roundToPlate('60'), null);
});

test('roundToPlate liefert bei unbrauchbarem Gewicht null', () => {
  [null, undefined, NaN, {}, [], true].forEach(v => {
    assert.strictEqual(W.roundToPlate(v, 2.5, 20), null, 'nicht null bei ' + String(v));
  });
});

test('roundToPlate haelt den Kontrakt auch fuer step und barKg', () => {
  // Unbrauchbare OPTIONEN fallen auf die Vorgabe zurueck — nur das Gewicht
  // selbst ist Pflicht. Sonst waere jeder Aufruf ohne Geraeteangabe wertlos.
  assert.strictEqual(W.roundToPlate(43.7, '2.5', 20), W.roundToPlate(43.7, 2.5, 20));
  assert.strictEqual(W.roundToPlate(43.7, 2.5, '20'), W.roundToPlate(43.7, 2.5, undefined));
});

// ── Untergrenze und Obergrenze ────────────────────────────────────────────

test('MIN_WORK_KG ist die zugesicherte Untergrenze von 30 kg', () => {
  assert.strictEqual(W.MIN_WORK_KG, 30);
  // Ohne Stange greift keine andere Schranke: hier entscheidet MIN_WORK_KG
  // allein. Genau diese Kante ist die Zusicherung aus dem Brief.
  assert.deepStrictEqual(W.warmupSets(29.9, { step: 2.5, barKg: 0 }), [],
    '29,9 kg liegen unter der Untergrenze');
  assert.ok(W.warmupSets(30, { step: 2.5, barKg: 0 }).length > 0,
    '30 kg liegen genau auf der Untergrenze und muessen Aufwaermsaetze ergeben');
});

test('unsinnig hohe Arbeitsgewichte ergeben keine Aufwaermsaetze', () => {
  assert.strictEqual(typeof W.MAX_WORK_KG, 'number');
  assert.deepStrictEqual(W.warmupSets(1e9, { step: 2.5, barKg: 20 }), [],
    'Eine Tippfehler-Eingabe darf keine 500-Millionen-kg-Saetze ansagen');
  assert.deepStrictEqual(W.warmupSets(W.MAX_WORK_KG + 0.1, { step: 2.5, barKg: 20 }), []);
  assert.ok(W.warmupSets(W.MAX_WORK_KG, { step: 2.5, barKg: 20 }).length > 0,
    'Die Obergrenze selbst ist noch gueltig');
});
