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

