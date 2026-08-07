/* GymTrack — Waechter fuer den Community-Feed (Card-Pager).

   Anlass (07.08.2026), drei gemeldete Fehler:

   1. Beim Oeffnen des Community-Tabs blitzte jedes Mal der Lade-Spinner auf, der
      Feed baute sich sichtbar neu auf. _renderFeed setzte den Spinner immer,
      auch wenn der Stand schon im Zwischenspeicher lag.
   2. Nach einem beendeten Training war „Freunde" vorausgewaehlt, „Community" nicht.
   3. Beim Posten waren ploetzlich ALLE Community-Posts weg und kamen erst eine
      Minute spaeter zurueck: _cpgInjectOwnPost legte, wenn noch kein Feed geladen
      war, einen Zwischenspeicher-Eintrag mit NUR dem eigenen Post und frischem
      Zeitstempel an — der galt 60 s als vollstaendiger Feed.

   Geprueft wird gegen den echten Quelltext, nicht gegen eine Kopie. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL  = path.join(__dirname, '..');
const COMM    = fs.readFileSync(path.join(WURZEL, 'js', 'app-community.js'), 'utf8');
const STREAK  = fs.readFileSync(path.join(WURZEL, 'js', 'app-streak.js'),    'utf8');
const WORKOUT = fs.readFileSync(path.join(WURZEL, 'js', 'app-workout.js'),   'utf8');
const UPDATE  = fs.readFileSync(path.join(WURZEL, 'js', 'app-update.js'),    'utf8');

/* Funktionskoerper aus der Quelle schneiden — Ende ist die erste Zeile, die nur
   aus der schliessenden Klammer besteht (Projektmuster, s. plan-templates.test.js). */
function funktion(quelle, name) {
  const rx = new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}');
  const m = quelle.match(rx);
  if (!m) throw new Error(name + ' nicht gefunden — umgebaut?');
  return m[0];
}

/* _cpgApplyPending haengt an zwei Globals (_cpgPending, _fbUser). Beide werden in
   einer Sandbox bereitgestellt, die Funktion selbst kommt unveraendert aus der App. */
function sandbox(pending, uid) {
  const src = COMM.match(/const _CPG_PEND_MS = \d+;/)[0] + '\n' + funktion(COMM, '_cpgApplyPending');
  const bauen = new Function('startPending', 'startUid', `
    let _cpgPending = startPending;
    let _fbUser = startUid ? { uid: startUid } : null;
    ${src}
    return { anwenden: _cpgApplyPending, warteliste: () => _cpgPending };
  `);
  return bauen(pending, uid);
}

const MIR = 'meine-uid';
const jetzt = 1770000000000;   // fester Zeitpunkt statt Date.now() im Erwartungswert
const serverPosts = [
  { id: 'srv1', uid: 'fremd1', kind: 'post', ts: jetzt - 60000,  visibility: 'public' },
  { id: 'srv2', uid: 'fremd2', kind: 'post', ts: jetzt - 120000, visibility: 'public' },
  { id: 'srv3', uid: 'fremd3', kind: 'post', ts: jetzt - 180000, visibility: 'public' },
];

test('eigener frischer Post verdraengt die Community-Posts NICHT', () => {
  const eigen = { id: 'local-1', uid: MIR, kind: 'post', ts: Date.now(), visibility: 'public' };
  const sb = sandbox({ friends: [], public: [eigen] }, MIR);
  const out = sb.anwenden('public', serverPosts);
  assert.strictEqual(out.length, 4, 'fremde Posts fehlen — genau der gemeldete Fehler');
  assert.strictEqual(out[0].id, 'local-1', 'eigener Post gehoert nach oben');
  assert.deepStrictEqual(out.slice(1).map(x => x.id), ['srv1', 'srv2', 'srv3']);
});

test('Server liefert den eigenen Post nach → keine Dublette, Warteliste leer', () => {
  const ts = Date.now();
  const eigen = { id: 'local-1', uid: MIR, kind: 'post', ts, visibility: 'public' };
  const vomServer = [{ id: 'echt1', uid: MIR, kind: 'post', ts, visibility: 'public' }, ...serverPosts];
  const sb = sandbox({ friends: [], public: [eigen] }, MIR);
  const out = sb.anwenden('public', vomServer);
  assert.strictEqual(out.length, 4);
  assert.strictEqual(out.filter(x => x.uid === MIR).length, 1, 'Post doppelt im Feed');
  assert.strictEqual(sb.warteliste().public.length, 0, 'bestaetigter Post bleibt in der Warteliste haengen');
});

test('Wartelisten-Eintrag laeuft nach 10 Minuten ab', () => {
  const alt = { id: 'local-alt', uid: MIR, kind: 'post', ts: Date.now() - 11 * 60000, visibility: 'public' };
  const sb = sandbox({ friends: [], public: [alt] }, MIR);
  const out = sb.anwenden('public', serverPosts);
  assert.deepStrictEqual(out.map(x => x.id), ['srv1', 'srv2', 'srv3']);
  assert.strictEqual(sb.warteliste().public.length, 0);
});

test('ohne Warteliste bleibt die geladene Liste unveraendert (gleiche Referenz)', () => {
  const sb = sandbox({ friends: [], public: [] }, MIR);
  assert.strictEqual(sb.anwenden('public', serverPosts), serverPosts);
});

test('_cpgInjectOwnPost fasst den Feed-Zwischenspeicher nicht mehr an', () => {
  const src = funktion(COMM, '_cpgInjectOwnPost');
  assert.ok(!/_cpgCache/.test(src),
    'eigener Post landet wieder im _cpgCache — dann gilt er 60 s als vollstaendiger Feed');
  assert.ok(/_cpgPending/.test(src), 'Warteliste wird nicht mehr befuellt');
});

test('_cpgReload wirft den Zwischenspeicher nicht weg (kein Spinner-Blitz)', () => {
  const src = funktion(COMM, '_cpgReload');
  assert.ok(!/_cpgCache\s*=\s*\{\s*\}/.test(src), '_cpgCache wird geleert → alter Stand verschwindet');
  assert.ok(/c\.ts = 0/.test(src), 'Zwischenspeicher wird nicht entwertet → nie aktualisiert');
});

test('_renderFeed zeigt zuerst den letzten Stand und laedt still nach', () => {
  const src = funktion(STREAK, '_renderFeed');
  assert.ok(/const cached = _cpgCached\(\)/.test(src), '_renderFeed liest den Zwischenspeicher nicht');
  assert.ok(/cached\.length \? '' :/.test(src), 'Spinner wird unbedingt gerendert → sichtbarer Aufbau');
  assert.ok(/_cpgRevalidate\(\)/.test(src), 'kein Hintergrund-Nachladen → Feed koennte veralten');
});

test('_cpgLoad behaelt bei fehlender Auth den letzten Stand', () => {
  const src = funktion(COMM, '_cpgLoad');
  assert.ok(!/if \(!_socReady\(\)\) return \[\];/.test(src),
    'leerer Feed bei noch nicht wiederhergestellter Anmeldung');
});

test('Feed wird beim Start und beim Zurueckkommen vorgewaermt', () => {
  assert.strictEqual((UPDATE.match(/_cpgPrefetch\(\)/g) || []).length, 2,
    'Vorabladen fehlt an einer der beiden Stellen (Login-Sync / App wieder sichtbar)');
});

test('Share-Flow: Community UND Freunde sind vorausgewaehlt', () => {
  const src = funktion(WORKOUT, '_shfShareStep');
  assert.ok(/id="shf-tg-friends" checked/.test(src), 'Freunde nicht vorausgewaehlt');
  assert.ok(/id="shf-tg-public" checked/.test(src), 'Community nicht vorausgewaehlt');
});
