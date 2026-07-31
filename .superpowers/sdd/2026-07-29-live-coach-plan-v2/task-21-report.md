# Task 21 — Report: Bericht erzeugen, planen, anzeigen

Stand: Arbeitsbaum `C:/Users/Anwender/Desktop/Claude/gymtrack`, Branch `main`.
Rot-Lauf gegen `git archive HEAD` (Stand vor der Änderung) im Scratchpad.

---

## 1. Getroffene Anker

| Anker | Fundstelle vorher | Was daraus wurde |
| --- | --- | --- |
| Skript-Registrierung | `index.html:5712` (`coach-notify.js`), `build.js:10`, `sw.js` SHELL | `js/coach-report.js` **nach** `coach-analyze` eingehängt (die Prognose braucht `isoWeekIndex`), in `build.js` und im SHELL-Precache. `CACHE` (sw.js:2) und `APP_VERSION` **unberührt** — eigener Ritualschritt. |
| Zustandsfelder | `S.coachPush`-Block (`index.html`, Init) | `S.coachReports` (Array, max. 8) und `S.coachReportAt` (`{day:0, hour:18}`) daneben, beide beim Start normalisiert. **Nicht** im `_pushToCloud()`-Payload. |
| Berichtstermin | `_cnReportAt(now)` — Sonntag **19 Uhr fest verdrahtet** | liest jetzt `S.coachReportAt`. Standard bleibt Sonntag, Stunde 18 — dieselbe Quelle wie die Anzeige („der fertige Bericht kommt am Sonntag um 18 Uhr"). Zwei Zahlen für denselben Termin wären beim ersten Verstellen auseinandergelaufen. |
| Meldungstext | `_cnSyncRun()`, `const body = _cnText(e.key, e.vars)` | `e.kind === 'report'` holt zuerst `_crNotifBody(e.at)` (erster Satz des fertigen Textes); der Katalogsatz bleibt der Rückfall. |
| Hub-Reiter „Woche" | `_chReportHTML()` — Platzhalter aus Task 9 | vollständig ersetzt (Label, Einordnung, fünf Zahlenzeilen, Bestwerte, Ausblick, Schwerpunkte, frühere Wochen). |
| Modellweg | `AI_WORKER_URL` / `aiCall('chat', …)` (`index.html:23829` / `:23981`) | `_crAskModel()` benutzt den **bestehenden** `/chat`-Weg. Kein neuer Endpunkt, kein `fetch` im Block. Kein Cache-Hinweis (`cacheable`/`cacheKey`) — der Aufruf ist personenbezogen und gehört nie in den geteilten Cache. |
| Notification-Handler | **existierte nicht** (`grep -n "localNotificationActionPerformed\|addListener"` fand nur Push- und App-State-Listener) | neu im `if (_isNative())`-Startblock: `extra.coachKind === 'report'` → `_crBuild()` nachholen → `openCoachHub('report')`. |
| App-Start | `setTimeout(… _cnSync() …, 1200)` | `setTimeout(… _crMaybePrepare() …, 2500)` direkt danach, in `try/catch`. Nach dem Sync, sonst plante der Sync gegen einen Bericht, den es noch nicht gibt. |

Neue Funktionen (alle im Block `── Woche: der Wochenbericht (Block 5, Task 21)`):
`_crWeekKey`, `_crSessions`, `_crStreak`, `_crHistory`, `_crGoal`, `_crLabel`,
`_crTerminText`, `_crClean`, `_crSignedIn`, `_crAskModel`, `_crBuild`/`_crBuildRun`,
`_crNotifBody`, `_crMaybePrepare`, `_crCurrent`, `_crRow`, `_crDeltaText`,
`_crLeerHTML`, `_crArchivHTML`, `_chReportHTML`.

---

## 2. Entscheidung zum Wochenschlüssel — mit Beleg

**Entschieden: `getWeekKey()` bleibt unangetastet. Der Bericht rechnet ausschließlich ISO über `CoachAnalyze.isoWeekKey`. Die beiden Formate werden nirgends gemischt.**

Beleg, dass `getWeekKey()` ein **Speicherschlüssel** ist und keine reine Anzeige:

| Fundstelle | Verwendung |
| --- | --- |
| `index.html:12882` `incrementTracker` | `S.trackerCounts[id][wk] = cur + 1; persist();` |
| `index.html:12954` `decrementTracker` | `S.trackerCounts[id][wk] = cur - 1; persist();` |
| `index.html:9325` `_consumeWidgetDeltas` | schreibt `S.trackerCounts[id][wk]` aus den Widget-Taps |
| `_pushToCloud()`-Payload | `trackerCounts: S.trackerCounts || {}` — der Schlüssel steht **in Firestore** |
| `index.html:20887` `_weekStats` → `_pushSocialProfile` | `week: { key: getWeekKey(), … }`; Freundeskarten vergleichen `p.week.key === wk` (`:21775`, `:22305`, `:23645`) |

Konsequenz einer Umstellung: jeder bestehende Tracker-Ring (lokal **und** in der Cloud) läge unter `2026-W5`, gelesen würde `2026-W05` — alle Ringe sprängen auf null. Zusätzlich bräche der Freundevergleich während des Rollouts: ein Gerät auf dem neuen Stand schriebe `2026-W05`, ein Freund auf dem alten `2026-W5`, und beide sähen einander als „diese Woche nichts gemacht".

Eine Migration wäre möglich (`S.trackerCounts` umschlüsseln), aber **nicht testbar** im geforderten Sinn: die Cloud-Seite und der Mischbetrieb mit alten Clients lassen sich hier nicht nachfahren. Deshalb keine Migration — die Regel des Briefs („eine Migration nimmst du nur vor, wenn du sie testen kannst") greift.

Absicherung gegen ein späteres Versehen: der statische Check 20 im Prüfskript liest den kommentarfreien Task-21-Block und verlangt `CoachAnalyze.isoWeekKey` **und** kein `getWeekKey` darin.

Zusatz, den die reine Wahl „ISO" noch nicht erledigt: `isoWeekKey` rechnet in **UTC**, `CoachReport.weekStart` liefert den **lokalen** Montag. Für UTC+2 fiele ein Montag 00:30 in UTC noch in die Vorwoche — der Bericht der frischen Woche landete unter dem Schlüssel der alten. `_crWeekKey(ts)` rechnet deshalb über **Donnerstag 12:00 der lokalen Woche**; das liegt bei jedem Versatz bis ±14 h sicher in derselben ISO-Woche.

---

## 3. Wie die Fläche aussieht, wenn die Prognose schweigt

`goalForecast()` liefert `null` bei: weniger als vier Kalenderwochen, Steigung ≤ 0,
r² < 0,7, bereits erreichtem Ziel, mehr als 52 Wochen Horizont — und `_crGoal()`
liefert `null`, wenn gar kein Ziel gesetzt ist.

**Dann entfällt der Abschnitt „Ausblick" vollständig.** Kein Rahmen, keine
Überschrift, keine Zeile, keine Ersatzzahl. Der Bericht endet nach den
Zahlenzeilen (und, falls vorhanden, Bestwerten und Schwerpunkten). Gemessen in
Check 6 und 7: `/Ausblick|Outlook/` kommt im gerenderten Text **nicht** vor,
während der übrige Bericht mit über 40 Zeichen steht und weder `NaN` noch
`undefined` enthält.

Die drei weiteren „ehrlichen Flächen":

| Lage | Was der Nutzer sieht |
| --- | --- |
| Woche ohne Einheit (auch: allererste Woche) | Geisterkarte: „Diese Woche steht noch keine Einheit." + „Sobald du trainierst, stehen hier deine Zahlen — der fertige Bericht kommt am Sonntag um 18 Uhr." Kein Eintrag in `S.coachReports`, kein Modellaufruf. |
| Zahlen stehen, Bericht noch nicht fällig | Zwischenstand-Karte: „Zwischenstand. Der fertige Bericht kommt am Sonntag um 18 Uhr." darüber die echten Zahlen. |
| Bericht steht, Einordnung fehlt (kein Netz, kein Budget) | Zahlen ohne Textkarte — kein leerer Rahmen, keine Entschuldigung. |
| Keine Vorwoche | Zeile „Gegenüber der Vorwoche" trägt „keine Vorwoche zum Vergleich" statt „+ 4.320 kg gegenüber nichts". |

Die Verteilung nach Muskelgruppen heißt bewusst **„Schwerpunkte"**, steht in
absoluten Werten (nicht in Prozent) und trägt die Zeile „Nur Sätze mit
hinterlegter Muskelgruppe — die Summe kann unter dem Volumen liegen." Eine
Prozentangabe hätte eine Vollständigkeit behauptet, die `muscles` nicht hat.

---

## 4. Prüfliste — jeder Punkt mit rot/grün-Beleg

Skript: `.superpowers/sdd/2026-07-29-live-coach-plan-v2/task-21-check.js`, Port **8800**,
Chromium über Puppeteer (Windows, kein Xcode). Reiterwechsel über echte
Zeigerfolge (`page.click('#ch-tab-report')`). Uhr für den ganzen Lauf auf
**Mittwoch 10:00 der laufenden Woche** festgenagelt.

```
node task-21-check.js                       -> 22/22 PASS
node task-21-check.js --root=<HEAD-Baum>    ->  1/22 PASS   (21 rot)
```

| # | Check | vorher | nachher |
| --- | --- | --- | --- |
| 1 | Registrierung: script-Tag nach `coach-analyze`, `build.js`, SHELL — `APP_VERSION`/`CACHE` unangetastet | FAIL | PASS |
| 2 | `await _crBuild()`: Objekt mit `numbers`, `text` **genau drei Sätze**, kein Emoji, Aufruf schickt nur Zahlen | FAIL | PASS |
| 3 | `_crBuild()` zweimal: dasselbe Objekt, `length` unverändert, **kein** zweiter Modellaufruf | FAIL | PASS |
| 4 | Hub → „Woche": Einordnung, fünf Zahlenzeilen, Verteilung | FAIL | PASS |
| 5 | Ziel + stabiler Trend: Ausblick erscheint, trägt eine **Bedingung**, keine Zusage | FAIL | PASS |
| 6 | ohne Ziel / unruhiger Verlauf: Ausblick fehlt **vollständig** | FAIL | PASS |
| 7 | Prognose `null` (zu wenig Wochen · Ziel erreicht · Fortschritt null): Zahlen ohne Ausblick, kein `NaN` | FAIL | PASS |
| 8 | Netz getrennt: Bericht entsteht, `text === ''`, kein Modellaufruf, kein Fehler | FAIL | PASS |
| 9 | Woche ohne Training: `null`, kein Eintrag, ehrliche Fläche mit Termin | FAIL | PASS |
| 10 | Allererste Woche **und** eine einzige Einheit: keine leere Zeile, kein `NaN`/`undefined`, „keine Vorwoche zum Vergleich" | FAIL | PASS |
| 11 | `S.coachReportAt` „in einer Stunde" + `_crMaybePrepare()` → `getPending()` trägt die **echte** Zusammenfassung | FAIL | PASS |
| 12 | Rückfall: ohne fertigen Text plant `_cnSync()` den Einladungstext aus dem Katalog | **PASS** | PASS |
| 13 | Neun Wochen künstlich: `length === 8`, neueste zuerst, acht auch im Speicher | FAIL | PASS |
| 14 | Bericht-Meldung antippen: Listener verdrahtet, `_crBuild()` nachgeholt, Hub auf „Woche" | FAIL | PASS |
| 15 | Prognose-Satz in **allen vier Tönen, beiden Sprachen, beiden Einheiten**: nie leer, kein `/\{[a-z]+\}/i`, Bedingung in jedem Ton, Einheit am Wert | FAIL | PASS |
| 16 | `S.unitMode = 'lbs'`: **keine kg-Zahl** im ganzen Bericht | FAIL | PASS |
| 17 | Übungsname mit Markup erscheint als Text (kein `<img>`, `__xss === 0`) | FAIL | PASS |
| 18 | Heute-Tab: gleich viele Flächen, ein Coach-Einstieg, kein fünfter Tab, kein fünfter Hub-Reiter | FAIL | PASS |
| 19 | Screenshot `task-21-hub.png` mit Zahlen, Einordnung, Ausblick, Schwerpunkten | FAIL | PASS |
| 20 | Statisch: `persist()` statt `save`, ISO nur über `CoachAnalyze`, kein `getWeekKey`, kein Emoji, ≥ 14 `catch` | FAIL | PASS |
| 21 | Statisch: `S.coachReports` nicht im Cloud-Payload, `firestore.rules` unverändert, kein `fetch`/zweiter Endpunkt, kein Netz im Modul | FAIL | PASS |
| 22 | Statisch: Prompt trägt `personaLine` + „genau drei Sätze / keine Emojis / keine Zusagen / kein Planvorschlag" in beiden Sprachen | FAIL | PASS |

**Zu #12 — der eine Check, der vorher grün war.** Er misst kein neues Verhalten,
sondern die Invariante von Block 4: die Berichts-Meldung darf nie ausfallen,
auch wenn kein fertiger Text existiert. Vorher war das der einzige Weg, nachher
der Rückfall. Ein Rot-Zustand vorher wäre nur konstruierbar gewesen, indem der
Check etwas prüft, das es damals gar nicht gab — dann hätte er nicht mehr die
Invariante gemessen, die er messen soll. Er steht bewusst drin, weil genau
dieser Pfad durch die Umstellung des Bodys hätte brechen können.

**Zu #18 — Flächenzahl im Heute-Tab.** Ebenfalls eine Invariante. Sie ist im
Rot-Lauf trotzdem rot, weil sie zusätzlich `_crBuild()` aufruft (im alten Baum
`undefined`); der eigentliche Beweis ist der Vergleich vorher/nachher **innerhalb
eines Laufs** (`#heute-pad > div` = 2, `#heute-grid > *` gleich, ein `.aic`,
kein Element mit `cr-`, fünf Tabs, vier Hub-Reiter).

### Nachgefahrene Suiten

```
node --test test/*.js                 517/517
task-21-check.js                       22/22
task-19-check.js                       27/27
task-17-check.js                       23/23
block3-fix-check.js                    21/21
task-10-check.js                       46/46
task-9-check.js                        20/20
lang-check.js                            4/4
```

`task-10-check.js` war zwischenzeitlich rot: sein statischer `save`-Riegel liest
den Block **ohne** Kommentare zu entfernen, und meine Begründung „`save()`
existiert in dieser App nicht" enthielt die verbotene Zeichenfolge wörtlich. Der
Kommentar ist auf die Schreibweise umgestellt, die der Task-19-Block schon
benutzt („ein save-Aufruf existiert in dieser App nicht"). Der Riegel bleibt
scharf.

---

## 5. Zwei Befunde, die eine Änderung außerhalb von `index.html` erzwungen haben

### 5.1 `js/coach-persona.js` — der Ausblick war nicht einheitenrein (behoben)

Der Katalog trug die Einheit im Satz:

```
ruhig:    'Wenn es so weiterläuft, sind {kg} kg bei {ex} in {weeks} Wochen erreichbar.'
hart:     'Wenn du dranbleibst: {kg} Kilo in {weeks} Wochen.'
ruhig/en: 'If this keeps up, {kg} kg on {ex} is within reach in {weeks} weeks.'
hart/en:  'If you hold: {kg} kilos in {weeks} weeks.'
```

`forecast` stand als einziger Gewichtssatz **nicht** in `WERT_KEYS` in
`test/coach-persona.test.js`. Ein lbs-Nutzer hätte im Wochenbericht gelesen:
„…sind 264,6 lbs kg bei Bankdrücken…" beziehungsweise mit der Umrechnung aus
`_csVars` eine lbs-Zahl mit kg-Beschriftung — ein Gewicht, das es nicht gibt,
und zwar im Satz, der am weitesten in die Zukunft zeigt. Das kollidiert direkt
mit dem verbindlichen Prüfpunkt „`S.unitMode = 'lbs'` → keine kg-Zahl im
Bericht".

Behoben: die acht Sätze tragen jetzt nur `{kg}`, die Einheit hängt am Wert
(`_csVars` → `_csWeight`). `'forecast'` steht in `WERT_KEYS`; beide bestehenden
Einheiten-Tests decken ihn ab. Der `hart`-Ton hat **kein** `{ex}` bekommen — mit
Übungsname wäre er auf neun Wörter gewachsen und hätte den bestehenden Test
„Ton hart bleibt bei höchstens acht Wörtern" gebrochen; ohne Einheit sind es
sieben. Bedingung und Nicht-Zusage in allen vier Tönen bleiben unverändert und
werden von `forecast nennt eine Bedingung und verspricht nichts` weiter gehalten.

### 5.2 `test/coach-persona.test.js`

Nur die Liste `WERT_KEYS` um `'forecast'` erweitert (plus Begründung). **Keine
neue `test()`-Funktion** — die Gesamtzahl bleibt bei 517.

---

## 6. Entscheidungen, die im Brief offen waren

**`_crGoal()` — woher kommt das Ziel.** Der Brief verlangt die Prognose „nur,
wenn ein Ziel gesetzt ist". Die Codebasis hat **kein** Kraftziel: `S.weightGoal`
ist das Körpergewichtsziel (`index.html:9097`, Sheet „Ziel bearbeiten"),
`S.obGoal` und das Dossier-`goal` sind Kategorien („Masse", „Kraft"), und die
Meilensteine (`_milestoneDefs`) zählen Einheiten, Stunden und Tonnage. Das
einzige Feld im Datenmodell, das ein **Gewicht als Ziel einer Übung** hält, ist
`ex.targetWeight`. `_crGoal()` liest es (nur `> 0`, nur Übungen mit mindestens
`MIN_WEEKS` Messwochen; bei mehreren gewinnt die mit den meisten Wochen).

Ehrlich dazugesagt: **heute schreibt keine Oberfläche `targetWeight`** — die
Anlage setzt 0, `getSuggestedWeight()` liest es als Startgewicht, wenn es keinen
Verlauf gibt. Damit schweigt der Ausblick im Auslieferungszustand. Das ist genau
das Verhalten, das der Brief für „kein Ziel gesetzt" fordert („Ausblick fehlt
vollständig"), und es ist die konservative Wahl: ein selbst erfundenes Ziel
(„nächste runde Zahl über deinem Bestwert") wäre eine Zusage, die niemand
vereinbart hat. **Eine Fläche zum Setzen eines Kraftziels ist eine eigene Spec**
und steht in keiner Task dieses Plans — Empfehlung: mit Block 6 zusammen
zuschneiden, dort liegt ohnehin der Ort, an dem der Coach über Zielsetzung
spricht. Solange sie fehlt, ist die Prognose gebauter, geprüfter, aber
schlafender Code.

**`_crSessions()` zählt Aufwärmsätze mit** — dieselbe Regel wie `setsVolume()`
und `sessionVolume()` im Rest der App. Eine eigene Regel hätte bedeutet: der
Bericht nennt ein anderes Volumen als die Statistik und als die Meldung
(`_cnWeekVol`), die ihn ankündigt.

**PR-Erkennung ohne `detectPRs()`.** `detectPRs(session)` scannt für jede Einheit
alle bisherigen Sessions; einmal je Wocheneinheit aufgerufen wäre das beim
App-Start der teuerste Weg zum selben Ergebnis. `_crSessions()` setzt `pr` in
**einem** chronologischen Durchlauf (höchstes Gewicht dieser Übung bis dahin) —
dieselbe Definition wie der `type: 'weight'`-Zweig von `detectPRs`.

**`_crSignedIn()`** ist eine eigene kleine Funktion und keine Bedingung inline:
ohne Anmeldung zeigt `aiCall()` einen Hinweis-Toast, und für einen Aufruf, den
der Nutzer nie angefordert hat, wäre das eine Fehlermeldung ohne Fehler.
Anonyme Anmeldung zählt mit — sie trägt ein idToken, und der Worker prüft den
Kaufnachweis ohnehin selbst.

**`_crClean()`** verlässt sich nicht auf die Prompt-Vorgabe: Codeblöcke
(` ```gtplan `, ` ```gtmem ` kennt derselbe Endpunkt), Piktogramme und
Steuerzeichen fliegen raus, nach dem dritten Satz ist Schluss. Eine Vorgabe im
Prompt ist eine Bitte, keine Zusicherung.

---

## 7. Offene Punkte / Bedenken

1. **`S.coachReportAt` hat keine Bedienfläche.** Der Blockabschluss-Changelog in
   `task-22-brief.md` verspricht „Die Uhrzeit kannst du selbst festlegen". Das
   Feld existiert, `_cnReportAt()` und die Anzeige lesen es, ein Schalter dafür
   ist in Task 21 nicht beauftragt. Entweder eine Zeile in den Coach-Einstellungen
   nachziehen (Hub, nicht Heute-Tab) oder die Changelog-Zeile streichen.
2. **Die Prognose ist ohne Zielfläche schlafend** (siehe 6). Bewusst so, aber es
   ist eine Funktion, die im Auslieferungszustand niemand sieht.
3. **`_crMaybePrepare()` greift nur, wenn die App im 36-Stunden-Fenster geöffnet
   wird.** Der Rückfall (Einladungstext, Bericht entsteht beim Antippen) ist im
   Brief ausdrücklich akzeptiert und in Check 12/14 belegt.
4. **Die Zustellung selbst ist hier nicht prüfbar** — im Browser gibt es kein
   `@capacitor/local-notifications`. Geprüft ist die Planungsebene über dasselbe
   Doppel wie in Task 19. Der Tipp auf die Meldung wird über den registrierten
   Listener nachgefahren, nicht über iOS.
5. **`_crHistory()` läuft in `_crGoal()` einmal pro Übung mit Ziel.** Bei genau
   einem gesetzten Ziel ist das ein Durchlauf über `S.sessions`; bei vielen
   Zielen wäre es einer je Ziel. Heute unkritisch (kein Ziel setzbar), beim Bau
   der Zielfläche mitbedenken.
6. **`www/` ist gitignored**, `build.js` wurde einmal ausgeführt und hat
   `js/coach-report.js` korrekt kopiert — der Capacitor-Build zieht die Datei mit.
