/* Task-17-Verifikation ohne iOS-Simulator (Windows, kein Xcode).
   Jeder Punkt der Pruefliste aus task-17-brief.md ist EIN Check, dazu die
   bindenden Punkte aus der Modul-Review (kein force ausserhalb sessionEnd,
   Zustand ueberlebt den Reload, step/barKg aus den Geraeteeinstellungen).
   Statischer Node-Server + Chromium ueber Puppeteer. Tipps laufen ueber echte
   Zeigerfolgen (ElementHandle.click), nicht ueber synthetisches .click().
   Eigener Port: 8795 (task-9 haelt 8793, task-10 haelt 8794).

   Aufruf:
     node task-17-check.js              gegen den Arbeitsstand
     node task-17-check.js --root=<dir> gegen einen anderen Baum (Rot-Lauf
                                        gegen den Stand VOR der Aenderung)      */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('C:/Users/Anwender/Desktop/Claude/gymtrack/node_modules/puppeteer');

const REPO = 'C:/Users/Anwender/Desktop/Claude/gymtrack';
const argRoot = (process.argv.find(a => a.startsWith('--root=')) || '').slice(7);
const ROOT = argRoot ? path.resolve(argRoot) : REPO;
const SRC  = path.join(ROOT, 'index.html');
const SHOT = path.join(REPO, '.superpowers/sdd/2026-07-29-live-coach-plan-v2/task-17-training.png');
const PORT = 8795;
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

// Der CACHE-Name von sw.js zum Zeitpunkt des Laufs: der Versions-Bump ist ein
// eigener Ritualschritt NACH dieser Task, diese Welle darf ihn nicht anfassen.
const SW_CACHE_VORHER = (function () {
  try { return (fs.readFileSync(path.join(REPO, 'sw.js'), 'utf8')
    .match(/const CACHE\s*=\s*['"]([^'"]+)['"]/) || [])[1] || null; } catch (_) { return null; }
})();

// Kommentare entfernen (Blockkommentare und Zeilenreste). Der Doppelpunkt-Riegel
// laesst 'https://' stehen. Gebraucht von den statischen Checks: sie pruefen den
// CODE des Task-17-Blocks, nicht die Kommentare darin — sonst schlaegt der
// save()-Riegel schon an der Erklaerung an, WARUM save() verboten ist.
const ohneKommentar = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const results = [];
const check = (name, cond, got) => results.push({ name, ok: !!cond, got });
const wait = ms => new Promise(r => setTimeout(r, ms));

/* Grundzustand: Premium an, Anmelde-Wand weg, sechs Uebungen und genug Verlauf,
   damit Begruessung (lastSame), Aufwaermschema (Arbeitsgewicht), Plateau
   (Wochenverlauf) und Zeitbudget (Dauer der letzten Einheiten) ueberhaupt
   Material haben. Ohne Verlauf bliebe der halbe Bogen stumm und der Lauf waere
   gruen aus dem falschen Grund.
   Der Erzaehlbogen wird ausserdem beobachtbar gemacht: __csSaid sammelt jede
   Aeusserung, die _csEmit() TATSAECHLICH auf die Leiste schreibt, __barSaid
   jede Zeile der Leiste ueberhaupt (inklusive der aelteren Mikro-Reaktion). */
const BOOTSTATE = () => {
  window.isPremium = () => true;
  const gate = document.getElementById('auth-gate'); if (gate) gate.style.display = 'none';
  const NAMEN = ['Bankdrücken', 'Kniebeugen', 'Kreuzheben', 'Latzug', 'Beinpresse', 'Bizeps-Curls (LH)'];
  S.exercises = NAMEN.map((n, i) => ({
    id: 'ex' + i, name: n, muscleGroup: i < 3 ? 'brust' : 'ruecken',
    targetSets: 4, targetReps: 8, repMin: 6, repMax: 10, targetType: 'reps',
    // Langhantel-Uebungen zeigen den Scheibenrechner, Maschinen (Latzug,
    // Beinpresse) nicht — genau daran haengt barKg.
    showPlateCalc: i < 3 || i === 5
  }));
  // 10 Einheiten, woechentlich, gleiches Topgewicht -> Plateau moeglich.
  S.sessions = [];
  for (let w = 10; w >= 1; w--) {
    const d = new Date(Date.now() - w * 7 * 86400000);
    S.sessions.push({
      id: 'ses' + w, date: d.toISOString(), duration: 3300,
      logs: S.exercises.map(e => ({ exerciseId: e.id, sets: [
        { w: 60, r: 8, type: 'normal' }, { w: 60, r: 8, type: 'normal' },
        { w: 60, r: 8, type: 'normal' }, { w: 60, r: 8, type: 'normal' }] }))
    });
  }
  S.restTimerSecs = 90;
  S.unitMode = 'kg';
  delete S.availablePlates;
  S.plateBar = 20;
  S.coachSession = null;
  persist();
  window.__csSaid = []; window.__barSaid = [];
  const csOrig = window._csEmit, barOrig = window._coachBarSet;
  if (typeof csOrig === 'function') {
    window._csEmit = function (out) {
      const ok = csOrig.apply(this, arguments);
      if (ok) window.__csSaid.push({ kind: out && out.kind, key: out && out.key,
                                     txt: (document.getElementById('wk-coach-bar') || {}).textContent || '' });
      return ok;
    };
  }
  if (typeof barOrig === 'function') {
    window._coachBarSet = function (mode, msg, hold) {
      if (msg) window.__barSaid.push({ msg: msg, hold: hold });
      return barOrig.apply(this, arguments);
    };
  }
};

// Ein vollstaendiges Training durchspielen: sechs Uebungen, alle Saetze
// abhaken, dazwischen Pausen ablaufen lassen und den Minutentick feuern.
// Zwoelf Trigger — hoechstens CAP kommen durch.
const DURCHLAUF = async (opts) => {
  const o = opts || {};
  // Der Zeitstrahl-Abstand (CS_GAP_MS) wird fuer den Messlauf ausgehebelt:
  // gemessen wird die OBERGRENZE, nicht die Taktung. Die Taktung prueft ein
  // eigener Check in Echtzeit.
  if (o.sofort) window._csSeq = fn => { try { fn(); } catch (_) {} };
  wkExIds = S.exercises.map(e => e.id);
  startActive();
  openOv('ov-wk');
  for (let li = 0; li < wkLogs.length; li++) {
    for (let si = 0; si < (wkLogs[li].sets || []).length; si++) {
      wkLogs[li].sets[si].w = String(60 - si * 2.5);   // fallende Last
      wkLogs[li].sets[si].r = String(Math.max(3, 8 - si)); // fallende Wiederholungen
      toggleSetDone(li, si);
      // Pausentimer ablaufen lassen, ohne 90 s zu warten: derselbe Zweig wie im
      // echten Ablauf (_csRest mit der geplanten Pausenlaenge).
      try { _csRest(60 + si * 25); } catch (_) {}
    }
  }
  try { _csTick(); } catch (_) {}
  return { spoken: (S.coachSession || {}).spoken, said: Object.keys((S.coachSession || {}).said || {}) };
};

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  page.on('dialog', d => { try { d.dismiss(); } catch (_) {} });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text().slice(0, 200)); });

  const ev = async (fn, arg) => {
    try { return (arg === undefined) ? await page.evaluate(fn) : await page.evaluate(fn, arg); }
    catch (e) { return { __err: String((e && e.message) || e).slice(0, 240) }; }
  };
  const boot = async (preset) => {
    await page.setOfflineMode(false);
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 60000 });
    await wait(1400);
    await ev(BOOTSTATE);
    if (preset) await ev(p => { try { setCoachPreset(p); } catch (_) {} }, preset);
  };
  let r;

  // ── 1) Registrierung: script-Tag, build.js, sw.js — CACHE unangetastet ────
  await boot('close');
  const MODULE = ['coach-session', 'coach-warmup', 'coach-cues', 'coach-rpe', 'coach-analyze'];
  const statisch = (() => {
    try {
      const html = fs.readFileSync(SRC, 'utf8');
      const build = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
      const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
      const shell = (sw.match(/const SHELL\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';
      return {
        tags:  MODULE.filter(m => html.includes(`<script src="./js/${m}.js">`)),
        build: MODULE.filter(m => build.includes(`js/${m}.js`)),
        shell: MODULE.filter(m => shell.includes(`./js/${m}.js`)),
        cache: (sw.match(/const CACHE\s*=\s*['"]([^'"]+)['"]/) || [])[1] || null
      };
    } catch (e) { return { err: String(e.message) }; }
  })();
  r = await ev(() => ({
    session: typeof window.CoachSession, warmup: typeof window.CoachWarmup,
    cues: typeof window.CoachCues, rpe: typeof window.CoachRpe, analyze: typeof window.CoachAnalyze,
    cap: window.CoachSession ? window.CoachSession.CAP : null
  }));
  check('Registrierung: alle fuenf Module haengen als script-Tag, in der Kopierliste von build.js und im SHELL-Precache — CACHE unangetastet',
    (statisch.tags || []).length === 5 && (statisch.build || []).length === 5 &&
    (statisch.shell || []).length === 5 && statisch.cache === SW_CACHE_VORHER &&
    r.session === 'object' && r.warmup === 'object' && r.cues === 'object' &&
    r.rpe === 'object' && r.analyze === 'object' &&
    r.cap && r.cap.off === 0 && r.cap.key === 4 && r.cap.full === 8,
    JSON.stringify({ statisch, r }).slice(0, 700));

  // ── 2) Trainingsstart: Begruessung erscheint (Echtzeit, ohne Netz) ────────
  // page.setOfflineMode(true) VOR dem Start: der Bogen darf an keiner
  // Netzantwort haengen. In Echtzeit gemessen, damit auch die Taktung
  // (eine Aeusserung, keine zwei uebereinander) belegt ist.
  await boot('close');
  await page.setOfflineMode(true);
  await ev(() => { wkExIds = S.exercises.slice(0, 3).map(e => e.id); startActive(); openOv('ov-wk'); });
  await wait(1800);
  const nachStart = await ev(() => ({
    bar: (document.getElementById('wk-coach-bar').textContent || '').replace(/\s+/g, ' ').trim(),
    said: (window.__csSaid || []).map(x => x.kind),
    sichtbar: document.getElementById('wk-coach-bar').style.display !== 'none',
    // Genau EINE Aeusserung im Bild: die Leiste traegt hoechstens eine .coach-bar-msg
    zeilen: document.querySelectorAll('#wk-coach-bar .coach-bar-msg').length,
    ov: document.querySelectorAll('.ov.on').length
  }));
  check('Trainingsstart ohne Netz: die Begruessung erscheint in #wk-coach-bar, genau EINE Zeile, kein zusaetzliches Overlay',
    nachStart.said && nachStart.said[0] === 'greet' && nachStart.zeilen === 1 &&
    nachStart.sichtbar === true && /Bankdrücken|60/.test(nachStart.bar || ''),
    JSON.stringify(nachStart).slice(0, 600));

  // ── 3) Uebung geoeffnet: Ansage UND Aufwaermschema ───────────────────────
  // Echtzeit: exOpen und warmupIntro liegen je CS_GAP_MS auseinander. Seit der
  // Blockabschluss-Review ist CS_GAP_MS = CS_HOLD_MS (9 s statt 4,5 s) — eine
  // gereihte Aeusserung verdraengte die vorige sonst nach der halben Lesezeit.
  // Die Wartezeit zieht mit; die Zusicherung selbst ist unveraendert.
  await wait(19000);
  r = await ev(() => ({
    kinds: (window.__csSaid || []).map(x => x.kind),
    warm: (window.__csSaid || []).filter(x => x.kind === 'warmupIntro').map(x => x.txt),
    bar: (document.getElementById('wk-coach-bar').textContent || '').replace(/\s+/g, ' ').trim()
  }));
  const warmTxt = (r.warm || [])[0] || '';
  check('Uebung geoeffnet: Ansage (exOpen) UND Aufwaermschema (warmupIntro) — das Schema nennt Kilo, keine Prozent',
    (r.kinds || []).indexOf('exOpen') >= 0 && (r.kinds || []).indexOf('warmupIntro') >= 0 &&
    /\d+\s*kg\s*×\s*\d+/.test(warmTxt) && !/%/.test(warmTxt),
    JSON.stringify(r).slice(0, 800));

  // ── 4) exOpen entprellt: dieselbe Uebung erneut gibt KEINE zweite Ansage ──
  r = await ev(() => {
    const vorher = (window.__csSaid || []).filter(x => x.kind === 'exOpen').length;
    const ex = exById(wkLogs[0].exerciseId);
    for (let i = 0; i < 5; i++) { _csExercise(ex); _csSyncCurrentEx(); }
    return { vorher, nachher: (window.__csSaid || []).filter(x => x.kind === 'exOpen').length,
             said: (S.coachSession || {}).spoken };
  });
  check('exOpen entprellt an der Aufrufstelle: dieselbe Uebung fuenfmal erneut geoeffnet gibt keine zweite Ansage',
    r.vorher === r.nachher && r.vorher >= 1, JSON.stringify(r));

  // ── 5) Saetze abhaken: Chips, Halbzeit, Ermuedung ────────────────────────
  await boot('close');
  await page.setOfflineMode(true);
  r = await ev(async () => {
    window._csSeq = fn => { try { fn(); } catch (_) {} };
    wkExIds = S.exercises.slice(0, 2).map(e => e.id);
    startActive(); openOv('ov-wk');
    // Fuenf Saetze auf DERSELBEN Uebung: die Halbzeit hat laut Modul Vorrang vor
    // der Ermuedung ("die Ermuedung kommt beim naechsten Satz noch"), und die
    // Wiederholungsreihe gilt je Uebung. Mit vier Saetzen kaeme mid und fatigue
    // nie — das waere ein Testartefakt, kein Befund.
    addSet(0);
    for (let si = 0; si < 5; si++) {
      wkLogs[0].sets[si].w = '60'; wkLogs[0].sets[si].r = String(Math.max(2, 8 - si * 2));
      toggleSetDone(0, si);
      _csRest(60 + si * 30);
    }
    return {
      chips: document.querySelectorAll('#wk-coach-bar .cb-ask3 button').length,
      frage: (document.querySelector('#wk-coach-bar .cb-ask3-q') || {}).textContent || '',
      kinds: (window.__csSaid || []).map(x => x.kind),
      said: Object.keys((S.coachSession || {}).said || {})
    };
  });
  check('Saetze abhaken ohne Netz: drei Chips IN der Coach-Leiste, Halbzeit (mid) und Ermuedung (fatigue) kommen',
    r.chips === 3 && (r.frage || '').length > 8 &&
    (r.said || []).indexOf('mid') >= 0 && (r.said || []).indexOf('fatigue') >= 0,
    JSON.stringify(r).slice(0, 700));

  // ── 6) Satz-Rueckfrage verschwindet unbeantwortet und blockiert nichts ────
  const vorAblauf = await ev(() => ({
    chips: document.querySelectorAll('#wk-coach-bar .cb-ask3 button').length,
    ov: document.querySelectorAll('.ov.on').length,
    modal: document.querySelectorAll('#wk-coach-bar [role=dialog]').length
  }));
  await wait(8600);
  const nachAblauf = await ev(() => {
    const vorher = wkLogs[1].sets.filter(s => s.done).length;
    // Waehrend/nach der Rueckfrage weiter Saetze abhaken: nichts blockiert.
    wkLogs[1].sets[0].w = '50'; wkLogs[1].sets[0].r = '8';
    toggleSetDone(1, 0);
    return { chips: document.querySelectorAll('#wk-coach-bar .cb-ask3 button').length,
             vorher, nachher: wkLogs[1].sets.filter(s => s.done).length,
             neueChips: document.querySelectorAll('#wk-coach-bar .cb-ask3 button').length };
  });
  check('Satz-Rueckfrage: nach 8 Sekunden unbeantwortet verschwunden, kein Modal, das Abhaken laeuft ungehindert weiter',
    vorAblauf.chips === 3 && vorAblauf.modal === 0 &&
    nachAblauf.chips === 3 && nachAblauf.nachher === nachAblauf.vorher + 1,
    JSON.stringify({ vorAblauf, nachAblauf }));

  // ── 7) "schwer" senkt den naechsten Vorschlag und die Quittung sagt es ────
  r = await ev(() => {
    const li = 1, log = wkLogs[li];
    const kgVor = parseFloat(log.sets[1].w) || parseFloat(log.sets[0].w);
    _rpeAsk(li, 0);
    const chips = [...document.querySelectorAll('#wk-coach-bar .cb-ask3 button')]
      .map(b => b.getAttribute('onclick'));
    _rpeAnswer('schwer');
    const kgNach = parseFloat(wkLogs[li].sets.find(s => !s.done && (s.type || 'normal') !== 'warmup').w);
    const quittung = (document.getElementById('wk-coach-bar').textContent || '').replace(/\s+/g, ' ');
    const rpeGespeichert = wkLogs[li].sets[0].rpe;   // VOR dem zweiten Tipp lesen
    _rpeAsk(li, 0); _rpeAnswer('leicht');
    const kgHoch = parseFloat(wkLogs[li].sets.find(s => !s.done && (s.type || 'normal') !== 'warmup').w);
    return { kgVor, kgNach, kgHoch, chips, quittung, rpeGespeichert,
             step: _csEquip(exById(log.exerciseId)).step,
             bar: _csEquip(exById(log.exerciseId)).barKg };
  });
  check('"schwer" senkt den naechsten Vorschlag genau eine Stufe, "leicht" hebt ihn — und die Quittung nennt das NEUE Gewicht, nicht "bleibt"',
    r.kgNach < r.kgVor && r.kgHoch > r.kgNach && r.rpeGespeichert === 9.5 &&
    (r.chips || []).join(',') === "_rpeAnswer('leicht'),_rpeAnswer('passend'),_rpeAnswer('schwer')" &&
    new RegExp(String(r.kgNach).replace('.', '[.,]')).test(r.quittung || '') &&
    !/bleib|stays|stay at/i.test(r.quittung || ''),
    JSON.stringify(r).slice(0, 700));

  // ── 8) step / barKg aus den Geraeteeinstellungen ──────────────────────────
  r = await ev(() => {
    const lang = exById('ex0');       // showPlateCalc true  -> Stange
    const masch = exById('ex4');      // showPlateCalc false -> Maschine
    const a = _csEquip(lang), b = _csEquip(masch);
    S.availablePlates = { kg: [25, 20, 15, 10, 5, 2.5] };  // keine 1,25 / 0,5 im Studio
    const c = _csEquip(lang);
    S.plateBar = 0;                                        // "ohne" gewaehlt
    const d = _csEquip(lang);
    S.plateBar = 20; S.unitMode = 'lbs'; S.availablePlates = { lbs: [45, 35, 25, 10, 5, 2.5] };
    const e = _csEquip(lang);
    const warmLbs = _csWarmupText(window.CoachWarmup.warmupSets(100, { step: e.step, barKg: e.barKg }));
    S.unitMode = 'kg'; delete S.availablePlates; S.plateBar = 20; persist();
    return { langBar: a.barKg, maschBar: b.barKg, maschStep: b.step,
             stepGrob: c.step, ohneStange: d.barKg, lbsBar: Math.round(e.barKg * 10) / 10,
             lbsStep: Math.round(e.step * 100) / 100, warmLbs };
  });
  check('step/barKg kommen aus den Geraeteeinstellungen: Maschine zwingend barKg 0, Stange aus S.plateBar, step = kleinste Scheibe je Seite, lbs umgerechnet',
    r.langBar === 20 && r.maschBar === 0 && r.stepGrob === 2.5 && r.ohneStange === 0 &&
    r.lbsBar > 20 && r.lbsBar < 21 && r.lbsStep > 1 && r.lbsStep < 1.2 &&
    / lbs/.test(r.warmLbs || '') && !/ kg/.test(r.warmLbs || ''),
    JSON.stringify(r).slice(0, 600));

  // ── 9) Obergrenze "Eng dabei" (full): hoechstens acht ────────────────────
  await boot('close');
  const full = await ev(DURCHLAUF, { sofort: true });
  const fullEnde = await ev(() => {
    const vor = (S.coachSession || {}).spoken;
    finishWk();
    return { vor, kinds: (window.__csSaid || []).map(x => x.kind),
             bar: (document.getElementById('wk-coach-bar').textContent || '').replace(/\s+/g, ' ').trim(),
             zustand: S.coachSession };
  });
  check('Obergrenze "Eng dabei" (full): mehr als acht ausloesende Ereignisse, hoechstens ACHT Aeusserungen inklusive Abschluss',
    typeof full.spoken === 'number' && full.spoken <= 8 && fullEnde.vor <= 8 &&
    (fullEnde.kinds || []).filter(k => k === 'debrief').length === 1 &&
    (fullEnde.kinds || []).length <= 8 && fullEnde.zustand === null,
    JSON.stringify({ full, vor: fullEnde.vor, n: (fullEnde.kinds || []).length, kinds: fullEnde.kinds }).slice(0, 700));

  // ── 10) Training beenden: der Abschluss erscheint ────────────────────────
  check('Training beenden: der Abschluss (debrief) erscheint in derselben Leiste und der Zustand wird genullt und persistiert',
    /\d/.test(fullEnde.bar || '') && (fullEnde.kinds || []).slice(-1)[0] === 'debrief' &&
    fullEnde.zustand === null,
    JSON.stringify({ bar: fullEnde.bar, letzte: (fullEnde.kinds || []).slice(-1)[0] }));

  // ── 11) Obergrenze "Ausgewogen" (key): hoechstens vier ───────────────────
  await boot('balanced');
  const key = await ev(DURCHLAUF, { sofort: true });
  const keyEnde = await ev(() => {
    const vor = (S.coachSession || {}).spoken;
    finishWk();
    return { vor, kinds: (window.__csSaid || []).map(x => x.kind) };
  });
  check('Obergrenze "Ausgewogen" (key): derselbe Durchlauf kommt auf hoechstens VIER Aeusserungen, Abschluss inklusive',
    key.spoken <= 4 && keyEnde.vor <= 4 && (keyEnde.kinds || []).length <= 4 &&
    (keyEnde.kinds || []).filter(k => k === 'debrief').length === 1 &&
    // Nur Schluesselmomente, keine Feinheiten
    (keyEnde.kinds || []).every(k => ['greet', 'greetFirst', 'exOpen', 'warmupIntro', 'debrief'].indexOf(k) >= 0),
    JSON.stringify({ key, vor: keyEnde.vor, kinds: keyEnde.kinds }).slice(0, 600));

  // ── 12) "Zurueckhaltend" (off): der Coach schweigt vollstaendig ──────────
  await boot('quiet');
  const off = await ev(DURCHLAUF, { sofort: true });
  const offEnde = await ev(() => {
    finishWk();
    return { kinds: (window.__csSaid || []).map(x => x.kind),
             bar: (window.__barSaid || []).length,
             chips: document.querySelectorAll('#wk-coach-bar .cb-ask3 button').length,
             zustand: S.coachSession };
  });
  check('"Zurueckhaltend" (off): keine einzige Aeusserung, auch kein Abschluss, keine Chips — die Obergrenze 0 gilt auch fuer force',
    (offEnde.kinds || []).length === 0 && offEnde.chips === 0 && offEnde.bar === 0 &&
    (off.spoken === undefined || off.spoken === 0),
    JSON.stringify({ off, offEnde }).slice(0, 600));

  // ── 13) Offline: kompletter Durchlauf, alle Aeusserungen kommen trotzdem ─
  await boot('close');
  await page.setOfflineMode(true);
  const offline = await ev(DURCHLAUF, { sofort: true });
  const offlineEnde = await ev(() => {
    finishWk();
    return { kinds: (window.__csSaid || []).map(x => x.kind),
             texte: (window.__csSaid || []).map(x => x.txt) };
  });
  check('Offline (setOfflineMode): kompletter Durchlauf — Begruessung, Uebung, Aufwaermschema, Bogen und Abschluss kommen ohne Netz',
    (offlineEnde.kinds || []).length >= 4 && (offlineEnde.kinds || []).length <= 8 &&
    (offlineEnde.kinds || []).indexOf('greet') >= 0 &&
    (offlineEnde.kinds || []).indexOf('exOpen') >= 0 &&
    (offlineEnde.kinds || []).indexOf('warmupIntro') >= 0 &&
    (offlineEnde.kinds || []).indexOf('debrief') >= 0 &&
    (offlineEnde.texte || []).every(t => t && t.length > 5),
    JSON.stringify({ offline, kinds: offlineEnde.kinds }).slice(0, 700));

  // ── 14) Chat ohne Netz: Router antwortet sofort, Modellfrage wird erklaert ─
  r = await ev(async () => {
    const frage = async (t) => {
      document.getElementById('aic-in').value = t;
      const n = _aicHist.length;
      await aicSend();
      return (_aicHist.slice(n).filter(m => m.role === 'assistant')[0] || {}).content || '';
    };
    const streak = await frage('Wie lang ist meine Streak?');
    const plan = await frage('Was hältst du von meinem Plan?');
    return { streak, plan, busy: _aicBusy,
             sendeKnopf: !(document.getElementById('aic-send') || {}).disabled };
  });
  check('Chat ohne Netz: "Streak" beantwortet der Router sofort, "Was haeltst du von meinem Plan?" bekommt EINEN klaren Satz zur Verbindung — kein Fehler, kein haengender Ladepunkt',
    (r.streak || '').length > 3 && !/nicht erreichbar|failed|error/i.test(r.streak || '') &&
    /Internet|connection/i.test(r.plan || '') && (r.plan || '').length > 20 &&
    !/Fehler|Error|undefined/.test(r.plan || '') && r.busy === false && r.sendeKnopf === true,
    JSON.stringify(r).slice(0, 700));

  // ── 15) Uebungsname mit Markup erscheint als Text ────────────────────────
  await boot('close');
  r = await ev(() => {
    window.__xss = 0;
    window._csSeq = fn => { try { fn(); } catch (_) {} };
    S.exercises[0].name = '<img src=x onerror="window.__xss=1">Bankdrücken';
    persist();
    wkExIds = [S.exercises[0].id];
    startActive(); openOv('ov-wk');
    const el = document.getElementById('wk-coach-bar');
    // Gelesen wird JEDE Zeile dieser Einheit, nicht nur die zuletzt stehende:
    // welche Art am Ende im Bild steht, haengt am Rueckhalt und ist keine
    // Zusicherung — dass der Name ueberall als Text ankommt, schon.
    return { xss: window.__xss, roh: /<img/i.test(el.innerHTML),
             text: (window.__csSaid || []).map(x => x.txt).join(' ').replace(/\s+/g, ' ').trim(),
             imgs: el.querySelectorAll('img').length,
             kinds: (window.__csSaid || []).map(x => x.kind) };
  });
  check('Uebungsname mit Markup erscheint als TEXT, nicht als Markup (esc() vor innerHTML), kein onerror laeuft',
    r.xss === 0 && r.roh === false && r.imgs === 0 &&
    /<img src=x onerror/.test(r.text || '') && (r.kinds || []).length >= 1,
    JSON.stringify(r).slice(0, 600));

  // ── 16) Zustand ueberlebt den Reload mitten im Training ──────────────────
  // Der teuerste Fehler: laedt die PWA neu und die Aufrufstelle ruft sessionNew
  // mit demselben wkTs, faengt der Deckel von vorn an zu zaehlen.
  await boot('close');
  const vorReload = await ev(() => {
    window._csSeq = fn => { try { fn(); } catch (_) {} };
    wkExIds = S.exercises.slice(0, 3).map(e => e.id);
    startActive(); openOv('ov-wk');
    wkLogs[0].sets[0].w = '60'; wkLogs[0].sets[0].r = '8'; toggleSetDone(0, 0);
    _flushActiveWk();
    return { wkTs: timerTs, spoken: (S.coachSession || {}).spoken,
             gespeichert: (() => { try { return (JSON.parse(localStorage.getItem('ft4') || '{}').coachSession || {}).spoken; } catch (_) { return null; } })() };
  });
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 60000 });
  await wait(1600);
  const nachReload = await ev(() => {
    window.isPremium = () => true;
    return { wkTs: timerTs, spoken: (S.coachSession || {}).spoken,
             wkTsZustand: (S.coachSession || {}).wkTs, logs: (wkLogs || []).length };
  });
  check('Zustand ueberlebt den Reload mitten im Training (persist(), nicht save()): derselbe wkTs, der Deckel zaehlt NICHT von vorn',
    vorReload.spoken > 0 && vorReload.gespeichert === vorReload.spoken &&
    nachReload.logs > 0 && nachReload.wkTs === vorReload.wkTs &&
    nachReload.spoken === vorReload.spoken && nachReload.wkTsZustand === vorReload.wkTs,
    JSON.stringify({ vorReload, nachReload }));

  // ── 17) Fremder wkTs wird verworfen ──────────────────────────────────────
  r = await ev(() => {
    const fremd = { wkTs: 1, level: 'full', spoken: 7, said: { greet: true }, ended: false };
    S.coachSession = fremd; persist();
    const a = _csGet(timerTs);
    const b = _csGet(1);
    // Nach dem Abschluss redet kein Modulaufruf mehr
    S.coachSession = { wkTs: timerTs, level: 'full', spoken: 3, said: {}, ended: true };
    const c = _csGet(timerTs);
    S.coachSession = null; persist();
    return { fremd: a === null, eigen: b !== null, nachEnde: c === null };
  });
  check('Fremder wkTs wird verworfen (_csGet gibt null) und nach sessionEnd redet kein Modulaufruf mehr (ended-Riegel)',
    r.fremd === true && r.eigen === true && r.nachEnde === true, JSON.stringify(r));

  // ── 18) setFeedback aus: keine Chips, der Bogen laeuft weiter ────────────
  await boot('close');
  r = await ev(() => {
    window._csSeq = fn => { try { fn(); } catch (_) {} };
    setAiCoachOpt('setFeedback', false);
    wkExIds = S.exercises.slice(0, 2).map(e => e.id);
    startActive(); openOv('ov-wk');
    wkLogs[0].sets[0].w = '60'; wkLogs[0].sets[0].r = '8'; toggleSetDone(0, 0);
    const chips = document.querySelectorAll('#wk-coach-bar .cb-ask3 button').length;
    setAiCoachOpt('setFeedback', true);
    wkLogs[0].sets[1].w = '60'; wkLogs[0].sets[1].r = '8'; toggleSetDone(0, 1);
    return { chipsAus: chips, chipsAn: document.querySelectorAll('#wk-coach-bar .cb-ask3 button').length,
             bogen: (window.__csSaid || []).map(x => x.kind) };
  });
  check('setFeedback aus: keine Satz-Rueckfrage — der Erzaehlbogen selbst laeuft weiter (zwei getrennte Schalter)',
    r.chipsAus === 0 && r.chipsAn === 3 && (r.bogen || []).length >= 1, JSON.stringify(r).slice(0, 500));

  // ── 19) Englischer Durchlauf: kein deutscher Coach-Text ──────────────────
  await page.evaluate(() => localStorage.setItem('gt_lang', 'en'));
  await boot('close');
  await page.setOfflineMode(true);
  r = await ev(() => {
    window._csSeq = fn => { try { fn(); } catch (_) {} };
    wkExIds = S.exercises.slice(0, 2).map(e => e.id);
    startActive(); openOv('ov-wk');
    wkLogs[0].sets[0].w = '60'; wkLogs[0].sets[0].r = '8'; toggleSetDone(0, 0);
    const chips = [...document.querySelectorAll('#wk-coach-bar .cb-ask3 button')].map(b => b.textContent.trim());
    const frage = (document.querySelector('#wk-coach-bar .cb-ask3-q') || {}).textContent || '';
    _rpeAnswer('hard');
    const quittung = (document.getElementById('wk-coach-bar').textContent || '').replace(/\s+/g, ' ');
    finishWk();
    return { texte: (window.__csSaid || []).map(x => x.txt), chips, frage, quittung };
  });
  const deutschRest = (r.texte || []).concat([r.frage, r.quittung, (r.chips || []).join(' ')])
    .filter(t => /Sätze|Wiederholungen|Aufwärmen|Halbzeit|Letztes Mal|Leicht|Passend|Schwer|Kilo|zuletzt/.test(t || ''));
  check('Englischer Durchlauf: Bogen, Chips, Frage und Quittung kommen auf Englisch — kein deutscher Coach-Text',
    (r.texte || []).length >= 2 && deutschRest.length === 0 &&
    (r.chips || []).join(',') === 'Easy,Right,Hard' && /feel|set/i.test(r.frage || ''),
    JSON.stringify({ deutschRest, chips: r.chips, frage: r.frage, quittung: r.quittung }).slice(0, 700));
  await page.evaluate(() => localStorage.removeItem('gt_lang'));

  // ── 20) Beleg: Screenshot des laufenden Trainings mit Coach-Leiste ───────
  await boot('close');
  try {
    await ev(() => {
      wkExIds = S.exercises.slice(0, 3).map(e => e.id);
      startActive(); openOv('ov-wk');
    });
    await wait(2000);
    await ev(() => { wkLogs[0].sets[0].w = '60'; wkLogs[0].sets[0].r = '8'; toggleSetDone(0, 0); });
    await wait(400);
    await page.screenshot({ path: SHOT });
    const sicht = await ev(() => ({
      bar: (document.getElementById('wk-coach-bar').textContent || '').trim().length,
      chips: document.querySelectorAll('#wk-coach-bar .cb-ask3 button').length
    }));
    check('Screenshot des laufenden Trainings mit Coach-Leiste und Satz-Rueckfrage geschrieben',
      fs.existsSync(SHOT) && fs.statSync(SHOT).size > 5000 && sicht.bar > 10 && sicht.chips === 3,
      SHOT + ' ' + JSON.stringify(sicht));
  } catch (e) { check('Screenshot des laufenden Trainings geschrieben', false, String(e.message)); }

  await browser.close();
  server.close();

  // ── 21) Statisch: kein save(), kein force ausser sessionEnd, kein Netz ───
  // Der teuerste Fehler des Vorhabens faellt zur Laufzeit NICHT auf: save()
  // existiert nicht, wirft ReferenceError und stirbt still im try/catch.
  try {
    const src = fs.readFileSync(SRC, 'utf8');
    const a = src.indexOf('ERZAEHLBOGEN IM TRAINING (Task 17');
    const b = src.indexOf('function _coachEvalRun', a > 0 ? a : 0);
    const block = a > 0 && b > a ? src.slice(a, b) : '';
    const code = ohneKommentar(block);
    // emit(..., force) darf NUR aus sessionEnd kommen — der fuenfte Parameter
    // ueberspringt Budget UND Stufenfilter.
    const emits = code.match(/CoachSession\.emit\([^;]*\)/g) || [];
    const mitForce = emits.filter(e => /,\s*(true|1)\s*\)\s*$/.test(e));
    check('Statisch: der Task-17-Block nutzt persist() und nirgends save(); emit() wird nie mit force gerufen; kein fetch/AI_WORKER_URL im Bogen',
      block.length > 4000 && !/[^a-zA-Z_$.]save\s*\(/.test(code) &&
      (code.match(/persist\(\)/g) || []).length >= 2 &&
      emits.length >= 4 && mitForce.length === 0 &&
      !/fetch\s*\(|AI_WORKER_URL|XMLHttpRequest/.test(code) &&
      /try\s*\{/.test(code) && (code.match(/catch\s*\(/g) || []).length >= 20,
      JSON.stringify({ len: block.length, save: /[^a-zA-Z_$.]save\s*\(/.test(code),
                       emits: emits.length, mitForce: mitForce }).slice(0, 700));
  } catch (e) { check('Statisch: kein save(), kein force, kein Netz im Task-17-Block', false, String(e.message)); }

  // ── 22) Statisch: kein Netzaufruf in den Block-3-Modulen ─────────────────
  try {
    const treffer = [];
    ['coach-session', 'coach-warmup', 'coach-cues', 'coach-rpe', 'coach-analyze'].forEach(m => {
      const s = fs.readFileSync(path.join(ROOT, 'js', m + '.js'), 'utf8');
      if (/fetch\s*\(|AI_WORKER_URL|XMLHttpRequest/.test(s)) treffer.push(m);
    });
    check('Blockpruefung: kein Netzaufruf (fetch / AI_WORKER_URL / XMLHttpRequest) in den fuenf Block-3-Modulen',
      treffer.length === 0, JSON.stringify(treffer));
  } catch (e) { check('Blockpruefung: kein Netzaufruf in den Block-3-Modulen', false, String(e.message)); }

  // ── 23) Statisch: kein Emoji im neuen Coach-Text, ISO-Woche nicht gemischt ─
  try {
    const src = fs.readFileSync(SRC, 'utf8');
    const a = src.indexOf('ERZAEHLBOGEN IM TRAINING (Task 17');
    const b = src.indexOf('function _coachEvalRun', a > 0 ? a : 0);
    const block = a > 0 && b > a ? src.slice(a, b) : '';
    const code = ohneKommentar(block);
    const piktogramm = /\p{Extended_Pictographic}/u;
    check('Statisch: kein Emoji im neuen Block, ISO-Woche nur ueber CoachAnalyze.isoWeekKey() — getWeekKey() bleibt unberuehrt',
      block.length > 4000 && !piktogramm.test(block.replace(/\u2715/g, '')) &&
      /CoachAnalyze\.isoWeekKey/.test(code) && !/getWeekKey/.test(code),
      JSON.stringify({ emoji: piktogramm.test(block.replace(/\u2715/g, '')),
                       iso: /CoachAnalyze\.isoWeekKey/.test(code),
                       alt: /getWeekKey/.test(code) }));
  } catch (e) { check('Statisch: kein Emoji, ISO-Woche nicht gemischt', false, String(e.message)); }

  console.log('\n-- Task 17 — Erzaehlbogen im Training, offline geprueft (Chromium statt Simulator) --');
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
})().catch(e => { console.error('HARNESS-FEHLER: ' + e.message); try { server.close(); } catch (_) {} process.exit(2); });
