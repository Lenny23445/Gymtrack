# Task 20 — Report: `js/coach-report.js` (Wochenzahlen und Ziel-Prognose)

Geändert wurden genau zwei Dateien: `js/coach-report.js` (neu) und
`test/coach-report.test.js` (neu). `index.html`, `sw.js`, `build.js` und
`package.json` sind unberührt — die Verdrahtung ist Task 21.

## Öffentliche API

| Signatur | Rückgabe |
| --- | --- |
| `weekNumbers(sessions, weekStartTs)` | `{vol, sets, workouts, prs, muscles, prevVol, volDelta, streak}` — nie `undefined`, bei leerer Woche alles `0` / `[]` / `{}` |
| `goalForecast(history, goalKg, now)` | `{weeks, goalKg, currentKg}` oder `null` |
| `epley1rm(kg, reps)` | `kg × (1 + reps/30)`, `0` bei `kg <= 0` oder `reps <= 0` |
| `weekStart(ts)` | Montag 00:00 **lokal** als ms, `null` bei unbrauchbarer Eingabe |
| `reportSay(nums)` | `{key:'reportReady', vars:{vol}}` oder `null` |
| `forecastSay(fc, exName)` | `{key:'forecast', vars:{ex, kg, weeks}}` oder `null` |
| Konstanten | `MIN_WEEKS = 4`, `MAX_FORECAST_WEEKS = 52`, `MIN_R2 = 0.7` |

Bauart wie Block 3: IIFE über `globalThis`, `'use strict'`, reine Funktionen,
kein DOM, keine App-Globals, kein `localStorage`, kein Netzaufruf, keine
Systemuhr im Modul. Am Ende `module.exports = API` **und** `root.CoachReport =
API`. Ein Test liest den eigenen Quelltext und hält das fest (M40 unten).

`sessions` und `history` werden nicht angefasst (eigene Listen, eigene
Sortierung) — je ein Test hält das fest.

## Entscheidungen und Begründungen

**Wochenrechnung nicht selbst gebaut.** Die ISO-Wochennummer kommt aus
`CoachAnalyze.isoWeekIndex()` (in Node über `require`, im Browser über das
globale Objekt). Eine zweite Wochenrechnung im Haus läuft irgendwann
auseinander. Das Altformat `2026-W5` aus `index.html` wird nirgends berührt.

**`weekStart` rechnet lokal, die Prognose in UTC.** Das ist kein Bruch, sondern
zwei verschiedene Fragen: die Woche des Nutzers beginnt in *seiner* Zeitzone
(ein Bericht, der den Sonntagabend zur nächsten Woche zählt, widerspricht dem,
was er selbst sieht), während die Prognose nur *Abstände zwischen Wochen*
braucht — dafür ist die UTC-Rechnung aus `CoachAnalyze` die richtige und über
den Jahreswechsel die einzige stetige. Wochen werden über `Date.setDate()`
verschoben, nicht über `+ 7 × 86400000`: an einer Zeitumstellung ist eine Woche
167 oder 169 Stunden lang, und die Wochengrenze verschöbe sich um eine Stunde.

**Prognose-Formel.** Lineare Regression der geschätzten Maxima
(`epley1rm(kg, reps)`) über die ISO-Wochennummer als x-Achse — bewusst die
Wochennummer und nicht die Listenposition: sonst zählte eine dreiwöchige Pause
als eine Woche und der Verlauf sähe steiler aus, als er war.

```
weeks = ceil((goalKg − currentKg) / slope)  +  (Wochen seit der letzten Datenwoche)
currentKg = Trendwert der letzten Woche mit Daten (nicht der Rohwert)
```

*Warum der Trendwert und nicht die letzte Messung als Basis:* eine einzelne
starke oder schwache Woche verschöbe sonst die ganze Prognose. *Warum die
Wochen seit der letzten Datenwoche dazukommen:* ein alter Verlauf schiebt sich
so von selbst nach hinten und fällt irgendwann über die 52-Wochen-Grenze
heraus, statt zu tun, als sei der Nutzer in der Zwischenzeit weitergewachsen.
Genau das macht das Argument `now` tragend statt dekorativ.

**Ab wann sie schweigt** (jede Regel einzeln, `null` als Rückgabe):

1. weniger als `MIN_WEEKS = 4` **Kalenderwochen** (nicht Einträge) — mehrere
   Einträge derselben Woche werden auf den besten zusammengefasst, sonst
   erschliche sich eine fleißige Woche das Gewicht von vier Messungen;
2. kein Ziel oder kein brauchbarer Zeitpunkt;
3. Steigung nicht positiv — Stillstand und Rückgang sind kein Fortschritt;
4. Bestimmtheitsmaß unter `MIN_R2 = 0.7` — ein Zickzack mit zufällig positiver
   Steigung ist kein Trend. Das ist die Regel, die dem Coach das Versprechen
   verbietet, und der zugehörige Test ist der wichtigste der Datei;
5. Ziel bereits erreicht, in **zwei** Lesarten: die Trendlinie steht schon
   darüber **oder** es stand in einer Woche real schon einmal da. Die zweite
   Lesart ist die wichtigere — wer 128 kg gehoben hat, lässt sich nicht sagen,
   er brauche dafür noch eine Woche. Beide Lesarten haben einen eigenen Test
   (siehe M05/M06), weil sie sich nur bei nicht-monotonen Verläufen
   unterscheiden;
6. weiter als `MAX_FORECAST_WEEKS = 52` voraus.

Einträge ohne Gewicht oder ohne Wiederholung fallen aus der Reihe heraus statt
als `0` mitzurechnen (eine 0 erfände einen Einbruch, den es nie gab); Einträge
nach `now` zählen nicht mit. `Math.ceil` statt `Math.round`: aufgerundet wird
immer, damit nie „in 0 Wochen" herauskommt.

**Das Modul formuliert nichts.** `reportSay`/`forecastSay` liefern nur
`{key, vars}` für `CoachPersona.say()`. `forecastSay` **schweigt ohne
Übungsnamen**: die Vorlage lautet „… sind {kg} kg bei {ex} in {weeks} Wochen
erreichbar", und ohne `{ex}` bliebe „… bei in 6 Wochen erreichbar" stehen.
Einen Satzschlüssel ohne `{ex}` gibt es für die Prognose nicht, und
`coach-persona.js` gehört nicht zu dieser Task — also lieber kein Satz als ein
halber. `reportSay` schweigt bei Volumen 0: „Wochenbericht da, 0 kg" ist keine
Auskunft (Gestaltungsregel 8), dafür gibt es die Rückhol-Meldung.

**Keine erfundene Sammel-Muskelgruppe.** `muscles` ist die Verteilung über die
Sätze, die eine Muskelgruppe *tragen*. Sätze ohne Angabe zählen in `vol` und
`sets`, aber nicht in die Verteilung; die Summe der Muskelwerte kann darum
unter `vol` liegen. Die Alternative wäre ein Eimer `sonstige` gewesen — den
hätte `muscleLabel()` in `index.html` als leeres Label gerendert, und der
Nutzer läse eine Muskelgruppe, die es nicht gibt. **Hinweis für Task 21:**
`muscles` nicht als vollständige Aufteilung von `vol` darstellen.

**Weitere Festlegungen.** Bodyweight-Sätze (0 kg) zählen als Satz und als
Einheit, aber nicht ins Volumen und nicht in die Verteilung (0 kg ist kein
Anteil). Ein Gewicht, das keine Zahl ist, ist ein kaputter Eintrag und fällt
heraus — sonst stünde `NaN` kg im Bericht. Volumen, Vorwochenvolumen und
Muskelwerte kommen auf ganze Kilo gerundet. `prs` enthält `{ex, kg, reps}`
(ein Rekord ohne Übungsnamen ließe sich nirgends benennen und fällt heraus).
`streak` bleibt `0` — den Wert hält `index.html`; ein Modul, das ihn aus drei
Wochenzahlen selbst schätzt, widerspräche der Anzeige.

**Nicht gebaut:** kein Änderungsvorschlag am Trainingsplan (Block 6), keine
Abhängigkeit auf `CoachNotify`, kein Modellaufruf. Epley wird nach oben nicht
gedeckelt: die Formel ist bei sehr vielen Wiederholungen ungenau, aber eine
stille Deckelung wäre eine Regel, die niemand vereinbart hat.

## Läufe

| Lauf | Ergebnis |
| --- | --- |
| Rot 1 (`node --test test/coach-report.test.js`, Modul fehlt) | `MODULE_NOT_FOUND` — 1 Fehlschlag |
| Rot 2 (Gerüst mit `null`/Nullen) | **53 Tests, 26 grün, 27 rot** — gelesen: `epley1rm` 0 statt 103.33, `weekStart` null, `weekNumbers` alles 0, jede Prognose `null` |
| Grün (Implementierung) | 53/53; nach den zwei aus der Mutationsprobe nachgezogenen Tests **55/55** |
| Gesamtsuite `node --test test/*.js` | **517/517 grün** (Ausgangsstand 462 + 55 neue); kein bestehender Test gekippt |

Ein Fehlschlag im ersten grünen Lauf war lehrreich: der Bauart-Test
(`/Date\.now\(/` im eigenen Quelltext) schlug wegen meines eigenen
Kommentartextes an. Der Riegel blieb streng, der Kommentar wurde umformuliert.

## Mutationsprobe

40 Mutationen, je einzeln auf einer Kopie im Scratchpad
(`scratchpad/mutate-task20.js`, Repo unberührt). **37 von 40 getötet.**

Wichtigste Zuordnung Regel → Test (vollständig in `mut-out.txt`):

| Mutation | tötet |
| --- | --- |
| M01 `MIN_WEEKS` 4→2 | dünne Grundlage (3 Wochen), Wochen-Zusammenfassung, Einträge ohne Gewicht |
| M02 Steigungs-Riegel weg | „ein fallender Verlauf wird nicht in die Zukunft verlängert" |
| M03 `MIN_R2` 0.7→0 | **„ein unruhiger Verlauf ergibt keine Prognose"** |
| M04 `MAX_FORECAST_WEEKS` 52→5000 | „weiter als ein Jahr voraus", „ein alter Verlauf trägt die Prognose nicht mehr" |
| M05 Bestwert-Riegel weg | „was in einer Spitzenwoche schon einmal stand, gilt als erreicht" |
| M06 Trendwert-Riegel weg | „ein Ziel unterhalb der Trendlinie ergibt keine null Wochen" |
| M07 `now` ignoriert | „liegt die letzte Einheit zurück, wandert das Ziel nach hinten", alter Verlauf |
| M08 keine Wochen-Zusammenfassung | „acht Einträge in drei Wochen sind drei Wochen" |
| M09 x = Listenposition statt Woche | 10 Tests, darunter Jahreswechsel und Lücke im Verlauf |
| M10/M11 Wochengrenze / Vorwochenfenster | scharfe Wochengrenze, Vorwochen-Differenz |
| M12 Muskelriegel weg | Bodyweight-Satz, Satz ohne Muskelangabe |
| M13/M14 `reportSay`/`forecastSay` ohne Riegel | „ohne Volumen kein Bericht", „ohne Übungsname kein Satz" |
| M15/M16/M29 Epley | die drei Epley-Tests (Nenner 30, `kg<=0`, `reps<=0`) |
| M17 Wochenstart am Sonntag | alle drei `weekStart`-Tests plus Wochengrenze |
| M18/M19/M21 Satz- und Einheitenriegel | Einheit ohne Satz, `NaN`-Schutz, PR ohne Namen |
| M23/M27/M28 Rundung weg | „das Volumen kommt in ganzen Kilo" |
| M26 `ceil`→`round` | Prognose-Tests inkl. „nie null Wochen" |
| M39 falscher Satzschlüssel | `reportSay`-Test und Vollständigkeitstest |
| M40 Systemuhr im Modul | Bauart-Test |

**Zwei Tests wurden wegen der Probe nachgezogen** (beide überlebende
Mutationen sind danach tot):

* M21 (PR ohne Übungsnamen wird gesammelt) überlebte → neuer Test
  „ein Rekord ohne Übungsnamen kommt nicht in den Bericht".
* M23/M27/M28 (Rundung entfällt) überlebten, weil alle Fixtures binär-exakte
  Gewichte hatten → neuer Test mit 6,8 kg (Pfund-Steckgewicht), der Woche,
  Vorwoche und Muskelwerte auf ganze Kilo festnagelt.

**Drei Überlebende, alle als äquivalente Mutanten belegt** (kein fehlender
Test, sondern kein beobachtbarer Verhaltensunterschied — empirisch geprüft
durch Differenzläufe Original gegen Mutant):

* **M22** `slope <= 0` → `slope < 0`: bei Steigung exakt 0 ist `sxy = 0`, also
  entweder `r² = 0` (unter `MIN_R2`) oder — bei völlig flacher Reihe — Division
  durch 0 und damit `Infinity > MAX_FORECAST_WEEKS`. Beide Wege enden in
  `null`. 200 000 Zufallsfälle, **0 Unterschiede**.
* **M36** Ziel-Riegel weg: ein unbrauchbares Ziel wird zu `null` und `null <=
  currentKg` ist wegen der Zahl-Umwandlung wahr, der Erreicht-Riegel fängt es.
  50 000 Fälle, **0 Unterschiede**.
* **M37** Zeitpunkt-Riegel weg: `isoWeekIndex(null)` liefert `null`, der
  nachfolgende Riegel fängt es. 50 000 Fälle, **0 Unterschiede**.

Die drei Riegel bleiben trotzdem stehen: sie sagen die Absicht explizit, statt
sie einer Typumwandlung und einer Division durch null zu überlassen.

## Testfälle: gestrichen, verschärft, bewusst behalten

* **Gestrichen: keiner.** Alle 14 Zeilen der Testfall-Tabelle aus dem Brief
  sind enthalten.
* **Verschärft:** `goalForecast(6 Wochen +2.5, 130, MO)` fordert der Brief mit
  `0 < n < 100`. Das bliebe bei fast jedem Rechenfehler grün (falscher Nenner,
  fehlende Anrechnung vergangener Wochen, Rohwert statt Trendwert). Der Test
  nagelt `weeks === 6`, `Number.isInteger(weeks)`, die Obergrenze 52 und
  `currentKg` fest — und tötet damit M07, M09, M15 und M26.
* **Verschärft:** „leere Woche → alle Zahlen 0" ist ein `deepStrictEqual` über
  die ganze Rückgabe, damit auch die *Form* (`prs: []`, `muscles: {}`,
  `streak: 0`) festliegt.
* **Bewusst behalten, obwohl von keiner Mutation getötet:** „Stillstand ist
  kein Fortschritt" (Brief-Vorgabe). Der flache Verlauf ist doppelt abgeriegelt
  (Steigungs-Riegel *und* 52-Wochen-Deckel über die Division durch null), kein
  Einzeldefekt kann daraus eine Prognose machen. Der Test bleibt trotzdem: er
  hält die Zusage fest, sobald jemand die Division durch null künftig mit einem
  Ersatzwert abfängt. Dieselbe Begründung gilt für die drei Vertrags-Tests
  „fasst die übergebene Liste nicht an" und „ein PR der Vorwoche steht nicht im
  Bericht dieser Woche" — sie sichern gegen einen naheliegenden späteren Umbau
  (Sortieren an Ort und Stelle, PR-Sammlung außerhalb des Wochenfensters).

## Pflicht-Tests aus dem Auftrag

* **Vollständigkeit über den gerenderten Satz:** jede Rückgabe geht durch
  `CoachPersona.say()` in **vier Tönen × zwei Sprachen** und wird geprüft auf
  Reste `/\{[a-z]+\}/i`, leeren String, doppelte Leerzeichen und Emojis. Ein
  zweiter Test prüft, dass die Zahlen wirklich im Satz landen (1.460 / 1,460
  je nach Sprache, Ziel 130, 6 Wochen) — das fängt umbenannte Platzhalter.
* **Prognose verspricht nichts:** ein eigener Test prüft in allen acht
  Kombinationen, dass der Satz eine Bedingung trägt (`wenn` / `if`) und keine
  Zusage (`garantiert`, `sicher`, `guaranteed`, …).

## Offene Punkte für Task 21

1. `streak` mit dem vorhandenen Streak-Wert füllen.
2. `muscles` nicht als vollständige Aufteilung von `vol` darstellen (Sätze ohne
   Muskelgruppe fehlen dort bewusst).
3. `forecastSay` braucht einen Übungsnamen, sonst schweigt es — beim Verdrahten
   den Namen der Zielübung mitgeben.
4. Wochenschlüssel-Altformat (`2026-W5`) in `index.html` bleibt unangetastet;
   die Zusammenführung ist Task 21/22.
