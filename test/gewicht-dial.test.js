/* GymTrack — Waechter fuer das Gewichts-Dial auf der Startseite.

   Geprueft wird gegen den echten Quelltext von js/app-session.js: die Helfer
   werden aus der Datei geschnitten und in einer Sandbox ausgefuehrt.

   Drei Dinge sind hier heikel und deshalb einzeln abgesichert:
   - upsertWeightEntry ist seit dem Dial die EINZIGE Schreibstelle fuer den
     Gewichts-Log. Haengt sie einen zweiten Eintrag an denselben Tag an, waechst
     der Log bei jeder Drehung und die Kurve bekommt Treppen.
   - Der Anfangswert des Dials (letzter Eintrag → Startgewicht → 75) darf NIE
     geschrieben werden. Ohne diesen Riegel legt jeder App-Start bei Nutzern
     ohne Gewichts-Tracking einen 75-kg-Eintrag an.
   - Die Rastung liegt bei 0,1. Rutscht sie auf ganze Zahlen, ist der Verlauf
     unbrauchbar; rutscht sie feiner, klackt die Haptik bei jedem Pixel.

   Spec: docs/superpowers/specs/2026-08-07-gewichts-dial-design.md */
const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

const WURZEL  = path.join(__dirname, '..');
const SESSION = fs.readFileSync(path.join(WURZEL, 'js', 'app-session.js'), 'utf8');

/* Funktionskoerper aus der Quelle schneiden — Ende ist die erste Zeile, die nur
   aus der schliessenden Klammer besteht (Projektmuster, s. crew.test.js). */
function funktion(quelle, name) {
  const rx = new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}');
  const m = quelle.match(rx);
  if (!m) throw new Error(name + ' nicht gefunden — umgebaut?');
  return m[0];
}
function konstante(quelle, name) {
  const m = quelle.match(new RegExp('const ' + name + '\\s*=\\s*[^;]+;'));
  if (!m) throw new Error(name + ' nicht gefunden — umgebaut?');
  return m[0];
}

/* Einzeiler-Funktionen (function f(x) { ... } auf einer Zeile) trifft die
   Klammer-Regel oben nicht — die schneidet bis zur ersten Zeile, die NUR aus
   '}' besteht, und wuerde dabei alles dazwischen mitnehmen. */
function einzeiler(quelle, name) {
  const m = quelle.match(new RegExp('function ' + name + '\\([^)]*\\)\\s*\\{[^\\n]*\\}'));
  if (!m) throw new Error(name + ' nicht gefunden — umgebaut?');
  return m[0];
}

/* Sandbox mit genau den Globals, die die geschnittenen Helfer anfassen. */
function sandbox() {
  const ctx = {
    S: {},
    persistAufrufe: 0,
    persist() { ctx.persistAufrufe++; },
    _cap() { return null; },
    _wd: null,
    GT_DEC: ','
  };
  vm.createContext(ctx);
  vm.runInContext([
    konstante(SESSION, 'WD_STEP'),
    konstante(SESSION, 'WD_PPU'),
    konstante(SESSION, 'WD_COMMIT_MS'),
    funktion(SESSION, '_wdLerp'),
    einzeiler(SESSION, '_wdSnap'),
    einzeiler(SESSION, '_wdClamp'),
    funktion(SESSION, '_wdRange'),
    funktion(SESSION, '_wdStartValue'),
    funktion(SESSION, 'upsertWeightEntry')
  ].join('\n'), ctx);
  return ctx;
}

/* const/let werden in einer vm-Sandbox NICHT zu Eigenschaften des
   Kontext-Objekts (nur var und Funktionsdeklarationen). Konstanten muessen
   deshalb ausgewertet statt gelesen werden. */
function wert(ctx, ausdruck) { return vm.runInContext(ausdruck, ctx); }

test('Rastung liegt bei 0,1 — nicht bei ganzen Zahlen', () => {
  const ctx = sandbox();
  assert.strictEqual(wert(ctx, 'WD_STEP'), 0.1);
  assert.strictEqual(+ctx._wdSnap(80.44).toFixed(1), 80.4);
  assert.strictEqual(+ctx._wdSnap(80.46).toFixed(1), 80.5);
  assert.strictEqual(+ctx._wdSnap(79.97).toFixed(1), 80.0);
});

test('Ein Rastpunkt entspricht 8 px Zugweg', () => {
  const ctx = sandbox();
  assert.strictEqual(wert(ctx, 'WD_PPU * WD_STEP'), 8);
});

test('Bogen-Interpolation: Stuetzstellen, Zwischenwert, Deckelung', () => {
  const ctx = sandbox();
  assert.strictEqual(ctx._wdLerp(0,   [0, 2, 3], [1, .4, 0]), 1);
  assert.strictEqual(ctx._wdLerp(2,   [0, 2, 3], [1, .4, 0]), .4);
  assert.strictEqual(ctx._wdLerp(1,   [0, 2, 3], [1, .4, 0]), .7);
  assert.strictEqual(ctx._wdLerp(9,   [0, 2, 3], [1, .4, 0]), 0);   // ueber dem Ende
  assert.strictEqual(ctx._wdLerp(-1,  [0, 2, 3], [1, .4, 0]), 1);   // unter dem Anfang
});

test('Derselbe Tag wird ueberschrieben, nicht angehaengt', () => {
  const ctx = sandbox();
  ctx.S.weightLog = [{ date: '2026-08-06', weight: 80.0 }];
  assert.strictEqual(ctx.upsertWeightEntry('2026-08-07', 80.4), true);
  assert.strictEqual(ctx.upsertWeightEntry('2026-08-07', 80.7), true);
  assert.strictEqual(ctx.upsertWeightEntry('2026-08-07', 81.2), true);
  assert.strictEqual(ctx.S.weightLog.length, 2, 'pro Tag genau ein Eintrag');
  assert.strictEqual(ctx.S.weightLog[1].weight, 81.2);
  assert.strictEqual(ctx.persistAufrufe, 3);
});

test('Unplausible Werte kommen nicht in den Log', () => {
  const ctx = sandbox();
  for (const w of [0, 19.9, 500.1, NaN, undefined, null, -80]) {
    assert.strictEqual(ctx.upsertWeightEntry('2026-08-07', w), false, 'abgelehnt: ' + w);
  }
  assert.strictEqual(ctx.S.weightLog, undefined, 'kein Log angelegt');
  assert.strictEqual(ctx.persistAufrufe, 0, 'kein persist bei Ablehnung');
});

test('Wert wird auf die Rastung gerundet gespeichert', () => {
  const ctx = sandbox();
  ctx.upsertWeightEntry('2026-08-07', 80.4499999);
  assert.strictEqual(ctx.S.weightLog[0].weight, 80.4);
});

test('Anfangswert: letzter Eintrag → Startgewicht → Vorgabe, ohne zu schreiben', () => {
  const ctx = sandbox();
  assert.strictEqual(ctx._wdStartValue(), 75);
  ctx.S.weightStart = 92;
  assert.strictEqual(ctx._wdStartValue(), 92);
  // Nicht chronologisch abgelegt: es zaehlt das juengste Datum, nicht die Position
  ctx.S.weightLog = [{ date: '2026-08-07', weight: 84.2 }, { date: '2026-08-01', weight: 88 }];
  assert.strictEqual(ctx._wdStartValue(), 84.2);
  assert.strictEqual(ctx.S.weightLog.length, 2, 'Anfangswert legt keinen Eintrag an');
  assert.strictEqual(ctx.persistAufrufe, 0, 'Anfangswert schreibt nicht');
});

test('Skala haengt an der Einheit und deckelt den Wert', () => {
  const ctx = sandbox();
  // deepStrictEqual scheitert ueber die vm-Grenze (fremdes Object.prototype)
  assert.deepEqual(ctx._wdRange(), { min: 30, max: 250 });
  ctx.S.unitMode = 'lbs';
  assert.deepEqual(ctx._wdRange(), { min: 66, max: 550 });
  assert.strictEqual(ctx._wdStartValue(), 165, 'Vorgabe in lbs');

  ctx._wd = { min: 30, max: 250 };
  assert.strictEqual(ctx._wdClamp(9999), 250);
  assert.strictEqual(ctx._wdClamp(-5), 30);
  assert.strictEqual(ctx._wdClamp(80.4), 80.4);
});

test('Schreibsperre bleibt kurz genug, um sich wie sofort anzufuehlen', () => {
  const ctx = sandbox();
  const ms = wert(ctx, 'WD_COMMIT_MS');
  assert.ok(ms > 0 && ms <= 1000, 'Debounce in vernuenftigem Rahmen, ist: ' + ms);
});
