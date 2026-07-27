const test = require('node:test');
const assert = require('node:assert');
const M = require('../js/coach-memory.js');

const NOW = 1753600000000;

test('leeres Dossier hat die erwartete Form', () => {
  const d = M.dossierEmpty();
  assert.strictEqual(d.v, 1);
  assert.deepStrictEqual(d.limits, []);
  assert.deepStrictEqual(d.coachStats, { accepted: 0, ignored: 0, muted: [] });
});

test('Delta fuegt einen Eintrag mit clientseitigem Zeitstempel hinzu', () => {
  const d = M.dossierApplyDelta(M.dossierEmpty(), { add: { limits: ['Linke Schulter'] } }, NOW);
  assert.strictEqual(d.limits.length, 1);
  assert.strictEqual(d.limits[0].t, 'Linke Schulter');
  assert.strictEqual(d.limits[0].ts, NOW);
});

test('vom Modell geliefertes ts wird ignoriert', () => {
  const delta = { add: { limits: [{ t: 'Knie', ts: 9999999999999 }] } };
  const d = M.dossierApplyDelta(M.dossierEmpty(), delta, NOW);
  assert.strictEqual(d.limits[0].ts, NOW);
});

test('unbekannte Schluessel werden verworfen', () => {
  const d = M.dossierApplyDelta(M.dossierEmpty(), { add: { hack: ['x'] }, evil: 1 }, NOW);
  assert.strictEqual(d.hack, undefined);
  assert.strictEqual(d.evil, undefined);
});

test('Duplikate werden nicht doppelt aufgenommen', () => {
  let d = M.dossierApplyDelta(M.dossierEmpty(), { add: { limits: ['Linke Schulter'] } }, NOW);
  d = M.dossierApplyDelta(d, { add: { limits: ['  linke schulter  '] } }, NOW + 1000);
  assert.strictEqual(d.limits.length, 1);
});

test('hoechstens 8 Eintraege, aelteste fliegen raus', () => {
  let d = M.dossierEmpty();
  for (let i = 0; i < 12; i++) {
    d = M.dossierApplyDelta(d, { add: { prefs: ['Eintrag ' + i] } }, NOW + i);
  }
  assert.strictEqual(d.prefs.length, 8);
  assert.strictEqual(d.prefs[d.prefs.length - 1].t, 'Eintrag 11');
  assert.ok(!d.prefs.some(e => e.t === 'Eintrag 0'));
});

test('Eintraege werden auf 120 Zeichen gekuerzt', () => {
  const lang = 'x'.repeat(300);
  const d = M.dossierApplyDelta(M.dossierEmpty(), { add: { works: [lang] } }, NOW);
  assert.strictEqual(d.works[0].t.length, 120);
});

test('goal und tone nur aus erlaubten Werten', () => {
  let d = M.dossierApplyDelta(M.dossierEmpty(), { goal: 'Masse', tone: 'ruhig' }, NOW);
  assert.strictEqual(d.goal, 'Masse');
  assert.strictEqual(d.tone, 'ruhig');
  d = M.dossierApplyDelta(d, { tone: 'boesartig' }, NOW);
  assert.strictEqual(d.tone, 'ruhig');
});

test('Eingabe-Dossier wird nicht veraendert', () => {
  const orig = M.dossierEmpty();
  M.dossierApplyDelta(orig, { add: { limits: ['Test'] } }, NOW);
  assert.strictEqual(orig.limits.length, 0);
});

test('remove loescht einen Eintrag', () => {
  let d = M.dossierApplyDelta(M.dossierEmpty(), { add: { limits: ['Linke Schulter'] } }, NOW);
  d = M.dossierApplyDelta(d, { remove: { limits: ['Linke Schulter'] } }, NOW);
  assert.strictEqual(d.limits.length, 0);
});
