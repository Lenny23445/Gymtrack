# Trainings-Kopf Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zeit und Pause werden im aktiven Training EINE klebende 44px-Leiste; die Glaskarte `.timer-bar`, der Pausenbalken `.rest-bar` und die Herzfrequenz verschwinden.

**Architecture:** Reine Zahlenlogik wandert in ein neues, unter `node --test` pruefbares Modul `js/workout-bar.js` (Muster wie `js/workout-focus.js`). Das DOM bleibt in `index.html`: `#wk-bar` zieht als erste Zeile in den vorhandenen Klebe-Stapel `#wk-sticky`, die Pausensteuerung wandert in dieselbe Zeile, `#rest-timer-val` bleibt erhalten, damit der Sekundentakt unveraendert weiterschreibt.

**Tech Stack:** Single-File-PWA (`index.html`: CSS + HTML + JS), Vanilla JS, `node --test`, Capacitor/iOS-Simulator, `build.js` kopiert Assets nach `www/`.

**Spec:** `docs/superpowers/specs/2026-08-01-trainings-kopf-redesign-design.md`

## Global Constraints

- **Keine Emojis in der Oberflaeche.** Neue Symbole als inline-`<svg>` mit `stroke="currentColor"`.
- **Jeder neue Nutzertext braucht einen `I18N_EN`-Eintrag** (oder eine `I18N_RX`-Regel bei dynamischen Teilen).
- **`APP_VERSION` in `index.html` und `CACHE` in `sw.js` muessen identisch sein** — Format `gymtrack-vJJJJMMTTNNNN`. Aktuell `gymtrack-v202608020022`.
- **Neue Web-Assets muessen in die Kopierliste `build.js:6`**, sonst fehlen sie im nativen Build.
- **Kein `backdrop-filter` auf klebenden Elementen** — WebKit zieht dort sichtbare Kachelkanten.
- **User-Text im `innerHTML` immer durch `esc()`.**
- Nach der Umsetzung: committen und nach GitHub pushen (fuer gymtrack ohne Rueckfrage erwuenscht).

---

### Task 1: Modul `js/workout-bar.js` mit den beiden Zahlen

**Files:**
- Create: `js/workout-bar.js`
- Test: `test/workout-bar.test.js`
- Modify: `build.js:6` (Kopierliste), `index.html` (Skript-Einbindung)

**Interfaces:**
- Consumes: nichts.
- Produces: globales `WorkoutBar` mit
  - `setProgress(logs)` → `{done: number, total: number}`; `logs` = `wkLogs`, also `[{sets:[{done:bool}]}]`.
  - `restFraction(rest, total)` → `number` zwischen 0 und 1.

- [ ] **Step 1: Testdatei schreiben**

```js
/* GymTrack — Tests fuer js/workout-bar.js (Zahlen der Trainings-Leiste) */
const test = require('node:test');
const assert = require('node:assert');
const B = require('../js/workout-bar.js');

const log = (...done) => ({ sets: done.map(d => ({ done: d })) });

test('setProgress: leere Liste ergibt 0 von 0', () => {
  assert.deepStrictEqual(B.setProgress([]), { done: 0, total: 0 });
});

test('setProgress: zaehlt ueber alle Uebungen', () => {
  assert.deepStrictEqual(B.setProgress([log(true, false), log(true, true, false)]),
                         { done: 3, total: 5 });
});

test('setProgress: Aufwaermsaetze zaehlen mit — es ist eine Anzeige', () => {
  const logs = [{ sets: [{ done: true, type: 'warmup' }, { done: false }] }];
  assert.deepStrictEqual(B.setProgress(logs), { done: 1, total: 2 });
});

test('setProgress: haelt Unsinn aus', () => {
  assert.deepStrictEqual(B.setProgress(null), { done: 0, total: 0 });
  assert.deepStrictEqual(B.setProgress([{}, { sets: null }]), { done: 0, total: 0 });
});

test('restFraction: verbleibender Anteil, geklemmt', () => {
  assert.strictEqual(B.restFraction(90, 90), 1);
  assert.strictEqual(B.restFraction(45, 90), 0.5);
  assert.strictEqual(B.restFraction(0, 90), 0);
  assert.strictEqual(B.restFraction(120, 90), 1);
  assert.strictEqual(B.restFraction(-5, 90), 0);
});

test('restFraction: ohne sinnvolle Gesamtzeit 0', () => {
  assert.strictEqual(B.restFraction(30, 0), 0);
  assert.strictEqual(B.restFraction(30, -1), 0);
  assert.strictEqual(B.restFraction(30, null), 0);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestaetigen**

Run: `node --test test/workout-bar.test.js`
Erwartet: FAIL — `Cannot find module '../js/workout-bar.js'`

- [ ] **Step 3: Modul schreiben**

```js
/* GymTrack — Zahlen der Trainings-Leiste (pure Logik, kein DOM)

   Zwei Helfer fuer #wk-bar in index.html:
   - setProgress: wie viele Saetze der Einheit sind abgehakt.
   - restFraction: welcher Anteil der Pause laeuft noch.
   Kein DOM und keine App-Globals — Eingaben kommen als Argumente herein,
   damit alles unter node --test pruefbar ist (Muster wie js/workout-focus.js). */
(function (root) {
  'use strict';

  /* Aufwaermsaetze zaehlen hier BEWUSST mit. Bei der Progression tun sie das
     nicht (siehe getSuggestedWeight), aber die Leiste zeigt Arbeit an, und
     ein Aufwaermsatz ist Arbeit. */
  function setProgress(logs) {
    let done = 0, total = 0;
    (Array.isArray(logs) ? logs : []).forEach(l => {
      const sets = l && Array.isArray(l.sets) ? l.sets : [];
      total += sets.length;
      sets.forEach(s => { if (s && s.done) done++; });
    });
    return { done: done, total: total };
  }

  /* Anteil der NOCH laufenden Pause: 1 am Anfang, 0 am Ende. Ohne sinnvolle
     Gesamtzeit lieber 0 als NaN — der Faden waere sonst unsinnig breit. */
  function restFraction(rest, total) {
    const t = Number(total), r = Number(rest);
    if (!isFinite(t) || t <= 0 || !isFinite(r)) return 0;
    return Math.min(1, Math.max(0, r / t));
  }

  const API = { setProgress: setProgress, restFraction: restFraction };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.WorkoutBar = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Test laufen lassen, gruen bestaetigen**

Run: `node --test test/workout-bar.test.js`
Erwartet: PASS, 6 Tests.

- [ ] **Step 5: In die Kopierliste eintragen**

In `build.js:6` die Liste `files` erweitern — `'js/workout-bar.js'` direkt hinter `'js/workout-focus.js'`. Ohne diesen Eintrag fehlt die Datei im nativen Build und `WorkoutBar` ist dort `undefined`.

- [ ] **Step 6: Skript in index.html einbinden**

Run: `grep -n "workout-focus.js" index.html`
Neben der gefundenen `<script src="js/workout-focus.js">`-Zeile dieselbe Form fuer `js/workout-bar.js` ergaenzen.

- [ ] **Step 7: Commit**

```bash
git add js/workout-bar.js test/workout-bar.test.js build.js index.html
git commit -m "feat(training): Modul workout-bar fuer Satz- und Pausenzahlen"
```

---

### Task 2: Herzfrequenz ersatzlos entfernen

**Files:**
- Modify: `index.html` — `#wk-hr` (Markup ~7416), `.wk-hr`-CSS (~495–497 und die Nennung `.wk-hr b,` in der `font-variant-numeric`-Liste ~4805), `_pollHeartRate`/`_startHrPolling`/`_stopHrPolling` (~10477–10500) und deren vier Aufrufstellen.

**Interfaces:**
- Consumes: nichts.
- Produces: nichts. `_saveWorkoutToHealthKit` und `S.healthKitEnabled` bleiben unangetastet.

- [ ] **Step 1: Aufrufstellen auflisten**

Run: `grep -n "_startHrPolling\|_stopHrPolling\|_pollHeartRate\|wk-hr" index.html`
Erwartet: Markup-Zeile, CSS-Zeilen, drei Funktionen, vier Aufrufe (in `startActive`, im Restore des aktiven Trainings, in `finishWk`, in `cancelWk`).

- [ ] **Step 2: Alles entfernen**

Markup-Zeile `<div class="wk-hr" id="wk-hr" …>` loeschen, den `.wk-hr`-CSS-Block loeschen, `.wk-hr b,` aus der `font-variant-numeric`-Aufzaehlung streichen, die drei Funktionen samt Kommentarkopf „HERZFREQUENZ (Apple Watch via HealthKit)" und `let _hrInt = null;` loeschen, die vier Aufrufzeilen loeschen.

- [ ] **Step 3: Nichts uebrig?**

Run: `grep -n "_hrInt\|_pollHeartRate\|_startHrPolling\|_stopHrPolling\|wk-hr" index.html`
Erwartet: keine Ausgabe.

- [ ] **Step 4: HealthKit-Speichern noch da?**

Run: `grep -n "_saveWorkoutToHealthKit\|healthKitEnabled" index.html | head`
Erwartet: Treffer vorhanden — Trainings landen weiter in Apple Health.

- [ ] **Step 5: Tests laufen lassen**

Run: `npm test`
Erwartet: alle Tests gruen (`test/index-konstanten.test.js` faellt an, falls beim Loeschen eine benutzte Konstante mitging).

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "refactor(training): Herzfrequenz-Anzeige und 15-s-Polling entfernt"
```

---

### Task 3: Neue Leiste `#wk-bar` — Markup und CSS

**Files:**
- Modify: `index.html` — `.sh-head` von `#ov-wk` (~7380–7385), `.timer-bar`-Block (~7412–7423), `#wk-sticky` (~7424–7435), CSS `.timer-bar`/`.timer-v`/`.timer-l` (~1775–1791), `#wk-sticky`/`.rest-bar*`/`@keyframes restPulse` (~3926–3945).

**Interfaces:**
- Consumes: nichts aus Task 1 (Verdrahtung folgt in Task 4).
- Produces: DOM-Knoten `#wk-done-top`, `#wk-bar`, `#timer-v`, `#wk-setprog`, `#wk-rest`, `#rest-timer-val`, `#wk-bar-prog`.

- [ ] **Step 1: Kopfzeile umbauen**

`.sh-head` von `#ov-wk` bekommt den Fertig-Knopf; sichtbar wird er erst in Schritt 2 des Trainings (Task 4 schaltet ihn):

```html
<div class="sh-head">
  <div class="wk-head-title-row">
    <h2 id="wk-title">Training</h2>
  </div>
  <button class="btn btn-acc btn-sm" id="wk-done-top" style="display:none;width:auto;padding:8px 16px;margin-right:8px" onclick="finishWk()">Fertig ✓</button>
  <button class="x-btn" onclick="closeOv('ov-wk')">✕</button>
</div>
```

- [ ] **Step 2: Zeitkarte durch die Leiste ersetzen**

Der Block von `<div class="timer-bar">` bis zum Ende des alten `#rest-timer-bar` wird ersetzt; `#wk-bar` steht als erste Zeile IN `#wk-sticky`:

```html
<div id="wk-sticky">
  <div id="wk-bar">
    <div class="wkb-row">
      <span class="wkb-time">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        <b id="timer-v">00:00</b>
      </span>
      <span class="wkb-right">
        <span id="wk-setprog">0/0 Sätze</span>
        <span id="wk-rest" style="display:none">
          <span class="wkb-rest-lbl">Pause</span>
          <button class="wkb-adj" onclick="adjustRest(-15)">−15</button>
          <b id="rest-timer-val">1:30</b>
          <button class="wkb-adj" onclick="adjustRest(15)">+15</button>
          <button class="wkb-skip" onclick="skipRest()">✕</button>
        </span>
      </span>
    </div>
    <div id="wk-bar-prog" class="wkb-prog"><i style="width:0%"></i></div>
  </div>
  <div id="wk-coach-bar" class="coach-bar" style="display:none"></div>
</div>
```

Der `Abbrechen`-Knopf oben faellt ersatzlos weg; `Training abbrechen` am Listenende bleibt.

- [ ] **Step 3: CSS ersetzen**

`.timer-bar`, `.timer-bar::after`, `.timer-v`, `.timer-l`, `.rest-bar`, `.rest-bar-lbl`, `.rest-bar-controls`, `.rest-bar-val`, `.rest-adj-btn`, `.rest-bar-skip` und `@keyframes restPulse` loeschen. Dafuer:

```css
/* Trainings-Leiste: EINE klebende Zeile fuer Zeit und Pause. Feste Hoehe in
   BEIDEN Zustaenden — sonst aendert jeder Pausenstart die Hoehe von
   #wk-sticky, und WebKit rechnet die Rastpunkte des ganzen Blattes neu.
   Deckender Grund, KEIN backdrop-filter: Glas auf klebenden Elementen hat
   hier schon zweimal Kanten quer durch den Inhalt gezogen. */
#wk-bar{
  background:var(--card);border:1px solid var(--gl-bdr);border-radius:14px;
  margin:0 0 8px;overflow:hidden;
}
.wkb-row{display:flex;align-items:center;justify-content:space-between;gap:10px;height:42px;padding:0 12px}
.wkb-time{display:flex;align-items:center;gap:6px;color:var(--green);flex-shrink:0}
.wkb-time svg{width:15px;height:15px}
.wkb-time b{font-size:17px;font-weight:700;font-variant-numeric:tabular-nums}
.wkb-right{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text2);min-width:0}
#wk-rest{display:flex;align-items:center;gap:7px;color:var(--acc)}
#wk-rest b{font-size:16px;font-weight:800;font-variant-numeric:tabular-nums;min-width:44px;text-align:center}
.wkb-rest-lbl{font-size:12px;font-weight:700}
.wkb-adj,.wkb-skip{
  font-size:12px;font-weight:700;color:var(--acc);
  background:rgba(var(--acc-rgb),.12);border:1px solid rgba(var(--acc-rgb),.28);
  border-radius:14px;padding:3px 8px;cursor:pointer;
}
.wkb-adj:active,.wkb-skip:active{background:rgba(var(--acc-rgb),.26)}
/* 2px-Faden statt Pulsieren: er zeigt den Ablauf, ohne zu blinken. */
.wkb-prog{height:2px;background:transparent}
.wkb-prog i{display:block;height:100%;background:var(--acc);transition:width .25s linear}
```

- [ ] **Step 4: Coach-Leiste flach machen**

Im `.coach-bar`-Block (Suche: `grep -n "^.coach-bar{" index.html`) `padding:10px 13px` auf `padding:7px 12px` und `margin:0 0 10px` auf `margin:0 0 8px` setzen, `border-radius:16px` auf `14px` — damit sie zur neuen Leiste passt und auf rund 32px kommt. `transition`, `.coach-bar.is-off` und der per JS gesetzte Inline-`height` bleiben unangetastet: `_coachBarAnimate()` rechnet die Hoehe zur Laufzeit aus, ein fester `height`-Wert im CSS wuerde die Blende brechen.

- [ ] **Step 5: Nichts Verwaistes uebrig?**

Run: `grep -n "timer-bar\|rest-bar\|restPulse\|timer-l" index.html`
Erwartet: nur noch der Treffer in `_wkStops` (`#wk-step2 .timer-bar`) — den raeumt Task 4 ab.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(training): schlanke Kopfleiste statt Zeitkarte und Pausenbalken"
```

---

### Task 4: Verdrahtung — Satzfortschritt, Pausenanzeige, Halte

**Files:**
- Modify: `index.html` — `_wkStops` (~19277), `startActive` (~18985), Deklaration `let _restInt …` (~19720), `startRestTimer`/`_updRest` (~19827–19895), `skipRest` (~19879), `adjustRest` (~19887), `renderLogCards` (~19532), `toggleSetDone` (~19944), `addSet` (~20008), `delSet` (~20019), `finishWk`, `cancelWk`.

**Interfaces:**
- Consumes: `WorkoutBar.setProgress(logs)` → `{done,total}`, `WorkoutBar.restFraction(rest,total)` → `0…1` aus Task 1; die DOM-Knoten aus Task 3.
- Produces: `_wkBarRender()` — zeichnet Ruhe- oder Pausenzustand der Leiste neu.

- [ ] **Step 1: Ersten Halt entfernen**

In `_wkStops()` die Zeilen `const kopf = sheet.querySelector('#wk-step2 .timer-bar');` und `if (kopf) stops.push(kopf);` loeschen. Halte sind ab jetzt Uebungskarten + `#wk-note`. Den Kommentarkopf anpassen: „Die Halte sind: Uebung 1 → Uebung 2 → … → Abschluss."

- [ ] **Step 2: Gesamtdauer der Pause merken**

Deklaration erweitern:

```js
let _restInt = null, _restSecs = 0, _restEndTs = 0, _restSmart = false, _restTotal = 0;
```

In `startRestTimer` direkt nach `_restEndTs = Date.now() + _restSecs * 1000;`:

```js
  _restTotal = _restSecs;   // Bezugsgroesse fuer den Fortschrittsfaden
```

In `adjustRest` direkt nach `_restSecs = Math.max(0, _restSecs + delta);`:

```js
  _restTotal = Math.max(_restTotal, _restSecs);   // "+15" darf den Faden nicht ueber 100 % treiben
```

- [ ] **Step 3: `_wkBarRender()` schreiben**

Direkt nach `_updRest()` einfuegen:

```js
/* Zeichnet die Trainings-Leiste. Zwei Zustaende, GLEICHE Hoehe: laeuft eine
   Pause, zeigt die rechte Seite sie samt Faden; sonst steht dort der
   Satzfortschritt. Nur der Inhalt wechselt — die Hoehe von #wk-sticky bleibt,
   damit die Rastpunkte des Blattes nicht neu gerechnet werden muessen. */
function _wkBarRender() {
  const rest = document.getElementById('wk-rest');
  const prog = document.querySelector('#wk-bar-prog i');
  const sp   = document.getElementById('wk-setprog');
  if (!rest || !sp) return;
  const laeuft = _restInt != null && _restSecs > 0;
  rest.style.display = laeuft ? '' : 'none';
  sp.style.display   = laeuft ? 'none' : '';
  if (laeuft) {
    const lbl = rest.querySelector('.wkb-rest-lbl');
    if (lbl) lbl.textContent = _restSmart ? 'Pause · Auto' : 'Pause';
    if (prog) prog.style.width = (WorkoutBar.restFraction(_restSecs, _restTotal) * 100) + '%';
  } else {
    if (prog) prog.style.width = '0%';
    const p = WorkoutBar.setProgress(typeof wkLogs !== 'undefined' ? wkLogs : []);
    sp.textContent = p.done + '/' + p.total + ' Sätze';
  }
}
```

- [ ] **Step 4: Aufrufer setzen**

- Am Ende von `_updRest()`: `_wkBarRender();`
- In `startRestTimer` nach dem ersten `_updRest();`: `_wkBarRender();`
- In `skipRest()` und im Ablauf-Zweig des Intervalls (`if (remaining <= 0)`): die Zeilen, die `rest-timer-bar` auf `display:none` setzen, durch `_wkBarRender();` ersetzen.
- Am Ende von `renderLogCards()`, `toggleSetDone()`, `addSet()`, `delSet()` je `try { _wkBarRender(); } catch(_) {}`.
- In `startActive()` neben `document.getElementById('wk-step2').style.display = '';`:

```js
  const _dt = document.getElementById('wk-done-top'); if (_dt) _dt.style.display = '';
  try { _wkBarRender(); } catch(_) {}
```

- In `finishWk()` und `cancelWk()` je:

```js
  const _dt = document.getElementById('wk-done-top'); if (_dt) _dt.style.display = 'none';
```

- [ ] **Step 5: Alte Referenzen pruefen**

Run: `grep -n "rest-timer-bar\|rest-bar-lbl\|timer-bar" index.html`
Erwartet: keine Ausgabe.

- [ ] **Step 6: Tests laufen lassen**

Run: `npm test`
Erwartet: alle Tests gruen.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat(training): Leiste zeigt Satzfortschritt und Pause, erster Halt entfaellt"
```

---

### Task 5: Uebersetzung, Version, Abnahme im Simulator

**Files:**
- Modify: `index.html` (`I18N_EN`, `I18N_RX`, `APP_VERSION`), `sw.js` (`CACHE`)

**Interfaces:**
- Consumes: die Texte aus Task 3/4 (`Pause`, `Pause · Auto`, `Fertig ✓`, `N/M Sätze`).
- Produces: nichts.

- [ ] **Step 1: Uebersetzungen eintragen**

Run: `grep -n "const I18N_EN\|const I18N_RX" index.html`
In `I18N_EN` ergaenzen, sofern noch nicht vorhanden: `'Pause': 'Rest'`, `'Pause · Auto': 'Rest · Auto'`. In `I18N_RX` im Stil der bestehenden Eintraege:

```js
  [/^(\d+)\/(\d+) Sätze$/, '$1/$2 sets'],
```

- [ ] **Step 2: Uebersetzung pruefen**

Run: `npm test`
Erwartet: gruen, insbesondere `test/coach-i18n.test.js` — es liest `I18N_RX` direkt aus `index.html`, eine kaputte Regel faellt dort auf.

- [ ] **Step 3: Version hochziehen**

`APP_VERSION` in `index.html` und `CACHE` in `sw.js` auf denselben neuen Wert setzen (laufende Nummer +1 gegenueber `gymtrack-v202608020022`).

- [ ] **Step 4: Im Simulator ansehen**

Run: `~/.claude/sim-native.sh /Users/lennywolter/Desktop/Claude/gymtrack "iPhone 17"`
Beweis: `xcrun simctl io "iPhone 17" screenshot /tmp/wkbar.png`

Von Hand pruefen: Ruhezustand zeigt „0/12 Sätze"; Satz abhaken laesst die Zahl steigen; laufende Pause wechselt die rechte Seite und der Faden schrumpft; `−15`/`+15`/`✕` wirken; Coach-Nachricht klappt auf und zu, ohne dass die Leiste springt; Training mit genau EINER Uebung ist bedienbar; Blaettern rastet weiter auf Uebungen.

- [ ] **Step 5: Commit und Push**

```bash
git add index.html sw.js
git commit -m "chore(training): Uebersetzungen und Version fuer die neue Kopfleiste"
git push origin main
```

- [ ] **Step 6: Release-Notiz melden**

Mini-Changelog an den Nutzer, z. B.: „Trainingsansicht aufgeraeumt: Zeit und Pause teilen sich jetzt eine schlanke Leiste, mehr Platz fuer die Uebung. Herzfrequenz-Anzeige entfernt."
