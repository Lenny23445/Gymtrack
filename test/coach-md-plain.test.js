/* GymTrack — Waechter gegen rohe Markdown-Zeichen in Coach-Texten

   Anlass (02.08.2026): Der Wochenbericht kommt aus dem Modell und das schreibt
   Zahlen gern fett — "**12.450 kg**". Der Chat rendert das (_aicMd), die
   Meldung und der Wochen-Reiter des Coach-Hubs nicht: dort standen die
   Sternchen woertlich im Text.

   _mdPlain() nimmt die Auszeichnung heraus, ohne den Satz anzufassen. Die
   gefaehrliche Haelfte ist wie bei speakable() in coach-voice.js die zu weit
   greifende Regel — deshalb pruefen die Faelle unten vor allem, was
   UNBERUEHRT bleiben muss: einzelne Sternchen ("3 * 8"), Unterstriche in
   Bezeichnern und Sternchen ohne Partner. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

/* Die Funktion lebt in js/app-native.js — einer Datei ohne Modulausgang, weil
   die App klassische Skripte im gemeinsamen Scope laedt. Fuer die Pruefung wird
   allein diese eine Funktion aus dem Quelltext geschnitten und ausgefuehrt;
   damit prueft der Test echtes Verhalten und nicht ein zweites Abbild der
   Regeln, das mit dem Original auseinanderlaufen kann. */
function ladeMdPlain() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'app-native.js'), 'utf8');
  const start = src.indexOf('function _mdPlain(');
  assert.notStrictEqual(start, -1, '_mdPlain nicht in js/app-native.js gefunden');
  // Bis zur schliessenden Klammer am Zeilenanfang — so endet jede Funktion
  // auf oberster Ebene in dieser Datei.
  const ende = src.indexOf('\n}', start);
  assert.notStrictEqual(ende, -1, '_mdPlain ist nicht sauber geschlossen');
  const code = src.slice(start, ende + 2);
  return new Function(code + '; return _mdPlain;')();
}

const _mdPlain = ladeMdPlain();

test('fett mit zwei Sternchen verliert die Sternchen, nicht den Text', () => {
  assert.strictEqual(_mdPlain('Diese Woche **12.450 kg** bewegt.'),
                     'Diese Woche 12.450 kg bewegt.');
});

test('zwei fette Stellen im selben Satz bleiben zwei Stellen', () => {
  assert.strictEqual(_mdPlain('**3** Einheiten, **8** Saetze'),
                     '3 Einheiten, 8 Saetze');
});

test('fett mit zwei Unterstrichen ebenso', () => {
  assert.strictEqual(_mdPlain('__62,5 kg__ auf der Bank'), '62,5 kg auf der Bank');
});

test('Backticks fallen weg', () => {
  assert.strictEqual(_mdPlain('Der Wert `1RM` steigt.'), 'Der Wert 1RM steigt.');
});

test('Ueberschriftsrauten am Zeilenanfang fallen weg', () => {
  assert.strictEqual(_mdPlain('## Woche 31\nGut gelaufen.'), 'Woche 31\nGut gelaufen.');
});

test('einzelne Sternchen bleiben — "3 * 8" ist keine Auszeichnung', () => {
  assert.strictEqual(_mdPlain('Bank 3 * 8 bei 62,5 kg'), 'Bank 3 * 8 bei 62,5 kg');
});

test('ein halbes Paar reisst keinen Text mit', () => {
  assert.strictEqual(_mdPlain('Stark **, weiter so'), 'Stark **, weiter so');
});

test('Unterstriche in Bezeichnern bleiben', () => {
  assert.strictEqual(_mdPlain('Feld week_key gesetzt'), 'Feld week_key gesetzt');
});

test('was kein String ist, ergibt leeren String statt Fehler', () => {
  assert.strictEqual(_mdPlain(null), '');
  assert.strictEqual(_mdPlain(undefined), '');
});
