/* GymTrack — Waechter fuer die App-Bewertungsfrage (js/app-review.js).

   Die Regel, die hier festgenagelt wird:
   - noch nie gefragt  → beim naechsten abgeschlossenen Training fragen,
     unabhaengig davon, wie viele Einheiten schon in S.sessions stehen
     (Bestandsnutzer sollen nicht bei null anfangen muessen),
   - danach alle drei Einheiten erneut, gemessen am Stand BEI DER LETZTEN
     FRAGE — nicht per Modulo auf die Gesamtzahl, sonst wird nach dem Loeschen
     alter Einheiten sofort wieder gefragt,
   - `done` beendet alles endgueltig.

   Geprueft wird der echte Quelltext, in einem Sandkasten ausgefuehrt. */
const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-review.js'), 'utf8');

/* Laedt das Modul mit Attrappen fuer alles, was es aus anderen Modulen zieht.
   Rueckgabe: die Innereien, die der Test braucht, plus der Speicher-Stub. */
function laden(sessions) {
  const speicher = {};
  const localStorage = {
    getItem: k => (k in speicher ? speicher[k] : null),
    setItem: (k, v) => { speicher[k] = String(v); },
    removeItem: k => { delete speicher[k]; }
  };
  const S = { sessions: Array.from({ length: sessions }, (_, i) => ({ id: 'e' + i })) };
  const bau = new Function(
    'S', 'localStorage', '_cap', 'haptic', '_openExternal', 'openFeedback',
    'document', 'requestAnimationFrame', 'setTimeout', 'console',
    SRC + '\nreturn { _revFaellig, _revAsk, _revState, _revSave, _revArm, _revAfterWorkout };'
  );
  const api = bau(
    S, localStorage, () => null, () => {}, () => {}, () => {},
    { createElement: () => ({ addEventListener() {}, classList: { add() {}, remove() {}, contains: () => false } }),
      body: { appendChild() {} } },
    fn => fn(), () => 0, { warn() {}, log() {} }
  );
  return Object.assign(api, { S, speicher });
}

test('Bestandsnutzer wird beim naechsten Training gefragt, nicht erst ab Einheit 1', () => {
  assert.equal(laden(0)._revFaellig(), true,   'frischer Nutzer');
  assert.equal(laden(240)._revFaellig(), true, 'Nutzer mit 240 Einheiten');
});

test('nach der Frage erst wieder nach drei weiteren Einheiten', () => {
  const m = laden(10);
  m._revSave({ asked: 1, atSessions: 10 });
  assert.equal(m._revFaellig(), false, 'direkt danach');
  m.S.sessions.push({ id: 'a' }, { id: 'b' });
  assert.equal(m._revFaellig(), false, 'nach zwei weiteren');
  m.S.sessions.push({ id: 'c' });
  assert.equal(m._revFaellig(), true,  'nach drei weiteren');
});

test('geloeschte Einheiten loesen keine sofortige Zweitfrage aus', () => {
  const m = laden(30);
  m._revSave({ asked: 1, atSessions: 30 });
  m.S.sessions.length = 12;                 // Nutzer raeumt seine Historie auf
  assert.equal(m._revFaellig(), false);
});

test('done sperrt endgueltig — auch nach vielen weiteren Einheiten', () => {
  const m = laden(3);
  m._revSave({ done: true, doneAt: 1 });
  m.S.sessions.push(...Array.from({ length: 50 }, (_, i) => ({ id: 'x' + i })));
  assert.equal(m._revFaellig(), false);
});

test('_revAsk schreibt den Stand fort, damit dieselbe Einheit nicht doppelt fragt', () => {
  const m = laden(7);
  m._revAsk();
  const st = m._revState();
  assert.equal(st.atSessions, 7);
  assert.equal(st.count, 1);
  assert.equal(m._revFaellig(), false);
});

test('ohne _revArm loest _revAfterWorkout nichts aus', () => {
  const m = laden(5);
  m._revAfterWorkout();
  assert.equal(m._revState().asked, undefined, 'kein Zustand ohne vorheriges Training');
  m._revArm();
  m._revAfterWorkout();                      // setTimeout ist im Sandkasten ein No-Op
  assert.equal(m._revState().asked, undefined, 'Frage laeuft erst verzoegert');
});

test('Zustand liegt in localStorage, nicht in S — S-Push-Rules bleiben unberuehrt', () => {
  assert.match(SRC, /const REV_KEY\s*=\s*'gt_review'/);
  assert.equal(/\bS\.\s*(review|rating)/.test(SRC), false, 'kein neues S-Feld');
});

test('Einstellungs-Zeile nutzt nie den System-Dialog (Apple verbietet das)', () => {
  const fn = SRC.slice(SRC.indexOf('function openRateApp'), SRC.indexOf('let _revSheetEl'));
  assert.equal(/requestReview/.test(fn), false);
  assert.match(fn, /_revOpenStore\(\)/);
});
