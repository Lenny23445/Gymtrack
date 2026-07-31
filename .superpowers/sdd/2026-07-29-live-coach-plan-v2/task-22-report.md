# Task 22 — Datentrennung und Kontowechsel

Stand: 2026-07-31 · Zweig `main` · geänderte Datei: **nur `index.html`**
(`sw.js`, `build.js`, `firestore.rules`, `APP_VERSION`, `CACHE`, `CHANGELOG` unangetastet;
kein Modul unter `js/` angefasst).

---

## 1. Der Coach-Zustand — vollständig, und wo er zurückgesetzt wird

Erhoben mit `grep -n "S\.coach\|aiCoach" index.html` plus einer Durchsicht der
Laufzeitvariablen (`let _cs*`, `let _coach*`, `let _ai*`) und aller
`gt_`-Schlüssel in `localStorage`. Die Liste des Auftrags war **nicht
vollständig**; die Zusatzfunde stehen unten kursiv markiert.

| Zustand | Wo | Beim Kontowechsel | Stelle |
| --- | --- | --- | --- |
| `S.aiCoach` (Name, Ton, Stimme, `preset`, `inTraining`, `setFeedback`, `pushLevel`, `insights`, `live`, *`liveWas`*) | nur lokal in `S` (**nicht** in Firestore, s. Befund 1) | auf `_coachPersonaDefaults()` zurückgesetzt, `preset` fehlt im Objekt und ist damit `undefined` | `_coachWipeLocal()` Schritt 1 |
| `S.coachSession` (Erzählbogen) | nur lokal | `null` | Schritt 2 |
| *Laufzeitspuren des Erzählbogens*: `_csLastExId`, `_csSeenEx`, `_csSeenSets`, `_csSeqAt`, `_csRestPlan`, `_csSaveTs`, `_csSaveTmr`, `_csFinalLine`, `_csLastSetTs`, `_rpeAnswers`, `_rpePend`/`_rpeTimer` (über `_rpeClear(false)`) | nur Speicher | zurückgesetzt / Timer gekappt | Schritt 2 |
| *Live-Coach-Laufzeit*: `_coachState` (Rate-Limits), `_coachCard` (über `_coachClearCard()`), `_coachEvalTimers`, `_coachBarState`, `_coachBarMsgTimer`, `_coachMicroLast` | nur Speicher | zurückgesetzt / Timer gekappt | Schritt 2 |
| `S.coachPush` (`state`, `plan`, `permOk`, `owns`) | nur lokal | `null` | Schritt 3 |
| `S.coachReports` | nur lokal | `[]` | Schritt 4 |
| `S.coachReportAt` | nur lokal | `_coachReportAtDefault()` = `{day:0, hour:18}` | Schritt 4 |
| `S.coachLog` (Aktions-Log) | nur lokal | `[]` | Schritt 5 (vorher direkt in `_coachHandleAuthUser`, jetzt an derselben Stelle wie der Rest) |
| Chatverlauf `_aicHist` + `localStorage['gt_aiChat']` | lokal | `[]` / entfernt | Schritt 6 |
| *`localStorage['gt_aiQuota']` + `_aiQuotaTs`* | lokal | entfernt / `0` | Schritt 7 |
| *Hub-Reiter `_chTab`, `_chResetScroll`* | nur Speicher | `'chat'` / `true` | Schritt 8 |
| Geplante Meldungen **47000–47999** | System (LocalNotifications) | über `_coachDropOwnNotifs()` → `_cnCancelOwn()` abbestellt, danach `scheduleWorkoutNotifications()` | Schritt 11 |
| Dossier (`_dossier()`/`_dossierSet()`, `CoachMemory.dossierLoad/Save`) | uid-gekoppelt in `localStorage` | **bleibt** — der alte Schlüssel wird gezielt in `_coachHandleAuthUser()` geräumt, aber nur wenn der letzte Push bestätigt war | unverändert (Bestand) |

Schreibweg: **`persist()`**, an genau einer Stelle (Schritt 9). Kein `save()`.
Prüfung dafür: statischer Check 19 (`save()`-Riegel) plus Laufzeitcheck 2, der
`ft4` nach dem Abmelden liest.

**Einstieg:** Der gesamte Ablauf hängt an `_coachHandleAuthUser(user)` — der
einen Stelle, die alle drei Auth-Wege der App passieren
(`onAuthStateChanged`, Google-nativ, Apple-nativ). Gewechselt wird nur, wenn
`_coachLastUid !== undefined && _coachLastUid !== neu`: Kaltstart und ein
zweiter Durchlauf mit demselben Konto räumen nichts ab (Check 11).

**Wenn ein Schritt scheitert:** `_coachWipeLocal()` fängt jeden Schritt einzeln
ab, läuft weiter, gibt die Fehlerliste zurück und meldet sie über
`_coachWipeFailed()` als `console.error('[Coach] Datentrennung unvollstaendig: …')`
plus einen Hinweis auf dem Bildschirm. Zusätzlich sieht
`_coachDropOwnNotifs()` nach dem Abbestellen **nach**, ob wirklich kein
47xxx-Termin mehr steht — `_cnCancelOwn()` schluckt seine Fehler selbst, ein
stiller Rest wäre sonst nicht bemerkbar. Nachweis: Check 12 (Sabotage eines
Schrittes).

---

## 2. Was beim Kontowechsel bewusst erhalten bleibt — und warum

| Bleibt | Grund |
| --- | --- |
| `S.sessions`, `S.exercises`, `S.weekPlan`, `S.workoutPresets`, … | Kerndesign der App: lokale Daten überleben das Abmelden und werden beim nächsten Login in das neue Konto gemergt (`_mergeData`/`_pushToCloud`). Genau das verspricht die Rückfrage beim Abmelden. **Folge, die man kennen muss:** der Reiter „Woche" zeigt danach den frisch gerechneten Zwischenstand aus diesen Daten — nicht den gespeicherten Bericht des Vorbesitzers, aber sehr wohl dessen Trainingsvolumen. Das ist Bestandsverhalten und außerhalb dieser Task; wenn es weg soll, ist das eine eigene Spec über die lokalen Trainingsdaten, nicht über den Coach. |
| Das **Dossier** des alten Kontos, solange ein Push noch nicht bestätigt ist (`_dossierIsDirty`) | Sonst geht eine gerade eingetragene, nie hochgeladene Einschränkung verloren (Review Wichtig 2 aus Task 7). Es ist uid-gekoppelt und für das neue Konto ohnehin nicht lesbar. |
| Der Pausen-Timer (`id 2500`) | Der Nummernraum-Filter räumt strikt 47000–47999. Ein pauschales `cancel()` würde eine laufende Satzpause töten. |
| Die generische Trainings-Erinnerung (1000–1999) | Sie gehört nicht dem Coach. Nach dem Wechsel ist `S.coachPush` `null`, `_cnOwnsReminder()` also `false` — `scheduleWorkoutNotifications()` plant sie neu, sofern der Schalter an ist. |
| `S.checkins`, `S.privacy`, `S.friends`, `S.blocked` | Nicht Teil des Coach-Zustands; eigene Felder mit eigener Bedeutung. Hier bewusst **nicht** angefasst — der Auftrag ist die Datentrennung des Coaches, kein Rundumschlag. |

---

## 3. Prüfliste — rot/grün

Prüfskript: `.superpowers/sdd/2026-07-29-live-coach-plan-v2/task-22-check.js`
(Chromium über Puppeteer, eigener Port **8801**, Tipps über echte Zeigerfolgen
mit `page.click`). Rot-Lauf gegen einen Baum mit `git show HEAD:index.html`.

```
grün  (Arbeitsstand):  24/24 PASS
rot   (Stand vor der Änderung, --root=<HEAD-Baum>):  6/24 PASS  →  18 rot
```

| # | Check | vor der Änderung | danach |
| --- | --- | --- | --- |
| 1 | Abmelden über den echten Knopf im Konto-Blatt: **jedes** Feld namentlich zurückgesetzt (Persona/`preset undefined`, `coachSession null`, `coachPush null`, `coachReports []`, `coachReportAt {0,18}`, `coachLog []`, `gt_aiChat`, `gt_aiQuota`) | **ROT** | GRÜN |
| 2 | Derselbe Stand auch in `ft4` — `persist()`, nicht `save()` | **ROT** | GRÜN |
| 3 | Kein Termin 47000–47999 mehr; 2500 läuft weiter; 1000–1999 wieder geplant | **ROT** | GRÜN |
| 4 | Abmelden und **ohne Konto** weiterarbeiten: kein „Nina", keine Zahl von A, Hub startet die Einrichtung | **ROT** | GRÜN |
| 5 | Konto B, Heute-Tab: Karte trägt „Coach", nicht „Nina" *(Briefzeile 43)* | **ROT** | GRÜN |
| 6 | Konto B öffnet den Hub → Einrichtung startet *(Briefzeile 44)* | **ROT** | GRÜN |
| 7 | Konto B, Hub → „Woche": kein gespeicherter Bericht von A *(Briefzeile 45)* | **ROT** | GRÜN |
| 8 | Konsole: `S.coachSession`/`S.coachPush` sind `null` *(Briefzeile 46)* | **ROT** | GRÜN |
| 9 | A → B → zurück zu A: A bekommt sein Dossier (Ziel „Kraft", „Knieprobleme links") wieder, B hinterlässt weder Dossier noch Bericht noch Namen, lokale Felder bleiben leer *(Briefzeile 48)* | **ROT** | GRÜN |
| 10 | Der ganze Wechsel schreibt nur über bestehende Wege (`users/{uid}`, `users/{uid}/coach/dossier`, `profiles/{uid}`, `analytics_users/{uid}`) | grün *(Wächter)* | GRÜN |
| 11 | Kaltstart und zweiter Auth-Durchlauf mit demselben Konto räumen **nichts** ab | grün *(Wächter)* | GRÜN |
| 12 | Ein Schritt scheitert: Trennung läuft weiter, meldet zurück, `console.error` + Hinweis auf dem Bildschirm | **ROT** | GRÜN |
| 13 | Dossier-Eintrag mit **Markup** erscheint als Text | grün *(Wächter)* | GRÜN |
| 14 | Zusatzauftrag: genau eine Bedienfläche für `S.coachReportAt` im Hub (7 Tage, 24 Stunden), echter Tipp schreibt und persistiert | **ROT** | GRÜN |
| 15 | Der Termin wird wirklich verstellt (`So`/`20` → `_cnReportAt()` fällt auf Sonntag 20 Uhr, zwei Chips markiert) | **ROT** | GRÜN |
| 16 | Englische App: „Weekly report"/„Day"/„Time", englischer Satz, kein Emoji | **ROT** | GRÜN |
| 17 | Gestaltungsregel 1: zwei Flächen unter der Kopfzeile, ein Coach-Einstieg, kein fünfter Tab, kein fünfter Hub-Reiter | grün *(Wächter)* | GRÜN |
| 18 | Beleg-Screenshot `task-22-hub.png` | **ROT** | GRÜN |
| 19 | Statisch: `_coachWipeLocal()` nutzt `persist()`, nirgends `save()`, jeder Schritt in `try/catch`, alle sechs Felder gesetzt | **ROT** | GRÜN |
| 20 | Statisch: die beiden Greps des Briefs — Liste der Coach-/Profil-Schreibaufrufe **zeichengleich** mit HEAD, `js/coach-*.js` netzfrei (ohne Kommentare), `firestore.rules` unverändert | **ROT** *(nur wegen `wipeDa`)* | GRÜN |
| 21 | Statisch: `_coachDropOwnNotifs()` geht über `_cnCancelOwn()` (47000–47999), nie pauschales `cancel()`, sieht danach nach | **ROT** | GRÜN |
| 22 | Statisch: die Rückfrage beim Abmelden nennt beides, mit englischem Gegenpart | **ROT** | GRÜN |
| 23 | Der Hinweistext der **Kontolöschung** stimmt weiter | grün *(Wächter)* | GRÜN |
| 24 | `APP_VERSION`, `CACHE`, `CHANGELOG` unangetastet | grün *(Wächter)* | GRÜN |

Die sechs mit *(Wächter)* markierten Punkte sind bewusst auch vorher grün: sie
prüfen, dass die Änderung **nichts kaputt macht**, nicht dass sie etwas
Neues kann. Alles, was Task 22 tatsächlich baut, ist vorher rot.

### Regressionslauf

```
node --test test/*.js                517/517 PASS
task-21-check.js                       22/22 PASS
task-19-check.js                       27/27 PASS
task-17-check.js                       23/23 PASS
block3-fix-check.js                    21/21 PASS
task-10-check.js                       46/46 PASS
task-9-check.js                        20/20 PASS
lang-check.js                            4/4 PASS
task-22-check.js                       24/24 PASS
```
Seitenfehler in allen Browser-Läufen: keine.

---

## 4. Befunde

### Befund 1 (wichtig) — die Tabelle des Briefs stimmt bei `S.aiCoach` nicht

Der Brief führt `S.aiCoach` als *„Firestore, whitelisted"* und erwartet in
Zeile 48, die Persona käme beim Rückweg auf Konto A *„per Cloud-Sync zurück
(„Nina", „hart")"*.

Im Code ist das nicht so. `S.aiCoach` steht **in keinem** Cloud-Payload:
weder in `_pushToCloud()` (die Feldliste zählt einzeln auf, `aiCoach` fehlt)
noch in `_mergeData()` noch in `_pushSocialProfile()`. Der Kommentar an der
Definition sagt es selbst: *„bewusst geräte-lokal wie `S.privacy`, kein
Cloud-Sync-Feld."*

Ein Rückweg auf Konto A bringt die Persona also **nicht** zurück — Konto A
durchläuft die Einrichtung neu. Das ließe sich nur durch einen **neuen
Firestore-Schreibpfad** (und eine Rules-Änderung) ändern; beides ist im
Auftrag ausdrücklich verboten. Ich habe deshalb den Zustand umgesetzt, den der
Code hergibt, und Zeile 48 in Check 9 auf das reduziert, was tatsächlich
zurückkommt: **das Dossier**. Wenn die Persona den Kontowechsel überleben
soll, ist das eine eigene Task mit eigener Rules-Entscheidung.

### Befund 2 — die Rückfrage beim Abmelden war nach der Trennung nur noch halb wahr

`doSignOut()` fragte: *„Wirklich abmelden? Deine lokalen Daten bleiben
erhalten."* Nach dieser Task stimmt das für Trainings und Übungen, aber nicht
mehr für den Coach. Der Satz nennt jetzt beides und läuft durch `tr()` — vorher
stand er auch für englische Nutzer auf Deutsch da, obwohl ein `I18N_EN`-Eintrag
existierte. Neuer Eintrag in `I18N_EN` ist gesetzt.

### Befund 3 — vier Zustände, die der Auftrag nicht auflistet

`S.coachLog`, `_aicHist`/`gt_aiChat` (beide standen schon vorher in
`_coachHandleAuthUser` und sind jetzt an dieselbe Stelle gewandert),
**`gt_aiQuota`** (der gemerkte Kontingentstand des vorigen Kontos — das
Radialmenü zeigte sonst dessen Restanfragen, bis `/quota` einmal durch ist)
und die **Laufzeitspuren** des Erzählbogens und des Live-Coaches
(`_csSeenEx`, `_csFinalLine`, `_coachState`, `_coachBarState`, …). Ohne die
letzten zählte die Obergrenze des Vorbesitzers im nächsten Training weiter und
die Bilanzzeile seiner letzten Einheit stünde nach dem Wechsel noch auf dem
Bildschirm.

### Befund 4 — `_rpeFlushTrend()` läuft beim Wechsel bewusst NICHT

`_csDiscard()` (der bestehende Weg, den Erzählbogen zu verwerfen) ruft
`_rpeFlushTrend()`, das die Satz-Rückfragen ins **Dossier** schreibt. Beim
Kontowechsel zeigt `_coachUid()` in diesem Moment noch auf das **alte** Konto —
der Schreibvorgang würde das gerade geräumte Dossier neu anlegen und einen
Push planen, den `_coachHandleAuthUser` einen Moment später kappt.
`_coachWipeLocal()` setzt die Felder deshalb selbst und ruft nur
`_rpeClear(false)` (nimmt die Chips vom Bildschirm). Der Preis: die RPE-Antworten
einer beim Abmelden laufenden Einheit gehen verloren — das ist der richtige
Preis, denn die Alternative wäre ein Schreibzugriff über eine Kontogrenze.

---

## 5. Zusatzauftrag — Uhrzeit des Wochenberichts

Umgesetzt, im **Hub** unter „Einstellungen", nicht im Heute-Tab und nicht in der
zugeklappten Feinjustierung (der Blockabschluss verspricht die Uhrzeit
ausdrücklich, ein Versprechen gehört nicht hinter eine Klappe):

- Abschnitt „Wochenbericht" mit Untertitel „Wann dein Coach die Woche
  zusammenfasst. Volle Stunde, Ortszeit."
- Zeile „Tag" mit 7 Chips (`So`…`Sa`, `Su`…`Sa` im Englischen), Zeile „Uhrzeit"
  mit 24 Chips (0–23).
- Darunter der fertige Satz aus **derselben** Quelle, die auch den Termin plant
  (`_crTerminText()` → `S.coachReportAt`).
- Schreibweg: `coachHubSetReportAt(feld, wert)` — bewusst **nicht** über
  `setAiCoachOpt()`, das Feld liegt nicht in `S.aiCoach` und der Umweg kippte
  das Umfangs-Profil auf `'custom'`. Nach dem Schreiben `persist()`,
  `_coachOptRender()` und ein nicht awaited `_cnSync()`, damit der Termin sofort
  gilt statt erst nach dem nächsten App-Start.

Chips statt `<select>`/`<input type="time">`: die App kennt beides nirgends —
ein neues Bedienmuster für eine Zeile wäre teurer als zwei Chip-Reihen, und ein
Zeitfeld verspräche Minuten, die stillschweigend abgeschnitten würden.

---

## 6. Was auf Windows ungeprüft bleibt

1. **Ein echter Firebase-Kontowechsel.** Google-/Apple-Sign-In lässt sich hier
   nicht durchspielen. Geprüft ist der Ablauf **ab** `_coachHandleAuthUser(user)` —
   der einen Stelle, die alle drei Auth-Wege der App passieren
   (`onAuthStateChanged`, Google-nativ, Apple-nativ) — mit einem
   Firebase-Doppel, das Dossier-Dokumente in einer Map hält und jeden
   Schreibzugriff mitschreibt. Ungeprüft bleibt, ob `onAuthStateChanged` in der
   echten WKWebView bei einem Kontowechsel **feuert**; genau deshalb hängt die
   Erkennung seit Task 7 zusätzlich an den beiden nativen Einstiegen.
2. **Der Cloud-Merge.** `_onLogin()` mit echtem Firestore-Dokument, echtem
   `_mergeData()` und echtem `_pushToCloud()` läuft hier nicht. Dass `S.aiCoach`
   und die vier lokalen Coach-Felder in keinem Payload stehen, ist statisch
   geprüft (Check 20 vergleicht die Schreibaufrufe zeichengleich mit `HEAD`),
   nicht gegen einen echten Server.
3. **Die echte Zustellung der Meldungen.** Im Browser gibt es kein
   `@capacitor/local-notifications`. Geprüft ist die **Planungsebene** über ein
   Doppel, das `schedule`/`cancel` mitschreibt und `getPending()` führt: nach dem
   Wechsel steht dort kein 47xxx-Eintrag mehr, `2500` steht noch und `1000` ist
   neu geplant. Ob iOS den `cancel`-Aufruf tatsächlich ausführt, zeigt erst das
   Gerät.
4. **Die Kontolöschung mit echtem `deleteUser()`.** Geprüft ist der Code des
   Aufräumpfads (`_finishAccountWipe`: `ft4` und jeder `gt_`-Schlüssel weg,
   danach `location.reload()`), nicht der Firebase-Aufruf davor. Der Hinweistext
   über den nicht entfernbaren Dossier-Eintrag stimmt weiter — die Datentrennung
   entfernt zusätzlich, sie fügt nichts hinzu.
5. **Der iOS-Simulator** insgesamt: kein Xcode auf diesem Rechner. Beleg ist der
   Chromium-Screenshot `task-22-hub.png`, kein `xcrun simctl`-Bild.
