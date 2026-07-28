# Live-Coach: Persona, Stimme, Tiefe im Training, proaktive Meldungen

**Datum:** 2026-07-28
**Status:** Design, freigegeben — wartet auf Umsetzungsplan
**Baut auf:** `docs/superpowers/specs/2026-07-27-ki-coach-fundament-design.md` (Dossier, Aktions-Log, Intent-Router — implementiert, Stand `25bd698`)

## Ziel

Der KI-Coach soll sich wie ein echter Trainer anfühlen: er hat einen Namen und
einen Ton, er spricht, er begleitet die Einheit von der Begrüßung bis zum
Abschluss-Urteil, und er meldet sich von selbst — ohne dass die App offen ist.

Das Fundament (Gedächtnis, Rückmeldung, lokale Antworten) steht bereits. Dieses
Dokument beschreibt, was darauf aufsetzt, damit aus der Funktion eine Begleitung
wird.

**Kostenrahmen:** Das Abo kostet 2,99 €/Monat. Alles hier Beschriebene muss in
0,30 $ KI-Kosten pro zahlendem Nutzer und Monat passen (~11 % vom Netto nach
Apple-Provision). Der Weg dorthin ist ein Mix: alles, was aus lokalen Daten
berechenbar ist, wird berechnet; das Modell kommt nur dort zum Einsatz, wo
Sprache entsteht.

## Ausgangslage im Code

| Fläche | Stand | Anker |
| --- | --- | --- |
| Coach-Karte im Heute-Tab | `.aic`-Karte mit Erholungs-Ring, Headline, Text, CTA. Label fest „KI-Coach" | `index.html:5581`, `renderCoachTodayCard()` `index.html:10653`, `_coachTodaySuggestion()` `index.html:10574` |
| Live-Coach im Training | Leiste `wk-coach-bar`, gespeist über `_coachBarSet(mode,msg,holdMs)`. Fünf Einzeltrigger: `jump/drop/repmax/fatigue/stall` | `index.html:6630`, `index.html:22878` |
| KI-Chat | Freitext, Diktat-Button, Historie 30 Nachrichten in `localStorage['gt_aiChat']` | `aicSend()` `index.html:24050`, `_aicContext()` `index.html:24024` |
| Gedächtnis | Dossier in `users/{uid}/coach/dossier`, Caps und Whitelist clientseitig | `js/coach-memory.js` |
| Aktions-Log | Ringpuffer 50, Drosselung nach 5 Ignorierungen | `js/coach-log.js` |
| Intent-Router | 8 Fragen lokal beantwortet, kein LLM | `js/coach-intent.js` |
| Diktat (STT) | `SpeechPlugin.swift` (SFSpeechRecognizer) nativ, Web Speech API im Browser | `ios/App/App/Plugins/SpeechPlugin.swift`, `index.html:24286` ff. |
| Lokale Notifications | `@capacitor/local-notifications` installiert und benutzt (Trainings-Erinnerung, Pausen-Timer) | `index.html:9198`, `index.html:16593` ff. |
| Einstellungen | `S.aiCoach = { live, insights }` | `index.html:8771`, `setAiCoachOpt()` `index.html:23528` |
| KI-Worker | Pfade `/chat`, `/coach`, `/vision`, `/quota`, `/stats`, `/admin-stats` | `ai-worker/worker.js` |
| Kostendeckel | `MONTHLY_LIMIT` 150/Nutzer, `GLOBAL_MONTHLY_USD` 25 fix, Modell `gemini-3.5-flash-lite` | `ai-worker/wrangler.jsonc` |
| Push (APNs) | Eigener Worker, ausschließlich für Flammen-Reaktionen | `push-worker/worker.js` |

**Was fehlt:** Persona, Sprachausgabe, Zusammenhang zwischen den Trainings-Triggern,
proaktive Meldungen, ein Ort, an dem der Coach wohnt.

### Zwei Befunde, die das Design geprägt haben

1. **`aiCoach` steht bereits in der `hasOnly`-Whitelist** (`firestore.rules:20`).
   Die Persona passt vollständig hinein — keine Rules-Änderung, kein Sync-Bruch.
2. **Der APNs-Token hängt an der Community.** `_pushSocialProfile()` schreibt
   `pushToken` nach `profiles/{uid}`, läuft aber nur bei `S.socialOn`
   (`index.html:19820`). Wer die Community aus hat, hat keinen Token in der
   Cloud. Serverseitige Push an alle Nutzer hätte also erst einen neuen
   Token-Pfad gebraucht. Die gewählte Geräte-Variante umgeht das vollständig.

## Getroffene Entscheidungen

| Frage | Entscheidung |
| --- | --- |
| Umfang der Persona | Name (frei wählbar) + Ton + eigene Stimme. **Kein Avatar.** |
| Sprachverhalten im Training | Coach spricht **nur auf Anfrage**. Kein automatisches Reden, kein Wake-Word. |
| Proaktive Meldungen | Auf dem Gerät geplant (lokale Notifications). **Keine neue Server-Komponente.** |
| Kostendeckel | Pro-Nutzer-Budget 0,30 $/Monat, globaler Deckel = Nutzerzahl × Budget statt fixer 25 $. |
| Zuhause des Coaches | Hub-Overlay. Einstieg über die **bestehende** `.aic`-Karte — keine neue Fläche im Heute-Tab. |
| Tiefe im Training | Alle vier Erweiterungen (Erzählbogen, Satz-Rückfrage, Pausen-Fenster, Abschluss-Debrief). |
| Push-Frequenz | Drei Stufen (still / normal / eng), Standard normal, hart im Code gedeckelt. |
| Plan-Änderungsvorschläge | **Ausdrücklich nicht.** Vom Nutzer gestrichen. |

## Architektur

### Datenhaltung

```js
S.aiCoach = {
  live: true,          // bestehend: Live-Coach im Training an/aus
  insights: true,      // bestehend: Tagesempfehlung auf der Startseite
  name: 'Coach',       // NEU: frei wählbar, max. 20 Zeichen
  tone: 'sachlich',    // NEU: 'ruhig' | 'sachlich' | 'hart' | 'locker'
  voice: null,         // NEU: iOS-Stimm-Identifier, null = Systemstimme
  pushLevel: 'normal', // NEU: 'still' | 'normal' | 'eng'
  voiceOn: true        // NEU: Sprachausgabe überhaupt an/aus
}
```

`aiCoach` ist bereits in der Whitelist — der Cloud-Sync trägt die Persona ohne
weitere Arbeit auf jedes Gerät.

Rein lokal, **nicht** in der Cloud, deshalb ohne Rules-Berührung:

```js
S.coachSession = { wkTs, phase, saidKinds: [], setCount, volSoFar, lastSetTs }
S.coachPush    = { sentTs: { kind: ts }, dayCount, weekCount, weekKey }
```

Zeitstempel durchgängig `Date.now()`-Millisekunden, `weekKey` im Format
`2026-W31`.

Das Dossier (`users/{uid}/coach/dossier`) bleibt unverändert. Sein `tone`-Feld
ist die **Beobachtung des Modells**; `S.aiCoach.tone` ist die **Wahl des
Nutzers** und gewinnt immer, wenn beide gesetzt sind.

### Module

Neue Dateien in `js/`, gleiche Bauart wie `coach-memory.js`: reine Logik, kein
DOM, direkt mit `npm test` prüfbar. Jedes Modul kennt die anderen nicht;
verdrahtet wird ausschließlich in `index.html`.

| Datei | Aufgabe | Schnittstelle |
| --- | --- | --- |
| `coach-persona.js` | Name/Ton/Stimme lesen, Prompt-Zeile bauen, Tonvarianten für **alle** algorithmischen Texte | `personaGet()`, `personaLine()`, `say(key, vars)` |
| `coach-session.js` | Erzählbogen der laufenden Einheit | `sessionStart(ctx)`, `onExerciseOpen(ex)`, `onSet(log)`, `onRest(secs)`, `sessionEnd(sess)` → `{text, kind}` oder `null` |
| `coach-notify.js` | Frequenz-Deckel und Planung der lokalen Notifications | `planAll(ctx)`, `mayNotify(kind)`, `record(kind)` |
| `coach-voice.js` | Brücke zur Sprachausgabe, Zustand des Sprech-Buttons | `speak(text)`, `stopSpeak()`, `ask()` |

`say(key, vars)` ist der zentrale Kniff: **jeder** vom Coach ausgesprochene
algorithmische Satz läuft dort durch und existiert in vier Tonvarianten × zwei
Sprachen. Ohne diesen Punkt müsste jede neue Textstelle den Ton selbst
behandeln, und der Ton würde je nach Stelle auseinanderlaufen.

### Warum keine neue Server-Komponente

Der ursprüngliche Gedanke war ein Cloudflare-Cron, der sonntags für jeden Nutzer
den Wochenbericht erzeugt und per APNs verschickt. Das hätte gebraucht:

- Service-Account mit Lesezugriff auf **fremde** Nutzerdokumente
- Gesundheitsangaben aus dem Dossier erstmals auf einem Server
- neuen APNs-Token-Pfad unabhängig von `S.socialOn` inkl. Rules-Erweiterung
- Firestore-Leses für jeden Nutzer, jeden Tag

Die Geräte-Variante erreicht dasselbe Ergebnis: iOS hält den Termin auch bei
beendeter App. Der Bericht wird **vorgezogen** erzeugt — beim letzten
App-Öffnen vor dem Sonntagabend-Termin rechnet die App die Woche aus und holt
die drei Coach-Sätze beim bestehenden KI-Worker, mit dem Login des Nutzers.
Die Notification wird dann mit dem **fertigen Text** geplant, sodass auf dem
Sperrbildschirm die echte Zusammenfassung steht.

Wurde die App im Zeitfenster nie geöffnet, greift der Einladungstext
(„Deine Woche ist fertig") — der Bericht entsteht dann beim Antippen.

Der Rückkehr-Nudge folgt demselben Muster: bei jedem App-Start wird eine
Notification auf „in 5 Tagen" neu gesetzt und die alte verworfen. Wer die App
öffnet, verschiebt sie; wer fünf Tage wegbleibt, wird angesprochen.

Grenze dieser Variante, bewusst akzeptiert: eine lokal geplante Notification
kennt nur den Stand vom letzten App-Öffnen. Für beide Anwendungsfälle reicht
das genau.

## Blöcke

Sechs Blöcke, jeder für sich fertig und abnehmbar. Reihenfolge ist bindend:
Block 0 finanziert die anderen, Block 1 liefert den Ton, den Block 2 und 3
benutzen, Block 4 liefert den Kanal für Block 5.

### Block 0 — Kosten-Fundament

**Pro-Nutzer-Budget.** `GLOBAL_MONTHLY_USD` ist heute fix 25 $ und bricht bei
rund 80 voll ausschöpfenden Nutzern für **alle gleichzeitig**. Ersetzt durch:
KV-Zähler `prem:{YYYY-MM}` — jeder erfolgreich verifizierte Premium-Nutzer trägt
sich einmal pro Monat ein. Globaler Deckel = `count × USD_PER_USER` (Default
0,30). Kein Firestore-Zugriff nötig, der Worker sieht die Premium-Prüfung
ohnehin.

**Geteilter Antwort-Cache.** KV-Schlüssel = Hash aus normalisierter Frage +
Sprache + Modell. TTL 30 Tage. Greift **nur** bei Fragen ohne Personenbezug —
„Wie führe ich Latzug aus?" ist für alle gleich, „Wie war meine letzte Bank?"
nicht. Die Entscheidung trifft ein Klassifikator im Router, nicht das Modell:
enthält die Frage einen Bezug auf eigene Daten (Possessivpronomen, Zeitbezug,
Übungsname aus `S.exercises` in Verbindung mit Verlaufswörtern), wird nicht
gecacht. Im Zweifel: nicht cachen.

**Router-Ausbau** von 8 auf ~20 Fragen. Kandidaten aus dem Gym-Alltag: nächster
Satz, Gewichtsvorschlag begründen, Aufwärmsätze, Supersatz-Partner,
Wochenfortschritt, Streak, letzte PR-Übung, Trainingsdauer, was gestern lief,
Pausenempfehlung, Volumen einer Muskelgruppe, nächster geplanter Tag.

### Block 1 — Persona und Coach-Hub

**Persona-Einstellung:** Name (Textfeld, max. 20 Zeichen, `esc()` beim Rendern),
Ton (vier Optionen), Stimme (Liste vom Gerät, Vorhör-Button), Sprachausgabe
an/aus, Push-Stufe.

**Der Name ersetzt „KI-Coach" überall:** `.aic`-Karte, Chat-Kopf, Live-Leiste im
Training, Notification-Titel. Das ist der billigste und wirksamste Teil des
ganzen Vorhabens.

**Coach-Hub** (`ov-coach-hub`), vier Bereiche:

- **Chat** — der bestehende KI-Chat (`ov-ai-chat`), hierher umgezogen. Das
  bestehende Report-Overlay `ov-ai-report` bleibt unangetastet und behält
  seinen eigenen Einstieg; der Hub ersetzt es nicht.
- **Journal** — „Was ich über dich weiß": Dossier lesbar dargestellt, jeder
  Eintrag einzeln löschbar. Erfüllt Transparenz über Gesundheitsangaben und ist
  gleichzeitig das stärkste Vertrauenssignal.
- **Wochenbericht** — Langfassung des letzten Berichts (ab Block 5)
- **Einstellungen** — Persona, Push-Stufe, die bestehenden `live`/`insights`

**Einstieg:** Tipp auf die `.aic`-Karte öffnet den Hub. Der CTA-Button in der
Karte („Training starten") behält seine eigene Funktion — das Tap-Ziel muss
sauber getrennt sein. **Keine zusätzliche Fläche im Heute-Tab**; die Karte
existiert bereits und trägt ab jetzt Namen und Zuhause des Coaches.

### Block 2 — Stimme

**Neues Plugin `TtsPlugin.swift`** (`AVSpeechSynthesizer`):
`speak(text, voiceId)`, `stop()`, `voices()` (Liste der auf dem Gerät
verfügbaren Stimmen der aktuellen Sprache).

Audio-Session zwingend `.playback` mit `.duckOthers`. Ohne das schneidet der
Coach die Musik ab statt sie leiser zu drehen — im Gym der Unterschied zwischen
benutzbar und sofort abgeschaltet.

**`SpeechPlugin.swift` ist noch nicht committed** (existiert seit 2026-07-25 als
untracked File). Gehört in Block 2 mit ins Repo, inklusive der beiden
Info.plist-Einträge `NSSpeechRecognitionUsageDescription` und
`NSMicrophoneUsageDescription`.

**Sprech-Button** im Trainings-Screen und im Chat: drücken → Diktat →
Intent-Router oder `/chat` → Antwort wird **gesprochen und angezeigt**. Der
Coach schweigt, solange er nicht gefragt wird.

Web/PWA: Web Speech API für Eingabe (vorhanden), `speechSynthesis` für Ausgabe,
wo verfügbar. Fehlt beides, verschwindet der Button.

### Block 3 — Tiefe im Training

Alles algorithmisch, **kein einziger LLM-Aufruf**. Speist die bestehende Leiste
`wk-coach-bar` über `_coachBarSet()` — keine neue UI-Fläche.

1. **Erzählbogen.** `coach-session.js` führt einen Zustand über die Einheit:
   Begrüßung mit Bezug auf die letzte gleichartige Einheit („zuletzt 3×8 @ 60"),
   Einordnung zur Halbzeit („du liegst über dem letzten Volumen"),
   Abschluss-Urteil. Der Coach weiß, wo in der Einheit man steht, statt nur auf
   Einzelsätze zu reagieren.
2. **Ansage beim Öffnen einer Übung.** Zielsätze, letztes Gewicht, was heute
   anders sein soll.
3. **Satz-Rückfrage.** Nach dem Speichern eines Satzes drei Chips unter der
   Leiste: leicht / passend / schwer. Ergebnis nach `log.rpe`, fließt in die
   Gewichtsempfehlung (Nachbarschaft `_ciAdjustW`, `index.html:11445`) und ins
   Dossier. Das ist RPE-Erfassung ohne Tipparbeit — und die Stelle, an der der
   Coach zum ersten Mal **fragt** statt nur zu sagen. Überspringbar; wer nicht
   antwortet, verliert nichts.
4. **Pausen-Fenster.** Während der Pause läuft heute nur ein Timer. Der Coach
   nutzt das Fenster für: Ankündigung des nächsten Satzes, Technikpunkt aus dem
   Dossier, Nachfrage zu einer gemeldeten Einschränkung. Höchstens eine
   Meldung pro Pause.
5. **Ermüdungsmuster über die Einheit.** Wiederholungsabfall und länger werdende
   Pausen zusammen gelesen statt Einzelsatz-Trigger: „Reserve ist unten — ein
   Satz noch oder Schluss?"
6. **Stillstands-Erkennung.** 12 Minuten ohne gespeicherten Satz: „Alles ok,
   oder machen wir Schluss?"
7. **Abschluss-Debrief.** Nach dem Speichern drei Zeilen: was lief, was auffiel,
   was beim nächsten Mal.
8. **Rückblick auf eigene Tipps.** „Ich hatte dir bei Satz 3 mehr vorgeschlagen
   — hat gepasst." Das Aktions-Log dafür existiert seit dem Fundament, wird
   aber bisher nie erzählt.

Alle acht Punkte respektieren `coachStats.muted` aus dem Aktions-Log und die
`limits` aus dem Dossier.

### Block 4 — Proaktive Meldungen

**Frequenz-Deckel** in `coach-notify.js`, hart im Code:

| Stufe | Deckel |
| --- | --- |
| still | nur Wochenbericht |
| normal (Standard) | max. 1/Tag, max. 4/Woche |
| eng | max. 2/Tag, max. 8/Woche |

Zähler in `S.coachPush`, Wochenwechsel über `weekKey`. Der Deckel gilt **vor**
der Planung: was nicht durchpasst, wird gar nicht erst eingeplant.

**Meldungsarten**, alle Texte algorithmisch im Persona-Ton über `say()`:

- **Trainings-Erinnerung mit Inhalt** statt „Zeit fürs Gym": „Heute Push —
  Bank 3×8 @ 62,5". Ersetzt die bestehende generische Erinnerung.
- **PR-Gratulation** unmittelbar nach der Einheit
- **Deload-Hinweis** bei anhaltend hohem Volumen und fallender Readiness
- **Rückkehr-Nudge** nach 5 Tagen ohne Einheit, bei jedem App-Start neu gesetzt

Berechtigung wird **nicht** beim ersten Start erfragt, sondern beim Einschalten
der Push-Stufe im Hub — an der Stelle, an der der Nutzer versteht, wofür.

### Block 5 — Wochenbericht

Sonntag 18:00 (Uhrzeit im Hub änderbar). Zahlen algorithmisch: Volumen, Sätze,
Einheiten, PRs, Muskelverteilung, Vergleich zur Vorwoche, Streak.
Drei Sätze Einordnung vom Modell im gewählten Ton — **ein** LLM-Aufruf pro
Woche und Nutzer.

**Vorgezogene Erzeugung:** Beim letzten App-Öffnen vor dem Termin wird der
Bericht erzeugt und die Notification mit dem fertigen Text geplant. Fällt das
aus, greift der Einladungstext und der Bericht entsteht beim Antippen.

Langfassung im Hub, die letzten 8 Berichte lokal aufgehoben.

## Kosten

| Posten | Rechnung |
| --- | --- |
| Einnahme netto | 2,99 € − 15 % Apple = 2,54 € ≈ 2,75 $ |
| Budget je Nutzer | 0,30 $ = **11 % vom Netto** |
| Chat-Aufruf mit Dossier | ~0,00146 $ (konservativ; hinterlegte Preise gehören zu einem größeren Modell als dem eingesetzten Lite) |
| 150 Aufrufe (Limit voll ausgereizt) | ~0,22 $ — passt |
| Wochenbericht | ~0,0017 $ × 4–5/Monat — vernachlässigbar |
| Block 3 komplett | 0 $, rein algorithmisch |

Antwort-Cache und Router-Ausbau senken das weiter. Um wie viel, hängt vom
Nutzungsmuster ab — das wird nach zwei Wochen aus `/stats` abgelesen, nicht
vorher behauptet.

## Datenschutz

Es entsteht **keine neue Datensenke**. Die sechs Regeln aus dem Fundament-Spec
gelten unverändert weiter und werden je Block nachgeprüft.

1. Persona liegt in `S.aiCoach` — bereits synchronisiertes, whitelisted Feld.
2. `S.coachSession` und `S.coachPush` bleiben rein lokal.
3. Kein Server sieht Dossier-Inhalte. Die Geräte-Variante hält diese Grenze
   ausdrücklich; ein Service-Account wird nicht angelegt.
4. Sprachaufnahmen werden nicht gespeichert, weder lokal noch entfernt. Das
   Diktat liefert Text, der Ton wird verworfen.
5. Der Antwort-Cache nimmt nur Fragen ohne Personenbezug auf. Im Zweifel wird
   nicht gecacht.
6. Journal im Hub macht das Dossier einsehbar und jeden Eintrag löschbar.

Neu nötig: `NSSpeechRecognitionUsageDescription` und
`NSMicrophoneUsageDescription` in der Info.plist. Nutrition Labels prüfen, ob
Spracherkennung eintragungspflichtig ist, auch wenn nichts gespeichert wird.

## Fehlerfälle

| Fall | Verhalten |
| --- | --- |
| TTS-Stimme nicht auf dem Gerät | Systemstimme der Sprache, kein sichtbarer Fehler |
| Diktat-Berechtigung verweigert | Sprech-Button verschwindet, Tastatur-Chat unverändert |
| Notification-Berechtigung verweigert | Coach meldet sich nur in der App, keine Fehlermeldung |
| App vor Sonntag nie geöffnet | Einladungstext statt fertigem Bericht |
| Cache liefert veraltete Antwort | nur Fragen ohne Personenbezug, TTL 30 Tage |
| Budget-Deckel erreicht | Algorithmischer Coach läuft weiter, nur Freitext-Chat pausiert |
| Persona-Ton unbekannt oder fehlt | Rückfall auf `sachlich` |
| Erzählbogen-Zustand veraltet (App-Neustart) | `S.coachSession` verwirft sich bei fremdem `wkTs` |
| Sprachausgabe während Musik | `.duckOthers` senkt, schneidet nicht ab |

## Tests

Logik gehört in die `js/`-Module, damit `npm test` sie ohne Browser prüfen kann.

- **Persona:** alle vier Töne × beide Sprachen liefern für jeden `say()`-Key
  einen Text; unbekannter Ton fällt auf `sachlich`; Name wird escaped
- **Erzählbogen:** erfundene Sessions durch Start/Mitte/Ende/Abbruch; kein
  Kind wird doppelt gesagt; `muted`-Typen kommen nicht vor
- **Frequenz-Deckel:** alle drei Stufen halten Tages- und Wochengrenze, auch
  über Wochenwechsel und Zeitzonenwechsel hinweg
- **Satz-Rückfrage:** „schwer" senkt die Empfehlung, „leicht" hebt sie, kein
  Sprung über die bestehenden Schrittweiten hinaus
- **Cache:** personenbezogene Fragen landen nie im Cache; gleiche Frage in
  DE und EN kollidiert nicht
- **Budget:** Zähler rechnet über Monatsgrenzen korrekt; ohne KV-Bindung
  greift der bestehende fail-open-Pfad unverändert
- **Datentrennung:** kein Schreibpfad nach `profiles/`; Kontowechsel setzt
  Persona und Session-Zustand zurück

## Verifikation

Die Vorsession hat sauber implementiert, aber im Protokoll steht: *kein einziger
Laufzeit-Durchlauf der App-Pfade*. Diese Lücke ist hier geschlossen.

Jeder Block endet mit:

1. `npm test` grün
2. echtem Durchlauf in der nativen App (`~/.claude/sim-native.sh gymtrack`) mit
   Screenshot als Beleg
3. eigenständiger Review-Runde, Fixes vor dem nächsten Block
4. Abnahme durch den Nutzer

## Abgrenzung

Nicht Teil dieser Runde, jeweils eigene Spec:

- Vorschläge zur Änderung des Trainingsplans (vom Nutzer gestrichen)
- HealthKit-gestützte Erholung (Schlaf, HRV)
- Formcheck per Videoaufnahme
- Ausbau des Maschinen-Scanners (Sitzhöhe, Griffposition)
- Coach-Zeile in Live Activity und Widget
- Wake-Word / dauerhaftes Mithören
- Server-Cron mit Service-Account (nur falls sich die Geräte-Variante im
  Betrieb als unzureichend erweist)
