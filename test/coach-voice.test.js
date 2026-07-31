/* GymTrack — Tests fuer Sprachaufbereitung und Stimmwahl (Block 2, Task 12).

   Drei Zusicherungen tragen diese Datei:

   1. available() zaehlt den Web-Zweig genauso wie den nativen. Faellt er
      heraus, verschwindet der Sprech-Knopf im Browser vollstaendig — und
      zwar still, weil niemand einen fehlenden Knopf als Fehler meldet.

   2. pickVoice() liefert NIE eine Stimme in der falschen Sprache. Eine
      englische Stimme, die einen deutschen Satz vorliest, ist kein
      Schoenheitsfehler, sondern unverstaendlich. Darum hat jeder Rueckfall
      seinen eigenen Fall: Wunschstimme, erste passende Sprache, null.

   3. speakable() fasst normalen Text nicht an. Die Ersetzungstabelle ist die
      Anforderung, aber die gefaehrlichere Haelfte ist das Gegenteil: eine
      Regel, die zu weit greift, zerlegt Uebungsnamen ("Rueckgrat") und
      Einheiten ("kgs") und faellt erst im Ohr des Nutzers auf. Darum steht
      neben jeder Ersetzung ein Fall, der sie NICHT ausloesen darf.

   Geprueft wird durchweg auf den EXAKTEN String, nie auf ein Enthaltensein:
   eine Teilpruefung uebersieht genau die fehlende zweite Ersetzung. */
const test = require('node:test');
const assert = require('node:assert');
const V = require('../js/coach-voice.js');

/* ---------------------------------------------------------------- available */

test('native Faehigkeiten werden gemeldet', () => {
  assert.deepStrictEqual(
    V.available({ tts: true, stt: true, webTts: false, webStt: false }),
    { tts: true, stt: true }
  );
});

// Ohne diesen Fall koennte available() den Web-Zweig ganz ignorieren und
// waere im Browser dauerhaft false — der Knopf erschiene dort nie.
test('der Web-Zweig zaehlt genauso wie der native', () => {
  assert.deepStrictEqual(
    V.available({ tts: false, stt: false, webTts: true, webStt: true }),
    { tts: true, stt: true }
  );
});

test('ohne jede Faehigkeit ist beides falsch', () => {
  assert.deepStrictEqual(V.available({ alle: false }), { tts: false, stt: false });
});

// Faengt die Abkuerzung "eine Faehigkeit fuer beide Kanaele": Vorlesen und
// Diktat sind zwei getrennte Berechtigungen und koennen einzeln fehlen.
test('Vorlesen und Diktat werden getrennt beantwortet', () => {
  assert.deepStrictEqual(
    V.available({ tts: true, stt: false, webTts: false, webStt: false }),
    { tts: true, stt: false }
  );
  assert.deepStrictEqual(
    V.available({ tts: false, stt: false, webTts: false, webStt: true }),
    { tts: false, stt: true }
  );
});

// _cap() gibt auf Web null zurueck, und speechSynthesis-Pruefungen liefern
// gern etwas Wahrheitsaehnliches statt true. Die Antwort bleibt trotzdem ein
// echter Boolean, sonst steht das Objekt spaeter in einem === false-Vergleich.
test('unsaubere Eingaben werden zu echten Booleans', () => {
  assert.deepStrictEqual(V.available({ tts: 1, stt: 'ja' }), { tts: true, stt: true });
  assert.deepStrictEqual(V.available({ tts: null, stt: undefined }), { tts: false, stt: false });
});

test('ohne Argument wirft available nicht, sondern verneint', () => {
  assert.deepStrictEqual(V.available(null), { tts: false, stt: false });
  assert.deepStrictEqual(V.available(), { tts: false, stt: false });
});

/* ---------------------------------------------------------------- pickVoice */

const DE = [{ id: 'a', lang: 'de-DE' }, { id: 'b', lang: 'de-DE' }];

test('die gewuenschte Stimme gewinnt', () => {
  assert.strictEqual(V.pickVoice(DE, 'b', 'de'), 'b');
});

// Faengt den Rueckfall auf die ERSTE Stimme der Liste statt auf die erste
// Stimme der PASSENDEN Sprache.
test('ist der Wunsch verschwunden, kommt die erste Stimme der richtigen Sprache', () => {
  assert.strictEqual(
    V.pickVoice([{ id: 'en1', lang: 'en-US' }, { id: 'de1', lang: 'de-DE' }], 'weg', 'de'),
    'de1'
  );
});

test('gibt es die Sprache nicht, gibt es keine Stimme', () => {
  assert.strictEqual(V.pickVoice([{ id: 'en1', lang: 'en-US' }], null, 'de'), null);
});

test('eine leere Liste wirft nicht', () => {
  assert.strictEqual(V.pickVoice([], 'x', 'de'), null);
  assert.strictEqual(V.pickVoice(null, 'x', 'de'), null);
  assert.strictEqual(V.pickVoice(undefined, null, 'de'), null);
});

// Der Wunsch ist eine Vorliebe, keine Vollmacht: eine gespeicherte englische
// Stimme darf einen deutschen Satz nicht kapern. Sprache schlaegt Wunsch.
test('eine Wunschstimme in der falschen Sprache wird uebergangen', () => {
  assert.strictEqual(
    V.pickVoice([{ id: 'en1', lang: 'en-US' }, { id: 'de1', lang: 'de-DE' }], 'en1', 'de'),
    'de1'
  );
});

test('eine Wunschstimme in der falschen Sprache ohne Ersatz ergibt null', () => {
  assert.strictEqual(V.pickVoice([{ id: 'en1', lang: 'en-US' }], 'en1', 'de'), null);
});

// Faengt ein fest verdrahtetes 'de' in der Auswahl.
test('bei englischem Text wird eine englische Stimme gewaehlt', () => {
  assert.strictEqual(
    V.pickVoice([{ id: 'de1', lang: 'de-DE' }, { id: 'en1', lang: 'en-GB' }], null, 'en'),
    'en1'
  );
});

// Stimmenlisten liefern 'de', 'de-DE', 'de_AT' und 'DE-DE' bunt gemischt;
// verglichen wird der Sprachteil, gross/klein egal.
test('Regionalkennung und Grossschreibung stehen der Sprache nicht im Weg', () => {
  assert.strictEqual(V.pickVoice([{ id: 'x', lang: 'de-AT' }], null, 'de'), 'x');
  assert.strictEqual(V.pickVoice([{ id: 'y', lang: 'DE-DE' }], null, 'de'), 'y');
  assert.strictEqual(V.pickVoice([{ id: 'z', lang: 'de' }], null, 'de'), 'z');
  // auch andersherum: die Anzeige reicht gelegentlich 'de-DE' als Sprache herein
  assert.strictEqual(V.pickVoice([{ id: 'q', lang: 'de-DE' }], null, 'de-DE'), 'q');
  // Stimmenlisten liefern die Kennung gelegentlich mit Leerraum am Rand
  assert.strictEqual(V.pickVoice([{ id: 'r', lang: ' de-DE ' }], null, ' de '), 'r');
});

test('kaputte Eintraege werden uebersprungen statt zu werfen', () => {
  assert.strictEqual(
    V.pickVoice([null, { lang: 'de-DE' }, { id: 'de2' }, { id: 'de3', lang: 'de-DE' }], null, 'de'),
    'de3'
  );
});

// Ohne Sprache laesst sich nicht sagen, welche Stimme die richtige waere —
// dann lieber schweigen als raten. Die Anzeige reicht immer eine Sprache
// herein; kommt hier nichts an, ist das ein Fehler beim Aufrufer.
test('ohne Sprache wird nicht geraten', () => {
  assert.strictEqual(V.pickVoice(DE, 'b', null), null);
  assert.strictEqual(V.pickVoice(DE, 'b', ''), null);
});

/* ---------------------------------------------------------------- speakable */

test('die Ersetzungstabelle greift vollstaendig in einem Satz', () => {
  assert.strictEqual(V.speakable('**Bank** 3 × 8 @ 62,5 kg'), 'Bank 3 mal 8 bei 62,5 Kilo');
});

test('das Listenzeichen am Zeilenanfang verschwindet', () => {
  assert.strictEqual(V.speakable('· Punkt eins'), 'Punkt eins');
  assert.strictEqual(V.speakable('- Punkt eins'), 'Punkt eins');
  assert.strictEqual(V.speakable('  • Punkt eins'), 'Punkt eins');
});

// Der Gegenfall zum Listenzeichen: ein Gedankenstrich mitten im Satz ist
// keine Aufzaehlung und bleibt stehen.
test('ein Strich mitten im Satz bleibt', () => {
  assert.strictEqual(V.speakable('Bank - schwer heute'), 'Bank - schwer heute');
});

test('normaler Text bleibt unveraendert, auch der Schlusspunkt', () => {
  assert.strictEqual(V.speakable('Guter Satz.'), 'Guter Satz.');
  assert.strictEqual(V.speakable('Sauber ausgefuehrt, weiter so!'), 'Sauber ausgefuehrt, weiter so!');
});

test('leere und fehlende Eingaben ergeben einen leeren String', () => {
  assert.strictEqual(V.speakable(''), '');
  assert.strictEqual(V.speakable(null), '');
  assert.strictEqual(V.speakable(undefined), '');
  assert.strictEqual(V.speakable({}), '');
});

// Ohne Leerzeichen geschrieben ist der haeufigste Fall im Satzkatalog.
test('das Mal-Zeichen wird auch ohne Leerzeichen gesprochen', () => {
  assert.strictEqual(V.speakable('3×8'), '3 mal 8');
});

test('die Einheit direkt an der Zahl wird ebenfalls ausgeschrieben', () => {
  assert.strictEqual(V.speakable('62,5kg'), '62,5 Kilo');
  assert.strictEqual(V.speakable('8Wdh'), '8 Wiederholungen');
});

// Die beiden Gegenfaelle zur Wortgrenze. Ohne sie wuerde aus einem
// Uebungshinweis "RuecKilorat" und aus einer Einheit "Kilos".
test('kg innerhalb eines Wortes wird nicht ersetzt', () => {
  assert.strictEqual(V.speakable('Halt dein Rückgrat gerade.'), 'Halt dein Rückgrat gerade.');
  assert.strictEqual(V.speakable('12 kgs'), '12 kgs');
});

test('Wdh wird an der Wortgrenze ausgeschrieben', () => {
  assert.strictEqual(V.speakable('3 × 8 Wdh'), '3 mal 8 Wiederholungen');
  // Gegenfall wie bei "kgs": haengt ein Zeichen an, ist es nicht die
  // Abkuerzung. Ein deutsches Wort mit "Wdh" darin gibt es nicht, darum ist
  // die angehaengte Endung der einzige Fall, der die Grenze wirklich prueft.
  assert.strictEqual(V.speakable('5 Wdhs'), '5 Wdhs');
});

// Faengt den gierigen Fettdruck-Ausdruck, der alles zwischen dem ersten und
// dem letzten Sternpaar verschluckt.
test('mehrere fette Stellen in einer Zeile werden einzeln entfernt', () => {
  assert.strictEqual(V.speakable('**A** und **B**'), 'A und B');
});

// Ein halbes Sternpaar darf keinen Text mitreissen.
test('ein unvollstaendiges Sternpaar frisst keinen Text', () => {
  assert.strictEqual(V.speakable('Satz mit ** ohne Ende'), 'Satz mit ** ohne Ende');
});

// Bewusst festgehalten: das At-Zeichen wird IMMER ersetzt, auch in einer
// Adresse. Eine Ausnahme fuer wortumschlossene At-Zeichen wuerde genau den
// Hauptfall "8@62,5kg" wieder kaputt machen.
test('eine Adresse bleibt vollstaendig lesbar', () => {
  assert.strictEqual(V.speakable('schreib an max@example.com'), 'schreib an max bei example.com');
  assert.strictEqual(V.speakable('8@62,5kg'), '8 bei 62,5 Kilo');
});

test('mehrfache Leerzeichen werden zusammengezogen und die Raender getrimmt', () => {
  assert.strictEqual(V.speakable('Bank    schwer'), 'Bank schwer');
  assert.strictEqual(V.speakable('   Bank schwer   '), 'Bank schwer');
});

// Zeilenumbrueche bleiben: sie sind die Atempausen der Sprachausgabe. Eine
// Liste, die zu einem Satz verschmilzt, wird in einem Zug heruntergelesen.
test('eine Liste behaelt ihre Zeilen und verliert nur die Zeichen', () => {
  assert.strictEqual(
    V.speakable('- Bank 3 × 8\n- Kniebeuge 5 Wdh'),
    'Bank 3 mal 8\nKniebeuge 5 Wiederholungen'
  );
});

test('Windows-Zeilenenden hinterlassen kein Wagenruecklaufzeichen', () => {
  assert.strictEqual(V.speakable('- Bank\r\n- Kniebeuge'), 'Bank\nKniebeuge');
});

/* ------------------------------------------------------------------ Vertrag */

// Das Modul ist rein: keine App-Globals, kein DOM, keine Systemuhr, kein
// Sprachdienst. Sonst waere es weder in Node pruefbar noch am Mac gefahrlos
// zu verdrahten.
test('das Modul haelt sich an seinen Vertrag', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'js', 'coach-voice.js'), 'utf8');
  // Kommentare heraus: dort DUERFEN die verbotenen Namen stehen, denn genau
  // die Begruendung, warum das Modul sie nicht anfasst, gehoert hinein.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ['document', 'window.', 'localStorage', 'speechSynthesis', 'Capacitor',
   'fetch(', 'Date.now'].forEach((verboten) => {
    assert.ok(code.indexOf(verboten) === -1, 'verbotener Zugriff im Modul: ' + verboten);
  });
  assert.deepStrictEqual(Object.keys(V).sort(), ['available', 'pickVoice', 'speakable']);
});
