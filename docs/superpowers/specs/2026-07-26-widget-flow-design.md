# Homescreen-Widgets: Auswahl-Flow & Anordnen (2026-07-26)

## Ziel

Das Widget-System auf der Startseite („Heute") soll sich wie iOS anfühlen:
Widget im Picker antippen → Sheet schließt sich selbst → Widget landet sichtbar
auf der Seite → sofort anordnen. Kein manuelles Schließen, keine harten Sprünge.

## Ist-Zustand

- `addWidget()` (index.html ~10181) fügt das Widget ein, lässt das Bottom-Sheet
  aber offen und rendert den Picker nur neu (Karte bekommt ✓). Der Nutzer muss
  das Sheet selbst über ✕ oder Backdrop schließen.
- Die Edit-Bar mit „＋ Widget" / „Fertig" (index.html ~5566) ist bei offenem
  Picker per CSS ausgeblendet (`body.wpick-open #heute-edit-bar{display:none!important}`).
- `closeOv()` entfernt nur `.on`; wegen `.ov.on{display:flex}` gibt es **keine**
  Exit-Animation — jedes Sheet schnappt weg.
- Drag & Drop **tauscht** zwei Kacheln (`[L[from],L[to]]=[L[to],L[from]]`) und
  rendert danach das komplette Grid neu → Kacheln springen hart um.

## Soll-Zustand

### 1 · Auswahl-Flow

`addWidget(type,size)`:

1. Widget ins Layout einfügen, `persist()` (wie bisher, inkl. `_pendingWidgetInsertAfter`).
2. Haptik-Tick beim Tap.
3. Sheet schließen (`closeOv('ov-widget-add')`) — mit Exit-Animation aus Abschnitt 2.
4. Edit-Modus sicherstellen (`enterEditMode()`), Edit-Bar wird sichtbar.
5. Grid rendern; die neue Kachel bekommt eine einmalige Klasse `hw-landing`
   → Pop-in: `scale(.88)` + `opacity 0` → `scale(1)` + `opacity 1`, ~300 ms,
   Spring-Kurve. Klasse wird nach dem Lauf entfernt, danach greift das normale
   Edit-Wackeln.
6. Auto-Scroll **nur** wenn die neue Kachel nicht vollständig im Viewport liegt:
   `scrollIntoView({behavior:'smooth', block:'nearest'})`.
7. Haptik-Tick beim Landen (~180 ms nach dem Schließen).

Mehrere Widgets nacheinander: Sheet geht immer zu; für das nächste erneut
„＋ Widget" in der Edit-Bar tippen (Apple-Verhalten, bewusst gewählt).

### 2 · Sheet-Animation (global)

- `closeOv(id)`: führt die bestehende Logik (Check-in-Kette, Stat-Drilldown,
  `wpick-open`-Reset, `_aibSyncVisibility`) **unverändert und sofort** aus.
  Neu ist nur das DOM-Timing: Klasse `.closing` setzen, `.on` erst nach ~200 ms
  entfernen (Timeout, zusätzlich per `transitionend` abgesichert).
- CSS: `.ov.closing` → Scrim `opacity:0`; `.ov.closing .sheet` →
  `transform:translateY(100%)`, Dauer `--t-exit`, `--ease-in`.
- Enter: Keyframe `up` bekommt eine iOS-Spring-Kurve statt der bisherigen
  `cubic-bezier(.32,1,.32,1)`; Scrim blendet parallel ein.
- Mehrfaches `closeOv` auf dieselbe ID darf keine doppelten Timer hinterlassen
  (laufenden Timer je Element merken und ersetzen).
- Wird dasselbe Sheet während der Schließanimation wieder geöffnet, muss
  `openOv` `.closing` entfernen und den Timer abbrechen.
- `prefers-reduced-motion`: Animationen aus, direktes Ausblenden.

### 3 · Anordnen (Drag & Drop)

Einfügen statt Tauschen:

- Während `_hMoveDrag` wird aus der Fingerposition der **Zielindex** bestimmt
  (Kachel unter dem Finger + Seite links/rechts bzw. oben/unten der Mitte).
- Ändert sich der Zielindex, wird das Layout-Array live per `splice` umsortiert
  und das Grid per **FLIP** animiert: alte Rects aller Kacheln merken → DOM
  umordnen → Delta als `transform` setzen → auf `0` animieren (220 ms, ease-out).
  Kein voller Neuaufbau der Widget-Inhalte während des Ziehens.
- Haptik-Tick (schwach) bei jedem Indexwechsel.
- Beim Loslassen fliegt der Ghost per Transition (220 ms) auf das Rect der
  Zielkachel, wird danach entfernt, `opacity` der echten Kachel zurückgesetzt,
  `persist()`.
- Abbruch (`pointercancel`) stellt die Reihenfolge vom Drag-Start wieder her.

### 4 · Fertig / Rauskommen

- Edit-Bar bleibt bei offenem Sheet ausgeblendet (sie läge darunter). Da das
  Sheet nach der Auswahl selbst zugeht, ist „Fertig" sofort wieder erreichbar.
- Swipe-down auf dem Picker-Sheet zum Schließen prüfen; falls nicht vorhanden,
  ergänzen (konsistent mit den übrigen Sheets).

## Nicht im Umfang

- Resize-Geste (Eck-Griff) bleibt wie sie ist.
- Widget-Inhalte, neue Widget-Typen, iOS-WidgetKit-Extension.

## Verifikation

- Nativ im Simulator über `~/.claude/sim-native.sh gymtrack`, Beweis per
  `xcrun simctl io "<Gerät>" screenshot`.
- Manuell durchspielen: Widget hinzufügen (Sheet zu, Pop-in, Fertig da),
  zweites Widget nachlegen, Kachel umsortieren, andere Sheets (Check-in,
  Statistik-Drilldown) auf Regression prüfen — deren Logik hängt an `closeOv`.
- Danach Commit + Push und Mini-„Was ist neu"-Release-Notes.
