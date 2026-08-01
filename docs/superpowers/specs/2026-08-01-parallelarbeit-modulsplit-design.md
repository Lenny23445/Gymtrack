# Parallelarbeit: index.html in Module aufteilen

**Datum:** 2026-08-01
**Status:** Entwurf abgenommen, Umsetzung offen

## Warum

Mehrere Agents sollen gleichzeitig an GymTrack arbeiten koennen. Heute geht das
nicht — und zwar nicht wegen fehlender Arbeitsverzeichnisse. Worktrees gibt es
laengst (`gymtrack-bugfix`, `gymtrack-store168`, `.claude/worktrees/…`). Die
Ursache liegt im Code.

`index.html` ist 36.449 Zeilen / 1,9 MB gross und enthaelt die komplette App:

| Bereich | Zeilen | Umfang |
|---|---|---|
| Boot-Skript (Theme vor erstem Paint, Splash) | 16–49 | 34 |
| Firebase-Init (`type="module"`) | 53–187 | 135 |
| CSS | 188–6936 | ~6.700 |
| HTML-Body | 6938–8865 | ~1.900 |
| Haupt-JavaScript (1.134 Funktionen) | 8866–36416 | ~27.500 |
| Nachzuegler-Skript | 36417–36448 | 32 |

Zwei Agents heisst zwei Aenderungen an derselben Datei. Git merged zeilenweise,
aber bei jeder thematischen Ueberschneidung gibt es Konflikte in einer Datei,
die kein Mensch und kein Agent im Ganzen ueberblickt. Dazu kommt ein garantierter
Konflikt: jeder Agent bumpt nach seiner Aenderung `APP_VERSION` in `index.html`
und `CACHE` in `sw.js` — dieselbe Zeile, jedes Mal, in jedem Merge.

## Ziel

```
VORHER                          NACHHER
index.html   36.449 Z.    →     index.html      ~2.000 Z.  (HTML-Geruest)
                                css/app.css     ~6.700 Z.
                                js/app-*.js    ~27.500 Z.  (12 Module)

Agent A -> js/app-session.js  ┐
Agent B -> js/app-plans.js    ├─ disjunkte Dateien, kein Konflikt
Agent C -> css/app.css        ┘
```

Kein neuer Build-Schritt. Die Dateien werden direkt per `<link>` bzw.
`<script src>` geladen — genau das Muster, das `js/coach-*.js` im Repo schon
verwendet. Deploy-Weg (GitHub Pages + Capacitor) bleibt unveraendert.

## Aenderungen

### 1. CSS auslagern

Zeile 188–6936 wandert unveraendert nach `css/app.css`. Im `<head>` steht
stattdessen `<link rel="stylesheet" href="./css/app.css">`.

Die Position ist wichtig: das `<link>` muss **nach** dem Boot-Skript (Z. 16–49)
stehen, das Theme und Glas-Attribut vor dem ersten Paint setzt. `<link>` im
`<head>` blockiert das Rendern bis zum Laden, es entsteht also kein FOUC.

### 2. JavaScript in 12 Module

Zeile 8866–36416 wird auf die Module 1–11 aufgeteilt, Modul 12 kommt aus dem
Nachzuegler-Skript. Alle Module werden als **klassische Skripte** geladen
(`<script src="…">`, **kein** `type="module"`) und in exakt dieser Reihenfolge:

| # | Datei | Inhalt |
|---|---|---|
| 1 | `js/app-i18n.js` | `setAppLang`, `tr`, `_trTree`, Muskel-/Modus-Tabellen, Einheiten, Icon-Picker |
| 2 | `js/app-native.js` | Widget-Daten, LiveActivity, Spotlight, HealthKit, Benachrichtigungen, Push |
| 3 | `js/app-exercises.js` | Uebungs-DB, Satz-Planung, PR-Logik, Verlauf |
| 4 | `js/app-session.js` | Session-Detail, Mini-Charts, Ziele |
| 5 | `js/app-plans.js` | Splits, Presets, Custom-Split-Editor |
| 6 | `js/app-ui.js` | Tabs, Overlays, Themes, Haptik, Streak, Suche |
| 7 | `js/app-community.js` | Feed und Beitraege (`_cpg*`) |
| 8 | `js/app-coach.js` | Coach-Logik, RPE, Volumensteuerung |
| 9 | `js/app-coach-setup.js` | Coach-Onboarding-Assistent |
| 10 | `js/app-update.js` | Service-Worker-Update, native Update-Leiste, Sync/Merge |
| 11 | `js/app-boot.js` | **alles, was beim Laden ausgefuehrt wird** |
| 12 | `js/app-tabbar.js` | Liquid-Glass-Tableiste (heute Z. 36417–36448) |

Klassische Skripte teilen sich einen globalen Geltungsbereich — auch fuer
`let`/`const` auf oberster Ebene. Bei erhaltener Reihenfolge ist das Verhalten
identisch zum heutigen einen `<script>`-Block.

**Warum `app-boot.js` getrennt und immer zuletzt:** `function`-Hoisting wirkt
nur innerhalb einer Datei. Ruft heute Code auf oberster Ebene aus dem oberen
Teil des Skripts eine Funktion auf, die weiter unten definiert ist, funktioniert
das durch Hoisting. Nach dem Split waere es ein `ReferenceError`. Deshalb wandert
**jede Anweisung auf oberster Ebene, die etwas ausfuehrt** (INIT-Block,
`addEventListener`, direkte Aufrufe) in `app-boot.js` als letzte geladene Datei.
Reine Deklarationen (`function`, `const`-Tabellen, `class`) bleiben in ihrem
Themenmodul.

**Inline bleibt:**
- Boot-Skript Z. 16–49 — setzt Theme vor dem ersten Paint; ausgelagert flackert
  die App beim Start.
- Firebase-Block Z. 53–187 (`type="module"`) — bleibt unveraendert, um
  Lade-Zeitpunkt und Konfiguration nicht anzufassen.

Das Skript Z. 36417–36448 (Liquid-Glass-Tableiste) ist eine geschlossene IIFE
mit eigenem Geltungsbereich und ruft `moveTabIndicator` nur zur Laufzeit auf.
Es wandert unveraendert nach `js/app-tabbar.js` und wird als **letzte** Datei
geladen, nach `app-boot.js`.

### 3. Mitgezogene Dateien

**`sw.js` — kritischster Punkt.** Zwei Stellen:

- `SHELL` muss `./css/app.css` und alle `./js/app-*.js` auflisten.
- Die Fetch-Strategie muss `js/app-` genauso als *kritische Shell* behandeln wie
  heute `js/coach-` (Network-First). Sonst laeuft ein frisches `index.html`
  gegen veraltete Module aus dem Cache, ohne dass ein `CACHE`-Bump das bemerkt —
  exakt der Fehler, den der Kommentar im heutigen `sw.js` fuer die Coach-Module
  beschreibt.

`css/app.css` gehoert ebenfalls zu Network-First: das Stylesheet aendert sich
mit jedem UI-Umbau und darf nicht hinter dem HTML zurueckbleiben.

**`build.js`** — die `files`-Liste muss `css/app.css` und alle `js/app-*.js`
aufnehmen, und `www/css/` muss angelegt werden. Fehlt das, kopiert der Build sie
nicht nach `www/`, und die native App startet ohne Stil und ohne Logik.

**Tests** — vier Testdateien lesen `index.html` direkt ein:
`index-konstanten.test.js`, `coach-i18n.test.js`, `coach-intent.test.js`,
`coach-report.test.js`. Sie muessen kuenftig `index.html` **plus** die neuen
Dateien einlesen. Besonders `index-konstanten.test.js`: sein Waechter gegen
benutzte, aber nicht deklarierte Konstanten verliert seinen Sinn, wenn er nur
noch das HTML-Geruest sieht — er wuerde ab dann nichts mehr finden und still
gruen bleiben.

### 4. Parallel-Betrieb

- **Worktrees** einheitlich unter `.worktrees/<branch>` im Projekt (per
  `.gitignore`-Eintrag ignoriert), statt Ad-hoc-Ordner neben dem Repo.
- **`npm install` je Worktree** — `node_modules` wird von Worktrees nicht geteilt.
- **Eigenes Simulator-Geraet je Agent.** `sim-native.sh` installiert unter der
  festen Bundle-ID `com.wolter.gymtrack`. Zwei Agents auf demselben Geraet
  ueberschreiben gegenseitig ihre Installation. `.sim-build` liegt bereits pro
  Ordner und ist unkritisch.
- **Versionsbump nur beim Merge.** Agents aendern `APP_VERSION` und `CACHE`
  nicht. Der Bump passiert einmal auf `main`, wenn die Arbeit zusammengefuehrt
  wird. Ohne diese Regel kollidiert jeder einzelne Merge auf derselben Zeile.
- Diese Regeln kommen in `CLAUDE.md`, damit jeder Agent sie beim Start liest.

## Vorgehen

Strikt schrittweise, nicht alles auf einmal. Nach **jedem** Schritt:

1. `npm test` — alle 18 Testdateien gruen
2. Puppeteer-Rauchtest: `index.html` laden, **null** Konsolenfehler, eine Liste
   von Kernfunktionen ist definiert (`setTheme`, `persist`, `goTab`,
   `isWorkoutActive`, …)
3. Bei UI-relevanten Schritten: Simulator-Build + Bildschirmfoto

Reihenfolge: CSS zuerst (klar abgegrenzt, geringes Risiko), danach Modul fuer
Modul von unten nach oben, `app-boot.js` zuletzt. Jeder Schritt ein eigener
Commit, damit einzeln zurueckrollbar.

## Nicht Teil dieser Arbeit

- Kein Umschreiben von Logik. Reines Verschieben; jede Zeile landet
  unveraendert in ihrer neuen Datei.
- Kein `type="module"`, keine Imports/Exports. Das waere ein zweiter,
  gefaehrlicherer Umbau — der globale Geltungsbereich bleibt.
- Kein Build-Schritt, der `index.html` erzeugt. Bewusst verworfen: die erzeugte
  Datei muesste aus Git heraus und GitHub Pages braeuchte eine Build-Action.
- Kein Aufteilen des HTML-Bodys. ~1.900 Zeilen sind handhabbar, und
  Seitenmarkup ist selten die Stelle, an der zwei Agents kollidieren.
