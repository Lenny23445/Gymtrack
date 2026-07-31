# Task 13 — Report: `js/coach-session.js` (Erzaehlbogen der laufenden Einheit)

Angelegt: `js/coach-session.js`, `test/coach-session.test.js`. Keine andere Datei
angefasst, kein Commit. Kein `fetch`, kein DOM, keine App-Globals, kein
`localStorage`, keine Abhaengigkeit auf ein Nachbarmodul (das Modul hat null
`require`; die Testdatei liest zusaetzlich `js/coach-persona.js`, um zu pruefen,
dass jeder gelieferte Schluessel im Satzkatalog steht).

## Oeffentliche API

| Signatur | Rueckgabe |
| --- | --- |
| `sessionNew(ctx)` — `ctx = {wkTs, level, planName, lastSame, muted, expectedSets}` | `sess` (flaches Objekt, alle Zaehler auf 0) |
| `isStale(sess, wkTs)` | `boolean` — `true` bei fehlendem Zustand oder abweichendem `wkTs` |
| `onStart(sess, ctx?)` — `ctx` darf `lastSame`, `planName`, `ts` ueberschreiben | `{sess, out}` — `greet` oder `greetFirst` |
| `onExerciseOpen(sess, ex)` — `{id, name, targetSets, targetReps, lastKg}` | `{sess, out}` — `exOpen` |
| `onSet(sess, log)` — `{exId, reps, kg, ts}` | `{sess, out}` — `mid` oder `fatigue` oder `null` |
| `onRest(sess, secs)` | `{sess, out}` — `restNext` ab 60 s |
| `onTick(sess, now)` | `{sess, out}` — `stall` ab 12 min ohne Satz |
| `sessionEnd(sess, summary)` — `{sets, vol, prs}` | `{sess, out}` — `debrief`, mit `force` |
| `emit(sess, kind, key, vars, force)` | `{sess, out}` — **die einzige Ausgabestelle** |
| `CAP` | `{off: 0, key: 4, full: 8}` |
| `LEVEL_KINDS` | `{off: [], key: [5], full: [14]}` (`full` ist abgeleitet: `key.concat(FULL_EXTRA)`) |
| `ONCE` | 9 Arten, ohne `exOpen` |
| `STALL_MS`, `REST_LONG_S`, `MID_FALLBACK_SET` | `720000`, `60`, `6` |

`out` ist `null` oder `{kind, key, vars}` — nie `text`. Die Aufrufstelle macht
daraus `_say(out.key, out.vars)`.

## Entscheidungen

**1. `force` ueberspringt die Stufe `off` NICHT.** Der Brief sagt "force
ueberspringt Stufe, Erlaubnis und Budget", verlangt in derselben Tabelle aber
`fullRun('off') → length === 0` — und `fullRun` enthaelt den Abschluss. Beides
zugleich geht nur, wenn `off` ein harter Riegel vor `force` bleibt. Dafuer
spricht auch die globale Vorgabe `'off' → 0 Aeusserungen`: ein Coach, der auf
"aus" steht und am Ende doch redet, ist der Fehler, den der Nutzer sofort sieht.
`force` ueberspringt damit Erlaubnis (`LEVEL_KINDS`) und Budget — nicht `off`,
nicht die Mute-Liste, nicht `ONCE`.

**2. Das Budget haelt einen Platz fuer den Abschluss frei.** Ungefiltert waere
die Rechnung `CAP + 1`: acht regulaere Aeusserungen plus erzwungener Abschluss =
neun. Das widerspricht der Zusicherung "hoechstens acht kommen durch" und der
Brief-Zeile `fullRun('full') → <= 8`. Deshalb prueft das Budget
`CAP[level] - reserve - spoken > 0` mit `reserve = 1`, solange der Abschluss
aussteht. Nachgerechnet: `key` → 3 regulaere + Abschluss = 4, `full` → 7 + 1 = 8.
Ein Lauf mit 50 Uebungsansagen plus Abschluss bleibt dadurch strukturell bei
`CAP`, nicht nur zufaellig (eigener Test). Abweichung von der Brief-Formel
`spoken < CAP[level]`, bewusst und die einzige Moeglichkeit, alle Zeilen der
Testtabelle gleichzeitig wahr zu machen.

**3. `exOpen` wird nicht je Uebung entprellt.** `emit()` prueft genau die fuenf
im Brief genannten Riegel; eine zusaetzliche Buchhaltung "diese Uebung war schon
offen" stand nicht im Brief und haette die Budget-Zeile ("30 x
`onExerciseOpen`, dann noch eins → `null`") mit gleichbleibender Uebungs-Id ins
Leere laufen lassen. `exOpen` faellt damit ausschliesslich am Budget.

**4. Wiederholungsreihe je Uebung, Pausenreihe je Einheit.** "Letzter Satz <=
erster - 2" ist nur innerhalb derselben Uebung eine Aussage; ueber Uebungen
hinweg vergleicht man Kniebeugen mit Bizepscurls. Die Reihe wird bei
`onExerciseOpen` und bei einem Wechsel der `exId` in `onSet` zurueckgesetzt. Die
Pausen laufen bewusst ueber die ganze Einheit, weil "steigende Pausen" ein
Ermuedungssignal der Einheit ist, nicht der Uebung.

**5. Hoechstens eine Aeusserung je Aufruf.** In `onSet` hat `mid` Vorrang vor
`fatigue`; wird `mid` ausgegeben, entfaellt `fatigue` in diesem Aufruf und kommt
beim naechsten Satz noch (kein `ONCE`-Verbrauch, weil `emit` bei Ausgabe
zurueckkehrt, bevor die zweite Pruefung laeuft). Jede erfolgreiche Ausgabe
schreibt `sess.current` neu — die neue verdraengt die vorige.

**6. Zustandsfortschreibung ausschliesslich ueber `Object.assign({}, s, ...)`,
Arrays via `slice`/`concat`.** Ein verworfener Rueckgabewert darf nicht gegen das
Budget zaehlen; ein Test haelt das fest.

**7. `onStart(sess, ctx)` liest `lastSame` aus `ctx`, wenn der Schluessel dort
vorhanden ist, sonst aus `sess`.** Der Brief laesst offen, welches `ctx` die
Testzeile `ctx.lastSame = null` meint; so stimmen beide Lesarten.

**8. `setAsk` (Task 15) laeuft nicht durch dieses Modul.** Die Art steht in
keiner `LEVEL_KINDS`-Liste, `emit()` wuerde sie also abweisen. Das ist die
gewollte Umsetzung der Brief-Entscheidung "zaehlt nicht gegen die Obergrenze,
haengt allein am Schalter `setFeedback`".

**9. `warmupIntro`, `restTip`, `recall`, `plateau`, `timeBudget`, `cue` loest
dieses Modul nicht selbst aus** — sie stehen in `LEVEL_KINDS`, weil die
Nachbarmodule sie durch `emit()` schicken. Das Modul selbst triggert `greet`,
`greetFirst`, `exOpen`, `mid`, `restNext`, `fatigue`, `stall`, `debrief`. Keine
Abhaengigkeit auf ein Nachbarmodul entstanden.

## Zwei Hilfslaeufe in den Tests

- `fullRun(level)`: 3 Uebungen x 3 Saetze, fallende Wiederholungen, steigende
  Pausen (`40 * 1,25^n` — kreuzt die 60-s-Schwelle unterwegs), Tick nach 40 min,
  Abschluss. Tatsaechliche Ausgabe: `off` = 0; `key` = 4
  (`greet, exOpen, exOpen, debrief`); `full` = 8
  (`greet, exOpen, restNext, exOpen, restNext, mid, restNext, debrief`).
- `deepRun(level, muted)`: 2 Uebungen x 3 Saetze mit KURZEN steigenden Pausen
  (`20 * 1,2^n`, alle unter 60 s). Ohne diesen Lauf waere der Mute-Test
  wertlos: in `fullRun('full')` frisst `restNext` das Budget, `fatigue` und
  `stall` kommen dort ohnehin nicht vor, und ein Test auf ihre Abwesenheit
  bewiese nichts. `deepRun('full', [])` zeigt beide nachweislich (eigener Test),
  `deepRun('full', ['fatigue','stall'])` keine von beiden.

## Welcher Testfall faengt welchen Fehler

| Test | Faengt |
| --- | --- |
| Stufe off sagt nichts | `off` redet trotzdem, insbesondere ueber `force` |
| Stufe key haelt vier | Obergrenze umgangen; zugleich `n > 0` gegen einen komplett stummen Coach |
| Stufe full sagt mehr als key, bleibt bei acht | `full` = `key` oder Deckel gerissen |
| kein Lauf uebersteigt die Obergrenze (50 Ansagen + erzwungener Abschluss, beide Stufen) | `CAP + 1` statt `CAP`: der erzwungene Abschluss sprengt den Deckel. Strukturell, nicht szenarioabhaengig |
| key laesst nur fuenf Arten durch (fullRun + deepRun, mit `length > 0`) | Stufenfilter fehlt; `deepRun` stellt sicher, dass `mid`/`fatigue`/`stall` real anstanden |
| nach dem Budget schweigt der Coach (30 x exOpen) | nach Budgetende wird weitergeredet |
| Abschluss bei leerem Budget (20 x exOpen) | `force` fehlt, Einheit endet stumm |
| Abschluss genau einmal | `force` ueberspringt `ONCE` ⇒ doppelter Abschluss |
| off schweigt auch beim Abschluss | `force` ueberspringt die Stufe `off` |
| verworfener Rueckgabewert verbraucht kein Budget | in-place mutierter Zustand |
| fremde Arten durch emit (`warmupIntro` auf key ja, `cue` auf key nein, `cue` auf full ja) | Stufenfilter greift nur bei eigenen Triggern; `emit` als gemeinsame Tuer kaputt |
| Begruessung genau einmal | `greet` und `greetFirst` beide, oder `ONCE` fehlt |
| ohne Vorwerte `greetFirst` / mit Vorwerten `greet` samt `vars.kg` | Zweige vertauscht, Vorwerte nicht durchgereicht |
| ohne Mute-Liste kommen fatigue+stall | Voraussetzung des Mute-Tests; faengt zugleich totgelaufene Trigger |
| gemutete Arten kommen nicht vor (plus `length > 0`) | Mute-Liste ignoriert bzw. Mute macht alles stumm |
| ohne Satz kein Stillstand | `lastSetTs` vorbelegt ⇒ Phantom-Stillstand direkt nach Start |
| 11 min → null / 13 min → stall | Schwelle zu frueh / zu spaet |
| Stillstand nur einmal (erster Tick muss `stall` liefern) | Stillstand meldet sich zweimal |
| Halbzeit traegt Volumen (`typeof number`, `> 0`) | Volumen nicht mitgefuehrt |
| ohne Erwartungswert Halbzeit beim sechsten Satz (Saetze 1–5 ohne `mid`) | falscher Ersatzwert |
| Pause 59 s → null / 60 s → `restNext` mit `vars.kg`/`vars.reps` | Schwelle falsch, Vorschauwerte fehlen |
| fallende Wiederholungen + steigende Pausen → fatigue | Und-Verknuepfung als Oder implementiert (positive Richtung) |
| fallende Wiederholungen allein → keine fatigue | Oder statt Und (Wiederholungszweig) |
| steigende Pausen allein → keine fatigue | Oder statt Und (Pausenzweig) |
| fatigue nur einmal | `ONCE` fehlt bei fatigue |
| `isStale(sess, wkTs+999)` true / `isStale(sess, wkTs)` false | fremder Zustand wird weiterverwendet |
| Schluessel und Werte, nie Text | Persona-Kopplung ins Modul gewandert |
| jeder Schluessel steht in `CoachPersona.KEYS` | Tippfehler im Schluessel ⇒ leerer Satz beim Nutzer |
| Obergrenze und Stufenlisten (`CAP`-Werte, `key`-Liste exakt, `full ⊃ key`, `full ⊃ FULL_EXTRA`, `ONCE` vollstaendig, `exOpen` NICHT in `ONCE`) | verschobene Zahlen und Listen, die die Verhaltenstests nicht sehen |

## Gestrichene Testfaelle

- **"kein Rueckgabewert enthaelt ein Emoji"** — gestrichen. Das Modul gibt
  Schluessel und die Werte zurueck, die der Aufrufer hereingegeben hat; der Test
  hätte die eigenen Testdaten geprueft, nicht das Modul, und waere bei jedem
  plausiblen Bug gruen geblieben. Der Emoji-Riegel sitzt dort, wo die Texte
  liegen: `test/coach-persona.test.js`. Begruendung steht als Kommentar in der
  Testdatei.
- Nachgeschaerft statt gestrichen: "key laesst nur fuenf Arten durch" und
  "Stillstand nur einmal" konnten bei einem stummen Modul leer gruen werden. Beide
  haben jetzt einen positiven Anker (`kinds.length > 0` bzw. der erste Tick muss
  `stall` liefern).

## Roter und gruener Lauf

Roter Lauf 1 — nur die Testdatei vorhanden:

```
node --test test/coach-session.test.js
Error: Cannot find module '../js/coach-session.js'   → tests 1 / pass 0 / fail 1
```

Roter Lauf 2 — Geruest mit leeren Rueckgaben (`{sess, out: null}`), damit die
Tests an Verhalten scheitern und nicht am fehlenden Modul:

```
node --test test/coach-session.test.js
tests 33 / pass 10 / fail 23
```

Die zehn gruenen waren ausschliesslich Abwesenheits-Zusicherungen — genau die
Stelle, an der ein Test nichts faengt. Daraus folgten die Streichung des
Emoji-Tests und die zwei Nachschaerfungen oben.

Gruener Lauf:

```
node --test test/coach-session.test.js
tests 32 / pass 32 / fail 0
```

Gesamtsuite (Ausgangsstand 222):

```
node --test test/coach-cache.test.js test/coach-i18n.test.js test/coach-intent.test.js \
            test/coach-log.test.js test/coach-memory.test.js test/coach-persona.test.js \
            test/coach-session.test.js
tests 254 / pass 254 / fail 0
```

`node --test test/*.js` meldet parallel 25 Fehlschlaege, alle in
`test/coach-analyze.test.js` — die roten Tests eines Nachbaragenten, dessen
`js/coach-analyze.js` noch nicht existiert. Kein bestehender Test ist gekippt.

---

# Nachtrag: Review-Befunde Block 3 (fuenf Module)

Behoben in `js/coach-session.js`, `js/coach-warmup.js`, `js/coach-cues.js`,
`js/coach-rpe.js`, `js/coach-analyze.js` und — begrenzt auf die Satztexte, die
die Befunde nennen — `js/coach-persona.js`. `index.html`, `sw.js` und
`build.js` wurden nicht angefasst (Verdrahtung, anderer Agent).

Vorgehen je Befund: erst der Test, der ihn rot zeigt, dann der Fix.
Ausgangsstand **350 gruen**, danach **407 gruen**, kein bestehender Test
gekippt. Roter Zwischenstand nach dem Schreiben der Tests: **35 Fehlschlaege**
(407 Tests, 372 gruen).

## Endgueltige oeffentliche API

| Modul | Signatur | Rueckgabe |
| --- | --- | --- |
| CoachSession | `sessionNew(ctx)` | `sess` (alle Zaehler auf 0 — legt IMMER neu an) |
| CoachSession | `sessionResume(saved, wkTs)` | `sess` \| `null` — **neu**, uebernimmt `spoken`/`said` |
| CoachSession | `isStale(sess, wkTs)` | `boolean` |
| CoachSession | `onStart(sess, ctx?)` | `{sess, out}` — `greet`, `greetFirst` oder `null` |
| CoachSession | `onExerciseOpen(sess, ex)` | `{sess, out}` — Art `exOpen`, Schluessel `exOpen` oder `greetFirst`, oder `null` |
| CoachSession | `onSet(sess, log)` | `{sess, out}` — `mid`, `fatigue` oder `null` |
| CoachSession | `onRest(sess, secs)` | `{sess, out}` — `restNext` oder `null` |
| CoachSession | `onTick(sess, now)` | `{sess, out}` — `stall` oder `null` |
| CoachSession | `sessionEnd(sess, summary)` | `{sess, out}` — `debrief`; `sess.ended` immer `true`, `vars` ohne `prs` |
| CoachSession | `emit(sess, kind, key, vars, force)` | `{sess, out}` — `force` wirkt NUR fuer `debrief` |
| CoachWarmup | `warmupSets(workKg, {step, barKg})` | `[{kg, reps, pct}]` — leer ausserhalb `[MIN_WORK_KG, MAX_WORK_KG]` |
| CoachWarmup | `roundToPlate(kg, step, barKg)` | `number` \| **`null`** bei unbrauchbarem Gewicht |
| CoachWarmup | `format(sets, lang)` | `string` |
| CoachRpe | `adjustNext(kg, answer, step, barKg)` | `number` \| `null` — vierter Parameter **neu**, Vorgabe `0` |
| CoachRpe | `ackFor(answer, nextKg)` | `{key, vars:{kg}}` \| `null` |
| CoachRpe | `toRpe(answer)` / `summarize(answers)` | unveraendert |
| CoachCues | `cueFor(name, lang)` / `normalize(v)` | unveraendert (Trefferlogik korrigiert) |
| CoachAnalyze | `plateau(history)` | unveraendert |
| CoachAnalyze | `plateauSay(diag, exName)` | unveraendert |
| CoachAnalyze | `prioritize(exercises, minutes)` | unveraendert |
| CoachAnalyze | `prioritizeSay(result, minutes)` | `{key, vars}` \| **`null`** |

Neue Konstanten: `CoachWarmup.MAX_WORK_KG` (1000), `CoachRpe.DEFAULT_BAR` (0),
`CoachCues.MIN_SUB_LEN` (4).

## Critical 1 — Platzhalter ohne Wert

Der Fix sitzt im Modul, nicht an der Aufrufstelle: die kennt die Luecke nicht.
Eingefuehrt wurde `has(...)` in `js/coach-session.js` — vor dem Emittieren wird
geprueft, ob der gewaehlte Schluessel ALLE Werte hat, die seine vier
Tonvarianten brauchen. Der Ton ist dem Modul unbekannt, also entscheidet die
Vereinigung aller Platzhalter des Schluessels.

**Fall a — `exOpen` ohne `lastKg` → eigener Satzschluessel (`greetFirst`).**
Unterdruecken waere hier am teuersten: `exOpen` ist eine von fuenf Arten auf
Stufe `key`, und der Fall trifft jede erstmals gefahrene Uebung — das erste
Training bliebe fast stumm. `greetFirst` beschreibt denselben Anlass ("Erste
Einheit mit {ex}. Keine Vergleichswerte vorhanden."), traegt kein `{kg}` und
liegt in allen vier Toenen und beiden Sprachen vor. Die **Art** bleibt
`exOpen`, damit sie weiterhin je Uebung gilt und nicht unter `ONCE` faellt.
Fehlt der Name, faellt die Ansage aus (alle Toene beginnen mit `{ex}`); fehlen
bei vorhandenem Gewicht nur `sets`/`reps`, faellt sie ebenfalls aus — "zum
ersten Mal" waere dann schlicht falsch, und einen Schluessel fuer diesen
Zwischenfall gibt es nicht.

**Fall b — `mid` ohne `pct` → unterdruecken.** Die Halbzeit IST der Vergleich;
drei der vier Toene bauen den Satz um die Prozentzahl. Es gibt keinen
Schluessel fuer eine Halbzeit ohne Vergleich, und "Halbzeit, du liegst bei 1.200
kg" allein ist die duenne Haelfte einer Aussage. Die Kosten sind gering: `mid`
gibt es nur auf Stufe `full`, wo Budget vorhanden ist, und der Fall tritt nur
in der allerersten Einheit auf.

**Fall c — `restNext` ohne `kg` → unterdruecken.** Die Vorschau besteht aus
genau zwei Zahlen, alle vier Toene nennen beide. Ohne Gewicht kuendigt sie
nichts an, sie zeigt nur eine Einheit.

**Zusatzfall — `greet` ohne vollstaendige Vorwerte → `greetFirst`.** Nicht in
der Review, aber derselbe Fehler: `lastSame` ohne `kg`/`sets`/`reps` ergab
"Letztes Mal Bankdruecken mit kg, Saetze zu ." Fehlt auch der Name, faellt die
Begruessung aus — eine Begruessung ohne Subjekt ist keine.

Tests: `Uebung ohne Vorgewicht ergibt keinen halben Satz`, `Uebung ohne Namen
sagt nichts…`, `Uebung mit Gewicht aber ohne Satz- oder Wiederholungszahl
schweigt`, `Begruessung ohne vollstaendige Vorwerte…`, `ohne Namen und ohne
Vorwerte gibt es keine Begruessung`, `Halbzeit ohne Vorwochenvolumen wird
unterdrueckt…`, `Pausenvorschau ohne Vorgewicht wird unterdrueckt` — plus die
drei Gegenproben mit vollstaendigen Werten. Alle vorher rot.

Der eigentliche Riegel ist `assertRendered()` in `test/coach-session.test.js`:
geprueft wird der GERENDERTE Satz in allen vier Toenen und beiden Sprachen auf
Restplatzhalter, doppelte Leerzeichen und **Einheiten ohne Zahl**. Genau die
letzte Pruefung faengt den Fehler, den `fill()` erzeugt: der Platzhalter
verschwindet, die Einheit daneben bleibt stehen. Dasselbe Muster liegt jetzt
auch in `test/coach-analyze.test.js` und `test/coach-rpe.test.js`.

## I2 — Obergrenze ueberlebt den Wiedereinstieg

`sessionResume(saved, wkTs)` neu. `sessionNew` und `isStale` bleiben
unveraendert: `sessionNew` legt bewusst immer neu an, `isStale` liefert die
Zugehoerigkeitspruefung. `sessionResume` nutzt beide, uebernimmt `spoken`,
`said` und die Zaehler und normalisiert dabei jedes Feld wie `sessionNew` —
der Zustand kommt aus einem Speicher, ihm wird nicht geglaubt. Zwei
Entscheidungen: `spoken` faellt nie unter die Zahl der bereits gesagten Arten
(ein abgeschnittener Zaehler waere geschenktes Budget), und `current` wird
nicht uebernommen (die letzte Aeusserung ist gesagt). `null` heisst "nicht
fortsetzbar" — die Aufrufstelle legt dann mit `sessionNew` an.
Tests: `sessionResume traegt Budget und ONCE-Buchhaltung weiter`,
`… lehnt einen Zustand aus einer anderen Einheit ab`, `… repariert einen
beschaedigten Zustand`, `sessionNew legt bei gleichem wkTs trotzdem neu an`.

## I3 — `force` gilt nur fuer den Abschluss

`emit()` bildet intern `forced = !!force && kind === FINAL_KIND`. Ein Aufruf
mit `force` an einer anderen Art wird still wie ein normaler Aufruf behandelt,
laeuft also durch Stufenfilter und Budget. Die bewusste Ausnahme bleibt:
`force` ueberspringt `off` nicht, ebenso wenig Mute-Liste und `ONCE`.
Tests: `force hebelt Stufenfilter und Budget nur fuer den Abschluss aus`,
`erzwungene Nicht-Abschluss-Aeusserungen sprengen die Obergrenze nicht`,
`force ueberspringt die Mute-Liste nicht`.

## I4 — Quittung und Rechnung

`setAckHard` nennt in beiden Sprachen und allen vier Toenen das GESENKTE
Gewicht und sagt, dass gesenkt wurde. `warmupIntro` nennt keine feste Satzzahl
mehr — das Schema liefert bis zu drei Saetze und faellt nach dem Runden auf
zwei oder einen zurueck. Achtwortgrenze `hart`, kein Ausrufezeichen `ruhig`,
kein Emoji, jede Zeile mit Zahl oder Beobachtung: `node --test
test/coach-persona.test.js` gruen. Tests: `die Quittung auf "schwer" behauptet
keine Bestaendigkeit`, `warmupIntro nennt keine feste Satzzahl` (beide in
`test/coach-persona.test.js`) und — der eigentliche Punkt — `die Quittung nennt
das Gewicht, das die Rechnung liefert` in `test/coach-rpe.test.js`: der laeuft
durch BEIDE Module, `adjustNext` und `ackFor` und `say`. Ein einseitiger Fix
bleibt daran haengen.

## I5 — `step` heisst in beiden Modulen dasselbe

`adjustNext(kg, answer, step, barKg)`. `step` ist ueberall die kleinste Scheibe
JE SEITE; `coach-rpe` verdoppelt intern, wenn `barKg > 0`, und rechnet das
Raster UEBER dem Stangengewicht. Untergrenze mit Stange ist die leere Stange,
ohne Stange eine Schrittweite. Vierter Parameter optional, Vorgabe `0`
(Maschine/einzelner Stapel) — damit rechnen Aufrufe mit drei Argumenten exakt
wie bisher und werfen nicht. Tests: `step ist die kleinste Scheibe JE SEITE…`,
`an der Stange ist jeder Vorschlag auflegbar`, `der Vorschlag faellt nie unter
das Stangengewicht`, `ohne vierten Parameter bleibt es die Maschine…`,
`coach-rpe und coach-warmup rechnen auf demselben Raster`.

## I6 — `plateauSay` beschreibt

Der Befund liegt in der Rueckgabe von `coach-analyze`, loesen liess er sich
dort aber nicht: `{secs}` ist der einzige Weg, die beobachtete Pause in den
Satz zu bringen, und die Vorlage las sie als Rat. Den Wert wegzulassen haette
"Laengere Pausen von Sekunden koennten helfen" erzeugt — also genau Critical 1.
Geaendert wurden deshalb die Vorlagen `plateau/ruhig` und `plateau/locker` in
beiden Sprachen (und `plateau/hart` im Englischen, das als Imperativ "Rest 120
seconds" ebenfalls verschrieb). Keine Empfehlung wurde erfunden; die Zahl steht
jetzt ueberall als Befund. **Das ist eine bewusste Ausweitung ueber Punkt 4
hinaus** — sie ist im Bericht an den Auftraggeber als Bedenken vermerkt.
Tests: `der Plateau-Satz liest die beobachtete Pause nicht als Empfehlung`
(`coach-analyze`) und `der Plateau-Satz beschreibt die beobachtete Pause…`
(`coach-persona`), beide mit einem Riegel auf Empfehlungsvokabular.

## I7 — nach dem Abschluss ist Schluss

`emit()` prueft `s.ended` direkt nach der Stufe. `sessionEnd()` emittiert
zuerst und setzt `ended` DANACH auf dem zurueckgegebenen Zustand — sonst haette
der Riegel den eigenen Abschluss verschluckt. `ended` wird immer gesetzt, auch
auf Stufe `off` und auch bei einem zweiten Aufruf.
Tests: `nach dem Abschluss sagt der Coach nichts mehr`, `der Abschluss setzt
ended auch auf Stufe off`.

## I8 — ein Typkontrakt fuer beide Module

**Entschieden: Zahlen sind Zahlen, keine Umwandlung.** Wortgleich dokumentiert
im Kopf von `js/coach-warmup.js` und `js/coach-rpe.js`:

- Ein GEWICHT ist eine endliche `number`. `'60'` ist ein String und damit kein
  Gewicht. `roundToPlate` gibt `null` zurueck, `warmupSets` `[]`, `adjustNext`
  und `ackFor` `null`.
- Eine OPTION (`step`, `barKg`) darf fehlen oder unbrauchbar sein und faellt
  auf ihre Vorgabe zurueck — sonst waere jeder Aufruf ohne Geraeteangabe
  wertlos.
- `step` ist immer die kleinste Scheibe je Seite (siehe I5).

Begruendung fuer die strenge Seite: `coach-warmup` sagt seit jeher
`warmupSets('100') === []` zu (bestehender Test), und dieselbe Datei durfte
nicht in zwei Richtungen zugleich lesen. Wichtiger ist aber der Fehlermodus:
`roundToPlate('60', 2.5, 20)` lieferte still `20` und damit die Ansage
"Aufwaermen mit 20 kg" statt mit 45. Ein stiller falscher Wert ist teurer als
gar keiner. `coach-rpe` wurde entsprechend von `Number(...)` auf `typeof
'number'` gezogen; kein bestehender Test hing daran.
`js/coach-session.js` behaelt bewusst sein lenientes `num()` mit `parseFloat`:
es liest Logzeilen aus dem Speicher, nicht Geraeteparameter. Das steht als
Bedenken im Bericht.
Tests: `roundToPlate lehnt einen Zahlstring ab…`, `roundToPlate liefert bei
unbrauchbarem Gewicht null`, `roundToPlate haelt den Kontrakt auch fuer step
und barKg`, `ein Zahlstring ist kein Gewicht`.

## Minor

- **`restTip`** bleibt in `LEVEL_KINDS.full` und ist jetzt dokumentiert: die
  Verdrahtung emittiert ihn selbst ueber `emit(sess, 'restTip', …)` mit dem
  Text aus `CoachCues`. Dasselbe gilt fuer `warmupIntro`, `recall`, `plateau`,
  `timeBudget` und `cue`. Die Liste steht im Modul, weil `emit` die einzige
  Ausgabestelle ist. Test: `restTip steht auf full, wird aber von keinem Pfad
  des Moduls ausgeloest` — haelt Kommentar und Code zusammen.
- **`prs`** faellt aus den `debrief`-Platzhaltern. Der Katalog kennt `{prs}`
  nicht; ein Wert ohne Vorlage wandert ungelesen durch und suggeriert der
  Verdrahtung, die Zahl werde gesagt. Die Bestwerte haben mit `prCongrats`
  einen eigenen Schluessel — dort gehoeren sie hin, nicht in die Bilanz. Der
  Katalog haette dafuer in allen vier Toenen und beiden Sprachen geaendert
  werden muessen, was ueber den Auftrag hinausgeht. Test: die Bilanz prueft
  `out.vars.prs === undefined`.
- **`prioritizeSay`** gibt `null` zurueck, wenn kein brauchbares Budget oder
  keine einzige priorisierte Uebung vorliegt. "Minuten reichen fuer 2
  Uebungen" und "30 Minuten reichen fuer 0 Uebungen" sind beides keine
  Auskunft.
- **Volumenriegel**: Median der zweiten gegen Median der ersten Haelfte des
  Abschnitts, Eintraege ohne Volumenzahl bleiben aussen vor. Damit hebt weder
  eine starke Schlusswoche noch eine schwache Startwoche das Plateau auf
  (dieselbe Zusage, die fuer das Topgewicht schon galt), und eine fehlende
  Zahl in der ERSTEN Zeile stellt den Riegel nicht mehr komplett still. Fehlt
  das Volumen ueberall, entscheidet das Topgewicht allein — dokumentierter
  Rueckfall. Vier Tests.
- **`normalize`** loest die Umlaute jetzt NACH `NFC` auf und entfernt danach
  ueber `NFD` die kombinierenden Zeichen. Dazu eine zweite Lesart
  (`plainFold`: ue -> u), gegen die entsprechend gefalteten Schluessel geprueft
  — damit trifft "Bankdrucken" ohne einen Alias je Schreibweise.
- **Schluessel**: `klimmzueg` -> `klimmzug` (traf nur den Plural), neu
  `chinup`, `nackendruecken`, `beincurl`.
- **Kurze Schluessel**: ab `MIN_SUB_LEN` (4) darf ein Schluessel mitten im
  Namen treffen, darunter nur am Wortanfang, Wortende oder als ganzer Name.
  `cueFor('Narrow Grip')` ist damit `null`, `cueFor('Barbell Row')` weiter der
  Ruder-Hinweis.
- **Oberer Riegel**: `MAX_WORK_KG = 1000` in `coach-warmup`. Bewusst weit ueber
  jedem realen Arbeitssatz, auch ueber der Beinpresse — die Schranke soll nur
  Tippfehler abfangen, nicht starke Nutzer.

## Testluecken der Mutationsprobe

Alle fuenf Ueberlebenden sind geschlossen. Gegenprobe auf Kopien
(Scratchpad, 14 Mutationen inklusive der fuenf benannten): **0 ueberlebt.**

| Mutation | Ergebnis |
| --- | --- |
| erzwungener Abschluss zaehlt nicht gegen `spoken` | gefangen |
| `mid` ohne `pct` | gefangen |
| `MIN_WORK_KG` 30 -> 26 | gefangen |
| Cue-Zuordnung vertauscht (Beinbeuger/Beinstrecker) | gefangen |
| `MAX_GAP_WEEKS` 3 -> 2 | gefangen |
| `force` fuer jede Art | gefangen |
| `ended` ignoriert | gefangen |
| `step` an der Stange nicht verdoppelt | gefangen |
| `roundToPlate` schluckt Zahlstring | gefangen |
| kurzer Schluessel per `indexOf` | gefangen |
| `exOpen` ohne `kg`-Riegel | gefangen |
| Volumenriegel letzte gegen erste Woche | gefangen |
| `sessionResume` verschenkt Budget | gefangen |
| `prioritizeSay` ohne Riegel | gefangen |

Dazu die von der Review benannten ungetesteten Pfade: Verhalten nach
`sessionEnd`, Neuanlage bei gleichem `wkTs`, `roundToPlate` mit String, und
`ackFor` + `adjustNext` zusammen. Die 28 Hinweise der Cue-Tabelle sind jetzt
einzeln an einen Uebungsnamen gebunden (`ZUORDNUNG` in
`test/coach-cues.test.js`), inklusive der Pruefung, dass kein Hinweis der
Tabelle unverankert bleibt. `MAX_GAP_WEEKS` ist an seiner dokumentierten Kante
festgenagelt: drei ausgelassene Wochen trennen nicht, vier trennen.

## Laeufe

```
node --test test/*.js
Ausgangsstand:                     tests 350 / pass 350 / fail 0
nach den Tests, vor den Fixes:     tests 407 / pass 372 / fail 35
nach den Fixes:                    tests 407 / pass 407 / fail 0
```

Bauart unveraendert: IIFE ueber `globalThis`, `'use strict'`, reine Funktionen,
kein DOM, keine App-Globals, kein `localStorage`, `module.exports` UND
`root.CoachX`, kein `fetch`/`AI_WORKER_URL`, keine Emojis, Sprache als
Argument. Maschinell geprueft ueber alle sechs Dateien.
