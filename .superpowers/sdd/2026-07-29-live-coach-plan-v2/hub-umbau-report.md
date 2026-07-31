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
