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

const TAG = 86400000;

test('Eintrag aelter als 42 Tage gilt als stale', () => {
  let d = M.dossierApplyDelta(M.dossierEmpty(), { add: { limits: ['Alte Schulter'] } }, NOW - 43 * TAG);
  assert.deepStrictEqual(M.dossierStale(d, NOW), ['Alte Schulter']);
});

test('frischer Eintrag ist nicht stale', () => {
  let d = M.dossierApplyDelta(M.dossierEmpty(), { add: { limits: ['Neue Schulter'] } }, NOW - 10 * TAG);
  assert.deepStrictEqual(M.dossierStale(d, NOW), []);
});

test('nur limits verfallen, prefs und works nicht', () => {
  let d = M.dossierApplyDelta(M.dossierEmpty(), { add: { prefs: ['Abends'] } }, NOW - 99 * TAG);
  assert.deepStrictEqual(M.dossierStale(d, NOW), []);
});

test('Bestaetigung erneuert den Zeitstempel', () => {
  let d = M.dossierApplyDelta(M.dossierEmpty(), { add: { limits: ['Schulter'] } }, NOW - 43 * TAG);
  d = M.dossierRefresh(d, 'Schulter', true, NOW);
  assert.strictEqual(d.limits[0].ts, NOW);
  assert.deepStrictEqual(M.dossierStale(d, NOW), []);
});

test('Verneinung entfernt den Eintrag', () => {
  let d = M.dossierApplyDelta(M.dossierEmpty(), { add: { limits: ['Schulter'] } }, NOW - 43 * TAG);
  d = M.dossierRefresh(d, 'Schulter', false, NOW);
  assert.strictEqual(d.limits.length, 0);
});

test('stale Eintrag gilt bis zur Antwort weiter', () => {
  let d = M.dossierApplyDelta(M.dossierEmpty(), { add: { limits: ['Schulter'] } }, NOW - 43 * TAG);
  assert.ok(M.dossierForPrompt(d).includes('Schulter'));
});

test('Prompt-Form bleibt unter 4000 Zeichen', () => {
  let d = M.dossierEmpty();
  // Jede Iteration muss einen ANDEREN Eintrag liefern - sonst dedupliziert
  // dossierApplyDelta ueber den Normalform-Vergleich und pro Liste bleibt nur
  // ein einziger Eintrag statt acht, und der 4000er-Test prueft dann nichts.
  for (let i = 0; i < 8; i++) {
    const suffix = String(i);
    d = M.dossierApplyDelta(d, {
      add: {
        limits: ['L'.repeat(120 - suffix.length) + suffix],
        prefs: ['P'.repeat(120 - suffix.length) + suffix],
        works: ['W'.repeat(120 - suffix.length) + suffix]
      }
    }, NOW + i);
  }
  // Erst hier ist sichergestellt, dass wirklich alle drei Listen ihre volle
  // Kapazitaet erreicht haben - sonst kann derselbe Fehler unbemerkt zurueckkommen.
  assert.strictEqual(d.limits.length, 8);
  assert.strictEqual(d.prefs.length, 8);
  assert.strictEqual(d.works.length, 8);
  assert.ok(M.dossierForPrompt(d).length <= 4000);
});

test('Einschraenkungs-Zeile bleibt bei maximal gefuelltem Dossier vollstaendig erhalten', () => {
  let d = M.dossierApplyDelta(M.dossierEmpty(), { goal: 'Masse', tone: 'ruhig' }, NOW);
  for (let i = 0; i < 8; i++) {
    const suffix = String(i);
    d = M.dossierApplyDelta(d, {
      add: {
        limits: ['L'.repeat(120 - suffix.length) + suffix],
        prefs: ['P'.repeat(120 - suffix.length) + suffix],
        works: ['W'.repeat(120 - suffix.length) + suffix]
      }
    }, NOW + i);
  }
  // derived/coachStats sprengen absichtlich die 4000er-Grenze, damit
  // dossierForPrompt tatsaechlich abschneidet - nur dann ist der Test scharf.
  d.derived = { stall: Array.from({ length: 20 }, (_, i2) => 'Stagnation-Uebung-' + 'S'.repeat(100) + i2) };
  d.coachStats.muted = Array.from({ length: 20 }, (_, i2) => 'Vorschlagstyp-' + 'M'.repeat(100) + i2);

  const prompt = M.dossierForPrompt(d);
  assert.strictEqual(prompt.length, 4000); // Beleg: es wurde tatsaechlich abgeschnitten
  const limitsLine = 'Einschraenkungen (immer respektieren): ' + d.limits.map(e => e.t).join('; ');
  assert.ok(prompt.includes(limitsLine));
});

test('leeres Dossier liefert leeren Prompt-String', () => {
  assert.strictEqual(M.dossierForPrompt(M.dossierEmpty()), '');
});

function fakeStore() {
  const data = {};
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; }
  };
}

test('Schluessel enthaelt die uid', () => {
  assert.strictEqual(M.dossierKey('abc123'), 'gt_coachDossier:abc123');
});

test('Speichern und Laden fuer dieselbe uid', () => {
  const s = fakeStore();
  const d = M.dossierApplyDelta(M.dossierEmpty(), { add: { limits: ['Schulter'] } }, NOW);
  M.dossierSave(s, 'userA', d);
  assert.strictEqual(M.dossierLoad(s, 'userA').limits[0].t, 'Schulter');
});

test('fremde uid sieht das Dossier NICHT', () => {
  const s = fakeStore();
  M.dossierSave(s, 'userA', M.dossierApplyDelta(M.dossierEmpty(), { add: { limits: ['Schulter'] } }, NOW));
  const fremd = M.dossierLoad(s, 'userB');
  assert.deepStrictEqual(fremd.limits, []);
});

test('ohne uid wird weder geladen noch gespeichert', () => {
  const s = fakeStore();
  assert.strictEqual(M.dossierSave(s, null, M.dossierEmpty()), false);
  assert.deepStrictEqual(M.dossierLoad(s, null).limits, []);
  assert.deepStrictEqual(Object.keys(s.data), []);
});

test('dossierClear entfernt nur die eigene uid', () => {
  const s = fakeStore();
  M.dossierSave(s, 'userA', M.dossierEmpty());
  M.dossierSave(s, 'userB', M.dossierEmpty());
  M.dossierClear(s, 'userA');
  assert.strictEqual(s.getItem(M.dossierKey('userA')), null);
  assert.notStrictEqual(s.getItem(M.dossierKey('userB')), null);
});

test('kaputtes JSON im Speicher ergibt ein leeres Dossier', () => {
  const s = fakeStore();
  s.setItem(M.dossierKey('userA'), '{kaputt');
  assert.deepStrictEqual(M.dossierLoad(s, 'userA').limits, []);
});

test('Dossier ohne v wird migriert', () => {
  const s = fakeStore();
  s.setItem(M.dossierKey('userA'), JSON.stringify({ limits: [{ t: 'Alt', ts: NOW }] }));
  const d = M.dossierLoad(s, 'userA');
  assert.strictEqual(d.v, 1);
  assert.strictEqual(d.limits[0].t, 'Alt');
  assert.deepStrictEqual(d.coachStats, { accepted: 0, ignored: 0, muted: [] });
});

// Spec, Datenschutz Punkt 4: profiles/{uid} ist fuer JEDEN angemeldeten Nutzer
// lesbar. Ein Schreibpfad dorthin waere ein Leck. Der Test prueft die Quelle,
// weil die Einheit selbst gar keinen Firestore-Zugriff haben darf.
test('coach-memory.js enthaelt keinen Schreibpfad nach profiles/', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../js/coach-memory.js'), 'utf8');
  assert.ok(!/profiles/.test(src), 'coach-memory.js darf profiles/ nicht erwaehnen');
  assert.ok(!/setDoc|updateDoc|firestore|window\.FB/.test(src),
            'coach-memory.js darf keinen Firestore-Zugriff enthalten');
});

// --- Haertung des Lade-Pfads (Abweichung vom Plan, Begruendung in progress.md) ---
// dossierLoad ist die Vertrauensgrenze: localStorage ist fremdbeschreibbar (XSS,
// Alt-Schema, manipuliertes Geraet) und der Inhalt landet danach ungefiltert im
// Coach-Prompt unter der Zeile "Einschraenkungen (immer respektieren)".

test('Laden repariert Alt-Eintraege ohne Zeitstempel statt sie stumm zu verlieren', () => {
  const s = fakeStore();
  // Altform: reine Strings statt {t, ts}. Die Plan-Fassung von dossierLoad hat
  // die Liste unveraendert uebernommen -> dossierForPrompt schrieb die Kopfzeile
  // "Einschraenkungen (immer respektieren): ; " mit LEEREM Inhalt, die
  // Einschraenkung war stumm weg.
  s.setItem(M.dossierKey('userA'), JSON.stringify({ limits: ['Schulter', 'Knie'] }));
  const d = M.dossierLoad(s, 'userA');
  assert.deepStrictEqual(d.limits.map(e => e.t), ['Schulter', 'Knie']);
  assert.ok(M.dossierForPrompt(d).includes('Schulter; Knie'));
  // Ohne Zeitstempel gilt der Eintrag als faellig zur Bestaetigung, nicht als frisch.
  assert.deepStrictEqual(M.dossierStale(d, NOW), ['Schulter', 'Knie']);
});

test('Laden verwirft unbekanntes goal und tone', () => {
  const s = fakeStore();
  s.setItem(M.dossierKey('userA'), JSON.stringify({ goal: '<script>x</script>', tone: 'boesartig' }));
  const d = M.dossierLoad(s, 'userA');
  assert.strictEqual(d.goal, null);
  assert.strictEqual(d.tone, null);
  assert.strictEqual(M.dossierForPrompt(d), '');
});

test('Laden haelt MAX_ITEMS und MAX_LEN ein', () => {
  const s = fakeStore();
  s.setItem(M.dossierKey('userA'), JSON.stringify({
    limits: Array.from({ length: 50 }, (_, i) => ({ t: i + 'X'.repeat(400), ts: NOW }))
  }));
  const d = M.dossierLoad(s, 'userA');
  assert.strictEqual(d.limits.length, M.MAX_ITEMS);
  assert.ok(d.limits.every(e => e.t.length <= M.MAX_LEN));
});

test('Laden filtert Unrat aus coachStats', () => {
  const s = fakeStore();
  s.setItem(M.dossierKey('userA'), JSON.stringify({
    coachStats: { accepted: 'viele', ignored: 2, muted: ['deload', { boese: 1 }, null] }
  }));
  const d = M.dossierLoad(s, 'userA');
  assert.deepStrictEqual(d.coachStats.muted, ['deload']);
  assert.strictEqual(d.coachStats.accepted, 0);
  assert.strictEqual(d.coachStats.ignored, 2);
});
