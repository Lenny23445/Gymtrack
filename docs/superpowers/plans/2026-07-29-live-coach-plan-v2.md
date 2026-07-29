# Live-Coach Implementation Plan v2

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`. Schritte tragen Checkbox-Syntax (`- [ ]`).

**Goal:** Aus der Premium-Funktion „KI-Coach" wird eine dauerhafte Begleitung: mit Name, Ton und Stimme, mit einem Erzählbogen durch die Trainingseinheit, mit proaktiven Meldungen bei geschlossener App und einem wöchentlichen Bericht — innerhalb eines Kostenrahmens, der pro zahlendem Nutzer und Monat im niedrigen Cent-Bereich bleibt (Rechnung im Abschnitt „Kostenmodell", **korrigiert** gegenüber v1).

**Architecture:** Alle Logik wandert in eigenständige Skriptdateien unter `js/`, gebaut wie die bestehenden `coach-*.js`: reine Funktionen, kein DOM-Zugriff, keine globalen App-Variablen, Daten kommen als Argument herein. Jede Datei hängt sich an `globalThis` **und** exportiert per CommonJS, damit sie ohne Bundler im Browser läuft und in `node --test` importierbar ist. Verdrahtet wird ausschließlich in `index.html`. Server-seitig ändert sich nur `ai-worker/worker.js` — es entsteht **keine** neue Server-Komponente und kein Service-Account.

**Tech Stack:** Vanilla JS (kein Bundler), Node 22 mit eingebautem Test-Runner (`node --test test/*.js`), Capacitor 8 für iOS, Swift/AVFoundation für die Sprachausgabe, Cloudflare Worker + KV (`AI_QUOTA`), Firebase Firestore Web-SDK 10.13, `@capacitor/local-notifications` 8.

**Spec (Absichtsquelle, unangetastet):** `docs/superpowers/specs/2026-07-28-live-coach-design.md`

**Vorgänger-Plan:** `docs/superpowers/plans/2026-07-28-live-coach-plan.md` — bleibt als Beleg liegen. Dieser Plan ersetzt ihn in der Ausführung.

**Baut auf:** `docs/superpowers/plans/2026-07-27-ki-coach-fundament.md` (abgeschlossen) — Dossier, Aktions-Log und Intent-Router sind vorhanden und werden hier erweitert, nicht ersetzt.

**Stand bei Planerstellung (2026-07-29):** `9b7d667`, 92 Tests grün, Block 0 Tasks 1 und 2 abgeschlossen.

---

## Warum dieser Plan anders aussieht als v1

v1 war 5.234 Zeilen und rund 112.000 Token groß — sein eigener Ausführer konnte ihn nicht am Stück lesen. Die Ursache war der eingebettete Fertig-Code, und genau der ist in beiden bisher umgesetzten Tasks durchgefallen:

- **Task 1:** Die Deckelformel `max(MIN_MONTHLY_USD, Köpfe × 0.30)` mit `MIN_MONTHLY_USD = "5"` hätte den Deckel direkt nach dem Deploy auf 5 $ gesetzt — gegen die im laufenden Monat schon aufgelaufenen Kosten. Jeder zahlende Nutzer hätte sofort 429 bekommen. Break-even zum alten festen 25-$-Deckel liegt bei ~84 Premium-Köpfen. Der Sockel steht deshalb jetzt auf 25.
- **Task 2:** Der wörtliche Modulcode aus v1 fiel durch die Testsuite desselben Plans (2 von 9 rot). Das anschließende Review fand fünf Critical: der Klassifikator stufte 44 von 47 personenbezogenen Fragen als cachebar ein, der Guard `!result.plan` war toter Code, ` ```gtmem ` war ungeschützt (hätte die gemeldete Einschränkung eines Nutzers ins Dossier fremder Nutzer geschrieben), der Cache-Schlüssel kam ungeprüft vom Client, und der Schlüssel ignorierte die Gesprächshistorie.

Daraus folgt die Bauform dieses Plans: **Absicht, Schnittstelle, Testfälle, Suchmuster, Fallstricke, Verifikation — aber keine Rumpfimplementierung.** Code steht nur dort, wo die exakte Form die Anforderung *ist*: eine Firestore-Rule, ein Regex, eine Konstante, ein Prompt-Text.

**Der Umfang ist unverändert: 22 Tasks in 6 Blöcken.** Gekürzt ist die Darstellung, nicht das Vorhaben.

---

## Wie eine Task in diesem Plan zu lesen ist

Jede offene Task hat sechs Teile:

1. **Absicht** — was der Nutzer danach hat, das er vorher nicht hatte.
2. **Schnittstelle** — Signaturen, Eingabe- und Rückgabeform, welche Felder aus welcher Quelle. Kein Rumpf.
3. **Testfälle** — Tabelle Eingabe → erwartete Ausgabe → *fängt welchen Fehler*. Ein Testfall, der bei einem plausiblen Bug trotzdem grün bliebe, gehört nicht hinein. Wer beim Schreiben merkt, dass ein Fall nichts fängt, streicht ihn und notiert das.
4. **Berührte Stellen** — als **Suchmuster**, nicht als Zeilennummer.
5. **Fallstricke** — was an dieser Stelle schon einmal schiefging.
6. **Verifikation** — Befehl plus erwartete Ausgabe.

**Reihenfolge innerhalb einer Task ist immer TDD:** Tests schreiben → rot laufen lassen und den Fehlschlag *lesen* → implementieren → grün → commit. Ein Modul, das grün wird, ohne vorher rot gewesen zu sein, wurde nicht getestet, sondern begleitet.

---

## Zeilennummern sind ungültig

Alle Zeilennummern aus v1 stammen aus Commit `522a639`. Sie sind **heute schon falsch**: nach den beiden erledigten Tasks liegt jeder `index.html`-Anker um **+1 Zeile** verschoben, die `worker.js`-Anker um rund **+250 Zeilen**. Nach jeder weiteren Task verschiebt sich mehr. `index.html` hat 27.137 Zeilen und fast jede Task schreibt hinein.

**Regel: Anker werden über Inhalt gesucht, nie über Zeilennummer.** Wo unten eine Zahl in Klammern steht, ist sie nur eine Orientierung („ungefähr im letzten Drittel"), niemals eine Sprungmarke.

Suchmuster für die wiederkehrenden Anker in `index.html`:

| Anker | Suchmuster (`grep -n`) |
| --- | --- |
| Skript-Tags der Coach-Module | `js/coach-intent.js` |
| Coach-Karte im Heute-Tab | `id="coach-today-card"` |
| Coach-Leiste im Training | `id="wk-coach-bar"` |
| Chat-Overlay | `id="ov-ai-chat"` |
| Version | `const APP_VERSION` |
| Changelog | `const CHANGELOG` |
| Coach-Defaults | `S.aiCoach = Object.assign` |
| Tagesempfehlung | `function _coachTodaySuggestion` |
| Karte rendern | `function renderCoachTodayCard` |
| Check-in-Erholung | `function _ciReadiness` |
| Check-in-Gewichtsfaktor | `function _ciAdjustW` |
| Satz abhaken | `function toggleSetDone` |
| Training beenden | `function finishWk` |
| Symbol-Set | `const ICO = {` |
| Worker-URL | `const AI_WORKER_URL` |
| Premium-Prüfung | `function isPremium` |
| Kauf | `async function premBuy` |
| Coach-Leiste setzen / zeichnen | `function _coachBarSet` / `function _coachBarRender` |
| Coach-Schalter | `function setAiCoachOpt` |
| Frage-Chips | `function _aicRenderSugg` |
| Chat-Kontext | `function _aicContext` |
| Chat senden | `async function aicSend` |
| Persistieren | `let persist = () =>` |
| Capacitor-Plugin holen | `const _cap = (name) =>` |
| Training läuft? | `function isWorkoutActive` |
| Dossier lesen / schreiben | `function _dossier(` / `_dossierSet` |

**`S.aiCoach.live` wird an vier Stellen abgefragt.** Suchmuster: `grep -n "aiCoach.live" index.html` — Erwartung: **genau vier** Treffer. Jede Task, die `inTraining` einführt, muss alle vier bedienen. Weicht die Trefferzahl ab, ist der Code seit Planerstellung gewandert; dann zuerst nachsehen, warum.

---

## Global Constraints

Diese Regeln gelten für **jede** Task. Sie werden nicht wiederholt, sondern vorausgesetzt.

- **Keine Emojis in der App-Oberfläche.** Symbole ausschließlich über `ICO.<name>({s})`. Gilt auch für Notification-Titel und -Texte. Bestehende CHANGELOG-Einträge bleiben unangetastet.
- **Jeder freie Text geht durch `esc()`,** bevor er per `innerHTML` gerendert wird — Coach-Name, Chat-Inhalte, Dossier-Einträge, Übungsnamen.
- **Niemals `@capacitor-firebase/authentication` hinzufügen,** niemals `import FirebaseCore` oder `FirebaseApp.configure()` in Swift. Das erzeugt einen SIGABRT beim Start. Firebase läuft ausschließlich über das JS-Web-SDK.
- **Zwei Sprachen.** Interne Daten sind deutsch, die Anzeige läuft über `tr()` und die Tabellen `I18N_EN` / `I18N_RX`. Jeder neue nutzersichtbare String braucht seinen englischen Gegenpart.
- **Sprachschlüssel:** `'de'` und `'en'`, gelesen aus `localStorage['gt_lang']`. Module bekommen die Sprache als Argument, sie lesen `localStorage` nicht selbst.
- **Zeitstempel** sind durchgängig `Date.now()`-Millisekunden. Der Wochenschlüssel hat das Format `2026-W31` (ISO-Woche, zweistellig mit führender Null).
- **Keine Änderung an `firestore.rules` nötig.** `aiCoach` steht bereits in der `hasOnly`-Liste (verifiziert 2026-07-29, `firestore.rules:20`). Kommt eine Task zu dem Schluss, sie brauche eine Rules-Änderung, ist der Entwurf falsch — melden statt Rules anfassen.
- **Kein zweiter Firestore-Schreibpfad.** `S.coachSession`, `S.coachPush`, `S.coachReports` bleiben rein lokal. Nach `profiles/` schreibt ausschließlich der bestehende `_pushSocialProfile()`.
- **Modul-Bauart** (identisch zu `js/coach-log.js`): IIFE über `globalThis`, `var API = {…}`, `module.exports = API` **und** `root.CoachX = API`. Vor dem ersten neuen Modul einmal `js/coach-log.js` lesen und die Form übernehmen, statt sie zu erinnern.
- **Defensive Verdrahtung.** Jeder Einstiegspunkt in `index.html`, der ein Coach-Modul aufruft, steht in `try/catch`. Ein Fehler im Coach darf niemals das laufende Training abbrechen.
- **Kein LLM-Aufruf in Block 3.** Die Tiefe im Training ist vollständig algorithmisch. Ein `fetch` gegen `AI_WORKER_URL` in einer Block-3-Datei ist ein Fehler.
- **Version bumpen** bei jedem Blockabschluss: `APP_VERSION` in `index.html` **und** `CACHE` in `sw.js:2` müssen denselben Wert tragen. Schema `gymtrack-vYYYYMMDDNNNN`.
- **Auto-Push.** Nach jeder abgeschlossenen Task wird committet und nach `origin/main` gepusht, ohne Rückfrage.
- **Pfadgebundenes `git add`.** Im Arbeitsbaum liegt untracked Material (`.DS_Store`, `.sim-build/`, `tiktok/`, `ai-worker/.wrangler/`). Jeder Commit listet seine Dateien einzeln auf — **nie** `git add -A`.

---

## Gestaltungsregeln (bindend, aus der Spec)

Kollidiert eine Funktion mit einer dieser Regeln, wird die Funktion beschnitten — nicht die Regel.

1. **Ein Einstieg im Heute-Tab, kein zweiter.** Die bestehende `.aic`-Karte (`id="coach-today-card"`) ist der einzige Zugang zum Coach. Keine neue Karte, Zeile, Kachel oder Schaltfläche auf der Startseite. Kein fünfter Tab.
2. **Im Training steht das Training vorn.** Der Coach hat dort genau eine Fläche: `#wk-coach-bar`. Kein Overlay, nichts Modales, kein Dialog mit Bestätigungszwang.
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
| `js/coach-cache.js` | **erledigt** — Klassifikator „personenbezogen?" + Cache-Schlüssel | `CoachCache` |
| `js/coach-persona.js` | Persona normalisieren, Prompt-Zeile bauen, **alle** algorithmischen Coach-Texte in 4 Tönen × 2 Sprachen | `CoachPersona` |
| `js/coach-voice.js` | Brücke zur Sprachausgabe, Zustand des Sprech-Buttons | `CoachVoice` |
| `js/coach-session.js` | Erzählbogen der laufenden Einheit, Obergrenze, Stufenfilter | `CoachSession` |
| `js/coach-warmup.js` | Aufwärmsätze aus dem Arbeitsgewicht, auf verfügbare Scheiben gerundet | `CoachWarmup` |
| `js/coach-cues.js` | Statische Technik-Hinweise je Übung, DE/EN | `CoachCues` |
| `js/coach-rpe.js` | Satz-Rückfrage leicht/passend/schwer → nächster Vorschlag | `CoachRpe` |
| `js/coach-analyze.js` | Plateau-Diagnose, Zeitbudget-Priorisierung | `CoachAnalyze` |
| `js/coach-notify.js` | Frequenz-Deckel und Planung der lokalen Notifications | `CoachNotify` |
| `js/coach-report.js` | Wochenzahlen und Ziel-Prognose | `CoachReport` |
| `ios/App/App/Plugins/TtsPlugin.swift` | `AVSpeechSynthesizer` mit `.duckOthers` | — |

### Neue Testdateien

`test/coach-cache.test.js` (erledigt), `test/coach-persona.test.js`, `test/coach-voice.test.js`, `test/coach-session.test.js`, `test/coach-warmup.test.js`, `test/coach-cues.test.js`, `test/coach-rpe.test.js`, `test/coach-analyze.test.js`, `test/coach-notify.test.js`, `test/coach-report.test.js`

### Geänderte Dateien

| Datei | Was |
| --- | --- |
| `index.html` | Skript-Tags, Persona-Defaults, Hub-Overlay, Einrichtung, Verdrahtung aller Module, Name statt „KI-Coach" |
| `js/coach-intent.js` | Router von 8 auf ~20 Intents, Begründungs-Intent |
| `ai-worker/worker.js` | **erledigt** — Pro-Nutzer-Budget, Antwort-Cache |
| `ai-worker/wrangler.jsonc` | **erledigt** — `USD_PER_USER` + `MIN_MONTHLY_USD` |
| `sw.js` | Cache-Version je Blockabschluss |
| `ios/App/App/Info.plist` | `NSSpeechRecognitionUsageDescription`, `NSMicrophoneUsageDescription` |

---

## Reihenfolge und Parallelität

**Alle Blöcke laufen strikt nacheinander. Keine Task wird parallel zu einer anderen ausgeführt.**

Grund: sämtliche Verdrahtung passiert in `index.html`, einer Datei mit rund 1,4 MB. In einer Vorsession haben zwei gleichzeitig arbeitende Agenten über den geteilten Git-Index 17 Zeilen fast verloren. Ein zweiter Agent darf höchstens **lesen** (Review), nie schreiben.

Die Reihenfolge ist inhaltlich bindend:

- **Block 0** senkt die Kosten, bevor die anderen Blöcke Aufrufe erzeugen. Ohne ihn würde jeder folgende Block auf einen Deckel laufen, der schon vorher knapp war.
- **Block 1** liefert `say()` — die eine Stelle, an der Ton und Sprache entschieden werden. Blöcke 2 bis 5 formulieren ausschließlich darüber. Ohne diesen Block behandelte jede spätere Textstelle den Ton selbst, und der Ton liefe je nach Stelle auseinander.
- **Block 2** liefert `speak()`, das Block 3 optional nutzt, und es braucht die Stimmwahl aus der Einrichtung in Block 1.
- **Block 3** produziert die Sätze, die man sich vorlesen lassen können soll — deshalb nach Block 2.
- **Block 4** liefert den Notification-Kanal, den Block 5 für den Wochenbericht braucht.
- **Block 5** braucht Persona-Ton (Block 1) und Kanal (Block 4) und steht deshalb zuletzt.

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

`APP_VERSION` (`grep -n "const APP_VERSION"`) und `CACHE` in `sw.js:2` auf denselben neuen Wert setzen. Neuen Eintrag als **erstes** Element in `CHANGELOG` (`grep -n "const CHANGELOG"`) einfügen — Key nach dem Muster `cl-2026-07-29-<thema>`, niemals dem Muster `gymtrack-v\d+` folgend.

- [ ] **6. Commit und Push** — pfadgebunden, nie `git add -A`.

- [ ] **7. Abnahme durch den Nutzer**

Block N vorlegen: was gebaut wurde, Screenshot, Testzahl. Erst nach ausdrücklicher Abnahme mit Block N+1 beginnen.

---
# Block 0 — Kosten-Fundament

**Warum zuerst:** Jeder folgende Block erzeugt Aufrufe. Der frühere globale Deckel stand fix bei 25 $ und hätte bei rund 80 voll ausschöpfenden Nutzern die KI **für alle gleichzeitig** abgeschaltet. Router-Ausbau und Antwort-Cache senken die Aufrufzahl, bevor sie steigt.

**Ergebnis:** Der Kostendeckel wächst mit der Nutzerzahl, wiederkehrende sachliche Erstfragen kosten nichts mehr, und der Router beantwortet gut das Doppelte lokal.

---

### Task 1 — Pro-Nutzer-Budget im Worker · **ERLEDIGT** (`24b380d`, `7a84e13`, `6d1063e`)

**Nicht neu planen.** Gebaut wurde, abweichend von v1:

- `premiumSeen(uid, env, opts)` und `budgetCapUsd(uid, env, opts)` in `ai-worker/worker.js`. Beide nehmen ein `opts`-Objekt mit `readOnly` — `/admin-stats` darf die Kopfzahl **lesen**, ohne den Fragenden mitzuzählen. In v1 gab es diesen Parameter nicht; der Admin-Aufruf hätte den Zähler verfälscht.
- **`MIN_MONTHLY_USD` steht auf `25`, nicht auf `5`.** Das ist die entscheidende Abweichung. Mit 5 hätte der Deckel direkt nach dem Deploy unter den bereits aufgelaufenen Monatskosten gelegen und jeder zahlende Nutzer hätte sofort 429 bekommen. Break-even von `Köpfe × 0,30 $` gegen den alten festen 25-$-Deckel liegt bei ~84 Premium-Köpfen. Mit Sockel 25 wird der alte Deckel zur **Untergrenze** statt zur Obergrenze.
- Der Fehlerpfad von `budgetCapUsd` fällt auf `floorUsd` zurück, **nicht** auf `GLOBAL_MONTHLY_USD` — letzteres darf leer sein und würde den Deckel dann ganz verschwinden lassen.
- `premiumSeen()` in `/quota` läuft in `try/catch`: ein KV-Fehler darf den Kontingent-Endpunkt nicht werfen.
- `/admin-stats` liefert zusätzlich `premiumHeads`.

**Wenn der Deckel später neu bewertet wird:** Der Sockel darf erst sinken, wenn `premiumHeads × USD_PER_USER` dauerhaft über 25 liegt. Vorher abzulesen:

```bash
curl -s "https://gymtrack-ai.wolterlenny362.workers.dev/admin-stats?idToken=<FOUNDER_ID_TOKEN>" | head -c 800
```

---

### Task 2 — Geteilter Antwort-Cache · **ERLEDIGT** (`33c2c79`, `9b7d667`)

**Nicht neu planen.** Gebaut wurde, in wesentlichen Punkten abweichend von v1:

- `js/coach-cache.js` (`normalize`, `isPersonal`, `cacheKey`) plus `test/coach-cache.test.js`. Der v1-Klassifikator stufte 44 von 47 personenbezogenen Fragen als cachebar ein; die gebaute Fassung erweitert ihn um `CC_SUBJ`+`CC_MODAL` (Ich + Modalverb), Körper-/Verletzungs-Wortstämme und Plan-Wortstämme, und trennt Wortstamm-Prüfung (`hasStem`) von Regex-Prüfung, weil deutsche Komposita an Wortgrenzen scheitern.
- **Der Worker rechnet Schlüssel und Cachefähigkeit selbst nach** (`ccNormalize` / `ccIsPersonal` / `ccHash16` / `ccVerifiedKey` in `worker.js`). In v1 kam der Schlüssel ungeprüft vom Client — ein zahlender Nutzer hätte unter dem Schlüssel einer populären Frage seine Wunschantwort 30 Tage lang ablegen können (Cache-Vergiftung).
- **Nur der erste Turn eines Chats ist cachefähig** (`msgs.length !== 1` → kein Cache). Der Schlüssel hängt sonst nur an der aktuellen Frage: Turn 1 „Ich habe Schulterprobleme" + Turn 2 „Alternative zu Bankdrücken?" hätte die schulterspezifische Antwort ohne Vorgeschichte abgelegt.
- **Das Modell-Segment setzt der Server** (`ccModelId(env)`), nicht der Client. Sonst blieben die Schlüssel bei einem Modellwechsel gleich und alle Nutzer bekämen 30 Tage lang Antworten des alten Modells.
- **` ```gtmem ` ist genauso gesperrt wie ` ```gtplan `** (`hasPersonalBlock`). In v1 stand dort nur `!result.plan` — toter Code. Eine gecachte Antwort mit `gtmem` hätte die gemeldete Einschränkung eines Nutzers ins Dossier fremder Nutzer geschrieben.
- **Cachefähige Anfragen bekommen einen eigenen, entkernten Prompt** (`runChat(..., { shared: true })`): ohne Dossier, ohne Sessions, ohne Übungsnamen, mit ausdrücklichem Verbot von `gtplan`/`gtmem`. Das ist der Grund, warum die Ersparnis kleiner ausfällt als in v1 gerechnet — siehe „Kostenmodell".
- Die beiden Klassifikatoren in `js/coach-cache.js` und `worker.js` sind ein **bewusstes Duplikat**. Laufen sie auseinander, stimmt der berechnete Schlüssel nicht mehr mit dem gelieferten überein und es wird gar nicht gecacht (fail-closed). **Wer einen der beiden ändert, ändert beide.**

---

### Task 3: Router-Ausbau von 8 auf 20 Fragen

**Absicht.** Jede Frage, die der Router lokal beantwortet, kostet nichts, funktioniert ohne Netz und ist sofort da. Der Nutzer bekommt danach auf zwölf weitere Fragen — nächster Satz, Aufwärmen, Supersatz-Partner, Wochenfortschritt, Streak, letzter PR, Trainingsdauer, gestern, Muskelvolumen, nächster Plantag, Planliste, Pausenempfehlung — eine Antwort ohne Ladepunkte, auch im Keller-Gym.

**Schnittstelle.** `resolveIntent(q, s)` behält seine Signatur. Der Schnappschuss `s` bekommt vierzehn neue Felder; jedes ist `null`, wenn die Quelle fehlt:

| Feld | Typ | Quelle in `index.html` |
| --- | --- | --- |
| `nextSetText` | `string\|null` | laufendes Training: Zielsätze × Zielwdh. bei Vorschlagsgewicht |
| `warmupText` | `string\|null` | vorerst `null` — wird in Block 3 aus `CoachWarmup.format()` gefüllt |
| `supersetText` | `string\|null` | `log.ssGroup`-Partner der aktuellen Übung |
| `weekWorkouts` | `number\|null` | Einheiten der laufenden Woche aus `S.sessions` |
| `weekGoal` | `number\|null` | `S.obFreq` bzw. Wochenplan |
| `streakDays` | `number\|null` | `S.streak` |
| `lastPrExName` | `string\|null` | jüngster PR |
| `lastPrKg` | `number\|null` | dito |
| `lastPrDaysAgo` | `number\|null` | dito |
| `avgDurationMin` | `number\|null` | Mittel der letzten Einheiten |
| `yesterdayText` | `string\|null` | Einheit von gestern, sonst `null` |
| `muscleVolume` | `{[k:string]:number}\|null` | Wochenvolumen je Muskelgruppe |
| `nextPlanDayText` | `string\|null` | nächster Plantag |
| `planNames` | `string[]\|null` | `S.customSplits` / `S.workoutPresets` |

**Ein fehlendes Feld ist `null`, nie ein geratener Wert.** `null` heißt „Router antwortet nicht, Frage geht ans Modell". Ein erfundener Wert wäre eine Falschaussage des Coaches — teurer als jeder Modellaufruf.

**Vor dem Schreiben zwingend lesen:** der Kopf von `js/coach-intent.js`. Dort stehen zwei Mechanismen mit ausführlicher Begründung — `BLOCK` (alles Wertende, Planende, Medizinische geht ans Modell) und `two()` (ein doppeldeutiges Ankerwort zählt nur zusammen mit einem zweiten unabhängigen Signal). Ein neuer Intent, der ohne `two()` auf ein Alltagswort matcht, ist ein Fehler.

**Testfälle** (`test/coach-intent.test.js`, an die bestehenden anhängen). Schnappschuss `S20` mit den Werten der Tabelle oben: `weekWorkouts:3, weekGoal:4, streakDays:12, avgDurationMin:58, lastPrExName:'Kniebeuge', lastPrKg:102.5, lastPrDaysAgo:6, muscleVolume:{brust:4800,ruecken:5200}` usw.

| Eingabe | Erwartete Ausgabe | Fängt welchen Fehler |
| --- | --- | --- |
| `'was ist mein naechster satz?'` | `intent==='nextSet'`, `answer` enthält `'62,5'` | Intent trifft nicht / Zahl fehlt |
| `'ein satz mit vielen woertern'` | `null` | `two()` fehlt: „satz" allein darf nicht greifen |
| `'wie soll ich mich aufwaermen?'` | `intent==='warmup'` | Muster trifft nicht |
| `'was passt als supersatz dazu?'` | `intent==='superset'` | dito |
| `'wie viele trainings diese woche?'` | `answer === 'Diese Woche 3 von 4 Einheiten.'` | **exakter String**, nicht `/3/`+`/4/` — sonst grün, obwohl Ziel und Ist vertauscht sind |
| `'diese woche war anstrengend'` | `null` | „woche" allein ist Alltagswort |
| `'wie lang ist meine streak?'` | `answer` enthält `'12'` | Zahl aus falschem Feld |
| `'wann hatte ich zuletzt einen pr?'` | `answer` enthält `'Kniebeuge'` **und** `'102,5'` **und** `'6'` | nur Name geprüft ⇒ Gewicht/Alter könnten fehlen |
| `'wie lange trainiere ich im schnitt?'` | `answer` enthält `'58'` | dito |
| `'was habe ich gestern gemacht?'` | `intent==='yesterday'` | — |
| `'wie viel volumen brust diese woche?'` | `answer` enthält `'4.800'`, **nicht** `'5.200'` | falsche Muskelgruppe getroffen |
| `'wie viel volumen diese woche?'` | `intent!=='muscleVolume'` (bestehender Gesamt-Intent) | Intent 17 schluckt die allgemeine Frage |
| `'was steht als naechstes an?'` | `intent==='nextPlanDay'` | — |
| `'welche plaene habe ich?'` | `answer` enthält alle drei Namen | Join verliert Einträge |
| `S20` mit `streakDays:null` + Streak-Frage | `null` | erfundener Wert statt Rückzug |
| dito `warmupText:null`, `avgDurationMin:null` | jeweils `null` | dito |
| `'soll ich lieber mehr volumen bei brust machen?'` | `null` | `BLOCK` durchbrochen — wertende Frage lokal beantwortet |
| `'warum ist mein naechster satz so schwer?'` | `null` | dito |
| `'whats my next set?'` / `'how long is my streak?'` / `'how should i warm up?'` | jeweils passender Intent | EN-Variante vergessen |

**Berührte Stellen.**

- `js/coach-intent.js` — die neuen Intents **vor** dem abschließenden `return null;` von `resolveIntent`. Suchmuster: das letzte `return null;` der Funktion.
- **Reihenfolge:** der Muskelvolumen-Intent muss **nach** dem bestehenden Gesamtvolumen-Intent stehen (Suchmuster: `volumen` im bestehenden Code), sonst schluckt er die allgemeine Frage.
- `index.html` — Schnappschuss-Builder: `grep -n "resolveIntent" index.html`.

**Fallstricke.**

- Ein `\bpr\b`-Muster trifft auch in „prima"/„pro" nicht, wohl aber in „PR" — genau das ist gewollt. Kein `pr` ohne Wortgrenzen.
- Der bestehende Test „wertende Warum-Fragen gehen ans Modell" muss grün bleiben. Läuft er rot, wurde `BLOCK` angefasst.

**Verifikation.**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-intent.test.js
```

Erwartung: alle grün, keiner der bestehenden rot. Danach im Simulator „Wie lang ist meine Streak?", „Wie soll ich mich aufwärmen?", „Was steht als Nächstes an?" — alle drei erscheinen **sofort ohne Ladepunkte**, und der Anfragezähler im KI-Menü bewegt sich nicht. Das ist der Beleg, dass der Router und nicht das Modell geantwortet hat.

Commit: `feat(coach): Router beantwortet zwoelf weitere Fragen lokal` — `js/coach-intent.js test/coach-intent.test.js index.html`

---

### Task 4: Begründungs-Intent „Warum 62,5?"

**Absicht.** Der Coach schlägt Gewichte vor, erklärt sie aber nie. Nach dieser Task bekommt der Nutzer auf „Warum 62,5?" die konkrete Regel — Wiederholungen, Bereich, Schrittweite, gegebenenfalls die Check-in-Absenkung in Prozent — sofort und lokal. Diese Frage stellt jeder Nutzer irgendwann, und heute kostet sie jedes Mal einen Modellaufruf.

**Schnittstelle.** Ein neues Schnappschuss-Feld, `null`, wenn gerade kein Vorschlag aktiv ist:

```js
weightReason: {
  exName: string, fromKg: number, toKg: number, stepKg: number,
  reason: 'repsHigh'|'repsLow'|'checkinUp'|'checkinDown'|'hold',
  lastReps: number[], repRange: [number, number],
  ciFactor: number      // Faktor aus _ciAdjustW, 1.0 = unveraendert
}
```

Neuer Intent `weightWhy`. Der Antworttext nennt in jedem Fall **Zahl, Regel und Schrittweite** — „weil du bereit bist" ist wertlos.

**Testfälle.** `WR` = obiges Objekt mit `fromKg:60, toKg:62.5, stepKg:2.5, reason:'repsHigh', lastReps:[8,8,8], repRange:[6,8], ciFactor:1.0`.

| Eingabe | Erwartete Ausgabe | Fängt welchen Fehler |
| --- | --- | --- |
| `'warum 62,5?'` | `intent==='weightWhy'`; `answer` enthält `'8/8/8'` **und** `'2,5'` **und** `'62,5'` | `/8/` allein wäre grün, obwohl der Satz nur den Bereich `6–8` nennt |
| `'warum dieses gewicht?'` | `intent==='weightWhy'` | Muster verlangt fälschlich eine Zahl |
| `'wie kommst du auf das gewicht?'` | dito | — |
| `'why this weight?'` | dito | EN vergessen |
| `reason:'checkinDown', toKg:55, ciFactor:0.92` + `'warum 55?'` | `answer` enthält `'8'` (Prozent aus `1-0.92`) und das Wort `Check-in` **oder** `Erholung` | Prozentrechnung falsch herum |
| `reason:'repsLow'` | `answer` sagt, dass das Gewicht **bleibt** | Auf- und Abstieg vertauscht |
| `weightReason: null` + `'warum 62,5?'` | `null` | Router erfindet eine Begründung ohne Vorschlag |
| `'warum tut mir die schulter weh?'` | `null` | Ausnahme zu weit gefasst — medizinische Frage lokal beantwortet |
| `'warum ist mein plan so aufgebaut?'` | `null` | dito, wertende Frage |

**Berührte Stellen.**

- `js/coach-intent.js`: `BLOCK` enthält `warum` und `erklaer` — die Begründungsfrage käme sonst nie an. **`warum` NICHT aus `BLOCK` entfernen** (dann rutschen wertende Fragen durch). Stattdessen genau diesen Intent **vor** der `BLOCK`-Prüfung platzieren, als einzige begründete Ausnahme, mit einem eng gefassten Muster: `warum|wieso|weshalb|why|wie kommst du|how come` **zusammen** mit einem Gewichts-Signal (die vorgeschlagene Zahl, `gewicht`, `weight`, `kilo`, `kg`) in maximal 24 Zeichen Abstand. Die Ausnahme greift nur, wenn `s.weightReason` gesetzt ist.
- `index.html`: Progressionslogik. Suchmuster `function _ciAdjustW` und die Double-Progression darum herum (`getSuggestedWeight`, `getSuggestion`, `getSuggestedReps`). Beim Berechnen des Vorschlags das Objekt in einer Modulvariablen `_lastWeightReason` ablegen — **bewusst nur im Speicher**, die Begründung gilt für genau diesen Moment.

**Fallstricke.**

- `String(wr.toKg)` liefert `'62.5'`; der Nutzer tippt `62,5`. Das Muster muss beide Trenner akzeptieren.
- Die Reihenfolge ist der ganze Trick: steht der Intent nach `BLOCK`, ist er tot und die Tests bleiben trotzdem rot-grün-verwirrend, weil `BLOCK` `null` liefert und nicht wirft.

**Verifikation.**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-intent.test.js
```

Danach im Simulator: Training starten, Übung öffnen, „Warum <die tatsächlich vorgeschlagene Zahl>?" fragen → sofortige Antwort mit der konkreten Regel. Danach „Warum tut mir die Schulter weh?" → muss ans Modell gehen (Ladepunkte erscheinen).

Commit: `feat(coach): Coach begruendet seinen Gewichtsvorschlag lokal`

---

### Task 5: Kontextabhängige Frage-Chips

**Absicht.** Die Chips über dem Eingabefeld sind heute eine feste Liste von vier Vorschlägen, die alle ins Modell führen. Danach richten sie sich nach dem Zustand (Training läuft / gerade fertig / nichts los), und **die ersten beiden jeder Reihe beantwortet der Router** — kostenlos, sofort, offline. Nur der dritte geht ans Modell. Genau so herum, nicht umgekehrt.

**Schnittstelle.** Keine neue API. `_aicRenderSugg()` wird ersetzt.

Drei Zustände, drei Chips:

| Zustand | Chips (Reihenfolge bindend) |
| --- | --- |
| Training läuft | „Was ist mein nächster Satz?" · „Wie soll ich mich aufwärmen?" · „Alternative zu dieser Übung" |
| letzte Einheit < 6 h her | „Wie lief die Einheit?" · „Wie lang ist meine Streak?" · „Wie kann ich mein Volumen steigern?" |
| sonst | „Was steht als Nächstes an?" · „Wie viele Trainings diese Woche?" · „Erstelle mir einen Trainingsplan" |

**Berührte Stellen.**

- `index.html`, Suchmuster `function _aicRenderSugg`.
- **Zustandsabfrage:** `WK.active` aus v1 **existiert nicht** — verifiziert 2026-07-29, 0 Treffer. Die richtige Abfrage ist `isWorkoutActive()` (Suchmuster `function isWorkoutActive`). Diese Falschangabe stand in v1 und hätte den ersten Zustand nie ausgelöst.
- `I18N_EN` — die sieben neuen deutschen Strings brauchen ihren englischen Gegenpart. Suchmuster `I18N_EN`.

**Fallstricke.**

- Der bisherige `onclick`-String baut den Chip-Text mit `replace(/'/g,"\\'")` in ein Attribut. Das ist eine Injektionsstelle, sobald dort je ein Übungsname landet. **Sie verschwindet ersatzlos:** Chips als `data-sg="<index>"` rendern und den Handler per `onclick = () => …` in JS setzen; der Text wird über den Index aus dem Array geholt, nie aus dem DOM zurückgelesen.
- `esc(tr(...))` beim Rendern, auch wenn die Texte hier fest verdrahtet sind. Die Stelle darf nicht die eine sein, an der später versehentlich Nutzerinhalt durchgereicht wird.

**Testfälle.** Kein Node-Test möglich (DOM-nah). Stattdessen manuell, mit klarem Fehlerbild:

| Schritt | Erwartung | Fängt welchen Fehler |
| --- | --- | --- |
| Chat ohne laufendes Training öffnen | dritte Chip-Reihe | Zustandsabfrage greift immer |
| Training starten, Chat öffnen | erste Chip-Reihe | `isWorkoutActive()` falsch verdrahtet |
| Ersten Chip antippen | Antwort **ohne** Ladepunkte | Chip führt doch ins Modell |
| Dritten Chip antippen | Ladepunkte erscheinen | — |
| Sprache auf Englisch, Chat öffnen | englische Chips | `I18N_EN`-Eintrag fehlt |

**Verifikation.**

```bash
grep -n "isWorkoutActive\|_aicRenderSugg" index.html | head
~/.claude/sim-native.sh gymtrack "iPhone 17"
```

Commit: `feat(coach): Frage-Chips richten sich nach dem Zustand und fuehren in den Router`

---

## Blockabschluss 0

Ritual durchlaufen. Changelog-Key: `cl-2026-07-29-coach-schneller`.

```js
  'cl-2026-07-29-coach-schneller': {
    label: '29.07.2026 · Der Coach antwortet schneller und kostet weniger',
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

**Warum jetzt:** `say()` ist die Sprachfabrik für alles Folgende. Blöcke 2 bis 5 formulieren ausschließlich darüber.

**Ergebnis:** Der Coach hat einen Namen, den der Nutzer vergibt, einen von vier Tönen, ein Zuhause (den Hub hinter der bestehenden `.aic`-Karte) und eine Einrichtung, die direkt nach dem Abo-Abschluss fragt, wie sehr er sich einmischen soll.

---

### Task 6: `coach-persona.js` — Name, Ton, Sprachfabrik

**Absicht.** Nach dieser Task spricht der Coach in einem Ton, den der Nutzer gewählt hat, und nennt sich beim Namen. Ohne diesen einen Punkt müsste jede spätere Textstelle den Ton selbst behandeln, und der Ton liefe je nach Stelle auseinander.

**Schnittstelle.**

| Funktion | Rückgabe |
| --- | --- |
| `personaGet(aiCoach)` | `{name, tone, voice, voiceOn, preset, inTraining, setFeedback, pushLevel, insights}` — jedes Feld garantiert gültig |
| `personaLine(persona, lang)` | `string` — eine Zeile für den System-Prompt, 20–400 Zeichen |
| `say(key, vars, persona, lang)` | `string` — der Coach-Satz im gewählten Ton, `''` bei unbekanntem Key |
| `KEYS` | `string[]` — **abgeleitet** aus `Object.keys(TXT.de)`, nicht von Hand gepflegt |
| `TONES` | `['ruhig','sachlich','hart','locker']` |
| `LEVELS` / `PUSH` | `['off','key','full']` / `['still','normal','eng']` |
| `PRESETS` | `{quiet:{inTraining:'off',setFeedback:false,pushLevel:'still'}, balanced:{'key',true,'normal'}, close:{'full',true,'eng'}}` |

**Abweichung von der Spec, bewusst:** Die Spec schreibt `say(key, vars)`. Das Modul kennt keine App-Globals — Persona und Sprache müssen hereinkommen. In `index.html` steht ein dünner Wrapper `_say(key, vars)` (Task 7); die Aufrufstellen sehen die Kurzform der Spec.

**Defaults** (bei fehlendem oder ungültigem Eingabewert): `name:'Coach'`, `tone:'sachlich'`, `voice:null`, `voiceOn:true`, `inTraining:'key'`, `setFeedback:true`, `pushLevel:'normal'`, `insights:true`, `preset:undefined`.

**Der Satzkatalog hat 24 Schlüssel**, jeder in `TXT.de` und `TXT.en` mit allen vier Tönen:

| Key | Wann | Platzhalter |
| --- | --- | --- |
| `greet` | Trainingsstart mit Bezug auf die letzte gleichartige Einheit | `{ex} {kg} {reps} {sets}` |
| `greetFirst` | erste Einheit dieses Plans überhaupt | `{ex}` |
| `mid` | Halbzeit, Einordnung zum letzten Volumen | `{vol} {pct}` |
| `exOpen` | Übung geöffnet: Zielsätze, letztes Gewicht | `{ex} {kg} {reps} {sets}` |
| `warmupIntro` | Aufwärmschema angesagt | `{ex}` |
| `setAsk` | Satz-Rückfrage, Frage über den Chips | — |
| `setAckEasy` / `setAckHard` | Antwort quittiert | `{kg}` |
| `restTip` | Technikpunkt im Pausenfenster | `{ex}` |
| `restNext` | Ankündigung des nächsten Satzes | `{kg} {reps}` |
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

**Die vier Töne, verbindlich definiert** — daran werden alle Sätze gemessen:

| Ton | Haltung | Satzbau | Verboten |
| --- | --- | --- | --- |
| `ruhig` | gelassen, ohne Druck, nimmt Last raus | kurze Hauptsätze, keine Ausrufezeichen | Superlative, Antreiben |
| `sachlich` | neutraler Beobachter, nennt Zahlen | Aussagesatz, Zahl vorn | Bewertung, Emotion |
| `hart` | fordernd, knapp, direkte Ansprache | Imperativ, maximal 8 Wörter | Entschuldigungen, Weichmacher |
| `locker` | kumpelhaft, leicht, augenzwinkernd | Umgangssprache, gern Frage | Anbiederung, Ironie über den Nutzer |

**Regel für alle Sätze:** keine Emojis, kein Ausrufezeichen im Ton `ruhig`, maximal acht Wörter im Ton `hart`, und kein Satz, der nur lobt, ohne eine Zahl oder eine Beobachtung zu tragen (Gestaltungsregel 8). **`forecast` enthält in allen vier Tönen eine Bedingung („wenn es so weiterläuft") und nie eine Zusage** — das wird in Task 21 geprüft.

**Verbindlich zur Zahlformatierung:** deutsch Komma, englisch Punkt; Tausendertrennung erst ab vier Stellen (dann deutsch `.` / englisch `,`). Ein Platzhalter ohne Wert wird **samt umgebendem Leerzeichen entfernt**, nie als `{kg}` stehengelassen — ein sichtbarer Platzhalter ist schlimmer als ein etwas dünnerer Satz.

**Der Name wird im Modul entschärft, nicht erst an der Renderstelle:** `[<>&"'\`\\]` entfernen, Whitespace zusammenziehen, auf 20 Zeichen kürzen, leer → `'Coach'`. Grund: der Name geht auch in Notification-Titel und in den Prompt — Stellen ohne `esc()`.

**Testfälle** (`test/coach-persona.test.js`):

| Eingabe | Erwartete Ausgabe | Fängt welchen Fehler |
| --- | --- | --- |
| `personaGet(undefined)` | alle neun Defaults exakt | Default fehlt oder ist falsch |
| `personaGet({tone:'boese'})` / `{tone:null}` / `{tone:42}` | `tone==='sachlich'` | ungültiger Wert wird durchgereicht |
| `personaGet({name:'   Max   '})` | `'Max'` | kein Trim |
| `personaGet({name:'A'.repeat(40)})` | `name.length===20` | keine Längenbegrenzung |
| `personaGet({name:'<img src=x onerror=alert(1)>'})` | `!/[<>]/.test(name)` | XSS-Vektor in Notification/Prompt |
| `personaGet({name:'<<<>>>'})` / `{name:'   '}` | `'Coach'` | leer nach Entschärfung → leerer Titel |
| `personaGet({inTraining:'laut'})` / `{pushLevel:'dauernd'}` | `'key'` / `'normal'` | dito |
| **Vollständigkeit:** alle `KEYS` × 4 Töne × 2 Sprachen | jeweils String, `length>0`, `!==key`, **kein** `/\{[a-z]+\}/i` | 192 Kombinationen; fängt fehlende Übersetzung *und* ungefüllten Platzhalter, benennt die Kombination |
| `say('greet', …)` in allen vier Tönen | vier **verschiedene** Sätze (`Set.size===4`) | Töne kopiert statt formuliert |
| `say('gibtsnicht', {}, …)` | `''` | wirft statt zurückzugeben |
| `say('exOpen', {}, …)` | kein Platzhalter im Ergebnis | `fill()` lässt Lücken stehen |
| `say('exOpen', {kg:62.5}, …, 'de'/'en')` | `'62,5'` / `'62.5'` | Locale-Formatierung fehlt |
| `say('debrief', {vol:7200}, …, 'de'/'en')` | `'7.200'` / `'7,200'` | Tausendertrennung falsch herum |
| `personaLine({name:'Nina',tone:'hart'},'de')` | enthält `'Nina'`, Länge 20–400 | Prompt-Zeile wuchert |
| `PRESETS.quiet/balanced/close` | `inTraining` `'off'`/`'key'`/`'full'`, `setFeedback` boolean, `pushLevel` aus `PUSH` | Profil unvollständig ⇒ Task 7 kippt `preset` sofort auf `'custom'` |
| **Emoji-Test:** alle 192 Sätze | kein `\p{Extended_Pictographic}` | verletzt die harte UI-Regel |
| **Ton-`hart`-Test:** alle `hart`-Sätze | ≤ 8 Wörter | Tondefinition nur behauptet, nicht eingehalten |

**Verifikation.**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-persona.test.js
```

Erwartung: PASS. Schlägt der Vollständigkeitstest fehl, nennt die Meldung Key, Ton und Sprache.

Commit: `feat(coach): Persona-Modul mit Sprachfabrik in vier Toenen` — `js/coach-persona.js test/coach-persona.test.js`

---

### Task 7: Persona-Felder, Profile und die `live`-Synchronisierung

**Absicht.** `S.aiCoach` bekommt die neuen Felder, und der Nutzer kann per Profil („Zurückhaltend"/„Ausgewogen"/„Eng dabei") drei Schalter auf einmal setzen. Der heikle Teil: `S.aiCoach.live` wird an vier Stellen abgefragt und darf nicht auseinanderlaufen, wenn der Nutzer stattdessen `inTraining` setzt.

**Schnittstelle** (in `index.html`):

| Funktion | Verhalten |
| --- | --- |
| `_persona()` | normalisierte Persona aus `S.aiCoach`, mit `try/catch`-Rückfall auf `personaGet({})` |
| `_lang()` | `'en'` wenn `localStorage['gt_lang']==='en'`, sonst `'de'` |
| `_say(key, vars)` | `CoachPersona.say(key, vars, _persona(), _lang())`, im Fehlerfall `''` |
| `_coachName()` / `_coachLevel()` | `_persona().name` / `_persona().inTraining` |
| `setCoachPreset(name)` | setzt `preset`, `inTraining`, `setFeedback`, `pushLevel`, `live` **in einem Zug** |
| `setAiCoachOpt(key, val)` | erweitert: hält `live` ↔ `inTraining` synchron, kippt `preset` auf `'custom'` bei Abweichung |

**Die Invariante, die diese Task herstellt:** `live !== false` ⟺ `inTraining !== 'off'`. Beide Richtungen. Wer nur einen der beiden setzt, umgeht sonst die vier alten `live`-Abfragen.

**Bestandsnutzer-Migration:** Wer den Live-Coach abgeschaltet hatte (`live === false`), bekommt `inTraining:'off'` — sonst fängt der Coach nach dem Update ungefragt wieder an zu reden. Und umgekehrt.

**Berührte Stellen.**

- Skript-Tag: `grep -n "js/coach-intent.js" index.html`, direkt danach `coach-persona.js` einhängen.
- Defaults: `grep -n "S.aiCoach = Object.assign" index.html` — heute steht dort nur `{ live:true, insights:true }`.
- `grep -n "function setAiCoachOpt" index.html`.
- Die vier Abfragen: `grep -n "aiCoach.live" index.html` — Erwartung genau vier Treffer. Jede wird auf `_coachLevel() !== 'off'` umgestellt; die vorangehende `isPremium()`-Prüfung bleibt unverändert stehen.

**Fallstricke — beide 2026-07-29 am echten Code verifiziert.**

- **`setAiCoachOpt` schreibt heute `S.aiCoach[key] = !!val`.** Die Boolean-Coercion würde jeden neuen Stringwert zerstören: `'key'` → `true`, `'sachlich'` → `true`, der Name → `true`. v1 erwähnte das nicht und hätte den Bug nur zufällig mitgefixt, weil es die Funktion komplett ersetzte. **Diese Zeile ist die eigentliche Änderung der Task.**
- **`save()` existiert nicht.** v1 ruft es an fünf Stellen auf (hier und in Task 10, 17, 19, 21). Die Persistenzfunktion heißt **`persist()`** (`grep -n "let persist = ()"`). Ein Aufruf von `save()` wirft `ReferenceError` — im `try/catch` der defensiven Verdrahtung fällt das **still** aus und der Zustand wird nie gespeichert. Das ist der teuerste Fehler in diesem Block, weil er nicht auffällt.
- `setAiCoachOpt` ruft heute `_coachBarRender()` auf, nicht `renderCoachTodayCard()`. Der bestehende Aufruf bleibt; die neuen kommen dazu, jeder in `try/catch` (`renderCoachHub` existiert erst ab Task 9).
- `setCoachPreset` darf **nicht** über `setAiCoachOpt` laufen: der erste Schalter würde `preset` sofort auf `'custom'` kippen, bevor die anderen beiden gesetzt sind.
- `preset` wandert nur bei den drei Schaltern auf `'custom'`, die ein Profil überhaupt setzt (`inTraining`, `setFeedback`, `pushLevel`, `live`). Name, Ton und Stimme sind profilunabhängig.

**Testfälle.** Kein Node-Test (App-Globals). Konsole im Simulator, mit erwarteten Werten:

| Eingabe | Erwartete Ausgabe | Fängt welchen Fehler |
| --- | --- | --- |
| `setCoachPreset('quiet')` | `S.aiCoach.live === false`, `inTraining==='off'`, `pushLevel==='still'` | Synchronisierung fehlt |
| `setCoachPreset('close')` | `live === true`, `inTraining==='full'` | dito |
| `setAiCoachOpt('pushLevel','still')` danach | `S.aiCoach.preset === 'custom'` | Abweichung nicht erkannt |
| `setAiCoachOpt('tone','hart')` | `preset` **unverändert**, `tone==='hart'` (String!) | Boolean-Coercion; Ton profilrelevant gemacht |
| `setAiCoachOpt('name','Nina')` | `S.aiCoach.name === 'Nina'` | Boolean-Coercion |
| `setAiCoachOpt('live',false)` | `inTraining === 'off'` | Rückrichtung fehlt |
| App neu laden nach jedem Schritt | Werte überleben | `save()` statt `persist()` → still verloren |

**Verifikation.** `grep -n "aiCoach.live" index.html` liefert weiterhin vier Treffer, alle über `_coachLevel()`. Danach die Konsolentabelle oben durchspielen, **mit App-Neustart nach dem letzten Schritt**.

Commit: `feat(coach): Persona-Felder, Umfangs-Profile, live/inTraining synchron`

---

### Task 8: Der Name ersetzt „KI-Coach" überall

**Absicht.** Der billigste und wirksamste Teil des ganzen Vorhabens. Ein Coach, der „Nina" heißt, ist eine andere Erfahrung als eine Funktion namens „KI-Coach" — bei identischem Code darunter.

**Schnittstelle.** Keine neue API. Verbraucht `_coachName()`.

**Die Zuordnung, die diese Task leistet** — jeder Treffer von `grep -n "KI-Coach\|AI Coach\|KI Coach" index.html` fällt in genau eine Kategorie:

| Kategorie | Umgang |
| --- | --- |
| **Anzeigetext** (Kartenlabel, Overlay-Überschrift, Leisten-Titel, Button) | ersetzen durch den Namen |
| **Beschreibung der Funktion** (Paywall, Einstellungstext, Changelog) | **bleibt „KI-Coach"** — dort ist die Funktion gemeint, nicht die Person |
| **Interne Schlüssel** (Datenfelder, Klassennamen, `data-`-Attribute) | unverändert |

**Berührte Stellen (die vier Hauptstellen).**

1. `.aic`-Karte: `grep -n "aic-lbl" index.html` — heute fest `tr('KI-Coach')`, wird `esc(_coachName())`. **`esc()` ist Pflicht**, der Name kommt vom Nutzer.
2. Chat-Kopf: im Markup von `id="ov-ai-chat"` bekommt das `<h2>` eine `id`; der Text wird beim Öffnen per **`textContent`** gesetzt (dann kein `esc()` nötig — und kein `innerHTML`).
3. Live-Leiste: `grep -n "function _coachBarRender" index.html`. Trägt die Leiste ein Label, bekommt es den Namen.
4. Eingabefeld-Platzhalter: „Frag deinen Coach…" bleibt, solange der Name `'Coach'` ist; sonst `Frag <Name>…`.

**Fallstricke.**

- `_coachBarSet` setzt nur den Zustand; gezeichnet wird in `_coachBarRender`. Wer den Namen in `_coachBarSet` einträgt, sieht nichts.
- Der Chat-Kopf darf **nicht** per `innerHTML` mit dem Namen befüllt werden — das wäre die eine Stelle, an der der entschärfte Name doch noch als Markup landet.

**Testfälle** (Simulator-Konsole):

| Eingabe | Erwartete Ausgabe | Fängt welchen Fehler |
| --- | --- | --- |
| `setAiCoachOpt('name','Nina')`, Heute-Tab + Chat ansehen | „Nina" auf Karte und im Chat-Kopf | Stelle übersehen |
| `setAiCoachOpt('name','<b>x')` | Text erscheint **ohne** Fettschrift, keine Konsolenfehler | `esc()` fehlt / Entschärfung greift nicht |
| `setAiCoachOpt('name','')` | „Coach" | leerer Titel |
| Paywall öffnen | dort steht weiter „KI-Coach" | Funktionsbeschreibung fälschlich personalisiert |

**Verifikation.**

```bash
grep -n "KI-Coach" index.html | grep -v "CHANGELOG\|pw2-\|paywall\|I18N"
xcrun simctl io "iPhone 17" screenshot /tmp/gymtrack-name.png
```

Erwartung: leer oder nur Treffer, die bewusst als Funktionsbeschreibung stehenbleiben. Jeder verbleibende Treffer wird im Commit-Text benannt.

Commit: `feat(coach): der vergebene Name ersetzt die Bezeichnung KI-Coach`

---

### Task 9: Coach-Hub

**Absicht.** Das Zuhause des Coaches. Nach dieser Task hat der Nutzer hinter der bestehenden Coach-Karte vier Bereiche: Chat, Journal („was ich über dich weiß", jeder Eintrag einzeln löschbar), Woche und Einstellungen. Das Journal ist das stärkste Vertrauenssignal des ganzen Vorhabens.

**Einstieg ist ausschließlich die bestehende `.aic`-Karte** — keine neue Fläche im Heute-Tab (Gestaltungsregel 1).

**Schnittstelle.**

| Funktion | Verhalten |
| --- | --- |
| `openCoachHub(tab)` | öffnet `ov-coach-hub`; ist der Nutzer Premium und `S.aiCoach.preset === undefined`, startet stattdessen die Einrichtung (Task 10) |
| `renderCoachHub()` | zeichnet den aktiven Bereich neu; **no-op**, wenn das Overlay nicht offen ist |
| `coachHubTab(name)` | `'chat'\|'journal'\|'report'\|'settings'` |
| `_dossierRemove(group, index)` | **neu** — entfernt einen Dossier-Eintrag, schreibt zurück, stößt den bestehenden gedrosselten Push an |

**Aufbau des Overlays.** Klassen und Struktur vom bestehenden `ov-ai-chat` übernehmen (Gestaltungsregel 7): `.ov > .sheet > .sh-handle + .sh-head + .ch-tabs + #ch-body`. Die vier Reiter-Beschriftungen werden in `renderCoachHub()` per `textContent` gesetzt, damit `tr()` greift — **nicht ins Markup schreiben**.

Neue CSS-Klassen (im Stil der bestehenden `.aic-*`-Regeln, Akzentfarbe über `--acc-rgb`): `.ch-tabs`, `.ch-tab`, `.ch-tab.on`, `.ch-sec`, `.ch-row`, `.ch-jrn`, `.ch-preset`.

**Die vier Bereiche.**

- **Chat.** Der bestehende Chat zieht **nicht** physisch um — das würde `aicSend()`, das Diktat und den Verlauf anfassen, ohne dass der Nutzer etwas davon hätte. Der Hub zeigt den letzten Wortwechsel gekürzt und verlinkt das bestehende Overlay.
- **Journal.** Vier Gruppen aus dem Dossier: `goal`, `limits`, `prefs`, `works`. Jeder Eintrag mit Löschknopf; `until`-Datum wird mitangezeigt. **Jeder Eintrag ist Nutzertext ⇒ `esc()` zwingend**, auch das Ablaufdatum.
- **Woche.** Bis Block 5 ein ehrlicher Platzhalter („Dein erster Wochenbericht kommt am Sonntag."), keine leere Fläche.
- **Einstellungen.** Name (Textfeld, `maxlength=20`), Ton, Umfangs-Profil, plus ein zugeklapptes `<details>` „Feinjustierung" mit den vier Einzelschaltern (`inTraining`, `setFeedback`, `pushLevel`, `insights`). Ist `preset === 'custom'`, erscheint eine vierte, deaktivierte Profilkarte „Angepasst".

**Die Ton-Auswahl zeigt denselben Satz in allen vier Tönen** — der Nutzer hört den Unterschied, statt vier Adjektive zu lesen. Das ist der Unterschied zwischen einer Einstellung und einer Entscheidung. Beispielsatz: `say('greet', {ex:'Bankdrücken', kg:60, reps:8, sets:3}, personaGet({tone:t}), lang)`.

**Berührte Stellen.**

- Markup direkt **vor** `grep -n 'id="ov-ai-chat"' index.html`.
- Styles neben den bestehenden `.aic-sugg`-Regeln.
- Tap-Ziel: `grep -n "function renderCoachTodayCard" index.html`.

**Fallstricke — verifiziert 2026-07-29.**

- **`CoachMemory.dossierGet` existiert nicht.** v1 ruft es auf. Die tatsächliche API ist `CoachMemory.dossierLoad(localStorage, uid)`, in `index.html` gekapselt als **`_dossier()`** (`grep -n "function _dossier("`), Gegenstück `_dossierSet(...)`. `_dossierRemove` wird darauf aufgebaut — **kein neuer Firestore-Zugriff**, der Schreibweg existiert bereits.
- **`openAiChat()` vor dem Verlinken prüfen:** `grep -n "ov-ai-chat'" index.html` und den echten Namen einsetzen.
- **Das Tap-Ziel auf der Karte darf den CTA nicht schlucken.** Die Karte trägt einen „Training starten"-Button. Ohne `if (ev.target.closest('button, a')) return;` verliert der Nutzer den Trainingsstart, den er bisher an dieser Stelle hatte. Klassenname der inneren Karte (`.aic`) und Existenz von `haptic()` vorher prüfen.
- `renderCoachHub()` muss früh zurückkehren, wenn das Overlay geschlossen ist — es wird aus `setAiCoachOpt` heraus aufgerufen, also auch aus Kontexten ohne Hub.

**Testfälle** (Simulator, Prüfliste — jeder Punkt fängt einen konkreten Fehler):

| Schritt | Erwartung | Fängt welchen Fehler |
| --- | --- | --- |
| Tipp auf die Coach-Karte | Hub öffnet sich | Handler nicht verdrahtet |
| Tipp auf „Training starten" in derselben Karte | Training startet, Hub öffnet **nicht** | `closest('button,a')`-Guard fehlt |
| Alle vier Reiter durchklicken | keiner ist leer | Platzhalter vergessen |
| Journal mit mindestens einem Dossier-Eintrag | Eintrag sichtbar, Löschknopf entfernt ihn dauerhaft (App-Neustart) | falsche Dossier-API / `persist()` fehlt |
| Dossier-Eintrag mit `<b>` im Text anlegen | erscheint als Text, nicht als Markup | `esc()` fehlt |
| Auf jeden der vier Töne tippen | Beispielsatz darunter ändert sich **sichtbar** | Töne doppeln sich |
| „Eng dabei" wählen, dann „Nachrichten" → „Still" | Profilanzeige wechselt auf „Angepasst" | `preset`-Logik aus Task 7 nicht angebunden |
| Heute-Tab ansehen | **keine** neue Karte, Zeile oder Kachel | Gestaltungsregel 1 verletzt ⇒ Block nicht abnahmefähig |

**Verifikation.** `xcrun simctl io "iPhone 17" screenshot /tmp/gymtrack-hub.png`

Commit: `feat(coach): Coach-Hub mit Chat, Journal, Woche und Einstellungen`

---

### Task 10: Einrichtung beim Abo-Abschluss

**Absicht, in einem Satz:** **Ein Coach, der ungefragt redet, wird abgeschaltet und nie wieder eingeschaltet — ein Coach, dessen Umfang man beim Kauf selbst bestimmt hat, wird justiert statt gekündigt.**

**Schnittstelle.**

| Funktion | Verhalten |
| --- | --- |
| `openCoachSetup()` | startet bei Schritt 1 |
| `coachSetupStep(n)` | `1\|2\|3` |
| `coachSetupDone(skipped)` | setzt `preset` (falls noch offen: `'balanced'`), schließt; bei `skipped=false` öffnet danach den Hub auf „Einstellungen" |

**Die drei Schritte.**

1. **Name und Ton.** Textfeld (`maxlength=20`, Platzhalter „Coach") plus die vier Tonkarten mit Beispielsatz — dieselbe Darstellung wie im Hub.
2. **Stimme.** An/Aus-Schalter plus Erklärsatz: „Er spricht nur, wenn du ihn über den Sprech-Button fragst — nie von selbst." Die Stimmenliste kommt erst in Block 2; solange sie fehlt, zeigt der Schritt **nur** den Schalter — kein leerer Listenrahmen. Der Aufruf des späteren `_csRenderVoices(el)` steht schon hier, in `try/catch` und mit `typeof … === 'function'`-Prüfung.
3. **Umfang.** Die drei Profile mit je einem Beschreibungssatz. Vorbelegt ist **die mittlere, nicht die lauteste.**

**Wichtige Verhaltensdetails.**

- **Kein `onclick` auf dem Overlay-Hintergrund** — anders als bei allen übrigen Overlays. Ein versehentlicher Tipp daneben soll die Einrichtung nicht abbrechen. Das ✕ überspringt bewusst und sichtbar.
- **Auch beim Überspringen wird `preset` gesetzt** (`'balanced'`) — sonst fragt die App beim nächsten Hub-Öffnen wieder, und genau das nervt.
- Nach dem Kauf: **420 ms Verzögerung** nach dem Schließen der Paywall, bevor die Einrichtung erscheint. Zwei gleichzeitig laufende Overlay-Animationen sehen kaputt aus.
- **Kein Aufruf beim App-Start.** Bestandsnutzer holen die Einrichtung beim ersten Öffnen des Hubs nach (Task 9) — eine Unterbrechung ohne Anlass wäre genau der Fehler, den diese Task verhindern soll.

**Berührte Stellen.**

- Markup direkt nach `ov-coach-hub`.
- Kaufpfad: `grep -n "async function premBuy" index.html`, Erfolgszweig — dort, wo die Paywall nach kurzer Verzögerung geschlossen wird.

**Fallstricke.**

- `save()` existiert nicht → `persist()` (siehe Task 7).
- `S.aiCoach.preset === undefined` ist die Bedingung, **nicht** `!S.aiCoach.preset` — `'custom'` und `'quiet'` sind gültige Werte, die keine erneute Einrichtung auslösen dürfen.

**Testfälle** (Simulator; im Simulator läuft kein echter Kauf, deshalb über den Bestandsnutzer-Pfad `delete S.aiCoach.preset; persist(); openCoachHub();`):

| Schritt | Erwartung | Fängt welchen Fehler |
| --- | --- | --- |
| Hub öffnen bei fehlendem `preset` | Einrichtung startet statt Hub | Weiche fehlt |
| Schritt 1: alle vier Töne antippen | Beispielsatz ändert sich jedes Mal | Persona wird nicht sofort geschrieben |
| Schritt 3: „Zurückhaltend", „Fertig" | `preset:'quiet'`, `inTraining:'off'`, `live:false`, `pushLevel:'still'` | Profil unvollständig angewandt |
| Hub erneut öffnen | Einrichtung startet **nicht** noch einmal | `preset` nicht gesetzt/nicht persistiert |
| Erneut zurücksetzen, sofort ✕ | `preset:'balanced'`, und beim nächsten Öffnen keine erneute Frage | Überspringen lässt `preset` offen |
| Nach jedem Schritt App neu starten | Werte überleben | `save()` statt `persist()` |

**Verifikation.** `xcrun simctl io "iPhone 17" screenshot /tmp/gymtrack-setup.png`

Commit: `feat(coach): Einrichtung beim Abo-Abschluss legt den Umfang fest`

---

## Blockabschluss 1

Ritual durchlaufen. Changelog-Key: `cl-2026-07-29-coach-persoenlich`.

```js
  'cl-2026-07-29-coach-persoenlich': {
    label: '29.07.2026 · Dein Coach bekommt einen Namen',
    items: [
      'Gib deinem Coach einen Namen und einen Ton — ruhig, sachlich, fordernd oder locker. Er redet ab sofort so mit dir',
      'Neu: das Coach-Menü. Ein Tipp auf die Coach-Karte auf der Startseite öffnet Chat, Journal, Wochenbericht und Einstellungen',
      'Im Journal siehst du zum ersten Mal, was der Coach über dich weiß — und kannst jeden einzelnen Eintrag löschen',
      'Beim Abschluss des Abos entscheidest du selbst, wie sehr sich der Coach einmischt: zurückhaltend, ausgewogen oder eng dabei',
    ]
  },
```

**Zusätzliche Prüfung, über das Ritual hinaus:** Der Heute-Tab muss vor und nach diesem Block **identisch aussehen**, bis auf das Wort auf der Coach-Karte. Kommt eine Fläche dazu, ist Gestaltungsregel 1 verletzt und der Block ist nicht abnahmefähig.

---
# Block 2 — Stimme

**Warum jetzt:** Die Sprachausgabe ist der Moment, in dem aus einer Textfläche eine Person wird. Sie braucht die Persona aus Block 1 (Name, Ton, Stimmwahl) und sie muss stehen, bevor Block 3 im Training Sätze produziert, die man sich vorlesen lassen können soll.

**Ergebnis:** Ein Sprech-Button im Training und im Chat. Drücken → Diktat → Antwort wird gesprochen **und** angezeigt. Der Coach schweigt, solange er nicht gefragt wird — ausnahmslos (Gestaltungsregel 6).

---

### Task 11: `TtsPlugin.swift`

**Absicht.** Nach dieser Task kann die native App Text vorlesen — offline (Keller-Gym), kostenlos, ohne den Text an einen fremden Dienst zu schicken, und **ohne laufende Musik abzuwürgen**.

**Korrektur gegenüber der Spec:** Die Spec behauptet, `SpeechPlugin.swift` sei untracked. Das ist überholt — die Datei ist getrackt (verifiziert 2026-07-29 via `git ls-files ios/App/App/Plugins/`). Diese Task legt **nur** das TTS-Plugin an und holt nichts nach.

**Schnittstelle.** Capacitor-Plugin `TtsPlugin` mit drei Methoden:

| Methode | Eingabe | Rückgabe |
| --- | --- | --- |
| `speak` | `{ text: string, voiceId?: string }` | `{ ok: true }`; `{ ok: false }` bei leerem Text |
| `stop` | — | `{ ok: true }` |
| `voices` | — | `{ voices: [{ id, name, lang, quality }] }`, gefiltert auf die aktuelle Systemsprache |

Zusätzlich ein Listener-Event `ttsDone` beim Ende einer Äußerung.

**Die drei Punkte, an denen die exakte Form die Anforderung ist.**

1. **Audio-Session — der eigentliche Knackpunkt:**

```swift
try s.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers, .mixWithOthers])
try s.setActive(true, options: [])
```

Ohne `.duckOthers` schneidet iOS die laufende Musik **ab**, statt sie leiser zu drehen. Im Gym ist das der Unterschied zwischen „benutzbar" und „sofort abgeschaltet". `.spokenAudio` signalisiert iOS, dass es Sprache ist — CarPlay und AirPods behandeln das anders als Musik.

2. **Deaktivierung:**

```swift
try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
```

Ohne `notifyOthersOnDeactivation` bleibt die Musik leise, bis der Nutzer die App wechselt.

3. **Info.plist** — beide Schlüssel, falls noch nicht vorhanden:

```xml
<key>NSSpeechRecognitionUsageDescription</key>
<string>Damit du deinem Coach deine Frage sagen kannst, statt sie zu tippen. Die Aufnahme wird nicht gespeichert.</string>
<key>NSMicrophoneUsageDescription</key>
<string>Damit du deinem Coach während des Trainings eine Frage stellen kannst.</string>
```

Die Texte sagen ausdrücklich, dass nichts gespeichert wird — das ist keine Höflichkeit, sondern die Zusage aus dem Datenschutz-Abschnitt der Spec.

**Weitere Verhaltensregeln, ohne Codevorgabe:** fehlt die gewählte Stimme (anderes Gerät, deinstalliertes Sprachpaket), wird die Systemstimme der aktuellen Sprache genommen — kein Fehler. Eine fehlgeschlagene Audio-Session darf höchstens die Sprachausgabe kosten, nie die App (`CAPLog.print`, kein `fatalError`). `voices()` liefert **nur** Stimmen der aktuellen Sprache: eine englische Stimme für deutschen Text klingt nicht nach Akzent, sondern nach Fehler. Läuft schon eine Äußerung, wird sie vor der neuen gestoppt.

**Berührte Stellen.**

- Create: `ios/App/App/Plugins/TtsPlugin.swift`
- Modify: `ios/App/App/Info.plist`
- Ggf. `ios/App/App.xcodeproj/project.pbxproj`

**Fallstricke.**

- **Die Registrierungsform nicht aus dem Gedächtnis schreiben.** Zuerst `sed -n '1,40p' ios/App/App/Plugins/SpeechPlugin.swift` lesen und `@objc(...)`, `CAPBridgedPlugin`/`pluginMethods` von dort übernehmen. Capacitor 8 verlangt eine exakte Form, und ein falsch registriertes Plugin **fällt zur Laufzeit stumm aus, statt zu compilieren**.
- **`npx cap sync ios` nimmt neue Dateien in `Plugins/` nicht automatisch in `project.pbxproj` auf.** Prüfen: `grep -c "TtsPlugin.swift" ios/App/App.xcodeproj/project.pbxproj` — Erwartung ≥ 2 (Datei-Referenz + Build-Phase). Steht dort `0`, die Datei einmal in Xcode per Drag-and-drop in die Gruppe `Plugins` ziehen („Copy items" **aus**, Target `App` **an**) und die geänderte `project.pbxproj` mitcommitten.
- Wird die Swift-Datei von `git add` ignoriert, in `.gitignore` nachsehen und die Ignore-Regel korrigieren, statt mit `-f` darüber hinwegzugehen.

**Testfälle** (kein Node-Test möglich; Webinspektor im Simulator):

| Eingabe | Erwartete Ausgabe | Fängt welchen Fehler |
| --- | --- | --- |
| `Capacitor.Plugins.TtsPlugin.voices()` | `voices.length >= 1`, jedes Element mit `id`/`name`/`lang`/`quality` | Plugin nicht registriert (`undefined`) |
| `…voices()` bei deutscher Systemsprache | alle `lang` beginnen mit `de` | Sprachfilter fehlt |
| `…speak({text:'Test. Drei Sätze bei sechzig Kilo.'})` | hörbar | — |
| `…speak({text:''})` | `{ok:false}`, kein Absturz | leerer Text wirft |
| `…speak({voiceId:'gibtsnicht'})` | spricht trotzdem, mit Systemstimme | harter Fehler statt Rückfall |
| **Musik-Test:** Musik über Safari abspielen, dann `speak()` | Musik wird **leiser und danach wieder lauter**, bricht **nicht** ab | `.duckOthers` bzw. `notifyOthersOnDeactivation` fehlt |

Der Musik-Test ist der wichtigste und wird nicht übersprungen.

**Verifikation.**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && npx cap sync ios && ~/.claude/sim-native.sh gymtrack "iPhone 17"
grep -c "TtsPlugin.swift" ios/App/App.xcodeproj/project.pbxproj
```

Commit: `feat(ios): TtsPlugin fuer die Coach-Stimme mit duckOthers` — `ios/App/App/Plugins/TtsPlugin.swift ios/App/App/Info.plist ios/App/App.xcodeproj/project.pbxproj`

---

### Task 12: `coach-voice.js` und der Sprech-Button

**Absicht.** Der Nutzer drückt im Training einen Knopf, sagt seine Frage laut und bekommt die Antwort **gesprochen und angezeigt**. Ein reiner Sprachkanal wäre im Gym unbrauchbar — man will die Zahl auch sehen.

**Schnittstelle.**

| Funktion | Eingabe | Rückgabe |
| --- | --- | --- |
| `CoachVoice.available(caps)` | `{tts, stt, webTts, webStt}` | `{tts: boolean, stt: boolean}` — nativ **oder** Web zählt |
| `CoachVoice.pickVoice(voices, preferredId, lang)` | Liste `[{id, lang}]` | gewählte `id`, sonst erste passende Sprache, sonst `null` |
| `CoachVoice.speakable(text)` | Bildschirmtext | für Ohren aufbereiteter Text |
| in `index.html` | `coachSpeak(text)`, `coachStopSpeak()`, `coachAsk()` | — |

**`speakable` — die Ersetzungen sind die Anforderung:**

| von | nach | warum |
| --- | --- | --- |
| `**fett**` | `fett` | Markdown wird sonst mitgesprochen |
| Zeilenanfang `- ` / `• ` / `· ` | entfernt | „Punkt Punkt eins" |
| `×` | ` mal ` | wird sonst als „x" gelesen |
| `@` | ` bei ` | wird sonst als „at" gelesen |
| `kg` (Wortgrenze) | `Kilo` | „k g" |
| `Wdh` (Wortgrenze) | `Wiederholungen` | „wdh" |

Mehrfach-Leerzeichen zusammenziehen, trimmen. Normaler Text bleibt **unverändert** — auch der Schlusspunkt.

**Berührte Stellen.**

- Create `js/coach-voice.js`, `test/coach-voice.test.js`.
- Skript-Tag nach `coach-persona.js`.
- Sprech-Button: in `#wk-coach-bar`, als **einziges** Bedienelement des Coaches im Training (Gestaltungsregel 2). Er hängt **in** der Leiste, nicht daneben — also im Aufbau von `_coachBarRender`.
- Stimmenliste: `_csRenderVoices(el)` aus Task 10 Schritt 2 wird hier geschrieben. Höchstens acht Stimmen anzeigen.

**Fallstricke.**

- **Ist auf dieser Plattform kein Diktat verfügbar, verschwindet der Button** — kein ausgegrauter Knopf, der nichts tut. Die Verfügbarkeit kommt aus `CoachVoice.available(...)`, gefüttert aus `_cap('TtsPlugin')`, `_cap('SpeechPlugin')`, `typeof speechSynthesis`, `webkitSpeechRecognition || SpeechRecognition`.
- **`ICO.mic` existiert nicht** (verifiziert 2026-07-29, kein `mic:`-Eintrag in `ICO`). Der Eintrag wird ergänzt; das SVG aus dem bestehenden `.aic-mic`-Button übernehmen. **Kein Emoji als Ersatz.**
- **`_sttListenOnce`, `_aicAskOnce`, `_coachTryLocal` existieren nicht** (verifiziert, 0 Treffer). v1 ruft alle drei auf. Der vorhandene Diktat-Einstieg heißt `aicMicToggle` (`grep -n "aicMicToggle" index.html`). Fehlende Einstiegspunkte werden als **dünne Wrapper** um die vorhandenen Funktionen angelegt — die vorhandene Diktat-Logik wird **nicht** dupliziert.
- `_cap(name)` (`grep -n "const _cap = (name)"`) gibt auf Web `null` zurück. Der Web-Zweig über `speechSynthesis` ist deshalb kein Fallback für Fehler, sondern der reguläre Pfad im Browser.
- `coachSpeak` scheitert **stumm** (`console.warn`), nie mit einem sichtbaren Fehler — die Sprachausgabe darf den Ablauf nie stören.
- Der Vorhör-Satz beim Antippen einer Stimme ist bewusst **derselbe**, den der Coach später wirklich sagt (`say('greet', …)`) — kein „Dies ist eine Testansage".

**Testfälle** (`test/coach-voice.test.js`):

| Eingabe | Erwartete Ausgabe | Fängt welchen Fehler |
| --- | --- | --- |
| `available({tts:true,stt:true,webTts:false,webStt:false})` | `{tts:true,stt:true}` | — |
| `available({tts:false,stt:false,webTts:true,webStt:true})` | `{tts:true,stt:true}` | Web-Zweig vergessen |
| `available({alle:false})` | `{tts:false,stt:false}` | Button erscheint ohne Fähigkeit |
| `pickVoice([{id:'a',lang:'de-DE'},{id:'b',lang:'de-DE'}], 'b', 'de')` | `'b'` | Wunsch ignoriert |
| `pickVoice([{id:'en1',lang:'en-US'},{id:'de1',lang:'de-DE'}], 'weg', 'de')` | `'de1'` | fällt auf die **erste** Liste statt auf die **passende Sprache** zurück |
| `pickVoice([{id:'en1',lang:'en-US'}], null, 'de')` | `null` | englische Stimme für deutschen Text |
| `pickVoice([], 'x', 'de')` | `null` | wirft bei leerer Liste |
| `speakable('**Bank** 3 × 8 @ 62,5 kg')` | `'Bank 3 mal 8 bei 62,5 Kilo'` | einzelne Ersetzung fehlt — **exakter String**, nicht Teilprüfung |
| `speakable('· Punkt eins')` | `'Punkt eins'` | Listenzeichen bleibt |
| `speakable('Guter Satz.')` | `'Guter Satz.'` | Regex frisst normalen Text |
| `speakable('')` / `speakable(null)` | `''` | wirft |

**Verifikation.**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-voice.test.js
npx cap sync ios && ~/.claude/sim-native.sh gymtrack "iPhone 17"
```

Simulator-Prüfliste:

| Schritt | Erwartung | Fängt welchen Fehler |
| --- | --- | --- |
| Einrichtung Schritt 2 | Stimmenliste erscheint, Antippen spricht den Begrüßungssatz | `_csRenderVoices` nicht angebunden |
| „Sprachausgabe" aus | Liste verschwindet | Schalter wirkungslos |
| Training starten | Sprech-Button ist **in** der Coach-Leiste, sonst nirgends | Gestaltungsregel 2 verletzt |
| Button drücken, „Wie lang ist meine Streak?" sagen | Antwort **gesprochen und angezeigt** | einer der beiden Kanäle fehlt |
| Ganzes Training ohne Buttondruck | **kein Ton zu keinem Zeitpunkt** | Gestaltungsregel 6 verletzt |
| Mikrofon-Berechtigung entziehen | Button verschwindet, Tastatur-Chat unverändert | ausgegrauter Knopf |

`xcrun simctl io "iPhone 17" screenshot /tmp/gymtrack-voice.png`

Commit: `feat(coach): Sprachausgabe und Sprech-Button, nur auf Anfrage`

---

## Blockabschluss 2

Ritual durchlaufen. Changelog-Key: `cl-2026-07-29-coach-stimme`.

```js
  'cl-2026-07-29-coach-stimme': {
    label: '29.07.2026 · Dein Coach hat jetzt eine Stimme',
    items: [
      'Drück im Training auf den Sprech-Knopf und frag laut: „Wie führe ich die Übung aus?" — die Antwort kommt gesprochen und geschrieben',
      'Such dir bei der Einrichtung die Stimme aus, die dir gefällt, und hör sie dir vorher an',
      'Laufende Musik wird nur leiser, nicht unterbrochen',
      'Der Coach redet nie von selbst los — nur wenn du ihn fragst',
    ]
  },
```

**Offener Punkt für den Betreiber, nicht für den Agenten:** Nutrition Labels in App Store Connect prüfen, ob Spracherkennung eintragungspflichtig ist, auch wenn nichts gespeichert wird. Im Blockabschluss als offen melden.

---

# Block 3 — Tiefe im Training

**Warum jetzt:** Persona und Stimme stehen. Jetzt bekommt der Coach etwas zu sagen, das er heute nicht sagen kann — nicht mehr Einzeltrigger, sondern ein Bogen über die Einheit.

**Kosten: 0 $.** Dieser Block ist vollständig algorithmisch. Ein `fetch` gegen `AI_WORKER_URL` in einer Datei dieses Blocks ist ein Fehler.

**Ergebnis:** Zwölf Trigger, von denen dank der Obergrenze nie mehr als vier (`key`) beziehungsweise acht (`full`) durchkommen. Der Coach hat viel zu sagen und sagt wenig davon — das ist der Unterschied zwischen aufdringlich und aufmerksam.

---

### Task 13: `coach-session.js` — der Erzählbogen

**Absicht.** Heute reagiert der Live-Coach auf Einzelsätze und weiß nicht, wo in der Einheit man steht. Danach begrüßt er mit dem, was beim letzten Mal stand, ordnet zur Halbzeit ein, merkt Ermüdung und Stillstand und zieht am Ende Bilanz — und **hält dabei eine harte Obergrenze ein**.

**Schnittstelle.**

| Funktion | Eingabe | Rückgabe |
| --- | --- | --- |
| `sessionNew(ctx)` | `{wkTs, level, planName, lastSame, muted, expectedSets}` | `sess` |
| `isStale(sess, wkTs)` | | `boolean` |
| `onStart(sess, ctx)` | | `{sess, out}` |
| `onExerciseOpen(sess, ex)` | `{id, name, targetSets, targetReps, lastKg}` | `{sess, out}` |
| `onSet(sess, log)` | `{exId, reps, kg, ts}` | `{sess, out}` |
| `onRest(sess, secs)` | | `{sess, out}` |
| `onTick(sess, now)` | | `{sess, out}` |
| `sessionEnd(sess, summary)` | `{sets, vol, prs}` | `{sess, out}` |
| `emit(sess, kind, key, vars, force)` | | `{sess, out}` — **die einzige Ausgabestelle** |
| `CAP` | | `{off:0, key:4, full:8}` |

`out` ist `null` **oder** `{kind, key, vars}`.

**Abweichung von der Spec, bewusst:** Die Spec schreibt `→ {text, kind}`. Das Modul liefert den Satz**schlüssel**, nicht den fertigen Satz — sonst bräuchte es Persona und Sprache und wäre nicht mehr unabhängig testbar. `index.html` macht daraus `_say(out.key, out.vars)`. Ergebnis für den Nutzer identisch, Testbarkeit deutlich besser.

**Entscheidung, die die Spec offenlässt:** Die Satz-Rückfrage (`setAsk`, Task 15) zählt **nicht** gegen die Obergrenze. Sie ist eine Bedienfläche, keine Äußerung — mit einem Deckel von vier wären nach vier Sätzen vier Chip-Reihen verbraucht und der Coach hätte kein Budget mehr für seinen eigentlichen Bogen. Sie hängt allein am Schalter `setFeedback`.

**Die drei Regelwerke, die das Verhalten festlegen:**

- **`LEVEL_KINDS`** — was auf welcher Stufe überhaupt vorkommen darf. `key`: `greet`, `greetFirst`, `exOpen`, `warmupIntro`, `debrief`. `full`: zusätzlich `mid`, `restTip`, `restNext`, `fatigue`, `stall`, `recall`, `plateau`, `timeBudget`, `cue`. `off`: nichts.
- **`ONCE`** — Arten, die je Einheit höchstens einmal vorkommen: `greet`, `greetFirst`, `mid`, `fatigue`, `stall`, `debrief`, `recall`, `plateau`, `timeBudget`. **`exOpen` fehlt bewusst** — die Ansage gilt je Übung, nicht je Einheit.
- **`emit()`** prüft in dieser Reihenfolge: Stufe `off` → Art auf dieser Stufe erlaubt → nicht gemutet → `ONCE` noch frei → Budget (`spoken < CAP[level]`). Nur `force` überspringt Stufe, Erlaubnis und Budget — und `force` gibt es an genau einer Stelle: **der Abschluss fällt nie aus.** Ihn am Budget scheitern zu lassen wäre die eine Stelle, an der Sparsamkeit als Gleichgültigkeit ankommt.

**Auslöse-Schwellen:**

| Art | Bedingung |
| --- | --- |
| `greet` / `greetFirst` | Trainingsstart, je nachdem ob `ctx.lastSame` gesetzt ist |
| `mid` | `setCount` erreicht `ceil(expectedSets/2)`; ohne Erwartungswert ersatzweise beim sechsten Satz |
| `fatigue` | Wiederholungsabfall (letzter Satz ≤ erster − 2) **und** steigende Pausen (letzte > drittletzte × 1,25). Einzeln ist beides normal — zusammen ist es Reserve am Ende |
| `restNext` | Pause ≥ 60 s |
| `stall` | 12 Minuten seit dem letzten Satz; danach nie wieder (`ONCE`) |
| `debrief` | Trainingsende, `force` |

**`isStale`:** Ein Zustand aus einer anderen Einheit ist wertlos — nach einem App-Neustart mitten im Training würde er sonst falsche Zahlen erzählen. Vergleich über `wkTs`.

**Testfälle** (`test/coach-session.test.js`). Hilfsfunktion `fullRun(level)` spielt eine Einheit durch, die **jeden** Trigger auslösen würde (3 Übungen × 3 Sätze mit fallenden Wiederholungen und steigenden Pausen, ein Tick nach 40 Minuten, Abschluss):

| Eingabe | Erwartete Ausgabe | Fängt welchen Fehler |
| --- | --- | --- |
| `fullRun('off')` | `length === 0` | `off` redet trotzdem |
| `fullRun('key')` | `0 < length <= 4` | Obergrenze umgangen — **die wichtigste Zusicherung des Blocks** |
| `fullRun('full')` | `4 < length <= 8` | `full` sagt nicht mehr als `key`, bzw. Deckel gerissen |
| `fullRun('key')`, alle `kind` | nur aus `{greet,greetFirst,exOpen,warmupIntro,debrief}` | Stufenfilter fehlt |
| 30 × `onExerciseOpen` bei `key`, dann noch eins | `out === null` | nach dem Budget wird weitergeredet |
| `fullRun('full')`, `greet`+`greetFirst` gezählt | genau `1` | Begrüßung doppelt |
| `ctx.lastSame = null`, `onStart` | `out.kind === 'greetFirst'` | falsche Begrüßung bei der ersten Einheit |
| `muted:['fatigue','stall']`, voller Lauf | keine dieser Arten im Ergebnis | Mute-Liste ignoriert |
| Satz bei `T0`, `onTick(T0+11min)` | `null` | Schwelle zu früh |
| dito `onTick(T0+13min)` | `out.kind === 'stall'` | Schwelle zu spät |
| danach `onTick(T0+30min)` | `null` | Stillstand meldet sich zweimal |
| Halbzeit erreichen | `out.kind==='mid'`, `typeof out.vars.vol === 'number'` und `> 0` | Volumen nicht mitgeführt |
| 20 × `onExerciseOpen` bei `key` (Budget leer), dann `sessionEnd` | `out.kind === 'debrief'` | `force` fehlt ⇒ Einheit endet stumm |
| `isStale(sess, wkTs+999)` / `isStale(sess, wkTs)` | `true` / `false` | fremder Zustand wird weiterverwendet |
| `onStart(...).out` | `typeof key==='string'`, `typeof vars==='object'`, `out.text === undefined` | Modul liefert fertigen Text ⇒ Persona-Kopplung |

**Fallstricke.**

- `emit()` ist die **einzige** Ausgabestelle. Schlägt der Obergrenzen-Test fehl, wurde irgendwo ein `out` an `emit` vorbei gebaut. Das zuerst prüfen, nicht die Schwellen.
- Der Zustand ist **unveränderlich fortgeschrieben** (`Object.assign({}, s, …)`), nie in-place mutiert — sonst zählt ein verworfener Rückgabewert trotzdem gegen das Budget.

**Verifikation.**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-session.test.js
```

Commit: `feat(coach): Erzaehlbogen mit harter Obergrenze je Einheit`

---

### Task 14: Aufwärmsätze und Technik-Cues

**Absicht.** Ein Trainer sagt das Aufwärmschema an; die App zählt Aufwärmsätze zwar getrennt (`warmups`), sagt aber nie, welche es sein sollen. Danach bekommt der Nutzer beim Öffnen einer Übung sein Schema **in Kilo, nicht in Prozent** — und einen einzigen Technikpunkt.

**Schnittstelle.**

| Funktion | Eingabe | Rückgabe |
| --- | --- | --- |
| `CoachWarmup.warmupSets(workKg, {step, barKg})` | | `[{kg, reps, pct}]`, leer bei zu leichtem Arbeitsgewicht |
| `CoachWarmup.roundToPlate(kg, step, barKg)` | | `number` |
| `CoachWarmup.format(sets, lang)` | | `'20 kg × 5, 30 kg × 3'` |
| `CoachCues.cueFor(exerciseName, lang)` | | `string\|null` |
| `CoachCues.CUES` | | Tabelle, für den Vollständigkeitstest |

**Das Schema ist die Anforderung:** `50 % × 5`, `70 % × 3`, `85 % × 1`. Das verbreitetste Schema und für die große Mehrheit richtig genug.

**Rundungsregel:** Bei vorhandener Stange ist nur der Anteil **oberhalb** der Stange teilbar — `bar + round((kg - bar) / step) * step`. Das Gesamtgewicht zu runden wäre falsch, weil die Stange fix ist.

**Harte Zusicherungen:** Kein Aufwärmsatz erreicht oder übersteigt je das Arbeitsgewicht (ein „Aufwärmsatz" auf Arbeitsgewicht ist der Arbeitssatz). Die Sätze steigen streng an. Runden zwei Prozentstufen auf dasselbe Gewicht, wird der Eintrag zusammengefasst. Unterhalb von `max(bar + 2*step, 30)` gibt es nichts sinnvoll aufzuwärmen → leere Liste.

**`CoachCues`:** eine statische Tabelle, mindestens zwölf Übungen, **keine externe Bibliothek, kein Modell**. Der Schlüssel ist ein normalisierter Namensbestandteil (klein, Umlaute aufgelöst, nur `a-z0-9`); die Zuordnung läuft über `indexOf`, damit „Bankdrücken Kurzhantel" denselben Hinweis bekommt. **Der längste passende Schlüssel gewinnt** — `beinbeug` darf nicht von einem späteren `bein` geschlagen werden. Ein Cue je Übung, nicht eine Liste: ein Trainer sagt genau einen Punkt vor dem schweren Satz. Deutsche und englische Fassung je Eintrag.

**Testfälle** (`test/coach-warmup.test.js`):

| Eingabe | Erwartete Ausgabe | Fängt welchen Fehler |
| --- | --- | --- |
| `roundToPlate(43.7, 2.5, 20)` | `45` | Rundung über das Gesamtgewicht statt über die Scheiben |
| `roundToPlate(41.2, 2.5, 20)` | `40` | dito, andere Richtung |
| `roundToPlate(52, 5, 0)` | `50` | Maschinen ohne Stange |
| `roundToPlate(12, 2.5, 20)` | `20` | rundet unter das Stangengewicht |
| `warmupSets(100, {step:2.5, barKg:20})` | `length===3`, `reps` exakt `[5,3,1]` | Schema verändert |
| `warmupSets(kg)` für `kg ∈ {60, 82.5, 100, 140, 47.5}` | **jedes** `s.kg < kg` | Aufwärmsatz auf Arbeitsgewicht |
| `warmupSets(120, …)` | streng steigend | Reihenfolge/Dedup kaputt |
| `warmupSets(25/0/null, …)` | `[]` | Aufwärmen bei leerer Stange |
| `warmupSets(80, {step:5, barKg:0})` | jedes `kg % 5 === 0` | Schrittweite ignoriert |
| `warmupSets(45, {step:2.5, barKg:20})` | keine doppelten Gewichte | 50 % und 70 % runden auf dieselbe Stufe |
| `format([{kg:22.5,reps:5},{kg:30,reps:3}], 'de'/'en')` | `'22,5 kg × 5, 30 kg × 3'` / `'22.5 kg × 5, 30 kg × 3'` | Locale |
| `format([], 'de')` | `''` | leerer Aufzählungsrest |

`test/coach-cues.test.js`:

| Eingabe | Erwartete Ausgabe | Fängt welchen Fehler |
| --- | --- | --- |
| `cueFor('Bankdrücken','de')` | String, `length > 10` | Eintrag fehlt |
| `cueFor('bankdruecken kurzhantel')`, `cueFor('BANKDRÜCKEN')`, `cueFor('Bench Press','en')` | jeweils Treffer | Normalisierung/Teilstring/EN fehlt |
| `cueFor('Unterarm-Wackeln')` / `''` / `null` | `null` | Allgemeinplatz statt Schweigen |
| alle `CUES`-Einträge | `de` und `en` je `length > 10` | halbe Übersetzung |
| alle `CUES`-Einträge | kein `\p{Extended_Pictographic}` | Emoji in der Oberfläche |
| `Object.keys(CUES).length` | `>= 12` | Tabelle zu dünn |

**Verifikation.**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-warmup.test.js test/coach-cues.test.js
```

Commit: `feat(coach): Aufwaermsaetze und Technik-Hinweise, rein algorithmisch`

---
### Task 15: Satz-Rückfrage — leicht / passend / schwer

**Absicht.** Die Stelle, an der der Coach zum ersten Mal **fragt**, statt nur zu sagen. Nach dem Abhaken eines Satzes erscheinen drei Chips; die Antwort steuert den nächsten Gewichtsvorschlag derselben Übung und wandert als Trend ins Dossier. Das ist RPE-Erfassung ohne Tipparbeit — und wer nicht antwortet, verliert nichts.

**Schnittstelle.**

| Funktion | Eingabe | Rückgabe |
| --- | --- | --- |
| `CoachRpe.toRpe(answer)` | `'leicht'\|'passend'\|'schwer'` (+ EN `easy`/`ok`/`hard`) | `6` / `8` / `9.5`, sonst `null` |
| `CoachRpe.adjustNext(kg, answer, step)` | | nächstes Gewicht |
| `CoachRpe.summarize(answers)` | `string[]` | `{easy, ok, hard, trend:'easy'\|'ok'\|'hard'}` |

**Die Werte sind bewusst grob** — 6 / 8 / 9,5 statt einer Zehnerskala, die niemand ehrlich ausfüllt.

**`adjustNext`-Regel:** genau **eine** Schrittweite rauf (`leicht`) oder runter (`schwer`), `passend` und unbekannt lassen stehen. Ergebnis bleibt ein Vielfaches der Schrittweite und fällt nie unter eine Schrittweite. Größere Sprünge wären aus einer einzelnen Gefühlsangabe nicht gedeckt — dafür gibt es die Double Progression und den Check-in.

**`summarize`-Trend:** `'hard'`, wenn `hard > easy` **und** `hard >= 2`; `'easy'` spiegelbildlich; sonst `'ok'`. Die Zwei-Schwelle verhindert, dass eine einzelne Antwort einen Trend behauptet.

**UI-Verhalten.** Die Chips erscheinen **unter** der Coach-Leiste, innerhalb derselben Fläche — keine neue Fläche (Gestaltungsregel 2), nichts Modales. Über den Chips steht `_say('setAsk')`. **Nach 8 Sekunden verschwinden sie unbeantwortet** (Gestaltungsregel 5). Eine Antwort erzeugt eine kurze Quittung (`setAckEasy` / `setAckHard`) mit dem neuen Gewicht, damit die Antwort nicht ins Leere geht. Neue Chip-Reihe entfernt zuerst die alte.

**Berührte Stellen.**

- Create `js/coach-rpe.js`, `test/coach-rpe.test.js`.
- `index.html`: Styles neben den bestehenden Coach-Bar-Regeln (`.cb-ask3`).
- Auslöser: `grep -n "function toggleSetDone" index.html`, im Zweig „Satz wurde als erledigt markiert", in `try/catch` — **ein Fehler hier darf nie das Abhaken kosten**.
- Trend ins Dossier: `grep -n "function finishWk" index.html`, nach dem Speichern, erst ab drei Antworten.
- Anbindung an die Progression: `grep -n "function _ciAdjustW" index.html`.

**Fallstricke.**

- `_rpeStoreOnLastSet(exId, rpe)` und `_rpeSuggestNext(exId, kg)` **existieren nicht** und werden gegen die echte Satz-Log-Datenstruktur gebaut, nicht erfunden. Vorher `toggleSetDone` und die Struktur der Logs lesen.
- Der Dossier-Trend läuft über den **bestehenden** Schreibweg (`_dossierSet` / `_dossier()`), **kein** neuer Firestore-Zugriff.
- Ist die Schrittweite an der Aufrufstelle nicht verfügbar, `2.5` als Vorgabe verwenden und im Kommentar festhalten, warum.
- `haptic()` existiert bereits — nicht neu schreiben.

**Testfälle** (`test/coach-rpe.test.js`):

| Eingabe | Erwartete Ausgabe | Fängt welchen Fehler |
| --- | --- | --- |
| `toRpe('leicht'/'passend'/'schwer')` | `6` / `8` / `9.5` | Zuordnung vertauscht |
| `toRpe('quatsch')` / `toRpe(null)` | `null` | stiller Default |
| `adjustNext(60,'schwer',2.5)` | `57.5` | Richtung vertauscht — **exakter Wert**, nicht nur `< 60` |
| `adjustNext(60,'leicht',2.5)` | `62.5` | dito |
| `adjustNext(60,'passend',2.5)` | `60` | Rauschen im Vorschlag |
| `adjustNext(80, a, step)` für `a∈{leicht,schwer}`, `step∈{1.25,2.5,5}` | `|Δ| === step` (nicht nur `<= step` und nicht `0`) | Sprung über eine Stufe / gar keine Bewegung |
| `adjustNext(62.5,'leicht'/'schwer',2.5) % 2.5` | `0` | krumme Gewichte |
| `adjustNext(2.5,'schwer',2.5)` | `>= 2.5` | Gewicht fällt auf 0 oder negativ |
| `adjustNext(60,'weissnicht',2.5)` | `60` | unbekannte Antwort bewegt etwas |
| `summarize(['schwer','schwer','schwer'])` | `{easy:0,ok:0,hard:3,trend:'hard'}` | — |
| `summarize(['leicht','leicht','passend'])` | `{easy:2,ok:1,hard:0,trend:'easy'}` | — |
| `summarize(['leicht','schwer','passend'])` | `{easy:1,ok:1,hard:1,trend:'ok'}` | Trend bei Gleichstand behauptet |
| `summarize(['schwer'])` | `trend:'ok'` | Zwei-Schwelle fehlt ⇒ eine Antwort macht einen Trend |
| `summarize([])` | `{easy:0,ok:0,hard:0,trend:'ok'}` | wirft |

**Verifikation.**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-rpe.test.js
~/.claude/sim-native.sh gymtrack "iPhone 17"
```

Simulator-Prüfliste:

| Schritt | Erwartung | Fängt welchen Fehler |
| --- | --- | --- |
| Satz abhaken | drei Chips **in** der Coach-Leiste, kein Overlay | Gestaltungsregel 2 |
| 8 Sekunden warten, nichts antippen | Chips verschwinden, Training läuft unverändert | Gestaltungsregel 5 |
| „schwer" antippen | Quittung; nächster Vorschlag derselben Übung eine Stufe **niedriger** | `_rpeSuggestNext` nicht verdrahtet |
| „leicht" antippen | eine Stufe **höher** | dito |
| „Satz-Rückfrage" ausschalten | keine Chips mehr | Schalter wirkungslos |
| Während die Chips stehen, weiter Sätze abhaken | **nichts blockiert** | modale Falle |

`xcrun simctl io "iPhone 17" screenshot /tmp/gymtrack-rpe.png`

Commit: `feat(coach): Satz-Rueckfrage leicht/passend/schwer steuert den naechsten Vorschlag`

---

### Task 16: Plateau-Diagnose und Zeitbudget

**Absicht.** Zwei Funktionen, die den Coach von „sagt etwas" zu „hat etwas gesehen" bringen: er erkennt ein Plateau über mehrere Wochen und kann bei knapper Zeit sagen, welche Übungen heute die wichtigen sind. **Beide beschreiben, keine schreibt vor** — Vorschläge zur Änderung des Trainingsplans sind vom Nutzer ausdrücklich gestrichen.

**Schnittstelle.**

| Funktion | Eingabe | Rückgabe |
| --- | --- | --- |
| `CoachAnalyze.plateau(history)` | `[{ts, topKg, vol, avgRestSecs}]`, neueste zuletzt | `{weeks, volDelta, restDelta}` oder `null` |
| `CoachAnalyze.prioritize(exercises, minutes)` | `[{id, name, sets, prio, restSecs?}]` | `{keep: string[], drop: string[]}` |

**Konstanten, die die Anforderung sind:** `MIN_WEEKS = 4`, `SEC_PER_SET = 55` (Ausführung ohne Pause), `REST_DEFAULT = 90`.

**`plateau`-Regel:** unter vier Wochen wird nichts gemeldet. Kein Plateau, wenn am Ende mehr steht als am Anfang. Ein einzelner Ausreißer in der Mitte hebt das Plateau **nicht** auf — sonst meldet das Modul nie etwas. Zurück kommen Beobachtungen (Wochen, Volumen- und Pausenänderung), **keine Empfehlung**.

**`prioritize`-Regel:** nach `prio` sortieren, Kosten je Übung `sets × (SEC_PER_SET + restSecs)`, in das Budget füllen. **Die wichtigste Übung bleibt immer** — ein Trainingsplan ohne eine einzige Übung ist kein Ergebnis, sondern ein Fehler. Kein Eingriff in den gespeicherten Plan, nur in die heutige Durchführung.

**Testfälle** (`test/coach-analyze.test.js`; `hist(n, topKg, restSecs)` baut `n` Wocheneinträge):

| Eingabe | Erwartete Ausgabe | Fängt welchen Fehler |
| --- | --- | --- |
| `plateau(hist(5, 80, 120))` | `{weeks:5, …}` | Plateau nicht erkannt |
| `plateau(hist(6, i => 70+i*2.5, 120))` | `null` | steigende Gewichte als Plateau gemeldet |
| `plateau(hist(3, 80, 120))` / `[]` / `null` | `null` | zu kurze Historie / wirft |
| `plateau(hist(5, 80, i => 150-i*10))` | `restDelta < 0`, konkret `-40` | Vorzeichen vertauscht |
| `hist(5,80,120)` mit `h[2].topKg = 82.5` | weiterhin ein Plateau | einzelner Ausreißer hebt es auf ⇒ Modul meldet nie etwas |
| `hist(5,80,120)` mit `h[4].topKg = 85` | `null` | echte Steigerung als Plateau gemeldet |
| `prioritize(4 Übungen à 3–4 Sätze, 30)` | `keep` enthält `'a'`, `drop.length > 0`, `keep+drop === 4` | Priorität ignoriert / Übungen verschluckt |
| `prioritize(2 Übungen, 120)` | `drop === []`, `keep.length === 2` | streicht bei reichlich Zeit |
| `prioritize(2 Übungen à 4 Sätze, 5)` | `keep.length === 1`, `keep[0] === 'a'` | leeres Ergebnis bei sehr wenig Zeit |
| `prioritize([], 45)` / `prioritize(null, 45)` | `{keep:[],drop:[]}` | wirft |

**Verifikation.**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-analyze.test.js
```

Commit: `feat(coach): Plateau-Diagnose und Zeitbudget, beschreibend statt vorschreibend`

---

### Task 17: Verdrahtung im Training und die Offline-Prüfung

**Absicht.** Alle Module aus Block 3 gehen ans Training. Der Nutzer erlebt danach zum ersten Mal den vollständigen Bogen — und er erlebt ihn **ohne Netz**, weil Kellergyms keins haben.

**Genau eine Fläche**, `#wk-coach-bar` — es entsteht keine einzige neue.

**Schnittstelle** (in `index.html`):

| Funktion | Wann |
| --- | --- |
| `_csGet(wkTs)` / `_csPut(sess)` | Zustand holen/schreiben; `_csGet` gibt `null` bei fremdem `wkTs` |
| `_csEmit(out)` | **der einzige Weg** von einem Modul-`out` auf den Bildschirm |
| `_csStart()` | Trainingsstart |
| `_csExercise(ex)` | Übung geöffnet |
| `_csSet(log)` | Satz abgehakt |
| `_csRest(secs)` | Pausentimer abgelaufen |
| `_csEnd(summary)` | Training beendet |

**Einhängepunkte** (alle in `try/catch`):

| Einhängepunkt | Suchmuster |
| --- | --- |
| `_csStart()` | `grep -n "function startWk\|_saveActiveWk" index.html` |
| `_csExercise(ex)` | Öffnen einer Übung im Training |
| `_csSet(log)` | `function toggleSetDone`, direkt neben dem `_rpeAsk`-Aufruf aus Task 15 |
| `_csRest(secs)` | Ablauf des Pausentimers |
| `_csEnd(summary)` | `function finishWk` |
| `CoachSession.onTick` | bestehender Timer-Tick, **höchstens einmal pro Minute** |

**Verhaltensregeln.**

- `S.coachSession` lebt **rein lokal** (kein Firestore, keine Rules-Berührung) und wird bei fremdem `wkTs` verworfen.
- Neue Meldung verdrängt die vorige — sie stapeln sich nie (Gestaltungsregel 3). Haltezeit: `debrief` 14 s, sonst 9 s.
- Aufwärmschema und Technik-Cue hängen an `_csExercise`, laufen aber **über `CoachSession.emit()`**, damit sie derselben Obergrenze unterliegen. Kein zweiter Ausgabeweg.
- Der Rückblick auf einen eigenen Tipp (`recall`) nutzt das **bestehende** Aktions-Log aus dem Fundament, das bisher nie erzählt wurde.
- Am Ende wird `S.coachSession` auf `null` gesetzt und persistiert.

**Fallstricke.**

- **`save()` existiert nicht → `persist()`.** In dieser Task kommt der Aufruf viermal vor. Im `try/catch` schlägt der `ReferenceError` still fehl und der Sessionzustand wird nie geschrieben — der Coach fängt dann nach jedem Rendern von vorn an zu zählen und reißt die Obergrenze.
- **Fünf Hilfsfunktionen existieren nicht** und werden gegen den echten Code gebaut, nicht erfunden: `_csLastSame()` (letzte Einheit desselben Plantags aus `S.sessions`), `_csExpectedSets()` (Summe der Zielsätze des heutigen Tags), `_coachMutedKinds()` (aus `js/coach-log.js` — die Drosselung nach fünf Ignorierungen existiert bereits), `_coachLastAcceptedTip()` (aus demselben Log), sowie `WK.ts` / `WK.planName`. **`WK` als Zustandsobjekt konnte 2026-07-29 nicht bestätigt werden** (`WK.active` liefert 0 Treffer); die laufende Einheit wird über `isWorkoutActive()` und den Restore-Pfad `gt_active_wk` erkannt. Vor dem Schreiben `grep -n "isWorkoutActive\|gt_active_wk\|_restoreActiveWk" index.html` und die echten Feldnamen einsetzen. Wird kein stabiler `wkTs` gefunden, ist das ein Befund und wird gemeldet — `isStale()` verliert sonst seinen Sinn.

**Verifikation — die Offline-Prüfung ist der eigentliche Punkt dieser Task.**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && npm test
~/.claude/sim-native.sh gymtrack "iPhone 17"
```

Dann das Netz trennen (Simulator-Menü **Features → Network Link Conditioner → 100 % Loss**, oder WLAN am Mac ausschalten) und ein komplettes Training durchspielen:

| Schritt ohne Netz | Erwartung | Fängt welchen Fehler |
| --- | --- | --- |
| Trainingsstart | Begrüßung erscheint | Bogen hängt am Netz |
| Übung öffnen | Ansage **und** Aufwärmschema | `CoachWarmup` nicht verdrahtet |
| Sätze abhaken | Chips, Halbzeit, Ermüdungsmeldung | Trigger nicht verdrahtet |
| Training beenden | Abschluss erscheint | `force` verloren |
| Chat: „Wie lang ist meine Streak?" | Router antwortet sofort | Block 0 regressiert |
| Chat: „Was hältst du von meinem Plan?" | **ein klarer Satz**, dass dafür eine Verbindung nötig ist | roter Fehler / Stacktrace / hängender Ladepunkt |

**Punkt 6 fehlt am ehesten.** Fällt dort heute eine Fehlermeldung an, wird sie durch einen ruhigen Hinweis ersetzt („Dafür brauche ich kurz Internet. Deine Zahlen und Vorschläge laufen auch ohne weiter."), ausgelöst über `navigator.onLine === false`.

**Obergrenze in der echten App belegen:** Profil „Ausgewogen" (`key`), Training mit mindestens sechs Übungen und zwanzig Sätzen. **Mitzählen:** höchstens vier Coach-Äußerungen plus Abschluss. Dasselbe mit „Eng dabei" (`full`): höchstens acht plus Abschluss. Erscheinen mehr, wurde `emit()` irgendwo umgangen.

`xcrun simctl io "iPhone 17" screenshot /tmp/gymtrack-training.png`

Commit: `feat(coach): Erzaehlbogen im Training verdrahtet, offline geprueft`

---

## Blockabschluss 3

Ritual durchlaufen. Changelog-Key: `cl-2026-07-29-coach-training`.

```js
  'cl-2026-07-29-coach-training': {
    label: '29.07.2026 · Der Coach begleitet dein Training',
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

**Zusätzliche Prüfung:** In den Block-3-Dateien darf kein Netzaufruf stehen.

```bash
grep -n "fetch\|AI_WORKER_URL\|XMLHttpRequest" js/coach-session.js js/coach-warmup.js js/coach-cues.js js/coach-rpe.js js/coach-analyze.js
```

Erwartung: **keine Treffer.** Ein Treffer bedeutet, dass Block 3 Geld kostet, und macht den Block nicht abnahmefähig.

---

# Block 4 — Proaktive Meldungen

**Warum jetzt:** Der Coach soll sich melden, wenn die App zu ist. Das ist der Kanal, den Block 5 für den Wochenbericht braucht.

**Warum ohne Server:** Ein Cloudflare-Cron hätte einen Service-Account mit Lesezugriff auf **fremde** Nutzerdokumente gebraucht, Gesundheitsangaben erstmals auf einem Server abgelegt, einen neuen APNs-Token-Pfad unabhängig von `S.socialOn` samt Rules-Erweiterung erfordert und für jeden Nutzer jeden Tag Firestore-Lesevorgänge gekostet. Die Geräte-Variante über `@capacitor/local-notifications` (Version 8, bereits installiert und in Benutzung) erreicht dasselbe Ergebnis. iOS hält den Termin auch bei beendeter App.

**Bekannte Grenze, bewusst akzeptiert:** Eine lokal geplante Notification kennt nur den Stand vom letzten App-Öffnen. Für Erinnerung und Rückkehr-Nudge reicht das genau.

---

### Task 18: `coach-notify.js` — der Frequenz-Deckel

**Absicht.** Der Deckel ist der Grund, warum diese Funktion nicht nach zwei Wochen abgeschaltet wird. Er gilt **vor** der Planung: was nicht durchpasst, wird gar nicht erst eingeplant — nicht erst beim Ausliefern verworfen.

**Schnittstelle.**

| Funktion | Rückgabe |
| --- | --- |
| `notifyNew()` | `{sentTs:{}, dayCount:0, dayKey:'', weekCount:0, weekKey:''}` |
| `weekKey(ts)` | `'2026-W31'` — ISO-8601, zweistellig |
| `dayKey(ts)` | `'2026-07-29'` |
| `mayNotify(state, kind, level, now)` | `boolean` |
| `record(state, kind, now)` | neuer State |
| `planAll(ctx)` | `[{id, at, kind, key, vars}]`, nach Zeit sortiert, Deckel bereits angewandt |
| `CAPS` | `{still:{day:0,week:0}, normal:{day:1,week:4}, eng:{day:2,week:8}}` |
| `COOLDOWN` | Mindestabstand je Art |
| `UNCAPPED` | `['report']` |

**`COOLDOWN` — die Werte sind die Anforderung:** `prCongrats: 0` (ein PR ist ein Ereignis, kein Zustand), `deload: 7 Tage`, `returnNudge: 5 Tage`, `anniversary: 365 Tage`, `reminderPlan: 0`, `report: 6 Tage`.

**`UNCAPPED`:** Der Wochenbericht ist das eine Versprechen, das auch bei `'still'` gilt — deshalb steht er außerhalb des Deckels und zählt auch nicht mit.

**`planAll`-Kandidaten:** `report` (aus `reportAt`), `reminderPlan` (aus `nextWorkout.at`), `returnNudge` (`lastWorkoutTs + 5 Tage`; liegt der in der Vergangenheit, dann `now + 5 Tage` — wer die App öffnet, verschiebt ihn), `deload` (`now + 2 h`), `anniversary` (`now + 4 h`), `prCongrats` (`now + 60 s`).

**Der Kern von `planAll`:** Die Kandidaten laufen durch `mayNotify` mit einem **fortgeschriebenen** Zustand — die Planung zählt sich selbst mit. Ohne das kämen fünf Kandidaten am selben Tag alle durch, weil jeder gegen denselben leeren Zähler prüfte. Termine in der Vergangenheit werden übersprungen. Die `id` ist `kind + ':' + dayKey(at)` — **stabil**, damit ein erneuter Lauf keine Dubletten erzeugt.

**Testfälle** (`test/coach-notify.test.js`; `T0` = Mittwoch 2026-07-29 10:00 UTC):

| Eingabe | Erwartete Ausgabe | Fängt welchen Fehler |
| --- | --- | --- |
| `weekKey(Date.UTC(2026,0,5))` | `'2026-W02'` | führende Null / Off-by-one |
| `weekKey(Date.UTC(2027,0,1))` | passt auf `/^20(26\|27)-W\d{2}$/` | Jahreswechsel: der 1.1. gehört oft zur Vorjahreswoche |
| `dayKey(T0)` | `/^\d{4}-\d{2}-\d{2}$/` | — |
| `mayNotify(neu,'report','still',T0)` | `true` | Versprechen gebrochen |
| `mayNotify(neu, k, 'still', T0)` für `k ∈ {reminderPlan, prCongrats, deload, returnNudge, anniversary}` | jeweils `false` | „Still" ist nicht still |
| `record(neu,'prCongrats',T0)`, dann `mayNotify(…,'deload','normal',T0+1h)` | `false` | Tagesdeckel `normal` |
| bei `'eng'` dieselbe Folge | zweite `true`, dritte `false` | Tagesdeckel `eng` |
| nach `record(…,T0)`, `mayNotify(…,T0+1 Tag)` | `true` | Tageszähler läuft nicht zurück |
| vier verschiedene Arten an vier Tagen, dann fünfte bei `'normal'` | `false` | Wochengrenze greift nicht |
| dieselbe Folge, dann `T0 + 8 Tage` | `true` | Wochenzähler läuft nicht zurück |
| `record(…,'prCongrats',T0)`, dann `mayNotify(…,'report','normal',T0+1h)` | `true` | Bericht gegen den Deckel gerechnet |
| `record(…,'anniversary',T0)`, dann `+200 Tage` / `+370 Tage` | `false` / `true` | Cooldown 365 |
| `record(…,'returnNudge',T0)`, dann `+2 Tage` / `+6 Tage` | `false` / `true` | Cooldown 5 |
| `planAll({level:'still', …})` | `length===1`, `plan[0].kind==='report'` | Deckel wird erst beim Senden geprüft |
| `planAll({level:'normal', viele Kandidaten})` | pro Kalendertag **höchstens ein** Nicht-`report`-Eintrag | fortgeschriebener Zustand fehlt |
| `planAll(…)` | `at` monoton steigend | unsortiert ⇒ Deckel greift in falscher Reihenfolge |
| `planAll` mit `nextWorkout.at < now`, `reportAt < now` | **jedes** `p.at > now` | Termin in der Vergangenheit |
| `planAll(c)` zweimal mit gleichem `c` | gleiche `id`-Liste, alle `id` eindeutig | Dubletten bei erneutem Lauf |

**Verifikation.**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-notify.test.js
```

Commit: `feat(coach): Frequenz-Deckel fuer proaktive Meldungen`

---

### Task 19: Meldungen planen und ausliefern

**Absicht.** Der Nutzer bekommt eine Trainings-Erinnerung, die sagt, **was ansteht** („Heute Push — Bank 3 × 8 @ 62,5") statt „Zeit fürs Gym", eine PR-Gratulation am selben Tag, einen einzelnen Rückkehr-Nudge nach fünf Tagen und einmal im Jahr einen Rückblick — alles auf dem Gerät geplant, gedeckelt, ohne Server.

**Schnittstelle.**

| Funktion | Verhalten |
| --- | --- |
| `_cnSync()` | verwirft zuerst die **eigenen** alten Termine, plant dann alles neu, schreibt die Zähler fort |
| `_cnPermission()` | fragt die Berechtigung, **nur** vom Hub aus aufgerufen |
| `CN_ID_BASE` | `47000` — eigener Nummernraum, 47000–47999 |
| `_cnIdFor(id)` | stabile Zahl aus der Text-`id` (LocalNotifications verlangt Integer) |

**Der eigene Nummernraum ist nicht optional.** `@capacitor/local-notifications` wird bereits für die Trainings-Erinnerung und den Pausen-Timer benutzt; ein pauschales `cancel()` würde den laufenden Pausen-Timer mit abräumen. Bestehende ids sind `1000` und `1000+i` (verifiziert 2026-07-29) — 47000–47999 ist frei.

**Notification-Aufbau:** Titel = `_coachName()` (genau hier zahlt sich Block 1 aus), Body = `_say(key, vars)`, `extra: { coachKind }`.

**Aufrufe einhängen:**

| Wann | Warum |
| --- | --- |
| App-Start, nach dem Laden von `S` | setzt den Rückkehr-Nudge neu — wer die App öffnet, verschiebt ihn |
| Ende von `finishWk()` | neue Erinnerung, PR-Gratulation, Deload-Prüfung |
| nach `setAiCoachOpt('pushLevel', …)` | die neue Stufe gilt sofort, nicht erst morgen |

**Berechtigung.** Wird beim Wechsel der Push-Stufe **weg von** `'still'` erfragt — an der Stelle, an der der Nutzer versteht, wofür, **nicht** beim ersten App-Start. Verweigert er, springt die Auswahl auf den vorigen Wert zurück und ein ruhiger Hinweis erscheint („Ohne Mitteilungen meldet sich dein Coach nur in der App."). **Kein Fehler.** Ohne Berechtigung bleibt `_cnSync()` still.

**Berührte Stellen.**

- Skript-Tag `js/coach-notify.js`.
- `grep -n "LocalNotifications" index.html` — bestehende Nutzung ansehen, bevor etwas geplant wird.
- `grep -n "function finishWk" index.html`.
- Bestehende generische Erinnerung: `grep -n "Zeit fürs\|notifTime\|notifEnabled" index.html`. **Die alte Planung wird entfernt**, sonst laufen zwei Erinnerungen für denselben Termin auf.

**Fallstricke.**

- **`save()` → `persist()`** (dritte Stelle in diesem Plan).
- Sechs Hilfsfunktionen gegen den echten Code bauen, nicht erfinden: `_cnNextWorkout()`, `_cnLastWorkoutTs()`, `_cnReportAt()`, `_cnWeekVol()`, `_cnDeloadDue()`, `_cnAnniversary()`.
- Für `_cnDeloadDue()` die **vorhandene** Readiness-Logik `_ciReadiness()` benutzen — keine zweite Erholungsrechnung danebenstellen.
- `_cnAnniversary()` sucht in `S.sessions` nach einer Einheit vor 365 ± 3 Tagen und vergleicht das damalige Topgewicht mit dem heutigen. **Nur melden, wenn der Fortschritt vorzeigbar ist** — bei gleichem oder niedrigerem Gewicht `null`. Ein Jahresrückblick, der Stillstand feiert, ist schlimmer als keiner.
- `_dndToast(...)` existiert bereits für den Hinweistext — nicht neu bauen.

**Testfälle** (Simulator; kein Node-Test, Plugin-nah):

| Schritt | Erwartung | Fängt welchen Fehler |
| --- | --- | --- |
| Push-Stufe „Still" → „Normal" | Berechtigungsdialog erscheint | Berechtigung beim App-Start erfragt |
| Ablehnen | Auswahl springt zurück auf „Still", Hinweis erscheint, **kein** Fehler | harter Fehlerpfad |
| Annehmen, dann `LocalNotifications.getPending()` | Termine mit `id >= 47000`, Titel = Coach-Name, Body mit konkretem Inhalt | generischer Text geblieben |
| Pausen-Timer starten, dann `_cnSync()` aufrufen | **Pausen-Timer läuft weiter** | pauschales `cancel()` — die Prüfung des Nummernraums |
| Stufe „Still" wählen | in `getPending()` nur noch der Wochenbericht | `UNCAPPED` falsch angewandt |
| Termin auf `Date.now()+15000` vorziehen, App in den Hintergrund, 15 s warten | Mitteilung auf dem Sperrbildschirm, Coach-Name als Titel | Zustellung/Titel kaputt |
| App neu starten, `getPending()` | keine Dubletten | `id` nicht stabil |

**Verifikation.**

```bash
grep -n "LocalNotifications.schedule\|id: *[0-9]" index.html | head -20
xcrun simctl io "iPhone 17" screenshot /tmp/gymtrack-notify.png
```

Jede andere Notification-id muss außerhalb von 47000–47999 liegen.

Commit: `feat(coach): proaktive Meldungen auf dem Geraet geplant, gedeckelt`

---

## Blockabschluss 4

Ritual durchlaufen. Changelog-Key: `cl-2026-07-29-coach-meldet-sich`.

```js
  'cl-2026-07-29-coach-meldet-sich': {
    label: '29.07.2026 · Dein Coach meldet sich, auch wenn die App zu ist',
    items: [
      'Die Trainings-Erinnerung sagt jetzt, was ansteht: „Heute Push — Bank 3 × 8 @ 62,5" statt „Zeit fürs Gym"',
      'Nach einem neuen Bestwert gratuliert er dir noch am selben Tag',
      'Bleibst du fünf Tage weg, meldet er sich einmal. Öffnest du die App, verschiebt sich das von selbst',
      'Einmal im Jahr zeigt er dir, wo du vor zwölf Monaten standest',
      'Du bestimmst, wie oft: gar nicht, höchstens einmal am Tag oder bis zu zweimal',
    ]
  },
```

---
# Block 5 — Wochenbericht

**Warum zuletzt:** Er braucht den Persona-Ton aus Block 1 und den Notification-Kanal aus Block 4.

**Kosten: ein LLM-Aufruf pro Woche und Nutzer** — rund 0,0017 $, also 4–5 Aufrufe im Monat für unter einem Cent. Die Zahlen selbst sind algorithmisch; das Modell liefert nur drei Sätze Einordnung.

**Der Kniff:** Der Bericht wird **vorgezogen** erzeugt — beim letzten App-Öffnen vor dem Sonntagabend-Termin. Die Notification wird dann mit dem **fertigen Text** geplant, sodass auf dem Sperrbildschirm die echte Zusammenfassung steht und nicht „Dein Bericht ist fertig, tippe hier".

---

### Task 20: `coach-report.js` — Zahlen und Ziel-Prognose

**Absicht.** Nach dieser Task hat der Nutzer die Zahlen seiner Woche — Volumen, Sätze, Einheiten, Verteilung, Vergleich zur Vorwoche — und, wenn ein Ziel gesetzt ist und der Trend trägt, eine Angabe, wann er es erreicht. **Die Prognose darf nie als Zusage klingen und erscheint lieber gar nicht als auf dünner Grundlage.**

**Schnittstelle.**

| Funktion | Eingabe | Rückgabe |
| --- | --- | --- |
| `weekNumbers(sessions, weekStartTs)` | `[{ts, sets:[{ex, muscle, kg, reps, pr?}]}]` | `{vol, sets, workouts, prs, muscles, prevVol, volDelta, streak}` |
| `goalForecast(history, goalKg, now)` | `[{ts, kg, reps}]` je Kalenderwoche | `{weeks, goalKg, currentKg}` oder `null` |
| `epley1rm(kg, reps)` | | `kg × (1 + reps/30)`, `0` bei `kg<=0` |
| `weekStart(ts)` | | Montag 00:00 lokal |

`streak` wird im Modul auf `0` gesetzt und von `index.html` aus dem vorhandenen Streak-Wert gefüllt.

**Konstanten, die die Anforderung sind:** `MIN_WEEKS = 4`, `MAX_FORECAST_WEEKS = 52` (weiter als ein Jahr voraus ist Kaffeesatz), `MIN_R2 = 0.7`.

**`goalForecast` — lineare Regression über die geschätzten Maxima, bewusst streng.** Sie liefert `null`, wenn: weniger als vier Wochen vorliegen, kein Ziel gesetzt ist, die Steigung nicht positiv ist, das Bestimmtheitsmaß unter `0.7` liegt (ein Zickzack mit zufällig positiver Steigung ist kein Trend), das Ziel schon erreicht ist, oder die Prognose über 52 Wochen hinausreicht.

**Hinweis zu Epley:** bei einer Wiederholung ergibt die Formel `kg × (1 + 1/30)` = 103,3 bei 100 kg — nicht 100. Das ist die Formel, nicht ein Fehler; der Test hält den Wert fest, damit niemand sie später „korrigiert".

**Testfälle** (`test/coach-report.test.js`; `MO` = Montag der Testwoche):

| Eingabe | Erwartete Ausgabe | Fängt welchen Fehler |
| --- | --- | --- |
| `epley1rm(100,1)` | `≈103.33` (auf zwei Stellen) | Formel „korrigiert" |
| `epley1rm(100,5)` | `≈116.67` — **exakt**, nicht `> 110` | Nenner verändert |
| `epley1rm(0,5)` | `0` | Division/Unsinn bei leerem Gewicht |
| `weekStart(Mittwoch 15:30)` | `getDay()===1`, Uhrzeit `00:00`, `<=` Eingabe | Sonntag als Wochenstart |
| `weekNumbers(S3, MO)` | `workouts===2`, `sets===3`, `vol===60*8*2+100*5` | Woche falsch abgegrenzt |
| dito | `prevVol===55*8`, `volDelta===vol-prevVol` | Vorwoche nicht oder falsch gerechnet |
| dito | `muscles.brust===960`, `muscles.beine===500` | Muskelzuordnung verloren |
| `weekNumbers([], MO)` | alle Zahlen `0`, `muscles==={}` | `undefined` statt `0` in der Anzeige |
| Eintrag mit `pr:true` | in `prs` enthalten | PR fällt raus |
| `goalForecast(6 Wochen +2.5/Woche, 130, MO)` | `{weeks: n}` mit `0 < n < 100`, `goalKg===130` | Prognose fehlt bei klarem Trend |
| `goalForecast(3 Wochen, …)` / `[]` / `null` | `null` | Prognose auf dünner Grundlage |
| `goalForecast(8 Wochen ±0, 130, MO)` | `null` | Stillstand als Fortschritt |
| `goalForecast(8 Wochen −2/Woche, 150, MO)` | `null` | fallender Trend prognostiziert |
| `goalForecast(6 Wochen +2.5, 90, MO)` (Ziel schon erreicht) | `null` | „noch 0 Wochen" |
| Zickzack 80/95/78/99/82/97, Ziel 150 | `null` | **die wichtigste Zusicherung**: bei diesem Verlauf darf nichts versprochen werden |
| `goalForecast(6 Wochen +0.5, 300, MO)` | `null` | Prognose über 52 Wochen hinaus |

**Verifikation.**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-report.test.js
```

Besonders „unruhiger Verlauf ergibt keine Prognose" muss halten — das ist der Test, der verhindert, dass der Coach etwas verspricht.

Commit: `feat(coach): Wochenzahlen und Ziel-Prognose mit Guetepruefung`

---

### Task 21: Bericht erzeugen, planen, anzeigen

**Absicht.** Sonntagabend liegt eine echte Zusammenfassung auf dem Sperrbildschirm — nicht eine Einladung, sie abzurufen. Antippen führt in die Langfassung im Hub; die letzten acht Wochen bleiben nachlesbar.

**Schnittstelle.**

| Funktion | Verhalten |
| --- | --- |
| `_crBuild()` | `Promise<report\|null>` — erzeugt den Bericht der laufenden Woche, idempotent je `weekKey` |
| `_crMaybePrepare()` | prüft beim App-Start, ob vorgezogen erzeugt werden muss |
| `S.coachReports` | `[{weekKey, label, numbers, text, forecast, ts}]`, **höchstens 8**, neueste zuerst |
| `S.coachReportAt` | `{day: 0, hour: 18}` — 0 = Sonntag |

**`_crBuild`-Regeln.** Existiert für die Woche schon ein Bericht, wird er zurückgegeben statt neu erzeugt. **Eine Woche ohne Training braucht keinen Bericht** → `null`. Die Prognose nur, wenn ein Ziel gesetzt ist **und** der Trend trägt. Fällt der Modellaufruf aus (kein Netz, Budget-Deckel), bleibt der Bericht trotzdem stehen — nur ohne Einordnung.

**`_crAskModel(n, forecast)` schickt ausschließlich die Zahlen** an den bestehenden `/chat`-Endpunkt — keine Dossier-Inhalte, keine Rohdaten. Der Prompt enthält `CoachPersona.personaLine()` und die Anweisung: **genau drei Sätze, keine Emojis, keine Zusagen über die Zukunft.**

**Vorgezogene Erzeugung.** Liegt der Berichtstermin in den nächsten **36 Stunden**, wird der Bericht jetzt erzeugt und die Notification mit dem **ersten Satz des fertigen Textes** als Body geplant. Wurde die App im Zeitfenster nie geöffnet, greift der Einladungstext aus `CoachNotify.planAll` und der Bericht entsteht beim Antippen — das ist der bewusst akzeptierte Rückfall.

**Antippen führt in den Hub:** im bestehenden Notification-Handler auf `extra.coachKind === 'report'` prüfen, `_crBuild()` nachholen (falls die App im Fenster nie offen war), dann `openCoachHub('report')`.

**Hub-Bereich „Woche".** Der Platzhalter aus Task 9 wird ersetzt durch: Label, Einordnungstext, Zeilen für Einheiten / Sätze / Volumen / Differenz zur Vorwoche / Streak, dann — nur falls vorhanden — Ausblick, Verteilung nach Muskelgruppen (absteigend sortiert) und die früheren Wochen. **Jeder leere Abschnitt entfällt vollständig**, kein leerer Rahmen.

**Der Prognose-Satz** kommt aus `_say('forecast', …)` und enthält in allen vier Tönen eine Bedingung („wenn es so weiterläuft") und **nie** eine Zusage. Das wird in Task 6 formuliert und hier geprüft.

**Berührte Stellen.**

- Skript-Tag `js/coach-report.js`.
- `grep -n "const AI_WORKER_URL" index.html` — der Berichtsaufruf läuft über den bestehenden Weg, kein neuer Endpunkt.
- Notification-Handler: `grep -n "localNotificationActionPerformed\|addListener" index.html`.
- App-Start: `_crMaybePrepare()` mit **2,5 s Verzögerung** in `try/catch` aufrufen — das hält den Netzaufruf aus dem Startpfad heraus.

**Fallstricke.**

- **`save()` → `persist()`** (vierte Stelle).
- `_crSessions()`, `_crStreak()`, `_crGoal()`, `_crHistory(ex)`, `_crLabel(ws)` gegen den echten Code bauen. **`_crHistory(ex)` liefert je Kalenderwoche das beste `{ts, kg, reps}` dieser Übung** — nicht jeden Satz, sonst rechnet die Regression auf Rauschen und `MIN_R2` schlägt immer zu.
- Der Cache aus Task 2 greift hier **nicht**: der Berichtsaufruf ist personenbezogen und wird vom Klassifikator korrekt abgelehnt. Das ist richtig so — er darf nie in den geteilten Cache.

**Testfälle** (Simulator-Konsole):

| Eingabe | Erwartete Ausgabe | Fängt welchen Fehler |
| --- | --- | --- |
| `await _crBuild()` | Objekt mit `numbers`; `text` hat **genau drei Sätze**, keine Emojis | Prompt-Vorgabe wirkungslos |
| `await _crBuild()` zweimal | zweiter Aufruf liefert dasselbe Objekt, `S.coachReports.length` unverändert | doppelter Modellaufruf pro Woche |
| Hub → „Woche" | Zahlen, Einordnung, Verteilung erscheinen | Renderer nicht ersetzt |
| Ziel gesetzt + stabiler Trend | Ausblick erscheint **und enthält eine Bedingung**, keine Zusage | Satzkatalog verspricht |
| ohne Ziel / unruhiger Verlauf | Ausblick **fehlt vollständig** | leerer Abschnitt |
| Netz trennen, `await _crBuild()` | Bericht entsteht, `text === ''`, **kein** Fehler | Modellaufruf ist Pflichtpfad |
| Woche ohne Training | `null`, kein Eintrag | leerer Bericht |
| `S.coachReportAt` auf „in einer Stunde", `_crMaybePrepare()`, dann `getPending()` | `body` trägt die **echte Zusammenfassung** | „Dein Bericht ist fertig" geblieben |
| neun Wochen künstlich anlegen | `S.coachReports.length === 8` | Archiv wächst unbegrenzt |
| Bericht-Notification antippen | Hub öffnet auf „Woche" | Handler nicht verdrahtet |

`xcrun simctl io "iPhone 17" screenshot /tmp/gymtrack-report.png`

Commit: `feat(coach): Wochenbericht vorgezogen erzeugt, Langfassung im Hub`

---

### Task 22: Datentrennung und Kontowechsel

**Absicht.** Die Spec verlangt ausdrücklich: *„kein Schreibpfad nach `profiles/`; Kontowechsel setzt Persona und Session-Zustand zurück."* Dieses Vorhaben hat sechs neue Zustandsfelder eingeführt. Nach dieser Task begrüßt der Coach ein neues Konto nicht mit dem Namen und den Zahlen des vorigen.

Diese Prüfung steht bewusst **am Ende und an einer Stelle**, nicht sechsmal unterwegs.

**Schnittstelle.** Keine neue API.

**Was beim Abmelden wohin gehört:**

| Feld | Wo | Beim Abmelden |
| --- | --- | --- |
| `S.aiCoach` (Persona) | Firestore, whitelisted | **zurücksetzen** auf die Defaults, `preset: undefined` |
| `S.coachSession` | nur lokal | **löschen** |
| `S.coachPush` | nur lokal | **löschen** + geplante Notifications 47000–47999 verwerfen |
| `S.coachReports` | nur lokal | **löschen** — enthält die Zahlen des vorigen Kontos |
| `S.coachReportAt` | nur lokal | zurücksetzen auf `{day:0, hour:18}` |
| Dossier | uid-gekoppelt in `localStorage` | **bleibt** — bereits uid-gebunden, kein Handlungsbedarf |

`preset: undefined` ist Absicht: das nächste Konto durchläuft die Einrichtung neu und entscheidet selbst über den Umfang.

**Berührte Stellen.** `grep -n "signOut\|function logout\|_authLogout" index.html`

**Fallstricke.**

- **`save()` → `persist()`** (fünfte und letzte Stelle).
- Das Verwerfen der Notifications läuft über denselben Nummernraum-Filter wie `_cnSync()` — **kein pauschales `cancel()`**, sonst stirbt der Pausen-Timer.
- Der Abmelde-Pfad kann synchron sein; die Notification-Aufräumung ist asynchron. Sie darf das Abmelden nicht blockieren und läuft in `try/catch`.

**Verifikation — zwei Greps und eine Kontowechsel-Runde.**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack
grep -n "setDoc\|updateDoc\|addDoc\|deleteDoc" index.html | grep -i "profile\|coach\|persona\|report\|notify"
grep -n "firestore\|setDoc\|firebase" js/coach-*.js
```

Erwartung: erster Befehl **kein** Treffer außerhalb von `_pushSocialProfile()` und dem bestehenden Dossier-Push; zweiter Befehl **leer**. Jeder weitere Treffer ist ein neuer Schreibpfad und muss weg.

| Schritt | Erwartung | Fängt welchen Fehler |
| --- | --- | --- |
| Konto A: Coach „Nina", Ton „hart", Profil „Eng dabei", Training, Bericht | — | — |
| Abmelden, Konto B anmelden, Heute-Tab | Karte zeigt „Coach", **nicht** „Nina" | Persona nicht zurückgesetzt |
| Hub öffnen | Einrichtung startet | `preset` nicht auf `undefined` |
| Hub → „Woche" | leer, **nicht** die Zahlen von Konto A | Berichte nicht gelöscht |
| Konsole | `S.coachSession` und `S.coachPush` sind `null` | dito |
| `getPending()` | keine Termine 47000–47999 | Notifications überleben den Kontowechsel |
| zurück auf Konto A | Persona kommt per Cloud-Sync zurück („Nina", „hart"); lokale Felder bleiben leer | Sync gebrochen — die lokalen Felder sind bewusst nicht synchronisiert |

Commit: `fix(coach): Coach-Zustand beim Kontowechsel vollstaendig zuruecksetzen`

---

## Blockabschluss 5

Ritual durchlaufen. Changelog-Key: `cl-2026-07-29-coach-wochenbericht`.

```js
  'cl-2026-07-29-coach-wochenbericht': {
    label: '29.07.2026 · Jeden Sonntag: deine Woche',
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

---

## Kostenmodell — korrigiert gegenüber v1

**v1 rechnete mit 0,30 $ je Nutzer und Monat, davon 0,30 $ von 2,75 $ Netto-Erlös, und setzte für den Antwort-Cache eine spürbare Ersparnis an. Diese Ersparnis ist so nicht eingetreten.**

Der Cache aus Task 2 ist bei der Umsetzung deutlich enger geworden, als v1 gerechnet hat, und zwar aus drei Gründen, die alle richtig sind:

1. **Nur der erste Turn eines Chats ist cachefähig.** Alles ab Turn 2 hängt an der Gesprächshistorie und darf nicht unter einem Schlüssel abgelegt werden, der sie nicht kennt. In einem Chat mit fünf Nachrichten ist also höchstens eine cachefähig.
2. **Der Klassifikator ist deutlich strenger geworden.** Zusätzlich zu Possessiv- und Zeitbezug schlagen jetzt Ich-plus-Modalverb, Körper- und Verletzungsbegriffe sowie alle Plan-Wortstämme an. Das war nötig — die v1-Fassung stufte 44 von 47 personenbezogenen Fragen fälschlich als cachebar ein — kostet aber Trefferquote.
3. **Cachefähige Anfragen laufen mit einem entkernten Prompt.** Ohne Dossier, ohne Sessions, ohne Übungsnamen. Das senkt zwar die Kosten *dieser* Anfrage zusätzlich, heißt aber auch: die Anfrage, die gecacht wird, war ohnehin die billigste. Die teuren, kontextreichen Anfragen sind genau die, die nie in den Cache kommen.

**Ehrliche Einordnung: Die Cache-Ersparnis ist ein Bonus, kein tragender Posten der Rechnung.** Wie groß sie ist, weiß niemand vor dem Betrieb — sie hängt davon ab, wie viele Nutzer wie oft eine sachliche Erstfrage stellen, die ein anderer schon gestellt hat. **Der Plan setzt sie mit „unbekannt, vermutlich klein" an und nicht mit einer Zahl.**

Was dagegen belastbar ist:

| Posten | Wert | Grundlage |
| --- | --- | --- |
| Netto-Erlös je Monatsabo | ≈ 2,75 $ | 2,99 € − 15 % Apple = 2,54 € |
| `USD_PER_USER` | 0,30 $ | 11 % des Netto-Erlöses |
| Ein Nutzer, der seine 150 Anfragen komplett ausreizt | ≈ 0,22 $ | Modellpreis × durchschnittliche Prompt-Größe |
| Deckel-Sockel `MIN_MONTHLY_USD` | 25 $ | entspricht dem alten festen Deckel; Break-even bei ~84 Köpfen |
| Block 3 | 0 $ | vollständig algorithmisch |
| Block 5 | ≈ 0,0017 $ je Woche und Nutzer | ein Aufruf, drei Sätze |

**Der tragende Kostenhebel ist der Router (Tasks 3 und 4), nicht der Cache.** Jede Frage, die lokal beantwortet wird, kostet garantiert nichts — unabhängig davon, ob ein anderer Nutzer sie schon gestellt hat.

**Nach zwei Wochen Betrieb ablesen, nicht behaupten:**

```bash
curl -s "https://gymtrack-ai.wolterlenny362.workers.dev/admin-stats?idToken=<FOUNDER_ID_TOKEN>" | head -c 800
```

Abzulesen: `premiumHeads`, `budgetUsd`, die tatsächlichen Kosten des Monats. Liegen die Kosten je Nutzer über 0,30 $, greift **zuerst der Router-Ausbau** (mehr Fragen lokal), dann die Cache-TTL — nicht das Modell wechseln.

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
| 0 Kosten-Fundament | 1–5 (1 und 2 **erledigt**) | `coach-cache.js` ✓ | 14 gebaut, ~17 offen | senkt |
| 1 Persona + Hub + Einrichtung | 6–10 | `coach-persona.js` | ~15 | 0 |
| 2 Stimme | 11–12 | `coach-voice.js`, `TtsPlugin.swift` | ~11 | 0 |
| 3 Tiefe im Training | 13–17 | `coach-session.js`, `coach-warmup.js`, `coach-cues.js`, `coach-rpe.js`, `coach-analyze.js` | ~52 | **0** |
| 4 Proaktive Meldungen | 18–19 | `coach-notify.js` | ~18 | 0 |
| 5 Wochenbericht + Datentrennung | 20–22 | `coach-report.js` | ~17 | ~0,007 $/Monat |

Stand bei Planerstellung: **92 Tests grün** (Ausgangsstand vor Block 0 waren 78). Zielstand: rund 220.

**Die wichtigste Zahl im ganzen Plan** steht in Block 3: die Obergrenze von vier beziehungsweise acht Äußerungen je Trainingseinheit. Zwölf Trigger sind gebaut, höchstens acht kommen durch. Ein Coach, der alles sagt, was er weiß, wird abgeschaltet.

**Die zweitwichtigste Erkenntnis** steht in diesem Plan an fünf Stellen: `save()` gibt es in dieser Codebasis nicht. Sie heißt `persist()`. Jeder `save()`-Aufruf scheitert still in einem `try/catch` und der Zustand geht verloren.
