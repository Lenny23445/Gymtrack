# Coach-Hub-Umbau — Bericht

Plan: `docs/superpowers/plans/2026-07-31-coach-hub-umbau.md`
Spec: `docs/superpowers/specs/2026-07-31-coach-hub-design.md`

---

## Task 2 — Der Hub wird ein Blatt mit fünf Kacheln

**Stand: fertig.** Node 574/574, alle zehn Browser-Suiten grün (234 Checks).

### Was entstanden ist

| Was | Wo |
| --- | --- |
| CSS der Kacheln (`.ch-card`, `-h`, `-t`, `-m`, `-c`, `-w`, `-b`, `.ch-in`) | `index.html`, Block „COACH-HUB: ein Blatt mit fünf aufklappenden Kacheln" |
| Markup `ov-coach-hub` | Kopf mit `#ch-title` + neuer Unterzeile `#ch-sub`, darunter nur noch `#ch-body` |
| `_CH_CARDS` / `_CH_CARD_IDS` / `_chOpen` | ersetzen `_CH_TABS` / `_chTab` |
| `coachHubOpen(name)`, `_chApplyOpen()`, `_chScrollOpen(k)` | ersetzen `coachHubTab(name)` |
| `_chCardHTML`, `_chCardBody`, `_chCardMetric` | zeichnen eine Kachel |
| `_chKzChat`, `_chKzWeek`, `_chKzPersona`, `_chKzScope`, `_chKzJournal` | die fünf Kennzahlen |
| `_chPersonaHTML`, `_chScopeHTML` | Aufspaltung von `_chSettingsHTML` |
| `ICO.chevron` | der Aufklapp-Winkel, dreht sich per CSS um 180° |
| `I18N_EN`: `Gespräch`, `Persönlichkeit`, `Umfang und Meldungen`, `dein Coach` | neue Oberflächentexte |

**Entfallen:** `_CH_TABS`, `_chTab`, `coachHubTab()`, `_chSettingsHTML()`, `.ch-tabs`,
`.ch-tab`, `.ch-tab.on`, `#ch-body.ch-fade` samt `@keyframes chFade`, die vier
`#ch-tab-*`-Knöpfe und `role="tablist"/"tab"/"tabpanel"` im Hub.
Damit ist der seit Task 10 geparkte Gestaltungsregel-7-Verstoß erledigt: das
Segmented Control war ein Bedienidiom, das die App sonst nirgends hat.

### Entscheidungen, die im Plan offen waren

- **Der Kachelwechsel zeichnet NICHT neu.** `coachHubOpen()` schaltet nur die
  Klasse `.on` am bestehenden Knoten um. Ein `innerHTML`-Austausch legt die
  Kachel schon im Endzustand an, und der Übergang `0fr → 1fr` liefe nie.
  Gezeichnet wird beim Öffnen des Blattes und bei jedem Schalter
  (`_coachOptRender()` → `renderCoachHub()`).
- **Alle fünf Kachelinhalte stehen gleichzeitig im DOM** — Voraussetzung für den
  Übergang. Zugeklappt sind sie über `visibility:hidden` aus Tab-Reihenfolge und
  Vorlesehilfe heraus; die Sichtbarkeit springt erst nach den 260 ms.
- **Scrollverhalten.** Zurückgesetzt wird nur beim Öffnen des Blattes
  (`_chResetScroll`). Ein Schalter behält die Position (Rerender sichert und
  schreibt sie zurück), ein Kachelwechsel rendert gar nicht neu und holt die
  geöffnete Kachel 300 ms später in Sicht — nie höher als bis zu ihrem eigenen
  Kopf, sonst schöbe eine lange Kachel ihren Titel aus dem Bild.
- **`_crCurrent()` wird EINMAL je Renderlauf gerechnet** und an `_chKzWeek()` und
  `_chReportHTML()` durchgereicht. Ohne das liefe die Rechnung über alle
  Einheiten bei jedem Schalter zweimal.
- **Kein Alias für die alten Kennungen.** `openCoachHub('report'/'settings')`
  wurde an den drei App-Aufrufstellen auf `'week'`/`'scope'` umgestellt; zwei
  Vokabulare nebeneinander wären die teurere Lösung gewesen.

### Bewegung (verbindlich aus der Spec)

`grid-template-rows: 0fr → 1fr`, `260ms cubic-bezier(.22,.61,.36,1)` —
nachgemessen über `getComputedStyle`, `max-height` bleibt `none`.
Inhalt: `chRow`, 8 px Versatz, je Element 40 ms, fünf Stufen, bewusst **ohne**
`fill-mode` (gleiche Begründung wie bei `.aic.in`: der Ruhezustand ist sichtbar,
damit eine Engine ohne laufende Animation keine leere Fläche hinterlässt).
Lichtstreifen beim Öffnen einmalig über die bestehenden `@keyframes coachSweep`.
`prefers-reduced-motion: reduce` setzt Übergang **und** Verzögerung auf 0 s und
schaltet Streifen und Inhaltsversatz ab.

### Die Kennzahlen (Gestaltungsregel 8)

| Kachel | zugeklappt | ohne Datenlage |
| --- | --- | --- |
| Gespräch | „2 Nachrichten" | „noch kein Gespräch" |
| Woche | „11.520 kg ↑ 106 %" (Einheit am Wert, `_csWeight`) | „diese Woche noch nichts" |
| Persönlichkeit | „Nina · Ruhig" | — (immer gesetzt) |
| Umfang und Meldungen | „Ausgewogen" | — (immer gesetzt) |
| Journal | „4 Einträge" | „noch nichts notiert" |

Ohne Vorwoche steht kein Pfeil: eine Steigerung gegen nichts hat niemand
erbracht.

### Neue Suite

`.superpowers/sdd/2026-07-29-live-coach-plan-v2/hub-check.js`, Port **8803**,
Muster `task-17-check.js`, Tipps über echte Zeigerfolgen (`page.click`).
**19 Checks.** Rot-Lauf vor dem Bau: **1/19 PASS** — grün war allein
„Gestaltungsregel 1", die schon vorher galt und weiter gelten muss.
Nach dem Bau: **19/19 PASS**.

Deckt die zehn Zeilen der Testfall-Tabelle des Plans ab, dazu: Kennzahl ohne
Datenlage, `renderCoachHub()` als no-op bei geschlossenem Blatt, der
`_chHoldBody`-Wächter (erster Tipp nach dem Namensfeld), die Verlinkung des
bestehenden Chats, lbs, Zweisprachigkeit, und drei statische Prüfungen
(alte Struktur restlos weg, `persist()`/keine Emojis/`try`-`catch`,
`_chOpen`-Rücksetzung beim Kontowechsel).

### Migrierte Suiten — jede Zusicherung trifft dieselbe Aussage auf der neuen Struktur

| Suite | Was migriert wurde |
| --- | --- |
| `task-9-check.js` (20) | „vier Reiter mit Text" → „fünf Kacheln mit Titel, Kennzahl, Inhalt, immer genau eine offen"; `#ch-body`-Abfragen auf die jeweilige Kachel eingegrenzt (alle fünf stehen jetzt gleichzeitig im DOM, `<b>` gehört den Ton- und Profilkarten zu Recht); Sprachprüfung auf die fünf Kacheltitel plus Unterzeile; `HUB_TR_KEYS` um die vier neuen Schlüssel ergänzt, `Chat`/`Einstellungen` entfernt |
| `task-10-check.js` (46) | Übergabe der Einrichtung: `_chTab==='settings'` → `_chOpen==='scope'` **und** Kachel aufgeklappt; Scroll-Check auf das Akkordeon übersetzt (Schalter hält die Position, Kachelwechsel holt in Sicht); **Triage 4** (Regel 7) von „Reiter sehen aus wie Chips" auf „Segmented Control ist ersatzlos weg (keine Klassen, keine `role=tab*`) und die Kachel bringt keine eigene Optik mit" — verglichen gegen eine `.ch-jrn`-Probe (Rahmen, Füllung) und `.ch-preset` (Radius) im selben Sheet |
| `task-21-check.js` (22) | `hubWoche()` tippt `#ch-h-week` statt `#ch-tab-report`; `HUBTEXT` misst `#ch-card-week`; Meldungs-Tipp verlangt zusätzlich die **aufgeklappte** Kachel; „kein fünfter Reiter" → „fünf Kacheln, kein Segmented Control" |
| `task-22-check.js` (24) | `hubAuf()` tippt `#ch-h-<id>`; alle `#ch-body`-Lesungen auf `#ch-card-scope`/`-journal`/`-week` eingegrenzt; Regel-1-Check zählt Kacheln statt Reiter |
| `block5-fix-check.js` (28) | `_chTab='report'` → `_chOpen='week'`; M3 prüft `_chOpen==='chat'` nach dem Kontowechsel; M1 misst die Wochen-Kachel |
| `task-19-check.js` (27) | `openCoachHub('settings')` → `'scope'`, Zeigerklicks auf Elemente der Scope-Kachel (vorher hätte der Klick auf eine zugeklappte Fläche gezielt) |
| `block3-fix-check.js` (21), `task-17-check.js` (23), `lang-check.js` (4) | unverändert, laufen grün |

Gelöscht wurde keine Prüfung.

### Testzahlen

| | vorher (rot) | nachher |
| --- | --- | --- |
| `node --test test/*.js` | 574 | **574** |
| `hub-check` | 1/19 | **19/19** |
| `task-9` | 12/20 | **20/20** |
| `task-10` | 41/46 | **46/46** |
| `task-21` | — | **22/22** |
| `task-22` | — | **24/24** |
| `block5-fix` | — | **28/28** |
| `task-19` | — | **27/27** |
| `task-17` | 23/23 | **23/23** |
| `block3-fix` | 21/21 | **21/21** |
| `lang-check` | 4/4 | **4/4** |

### Nicht angefasst

`APP_VERSION`, `CACHE` in `sw.js`, `CHANGELOG`, `firestore.rules`, der Chat
(`ov-ai-chat`), die Blase, `js/coach-charts.js` (wird in Task 3 eingehängt),
`_chReportHTML` inhaltlich (Diagramme und der Wegfall von „Wochen in Folge"
gehören zu Task 3), die Tonkarten (der Regler kommt in Task 4).

### Anmerkung zum Commit

Ein Autosync-Job auf diesem Rechner hat den Arbeitsstand während des Baus
mehrfach selbst committet und gepusht (`autosync: rechner 2026-07-31 11:42`
bis `12:19`, Endstand `528eef1`). Nichts davon wurde umgeschrieben, kein
force-push. Der Code der Task liegt damit in dieser Commit-Kette; dieser Bericht
ist der eigene, benannte Commit der Task.

### Offene Punkte für die Review am Ende

- Die Kachelinhalte stehen alle fünf im DOM. Das ist für den Übergang nötig,
  heißt aber: `renderCoachHub()` baut bei jedem Schalter alle fünf neu. Gemessen
  bei acht Wochen Verlauf unauffällig; mit den vier Diagrammen aus Task 3 ist die
  Trennung „Markup immer, Zeichnen nur bei offener Kachel" bindend.
- `visibility:hidden` hält zugeklappte Inhalte aus der Tab-Reihenfolge. Ein
  echtes `inert` wäre sauberer, existiert in der App aber nirgends sonst.

---

## Task 3 — Die Wochenkachel bekommt Diagramme und das Kraftziel

**Stand: fertig.** Node 574/574, alle zehn Browser-Suiten grün (255 Checks).

### Das Modul ist eingehängt

`js/coach-charts.js` hängt jetzt an allen drei Stellen: `<script>`-Tag in
`index.html` (nach `coach-report.js`, vor Chart.js — die Reihenfolge zu Chart.js
ist frei, das Modul zeichnet nicht), Kopierliste in `build.js`, `SHELL`-Precache
in `sw.js`. **`CACHE` in `sw.js:2` unangetastet** (eigener Check, und
`task-22-check` prüft es ohnehin).

### Die vier Bereiche

| Bereich | Kennung | Quelle | Entfällt, wenn |
| --- | --- | --- | --- |
| Kennzahlen | `#chw-nums` | `CoachReport.weekNumbers` (laufende Woche und Vorwoche) | nie — steht immer |
| Acht Wochen Volumen | `#chw-vol` | `S.coachReports` + laufende Woche → `volumeBars` | unter zwei Wochen (`MIN_BARS`) |
| Muskelverteilung | `#chw-mus` | `weekNumbers().muscles` → `muscleBars` | unter zwei Gruppen |
| Bestwert-Verlauf | `#chw-1rm` | `_crHistory` + `goalForecast` → `oneRmLine` | kein Ziel **oder** keine Prognose |

Jeder Bereich ist ein eigener Knoten mit Überschrift **und** Diagramm: fällt er
weg, fällt die Überschrift mit weg. Kein leerer Rahmen, keine Achse ohne Daten.

**Aus dem Bericht geflogen (Gestaltungsregel 8):** „Wochen in Folge" — die Zahl
steht schon im Heute-Tab und in der `hwStreak`-Kachel. Die Zeile „Gegenüber der
Vorwoche" ebenfalls: der Vergleich hängt jetzt als Pfeil und Prozent an jeder
der drei Kennzahlen, wo er hingehört. `_crDeltaText()` ist damit entfallen.
Die Schwerpunkte-Liste ist durch das Diagramm ersetzt — nicht ergänzt.

### Entscheidungen, die im Auftrag offen waren

- **Konfiguration beim Rendern, Zeichnen beim Öffnen.** `_chReportHTML()` baut
  die drei Chart.js-Konfigurationen (dort liegt der Wochenstand ohnehin vor) und
  legt sie in `_chWeekCfg` ab; `_chWeekDraw()` erzeugt daraus die Instanzen.
  Damit bleibt `coachHubOpen()` renderfrei — sonst stürbe der CSS-Übergang der
  Kachel, wie in Task 2 festgehalten.
- **Drei Aufräumpunkte, nicht einer.** `_chWeekDestroy()` läuft (1) beim
  Schließen der Kachel, (2) **vor** jedem `innerHTML`-Austausch in
  `renderCoachHub()` — sonst blieben die Instanzen der weggeworfenen
  Zeichenflächen als Karteileichen im Chart.js-Register stehen — und (3) in
  `closeOv('ov-coach-hub')`, dem einzigen Punkt, den alle Schließwege
  (✕, Hintergrund-Tipp, Swipe-Dismiss, Sprung in den Chat) durchlaufen.
- **Die Balken kommen aus dem Berichtsarchiv**, nicht aus den Einheiten — wie im
  Auftrag verlangt und aus demselben Grund, aus dem die Liste „Frühere Wochen"
  darunter dieselbe Quelle nimmt: zwei Quellen für dieselben acht Zahlen liefen
  bei einer nachträglich geänderten Einheit auseinander. **Folge, bewusst in
  Kauf genommen:** wer acht Wochen trainiert hat, aber noch keine Berichte im
  Archiv hält, sieht kein Volumendiagramm. Das deckt sich mit „Frühere Wochen",
  ist also nicht widersprüchlich, sondern nur zurückhaltend.
- **Werte gehen in der Anzeigeeinheit ins Modul** (`kgToDisp`), `opts.unit`
  beschriftet. Das Modul rechnet nichts um — auch die Zielzahl der Trendlinie
  geht als `{goalKg: kgToDisp(fc.goalKg), weeks: fc.weeks}` hinein, damit der
  Endpunkt exakt auf dem eingegebenen Wert landet.
- **`opts.reduceMotion`** kommt aus `_chReduceMotion()` (`matchMedia`), weil das
  Modul die Medienabfrage nicht selbst lesen darf.
- **Der gedämpfte Balken** ist `rgba(120,120,128,.34)` — das Neutralgrau der
  Diagrammraster (`rgba(120,120,128,.08)`) in kräftigerer Deckung, kein neuer
  Farbton. Als `_CH_MUTED` an einer Stelle.
- **Textfassung für die Vorlesehilfe.** Eine Zeichenfläche ist für Screenreader
  stumm; jedes Diagramm trägt `role="img"` und ein `aria-label` aus seinen
  eigenen Daten (`_chChartAlt`). Das ist auch der Grund, warum die migrierten
  Suiten die Muskelnamen weiter finden.

### Das Kraftziel

`ex.targetWeight` — kein neues Feld, kein neuer Schreibpfad, kein Firestore.

- `coachSetGoal(exId, kgDisp)` nimmt die **Anzeigeeinheit** und speichert über
  `dispToKg()`. Untergrenze ist `_chGoalIst()` (bestes `CoachReport.epley1rm`
  dieser Übung); darunter wird abgelehnt, und der Hinweis **nennt die Zahl** —
  „zu klein" allein wäre keine Auskunft. Der Hinweis überlebt den Rerender
  (`_chGoalHint`), damit er nicht als Toast vorbeihuscht.
- **Genau eines gleichzeitig:** ein neues Ziel setzt alle anderen
  `targetWeight` auf 0. Es geht nichts verloren — sie standen ohnehin alle auf 0.
- `coachClearGoal()` setzt alles auf 0; der Verlauf verschwindet, die Zeile
  „Ziel setzen" steht wieder da.
- **Vorgeschlagene Übung:** die mit den meisten Arbeitssätzen der letzten acht
  Wochen (Aufwärmsätze zählen nicht). Danach folgen alle übrigen Übungen in
  einer waagerecht rollenden Chip-Reihe — „eine andere wählen" darf nicht an
  einer Vorauswahl enden.
- **Kein Fremdtext im inline `onclick`:** gewählt wird über den **Index** in
  `_chGoalCandidates()`, nicht über die Übungskennung. Die Kennung kommt aus
  Cloud oder Import; ein Apostroph darin würde den Aufruf verlassen. Dieselbe
  Bauart wie `_chJrnRow()`.

### Bewegung

Balken wachsen von unten, je Balken 30 ms versetzt (aus dem Modul); die
Kennzahlen zählen beim Öffnen in 400 ms hoch (`_chWeekCountUp`, kubische
Abbremsung). Der **Ruhezustand ist der Endwert** — er steht im Markup, die
Animation überschreibt ihn nur vorübergehend. `prefers-reduced-motion: reduce`
schaltet beides ab: die Chart.js-Animation über `opts.reduceMotion`, das
Hochzählen über eine frühe Rückkehr.

### Testzahlen

| | vorher (rot) | nachher |
| --- | --- | --- |
| `node --test test/*.js` | 574 | **574** |
| `hub-check` (Task 2 + 3) | 21/36 | **38/38** |
| `task-21` | 20/22 | **22/22** |
| `task-9` / `task-10` / `task-22` / `block5-fix` | 20 / 46 / 24 / 28 | **20 / 46 / 24 / 28** |
| `task-17` / `task-19` / `block3-fix` / `lang-check` | 23 / 27 / 21 / 4 | **23 / 27 / 21 / 4** |

Neu in `hub-check.js`: 19 Prüfungen (Registrierung, Instanzen vor/beim/nach dem
Öffnen, Aufräumen beim Schließen des Blattes, Balkenfolge und Akzent der
laufenden Woche, Kennzahlen mit drei Pfeilen und ohne Streak, Muskeldiagramm mit
Pflichthinweis, dünnes Profil ohne jeden Diagrammbereich, kein Pfeil ohne
Vorwoche, „Ziel setzen" ohne Ziel, Ablehnung unterhalb des Maximums, Trendlinie
exakt auf dem Ziel, genau ein Ziel gleichzeitig, Entfernen, Übungsauswahl per
echtem Tipp, `esc()` am Übungsnamen, lbs auf Text und Achse, reduzierte
Bewegung).

Migriert in `task-21-check.js`: die Wochenprüfung liest die Muskelnamen jetzt
aus der **Chart-Konfiguration** und dem `aria-label` statt aus dem Fließtext —
das prüft die Zahlen, die wirklich gezeichnet werden, statt nur eine
Zeichenkette. Die Zusicherung „ohne Vorwoche keine erfundene Steigerung" trifft
jetzt die Pfeile der Kennzahlen; „Wochen in Folge" wird als **abwesend** geprüft.

### Nicht angefasst

`APP_VERSION`, `CACHE` in `sw.js`, `CHANGELOG`, `firestore.rules`, der Chat, die
Blase, die Heute-Karte (Task 4), die Tonkarten (Task 4).

### Anmerkung zum Commit

Wie bei Task 2 hat der Autosync-Job den Arbeitsstand während des Baus selbst
committet und gepusht (bis `6a6b59e`). Nichts umgeschrieben, kein force-push;
dieser Bericht ist der benannte Commit der Task.

### Offene Punkte für die Review am Ende

- Das Volumendiagramm hängt am Berichtsarchiv (s. oben). Wer die App frisch
  installiert und alte Einheiten importiert, sieht es erst nach zwei
  Berichtsterminen.
- `_chWeekNumsHTML()` rechnet die Vorwoche über einen zweiten
  `CoachReport.weekNumbers()`-Lauf; zusammen mit `_crCurrent()` sind das zwei
  Durchläufe über alle Einheiten je Renderlauf des Hubs. Bei den geprüften
  Beständen unauffällig, aber der teuerste Posten dieser Kachel.
- Die Zieleingabe ist bewusst kein eigenes Blatt („alles auf einem Beleg"). Bei
  sehr vielen Übungen wird die Chip-Reihe lang; sie rollt waagerecht.

---

## Task 4 — Ton-Regler, Heute-Karte, Volumenbalken ohne Archiv

**Stand: fertig. Der Bau ist durch.** Node 574/574, alle zehn Browser-Suiten
grün (270 Checks).

### 4a — Der Ton-Regler

Ersetzt die vier `.ch-preset.ch-voice`-Karten in der Kachel `persona`
(die Coach-Einrichtung behält ihre Karten — sie ist nicht Teil dieses Umbaus).

- Vier Rastpunkte in der Reihenfolge aus `_CH_TONES` (deckungsgleich mit
  `CoachPersona.TONES`). Geschrieben wird ausschließlich über das bestehende
  `setAiCoachOpt('tone', …)` — kein zweiter Schreibweg.
- **Der Griff folgt dem Finger ungerundet** (`.cts.drag` schaltet den Übergang
  ab) und rastet beim Loslassen in 180 ms ein.
- **Der Beispielsatz wechselt während des Ziehens.** `_chToneVisual()` zieht
  Griff, Füllung, Rastpunkte, Beschriftungen, `aria-valuenow`,
  `aria-valuetext` und den Satz ohne Rerender nach.
- **Echte Zahlen:** `_chToneSayVars()` nimmt das schwerste Gewicht der letzten
  Einheit, dessen Wiederholungen und die Satzzahl dieser Einheit. Liegt keine
  Einheit vor, steht dort **kein** Satz, sondern der Hinweis, dass er nach dem
  ersten Training kommt — erfundene Demowerte auf der Vertrauensfläche waren in
  diesem Projekt schon ein Befund. Die Einheit hängt über `_csWeight()` am Wert.
- **Tastatur:** `role="slider"`, `tabindex="0"`, Pfeile links/rechts/oben/unten
  plus Home/End. Nach dem Schreiben rendert der Hub neu und ersetzt den Knoten
  — der Fokus wird deshalb ausdrücklich zurückgeholt, sonst wäre er nach dem
  ersten Tastendruck weg.

**Zwei Fallstricke, die im Bau aufgefallen sind:**

1. **`_chHoldBody` hält während der Geste.** Derselbe Wächter, der seit Task 9
   den ersten Tipp nach dem Namensfeld rettet — hier aus demselben Grund: ein
   Rerender mitten in der Geste nähme den Regler aus dem DOM und die
   Zeigererfassung liefe ins Leere. Gegen einen hängenden Wächter (wenn
   `setPointerCapture` scheitert und der Finger daneben loslässt) hängt
   zusätzlich ein `pointerup`/`pointercancel`-Netz am `window`.
2. **Der Rerender wartet 190 ms.** Der Zustand steht schon (jeder Wechsel des
   Rastpunkts schreibt sofort); würde direkt beim Loslassen gerendert, ersetzte
   das den Knoten und die 180 ms Einrasten wären nie zu sehen.

### 4b — Die Heute-Karte

Drei Zonen in **einem** Rahmen, `.aic` bleibt die einzige Karte im Heute-Tab.

| Zone | Inhalt | Quelle |
| --- | --- | --- |
| links | Ring der **nächsten fälligen Muskelgruppe** + ihr Name darunter | `_aicNextMuscle()` über `getMuscleGroupRecovery()`, Beschriftung `muscleLabel()` |
| rechts, Zeile 1 | Volumen der laufenden Woche mit Pfeil und Prozent | `_aicWeek()` über `CoachReport.weekNumbers` |
| rechts, Zeile 2 | was heute ansteht | `s.head` aus `_coachTodaySuggestion()` |
| darunter | ein Satz vom Coach im gewählten Ton | `_aicSay()` über `_say('debrief'/'returnNudge', …)` |
| unten | CTA „Training starten" | unverändert |

- „Nächste fällige" heißt: die am weitesten erholte Gruppe **mit**
  Trainingsspur. 100 % ohne je trainiert zu haben ist keine Auskunft.
- Der Coach-Satz hat zwei belegbare Lagen: liegt die letzte Einheit zwei Tage
  oder länger zurück, zählt er die Tage (`returnNudge`); sonst spricht er über
  die letzte Einheit (`debrief`). Gibt es weder das eine noch das andere, steht
  dort kein Satz.
- **`_aicSig` trägt jetzt alle neuen Werte**: `kind`, `head`, `chip2`,
  Gruppenname, Erholung, Wochenzeile, Coach-Satz, Coach-Name **und**
  `unitLabel()`. Genau hier ist in Task 8 ein Fehler entstanden; ein Ton- oder
  Einheitenwechsel hätte die Karte sonst eingefroren.
- Der `closest('button, a')`-Wächter, `role`/`tabindex`/`aria-label` auf
  `.aic-top` und der Enter-Zugang bleiben unverändert.
- **Weggefallen:** der zweite, graue Chip (`ringLbl` + Prozent) — die Zahl steht
  jetzt im Ring, und die Beschriftung darunter. Der Readiness-Chip
  („Deload aktiv") bleibt. `s.text` weicht dem Coach-Satz.

### 4c — Volumenbalken ohne Berichtsarchiv

`_chWeekBarData()` läuft die letzten acht Kalenderwochen ab und entscheidet je
Woche:

1. **Bericht im Archiv → sein Wert. Immer.** Dieselbe Quelle wie die Liste
   „Frühere Wochen" darunter; zwei Zahlen für dieselbe Woche im selben Blatt
   liefen auseinander, sobald jemand eine Einheit nachträglich ändert.
2. **Kein Bericht → aus den Einheiten gerechnet** (`CoachReport.weekNumbers`
   über `CoachReport.weekStart`).

In der Oberfläche steht davon nichts — für den Nutzer ist beides dasselbe,
nämlich das Volumen dieser Woche. Die Rangfolge und ihr Grund stehen im Code.

Wochen **vor** der allerersten Einheit entfallen (ein Balken auf 0, bevor es den
Nutzer gab, wäre eine erfundene Pause); eine trainingsfreie Woche **mittendrin**
bleibt als 0 stehen — eine Pause ist eine Aussage. Der Zwischenstand der
laufenden Woche zählt wie ein Bericht.

Damit ist das Bedenken aus Task 3 aufgelöst: die Kachel ist ab der zweiten
Trainingswoche gefüllt, nicht erst nach zwei Monaten.

### Testzahlen

| | vorher (rot) | nachher |
| --- | --- | --- |
| `node --test test/*.js` | 574 | **574** |
| `hub-check` (Task 2–4) | 41/55 | **55/55** |
| `task-9` | 17/20 | **20/20** |
| `task-10` / `task-17` / `task-19` / `task-21` / `task-22` | 46 / 23 / 27 / 22 / 24 | **46 / 23 / 27 / 22 / 24** |
| `block3-fix` / `block5-fix` / `lang-check` | 21 / 28 / 4 | **21 / 28 / 4** |

Neu in `hub-check.js`: 17 Prüfungen (Regler steht und ersetzt die Karten;
Ziehen über alle vier Rastpunkte schreibt den Ton **als String** mit
mitziehendem `aria-valuenow`/`aria-valuetext`; vier verschiedene Sätze, auch
schon während des Ziehens; Pfeiltasten bewegen, schreiben und behalten den
Fokus; reduzierte Bewegung rastet ohne Übergang; Ring zeigt Gruppenname und
Erholung; Wochenzeile gegen `weekNumbers` gerechnet; Coach-Satz vorhanden,
platzhalterfrei und tonabhängig; CTA startet das Training ohne den Hub zu
öffnen; Tipp daneben und Enter öffnen ihn; Umbenennen und Tonwechsel zeichnen
neu; lbs ohne kg-Zahl; Regel 1; leeres Archiv liefert trotzdem Balken;
Archivwert schlägt Rechnung; leere Woche steht als 0).

Migriert in `task-9-check.js`: die drei Prüfungen, die an den Tonkarten hingen
(vier verschiedene Sätze, erster Tipp nach dem Namensfeld, englische Tonsätze) —
sie treffen jetzt dieselben Zusicherungen am Regler, und die englische Prüfung
vergleicht gegen `_chToneSayVars()` statt gegen feste Demowerte.

### Nicht angefasst

`APP_VERSION`, `CACHE` in `sw.js`, `CHANGELOG`, `firestore.rules`, der Chat, die
Blase, die Coach-Einrichtung (behält ihre Tonkarten).

### Offene Punkte für die Review

- Der Regler schreibt bei jedem Wechsel des Rastpunkts, also bis zu dreimal
  während einer Geste über alle vier — jedes Mal mit `persist()`. Bewusst so:
  der Zustand darf nie zwischen zwei Punkten hängen. Der Rerender ist während
  der Geste ausgesperrt, der Schreibweg selbst nicht.
- `_aicWeek()` rechnet zwei `weekNumbers()`-Läufe je `renderHome()`. Zusammen
  mit dem Hub sind das die teuersten Stellen des Umbaus; bei den geprüften
  Beständen unauffällig.
- Die Heute-Karte zeigt das Wochenvolumen — dieselbe Zahl steht in der
  Wochenkachel. Das ist gewollt (die Karte ist der Anreiß, die Kachel die
  Auskunft) und war die ausdrückliche Wahl in der Spec, verletzt aber dem
  Buchstaben nach Regel 8 „jede Zahl muss etwas sein, das der Nutzer sonst
  nicht sieht". Wenn die Review das anders sieht, ist die Zeile der Kandidat.
- `.aic-head` trägt jetzt die Wochenzeile statt der Überschrift; wer den
  Selektor anderswo als „Überschrift" liest, liest jetzt eine Zahl.

---

## Nachtrag — sichtbarer Einstieg auf der Karte, Kacheln als Raster

Zwei Korrekturen am Aussehen, nachdem der Nutzer den gebauten Hub gesehen hat.
Die Struktur aus den Tasks 2–4 bleibt unverändert.

### 1. Die Karte sieht jetzt aus wie eine Tür

- Die Zeile mit dem Coach-Namen trägt rechts einen Pfeil (`ICO.chevronRight`,
  neu). Ein Symbol aus `ICO`, kein Zeichen aus der Schrift; `aria-hidden`, weil
  die Vorlesehilfe ihre Auskunft schon über das `aria-label` auf `.aic-top`
  bekommt. Er steht in **beiden** Kartenfassungen, auch in der schmalen ohne
  Tagesempfehlung.
- Die Karte bekommt einen Druckzustand (`.aic.press`, `scale(.985)`, der Pfeil
  rutscht 2 px mit). Gesetzt wird er in `_aicCardTap()` per `pointerdown` und
  **nicht** über `:active`: `:active` greift auch auf Vorfahren des gedrückten
  Elements, die Karte wäre also mitgeschrumpft, wenn der Nutzer „Training
  starten" drückt — genau die Fläche, die der `closest('button, a')`-Wächter
  ausnimmt. Losgelassen wird auf `pointerup`, `pointercancel` und
  `pointerleave`, sonst bliebe die Karte eingedrückt stehen.
- `transition` der `.aic` für `transform` von .24 s auf .13 s: ein Druck, der
  240 ms braucht, liest sich als Verzögerung, nicht als Reaktion. Das Ein- und
  Ausblenden (`opacity`) bleibt bei .24 s.
- Gestaltungsregel 1 gilt weiter und wird geprüft: genau **ein** Coach-Einstieg
  im Heute-Tab (`#pg-heute [onclick*="openCoachHub"]`), eine `.aic`-Karte, zwei
  Flächen unter der Kopfzeile.

### 2. Die Kacheln sind ein Raster

- `#ch-body` trägt zwei Spalten; zugeklappt ist jede Kachel ein annähernd
  quadratisches Feld (169 × ~114 px bei 390 Breite) mit **Symbol, Titel und
  Kennzahl** untereinander. Symbole: `chatBubble`, `chart2`, `sparkle`, `gear`,
  `book` (neu in `ICO`).
- Ein Tipp lässt die Kachel über **beide Spalten** aufwachsen; die anderen vier
  bleiben sichtbar und rücken nach. Offen wechselt der Kopf zurück in die
  Zeilenform, damit der Inhalt nicht unter einem hohen, halb leeren Kasten
  klebt.
- **Die fünfte Kachel bekommt die volle Breite** (`:last-child:nth-child(odd)`).
  Begründung: eine halbe Kachel neben einer leeren Zelle wäre das einzige Loch
  im sonst dichten Raster, und ein Loch liest sich als „hier fehlt etwas". Die
  Regel ist allgemein formuliert und greift bei jeder ungeraden Anzahl.
- **Kennzahlen brechen um statt abzuschneiden**: `white-space:normal`,
  `overflow-wrap:anywhere`, kein `text-overflow`. Geprüft mit einem langen Namen
  („Alexandragabriel · Sachlich") über `scrollWidth <= clientWidth` und die
  Zeilenzahl aus Höhe ÷ Zeilenhöhe.

**Zwei Dinge, die beim Bau nachgemessen und nicht vermutet wurden:**

1. **Kein CSS-Grid, sondern `flex-wrap`.** Als Rasterzelle muss der Browser die
   Höhe der Kachel vorab bestimmen; dabei fällt der Aufklapp-Übergang im
   Inneren (`grid-template-rows: 0fr → 1fr`) auf null zusammen. Gemessen: die
   offene Kachel blieb 110 px hoch, während ihr Inhalt 352 px maß und
   abgeschnitten wurde — inklusive des Ton-Reglers, der dadurch nicht mehr
   bedienbar war. Mit `display:flex; flex-wrap:wrap` und
   `flex-basis: calc(50% - 5px)` bzw. `100%` stimmt beides.
2. **Der Spaltenwechsel animiert über FLIP.** `grid-column`/`flex-basis`-Sprünge
   animieren nicht von selbst. `_chFlip()` misst die Lage aller fünf Kacheln vor
   der Umschaltung, wirft sie danach per `transform` auf die alte Lage zurück
   und lässt sie in 260 ms `cubic-bezier(.22,.61,.36,1)` auf die neue laufen.
   Die dabei entstehende Verzerrung hebt der neue innere Knoten `.ch-card-i`
   mit der Kehrskalierung exakt wieder auf — sonst wäre die Schrift der
   aufwachsenden Kachel während des Übergangs gestaucht. Die **Höhe** bleibt
   Sache des bestehenden `grid-template-rows`-Übergangs: zum Messzeitpunkt ist
   die Kachel noch flach, die Höhe wächst danach von selbst, und die anderen
   Kacheln folgen dem Layout. Bei `prefers-reduced-motion: reduce` entfällt der
   ganze Griff.
3. **Diagramme messen nach dem Übergang noch einmal nach.** Gezeichnet wird im
   Moment des Tipps — da ist die Kachel noch eine halbe Spalte breit. Der
   Beobachter von Chart.js zieht nicht zuverlässig nach, während gleichzeitig
   eine FLIP-Transformation läuft; ein `resize()` 320 ms später schließt die
   Lücke.

**Unverändert:** genau eine Kachel offen, erneuter Tipp schließt sie,
Scroll-Rettung, `_chHoldBody`, frühe Rückkehr bei geschlossenem Blatt,
`prefers-reduced-motion` auf 0 ms, Zeitkurve 260 ms `cubic-bezier(.22,.61,.36,1)`.

### Testzahlen

| | vorher (rot) | nachher |
| --- | --- | --- |
| `node --test test/*.js` | 574 | **574** |
| `hub-check` | 57/62 | **62/62** |
| `fix-check` | 14/14 | **14/14** |
| `task-9` | 20/20 | **20/20** |
| `task-10` | 46/46 | **46/46** |

Neu in `hub-check.js`: sechs Prüfungen (Einstiegs-Pfeil als ICO-Symbol in der
Namenszeile bei genau einem Coach-Einstieg; Druckzustand auf der Karte, nicht
auf dem CTA; zwei Spalten mit zwei Kacheln je Reihe; Symbol, Titel und Kennzahl
ohne Abschnitt und mit Umbruch; volle Breite für die alleinstehende fünfte;
offene Kachel über beide Spalten bei sichtbar bleibenden anderen).

### Belege

`.superpowers/sdd/2026-07-31-coach-hub-umbau/` — `raster-zu.png`,
`raster-woche.png`, `raster-ton.png`, `raster-karte.png`, erzeugt von
`raster-shots.js` (390×844, dunkles Thema, Coach „Nina", Premium erzwungen,
Port 8805).

### Anmerkung zum Belegskript

`raster-shots.js` stellt für den Aufbau des Bestands die Uhr fest („Mittwoch
dieser Woche") und **lässt sie danach wieder los**: Chart.js rechnet seine
Animationen über `Date.now()`, und mit stehender Uhr blieben die Balken auf
Höhe 0 — der erste Beleg zeigte Achsen ohne Balken. Ein Harness-Artefakt, kein
Fehler der App (gegengeprüft mit laufender Uhr über dieselbe Zeigerfolge).

### Offene Punkte

- Die Kacheln einer Reihe sind gleich hoch (`align-items:stretch`), die Reihen
  untereinander nicht — eine Kennzahl, die umbricht, macht ihre Reihe höher.
  Bewusst so: eine feste Höhe für alle schnitte die umbrechende Kennzahl ab.
- Beim Öffnen einer Kachel bleibt im Raster eine halbe Zelle frei, wenn die
  offene Kachel an ungerader Position steht. `grid-auto-flow: dense` hätte das
  gefüllt, aber die Lesereihenfolge von der DOM-Reihenfolge abgekoppelt; für
  fünf selbsterklärende Kacheln war mir die freie Zelle das kleinere Übel.
- `_chFlip()` läuft bei jedem Kachelwechsel über fünf Elemente mit je zwei
  erzwungenen Layouts. Bei 390 × 844 unauffällig gemessen, aber es ist die
  teuerste Stelle des Nachtrags.
