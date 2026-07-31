/* GymTrack — Tests fuer Wochenzahlen und Ziel-Prognose (Block 5, Task 20).

   Zwei Zusicherungen tragen diese Datei:

   1. Die Wochenzahlen sind exakt abgegrenzt. Eine Woche, die einen Satz der
      Vorwoche mitzaehlt, macht den ganzen Bericht wertlos — der Nutzer sieht
      seine Saetze selbst und merkt jede falsche Zahl sofort. Darum liegen die
      Raender einzeln im Test: leere Woche, einzelne Einheit, Sekunde vor und
      nach der Wochengrenze, Wochenmitte als Startargument.

   2. Die Prognose verspricht nichts und schweigt lieber. Jede einzelne
      Schweigeregel hat hier ihren eigenen Fall, und zwar so gebaut, dass der
      Fall bei entfernter Regel WIRKLICH kippt (nicht schon durch eine andere
      Regel abgefangen wird). Der Zickzack-Fall ist der wichtigste: bei einem
      unruhigen Verlauf darf nichts vorhergesagt werden.

   Formuliert wird nirgends im Modul. Dass Schluessel und Platzhalternamen im
   ECHTEN Satzkatalog existieren, prueft der Vollstaendigkeitstest am Ende
   gegen CoachPersona.say() — in allen vier Toenen und beiden Sprachen. */
const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/coach-report.js');
const A = require('../js/coach-analyze.js');
const P = require('../js/coach-persona.js');

const DAY = 86400000;
const WEEK = 7 * DAY;

// Montag, 27.07.2026, 00:00 LOKAL. weekStart() rechnet lokal (die Woche des
// Nutzers beginnt in seiner Zeitzone), darum hier bewusst kein Date.UTC.
const MO = new Date(2026, 6, 27).getTime();

// Fuer die Prognose zaehlt die ISO-Woche aus CoachAnalyze, also UTC.
// Mittwoch, 03.06.2026 = 2026-W23: ein Wochentag in der Mitte, damit ein
// Fehler in der Wochenrechnung nicht zufaellig auf eine Grenze faellt.
const UTC_BASE = Date.UTC(2026, 5, 3);

function s(ex, muscle, kg, reps, pr) {
  const out = { ex: ex, muscle: muscle, kg: kg, reps: reps };
  if (pr) out.pr = true;
  return out;
}

// Die Fixture aus dem Brief: zwei Einheiten in der Woche, drei Saetze,
// eine Einheit in der Vorwoche.
function S3() {
  return [
    { ts: MO + DAY + 10 * 3600000, sets: [s('Bankdruecken', 'brust', 60, 8),
                                          s('Bankdruecken', 'brust', 60, 8)] },
    { ts: MO + 3 * DAY + 18 * 3600000, sets: [s('Kniebeuge', 'beine', 100, 5, true)] },
    { ts: MO - 4 * DAY, sets: [s('Bankdruecken', 'brust', 55, 8)] }
  ];
}

// Ein Wocheneintrag der Prognose-Historie. reps standardmaessig 1, damit das
// geschaetzte Maximum eine feste Funktion des Gewichts bleibt (kg x 31/30).
function w(i, kg, reps) {
  return { ts: UTC_BASE + i * WEEK, kg: kg, reps: reps === undefined ? 1 : reps };
}

// n Wochen, linear steigend.
function ramp(n, start, step, reps) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(w(i, start + i * step, reps));
  return out;
}

const E = 31 / 30; // Epley bei einer Wiederholung

// ── epley1rm ──────────────────────────────────────────────────────────────

test('epley1rm bei einer Wiederholung liegt ueber dem Gewicht — das ist die Formel', () => {
  assert.strictEqual(Math.round(R.epley1rm(100, 1) * 100) / 100, 103.33);
});

test('epley1rm(100,5) ist exakt 350/3, nicht irgendetwas ueber 110', () => {
  assert.ok(Math.abs(R.epley1rm(100, 5) - 350 / 3) < 1e-9,
    'erwartet 116.6667, war ' + R.epley1rm(100, 5));
});

test('ohne Gewicht gibt es kein geschaetztes Maximum', () => {
  assert.strictEqual(R.epley1rm(0, 5), 0);
  assert.strictEqual(R.epley1rm(-20, 5), 0);
  assert.strictEqual(R.epley1rm('80', 5), 0);
});

test('ohne ausgefuehrte Wiederholung gibt es kein geschaetztes Maximum', () => {
  assert.strictEqual(R.epley1rm(100, 0), 0);
  assert.strictEqual(R.epley1rm(100, -3), 0);
  assert.strictEqual(R.epley1rm(100, null), 0);
});

// ── weekStart ─────────────────────────────────────────────────────────────

test('weekStart liefert den Montag 00:00 vor dem Zeitpunkt', () => {
  const mid = new Date(2026, 6, 29, 15, 30, 12, 345).getTime(); // Mittwoch
  const ws = new Date(R.weekStart(mid));
  assert.strictEqual(ws.getDay(), 1, 'muss ein Montag sein');
  assert.strictEqual(ws.getHours(), 0);
  assert.strictEqual(ws.getMinutes(), 0);
  assert.strictEqual(ws.getSeconds(), 0);
  assert.strictEqual(ws.getMilliseconds(), 0);
  assert.ok(ws.getTime() <= mid, 'darf nicht in der Zukunft liegen');
  assert.strictEqual(ws.getTime(), MO);
});

test('weekStart eines Montags ist derselbe Montag, nicht der davor', () => {
  assert.strictEqual(R.weekStart(MO), MO);
});

test('der Sonntag gehoert noch zur Woche davor', () => {
  const so = new Date(2026, 7, 2, 23, 59, 59).getTime(); // Sonntag danach
  assert.strictEqual(R.weekStart(so), MO);
});

test('weekStart lehnt Unsinn ab, statt eine Woche zu erfinden', () => {
  assert.strictEqual(R.weekStart(null), null);
  assert.strictEqual(R.weekStart('2026-07-27'), null);
  assert.strictEqual(R.weekStart(NaN), null);
});

// ── weekNumbers ───────────────────────────────────────────────────────────

test('die Woche wird richtig abgegrenzt: zwei Einheiten, drei Saetze, 1460 kg', () => {
  const n = R.weekNumbers(S3(), MO);
  assert.strictEqual(n.workouts, 2);
  assert.strictEqual(n.sets, 3);
  assert.strictEqual(n.vol, 60 * 8 * 2 + 100 * 5);
});

test('die Vorwoche wird eigenstaendig gerechnet und als Differenz gezeigt', () => {
  const n = R.weekNumbers(S3(), MO);
  assert.strictEqual(n.prevVol, 55 * 8);
  assert.strictEqual(n.volDelta, n.vol - n.prevVol);
});

test('die Muskelzuordnung ueberlebt die Summierung', () => {
  const n = R.weekNumbers(S3(), MO);
  assert.deepStrictEqual(n.muscles, { brust: 960, beine: 500 });
});

test('eine leere Woche liefert Nullen, nicht undefined', () => {
  assert.deepStrictEqual(R.weekNumbers([], MO), {
    vol: 0, sets: 0, workouts: 0, prs: [], muscles: {},
    prevVol: 0, volDelta: 0, streak: 0
  });
});

test('auch ohne brauchbare Eingabe bleibt die Form der Zahlen erhalten', () => {
  const n = R.weekNumbers(null, MO);
  assert.strictEqual(n.vol, 0);
  assert.deepStrictEqual(n.muscles, {});
  assert.deepStrictEqual(R.weekNumbers(S3(), 'Montag').vol, 0);
});

test('ein PR der Woche steht im Bericht', () => {
  const prs = R.weekNumbers(S3(), MO).prs;
  assert.strictEqual(prs.length, 1);
  assert.strictEqual(prs[0].ex, 'Kniebeuge');
  assert.strictEqual(prs[0].kg, 100);
  assert.strictEqual(prs[0].reps, 5);
});

test('ein PR der VORwoche steht nicht im Bericht dieser Woche', () => {
  const sessions = S3();
  sessions[2].sets[0].pr = true;
  assert.strictEqual(R.weekNumbers(sessions, MO).prs.length, 1);
});

test('ein Rekord ohne Uebungsnamen kommt nicht in den Bericht', () => {
  // Er liesse sich in keiner Zeile benennen: 'Rekord bei — 100 kg'.
  const n = R.weekNumbers([{ ts: MO + DAY, sets: [
    { muscle: 'beine', kg: 100, reps: 5, pr: true }
  ] }], MO);
  assert.deepStrictEqual(n.prs, []);
  assert.strictEqual(n.sets, 1, 'gezaehlt wird der Satz trotzdem');
  assert.strictEqual(n.vol, 500);
});

test('die Wochengrenze ist scharf: Montag 00:00 zaehlt, der naechste Montag nicht', () => {
  const sessions = [
    { ts: MO, sets: [s('A', 'brust', 10, 1)] },
    { ts: MO + WEEK, sets: [s('B', 'brust', 1000, 1)] },
    { ts: MO - 1, sets: [s('C', 'brust', 500, 1)] }
  ];
  const n = R.weekNumbers(sessions, MO);
  assert.strictEqual(n.vol, 10, 'nur die Einheit am Montag gehoert in die Woche');
  assert.strictEqual(n.workouts, 1);
  assert.strictEqual(n.prevVol, 500, 'die Sekunde davor gehoert in die Vorwoche');
});

test('ein Zeitpunkt aus der Wochenmitte grenzt dieselbe Woche ab', () => {
  const mid = MO + 3 * DAY + 15 * 3600000;
  assert.deepStrictEqual(R.weekNumbers(S3(), mid), R.weekNumbers(S3(), MO));
});

test('eine Woche mit einer einzigen Einheit ist eine Woche mit einer Einheit', () => {
  const n = R.weekNumbers([{ ts: MO + 2 * DAY, sets: [s('A', 'beine', 80, 10)] }], MO);
  assert.strictEqual(n.workouts, 1);
  assert.strictEqual(n.sets, 1);
  assert.strictEqual(n.vol, 800);
  assert.strictEqual(n.prevVol, 0);
  assert.strictEqual(n.volDelta, 800);
});

test('eine Einheit ohne gueltigen Satz ist keine Einheit', () => {
  const sessions = [
    { ts: MO + DAY, sets: [] },
    { ts: MO + 2 * DAY, sets: [s('A', 'brust', 60, 0)] },
    { ts: MO + 3 * DAY, sets: [s('B', 'brust', 60, 5)] }
  ];
  const n = R.weekNumbers(sessions, MO);
  assert.strictEqual(n.workouts, 1);
  assert.strictEqual(n.sets, 1);
});

test('unbrauchbare Saetze ergeben nie NaN im Bericht', () => {
  const sessions = [{ ts: MO + DAY, sets: [
    { ex: 'A', muscle: 'brust', kg: 'schwer', reps: 8 },
    { ex: 'B', muscle: 'beine', kg: 60, reps: 'viele' },
    s('C', 'arme', 20, 10)
  ] }];
  const n = R.weekNumbers(sessions, MO);
  assert.strictEqual(n.vol, 200);
  assert.strictEqual(n.sets, 1);
  assert.deepStrictEqual(n.muscles, { arme: 200 });
});

test('ein Bodyweight-Satz zaehlt als Satz, aber nicht als Volumen', () => {
  const n = R.weekNumbers([{ ts: MO + DAY, sets: [s('Klimmzug', 'ruecken', 0, 12)] }], MO);
  assert.strictEqual(n.sets, 1);
  assert.strictEqual(n.workouts, 1);
  assert.strictEqual(n.vol, 0);
  assert.deepStrictEqual(n.muscles, {}, 'null Volumen ist kein Anteil an der Verteilung');
});

test('ein Satz ohne Muskelangabe zaehlt ins Volumen, aber nicht in die Verteilung', () => {
  const n = R.weekNumbers([{ ts: MO + DAY, sets: [
    s('A', 'brust', 50, 10), { ex: 'B', kg: 40, reps: 10 }
  ] }], MO);
  assert.strictEqual(n.vol, 900);
  assert.deepStrictEqual(n.muscles, { brust: 500 });
});

test('das Volumen kommt in ganzen Kilo, nicht mit Kommaschwanz', () => {
  // 6,8 kg gibt es an Maschinen mit Pfund-Steckgewicht wirklich, und
  // 6,8 x 3 x 2 ist in Gleitkomma 40,8 — im Bericht steht keine solche Zahl.
  const n = R.weekNumbers([
    { ts: MO + DAY, sets: [s('Butterfly', 'brust', 6.8, 3), s('Butterfly', 'brust', 6.8, 3)] },
    { ts: MO - 2 * DAY, sets: [s('Butterfly', 'brust', 6.8, 3)] }
  ], MO);
  assert.strictEqual(n.vol, 41);
  assert.strictEqual(n.prevVol, 20);
  assert.strictEqual(n.volDelta, 21);
  assert.deepStrictEqual(n.muscles, { brust: 41 });
});

test('streak bleibt 0 — den Wert fuellt index.html, das Modul erfindet ihn nicht', () => {
  assert.strictEqual(R.weekNumbers(S3(), MO).streak, 0);
});

test('weekNumbers fasst die uebergebenen Einheiten nicht an', () => {
  const sessions = S3();
  const before = JSON.stringify(sessions);
  R.weekNumbers(sessions, MO);
  assert.strictEqual(JSON.stringify(sessions), before);
});

// ── goalForecast: liefert ─────────────────────────────────────────────────

test('sechs Wochen klarer Fortschritt ergeben eine Prognose', () => {
  const f = R.goalForecast(ramp(6, 100, 2.5), 130, UTC_BASE + 5 * WEEK);
  assert.ok(f, 'bei diesem Verlauf muss eine Prognose kommen');
  assert.strictEqual(f.goalKg, 130);
  assert.ok(f.weeks > 0 && f.weeks <= R.MAX_FORECAST_WEEKS, 'weeks war ' + f.weeks);
  assert.ok(Number.isInteger(f.weeks), 'halbe Wochen sagt niemand an');
  // (130 - 112.5x31/30) / (2.5x31/30) = 5.32 -> aufgerundet 6
  assert.strictEqual(f.weeks, 6);
  assert.strictEqual(f.currentKg, Math.round(112.5 * E * 10) / 10);
});

test('unrealistisch schneller Fortschritt ergibt eine Woche, nie null Wochen', () => {
  const f = R.goalForecast(ramp(6, 100, 20), 210, UTC_BASE + 5 * WEEK);
  assert.ok(f);
  assert.strictEqual(f.weeks, 1);
});

test('liegt die letzte Einheit zurueck, wandert das Ziel um genau diese Wochen nach hinten', () => {
  const h = ramp(6, 100, 2.5);
  const nah = R.goalForecast(h, 130, UTC_BASE + 5 * WEEK);
  const fern = R.goalForecast(h, 130, UTC_BASE + 9 * WEEK);
  assert.strictEqual(fern.weeks, nah.weeks + 4);
});

test('ueber den Jahreswechsel bleibt die Rechnung stetig', () => {
  // 2026-W51 ... 2027-W02: die Wochenzahl faellt von 53 auf 1, der Abstand
  // zwischen den Einheiten bleibt trotzdem eine Woche.
  const start = Date.UTC(2026, 11, 16); // Mittwoch
  const h = [];
  for (let i = 0; i < 6; i++) h.push({ ts: start + i * WEEK, kg: 100 + i * 2.5, reps: 1 });
  const keys = h.map(function (e) { return A.isoWeekKey(e.ts); });
  assert.ok(keys.indexOf('2026-W53') >= 0 && keys.indexOf('2027-W01') >= 0,
    'die Fixture muss den Jahreswechsel wirklich ueberspannen: ' + keys.join(','));
  const f = R.goalForecast(h, 130, start + 5 * WEEK);
  assert.ok(f, 'der Jahreswechsel darf die Prognose nicht verschlucken');
  assert.strictEqual(f.weeks, R.goalForecast(ramp(6, 100, 2.5), 130, UTC_BASE + 5 * WEEK).weeks);
});

test('eine Luecke im Verlauf zaehlt als Zeit, nicht als weggelassene Woche', () => {
  const dicht = ramp(6, 100, 2.5);
  const luecke = [w(0, 100), w(1, 102.5), w(2, 105), w(3, 107.5), w(4, 110), w(8, 112.5)];
  const a = R.goalForecast(dicht, 130, UTC_BASE + 5 * WEEK);
  const b = R.goalForecast(luecke, 130, UTC_BASE + 8 * WEEK);
  assert.ok(b, 'auch mit Luecke gibt es eine Prognose');
  assert.ok(b.weeks > a.weeks,
    'die flachere Steigung muss laenger dauern: dicht ' + a.weeks + ', mit Luecke ' + b.weeks);
});

// ── goalForecast: schweigt ────────────────────────────────────────────────

test('unter vier Wochen wird nichts vorhergesagt', () => {
  assert.strictEqual(R.goalForecast(ramp(3, 100, 2.5), 130, UTC_BASE + 2 * WEEK), null);
  assert.strictEqual(R.goalForecast([], 130, UTC_BASE), null);
  assert.strictEqual(R.goalForecast(null, 130, UTC_BASE), null);
});

test('acht Eintraege in drei Wochen sind drei Wochen', () => {
  const h = [w(0, 100), w(0, 101), w(1, 105), w(1, 106), w(2, 110), w(2, 111), w(2, 112)];
  assert.strictEqual(R.goalForecast(h, 130, UTC_BASE + 2 * WEEK), null);
});

test('Eintraege ohne Gewicht zaehlen nicht als Woche', () => {
  const h = [w(0, 100), w(1, 0), w(2, 0), w(3, 0), w(4, 110), w(5, 112.5)];
  assert.strictEqual(R.goalForecast(h, 130, UTC_BASE + 5 * WEEK), null);
});

test('ohne Ziel gibt es keine Prognose', () => {
  const h = ramp(6, 100, 2.5);
  assert.strictEqual(R.goalForecast(h, null, UTC_BASE + 5 * WEEK), null);
  assert.strictEqual(R.goalForecast(h, 0, UTC_BASE + 5 * WEEK), null);
  assert.strictEqual(R.goalForecast(h, '130', UTC_BASE + 5 * WEEK), null);
});

test('ohne brauchbaren Zeitpunkt gibt es keine Prognose', () => {
  assert.strictEqual(R.goalForecast(ramp(6, 100, 2.5), 130, null), null);
  assert.strictEqual(R.goalForecast(ramp(6, 100, 2.5), 130, 'heute'), null);
});

test('Stillstand ist kein Fortschritt', () => {
  assert.strictEqual(R.goalForecast(ramp(8, 100, 0), 130, UTC_BASE + 7 * WEEK), null);
});

test('ein fallender Verlauf wird nicht in die Zukunft verlaengert', () => {
  // Ziel oberhalb von allem, was je geschafft wurde: hier entscheidet allein
  // die Richtung der Steigung.
  assert.strictEqual(R.goalForecast(ramp(8, 150, -2), 200, UTC_BASE + 7 * WEEK), null);
});

test('ein unruhiger Verlauf ergibt keine Prognose — die wichtigste Zusicherung', () => {
  const h = [w(0, 80), w(1, 95), w(2, 78), w(3, 99), w(4, 82), w(5, 97)];
  assert.strictEqual(R.goalForecast(h, 150, UTC_BASE + 5 * WEEK), null,
    'bei diesem Zickzack darf der Coach nichts versprechen');
});

test('ein schon erreichtes Ziel wird nicht noch einmal vorhergesagt', () => {
  assert.strictEqual(R.goalForecast(ramp(6, 100, 2.5), 90, UTC_BASE + 5 * WEEK), null);
});

test('was in einer Spitzenwoche schon einmal stand, gilt als erreicht', () => {
  // Trendlinie bei 126.95, beste Woche bei 128.13: ein Ziel dazwischen ist
  // real bereits gehoben worden. 'In einer Woche' waere eine Beleidigung.
  const h = [w(0, 100), w(1, 104), w(2, 108), w(3, 124), w(4, 116), w(5, 120)];
  assert.strictEqual(R.goalForecast(h, 128, UTC_BASE + 5 * WEEK), null);
  const drueber = R.goalForecast(h, 129, UTC_BASE + 5 * WEEK);
  assert.ok(drueber, 'oberhalb der Bestleistung ist die Prognose wieder erlaubt');
  assert.ok(drueber.weeks >= 1);
});

test('ein Ziel unterhalb der Trendlinie ergibt keine null Wochen', () => {
  // Letzte Woche unter der Linie, Ziel zwischen Bestwert und Trendlinie.
  const h = [w(0, 100), w(1, 106), w(2, 112), w(3, 118), w(4, 124), w(5, 120)];
  assert.strictEqual(R.goalForecast(h, 128.5, UTC_BASE + 5 * WEEK), null);
});

test('weiter als ein Jahr voraus wird nichts vorhergesagt', () => {
  assert.strictEqual(R.goalForecast(ramp(6, 100, 0.5), 300, UTC_BASE + 5 * WEEK), null);
});

test('ein alter Verlauf traegt die Prognose nicht mehr', () => {
  assert.strictEqual(R.goalForecast(ramp(6, 100, 2.5), 130, UTC_BASE + 60 * WEEK), null);
});

test('Eintraege aus der Zukunft zaehlen nicht mit', () => {
  const h = ramp(6, 100, 2.5).concat([w(20, 300)]);
  const f = R.goalForecast(h, 130, UTC_BASE + 5 * WEEK);
  assert.deepStrictEqual(f, R.goalForecast(ramp(6, 100, 2.5), 130, UTC_BASE + 5 * WEEK));
});

test('goalForecast fasst die uebergebene Historie nicht an', () => {
  const h = ramp(6, 100, 2.5);
  const before = JSON.stringify(h);
  R.goalForecast(h, 130, UTC_BASE + 5 * WEEK);
  assert.strictEqual(JSON.stringify(h), before);
});

// ── Rueckgabe an den Satzkatalog ──────────────────────────────────────────

test('reportSay reicht das Wochenvolumen als Schluessel und Wert weiter', () => {
  const n = R.weekNumbers(S3(), MO);
  assert.deepStrictEqual(R.reportSay(n), { key: 'reportReady', vars: { vol: 1460 } });
});

test('ohne Volumen gibt es keinen Wochenbericht anzukuendigen', () => {
  assert.strictEqual(R.reportSay(R.weekNumbers([], MO)), null);
  assert.strictEqual(R.reportSay(null), null);
});

test('forecastSay traegt Ziel, Uebung und Wochen', () => {
  const f = R.goalForecast(ramp(6, 100, 2.5), 130, UTC_BASE + 5 * WEEK);
  assert.deepStrictEqual(R.forecastSay(f, 'Bankdruecken'),
    { key: 'forecast', vars: { ex: 'Bankdruecken', kg: 130, weeks: 6 } });
});

test('ohne Prognose und ohne Uebungsname gibt es keinen Satz', () => {
  const f = R.goalForecast(ramp(6, 100, 2.5), 130, UTC_BASE + 5 * WEEK);
  assert.strictEqual(R.forecastSay(null, 'Bankdruecken'), null);
  // Ohne Namen laese sich der Satz als 'sind 130 kg bei in 6 Wochen
  // erreichbar' — ein halber Satz ist schlimmer als kein Satz.
  assert.strictEqual(R.forecastSay(f, ''), null);
  assert.strictEqual(R.forecastSay(f, null), null);
});

// ── Der gerenderte Satz, in allen Toenen und beiden Sprachen ──────────────

const TONES = ['ruhig', 'sachlich', 'hart', 'locker'];
const LANGS = ['de', 'en'];

function each(fn) {
  LANGS.forEach(function (lang) {
    TONES.forEach(function (tone) { fn(tone, lang); });
  });
}

test('jeder Satz aus diesem Modul ist vollstaendig, in vier Toenen und zwei Sprachen', () => {
  const nums = R.weekNumbers(S3(), MO);
  const f = R.goalForecast(ramp(6, 100, 2.5), 130, UTC_BASE + 5 * WEEK);
  const says = [R.reportSay(nums), R.forecastSay(f, 'Bankdruecken')];
  says.forEach(function (say) {
    assert.ok(say, 'die Fixture muss beide Saetze wirklich erzeugen');
    each(function (tone, lang) {
      const txt = P.say(say.key, say.vars, { tone: tone }, lang);
      const wo = say.key + '/' + tone + '/' + lang + ': "' + txt + '"';
      assert.ok(txt.length > 0, 'leerer Satz bei ' + wo);
      assert.ok(!/\{[a-z]+\}/i.test(txt), 'Platzhalter uebrig bei ' + wo);
      assert.ok(!/\s{2,}/.test(txt), 'doppeltes Leerzeichen bei ' + wo);
      assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(txt), 'Emoji bei ' + wo);
    });
  });
});

test('jede Zahl des Moduls landet wirklich im Satz', () => {
  const nums = R.weekNumbers(S3(), MO);
  each(function (tone, lang) {
    const txt = P.say('reportReady', R.reportSay(nums).vars, { tone: tone }, lang);
    assert.ok(/1[.,]460/.test(txt), 'Volumen fehlt im Satz: ' + tone + '/' + lang + ' ' + txt);
  });
  const f = R.goalForecast(ramp(6, 100, 2.5), 130, UTC_BASE + 5 * WEEK);
  const vars = R.forecastSay(f, 'Bankdruecken').vars;
  each(function (tone, lang) {
    const txt = P.say('forecast', vars, { tone: tone }, lang);
    assert.ok(txt.indexOf('130') >= 0, 'Ziel fehlt im Satz: ' + tone + '/' + lang + ' ' + txt);
    assert.ok(txt.indexOf('6') >= 0, 'Wochen fehlen im Satz: ' + tone + '/' + lang + ' ' + txt);
  });
});

test('die Prognose nennt in jedem Ton eine Bedingung und nie eine Zusage', () => {
  const f = R.goalForecast(ramp(6, 100, 2.5), 130, UTC_BASE + 5 * WEEK);
  const vars = R.forecastSay(f, 'Bankdruecken').vars;
  each(function (tone, lang) {
    const txt = P.say('forecast', vars, { tone: tone }, lang);
    const wo = tone + '/' + lang + ': "' + txt + '"';
    const cond = lang === 'de' ? /\bwenn\b/i : /\bif\b/i;
    assert.ok(cond.test(txt), 'ohne Bedingung ist das eine Zusage — ' + wo);
    assert.ok(!/\b(garantiert|sicher|versprochen|guaranteed|promise|will definitely)\b/i.test(txt),
      'Zusage im Prognosesatz — ' + wo);
  });
});

// ── Bauart ────────────────────────────────────────────────────────────────

test('das Modul rechnet nur: keine Zeit, kein Netz, kein Speicher, keine Saetze', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'js', 'coach-report.js'), 'utf8');
  assert.ok(!/Date\.now\(/.test(src), 'Date.now() macht das Modul untestbar');
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|AI_WORKER_URL/.test(src), 'kein Modellaufruf hier');
  assert.ok(!/localStorage|document\.|window\./.test(src), 'kein DOM, kein Speicher');
  assert.ok(/^\s*'use strict';/m.test(src), 'use strict fehlt');
});

test('die Konstanten sind die Anforderung und stehen offen', () => {
  assert.strictEqual(R.MIN_WEEKS, 4);
  assert.strictEqual(R.MAX_FORECAST_WEEKS, 52);
  assert.strictEqual(R.MIN_R2, 0.7);
});
