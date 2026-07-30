/* GymTrack — Tests fuer die Plateau-Diagnose und die Zeitbudget-Priorisierung
   (Block 3, Task 16).

   Zwei Dinge werden hier scharf gehalten:
   1. Die Plateau-Erkennung meldet weder zu viel noch zu wenig. Beide Fehler sind
      teuer: meldet sie nie etwas, ist das Modul wertlos; meldet sie bei
      steigenden Gewichten, widerspricht der Coach dem, was der Nutzer selbst
      sieht. Darum liegen die Raender einzeln im Test: zu kurze Historie,
      Ausreisser in der Mitte, Steigerung am Ende, Pause im Verlauf,
      Jahreswechsel.
   2. Die Rueckgabe traegt Zahlen, keine Saetze. Formuliert wird ausschliesslich
      ueber CoachPersona.say() — dass Schluessel und Platzhalternamen dort
      wirklich existieren, prueft dieser Test gegen das ECHTE Persona-Modul. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const A = require('../js/coach-analyze.js');
const P = require('../js/coach-persona.js');

const DAY = 86400000;
const WEEK = 7 * DAY;
// Mittwoch, 03.06.2026 = ISO-Woche 2026-W23. Bewusst ein Wochentag in der
// Wochenmitte: ein Fehler in der ISO-Rechnung faellt dann nicht zufaellig auf
// eine Wochengrenze und bleibt unentdeckt.
const BASE = Date.UTC(2026, 5, 3);

function val(v, i) { return typeof v === 'function' ? v(i) : v; }

// Ein Wocheneintrag. vol haengt standardmaessig am Gewicht (30 Wiederholungen),
// weil das der Realitaet entspricht: steigt das Topgewicht, steigt das Volumen
// mit. Wer vol explizit setzt, entkoppelt beides absichtlich.
function entryAt(weekOff, topKg, restSecs, vol) {
  return {
    ts: BASE + weekOff * WEEK,
    topKg: topKg,
    vol: vol === undefined ? topKg * 30 : vol,
    avgRestSecs: restSecs === undefined ? 120 : restSecs
  };
}

function hist(n, topKg, restSecs, vol) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const kg = val(topKg, i);
    out.push(entryAt(i, kg, val(restSecs, i), vol === undefined ? undefined : val(vol, i)));
  }
  return out;
}

// ── plateau: erkennt ──────────────────────────────────────────────────────

test('fuenf flache Wochen sind ein Plateau, mit Zahlen', () => {
  assert.deepStrictEqual(A.plateau(hist(5, 80, 120)), {
    weeks: 5,
    entries: 5,
    topKg: 80,
    volDelta: 0,
    restDelta: 0,
    avgRestSecs: 120,
    weekFrom: '2026-W23',
    weekTo: '2026-W27'
  });
});

test('ein einzelner Ausreisser in der Mitte hebt das Plateau nicht auf', () => {
  const h = hist(5, 80, 120);
  h[2].topKg = 82.5;
  const d = A.plateau(h);
  assert.ok(d, 'Ausreisser in der Mitte darf die Diagnose nicht loeschen — sonst meldet das Modul nie etwas');
  assert.strictEqual(d.weeks, 5);
});

test('sinkende Pausen ergeben ein negatives restDelta und den Mittelwert', () => {
  const d = A.plateau(hist(5, 80, i => 150 - i * 10));
  assert.strictEqual(d.restDelta, -40);
  assert.strictEqual(d.avgRestSecs, 130);
});

test('volDelta traegt die Volumenaenderung als Zahl', () => {
  const d = A.plateau(hist(5, 80, 120, i => 3000 - i * 100));
  assert.strictEqual(d.volDelta, -400);
});

// ── plateau: meldet nicht ─────────────────────────────────────────────────

test('steigende Gewichte sind kein Plateau', () => {
  assert.strictEqual(A.plateau(hist(6, i => 70 + i * 2.5, 120)), null);
});

test('unter vier Wochen wird nichts gemeldet', () => {
  assert.strictEqual(A.plateau(hist(3, 80, 120)), null);
});

test('leere oder unbrauchbare Historie ergibt null statt eines Fehlers', () => {
  assert.strictEqual(A.plateau([]), null);
  assert.strictEqual(A.plateau(null), null);
  assert.strictEqual(A.plateau(undefined), null);
  assert.strictEqual(A.plateau('2026'), null);
  assert.strictEqual(A.plateau([{}, {}, {}, {}, {}]), null);
});

test('eine echte Steigerung in der letzten Woche ist kein Plateau', () => {
  const h = hist(5, 80, 120);
  h[4].topKg = 85;
  assert.strictEqual(A.plateau(h), null);
});

test('Gewicht rauf bei weniger Wiederholungen ist kein Plateau', () => {
  const h = hist(5, 80, 120);
  h[4].topKg = 85;
  h[4].vol = 2000; // erste Woche liegt bei 2400 — Volumen faellt, Gewicht steigt
  assert.strictEqual(A.plateau(h), null,
    'Das Topgewicht entscheidet. Wer nur das Volumen ansieht, meldet hier ein Plateau, obwohl der Nutzer mehr Gewicht bewegt.');
});

test('deutlich mehr Volumen bei gleichem Gewicht ist kein Plateau', () => {
  assert.strictEqual(A.plateau(hist(5, 80, 120, i => 3000 + i * 200)), null,
    'Mehr Wiederholungen bei gleichem Gewicht sind Fortschritt, kein Stillstand.');
});

test('mehrere Eintraege in derselben Woche ergeben keine Aussage', () => {
  const h = [0, 1, 2, 8, 9].map(d => ({
    ts: BASE + d * DAY, topKg: 80, vol: 2400, avgRestSecs: 120
  }));
  assert.strictEqual(A.plateau(h), null,
    'Fuenf Eintraege sind nicht fuenf Wochen — MIN_WEEKS zaehlt Wochen, nicht Zeilen.');
});

// ── plateau: Pausen im Verlauf ────────────────────────────────────────────

test('eine ausgelassene Woche unterbricht das Plateau nicht, verlaengert aber die Spanne', () => {
  const d = A.plateau([0, 1, 2, 4, 5, 6].map(o => entryAt(o, 80)));
  assert.ok(d, 'Eine einzelne verpasste Woche ist Alltag und darf die Diagnose nicht kippen');
  assert.strictEqual(d.entries, 6);
  assert.strictEqual(d.weeks, 7, 'Sieben Kalenderwochen, sechs Einheiten — weeks ist die Spanne, nicht die Zeilenzahl');
});

test('eine lange Pause trennt den Verlauf: davor zaehlt nicht mit', () => {
  const h = [0, 1, 7, 8, 9].map(o => entryAt(o, 80));
  assert.strictEqual(A.plateau(h), null,
    'Nach sechs Wochen Pause sind die drei Wochen danach zu wenig fuer eine Aussage.');
});

test('nach einer langen Pause zaehlt nur der Abschnitt danach', () => {
  const d = A.plateau([0, 1, 2, 3, 9, 10, 11, 12].map(o => entryAt(o, 80)));
  assert.ok(d);
  assert.strictEqual(d.entries, 4);
  assert.strictEqual(d.weeks, 4, 'Die Pause selbst darf nicht als Plateau-Woche mitzaehlen');
  assert.strictEqual(d.weekFrom, '2026-W32');
});

test('ein Plateau ueber den Jahreswechsel wird richtig gezaehlt', () => {
  const start = Date.UTC(2026, 11, 16); // Mittwoch, 2026-W51
  const h = [];
  for (let i = 0; i < 5; i++) h.push({ ts: start + i * WEEK, topKg: 80, vol: 2400, avgRestSecs: 120 });
  const d = A.plateau(h);
  assert.ok(d);
  assert.strictEqual(d.weeks, 5, 'Ueber den Jahreswechsel darf die Wochenspanne nicht in sich zusammenfallen');
  assert.strictEqual(d.weekFrom, '2026-W51');
  assert.strictEqual(d.weekTo, '2027-W02');
});

// ── plateau: reine Funktion ───────────────────────────────────────────────

test('die Reihenfolge der Eingabe aendert die Diagnose nicht', () => {
  const h = hist(5, 80, i => 150 - i * 10);
  assert.deepStrictEqual(A.plateau(h.slice().reverse()), A.plateau(h));
});

test('plateau veraendert die Eingabe nicht', () => {
  const h = hist(5, 80, 120).reverse();
  const tsBefore = h.map(r => r.ts);
  const keysBefore = Object.keys(h[0]).slice().sort();
  A.plateau(h);
  assert.deepStrictEqual(h.map(r => r.ts), tsBefore, 'Die Historie des Aufrufers darf nicht umsortiert werden');
  assert.deepStrictEqual(Object.keys(h[0]).slice().sort(), keysBefore, 'Keine Hilfsfelder in die Eingabe schreiben');
});

// ── ISO-Woche ─────────────────────────────────────────────────────────────

test('isoWeekKey trifft das vereinbarte Format', () => {
  assert.strictEqual(A.isoWeekKey(Date.UTC(2026, 6, 30)), '2026-W31');
});

test('isoWeekKey schreibt die Woche zweistellig', () => {
  assert.strictEqual(A.isoWeekKey(Date.UTC(2026, 0, 5)), '2026-W02');
});

test('isoWeekKey ordnet den Jahreswechsel nach ISO ein, nicht nach Kalenderjahr', () => {
  assert.strictEqual(A.isoWeekKey(Date.UTC(2025, 11, 29)), '2026-W01',
    '29.12.2025 ist der Montag der ISO-Woche 1 von 2026');
  assert.strictEqual(A.isoWeekKey(Date.UTC(2026, 11, 31)), '2026-W53',
    '2026 hat 53 ISO-Wochen, weil der 1. Januar ein Donnerstag ist');
  assert.strictEqual(A.isoWeekKey(Date.UTC(2027, 0, 1)), '2026-W53',
    '01.01.2027 gehoert noch in die 53. Woche von 2026');
});

test('isoWeekIndex zaehlt ueber den Jahreswechsel hinweg weiter', () => {
  const w53 = A.isoWeekIndex(Date.UTC(2026, 11, 28)); // Montag 2026-W53
  const w01 = A.isoWeekIndex(Date.UTC(2027, 0, 4));   // Montag 2027-W01
  assert.strictEqual(w01 - w53, 1);
  assert.strictEqual(A.isoWeekIndex(BASE + 4 * WEEK) - A.isoWeekIndex(BASE), 4);
  assert.strictEqual(A.isoWeekIndex(Date.UTC(2026, 6, 27)), A.isoWeekIndex(Date.UTC(2026, 7, 2)),
    'Montag und Sonntag derselben ISO-Woche muessen denselben Index haben');
});

test('isoWeekKey liefert null bei unbrauchbarem Zeitstempel', () => {
  assert.strictEqual(A.isoWeekKey(null), null);
  assert.strictEqual(A.isoWeekKey('gestern'), null);
  assert.strictEqual(A.isoWeekKey(NaN), null);
});

// ── plateauSay: Schluessel und Platzhalter, keine Saetze ──────────────────

test('plateauSay liefert Schluessel und Platzhalterwerte statt eines Satzes', () => {
  const d = A.plateau(hist(5, 80, 120));
  assert.deepStrictEqual(A.plateauSay(d, 'Bankdruecken'), {
    key: 'plateau',
    vars: { ex: 'Bankdruecken', weeks: 5, secs: 120 }
  });
});

test('plateauSay ohne Diagnose ergibt null', () => {
  assert.strictEqual(A.plateauSay(null, 'Bankdruecken'), null);
  assert.strictEqual(A.plateauSay({}, 'Bankdruecken'), null);
});

test('CoachPersona fuellt die plateau-Platzhalter vollstaendig, DE und EN', () => {
  const say = A.plateauSay(A.plateau(hist(5, 80, 120)), 'Bankdruecken');
  ['de', 'en'].forEach(lang => {
    P.TONES.forEach(tone => {
      const s = P.say(say.key, say.vars, { tone: tone }, lang);
      assert.ok(s, `plateau/${tone}/${lang} sollte einen Satz ergeben — sonst stimmt der Schluessel nicht`);
      assert.ok(!/[{}]/.test(s), `Restplatzhalter in plateau/${tone}/${lang}: ${s}`);
      assert.ok(s.includes('5'), `Wochenzahl fehlt in plateau/${tone}/${lang}: ${s}`);
      assert.ok(s.includes('120'), `Pausenwert fehlt in plateau/${tone}/${lang}: ${s}`);
    });
  });
});

// ── prioritize ────────────────────────────────────────────────────────────

const EX4 = [
  { id: 'a', name: 'Bankdruecken', sets: 4, prio: 1 },
  { id: 'b', name: 'Rudern',       sets: 4, prio: 2 },
  { id: 'c', name: 'Bizeps',       sets: 3, prio: 3 },
  { id: 'd', name: 'Seitheben',    sets: 3, prio: 4 }
];

test('vier Uebungen in 30 Minuten: die wichtigen bleiben, keine verschwindet', () => {
  const r = A.prioritize(EX4, 30);
  assert.ok(r.keep.includes('a'), 'Die wichtigste Uebung muss bleiben');
  assert.ok(r.drop.length > 0, '30 Minuten reichen nicht fuer 14 Saetze plus Pausen');
  assert.strictEqual(r.keep.length + r.drop.length, 4, 'Keine Uebung darf verschluckt werden');
  assert.deepStrictEqual(r.keep.filter(id => r.drop.includes(id)), [], 'Keine Uebung in beiden Listen');
});

test('bei reichlich Zeit wird nichts gestrichen', () => {
  const r = A.prioritize(EX4.slice(0, 2), 120);
  assert.deepStrictEqual(r.drop, []);
  assert.strictEqual(r.keep.length, 2);
});

test('bei sehr wenig Zeit bleibt die wichtigste Uebung trotzdem stehen', () => {
  const r = A.prioritize(EX4.slice(0, 2), 5);
  assert.strictEqual(r.keep.length, 1, 'Ein leeres Ergebnis ist kein Ergebnis');
  assert.strictEqual(r.keep[0], 'a');
  assert.deepStrictEqual(r.drop, ['b']);
});

test('kein Zeitbudget: die wichtigste Uebung bleibt', () => {
  [0, -5, undefined, null, 'bald'].forEach(m => {
    const r = A.prioritize(EX4.slice(0, 2), m);
    assert.deepStrictEqual(r.keep, ['a'], 'Auch ohne brauchbares Budget bleibt genau die wichtigste Uebung: ' + String(m));
  });
});

test('leere oder unbrauchbare Uebungsliste ergibt zwei leere Listen', () => {
  assert.deepStrictEqual(A.prioritize([], 45), { keep: [], drop: [] });
  assert.deepStrictEqual(A.prioritize(null, 45), { keep: [], drop: [] });
  assert.deepStrictEqual(A.prioritize(undefined, 45), { keep: [], drop: [] });
  assert.deepStrictEqual(A.prioritize('a,b', 45), { keep: [], drop: [] });
});

test('sortiert wird nach prio, nicht nach Eingabereihenfolge', () => {
  const r = A.prioritize([EX4[1], EX4[0]], 5);
  assert.deepStrictEqual(r.keep, ['a'], 'Die erste Zeile der Eingabe ist nicht automatisch die wichtigste');
  assert.deepStrictEqual(r.drop, ['b']);
});

test('eine guenstige Uebung hinter einer zu teuren rutscht noch ins Budget', () => {
  const r = A.prioritize([
    { id: 'a', sets: 2, prio: 1, restSecs: 30 }, // 170 s
    { id: 'b', sets: 6, prio: 2, restSecs: 120 }, // 1050 s
    { id: 'c', sets: 2, prio: 3, restSecs: 30 } // 170 s
  ], 6); // 360 s
  assert.deepStrictEqual(r.keep, ['a', 'c'],
    'Nach der ersten zu teuren Uebung darf die Fuellung nicht abbrechen');
  assert.deepStrictEqual(r.drop, ['b']);
});

test('restSecs der Uebung schlaegt die Vorgabe', () => {
  const kurz = [{ id: 'a', sets: 4, prio: 1, restSecs: 20 }, { id: 'b', sets: 4, prio: 2, restSecs: 20 }];
  const lang = [{ id: 'a', sets: 4, prio: 1 }, { id: 'b', sets: 4, prio: 2 }];
  assert.strictEqual(A.prioritize(kurz, 10).keep.length, 2, '20 s Pause: beide passen in 10 Minuten');
  assert.strictEqual(A.prioritize(lang, 10).keep.length, 1, '90 s Vorgabepause: nur eine passt');
});

test('costSecs rechnet mit SEC_PER_SET, REST_DEFAULT und mindestens einem Satz', () => {
  assert.strictEqual(A.costSecs({ sets: 3 }), 435);
  assert.strictEqual(A.costSecs({ sets: 3, restSecs: 30 }), 255);
  assert.strictEqual(A.costSecs({}), 145);
  assert.strictEqual(A.costSecs(null), 0);
});

test('prioritize veraendert die Uebungsliste des Aufrufers nicht', () => {
  const input = [EX4[2], EX4[0], EX4[3], EX4[1]];
  const idsBefore = input.map(e => e.id);
  A.prioritize(input, 20);
  assert.deepStrictEqual(input.map(e => e.id), idsBefore,
    'Der gespeicherte Plan darf nicht umsortiert werden — priorisiert wird nur die heutige Durchfuehrung');
});

test('ids kommen als Strings zurueck, Eintraege ohne id fallen heraus', () => {
  const r = A.prioritize([{ id: 7, sets: 1, prio: 1 }, { sets: 1, prio: 2 }], 60);
  assert.deepStrictEqual(r.keep, ['7']);
  assert.deepStrictEqual(r.drop, []);
});

test('prioritizeSay liefert Schluessel und Platzhalter, und CoachPersona fuellt sie', () => {
  const say = A.prioritizeSay({ keep: ['a', 'b', 'c'], drop: ['d'] }, 30);
  assert.deepStrictEqual(say, { key: 'timeBudget', vars: { mins: 30, count: 3 } });
  ['de', 'en'].forEach(lang => {
    P.TONES.forEach(tone => {
      const s = P.say(say.key, say.vars, { tone: tone }, lang);
      assert.ok(s, `timeBudget/${tone}/${lang} sollte einen Satz ergeben`);
      assert.ok(!/[{}]/.test(s), `Restplatzhalter in timeBudget/${tone}/${lang}: ${s}`);
      assert.ok(s.includes('30') && s.includes('3'), `Zahlen fehlen in timeBudget/${tone}/${lang}: ${s}`);
    });
  });
});

// ── Blockregel ────────────────────────────────────────────────────────────

test('das Modul ruft nichts im Netz auf', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'coach-analyze.js'), 'utf8');
  assert.ok(!/fetch|AI_WORKER_URL|XMLHttpRequest/.test(src),
    'Die Diagnose ist algorithmisch und kostenlos. Ein Netzaufruf hier macht Block 3 nicht abnahmefaehig.');
});

test('die Konstanten haben die vereinbarten Werte', () => {
  assert.strictEqual(A.MIN_WEEKS, 4);
  assert.strictEqual(A.SEC_PER_SET, 55);
  assert.strictEqual(A.REST_DEFAULT, 90);
  assert.strictEqual(A.MAX_GAP_WEEKS, 3);
});

// ── MAX_GAP_WEEKS: die dokumentierte Grenze selbst ────────────────────────
// Getestet waren bisher nur Luecke 1 und Luecke 5 — die Grenze dazwischen
// blieb offen, also haette 2 statt 3 unbemerkt durchgehen koennen.

test('genau drei ausgelassene Wochen trennen den Verlauf noch nicht', () => {
  // Wochen 0,1,2,3 dann Luecke 4,5,6 (drei Wochen) und weiter ab 7.
  const d = A.plateau([0, 1, 2, 3, 7, 8].map(o => entryAt(o, 80)));
  assert.ok(d, 'Drei ausgelassene Wochen sind Alltag und gehoeren in dasselbe Plateau');
  assert.strictEqual(d.entries, 6, 'der Abschnitt darf nicht getrennt worden sein');
  assert.strictEqual(d.weeks, 9);
});

test('vier ausgelassene Wochen trennen den Verlauf', () => {
  const d = A.plateau([0, 1, 2, 3, 8, 9, 10, 11].map(o => entryAt(o, 80)));
  assert.ok(d);
  assert.strictEqual(d.entries, 4, 'ab der vierten ausgelassenen Woche zaehlt nur der Abschnitt danach');
  assert.strictEqual(d.weeks, 4);
});

// ── Volumenriegel ─────────────────────────────────────────────────────────

test('eine einzelne starke Schlusswoche hebt das Plateau nicht auf', () => {
  // Dieselbe Zusage wie fuer das Topgewicht: ein Ausreisser kippt die Diagnose
  // nicht. Der Vergleich 'letzte gegen erste Woche' tat genau das.
  const h = hist(6, 80, 120, 2400);
  h[5].vol = 3600;
  const d = A.plateau(h);
  assert.ok(d, 'Eine einzelne Woche mit mehr Volumen ist kein Fortschritt, sondern ein Ausreisser');
  assert.strictEqual(d.weeks, 6);
});

test('anhaltend steigendes Volumen hebt das Plateau weiterhin auf', () => {
  assert.strictEqual(A.plateau(hist(6, 80, 120, i => 2400 + i * 200)), null,
    'Mehr Wiederholungen ueber mehrere Wochen sind Fortschritt und muessen die Diagnose stoppen');
});

test('eine einzelne schwache Startwoche taeuscht keinen Fortschritt vor', () => {
  const h = hist(6, 80, 120, 2400);
  h[0].vol = 1200;
  assert.ok(A.plateau(h), 'Ein Ausreisser nach unten am Anfang darf das Plateau nicht loeschen');
});

test('fehlendes Volumen in einer Woche legt den Riegel nicht still', () => {
  // Frueher haing der ganze Riegel an first.vol: fehlte der Wert in der ersten
  // Zeile, meldete das Modul jede flache Historie als Plateau — auch bei
  // deutlich wachsendem Volumen danach.
  const h = hist(6, 80, 120, i => 2400 + i * 300);
  delete h[0].vol;
  assert.strictEqual(A.plateau(h), null,
    'Ohne die erste Volumenzahl entscheiden die uebrigen, nicht der Zufall');
});

test('eine Historie ganz ohne Volumen faellt auf das Topgewicht zurueck', () => {
  const h = hist(5, 80, 120).map(r => { delete r.vol; return r; });
  const d = A.plateau(h);
  assert.ok(d, 'Ohne Volumenzahlen entscheidet das Topgewicht allein — dokumentierter Rueckfall');
  assert.strictEqual(d.volDelta, 0);
});

// ── plateauSay beschreibt, es verschreibt nicht ───────────────────────────

test('der Plateau-Satz liest die beobachtete Pause nicht als Empfehlung', () => {
  // {secs} ist der MITTELWERT der beobachteten Pausen. Als Rat gelesen
  // empfiehlt der Coach genau das, was der Nutzer ohnehin tut. Verschreiben
  // ist Block 6 und hat hier keine Spec.
  const say = A.plateauSay(A.plateau(hist(5, 80, 120)), 'Bankdruecken');
  const rat = /könnte|koennte|sollte|solltest|hilft|helfen|versuch|probier|länger|laenger|longer|may help|might help|should|\btry\b/i;
  ['de', 'en'].forEach(lang => {
    P.TONES.forEach(tone => {
      const s = P.say(say.key, say.vars, { tone: tone }, lang);
      assert.ok(!rat.test(s), 'Empfehlung statt Beobachtung in plateau/' + tone + '/' + lang + ': ' + s);
      assert.ok(s.includes('120'), 'die beobachtete Pause fehlt in plateau/' + tone + '/' + lang + ': ' + s);
    });
  });
});

// ── prioritizeSay ohne Zeitbudget ─────────────────────────────────────────

test('ohne brauchbares Zeitbudget gibt es keinen Zeitbudget-Satz', () => {
  // Sonst steht die Einheit ohne Zahl da: 'Minuten reichen fuer 2 Uebungen.'
  [null, undefined, 'bald', NaN, -5].forEach(m => {
    assert.strictEqual(A.prioritizeSay({ keep: ['a', 'b'], drop: [] }, m), null, 'nicht null bei ' + String(m));
  });
});

test('ohne priorisierte Uebung gibt es keinen Zeitbudget-Satz', () => {
  assert.strictEqual(A.prioritizeSay({ keep: [], drop: [] }, 30), null);
  assert.strictEqual(A.prioritizeSay(null, 30), null);
});

test('die Saetze beider Rueckgaben stehen in allen Toenen vollstaendig da', () => {
  const einheit = /(^|[^0-9\s])\s*\b(kg|Kilo|kilos|Prozent|percent)\b/;
  const faelle = [
    A.plateauSay(A.plateau(hist(5, 80, 120)), 'Bankdruecken'),
    A.prioritizeSay(A.prioritize(EX4, 30), 30)
  ];
  faelle.forEach(say => {
    assert.ok(say, 'keine Rueckgabe, nichts geprueft');
    ['de', 'en'].forEach(lang => P.TONES.forEach(tone => {
      const w = say.key + '/' + tone + '/' + lang;
      const s = P.say(say.key, say.vars, { tone: tone }, lang);
      assert.ok(s.length > 0, 'leer: ' + w);
      assert.ok(!/[{}]/.test(s), 'Restplatzhalter: ' + w + ' -> ' + s);
      assert.ok(!/\s{2,}/.test(s), 'doppeltes Leerzeichen: ' + w + ' -> ' + s);
      assert.ok(!einheit.test(s), 'Einheit ohne Zahl: ' + w + ' -> ' + s);
    }));
  });
});
