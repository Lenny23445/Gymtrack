# Fix-Welle zur Abschluss-Review des Coach-Hub-Umbaus

Datum: 2026-07-31 · Branch `main` · eine Welle, keine zweite.
Geändert: `index.html`, `js/coach-report.js`, `hub-check.js`, `task-19-check.js`,
neu `fix-check.js`. `APP_VERSION`, `CACHE` und der Changelog wurden **nicht**
angefasst (`gymtrack-v202607310001` steht unverändert).

Für jeden Befund gilt dieselbe Reihenfolge: **erst der Test, der ihn rot zeigt,
dann der Fix.** Der Rot-Lauf steht unten je Befund mit dem gemessenen Wert.

---

## Testzahlen

| Suite | vorher | nachher |
|---|---|---|
| `node --test test/*.js` | 574/574 | **574/574** |
| `fix-check.js` (neu, Port 8804) | **3/14** | **14/14** |
| `hub-check.js` (55 → 56 Prüfungen) | **55/56** | **56/56** |
| `task-19-check.js` | **26/27** | **27/27** |
| `block5-fix-check.js` | 28/28 | 28/28 |
| `task-22-check.js` | 24/24 | 24/24 |
| `task-21-check.js` | 22/22 | 22/22 |
| `task-17-check.js` | 23/23 | 23/23 |
| `block3-fix-check.js` | 21/21 | 21/21 |
| `task-10-check.js` | 46/46 | 46/46 |
| `task-9-check.js` | 20/20 | 20/20 |
| `lang-check.js` | 4/4 | 4/4 |

Die Skripte haben feste Ports und liefen nacheinander, nie parallel.
`fix-check.js` setzt Zeitzone (`Europe/Berlin`, Node **und** Chromium) und Uhr
fest — die drei Zeitbefunde hängen an der Frühjahrsumstellung vom 29.03.2026 und
wären im Juli sonst grün.

---

## Critical 1 — ein Kraftziel wurde zum Arbeitsgewicht

**Test** (`fix-check.js`, drei Prüfungen): eine Übung ohne jede Historie
(`Latzug`, `ex3`) bekommt ein Ziel von 100.

Rot gemessen am ungefixten Baum:

```
{"vorher":null,"nachher":100,"kand":["ex0","ex1","ex2","ex3"],"verlauf3":0,
 "target":[0,0,0,100],"hinweis":"","warmup":"leiter"}
```

`getSuggestedWeight()` sprang von `null` auf `100`, ohne dass ein Hinweis
erschienen wäre — genau der Befund.

**Änderung** — der Riegel sitzt an **beiden** Stellen:

- `_chGoalCandidates()` bietet nur noch Übungen mit
  `_crHistory(id).length >= CoachReport.MIN_WEEKS` (4) an. Darunter liefert
  `_crGoal()` ohnehin nie eine Prognose; es geht keine Funktion verloren.
- `coachSetGoal()` prüft dieselbe Schwelle **selbst**, bevor geschrieben wird.
  Die Auswahl ist nur die Oberfläche; `coachSetGoal()` ist der einzige
  Schreibpfad, und die Zusicherung „ein Ziel wird nie zum Arbeitsgewicht" darf
  nicht daran hängen, über welche Fläche man hereinkommt. Abgelehnt wird mit
  einem Hinweis, der den Grund nennt (DE/EN, Übungsname und Wochenzahl im Satz).
- `_chGoalHTML()`: gibt es **gar keine** Übung mit genug Verlauf, steht statt
  einer leeren Chip-Reihe der Grund da und was zu tun ist. Zusätzlich wird die
  gemerkte Übung gegen die Kandidatenliste geprüft — sonst zeigte die Reihe
  keinen markierten Chip und der Speicherknopf liefe ins Leere.

**Grün**: `getSuggestedWeight()` bleibt `null`, `targetWeight` bleibt 0, es gibt
einen Hinweis. Gegenprobe in derselben Datei: eine Übung **mit** Verlauf lässt
sich weiterhin als Ziel setzen (genau eine gleichzeitig, ohne Hinweis).

### Nebenbefund (mitgeprüft, nicht geändert)

`coachSetGoal`/`coachClearGoal` nullen **alle** `targetWeight`. Das ist heute
verlustfrei: jede Anlagestelle (`index.html:15322`, `:20809`, `:20937`, `:20941`,
`:24076`, `:29353`, `:29784`, `:30042`) schreibt `targetWeight: 0`, und nach
dieser Welle ist `coachSetGoal()` der einzige Weg zu einem Wert ≠ 0.

`S.exercises` geht als ganzes Feld in den Cloud-Push (`_pushToCloud`,
`index.html:30826`). Zwei Punkte bleiben offen und stehen bewusst **nicht** in
dieser Welle, weil beide den Sync anfassen würden:

1. Weder `coachSetGoal` noch `coachClearGoal` erhöhen `ex.updatedAt`. `_mergeData`
   (`:30915`) entscheidet je Übung über genau dieses Feld — die Cloud gewinnt bei
   Gleichstand. Ein auf Gerät A gesetztes Ziel kann also von einem älteren
   Cloud-Stand überschrieben werden, und ein entferntes Ziel von Gerät B wieder
   auftauchen. Schmaler Fall (zwei Geräte, ein Ziel), aber real.
2. `coachClearGoal()` schreibt auch dann alle Übungen an, wenn gar kein Ziel
   gesetzt war — ein Push ohne Änderung.

---

## I1 — Vorwoche über Millisekunden statt Kalender

**Test** (`fix-check.js`, zwei Prüfungen): Uhr auf **Mo 30.03.2026 10:00**, also
die Woche nach der Umstellung. Fixture bewusst so, dass beide Lesarten
unterscheidbar sind:

| Woche | Einheiten | Sätze | Volumen |
|---|---|---|---|
| 16.03 (falsch) | 2 | 2 | 1.000 kg |
| 23.03 (richtig) | 1 | 3 | 1.500 kg |
| 30.03 (laufend) | 1 | 4 | 2.000 kg |

Rot gemessen: `_aicWeek()` lieferte `prev: 1000` statt `1500`; die Kachel zeigte
`↓ 50 % / ↑ 100 % / ↑ 100 %` statt `→ 0 % / ↑ 33 % / ↑ 33 %`.

**Änderung**

- `js/coach-report.js` exportiert `shiftWeeks` — die Kalenderrechnung bleibt im
  Modul und wird nicht in `index.html` nachgebaut.
- `_aicWeek()` liest jetzt `n.prevVol` (intern schon über `shiftWeeks` gerechnet);
  der zweite `weekNumbers()`-Lauf ist gestrichen.
- `_chWeekNumsHTML()` holt die Vorwoche über `CoachReport.shiftWeeks(ws, -1)` —
  es braucht dort zusätzlich `workouts` und `sets`, die `prevVol` nicht trägt.

Eine statische Prüfung hält fest, dass in `_aicWeek`, `_chWeekNumsHTML` und
`_chWeekBarData` **kein** `7 * 864e5` mehr im Code steht (Kommentare
ausgenommen — gemessen wird der Code, nicht die Erklärung).

---

## I2 — Karte und Kachel zeigten verschiedene Zahlen

**Test** (`fix-check.js`, zwei Prüfungen): Archivbericht für die laufende Woche
mit `vol: 1000`, danach eine weitere Einheit — Gesamtvolumen aus den Einheiten
2.000. Rot gemessen:

```
kachel: "1.000 kg → 0 %"   karte: "2.000 kg ↑ 100 %"   balken: 1000
```

### Entscheidung: **die Quelle ist der Trainingslog, nicht das Archiv — für die laufende Woche.**

Umgesetzt in `_crCurrent()`: liegt für die laufende Woche ein Bericht im Archiv,
trägt er weiter seinen **Text** und seine **Prognose** (die sind am Termin
geschrieben worden und werden nicht neu erfunden), die **Zahlen** kommen aber aus
den Einheiten. Für abgeschlossene Wochen bleibt der Archivwert maßgeblich
(`_crArchivHTML`, `_chWeekBarData`). Der gespeicherte Bericht wird dabei nicht
angefasst — es entsteht eine flache Kopie, der Renderer läuft synchron und
schreibt nicht.

**Begründung.** Die Gegenrichtung wäre gewesen, die Heute-Karte ebenfalls aus
`_crCurrent()` zu lesen. Dann zeigten beide Flächen dieselbe Zahl — aber die
falsche: der Bericht läuft Sonntag 18:00, und wer danach noch trainiert, sähe
seine Einheit den Rest des Abends nirgends. Eine Zahl, die eine geleistete
Einheit verschweigt, ist schlechter als gar keine; der Nutzer sieht sein
Volumen zeitgleich in der Statistik und weiß, dass etwas fehlt. Der archivierte
Wert ist für die **laufende** Woche kein Stand, sondern ein Zwischenstand von
gestern. Für eine **abgeschlossene** Woche ist er dagegen genau richtig: er ist
das, was der Nutzer am Wochenende gelesen hat, und darf sich rückwirkend nicht
mehr ändern.

Damit es wirklich **eine** Quelle ist und nicht zwei gleich gerechnete: neu
`_crNowNumbers()` — `_aicWeek()`, `_chKzWeek`, `_chWeekNumsHTML` und
`_chWeekBarData` hängen alle daran.

Mitgefallen ist dabei ein zweiter Widerspruch derselben Art: `_chWeekBarData`
ließ den Archiveintrag der laufenden Woche stehen (`!arch[key]`), der Balken
stand also auf einem anderen Wert als die Kennzahl direkt darüber. Die laufende
Woche überschreibt den Archiveintrag jetzt.

**Grün**: `_chKzWeek(_crCurrent())` und `_aicWeekText(_aicWeek())` liefern
zeichengleich `"2.000 kg ↑ 100 %"`, die Kennzahlenzeile zeigt `2 / 4 / 2.000`,
der Balken 2000 — und `fertig === true` samt Berichtstext bleibt erhalten.

---

## I3 — der Ton-Regler verlor nach der Zeigergeste die Tastatur

**Test** (`fix-check.js`): echte Zeigergeste auf den dritten Rastpunkt, warten,
dann `ArrowLeft`. Rot gemessen:

```
nachZug:   {"tone":"hart","fokus":"BODY"}
nachTaste: {"tone":"hart","now":"2","fokus":"BODY"}
```

Die Pfeiltaste war wirkungslos, weil `onkeydown` am Regler hängt und der Fokus
nach dem Rerender auf `BODY` lag.

**Änderung**: `_chToneUp()` holt den Fokus nach dem verzögerten Rerender zurück —
dieselbe Zeile wie am Ende von `_chToneKey()`, aus demselben Grund.
`_chToneDown()` fokussiert den Regler zu Beginn der Geste bereits; der Rerender
nahm ihn nur wieder weg.

**Grün**: nach der Geste `fokus === 'ch-tone-slider'`, `ArrowLeft` bewegt um
genau einen Rastpunkt zurück (`hart` → `sachlich`, `aria-valuenow` `2` → `1`).

---

## I4 — Testlücke: `esc()` an der Übungsauswahl

Kein Produktfehler: `esc()` steht dort. Die Lücke war, dass **keine** der fünf
Suiten die Chip-Reihe je mit dem Markup-Namen gerendert hat — Prüfung 31c setzt
den Namen und ruft `coachSetGoal()`, was die Auswahl schließt.

**Änderung**: neue Prüfung **31d** in `hub-check.js`. Sie tippt nach 31c mit
echter Zeigerfolge auf den Kopf, misst also bei **offener** Auswahl, und verlangt
dreierlei: kein `<img>`-Element, kein `onerror`, **und** dass der Name wirklich
als Text in der Reihe steht (sonst prüfte sie nichts).

**Mutationsprobe** (kopierter Baum, `--root=`, Arbeitsbaum unangetastet): `esc()`
an `index.html:26692` entfernt →

```
PASS  Uebungsname mit Markup erscheint in Zielzeile und Diagramm-Untertitel als TEXT
FAIL  Uebungsname mit Markup in der OFFENEN Uebungsauswahl
Ergebnis: 54/56
```

Die alte Prüfung überlebt die Mutation, die neue fängt sie. Genau das war der
Befund.

---

## I5 — Testlücke: Regel 1 wurde nur als Flächenzahl geprüft

**Änderung**: Prüfung 13 in `hub-check.js` zählt zusätzlich die **Einstiege** in
den Coach-Hub im Heute-Tab — beide Verdrahtungsarten, das inline-Attribut und der
per JS gesetzte Handler (die Heute-Karte nutzt den zweiten Weg, ein reines
`[onclick*="openCoachHub"]` fände sie also gar nicht). Verlangt sind genau 1 im
Heute-Tab und 0 innerhalb `#heute-grid`. Dieselbe Zählung steht als eigene
Prüfung in `fix-check.js`.

**Mutationsprobe**: ein zweiter Coach-Einstieg als `.hw`-Kachel innerhalb
`#heute-grid` →

```
{"vor":{"pad":2,"aic":1,"tabs":5},
 "nach":{"pad":2,"aic":1,"tabs":5,...,"einstiege":2,"einstiegeGrid":1}}
FAIL  Gestaltungsregel 1 ...
```

Alle drei alten Flächenzahlen bleiben unverändert — die Mutation hätte alle fünf
Suiten überlebt. Die Einstiegszählung fängt sie.

---

## I6 — `task-19-check.js` war rot (26/27)

Kein Produktfehler. Die Prüfung verlangte den Blockabschluss-Eintrag als
**ersten** im Changelog; inzwischen stehen zwei neuere darüber.

**Änderung**: gefordert ist nur noch, dass der Eintrag **vorhanden** ist
(`indexOf(CL_NEU) >= 0`). Die Reihenfolge des Changelogs ist keine Zusicherung
von Task 19 — als solche formuliert altert sie bei jedem Release. Die beiden
Zusicherungen, die etwas wert sind, bleiben unverändert: `APP_VERSION` und
`CACHE` tragen denselben Wert, und kein Schlüssel folgt dem Muster
`gymtrack-v\d+`. **27/27**.

---

## Minor

### `_chWeekBarData` — acht Balken, die keine acht Wochen waren

**Test** (`fix-check.js`): Uhr auf **Mo 06.04.2026 00:30** lokal. Rot gemessen:

```
["2026-W07","2026-W08","2026-W09","2026-W10","2026-W11","2026-W12","2026-W14","2026-W15"]
```

W13 fehlt — exakt der Befund.

**Änderung**: Rückwärtszählung über `CoachReport.shiftWeeks(weekStart(now), -i)`
statt `now - i * 7 * 864e5`; auch der Riegel „ganz vor der ersten Einheit" rechnet
jetzt über den Kalender. **Grün**: acht Schlüssel, lückenlos aufsteigend.

### `coachSetGoal` — „1.200" wurde still zu 1,2

**Test** (`fix-check.js`). Rot gemessen:

```
{"hinweis":"Du hebst rechnerisch schon 76 kg. Setz dein Ziel darüber.","target":[0,0,0,0]}
```

Eine Auskunft über die falsche Sache: der Nutzer hat sich nicht zu niedrig
gezielt, er hat sich vertippt.

**Änderung**: die Eingabe muss `^\d+([.,]\d{1,2})?$` erfüllen — Ziffern und
höchstens ein Trennzeichen. Sonst wird der **Eingabefehler benannt** und die
Eingabe zitiert, damit sichtbar ist, was angekommen ist (DE/EN, Beispiel im
jeweiligen Format: `102,5` bzw. `102.5`). Die leere Eingabe behält ihren eigenen,
bestehenden Satz. Die Umwandlung selbst bleibt wie im Rest der App
(`replace(',', '.')`, vgl. `:12460`, `:14608`, `:19574`) — eine eigene
Tausenderregel nur an dieser Stelle wäre die zweite Lesart im Haus.

---

## Nicht angefasst (steht im Ledger)

`_chHoldBody` als Zähler statt Bool · toter `.aic-chip.ghost` · veralteter
Kommentar `:27990` · Ton-Regler auch in der Einrichtung · `renderCoachHub` nur
die betroffene Kachel.

---

## Zusatz aus der Welle: Hierarchie der Heute-Karte

Vom Nutzer während der Welle entschieden. `.aic-head` (17 px, 900) trug die
Wochenzahl, die Tagesempfehlung stand in `.aic-sub` (12,8 px, `--text2`) — die
sichtbarste Zeile der Startseite war eine Kennzahl statt einer
Handlungsaufforderung.

**Änderung**: die beiden Zeilen tauschen Klasse und Reihenfolge. Was heute
ansteht steht groß, die Wochenzahl klein darunter, Pfeil und Prozent zur Vorwoche
bleiben an der Zahl. Kein CSS geändert, keine neue Farbe, kein Strukturumbau —
zwei Zeilen im Template.

**Tests**: `hub-check.js` Prüfung 43 liest die Zeilen an ihren neuen Plätzen und
verlangt zusätzlich, dass die Handlungsaufforderung die **größere** Schriftgröße
trägt; beide Angaben müssen weiter auf der Karte stehen. Dieselbe Zusicherung
noch einmal in `fix-check.js`. `task-9-check.js:134` (Tippziel `.aic-head`) und
`:439` (die stille Karte hat kein `.aic-head`) tragen ohne Änderung, beide grün.
Rot gemessen vor dem Fix: `head: "11.520 kg ↑ 106 %"`, `heuteGr 17 / wocheGr 12,8`
in der falschen Zuordnung.

Der I2-Fix gilt für die Zahl in ihrer neuen Position unverändert — sie kommt aus
`_crNowNumbers()` wie die Kachel.

---

## Bindende Regeln — Nachweis

- Keine neuen Farben: kein CSS geändert (`--acc`, `--acc-rgb`, `--gl-*`,
  `--inp-bg` unberührt).
- `esc()` vor `innerHTML`, `textContent` für reinen Text: alle neuen Strings
  laufen durch `esc()`; die statische Prüfung 55 in `hub-check.js` (kein `save()`,
  kein Emoji, ≥ 12 `catch`) ist grün.
- Keine Emojis; `✕` ist Bestand, die Pfeile `↑↓→` sind Bestand.
- Jeder neue nutzersichtbare String hat ein englisches Gegenpart (`_cm`), Einheit
  hängt am Wert.
- `persist()` statt `save()`; kein neuer Schreibpfad hinzugekommen.
- Jeder Einstieg in `try/catch`; `_crNowNumbers()` bringt seinen eigenen mit.
- Kein neuer Firestore-Schreibpfad, `firestore.rules` unangetastet.
- Ein Einstieg im Heute-Tab — jetzt auch gezählt statt nur angenommen.
- `APP_VERSION` und `CACHE` stehen unverändert auf `gymtrack-v202607310001`, der
  Changelog ist unberührt.
