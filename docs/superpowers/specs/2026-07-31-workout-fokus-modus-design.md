# Fokus-Modus im aktiven Training — Design

**Datum:** 2026-07-31 · **Status:** vom Nutzer freigegeben (Chat) · **Basis:** Branch `merge/store168-into-main` (Store-Bugfixes 1.3.68 + KI-Stand vereint)

## Problem

Im aktiven Training (`ov-wk`) stehen alle Übungskarten gleichwertig untereinander; man scrollt frei und nichts zeigt, wo man gerade ist. Gewünscht: die aktuelle Übung „rastet ein" und steht sichtbar im Zentrum, der Rest tritt zurück.

## Entscheidung (Nutzer)

- **Modell:** Scroll-Snap + Fokus (kein Akkordeon, kein Pager).
- **Aktivierung:** immer an, kein Settings-Toggle, für alle Nutzer (nicht Premium-gebunden).
- **Technik:** Hybrid (Ansatz C) — CSS-Snap fürs Einrasten, IntersectionObserver für die Fokus-Optik, JS nur fürs Auto-Weiterscrollen.

## Verhalten

1. **Einrasten:** Scrollen im Trainings-Sheet rastet sanft an Übungskarten ein — `scroll-snap-type: y proximity`, niemals `mandatory`. Hohe Karten (länger als der Sichtbereich) bleiben frei durchscrollbar; Snap greift nur nahe der Rastposition.
2. **Fokus-Optik:** Die Karte unterm Zentrum des sichtbaren Bereichs ist `.focused` (voll sichtbar), alle anderen `.dimmed` (Opazität ≈ 0.45, `scale(.97)`, weiche Transition). Gedimmte Karten bleiben voll bedienbar — kein `pointer-events`-Block, kein Tap-to-focus.
3. **Kein Snap** auf snap-fremden Zonen: Timer-Kopf, Coach-Karte/-Leiste, Notizfeld, Finish-Button.
4. **Auto-Weiter:** Wird der letzte offene Satz der fokussierten Einheit abgehakt, scrollt die nächste Übung mit offenen Sätzen nach ~600 ms sanft in die Mitte (`scrollIntoView({behavior:'smooth'})`). Unterdrückt, wenn ein Overlay offen ist (Wheel, Satz-Typ, Untersheets aus `WK_SUB_SHEETS`) oder der Nutzer gerade selbst scrollt/berührt.
5. **Superset:** Eine `ssGroup` ist EINE Fokus-Einheit — alle Partnerkarten gemeinsam `.focused`, kein Springen zwischen Partnern. Auto-Weiter erst, wenn die gesamte Gruppe keine offenen Sätze mehr hat.
6. **KI-Aura:** `coach-aura` (erste Übung mit offenen Sätzen) bleibt unverändert; Fokus und Aura dürfen auseinanderfallen (Nutzer scrollt woandershin), kollidieren aber nicht — zwei unabhängige Klassen.
7. **Reduced Motion:** `prefers-reduced-motion: reduce` → keine Scale-Transition, Auto-Weiter mit `behavior:'auto'`.

## Architektur

Drei entkoppelte Schichten; jede einzeln abschaltbar und testbar:

| Schicht | Zuständig für | Mechanik |
|---|---|---|
| CSS-Snap | Einrasten | `scroll-snap-type: y proximity` + `scroll-padding-top` am Scroll-Container, `scroll-snap-align` + `scroll-margin` an `.ex-card` |
| Fokus-Observer | `.focused`/`.dimmed` | Ein `IntersectionObserver` (Threshold-Liste) auf `#log-cards .ex-card`; Zentrums-Karte = größte Überdeckung der Mittelzone |
| Auto-Weiter | Scroll zur nächsten Einheit | Hook nach `toggleSetDone` → `renderLogCards()`; pure Helfer bestimmen das Ziel |

**Invariante:** Fokus-Index lebt in einer Modul-Variable (`_wkFocusLi`). `renderLogCards()` ersetzt `#log-cards` per `innerHTML` bei jedem Satz-Haken komplett — die Klassen werden darum beim Rendern direkt mitgegeben (kein Nachpatchen → kein Flackern), der Observer wird nach jedem Render neu angebunden.

**Gesten-Verträglichkeit:** Während Drag-Reorder (`wkDragStart`) und Lösch-Swipe (`_attachSwipeToDelete`) bekommt der Container eine Klasse, die Snap abschaltet — Snap kämpft sonst mit Drag-Autoscroll. Tab-Swipe (`_tabSwipeActive`) bleibt unberührt.

**Pure Helfer** (nach Vorbild `js/coach-*.js`, eigene Datei `js/workout-focus.js`, als Global exponiert):
- `focusUnitOf(logs, li)` → Indizes der Fokus-Einheit (Superset-Gruppierung).
- `nextOpenUnit(logs, fromLi)` → Ziel-Index fürs Auto-Weiter (`null` wenn nichts offen).
- `pickFocused(rects, mid)` → Karten-Index zur Mittellinie (reine Geometrie, DOM-frei).

## Nicht-Ziele

- Kein Settings-Toggle, kein Premium-Gate.
- Kein Tap-to-focus auf gedimmte Karten (YAGNI — Scroll/Snap holt sie ohnehin).
- Keine Änderung an Aura-, Coach-, Superset- oder Progressions-Logik.
- Kein Umbau der Sheet-Struktur von `ov-wk`.

## Fehlerfälle / Ränder

- 1 Übung im Training → nichts gedimmt, kein Auto-Weiter-Ziel: Helfer liefern das stabil.
- Übung entfernt/getauscht/umsortiert → Render-Pfad läuft ohnehin über `renderLogCards()`; Fokus-Index wird dabei gegen die neue Liste geklemmt.
- Alle Sätze fertig → kein Ziel, kein Scroll; Finish-Button bleibt normal erreichbar.
- WKWebView: `scrollend` existiert ab iOS 26, wird aber nicht vorausgesetzt — der Observer feuert über Intersection, nicht über Scroll-Events.

## Tests & Verifikation

- `node --test` für die drei Helfer (Superset-Gruppen, nächste Einheit über Gruppen hinweg, Geometrie-Auswahl inkl. hoher Karten) — Muster wie `test/coach-*.test.js`.
- Optik/Gesten (Snap-Gefühl, Dimmen, Auto-Weiter, Drag/Swipe-Koexistenz) im iOS-Simulator verifizieren, Screenshot als Beleg.

## Deploy

`APP_VERSION` + `sw.js`-`CACHE` bumpen · `npm run build && npx cap sync ios` · neue Datei `js/workout-focus.js` in die `build.js`-Kopierliste · Changelog-Eintrag (`CHANGELOG`, neuester zuerst) + App-Store-Release-Notes im Abschluss-Report · Merge nach `main` + Push (Standing Auto-Push). Keine neuen UI-Texte → kein `I18N_EN`-Eintrag nötig; falls doch Text entsteht, Regel aus CLAUDE.md befolgen.
