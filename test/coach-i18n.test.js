/* GymTrack — Drift-Test DE/EN fuer Coach-Intent-Antworten (Task 7 Review, Punkt
   "Auch hinzufuegen").
   Die I18N_RX-Regeln in index.html wurden per Hand von den Antwort-Vorlagen in
   js/coach-intent.js abgeschrieben. Nichts verbindet die beiden Seiten — eine
   Wortlaut-Aenderung im Router zeigt EN-Nutzern still deutschen Text, ohne
   dass irgendwo ein Fehler auftaucht.

   Dieser Test verbindet beide Seiten zur Laufzeit:
   - Die Antworten kommen vom ECHTEN js/coach-intent.js (kein hartcodierter
     erwarteter Text — nur die Ausloese-Bedingung pro Intent ist hartcodiert).
   - Die I18N_RX-Regeln werden aus dem echten index.html extrahiert (kein
     Abtippen/Kopieren der Regex-Liste in den Test).
   Aendert sich einer der beiden Texte, prueft der Test die dann aktuellen
   Werte gegeneinander — er kann nicht veralten. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const CoachIntent = require('../js/coach-intent.js');

// Extrahiert das I18N_RX-Array direkt aus index.html und wertet es per
// new Function(...) als echtes JavaScript aus. Grund: die Eintraege sind
// Regex-Literale mit Escapes, verschachtelten Zeichenklassen ([\d.,]+) und
// teils mehrzeiligen Eintraegen — das robust genug mit einem eigenen Regex
// nachzubauen waere selbst fragiler als der Code, den es pruefen soll. Ein
// kleiner Klammer-Tiefe-Scanner findet nur die ANFANG/ENDE-Grenzen des
// Arrays (er ueberspringt String- und Regex-Literale unangetastet); den
// Inhalt selbst parst die JS-Engine, nicht wir.
function extractI18nRx(html) {
  const marker = 'const I18N_RX = ';
  const markerIdx = html.indexOf(marker);
  if (markerIdx < 0) throw new Error('I18N_RX nicht in index.html gefunden');
  const start = html.indexOf('[', markerIdx);
  if (start < 0) throw new Error('Kein Array-Start nach "const I18N_RX =" gefunden');

  const len = html.length;
  let i = start, depth = 0, end = -1;
  while (i < len) {
    const c = html[i];
    if (c === '/' && html[i + 1] === '/') { // Zeilenkommentar
      const nl = html.indexOf('\n', i);
      if (nl < 0) break;
      i = nl + 1; continue;
    }
    if (c === '/' && html[i + 1] === '*') { // Blockkommentar
      const cl = html.indexOf('*/', i);
      if (cl < 0) break;
      i = cl + 2; continue;
    }
    if (c === "'" || c === '"' || c === '`') { // String-Literal ueberspringen
      const q = c; i++;
      while (i < len && html[i] !== q) { if (html[i] === '\\') i++; i++; }
      i++; continue;
    }
    if (c === '/') { // Regex-Literal ueberspringen (kein Divisions-Operator in diesem Array)
      i++;
      let inClass = false;
      while (i < len) {
        const ch = html[i];
        if (ch === '\\') { i += 2; continue; }
        if (ch === '[') { inClass = true; i++; continue; }
        if (ch === ']') { inClass = false; i++; continue; }
        if (ch === '/' && !inClass) { i++; break; }
        i++;
      }
      while (i < len && /[a-z]/i.test(html[i])) i++; // Flags (g, i, ...)
      continue;
    }
    if (c === '[') { depth++; i++; continue; }
    if (c === ']') { depth--; i++; if (depth === 0) { end = i; break; } continue; }
    i++;
  }
  if (end < 0) throw new Error('Kein passendes Array-Ende fuer I18N_RX gefunden (Scanner-Logik oder Datei geaendert?)');

  const src = html.slice(start, end);
  // eslint-disable-next-line no-new-func
  return new Function('return ' + src)();
}

const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

let I18N_RX = null;
let extractError = null;
try { I18N_RX = extractI18nRx(html); } catch (e) { extractError = e; }

test('I18N_RX laesst sich aus index.html extrahieren', () => {
  if (extractError) assert.fail('Extraktion fehlgeschlagen: ' + extractError.message);
  assert.ok(Array.isArray(I18N_RX) && I18N_RX.length > 20, 'I18N_RX sollte ein grosses Array sein');
  I18N_RX.forEach((pair, idx) => {
    assert.ok(pair[0] instanceof RegExp, `Eintrag ${idx} sollte mit einem RegExp beginnen`);
    assert.strictEqual(typeof pair[1], 'string', `Eintrag ${idx} sollte einen String-Ersatz haben`);
  });
});

// Frischer RegExp-Klon pro Pruefung: /g-Regeln fuehren sonst lastIndex ueber
// mehrere .test()-Aufrufe hinweg mit und liefern falsche Treffer/Fehltreffer.
function matchedByI18nRx(text) {
  return (I18N_RX || []).some(([rx]) => new RegExp(rx.source, rx.flags).test(text));
}

// Ein Snapshot pro Router-Intent, der genau diesen Zweig in coach-intent.js
// zuverlaessig ausloest. Der erwartete ANTWORTTEXT ist bewusst NICHT
// hartcodiert — der Test ruft den echten Router auf und prueft dessen
// tatsaechliche Antwort gegen die I18N_RX-Regeln.
const CASES = [
  {
    intent: 'nextWeight (naechstes Gewicht)',
    query: 'wie viel gewicht beim naechsten satz',
    snap: { active: { nextW: 82.5 } },
  },
  {
    intent: 'best (Rekord)',
    query: 'rekord bankdruecken',
    snap: {
      exercises: [{ id: 'ex1', name: 'Bankdruecken', muscleGroup: 'brust' }],
      bestSet: { ex1: { w: 100, r: 5, date: '2026-07-01' } },
    },
  },
  {
    intent: 'setsLeft (1 Satz uebrig)',
    query: 'wie viele saetze noch',
    snap: { active: { setsTotal: 3, setsDone: 2 } },
  },
  {
    intent: 'setsLeft (mehrere Saetze uebrig)',
    query: 'wie viele saetze noch',
    snap: { active: { setsTotal: 3, setsDone: 1 } },
  },
  {
    intent: 'rest (Restpause)',
    query: 'wie lange pause noch',
    snap: { restLeftSec: 45 },
  },
  {
    intent: 'recovery (Erholung)',
    query: 'wie erholt sind meine beine',
    snap: { recovery: { Beine: 72 } },
  },
  {
    intent: 'lastDone (letzte Ausfuehrung)',
    query: 'wann hatte ich zuletzt bankdruecken',
    snap: {
      exercises: [{ id: 'ex1', name: 'Bankdruecken', muscleGroup: 'brust' }],
      lastDone: { ex1: '2026-06-15' },
    },
  },
];

test('jede lokale Intent-Antwort hat eine passende I18N_RX-Regel (DE/EN-Drift-Schutz)', () => {
  assert.ok(I18N_RX, 'I18N_RX-Extraktion muss vorher erfolgreich gewesen sein');
  CASES.forEach(({ intent, query, snap }) => {
    const local = CoachIntent.resolveIntent(query, snap);
    assert.ok(local && local.answer,
      `Intent "${intent}" sollte mit diesem Snapshot ausloesen (Query: "${query}") — ` +
      'schlaegt das fehl, hat sich das Match-Verhalten in coach-intent.js geaendert.');
    assert.ok(matchedByI18nRx(local.answer),
      `Antwort von Intent "${intent}" (${JSON.stringify(local.answer)}) wird von KEINER ` +
      'I18N_RX-Regel aus index.html getroffen — EN-Nutzer saehen deutschen Text ohne jeden Fehler.');
  });
});

// Bewusst NICHT in CASES/der Drift-Pruefung oben (siehe Task-7-Review-Bericht,
// Minor-Befunde):
//  - Intent "today" (was steht heute an): answer ist reiner Pass-Through von
//    snap.todayText, das schon VOR dem Router lokalisiert wird
//    (_coachTodaySuggestion() in index.html nutzt intern _cm()). coach-intent.js
//    erzeugt hier keinen eigenen deutschen Wortlaut, den man gegen I18N_RX
//    pruefen koennte — es gibt nichts Router-Eigenes zu testen.
//  - Intent "volume" (Wochenvolumen): braucht snap.weekVolumeKg, das
//    _coachSnap() in index.html nie befuellt (Minor-Befund im Review — der
//    Zweig ist in Produktion aktuell tot). Dafuer jetzt eine I18N_RX-Regel zu
//    verlangen waere eine Anforderung an ein Feature, das gar nicht verdrahtet
//    ist; sobald jemand weekVolumeKg ergaenzt, MUSS diese Testdatei um einen
//    "volume"-Case erweitert werden (und eine I18N_RX-Regel in index.html).
test('bekannte Luecke dokumentiert: volume-Intent ist ohne weekVolumeKg nicht erreichbar', () => {
  const local = CoachIntent.resolveIntent('wie viel volumen diese woche', { });
  assert.strictEqual(local, null,
    'Falls das hier nicht mehr null ist, wurde weekVolumeKg verdrahtet — dann braucht ' +
    'es einen echten Testfall oben in CASES plus eine I18N_RX-Regel in index.html.');
});
