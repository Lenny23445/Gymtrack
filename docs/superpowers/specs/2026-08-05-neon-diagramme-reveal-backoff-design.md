# Neon auf allen Diagrammen · Aufbau-Animation · Backoff-Satz

**Datum:** 2026-08-05
**Status:** freigegeben

Drei zusammenhängende Änderungen an GymTrack:

1. Das Neon-Design endet heute an den Linien-Diagrammen. Balken-Diagramme und die
   Kacheln des KI-Moduls sehen aus wie aus einer anderen App.
2. Werte bauen sich beim Öffnen einer Seite nicht auf — sie stehen einfach da.
3. Es gibt Drop-Satz und Bis-zum-Versagen, aber keinen Backoff-Satz, obwohl er in
   jedem Top-Satz-Programm der dritte Baustein ist.

---

## 1 · Neon auf allen Diagrammen

### Ausgangslage

Die Neon-Sprache existiert bereits und ist an genau zwei Stellen angewandt:

| Baustein | Datei | Wo im Einsatz |
|---|---|---|
| `_glowDs(cv, acc, n, voll)` | `js/app-plans.js` | Linien-Datensätze (Volumen, Gewicht, 1RM, Coach-Hub) |
| `_neonLinePlugin(acc, voll)` | `js/app-plans.js` | Schein unter der Linie via `ctx.shadowBlur` |
| `_segFarbe` / `_segBarsHTML` / `_segBarsVertHTML` | `js/app-plans.js` | Erholungs-Striche, Akkus |
| `--gw-1/2/3`, `--gwa-1/2/3`, `--neon`, `--neon-edge` | `css/app.css` | zentraler Dimmer für jeden Schein |

Ohne Schein sind heute: alle `type:'bar'`-Diagramme (Muskelgruppen-Statistik,
Erfolge-Radar, die Wochen- und Muskelbalken des Coach-Hubs) sowie die
CSS-Balken der KI-Analyse (`.aia-hrow-fill`, `.aia-bar i`) und deren
Zahlenkacheln (`.aia-stat`).

### Änderung

**`_neonBarPlugin(acc)`** — neu in `js/app-plans.js`, direkt neben
`_neonLinePlugin`. Gleiche Bauart: `beforeDatasetDraw` setzt `shadowColor` aus
`_hexA(acc, …*_neonF())` und `shadowBlur`, `afterDatasetDraw` stellt den
Kontext wieder her. Es wird bewusst kein zweiter Farbbegriff eingeführt — der
Schein leitet sich aus der Balkenfarbe ab, die der Aufrufer ohnehin setzt.

Angewandt auf:

- `mgStatChart` (`js/app-plans.js:2907`)
- `erfRadarChart` (`js/app-plans.js:2382`)
- Coach-Hub: `volumeBars` und `muscleBars`. Der Injektionspunkt existiert schon —
  `_chWeekDraw()` → `mk()` in `js/app-coach.js:1390` stylt heute nur
  `cfg.type === 'line'` nach; der Zweig wird um `'bar'` erweitert.

`js/coach-charts.js` wird **nicht** angefasst. Das Modul ist bewusst
oberflächenfrei (liest keine Farben, keine Stylesheets) und hat eigene Tests;
der Stil gehört an die Aufrufstelle, wie es dort im Kopfkommentar steht.

**CSS** (`css/app.css`): `.aia-hrow-fill` und `.aia-bar i` bekommen die
Glow-Staffel von `.lvl-fill` — drei Lagen `0 0 var(--gw-N) rgba(…,var(--gwa-N))`
plus `var(--neon-edge)` als Kontaktkante auf hellen Themes. `.aia-stat` bekommt
den Akzent-Innenrand der übrigen Neon-Kacheln.

Die Ampelfarben der Volumen-Zeilen (`low` = `#ff9f0a`, `high` = `#ff453a`)
leiten ihren Schein aus der **eigenen** Farbe ab, nicht aus `--acc` — sonst
leuchtet eine Warnung in Akzentfarbe und widerspricht dem, was sie sagt.

---

## 2 · Aufbau-Animation bei jedem Öffnen

### Verhalten

Wird ein Tab oder ein Sheet sichtbar, wachsen Balken, Füllungen und Akkustände
aus dem Nullwert in ihren Wert. Bei jedem Öffnen, nicht nur beim ersten.
`prefers-reduced-motion: reduce` schaltet den Aufbau vollständig ab — die Werte
stehen dann sofort.

### Umsetzung

Neues Modul **`js/gt-reveal.js`** mit einer Funktion:

```js
gtReveal(root)   // root = Element oder Dokument; ohne Argument: document
```

Ablauf je gefundenem Element:

1. Zielgröße lesen (`style.width` bzw. `style.height`, wie gerendert).
2. `transition:none` setzen, Größe auf 0, Reflow erzwingen.
3. `transition` zurücknehmen, `transition-delay = index * 30 ms` (gedeckelt bei
   240 ms, damit eine lange Liste nicht sekundenlang tröpfelt), Zielgröße setzen.

Die Füllungen tragen bereits `transition: width .5s cubic-bezier(…)` — es
entsteht keine neue Keyframe, der Aufbau nutzt den vorhandenen Übergang.

Erfasste Wertträger:

- `.aia-hrow-fill` (KI-Analyse, waagerechte Balken)
- `.aia-bar i` (KI-Analyse, Volumen-Trend)
- `.segbar i`, `.segbar-v i` (Erholungs-Striche, Akkus)
- `.lvl-fill` (Level-Fortschritt)

Aufrufer:

| Stelle | Datei |
|---|---|
| `goTab()`, nach dem jeweiligen `render*()` | `js/app-ui.js:276` |
| `openSettingsPage()` | `js/app-ui.js` |
| `openOv(id)`, nach `classList.add('on')` | `js/app-ui.js:393` |

Chart.js-Diagramme brauchen keinen eigenen Aufruf: sie werden bei jedem Öffnen
neu erzeugt und animieren dadurch von selbst. `coach-charts.js` bringt seine
Balken-Animation über `barAnimation(opts)` bereits mit.

**Neues Modul heißt (Projektregel 5):** Tag in `index.html`, Eintrag in
`build.js`, Eintrag in `sw.js` (`SHELL`). Das Modul steht vor `app-ui.js`; da
`gtReveal` ausschließlich aus Funktionskörpern gerufen wird, wäre auch eine
spätere Position unkritisch — die frühe Position hält die Abhängigkeit trotzdem
sichtbar.

---

## 3 · Backoff-Satz

### Was er ist

Nach dem Top-Satz mit 10–20 % weniger Gewicht weitertrainieren, um Volumen zu
sammeln, ohne noch einmal ans Maximum zu gehen. Er ist kein Drop-Satz: der
Drop-Satz beginnt unmittelbar nach dem Versagen ohne Pause, der Backoff-Satz ist
ein regulärer Arbeitssatz mit voller Pause und geringerem Gewicht.

### Datenmodell

`js/app-streak.js`:

```js
const SET_TYPES = ['normal','warmup','top','backoff','drop','fail'];
const SET_TYPE_LABEL = { …, backoff:'B' };
```

Titel: DE „Backoff-Satz", EN „Back-off set".

Beschreibung (`SET_TYPE_DESC.backoff` und die Karte in `index.html`):

> Nach dem Top-Satz mit 10–20 % weniger Gewicht weitertrainieren, um Volumen zu
> sammeln, ohne noch einmal ans Maximum zu gehen. Zählt voll zum
> Trainingsvolumen und belastet weniger als ein Drop- oder Versagens-Satz.

### Oberfläche

- Neue `.settype-card[data-type="backoff"]` in `index.html`, **zwischen**
  Top-Satz und Drop-Satz — dort steht er auch im Training.
- Badge-Farbe Teal `#2ED3C6`: frei zwischen warmup (orange), top (lila), drop
  (blau/Akzent) und fail (rot). Regeln `.set-type.backoff` und
  `.settype-badge.backoff` in `css/app.css`, gleiche Bauart wie die vorhandenen.
- EN-Strings in `I18N_EN` (`js/app-i18n.js`) — Projektregel für jeden neuen
  Nutzertext.

### Vorbelegung im Training

`js/app-ui.js`, analog zu `DROP_PCT = 0.70`:

```js
const BACKOFF_PCT = 0.85;   // Backoff-Satz = 85 % seines Schema-Gewichts
…
if (t === 'drop')    mult *= DROP_PCT;
if (t === 'backoff') mult *= BACKOFF_PCT;
```

Das Ergebnis läuft wie beim Drop-Satz durch `roundToStep` aufs Hantelraster.

### Volumen und Progression

Ein Backoff-Satz zählt **voll** zum Trainingsvolumen (anders als `warmup`) und
gilt als Arbeitssatz für die Double Progression. Da `getSuggestedWeight` /
`_coachTopSet` / `exBest1RM` auf dem **schwersten** Satz arbeiten, drückt ein
leichterer Backoff-Satz weder Vorschlag noch Bestwert.

### Erholung

`js/app-plans.js`:

```js
function setTypeMul(t) {
  …
  case 'backoff': return 1.10;   // submaximal, aber mit Vorermüdung vom Top-Satz
  …
}
```

Einordnung der Skala: warmup 0.20 · normal 1.00 · **backoff 1.10** · drop 1.20 ·
top 1.30 · fail 1.35.

`sessionDamageMul()` behält seine Liste `['top','drop','fail']`. Der Backoff-Satz
zählt bewusst **nicht** als harter Satz — genau das ist sein Zweck. Ihn dort
aufzunehmen hieße, ihn mit derselben Zeche zu belegen wie den Satz, den er
ersetzen soll.

`exerciseDamageFactor` bleibt unverändert; er bewertet die Übung, nicht den
Satztyp.

### Auto-Erkennung durch den Live-Coach

`js/app-coach.js`, in der Trigger-Kette bei Zeile 425 **vor** dem `drop`-Zweig:

```
backoff, wenn:
  – der vorige Satz derselben Übung war der schwerste der Einheit, UND
  – das Gewicht liegt 8–20 % darunter, UND
  – die Wiederholungen sind gegenüber dem vorigen Satz gestiegen
sonst greift wie bisher der drop-Zweig
```

Ohne Wiederholungs-Anstieg bleibt es `drop` — dann sieht es nicht nach geplantem
Backoff aus, sondern nach Leistungsabfall, und das ist die Aussage, die der
Nutzer braucht.

Wie beim bestehenden `drop`-Trigger (`js/app-coach.js:592`) wird der Satz
visuell geflaggt (`log.sets[si].type = 'backoff'`) und die Coach-Karte nennt die
Wertung, damit der Nutzer sie korrigieren kann.

---

## Betroffene Dateien

| Datei | Was |
|---|---|
| `js/app-plans.js` | `_neonBarPlugin`, Anwendung auf `mgStatChart`/`erfRadarChart`, `setTypeMul` |
| `js/app-coach.js` | Bar-Zweig in `_chWeekDraw()` → `mk()`, Backoff-Trigger |
| `js/app-streak.js` | `SET_TYPES`, `SET_TYPE_LABEL`, `SET_TYPE_TITLE`, `SET_TYPE_DESC` |
| `js/app-ui.js` | `BACKOFF_PCT`, `gtReveal`-Aufrufe in `goTab`/`openOv`/`openSettingsPage` |
| `js/app-i18n.js` | EN-Strings |
| `js/gt-reveal.js` | **neu** |
| `index.html` | Script-Tag, `.settype-card` für Backoff |
| `css/app.css` | Glow auf `.aia-*`, `.set-type.backoff`, `.settype-badge.backoff` |
| `build.js`, `sw.js` | neues Modul eintragen |
| `test/` | Tests zu `setTypeMul('backoff')` und der Backoff-Erkennung |

## Prüfung vor dem Melden

- `npm test` (670 grün, plus die neuen)
- `node smoke.js`
- `~/.claude/sim-native.sh Desktop/Claude/gymtrack` — Sichtprüfung im Simulator:
  KI-Modul → Trainingsanalyse / Workout optimieren / Fortschritt analysieren,
  Statistik-Tab, Satz-Typ-Picker im Training.

## Bewusst nicht enthalten

- Kein Umbau von `js/coach-charts.js` auf Oberflächenwissen.
- Keine neue Animations-Bibliothek und keine Keyframes, wo ein vorhandener
  CSS-Übergang reicht.
- Kein neuer Farbbegriff für den Balken-Schein — er leitet sich aus der
  Balkenfarbe ab.
