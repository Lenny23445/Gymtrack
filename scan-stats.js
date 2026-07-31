/* Prüft gezielt die Statistik-Renderer auf Texte, die im EN-Modus deutsch bleiben. */
const fs = require('fs');
const L = fs.readFileSync('index.html', 'utf8').split('\n');
const s = (a, b) => L.slice(a - 1, b).join('\n');
const en = L.findIndex(l => l.startsWith('const I18N_EN = {')) + 1;
const enEnd = L.findIndex((l, i) => i > en && l.startsWith('};')) + 1;
const rx = L.findIndex(l => l.startsWith('const I18N_RX = [')) + 1;
const rxEnd = L.findIndex((l, i) => i > rx && l.startsWith('];')) + 1;
const fn = L.findIndex(l => l.startsWith('function tr(s) {')) + 1;
const fnEnd = L.findIndex((l, i) => i > fn && l === '}') + 1;
fs.writeFileSync('/tmp/ms.js', 'const GT_LANG="en";\n' + s(en, enEnd) + '\n' + s(rx, rxEnd) + '\n' + s(fn, fnEnd) + '\nmodule.exports={tr};');
delete require.cache['/tmp/ms.js'];
const { tr } = require('/tmp/ms.js');

/* Alle Funktionen, die den Statistik-Tab und seine Detail-Overlays aufbauen. */
const NAMES = ['renderStats', 'renderStatsSummary', 'renderStatsOverallChart', 'renderFatigueMini',
  'renderWeekCircles', 'renderStatsMuscleGroups', 'renderStatsExerciseList', 'openMuscleDetail',
  'renderRecovery', 'renderFatigue', '_recWhen', 'openExDetail'];
let blk = '';
for (const n of NAMES) {
  const i = L.findIndex(l => l.includes('function ' + n + '('));
  if (i < 0) continue;
  blk += s(i + 1, i + 130) + '\n';
}
const DE = /[äöüßÄÖÜ]|(^|\s)(der|die|das|den|dein|deine|und|nicht|kein|keine|noch|mehr|bei|von|zum|Woche|Wochen|Training|Trainings|Übung|Übungen|Satz|Sätze|Gewicht|Muskel|Muskeln|Einheit|Einheiten|Punkte|gesamt|bisher|letzte|letzter|diese|dieser|heute|erholt|Erholung|Pause|Ziel)(\s|$)/;
const found = new Set();
let m;
const q = /[`'"]([^`'"\n]{3,140})[`'"]/g;
while ((m = q.exec(blk))) {
  const v = m[1].trim();
  if (!/[A-Za-zÄÖÜäöüß]/.test(v)) continue;
  if (/[<>{}();]|=>|\.\w+\(|style=|class=|^[a-z-]+$/.test(v)) continue;
  if (!DE.test(v)) continue;
  if (tr(v) === v) found.add(v);
}
console.log('Statistik-Bereich, nicht übersetzt:', found.size);
[...found].forEach(f => console.log('· ' + f));
