# KI-Coach-Fundament Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der KI-Coach bekommt ein Gedächtnis (Dossier), lernt aus angenommenen und ignorierten Vorschlägen (Aktions-Log) und beantwortet einfache Gym-Fragen lokal ohne LLM-Aufruf (Intent-Router).

**Architecture:** Drei voneinander unabhängige Einheiten als eigene Skriptdateien unter `js/`. Jede hängt sich an `window` und exportiert zusätzlich per CommonJS, damit sie ohne Bundler sowohl im Browser läuft als auch in Node-Tests importierbar ist. Keine Einheit greift auf globale App-Variablen zu — alle Daten kommen als Argument herein. Verdrahtet wird ausschließlich in `index.html`.

**Tech Stack:** Vanilla JS (kein Bundler), Node 22 mit eingebautem Test-Runner (`node --test`), Firebase Firestore (Web-SDK 10.13), Cloudflare Worker (`ai-worker/worker.js`), Capacitor 8 für iOS.

**Spec:** `docs/superpowers/specs/2026-07-27-ki-coach-fundament-design.md`

## Stand 28.07.2026 (Abschluss)

Task 1–8 umgesetzt, `npm test` 78/78 grün, Version auf `gymtrack-v202607280001`
gebumpt, Changelog-Eintrag `cl-2026-07-28-coach-gedaechtnis` drin, Worker mit den
`gtmem`-Prompts deployt (Version `4548b7a1`, 28.07.), Branch nach `main` gemerged.
Nachgezogen wurde außerdem, was der Plan offen gelassen hatte: `weekVolumeKg` im
Schnappschuss (Intent 7 war sonst tot), `logOutcome` in `finishWk` verdrahtet,
`_coachEval` vom Wheel-Commit auf `toggleSetDone` umgehängt.

**Offen — braucht Zugänge, die nur der Betreiber hat:**

1. Rules in der Firebase-Konsole veröffentlichen (Task 4, Step 2/4). Die Datei
   `firestore.rules` ist aktuell, die Konsole kennt den `coach`-Block noch nicht.
   Bis dahin schlägt der Dossier-Push in die Cloud mit `permission-denied` fehl;
   lokal funktioniert das Gedächtnis bereits.
2. Ende-zu-Ende im Chat prüfen (Task 8, Step 6) — braucht ein angemeldetes
   Premium-/Founder-Konto. Der Simulator-Lauf am 28.07. belegt nur Start und
   Rendern der App (Demo-Seed, nicht angemeldet).
3. Nutrition Labels in App Store Connect um Gesundheitsdaten erweitern (Spec Punkt 7).

## Global Constraints

- **Keine Emojis** in irgendeiner Ausgabe — weder in App-Texten, Prompts, Dossier-Inhalten noch Commit-Messages. Die App rendert Symbole als Inline-SVG. Der Worker filtert Emojis zusätzlich serverseitig.
- **Keine Dossier-Inhalte in Logs** — weder `console.log` in der App noch im Worker. Erlaubt sind Metadaten wie Eintragszahl und Länge.
- **Nutzertexte auf Deutsch**, englische Fassung über die bestehende `tr()`-Funktion in `index.html`.
- **Kein neues npm-Paket.** Der Test-Runner ist in Node 22 enthalten.
- **`S` ist tabu für Dossier-Daten.** Alles, was Einschränkungen enthält, liegt unter `gt_coachDossier:{uid}` in `localStorage`, nie in `S` und nie im Cloud-Backup-Doc `users/{uid}`.
- **Caps sind clientseitig bindend:** `limits`, `prefs`, `works` je höchstens 8 Einträge à 120 Zeichen, Dossier insgesamt höchstens 4000 Zeichen.
- **Nach jeder abgeschlossenen Task committen und pushen** (`git push origin HEAD`) — Projektregel für dieses Repo.
- **Version-Bump** in `index.html` und `sw.js` erst im Release-Schritt, nicht pro Task.

---

## File Structure

| Datei | Verantwortung |
| --- | --- |
| `js/coach-memory.js` (neu) | Dossier: Delta anwenden, Caps erzwingen, Verfall, Prompt-Form, Laden/Speichern, Löschen |
| `js/coach-log.js` (neu) | Aktions-Log: Ringpuffer, Annahme/Ignorierung, Drosselung, Aggregate |
| `js/coach-intent.js` (neu) | Intent-Router: Frage zu lokaler Antwort, rein funktional |
| `test/coach-memory.test.js` (neu) | Tests zu `coach-memory.js` |
| `test/coach-log.test.js` (neu) | Tests zu `coach-log.js` |
| `test/coach-intent.test.js` (neu) | Tests zu `coach-intent.js` |
| `index.html` (ändern) | Skripte einbinden, Kontext erweitern, `gtmem` verarbeiten, Router vorschalten, Log-Hooks, Kontolöschung, Auth-Wechsel |
| `sw.js` (ändern) | Neue Dateien in `SHELL`, `CACHE`-Version hoch |
| `build.js` (ändern) | Neue Dateien mit nach `www/` kopieren |
| `firestore.rules` (ändern) | Neuer `match`-Block für die Dossier-Subcollection |
| `ai-worker/worker.js` (ändern) | Dossier in den Chat-Prompt, `gtmem`-Anweisung, `limits`/`muted` im Live-Coach |
| `package.json` (ändern) | `test`-Skript |

**Warum eigene Dateien statt inline in `index.html`:** Die Datentrennungs-Regeln der Spec sind sicherheitsrelevant und brauchen echte Tests. Inline-Code in einer 26.000-Zeilen-HTML-Datei ist nicht testbar. Die drei Einheiten sind reine Logik ohne DOM-Zugriff und lassen sich sauber herauslösen, ohne den Rest der Datei anzufassen.

**Warum kein Zugriff auf globale App-Variablen:** `coach-intent.js` bekommt einen fertigen Datenschnappschuss übergeben statt `S`, `wkLogs` und Co. selbst zu lesen. Das macht die Einheit ohne Browser testbar und verhindert, dass sich der Router an interne Strukturen der App bindet.

---

## Task 1: Test-Harness und Dossier-Delta

**Files:**
- Create: `js/coach-memory.js`
- Create: `test/coach-memory.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: nichts
- Produces: `dossierEmpty()` liefert `{v:1, goal:null, limits:[], prefs:[], works:[], derived:{}, coachStats:{accepted:0, ignored:0, muted:[]}, tone:null, updatedAt:0}`; `dossierApplyDelta(dossier, delta, now)` liefert ein neues Dossier-Objekt (verändert das Eingabeobjekt nicht)

- [x] **Step 1: Test-Skript eintragen**

In `package.json` das `scripts`-Objekt ändern:

```json
  "scripts": {
    "build": "node build.js",
    "test": "node --test test/"
  },
```

- [x] **Step 2: Den fehlschlagenden Test schreiben**

Datei `test/coach-memory.test.js` anlegen:

```js
const test = require('node:test');
const assert = require('node:assert');
const M = require('../js/coach-memory.js');

const NOW = 1753600000000;

test('leeres Dossier hat die erwartete Form', () => {
  const d = M.dossierEmpty();
  assert.strictEqual(d.v, 1);
  assert.deepStrictEqual(d.limits, []);
  assert.deepStrictEqual(d.coachStats, { accepted: 0, ignored: 0, muted: [] });
});

test('Delta fuegt einen Eintrag mit clientseitigem Zeitstempel hinzu', () => {
  const d = M.dossierApplyDelta(M.dossierEmpty(), { add: { limits: ['Linke Schulter'] } }, NOW);
  assert.strictEqual(d.limits.length, 1);
  assert.strictEqual(d.limits[0].t, 'Linke Schulter');
  assert.strictEqual(d.limits[0].ts, NOW);
});

test('vom Modell geliefertes ts wird ignoriert', () => {
  const delta = { add: { limits: [{ t: 'Knie', ts: 9999999999999 }] } };
  const d = M.dossierApplyDelta(M.dossierEmpty(), delta, NOW);
  assert.strictEqual(d.limits[0].ts, NOW);
});

test('unbekannte Schluessel werden verworfen', () => {
  const d = M.dossierApplyDelta(M.dossierEmpty(), { add: { hack: ['x'] }, evil: 1 }, NOW);
  assert.strictEqual(d.hack, undefined);
  assert.strictEqual(d.evil, undefined);
});

test('Duplikate werden nicht doppelt aufgenommen', () => {
  let d = M.dossierApplyDelta(M.dossierEmpty(), { add: { limits: ['Linke Schulter'] } }, NOW);
  d = M.dossierApplyDelta(d, { add: { limits: ['  linke schulter  '] } }, NOW + 1000);
  assert.strictEqual(d.limits.length, 1);
});

test('hoechstens 8 Eintraege, aelteste fliegen raus', () => {
  let d = M.dossierEmpty();
  for (let i = 0; i < 12; i++) {
    d = M.dossierApplyDelta(d, { add: { prefs: ['Eintrag ' + i] } }, NOW + i);
  }
  assert.strictEqual(d.prefs.length, 8);
  assert.strictEqual(d.prefs[d.prefs.length - 1].t, 'Eintrag 11');
  assert.ok(!d.prefs.some(e => e.t === 'Eintrag 0'));
});

test('Eintraege werden auf 120 Zeichen gekuerzt', () => {
  const lang = 'x'.repeat(300);
  const d = M.dossierApplyDelta(M.dossierEmpty(), { add: { works: [lang] } }, NOW);
  assert.strictEqual(d.works[0].t.length, 120);
});

test('goal und tone nur aus erlaubten Werten', () => {
  let d = M.dossierApplyDelta(M.dossierEmpty(), { goal: 'Masse', tone: 'ruhig' }, NOW);
  assert.strictEqual(d.goal, 'Masse');
  assert.strictEqual(d.tone, 'ruhig');
  d = M.dossierApplyDelta(d, { tone: 'boesartig' }, NOW);
  assert.strictEqual(d.tone, 'ruhig');
});

test('Eingabe-Dossier wird nicht veraendert', () => {
  const orig = M.dossierEmpty();
  M.dossierApplyDelta(orig, { add: { limits: ['Test'] } }, NOW);
  assert.strictEqual(orig.limits.length, 0);
});

test('remove loescht einen Eintrag', () => {
  let d = M.dossierApplyDelta(M.dossierEmpty(), { add: { limits: ['Linke Schulter'] } }, NOW);
  d = M.dossierApplyDelta(d, { remove: { limits: ['Linke Schulter'] } }, NOW);
  assert.strictEqual(d.limits.length, 0);
});
```

- [x] **Step 3: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd /Users/lennywolter/Desktop/Claude/gymtrack && npm test`
Expected: FAIL mit `Cannot find module '../js/coach-memory.js'`

- [x] **Step 4: Minimale Implementierung**

Datei `js/coach-memory.js` anlegen:

```js
/* GymTrack — Coach-Dossier (Baustein 1)
   Reine Logik, kein DOM- und kein Firestore-Zugriff. Laeuft im Browser ueber
   window.CoachMemory und in Node-Tests ueber require(). */
(function (root) {
  'use strict';

  var LIST_KEYS = ['limits', 'prefs', 'works'];
  var MAX_ITEMS = 8;
  var MAX_LEN   = 120;
  var TONES     = ['ruhig', 'hart', 'analytisch'];
  var GOALS     = ['Masse', 'Kraft', 'Abnehmen', 'Fitness'];

  function dossierEmpty() {
    return {
      v: 1, goal: null,
      limits: [], prefs: [], works: [],
      derived: {},
      coachStats: { accepted: 0, ignored: 0, muted: [] },
      tone: null, updatedAt: 0
    };
  }

  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim(); }

  // Das Modell darf reine Strings ODER {t}-Objekte liefern. Der Zeitstempel
  // kommt IMMER von hier — ein vom Modell geliefertes ts wird verworfen, sonst
  // koennte sich ein Eintrag in die Zukunft datieren und den Verfall aushebeln.
  function toEntry(raw, now) {
    var text = (raw && typeof raw === 'object') ? raw.t : raw;
    text = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (!text) return null;
    return { t: text.slice(0, MAX_LEN), ts: now };
  }

  function dossierApplyDelta(dossier, delta, now) {
    var d = JSON.parse(JSON.stringify(dossier || dossierEmpty()));
    if (!delta || typeof delta !== 'object') return d;
    now = now || Date.now();

    var add = (delta.add && typeof delta.add === 'object') ? delta.add : {};
    LIST_KEYS.forEach(function (key) {
      var incoming = Array.isArray(add[key]) ? add[key] : [];
      var list = Array.isArray(d[key]) ? d[key] : [];
      incoming.forEach(function (raw) {
        var e = toEntry(raw, now);
        if (!e) return;
        var dup = list.findIndex(function (x) { return norm(x.t) === norm(e.t); });
        if (dup >= 0) { list[dup].ts = now; return; }   // bekannt: nur auffrischen
        list.push(e);
      });
      if (list.length > MAX_ITEMS) list = list.slice(list.length - MAX_ITEMS);
      d[key] = list;
    });

    var rm = (delta.remove && typeof delta.remove === 'object') ? delta.remove : {};
    LIST_KEYS.forEach(function (key) {
      var drop = Array.isArray(rm[key]) ? rm[key].map(norm) : [];
      if (!drop.length) return;
      d[key] = (d[key] || []).filter(function (x) { return drop.indexOf(norm(x.t)) < 0; });
    });

    if (typeof delta.goal === 'string' && GOALS.indexOf(delta.goal) >= 0) d.goal = delta.goal;
    if (typeof delta.tone === 'string' && TONES.indexOf(delta.tone) >= 0) d.tone = delta.tone;

    d.v = 1;
    d.updatedAt = now;
    return d;
  }

  var API = { dossierEmpty: dossierEmpty, dossierApplyDelta: dossierApplyDelta,
              LIST_KEYS: LIST_KEYS, MAX_ITEMS: MAX_ITEMS, MAX_LEN: MAX_LEN,
              TONES: TONES, GOALS: GOALS };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachMemory = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [x] **Step 5: Tests laufen lassen, Erfolg bestätigen**

Run: `cd /Users/lennywolter/Desktop/Claude/gymtrack && npm test`
Expected: PASS, 10 Tests grün

- [x] **Step 6: Commit**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack
git add package.json js/coach-memory.js test/coach-memory.test.js
git commit -m "feat(coach): Dossier-Delta mit Caps und Whitelist + Test-Harness"
git push origin HEAD
```

---

## Task 2: Verfall und Prompt-Form

**Files:**
- Modify: `js/coach-memory.js`
- Modify: `test/coach-memory.test.js`

**Interfaces:**
- Consumes: `dossierEmpty()`, `dossierApplyDelta()` aus Task 1
- Produces: `dossierStale(dossier, now)` liefert Array der abgelaufenen `limits`-Texte; `dossierRefresh(dossier, text, stillValid, now)` liefert neues Dossier; `dossierForPrompt(dossier)` liefert einen String von höchstens 4000 Zeichen

- [x] **Step 1: Die fehlschlagenden Tests schreiben**

An das Ende von `test/coach-memory.test.js` anhängen:

```js
const TAG = 86400000;

test('Eintrag aelter als 42 Tage gilt als stale', () => {
  let d = M.dossierApplyDelta(M.dossierEmpty(), { add: { limits: ['Alte Schulter'] } }, NOW - 43 * TAG);
  assert.deepStrictEqual(M.dossierStale(d, NOW), ['Alte Schulter']);
});

test('frischer Eintrag ist nicht stale', () => {
  let d = M.dossierApplyDelta(M.dossierEmpty(), { add: { limits: ['Neue Schulter'] } }, NOW - 10 * TAG);
  assert.deepStrictEqual(M.dossierStale(d, NOW), []);
});

test('nur limits verfallen, prefs und works nicht', () => {
  let d = M.dossierApplyDelta(M.dossierEmpty(), { add: { prefs: ['Abends'] } }, NOW - 99 * TAG);
  assert.deepStrictEqual(M.dossierStale(d, NOW), []);
});

test('Bestaetigung erneuert den Zeitstempel', () => {
  let d = M.dossierApplyDelta(M.dossierEmpty(), { add: { limits: ['Schulter'] } }, NOW - 43 * TAG);
  d = M.dossierRefresh(d, 'Schulter', true, NOW);
  assert.strictEqual(d.limits[0].ts, NOW);
  assert.deepStrictEqual(M.dossierStale(d, NOW), []);
});

test('Verneinung entfernt den Eintrag', () => {
  let d = M.dossierApplyDelta(M.dossierEmpty(), { add: { limits: ['Schulter'] } }, NOW - 43 * TAG);
  d = M.dossierRefresh(d, 'Schulter', false, NOW);
  assert.strictEqual(d.limits.length, 0);
});

test('stale Eintrag gilt bis zur Antwort weiter', () => {
  let d = M.dossierApplyDelta(M.dossierEmpty(), { add: { limits: ['Schulter'] } }, NOW - 43 * TAG);
  assert.ok(M.dossierForPrompt(d).includes('Schulter'));
});

// KORRIGIERT nach Review (2026-07-27): die erste Fassung schickte 8x DENSELBEN
// String durch dossierApplyDelta. Der dedupliziert ueber die Normalform, es blieb
// EIN Eintrag pro Liste, der Prompt war 448 statt ~4000 Zeichen lang und der Test
// pruefte nichts. Jede Iteration braucht einen anderen Text, und die Laengen der
// Listen gehoeren mitgeprueft.
test('Prompt-Form bleibt unter 4000 Zeichen', () => {
  let d = M.dossierEmpty();
  for (let i = 0; i < 8; i++) {
    const suffix = String(i);
    d = M.dossierApplyDelta(d, {
      add: {
        limits: ['L'.repeat(120 - suffix.length) + suffix],
        prefs: ['P'.repeat(120 - suffix.length) + suffix],
        works: ['W'.repeat(120 - suffix.length) + suffix]
      }
    }, NOW + i);
  }
  assert.strictEqual(d.limits.length, 8);
  assert.strictEqual(d.prefs.length, 8);
  assert.strictEqual(d.works.length, 8);
  assert.ok(M.dossierForPrompt(d).length <= 4000);
});

test('leeres Dossier liefert leeren Prompt-String', () => {
  assert.strictEqual(M.dossierForPrompt(M.dossierEmpty()), '');
});
```

- [x] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `cd /Users/lennywolter/Desktop/Claude/gymtrack && npm test`
Expected: FAIL mit `M.dossierStale is not a function`

- [x] **Step 3: Implementierung ergänzen**

In `js/coach-memory.js` vor der Zeile `var API = {` einfügen:

```js
  var STALE_MS = 42 * 86400000;
  var PROMPT_MAX = 4000;

  // Nur Einschraenkungen verfallen. Vorlieben und was funktioniert hat altern
  // nicht — eine Schulterbeschwerde von vor einem halben Jahr blockiert sonst
  // dauerhaft alle Ueberkopfuebungen.
  function dossierStale(dossier, now) {
    now = now || Date.now();
    return ((dossier && dossier.limits) || [])
      .filter(function (e) { return (now - (e.ts || 0)) > STALE_MS; })
      .map(function (e) { return e.t; });
  }

  function dossierRefresh(dossier, text, stillValid, now) {
    var d = JSON.parse(JSON.stringify(dossier || dossierEmpty()));
    now = now || Date.now();
    var key = norm(text);
    if (stillValid) {
      (d.limits || []).forEach(function (e) { if (norm(e.t) === key) e.ts = now; });
    } else {
      d.limits = (d.limits || []).filter(function (e) { return norm(e.t) !== key; });
    }
    d.updatedAt = now;
    return d;
  }

  function dossierForPrompt(dossier) {
    var d = dossier || dossierEmpty();
    var out = [];
    if (d.goal) out.push('Ziel: ' + d.goal);
    if (d.tone) out.push('Bevorzugter Ton: ' + d.tone);
    if ((d.limits || []).length)
      out.push('Einschraenkungen (immer respektieren): ' + d.limits.map(function (e) { return e.t; }).join('; '));
    if ((d.prefs || []).length)
      out.push('Vorlieben: ' + d.prefs.map(function (e) { return e.t; }).join('; '));
    if ((d.works || []).length)
      out.push('Hat bei diesem Nutzer funktioniert: ' + d.works.map(function (e) { return e.t; }).join('; '));
    if (d.derived && Array.isArray(d.derived.stall) && d.derived.stall.length)
      out.push('Stagniert seit mehreren Einheiten: ' + d.derived.stall.join(', '));
    var muted = (d.coachStats && d.coachStats.muted) || [];
    if (muted.length)
      out.push('Diese Vorschlagstypen NICHT mehr vorschlagen: ' + muted.join(', '));
    return out.join('\n').slice(0, PROMPT_MAX);
  }
```

Und das `API`-Objekt erweitern:

```js
  var API = { dossierEmpty: dossierEmpty, dossierApplyDelta: dossierApplyDelta,
              dossierStale: dossierStale, dossierRefresh: dossierRefresh,
              dossierForPrompt: dossierForPrompt,
              LIST_KEYS: LIST_KEYS, MAX_ITEMS: MAX_ITEMS, MAX_LEN: MAX_LEN,
              TONES: TONES, GOALS: GOALS, STALE_MS: STALE_MS };
```

- [x] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `cd /Users/lennywolter/Desktop/Claude/gymtrack && npm test`
Expected: PASS, 18 Tests grün

- [x] **Step 5: Commit**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack
git add js/coach-memory.js test/coach-memory.test.js
git commit -m "feat(coach): Verfall von Einschraenkungen nach 42 Tagen + Prompt-Form"
git push origin HEAD
```

---

## Task 3: Uid-gekoppelte Persistenz

**Files:**
- Modify: `js/coach-memory.js`
- Modify: `test/coach-memory.test.js`

**Interfaces:**
- Consumes: alles aus Task 1 und 2
- Produces: `dossierKey(uid)` liefert `'gt_coachDossier:' + uid`; `dossierLoad(store, uid)` liefert Dossier; `dossierSave(store, uid, dossier)` liefert `true`/`false`; `dossierClear(store, uid)` löscht. `store` ist ein Objekt mit `getItem`/`setItem`/`removeItem` — im Browser `localStorage`, im Test ein Fake.

**Warum ein `store`-Argument:** So ist die Persistenz ohne Browser testbar, und die uid-Kopplung — der sicherheitskritische Teil — lässt sich direkt prüfen.

> **Abweichung bei der Umsetzung (2026-07-27, genehmigt):** Die `dossierLoad`-Fassung
> weiter unten übernimmt Listen roh (`if (Array.isArray(parsed[k])) base[k] = parsed[k]`)
> und akzeptiert `goal`/`tone` als beliebigen String. Damit passieren Alt-Einträge in
> Stringform die Grenze und `dossierForPrompt` schreibt danach die Kopfzeile
> „Einschraenkungen (immer respektieren): ; " mit **leerem** Inhalt — die Einschränkung
> ist stumm weg. Umgesetzt wurde deshalb eine gehärtete Variante (`sanitizeList` über
> `toEntry` + Caps + Dedupe, `goal`/`tone` gegen `GOALS`/`TONES` gewhitelistet,
> `coachStats` gefiltert). Tests dazu am Ende von `test/coach-memory.test.js`.

- [x] **Step 1: Die fehlschlagenden Tests schreiben**

An das Ende von `test/coach-memory.test.js` anhängen:

```js
function fakeStore() {
  const data = {};
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; }
  };
}

test('Schluessel enthaelt die uid', () => {
  assert.strictEqual(M.dossierKey('abc123'), 'gt_coachDossier:abc123');
});

test('Speichern und Laden fuer dieselbe uid', () => {
  const s = fakeStore();
  const d = M.dossierApplyDelta(M.dossierEmpty(), { add: { limits: ['Schulter'] } }, NOW);
  M.dossierSave(s, 'userA', d);
  assert.strictEqual(M.dossierLoad(s, 'userA').limits[0].t, 'Schulter');
});

test('fremde uid sieht das Dossier NICHT', () => {
  const s = fakeStore();
  M.dossierSave(s, 'userA', M.dossierApplyDelta(M.dossierEmpty(), { add: { limits: ['Schulter'] } }, NOW));
  const fremd = M.dossierLoad(s, 'userB');
  assert.deepStrictEqual(fremd.limits, []);
});

test('ohne uid wird weder geladen noch gespeichert', () => {
  const s = fakeStore();
  assert.strictEqual(M.dossierSave(s, null, M.dossierEmpty()), false);
  assert.deepStrictEqual(M.dossierLoad(s, null).limits, []);
  assert.deepStrictEqual(Object.keys(s.data), []);
});

test('dossierClear entfernt nur die eigene uid', () => {
  const s = fakeStore();
  M.dossierSave(s, 'userA', M.dossierEmpty());
  M.dossierSave(s, 'userB', M.dossierEmpty());
  M.dossierClear(s, 'userA');
  assert.strictEqual(s.getItem(M.dossierKey('userA')), null);
  assert.notStrictEqual(s.getItem(M.dossierKey('userB')), null);
});

test('kaputtes JSON im Speicher ergibt ein leeres Dossier', () => {
  const s = fakeStore();
  s.setItem(M.dossierKey('userA'), '{kaputt');
  assert.deepStrictEqual(M.dossierLoad(s, 'userA').limits, []);
});

test('Dossier ohne v wird migriert', () => {
  const s = fakeStore();
  s.setItem(M.dossierKey('userA'), JSON.stringify({ limits: [{ t: 'Alt', ts: NOW }] }));
  const d = M.dossierLoad(s, 'userA');
  assert.strictEqual(d.v, 1);
  assert.strictEqual(d.limits[0].t, 'Alt');
  assert.deepStrictEqual(d.coachStats, { accepted: 0, ignored: 0, muted: [] });
});

// Spec, Datenschutz Punkt 4: profiles/{uid} ist fuer JEDEN angemeldeten Nutzer
// lesbar. Ein Schreibpfad dorthin waere ein Leck. Der Test prueft die Quelle,
// weil die Einheit selbst gar keinen Firestore-Zugriff haben darf.
test('coach-memory.js enthaelt keinen Schreibpfad nach profiles/', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../js/coach-memory.js'), 'utf8');
  assert.ok(!/profiles/.test(src), 'coach-memory.js darf profiles/ nicht erwaehnen');
  assert.ok(!/setDoc|updateDoc|firestore|window\.FB/.test(src),
            'coach-memory.js darf keinen Firestore-Zugriff enthalten');
});
```

- [x] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `cd /Users/lennywolter/Desktop/Claude/gymtrack && npm test`
Expected: FAIL mit `M.dossierKey is not a function`

- [x] **Step 3: Implementierung ergänzen**

In `js/coach-memory.js` vor der Zeile `var API = {` einfügen:

```js
  var STORE_PREFIX = 'gt_coachDossier:';

  // Der Schluessel traegt die uid, weil Abmelden lokale Daten bewusst stehen
  // laesst. Ohne uid im Schluessel wuerde das naechste Konto auf demselben
  // Geraet die Einschraenkungen des vorigen lesen — dieselbe Fehlerklasse wie
  // der bereits behobene pushToken-Bug in doSignOut().
  function dossierKey(uid) { return STORE_PREFIX + String(uid || ''); }

  function dossierLoad(store, uid) {
    if (!store || !uid) return dossierEmpty();
    var raw;
    try { raw = store.getItem(dossierKey(uid)); } catch (_) { return dossierEmpty(); }
    if (!raw) return dossierEmpty();
    var parsed;
    try { parsed = JSON.parse(raw); } catch (_) { return dossierEmpty(); }
    if (!parsed || typeof parsed !== 'object') return dossierEmpty();
    var base = dossierEmpty();
    LIST_KEYS.forEach(function (k) { if (Array.isArray(parsed[k])) base[k] = parsed[k]; });
    if (typeof parsed.goal === 'string') base.goal = parsed.goal;
    if (typeof parsed.tone === 'string') base.tone = parsed.tone;
    if (parsed.derived && typeof parsed.derived === 'object') base.derived = parsed.derived;
    if (parsed.coachStats && typeof parsed.coachStats === 'object') {
      base.coachStats = {
        accepted: parsed.coachStats.accepted || 0,
        ignored:  parsed.coachStats.ignored  || 0,
        muted: Array.isArray(parsed.coachStats.muted) ? parsed.coachStats.muted : []
      };
    }
    base.updatedAt = parsed.updatedAt || 0;
    return base;
  }

  function dossierSave(store, uid, dossier) {
    if (!store || !uid) return false;
    try { store.setItem(dossierKey(uid), JSON.stringify(dossier || dossierEmpty())); return true; }
    catch (_) { return false; }
  }

  function dossierClear(store, uid) {
    if (!store || !uid) return false;
    try { store.removeItem(dossierKey(uid)); return true; } catch (_) { return false; }
  }
```

Und das `API`-Objekt erweitern um `dossierKey`, `dossierLoad`, `dossierSave`, `dossierClear`:

```js
  var API = { dossierEmpty: dossierEmpty, dossierApplyDelta: dossierApplyDelta,
              dossierStale: dossierStale, dossierRefresh: dossierRefresh,
              dossierForPrompt: dossierForPrompt,
              dossierKey: dossierKey, dossierLoad: dossierLoad,
              dossierSave: dossierSave, dossierClear: dossierClear,
              LIST_KEYS: LIST_KEYS, MAX_ITEMS: MAX_ITEMS, MAX_LEN: MAX_LEN,
              TONES: TONES, GOALS: GOALS, STALE_MS: STALE_MS };
```

- [x] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `cd /Users/lennywolter/Desktop/Claude/gymtrack && npm test`
Expected: PASS, 26 Tests grün

- [x] **Step 5: Commit**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack
git add js/coach-memory.js test/coach-memory.test.js
git commit -m "feat(coach): uid-gekoppelte Dossier-Persistenz — fremdes Konto sieht nichts"
git push origin HEAD
```

---

## Task 4: Firestore-Rule und Kontolöschung

**Files:**
- Modify: `firestore.rules`
- Modify: `index.html:26413` (`_runAccountDeletion`)

**Interfaces:**
- Consumes: `dossierClear()` aus Task 3
- Produces: Rule für `users/{userId}/coach/{docId}`; Dossier-Löschung vor der Dokumentlöschung

**Hinweis:** Diese Task hat keinen Node-Test — Firestore-Rules und Kontolöschung lassen sich hier nur manuell prüfen. Die Prüfschritte sind unten ausformuliert.

- [x] **Step 1: Rule ergänzen**

In `firestore.rules` direkt nach dem schließenden `}` des Blocks `match /users/{userId} { ... }` einfügen:

```
    // Coach-Dossier. BEWUSST OHNE Founder-Ausnahme, anders als das Eltern-Doc:
    // hier stehen gemeldete Einschraenkungen, also Gesundheitsangaben. Rules
    // kaskadieren nicht, die Subcollection braucht daher diesen eigenen Block.
    match /users/{userId}/coach/{docId} {
      allow read, write: if request.auth != null
        && request.auth.uid == userId
        && docId == 'dossier';
      allow delete: if request.auth != null && request.auth.uid == userId;
    }
```

- [ ] **Step 2: Rules-Syntax prüfen**

Run: `cd /Users/lennywolter/Desktop/Claude/gymtrack && npx firebase deploy --only firestore:rules --dry-run`
Expected: Kompiliert ohne Fehler. Schlägt der Befehl mangels Firebase-CLI fehl, die Rule stattdessen in der Firebase-Konsole unter Firestore/Regeln einfügen — der Editor dort meldet Syntaxfehler direkt.

- [x] **Step 3: Kontolöschung erweitern**

In `index.html`, Funktion `_runAccountDeletion()`, die Zeile

```js
    try { await window.FB.deleteDoc(window.FB.userDocRef(user.uid)); } catch(e) { console.warn('[GymTrack] Doc-Delete:', e); }
```

ersetzen durch:

```js
    // Reihenfolge zwingend: Firestore loescht Subcollections NICHT mit. Ohne
    // diesen Schritt ueberlebt das Coach-Dossier — und damit gemeldete
    // Einschraenkungen — die Kontoloeschung.
    try { await window.FB.deleteDoc(window.FB.doc('users/' + user.uid + '/coach', 'dossier')); }
    catch(e) { console.warn('[GymTrack] Dossier-Delete:', e); }
    try { window.CoachMemory.dossierClear(localStorage, user.uid); } catch(_) {}
    try { await window.FB.deleteDoc(window.FB.userDocRef(user.uid)); } catch(e) { console.warn('[GymTrack] Doc-Delete:', e); }
```

- [ ] **Step 4: Manuell prüfen**

1. Mit einem Testkonto anmelden, im KI-Chat „Meine linke Schulter zwickt bei Überkopfübungen" schreiben.
2. In der Firebase-Konsole prüfen: `users/{uid}/coach/dossier` existiert und enthält den Eintrag.
3. In der App Konto löschen.
4. In der Konsole prüfen: sowohl `users/{uid}` als auch `users/{uid}/coach/dossier` sind weg.
5. Mit einem zweiten Konto anmelden und in der Konsole versuchen, `users/{uid-des-ersten}/coach/dossier` zu lesen. Erwartung: `permission-denied`.

- [x] **Step 5: Commit**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack
git add firestore.rules index.html
git commit -m "feat(coach): Dossier-Rule ohne Founder-Ausnahme + Loeschung bei Kontoloeschung"
git push origin HEAD
```

---

## Task 5: Aktions-Log

**Files:**
- Create: `js/coach-log.js`
- Create: `test/coach-log.test.js`

**Interfaces:**
- Consumes: nichts
- Produces: `logEmpty()` liefert `[]`; `logAction(log, entry, now)` liefert neues Array; `logOutcome(log, exId, kind, outcomeW)` liefert neues Array; `logStats(log)` liefert `{accepted, ignored, muted}`; `isMuted(log, kind)` liefert Boolean. `entry` ist `{kind, exId, accepted}`.

- [x] **Step 1: Die fehlschlagenden Tests schreiben**

Datei `test/coach-log.test.js` anlegen:

```js
const test = require('node:test');
const assert = require('node:assert');
const L = require('../js/coach-log.js');

const NOW = 1753600000000;

function ignoreTimes(n, kind) {
  let log = L.logEmpty();
  for (let i = 0; i < n; i++) log = L.logAction(log, { kind, exId: 'ex1', accepted: false }, NOW + i);
  return log;
}

test('leeres Log ist ein leeres Array', () => {
  assert.deepStrictEqual(L.logEmpty(), []);
});

test('logAction haengt einen Eintrag an', () => {
  const log = L.logAction(L.logEmpty(), { kind: 'dropSet', exId: 'ex1', accepted: true }, NOW);
  assert.strictEqual(log.length, 1);
  assert.strictEqual(log[0].kind, 'dropSet');
  assert.strictEqual(log[0].accepted, true);
  assert.strictEqual(log[0].ts, NOW);
});

test('Ringpuffer haelt hoechstens 50 Eintraege', () => {
  let log = L.logEmpty();
  for (let i = 0; i < 70; i++) log = L.logAction(log, { kind: 'rest', exId: 'ex' + i, accepted: true }, NOW + i);
  assert.strictEqual(log.length, 50);
  assert.strictEqual(log[log.length - 1].exId, 'ex69');
  assert.strictEqual(log[0].exId, 'ex20');
});

test('Eintrag ohne kind wird verworfen', () => {
  assert.strictEqual(L.logAction(L.logEmpty(), { exId: 'ex1', accepted: true }, NOW).length, 0);
});

test('vier Ignorierungen drosseln noch nicht', () => {
  assert.strictEqual(L.isMuted(ignoreTimes(4, 'extraSet'), 'extraSet'), false);
});

test('fuenf Ignorierungen in Folge drosseln', () => {
  assert.strictEqual(L.isMuted(ignoreTimes(5, 'extraSet'), 'extraSet'), true);
});

test('Drosselung gilt nur fuer den betroffenen Typ', () => {
  assert.strictEqual(L.isMuted(ignoreTimes(5, 'extraSet'), 'dropSet'), false);
});

test('eine Annahme dazwischen setzt den Zaehler zurueck', () => {
  let log = ignoreTimes(4, 'extraSet');
  log = L.logAction(log, { kind: 'extraSet', exId: 'ex1', accepted: true }, NOW + 10);
  log = L.logAction(log, { kind: 'extraSet', exId: 'ex1', accepted: false }, NOW + 11);
  assert.strictEqual(L.isMuted(log, 'extraSet'), false);
});

test('spaetere Annahme hebt bestehende Drosselung auf', () => {
  let log = ignoreTimes(5, 'extraSet');
  assert.strictEqual(L.isMuted(log, 'extraSet'), true);
  log = L.logAction(log, { kind: 'extraSet', exId: 'ex1', accepted: true }, NOW + 99);
  assert.strictEqual(L.isMuted(log, 'extraSet'), false);
});

test('logStats zaehlt Annahmen und Ignorierungen', () => {
  let log = L.logAction(L.logEmpty(), { kind: 'dropSet', exId: 'ex1', accepted: true }, NOW);
  log = L.logAction(log, { kind: 'dropSet', exId: 'ex1', accepted: false }, NOW + 1);
  const s = L.logStats(log);
  assert.strictEqual(s.accepted, 1);
  assert.strictEqual(s.ignored, 1);
});

test('logStats listet gedrosselte Typen', () => {
  assert.deepStrictEqual(L.logStats(ignoreTimes(5, 'extraSet')).muted, ['extraSet']);
});

test('logOutcome ergaenzt das Ergebnis am juengsten passenden Eintrag', () => {
  let log = L.logAction(L.logEmpty(), { kind: 'dropSet', exId: 'ex1', accepted: true }, NOW);
  log = L.logOutcome(log, 'ex1', 'dropSet', 2.5);
  assert.strictEqual(log[0].outcomeW, 2.5);
});

test('logOutcome ohne passenden Eintrag aendert nichts', () => {
  const log = L.logAction(L.logEmpty(), { kind: 'dropSet', exId: 'ex1', accepted: true }, NOW);
  assert.deepStrictEqual(L.logOutcome(log, 'ex9', 'dropSet', 2.5), log);
});

test('Eingabe-Log wird nicht veraendert', () => {
  const orig = L.logAction(L.logEmpty(), { kind: 'rest', exId: 'ex1', accepted: true }, NOW);
  L.logAction(orig, { kind: 'rest', exId: 'ex2', accepted: true }, NOW + 1);
  assert.strictEqual(orig.length, 1);
});
```

- [x] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `cd /Users/lennywolter/Desktop/Claude/gymtrack && npm test`
Expected: FAIL mit `Cannot find module '../js/coach-log.js'`

- [x] **Step 3: Implementierung**

Datei `js/coach-log.js` anlegen:

```js
/* GymTrack — Coach-Aktions-Log (Baustein 2)
   Reine Logik. Das Roh-Log bleibt lokal; nach oben gehen nur Aggregate. */
(function (root) {
  'use strict';

  var MAX_ENTRIES = 50;
  var MUTE_AFTER  = 5;

  function logEmpty() { return []; }

  function logAction(log, entry, now) {
    var out = (log || []).slice();
    if (!entry || !entry.kind) return out;
    out.push({
      ts: now || Date.now(),
      kind: String(entry.kind),
      exId: entry.exId ? String(entry.exId) : null,
      accepted: !!entry.accepted
    });
    if (out.length > MAX_ENTRIES) out = out.slice(out.length - MAX_ENTRIES);
    return out;
  }

  function logOutcome(log, exId, kind, outcomeW) {
    var out = (log || []).slice();
    for (var i = out.length - 1; i >= 0; i--) {
      if (out[i].exId === exId && out[i].kind === kind && out[i].accepted) {
        out[i] = Object.assign({}, out[i], { outcomeW: outcomeW });
        return out;
      }
    }
    return out;
  }

  // Zaehlt je Typ von hinten, wie viele Ignorierungen OHNE zwischenzeitliche
  // Annahme aufgelaufen sind. Eine spaetere Annahme hebt die Drosselung damit
  // automatisch wieder auf — der Coach bleibt lernfaehig statt dauerhaft still.
  function streakIgnored(log, kind) {
    var n = 0;
    for (var i = (log || []).length - 1; i >= 0; i--) {
      if (log[i].kind !== kind) continue;
      if (log[i].accepted) break;
      n++;
    }
    return n;
  }

  function isMuted(log, kind) { return streakIgnored(log, kind) >= MUTE_AFTER; }

  function logStats(log) {
    var l = log || [];
    var accepted = 0, ignored = 0, kinds = {};
    l.forEach(function (e) {
      if (e.accepted) accepted++; else ignored++;
      kinds[e.kind] = true;
    });
    var muted = Object.keys(kinds).filter(function (k) { return isMuted(l, k); });
    return { accepted: accepted, ignored: ignored, muted: muted };
  }

  var API = { logEmpty: logEmpty, logAction: logAction, logOutcome: logOutcome,
              logStats: logStats, isMuted: isMuted,
              MAX_ENTRIES: MAX_ENTRIES, MUTE_AFTER: MUTE_AFTER };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachLog = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [x] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `cd /Users/lennywolter/Desktop/Claude/gymtrack && npm test`
Expected: PASS, 40 Tests grün

- [x] **Step 5: Commit**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack
git add js/coach-log.js test/coach-log.test.js
git commit -m "feat(coach): Aktions-Log mit Drosselung nach fuenf Ignorierungen"
git push origin HEAD
```

---

## Task 6: Intent-Router

**Files:**
- Create: `js/coach-intent.js`
- Create: `test/coach-intent.test.js`

**Interfaces:**
- Consumes: nichts
- Produces: `resolveIntent(text, snap)` liefert `{intent, answer}` oder `null`.

`snap` ist ein Datenschnappschuss, den `index.html` baut:

```js
{
  exercises: [{ id: 'ex1', name: 'Bankdruecken', muscleGroup: 'brust' }],
  bestSet:   { ex1: { w: 80, r: 8, date: '2026-07-20' } },
  lastDone:  { ex1: '2026-07-20' },
  active:    { exId: 'ex1', setsTotal: 4, setsDone: 2, nextW: 82.5 },
  restLeftSec: 45,
  recovery:  { Brust: 92, Beine: 40 },
  weekVolumeKg: 12500,
  todayText: 'Beine stehen heute an.'
}
```

Fehlt ein Feld, liefert der zugehörige Intent `null` und die Frage geht ans Modell.

- [x] **Step 1: Die fehlschlagenden Tests schreiben**

Datei `test/coach-intent.test.js` anlegen:

```js
const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/coach-intent.js');

const SNAP = {
  exercises: [{ id: 'ex1', name: 'Bankdruecken', muscleGroup: 'brust' },
              { id: 'ex2', name: 'Kniebeuge', muscleGroup: 'beine' }],
  bestSet:  { ex1: { w: 80, r: 8, date: '2026-07-20' } },
  lastDone: { ex1: '2026-07-20' },
  active:   { exId: 'ex1', setsTotal: 4, setsDone: 2, nextW: 82.5 },
  restLeftSec: 45,
  recovery: { Brust: 92, Beine: 40 },
  weekVolumeKg: 12500,
  todayText: 'Beine stehen heute an.'
};

test('naechstes Gewicht', () => {
  const r = R.resolveIntent('wie viel gewicht beim naechsten satz?', SNAP);
  assert.strictEqual(r.intent, 'nextWeight');
  assert.ok(r.answer.includes('82,5'));
});

test('Rekord bei einer Uebung', () => {
  const r = R.resolveIntent('was ist mein rekord bei bankdruecken?', SNAP);
  assert.strictEqual(r.intent, 'best');
  assert.ok(r.answer.includes('80'));
  assert.ok(r.answer.includes('8'));
});

test('verbleibende Saetze', () => {
  const r = R.resolveIntent('wie viele saetze noch?', SNAP);
  assert.strictEqual(r.intent, 'setsLeft');
  assert.ok(r.answer.includes('2'));
});

test('Restpause', () => {
  const r = R.resolveIntent('wie lange noch pause?', SNAP);
  assert.strictEqual(r.intent, 'rest');
  assert.ok(r.answer.includes('45'));
});

test('Erholung einer Muskelgruppe', () => {
  const r = R.resolveIntent('wie erholt ist meine brust?', SNAP);
  assert.strictEqual(r.intent, 'recovery');
  assert.ok(r.answer.includes('92'));
});

test('letzte Ausfuehrung', () => {
  const r = R.resolveIntent('wann hatte ich zuletzt bankdruecken?', SNAP);
  assert.strictEqual(r.intent, 'lastDone');
  assert.ok(r.answer.includes('20.07.2026'));
});

test('Wochenvolumen', () => {
  const r = R.resolveIntent('wie viel volumen diese woche?', SNAP);
  assert.strictEqual(r.intent, 'volume');
  assert.ok(r.answer.includes('12.500'));
});

test('was steht heute an', () => {
  const r = R.resolveIntent('was steht heute an?', SNAP);
  assert.strictEqual(r.intent, 'today');
  assert.strictEqual(r.answer, 'Beine stehen heute an.');
});

test('englische Frage wird erkannt', () => {
  const r = R.resolveIntent('what is my record on bench press?', {
    ...SNAP,
    exercises: [{ id: 'ex1', name: 'Bench Press', muscleGroup: 'brust' }]
  });
  assert.strictEqual(r.intent, 'best');
});

test('Rekord fuer unbekannte Uebung geht ans Modell', () => {
  assert.strictEqual(R.resolveIntent('was ist mein rekord bei nackenziehen?', SNAP), null);
});

test('offene Frage geht ans Modell', () => {
  assert.strictEqual(R.resolveIntent('soll ich heute lieber cardio machen oder beine?', SNAP), null);
});

test('Planwunsch geht ans Modell', () => {
  assert.strictEqual(R.resolveIntent('erstell mir einen trainingsplan fuer 4 tage', SNAP), null);
});

test('Schmerzmeldung geht ans Modell', () => {
  assert.strictEqual(R.resolveIntent('meine schulter tut beim bankdruecken weh', SNAP), null);
});

test('fehlende Daten ergeben kein Ergebnis', () => {
  assert.strictEqual(R.resolveIntent('wie lange noch pause?', { restLeftSec: 0 }), null);
  assert.strictEqual(R.resolveIntent('wie viele saetze noch?', {}), null);
});

test('leere Eingabe ergibt null', () => {
  assert.strictEqual(R.resolveIntent('', SNAP), null);
  assert.strictEqual(R.resolveIntent(null, SNAP), null);
});
```

- [x] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `cd /Users/lennywolter/Desktop/Claude/gymtrack && npm test`
Expected: FAIL mit `Cannot find module '../js/coach-intent.js'`

- [x] **Step 3: Implementierung**

Datei `js/coach-intent.js` anlegen:

```js
/* GymTrack — Intent-Router (Baustein 3)
   Beantwortet haeufige Gym-Fragen aus lokalen Daten, ohne LLM-Aufruf.
   Bekommt einen fertigen Datenschnappschuss statt globaler App-Variablen —
   dadurch ohne Browser testbar und nicht an interne Strukturen gebunden. */
(function (root) {
  'use strict';

  // Ein Treffer verlangt ein eindeutiges Muster UND vorhandene Daten. Alles
  // Wertende, Planende oder Medizinische geht bewusst ans Modell.
  var BLOCK = /(plan|programm|schmerz|weh|verletz|zwick|lieber|besser|sollte ich|soll ich|meinst du|warum|erklaer|hurts|pain|should i)/;

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function num(n) {
    return Number(n).toLocaleString('de-DE', { maximumFractionDigits: 1 });
  }

  function datum(iso) {
    var p = String(iso || '').slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : '';
  }

  function findExercise(q, list) {
    var hit = null, best = 0;
    (list || []).forEach(function (ex) {
      var n = norm(ex.name);
      if (n && q.indexOf(n) >= 0 && n.length > best) { hit = ex; best = n.length; }
    });
    return hit;
  }

  function resolveIntent(text, snap) {
    var q = norm(text);
    if (!q) return null;
    if (BLOCK.test(q)) return null;
    var s = snap || {};

    // 1) Naechstes Gewicht
    if (/(wie viel|wieviel|welches) gewicht|naechste[nsr]? satz|how much weight/.test(q)) {
      if (s.active && s.active.nextW != null) {
        return { intent: 'nextWeight', answer: 'Naechster Satz: ' + num(s.active.nextW) + ' kg.' };
      }
      return null;
    }

    // 2) Rekord
    if (/rekord|bestleistung|bester satz|bestes satz|personal best|record/.test(q)) {
      var ex = findExercise(q, s.exercises);
      if (!ex) return null;
      var b = (s.bestSet || {})[ex.id];
      if (!b) return null;
      return { intent: 'best',
               answer: ex.name + ': ' + num(b.w) + ' kg mal ' + b.r + ' Wiederholungen, am ' + datum(b.date) + '.' };
    }

    // 3) Verbleibende Saetze
    if (/(wie viele|wieviele).*(saetze|satz)|saetze noch|sets left|how many sets/.test(q)) {
      if (!s.active || s.active.setsTotal == null || s.active.setsDone == null) return null;
      var left = s.active.setsTotal - s.active.setsDone;
      if (left < 0) return null;
      return { intent: 'setsLeft',
               answer: left === 1 ? 'Noch 1 Satz.' : 'Noch ' + left + ' Saetze.' };
    }

    // 4) Restpause
    if (/pause|rest timer|how long.*rest/.test(q)) {
      if (!s.restLeftSec) return null;
      return { intent: 'rest', answer: 'Noch ' + s.restLeftSec + ' Sekunden Pause.' };
    }

    // 5) Erholung
    if (/erhol|recover|regenerier/.test(q)) {
      var rec = s.recovery || {};
      var mg = Object.keys(rec).filter(function (k) { return q.indexOf(norm(k)) >= 0; })[0];
      if (!mg) return null;
      return { intent: 'recovery', answer: mg + ' ist zu ' + rec[mg] + ' Prozent erholt.' };
    }

    // 6) Letzte Ausfuehrung
    if (/zuletzt|letztes mal|last time|wann hatte ich/.test(q)) {
      var ex2 = findExercise(q, s.exercises);
      if (!ex2) return null;
      var d = (s.lastDone || {})[ex2.id];
      if (!d) return null;
      return { intent: 'lastDone', answer: ex2.name + ' zuletzt am ' + datum(d) + '.' };
    }

    // 7) Wochenvolumen
    if (/volumen|volume|tonnage/.test(q)) {
      if (s.weekVolumeKg == null) return null;
      return { intent: 'volume', answer: 'Diese Woche ' + num(s.weekVolumeKg) + ' kg Gesamtvolumen.' };
    }

    // 8) Was steht heute an
    if (/heute an|heute dran|was mache ich heute|whats on today/.test(q)) {
      if (!s.todayText) return null;
      return { intent: 'today', answer: s.todayText };
    }

    return null;
  }

  var API = { resolveIntent: resolveIntent };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachIntent = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [x] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `cd /Users/lennywolter/Desktop/Claude/gymtrack && npm test`
Expected: PASS, 55 Tests grün

- [x] **Step 5: Commit**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack
git add js/coach-intent.js test/coach-intent.test.js
git commit -m "feat(coach): Intent-Router beantwortet acht Gym-Fragen ohne LLM"
git push origin HEAD
```

---

## Task 7: Verdrahtung in der App

**Files:**
- Modify: `index.html` (Skript-Tags, `_aicContext`, `aicSend`, `_coachCommitAction`, `_coachDismiss`, Auth-Wechsel)
- Modify: `sw.js` (`SHELL`, `CACHE`)
- Modify: `build.js` (`files`)

**Interfaces:**
- Consumes: `window.CoachMemory`, `window.CoachLog`, `window.CoachIntent` aus Task 1–3, 5, 6
- Produces: `_coachUid()`, `_dossier()`, `_dossierSet(d)`, `_coachSnap()` als App-interne Helfer

- [x] **Step 1: Dateien in den Build und den Service Worker aufnehmen**

In `build.js` das `files`-Array ersetzen:

```js
const files = ['index.html', 'sw.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-1024.png', 'icon-gold-192.png', 'icon-white-192.png',
               'js/coach-memory.js', 'js/coach-log.js', 'js/coach-intent.js'];
```

Und direkt darunter, vor der `files.forEach`-Schleife, das Anlegen des Unterordners ergänzen:

```js
if (!fs.existsSync(path.join('www', 'js'))) fs.mkdirSync(path.join('www', 'js'), { recursive: true });
```

In `sw.js` die `SHELL`-Liste ergänzen und `CACHE` hochzählen:

```js
const CACHE = 'gymtrack-v202607270001';
const SHELL = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './js/coach-memory.js',
  './js/coach-log.js',
  './js/coach-intent.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];
```

- [x] **Step 2: Skripte einbinden**

In `index.html` direkt vor `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>` (Zeile 5546) einfügen:

```html
<script src="./js/coach-memory.js"></script>
<script src="./js/coach-log.js"></script>
<script src="./js/coach-intent.js"></script>
```

- [x] **Step 3: Helfer ergänzen**

In `index.html` direkt vor `function _aicContext(){` einfügen:

```js
// ── Coach-Gedaechtnis: Bruecke zwischen App-Zustand und den Coach-Einheiten ──
// Das Dossier liegt uid-gekoppelt in localStorage, NICHT in S: Abmelden laesst
// S bewusst stehen, sonst laese das naechste Konto auf diesem Geraet die
// Einschraenkungen des vorigen.
let _dossierPushT = null;
function _coachUid(){ return (_fbUser && !_fbUser.isAnonymous) ? _fbUser.uid : null; }
function _dossier(){ return window.CoachMemory.dossierLoad(localStorage, _coachUid()); }
function _dossierSet(d){
  const uid = _coachUid(); if (!uid) return;
  window.CoachMemory.dossierSave(localStorage, uid, d);
  if (_dossierPushT) clearTimeout(_dossierPushT);
  _dossierPushT = setTimeout(() => { _dossierPush(d); }, 4000);
}
async function _dossierPush(d){
  const uid = _coachUid(); if (!uid || !window.FB || !window.FB.configured) return;
  // Kein Dossier-Inhalt ins Log — nur der Fehlercode.
  try { await window.FB.setDoc(window.FB.doc('users/' + uid + '/coach', 'dossier'), d, { merge: false }); }
  catch(e) { console.warn('[Coach] Dossier-Push fehlgeschlagen:', (e && e.code) || ''); }
}
// Gegenstueck zum Push: ohne diesen Zug waere das Dossier nach einem
// Geraetewechsel oder einer Neuinstallation weg, obwohl es in der Cloud liegt.
// Die neuere Seite gewinnt — lokal ist waehrend einer Sitzung aktueller,
// die Cloud nach einem Wechsel.
async function _dossierPull(){
  const uid = _coachUid(); if (!uid || !window.FB || !window.FB.configured) return;
  try {
    const snap = await window.FB.getDoc(window.FB.doc('users/' + uid + '/coach', 'dossier'));
    if (!snap || !snap.exists()) return;
    const cloud = snap.data() || {};
    const lokal = window.CoachMemory.dossierLoad(localStorage, uid);
    if ((cloud.updatedAt || 0) > (lokal.updatedAt || 0)) {
      window.CoachMemory.dossierSave(localStorage, uid, cloud);
    }
  } catch(e) { console.warn('[Coach] Dossier-Pull fehlgeschlagen:', (e && e.code) || ''); }
}
// Schnappschuss fuer den Intent-Router. Bewusst hier gebaut statt im Router,
// damit der Router nicht an interne App-Strukturen gebunden ist.
function _coachSnap(){
  const snap = { exercises: [], bestSet: {}, lastDone: {}, recovery: {} };
  try {
    snap.exercises = (S.exercises || []).map(e => ({ id: e.id, name: e.name, muscleGroup: e.muscleGroup }));
    (S.sessions || []).forEach(s => {
      (s.logs || []).forEach(l => {
        const best = (l.sets || []).filter(x => x.type !== 'warmup')
          .sort((a,b) => (parseFloat(b.w)||0) - (parseFloat(a.w)||0))[0];
        if (!best) return;
        const w = parseFloat(best.w) || 0;
        const cur = snap.bestSet[l.exerciseId];
        if (!cur || w > cur.w) snap.bestSet[l.exerciseId] = { w, r: parseInt(best.r) || 0, date: s.date };
        if (!snap.lastDone[l.exerciseId] || s.date > snap.lastDone[l.exerciseId]) snap.lastDone[l.exerciseId] = s.date;
      });
    });
    const rec = getMuscleGroupRecovery();
    MUSCLE_GROUPS.forEach(mg => { if (rec[mg.id]) snap.recovery[muscleLabel(mg.id)] = rec[mg.id].recPct; });
    if (typeof wkLogs !== 'undefined' && Array.isArray(wkLogs) && wkLogs.length) {
      const cur = wkLogs.find(l => (l.sets || []).some(x => !x.done)) || wkLogs[0];
      if (cur) {
        const done = (cur.sets || []).filter(x => x.done).length;
        const nxt  = (cur.sets || []).find(x => !x.done);
        snap.active = { exId: cur.exerciseId, setsTotal: (cur.sets || []).length, setsDone: done,
                        nextW: nxt ? (parseFloat(nxt.w) || null) : null };
      }
    }
    const t = _coachTodaySuggestion(); if (t) snap.todayText = t.text;
  } catch(e) { console.warn('[Coach] Snapshot:', e); }
  return snap;
}
```

**Hinweis für die Umsetzung:** Der Schnappschuss enthält bewusst noch kein `restLeftSec` und kein `weekVolumeKg`. Vor dem Einfügen mit

```bash
grep -n "_restInt\|_restLeft\|restSecs\|weekVolume\|wochenVolumen" index.html
```

prüfen, ob die App eine laufende Restsekunden-Variable und eine Wochenvolumen-Summe führt. Wenn ja, die beiden Felder ergänzen (`snap.restLeftSec = ...`, `snap.weekVolumeKg = ...`). Wenn nein, weglassen — der Router liefert für diese beiden Fragen dann `null` und sie gehen ans Modell. Das ist ein gültiger Endzustand, kein Fehler.

- [x] **Step 4: Dossier in den Chat-Kontext**

In `index.html` die Funktion `_aicContext()` erweitern — direkt nach der `profile`-Zeile einfügen:

```js
    dossier: window.CoachMemory.dossierForPrompt(_dossier()),
    muted: window.CoachLog.logStats(S.coachLog || []).muted,
```

- [x] **Step 5: Router vorschalten und `gtmem` verarbeiten**

In `index.html` in `aicSend()` direkt nach `_aicPush('user', t);` einfügen:

```js
  // Lokal beantwortbar? Dann kein Netzaufruf. Die Antwort wandert trotzdem in
  // die Historie, sonst fehlt dem Modell beim naechsten echten Aufruf der Faden.
  const local = window.CoachIntent.resolveIntent(t, _coachSnap());
  if (local) {
    _aicPush('assistant', local.answer);
    _aicRenderLog(); _aicRenderSugg();
    return;
  }
```

Und weiter unten, direkt nach dem `gtplan`-Block (nach dessen schließender `}`), einfügen:

```js
  const mm = txt.match(/```gtmem\s*([\s\S]*?)```/);
  if (mm) {
    try {
      const delta = JSON.parse(mm[1]);
      _dossierSet(window.CoachMemory.dossierApplyDelta(_dossier(), delta, Date.now()));
    } catch(_) { /* kaputtes JSON still verwerfen, wie bei gtplan */ }
    txt = txt.replace(mm[0], '').trim();
  }
```

- [x] **Step 6: Log-Hooks setzen**

In `index.html` in `_coachCommitAction(action)` direkt nach der Zeile `if (!_coachCard || _coachCard.applied) return;` einfügen:

```js
  try {
    S.coachLog = window.CoachLog.logAction(S.coachLog || [],
      { kind: (action || {}).kind, exId: _coachCard.exId, accepted: true }, Date.now());
    persist();
  } catch(e) { console.warn('[Coach] Log:', e); }
```

In `_coachDismiss()` den Rumpf ersetzen durch:

```js
function _coachDismiss() {
  // Zuerst loggen, dann aufraeumen: nach _coachClearCard() ist _coachCard leer.
  try {
    if (_coachCard) {
      S.coachLog = window.CoachLog.logAction(S.coachLog || [],
        { kind: ((_coachCard.c || {}).action || {}).kind, exId: _coachCard.exId, accepted: false }, Date.now());
      persist();
    }
  } catch(e) { console.warn('[Coach] Log:', e); }
  try { _coachClearCard(); renderLogCards(); } catch(e) { console.warn('[Coach] dismiss:', e); }
}
```

- [x] **Step 7: Dossier beim Kontowechsel nicht übernehmen**

In `index.html` bei den anderen Coach-Variablen (Nähe `let _aicHist = ...`, Zeile 23712) ergänzen:

```js
let _coachLastUid;
```

In der `window.FB.onAuthStateChanged((user) => {`-Rückruffunktion (Zeile 26601) als erste Anweisung im Rumpf einfügen:

```js
    // Konto gewechselt: das Dossier des vorigen Kontos wird lokal geloescht und
    // ohnehin nie geladen (der Schluessel traegt die uid). Der Chatverlauf wird
    // geleert, damit im Fenster keine Antworten des Vorgaengers stehen bleiben.
    // Die Cloud-Kopie bleibt: beim naechsten Login holt _dossierPull() sie zurueck.
    try {
      const neu = (user && !user.isAnonymous) ? user.uid : null;
      if (_coachLastUid !== undefined && _coachLastUid !== neu) {
        _aicHist = []; localStorage.removeItem('gt_aiChat');
        if (_coachLastUid) window.CoachMemory.dossierClear(localStorage, _coachLastUid);
      }
      _coachLastUid = neu;
      if (neu) _dossierPull();
    } catch(_) {}
```

**Warum die Cloud-Kopie stehen bleibt:** Das lokale Löschen verhindert, dass ein anderes Konto auf diesem Gerät an die Daten kommt. Das Dossier selbst gehört weiterhin dem abgemeldeten Nutzer und ist nach seinem nächsten Login wieder da. Endgültig gelöscht wird es nur bei der Kontolöschung (Task 4).

- [x] **Step 8: Im Simulator prüfen**

Run: `~/.claude/sim-native.sh /Users/lennywolter/Desktop/Claude/gymtrack`

Prüfen:
1. App startet ohne Fehler in der Konsole.
2. KI-Chat öffnen, während eines laufenden Trainings „wie viele Sätze noch?" fragen — Antwort erscheint sofort, ohne Ladepunkte.
3. „Was ist mein Rekord bei Bankdrücken?" — Zahl stimmt mit der Statistik überein.
4. „Erstell mir einen Trainingsplan für 4 Tage" — geht ans Modell, Ladepunkte erscheinen.
5. Abmelden, mit zweitem Konto anmelden: Chatverlauf ist leer, keine Einschränkungen des ersten Kontos im Prompt.

Beweis-Screenshot: `xcrun simctl io "iPhone 17" screenshot /tmp/coach-router.png`

- [x] **Step 9: Commit**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack
git add index.html sw.js build.js
git commit -m "feat(coach): Dossier, Aktions-Log und Intent-Router in der App verdrahtet"
git push origin HEAD
```

---

## Task 8: Worker-Prompts

**Files:**
- Modify: `ai-worker/worker.js` (`runChat` ab Zeile 492, `runCoach` ab Zeile 556)
- Modify: `index.html` (lokaler Nachfilter)

**Interfaces:**
- Consumes: `context.dossier` und `context.muted` aus Task 7, `t.limits` und `t.muted` im `/coach`-Request
- Produces: keine neuen Funktionen

- [x] **Step 1: `gtmem`-Anweisung in den Chat-Prompt**

In `ai-worker/worker.js` in `runChat`, im deutschen System-Prompt direkt vor der Zeile `Keine medizinischen Diagnosen` einfügen:

```
Im Kontext steht unter "dossier" ein Gedaechtnis dieses Nutzers. Respektiere Einschraenkungen ausnahmslos: schlage keine Uebung vor, die eine genannte Einschraenkung belastet. Erwaehne das Dossier nicht von selbst.
Erfaehrst du in dieser Nachricht etwas dauerhaft Gueltiges ueber den Nutzer — eine koerperliche Einschraenkung, eine feste Vorliebe, ein geaendertes Ziel, oder dass etwas bei ihm nachweislich funktioniert — gib das ZUSAETZLICH als Codeblock aus:
\`\`\`gtmem
{"add":{"limits":["kurzer Satz"],"prefs":["kurzer Satz"],"works":["kurzer Satz"]},"goal":"Masse"}
\`\`\`
Nur Felder angeben, die wirklich neu sind. Hoechstens zwei Eintraege pro Nachricht. Kein "ts"-Feld und keine Zeitangaben — den Zeitstempel setzt die App. Nichts merken, was nur fuer diese eine Frage gilt.
```

Dieselbe Ergänzung sinngemäß in den englischen Prompt, direkt vor `No medical diagnoses`:

```
The context contains a "dossier" — this user's memory. Respect limitations without exception: never suggest an exercise that loads a stated limitation. Do not mention the dossier unprompted.
If this message reveals something permanently true about the user — a physical limitation, a fixed preference, a changed goal, or something that demonstrably works for them — ALSO output it as a code block:
\`\`\`gtmem
{"add":{"limits":["short sentence"],"prefs":["short sentence"],"works":["short sentence"]},"goal":"Masse"}
\`\`\`
Only include fields that are genuinely new. At most two entries per message. No "ts" field and no dates — the app sets the timestamp. Do not memorise anything that only applies to this one question.
```

**Achtung:** Beide Prompts stehen in Template-Literalen. Die drei Backticks müssen wie oben als `\`\`\`` escaped werden, sonst bricht das Literal.

- [x] **Step 2: `limits` und `muted` im Live-Coach**

In `ai-worker/worker.js` in `runCoach`, im deutschen System-Prompt direkt vor der Zeile `Keine Emojis` einfügen:

```
Stehen in den Daten "limits", sind das koerperliche Einschraenkungen des Nutzers: schlage nichts vor, was sie belastet. Steht dort "muted", sind das Vorschlagstypen, die der Nutzer wiederholt ignoriert hat — verwende diese kinds nicht mehr.
```

Und im englischen Prompt vor `No emojis`:

```
If the data contains "limits", these are the user's physical limitations: never suggest anything that loads them. If it contains "muted", those are suggestion kinds the user repeatedly ignored — do not use those kinds any more.
```

- [x] **Step 3: `limits` und `muted` mitschicken**

In `index.html` die Stelle finden, an der das `t`-Objekt für den `/coach`-Aufruf gebaut wird:

```bash
grep -n "aiCall('coach'" index.html
```

Dort dem `t`-Objekt zwei Felder hinzufügen:

```js
      limits: (_dossier().limits || []).map(e => e.t),
      muted:  window.CoachLog.logStats(S.coachLog || []).muted,
```

- [x] **Step 4: Lokaler Nachfilter in der App**

Das Modell ist eine Empfehlung, keine Autorität. Die Stelle finden, an der die `/coach`-Antwort zur Karte wird:

```bash
grep -n "_coachCard = " index.html
```

Direkt vor der Zuweisung einfügen:

```js
  // Zweite Verteidigungslinie: haelt sich das Modell nicht an "muted",
  // greift dieser Filter.
  try {
    const mutedKinds = window.CoachLog.logStats(S.coachLog || []).muted;
    const c = res.c || {};
    if ((c.action || {}).kind && mutedKinds.indexOf(c.action.kind) >= 0) return;
    if (Array.isArray(c.options)) {
      c.options = c.options.filter(o => mutedKinds.indexOf((o.action || {}).kind) < 0);
      if (!c.options.length && !(c.action || {}).kind) return;
    }
  } catch(e) { console.warn('[Coach] Filter:', e); }
```

- [x] **Step 5: Syntax prüfen**

Run: `cd /Users/lennywolter/Desktop/Claude/gymtrack && node --check ai-worker/worker.js`
Expected: keine Ausgabe (Datei ist syntaktisch gültig)

Run: `cd /Users/lennywolter/Desktop/Claude/gymtrack && npm test`
Expected: PASS, 55 Tests weiterhin grün

- [ ] **Step 6: Ende-zu-Ende prüfen**

1. Worker deployen: `cd ai-worker && npx wrangler deploy`
2. In der App im KI-Chat schreiben: „Meine linke Schulter zwickt bei Überkopfübungen."
3. Erwartung: normale Antwort, kein sichtbarer Codeblock im Chat.
4. In der Firebase-Konsole prüfen: `users/{uid}/coach/dossier` enthält den Eintrag unter `limits`.
5. Neue Nachricht: „Gib mir eine Schulterübung." Erwartung: keine Überkopfübung im Vorschlag.
6. In den Cloudflare-Logs prüfen: **kein** Dossier-Inhalt sichtbar, nur Fehlercodes.

- [x] **Step 7: Commit**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack
git add ai-worker/worker.js index.html
git commit -m "feat(coach): Dossier im Chat-Prompt, limits und muted im Live-Coach"
git push origin HEAD
```

---

## Abschluss

Nach Task 8 sind alle drei Einheiten fertig und verdrahtet. Vor einem Release zusätzlich:

- Version in `index.html` und `sw.js` hochzählen (bestehende Release-Routine)
- Changelog-Eintrag ergänzen, Muster siehe `index.html:8309`
- Nutrition Labels in App Store Connect um Gesundheitsdaten erweitern (Spec, Punkt 7)

Nicht Teil dieses Plans, jeweils eigene Spec: Voice-Chat, proaktive Push und Wochen-Debrief, HealthKit-Erholung, Live Activity und Widget-Zeile.
