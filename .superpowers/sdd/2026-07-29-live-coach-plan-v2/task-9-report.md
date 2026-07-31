# Task 9 — Coach-Hub · Bericht

**Status:** DONE
**Commit:** `9605d2e` — `feat(coach): Coach-Hub mit Chat, Journal, Woche und Einstellungen` (nach `origin/main` gepusht, `83e9c2b..9605d2e`)
**Berührte Datei:** ausschließlich `index.html` (+341/−1). Kein Versions-Bump, kein Changelog-Eintrag, `firestore.rules` unangetastet.
**Tests:** `node --test test/*.js` → 221/221 vor und nach der Änderung. Chromium-Prüfskript → 15/15 PASS (vorher 1/14).

---

## Was gebaut wurde

Ein Overlay `ov-coach-hub` mit vier Bereichen hinter der bestehenden `.aic`-Karte im Heute-Tab.
Struktur und Klassen sind vom bestehenden `ov-ai-chat` übernommen:
`.ov > .sheet > .sh-handle + .sh-head + .px(> .ch-tabs + #ch-body)`.

Der `.px`-Wrapper steckt bewusst zwischen `.sh-head` und `.ch-tabs`, obwohl das Brief die
Reihenfolge ohne ihn aufzählt: `.px` trägt die horizontale Sheet-Polsterung (`padding:0 20px`),
und „Struktur vom bestehenden `ov-ai-chat` übernehmen" heißt genau diesen Wrapper mitzunehmen.
Ohne ihn hätte ich die Polsterung in den neuen `.ch-*`-Regeln nachbauen müssen — also eigenes
Aussehen statt geerbtes.

### Schnittstelle (wie im Brief)

| Funktion | Ort | Verhalten |
| --- | --- | --- |
| `openCoachHub(tab)` | `index.html` nach `setCoachPreset` | öffnet `ov-coach-hub`; Weiche auf `openCoachSetup()` bei Premium **und** `preset === undefined` **und** vorhandener Funktion |
| `renderCoachHub()` | ebenda | zeichnet Kopf, Reiter und aktiven Bereich; **no-op**, wenn das Overlay nicht `.on` trägt |
| `coachHubTab(name)` | ebenda | `'chat'\|'journal'\|'report'\|'settings'`, unbekannte Namen werden verworfen |
| `_dossierRemove(group, index)` | neben `_dossierSet` | entfernt einen Dossier-Eintrag, schreibt über `_dossierSet()` zurück, stößt damit den bestehenden gedrosselten Push an |

Hilfsfunktionen (alle privat, alle einmal deklariert — geprüft): `_chToneVars`, `_chToneLine`,
`_chChatHTML`, `coachHubOpenChat`, `_chEntryMeta`, `_chJrnEmpty`, `_chJrnRow`, `_chJournalHTML`,
`_chReportHTML`, `_chChips`, `_chSwitch`, `_chSettingsHTML`, Konstanten `_CH_TABS`,
`_CH_JRN_GROUPS`, `_CH_TONES`, `_CH_PRESETS`.

### Getroffene Anker

| Anker aus dem Brief | Fundstelle (vor der Änderung) | Was dort hinzukam |
| --- | --- | --- |
| Markup direkt **vor** `id="ov-ai-chat"` | Zeile 7295 | `ov-coach-hub`-Sheet, 21 Zeilen |
| Styles neben den `.aic-sugg`-Regeln | Zeile 5177 (`.aic-plan-btn`, KI-Chat-Block) | `.ch-*`-Block, 37 Zeilen |
| Sheet-Ebene | Zeile 5155 `#ov-ai-chat,#ov-ai-analyze,…{z-index:1080}` | `#ov-coach-hub` in dieselbe Regel — sonst liegt Tabbar (1000)/Bubble (1060) über der Sheet-Unterkante |
| Tap-Ziel | `function renderCoachTodayCard` Zeile 10721, Block `const card = host.firstElementChild` | `card.onclick` mit `closest('button, a')`-Wächter |
| Dossier-API | `function _dossier()` / `_dossierSet` Zeile 24110 ff. | `_dossierRemove` direkt darüber vor `_dossierFlush` |
| Neue englische Gegenparts | Ende von `I18N_EN`, Zeile 8125 | 22 Zeilen Coach-Hub-Block |

Diff-Hunks (`git diff -U0`): 5155, 5177, 7294, 8125, 10768, 23733, 24122 — sieben Stellen, alle oben belegt.

### Die vier Bereiche

- **Chat.** Der bestehende Chat zieht **nicht** um. Der Hub zeigt die letzten zwei Nachrichten aus
  `_aicHist`, auf 180 Zeichen gekürzt, in den bestehenden `.aic-msg aic-user/aic-bot`-Blasen, und
  darunter einen `.aic-go`-Knopf `coachHubOpenChat()` → `closeOv('ov-coach-hub')` + `openAiChat()`.
  Der Overlay-Name wurde vor dem Verlinken geprüft (`ov-ai-chat`, Zeile 7296, Einstiegsfunktion
  `openAiChat(seed)` Zeile 23996).
- **Journal.** Vier Gruppen `goal`, `limits`, `prefs`, `works` aus `_dossier()`. Jede Zeile mit
  Löschknopf → `_dossierRemove('<gruppe>', <zahl>)`. Leere Gruppe zeigt „Noch nichts notiert." statt
  einer Lücke. Über allem eine Zeile, die sagt, woher die Einträge kommen und dass jede einzeln
  löschbar ist.
- **Woche.** Ehrlicher Platzhalter: „Dein erster Wochenbericht kommt am Sonntag." plus eine Zeile,
  was drinstehen wird.
- **Einstellungen.** Name (`.pf-inp`, `maxlength=20`), Ton (vier Karten), Umfangs-Profil (drei
  Karten + ggf. vierte deaktivierte „Angepasst"), zugeklapptes `<details>` „Feinjustierung" mit
  `inTraining` (Chips Aus/Schlüsselmomente/Jeder Satz), `setFeedback` (Schalter),
  `pushLevel` (Chips Still/Normal/Eng), `insights` (Schalter).

Die Ton-Auswahl zeigt **denselben Satz in allen vier Tönen**, genau über den im Brief genannten
Weg: `CoachPersona.say('greet', {ex:'Bankdrücken', kg:60, reps:8, sets:3}, personaGet({tone:t}), _lang())`.
Die vier Sätze sind im Prüfskript als vier *verschiedene* Zeichenketten verankert.

---

## Entscheidungen und ihre Begründung

1. **`until` gibt es im echten Dossier nicht.** `js/coach-memory.js` hält pro Eintrag ausschließlich
   `{t, ts}`; `toEntry()` und `sanitizeList()` werfen jedes weitere Feld weg. Das im Brief genannte
   `until`-Datum wird deshalb **abgeleitet**: für `limits` aus `ts + CoachMemory.STALE_MS`
   („gilt bis 10.9.2026"), weil nur `limits` verfallen (`dossierLoad` schneidet dort ab); bei
   fehlendem Zeitstempel (`ts === 0`, Altschema) steht „Bestätigung fällig" statt eines erfundenen
   Datums. Für `prefs`/`works` steht „notiert am <Datum>" — die altern nicht. Beides läuft durch
   `esc()`. Das ist im Code kommentiert, damit der nächste Leser nicht nach `until` sucht.
2. **`goal` ist ein Wert, keine Liste.** Die Gruppe zeigt eine Zeile mit Index 0, damit
   `_dossierRemove` **eine** Signatur behält. `_dossierRemove('goal', …)` setzt `d.goal = null`.
3. **Dossier-Werte werden nicht übersetzt.** Das Ziel ist ein Whitelist-Wort aus dem Modul
   (`Masse|Kraft|Abnehmen|Fitness`), die Listeneinträge sind Modell-/Nutzertext. Beides ist **Daten**,
   nicht Oberfläche — wie Übungsnamen. Nur die Gruppenüberschriften laufen durch `tr()`.
4. **Kurze Schalterwörter laufen über `_cm(de,en)`, nicht über `I18N_EN`.** `Aus`, `Still`, `Eng`,
   `Normal`, `Name`, `Ton` als globale Schlüssel hätten über den DOM-MutationObserver (Zeile 8311)
   **jeden** fremden Textknoten mitübersetzt, der zufällig genauso heißt. Alle längeren, eindeutigen
   Strings stehen dagegen als exakte Schlüssel in `I18N_EN`. Vor dem Eintragen auf Kollisionen
   geprüft: `Einschränkungen`, `Locker`, `Hart`, `Nachrichten`, `Jeder Satz`,
   `Angepasst` kommen bisher nur **innerhalb** längerer Sätze vor, nie als eigener Textknoten —
   `tr()` matcht exakt auf den getrimmten Knoten, also kein Durchgriff. `Live-Coach im Training`,
   `Tagesempfehlung auf der Startseite`, `Woche`, `Einstellungen`, `Dein Ziel` waren schon da und
   werden wiederverwendet.
5. **Kein Umzug des Chats.** Wie im Brief: `aicSend()`, Diktat (`aicMicToggle`) und `_aicHist`
   hängen an `ov-ai-chat`. Ein Umzug hätte alle drei angefasst, ohne dem Nutzer etwas zu geben.
6. **Wenige neue Klassen.** Genau die sieben aus dem Brief (`.ch-tabs`, `.ch-tab`, `.ch-tab.on`,
   `.ch-sec`, `.ch-row`, `.ch-jrn`, `.ch-preset`) plus Kindselektoren (`.ch-preset b/span`,
   `.ch-jrn>span i`, `#ch-body details/summary`). Die Drei-Wege-Schalter benutzen die **bestehenden**
   `.pwz-chip`/`.pwz-chip.on`-Regeln, die Schalter die bestehende `.tgl`-Struktur, die Chat-Vorschau
   die bestehenden `.aic-msg`-Blasen, das Namensfeld `.pf-inp`, der Hauptknopf `.aic-go`. Farben
   ausschließlich über `--acc`/`--acc-rgb`/`--gl-*`/`--inp-bg`/`--sep`.
7. **Name per `onchange`, nicht `oninput`.** `setAiCoachOpt` ruft `_coachOptRender()` und damit
   `renderCoachHub()`, das `#ch-body` neu zeichnet. Bei `oninput` verlöre der Nutzer nach dem ersten
   Buchstaben den Fokus.
8. **Zweites Beispiel im gewählten Ton.** Unter den vier Demokarten steht eine Zeile
   `#ch-tone-ex` mit `_say('mid', {vol:4200, pct:104})` — der **echte** Persona-Weg, also mit Name
   und gewähltem Ton. Sie wechselt beim Antippen sichtbar (das ist der Prüfpunkt „Beispielsatz
   darunter ändert sich"), wiederholt aber nicht den Satz der Karte darüber, sondern liefert ein
   zweites, anderes Beispiel. Vier Töne ⇒ vier verschiedene Zeilen, im Prüfskript verankert.
9. **Kein Premium-Tor über die Weiche hinaus.** Die `.aic`-Karte rendert ohnehin nur mit Premium
   (`_coachTodaySuggestion` gibt sonst `null`), und sie ist der einzige Zugang. Ein zusätzlicher
   `openPaywall()`-Aufruf in `openCoachHub` wäre Verhalten, das niemand angefordert hat.
10. **Symbole.** Keine Emojis. Der Löschknopf trägt `✕` — genau das Zeichen und dieselbe
    Knopf-Rolle wie die bestehenden `.x-btn`/`.aic-x` in jedem Sheet der App (U+2715, kein Emoji,
    keine Emoji-Präsentation). Ein neues `ICO.trash` hätte ein Symbol eingeführt, das die App sonst
    nirgends kennt. Die Reiter tragen bewusst **kein** Icon: ihre Beschriftung wird per
    `textContent` gesetzt, ein Icon im Markup würde dabei überschrieben.
11. **`.ch-tab{flex:1 0 auto}` statt `flex:1`.** Mit `flex:1` und `white-space:nowrap` wurde
    „Einstellungen" am rechten Sheet-Rand abgeschnitten (im ersten Screenshot-Durchlauf gesehen).
    Jetzt füllen die vier Reiter die Zeile, ohne unter ihre Textbreite zu schrumpfen; auf sehr
    schmalen Geräten scrollt die Zeile (`overflow-x:auto`, gleiches Muster wie `.aic-sugg`).

## Fallstricke aus dem Brief — wie sie behandelt wurden

- **`CoachMemory.dossierGet` existiert nicht** → `_dossierRemove` benutzt `_dossier()` und
  `_dossierSet()`. Kein neuer Firestore-Zugriff: `_dossierSet` setzt den Dirty-Marker und plant den
  bestehenden 4-Sekunden-Push. `d.updatedAt = Date.now()` **vor** `_dossierSet`, weil der
  Dirty-Marker genau an diesem Wert hängt (`_dossierMarkDirty(uid, d.updatedAt)`).
- **`openAiChat()` vor dem Verlinken geprüft** → Overlay `ov-ai-chat`, Funktion `openAiChat(seed)`.
- **CTA darf nicht geschluckt werden** → `if (ev.target.closest('button, a')) return;`. Klassenname
  der inneren Karte (`.aic`) und Existenz von `haptic()` (Zeile 18489) vorher geprüft; `haptic`
  wird trotzdem nur über `typeof haptic === 'function'` und in `try/catch` gerufen.
- **`renderCoachHub()` früh zurück** → erster Zweig prüft `ov.classList.contains('on')`. Belegt mit
  einem eigenen Check, der auch den Weg über `setAiCoachOpt` mitnimmt.
- **`persist()` statt `save()`** → nur `persist()` (indirekt über `setAiCoachOpt`/`setCoachPreset`)
  bzw. `_dossierSet()`. `save(` kommt im neuen Code nicht vor.
- **Defensive Verdrahtung** → `openCoachHub` (Weiche), `renderCoachHub` (ganzer Renderpfad),
  `_chJournalHTML` (Dossier lesen), `_chToneLine`, `_dossierRemove`, der neue `card.onclick` und
  jeder `haptic()`-Aufruf liegen in `try/catch`. Ein Fehler im Coach kann kein Training abbrechen.

## Gestaltungsregel 1 (ein Einstieg)

Der Hub hängt als Sheet direkt unter `<body>`, nicht im Heute-Tab. `#heute-pad` hat unverändert
zwei Kinder (`coach-today-card`, `heute-grid`), `#coach-today-card` genau ein Kind, `#pg-heute`
genau eine `.aic`-Karte und keine `.ch-*`-Elemente, die Tableiste unverändert fünf Knöpfe, keiner
mit Coach-Bezug. Als Check verankert (Punkt 9 unten), damit ein späterer Versuch, „noch eine kleine
Kachel" hinzuzufügen, rot wird.

---

## Verifikation

Kein Simulator auf diesem Rechner (Windows, kein Xcode) → Chromium über Puppeteer.
Skript: `.superpowers/sdd/2026-07-29-live-coach-plan-v2/task-9-check.js` (Ordner ist git-ignoriert,
läuft mit `node .superpowers/sdd/2026-07-29-live-coach-plan-v2/task-9-check.js`, Exit-Code 0/1).
Beleg-Screenshot: `.superpowers/sdd/2026-07-29-live-coach-plan-v2/task-9-hub.png` (Hub offen auf
dem Journal-Reiter, 390×844 @2x). Die Anmelde-Wand `#auth-gate` wird für das Bild rein visuell
ausgeblendet, kein Renderpfad angefasst. Die Tagesempfehlung ist gestubbt (frisches Profil liefert
`null`), gezeichnet wird mit dem echten `renderCoachTodayCard()`.

### Prüfliste des Briefs → Checks

| Brief-Schritt | Check |
| --- | --- |
| Tipp auf die Coach-Karte → Hub öffnet | 1 (Klick auf `.aic-head`, prüft `.on` + vier Reiter) |
| Tipp auf „Training starten" → Training, kein Hub | 2 (CTA feuert Marker, Hub bleibt zu) |
| Alle vier Reiter → keiner leer | 3 (Beschriftung gesetzt, Inhalt > 20 Zeichen, aktiver Reiter markiert) |
| Journal-Eintrag sichtbar, Löschen dauerhaft | 4 (DOM + localStorage) und 4b (**echter Seiten-Neustart**) |
| Eintrag mit `<b>` → Text, kein Markup | 6 |
| Vier Töne → Beispielsatz ändert sich sichtbar | 7 (vier Karten-Sätze paarweise verschieden, vier Live-Zeilen paarweise verschieden) |
| „Eng dabei" + Nachrichten „Still" → „Angepasst" | 8 (inkl. `preset === 'custom'`, Karte `.on` **und** `disabled`, „Eng dabei" nicht mehr aktiv) |
| Heute-Tab → keine neue Fläche | 9 |
| *zusätzlich:* `renderCoachHub()` no-op bei geschlossenem Overlay | 10 |
| *zusätzlich:* Weiche auf Task 10 in allen vier Lagen | 11 |
| *zusätzlich:* `_dossierRemove` gegen Müll-Eingaben | 12 |
| *zusätzlich:* Chat-Reiter kürzt, escaped und springt ins Chat-Overlay | 13 |
| *zusätzlich:* ganzer Hub auf Englisch, kein deutscher Oberflächentext | 14 |

### Lauf VOR der Änderung (rot)

```
-- Task 9 — Coach-Hub (Chromium statt Simulator) --
FAIL  Tipp auf die Coach-Karte oeffnet ov-coach-hub (Handler verdrahtet)
        got: {"open":false,"tabs":0}
FAIL  Tipp auf "Training starten" startet das Training, Hub bleibt zu (closest-Waechter)
        got: {"__err":"Cannot read properties of null (reading 'classList')"}
FAIL  Alle vier Reiter: Beschriftung gesetzt, Inhalt nicht leer, aktiver Reiter markiert
        got: {"__err":"openCoachHub is not defined"}
FAIL  Journal: Eintrag samt Ablaufdatum sichtbar, Loeschknopf entfernt ihn aus DOM und Speicher
        got: {"__err":"openCoachHub is not defined"}
FAIL  Loeschung ueberlebt den App-Neustart (Eintrag weg, uebriges Dossier da)
        got: {"limits":1,"prefs":["Lieber Kurzhanteln"],"goal":"Kraft"}
FAIL  Dossier-Eintrag mit <b> erscheint als Text, nicht als Markup
        got: {"__err":"openCoachHub is not defined"}
FAIL  Ton-Auswahl: vier Karten mit vier verschiedenen Saetzen, Beispielsatz darunter wechselt sichtbar
        got: {"__err":"openCoachHub is not defined"}
FAIL  "Eng dabei" + Nachrichten "Still" ⇒ vierte, deaktivierte Karte "Angepasst" ist aktiv
        got: {"__err":"openCoachHub is not defined"}
FAIL  Heute-Tab: nur die bestehende .aic-Karte, kein neues Element, kein fuenfter Tab
        got: {"__err":"Cannot read properties of null (reading 'classList')"}
FAIL  renderCoachHub() kehrt bei geschlossenem Overlay frueh zurueck (auch aus setAiCoachOpt)
        got: {"__err":"openCoachHub is not defined"}
FAIL  Weiche: ohne openCoachSetup oeffnet der Hub, mit ihr startet die Einrichtung nur bei preset===undefined + Premium
        got: {"__err":"Cannot read properties of null (reading 'classList')"}
FAIL  _dossierRemove: Ziel loeschbar, fremde Gruppe und Index daneben aendern nichts
        got: {"__err":"openCoachHub is not defined"}
FAIL  Chat-Reiter: letzter Wortwechsel gekuerzt und escaped, Knopf springt in ov-ai-chat
        got: {"__err":"openCoachHub is not defined"}
PASS  Screenshot des offenen Hubs geschrieben

Seitenfehler (gefiltert): keine

Ergebnis: 1/14 PASS
```

Anmerkungen zu diesem Lauf: Der Screenshot-Check war damals noch der schwache Vorgänger
(„Datei geschrieben, Größe > 5 kB") und ging deshalb grün, obwohl der Hub gar nicht existierte —
er prüft jetzt zusätzlich, dass das Overlay `.on` trägt und das Journal Zeilen zeigt. Der
Zweisprachigkeits-Check kam nach diesem Lauf hinzu, daher 14 statt 15 Punkte.

### Lauf NACH der Änderung (grün)

```
-- Task 9 — Coach-Hub (Chromium statt Simulator) --
PASS  Tipp auf die Coach-Karte oeffnet ov-coach-hub (Handler verdrahtet)
PASS  Tipp auf "Training starten" startet das Training, Hub bleibt zu (closest-Waechter)
PASS  Alle vier Reiter: Beschriftung gesetzt, Inhalt nicht leer, aktiver Reiter markiert
PASS  Journal: Eintrag samt Ablaufdatum sichtbar, Loeschknopf entfernt ihn aus DOM und Speicher
PASS  Loeschung ueberlebt den App-Neustart (Eintrag weg, uebriges Dossier da)
PASS  Dossier-Eintrag mit <b> erscheint als Text, nicht als Markup
PASS  Ton-Auswahl: vier Karten mit vier verschiedenen Saetzen, Beispielsatz darunter wechselt sichtbar
PASS  "Eng dabei" + Nachrichten "Still" ⇒ vierte, deaktivierte Karte "Angepasst" ist aktiv
PASS  Heute-Tab: nur die bestehende .aic-Karte, kein neues Element, kein fuenfter Tab
PASS  renderCoachHub() kehrt bei geschlossenem Overlay frueh zurueck (auch aus setAiCoachOpt)
PASS  Weiche: ohne openCoachSetup oeffnet der Hub, mit ihr startet die Einrichtung nur bei preset===undefined + Premium
PASS  _dossierRemove: Ziel loeschbar, fremde Gruppe und Index daneben aendern nichts
PASS  Chat-Reiter: letzter Wortwechsel gekuerzt und escaped, Knopf springt in ov-ai-chat
PASS  Zweisprachig: Reiter und alle vier Bereiche kommen auf Englisch, kein deutscher Oberflaechentext
PASS  Screenshot des offenen Hubs geschrieben (Hub sichtbar, Journal gefuellt)

Seitenfehler (gefiltert): keine

Ergebnis: 15/15 PASS
```

`node --test test/*.js`: 221 tests, 221 pass, 0 fail — identisch vor und nach der Änderung.
Diese Task fügt keinen Node-Test hinzu (App-Globals lassen sich dort nicht laden).

### Optische Kontrolle

Alle vier Reiter wurden zusätzlich als Bild geprüft (390 px Breite, Dunkelmodus, Name „Nina",
Profil `close` + `pushLevel:still` ⇒ „Angepasst" sichtbar, `<details>` aufgeklappt). Dabei sind zwei
Dinge aufgefallen und behoben worden:

1. „Einstellungen" wurde am rechten Rand abgeschnitten → `.ch-tab{flex:1 0 auto;font-size:12px;padding:9px 8px}`.
2. Die beiden Erklärzeilen in der Feinjustierung sahen wie Überschriften aus → laufen jetzt als
   `<i>` im gedämpften Sub-Stil.

---

## Offene Punkte / Bedenken

- **Task 10 fehlt weiterhin.** Die Weiche steht und ist in allen vier Lagen belegt, aber solange
  `openCoachSetup` nicht existiert, öffnet ein frisches Premium-Profil direkt den Hub — mit
  Standardname „Coach", Ton „sachlich" und **ohne** gesetztes `preset`. Der Einstellungs-Reiter
  zeigt dann keine aktive Profilkarte. Das ist die vom Controller vorgegebene Auflösung und
  verschwindet mit Task 10.
- **`_dossierSet()` schreibt nur mit angemeldetem Konto** (`_coachUid()`); ohne Konto liefert
  `_dossier()` ohnehin ein leeres Dossier, das Journal ist also leer und der Löschknopf nie
  erreichbar. Kein neuer Fehlerfall, aber es heißt: das Journal ist ein Konto-Feature.
- **Der Wochen-Reiter ist bis Block 5 ein Satz.** Bewusst, laut Brief.
- **Journal-Einträge werden nicht übersetzt** (Daten, nicht Oberfläche). Ein englischsprachiger
  Nutzer sieht dort deutsche Modellsätze, falls das Modell auf Deutsch geantwortet hat — dieselbe
  Lage wie im Coach-Prompt selbst, kein Regressionspunkt dieser Task.
- **`.gitignore` ist im Arbeitsbaum weiterhin ungestaged verändert** (nicht von mir, stand schon
  vor Beginn so da). Der Commit listet ausschließlich `index.html`, kein `git add -A`.
- Der Autosync-Job hat nicht dazwischengegriffen: `9605d2e` liegt direkt auf `83e9c2b`, kein
  fremder Commit dazwischen, keine History umgeschrieben.

---

# Fix-Runde 1 — die vier Important-Befunde der Review

**Commit:** `2bd4265` — `fix(coach): Hub-Zugang bleibt ohne Tagesempfehlung, Tipp nach Namensfeld zaehlt`
**Datei:** ausschließlich `index.html` (+90/−24). `APP_VERSION`, `sw.js`, `CHANGELOG`, `firestore.rules` unberührt.
**Tests:** `node --test test/*.js` 221/221. Chromium-Prüfskript **20/20 PASS** (vorher 15/20 — die fünf roten Punkte unten).
Die Minor-Befunde wurden bewusst **nicht** angefasst; sie bleiben für die Abschluss-Review offen.

## Befund 1 — der insights-Schalter löschte den einzigen Zugang zum Hub

**Geändert.** `renderCoachTodayCard()` hat einen zweiten Zweig: liefert `_coachTodaySuggestion()`
`null` **und** ist der Grund dafür `isPremium() && S.aiCoach.insights === false`, rendert die Karte
schmal weiter — `.aic` mit Aurora, `.aic-orb`, dem `.aic-lbl` mit dem Coach-Namen (Task 8) und einer
Zeile „Tippen für Chat, Journal und Einstellungen." **Kein** Ring, **keine** Chips, **kein** CTA,
**kein** Empfehlungskopf. Andere Gründe für `null` (kein Premium, ganz frisches Konto) lassen die
Fläche weiter leer — dort gibt es auch nichts zu öffnen. `_coachTodaySuggestion()` selbst ist
unverändert: sie bleibt „die Empfehlung", der Schalter behält also seine Wirkung und verliert nur
die Nebenwirkung. Der Schaltertext ist unverändert, keine Warnung.

Das Tap-Ziel liegt jetzt in `_aicCardTap(card)` — eine Funktion für beide Kartenvarianten, mit
demselben `closest('button, a')`-Wächter wie vorher. Neuer Signaturwert `quiet|<Name>` für
`_aicSig`, damit der Karten-Cache zwischen beiden Varianten unterscheidet.
Neuer I18N_EN-Schlüssel: `Tippen für Chat, Journal und Einstellungen.` → `Tap for chat, journal and settings.`

**Check 14** („Tagesempfehlung aus: schmale Karte mit Coach-Namen bleibt und oeffnet den Hub"):
setzt den echten `_coachTodaySuggestion` zurück (der Stub hätte die insights-Prüfung darin
übersprungen), schaltet `insights` aus, ruft `renderHome()` **und** `renderCoachTodayCard()`, prüft
Karte vorhanden / Name gesetzt / `.aic-ringbox`, `.aic-chips`, `.aic-go`, `.aic-head` alle weg /
Karte auch nach einem zweiten `renderHome()` da / genau EINE `.aic` in `#pg-heute` / Tipp öffnet den
Hub. Rot vorher: `{"karte":false,...,"nachHome":false,"karten":0,"hubOffen":false}`.

## Befund 2 — der erste Tipp nach dem Namensfeld wurde verschluckt

**Geändert.** Das Feld ruft nicht mehr `setAiCoachOpt('name', …)` direkt, sondern
`coachHubSetName(this)`. Die Funktion setzt `_chHoldBody = true`, schreibt den Namen und setzt das
Flag im `finally` zurück; `renderCoachHub()` aktualisiert bei gesetztem Flag Kopf und Reiter, kehrt
aber **vor** `body.innerHTML` zurück. Danach zieht `coachHubSetName` die drei Stellen nach, die den
Namen tragen: `#ch-title` (per `textContent`), das Feld selbst (zeigt, was `safeName()` wirklich
gespeichert hat) und `#ch-tone-ex` über die neue Funktion `_chToneExInner()`. Der Body bleibt also
stehen, und der Tipp, der das `change` überhaupt ausgelöst hat, landet auf seinem Knopf.

**Check 15** („Erster Tipp direkt nach dem Namensfeld setzt den Ton"): echte Zeigerfolge über
Puppeteer — `page.click('#ch-name')`, Strg+A, `page.type('Nina')`, dann **ein** `elementHandle.click()`
auf die Ton-Karte „Ruhig" (mousemove → pointerdown → pointerup, also mit echtem Zeitfenster zwischen
down und up). Geprüft: `tone === 'ruhig'`, `name === 'Nina'`, Kopf und Feld tragen „Nina", und der
Name steht im Beispielsatz-Vorspann. Rot mit zurückgedrehtem Fix:
`{"getippt":true,"tone":"sachlich","name":"Nina",…}` — der Name kommt an, der Ton nicht.

## Befund 3 — gemischte Sprache bei gt_lang='auto'

**Geändert.** Neu `_chLang()` (`GT_LANG === 'en' ? 'en' : 'de'`) und `_chSay(key, vars)`.
`_chToneLine()` und der Beispielsatz laufen darüber statt über `_lang()` / `_say()`. Damit sprechen
die vier Tonsätze dieselbe Sprache wie Reiter, Überschriften und der Übungsname im Beispiel (der
kommt aus `_cm()`, also schon immer aus `GT_LANG`).

**`_lang()` selbst ist unangetastet.** Zur Notiz, nicht angefasst: `_lang()` liest nur
`localStorage['gt_lang'] === 'en'` und liefert bei `auto` auf einem englischsprachigen Gerät `de`,
während `GT_LANG` dort `en` ist. Die gleiche Schieflage trifft damit **jede** andere `_say()`-Stelle
aus Task 7/8 (Live-Leiste, Satz-Rückmeldung, Push-Texte): englische Oberfläche, deutsche
Coach-Sätze, solange der Nutzer die Sprache nie manuell gesetzt hat. Der saubere Schnitt wäre
`_lang(){ return GT_LANG === 'en' ? 'en' : 'de'; }` — eine Zeile, aber sie ändert das Verhalten
aller bisherigen Aufrufer und gehört deshalb nicht in diese Fix-Runde.

**Check 20** („gt_lang='auto' auf englischem Geraet"): steht als letzter Check, weil der
`navigator.language`-Griff für jedes weitere Dokument der Seite gilt. `page.evaluateOnNewDocument`
setzt `navigator.language = 'en-US'` und `languages = ['en-US','en']`, `gt_lang` wird entfernt, dann
Neustart. Geprüft: `GT_LANG === 'en'`, `GT_LANG_PREF === 'auto'`, und die vier gerenderten Tonsätze
sind **zeichengleich** mit `CoachPersona.say('greet', …, 'en')` — dazu die Live-Zeile gegen
`say('mid', …, 'en')`. Rot vorher: `"lang":"de"`, `"gleich":false`, deutsche Sätze mit „Bench press"
darin, Reiter englisch.

## Befund 4 — `<details>` „Feinjustierung" klappte bei jedem Schalter zu

**Geändert.** `renderCoachHub()` liest den `open`-Zustand direkt vor dem Ersetzen aus dem DOM und
setzt ihn danach wieder. Bewusst **nicht** über einen `ontoggle`-Merker: das `toggle`-Ereignis feuert
erst als eigene Aufgabe, ein schneller Tipp käme ihm zuvor und der Merker wäre noch falsch.

**Check 16** („Feinjustierung bleibt nach jedem Schalter offen, zugeklappt bleibt zugeklappt"):
aufklappen, `setFeedback` umlegen → offen?, dann den Chip „Still" tippen → offen?, danach die
Gegenprobe (zuklappen, Schalter umlegen → bleibt zu). Rot mit zurückgedrehtem Fix:
`{"nachSchalter":false,"nachChip":false,"zuBleibtZu":true}`.

## Die drei blinden Flecken des Prüfskripts

1. **Zweisprachigkeit ist keine Sperrliste mehr.** Neu `HUB_TR_KEYS` — **alle 38** deutschen
   Oberflächen-Strings, die der Hub über `tr()` rendert. Der Check prüft für jeden den konkreten
   Bestand in `I18N_EN` (vorhanden, nicht leer, **nicht identisch** mit dem deutschen Schlüssel) und
   zusätzlich, dass das gerenderte `aria-label` des Löschknopfs auf Englisch `Remove entry` heißt.
   Er lief sofort rot und hat den einzigen fehlenden Schlüssel gefunden: den neuen Satz der schmalen
   Karte aus Befund 1 (`{"fehlt":["Tippen für Chat, Journal und Einstellungen."]}`). `Chat` und
   `Journal` stehen bewusst nicht in der Liste — im Englischen identisch, kein Schlüssel nötig.
2. **`gt_lang='auto'` wird jetzt gefahren** (Check 20, s. Befund 3). Vorher setzte das Skript nur
   hart `en`.
3. **`insights:false` wird gefahren** (Check 14), und die Klickfolge für Befund 2 läuft als echte
   Zeigerfolge über `elementHandle.click()` statt über `.click()` im Seitenkontext. Neuer Helfer
   `tap(sel, onclick)` im Skript, mit Begründung im Kommentar.

### Zwei Fehler steckten in den neuen Checks selbst

Ehrlichkeitshalber notiert, weil sie den ersten Grünlauf verzögert haben:

- Check 16 las `nachChip` erst im `return`-Objekt — **nach** der Gegenprobe, die `open` gerade auf
  `false` gesetzt hatte. Der Wert wird jetzt sofort nach dem Chip-Klick festgehalten.
- Check 15 klickte ins Leere, weil (a) der Chat-Sheet aus Check 13 noch offen war (gleiche Ebene
  1080, im Markup **hinter** dem Hub, sein Scrim fängt also jeden echten Zeigerklick ab) und (b)
  Puppeteer ein Element genau an die Oberkante scrollt, wo der klebende `.sh-handle` darüber liegt.
  Beides sind Testartefakte, keine App-Fehler — der Check schließt jetzt `ov-ai-chat` und setzt
  `sheet.scrollTop = 0`, bevor er tippt. Belegt ist das dadurch, dass derselbe Check mit
  zurückgedrehtem Fix rot und mit Fix grün läuft.

## Vollständige Ausgaben

### Rot — vor der Fix-Runde (alle vier Befunde)

```
FAIL  Tagesempfehlung aus: schmale Karte mit Coach-Namen bleibt und oeffnet den Hub (Befund 1)
        got: {"karte":false,"name":null,"ring":false,"chips":false,"cta":false,"head":false,
              "text":null,"nachHome":false,"hubOffen":false,"karten":0}
FAIL  Erster Tipp direkt nach dem Namensfeld setzt den Ton (Befund 2)
        got: {"getippt":true,"tone":"sachlich",…}
FAIL  Feinjustierung bleibt nach jedem Schalter offen, zugeklappt bleibt zugeklappt (Befund 4)
        got: {"nachSchalter":true,"nachChip":false,…}
FAIL  Zweisprachig: jeder Hub-Schluessel liegt uebersetzt in I18N_EN, aria-label inklusive
        got: {"fehlt":["Tippen für Chat, Journal und Einstellungen."],"aria":"Remove entry"}
FAIL  gt_lang='auto' auf englischem Geraet: Tonsaetze englisch wie Reiter und Ueberschriften (Befund 3)
        got: {"GT_LANG":"en","pref":"auto","lang":"de","gleich":false,
              "ist":{"ruhig":"Letztes Mal Bench press mit 60 kg, 3 Sätze zu 8. Nimm dir Zeit.",
                     "sachlich":"Bench press: zuletzt 60 kg, 3 Sätze zu 8 Wiederholungen.",
                     "hart":"Bench press. 60 Kilo. 3 Sätze. Los.",
                     "locker":"Bench press mit 60 kg — dein altes Spiel, oder?"},
              "soll":{"ruhig":"Last time Bench press at 60 kg, 3 sets of 8. Take your time.",
                      "sachlich":"Bench press: last session 60 kg, 3 sets of 8 reps.",
                      "hart":"Bench press. 60 kilos. 3 sets. Go.",
                      "locker":"Bench press at 60 kg again? You know the drill."},
              "liveIst":"Halbzeit: 4.200 kg, 104 Prozent gegenüber der letzten Einheit.",
              "liveSoll":"Halfway: 4,200 kg, 104 percent versus the last session.",
              "tabs":"Chat|Journal|Week|Settings"}

Ergebnis: 15/20 PASS
```

Gegenprobe für die beiden Checks, die zuerst einen Testfehler hatten (Fix 2 und 4 im Quelltext
zurückgedreht, Checks in der korrigierten Fassung):

```
FAIL  Erster Tipp direkt nach dem Namensfeld setzt den Ton (Befund 2)
        got: {"getippt":true,"tone":"sachlich","name":"Nina","titel":"Nina","feld":"Nina",
              "ex":"Noch ein Beispiel von Nina: Halbzeit: 4.200 kg, 104 Prozent gegenüber der letzten Einheit."}
FAIL  Feinjustierung bleibt nach jedem Schalter offen, zugeklappt bleibt zugeklappt (Befund 4)
        got: {"nachSchalter":false,"nachChip":false,"zuBleibtZu":true,"feedback":true,"push":"still"}

Ergebnis: 18/20 PASS
```

### Grün — nach der Fix-Runde

```
-- Task 9 — Coach-Hub (Chromium statt Simulator) --
PASS  Tipp auf die Coach-Karte oeffnet ov-coach-hub (Handler verdrahtet)
PASS  Tipp auf "Training starten" startet das Training, Hub bleibt zu (closest-Waechter)
PASS  Alle vier Reiter: Beschriftung gesetzt, Inhalt nicht leer, aktiver Reiter markiert
PASS  Journal: Eintrag samt Ablaufdatum sichtbar, Loeschknopf entfernt ihn aus DOM und Speicher
PASS  Loeschung ueberlebt den App-Neustart (Eintrag weg, uebriges Dossier da)
PASS  Dossier-Eintrag mit <b> erscheint als Text, nicht als Markup
PASS  Ton-Auswahl: vier Karten mit vier verschiedenen Saetzen, Beispielsatz darunter wechselt sichtbar
PASS  "Eng dabei" + Nachrichten "Still" ⇒ vierte, deaktivierte Karte "Angepasst" ist aktiv
PASS  Heute-Tab: nur die bestehende .aic-Karte, kein neues Element, kein fuenfter Tab
PASS  renderCoachHub() kehrt bei geschlossenem Overlay frueh zurueck (auch aus setAiCoachOpt)
PASS  Weiche: ohne openCoachSetup oeffnet der Hub, mit ihr startet die Einrichtung nur bei preset===undefined + Premium
PASS  _dossierRemove: Ziel loeschbar, fremde Gruppe und Index daneben aendern nichts
PASS  Chat-Reiter: letzter Wortwechsel gekuerzt und escaped, Knopf springt in ov-ai-chat
PASS  Tagesempfehlung aus: schmale Karte mit Coach-Namen bleibt und oeffnet den Hub (Befund 1)
PASS  Erster Tipp direkt nach dem Namensfeld setzt den Ton (Befund 2)
PASS  Feinjustierung bleibt nach jedem Schalter offen, zugeklappt bleibt zugeklappt (Befund 4)
PASS  Zweisprachig: jeder Hub-Schluessel liegt uebersetzt in I18N_EN, aria-label inklusive
PASS  Zweisprachig: Reiter und alle vier Bereiche kommen auf Englisch, kein deutscher Oberflaechentext
PASS  Screenshot des offenen Hubs geschrieben (Hub sichtbar, Journal gefuellt)
PASS  gt_lang='auto' auf englischem Geraet: Tonsaetze englisch wie Reiter und Ueberschriften (Befund 3)

Seitenfehler (gefiltert): keine

Ergebnis: 20/20 PASS
```

`node --test test/*.js`: 221 tests, 221 pass, 0 fail — unverändert.

### Optische Kontrolle der schmalen Karte

Screenshot geprüft: gleiche Glasfläche, Akzentrahmen, Orb und Name („NINA") wie die volle Karte,
darunter eine Zeile Text. Kein Ring, keine Chips, kein Knopf, keine zweite Fläche im Heute-Tab.
Die Karte ist weiter tippbar und öffnet den Hub.

## Offene Punkte dieser Runde

- `_lang()` bleibt schief (s. Befund 3) — bewusst nicht angefasst, Auswirkung auf Task 7/8 oben
  beschrieben.
- Ein ganz frisches Premium-Konto **mit** eingeschalteter Tagesempfehlung hat weiterhin keine Karte,
  solange `_coachTodaySuggestion()` nichts zu sagen hat (kein Plan, keine Historie) — und damit auch
  keinen Zugang zum Hub. Das ist der Zustand von vor Task 9 und war nicht Teil dieser Runde; mit
  Task 10 (Einrichtung beim Abo-Abschluss) bekommt dieser Nutzer ohnehin einen anderen ersten Weg.
  Falls das bleiben soll, wäre der gleiche `stumm`-Zweig die naheliegende Stelle.
