# Task 12 — Modul-Teil: `js/coach-voice.js`

Gebaut auf Windows, ohne Mac. Angefasst wurden **ausschliesslich** zwei neue
Dateien: `js/coach-voice.js` und `test/coach-voice.test.js`. Kein `index.html`,
nichts unter `ios/`, kein `sw.js`, kein `build.js`, keine Version, kein
Changelog. Die Verdrahtung fehlt bewusst und steht unten unter „Was der Mac
noch braucht".

## Oeffentliche API

```js
CoachVoice.available(caps)                       // {tts,stt,webTts,webStt} -> {tts:boolean, stt:boolean}
CoachVoice.pickVoice(voices, preferredId, lang)  // [{id,lang}], string|null, 'de'|'en' -> id | null
CoachVoice.speakable(text)                       // string -> string (fuer das Ohr aufbereitet)
```

IIFE ueber `globalThis`, `'use strict'`, reine Funktionen. `module.exports = API`
**und** `root.CoachVoice = API`, wie `js/coach-log.js`. Kein DOM, keine
App-Globals, kein `localStorage`, kein `Date.now()`, kein `fetch`, kein
`speechSynthesis`, kein Capacitor-Plugin — alles kommt als Argument herein. Ein
Test liest die Moduldatei und prueft genau das (Kommentare vorher entfernt, denn
dort duerfen die Namen stehen: die Begruendung, warum das Modul sie nicht
anfasst, gehoert hinein).

## Entscheidungen und ihre Begruendung

**`available`: nativ ODER Web, aber getrennt je Kanal.** Der Web-Zweig ist kein
Fallback fuer Fehler, sondern der regulaere Pfad im Browser — `_cap()` gibt dort
`null` zurueck. Vorlesen und Diktat werden getrennt beantwortet, weil es zwei
Berechtigungen sind: ein entzogenes Mikrofon darf die Sprachausgabe nicht
mitabschalten. Zurueck kommen echte Booleans (`!!`), nicht die durchgereichten
Eingaben — die Aufrufer liefern `typeof`-Ergebnisse und `null`, und der
Rueckgabewert landet in einem „wenn nicht, dann Knopf weg"-Vergleich.

**`pickVoice`: Sprache schlaegt Wunsch.** Der Brief nennt die Reihenfolge
Wunsch → erste passende Sprache → `null`. Der Wunsch gilt hier **nur innerhalb
der passenden Sprache**: eine gespeicherte englische Stimme darf einen deutschen
Satz nicht kapern, und `null` heisst fuer den Aufrufer „nimm die Systemstimme" —
das ist die bessere Antwort als eine Stimme in der falschen Sprache. Verglichen
wird der Sprachteil vor dem ersten `-`/`_`, gross/klein egal, Raender getrimmt
(`de`, `de-DE`, `de_AT`, `DE-DE` sind dieselbe Sprache); die hereingereichte
Sprache wird genauso normalisiert, damit auch ein `'de-DE'` vom Aufrufer traegt.

**`pickVoice` ohne Sprache liefert `null`.** Ohne Sprache laesst sich nicht
sagen, welche Stimme richtig waere; geraten wird nicht. Die Anzeige reicht immer
eine Sprache herein — kommt hier nichts an, ist das ein Fehler beim Aufrufer und
soll sich nicht als englische Stimme im deutschen Satz tarnen.

**Kein Lookbehind im ganzen Modul.** `(?<!...)` waere fuer die Wortgrenzen die
kuerzere Schreibweise, aber aeltere WebKit-Versionen werfen daran schon beim
**Laden** des Skripts einen `SyntaxError` — nicht erst beim Aufruf. Das Modul
waere dann komplett weg, samt der Faehigkeitspruefung, die den Sprech-Knopf
ausblenden soll. Stattdessen faengt eine Gruppe `(^|[^Buchstabe])` das Zeichen
davor ein und gibt es ueber `$1` zurueck.

**Wortgrenze bei `kg`/`Wdh` selbst gebaut statt `\b`.** `\b` kennt nur ASCII und
haette `62,5kg` als Wortmitte eingestuft — der haeufigste Fall ueberhaupt.
Erlaubt ist darum eine Ziffer davor, verboten ein Buchstabe davor
(`Rückgrat` bleibt `Rückgrat`) und ein Buchstabe/eine Ziffer danach
(`12 kgs` bleibt `12 kgs`). Das eingefuegte Leerzeichen (`'$1 Kilo'`) zieht der
Leerraum-Schritt am Ende wieder zusammen.

**`@` wird immer ersetzt, auch in einer Adresse.** Eine Ausnahme fuer
wortumschlossene At-Zeichen ist die naheliegende Idee — sie macht aber genau den
Hauptfall `8@62,5kg` kaputt, denn dort steht das `@` ebenfalls zwischen
Wortzeichen. `max@example.com` wird also zu `max bei example.com`; verloren geht
dabei nichts, und Adressen liest der Coach ohnehin nicht vor. Bewusst als Test
festgehalten, damit die Entscheidung nicht spaeter „repariert" wird.

**Fettschrift nur als Paar, ohne Stern dazwischen (`[^*]+`).** Ein gieriges
`(.+)` verschluckt bei zwei fetten Stellen alles dazwischen. Ein halbes Sternpaar
bleibt unangetastet stehen, statt Text mitzureissen — `**` blind zu loeschen
waere die destruktivere Wahl.

**Zeilenumbrueche bleiben erhalten.** Zusammengezogen wird nur waagerechter
Leerraum (`[ \t]+`), Leerraum um Umbrueche faellt weg, dann `trim()`. Ein
`\s+`-Sammelgriff haette die Liste zu einem einzigen Satz verschmolzen, den die
Sprachausgabe in einem Zug herunterliest — die Umbrueche sind ihre Atempausen.
`\r\n` wird vorher zu `\n` normalisiert, damit kein Wagenruecklauf im Sprechtext
landet.

**Was kein String ist, ergibt `''`.** Kein Wurf, kein `String(null)` — das
gesprochene Wort waere sonst „null". Die Sprachausgabe darf den Ablauf nie
stoeren.

## Testfaelle und der Fehler, den sie fangen

Alle Pruefungen vergleichen den **exakten** String, nie ein Enthaltensein: eine
Teilpruefung uebersieht genau die fehlende zweite Ersetzung.

| Test | faengt |
| --- | --- |
| native Faehigkeiten werden gemeldet | Rueckgabeform (durchgereichtes `caps`-Objekt) |
| der Web-Zweig zaehlt genauso wie der native | Web-Zweig vergessen → Knopf erscheint im Browser nie |
| ohne jede Faehigkeit ist beides falsch | Knopf erscheint ohne Faehigkeit |
| Vorlesen und Diktat werden getrennt beantwortet | eine Faehigkeit fuer beide Kanaele |
| unsaubere Eingaben werden zu echten Booleans | fehlendes `!!`, `1`/`'ja'` statt `true` |
| ohne Argument wirft available nicht | Wurf bei `null` |
| die gewuenschte Stimme gewinnt | Wunsch ignoriert |
| ist der Wunsch verschwunden, kommt die erste Stimme der richtigen Sprache | Rueckfall auf die **erste Liste** statt auf die **passende Sprache** |
| gibt es die Sprache nicht, gibt es keine Stimme | englische Stimme fuer deutschen Text |
| eine leere Liste wirft nicht | Wurf bei `[]`/`null`/`undefined` |
| eine Wunschstimme in der falschen Sprache wird uebergangen | Wunsch schlaegt Sprache |
| ... ohne Ersatz ergibt null | dieselbe Regel ohne Ausweichstimme |
| bei englischem Text wird eine englische Stimme gewaehlt | fest verdrahtetes `'de'` |
| Regionalkennung und Grossschreibung | `===`-Vergleich statt Sprachteil; fehlendes `toLowerCase`/`trim`; nicht normalisierte Zielsprache |
| kaputte Eintraege werden uebersprungen | Wurf bei `null`-Eintrag / Eintrag ohne `id` oder `lang` |
| ohne Sprache wird nicht geraten | stille Stimmwahl ohne Sprachangabe |
| die Ersetzungstabelle greift vollstaendig in einem Satz | jede einzelne fehlende Ersetzung (Brief-Fall) |
| das Listenzeichen am Zeilenanfang verschwindet | `-`, `•`, `·`, auch eingerueckt |
| ein Strich mitten im Satz bleibt | Aufzaehlungsregel ohne `^`/`m` |
| normaler Text bleibt unveraendert | Regex frisst normalen Text, Schlusspunkt faellt weg |
| leere und fehlende Eingaben | Wurf bei `null`/`{}`, `String(null)` → „null" |
| das Mal-Zeichen auch ohne Leerzeichen | `×` nur zwischen Leerzeichen ersetzt (`3×8`) |
| die Einheit direkt an der Zahl | `\bkg\b` → `62,5kg` bleibt „k g" |
| kg innerhalb eines Wortes wird nicht ersetzt | Wortgrenze aufgehoben (`Rückgrat`, `kgs`) |
| Wdh wird an der Wortgrenze ausgeschrieben | fehlende Ersetzung und aufgehobene Grenze (`Wdhs`) |
| mehrere fette Stellen in einer Zeile | gieriges `(.+)` |
| ein unvollstaendiges Sternpaar frisst keinen Text | blindes Loeschen von `**` |
| eine Adresse bleibt vollstaendig lesbar | Sonderbehandlung fuer `@`, die `8@62,5kg` kaputt macht |
| mehrfache Leerzeichen / Raender | fehlendes Zusammenziehen, fehlendes `trim` |
| eine Liste behaelt ihre Zeilen | fehlendes `m`-Flag; `\s+` verschmilzt die Zeilen |
| Windows-Zeilenenden | `\r` bleibt im Sprechtext |
| das Modul haelt sich an seinen Vertrag | DOM/Globals/Uhr/Netz/Sprachdienst schleichen sich ein; API waechst unbemerkt |

**Gestrichene Testfaelle:** keiner gestrichen. Zwei Faelle wurden dagegen
**nachtraeglich ergaenzt**, weil die Mutationsprobe sie eingefordert hat (siehe
unten): `'5 Wdhs'` und die Sprachkennung mit Leerraum am Rand. Ein Fall wurde
umgebaut statt gestrichen: die Vertragspruefung suchte anfangs im rohen Quelltext
nach verbotenen Namen und waere an einem Kommentar gescheitert, der erklaert,
warum das Modul `speechSynthesis` nicht anfasst — jetzt werden Kommentare vorher
entfernt.

## Rot und gruen

| Lauf | Ergebnis |
| --- | --- |
| rot 1 (`node --test test/coach-voice.test.js`, Modul fehlt) | `MODULE_NOT_FOUND`, 1 Datei rot |
| rot 2 (Platzhaltermodul, alle drei Funktionen leer) | 32 Tests, **8 gruen / 24 rot** |
| gruen (Umsetzung) | 32 Tests, **32 gruen / 0 rot** |
| Gesamtsuite `node --test test/*.js` | vorher **574**, nachher **606**, 0 rot |

Der rote Lauf wurde bewusst zweistufig gefahren: `MODULE_NOT_FOUND` allein ist
kein Beleg dafuer, dass die Tests etwas pruefen. Die acht Tests, die schon am
leeren Platzhalter gruen waren, sind genau die Faelle mit der Erwartung
„`null`/`false`/leer" — das ist erwartet und kein Freibrief; ihre Aussagekraft
belegt erst die Mutationsprobe (M11, M12, M17, M18 toeten sie).

## Mutationsprobe

Auf einer Kopie im Scratchpad
(`…\scratchpad\voice-mut\`), Repo unberuehrt. 21 Mutanten, Treiber
`mutate.js`. **Ergebnis: 0 Ueberlebende von 21.**

Die im Auftrag geforderten Mutationen:

| Mutation | Ergebnis |
| --- | --- |
| M1–M6 je eine Ersetzung der Tabelle entfernt | alle tot (2–4 Tests je Mutant) |
| M7 Wortgrenze bei `kg` aufgehoben | tot (`kg innerhalb eines Wortes …`) |
| M11 Sprachrueckfall durch „erste Stimme" ersetzt | tot (6 Tests) |
| M12 `available` auf „nur nativ" verengt | tot (2 Tests) |

Zusaetzlich geprueft: M8 Wortgrenze `Wdh`, M9 Aufzaehlung ohne Zeilenanker,
M10 gieriges Fettschrift-Muster, M13 ein Faehigkeitswert fuer beide Kanaele,
M14 Wunsch schlaegt Sprache, M15 `\s+` statt waagerechtem Leerraum, M16 `trim`
in `speakable`, M17 `String(text)` statt Typpruefung, M18 Raten ohne Sprache,
M19/M20 fehlende Sprachnormalisierung, M21 `trim` in `sprachTeil`.

**Zwei Mutanten haben den ersten Durchgang ueberlebt — beide haben eine echte
Luecke aufgedeckt:**

1. **M8** (`Wdh`-Wortgrenze aufgehoben) ueberlebte, weil kein Test `Wdh` mit
   angehaengtem Zeichen enthielt. Ergaenzt: `speakable('5 Wdhs')` bleibt
   `'5 Wdhs'`. Anmerkung: es gibt kein deutsches Wort mit „Wdh" darin, die
   angehaengte Endung ist also der einzige Fall, der diese Grenze ueberhaupt
   pruefen kann — anders als bei `kg`, wo `Rückgrat` den natuerlichen Fall
   liefert.
2. **M16** ueberlebte scheinbar, traf aber wegen der Ersetzung nur des ersten
   Vorkommens gar nicht `speakable`, sondern das `trim()` in `sprachTeil` — und
   deckte damit auf, dass dieses `trim()` von keinem Test getragen wurde.
   Ergaenzt: eine Stimme mit `lang: ' de-DE '` und Zielsprache `' de '`. Nach
   Korrektur des Ankers sind M16 (speakable) und M21 (sprachTeil) beide tot.

Ehrliche Einschraenkung: bei `kg` sind Zeichenklasse davor und Lookahead danach
fuer realistische Eingaben teilweise redundant (kein deutsches Wort endet auf
„kg"). Ein Mutant, der **nur** die Zeichenklasse davor entfernt, wuerde von
keinem realistischen Testfall getoetet; getestet und getoetet ist die im Auftrag
genannte Mutation „Wortgrenze aufgehoben" (beide Haelften weg). Ein kuenstlicher
Testfall dafuer haette nichts gefangen, was ein Nutzer je zu hoeren bekommt.

## Was der Mac noch braucht

Alles Folgende ist **nicht** gebaut und gehoert auf den Mac. Reihenfolge ist die
des Briefs.

**1. Skript-Tag.** In `index.html` nach `coach-persona.js`:
`<script src="js/coach-voice.js"></script>`. Zusaetzlich in die Dateiliste von
`sw.js` (Cache) und, falls `build.js` die Skripte einsammelt, auch dort.

**2. Natives Plugin.** `TtsPlugin.swift` (`AVSpeechSynthesizer`) mit den
Methoden, die `coachSpeak`/`coachStopSpeak` brauchen: sprechen, abbrechen,
Stimmenliste liefern (`AVSpeechSynthesisVoice.speechVoices()` → `[{id, lang}]`,
genau die Form, die `pickVoice` erwartet). Die Audio-Session so setzen, dass
laufende Musik nur **leiser** wird und nicht stoppt (`.duckOthers`) — das steht
so im Changelog-Eintrag des Blockabschlusses. Registrierung in
`project.pbxproj` und der Capacitor-Plugin-Liste. Die zwei
`Info.plist`-Eintraege sind bereits vorhanden (geprueft).

**3. Faehigkeiten einsammeln** und an `CoachVoice.available(...)` geben:
`{tts: !!_cap('TtsPlugin'), stt: !!_cap('SpeechPlugin'), webTts: typeof speechSynthesis !== 'undefined', webStt: !!(window.webkitSpeechRecognition || window.SpeechRecognition)}`.
`_cap(name)` gibt auf Web `null` zurueck — der Web-Zweig ist dort der regulaere
Pfad, kein Notnagel.

**4. Sprech-Button** in `_coachBarRender`, **in** `#wk-coach-bar` und als
einziges Bedienelement des Coaches im Training (Gestaltungsregel 2). Ist
`available(...).stt` falsch, wird der Knopf **nicht gerendert** — kein
ausgegrauter Knopf. `ICO.mic` fehlt noch (verifiziert: kein `mic:`-Eintrag);
das SVG aus dem bestehenden `.aic-mic`-Button uebernehmen, **kein Emoji**.

**5. `coachSpeak(text)` / `coachStopSpeak()` / `coachAsk()`.** `coachSpeak`
schickt `CoachVoice.speakable(text)` an das Plugin bzw. an `speechSynthesis` und
scheitert **stumm** (`console.warn`) — die Sprachausgabe darf den Ablauf nie
stoeren. `coachAsk()` haengt sich als duenner Wrapper an den vorhandenen
Diktat-Einstieg `aicMicToggle`; `_sttListenOnce`, `_aicAskOnce` und
`_coachTryLocal` aus v1 existieren **nicht** und sind nicht neu zu erfinden. Die
Antwort muss **gesprochen und angezeigt** werden — ein reiner Sprachkanal ist im
Gym unbrauchbar.

**6. `_csRenderVoices(el)`** (Einrichtung Schritt 2): hoechstens acht Stimmen,
Vorauswahl ueber `CoachVoice.pickVoice(voices, gespeicherteId, appSprache)`.
Liefert die Funktion `null`, bleibt es bei der Systemstimme. Der Vorhoer-Satz
beim Antippen ist **derselbe**, den der Coach spaeter wirklich sagt
(`say('greet', …)`) — kein „Dies ist eine Testansage". Ist „Sprachausgabe" aus,
verschwindet die Liste.

**7. Der Coach redet nie von selbst los** (Gestaltungsregel 6): kein `coachSpeak`
aus einem Trigger, nur aus einer Nutzeraktion.

**8. Danach erst** Version/Changelog (`cl-2026-07-29-coach-stimme`), `npx cap
sync ios`, Simulatorlauf und die Simulator-Pruefliste aus dem Brief. Offener
Punkt fuer den Betreiber, nicht fuer den Agenten: Nutrition Labels in App Store
Connect zur Spracherkennung.

## Bedenken

- **Sprachliste `pickVoice` gibt nur eine Kennung zurueck**, keine
  Stimmen-Objekte. Wenn das native Plugin Stimmen ohne stabile `id` liefert,
  traegt die gespeicherte Vorliebe ueber ein iOS-Update hinweg nicht. Das ist
  eine Frage an das Plugin, nicht an dieses Modul — `pickVoice` faellt in dem
  Fall sauber auf die erste Stimme der richtigen Sprache zurueck.
- **`speakable` kennt nur `de`-Ersetzungen** (`Kilo`, `mal`, `bei`,
  `Wiederholungen`). Bei englischer Oberflaeche wird aus `62,5 kg` ein
  „62,5 Kilo" mitten im englischen Satz. Der Brief gibt genau diese Tabelle vor,
  eine Sprachverzweigung waere eine Erweiterung — vor der englischen Freigabe
  aber zu klaeren.
- **Der Wortlaut kommt aus dem Satzkatalog**, dessen Platzhalter dieses Modul
  nicht kennt. Enthaelt ein Satz Markdown, das ueber `**fett**` hinausgeht
  (`*kursiv*`, `#`, `` ` ``), wird es mitgesprochen. Bisher tut kein Satz das.
