# Onboarding-Redesign — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Neues 10-Schritte-Onboarding im App-Design, das aus den Antworten einen fertigen, personalisierten Wochenplan baut (Muskel-Fokus, Dauer, Equipment), nativ sauber nach Push fragt und vollständig DE/EN ist.

**Architecture:** Die Plan-Logik wandert in ein eigenes reines Modul `js/ob-plan.js` (Antworten rein, `PLAN_TEMPLATES`-kompatibles Tagesformat raus, in `node --test` prüfbar — Vorbild `js/coach-charts.js`). Alles Sichtbare (Screens, Texte, CSS, Push-Integration) wird in `index.html` verdrahtet und ersetzt das bestehende Onboarding (`_obStepHTML`/`renderOb`) in place. Reihenfolge Login → Onboarding → Soft-Paywall bleibt unangetastet.

**Tech Stack:** Vanilla JS (IIFE-Module wie `js/coach-*.js`), `node --test` + `assert`, bestehende i18n (`tr()`/`I18N_EN`), Capacitor `PushNotifications`, CSS-Tokens der App.

**Spec:** `docs/superpowers/specs/2026-07-31-onboarding-redesign-design.md` — gilt als Anforderungsquelle für jeden Task.

## Global Constraints

- **Keine Emojis** in neuem UI; nur SVG-Stroke-Icons im `_OB_SVG`-Stil (stroke-width 1.9–2.4, `viewBox="0 0 24 24"`, `fill="none"`).
- **Keine Hex-Farben** im neuen index.html-Code: nur `var(--bg)`, `var(--card)`, `var(--acc)`, `rgba(var(--acc-rgb),…)`, `var(--soft)`, `var(--text)`, `var(--text2)`, `var(--gl-bdr)`.
- **Jeder sichtbare String** läuft durch `obT()` (Task 5) — deutsch als Quelle, englischer Eintrag in `I18N_EN`.
- `js/ob-plan.js` liest **keine** Farben, keine Sprache aus dem DOM, keine Systemuhr, kein `S` — alles kommt als Parameter (Vorbild-Kommentarkopf in `js/coach-charts.js`).
- Zeilennummern in `index.html` verschieben sich (autosync zweier Rechner) — **immer über Suchanker** arbeiten (`const PLAN_TEMPLATES`, `function renderOb`, …), nie über Zeilennummern.
- **Vorbedingung jeder Session:** `git pull --ff-only` und `git status` sauber; `index.html` hatte heute uncommittete Fremd-Änderungen (autosync vom anderen Rechner) — erst klären/committen lassen, nie blind überschreiben.
- Commits klein, pfadgebunden, mit `git push` (Auto-Push für gymtrack erwünscht).

## Dateistruktur

- **Neu** `js/ob-plan.js` — reine Plan-Generierung: `OB_SPLITS`, `OB_HOME_SWAP`, `OB_BODY_SWAP`, `OB_PRIO_POOL`, `buildObPlan()`.
- **Neu** `test/ob-plan.test.js` — Tests fürs Modul.
- **Neu** `test/ob-i18n.test.js` — jeder neue DE-String hat einen `I18N_EN`-Eintrag (Muster: `test/coach-i18n.test.js`).
- **Ändern** `index.html` — Onboarding-Abschnitt (Anker `// ONBOARDING — ERSTEINRICHTUNG`), CSS-Block (Anker `#ob-screen{`), `I18N_EN`-Tabelle, `_TPL_DAY_LABELS`, Script-Tag neben `./js/coach-charts.js`.
- **Ändern** `build.js` (files-Liste) und `sw.js` (SHELL-Liste + CACHE-Version).

---

### Task 1: `js/ob-plan.js` — Splits + Split-Wahl

**Files:**
- Create: `js/ob-plan.js`
- Test: `test/ob-plan.test.js`

**Interfaces:**
- Produces: `ObPlan.OB_SPLITS` (Objekt `id → {id, days}`), `ObPlan.pickSplit(freq, exp)` → Split-Id-String. `days` exakt im `PLAN_TEMPLATES`-Format: `{mon:{type:'exercises', libNames:[…]}, tue:{type:'none'}, …}` mit allen 7 Tagen `mon…sun`.
- Modulform: IIFE `(function(root){ … root.ObPlan = API; if (typeof module!=='undefined') module.exports = API; })(typeof globalThis!=='undefined' ? globalThis : this)` — Kopf-Kommentar und Exportzweig nach dem Muster von `js/coach-charts.js`.

- [ ] **Schritt 1: Failing Test schreiben** — `test/ob-plan.test.js` beginnen:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const ObPlan = require('../js/ob-plan.js');

const EXPS = ['neu', 'mittel', 'profi'];

test('pickSplit: Matrix aus der Spec', () => {
  for (const e of EXPS) assert.equal(ObPlan.pickSplit(2, e), 'fullbody2');
  assert.equal(ObPlan.pickSplit(3, 'neu'), 'fullbody3');
  assert.equal(ObPlan.pickSplit(3, 'mittel'), 'ppl3');
  assert.equal(ObPlan.pickSplit(3, 'profi'), 'ppl3');
  for (const e of EXPS) assert.equal(ObPlan.pickSplit(4, e), 'upperlower');
  for (const e of EXPS) assert.equal(ObPlan.pickSplit(5, e), 'ppl5');
  assert.equal(ObPlan.pickSplit(6, 'neu'), 'ppl6');
  assert.equal(ObPlan.pickSplit(6, 'mittel'), 'ppl6');
  assert.equal(ObPlan.pickSplit(6, 'profi'), 'arnold');
});

test('OB_SPLITS: jeder Split hat 7 Tage und Trainingstage == Frequenz', () => {
  const freqOf = { fullbody2:2, fullbody3:3, ppl3:3, upperlower:4, ppl5:5, ppl6:6, arnold:6 };
  for (const [id, f] of Object.entries(freqOf)) {
    const s = ObPlan.OB_SPLITS[id];
    assert.ok(s, id + ' fehlt');
    assert.deepEqual(Object.keys(s.days).sort(),
      ['fri','mon','sat','sun','thu','tue','wed']);
    const on = Object.values(s.days).filter(d => d.type === 'exercises');
    assert.equal(on.length, f, id);
    on.forEach(d => assert.ok(d.libNames.length >= 5, id + ': zu wenig Übungen'));
  }
});
```

- [ ] **Schritt 2:** `node --test test/ob-plan.test.js` — muss **rot** sein (`Cannot find module '../js/ob-plan.js'`).
- [ ] **Schritt 3:** `js/ob-plan.js` anlegen. `OB_SPLITS` enthält 7 Splits:
  - `fullbody3`, `ppl3`, `upperlower`, `ppl6`, `arnold`: `days` **wörtlich kopieren** aus `PLAN_TEMPLATES` in `index.html` (Suchanker `const PLAN_TEMPLATES`) — bewusste Duplikation wie bei coach-charts, im Kopf-Kommentar dokumentieren.
  - Zwei neue Splits:

```js
fullbody2: { id:'fullbody2', days:{
  mon:{type:'exercises', libNames:['Kniebeugen','Bankdrücken','Rudern (Langhantel)','Schulterdrücken','Plank']},
  tue:{type:'none'}, wed:{type:'none'},
  thu:{type:'exercises', libNames:['Kreuzheben','Klimmzüge','Schrägbankdrücken','Beinpresse','Crunches']},
  fri:{type:'none'}, sat:{type:'none'}, sun:{type:'none'}
}},
ppl5: { id:'ppl5', days:{
  mon:{type:'exercises', libNames:['Bankdrücken','Schrägbankdrücken','Schulterdrücken','Seitheben','Trizepsdrücken (Kabel)']},
  tue:{type:'exercises', libNames:['Klimmzüge','Rudern (Langhantel)','Latzug','Face Pulls','Bizeps-Curls (LH)']},
  wed:{type:'exercises', libNames:['Kniebeugen','Rumänisches Kreuzheben','Beinpresse','Beinbeuger','Wadenheben']},
  thu:{type:'exercises', libNames:['Kurzhantel-Bankdrücken','Kurzhantel-Rudern','KH-Schulterdrücken','Latzug','Trizepsdrücken (Kabel)']},
  fri:{type:'exercises', libNames:['Kreuzheben','Front-Kniebeuge','Ausfallschritte','Beinstrecker','Hip Thrust']},
  sat:{type:'none'}, sun:{type:'none'}
}}
```

  - `pickSplit(freq, exp)`:

```js
function pickSplit(freq, exp) {
  const f = Math.max(2, Math.min(6, +freq || 3));
  if (f === 2) return 'fullbody2';
  if (f === 3) return exp === 'neu' ? 'fullbody3' : 'ppl3';
  if (f === 4) return 'upperlower';
  if (f === 5) return 'ppl5';
  return exp === 'profi' ? 'arnold' : 'ppl6';
}
```

- [ ] **Schritt 4:** `node --test test/ob-plan.test.js` — grün.
- [ ] **Schritt 5:** Commit + Push: `feat(onboarding): ob-plan.js — Split-Definitionen und Split-Wahl als reines Modul`

---

### Task 2: `js/ob-plan.js` — Equipment-Anpassung

**Files:**
- Modify: `js/ob-plan.js`
- Test: `test/ob-plan.test.js` (erweitern)

**Interfaces:**
- Produces: `ObPlan.applyEquipment(days, equip)` → neues `days`-Objekt (Input unverändert lassen). `equip ∈ 'gym'|'home'|'body'`. Exportiert zusätzlich `OB_HOME_SWAP`, `OB_BODY_SWAP`, `OB_BODY_FILL` für Tests und Task 3.

- [ ] **Schritt 1: Failing Tests ergänzen:**

```js
test('applyEquipment: gym ändert nichts', () => {
  const days = ObPlan.OB_SPLITS.upperlower.days;
  assert.deepEqual(ObPlan.applyEquipment(days, 'gym'), days);
});

test('applyEquipment: home ersetzt Gym-Geräte und dedupliziert', () => {
  const out = ObPlan.applyEquipment(ObPlan.OB_SPLITS.upperlower.days, 'home');
  const all = Object.values(out).filter(d => d.type === 'exercises').flatMap(d => d.libNames);
  const verboten = ['Bankdrücken','Latzug','Beinpresse','Beinstrecker','Beinbeuger',
    'Trizepsdrücken (Kabel)','T-Bar Rudern','Rudern (Langhantel)','Kniebeugen','Kreuzheben','Schulterdrücken'];
  verboten.forEach(v => assert.ok(!all.includes(v), v + ' darf nicht vorkommen'));
  Object.values(out).filter(d => d.type === 'exercises').forEach(d =>
    assert.equal(new Set(d.libNames).size, d.libNames.length, 'Duplikat nach Swap'));
});

test('applyEquipment: body nur Körpergewicht, Tage nicht leer', () => {
  const out = ObPlan.applyEquipment(ObPlan.OB_SPLITS.ppl6.days, 'body');
  const erlaubt = new Set(['Liegestütze','Dips','Klimmzüge','Ausfallschritte','Bulgarian Split Squats',
    'Hip Thrust','Wadenheben','Plank','Seitlicher Plank','Crunches','Beinheben','Hängendes Beinheben',
    'Russian Twists','Mountain Climbers','Hollow Hold','Käfer','Seilspringen']);
  Object.values(out).filter(d => d.type === 'exercises').forEach(d => {
    assert.ok(d.libNames.length >= 3, 'Tag zu leer: ' + d.libNames.join(','));
    d.libNames.forEach(n => assert.ok(erlaubt.has(n), n + ' ist nicht Körpergewicht'));
  });
});
```

- [ ] **Schritt 2:** `node --test` — rot (`applyEquipment is not a function`).
- [ ] **Schritt 3:** Implementieren:

```js
const OB_HOME_SWAP = {
  'Bankdrücken':'Kurzhantel-Bankdrücken', 'Schrägbankdrücken':'Kurzhantel-Bankdrücken',
  'Butterfly (Maschine)':'Fliegende', 'Kabelzug Brust':'Fliegende',
  'Latzug':'Klimmzüge', 'Rudern (Langhantel)':'Kurzhantel-Rudern', 'T-Bar Rudern':'Kurzhantel-Rudern',
  'Face Pulls':'Reverse Flys', 'Kreuzheben':'Rumänisches Kreuzheben',
  'Kniebeugen':'Goblet Squat', 'Front-Kniebeuge':'Goblet Squat', 'Beinpresse':'Goblet Squat',
  'Beinstrecker':'Ausfallschritte', 'Beinbeuger':'Rumänisches Kreuzheben',
  'Schulterdrücken':'KH-Schulterdrücken', 'Aufrechtes Rudern':'Seitheben',
  'Trizepsdrücken (Kabel)':'French Press', 'Engers Bankdrücken':'French Press',
  'Preacher Curls':'Konzentrations-Curls', 'Cable Crunches':'Crunches',
  'Hängendes Beinheben':'Beinheben', 'Laufband':'Seilspringen', 'Rudern (Cardio)':'Seilspringen'
};
const OB_BODY_SWAP = {
  'Bankdrücken':'Liegestütze','Schrägbankdrücken':'Liegestütze','Kurzhantel-Bankdrücken':'Liegestütze',
  'Fliegende':'Liegestütze','Butterfly (Maschine)':'Liegestütze','Kabelzug Brust':'Liegestütze',
  'Latzug':'Klimmzüge','Rudern (Langhantel)':'Klimmzüge','Kurzhantel-Rudern':'Klimmzüge',
  'T-Bar Rudern':'Klimmzüge','Pullover':'Klimmzüge','Face Pulls':'Klimmzüge','Shrugs':'Klimmzüge',
  'Kreuzheben':'Hip Thrust','Rumänisches Kreuzheben':'Hip Thrust','Hyperextensions':'Hip Thrust',
  'Kniebeugen':'Ausfallschritte','Front-Kniebeuge':'Bulgarian Split Squats','Goblet Squat':'Ausfallschritte',
  'Beinpresse':'Ausfallschritte','Beinstrecker':'Ausfallschritte','Beinbeuger':'Hip Thrust',
  'Schulterdrücken':'Liegestütze','KH-Schulterdrücken':'Liegestütze','Arnold Press':'Liegestütze',
  'Seitheben':'Plank','Frontheben':'Plank','Reverse Flys':'Plank','Aufrechtes Rudern':'Plank',
  'Bizeps-Curls (KH)':'Klimmzüge','Bizeps-Curls (LH)':'Klimmzüge','Hammer-Curls':'Klimmzüge',
  'Konzentrations-Curls':'Klimmzüge','Preacher Curls':'Klimmzüge','Unterarm-Curls':'Klimmzüge',
  'Trizepsdrücken (Kabel)':'Dips','French Press':'Dips','Engers Bankdrücken':'Dips','Trizeps-Dips':'Dips',
  'Cable Crunches':'Crunches','Laufband':'Seilspringen','Rudern (Cardio)':'Seilspringen','Rad fahren':'Seilspringen'
};
const OB_BODY_FILL = ['Plank','Crunches','Beinheben','Mountain Climbers','Russian Twists',
  'Hollow Hold','Seitlicher Plank','Bulgarian Split Squats','Käfer','Seilspringen'];

function applyEquipment(days, equip) {
  if (equip !== 'home' && equip !== 'body') return days;
  const swap = equip === 'home' ? OB_HOME_SWAP : OB_BODY_SWAP;
  const out = {};
  for (const [k, d] of Object.entries(days)) {
    if (d.type !== 'exercises') { out[k] = d; continue; }
    const seen = new Set(), names = [];
    d.libNames.forEach(n => {
      const m = swap[n] || n;
      if (!seen.has(m)) { seen.add(m); names.push(m); }
    });
    if (equip === 'body') {           // geschrumpfte Tage ehrlich auffüllen
      for (const f of OB_BODY_FILL) {
        if (names.length >= Math.min(d.libNames.length, 5)) break;
        if (!seen.has(f)) { seen.add(f); names.push(f); }
      }
    }
    out[k] = { type:'exercises', libNames:names };
  }
  return out;
}
```

- [ ] **Schritt 4:** `node --test` — grün.
- [ ] **Schritt 5:** Commit + Push: `feat(onboarding): ob-plan.js — Equipment-Anpassung (Home-/Bodyweight-Ersatz)`

---

### Task 3: `js/ob-plan.js` — Fokus, Dauer, Ziel, Orchestrator

**Files:**
- Modify: `js/ob-plan.js`
- Test: `test/ob-plan.test.js` (erweitern)

**Interfaces:**
- Produces (Kern-API für Task 8):

```js
// answers = { goal:'muskel'|'kraft'|'abnehmen'|'fit', exp:'neu'|'mittel'|'profi',
//             freq:2..6, prio:['brust','arme'] (0–2 aus brust/ruecken/schultern/arme/beine/core),
//             dur:'kurz'|'normal'|'lang', equip:'gym'|'home'|'body' }
// opts = { lang:'de'|'en' }
// → { id:'ob-'+splitId, splitId, title, subtitle,        // subtitle '' ohne Fokus
//     days,                                              // PLAN_TEMPLATES-Format
//     focus: { mon:['Fliegende'], … },                   // NUR die zusätzlich eingefügten Fokus-Übungen
//     meta: { freq, dur, equip } }
buildObPlan(answers, opts)
```

- Exportiert außerdem `OB_PRIO_POOL`, `OB_COMPOUNDS`, `applyFocus(days, prio, equip)` → `{days, focus}`, `applyDuration(days, dur, focus)`, `applyGoal(days, goal, equip, focus)`.
- `EX_MG`-Tabelle intern: Übungsname → Muskelgruppe (aus `EX_LIBRARY` in `index.html` kopieren, nur `n`→`mg`; Kommentar: Quelle `EX_LIBRARY`).

- [ ] **Schritt 1: Failing Tests ergänzen** (alle schreiben):

```js
test('applyFocus: +1 Übung pro Fokus-Gruppe an passenden Tagen, max +2/Tag', () => {
  const base = ObPlan.OB_SPLITS.upperlower.days;
  const { days, focus } = ObPlan.applyFocus(base, ['brust','arme'], 'gym');
  assert.ok(days.mon.libNames.length > base.mon.libNames.length);       // Upper-Tag wächst
  assert.deepEqual(days.tue.libNames, base.tue.libNames);               // Lower-Tag unverändert
  const extraMon = days.mon.libNames.length - base.mon.libNames.length;
  assert.ok(extraMon >= 1 && extraMon <= 2);
  assert.equal((focus.mon || []).length, extraMon);
});

test('applyFocus: leere Prio ändert nichts', () => {
  const base = ObPlan.OB_SPLITS.ppl3.days;
  const { days, focus } = ObPlan.applyFocus(base, [], 'gym');
  assert.deepEqual(days, base);
  assert.deepEqual(focus, {});
});

test('applyDuration: kurz=4, normal=5, lang=6–7; Fokus bleibt', () => {
  const base = ObPlan.OB_SPLITS.upperlower.days;
  const { days, focus } = ObPlan.applyFocus(base, ['brust'], 'gym');
  const kurz = ObPlan.applyDuration(days, 'kurz', focus);
  Object.entries(kurz).filter(([,d]) => d.type === 'exercises').forEach(([k, d]) => {
    assert.equal(d.libNames.length, 4, k);
    (focus[k] || []).forEach(f => assert.ok(d.libNames.includes(f), 'Fokus entfernt: ' + f));
  });
  const lang = ObPlan.applyDuration(days, 'lang', focus);
  Object.values(lang).filter(d => d.type === 'exercises').forEach(d =>
    assert.ok(d.libNames.length >= 6 && d.libNames.length <= 7));
});

test('applyGoal: kraft sortiert Verbund nach vorn, abnehmen bekommt Cardio-Slot', () => {
  const base = ObPlan.OB_SPLITS.ppl3.days;
  const kraft = ObPlan.applyGoal(base, 'kraft', 'gym', {});
  assert.ok(ObPlan.OB_COMPOUNDS.has(kraft.mon.libNames[0]));
  const ab = ObPlan.applyGoal(base, 'abnehmen', 'gym', {});
  const cardio = ['Laufband','Seilspringen','Plank','Mountain Climbers'];
  assert.ok(cardio.includes(ab.mon.libNames[ab.mon.libNames.length - 1]));
});

test('buildObPlan: Ende-zu-Ende, Format kompatibel zu _applyTemplateCore', () => {
  const p = ObPlan.buildObPlan(
    { goal:'muskel', exp:'mittel', freq:4, prio:['brust','arme'], dur:'normal', equip:'gym' },
    { lang:'de' });
  assert.equal(p.splitId, 'upperlower');
  assert.equal(p.id, 'ob-upperlower');
  assert.equal(p.title, 'Upper · Lower');
  assert.equal(p.subtitle, 'Fokus: Brust & Arme');
  assert.deepEqual(Object.keys(p.days).sort(), ['fri','mon','sat','sun','thu','tue','wed']);
  Object.values(p.days).filter(d => d.type === 'exercises').forEach(d =>
    assert.equal(d.libNames.length, 5));
  const en = ObPlan.buildObPlan(
    { goal:'muskel', exp:'mittel', freq:4, prio:['brust','arme'], dur:'normal', equip:'gym' },
    { lang:'en' });
  assert.equal(en.subtitle, 'Focus: Chest & Arms');
});

test('buildObPlan: alle 15 freq×exp-Kombinationen liefern gültige Pläne', () => {
  for (let f = 2; f <= 6; f++) for (const e of ['neu','mittel','profi']) {
    const p = ObPlan.buildObPlan({ goal:'fit', exp:e, freq:f, prio:[], dur:'normal', equip:'gym' }, { lang:'de' });
    const on = Object.values(p.days).filter(d => d.type === 'exercises');
    assert.equal(on.length, f, `freq ${f} exp ${e}`);
  }
});
```

- [ ] **Schritt 2:** `node --test` — rot.
- [ ] **Schritt 3:** Implementieren. Bausteine:

```js
const OB_PRIO_POOL = {
  brust:     ['Fliegende','Kabelzug Brust','Kurzhantel-Bankdrücken','Butterfly (Maschine)','Liegestütze'],
  ruecken:   ['Latzug','Pullover','Face Pulls','Kurzhantel-Rudern','Klimmzüge'],
  schultern: ['Seitheben','Reverse Flys','Frontheben','Arnold Press'],
  arme:      ['Hammer-Curls','Trizepsdrücken (Kabel)','Bizeps-Curls (KH)','French Press','Dips'],
  beine:     ['Beinstrecker','Beinbeuger','Bulgarian Split Squats','Wadenheben','Ausfallschritte'],
  core:      ['Plank','Crunches','Beinheben','Russian Twists','Hollow Hold']
};
const OB_COMPOUNDS = new Set(['Bankdrücken','Schrägbankdrücken','Kurzhantel-Bankdrücken','Kniebeugen',
  'Front-Kniebeuge','Goblet Squat','Kreuzheben','Rumänisches Kreuzheben','Schulterdrücken',
  'KH-Schulterdrücken','Arnold Press','Rudern (Langhantel)','T-Bar Rudern','Kurzhantel-Rudern',
  'Klimmzüge','Dips','Liegestütze','Beinpresse','Hip Thrust','Engers Bankdrücken']);
```

  - `applyFocus(days, prio, equip)`: pro Trainingstag prüfen, ob eine Fokus-Gruppe dort schon vertreten ist (`EX_MG`-Lookup über vorhandene `libNames`). Wenn ja: erste Pool-Übung der Gruppe nehmen, durch `OB_HOME_SWAP`/`OB_BODY_SWAP` schicken (equip), einfügen falls noch nicht im Tag; max. 2 Zusatzübungen pro Tag; eingefügte Namen je Tag in `focus[dayKey]` sammeln.
  - `applyDuration(days, dur, focus)`: Ziel `kurz→4, normal→5, lang→6` (mit Fokus-Extras max. 7). Kürzen von hinten, dabei überspringen: Namen in `focus[day]` und die erste Übung aus `OB_COMPOUNDS`. Auffüllen (lang): aus `OB_PRIO_POOL` der am Tag vertretenen Gruppen, Duplikate vermeiden.
  - `applyGoal(days, goal, equip, focus)`: `kraft` → stabile Sortierung: `OB_COMPOUNDS`-Treffer vor Rest (Reihenfolge innerhalb der Gruppen erhalten). `abnehmen`/`fit` → letzte Nicht-Fokus-Übung ersetzen durch `equip==='gym' ? 'Laufband' : equip==='home' ? 'Seilspringen' : 'Mountain Climbers'` (wenn schon vorhanden: 'Plank'; wenn auch da: nichts tun). `muskel` → unverändert.
  - `buildObPlan(answers, opts)`: `pickSplit` → `applyEquipment` → `applyFocus` → `applyGoal` → `applyDuration`; Titel-Tabelle:

```js
const OB_TITLES = { fullbody2:'Ganzkörper 2×', fullbody3:'Ganzkörper 3×', ppl3:'Push · Pull · Legs',
  upperlower:'Upper · Lower', ppl5:'PPL + Upper/Lower', ppl6:'Push · Pull · Legs', arnold:'Arnold Split' };
const OB_MG_LABEL = {
  de: { brust:'Brust', ruecken:'Rücken', schultern:'Schultern', arme:'Arme', beine:'Beine', core:'Bauch' },
  en: { brust:'Chest', ruecken:'Back', schultern:'Shoulders', arme:'Arms', beine:'Legs', core:'Core' } };
// subtitle: prio.length ? (lang==='en'?'Focus: ':'Fokus: ') + labels.join(' & ') : ''
```

- [ ] **Schritt 4:** `node --test test/ob-plan.test.js` — grün (alle Tasks 1–3-Tests).
- [ ] **Schritt 5:** Commit + Push: `feat(onboarding): ob-plan.js — Fokus, Dauer, Ziel und buildObPlan-Orchestrator`

---

### Task 4: Einbindung in App, Build und Service Worker

**Files:**
- Modify: `index.html` (Script-Tag, Anker `<script src="./js/coach-charts.js"></script>`; `_TPL_DAY_LABELS`, Suchanker `_TPL_DAY_LABELS`)
- Modify: `build.js` (files-Array), `sw.js` (SHELL-Array + `CACHE`-Konstante)

**Interfaces:**
- Consumes: `js/ob-plan.js` aus Task 1–3.
- Produces: `window.ObPlan` im Browser verfügbar; `_TPL_DAY_LABELS['ob-fullbody2']` … `['ob-arnold']` für Preset-Namen.

- [ ] **Schritt 1:** In `index.html` direkt nach dem coach-charts-Script-Tag einfügen:

```html
<!-- ob-plan baut den Onboarding-Trainingsplan als reine Funktion (Antworten rein,
     PLAN_TEMPLATES-kompatibles Tagesformat raus). Getestet in test/ob-plan.test.js. -->
<script src="./js/ob-plan.js"></script>
```

- [ ] **Schritt 2:** `build.js`: `'js/ob-plan.js'` ans Ende des `files`-Arrays. `sw.js`: `'./js/ob-plan.js'` in `SHELL` + `CACHE`-Version bumpen (Format `gymtrack-vJJJJMMTTnnnn`, Datum heute, laufende Nummer +1).
- [ ] **Schritt 3:** `_TPL_DAY_LABELS` (Suchanker in `index.html`) um Einträge für die Builder-Ids ergänzen: für `ob-fullbody3`/`ob-ppl3`/`ob-upperlower`/`ob-ppl6`/`ob-arnold` die vorhandenen Label-Objekte der Basis-Ids kopieren; neu `'ob-fullbody2': {mon:'Ganzkörper A', thu:'Ganzkörper B'}` und `'ob-ppl5': {mon:'Push', tue:'Pull', wed:'Beine', thu:'Oberkörper', fri:'Unterkörper'}`.
- [ ] **Schritt 4 (Verify):** `node build.js` läuft fehlerfrei und kopiert `js/ob-plan.js`; Browser-Preview (mobile Viewport), Konsole: `typeof ObPlan.buildObPlan === 'function'` → `true`.
- [ ] **Schritt 5:** Commit + Push: `feat(onboarding): ob-plan.js in App, Build und Service Worker eingebunden`

---

### Task 5: Texttabelle (DE/EN) + Icon-Set

**Files:**
- Modify: `index.html` — neuer Block direkt über dem Anker `// ONBOARDING — ERSTEINRICHTUNG`; `I18N_EN`-Tabelle (Suchanker `const I18N_EN`), `_OB_SVG` (Suchanker `const _OB_SVG`)
- Test: `test/ob-i18n.test.js`

**Interfaces:**
- Produces: `OB_TX` (Objekt Schlüssel → deutscher String) + Helfer `obT(key)` = `tr(OB_TX[key])`; erweitertes `_OB_SVG` mit `bell`, `clock`, `calendar`, `trophy`, `home`, `balance`, `back` (Bestand `dumbbell/trend/bar/flame/heart/check/users` bleibt).
- Alle Schritt-Renderer (Task 6–8) nutzen ausschließlich `obT('…')` bzw. `esc()`-te Nutzereingaben.

- [ ] **Schritt 1: Failing Test** `test/ob-i18n.test.js` — Extraktionsmuster (Datei einlesen, Literal ausschneiden, `new Function` auswerten) vollständig aus `test/coach-i18n.test.js` übernehmen und auf `OB_TX` + `I18N_EN` anwenden. Kernbehauptung:

```js
for (const [k, de] of Object.entries(obtx))
  assert.ok(Object.prototype.hasOwnProperty.call(i18n, de), `EN fehlt für OB_TX.${k}: "${de}"`);
```

- [ ] **Schritt 2:** rot laufen lassen (`OB_TX` existiert noch nicht).
- [ ] **Schritt 3:** `OB_TX` in `index.html` anlegen — vollständige Liste (DE → EN-Eintrag in `I18N_EN`):

| Schlüssel | DE | EN |
|---|---|---|
| welcomeTitle | Willkommen bei MyGymTrack | Welcome to MyGymTrack |
| welcomeSub | Beantworte ein paar Fragen und starte mit einem Trainingsplan, der zu dir passt. | Answer a few questions and start with a training plan that fits you. |
| welcomeTime | Dauert unter 2 Minuten | Takes less than 2 minutes |
| welcomeCta | Los geht's | Let's go |
| welcomeSkip | Ohne Einrichtung starten | Start without setup |
| later | Später | Later |
| next | Weiter | Continue |
| nameQ | Wie heißt du? | What's your name? |
| nameSub | Optional — wird in der Freunde-Rangliste angezeigt. | Optional — shown on the friends leaderboard. |
| namePh | Dein Vorname | Your first name |
| goalQ | Was ist dein Ziel? | What's your goal? |
| goalSub | Bestimmt Übungsauswahl und Satzbereiche deines Plans. | Shapes your exercise selection and set ranges. |
| goalMuskel | Muskeln aufbauen | Build muscle |
| goalMuskelS | Mehr Masse, bessere Form | More mass, better shape |
| goalKraft | Stärker werden | Get stronger |
| goalKraftS | Mehr Gewicht auf der Stange | More weight on the bar |
| goalAbnehmen | Abnehmen | Lose weight |
| goalAbnehmenS | Kalorien verbrennen, definieren | Burn calories, get lean |
| goalFit | Fit bleiben | Stay fit |
| goalFitS | Regelmäßig in Bewegung | Keep moving regularly |
| expQ | Wie viel Erfahrung hast du? | How much experience do you have? |
| expSub | Bestimmt, welcher Split zu dir passt. | Decides which split fits you. |
| expNeu | Anfänger | Beginner |
| expNeuS | Unter 1 Jahr Training | Less than 1 year of training |
| expMittel | Fortgeschritten | Intermediate |
| expMittelS | 1–3 Jahre Training | 1–3 years of training |
| expProfi | Profi | Advanced |
| expProfiS | Über 3 Jahre Training | More than 3 years of training |
| freqQ | Wie oft pro Woche willst du trainieren? | How often do you want to train per week? |
| freqSub | Realistisch bleiben — lieber konstant 3× als geplant 6×. | Stay realistic — a steady 3× beats a planned 6×. |
| freqLbl | Tage pro Woche | days per week |
| prioQ | Willst du etwas priorisieren? | Want to prioritize anything? |
| prioSub | Wähle bis zu 2 Muskelgruppen — sie bekommen mehr Volumen in deinem Plan. | Pick up to 2 muscle groups — they'll get more volume in your plan. |
| prioNone | Nein — ausgewogen trainieren | No — train balanced |
| durQ | Wie lang darf eine Einheit sein? | How long can a session be? |
| durSub | Steuert, wie viele Übungen pro Tag im Plan stehen. | Controls how many exercises your plan has per day. |
| durKurz | Kurz | Short |
| durKurzS | ~45 Minuten | ~45 minutes |
| durNormal | Normal | Regular |
| durNormalS | ~60–75 Minuten | ~60–75 minutes |
| durLang | Lang | Long |
| durLangS | 90+ Minuten | 90+ minutes |
| equipQ | Wo trainierst du? | Where do you train? |
| equipSub | Bestimmt, welche Übungen in deinen Plan kommen. | Decides which exercises go into your plan. |
| equipGym | Im Gym | At the gym |
| equipGymS | Voll ausgestattet | Fully equipped |
| equipHome | Zuhause mit Hanteln | At home with dumbbells |
| equipHomeS | Kurzhanteln und Bank | Dumbbells and a bench |
| equipBody | Nur Körpergewicht | Bodyweight only |
| equipBodyS | Ohne Geräte trainieren | Train without equipment |
| pushTitle | Bleib am Ball | Stay on track |
| pushSub | Wir melden uns nur, wenn es dich weiterbringt. | We only reach out when it helps you. |
| pushB1 | Trainings-Erinnerungen | Workout reminders |
| pushB1S | An deinen Plan-Tagen, zur passenden Zeit | On your plan days, at the right time |
| pushB2 | Neue Bestleistungen | New personal records |
| pushB2S | Glückwunsch bei PRs und Wochenrückblick | Congrats on PRs and your weekly recap |
| pushB3 | Freunde-Aktivität | Friend activity |
| pushB3S | Wenn Freunde dir Props geben | When friends give you props |
| pushCta | Benachrichtigungen aktivieren | Enable notifications |
| pushLater | Jetzt nicht | Not now |
| buildT1 | Split für deine Trainingstage gewählt | Split picked for your training days |
| buildT2 | Fokus-Übungen ergänzt | Focus exercises added |
| buildT3 | Volumen an deine Zeit angepasst | Volume adjusted to your time |
| doneTitle | Dein Plan steht | Your plan is ready |
| doneSub | Aus deinen Antworten erstellt — jederzeit anpassbar. | Built from your answers — adjustable anytime. |
| doneWeek | pro Woche | per week |
| doneCta | Plan übernehmen & loslegen | Apply plan & get started |
| doneDetails | Details ansehen | View details |
| doneNoPlanTitle | Alles bereit | All set |
| doneNoPlanSub | Leg direkt los: Erstelle Übungen oder starte dein erstes Training im Heute-Tab. | Get going: create exercises or start your first workout in the Today tab. |

  `obT`-Helfer direkt unter `OB_TX`: `function obT(k){ return tr(OB_TX[k] || k); }`. Die EN-Spalte wird als Einträge `'DE-String': 'EN-String'` in `I18N_EN` ergänzt (Suchanker `const I18N_EN`).
- [ ] **Schritt 4:** `_OB_SVG` erweitern (gleicher Stil, `currentColor`): `bell`, `clock`, `calendar`, `trophy`, `home`, `balance` (Kreis + Mittelstrich), `back` (`M15 18l-6-6 6-6`). SVG-Pfade aus `flow-screens.html` in `.superpowers/brainstorm/11896-1785489700/content/` übernehmen.
- [ ] **Schritt 5:** `node --test test/ob-i18n.test.js` — grün.
- [ ] **Schritt 6:** Commit + Push: `feat(onboarding): OB_TX-Texttabelle (DE/EN) und erweitertes SVG-Icon-Set`

---

### Task 6: Neuer Flow-Kern — State, Header, Schritte 1–8, CSS

**Files:**
- Modify: `index.html` — Onboarding-Block (Anker `// ONBOARDING — ERSTEINRICHTUNG` bis Ende `renderOb`), CSS-Block (Anker `#ob-screen{` bis `.ob-opt-sub`)

**Interfaces:**
- Consumes: `obT()`, `_OB_SVG` (Task 5).
- Produces: `_ob = { step:0, name:'', goal:null, exp:null, freq:null, prio:[], dur:null, equip:null, plan:null, applied:false }`; `_obSteps()` → `['welcome','name','goal','exp','freq','prio','dur','equip','push','done']` (ohne `'push'`, wenn `!_cap('PushNotifications')`); `renderOb()` rendert per Schritt-Id; neue Picker `obPickPrio(id)`, `obPickDur(id)`, `obPickEquip(id)`; `obNext/obBack/skipOnboarding/startOnboarding/maybeStartOnboarding/_obClose/obFinish` behalten Namen und Außenverhalten (Aufrufer im Startpfad bleiben gültig).
- Task 7 füllt `'push'`, Task 8 füllt `'done'` — bis dahin rendern beide einen einfachen Platzhalter mit `obT('next')`-CTA.

- [ ] **Schritt 1:** Alte Konstanten ersetzen — Ids bleiben (persistiert, Coach liest sie):

```js
const OB_GOALS = [
  {id:'muskel',   t:'goalMuskel',   s:'goalMuskelS',   ico:'trend'},
  {id:'kraft',    t:'goalKraft',    s:'goalKraftS',    ico:'bar'},
  {id:'abnehmen', t:'goalAbnehmen', s:'goalAbnehmenS', ico:'flame'},
  {id:'fit',      t:'goalFit',      s:'goalFitS',      ico:'heart'},
];
const OB_EXPS = [ {id:'neu',t:'expNeu',s:'expNeuS'}, {id:'mittel',t:'expMittel',s:'expMittelS'}, {id:'profi',t:'expProfi',s:'expProfiS'} ];
const OB_PRIOS = ['brust','ruecken','schultern','arme','beine','core'];   // Anzeige: ObPlan.OB_MG_LABEL[lang]
const OB_DURS  = [ {id:'kurz',t:'durKurz',s:'durKurzS'}, {id:'normal',t:'durNormal',s:'durNormalS'}, {id:'lang',t:'durLang',s:'durLangS'} ];
const OB_EQUIPS= [ {id:'gym',t:'equipGym',s:'equipGymS',ico:'bar'}, {id:'home',t:'equipHome',s:'equipHomeS',ico:'home'}, {id:'body',t:'equipBody',s:'equipBodyS',ico:'heart'} ];
```

- [ ] **Schritt 2:** `_obSteps()`, Picker, Validierung:

```js
function _obSteps(){
  const s = ['welcome','name','goal','exp','freq','prio','dur','equip'];
  if (_cap('PushNotifications')) s.push('push');
  s.push('done');
  return s;
}
function obPickPrio(id){
  haptic(8);
  if (id === 'none') { _ob.prio = []; }
  else {
    const i = _ob.prio.indexOf(id);
    if (i >= 0) _ob.prio.splice(i, 1);
    else { if (_ob.prio.length >= 2) return; _ob.prio.push(id); }
  }
  renderOb();
}
function obPickDur(id){ _ob.dur = id; haptic(8); renderOb(); }
function obPickEquip(id){ _ob.equip = id; haptic(8); renderOb(); }
```

  `obNext()` validiert per Schritt-Id (`goal/exp/freq/dur/equip` Pflicht; `prio` immer weiter — leer = ausgewogen); `_obSaveAnswers()` schreibt zusätzlich `S.obPrio=[..._ob.prio]`, `S.obDur=_ob.dur`, `S.obEquip=_ob.equip`.
- [ ] **Schritt 3:** `renderOb()` neu:

```js
function renderOb(){
  const el = document.getElementById('ob-screen');
  if (!el || !_ob) return;
  const steps = _obSteps(), id = steps[_ob.step];
  const qFirst = 1, qLast = steps.indexOf('done') - 1;      // Segmente: name … letzter Schritt vor done
  const segs = Array.from({length: qLast - qFirst + 1}, (_, i) =>
    `<div class="ob-seg${_ob.step >= i + qFirst ? ' on' : ''}"></div>`).join('');
  const showHdr = id !== 'welcome' && id !== 'done';
  el.innerHTML = `
    ${showHdr ? `<div class="ob-hdr">
      <button class="ob-back" onclick="obBack()" aria-label="${esc(tr('Zurück'))}">${_OB_SVG.back}</button>
      <div class="ob-segs">${segs}</div>
      <button class="ob-skip" onclick="skipOnboarding()">${obT('later')}</button>
    </div>` : ''}
    <div class="ob-body"><div class="ob-step">${_obStepHTML(id)}</div></div>
    <div class="ob-foot">${_obFootHTML(id)}</div>`;
}
```

- [ ] **Schritt 4:** `_obStepHTML(id)` für `welcome/name/goal/exp/freq/prio/dur/equip` nach den freigegebenen Mockups (`.superpowers/brainstorm/11896-1785489700/content/flow-screens.html` + `design-richtung-v4.html`): Willkommen = Logo (`icon-192.png`), `welcomeTitle/Sub/Time`; Frage-Schritte = `.ob-q` + `.ob-qsub` + `.ob-opts`-Karten (Icon-Kachel, Titel, Sub, Häkchen-Badge bei `.on`); `prio` = `prioNone`-Karte (aktiv wenn `_ob.prio.length===0`) + `.ob-grid` 2×3 mit `obPickPrio`; `freq` = Zahlenreihe 2–6 (bestehende `.ob-freq`-Optik in Token-Form). `_obFootHTML(id)`: `welcome` → CTA `welcomeCta` (`obNext()`) + `.ob-ghost` `welcomeSkip` (`skipOnboarding()`); Frage-Schritte → CTA `next`, `disabled`-Optik (`opacity:.45`) solange Pflichtwahl fehlt.
- [ ] **Schritt 5:** CSS ersetzen (Anker `#ob-screen{` … alte `ob-dot`-Regeln löschen): `ob-hdr{display:flex;align-items:center;gap:10px;height:32px}`, `ob-back{width:32px;height:32px;border-radius:50%;background:var(--card);border:1px solid var(--gl-bdr2);color:var(--text2);display:flex;align-items:center;justify-content:center}`, `ob-segs{flex:1;display:flex;gap:4px;min-width:0}`, `ob-seg{flex:1;height:4px;border-radius:2px;background:var(--gl-bdr2)}`, `ob-seg.on{background:var(--acc)}`, `ob-skip{padding:6px 12px;border-radius:14px;background:var(--card);border:1px solid var(--gl-bdr2);color:var(--text2);font-size:12px;font-weight:600}`, `ob-q{font-size:25px;font-weight:800;letter-spacing:-.6px;line-height:1.12}`, `ob-qsub{font-size:13px;color:var(--text2)}`, `.ob-opt`/`.ob-opt.on`/`.ob-opt-ico` Bestand behalten (Tokens stimmen schon), neu `.ob-opt-ck{width:20px;height:20px;border-radius:50%;background:var(--acc);color:#fff;…}` (das `#fff` auf Akzent ist app-üblich, vgl. `.btn-acc`), `ob-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}`, `.ob-bene`-Karten für Task 7, `.ob-focus{color:var(--acc);font-weight:700}` für Task 8.
- [ ] **Schritt 6 (Verify):** Browser-Preview (mobile Viewport): `startOnboarding()` in Konsole; Schritte 1–8 durchklicken (Pflichtfelder blockieren Weiter, Prio max. 2, „ausgewogen" exklusiv); Dark/Light toggeln; EN stichprobenartig; keine Konsolenfehler; Screenshot.
- [ ] **Schritt 7:** Commit + Push: `feat(onboarding): neuer Flow-Kern — Header mit Segmenten, Schritte 1–8 im App-Design`

---

### Task 7: Push-Schritt (nur nativ)

**Files:**
- Modify: `index.html` — `_obStepHTML('push')`, `_obFootHTML('push')`, neue Funktion `obPushEnable()`

**Interfaces:**
- Consumes: `_pushRegister()` (Bestand, Anker `async function _pushRegister`), `_cap('PushNotifications')`, `obT()`, `_OB_SVG.bell/calendar/trophy/users`.
- Produces: `S.obPushChoice ∈ 'enabled'|'later'|null`; Schritt erscheint nur nativ (bereits über `_obSteps()` aus Task 6 gesteuert).

- [ ] **Schritt 1:** Screen bauen (Layout Screen 9 aus `flow-screens.html`): Glocken-Icon im Kreis (`background:var(--soft);color:var(--acc)`), `pushTitle` zentriert, `pushSub`, drei `.ob-bene`-Karten (`calendar`+`pushB1/S`, `trophy`+`pushB2/S`, `users`+`pushB3/S`). Fuß: CTA `pushCta` → `obPushEnable()`, `.ob-ghost` `pushLater` → `S.obPushChoice='later'; persist(); obNext();`.
- [ ] **Schritt 2:**

```js
async function obPushEnable(){
  haptic(10);
  S.obPushChoice = 'enabled'; persist();
  try { await _pushRegister(); } catch(_){}
  obNext();
}
```

  `_pushRegister()` zeigt den nativen iOS-Dialog genau einmal (Bestand: `checkPermissions → requestPermissions`); Ablehnung blockiert den Flow nicht — `obNext()` läuft immer.
- [ ] **Schritt 3 (Verify):** Browser (kein Capacitor): `_obSteps()` in Konsole → `push` fehlt, Segmentzahl stimmt. Optik: Schritt kurz per Stub erzwingen (`window._capBackup=_cap; _cap=()=>({});` → rendern → Screenshot → Stub zurücknehmen). Echter iOS-Dialog: nur am Mac verifizierbar — als offener Punkt in Task 9 Schritt 6 notiert.
- [ ] **Schritt 4:** Commit + Push: `feat(onboarding): Push-Pre-Prompt als eigener Schritt (nur nativ)`

---

### Task 8: Erstell-Animation, Ergebnis-Screen, Plan anwenden

**Files:**
- Modify: `index.html` — `_obStepHTML('done')`, `_obFootHTML('done')`, neue Funktionen `_obBuildPlan()`, `obApplyPlan()`, `obToggleDetails()`; `obNext()`-Ende

**Interfaces:**
- Consumes: `ObPlan.buildObPlan(answers, {lang})` (Task 3), `_applyTemplateCore(tpl)` (Bestand — erwartet `{id, title, days}`), `dayByKey()`, `obT()`, `esc()`.
- Produces: `_ob.plan` (Ergebnis von `buildObPlan`); Anwendung ausschließlich über CTA (keine Doppel-Anwendung bei Zurück).

- [ ] **Schritt 1:** Beim Übergang nach `done` (in `obNext()`): `_obSaveAnswers()`, dann

```js
function _obBuildPlan(){
  const lang = (typeof GT_LANG !== 'undefined' && GT_LANG === 'en') ? 'en' : 'de';
  _ob.plan = ObPlan.buildObPlan({
    goal:_ob.goal || 'muskel', exp:_ob.exp || 'neu', freq:_ob.freq || 3,
    prio:_ob.prio, dur:_ob.dur || 'normal', equip:_ob.equip || 'gym'
  }, { lang });
}
```

  Erstell-Phase: drei `.ob-buildline`-Zeilen (`buildT1/2/3`), Häkchen per `setTimeout` bei ~500/1100/1700 ms (Klasse `.done`), bei ~2000 ms Ergebnis rendern. Timer in `_obBuildTimers` sammeln, bei `obBack()`/`_obClose()` räumen. Wenn alle Fragen übersprungen wurden (kein `goal`): Erstell-Phase überspringen, Fallback-Screen `doneNoPlanTitle/Sub` ohne Karte, CTA = `obFinish()`.
- [ ] **Schritt 2:** Ergebnis-Screen (Layout Screen 10 aus `flow-screens.html`): Häkchen-Ring, Titel `doneTitle` (+ `, ${esc(_ob.name)}` falls Name), `doneSub`; Plan-Karte: `plan.title` fett, `plan.subtitle` in `.ob-focus` (nur wenn nicht leer), Meta-Zeile `${_ob.freq}× ${obT('doneWeek')} · ${obT('dur…')} · ${obT('equip…')}`, 7 Tages-Chips (`dayByKey(k).short`, aktiv = `type==='exercises'`), Vorschau erster Trainingstag (`_TPL_DAY_LABELS`-Label + `libNames`, Fokus-Namen aus `plan.focus[day]` mit `<span class="ob-focus">`); `obToggleDetails()` klappt restliche Tage als Liste auf/zu.
- [ ] **Schritt 3:**

```js
function obApplyPlan(){
  if (!_ob || !_ob.plan) { obFinish(); return; }
  const p = _ob.plan;
  _applyTemplateCore({ id: p.id, title: p.title + (p.subtitle ? ' — ' + p.subtitle : ''), days: p.days });
  _ob.applied = true;
  try { hapticSuccess(); } catch(_) { haptic(15); }
  _obClose();
}
```

  Fuß: CTA `doneCta` → `obApplyPlan()`, `.ob-ghost` `doneDetails` → `obToggleDetails()`. Kopf im `done`-Schritt: nur Zurück-Button (kein „Später"); Zurück → `_ob.plan = null`, Timer räumen, zurück zum letzten Frage-Schritt.
- [ ] **Schritt 4 (Verify):** Browser-Preview kompletter Durchlauf: `muskel/mittel/4/[brust,arme]/normal/gym` → „Upper · Lower — Fokus: Brust & Arme", 4 aktive Tages-Chips, CTA → Wochenplan im Heute-Tab, danach Soft-Paywall (Bestand). Zweiter Durchlauf „Ohne Einrichtung starten" → kein Plan, App nutzbar. Konsole fehlerfrei, Screenshots.
- [ ] **Schritt 5:** Commit + Push: `feat(onboarding): Erstell-Animation, Ergebnis-Screen und Plan-Übernahme`

---

### Task 9: Aufräumen, Ende-zu-Ende, Abnahme

**Files:**
- Modify: `index.html` (Reste), `test/ob-plan.test.js` (nur falls Lücken auffallen)

**Interfaces:**
- Consumes: alles Vorherige. Produces: abgeschlossener Flow, saubere Codebasis.

- [ ] **Schritt 1:** Tote Reste entfernen: alte Template-Auswahl im Onboarding (`obPickTpl`, `obSkipPlan`, `_obRecTpl`), `.ob-tpl*`- und `ob-dot`-CSS; `obFinishCloud` per `grep -n "obFinishCloud" index.html` prüfen — ohne Referenz löschen. `PLAN_TEMPLATES` + `openTemplatePicker` bleiben unangetastet.
- [ ] **Schritt 2:** Abnahme-Greps im neuen Onboarding-Block: kein Emoji (`rg -n "[\x{1F300}-\x{1FAFF}]" index.html` auf den Block), keine neuen Hex-Farben in `ob-*`-Regeln (Ausnahme dokumentiert: `#fff` auf Akzentflächen wie `.btn-acc`). Verstöße fixen.
- [ ] **Schritt 3:** Alle Tests: `node --test test/` — komplett grün (inkl. Coach-Bestandstests: nichts kaputtgemacht).
- [ ] **Schritt 4:** Browser-Preview-Matrix (mobile Viewport): DE-Light, DE-Dark, EN-Light, EN-Dark je ein kompletter Durchlauf; ein Alternativ-Akzent-Theme (Pink) stichprobenartig; Screenshots. Akzeptanzkriterien 1–9 der Spec einzeln abhaken.
- [ ] **Schritt 5:** Commit + Push: `feat(onboarding): Altlasten entfernt, Ende-zu-Ende-Abnahme des neuen Onboardings`
- [ ] **Schritt 6:** Offene Mac-Punkte notieren (Commit-Text von Schritt 5): iOS-Verifikation — Push-Dialog einmalig (Akzeptanzkriterium 6), Plan-Übernahme nativ, Build via `sim-native.sh` (läuft nur am Mac).

---

## Self-Review (erledigt)

- **Spec-Abdeckung:** Flow 10 Schritte → Task 6–8; Plan-Matrix/Fokus/Dauer/Equipment/Ziel → Task 1–3; Push → Task 7; i18n → Task 5 (+ Test); Tokens/kein Emoji → Global Constraints + Task 9 Schritt 2; Edge Cases (Web ohne Push, Skip, Zurück-Neuberechnung, Bestandsnutzer via unverändertem `maybeStartOnboarding`) → Task 6–8; Akzeptanzkriterien → Task 9 Schritt 4.
- **Platzhalter:** Task 5 Schritt 1 verweist für die Extraktion auf das vollständige Muster in `test/coach-i18n.test.js` (existierende Repo-Datei) — kein TBD.
- **Typkonsistenz:** `buildObPlan`-Signatur (Task 3) == Aufruf in Task 8; `applyFocus`-Rückgabe `{days, focus}` == Tests; Schritt-Ids aus `_obSteps()` identisch in Task 6–8; alle `OB_TX`-Schlüssel in Task 6–8 stammen aus der Task-5-Tabelle; `OB_COMPOUNDS` wird in Task 3 exportiert und im Test benutzt.
