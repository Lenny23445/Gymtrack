# Task 16 — Bericht: Plateau-Diagnose und Zeitbudget

Dateien: `js/coach-analyze.js`, `test/coach-analyze.test.js`. Keine andere Datei
angefasst (kein `index.html`, kein `sw.js`, kein `build.js`, kein
`package.json`), nicht committet.

## Öffentliche API

| Signatur | Rückgabe |
| --- | --- |
| `CoachAnalyze.plateau(history)` | `{weeks, entries, topKg, volDelta, restDelta, avgRestSecs, weekFrom, weekTo}` oder `null` |
| `CoachAnalyze.plateauSay(diag, exName)` | `{key:'plateau', vars:{ex, weeks, secs}}` oder `null` |
| `CoachAnalyze.prioritize(exercises, minutes)` | `{keep: string[], drop: string[]}` |
| `CoachAnalyze.prioritizeSay(result, minutes)` | `{key:'timeBudget', vars:{mins, count}}` |
| `CoachAnalyze.costSecs(ex)` | Sekunden (`sets × (SEC_PER_SET + restSecs)`) |
| `CoachAnalyze.isoWeekKey(ts)` | `'2026-W31'` oder `null` |
| `CoachAnalyze.isoWeekIndex(ts)` | fortlaufende Wochennummer (ganzzahlig) oder `null` |
| Konstanten | `MIN_WEEKS 4`, `SEC_PER_SET 55`, `REST_DEFAULT 90`, `MAX_GAP_WEEKS 3`, `VOL_TOL 0.05` |

Form wie `js/coach-log.js`: IIFE über `globalThis`, `'use strict'`, reine
Funktionen, kein DOM, keine App-Globals, kein `localStorage`, kein Netzaufruf;
am Ende `module.exports = API` **und** `root.CoachAnalyze = API`.

`plateau` und `prioritize` halten die Signaturen und Rückgabeformen des Briefs
wörtlich; `plateau` nutzt das im Brief offene `…` für vier weitere
Beobachtungsfelder (`entries`, `topKg`, `avgRestSecs`, `weekFrom`/`weekTo`).
`prioritize` gibt exakt `{keep, drop}` zurück, ohne Zusatzfelder.

## Entscheidungen

**Trennung Diagnose / Satz.** `plateau` und `prioritize` liefern nur Zahlen,
weil der Brief deren Rückgabe festlegt. Die vom Plan verlangte Form
„Schlüssel plus Platzhalterwerte" liefern die zwei zusätzlichen reinen
Funktionen `plateauSay` / `prioritizeSay`. Damit bleibt beides erfüllt und die
Aufrufstelle in Task 17 muss keine Platzhalternamen kennen. Kein Satz entsteht
in diesem Modul.

**Beschreiben, nicht vorschreiben.** `secs` in `plateauSay` ist die
**beobachtete** mittlere Pause des Abschnitts, keine Empfehlung für eine längere
Pause. Damit passt der Wert genau zum sachlichen Katalogsatz
(„Durchschnittliche Pause {secs} Sekunden"). Es gibt keine Funktion, die einen
Plan ändert oder einen Änderungsvorschlag zurückgibt.

**Schwellen der Plateau-Erkennung.**

- `MIN_WEEKS = 4` gilt doppelt: mindestens vier Wocheneinträge **und** mindestens
  vier Kalenderwochen Spanne. Vier Einträge in zwei Wochen sind keine
  Vier-Wochen-Aussage; ohne die zweite Prüfung meldete das Modul „steht seit
  4 Wochen", wo zwei Wochen doppelt geloggt wurden.
- **Erste gegen letzte Woche**, nicht Maximum gegen letzte Woche. Nur so hebt ein
  einzelner Ausreißer in der Mitte das Plateau nicht auf — sonst genügte eine
  gute Woche, um die Diagnose dauerhaft stumm zu stellen.
- **Topgewicht entscheidet vor Volumen.** Steht am Ende mehr Gewicht als am
  Anfang, ist es kein Plateau — auch dann nicht, wenn das Volumen dabei fällt
  (Gewicht rauf bei weniger Wiederholungen ist Fortschritt).
- **`VOL_TOL = 0.05`:** wächst das Volumen bei gleichem Gewicht um mehr als fünf
  Prozent, ist das Wiederholungs- oder Satzfortschritt und damit kein Plateau.
  Enger wäre Rauschen, weiter überstiege es echten Fortschritt. Das ist der eine
  Punkt, den der Brief nicht ausdrücklich nennt; er folgt aus „kein Plateau, wenn
  am Ende mehr steht als am Anfang", auf das Volumen angewandt.
- **`MAX_GAP_WEEKS = 3`:** bis zu drei ausgelassene Wochen (krank, Urlaub,
  verschoben) gehören in dasselbe Plateau. Bei mehr wird der Verlauf getrennt und
  nur der Abschnitt **nach** der Pause beurteilt. Ohne diese Grenze meldete das
  Modul nach einem Sommerloch „steht seit 14 Wochen", was falsch ist; mit einer
  Grenze bei 0 (Split bei jeder Lücke) meldete es nach einer verpassten Woche
  nichts mehr.
- `weeks` ist die **ISO-Wochen-Spanne** des Abschnitts, `entries` die Zahl der
  Einträge. Bei lückenlosem Wochenlog sind beide gleich; bei einer verpassten
  Woche steht die für den Nutzer wahrnehmbare Kalenderspanne im Satz.
- Einträge ohne verwertbares `ts` oder `topKg` (`≤ 0`) fallen heraus; `vol`
  fehlend zählt 0, `avgRestSecs` fehlend zählt `REST_DEFAULT`.
- Aufsteigend sortiert wird immer (auf einer **Kopie**), obwohl „neueste zuletzt"
  zugesagt ist. Sonst hinge das Vorzeichen von `restDelta`/`volDelta` an der
  Aufrufstelle.

**Priorisierungsregel beim Zeitbudget.**

- `prio` **aufsteigend** = wichtiger (`prio 1` ist die wichtigste Übung); ohne
  `prio` steht die Übung hinten. Der Plan legt die Richtung nirgends fest — Task
  17 muss `prio` so befüllen.
- Kosten `sets × (SEC_PER_SET + restSecs)`, `restSecs` fehlend → `REST_DEFAULT`,
  `sets` fehlend/unbrauchbar → 1 Satz (eine Übung im Plan kostet nie null Zeit,
  sonst rutschte sie gratis in jedes Budget).
- **First-Fit in prio-Reihenfolge mit Weiterlaufen:** passt eine Übung nicht,
  wird sie gestrichen und die nächste weiter geprüft, nicht abgebrochen. So
  bleiben zwei wichtige kurze Übungen erhalten, statt an einer teuren zu
  scheitern.
- **Die wichtigste Übung bleibt immer**, auch wenn sie das Budget allein
  sprengt; ebenso bei `minutes` 0, negativ, fehlend oder unbrauchbar.
- Einträge ohne `id` fallen heraus (sie könnten nirgends benannt werden) —
  bewusste Grenze, im Test festgehalten.
- Weder `exercises` noch `history` werden verändert oder umsortiert: der
  gespeicherte Plan bleibt unberührt, priorisiert wird nur die heutige
  Durchführung.

**ISO-Woche.** Alles in UTC gerechnet, Woche Montag–Sonntag, das ISO-Jahr
entscheidet der Donnerstag, Wochenzahl zweistellig (`2026-W02`). `isoWeekIndex`
zählt über Jahresgrenzen fortlaufend — mit der Wochenzahl aus dem Schlüssel
fällt eine Spanne über den Jahreswechsel von 53 auf 1 und wird negativ.

## Welcher Testfall fängt welchen Fehler

39 Tests. Die Tabelle des Briefs ist vollständig enthalten (Zeilen 1–4, 6–13
unten), der Rest sind die vom Auftrag verlangten Ränder.

| Test | Fängt |
| --- | --- |
| fünf flache Wochen sind ein Plateau, mit Zahlen (`deepStrictEqual`) | Plateau nicht erkannt; falsche Felder/Rundung; falsche Wochenschlüssel |
| steigende Gewichte sind kein Plateau | steigende Gewichte als Plateau gemeldet |
| unter vier Wochen wird nichts gemeldet | `MIN_WEEKS` ignoriert |
| leere/unbrauchbare Historie (`[]`, `null`, `undefined`, String, Objekte ohne Felder) | wirft statt `null` |
| sinkende Pausen: `restDelta -40`, `avgRestSecs 130` | Vorzeichen vertauscht; Mittelwert falsch |
| `volDelta -400` | Volumenänderung nicht berechnet oder Vorzeichen vertauscht |
| Ausreißer in der Mitte (`h[2].topKg = 82.5`) | Vergleich gegen das Maximum ⇒ Modul meldet nie etwas |
| echte Steigerung am Ende (`h[4].topKg = 85`) | echte Steigerung als Plateau gemeldet |
| Gewicht rauf bei weniger Wiederholungen | Entscheidung allein am Volumen (meldet hier fälschlich ein Plateau) |
| deutlich mehr Volumen bei gleichem Gewicht | Wiederholungsfortschritt als Stillstand gemeldet |
| vier Übungen in 30 min | Priorität ignoriert; Übungen verschluckt; Übung in beiden Listen |
| zwei Übungen in 120 min | streicht bei reichlich Zeit |
| zwei Übungen à 4 Sätze in 5 min | leeres Ergebnis bei sehr wenig Zeit |
| `[]` / `null` / `undefined` / String | wirft |
| mehrere Einträge in derselben Woche | Wochen an Zeilen gezählt statt an Kalenderwochen |
| ausgelassene Woche: `entries 6`, `weeks 7` | Split bei jeder Lücke (meldet dann nichts); `weeks` = Zeilenzahl |
| lange Pause trennt den Verlauf ⇒ `null` | Pause überbrückt, Plateau über einen Layoff behauptet |
| nach langer Pause zählt nur der Abschnitt danach (`weeks 4`, `weekFrom 2026-W32`) | Spanne inklusive Pause gerechnet |
| Plateau über den Jahreswechsel (`weeks 5`, `2026-W51` → `2027-W02`) | Spanne aus Jahres-Wochenzahlen ⇒ fällt in sich zusammen / negativ |
| Reihenfolge der Eingabe ändert die Diagnose nicht | fehlende Sortierung ⇒ Deltas kippen je Aufrufstelle |
| `plateau` verändert die Eingabe nicht | `sort()` auf der Historie des Aufrufers; Hilfsfelder in fremde Objekte geschrieben |
| `isoWeekKey` trifft `2026-W31` | Format/Off-by-one |
| `isoWeekKey` zweistellig (`2026-W02`) | fehlende führende Null |
| ISO-Jahreswechsel (`2025-12-29 → 2026-W01`, `2026-12-31` und `2027-01-01 → 2026-W53`) | Kalenderjahr statt ISO-Jahr; KW 53 fehlt |
| `isoWeekIndex` zählt über den Jahreswechsel weiter; Mo und So derselben Woche gleich | Index aus Jahr×Woche gebaut; Tages- statt Wochenraster |
| `isoWeekKey` bei unbrauchbarem `ts` | `NaN-WNaN` statt `null` |
| `plateauSay` liefert Schlüssel + Platzhalter | fertiger Satz im Modul; falsche Var-Namen |
| `plateauSay` ohne Diagnose | wirft / liefert Platzhalter mit `undefined` |
| `CoachPersona` füllt `plateau` in 4 Tönen × 2 Sprachen | Schlüssel-Tippfehler; Var-Name ≠ Katalog (`{weeks}`/`{secs}`); Restplatzhalter im Satz |
| `prioritizeSay` + `CoachPersona` `timeBudget` | dito für `{mins}`/`{count}` |
| kein/ungültiges Zeitbudget (`0`, `-5`, `undefined`, `null`, String) | leeres Ergebnis; Absturz |
| sortiert wird nach `prio`, nicht nach Eingabereihenfolge | erste Zeile als „wichtigste" behandelt |
| günstige Übung hinter einer zu teuren | `break` statt `continue` beim Füllen |
| `restSecs` schlägt die Vorgabe (20 s: beide passen, Vorgabe: nur eine) | `restSecs` ignoriert / `REST_DEFAULT` nicht angewandt |
| `costSecs` 435 / 255 / 145 / 0 | falsche Kostenformel; Übung ohne `sets` kostet nichts |
| `prioritize` verändert die Übungsliste nicht | `exercises.sort()` ⇒ Eingriff in den gespeicherten Plan |
| ids als Strings, Eintrag ohne id fällt heraus | Typabweichung zur Spec; Absturz auf `id`-loser Zeile |
| Modul ruft nichts im Netz auf (Quelltext-Scan) | `fetch`/`AI_WORKER_URL`/`XMLHttpRequest` ⇒ Block 3 nicht abnahmefähig |
| Konstanten haben die vereinbarten Werte | stille Änderung von 4 / 55 / 90 |

**Mutationsprobe** (Beweis, dass die Negativfälle nicht leer laufen): vier
Mutationen gleichzeitig eingebaut — Gap-Split entfernt, Volumen-Riegel entfernt,
`history.sort()` statt Kopie, `exercises.sort()` — Ergebnis `pass 33 / fail 6`,
genau die zuständigen sechs Tests rot („deutlich mehr Volumen", „lange Pause
trennt", „nach langer Pause", „Reihenfolge der Eingabe", „plateau verändert die
Eingabe nicht", „prioritize verändert die Übungsliste nicht"). Danach
zurückgesetzt, wieder 39/39.

## Gestrichene Testfälle

- **Emoji-Scan über den Modulquelltext.** Das Modul erzeugt keinen Text; die
  Emoji-Freiheit der Sätze prüft `test/coach-persona.test.js` bereits am
  Satzkatalog. Ein zweiter Scan wäre hier immer grün.
- **Separater Test „weekFrom/weekTo sind ISO-Schlüssel".** Aufgegangen im
  `deepStrictEqual` des ersten Tests plus den Jahreswechsel-Tests; als eigener
  Test hätte er nichts zusätzlich gefangen.
- **„Modul liest kein `localStorage` / kein DOM".** Wäre unter `node --test` per
  Konstruktion grün (beides existiert dort nicht) und damit ein Test ohne
  Aussage. Die Regel hält der Quelltext: Daten kommen ausschließlich als
  Argument herein.

## Läufe

**Rot, Schritt 1** (`node --test test/coach-analyze.test.js`, Modul fehlt):
`Cannot find module '../js/coach-analyze.js'` — `tests 1, pass 0, fail 1`.

**Rot, Schritt 2** (Stub, alle Funktionen liefern `null`/leer): `tests 39,
pass 15, fail 24`. Die 15 grünen sind die Negativ- und Reinheitsfälle, die ein
Nichts-Tun-Stub zwangsläufig erfüllt; gegen die fertige Implementierung mit
plausiblen Bugs schlagen sie an (siehe Mutationsprobe).

**Grün:** `node --test test/coach-analyze.test.js` → `tests 39, pass 39, fail 0`.

**Gesamtsuite:** `node --test test/*.js` → `tests 350, pass 350, fail 0`
(Ausgangsstand 222 vor Block 3; 39 davon aus dieser Task, der Rest aus den
parallel gebauten Modulen). Kein bestehender Test gekippt.

**Blockprüfung:** `grep -n "fetch\|AI_WORKER_URL\|XMLHttpRequest"
js/coach-analyze.js` → keine Treffer.

## Hinweise für Task 17

- `prio` aufsteigend = wichtiger. Wird beim Verdrahten anders befüllt, priorisiert
  das Modul verkehrt herum.
- `index.html` hat ein eigenes `getWeekKey()` (Zeile ~12108) mit **anderem**
  Format (`2026-W5`, ohne führende Null, nicht ISO). Dieses Modul rechnet nach
  ISO wie im Plan verlangt. Beide Schlüssel dürfen nicht vermischt werden; die
  Zusammenführung ist nicht Teil dieser Task.
- Die Historie für `plateau` muss je Übung pro Woche **einen** Eintrag liefern
  (`{ts, topKg, vol, avgRestSecs}`); mehrere Einträge pro Woche führen zu einer
  zu kurzen Spanne und damit zu keiner Aussage.
