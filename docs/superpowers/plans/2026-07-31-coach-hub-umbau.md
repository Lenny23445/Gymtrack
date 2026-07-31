# Coach-Hub-Umbau — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`. Schritte tragen Checkbox-Syntax (`- [ ]`).

**Goal:** Aus dem Coach-Hub wird ein Blatt mit fünf Kacheln, die an Ort und Stelle aufklappen; die Wochenkachel trägt echte Diagramme, der Ton wird über einen Regler mit vier Rastpunkten gewählt, und die Heute-Karte bündelt drei Informationen statt einer.

**Architecture:** Die Diagramm-Logik wandert in ein eigenes reines Modul `js/coach-charts.js` (Konfigurationen bauen, keine Zeichenaufrufe, in `node --test` prüfbar). Alles Sichtbare wird in `index.html` verdrahtet. Gezeichnet wird mit Chart.js 4.4.0 UMD, das die App bereits lädt (`index.html:5718`, sieben bestehende Diagramme als Vorbild).

**Tech Stack:** Vanilla JS ohne Bundler, Node 22 mit eingebautem Test-Runner, Chart.js 4.4.0, Puppeteer für die Browser-Prüfung.

**Spec (Absichtsquelle, unangetastet):** `docs/superpowers/specs/2026-07-31-coach-hub-design.md`

**Stand bei Planerstellung:** 517 Node-Tests grün, acht Browser-Suiten mit zusammen 187 Checks grün.

---

## Warum dieser Plan keine Rumpfimplementierung enthält

Derselbe Grund wie beim Live-Coach-Plan v2: eingebetteter Fertig-Code ist dort zweimal durch die eigene Testsuite gefallen. Dieser Plan liefert **Absicht, Schnittstelle, Testfälle, Anker, Fallstricke, Verifikation** — Code steht nur dort, wo die exakte Form die Anforderung *ist* (eine CSS-Kurve, ein Selektor, eine Konstante).

## Ausführungsmodell — bindend

Vom Nutzer ausdrücklich so gesetzt:

- **Kein Kaltstart.** Tasks 2, 3 und 4 bekommt **derselbe** Agent, nacheinander weiterbeauftragt. Er erarbeitet sich `index.html` (30.000 Zeilen, 1,4 MB) **einmal** und behält den Kontext. Ein frischer Agent je Task zahlt diese Einarbeitung erneut — der teuerste vermeidbare Posten.
- **Task 1 läuft parallel** dazu, weil sie `index.html` nicht anfasst.
- **Keine Zwischenabnahme, keine Screenshots zwischen den Tasks.** Belege entstehen einmal am Ende.
- **Einmal bauen, einmal prüfen, eine Fix-Welle.** Eine Review über den gesamten Umbau, danach genau eine Fix-Welle, danach eine eng gefasste Nachprüfung. Dafür muss diese eine Review gründlich sein: Mutationsproben an den drei Stellen, an denen in dieser Codebasis nachweislich Fehler durch grüne Suiten gerutscht sind — Akkordeon-Zustand, XSS an neuen Renderstellen, Gestaltungsregel 1.

## Zeilennummern sind Orientierung, keine Sprungmarken

`index.html` wächst mit jeder Task. **Anker werden über Inhalt gesucht**, die Zahlen unten sind Stand Planerstellung.

---

## Ankerkarte

Damit niemand zweimal sucht — alle Fundstellen aus der laufenden Arbeit:

| Was | Suchmuster | ca. Zeile |
| --- | --- | --- |
| Chart.js | `chart.umd.min.js` | 5718 |
| Bestehende Diagramme (Vorbild für Optionen, Achsen, Farben) | `new Chart(` | 12061, 12163, 15373, 15403 |
| Hub-Reiter (entfallen) | `const _CH_TABS` | 25921 |
| Reiter wechseln (entfällt) | `function coachHubTab` | 25957 |
| Hub zeichnen | `function renderCoachHub` | — |
| Rerender-Wächter | `_chHoldBody` | — |
| Scroll-Rücksetzung | `_chResetScroll` | — |
| Hub-CSS | `.ch-tabs`, `.ch-sec`, `.ch-row`, `.ch-preset`, `.ch-jrn`, `.ch-voice` | 5190–5270 |
| Einstellungen im Hub | `_chSettingsHTML` | — |
| Journal-Zeile | `_chJrnRow` | — |
| Ton-Beispielsatz | `_chToneLine`, `_chToneExInner`, `_chToneExVars` | — |
| Wochenbericht rendern | `_chReportHTML` | — |
| Berichtstermin | `_chReportAtHTML`, `coachHubSetReportAt` | 26612, 26641 |
| Bericht der laufenden Woche | `_crCurrent` | 26382 |
| Bericht bauen | `_crBuildRun` | — |
| Kraftziel lesen | `_crGoal` | — |
| ISO-Wochenschlüssel des Berichts | `_crWeekKey` | 26078 |
| Wochen-Beschriftung | `_crLabel` | — |
| Archiv der letzten Wochen | `_crArchivHTML` | — |
| Heute-Karte zeichnen | `function renderCoachTodayCard` | 10721 |
| Karten-Cache | `_aicSig` | — |
| Tagesempfehlung | `function _coachTodaySuggestion` | — |
| Tap-Ziel der Karte | `_aicCardTap` | — |
| Erholung | `function _ciReadiness`, `_ciReadinessCalc` | 12416, 12429 |
| Muskelgruppen | `const MUSCLE_GROUPS`, `function muscleLabel` | 8863, 8876 |
| Einheiten | `kgToDisp`, `dispToKg`, `unitLabel`, `_csWeight` | 8919, 8925 |
| Persona-Wrapper | `_persona`, `_lang`, `_say`, `_coachName`, `_coachLevel` | — |
| Schalter schreiben | `setAiCoachOpt`, `setCoachPreset` | — |
| Hilfen | `esc`, `tr`, `_cm`, `ICO`, `persist`, `openOv`, `closeOv`, `haptic` | — |

**Module, fertig und getestet:** `CoachPersona` (`say`, `personaGet`, `TONES`, `PRESETS`), `CoachReport` (`weekNumbers`, `goalForecast`, `epley1rm`, `weekStart`, `reportSay`, `forecastSay`), `CoachAnalyze` (`isoWeekKey`, `isoWeekIndex`, `plateau`, `prioritize`), `CoachNotify`, `CoachSession`, `CoachWarmup`, `CoachCues`, `CoachRpe`, `CoachMemory`, `CoachCache`, `CoachLog`.

**Browser-Suiten, die den Hub anfassen und mitwandern müssen:** `task-9-check.js`, `task-10-check.js`, `task-21-check.js`, `task-22-check.js` — sie greifen auf `.ch-tabs`, `coachHubTab()` und `_CH_TABS` zu.

---

## Global Constraints

Gelten für **jede** Task, werden nicht wiederholt.

- **Kein eigenes Aussehen** (Gestaltungsregel 7): `--acc`, `--acc-rgb`, Glas-Tokens (`--gl-bg-t`, `--gl-bdr`, `--inp-bg`), bestehende Abstände. Keine neuen Farbwerte, keine zweite Diagrammbibliothek.
- **Ein Einstieg im Heute-Tab, kein zweiter** (Gestaltungsregel 1): keine neue Karte, Zeile oder Kachel auf der Startseite, kein fünfter Tab. Verletzung heißt: nicht abnahmefähig.
- **Schlicht heißt nicht dünn** (Gestaltungsregel 8): jede Zahl muss etwas sein, das der Nutzer sonst nicht sieht.
- **Keine Emojis** in der Oberfläche; Symbole ausschließlich über `ICO.<name>({s})`. `✕` (U+2715) ist bestehendes Muster der `.x-btn`.
- **Jeder freie Text durch `esc()`** vor `innerHTML` — Coach-Name, Dossier-Einträge, Übungsnamen, Datumsangaben. Reiner Text per `textContent`.
- **Zwei Sprachen:** jeder neue nutzersichtbare String braucht seinen englischen Gegenpart in `I18N_EN`; zusammengesetzte Sätze mit Zahlen über `_cm(de,en)`. **Die Einheit gehört an den Wert, nicht in den Satz** — lbs-Nutzer sehen lbs.
- **`persist()`, nicht `save()`.** `save()` existiert nicht, wirft `ReferenceError` und fällt in `try/catch` **still** aus.
- **Jeder Einstiegspunkt in `try/catch`.** Ein Fehler im Coach darf weder das Training noch den App-Start abbrechen.
- **Kein neuer Firestore-Schreibpfad**, `firestore.rules` unangetastet.
- **`APP_VERSION`, `CACHE` in `sw.js:2` und `CHANGELOG`** fasst keine Task an — eigener Ritualschritt am Ende.
- **Pfadgebundenes `git add`**, nie `git add -A`. `git pull --rebase` vor dem Commit, danach pushen.
- **Modul-Bauart** für `js/`: IIFE über `globalThis`, `'use strict'`, reine Funktionen, kein DOM, keine App-Globals, kein `localStorage`, `module.exports = API` **und** `root.CoachX = API`.

---

# Task 1: `js/coach-charts.js` — die Diagramme als reine Konfiguration

**Läuft parallel zu Task 2.** Fasst `index.html` nicht an.

**Absicht.** Die vier Diagramme der Wochenkachel entstehen nicht als Zeichenbefehle mitten in einer Renderfunktion, sondern als reine Datenstruktur, die man ohne Browser prüfen kann. Das Modul bekommt Zahlen und gibt eine Chart.js-Konfiguration zurück. Gezeichnet wird in Task 3.

**Schnittstelle.**

| Funktion | Rückgabe |
| --- | --- |
| `volumeBars(weeks, opts)` | Chart.js-Konfiguration, Balken; `weeks` = `[{weekKey, vol}]`, jüngste zuletzt; `opts = {accent, muted, lang, unit}` |
| `muscleBars(muscles, opts)` | liegende Balken je Muskelgruppe; `muscles` = `[{id, label, vol}]` |
| `oneRmLine(points, goal, opts)` | Linie mit optionaler Trendlinie bis `goal`; `points` = `[{weekIndex, kg}]` |
| `MIN_BARS` / `MIN_POINTS` | Untergrenzen, ab wann ein Diagramm etwas aussagt |

Jede Funktion gibt **`null`** zurück, wenn die Datenlage zu dünn ist. Ein `null` ist ein gültiges Ergebnis und heißt für die Aufrufstelle: Bereich entfällt ganz.

**Farben kommen als Argument herein** (`opts.accent`, `opts.muted`); das Modul liest keine CSS-Variablen — sonst wäre es nicht testbar und hätte DOM-Wissen. **Das Modul rechnet keine Einheiten um**, es beschriftet nur nach `opts.unit`.

**Testfälle** (`test/coach-charts.test.js`):

| Eingabe | Erwartete Ausgabe | Fängt welchen Fehler |
| --- | --- | --- |
| `volumeBars([], …)` | `null` | leerer Rahmen statt Verzicht |
| `volumeBars` mit einer Woche | `null` (unter `MIN_BARS`) | ein einzelner Balken ist kein Verlauf |
| `volumeBars` mit acht Wochen | acht Datenpunkte, Reihenfolge wie hereingegeben | Sortierung verdreht |
| `volumeBars`, letzte Woche | trägt `accent`, alle anderen `muted` | laufende Woche hebt sich nicht ab |
| `volumeBars` mit `unit:'lbs'` | Achsenbeschriftung nennt lbs, Werte unverändert durchgereicht | Modul rechnet heimlich um |
| `muscleBars` mit drei Gruppen | drei Balken, absteigend nach Volumen | zufällige Reihenfolge |
| `muscleBars`, eine Gruppe ohne Label | Gruppe entfällt, Rest bleibt | erfundene Beschriftung |
| `oneRmLine` mit drei Punkten | `null` (unter `MIN_POINTS`) | Trend aus zu wenig Punkten |
| `oneRmLine` mit sechs Punkten, kein Ziel | Linie ohne Trendabschnitt | Trendlinie ohne Ziel erfunden |
| `oneRmLine` mit sechs Punkten und Ziel | zweiter Datensatz endet auf `goal` | Ziel nicht erreicht dargestellt |
| alle drei mit `lang:'en'` | englische Achsenbeschriftung | Sprache ignoriert |
| alle drei | kein `\p{Extended_Pictographic}` irgendwo | Emoji in der Oberfläche |

- [ ] **Schritt 1:** `test/coach-charts.test.js` schreiben, alle Fälle oben.
- [ ] **Schritt 2:** `node --test test/coach-charts.test.js` — muss **rot** sein, Fehlschlag lesen.
- [ ] **Schritt 3:** `js/coach-charts.js` bauen. Form nach `js/coach-log.js`; Chart.js-Optionen, Achsen und Farbwerte nach den vier bestehenden `new Chart(`-Aufrufen.
- [ ] **Schritt 4:** Suite grün, danach `node --test test/*.js` (Ausgangsstand 517, danach mehr, kein bestehender Test kippt).
- [ ] **Schritt 5:** Mutationsprobe auf einer Kopie im Scratchpad: `MIN_BARS` aufheben, Sortierung entfernen, Akzentfarbe auf alle Balken. Jede Mutation muss genau die zuständigen Tests umbringen; überlebt eine, fehlt ein Test.
- [ ] **Schritt 6:** Commit `feat(coach): coach-charts.js — Diagramm-Konfigurationen als reine Funktionen`, pfadgebunden, pushen.

---

# Task 2: Der Hub wird ein Blatt mit fünf Kacheln

**Absicht.** Nach dieser Task hat der Nutzer ein Blatt statt vier Reiter. Genau eine Kachel ist offen, ein Tipp klappt sie an Ort und Stelle auf, die anderen rücken weich nach. Zugeklappt sagt jede Kachel schon etwas.

**Was entfällt:** `_CH_TABS`, `coachHubTab()`, `.ch-tabs`, `.ch-tab`, `.ch-tab.on`. Damit verschwindet auch der geparkte Gestaltungsregel-7-Verstoß (ein Segmented Control, das die App sonst nirgends hat).

**Schnittstelle.**

| Funktion | Verhalten |
| --- | --- |
| `openCoachHub(tab)` | bleibt; `tab` wird zur **Kachel-Kennung**. Die Weiche auf `openCoachSetup` bei `preset === undefined` bleibt unverändert |
| `coachHubOpen(name)` | öffnet eine Kachel, schließt die vorige; erneuter Aufruf auf der offenen schließt sie |
| `renderCoachHub()` | zeichnet das Blatt; **no-op**, wenn das Overlay zu ist; behält `_chHoldBody` und die Scroll-Rettung |
| `_chOpen` | Laufzeitvariable, welche Kachel offen ist; `''` heißt keine. Wird an derselben Stelle zurückgesetzt, an der heute `_chTab` genullt wird (Kontowechsel) |

**Die fünf Kacheln, Kennungen:** `chat`, `week`, `persona`, `scope`, `journal`.

Inhalte werden **umgezogen, nicht neu erfunden**: `chat` aus dem heutigen Chat-Reiter, `journal` aus `_chJrnRow` und Umgebung, `scope` aus `_chSettingsHTML` samt Profilen, Feinjustierung, Erinnerung, Berichtstermin und Berechtigungszeile, `persona` aus Name und Tonauswahl (der Regler kommt in Task 4 — hier bleiben die Tonkarten vorerst), `week` aus `_chReportHTML` (Diagramme kommen in Task 3).

**Zugeklappte Kennzahl je Kachel** — Pflicht, sonst sagt das Blatt zugeklappt nichts:

| Kachel | Kennzahl |
| --- | --- |
| `chat` | Anzahl Nachrichten im Verlauf, sonst „noch kein Gespräch" |
| `week` | Volumen der laufenden Woche mit Pfeil zur Vorwoche |
| `persona` | Name und Ton, z. B. „Nina · fordernd" |
| `scope` | gewähltes Profil, z. B. „Ausgewogen" |
| `journal` | Anzahl Einträge, sonst „noch nichts notiert" |

**Bewegung, verbindlich:**

- Aufklappen über `grid-template-rows: 0fr → 1fr`, `260ms cubic-bezier(.22,.61,.36,1)`. **Nicht** `max-height` — das rastet bei unbekannter Inhaltshöhe.
- Inhalt blendet ein und hebt sich 8 px, je Element 40 ms versetzt, höchstens fünf Stufen.
- Beim Öffnen einmalig der bestehende Lichtstreifen (`flash`) wie auf der `.aic`-Karte.
- `@media (prefers-reduced-motion: reduce)` setzt **alle** Übergänge auf 0 ms.

**Fallstricke.**

- `renderCoachHub()` wird aus `_coachOptRender()` gerufen, also auch bei geschlossenem Blatt — die frühe Rückkehr muss bleiben.
- Der `_chHoldBody`-Wächter existiert, weil ein Rerender mitten im Klick den Tipp verschluckt hat (echter Befund aus Task 9). Nicht entfernen.
- Scrollposition sichern und zurückschreiben; zurückgesetzt nur beim Kachelwechsel.
- **Vier Browser-Suiten greifen auf die alte Struktur zu.** Sie werden **migriert, nicht gelöscht** — jede Zusicherung, die sie heute treffen, muss danach dieselbe Zusicherung auf der neuen Struktur treffen. Eine gelöschte Prüfung ist ein verlorener Riegel.

**Testfälle** (neue Suite `.superpowers/sdd/2026-07-29-live-coach-plan-v2/hub-check.js`, eigener Port, echte Zeigerfolge über `page.click`):

| Schritt | Erwartung | Fängt welchen Fehler |
| --- | --- | --- |
| Hub öffnen | genau eine Kachel offen, die anderen zu | Startzustand undefiniert |
| Tipp auf geschlossene Kachel | sie öffnet, die vorige schließt | zwei offen |
| Tipp auf die offene | sie schließt, keine ist offen | Zustand nicht abwählbar |
| alle fünf zugeklappt | jede zeigt ihre Kennzahl, keine ist leer | Kennzahl vergessen |
| Kachel unten im Blatt öffnen | sie wird in Sicht gescrollt | Inhalt öffnet außerhalb des Bildes |
| Schalter in `scope` betätigen | Scrollposition bleibt, Kachel bleibt offen | Rerender wirft beides weg |
| `prefers-reduced-motion` gesetzt | Übergangsdauer 0 | Regel ignoriert |
| Heute-Tab vorher und nachher | gleich viele Flächen, genau eine `.aic`, fünf Tab-Knöpfe | Gestaltungsregel 1 verletzt |
| `.ch-tabs` im Dokument | existiert nicht mehr | Segmented Control überlebt |
| Journal-Eintrag mit Markup | erscheint als Text | `esc()` beim Umzug verloren |

- [ ] **Schritt 1:** `hub-check.js` schreiben, alle Fälle oben.
- [ ] **Schritt 2:** Suite laufen lassen — muss **rot** sein.
- [ ] **Schritt 3:** Markup, CSS und Renderfunktionen umbauen, Inhalte umziehen.
- [ ] **Schritt 4:** Die vier bestehenden Suiten migrieren.
- [ ] **Schritt 5:** `hub-check.js` grün, `node --test test/*.js` (517) grün, alle acht Browser-Suiten grün.
- [ ] **Schritt 6:** Commit `feat(coach): Hub wird ein Blatt mit fuenf aufklappenden Kacheln`, pushen.

---

# Task 3: Die Wochenkachel bekommt Diagramme und das Kraftziel

**Absicht.** Die Kachel `week` zeigt vier Bereiche: Kennzahlen, acht Wochen Volumen, Muskelverteilung, Bestwert-Verlauf mit Prognose. Die Prognose ist gebaut und getestet, schläft aber, weil die App kein Kraftziel erfasst — diese Task weckt sie.

**Schnittstelle.**

| Funktion | Verhalten |
| --- | --- |
| `_chWeekCharts(host, rep)` | zeichnet die Diagramme in die offene Kachel; zerstört vorhandene Instanzen vorher |
| `_chWeekDestroy()` | zerstört alle Chart-Instanzen der Kachel; wird beim Schließen der Kachel und des Blattes gerufen |
| `coachSetGoal(exId, kgDisp)` | schreibt `ex.targetWeight` (in kg über `dispToKg()`), `persist()`, zeichnet neu |
| `coachClearGoal()` | setzt `targetWeight = 0` |

**Die vier Bereiche.**

1. **Kennzahlen** — Einheiten, Sätze, Volumen als große Ziffern, je mit Pfeil und Prozent zur Vorwoche. Quelle `CoachReport.weekNumbers`. **Diese Zeile steht immer**, auch ohne Verlauf. Zahl zählt beim Öffnen in 400 ms hoch.
2. **Acht Wochen Volumen** — `CoachCharts.volumeBars` aus `S.coachReports` plus der laufenden Woche. Balken wachsen von unten, je Balken 30 ms versetzt.
3. **Muskelverteilung** — `CoachCharts.muscleBars`. **Pflichthinweis**, dass Sätze ohne zugeordnete Muskelgruppe fehlen; die Summe kann unter dem Gesamtvolumen liegen.
4. **Bestwert-Verlauf mit Prognose** — `CoachCharts.oneRmLine` mit `CoachReport.goalForecast`. Erscheint nur bei gesetztem Ziel **und** gelieferter Prognose. Sonst steht dort die Zeile „Ziel setzen".

**Das Kraftziel.** `ex.targetWeight` existiert, wird überall mit `0` angelegt und von keiner Oberfläche gesetzt:

- **Vorgeschlagene Übung:** die mit den meisten Arbeitssätzen der letzten acht Wochen. Der Nutzer kann eine andere aus seinen Übungen wählen.
- **Eingabe** in der Anzeigeeinheit, gespeichert über `dispToKg()`. **Untergrenze ist das aktuelle geschätzte Maximum** (`CoachReport.epley1rm`) — ein Ziel unterhalb des Erreichten ist kein Ziel.
- **Genau eines gleichzeitig sichtbar.** Ein neues ersetzt das angezeigte.
- Im gesetzten Zustand trägt die Zeile „Ziel ändern" und eine Möglichkeit, es zu entfernen.

**Fallstricke.**

- **Diagramme erst zeichnen, wenn die Kachel offen ist**, und beim Schließen zerstören. Chart.js hält Instanzen an der Canvas — ohne `destroy()` wächst der Speicher bei jedem Öffnen.
- **Ist zu wenig Verlauf da, entfällt der Bereich ganz.** Kein leerer Rahmen, keine Achse ohne Daten; `CoachCharts` liefert dafür `null`.
- `weekNumbers().muscles` enthält nur Sätze **mit** Muskelgruppe — daher der Pflichthinweis.
- `CoachReport.forecastSay` schweigt ohne Übungsnamen; der Name muss mitgegeben werden.
- Zahlen liegen in kg vor, Anzeige über `kgToDisp()`/`unitLabel()`. Ein lbs-Nutzer darf nirgends eine kg-Zahl sehen.

**Testfälle** (an `hub-check.js` anhängen):

| Schritt | Erwartung | Fängt welchen Fehler |
| --- | --- | --- |
| Kachel `week` geschlossen | null Chart-Instanzen | Diagramme im Voraus gezeichnet |
| Kachel `week` öffnen | Instanzen entstehen | Diagramme fehlen |
| Kachel schließen | Instanzen wieder null | Speicherleck |
| Profil ohne Verlauf | Kennzahlen stehen, Diagrammbereiche fehlen ganz | leerer Rahmen |
| Profil mit acht Wochen | Volumenbalken vorhanden, laufende Woche abgesetzt | Verlauf fehlt |
| kein Kraftziel | Zeile „Ziel setzen", kein Verlaufsdiagramm | erfundene Prognose |
| Ziel unter dem Erreichten setzen | abgelehnt, Hinweis erscheint | Ziel hinter dem Ist |
| Ziel darüber setzen | Verlauf erscheint, Trendlinie endet am Ziel | Prognose bleibt schlafend |
| Ziel entfernen | Verlauf verschwindet, Zeile steht wieder da | Zustand klebt |
| `S.unitMode='lbs'` | keine kg-Zahl in der Kachel, Achsen nennen lbs | Einheit im Satz statt am Wert |
| Muskelverteilung | Hinweis auf fehlende Zuordnung sichtbar | unvollständige Aufteilung sieht vollständig aus |

- [ ] **Schritt 1:** Testfälle anhängen, rot laufen lassen.
- [ ] **Schritt 2:** Bereiche bauen, `CoachCharts` anbinden, Kraftziel-Zeile bauen.
- [ ] **Schritt 3:** Alle Suiten grün.
- [ ] **Schritt 4:** Commit `feat(coach): Wochenkachel mit vier Diagrammen und Kraftziel`, pushen.

---

# Task 4: Ton-Regler und Heute-Karte

**Absicht.** Der Ton wird gezogen statt angetippt, und die Karte auf der Startseite bündelt drei Informationen statt einer.

## 4a — Der Ton-Regler

**Schnittstelle:** `_chToneSlider(host)` zeichnet den Regler; geschrieben wird über das bestehende `setAiCoachOpt('tone', …)`.

- Vier Rastpunkte in der Reihenfolge aus `CoachPersona.TONES` (`ruhig`, `sachlich`, `hart`, `locker`).
- Der Griff folgt dem Finger sofort und rastet in 180 ms ein. **Zwischen den Punkten existiert kein Zustand** — es wird immer einer der vier geschrieben.
- **Der Beispielsatz wechselt während des Ziehens**, nicht erst beim Loslassen. Quelle `CoachPersona.say('greet', …, personaGet({tone:t}), lang)` mit **echten Zahlen der letzten Einheit** — keine erfundenen Werte (das war ein Befund aus Block 3).
- Bedienbar per Zeigergeste **und** per Tastatur: `role="slider"`, `tabindex="0"`, Pfeiltasten links und rechts, `aria-valuenow` und `aria-valuetext` mit dem Tonnamen.

**Testfälle:** Ziehen über alle vier Rastpunkte schreibt `S.aiCoach.tone` als **String** (nicht `true` — die alte Boolean-Coercion war ein echter Befund); der Beispielsatz unterscheidet sich zwischen allen vier; Pfeiltaste bewegt den Regler; `aria-valuetext` nennt den Ton; ein Wert zwischen zwei Rastpunkten landet nie im Zustand.

## 4b — Die Heute-Karte

**Drei Zonen in einem Rahmen:**

- **Links:** Ring mit der **Erholung der nächsten fälligen Muskelgruppe** statt eines allgemeinen Werts, Name der Gruppe darunter. Quelle `_ciReadiness`/`_ciReadinessCalc`, Beschriftung über `muscleLabel`.
- **Rechts:** zwei Zeilen — Volumen der laufenden Woche mit Pfeil und Prozent zur Vorwoche; darunter, was heute ansteht.
- **Darunter:** ein Satz vom Coach im gewählten Ton aus der Sprachfabrik.
- **CTA** „Training starten" bleibt.

**Fallstricke.**

- Der `closest('button, a')`-Wächter im Tap-Ziel bleibt, sonst verliert der Nutzer den Trainingsstart.
- Die Signatur des Karten-Caches (`_aicSig`) muss **alle** neuen Werte enthalten, sonst zeichnet die Karte nach einer Änderung nicht neu — genau dieser Fehler ist in Task 8 schon passiert.
- Rolle und Tastaturzugang der Karte bleiben erhalten.
- **Keine zweite Fläche.** Es bleibt bei genau einer Karte.

**Testfälle:** Karte zeigt Gruppenname und Erholung; Wochenzahl mit Pfeil stimmt gegen `CoachReport.weekNumbers`; Tipp auf den CTA startet das Training und öffnet **nicht** den Hub; Tipp daneben öffnet den Hub; Enter auf der Karte öffnet den Hub; nach `setAiCoachOpt('name', …)` zeichnet die Karte neu; bei `lbs` keine kg-Zahl; Heute-Tab hat gleich viele Flächen wie vorher.

- [ ] **Schritt 1:** Testfälle anhängen, rot laufen lassen.
- [ ] **Schritt 2:** Regler bauen, Karte umbauen.
- [ ] **Schritt 3:** Alle Suiten grün, `node --test test/*.js` grün.
- [ ] **Schritt 4:** Commit `feat(coach): Ton-Regler mit vier Rastpunkten und dreigeteilte Heute-Karte`, pushen.

---

## Abschluss

- [ ] **Eine Review über den gesamten Umbau**, read-only, auf dem stärksten Modell. Prüfpunkte: XSS an jeder neuen `innerHTML`-Stelle, Emojis, `try/catch` an jedem Einstieg, keine neue Firestore-Schreibstelle, alle acht Gestaltungsregeln, und ob die vier migrierten Suiten dieselben Zusicherungen treffen wie vorher. Mutationsproben an drei Stellen: Akkordeon-Zustand, XSS an neuen Renderstellen, Gestaltungsregel 1.
- [ ] **Genau eine Fix-Welle** über alle Befunde, danach eine eng gefasste Nachprüfung. Keine zweite Welle.
- [ ] **Version und Changelog** — `APP_VERSION` und `CACHE` in `sw.js:2` auf denselben neuen Wert, Changelog-Eintrag als erstes Element.
- [ ] **Belege** — Screenshots von Hub (einmal mit offener `week`-Kachel), Ton-Regler und Heute-Karte bei 390×844.
- [ ] **Abnahme durch den Nutzer.**
