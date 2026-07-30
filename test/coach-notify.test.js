const test = require('node:test');
const assert = require('node:assert');
const N = require('../js/coach-notify.js');
const P = require('../js/coach-persona.js');
const A = require('../js/coach-analyze.js');

const MIN  = 60 * 1000;
const HOUR = 60 * MIN;
const DAY  = 24 * HOUR;

// Mittwoch, 29.07.2026, 10:00 UTC. Mitten in der ISO-Woche 2026-W31
// (Mo 27.07. bis So 02.08.) und mitten am Tag — beides absichtlich, damit
// weder die Wochengrenze noch das Nachtfenster zufaellig mithineinspielt.
const T0 = Date.UTC(2026, 6, 29, 10, 0, 0);

const TONES = ['ruhig', 'sachlich', 'hart', 'locker'];
const LANGS = ['de', 'en'];

// Vollstaendiger Kontext: JEDER Kandidat hat eine Quelle. Wird fuer die
// Deckel-Tests von planAll gebraucht — ohne alle sechs Kandidaten liesse sich
// nicht zeigen, dass der fortgeschriebene Zustand greift.
function ctx(over) {
  return Object.assign({
    now:           T0,
    level:         'eng',
    state:         N.notifyNew(),
    tzOffsetMin:   0,
    workoutActive: false,
    reportAt:      T0 + 6 * HOUR,
    reportVol:     12400,
    nextWorkout:   { at: T0 + 26 * HOUR, ex: 'Bankdruecken', kg: 60, sets: 3, reps: 10 },
    lastWorkoutTs: T0 - 2 * DAY,
    deload:        true,
    anniversary:   { ex: 'Kniebeuge', kg: 90 },
    pr:            { ex: 'Kreuzheben', kg: 140 }
  }, over || {});
}

// Kontext OHNE jede Quelle. Basis fuer die Einzelkandidaten-Laeufe: nur so
// laesst sich jeder Kandidat einmal fuer sich durch den Deckel bringen.
function bare(over) {
  return Object.assign(ctx(), {
    reportAt:      null,
    reportVol:     null,
    nextWorkout:   null,
    lastWorkoutTs: null,
    deload:        false,
    anniversary:   null,
    pr:            null
  }, over || {});
}

// Die Quelle je Kandidatenart — einzeln eingesetzt in bare().
const SOLO = {
  report:       { reportAt: T0 + 6 * HOUR, reportVol: 12400 },
  reminderPlan: { nextWorkout: { at: T0 + 26 * HOUR, ex: 'Bankdruecken', kg: 60, sets: 3, reps: 10 } },
  returnNudge:  { lastWorkoutTs: T0 - 2 * DAY },
  deload:       { deload: true },
  anniversary:  { anniversary: { ex: 'Kniebeuge', kg: 90 } },
  prCongrats:   { pr: { ex: 'Kreuzheben', kg: 140 } }
};

function localHour(at, tzOffsetMin) {
  const d = new Date(at + (tzOffsetMin || 0) * MIN);
  return d.getUTCHours();
}

// ── Schluessel ───────────────────────────────────────────────────────────

test('weekKey haelt die fuehrende Null und zaehlt nicht daneben', () => {
  assert.strictEqual(N.weekKey(Date.UTC(2026, 0, 5)), '2026-W02');
});

test('weekKey ueberlebt den Jahreswechsel', () => {
  const k = N.weekKey(Date.UTC(2027, 0, 1));
  assert.ok(/^20(26|27)-W\d{2}$/.test(k), 'unerwarteter Wochenschluessel: ' + k);
});

// Der Deckel steht und faellt mit dem Wochenschluessel. Kommt der aus einer
// Abhaengigkeit, die zur Laufzeit fehlt, zaehlt die Woche nie zurueck und der
// Coach schweigt nach vier Meldungen fuer immer. Dieser Test ist der Riegel
// gegen genau diesen stillen Ausfall.
test('weekKey ist die Rechnung aus CoachAnalyze und nicht eine zweite', () => {
  [T0, Date.UTC(2026, 0, 5), Date.UTC(2027, 0, 1), Date.UTC(2026, 11, 31)].forEach((ts) => {
    assert.strictEqual(N.weekKey(ts), A.isoWeekKey(ts), 'weicht ab bei ' + new Date(ts).toISOString());
    assert.ok(N.weekKey(ts), 'kein Wochenschluessel bei ' + new Date(ts).toISOString());
  });
});

test('dayKey liefert das Datum zweistellig', () => {
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(N.dayKey(T0)));
  assert.strictEqual(N.dayKey(T0), '2026-07-29');
  assert.strictEqual(N.dayKey(Date.UTC(2026, 0, 5)), '2026-01-05');
});

// ── Der Deckel ───────────────────────────────────────────────────────────

test('der Wochenbericht kommt auch auf der Stufe still durch', () => {
  assert.strictEqual(N.mayNotify(N.notifyNew(), 'report', 'still', T0), true);
});

test('still ist still — fuer alles ausser dem Bericht', () => {
  ['reminderPlan', 'prCongrats', 'deload', 'returnNudge', 'anniversary'].forEach((k) => {
    assert.strictEqual(N.mayNotify(N.notifyNew(), k, 'still', T0), false, k + ' kam durch');
  });
});

test('normal laesst eine Meldung am Tag durch, die zweite nicht', () => {
  const s = N.record(N.notifyNew(), 'prCongrats', T0);
  assert.strictEqual(N.mayNotify(s, 'deload', 'normal', T0 + HOUR), false);
});

test('eng laesst zwei Meldungen am Tag durch, die dritte nicht', () => {
  const s1 = N.record(N.notifyNew(), 'prCongrats', T0);
  assert.strictEqual(N.mayNotify(s1, 'deload', 'eng', T0 + HOUR), true);
  const s2 = N.record(s1, 'deload', T0 + HOUR);
  assert.strictEqual(N.mayNotify(s2, 'returnNudge', 'eng', T0 + 2 * HOUR), false);
});

test('der Tageszaehler laeuft am naechsten Tag zurueck', () => {
  const s = N.record(N.notifyNew(), 'prCongrats', T0);
  assert.strictEqual(N.mayNotify(s, 'deload', 'normal', T0 + HOUR), false);
  assert.strictEqual(N.mayNotify(s, 'deload', 'normal', T0 + DAY), true);
});

test('vier Meldungen in einer Woche sind auf normal das Ende', () => {
  let s = N.notifyNew();
  ['prCongrats', 'deload', 'returnNudge', 'anniversary'].forEach((k, i) => {
    assert.strictEqual(N.mayNotify(s, k, 'normal', T0 + i * DAY), true, k + ' haette durchgehen muessen');
    s = N.record(s, k, T0 + i * DAY);
  });
  assert.strictEqual(N.mayNotify(s, 'reminderPlan', 'normal', T0 + 4 * DAY), false);
});

test('der Wochenzaehler laeuft in der naechsten Woche zurueck', () => {
  let s = N.notifyNew();
  ['prCongrats', 'deload', 'returnNudge', 'anniversary'].forEach((k, i) => {
    s = N.record(s, k, T0 + i * DAY);
  });
  assert.strictEqual(N.mayNotify(s, 'reminderPlan', 'normal', T0 + 8 * DAY), true);
});

test('der Bericht wird nicht gegen den Deckel gerechnet', () => {
  const s = N.record(N.notifyNew(), 'prCongrats', T0);
  assert.strictEqual(N.mayNotify(s, 'report', 'normal', T0 + HOUR), true);
});

// Die Gegenrichtung: der Bericht zaehlt auch selbst nicht MIT. Ohne diesen
// Test bliebe eine Fassung gruen, die den Bericht zwar durchlaesst, ihn aber
// auf den Tageszaehler bucht — und die naechste echte Meldung frisst.
test('der Bericht verbraucht das Tagesbudget nicht', () => {
  const s = N.record(N.notifyNew(), 'report', T0);
  assert.strictEqual(N.mayNotify(s, 'prCongrats', 'normal', T0 + HOUR), true);
});

test('der Bericht hat trotzdem seinen Mindestabstand von sechs Tagen', () => {
  const s = N.record(N.notifyNew(), 'report', T0);
  assert.strictEqual(N.mayNotify(s, 'report', 'eng', T0 + 5 * DAY), false);
  assert.strictEqual(N.mayNotify(s, 'report', 'eng', T0 + 7 * DAY), true);
});

test('der Jahresrueckblick kommt fruehestens nach 365 Tagen wieder', () => {
  const s = N.record(N.notifyNew(), 'anniversary', T0);
  assert.strictEqual(N.mayNotify(s, 'anniversary', 'eng', T0 + 200 * DAY), false);
  assert.strictEqual(N.mayNotify(s, 'anniversary', 'eng', T0 + 370 * DAY), true);
});

test('der Anstoss nach der Pause kommt fruehestens nach fuenf Tagen wieder', () => {
  const s = N.record(N.notifyNew(), 'returnNudge', T0);
  assert.strictEqual(N.mayNotify(s, 'returnNudge', 'eng', T0 + 2 * DAY), false);
  assert.strictEqual(N.mayNotify(s, 'returnNudge', 'eng', T0 + 6 * DAY), true);
});

test('eine unbekannte Art kommt nicht durch', () => {
  assert.strictEqual(N.mayNotify(N.notifyNew(), 'jubelArie', 'eng', T0), false);
});

// Ein verworfener Rueckgabewert darf nicht trotzdem gegen das Budget zaehlen —
// dieselbe Lehre wie im Erzaehlbogen.
test('record schreibt den Zustand fort und mutiert ihn nicht', () => {
  const s0 = N.notifyNew();
  const s1 = N.record(s0, 'prCongrats', T0);
  assert.strictEqual(s0.dayCount, 0);
  assert.strictEqual(s0.weekCount, 0);
  assert.strictEqual(s0.sentTs.prCongrats, undefined);
  assert.strictEqual(s1.dayCount, 1);
  assert.strictEqual(s1.sentTs.prCongrats, T0);
  assert.notStrictEqual(s1.sentTs, s0.sentTs);
});

// ── planAll ──────────────────────────────────────────────────────────────

test('auf still bleibt von allen Kandidaten nur der Bericht uebrig', () => {
  const plan = N.planAll(ctx({ level: 'still' }));
  assert.strictEqual(plan.length, 1);
  assert.strictEqual(plan[0].kind, 'report');
});

test('auf normal kommt je Kalendertag hoechstens eine Meldung neben dem Bericht', () => {
  const plan = N.planAll(ctx({ level: 'normal' }));
  const perDay = {};
  plan.forEach((p) => {
    if (p.kind === 'report') return;
    const d = N.dayKey(p.at);
    perDay[d] = (perDay[d] || 0) + 1;
  });
  Object.keys(perDay).forEach((d) => {
    assert.strictEqual(perDay[d], 1, d + ' hat ' + perDay[d] + ' Meldungen');
  });
  assert.ok(Object.keys(perDay).length > 0, 'gar nichts geplant');
});

test('der Plan ist nach Zeit sortiert', () => {
  const plan = N.planAll(ctx());
  assert.ok(plan.length >= 3, 'zu wenig Eintraege fuer eine Aussage: ' + plan.length);
  for (let i = 1; i < plan.length; i++) {
    assert.ok(plan[i].at >= plan[i - 1].at,
      'Reihenfolge kippt bei ' + i + ': ' + plan[i - 1].at + ' vor ' + plan[i].at);
  }
});

test('kein Termin liegt in der Vergangenheit', () => {
  const plan = N.planAll(ctx({
    reportAt:    T0 - 3 * DAY,
    nextWorkout: { at: T0 - 2 * HOUR, ex: 'Bankdruecken', kg: 60, sets: 3, reps: 10 }
  }));
  assert.ok(plan.length > 0, 'gar nichts geplant');
  plan.forEach((p) => {
    assert.ok(p.at > ctx().now, p.kind + ' liegt bei ' + new Date(p.at).toISOString());
  });
});

test('derselbe Kontext ergibt zweimal denselben Plan mit eindeutigen ids', () => {
  const c = ctx();
  const a = N.planAll(c).map((p) => p.id);
  const b = N.planAll(c).map((p) => p.id);
  assert.deepStrictEqual(a, b);
  assert.strictEqual(new Set(a).size, a.length, 'doppelte id: ' + a.join(', '));
  a.forEach((id) => {
    assert.ok(/^[a-zA-Z]+:\d{4}-\d{2}-\d{2}$/.test(id), 'id traegt Fremdtext: ' + id);
  });
});

// ── Die Raender ──────────────────────────────────────────────────────────

test('nachts meldet sich niemand', () => {
  // 21:00 UTC: der Deload-Anstoss laege bei 23:00, der Rueckblick bei 01:00.
  const nightNow = Date.UTC(2026, 6, 29, 21, 0, 0);
  const plan = N.planAll(ctx({ now: nightNow, reportAt: nightNow + 5 * HOUR, tzOffsetMin: 0 }));
  assert.ok(plan.length >= 2, 'zu wenig Eintraege: ' + plan.length);
  plan.forEach((p) => {
    const h = localHour(p.at, 0);
    assert.ok(h >= 7 && h < 22, p.kind + ' meldet sich um ' + h + ' Uhr');
  });
});

test('das Nachtfenster richtet sich nach der Zeitzone des Nutzers', () => {
  // Nutzer auf UTC+9: 16:00 UTC ist dort schon 01:00 in der Nacht.
  const tz = 9 * 60;
  const nightNow = Date.UTC(2026, 6, 29, 14, 0, 0);
  const plan = N.planAll(ctx({ now: nightNow, reportAt: nightNow + 5 * HOUR, tzOffsetMin: tz }));
  assert.ok(plan.length >= 2, 'zu wenig Eintraege: ' + plan.length);
  plan.forEach((p) => {
    const h = localHour(p.at, tz);
    assert.ok(h >= 7 && h < 22, p.kind + ' meldet sich um ' + h + ' Uhr Ortszeit');
  });
});

test('wer gerade trainiert, bekommt keine Trainingserinnerung und keinen Deload', () => {
  const kinds = N.planAll(ctx({ workoutActive: true })).map((p) => p.kind);
  assert.ok(kinds.indexOf('reminderPlan') < 0, 'Erinnerung mitten im Training');
  assert.ok(kinds.indexOf('deload') < 0, 'Deload mitten im Training');
  assert.ok(kinds.indexOf('prCongrats') >= 0, 'der Bestwert soll trotzdem kommen');
});

test('ohne verlaessliche Uhrzeit wird nichts geplant', () => {
  assert.deepStrictEqual(N.planAll(ctx({ now: null })), []);
  assert.deepStrictEqual(N.planAll(ctx({ now: NaN })), []);
  assert.deepStrictEqual(N.planAll(undefined), []);
});

// Gestaltungsregel 8: eine Meldung ohne Zahl wird gestrichen. Der Katalog
// entfernt einen Platzhalter ohne Wert samt Leerzeichen — die EINHEIT daneben
// bleibt stehen. Aus '{vol} kg in dieser Woche' wird sonst 'kg in dieser
// Woche'. Deshalb faellt der Kandidat schon in der Planung aus.
test('eine Meldung ohne ihre Zahl wird gar nicht erst geplant', () => {
  const noVol = N.planAll(bare(Object.assign({}, SOLO.report, { reportVol: null })));
  assert.deepStrictEqual(noVol, [], 'Bericht ohne Volumen geplant');

  const noKg = N.planAll(bare({
    nextWorkout: { at: T0 + 26 * HOUR, ex: 'Bankdruecken', kg: null, sets: 3, reps: 10 }
  }));
  assert.deepStrictEqual(noKg, [], 'Erinnerung ohne Gewicht geplant');

  const noEx = N.planAll(bare({ anniversary: { ex: '', kg: 90 } }));
  assert.deepStrictEqual(noEx, [], 'Rueckblick ohne Uebung geplant');

  const noPrKg = N.planAll(bare({ pr: { ex: 'Kreuzheben', kg: 0 } }));
  assert.deepStrictEqual(noPrKg, [], 'Bestwert ohne Gewicht geplant');
});

test('der Anstoss nach der Pause nennt die tatsaechlichen Tage', () => {
  const past = N.planAll(bare({ lastWorkoutTs: T0 - 2 * DAY }));
  assert.strictEqual(past.length, 1);
  assert.strictEqual(past[0].vars.days, 5);

  // Letzte Einheit liegt 30 Tage zurueck: der Termin liegt laengst hinter uns
  // und rutscht auf now + 5 Tage. Dann sind es 35 Tage, nicht 5.
  const long = N.planAll(bare({ lastWorkoutTs: T0 - 30 * DAY }));
  assert.strictEqual(long.length, 1);
  assert.ok(long[0].at > T0, 'Termin liegt in der Vergangenheit');
  assert.strictEqual(long[0].vars.days, 35);
});

// ── Vollstaendigkeit: jede Rueckgabe muss einen ganzen Satz ergeben ───────

// Alle Platzhalternamen des Satzkatalogs. Wird als Koeder benutzt: was das
// Modul NICHT selbst mitliefert, bekommt einen auffaelligen Wert. Taucht der
// im gerenderten Satz auf, verlangt die Vorlage einen Wert, den das Modul nie
// schickt — und im Betrieb stuende dort dann die nackte Einheit ('zuletzt kg
// bei 8 Wiederholungen'). Genau dieser Befund hat in Block 3 alle Tests
// ueberlebt, weil fill() den Platzhalter samt Leerzeichen still entfernt und
// eine Suche nach '{kg}' deshalb nie anschlaegt.
const ALL_VARS = ['count', 'days', 'ex', 'kg', 'mins', 'pct', 'reps', 'secs', 'sets', 'vol', 'weeks'];
const BAIT = 'KOEDER';

function withBait(vars) {
  const out = {};
  ALL_VARS.forEach((k) => { out[k] = BAIT; });
  return Object.assign(out, vars);
}

test('jede geplante Meldung ergibt in vier Toenen und zwei Sprachen einen ganzen Satz', () => {
  const seen = {};
  Object.keys(SOLO).forEach((kind) => {
    const plan = N.planAll(bare(SOLO[kind]));
    assert.strictEqual(plan.length, 1, kind + ' ergab ' + plan.length + ' Eintraege');
    const p = plan[0];
    assert.strictEqual(p.kind, kind);
    seen[kind] = true;
    TONES.forEach((tone) => {
      LANGS.forEach((lang) => {
        const at = kind + '/' + p.key + '/' + tone + '/' + lang;
        const txt = P.say(p.key, p.vars, { tone: tone }, lang);
        assert.ok(txt && txt.length > 0, at + ' ergibt keinen Satz');
        assert.ok(!/\{[a-z]+\}/i.test(txt), at + ' laesst einen Platzhalter stehen: ' + txt);
        const baited = P.say(p.key, withBait(p.vars), { tone: tone }, lang);
        assert.ok(baited.indexOf(BAIT) < 0,
          at + ' braucht einen Wert, den das Modul nicht liefert: ' + baited);
      });
    });
    // Die Gegenrichtung: kein mitgeschickter Wert ist tot. Ein Platzhalter, den
    // keine der acht Vorlagen kennt, macht die Meldung nicht reicher — er
    // verschaerft nur den Riegel aus Gestaltungsregel 8 und streicht Meldungen,
    // die haetten kommen duerfen.
    Object.keys(p.vars).forEach((v) => {
      const less = Object.assign({}, p.vars);
      delete less[v];
      const changed = TONES.some((tone) => LANGS.some((lang) =>
        P.say(p.key, less, { tone: tone }, lang) !== P.say(p.key, p.vars, { tone: tone }, lang)));
      assert.ok(changed, kind + ' schickt ' + v + ' mit, keine Vorlage nutzt es');
    });
  });
  assert.deepStrictEqual(Object.keys(seen).sort(), Object.keys(SOLO).sort(),
    'nicht jede Art wurde geprueft');
});

test('kein Rueckgabewert traegt ein Emoji', () => {
  const plan = N.planAll(ctx());
  assert.ok(plan.length > 0);
  const blob = JSON.stringify(plan);
  assert.ok(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/u.test(blob),
    'Emoji im Plan: ' + blob);
});

// ── Konstanten sind Anforderung, nicht Zufall ────────────────────────────

test('die Zahlen des Deckels stehen wie zugesagt', () => {
  assert.deepStrictEqual(N.CAPS, {
    still:  { day: 0, week: 0 },
    normal: { day: 1, week: 4 },
    eng:    { day: 2, week: 8 }
  });
  assert.deepStrictEqual(N.COOLDOWN, {
    prCongrats:   0,
    deload:       7 * DAY,
    returnNudge:  5 * DAY,
    anniversary:  365 * DAY,
    reminderPlan: 0,
    report:       6 * DAY
  });
  assert.deepStrictEqual(N.UNCAPPED, ['report']);
  assert.deepStrictEqual(N.notifyNew(), {
    sentTs: {}, dayCount: 0, dayKey: '', weekCount: 0, weekKey: ''
  });
});
