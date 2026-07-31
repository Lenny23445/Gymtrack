# Lang-Fix-Report — `_lang()` folgt der angezeigten Sprache

## Was geändert wurde

**`index.html`, `_lang()` (ehem. Zeile 8928):**

Vorher:
```js
function _lang() { try { return localStorage.getItem('gt_lang') === 'en' ? 'en' : 'de'; } catch(_) { return 'de'; } }
```

Nachher:
```js
function _lang() { try { return GT_LANG === 'en' ? 'en' : 'de'; } catch(_) { return 'de'; } }
```

`_lang()` liest jetzt `GT_LANG` (deklariert `const` bei Zeile 7466, Auflösung inkl.
`gt_lang==='auto'` → Gerätesprache) statt direkt `localStorage.getItem('gt_lang')`.
Rückfall bleibt `'de'`, `try/catch` unverändert.

**`_chLang`/`_chSay` (Coach-Hub, Task 9) — entfernt:**

Der Hub hatte sich einen eigenen Umweg gebaut, weil `_lang()` kaputt war
(Kommentar an der Stelle sagte das wörtlich: *"Sprache der Coach-Sätze im Hub
kommt aus GT_LANG, NICHT aus `_lang()`: `_lang()` liest nur `gt_lang==='en'`
und liefert bei `gt_lang='auto'` auf einem englischen Gerät 'de' ..."*).

Nach dem Fix ist `_chLang()` textidentisch mit dem, was `_lang()` jetzt tut
(`GT_LANG === 'en' ? 'en' : 'de'`) — reiner Umweg, kein eigener Zweck mehr.
Geprüft und aufgelöst:

- `_chLang()` — entfernt (Duplikat von `_lang()`).
- `_chSay(key, vars)` — war Zeile für Zeile identisch mit `_say(key, vars)`
  (`CoachPersona.say(key, vars||{}, _persona(), <lang>)`, gleiches `_persona()`,
  nur `_chLang()` statt `_lang()`). Entfernt, einziger Aufrufer
  (`_chToneExInner()`, Zeile ~24060) ruft jetzt direkt `_say(...)`.
- `_chToneLine(tone)` — **nicht** entfernt: baut mit `CoachPersona.personaGet({tone})`
  eine andere Persona als `_persona()` (dient dem Ton-Vorschau-Vergleich in den
  Coach-Einstellungen, vier Karten mit vier Tönen). Das ist kein Sprach-Umweg,
  sondern eigenständige Logik — nur der Sprachparameter wurde von `_chLang()`
  auf `_lang()` umgestellt.
- Stale Kommentar über dem alten `_chLang()`, der die (jetzt behobene) Diskrepanz
  erklärte, ersetzt durch eine Zeile, die den aktuellen Stand beschreibt.

Kein anderer Aufrufer von `_chLang`/`_chSay` im Projekt (`grep -rn "_chLang\|_chSay"`
über `index.html`, `js/`, `test/` — nach der Änderung: keine Treffer mehr).

## Aufrufer von `_lang()` — geprüft

Einziger Aufrufer im gesamten Projekt: `_say(key, vars)` (Zeile 8929, direkt
unter `_lang()`), verwendet zur Laufzeit innerhalb von Coach-Rendering-Funktionen
(Live-Leiste, Satz-Feedback, Heute-Karte) — nie beim Skript-Start, also nie vor
`GT_LANG` (Zeile 7466) ausgewertet. `grep -n "_lang()" index.html` vor der
Änderung ergab genau zwei Treffer: die Definition selbst und dieser eine Aufruf
in `_say()`. Kein Aufruf von `_lang()` liegt zwischen Zeile 7466 und 8928 oder
sonst auf Top-Level — TDZ-Risiko besteht nicht.

## Testevidenz

Eigenes Skript: `.superpowers/sdd/2026-07-29-live-coach-plan-v2/lang-check.js`
(eigener Port 8917, drei isolierte Puppeteer-`BrowserContext`s — kein
`localStorage`-Bluten zwischen den Fällen — plus `evaluateOnNewDocument` für
`navigator.language`/`navigator.languages`).

### Roter Lauf (vor dem Fix, `node lang-check.js`)

```
-- Lang-Fix — _lang() folgt GT_LANG --
FAIL  Fall 1 — gt_lang unbenannt, Geraet Englisch: _lang() ist "en" und deckt sich mit GT_LANG
        got: {"GT_LANG_PREF":"auto","GT_LANG":"en","lang":"de","say":"Bench press: 3 Sätze geplant, zuletzt 60 kg zu 8 Wiederholungen.","sollSay":"Bench press: 3 sets planned, last time 60 kg for 8 reps."}
FAIL  Fall 1 — echter Coach-Satz (_say) zieht mit: exOpen auf Englisch wie CoachPersona.say(...,"en")
        got: {"GT_LANG_PREF":"auto","GT_LANG":"en","lang":"de","say":"Bench press: 3 Sätze geplant, zuletzt 60 kg zu 8 Wiederholungen.","sollSay":"Bench press: 3 sets planned, last time 60 kg for 8 reps."}
PASS  Fall 2 — gt_lang="de" auf Englischem Geraet: _lang() ist "de" (manuelle Wahl schlaegt Geraet)
PASS  Fall 3 — gt_lang unbenannt, Geraet Deutsch: _lang() ist "de"

Ergebnis: 2/4 PASS
```

Bestätigt den beschriebenen Fehler: `GT_LANG==='en'`, aber `_lang()==='de'` —
Oberfläche englisch, Coach-Satz (`exOpen`) blieb deutsch.

### Grüner Lauf (nach dem Fix, `node lang-check.js`)

```
-- Lang-Fix — _lang() folgt GT_LANG --
PASS  Fall 1 — gt_lang unbenannt, Geraet Englisch: _lang() ist "en" und deckt sich mit GT_LANG
PASS  Fall 1 — echter Coach-Satz (_say) zieht mit: exOpen auf Englisch wie CoachPersona.say(...,"en")
PASS  Fall 2 — gt_lang="de" auf Englischem Geraet: _lang() ist "de" (manuelle Wahl schlaegt Geraet)
PASS  Fall 3 — gt_lang unbenannt, Geraet Deutsch: _lang() ist "de"

Ergebnis: 4/4 PASS
```

### `node --test test/*.js` (nach dem Fix)

```
ℹ tests 221
ℹ suites 0
ℹ pass 221
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

221/221 — keine Regression.

### `task-9-check.js` (nach dem Fix, inkl. Entfernung von `_chLang`/`_chSay`)

```
-- Task 9 — Coach-Hub (Chromium statt Simulator) --
PASS  Tipp auf die Coach-Karte oeffnet ov-coach-hub (Handler verdrahtet)
PASS  Tipp auf "Training starten" startet das Training, Hub bleibt zu (closest-Waechter)
PASS  Alle vier Reiter: Beschriftung gesetzt, Inhalt nicht leer, aktiver Reiter markiert
PASS  Journal: Eintrag samt Ablaufdatum sichtbar, Loeschknopf entfernt ihn aus DOM und Speicher
PASS  Loeschung ueberlebt den App-Neustart (Eintrag weg, uebriges Dossier da)
PASS  Dossier-Eintrag mit <b> erscheint als Text, nicht als Markup
PASS  Ton-Auswahl: vier Karten mit vier verschiedenen Saetzen, Beispielsatz darunter wechselt sichtbar
PASS  "Eng dabei" + Nachrichten "Still" ⇒ vierte, deaktivierte Karte "Angepasst" ist aktiv
PASS  Heute-Tab: nur die bestehende .aic-Karte, kein neues Element, kein fuenfter Tab
PASS  renderCoachHub() kehrt bei geschlossenem Overlay frueh zurueck (auch aus setAiCoachOpt)
PASS  Weiche: ohne openCoachSetup oeffnet der Hub, mit ihr startet die Einrichtung nur bei preset===undefined + Premium
PASS  _dossierRemove: Ziel loeschbar, fremde Gruppe und Index daneben aendern nichts
PASS  Chat-Reiter: letzter Wortwechsel gekuerzt und escaped, Knopf springt in ov-ai-chat
PASS  Tagesempfehlung aus: schmale Karte mit Coach-Namen bleibt und oeffnet den Hub (Befund 1)
PASS  Erster Tipp direkt nach dem Namensfeld setzt den Ton (Befund 2)
PASS  Feinjustierung bleibt nach jedem Schalter offen, zugeklappt bleibt zugeklappt (Befund 4)
PASS  Zweisprachig: jeder Hub-Schluessel liegt uebersetzt in I18N_EN, aria-label inklusive
PASS  Zweisprachig: Reiter und alle vier Bereiche kommen auf Englisch, kein deutscher Oberflaechentext
PASS  Screenshot des offenen Hubs geschrieben (Hub sichtbar, Journal gefuellt)
PASS  gt_lang='auto' auf englischem Geraet: Tonsaetze englisch wie Reiter und Ueberschriften (Befund 3)

Ergebnis: 20/20 PASS
```

20/20 — kein Rot durch die `_chLang`/`_chSay`-Entfernung. Dieser Check testete
`_chLang`/`_chSay` nie direkt (nur `_chToneLine`-Ergebnisse indirekt über
`.ch-preset`-Karten und `_chToneExInner()`), reagiert also nur auf sichtbares
Verhalten — das blieb unverändert, weil `_chLang()` und `_lang()` nach dem Fix
exakt dieselbe Sprache liefern.

## Geänderte Dateien

Nur `index.html` (`git diff --stat` zwischen `2bd4265` und dem finalen Stand:
`1 file changed, 6 insertions(+), 11 deletions(-)`). Kein Anfassen von
`APP_VERSION`, `sw.js`, `CHANGELOG`, `firestore.rules`.

## Hinweis zum Commit

Ein Autosync-Job hat die Arbeit **vor** meinem eigenen `git commit` bereits
selbst eingecheckt und nach `origin/main` gepusht — in zwei Commits mit
generischer Autosync-Nachricht statt der vorgesehenen `fix(coach):`-Nachricht:

- `6161d74` — "autosync: rechner 2026-07-30 13:30" (enthält den `_lang()`-Fix)
- `38ba48a` — "autosync: rechner 2026-07-30 13:32" (enthält die
  `_chLang`/`_chSay`-Entfernung)

Working tree war danach `clean`, kein eigener Commit mehr möglich/nötig. Wie
vorgegeben: keine History umgeschrieben, kein `--amend`, kein Force-Push — der
Autosync-Commit ist bereits auf `origin/main` (`git fetch` bestätigt
`origin/main` == lokal `38ba48a`).
