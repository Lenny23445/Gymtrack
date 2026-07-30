const test = require('node:test');
const assert = require('node:assert');
const P = require('../js/coach-persona.js');

const DE = { name: 'Coach', tone: 'sachlich' };
const VARS = { ex: 'Bankdrücken', kg: 62.5, reps: 8, sets: 3, vol: 7200, pct: 12,
               weeks: 4, secs: 90, mins: 40, count: 3, days: 5 };

// --- personaGet: jedes Feld garantiert gueltig ----------------------------

test('Defaults bei fehlender Eingabe', () => {
  const p = P.personaGet(undefined);
  assert.strictEqual(p.name, 'Coach');
  assert.strictEqual(p.tone, 'sachlich');
  assert.strictEqual(p.voice, null);
  assert.strictEqual(p.voiceOn, true);
  assert.strictEqual(p.inTraining, 'key');
  assert.strictEqual(p.setFeedback, true);
  assert.strictEqual(p.pushLevel, 'normal');
  assert.strictEqual(p.insights, true);
  assert.strictEqual(p.preset, undefined);
});

test('ungueltiger Ton faellt auf sachlich zurueck', () => {
  // Drei Sorten Muell: falscher String, null, falscher Typ. Ein Guard, der nur
  // auf undefined prueft, laesst die anderen beiden durch.
  ['boese', null, 42].forEach(v =>
    assert.strictEqual(P.personaGet({ tone: v }).tone, 'sachlich', 'Ton: ' + v));
});

test('ungueltige Stufen fallen auf ihre Vorgabe zurueck', () => {
  assert.strictEqual(P.personaGet({ inTraining: 'laut' }).inTraining, 'key');
  assert.strictEqual(P.personaGet({ pushLevel: 'dauernd' }).pushLevel, 'normal');
});

test('Name wird getrimmt', () => {
  assert.strictEqual(P.personaGet({ name: '   Max   ' }).name, 'Max');
});

test('Name wird auf 20 Zeichen gekuerzt', () => {
  assert.strictEqual(P.personaGet({ name: 'A'.repeat(40) }).name.length, 20);
});

test('Name wird im Modul entschaerft, nicht erst beim Rendern', () => {
  // Der Name geht auch in Notification-Titel und in den Prompt — Stellen ohne
  // esc(). Deshalb muss die Entschaerfung HIER sitzen.
  const p = P.personaGet({ name: '<img src=x onerror=alert(1)>' });
  assert.ok(!/[<>]/.test(p.name), 'Markup-Zeichen ueberlebt: ' + p.name);
});

test('nach der Entschaerfung leerer Name wird zu Coach', () => {
  assert.strictEqual(P.personaGet({ name: '<<<>>>' }).name, 'Coach');
  assert.strictEqual(P.personaGet({ name: '   ' }).name, 'Coach');
});

test('gueltige Werte ueberleben unveraendert', () => {
  const p = P.personaGet({ name: 'Nina', tone: 'hart', inTraining: 'full',
                           setFeedback: false, pushLevel: 'eng', insights: false,
                           voice: 'de-DE-1', voiceOn: false, preset: 'close' });
  assert.strictEqual(p.name, 'Nina');
  assert.strictEqual(p.tone, 'hart');
  assert.strictEqual(p.inTraining, 'full');
  assert.strictEqual(p.setFeedback, false);
  assert.strictEqual(p.pushLevel, 'eng');
  assert.strictEqual(p.insights, false);
  assert.strictEqual(p.voice, 'de-DE-1');
  assert.strictEqual(p.voiceOn, false);
  assert.strictEqual(p.preset, 'close');
});

// --- Satzkatalog ----------------------------------------------------------

test('KEYS ist abgeleitet, nicht von Hand gepflegt', () => {
  assert.ok(Array.isArray(P.KEYS));
  assert.ok(P.KEYS.length >= 24, 'zu wenige Schluessel: ' + P.KEYS.length);
  assert.strictEqual(new Set(P.KEYS).size, P.KEYS.length, 'doppelte Schluessel');
});

test('Vollstaendigkeit: jeder Schluessel in vier Toenen und zwei Sprachen', () => {
  // Der teuerste Fehler waere eine fehlende Kombination, die erst im Betrieb
  // als leerer Coach-Satz auffaellt. Die Meldung MUSS die Kombination nennen —
  // bei knapp 200 Faellen ist "irgendwas fehlt" wertlos.
  P.KEYS.forEach(key => {
    P.TONES.forEach(tone => {
      ['de', 'en'].forEach(lang => {
        const where = key + '/' + tone + '/' + lang;
        const s = P.say(key, VARS, { name: 'Coach', tone }, lang);
        assert.strictEqual(typeof s, 'string', 'kein String: ' + where);
        assert.ok(s.length > 0, 'leer: ' + where);
        assert.notStrictEqual(s, key, 'Schluessel statt Satz: ' + where);
        assert.ok(!/\{[a-z]+\}/i.test(s), 'ungefuellter Platzhalter: ' + where + ' -> ' + s);
      });
    });
  });
});

test('vier Toene ergeben vier verschiedene Saetze', () => {
  // Faengt kopierte statt formulierte Toene.
  const set = new Set(P.TONES.map(tone => P.say('greet', VARS, { tone }, 'de')));
  assert.strictEqual(set.size, 4, 'Toene nicht verschieden: ' + [...set].join(' | '));
});

test('unbekannter Schluessel gibt leeren String zurueck statt zu werfen', () => {
  assert.strictEqual(P.say('gibtsnicht', {}, DE, 'de'), '');
});

test('fehlende Platzhalterwerte lassen keine Luecke stehen', () => {
  P.TONES.forEach(tone => {
    const s = P.say('exOpen', {}, { tone }, 'de');
    assert.ok(!/\{[a-z]+\}/i.test(s), 'Platzhalter sichtbar (' + tone + '): ' + s);
    assert.ok(!/\s{2,}/.test(s), 'doppeltes Leerzeichen (' + tone + '): ' + s);
  });
});

test('Zahlformat folgt der Sprache', () => {
  assert.ok(P.say('exOpen', VARS, DE, 'de').includes('62,5'));
  assert.ok(P.say('exOpen', VARS, DE, 'en').includes('62.5'));
});

test('Tausendertrennung folgt der Sprache', () => {
  assert.ok(P.say('debrief', { sets: 18, vol: 7200 }, DE, 'de').includes('7.200'));
  assert.ok(P.say('debrief', { sets: 18, vol: 7200 }, DE, 'en').includes('7,200'));
});

test('keine Tausendertrennung unter vier Stellen', () => {
  const s = P.say('debrief', { sets: 9, vol: 900 }, DE, 'de');
  assert.ok(s.includes('900'), s);
  assert.ok(!/9\.00/.test(s), 'faelschlich getrennt: ' + s);
});

// --- Tonregeln, an denen die Definitionen gemessen werden -----------------

test('kein Satz enthaelt ein Emoji', () => {
  P.KEYS.forEach(key => P.TONES.forEach(tone => ['de', 'en'].forEach(lang => {
    const s = P.say(key, VARS, { tone }, lang);
    assert.ok(!/\p{Extended_Pictographic}/u.test(s),
              'Emoji in ' + key + '/' + tone + '/' + lang + ': ' + s);
  })));
});

// Teil-Riegel fuer die vierte Tonregel ('kein Satz lobt nur'). Mechanisch
// vollstaendig pruefbar ist sie nicht - 'Beobachtung' laesst sich nicht
// erkennen. Was der Riegel sehen kann, schliesst er aus: kein Satz besteht nur
// aus Lob. Bis hierher stand im Modulkommentar, alle vier Regeln seien
// verankert; das war fuer diese eine unwahr.
test('kein Satz ist ein blosser Lob-Ausruf', () => {
  const lob = /^(super|stark|klasse|top|perfekt|bravo|wow|sauber|gut|great|nice|awesome|perfect|solid|good|well done)[\s!.,]*$/i;
  P.KEYS.forEach(key => P.TONES.forEach(tone => ['de', 'en'].forEach(lang => {
    const s = P.say(key, VARS, { tone }, lang);
    assert.ok(s.length > 0, 'leerer Satz bei ' + key + '/' + tone + '/' + lang);
    // Geprueft wird die ZEILE, so wie die Regel sie formuliert ('jede Zeile
    // traegt eine Zahl oder eine Beobachtung'). Satzweise waere strenger als
    // die Regel: 'Gut. Beim naechsten Mal gehen wir auf 62,5 kg.' erfuellt sie,
    // weil die Zeile die Zahl traegt - nur der erste Satz allein tut es nicht.
    assert.ok(!lob.test(s.trim()),
      'nur Lob in ' + key + '/' + tone + '/' + lang + ': ' + s);
    assert.ok(s.trim().split(/\s+/).filter(Boolean).length >= 3,
      'zu duenn fuer Zahl oder Beobachtung in ' + key + '/' + tone + '/' + lang + ': ' + s);
  })));
});

test('Ton hart bleibt bei hoechstens acht Woertern', () => {
  P.KEYS.forEach(key => ['de', 'en'].forEach(lang => {
    const s = P.say(key, VARS, { tone: 'hart' }, lang);
    const n = s.split(/\s+/).filter(Boolean).length;
    assert.ok(n <= 8, 'zu lang (' + n + ' Woerter) bei ' + key + '/' + lang + ': ' + s);
  }));
});

test('Ton ruhig verwendet kein Ausrufezeichen', () => {
  P.KEYS.forEach(key => ['de', 'en'].forEach(lang => {
    const s = P.say(key, VARS, { tone: 'ruhig' }, lang);
    assert.ok(!s.includes('!'), 'Ausrufezeichen bei ' + key + '/' + lang + ': ' + s);
  }));
});

test('forecast nennt eine Bedingung und verspricht nichts', () => {
  // Eine Prognose ist keine Zusage. Wird in Task 21 erneut geprueft; hier
  // faengt der Test es an der Quelle.
  P.TONES.forEach(tone => {
    const de = P.say('forecast', VARS, { tone }, 'de');
    const en = P.say('forecast', VARS, { tone }, 'en');
    assert.ok(/wenn|falls|sofern/i.test(de), 'keine Bedingung (de/' + tone + '): ' + de);
    assert.ok(/\bif\b|as long as/i.test(en), 'keine Bedingung (en/' + tone + '): ' + en);
  });
});

test('die Quittung auf "schwer" behauptet keine Bestaendigkeit', () => {
  // CoachRpe.adjustNext senkt bei 'schwer' um eine Stufe und uebergibt das
  // GESENKTE Gewicht. 'Gewicht bleibt bei 57,5 kg' nach einem 60-kg-Satz
  // widerspricht damit der eigenen Rechnung — der Katalogtext war die falsche
  // Seite des Widerspruchs.
  ['de', 'en'].forEach(lang => P.TONES.forEach(tone => {
    const s = P.say('setAckHard', { kg: 57.5 }, { tone }, lang);
    const where = 'setAckHard/' + tone + '/' + lang;
    assert.ok(!/bleib|stays|stay\b/i.test(s), 'behauptet Bestaendigkeit in ' + where + ': ' + s);
    assert.ok(/57[.,]5/.test(s), 'nennt das neue Gewicht nicht in ' + where + ': ' + s);
  }));
});

test('warmupIntro nennt keine feste Satzzahl', () => {
  // Das Schema in js/coach-warmup.js liefert bis zu drei Saetze und faellt je
  // nach Rundung auf zwei oder einen zurueck. Eine im Text festgeschriebene
  // Zahl widerspricht dann der Liste, die daneben steht.
  ['de', 'en'].forEach(lang => P.TONES.forEach(tone => {
    const s = P.say('warmupIntro', { ex: 'Bankdrücken' }, { tone }, lang);
    assert.ok(!/\b(zwei|drei|two|three|[123])\b/i.test(s),
      'feste Satzzahl in warmupIntro/' + tone + '/' + lang + ': ' + s);
  }));
});

test('der Plateau-Satz beschreibt die beobachtete Pause, statt sie zu empfehlen', () => {
  const rat = /könnte|koennte|sollte|solltest|hilft|helfen|versuch|probier|länger|laenger|longer|may help|might help|should|\btry\b/i;
  ['de', 'en'].forEach(lang => P.TONES.forEach(tone => {
    const s = P.say('plateau', { ex: 'Bankdrücken', weeks: 5, secs: 120 }, { tone }, lang);
    assert.ok(!rat.test(s), 'Empfehlung statt Beobachtung in plateau/' + tone + '/' + lang + ': ' + s);
  }));
});

// --- personaLine ----------------------------------------------------------

test('personaLine traegt den Namen und wuchert nicht', () => {
  ['de', 'en'].forEach(lang => {
    P.TONES.forEach(tone => {
      const line = P.personaLine({ name: 'Nina', tone }, lang);
      assert.ok(line.includes('Nina'), 'Name fehlt (' + tone + '/' + lang + '): ' + line);
      assert.ok(line.length >= 20 && line.length <= 400,
                'Laenge ' + line.length + ' (' + tone + '/' + lang + ')');
    });
  });
});

test('personaLine haelt auch ohne Eingabe die Zusage ein', () => {
  const line = P.personaLine(undefined, 'de');
  assert.ok(line.length >= 20 && line.length <= 400, 'Laenge ' + line.length);
  assert.ok(line.includes('Coach'), line);
});

// --- Profile --------------------------------------------------------------

test('die drei Profile sind vollstaendig', () => {
  // Unvollstaendig heisst: Task 7 setzt das Profil und kippt es im selben Zug
  // auf 'custom', weil ein Feld abweicht.
  assert.strictEqual(P.PRESETS.quiet.inTraining, 'off');
  assert.strictEqual(P.PRESETS.balanced.inTraining, 'key');
  assert.strictEqual(P.PRESETS.close.inTraining, 'full');
  ['quiet', 'balanced', 'close'].forEach(k => {
    const pr = P.PRESETS[k];
    assert.strictEqual(typeof pr.setFeedback, 'boolean', k + '.setFeedback');
    assert.ok(P.PUSH.includes(pr.pushLevel), k + '.pushLevel: ' + pr.pushLevel);
    assert.ok(P.LEVELS.includes(pr.inTraining), k + '.inTraining: ' + pr.inTraining);
  });
});

test('Konstanten haben die vereinbarten Werte', () => {
  assert.deepStrictEqual(P.TONES, ['ruhig', 'sachlich', 'hart', 'locker']);
  assert.deepStrictEqual(P.LEVELS, ['off', 'key', 'full']);
  assert.deepStrictEqual(P.PUSH, ['still', 'normal', 'eng']);
});

/* ── Die Einheit haengt am Wert, nicht am Katalogsatz (Review I5) ───────────
   Gemessen wurde: lbs-Nutzer, zuletzt 100 kg. Die Satzliste zeigte 220 lbs,
   die Coach-Leiste in derselben Sekunde 'zuletzt 100 kg'. Der Nutzer legt
   100 lbs auf. Der Katalog ist einheitenrein; die Verdrahtung uebergibt den
   fertig formatierten Wert samt Einheit. */

const WERT_KEYS = ['greet', 'exOpen', 'mid', 'restNext', 'setAckEasy', 'setAckHard',
                   'debrief', 'prCongrats'];

test('kein Satz des Trainingsbogens schreibt eine Einheit fest', () => {
  WERT_KEYS.forEach(key => P.TONES.forEach(tone => ['de', 'en'].forEach(lang => {
    const tpl = P.say(key, { ex: 'X', kg: 60, reps: 8, sets: 3, vol: 7200, pct: 12 },
                      { tone }, lang);
    const where = key + '/' + tone + '/' + lang;
    assert.ok(!/\b(kg|kilo|kilos|lbs|pound|pounds|Kilo)\b/i.test(tpl),
      'feste Einheit im Katalog bei ' + where + ': ' + tpl);
  })));
});

test('der uebergebene Wert traegt seine Einheit unveraendert in den Satz', () => {
  WERT_KEYS.forEach(key => P.TONES.forEach(tone => ['de', 'en'].forEach(lang => {
    const s = P.say(key, { ex: 'X', kg: '220 lbs', reps: 8, sets: 3, vol: '16.900 lbs', pct: 12 },
                    { tone }, lang);
    const where = key + '/' + tone + '/' + lang;
    assert.ok(/lbs/.test(s), 'Einheit des Wertes verloren bei ' + where + ': ' + s);
    assert.ok(!/\bkg\b/.test(s), 'kg neben lbs bei ' + where + ': ' + s);
  })));
});
