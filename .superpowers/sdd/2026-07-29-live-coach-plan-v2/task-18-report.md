# Task 18 — `js/coach-notify.js` + `test/coach-notify.test.js`

Block 4, erste Task. Frequenz-Deckel und Planung der lokalen Meldungen. Zwei Dateien,
sonst nichts angefasst.

## Oeffentliche API

| Signatur | Rueckgabe |
| --- | --- |
| `notifyNew()` | `{sentTs:{}, dayCount:0, dayKey:'', weekCount:0, weekKey:''}` |
| `weekKey(ts [, tzOffsetMin])` | `'2026-W31'` oder `null` |
| `dayKey(ts [, tzOffsetMin])` | `'2026-07-29'` oder `''` |
| `mayNotify(state, kind, level, now [, tzOffsetMin])` | `boolean` |
| `record(state, kind, now [, tzOffsetMin])` | neuer State (nie in-place) |
| `planAll(ctx)` | `[{id, at, kind, key, vars}]`, zeitlich sortiert, Deckel angewandt |
| `CAPS` | `{still:{day:0,week:0}, normal:{day:1,week:4}, eng:{day:2,week:8}}` |
| `COOLDOWN` | `{prCongrats:0, deload:7d, returnNudge:5d, anniversary:365d, reminderPlan:0, report:6d}` |
| `UNCAPPED` | `['report']` |
| `KINDS`, `KEY_OF`, `QUIET_FROM`, `QUIET_TO`, `WAKE_HOUR`, `RETURN_AFTER` | Konstanten, fuer Task 19 und die Tests |

`ctx` von `planAll`:

```
{ now, level, state, tzOffsetMin, workoutActive,
  reportAt, reportVol,
  nextWorkout: {at, ex, kg, sets, reps},
  lastWorkoutTs, deload, anniversary:{ex,kg}, pr:{ex,kg} }
```

Kandidat -> Satzschluessel: `report -> reportReady`, sonst Art = Schluessel.
Das Modul formuliert nichts; `CoachPersona.say(key, vars, persona, lang)` an der
Aufrufstelle.

## Entscheidungen

**Was aus dem Brief kommt** (Deckelzahlen, Cooldowns, `UNCAPPED`, Kandidaten-
Vorlaufzeiten, `id = kind + ':' + dayKey(at)`, fortgeschriebener Zustand, Vergangenes
streichen) ist woertlich umgesetzt und wird nicht wiederholt. Alles Folgende hat der
Brief offen gelassen.

**Wochenschluessel kommt aus `CoachAnalyze.isoWeekKey()`.** Keine zweite Wochenrechnung
gebaut. Aufgeloest wird spaet (`root.CoachAnalyze`, in Node ueber `require('./coach-analyze.js')`)
und ein Fehlschlag wird **nicht** gemerkt — im Browser haengt es an der Reihenfolge der
`<script>`-Tags, ein zu frueh gemerktes `null` waere dauerhaft.
**Harte Anforderung an Task 19:** `js/coach-notify.js` muss in `index.html` **nach**
`js/coach-analyze.js` stehen (heute Zeile 5707) und in `build.js` (Dateiliste) sowie
`sw.js` (Cache) nachgetragen werden. Ein Test (`weekKey ist die Rechnung aus CoachAnalyze`)
haelt fest, dass der Schluessel nicht `null` wird.

**Fehlt die Wochenrechnung, sperrt der Deckel statt zu oeffnen.** `mayNotify` gibt fuer
gedeckelte Arten `false` zurueck, wenn `weekKey` `null` liefert. Ein Frequenz-Deckel, der
bei fehlender Abhaengigkeit durchlaesst, ist genau der Fehler, gegen den dieser Baustein
gebaut ist. Der Wochenbericht kommt weiterhin durch.

**Mindestabstand gilt auch fuer `report`.** `UNCAPPED` nimmt den Bericht aus dem Tages-
und Wochendeckel und laesst ihn dort auch nicht mitzaehlen — aber `COOLDOWN.report = 6 Tage`
waere sonst eine tote Zahl im Brief. Reihenfolge in `mayNotify`: Zeit -> bekannte Art ->
Cooldown -> `UNCAPPED` -> Stufe -> Tag -> Woche.

**Unbekannte Art faellt durch, unbekannte Stufe gilt als `'still'`.** Ein Tippfehler im
Aufruf soll keine Meldung erzeugen, die weder Deckel noch Cooldown kennt; nach oben zu
raten ist hier der teurere Fehler.

**Nacht (offen im Brief).** Ortszeitfenster 22:00–07:00, verschoben auf 08:00 Ortszeit
(`QUIET_FROM`/`QUIET_TO`/`WAKE_HOUR`). Immer nach vorn, nie zurueck — ein Termin, der in
der Zukunft lag, bleibt in der Zukunft. Geschoben wird **vor** der Zaehlung, weil sich
dabei der Kalendertag aendert, und **nach** dem Streichen des Vergangenen, weil ein
verstrichener Termin sonst durch die Korrektur wiederbelebt wuerde.

**Zeitzone (offen im Brief).** `dayKey`/`weekKey`/`mayNotify`/`record` bekommen ein
optionales `tzOffsetMin` (Minuten oestlich UTC, `-new Date().getTimezoneOffset()`), Standard
`0` — die Signaturen aus dem Brief verhalten sich damit unveraendert. Ohne den Wert waere
der Tagesdeckel auf UTC gerechnet: fuer jemanden auf UTC+9 liegen Vormittag und Abend
desselben lokalen Tages auf zwei UTC-Tagen, er bekaeme also das doppelte Tagesbudget.
`planAll` reicht `ctx.tzOffsetMin` durch. Ein Zeitzonenwechsel aendert damit den Schluessel
mitten in einem Tag — der Zaehler springt dann einmal auf 1. Bewusst in Kauf genommen:
die Alternative (UTC) ist im Alltag jeden Tag falsch, diese hier nur beim Flug.

**Sommerzeit.** Der Versatz gilt fuer den ganzen Plan. Ueber eine Umstellung hinweg liegt
eine Meldung hoechstens eine Stunde daneben — an den Raendern des Nachtfensters (08:00 statt
07:00 oder 09:00) also nie im echten Schlaf. Cooldowns sind absolute Millisekunden und
deshalb von der Umstellung gar nicht betroffen. Die App plant bei jedem Start neu, die
stabile `id` verhindert dabei Dubletten.

**Nutzer trainiert gerade (offen im Brief).** `ctx.workoutActive === true` streicht
`reminderPlan` (wer in der Halle steht, braucht keine Ansage, was heute ansteht) und
`deload` (ein Deload-Rat mitten im Satz). `prCongrats` bleibt — er ist die Antwort auf das,
was eine Minute vorher passiert ist. `report`, `returnNudge`, `anniversary` bleiben, ihre
Termine liegen weit genug weg.

**App war lange nicht offen.** Faellt aus der bestehenden Mechanik: Tages- und
Wochenschluessel stimmen nicht mehr ueberein, die Zaehler springen auf 1; Cooldowns sind
absolut und laufen von selbst ab; verstrichene Termine werden gestrichen. Der `returnNudge`
wird dabei ausdruecklich **nachgezogen** (`lastWorkoutTs + 5 Tage` liegt in der Vergangenheit
-> `now + 5 Tage`), und `{days}` wird nach dem Verschieben neu gerechnet — sonst haette der
Coach nach acht Wochen Pause "seit 5 Tagen keine Einheit" gesagt.

**`state` wird nicht geglaubt.** `norm()` prueft jedes Feld, weil der Zustand aus dem
Speicher kommt: ein kaputtes `dayCount` waere geschenktes Budget, ein kaputtes `sentTs` ein
uebersprungener Cooldown. `record` schreibt fort und mutiert nie — ein verworfener
Rueckgabewert darf nicht trotzdem gegen das Budget zaehlen (dieselbe Lehre wie in
`coach-session.js`).

**Gestaltungsregel 8.** `NEEDS` je Satzschluessel: `reportReady:[vol]`,
`reminderPlan:[ex,kg,sets,reps]`, `returnNudge:[days]`, `anniversary:[ex,kg]`,
`prCongrats:[ex,kg]`, `deload:[]`. Fehlt ein Wert, faellt der Kandidat **in der Planung**
aus statt beim Senden — `CoachPersona.fill()` entfernt den Platzhalter samt Leerzeichen,
die Einheit daneben bleibt stehen ("kg in dieser Woche"). `deload` steht mit leerer Liste
da, weil sein Satz in allen vier Toenen eine Beobachtung traegt und keinen Platzhalter.
Zahlen muessen `> 0` sein: 0 ist hier keine Aussage, sondern eine fehlende Messung.

**Emojis.** Das Modul erzeugt keinen Text, insofern trivial erfuellt — aber der
Uebungsname ist Nutzereingabe und wandert ungefiltert in die Meldung. `cleanName()` streicht
Symbol- und Emoji-Bereiche, Steuerzeichen und Klammern, faltet Leerraum und deckelt auf 40
Zeichen (eine Meldung ist eine Zeile). Umlaute bleiben. Bleibt nichts uebrig, greift Regel 8
und die Meldung faellt aus.

**`id` ohne Nutzereingabe und ohne Uhrzeit.** `kind + ':' + dayKey(at)`. Beides waere bei
jedem Lauf ein anderer Wert und damit eine neue Meldung statt derselben.

**`planAll` ohne verlaessliche Uhrzeit gibt `[]` zurueck.** Kein `Date.now()` im Modul —
ohne `ctx.now` waere jeder Plan geraten.

## Welcher Testfall faengt welchen Fehler

Belegt durch die Mutationsprobe (unten), hier die Zuordnung Regel -> Test:

| Tragende Regel | Test, der stirbt, wenn sie faellt |
| --- | --- |
| `CAPS.still` ist `{0,0}` | still ist still; auf still bleibt nur der Bericht; die Zahlen des Deckels |
| Mindestabstand je Art | Mindestabstand von sechs Tagen; Jahresrueckblick 365; Anstoss 5 |
| Tagesdeckel | normal 1/Tag; eng 2/Tag; Tageszaehler laeuft zurueck; je Kalendertag hoechstens eine; lokaler Kalendertag |
| Tageszaehler **springt** auf 1 | der Tageszaehler zaehlt nur den laufenden Tag |
| Wochendeckel | vier Meldungen in einer Woche sind das Ende |
| Wochenzaehler **springt** auf 1 | der Wochenzaehler zaehlt nur die laufende Woche |
| `UNCAPPED` | Bericht auf still; Bericht nicht gegen den Deckel; Bericht verbraucht kein Tagesbudget |
| fortgeschriebener Zustand in `planAll` | je Kalendertag hoechstens eine Meldung |
| Vergangenes streichen | kein Termin liegt in der Vergangenheit |
| Sortierung | der Plan ist nach Zeit sortiert; je Kalendertag hoechstens eine |
| stabile `id` | derselbe Kontext ergibt zweimal denselben Plan |
| Nachtfenster + Weckstunde | nachts meldet sich niemand; Nachtfenster nach Zeitzone |
| Ortszeit im Tagesschluessel | der Tagesdeckel richtet sich nach dem lokalen Kalendertag |
| Regel 8 | eine Meldung ohne ihre Zahl; ein Name aus lauter Symbolen |
| `cleanName` | kein Rueckgabewert traegt ein Emoji; ein Name aus lauter Symbolen |
| unbekannte Art | eine unbekannte Art kommt nicht durch |
| `record` mutiert nicht | record schreibt fort und mutiert nicht |
| `returnNudge` nachziehen + `{days}` neu rechnen | der Anstoss nennt die tatsaechlichen Tage |
| laufendes Training | wer gerade trainiert, bekommt keine Erinnerung |
| `now` Pflicht | ohne verlaessliche Uhrzeit wird nichts geplant |
| `weekKey` delegiert an CoachAnalyze | weekKey fuehrende Null; Jahreswechsel; weekKey ist die Rechnung aus CoachAnalyze |
| `dayKey` zweistellig | dayKey liefert das Datum zweistellig; derselbe Kontext zweimal |
| vollstaendige `vars` je Schluessel | jede geplante Meldung ergibt einen ganzen Satz |

### Vollstaendigkeitstest (Pflicht 1)

`jede geplante Meldung ergibt in vier Toenen und zwei Sprachen einen ganzen Satz` faehrt
**jede** der sechs Arten einzeln durch `planAll` (Kontext ohne alle anderen Quellen) und
rendert die Rueckgabe ueber `CoachPersona.say` in 4 Toenen x 2 Sprachen = 48 Saetze. Geprueft
wird dreifach:

1. nicht leer,
2. kein Rest `/\{[a-z]+\}/i`,
3. **Koeder-Probe**: zusaetzlich zu den echten Werten bekommt jeder Platzhalternamen des
   Katalogs (`count days ex kg mins pct reps secs sets vol weeks`) den Wert `KOEDER`.
   Taucht `KOEDER` im Satz auf, verlangt eine Vorlage einen Wert, den das Modul nie schickt.

Punkt 3 ist der eigentliche Riegel gegen den Block-3-Befund ("zuletzt kg bei 8
Wiederholungen"): `fill()` entfernt den unbefuellten Platzhalter samt Leerzeichen, eine
Suche nach `{kg}` schlaegt deshalb **nie** an. Die Mutation M25 (`reminderPlan` schickt
`{reps}` nicht mit) wird genau von dieser Probe getoetet, von nichts sonst.

Die Gegenrichtung ist auch abgedeckt: fuer jeden mitgeschickten Wert wird geprueft, dass
sein Weglassen mindestens einen der acht Saetze aendert. Ein toter Platzhalter macht die
Meldung nicht reicher, er verschaerft nur Regel 8 und streicht Meldungen, die haetten kommen
duerfen (Mutation M26).

Ein Coverage-Assert am Ende stellt sicher, dass wirklich alle sechs Arten geprueft wurden —
sonst haette ein still gestrichener Kandidat den Test gruen gelassen.

### Gestrichene Testfaelle

- **Heuristik "Einheit ohne Zahl"** (erste Fassung): ein Regex, der im gerenderten Satz nach
  einer Einheit ohne vorangehende Zahl suchte ("kg", "Saetze", "reps"). Gestrichen: die
  Umschreibungen zum Wegnormalisieren der Treffer waren so verschachtelt, dass der Test
  eher auf eigene Regex-Fehler als auf Modulfehler reagiert haette, und er haette bei jeder
  Katalogaenderung falsch angeschlagen. Ersetzt durch die Koeder-Probe, die denselben Fehler
  exakt und ohne Heuristik faengt.
- **Nichts weiter gestrichen.** Die Testfall-Tabelle des Briefs ist vollstaendig umgesetzt.
  Zwei Faelle wurden **verschaerft**, weil sie in der Briefform bei einem plausiblen Bug
  gruen geblieben waeren:
  - `dayKey(T0)` nur gegen `/^\d{4}-\d{2}-\d{2}/` zu pruefen laesst jedes falsche Datum durch;
    zusaetzlich `=== '2026-07-29'` und `dayKey(Date.UTC(2026,0,5)) === '2026-01-05'`.
  - `weekKey(Date.UTC(2027,0,1))` gegen `/^20(26|27)-W\d{2}$/` ist absichtlich weit; ergaenzt
    um einen Gleichheitstest gegen `CoachAnalyze.isoWeekKey` ueber vier Zeitpunkte.

## Laeufe

**Rot** (`node --test test/coach-notify.test.js` gegen einen Platzhalter, der jede Funktion
leer/permissiv beantwortet): **32 Tests, 7 pass, 25 fail**. Die 7 Durchlaeufer waren die
Faelle, die gegen `mayNotify -> true` bzw. `planAll -> []` leer gruen sind; sie sind spaeter
alle in der Mutationsprobe als nicht-leer belegt. Der allererste Lauf schlug mit
`MODULE_NOT_FOUND` fehl, weil das Modul noch nicht existierte.

**Gruen**: `node --test test/coach-notify.test.js` -> **34/34**, nach den zwei aus der
Mutationsprobe nachgezogenen Tests **36/36**.

**Gesamtsuite**: `node --test test/*.js` -> **462 Tests, 462 pass, 0 fail**.
Ausgangsstand 426, also +36 und kein bestehender Test gekippt.

## Mutationsprobe

Kopie von `js/` + `test/coach-notify.test.js` im Scratchpad, Treiber `probe.js`: jede
Mutation wird einzeln in die Modulkopie geschrieben, die Suite laeuft, danach wird die Kopie
zurueckgesetzt. Repo dabei nicht angefasst.

**26 Mutationen, erster Lauf: 24 tot, 2 ueberlebt.**

Ueberlebt haben:

- **M3** `dayCount: s.dayCount + 1` (Tageszaehler springt nicht auf 1 zurueck)
- **M5** `weekCount: s.weekCount + 1` (Wochenzaehler springt nicht auf 1 zurueck)

Der Grund ist derselbe und lehrreich: die Brief-Tests pruefen den Zaehler immer nur ueber
**eine** Grenze hinweg. Nach einem einzigen `record` ist der Tagesschluessel am naechsten Tag
verschieden, der Vergleich `dk === s.dayKey` scheitert und der Zaehlerstand wird gar nicht
gelesen. Der Fehler zeigt sich erst, wenn **nach** dem Grenzuebertritt ein zweites Mal
gemeldet wird. Zwei Tests nachgezogen:

- `der Tageszaehler zaehlt nur den laufenden Tag` — `record(T0)`, `record(T0+1d)`, dann
  `dayCount === 1` und auf `'eng'` ist am zweiten Tag noch ein Platz frei.
- `der Wochenzaehler zaehlt nur die laufende Woche` — vier Meldungen in W31, eine in W32,
  dann `weekCount === 1` und auf `'normal'` ist in W32 noch Platz.

**Zweiter Lauf: 26 Mutationen, 26 tot, 0 Ueberlebende.**

Vollstaendige Liste der Mutationen: still nicht mehr still; Mindestabstand weg;
Tageszaehler ohne Ruecksprung; Wochendeckel ungeprueft; Wochenzaehler ohne Ruecksprung;
`UNCAPPED` leer; Tagesdeckel ungeprueft; kein fortgeschriebener Zustand; Vergangenes bleibt;
keine Sortierung; `id` mit Uhrzeit; Nachtfenster weg; Regel 8 weg; Deckel in UTC statt
Ortszeit; Symbole bleiben im Namen; unbekannte Art durchgelassen; `record` mutiert;
verstrichener Anstoss nicht nachgezogen; laufendes Training ignoriert; `now` nicht mehr
Pflicht; Weckstunde 03 statt 08; eigene Wochenrechnung statt `CoachAnalyze`; `dayKey` ohne
fuehrende Null; `{days}` fest auf 5; `reminderPlan` ohne `{reps}`; `anniversary` mit totem
`{secs}`.

## Offene Punkte fuer Task 19

1. `js/coach-notify.js` in `index.html` **nach** `js/coach-analyze.js` einbinden, in
   `build.js` (Dateiliste) und `sw.js` (Cache) nachtragen.
2. `ctx.tzOffsetMin` mit `-new Date().getTimezoneOffset()` fuellen, sonst rechnet der
   Tagesdeckel in UTC.
3. Bei jedem App-Start neu planen und die vorhandenen Meldungen ueber die stabile `id`
   abgleichen; `record()` erst beim tatsaechlichen Zustellen aufrufen, nicht beim Planen —
   `planAll` fuehrt den Zustand nur intern fort und gibt ihn nicht zurueck.
4. Der Zustand gehoert in den Speicher (`localStorage`), das Modul fasst ihn nicht an.
