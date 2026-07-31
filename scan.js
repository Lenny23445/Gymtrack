const fs=require('fs'),L=fs.readFileSync('index.html','utf8').split('\n');
const s=(a,b)=>L.slice(a-1,b).join('\n');
const en=L.findIndex(l=>l.startsWith('const I18N_EN = {'))+1;
const enEnd=L.findIndex((l,i)=>i>en&&l.startsWith('};'))+1;
const rx=L.findIndex(l=>l.startsWith('const I18N_RX = ['))+1;
const rxEnd=L.findIndex((l,i)=>i>rx&&l.startsWith('];'))+1;
const fn=L.findIndex(l=>l.startsWith('function tr(s) {'))+1;
const fnEnd=L.findIndex((l,i)=>i>fn&&l==='}')+1;
fs.writeFileSync('/tmp/mm.js',`const GT_LANG="en";\n`+s(en,enEnd)+'\n'+s(rx,rxEnd)+'\n'+s(fn,fnEnd)+'\nmodule.exports={tr,I18N_EN};');
const {tr,I18N_EN}=require('/tmp/mm.js');const VALS=new Set(Object.values(I18N_EN));
const html=fs.readFileSync('index.html','utf8');
let js='';const sre=/<script[^>]*>([\s\S]*?)<\/script>/gi;let m;
while((m=sre.exec(html)))js+=m[1]+'\n';
// I18N-Block selbst ausschliessen (dort stehen die deutschen Schluessel legitim)
js=js.split('\n').filter((l,i)=>!(i>=en-1&&i<=rxEnd)).join('\n');
const cand=new Set();
// alle String-Literale
const q=/'((?:[^'\\\n]|\\.){2,200})'|"((?:[^"\\\n]|\\.){2,200})"/g;
while((m=q.exec(js))){const v=(m[1]||m[2]).trim();if(v)cand.add(v);}
// Template-Literale: Textfragmente zwischen Tags und freie Teile
const t=/`([^`]*)`/g;
while((m=t.exec(js))){
  const inner=m[1];
  let n;const re=/>([^<>{}`]+)</g;
  while((n=re.exec(inner))){const v=n[1].replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();if(v)cand.add(v);}
}
// HTML-Body
const body=html.slice(html.indexOf('<body')).replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'');
let n;const re2=/>([^<>]+)</g;
while((n=re2.exec(body))){const v=n[1].replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();if(v)cand.add(v);}
const at=/(?:placeholder|aria-label|title|alt)="([^"]+)"/g;
while((n=at.exec(body)))cand.add(n[1].trim());

// Deutsch-Erkennung: Wortliste (auch ohne Umlaut) + Umlaute
const W='der|die|das|den|dem|des|ein|eine|einen|einem|einer|und|oder|aber|nicht|kein|keine|keinen|dein|deine|deinen|deinem|du|dich|dir|ich|wir|uns|sich|man|ist|sind|war|waren|wird|werden|wurde|hat|haben|hast|kann|kannst|muss|musst|soll|sollst|darf|will|willst|für|mit|auf|aus|bei|von|vor|nach|über|unter|durch|ohne|gegen|um|zum|zur|zu|im|am|beim|noch|schon|jetzt|hier|dann|wenn|weil|dass|wie|was|wer|wo|mehr|weniger|alle|jede|jeden|jeder|bereit|fertig|zurück|weiter|abbrechen|speichern|löschen|erstellen|hinzufügen|bearbeiten|schließen|öffnen|wählen|ändern|neu|neue|neuer|heute|gestern|morgen|Woche|Wochen|Tag|Tage|Übung|Übungen|Training|Trainings|Satz|Sätze|Gewicht|Gruppe|Gruppen|Muskel|Muskeln|Erholung|erholt|Einheit|Einheiten|Ziel|Plan|Pause|Pausen|Fortschritt|Rekord|Punkte|Stunden|Minuten|leicht|schwer|locker|stark|voll|halb|lang|kurz|gut|schlecht|besser|beste|bester';
const G=new RegExp('(^|[^A-Za-zÄÖÜäöüß])('+W+')([^A-Za-zÄÖÜäöüß]|$)');
const U=/[äöüßÄÖÜ]/;
const skip=/^(https?:|\.|#|\/|[A-Za-z0-9_-]+$|\d)|\{|\}|=>|function|querySelector|addEventListener|localStorage|firebase|\[GymTrack\]/;
const bad=[];
for(const c of cand){
  if(skip.test(c)&&!U.test(c))continue;
  if(!/[A-Za-zÄÖÜäöüß]/.test(c))continue;
  if(I18N_EN[c]!==undefined||VALS.has(c))continue;
  const o=tr(c);
  if(G.test(o)||U.test(o))bad.push(c+"\t=>\t"+o);
}
bad.sort();
fs.writeFileSync('/tmp/rest.txt',bad.join('\n'));
console.log('Kandidaten:',cand.size,'| verdaechtig:',bad.length);
