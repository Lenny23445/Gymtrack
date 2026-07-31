# Task 15 — Report: Satz-Rueckfrage leicht / passend / schwer

Angelegt: `js/coach-rpe.js`, `test/coach-rpe.test.js`. Sonst keine Datei
angefasst (kein `index.html`, kein `sw.js`, kein `build.js`, kein
`package.json`). Kein Commit.

## Oeffentliche API

| Signatur | Rueckgabe |
| --- | --- |
| `CoachRpe.toRpe(answer)` | `6` (leicht/easy), `8` (passend/ok), `9.5` (schwer/hard), sonst `null` |
| `CoachRpe.adjustNext(kg, answer, step)` | naechstes Gewicht als Zahl auf dem Raster `step`, `null` wenn `kg` unbrauchbar |
| `CoachRpe.ackFor(answer, nextKg)` | `{key:'setAckEasy'\|'setAckHard', vars:{kg}}` oder `null` |
| `CoachRpe.summarize(answers)` | `{easy, ok, hard, trend:'easy'\|'ok'\|'hard'}` |
| Konstanten | `RPE = {easy:6, ok:8, hard:9.5}`, `DEFAULT_STEP = 2.5`, `TREND_MIN = 2` |

Bauart wie `js/coach-log.js`: IIFE ueber `globalThis`, `'use strict'`, reine
Funktionen, kein DOM, keine App-Globals, `module.exports = API` **und**
`root.CoachRpe = API`. Kein `fetch`, kein `localStorage`, kein `Date.now()`
(das Modul haelt keinen Zustand — Zeitstempel entstehen erst an der
Verdrahtung, dort in ms).

## Entscheidungen

**Antwort → Richtung.** `leicht` = genau eine Schrittweite rauf, `schwer` =
genau eine runter, `passend` = stehen lassen. Unbekannte Antwort und
**keine** Antwort verhalten sich wie `passend`, geben also `kg` unveraendert
zurueck: die Rueckfrage verschwindet nach 8 Sekunden unbeantwortet, und das
ist ein gueltiger Zustand, kein Fehler. Groessere Spruenge waeren aus einer
einzelnen Gefuehlsangabe nicht gedeckt.

**Rechnen in Raster-Einheiten, nicht in Kilo.** `adjustNext` rechnet
`units = kg / step`, bewegt sich um eine Einheit und multipliziert zurueck.
Damit ist das Ergebnis immer ein Vielfaches der Schrittweite und auflegbar;
63,7 kg kann als Vorschlag nicht entstehen. Abschluss mit
`Math.round(v * 1000) / 1000`, damit kein Float-Rest wie `57.499999999` in
die Anzeige laeuft, und eine 1e-9-Toleranz, bevor gerundet wird — sonst
haette ein Gewicht, das durch Float-Rauschen knapp unter der Rasterstufe
liegt, still eine Stufe verloren.

**Krumme Ausgangsgewichte** (Import, Maschine mit eigenem Raster): Ergebnis
ist die **naechste Rasterstufe strikt in die gewuenschte Richtung**
(`leicht`: `floor(q)+1`, `schwer`: `ceil(q)-1`). Bei 63,7 kg und Raster 2,5
also 65 bzw. 62,5. Verworfene Alternative: erst auf das Raster runden, dann
eine Stufe — die haette bei 63,7 kg / `schwer` auf 60 gefuehrt, also 3,7 kg
Abzug fuer eine Antwort, die eine Stufe bedeutet. Auf dem Raster liegende
Gewichte (alle Faelle der Brief-Tabelle) verhalten sich in beiden Varianten
identisch. **Zwei eigene Testerwartungen wurden nach dem roten Lauf auf diese
Regel korrigiert** (`adjustNext(61,'schwer',2.5)`: 57,5 → 60;
`adjustNext(63.7,'leicht',2.5)`: 67,5 → 65) — die Erwartungen hatten
stillschweigend die verworfene Variante kodiert. Kein Brief-Testfall wurde
angetastet.

**Untergrenze.** `units < 1` wird auf 1 geklemmt: der Vorschlag faellt nie
auf 0, nie negativ, nie unter eine Schrittweite.

**Fehlende Schrittweite.** `step` nicht endlich oder `<= 0` ⇒ `2.5`
(Langhantel, 2 x 1,25 kg). Unbrauchbares `kg` (nicht endlich, `<= 0`) ⇒
`null` statt Rateversuch: die Aufrufstelle behaelt dann ihren alten
Vorschlag.

**Trend.** `hard` wenn `hard > easy && hard >= 2`, `easy` spiegelbildlich,
sonst `ok`. Unsinn und unbeantwortete Saetze zaehlen in **keinen** Eimer —
insbesondere nicht als `passend`, sonst haetten Nicht-Antworten den Trend
mitbestimmt.

**`ackFor` als Zugabe zur Brief-Tabelle.** Der Brief verlangt eine Quittung
mit dem neuen Gewicht (`setAckEasy` / `setAckHard`), und die globale Regel
verbietet fertige Saetze im Modul. `ackFor` liefert deshalb nur
Schluessel + Platzhalter fuer `CoachPersona.say(key, vars, persona, lang)`;
die Verdrahtung waehlt keinen Schluessel selbst. Bei `passend` und ohne
Antwort gibt es `null` — keine Aeusserung ohne Neuigkeit.

**Zweisprachigkeit.** Antwortwoerter beider Sprachen (`leicht|easy`,
`passend|ok`, `schwer|hard`) laufen auf denselben internen Eimer,
case- und trim-tolerant. Sprache selbst braucht das Modul nicht: es gibt
keinen Text zurueck.

**Nicht gebaut (gehoert zu Task 17):** `_rpeStoreOnLastSet`,
`_rpeSuggestNext`, `.cb-ask3`-Styles, 8-Sekunden-Timer, Dossier-Schreibweg,
Anbindung an `_ciAdjustW`. Das Modul hat keine Abhaengigkeit auf ein
Nachbarmodul.

## Welcher Testfall faengt welchen Fehler

| Test | Gefangener Fehler |
| --- | --- |
| `toRpe` de / en Zuordnung | 6/8/9,5 vertauscht, EN-Woerter unbekannt |
| `toRpe` Gross-/Kleinschreibung, Leerzeichen | Chip liefert `'Leicht'` und die Antwort verpufft |
| `toRpe('quatsch'/''/7)` ⇒ `null` | stiller Default (z. B. immer 8) |
| `toRpe(null/undefined)` ⇒ `null` | unbeantwortet wird als Antwort gewertet |
| `adjustNext(60,'schwer',2.5) === 57.5` | Richtung vertauscht (exakter Wert, nicht `< 60`) |
| `adjustNext(60,'leicht',2.5) === 62.5` | dito |
| `adjustNext(60,'passend'/'ok',2.5) === 60` | Rauschen im Vorschlag |
| `adjustNext(60,'weissnicht',2.5) === 60` | unbekannte Antwort bewegt etwas |
| `adjustNext(60,null/undefined,2.5) === 60` | unbeantwortete Rueckfrage verschiebt das Gewicht |
| `adjustNext(80,·,step)` fuer `step ∈ {1.25, 2.5, 5}` ⇒ exakt `80 ± step` | Sprung ueber eine Stufe **oder** gar keine Bewegung |
| `adjustNext(62.5,·,2.5)` ⇒ 65 / 60 | krumme Gewichte |
| `adjustNext(61/63.7,·,2.5)` | krummes Ausgangsgewicht erzeugt krummen Vorschlag oder springt zu weit |
| `adjustNext(35/37,·,5)` | Maschinen-Raster wird ignoriert |
| `adjustNext(2.5/1.25/5,'schwer',·)` ⇒ unveraendert | Gewicht faellt auf 0 oder negativ |
| `adjustNext(217.5,'leicht',1.25) === 218.75`, `typeof === 'number'` | Float-Rest bei schweren Gewichten, `toFixed`-String statt Zahl |
| `adjustNext(60,'leicht')`, `step = 0`, `step = -5` | fehlende/kaputte Schrittweite fuehrt auf 0 oder NaN statt auf 2,5 |
| `adjustNext(null/0/NaN,·,·)` ⇒ `null` | NaN-Vorschlag landet in der Anzeige |
| `ackFor('leicht'/'schwer',·)` ⇒ Schluessel + `vars.kg` | Schluessel vertauscht, Satz im Modul gebaut, Gewicht fehlt im Platzhalter |
| `ackFor('passend'/null/'quatsch',·)` ⇒ `null` | Quittung ohne Anlass, zweite Aeusserung gleichzeitig |
| `summarize` drei mal `schwer` / zwei `leicht` + `passend` | Zaehlung und Trendrichtung |
| `summarize(['leicht','schwer','passend'])`, `['schwer','schwer','leicht','leicht']` | Trend bei Gleichstand behauptet |
| `summarize(['schwer'])`, `['leicht']` | Zwei-Schwelle fehlt ⇒ eine Antwort macht einen Trend |
| `summarize(['schwer','schwer','leicht'])`, `['leicht','leicht','schwer']` | Schwelle faelschlich als "alle gleich" implementiert |
| `summarize([])`, `summarize(null)` | wirft |
| `summarize(['leicht',null,'quatsch',undefined])` | unbeantwortet/Unsinn wird als `passend` gezaehlt |
| `summarize(['hard','schwer','ok'])` | EN-Antworten fallen aus der Zaehlung |
| `globalThis.CoachRpe === require(...)` | `root.CoachRpe` fehlt ⇒ Browser-Verdrahtung findet das Modul nicht, Node-Tests bleiben gruen |

**Gestrichene Testfaelle: keine.** Jeder Fall der Brief-Tabelle ist drin;
zehn Faelle bleiben auch gegen ein leeres Skelett gruen (die Negativ-Faelle:
`null`-Rueckgaben, "bewegt nichts", "wirft nicht"), sie fangen aber jeweils
einen plausiblen Fehler der echten Implementierung (stiller Default,
Bewegung ohne Antwort, fehlende Klemmung, ungeschuetzte Schleife) und
bleiben deshalb stehen.

## Rot / Gruen

- **Rot 1:** `node --test test/coach-rpe.test.js` ⇒ `tests 1 / fail 1`,
  `MODULE_NOT_FOUND` fuer `../js/coach-rpe.js`.
- **Rot 2** (Skelett: alle Funktionen liefern `null` bzw. `kg` unveraendert):
  `tests 29 / pass 10 / fail 19`. Gelesen — die 19 Fehlschlaege sind genau
  die Wert-Erwartungen; aus diesem Lauf kam die Korrektur der zwei
  Off-Grid-Erwartungen.
- **Gruen:** `node --test test/coach-rpe.test.js` ⇒ `tests 29 / pass 29 / fail 0`.
- **Gesamtsuite:** `node --test test/*.js` ⇒ `tests 251 / pass 251 / fail 0`
  (Ausgangsstand 222, kein bestehender Test gekippt).
- `git status --short`: nur `?? js/coach-rpe.js`, `?? test/coach-rpe.test.js`.

## Bedenken fuer die Verdrahtung (Task 17)

1. **`setAckHard` sagt etwas anderes, als das Modul rechnet.** Der Text
   lautet z. B. "Wir bleiben bei {kg} kg, bis es sitzt." / "Gewicht bleibt
   bei {kg} kg." — `adjustNext` senkt bei `schwer` aber um eine Stufe. Mit
   dem neuen (niedrigeren) Gewicht im Platzhalter liest sich die Quittung
   falsch. Entweder der Text wird angepasst (nicht Teil dieser Task) oder
   die Verdrahtung uebergibt bei `schwer` bewusst das alte Gewicht — dann
   passt der Satz, aber die Quittung nennt nicht den neuen Vorschlag.
2. **Stangengewicht ist in der Signatur nicht vorgesehen.** Der Brief nennt
   als Untergrenze nur "nie unter eine Schrittweite"; ein Bar-Gewicht-Argument
   habe ich nicht erfunden. Eine Kniebeuge-Empfehlung von 2,5 kg ist damit
   theoretisch moeglich. Wer das verhindern will, klemmt an der Aufrufstelle
   auf das Stangengewicht oder erweitert `adjustNext` um einen vierten
   Parameter.
3. **`ackFor` ist eine Zugabe** zur Drei-Funktionen-Tabelle des Briefs
   (Begruendung oben). Wer sie nicht nutzt, verliert nichts.
