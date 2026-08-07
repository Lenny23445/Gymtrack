# Gewichts-Dial im Heute-Widget

**Datum:** 2026-08-07
**Status:** Design abgenommen

## Problem

Gewicht eintragen kostet heute vier Schritte: Heute-Tab → `+` auf der Körpergewicht-Karte →
Sheet öffnet → Zahl tippen → Speichern. Das ist genug Reibung, dass die Kurve löchrig bleibt.
Gewünscht ist eine Eingabe direkt auf der Startseite, deren Ergebnis sofort im Diagramm landet.

Vorlage ist ein React-Widget (`motion/react`, Tailwind, `next-themes`) — ein horizontales
Zahlenrad mit Bogen-Perspektive. GymTrack ist klassisches Vanilla-JS ohne Build-Step für
Komponenten, der Code wird also portiert, nicht eingebunden.

## Nicht-Ziele

- Kein neues Datenmodell. `S.weightLog` = `[{date:'YYYY-MM-DD', weight}]` bleibt unverändert,
  ebenso Mini-Chart, Vollbild-Chart, Verlaufsliste, Cloud-Sync und HealthKit-Anbindung.
- Das Sheet `ov-weight-entry` bleibt wie es ist. Es ist der Weg für **andere** Daten
  (nachtragen, korrigieren, löschen); das Dial schreibt ausschliesslich den heutigen Tag.
- Keine Änderung an Statistik-Tab, Zielgewicht-Sheet oder Einheiten-Umschaltung.

## Abweichung von der Vorlage: 1:1-Drag statt Flick

Das Original ist ein Flick-Picker. `handlePan` begrenzt die sichtbare Bewegung auf ±1 Einheit
(`maxOffset = pixelsPerUnit`), `handlePanEnd` springt aus Richtung und Geschwindigkeit genau
**eine** Zahl weiter (`direction = ±1`). Bei ganzen Einheiten ist das stimmig.

Bei der hier gewählten Rastung von 0,1 kg wären das zehn Wischer pro Kilogramm. Der Streifen
folgt deshalb 1:1 dem Finger, rastet beim Loslassen auf den nächsten 0,1er ein und trägt den
Schwung nach. Die Optik — Bogen, Rotation, Ausblenden nach aussen — bleibt unverändert.

## Widget

Der bestehende Widget-Typ `weight` wird umgebaut, es kommt kein zweiter Gewichts-Typ dazu.

| Grösse | Inhalt |
|---|---|
| `sm`, `md` | unverändert: Zahl + Einheit + Delta, Tipp öffnet das Vollbild-Diagramm |
| `lg` | Dial oben, darunter Delta, Mini-Chart und Ziel-Balken |

Auf einer `md`-Kachel (eine Rastereinheit, ~78 px hoch) ist ein Dial nicht bedienbar — deshalb
die Beschränkung auf `lg`. `lgRows` steigt von 3 auf 4, sonst wird der Block gequetscht.

Im `DEFAULT_HEUTE_LAYOUT` wechselt `weight` von `size:'md'` auf `size:'lg'`, damit das Dial ohne
Zutun auf der Startseite steht. Wer bereits ein eigenes Raster gespeichert hat, behält seine
Grösse — `getHeuteLayout()` liest dann `S.heuteLayout` und das Standardlayout greift gar nicht.

## Dial

- Ein Streifen `.wdial-track` mit `transform: translateX(-wert * PPU)`. PPU ≈ 160 px/kg,
  also 16 px pro 0,1er-Tick.
- Ticks von `wert−3` bis `wert+3` in 0,1-Schritten (≈61 Knoten), Beschriftung nur auf ganzen
  Kilogramm. Das Fenster wird neu gebaut, wenn eine ganze Zahl überschritten wird — nicht
  pro Frame.
- Der Bogen-Effekt pro Tick (`opacity`, `scale`, `y`, `rotate`) läuft in einer rAF-Schleife aus
  dem Abstand zur Mitte, mit denselben Stützstellen wie die `useTransform`-Ketten der Vorlage.
- Die Farb-Interpolation der Vorlage entfällt; die Tiefenwirkung kommt allein aus `opacity`.
  61 × `color` pro Frame ist auf dem iPhone teuer und optisch nicht unterscheidbar.
- Feder statt CSS-Transition: kleiner Spring-Integrator im rAF (Bounce ≈ 0,45 wie im Original).
  Eine CSS-Transition wäre billiger, liefert aber den Zwischenwert nicht, den die
  Bogen-Berechnung jedes Frame braucht.
- `touch-action: pan-y` auf dem Dial: horizontal zieht das Rad, vertikal scrollt der Heute-Tab
  weiter.
- Haptik: leichter Tick bei jedem eingerasteten 0,1er, gedrosselt auf höchstens alle 50 ms.
- Bereich abhängig von `S.unitMode`: kg 30–250, lbs 66–550.

## Datenfluss

`upsertWeightEntry(date, weight)` wird aus `saveWeightEntry()` herausgezogen und von beiden
Eingabewegen benutzt — eine einzige Schreibstelle, inklusive HealthKit-Weitergabe.

Nach dem Einrasten: 600 ms Debounce → Upsert auf das **heutige** Datum (überschreibt einen
vorhandenen Eintrag desselben Tages, hängt keinen zweiten an) → `persist()` (der Cloud-Push
ist dort ohnehin gedrosselt) → partielles Neuzeichnen von Delta, Mini-Chart und Ziel-Balken.

Bewusst **kein** `renderWeightCard()` nach dem Commit: das würde den Streifen unter dem Finger
neu bauen und die laufende Geste abreissen.

## Invariante: nie ohne Geste schreiben

Ohne Eintrag muss das Dial trotzdem eine Zahl zeigen. Startwert ist der letzte Log-Eintrag,
sonst `S.weightStart`, sonst 75.

Dieser Anfangswert darf **niemals** committen. Geschrieben wird ausschliesslich nach einer
echten Nutzer-Geste. Andernfalls legt jeder App-Start bei jedem Nutzer, der nie Gewicht
getrackt hat, einen 75-kg-Eintrag an und erzeugt eine Kurve aus dem Nichts.

## Berührte Dateien

| Datei | Änderung |
|---|---|
| `js/app-session.js` | Dial-Logik, `upsertWeightEntry`, Umbau `renderWeightCard` |
| `css/app.css` | Dial-Styles |
| `js/app-ui.js` | `lgRows` 3 → 4, Standardgrösse `md` → `lg` |
| `js/app-i18n.js` | neue englische Strings, `APP_VERSION` |
| `sw.js` | `CACHE` |

## Abnahme

`npm test` (670 grün) und `node smoke.js`. Zusätzlich im iOS-Simulator prüfen, dass vertikales
Scrollen über dem Dial weiterhin funktioniert und ein frisch installiertes Profil ohne Geste
keinen Eintrag bekommt.
