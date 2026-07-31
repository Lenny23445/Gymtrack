/* Task-19-Verifikation ohne iOS-Simulator (Windows, kein Xcode).
   Die ECHTE Zustellung laesst sich hier nicht pruefen: im Browser gibt es kein
   @capacitor/local-notifications. Geprueft wird deshalb die PLANUNGSEBENE —
   und zwar so, dass es etwas faengt: window.Capacitor wird VOR dem ersten
   Skript durch ein Doppel ersetzt, das jeden schedule- und cancel-Aufruf
   mitschreibt und eine Liste anstehender Termine fuehrt.

   Die Uhr wird fuer den ganzen Lauf auf Mittwoch 10:00 Ortszeit festgenagelt
   (Date.now). Ohne das haengen Nachtfenster und Tagesdeckel daran, wann der
   Test zufaellig laeuft.

   Tipps laufen ueber echte Zeigerfolgen (page.click), nicht ueber synthetisches
   .click(). Eigener Port: 8798 (8793/8794/8795/8796/8797/8917 sind belegt).

   Aufruf:
     node task-19-check.js              gegen den Arbeitsstand
     node task-19-check.js --root=<dir> gegen einen anderen Baum (Rot-Lauf
                                        gegen den Stand VOR der Aenderung)      */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const REPO = path.resolve(__dirname, '../../..');
const puppeteer = require(path.join(REPO, 'node_modules/puppeteer'));

const argRoot = (process.argv.find(a => a.startsWith('--root=')) || '').slice(7);
const ROOT = argRoot ? path.resolve(argRoot) : REPO;
const SRC  = path.join(ROOT, 'index.html');
const PORT = 8798;
const MIME = { '.html':'text/html', '.js':'application/javascript', '.json':'application/json',
               '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(path.resolve(ROOT))) { res.writeHead(403).end(); return; }
  fs.readFile(f, (e, data) => {
    if (e) { res.writeHead(404).end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(data);
  });
});

/* Der Versions-Bump (APP_VERSION, CACHE in sw.js, CHANGELOG) war waehrend der
   Task-19-Welle ein eigener Ritualschritt DANACH; solange die Welle lief, hat
   hier ein Vergleich gegen git HEAD gestanden ("beides unveraendert").

   Mit dem Blockabschluss 4 ist der Bump ausgefuehrt — und damit war dieser
   Waechter nicht mehr erfuellbar: unmittelbar nach dem Bump-Commit ist der
   Arbeitsbaum wieder gleich HEAD, der geforderte Nachweis "es wurden zwei
   verschiedene Staende verglichen" faellt weg, und die Pruefung waere dauerhaft
   ROT geblieben — aus einem Grund, der nichts mit Task 19 zu tun hat.

   An seiner Stelle steht jetzt die DAUERHAFTE Invariante, die den teuersten
   Fehler dieses Rituals faengt: APP_VERSION (index.html) und CACHE (sw.js)
   muessen denselben Wert tragen. Laufen sie auseinander, laedt ein frisches
   index.html gegen einen alten Cache — genau der Zustand, den der Bump
   verhindern soll. Dazu die Formregel des Changelogs: kein Schluessel darf dem
   Muster gymtrack-v\d+ folgen (das Deploy-Skript ueberschreibt solche
   Eintraege), und der neueste steht vorn. */
const holCache = (s) => s ? ((s.match(/const CACHE\s*=\s*['"]([^'"]+)['"]/) || [])[1] || null) : null;
const holVer   = (s) => s ? ((s.match(/const APP_VERSION\s*=\s*['"]([^'"]+)['"]/) || [])[1] || null) : null;
const holClKeys = (s) => {
  if (!s) return null;
  const i = s.indexOf('const CHANGELOG');
  if (i < 0) return null;
  return (s.slice(i, i + 60000).match(/'cl-[0-9a-z-]+'\s*:/g) || [])
    .map(m => m.replace(/'\s*:$/, '').replace(/^'/, '')).join(',') || null;
};
// Ein Schluessel im Muster gymtrack-v\d+ wuerde vom Deploy-Skript ueberschrieben.
const holClVerboten = (s) => {
  if (!s) return null;
  const i = s.indexOf('const CHANGELOG');
  if (i < 0) return null;
  return (s.slice(i, i + 60000).match(/'gymtrack-v\d+'\s*:/g) || []).length;
};
const CL_NEU = 'cl-2026-07-29-coach-meldet-sich';

// Kommentare entfernen. Der Doppelpunkt-Riegel laesst 'https://' stehen.
const ohneKommentar = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const results = [];
const check = (name, cond, got) => results.push({ name, ok: !!cond, got });
const wait = ms => new Promise(r => setTimeout(r, ms));
const PIKTO = /\p{Extended_Pictographic}/u;
const PLATZ = /\{[a-z]+\}/i;
/* Der Rot-Lauf laeuft gegen einen Baum, in dem _cnSync() gar nicht existiert:
   dort liefert jeder Aufruf {__err}. Die Pruefungen sollen dann ROT sein, nicht
   den Harness abschiessen — deshalb bekommt jedes Ergebnis leere Standardfelder. */
const N = (x) => Object.assign(
  { geplant: [], kinds: [], cancelIds: [], pending: [], plan: [], heute: -1, owns: null },
  (x && !x.__err) ? x : { fehler: (x && x.__err) || 'kein Ergebnis' });

/* ── Das Doppel: laeuft VOR jedem Skript der Seite ────────────────────────
   _isNative() liest window.Capacitor.isNativePlatform(), _cap(name) liest
   window.Capacitor.Plugins[name] — beides sind top-level const-Bindungen der
   App und von aussen NICHT ueberschreibbar. Der einzige Hebel ist deshalb
   window.Capacitor selbst. Nur LocalNotifications wird gestellt; jedes andere
   Plugin bleibt undefined, wie in einer Web-Umgebung.                       */
const STUB = () => {
  /* Der Berechtigungsstand muss schon beim ERSTEN Skript stehen: der Sync beim
     App-Start laeuft, bevor eine page.evaluate() ihn setzen koennte. Er kommt
     deshalb aus localStorage, das ein goto() ueberlebt. Ohne das liesse sich
     der Auslieferungszustand (Berechtigung nie erteilt) gar nicht nachfahren. */
  const ls = (k, d) => { try { return localStorage.getItem(k) || d; } catch (_) { return d; } };
  window.__cn = { schedule: [], cancel: [], channels: [], reqs: 0, checks: 0,
                  perm: ls('__cnPerm', 'granted'), permOnRequest: ls('__cnPermOnRequest', null) };
  window.__cnPending = [];
  window.__cnReset = function (pending) {
    window.__cn.schedule = []; window.__cn.cancel = []; window.__cn.channels = [];
    window.__cn.reqs = 0; window.__cn.checks = 0;
    window.__cnPending = (pending || []).slice();
  };
  window.__cnIds = function () { return window.__cnPending.map(n => Number(n.id)).sort((a, b) => a - b); };
  window.__cnOwn = function () { return window.__cnPending.filter(n => Number(n.id) >= 47000 && Number(n.id) <= 47999); };
  const LN = {
    checkPermissions: async () => { window.__cn.checks++; return { display: window.__cn.perm }; },
    requestPermissions: async () => {
      window.__cn.reqs++;
      const d = window.__cn.permOnRequest || window.__cn.perm;
      window.__cn.perm = d;
      return { display: d };
    },
    createChannel: async (c) => { window.__cn.channels.push(c); },
    getPending: async () => ({ notifications: window.__cnPending.map(n => Object.assign({}, n)) }),
    /* ANHAENGEN, nicht ersetzen. Vorher modellierte das Doppel schedule() als
       Upsert (filter(x=>x.id!==n.id); push(n)) — damit war das Abbestellen
       mitmodelliert: eine Mutation, die _cnCancelOwn() abschaltet, blieb
       unsichtbar, weil der Bestand trotzdem sauber aussah. Haengt schedule an,
       schlaegt jeder fehlende cancel als Dublette im Bestand durch. */
    schedule: async (o) => {
      window.__cn.schedule.push(o);
      ((o && o.notifications) || []).forEach(n => window.__cnPending.push(Object.assign({}, n)));
      return { notifications: (o && o.notifications) || [] };
    },
    cancel: async (o) => {
      window.__cn.cancel.push(o);
      ((o && o.notifications) || []).forEach(n => {
        window.__cnPending = window.__cnPending.filter(x => Number(x.id) !== Number(n.id));
      });
    }
  };
  window.Capacitor = { isNativePlatform: () => true, Plugins: { LocalNotifications: LN } };
};

/* Grundzustand: Premium an, Anmelde-Wand weg, Wochenplan an jedem Tag, zwoelf
   woechentliche Einheiten mit steigendem Gewicht plus EINE genau vor 365 Tagen
   mit deutlich weniger (Jahresrueckblick), Check-ins "mehrfach schwer bei
   wenig Energie" (Deload ueber die VORHANDENE _ciReadiness). Ohne dieses
   Material bliebe die Haelfte der Kandidaten stumm und der Lauf waere gruen
   aus dem falschen Grund. */
const BOOTSTATE = () => {
  window.isPremium = () => true;
  const gate = document.getElementById('auth-gate'); if (gate) gate.style.display = 'none';

  const b = new Date(); b.setHours(10, 0, 0, 0);
  b.setDate(b.getDate() + ((3 - b.getDay() + 7) % 7));   // naechster Mittwoch, 10:00
  const NOW = b.getTime();
  window.__NOW = NOW;
  if (!window.__echtNow) window.__echtNow = Date.now.bind(Date);
  Date.now = () => window.__NOW;

  const NAMEN = ['Bankdrücken', 'Kniebeugen', 'Kreuzheben', 'Latzug'];
  S.exercises = NAMEN.map((n, i) => ({
    id: 'ex' + i, name: n, muscleGroup: 'brust',
    targetSets: 3, targetReps: 8, repMin: 6, repMax: 10, targetType: 'reps'
  }));
  ['mon','tue','wed','thu','fri','sat','sun'].forEach(k => {
    S.weekPlan[k] = { type: 'exercises', exIds: ['ex0', 'ex1'] };
  });
  S.notifTime = '08:00';
  S.notifEnabled = true;

  const mk = (ts, w) => ({
    id: 's' + ts, date: new Date(ts).toISOString(), duration: 3300,
    logs: S.exercises.map(e => ({ exerciseId: e.id, sets: [
      { w: w, r: 8, type: 'normal' }, { w: w, r: 8, type: 'normal' }, { w: w, r: 8, type: 'normal' }] }))
  });
  S.sessions = [];
  S.sessions.push(mk(NOW - 365 * 864e5, 50));
  for (let w = 12; w >= 1; w--) S.sessions.push(mk(NOW - w * 7 * 864e5, 60 + (12 - w) * 0.5));
  S.sessions.push(mk(NOW - 2 * 864e5, 70));               // letzte Einheit vor zwei Tagen

  S.checkins = [
    { sid: 'c1', d: new Date(NOW - 3 * 864e5).toISOString(), feel: 3, en: 1 },
    { sid: 'c2', d: new Date(NOW - 2 * 864e5).toISOString(), feel: 4, en: 1 },
    { sid: 'c3', d: new Date(NOW - 1 * 864e5).toISOString(), feel: 3, en: 1 }
  ];
  S.coachPush = { state: null, plan: [], permOk: false, owns: false };
  S.aiCoach = Object.assign({}, S.aiCoach, {
    name: 'Max', tone: 'sachlich', preset: 'balanced',
    pushLevel: 'normal', inTraining: 'key', setFeedback: true, live: true, insights: true
  });
  persist();
  // Ausgangsbestand: laufender Pausen-Timer (2500) und zwei generische
  // Trainings-Erinnerungen (1000/1001) aus dem alten Weg.
  window.__cnReset([{ id: 2500, title: 'Pause vorbei' },
                    { id: 1000, title: 'Zeit fürs Training!' },
                    { id: 1001, title: 'Zeit fürs Training!' }]);
  return NOW;
};

// Ein Sync mit gesetzter Stufe; gibt den Bestand und alles Mitgeschriebene zurueck.
const SYNC = async (o) => {
  const opt = o || {};
  if (opt.level) { S.aiCoach.pushLevel = opt.level; persist(); }
  if (opt.notifTime) { S.notifTime = opt.notifTime; persist(); }
  if (opt.reset !== false) window.__cnReset(window.__cnPending);
  await _cnSync(opt.pr ? { pr: opt.pr } : undefined);
  const lokalTag = (ts) => { const d = new Date(ts); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  // Nur der EIGENE Nummernraum zaehlt als Coach-Meldung. Die generische
  // Trainings-Erinnerung (1000-1999) laeuft ueber denselben Kanal und wird beim
  // Zurueckgeben mitgeplant — sie ist hier kein Ergebnis, sondern Umgebung.
  const geplant = [];
  window.__cn.schedule.forEach(s => (s.notifications || [])
    .filter(n => Number(n.id) >= 47000 && Number(n.id) <= 47999)
    .forEach(n => geplant.push({
    id: Number(n.id), title: n.title, body: n.body, kind: n.extra && n.extra.coachKind,
    at: new Date(n.schedule.at).getTime(), tag: lokalTag(new Date(n.schedule.at).getTime()),
    std: new Date(n.schedule.at).getHours(), kanal: n.channelId
  })));
  return {
    geplant: geplant,
    heute: geplant.filter(g => g.tag === lokalTag(window.__NOW)).length,
    kinds: geplant.map(g => g.kind),
    cancelIds: [].concat.apply([], window.__cn.cancel.map(c => (c.notifications || []).map(n => Number(n.id)))),
    pending: window.__cnIds(),
    owns: !!(S.coachPush && S.coachPush.owns),
    plan: (S.coachPush && S.coachPush.plan) || []
  };
};

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument(STUB);
  page.on('dialog', d => { try { d.dismiss(); } catch (_) {} });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text().slice(0, 200)); });

  const ev = async (fn, arg) => {
    try { return (arg === undefined) ? await page.evaluate(fn) : await page.evaluate(fn, arg); }
    catch (e) { return { __err: String((e && e.message) || e).slice(0, 240) }; }
  };
  const boot = async () => {
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 60000 });
    await wait(1500);
    return await ev(BOOTSTATE);
  };
  let r;

  // ── 1) Registrierung: script-Tag NACH coach-analyze, build.js, sw.js ─────
  await boot();
  const statisch = (() => {
    try {
      const html  = fs.readFileSync(SRC, 'utf8');
      const build = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
      const sw    = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
      const shell = (sw.match(/const SHELL\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';
      return {
        tag:      html.indexOf('<script src="./js/coach-notify.js">'),
        tagAnalyze: html.indexOf('<script src="./js/coach-analyze.js">'),
        build:    build.indexOf('js/coach-notify.js') >= 0,
        shell:    shell.indexOf('./js/coach-notify.js') >= 0,
        cache:    holCache(sw),
        ver:      holVer(html),
        clKeys:   holClKeys(html),
        clVerboten: holClVerboten(html)
      };
    } catch (e) { return { err: String(e.message) }; }
  })();
  r = await ev(() => ({
    notify: typeof window.CoachNotify, analyze: typeof window.CoachAnalyze,
    caps: window.CoachNotify ? window.CoachNotify.CAPS : null,
    wk: window.CoachNotify ? window.CoachNotify.weekKey(Date.now()) : null,
    idBase: typeof CN_ID_BASE === 'undefined' ? null : CN_ID_BASE,
    idFor: typeof _cnIdFor === 'function' ? _cnIdFor('reminderPlan:2026-07-30') : null,
    sync: typeof _cnSync, perm: typeof _cnPermission
  }));
  check('Registrierung: js/coach-notify.js haengt als script-Tag NACH coach-analyze, in build.js und im SHELL-Precache; APP_VERSION (index.html) und CACHE (sw.js) tragen DENSELBEN Wert, der Blockabschluss-Eintrag steht als ERSTER im CHANGELOG und kein Schluessel folgt dem Muster gymtrack-v\\d+; CoachNotify ist geladen und die Wochenrechnung loest auf',
    statisch.tag > 0 && statisch.tagAnalyze > 0 && statisch.tag > statisch.tagAnalyze &&
    statisch.build === true && statisch.shell === true &&
    typeof statisch.cache === 'string' && typeof statisch.ver === 'string' &&
    statisch.cache === statisch.ver &&
    typeof statisch.clKeys === 'string' &&
    (statisch.clKeys || '').split(',')[0] === CL_NEU &&
    statisch.clVerboten === 0 &&
    r.notify === 'object' && r.analyze === 'object' && typeof r.wk === 'string' &&
    r.idBase === 47000 && r.idFor >= 47000 && r.idFor <= 47999 &&
    r.sync === 'function' && r.perm === 'function',
    JSON.stringify({ statisch: Object.assign({}, statisch, { clKeys: (statisch.clKeys || '').split(',').slice(0, 3) }),
                     erwartetErster: CL_NEU, r }).slice(0, 800));

  // ── 2) Stufe "Still": geplant wird NUR der Wochenbericht ────────────────
  const still = N(await ev(SYNC, { level: 'still' }));
  check('Stufe "Still": geplant wird ausschliesslich der Wochenbericht (UNCAPPED) — keine Erinnerung, kein Anstoss, keine Gratulation',
    Array.isArray(still.geplant) && still.geplant.length === 1 &&
    still.kinds.join(',') === 'report' && still.owns === false,
    JSON.stringify({ n: (still.geplant || []).length, kinds: still.kinds, owns: still.owns }).slice(0, 500));

  // ── 3) Stufe "Normal": Erinnerung mit INHALT, Titel = Coach-Name ────────
  await boot();
  const normal = N(await ev(SYNC, { level: 'normal', pr: { ex: 'Bankdrücken', kg: 72.5 } }));
  const rem = (normal.geplant || []).filter(g => g.kind === 'reminderPlan')[0] || {};
  check('Stufe "Normal": die Trainings-Erinnerung sagt, WAS ansteht (Uebung, Gewicht, Saetze, Wiederholungen), Titel ist der Coach-Name, ids liegen im eigenen Raum 47000-47999',
    (normal.geplant || []).length >= 3 &&
    normal.kinds.indexOf('reminderPlan') >= 0 && normal.kinds.indexOf('returnNudge') >= 0 &&
    normal.kinds.indexOf('report') >= 0 &&
    rem.title === 'Max' && /Bankdrücken/.test(rem.body || '') && /\d/.test(rem.body || '') &&
    !/Zeit fürs Training/.test(rem.body || '') &&
    (normal.geplant || []).every(g => g.id >= 47000 && g.id <= 47999) &&
    normal.owns === true,
    JSON.stringify({ kinds: normal.kinds, rem: rem, ids: (normal.geplant || []).map(g => g.id) }).slice(0, 700));

  // ── 4) Tages- und Wochendeckel, wenn mehrere Ausloeser zusammenfallen ────
  // Fuenf Kandidaten, drei davon am selben Tag (Bestwert, Deload, Rueckblick).
  // "Normal" laesst EINEN pro Tag durch, "Eng" ZWEI — der Wochenbericht zaehlt
  // nicht mit.
  await boot();
  const eng = N(await ev(SYNC, { level: 'eng', pr: { ex: 'Bankdrücken', kg: 72.5 } }));
  const capsOk = await ev(() => window.CoachNotify.CAPS) || { normal:{week:0}, eng:{week:0} };
  check('Tages- und Wochendeckel greifen, wenn mehrere Ausloeser zusammenfallen: "Normal" laesst genau EINE Meldung am selben Tag durch, "Eng" ZWEI — und nie mehr als das Wochenbudget',
    normal.heute === 1 && eng.heute === 2 &&
    (eng.geplant || []).length > (normal.geplant || []).length &&
    (normal.geplant || []).filter(g => g.kind !== 'report').length <= capsOk.normal.week &&
    (eng.geplant || []).filter(g => g.kind !== 'report').length <= capsOk.eng.week,
    JSON.stringify({ normalHeute: normal.heute, engHeute: eng.heute,
                     normalKinds: normal.kinds, engKinds: eng.kinds }).slice(0, 600));

  // ── 5) Nachtfenster: eine Meldung um 23:30 rutscht auf den Morgen ────────
  await boot();
  const nacht = N(await ev(SYNC, { level: 'normal', notifTime: '23:30' }));
  const nRem = (nacht.geplant || []).filter(g => g.kind === 'reminderPlan')[0] || {};
  check('Nachtfenster: eine Erinnerung um 23:30 Ortszeit wird nicht nachts zugestellt, sondern auf 08:00 des Folgetages geschoben',
    nRem.std === 8 && nRem.at > 0 &&
    (nacht.geplant || []).every(g => g.std >= 7 && g.std < 22),
    JSON.stringify({ nRem: nRem, stunden: (nacht.geplant || []).map(g => g.kind + '@' + g.std) }).slice(0, 500));

  // ── 6) Laufendes Training: die richtigen Arten fallen aus ────────────────
  await boot();
  await ev(() => { window.isWorkoutActive = () => true; });
  r = N(await ev(SYNC, { level: 'normal', pr: { ex: 'Bankdrücken', kg: 72.5 } }));
  await ev(() => { window.isWorkoutActive = () => false; });
  check('Laufendes Training: Erinnerung und Deload fallen aus (niemand braucht mitten im Satz eine Ansage), die Gratulation zum frischen Bestwert bleibt',
    r && !r.__err && Array.isArray(r.kinds) &&
    r.kinds.indexOf('reminderPlan') < 0 && r.kinds.indexOf('deload') < 0 &&
    r.kinds.indexOf('prCongrats') >= 0,
    JSON.stringify(r && r.kinds ? { kinds: r.kinds } : r).slice(0, 500));

  // ── 7) Kein Emoji, kein Platzhalterrest — vier Toene, deutsch ────────────
  await boot();
  const toneDE = await ev(() => {
    const keys = ['reminderPlan', 'returnNudge', 'deload', 'anniversary', 'prCongrats', 'reportReady'];
    const vars = {
      reminderPlan: { ex: 'Bankdrücken', kg: 62.5, sets: 3, reps: 8 },
      returnNudge:  { days: 5 }, deload: {},
      anniversary:  { ex: 'Bankdrücken', kg: 50 },
      prCongrats:   { ex: 'Bankdrücken', kg: 70 },
      reportReady:  { vol: 12500 }
    };
    const out = [];
    S.aiCoach.name = 'Max 💪';
    ['ruhig', 'sachlich', 'hart', 'locker'].forEach(t => {
      S.aiCoach.tone = t;
      keys.forEach(k => out.push({ tone: t, key: k, txt: _cnText(k, vars[k]), title: _cnTitle() }));
    });
    S.aiCoach.tone = 'sachlich'; S.aiCoach.name = 'Max'; persist();
    return out;
  });
  const pruefeTexte = (liste) => {
    if (!Array.isArray(liste)) return { leer: ['keine Liste'], emoji: [], platz: [], doppelt: [] };
    return {
      leer:    liste.filter(x => !x.txt || x.txt.length < 8).map(x => x.tone + '/' + x.key),
      emoji:   liste.filter(x => PIKTO.test(x.txt) || PIKTO.test(x.title)).map(x => x.tone + '/' + x.key),
      platz:   liste.filter(x => PLATZ.test(x.txt)).map(x => x.tone + '/' + x.key + ': ' + x.txt),
      doppelt: liste.filter(x => /(kg|lbs)\s+(kg|lbs)/i.test(x.txt)).map(x => x.tone + '/' + x.key + ': ' + x.txt),
      titel:   liste.filter(x => !x.title || x.title.length < 1).length
    };
  };
  const de = pruefeTexte(toneDE);
  check('Deutsch, alle vier Toene, alle sechs Arten: jeder Text traegt Inhalt, KEIN Emoji (auch nicht im Titel aus dem Coach-Namen), KEIN Platzhalterrest, keine doppelte Einheit',
    Array.isArray(toneDE) && toneDE.length === 24 &&
    de.leer.length === 0 && de.emoji.length === 0 && de.platz.length === 0 && de.doppelt.length === 0 && de.titel === 0,
    JSON.stringify(de).slice(0, 700));

  // ── 8) Dasselbe auf Englisch ─────────────────────────────────────────────
  await page.evaluate(() => localStorage.setItem('gt_lang', 'en'));
  await boot();
  const toneEN = await ev(() => {
    const keys = ['reminderPlan', 'returnNudge', 'deload', 'anniversary', 'prCongrats', 'reportReady'];
    const vars = {
      reminderPlan: { ex: 'Bench press', kg: 62.5, sets: 3, reps: 8 },
      returnNudge:  { days: 5 }, deload: {},
      anniversary:  { ex: 'Bench press', kg: 50 },
      prCongrats:   { ex: 'Bench press', kg: 70 },
      reportReady:  { vol: 12500 }
    };
    const out = [];
    ['ruhig', 'sachlich', 'hart', 'locker'].forEach(t => {
      S.aiCoach.tone = t;
      keys.forEach(k => out.push({ tone: t, key: k, txt: _cnText(k, vars[k]), title: _cnTitle() }));
    });
    S.aiCoach.tone = 'sachlich'; persist();
    return { liste: out, lang: (typeof GT_LANG !== 'undefined' ? GT_LANG : '?') };
  });
  const en = pruefeTexte(toneEN && toneEN.liste);
  const deutschRest = ((toneEN && toneEN.liste) || [])
    .filter(x => /Sätze|Wiederholungen|Bestwert|Wochenbericht|Einheit|Tagen|Jahr /.test(x.txt || ''))
    .map(x => x.tone + '/' + x.key);
  check('Englisch, alle vier Toene: derselbe Riegel — Inhalt, kein Emoji, kein Platzhalterrest, keine doppelte Einheit, kein deutscher Rest',
    toneEN && toneEN.lang === 'en' && (toneEN.liste || []).length === 24 &&
    en.leer.length === 0 && en.emoji.length === 0 && en.platz.length === 0 &&
    en.doppelt.length === 0 && deutschRest.length === 0,
    JSON.stringify({ en, deutschRest, lang: toneEN && toneEN.lang }).slice(0, 700));
  await page.evaluate(() => localStorage.removeItem('gt_lang'));

  // ── 9) Ohne Premium wird nichts geplant ─────────────────────────────────
  await boot();
  r = await ev(async () => {
    window.isPremium = () => false;
    window.__cnReset(window.__cnPending);
    await _cnSync();
    const geplant = [].concat.apply([], window.__cn.schedule.map(s => s.notifications || []));
    const a = { eigeneGeplant: geplant.filter(n => Number(n.id) >= 47000 && Number(n.id) <= 47999).length,
                eigene: window.__cnOwn().length,
                owns: !!(S.coachPush && S.coachPush.owns) };
    window.isPremium = () => true;
    return a;
  });
  check('Ohne Premium meldet der Coach nicht: keine einzige Meldung im eigenen Nummernraum geplant, kein Termin im Bestand — die generische Erinnerung bleibt dem Free-Nutzer erhalten',
    r && r.eigeneGeplant === 0 && r.eigene === 0 && r.owns === false, JSON.stringify(r));

  // ── 10) Zeitzone wird durchgereicht (UTC+9 bekommt KEIN doppeltes Budget) ─
  await page.emulateTimezone('Asia/Tokyo');
  await boot();
  r = await ev(async () => {
    // planAll mitschreiben: kommt tzOffsetMin ueberhaupt an?
    const orig = window.CoachNotify.planAll;
    let ctx = null;
    window.CoachNotify.planAll = function (c) { ctx = c; return orig.apply(this, arguments); };
    window.__cnReset(window.__cnPending);
    await _cnSync();
    window.CoachNotify.planAll = orig;

    const tz = _cnTz();
    // Zwei Meldungen am SELBEN Ortstag, aber auf zwei UTC-Tagen: 08:00 und
    // 20:00 Ortszeit in Tokio liegen UTC-seitig vor bzw. nach Mitternacht.
    const d = new Date(window.__NOW);
    const a = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8, 0, 0).getTime();
    const b = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 20, 0, 0).getTime();
    const CN = window.CoachNotify;
    const nachA_tz = CN.record(CN.notifyNew(), 'prCongrats', a, tz);
    const nachA_0  = CN.record(CN.notifyNew(), 'prCongrats', a, 0);
    return {
      ctxTz: ctx ? ctx.tzOffsetMin : null,
      erwartet: -new Date().getTimezoneOffset(),
      tz: tz,
      tagGleichLokal: CN.dayKey(a, tz) === CN.dayKey(b, tz),
      tagGleichUTC:   CN.dayKey(a, 0)  === CN.dayKey(b, 0),
      mitTz:  CN.mayNotify(nachA_tz, 'deload', 'normal', b, tz),   // false = Deckel greift
      ohneTz: CN.mayNotify(nachA_0,  'deload', 'normal', b, 0)     // true  = doppeltes Budget
    };
  });
  check('Zeitzone wird durchgereicht: _cnSync uebergibt tzOffsetMin = -getTimezoneOffset() (Tokio: 540). Ohne den Wert bekaeme derselbe Ortstag zwei UTC-Tagesbudgets — mit ihm greift der Deckel',
    r && r.ctxTz === 540 && r.ctxTz === r.erwartet && r.tz === 540 &&
    r.tagGleichLokal === true && r.tagGleichUTC === false &&
    r.mitTz === false && r.ohneTz === true,
    JSON.stringify(r).slice(0, 500));
  await page.emulateTimezone('Europe/Berlin');

  // ── 11) Alte Planungen werden abbestellt statt sich zu haeufen ───────────
  await boot();
  r = await ev(async () => {
    window.__cnReset(window.__cnPending);
    await _cnSync();
    const ersterBestand = window.__cnOwn().map(n => Number(n.id)).sort((a, b) => a - b);
    await _cnSync();
    await _cnSync();
    const dritterBestand = window.__cnOwn().map(n => Number(n.id)).sort((a, b) => a - b);
    const abbestellt = [].concat.apply([], window.__cn.cancel.map(c => (c.notifications || []).map(n => Number(n.id))));
    return {
      ersterBestand, dritterBestand,
      gleich: JSON.stringify(ersterBestand) === JSON.stringify(dritterBestand),
      pausenTimerDa: window.__cnIds().indexOf(2500) >= 0,
      fremdAbbestellt: abbestellt.filter(i => !(i >= 47000 && i <= 47999) && !(i >= 1000 && i < 2000)),
      alleIds: window.__cnIds()
    };
  });
  check('Dreimal geplant, kein Zuwachs: die eigenen Termine werden abbestellt und mit stabilen ids neu gesetzt — der Pausen-Timer (2500) laeuft weiter und wird nie mit abgeraeumt',
    r && Array.isArray(r.ersterBestand) && r.ersterBestand.length >= 3 && r.gleich === true &&
    r.pausenTimerDa === true && Array.isArray(r.fremdAbbestellt) && r.fremdAbbestellt.length === 0,
    JSON.stringify(r).slice(0, 600));

  // ── 12) Die alte generische Erinnerung laeuft nicht doppelt mit ──────────
  await boot();
  r = await ev(async () => {
    window.__cnReset([{ id: 2500 }, { id: 1000 }, { id: 1001 }]);
    S.aiCoach.pushLevel = 'normal'; persist();
    await _cnSync();
    const nachUebernahme = { ids: window.__cnIds(), owns: !!(S.coachPush && S.coachPush.owns) };
    S.aiCoach.pushLevel = 'still'; persist();
    await _cnSync();
    const nachRueckgabe = { ids: window.__cnIds(), owns: !!(S.coachPush && S.coachPush.owns) };
    return { nachUebernahme, nachRueckgabe };
  });
  const generisch = (ids) => (ids || []).filter(i => i >= 1000 && i < 2000).length;
  check('Uebernimmt der Coach die Erinnerung, wird die alte generische Planung (1000-1999) entfernt — schaltet der Nutzer auf "Still", holt sie sich ihren Platz zurueck',
    r && r.nachUebernahme && r.nachUebernahme.owns === true &&
    generisch(r.nachUebernahme.ids) === 0 &&
    r.nachRueckgabe.owns === false && generisch(r.nachRueckgabe.ids) > 0 &&
    (r.nachRueckgabe.ids || []).indexOf(2500) >= 0,
    JSON.stringify(r).slice(0, 600));

  // ── 13) Berechtigung: Ablehnen springt zurueck, KEIN Fehler ──────────────
  await boot();
  await ev(() => {
    S.aiCoach.pushLevel = 'still'; S.aiCoach.preset = 'quiet'; persist();
    window.__cn.perm = 'prompt'; window.__cn.permOnRequest = 'denied';
    window.__cnReset(window.__cnPending);
    openCoachHub('scope');
  });
  await wait(500);
  const auf1 = await ev(() => {
    const s = document.querySelector('#ch-card-scope details > summary');
    if (s) { s.id = 'cn-sum'; return true; }
    return false;
  });
  if (auf1 === true) await page.click('#cn-sum');
  await wait(300);
  const markiert = await ev(l => {
    const b = [...document.querySelectorAll('#ch-card-scope .pwz-chip')]
      .find(x => /pushLevel/.test(x.getAttribute('onclick') || '') && x.textContent.trim() === l);
    if (!b) return false;
    b.id = 'cn-chip'; return true;
  }, 'Normal');
  if (markiert === true) await page.click('#cn-chip');
  await wait(900);
  const abgelehnt = await ev(() => ({
    stufe: _persona().pushLevel,
    gefragt: window.__cn.reqs,
    hinweis: (document.getElementById('update-toast') || {}).textContent || '',
    sichtbar: !!(document.getElementById('update-toast') || {}).classList &&
              document.getElementById('update-toast').classList.contains('show'),
    geplant: window.__cn.schedule.length
  }));
  check('Push-Stufe "Still" -> "Normal" fragt die Berechtigung. Wird sie abgelehnt, springt die Auswahl zurueck auf "Still", ein ruhiger Hinweis erscheint — und es ist KEIN Fehler',
    markiert === true && abgelehnt.gefragt >= 1 && abgelehnt.stufe === 'still' &&
    /Mitteilungen|notifications/i.test(abgelehnt.hinweis || '') && abgelehnt.sichtbar === true,
    JSON.stringify({ markiert, abgelehnt }).slice(0, 600));

  // ── 14) Berechtigung: Annehmen plant sofort ─────────────────────────────
  await ev(() => { window.__cn.perm = 'prompt'; window.__cn.permOnRequest = 'granted'; window.__cnReset(window.__cnPending); });
  const markiert2 = await ev(l => {
    const b = [...document.querySelectorAll('#ch-card-scope .pwz-chip')]
      .find(x => /pushLevel/.test(x.getAttribute('onclick') || '') && x.textContent.trim() === l);
    if (!b) return false;
    b.id = 'cn-chip2'; return true;
  }, 'Eng');
  if (markiert2 === true) await page.click('#cn-chip2');
  await wait(1200);
  const angenommen = await ev(() => ({
    stufe: _persona().pushLevel,
    eigene: window.__cnOwn().map(n => Number(n.id)),
    titel: window.__cnOwn().map(n => n.title),
    kanal: (window.__cn.channels || []).map(c => c.id)
  }));
  check('Berechtigung angenommen: die neue Stufe gilt sofort — Termine im eigenen Nummernraum, Titel ist der Coach-Name, Kanal ist der BESTEHENDE gymtrack-reminders',
    markiert2 === true && angenommen.stufe === 'eng' &&
    (angenommen.eigene || []).length >= 3 &&
    (angenommen.eigene || []).every(i => i >= 47000 && i <= 47999) &&
    (angenommen.titel || []).every(t => t === 'Max') &&
    (angenommen.kanal || []).indexOf('gymtrack-reminders') >= 0,
    JSON.stringify(angenommen).slice(0, 600));

  // ── 15) App-Start verschiebt den Rueckkehr-Anstoss ───────────────────────
  await boot();
  r = await ev(async () => {
    // Nur EINE Einheit, 30 Tage her: der Termin "letzte Einheit + 5 Tage" ist
    // laengst verstrichen. Wer die App oeffnet, verschiebt ihn nach vorn.
    const NOW = window.__NOW;
    S.sessions = [S.sessions[0]];
    S.sessions[0].date = new Date(NOW - 30 * 864e5).toISOString();
    S.coachPush = { state: null, plan: [], permOk: false, owns: false };
    persist();
    window.__cnReset(window.__cnPending);
    await _cnSync();
    const rn = ((S.coachPush || {}).plan || []).filter(p => p.kind === 'returnNudge')[0] || null;
    const body = [].concat.apply([], window.__cn.schedule.map(s => s.notifications || []))
      .filter(n => n.extra && n.extra.coachKind === 'returnNudge').map(n => n.body)[0] || '';
    // Der Termin liegt fuenf Tage ab JETZT (verschoben), im Text steht die Zahl
    // der Tage, die dann seit der letzten Einheit vergangen sein werden — hier
    // 30 + 5 = 35. Beides muss stimmen: der Termin UND die Zahl im Satz.
    const seit = new Date(S.sessions[0].date).getTime();
    return { rn: rn, tage: rn ? Math.round((rn.at - NOW) / 864e5) : null,
             imSatz: rn ? Math.max(1, Math.round((rn.at - seit) / 864e5)) : null, body: body };
  });
  const initRuft = (() => {
    try {
      const html = fs.readFileSync(SRC, 'utf8');
      const i = html.indexOf('BENACHRICHTIGUNGEN INITIALISIEREN');
      return i > 0 && html.slice(i, i + 1400).indexOf('_cnSync()') > 0;
    } catch (_) { return false; }
  })();
  check('App-Start ruft _cnSync() und verschiebt damit den Rueckkehr-Anstoss: der laengst verstrichene Termin wird auf fuenf Tage ab jetzt gesetzt, und {days} nennt die Zahl der Tage, die DANN seit der letzten Einheit vergangen sind',
    initRuft === true && r && r.rn && r.tage === 5 && r.imSatz === 35 &&
    new RegExp('\\b' + r.imSatz + '\\b').test(r.body || '') && !PLATZ.test(r.body || ''),
    JSON.stringify({ initRuft, r }).slice(0, 600));

  // ── 16) finishWk plant die Gratulation zum frischen Bestwert ─────────────
  await boot();
  r = await ev(async () => {
    window.__cnReset(window.__cnPending);
    S.aiCoach.pushLevel = 'eng'; persist();
    wkExIds = ['ex0'];
    startActive(); openOv('ov-wk');
    // Zweiter voller Scan ueber S.sessions x logs x sets beim Trainingsende:
    // detectPRs() lief zweimal, obwohl das Ergebnis des ersten Laufs eine
    // Handvoll Zeilen weiter oben in Reichweite liegt.
    const echt = window.detectPRs;
    let ruft = 0;
    window.detectPRs = function () { ruft++; return echt.apply(this, arguments); };
    // Deutlich ueber dem bisherigen Bestwert (70) -> echter Gewichts-PR.
    wkLogs[0].sets[0].w = '85'; wkLogs[0].sets[0].r = '8'; toggleSetDone(0, 0);
    finishWk();
    await new Promise(res => setTimeout(res, 900));
    window.detectPRs = echt;
    const geplant = [].concat.apply([], window.__cn.schedule.map(s => s.notifications || []))
      .filter(n => Number(n.id) >= 47000 && Number(n.id) <= 47999);
    return {
      kinds: geplant.map(n => n.extra && n.extra.coachKind),
      detect: ruft,
      pr: geplant.filter(n => n.extra && n.extra.coachKind === 'prCongrats')
                 .map(n => ({ title: n.title, body: n.body }))[0] || null
    };
  });
  check('Ende von finishWk(): der Brief verlangt DREI Dinge — die Gratulation zum frischen Bestwert (mit Uebungsname und Kilozahl), die NEUE Trainings-Erinnerung und die Deload-Pruefung. Alle drei stehen im Plan',
    r && Array.isArray(r.kinds) && r.kinds.indexOf('prCongrats') >= 0 &&
    r.kinds.indexOf('reminderPlan') >= 0 && r.kinds.indexOf('deload') >= 0 &&
    r.pr && r.pr.title === 'Max' && /Bankdrücken/.test(r.pr.body || '') &&
    /85/.test(r.pr.body || '') && !PLATZ.test(r.pr.body || '') && !PIKTO.test(r.pr.body || '') &&
    r.detect === 1,
    JSON.stringify(r).slice(0, 600));

  /* ── 17) C1: der sichtbare Schalter wirkt auch auf den Coach ─────────────
     Einstellungen -> "Benachrichtigungen -> Trainings-Erinnerungen" AUS. Der
     Untertitel verspricht genau eine Sache ("Erinnert dich an geplante
     Trainings"). Wer sie abbestellt, darf sie nicht mit anderem Absender
     zurueckbekommen. Die uebrigen Arten haengen NICHT an diesem Schalter — sie
     gehoeren den Push-Chips im Hub. */
  await boot();
  r = N(await ev(async () => {
    S.notifEnabled = false;
    S.aiCoach.pushLevel = 'normal';
    persist();
    window.__cnReset([{ id: 2500 }]);
    await _cnSync();
    const lokalTag = (ts) => { const d = new Date(ts); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
    const geplant = [];
    window.__cn.schedule.forEach(s => (s.notifications || [])
      .filter(n => Number(n.id) >= 47000 && Number(n.id) <= 47999)
      .forEach(n => geplant.push({ kind: n.extra && n.extra.coachKind, body: n.body })));
    return {
      geplant: geplant, kinds: geplant.map(g => g.kind),
      owns: !!(S.coachPush && S.coachPush.owns),
      ownsRe: _cnOwnsReminder(),
      generisch: window.__cnIds().filter(i => i >= 1000 && i < 2000).length,
      pausenTimer: window.__cnIds().indexOf(2500) >= 0,
      lokalTag: lokalTag(window.__NOW)
    };
  }));
  check('C1 — "Trainings-Erinnerungen" AUS: der Coach plant KEINE Trainings-Erinnerung mehr (kein reminderPlan, owns=false, auch keine generische) — die uebrigen Arten haengen an den Push-Chips im Hub und bleiben; der Pausen-Timer laeuft weiter',
    r && !r.fehler && Array.isArray(r.kinds) &&
    r.kinds.indexOf('reminderPlan') < 0 && r.owns === false && r.ownsRe === false &&
    r.generisch === 0 && r.pausenTimer === true &&
    r.kinds.indexOf('report') >= 0 && r.kinds.indexOf('returnNudge') >= 0,
    JSON.stringify({ kinds: r.kinds, owns: r.owns, generisch: r.generisch, pausenTimer: r.pausenTimer, fehler: r.fehler }).slice(0, 500));

  /* ── 18) C2: im Auslieferungszustand gibt es einen Weg zur Berechtigung ───
     Premium-Nutzer, Standard-pushLevel 'normal', Berechtigung nie erteilt,
     Push-Chips nie angefasst. Der App-Start darf NICHT fragen (iOS zeigt den
     Dialog einmal pro Installation; eine Ablehnung dort ist dauerhaft) — aber
     es muss einen Weg geben, auf dem der Nutzer sie erteilt. */
  await page.evaluate(() => {
    localStorage.setItem('__cnPerm', 'prompt');
    localStorage.setItem('__cnPermOnRequest', 'granted');
    localStorage.setItem('gt_premiumDev', '1');   // Premium schon beim ERSTEN Skript
  });
  await boot();
  const startZustand = await ev(() => ({
    reqs: window.__cn.reqs, checks: window.__cn.checks,
    perm: window.__cn.perm, permOk: !!((S.coachPush || {}).permOk),
    stufe: _persona().pushLevel
  }));
  await ev(() => {
    S.aiCoach.pushLevel = 'normal'; S.aiCoach.preset = 'balanced'; persist();
    window.__cnReset(window.__cnPending);
    openCoachHub('scope');
  });
  await wait(600);
  const ctaDa = await ev(() => {
    const b = [...document.querySelectorAll('#ch-card-scope button')]
      .find(x => /coachHubAskPerm/.test(x.getAttribute('onclick') || ''));
    if (!b) return false;
    b.id = 'cn-perm-cta';
    return { txt: (b.textContent || '').trim().slice(0, 160) };
  });
  if (ctaDa && ctaDa.txt) await page.click('#cn-perm-cta');
  await wait(1400);
  const nachCta = await ev(() => ({
    reqs: window.__cn.reqs,
    permOk: !!((S.coachPush || {}).permOk),
    eigene: window.__cnOwn().length,
    ctaWeg: ![...document.querySelectorAll('#ch-card-scope button')]
      .some(x => /coachHubAskPerm/.test(x.getAttribute('onclick') || ''))
  }));
  check('C2 — Auslieferungszustand (Premium, pushLevel "normal", Berechtigung nie erteilt): der App-Start fragt NICHT (kein ungefragter Systemdialog, dessen Ablehnung dauerhaft waere), aber der Coach-Hub bietet den Weg an. Ein Tipp fragt, danach steht die Berechtigung und die Termine sind geplant',
    startZustand && startZustand.reqs === 0 && startZustand.permOk === false &&
    ctaDa && ctaDa.txt && ctaDa.txt.length > 5 &&
    nachCta.reqs === 1 && nachCta.permOk === true && nachCta.eigene >= 3 && nachCta.ctaWeg === true,
    JSON.stringify({ startZustand, ctaDa, nachCta }).slice(0, 700));

  /* ── 19) I1: ohne Premium wird der einmalige Systemdialog NICHT verbrannt ── */
  await page.evaluate(() => { localStorage.removeItem('gt_premiumDev'); localStorage.setItem('__cnPermOnRequest', 'denied'); });
  await boot();
  r = await ev(async () => {
    window.isPremium = () => false;
    S.aiCoach.pushLevel = 'still'; S.aiCoach.preset = 'quiet'; persist();
    window.__cn.perm = 'prompt'; window.__cn.permOnRequest = 'denied';
    window.__cnReset(window.__cnPending);
    setAiCoachOpt('pushLevel', 'normal');
    await new Promise(res => setTimeout(res, 900));
    const a = { reqs: window.__cn.reqs, stufe: _persona().pushLevel,
                eigene: window.__cnOwn().length, perm: window.__cn.perm };
    window.isPremium = () => true;
    return a;
  });
  check('I1 — Gratis-Nutzer, "Still" -> "Normal": KEIN Systemdialog fuer eine Funktion, die er nicht hat (iOS fragt einmal pro Installation; eine Ablehnung hier waere nach einem spaeteren Kauf verbrannt). Die Stufe bleibt stehen, geplant wird trotzdem nichts',
    r && !r.__err && r.reqs === 0 && r.stufe === 'normal' && r.eigene === 0 && r.perm === 'prompt',
    JSON.stringify(r).slice(0, 400));
  await page.evaluate(() => { localStorage.removeItem('__cnPerm'); localStorage.removeItem('__cnPermOnRequest'); });

  /* ── 20) I2: faellt das Modul aus, wird die Erinnerung ZURUECKGEGEBEN ───── */
  await boot();
  r = await ev(async () => {
    S.aiCoach.pushLevel = 'normal'; persist();
    window.__cnReset([{ id: 2500 }, { id: 1000 }, { id: 1001 }]);
    await _cnSync();
    const vorher = { owns: !!((S.coachPush || {}).owns), eigene: window.__cnOwn().length,
                     generisch: window.__cnIds().filter(i => i >= 1000 && i < 2000).length };
    // Cache-Miss, Teil-Update, Parse-Fehler: das Modul ist einfach weg.
    const M = window.CoachNotify;
    try { delete window.CoachNotify; } catch (_) { window.CoachNotify = undefined; }
    window.__cn.schedule = []; window.__cn.cancel = [];
    await _cnSync();
    const nachher = { owns: !!((S.coachPush || {}).owns), ownsRe: _cnOwnsReminder(),
                      eigene: window.__cnOwn().length,
                      generisch: window.__cnIds().filter(i => i >= 1000 && i < 2000).length,
                      pausenTimer: window.__cnIds().indexOf(2500) >= 0 };
    window.CoachNotify = M;
    return { vorher, nachher };
  });
  check('I2 — faellt js/coach-notify.js aus (Cache-Miss, Teil-Update, Parse-Fehler), gibt der Coach die Erinnerung fail-closed ZURUECK: owns wird false, die eigenen Waisen sind weg, die generische Erinnerung kommt wieder — statt kein Coach-Termin UND keine generische Erinnerung',
    r && !r.__err && r.vorher.owns === true && r.vorher.generisch === 0 && r.vorher.eigene >= 3 &&
    r.nachher.owns === false && r.nachher.ownsRe === false && r.nachher.eigene === 0 &&
    r.nachher.generisch > 0 && r.nachher.pausenTimer === true,
    JSON.stringify(r).slice(0, 600));

  /* ── 21) I3: lbs-Nutzer sehen lbs, in allen vier Toenen und allen Arten ── */
  await boot();
  const lbs = await ev(() => {
    S.unitMode = 'lbs'; persist();
    const keys = ['reminderPlan', 'returnNudge', 'deload', 'anniversary', 'prCongrats', 'reportReady'];
    const vars = {
      reminderPlan: { ex: 'Bankdrücken', kg: 62.5, sets: 3, reps: 8 },
      returnNudge:  { days: 5 }, deload: {},
      anniversary:  { ex: 'Bankdrücken', kg: 50 },
      prCongrats:   { ex: 'Bankdrücken', kg: 70 },
      reportReady:  { vol: 12500 }
    };
    const out = [];
    ['ruhig', 'sachlich', 'hart', 'locker'].forEach(t => {
      S.aiCoach.tone = t;
      keys.forEach(k => out.push({ tone: t, key: k, txt: _cnText(k, vars[k]) }));
    });
    S.unitMode = 'kg'; S.aiCoach.tone = 'sachlich'; persist();
    return out;
  });
  const MIT_GEWICHT = ['reminderPlan', 'anniversary', 'prCongrats', 'reportReady'];
  const kgRest = (Array.isArray(lbs) ? lbs : [])
    .filter(x => /\b(kg|kilo|kilos)\b/i.test(x.txt || '')).map(x => x.tone + '/' + x.key + ': ' + x.txt);
  const ohneLbs = (Array.isArray(lbs) ? lbs : [])
    .filter(x => MIT_GEWICHT.indexOf(x.key) >= 0 && !/lbs/.test(x.txt || '')).map(x => x.tone + '/' + x.key + ': ' + x.txt);
  check('I3 — S.unitMode="lbs": JEDE Meldungsart mit Gewicht traegt lbs, nirgends steht kg oder Kilo daneben. Die Einheit haengt am WERT, nicht am Satzkatalog — sonst stuenden zwei Einheiten in derselben Meldereihe',
    Array.isArray(lbs) && lbs.length === 24 && kgRest.length === 0 && ohneLbs.length === 0,
    JSON.stringify({ kgRest: kgRest.slice(0, 6), ohneLbs: ohneLbs.slice(0, 6) }).slice(0, 700));

  /* ── 22) I4: zwei ueberlappende Laeufe hinterlassen keinen Mischzustand ─── */
  await boot();
  r = await ev(async () => {
    S.aiCoach.pushLevel = 'normal'; persist();
    S.coachPush = { state: null, plan: [], permOk: true, owns: false }; persist();
    window.__cnReset([{ id: 2500 }, { id: 1000 }, { id: 1001 }]);
    // Training endet weniger als 1,2 s nach dem App-Start; oder "Normal" und
    // sofort "Eng". Beide Laeufe lesen S.coachPush.plan, bevor einer schreibt.
    await Promise.all([_cnSync(), _cnSync(), _cnSync({ pr: { ex: 'Bankdrücken', kg: 72.5 } })]);
    const eigene = window.__cnOwn();
    const bestandIds = eigene.map(n => Number(n.id)).sort((a, b) => a - b);
    const planIds = (((S.coachPush || {}).plan) || []).map(p => _cnIdFor(p.id)).sort((a, b) => a - b);
    return {
      bestandIds: bestandIds, planIds: planIds,
      dubletten: bestandIds.length !== new Set(bestandIds).size,
      owns: !!((S.coachPush || {}).owns),
      remImBestand: eigene.some(n => n.extra && n.extra.coachKind === 'reminderPlan'),
      generisch: window.__cnIds().filter(i => i >= 1000 && i < 2000).length
    };
  });
  check('I4 — drei ueberlappende _cnSync()-Laeufe: der Bestand deckt sich exakt mit dem gemerkten Plan, keine Dublette, und owns beschreibt den Bestand. Sonst stuenden 47xxx-Termine bei owns=false — die generische Erinnerung kaeme zurueck und zum selben Termin lieferten ZWEI Meldungen',
    r && !r.__err && r.dubletten === false &&
    JSON.stringify(r.bestandIds) === JSON.stringify(r.planIds) &&
    r.remImBestand === true && r.owns === true && r.generisch === 0,
    JSON.stringify(r).slice(0, 700));

  /* ── 23) Mutation 1: record() bucht in der ORTSZEIT, nicht in UTC ─────────
     Check 10 belegt nur die planAll-Uebergabestelle. Der echte Fehler sitzt an
     der Fortschreibung der ZUGESTELLTEN Termine: in Tokio faellt eine um 08:00
     Ortszeit zugestellte Meldung auf den UTC-Vortag, die Tagesschluessel
     treffen sich nie und der Nutzer bekommt ein doppeltes Tagesbudget. */
  await page.emulateTimezone('Asia/Tokyo');
  await boot();
  r = await ev(async () => {
    const NOW = window.__NOW;
    const d = new Date(NOW);
    // 08:00 Ortszeit heute — in Tokio ist das UTC-seitig der Vortag, 23:00.
    const acht = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8, 0, 0).getTime();
    S.aiCoach.pushLevel = 'normal';
    S.coachPush = { state: window.CoachNotify.notifyNew(),
                    plan: [{ id: 'prCongrats:x', at: acht, kind: 'prCongrats' }],
                    permOk: true, owns: false };
    persist();
    window.__cnReset(window.__cnPending);
    await _cnSync();
    const st = (S.coachPush || {}).state || {};
    return { tz: _cnTz(), dayKey: st.dayKey, weekKey: st.weekKey, dayCount: st.dayCount,
             lokal: window.CoachNotify.dayKey(acht, 540),
             utc:   window.CoachNotify.dayKey(acht, 0) };
  });
  check('Mutation 1 — record() bucht den ZUGESTELLTEN Termin unter dem Ortstag: in Tokio liegt 08:00 Ortszeit UTC-seitig am Vortag. Ohne die Zeitzone traefen sich die Tagesschluessel nie und der Nutzer bekaeme das doppelte Tagesbudget',
    r && !r.__err && r.tz === 540 && r.dayCount === 1 &&
    r.lokal !== r.utc && r.dayKey === r.lokal,
    JSON.stringify(r).slice(0, 500));
  await page.emulateTimezone('Europe/Berlin');

  /* ── 24) Mutationen 2 und 4: nach einer Zustellung ist das Budget weg ───── */
  await boot();
  r = await ev(async () => {
    const NOW = window.__NOW;
    const tag = (ts) => { const d = new Date(ts); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
    S.aiCoach.pushLevel = 'normal'; persist();
    S.coachPush = { state: null, plan: [], permOk: true, owns: false }; persist();
    window.__cnReset(window.__cnPending);
    await _cnSync();
    const ersterPlan = (((S.coachPush || {}).plan) || []).slice();
    const heute = ersterPlan.filter(p => tag(p.at) === tag(NOW));
    // Der heutige Termin gilt jetzt als ZUGESTELLT.
    S.coachPush.plan = ersterPlan.map(p => (tag(p.at) === tag(NOW)) ? Object.assign({}, p, { at: NOW - 1000 }) : p);
    persist();
    window.__cnReset(window.__cnPending);
    await _cnSync();
    const geplant = [].concat.apply([], window.__cn.schedule.map(s => s.notifications || []))
      .filter(n => Number(n.id) >= 47000 && Number(n.id) <= 47999);
    const st = (S.coachPush || {}).state || {};
    return {
      zugestellt: heute.map(p => p.kind),
      heuteDanach: geplant.filter(n => tag(new Date(n.schedule.at).getTime()) === tag(NOW))
                          .map(n => n.extra && n.extra.coachKind),
      dayCount: st.dayCount, dayKey: st.dayKey, erwarteterTag: window.CoachNotify.dayKey(NOW - 1000, _cnTz())
    };
  });
  check('Mutationen 2 und 4 — zweimal planen NACH einer Zustellung: der zugestellte Termin steht im Zustand und verbraucht das Tagesbudget. Der zweite Lauf plant fuer heute nichts mehr. Ohne das begaenne das Budget bei jedem App-Oeffnen von vorn',
    r && !r.__err && Array.isArray(r.zugestellt) && r.zugestellt.length === 1 &&
    Array.isArray(r.heuteDanach) && r.heuteDanach.length === 0 &&
    r.dayCount === 1 && r.dayKey === r.erwarteterTag,
    JSON.stringify(r).slice(0, 600));

  /* ── 25) Mutation 3: das Abbestellen laesst keine eigenen Waisen stehen ─── */
  await boot();
  r = await ev(async () => {
    S.aiCoach.pushLevel = 'normal'; persist();
    S.coachPush = { state: null, plan: [], permOk: true, owns: false }; persist();
    window.__cnReset([{ id: 2500 }, { id: 1000 }]);
    await _cnSync();
    const vorher = window.__cnOwn().map(n => ({ id: Number(n.id), kind: n.extra && n.extra.coachKind }));
    S.aiCoach.pushLevel = 'still'; persist();
    await _cnSync();
    const nachher = window.__cnOwn().map(n => ({ id: Number(n.id), kind: n.extra && n.extra.coachKind }));
    const berichtIds = nachher.filter(n => n.kind === 'report').map(n => n.id);
    return {
      vorher: vorher, nachher: nachher,
      waisen: nachher.filter(n => n.kind !== 'report').map(n => n.kind + '#' + n.id),
      dubletten: berichtIds.length !== new Set(berichtIds).size,
      pausenTimer: window.__cnIds().indexOf(2500) >= 0
    };
  });
  check('Mutation 3 — nach dem Wechsel auf "Still" steht im eigenen Nummernraum NUR noch der Wochenbericht: die abbestellten 47xxx-Waisen sind wirklich weg (das Doppel haengt an, statt zu ersetzen — ein fehlender cancel schlaegt jetzt durch)',
    r && !r.__err && Array.isArray(r.vorher) && r.vorher.length >= 3 &&
    Array.isArray(r.nachher) && r.nachher.length === 1 && r.nachher[0].kind === 'report' &&
    r.waisen.length === 0 && r.dubletten === false && r.pausenTimer === true,
    JSON.stringify(r).slice(0, 700));

  await browser.close();
  server.close();

  // ── 26) Statisch: kein save(), kein Netz, keine dritte Wochenrechnung ────
  try {
    const src = fs.readFileSync(SRC, 'utf8');
    let a = src.indexOf('PROAKTIVE MELDUNGEN (Task 19');
    // Der Marker steht INNERHALB eines Blockkommentars. Ohne den Sprung an
    // dessen Anfang bliebe das oeffnende /* ausserhalb des Ausschnitts, und
    // ohneKommentar() liesse den Kommentartext stehen — der save()-Riegel
    // schluege dann an der Erklaerung an, WARUM save() verboten ist.
    if (a > 0) { const k = src.lastIndexOf('/*', a); if (k > 0) a = k; }
    const b = src.indexOf('// ── HELPERS ──', a > 0 ? a : 0);
    const block = a > 0 && b > a ? src.slice(a, b) : '';
    const code = ohneKommentar(block);
    check('Statisch: der Task-19-Block nutzt persist() und nirgends save(); kein fetch/AI_WORKER_URL; die Wochenrechnung kommt aus CoachAnalyze.isoWeekKey, nicht aus getWeekKey(); jeder Einstiegspunkt in try/catch',
      block.length > 4000 && !/[^a-zA-Z_$.]save\s*\(/.test(code) &&
      /persist\(\)/.test(code) &&
      !/fetch\s*\(|AI_WORKER_URL|XMLHttpRequest/.test(code) &&
      /CoachAnalyze\.isoWeekKey/.test(code) && !/getWeekKey/.test(code) &&
      (code.match(/catch\s*\(/g) || []).length >= 18,
      JSON.stringify({ len: block.length, save: /[^a-zA-Z_$.]save\s*\(/.test(code),
                       netz: /fetch\s*\(/.test(code), iso: /CoachAnalyze\.isoWeekKey/.test(code),
                       alt: /getWeekKey/.test(code),
                       catches: (code.match(/catch\s*\(/g) || []).length }).slice(0, 600));
  } catch (e) { check('Statisch: kein save(), kein Netz, keine dritte Wochenrechnung', false, String(e.message)); }

  // ── 27) Statisch: kein Emoji, eigener Nummernraum, S.coachPush bleibt lokal ─
  try {
    const src = fs.readFileSync(SRC, 'utf8');
    let a = src.indexOf('PROAKTIVE MELDUNGEN (Task 19');
    // Der Marker steht INNERHALB eines Blockkommentars. Ohne den Sprung an
    // dessen Anfang bliebe das oeffnende /* ausserhalb des Ausschnitts, und
    // ohneKommentar() liesse den Kommentartext stehen — der save()-Riegel
    // schluege dann an der Erklaerung an, WARUM save() verboten ist.
    if (a > 0) { const k = src.lastIndexOf('/*', a); if (k > 0) a = k; }
    const b = src.indexOf('// ── HELPERS ──', a > 0 ? a : 0);
    const block = a > 0 && b > a ? src.slice(a, b) : '';
    // Alle anderen Notification-ids der App muessen AUSSERHALB 47000-47999 liegen.
    const fremdeIds = (src.match(/\bid:\s*(\d{3,6})/g) || [])
      .map(m => parseInt(m.replace(/\D/g, ''), 10))
      .filter(i => i >= 47000 && i <= 47999);
    /* Cloud-Payload: coachPush darf dort nicht auftauchen. Gelesen wird der
       CODE ohne Kommentare — seit der Abschluss-Review von Block 5 steht im
       Payload das Feld aiCoach (die Persona), und der Kommentar daneben zaehlt
       ausdruecklich auf, was NICHT mitgeht: coachSession, coachPush,
       coachReports. Ohne den Filter schluege die Pruefung an genau der
       Erklaerung an, warum coachPush lokal bleibt. */
    const codeAll = ohneKommentar(src);
    const i0 = codeAll.indexOf('_serverTime: window.FB.serverTimestamp()');
    const payload = i0 > 0 ? codeAll.slice(Math.max(0, i0 - 3000), i0) : '';
    check('Statisch: kein Emoji im Task-19-Block, keine fremde Notification-id im Nummernraum 47000-47999, und S.coachPush steht NICHT im Cloud-Payload (rein lokal)',
      block.length > 4000 && !PIKTO.test(block) &&
      fremdeIds.length === 0 && payload.length > 500 && payload.indexOf('coachPush') < 0,
      JSON.stringify({ emoji: PIKTO.test(block), fremdeIds: fremdeIds,
                       payloadHatCoachPush: payload.indexOf('coachPush') >= 0 }).slice(0, 400));
  } catch (e) { check('Statisch: kein Emoji, eigener Nummernraum, coachPush lokal', false, String(e.message)); }

  console.log('\n-- Task 19 — Meldungen planen und ausliefern (Chromium statt Simulator) --');
  console.log('   Baum: ' + ROOT);
  let fail = 0;
  for (const t of results) {
    console.log((t.ok ? 'PASS  ' : 'FAIL  ') + t.name);
    if (!t.ok) { fail++; console.log('        got: ' + t.got); }
  }
  const relevant = errors.filter(e => !/favicon|firebase|gstatic|net::ERR|Failed to load resource|Tracking Prevention|ERR_INTERNET_DISCONNECTED/i.test(e));
  console.log('\nSeitenfehler (gefiltert): ' + (relevant.length ? '\n  ' + relevant.join('\n  ') : 'keine'));
  console.log(`\nErgebnis: ${results.length - fail}/${results.length} PASS`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS-FEHLER: ' + e.message + '\n' + (e && e.stack)); try { server.close(); } catch (_) {} process.exit(2); });
