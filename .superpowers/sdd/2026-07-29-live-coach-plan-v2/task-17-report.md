# Task 17 — Bericht: Erzaehlbogen im Training verdrahtet, offline geprueft

Angefasst: `index.html`, `sw.js`, `build.js`, `js/coach-persona.js` (nur die
Satzvarianten aus Punkt 4 und der Zusatzpunkt aus der Review), dazu die
Pruefartefakte `task-17-check.js` / `task-17-training.png` / dieser Bericht.
**Nicht** angefasst: `js/coach-session.js`, `js/coach-warmup.js`,
`js/coach-cues.js`, `js/coach-rpe.js`, `js/coach-analyze.js`, `test/*`,
`firestore.rules`, `APP_VERSION`, `CHANGELOG`, `CACHE` in `sw.js:2`.

---

## 1. Getroffene Anker

`WK` als Zustandsobjekt gibt es **nicht** (`WK.active`, `WK.ts`, `WK.planName`:
null Treffer). Die laufende Einheit haengt an zwei Globals, gegen die verdrahtet
wurde:

| Gesucht | Gefunden | Stelle |
| --- | --- | --- |
| `WK.ts` (stabiler `wkTs`) | **`timerTs`** — in `startActive()` gesetzt, in `_restoreActiveWk()` aus `gt_active_wk` **unveraendert** wiederhergestellt (`timerTs = saved.ts`) | `index.html` `startActive()` / `_restoreActiveWk()` |
| `WK.planName` | `_activePlanSrc` + `presetById()` / `_planLabelFor()` / `_getTodayLabel()` → `_csPlanName()` | ebd. |
| Satzliste | `wkLogs` (`[{exerciseId, sugW, sugR, sets:[{w,r,done,type}]}]`) | ebd. |

`timerTs` ist ein tauglicher `wkTs`: er ueberlebt den App-Neustart identisch,
genau das braucht `isStale()`. **Kein Befund zu melden.**

| Einhaengepunkt | Wo |
| --- | --- |
| `_csStart()` | Ende von `startActive()`, nach `renderLogCards()` |
| `_csResume()` | Ende von `_restoreActiveWk()` |
| `_csExercise(ex)` / `_csSyncCurrentEx()` | Ende von `renderLogCards()` |
| `_csSet(log)` | `toggleSetDone()`, im `next`-Zweig neben `_coachMicroReact` |
| `_rpeAsk(li,si)` | dieselbe Stelle, direkt danach |
| `_csRest(secs)` | `_beginRestCountdown()`, Zweig `remaining <= 0` |
| `CoachSession.onTick` | Intervall in `_startWkTimer()`, `e % 60 === 0` — **hoechstens einmal pro Minute** |
| `_csEnd(summary)` | `finishWk()`, nach `persist()` und **vor** `closeOv('ov-wk')` |
| `_csDiscard()` | `cancelWk()` |
| Offline-Satz im Chat | `aicSend()`, nach dem Router und vor `_aicBusy = true` |
| `snap.warmupText` | `_coachSnap()` — der bis Block 3 leer gelassene Router-Wert ist jetzt gefuellt |

**„Uebung geoeffnet" gibt es in dieser App nicht als Zustand** — alle Karten
stehen offen untereinander. Genommen wurde die Definition, die schon die KI-Aura
in `renderLogCards()` und `snap.active` im Chat benutzen: *die erste Uebung mit
offenen Saetzen*. Wechselt sie, ist eine Uebung „geoeffnet".

`_csEnd()` steht **vor** `closeOv('ov-wk')`, weil `#wk-coach-bar` in genau diesem
Overlay liegt und die einzige erlaubte Flaeche ist. Es entsteht keine neue.

**Die fuenf fehlenden Hilfsfunktionen**, gegen den echten Code gebaut:

- `_csLastSame()` — `S.sessions` kennt **keine** Plan-Referenz. Zuordnung
  deshalb ueber die Uebungsmenge: die juengste Einheit, in der mindestens die
  **Haelfte** der heutigen Uebungen vorkam. Leituebung ist die erste heutige,
  die auch damals dran war; `kg/reps/sets` aus deren Topsatz (`_coachTopSet`),
  `vol` aus `setsVolume()` ueber alle Logs.
- `_csExpectedSets()` — Summe der Satzzeilen aller `wkLogs`, ersatzweise
  `ex.targetSets`. Steuert `midAt` (Halbzeit).
- `_coachMutedKinds()` — `CoachLog.logStats(S.coachLog).muted`; die Drosselung
  nach fuenf Ignorierungen existiert bereits im Modul.
- `_coachLastAcceptedTip()` — juengster Eintrag mit `accepted === true` aus
  demselben Log. Nur Tipps mit `ts < timerTs` loesen `recall` aus, sonst waere
  es kein Rueckblick.
- `_csEquip(ex)` — s. Abschnitt 4.

---

## 2. Entscheidung zu Punkt 4 (`setAckHard`)

**Der Katalogtext war die falsche Seite, nicht die Rechnung.** Geaendert wurden
die vier Satzvarianten in beiden Sprachen; `CoachRpe.adjustNext` blieb
unberuehrt.

Begruendung:

1. Der Brief zu **Task 15** pinnt die Richtung woertlich in der Pruefliste:
   „‚schwer' antippen | Quittung; naechster Vorschlag derselben Uebung eine
   Stufe **niedriger**" — und in der Testtabelle mit dem exakten Wert
   `adjustNext(60,'schwer',2.5) === 57.5`, „**exakter Wert**, nicht nur `< 60`".
   Die Rechnung ist damit festgeschrieben, der Text nicht.
2. „Gewicht bleibt bei 57,5 kg" nach einem 60-kg-Satz ist schlicht unwahr —
   `ackFor()` liefert das **neue** Gewicht in `vars.kg`. In der gelieferten Form
   war `ackFor()` unbenutzbar.
3. Der Sinn der Rueckfrage ist, dass die Antwort etwas bewirkt. Ein Satz, der
   „bleibt" sagt, waehrend die App senkt, macht die Wirkung unsichtbar.

Neu (DE / EN), alle vier Toene, `hart` ≤ 8 Woerter, `ruhig` ohne Ausrufezeichen,
kein Platzhalter ohne Wert, vier verschiedene Saetze:

| Ton | DE | EN |
| --- | --- | --- |
| ruhig | Verstanden. Wir gehen eine Stufe zurück auf {kg} kg. | Understood. We step back down to {kg} kg. |
| sachlich | Notiert. Nächster Vorschlag: {kg} kg, eine Stufe niedriger. | Noted. Next suggestion: {kg} kg, one step lower. |
| hart | Zu schwer. Runter auf {kg} Kilo. (6 Woerter) | Too heavy. Down to {kg} kilos. (6 Woerter) |
| locker | Dann nehmen wir eine Stufe raus — {kg} kg. | Then we take one step off — {kg} kg. |

**Zusatzpunkt aus der Review, dieselbe Datei:** `warmupIntro` sagte in `ruhig`
und `hart` „zwei leichte Saetze" bzw. „Zwei Saetze", `sachlich` „drei Saetze" —
`warmupSets()` liefert je nach Arbeitsgewicht und Raster **einen bis drei**. Die
Satzzahl steht jetzt in keinem der acht Saetze mehr; die Zahlenreihe haengt die
Aufrufstelle an.

`node --test test/coach-persona.test.js` danach: **27/28**. Der eine
Fehlschlag (`der Plateau-Satz beschreibt die beobachtete Pause, statt sie zu
empfehlen`, `plateau/ruhig/de`) betrifft einen Satz, den ich **nicht** angefasst
habe, und stammt aus der parallel laufenden Fix-Welle — s. Abschnitt 6.

---

## 3. Wo `step`, `barKg` und die Einheit herkommen

Eine Bedeutung fuer beide Module: **`step` = kleinste Scheibe JE SEITE.**
`CoachWarmup.roundToPlate()` verdoppelt intern (`plateStep = barKg > 0 ?
step * 2 : step`), `CoachRpe.adjustNext(kg, answer, step, barKg)` seit der
Fix-Welle genauso. Verdrahtet ist gegen die **vierparametrige** Signatur; der
vierte Parameter klemmt auf das Stangengewicht (ohne ihn liefert
`adjustNext(20,'schwer',…)` 17,5 kg unter einer 20-kg-Stange).

`_csEquip(ex)` (`index.html`, Task-17-Block):

| Parameter | Quelle | Warum diese |
| --- | --- | --- |
| `barKg` | `ex.showPlateCalc ? dispToKg(_pcCurBar()) : 0` | `ex.showPlateCalc` ist der bestehende **Pro-Uebung**-Schalter „Langhantel-Uebung" (Einstellungstext: „welche Scheiben pro Seite aufzustecken sind — fuer Langhantel-Uebungen"). Ohne ihn ist es Maschine / Steckgewicht / Kabelzug ⇒ **zwingend 0**. `_pcCurBar()` liefert das gewaehlte Stangengewicht aus `S.plateBar`; `_pcBars()` enthaelt bewusst `0` („ohne") — waehlt der Nutzer das, ist `barKg` auch bei einer Langhantel-Uebung 0. |
| `step` | `dispToKg(Math.min(..._availPlates()))` | `S.availablePlates` sind die **im Studio vorhandenen** Scheiben; die kleinste davon ist der physische Boden je Seite. Fallback `CoachWarmup.DEFAULT_STEP`. |
| Einheit | `S.unitMode` via `dispToKg()` hinein, `kgToDisp()` + `unitLabel()` hinaus | `S.plateBar` und `S.availablePlates` liegen in der **Anzeige**-Einheit (lbs-Stangen 45/35, lbs-Scheiben) — die Module rechnen in kg. |

`CoachWarmup.format()` schreibt fest „kg". `_csWarmupText(sets)` benutzt es nur
bei `unitLabel() === 'kg'`; bei lbs wird an der Aufrufstelle umgerechnet und
selbst beschriftet, mit derselben Zahlformatierung wie das Modul
(`toLocaleString`, deutsch Komma / englisch Punkt).

Belegt in Check 8: Langhantel `barKg 20`, Maschine `barKg 0`, „ohne" gewaehlt
`barKg 0`, Studio ohne 1,25er `step 2,5`, lbs `barKg 20,4 kg` / `step 1,13 kg`
und die Reihe in `lbs` statt `kg`.

---

## 4. Pruefliste des Briefs — rot / gruen

Kein Simulator auf diesem Rechner (Windows, kein Xcode). Ersatz:
`.superpowers/sdd/2026-07-29-live-coach-plan-v2/task-17-check.js`, statischer
Node-Server auf Port **8795**, Chromium ueber Puppeteer, echte Zeigerfolgen.

**Rot-Lauf gegen den Stand vor der Aenderung** (`node task-17-check.js
--root=<HEAD-Baum>`, Baum aus `git show HEAD:…`): **2/23 PASS.**
**Gruen-Lauf gegen den Arbeitsstand: 23/23 PASS**, keine Seitenfehler.

| # | Check | Rot (HEAD) | Gruen |
| --- | --- | --- | --- |
| 1 | Registrierung: fuenf `<script>`, Kopierliste `build.js`, `SHELL` in `sw.js`, `CACHE` unangetastet | FAIL (0 von 5 registriert) | PASS |
| 2 | **Trainingsstart ohne Netz:** Begruessung in `#wk-coach-bar`, genau EINE Zeile, kein Overlay | FAIL (`_csStart is not defined`) | PASS |
| 3 | **Uebung oeffnen:** Ansage **und** Aufwaermschema, in Kilo statt Prozent | FAIL | PASS |
| 4 | `exOpen` entprellt: dieselbe Uebung 5× erneut ⇒ keine zweite Ansage | FAIL | PASS |
| 5 | **Saetze abhaken:** drei Chips, Halbzeit (`mid`), Ermuedung (`fatigue`) | FAIL | PASS |
| 6 | **Satz-Rueckfrage verschwindet nach 8 s unbeantwortet** und blockiert nichts (Abhaken laeuft weiter, kein Modal) | FAIL (`_rpeAsk is not defined`) | PASS |
| 7 | „schwer" senkt eine Stufe, „leicht" hebt, Quittung nennt das **neue** Gewicht und nicht „bleibt" | FAIL | PASS |
| 8 | `step`/`barKg` aus den Geraeteeinstellungen, Maschine `barKg 0`, lbs umgerechnet | FAIL (`_csEquip is not defined`) | PASS |
| 9 | **Obergrenze `full`:** > 8 ausloesende Ereignisse ⇒ hoechstens **8** | FAIL | PASS |
| 10 | **Training beenden:** Abschluss erscheint, Zustand genullt und persistiert | FAIL | PASS |
| 11 | **Obergrenze `key`:** derselbe Durchlauf ⇒ hoechstens **4**, nur Schluesselmomente | FAIL | PASS |
| 12 | **Obergrenze `off`:** keine einzige Aeusserung, kein Abschluss, keine Chips | PASS¹ | PASS |
| 13 | **Offline** (`setOfflineMode(true)`): kompletter Durchlauf, alle Aeusserungen kommen | FAIL | PASS |
| 14 | **Chat ohne Netz:** „Wie lang ist meine Streak?" sofort vom Router; „Was haeltst du von meinem Plan?" ⇒ EIN klarer Satz zur Verbindung, kein Fehler, kein haengender Ladepunkt | FAIL (leere Antwort) | PASS |
| 15 | **Uebungsname mit Markup erscheint als Text**, kein `onerror` laeuft | FAIL | PASS |
| 16 | Zustand ueberlebt den Reload mitten im Training — der Deckel zaehlt **nicht** von vorn | FAIL | PASS |
| 17 | Fremder `wkTs` verworfen; nach `sessionEnd` redet kein Modulaufruf mehr | FAIL | PASS |
| 18 | `setFeedback` aus ⇒ keine Chips, der Bogen laeuft weiter | FAIL | PASS |
| 19 | Englischer Durchlauf: Bogen, Chips, Frage, Quittung — kein deutscher Coach-Text | FAIL | PASS |
| 20 | Screenshot des laufenden Trainings (`task-17-training.png`) | FAIL | PASS |
| 21 | Statisch: `persist()` statt `save()`, `emit()` **nie** mit `force`, kein `fetch`/`AI_WORKER_URL` im Bogen | FAIL (Block existiert nicht) | PASS |
| 22 | **Blockabschluss 3:** kein Netzaufruf in den fuenf Modulen | PASS² | PASS |
| 23 | Statisch: kein Emoji, ISO-Woche nur ueber `CoachAnalyze.isoWeekKey()` | FAIL | PASS |

¹ gegen ein leeres Skelett trivial gruen (nichts verdrahtet ⇒ nichts gesagt).
Der Check bleibt stehen, weil er einen echten plausiblen Fehler faengt: `force`,
das an Stufe `off` vorbeigeht.
² der Blockabschluss-Riegel des Briefs; er war vorher gruen und muss gruen
**bleiben** — reiner Regressionsschutz.

Die statischen Riegel (21, 23) laufen kommentarblind (`ohneKommentar()`), sonst
schlaegt der `save()`-Riegel schon an der Erklaerung an, **warum** `save()`
verboten ist.

### Zwei echte Befunde aus dem Rot→Gruen-Weg

1. **Der Bogen brach in der Mitte ab.** Erster Gruen-Versuch: `greet, exOpen,
   warmupIntro, cue, plateau, restNext, restNext` — `mid` und `fatigue` kamen
   **nie**. Die Feinheiten fallen alle beim **Oeffnen** einer Uebung an, die
   Schluesselmomente erst spaeter; `emit()` reserviert aber nur EINEN Platz, den
   fuer den Abschluss. Behoben mit einem Rueckhalt an der Aufrufstelle
   (`CS_RESERVE = 2`, `_csHasRoom()`): Technikpunkt, Plateau, Rueckblick,
   Zeitbudget und die Pausenvorschau melden sich nur, solange zwei Plaetze fuer
   `mid`/`fatigue` frei bleiben. `restNext` entsteht **im** Modul, dort wird die
   Buchung zurueckgenommen (`_csTake()`) — das kann den Zaehler nur **senken**,
   die Obergrenze also nie reissen.
2. **Zwei statische Riegel schlugen an eigener Prosa an** (`save()` und
   `getWeekKey()` im Kommentar). Zusaetzlich schlug **`task-10-check.js`** an —
   dessen Block-Slice reicht ueber meinen neuen Block hinweg. Geloest, indem der
   Kommentar umformuliert wurde; `task-10-check.js` blieb unangetastet.

---

## 5. Verhaltensregeln — wo sie strukturell verankert sind

- **Genau eine Flaeche.** Jede Ausgabe laeuft durch `_csEmit()` → `_coachBarSet()`
  → `#wk-coach-bar`. Die Satz-Rueckfrage liegt als `.cb-ask3` **innerhalb**
  derselben Leiste. Es entsteht keine neue Flaeche, nichts Modales (Check 2, 6).
- **Hoechstens eine Aeusserung gleichzeitig.** `_coachBarSet` ersetzt die vorige
  und setzt die Haltezeit neu: `debrief` 14 s, sonst 9 s. Faellt an einem Moment
  mehr als eine an (Trainingsstart, Uebung geoeffnet), reiht `_csSeq()` sie auf
  dem **Zeitstrahl** (`CS_GAP_MS = 4500`) statt im Bild — kein Stapel. Check 2
  misst in Echtzeit genau eine `.coach-bar-msg`.
- **Die Obergrenze gilt fuer jede Quelle.** Aufwaermschema, Technikpunkt,
  Plateau, Rueckblick und Zeitbudget laufen alle durch
  `CoachSession.emit()`. `force` wird **nirgends** aus der Verdrahtung gerufen
  (statisch belegt, Check 21); nur `sessionEnd()` forciert intern.
- **`S.coachSession` ist rein lokal.** Das Feld steht nicht im Whitelist-Payload
  von `_pushToCloud()` — es gibt keinen zweiten Firestore-Schreibpfad,
  `firestore.rules` blieb unberuehrt. Geschrieben wird mit **`persist()`**
  (Check 16 belegt: der Wert liegt nach dem Reload in `localStorage['ft4']` und
  der Deckel zaehlt nicht von vorn).
- **Nach `sessionEnd` schweigt alles.** `_csGet()` gibt `null` bei `sess.ended`
  **und** bei fremdem `wkTs` (Check 17). `_csEnd()`/`_csDiscard()` nullt und
  persistiert.
- **`setFeedback === false` schweigt** — dieselbe Wache wie in
  `_coachMicroReact`, in `_rpeAsk()` (Check 18).
- **Defensiv.** Jeder Einstiegspunkt in `try/catch`, jede Modulgrenze abgesichert
  (statisch: > 20 `catch` im Block). Kein `fetch` im Bogen.
- **`esc()` vor `innerHTML`.** Uebungsnamen sind Nutzertext und gehen als
  Platzhalter durch; `_coachBarRender()` escaped die Zeile (Check 15).

---

## 6. Bedenken

1. **Die Fix-Welle lief parallel und hat waehrend dieser Task in `js/` und
   `test/` eingecheckt.** Zwischenzeitlich war die Suite bei 395/407 (12 rot,
   alle in `plateau`: `test/coach-analyze.test.js` 6 Faelle und der
   `plateau`-Satz in `test/coach-persona.test.js`); mein Bereich war dabei
   durchgehend gruen (`coach-session` 56/56, `coach-rpe` 36/36, `coach-warmup`
   21/21, `coach-cues` 19/19). Beim Commit war die Welle fertig: **407/407**.
   **Der Commit enthaelt in `js/coach-persona.js` neben meinen beiden
   Aenderungen auch die `plateau`-Satzvariante der Fix-Welle** — sie landete in
   derselben Datei, Sekunden bevor ich committet habe. Sie herauszuloesen haette
   entweder fremde Arbeit umgeschrieben oder ein `main` hinterlassen, auf dem
   `index.html` die neue `setAckHard`-Fassung erwartet, waehrend der Katalog noch
   „bleibt" sagt. Nichts umgeschrieben, hiermit notiert. Alle uebrigen
   `js/coach-*.js` und `test/*` sind **nicht** mitcommittet — die gehoeren der
   Fix-Welle.
2. **`step` ist mit dem Standard-Scheibensatz sehr fein.** `PC_PLATES_KG`
   enthaelt `0.5`, und ohne eigene Auswahl gelten alle Scheiben als vorhanden ⇒
   `step = 0,5 kg`. Eine „schwer"-Antwort bewegt damit nur eine halbe Stufe
   (gemessen: 50 → 49,5 kg). Regelkonform (kleinste vorhandene Scheibe je Seite)
   und vom Nutzer ueber „Verfuegbare Scheiben" steuerbar, aber als
   Standardverhalten fuehlt es sich zahnlos an. Ein Boden (z. B. „nie feiner als
   1,25 kg je Seite") waere eine Produktentscheidung — nicht geraten.
3. **Der Satzkatalog schreibt ueberall fest „kg"/„kilos".** Umgerechnet wird nur
   dort, wo ich den Text selbst baue (Aufwaermreihe). Ein lbs-Nutzer hoert im
   Bogen (`greet`, `exOpen`, `restNext`, `setAck…`) weiterhin kg-Zahlen mit
   kg-Beschriftung. Das ist eine Katalogeigenschaft, keine Verdrahtungsfrage —
   gehoert in dieselbe Welle wie Punkt 1.
4. **`restTip` wird nirgends ausgeloest.** `CoachSession` kennt die Art, emittiert
   sie aber nie, und der Katalogsatz nennt hartcodiert „Schultern unten" — er
   passt nur auf einen Teil der Uebungen. Technik laeuft deshalb ausschliesslich
   ueber `cue` mit dem echten Hinweis aus `CoachCues`. Bewusst nicht selbst
   emittiert: ein zweiter Technikkanal haette dem ersten nur das Budget genommen.
5. **`timeBudget` hat keine belegte Quelle fuer „ich habe heute X Minuten".** Die
   App hat kein solches Eingabefeld. Genommen wurde die **uebliche Dauer der
   letzten zehn Einheiten** (ab drei Einheiten mit Dauer), und gesagt wird nur
   etwas, wenn tatsaechlich eine Uebung herausfaellt. `prio` ist die
   Planreihenfolge (`i + 1`, kleiner = wichtiger).
6. **`plateau` bekommt `avgRestSecs` aus `S.restTimerSecs`.** Einzelne Pausen je
   Satz speichert `S.sessions` nicht. Der Satz nennt damit die **eingestellte**,
   nicht die gemessene Pause. Ehrlicher waere „keine Angabe" — der Katalogsatz
   hat dafuer aber keine Variante.
7. **Der Abschluss steht sehr kurz.** `_csEnd()` schreibt in `#wk-coach-bar` und
   `finishWk()` schliesst gleich darauf `ov-wk` und oeffnet den Check-in. Die
   Bilanz bleibt zwar im DOM stehen (belegt in Check 10), ist aber nur zu sehen,
   wenn der Nutzer das Overlay wieder oeffnet. Eine zweite Flaeche war verboten,
   eine Reihenfolgenaenderung in `finishWk()` waere ueber diese Task hinausgegangen.
8. **`getWeekKey()` (nicht-ISO, `2026-W5`) und `CoachAnalyze.isoWeekKey()`
   bestehen weiter nebeneinander.** Nicht zusammengefuehrt (Block 5). Statisch
   belegt, dass im neuen Block nur der ISO-Weg vorkommt (Check 23).
9. **Die Mikro-Reaktion (`_coachMicroReact`) laeuft weiter neben dem Bogen** und
   zaehlt **nicht** gegen die Obergrenze — sie ist der Kanal „Rueckmeldung nach
   dem Satz" und haengt allein an `setFeedback`, wie `setAsk`. Wer beides
   einschaltet, hoert pro Satz eine Zeile plus den Bogen. Das entspricht den
   zwei getrennten Schaltern in der Oberflaeche, kann aber im echten Training
   nach mehr Gerede klingen als „hoechstens acht" vermuten laesst.
10. **Die Satz-Quittung geht bewusst nicht durch `emit()`.** Sie braeuchte
    dafuer `force` (`setAck…` steht nicht in `LEVEL_KINDS`), und `force` gehoert
    laut Review ausschliesslich `sessionEnd`. Sie liegt deshalb im selben Kanal
    wie die Frage: `setFeedback`, nicht gezaehlt. Stufe `off` schweigt trotzdem
    (Check 12).
