/* GymTrack — Tests fuer die Satz-Rueckfrage (Task 15).
   Reine Logik, keine DOM-Abhaengigkeit: die drei Chips liefern eine Antwort,
   daraus folgen RPE-Wert, naechster Gewichtsvorschlag und Trend.
   Die Gewichte werden auf exakte Werte geprueft, nicht auf "kleiner/groesser":
   ein Vorschlag von 63,7 kg ist nicht auflegbar und muss auffallen. */
const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/coach-rpe.js');
const W = require('../js/coach-warmup.js');
const P = require('../js/coach-persona.js');

/* ---------- Modul-Vertrag ---------- */

test('Modul haengt sich auch an globalThis (Browser-Verdrahtung)', () => {
  assert.strictEqual(globalThis.CoachRpe, R);
});

/* ---------- toRpe ---------- */

test('toRpe ordnet die deutschen Antworten zu', () => {
  assert.strictEqual(R.toRpe('leicht'), 6);
  assert.strictEqual(R.toRpe('passend'), 8);
  assert.strictEqual(R.toRpe('schwer'), 9.5);
});

test('toRpe ordnet die englischen Antworten gleich zu', () => {
  assert.strictEqual(R.toRpe('easy'), 6);
  assert.strictEqual(R.toRpe('ok'), 8);
  assert.strictEqual(R.toRpe('hard'), 9.5);
});

test('toRpe vertraegt Gross-Kleinschreibung und Leerzeichen', () => {
  assert.strictEqual(R.toRpe(' Leicht '), 6);
  assert.strictEqual(R.toRpe('HARD'), 9.5);
});

test('toRpe liefert bei unbekannter Antwort null, keinen stillen Default', () => {
  assert.strictEqual(R.toRpe('quatsch'), null);
  assert.strictEqual(R.toRpe(''), null);
  assert.strictEqual(R.toRpe(7), null);
});

test('unbeantwortete Rueckfrage ist ein gueltiger Zustand: toRpe(null) ist null', () => {
  assert.strictEqual(R.toRpe(null), null);
  assert.strictEqual(R.toRpe(undefined), null);
});

/* ---------- adjustNext ---------- */

test('schwer senkt um genau eine Schrittweite', () => {
  assert.strictEqual(R.adjustNext(60, 'schwer', 2.5), 57.5);
});

test('leicht hebt um genau eine Schrittweite', () => {
  assert.strictEqual(R.adjustNext(60, 'leicht', 2.5), 62.5);
});

test('passend laesst das Gewicht unveraendert stehen', () => {
  assert.strictEqual(R.adjustNext(60, 'passend', 2.5), 60);
  assert.strictEqual(R.adjustNext(60, 'ok', 2.5), 60);
});

test('unbekannte Antwort bewegt nichts', () => {
  assert.strictEqual(R.adjustNext(60, 'weissnicht', 2.5), 60);
});

test('unbeantwortete Rueckfrage bewegt nichts', () => {
  assert.strictEqual(R.adjustNext(60, null, 2.5), 60);
  assert.strictEqual(R.adjustNext(60, undefined, 2.5), 60);
});

test('der Sprung ist genau eine Stufe — bei jeder Schrittweite', () => {
  [1.25, 2.5, 5].forEach(function (step) {
    assert.strictEqual(R.adjustNext(80, 'leicht', step), 80 + step, 'leicht step ' + step);
    assert.strictEqual(R.adjustNext(80, 'schwer', step), 80 - step, 'schwer step ' + step);
  });
});

test('das Ergebnis bleibt ein Vielfaches der Schrittweite', () => {
  assert.strictEqual(R.adjustNext(62.5, 'leicht', 2.5), 65);
  assert.strictEqual(R.adjustNext(62.5, 'schwer', 2.5), 60);
});

test('krummes Ausgangsgewicht landet auf der naechsten Raster-Stufe', () => {
  // 61 und 63,7 kg liegen nicht auf dem 2,5er-Raster. Ergebnis ist die
  // naechste auflegbare Stufe in die gewuenschte Richtung — nie mehr als
  // eine Schrittweite vom tatsaechlich gehobenen Gewicht entfernt.
  assert.strictEqual(R.adjustNext(61, 'leicht', 2.5), 62.5);
  assert.strictEqual(R.adjustNext(61, 'schwer', 2.5), 60);
  assert.strictEqual(R.adjustNext(63.7, 'leicht', 2.5), 65);
  assert.strictEqual(R.adjustNext(63.7, 'schwer', 2.5), 62.5);
});

test('Maschine mit festem 5er-Raster bleibt auf dem Raster', () => {
  assert.strictEqual(R.adjustNext(35, 'leicht', 5), 40);
  assert.strictEqual(R.adjustNext(35, 'schwer', 5), 30);
  assert.strictEqual(R.adjustNext(37, 'leicht', 5), 40);
  assert.strictEqual(R.adjustNext(37, 'schwer', 5), 35);
});

test('das Gewicht faellt nie unter eine Schrittweite', () => {
  assert.strictEqual(R.adjustNext(2.5, 'schwer', 2.5), 2.5);
  assert.strictEqual(R.adjustNext(1.25, 'schwer', 1.25), 1.25);
  assert.strictEqual(R.adjustNext(5, 'schwer', 5), 5);
});

test('sehr schwere Gewichte bleiben exakt und bleiben Zahlen', () => {
  const up = R.adjustNext(217.5, 'leicht', 1.25);
  assert.strictEqual(up, 218.75);
  assert.strictEqual(typeof up, 'number');
  assert.strictEqual(R.adjustNext(200, 'schwer', 5), 195);
});

test('fehlende oder unbrauchbare Schrittweite fuehrt auf 2,5 kg zurueck', () => {
  assert.strictEqual(R.adjustNext(60, 'leicht'), 62.5);
  assert.strictEqual(R.adjustNext(60, 'schwer', 0), 57.5);
  assert.strictEqual(R.adjustNext(60, 'leicht', -5), 62.5);
});

test('ohne brauchbares Gewicht gibt es keinen Vorschlag', () => {
  assert.strictEqual(R.adjustNext(null, 'leicht', 2.5), null);
  assert.strictEqual(R.adjustNext(0, 'leicht', 2.5), null);
  assert.strictEqual(R.adjustNext(NaN, 'schwer', 2.5), null);
});

/* ---------- ackFor ---------- */

test('ackFor liefert Schluessel und Platzhalter, keinen Satz', () => {
  assert.deepStrictEqual(R.ackFor('leicht', 62.5), { key: 'setAckEasy', vars: { kg: 62.5 } });
  assert.deepStrictEqual(R.ackFor('schwer', 57.5), { key: 'setAckHard', vars: { kg: 57.5 } });
});

test('ackFor schweigt bei passend und bei fehlender Antwort', () => {
  assert.strictEqual(R.ackFor('passend', 60), null);
  assert.strictEqual(R.ackFor(null, 60), null);
  assert.strictEqual(R.ackFor('quatsch', 60), null);
});

/* ---------- summarize ---------- */

test('summarize zaehlt und erkennt einen harten Trend', () => {
  assert.deepStrictEqual(R.summarize(['schwer', 'schwer', 'schwer']),
    { easy: 0, ok: 0, hard: 3, trend: 'hard' });
});

test('summarize erkennt einen leichten Trend', () => {
  assert.deepStrictEqual(R.summarize(['leicht', 'leicht', 'passend']),
    { easy: 2, ok: 1, hard: 0, trend: 'easy' });
});

test('summarize behauptet bei Gleichstand keinen Trend', () => {
  assert.deepStrictEqual(R.summarize(['leicht', 'schwer', 'passend']),
    { easy: 1, ok: 1, hard: 1, trend: 'ok' });
  assert.strictEqual(R.summarize(['schwer', 'schwer', 'leicht', 'leicht']).trend, 'ok');
});

test('eine einzelne Antwort macht keinen Trend', () => {
  assert.strictEqual(R.summarize(['schwer']).trend, 'ok');
  assert.strictEqual(R.summarize(['leicht']).trend, 'ok');
});

test('Mehrheit ab zwei Antworten setzt den Trend', () => {
  assert.strictEqual(R.summarize(['schwer', 'schwer', 'leicht']).trend, 'hard');
  assert.strictEqual(R.summarize(['leicht', 'leicht', 'schwer']).trend, 'easy');
});

test('summarize wirft nicht bei leerer oder fehlender Liste', () => {
  assert.deepStrictEqual(R.summarize([]), { easy: 0, ok: 0, hard: 0, trend: 'ok' });
  assert.deepStrictEqual(R.summarize(null), { easy: 0, ok: 0, hard: 0, trend: 'ok' });
});

test('summarize zaehlt unbeantwortet und Unsinn nicht als passend', () => {
  assert.deepStrictEqual(R.summarize(['leicht', null, 'quatsch', undefined]),
    { easy: 1, ok: 0, hard: 0, trend: 'ok' });
});

test('summarize mischt deutsche und englische Antworten', () => {
  assert.deepStrictEqual(R.summarize(['hard', 'schwer', 'ok']),
    { easy: 0, ok: 1, hard: 2, trend: 'hard' });
});

/* ---------- step heisst in beiden Modulen dasselbe ---------- */

test('step ist die kleinste Scheibe JE SEITE, an der Stange also 2*step', () => {
  // Vorher bedeutete 'step' hier den Gesamtsprung und in coach-warmup die
  // Scheibe je Seite. Derselbe Geraeteparameter an beide ergab 57,5 kg — mit
  // 2,5er-Scheiben 18,75 kg je Seite, also nicht auflegbar.
  assert.strictEqual(R.adjustNext(60, 'schwer', 2.5, 20), 55);
  assert.strictEqual(R.adjustNext(60, 'leicht', 2.5, 20), 65);
});

test('an der Stange ist jeder Vorschlag auflegbar', () => {
  [40, 47.5, 60, 62.5, 100, 142.5].forEach(function (kg) {
    ['leicht', 'schwer'].forEach(function (a) {
      const r = R.adjustNext(kg, a, 2.5, 20);
      assert.strictEqual((r - 20) % 5, 0, a + ' bei ' + kg + ' ergibt ' + r + ' — nicht auflegbar');
    });
  });
});

test('der Vorschlag faellt nie unter das Stangengewicht', () => {
  assert.strictEqual(R.adjustNext(20, 'schwer', 2.5, 20), 20,
    '17,5 kg unter einer 20-kg-Stange gibt es nicht');
  assert.strictEqual(R.adjustNext(25, 'schwer', 2.5, 20), 20);
  assert.strictEqual(R.adjustNext(15, 'schwer', 2.5, 20), 20);
});

test('ohne vierten Parameter bleibt es die Maschine mit einem Stapel', () => {
  // Bestehende Aufrufstellen mit drei Argumenten duerfen nicht werfen und
  // muessen dasselbe Ergebnis wie vorher liefern.
  assert.strictEqual(R.adjustNext(60, 'schwer', 2.5), 57.5);
  assert.strictEqual(R.adjustNext(60, 'schwer', 2.5, 0), 57.5);
  assert.strictEqual(R.adjustNext(60, 'schwer', 2.5, 'Langhantel'), 57.5);
});

test('coach-rpe und coach-warmup rechnen auf demselben Raster', () => {
  const step = 2.5, bar = 20;
  [45, 60, 82.5, 100].forEach(function (kg) {
    const down = R.adjustNext(kg, 'schwer', step, bar);
    assert.strictEqual(down, W.roundToPlate(down, step, bar),
      'coach-warmup wuerde ' + down + ' anders runden');
  });
});

/* ---------- Typkontrakt: Zahlen sind Zahlen ---------- */

test('ein Zahlstring ist kein Gewicht', () => {
  assert.strictEqual(R.adjustNext('60', 'schwer', 2.5), null);
  assert.strictEqual(R.ackFor('schwer', '57.5'), null);
});

/* ---------- Quittung und Rechnung ergeben zusammen einen wahren Satz ---- */

test('die Quittung nennt das Gewicht, das die Rechnung liefert', () => {
  // Einseitig gefixt bliebe der Widerspruch gruen: die Rechnung senkt auf
  // 57,5 kg, der Katalogtext behauptete 'Gewicht bleibt bei 57,5 kg' nach
  // einem 60-kg-Satz. Deshalb laeuft der Test durch BEIDE Module.
  const cases = [
    { kg: 60, answer: 'schwer', expect: 57.5, de: '57,5', en: '57.5' },
    { kg: 60, answer: 'leicht', expect: 62.5, de: '62,5', en: '62.5' }
  ];
  cases.forEach(function (c) {
    const next = R.adjustNext(c.kg, c.answer, 2.5);
    assert.strictEqual(next, c.expect);
    const ack = R.ackFor(c.answer, next);
    assert.ok(ack, 'keine Quittung fuer ' + c.answer);
    P.TONES.forEach(function (tone) {
      const de = P.say(ack.key, ack.vars, { tone: tone }, 'de');
      const en = P.say(ack.key, ack.vars, { tone: tone }, 'en');
      assert.ok(de.includes(c.de), c.answer + '/' + tone + '/de nennt das neue Gewicht nicht: ' + de);
      assert.ok(en.includes(c.en), c.answer + '/' + tone + '/en nennt das neue Gewicht nicht: ' + en);
      assert.ok(!/[{}]/.test(de) && !/[{}]/.test(en), 'Restplatzhalter bei ' + c.answer + '/' + tone);
      // Der Satz darf nicht behaupten, es bliebe beim alten Gewicht.
      assert.ok(!/bleib|stays|stay\b/i.test(de), 'behauptet Bestaendigkeit (de/' + tone + '): ' + de);
      assert.ok(!/bleib|stays|stay\b/i.test(en), 'behauptet Bestaendigkeit (en/' + tone + '): ' + en);
    });
  });
});

// --- derive(): Einschaetzung aus Soll und Ist statt aus einer Rueckfrage ----

test('derive: weniger als prognostiziert ist schwer, mehr ist leicht', () => {
  const o = { min: 8, max: 12, target: 10 };
  assert.strictEqual(R.derive(8,  o), 'hard');  // zwei unter der Prognose
  assert.strictEqual(R.derive(9,  o), 'ok');    // eine daneben ist Tagesform
  assert.strictEqual(R.derive(10, o), 'ok');
  assert.strictEqual(R.derive(11, o), 'ok');
  assert.strictEqual(R.derive(12, o), 'easy');  // zwei ueber der Prognose
});

test('derive: die Bereichsgrenzen schlagen die Prognose', () => {
  // Prognose 8 am unteren Ende: 13 liegt nur fuenf darueber, aber eben auch
  // ausserhalb des Bereichs — das ist leicht, egal was die Prognose sagte.
  assert.strictEqual(R.derive(13, { min: 8, max: 12, target: 8 }), 'easy');
  // Umgekehrt: Prognose 12, gehoben 7 — unter dem Minimum, also schwer.
  assert.strictEqual(R.derive(7, { min: 8, max: 12, target: 12 }), 'hard');
});

test('derive: fehlende Prognose faellt auf den Bereichsanfang zurueck', () => {
  // Ohne target gilt min (Vorgabe der Double Progression): 8 ist dann passend.
  assert.strictEqual(R.derive(8, { min: 8, max: 12 }), 'ok');
  assert.strictEqual(R.derive(10, { min: 8, max: 12 }), 'easy');
});

test('derive: Versagenssatz unter der Prognose ist immer schwer', () => {
  // Eine einzelne Wiederholung unter der Prognose waere sonst 'ok' — bis zum
  // Versagen gegangen heisst aber, dass die Grenze erreicht war.
  assert.strictEqual(R.derive(9, { min: 8, max: 12, target: 10 }), 'ok');
  assert.strictEqual(R.derive(9, { min: 8, max: 12, target: 10, type: 'fail' }), 'hard');
});

test('derive: Unsinn ergibt null statt einer erfundenen Einschaetzung', () => {
  const o = { min: 8, max: 12, target: 10 };
  assert.strictEqual(R.derive(0, o), null);
  assert.strictEqual(R.derive(-3, o), null);
  assert.strictEqual(R.derive('10', o), null);   // Typkontrakt: Zahl heisst Zahl
  assert.strictEqual(R.derive(undefined, o), null);
});

test('derive: verdrehter oder fehlender Bereich wirft nicht', () => {
  // max < min und fehlende Angaben duerfen hoechstens zu einer groben, aber
  // gueltigen Einschaetzung fuehren — nie zu einer Ausnahme im Training.
  ['easy', 'ok', 'hard'].includes(R.derive(10, { min: 12, max: 8, target: 10 }));
  assert.ok(['easy', 'ok', 'hard'].indexOf(R.derive(10, {})) >= 0);
  assert.ok(['easy', 'ok', 'hard'].indexOf(R.derive(10, null)) >= 0);
});

test('derive speist dieselbe Skala wie die frueheren Antworten', () => {
  // Der Rueckgabewert muss ohne Umweg in toRpe()/adjustNext() passen — sonst
  // haette der Umbau eine zweite, stille Skala eingefuehrt.
  const b = R.derive(8, { min: 8, max: 12, target: 10 });
  assert.strictEqual(b, 'hard');
  assert.strictEqual(R.toRpe(b), R.RPE.hard);
  assert.strictEqual(R.adjustNext(60, b, 2.5), 57.5);
});
