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
