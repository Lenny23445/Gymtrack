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

// ── Jede Zuordnung einzeln festgenagelt ───────────────────────────────────
// Vorher waren vier der Hinweise an einen Uebungsnamen gebunden; die uebrigen
// haetten paarweise vertauscht sein koennen, ohne dass ein Test es merkt
// (Beinbeuger mit dem Text zum Beinstrecker liest sich fuer die Suite gleich
// gut). Die Tabelle unten bindet JEDEN Hinweis an einen Namen, wie ihn ein
// Nutzer eintippt — und prueft zugleich, dass er nicht bei einem der
// Nachbareintraege landet.
const ZUORDNUNG = [
  ['Bankdrücken',              'bankdruecken'],
  ['Bench Press',              'benchpress'],
  ['Kniebeugen',               'kniebeuge'],
  ['Bulgarian Split Squat',    'splitsquat'],
  ['Ausfallschritte',          'ausfallschritt'],
  ['Kreuzheben',               'kreuzheben'],
  ['Rumänisches Kreuzheben',   'rumaenischeskreuzheben'],
  ['Schulterdrücken',          'schulterdruecken'],
  ['Klimmzug',                 'pullup'],
  ['Latzug',                   'latzug'],
  ['Rudern (Langhantel)',      'rudern'],
  ['Aufrechtes Rudern',        'aufrechtesrudern'],
  ['Beinpresse',               'beinpresse'],
  ['Beinbeuger',               'beinbeuger'],
  ['Beinstrecker',             'beinstrecker'],
  ['Wadenheben',               'wadenheben'],
  ['Hip Thrust',               'hipthrust'],
  ['Bizepscurl',               'bizeps'],
  ['Hammercurl',               'hammercurl'],
  ['Trizepsdrücken',           'trizepsdruecken'],
  ['Dips',                     'dips'],
  ['Seitheben',                'seitheben'],
  ['Face Pull',                'facepull'],
  ['Fliegende',                'fliegende'],
  ['Reverse Fly',              'reversefly'],
  ['Plank',                    'plank'],
  ['Liegestütze',              'liegestuetz'],
  ['Shrugs',                   'shrug'],
  ['Crunches',                 'crunch'],
  ['Beinheben',                'beinheben']
];

test('jeder Uebungsname trifft genau seinen Hinweis, nicht den des Nachbarn', () => {
  const seen = new Set();
  ZUORDNUNG.forEach(([name, key]) => {
    const row = C.CUES[key];
    assert.ok(row, 'Schluessel fehlt in der Tabelle: ' + key);
    ['de', 'en'].forEach(lang => {
      assert.strictEqual(C.cueFor(name, lang), row[lang],
        'falscher Hinweis fuer "' + name + '" (' + lang + '): ' + C.cueFor(name, lang));
    });
    seen.add(row.de);
  });
  const alle = new Set(Object.keys(C.CUES).map(k => C.CUES[k].de));
  assert.strictEqual(seen.size, alle.size,
    'nicht jeder Hinweis der Tabelle ist an einen Namen gebunden: ' + (alle.size - seen.size) + ' offen');
});

test('benachbarte Geraete bekommen nicht denselben Hinweis', () => {
  // Der teuerste Tippfehler in einer solchen Tabelle ist die Vertauschung
  // zweier eng verwandter Eintraege.
  const paare = [['Beinbeuger', 'Beinstrecker'], ['Latzug', 'Klimmzug'],
                 ['Rudern', 'Aufrechtes Rudern'], ['Bizepscurl', 'Hammercurl'],
                 ['Kreuzheben', 'Rumänisches Kreuzheben'], ['Fliegende', 'Reverse Fly']];
  paare.forEach(([a, b]) => {
    assert.notStrictEqual(C.cueFor(a, 'de'), C.cueFor(b, 'de'), a + ' und ' + b + ' teilen sich einen Hinweis');
  });
});

// ── Normalisierung ────────────────────────────────────────────────────────

test('dekomponierter Umlaut trifft denselben Eintrag wie der komponierte', () => {
  // 'ü' gibt es als ein Zeichen (U+00FC) und als u + Trema (U+0075 U+0308).
  // Beides kommt aus echten Eingaben; die Aufloesung der Umlaute muss deshalb
  // nach der Komposition passieren, nicht davor.
  const base = C.cueFor('Bankdrücken', 'de');
  assert.ok(base, 'ohne Basis-Treffer prueft der Vergleich nichts');
  assert.strictEqual(C.cueFor('Bankdrücken', 'de'), base);
  assert.strictEqual(C.normalize('Bankdrücken'), C.normalize('Bankdrücken'));
});

test('die Schreibweise ohne Umlaut trifft denselben Eintrag', () => {
  // Auf einer Tastatur ohne Umlaute und in vielen Importen steht 'Bankdrucken'.
  assert.strictEqual(C.cueFor('Bankdrucken', 'de'), C.cueFor('Bankdrücken', 'de'));
  assert.strictEqual(C.cueFor('Schulterdrucken', 'de'), C.cueFor('Schulterdrücken', 'de'));
  assert.strictEqual(C.cueFor('Klimmzuge', 'de'), C.cueFor('Klimmzüge', 'de'));
});

test('Einzahl und Mehrzahl treffen denselben Eintrag', () => {
  const pull = C.cueFor('Klimmzug', 'de');
  assert.ok(pull, 'Klimmzug ohne Hinweis');
  assert.strictEqual(C.cueFor('Klimmzüge', 'de'), pull);
  assert.strictEqual(C.cueFor('Pull-ups', 'en'), C.cueFor('Klimmzug', 'en'));
});

test('gaengige Varianten treffen den passenden Eintrag', () => {
  assert.strictEqual(C.cueFor('Chin-up', 'de'), C.cueFor('Klimmzug', 'de'));
  assert.strictEqual(C.cueFor('Nackendrücken', 'de'), C.cueFor('Schulterdrücken', 'de'));
  assert.strictEqual(C.cueFor('Bein-Curl', 'de'), C.cueFor('Beinbeuger', 'de'));
});

test('ein kurzer Schluessel trifft nicht mitten im Wort', () => {
  // 'row' steckt in 'narrowgrip'. Wer drei Zeichen per indexOf sucht, sagt
  // beim Enggriff-Bankdruecken den Ruder-Hinweis an.
  assert.strictEqual(C.cueFor('Narrow Grip', 'de'), null,
    'Ruder-Hinweis bei einer Griffangabe');
  assert.strictEqual(C.cueFor('Narrow Grip Bench Press', 'de'), C.cueFor('Bankdrücken', 'de'));
  // Als eigenes Wort muss der kurze Schluessel weiterhin treffen.
  assert.strictEqual(C.cueFor('Row', 'en'), C.cueFor('Rudern', 'en'));
  assert.strictEqual(C.cueFor('Barbell Row', 'en'), C.cueFor('Rudern', 'en'));
  assert.strictEqual(C.cueFor('RDL', 'de'), C.cueFor('Rumänisches Kreuzheben', 'de'));
});

/* ── Geraeteerkennung aus dem Uebungsnamen (Blockabschluss-Review C1) ───────
   Der Coach sagte Aufwaermsaetze an, die niemand auflegen kann, weil die
   Verdrahtung barKg allein aus ex.showPlateCalc ableitete — einem Schalter,
   den keine Bibliotheks- und keine Vorlagen-Uebung je setzt. Die einzige
   belastbare Quelle daneben ist der NAME, und die Namensnormalisierung dieses
   Moduls ist die einzige des Coach. Deshalb liegt equipFor() hier. */

test('equipFor erkennt die Langhantel-Uebungen der Bibliothek', () => {
  ['Bankdrücken', 'Schrägbankdrücken', 'Kniebeugen', 'Front-Kniebeuge', 'Kreuzheben',
   'Rumänisches Kreuzheben', 'Schulterdrücken', 'Rudern (Langhantel)', 'T-Bar Rudern',
   'Bizeps-Curls (LH)', 'Hip Thrust', 'Shrugs', 'Engers Bankdrücken', 'Aufrechtes Rudern']
    .forEach(n => assert.strictEqual(C.equipFor(n), 'barbell', 'nicht als Langhantel erkannt: ' + n));
});

test('equipFor erkennt die Kurzhantel-Uebungen der Bibliothek', () => {
  ['Kurzhantel-Bankdrücken', 'Kurzhantel-Rudern', 'KH-Schulterdrücken', 'Bizeps-Curls (KH)',
   'Hammer-Curls', 'Seitheben', 'Frontheben', 'Arnold Press', 'Goblet Squat',
   'Konzentrations-Curls', 'Reverse Flys']
    .forEach(n => assert.strictEqual(C.equipFor(n), 'dumbbell', 'nicht als Kurzhantel erkannt: ' + n));
});

test('equipFor erkennt Maschine, Kabel und Steckgewicht', () => {
  ['Latzug', 'Beinpresse', 'Beinstrecker', 'Beinbeuger', 'Butterfly (Maschine)',
   'Kabelzug Brust', 'Trizepsdrücken (Kabel)', 'Cable Crunches', 'Face Pulls']
    .forEach(n => assert.strictEqual(C.equipFor(n), 'machine', 'nicht als Maschine erkannt: ' + n));
});

test('das Geraetewort schlaegt den Bewegungsnamen, nicht der laengere Schluessel', () => {
  // Der Punkt, an dem eine reine Laengenregel (wie bei cueFor) falsch waere:
  // 'kurzhantelbankdruecken' enthaelt 'bankdruecken' (12 Zeichen) und
  // 'kurzhantel' (10). Die Geraeteangabe ist die Aussage, der Bewegungsname
  // nur die Vorgabe.
  assert.strictEqual(C.equipFor('Kurzhantel-Bankdrücken'), 'dumbbell');
  assert.strictEqual(C.equipFor('Bankdrücken'), 'barbell');
  assert.strictEqual(C.equipFor('Kniebeuge an der Maschine'), 'machine');
  assert.strictEqual(C.equipFor('Kreuzheben mit Kurzhanteln'), 'dumbbell');
});

test('equipFor liest beide Umlaut-Schreibweisen und ignoriert Zeichensetzung', () => {
  assert.strictEqual(C.equipFor('bankdrucken'), 'barbell');
  assert.strictEqual(C.equipFor('BANKDRÜCKEN  (schwer)'), 'barbell');
  assert.strictEqual(C.equipFor('Bench Press'), 'barbell');
  assert.strictEqual(C.equipFor('Dumbbell Row'), 'dumbbell');
  assert.strictEqual(C.equipFor('Lat Pulldown'), 'machine');
});

test('ohne Anhaltspunkt gibt equipFor null statt zu raten', () => {
  // null heisst 'keine Aussage'. Die Verdrahtung nimmt dann KEINE Stange an —
  // eine erfundene Stange rundet auf Scheibenpaare, die es nicht gibt.
  assert.strictEqual(C.equipFor('Irgendwas Neues'), null);
  assert.strictEqual(C.equipFor(''), null);
  assert.strictEqual(C.equipFor(null), null);
  assert.strictEqual(C.equipFor(42), null);
});

// --- keepName: der Uebungsname bleibt der, unter dem sie angelegt wurde -----

test('keepName holt den eingedeutschten Namen zurueck', () => {
  const t = 'Bei Bankdrücken warst du stark. Nächster Satz Bankdrücken mit 80 kg.';
  assert.strictEqual(C.keepName(t, 'Bench Press', ['Bankdrücken']),
    'Bei Bench Press warst du stark. Nächster Satz Bench Press mit 80 kg.');
});

test('keepName funktioniert auch in die andere Richtung', () => {
  assert.strictEqual(C.keepName('Bench Press sitzt.', 'Bankdrücken', ['Bench Press']),
    'Bankdrücken sitzt.');
});

test('keepName laesst eine ANDERE Uebung in Ruhe, die das Alias enthaelt', () => {
  // Der Klassiker: 'Bankdrücken' steckt in 'Schrägbankdrücken'. Ohne
  // Wortgrenze entstuende 'SchrägBench Press' — eine Uebung, die es nicht gibt.
  // 'Schrägbankdrücken' ist hier bewusst KEIN Alias: es ist eine eigene Uebung.
  const t = 'Schrägbankdrücken lief besser als Bankdrücken.';
  assert.strictEqual(C.keepName(t, 'Bench Press', ['Bankdrücken']),
    'Schrägbankdrücken lief besser als Bench Press.');
});

test('keepName ersetzt jedes Alias derselben Uebung, laengstes zuerst', () => {
  // Fuehrt das Woerterbuch mehrere Schreibweisen derselben Uebung, sollen alle
  // auf den Namen des Nutzers fallen — das lange zuerst, sonst bliebe ein Rest.
  assert.strictEqual(
    C.keepName('Kurzhantel-Bankdrücken und Bankdrücken.', 'Press',
               ['Bankdrücken', 'Kurzhantel-Bankdrücken']),
    'Press und Press.');
});

test('keepName achtet auf Wortgrenzen mit Umlauten', () => {
  // \b kennt Umlaute nicht — ohne eigene Grenzpruefung schnitte die Ersetzung
  // mitten in ein Wort.
  assert.strictEqual(C.keepName('Kniebeugenmaschine steht frei.', 'Squats', ['Kniebeugen']),
    'Kniebeugenmaschine steht frei.');
  assert.strictEqual(C.keepName('Kniebeugen stehen an.', 'Squats', ['Kniebeugen']),
    'Squats stehen an.');
});

test('keepName ignoriert Gross- und Kleinschreibung des Modells', () => {
  assert.strictEqual(C.keepName('bankdrücken war schwer.', 'Bench Press', ['Bankdrücken']),
    'Bench Press war schwer.');
});

test('keepName laesst Sonderzeichen im Namen unversehrt', () => {
  // Klammern und Bindestriche sind in Uebungsnamen ueblich (Bizeps-Curls (KH))
  // und duerfen die Regex nicht sprengen.
  assert.strictEqual(C.keepName('Dumbbell Curls sind dran.', 'Bizeps-Curls (KH)', ['Dumbbell Curls']),
    'Bizeps-Curls (KH) sind dran.');
  assert.strictEqual(C.keepName('Bizeps-Curls (KH) sind dran.', 'Dumbbell Curls', ['Bizeps-Curls (KH)']),
    'Dumbbell Curls sind dran.');
});

test('keepName vertraegt fehlende Angaben, ohne zu werfen', () => {
  assert.strictEqual(C.keepName('Text', 'Name', null), 'Text');
  assert.strictEqual(C.keepName('Text', '', ['A']), 'Text');
  assert.strictEqual(C.keepName('', 'Name', ['A']), '');
  assert.strictEqual(C.keepName(null, 'Name', ['A']), null);
  assert.strictEqual(C.keepName('Text', 'Name', [null, '', 'Name']), 'Text');
});
