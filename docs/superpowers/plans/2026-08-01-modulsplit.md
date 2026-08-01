# Modul-Split fuer Parallelarbeit — Umsetzungsplan

> **Fuer agentische Bearbeiter:** Aufgabe fuer Aufgabe abarbeiten. Schritte nutzen
> Checkbox-Syntax (`- [ ]`). Entwurf: `docs/superpowers/specs/2026-08-01-parallelarbeit-modulsplit-design.md`

**Ziel:** `index.html` (36.5k Zeilen) in `css/app.css` und ~13 `js/app-*.js` aufteilen,
damit mehrere Agents gleichzeitig an disjunkten Dateien arbeiten koennen.

**Architektur:** Reines Verschieben von Text, keine Logikaenderung. Alle Module sind
klassische Skripte (`<script src>`, **kein** `type="module"`) und behalten den
gemeinsamen globalen Geltungsbereich. Kein Build-Schritt: die Dateien werden direkt
geladen, wie die vorhandenen `js/coach-*.js`.

**Tech-Stack:** Vanilla JS, Capacitor 8 (iOS), Service Worker, `node --test`, Puppeteer.

## Globale Rahmenbedingungen

- **Ein Modul ist ein zusammenhaengender Bereich des Originals, kein thematischer
  Sammeltopf.** Die Ausfuehrungsreihenfolge muss Zeile fuer Zeile erhalten bleiben.
  Funktionen werden nie umsortiert, nur an Bereichsgrenzen geschnitten. Modulnamen
  beschreiben den Hauptinhalt ihres Bereichs.
- **Keine festen Zeilennummern.** `index.html` aendert sich waehrend der Arbeit
  laufend. Alle Schnitte laufen gegen Marker-Kommentare, die in Aufgabe 4 gesetzt
  werden.
- **Kein `type="module"`, keine Imports/Exports.**
- **Keine inhaltliche Aenderung.** Jede verschobene Zeile bleibt byteweise gleich.
- **`APP_VERSION` und `CACHE` werden in diesem Plan nicht gebumpt.** Der Bump
  passiert einmal beim Merge nach `main` (Aufgabe 21).
- **Arbeit laeuft im Worktree**, nicht auf `main` — auf `main` arbeitet parallel ein
  anderer Agent.
- **UI-Regel des Projekts gilt weiter:** keine Emojis in der Oberflaeche (siehe `CLAUDE.md`).

---

## Aufgabe 1: Arbeitsumgebung

**Dateien:**
- Aendern: `.gitignore`

**Liefert:** Worktree unter `.worktrees/modulsplit` auf Branch `modulsplit`, in dem
alle weiteren Aufgaben laufen.

- [ ] **Schritt 1: `.worktrees/` ignorieren**

`.gitignore` um einen Eintrag ergaenzen (direkt nach `node_modules/`):

```
.worktrees/
```

- [ ] **Schritt 2: Pruefen, dass es greift**

```bash
git check-ignore -q .worktrees && echo ignoriert
```
Erwartet: `ignoriert`

- [ ] **Schritt 3: Eintrag committen**

```bash
git add .gitignore
git commit -m "chore: .worktrees/ ignorieren"
```

- [ ] **Schritt 4: Worktree anlegen**

```bash
git worktree add .worktrees/modulsplit -b modulsplit
cd .worktrees/modulsplit
npm install
```

- [ ] **Schritt 5: Ausgangslage pruefen**

```bash
npm test
```
Erwartet: alle 18 Testdateien gruen. Schlaegt etwas fehl, hier stoppen und melden —
ein roter Ausgangszustand macht jeden spaeteren Fehlschlag mehrdeutig.

---

## Aufgabe 2: Rauchtest, der den Split absichert

**Dateien:**
- Anlegen: `test/smoke-module.js`

**Schnittstellen:**
- Liefert: Skript, das `index.html` in Puppeteer laedt und mit Code 0/1 endet.
  Wird ab Aufgabe 3 nach **jeder** Extraktion ausgefuehrt.

Der Rauchtest ist das eigentliche Sicherheitsnetz. `npm test` prueft nur die
Coach-Module und Konstantennamen — ob die App nach dem Split ueberhaupt startet,
sieht nur ein echter Ladevorgang.

- [ ] **Schritt 1: Rauchtest schreiben**

Anlegen als `test/smoke-module.js`:

```js
/* Laedt index.html im echten Browser und prueft, dass der Split nichts zerrissen
   hat: keine Konsolenfehler, kein unbehandelter Fehler, und die Kernfunktionen
   sind definiert. Laeuft nicht unter `node --test` (braucht Puppeteer und dauert
   Sekunden) — Aufruf direkt: node test/smoke-module.js */
const puppeteer = require('puppeteer');
const path = require('path');

const KERN = [
  'setTheme', 'persist', 'goTab', 'isWorkoutActive', 'tr', 'setAppLang',
  'muscleLabel', 'unitLabel', 'exHistory', 'buildPlannedSets',
  'moveTabIndicator', 'openOv', 'closeOv'
];

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const fehler = [];

  page.on('console', m => { if (m.type() === 'error') fehler.push('console: ' + m.text()); });
  page.on('pageerror', e => fehler.push('pageerror: ' + e.message));
  page.on('requestfailed', r => fehler.push('request: ' + r.url() + ' ' + r.failure().errorText));

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'),
                  { waitUntil: 'networkidle2', timeout: 30000 });

  const fehlend = await page.evaluate(namen =>
    namen.filter(n => typeof window[n] !== 'function'), KERN);

  await browser.close();

  // Fremde Quellen (Firebase, Google, Chart.js CDN) laden unter file:// nicht —
  // das ist erwartet und darf den Rauchtest nicht rot machen. Gefiltert wird nach
  // Herkunft, nicht nach Fehlertext: ein echter Fehler aus eigenem Code soll auch
  // dann auffallen, wenn er zufaellig aehnlich klingt.
  const fremd = /gstatic\.com|googleapis\.com|accounts\.google\.com|jsdelivr\.net|firebase/i;
  const echte = fehler.filter(f => !fremd.test(f));

  if (echte.length) {
    console.error('FEHLER beim Laden:');
    echte.forEach(f => console.error('  ' + f));
  }
  if (fehlend.length) {
    console.error('FEHLENDE Kernfunktionen: ' + fehlend.join(', '));
  }
  if (echte.length || fehlend.length) process.exit(1);

  console.log('Rauchtest OK — 0 eigene Fehler, ' + KERN.length + ' Kernfunktionen vorhanden');
})();
```

- [ ] **Schritt 2: Rauchtest gegen den unveraenderten Stand laufen lassen**

```bash
node test/smoke-module.js
```
Erwartet: `Rauchtest OK — 0 eigene Fehler, 13 Kernfunktionen vorhanden`

Schlaegt er **jetzt schon** fehl, ist der Test falsch, nicht die App. Dann die
gemeldeten Namen gegen `index.html` pruefen (`grep -n "^function setTheme" index.html`)
und die `KERN`-Liste korrigieren, bis er auf dem unveraenderten Stand gruen ist.
Erst danach weiter — ein Test, der von Anfang an rot ist, sichert nichts ab.

- [ ] **Schritt 3: Committen**

```bash
git add test/smoke-module.js
git commit -m "test: Rauchtest, der den Modul-Split absichert"
```

---

## Aufgabe 3: CSS auslagern

**Dateien:**
- Anlegen: `css/app.css`
- Aendern: `index.html` (Style-Block raus, `<link>` rein), `build.js`, `sw.js`

Das CSS ist der risikoaermste Teil: ein einziger zusammenhaengender Block, klar
begrenzt durch `<style>` und `</style>`, ohne Abhaengigkeit zur Ladereihenfolge des
JavaScripts.

- [ ] **Schritt 1: Grenzen ermitteln**

```bash
grep -n "^<style>\|^</style>" index.html
```
Erwartet: genau zwei Treffer. Mehr als zwei heisst, es gibt weitere Style-Bloecke —
dann nur den grossen (mehrere tausend Zeilen) nehmen und die anderen unangetastet lassen.

- [ ] **Schritt 2: Block herausschneiden**

Mit den Zeilennummern aus Schritt 1 (`S` = Zeile von `<style>`, `E` = Zeile von `</style>`):

```bash
mkdir -p css
awk -v s=$S -v e=$E 'NR>s && NR<e' index.html > css/app.css
wc -l css/app.css
```
Erwartet: rund 6.700 Zeilen.

- [ ] **Schritt 3: In index.html ersetzen**

Die Zeilen `S` bis `E` (einschliesslich) durch eine einzige Zeile ersetzen:

```html
<link rel="stylesheet" href="./css/app.css">
```

Das `<link>` muss **nach** dem Boot-Skript stehen (dem `<script>`-Block ganz oben, der
`data-theme` vor dem ersten Paint setzt) und innerhalb des `<head>`.

- [ ] **Schritt 4: Vollstaendigkeit pruefen**

```bash
grep -c . css/app.css
grep -n "app.css" index.html
grep -c "^<style>" index.html
```
Erwartet: `css/app.css` nicht leer, genau ein `<link>`-Treffer, kein `<style>`-Block mehr.

- [ ] **Schritt 5: build.js erweitern**

In `build.js` in das `files`-Array aufnehmen:

```js
'css/app.css',
```

Und das Zielverzeichnis anlegen — direkt neben der bestehenden `www/js`-Zeile:

```js
if (!fs.existsSync(path.join('www', 'css'))) fs.mkdirSync(path.join('www', 'css'), { recursive: true });
```

- [ ] **Schritt 6: sw.js erweitern**

In `SHELL` aufnehmen:

```js
  './css/app.css',
```

Und die Erkennung der kritischen Shell ergaenzen:

```js
  const isCriticalShell = url.includes('index.html') || url.endsWith('/') || url.includes('sw.js') || url.includes('manifest.json') || url.includes('/js/coach-') || url.includes('/css/app.css');
```

Grund: Das Stylesheet aendert sich mit jedem UI-Umbau. Cache-first wuerde ein frisches
`index.html` gegen ein veraltetes Stylesheet laufen lassen — derselbe Fehler, den der
Kommentar im `sw.js` fuer die Coach-Module beschreibt.

`isStaticShell` muss `css/app.css` dann ausschliessen, analog zu `js/coach-`:

```js
  const isStaticShell   = SHELL.some(s => {
    const name = s.replace('./', '');
    return name && !name.includes('index.html') && !name.includes('manifest.json') && !name.startsWith('js/coach-') && !name.startsWith('css/') && url.includes(name);
  });
```

- [ ] **Schritt 7: Build pruefen**

```bash
npm run build
ls -la www/css/app.css
```
Erwartet: Datei vorhanden, gleiche Groesse wie `css/app.css`.

- [ ] **Schritt 8: Tests und Rauchtest**

```bash
npm test && node test/smoke-module.js
```
Erwartet: beides gruen.

- [ ] **Schritt 9: Optisch pruefen**

```bash
~/.claude/sim-native.sh "$PWD" "iPhone 17"
xcrun simctl io "iPhone 17" screenshot /tmp/split-css.png
```
Bildschirmfoto ansehen: App muss aussehen wie vorher, kein weisses Aufblitzen beim
Start, Theme korrekt.

- [ ] **Schritt 10: Committen**

```bash
git add css/app.css index.html build.js sw.js
git commit -m "refactor: CSS aus index.html nach css/app.css"
```

---

## Aufgabe 4: Modulgrenzen festlegen und Marker setzen

**Dateien:**
- Aendern: `index.html` (nur Kommentarzeilen einfuegen)
- Aendern: dieses Plan-Dokument (ermittelte Anker nachtragen)

Diese Aufgabe schneidet noch nichts heraus. Sie legt die Grenzen fest und macht sie
gegen spaetere Zeilenverschiebungen unempfindlich.

- [ ] **Schritt 1: Top-Level-Konstrukte mit Zeilennummern auflisten**

```bash
grep -n "^function [A-Za-z_$]\|^const [A-Z_]\{3,\}\|^let \|^var \|^class " index.html > /tmp/toplevel.txt
wc -l /tmp/toplevel.txt
```

- [ ] **Schritt 2: Bereichsgrenzen waehlen**

Die Liste durchgehen und dort Grenzen setzen, wo das Thema wechselt. Zielgroesse
1.500–3.500 Zeilen je Modul. Ausgangsvorschlag (Reihenfolge des Originals, Namen nach
Hauptinhalt):

**Gemessen am 2026-08-01 auf Stand `d3e06fb`** (nach der CSS-Auslagerung).
Hauptblock: `<script>` Zeile 2118, `</script>` Zeile 29727, Inhalt also 2119–29726.
Die Zeilennummern belegen die Messung, sind aber **nicht** die Schnittgrundlage —
geschnitten wird gegen die Marker aus Schritt 3, weil die Datei sich weiter aendert.

| # | Datei | Bereich | Zeilen | Ankerfunktion |
|---|---|---|---|---|
| 1 | `js/app-i18n.js` | 2119–3788 | 1.670 | Blockanfang, `setAppLang` (2177) |
| 2 | `js/app-native.js` | 3789–5354 | 1.566 | `muscleLabel` (3789) |
| 3 | `js/app-ui.js` | 5355–7282 | 1.928 | `_exIdxAll` (5355) |
| 4 | `js/app-session.js` | 7283–10281 | 2.999 | `openSessDetail` (7283) |
| 5 | `js/app-plans.js` | 10282–13019 | 2.738 | `applyExRename` (10282) |
| 6 | `js/app-workout.js` | 13020–16298 | 3.279 | `openWorkout` (13020) |
| 7 | `js/app-streak.js` | 16299–19336 | 3.038 | `hapticSelStart` (16299) |
| 8 | `js/app-community.js` | 19337–22297 | 2.961 | `_cpgReload` (19337) |
| 9 | `js/app-coach.js` | 22298–25315 | 3.018 | `_rpeFlushTrend` (22298) |
| 10 | `js/app-coach-setup.js` | 25316–27800 | 2.485 | `coachSetupDone` (25316) |
| 11 | `js/app-update.js` | 27801–29726 | 1.926 | `_handleWaitingWorker` (27801) |
| 12 | `js/app-tabbar.js` | 29729–29758 | 30 | eigener `<script>`-Block am Dateiende |

Abweichungen vom urspruenglichen Vorschlag, mit Begruendung:

- `app-basis` (416 Zeilen) und `app-exercises` (275 Zeilen) waren zu klein fuer eigene
  Dateien und sind in die jeweils folgenden Bereiche aufgegangen. Deshalb enthaelt
  `app-native` zusaetzlich Muskeln/Einheiten/Icon-Picker/Coach-Persona und `app-ui`
  zusaetzlich Uebungen und PR-Logik.
- Der urspruengliche `app-plans`-Bereich war mit 6.017 Zeilen zu gross und ist bei
  `openWorkout` geteilt — dort wechselt das Thema von Statistik zu Training.

Modulnamen beschreiben den **Hauptinhalt** ihres Bereichs, nicht dessen gesamten Inhalt.
Die Reihenfolge des Originals bleibt in jedem Fall unangetastet.

- [ ] **Schritt 3: Marker einfuegen**

Vor jede gewaehlte Grenze eine Kommentarzeile in Spalte 0 setzen:

```js
/* ===== MODUL: app-native ===== */
```

Wichtig: Marker nur auf oberster Ebene setzen, nie innerhalb einer Funktion. Zur
Kontrolle die Zeile davor ansehen — sie muss `}` in Spalte 0 sein oder ein
Kommentar/Leerzeile.

- [ ] **Schritt 4: Marker zaehlen**

```bash
grep -c "^/\* ===== MODUL:" index.html
```
Erwartet: 13 (bzw. die in Schritt 2 gewaehlte Anzahl).

- [ ] **Schritt 5: Tests und Rauchtest**

```bash
npm test && node test/smoke-module.js
```
Erwartet: beides gruen — Kommentare aendern nichts am Verhalten. Ist etwas rot, sitzt
ein Marker in einem String oder Template-Literal.

- [ ] **Schritt 6: Gewaehlte Grenzen in diesem Plan nachtragen und committen**

```bash
git add index.html docs/superpowers/plans/2026-08-01-modulsplit.md
git commit -m "refactor: Modulgrenzen in index.html markieren"
```

---

## Aufgaben 5 bis 17: je ein Modul herausloesen

**Eine Aufgabe je Modul, immer dieselben Schritte.** Reihenfolge: von **hinten nach
vorne** (`app-tabbar` zuerst, `app-i18n` zuletzt). Von hinten geschnitten bleibt der
verbleibende Block oben immer ein zusammenhaengendes Ganzes, und jeder Schnitt
betrifft nur den Rand.

Fuer Modul `<name>` mit Marker `/* ===== MODUL: <name> ===== */`:

- [ ] **Schritt 1: Bereich bestimmen**

```bash
grep -n "^/\* ===== MODUL:" index.html
grep -n "^</script>" index.html
```
Anfang = Zeile des eigenen Markers. Ende = Zeile des naechsten Markers minus 1, beim
letzten Modul die Zeile vor `</script>`.

- [ ] **Schritt 2: Herausschneiden**

```bash
awk -v s=$S -v e=$E 'NR>=s && NR<=e' index.html > js/app-<name>.js
node --check js/app-<name>.js && echo "syntaktisch gueltig"
```

`node --check` ist die entscheidende Pruefung: schlaegt sie fehl, lag der Schnitt nicht
auf oberster Ebene. Dann den Marker verschieben und erneut schneiden — nicht die Datei
von Hand reparieren.

- [ ] **Schritt 3: Aus index.html entfernen und Skript-Tag setzen**

Die Zeilen `S` bis `E` aus `index.html` loeschen. Das `<script src>`-Tag kommt **nicht**
an die Schnittstelle, sondern zu den anderen Modul-Tags — direkt vor
`<script src="https://cdn.jsdelivr.net/npm/chart.js`:

```html
<script src="./js/app-<name>.js"></script>
```

Die Reihenfolge der `app-*`-Tags untereinander muss der Reihenfolge im Original
entsprechen. Ausfuehrungsteile bleiben im Restblock, bis sie in Aufgabe 18 drankommen.

- [ ] **Schritt 4: Restblock pruefen**

```bash
awk '/^<script>$/,/^<\/script>$/' index.html | sed '1d;$d' > /tmp/rest.js
node --check /tmp/rest.js && echo "Restblock gueltig"
```

- [ ] **Schritt 5: build.js und sw.js erweitern**

`build.js`: `'js/app-<name>.js',` in das `files`-Array.
`sw.js`: `'./js/app-<name>.js',` in `SHELL`.

Zusaetzlich **einmalig** (beim ersten Modul) die kritische Shell um `/js/app-` erweitern:

```js
  const isCriticalShell = url.includes('index.html') || url.endsWith('/') || url.includes('sw.js') || url.includes('manifest.json') || url.includes('/js/coach-') || url.includes('/js/app-') || url.includes('/css/app.css');
```

und in `isStaticShell` ausschliessen:

```js
    return name && !name.includes('index.html') && !name.includes('manifest.json') && !name.startsWith('js/coach-') && !name.startsWith('js/app-') && !name.startsWith('css/') && url.includes(name);
```

- [ ] **Schritt 6: Tests und Rauchtest**

```bash
npm run build && npm test && node test/smoke-module.js
```
Erwartet: alles gruen. Meldet der Rauchtest eine fehlende Kernfunktion oder einen
`ReferenceError`, wurde Ausfuehrungscode vor seine Deklaration geschoben — dann den
betroffenen Aufruf in den Restblock zuruecknehmen und in Aufgabe 18 behandeln.

- [ ] **Schritt 7: Committen**

```bash
git add js/app-<name>.js index.html build.js sw.js
git commit -m "refactor: <name> aus index.html nach js/app-<name>.js"
```

**Reihenfolge der Aufgaben 5–16:** `app-tabbar`, `app-update`, `app-coach-setup`,
`app-coach`, `app-community`, `app-streak`, `app-workout`, `app-plans`, `app-session`,
`app-ui`, `app-native`, `app-i18n`.

---

## Aufgabe 18: Ausfuehrungscode nach app-boot.js

**Dateien:**
- Anlegen: `js/app-boot.js`
- Aendern: `index.html`, `build.js`, `sw.js`

Was nach den Aufgaben 5–17 im Restblock uebrig ist, ist genau der Code, der beim Laden
ausgefuehrt wird: INIT-Block, `addEventListener`-Aufrufe, direkte Funktionsaufrufe.

- [ ] **Schritt 1: Restblock ansehen**

```bash
awk '/^<script>$/,/^<\/script>$/' index.html | sed '1d;$d' > /tmp/rest.js
wc -l /tmp/rest.js
node --check /tmp/rest.js
```

- [ ] **Schritt 2: Restblock nach js/app-boot.js verschieben**

```bash
cp /tmp/rest.js js/app-boot.js
node --check js/app-boot.js
```

Den `<script>`-Block in `index.html` komplett entfernen und stattdessen als **letztes**
Modul-Tag einfuegen — nach allen anderen `app-*`-Tags, aber **vor** `app-tabbar`:

```html
<script src="./js/app-boot.js"></script>
```

- [ ] **Schritt 3: build.js und sw.js erweitern**

`'js/app-boot.js',` in beide Listen, wie in Aufgabe 5 Schritt 5.

- [ ] **Schritt 4: Vollstaendig pruefen**

```bash
grep -c "^<script>$" index.html
wc -l index.html
npm run build && npm test && node test/smoke-module.js
```
Erwartet: kein eingebetteter `<script>`-Block ausser Boot-Skript und Firebase-Modul,
`index.html` bei rund 2.000 Zeilen, alles gruen.

- [ ] **Schritt 5: Native App pruefen**

```bash
~/.claude/sim-native.sh "$PWD" "iPhone 17"
xcrun simctl io "iPhone 17" screenshot /tmp/split-fertig.png
```
Bildschirmfoto ansehen. Zusaetzlich in der App durchklicken: Reiter wechseln, Training
starten, Statistik oeffnen, Einstellungen oeffnen, Theme wechseln.

- [ ] **Schritt 6: Committen**

```bash
git add js/app-boot.js index.html build.js sw.js
git commit -m "refactor: Ausfuehrungscode nach js/app-boot.js — index.html ist jetzt Geruest"
```

---

## Aufgabe 19: Tests, die index.html einlesen, nachziehen

**Dateien:**
- Aendern: `test/index-konstanten.test.js`, `test/coach-i18n.test.js`,
  `test/coach-intent.test.js`, `test/coach-report.test.js`

Diese vier Tests lesen heute `index.html` als Quelle. Nach dem Split steht dort fast
kein JavaScript mehr — sie wuerden still gruen bleiben und nichts mehr pruefen.
`index-konstanten.test.js` ist der wichtigste: sein Waechter gegen benutzte, aber nicht
deklarierte Konstanten verliert sonst genau die Wirkung, fuer die er gebaut wurde.

- [ ] **Schritt 1: Nachweisen, dass der Waechter blind geworden ist**

```bash
node -e "
const fs=require('fs');
const html=fs.readFileSync('index.html','utf8');
const rx=/(^|[^.\w\$'\"\`])([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b(?!\s*:)/g;
const s=new Set(); let m; while((m=rx.exec(html))) s.add(m[2]);
console.log('Konstanten in index.html:', s.size);
"
```
Erwartet: eine sehr kleine Zahl — Beleg, dass der Test so nichts mehr sieht.

- [ ] **Schritt 2: Quelle auf alle Dateien erweitern**

In allen vier Tests die Stelle ersetzen, die `index.html` einliest. Beispiel fuer
`test/index-konstanten.test.js`:

```js
/* Nach dem Modul-Split steht der Code nicht mehr in index.html, sondern in
   js/app-*.js. Der Waechter muss alle Quellen zusammen sehen: eine Konstante
   darf in einem Modul deklariert und in einem anderen benutzt werden — die
   Dateien teilen sich einen globalen Geltungsbereich. */
const HTML = [
  fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'),
  ...fs.readdirSync(path.join(__dirname, '..', 'js'))
      .filter(f => f.startsWith('app-') && f.endsWith('.js'))
      .sort()
      .map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'))
].join('\n');
```

Die uebrigen drei Tests analog — dort heisst die Variable moeglicherweise anders, also
erst `grep -n "index.html" test/*.js` und jede Fundstelle einzeln ansehen.

- [ ] **Schritt 3: Nachweisen, dass der Waechter wieder sieht**

```bash
npm test
```
Erwartet: gruen. Zusaetzlich der Gegenprobe wegen eine erfundene Konstante
`ZZZ_TEST_KONSTANTE` in `js/app-ui.js` benutzen (nicht deklarieren) und `npm test`
laufen lassen — der Test **muss** rot werden. Danach wieder entfernen.

- [ ] **Schritt 4: Committen**

```bash
git add test/
git commit -m "test: Waechter lesen nach dem Split alle js/app-*.js mit"
```

---

## Aufgabe 20: Regeln fuer den Parallel-Betrieb festhalten

**Dateien:**
- Aendern: `CLAUDE.md`

- [ ] **Schritt 1: Abschnitt ergaenzen**

In `CLAUDE.md` aufnehmen:

```markdown
## Parallel arbeiten (mehrere Agents)

Die App liegt in Modulen: `css/app.css` und `js/app-*.js`. `index.html` ist nur noch
HTML-Geruest. Jeder Agent arbeitet moeglichst in eigenen Dateien.

- **Worktree je Agent:** `git worktree add .worktrees/<branch> -b <branch>`,
  danach `npm install` (node_modules wird nicht geteilt).
- **Eigenes Simulator-Geraet je Agent:** `sim-native.sh <ordner> "iPhone 17"` bzw.
  `"iPhone 17 Pro"` usw. Gleiches Geraet heisst gleiche Bundle-ID
  (`com.wolter.gymtrack`) — zwei Agents ueberschreiben sich sonst die Installation.
  Hoechstens zwei Simulator-Builds gleichzeitig (RAM).
- **Version NICHT bumpen.** `APP_VERSION` in `index.html` und `CACHE` in `sw.js`
  bleiben unangetastet. Der Bump passiert einmal beim Merge nach `main` — sonst
  kollidiert jeder einzelne Merge auf derselben Zeile.
- **Neues Modul angelegt?** Dann in `build.js` (`files`-Array) **und** `sw.js`
  (`SHELL`) eintragen. Fehlt es in `build.js`, startet die native App ohne diese
  Datei; fehlt es in `sw.js`, laeuft die PWA auf einem veralteten Stand.
- **Firebase ist gemeinsam.** Projekt `gymtrack-25d39` hat keinen Emulator. Alle
  Agents schreiben in dieselbe Firestore/Auth — bei Cloud-Sync- und Community-Tests
  sehen sie gegenseitig ihre Daten.
```

- [ ] **Schritt 2: Committen**

```bash
git add CLAUDE.md
git commit -m "docs: Regeln fuer Parallelarbeit mehrerer Agents"
```

---

## Aufgabe 21: Zusammenfuehren

- [ ] **Schritt 1: Stand von main holen**

```bash
git fetch origin
git rebase origin/main
```
Konflikte sind hier zu erwarten, weil auf `main` parallel gearbeitet wurde. Sie liegen
in `index.html` — Regel: **die Aenderung von `main` gewinnt inhaltlich**, sie wird
anschliessend in das passende Modul verschoben.

- [ ] **Schritt 2: Nach dem Rebase alles pruefen**

```bash
npm run build && npm test && node test/smoke-module.js
~/.claude/sim-native.sh "$PWD" "iPhone 17"
```

- [ ] **Schritt 3: Version bumpen**

Jetzt — und nur jetzt — `APP_VERSION` in `index.html` und `CACHE` in `sw.js` auf
denselben neuen Wert `gymtrack-vJJJJMMTTNNNN` setzen.

- [ ] **Schritt 4: Nach main bringen**

```bash
git checkout main
git merge modulsplit
npm run build && npx cap sync ios
git push origin main
```

- [ ] **Schritt 5: Worktree aufraeumen**

```bash
git worktree remove .worktrees/modulsplit
git branch -d modulsplit
```
