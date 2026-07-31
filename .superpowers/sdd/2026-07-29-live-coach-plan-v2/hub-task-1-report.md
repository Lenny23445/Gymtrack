# Task 1 — `js/coach-charts.js`: Diagramme als reine Konfiguration

**Plan:** `docs/superpowers/plans/2026-07-31-coach-hub-umbau.md`, Task 1
**Spec:** `docs/superpowers/specs/2026-07-31-coach-hub-design.md`, „Die fünf Kacheln → 2. Woche"
**Geändert:** `js/coach-charts.js` (neu), `test/coach-charts.test.js` (neu). Sonst nichts.

---

## Öffentliche API

| Signatur | Rückgabe |
| --- | --- |
| `volumeBars(weeks, opts)` | Chart.js-Konfiguration (`type:'bar'`) oder `null`. `weeks = [{weekKey:'2026-W23', vol}]`, jüngste zuletzt. |
| `muscleBars(muscles, opts)` | Chart.js-Konfiguration (`type:'bar'`, `options.indexAxis:'y'`) oder `null`. `muscles = [{id, label, vol}]`. |
| `oneRmLine(points, goal, opts)` | Chart.js-Konfiguration (`type:'line'`, ein oder zwei Datensätze) oder `null`. `points = [{weekIndex, kg}]`, `goal` = Ergebnis von `CoachReport.goalForecast()`. |
| `MIN_BARS` | `2` — ein einzelner Balken ist kein Verlauf. |
| `MIN_POINTS` | `4` — dieselbe Grenze wie `CoachReport.MIN_WEEKS`. |
| `MAX_BARS` | `8` — Spanne der Kachel. |
| `MAX_SPAN` | `26` — höchste Breite der Wochenachse im Bestwert-Verlauf. |

`opts = {accent, muted, lang, unit, reduceMotion}`. Alle optional; ohne `opts` wird eine Konfiguration ohne Farben und ohne Einheit gebaut, es wird nicht geworfen.

Form nach `js/coach-log.js`: IIFE über `globalThis`, `'use strict'`, `module.exports = API` **und** `root.CoachCharts = API`.

---

## Entscheidungen mit Begründung

### Untergrenzen
`MIN_BARS = 2`, `MIN_POINTS = 4`. Die vier sind nicht frei gewählt: `CoachReport.MIN_WEEKS` ist ebenfalls 4. Zwei verschiedene Grenzen hießen, die Kachel zeigt eine Bestwert-Linie, zu der die Prognose daneben schweigt.

### `null` statt leerer Konfiguration
Jeder Verzichtsfall gibt `null`. Die Tests halten das mit `assert.strictEqual(x, null)` fest, nicht mit `assert.ok(!x)` — Letzteres ließe genau den naheliegenden Fehler durch (leere Konfiguration statt Verzicht). Die Mutation „`null`-Rückgabe durch leere Konfiguration ersetzt" bringt sechs Tests um.

### Aussehen aus den bestehenden Diagrammen kopiert, nicht geholt
`xTicks`, `valueAxis`, `pointRadius`, `fillFor` sind Zeile für Zeile `_cXT`, `_cYT`, `_cPR`, `_accFill` aus `index.html` (Werte identisch: `#8e8e93`, `rgba(120,120,128,.08)`, `rgba(140,140,150,.85)`, Gradientenstopps `3D`/`14`/`00`). Kopiert, weil die Originale ein Zeichenfeld entgegennehmen und damit an der Oberfläche hängen — importierbar sind sie nicht. Keine neuen Farbwerte: alles Übrige kommt über `opts.accent`/`opts.muted` herein.

### Der Farbverlauf unter der Linie als Funktion
Alle vier bestehenden Linien-Diagramme haben eine Füllung mit Verlauf. Der braucht das Zeichenfeld, das erst beim Zeichnen existiert. Darum ist `backgroundColor` eine Chart.js-Funktion (scriptable option); Chart.js reicht den Kontext herein, das Modul selbst fasst nichts an. Ist `accent` keine sechsstellige Hexfarbe, entsteht **gar kein** Verlauf (`'transparent'`) — `'rgb(0,122,255)' + '3D'` wäre ein Farbwert, den niemand vereinbart hat.

### Trendlinie nur mit Zielzahl **und** Wochenzahl
`goal` ist die Ausgabe von `CoachReport.goalForecast()`, also `{goalKg, weeks}` (`kg` wird als Schlüssel mitgelesen, damit die Aufrufstelle nicht umpacken muss). Eine **blanke Zahl** ergibt keine Trendlinie: wie lange es dauert, weiß allein die Prognose. Würde das Modul den Zeitraum selbst schätzen, hätte die App zwei Regressionen, die auseinanderlaufen — genau das, was `js/coach-report.js` in seinem Kopfkommentar für die Wochenrechnung ausschließt. Ebenso keine Trendlinie zu einem bereits erreichten Ziel.

Der Endpunkt der Trendlinie wird **gesetzt**, nicht gerechnet: `80,2 + (116,8 − 80,2) × 7/7` ergibt in Gleitkomma `116.79999999999998`.

### Trainingspausen bleiben Lücken (`oneRmLine`)
Die Wochenachse wird über die Spanne `erste … letzte Woche` aufgebaut, fehlende Wochen tragen `null`, `spanGaps: false`. Sonst zöge sich eine dreiwöchige Pause zu einer Position zusammen und der Verlauf sähe steiler aus, als er war — dieselbe Begründung, mit der `goalForecast` die Wochennummer und nicht die Listenposition als x-Achse nimmt. `MAX_SPAN = 26` verhindert, dass nach einem Jahr Pause vier Punkte an einer 52-Positionen-Achse kleben.

### Sortiert wird nur, wo Sortierung die Aussage ist
- `volumeBars`: **keine** Sortierung. Die Reihenfolge kommt zeitlich aus dem Berichtsarchiv; nach Volumen sortiert sähe das Bild wie ein Verlauf aus und wäre keiner.
- `muscleBars`: absteigend nach Volumen. Die Frage der Kachel ist, woran diese Woche gearbeitet wurde.
- `oneRmLine`: aufsteigend nach `weekIndex`, je Woche der höchste Wert (es ist ein Bestwert-Verlauf).

### Was wegfällt und was bleibt
- `volumeBars`: eine Woche mit Volumen **0 bleibt** — eine Pause ist eine Aussage. Ohne `weekKey` oder ohne Zahl fällt sie weg (keine Beschriftung, keine Höhe).
- `muscleBars`: Gruppe ohne Beschriftung fällt weg. Die Kennung als Ersatz wäre eine erfundene Beschriftung. Gruppe mit Volumen 0 fällt weg — null ist kein Anteil an einer Verteilung.

### Balkenachsen beginnen bei null
`beginAtZero: true` auf der Wertachse beider Balkendiagramme. Ohne das übertreibt ein Balkenbild Unterschiede — dieselbe Sorte Lüge wie die eingeebnete Pause.

### Sprache und Einheit
`opts.lang` entscheidet über die Wochenbeschriftung (`KW 23` / `Week 23`, Form aus dem bestehenden `_crLabel`), über die Datensatznamen (`Bestwert`/`Prognose` gegen `Best`/`Forecast`), über die Offset-Beschriftung der Bestwert-Achse (`-3 Wo.` / `zuletzt` / `+2 Wo.` gegen `-3 wk` / `latest` / `+1 wk`) und über die Tausendertrennung (`12.500` gegen `12,500`). Unbekannte Sprache fällt auf Deutsch zurück, nicht auf leeren Text.

`opts.unit` beschriftet nur. Die Werte gehen **unverändert** durch. Fehlt `unit`, wird keine erfunden.

### Bewusste Abweichungen vom bestehenden Aussehen (zwei Stück)

1. **Kein Tonnen-Kürzel.** `fmtKg()` in `index.html` schreibt ab 1000 „12.5 t" — und zwar unabhängig von der Einheitseinstellung, das Kürzel ist dort fest kg-gebunden. Für ein Modul, das lbs-Nutzer korrekt beschriften muss, ist das unbrauchbar („12.5 t" bei lbs wäre falsch). Darum volle Zahl mit Tausendertrennung plus `opts.unit`.
2. **Balken statt Linien.** Die App hat bisher nur Linien-Diagramme; für Balken gab es kein Vorbild. Übernommen sind Achsen, Schriftgrößen, Rasterfarben und die abgeschalteten Legenden; hinzugekommen sind `borderRadius: 4` und `maxBarThickness` — passend zur runden Glasoptik, ohne neue Farbwerte.

### Zwei Zusätze über die Plan-Schnittstelle hinaus

1. **`MAX_BARS = 8`.** Das Berichtsarchiv (`CR_MAX = 8`) plus die laufende Woche ergäbe neun Balken in einem Bild, das laut Spec acht Wochen zeigt. `volumeBars` schneidet auf die jüngsten acht.
2. **`opts.reduceMotion`.** Die Spec verlangt, dass `prefers-reduced-motion` **alle** Übergänge auf 0 ms setzt. Chart.js-Animationen sind kein CSS und ließen sich aus einer Media-Query heraus sonst nicht erreichen; das Modul darf die Abfrage nicht selbst lesen. Also trägt die Aufrufstelle das Ergebnis herein. **Task 3 muss `reduceMotion` setzen**, sonst animieren die Diagramme trotz gesetzter Regel.

---

## Welcher Testfall fängt welchen Fehler

Die Testfall-Tabelle des Plans ist vollständig abgedeckt. Kein Fall wurde gestrichen. Zusätzlich (Auswahl):

| Testfall | Gefangener Fehler |
| --- | --- |
| `volumeBars` genau an `MIN_BARS` liefert Diagramm | Grenze um eins verschoben |
| Woche mit Volumen 0 bleibt | Pause als fehlende Zahl behandelt |
| Wochen ohne `weekKey`/Zahl fallen weg | Balken ohne Beschriftung |
| höchstens acht Wochen, die jüngsten | neun Balken in einem Achtwochenbild |
| Balkenachse beginnt bei null | Balkenbild übertreibt Unterschiede |
| `muscleBars`: Gruppe mit leerem Label / Volumen 0 fällt weg | Balken ohne Namen, Nullanteil in einer Verteilung |
| `muscleBars`: `autoSkip: false` | übersprungene Gruppe |
| `oneRmLine` sortiert nach Wochennummer | Linie in Eingabereihenfolge |
| Pause bleibt Lücke, `spanGaps: false` | Verlauf sieht steiler aus, als er war |
| je Woche der höchste Wert | Bestwert-Verlauf zeigt nicht den Bestwert |
| Punkte jenseits `MAX_SPAN` fallen weg | Jahresachse mit vier Punkten |
| `goal` als blanke Zahl / ohne `weeks` / `weeks: 0` | erfundener Prognosezeitraum |
| Ziel bereits erreicht | Trendlinie hinter dem Ist |
| Ziel exakt getroffen (80,2 → 116,8 in 7 Wochen) | Endpunkt gerechnet statt gesetzt, Gleitkommafehler |
| Farbverlauf: Stopps aus `opts.accent` | eigener Farbwert im Modul |
| Farbverlauf: nicht-hexadezimale Farbe → `transparent` | zusammengebastelter Farbwert |
| Farbverlauf: fehlendes/werfendes Zeichenfeld | Diagramm sprengt sich beim Zeichnen |
| übergebene Listen bleiben unverändert | Modul schreibt in die Daten der Aufrufstelle |
| Quelle ohne `document`/`window`/Speicher/`new Date`/`fetch`/`require` | Oberflächen-, Speicher- oder Uhrenbindung |
| Quelle ohne `new Chart(` | Modul zeichnet statt zu konfigurieren |
| kein `\p{Extended_Pictographic}` in Quelle, Konfiguration und erzeugten Texten | Emoji in der Oberfläche |

**Gestrichene Testfälle: keiner.** Ein Kandidat wurde aber **verschärft** statt gestrichen: „`oneRmLine` genau an der Untergrenze liefert ein Diagramm" prüfte zuerst nur `assert.ok(cfg)` — das ist auch von einer leeren Konfiguration erfüllt und blieb im Stub-Lauf grün. Er prüft jetzt zusätzlich `datasets[0].data.length === MIN_POINTS`.

---

## Läufe

### Rot
1. `node --test test/coach-charts.test.js` ohne Modul → `Cannot find module '../js/coach-charts.js'`, `tests 1, pass 0, fail 1`.
2. Gegen einen Stub, dessen drei Funktionen `{}` zurückgeben: **56 Tests, 7 grün, 49 rot.** Der Zweck dieses zweiten roten Laufs: ein Test, der schon gegen eine leere Umsetzung grün ist, prüft nichts. Von den sieben waren sechs erklärbare Wächter (Quellen-Scans auf Emoji/Oberfläche/`new Chart`, Exportform, Unversehrtheit der Eingabelisten — die greifen nur bei aktivem Fehlverhalten). Der siebte war der oben genannte schwache Fall, er wurde verschärft.

### Grün
- `node --test test/coach-charts.test.js` → **57 Tests, 57 grün, 0 rot.**
- `node --test test/*.js` → **574 Tests, 574 grün, 0 rot.** Ausgangsstand 517, kein bestehender Test gekippt.

---

## Mutationsprobe

Kopie in `<scratchpad>/mut1`, Repo unberührt. 15 Mutationen, Skript `mutate.js` setzt jede einzeln auf die Kopie und liest die Zahl der roten Tests.

| Mutation | Ergebnis |
| --- | --- |
| `MIN_BARS` aufgehoben | tot (4 Tests) |
| `MIN_POINTS` aufgehoben | tot (5) |
| Sortierung in `muscleBars` entfernt | tot (4) |
| Akzentfarbe auf allen Balken (`volumeBars`) | tot (1) |
| Trendlinie ohne Ziel erzeugt | tot (1) |
| `null`-Rückgabe durch leere Konfiguration ersetzt | tot (6) |
| Wochen in `volumeBars` nachsortiert | tot (6) |
| Trainingspause eingeebnet | tot (1) |
| Einheit ignoriert, kg fest verdrahtet | tot (4) |
| Sprache ignoriert, immer deutsch | tot (4) |
| Balkenachse beginnt nicht bei null | tot (2) |
| Gruppe ohne Label bekommt die Kennung | tot (2) |
| Trendlinie endet nicht exakt auf dem Ziel | **überlebte zunächst** → Test ergänzt → tot (1) |
| Trendlinie zu bereits erreichtem Ziel | tot (1) |
| Farbverlauf aus eigener Farbe statt `opts.accent` | tot (1) |

**Erster Durchgang: 14 tot, 1 überlebt.** Der Überlebende war echt: die alten Testzahlen (115 → 135 in 4 Wochen) sind in Gleitkomma exakt, die Zuweisung des Endpunkts damit rechnerisch redundant. Ein Nutzer mit 80,2 kg und Ziel 116,8 kg in 7 Wochen hätte eine Trendlinie bekommen, die auf `116.79999999999998` endet. Test „oneRmLine trifft das Ziel exakt, auch wo die Rechnung daneben läge" ergänzt.

**Zweiter Durchgang: 15 von 15 tot, 0 überlebt.**

---

## Für Task 3 zu beachten

1. `opts.reduceMotion` bei gesetztem `prefers-reduced-motion` mitgeben, sonst animieren die Diagramme trotz Regel.
2. `goal` als `CoachReport.goalForecast()`-Ergebnis durchreichen (`{goalKg, weeks}`). Eine blanke Zielzahl ergibt bewusst **keine** Trendlinie.
3. Werte in der **Anzeigeeinheit** hereingeben und `opts.unit` passend setzen — das Modul rechnet nicht um.
4. `null` heißt: den Bereich ganz weglassen. Kein leerer Rahmen.
5. `opts.accent` sollte eine sechsstellige Hexfarbe sein (wie `getComputedStyle(...).getPropertyValue('--acc')` sie liefert), sonst entfällt der Verlauf unter der Bestwert-Linie.
6. `js/coach-charts.js` muss in `index.html` und in die Cache-Liste von `sw.js` — beides gehört nicht zu Task 1.
