/* GymTrack — Tests fuer die Diagramm-Konfigurationen der Wochenkachel.

   Das Modul zeichnet nichts. Es bekommt Zahlen und gibt eine fertige
   Chart.js-Konfiguration zurueck. Genau deshalb ist es ohne Browser
   pruefbar — und genau deshalb muessen die Tests die Konfiguration
   ANSCHAUEN statt sie nur auf Vorhandensein abzuklopfen.

   Drei Zusicherungen tragen diese Datei:

   1. Zu duenne Datenlage ergibt null, nicht einen leeren Rahmen. null ist
      ein gueltiges Ergebnis und heisst fuer die Aufrufstelle: der Bereich
      entfaellt ganz. Jeder null-Fall steht darum als strictEqual(x, null)
      da — ein assert.ok(!x) wuerde eine leere Konfiguration durchlassen,
      und genau die zu bauen ist der naheliegende Fehler.

   2. Kein Diagramm luegt ueber den Verlauf. Die Reihenfolge der Wochen
      bleibt wie hereingegeben, Muskelgruppen stehen absteigend, eine
      Trainingspause bleibt als Luecke sichtbar statt sich zu einer
      gleichmaessigen Steigung zusammenzuziehen, und Balkenachsen beginnen
      bei null.

   3. Das Modul rechnet keine Einheiten um und liest keine Farben. Beides
      kommt herein, beides geht unveraendert wieder heraus. Ein Modul, das
      heimlich kg in lbs rechnet, faellt hier durch.

   Die Zahlen in den Erwartungen sind absichtlich unregelmaessig: eine
   monoton steigende Testreihe wuerde eine verlorene Sortierung nicht
   bemerken. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const C = require('../js/coach-charts.js');

const SRC = path.join(__dirname, '..', 'js', 'coach-charts.js');

const ACC = '#007AFF';
const MUT = 'rgba(120,120,128,.35)';

const DE  = { accent: ACC, muted: MUT, lang: 'de', unit: 'kg' };
const EN  = { accent: ACC, muted: MUT, lang: 'en', unit: 'kg' };
const LBS = { accent: ACC, muted: MUT, lang: 'de', unit: 'lbs' };

function wkey(nr) { return '2026-W' + (nr < 10 ? '0' + nr : String(nr)); }

// Wochen aufsteigend ab Kalenderwoche 20, juengste zuletzt.
function weeksOf(vols, startNr) {
  const s = startNr === undefined ? 20 : startNr;
  return vols.map((v, i) => ({ weekKey: wkey(s + i), vol: v }));
}

// Acht Wochen mit bewusst unruhigem Verlauf — eine sortierte Reihe wuerde
// eine eingeschleppte Sortierung nicht auffallen lassen.
const V8 = [12000, 9000, 14500, 11000, 15200, 8000, 16000, 13400];
const W8 = weeksOf(V8);

function ptsOf(kgs, startIdx) {
  const s = startIdx === undefined ? 2900 : startIdx;
  return kgs.map((k, i) => ({ weekIndex: s + i, kg: k }));
}

const P6 = ptsOf([100, 104, 103, 108, 112, 115]);

// ── Untergrenzen ──────────────────────────────────────────────────────────

test('MIN_BARS und MIN_POINTS sind exportierte Zahlen und echte Untergrenzen', () => {
  assert.strictEqual(typeof C.MIN_BARS, 'number');
  assert.strictEqual(typeof C.MIN_POINTS, 'number');
  assert.ok(C.MIN_BARS >= 2, 'ein einzelner Balken ist kein Verlauf');
  assert.ok(C.MIN_POINTS >= 4, 'unter vier Wochen ist kein Trend');
});

test('Das Modul haengt an module.exports UND am globalen Objekt', () => {
  assert.strictEqual(globalThis.CoachCharts, C);
});

// ── volumeBars: Verzicht statt leerem Rahmen ──────────────────────────────

test('volumeBars ohne Wochen gibt null, keine leere Konfiguration', () => {
  assert.strictEqual(C.volumeBars([], DE), null);
});

test('volumeBars mit einer Woche gibt null — ein Balken ist kein Verlauf', () => {
  assert.strictEqual(C.volumeBars(weeksOf([12000]), DE), null);
});

test('volumeBars ohne Argument gibt null statt zu werfen', () => {
  assert.strictEqual(C.volumeBars(undefined, DE), null);
  assert.strictEqual(C.volumeBars(null, DE), null);
  assert.strictEqual(C.volumeBars('acht Wochen', DE), null);
});

test('volumeBars genau an der Untergrenze liefert ein Diagramm', () => {
  const cfg = C.volumeBars(weeksOf([12000, 9000]).slice(0, C.MIN_BARS), DE);
  assert.ok(cfg, 'MIN_BARS Wochen muessen reichen, sonst ist die Grenze verschoben');
  assert.strictEqual(cfg.data.datasets[0].data.length, C.MIN_BARS);
});

test('volumeBars wirft Wochen ohne brauchbares Volumen weg', () => {
  const cfg = C.volumeBars([
    { weekKey: wkey(20), vol: 12000 },
    { weekKey: wkey(21), vol: null },
    { weekKey: wkey(22), vol: 'viel' },
    { weekKey: wkey(23), vol: 9000 },
    { vol: 7000 },
    { weekKey: wkey(25), vol: 14500 }
  ], DE);
  assert.deepStrictEqual(cfg.data.datasets[0].data, [12000, 9000, 14500]);
  assert.deepStrictEqual(cfg.data.labels, ['KW 20', 'KW 23', 'KW 25']);
});

test('volumeBars behaelt eine Woche mit Volumen 0 — eine Pause ist eine Aussage', () => {
  const cfg = C.volumeBars(weeksOf([12000, 0, 9000]), DE);
  assert.deepStrictEqual(cfg.data.datasets[0].data, [12000, 0, 9000]);
});

// ── volumeBars: Verlauf, Reihenfolge, Hervorhebung ────────────────────────

test('volumeBars mit acht Wochen ergibt acht Datenpunkte in der Reihenfolge der Eingabe', () => {
  const cfg = C.volumeBars(W8, DE);
  assert.strictEqual(cfg.type, 'bar');
  assert.strictEqual(cfg.data.datasets.length, 1);
  assert.deepStrictEqual(cfg.data.datasets[0].data, V8);
  assert.deepStrictEqual(cfg.data.labels,
    ['KW 20', 'KW 21', 'KW 22', 'KW 23', 'KW 24', 'KW 25', 'KW 26', 'KW 27']);
});

test('volumeBars faerbt nur die letzte Woche mit dem Akzent, alle anderen gedaempft', () => {
  const cfg = C.volumeBars(W8, DE);
  const bg = cfg.data.datasets[0].backgroundColor;
  assert.ok(Array.isArray(bg), 'eine einzelne Farbe kann die laufende Woche nicht absetzen');
  assert.strictEqual(bg.length, 8);
  assert.strictEqual(bg[7], ACC);
  for (let i = 0; i < 7; i++) assert.strictEqual(bg[i], MUT, 'Balken ' + i + ' ist nicht gedaempft');
});

test('volumeBars zeigt hoechstens acht Wochen und behaelt die juengsten', () => {
  const cfg = C.volumeBars(weeksOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 10), DE);
  assert.strictEqual(cfg.data.datasets[0].data.length, 8);
  assert.deepStrictEqual(cfg.data.datasets[0].data, [5, 6, 7, 8, 9, 10, 11, 12]);
  assert.strictEqual(cfg.data.labels[7], 'KW 21');
});

test('volumeBars laesst die Balkenachse bei null beginnen — sonst uebertreibt sie', () => {
  const cfg = C.volumeBars(W8, DE);
  assert.strictEqual(cfg.options.scales.y.beginAtZero, true);
});

// ── volumeBars: Einheit ───────────────────────────────────────────────────

test('volumeBars beschriftet nach opts.unit und rechnet die Werte NICHT um', () => {
  const cfg = C.volumeBars(W8, LBS);
  assert.deepStrictEqual(cfg.data.datasets[0].data, V8, 'das Modul hat heimlich umgerechnet');
  const tick = cfg.options.scales.y.ticks.callback;
  assert.strictEqual(tick(12000), '12.000 lbs');
  assert.ok(!/kg/.test(tick(12000)), 'lbs-Nutzer darf nirgends kg sehen');
  const tip = cfg.options.plugins.tooltip.callbacks.label;
  assert.strictEqual(tip({ parsed: { y: 12000 } }), ' 12.000 lbs');
});

test('volumeBars ohne Einheit haengt keine erfundene an', () => {
  const cfg = C.volumeBars(W8, { accent: ACC, muted: MUT, lang: 'de' });
  assert.strictEqual(cfg.options.scales.y.ticks.callback(12000), '12.000');
});

test('volumeBars ohne opts baut trotzdem eine Konfiguration statt zu werfen', () => {
  const cfg = C.volumeBars(W8);
  assert.ok(cfg);
  assert.strictEqual(cfg.data.datasets[0].data.length, 8);
});

// ── volumeBars: Bewegung ──────────────────────────────────────────────────

test('volumeBars versetzt die Balken um 30 ms je Balken', () => {
  const cfg = C.volumeBars(W8, DE);
  assert.strictEqual(cfg.options.animation.duration, 320);
  assert.strictEqual(cfg.options.animation.delay({ type: 'data', mode: 'default', dataIndex: 3 }), 90);
  assert.strictEqual(cfg.options.animation.delay({ type: 'data', mode: 'resize', dataIndex: 3 }), 0);
});

test('reduceMotion schaltet Dauer und Versatz auf null', () => {
  const cfg = C.volumeBars(W8, { accent: ACC, muted: MUT, lang: 'de', unit: 'kg', reduceMotion: true });
  assert.strictEqual(cfg.options.animation.duration, 0);
  assert.strictEqual(cfg.options.animation.delay({ type: 'data', mode: 'default', dataIndex: 3 }), 0);
});

// ── muscleBars ────────────────────────────────────────────────────────────

const M3 = [
  { id: 'brust',   label: 'Brust',   vol: 4200 },
  { id: 'beine',   label: 'Beine',   vol: 9100 },
  { id: 'ruecken', label: 'Ruecken', vol: 6300 }
];

test('muscleBars mit drei Gruppen ergibt drei liegende Balken, absteigend nach Volumen', () => {
  const cfg = C.muscleBars(M3, DE);
  assert.strictEqual(cfg.type, 'bar');
  assert.strictEqual(cfg.options.indexAxis, 'y', 'liegende Balken brauchen indexAxis y');
  assert.deepStrictEqual(cfg.data.labels, ['Beine', 'Ruecken', 'Brust']);
  assert.deepStrictEqual(cfg.data.datasets[0].data, [9100, 6300, 4200]);
});

test('muscleBars laesst eine Gruppe ohne Label weg und erfindet keine Beschriftung', () => {
  const cfg = C.muscleBars([
    { id: 'brust', label: 'Brust', vol: 4200 },
    { id: 'ohne', vol: 9100 },
    { id: 'beine', label: 'Beine', vol: 6300 }
  ], DE);
  assert.deepStrictEqual(cfg.data.labels, ['Beine', 'Brust']);
  assert.deepStrictEqual(cfg.data.datasets[0].data, [6300, 4200]);
  assert.ok(!cfg.data.datasets[0].data.includes(9100), 'die Gruppe ohne Label ist mitgelaufen');
  assert.ok(!cfg.data.labels.includes('ohne'), 'die Kennung wurde als Beschriftung missbraucht');
});

test('muscleBars laesst eine Gruppe mit leerem Label ebenfalls weg', () => {
  const cfg = C.muscleBars([
    { id: 'brust', label: 'Brust', vol: 4200 },
    { id: 'leer', label: '   ', vol: 9100 },
    { id: 'beine', label: 'Beine', vol: 6300 }
  ], DE);
  assert.deepStrictEqual(cfg.data.labels, ['Beine', 'Brust']);
});

test('muscleBars laesst Gruppen ohne Volumen weg — null ist keine Verteilung', () => {
  const cfg = C.muscleBars([
    { id: 'brust', label: 'Brust', vol: 4200 },
    { id: 'waden', label: 'Waden', vol: 0 },
    { id: 'beine', label: 'Beine', vol: 6300 }
  ], DE);
  assert.deepStrictEqual(cfg.data.labels, ['Beine', 'Brust']);
});

test('muscleBars unter der Untergrenze gibt null', () => {
  assert.strictEqual(C.muscleBars([], DE), null);
  assert.strictEqual(C.muscleBars([{ id: 'brust', label: 'Brust', vol: 4200 }], DE), null);
  assert.strictEqual(C.muscleBars(null, DE), null);
});

test('muscleBars faerbt alle Balken mit dem Akzent — hier hebt sich nichts ab', () => {
  const cfg = C.muscleBars(M3, DE);
  assert.strictEqual(cfg.data.datasets[0].backgroundColor, ACC);
});

test('muscleBars beschriftet die Wertachse mit der Einheit und beginnt bei null', () => {
  const cfg = C.muscleBars(M3, LBS);
  assert.strictEqual(cfg.options.scales.x.beginAtZero, true);
  assert.strictEqual(cfg.options.scales.x.ticks.callback(9100), '9.100 lbs');
  const tip = cfg.options.plugins.tooltip.callbacks.label;
  assert.strictEqual(tip({ parsed: { x: 9100, y: 0 } }), ' 9.100 lbs',
    'liegende Balken tragen den Wert auf x, nicht auf y');
});

test('muscleBars zeigt jede Gruppe an der Achse, ohne welche zu ueberspringen', () => {
  const cfg = C.muscleBars(M3, DE);
  assert.strictEqual(cfg.options.scales.y.ticks.autoSkip, false);
});

// ── oneRmLine: Untergrenze ────────────────────────────────────────────────

test('oneRmLine mit drei Punkten gibt null — aus drei Punkten kommt kein Trend', () => {
  assert.strictEqual(C.oneRmLine(ptsOf([100, 104, 108]), null, DE), null);
});

test('oneRmLine ohne Punkte gibt null', () => {
  assert.strictEqual(C.oneRmLine([], null, DE), null);
  assert.strictEqual(C.oneRmLine(null, null, DE), null);
});

test('oneRmLine genau an der Untergrenze liefert ein Diagramm', () => {
  const cfg = C.oneRmLine(ptsOf([100, 104, 103, 108]).slice(0, C.MIN_POINTS), null, DE);
  assert.ok(cfg, 'MIN_POINTS Punkte muessen reichen');
  assert.strictEqual(cfg.data.datasets[0].data.length, C.MIN_POINTS);
});

// ── oneRmLine: Verlauf ────────────────────────────────────────────────────

test('oneRmLine mit sechs Punkten und ohne Ziel hat genau einen Datensatz', () => {
  const cfg = C.oneRmLine(P6, null, DE);
  assert.strictEqual(cfg.type, 'line');
  assert.strictEqual(cfg.data.datasets.length, 1, 'ohne Ziel darf keine Trendlinie entstehen');
  assert.deepStrictEqual(cfg.data.datasets[0].data, [100, 104, 103, 108, 112, 115]);
  assert.strictEqual(cfg.data.labels.length, 6);
});

test('oneRmLine sortiert die Punkte nach Wochennummer', () => {
  const durcheinander = [
    { weekIndex: 2903, kg: 108 }, { weekIndex: 2900, kg: 100 },
    { weekIndex: 2905, kg: 115 }, { weekIndex: 2901, kg: 104 },
    { weekIndex: 2904, kg: 112 }, { weekIndex: 2902, kg: 103 }
  ];
  const cfg = C.oneRmLine(durcheinander, null, DE);
  assert.deepStrictEqual(cfg.data.datasets[0].data, [100, 104, 103, 108, 112, 115]);
});

test('oneRmLine laesst eine Trainingspause als Luecke stehen statt sie einzuebnen', () => {
  // Vier Wochen, dann drei Wochen Pause, dann eine Woche: sieben Positionen.
  const cfg = C.oneRmLine([
    { weekIndex: 2900, kg: 100 }, { weekIndex: 2901, kg: 104 },
    { weekIndex: 2902, kg: 103 }, { weekIndex: 2903, kg: 108 },
    { weekIndex: 2907, kg: 115 }
  ], null, DE);
  assert.strictEqual(cfg.data.labels.length, 8, 'die Pause ist zusammengezogen worden');
  assert.deepStrictEqual(cfg.data.datasets[0].data,
    [100, 104, 103, 108, null, null, null, 115]);
  assert.strictEqual(cfg.data.datasets[0].spanGaps, false,
    'eine durchgezogene Linie ueber die Pause behauptet Training, das nicht stattfand');
});

test('oneRmLine behaelt je Woche den hoechsten Wert', () => {
  const cfg = C.oneRmLine([
    { weekIndex: 2900, kg: 100 }, { weekIndex: 2900, kg: 106 },
    { weekIndex: 2901, kg: 104 }, { weekIndex: 2902, kg: 103 },
    { weekIndex: 2903, kg: 108 }
  ], null, DE);
  assert.deepStrictEqual(cfg.data.datasets[0].data, [106, 104, 103, 108]);
});

test('oneRmLine laesst Punkte ausserhalb der Spanne weg statt eine Jahresachse zu bauen', () => {
  const cfg = C.oneRmLine([
    { weekIndex: 2800, kg: 60 },
    { weekIndex: 2900, kg: 100 }, { weekIndex: 2901, kg: 104 },
    { weekIndex: 2902, kg: 103 }, { weekIndex: 2903, kg: 108 }
  ], null, DE);
  assert.strictEqual(cfg.data.labels.length, 4);
  assert.deepStrictEqual(cfg.data.datasets[0].data, [100, 104, 103, 108]);
});

test('oneRmLine wirft unbrauchbare Punkte weg und gibt null, wenn zu wenig uebrig bleibt', () => {
  assert.strictEqual(C.oneRmLine([
    { weekIndex: 2900, kg: 100 }, { weekIndex: 2901, kg: 0 },
    { weekIndex: 2902, kg: 'schwer' }, { weekIndex: null, kg: 108 },
    { weekIndex: 2904, kg: 112 }
  ], null, DE), null);
});

// ── oneRmLine: Trendlinie ─────────────────────────────────────────────────

test('oneRmLine mit Ziel legt einen zweiten Datensatz an, der genau auf dem Ziel endet', () => {
  const cfg = C.oneRmLine(P6, { goalKg: 135, weeks: 4 }, DE);
  assert.strictEqual(cfg.data.datasets.length, 2);
  const trend = cfg.data.datasets[1].data;
  assert.strictEqual(cfg.data.labels.length, 10, 'sechs Wochen Verlauf plus vier Wochen Prognose');
  assert.strictEqual(trend.length, 10);
  assert.strictEqual(trend[trend.length - 1], 135, 'die Trendlinie endet nicht auf dem Ziel');
  // Erst ab dem letzten echten Punkt, damit die Linie anschliesst.
  for (let i = 0; i < 5; i++) assert.strictEqual(trend[i], null, 'Trend beginnt zu frueh');
  assert.strictEqual(trend[5], 115, 'die Trendlinie haengt nicht am letzten echten Wert');
  // Dazwischen wird gleichmaessig gestiegen, nicht gesprungen.
  assert.strictEqual(trend[6], 120);
  assert.strictEqual(trend[7], 125);
  assert.strictEqual(trend[8], 130);
});

/* Der Endpunkt wird gesetzt, nicht gerechnet. 80,2 + (116,8 - 80,2) x 7/7
   ergibt in Gleitkomma 116.79999999999998 — eine Trendlinie, die knapp
   unter dem Ziel endet, ist eine andere Zusage als die Prognose, und im
   Tooltip stuende dann eine Zahl, die der Nutzer nirgends gesetzt hat. */
test('oneRmLine trifft das Ziel exakt, auch wo die Rechnung daneben laege', () => {
  const cfg = C.oneRmLine(ptsOf([70, 74, 73, 78, 80.2]), { goalKg: 116.8, weeks: 7 }, DE);
  const trend = cfg.data.datasets[1].data;
  assert.strictEqual(trend[trend.length - 1], 116.8,
    'der Endpunkt ist gerechnet statt gesetzt: ' + trend[trend.length - 1]);
});

test('oneRmLine fuellt den Verlaufs-Datensatz ueber die Prognosewochen mit null auf', () => {
  const cfg = C.oneRmLine(P6, { goalKg: 135, weeks: 4 }, DE);
  const echt = cfg.data.datasets[0].data;
  assert.strictEqual(echt.length, 10);
  assert.deepStrictEqual(echt.slice(6), [null, null, null, null],
    'der Verlauf laeuft in die Zukunft weiter');
});

test('oneRmLine ohne Wochenzahl erfindet keinen Zeitraum', () => {
  assert.strictEqual(C.oneRmLine(P6, 135, DE).data.datasets.length, 1);
  assert.strictEqual(C.oneRmLine(P6, { goalKg: 135 }, DE).data.datasets.length, 1);
  assert.strictEqual(C.oneRmLine(P6, { goalKg: 135, weeks: 0 }, DE).data.datasets.length, 1);
  assert.strictEqual(C.oneRmLine(P6, { weeks: 4 }, DE).data.datasets.length, 1);
});

test('oneRmLine zeichnet keine Trendlinie zu einem bereits erreichten Ziel', () => {
  assert.strictEqual(C.oneRmLine(P6, { goalKg: 115, weeks: 4 }, DE).data.datasets.length, 1);
  assert.strictEqual(C.oneRmLine(P6, { goalKg: 90, weeks: 4 }, DE).data.datasets.length, 1);
});

test('oneRmLine nimmt die Prognose auch unter dem Schluessel kg entgegen', () => {
  const cfg = C.oneRmLine(P6, { kg: 135, weeks: 4 }, DE);
  assert.strictEqual(cfg.data.datasets.length, 2);
  assert.strictEqual(cfg.data.datasets[1].data[9], 135);
});

test('oneRmLine setzt die Trendlinie gestrichelt und gedaempft ab, der Verlauf traegt den Akzent', () => {
  const cfg = C.oneRmLine(P6, { goalKg: 135, weeks: 4 }, DE);
  assert.strictEqual(cfg.data.datasets[0].borderColor, ACC);
  assert.strictEqual(cfg.data.datasets[0].pointBackgroundColor, ACC);
  assert.strictEqual(cfg.data.datasets[1].borderColor, MUT);
  assert.deepStrictEqual(cfg.data.datasets[1].borderDash, [5, 4]);
  assert.strictEqual(cfg.data.datasets[1].pointRadius, 0);
});

test('oneRmLine beschriftet die Wertachse mit der Einheit', () => {
  const cfg = C.oneRmLine(P6, null, LBS);
  assert.strictEqual(cfg.options.scales.y.ticks.callback(115), '115 lbs');
  const tip = cfg.options.plugins.tooltip.callbacks.label;
  assert.strictEqual(tip({ parsed: { y: 115.4 }, dataset: { label: 'Bestwert' } }), ' Bestwert: 115,4 lbs');
});

// ── Der Farbverlauf unter der Linie ───────────────────────────────────────

test('oneRmLine baut den Verlauf unter der Linie aus dem hereingegebenen Akzent', () => {
  const cfg = C.oneRmLine(P6, null, DE);
  const fill = cfg.data.datasets[0].backgroundColor;
  assert.strictEqual(typeof fill, 'function');
  const stops = [];
  const stub = { chart: { height: 200, ctx: { createLinearGradient: () => ({
    addColorStop: (p, c) => stops.push(c) }) } } };
  fill(stub);
  assert.deepStrictEqual(stops, [ACC + '3D', ACC + '14', ACC + '00'],
    'der Verlauf muss aus opts.accent kommen, nicht aus einem eigenen Farbwert');
});

test('oneRmLine faellt beim Farbverlauf still zurueck, statt das Diagramm zu sprengen', () => {
  const fill = C.oneRmLine(P6, null, DE).data.datasets[0].backgroundColor;
  assert.strictEqual(fill({}), 'transparent');
  assert.strictEqual(fill(undefined), 'transparent');
  const werfend = { chart: { height: 200, ctx: { createLinearGradient: () => { throw new Error('kaputt'); } } } };
  assert.strictEqual(fill(werfend), ACC + '22');
});

test('oneRmLine baut mit einer unbekannten Farbform gar keinen Verlauf', () => {
  const fill = C.oneRmLine(P6, null, { accent: 'rgb(0,122,255)', muted: MUT, lang: 'de', unit: 'kg' })
    .data.datasets[0].backgroundColor;
  const stub = { chart: { height: 200, ctx: { createLinearGradient: () => ({ addColorStop: () => {} }) } } };
  assert.strictEqual(fill(stub), 'transparent',
    'aus einer nicht-hexadezimalen Farbe darf kein zusammengebastelter Wert entstehen');
});

// ── Sprache ───────────────────────────────────────────────────────────────

test('volumeBars beschriftet die Wochen in der uebergebenen Sprache', () => {
  assert.strictEqual(C.volumeBars(W8, DE).data.labels[0], 'KW 20');
  assert.strictEqual(C.volumeBars(W8, EN).data.labels[0], 'Week 20');
});

test('muscleBars trennt die Tausender nach der uebergebenen Sprache', () => {
  const de = C.muscleBars(M3, DE).options.scales.x.ticks.callback(9100);
  const en = C.muscleBars(M3, EN).options.scales.x.ticks.callback(9100);
  assert.strictEqual(de, '9.100 kg');
  assert.strictEqual(en, '9,100 kg');
  assert.notStrictEqual(de, en);
});

test('oneRmLine beschriftet die Wochenachse in der uebergebenen Sprache', () => {
  const de = C.oneRmLine(P6, { goalKg: 135, weeks: 4 }, DE).data.labels;
  const en = C.oneRmLine(P6, { goalKg: 135, weeks: 4 }, EN).data.labels;
  assert.deepStrictEqual(de.slice(0, 6), ['-5 Wo.', '-4 Wo.', '-3 Wo.', '-2 Wo.', '-1 Wo.', 'zuletzt']);
  assert.deepStrictEqual(en.slice(0, 6), ['-5 wk', '-4 wk', '-3 wk', '-2 wk', '-1 wk', 'latest']);
  assert.deepStrictEqual(de.slice(6), ['+1 Wo.', '+2 Wo.', '+3 Wo.', '+4 Wo.']);
  assert.deepStrictEqual(en.slice(6), ['+1 wk', '+2 wk', '+3 wk', '+4 wk']);
});

test('oneRmLine benennt Verlauf und Prognose in der uebergebenen Sprache', () => {
  const de = C.oneRmLine(P6, { goalKg: 135, weeks: 4 }, DE).data.datasets;
  const en = C.oneRmLine(P6, { goalKg: 135, weeks: 4 }, EN).data.datasets;
  assert.strictEqual(de[0].label, 'Bestwert');
  assert.strictEqual(de[1].label, 'Prognose');
  assert.strictEqual(en[0].label, 'Best');
  assert.strictEqual(en[1].label, 'Forecast');
});

test('eine unbekannte Sprache faellt auf Deutsch zurueck statt auf einen leeren Text', () => {
  assert.strictEqual(C.volumeBars(W8, { accent: ACC, muted: MUT, lang: 'fr', unit: 'kg' }).data.labels[0], 'KW 20');
});

// ── Oberflaechen-Regeln ───────────────────────────────────────────────────

const PIKTO = /\p{Extended_Pictographic}/u;

function alleTexte(cfg) {
  const out = [];
  (function geh(v) {
    if (v === null || v === undefined) return;
    if (typeof v === 'string') { out.push(v); return; }
    if (typeof v === 'function') { out.push(v.toString()); return; }
    if (Array.isArray(v)) { v.forEach(geh); return; }
    if (typeof v === 'object') { Object.keys(v).forEach(k => { out.push(k); geh(v[k]); }); }
  })(cfg);
  return out;
}

test('keine der drei Konfigurationen traegt ein Piktogramm', () => {
  const cfgs = [
    C.volumeBars(W8, DE), C.volumeBars(W8, EN),
    C.muscleBars(M3, DE), C.muscleBars(M3, EN),
    C.oneRmLine(P6, { goalKg: 135, weeks: 4 }, DE),
    C.oneRmLine(P6, { goalKg: 135, weeks: 4 }, EN)
  ];
  cfgs.forEach((cfg, i) => {
    alleTexte(cfg).forEach(t => {
      assert.ok(!PIKTO.test(t), 'Piktogramm in Konfiguration ' + i + ': ' + t);
    });
  });
});

test('auch die erzeugten Achsen- und Tooltip-Texte tragen kein Piktogramm', () => {
  [DE, EN, LBS].forEach(o => {
    const v = C.volumeBars(W8, o), m = C.muscleBars(M3, o);
    const l = C.oneRmLine(P6, { goalKg: 135, weeks: 4 }, o);
    const texte = [
      v.options.scales.y.ticks.callback(12000),
      v.options.plugins.tooltip.callbacks.label({ parsed: { y: 12000 } }),
      m.options.scales.x.ticks.callback(9100),
      m.options.plugins.tooltip.callbacks.label({ parsed: { x: 9100 } }),
      l.options.scales.y.ticks.callback(115),
      l.options.plugins.tooltip.callbacks.label({ parsed: { y: 115 }, dataset: { label: 'Bestwert' } })
    ].concat(v.data.labels, m.data.labels, l.data.labels);
    texte.forEach(t => assert.ok(!PIKTO.test(String(t)), 'Piktogramm in: ' + t));
  });
});

test('die Quelle enthaelt kein Piktogramm', () => {
  assert.ok(!PIKTO.test(fs.readFileSync(SRC, 'utf8')));
});

test('das Modul fasst weder Oberflaeche noch Speicher noch die Systemuhr an', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  [/\bdocument\b/, /\bwindow\b/, /\blocalStorage\b/, /Date\s*\.\s*now/, /\bnew\s+Date\b/,
   /\bfetch\s*\(/, /getComputedStyle/, /\brequire\s*\(/].forEach(re => {
    assert.ok(!re.test(src), 'verbotener Zugriff in js/coach-charts.js: ' + re);
  });
});

test('das Modul zeichnet nichts — es ruft Chart nirgends auf', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  assert.ok(!/new\s+Chart\s*\(/.test(src), 'im Modul wird gezeichnet statt konfiguriert');
});

test('die uebergebenen Listen werden nicht angefasst', () => {
  const w = weeksOf([12000, 9000, 14500]);
  const kopie = JSON.parse(JSON.stringify(w));
  C.volumeBars(w, DE);
  assert.deepStrictEqual(w, kopie);

  const m = M3.map(x => Object.assign({}, x));
  const mKopie = JSON.parse(JSON.stringify(m));
  C.muscleBars(m, DE);
  assert.deepStrictEqual(m, mKopie);

  const p = P6.map(x => Object.assign({}, x));
  const pKopie = JSON.parse(JSON.stringify(p));
  C.oneRmLine(p, { goalKg: 135, weeks: 4 }, DE);
  assert.deepStrictEqual(p, pKopie);
});

test('alle drei blenden die Legende aus und passen sich dem Rahmen an', () => {
  [C.volumeBars(W8, DE), C.muscleBars(M3, DE), C.oneRmLine(P6, null, DE)].forEach((cfg, i) => {
    assert.strictEqual(cfg.options.responsive, true, 'Diagramm ' + i);
    assert.strictEqual(cfg.options.maintainAspectRatio, false, 'Diagramm ' + i);
    assert.strictEqual(cfg.options.plugins.legend.display, false, 'Diagramm ' + i);
  });
});
