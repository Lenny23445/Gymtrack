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

