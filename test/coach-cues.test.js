/* GymTrack — Tests fuer js/coach-cues.js (Task 14, Block 3)

   Die Tabelle ist statisch, also pruefen die Tests genau das, was an einer
   statischen Tabelle kaputtgehen kann: fehlende Sprache, Emoji, zu dünne
   Hinweise, eine Zuordnung, die den falschen (kuerzeren) Schluessel nimmt,
   und ein Allgemeinplatz fuer eine Uebung, zu der es nichts zu sagen gibt. */
const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/coach-cues.js');

const LANGS = ['de', 'en'];

// Jeder Tabellen-Durchlauf holt die Schluessel hierueber. Ohne diesen Riegel
// waere jeder Schleifentest ueber einer leeren Tabelle gruen, ohne etwas
// geprueft zu haben.
function cueKeys() {
  const keys = Object.keys(C.CUES);
  assert.ok(keys.length >= 12, 'CUES-Tabelle unerwartet klein: ' + keys.length);
  return keys;
}

test('bekannte Uebung bekommt einen Hinweis', () => {
  const cue = C.cueFor('Bankdrücken', 'de');
  assert.strictEqual(typeof cue, 'string');
  assert.ok(cue.length > 10, 'zu kurz: ' + cue);
});

test('Namensvariante, Grossschreibung und Umlaut treffen denselben Eintrag', () => {
  const base = C.cueFor('Bankdrücken', 'de');
  assert.strictEqual(typeof base, 'string', 'ohne Basis-Treffer prueft der Vergleich nichts');
  assert.strictEqual(C.cueFor('bankdruecken kurzhantel'), base);
  assert.strictEqual(C.cueFor('BANKDRÜCKEN'), base);
  assert.strictEqual(C.cueFor('Kurzhantel-Bankdrücken', 'de'), base);
});

test('englischer Uebungsname trifft denselben Eintrag auf Englisch', () => {
  const en = C.cueFor('Bench Press', 'en');
  assert.strictEqual(typeof en, 'string');
  assert.ok(en.length > 10, 'zu kurz: ' + en);
  assert.strictEqual(en, C.cueFor('Bankdrücken', 'en'));
});

test('die Sprache entscheidet ueber den Wortlaut', () => {
  assert.notStrictEqual(C.cueFor('Kniebeugen', 'en'), C.cueFor('Kniebeugen', 'de'));
  // Unbekannter Sprachcode faellt auf Deutsch zurueck, wie im uebrigen Coach.
  assert.strictEqual(C.cueFor('Kniebeugen', 'fr'), C.cueFor('Kniebeugen', 'de'));
});

test('unbekannte oder leere Uebung bekommt keinen Allgemeinplatz', () => {
  [ 'Unterarm-Wackeln', '', null, undefined, 42, {} ].forEach(v => {
    assert.strictEqual(C.cueFor(v, 'de'), null, 'Treffer bei ' + JSON.stringify(v));
    assert.strictEqual(C.cueFor(v, 'en'), null, 'Treffer bei ' + JSON.stringify(v));
  });
});

test('der laengste passende Schluessel gewinnt', () => {
  // 'rumaenischeskreuzheben' enthaelt 'kreuzheben'; wer den ersten Treffer
  // nimmt statt des laengsten, sagt beim rumaenischen Kreuzheben den Hinweis
  // zum klassischen Kreuzheben an. Gleiches Muster beim aufrechten Rudern.
  const kh = C.cueFor('Kreuzheben', 'de');
  const rdl = C.cueFor('Rumänisches Kreuzheben', 'de');
  assert.ok(kh && rdl, 'ein Eintrag fehlt');
  assert.notStrictEqual(rdl, kh);

  const row = C.cueFor('Rudern (Langhantel)', 'de');
  const upright = C.cueFor('Aufrechtes Rudern', 'de');
  assert.ok(row && upright, 'ein Eintrag fehlt');
  assert.notStrictEqual(upright, row);
});

test('jeder Eintrag liegt in beiden Sprachen vollstaendig vor', () => {
  cueKeys().forEach(key => LANGS.forEach(lang => {
    const v = C.CUES[key][lang];
    assert.strictEqual(typeof v, 'string', 'fehlende Sprachfassung: ' + key + '/' + lang);
    assert.ok(v.length > 10, 'zu kurze Sprachfassung: ' + key + '/' + lang + ': ' + v);
  }));
});

test('kein Eintrag ist unuebersetzt aus dem Deutschen kopiert', () => {
  cueKeys().forEach(key => {
    assert.notStrictEqual(C.CUES[key].en, C.CUES[key].de, 'de == en bei ' + key);
  });
});

test('kein Hinweis enthaelt ein Emoji', () => {
  cueKeys().forEach(key => LANGS.forEach(lang => {
    assert.ok(!/\p{Extended_Pictographic}/u.test(C.CUES[key][lang]),
      'Emoji in ' + key + '/' + lang + ': ' + C.CUES[key][lang]);
  }));
});

test('jeder Hinweis ist ein konkreter Punkt, keine Liste und kein Lob', () => {
  const lob = /^(super|stark|klasse|top|perfekt|sauber|gut|great|nice|good|solid|well done)[\s!.,]*$/i;
  cueKeys().forEach(key => LANGS.forEach(lang => {
    const s = C.CUES[key][lang];
    assert.ok(!lob.test(s.trim()), 'nur Lob bei ' + key + '/' + lang + ': ' + s);
    assert.ok(s.split(/\s+/).filter(Boolean).length >= 5,
      'zu duenn fuer einen Technikpunkt bei ' + key + '/' + lang + ': ' + s);
    // Ein Trainer sagt EINEN Punkt an. Zeilenumbruch, Aufzaehlungszeichen oder
    // Semikolon heissen: hier wurde eine Liste in das Feld gequetscht.
    assert.ok(!/[\n;•]|\s-\s/.test(s), 'Liste statt einem Punkt bei ' + key + '/' + lang + ': ' + s);
    assert.ok(s.length <= 150, 'zu lang zum Ansagen bei ' + key + '/' + lang + ': ' + s);
  }));
});

test('jeder Schluessel ist normalisiert und damit ueberhaupt erreichbar', () => {
  cueKeys().forEach(key => {
    assert.match(key, /^[a-z0-9]+$/, 'Schluessel nicht normalisiert: ' + key);
    assert.ok(C.cueFor(key, 'de'), 'Schluessel unerreichbar: ' + key);
  });
});

test('die Tabelle deckt mindestens zwoelf Uebungen ab', () => {
  // Schluessel allein reichen nicht: zwoelf Aliase auf drei Hinweise waeren
  // eine Tabelle mit drei Uebungen.
  const distinct = new Set(cueKeys().map(k => C.CUES[k].de));
  assert.ok(distinct.size >= 12, 'nur ' + distinct.size + ' verschiedene Hinweise');
});
