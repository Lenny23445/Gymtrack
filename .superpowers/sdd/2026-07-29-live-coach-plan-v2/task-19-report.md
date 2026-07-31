# Task 19 — Meldungen planen und ausliefern

Stand: 2026-07-30. Dateien: `index.html`, `sw.js`, `build.js`.
`APP_VERSION`, `CACHE` (sw.js:2) und `CHANGELOG` unangetastet — Ritualschritt nach dieser Task.

---

## 1. Getroffene Anker

| Anker | Stelle vorher | Was dort passiert ist |
| --- | --- | --- |
| Skript-Reihenfolge | `index.html:5707` (`coach-analyze.js`) | `js/coach-notify.js` **danach** eingehängt, mit Kommentar, warum die Reihenfolge bindend ist (fail-closed bei fehlendem `CoachAnalyze`). |
| Kopierliste | `build.js:9` | `'js/coach-notify.js'` ergänzt. `node build.js` kopiert es (verifiziert). |
| Precache | `sw.js` `SHELL` | `'./js/coach-notify.js'` ergänzt. `CACHE` **nicht** angefasst. |
| Zustand | `index.html` nach `if (!S.checkins)` | `S.coachPush = {state, plan, permOk, owns}`, geräte-lokal, mit Normalisierung gegen krumme Stände. |
| Zustellweg | `_cap('LocalNotifications')` (vorher `:9548`, `:9593`, `:17083`, `:17097`, `:17110`) | Muster übernommen: `checkPermissions` → `createChannel('gymtrack-reminders')` → `getPending` → `cancel` → `schedule`. **Kein zweiter Kanal, kein zweiter Zustellweg.** |
| Nummernraum | bestehend 1000–1999 (Erinnerung), 2500 (Pausen-Timer) | `CN_ID_BASE = 47000`, `CN_ID_MAX = 47999`. `_cnIdFor(id)` gibt der Art einen eigenen Hunderterblock und dem Tag den Rest — stabil, kollisionsfrei innerhalb eines Plans. |
| Generische Erinnerung | `scheduleWorkoutNotifications()` | Gate `_cnOwnsReminder()` eingezogen (s. Abschnitt 3). Funktion gibt jetzt das Promise ihres Zweiges zurück; die fünfzehn bestehenden Aufrufstellen ignorieren es wie bisher. |
| Push-Stufe | `setAiCoachOpt()` / `setCoachPreset()` | Vorige Stufe wird gemerkt, danach `_cnLevelChanged(vorher)`. Nicht awaited — der Schalter blockiert nichts. |
| Ende der Einheit | `finishWk()`, direkt nach dem `_csEnd`-Block | `_cnSync({pr})`. Läuft **nach** `persist()`, damit die frische Einheit in `S.sessions` steht. Nur `type:'weight'`-PRs tragen eine echte Kilozahl; ein geschätztes 1RM wäre in „Neuer Bestwert bei {ex}: {kg}" eine Zahl, die so nie auf der Stange lag. |
| App-Start | `// ── BENACHRICHTIGUNGEN INITIALISIEREN` | `setTimeout(_cnSync, 1200)`, in try/catch, ohne `_isNative()`-Gate (`_cnSync` kehrt ohne Plugin selbst zurück). |
| Berechtigung | `_dndToast()` (bestehend) | Hinweistext über `_cm(de,en)`, kein neuer Toast-Weg. |
| Deload | `_ciReadiness()` (bestehend) | `_cnDeloadDue()` liest nur `mode === 'deload'` — **keine zweite Erholungsrechnung.** |
| Wochenschlüssel | `CoachAnalyze.isoWeekKey` | `_cnWeekVol()` und der Deckel nutzen ausschließlich diesen Weg. `getWeekKey()` (Altformat `2026-W5`) bleibt unberührt — statisch geprüft. |

### Schnittstelle wie im Brief

`_cnSync()` (verwirft eigene alte Termine → plant neu → schreibt Zähler fort),
`_cnPermission()` (nur vom Hub), `CN_ID_BASE = 47000`, `_cnIdFor(id)`.
Sechs Zulieferer gegen den echten Code: `_cnNextWorkout()`, `_cnLastWorkoutTs()`,
`_cnReportAt()`, `_cnWeekVol()`, `_cnDeloadDue()`, `_cnAnniversary()`
(plus `_cnPlanExIds()`, das die Plantag-Auflösung des Trainingsstarts spiegelt).

### Zwei Entscheidungen, die der Brief offenließ

1. **Einheit im Satz.** Der Katalog trägt bei `anniversary`, `reminderPlan`
   und `reportReady` die Einheit selbst (`{kg} kg`), bei `prCongrats` nicht.
   `_cnText()` schickt deshalb bei den ersten dreien die blanke Zahl herein und
   nur bei `prCongrats` den formatierten Wert aus `_csWeight()`. Ohne diese
   Unterscheidung stünde dort „62,5 kg kg". **Folge:** in diesen drei Sätzen
   steht bei lbs-Nutzern die kg-Zahl mit kg-Beschriftung — richtig, aber nicht
   in der Einheit des Nutzers. Der Katalog gehört mir in dieser Task nicht;
   die Zusammenführung ist ein Kandidat für Block 5.
2. **Zähler nur für Fälliges.** `planAll()` liefert den Plan, aber nicht den
   fortgeschriebenen Zustand. `_cnSync()` schreibt deshalb **nur** die Termine
   des letzten Plans fort, deren Zeitpunkt verstrichen ist (also zugestellt
   wurde). Was noch aussteht, wird verworfen und neu geplant und darf nicht
   gegen das Budget zählen — sonst verbrauchte jeder App-Start das Tagesbudget
   ein zweites Mal und der Coach verstummte nach dem zweiten Öffnen.
   Beleg: Prüfpunkt 11 (dreimal geplant, identischer Bestand).

---

## 2. Prüfliste — jeder Punkt mit rot/grün-Beleg

Skript: `.superpowers/sdd/2026-07-29-live-coach-plan-v2/task-19-check.js`, Port **8798**.
Chromium über Puppeteer (Windows, kein Xcode). `window.Capacitor` wird über
`page.evaluateOnNewDocument` durch ein Doppel ersetzt, das jeden `schedule`- und
`cancel`-Aufruf mitschreibt und eine Liste anstehender Termine führt
(`_isNative()`/`_cap()` sind top-level `const` der App und von außen nicht
überschreibbar — `window.Capacitor` ist der einzige Hebel).
Die Uhr steht für den ganzen Lauf auf **Mittwoch 10:00 Ortszeit**.
Tipps über echte Zeigerfolgen (`page.click`).

**Rot-Lauf:** `node task-19-check.js --root=<git archive HEAD>` → **0/18 PASS.**
**Grün-Lauf:** `node task-19-check.js` → **18/18 PASS**, keine Seitenfehler.

| # | Prüfpunkt | rot (vorher) | grün (nachher) |
| --- | --- | --- | --- |
| 1 | Registrierung: Tag **nach** coach-analyze, build.js, SHELL, `CACHE` unangetastet, `CoachNotify` geladen, Wochenrechnung löst auf | `tag:-1, build:false, shell:false, CoachNotify undefined` | PASS |
| 2 | `pushLevel:'still'` → **nur** der Wochenbericht | `n:0, kinds:[]` | PASS (`kinds:['report']`) |
| 3 | `'normal'` → Erinnerung mit Inhalt, Titel = Coach-Name, ids 47000–47999 | `kinds:[], ids:[]` | PASS |
| 4 | Tages-/Wochendeckel bei zusammenfallenden Auslösern | `normalHeute:-1, engHeute:-1` | PASS (`normal` genau 1/Tag, `eng` genau 2/Tag, nie über Wochenbudget) |
| 5 | Nachtfenster: 23:30 rutscht auf 08:00 des Folgetages | `nRem:{}` | PASS (`std:8`, alle Termine 07–22 Uhr) |
| 6 | Laufendes Training: `reminderPlan` + `deload` fallen aus, `prCongrats` bleibt | `kinds:[]` | PASS |
| 7 | Deutsch, 4 Töne × 6 Arten: Inhalt, **kein Emoji** (auch nicht im Titel aus dem Coach-Namen `'Max 💪'`), **kein** `/\{[a-z]+\}/i`, keine doppelte Einheit | `leer:['keine Liste']` | PASS (24 Sätze) |
| 8 | Englisch, dasselbe + kein deutscher Rest | `leer:['keine Liste']` | PASS (24 Sätze) |
| 9 | Ohne Premium: keine Meldung im eigenen Nummernraum | `__err:_cnSync is not defined` | PASS (die generische Erinnerung bleibt dem Free-Nutzer) |
| 10 | Zeitzone durchgereicht: `tzOffsetMin === -getTimezoneOffset()` (Tokio 540); mit dem Wert greift der Tagesdeckel, ohne ihn gäbe es zwei UTC-Budgets für einen Ortstag | `__err:… planAll` | PASS (`ctxTz:540`, `mitTz:false`, `ohneTz:true`) |
| 11 | Alte Planungen werden abbestellt statt gehäuft; Pausen-Timer 2500 überlebt | `__err:_cnSync is not defined` | PASS (3× geplant, identischer Bestand, `fremdAbbestellt:[]`) |
| 12 | Coach übernimmt → generische Planung 1000–1999 weg; „Still" → sie kommt zurück | `__err:_cnSync is not defined` | PASS |
| 13 | Berechtigung abgelehnt → Auswahl springt auf „Still", ruhiger Hinweis, **kein** Fehler | `stufe:'normal', gefragt:0, hinweis:''` | PASS (echter `page.click` auf den Chip) |
| 14 | Berechtigung angenommen → gilt sofort, Kanal ist der bestehende `gymtrack-reminders` | `eigene:[], kanal:[]` | PASS |
| 15 | App-Start ruft `_cnSync()` und verschiebt den Rückkehr-Anstoß | `initRuft:false` | PASS (Termin = jetzt + 5 Tage, `{days}` = 35 = Tage seit der letzten Einheit **zum Zeitpunkt der Meldung**) |
| 16 | `finishWk()` plant die Gratulation zum frischen Bestwert | `pr:null` | PASS (Übungsname + Kilozahl, kein Emoji, kein Platzhalter) |
| 17 | Statisch: `persist()` statt `save`, kein `fetch`/`AI_WORKER_URL`, ISO-Woche nur über `CoachAnalyze.isoWeekKey`, kein `getWeekKey`, 39 `catch` | `len:0` | PASS |
| 18 | Statisch: kein Emoji im Block, **keine** fremde Notification-id in 47000–47999, `S.coachPush` **nicht** im Cloud-Payload | `len:0` | PASS |

### Nachgefahrene Suiten

| Suite | Ergebnis |
| --- | --- |
| `node --test test/*.js` | **462/462** (Ausgangsstand gehalten, keine neuen Node-Tests) |
| `block3-fix-check.js` | 21/21 |
| `task-17-check.js` | 23/23 |
| `task-10-check.js` | 41/41 |
| `task-9-check.js` | 20/20 |
| `lang-check.js` | 4/4 |
| `task-19-check.js` | 18/18 |

`task-10-check.js` schlug einmal an: sein `save(`-Riegel spannt einen sehr weiten
Block und traf die **Prosa** meines Kopfkommentars („persist() — save() existiert
nicht"), nicht Code. Statt einen fremden Riegel aufzuweichen ist der Kommentar
umformuliert („ein save-Aufruf existiert in dieser App nicht"). Danach 41/41.

---

## 3. Entscheidung zur bestehenden `sw.js`-Meldung (`sw.js:52`)

**`sw.js` bleibt inhaltlich unverändert** (nur `SHELL` bekam das neue Modul).
Begründung:

- `showNotification('Zeit fürs Training', …)` im Service Worker ist der **Web-PWA-Pfad**
  (`_scheduleWebNotifications()` → `postMessage('SCHEDULE_WORKOUT_NOTIFS')`).
- Der Coach stellt ausschließlich über `@capacitor/local-notifications` zu.
  Im Browser gibt es das Plugin nicht, `_cnSync()` kehrt dort sofort zurück.
- **Es kann also gar nicht kollidieren:** auf dem Web meldet der Coach nie, im
  Native-Fall läuft `sw.js` nicht. Zwei Systeme für dieselbe Meldung entstehen
  hier nicht.

Kollidieren konnte dagegen die **native** generische Erinnerung (ids 1000–1999,
wöchentlich wiederkehrend, „Zeit fürs Training!"). Sie liefe am selben Termin
neben „Heute steht Bankdrücken an: 3 Sätze zu 8 bei 62,5 kg". Gelöst so:

> `scheduleWorkoutNotifications()` prüft `_cnOwnsReminder()`. Übernommen ist die
> Erinnerung **nur**, wenn `_cnSync()` tatsächlich einen `reminderPlan`-Termin
> geplant hat (`S.coachPush.owns`). Dann werden 1000–1999 abgeräumt. Sonst
> bleibt die alte Planung genau wie bisher.

**Bewusst bedingt statt pauschal**, weil eine pauschale Entfernung Free-Nutzer,
Nutzer auf `pushLevel:'still'`, ohne Berechtigung und ohne konkreten Plan ohne
jede Erinnerung zurückgelassen hätte.

**Preis dieser Entscheidung, offen benannt:** die generische Erinnerung war
*wöchentlich wiederkehrend*, die Coach-Erinnerung ist ein *einzelner* Termin für
den nächsten Plantag. Ein Premium-Nutzer, der die App eine Woche nicht öffnet
und einen Trainingstag ausfallen lässt, bekommt für den übernächsten Plantag
keine Erinnerung mehr — dafür nach fünf Tagen den `returnNudge`. Das ist die
Absicht von Block 4 (ein Anstoß statt wöchentlicher Wiederholung), aber es ist
eine Verhaltensänderung und gehört auf die Geräteliste unten.

---

## 4. Was ungeprüft bleibt und am Gerät nachgeholt werden muss

Der Browser hat kein `LocalNotifications`-Plugin. Geprüft ist die **Planungs-**
ebene gegen ein mitschreibendes Doppel; die **Zustellung** selbst nicht. Am
iPhone (macOS, Xcode) nachzuholen:

1. **Echte Zustellung und Titel.** Einen Termin auf `Date.now()+15000` vorziehen,
   App in den Hintergrund, 15 s warten: Mitteilung auf dem Sperrbildschirm, Titel
   = Coach-Name, Text mit konkretem Inhalt. Fängt: Zustellung/Titel kaputt.
2. **Der echte Systemdialog.** `_cnPermission()` ist gegen ein Doppel geprüft.
   Der iOS-Berechtigungsdialog erscheint genau einmal pro Installation; ob er an
   der richtigen Stelle kommt (Wechsel weg von „Still", **nicht** beim ersten
   Start), zeigt erst das Gerät.
3. **`LN.getPending()` im echten Plugin.** Gegen das Doppel liefert es die
   geplanten Termine zurück. Ob iOS für `schedule.at`-Termine dieselbe Liste
   führt und ob die ids nach App-Neustart erhalten bleiben (Brief-Testfall
   „keine Dubletten"), ist plugin-nah und hier nicht belegbar.
4. **Pausen-Timer neben `_cnSync()`.** Im Doppel überlebt id 2500 nachweislich.
   Am Gerät noch einmal echt: Pause starten, `_cnSync()` auslösen, Pausen-Ton
   muss kommen.
5. **Android-Kanal.** `createChannel({id:'gymtrack-reminders', importance:4})`
   wird auf iOS ignoriert. Ob der Kanal auf Android greift (Banner + Ton), ist
   ungeprüft — die App wird derzeit nur für iOS gebaut.
6. **`allowWhileIdle`.** Wirkung nur auf echten Geräten sichtbar.
7. **Verhaltensänderung aus Abschnitt 3.** Am Gerät prüfen, ob die einzelne
   Coach-Erinnerung plus `returnNudge` sich im Alltag richtig anfühlt, oder ob
   Block 5 die Erinnerung auf mehrere Plantage ausdehnen sollte.
8. **Zeitumstellung.** Der Versatz wird zum Planungszeitpunkt eingesetzt und gilt
   für den ganzen Plan (Moduldesign). Über eine Umstellung hinweg liegt eine
   Meldung höchstens eine Stunde daneben; am Rand des Nachtfensters am Gerät
   nachsehen.

---

# Nachtrag: Behebung der Review-Befunde an Task 19

Ausgangsstand vor dieser Welle: `node --test test/*.js` **517/517**,
`task-19-check.js` **18/18** — der Prüfstand war grün und trug trotzdem jeden der
hier behobenen Befunde. Genau das ist der Befund hinter den Befunden: der
Bootzustand des Skripts deckte nur den Gutfall ab.

Reihenfolge durchgehend: **erst der Check, der den Befund rot zeigt, dann der
Fix.** Der Rot-Lauf mit allen neuen Prüfungen gegen den unveränderten Code endete
bei **20/27**; die sieben roten sind unten je Befund mit ihrem `got:` benannt.
Endstand **27/27**.

## Critical 1 — der Schalter „Trainings-Erinnerungen" wirkt jetzt auf den Coach

**Entscheidung: an `S.notifEnabled` hängt genau eine Art — `reminderPlan`.**

Begründung, in beide Richtungen:

* *Warum die Trainings-Erinnerung daran hängen muss.* Der Schalter heißt
  „Trainings-Erinnerungen" und sein Untertitel verspricht genau eine Sache
  („Erinnert dich an geplante Trainings"). „Trainingstag: Bankdrücken, 3 Sätze,
  8 Wiederholungen, 72,5 kg." **ist** diese Erinnerung, nur inhaltlich — und sie
  wird sogar zu der Uhrzeit zugestellt, die der Nutzer in derselben Zeile gewählt
  hat (`S.notifTime`). Sie mit anderem Absender zurückzugeben ist genau der
  Vertrauensbruch, der zur dauerhaften Stummschaltung führt.
* *Warum die übrigen fünf NICHT daran hängen.* Rückkehr-Anstoß,
  Jahresrückblick, Deload-Rat, PR-Gratulation und Wochenbericht sind keine
  „Erinnerung an geplante Trainings". Sie gehören den Push-Chips im Hub („Wie oft
  der Coach dich außerhalb der App anspricht"), und dort steht mit „Still" der
  Schalter, der wirklich alles abstellt. Sie unter einen Schalter mit fremdem
  Namen zu ziehen hieße: ein zweiter, falsch beschrifteter Hauptschalter — und
  er nähme dem Nutzer den Wochenbericht, das eine Versprechen, das laut
  `UNCAPPED` sogar auf „Still" gilt.

**Änderung** (`index.html`, `_cnSyncRun`): `nextWorkout: S.notifEnabled ?
_cnNextWorkout(now) : null`. Ohne Kandidat steht kein `reminderPlan` im Plan,
`owns` bleibt false, die generische Erinnerung behält ihren Platz — und nutzt ihn
wegen `!S.notifEnabled` ebenfalls nicht. Es meldet sich also niemand.

**Check** (neu, Nr. 17): `S.notifEnabled = false`, Stufe „Normal".
Rot vorher: `{"kinds":["deload","reminderPlan","returnNudge","report"],"owns":true}`.
Grün nachher: kein `reminderPlan`, `owns=false`, `_cnOwnsReminder()=false`, keine
generische Erinnerung, Pausen-Timer (2500) unberührt — `report` und `returnNudge`
stehen weiter im Plan (der Beleg für die zweite Hälfte der Entscheidung).

**Folge, bewusst in Kauf genommen:** `S.notifEnabled` ist per Default `false`
(`index.html:9060`). Ein frischer Premium-Nutzer bekommt die inhaltliche
Trainings-Erinnerung also erst, wenn er den Schalter einschaltet. „Nie
eingeschaltet" und „bewusst abbestellt" sind derselbe gespeicherte Zustand; eine
Unterscheidung zu erfinden wäre genau der Trick, gegen den der Befund
geschrieben ist.

## Critical 2 — Weg zur Berechtigung: die Coach-Einstellungen im Hub

**Entscheidung: der Dialog wird im Coach-Hub angeboten, Reiter „Einstellungen",
als erste Zeile — und weiterhin NICHT beim App-Start.**

iOS zeigt den Systemdialog einmal pro Installation; eine Ablehnung beim Start
wäre dauerhaft und unumkehrbar. Der Hub ist die Fläche, auf der der Nutzer weiß,
wofür er sie erteilt. Die Zeile steht bewusst **oben** und nicht in der
zugeklappten „Feinjustierung" bei den Push-Chips: sie ist kein Feinschliff,
sondern die Bedingung dafür, dass diese Chips überhaupt etwas bewirken. Sie
verschwindet, sobald die Berechtigung steht.

**Änderungen:**
* `_cnNeedsPerm()` — nativ + Premium + Stufe ≠ „Still" + `S.coachPush.permOk !== true`.
  Gelesen wird der gemerkte Stand, nicht `checkPermissions()`: die Oberfläche
  rendert synchron, `_cnSync()` schreibt `permOk` bei jedem Lauf fort.
* `coachHubAskPerm()` — `_cnPermission()`, bei Erfolg sofort `_cnSync()`, bei
  Ablehnung derselbe ruhige Hinweis wie beim Stufenwechsel (`_dndToast`), **kein**
  Fehler und **keine** Änderung der Push-Stufe (der Nutzer hat sie nicht angefasst).
* `_chSettingsHTML()` — Zeile in bestehender `.ch-preset`-Optik, DE/EN:
  „Mitteilungen erlauben" / „Allow notifications".

**Check** (neu, Nr. 18): Premium, `pushLevel:'normal'`, Berechtigung `prompt`,
Push-Chips nie angefasst. Der Berechtigungsstand steht dafür schon beim ERSTEN
Skript (über `localStorage`), sonst wäre der App-Start längst gelaufen.
Rot vorher: `ctaDa:false`, `nachCta:{reqs:0,permOk:false,eigene:0}` — es gab
keinen Weg.
Grün nachher: App-Start `reqs:0` (fragt nicht), Zeile vorhanden, ein echter
Zeigerklick → `reqs:1`, `permOk:true`, Termine geplant, Zeile weg.

## I1 — ohne Premium wird der einmalige Dialog nicht verbrannt

`_cnPermission()` gibt ohne Premium `false` zurück, **ohne** zu fragen — der
Riegel steht in der Funktion selbst, damit ihn keine spätere Fläche umgeht.
`_cnLevelChanged()` prüft Premium, bevor es den Zweig überhaupt betritt: die
gewählte Stufe bleibt dann stehen statt auf „Still" zurückzuspringen. Sie ist
eine Voreinstellung für den Tag, an dem das Abo da ist; ein Rücksprung wäre eine
Fehlermeldung für einen Fehler, den niemand gemacht hat, und `_cnSync()` schweigt
ohne Premium ohnehin.

**Check** (neu, Nr. 19): Gratis-Nutzer, „Still" → „Normal" über den echten
`setAiCoachOpt`-Pfad. Rot vorher: `{"reqs":1,"stufe":"still","perm":"denied"}` —
der Dialog kam und die Berechtigung war verbrannt.
Grün nachher: `{"reqs":0,"stufe":"normal","eigene":0,"perm":"prompt"}`.

## I2 — Modulausfall ist jetzt fail-closed

Der Ausstieg `if (!window.CoachNotify) return;` stand **vor** dem Zurücksetzen
von `owns`. Jetzt steht der gemeinsame Ausstieg für „Modul fehlt oder kein
Zustellweg" ganz oben und gibt die Erinnerung zurück: `plan=[]`, `owns=false`,
`persist()`, eigene Waisen über `_cnCancelOwn()` abbestellt (das braucht das
Modul nicht — es filtert auf 47000–47999), dann `scheduleWorkoutNotifications()`.

**Check** (neu, Nr. 20): erst ein normaler Lauf (owns=true, generische weg), dann
`delete window.CoachNotify` und erneut synchronisieren.
Rot vorher: `nachher:{"owns":true,"ownsRe":true,"eigene":4,"generisch":0}` — kein
Coach-Termin, keine generische Erinnerung, keine Fehlermeldung.
Grün nachher: `owns=false`, keine Waisen, generische Erinnerung zurück,
Pausen-Timer unberührt.

## I3 — die Einheit hängt am Wert, nicht am Satz

`_CN_UNIT_IM_SATZ` ist **entfallen**; `_cnText()` schickt `kg` und `vol` immer
durch `_csWeight()`. Dafür wurden die drei Satzgruppen im Katalog
(`js/coach-persona.js`, DE **und** EN, alle vier Töne) einheitenrein gemacht —
`anniversary`, `reminderPlan`, `reportReady`, inklusive der „Kilo"/„kilos" im
harten Ton. Das ist dieselbe Bewegung, die Block 3 für den Erzählbogen schon
gemacht hat; der Befund verlangt ausdrücklich, hier nachzuziehen.
Der tote Zweig in `_cnText` verschwindet damit von selbst (Minor 3).

`test/coach-persona.test.js`: `WERT_KEYS` um die drei Schlüssel erweitert — die
beiden bestehenden Einheiten-Tests decken sie jetzt mit ab (kein neuer Test,
Testzahl bleibt 517).

**Check** (neu, Nr. 21): `S.unitMode='lbs'`, sechs Arten × vier Töne.
Rot vorher: sechs Sätze mit „kg" neben einer Gratulation in „lbs".
Grün nachher: kein `kg|Kilo|kilos`, jede Art mit Gewicht trägt `lbs`.

## I4 — überlappende Läufe serialisiert

`_cnSync(opts)` ist jetzt der Einreiher, `_cnSyncRun(opts)` der Lauf. Eine Kette,
kein Verwerfen: jeder Aufruf trägt eigene Angaben (der frische Bestwert aus
`finishWk`), die ein übersprungener Lauf verlöre. Der Rückgabewert bleibt ein
Promise, die drei ungeawaiteten Aufhänger bleiben unverändert.

**Check** (neu, Nr. 22): drei überlappende Läufe, einer davon mit `pr`.
Invariante: der Bestand im eigenen Nummernraum deckt sich **exakt** mit
`S.coachPush.plan`, keine Dublette, `owns` beschreibt den Bestand.
Rot vorher: `bestandIds` enthielt `47195,47195,47210,47210,47210,…`, `planIds`
nur vier Einträge, `dubletten:true`.
Grün nachher: deckungsgleich, keine Dublette.

## Die vier überlebenden Mutationen

Jede wurde nach dem Fix **erneut gefahren** — gegen einen Kopie-Baum
(`node task-19-check.js --root=<mutant>`), damit der Arbeitsstand unangetastet
bleibt. Alle vier sterben jetzt:

| Mutation | Stirbt an | Ergebnis mutiert |
| --- | --- | --- |
| 1 — `record()` ohne Zeitzone | neuer Check 23 | 26/27 |
| 2 — Deckel-Prüfung mit frischem Zustand | neuer Check 24 | 26/27 |
| 3 — `_cnCancelOwn` deaktiviert | Checks 11, 22, 25 | 24/27 |
| 4 — Fortschreiben zugestellter Termine entfernt | Checks 23 und 24 | 25/27 |

* **Check 23 (Mutation 1).** Zeitzone Tokio, ein Termin um **08:00 Ortszeit**
  gilt als zugestellt — UTC-seitig ist das der Vortag, 23:00. Geprüft wird der
  Tagesschlüssel, den `record()` an der **Übergabestelle der zugestellten
  Termine** schreibt (Check 10 belegte nur `planAll`). Ohne Zeitzone trifft er
  den UTC-Vortag, die Schlüssel begegnen sich nie und der Nutzer bekommt das
  doppelte Tagesbudget.
* **Check 24 (Mutationen 2 und 4).** Erst planen, dann den heutigen Termin auf
  „zugestellt" setzen, dann **erneut** planen. Danach steht für heute nichts mehr
  im Plan und `dayCount === 1` unter dem richtigen Tagesschlüssel. Kein
  bestehender Check plante zweimal nach einer Zustellung — beide Mutationen ließen
  das Budget bei jedem App-Öffnen von vorn beginnen.
* **Check 25 (Mutation 3).** Dafür musste das **Doppel** umgebaut werden:
  `schedule()` **hängt an**, statt zu ersetzen. Vorher modellierte es einen Upsert
  (`filter(x=>x.id!==n.id); push(n)`) und hatte damit das Abbestellen
  mitmodelliert — ein fehlender `cancel` blieb unsichtbar. Jetzt schlägt er als
  Dublette im Bestand durch. Check 25 prüft zusätzlich explizit den Bestand nach
  dem Wechsel auf „Still": im eigenen Nummernraum steht **nur** noch der
  Wochenbericht, keine Waisen der vorigen Planung.

## Die zwei stumpfen Checks

* **Check 1** verglich `sw.js` desselben Baums mit sich selbst. Der
  Vergleichswert kommt jetzt aus **git HEAD** (`git show HEAD:sw.js`,
  `git show HEAD:index.html`) und deckt `CACHE`, `APP_VERSION` **und** die
  `CHANGELOG`-Schlüssel ab — die drei Dinge, die der Ritualschritt nach dieser
  Task anfasst und diese Welle nicht. Dazu ein Riegel gegen die nächste
  Tautologie: der Check verlangt, dass sich `index.html` gegenüber HEAD
  überhaupt unterscheidet (zeilenendenormalisiert), sonst vergliche er wieder
  zwei identische Stände. Fällt git aus, fällt die Prüfung durch, statt sich
  selbst zu bestätigen.
* **Check 16** prüfte am Ende von `finishWk()` nur `prCongrats`. Er verlangt
  jetzt alle drei Dinge aus dem Brief — Gratulation, **neue Trainings-Erinnerung**
  und **Deload-Prüfung** — und zählt zusätzlich die `detectPRs()`-Aufrufe.
  Rot vorher: `detect:2`.

## Minor

1. **`detectPRs` lief zweimal** (`:17814`/`:17826`). `_csPrs` ist eine Ebene
   hochgezogen und wird unten weiterbenutzt; der zweite Scan bleibt nur als
   Rückfall stehen, falls der Block darüber gestorben ist — dann ist er kein
   Doppel, sondern der erste. Belegt durch `detect === 1` in Check 16.
2. **Kanal-Importance uneinheitlich** (4 gegen 5). Alle vier Aufrufstellen gehen
   jetzt durch `_cnChannel()` mit `CN_CHANNEL_IMPORTANCE = 5` — dem Wert, den die
   bestehende Trainings-Erinnerung ausweislich ihres Kommentars immer wollte
   („hohe Wichtigkeit für Banner & Ton"). Android friert die Wichtigkeit beim
   ersten `createChannel` ein; vorher entschied die Reihenfolge des ersten
   Aufrufs über Banner und Ton.
3. **Toter Zweig in `_cnText`** — mit `_CN_UNIT_IM_SATZ` entfallen.

## Rahmen eingehalten

Kein zweiter Zustellweg (weiter `_cap('LocalNotifications')`, Kanal
`gymtrack-reminders`); `S.coachPush` rein lokal, kein Firestore,
`firestore.rules` unberührt; keine Emojis; kein Platzhalterrest in vier Tönen und
zwei Sprachen (Checks 7/8); `persist()` statt `save()`; jeder Einstiegspunkt in
try/catch (Check 26 zählt sie); ohne Premium schweigt der Coach (Check 9); jeder
neue Text mit englischem Gegenpart; Wochenschlüssel nur über
`CoachAnalyze.isoWeekKey`; **`APP_VERSION`, `CACHE` und `CHANGELOG` unangetastet**
— und das prüft Check 1 jetzt gegen git HEAD statt gegen sich selbst.

## Zahlen

| Suite | vorher | nachher |
| --- | --- | --- |
| `node --test test/*.js` | 517/517 | **517/517** |
| `task-19-check.js` | 20/27 (mit den neuen Prüfungen) | **27/27** |
| `task-17-check.js` | 23/23 | **23/23** |
| `block3-fix-check.js` | 21/21 | **21/21** |
| `task-10-check.js` | 41/41 | **41/41** |
| `task-9-check.js` | 20/20 | **20/20** |
| `lang-check.js` | 4/4 | **4/4** |

## Offen

1. **Die Trainings-Erinnerung ist jetzt an einen Schalter gebunden, der per
   Default aus ist.** Das ist die richtige Wirkung des Schalters, macht aber die
   Vorzeigefunktion von Block 4 für einen frischen Nutzer unsichtbar, bis er ihn
   einschaltet. Ob die Einrichtung (Task 10) oder der Hub den Schalter aktiv
   anbieten soll, ist eine Produktentscheidung — hier bewusst nicht getroffen.
2. **Die Berechtigungszeile im Hub erreicht nur, wer den Reiter
   „Einstellungen" öffnet.** Für Nutzer, die im Chat bleiben, bleibt der Coach
   stumm. Eine zweite Fläche wäre gegen Gestaltungsregel 1 — aber die
   Coach-Einrichtung nach dem Abo-Abschluss wäre der zweite natürliche Moment.
3. **Alles Plugin-Nahe bleibt ungeprüft.** Chromium hat kein
   `@capacitor/local-notifications`: echte Zustellung, Sperrbildschirm,
   `allowWhileIdle` und die Android-Kanalwirkung sind weiter nur am Gerät zu
   sehen. Die Umstellung auf `importance:5` fällt genau in diese Lücke.
4. **Die Serialisierung ist prozesslokal.** Zwei Läufe in derselben Seite sind
   gedeckt; ein Kaltstart, der eine noch laufende `LN.schedule()` einer
   vorherigen Sitzung überholt, ist es nicht — dagegen steht weiter nur die
   stabile id.

---

# Nachtrag: die Erinnerung wandert in die Coach-Einrichtung (Blockabschluss 4)

Punkt 1 und 2 unter „Offen" sind damit erledigt — als Produktentscheidung des
Nutzers, nicht als stille Korrektur.

## Wo die Erinnerung jetzt sitzt — und warum dort

Die Einrichtung (`ov-coach-setup`) hat einen **dritten Schritt** bekommen:
`_csStep3HTML()`, `_CS_STEPS = 3`. Reihenfolge: Name+Ton → Umfang →
**Trainings-Erinnerung**.

Warum ein eigener Schritt und keine Zeile im Umfang-Schritt:

1. **Der Umfang-Schritt ist eine Einfachauswahl.** Drei `.ch-preset`-Karten,
   genau eine trägt die Markierung. Eine vierte Fläche mit anderer Semantik
   („zusätzlich noch das hier") in dieselbe Liste zu legen, macht aus einer
   klaren Wahl eine Mischform — dieselbe Verwechslung, die den Hub schon einmal
   `preset:'custom'` einhandelte.
2. **Der Systemdialog braucht seinen eigenen Moment.** iOS zeigt ihn **einmal
   pro Installation**, eine Ablehnung ist dauerhaft. Er darf nicht als
   Nebenwirkung eines Tipps erscheinen, dessen Hauptaussage etwas anderes war.
   Als letzter Schritt erscheint er direkt nach dem Ja, nicht drei Bildschirme
   später — der Nutzer sieht Frage und Systemdialog im selben Atemzug.
3. **Platz.** Der Umfang-Schritt misst 554 px Inhalt bei 844 px Viewport. Zwei
   weitere Karten plus Erklärsatz hätten ihn über die Sichthöhe gehoben und
   genau die Messung wieder an die Kante gebracht, die schon einmal ein Critical
   war. Als eigener Schritt bleibt jeder Bildschirm unter der Sichthöhe.

Der Schritt fragt **aktiv** und belegt die **zurückhaltende** Karte vor:

- `Nicht erinnern` — markiert, solange `S.notifEnabled !== true`
- `Ja, erinnere mich` — mit dem Hinweis, dass das Gerät **einmal** um Erlaubnis
  fragt

„Fertig" ohne einen einzigen Tipp schaltet nichts ein. Der Systemdialog kommt
ausschließlich nach einem bewussten Ja.

Zustimmung läuft über `coachSetupReminder(true)`:
`_cnPermission()` (der bestehende Weg, mit dem Premium-Riegel **im** Modul, nicht
an der Aufrufstelle) → bei `true`: `S.notifEnabled = true`, `persist()`,
`updateNotifUI()`, `renderCoachSetup()`, `_cnSync()`. Kein zweiter Zustellweg,
kein zweiter Firestore-Pfad, `S.coachPush` bleibt lokal.

Die Zeile „Mitteilungen erlauben" im Coach-Hub bleibt unverändert stehen: sie ist
der Nachhol-Weg für Bestandsnutzer, die die Einrichtung nie gesehen haben.

## Wie der Ablehnungsfall aussieht

Kein Fehler, keine rote Fläche, kein Abbruch:

1. `_cnPermission()` liefert `false` (Nutzer hat den Systemdialog abgelehnt —
   oder es fehlt Premium, dann wurde der Dialog gar nicht erst gezeigt).
2. Ruhiger Hinweis über das bestehende `_dndToast()`:
   „Ohne Mitteilungen meldet sich dein Coach nur in der App." /
   „Without notifications your coach only speaks inside the app." — derselbe
   Wortlaut wie in `_cnLevelChanged()` und `coachHubAskPerm()`.
3. `_csReminderOff()` als Rücksprung: `toggleNotif(false)` (der **bestehende**
   Schalterweg, der auch schon geplante Termine 1000–1999 abräumt statt sie
   verwaist stehen zu lassen), dann `renderCoachSetup()` und `_cnSync()`.
4. Die Markierung springt sichtbar auf „Nicht erinnern" zurück, der Schritt
   bleibt offen, „Fertig" führt normal weiter in den Hub. `S.notifEnabled` ist
   `false` — im Zustand **und** auf der Platte.

Ohne Premium wird der einmalige Systemdialog **nicht verbrannt**:
`requestPermissions()` bleibt bei 0 Aufrufen, weil der Riegel in
`_cnPermission()` vor dem Plugin-Zugriff steht.

## Die zwei Viewport-Messungen im Wortlaut

Gemessen ohne vorheriges Scrollen (`sheet.scrollTop === 0`), nach abgewarteter
Einblendung (`animation:up .28s`), Trefferpunkt per `elementFromPoint` belegt:

```
Messung der primaeren Aktion (ohne Scrollen):
  390x844:
    Schritt 1: "Weiter" Inhalt 812 px / Sicht 775 px / Aktion 776-830 px / Leiste endet 830 px / bei 844 px Viewport, scrollTop 0, ganz im Bild: true, tippbar: true
    Schritt 2: "Weiter" Inhalt 554 px / Sicht 554 px / Aktion 776-830 px / Leiste endet 830 px / bei 844 px Viewport, scrollTop 0, ganz im Bild: true, tippbar: true
    Schritt 3: "Fertig" Inhalt 467 px / Sicht 467 px / Aktion 776-830 px / Leiste endet 830 px / bei 844 px Viewport, scrollTop 0, ganz im Bild: true, tippbar: true
  375x667:
    Schritt 1: "Weiter" Inhalt 831 px / Sicht 613 px / Aktion 599-653 px / Leiste endet 653 px / bei 667 px Viewport, scrollTop 0, ganz im Bild: true, tippbar: true
    Schritt 2: "Weiter" Inhalt 572 px / Sicht 572 px / Aktion 599-653 px / Leiste endet 653 px / bei 667 px Viewport, scrollTop 0, ganz im Bild: true, tippbar: true
    Schritt 3: "Fertig" Inhalt 467 px / Sicht 467 px / Aktion 599-653 px / Leiste endet 653 px / bei 667 px Viewport, scrollTop 0, ganz im Bild: true, tippbar: true
```

Der neue Schritt 3 ist mit 467 px Inhalt der **kürzeste** der drei — er entlastet
die Einrichtung, statt sie zu belasten. Die klebende Fußleiste `#cst-nav` liegt
weiterhin außerhalb `#cst-body`; der Check belegt das pro Schritt mit
`navAusserhalbBody`.

## Erst der rote Check, dann der Fix

`task-10-check.js` von 41 auf **46** Prüfungen erweitert. Rot-Lauf gegen den
Stand **vor** der Änderung: **34/46**, davon rot unter anderem

- „Schritt 3 bietet die Trainings-Erinnerung an …"
- „Zustimmung in der Einrichtung: `S.notifEnabled` … Berechtigung GENAU EINMAL …"
- „Ablehnung in der Einrichtung: … ruhiger Hinweis über `_dndToast` statt Fehler …"
- „Ohne Premium löst die Einrichtung den Systemdialog NICHT aus …"
- „Primaere Aktion ALLER DREI Schritte …" (beide Viewports)

Die drei Berechtigungsprüfungen laufen auf einer **eigenen Seite mit einem
Capacitor-Doppel** (`LN_STUB`): ohne Plugin fiele `_cnPermission()` in den
Web-Zweig und die einzige Größe, auf die es hier ankommt — **wie oft** der
Systemdialog kommt — wäre gar nicht messbar.

## Testzahlen

| Suite | vorher | nachher |
| --- | --- | --- |
| `node --test test/*.js` | 517/517 | **517/517** |
| `task-19-check.js` | 26/27 (Ritual-Wächter, s. u.) | **27/27** |
| `task-17-check.js` | 23/23 | **23/23** |
| `block3-fix-check.js` | 21/21 | **21/21** |
| `task-10-check.js` | 34/46 (mit den neuen Prüfungen) | **46/46** |
| `task-9-check.js` | 20/20 | **20/20** |
| `lang-check.js` | 4/4 | **4/4** |

## Blockabschluss 4 (Versions-Bump, Changelog, Beleg)

- `APP_VERSION` (index.html) und `CACHE` (sw.js) tragen beide
  **`gymtrack-v202607300004`**. Beide Stellen zusammen, sonst laeuft ein
  frisches `index.html` gegen einen alten Cache.
- Changelog-Eintrag `cl-2026-07-29-coach-meldet-sich` steht als **erstes**
  Element in `CHANGELOG`, englische Gegenparts in `I18N_EN`. Der Schluessel
  folgt bewusst nicht dem Muster `gymtrack-v\d+` (den ueberschriebe das
  Deploy-Skript). Bestehende Eintraege inklusive ihrer Emojis unangetastet.
- Beleg: `abnahme-6-erinnerung.png` (390x844, Coach-Name „Nina", Premium
  erzwungen, Einblendung `animation:up .28s` abgewartet) — Schritt 3 von 3,
  dritter Punkt aktiv, „Nicht erinnern" markiert, `S.notifEnabled === false`,
  „Fertig" vollstaendig im Bild. Erzeugt von `abnahme-6-shot.js`.

### Ein Waechter musste weichen — bewusst, nicht nebenbei

`task-19-check.js` verglich `APP_VERSION`, `CACHE` und die CHANGELOG-Schluessel
gegen **git HEAD** und verlangte zusaetzlich den Nachweis, dass ueberhaupt zwei
verschiedene Staende verglichen werden (`idxGeaendert`). Das war der richtige
Waechter, solange die Task-19-Welle lief („diese Welle fasst den Bump nicht an").

Mit dem ausgefuehrten Bump ist er nicht mehr erfuellbar: nach dem Bump-Commit
ist der Arbeitsbaum wieder gleich HEAD, `idxGeaendert` faellt auf `false`, und
die Pruefung waere **dauerhaft rot** — aus einem Grund, der mit Task 19 nichts zu
tun hat. Auf dem sauberen Stand vor dieser Welle stand die Suite deshalb schon
bei 26/27.

An seiner Stelle steht jetzt die dauerhafte Invariante, die den teuersten Fehler
des Rituals faengt: `APP_VERSION === CACHE`, der neueste Changelog-Eintrag steht
vorn, und kein Schluessel folgt dem verbotenen Muster `gymtrack-v\d+`.

### Alle Suiten nach dem Bump

| Suite | Ergebnis |
| --- | --- |
| `node --test test/*.js` | **517/517** |
| `task-19-check.js` | **27/27** |
| `task-17-check.js` | **23/23** |
| `block3-fix-check.js` | **21/21** |
| `task-10-check.js` | **46/46** |
| `task-9-check.js` | **20/20** |
| `lang-check.js` | **4/4** |
