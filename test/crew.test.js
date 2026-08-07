/* GymTrack — Waechter fuer die Crews (gemeinsames Wochenziel).

   Geprueft wird gegen den echten Quelltext von js/app-crew.js, nicht gegen
   eine Kopie: die Rechen-Helfer werden aus der Datei geschnitten und in einer
   Sandbox ausgefuehrt. Bricht jemand die Wochengrenze, den Zaehl-Riegel oder
   den Rollover, faellt genau dieser Test um.

   Drei Dinge sind hier heikel und deshalb einzeln abgesichert:
   - Die Wochengrenze liegt auf Montag 00:00 LOKALER Zeit und darf sich weder
     zum Jahreswechsel noch an der Sommerzeit-Umstellung verschieben. Genau
     daran scheitert das bestehende getWeekKey(), deshalb hat die Crew einen
     eigenen Schluessel.
   - Ohne den 15-Minuten-/6-Saetze-Riegel liesse sich der Balken mit
     Zwei-Minuten-Einheiten fluten.
   - Der Rollover laeuft potenziell auf 20 Geraeten gleichzeitig und muss
     idempotent sein, sonst steht dieselbe Woche zweimal in der Historie. */
const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const WURZEL = path.join(__dirname, '..');
const CREW   = fs.readFileSync(path.join(WURZEL, 'js', 'app-crew.js'), 'utf8');

/* Funktionskoerper aus der Quelle schneiden — Ende ist die erste Zeile, die nur
   aus der schliessenden Klammer besteht (Projektmuster, s. community-feed.test.js). */
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

const H = new Function(`
  ${['CREW_MIN_SEC', 'CREW_MIN_SETS', 'CREW_HIST'].map(k => konstante(CREW, k)).join('\n')}
  ${['crewWeekKeyOf', 'crewCountWeek', 'crewTotal', 'crewRolloverData', 'crewDaysLeft']
      .map(n => funktion(CREW, n)).join('\n')}
  return { crewWeekKeyOf, crewCountWeek, crewTotal, crewRolloverData, crewDaysLeft };
`)();

/* Bequemer Sitzungs-Bauer: Datum als lokale Zeit, Dauer in Sekunden, Saetze als Anzahl. */
function sitzung(j, m, t, std, dauerSek, saetze) {
  return {
    date: new Date(j, m - 1, t, std, 0, 0).toISOString(),
    duration: dauerSek,
    logs: [{ sets: Array.from({ length: saetze }, () => ({ w: 50, r: 8 })) }]
  };
}
const jetzt = (j, m, t, std) => new Date(j, m - 1, t, std === undefined ? 12 : std, 0, 0).getTime();

/* ── Wochenschluessel ── */

test('Wochenschluessel ist der Montag der Woche', () => {
  assert.strictEqual(H.crewWeekKeyOf(jetzt(2026, 8, 3, 9)),  '2026-08-03');   // Montag selbst
  assert.strictEqual(H.crewWeekKeyOf(jetzt(2026, 8, 6, 23)), '2026-08-03');   // Donnerstag
  assert.strictEqual(H.crewWeekKeyOf(jetzt(2026, 8, 9, 23)), '2026-08-03');   // Sonntag spaet
  assert.strictEqual(H.crewWeekKeyOf(jetzt(2026, 8, 10, 0)), '2026-08-10');   // Montag darauf
});

test('Wochenschluessel springt ueber den Jahreswechsel sauber weiter', () => {
  // 31.12.2025 ist ein Mittwoch, 01.01.2026 ein Donnerstag — dieselbe Woche.
  assert.strictEqual(H.crewWeekKeyOf(jetzt(2025, 12, 31, 20)), '2025-12-29');
  assert.strictEqual(H.crewWeekKeyOf(jetzt(2026, 1, 1, 10)),   '2025-12-29');
  assert.strictEqual(H.crewWeekKeyOf(jetzt(2026, 1, 5, 10)),   '2026-01-05');
});

test('Sommerzeit-Umstellung verschiebt die Wochengrenze nicht', () => {
  // Letzter Sonntag im Maerz 2026 = 29.03. (Umstellung). Woche bleibt der 23.03.
  assert.strictEqual(H.crewWeekKeyOf(jetzt(2026, 3, 28, 12)), '2026-03-23');
  assert.strictEqual(H.crewWeekKeyOf(jetzt(2026, 3, 29, 12)), '2026-03-23');
  assert.strictEqual(H.crewWeekKeyOf(jetzt(2026, 3, 30, 0)),  '2026-03-30');
});

/* ── Zaehlweise ── */

test('kurze Einheit ohne Saetze zaehlt nicht', () => {
  const n = H.crewCountWeek([sitzung(2026, 8, 4, 18, 120, 2)], jetzt(2026, 8, 6));
  assert.strictEqual(n, 0, 'Zwei-Minuten-Einheit darf den Balken nicht fuellen');
});

test('15 Minuten reichen auch ohne 6 Saetze', () => {
  assert.strictEqual(H.crewCountWeek([sitzung(2026, 8, 4, 18, 900, 1)], jetzt(2026, 8, 6)), 1);
});

test('6 Saetze reichen auch ohne 15 Minuten', () => {
  assert.strictEqual(H.crewCountWeek([sitzung(2026, 8, 4, 18, 300, 6)], jetzt(2026, 8, 6)), 1);
});

test('mehrere Einheiten am selben Kalendertag zaehlen nur einmal', () => {
  const s = [sitzung(2026, 8, 4, 8, 1800, 8), sitzung(2026, 8, 4, 19, 1800, 8)];
  assert.strictEqual(H.crewCountWeek(s, jetzt(2026, 8, 6)), 1);
});

test('nur Einheiten der laufenden Woche zaehlen', () => {
  const s = [
    sitzung(2026, 8, 2, 18, 1800, 8),   // Sonntag der Vorwoche
    sitzung(2026, 8, 3, 18, 1800, 8),   // Montag, zaehlt
    sitzung(2026, 8, 5, 18, 1800, 8)    // Mittwoch, zaehlt
  ];
  assert.strictEqual(H.crewCountWeek(s, jetzt(2026, 8, 6)), 2);
});

test('Zaehler ist bei 7 gedeckelt und ignoriert Einheiten aus der Zukunft', () => {
  const s = [1, 2, 3, 4, 5, 6, 7].map(t => sitzung(2026, 8, 2 + t, 18, 1800, 8));
  assert.strictEqual(H.crewCountWeek(s, jetzt(2026, 8, 9, 23)), 7);
  // Am Mittwoch zaehlen die spaeteren Tage der Woche noch nicht mit.
  assert.strictEqual(H.crewCountWeek(s, jetzt(2026, 8, 5, 23)), 3);
});

/* ── Rollover ── */

const basis = (ueber) => ({
  goal: 10, weekKey: '2026-08-03', wk: { a: 4, b: 3 }, streak: 2, hist: [], ...ueber
});

test('Summe des Balkens ist die Summe aller Beitraege', () => {
  assert.strictEqual(H.crewTotal(basis()), 7);
  assert.strictEqual(H.crewTotal({}), 0);
});

test('Rollover: Ziel erreicht → Streak plus eins, Woche geleert', () => {
  const n = H.crewRolloverData(basis({ wk: { a: 6, b: 5 } }), '2026-08-10');
  assert.strictEqual(n.streak, 3);
  assert.deepStrictEqual(n.wk, {});
  assert.strictEqual(n.weekKey, '2026-08-10');
  assert.strictEqual(n.hist.length, 1);
  assert.deepStrictEqual(n.hist[0], { key: '2026-08-03', total: 11, goal: 10, done: true });
});

test('Rollover: Ziel verfehlt → Streak faellt auf 0', () => {
  const n = H.crewRolloverData(basis(), '2026-08-10');
  assert.strictEqual(n.streak, 0);
  assert.strictEqual(n.hist[0].done, false);
});

test('Rollover haengt dieselbe Woche kein zweites Mal an', () => {
  // Der Fall: die abgelaufene Woche steht schon in der Historie, der weekKey im
  // Doc aber noch auf alt (halb durchgelaufener Schreibvorgang, zweiter Client
  // kommt hinterher). Ohne den Schluessel-Vergleich stuende sie dann zweimal drin.
  const schon = basis({ hist: [{ key: '2026-08-03', total: 7, goal: 10, done: false }] });
  const n = H.crewRolloverData(schon, '2026-08-10');
  assert.strictEqual(n.hist.length, 1, 'doppelter Historien-Eintrag fuer dieselbe Woche');
  assert.strictEqual(n.hist[0].key, '2026-08-03');
});

test('zwei Clients rollen dieselbe Woche zum selben Ergebnis', () => {
  const a = H.crewRolloverData(basis({ wk: { a: 6, b: 5 } }), '2026-08-10');
  const b = H.crewRolloverData(basis({ wk: { a: 6, b: 5 } }), '2026-08-10');
  assert.deepStrictEqual({ ...a, updatedAt: 0 }, { ...b, updatedAt: 0 });
});

test('Historie behaelt hoechstens acht Wochen', () => {
  const hist = Array.from({ length: 8 }, (_, i) => ({ key: 'alt' + i, total: 9, goal: 10, done: false }));
  const n = H.crewRolloverData(basis({ hist }), '2026-08-10');
  assert.strictEqual(n.hist.length, 8);
  assert.strictEqual(n.hist[7].key, '2026-08-03', 'die neue Woche muss am Ende stehen');
  assert.strictEqual(n.hist[0].key, 'alt1', 'die aelteste Woche faellt raus');
});

test('Rollover ohne gesetztes Ziel gilt nie als geschafft', () => {
  const n = H.crewRolloverData(basis({ goal: 0, wk: {} }), '2026-08-10');
  assert.strictEqual(n.hist[0].done, false);
  assert.strictEqual(n.streak, 0);
});

/* ── Restliche Tage ── */

test('verbleibende Tage bis Sonntag', () => {
  assert.strictEqual(H.crewDaysLeft(jetzt(2026, 8, 3)), 6);   // Montag
  assert.strictEqual(H.crewDaysLeft(jetzt(2026, 8, 8)), 1);   // Samstag
  assert.strictEqual(H.crewDaysLeft(jetzt(2026, 8, 9)), 0);   // Sonntag
});

/* ── Grenzen, die nicht in einer reinen Funktion stehen ── */

test('Beitritt ist bei 20 Mitgliedern dicht — im Client UND in den Rules', () => {
  assert.match(CREW, /const CREW_MAX\s*=\s*20;/);
  assert.match(CREW, /members\.length >= CREW_MAX/, 'Client-Riegel beim Beitreten fehlt');
  const rules = fs.readFileSync(path.join(WURZEL, 'firestore.rules'), 'utf8');
  assert.match(rules, /match \/crews\/\{cid\}/, 'crews-Block fehlt in den Rules');
  assert.match(rules, /members\.size\(\) <= 20/, 'Mitglieder-Deckel fehlt in den Rules');
  assert.match(rules, /wk\[request\.auth\.uid\] <= 7/, 'Deckel fuer den eigenen Zaehler fehlt');
  assert.match(rules, /'crewId'/, 'crewId fehlt in der hasOnly-Liste des users-Blocks');
});

test('Crew-Modul ist an allen drei Pflichtstellen registriert', () => {
  const lies = p => fs.readFileSync(path.join(WURZEL, p), 'utf8');
  assert.match(lies('index.html'), /<script src="\.\/js\/app-crew\.js"><\/script>/, 'Script-Tag fehlt');
  assert.match(lies('build.js'),   /'js\/app-crew\.js'/, 'Kopierliste fehlt');
  assert.match(lies('sw.js'),      /'\.\/js\/app-crew\.js'/, 'SHELL-Eintrag fehlt');
  // Der Rollover braucht runTransaction — window.FB exportierte das lange nicht.
  assert.match(lies('index.html'), /window\.FB\.runTransaction/, 'runTransaction nicht exportiert');
  // crewId muss den Rueckfall in _setDocCompat kennen, sonst kippt der KOMPLETTE users-Push.
  assert.match(lies('js/app-update.js'), /CLOUD_NEUE_FELDER = \[[^\]]*'crewId'/, 'crewId fehlt in CLOUD_NEUE_FELDER');
});

test('Crew-Oberflaeche kommt ohne Emojis aus (UI-Regel)', () => {
  const treffer = CREW.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || [];
  assert.deepStrictEqual(treffer, [], 'Emoji in der Crew-Oberflaeche: ' + treffer.join(' '));
});
