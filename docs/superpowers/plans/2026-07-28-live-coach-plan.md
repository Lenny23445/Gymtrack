# Live-Coach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aus der Premium-Funktion „KI-Coach" wird eine dauerhafte Begleitung: mit Name, Ton und Stimme, mit einem Erzählbogen durch die Trainingseinheit, mit proaktiven Meldungen bei geschlossener App und einem wöchentlichen Bericht — innerhalb von 0,30 $ KI-Kosten pro zahlendem Nutzer und Monat.

**Architecture:** Alle Logik wandert in eigenständige Skriptdateien unter `js/`, gebaut wie die bestehenden `coach-*.js`: reine Funktionen, kein DOM-Zugriff, keine globalen App-Variablen, Daten kommen als Argument herein. Jede Datei hängt sich an `globalThis` **und** exportiert per CommonJS, damit sie ohne Bundler im Browser läuft und in `node --test` importierbar ist. Verdrahtet wird ausschließlich in `index.html`. Server-seitig ändert sich nur `ai-worker/worker.js` (Budget-Zähler und Antwort-Cache) — es entsteht **keine** neue Server-Komponente und kein Service-Account.

**Tech Stack:** Vanilla JS (kein Bundler), Node 22 mit eingebautem Test-Runner (`node --test test/*.js`), Capacitor 8 für iOS, Swift/AVFoundation für die Sprachausgabe, Cloudflare Worker + KV (`AI_QUOTA`), Firebase Firestore Web-SDK 10.13, `@capacitor/local-notifications` 8.

**Spec:** `docs/superpowers/specs/2026-07-28-live-coach-design.md`

**Baut auf:** `docs/superpowers/plans/2026-07-27-ki-coach-fundament.md` (abgeschlossen, Stand `4548b7a1`) — Dossier, Aktions-Log und Intent-Router sind vorhanden und werden hier erweitert, nicht ersetzt.

---

## Global Constraints

Diese Regeln gelten für **jede** Task in diesem Plan. Sie werden nicht wiederholt, sondern vorausgesetzt.

- **Keine Emojis in der App-Oberfläche.** Symbole ausschließlich über `ICO.<name>({s})` (Definition `index.html:17147`). Diese Regel gilt auch für Notification-Titel und -Texte. Bestehende CHANGELOG-Einträge bleiben unangetastet.
- **Jeder freie Text geht durch `esc()`,** bevor er per `innerHTML` gerendert wird — Coach-Name, Chat-Inhalte, Dossier-Einträge, Übungsnamen.
- **Niemals `@capacitor-firebase/authentication` hinzufügen,** niemals `import FirebaseCore` oder `FirebaseApp.configure()` in Swift. Das erzeugt einen SIGABRT beim Start. Firebase läuft ausschließlich über das JS-Web-SDK.
- **Zwei Sprachen.** Interne Daten sind deutsch, die Anzeige läuft über `tr()` und die Tabellen `I18N_EN` / `I18N_RX`. Jeder neue nutzersichtbare String braucht seinen englischen Gegenpart.
- **Sprachschlüssel:** `'de'` und `'en'`, gelesen aus `localStorage['gt_lang']`. Module bekommen die Sprache als Argument, sie lesen `localStorage` nicht selbst.
- **Zeitstempel** sind durchgängig `Date.now()`-Millisekunden. Der Wochenschlüssel hat das Format `2026-W31` (ISO-Woche, zweistellig mit führender Null).
- **Keine Änderung an `firestore.rules` nötig.** `aiCoach` steht bereits in der `hasOnly`-Liste (`firestore.rules:20`). Kommt eine Task zu dem Schluss, sie brauche eine Rules-Änderung, ist der Entwurf falsch — melden statt Rules anfassen.
- **Kein zweiter Firestore-Schreibpfad.** `S.coachSession` und `S.coachPush` bleiben rein lokal. Nach `profiles/` schreibt ausschließlich der bestehende `_pushSocialProfile()`.
- **Modul-Bauart** (identisch zu `js/coach-log.js`):
  ```js
  (function (root) {
    'use strict';
    // ... reine Funktionen ...
    var API = { fnA: fnA, fnB: fnB };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    root.CoachX = API;
  })(typeof globalThis !== 'undefined' ? globalThis : this);
  ```
- **Defensive Verdrahtung.** Jeder Einstiegspunkt in `index.html`, der ein Coach-Modul aufruft, steht in `try/catch`. Ein Fehler im Coach darf niemals das laufende Training abbrechen.
- **Kein LLM-Aufruf in Block 3.** Die Tiefe im Training ist vollständig algorithmisch. Ein `fetch` gegen `AI_WORKER_URL` in einer Block-3-Datei ist ein Fehler.
- **Version bumpen** bei jedem Blockabschluss: `APP_VERSION` in `index.html:7380` **und** `CACHE` in `sw.js:2` müssen denselben Wert tragen. Schema `gymtrack-vYYYYMMDDNNNN`.
- **Auto-Push.** Nach jeder abgeschlossenen Task wird committet und nach `origin/main` gepusht, ohne Rückfrage.

---

## Gestaltungsregeln (bindend, aus der Spec)

Kollidiert eine Funktion mit einer dieser Regeln, wird die Funktion beschnitten — nicht die Regel.

1. **Ein Einstieg im Heute-Tab, kein zweiter.** Die bestehende `.aic`-Karte (`index.html:5581`) ist der einzige Zugang zum Coach. Keine neue Karte, Zeile, Kachel oder Schaltfläche auf der Startseite. Kein fünfter Tab.
2. **Im Training steht das Training vorn.** Der Coach hat dort genau eine Fläche: `#wk-coach-bar` (`index.html:6630`). Kein Overlay, nichts Modales, kein Dialog mit Bestätigungszwang.
3. **Höchstens eine Äußerung gleichzeitig.** Neue Meldung verdrängt die vorige. Jede verschwindet nach ihrer Haltezeit von selbst.
4. **Harte Obergrenze pro Einheit:** `inTraining:'key'` → 4 Äußerungen, `'full'` → 8, `'off'` → 0. Danach schweigt der Coach bis zum Ende der Einheit, auch bei zutreffendem Trigger.
5. **Nichts blockiert den Ablauf.** Die Satz-Rückfrage verschwindet nach 8 Sekunden unbeantwortet.
6. **Er spricht nur, wenn er gefragt wird.** Sprachausgabe ausschließlich nach Druck auf den Sprech-Button.
7. **Kein eigenes Aussehen.** Vorhandene Akzentfarbe (`--acc`), Glas-Stil, bestehende Abstände.
8. **Schlicht heißt nicht dünn.** Eine Zeile, die nur „Weiter so!" sagt, wird gestrichen. Eine Zeile mit einer Zahl, die man sonst nicht sieht, bleibt.

---

## File Structure

### Neue Dateien

| Datei | Verantwortung | Global |
| --- | --- | --- |
| `js/coach-persona.js` | Persona normalisieren, Prompt-Zeile bauen, **alle** algorithmischen Coach-Texte in 4 Tönen × 2 Sprachen | `CoachPersona` |
| `js/coach-cache.js` | Entscheidet, ob eine Frage personenbezogen ist; baut den Cache-Schlüssel | `CoachCache` |
| `js/coach-session.js` | Erzählbogen der laufenden Einheit, Obergrenze, Stufenfilter | `CoachSession` |
| `js/coach-warmup.js` | Aufwärmsätze aus dem Arbeitsgewicht, auf verfügbare Scheiben gerundet | `CoachWarmup` |
| `js/coach-cues.js` | Statische Technik-Hinweise je Übung, DE/EN | `CoachCues` |
| `js/coach-notify.js` | Frequenz-Deckel und Planung der lokalen Notifications | `CoachNotify` |
| `js/coach-report.js` | Wochenzahlen und Ziel-Prognose | `CoachReport` |
| `js/coach-voice.js` | Brücke zur Sprachausgabe, Zustand des Sprech-Buttons | `CoachVoice` |
| `ios/App/App/Plugins/TtsPlugin.swift` | `AVSpeechSynthesizer` mit `.duckOthers` | — |

### Neue Testdateien

`test/coach-persona.test.js`, `test/coach-cache.test.js`, `test/coach-session.test.js`, `test/coach-warmup.test.js`, `test/coach-cues.test.js`, `test/coach-notify.test.js`, `test/coach-report.test.js`

### Geänderte Dateien

| Datei | Was |
| --- | --- |
| `index.html` | Skript-Tags, Persona-Defaults, Hub-Overlay, Einrichtung, Verdrahtung aller Module, Name statt „KI-Coach" |
| `js/coach-intent.js` | Router von 8 auf ~20 Intents, Begründungs-Intent |
| `ai-worker/worker.js` | Pro-Nutzer-Budget, Antwort-Cache |
| `ai-worker/wrangler.jsonc` | `USD_PER_USER` statt fixem `GLOBAL_MONTHLY_USD` |
| `sw.js` | Cache-Version je Blockabschluss |
| `ios/App/App/Info.plist` | `NSSpeechRecognitionUsageDescription`, `NSMicrophoneUsageDescription` |

### Verifizierte Anker in `index.html`

Die Zeilennummern in der Spec stammen von einem früheren Stand. **Diese hier gelten** (verifiziert am 2026-07-28, Commit `522a639`):

| Anker | Zeile |
| --- | --- |
| Skript-Tags `js/coach-*.js` | 5546–5548 |
| `<div id="coach-today-card">` | 5581 |
| `<div id="wk-coach-bar">` | 6630 |
| `<div class="ov" id="ov-ai-chat">` | 7294 |
| `const APP_VERSION` | 7380 |
| `const CHANGELOG` | 8316 |
| `S.aiCoach = Object.assign(...)` | 8788 |
| `_coachTodaySuggestion()` | 10591 |
| `renderCoachTodayCard()` | 10670 |
| `_ciReadiness()` | 11305 |
| `_ciAdjustW(w)` | 11386 |
| `toggleSetDone(li,si)` | 16706 |
| `finishWk()` | 16820 |
| `const ICO` | 17147 |
| `const AI_WORKER_URL` | 22697 |
| `isPremium()` | 22708 |
| `premBuy(productId)` | 22753 |
| `_coachBarSet(mode,msg,holdMs)` | 22912 |
| `setAiCoachOpt(key,val)` | 23561 |
| `_aicRenderSugg()` | 23845 |
| `_aicContext()` | 24061 |
| `aicSend()` | 24087 |

**`S.aiCoach.live` wird an vier Stellen abgefragt** — die Spec nennt drei, das ist der korrigierte Stand: `index.html:16398`, `22923`, `23015`, `23120`. Jede Task, die `inTraining` einführt, muss alle vier bedienen.

---

## Reihenfolge und Parallelität

**Alle Blöcke laufen strikt nacheinander. Keine Task wird parallel zu einer anderen ausgeführt.**

Grund: sämtliche Verdrahtung passiert in `index.html`, einer Datei mit rund 1,4 MB. In der Vorsession haben zwei gleichzeitig arbeitende Agenten über den geteilten Git-Index 17 Zeilen fast verloren. Ein zweiter Agent darf höchstens **lesen** (Review), nie schreiben.

Reihenfolge ist inhaltlich bindend:
- **Block 0** senkt die Kosten, bevor die anderen Blöcke Aufrufe erzeugen.
- **Block 1** liefert `say()` — Block 2, 3, 4 und 5 formulieren ausschließlich darüber.
- **Block 2** liefert `speak()`, das Block 3 optional nutzt.
- **Block 4** liefert den Notification-Kanal, den Block 5 für den Wochenbericht braucht.

---

## Blockabschluss-Ritual

**Nach der letzten Task jedes Blocks, bevor der nächste beginnt.** Kein Block gilt als fertig, solange ein Punkt offen ist.

- [ ] **1. Testlauf komplett**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && npm test
```

Erwartung: alle Tests grün, Anzahl höher als beim vorigen Block. Ein einziger roter Test blockiert den Blockabschluss.

- [ ] **2. Echter Durchlauf in der nativen App**

```bash
~/.claude/sim-native.sh gymtrack "iPhone 17"
```

Baut, installiert und startet die App im Simulator. **Nicht** das Browser-Preview-Fenster benutzen — harte Projektregel.

- [ ] **3. Screenshot als Beleg**

```bash
xcrun simctl io "iPhone 17" screenshot /tmp/gymtrack-block-N.png
```

Der Screenshot muss die in diesem Block gebaute Fläche zeigen. Ein Startbildschirm ist kein Beleg.

- [ ] **4. Eigenständige Review-Runde**

Frischen Reviewer auf den Block-Diff ansetzen (`git diff <block-start-sha>..HEAD`). Prüfpunkte: XSS an jeder `innerHTML`-Stelle, Emojis in der Oberfläche, `try/catch` an jedem Coach-Einstieg, keine neue Firestore-Schreibstelle, alle acht Gestaltungsregeln eingehalten. Gefundene Fehler werden **vor** dem nächsten Block behoben.

- [ ] **5. Version und Changelog**

`APP_VERSION` in `index.html:7380` und `CACHE` in `sw.js:2` auf denselben neuen Wert setzen. Neuen Eintrag als **erstes** Element in `CHANGELOG` (`index.html:8316`) einfügen — Key nach dem Muster `cl-2026-07-28-<thema>`, niemals dem Muster `gymtrack-v\d+` folgend.

- [ ] **6. Commit und Push**

```bash
git add -A && git commit -m "feat(coach): Block N — <Thema>" && git push origin main
```

- [ ] **7. Abnahme durch den Nutzer**

Block N vorlegen: was gebaut wurde, Screenshot, Testzahl. Erst nach ausdrücklicher Abnahme mit Block N+1 beginnen.

---

# Block 0 — Kosten-Fundament

**Warum zuerst:** Jeder folgende Block erzeugt Aufrufe. Der heutige globale Deckel steht fix bei 25 $ und würde bei rund 80 voll ausschöpfenden Nutzern die KI **für alle gleichzeitig** abschalten. Router-Ausbau und Antwort-Cache senken die Aufrufzahl, bevor sie steigt.

**Ergebnis:** Der Kostendeckel wächst mit der Nutzerzahl, wiederkehrende sachliche Fragen kosten nichts mehr, und der Router beantwortet gut das Doppelte lokal.

---

### Task 1: Pro-Nutzer-Budget im Worker

Der globale Kostendeckel wird von einem festen Betrag auf `Anzahl Premium-Nutzer × Budget je Nutzer` umgestellt. Der Zähler läuft über den bereits gebundenen KV-Namespace `AI_QUOTA` — kein Firestore, kein neuer Dienst.

**Files:**
- Modify: `ai-worker/worker.js:137-165` (Bereich der Monats-Aggregate) und `ai-worker/worker.js:320-330` (Deckelprüfung)
- Modify: `ai-worker/wrangler.jsonc:11-21`
- Test: manueller Endpunkt-Test gegen den deployten Worker (der Worker hat keine Node-Testsuite; die Testabdeckung liegt in Task 2 im Client-Modul)

**Interfaces:**
- Consumes: `env.AI_QUOTA` (KV), `env.MONTHLY_LIMIT`, `estCostUsd(env, inTok, outTok)`, `monthlyStats(env)` — alle vorhanden
- Produces: `premiumSeen(uid, env)` → `Promise<number>` (Anzahl distinkter Premium-Nutzer im laufenden Monat), `budgetCapUsd(env)` → `Promise<number|null>`

- [ ] **Step 1: Zähler-Funktionen einfügen**

Direkt **nach** `recordUsage(...)` einfügen (die Funktion endet bei `ai-worker/worker.js:165`, vor dem Kommentarblock des nächsten Abschnitts):

```js
// ── Premium-Kopfzahl je Monat (KV) — Basis für den mitwachsenden Kostendeckel ──
// Jeder erfolgreich verifizierte Premium-Nutzer trägt sich einmal pro Monat ein.
// Zwei Schlüssel statt einer Liste: ein Marker je Nutzer (pseen:) und ein
// Gesamtzähler (pcount:). Der Marker verhindert Doppelzählung, ohne dass wir je
// alle uids laden müssen — kv.list() über tausende Schlüssel wäre bei jedem
// Request zu teuer und zählt bei Cloudflare als Liste-Operation.
async function premiumSeen(uid, env) {
  const kv = env.AI_QUOTA;
  if (!kv) return 0;
  const month = new Date().toISOString().slice(0, 7);
  const mark = "pseen:" + uid + ":" + month;
  const cntKey = "pcount:" + month;
  const already = await kv.get(mark);
  let count = parseInt(await kv.get(cntKey)) || 0;
  if (!already) {
    count += 1;
    // 45 Tage: überlebt den Monatswechsel für die Nachlaufzeit des Dashboards,
    // verfällt danach von selbst — kein Aufräum-Job nötig.
    await kv.put(mark, "1", { expirationTtl: 45 * 86400 });
    await kv.put(cntKey, String(count), { expirationTtl: 45 * 86400 });
  }
  return count;
}
// Deckel = Kopfzahl × Budget je Nutzer, mit einem Sockel für den Monatsanfang:
// beim ersten Nutzer des Monats wäre 1 × 0.30 sonst sofort erreicht, sobald ein
// einzelner Nutzer sein Limit ausschöpft. MIN_MONTHLY_USD hält die Untergrenze.
async function budgetCapUsd(uid, env) {
  const perUser = parseFloat(env.USD_PER_USER);
  if (!(perUser > 0)) {
    // Rückwärtskompatibel: solange USD_PER_USER nicht gesetzt ist, gilt der alte
    // feste Deckel unverändert weiter.
    const fixed = parseFloat(env.GLOBAL_MONTHLY_USD);
    return fixed > 0 ? fixed : null;
  }
  const floorUsd = parseFloat(env.MIN_MONTHLY_USD) || 5;
  const heads = await premiumSeen(uid, env);
  return Math.max(floorUsd, heads * perUser);
}
```

- [ ] **Step 2: Deckelprüfung umstellen**

In `ai-worker/worker.js:320-330` den Block ersetzen. **Alt:**

```js
    const budgetUsd = parseFloat(env.GLOBAL_MONTHLY_USD);
    if (budgetUsd > 0) {
      const stats = await monthlyStats(env);
      if (estCostUsd(env, stats.inTok, stats.outTok) >= budgetUsd) {
        await dailyRefund(uid, kind, env);
        await monthlyRefund(uid, env, weight);
        return json({ error: "KI-Monatsbudget erreicht — bitte später erneut versuchen" }, 429, cors);
      }
    }
```

**Neu:**

```js
    const budgetUsd = await budgetCapUsd(uid, env);
    if (budgetUsd > 0) {
      const stats = await monthlyStats(env);
      if (estCostUsd(env, stats.inTok, stats.outTok) >= budgetUsd) {
        await dailyRefund(uid, kind, env);
        await monthlyRefund(uid, env, weight);
        return json({ error: "KI-Monatsbudget erreicht — bitte später erneut versuchen" }, 429, cors);
      }
    }
```

- [ ] **Step 3: Admin-Stats um die Kopfzahl ergänzen**

In `ai-worker/worker.js:204` steht `const budgetUsd = parseFloat(env.GLOBAL_MONTHLY_USD) || null;`. Ersetzen durch:

```js
      const budgetUsd = await budgetCapUsd(uid, env);
      const premiumHeads = parseInt(await (env.AI_QUOTA ? env.AI_QUOTA.get("pcount:" + new Date().toISOString().slice(0, 7)) : null)) || 0;
```

Und im zurückgegebenen Objekt `premiumHeads` mit ausliefern, damit das Dashboard zeigt, worauf der Deckel gerade steht.

- [ ] **Step 4: Konfiguration umstellen**

`ai-worker/wrangler.jsonc` — den `vars`-Block ersetzen:

```jsonc
  "vars": {
    "MODEL": "gemini-3.5-flash-lite",
    "MONTHLY_LIMIT": "150",
    // Kostendeckel wächst mit der Nutzerzahl mit: Deckel = Premium-Köpfe des
    // Monats × USD_PER_USER, mindestens MIN_MONTHLY_USD. Rechnung dahinter:
    // 2,99 € − 15 % Apple = 2,54 € ≈ 2,75 $ netto; 0,30 $ sind 11 % davon.
    // Ein Nutzer, der seine 150 Anfragen komplett ausreizt, kostet ~0,22 $.
    "USD_PER_USER": "0.30",
    "MIN_MONTHLY_USD": "5",
    // Bleibt als Not-Bremse: ist USD_PER_USER leer, gilt wieder dieser feste Wert.
    "GLOBAL_MONTHLY_USD": "25"
  }
```

- [ ] **Step 5: Deployen und prüfen**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack/ai-worker && npx wrangler deploy
```

Danach mit dem Founder-Konto gegen `/admin-stats` prüfen:

```bash
curl -s "https://gymtrack-ai.wolterlenny362.workers.dev/admin-stats?idToken=<FOUNDER_ID_TOKEN>" | head -c 600
```

Erwartung: Die Antwort enthält `"premiumHeads"` mit einer Zahl ≥ 1 und `"budgetUsd"` mit mindestens `5`. Steht dort `budgetUsd: 25`, hat `USD_PER_USER` nicht gegriffen — dann ist die Var beim Deploy verlorengegangen.

**Wichtig:** Die API-Keys liegen als Secrets, nicht als Vars. `--keep-vars` ist dadurch **nicht** mehr nötig; ein normaler `deploy` überschreibt die Secrets nicht.

- [ ] **Step 6: Die beiden Randfälle prüfen, die die Spec verlangt**

Der Worker hat keine Node-Testsuite — `npm test` deckt ihn nicht ab. Die Spec verlangt aber zwei Nachweise, und die werden hier von Hand geführt statt stillschweigend übersprungen.

**a) Monatsgrenze.** Lokal mit einem vorgezogenen Monat starten:

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack/ai-worker && npx wrangler dev --local
```

Im laufenden `wrangler dev` in einer zweiten Shell zwei Schlüssel setzen und lesen:

```bash
npx wrangler kv key put --binding=AI_QUOTA --local "pcount:2026-07" "40" && npx wrangler kv key get --binding=AI_QUOTA --local "pcount:2026-08"
```

Erwartung: der August-Schlüssel ist leer. Der Deckel startet im neuen Monat also bei `MIN_MONTHLY_USD` und nicht mit dem Juli-Stand — genau das soll `budgetCapUsd` tun, weil `premiumSeen()` den Monat im Schlüssel trägt.

**b) Ohne KV-Bindung.** In `wrangler.jsonc` den `kv_namespaces`-Block auskommentieren, `npx wrangler dev --local` starten, eine Chat-Anfrage schicken. Erwartung: die Anfrage geht **durch** (`premiumSeen` gibt `0` zurück, `budgetCapUsd` fällt auf `MIN_MONTHLY_USD`), es gibt keinen 429 und keinen 500. Das ist der bestehende fail-open-Pfad, und er muss unverändert bleiben — ein Deploy ohne KV-Bindung darf die KI nicht für alle abschalten. Danach den Block **wieder einkommentieren**.

- [ ] **Step 7: Commit**

```bash
git add ai-worker/worker.js ai-worker/wrangler.jsonc && git commit -m "feat(ai-worker): Kostendeckel waechst mit der Premium-Nutzerzahl" && git push origin main
```

---

### Task 2: Geteilter Antwort-Cache

Fragen ohne Personenbezug („Wie führe ich Latzug aus?") sind für alle Nutzer identisch. Sie werden 30 Tage lang aus dem KV beantwortet statt aus dem Modell. Die Entscheidung, ob eine Frage personenbezogen ist, trifft ein Klassifikator im Client-Modul — testbar, nachvollziehbar, und im Zweifel gegen den Cache.

**Files:**
- Create: `js/coach-cache.js`
- Create: `test/coach-cache.test.js`
- Modify: `ai-worker/worker.js` (Cache-Lookup im `/chat`-Pfad)
- Modify: `index.html:5548` (Skript-Tag) und `index.html:24087` (`aicSend()` schickt das Cache-Flag mit)

**Interfaces:**
- Consumes: nichts aus früheren Tasks
- Produces:
  - `CoachCache.isPersonal(question, exerciseNames)` → `boolean` — `true`, wenn die Frage sich auf eigene Daten bezieht
  - `CoachCache.cacheKey(question, lang, model)` → `string` — stabiler Schlüssel, gleiche Frage in DE und EN kollidiert nicht
  - `CoachCache.normalize(question)` → `string` — kleingeschrieben, Satzzeichen weg, Mehrfach-Leerzeichen zusammengezogen

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`test/coach-cache.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/coach-cache.js');

const EX = ['Bankdrücken', 'Latzug', 'Kniebeuge'];

test('normalize zieht Satzzeichen und Mehrfach-Leerzeichen weg', () => {
  assert.strictEqual(C.normalize('  Wie   führe ich   Latzug aus?? '), 'wie fuehre ich latzug aus');
});

test('sachliche Technikfrage ist nicht personenbezogen', () => {
  assert.strictEqual(C.isPersonal('Wie führe ich Latzug aus?', EX), false);
  assert.strictEqual(C.isPersonal('Was bringt Kreatin?', EX), false);
  assert.strictEqual(C.isPersonal('How do I perform a lat pulldown?', EX), false);
});

test('Possessivpronomen macht die Frage personenbezogen', () => {
  assert.strictEqual(C.isPersonal('Wie war meine letzte Bank?', EX), true);
  assert.strictEqual(C.isPersonal('Was ist mein Rekord?', EX), true);
  assert.strictEqual(C.isPersonal('How was my last session?', EX), true);
});

test('Zeitbezug macht die Frage personenbezogen', () => {
  assert.strictEqual(C.isPersonal('Was lief gestern?', EX), true);
  assert.strictEqual(C.isPersonal('Wie viel habe ich diese Woche geschafft?', EX), true);
  assert.strictEqual(C.isPersonal('What did I do last week?', EX), true);
});

test('Uebungsname plus Verlaufswort ist personenbezogen', () => {
  assert.strictEqual(C.isPersonal('Wie ist mein Fortschritt bei Kniebeuge?', EX), true);
  assert.strictEqual(C.isPersonal('Bankdrücken Verlauf', EX), true);
});

test('Uebungsname allein ohne Verlaufswort bleibt cachebar', () => {
  assert.strictEqual(C.isPersonal('Welche Muskeln trainiert Latzug?', EX), false);
});

test('im Zweifel nicht cachen: leere oder sehr kurze Frage gilt als personenbezogen', () => {
  assert.strictEqual(C.isPersonal('', EX), true);
  assert.strictEqual(C.isPersonal('und?', EX), true);
});

test('cacheKey ist stabil und sprachgetrennt', () => {
  const a = C.cacheKey('Wie führe ich Latzug aus?', 'de', 'gemini-3.5-flash-lite');
  const b = C.cacheKey('  wie führe ich latzug aus ', 'de', 'gemini-3.5-flash-lite');
  const en = C.cacheKey('Wie führe ich Latzug aus?', 'en', 'gemini-3.5-flash-lite');
  assert.strictEqual(a, b, 'Normalisierung muss denselben Schluessel liefern');
  assert.notStrictEqual(a, en, 'DE und EN duerfen nicht kollidieren');
  assert.match(a, /^c:de:gemini-3\.5-flash-lite:[0-9a-f]{16}$/);
});

test('cacheKey trennt nach Modell', () => {
  const a = C.cacheKey('Was bringt Kreatin?', 'de', 'gemini-3.5-flash-lite');
  const b = C.cacheKey('Was bringt Kreatin?', 'de', 'gemini-3.5-pro');
  assert.notStrictEqual(a, b);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-cache.test.js
```

Erwartung: FAIL mit `Cannot find module '../js/coach-cache.js'`.

- [ ] **Step 3: Modul schreiben**

`js/coach-cache.js`:

```js
/* GymTrack — Antwort-Cache-Klassifikator (Block 0)
   Entscheidet, ob eine Chat-Frage fuer ALLE Nutzer dieselbe Antwort hat.
   Nur solche Fragen duerfen in den geteilten KV-Cache. Die Regel ist bewusst
   streng: im Zweifel NICHT cachen. Eine faelschlich gecachte persoenliche
   Antwort waere ein Datenleck zwischen zwei Nutzern — eine faelschlich nicht
   gecachte Antwort kostet einen halben Cent. */
(function (root) {
  'use strict';

  // Umlaute vereinheitlichen, damit "fuehre" und "führe" denselben Schluessel
  // ergeben. Ohne das haette dieselbe Frage je nach Tastatur zwei Eintraege.
  function normalize(q) {
    return String(q || '')
      .toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Possessiv- und Ich-Bezug in beiden Sprachen. "mein/meine/meiner/..." wird
  // ueber den Wortstamm erfasst, "i" nur als eigenstaendiges Wort (sonst traefe
  // es jedes Wort mit i).
  var SELF = /\b(mein|meine|meiner|meinem|meinen|meins|ich|mir|mich|my|mine|me|i)\b/;

  // Zeitbezug: eine Frage mit Zeitfenster meint fast immer die eigene Historie.
  var TIME = /\b(gestern|heute|vorgestern|letzte|letzter|letztes|letzten|diese|dieser|woche|monat|jahr|zuletzt|bisher|seit|yesterday|today|last|this week|month|year|so far|recent)\b/;

  // Verlaufswoerter: zusammen mit einem Uebungsnamen bedeuten sie "meine Zahlen
  // zu dieser Uebung", nicht "was ist diese Uebung".
  var HIST = /\b(fortschritt|verlauf|entwicklung|rekord|pr|bestleistung|steigerung|plateau|stagnation|geschafft|gemacht|trainiert|progress|history|record|best|improve|stalled)\b/;

  function isPersonal(question, exerciseNames) {
    var q = normalize(question);
    // Zu kurz, um sicher einzuordnen — der Zweifelsfall geht gegen den Cache.
    if (q.length < 8) return true;
    if (SELF.test(q)) return true;
    if (TIME.test(q)) return true;
    if (HIST.test(q)) {
      // Verlaufswort allein reicht schon: "Rekord" ohne Uebung meint trotzdem
      // den eigenen Rekord.
      return true;
    }
    var list = Array.isArray(exerciseNames) ? exerciseNames : [];
    for (var i = 0; i < list.length; i++) {
      var ex = normalize(list[i]);
      if (ex && q.indexOf(ex) >= 0 && (SELF.test(q) || HIST.test(q))) return true;
    }
    return false;
  }

  // FNV-1a, 64 Bit als zwei 32-Bit-Haelften. Kein Krypto-Anspruch — der
  // Schluessel muss nur stabil und kollisionsarm sein, und der Worker soll ohne
  // WebCrypto-Await auskommen.
  function hash16(s) {
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 ^= c; h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 ^= c + i; h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
    }
    return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
  }

  function cacheKey(question, lang, model) {
    return 'c:' + (lang === 'en' ? 'en' : 'de') + ':' + String(model || 'default') + ':' + hash16(normalize(question));
  }

  var API = { normalize: normalize, isPersonal: isPersonal, cacheKey: cacheKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachCache = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Test laufen lassen, grün bestätigen**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-cache.test.js
```

Erwartung: PASS, 9 Tests.

- [ ] **Step 5: Worker-seitigen Cache einbauen**

In `ai-worker/worker.js` **vor** dem LLM-Aufruf (`// 6) LLM aufrufen`, Zeile ~332) einfügen:

```js
    // 5b) Geteilter Antwort-Cache. Der Client entscheidet mit CoachCache.isPersonal(),
    // ob eine Frage cachefaehig ist, und schickt Schluessel + Erlaubnis mit. Der
    // Worker vertraut dem NICHT blind: er cacht ausschliesslich /chat, nur wenn
    // cacheKey dem erwarteten Muster entspricht, und niemals Antworten, die einen
    // Plan-Import enthalten (die sind auf den Nutzer zugeschnitten).
    const ckey = typeof body.cacheKey === 'string' ? body.cacheKey : null;
    const mayCache = path === "/chat" && body.cacheable === true &&
                     ckey && /^c:(de|en):[\w.\-]+:[0-9a-f]{16}$/.test(ckey);
    if (mayCache && env.AI_QUOTA) {
      const hit = await env.AI_QUOTA.get(ckey);
      if (hit) {
        // Treffer kostet nichts — die vorher hochgezaehlten Zaehler zurueckgeben.
        await dailyRefund(uid, kind, env);
        await monthlyRefund(uid, env, weight);
        try {
          const cached = JSON.parse(hit);
          cached.cached = true;
          cached.quota = await quotaPeek(uid, env);
          return json(cached, 200, cors);
        } catch (_) { /* kaputter Eintrag → normal weiter zum Modell */ }
      }
    }
```

Und direkt **nach** `result = stripEmojis(result);` (Zeile ~341):

```js
      if (mayCache && env.AI_QUOTA && !result.plan) {
        // 30 Tage. Kein await auf den Antwortpfad legen — der Nutzer soll nicht
        // auf den Cache-Schreibvorgang warten.
        ctx.waitUntil(env.AI_QUOTA.put(ckey, JSON.stringify({ text: result.text }), { expirationTtl: 30 * 86400 }));
      }
```

**Wenn `ctx` in diesem Scope nicht verfügbar ist:** die `fetch(request, env, ctx)`-Signatur prüfen und `ctx` durchreichen. Ist das nicht ohne Umbau möglich, `await` benutzen — der Cache-Schreibvorgang ist ein einzelner KV-Put von wenigen Millisekunden.

- [ ] **Step 6: Client schickt Schlüssel und Erlaubnis mit**

Skript-Tag ergänzen — nach `index.html:5548`:

```html
<script src="./js/coach-cache.js"></script>
```

In `aicSend()` (`index.html:24087`), dort wo der Request-Body zusammengebaut wird, ergänzen:

```js
  // Cache-Hinweis fuer den Worker: nur sachliche Fragen ohne Personenbezug.
  try {
    const exNames = (S.exercises || []).map(e => e && e.name).filter(Boolean);
    if (!CoachCache.isPersonal(q, exNames)) {
      payload.cacheable = true;
      payload.cacheKey  = CoachCache.cacheKey(q, (localStorage.getItem('gt_lang') === 'en' ? 'en' : 'de'), 'gemini-3.5-flash-lite');
    }
  } catch (_) { /* ohne Cache-Hinweis laeuft der Aufruf normal ans Modell */ }
```

Der Variablenname des Request-Objekts (`payload`) muss an den vorhandenen Code angepasst werden — vor dem Einfügen `aicSend()` lesen.

- [ ] **Step 7: Ende-zu-Ende prüfen**

Worker deployen, dann im Simulator dieselbe sachliche Frage zweimal stellen:

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack/ai-worker && npx wrangler deploy && cd .. && ~/.claude/sim-native.sh gymtrack "iPhone 17"
```

Im Chat „Wie führe ich Latzug aus?" zweimal senden. Erwartung: Die zweite Antwort ist wortgleich und kommt spürbar schneller, und der Anfragezähler im KI-Menü ist **nicht** weitergelaufen. Danach „Wie war meine letzte Bank?" senden — der Zähler muss steigen.

- [ ] **Step 8: Commit**

```bash
git add js/coach-cache.js test/coach-cache.test.js ai-worker/worker.js index.html && git commit -m "feat(coach): geteilter Antwort-Cache fuer Fragen ohne Personenbezug" && git push origin main
```

---

### Task 3: Router-Ausbau von 8 auf 20 Fragen

Jede Frage, die der Router lokal beantwortet, ist eine Frage, die kein Geld kostet, offline funktioniert und sofort da ist. Der bestehende Router (`js/coach-intent.js`) hat acht Intents und eine sorgfältig kommentierte Trefferlogik — diese Logik wird **fortgeführt**, nicht ersetzt.

**Wichtig für den Umsetzenden:** `js/coach-intent.js` enthält im Kopf zwei Mechanismen mit ausführlicher Begründung — `BLOCK` (alles Wertende, Planende, Medizinische geht ans Modell) und `two()` (ein doppeldeutiges Ankerwort zählt nur zusammen mit einem zweiten unabhängigen Signal). **Beide Kommentare vor dem Schreiben lesen.** Die neuen Intents folgen denselben Regeln; ein neuer Intent, der ohne `two()` auf ein Alltagswort matcht, ist ein Fehler.

**Files:**
- Modify: `js/coach-intent.js`
- Modify: `test/coach-intent.test.js`
- Modify: `index.html` — der Datenschnappschuss, der an `resolveIntent()` übergeben wird, braucht neue Felder

**Interfaces:**
- Consumes: nichts aus früheren Tasks
- Produces: `resolveIntent(q, s)` behält seine Signatur. Der Schnappschuss `s` bekommt zwölf neue Felder:
  ```js
  {
    // vorhanden: setsLeft, lastWeightKg, recordKg, recordExName, restSecs,
    //            readinessPct, weekVolumeKg, todayText, ...
    nextSetText:     '3 × 8 bei 62,5 kg',      // string|null
    warmupText:      '20 kg × 5, 30 kg × 3, 40 kg × 1', // string|null
    supersetText:    'Rudern am Kabel',        // string|null
    weekWorkouts:    3,                        // number|null
    weekGoal:        4,                        // number|null
    streakDays:      12,                       // number|null
    lastPrExName:    'Kniebeuge',              // string|null
    lastPrKg:        102.5,                    // number|null
    lastPrDaysAgo:   6,                        // number|null
    avgDurationMin:  58,                       // number|null
    yesterdayText:   'Pull: 18 Saetze, 7.200 kg', // string|null
    muscleVolume:    { brust: 4800, ruecken: 5200 }, // {[k:string]:number}|null
    nextPlanDayText: 'Morgen: Legs',           // string|null
    planNames:       ['Push','Pull','Legs']    // string[]|null
  }
  ```

- [ ] **Step 1: Fehlschlagende Tests schreiben**

An `test/coach-intent.test.js` anhängen:

```js
// ── Block 0: zwoelf neue Intents ──────────────────────────
const S20 = {
  setsLeft: 4, lastWeightKg: 60, recordKg: 100, recordExName: 'Kniebeuge',
  restSecs: 120, readinessPct: 78, weekVolumeKg: 12000, todayText: 'Push-Tag',
  nextSetText: '3 × 8 bei 62,5 kg',
  warmupText: '20 kg × 5, 30 kg × 3, 40 kg × 1',
  supersetText: 'Rudern am Kabel',
  weekWorkouts: 3, weekGoal: 4, streakDays: 12,
  lastPrExName: 'Kniebeuge', lastPrKg: 102.5, lastPrDaysAgo: 6,
  avgDurationMin: 58,
  yesterdayText: 'Pull: 18 Saetze, 7.200 kg',
  muscleVolume: { brust: 4800, ruecken: 5200 },
  nextPlanDayText: 'Morgen: Legs',
  planNames: ['Push', 'Pull', 'Legs'],
};

test('naechster Satz', () => {
  const r = I.resolveIntent('was ist mein naechster satz?', S20);
  assert.strictEqual(r.intent, 'nextSet');
  assert.match(r.answer, /62,5/);
});

test('Aufwaermsaetze', () => {
  const r = I.resolveIntent('wie soll ich mich aufwaermen?', S20);
  assert.strictEqual(r.intent, 'warmup');
  assert.match(r.answer, /20 kg/);
});

test('Supersatz-Partner', () => {
  const r = I.resolveIntent('was passt als supersatz dazu?', S20);
  assert.strictEqual(r.intent, 'superset');
});

test('Wochenfortschritt nennt beide Zahlen', () => {
  const r = I.resolveIntent('wie viele trainings diese woche?', S20);
  assert.strictEqual(r.intent, 'weekProgress');
  assert.match(r.answer, /3/);
  assert.match(r.answer, /4/);
});

test('Streak', () => {
  const r = I.resolveIntent('wie lang ist meine streak?', S20);
  assert.strictEqual(r.intent, 'streak');
  assert.match(r.answer, /12/);
});

test('letzte PR-Uebung', () => {
  const r = I.resolveIntent('wann hatte ich zuletzt einen pr?', S20);
  assert.strictEqual(r.intent, 'lastPr');
  assert.match(r.answer, /Kniebeuge/);
});

test('Trainingsdauer', () => {
  const r = I.resolveIntent('wie lange trainiere ich im schnitt?', S20);
  assert.strictEqual(r.intent, 'duration');
  assert.match(r.answer, /58/);
});

test('was lief gestern', () => {
  const r = I.resolveIntent('was habe ich gestern gemacht?', S20);
  assert.strictEqual(r.intent, 'yesterday');
});

test('Volumen einer Muskelgruppe', () => {
  const r = I.resolveIntent('wie viel volumen brust diese woche?', S20);
  assert.strictEqual(r.intent, 'muscleVolume');
  assert.match(r.answer, /4\.?800/);
});

test('naechster geplanter Tag', () => {
  const r = I.resolveIntent('was steht als naechstes an?', S20);
  assert.strictEqual(r.intent, 'nextPlanDay');
});

test('fehlende Daten liefern null statt erfundener Antwort', () => {
  const leer = Object.assign({}, S20, { streakDays: null, warmupText: null, avgDurationMin: null });
  assert.strictEqual(I.resolveIntent('wie lang ist meine streak?', leer), null);
  assert.strictEqual(I.resolveIntent('wie soll ich mich aufwaermen?', leer), null);
  assert.strictEqual(I.resolveIntent('wie lange trainiere ich im schnitt?', leer), null);
});

test('BLOCK gilt weiter: wertende Fragen gehen ans Modell', () => {
  assert.strictEqual(I.resolveIntent('soll ich lieber mehr volumen bei brust machen?', S20), null);
  assert.strictEqual(I.resolveIntent('warum ist mein naechster satz so schwer?', S20), null);
});

test('englische Varianten treffen', () => {
  assert.strictEqual(I.resolveIntent('whats my next set?', S20).intent, 'nextSet');
  assert.strictEqual(I.resolveIntent('how long is my streak?', S20).intent, 'streak');
  assert.strictEqual(I.resolveIntent('how should i warm up?', S20).intent, 'warmup');
});
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-intent.test.js
```

Erwartung: 13 neue Tests rot, die bestehenden weiter grün. Sind bestehende Tests rot, wurde die Datei falsch angefasst.

- [ ] **Step 3: Die zwölf Intents ergänzen**

In `js/coach-intent.js`, **vor** dem abschließenden `return null;` in `resolveIntent`. Der bestehende `BLOCK`-Test am Funktionsanfang gilt automatisch mit — nicht duplizieren.

```js
    // 9) Naechster Satz — "satz" ist doppeldeutig (Satz im Sprachsinn), deshalb
    // two() mit einem Naechster-Signal.
    if (two(q, /satz|set\b/, /naechst|next|kommt|jetzt|dran/)) {
      if (!s.nextSetText) return null;
      return { intent: 'nextSet', answer: 'Als Naechstes: ' + s.nextSetText + '.' };
    }

    // 10) Aufwaermsaetze — "aufwaerm/warm up" ist im Gym-Chat eindeutig genug.
    if (/aufwaerm|aufwärm|warm.?up|warmup/.test(q)) {
      if (!s.warmupText) return null;
      return { intent: 'warmup', answer: 'Aufwaermen: ' + s.warmupText + '.' };
    }

    // 11) Supersatz-Partner
    if (/supersatz|superset|super.?satz/.test(q)) {
      if (!s.supersetText) return null;
      return { intent: 'superset', answer: 'Passt als Supersatz: ' + s.supersetText + '.' };
    }

    // 12) Wochenfortschritt — "woche" allein ist Alltagswort, braucht ein
    // Trainings-Signal daneben.
    if (two(q, /woche|week/, /training|workout|einheit|session|geschafft|done/)) {
      if (s.weekWorkouts == null) return null;
      var zielTxt = (s.weekGoal != null) ? (' von ' + s.weekGoal) : '';
      return { intent: 'weekProgress', answer: 'Diese Woche ' + s.weekWorkouts + zielTxt + ' Einheiten.' };
    }

    // 13) Streak — Fachwort, eindeutig.
    if (/streak|serie am stueck|serie am stück/.test(q)) {
      if (s.streakDays == null) return null;
      return { intent: 'streak', answer: 'Deine Streak: ' + s.streakDays + ' Tage.' };
    }

    // 14) Letzte PR-Uebung — "pr" nur als eigenstaendiges Wort, sonst traefe es
    // jedes Wort mit dieser Buchstabenfolge.
    if (/\bpr\b|persoenliche bestleistung|persönliche bestleistung|personal record|bestleistung/.test(q)) {
      if (!s.lastPrExName || s.lastPrKg == null) return null;
      var vor = (s.lastPrDaysAgo != null) ? (' (vor ' + s.lastPrDaysAgo + ' Tagen)') : '';
      return { intent: 'lastPr', answer: 'Zuletzt: ' + s.lastPrExName + ' mit ' + num(s.lastPrKg) + ' kg' + vor + '.' };
    }

    // 15) Trainingsdauer
    if (two(q, /lange|dauer|duration|long/, /training|workout|einheit|session|trainier/)) {
      if (s.avgDurationMin == null) return null;
      return { intent: 'duration', answer: 'Im Schnitt ' + s.avgDurationMin + ' Minuten je Einheit.' };
    }

    // 16) Was lief gestern
    if (/gestern|yesterday/.test(q)) {
      if (!s.yesterdayText) return null;
      return { intent: 'yesterday', answer: 'Gestern: ' + s.yesterdayText + '.' };
    }

    // 17) Volumen einer Muskelgruppe — laeuft NACH Intent 7 (Gesamtvolumen),
    // greift also nur, wenn eine Muskelgruppe namentlich vorkommt.
    if (/volumen|volume|tonnage/.test(q) && s.muscleVolume) {
      var keys = Object.keys(s.muscleVolume);
      for (var mi = 0; mi < keys.length; mi++) {
        if (q.indexOf(keys[mi].toLowerCase()) >= 0) {
          return { intent: 'muscleVolume',
                   answer: keys[mi] + ' diese Woche: ' + num(s.muscleVolume[keys[mi]]) + ' kg.' };
        }
      }
    }

    // 18) Naechster geplanter Tag
    if (two(q, /naechst|nächst|next|morgen|tomorrow/, /training|workout|plan|tag|day|an\b/)) {
      if (!s.nextPlanDayText) return null;
      return { intent: 'nextPlanDay', answer: s.nextPlanDayText + '.' };
    }

    // 19) Welche Plaene habe ich
    if (two(q, /plan|plaene|pläne|programm/, /welche|meine|habe ich|which|my/)) {
      if (!s.planNames || !s.planNames.length) return null;
      return { intent: 'planList', answer: 'Deine Plaene: ' + s.planNames.join(', ') + '.' };
    }

    // 20) Pausenempfehlung — bestehender Intent 4 (restSecs) deckt die Frage
    // "wie lange pause" ab; hier nur die Variante mit "empfehlung/wie viel".
    if (two(q, /pause|rest\b/, /empfehl|sollte|wie viel|how much|recommend/)) {
      if (s.restSecs == null) return null;
      return { intent: 'restRec', answer: 'Empfohlen: ' + s.restSecs + ' Sekunden Pause.' };
    }
```

**Reihenfolge beachten:** Intent 17 (Muskelvolumen) muss **nach** dem bestehenden Intent 7 (Gesamtvolumen) stehen, sonst schluckt 17 die allgemeine Volumenfrage.

- [ ] **Step 4: Tests laufen lassen, grün bestätigen**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-intent.test.js
```

Erwartung: alle Tests grün, keiner der bestehenden rot.

- [ ] **Step 5: Schnappschuss in `index.html` erweitern**

Die Funktion finden, die den Schnappschuss für `resolveIntent` baut:

```bash
grep -n "resolveIntent\|_coachSnapshot" index.html
```

Dort die zwölf neuen Felder ergänzen. Jedes Feld, dessen Datenquelle fehlt, wird ausdrücklich auf `null` gesetzt — **nicht** weglassen und **nicht** raten. Ein `null` bedeutet „Router antwortet nicht, Frage geht ans Modell"; ein erfundener Wert wäre eine Falschaussage des Coaches.

- [ ] **Step 6: Im Simulator prüfen**

```bash
~/.claude/sim-native.sh gymtrack "iPhone 17"
```

Im Chat nacheinander stellen: „Wie lang ist meine Streak?", „Wie soll ich mich aufwärmen?", „Was steht als Nächstes an?". Erwartung: alle drei kommen **sofort** und ohne Ladepunkte — das ist der Beleg, dass der Router und nicht das Modell geantwortet hat. Der Anfragezähler im KI-Menü darf sich nicht bewegen.

- [ ] **Step 7: Commit**

```bash
git add js/coach-intent.js test/coach-intent.test.js index.html && git commit -m "feat(coach): Router beantwortet zwoelf weitere Fragen lokal" && git push origin main
```

---

### Task 4: Begründungs-Intent „Warum 62,5?"

Der Coach schlägt Gewichte vor, erklärt sie aber nie. Diese Frage stellt jeder Nutzer irgendwann, und heute kostet sie jedes Mal einen Modellaufruf. Sie ist vollständig aus der Progressionsregel beantwortbar.

**Files:**
- Modify: `js/coach-intent.js`
- Modify: `test/coach-intent.test.js`
- Modify: `index.html` — Schnappschuss um `weightReason` erweitern

**Interfaces:**
- Consumes: `resolveIntent(q, s)` aus Task 3
- Produces: neues Schnappschuss-Feld
  ```js
  weightReason: {
    exName:    'Bankdrücken',  // string
    fromKg:    60,             // number
    toKg:      62.5,           // number
    stepKg:    2.5,            // number
    reason:    'repsHigh',     // 'repsHigh'|'repsLow'|'checkinUp'|'checkinDown'|'hold'
    lastReps:  [8,8,8],        // number[]
    repRange:  [6,8],          // [number,number]
    ciFactor:  1.0             // number — Faktor aus _ciAdjustW, 1.0 = unveraendert
  }
  ```
  `null`, wenn gerade kein Vorschlag aktiv ist.

- [ ] **Step 1: Fehlschlagende Tests schreiben**

An `test/coach-intent.test.js` anhängen:

```js
// ── Block 0: Begruendung des Gewichtsvorschlags ────────────
const WR = {
  exName: 'Bankdrücken', fromKg: 60, toKg: 62.5, stepKg: 2.5,
  reason: 'repsHigh', lastReps: [8, 8, 8], repRange: [6, 8], ciFactor: 1.0,
};
const SWR = Object.assign({}, S20, { weightReason: WR });

test('warum-Frage mit Zahl wird begruendet', () => {
  const r = I.resolveIntent('warum 62,5?', SWR);
  assert.strictEqual(r.intent, 'weightWhy');
  assert.match(r.answer, /8/);
  assert.match(r.answer, /2,5|2\.5/);
});

test('warum-Frage ohne Zahl trifft auch', () => {
  assert.strictEqual(I.resolveIntent('warum dieses gewicht?', SWR).intent, 'weightWhy');
  assert.strictEqual(I.resolveIntent('wie kommst du auf das gewicht?', SWR).intent, 'weightWhy');
  assert.strictEqual(I.resolveIntent('why this weight?', SWR).intent, 'weightWhy');
});

test('Check-in-Absenkung wird als Grund genannt', () => {
  const s = Object.assign({}, S20, {
    weightReason: Object.assign({}, WR, { reason: 'checkinDown', toKg: 55, ciFactor: 0.92 }),
  });
  const r = I.resolveIntent('warum 55?', s);
  assert.strictEqual(r.intent, 'weightWhy');
  assert.match(r.answer, /Check-in|Erholung/i);
});

test('ohne aktiven Vorschlag antwortet der Router nicht', () => {
  const s = Object.assign({}, S20, { weightReason: null });
  assert.strictEqual(I.resolveIntent('warum 62,5?', s), null);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-intent.test.js
```

Erwartung: 4 Tests rot.

- [ ] **Step 3: `BLOCK` gezielt öffnen und Intent einbauen**

`BLOCK` (Zeile 22 in `js/coach-intent.js`) enthält `warum` und `erklaer` — die Begründungsfrage würde sonst nie ankommen. **Nicht** `warum` aus `BLOCK` entfernen (dann rutschen wertende Fragen durch). Stattdessen diesen Intent **vor** der `BLOCK`-Prüfung platzieren, als einzige begründete Ausnahme, und mit einem eng gefassten Muster:

Ganz am Anfang von `resolveIntent`, **vor** `if (BLOCK.test(q)) return null;`:

```js
    // AUSNAHME VOR BLOCK: "warum" steht in BLOCK, weil wertende Warum-Fragen ans
    // Modell gehoeren. Genau eine Warum-Frage ist aber vollstaendig aus der
    // Progressionsregel beantwortbar — die nach dem vorgeschlagenen Gewicht.
    // Das Muster ist bewusst eng: es verlangt "warum/wieso/why" ZUSAMMEN mit
    // einem Gewichts-Signal (Zahl mit kg, das Wort Gewicht, oder genau die
    // vorgeschlagene Zahl). "Warum tut mir die Schulter weh" trifft nicht.
    if (s && s.weightReason) {
      var wr = s.weightReason;
      var zahl = String(wr.toKg).replace('.', '[.,]');
      var whyRe = new RegExp('(warum|wieso|weshalb|why|wie kommst du|how come).{0,24}(' + zahl + '|gewicht|weight|kilo|kg)');
      if (whyRe.test(q)) {
        return { intent: 'weightWhy', answer: _whyText(wr) };
      }
    }
```

Und die Textfunktion oberhalb von `resolveIntent` ergänzen:

```js
  // Begruendung aus der Progressionsregel. Bewusst konkret: Zahl, Regel,
  // Schrittweite. Ein "weil du bereit bist" waere wertlos.
  function _whyText(wr) {
    var von = num(wr.fromKg), bis = num(wr.toKg), step = num(wr.stepKg);
    var reps = Array.isArray(wr.lastReps) ? wr.lastReps.join('/') : '';
    var obere = Array.isArray(wr.repRange) ? wr.repRange[1] : null;
    switch (wr.reason) {
      case 'repsHigh':
        return 'Du hast ' + reps + ' Wiederholungen bei ' + von + ' kg geschafft — das ist das obere Ende deines Bereichs' +
               (obere ? ' (' + wr.repRange[0] + '–' + obere + ')' : '') +
               '. Deshalb eine Stufe hoch: +' + step + ' kg auf ' + bis + ' kg.';
      case 'repsLow':
        return 'Bei ' + von + ' kg kamen zuletzt ' + reps + ' Wiederholungen — unter deinem Bereich' +
               (obere ? ' (' + wr.repRange[0] + '–' + obere + ')' : '') +
               '. Deshalb bleibt das Gewicht bei ' + bis + ' kg, bis der Bereich wieder steht.';
      case 'checkinDown':
        return 'Dein Check-in meldet wenig Erholung. Ich nehme ' + Math.round((1 - (wr.ciFactor || 1)) * 100) +
               ' % raus: ' + bis + ' kg statt ' + von + ' kg. Naechste Einheit geht es zurueck hoch.';
      case 'checkinUp':
        return 'Dein Check-in war stark, deshalb die groessere Stufe: ' + bis + ' kg statt ' + von + ' kg.';
      default:
        return von === bis
          ? 'Gleiches Gewicht wie zuletzt: ' + bis + ' kg. Der Wiederholungsbereich steht noch nicht sauber.'
          : von + ' kg auf ' + bis + ' kg, Schrittweite ' + step + ' kg.';
    }
  }
```

- [ ] **Step 4: Tests laufen lassen, grün bestätigen**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-intent.test.js
```

Erwartung: alle grün. Besonders prüfen, dass der bestehende Test zu wertenden Warum-Fragen weiter besteht.

- [ ] **Step 5: `weightReason` in `index.html` füllen**

Die Progressionslogik liegt bei `_ciAdjustW(w)` (`index.html:11386`) und der Double-Progression darum herum. Beim Berechnen des Vorschlags das Objekt in einer Modulvariablen ablegen:

```js
// Letzter Gewichtsvorschlag samt Begruendung — fuettert den weightWhy-Intent.
// Bewusst nur im Speicher: die Begruendung gilt fuer genau diesen Moment.
let _lastWeightReason = null;
```

und im Schnappschuss `weightReason: _lastWeightReason` mitgeben.

- [ ] **Step 6: Im Simulator prüfen**

Training starten, eine Übung öffnen, im Chat „Warum 62,5?" fragen (die tatsächlich vorgeschlagene Zahl einsetzen). Erwartung: sofortige Antwort mit der konkreten Regel. Danach „Warum tut mir die Schulter weh?" — muss ans Modell gehen, nicht vom Router beantwortet werden.

- [ ] **Step 7: Commit**

```bash
git add js/coach-intent.js test/coach-intent.test.js index.html && git commit -m "feat(coach): Coach begruendet seinen Gewichtsvorschlag lokal" && git push origin main
```

---

### Task 5: Kontextabhängige Frage-Chips

Die Chips über dem Eingabefeld sind heute eine feste Liste von vier Vorschlägen (`_aicRenderSugg()`, `index.html:23845`), die alle ins Modell führen. Sie werden kontextabhängig und bevorzugt mit Fragen belegt, die der Router lokal beantwortet.

**Files:**
- Modify: `index.html:23845-23851` (`_aicRenderSugg`)

**Interfaces:**
- Consumes: `resolveIntent()` aus Task 3 und 4
- Produces: keine neue API

- [ ] **Step 1: `_aicRenderSugg` ersetzen**

Die Funktion vollständig ersetzen:

```js
function _aicRenderSugg(){
  const el = document.getElementById('aic-sugg'); if (!el) return;
  if (_aicHist.length) { el.innerHTML = ''; return; }
  // Drei Vorschlaege statt vier, abhaengig vom Zustand. Die ersten beiden
  // beantwortet der Router lokal (kostenlos, sofort, offline) — nur der dritte
  // geht ans Modell. Genau so herum, nicht umgekehrt.
  let sugg;
  if (typeof WK !== 'undefined' && WK && WK.active) {
    sugg = ['Was ist mein nächster Satz?', 'Wie soll ich mich aufwärmen?', 'Alternative zu dieser Übung'];
  } else if (S.sessions && S.sessions.length && (Date.now() - (S.sessions[S.sessions.length-1].ts||0)) < 6*3600e3) {
    sugg = ['Wie lief die Einheit?', 'Wie lang ist meine Streak?', 'Wie kann ich mein Volumen steigern?'];
  } else {
    sugg = ['Was steht als Nächstes an?', 'Wie viele Trainings diese Woche?', 'Erstelle mir einen Trainingsplan'];
  }
  // esc() beim Rendern UND beim Einsetzen ins Eingabefeld: die Texte sind zwar
  // hier fest verdrahtet, aber die Stelle darf nicht die eine sein, an der man
  // spaeter versehentlich Nutzerinhalt durchreicht.
  el.innerHTML = sugg.map((s, i) =>
    `<button type="button" data-sg="${i}">${esc(tr(s))}</button>`).join('');
  el.querySelectorAll('button[data-sg]').forEach((b, i) => {
    b.onclick = () => {
      const inp = document.getElementById('aic-in');
      if (inp) { inp.value = tr(sugg[i]); aicSend(); }
    };
  });
}
```

**Der bisherige `onclick`-String mit `replace(/'/g,"\\'")` verschwindet damit** — das war eine Injektionsstelle, sobald dort je ein Übungsname gelandet wäre.

- [ ] **Step 2: Übersetzungen ergänzen**

Die sechs neuen Strings in `I18N_EN` eintragen:

```js
  'Was ist mein nächster Satz?':'What is my next set?',
  'Wie soll ich mich aufwärmen?':'How should I warm up?',
  'Alternative zu dieser Übung':'Alternative to this exercise',
  'Wie lief die Einheit?':'How did the session go?',
  'Wie lang ist meine Streak?':'How long is my streak?',
  'Was steht als Nächstes an?':'What is up next?',
  'Wie viele Trainings diese Woche?':'How many workouts this week?',
```

- [ ] **Step 3: Prüfen, dass `WK.active` der richtige Zustandsname ist**

```bash
grep -n "WK.active\|WK = {" index.html | head -5
```

Heißt die Variable anders, den Namen im Code oben anpassen. **Nicht** raten — die Bedingung entscheidet, welche Chips erscheinen.

- [ ] **Step 4: Im Simulator prüfen**

```bash
~/.claude/sim-native.sh gymtrack "iPhone 17"
```

Chat einmal ohne laufendes Training öffnen, einmal während eines Trainings. Erwartung: unterschiedliche Chips. Auf einen der ersten beiden tippen — die Antwort muss sofort erscheinen, ohne Ladepunkte.

- [ ] **Step 5: Commit**

```bash
git add index.html && git commit -m "feat(coach): Frage-Chips richten sich nach dem Zustand und fuehren in den Router" && git push origin main
```

---

## Blockabschluss 0

Ritual von oben durchlaufen. Changelog-Key: `cl-2026-07-28-coach-schneller`. Einträge für den Nutzer formuliert, nicht technisch — Beispiel:

```js
  'cl-2026-07-28-coach-schneller': {
    label: '28.07.2026 · Der Coach antwortet schneller und kostet weniger',
    items: [
      'Zwölf weitere Fragen beantwortet die App sofort selbst — ohne Wartezeit und auch ohne Empfang im Keller-Gym',
      'Neu: Frag „Warum 62,5?" und der Coach erklärt dir seine Rechnung hinter dem Gewichtsvorschlag',
      'Die Vorschläge über dem Eingabefeld richten sich jetzt danach, ob du gerade trainierst oder fertig bist',
      'Allgemeine Technikfragen werden gemerkt — dieselbe Frage kommt beim nächsten Mal sofort zurück',
    ]
  },
```

---

# Block 1 — Persona, Coach-Hub, Einrichtung beim Kauf

**Warum jetzt:** `say()` ist die Sprachfabrik für alles Folgende. Blöcke 2 bis 5 formulieren ausschließlich darüber — ohne diesen Block würde jede spätere Textstelle den Ton selbst behandeln, und der Ton liefe je nach Stelle auseinander.

**Ergebnis:** Der Coach hat einen Namen, den der Nutzer vergibt, einen von vier Tönen, ein Zuhause (den Hub hinter der bestehenden `.aic`-Karte) und eine Einrichtung, die direkt nach dem Abo-Abschluss fragt, wie sehr er sich einmischen soll.

---

### Task 6: `coach-persona.js` — Name, Ton, Sprachfabrik

**Files:**
- Create: `js/coach-persona.js`
- Create: `test/coach-persona.test.js`

**Interfaces:**
- Consumes: nichts aus früheren Tasks
- Produces:
  - `CoachPersona.personaGet(aiCoach)` → `{name, tone, voice, voiceOn, preset, inTraining, setFeedback, pushLevel}` — normalisiert, jedes Feld garantiert gültig
  - `CoachPersona.personaLine(persona, lang)` → `string` — eine Zeile für den System-Prompt des Modells
  - `CoachPersona.say(key, vars, persona, lang)` → `string` — der Coach-Satz im gewählten Ton
  - `CoachPersona.KEYS` → `string[]` — alle gültigen Satz-Schlüssel
  - `CoachPersona.TONES` → `['ruhig','sachlich','hart','locker']`
  - `CoachPersona.PRESETS` → `{quiet, balanced, close}`, jeweils `{inTraining, setFeedback, pushLevel}`

**Abweichung von der Spec, bewusst:** Die Spec schreibt `say(key, vars)`. Das Modul kennt keine globalen App-Variablen — Persona und Sprache müssen hereinkommen. Die Signatur ist deshalb `say(key, vars, persona, lang)`. In `index.html` steht ein dünner Wrapper `_say(key, vars)`, der beides aus `S.aiCoach` und `localStorage['gt_lang']` zieht; die Aufrufstellen sehen die Kurzform der Spec.

- [ ] **Step 1: Fehlschlagende Tests schreiben**

`test/coach-persona.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const P = require('../js/coach-persona.js');

test('personaGet fuellt Defaults', () => {
  const p = P.personaGet(undefined);
  assert.strictEqual(p.name, 'Coach');
  assert.strictEqual(p.tone, 'sachlich');
  assert.strictEqual(p.voice, null);
  assert.strictEqual(p.voiceOn, true);
  assert.strictEqual(p.inTraining, 'key');
  assert.strictEqual(p.setFeedback, true);
  assert.strictEqual(p.pushLevel, 'normal');
});

test('unbekannter Ton faellt auf sachlich zurueck', () => {
  assert.strictEqual(P.personaGet({ tone: 'boese' }).tone, 'sachlich');
  assert.strictEqual(P.personaGet({ tone: null }).tone, 'sachlich');
  assert.strictEqual(P.personaGet({ tone: 42 }).tone, 'sachlich');
});

test('Name wird auf 20 Zeichen gekuerzt und getrimmt', () => {
  assert.strictEqual(P.personaGet({ name: '   Max   ' }).name, 'Max');
  assert.strictEqual(P.personaGet({ name: 'A'.repeat(40) }).name.length, 20);
});

test('Name mit Markup wird entschaerft', () => {
  const p = P.personaGet({ name: '<img src=x onerror=alert(1)>' });
  assert.ok(!/[<>]/.test(p.name), 'spitze Klammern duerfen nicht ueberleben');
});

test('leerer Name faellt auf Coach zurueck', () => {
  assert.strictEqual(P.personaGet({ name: '   ' }).name, 'Coach');
  assert.strictEqual(P.personaGet({ name: '<<<>>>' }).name, 'Coach');
});

test('unbekannte Stufen fallen auf Defaults zurueck', () => {
  assert.strictEqual(P.personaGet({ inTraining: 'laut' }).inTraining, 'key');
  assert.strictEqual(P.personaGet({ pushLevel: 'dauernd' }).pushLevel, 'normal');
});

test('jeder Key liefert in jedem Ton und beiden Sprachen einen Satz', () => {
  const vars = { name: 'Max', ex: 'Bankdrücken', kg: 62.5, reps: 8, sets: 3,
                 vol: 7200, pct: 12, days: 5, weeks: 7, mins: 45, secs: 90, count: 4 };
  for (const key of P.KEYS) {
    for (const tone of P.TONES) {
      for (const lang of ['de', 'en']) {
        const out = P.say(key, vars, P.personaGet({ tone, name: 'Max' }), lang);
        assert.strictEqual(typeof out, 'string', key + '/' + tone + '/' + lang + ' liefert keinen String');
        assert.ok(out.length > 0, key + '/' + tone + '/' + lang + ' ist leer');
        assert.notStrictEqual(out, key, key + '/' + tone + '/' + lang + ' gibt den Key zurueck');
        assert.ok(!/\{[a-z]+\}/i.test(out), key + '/' + tone + '/' + lang + ' hat einen ungefuellten Platzhalter: ' + out);
      }
    }
  }
});

test('vier Toene liefern fuer greet vier verschiedene Saetze', () => {
  const seen = new Set();
  for (const tone of P.TONES) {
    seen.add(P.say('greet', { name: 'Max', ex: 'Push' }, P.personaGet({ tone }), 'de'));
  }
  assert.strictEqual(seen.size, 4, 'die Toene duerfen sich nicht doppeln');
});

test('unbekannter Key liefert leeren String statt zu werfen', () => {
  assert.strictEqual(P.say('gibtsnicht', {}, P.personaGet({}), 'de'), '');
});

test('fehlende Variable laesst keinen Platzhalter stehen', () => {
  const out = P.say('exOpen', {}, P.personaGet({}), 'de');
  assert.ok(!/\{[a-z]+\}/i.test(out), 'ungefuellter Platzhalter: ' + out);
});

test('Zahlen werden deutsch mit Komma, englisch mit Punkt gesetzt', () => {
  const de = P.say('exOpen', { ex: 'Bank', kg: 62.5, reps: 8, sets: 3 }, P.personaGet({}), 'de');
  const en = P.say('exOpen', { ex: 'Bench', kg: 62.5, reps: 8, sets: 3 }, P.personaGet({}), 'en');
  assert.match(de, /62,5/);
  assert.match(en, /62\.5/);
});

test('personaLine nennt Name und Ton', () => {
  const line = P.personaLine(P.personaGet({ name: 'Nina', tone: 'hart' }), 'de');
  assert.match(line, /Nina/);
  assert.ok(line.length > 20 && line.length < 400, 'Prompt-Zeile bleibt kurz');
});

test('PRESETS setzen die drei Schalter vollstaendig', () => {
  for (const k of ['quiet', 'balanced', 'close']) {
    const pr = P.PRESETS[k];
    assert.ok(pr, k + ' fehlt');
    assert.ok(['off', 'key', 'full'].includes(pr.inTraining));
    assert.strictEqual(typeof pr.setFeedback, 'boolean');
    assert.ok(['still', 'normal', 'eng'].includes(pr.pushLevel));
  }
  assert.strictEqual(P.PRESETS.quiet.inTraining, 'off');
  assert.strictEqual(P.PRESETS.balanced.inTraining, 'key');
  assert.strictEqual(P.PRESETS.close.inTraining, 'full');
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-persona.test.js
```

Erwartung: FAIL mit `Cannot find module '../js/coach-persona.js'`.

- [ ] **Step 3: Modul schreiben — Gerüst**

`js/coach-persona.js`:

```js
/* GymTrack — Persona und Sprachfabrik (Block 1)
   JEDER algorithmische Satz des Coaches laeuft durch say(). Ohne diesen einen
   Punkt muesste jede Textstelle den Ton selbst behandeln, und der Ton liefe je
   nach Stelle auseinander. Kein DOM, keine App-Globals — Persona und Sprache
   kommen als Argument herein. */
(function (root) {
  'use strict';

  var TONES = ['ruhig', 'sachlich', 'hart', 'locker'];
  var LEVELS = ['off', 'key', 'full'];
  var PUSH = ['still', 'normal', 'eng'];

  var PRESETS = {
    quiet:    { inTraining: 'off',  setFeedback: false, pushLevel: 'still'  },
    balanced: { inTraining: 'key',  setFeedback: true,  pushLevel: 'normal' },
    close:    { inTraining: 'full', setFeedback: true,  pushLevel: 'eng'    },
  };

  function pick(v, list, fallback) { return list.indexOf(v) >= 0 ? v : fallback; }

  // Der Name landet spaeter per innerHTML auf dem Bildschirm. esc() sitzt zwar
  // an der Renderstelle, aber der Name geht auch in Notification-Titel und in
  // den Prompt — Stellen ohne esc(). Deshalb wird hier hart entschaerft statt
  // sich auf die Renderstelle zu verlassen.
  function cleanName(n) {
    var s = String(n == null ? '' : n).replace(/[<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20).trim();
    return s || 'Coach';
  }

  function personaGet(a) {
    a = (a && typeof a === 'object') ? a : {};
    return {
      name:        cleanName(a.name),
      tone:        pick(a.tone, TONES, 'sachlich'),
      voice:       (typeof a.voice === 'string' && a.voice) ? a.voice : null,
      voiceOn:     a.voiceOn !== false,
      preset:      (a.preset === 'quiet' || a.preset === 'balanced' || a.preset === 'close' || a.preset === 'custom') ? a.preset : undefined,
      inTraining:  pick(a.inTraining, LEVELS, 'key'),
      setFeedback: a.setFeedback !== false,
      pushLevel:   pick(a.pushLevel, PUSH, 'normal'),
      insights:    a.insights !== false,
    };
  }

  // Zahlen: deutsch Komma, englisch Punkt; Tausender nur bei Volumen sinnvoll,
  // deshalb erst ab vier Stellen.
  function fmtNum(v, lang) {
    if (typeof v !== 'number' || !isFinite(v)) return String(v == null ? '' : v);
    var s = (Math.round(v * 10) / 10).toString();
    if (Math.abs(v) >= 1000) {
      var parts = s.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'en' ? ',' : '.');
      s = parts.join(lang === 'en' ? '.' : ',');
      return s;
    }
    return lang === 'en' ? s : s.replace('.', ',');
  }

  // Platzhalter {x} fuellen. Ein Platzhalter ohne Wert wird samt umgebendem
  // Leerzeichen entfernt statt als "{kg}" stehenzubleiben — ein sichtbarer
  // Platzhalter ist schlimmer als ein etwas duennerer Satz.
  function fill(tpl, vars, lang) {
    return String(tpl)
      .replace(/\s*\{(\w+)\}/g, function (m, k) {
        var v = vars ? vars[k] : undefined;
        if (v === undefined || v === null || v === '') return '';
        return (m[0] === ' ' ? ' ' : '') + (typeof v === 'number' ? fmtNum(v, lang) : String(v));
      })
      .replace(/\s+([.,!?;:])/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function say(key, vars, persona, lang) {
    var l = (lang === 'en') ? 'en' : 'de';
    var p = persona && persona.tone ? persona : personaGet(persona);
    var byKey = TXT[l] && TXT[l][key];
    if (!byKey) return '';
    var tpl = byKey[p.tone] || byKey.sachlich;
    if (!tpl) return '';
    var v = Object.assign({ name: p.name }, vars || {});
    return fill(tpl, v, l);
  }

  function personaLine(persona, lang) {
    var p = persona && persona.tone ? persona : personaGet(persona);
    return (lang === 'en' ? PROMPT.en : PROMPT.de)[p.tone].replace('{name}', p.name);
  }

  var API = { personaGet: personaGet, personaLine: personaLine, say: say,
              KEYS: null /* Step 4 */, TONES: TONES, LEVELS: LEVELS, PUSH: PUSH, PRESETS: PRESETS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachPersona = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Satzkatalog schreiben**

In dieselbe Datei, **oberhalb** von `personaGet`, die Tabellen `PROMPT` und `TXT` einfügen.

**Die vier Töne, verbindlich definiert** — daran werden alle Sätze gemessen:

| Ton | Haltung | Satzbau | Verboten |
| --- | --- | --- | --- |
| `ruhig` | gelassen, ohne Druck, nimmt Last raus | kurze Hauptsätze, keine Ausrufezeichen | Superlative, Antreiben |
| `sachlich` | neutraler Beobachter, nennt Zahlen | Aussagesatz, Zahl vorn | Bewertung, Emotion |
| `hart` | fordernd, knapp, direkte Ansprache | Imperativ, maximal 8 Wörter | Entschuldigungen, Weichmacher |
| `locker` | kumpelhaft, leicht, augenzwinkernd | Umgangssprache, gern Frage | Anbiederung, Ironie über den Nutzer |

**Der Prompt-Block:**

```js
  var PROMPT = {
    de: {
      ruhig:    'Du heisst {name}. Sprich ruhig und ohne Druck, kurze Hauptsaetze, keine Ausrufezeichen.',
      sachlich: 'Du heisst {name}. Sprich sachlich und knapp, nenne Zahlen, bewerte nicht.',
      hart:     'Du heisst {name}. Sprich fordernd und direkt, maximal acht Woerter je Satz, keine Weichmacher.',
      locker:   'Du heisst {name}. Sprich locker und umgangssprachlich, wie ein Trainingspartner, ohne Anbiederung.',
    },
    en: {
      ruhig:    'Your name is {name}. Speak calmly, no pressure, short sentences, no exclamation marks.',
      sachlich: 'Your name is {name}. Speak factually and briefly, state numbers, do not judge.',
      hart:     'Your name is {name}. Speak directly and demanding, max eight words per sentence, no hedging.',
      locker:   'Your name is {name}. Speak casually, like a training partner, without pandering.',
    },
  };
```

**Der Satzkatalog** hat 24 Schlüssel. Jeder Schlüssel existiert in `TXT.de` und `TXT.en` mit allen vier Tönen. Der Vollständigkeitstest aus Step 1 erzwingt das — er schlägt fehl, sobald eine Kombination fehlt oder ein Platzhalter ungefüllt bleibt.

| Key | Wann | Platzhalter |
| --- | --- | --- |
| `greet` | Trainingsstart, mit Bezug auf die letzte gleichartige Einheit | `{ex} {kg} {reps} {sets}` |
| `greetFirst` | erste Einheit dieses Plans überhaupt | `{ex}` |
| `mid` | Halbzeit, Einordnung zum letzten Volumen | `{vol} {pct}` |
| `exOpen` | Übung geöffnet: Zielsätze, letztes Gewicht | `{ex} {kg} {reps} {sets}` |
| `warmupIntro` | Aufwärmschema angesagt | `{ex}` |
| `setAsk` | Satz-Rückfrage, Frage über den Chips | — |
| `setAckEasy` | Antwort „leicht" quittiert | `{kg}` |
| `setAckHard` | Antwort „schwer" quittiert | `{kg}` |
| `restTip` | Technikpunkt im Pausenfenster | `{ex}` |
| `restNext` | Ankündigung des nächsten Satzes in der Pause | `{kg} {reps}` |
| `fatigue` | Ermüdungsmuster erkannt | — |
| `stall` | 12 Minuten ohne Satz | — |
| `debrief` | Abschluss-Urteil nach dem Speichern | `{sets} {vol}` |
| `recall` | Rückblick auf einen eigenen Tipp | `{ex}` |
| `plateau` | Plateau beschrieben, nicht vorgeschrieben | `{ex} {weeks} {secs}` |
| `timeBudget` | Zeitbudget angenommen | `{mins} {count}` |
| `cue` | Technik-Hinweis vor der ersten schweren Übung | `{ex}` |
| `prCongrats` | PR unmittelbar nach der Einheit | `{ex} {kg}` |
| `deload` | Deload-Hinweis | — |
| `returnNudge` | nach 5 Tagen ohne Einheit | `{days}` |
| `anniversary` | Jahrestag-Rückblick | `{ex} {kg}` |
| `reminderPlan` | Trainings-Erinnerung mit Inhalt | `{ex} {kg} {reps} {sets}` |
| `reportReady` | Wochenbericht liegt bereit | `{vol}` |
| `forecast` | Ziel-Prognose im Bericht | `{ex} {kg} {weeks}` |

Das sind 24 Schlüssel; `KEYS` wird daraus abgeleitet statt von Hand gepflegt:

```js
  var KEYS = Object.keys(TXT.de);
```

und im `API`-Objekt `KEYS: KEYS` statt `null`.

**Beispiel für einen vollständig ausformulierten Schlüssel** — alle übrigen folgen exakt diesem Aufbau:

```js
  var TXT = {
    de: {
      greet: {
        ruhig:    'Schoen, dass du da bist. Zuletzt {ex}: {sets} × {reps} bei {kg} kg.',
        sachlich: 'Letzte gleiche Einheit: {ex}, {sets} × {reps} bei {kg} kg.',
        hart:     'Los. Zuletzt {kg} kg bei {ex}. Heute mehr.',
        locker:   'Na dann. Beim letzten Mal {ex} mit {kg} kg — schauen wir mal.',
      },
      debrief: {
        ruhig:    'Fertig. {sets} Saetze, {vol} kg bewegt. Das reicht fuer heute.',
        sachlich: '{sets} Saetze, {vol} kg Gesamtvolumen.',
        hart:     '{sets} Saetze, {vol} kg. Abgehakt.',
        locker:   'Und durch — {sets} Saetze, {vol} kg auf der Uhr.',
      },
      prCongrats: {
        ruhig:    'Neuer Bestwert bei {ex}: {kg} kg.',
        sachlich: 'PR: {ex}, {kg} kg.',
        hart:     '{kg} kg bei {ex}. Neuer Bestwert. Weiter.',
        locker:   'Bestwert geknackt: {ex} mit {kg} kg.',
      },
      // ... die uebrigen 21 Keys nach demselben Muster
    },
    en: {
      greet: {
        ruhig:    'Good to see you. Last time {ex}: {sets} × {reps} at {kg} kg.',
        sachlich: 'Last matching session: {ex}, {sets} × {reps} at {kg} kg.',
        hart:     'Go. Last time {kg} kg on {ex}. More today.',
        locker:   'Alright. Last time {ex} at {kg} kg — let us see.',
      },
      debrief: {
        ruhig:    'Done. {sets} sets, {vol} kg moved. That is enough for today.',
        sachlich: '{sets} sets, {vol} kg total volume.',
        hart:     '{sets} sets, {vol} kg. Done.',
        locker:   'And that is a wrap — {sets} sets, {vol} kg on the clock.',
      },
      prCongrats: {
        ruhig:    'New best on {ex}: {kg} kg.',
        sachlich: 'PR: {ex}, {kg} kg.',
        hart:     '{kg} kg on {ex}. New best. Keep going.',
        locker:   'New best: {ex} at {kg} kg.',
      },
      // ... die uebrigen 21 Keys nach demselben Muster
    },
  };
```

**Regel für alle Sätze:** keine Emojis, kein Ausrufezeichen im Ton `ruhig`, maximal acht Wörter im Ton `hart`, und kein Satz, der nur lobt ohne eine Zahl oder eine Beobachtung zu tragen (Gestaltungsregel 8).

- [ ] **Step 5: Tests laufen lassen, grün bestätigen**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-persona.test.js
```

Erwartung: PASS, 13 Tests. Der Vollständigkeitstest prüft dabei 24 Keys × 4 Töne × 2 Sprachen = 192 Kombinationen. Schlägt er fehl, nennt die Meldung die genaue Kombination.

- [ ] **Step 6: Commit**

```bash
git add js/coach-persona.js test/coach-persona.test.js && git commit -m "feat(coach): Persona-Modul mit Sprachfabrik in vier Toenen" && git push origin main
```

---

### Task 7: Persona-Felder, Profile und die `live`-Synchronisierung

`S.aiCoach` bekommt die neuen Felder. Der heikle Teil: `S.aiCoach.live` wird an vier Stellen abgefragt und darf nicht auseinanderlaufen, wenn der Nutzer stattdessen `inTraining` setzt.

**Files:**
- Modify: `index.html:5548` (Skript-Tag), `index.html:8788` (Defaults), `index.html:23561` (`setAiCoachOpt`)
- Modify: `index.html:16398`, `22923`, `23015`, `23120` (die vier `live`-Abfragen)

**Interfaces:**
- Consumes: `CoachPersona.personaGet`, `CoachPersona.PRESETS`, `CoachPersona.say` aus Task 6
- Produces:
  - `_persona()` → normalisierte Persona aus `S.aiCoach`
  - `_say(key, vars)` → Coach-Satz in Ton und Sprache des Nutzers
  - `_coachLevel()` → `'off'|'key'|'full'`
  - `setCoachPreset(name)` → setzt die drei Schalter eines Profils
  - `setAiCoachOpt(key, val)` — erweitert, hält `live` und `inTraining` synchron und setzt `preset` auf `'custom'` bei Abweichung

- [ ] **Step 1: Skript-Tag einhängen**

Nach `index.html:5548` (`<script src="./js/coach-intent.js"></script>`) ergänzen:

```html
<script src="./js/coach-persona.js"></script>
```

- [ ] **Step 2: Defaults erweitern**

`index.html:8788` ersetzen. **Alt:**

```js
S.aiCoach = Object.assign({ live:true, insights:true }, S.aiCoach || {});
```

**Neu:**

```js
// Persona + Umfang. `live` bleibt drin, weil vier bestehende Stellen es abfragen
// (16398, 22923, 23015, 23120) — es ist ab jetzt die abgeleitete Groesse:
// live !== false  <=>  inTraining !== 'off'. Beide Richtungen haelt
// setAiCoachOpt() synchron, damit kein Pfad an der alten Abfrage vorbeilaeuft.
// preset === undefined heisst: die Einrichtung ist noch nie gelaufen (Task 10).
S.aiCoach = Object.assign({
  live: true, insights: true,
  name: 'Coach', tone: 'sachlich', voice: null, voiceOn: true,
  preset: undefined, inTraining: 'key', setFeedback: true, pushLevel: 'normal',
}, S.aiCoach || {});
// Bestandsnutzer: `live` war bisher die einzige Wahrheit. Wer den Live-Coach
// abgeschaltet hatte, bekommt inTraining:'off' — sonst faengt der Coach nach
// dem Update ungefragt wieder an zu reden.
if (S.aiCoach.live === false) S.aiCoach.inTraining = 'off';
else if (S.aiCoach.inTraining === 'off') S.aiCoach.live = false;
```

- [ ] **Step 3: Hilfsfunktionen anlegen**

Direkt unterhalb des Blocks aus Step 2:

```js
// Duenne Wrapper, damit die Aufrufstellen die Kurzform aus der Spec sehen.
function _persona(){ try { return CoachPersona.personaGet(S.aiCoach); } catch(_) { return CoachPersona.personaGet({}); } }
function _lang(){ try { return localStorage.getItem('gt_lang') === 'en' ? 'en' : 'de'; } catch(_) { return 'de'; } }
function _say(key, vars){ try { return CoachPersona.say(key, vars, _persona(), _lang()); } catch(_) { return ''; } }
function _coachName(){ return _persona().name; }
function _coachLevel(){ return _persona().inTraining; }
```

- [ ] **Step 4: `setAiCoachOpt` erweitern**

`index.html:23561`. Die bestehende Funktion um die Synchronisierung und die Profil-Abweichung ergänzen:

```js
function setAiCoachOpt(key, val){
  if (!S.aiCoach) S.aiCoach = {};
  S.aiCoach[key] = val;
  // 1) live und inTraining sind zwei Namen fuer dieselbe Entscheidung. Wer nur
  // einen setzt, wuerde sonst die vier alten live-Abfragen umgehen.
  if (key === 'inTraining') S.aiCoach.live = (val !== 'off');
  if (key === 'live')       S.aiCoach.inTraining = (val === false) ? 'off'
                                                : (S.aiCoach.inTraining === 'off' ? 'key' : S.aiCoach.inTraining);
  // 2) Wer an einem Einzelschalter dreht, sitzt nicht mehr in einem Profil fest.
  // preset wandert auf 'custom' — aber nur bei den drei Schaltern, die ein
  // Profil ueberhaupt setzt. Name, Ton und Stimme sind profilunabhaengig.
  if (['inTraining','setFeedback','pushLevel','live'].indexOf(key) >= 0) {
    const pr = CoachPersona.PRESETS[S.aiCoach.preset];
    if (pr) {
      const p = CoachPersona.personaGet(S.aiCoach);
      if (p.inTraining !== pr.inTraining || p.setFeedback !== pr.setFeedback || p.pushLevel !== pr.pushLevel) {
        S.aiCoach.preset = 'custom';
      }
    }
  }
  save();
  try { renderCoachTodayCard(); } catch(_){}
  try { renderCoachHub(); } catch(_){}   // ab Task 9 vorhanden
}

// Setzt die drei Schalter eines Profils in einem Zug. Laeuft NICHT ueber
// setAiCoachOpt, sonst wuerde der erste Schalter preset sofort auf 'custom'
// kippen, bevor die anderen beiden gesetzt sind.
function setCoachPreset(name){
  const pr = CoachPersona.PRESETS[name];
  if (!pr) return;
  if (!S.aiCoach) S.aiCoach = {};
  S.aiCoach.preset      = name;
  S.aiCoach.inTraining  = pr.inTraining;
  S.aiCoach.setFeedback = pr.setFeedback;
  S.aiCoach.pushLevel   = pr.pushLevel;
  S.aiCoach.live        = (pr.inTraining !== 'off');
  save();
  try { renderCoachTodayCard(); } catch(_){}
  try { renderCoachHub(); } catch(_){}
}
```

**Prüfen:** heißt die Speicherfunktion `save()`? Vor dem Einfügen `grep -n "function save()" index.html` laufen lassen und den echten Namen einsetzen.

- [ ] **Step 5: Die vier `live`-Abfragen auf `inTraining` umstellen**

Alle vier Stellen von der Ja/Nein-Abfrage auf die Stufe umstellen, damit `full` und `key` später unterscheidbar sind:

```bash
grep -n "aiCoach.live" index.html
```

Erwartete Treffer: `16398`, `22923`, `23015`, `23120`. Jede Stelle:

```js
// alt:  S.aiCoach && S.aiCoach.live !== false
// neu:  _coachLevel() !== 'off'
```

Bei `index.html:16398` steht die Abfrage in einer Zeile mit `isPremium()` — die Prüfung auf Premium bleibt unverändert davor stehen.

- [ ] **Step 6: Im Simulator prüfen**

```bash
~/.claude/sim-native.sh gymtrack "iPhone 17"
```

In der Konsole des Simulators (Safari-Webinspektor, Gerät → Simulator → MyGymTrack) prüfen:

```js
setCoachPreset('quiet');  S.aiCoach.live      // erwartet: false
setCoachPreset('close');  S.aiCoach.live      // erwartet: true
setAiCoachOpt('pushLevel','still'); S.aiCoach.preset  // erwartet: 'custom'
```

- [ ] **Step 7: Commit**

```bash
git add index.html && git commit -m "feat(coach): Persona-Felder, Umfangs-Profile, live/inTraining synchron" && git push origin main
```

---

### Task 8: Der Name ersetzt „KI-Coach" überall

Der billigste und wirksamste Teil des ganzen Vorhabens. Ein Coach, der „Nina" heißt, ist eine andere Erfahrung als eine Funktion namens „KI-Coach" — bei identischem Code darunter.

**Files:**
- Modify: `index.html` — alle Anzeigestellen von „KI-Coach"

**Interfaces:**
- Consumes: `_coachName()` aus Task 7
- Produces: keine neue API

- [ ] **Step 1: Alle Vorkommen finden**

```bash
grep -n "KI-Coach\|AI Coach\|KI Coach" index.html
```

Jeden Treffer einer der drei Kategorien zuordnen:

| Kategorie | Umgang |
| --- | --- |
| **Anzeigetext** (Kartenlabel, Overlay-Überschrift, Leisten-Titel, Button) | ersetzen durch `esc(_coachName())` |
| **Beschreibung der Funktion** (Paywall, Einstellungstext, Changelog) | **bleibt „KI-Coach"** — dort ist die Funktion gemeint, nicht die Person |
| **Interne Schlüssel** (Datenfelder, Klassennamen, `data-`-Attribute) | unverändert |

- [ ] **Step 2: Die vier Hauptstellen umstellen**

**a) `.aic`-Karte** — in `renderCoachTodayCard()` (`index.html:10670`) trägt das Element `.aic-lbl` fest `tr('KI-Coach')`:

```js
// alt:
`<span class="aic-lbl">${tr('KI-Coach')}</span>`
// neu — esc() ist Pflicht, der Name kommt vom Nutzer:
`<span class="aic-lbl">${esc(_coachName())}</span>`
```

**b) Chat-Kopf** — `index.html:7297`:

```html
<!-- alt -->
<div class="sh-head"><h2>KI-Coach</h2><button class="x-btn" onclick="closeOv('ov-ai-chat')">✕</button></div>
<!-- neu: leer lassen, Text wird beim Öffnen gesetzt -->
<div class="sh-head"><h2 id="aic-title">KI-Coach</h2><button class="x-btn" onclick="closeOv('ov-ai-chat')">✕</button></div>
```

und in der Funktion, die den Chat öffnet:

```js
  const t = document.getElementById('aic-title');
  if (t) t.textContent = _coachName();   // textContent, kein innerHTML → kein esc noetig
```

**c) Live-Leiste im Training** — `_coachBarSet()` (`index.html:22912`). Trägt die Leiste ein Label, bekommt es `_coachName()`.

**d) Eingabefeld-Platzhalter** — `index.html:7302`, „Frag deinen Coach…" bleibt, weil dort „Coach" generisch gemeint ist. Nur wenn der Nutzer einen Namen vergeben hat, wird daraus `Frag <Name>…`:

```js
  const inp = document.getElementById('aic-in');
  if (inp) inp.placeholder = (_coachName() === 'Coach') ? tr('Frag deinen Coach…') : tr('Frag ') + _coachName() + '…';
```

- [ ] **Step 3: Prüfen, dass kein Anzeigetext übersehen wurde**

```bash
grep -n "KI-Coach" index.html | grep -v "CHANGELOG\|pw2-\|paywall\|I18N"
```

Erwartung: leer oder nur Treffer, die bewusst als Funktionsbeschreibung stehenbleiben. Jeder verbleibende Treffer wird im Commit-Text benannt.

- [ ] **Step 4: Im Simulator prüfen**

```bash
~/.claude/sim-native.sh gymtrack "iPhone 17"
```

In der Konsole `setAiCoachOpt('name','Nina')` setzen, dann Heute-Tab und Chat ansehen. Erwartung: „Nina" auf der Karte und im Chat-Kopf. Danach `setAiCoachOpt('name','<b>x')` — erwartet wird der Text ohne Fettschrift und ohne Konsolenfehler.

```bash
xcrun simctl io "iPhone 17" screenshot /tmp/gymtrack-name.png
```

- [ ] **Step 5: Commit**

```bash
git add index.html && git commit -m "feat(coach): der vergebene Name ersetzt die Bezeichnung KI-Coach" && git push origin main
```

---

### Task 9: Coach-Hub

Das Zuhause des Coaches. **Einstieg ist ausschließlich die bestehende `.aic`-Karte** — keine neue Fläche im Heute-Tab (Gestaltungsregel 1).

**Files:**
- Modify: `index.html` — neues Overlay `ov-coach-hub` neben den bestehenden Overlays, Renderfunktion, Tap-Ziel auf der `.aic`-Karte

**Interfaces:**
- Consumes: `_persona()`, `_say()`, `setCoachPreset()`, `setAiCoachOpt()` aus Task 7; `CoachMemory` (Dossier) aus dem Fundament
- Produces:
  - `openCoachHub()` — öffnet das Overlay und rendert
  - `renderCoachHub()` — zeichnet den aktiven Bereich neu
  - `coachHubTab(name)` — wechselt zwischen `'chat'|'journal'|'report'|'settings'`

- [ ] **Step 1: Overlay-Markup einfügen**

Direkt **vor** `<div class="ov" id="ov-ai-chat"` (`index.html:7294`) einfügen. Aufbau und Klassen sind vom bestehenden `ov-ai-chat` übernommen — kein neues Aussehen (Gestaltungsregel 7):

```html
<div class="ov" id="ov-coach-hub" onclick="if(event.target===this)closeOv('ov-coach-hub')">
  <div class="sheet">
    <div class="sh-handle"></div>
    <div class="sh-head"><h2 id="ch-title">Coach</h2><button class="x-btn" onclick="closeOv('ov-coach-hub')">✕</button></div>
    <div class="ch-tabs">
      <button type="button" class="ch-tab on" data-cht="chat"     onclick="coachHubTab('chat')"></button>
      <button type="button" class="ch-tab"    data-cht="journal"  onclick="coachHubTab('journal')"></button>
      <button type="button" class="ch-tab"    data-cht="report"   onclick="coachHubTab('report')"></button>
      <button type="button" class="ch-tab"    data-cht="settings" onclick="coachHubTab('settings')"></button>
    </div>
    <div class="px" id="ch-body" style="padding-bottom:26px"></div>
  </div>
</div>
```

Die Beschriftungen der vier Reiter werden in `renderCoachHub()` per `textContent` gesetzt, damit `tr()` greift — nicht ins Markup schreiben.

- [ ] **Step 2: Styles ergänzen**

Neben den bestehenden `.aic-sugg`-Regeln (`index.html:5172`):

```css
.ch-tabs{display:flex;gap:6px;padding:4px 2px 10px}
.ch-tab{flex:1;padding:8px 4px;border-radius:10px;font-size:13px;font-weight:600;
        background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:var(--fg2)}
.ch-tab.on{background:rgba(var(--acc-rgb),.12);border-color:rgba(var(--acc-rgb),.28);color:var(--acc)}
.ch-sec{margin-bottom:18px}
.ch-sec h3{font-size:13px;font-weight:600;color:var(--fg2);margin:0 0 8px}
.ch-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;
        border-bottom:1px solid rgba(255,255,255,.06)}
.ch-row:last-child{border-bottom:0}
.ch-jrn{padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.04);margin-bottom:8px;
        display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.ch-jrn button{flex-shrink:0;color:var(--fg2);background:none;border:0;padding:2px 4px}
.ch-preset{display:flex;flex-direction:column;gap:8px}
.ch-preset button{text-align:left;padding:12px 14px;border-radius:12px;
        background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)}
.ch-preset button.on{background:rgba(var(--acc-rgb),.10);border-color:rgba(var(--acc-rgb),.30)}
.ch-preset b{display:block;font-size:14px;margin-bottom:2px}
.ch-preset span{font-size:12px;color:var(--fg2);line-height:1.4}
```

- [ ] **Step 3: Renderfunktionen schreiben**

Neben den anderen Coach-Funktionen (nach `setCoachPreset`, Task 7):

```js
// ── COACH-HUB ────────────────────────────────────────────
// Zuhause des Coaches. Einstieg ist AUSSCHLIESSLICH die bestehende .aic-Karte
// im Heute-Tab — es kommt bewusst keine zweite Flaeche dazu.
let _chTab = 'chat';

function openCoachHub(tab){
  _chTab = tab || 'chat';
  try { openOv('ov-coach-hub'); } catch(_){}
  // Bestandsnutzer ohne Einrichtung holen sie hier nach (Task 10) — nicht beim
  // App-Start, das waere eine Unterbrechung ohne Anlass.
  try {
    if (isPremium() && S.aiCoach && S.aiCoach.preset === undefined) { openCoachSetup(); return; }
  } catch(_){}
  renderCoachHub();
}
function coachHubTab(name){ _chTab = name; renderCoachHub(); }

function renderCoachHub(){
  const ov = document.getElementById('ov-coach-hub');
  if (!ov || !ov.classList.contains('on')) return;
  const t = document.getElementById('ch-title');
  if (t) t.textContent = _coachName();
  const LBL = { chat: tr('Chat'), journal: tr('Journal'), report: tr('Woche'), settings: tr('Einstellungen') };
  ov.querySelectorAll('.ch-tab').forEach(b => {
    const k = b.getAttribute('data-cht');
    b.textContent = LBL[k] || k;
    b.classList.toggle('on', k === _chTab);
  });
  const body = document.getElementById('ch-body');
  if (!body) return;
  if (_chTab === 'chat')          _chRenderChat(body);
  else if (_chTab === 'journal')  _chRenderJournal(body);
  else if (_chTab === 'report')   _chRenderReport(body);
  else                            _chRenderSettings(body);
}
```

- [ ] **Step 4: Bereich „Chat"**

Der bestehende Chat zieht **nicht** physisch um — das würde `aicSend()`, das Diktat und den Verlauf anfassen und wäre unnötiges Risiko. Der Hub verlinkt ihn:

```js
function _chRenderChat(body){
  // Der Chat bleibt sein eigenes Overlay (ov-ai-chat). Ihn hierher zu verschieben
  // wuerde aicSend, Diktat und Verlauf anfassen, ohne dass der Nutzer davon etwas
  // haette — der Hub ist der Einstieg, nicht der Container.
  const last = _aicHist.length ? _aicHist[_aicHist.length - 1] : null;
  body.innerHTML =
    `<div class="ch-sec">
       <h3>${esc(tr('Unterhaltung'))}</h3>
       <div class="ch-jrn"><span>${last ? _aicMd(last.content).slice(0, 240) : esc(tr('Noch nichts besprochen.'))}</span></div>
       <button type="button" class="btn wide" id="ch-open-chat">${esc(tr('Chat öffnen'))}</button>
     </div>`;
  const b = document.getElementById('ch-open-chat');
  if (b) b.onclick = () => { closeOv('ov-coach-hub'); openAiChat(); };
}
```

**Prüfen:** heißt die Funktion, die den Chat öffnet, `openAiChat()`? `grep -n "ov-ai-chat'" index.html` und den echten Namen einsetzen.

- [ ] **Step 5: Bereich „Journal" — was ich über dich weiß**

Das stärkste Vertrauenssignal des ganzen Vorhabens: das Dossier wird lesbar und jeder Eintrag einzeln löschbar.

```js
function _chRenderJournal(body){
  let d = null;
  try { d = CoachMemory.dossierGet ? CoachMemory.dossierGet() : (typeof _dossier === 'function' ? _dossier() : null); } catch(_){}
  if (!d) { body.innerHTML = `<div class="ch-sec"><p>${esc(tr('Noch nichts gemerkt.'))}</p></div>`; return; }
  // Vier Gruppen aus dem Dossier. Jeder Eintrag ist Nutzertext → esc() zwingend.
  const groups = [
    ['goal',   tr('Ziel'),           d.goal   ? [d.goal] : []],
    ['limits', tr('Einschränkungen'), Array.isArray(d.limits) ? d.limits : []],
    ['prefs',  tr('Vorlieben'),      Array.isArray(d.prefs)  ? d.prefs  : []],
    ['works',  tr('Was funktioniert'), Array.isArray(d.works) ? d.works : []],
  ];
  body.innerHTML = groups.map(([key, label, items]) => {
    if (!items.length) return '';
    return `<div class="ch-sec"><h3>${esc(label)}</h3>` + items.map((it, i) => {
      const txt = (it && typeof it === 'object') ? (it.text || '') : String(it);
      const bis = (it && it.until) ? ' · ' + tr('läuft ab') + ' ' + new Date(it.until).toLocaleDateString() : '';
      return `<div class="ch-jrn"><span>${esc(txt)}${esc(bis)}</span>
                <button type="button" data-jk="${esc(key)}" data-ji="${i}" aria-label="${esc(tr('Löschen'))}">✕</button></div>`;
    }).join('') + `</div>`;
  }).join('') || `<div class="ch-sec"><p>${esc(tr('Noch nichts gemerkt.'))}</p></div>`;

  body.querySelectorAll('button[data-jk]').forEach(b => {
    b.onclick = () => {
      const k = b.getAttribute('data-jk'), i = parseInt(b.getAttribute('data-ji'), 10);
      try { _dossierRemove(k, i); } catch(e) { console.warn('[Coach] Journal-Loeschen:', e); }
      renderCoachHub();
    };
  });
}
```

**`_dossierRemove(group, index)` existiert noch nicht** und wird in dieser Task angelegt: entfernt den Eintrag aus dem lokalen Dossier, schreibt es zurück und stößt den bestehenden gedrosselten Firestore-Push an. Vor dem Schreiben `js/coach-memory.js` und die Dossier-Brücke in `index.html` lesen — die Schreibfunktion existiert dort bereits, sie bekommt nur einen Löschpfad.

- [ ] **Step 6: Bereich „Woche" — Platzhalter bis Block 5**

```js
function _chRenderReport(body){
  // Fuellt Block 5. Bis dahin ehrlich sagen, was fehlt, statt eine leere
  // Flaeche zu zeigen.
  const r = (S.coachReports && S.coachReports.length) ? S.coachReports[0] : null;
  body.innerHTML = r
    ? `<div class="ch-sec"><h3>${esc(r.label || '')}</h3><p>${esc(r.text || '')}</p></div>`
    : `<div class="ch-sec"><p>${esc(tr('Dein erster Wochenbericht kommt am Sonntag.'))}</p></div>`;
}
```

- [ ] **Step 7: Bereich „Einstellungen"**

```js
function _chRenderSettings(body){
  const p = _persona();
  const PR = [
    ['quiet',    tr('Zurückhaltend'), tr('Meldet sich nur, wenn du fragst. Nur der Wochenbericht kommt von selbst.')],
    ['balanced', tr('Ausgewogen'),    tr('Begleitet Start, Übungswechsel und Abschluss. Höchstens eine Nachricht am Tag.')],
    ['close',    tr('Eng dabei'),     tr('Zusätzlich Pausen, Ermüdung und Stillstand. Bis zu zwei Nachrichten am Tag.')],
  ];
  body.innerHTML =
    `<div class="ch-sec">
       <h3>${esc(tr('Name'))}</h3>
       <input id="ch-name" type="text" maxlength="20" value="${esc(p.name)}" style="width:100%">
     </div>
     <div class="ch-sec">
       <h3>${esc(tr('Ton'))}</h3>
       <div class="ch-preset" id="ch-tones">
         ${CoachPersona.TONES.map(t =>
           `<button type="button" data-tone="${t}" class="${t === p.tone ? 'on' : ''}">
              <b>${esc(tr(_toneLabel(t)))}</b><span>${esc(CoachPersona.say('greet', { ex: tr('Bankdrücken'), kg: 60, reps: 8, sets: 3 }, CoachPersona.personaGet({ tone: t, name: p.name }), _lang()))}</span>
            </button>`).join('')}
       </div>
     </div>
     <div class="ch-sec">
       <h3>${esc(tr('Umfang'))}</h3>
       <div class="ch-preset" id="ch-presets">
         ${PR.map(([k, t, d]) =>
           `<button type="button" data-preset="${k}" class="${p.preset === k ? 'on' : ''}">
              <b>${esc(t)}</b><span>${esc(d)}</span></button>`).join('')}
         ${p.preset === 'custom' ? `<button type="button" class="on" disabled><b>${esc(tr('Angepasst'))}</b><span>${esc(tr('Du hast einzelne Schalter selbst gesetzt.'))}</span></button>` : ''}
       </div>
     </div>
     <details class="ch-sec">
       <summary>${esc(tr('Feinjustierung'))}</summary>
       <div class="ch-row"><span>${esc(tr('Im Training'))}</span>
         <select id="ch-int">
           <option value="off">${esc(tr('Aus'))}</option>
           <option value="key">${esc(tr('Schlüsselmomente'))}</option>
           <option value="full">${esc(tr('Alles'))}</option>
         </select></div>
       <div class="ch-row"><span>${esc(tr('Satz-Rückfrage'))}</span>
         <input type="checkbox" id="ch-sf" ${p.setFeedback ? 'checked' : ''}></div>
       <div class="ch-row"><span>${esc(tr('Nachrichten'))}</span>
         <select id="ch-push">
           <option value="still">${esc(tr('Still'))}</option>
           <option value="normal">${esc(tr('Normal'))}</option>
           <option value="eng">${esc(tr('Eng'))}</option>
         </select></div>
       <div class="ch-row"><span>${esc(tr('Tagesempfehlung auf der Startseite'))}</span>
         <input type="checkbox" id="ch-ins" ${p.insights ? 'checked' : ''}></div>
     </details>`;

  document.getElementById('ch-int').value  = p.inTraining;
  document.getElementById('ch-push').value = p.pushLevel;

  const nm = document.getElementById('ch-name');
  nm.onchange = () => { setAiCoachOpt('name', nm.value); renderCoachHub(); };
  body.querySelectorAll('button[data-tone]').forEach(b =>
    b.onclick = () => { setAiCoachOpt('tone', b.getAttribute('data-tone')); renderCoachHub(); });
  body.querySelectorAll('button[data-preset]').forEach(b =>
    b.onclick = () => { setCoachPreset(b.getAttribute('data-preset')); renderCoachHub(); });
  document.getElementById('ch-int').onchange  = e => { setAiCoachOpt('inTraining', e.target.value); renderCoachHub(); };
  document.getElementById('ch-sf').onchange   = e => { setAiCoachOpt('setFeedback', e.target.checked); renderCoachHub(); };
  document.getElementById('ch-push').onchange = e => { setAiCoachOpt('pushLevel', e.target.value); renderCoachHub(); };
  document.getElementById('ch-ins').onchange  = e => { setAiCoachOpt('insights', e.target.checked); renderCoachHub(); };
}
function _toneLabel(t){
  return { ruhig:'Ruhig', sachlich:'Sachlich', hart:'Fordernd', locker:'Locker' }[t] || t;
}
```

Die Ton-Auswahl zeigt **denselben Satz in allen vier Tönen** — der Nutzer hört den Unterschied, statt vier Adjektive zu lesen. Das ist der Unterschied zwischen einer Einstellung und einer Entscheidung.

- [ ] **Step 8: Tap-Ziel auf der `.aic`-Karte**

In `renderCoachTodayCard()` (`index.html:10670`) bekommt die Karte einen Klick-Handler. **Kritisch:** der bestehende CTA-Button („Training starten") behält seine eigene Funktion — die Tap-Ziele müssen sauber getrennt sein:

```js
  // Tipp auf die Karte oeffnet den Hub — aber NICHT, wenn der Tipp auf dem
  // CTA-Button gelandet ist. Ohne diese Pruefung verliert der Nutzer den
  // Trainingsstart, den er bisher an dieser Stelle hatte.
  const card = document.querySelector('#coach-today-card .aic');
  if (card) {
    card.style.cursor = 'pointer';
    card.onclick = (ev) => {
      if (ev.target.closest('button, a')) return;
      try { haptic(8); } catch(_){}
      openCoachHub('chat');
    };
  }
```

Der Klassenname der inneren Karte (`.aic`) und die Existenz von `haptic()` vor dem Einfügen prüfen.

- [ ] **Step 9: Im Simulator prüfen**

```bash
~/.claude/sim-native.sh gymtrack "iPhone 17"
```

Prüfliste:
1. Tipp auf die Coach-Karte → Hub öffnet sich.
2. Tipp auf „Training starten" in derselben Karte → Training startet, Hub öffnet sich **nicht**.
3. Alle vier Reiter durchklicken, keiner ist leer.
4. Im Reiter „Einstellungen" auf jeden der vier Töne tippen — der Beispielsatz darunter ändert sich sichtbar.
5. Profil „Eng dabei" wählen, dann in der Feinjustierung „Nachrichten" auf „Still" stellen → das Profil zeigt „Angepasst".
6. Heute-Tab ansehen: **es ist keine neue Karte, Zeile oder Kachel dazugekommen.**

```bash
xcrun simctl io "iPhone 17" screenshot /tmp/gymtrack-hub.png
```

- [ ] **Step 10: Commit**

```bash
git add index.html && git commit -m "feat(coach): Coach-Hub mit Chat, Journal, Woche und Einstellungen" && git push origin main
```

---

### Task 10: Einrichtung beim Abo-Abschluss

Der Grund für diese Task in einem Satz: **ein Coach, der ungefragt redet, wird abgeschaltet und nie wieder eingeschaltet — ein Coach, dessen Umfang man beim Kauf selbst bestimmt hat, wird justiert statt gekündigt.**

**Files:**
- Modify: `index.html` — neues Overlay `ov-coach-setup`, drei Schritte, Aufruf aus `premBuy()` (`index.html:22753`)

**Interfaces:**
- Consumes: `setCoachPreset()`, `setAiCoachOpt()`, `_persona()` aus Task 7; `renderCoachHub()` aus Task 9
- Produces:
  - `openCoachSetup()` — startet bei Schritt 1
  - `coachSetupStep(n)` — `1|2|3`
  - `coachSetupDone(skipped)` — schreibt `preset` und schließt

- [ ] **Step 1: Overlay-Markup**

Direkt nach `ov-coach-hub` einfügen:

```html
<div class="ov" id="ov-coach-setup">
  <div class="sheet">
    <div class="sh-handle"></div>
    <div class="sh-head"><h2 id="cs-title"></h2>
      <button class="x-btn" onclick="coachSetupDone(true)" aria-label="Überspringen">✕</button></div>
    <div class="px" id="cs-body" style="padding-bottom:26px"></div>
  </div>
</div>
```

**Kein `onclick` auf dem Overlay-Hintergrund** — anders als die übrigen Overlays. Ein versehentlicher Tipp daneben soll die Einrichtung nicht abbrechen. Das ✕ überspringt bewusst und sichtbar.

- [ ] **Step 2: Die drei Schritte**

```js
// ── COACH-EINRICHTUNG ────────────────────────────────────
// Laeuft genau einmal: direkt nach dem Abo-Abschluss, oder fuer Bestandsnutzer
// beim ersten Oeffnen des Hubs. Ueberspringbar — wer abbricht, bekommt
// 'balanced' und wird nicht erneut gefragt.
let _csStep = 1;

function openCoachSetup(){
  _csStep = 1;
  try { openOv('ov-coach-setup'); } catch(_){}
  _csRender();
}
function coachSetupStep(n){ _csStep = n; _csRender(); }

function coachSetupDone(skipped){
  // Auch beim Ueberspringen wird preset gesetzt — sonst fragt die App beim
  // naechsten Hub-Oeffnen wieder, und genau das nervt.
  if (!S.aiCoach.preset || S.aiCoach.preset === undefined) setCoachPreset('balanced');
  save();
  try { closeOv('ov-coach-setup'); } catch(_){}
  try { renderCoachTodayCard(); } catch(_){}
  if (!skipped) { try { openCoachHub('settings'); } catch(_){} }
}

function _csRender(){
  const p = _persona();
  const title = document.getElementById('cs-title');
  const body  = document.getElementById('cs-body');
  if (!title || !body) return;
  title.textContent = tr('Dein Coach') + ' · ' + _csStep + '/3';

  if (_csStep === 1) {
    body.innerHTML =
      `<div class="ch-sec">
         <h3>${esc(tr('Wie soll dein Coach heißen?'))}</h3>
         <input id="cs-name" type="text" maxlength="20" placeholder="${esc(tr('Coach'))}" value="${esc(p.name === 'Coach' ? '' : p.name)}" style="width:100%">
       </div>
       <div class="ch-sec">
         <h3>${esc(tr('In welchem Ton?'))}</h3>
         <div class="ch-preset" id="cs-tones">
           ${CoachPersona.TONES.map(t =>
             `<button type="button" data-tone="${t}" class="${t === p.tone ? 'on' : ''}">
                <b>${esc(tr(_toneLabel(t)))}</b>
                <span>${esc(CoachPersona.say('greet', { ex: tr('Bankdrücken'), kg: 60, reps: 8, sets: 3 }, CoachPersona.personaGet({ tone: t }), _lang()))}</span>
              </button>`).join('')}
         </div>
       </div>
       <button type="button" class="btn wide" id="cs-next">${esc(tr('Weiter'))}</button>`;
    body.querySelectorAll('button[data-tone]').forEach(b =>
      b.onclick = () => { setAiCoachOpt('tone', b.getAttribute('data-tone')); _csRender(); });
    document.getElementById('cs-next').onclick = () => {
      const v = document.getElementById('cs-name').value;
      if (v && v.trim()) setAiCoachOpt('name', v);
      coachSetupStep(2);
    };
    return;
  }

  if (_csStep === 2) {
    // Stimmenliste kommt in Block 2 vom TtsPlugin. Solange die nicht da ist,
    // zeigt der Schritt nur den An/Aus-Schalter — kein leerer Listenrahmen.
    body.innerHTML =
      `<div class="ch-sec">
         <h3>${esc(tr('Soll dein Coach sprechen?'))}</h3>
         <p style="font-size:13px;color:var(--fg2);line-height:1.5">
           ${esc(tr('Er spricht nur, wenn du ihn über den Sprech-Button fragst — nie von selbst.'))}</p>
         <div class="ch-row"><span>${esc(tr('Sprachausgabe'))}</span>
           <input type="checkbox" id="cs-von" ${p.voiceOn ? 'checked' : ''}></div>
         <div id="cs-voices"></div>
       </div>
       <button type="button" class="btn wide" id="cs-next">${esc(tr('Weiter'))}</button>`;
    document.getElementById('cs-von').onchange = e => { setAiCoachOpt('voiceOn', e.target.checked); _csRender(); };
    try { if (typeof _csRenderVoices === 'function') _csRenderVoices(document.getElementById('cs-voices')); } catch(_){}
    document.getElementById('cs-next').onclick = () => coachSetupStep(3);
    return;
  }

  // Schritt 3 — das eigentliche Kernstueck. Die Voreinstellung ist bewusst die
  // mittlere, nicht die lauteste.
  const PR = [
    ['quiet',    tr('Zurückhaltend'), tr('Meldet sich nur, wenn du fragst. Nur der Wochenbericht kommt von selbst.')],
    ['balanced', tr('Ausgewogen'),    tr('Begleitet Start, Übungswechsel und Abschluss. Höchstens eine Nachricht am Tag.')],
    ['close',    tr('Eng dabei'),     tr('Zusätzlich Pausen, Ermüdung und Stillstand. Bis zu zwei Nachrichten am Tag.')],
  ];
  const cur = p.preset && p.preset !== 'custom' ? p.preset : 'balanced';
  body.innerHTML =
    `<div class="ch-sec">
       <h3>${esc(tr('Wie sehr soll er sich einmischen?'))}</h3>
       <p style="font-size:13px;color:var(--fg2);line-height:1.5">
         ${esc(tr('Du kannst das jederzeit ändern — auch einzelne Schalter.'))}</p>
       <div class="ch-preset" id="cs-presets">
         ${PR.map(([k, t, d]) =>
           `<button type="button" data-preset="${k}" class="${k === cur ? 'on' : ''}">
              <b>${esc(t)}</b><span>${esc(d)}</span></button>`).join('')}
       </div>
     </div>
     <button type="button" class="btn wide" id="cs-fin">${esc(tr('Fertig'))}</button>`;
  body.querySelectorAll('button[data-preset]').forEach(b =>
    b.onclick = () => { setCoachPreset(b.getAttribute('data-preset')); _csRender(); });
  document.getElementById('cs-fin').onclick = () => {
    if (S.aiCoach.preset === undefined) setCoachPreset('balanced');
    coachSetupDone(false);
  };
}
```

- [ ] **Step 3: Aus `premBuy()` heraus starten**

In `index.html:22753`, im Erfolgszweig. **Alt:**

```js
      if (btn) btn.textContent = 'Premium aktiv ✓';
      setTimeout(() => { try { closeOv('ov-paywall'); } catch(_){} }, 700);
```

**Neu:**

```js
      if (btn) btn.textContent = 'Premium aktiv ✓';
      setTimeout(() => {
        try { closeOv('ov-paywall'); } catch(_){}
        // Direkt nach dem Kauf entscheidet der Nutzer selbst, wie sehr sich der
        // Coach einmischt. Nicht stillschweigend annehmen — genau hier ist der
        // Moment, in dem die Frage verstanden wird.
        try { if (S.aiCoach && S.aiCoach.preset === undefined) setTimeout(openCoachSetup, 420); } catch(_){}
      }, 700);
```

Die 420 ms geben dem Paywall-Overlay Zeit auszublenden, bevor die Einrichtung erscheint — zwei gleichzeitig laufende Overlay-Animationen sehen kaputt aus.

- [ ] **Step 4: Bestandsnutzer**

Ist bereits in `openCoachHub()` aus Task 9 Step 3 verdrahtet: `preset === undefined` und `isPremium()` → Einrichtung statt Hub. **Kein** Aufruf beim App-Start.

- [ ] **Step 5: Im Simulator prüfen**

```bash
~/.claude/sim-native.sh gymtrack "iPhone 17"
```

Da im Simulator kein echter Kauf läuft, den Bestandsnutzer-Pfad testen. In der Konsole:

```js
delete S.aiCoach.preset; save(); openCoachHub();
```

Prüfliste:
1. Die Einrichtung startet statt des Hubs.
2. Schritt 1: Name eintippen, alle vier Töne antippen — der Beispielsatz ändert sich jedes Mal.
3. Schritt 2: Schalter umlegen, weiter.
4. Schritt 3: „Zurückhaltend" wählen, „Fertig". Danach `S.aiCoach` prüfen: `preset:'quiet'`, `inTraining:'off'`, `live:false`, `pushLevel:'still'`.
5. Hub erneut öffnen → die Einrichtung startet **nicht** noch einmal.
6. Erneut `delete S.aiCoach.preset; save(); openCoachHub();`, diesmal sofort auf ✕ → `preset:'balanced'`, und beim nächsten Öffnen keine erneute Frage.

```bash
xcrun simctl io "iPhone 17" screenshot /tmp/gymtrack-setup.png
```

- [ ] **Step 6: Commit**

```bash
git add index.html && git commit -m "feat(coach): Einrichtung beim Abo-Abschluss legt den Umfang fest" && git push origin main
```

---

## Blockabschluss 1

Ritual von oben durchlaufen. Changelog-Key: `cl-2026-07-28-coach-persoenlich`.

```js
  'cl-2026-07-28-coach-persoenlich': {
    label: '28.07.2026 · Dein Coach bekommt einen Namen',
    items: [
      'Gib deinem Coach einen Namen und einen Ton — ruhig, sachlich, fordernd oder locker. Er redet ab sofort so mit dir',
      'Neu: das Coach-Menü. Ein Tipp auf die Coach-Karte auf der Startseite öffnet Chat, Journal, Wochenbericht und Einstellungen',
      'Im Journal siehst du zum ersten Mal, was der Coach über dich weiß — und kannst jeden einzelnen Eintrag löschen',
      'Beim Abschluss des Abos entscheidest du selbst, wie sehr sich der Coach einmischt: zurückhaltend, ausgewogen oder eng dabei',
    ]
  },
```

**Zusätzliche Prüfung für diesen Block, über das Ritual hinaus:** Der Heute-Tab muss vor und nach diesem Block **identisch aussehen**, bis auf das Wort auf der Coach-Karte. Kommt eine Fläche dazu, ist Gestaltungsregel 1 verletzt und der Block ist nicht abnahmefähig.

---

# Block 2 — Stimme

**Warum jetzt:** Die Sprachausgabe ist der Moment, in dem aus einer Textfläche eine Person wird. Sie braucht die Persona aus Block 1 (Name, Ton, Stimmwahl) und sie muss stehen, bevor Block 3 im Training Sätze produziert, die man sich vorlesen lassen können soll.

**Ergebnis:** Ein Sprech-Button im Training und im Chat. Drücken → Diktat → Antwort wird gesprochen **und** angezeigt. Der Coach schweigt, solange er nicht gefragt wird — ausnahmslos (Gestaltungsregel 6).

---

### Task 11: `TtsPlugin.swift` und die Aufräumarbeit an `SpeechPlugin.swift`

**`SpeechPlugin.swift` existiert seit dem 2026-07-25, ist aber nicht im Git.** Das Diktat funktioniert im Simulator und wäre bei einem frischen Klon des Repos weg. Diese Task holt das nach.

**Files:**
- Create: `ios/App/App/Plugins/TtsPlugin.swift`
- Add to git: `ios/App/App/Plugins/SpeechPlugin.swift` (vorhanden, untracked)
- Modify: `ios/App/App/Info.plist`

**Interfaces:**
- Consumes: nichts
- Produces: Capacitor-Plugin `TtsPlugin` mit drei Methoden
  - `speak({ text: string, voiceId?: string })` → `{ ok: true }`
  - `stop()` → `{ ok: true }`
  - `voices()` → `{ voices: [{ id: string, name: string, lang: string, quality: string }] }`

- [ ] **Step 1: Zustand prüfen**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && git status --short ios/App/App/Plugins/ && ls -la ios/App/App/Plugins/
```

Erwartung: `SpeechPlugin.swift` erscheint als `??` (untracked). Ist er bereits getrackt, entfällt Step 5.

- [ ] **Step 2: Ein vorhandenes Plugin als Vorlage lesen**

```bash
sed -n '1,40p' ios/App/App/Plugins/SpeechPlugin.swift
```

Die Registrierungs-Makros (`@objc(...)`, `CAPPluginMethod`) und den Aufbau übernehmen — **nicht** aus dem Gedächtnis schreiben. Capacitor 8 verlangt eine exakte Form, und ein falsch registriertes Plugin fällt zur Laufzeit stumm aus statt zu compilieren.

- [ ] **Step 3: `TtsPlugin.swift` schreiben**

`ios/App/App/Plugins/TtsPlugin.swift`:

```swift
import Foundation
import Capacitor
import AVFoundation

// Sprachausgabe des Coaches. AVSpeechSynthesizer statt einer Cloud-Stimme:
// laeuft offline (Keller-Gym!), kostet nichts und schickt keinen Text an einen
// fremden Dienst.
//
// Die Audio-Session ist der eigentliche Knackpunkt: OHNE .duckOthers schneidet
// iOS die laufende Musik ab, statt sie leiser zu drehen. Im Gym ist das der
// Unterschied zwischen "benutzbar" und "sofort abgeschaltet".
@objc(TtsPlugin)
public class TtsPlugin: CAPPlugin, CAPBridgedPlugin, AVSpeechSynthesizerDelegate {
    public let identifier = "TtsPlugin"
    public let jsName = "TtsPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "speak",  returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop",   returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "voices", returnType: CAPPluginReturnPromise),
    ]

    private let synth = AVSpeechSynthesizer()

    override public func load() {
        synth.delegate = self
    }

    private func activateSession() {
        let s = AVAudioSession.sharedInstance()
        do {
            // .playback + .duckOthers: Musik wird leiser, nicht gestoppt.
            // .spokenAudio signalisiert iOS, dass es Sprache ist — CarPlay und
            // AirPods behandeln das anders als Musik.
            try s.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers, .mixWithOthers])
            try s.setActive(true, options: [])
        } catch {
            // Kein fatalError: eine fehlgeschlagene Session darf hoechstens die
            // Sprachausgabe kosten, nie die App.
            CAPLog.print("[Tts] Audio-Session:", error.localizedDescription)
        }
    }

    private func deactivateSession() {
        do {
            // notifyOthersOnDeactivation dreht die Musik wieder hoch. Ohne das
            // bleibt sie leise, bis der Nutzer die App wechselt.
            try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        } catch { /* egal — die naechste Aktivierung raeumt das auf */ }
    }

    @objc func speak(_ call: CAPPluginCall) {
        let text = call.getString("text") ?? ""
        guard !text.isEmpty else { call.resolve(["ok": false]); return }
        let voiceId = call.getString("voiceId")

        let utt = AVSpeechUtterance(string: text)
        if let vid = voiceId, let v = AVSpeechSynthesisVoice(identifier: vid) {
            utt.voice = v
        } else {
            // Kein Fehler, wenn die gewaehlte Stimme fehlt (anderes Geraet,
            // deinstalliertes Sprachpaket): Systemstimme der aktuellen Sprache.
            utt.voice = AVSpeechSynthesisVoice(language: Locale.preferredLanguages.first ?? "de-DE")
        }
        utt.rate = AVSpeechUtteranceDefaultSpeechRate
        utt.pitchMultiplier = 1.0

        DispatchQueue.main.async {
            if self.synth.isSpeaking { self.synth.stopSpeaking(at: .immediate) }
            self.activateSession()
            self.synth.speak(utt)
            call.resolve(["ok": true])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.synth.stopSpeaking(at: .immediate)
            self.deactivateSession()
            call.resolve(["ok": true])
        }
    }

    @objc func voices(_ call: CAPPluginCall) {
        // Nur Stimmen der aktuellen Sprache: eine englische Stimme fuer deutschen
        // Text klingt nicht nach Akzent, sondern nach Fehler.
        let prefix = String((Locale.preferredLanguages.first ?? "de-DE").prefix(2))
        let list = AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language.hasPrefix(prefix) }
            .map { v -> [String: Any] in
                let q: String
                switch v.quality {
                case .premium: q = "premium"
                case .enhanced: q = "enhanced"
                default: q = "default"
                }
                return ["id": v.identifier, "name": v.name, "lang": v.language, "quality": q]
            }
        call.resolve(["voices": list])
    }

    public func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        deactivateSession()
        notifyListeners("ttsDone", data: [:])
    }
}
```

**Falls `CAPBridgedPlugin` in diesem Capacitor-Stand nicht existiert:** die Form aus `SpeechPlugin.swift` übernehmen (dort steht die gültige Variante) und die `pluginMethods`-Deklaration entsprechend anpassen. **Nicht** eine Form aus dem Gedächtnis erfinden.

- [ ] **Step 4: Info.plist ergänzen**

`ios/App/App/Info.plist` — beide Schlüssel, falls noch nicht vorhanden:

```xml
	<key>NSSpeechRecognitionUsageDescription</key>
	<string>Damit du deinem Coach deine Frage sagen kannst, statt sie zu tippen. Die Aufnahme wird nicht gespeichert.</string>
	<key>NSMicrophoneUsageDescription</key>
	<string>Damit du deinem Coach während des Trainings eine Frage stellen kannst.</string>
```

Prüfen, ob sie schon drinstehen:

```bash
grep -n "NSSpeechRecognitionUsageDescription\|NSMicrophoneUsageDescription" ios/App/App/Info.plist
```

Die Texte sagen ausdrücklich, dass nichts gespeichert wird — das ist keine Höflichkeit, sondern die Zusage aus dem Datenschutz-Abschnitt der Spec.

- [ ] **Step 5: Beide Plugins ins Repo**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && git add -f ios/App/App/Plugins/SpeechPlugin.swift ios/App/App/Plugins/TtsPlugin.swift ios/App/App/Info.plist && git status --short ios/App/App/
```

Erwartung: beide Swift-Dateien als `A` (added). Wird `SpeechPlugin.swift` ignoriert, in `.gitignore` nachsehen, warum — und die Ignore-Regel korrigieren statt `-f` stehenzulassen.

- [ ] **Step 6: Bauen und Registrierung prüfen**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && npx cap sync ios && ~/.claude/sim-native.sh gymtrack "iPhone 17"
```

Im Webinspektor:

```js
Capacitor.Plugins.TtsPlugin.voices().then(r => console.log(r.voices.length, r.voices[0]));
Capacitor.Plugins.TtsPlugin.speak({ text: 'Test. Drei Sätze bei sechzig Kilo.' });
```

Erwartung: eine Liste mit mindestens einer Stimme, und die App spricht hörbar. Kommt `undefined`, ist das Plugin nicht registriert — dann Step 3 gegen `SpeechPlugin.swift` gegenprüfen.

**Musik-Test, nicht überspringen:** Im Simulator Musik über Safari abspielen, dann `speak()` aufrufen. Die Musik muss **leiser werden und danach wieder hochgehen**, nicht abbrechen.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(ios): TtsPlugin fuer die Coach-Stimme, SpeechPlugin nachtraeglich ins Repo" && git push origin main
```

---

### Task 12: `coach-voice.js` und der Sprech-Button

**Files:**
- Create: `js/coach-voice.js`
- Modify: `index.html` — Skript-Tag, Sprech-Button im Chat und im Training, Stimmenliste in der Einrichtung

**Interfaces:**
- Consumes: `TtsPlugin` aus Task 11; `_persona()`, `_lang()` aus Task 7
- Produces:
  - `CoachVoice.available(caps)` → `{tts: boolean, stt: boolean}` — was auf dieser Plattform geht
  - `CoachVoice.pickVoice(voices, preferredId, lang)` → `string|null` — gewählte Stimme, mit Rückfall auf die Systemstimme
  - `CoachVoice.speakable(text)` → `string` — Text für die Sprachausgabe aufbereitet (Zahlen, Einheiten, Markdown weg)
  - in `index.html`: `coachSpeak(text)`, `coachStopSpeak()`, `coachAsk()`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

`test/coach-voice.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const V = require('../js/coach-voice.js');

test('available meldet nativ beide Faehigkeiten', () => {
  const a = V.available({ tts: true, stt: true, webTts: false, webStt: false });
  assert.deepStrictEqual(a, { tts: true, stt: true });
});

test('available faellt im Web auf die Web-APIs zurueck', () => {
  assert.deepStrictEqual(V.available({ tts: false, stt: false, webTts: true, webStt: true }), { tts: true, stt: true });
  assert.deepStrictEqual(V.available({ tts: false, stt: false, webTts: false, webStt: false }), { tts: false, stt: false });
});

test('pickVoice nimmt die gewaehlte Stimme, wenn sie da ist', () => {
  const list = [{ id: 'a', lang: 'de-DE' }, { id: 'b', lang: 'de-DE' }];
  assert.strictEqual(V.pickVoice(list, 'b', 'de'), 'b');
});

test('pickVoice faellt auf die erste passende Sprache zurueck', () => {
  const list = [{ id: 'en1', lang: 'en-US' }, { id: 'de1', lang: 'de-DE' }];
  assert.strictEqual(V.pickVoice(list, 'weg', 'de'), 'de1');
});

test('pickVoice liefert null, wenn nichts passt', () => {
  assert.strictEqual(V.pickVoice([], 'x', 'de'), null);
  assert.strictEqual(V.pickVoice([{ id: 'en1', lang: 'en-US' }], null, 'de'), null);
});

test('speakable raeumt Markdown und Symbole weg', () => {
  assert.strictEqual(V.speakable('**Bank** 3 × 8 @ 62,5 kg'), 'Bank 3 mal 8 bei 62,5 Kilo');
  assert.strictEqual(V.speakable('· Punkt eins'), 'Punkt eins');
});

test('speakable laesst normalen Text unveraendert', () => {
  assert.strictEqual(V.speakable('Guter Satz.'), 'Guter Satz.');
});

test('speakable vertraegt leere Eingabe', () => {
  assert.strictEqual(V.speakable(''), '');
  assert.strictEqual(V.speakable(null), '');
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-voice.test.js
```

Erwartung: FAIL mit `Cannot find module '../js/coach-voice.js'`.

- [ ] **Step 3: Modul schreiben**

`js/coach-voice.js`:

```js
/* GymTrack — Sprachausgabe-Bruecke (Block 2)
   Kein DOM, kein Plugin-Zugriff: das Modul entscheidet nur, WAS gesprochen wird
   und MIT WELCHER Stimme. Das eigentliche Sprechen macht index.html ueber das
   TtsPlugin (nativ) oder speechSynthesis (Web). */
(function (root) {
  'use strict';

  function available(caps) {
    var c = caps || {};
    return { tts: !!(c.tts || c.webTts), stt: !!(c.stt || c.webStt) };
  }

  function pickVoice(voices, preferredId, lang) {
    var list = Array.isArray(voices) ? voices : [];
    if (preferredId) {
      for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === preferredId) return list[i].id;
    }
    var pre = (lang === 'en') ? 'en' : 'de';
    for (var j = 0; j < list.length; j++) {
      if (list[j] && typeof list[j].lang === 'string' && list[j].lang.indexOf(pre) === 0) return list[j].id;
    }
    return null;
  }

  // Der Bildschirmtext ist fuer Augen gebaut, nicht fuer Ohren. "3 × 8 @ 62,5 kg"
  // liest die Systemstimme als "drei x acht at sechzig komma fuenf k g" vor.
  function speakable(t) {
    return String(t == null ? '' : t)
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/^[-•·]\s*/gm, '')
      .replace(/\s*×\s*/g, ' mal ')
      .replace(/\s*@\s*/g, ' bei ')
      .replace(/\bkg\b/g, 'Kilo')
      .replace(/\bWdh\b/g, 'Wiederholungen')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  var API = { available: available, pickVoice: pickVoice, speakable: speakable };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachVoice = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Test laufen lassen, grün bestätigen**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-voice.test.js
```

Erwartung: PASS, 8 Tests.

- [ ] **Step 5: Brücke in `index.html`**

Skript-Tag nach `coach-persona.js` ergänzen:

```html
<script src="./js/coach-voice.js"></script>
```

Und die Brückenfunktionen neben den anderen Coach-Funktionen:

```js
// ── COACH-STIMME ─────────────────────────────────────────
// Nativ ueber TtsPlugin, im Web ueber speechSynthesis. Gesprochen wird
// AUSSCHLIESSLICH nach Druck auf den Sprech-Button — nie von selbst.
let _ttsVoices = null;

async function _ttsLoadVoices(){
  if (_ttsVoices) return _ttsVoices;
  const T = _cap('TtsPlugin');
  if (T) { try { const r = await T.voices(); _ttsVoices = r.voices || []; return _ttsVoices; } catch(_){} }
  if (typeof speechSynthesis !== 'undefined') {
    _ttsVoices = (speechSynthesis.getVoices() || []).map(v => ({ id: v.voiceURI, name: v.name, lang: v.lang, quality: 'default' }));
    return _ttsVoices;
  }
  _ttsVoices = [];
  return _ttsVoices;
}

async function coachSpeak(text){
  const p = _persona();
  if (!p.voiceOn) return;
  const txt = CoachVoice.speakable(text);
  if (!txt) return;
  try {
    const voices = await _ttsLoadVoices();
    const vid = CoachVoice.pickVoice(voices, p.voice, _lang());
    const T = _cap('TtsPlugin');
    if (T) { await T.speak({ text: txt, voiceId: vid || undefined }); return; }
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(txt);
      if (vid) { const v = speechSynthesis.getVoices().find(x => x.voiceURI === vid); if (v) u.voice = v; }
      speechSynthesis.speak(u);
    }
  } catch(e) { console.warn('[Coach] Sprachausgabe:', e); }  // stumm scheitern, nie den Ablauf stoeren
}

function coachStopSpeak(){
  try { const T = _cap('TtsPlugin'); if (T) { T.stop(); return; } } catch(_){}
  try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch(_){}
}

// Sprech-Button: Diktat starten, Ergebnis durch den Router oder ans Modell,
// Antwort sprechen UND anzeigen. Ein reiner Sprachkanal waere im Gym unbrauchbar
// — man will die Zahl auch sehen.
async function coachAsk(){
  try {
    const q = await _sttListenOnce();           // vorhandener Diktat-Pfad
    if (!q) return;
    const local = _coachTryLocal(q);            // Intent-Router aus Block 0
    if (local) { _coachBarSet('tip', local, 9000); coachSpeak(local); return; }
    const ans = await _aicAskOnce(q);           // bestehender /chat-Weg
    if (ans) { _coachBarSet('tip', ans, 12000); coachSpeak(ans); }
  } catch(e) { console.warn('[Coach] Frage:', e); }
}
```

**Drei Funktionsnamen müssen gegen den echten Code geprüft werden**, bevor dieser Block eingefügt wird: der Diktat-Einstieg (heute `aicMicToggle()` / `_aicMicToggleNative()`, `index.html:24286` ff.), der Router-Aufruf und der Chat-Aufruf. Existiert kein `_sttListenOnce`/`_aicAskOnce`, werden sie als dünne Wrapper um die vorhandenen Funktionen angelegt — **nicht** die vorhandene Diktat-Logik duplizieren.

- [ ] **Step 6: Sprech-Button im Training**

In die Live-Leiste `#wk-coach-bar`, als einziges Bedienelement des Coaches im Training (Gestaltungsregel 2). Er hängt **in** der Leiste, nicht daneben:

```js
// In _coachBarSet(), beim Aufbau des Leisteninhalts:
const canAsk = (() => { try { return CoachVoice.available({
  tts: !!_cap('TtsPlugin'), stt: !!_cap('SpeechPlugin'),
  webTts: typeof speechSynthesis !== 'undefined',
  webStt: typeof webkitSpeechRecognition !== 'undefined' || typeof SpeechRecognition !== 'undefined',
}).stt; } catch(_) { return false; } })();
const askBtn = canAsk
  ? `<button type="button" class="cb-ask" onclick="coachAsk()" aria-label="${esc(tr('Coach fragen'))}">${ICO.mic ? ICO.mic({s:17}) : ''}</button>`
  : '';
```

**Ist auf dieser Plattform kein Diktat verfügbar, verschwindet der Button** — kein ausgegrauter Knopf, der nichts tut.

Fehlt `ICO.mic`, wird ein Eintrag in `ICO` (`index.html:17147`) ergänzt; das SVG aus dem bestehenden `.aic-mic`-Button (`index.html:7303`) übernehmen. **Kein Emoji als Ersatz.**

- [ ] **Step 7: Stimmenliste in der Einrichtung**

Die in Task 10 Step 2 vorgesehene Funktion `_csRenderVoices(el)` schreiben:

```js
async function _csRenderVoices(el){
  if (!el) return;
  const p = _persona();
  if (!p.voiceOn) { el.innerHTML = ''; return; }
  const voices = await _ttsLoadVoices();
  if (!voices.length) { el.innerHTML = `<p style="font-size:12px;color:var(--fg2)">${esc(tr('Auf diesem Gerät ist keine Stimme verfügbar.'))}</p>`; return; }
  el.innerHTML = `<div class="ch-preset" style="margin-top:10px">` + voices.slice(0, 8).map(v =>
    `<button type="button" data-vid="${esc(v.id)}" class="${v.id === p.voice ? 'on' : ''}">
       <b>${esc(v.name)}</b><span>${esc(v.lang)}${v.quality !== 'default' ? ' · ' + esc(v.quality) : ''}</span></button>`).join('') + `</div>`;
  el.querySelectorAll('button[data-vid]').forEach(b => b.onclick = () => {
    const id = b.getAttribute('data-vid');
    setAiCoachOpt('voice', id);
    // Vorhoeren: derselbe Satz, den er beim Trainingsstart sagen wuerde.
    coachSpeak(CoachPersona.say('greet', { ex: tr('Bankdrücken'), kg: 60, reps: 8, sets: 3 }, _persona(), _lang()));
    _csRender();
  });
}
```

Der Vorhör-Satz ist bewusst **derselbe**, den der Coach später wirklich sagt — kein „Dies ist eine Testansage".

- [ ] **Step 8: Im Simulator prüfen**

```bash
npx cap sync ios && ~/.claude/sim-native.sh gymtrack "iPhone 17"
```

Prüfliste:
1. Einrichtung Schritt 2: Stimmenliste erscheint, Antippen spricht den Begrüßungssatz vor.
2. „Sprachausgabe" ausschalten → Liste verschwindet.
3. Training starten: der Sprech-Button ist in der Coach-Leiste, sonst nirgends.
4. Sprech-Button drücken, „Wie lang ist meine Streak?" sagen → Antwort wird **gesprochen und angezeigt**.
5. **Der Coach sagt zu keinem Zeitpunkt etwas von selbst.** Ein Training komplett durchspielen, ohne den Button zu drücken — es darf kein Ton kommen.
6. Diktat-Berechtigung im Simulator verweigern (Einstellungen → MyGymTrack → Mikrofon aus) → der Button verschwindet, der Tastatur-Chat funktioniert unverändert.

```bash
xcrun simctl io "iPhone 17" screenshot /tmp/gymtrack-voice.png
```

- [ ] **Step 9: Commit**

```bash
git add js/coach-voice.js test/coach-voice.test.js index.html && git commit -m "feat(coach): Sprachausgabe und Sprech-Button, nur auf Anfrage" && git push origin main
```

---

## Blockabschluss 2

Ritual von oben durchlaufen. Changelog-Key: `cl-2026-07-28-coach-stimme`.

```js
  'cl-2026-07-28-coach-stimme': {
    label: '28.07.2026 · Dein Coach hat jetzt eine Stimme',
    items: [
      'Drück im Training auf den Sprech-Knopf und frag laut: „Wie führe ich die Übung aus?" — die Antwort kommt gesprochen und geschrieben',
      'Such dir bei der Einrichtung die Stimme aus, die dir gefällt, und hör sie dir vorher an',
      'Laufende Musik wird nur leiser, nicht unterbrochen',
      'Der Coach redet nie von selbst los — nur wenn du ihn fragst',
    ]
  },
```

**Zusätzliche Prüfung:** Nutrition Labels im App Store Connect kontrollieren, ob Spracherkennung eintragungspflichtig ist, auch wenn nichts gespeichert wird. Das ist eine Aufgabe für den Betreiber, nicht für den Agenten — als offener Punkt im Blockabschluss melden.

---

# Block 3 — Tiefe im Training

**Warum jetzt:** Persona und Stimme stehen. Jetzt bekommt der Coach etwas zu sagen, das er heute nicht sagen kann — nicht mehr Einzeltrigger, sondern ein Bogen über die Einheit.

**Kosten: 0 $.** Dieser Block ist vollständig algorithmisch. Ein `fetch` gegen `AI_WORKER_URL` in einer Datei dieses Blocks ist ein Fehler.

**Ergebnis:** Zwölf Trigger, von denen dank der Obergrenze nie mehr als vier (`key`) beziehungsweise acht (`full`) durchkommen. Der Coach hat viel zu sagen und sagt wenig davon — das ist der Unterschied zwischen aufdringlich und aufmerksam.

---

### Task 13: `coach-session.js` — der Erzählbogen

Heute reagiert der Live-Coach auf Einzelsätze und weiß nicht, wo in der Einheit man steht. Dieses Modul führt den Zustand.

**Files:**
- Create: `js/coach-session.js`
- Create: `test/coach-session.test.js`

**Interfaces:**
- Consumes: `CoachPersona.KEYS` (die Satz-Schlüssel aus Task 6) — nur als Namensraum, kein Import
- Produces:
  - `CoachSession.sessionNew(ctx)` → `sess`
  - `CoachSession.onStart(sess, ctx)` → `{sess, out}`
  - `CoachSession.onExerciseOpen(sess, ex)` → `{sess, out}`
  - `CoachSession.onSet(sess, log)` → `{sess, out}`
  - `CoachSession.onRest(sess, secs)` → `{sess, out}`
  - `CoachSession.onTick(sess, now)` → `{sess, out}`
  - `CoachSession.sessionEnd(sess, summary)` → `{sess, out}`
  - `CoachSession.CAP` → `{off:0, key:4, full:8}`
  - `out` ist `null` **oder** `{kind, key, vars}`

**Abweichung von der Spec, bewusst:** Die Spec schreibt `→ {text, kind}`. Das Modul liefert stattdessen `{kind, key, vars}` — den Satz**schlüssel**, nicht den fertigen Satz. Grund: sonst bräuchte `coach-session.js` die Persona und die Sprache und wäre nicht mehr unabhängig testbar. Die Verdrahtung in `index.html` macht daraus `_say(out.key, out.vars)`. Ergebnis für den Nutzer identisch, Testbarkeit deutlich besser.

**Entscheidung zur Obergrenze, die die Spec offenlässt:** Die Satz-Rückfrage (`setAsk`, Task 15) zählt **nicht** gegen die Obergrenze. Sie ist eine Bedienfläche, keine Äußerung — und mit einem Deckel von vier wären nach vier Sätzen vier Chip-Reihen verbraucht und der Coach hätte kein Budget mehr für seinen eigentlichen Bogen. Sie hängt allein am Schalter `setFeedback`.

- [ ] **Step 1: Fehlschlagende Tests schreiben**

`test/coach-session.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const Se = require('../js/coach-session.js');

const T0 = 1753600000000;
function ctx(level, extra) {
  return Object.assign({
    wkTs: T0, level: level, planName: 'Push',
    lastSame: { ex: 'Bankdrücken', kg: 60, reps: 8, sets: 3, vol: 6800 },
    muted: [], limits: [],
  }, extra || {});
}
// Spielt eine Einheit durch, die JEDEN Trigger ausloesen wuerde.
function fullRun(level) {
  let s = Se.sessionNew(ctx(level));
  const outs = [];
  const push = r => { s = r.sess; if (r.out) outs.push(r.out); };
  push(Se.onStart(s, ctx(level)));
  for (let e = 0; e < 3; e++) {
    push(Se.onExerciseOpen(s, { id: 'ex' + e, name: 'Übung ' + e, targetSets: 3, targetReps: 8, lastKg: 60 }));
    for (let i = 0; i < 3; i++) {
      push(Se.onSet(s, { exId: 'ex' + e, reps: 8 - i, kg: 60, ts: T0 + (e * 3 + i) * 180000 }));
      push(Se.onRest(s, 90 + i * 40));
    }
  }
  push(Se.onTick(s, T0 + 40 * 60000));
  push(Se.sessionEnd(s, { sets: 9, vol: 7200, prs: [] }));
  return outs;
}

test('off erzeugt keine einzige Aeusserung', () => {
  assert.strictEqual(fullRun('off').length, 0);
});

test('key haelt die Obergrenze von vier ein', () => {
  const outs = fullRun('key');
  assert.ok(outs.length > 0, 'key darf nicht stumm sein');
  assert.ok(outs.length <= 4, 'key erzeugte ' + outs.length + ' Aeusserungen');
});

test('full haelt die Obergrenze von acht ein', () => {
  const outs = fullRun('full');
  assert.ok(outs.length > 4, 'full soll mehr sagen als key');
  assert.ok(outs.length <= 8, 'full erzeugte ' + outs.length + ' Aeusserungen');
});

test('key laesst nur die erlaubten Arten durch', () => {
  const erlaubt = new Set(['greet', 'greetFirst', 'exOpen', 'warmupIntro', 'debrief']);
  for (const o of fullRun('key')) assert.ok(erlaubt.has(o.kind), 'unerlaubte Art bei key: ' + o.kind);
});

test('nach der Obergrenze schweigt der Coach auch bei zutreffendem Trigger', () => {
  let s = Se.sessionNew(ctx('key'));
  for (let i = 0; i < 30; i++) {
    const r = Se.onExerciseOpen(s, { id: 'x' + i, name: 'E' + i, targetSets: 3, targetReps: 8, lastKg: 50 });
    s = r.sess;
  }
  assert.strictEqual(Se.onExerciseOpen(s, { id: 'z', name: 'Z', targetSets: 3, targetReps: 8, lastKg: 50 }).out, null);
});

test('Begruessung kommt genau einmal', () => {
  const kinds = fullRun('full').map(o => o.kind);
  assert.strictEqual(kinds.filter(k => k === 'greet' || k === 'greetFirst').length, 1);
});

test('ohne vorherige gleichartige Einheit kommt greetFirst', () => {
  const c = ctx('full', { lastSame: null });
  const r = Se.onStart(Se.sessionNew(c), c);
  assert.strictEqual(r.out.kind, 'greetFirst');
});

test('gemutete Arten kommen nicht vor', () => {
  const c = ctx('full', { muted: ['fatigue', 'stall'] });
  let s = Se.sessionNew(c);
  const outs = [];
  const push = r => { s = r.sess; if (r.out) outs.push(r.out); };
  push(Se.onStart(s, c));
  for (let i = 0; i < 6; i++) {
    push(Se.onSet(s, { exId: 'e1', reps: 8 - i, kg: 60, ts: T0 + i * 200000 }));
    push(Se.onRest(s, 90 + i * 45));
  }
  push(Se.onTick(s, T0 + 40 * 60000));
  for (const o of outs) assert.ok(o.kind !== 'fatigue' && o.kind !== 'stall', 'gemutet: ' + o.kind);
});

test('Stillstand greift erst nach zwoelf Minuten', () => {
  const c = ctx('full');
  let s = Se.sessionNew(c);
  s = Se.onStart(s, c).sess;
  s = Se.onSet(s, { exId: 'e1', reps: 8, kg: 60, ts: T0 }).sess;
  assert.strictEqual(Se.onTick(s, T0 + 11 * 60000).out, null);
  const spaet = Se.onTick(s, T0 + 13 * 60000);
  assert.strictEqual(spaet.out.kind, 'stall');
});

test('Stillstand meldet sich nicht zweimal', () => {
  const c = ctx('full');
  let s = Se.sessionNew(c);
  s = Se.onStart(s, c).sess;
  s = Se.onSet(s, { exId: 'e1', reps: 8, kg: 60, ts: T0 }).sess;
  const a = Se.onTick(s, T0 + 13 * 60000); s = a.sess;
  assert.strictEqual(Se.onTick(s, T0 + 30 * 60000).out, null);
});

test('Halbzeit-Einordnung nennt das Volumen', () => {
  const c = ctx('full');
  let s = Se.sessionNew(c);
  s = Se.onStart(s, c).sess;
  let mid = null;
  for (let i = 0; i < 6 && !mid; i++) {
    const r = Se.onSet(s, { exId: 'e1', reps: 8, kg: 60, ts: T0 + i * 120000 });
    s = r.sess; if (r.out && r.out.kind === 'mid') mid = r.out;
  }
  assert.ok(mid, 'Halbzeit-Einordnung kam nicht');
  assert.strictEqual(typeof mid.vars.vol, 'number');
});

test('Abschluss kommt immer, auch wenn das Budget aufgebraucht ist', () => {
  let s = Se.sessionNew(ctx('key'));
  for (let i = 0; i < 20; i++) s = Se.onExerciseOpen(s, { id: 'x' + i, name: 'E', targetSets: 3, targetReps: 8, lastKg: 50 }).sess;
  const end = Se.sessionEnd(s, { sets: 12, vol: 8000, prs: [] });
  assert.ok(end.out, 'der Abschluss darf nie ausfallen');
  assert.strictEqual(end.out.kind, 'debrief');
});

test('Zustand einer fremden Einheit wird verworfen', () => {
  const alt = Se.sessionNew(ctx('full'));
  assert.strictEqual(Se.isStale(alt, T0 + 999), true);
  assert.strictEqual(Se.isStale(alt, T0), false);
});

test('out liefert Schluessel und Variablen, keinen fertigen Text', () => {
  const c = ctx('full');
  const r = Se.onStart(Se.sessionNew(c), c);
  assert.strictEqual(typeof r.out.key, 'string');
  assert.strictEqual(typeof r.out.vars, 'object');
  assert.strictEqual(r.out.text, undefined);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-session.test.js
```

Erwartung: FAIL mit `Cannot find module '../js/coach-session.js'`.

- [ ] **Step 3: Modul schreiben**

`js/coach-session.js`:

```js
/* GymTrack — Erzaehlbogen der laufenden Einheit (Block 3)
   Fuehrt einen Zustand ueber das Training, damit der Coach weiss, WO man steht,
   statt nur auf Einzelsaetze zu reagieren.

   Liefert Satz-SCHLUESSEL, keinen fertigen Text: so bleibt das Modul unabhaengig
   von Persona und Sprache und ist ohne beides testbar. index.html macht daraus
   ueber _say(key, vars) den Satz.

   Die Obergrenze ist der wichtigste Teil dieser Datei. Ohne sie wird aus
   Begleitung Geschwaetz, und ein geschwaetziger Coach wird abgeschaltet. */
(function (root) {
  'use strict';

  var CAP = { off: 0, key: 4, full: 8 };

  // Welche Arten auf welcher Stufe ueberhaupt vorkommen duerfen.
  // key = Punkte 1, 2, 3, 7, 9 der Spec (Bogen, Uebungsansage, Rueckfrage,
  // Abschluss, Aufwaermsaetze). Alles Weitere ist 'full'.
  var LEVEL_KINDS = {
    off:  [],
    key:  ['greet', 'greetFirst', 'exOpen', 'warmupIntro', 'debrief'],
    full: ['greet', 'greetFirst', 'mid', 'exOpen', 'warmupIntro', 'restTip', 'restNext',
           'fatigue', 'stall', 'debrief', 'recall', 'plateau', 'timeBudget', 'cue'],
  };

  // Arten, die je Einheit hoechstens einmal vorkommen. exOpen fehlt bewusst:
  // die Ansage gilt je Uebung, nicht je Einheit.
  var ONCE = ['greet', 'greetFirst', 'mid', 'fatigue', 'stall', 'debrief', 'recall', 'plateau', 'timeBudget'];

  var STALL_MS = 12 * 60000;

  function sessionNew(ctx) {
    var c = ctx || {};
    return {
      wkTs: c.wkTs || 0,
      level: (c.level === 'off' || c.level === 'full') ? c.level : 'key',
      said: [],            // Arten, die schon vorkamen
      spoken: 0,           // zaehlt gegen CAP
      setCount: 0,
      volSoFar: 0,
      lastSetTs: 0,
      rests: [],           // Pausenlaengen in Sekunden, fuer das Ermuedungsmuster
      repsByEx: {},        // exId -> [reps], fuer den Wiederholungsabfall
      openEx: null,
      muted: Array.isArray(c.muted) ? c.muted.slice() : [],
      expectedSets: c.expectedSets || 0,
    };
  }

  // Ein Zustand aus einer anderen Einheit ist wertlos — nach einem App-Neustart
  // mitten im Training wuerde er sonst falsche Zahlen erzaehlen.
  function isStale(sess, wkTs) { return !sess || sess.wkTs !== wkTs; }

  // Die eine Stelle, an der ueber Reden oder Schweigen entschieden wird.
  // JEDE Aeusserung laeuft hier durch — es gibt keinen zweiten Weg nach draussen.
  function emit(sess, kind, key, vars, force) {
    var s = sess;
    if (s.level === 'off' && !force) return { sess: s, out: null };
    if (LEVEL_KINDS[s.level].indexOf(kind) < 0 && !force) return { sess: s, out: null };
    if (s.muted.indexOf(kind) >= 0) return { sess: s, out: null };
    if (ONCE.indexOf(kind) >= 0 && s.said.indexOf(kind) >= 0) return { sess: s, out: null };
    if (!force && s.spoken >= (CAP[s.level] || 0)) return { sess: s, out: null };
    var next = Object.assign({}, s, {
      said: s.said.concat([kind]),
      spoken: s.spoken + (force ? 0 : 1),
    });
    return { sess: next, out: { kind: kind, key: key, vars: vars || {} } };
  }

  function onStart(sess, ctx) {
    var c = ctx || {};
    var ls = c.lastSame;
    if (ls) return emit(sess, 'greet', 'greet', { ex: ls.ex, kg: ls.kg, reps: ls.reps, sets: ls.sets });
    return emit(sess, 'greetFirst', 'greetFirst', { ex: c.planName || '' });
  }

  function onExerciseOpen(sess, ex) {
    var e = ex || {};
    var s = Object.assign({}, sess, { openEx: e.id || null });
    return emit(s, 'exOpen', 'exOpen', { ex: e.name || '', kg: e.lastKg, reps: e.targetReps, sets: e.targetSets });
  }

  function onSet(sess, log) {
    var l = log || {};
    var reps = typeof l.reps === 'number' ? l.reps : 0;
    var kg = typeof l.kg === 'number' ? l.kg : 0;
    var byEx = Object.assign({}, sess.repsByEx);
    var exId = l.exId || 'x';
    byEx[exId] = (byEx[exId] || []).concat([reps]);
    var s = Object.assign({}, sess, {
      setCount: sess.setCount + 1,
      volSoFar: sess.volSoFar + reps * kg,
      lastSetTs: l.ts || sess.lastSetTs,
      repsByEx: byEx,
    });

    // Halbzeit: einmal, wenn die Haelfte der erwarteten Saetze steht. Ohne
    // Erwartungswert ersatzweise ab dem sechsten Satz.
    var halb = s.expectedSets ? Math.ceil(s.expectedSets / 2) : 6;
    if (s.setCount === halb) {
      return emit(s, 'mid', 'mid', { vol: Math.round(s.volSoFar) });
    }

    // Ermuedungsmuster: Wiederholungsabfall UND laenger werdende Pausen
    // zusammen. Einzeln ist beides normal — zusammen ist es Reserve am Ende.
    var r = byEx[exId];
    if (r.length >= 3 && r[r.length - 1] <= r[0] - 2 && _restsRising(s.rests)) {
      return emit(s, 'fatigue', 'fatigue', {});
    }
    return { sess: s, out: null };
  }

  function _restsRising(rests) {
    if (!rests || rests.length < 3) return false;
    var a = rests[rests.length - 3], c = rests[rests.length - 1];
    return c > a * 1.25;
  }

  function onRest(sess, secs) {
    var v = typeof secs === 'number' ? secs : 0;
    var s = Object.assign({}, sess, { rests: sess.rests.concat([v]) });
    // Hoechstens eine Meldung je Pause — hier die Ankuendigung des naechsten
    // Satzes. Der Technikpunkt (restTip) wird von index.html angestossen, wenn
    // das Dossier einen hergibt.
    if (v >= 60) return emit(s, 'restNext', 'restNext', {});
    return { sess: s, out: null };
  }

  function onTick(sess, now) {
    if (!sess.lastSetTs) return { sess: sess, out: null };
    if ((now - sess.lastSetTs) < STALL_MS) return { sess: sess, out: null };
    return emit(sess, 'stall', 'stall', {});
  }

  // force: der Abschluss faellt NIE aus. Er ist der Satz, der die Einheit
  // zumacht — ihn am Budget scheitern zu lassen waere die eine Stelle, an der
  // Sparsamkeit als Gleichgueltigkeit ankommt.
  function sessionEnd(sess, summary) {
    var su = summary || {};
    return emit(sess, 'debrief', 'debrief',
      { sets: su.sets != null ? su.sets : sess.setCount,
        vol: su.vol != null ? Math.round(su.vol) : Math.round(sess.volSoFar) }, true);
  }

  var API = { sessionNew: sessionNew, isStale: isStale, onStart: onStart,
              onExerciseOpen: onExerciseOpen, onSet: onSet, onRest: onRest,
              onTick: onTick, sessionEnd: sessionEnd, emit: emit,
              CAP: CAP, LEVEL_KINDS: LEVEL_KINDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachSession = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Tests laufen lassen, grün bestätigen**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-session.test.js
```

Erwartung: PASS, 14 Tests. Schlägt „key haelt die Obergrenze von vier ein" fehl, ist `emit()` umgangen worden — dann prüfen, ob eine Funktion einen Rückgabewert an `emit` vorbei baut.

- [ ] **Step 5: Commit**

```bash
git add js/coach-session.js test/coach-session.test.js && git commit -m "feat(coach): Erzaehlbogen mit harter Obergrenze je Einheit" && git push origin main
```

---

### Task 14: Aufwärmsätze und Technik-Cues

Zwei kleine, vollständig statische Module. Ein Trainer sagt das Aufwärmschema an; die App zählt Aufwärmsätze zwar getrennt (`warmups`), sagt aber nie, welche es sein sollen.

**Files:**
- Create: `js/coach-warmup.js`, `test/coach-warmup.test.js`
- Create: `js/coach-cues.js`, `test/coach-cues.test.js`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `CoachWarmup.warmupSets(workKg, opts)` → `[{kg, reps, pct}]` — leer, wenn das Arbeitsgewicht zu leicht ist
  - `CoachWarmup.roundToPlate(kg, step, barKg)` → `number`
  - `CoachWarmup.format(sets, lang)` → `string` — `'20 kg × 5, 30 kg × 3, 40 kg × 1'`
  - `CoachCues.cueFor(exerciseName, lang)` → `string|null`

- [ ] **Step 1: Fehlschlagende Tests für die Aufwärmsätze**

`test/coach-warmup.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const W = require('../js/coach-warmup.js');

test('rundet auf die verfuegbare Schrittweite', () => {
  assert.strictEqual(W.roundToPlate(43.7, 2.5, 20), 45);
  assert.strictEqual(W.roundToPlate(41.2, 2.5, 20), 40);
  assert.strictEqual(W.roundToPlate(52, 5, 0), 50);
});

test('rundet nie unter das Hantelstangen-Gewicht', () => {
  assert.strictEqual(W.roundToPlate(12, 2.5, 20), 20);
});

test('drei Aufwaermsaetze bei ausreichendem Arbeitsgewicht', () => {
  const s = W.warmupSets(100, { step: 2.5, barKg: 20 });
  assert.strictEqual(s.length, 3);
  assert.deepStrictEqual(s.map(x => x.reps), [5, 3, 1]);
});

test('kein Aufwaermsatz erreicht oder uebersteigt das Arbeitsgewicht', () => {
  for (const kg of [60, 82.5, 100, 140, 47.5]) {
    for (const s of W.warmupSets(kg, { step: 2.5, barKg: 20 })) {
      assert.ok(s.kg < kg, s.kg + ' >= Arbeitsgewicht ' + kg);
    }
  }
});

test('Aufwaermsaetze steigen streng an', () => {
  const s = W.warmupSets(120, { step: 2.5, barKg: 20 });
  for (let i = 1; i < s.length; i++) assert.ok(s[i].kg > s[i - 1].kg, 'nicht streng steigend');
});

test('zu leichtes Arbeitsgewicht ergibt keine Aufwaermsaetze', () => {
  assert.deepStrictEqual(W.warmupSets(25, { step: 2.5, barKg: 20 }), []);
  assert.deepStrictEqual(W.warmupSets(0, { step: 2.5, barKg: 20 }), []);
  assert.deepStrictEqual(W.warmupSets(null, { step: 2.5, barKg: 20 }), []);
});

test('Maschinen ohne Stange nutzen die Schrittweite fuenf', () => {
  const s = W.warmupSets(80, { step: 5, barKg: 0 });
  for (const x of s) assert.strictEqual(x.kg % 5, 0, x.kg + ' ist kein Vielfaches von 5');
});

test('doppelte Gewichte werden zusammengefasst', () => {
  // Bei kleinem Arbeitsgewicht koennen 50 % und 70 % auf dieselbe Stufe runden.
  const s = W.warmupSets(45, { step: 2.5, barKg: 20 });
  const kgs = s.map(x => x.kg);
  assert.strictEqual(new Set(kgs).size, kgs.length, 'Duplikate: ' + kgs.join(','));
});

test('format schreibt deutsch mit Komma, englisch mit Punkt', () => {
  const s = [{ kg: 22.5, reps: 5 }, { kg: 30, reps: 3 }];
  assert.strictEqual(W.format(s, 'de'), '22,5 kg × 5, 30 kg × 3');
  assert.strictEqual(W.format(s, 'en'), '22.5 kg × 5, 30 kg × 3');
  assert.strictEqual(W.format([], 'de'), '');
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-warmup.test.js
```

- [ ] **Step 3: `coach-warmup.js` schreiben**

```js
/* GymTrack — Aufwaermsaetze (Block 3)
   Rein rechnerisch, kein Modell. 50 % × 5, 70 % × 3, 85 % × 1 ist das
   verbreitetste Schema und fuer die grosse Mehrheit richtig genug — der Coach
   sagt es an, statt den Nutzer raten zu lassen. */
(function (root) {
  'use strict';

  var SCHEME = [{ pct: 0.50, reps: 5 }, { pct: 0.70, reps: 3 }, { pct: 0.85, reps: 1 }];

  function roundToPlate(kg, step, barKg) {
    var st = (typeof step === 'number' && step > 0) ? step : 2.5;
    var bar = (typeof barKg === 'number' && barKg > 0) ? barKg : 0;
    if (bar > 0) {
      // Nur die Scheiben sind teilbar, die Stange ist fix. Deshalb wird der
      // Anteil OBERHALB der Stange gerundet, nicht das Gesamtgewicht.
      var ueber = Math.max(0, kg - bar);
      return bar + Math.round(ueber / st) * st;
    }
    return Math.max(st, Math.round(kg / st) * st);
  }

  function warmupSets(workKg, opts) {
    var o = opts || {};
    var w = (typeof workKg === 'number' && isFinite(workKg)) ? workKg : 0;
    var bar = (typeof o.barKg === 'number') ? o.barKg : 20;
    var step = o.step || 2.5;
    // Unter der Stange plus einer Stufe gibt es nichts sinnvoll aufzuwaermen.
    if (w < Math.max(bar + step * 2, 30)) return [];
    var out = [], seen = {};
    for (var i = 0; i < SCHEME.length; i++) {
      var kg = roundToPlate(w * SCHEME[i].pct, step, bar);
      // Niemals das Arbeitsgewicht erreichen — ein "Aufwaermsatz" auf
      // Arbeitsgewicht ist der Arbeitssatz.
      if (kg >= w) kg = w - step;
      if (kg < bar || kg <= 0) continue;
      if (seen[kg]) continue;      // 50 % und 70 % koennen auf dieselbe Stufe fallen
      seen[kg] = 1;
      out.push({ kg: kg, reps: SCHEME[i].reps, pct: SCHEME[i].pct });
    }
    return out;
  }

  function format(sets, lang) {
    if (!sets || !sets.length) return '';
    return sets.map(function (s) {
      var n = (Math.round(s.kg * 10) / 10).toString();
      if (lang !== 'en') n = n.replace('.', ',');
      return n + ' kg × ' + s.reps;
    }).join(', ');
  }

  var API = { warmupSets: warmupSets, roundToPlate: roundToPlate, format: format, SCHEME: SCHEME };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachWarmup = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Test laufen lassen, grün bestätigen**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-warmup.test.js
```

Erwartung: PASS, 9 Tests.

- [ ] **Step 5: Fehlschlagende Tests für die Technik-Cues**

`test/coach-cues.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/coach-cues.js');

test('bekannte Uebung liefert einen Hinweis', () => {
  const c = C.cueFor('Bankdrücken', 'de');
  assert.strictEqual(typeof c, 'string');
  assert.ok(c.length > 10);
});

test('Treffer ist unabhaengig von Gross-Kleinschreibung und Zusaetzen', () => {
  assert.ok(C.cueFor('bankdruecken kurzhantel', 'de'));
  assert.ok(C.cueFor('BANKDRÜCKEN', 'de'));
  assert.ok(C.cueFor('Bench Press', 'en'));
});

test('unbekannte Uebung liefert null statt eines Allgemeinplatzes', () => {
  assert.strictEqual(C.cueFor('Unterarm-Wackeln', 'de'), null);
  assert.strictEqual(C.cueFor('', 'de'), null);
  assert.strictEqual(C.cueFor(null, 'de'), null);
});

test('jeder Eintrag existiert in beiden Sprachen', () => {
  for (const key of Object.keys(C.CUES)) {
    assert.ok(C.CUES[key].de && C.CUES[key].de.length > 10, key + ' hat kein DE');
    assert.ok(C.CUES[key].en && C.CUES[key].en.length > 10, key + ' hat kein EN');
  }
});

test('kein Hinweis enthaelt ein Emoji', () => {
  for (const key of Object.keys(C.CUES)) {
    for (const l of ['de', 'en']) {
      assert.ok(!/\p{Extended_Pictographic}/u.test(C.CUES[key][l]), key + '/' + l + ' enthaelt ein Emoji');
    }
  }
});

test('mindestens zwoelf Uebungen abgedeckt', () => {
  assert.ok(Object.keys(C.CUES).length >= 12);
});
```

- [ ] **Step 6: `coach-cues.js` schreiben**

Eine statische Tabelle. **Keine externe Bibliothek, kein Modell.** Der Schlüssel ist ein normalisierter Namensbestandteil; die Zuordnung läuft über `indexOf`, damit „Bankdrücken Kurzhantel" denselben Hinweis bekommt.

```js
/* GymTrack — Technik-Hinweise (Block 3)
   Eine Zeile je Uebung, statisch. Ein Trainer sagt genau einen Punkt vor dem
   schweren Satz — nicht drei. Deshalb ein Cue je Uebung, nicht eine Liste. */
(function (root) {
  'use strict';

  var CUES = {
    bankdruck:  { de: 'Schulterblätter zusammen und unten halten, Füße fest am Boden.',
                  en: 'Squeeze the shoulder blades down and back, keep the feet planted.' },
    bench:      { de: 'Schulterblätter zusammen und unten halten, Füße fest am Boden.',
                  en: 'Squeeze the shoulder blades down and back, keep the feet planted.' },
    kniebeug:   { de: 'Knie folgen den Fußspitzen, Brust bleibt oben.',
                  en: 'Knees track over the toes, keep the chest up.' },
    squat:      { de: 'Knie folgen den Fußspitzen, Brust bleibt oben.',
                  en: 'Knees track over the toes, keep the chest up.' },
    kreuzheb:   { de: 'Stange am Schienbein entlang, Rücken bleibt gerade.',
                  en: 'Keep the bar against the shins, back stays flat.' },
    deadlift:   { de: 'Stange am Schienbein entlang, Rücken bleibt gerade.',
                  en: 'Keep the bar against the shins, back stays flat.' },
    latzug:     { de: 'Ellbogen nach unten ziehen, nicht mit den Händen arbeiten.',
                  en: 'Pull the elbows down, do not work with the hands.' },
    pulldown:   { de: 'Ellbogen nach unten ziehen, nicht mit den Händen arbeiten.',
                  en: 'Pull the elbows down, do not work with the hands.' },
    rudern:     { de: 'Zum unteren Brustkorb ziehen, Oberkörper ruhig halten.',
                  en: 'Pull to the lower ribs, keep the torso still.' },
    row:        { de: 'Zum unteren Brustkorb ziehen, Oberkörper ruhig halten.',
                  en: 'Pull to the lower ribs, keep the torso still.' },
    schulterdr: { de: 'Rippen unten lassen, nicht ins Hohlkreuz ausweichen.',
                  en: 'Keep the ribs down, do not arch the lower back.' },
    overheadpr: { de: 'Rippen unten lassen, nicht ins Hohlkreuz ausweichen.',
                  en: 'Keep the ribs down, do not arch the lower back.' },
    bizeps:     { de: 'Ellbogen bleiben am Körper, kein Schwung aus der Hüfte.',
                  en: 'Elbows stay at the sides, no swing from the hips.' },
    curl:       { de: 'Ellbogen bleiben am Körper, kein Schwung aus der Hüfte.',
                  en: 'Elbows stay at the sides, no swing from the hips.' },
    trizeps:    { de: 'Oberarme bleiben still, nur der Unterarm bewegt sich.',
                  en: 'Upper arms stay still, only the forearm moves.' },
    beinpress:  { de: 'Nicht ganz durchstrecken, Rücken bleibt an der Lehne.',
                  en: 'Do not lock out, keep the back against the pad.' },
    legpress:   { de: 'Nicht ganz durchstrecken, Rücken bleibt an der Lehne.',
                  en: 'Do not lock out, keep the back against the pad.' },
    beinstreck: { de: 'Oben kurz halten, nicht in den Anschlag fallen lassen.',
                  en: 'Pause briefly at the top, do not drop into the stop.' },
    beinbeug:   { de: 'Hüfte bleibt an der Auflage, Bewegung nur aus dem Knie.',
                  en: 'Hips stay on the pad, movement comes from the knee only.' },
    wadenheb:   { de: 'Ganze Strecke nutzen, unten kurz dehnen.',
                  en: 'Use the full range, stretch briefly at the bottom.' },
    klimmzug:   { de: 'Aus den Schulterblättern starten, nicht aus den Armen.',
                  en: 'Start from the shoulder blades, not from the arms.' },
    pullup:     { de: 'Aus den Schulterblättern starten, nicht aus den Armen.',
                  en: 'Start from the shoulder blades, not from the arms.' },
    dip:        { de: 'Leicht vorlehnen für die Brust, aufrecht für den Trizeps.',
                  en: 'Lean forward for the chest, stay upright for the triceps.' },
    seitheb:    { de: 'Bis Schulterhöhe, kleiner Finger führt.',
                  en: 'Up to shoulder height, lead with the little finger.' },
    plank:      { de: 'Gesäß anspannen, Hüfte weder durchhängen noch hochziehen.',
                  en: 'Squeeze the glutes, hips neither sag nor pike.' },
  };

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]/g, '');
  }

  function cueFor(name, lang) {
    var n = norm(name);
    if (!n) return null;
    var keys = Object.keys(CUES);
    // Laengster passender Schluessel gewinnt: "beinbeug" soll nicht von "bein"
    // geschlagen werden, falls spaeter ein kuerzerer Schluessel dazukommt.
    var best = null;
    for (var i = 0; i < keys.length; i++) {
      if (n.indexOf(keys[i]) >= 0 && (!best || keys[i].length > best.length)) best = keys[i];
    }
    if (!best) return null;
    return CUES[best][lang === 'en' ? 'en' : 'de'] || null;
  }

  var API = { cueFor: cueFor, CUES: CUES };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachCues = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 7: Tests laufen lassen, grün bestätigen**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-warmup.test.js test/coach-cues.test.js
```

Erwartung: PASS, 15 Tests zusammen.

- [ ] **Step 8: Commit**

```bash
git add js/coach-warmup.js js/coach-cues.js test/coach-warmup.test.js test/coach-cues.test.js && git commit -m "feat(coach): Aufwaermsaetze und Technik-Hinweise, rein algorithmisch" && git push origin main
```

---

### Task 15: Satz-Rückfrage — leicht / passend / schwer

Die Stelle, an der der Coach zum ersten Mal **fragt**, statt nur zu sagen. Gleichzeitig ist es RPE-Erfassung ohne Tipparbeit: das Ergebnis fließt in die Gewichtsempfehlung und ins Dossier.

**Files:**
- Create: `js/coach-rpe.js`, `test/coach-rpe.test.js`
- Modify: `index.html` — Chips unter der Coach-Leiste, Anbindung an `_ciAdjustW` (`index.html:11386`) und `toggleSetDone` (`index.html:16706`)

**Interfaces:**
- Consumes: `_ciAdjustW(w)` (bestehend), `CoachSession` aus Task 13
- Produces:
  - `CoachRpe.toRpe(answer)` → `number|null` — `'leicht'`→6, `'passend'`→8, `'schwer'`→9.5
  - `CoachRpe.adjustNext(kg, answer, step)` → `number` — nächster Gewichtsvorschlag
  - `CoachRpe.summarize(answers)` → `{easy, ok, hard, trend}` — für das Dossier

- [ ] **Step 1: Fehlschlagenden Test schreiben**

`test/coach-rpe.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/coach-rpe.js');

test('drei Antworten ergeben drei RPE-Werte', () => {
  assert.strictEqual(R.toRpe('leicht'), 6);
  assert.strictEqual(R.toRpe('passend'), 8);
  assert.strictEqual(R.toRpe('schwer'), 9.5);
  assert.strictEqual(R.toRpe('quatsch'), null);
  assert.strictEqual(R.toRpe(null), null);
});

test('schwer senkt, leicht hebt, passend laesst stehen', () => {
  assert.ok(R.adjustNext(60, 'schwer', 2.5) < 60);
  assert.ok(R.adjustNext(60, 'leicht', 2.5) > 60);
  assert.strictEqual(R.adjustNext(60, 'passend', 2.5), 60);
});

test('die Anpassung springt nie ueber eine Schrittweite hinaus', () => {
  for (const a of ['leicht', 'schwer']) {
    for (const step of [1.25, 2.5, 5]) {
      const d = Math.abs(R.adjustNext(80, a, step) - 80);
      assert.ok(d <= step + 1e-9, a + '/' + step + ' sprang um ' + d);
      assert.ok(d > 0, a + '/' + step + ' bewegte nichts');
    }
  }
});

test('Ergebnis bleibt ein Vielfaches der Schrittweite', () => {
  assert.strictEqual(R.adjustNext(62.5, 'leicht', 2.5) % 2.5, 0);
  assert.strictEqual(R.adjustNext(62.5, 'schwer', 2.5) % 2.5, 0);
});

test('Gewicht faellt nie unter die Schrittweite', () => {
  assert.ok(R.adjustNext(2.5, 'schwer', 2.5) >= 2.5);
});

test('unbekannte Antwort laesst das Gewicht unveraendert', () => {
  assert.strictEqual(R.adjustNext(60, 'weissnicht', 2.5), 60);
});

test('summarize zaehlt und erkennt den Trend', () => {
  assert.deepStrictEqual(R.summarize(['schwer', 'schwer', 'schwer']), { easy: 0, ok: 0, hard: 3, trend: 'hard' });
  assert.deepStrictEqual(R.summarize(['leicht', 'leicht', 'passend']), { easy: 2, ok: 1, hard: 0, trend: 'easy' });
  assert.deepStrictEqual(R.summarize(['leicht', 'schwer', 'passend']), { easy: 1, ok: 1, hard: 1, trend: 'ok' });
  assert.deepStrictEqual(R.summarize([]), { easy: 0, ok: 0, hard: 0, trend: 'ok' });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-rpe.test.js
```

- [ ] **Step 3: Modul schreiben**

```js
/* GymTrack — Satz-Rueckfrage (Block 3)
   Drei Chips statt eines RPE-Feldes. Wer nicht antwortet, verliert nichts —
   deshalb sind die Werte hier bewusst grob: 6 / 8 / 9,5 statt einer Zehnerskala,
   die niemand ehrlich ausfuellt. */
(function (root) {
  'use strict';

  var MAP = { leicht: 6, easy: 6, passend: 8, ok: 8, schwer: 9.5, hard: 9.5 };

  function toRpe(a) {
    var v = MAP[String(a == null ? '' : a).toLowerCase()];
    return (typeof v === 'number') ? v : null;
  }

  // Genau EINE Schrittweite rauf oder runter. Groessere Spruenge waeren aus einer
  // einzelnen Gefuehlsangabe nicht gedeckt — dafuer gibt es die Double
  // Progression und den Check-in.
  function adjustNext(kg, answer, step) {
    var st = (typeof step === 'number' && step > 0) ? step : 2.5;
    var w = (typeof kg === 'number' && isFinite(kg)) ? kg : 0;
    var r = toRpe(answer);
    if (r === null || r === 8) return w;
    var next = (r < 8) ? w + st : w - st;
    next = Math.round(next / st) * st;
    return Math.max(st, next);
  }

  function summarize(answers) {
    var a = Array.isArray(answers) ? answers : [];
    var out = { easy: 0, ok: 0, hard: 0, trend: 'ok' };
    for (var i = 0; i < a.length; i++) {
      var r = toRpe(a[i]);
      if (r === null) continue;
      if (r < 8) out.easy++; else if (r > 8) out.hard++; else out.ok++;
    }
    if (out.hard > out.easy && out.hard >= 2) out.trend = 'hard';
    else if (out.easy > out.hard && out.easy >= 2) out.trend = 'easy';
    return out;
  }

  var API = { toRpe: toRpe, adjustNext: adjustNext, summarize: summarize };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachRpe = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Test laufen lassen, grün bestätigen**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-rpe.test.js
```

Erwartung: PASS, 7 Tests.

- [ ] **Step 5: Chips in `index.html`**

Sie erscheinen **unter** der Coach-Leiste, innerhalb derselben Fläche — keine neue Fläche (Gestaltungsregel 2), nichts Modales, und nach acht Sekunden verschwinden sie von selbst (Gestaltungsregel 5).

Styles neben den bestehenden Coach-Bar-Regeln:

```css
.cb-ask3{display:flex;gap:8px;padding:8px 0 2px}
.cb-ask3 button{flex:1;padding:8px 6px;border-radius:9px;font-size:13px;font-weight:600;
       background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:var(--fg)}
.cb-ask3 button:active{background:rgba(var(--acc-rgb),.16)}
```

Und die Logik:

```js
// ── SATZ-RUECKFRAGE ──────────────────────────────────────
// Drei Chips nach dem Speichern eines Satzes. Sie zaehlen NICHT gegen die
// Obergrenze der Aeusserungen: das ist eine Bedienflaeche, keine Ansage — sonst
// waeren bei 'key' nach vier Saetzen vier Chip-Reihen verbraucht und der Coach
// haette kein Budget mehr fuer seinen eigentlichen Bogen.
let _rpeTimer = null;
let _rpeAnswers = [];

function _rpeAsk(exId, kg, step){
  const p = _persona();
  if (!p.setFeedback || p.inTraining === 'off') return;
  const bar = document.getElementById('wk-coach-bar');
  if (!bar) return;
  const host = document.createElement('div');
  host.className = 'cb-ask3';
  host.id = 'cb-ask3';
  const opts = [['leicht', tr('leicht')], ['passend', tr('passend')], ['schwer', tr('schwer')]];
  host.innerHTML = `<span style="flex:0 0 100%;font-size:12px;color:var(--fg2);padding-bottom:2px">${esc(_say('setAsk', {}))}</span>` +
    opts.map(([v, l]) => `<button type="button" data-rpe="${v}">${esc(l)}</button>`).join('');
  const old = document.getElementById('cb-ask3'); if (old) old.remove();
  bar.appendChild(host);
  bar.style.display = '';
  host.querySelectorAll('button[data-rpe]').forEach(b => b.onclick = () => {
    _rpeAnswer(b.getAttribute('data-rpe'), exId, kg, step);
  });
  // Acht Sekunden, dann weg. Kein Schritt im Training wartet je auf eine
  // Antwort an den Coach.
  clearTimeout(_rpeTimer);
  _rpeTimer = setTimeout(() => { const el = document.getElementById('cb-ask3'); if (el) el.remove(); }, 8000);
}

function _rpeAnswer(ans, exId, kg, step){
  clearTimeout(_rpeTimer);
  const el = document.getElementById('cb-ask3'); if (el) el.remove();
  try { haptic(8); } catch(_){}
  _rpeAnswers.push(ans);
  try {
    // 1) In den Satz-Log, damit die Zahl nicht nur im Kopf des Coaches lebt.
    const rpe = CoachRpe.toRpe(ans);
    if (rpe !== null) _rpeStoreOnLastSet(exId, rpe);
    // 2) Naechster Gewichtsvorschlag fuer DIESE Uebung.
    const next = CoachRpe.adjustNext(kg, ans, step);
    if (next !== kg) _rpeSuggestNext(exId, next);
    // 3) Kurze Quittung, damit die Antwort nicht ins Leere geht.
    const key = (ans === 'schwer') ? 'setAckHard' : (ans === 'leicht' ? 'setAckEasy' : null);
    if (key) _coachBarSet('tip', _say(key, { kg: next }), 4500);
  } catch(e) { console.warn('[Coach] Satz-Rueckfrage:', e); }
}
```

**Drei Funktionen müssen gegen den echten Code gebaut werden**, nicht erfunden: `_rpeStoreOnLastSet(exId, rpe)` schreibt `rpe` in den zuletzt gespeicherten Satz-Eintrag; `_rpeSuggestNext(exId, kg)` setzt den Vorschlag für den nächsten Satz derselben Übung; `haptic()` existiert bereits. Vor dem Schreiben `toggleSetDone` (`index.html:16706`) und die Datenstruktur der Satz-Logs lesen.

- [ ] **Step 6: Auslöser in `toggleSetDone` einhängen**

Am Ende von `toggleSetDone(li, si)` (`index.html:16706`), im Zweig „Satz wurde als erledigt markiert":

```js
  // Satz-Rueckfrage — defensiv, damit ein Fehler hier nie das Abhaken kostet.
  try {
    if (isPremium()) _rpeAsk(/* exId */, /* kg des Satzes */, /* Schrittweite der Uebung */);
  } catch(_){}
```

Die drei Argumente aus dem vorhandenen Kontext füllen. Ist die Schrittweite dort nicht verfügbar, `2.5` als Vorgabe verwenden und im Kommentar festhalten, warum.

- [ ] **Step 7: Trend ins Dossier**

In `finishWk()` (`index.html:16820`), nach dem Speichern:

```js
  try {
    const sum = CoachRpe.summarize(_rpeAnswers);
    if (sum.hard + sum.easy + sum.ok >= 3) _dossierNoteRpeTrend(sum);   // bestehender Dossier-Schreibweg
    _rpeAnswers = [];
  } catch(_){}
```

`_dossierNoteRpeTrend` benutzt den **bestehenden** Dossier-Schreibpfad aus dem Fundament — kein neuer Firestore-Zugriff.

- [ ] **Step 8: Im Simulator prüfen**

```bash
~/.claude/sim-native.sh gymtrack "iPhone 17"
```

Prüfliste:
1. Satz abhaken → drei Chips erscheinen in der Coach-Leiste, **nicht** als Overlay.
2. Nichts antippen, acht Sekunden warten → Chips verschwinden, das Training läuft unverändert weiter.
3. „schwer" antippen → kurze Quittung, der nächste Vorschlag derselben Übung ist eine Stufe niedriger.
4. „leicht" antippen → eine Stufe höher.
5. In den Einstellungen „Satz-Rückfrage" ausschalten → es erscheinen keine Chips mehr.
6. Während die Chips stehen, weiter Sätze abhaken — **nichts blockiert**.

```bash
xcrun simctl io "iPhone 17" screenshot /tmp/gymtrack-rpe.png
```

- [ ] **Step 9: Commit**

```bash
git add js/coach-rpe.js test/coach-rpe.test.js index.html && git commit -m "feat(coach): Satz-Rueckfrage leicht/passend/schwer steuert den naechsten Vorschlag" && git push origin main
```

---

### Task 16: Plateau-Diagnose und Zeitbudget

Zwei Funktionen, die den Coach von „sagt etwas" zu „hat etwas gesehen" bringen. **Beide beschreiben, keine schreibt vor** — Planänderungsvorschläge sind ausdrücklich gestrichen.

**Files:**
- Create: `js/coach-analyze.js`, `test/coach-analyze.test.js`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `CoachAnalyze.plateau(history)` → `{weeks, volDelta, restDelta}|null` — `history` = `[{ts, topKg, vol, avgRestSecs}]`, neueste zuletzt
  - `CoachAnalyze.prioritize(exercises, minutes)` → `{keep: string[], drop: string[]}`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

`test/coach-analyze.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const A = require('../js/coach-analyze.js');

const WEEK = 7 * 864e5, T0 = 1753600000000;
function hist(n, topKg, restSecs) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ ts: T0 - (n - 1 - i) * WEEK,
               topKg: typeof topKg === 'function' ? topKg(i) : topKg,
               vol: 5000, avgRestSecs: typeof restSecs === 'function' ? restSecs(i) : restSecs });
  }
  return out;
}

test('fuenf Wochen ohne Steigerung sind ein Plateau', () => {
  const p = A.plateau(hist(5, 80, 120));
  assert.ok(p);
  assert.strictEqual(p.weeks, 5);
});

test('steigende Gewichte sind kein Plateau', () => {
  assert.strictEqual(A.plateau(hist(6, i => 70 + i * 2.5, 120)), null);
});

test('unter vier Wochen wird nichts gemeldet', () => {
  assert.strictEqual(A.plateau(hist(3, 80, 120)), null);
  assert.strictEqual(A.plateau([]), null);
  assert.strictEqual(A.plateau(null), null);
});

test('kuerzer werdende Pausen werden als Beobachtung mitgeliefert', () => {
  const p = A.plateau(hist(5, 80, i => 150 - i * 10));
  assert.ok(p);
  assert.ok(p.restDelta < 0, 'restDelta muss negativ sein: ' + p.restDelta);
});

test('kleine Schwankungen brechen das Plateau nicht', () => {
  // 80 / 80 / 82,5 / 80 / 80 — der Ausreisser ist keine Steigerung.
  const h = hist(5, 80, 120);
  h[2].topKg = 82.5;
  assert.ok(A.plateau(h), 'ein einzelner Ausreisser darf das Plateau nicht aufheben');
});

test('Zeitbudget behaelt die wichtigsten Uebungen', () => {
  const ex = [
    { id: 'a', name: 'Kniebeuge', sets: 4, prio: 1 },
    { id: 'b', name: 'Beinpresse', sets: 3, prio: 2 },
    { id: 'c', name: 'Wadenheben', sets: 3, prio: 3 },
    { id: 'd', name: 'Beinstrecker', sets: 3, prio: 4 },
  ];
  const r = A.prioritize(ex, 30);
  assert.ok(r.keep.includes('a'), 'die wichtigste Uebung muss bleiben');
  assert.ok(r.drop.length > 0, 'bei 30 Minuten muss etwas wegfallen');
  assert.strictEqual(r.keep.length + r.drop.length, 4);
});

test('reichlich Zeit laesst alles stehen', () => {
  const ex = [{ id: 'a', name: 'X', sets: 3, prio: 1 }, { id: 'b', name: 'Y', sets: 3, prio: 2 }];
  const r = A.prioritize(ex, 120);
  assert.deepStrictEqual(r.drop, []);
  assert.strictEqual(r.keep.length, 2);
});

test('sehr wenig Zeit behaelt trotzdem mindestens eine Uebung', () => {
  const ex = [{ id: 'a', name: 'X', sets: 4, prio: 1 }, { id: 'b', name: 'Y', sets: 4, prio: 2 }];
  const r = A.prioritize(ex, 5);
  assert.strictEqual(r.keep.length, 1);
  assert.strictEqual(r.keep[0], 'a');
});

test('leere Uebungsliste ergibt leere Listen', () => {
  assert.deepStrictEqual(A.prioritize([], 45), { keep: [], drop: [] });
  assert.deepStrictEqual(A.prioritize(null, 45), { keep: [], drop: [] });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-analyze.test.js
```

- [ ] **Step 3: Modul schreiben**

```js
/* GymTrack — Plateau-Diagnose und Zeitbudget (Block 3)
   Der Coach BESCHREIBT, was er sieht, und schreibt nichts vor. Vorschlaege zur
   Aenderung des Trainingsplans sind ausdruecklich nicht Teil dieses Vorhabens —
   deshalb liefert plateau() Beobachtungen (Wochen, Volumen-, Pausenaenderung)
   und keine Empfehlung. */
(function (root) {
  'use strict';

  var MIN_WEEKS = 4;
  var SEC_PER_SET = 55;     // Ausfuehrung, ohne Pause
  var REST_DEFAULT = 90;

  function plateau(history) {
    var h = Array.isArray(history) ? history.filter(function (x) { return x && typeof x.topKg === 'number'; }) : [];
    if (h.length < MIN_WEEKS) return null;
    var erste = h[0].topKg;
    var letzte = h[h.length - 1].topKg;
    // Kein Plateau, wenn am Ende mehr steht als am Anfang. Ein einzelner
    // Ausreisser in der Mitte zaehlt nicht — sonst meldet das Modul nie etwas.
    if (letzte > erste) return null;
    var volA = h[0].vol || 0, volB = h[h.length - 1].vol || 0;
    var rA = h[0].avgRestSecs, rB = h[h.length - 1].avgRestSecs;
    return {
      weeks: h.length,
      volDelta: Math.round(volB - volA),
      restDelta: (typeof rA === 'number' && typeof rB === 'number') ? Math.round(rB - rA) : 0,
    };
  }

  // Kein Eingriff in den gespeicherten Plan — nur in die heutige Durchfuehrung.
  function prioritize(exercises, minutes) {
    var list = Array.isArray(exercises) ? exercises.slice() : [];
    if (!list.length) return { keep: [], drop: [] };
    var budget = (typeof minutes === 'number' && minutes > 0) ? minutes * 60 : 3600;
    list.sort(function (a, b) { return (a.prio || 99) - (b.prio || 99); });
    var keep = [], drop = [], used = 0;
    for (var i = 0; i < list.length; i++) {
      var sets = list[i].sets || 3;
      var kosten = sets * (SEC_PER_SET + (list[i].restSecs || REST_DEFAULT));
      // Die wichtigste Uebung bleibt IMMER — ein Trainingsplan ohne eine einzige
      // Uebung ist kein Ergebnis, sondern ein Fehler.
      if (keep.length === 0 || used + kosten <= budget) { keep.push(list[i].id); used += kosten; }
      else drop.push(list[i].id);
    }
    return { keep: keep, drop: drop };
  }

  var API = { plateau: plateau, prioritize: prioritize, MIN_WEEKS: MIN_WEEKS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachAnalyze = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Test laufen lassen, grün bestätigen**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-analyze.test.js
```

Erwartung: PASS, 9 Tests.

- [ ] **Step 5: Commit**

```bash
git add js/coach-analyze.js test/coach-analyze.test.js && git commit -m "feat(coach): Plateau-Diagnose und Zeitbudget, beschreibend statt vorschreibend" && git push origin main
```

---

### Task 17: Verdrahtung im Training und die Offline-Prüfung

Alle Module aus Block 3 gehen in `index.html` ans Training. **Genau eine Fläche**, `#wk-coach-bar` — es entsteht keine einzige neue.

**Files:**
- Modify: `index.html` — Skript-Tags, `S.coachSession`, Einhängepunkte, `_coachBarSet` um Persona und Ansage-Warteschlange

**Interfaces:**
- Consumes: alle Module aus Task 13 bis 16, `_say()` aus Task 7
- Produces:
  - `_csStart()`, `_csExercise(ex)`, `_csSet(log)`, `_csRest(secs)`, `_csEnd(summary)` — die fünf Einhängepunkte
  - `_csEmit(out)` — der einzige Weg von einem Modul-`out` auf den Bildschirm

- [ ] **Step 1: Skript-Tags**

Nach `coach-voice.js`:

```html
<script src="./js/coach-session.js"></script>
<script src="./js/coach-warmup.js"></script>
<script src="./js/coach-cues.js"></script>
<script src="./js/coach-rpe.js"></script>
<script src="./js/coach-analyze.js"></script>
```

- [ ] **Step 2: Zustand anlegen**

Neben den anderen Coach-Funktionen:

```js
// ── ERZAEHLBOGEN: VERDRAHTUNG ────────────────────────────
// S.coachSession lebt rein lokal (kein Firestore, keine Rules-Beruehrung) und
// wird bei fremdem wkTs verworfen — nach einem App-Neustart mitten im Training
// wuerde ein alter Zustand sonst falsche Zahlen erzaehlen.
function _csGet(wkTs){
  let s = S.coachSession;
  if (!s || CoachSession.isStale(s, wkTs)) return null;
  return s;
}
function _csPut(s){ S.coachSession = s; try { save(); } catch(_){} }

// DER EINZIGE Weg von einem Modul-Ergebnis auf den Bildschirm. Neue Meldung
// verdraengt die vorige — sie stapeln sich nie (Gestaltungsregel 3).
function _csEmit(out){
  if (!out) return;
  try {
    const txt = _say(out.key, out.vars);
    if (!txt) return;
    _coachBarSet('tip', txt, out.kind === 'debrief' ? 14000 : 9000);
  } catch(e) { console.warn('[Coach] Ausgabe:', e); }
}
```

- [ ] **Step 3: Die fünf Einhängepunkte**

```js
function _csStart(){
  try {
    if (!isPremium()) return;
    const lvl = _coachLevel();
    if (lvl === 'off') return;
    const ctx = {
      wkTs: WK.ts, level: lvl, planName: WK.planName || '',
      lastSame: _csLastSame(),            // letzte gleichartige Einheit oder null
      muted: _coachMutedKinds(),          // aus dem Aktions-Log des Fundaments
      expectedSets: _csExpectedSets(),
    };
    const r = CoachSession.onStart(CoachSession.sessionNew(ctx), ctx);
    _csPut(r.sess); _csEmit(r.out);
  } catch(e) { console.warn('[Coach] Start:', e); }
}

function _csExercise(ex){
  try {
    const s = _csGet(WK.ts); if (!s) return;
    const r = CoachSession.onExerciseOpen(s, ex);
    _csPut(r.sess); _csEmit(r.out);
    // Aufwaermsaetze und Technik-Cue haengen an derselben Stelle, laufen aber
    // ueber emit() des Moduls, damit sie derselben Obergrenze unterliegen.
    if (ex && typeof ex.lastKg === 'number') {
      const sets = CoachWarmup.warmupSets(ex.lastKg, { step: ex.stepKg || 2.5, barKg: ex.barKg != null ? ex.barKg : 20 });
      if (sets.length) {
        const w = CoachSession.emit(_csGet(WK.ts), 'warmupIntro', 'warmupIntro', { ex: ex.name });
        _csPut(w.sess);
        if (w.out) _coachBarSet('tip', _say('warmupIntro', { ex: ex.name }) + ' ' + CoachWarmup.format(sets, _lang()), 11000);
      }
    }
    const cue = CoachCues.cueFor(ex && ex.name, _lang());
    if (cue) {
      const c = CoachSession.emit(_csGet(WK.ts), 'cue', 'cue', { ex: ex.name });
      _csPut(c.sess);
      if (c.out) _coachBarSet('tip', cue, 9000);
    }
  } catch(e) { console.warn('[Coach] Uebung:', e); }
}

function _csSet(log){
  try {
    const s = _csGet(WK.ts); if (!s) return;
    const r = CoachSession.onSet(s, log);
    _csPut(r.sess); _csEmit(r.out);
  } catch(e) { console.warn('[Coach] Satz:', e); }
}

function _csRest(secs){
  try {
    const s = _csGet(WK.ts); if (!s) return;
    const r = CoachSession.onRest(s, secs);
    _csPut(r.sess); _csEmit(r.out);
  } catch(e) { console.warn('[Coach] Pause:', e); }
}

function _csEnd(summary){
  try {
    const s = _csGet(WK.ts); if (!s) return;
    const r = CoachSession.sessionEnd(s, summary);
    _csEmit(r.out);
    // Rueckblick auf einen eigenen Tipp — das Aktions-Log dafuer existiert seit
    // dem Fundament, wurde aber bisher nie erzaehlt.
    const rec = _coachLastAcceptedTip();
    if (rec) {
      const q = CoachSession.emit(r.sess, 'recall', 'recall', { ex: rec.exName });
      if (q.out) setTimeout(() => _coachBarSet('tip', _say('recall', { ex: rec.exName }), 9000), 3000);
    }
    S.coachSession = null; try { save(); } catch(_){}
  } catch(e) { console.warn('[Coach] Abschluss:', e); }
}
```

**Fünf Hilfsfunktionen müssen gegen den echten Code gebaut werden**, nicht erfunden: `_csLastSame()` (letzte Einheit desselben Plantags aus `S.sessions`), `_csExpectedSets()` (Summe der Zielsätze des heutigen Tags), `_coachMutedKinds()` (aus `js/coach-log.js`, die Drosselung nach fünf Ignorierungen existiert bereits), `_coachLastAcceptedTip()` (aus demselben Log) und `WK.ts` / `WK.planName` (echte Feldnamen prüfen).

- [ ] **Step 4: Aufrufe einhängen**

| Einhängepunkt | Stelle in `index.html` |
| --- | --- |
| `_csStart()` | dort, wo ein Training gestartet wird (`grep -n "function startWk\|_saveActiveWk" index.html`) |
| `_csExercise(ex)` | beim Öffnen einer Übung im Training |
| `_csSet(log)` | in `toggleSetDone` (`16706`), direkt neben dem `_rpeAsk`-Aufruf aus Task 15 |
| `_csRest(secs)` | wo der Pausentimer abläuft |
| `_csEnd(summary)` | in `finishWk()` (`16820`) |
| `CoachSession.onTick` | in den bestehenden Timer-Tick, höchstens einmal pro Minute |

Jeder Aufruf in `try/catch`.

- [ ] **Step 5: Alle Tests laufen lassen**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && npm test
```

Erwartung: alles grün.

- [ ] **Step 6: Offline-Prüfung — der eigentliche Punkt dieser Task**

Kellergyms haben kein Netz. Alle zwölf Trigger, der Router und die Gewichtsvorschläge müssen ohne Verbindung laufen.

```bash
~/.claude/sim-native.sh gymtrack "iPhone 17"
```

Dann das Netz des Simulators trennen — im Simulator-Menü **Features → Network Link Conditioner → 100 % Loss**, oder auf dem Mac das WLAN kurz abschalten. Danach ein komplettes Training durchspielen.

Prüfliste **ohne Netz**:
1. Trainingsstart → Begrüßung erscheint.
2. Übung öffnen → Ansage und Aufwärmschema erscheinen.
3. Sätze abhaken → Chips, Halbzeit-Einordnung, Ermüdungsmeldung erscheinen.
4. Training beenden → Abschluss erscheint.
5. Im Chat „Wie lang ist meine Streak?" → der Router antwortet.
6. Im Chat „Was hältst du von meinem Plan?" → **ein klarer Satz**, dass dafür eine Verbindung nötig ist. Kein roter Fehler, kein Stacktrace, kein hängender Ladepunkt.

**Punkt 6 ist der, der am ehesten fehlt.** Falls dort heute eine Fehlermeldung erscheint, wird sie in dieser Task ersetzt:

```js
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    _aicPush('assistant', tr('Dafür brauche ich kurz Internet. Deine Zahlen und Vorschläge laufen auch ohne weiter.'));
    return;
  }
```

- [ ] **Step 7: Obergrenze in der echten App belegen**

Profil auf „Ausgewogen" (`key`) stellen und ein Training mit mindestens sechs Übungen und zwanzig Sätzen durchspielen. **Mitzählen:** es dürfen höchstens vier Coach-Äußerungen erscheinen, plus dem Abschluss. Erscheinen mehr, ist `emit()` irgendwo umgangen worden.

Dasselbe mit „Eng dabei" (`full`): höchstens acht, plus Abschluss.

```bash
xcrun simctl io "iPhone 17" screenshot /tmp/gymtrack-training.png
```

- [ ] **Step 8: Commit**

```bash
git add index.html && git commit -m "feat(coach): Erzaehlbogen im Training verdrahtet, offline geprueft" && git push origin main
```

---

## Blockabschluss 3

Ritual von oben durchlaufen. Changelog-Key: `cl-2026-07-28-coach-training`.

```js
  'cl-2026-07-28-coach-training': {
    label: '28.07.2026 · Der Coach begleitet dein Training',
    items: [
      'Er begrüßt dich mit dem, was du beim letzten Mal geschafft hast, ordnet zur Halbzeit ein und zieht am Ende Bilanz',
      'Beim Öffnen einer Übung sagt er dir dein Aufwärmschema an — in Kilo, nicht in Prozent',
      'Nach jedem Satz kannst du mit einem Tipp sagen: leicht, passend oder schwer. Das nächste Gewicht richtet sich danach',
      'Er merkt, wenn deine Wiederholungen fallen und die Pausen länger werden — und sagt es, bevor du dich verausgabst',
      'Alles davon läuft ohne Internet. Auch im Keller-Gym',
      'Wie oft er sich meldet, bestimmst du: höchstens vier Mal pro Training, oder acht, oder gar nicht',
    ]
  },
```

**Zusätzliche Prüfung, die über das Ritual hinausgeht:** In den Block-3-Dateien darf kein Netzaufruf stehen.

```bash
grep -n "fetch\|AI_WORKER_URL\|XMLHttpRequest" js/coach-session.js js/coach-warmup.js js/coach-cues.js js/coach-rpe.js js/coach-analyze.js
```

Erwartung: **keine Treffer.** Ein Treffer bedeutet, dass Block 3 Geld kostet, und macht den Block nicht abnahmefähig.

---

# Block 4 — Proaktive Meldungen

**Warum jetzt:** Der Coach soll sich melden, wenn die App zu ist. Das ist der Kanal, den Block 5 für den Wochenbericht braucht.

**Warum ohne Server:** Ein Cloudflare-Cron hätte einen Service-Account mit Lesezugriff auf **fremde** Nutzerdokumente gebraucht, Gesundheitsangaben erstmals auf einem Server abgelegt, einen neuen APNs-Token-Pfad unabhängig von `S.socialOn` samt Rules-Erweiterung erfordert und für jeden Nutzer jeden Tag Firestore-Leses gekostet. Die Geräte-Variante über `@capacitor/local-notifications` — bereits installiert und in Benutzung — erreicht dasselbe Ergebnis. iOS hält den Termin auch bei beendeter App.

**Bekannte Grenze, bewusst akzeptiert:** Eine lokal geplante Notification kennt nur den Stand vom letzten App-Öffnen. Für beide Anwendungsfälle reicht das genau.

---

### Task 18: `coach-notify.js` — der Frequenz-Deckel

Der Deckel ist der Grund, warum diese Funktion nicht nach zwei Wochen abgeschaltet wird. Er gilt **vor** der Planung: was nicht durchpasst, wird gar nicht erst eingeplant.

**Files:**
- Create: `js/coach-notify.js`
- Create: `test/coach-notify.test.js`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `CoachNotify.notifyNew()` → `{sentTs:{}, dayCount:0, dayKey:'', weekCount:0, weekKey:''}`
  - `CoachNotify.weekKey(ts)` → `string` — ISO-Woche, `'2026-W31'`
  - `CoachNotify.dayKey(ts)` → `string` — `'2026-07-28'`
  - `CoachNotify.mayNotify(state, kind, level, now)` → `boolean`
  - `CoachNotify.record(state, kind, now)` → neuer State
  - `CoachNotify.planAll(ctx)` → `[{id, at, kind, key, vars}]` — nach Zeit sortiert, Deckel bereits angewandt
  - `CoachNotify.CAPS` → `{still:…, normal:{day:1,week:4}, eng:{day:2,week:8}}`
  - `CoachNotify.COOLDOWN` → Mindestabstand je Art in Millisekunden

- [ ] **Step 1: Fehlschlagende Tests schreiben**

`test/coach-notify.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const N = require('../js/coach-notify.js');

const DAY = 864e5;
// Mittwoch, 2026-07-29, 10:00 UTC
const T0 = Date.UTC(2026, 6, 29, 10, 0, 0);

test('weekKey liefert die ISO-Woche zweistellig', () => {
  assert.match(N.weekKey(T0), /^2026-W\d{2}$/);
  assert.strictEqual(N.weekKey(Date.UTC(2026, 0, 5)), '2026-W02');
  // Jahreswechsel: der 1.1. gehoert oft noch zur Vorjahreswoche.
  assert.match(N.weekKey(Date.UTC(2027, 0, 1)), /^20(26|27)-W\d{2}$/);
});

test('dayKey liefert ein ISO-Datum', () => {
  assert.match(N.dayKey(T0), /^\d{4}-\d{2}-\d{2}$/);
});

test('still laesst nur den Wochenbericht durch', () => {
  const s = N.notifyNew();
  assert.strictEqual(N.mayNotify(s, 'report', 'still', T0), true);
  for (const k of ['reminderPlan', 'prCongrats', 'deload', 'returnNudge', 'anniversary']) {
    assert.strictEqual(N.mayNotify(s, k, 'still', T0), false, k + ' darf bei still nicht durch');
  }
});

test('normal laesst eine Meldung am Tag durch', () => {
  let s = N.notifyNew();
  assert.strictEqual(N.mayNotify(s, 'prCongrats', 'normal', T0), true);
  s = N.record(s, 'prCongrats', T0);
  assert.strictEqual(N.mayNotify(s, 'deload', 'normal', T0 + 3600e3), false);
});

test('eng laesst zwei am Tag durch, die dritte nicht', () => {
  let s = N.notifyNew();
  s = N.record(s, 'prCongrats', T0);
  assert.strictEqual(N.mayNotify(s, 'deload', 'eng', T0 + 3600e3), true);
  s = N.record(s, 'deload', T0 + 3600e3);
  assert.strictEqual(N.mayNotify(s, 'returnNudge', 'eng', T0 + 7200e3), false);
});

test('der Tageszaehler laeuft am naechsten Tag zurueck', () => {
  let s = N.record(N.notifyNew(), 'prCongrats', T0);
  assert.strictEqual(N.mayNotify(s, 'deload', 'normal', T0 + DAY), true);
});

test('die Wochengrenze haelt auch bei taeglich einer Meldung', () => {
  let s = N.notifyNew();
  const arten = ['prCongrats', 'deload', 'returnNudge', 'anniversary', 'reminderPlan'];
  for (let d = 0; d < 4; d++) { s = N.record(s, arten[d], T0 + d * DAY); }
  // vier in dieser Woche → die fuenfte ist zu viel
  assert.strictEqual(N.mayNotify(s, arten[4], 'normal', T0 + 4 * DAY), false);
});

test('der Wochenzaehler laeuft beim Wochenwechsel zurueck', () => {
  let s = N.notifyNew();
  for (let d = 0; d < 4; d++) s = N.record(s, 'prCongrats', T0 + d * DAY);
  assert.strictEqual(N.mayNotify(s, 'deload', 'normal', T0 + 8 * DAY), true);
});

test('der Wochenbericht zaehlt nicht gegen den Deckel', () => {
  let s = N.notifyNew();
  s = N.record(s, 'prCongrats', T0);
  assert.strictEqual(N.mayNotify(s, 'report', 'normal', T0 + 3600e3), true);
});

test('Jahrestag kommt hoechstens einmal im Jahr', () => {
  let s = N.record(N.notifyNew(), 'anniversary', T0);
  assert.strictEqual(N.mayNotify(s, 'anniversary', 'eng', T0 + 200 * DAY), false);
  assert.strictEqual(N.mayNotify(s, 'anniversary', 'eng', T0 + 370 * DAY), true);
});

test('Rueckkehr-Nudge haelt fuenf Tage Abstand', () => {
  let s = N.record(N.notifyNew(), 'returnNudge', T0);
  assert.strictEqual(N.mayNotify(s, 'returnNudge', 'eng', T0 + 2 * DAY), false);
  assert.strictEqual(N.mayNotify(s, 'returnNudge', 'eng', T0 + 6 * DAY), true);
});

test('planAll gibt bei still nur den Bericht zurueck', () => {
  const plan = N.planAll({
    now: T0, level: 'still', state: N.notifyNew(),
    nextWorkout: { at: T0 + DAY, ex: 'Bankdrücken', kg: 62.5, reps: 8, sets: 3 },
    lastWorkoutTs: T0 - 2 * DAY, reportAt: T0 + 4 * DAY,
  });
  assert.strictEqual(plan.length, 1);
  assert.strictEqual(plan[0].kind, 'report');
});

test('planAll haelt den Deckel schon bei der Planung ein', () => {
  const plan = N.planAll({
    now: T0, level: 'normal', state: N.notifyNew(),
    nextWorkout: { at: T0 + DAY, ex: 'Bankdrücken', kg: 62.5, reps: 8, sets: 3 },
    lastWorkoutTs: T0 - 9 * DAY, reportAt: T0 + 4 * DAY,
    anniversary: { ex: 'Bankdrücken', thenKg: 40, nowKg: 72.5 },
    deload: true,
  });
  const proTag = {};
  for (const p of plan) {
    if (p.kind === 'report') continue;
    const d = N.dayKey(p.at);
    proTag[d] = (proTag[d] || 0) + 1;
    assert.ok(proTag[d] <= 1, 'zwei Meldungen am ' + d + ' bei Stufe normal');
  }
});

test('planAll liefert nach Zeit sortiert', () => {
  const plan = N.planAll({
    now: T0, level: 'eng', state: N.notifyNew(),
    nextWorkout: { at: T0 + 2 * DAY, ex: 'X', kg: 60, reps: 8, sets: 3 },
    lastWorkoutTs: T0 - DAY, reportAt: T0 + DAY,
  });
  for (let i = 1; i < plan.length; i++) assert.ok(plan[i].at >= plan[i - 1].at, 'nicht sortiert');
});

test('planAll plant nichts in der Vergangenheit', () => {
  const plan = N.planAll({
    now: T0, level: 'eng', state: N.notifyNew(),
    nextWorkout: { at: T0 - DAY, ex: 'X', kg: 60, reps: 8, sets: 3 },
    lastWorkoutTs: T0 - DAY, reportAt: T0 - 2 * DAY,
  });
  for (const p of plan) assert.ok(p.at > T0, 'Termin in der Vergangenheit: ' + new Date(p.at).toISOString());
});

test('jede geplante Meldung traegt eine stabile id', () => {
  const c = { now: T0, level: 'eng', state: N.notifyNew(),
              nextWorkout: { at: T0 + DAY, ex: 'X', kg: 60, reps: 8, sets: 3 },
              lastWorkoutTs: T0 - 9 * DAY, reportAt: T0 + 4 * DAY };
  const a = N.planAll(c), b = N.planAll(c);
  assert.deepStrictEqual(a.map(x => x.id), b.map(x => x.id));
  assert.strictEqual(new Set(a.map(x => x.id)).size, a.length, 'ids muessen eindeutig sein');
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-notify.test.js
```

- [ ] **Step 3: Modul schreiben**

```js
/* GymTrack — Frequenz-Deckel und Planung der lokalen Notifications (Block 4)
   Der Deckel ist der Grund, warum diese Funktion nicht nach zwei Wochen
   abgeschaltet wird. Er greift VOR der Planung: was nicht durchpasst, wird gar
   nicht erst eingeplant — nicht erst beim Ausliefern verworfen. */
(function (root) {
  'use strict';

  var DAY = 864e5;

  var CAPS = {
    still:  { day: 0, week: 0 },
    normal: { day: 1, week: 4 },
    eng:    { day: 2, week: 8 },
  };

  // Der Wochenbericht ist das eine Versprechen, das auch bei 'still' gilt —
  // deshalb steht er ausserhalb des Deckels.
  var UNCAPPED = ['report'];

  // Mindestabstand je Art. Ohne das koennte derselbe Anlass taeglich neu
  // zuschlagen, solange der Tagesdeckel es zulaesst.
  var COOLDOWN = {
    prCongrats:   0,            // ein PR ist ein Ereignis, kein Zustand
    deload:       7 * DAY,
    returnNudge:  5 * DAY,
    anniversary:  365 * DAY,
    reminderPlan: 0,
    report:       6 * DAY,
  };

  function dayKey(ts) { return new Date(ts).toISOString().slice(0, 10); }

  // ISO-8601: Woche 1 ist die mit dem ersten Donnerstag. Selbst gerechnet statt
  // ueber eine Bibliothek — die App hat keinen Bundler.
  function weekKey(ts) {
    var d = new Date(ts);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var jahr = d.getUTCFullYear();
    var jan1 = new Date(Date.UTC(jahr, 0, 1));
    var wo = Math.ceil((((d - jan1) / DAY) + 1) / 7);
    return jahr + '-W' + (wo < 10 ? '0' + wo : String(wo));
  }

  function notifyNew() { return { sentTs: {}, dayCount: 0, dayKey: '', weekCount: 0, weekKey: '' }; }

  function _rolled(state, now) {
    var dk = dayKey(now), wk = weekKey(now);
    return {
      sentTs: state && state.sentTs ? state.sentTs : {},
      dayKey: dk,
      weekKey: wk,
      dayCount:  (state && state.dayKey  === dk) ? (state.dayCount  || 0) : 0,
      weekCount: (state && state.weekKey === wk) ? (state.weekCount || 0) : 0,
    };
  }

  function mayNotify(state, kind, level, now) {
    var s = _rolled(state, now);
    var cd = COOLDOWN[kind];
    if (cd) {
      var last = s.sentTs[kind] || 0;
      if (last && (now - last) < cd) return false;
    }
    if (UNCAPPED.indexOf(kind) >= 0) return true;
    var cap = CAPS[level] || CAPS.normal;
    if (cap.day === 0) return false;
    if (s.dayCount  >= cap.day)  return false;
    if (s.weekCount >= cap.week) return false;
    return true;
  }

  function record(state, kind, now) {
    var s = _rolled(state, now);
    var sentTs = Object.assign({}, s.sentTs);
    sentTs[kind] = now;
    var zaehlt = UNCAPPED.indexOf(kind) < 0;
    return { sentTs: sentTs, dayKey: s.dayKey, weekKey: s.weekKey,
             dayCount: s.dayCount + (zaehlt ? 1 : 0),
             weekCount: s.weekCount + (zaehlt ? 1 : 0) };
  }

  // Baut die Kandidatenliste und laesst sie durch mayNotify laufen — mit einem
  // FORTGESCHRIEBENEN Zustand, damit die Planung sich selbst mitzaehlt. Ohne das
  // wuerden fuenf Kandidaten am selben Tag alle durchkommen, weil jeder gegen
  // denselben leeren Zaehler prueft.
  function planAll(ctx) {
    var c = ctx || {};
    var now = c.now || Date.now();
    var level = c.level || 'normal';
    var st = _rolled(c.state, now);
    var kandidaten = [];

    if (c.reportAt) {
      kandidaten.push({ kind: 'report', at: c.reportAt, key: 'reportReady',
                        vars: { vol: c.weekVol } });
    }
    if (c.nextWorkout && c.nextWorkout.at) {
      kandidaten.push({ kind: 'reminderPlan', at: c.nextWorkout.at, key: 'reminderPlan',
                        vars: { ex: c.nextWorkout.ex, kg: c.nextWorkout.kg,
                                reps: c.nextWorkout.reps, sets: c.nextWorkout.sets } });
    }
    if (c.lastWorkoutTs) {
      // Bei jedem App-Start neu gesetzt: wer die App oeffnet, verschiebt ihn.
      var nudgeAt = c.lastWorkoutTs + 5 * DAY;
      if (nudgeAt <= now) nudgeAt = now + 5 * DAY;
      kandidaten.push({ kind: 'returnNudge', at: nudgeAt, key: 'returnNudge', vars: { days: 5 } });
    }
    if (c.deload) {
      kandidaten.push({ kind: 'deload', at: now + 2 * 3600e3, key: 'deload', vars: {} });
    }
    if (c.anniversary) {
      kandidaten.push({ kind: 'anniversary', at: now + 4 * 3600e3, key: 'anniversary',
                        vars: { ex: c.anniversary.ex, kg: c.anniversary.nowKg } });
    }
    if (c.prJustNow) {
      kandidaten.push({ kind: 'prCongrats', at: now + 60000, key: 'prCongrats',
                        vars: { ex: c.prJustNow.ex, kg: c.prJustNow.kg } });
    }

    kandidaten.sort(function (a, b) { return a.at - b.at; });

    var out = [], zustand = st;
    for (var i = 0; i < kandidaten.length; i++) {
      var k = kandidaten[i];
      if (k.at <= now) continue;                          // nichts in der Vergangenheit planen
      if (!mayNotify(zustand, k.kind, level, k.at)) continue;
      zustand = record(zustand, k.kind, k.at);
      out.push({ id: k.kind + ':' + dayKey(k.at), at: k.at, kind: k.kind, key: k.key, vars: k.vars });
    }
    return out;
  }

  var API = { notifyNew: notifyNew, weekKey: weekKey, dayKey: dayKey,
              mayNotify: mayNotify, record: record, planAll: planAll,
              CAPS: CAPS, COOLDOWN: COOLDOWN, UNCAPPED: UNCAPPED };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachNotify = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Tests laufen lassen, grün bestätigen**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-notify.test.js
```

Erwartung: PASS, 16 Tests.

- [ ] **Step 5: Commit**

```bash
git add js/coach-notify.js test/coach-notify.test.js && git commit -m "feat(coach): Frequenz-Deckel fuer proaktive Meldungen" && git push origin main
```

---

### Task 19: Meldungen planen und ausliefern

**Files:**
- Modify: `index.html` — Skript-Tag, `S.coachPush`, Planung beim App-Start und nach jedem Training, Berechtigungsabfrage im Hub

**Interfaces:**
- Consumes: `CoachNotify` aus Task 18; `_say()` aus Task 7; `@capacitor/local-notifications` (installiert, benutzt ab `index.html:9198`)
- Produces:
  - `_cnSync()` — plant alles neu; verwirft zuerst die eigenen alten Termine
  - `_cnPermission()` — fragt die Berechtigung, **nur** vom Hub aus aufgerufen

- [ ] **Step 1: Skript-Tag und Zustand**

```html
<script src="./js/coach-notify.js"></script>
```

```js
// ── PROAKTIVE MELDUNGEN ──────────────────────────────────
// Rein auf dem Geraet geplant: kein Server, kein Service-Account, keine
// Gesundheitsdaten in der Cloud. Grenze davon: eine geplante Notification kennt
// nur den Stand vom letzten App-Oeffnen. Fuer Erinnerung und Rueckkehr-Nudge
// reicht das genau.
const CN_ID_BASE = 47000;   // eigener Nummernraum, damit _cnSync fremde Termine (Pausen-Timer!) nie loescht

function _cnIdFor(id){
  // Stabile Zahl aus der Text-id — LocalNotifications verlangt Integer.
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CN_ID_BASE + (h % 1000);
}
```

**Der eigene Nummernraum ist nicht optional.** `@capacitor/local-notifications` wird bereits für die Trainings-Erinnerung und den Pausen-Timer benutzt; ein pauschales `cancel()` würde den laufenden Pausen-Timer mit abräumen.

- [ ] **Step 2: `_cnSync()` schreiben**

```js
async function _cnSync(){
  try {
    if (!isPremium()) return;
    const p = _persona();
    const LN = _cap('LocalNotifications');
    if (!LN) return;
    const perm = await LN.checkPermissions();
    if (perm.display !== 'granted') return;    // ohne Berechtigung still bleiben, keine Fehlermeldung

    // 1) Nur die EIGENEN alten Termine verwerfen.
    const pend = await LN.getPending();
    const meine = (pend.notifications || []).filter(n => n.id >= CN_ID_BASE && n.id < CN_ID_BASE + 1000);
    if (meine.length) await LN.cancel({ notifications: meine.map(n => ({ id: n.id })) });

    // 2) Neu planen.
    const plan = CoachNotify.planAll({
      now: Date.now(), level: p.pushLevel, state: S.coachPush || CoachNotify.notifyNew(),
      nextWorkout: _cnNextWorkout(),          // {at, ex, kg, reps, sets} oder null
      lastWorkoutTs: _cnLastWorkoutTs(),
      reportAt: _cnReportAt(),                // naechster Sonntag, Uhrzeit aus S
      weekVol: _cnWeekVol(),
      deload: _cnDeloadDue(),
      anniversary: _cnAnniversary(),          // {ex, thenKg, nowKg} oder null
    });
    if (!plan.length) return;

    await LN.schedule({ notifications: plan.map(n => ({
      id: _cnIdFor(n.id),
      // Der Name des Coaches im Titel — genau hier zahlt sich Block 1 aus.
      title: _coachName(),
      body: _say(n.key, n.vars),
      schedule: { at: new Date(n.at) },
      extra: { coachKind: n.kind },
    })) });

    // 3) Zaehler fortschreiben, damit der Deckel ueber App-Starts hinweg haelt.
    let st = S.coachPush || CoachNotify.notifyNew();
    for (const n of plan) st = CoachNotify.record(st, n.kind, n.at);
    S.coachPush = st; save();
  } catch(e) { console.warn('[Coach] Meldungen planen:', e); }
}
```

**Sieben Hilfsfunktionen gegen den echten Code bauen**, nicht erfinden: `_cnNextWorkout()`, `_cnLastWorkoutTs()`, `_cnReportAt()`, `_cnWeekVol()`, `_cnDeloadDue()`, `_cnAnniversary()`. Für `_cnDeloadDue()` die vorhandene Readiness-Logik `_ciReadiness()` (`index.html:11305`) benutzen — **keine zweite Erholungsrechnung** danebenstellen.

`_cnAnniversary()` sucht in `S.sessions` nach einer Einheit vor 365 ± 3 Tagen und vergleicht das damalige Topgewicht mit dem heutigen. **Nur melden, wenn der Fortschritt vorzeigbar ist** — bei gleichem oder niedrigerem Gewicht `null` zurückgeben. Ein Jahresrückblick, der Stillstand feiert, ist schlimmer als keiner.

- [ ] **Step 3: Aufrufe einhängen**

| Wann | Warum |
| --- | --- |
| App-Start, nach dem Laden von `S` | setzt den Rückkehr-Nudge neu — wer die App öffnet, verschiebt ihn |
| Ende von `finishWk()` (`index.html:16820`) | neue Erinnerung, PR-Gratulation, Deload-Prüfung |
| nach `setAiCoachOpt('pushLevel', …)` | die neue Stufe gilt sofort, nicht erst morgen |

- [ ] **Step 4: Berechtigung im Hub erfragen, nicht beim Start**

Im Hub-Bereich „Einstellungen", beim Wechsel der Push-Stufe **weg von** `'still'`:

```js
async function _cnPermission(){
  const LN = _cap('LocalNotifications');
  if (!LN) return false;
  try {
    let perm = await LN.checkPermissions();
    if (perm.display === 'prompt' || perm.display === 'prompt-with-rationale') perm = await LN.requestPermissions();
    if (perm.display !== 'granted') {
      _dndToast(tr('Ohne Mitteilungen meldet sich dein Coach nur in der App.'));
      return false;
    }
    return true;
  } catch(_) { return false; }
}
```

Und im Handler:

```js
  document.getElementById('ch-push').onchange = async e => {
    const v = e.target.value;
    if (v !== 'still') { const ok = await _cnPermission(); if (!ok) { e.target.value = _persona().pushLevel; return; } }
    setAiCoachOpt('pushLevel', v);
    _cnSync();
    renderCoachHub();
  };
```

Die Berechtigung wird **an der Stelle** erfragt, an der der Nutzer versteht, wofür — nicht beim ersten App-Start.

- [ ] **Step 5: Erinnerungstext ersetzen**

Die bestehende generische Trainings-Erinnerung („Zeit fürs Gym") wird durch die inhaltliche ersetzt:

```bash
grep -n "Zeit fürs\|Trainings-Erinnerung\|reminderId\|LocalNotifications" index.html | head -20
```

Die alte Planung entfernen, damit nicht zwei Erinnerungen für denselben Termin auflaufen. Die neue trägt den Inhalt: „Heute Push — Bank 3 × 8 @ 62,5".

- [ ] **Step 6: Im Simulator prüfen**

```bash
~/.claude/sim-native.sh gymtrack "iPhone 17"
```

Prüfliste:
1. Push-Stufe im Hub von „Still" auf „Normal" → Berechtigungsdialog erscheint.
2. Ablehnen → Auswahl springt zurück auf „Still", Hinweistext erscheint, **kein** Fehler.
3. Annehmen, dann in der Konsole prüfen:
   ```js
   Capacitor.Plugins.LocalNotifications.getPending().then(r => console.table(r.notifications));
   ```
   Erwartung: Termine mit `id ≥ 47000`, im Titel der Coach-Name, im Text ein konkreter Inhalt statt „Zeit fürs Gym".
4. Pausen-Timer im Training starten, dann `_cnSync()` in der Konsole aufrufen → **der Pausen-Timer läuft weiter.** Das ist die Prüfung des Nummernraums.
5. Stufe „Still" wählen → in `getPending()` steht nur noch der Wochenbericht.
6. Einen Termin auf `Date.now() + 15000` vorziehen, App in den Hintergrund schicken, 15 Sekunden warten → die Mitteilung erscheint auf dem Sperrbildschirm mit dem Coach-Namen als Titel.

```bash
xcrun simctl io "iPhone 17" screenshot /tmp/gymtrack-notify.png
```

- [ ] **Step 7: Commit**

```bash
git add index.html && git commit -m "feat(coach): proaktive Meldungen auf dem Geraet geplant, gedeckelt" && git push origin main
```

---

## Blockabschluss 4

Ritual von oben durchlaufen. Changelog-Key: `cl-2026-07-28-coach-meldet-sich`.

```js
  'cl-2026-07-28-coach-meldet-sich': {
    label: '28.07.2026 · Dein Coach meldet sich, auch wenn die App zu ist',
    items: [
      'Die Trainings-Erinnerung sagt jetzt, was ansteht: „Heute Push — Bank 3 × 8 @ 62,5" statt „Zeit fürs Gym"',
      'Nach einem neuen Bestwert gratuliert er dir noch am selben Tag',
      'Bleibst du fünf Tage weg, meldet er sich einmal. Öffnest du die App, verschiebt sich das von selbst',
      'Einmal im Jahr zeigt er dir, wo du vor zwölf Monaten standest',
      'Du bestimmst, wie oft: gar nicht, höchstens einmal am Tag oder bis zu zweimal',
    ]
  },
```

**Zusätzliche Prüfung:** Der Nummernraum darf sich mit nichts überschneiden.

```bash
grep -n "LocalNotifications.schedule\|id: *[0-9]" index.html | head -20
```

Jede andere Notification-id muss außerhalb von 47000–47999 liegen.

---

# Block 5 — Wochenbericht

**Warum zuletzt:** Er braucht den Persona-Ton aus Block 1 und den Notification-Kanal aus Block 4.

**Kosten: ein LLM-Aufruf pro Woche und Nutzer** — rund 0,0017 $, also 4–5 Aufrufe im Monat für unter einem Cent. Die Zahlen selbst sind algorithmisch; das Modell liefert nur drei Sätze Einordnung.

**Der Kniff:** Der Bericht wird **vorgezogen** erzeugt — beim letzten App-Öffnen vor dem Sonntagabend-Termin. Die Notification wird dann mit dem **fertigen Text** geplant, sodass auf dem Sperrbildschirm die echte Zusammenfassung steht und nicht „Dein Bericht ist fertig, tippe hier".

---

### Task 20: `coach-report.js` — Zahlen und Ziel-Prognose

**Files:**
- Create: `js/coach-report.js`
- Create: `test/coach-report.test.js`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `CoachReport.weekNumbers(sessions, weekStartTs)` → `{vol, sets, workouts, prs, muscles, prevVol, volDelta, streak}`
  - `CoachReport.goalForecast(history, goalKg, now)` → `{weeks, goalKg, currentKg}|null`
  - `CoachReport.epley1rm(kg, reps)` → `number`
  - `CoachReport.weekStart(ts)` → `number` — Montag 00:00 lokal

- [ ] **Step 1: Fehlschlagende Tests schreiben**

`test/coach-report.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/coach-report.js');

const DAY = 864e5, WEEK = 7 * DAY;
const MO = R.weekStart(Date.UTC(2026, 6, 29));   // Montag der laufenden Woche

function sess(ts, sets) {
  return { ts: ts, sets: sets };  // sets = [{ex, muscle, kg, reps}]
}
const S3 = [
  sess(MO + DAY,     [{ ex: 'Bank', muscle: 'brust', kg: 60, reps: 8 }, { ex: 'Bank', muscle: 'brust', kg: 60, reps: 8 }]),
  sess(MO + 3 * DAY, [{ ex: 'Kniebeuge', muscle: 'beine', kg: 100, reps: 5 }]),
  sess(MO - 2 * DAY, [{ ex: 'Bank', muscle: 'brust', kg: 55, reps: 8 }]),   // Vorwoche
];

test('epley rechnet das geschaetzte Maximum', () => {
  assert.strictEqual(Math.round(R.epley1rm(100, 1)), 103);
  assert.ok(R.epley1rm(100, 5) > 110);
  assert.strictEqual(R.epley1rm(0, 5), 0);
});

test('weekStart liefert Montag null Uhr', () => {
  const m = R.weekStart(Date.UTC(2026, 6, 29, 15, 30));
  assert.strictEqual(new Date(m).getDay(), 1);
  assert.ok(m <= Date.UTC(2026, 6, 29, 15, 30));
});

test('weekNumbers zaehlt nur die laufende Woche', () => {
  const n = R.weekNumbers(S3, MO);
  assert.strictEqual(n.workouts, 2);
  assert.strictEqual(n.sets, 3);
  assert.strictEqual(n.vol, 60 * 8 * 2 + 100 * 5);
});

test('weekNumbers vergleicht mit der Vorwoche', () => {
  const n = R.weekNumbers(S3, MO);
  assert.strictEqual(n.prevVol, 55 * 8);
  assert.strictEqual(n.volDelta, n.vol - n.prevVol);
});

test('weekNumbers verteilt das Volumen auf Muskelgruppen', () => {
  const n = R.weekNumbers(S3, MO);
  assert.strictEqual(n.muscles.brust, 960);
  assert.strictEqual(n.muscles.beine, 500);
});

test('leere Wochen ergeben Nullen statt undefined', () => {
  const n = R.weekNumbers([], MO);
  assert.strictEqual(n.vol, 0);
  assert.strictEqual(n.sets, 0);
  assert.strictEqual(n.workouts, 0);
  assert.strictEqual(n.prevVol, 0);
  assert.deepStrictEqual(n.muscles, {});
});

// ── Ziel-Prognose ────────────────────────────────────────
function trend(n, startKg, stepProWoche) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ ts: MO - (n - 1 - i) * WEEK, kg: startKg + i * stepProWoche, reps: 5 });
  return out;
}

test('stabiler Aufwaertstrend ergibt eine Prognose', () => {
  const f = R.goalForecast(trend(6, 80, 2.5), 130, MO);
  assert.ok(f, 'Prognose fehlt');
  assert.ok(f.weeks > 0 && f.weeks < 100);
  assert.strictEqual(f.goalKg, 130);
});

test('unter vier Wochen gibt es keine Prognose', () => {
  assert.strictEqual(R.goalForecast(trend(3, 80, 2.5), 130, MO), null);
  assert.strictEqual(R.goalForecast([], 130, MO), null);
  assert.strictEqual(R.goalForecast(null, 130, MO), null);
});

test('kein Trend ergibt keine Prognose', () => {
  assert.strictEqual(R.goalForecast(trend(8, 80, 0), 130, MO), null);
});

test('fallender Trend ergibt keine Prognose', () => {
  assert.strictEqual(R.goalForecast(trend(8, 100, -2), 150, MO), null);
});

test('bereits erreichtes Ziel ergibt keine Prognose', () => {
  assert.strictEqual(R.goalForecast(trend(6, 100, 2.5), 90, MO), null);
});

test('unruhiger Verlauf ergibt keine Prognose', () => {
  const h = [
    { ts: MO - 5 * WEEK, kg: 80, reps: 5 }, { ts: MO - 4 * WEEK, kg: 95, reps: 5 },
    { ts: MO - 3 * WEEK, kg: 78, reps: 5 }, { ts: MO - 2 * WEEK, kg: 99, reps: 5 },
    { ts: MO - 1 * WEEK, kg: 82, reps: 5 }, { ts: MO, kg: 97, reps: 5 },
  ];
  assert.strictEqual(R.goalForecast(h, 150, MO), null, 'bei diesem Zickzack darf nichts versprochen werden');
});

test('unrealistisch weite Ziele werden nicht prognostiziert', () => {
  assert.strictEqual(R.goalForecast(trend(6, 80, 0.5), 300, MO), null);
});
```

**Hinweis zum ersten Test:** Epley liefert bei einer Wiederholung `kg × (1 + 1/30)` = 103,3 — nicht 100. Das ist die Formel, nicht ein Fehler; der Test hält den Wert fest, damit niemand sie später „korrigiert".

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-report.test.js
```

- [ ] **Step 3: Modul schreiben**

```js
/* GymTrack — Wochenzahlen und Ziel-Prognose (Block 5)
   Die Zahlen sind algorithmisch, das Modell liefert im Bericht nur drei Saetze
   Einordnung. Die Prognose ist der heikle Teil: sie darf nie als Zusage
   klingen und erscheint lieber gar nicht als auf duenner Grundlage. */
(function (root) {
  'use strict';

  var WEEK = 7 * 864e5;
  var MIN_WEEKS = 4;
  var MAX_FORECAST_WEEKS = 52;   // weiter als ein Jahr voraus ist Kaffeesatz
  var MIN_R2 = 0.7;              // Guete der Gerade; darunter ist der Verlauf zu unruhig

  function epley1rm(kg, reps) {
    var w = (typeof kg === 'number' && kg > 0) ? kg : 0;
    var r = (typeof reps === 'number' && reps > 0) ? reps : 1;
    if (!w) return 0;
    return w * (1 + r / 30);
  }

  function weekStart(ts) {
    var d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    var tag = d.getDay() || 7;      // Sonntag = 7, damit die Woche montags beginnt
    d.setDate(d.getDate() - (tag - 1));
    return d.getTime();
  }

  function _sum(sessions, von, bis) {
    var vol = 0, sets = 0, workouts = 0, muscles = {}, prs = [];
    for (var i = 0; i < sessions.length; i++) {
      var s = sessions[i];
      if (!s || typeof s.ts !== 'number' || s.ts < von || s.ts >= bis) continue;
      workouts++;
      var list = Array.isArray(s.sets) ? s.sets : [];
      for (var j = 0; j < list.length; j++) {
        var x = list[j] || {};
        var kg = typeof x.kg === 'number' ? x.kg : 0;
        var reps = typeof x.reps === 'number' ? x.reps : 0;
        vol += kg * reps;
        sets++;
        if (x.muscle) muscles[x.muscle] = (muscles[x.muscle] || 0) + kg * reps;
        if (x.pr) prs.push({ ex: x.ex, kg: kg });
      }
    }
    return { vol: Math.round(vol), sets: sets, workouts: workouts, muscles: muscles, prs: prs };
  }

  function weekNumbers(sessions, weekStartTs) {
    var list = Array.isArray(sessions) ? sessions : [];
    var von = weekStartTs, bis = von + WEEK;
    var jetzt = _sum(list, von, bis);
    var vor = _sum(list, von - WEEK, von);
    return {
      vol: jetzt.vol, sets: jetzt.sets, workouts: jetzt.workouts,
      muscles: jetzt.muscles, prs: jetzt.prs,
      prevVol: vor.vol, volDelta: jetzt.vol - vor.vol,
      streak: 0,   // wird von index.html aus dem vorhandenen Streak-Wert gesetzt
    };
  }

  // Lineare Regression ueber die geschaetzten Maxima. Bewusst streng: lieber
  // gar keine Prognose als eine, die der Nutzer als Zusage liest und die nicht
  // eintritt.
  function goalForecast(history, goalKg, now) {
    var h = Array.isArray(history) ? history.filter(function (x) {
      return x && typeof x.ts === 'number' && typeof x.kg === 'number' && x.kg > 0;
    }) : [];
    if (h.length < MIN_WEEKS) return null;
    if (typeof goalKg !== 'number' || !(goalKg > 0)) return null;

    var pts = h.map(function (x) {
      return { x: (x.ts - h[0].ts) / WEEK, y: epley1rm(x.kg, x.reps) };
    });
    var n = pts.length, sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (var i = 0; i < n; i++) { sx += pts[i].x; sy += pts[i].y; sxy += pts[i].x * pts[i].y; sxx += pts[i].x * pts[i].x; }
    var nenner = n * sxx - sx * sx;
    if (!nenner) return null;
    var m = (n * sxy - sx * sy) / nenner;          // Zuwachs je Woche
    var b = (sy - m * sx) / n;
    if (!(m > 0)) return null;                      // kein Fortschritt → keine Prognose

    // Guete pruefen: ein Zickzack mit zufaellig positiver Steigung ist kein Trend.
    var mittel = sy / n, ssTot = 0, ssRes = 0;
    for (var j = 0; j < n; j++) {
      var vorher = m * pts[j].x + b;
      ssTot += Math.pow(pts[j].y - mittel, 2);
      ssRes += Math.pow(pts[j].y - vorher, 2);
    }
    var r2 = ssTot ? 1 - ssRes / ssTot : 0;
    if (r2 < MIN_R2) return null;

    var aktuell = m * pts[n - 1].x + b;
    if (aktuell >= goalKg) return null;             // Ziel schon erreicht
    var wochen = Math.ceil((goalKg - aktuell) / m);
    if (!(wochen > 0) || wochen > MAX_FORECAST_WEEKS) return null;
    return { weeks: wochen, goalKg: goalKg, currentKg: Math.round(aktuell * 10) / 10 };
  }

  var API = { weekNumbers: weekNumbers, goalForecast: goalForecast,
              epley1rm: epley1rm, weekStart: weekStart,
              MIN_WEEKS: MIN_WEEKS, MIN_R2: MIN_R2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachReport = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Tests laufen lassen, grün bestätigen**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-report.test.js
```

Erwartung: PASS, 14 Tests. Besonders „unruhiger Verlauf ergibt keine Prognose" muss halten — das ist der Test, der verhindert, dass der Coach etwas verspricht.

- [ ] **Step 5: Commit**

```bash
git add js/coach-report.js test/coach-report.test.js && git commit -m "feat(coach): Wochenzahlen und Ziel-Prognose mit Guetepruefung" && git push origin main
```

---

### Task 21: Bericht erzeugen, planen, anzeigen

**Files:**
- Modify: `index.html` — Skript-Tag, vorgezogene Erzeugung, Notification mit fertigem Text, Hub-Bereich „Woche", Archiv der letzten 8

**Interfaces:**
- Consumes: `CoachReport` aus Task 20, `CoachNotify` aus Task 18, `_say()` aus Task 7, `AI_WORKER_URL` (`index.html:22697`)
- Produces:
  - `_crBuild()` → `Promise<report|null>` — erzeugt den Bericht der laufenden Woche
  - `_crMaybePrepare()` — prüft beim App-Start, ob der Bericht vorgezogen erzeugt werden muss
  - `S.coachReports` → `[{weekKey, label, numbers, text, forecast, ts}]`, höchstens 8

- [ ] **Step 1: Skript-Tag und Datenhaltung**

```html
<script src="./js/coach-report.js"></script>
```

```js
// ── WOCHENBERICHT ────────────────────────────────────────
// Zahlen algorithmisch, drei Saetze Einordnung vom Modell — EIN Aufruf je Woche
// und Nutzer, rund 0,0017 $. Die letzten acht Berichte liegen lokal.
S.coachReports = Array.isArray(S.coachReports) ? S.coachReports.slice(0, 8) : [];
S.coachReportAt = S.coachReportAt || { day: 0, hour: 18 };   // 0 = Sonntag
```

- [ ] **Step 2: Bericht erzeugen**

```js
async function _crBuild(){
  try {
    if (!isPremium()) return null;
    const ws = CoachReport.weekStart(Date.now());
    const wk = CoachNotify.weekKey(ws);
    const vorhanden = S.coachReports.find(r => r.weekKey === wk);
    if (vorhanden) return vorhanden;

    const n = CoachReport.weekNumbers(_crSessions(), ws);
    n.streak = _crStreak();
    if (!n.workouts) return null;      // eine Woche ohne Training braucht keinen Bericht

    // Prognose nur, wenn ein Ziel gesetzt ist UND der Trend traegt.
    let forecast = null;
    try {
      const ziel = _crGoal();          // {ex, kg} oder null
      if (ziel) forecast = CoachReport.goalForecast(_crHistory(ziel.ex), ziel.kg, Date.now());
      if (forecast) forecast.ex = ziel.ex;
    } catch(_){}

    // Drei Saetze Einordnung vom Modell. Faellt der Aufruf aus (kein Netz,
    // Budget-Deckel), bleibt der Bericht trotzdem stehen — nur ohne Einordnung.
    let text = '';
    try { text = await _crAskModel(n, forecast); } catch(_){}

    const rep = {
      weekKey: wk, ts: Date.now(),
      label: _crLabel(ws),
      numbers: n, forecast: forecast, text: text || '',
    };
    S.coachReports = [rep].concat(S.coachReports.filter(r => r.weekKey !== wk)).slice(0, 8);
    save();
    return rep;
  } catch(e) { console.warn('[Coach] Bericht:', e); return null; }
}
```

`_crAskModel(n, forecast)` schickt **nur die Zahlen** an den bestehenden `/chat`-Endpunkt — keine Dossier-Inhalte, keine Rohdaten. Der Prompt enthält die Persona-Zeile aus `CoachPersona.personaLine()` und die Anweisung: genau drei Sätze, keine Emojis, keine Zusagen über die Zukunft.

`_crSessions()`, `_crStreak()`, `_crGoal()`, `_crHistory(ex)` und `_crLabel(ws)` gegen den echten Code bauen. `_crHistory(ex)` liefert je Kalenderwoche das beste `{ts, kg, reps}` dieser Übung — **nicht** jeden Satz, sonst rechnet die Regression auf Rauschen.

- [ ] **Step 3: Vorgezogene Erzeugung**

Das ist der Unterschied zwischen „Dein Bericht ist fertig" und der echten Zusammenfassung auf dem Sperrbildschirm:

```js
async function _crMaybePrepare(){
  try {
    if (!isPremium()) return;
    const at = _cnReportAt();                   // naechster Sonntag, Uhrzeit aus S.coachReportAt
    const restStd = (at - Date.now()) / 3600e3;
    // Innerhalb der letzten 36 Stunden vor dem Termin: jetzt erzeugen, damit die
    // Notification den fertigen Text tragen kann.
    if (restStd > 36 || restStd < 0) return;
    const rep = await _crBuild();
    if (!rep) return;
    const LN = _cap('LocalNotifications');
    if (!LN) return;
    const perm = await LN.checkPermissions();
    if (perm.display !== 'granted') return;
    const kurz = (rep.text || _say('reportReady', { vol: rep.numbers.vol })).split(/(?<=\.)\s/)[0];
    await LN.schedule({ notifications: [{
      id: _cnIdFor('report:' + rep.weekKey),
      title: _coachName(),
      body: kurz,                               // die ECHTE Zusammenfassung, nicht die Einladung
      schedule: { at: new Date(at) },
      extra: { coachKind: 'report', weekKey: rep.weekKey },
    }] });
  } catch(e) { console.warn('[Coach] Bericht vorziehen:', e); }
}
```

Wurde die App im Zeitfenster nie geöffnet, greift der Einladungstext aus `CoachNotify.planAll` (Task 18) und der Bericht entsteht beim Antippen — das ist der bewusst akzeptierte Rückfall.

- [ ] **Step 4: Antippen führt in den Hub**

Im bestehenden Notification-Handler:

```js
  // Tipp auf die Bericht-Mitteilung fuehrt direkt in die Langfassung.
  if (action && action.notification && action.notification.extra && action.notification.extra.coachKind === 'report') {
    try { await _crBuild(); } catch(_){}       // falls die App im Fenster nie offen war
    try { openCoachHub('report'); } catch(_){}
  }
```

- [ ] **Step 5: Hub-Bereich „Woche" ausbauen**

Der Platzhalter aus Task 9 Step 6 wird ersetzt:

```js
function _chRenderReport(body){
  const list = S.coachReports || [];
  if (!list.length) {
    body.innerHTML = `<div class="ch-sec"><p>${esc(tr('Dein erster Wochenbericht kommt am Sonntag.'))}</p></div>`;
    return;
  }
  const r = list[0];
  const n = r.numbers || {};
  const zeile = (l, v) => `<div class="ch-row"><span>${esc(l)}</span><b>${esc(String(v))}</b></div>`;
  const delta = n.volDelta > 0 ? '+' + n.volDelta : String(n.volDelta || 0);
  body.innerHTML =
    `<div class="ch-sec">
       <h3>${esc(r.label || '')}</h3>
       ${r.text ? `<p style="line-height:1.55;margin:0 0 12px">${esc(r.text)}</p>` : ''}
       ${zeile(tr('Einheiten'), n.workouts || 0)}
       ${zeile(tr('Sätze'), n.sets || 0)}
       ${zeile(tr('Volumen'), (n.vol || 0) + ' kg')}
       ${zeile(tr('gegenüber Vorwoche'), delta + ' kg')}
       ${n.streak ? zeile(tr('Streak'), n.streak + ' ' + tr('Tage')) : ''}
     </div>
     ${r.forecast ? `<div class="ch-sec"><h3>${esc(tr('Ausblick'))}</h3>
        <p style="line-height:1.55">${esc(_say('forecast', { ex: r.forecast.ex, kg: r.forecast.goalKg, weeks: r.forecast.weeks }))}</p></div>` : ''}
     ${Object.keys(n.muscles || {}).length ? `<div class="ch-sec"><h3>${esc(tr('Verteilung'))}</h3>
        ${Object.keys(n.muscles).sort((a,b) => n.muscles[b] - n.muscles[a])
          .map(k => zeile(k, n.muscles[k] + ' kg')).join('')}</div>` : ''}
     ${list.length > 1 ? `<div class="ch-sec"><h3>${esc(tr('Frühere Wochen'))}</h3>
        ${list.slice(1).map(o => `<div class="ch-jrn"><span>${esc(o.label)} · ${esc(String((o.numbers||{}).vol||0))} kg</span></div>`).join('')}</div>` : ''}`;
}
```

**Der Prognose-Satz** kommt aus `say('forecast', …)` und ist in allen vier Tönen so formuliert, dass er eine Bedingung enthält („wenn es so weiterläuft") und **nie** eine Zusage. Das ist beim Schreiben des Satzkatalogs in Task 6 Step 4 einzuhalten und hier zu prüfen.

- [ ] **Step 6: `_crMaybePrepare()` beim App-Start aufrufen**

Neben `_cnSync()` aus Task 19 Step 3 — nach dem Laden von `S`, in `try/catch`, ohne den Start zu blockieren:

```js
  setTimeout(() => { try { _crMaybePrepare(); } catch(_){} }, 2500);
```

Die 2,5 Sekunden Verzögerung halten den Netzaufruf aus dem Startpfad heraus.

- [ ] **Step 7: Im Simulator prüfen**

```bash
~/.claude/sim-native.sh gymtrack "iPhone 17"
```

Prüfliste:
1. In der Konsole `await _crBuild()` → ein Objekt mit `numbers`, und `text` mit **genau drei Sätzen** ohne Emojis.
2. Hub → „Woche": Zahlen, Einordnung, Verteilung erscheinen.
3. Bei gesetztem Ziel und stabilem Trend: der Ausblick erscheint und enthält eine Bedingung („wenn es so weiterläuft"), **keine** Zusage.
4. Ohne Ziel oder mit unruhigem Verlauf: der Ausblick fehlt vollständig — kein leerer Abschnitt.
5. Netz trennen, `await _crBuild()` → der Bericht entsteht trotzdem, nur ohne Einordnungstext. **Kein** Fehler.
6. `S.coachReportAt = {day: new Date().getDay(), hour: new Date().getHours()+1}` setzen, `_crMaybePrepare()` aufrufen, dann `getPending()` → der Termin trägt im `body` die echte Zusammenfassung, nicht „Dein Bericht ist fertig".
7. Neun Wochen künstlich anlegen → `S.coachReports.length === 8`.

```bash
xcrun simctl io "iPhone 17" screenshot /tmp/gymtrack-report.png
```

- [ ] **Step 8: Commit**

```bash
git add index.html && git commit -m "feat(coach): Wochenbericht vorgezogen erzeugt, Langfassung im Hub" && git push origin main
```

---

### Task 22: Datentrennung und Kontowechsel

Die Spec verlangt ausdrücklich: *„kein Schreibpfad nach `profiles/`; Kontowechsel setzt Persona und Session-Zustand zurück."* Dieses Vorhaben hat sechs neue Zustandsfelder eingeführt — diese Task prüft sie alle auf einmal, am Ende statt sechsmal unterwegs.

**Files:**
- Modify: `index.html` — Aufräumen beim Abmelden, falls eine Lücke gefunden wird

**Interfaces:**
- Consumes: alles aus Block 0 bis 5
- Produces: keine neue API

- [ ] **Step 1: Kein zweiter Firestore-Schreibpfad**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && grep -n "setDoc\|updateDoc\|addDoc\|deleteDoc" index.html | grep -i "profile\|coach\|persona\|report\|notify"
```

Erwartung: **kein** Treffer außerhalb von `_pushSocialProfile()` und dem bestehenden Dossier-Push aus dem Fundament. Jeder weitere Treffer ist ein neuer Schreibpfad und muss weg.

Und in den Modulen darf gar nichts stehen:

```bash
grep -n "firestore\|setDoc\|firebase" js/coach-*.js
```

Erwartung: leer.

- [ ] **Step 2: Was beim Abmelden wohin gehört**

| Feld | Wo | Beim Abmelden |
| --- | --- | --- |
| `S.aiCoach` (Persona) | Firestore, whitelisted | **zurücksetzen** — das nächste Konto darf nicht den Namen des vorigen sehen |
| `S.coachSession` | nur lokal | **löschen** |
| `S.coachPush` | nur lokal | **löschen** + geplante Notifications 47000–47999 verwerfen |
| `S.coachReports` | nur lokal | **löschen** — enthält die Zahlen des vorigen Kontos |
| `S.coachReportAt` | nur lokal | zurücksetzen auf `{day:0, hour:18}` |
| Dossier | uid-gekoppelt in `localStorage` | bleibt (bereits uid-gebunden, kein Handlungsbedarf) |

Die Abmelde-Funktion finden und ergänzen:

```bash
grep -n "signOut\|function logout\|_authLogout" index.html | head
```

```js
  // Coach-Zustand gehoert zum Konto, nicht zum Geraet. Ohne das begruesst der
  // Coach das naechste Konto mit dem Namen und den Zahlen des vorigen.
  try {
    S.aiCoach = { live:true, insights:true, name:'Coach', tone:'sachlich', voice:null,
                  voiceOn:true, preset:undefined, inTraining:'key', setFeedback:true, pushLevel:'normal' };
    S.coachSession = null;
    S.coachPush = null;
    S.coachReports = [];
    S.coachReportAt = { day:0, hour:18 };
    save();
    const LN = _cap('LocalNotifications');
    if (LN) {
      const pend = await LN.getPending();
      const meine = (pend.notifications || []).filter(n => n.id >= CN_ID_BASE && n.id < CN_ID_BASE + 1000);
      if (meine.length) await LN.cancel({ notifications: meine.map(n => ({ id: n.id })) });
    }
  } catch(e) { console.warn('[Coach] Abmelden:', e); }
```

`preset: undefined` ist Absicht: das nächste Konto durchläuft die Einrichtung neu und entscheidet selbst über den Umfang.

- [ ] **Step 3: Im Simulator prüfen**

```bash
~/.claude/sim-native.sh gymtrack "iPhone 17"
```

Prüfliste:
1. Mit Konto A anmelden, Coach „Nina" nennen, Ton „hart", Profil „Eng dabei", ein Training durchspielen, einen Bericht erzeugen.
2. Abmelden, mit Konto B anmelden.
3. Heute-Tab: die Karte zeigt „Coach", **nicht** „Nina".
4. Hub öffnen → die Einrichtung startet, weil `preset` wieder offen ist.
5. Hub → „Woche": leer, **nicht** die Zahlen von Konto A.
6. Konsole: `S.coachSession` und `S.coachPush` sind `null`.
7. `getPending()` → keine Termine im Bereich 47000–47999.
8. Wieder auf Konto A wechseln → Persona kommt per Cloud-Sync zurück („Nina", „hart"). Die lokalen Felder bleiben leer — das ist richtig so, sie sind bewusst nicht synchronisiert.

- [ ] **Step 4: Commit**

```bash
git add index.html && git commit -m "fix(coach): Coach-Zustand beim Kontowechsel vollstaendig zuruecksetzen" && git push origin main
```

---

## Blockabschluss 5

Ritual von oben durchlaufen. Changelog-Key: `cl-2026-07-28-coach-wochenbericht`.

```js
  'cl-2026-07-28-coach-wochenbericht': {
    label: '28.07.2026 · Jeden Sonntag: deine Woche',
    items: [
      'Sonntagabend fasst dein Coach die Woche zusammen — Volumen, Sätze, Einheiten, Bestwerte und der Vergleich zur Vorwoche',
      'Auf dem Sperrbildschirm steht die echte Zusammenfassung, nicht nur ein Hinweis',
      'Bei stabilem Fortschritt siehst du, wann du dein Ziel erreichst — mit ehrlicher Einschränkung, nie als Versprechen',
      'Die letzten acht Wochen bleiben im Coach-Menü nachlesbar',
      'Die Uhrzeit kannst du selbst festlegen',
    ]
  },
```

**Abschlussprüfung des gesamten Vorhabens** — nach Blockabschluss 5, vor der Übergabe:

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && npm test 2>&1 | tail -5
```

Dazu die Kostenkontrolle nach zwei Wochen Betrieb — **nicht vorher behaupten, sondern ablesen:**

```bash
curl -s "https://gymtrack-ai.wolterlenny362.workers.dev/admin-stats?idToken=<FOUNDER_ID_TOKEN>" | head -c 800
```

Abzulesen: `premiumHeads`, `budgetUsd`, die tatsächlichen Kosten des Monats. Liegen die Kosten je Nutzer über 0,30 $, greift zuerst der Router-Ausbau (mehr Fragen lokal), dann der Cache (längere TTL) — nicht das Modell wechseln.

---

## Was NICHT Teil dieses Plans ist

Jeweils eigene Spec, falls sie später kommen:

- Vorschläge zur Änderung des Trainingsplans — **vom Nutzer ausdrücklich gestrichen**
- HealthKit-gestützte Erholung (Schlaf, HRV)
- Formcheck per Videoaufnahme
- Ausbau des Maschinen-Scanners (Sitzhöhe, Griffposition)
- Coach-Zeile in Live Activity und Widget
- Wake-Word oder dauerhaftes Mithören
- Server-Cron mit Service-Account — nur, falls sich die Geräte-Variante im Betrieb als unzureichend erweist

---

## Übersicht: 22 Tasks in 6 Blöcken

| Block | Tasks | Neue Dateien | Neue Tests | Kosten |
| --- | --- | --- | --- | --- |
| 0 Kosten-Fundament | 1–5 | `coach-cache.js` | ~26 | senkt |
| 1 Persona + Hub + Einrichtung | 6–10 | `coach-persona.js` | ~13 | 0 |
| 2 Stimme | 11–12 | `coach-voice.js`, `TtsPlugin.swift` | ~8 | 0 |
| 3 Tiefe im Training | 13–17 | `coach-session.js`, `coach-warmup.js`, `coach-cues.js`, `coach-rpe.js`, `coach-analyze.js` | ~39 | **0** |
| 4 Proaktive Meldungen | 18–19 | `coach-notify.js` | ~16 | 0 |
| 5 Wochenbericht + Datentrennung | 20–22 | `coach-report.js` | ~14 | ~0,007 $/Monat |

Ausgangsstand: 78 Tests grün. Zielstand: rund 190.

**Die wichtigste Zahl im ganzen Plan** steht in Block 3: die Obergrenze von vier beziehungsweise acht Äußerungen je Trainingseinheit. Zwölf Trigger sind gebaut, höchstens acht kommen durch. Ein Coach, der alles sagt, was er weiß, wird abgeschaltet.
