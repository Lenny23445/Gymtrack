const test = require('node:test');
const assert = require('node:assert');
const S = require('../js/coach-session.js');
const P = require('../js/coach-persona.js');

const T0  = 1753600000000;
const MIN = 60000;

function newSess(over) {
  return S.sessionNew(Object.assign({
    wkTs: T0,
    level: 'full',
    planName: 'Push',
    lastSame: { ex: 'Bankdruecken', kg: 60, sets: 3, reps: 10, vol: 4000 },
    muted: [],
    expectedSets: 9
  }, over || {}));
}

// Traegt den Zustand von Schritt zu Schritt weiter und sammelt jede Aeusserung.
// Nur der zurueckgegebene Zustand wird weiterverwendet — genau so laeuft die
// Verdrahtung spaeter auch.
function play(sess) {
  let s = sess;
  const outs = [];
  return {
    do(fn) { const r = fn(s); s = r.sess; if (r.out) outs.push(r.out); return r.out; },
    outs: outs,
    get s() { return s; },
    kinds() { return outs.map(function (o) { return o.kind; }); }
  };
}

function openEx(i) {
  return { id: 'ex' + i, name: 'Uebung ' + i, targetSets: 3, targetReps: 10, lastKg: 60 };
}

// Eine Einheit, die JEDEN Trigger des Moduls anfassen wuerde: 3 Uebungen x 3
// Saetze, fallende Wiederholungen, steigende Pausen (die Schwelle 60 s wird
// unterwegs ueberschritten), ein Tick nach 40 Minuten, Abschluss.
function fullRun(level, over) {
  const p = play(newSess(Object.assign({ level: level }, over || {})));
  p.do(function (s) { return S.onStart(s); });
  let n = 0;
  for (let e = 0; e < 3; e++) {
    p.do(function (s) { return S.onExerciseOpen(s, openEx(e)); });
    for (let i = 0; i < 3; i++) {
      const ts = T0 + n * 3 * MIN;
      const reps = 10 - i;
      const secs = Math.round(40 * Math.pow(1.25, n));
      p.do(function (s) { return S.onSet(s, { exId: 'ex' + e, reps: reps, kg: 60, ts: ts }); });
      p.do(function (s) { return S.onRest(s, secs); });
      n++;
    }
  }
  p.do(function (s) { return S.onTick(s, T0 + 40 * MIN); });
  p.do(function (s) { return S.sessionEnd(s, { sets: 9, vol: 4860, prs: 1 }); });
  return p;
}

// Wie fullRun, aber mit kurzen Pausen (< 60 s) — so frisst restNext das Budget
// nicht auf und Ermuedung und Stillstand kommen wirklich vor. Ohne diesen Lauf
// wuerde der Mute-Test nichts beweisen.
function deepRun(level, muted) {
  const p = play(newSess({ level: level, muted: muted || [], expectedSets: 6 }));
  p.do(function (s) { return S.onStart(s); });
  let n = 0;
  for (let e = 0; e < 2; e++) {
    p.do(function (s) { return S.onExerciseOpen(s, openEx(e)); });
    for (let i = 0; i < 3; i++) {
      const ts = T0 + n * 2 * MIN;
      const reps = 10 - i;
      const secs = Math.round(20 * Math.pow(1.2, n));
      p.do(function (s) { return S.onSet(s, { exId: 'ex' + e, reps: reps, kg: 60, ts: ts }); });
      p.do(function (s) { return S.onRest(s, secs); });
      n++;
    }
  }
  p.do(function (s) { return S.onTick(s, T0 + 40 * MIN); });
  p.do(function (s) { return S.sessionEnd(s, { sets: 6, vol: 3000 }); });
  return p;
}

// ── Obergrenze und Stufenfilter ────────────────────────────────────────────

test('Stufe off sagt in einer vollen Einheit nichts', () => {
  assert.strictEqual(fullRun('off').outs.length, 0);
});

test('Stufe key haelt die Obergrenze von vier Aeusserungen', () => {
  const n = fullRun('key').outs.length;
  assert.ok(n > 0, 'key schweigt komplett: ' + n);
  assert.ok(n <= S.CAP.key, 'key ueber der Obergrenze: ' + n);
});

test('Stufe full sagt mehr als key und bleibt bei acht', () => {
  const n = fullRun('full').outs.length;
  assert.ok(n > S.CAP.key, 'full sagt nicht mehr als key: ' + n);
  assert.ok(n <= S.CAP.full, 'full ueber der Obergrenze: ' + n);
});

test('kein Lauf uebersteigt die Obergrenze, auch nicht mit erzwungenem Abschluss', () => {
  ['key', 'full'].forEach(function (level) {
    const p = play(newSess({ level: level }));
    p.do(function (s) { return S.onStart(s); });
    for (let i = 0; i < 50; i++) p.do(function (s) { return S.onExerciseOpen(s, openEx(i)); });
    p.do(function (s) { return S.onSet(s, { exId: 'ex1', reps: 8, kg: 50, ts: T0 }); });
    p.do(function (s) { return S.onRest(s, 120); });
    p.do(function (s) { return S.onTick(s, T0 + 40 * MIN); });
    p.do(function (s) { return S.sessionEnd(s, { sets: 50, vol: 1000 }); });
    assert.ok(p.outs.length <= S.CAP[level], level + ': ' + p.outs.length + ' Aeusserungen');
    assert.strictEqual(p.outs[p.outs.length - 1].kind, 'debrief');
  });
});

test('Stufe key laesst nur die fuenf erlaubten Arten durch', () => {
  const allowed = ['greet', 'greetFirst', 'exOpen', 'warmupIntro', 'debrief'];
  // deepRun('full') loest mid, fatigue und stall nachweislich aus (eigener
  // Test) — dieselbe Einheit auf key darf keine davon zeigen.
  const kinds = fullRun('key').kinds().concat(deepRun('key').kinds());
  assert.ok(kinds.length > 0, 'nichts geprueft: key schweigt komplett');
  kinds.forEach(function (k) {
    assert.ok(allowed.indexOf(k) >= 0, 'unerlaubte Art auf key: ' + k);
  });
});

test('nach dem Budget schweigt der Coach auch bei zutreffendem Anlass', () => {
  const p = play(newSess({ level: 'key' }));
  for (let i = 0; i < 30; i++) p.do(function (s) { return S.onExerciseOpen(s, openEx(i)); });
  assert.ok(p.outs.length > 0);
  assert.ok(p.outs.length <= S.CAP.key, 'Budget gerissen: ' + p.outs.length);
  assert.strictEqual(S.onExerciseOpen(p.s, openEx(99)).out, null);
});

test('der Abschluss kommt auch bei leerem Budget', () => {
  const p = play(newSess({ level: 'key' }));
  for (let i = 0; i < 20; i++) p.do(function (s) { return S.onExerciseOpen(s, openEx(i)); });
  assert.strictEqual(p.do(function (s) { return S.sessionEnd(s, { sets: 20, vol: 5000 }); }).kind, 'debrief');
});

test('der Abschluss kommt genau einmal', () => {
  const r = S.sessionEnd(newSess({ level: 'full' }), { sets: 5, vol: 100 });
  assert.strictEqual(r.out.kind, 'debrief');
  assert.strictEqual(S.sessionEnd(r.sess, { sets: 5, vol: 100 }).out, null);
});

test('Stufe off schweigt auch beim Abschluss', () => {
  assert.strictEqual(S.sessionEnd(newSess({ level: 'off' }), { sets: 5, vol: 100 }).out, null);
});

test('verworfener Rueckgabewert verbraucht kein Budget', () => {
  const base = newSess({ level: 'key' });
  for (let i = 0; i < 5; i++) {
    const r = S.emit(base, 'exOpen', 'exOpen', { ex: 'Uebung' });
    assert.ok(r.out, 'Aufruf ' + i + ' schweigt');
    assert.notStrictEqual(r.sess, base);
  }
  assert.strictEqual(base.spoken, 0);
});

test('fremde Arten gehen durch emit und werden dort gefiltert', () => {
  assert.strictEqual(S.emit(newSess({ level: 'key' }), 'warmupIntro', 'warmupIntro', { ex: 'Uebung' }).out.kind, 'warmupIntro');
  assert.strictEqual(S.emit(newSess({ level: 'key' }), 'cue', 'cue', { ex: 'Uebung' }).out, null);
  assert.strictEqual(S.emit(newSess({ level: 'full' }), 'cue', 'cue', { ex: 'Uebung' }).out.kind, 'cue');
});

// ── Begruessung ────────────────────────────────────────────────────────────

test('die Begruessung kommt nur einmal je Einheit', () => {
  const n = fullRun('full').kinds().filter(function (k) { return k === 'greet' || k === 'greetFirst'; }).length;
  assert.strictEqual(n, 1);
});

test('ohne Vorwerte begruesst der Coach als erste Einheit', () => {
  assert.strictEqual(S.onStart(newSess({ lastSame: null })).out.kind, 'greetFirst');
});

test('mit Vorwerten begruesst der Coach mit den alten Zahlen', () => {
  const o = S.onStart(newSess({ level: 'key' })).out;
  assert.strictEqual(o.kind, 'greet');
  assert.strictEqual(o.vars.ex, 'Bankdruecken');
  assert.strictEqual(o.vars.kg, 60);
});

// ── Mute-Liste ─────────────────────────────────────────────────────────────

test('ohne Mute-Liste kommen Ermuedung und Stillstand vor', () => {
  const kinds = deepRun('full', []).kinds();
  assert.ok(kinds.indexOf('fatigue') >= 0, 'fatigue fehlt: ' + kinds.join(','));
  assert.ok(kinds.indexOf('stall') >= 0, 'stall fehlt: ' + kinds.join(','));
});

test('gemutete Arten kommen nicht vor', () => {
  const kinds = deepRun('full', ['fatigue', 'stall']).kinds();
  assert.ok(kinds.indexOf('fatigue') < 0, 'fatigue trotz Mute: ' + kinds.join(','));
  assert.ok(kinds.indexOf('stall') < 0, 'stall trotz Mute: ' + kinds.join(','));
  assert.ok(kinds.length > 0, 'Mute macht den Coach ganz stumm');
});

// ── Stillstand ─────────────────────────────────────────────────────────────

function afterSet() {
  const p = play(newSess({ level: 'full', expectedSets: 99 }));
  p.do(function (s) { return S.onSet(s, { exId: 'ex1', reps: 10, kg: 50, ts: T0 }); });
  return p;
}

test('ohne gespeicherten Satz gibt es keinen Stillstand', () => {
  assert.strictEqual(S.onTick(newSess({ level: 'full' }), T0 + 40 * MIN).out, null);
});

test('elf Minuten Stille sind noch kein Stillstand', () => {
  assert.strictEqual(afterSet().do(function (s) { return S.onTick(s, T0 + 11 * MIN); }), null);
});

test('dreizehn Minuten Stille melden Stillstand', () => {
  const p = afterSet();
  p.do(function (s) { return S.onTick(s, T0 + 11 * MIN); });
  assert.strictEqual(p.do(function (s) { return S.onTick(s, T0 + 13 * MIN); }).kind, 'stall');
});

test('Stillstand meldet sich nur einmal', () => {
  const p = afterSet();
  assert.strictEqual(p.do(function (s) { return S.onTick(s, T0 + 13 * MIN); }).kind, 'stall');
  assert.strictEqual(p.do(function (s) { return S.onTick(s, T0 + 30 * MIN); }), null);
});

// ── Halbzeit ───────────────────────────────────────────────────────────────

test('die Halbzeit traegt das bisherige Volumen', () => {
  const p = play(newSess({ level: 'full', expectedSets: 4 }));
  p.do(function (s) { return S.onExerciseOpen(s, openEx(1)); });
  p.do(function (s) { return S.onSet(s, { exId: 'ex1', reps: 10, kg: 50, ts: T0 }); });
  const o = p.do(function (s) { return S.onSet(s, { exId: 'ex1', reps: 10, kg: 50, ts: T0 + MIN }); });
  assert.strictEqual(o.kind, 'mid');
  assert.strictEqual(typeof o.vars.vol, 'number');
  assert.ok(o.vars.vol > 0, 'Volumen nicht mitgefuehrt: ' + o.vars.vol);
});

test('ohne Erwartungswert kommt die Halbzeit beim sechsten Satz', () => {
  const p = play(newSess({ level: 'full', expectedSets: null }));
  p.do(function (s) { return S.onExerciseOpen(s, openEx(1)); });
  for (let i = 0; i < 5; i++) {
    const ts = T0 + i * MIN;
    p.do(function (s) { return S.onSet(s, { exId: 'ex1', reps: 10, kg: 50, ts: ts }); });
  }
  assert.ok(p.kinds().indexOf('mid') < 0, 'Halbzeit zu frueh: ' + p.kinds().join(','));
  assert.strictEqual(p.do(function (s) { return S.onSet(s, { exId: 'ex1', reps: 10, kg: 50, ts: T0 + 5 * MIN }); }).kind, 'mid');
});

// ── Pause und Ermuedung ────────────────────────────────────────────────────

function restSess() {
  return S.onExerciseOpen(newSess({ level: 'full' }), { id: 'ex1', name: 'Uebung', targetSets: 3, targetReps: 8, lastKg: 50 }).sess;
}

test('Pause unter 60 Sekunden kuendigt nichts an', () => {
  assert.strictEqual(S.onRest(restSess(), 59).out, null);
});

test('Pause ab 60 Sekunden kuendigt den naechsten Satz an', () => {
  const o = S.onRest(restSess(), 60).out;
  assert.strictEqual(o.kind, 'restNext');
  assert.strictEqual(o.vars.kg, 50);
  assert.strictEqual(o.vars.reps, 8);
});

function fatigueKinds(repsSeq, restSeq) {
  const p = play(newSess({ level: 'full', expectedSets: 99 }));
  p.do(function (s) { return S.onExerciseOpen(s, { id: 'ex1', name: 'Uebung', targetSets: 5, targetReps: 10, lastKg: 50 }); });
  for (let i = 0; i < repsSeq.length; i++) {
    const reps = repsSeq[i];
    const ts = T0 + i * MIN;
    p.do(function (s) { return S.onSet(s, { exId: 'ex1', reps: reps, kg: 50, ts: ts }); });
    if (i < restSeq.length) p.do(function (s) { return S.onRest(s, restSeq[i]); });
  }
  return p.kinds();
}

test('fallende Wiederholungen mit steigenden Pausen melden Ermuedung', () => {
  assert.ok(fatigueKinds([10, 9, 8, 7], [30, 30, 40, 55]).indexOf('fatigue') >= 0);
});

test('fallende Wiederholungen allein melden keine Ermuedung', () => {
  const kinds = fatigueKinds([10, 9, 8, 7], [30, 30, 30, 30]);
  assert.ok(kinds.indexOf('fatigue') < 0, 'Ermuedung ohne steigende Pausen: ' + kinds.join(','));
});

test('steigende Pausen allein melden keine Ermuedung', () => {
  const kinds = fatigueKinds([10, 10, 10, 10], [30, 30, 40, 55]);
  assert.ok(kinds.indexOf('fatigue') < 0, 'Ermuedung ohne Wiederholungsabfall: ' + kinds.join(','));
});

test('Ermuedung meldet sich nur einmal', () => {
  const kinds = fatigueKinds([10, 9, 8, 7, 6, 5], [30, 30, 40, 55, 70, 90]);
  assert.strictEqual(kinds.filter(function (k) { return k === 'fatigue'; }).length, 1);
});

// ── Zustand aus einer anderen Einheit ──────────────────────────────────────

test('ein Zustand aus einer anderen Einheit ist veraltet', () => {
  const sess = newSess();
  assert.strictEqual(S.isStale(sess, T0 + 999), true);
  assert.strictEqual(S.isStale(sess, T0), false);
});

// ── Kopplung an die Persona ────────────────────────────────────────────────

test('der Coach liefert Schluessel und Werte, nie fertigen Text', () => {
  const o = S.onStart(newSess({ level: 'key' })).out;
  assert.strictEqual(typeof o.key, 'string');
  assert.strictEqual(typeof o.vars, 'object');
  assert.strictEqual(o.text, undefined);
});

test('jeder gelieferte Schluessel steht im Satzkatalog', () => {
  const outs = fullRun('full').outs.concat(deepRun('full').outs);
  assert.ok(outs.length > 0);
  outs.forEach(function (o) {
    assert.ok(P.KEYS.indexOf(o.key) >= 0, 'Schluessel fehlt im Katalog: ' + o.key);
  });
});

// ── Regelwerke ─────────────────────────────────────────────────────────────

test('Obergrenze und Stufenlisten haben die vereinbarten Werte', () => {
  assert.deepStrictEqual(S.CAP, { off: 0, key: 4, full: 8 });
  assert.strictEqual(S.LEVEL_KINDS.off.length, 0);
  assert.deepStrictEqual(S.LEVEL_KINDS.key.slice().sort(),
    ['debrief', 'exOpen', 'greet', 'greetFirst', 'warmupIntro']);
  ['mid', 'restTip', 'restNext', 'fatigue', 'stall', 'recall', 'plateau', 'timeBudget', 'cue']
    .forEach(function (k) { assert.ok(S.LEVEL_KINDS.full.indexOf(k) >= 0, 'full ohne ' + k); });
  S.LEVEL_KINDS.key.forEach(function (k) { assert.ok(S.LEVEL_KINDS.full.indexOf(k) >= 0, 'full ohne ' + k); });
  ['greet', 'greetFirst', 'mid', 'fatigue', 'stall', 'debrief', 'recall', 'plateau', 'timeBudget']
    .forEach(function (k) { assert.ok(S.ONCE.indexOf(k) >= 0, 'ONCE ohne ' + k); });
  assert.ok(S.ONCE.indexOf('exOpen') < 0, 'exOpen darf je Uebung kommen, nicht je Einheit');
});

// Ein Emoji-Test steht hier bewusst NICHT: das Modul gibt nur Schluessel und
// die Werte zurueck, die der Aufrufer hereingegeben hat. Ein solcher Test
// pruefte die Testdaten, nicht das Modul. Der Emoji-Riegel fuer die Saetze
// sitzt in test/coach-persona.test.js, wo die Texte liegen.

// ── Der gerenderte Satz, nicht nur der Schluessel ──────────────────────────
// Muster aus test/coach-analyze.test.js: geprueft wird der SATZ, den
// CoachPersona daraus macht — alle vier Toene, beide Sprachen. Nur so faellt
// ein Platzhalter ohne Wert auf: fill() entfernt ihn still und laesst die
// Einheit stehen ('zuletzt kg bei 8 Wiederholungen'). Der Schluessel allein
// sieht dabei jedes Mal richtig aus.

// Eine Einheit, vor der keine Zahl steht. '60 kg' ist sauber, 'zuletzt kg'
// nicht. Bewusst nur die Einheiten, die im Katalog IMMER an einem Platzhalter
// haengen — 'zwoelf Minuten' und 'zwanzig Sekunden' stehen dort ausgeschrieben
// und sind kein Fehler.
const ORPHAN_UNIT = /(^|[^0-9\s])\s*\b(kg|Kilo|kilos|Prozent|percent)\b/;

function assertRendered(out, where) {
  assert.ok(out, 'keine Aeusserung, nichts geprueft: ' + where);
  ['de', 'en'].forEach(function (lang) {
    P.TONES.forEach(function (tone) {
      const w = where + '/' + tone + '/' + lang;
      const s = P.say(out.key, out.vars, { tone: tone }, lang);
      assert.ok(s.length > 0, 'leerer Satz: ' + w);
      assert.ok(!/[{}]/.test(s), 'Restplatzhalter: ' + w + ' -> ' + s);
      assert.ok(!/\s{2,}/.test(s), 'doppeltes Leerzeichen: ' + w + ' -> ' + s);
      assert.ok(!ORPHAN_UNIT.test(s), 'Einheit ohne Zahl: ' + w + ' -> ' + s);
    });
  });
}

test('jede Aeusserung eines vollen Laufs ergibt einen vollstaendigen Satz', () => {
  const outs = fullRun('full').outs.concat(deepRun('full').outs);
  assert.ok(outs.length > 0, 'nichts geprueft');
  outs.forEach(function (o, i) { assertRendered(o, o.kind + '#' + i); });
});

test('Uebung ohne Vorgewicht ergibt keinen halben Satz', () => {
  // Trifft JEDE erstmals gefahrene Uebung, im ersten Training also durchgehend.
  const r = S.onExerciseOpen(newSess({ level: 'key' }),
    { id: 'x', name: 'Bankdrücken', targetSets: 3, targetReps: 8 });
  assert.ok(r.out, 'die erste Uebung darf nicht stumm bleiben');
  assert.strictEqual(r.out.kind, 'exOpen');
  assert.strictEqual(r.out.key, 'greetFirst', 'ohne Vorgewicht traegt der Satzschluessel keinen {kg}-Platzhalter');
  assertRendered(r.out, 'exOpen ohne lastKg');
});

test('Uebung mit Vorgewicht behaelt den vollen Satz', () => {
  const r = S.onExerciseOpen(newSess({ level: 'key' }),
    { id: 'x', name: 'Bankdrücken', targetSets: 3, targetReps: 8, lastKg: 60 });
  assert.strictEqual(r.out.key, 'exOpen');
  assertRendered(r.out, 'exOpen vollstaendig');
});

test('Uebung ohne Namen sagt nichts, statt einen Satz ohne Subjekt zu bauen', () => {
  assert.strictEqual(S.onExerciseOpen(newSess({ level: 'key' }), { id: 'x', lastKg: 60, targetSets: 3, targetReps: 8 }).out, null);
});

test('Uebung mit Gewicht aber ohne Satz- oder Wiederholungszahl schweigt', () => {
  const base = newSess({ level: 'key' });
  assert.strictEqual(S.onExerciseOpen(base, { id: 'x', name: 'Bankdrücken', lastKg: 60, targetReps: 8 }).out, null);
  assert.strictEqual(S.onExerciseOpen(base, { id: 'x', name: 'Bankdrücken', lastKg: 60, targetSets: 3 }).out, null);
});

test('Begruessung ohne vollstaendige Vorwerte faellt auf die Erstansage zurueck', () => {
  const r = S.onStart(newSess({ level: 'key', lastSame: { ex: 'Bankdrücken', vol: 4000 } }));
  assert.strictEqual(r.out.kind, 'greetFirst');
  assertRendered(r.out, 'greet ohne Zahlen');
});

test('ohne Namen und ohne Vorwerte gibt es keine Begruessung', () => {
  assert.strictEqual(S.onStart(newSess({ level: 'key', lastSame: null, planName: null })).out, null,
    'Eine Begruessung ohne Subjekt ist keine Begruessung');
});

test('Halbzeit ohne Vorwochenvolumen wird unterdrueckt statt halb gesagt', () => {
  const p = play(newSess({ level: 'full', expectedSets: 2, lastSame: { ex: 'Bankdrücken', kg: 60, sets: 3, reps: 10 } }));
  p.do(function (s) { return S.onExerciseOpen(s, openEx(1)); });
  p.do(function (s) { return S.onSet(s, { exId: 'ex1', reps: 10, kg: 50, ts: T0 }); });
  assert.ok(p.kinds().indexOf('mid') < 0,
    'Ohne Vergleichswert traegt die Halbzeit nur einen leeren Prozentplatz: ' + p.kinds().join(','));
});

test('Halbzeit mit Vorwochenvolumen ergibt einen vollstaendigen Satz', () => {
  const p = play(newSess({ level: 'full', expectedSets: 2 }));
  p.do(function (s) { return S.onExerciseOpen(s, openEx(1)); });
  const o = p.do(function (s) { return S.onSet(s, { exId: 'ex1', reps: 10, kg: 50, ts: T0 }); });
  assert.strictEqual(o.kind, 'mid');
  assertRendered(o, 'mid');
});

test('Pausenvorschau ohne Vorgewicht wird unterdrueckt', () => {
  const s = S.onExerciseOpen(newSess({ level: 'full' }), { id: 'x', name: 'Bankdrücken', targetSets: 3, targetReps: 8 }).sess;
  assert.strictEqual(S.onRest(s, 90).out, null,
    'Eine Vorschau ohne Gewicht kuendigt nichts an, sie zeigt nur eine Einheit');
});

test('Pausenvorschau mit Vorgewicht ergibt einen vollstaendigen Satz', () => {
  assertRendered(S.onRest(restSess(), 90).out, 'restNext');
});

test('die Bilanz ergibt einen vollstaendigen Satz und traegt keinen toten Platzhalter', () => {
  const o = S.sessionEnd(newSess({ level: 'full' }), { sets: 9, vol: 4860, prs: 2 }).out;
  assertRendered(o, 'debrief');
  assert.strictEqual(o.vars.prs, undefined,
    'Der Katalog kennt {prs} nicht — ein Wert, den kein Satz liest, gehoert nicht in die Rueckgabe');
});

// ── Der erzwungene Abschluss zaehlt mit ────────────────────────────────────

test('der erzwungene Abschluss zaehlt gegen spoken', () => {
  const r = S.sessionEnd(newSess({ level: 'full' }), { sets: 9, vol: 4860 });
  assert.strictEqual(r.sess.spoken, 1, 'force darf die Buchhaltung nicht umgehen');
});

test('ein vorgezogener Abschluss frisst sein Budget, statt es zu verschenken', () => {
  // Der Pfad einer neunten Aeusserung: erst der Abschluss, dann weitere
  // Ansagen. Zaehlt der Abschluss nicht mit, kommen CAP+1 Aeusserungen durch.
  ['key', 'full'].forEach(function (level) {
    const p = play(newSess({ level: level }));
    assert.strictEqual(p.do(function (s) { return S.emit(s, 'debrief', 'debrief', { sets: 9, vol: 100 }, true); }).kind, 'debrief');
    for (let i = 0; i < 20; i++) p.do(function (s) { return S.onExerciseOpen(s, openEx(i)); });
    assert.ok(p.outs.length <= S.CAP[level], level + ': ' + p.outs.length + ' Aeusserungen bei CAP ' + S.CAP[level]);
  });
});

// ── force gilt nur fuer den Abschluss ──────────────────────────────────────

test('force hebelt Stufenfilter und Budget nur fuer den Abschluss aus', () => {
  assert.strictEqual(S.emit(newSess({ level: 'key' }), 'cue', 'cue', { ex: 'Uebung' }, true).out, null,
    'force an einer beliebigen Art wuerde Stufe und Obergrenze zugleich aushebeln');
});

test('erzwungene Nicht-Abschluss-Aeusserungen sprengen die Obergrenze nicht', () => {
  const p = play(newSess({ level: 'full' }));
  for (let i = 0; i < 20; i++) {
    p.do(function (s) { return S.emit(s, 'cue', 'cue', { ex: 'Uebung ' + i }, true); });
  }
  p.do(function (s) { return S.sessionEnd(s, { sets: 9, vol: 100 }); });
  assert.ok(p.outs.length <= S.CAP.full, 'Obergrenze gerissen: ' + p.outs.length);
});

test('force ueberspringt die Mute-Liste nicht', () => {
  assert.strictEqual(S.emit(newSess({ level: 'full', muted: ['debrief'] }), 'debrief', 'debrief', {}, true).out, null);
});

// ── Nach dem Abschluss ist Schluss ─────────────────────────────────────────

test('nach dem Abschluss sagt der Coach nichts mehr', () => {
  // Realer Ausloeser: Training beenden, dann erneut oeffnen, um einen Satz zu
  // korrigieren.
  const p = play(newSess({ level: 'full' }));
  p.do(function (s) { return S.onStart(s); });
  p.do(function (s) { return S.sessionEnd(s, { sets: 9, vol: 4860 }); });
  const before = p.outs.length;
  for (let i = 0; i < 6; i++) p.do(function (s) { return S.onExerciseOpen(s, openEx(i)); });
  p.do(function (s) { return S.onSet(s, { exId: 'ex1', reps: 10, kg: 60, ts: T0 }); });
  p.do(function (s) { return S.onRest(s, 120); });
  p.do(function (s) { return S.onTick(s, T0 + 60 * MIN); });
  assert.strictEqual(p.outs.length, before, 'nach dem Abschluss kamen ' + (p.outs.length - before) + ' Aeusserungen nach');
  assert.strictEqual(p.s.ended, true);
});

test('der Abschluss setzt ended auch auf Stufe off', () => {
  const r = S.sessionEnd(newSess({ level: 'off' }), { sets: 5, vol: 100 });
  assert.strictEqual(r.out, null);
  assert.strictEqual(r.sess.ended, true, 'ohne ended liefe die Einheit nach dem Beenden weiter');
});

// ── Wiedereinstieg in eine laufende Einheit ────────────────────────────────

test('sessionResume traegt Budget und ONCE-Buchhaltung weiter', () => {
  const p = play(newSess({ level: 'key' }));
  p.do(function (s) { return S.onStart(s); });
  for (let i = 0; i < 2; i++) p.do(function (s) { return S.onExerciseOpen(s, openEx(i)); });
  const saved = JSON.parse(JSON.stringify(p.s));   // so kommt der Zustand aus dem Speicher zurueck
  const back = S.sessionResume(saved, T0);
  assert.ok(back, 'ein Zustand derselben Einheit muss uebernommen werden');
  assert.strictEqual(back.spoken, p.s.spoken);
  assert.strictEqual(back.said.greet, true);

  const q = play(back);
  for (let i = 0; i < 20; i++) q.do(function (s) { return S.onExerciseOpen(s, openEx(i)); });
  q.do(function (s) { return S.sessionEnd(s, { sets: 9, vol: 100 }); });
  assert.ok(p.outs.length + q.outs.length <= S.CAP.key,
    'Nach dem Wiedereinstieg kamen zusammen ' + (p.outs.length + q.outs.length) + ' Aeusserungen durch');
  assert.strictEqual(q.outs.filter(function (o) { return o.kind === 'greet'; }).length, 0,
    'Die Begruessung darf nach dem Wiedereinstieg nicht ein zweites Mal kommen');
});

test('sessionResume lehnt einen Zustand aus einer anderen Einheit ab', () => {
  assert.strictEqual(S.sessionResume(newSess(), T0 + 999), null);
  assert.strictEqual(S.sessionResume(null, T0), null);
  assert.strictEqual(S.sessionResume(undefined, T0), null);
  assert.strictEqual(S.sessionResume('{}', T0), null);
  assert.strictEqual(S.sessionResume(newSess(), null), null);
});

test('sessionResume repariert einen beschaedigten Zustand, statt ihm zu glauben', () => {
  const back = S.sessionResume({ wkTs: T0, level: 'voll', spoken: '-3', said: { greet: true, mid: 0 }, rests: 'viele', reps: null }, T0);
  assert.ok(back);
  assert.strictEqual(back.level, 'key', 'unbekannte Stufe faellt auf die Vorgabe zurueck');
  assert.strictEqual(back.said.greet, true);
  assert.ok(!back.said.mid, 'ein falsy Eintrag ist keine gesagte Art');
  assert.ok(Array.isArray(back.rests) && Array.isArray(back.reps));
  assert.ok(back.spoken >= 1, 'weniger Aeusserungen als gesagte Arten waere geschenktes Budget: ' + back.spoken);
});

test('sessionNew legt bei gleichem wkTs trotzdem neu an', () => {
  // Der Unterschied zu sessionResume muss sichtbar sein: wer fortsetzen will,
  // ruft resume; sessionNew setzt zurueck, auch bei derselben Einheit.
  const p = play(newSess({ level: 'key' }));
  p.do(function (s) { return S.onStart(s); });
  assert.ok(p.s.spoken > 0);
  assert.strictEqual(newSess({ level: 'key' }).spoken, 0);
  assert.deepStrictEqual(newSess({ level: 'key' }).said, {});
});

// ── restTip loest kein Modulpfad aus ───────────────────────────────────────

test('restTip steht auf full, wird aber von keinem Pfad des Moduls ausgeloest', () => {
  // Dokumentierte Arbeitsteilung: den Technikhinweis emittiert die
  // Verdrahtung selbst ueber emit(sess, 'restTip', …) mit dem Text aus
  // CoachCues. Kippt das, ist entweder der Kommentar oder der Code falsch.
  assert.ok(S.LEVEL_KINDS.full.indexOf('restTip') >= 0);
  const kinds = fullRun('full').kinds().concat(deepRun('full').kinds());
  assert.ok(kinds.indexOf('restTip') < 0, 'restTip kommt jetzt aus dem Modul: ' + kinds.join(','));
  assert.strictEqual(S.emit(newSess({ level: 'full' }), 'restTip', 'restTip', { ex: 'Uebung' }).out.kind, 'restTip');
});
