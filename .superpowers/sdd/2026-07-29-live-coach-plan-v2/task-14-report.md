# Task 14 — Aufwärmsätze und Technik-Cues (Bericht)

Angelegt: `js/coach-warmup.js`, `js/coach-cues.js`, `test/coach-warmup.test.js`,
`test/coach-cues.test.js`. Keine andere Datei berührt, kein Commit. Kein
`fetch`, kein Modellaufruf, kein DOM, keine App-Globals, keine Emojis.

## Öffentliche API

**`js/coach-warmup.js`** (`module.exports` + `root.CoachWarmup`)

| Signatur | Rückgabe |
| --- | --- |
| `warmupSets(workKg, {step, barKg})` | `[{kg, reps, pct}]` aufsteigend, ohne Doppelstufe, jedes `kg < workKg`; `[]` bei zu leichtem/ungültigem Arbeitsgewicht |
| `roundToPlate(kg, step, barKg)` | `number` — auflegbares Gewicht, nie unter `barKg` |
| `format(sets, lang)` | `string` — `'22,5 kg × 5, 30 kg × 3'` (de) / `'22.5 kg × 5, 30 kg × 3'` (en), `''` bei leerer Liste |
| `SCHEME` | `[{pct:50,reps:5},{pct:70,reps:3},{pct:85,reps:1}]` |
| `DEFAULT_STEP` / `DEFAULT_BAR` / `MIN_WORK_KG` | `2.5` / `20` / `30` |

**`js/coach-cues.js`** (`module.exports` + `root.CoachCues`)

| Signatur | Rückgabe |
| --- | --- |
| `cueFor(exerciseName, lang)` | `string\|null` — genau ein Technikpunkt, `null` ohne Treffer |
| `normalize(name)` | `string` — klein, Umlaute aufgelöst, nur `a-z0-9` (exportiert, damit Task 17 dieselbe Normalisierung nutzen kann statt eine zweite zu schreiben) |
| `CUES` | Tabelle `normalisierterSchlüssel -> {de, en}`, 54 Schlüssel auf 28 verschiedene Hinweise |

## Entscheidungen

**Rundungsstrategie (der Kern).** Zwei Punkte, die beide falsch wären, wenn man
das Gesamtgewicht rundet:

1. Die Stange ist fix — teilbar ist nur der Anteil darüber
   (`bar + n*inc`, `n` ganzzahlig).
2. Scheiben liegen **paarweise** auf. `step` ist die kleinste Scheibe **je
   Seite**, die kleinste Gesamtstufe über der Stange also `2*step`. Ohne Stange
   (`barKg === 0`: Maschine, Steckgewicht, Kabelzug) gibt es kein Paar, dort ist
   `step` die Stufe selbst.

**Abweichung von der Brief-Prosa, bewusst.** Der Brief nennt als Formel
`bar + round((kg - bar) / step) * step`. Wörtlich angewandt ergibt
`roundToPlate(43.7, 2.5, 20)` **42,5** — der Brief fordert in derselben Tabelle
aber **45**. Die Testfall-Tabelle ist die Abnahmebedingung, also gilt die
Paar-Semantik (`inc = 2*step` bei vorhandener Stange); mit ihr stimmen alle vier
`roundToPlate`-Fälle des Briefs (45 / 40 / 50 / 20). Die Prosa-Formel bleibt in
ihrem Kernpunkt gültig: gerundet wird nur der Anteil über der Stange.

**Untergrenze** bleibt wörtlich wie im Brief: `max(barKg + 2*step, 30)`. Nicht
auf `2*inc` umgestellt, weil hier nichts im Brief dagegen steht und die
Standardwerte (Stange 20, Scheibe 2,5) in beiden Lesarten 30 ergeben.

**Harte Zusicherungen** in dieser Reihenfolge: runden → Sätze `>= workKg`
verwerfen (die aufgerundete 85-%-Stufe kann dort landen) → gleiche oder fallende
Gewichte verwerfen. Das erledigt Dedup und strenge Steigung in einem Schritt.
Bei einer Doppelstufe bleibt der **erste** Eintrag stehen: er trägt die höhere
Wiederholungszahl, und die ist am leichten Gewicht die nützlichere Ansage.

**Kein Coach-Satz aus diesem Modul.** `format()` setzt nur die Zahlenreihe; der
Satz drumherum kommt aus `CoachPersona.say('warmupIntro', …)` an der
Verdrahtungsstelle (Task 17). Für `coach-cues.js` gilt der Brief: Technikpunkte
sind Sachtexte, keine Tonfrage — sie stehen deshalb als eigener Wortlaut in der
Tabelle und laufen nicht über `say()`. Keine Abhängigkeit auf ein Nachbarmodul.

**Zahlformat** über `toLocaleString(de-DE|en-US, {maximumFractionDigits:1})` —
identisch zu `num()` in `js/coach-intent.js` und `fmt()` in
`js/coach-persona.js`. Zwei Coach-Module dürfen nicht verschieden runden.

**Cue-Zuordnung**: normalisierter Teilstring über `indexOf`, **längster
passender Schlüssel gewinnt**. Ein Hinweis wird von mehreren Schlüsseln geteilt
(deutscher Name, englischer Name, Varianten) — die Texte liegen in Variablen,
die Tabelle verweist mehrfach darauf; eine Kopie je Namensvariante liefe beim
ersten Textfix auseinander. Kein Treffer heißt `null`: „Rumpf spannen und
kontrolliert bewegen" passt auf alles und hilft bei nichts. Deshalb bewusst
**kein** kurzer Sammelschlüssel wie `bein`, `curl` oder `press` — `curl` hätte
„Unterarm-Curls" den Bizeps-Hinweis gegeben und „Unterarm-Wackeln" wäre nur per
Zufall leer geblieben.

## Welcher Testfall fängt welchen Fehler

`test/coach-warmup.test.js` (16 Tests)

| Test | Fängt |
| --- | --- |
| `roundToPlate` nach oben (43,7 → 45) | Rundung über das Gesamtgewicht statt über die Scheibenpaare |
| `roundToPlate` nach unten (41,2 → 40) | dito, andere Richtung |
| ohne Stange (52 / 5 / 0 → 50) | Paar-Logik auf Maschinen angewandt |
| nie unter die Stange (12 → 20) | Aufwärmsatz leichter als die leere Stange |
| Scheibenraster über 30–200 kg | Rasterdrift, die einzelne Stichproben überspringen |
| Schema 50/70/85 mit 5/3/1 | Schema oder Wiederholungszahlen verändert |
| jedes `kg < work` für 60/82,5/100/140/47,5 | „Aufwärmsatz" auf Arbeitsgewicht |
| grobe Stufe (40, step 20, bar 0) | fehlender Filter nach dem Aufrunden: 85 % von 40 runden auf genau 40 |
| streng steigend bei 120 | Reihenfolge oder Dedup kaputt |
| 25 / 0 / null / undefined / −80 / NaN / `'100'` → `[]` | Aufwärmen bei leerer Stange, Absturz bei fehlender Eingabe, String als Zahl |
| Stange 60 = Arbeitsgewicht 60 → `[]` | Stange schwerer als das Arbeitsgewicht |
| step 5 / bar 0 → alle `% 5 === 0` | Schrittweite ignoriert |
| `{step:5}` ohne `barKg` → alle `(kg-20) % 10 === 0` | Standardwert nicht gesetzt oder Paar-Logik nur im Sonderfall |
| Dedup bei 30 kg (50 % und 70 % landen auf 20) | Doppelstufe nicht zusammengefasst |
| `format` de/en/ohne Sprache | Locale, falscher Standard |
| `format([])` / `format(null)` | leerer Aufzählungsrest, Absturz |

`test/coach-cues.test.js` (12 Tests)

| Test | Fängt |
| --- | --- |
| `cueFor('Bankdrücken','de')` | Eintrag fehlt |
| Variante / Grossschreibung / Umlaut | Normalisierung oder Teilstring-Zuordnung kaputt |
| `cueFor('Bench Press','en')` | englischer Name ohne Schlüssel |
| Sprache entscheidet, unbekannter Code → de | `lang` ignoriert, kein Rückfall |
| „Unterarm-Wackeln" / `''` / `null` / `undefined` / `42` / `{}` → `null` | Allgemeinplatz statt Schweigen, Absturz bei Nicht-String |
| längster Schlüssel gewinnt (RDL vs. Kreuzheben, aufrechtes vs. normales Rudern) | erster Treffer statt längster — falscher Hinweis für die Variante |
| Vollständigkeit `de`+`en`, Meldung nennt `Schlüssel/Sprache` | halbe Übersetzung |
| `de !== en` je Eintrag | deutscher Text ins `en`-Feld kopiert |
| kein `\p{Extended_Pictographic}` | Emoji in der Oberfläche |
| ein Punkt, kein Lob, ≥ 5 Wörter, ≤ 150 Zeichen, kein `;`/Umbruch/Aufzählung | Gestaltungsregel 8: Hinweis, der nur lobt oder nichts Konkretes sagt; Liste ins Feld gequetscht |
| Schlüssel `^[a-z0-9]+$` und selbst auffindbar | Schlüssel mit Umlaut/Leerzeichen, den `normalize()` nie erreichen kann |
| ≥ 12 Schlüssel **und** ≥ 12 verschiedene `de`-Texte | Tabelle zu dünn; zwölf Aliase auf drei Hinweise |

Zusätzlich prüft ein Helfer `cueKeys()` in jedem Tabellendurchlauf, dass die
Tabelle nicht leer ist — sonst wäre jeder Schleifentest über einer leeren
Tabelle grün, ohne etwas geprüft zu haben.

## Gestrichene und ersetzte Testfälle

- **Gestrichen: `warmupSets(45, {step:2.5, barKg:20})` → „keine doppelten
  Gewichte"** (Brief-Zeile „50 % und 70 % runden auf dieselbe Stufe"). Bei 45 kg
  ergibt die Rechnung 25 / 30 / 40 — die Stufen kollidieren dort **nicht**, der
  Fall bliebe also auch bei komplett fehlendem Dedup grün. **Ersetzt** durch
  `warmupSets(30, {step:2.5, barKg:20})`: dort landen 50 % (15 → 20) und 70 %
  (21 → 20) beide auf der leeren Stange, der Test prüft `length < 3` plus
  Eindeutigkeit und fällt ohne Dedup um.
- **Nachgeschärft, nicht gestrichen:** „streng steigend" (`length === 3`
  ergänzt) und der Dedup-Fall (`length >= 1` ergänzt). Beide waren über einer
  leeren Liste vakuum-grün.
- **Hinzugefügt** über den Brief hinaus, weil je ein realer Bug sonst durchläuft:
  Rasterlauf über 30–200 kg, grobe Maschinenstufe (Filter nach dem Aufrunden),
  Stange = Arbeitsgewicht, fehlende Option, `de !== en`, ein-Punkt-Regel,
  Schlüssel-Normalisierung, verschiedene Hinweise statt Aliasen.

## Läufe

- **Rot (Stub-Module, alle Funktionen leer):** `28 tests, 4 pass, 24 fail`.
  Die vier grünen sind die Negativfälle, die auf einer leeren Rückgabe
  richtigerweise grün sind (`25/0/null → []`, Stange ≥ Arbeitsgewicht → `[]`,
  `format([]) → ''`, unbekannte Übung → `null`); sie fangen die umgekehrten
  Fehler (aufwärmen bei 25 kg, Absturz bei `null`, Allgemeinplatz).
- **Mutationsprobe** (Kopie im Scratch, Repo unberührt): `plateStep` auf
  `return step` gesetzt und `cueFor` auf ersten statt längsten Treffer →
  `4 fail` (Rasterlauf, 43,7 → 45, Standardwert-Fall, längster Schlüssel). Die
  beiden Kernentscheidungen sind also wirklich verankert.
- **Grün (neue Dateien):** `node --test test/coach-warmup.test.js
  test/coach-cues.test.js` → `28 tests, 28 pass, 0 fail`.
- **Gesamtsuite:** `node --test test/*.js` → `350 tests, 350 pass, 0 fail`.
  Ausgangsstand war 222; von den 128 neuen Tests sind 28 aus Task 14, der Rest
  kommt aus den parallel gelandeten Modulen (`coach-session`, `coach-rpe`,
  `coach-analyze`). Kein bestehender Test gekippt.

## Offene Punkte für Task 17 (Verdrahtung)

- `format()` schreibt fest `kg`. Für Nutzer mit Pfund-Anzeige muss die
  Verdrahtung umrechnen und die Einheit setzen (der Brief erwähnt lbs nicht,
  `js/coach-intent.js` löst das über ein fertiges `s.unit` aus `_coachSnap()`).
  Solange das nicht passiert, sieht ein lbs-Nutzer kg.
- `step`/`barKg` müssen aus den Geräteeinstellungen kommen. Ohne Argument gilt
  2,5-kg-Scheibe und 20-kg-Stange; für Maschinen ist `barKg: 0` zu übergeben,
  sonst rundet die App auf Langhantel-Paare.
- `CoachCues.normalize()` ist exportiert — bitte in Task 17 verwenden statt eine
  zweite Normalisierung in `index.html` zu schreiben.
