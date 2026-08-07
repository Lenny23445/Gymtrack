/* GymTrack — Waechter fuer das Teilen der Level-Scheibe (js/app-plate.js).

   Hintergrund (Fehler vom 07.08.2026, "Bild konnte nicht erstellt werden"):
   WebKit verwirft die Nutzer-Geste eines Taps, sobald vor `navigator.share`
   ein eigener Task liegt — `await cv.toBlob(...)` ist genau so einer. Danach
   wirft `share` NotAllowedError, das Teilen-Blatt geht nie auf. Im Simulator
   nachgemessen: Datei vorab erzeugt + share direkt im Klick => Blatt oeffnet;
   derselbe Aufruf nach einem await => NotAllowedError, synchron geworfen.

   Der Bildaufbau war nie schuld — deshalb bewacht dieser Test nicht das PNG,
   sondern die REIHENFOLGE: zwischen Tap und navigator.share darf nichts
   Asynchrones stehen. Faellt jemand auf toBlob/fetch zurueck, faellt der Test.

   Zweiter Punkt: die Fehlermeldung. Frueher lief jeder Fehler — auch ein
   gescheitertes Teilen — in "Bild konnte nicht erstellt werden" und schickte
   die Fehlersuche in die falsche Richtung. */
const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const lies = (d) => fs.readFileSync(path.join(__dirname, '..', 'js', d), 'utf8');
const QUELLE   = lies('app-plate.js');
const WORKOUT  = lies('app-workout.js');

/* Schneidet den Koerper einer Funktion heraus (Klammern zaehlen). */
function funktion(name, quelle){
  const src = quelle || QUELLE;
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' nicht gefunden');
  let i = src.indexOf('{', start), tiefe = 0;
  for (let j = i; j < src.length; j++){
    if (src[j] === '{') tiefe++;
    else if (src[j] === '}' && --tiefe === 0) return src.slice(start, j + 1);
  }
  assert.fail(name + ' nicht geschlossen');
}

test('lvlPlateShare wartet vor navigator.share auf nichts', () => {
  const src = funktion('lvlPlateShare');
  const vorShare = src.slice(0, src.indexOf('navigator.share('));
  assert.ok(!/\bawait\b/.test(vorShare),
    'await vor navigator.share — WebKit verwirft dann die Geste (NotAllowedError)');
  assert.ok(!/toBlob\s*\(/.test(vorShare),
    'toBlob ist asynchron; fuer das Teilen synchron toDataURL nehmen');
  assert.ok(!/\bfetch\s*\(/.test(vorShare),
    'fetch ist asynchron; die Datei muss ohne Umweg aus dem Canvas kommen');
});

test('lvlPlateShare ist kein async-Handler', () => {
  assert.ok(!/async\s+function\s+lvlPlateShare/.test(QUELLE),
    'async verleitet zu await vor dem Teilen — Funktion synchron halten');
});

test('Bild-Fehler und Teilen-Fehler sind getrennte Meldungen', () => {
  const src = funktion('lvlPlateShare');
  const bild = src.indexOf('Bild konnte nicht erstellt werden');
  assert.ok(bild >= 0, 'Meldung fuer den Bildaufbau fehlt');
  assert.ok(bild < src.indexOf('navigator.share('),
    'die Bild-Meldung darf nur den Bildaufbau abdecken, nicht das Teilen');
});

test('Abbruch durch den Nutzer bleibt stumm', () => {
  assert.ok(/AbortError/.test(funktion('lvlPlateShare')),
    'AbortError (Teilen-Blatt weggewischt) darf keine Fehlermeldung ausloesen');
});

/* Dieselbe Falle im Share-Flow nach dem Training ("Extern teilen"). Dort fiel
   sie lange nicht auf, weil der catch den Fehler nur in die Konsole schrieb —
   fuer den Nutzer passierte beim Tippen schlicht nichts. */
test('_shfExtern wartet vor navigator.share auf nichts', () => {
  const src = funktion('_shfExtern', WORKOUT);
  const vorShare = src.slice(0, src.indexOf('navigator.share('));
  assert.ok(!/\bawait\b/.test(vorShare),
    'await vor navigator.share — WebKit verwirft dann die Geste (NotAllowedError)');
  assert.ok(!/\bfetch\s*\(/.test(vorShare),
    'fetch ist asynchron; Bytes synchron aus der data-URL holen (_dataUrlBytes)');
  assert.ok(!/toBlob\s*\(/.test(vorShare), 'toBlob ist asynchron');
  assert.ok(!/async\s+function\s+_shfExtern/.test(WORKOUT), 'Handler synchron halten');
});
