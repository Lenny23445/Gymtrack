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
