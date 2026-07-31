# Block 5 — Abschluss-Review: Behebungen und Persona-Synchronisierung

Stand: 2026-07-31 · Zweig `main` · nur `index.html` und die Prüfskripte unter
`.superpowers/sdd/2026-07-29-live-coach-plan-v2/`.
`APP_VERSION`, `CACHE` in `sw.js` und der `CHANGELOG` sind unangetastet (eigener
Ritualschritt). `firestore.rules` ist unangetastet — `aiCoach` stand dort bereits
in der `hasOnly`-Liste.

## Der neue Prüflauf

`block5-fix-check.js` (Port 8802), 28 Prüfungen, gebaut wie die übrigen Suiten:
statischer Node-Server, Chromium über Puppeteer, LocalNotifications- und
Firebase-Doppel. Neu gegenüber `task-22-check.js`:

* **`window.__lat`** — jede Runde des LocalNotifications-Doppels wartet erst.
  Ohne eine simulierte Brücken-Latenz ist ein Kontowechsel *mitten* in
  `_cnSyncRun` gar nicht messbar; die Zusicherung aus C1 ist zeit-, nicht
  mutationsabhängig. Die Review hat 400 ms benutzt, der Check ebenfalls.
* **`window.__cnFailPending` / `__cnFailCancel`** — `getPending()` bzw.
  `cancel()` werfen auf Kommando. Daran hängt Wichtig 2.
* Das Firebase-Doppel hält jetzt auch die **Nutzer-Dokumente** (`users/<uid>`),
  nicht nur die Dossier-Subcollection. Erst damit ist die Persona-Erweiterung
  überhaupt prüfbar: pushen, abmelden, wieder anmelden, Konto wechseln.
* `page.emulateTimezone('Europe/Berlin')` — die Donnerstag-12:00-Normalisierung
  in `_crWeekKey` trägt nur in einer Zone ≠ UTC etwas.

Läufe:

| Lauf | Ergebnis |
| --- | --- |
| **Rot** (`--root=` auf den Stand vor der Änderung) | **9/28** |
| **Grün** (Arbeitsstand) | **28/28** |

Die neun roten Treffer sind die vier Mutations-Checks (M1–M4, sie halten
bestehendes, korrektes Verhalten fest — sie *müssen* vorher grün sein), das
zweite C1-Zeitfenster (2200 ms, ebenfalls schon vorher unauffällig), die
C1-Gegenprobe, die Reihenfolge-Gegenprobe der Persona, „kein zweiter
Schreibpfad" und „APP_VERSION unangetastet".

---

## Kritisch 1 — Kontowechsel während eines laufenden `_cnSync()`

### Entscheidung: **beide** Riegel, nicht einer

Der Auftrag ließ die Wahl zwischen „Räumung in dieselbe Serialisierung ziehen"
und „jedem Lauf ein Merkmal des Kontos mitgeben". Beide allein lassen ein Leck:

* **Nur die Kette.** `_coachWipeLocal()` setzt `S.coachPush = null`
  **synchron**. Hängt sich die Räumung hinter den laufenden `_cnSyncRun`, dann
  schreibt der Lauf seine Zeile `S.coachPush = { state: st, … }` trotzdem —
  *bevor* die Räumung drankommt. Konto A's `dayCount`, `weekCount` und
  `sentTs.reminderPlan` stehen danach wieder da, und über `_cnPersist()` auch
  in `ft4`. Die Kette ordnet nur die *Meldungen*, nicht die *Zähler*.
* **Nur das Merkmal.** Fällt der Wechsel in die Runde, in der `LN.schedule()`
  schon unterwegs ist, landet der Termin **nach** dem `cancel()` der Räumung.
  Kein Zustand, aber ein 47xxx-Termin — der Coach des Vorbesitzers auf dem
  Sperrbildschirm des neuen Kontos.

Umgesetzt:

1. **`_cnEnqueue(fn)`** ist aus `_cnSync()` herausgezogen und die einzige Stelle,
   die `_cnLauf` fortschreibt. `_cnSync()` ist jetzt ein Einzeiler darüber, und
   `_coachDropOwnNotifs()` reiht sich in **dieselbe** Kette ein.
2. **`_coachGen`** — ein Zähler, den `_coachWipeLocal()` als allererstes und
   außerhalb von `schritt()` hochzählt (er muss auch dann steigen, wenn gleich
   ein Schritt wirft). `_cnSyncRun()` merkt sich seinen Stand beim Start und
   prüft ihn **unmittelbar vor jedem Schreibzugriff**, ohne `await` dazwischen:
   vor `S.coachPush = {…}`, vor `LN.schedule()` und vor dem Fortschreiben des
   Plans. Die eben geplanten Termine räumt der Drop ab, der über die Kette
   dahinter steht.
   Dazu ein `finally`, das den Ausgang zur Zusicherung macht: *kehrt dieser Lauf
   zurück und hat sich das Konto unterwegs geändert, ist `S.coachPush` leer.*
   Ehrlich gesagt ist das heute **Gürtel und Hosenträger** — hinter dem letzten
   Riegel schreibt der Lauf nichts mehr, und die synchrone Null der Räumung
   gewinnt. Es steht trotzdem da, weil die Zusicherung sonst an der Abwesenheit
   einer Zeile hängt: eine später eingefügte Zeile hinter dem letzten `await`
   wäre das Leck sofort wieder. Nachgewiesen wird der Block **statisch**; eine
   Mutation, die ihn wirkungslos macht, tötet die statische Prüfung
   (27/28), die dynamische erwartungsgemäß nicht.

Der Zähler ist bewusst **konto-weit** benannt und nicht meldungs-eigen: derselbe
Zähler kappt `_crBuildRun()` (siehe Minor 1), dessen Modellaufruf ein genauso
langes Fenster hat. Zwei Zähler wären beim ersten neuen Feld auseinandergelaufen.

**Zusatzbefund während der Arbeit (mit behoben):** `_coachWipeLocal()` ruft
`persist()`, und das setzt einen 800-ms-Debounce für `_pushToCloud()`. Der feuert
beim Kontowechsel womöglich erst, wenn `_fbUser` schon das **neue** Konto trägt —
und schriebe den geräumten Zustand (unter anderem die leere Persona) in dessen
Dokument, bevor `_onLogin()` den Cloud-Stand gelesen hat. Die Räumung ist eine
lokale Trennung; sie bestellt den Anstoß jetzt in Schritt 9b wieder ab. Ohne das
hätte die Persona-Erweiterung genau den Verlust erzeugt, den sie beheben soll.

### Der Check

`C1 — Kontowechsel 120 ms nach _cnSync() (400 ms Brücken-Latenz)` fährt den Fall
der Review nach: `_cnSync()` ohne `await`, 120 ms später `__authTo('uidB')`.

* **Rot:** `S.coachPush = {state:{sentTs:{reminderPlan:…}, dayCount:2,
  weekCount:6}, plan:[report…, returnNudge…]}` — identisch in `ft4`;
  `pending = [1000, 2500, 47298, 47537]`, also genau die beiden 47xxx aus dem
  Befund.
* **Grün:** `S.coachPush === null`, `ft4` ebenso, `pending` ohne 47xxx, der
  Pausen-Timer (2500) unberührt.

Dazu `C1 Gegenprobe` (ohne Wechsel plant derselbe Lauf unverändert durch — der
Riegel darf kein Denial-of-Service gegen die eigene Planung sein) und ein
statischer Check, der **beide** Riegel im Code nachweist.

---

## Wichtig 1 — der Modelltext nennt lbs-Nutzern kg

`_crAskModel()` schickt die Zahlen jetzt durch `kgToDisp()` — dieselbe Grenze wie
in `_coachSnap()` (`:27869`) und `_cnText()`. Die Schlüssel heißen deshalb
**einheitenlos** (`volume`, `prevVolume`, `volumeDelta`, `muscleVolume`, `goal`)
und die Einheit steht **einmal** im Feld `unit`. Ein Schlüssel `volumeKg` mit
einem lbs-Wert wäre die Lüge nur an einer anderen Stelle gewesen. Der Auftrag
sagt dem Modell in beiden Sprachen ausdrücklich, dass die Einheit im Feld `unit`
steht und nichts umgerechnet werden darf; die drei Vorgaben aus Task 21 (genau
drei Sätze, keine Emojis, kein Vorschlag zum Trainingsplan) stehen unverändert.

**Angepasstes Bestandsskript:** `task-21-check.js` prüfte `/volumeKg/` im
Payload — genau den Schlüsselnamen, der jetzt falsch wäre. Die Zusicherung
dahinter („das Volumen geht mit, Rohdaten nicht") ist unverändert; die Prüfung
liest jetzt `/volume/` und `/unit/`, mit Begründung im Skript. Die Suite bleibt
bei 22 Prüfungen.

**Checks:** `W1` lbs (Payload trägt `27216` und `"unit":"lbs"`, keinen Rohwert
`12345`, keinen Schlüssel mit `Kg`; die Zahlenzeile im Reiter „Woche" nennt
dieselbe Zahl `27.216 lbs`), `W1` kg (unverändert `12345`, `"unit":"kg"`) und ein
statischer Check auf den Auftragstext. Rot/rot/rot → grün/grün/grün.

---

## Wichtig 2 — scheitert die Nachkontrolle, bleibt es still

* `_cnCancelOwn()` **meldet seinen Fehlschlag zurück** (`null` = alles durch,
  sonst ein Satz). Der Ablauf ist unverändert — ein Lesefehler verhindert das
  Abbestellen weiterhin nicht, der gemerkte Plan trägt es dann allein. Neu ist
  nur, dass der Aufrufer davon erfährt. `_cnSyncRun()` ignoriert den Wert
  bewusst: dort korrigiert der nächste Lauf. Beim Kontowechsel gibt es keinen
  nächsten Lauf.
* `_coachDropOwnNotifs()` macht ein fehlgeschlagenes `getPending()` laut
  (`_coachWipeFailed` → `console.error` + Hinweis auf dem Bildschirm) statt
  blank `{ok:false, rest:-1}` zurückzugeben. Der Fehler des `cancel()` wird
  angehängt, aber **nur wenn danach auch wirklich etwas stehen geblieben ist** —
  sonst wäre es ein Alarm ohne Schaden.

**Checks:** `W2` (getPending fällt aus → Konsole *und* Toast) und `W2` (cancel
fällt aus, ein 47xxx bleibt → Konsole nennt beides). Rot: leere Konsole, leerer
Toast bzw. nur die halbe Meldung. Grün: beides.

---

## Wichtig 3 — Konto B sieht A's Chat und kann dessen Plan importieren

* `_aicPlanPending = null` in Schritt 6 der Räumung — daran allein hängt der
  Knopf „Plan importieren".
* Neuer Schritt 6b: `_aiaActions = []`, `_aiaScope = null` und `#aia-body`
  geleert. Dieselbe Lücke, nur über `_aiaApply()`; der Blattinhalt nennt Zahlen
  und Übungsnamen von Konto A und wird von niemandem neu gezeichnet.
* `_coachOptRender()` deckt jetzt `#aic-log` ab (`_aicRenderLog()` +
  `_aicRenderSugg()`). Das ist die Stelle, an der die App ihr Coach-Bild
  nachzieht; Schritt 10 der Räumung ruft sie ohnehin.

**Checks:** `W3` Chat (vorher: A's Text steht da und der Import-Knopf ist
sichtbar; nachher: `_aicHist` leer, kein A-Text, kein `aic-plan-btn`,
`_aicPlanPending === null`) und `W3` Analyse. Rot → grün.

---

## Beauftragte Erweiterung — die Persona überlebt den Kontowechsel

### Was mitgeht

`aiCoach` reist im **bestehenden** `_pushToCloud()` mit (`aiCoach:
_coachCloudPersona()`). Keine neue Firestore-Schreibstelle, `firestore.rules`
unangetastet, nach `profiles/` schreibt weiterhin nur `_pushSocialProfile()`.
`S.coachSession`, `S.coachPush`, `S.coachReports` bleiben rein lokal, das Dossier
bleibt in seiner Subcollection mit den strengeren Rules.

`_coachCloudPersona()` schickt einen JSON-Rundlauf statt der rohen Referenz: ein
Schlüssel mit dem Wert `undefined` (etwa ein nie gesetztes `preset`) ließe
Firestore den **kompletten** Push abweisen, und der Fehler stürbe im `catch` von
`_pushToCloud()` — die App verlöre still jede weitere Sicherung.

### Die Zusammenführungsstrategie: `pick()`, mit einer Lesart von „nicht gesetzt"

Genommen ist die Strategie, die die App für ihre übrigen strukturierten Felder
schon benutzt: **`pick()`** — der zuletzt geschriebene Stand gewinnt, gemessen an
`updatedAt` des **ganzen** Dokuments. Zwei Geräte mit verschiedenen Personas
entscheidet also das Gerät, dessen Dokument jünger ist, und das `aiCoach`-Objekt
wandert **am Stück**: kein feldweises Mischen, denn ein halber Coach (Name von
hier, Ton von dort) wäre niemandes Coach.

Der einzige Zusatz — und ohne ihn gäbe es die Erweiterung nicht: eine Persona
**ohne abgeschlossene Einrichtung** (`preset === undefined`) gilt für `pick()`
als *nicht gesetzt*, so wie `null` für jedes andere Feld. Grund: `_coachWipeLocal()`
setzt die Persona auf die Voreinstellung **und** ruft `persist()`, das
`S.updatedAt = Date.now()` schreibt. Damit ist der lokale Stand beim Login nach
jedem Kontowechsel *immer* jünger als die Cloud. `pick()` nach der reinen Uhr
lieferte also stets die leere Voreinstellung zurück — und schriebe sie beim Push
unmittelbar danach auch noch über die Persona, die im Dokument des Kontos steht.
`preset === undefined` ist dabei kein erfundenes Merkmal: es ist genau der
Marker, mit dem die App an jeder anderen Stelle „die Einrichtung steht noch aus"
meint (der Hub startet dann den Assistenten).

Der gemergte Stand wird auf `_coachPersonaDefaults()` aufgefüllt, damit ein
älterer Cloud-Stand ohne ein später hinzugekommenes Feld keine Lücke hinterlässt.

### Reihenfolge

Erst die Räumung aus Task 22, dann der Merge — genau so ruft es
`onAuthStateChanged` (`_coachHandleAuthUser(user)` vor `_onLogin(user)`) und
ebenso der native Apple-Pfad. Der Check fährt beide Reihenfolgen:

* `P — Kontowechsel A → B mit eigener Persona in B's Cloud`: der Coach heißt
  „Bruno" und nie „Nina"; A's Persona bleibt in A's Dokument stehen, B's wird
  nicht von der Voreinstellung überschrieben.
* `P Gegenprobe`: **dieselben zwei Schritte in der falschen Reihenfolge** —
  danach steht kein „Bruno" mehr da, sondern die leere Voreinstellung. Die
  Reihenfolge ist also tragend und kein Zufall.

### Sichtbarkeit ohne Neustart

`_dataSig()` kennt `aiCoach` bewusst nicht (ein Name soll keinen vollen Rerender
der Startseite auslösen). Deshalb zieht nach beiden Merges (Login und
Live-Sync von einem zweiten Gerät) `_coachOptRender()` nach, wenn sich
`_coachPersonaSig()` geändert hat. Ohne das stünde die Heute-Karte bis zum
nächsten Start auf „Coach".

### Die Abmelde-Rückfrage

Neu formuliert, in beiden Sprachen, und sie deckt zwei Punkte auf einmal ab:

> Deine Trainings und Übungen bleiben auf diesem Gerät. Dein Coach beginnt für
> das nächste Konto von vorn: Name, Ton, Erzählbogen und das **Berichtsarchiv**
> gehen von diesem Gerät — die Zahlen der laufenden Woche rechnet er aus deinen
> Einheiten neu. Meldest du dich später wieder mit diesem Konto an, kommen Name
> und Ton zurück.

Damit stimmt Minor 3 (der Reiter „Woche" zeigt sofort wieder Zahlen — geräumt
ist das Archiv, nicht die Rechnung) und die Zusage der Erweiterung.

**Checks:** `P` Push-Payload (Persona ja, Coach-Zustand nein), `P` abmelden und
auf demselben Konto wieder anmelden (Name/Ton/Push-Stufe zurück, Heute-Karte
trägt den Namen), `P` A→B, `P` Gegenprobe, `P` zwei Geräte, `P` kein zweiter
Schreibpfad, `Bindend` firestore.rules unverändert + gleiche `setDoc`-Ziele wie
in HEAD.

---

## Minor

1. **`_crLauf`** wird beim Kontowechsel gekappt (`_crLauf = null`), und
   `_crBuildRun()` prüft `_coachGen` vor **beiden** Schreibzugriffen: vor dem
   Anlegen des Berichts und nach dem Modellaufruf. Der Kommentar sagt jetzt
   „**nur solange das Konto dasselbe ist**, liegt `rep` als Referenz in
   `S.coachReports`".
2. **`getWeekKey()`** — der Kommentar an beiden Stellen (`_crWeekKey`,
   `_cnWeekVol`) nennt es nicht mehr „Altformat", sondern einen **anderen
   Algorithmus** (Wochen ab dem 1. Januar statt ab dem ersten Donnerstag), nennt
   die Jahresgrenze als Ort der Abweichung und warnt ausdrücklich davor, das mit
   einem `padStart(2,'0')` zusammenführen zu wollen. **Der Code bleibt
   unverändert** — er ist ein Speicherschlüssel.
3. Siehe Abmelde-Rückfrage oben.

---

## Die vier überlebenden Mutationen — jetzt gedeckt

Jede Mutation wurde in einem eigenen Baum nachgebaut und der Prüflauf dagegen
gefahren. Jede Mutation stirbt an **genau ihrer** Prüfung, keine an einer
fremden:

| Mutation | Prüfung | Baum ohne Mutation | Baum mit Mutation |
| --- | --- | --- | --- |
| `esc(r.text)` → `r.text` (`_chReportHTML`) | M1 | PASS | **FAIL** (26/27) |
| Donnerstag-12:00 aus `_crWeekKey` entfernt | M2 | PASS | **FAIL** (26/27) |
| `_chTab = 'chat'` aus der Räumung entfernt | M3 | PASS | **FAIL** (26/27) |
| `_coachMicroLast = null` entfernt | M4 | PASS | **FAIL** (26/27) |

* **M1** legt einen Bericht mit `<img src=x onerror="window.__xss=1">` an, öffnet
  den Reiter „Woche" und prüft dreierlei: `window.__xss === 0`, kein `<img>` im
  Blatt, und der Text steht als Text da. Der offene Ledger-Punkt („Chat-Vorschau
  auf `_aicMd()` umstellen") führt genau an dieser Stelle vorbei — der Text kommt
  vom Modell und trägt den Trainingskontext.
* **M2** rechnet Montag, 27.07.2026, 00:30 in `Europe/Berlin` (UTC+2):
  `_crWeekKey` → `2026-W31`, `_crLabel` → „KW 31". Ohne die Normalisierung
  liefert dieselbe Rechnung `2026-W30`. Der Check hält beide Zahlen fest.
* **M3/M4** prüfen den Zustand nach einem echten Auth-Wechsel, nachdem Konto A
  `_chTab = 'report'` und `_coachMicroLast = 'brust'` gesetzt hatte.

Dazu die Zusicherung, die gar keinen Test hatte: **die Serialisierung des
Räumungspfads gegen `_cnSync()`** — vier Prüfungen (C1 dynamisch ×2, Gegenprobe,
statisch), vor dem Fix rot.

---

## Drei angepasste Bestandsskripte (Zusicherung unverändert)

Kein Verhalten wurde an einen Test angepasst — angepasst wurden drei Prüfungen,
deren Wortlaut an einer Stelle hing, die sich absichtlich geändert hat. Jede
Anpassung steht mit Begründung im Skript.

1. **`task-21-check.js`, Prüfung 2** las `/volumeKg/` im Modell-Payload — genau
   den Schlüsselnamen, der jetzt lügen würde. Liest nun `/volume/` und `/unit/`.
   Die Zusicherung („das Volumen geht mit, Rohdaten nicht") ist dieselbe.
2. **`task-21-check.js`, Prüfung 22** schnitt 2600 Zeichen ab
   `async function _crAskModel` heraus. Die Funktion trägt jetzt die Umrechnung
   samt Begründung und einen Satz mehr im Auftrag; der Ausschnitt reichte nicht
   mehr bis zum Schluss. Jetzt 3600 Zeichen, dieselben Bedingungen.
3. **`task-19-check.js`, Prüfung 27** („`S.coachPush` steht nicht im
   Cloud-Payload") las den ROHEN Quelltext im Fenster vor `_serverTime`. Dort
   steht jetzt der Kommentar zu `aiCoach`, der ausdrücklich aufzählt, was
   *nicht* mitgeht — darunter das Wort `coachPush`. Die Prüfung liest das
   Fenster jetzt durch `ohneKommentar()`, wie die Nachbarprüfung im selben
   Skript es längst tut. Der Riegel selbst ist unverändert scharf: `coachPush`
   im **Code** des Payloads schlägt weiterhin an.
4. **`task-22-check.js`, Vorbereitung `KONTO_A`** setzt `_coachLastUid`
   ausdrücklich auf `undefined`, bevor sie `__authTo(uid)` ruft. Lädt die echte
   Firebase-Bibliothek einmal und meldet „abgemeldet", steht dort `null` — und
   der erste `__authTo()` ist dann **selbst schon ein Kontowechsel**, der eine
   Runde räumt, bevor der Prüfzustand überhaupt steht. Der Kommentar im Skript
   nannte diese Falle bereits und begegnete ihr mit der Reihenfolge; bis jetzt
   reichte das, weil `_coachDropOwnNotifs()` seinen Bestand noch synchron las,
   also **vor** dem `__cnReset()` am Ende der Vorbereitung. Seit die Räumung in
   der `_cnSync()`-Kette hängt, läuft sie eine Runde später und räumte die
   Termine ab, die die Vorbereitung gerade gesetzt hatte. Das ist ein Artefakt
   der Vorbereitung und kein Verhalten der App: dort erscheinen 47xxx-Termine
   ausschließlich über `_cnSync()`, und das steht in derselben Kette — der Drop
   läuft also immer davor oder danach, nie daneben. Nachgewiesen mit einer
   Sonde: `_coachLastUid` stand vor `__authTo` auf `"null"`, `_coachGen` ging
   dabei von 0 auf 1, also lief tatsächlich eine Räumung.

## Testzahlen

| Suite | vorher | nachher |
| --- | --- | --- |
| `node --test` über die 13 etablierten Dateien | 517/517 | 517/517 |
| `block5-fix-check.js` (neu) | **8/27** | **27/27** |
| `task-22-check.js` | 24/24 | 24/24 |
| `task-21-check.js` | 22/22 | 22/22 |
| `task-19-check.js` | 27/27 | 27/27 |
| `task-17-check.js` | 23/23 | 23/23 |
| `block3-fix-check.js` | 21/21 | 21/21 |
| `task-10-check.js` | 46/46 | 46/46 |
| `task-9-check.js` | 20/20 | 20/20 |
| `lang-check.js` | 4/4 | 4/4 |

---

### Zur Zahl 517

`node --test test/*.js` meldet während dieser Arbeit **573 Tests, 49 Fehler**.
Die Differenz stammt vollständig aus `test/coach-charts.test.js` — einer
**fremden, unfertigen und nicht eingecheckten** Datei (mitsamt einem ebenso
unfertigen `js/coach-charts.js`), die während des Laufs im Arbeitsverzeichnis
auftauchte und wieder verschwand: an diesem Repo arbeitet parallel ein zweiter
Schreiber (lokaler, noch nicht gepushter Commit `002acac`
„docs(coach): Design-Spec fuer Hub und Heute-Karte …"). Über die 13 etablierten
Dateien einzeln gefahren stehen unverändert **517/517**. `js/coach-charts.js`
und `test/coach-charts.test.js` sind nicht Teil dieser Arbeit und wurden nicht
angefasst.

## Offen / Grenzen des Messlaufs

* Ein **echter** Firebase-Kontowechsel und die echte Netzrunde des Cloud-Merges
  sind hier nicht prüfbar; das Doppel hält die Dokumente in einer Map. Prüfbar
  ist damit die Reihenfolge, die Strategie und der Inhalt des Payloads — nicht
  das Verhalten der echten Rules oder eine Latenzkompensation von Firestore.
* Die Brücken-Latenz ist simuliert (400 ms). Auf dem Gerät liegt das Fenster
  laut Review bei 50–300 ms; der Riegel hängt nicht an der Dauer, sondern an der
  Reihenfolge und am Zähler.
* `_coachGen` ist ein Prozess-Zähler. Stirbt die App mitten in einem `_cnSync()`,
  greift wie bisher der nächste Lauf beim Start.
* Läuft `getDoc()` in `_onLogin()` einmal länger als 800 ms, kann der
  Debounce-Push eines *vor* der Räumung angestoßenen `persist()` theoretisch
  vorher feuern. Für die Räumung selbst ist das mit Schritt 9b geschlossen; für
  die übrigen Felder ist es Bestand und außerhalb dieses Auftrags.
* **Dieser Prüflauf und dieser Bericht liegen im Repo, sind aber nicht
  eingecheckt:** `.superpowers/sdd/.gitignore` enthält eine einzelne Zeile `*`
  und schlägt die Lockerung aus `002acac` (`.gitignore` im Wurzelverzeichnis)
  ab. Das ist eine Repo-Entscheidung und wurde hier bewusst nicht umgeworfen —
  am selben `.gitignore` arbeitet gerade der zweite Schreiber. Commit-fähig
  gemacht wird das mit `git rm --cached`/Anpassung jener Datei, nicht mit einem
  `git add -f` aus dieser Aufgabe heraus.
