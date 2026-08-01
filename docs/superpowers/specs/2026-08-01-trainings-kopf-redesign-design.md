# Trainings-Kopf: eine schlanke Leiste statt drei Kaesten

**Datum:** 2026-08-01
**Status:** Entwurf abgenommen, Umsetzung offen

## Warum

Ueber der ersten Uebungskarte stehen heute drei Bloecke uebereinander:

| Block | heutige Masse |
|---|---|
| `.timer-bar` (Glaskarte: Label, 28px-Zeit, Puls, Abbrechen, Fertig) | 16px Polster, `margin-bottom:14px` |
| `#wk-coach-bar` | 10px Polster, `margin-bottom:10px` |
| `.rest-bar` (26px-Zahl, Pulsanimation) | 11/14px Polster, `margin:10px 0 12px` |

Zusammen rund 40 % der Bildhoehe, bevor die erste Uebung beginnt — auf einem
Blatt, das seit dem Blaettern ohnehin nur eine Uebung je Bildschirm zeigt.
Zusaetzlich aendert die Pausenleiste beim Ein- und Ausblenden die Hoehe des
klebenden Stapels; jede solche Aenderung zwingt WebKit, die Rastpunkte des
ganzen Blattes neu zu rechnen (siehe Kommentar bei `_wkSyncSnapPad`).

## Ziel

```
#ov-wk .sh-head    Aktives Training              [Fertig ✓]  ✕
#wk-sticky
  #wk-bar          ⏱ 02:33                    3/12 Sätze     44px
                   ▓▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒                     2px, nur bei Pause
  #wk-coach-bar    ▎▂▆ Bereichsmaximum — nächstes Mal mehr    32px, klappt auf 0
#log-cards         Bankdrücken …
```

Zwei Zustaende derselben Leiste, **gleiche Hoehe in beiden**:

- **Ruhe:** links Trainingszeit, rechts erledigte/gesamte Saetze.
- **Pause:** rechts `Pause 1:52  −15  +15  ✕`, darunter ein 2px-Fortschritt
  (verbleibend/gesamt) in Akzentfarbe. Gewechselt wird per Blende, nicht per
  Hoehenaenderung.

## Aenderungen

### Markup (`index.html`, `#wk-step2`)

1. `.timer-bar` entfaellt komplett. `Fertig ✓` wandert in `.sh-head` von
   `#ov-wk` (nur in Schritt 2 sichtbar), `Abbrechen` faellt oben weg — am
   Listenende gibt es ihn bereits.
2. Neu `#wk-bar` als **erste** Zeile in `#wk-sticky`, oberhalb von
   `#wk-coach-bar`. Aufbau: `.wkb-time` (SVG-Uhr + `#timer-v`), `.wkb-right`
   (Ruhe: `#wk-setprog` · Pause: Label, `#rest-timer-val`, `−15`, `+15`, `✕`),
   `.wkb-prog` (2px-Balken).
3. `#rest-timer-bar` als eigener Balken entfaellt. Die IDs `rest-timer-val`
   und `rest-timer-bar` bleiben als Elemente in `#wk-bar` erhalten
   (`rest-timer-bar` wird zum Behaelter der rechten Haelfte), damit
   `_tickRest`, `adjustRest` und `skipRest` unveraendert weiterschreiben.
4. `#wk-hr` entfaellt (siehe Herzfrequenz).

### CSS

- Raus: `.timer-bar`, `.timer-bar::after`, `.timer-v`, `.timer-l`, `.wk-hr`,
  `.rest-bar*`, `@keyframes restPulse`.
- Rein: `#wk-bar` (eine Zeile, `display:flex`, feste Hoehe 44px, deckender
  Grund), `.wkb-*`. **Kein `backdrop-filter`** — Glas auf klebenden Elementen
  hat in der WKWebView schon zweimal Kanten quer durch den Inhalt gezogen.
- `#wk-sticky` bleibt `position:sticky; top:58px`.

### JS

- `_wkStops()`: erster Halt war `#wk-step2 .timer-bar`. Halte sind ab jetzt
  nur noch die Uebungskarten und `#wk-note`.
- `_wkSyncSnapPad()`: Formel `58 + Hoehe(#wk-sticky) + 8` bleibt; der Wert
  faellt kleiner aus, weil die Zeitkarte in den Stapel gewandert ist. Da die
  Pause die Stapelhoehe nicht mehr aendert, entfaellt das Neurechnen der
  Rastpunkte bei jedem Pausenstart.
- Satzfortschritt neu zeichnen, wo sich Saetze aendern: `renderLogCards`,
  `toggleSetDone`, `addSet`, `delSet`.
- Pausen-Fortschritt bei jedem Tick von `_tickRest` setzen (Balkenbreite).

### Neues Modul `js/workout-bar.js`

Zwei reine Funktionen, damit die Zahlen unter `node --test` pruefbar sind
(gleiches Muster wie `js/workout-focus.js`):

- `setProgress(logs)` → `{done, total}` ueber alle Saetze aller Uebungen.
  Aufwaermsaetze zaehlen hier mit — es ist eine Anzeige, keine Progression.
- `restFraction(rest, total)` → `0…1`, geklemmt, `0` bei unsinnigem `total`.

**`js/workout-bar.js` muss in die Kopierliste in `build.js:6`** — sonst fehlt
die Datei im nativen Build, und `WorkoutBar` ist dort `undefined`.

### Herzfrequenz

Ersatzlos raus: `#wk-hr`, `.wk-hr`-CSS, `_pollHeartRate`, `_startHrPolling`,
`_stopHrPolling` und deren vier Aufrufstellen (`startActive`, Restore des
aktiven Trainings, `finishWk`, `cancelWk`). Der Wert wurde nirgends sonst
verwendet; ohne Anzeige wuerde das Plugin alle 15 s fuer nichts geweckt.

**Nicht** betroffen: `_saveWorkoutToHealthKit` — Trainings landen weiter in
Apple Health, `S.healthKitEnabled` bleibt der Schalter dafuer.

### Projektregeln

- Uhr als inline-SVG mit `currentColor`, kein Emoji. Das alte `❤️` in
  `#wk-hr` verschwindet mit der Herzfrequenz.
- Neue Texte in `I18N_EN`: `Pause`, `Sätze`. Fuer `3/12 Sätze` eine
  `I18N_RX`-Regel (`/^(\d+)\/(\d+) Sätze$/` → `$1/$2 sets`).
- `APP_VERSION` in `index.html` und `CACHE` in `sw.js` gleich hochziehen.

## Pruefung

- `test/workout-bar.test.js`: `setProgress` (leer, gemischt, alles erledigt,
  Aufwaermsaetze), `restFraction` (0, halb, voll, `total<=0`, Ueberlauf).
- Simulator (iPhone 17), von Hand: Ruhe, laufende Pause inkl. `−15/+15/✕`,
  Coach-Nachricht ein/aus, Training mit genau einer Uebung, Blaettern nach
  dem Wegfall des ersten Haltes.

## Bewusst nicht dabei

- Aussehen der Uebungskarten selbst.
- Verhalten des Blaetterns (ein Wisch = eine Uebung) — bleibt wie gebaut.
- Der Abbrechen-Knopf am Listenende.
