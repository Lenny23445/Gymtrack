/* GymTrack — Waechter fuer die Trainingsplan-Vorlagen (PLAN_TEMPLATES).

   Anlass (02.08.2026): Die Bibliothek waechst von 5 auf 16 Vorlagen und das
   Onboarding waehlt daraus nach Ziel/Erfahrung/Frequenz aus. Zwei Fallen sind
   dabei still und toedlich:

   1. Ein libNames-Eintrag, den es in EX_LIBRARY nicht gibt, wird in
      _applyTemplateCore kommentarlos uebersprungen (`if (libItem)`). Der Plan
      kommt dann mit vier statt fuenf Uebungen durch — ohne Fehler, ohne Hinweis.
      Ein Tippfehler oder eine spaeter umbenannte Uebung faellt niemandem auf.
   2. Ein Antwort-Trio, zu dem das Scoring nichts findet, laesst Schritt 5 des
      Onboardings leer. Der Nutzer sieht eine Ueberschrift und nichts darunter.

   Beides prueft diese Datei gegen den echten Quelltext, nicht gegen eine Kopie. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..');
const STREAK = fs.readFileSync(path.join(WURZEL, 'js', 'app-streak.js'), 'utf8');
const EXDB   = fs.readFileSync(path.join(WURZEL, 'js', 'app-exdb.js'), 'utf8');

/* Die Konstanten stehen in klassischen Skripten (kein module.exports), deshalb
   wird der Literal-Block aus der Quelle geschnitten und ausgewertet. Ende ist
   jeweils die erste Zeile, die nur aus dem schliessenden Zeichen besteht. */
function literal(quelle, name, klammer) {
  const zu = klammer === '[' ? '\\]' : '\\}';
  const rx = new RegExp('const ' + name + ' = (\\' + klammer + '[\\s\\S]*?\\n' + zu + ');');
  const m = quelle.match(rx);
  if (!m) throw new Error(name + ' nicht gefunden — Literal umgebaut?');
  return eval('(' + m[1] + ')');
}

const EX_LIBRARY     = literal(EXDB,   'EX_LIBRARY',      '[');
const PLAN_TEMPLATES = literal(STREAK, 'PLAN_TEMPLATES',  '[');
const TPL_LABELS     = literal(STREAK, '_TPL_DAY_LABELS', '{');

/* Das Scoring wird aus der Quelle uebernommen statt nachgebaut: eine Kopie im
   Test wuerde gruen bleiben, waehrend die App laengst anders rechnet. */
const SCORE_SRC = STREAK.match(/function _obScoreTpl\([\s\S]*?\n\}/);
assert.ok(SCORE_SRC, '_obScoreTpl nicht gefunden');
const _obScoreTpl = eval('(' + SCORE_SRC[0] + ')');

const NAMEN = new Set(EX_LIBRARY.map(e => e.n));
const ZIELE = ['muskel', 'kraft', 'abnehmen', 'fit'];
const ERFAHRUNG = ['neu', 'mittel', 'profi'];
const FREQUENZEN = [2, 3, 4, 5, 6];
const TAGE = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function uebungen(tpl) {
  const raus = [];
  Object.entries(tpl.days).forEach(([tag, def]) => {
    if (def.type !== 'exercises' || !Array.isArray(def.libNames)) return;
    def.libNames.forEach(e => raus.push({
      tag,
      name: (e && typeof e === 'object') ? e.n : e,
      ov:   (e && typeof e === 'object') ? e : null
    }));
  });
  return raus;
}

test('jede Vorlagen-Uebung steht exakt so in EX_LIBRARY', () => {
  const fehlend = [];
  PLAN_TEMPLATES.forEach(t => uebungen(t).forEach(u => {
    if (!NAMEN.has(u.name)) fehlend.push(t.id + '/' + u.tag + ': ' + u.name);
  }));
  assert.deepStrictEqual(fehlend, [], 'Uebungen ohne Treffer in der Bibliothek:\n' + fehlend.join('\n'));
});

test('Vorlagen-IDs sind eindeutig und die alten fuenf gibt es weiter', () => {
  const ids = PLAN_TEMPLATES.map(t => t.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'doppelte Vorlagen-ID');
  // Gespeicherte Plaene zeigen ueber diese IDs auf Vorlagen — eine geloeschte
  // ID bricht bestehende Nutzerdaten.
  ['ppl6', 'ppl3', 'upperlower', 'fullbody3', 'arnold'].forEach(id =>
    assert.ok(ids.includes(id), 'Bestands-Vorlage ' + id + ' fehlt'));
});

test('jede Vorlage hat gueltige fit-Angaben', () => {
  PLAN_TEMPLATES.forEach(t => {
    assert.ok(t.fit, t.id + ': fit fehlt');
    assert.ok(t.fit.goals.length && t.fit.goals.every(g => ZIELE.includes(g)), t.id + ': unbekanntes Ziel');
    assert.ok(t.fit.exps.length  && t.fit.exps.every(e => ERFAHRUNG.includes(e)), t.id + ': unbekannte Erfahrung');
    assert.ok(t.fit.freq.length  && t.fit.freq.every(f => FREQUENZEN.includes(f)), t.id + ': unbekannte Frequenz');
  });
});

test('fit.freq deckt sich mit den tatsaechlichen Trainingstagen', () => {
  PLAN_TEMPLATES.forEach(t => {
    const tage = Object.values(t.days).filter(d => d.type !== 'none').length;
    assert.ok(t.fit.freq.includes(tage),
      t.id + ': ' + tage + ' Trainingstage, fit.freq sagt ' + t.fit.freq.join('/'));
  });
});

test('die Bibliothek ist nach Trainingstagen aufsteigend sortiert', () => {
  // Der Vorlagen-Picker im Plan-Tab rendert PLAN_TEMPLATES unveraendert.
  const f = PLAN_TEMPLATES.map(t => Math.min(...t.fit.freq));
  assert.deepStrictEqual(f, [...f].sort((a, b) => a - b));
});

test('jeder Trainingstag hat ein Split-Label', () => {
  const fehlend = [];
  PLAN_TEMPLATES.forEach(t => {
    const lbl = TPL_LABELS[t.id] || {};
    Object.entries(t.days).forEach(([tag, def]) => {
      if (def.type === 'exercises' && !lbl[tag]) fehlend.push(t.id + '/' + tag);
    });
  });
  assert.deepStrictEqual(fehlend, [], 'Tage ohne Label (fallen auf Muskelgruppen-Namen zurueck): ' + fehlend.join(', '));
});

test('_TPL_DAY_LABELS beschriftet keine Ruhetage', () => {
  Object.entries(TPL_LABELS).forEach(([id, lbl]) => {
    const tpl = PLAN_TEMPLATES.find(t => t.id === id);
    assert.ok(tpl, '_TPL_DAY_LABELS kennt Vorlage ' + id + ', die es nicht gibt');
    Object.keys(lbl).forEach(tag => {
      assert.ok(TAGE.includes(tag), id + ': unbekannter Wochentag ' + tag);
      assert.strictEqual(tpl.days[tag].type, 'exercises', id + '/' + tag + ': Label auf einem Tag ohne Uebungen');
    });
  });
});

test('jede Antwortkombination bekommt mindestens drei Vorschlaege', () => {
  const duenn = [];
  ZIELE.forEach(g => ERFAHRUNG.forEach(e => FREQUENZEN.forEach(f => {
    const treffer = PLAN_TEMPLATES.filter(t => _obScoreTpl(t, g, e, f) >= 0);
    if (treffer.length < 3) duenn.push([g, e, f, treffer.length].join('/'));
  })));
  assert.deepStrictEqual(duenn, [], 'Kombinationen mit unter drei Vorschlaegen: ' + duenn.join(', '));
});

test('die Empfehlung trifft immer die gewaehlte Frequenz genau', () => {
  ZIELE.forEach(g => ERFAHRUNG.forEach(e => FREQUENZEN.forEach(f => {
    const best = PLAN_TEMPLATES
      .map((t, i) => ({ t, i, sc: _obScoreTpl(t, g, e, f) }))
      .filter(x => x.sc >= 0)
      .sort((a, b) => (b.sc - a.sc) || (a.i - b.i))[0];
    assert.ok(best, 'keine Empfehlung fuer ' + [g, e, f].join('/'));
    assert.ok(best.t.fit.freq.includes(f),
      [g, e, f].join('/') + ' empfiehlt ' + best.t.id + ' mit ' + best.t.fit.freq.join('/') + ' Tagen');
  })));
});

test('Schemata sind plausibel', () => {
  PLAN_TEMPLATES.forEach(t => {
    const alle = [t.scheme, ...Object.values(t.days).map(d => d.scheme)].filter(Boolean);
    uebungen(t).forEach(u => { if (u.ov) alle.push(u.ov); });
    alle.forEach(sch => {
      if (sch.s != null) assert.ok(sch.s >= 2 && sch.s <= 6, t.id + ': ' + sch.s + ' Saetze');
      if (sch.r != null) assert.ok(sch.r >= 3 && sch.r <= 20, t.id + ': ' + sch.r + ' Wiederholungen');
      if (sch.band != null) assert.ok(sch.band >= 1 && sch.band <= 4, t.id + ': band ' + sch.band);
    });
  });
});

test('Zeit-Uebungen bekommen kein Wiederholungsschema aufgedrueckt', () => {
  // _tplTargets laesst Zeit-Uebungen bewusst beim DB-Wert; ein Einzel-Override
  // haette Vorrang und wuerde deren Sekunden umdeuten (5x5 → 5-Sekunden-Plank).
  PLAN_TEMPLATES.forEach(t => uebungen(t).forEach(u => {
    const li = EX_LIBRARY.find(x => x.n === u.name);
    if (li && li.t === 'time' && u.ov) assert.fail(t.id + '/' + u.tag + ': Schema-Override auf Zeit-Uebung ' + u.name);
  }));
});

test('kein Tag wiederholt dieselbe Uebung', () => {
  PLAN_TEMPLATES.forEach(t => {
    Object.entries(t.days).forEach(([tag, def]) => {
      if (def.type !== 'exercises') return;
      const namen = def.libNames.map(e => (e && typeof e === 'object') ? e.n : e);
      assert.strictEqual(new Set(namen).size, namen.length, t.id + '/' + tag + ': doppelte Uebung');
    });
  });
});
