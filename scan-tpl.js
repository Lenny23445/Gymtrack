/* Findet Template-Literale, deren TEXT-Anteile im EN-Modus deutsch bleiben.
   Wichtig: ${...} wird mit Klammerzaehlung entfernt, damit verschachtelte
   Ausdruecke wie ${new Date(x).toLocaleDateString(y)} nicht das ganze
   Template unbrauchbar machen — daran ging "aus 10x242 kg" durch. */
const fs = require('fs');
const L = fs.readFileSync('index.html', 'utf8').split('\n');
const s = (a, b) => L.slice(a - 1, b).join('\n');
const en = L.findIndex(l => l.startsWith('const I18N_EN = {')) + 1;
const enEnd = L.findIndex((l, i) => i > en && l.startsWith('};')) + 1;
const rx = L.findIndex(l => l.startsWith('const I18N_RX = [')) + 1;
const rxEnd = L.findIndex((l, i) => i > rx && l.startsWith('];')) + 1;
const fn = L.findIndex(l => l.startsWith('function tr(s) {')) + 1;
const fnEnd = L.findIndex((l, i) => i > fn && l === '}') + 1;
fs.writeFileSync('/tmp/mtpl.js', 'const GT_LANG="en";\n' + s(en, enEnd) + '\n' + s(rx, rxEnd) + '\n' + s(fn, fnEnd) + '\nmodule.exports={tr};');
delete require.cache['/tmp/mtpl.js'];
const { tr } = require('/tmp/mtpl.js');

const MARK = '@@';   // Platzhalter fuer eine Interpolation

const html = fs.readFileSync('index.html', 'utf8');
let js = '';
const sre = /<script[^>]*>([\s\S]*?)<\/script>/gi;
let m;
while ((m = sre.exec(html))) js += m[1] + '\n';
js = js.split(s(en, rxEnd)).join('');   // I18N-Block selbst ausklammern

/* Template-Literale einsammeln; Backticks innerhalb von ${...} zaehlen nicht. */
const tpls = [];
for (let i = 0; i < js.length; i++) {
  if (js[i] !== '`' || js[i - 1] === '\\') continue;
  let j = i + 1, depth = 0;
  while (j < js.length) {
    if (js[j] === '\\') { j += 2; continue; }
    if (js[j] === '{' && js[j - 1] === '$') depth++;
    else if (js[j] === '}' && depth > 0) depth--;
    else if (js[j] === '`' && depth === 0) break;
    j++;
  }
  tpls.push(js.slice(i + 1, j));
  i = j;
}

/* ${...} mit Klammerzaehlung durch MARK ersetzen */
function strip(t) {
  let out = '', i = 0;
  while (i < t.length) {
    if (t[i] === '$' && t[i + 1] === '{') {
      let d = 1; i += 2;
      while (i < t.length && d > 0) { if (t[i] === '{') d++; else if (t[i] === '}') d--; i++; }
      out += MARK;
    } else out += t[i++];
  }
  return out;
}

const DE = /(^|[^A-Za-zÄÖÜäöüß])(aus|bei|von|seit|pro|mit|für|und|oder|noch|schon|dann|wenn|weil|der|die|das|den|dem|ein|eine|einen|dein|deine|nicht|kein|keine|mehr|weniger|jede|jeder|alle|beim|zum|zur|im|am|auf|über|unter|durch|ohne|gegen|nach|vor|Woche|Wochen|Tag|Tage|Übung|Übungen|Training|Trainings|Satz|Sätze|Gewicht|Gruppe|Muskel|Einheit|Einheiten|Ziel|Pause|Punkte|Stunden|Minuten|gesamt|bisher|letzte|letzter|diese|heute|gestern|morgen|erholt|bereit|fertig|zurück|weiter)([^A-Za-zÄÖÜäöüß]|$)/;

const found = new Map();
for (const t of tpls) {
  const flat = strip(t);
  /* Textsegmente: HTML-Knoten, sonst das ganze Literal */
  const segs = [];
  const re = />([^<>]+)</g;
  let n, any = false;
  while ((n = re.exec(flat))) { segs.push(n[1]); any = true; }
  if (!any) segs.push(flat);
  for (let seg of segs) {
    seg = seg.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    if (seg.length < 3 || seg.length > 150) continue;
    if (!/[A-Za-zÄÖÜäöüß]/.test(seg)) continue;
    if (/[<>]|=>|style=|class=|function|querySelector/.test(seg)) continue;
    /* Zahl als Probe einsetzen: so sieht der echte Textknoten aus */
    const probe = seg.split(MARK).join('42');
    const out = tr(probe);
    if (DE.test(out) || /[äöüßÄÖÜ]/.test(out)) found.set(seg, out);
  }
}
console.log('Templates mit deutschem Textanteil:', found.size);
for (const [k, v] of found) console.log('· ' + k + '\n    -> ' + v);
