/* Liefert den kompletten App-Quelltext als ein Stueck Text.

   Bis zum Modul-Split (01.08.2026) stand die ganze App in index.html, und Tests,
   die den Quelltext durchsuchen, haben schlicht diese eine Datei gelesen. Seit
   dem Split liegt der JS-Teil in js/app-*.js — wer weiter nur index.html liest,
   prueft ein leeres Geruest und meldet trotzdem gruen.

   Die Modulliste steht bewusst NICHT hart in dieser Datei, sondern wird aus dem
   Verzeichnis gelesen: ein spaeter hinzugefuegtes Modul waere sonst stillschweigend
   ungeprueft — genau die Sorte Luecke, die niemand bemerkt, bis sie weh tut. */
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..', '..');

function appDateien() {
  const jsDir = path.join(WURZEL, 'js');
  const module = fs.readdirSync(jsDir)
    .filter(n => /^app-.*\.js$/.test(n))
    .sort();
  if (module.length === 0) throw new Error('Keine js/app-*.js gefunden — Split kaputt oder Pfad falsch?');
  return [path.join(WURZEL, 'index.html'), ...module.map(n => path.join(jsDir, n))];
}

function appQuelltext() {
  return appDateien().map(p => fs.readFileSync(p, 'utf8')).join('\n');
}

module.exports = { appQuelltext, appDateien };
