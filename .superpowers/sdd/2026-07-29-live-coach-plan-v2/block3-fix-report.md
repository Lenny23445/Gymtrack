# Block 3 — Behebung der Blockabschluss-Review

Ausgangsstand: 407 Node-Tests, 23 + 41 + 20 + 4 Browser-Checks grün.
Endstand: **426 Node-Tests**, 23 + 41 + 20 + 4 **plus 21 neue** Browser-Checks grün.

Für jeden Befund gilt dieselbe Reihenfolge: erst der Test, der ihn rot zeigt,
dann der Fix. Die Rot-Läufe sind unten je Befund festgehalten.

| Suite | vorher | nachher |
|---|---|---|
| `node --test test/*.js` | 409/426 (16 rote Tests, davon 15 neu + `restTip`) | **426/426** |
| `block3-fix-check.js` (neu, Port 8796) | 5/21 | **21/21** |
| `task-17-check.js` | 23/23 → 21/23 nach dem Taktungs-Fix | **23/23** |
| `task-10-check.js` | 41/41 | **41/41** |
| `task-9-check.js` | 20/20 | **20/20** |
| `lang-check.js` | 4/4 | **4/4** |

---

## Critical 1 — der Coach sagte Gewichte an, die es nicht gibt

**Befund am Code nachgeprüft.** Die App kennt keinen Gerätetyp. Es gibt genau
zwei Quellen:

* `ex.showPlateCalc` — der einzige explizite Schalter. Gesetzt wird er **nur**
  im Übungsformular (`index.html:14317`), und dort ist er auf `false`
  vorbelegt (`selShowPlates = false`, `:14119`). Weder `pickExFromLibrary()`
  (`:19595`) noch die Plan-Vorlagen (`:19758`) noch `_planImportEx()` (`:19887`)
  legen ihn an. Praktisch **jede** Übung eines echten Nutzers kam also als
  „keine Stange" heraus → `barKg = 0` für Bankdrücken.
* der **Name**. `EX_LIBRARY` codiert das Gerät konsequent im Namen
  („Kurzhantel-Bankdrücken", „Bizeps-Curls (LH)", „Butterfly (Maschine)",
  „Kabelzug Brust", „Rudern (Langhantel)"). `ex.emoji` und `ex.muscleGroup`
  tragen nichts bei.

**Entscheidung 1 — die Ableitung.** `CoachCues.equipFor(name)` gibt
`'barbell' | 'dumbbell' | 'machine' | null`. Sie liegt in `js/coach-cues.js`,
weil dort bereits die **einzige** Namensnormalisierung des Coach steht
(`fold`/`plainFold`/`hit`: beide Umlaut-Schreibweisen, kurze Schlüssel nur als
eigenes Wort). Ein zweiter Normalisierer in `coach-warmup.js` wäre bei der
nächsten Umlaut-Frage auseinandergelaufen — dieselbe Begründung, mit der die
Zahlmodule ihr Format teilen.

**Zwei Tabellen statt einer Längenregel.** Bei `cueFor` gewinnt der längste
Treffer. Beim Gerät wäre das falsch: `kurzhantelbankdruecken` enthält
`bankdruecken` (12 Zeichen) und `kurzhantel` (10). Also erst `EQUIP_MARK`
(Geräteworte: langhantel/lh/barbell, kurzhantel/kh/dumbbell, maschine/kabel/
cable/seilzug), dann `EQUIP_MOVE` (Bewegungsname als Vorgabe).

**Rangfolge in `_csEquipKind()`:** `showPlateCalc === true` → Langhantel (der
Nutzer hat es selbst gesagt); sonst `equipFor(name)`; `null` → Maschine.
`showPlateCalc === false` wird **nicht** gelesen: das ist der Vorgabewert jeder
importierten Übung und damit keine Aussage. Der Zweifel fällt gegen die Stange
aus — eine erfundene Stange rundet auf Scheibenpaare, die es am Gerät nicht
gibt, und verbietet zugleich jedes Gewicht unter 20 kg; das ist der teurere
Fehler.

**Entscheidung 2 — der Boden.** `CS_MIN_PLATE = { kg: 1.25, lbs: 2.5 }`, also
2,5 kg bzw. 5 lbs Gesamtsprung an der Stange. Der Boden gilt **für beides**,
Aufwärmrundung wie Rückfrage-Stufe. Begründung: die feine Scheibe brachte auch
beim Aufwärmen genau die Zahl hervor, die die Review als nicht auflegbar
benannt hat (60 kg → „42 kg × 3" = 11 kg je Seite, dafür bräuchte man vier
0,5er je Seite). Eine Trennung „fein fürs Aufwärmen, grob für die Rückfrage"
hätte diesen Befund reproduziert und zusätzlich zwei Raster für dasselbe Gerät
eingeführt — genau das, was der Typkontrakt der Module ausschließt.
Der Boden ist in der **Anzeige-Einheit** formuliert, nicht in kg: in lbs ist
2,5 lbs bereits die kleinste Scheibe des Standardsatzes, der Boden greift dort
also nie und verschiebt kein lbs-Raster.

**Kurzhantel / Maschine / Kabel:** `barKg = 0`, `step = CS_STACK_STEP`
(2,5 kg / 5 lbs) — ein Sprung, kein Paar. Bewusst **nicht** aus
`_availPlates()`: der Scheibenkasten beschreibt die Langhantel, nicht den
Stapel; eine Zahl aus der falschen Quelle ist keine Messung.

**Gemessen nachher** (Bankdrücken, Bibliotheks-Übung ohne `showPlateCalc`,
keine Scheibenauswahl, Scheibenrechner nie geöffnet):

* Arbeitsgewicht 35 kg → **20 / 25 / 30 kg** (vorher 17,5 / 24,5 / 30)
* Arbeitsgewicht 60 kg → alle Stufen paarweise auflegbar (vorher 42 / 51)
* RPE „schwer" bei 60 kg → **57,5 kg** (vorher 59,5). Der Sprung ist der
  Boden von 1,25 kg je Seite; 57,5 = 18,75 je Seite = 10 + 5 + 2,5 + 1,25.
  Die Review hatte 55 kg genannt (step 2,5) — das ist dieselbe Zusicherung
  eine Stufe gröber; der Check prüft deshalb die **Eigenschaft** (Sprung
  ≥ 2,5 kg, paarweise auflegbar, nie unter Stangengewicht) statt einer
  Wunschzahl.

**Tests:** `test/coach-cues.test.js` — sechs neue Tests für `equipFor`
(Bibliothek Langhantel/Kurzhantel/Maschine, Gerätewort schlägt Bewegungsname,
beide Umlaut-Schreibweisen, `null` ohne Anhaltspunkt). ROT vor der Änderung
(`C.equipFor is not a function`), grün danach.
`test/coach-warmup.test.js` — zwei Zusicherungen über eine Matrix (5 Stangen ×
3 Raster × 69 Arbeitsgewichte, >500 Fälle): jeder angesagte Satz ist auflegbar;
und der Beleg, dass eine 0,5er-Scheibe Stufen erzeugt, die der Boden verhindert.
`block3-fix-check.js` Checks 1–3: ROT (`bar 0, step 0.5, w35 = [17.5, 24.5, 30]`),
grün (`bar 20, step 1.25, w35 = [20, 25, 30]`).

---

## I1 — `CS_RESERVE` trug nicht, es verschob nur

**Nachgerechnet und bestätigt:** greet(1), exOpen(2), warmupIntro(3), cue(4),
plateau(5) → Übung 2 nimmt mit exOpen(6) und warmupIntro(7) genau die zwei
Reserveplätze, `budgetLeft` fällt auf 0, `mid` bei Satz 6 fällt aus.

**Fix:** Der Rückhalt gilt jetzt für **drei Klassen** mit zwei Zahlen.

| Klasse | Arten | Rückhalt |
|---|---|---|
| Anker | `exOpen`, `warmupIntro` | `CS_RESERVE = 2` (mid + fatigue) |
| Feinheit | `cue`, `recall`, `plateau`, `timeBudget` | `CS_RESERVE_FINE = 3` |
| Spät | `mid`, `fatigue`, `debrief` | — (die Begünstigten) |

Zwei Zahlen, weil die Feinheiten **zuerst** anfallen (alle beim Öffnen der
ersten Übung) und ohne strengeren Rückhalt das ganze Budget verbraucht hätten,
bevor die zweite Übung überhaupt aufgeht. `exOpen` läuft jetzt über `_csTake()`,
`warmupIntro` über `_csHasRoom()`.

**Der Rückhalt gilt nur auf Stufe `full`.** `mid` und `fatigue` stehen laut
`LEVEL_KINDS` gar nicht auf `key`; ein Rückhalt für sie wäre dort ein Maulkorb
für die Schlüsselmomente (bei CAP 4 blieben nach der Begrüßung null Plätze).
Die Obergrenze selbst bleibt unangetastet — der Rückhalt kann den Zähler nur
senken.

**Gemessener Bogen nachher** (3 Übungen × 4 Sätze, `full`): greet, exOpen,
warmupIntro, cue, exOpen, **mid**, fatigue, **debrief** = 8.

**Test:** `block3-fix-check.js` Check 4 fährt genau diesen Verlauf.
ROT: `said` ohne `mid` (greet, exOpen, warmupIntro, cue, plateau, restNext,
fatigue). Grün: `mid` und `debrief` vorhanden, ≤ 8 Äußerungen.

---

## I2 — die Bilanz ist jetzt sichtbar

**Ort: das Post-Workout-Check-in-Sheet (`ov-checkin`).** Begründung:

* Es steht **ohnehin** direkt nach `finishWk()` (`_checkinOpen()` ist die
  letzte Zeile) und ist wie der Coach Premium-exklusiv — die Zielgruppe
  deckt sich also exakt.
* Es ist **keine zweite Coach-Fläche**: das Training ist zu Ende,
  `#wk-coach-bar` existiert nicht mehr. Was dort steht, ist eine einzelne
  Textzeile ohne Bedienelemente (`.ci-coach`), kein Overlay im Overlay,
  nichts Modales. Gestaltungsregel 1 und 2 gelten dem Training.
* Der **Abschluss-Ablauf bleibt unverändert**: `_csEnd()` läuft weiter vor
  `closeOv('ov-wk')`, `_finishWkContinue()`, Share-Flow, PR-Feier und
  Punkte-Ticker sind nicht angefasst. Neu ist nur, dass `_csEmit()` den
  **Text** statt `true` zurückgibt und `_csEnd()` ihn in `_csFinalLine` legt,
  aus dem `_renderCheckin()` ihn per `esc()` setzt.

`_coachBarSet()` in der Leiste bleibt bestehen — sie kostet nichts und trägt,
falls das Overlay einmal offen bleibt.

**Test:** `block3-fix-check.js` Check 5. ROT: Check-in-Text ohne Zahlen.
Grün: Sätze und Volumen stehen im geöffneten `ov-checkin`, `ov-wk` ist zu,
genau eine `.coach-bar` im Dokument.

---

## I3 — die Satz-Quittung: Entscheidung und Kommentar

**Entscheidung: die Quittung zählt weiterhin NICHT gegen die Obergrenze.**
Sie ist die Antwort auf eine Handlung des Nutzers; eine Rückfrage, deren
Beantwortung den Erzählbogen aufzehrt, bestraft den, der antwortet. Sie durch
`emit()` zu schicken bräuchte `force`, und `force` gehört ausschließlich
`sessionEnd`.

**Damit war zweierlei fällig:**

1. **Der Kommentar sagt die Wahrheit.** `index.html:23642 ff.` behauptete, die
   Obergrenze gelte „für JEDE Quelle … auch die Satz-Quittung". Er benennt
   jetzt die Ausnahme, ihren Grund und die eigene Grenze.
2. **Eigene Obergrenze:** `CoachSession.ACK_CAP = 3`, über `ackTake(sess)` und
   `_csAck()`. Der Zähler (`sess.acks`) liegt im **Sessionzustand**, nicht in
   einer Modulvariablen — sonst begänne er nach jedem Neuladen von vorn, genau
   wie es der Deckel des Bogens vor dieser Welle tat. `sessionResume()` trägt
   ihn mit.
   Warum 3 und nicht 4: die Quittung ist die *dritte* Ebene auf derselben
   Fläche (Bogen, Mikro-Reaktion, Quittung). Sie darf die Fläche nicht öfter
   belegen als der halbe Bogen; 3 heißt „am Anfang der Einheit antwortet der
   Coach, danach nimmt er still zur Kenntnis" — das Gewicht wird weiterhin
   **immer** angepasst, nur die Zeile bleibt aus.

**Gemessen nachher:** 12 Arbeitssätze, jeder mit „schwer" beantwortet →
**3 Quittungen** (vorher 12), `spoken` unverändert ≤ 8.

**Tests:** `test/coach-session.test.js` — vier neue Tests (`ackTake` gibt
höchstens `ACK_CAP` frei, verbraucht kein Budget des Bogens, schweigt auf
Stufe `off`, überlebt `sessionResume`). ROT (`S.ackTake is not a function`).
`block3-fix-check.js` Checks 7 und 8 (Verhalten + der Kommentar selbst).

---

## I4 — messen statt vorlesen: **gemessen**

**Entscheidung: messen.** Die Aussage zu streichen hätte den Plateau-Satz um
seine einzige zweite Zahl gebracht; die Zahl zu behalten war unhaltbar.

**Drei Stellen:**

1. **Erhebung** (`toggleSetDone`): der Abstand zum zuletzt abgehakten
   Arbeitssatz landet als `set.rs` (Sekunden) an der Einheit. Erst ab dem
   zweiten Satz, gedeckelt auf `CS_REST_MAX_S = 600` — darüber ist es eine
   Unterbrechung und keine Satzpause, und ein einziger Ausreißer machte den
   Wochenschnitt wertlos. Kein zweiter Firestore-Schreibpfad: das Feld hängt
   an einem bestehenden Satzobjekt.
2. **Auswertung** (`_csWeeklyHistory` → `_csRestAvg`): der Wochenschnitt kommt
   aus den `rs`-Werten der Arbeitssätze. Ohne Messung: `avgRestSecs: null`.
   `S.restTimerSecs` steht **nirgends** mehr in einer Wochenzeile.
3. **Aussage** (`js/coach-analyze.js`): `normRow()` füllt fehlende Pausen nicht
   mehr mit `REST_DEFAULT` auf (dieselbe Lüge, nur mit 90 statt der
   Einstellung). `plateau()` mittelt über die Wochen, die wirklich eine
   Messung tragen, und liefert `avgRestSecs: null` / `restDelta: null`, wenn
   keine (bzw. weniger als zwei) vorliegen. `plateauSay()` wählt dann den
   **neuen Satzschlüssel `plateauPlain`** ohne `{secs}` — vier Töne, beide
   Sprachen, `hart` sechs Wörter, `ruhig` ohne Ausrufezeichen.
   `REST_DEFAULT` bleibt, wo er hingehört: in `costSecs()`, wo eine Pause
   *geschätzt* und nicht behauptet wird.

Die Diagnose fällt also **nicht** aus, solange keine Messwerte da sind — der
Stillstand ist die Aussage, die Pause war immer nur der Zusatz.

**Tests:** `test/coach-analyze.test.js` — fünf neue Tests. ROT
(`avgRestSecs 90` statt `null`, `key 'plateau'` statt `plateauPlain`).
`block3-fix-check.js` Checks 9–11 (keine Zahl ohne Messung, echte Messung kommt
an, `rs` wird beim Abhaken wirklich geschrieben).

---

## I5 — lbs: **Katalog geändert**, formatiert an einer Stelle

**Entscheidung: die Einheit hängt am Wert.** Acht Schlüssel verlieren ihr
festes „kg"/„Kilo"/„kilos": `greet`, `exOpen`, `mid`, `restNext`,
`setAckEasy`, `setAckHard`, `debrief`, `prCongrats` — alle vier Töne, beide
Sprachen (64 Zeilen). `mid` und `prCongrats` sind über die Vorgabe der Review
hinaus dabei: `mid` trägt ein Volumen in kg und wird ausschließlich von
Block 3 emittiert, `prCongrats` verdrahte ich in derselben Welle.
**Nicht** angefasst: `plateau`, `anniversary`, `forecast`, `reminderPlan`,
`reportReady` — die gehören anderen Blöcken, deren Aufrufstellen rohe Zahlen
übergeben; ihnen die Einheit zu nehmen hieße, sie ersatzlos zu verlieren.

**Umgerechnet und beschriftet wird an genau einer Stelle:** `_csVars()` in
`_csEmit()`, der einzigen Stelle, an der Modulausgabe auf den Katalog trifft.
`_csWeight(kg)` → `kgToDisp()` + `toLocaleString(Sprache)` + `unitLabel()`.
Nur `kg` und `vol` sind Gewichte; `pct`, `mins`, `secs`, `weeks`, `reps`,
`sets`, `count` bleiben Zahlen. Die Module rechnen weiter rein in kg.
Dieselbe Formatierung nutzen `_rpeAnswer()` (Quittung), `_csEnd()`
(prCongrats) und die Tonvorschau in den Einstellungen (`_chToneVars`,
`_chToneExVars`) — sonst stünde dort „zuletzt 60 bei 8 Wiederholungen".

**Nebenwirkung auf bestehende Checks:** `lang-check.js:65`,
`task-9-check.js:575` und `task-10-check.js:659` hielten die Beispielwerte der
Tonvorschau als **Literal** (`{ ex: 'Bench press', kg: 60, … }`) und
verglichen die gerenderte Karte damit. Sie rufen jetzt `_chToneVars()` — also
dieselbe Quelle wie die Oberfläche. Die Zusicherung ist unverändert (die Karte
zeigt, was `CoachPersona.say(…)` mit den Werten der App liefert); geändert hat
sich nur, dass der Check die Werte nicht mehr zweitfassung führt.

**Gemessen nachher** (lbs-Nutzer, zuletzt 100 kg): Begrüßung, Ansage,
Aufwärmreihe, Quittung und Bilanz nennen ausschließlich lbs.

**Tests:** `test/coach-persona.test.js` — zwei neue Tests (kein Satz des
Trainingsbogens schreibt eine Einheit fest; der übergebene Wert trägt seine
Einheit unverändert in den Satz). ROT. `block3-fix-check.js` Check 12.
`node --test test/coach-persona.test.js`: 22/22 grün, alle Tonregeln
(hart ≤ 8 Wörter, ruhig ohne Ausrufezeichen, ≥ 3 Wörter je Zeile, kein Emoji,
kein ungefüllter Platzhalter) halten.

---

## I6 — `sessionResume()` wird jetzt gerufen

`_csResume()` läuft über `CoachSession.sessionResume(S.coachSession, timerTs)`
statt über den rohen Zustand; ein `ended`-Zustand wird nicht fortgesetzt.
Zusätzlich hat `_csGet()` einen billigen Riegel: ist `spoken` kein Zahlwert
oder `said` kein Objekt, wird einmalig über `sessionResume()` repariert (ohne
`persist()` — der nächste `_csPut` schreibt ohnehin). Damit passiert **jeder**
Pfad die Reparaturschicht, nicht nur der Wiedereinstieg.

**Test:** `block3-fix-check.js` Check 13. ROT: `spoken` gelöscht → nach
`_csResume()` stand der Zähler bei 3 statt bei ≥ 5, `rests: 'viele'` blieb ein
String. Grün: Zähler ≥ Zahl der gesagten Arten, jedes Feld typgeprüft.

---

## I7 — Satz ab- und wieder anhaken

Zwei Riegel, beide je Einheit zurückgesetzt und beim Wiedereinstieg aus den
erledigten Sätzen neu befüllt:

* `_csSeenEx` (Menge der bereits angesagten Übungen) statt nur `_csLastExId`.
  „Aktuell" ist die erste Übung mit offenen Sätzen und springt zurück, sobald
  der Nutzer zur Korrektur einen Satz abhakt — der Vergleich mit der *letzten*
  Übung greift dann nicht.
* `_csSeenSets` (Menge der bereits gezählten Sätze). Ohne ihn wuchsen
  `setCount` und `vol` bei jedem erneuten Abhaken weiter: die Halbzeit kam zu
  früh und meldete ein Volumen, das so nie bewegt wurde. Die Pausenmessung
  hängt im selben Riegel.
  *Kauf:* wird nach dem Abhaken das Gewicht korrigiert, bleibt der alte Wert
  im Volumen des Bogens stehen. Doppelt zu zählen ist der größere Fehler.

**Test:** `block3-fix-check.js` Check 14 misst den **Modulaufruf**
(`CoachSession.onExerciseOpen`), nicht die Äußerung — ist das Budget schon
leer, fällt die zweite Ansage ohnehin aus und der Fehler bliebe unsichtbar.
Genau daran ist er der bestehenden Suite entgangen. ROT: `spoken` stieg beim
Hin und Her. Grün: keine Übung zweimal geöffnet, `spoken` unverändert.

---

## Minor

* **`restTip` — gestrichen** (Stufenliste *und* Katalog, beide Sprachen). Die
  Art hatte in keinem Modul und in keiner Verdrahtung je einen Auslöser, und
  ihr Text war ein Allgemeinplatz („Schultern unten lassen"), also genau das,
  was `coach-cues.js` für den Technikpunkt ausdrücklich ablehnt. Verdrahten
  hätte einen zweiten, schwächeren Technikhinweis neben `cue` gestellt und im
  knappsten Budget des Vorhabens um Plätze konkurriert.
  Der bestehende Test `restTip steht auf full, wird aber von keinem Pfad …`
  ist zur Gegenprobe umgeschrieben (keine Stufe kennt sie, `emit()` lässt sie
  nicht durch, der Katalog hat sie nicht mehr) — die Abdeckung bleibt, die
  Zusicherung dreht sich um. `KEYS.length` bleibt bei 24, weil `plateauPlain`
  hinzukommt.
* **`prCongrats` — verdrahtet.** Der Bestwert hängt an derselben Zeile wie die
  Bilanz (`_csEmit(out, extra)`), nicht als eigene Art: eine zusätzliche Art
  hätte einen weiteren Platz im knappsten Budget gekostet und wäre auf einer
  Fläche gelandet, die im selben Tick zugeht. Angehängt wird **nur** ein echtes
  Maximalgewicht (`type === 'weight'`) — ein geschätztes 1RM als „Bestwert"
  anzusagen wäre eine Zahl, die so nie gehoben wurde. `detectPRs()` ist frei
  von Nebenwirkungen; die Kette in `_finishWkContinue()` bleibt unberührt.
  Check 6.
* **`_csTake` erstattet jetzt auch `said[kind]`.** `emit()` setzt beides
  gemeinsam; wurde nur `spoken` erstattet, galt eine `ONCE`-Art als stumm
  verbraucht und kam nie wieder.
* **`_csPut` schreibt getaktet.** Zählerstände (`spoken`, `acks`, `said`,
  `ended`) gehen **sofort** auf die Platte — sie müssen einen Neustart
  überleben, sonst zählt der Deckel von vorn. Alles andere (`rests`, `reps`,
  `setCount`, `lastTick`) läuft über einen Nachlauf von `CS_SAVE_MS = 20 s`.
  Gemessen: 12 Pausen ohne Äußerung → **1** Schreibvorgang statt 12
  (Checks 18/19; Check 19 belegt, dass der gespeicherte Zähler weiterhin dem
  laufenden entspricht).
* **`CS_GAP_MS = CS_HOLD_MS`** (9000 statt 4500). Dadurch war `task-17`
  Check 3 zu kurz getaktet (`wait(11000)` → `wait(19000)`); die Zusicherung
  selbst ist unverändert. Ebenfalls in `task-17` angepasst: Check 15 liest die
  Markup-Prüfung jetzt über **alle** Zeilen der Einheit statt über die zuletzt
  stehende — welche Art am Ende im Bild steht, hängt am Rückhalt und ist keine
  Zusicherung; dass der Name überall als Text ankommt, schon.

---

## Die zwei Zusicherungen ohne Test — geschlossen

Beide Checks wurden **gegen die Mutation gefahren** (Kopie des Baums im
Scratchpad, `--root=`):

| Mutation | Check | Ergebnis |
|---|---|---|
| Haltezeit auf 0 (`_coachBarSet('msg', txt, 0)`) | Check 15 | **FAIL** → Mutation getötet (20/21) |
| `_rpeTimer` entfernt | Check 16 | **FAIL** → Mutation getötet (20/21) |

Check 15 misst in Echtzeit: Äußerung steht nach 1,5 s, dann wird der Zustand
verworfen (die gereihten Nachfolger sterben), nach `CS_HOLD_MS + 1,5 s` ist
die Zeile von selbst verschwunden.
Check 16 zählt die Chips **ohne** zwischenzeitliche Eingabe nach — der
bestehende Check zählte sie *nach* einem neuen Satz und sah damit die neuen
Chips, nicht das Verschwinden der alten.

---

## Bindende Punkte

* Kein `fetch` / `AI_WORKER_URL` / `XMLHttpRequest` in den fünf Modulen oder
  auf einem Block-3-Pfad (Check 21 + `task-17` Checks 21/22).
* Jeder freie Text über `esc()` vor `innerHTML`, reiner Text per
  `textContent`; die neue Check-in-Zeile ebenso (`_ciCoachLineHTML`).
* Keine Emojis; kein neuer nutzersichtbarer String ohne englisches Gegenpart
  (die Bilanzzeile kommt fertig aus `_say()`).
* `persist()` statt `save()`; jeder Coach-Einstieg in `try/catch`.
* Kein zweiter Firestore-Schreibpfad, `firestore.rules` unangetastet,
  `S.coachSession` bleibt rein lokal.
* Im Training genau **eine** Fläche (`#wk-coach-bar`), kein Overlay, nichts
  Modales (Check 20).
* Obergrenze `off 0 / key 4 / full 8` unverändert (`test/coach-session.test.js`
  + `task-17` Checks 9/11/12).
* `APP_VERSION`, `CACHE` in `sw.js` und `CHANGELOG` **nicht** angefasst.

---

## Offene Punkte / Bedenken

1. **Namensbasierte Geräteerkennung bleibt eine Heuristik.** Sie deckt die
   Bibliothek und die üblichen Schreibweisen ab; eine frei benannte
   Langhantel-Übung („Bench", „Press 1") fällt auf Maschine zurück und bekommt
   dann kein Stangengewicht. Der ehrliche nächste Schritt wäre ein
   Gerätefeld an der Übung — das ist eine Datenmodell-Änderung und gehört
   nicht in eine Fix-Welle.
2. **`_csEquip` liest `_pcCurBar()` global.** Es gibt genau ein
   Stangengewicht für alle Übungen. Wer Kniebeugen mit 20 kg und
   Schulterdrücken mit einer 15-kg-Stange fährt, bekommt für eine der beiden
   die falsche Stange. Das war vorher genauso und ist ohne Übungsfeld nicht
   sauber lösbar.
3. **Die Pausenmessung wirkt erst in die Zukunft.** Für jede vor dieser Welle
   gespeicherte Einheit bleibt `avgRestSecs` null, der Plateau-Satz läuft
   also monatelang über `plateauPlain`. Das ist gewollt (keine erfundene Zahl),
   aber es heißt auch, dass `restDelta` erst nach vier Wochen neuer Daten etwas
   aussagen kann.
4. **Der Rückhalt ist eine gesetzte Zahl, kein Optimum.** 2 und 3 tragen den
   gemessenen Normalfall (3 Übungen × 4 Sätze). Bei sechs Übungen bleiben
   Übung 3 bis 6 ohne Ansage — das ist die Folge der Obergrenze 8 und keine
   Regression, aber es wäre einen Blick wert, ob der Anker der *laufenden*
   Übung Vorrang vor der Feinheit einer früheren haben sollte.
5. **`_csSeenSets` friert das Volumen eines Satzes beim ersten Abhaken ein.**
   Wird danach das Gewicht korrigiert, rechnet der Bogen mit dem alten Wert
   weiter. Die gespeicherte Einheit (und damit jede Statistik) ist davon nicht
   betroffen — nur die Halbzeitzahl des Coach.
6. **Ein Autosync-Job ist mir zuvorgekommen:** Commit `2c54b2a`
   („autosync: rechner 2026-07-30 18:27") hat den Zwischenstand dieser Arbeit
   bereits committet und gepusht. Nicht umgeschrieben, kein force-push; der
   Rest liegt in einem eigenen `fix(coach):`-Commit darauf.
