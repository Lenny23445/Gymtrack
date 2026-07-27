const test = require('node:test');
const assert = require('node:assert');
const L = require('../js/coach-log.js');

const NOW = 1753600000000;

function ignoreTimes(n, kind) {
  let log = L.logEmpty();
  for (let i = 0; i < n; i++) log = L.logAction(log, { kind, exId: 'ex1', accepted: false }, NOW + i);
  return log;
}

test('leeres Log ist ein leeres Array', () => {
  assert.deepStrictEqual(L.logEmpty(), []);
});

test('logAction haengt einen Eintrag an', () => {
  const log = L.logAction(L.logEmpty(), { kind: 'dropSet', exId: 'ex1', accepted: true }, NOW);
  assert.strictEqual(log.length, 1);
  assert.strictEqual(log[0].kind, 'dropSet');
  assert.strictEqual(log[0].accepted, true);
  assert.strictEqual(log[0].ts, NOW);
});

test('Ringpuffer haelt hoechstens 50 Eintraege', () => {
  let log = L.logEmpty();
  for (let i = 0; i < 70; i++) log = L.logAction(log, { kind: 'rest', exId: 'ex' + i, accepted: true }, NOW + i);
  assert.strictEqual(log.length, 50);
  assert.strictEqual(log[log.length - 1].exId, 'ex69');
  assert.strictEqual(log[0].exId, 'ex20');
});

test('Eintrag ohne kind wird verworfen', () => {
  assert.strictEqual(L.logAction(L.logEmpty(), { exId: 'ex1', accepted: true }, NOW).length, 0);
});

test('vier Ignorierungen drosseln noch nicht', () => {
  assert.strictEqual(L.isMuted(ignoreTimes(4, 'extraSet'), 'extraSet'), false);
});

test('fuenf Ignorierungen in Folge drosseln', () => {
  assert.strictEqual(L.isMuted(ignoreTimes(5, 'extraSet'), 'extraSet'), true);
});

test('Drosselung gilt nur fuer den betroffenen Typ', () => {
  assert.strictEqual(L.isMuted(ignoreTimes(5, 'extraSet'), 'dropSet'), false);
});

test('eine Annahme dazwischen setzt den Zaehler zurueck', () => {
  let log = ignoreTimes(4, 'extraSet');
  log = L.logAction(log, { kind: 'extraSet', exId: 'ex1', accepted: true }, NOW + 10);
  log = L.logAction(log, { kind: 'extraSet', exId: 'ex1', accepted: false }, NOW + 11);
  assert.strictEqual(L.isMuted(log, 'extraSet'), false);
});

test('spaetere Annahme hebt bestehende Drosselung auf', () => {
  let log = ignoreTimes(5, 'extraSet');
  assert.strictEqual(L.isMuted(log, 'extraSet'), true);
  log = L.logAction(log, { kind: 'extraSet', exId: 'ex1', accepted: true }, NOW + 99);
  assert.strictEqual(L.isMuted(log, 'extraSet'), false);
});

test('logStats zaehlt Annahmen und Ignorierungen', () => {
  let log = L.logAction(L.logEmpty(), { kind: 'dropSet', exId: 'ex1', accepted: true }, NOW);
  log = L.logAction(log, { kind: 'dropSet', exId: 'ex1', accepted: false }, NOW + 1);
  const s = L.logStats(log);
  assert.strictEqual(s.accepted, 1);
  assert.strictEqual(s.ignored, 1);
});

test('logStats listet gedrosselte Typen', () => {
  assert.deepStrictEqual(L.logStats(ignoreTimes(5, 'extraSet')).muted, ['extraSet']);
});

test('logOutcome ergaenzt das Ergebnis am juengsten passenden Eintrag', () => {
  let log = L.logAction(L.logEmpty(), { kind: 'dropSet', exId: 'ex1', accepted: true }, NOW);
  log = L.logOutcome(log, 'ex1', 'dropSet', 2.5);
  assert.strictEqual(log[0].outcomeW, 2.5);
});

test('logOutcome ohne passenden Eintrag aendert nichts', () => {
  const log = L.logAction(L.logEmpty(), { kind: 'dropSet', exId: 'ex1', accepted: true }, NOW);
  assert.deepStrictEqual(L.logOutcome(log, 'ex9', 'dropSet', 2.5), log);
});

test('Eingabe-Log wird nicht veraendert', () => {
  const orig = L.logAction(L.logEmpty(), { kind: 'rest', exId: 'ex1', accepted: true }, NOW);
  L.logAction(orig, { kind: 'rest', exId: 'ex2', accepted: true }, NOW + 1);
  assert.strictEqual(orig.length, 1);
});
