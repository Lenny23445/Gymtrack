# Workout-Fokus-Modus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Im aktiven Training rastet die aktuelle Übung beim Scrollen sanft ein, alle anderen Karten werden gedimmt; nach dem letzten Satz gleitet die nächste offene Übung automatisch ins Bild.

**Architecture:** Drei entkoppelte Schichten (Spec: `docs/superpowers/specs/2026-07-31-workout-fokus-modus-design.md`): CSS `scroll-snap` (proximity) fürs Einrasten, ein IntersectionObserver für `.focused`/`.dimmed`, JS-Hook in `toggleSetDone` fürs Auto-Weiterscrollen. Pure Logik (Superset-Einheiten, nächstes Ziel, Geometrie) liegt DOM-frei in `js/workout-focus.js`.

**Tech Stack:** Vanilla JS in `index.html` (Single-File-App), UMD-Modul-Muster wie `js/coach-*.js`, `node --test` für Tests, Capacitor/iOS-Simulator zur Verifikation.

## Global Constraints

- Branch: `merge/store168-into-main` (Basis c3689c1). Zeilennummern unten gelten für diesen Stand.
- **Keine Emojis im UI-Chrome** (CLAUDE.md-Hard-Regel).
- **Jeder neue deutsche UI-Text braucht einen `I18N_EN`-Eintrag** (exakte Phrase).
- Encoding UTF-8 ohne BOM; Edit-Tool ok.
- `APP_VERSION` (index.html) == `CACHE` (sw.js), Muster `gymtrack-vJJJJMMTTNNNN`.
- Nach Abschluss: `npm run build && npx cap sync ios`, Commit + Push (Standing Auto-Push für gymtrack).
- Kein Settings-Toggle, kein Premium-Gate, keine Änderung an Coach-/Progressions-Logik.

---

### Task 1: Pure Helfer `js/workout-focus.js` (TDD)

**Files:**
- Create: `js/workout-focus.js`
- Test: `test/workout-focus.test.js`
- Modify: `build.js:9-10` (Kopierliste), `index.html:5988` (Script-Tag danach)

**Interfaces:**
- Consumes: nichts (DOM-frei, keine App-Globals).
- Produces: Global `WorkoutFocus` mit
  - `focusUnitOf(logs, li) -> number[]` — Indizes der Fokus-Einheit von `li`: alle Logs mit derselben truthy `ssGroup`, sonst `[li]`. Ungültiges `li` → `[]`.
  - `nextOpenUnit(logs, fromLi) -> number|null` — Index der ERSTEN Karte der nächsten Einheit mit mindestens einem offenen Satz (`!s.done`), vorwärts ab der Einheit nach `fromLi`, mit Wrap-around an den Listenanfang; die eigene Einheit ist ausgeschlossen. Nichts offen → `null`.
  - `pickFocused(rects, mid) -> number` — Index des Eintrags `{top, bottom}`, der `mid` überdeckt (`top <= mid < bottom`); überdeckt keiner, gewinnt der kleinste Abstand von Kartenmitte zu `mid`. Leere Liste → `-1`.
  - `logs`-Form: `[{ sets: [{done: boolean}], ssGroup?: string|null }]`.

- [ ] **Step 1: Failing Tests schreiben**

`test/workout-focus.test.js`:

```js
/* GymTrack — Tests fuer js/workout-focus.js (Fokus-Modus im Training)

   Geprueft wird die Einheiten-Logik (Superset = EINE Einheit), die
   Zielwahl fuers Auto-Weiterscrollen (vorwaerts, Wrap, nie die eigene
   Einheit) und die Geometrie-Auswahl inkl. Karten, die hoeher als der
   Sichtbereich sind. */
const test = require('node:test');
const assert = require('node:assert');
const F = require('../js/workout-focus.js');

const open = () => ({ sets: [{ done: false }] });
const done = () => ({ sets: [{ done: true }, { done: true }] });
const ss = (l, g) => Object.assign(l, { ssGroup: g });

test('focusUnitOf: Einzeluebung ist ihre eigene Einheit', () => {
  assert.deepStrictEqual(F.focusUnitOf([open(), open()], 1), [1]);
});

test('focusUnitOf: Superset-Partner bilden eine Einheit', () => {
  const logs = [open(), ss(open(), 'g1'), ss(open(), 'g1'), open()];
  assert.deepStrictEqual(F.focusUnitOf(logs, 2), [1, 2]);
});

test('focusUnitOf: ungueltiger Index liefert leere Einheit', () => {
  assert.deepStrictEqual(F.focusUnitOf([open()], 5), []);
  assert.deepStrictEqual(F.focusUnitOf([open()], -1), []);
});

test('nextOpenUnit: springt zur naechsten Uebung mit offenem Satz', () => {
  assert.strictEqual(F.nextOpenUnit([done(), open()], 0), 1);
});

test('nextOpenUnit: ueberspringt fertige Einheiten und wrappt an den Anfang', () => {
  assert.strictEqual(F.nextOpenUnit([open(), done(), done()], 2), 0);
});

test('nextOpenUnit: Superset zaehlt als eine Einheit — Ziel ist die ERSTE Karte', () => {
  const logs = [done(), ss(open(), 'g1'), ss(open(), 'g1')];
  assert.strictEqual(F.nextOpenUnit(logs, 0), 1);
});

test('nextOpenUnit: die eigene Einheit ist nie das Ziel', () => {
  const logs = [ss(open(), 'g1'), ss(open(), 'g1')];
  assert.strictEqual(F.nextOpenUnit(logs, 0), null);
});

test('nextOpenUnit: alles fertig -> null', () => {
  assert.strictEqual(F.nextOpenUnit([done(), done()], 0), null);
  assert.strictEqual(F.nextOpenUnit([], 0), null);
});

test('pickFocused: Karte unterm Mittelpunkt gewinnt — auch eine sehr hohe', () => {
  const rects = [{ top: 0, bottom: 80 }, { top: 80, bottom: 900 }];
  assert.strictEqual(F.pickFocused(rects, 400), 1);
});

test('pickFocused: ohne Ueberdeckung gewinnt die naechste Kartenmitte', () => {
  const rects = [{ top: -200, bottom: -20 }, { top: 30, bottom: 90 }];
  assert.strictEqual(F.pickFocused(rects, 0), 1);
});

test('pickFocused: leere Liste -> -1', () => {
  assert.strictEqual(F.pickFocused([], 100), -1);
});
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `node --test test/workout-focus.test.js`
Expected: FAIL — `Cannot find module '../js/workout-focus.js'`

- [ ] **Step 3: Minimal-Implementierung**

`js/workout-focus.js`:

```js
/* GymTrack — Fokus-Modus im aktiven Training (pure Logik, kein DOM)

   Drei Helfer fuer die Fokus-Schicht in index.html:
   - focusUnitOf: Superset-Gruppe (ssGroup) = EINE Fokus-Einheit.
   - nextOpenUnit: Ziel fuers Auto-Weiterscrollen nach dem letzten Satz.
   - pickFocused: welche Karte liegt unter der Mittellinie des Sichtbereichs.
   Kein DOM und keine App-Globals — Eingaben kommen als Argumente herein,
   damit alles unter node --test pruefbar ist (Muster wie js/coach-*.js). */
(function (root) {
  'use strict';

  function focusUnitOf(logs, li) {
    if (!Array.isArray(logs) || li == null || li < 0 || li >= logs.length) return [];
    const g = logs[li] && logs[li].ssGroup;
    if (!g) return [li];
    const unit = [];
    for (let i = 0; i < logs.length; i++) if (logs[i] && logs[i].ssGroup === g) unit.push(i);
    return unit;
  }

  function _unitOpen(logs, unit) {
    return unit.some(i => ((logs[i] && logs[i].sets) || []).some(s => s && !s.done));
  }

  function nextOpenUnit(logs, fromLi) {
    if (!Array.isArray(logs) || !logs.length) return null;
    const own = focusUnitOf(logs, fromLi);
    // Vorwaerts ab fromLi+1, dann Wrap an den Anfang — jede Karte einmal.
    for (let k = 1; k <= logs.length; k++) {
      const i = (((fromLi + k) % logs.length) + logs.length) % logs.length;
      if (own.includes(i)) continue;
      const unit = focusUnitOf(logs, i);
      if (_unitOpen(logs, unit)) return unit[0];
    }
    return null;
  }

  function pickFocused(rects, mid) {
    if (!Array.isArray(rects) || !rects.length) return -1;
    let best = -1, bestDist = Infinity;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (r.top <= mid && mid < r.bottom) return i;   // Ueberdeckung schlaegt alles
      const d = Math.abs((r.top + r.bottom) / 2 - mid);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  const API = { focusUnitOf: focusUnitOf, nextOpenUnit: nextOpenUnit, pickFocused: pickFocused };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.WorkoutFocus = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `node --test test/workout-focus.test.js`
Expected: PASS (11 Tests). Danach `npm test` — alle 606+11 grün.

- [ ] **Step 5: Registrieren**

In `build.js` in der `FILES`-Liste nach `'js/coach-charts.js'` ergänzen:

```js
               'js/coach-notify.js', 'js/coach-report.js', 'js/coach-charts.js',
               'js/workout-focus.js'];
```

In `index.html` direkt NACH Zeile 5988 (`<script src="./js/coach-charts.js"></script>`):

```html
<script src="./js/workout-focus.js"></script>
```

- [ ] **Step 6: Commit**

```bash
git add js/workout-focus.js test/workout-focus.test.js build.js index.html
git commit -m "feat(training): Fokus-Helfer — Superset-Einheiten, naechstes Ziel, Geometrie"
```

---

### Task 2: CSS-Snap + Fokus-Optik (Dimmen)

**Files:**
- Modify: `index.html` — CSS-Block vor Zeile 926 (`/* ── TABBAR — iOS 26 LIQUID GLASS ── */`), `renderLogCards()` (18166–18245), `wkDragStart` (14616), `_attachSwipeToDelete` (18250)

**Interfaces:**
- Consumes: `WorkoutFocus.focusUnitOf`, `WorkoutFocus.pickFocused` (Task 1), bestehendes `wkLogs`, `renderLogCards()`, `data-li` an `.ex-card`.
- Produces: Modul-Variable `_wkFocusLi` (Index der fokussierten Karte, `-1` = kein Fokus), Funktionen `_wkFocusApply()`, `_wkFocusObserve()`; CSS-Klassen `.dimmed` (Karte), `.focus-on` (`#log-cards`), `.snap-off` (`.sheet`). Task 3 liest `_wkFocusLi` NICHT — er bekommt `li` direkt aus `toggleSetDone`.

- [ ] **Step 1: CSS einfügen** (direkt VOR `/* ── TABBAR — iOS 26 LIQUID GLASS ── */`, index.html:926)

```css
/* ── FOKUS-MODUS IM TRAINING ──
   Einrasten: proximity, nie mandatory — hohe Karten (4+ Saetze) bleiben frei
   durchscrollbar, Notizfeld und Finish-Button unten bleiben normal erreichbar.
   Snap-Areas gibt es nur an .ex-card; Step 1 (Uebungswahl) hat keine → kein Effekt. */
#ov-wk .sheet{scroll-snap-type:y proximity}
#ov-wk .sheet.snap-off{scroll-snap-type:none}   /* waehrend Drag-Reorder/Loesch-Swipe */
#log-cards .ex-card{scroll-snap-align:start;scroll-margin-top:12px;
  transition:opacity .28s ease,transform .28s ease}
/* Dimmen nur, wenn die Fokus-Schicht aktiv ist (>= 2 Karten) */
#log-cards.focus-on .ex-card.dimmed{opacity:.45;transform:scale(.97)}
@media (prefers-reduced-motion:reduce){
  #log-cards .ex-card{transition:none;transform:none}
}
```

- [ ] **Step 2: Fokus-Zustand + Observer** — direkt VOR `function renderLogCards()` (index.html:18166) einfügen:

```js
/* ── Fokus-Modus: welche Uebung ist "dran"? ──
   _wkFocusLi lebt hier im Modul, weil renderLogCards() #log-cards bei jedem
   Satz-Haken komplett per innerHTML ersetzt — die Klassen muessen beim Rendern
   mitkommen (kein Nachpatchen → kein Flackern), der Observer wird danach neu
   angebunden. Die Auswahl selbst (Geometrie, Superset-Einheit) rechnet
   WorkoutFocus (js/workout-focus.js, unter node --test geprueft). */
let _wkFocusLi = -1;
let _wkFocusIO = null;

function _wkFocusApply() {
  const cards = document.querySelectorAll('#log-cards .ex-card');
  const unit = (_wkFocusLi >= 0 && typeof WorkoutFocus !== 'undefined')
    ? WorkoutFocus.focusUnitOf(wkLogs, _wkFocusLi) : [];
  cards.forEach(c => {
    const li = +c.dataset.li;
    c.classList.toggle('dimmed', unit.length > 0 && !unit.includes(li));
  });
}

function _wkFocusObserve() {
  if (_wkFocusIO) { _wkFocusIO.disconnect(); _wkFocusIO = null; }
  const wrap = document.getElementById('log-cards');
  const sheet = document.querySelector('#ov-wk .sheet');
  if (!wrap || !sheet || typeof WorkoutFocus === 'undefined') return;
  const cards = wrap.querySelectorAll('.ex-card');
  // Bei 0–1 Karten gibt es nichts zu fokussieren — nichts dimmen.
  wrap.classList.toggle('focus-on', cards.length > 1);
  if (cards.length < 2) { _wkFocusLi = -1; return; }
  if (_wkFocusLi >= wkLogs.length) _wkFocusLi = -1;   // nach Entfernen/Umsortieren
  _wkFocusIO = new IntersectionObserver(() => {
    const sr = sheet.getBoundingClientRect();
    const mid = sr.top + sr.height / 2;
    const els = [...wrap.querySelectorAll('.ex-card')];
    const rects = els.map(c => {
      const r = c.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    });
    const idx = WorkoutFocus.pickFocused(rects, mid);
    const li = idx >= 0 ? +els[idx].dataset.li : -1;
    if (li !== _wkFocusLi) { _wkFocusLi = li; _wkFocusApply(); }
  }, { root: sheet, threshold: [0, .25, .5, .75, 1] });
  cards.forEach(c => _wkFocusIO.observe(c));
}
```

- [ ] **Step 3: Klassen beim Rendern mitgeben** — in `renderLogCards()`:

Vor der `document.getElementById('log-cards').innerHTML = wkLogs.map(...)`-Zeile (18177):

```js
  const _fUnit = (_wkFocusLi >= 0 && _wkFocusLi < wkLogs.length && typeof WorkoutFocus !== 'undefined')
    ? WorkoutFocus.focusUnitOf(wkLogs, _wkFocusLi) : [];
```

Im Karten-Template (Zeile 18186) die Klassenliste erweitern — aus

```js
    return `${ssConnector}<div class="ex-card${ssLinked ? ' ss-linked' : ''}${li === _auraLi ? ' coach-aura' : ''}" data-li="${li}">
```

wird

```js
    return `${ssConnector}<div class="ex-card${ssLinked ? ' ss-linked' : ''}${li === _auraLi ? ' coach-aura' : ''}${_fUnit.length && !_fUnit.includes(li) ? ' dimmed' : ''}" data-li="${li}">
```

Am Ende von `renderLogCards()` (nach `_attachSwipeToDelete();`, Zeile 18239):

```js
  try { _wkFocusObserve(); } catch(_) {}
```

- [ ] **Step 4: Snap während Gesten aus**

In `wkDragStart` (14616): direkt am Funktionsanfang (nach den bestehenden Guard-Zeilen)

```js
  const _sheetEl = document.querySelector('#ov-wk .sheet');
  if (_sheetEl) _sheetEl.classList.add('snap-off');
```

und im End-Handler des Drags (die Funktion, die bei `mouseup`/`touchend` aufräumt — in `wkDragStart` suchen, dort wo die Listener entfernt werden):

```js
  if (_sheetEl) _sheetEl.classList.remove('snap-off');
```

In `_attachSwipeToDelete` (18250): in `onStart` nach `card.classList.add('is-swiping');`

```js
      const sheetEl = document.querySelector('#ov-wk .sheet');
      if (sheetEl) sheetEl.classList.add('snap-off');
```

und in `_resetCard` (18271) sowie im erfolgreichen Lösch-Zweig:

```js
      const sheetEl = document.querySelector('#ov-wk .sheet');
      if (sheetEl) sheetEl.classList.remove('snap-off');
```

- [ ] **Step 5: Regressions-Check**

Run: `npm test`
Expected: alle Tests grün (Fokus-Schicht hat keine Node-Tests — DOM; Optik wird in Task 5 im Simulator verifiziert).

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(training): Scroll-Snap + Fokus-Optik — aktuelle Uebung rastet ein, Rest gedimmt"
```

---

### Task 3: Auto-Weiter nach letztem Satz

**Files:**
- Modify: `index.html` — `toggleSetDone` (18537ff) und neuer Helfer daneben

**Interfaces:**
- Consumes: `WorkoutFocus.focusUnitOf`, `WorkoutFocus.nextOpenUnit` (Task 1), `wkLogs`, `.snap-off`-Konvention (Task 2).
- Produces: `_wkAutoAdvance(li)` — von `toggleSetDone` gerufen; sonst nirgends.

- [ ] **Step 1: Helfer einfügen** — direkt VOR `function toggleSetDone(li,si)` (18537):

```js
/* ── Auto-Weiter: letzter offener Satz der Einheit abgehakt → naechste offene
   Uebung ins Bild. 600 ms Verzoegerung, damit der Haken-Moment sichtbar bleibt.
   Unterdrueckt, wenn ueber dem Training ein Overlay liegt (Wheel, Satz-Typ,
   Untersheets) oder der Finger noch auf dem Sheet ist. ── */
let _wkAdvTimer = null;
let _wkSheetTouching = false;
(function () {
  const sheet = document.querySelector('#ov-wk .sheet');
  if (!sheet) return;
  sheet.addEventListener('touchstart', () => { _wkSheetTouching = true; }, { passive: true });
  sheet.addEventListener('touchend',   () => { _wkSheetTouching = false; }, { passive: true });
  sheet.addEventListener('touchcancel',() => { _wkSheetTouching = false; }, { passive: true });
})();

function _wkAutoAdvance(li) {
  if (typeof WorkoutFocus === 'undefined') return;
  const unit = WorkoutFocus.focusUnitOf(wkLogs, li);
  if (!unit.length) return;
  const stillOpen = unit.some(i => (wkLogs[i].sets || []).some(s => !s.done));
  if (stillOpen) return;                                  // Einheit noch nicht fertig
  const target = WorkoutFocus.nextOpenUnit(wkLogs, li);
  if (target == null) return;                             // alles fertig → Finish bleibt, kein Scroll
  clearTimeout(_wkAdvTimer);
  _wkAdvTimer = setTimeout(() => {
    if (document.querySelector('.ov.on:not(#ov-wk)')) return;  // Wheel/Satz-Typ/Untersheet offen
    if (_wkSheetTouching) return;                              // Nutzer scrollt/beruehrt gerade
    const card = document.querySelector(`#log-cards .ex-card[data-li="${target}"]`);
    if (!card) return;
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, 600);
}
```

Hinweis: `block:'start'` statt `'center'` — konsistent mit `scroll-snap-align:start`, sonst zieht der Snap nach dem Smooth-Scroll nach (Spec-Formulierung „in die Mitte" meint: auf die Bühne holen).

- [ ] **Step 2: Hook in `toggleSetDone`**

In `toggleSetDone` innerhalb von `if (next) { ... }` NACH dem `_coachMicroReact`-try-catch (~18550) ergänzen:

```js
    try { _wkAutoAdvance(li); } catch(_) {}
```

- [ ] **Step 3: Regressions-Check**

Run: `npm test`
Expected: alle grün.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(training): Auto-Weiter — nach letztem Satz gleitet die naechste offene Uebung ins Bild"
```

---

### Task 4: Version, Changelog, I18N

**Files:**
- Modify: `index.html` — `APP_VERSION` (7840), `CHANGELOG` (9056), `I18N_EN`-Block (bei den Changelog-Übersetzungen, ~8656); `sw.js:2` (`CACHE`)

**Interfaces:**
- Consumes: nichts Neues.
- Produces: Version `gymtrack-v202607310011` in beiden Dateien; Changelog-Key `cl-2026-07-31-fokus-modus`.

- [ ] **Step 1: Version bumpen**

`index.html:7840`: `const APP_VERSION = 'gymtrack-v202607310011';`
`sw.js:2`: `const CACHE = 'gymtrack-v202607310011';`

- [ ] **Step 2: Changelog-Eintrag** — in `CHANGELOG` (9056) als NEUESTER Eintrag ganz oben (vor `'cl-2026-07-29-coach-stimme'`):

```js
  'cl-2026-07-31-fokus-modus': {
    label: '31.07.2026 · Training: Fokus auf deine aktuelle Übung',
    items: [
      'Beim Scrollen rastet die Übung, an der du gerade dran bist, sanft ein — alles andere tritt in den Hintergrund',
      'Letzter Satz abgehakt? Die nächste offene Übung gleitet von selbst ins Bild',
      'Supersätze bleiben dabei als Paar im Fokus',
    ]
  },
```

- [ ] **Step 3: I18N_EN-Einträge** — im I18N-Block bei den anderen Changelog-Übersetzungen (~8656) ergänzen:

```js
  /* Changelog: Fokus-Modus (31.07.2026) */
  'Training: Fokus auf deine aktuelle Übung':'Workout: focus on your current exercise',
  'Beim Scrollen rastet die Übung, an der du gerade dran bist, sanft ein — alles andere tritt in den Hintergrund':'While scrolling, the exercise you are on gently snaps into place — everything else fades back',
  'Letzter Satz abgehakt? Die nächste offene Übung gleitet von selbst ins Bild':'Last set checked off? The next open exercise glides into view on its own',
  'Supersätze bleiben dabei als Paar im Fokus':'Supersets stay in focus as a pair',
```

- [ ] **Step 4: Build + Tests**

```bash
npm run build && npx cap sync ios && npm test
```
Expected: Build ok, cap sync ok, alle Tests grün.

- [ ] **Step 5: Commit**

```bash
git add index.html sw.js
git commit -m "chore: Version v202607310011 + Changelog/I18N fuer den Fokus-Modus"
```

---

### Task 5: Simulator-Verifikation, Merge nach main, Push

**Files:**
- Keine Quelländerungen (nur Verifikation + Git).

**Interfaces:**
- Consumes: fertiger Stand aus Task 1–4.
- Produces: Screenshots als Beleg, `main` enthält Merge-Branch + Feature, Push erledigt.

- [ ] **Step 1: Im Simulator bauen und starten**

```bash
~/.claude/sim-native.sh /Users/lennywolter/Desktop/Claude/gymtrack "iPhone 17"
```
Expected: `** BUILD SUCCEEDED **` + App startet.

- [ ] **Step 2: Manuell verifizieren (Simulator-Tools, Screenshots als Beleg)**
  - Training mit ≥ 3 Übungen starten → scrollen: Einrasten spürbar, genau eine Karte (bzw. Superset-Paar) hell, Rest gedimmt.
  - Alle Sätze einer Übung abhaken → nach ~0,6 s gleitet die nächste offene Übung ins Bild; mit offenem Wheel passiert nichts.
  - Übung per Handle verschieben und eine per Swipe löschen → kein Snap-Kampf, kein Fokus-Flackern.
  - Notizfeld und „Training abschließen" unten normal erreichbar.
  - 1-Übung-Training: nichts gedimmt.

- [ ] **Step 3: Merge nach main + Push**

```bash
git checkout main && git merge --no-ff merge/store168-into-main -m "merge: Store-Bugfixes 1.3.68 + Fokus-Modus im Training" && git push origin main
```
Expected: Merge ohne Konflikte (main hat sich seit Branch-Abzweig nicht bewegt — sonst stoppen und melden), Push ok.

- [ ] **Step 4: Abschluss-Report an den Nutzer**

Enthält: Screenshot-Belege, App-Store-Release-Notes-Vorschlag (DE+EN, aus den Changelog-Items), Hinweis, dass „Hochladen" den vollen Store-Build auslöst.
