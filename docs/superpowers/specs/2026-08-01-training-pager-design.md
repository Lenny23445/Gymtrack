# Training-Pager — hartes Seiten-Scrollen statt weiches Einrasten

**Datum:** 2026-08-01
**Ersetzt:** `2026-07-31-workout-fokus-modus-design.md` (dort ausdrücklich „Scroll-Snap + Fokus,
kein Pager") — genau dieses Verhalten wird hier abgelöst.
**Betrifft:** `index.html` (Trainings-Sheet `#ov-wk`, Schritt 2), neu `js/workout-pager.js`
und `test/workout-pager.test.js`

## Problem

Das Trainings-Sheet ist heute **ein einziger Scroller**. Er enthält Kopf, Trainingszeit-Leiste,
den klebenden Stapel aus Coach-Leiste und Pausenbalken, alle `.ex-card`, das Notizfeld und drei
Abschluss-Buttons. Das Einrasten läuft über `scroll-snap-type: y proximity` mit
`scroll-snap-align: center`, einem gerechneten `scroll-padding-top` (`--wk-snap-pad`) und einer
JS-Nachrast-Schleife (`_wkSettle()`), die 180 ms nach dem Stillstand nachräumt.

Daraus folgen die Beschwerden:

1. **Kein verlässliches Verhältnis Wisch → Übung.** `proximity` lässt den Schwung durchlaufen;
   ein kräftiger Wisch überspringt zwei oder drei Übungen, ein zaghafter bleibt zwischen zweien
   stehen. Erst das Nachrasten räumt auf — sichtbar als Nachschlagen.
2. **Nichts steht fest.** Übungsname und Ziel scrollen mit aus dem Bild. Wer bei Satz 4 ist,
   sieht nicht mehr, welche Übung er macht.
3. **Inhalt verschwindet.** Die Tabbar (`z-index: 1000`) liegt über dem Sheet-Unterrand.
   Der letzte Satz, der „+ Satz"-Button und die Coach-Vorschlagskarte rutschen darunter.
4. **Hitze und Zittern.** `--wk-snap-pad` wird bei jeder Höhenänderung der Coach-Leiste neu
   geschrieben; jede Änderung von `scroll-padding` zwingt WebKit, die Rastpunkte des ganzen
   Blattes neu zu rechnen. Parallel misst die Fokus-Schicht alle Kartenboxen nach.

## Ziel

Ein Wisch bewegt genau eine Übung weiter — nie mehr, nie weniger. Die aktive Übung steht fest
im Bild, mit Kopf und Ziel. Coach-Leiste, Pausenbalken und Vorschlagskarte sind immer sichtbar.
Nichts liegt je unter der Tabbar.

## Ansatz

Natives CSS-Snapping auf bildschirmhohen Seiten:
`scroll-snap-type: y mandatory` + `scroll-snap-stop: always`.

`scroll-snap-stop: always` ist der entscheidende Teil: es verbietet dem Schwung, einen Rastpunkt
zu überspringen. Ein Wisch = eine Seite, unabhängig von der Wucht. Das ist dasselbe Verfahren,
das native Pager benutzen — mit dem echten Momentum und der echten Gummikante von WebKit.

Verworfen: ein JS-Pager mit `transform: translateY(-i * 100%)` und eigenen Touch-Handlern. Er
ersetzt das native Momentum durch eine Nachbildung, kollidiert mit dem waagerechten
Wisch-zum-Löschen auf derselben Fläche und kostet ein Vielfaches an Code.

## Aufbau

Das Sheet hört auf, der Scroller zu sein. In Schritt 2 wird es ein Flex-Spalten-Container mit
fester Kopfzone und genau einem scrollenden Kind.

```
.sheet            overflow:hidden, display:flex, flex-direction:column
                  padding-bottom: var(--wk-tabbar-h)
├─ .sh-handle + .sh-head  „Training", ✕                     fest
└─ #wk-step2      flex:1, min-height:0, display:flex, column
   ├─ .timer-bar  Trainingszeit · Abbrechen · Fertig ✓       fest
   ├─ #wk-sticky  Coach-Leiste + Pausenbalken                fest (nicht mehr sticky)
   ├─ #wk-dots    ● ○ ○ ○   3/7                              fest, tippbar
   └─ #wk-pager   flex:1, min-height:0, overflow-y:auto      DER Scroller
      │           scroll-snap-type: y mandatory
      │           overscroll-behavior: contain
      ├─ .wk-page[data-unit="0"]   height:100%
      │  ├─ .wp-head    Übungsname › · Ziel › · ⇄ · 📈       fest in der Seite
      │  ├─ .wp-coach   Vorschlagskarte des Live-Coaches     fest, wenn vorhanden
      │  └─ .wp-sets    Satz-Zeilen + „+ Satz"               overflow-y:auto
      ├─ .wk-page[data-unit="2"]  …
      └─ .wk-page.wp-end   Notiz · ＋ Übung · Beenden · Abbrechen
```

Kern-Regeln:

```css
#wk-pager      { scroll-snap-type: y mandatory; overscroll-behavior: contain;
                 -webkit-overflow-scrolling: touch; }
#wk-pager.snap-off { scroll-snap-type: none; }
.wk-page       { height: 100%; scroll-snap-align: start; scroll-snap-stop: always;
                 display: flex; flex-direction: column; min-height: 0; }
.wp-sets       { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
```

`overscroll-behavior: contain` auf `.wp-sets` ist Pflicht: sonst reicht der Wisch am Ende der
Satzliste an den Pager durch und blättert ungewollt weiter.

### Der interne Scroll ist Rückfallebene, nicht Normalfall

Leitsatz: **ein Wisch bringt die nächste Übung — sonst nichts.** `.wp-sets` scrollt nur, wenn
der Inhalt wirklich nicht auf die Seite passt. Im Regelfall (bis fünf Sätze, mit oder ohne
Coach-Vorschlagskarte) darf es gar nicht erst dazu kommen; dann ist jeder Wisch auf der Seite
ein Seitenwechsel.

Dafür bekommt die Satzliste die volle Resthöhe der Seite (`flex: 1`) und die Satzzeilen einen
Abstand, der mit der Zahl der Sätze mitgeht: `.wp-sets` trägt `--row-gap`, das ab sechs Sätzen
von 10 px auf 6 px fällt. Die Zeilenhöhe selbst und damit die Tap-Ziele bleiben unverändert —
gekürzt werden nur die Zwischenräume. Reicht auch das nicht (sehr viele Sätze plus offene
Vorschlagskarte auf einem kleinen Gerät), scrollt `.wp-sets`; ein Verlaufsschatten an der
Unterkante zeigt, dass noch etwas kommt.

Nach der Umsetzung wird am Gerät nachgemessen, ab wie vielen Sätzen der interne Scroll
tatsächlich einsetzt — die Zahl gehört in den Prüfbericht, nicht in diese Spec.

### Seitenhöhe und Tabbar

`--wk-tabbar-h` wird aus der echten Höhe der `.tabbar` plus `var(--sab)` gemessen (ein
`ResizeObserver` auf `.tabbar`, geschrieben nur bei echter Änderung) und als `padding-bottom`
am Sheet gesetzt. Damit ist die Seitenhöhe automatisch der Bereich, der nicht verdeckt ist.
Die Tabbar bleibt sichtbar und klickbar — Tab-Wechsel im laufenden Training ist laut bestehendem
Kommentar an `.ov` ausdrücklich gewollt.

### Supersätze

Eine Supersatz-Gruppe (`ssGroup`) ist **eine** Seite. Der Seitenkopf zeigt beide Namen als
„A / B", darunter laufen beide Satzlisten untereinander im internen Scroll der Seite. Das
entspricht dem tatsächlichen Ablauf: man wechselt satzweise zwischen A und B und will dabei
nicht blättern. `.ss-connector` entfällt ersatzlos.

Die Seiten-Einteilung kommt aus `WorkoutFocus.focusUnitOf(wkLogs, li)`, das genau diese
Gruppierung bereits liefert. `data-unit` ist der kleinste `li` der Einheit.

### Umsortieren

Der Griff `⠿` verschwindet aus der Seite. Umsortieren läuft über ein eigenes Sheet
„Reihenfolge", erreichbar aus dem Übungs-Menü (`openExEditMenu`): eine kompakte Liste aller
Übungen, ziehbar, mit Supersatz-Klammern. Grund: Ziehen braucht Übersicht über die Nachbarn,
und die gibt es in einem Pager nicht. Der bestehende Drag-Code (`wkDragStart`) zieht in dieses
Sheet um.

Der waagerechte Wisch zum Löschen bleibt, wo er ist, und wirkt auf die Seite. Während eines
Wischs bekommt der Pager `.snap-off`, wie heute das Sheet.

## Was ersatzlos wegfällt

| Weg | Warum |
|---|---|
| `--wk-snap-pad`, `_wkSyncSnapPad()`, `_wkSnapPadSoon()`, `_wkStickyRO` | Rastpunkte liegen jetzt auf Vielfachen der Seitenhöhe; kein `scroll-padding` mehr nötig |
| `_wkSettle()`, `_wkSettleSoon()`, `_wkSettleT`, `_wkTouching` | `mandatory` rastet selbst; Nachräumen ist gegenstandslos |
| `_wkFocusBoxes`, `_wkFocusTick()`, `_wkFocusDirty`, `WorkoutFocus.pickFocusedStable` | Der Fokus ist der Seitenindex, keine Messung |
| Dimmen der Nachbarn (`.focus-on .ex-card.dimmed`) | Es ist nur eine Seite sichtbar |
| `.ss-connector` (CSS + Markup) | Supersätze sind eine Seite |
| `scroll-padding-top`, `scroll-snap-align: center`, `:first-child { align: none }` | ersetzt durch `align: start` auf gleich hohen Seiten |

`WorkoutFocus.focusUnitOf` und `WorkoutFocus.nextOpenUnit` bleiben und werden weiter benutzt.
`pickFocusedStable` und die zugehörigen Tests in `test/workout-focus.test.js` entfallen.

## Neues Modul `js/workout-pager.js`

Reine Rechnung, kein DOM — damit unter `node --test` prüfbar, wie die übrigen `js/`-Module.
Eingebunden per `<script src="js/workout-pager.js">` in `index.html`, genau wie
`js/workout-focus.js`.

```js
WorkoutPager.pagesOf(wkLogs)        // → [{unit:[li,…], key:<kleinster li>}, …] inkl. Abschluss-Seite
WorkoutPager.pageIndexFor(scrollTop, pageH, count)   // → 0…count-1, geklemmt
WorkoutPager.scrollTopFor(index, pageH)              // → index * pageH
WorkoutPager.pageOfLi(pages, li)                     // → Seitenindex einer Übung
```

`pageIndexFor` rundet (`Math.round`) und klemmt in `[0, count-1]`; bei `pageH <= 0` liefert
sie `0`, damit ein Messfehler nicht zu `NaN` im Scroll führt.

## Anpassungen im bestehenden Code

**`renderLogCards()`** erzeugt Stücke je *Seite* statt je Karte. `_lcApply()` vergleicht
entsprechend über `data-unit` statt `data-li`; die Sonderbehandlung des `.ss-connector`
(`_lcApply`, Zeile ~19364) entfällt.

**Position halten über Neurendern.** `_lcAnker()`/`_lcAnkerHalten()` werden ersetzt durch:
aktiven `data-unit` merken, nach dem Rendern `pager.scrollTop = scrollTopFor(pageOfLi(...), pageH)`
ohne Animation setzen. Nötig, wenn mitten im Training eine Übung gelöscht oder ergänzt wird und
sich die Seitenzahl ändert.

**`_wkAutoAdvance(li)`** behält Logik und die 600 ms Verzögerung, scrollt aber seitenweise:
`pager.scrollTo({ top: scrollTopFor(idx, pageH), behavior: reduce ? 'auto' : 'smooth' })`.
Das Ziel ist exakt ein Rastpunkt, deshalb entfällt der `snap-off`-Trick samt `_wkAdvSnapT`.

**Höhenwechsel der Kopfzone.** Coach-Leiste und Pausenbalken kommen und gehen und fahren ihre
Höhe über 300 ms. Danach ist `pager.clientHeight` ein anderer, und `scrollTop` zeigt zwischen
zwei Seiten. Ein `transitionend`-Handler (und ein `ResizeObserver` auf `#wk-sticky` als
Rückfallebene) setzt `scrollTop` einmalig auf `scrollTopFor(aktiverIndex, neueHöhe)` — ohne
Animation, damit es nicht als Ruckeln liest. Während der Blende wird nicht nachgemessen
(bestehendes `_cbBarBusy` bleibt).

**Seitenindikator `#wk-dots`.** Punktreihe plus „3 / 7". Höchstens 9 Punkte; bei mehr Übungen
schrumpfen die äußeren (wie bei iOS-Pagern). Tippen auf einen Punkt scrollt zur Seite. Er
aktualisiert sich aus demselben Scroll-Handler wie `_wkFocusLi` — eine Auswertung je Bild über
`requestAnimationFrame`.

## Randfälle

- **Eine Übung:** zwei Seiten (Übung + Abschluss). Pager funktioniert unverändert.
- **Übung während des Trainings hinzugefügt/gelöscht:** Seitenzahl ändert sich, Position wird
  auf die aktive `data-unit` neu gesetzt. Ist die aktive Übung die gelöschte, rückt der Pager
  auf die nächste (oder die letzte, wenn es keine nächste gibt).
- **Tastatur öffnet sich** (Notizfeld auf der Abschluss-Seite): die Seite scrollt intern; der
  Pager selbst bleibt stehen, weil `overscroll-behavior: contain` das Durchreichen sperrt.
- **Wheel-, Satz-Typ- und Untersheets** liegen wie bisher über dem Sheet; der Pager wird
  während ihrer Öffnung nicht bewegt (bestehende Prüfung `.ov.on:not(#ov-wk)` bleibt).
- **`prefers-reduced-motion: reduce`:** alle programmgesteuerten Scrolls mit `behavior: 'auto'`.
- **Sehr kleine Geräte** (Seitenhöhe < 320 px): `.wp-head` bleibt fest, `.wp-sets` scrollt —
  der Fall ist vom internen Scroll schon abgedeckt, es braucht keine Sonderregel.

## Test

**Unit (`test/workout-pager.test.js`, `node --test`):**
Seiteneinteilung mit und ohne Supersätze; Abschluss-Seite immer letzte; `pageIndexFor` an den
Rändern, bei halber Seite (rundet zur näheren), bei `pageH = 0`; `scrollTopFor` als Umkehrung;
`pageOfLi` für jede Übung einer Supersatz-Gruppe → derselbe Index.

**Bestehende Tests:** `test/workout-focus.test.js` um die `pickFocusedStable`-Fälle kürzen,
`focusUnitOf`/`nextOpenUnit` bleiben abgedeckt.

**Am Gerät (Simulator, `~/.claude/sim-native.sh gymtrack`):** Training mit 4 Übungen inkl. einer
Supersatz-Gruppe starten. Prüfen per Screenshot: ein Wisch = eine Seite; kräftiger Wisch
überspringt nichts; Übungskopf steht bei Satz 5 noch; Coach-Leiste und Pausenbalken sichtbar;
„+ Satz" und letzter Satz liegen nicht unter der Tabbar; Auto-Weiter nach dem letzten Haken
landet sauber auf der nächsten Seite.

Zusätzlich messen und im Bericht festhalten: **ab wie vielen Sätzen** die Seite überläuft und
`.wp-sets` zu scrollen beginnt — einmal mit und einmal ohne offene Coach-Vorschlagskarte, auf
iPhone 17. Setzt der interne Scroll schon bei vier oder fünf Sätzen ein, sind die Abstände noch
zu groß und müssen nach.

## Release-Notiz (Was ist neu)

> **Training blättert jetzt seitenweise.** Ein Wisch bringt genau eine Übung — kein Überspringen,
> kein Hängenbleiben zwischen zwei Karten. Übungsname, Ziel und die Hinweise des Coaches bleiben
> dabei fest im Bild, und nichts verschwindet mehr hinter der Leiste am unteren Rand.
