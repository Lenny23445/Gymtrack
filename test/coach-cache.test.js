const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/coach-cache.js');

const EX = ['Bankdrücken', 'Latzug', 'Kniebeuge'];

test('normalize zieht Satzzeichen und Mehrfach-Leerzeichen weg', () => {
  assert.strictEqual(C.normalize('  Wie   führe ich   Latzug aus?? '), 'wie fuehre ich latzug aus');
});

test('sachliche Technikfrage ist nicht personenbezogen', () => {
  assert.strictEqual(C.isPersonal('Wie führe ich Latzug aus?', EX), false);
  assert.strictEqual(C.isPersonal('Was bringt Kreatin?', EX), false);
  assert.strictEqual(C.isPersonal('How do I perform a lat pulldown?', EX), false);
});

test('Possessivpronomen macht die Frage personenbezogen', () => {
  assert.strictEqual(C.isPersonal('Wie war meine letzte Bank?', EX), true);
  assert.strictEqual(C.isPersonal('Was ist mein Rekord?', EX), true);
  assert.strictEqual(C.isPersonal('How was my last session?', EX), true);
});

test('Zeitbezug macht die Frage personenbezogen', () => {
  assert.strictEqual(C.isPersonal('Was lief gestern?', EX), true);
  assert.strictEqual(C.isPersonal('Wie viel habe ich diese Woche geschafft?', EX), true);
  assert.strictEqual(C.isPersonal('What did I do last week?', EX), true);
});

test('Uebungsname plus Verlaufswort ist personenbezogen', () => {
  assert.strictEqual(C.isPersonal('Wie ist mein Fortschritt bei Kniebeuge?', EX), true);
  assert.strictEqual(C.isPersonal('Bankdrücken Verlauf', EX), true);
});

test('Uebungsname allein ohne Verlaufswort bleibt cachebar', () => {
  assert.strictEqual(C.isPersonal('Welche Muskeln trainiert Latzug?', EX), false);
});

test('im Zweifel nicht cachen: leere oder sehr kurze Frage gilt als personenbezogen', () => {
  assert.strictEqual(C.isPersonal('', EX), true);
  assert.strictEqual(C.isPersonal('und?', EX), true);
});

test('cacheKey ist stabil und sprachgetrennt', () => {
  const a = C.cacheKey('Wie führe ich Latzug aus?', 'de', 'gemini-3.5-flash-lite');
  const b = C.cacheKey('  wie führe ich latzug aus ', 'de', 'gemini-3.5-flash-lite');
  const en = C.cacheKey('Wie führe ich Latzug aus?', 'en', 'gemini-3.5-flash-lite');
  assert.strictEqual(a, b, 'Normalisierung muss denselben Schluessel liefern');
  assert.notStrictEqual(a, en, 'DE und EN duerfen nicht kollidieren');
  assert.match(a, /^c:de:gemini-3\.5-flash-lite:[0-9a-f]{16}$/);
});

test('cacheKey trennt nach Modell', () => {
  const a = C.cacheKey('Was bringt Kreatin?', 'de', 'gemini-3.5-flash-lite');
  const b = C.cacheKey('Was bringt Kreatin?', 'de', 'gemini-3.5-pro');
  assert.notStrictEqual(a, b);
});
