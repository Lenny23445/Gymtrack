/* Blockabschluss-Review Block 3 — Verifikation der Behebungen.
   Muster: task-17-check.js (statischer Node-Server + Chromium/Puppeteer,
   echte Zeigerfolgen wo getippt wird, eigener Port). task-9 haelt 8793,
   task-10 haelt 8794, task-17 haelt 8795 — dieser Lauf haelt 8796.

   Jeder Check gehoert zu genau einem Befund und ist so gebaut, dass er auf dem
   Stand VOR der Behebung ROT ist:
     C1  der angesagte Aufwaermsatz ist auflegbar (nie unter der Stange,
         Scheiben paarweise) — der Bestand prueft nur, DASS Geraeteparameter
         gelesen werden, nicht DASS die Zahl stimmt.
     I1  der Bogen einer NORMALEN Einheit (3 Uebungen x 4 Saetze) enthaelt
         Halbzeit und Abschluss.
     I2  die Bilanz ist sichtbar, nicht nur gesetzt.
     I3  die Satz-Quittung hat eine eigene Obergrenze.
     I4  keine Pausenzahl, die nur die Einstellung des Nutzers ist.
     I5  lbs-Nutzer hoeren lbs.
     I6  die Reparaturschicht des Moduls laeuft in Produktion.
     I7  Satz ab- und wieder anhaken leert das Budget nicht.
     M   Haltezeit und Chip-Ablauf — die zwei Zusicherungen, die 18 Mutationen
         der Review ueberlebt haben, plus Schreiblast und Taktung.

   Aufruf:
     node block3-fix-check.js
     node block3-fix-check.js --root=<dir>   (Rot-Lauf gegen einen alten Baum) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '../../..');
const puppeteer = require(path.join(REPO, 'node_modules/puppeteer'));

const argRoot = (process.argv.find(a => a.startsWith('--root=')) || '').slice(7);
const ROOT = argRoot ? path.resolve(argRoot) : REPO;
const SRC  = path.join(ROOT, 'index.html');
const PORT = 8796;
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

const results = [];
const check = (name, cond, got) => results.push({ name, ok: !!cond, got });
const wait = ms => new Promise(r => setTimeout(r, ms));

/* Grundzustand. Anders als in task-17 sind die Uebungen bewusst SO angelegt,
   wie sie aus der Bibliothek und aus den Plan-Vorlagen wirklich entstehen:
   OHNE showPlateCalc. Genau daran ist C1 aufgefallen — der Schalter wird von
   keinem Import je gesetzt, und die Verdrahtung leitete barKg allein aus ihm
   ab. Ein Grundzustand, der ihn setzt, prueft den Fehler nicht. */
const BOOTSTATE = () => {
  window.isPremium = () => true;
  const gate = document.getElementById('auth-gate'); if (gate) gate.style.display = 'none';
  const NAMEN = ['Bankdrücken', 'Kniebeugen', 'Latzug'];
  S.exercises = NAMEN.map((n, i) => ({
    id: 'ex' + i, name: n, muscleGroup: 'brust',
    targetSets: 4, targetReps: 8, repMin: 6, repMax: 10, targetType: 'reps'
    // showPlateCalc fehlt — so legen pickExFromLibrary() und die Plan-Vorlagen an.
  }));
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
  delete S.availablePlates;   // nichts gewaehlt: der Normalfall
  delete S.plateBar;          // Scheibenrechner nie geoeffnet: der Normalfall
  S.coachSession = null;
  persist();
  window.__csSaid = []; window.__barSaid = [];
  window.BAR_TXT = () => (document.getElementById('wk-coach-bar').textContent || '').replace(/\s+/g, ' ').trim();
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

  // ── 1) C1: der angesagte Aufwaermsatz ist AUFLEGBAR ──────────────────────
  // Gemessen hatte die Review: Bankdruecken, Arbeitsgewicht 35 kg -> '17,5 kg
  // x 5' (die leere Stange wiegt 20), bei 60 kg '42 kg x 3' = 11 kg je Seite.
  await boot('close');
  r = await ev(() => {
    const ex = exById('ex0');                       // Bankdruecken, ohne showPlateCalc
    const eq = _csEquip(ex);
    const zahlen = (work) => window.CoachWarmup.warmupSets(work, { step: eq.step, barKg: eq.barKg })
      .map(s => s.kg);
    const auflegbar = (kg) => {
      if (kg < eq.barKg - 1e-9) return false;
      const inc = eq.barKg > 0 ? eq.step * 2 : eq.step;
      const n = (kg - eq.barKg) / inc;
      return Math.abs(n - Math.round(n)) < 1e-6;
    };
    const alle = [];
    for (let w = 30; w <= 200; w += 2.5) zahlen(w).forEach(kg => alle.push(kg));
    return { step: eq.step, bar: eq.barKg, w35: zahlen(35), w60: zahlen(60),
             schlecht: alle.filter(kg => !auflegbar(kg)).slice(0, 6), n: alle.length };
  });
  check('C1: Langhantel-Uebung ohne gesetzten Scheibenrechner-Schalter bekommt Stange 20 kg und ein Raster ab 1,25 kg je Seite — jeder angesagte Aufwaermsatz ist auflegbar',
    r.bar === 20 && r.step >= 1.25 && r.n > 100 && (r.schlecht || []).length === 0 &&
    (r.w35 || []).every(kg => kg >= 20) &&
    JSON.stringify(r.w35) === JSON.stringify([20, 25, 30]),
    JSON.stringify(r).slice(0, 600));

  // ── 2) C1: die Rueckfrage bewegt das Gewicht spuerbar ────────────────────
  // Mit step 0,5 senkte 'schwer' 60 kg auf 59,5 kg — eine Stufe, die niemand
  // spuert und die man auch nicht auflegen kann.
  r = await ev(() => {
    const eq = _csEquip(exById('ex0'));
    const maschine = _csEquip(exById('ex2'));       // Latzug: kein Stangengewicht
    const paar = (kg) => Math.abs((kg - eq.barKg) / (eq.step * 2) - Math.round((kg - eq.barKg) / (eq.step * 2))) < 1e-6;
    return { schwer: window.CoachRpe.adjustNext(60, 'schwer', eq.step, eq.barKg),
             leicht: window.CoachRpe.adjustNext(60, 'leicht', eq.step, eq.barKg),
             paarweise: paar(window.CoachRpe.adjustNext(60, 'schwer', eq.step, eq.barKg)) &&
                        paar(window.CoachRpe.adjustNext(60, 'leicht', eq.step, eq.barKg)),
             unterStange: window.CoachRpe.adjustNext(20, 'schwer', eq.step, eq.barKg),
             maschBar: maschine.barKg, maschStep: maschine.step,
             maschSchwer: window.CoachRpe.adjustNext(50, 'schwer', maschine.step, maschine.barKg) };
  });
  // Geprueft wird die EIGENSCHAFT, nicht eine Wunschzahl: der Sprung ist an
  // der Stange mindestens 2,5 kg (der Boden von 1,25 kg je Seite, paarweise)
  // und das Ergebnis bleibt auflegbar.
  check('C1: "schwer" senkt an der Stange um mindestens 2,5 kg (nicht um 0,5) und nie unter das Stangengewicht; die Maschine rechnet als einzelner Stapel',
    (60 - r.schwer) >= 2.5 && (r.leicht - 60) >= 2.5 && r.paarweise === true &&
    r.unterStange === 20 &&
    r.maschBar === 0 && r.maschStep >= 2.5 && (50 - r.maschSchwer) >= 2.5,
    JSON.stringify(r));

  // ── 3) C1: die ANSAGE selbst nennt auflegbare Zahlen ─────────────────────
  r = await ev(() => {
    window._csSeq = fn => { try { fn(); } catch (_) {} };
    S.sessions.forEach(s => s.logs.forEach(l => l.sets.forEach(x => { x.w = 35; })));
    persist();
    wkExIds = ['ex0'];
    startActive(); openOv('ov-wk');
    const warm = (window.__csSaid || []).filter(x => x.kind === 'warmupIntro').map(x => x.txt).join(' ');
    const zahlen = (warm.match(/(\d+(?:[.,]\d+)?)\s*kg/g) || []).map(t => parseFloat(t.replace(',', '.')));
    finishWk();
    return { warm: warm.slice(0, 200), zahlen };
  });
  check('C1: die Aufwaermansage im laufenden Training nennt keine Zahl unter dem Stangengewicht',
    (r.zahlen || []).length >= 2 && (r.zahlen || []).every(kg => kg >= 20),
    JSON.stringify(r).slice(0, 400));

  // ── 4) I1: eine NORMALE Einheit enthaelt Halbzeit und Abschluss ──────────
  // Drei Uebungen, vier Saetze — der Verlauf, in dem der Bogen bisher in der
  // Mitte abbrach: exOpen und warmupIntro der zweiten Uebung frassen die zwei
  // Reserveplaetze, mid und fatigue fielen am Budget aus.
  await boot('close');
  r = await ev(() => {
    window._csSeq = fn => { try { fn(); } catch (_) {} };
    wkExIds = S.exercises.map(e => e.id);           // 3 Uebungen x 4 Saetze
    startActive(); openOv('ov-wk');
    for (let li = 0; li < wkLogs.length; li++) {
      for (let si = 0; si < wkLogs[li].sets.length; si++) {
        wkLogs[li].sets[si].w = '60';
        wkLogs[li].sets[si].r = String(Math.max(3, 8 - si));
        toggleSetDone(li, si);
        _csRest(60 + si * 30);
      }
    }
    const vorEnde = Object.keys((S.coachSession || {}).said || {});
    const spoken = (S.coachSession || {}).spoken;
    finishWk();
    return { vorEnde, spoken, kinds: (window.__csSaid || []).map(x => x.kind) };
  });
  check('I1: drei Uebungen zu vier Saetzen — Halbzeit (mid) UND Abschluss (debrief) kommen, und die Obergrenze acht bleibt unangetastet',
    (r.vorEnde || []).indexOf('mid') >= 0 &&
    (r.kinds || []).indexOf('debrief') >= 0 &&
    (r.kinds || []).length <= 8 && r.spoken <= 7,
    JSON.stringify(r).slice(0, 600));

  // ── 5) I2: die Bilanz ist SICHTBAR, nicht nur gesetzt ────────────────────
  // finishWk() schrieb sie in #wk-coach-bar und schloss 24 Zeilen spaeter im
  // selben Tick das Overlay. Die 14 s Haltezeit waren tot.
  await boot('close');
  r = await ev(() => {
    window._csSeq = fn => { try { fn(); } catch (_) {} };
    wkExIds = ['ex0', 'ex1'];
    startActive(); openOv('ov-wk');
    for (let li = 0; li < 2; li++) for (let si = 0; si < 4; si++) {
      wkLogs[li].sets[si].w = '60'; wkLogs[li].sets[si].r = '8'; toggleSetDone(li, si);
    }
    finishWk();
    const ov = [...document.querySelectorAll('.ov.on')].map(e => e.id);
    const sicht = [...document.querySelectorAll('.ov.on')]
      .map(e => (e.textContent || '').replace(/\s+/g, ' ').trim()).join(' | ');
    return { ov, sicht: sicht.slice(0, 400),
             wkOffen: document.getElementById('ov-wk').classList.contains('on'),
             leisten: document.querySelectorAll('.coach-bar').length };
  });
  check('I2: nach dem Speichern steht die Bilanz auf dem Bildschirm, der ohnehin folgt (Check-in) — kein zweites Trainings-Overlay, keine zweite Coach-Leiste',
    (r.ov || []).indexOf('ov-checkin') >= 0 && r.wkOffen === false &&
    /\b(8|16)\b/.test(r.sicht || '') && /kg/.test(r.sicht || '') &&
    (r.leisten || 0) <= 1,
    JSON.stringify(r).slice(0, 700));

  // ── 6) prCongrats: der Bestwert kommt im Coach ueberhaupt vor ────────────
  await boot('close');
  r = await ev(() => {
    window._csSeq = fn => { try { fn(); } catch (_) {} };
    wkExIds = ['ex0'];
    startActive(); openOv('ov-wk');
    for (let si = 0; si < 4; si++) {
      wkLogs[0].sets[si].w = '90';                  // Verlauf steht bei 60 -> Bestwert
      wkLogs[0].sets[si].r = '8'; toggleSetDone(0, si);
    }
    finishWk();
    return { sicht: [...document.querySelectorAll('.ov.on')]
      .map(e => (e.textContent || '').replace(/\s+/g, ' ').trim()).join(' | ').slice(0, 500) };
  });
  check('Bestwert: ein neues Maximalgewicht taucht im Abschluss auf (prCongrats war ohne jeden Aufrufer)',
    /Bestwert|Bestleistung/.test(r.sicht || '') && /90/.test(r.sicht || ''),
    JSON.stringify(r).slice(0, 500));

  // ── 7) I3: die Satz-Quittung hat eine eigene Obergrenze ──────────────────
  // Gemessen: 12 Arbeitssaetze, jeder mit 'schwer' beantwortet -> 12 Quittungen
  // zusaetzlich zu den acht Bogen-Aeusserungen.
  await boot('close');
  r = await ev(() => {
    window._csSeq = fn => { try { fn(); } catch (_) {} };
    wkExIds = S.exercises.map(e => e.id);
    startActive(); openOv('ov-wk');
    let quittungen = 0;
    for (let li = 0; li < wkLogs.length; li++) {
      for (let si = 0; si < wkLogs[li].sets.length; si++) {
        wkLogs[li].sets[si].w = '60'; wkLogs[li].sets[si].r = '8';
        toggleSetDone(li, si);
        const vor = (window.__barSaid || []).length;
        _rpeAsk(li, si);
        _rpeAnswer('schwer');
        if ((window.__barSaid || []).length > vor) quittungen++;
      }
    }
    return { quittungen, cap: window.CoachSession.ACK_CAP,
             acks: (S.coachSession || {}).acks,
             spoken: (S.coachSession || {}).spoken };
  });
  check('I3: zwoelf mit "schwer" beantwortete Saetze ergeben hoechstens ACK_CAP Quittungen — und keine davon zaehlt gegen die Obergrenze des Bogens',
    typeof r.cap === 'number' && r.quittungen <= r.cap && r.quittungen >= 1 &&
    r.spoken <= 8,
    JSON.stringify(r));

  // ── 8) I3: der Kommentar sagt die Wahrheit ueber die Quittung ────────────
  try {
    const src = fs.readFileSync(SRC, 'utf8');
    const a = src.indexOf('ERZAEHLBOGEN IM TRAINING (Task 17');
    const b = src.indexOf('function _coachEvalRun', a > 0 ? a : 0);
    const kopf = a > 0 ? src.slice(a, a + 2600) : '';
    check('I3: die Zusicherung im Kopf des Blocks behauptet nicht mehr, die Obergrenze gelte auch fuer die Satz-Quittung',
      kopf.length > 1000 && !/auch die Satz-Quittung/.test(kopf) &&
      /Satz-Quittung/.test(src.slice(a, b)) &&
      /eigene\s+Obergrenze|eigene Grenze|ACK_CAP/.test(src.slice(a, b)),
      JSON.stringify({ kopf: /auch die Satz-Quittung/.test(kopf) }));
  } catch (e) { check('I3: der Kommentar sagt die Wahrheit ueber die Quittung', false, String(e.message)); }

  // ── 9) I4: keine Pausenzahl, die nur die Einstellung des Nutzers ist ─────
  await boot('close');
  r = await ev(() => {
    S.restTimerSecs = 90; persist();
    const rows = _csWeeklyHistory('ex0');
    const diag = window.CoachAnalyze.plateau(rows);
    const say = diag ? window.CoachAnalyze.plateauSay(diag, 'Bankdrücken') : null;
    const txt = say ? _say(say.key, say.vars) : '';
    return { n: rows.length, rest: rows.map(x => x.avgRestSecs).slice(0, 4),
             key: say && say.key, avg: diag && diag.avgRestSecs, txt: txt };
  });
  check('I4: ohne gemessene Pause traegt keine Wochenzeile eine Pausenzahl, und der Plateau-Satz nennt keine Sekunden',
    r.n >= 4 && (r.rest || []).every(v => v === null || v === undefined) &&
    r.avg === null && r.key === 'plateauPlain' &&
    !/\bSekunden\b|\b90\b/.test(r.txt || '') && (r.txt || '').length > 10,
    JSON.stringify(r).slice(0, 500));

  // ── 10) I4: eine echt gemessene Pause kommt dagegen an ───────────────────
  r = await ev(() => {
    (S.sessions || []).forEach(s => (s.logs || []).forEach(l => {
      if (String(l.exerciseId) !== 'ex0') return;
      (l.sets || []).forEach((x, i) => { x.rs = 130 + i; });
    }));
    persist();
    const rows = _csWeeklyHistory('ex0');
    const diag = window.CoachAnalyze.plateau(rows);
    const say = diag ? window.CoachAnalyze.plateauSay(diag, 'Bankdrücken') : null;
    return { rest: rows.map(x => x.avgRestSecs).slice(0, 3), key: say && say.key,
             txt: say ? _say(say.key, say.vars) : '' };
  });
  check('I4: sind die Pausen wirklich gemessen, stehen sie in der Diagnose — die Zahl ist dann eine Beobachtung',
    (r.rest || []).every(v => typeof v === 'number' && v >= 130) &&
    r.key === 'plateau' && /13\d/.test(r.txt || ''),
    JSON.stringify(r).slice(0, 400));

  // ── 11) I4: die Pause wird beim Abhaken wirklich gemessen ───────────────
  await boot('close');
  r = await ev(async () => {
    window._csSeq = fn => { try { fn(); } catch (_) {} };
    wkExIds = ['ex0'];
    startActive(); openOv('ov-wk');
    wkLogs[0].sets[0].w = '60'; wkLogs[0].sets[0].r = '8'; toggleSetDone(0, 0);
    await new Promise(res => setTimeout(res, 1200));
    wkLogs[0].sets[1].w = '60'; wkLogs[0].sets[1].r = '8'; toggleSetDone(0, 1);
    return { erster: wkLogs[0].sets[0].rs, zweiter: wkLogs[0].sets[1].rs };
  });
  check('I4: der Abstand zwischen zwei abgehakten Saetzen wird als echte Pause gespeichert (erster Satz hat keine)',
    (r.erster === undefined || r.erster === null) && typeof r.zweiter === 'number' && r.zweiter >= 1,
    JSON.stringify(r));

  // ── 12) I5: lbs-Nutzer hoeren lbs ────────────────────────────────────────
  await boot('close');
  r = await ev(() => {
    window._csSeq = fn => { try { fn(); } catch (_) {} };
    S.unitMode = 'lbs';
    (S.sessions || []).forEach(s => (s.logs || []).forEach(l => (l.sets || []).forEach(x => { x.w = 100; })));
    persist();
    wkExIds = ['ex0'];
    startActive(); openOv('ov-wk');
    wkLogs[0].sets[0].w = String(dispToKg(220)); wkLogs[0].sets[0].r = '8';
    toggleSetDone(0, 0);
    _rpeAsk(0, 0); _rpeAnswer('schwer');
    const quittung = BAR_TXT();
    const texte = (window.__csSaid || []).map(x => x.txt).join(' || ');
    finishWk();
    const bilanz = [...document.querySelectorAll('.ov.on')]
      .map(e => (e.textContent || '').replace(/\s+/g, ' ').trim()).join(' | ');
    S.unitMode = 'kg'; persist();
    return { texte: texte.slice(0, 600), quittung, bilanz: bilanz.slice(0, 400) };
  });
  check('I5: bei Einheit lbs nennt kein Coach-Satz kg — Begruessung, Ansage, Quittung und Bilanz laufen alle in lbs',
    /lbs/.test(r.texte || '') && !/\d\s*kg/.test(r.texte || '') &&
    /lbs/.test(r.quittung || '') && !/\d\s*kg/.test(r.quittung || '') &&
    !/\d\s*kg/.test(r.bilanz || ''),
    JSON.stringify(r).slice(0, 800));

  // ── 13) I6: die Reparaturschicht des Moduls laeuft in Produktion ─────────
  await boot('close');
  r = await ev(() => {
    window._csSeq = fn => { try { fn(); } catch (_) {} };
    wkExIds = ['ex0', 'ex1'];
    startActive(); openOv('ov-wk');
    const vorher = (S.coachSession || {}).spoken;
    const said = Object.keys((S.coachSession || {}).said || {}).length;
    // So kommt ein Zustand aus einem aelteren Speicherstand zurueck: 'spoken'
    // fehlt oder ist kein Zahlwert. (s.spoken || 0) ergab volles Budget.
    delete S.coachSession.spoken;
    S.coachSession.rests = 'viele';
    persist();
    _csResume();
    const nachher = (S.coachSession || {}).spoken;
    return { vorher, said, nachher, rests: Array.isArray((S.coachSession || {}).rests) };
  });
  check('I6: _csResume() laeuft ueber CoachSession.sessionResume() — ein Zustand ohne "spoken" ergibt nicht volles Budget, und jedes Feld ist typgeprueft',
    r.vorher >= 1 && typeof r.nachher === 'number' && r.nachher >= r.said && r.said >= 1 &&
    r.rests === true,
    JSON.stringify(r));

  // ── 14) I7: Satz ab- und wieder anhaken leert das Budget nicht ───────────
  // Gemessen wird der MODULAUFRUF, nicht die Aeusserung: ist das Budget schon
  // leer, faellt die zweite Ansage ohnehin aus und der Fehler bliebe unsichtbar.
  // Genau daran ist er der Testsuite bisher entgangen.
  await boot('close');
  r = await ev(() => {
    window._csSeq = fn => { try { fn(); } catch (_) {} };
    window.__opens = [];
    const orig = window.CoachSession.onExerciseOpen;
    window.CoachSession.onExerciseOpen = function (sess, ex) {
      window.__opens.push(String(ex && ex.id));
      return orig.apply(this, arguments);
    };
    wkExIds = S.exercises.map(e => e.id);
    startActive(); openOv('ov-wk');
    for (let si = 0; si < 4; si++) {
      wkLogs[0].sets[si].w = '60'; wkLogs[0].sets[si].r = '8'; toggleSetDone(0, si);
    }
    const vorher = { opens: window.__opens.slice(), spoken: (S.coachSession || {}).spoken };
    // Korrektur: einen Satz der ersten Uebung abhaken und wieder anhaken.
    for (let i = 0; i < 3; i++) { toggleSetDone(0, 1); toggleSetDone(0, 1); }
    const opens = window.__opens.slice();
    window.CoachSession.onExerciseOpen = orig;
    return { vorher, opens, spoken: (S.coachSession || {}).spoken,
             doppelt: opens.filter((id, i) => opens.indexOf(id) !== i) };
  });
  check('I7: dreimal einen Satz der ersten Uebung ab- und wieder anhaken oeffnet keine Uebung ein zweites Mal und kostet kein Budget',
    (r.opens || []).length >= 2 && (r.doppelt || []).length === 0 &&
    r.spoken === (r.vorher || {}).spoken,
    JSON.stringify(r));

  // ── 15) Mutation 1: jede Aeusserung verschwindet nach ihrer Haltezeit ────
  // Diese Zusicherung (Gestaltungsregel 3) hat die Mutation 'Haltezeit auf 0'
  // ueberlebt: 23/23 gruen. In Echtzeit gemessen, ohne Nachfolger im Bild.
  await boot('close');
  await ev(() => { wkExIds = ['ex0']; startActive(); openOv('ov-wk'); });
  await wait(1500);
  const gesetzt = await ev(() => ({ txt: BAR_TXT(), zeilen: document.querySelectorAll('#wk-coach-bar .coach-bar-msg').length }));
  await ev(() => { try { _csDiscard(); } catch (_) {} });   // keine Nachfolger mehr
  const hold = await ev(() => CS_HOLD_MS);
  await wait(hold + 1500);
  const abgelaufen = await ev(() => ({ txt: BAR_TXT(), zeilen: document.querySelectorAll('#wk-coach-bar .coach-bar-msg').length }));
  check('Mutation 1 (Haltezeit): die Aeusserung steht zuerst und ist nach ihrer Haltezeit von selbst verschwunden — keine Zeile bleibt ewig stehen',
    typeof hold === 'number' && hold >= 4000 &&
    gesetzt.zeilen === 1 && (gesetzt.txt || '').length > 10 &&
    abgelaufen.zeilen === 0,
    JSON.stringify({ hold, gesetzt, abgelaufen }).slice(0, 500));

  // ── 16) Mutation 2: die Rueckfrage verschwindet unbeantwortet ────────────
  // Zweite ueberlebende Mutation: '_rpeTimer entfernt' -> die Chips blieben
  // ewig stehen, und 23/23 blieben gruen. Der Bestand zaehlte die Chips nach
  // einem NEUEN Satz nach — also die neuen, nicht die alten.
  await boot('close');
  r = await ev(() => {
    window._csSeq = fn => { try { fn(); } catch (_) {} };
    wkExIds = ['ex0'];
    startActive(); openOv('ov-wk');
    wkLogs[0].sets[0].w = '60'; wkLogs[0].sets[0].r = '8'; toggleSetDone(0, 0);
    return { chips: document.querySelectorAll('#wk-coach-bar .cb-ask3 button').length,
             ask: RPE_ASK_MS };
  });
  await wait((r.ask || 8000) + 1800);
  const nachAblauf = await ev(() => ({
    chips: document.querySelectorAll('#wk-coach-bar .cb-ask3 button').length,
    frage: document.querySelectorAll('#wk-coach-bar .cb-ask3-q').length,
    ov: document.querySelectorAll('.ov.on').length
  }));
  check('Mutation 2 (Chip-Ablauf): die Satz-Rueckfrage ist nach RPE_ASK_MS OHNE jede Eingabe verschwunden — nichts blockiert, kein Modal',
    r.chips === 3 && nachAblauf.chips === 0 && nachAblauf.frage === 0,
    JSON.stringify({ vorher: r, nachAblauf }));

  // ── 17) Taktung: der Abstand ist mindestens so gross wie die Lesezeit ────
  r = await ev(() => ({ gap: CS_GAP_MS, hold: CS_HOLD_MS, ende: CS_HOLD_END_MS }));
  check('Taktung: gereihte Aeusserungen verdraengen einander nicht mehr nach der halben Lesezeit (CS_GAP_MS >= CS_HOLD_MS)',
    r.gap >= r.hold && r.hold > 0 && r.ende >= r.hold, JSON.stringify(r));

  // ── 18) Schreiblast: nicht bei jeder Pause das komplette S ───────────────
  await boot('close');
  r = await ev(() => {
    window._csSeq = fn => { try { fn(); } catch (_) {} };
    wkExIds = ['ex0'];
    startActive(); openOv('ov-wk');
    // persist() ist ein let-Binding und haengt nicht am window — gezaehlt wird
    // deshalb der Schreibvorgang selbst (localStorage 'ft4' = das komplette S).
    let n = 0;
    const orig = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (k) { if (k === 'ft4') n++; return orig.apply(null, arguments); };
    for (let i = 0; i < 12; i++) { try { _csRest(30); } catch (_) {} }
    localStorage.setItem = orig;
    return { n, rests: ((S.coachSession || {}).rests || []).length };
  });
  check('Schreiblast: zwoelf Pausen ohne Aeusserung schreiben nicht zwoelfmal das komplette S — der Zustand stimmt trotzdem',
    r.rests === 12 && r.n <= 3, JSON.stringify(r));

  // ── 19) Der Zaehler wird trotzdem sofort gesichert, sobald geredet wurde ─
  r = await ev(() => {
    const vor = (S.coachSession || {}).spoken;
    _csSet({ exId: 'ex0', reps: 8, kg: 60, ts: Date.now() });
    _flushActiveWk();
    let gespeichert = null;
    try { gespeichert = (JSON.parse(localStorage.getItem('ft4') || '{}').coachSession || {}).spoken; } catch (_) {}
    return { vor, jetzt: (S.coachSession || {}).spoken, gespeichert };
  });
  check('Schreiblast: die Obergrenze bleibt sofort gesichert — der gespeicherte Zaehler deckt sich mit dem laufenden',
    typeof r.gespeichert === 'number' && r.gespeichert === r.jetzt,
    JSON.stringify(r));

  // ── 20) Der Bogen bleibt an EINER Flaeche, ohne Netz, ohne Emoji ─────────
  await boot('close');
  await page.setOfflineMode(true);
  r = await ev(() => {
    window._csSeq = fn => { try { fn(); } catch (_) {} };
    wkExIds = S.exercises.map(e => e.id);
    startActive(); openOv('ov-wk');
    for (let li = 0; li < wkLogs.length; li++) for (let si = 0; si < 4; si++) {
      wkLogs[li].sets[si].w = '60'; wkLogs[li].sets[si].r = '8'; toggleSetDone(li, si);
    }
    const flaechen = document.querySelectorAll('#ov-wk .coach-bar').length;
    const modale = document.querySelectorAll('#wk-coach-bar [role=dialog]').length;
    finishWk();
    return { flaechen, modale, texte: (window.__csSaid || []).map(x => x.txt) };
  });
  const piktogramm = /\p{Extended_Pictographic}/u;
  check('Unveraendert bindend: genau EINE Coach-Flaeche im Training, nichts Modales, kein Emoji im Coach-Text — auch ohne Netz',
    r.flaechen === 1 && r.modale === 0 &&
    (r.texte || []).length >= 3 &&
    (r.texte || []).every(t => t && !piktogramm.test(t)),
    JSON.stringify({ flaechen: r.flaechen, modale: r.modale, n: (r.texte || []).length }));
  await page.setOfflineMode(false);

  await browser.close();
  server.close();

  // ── 21) Statisch: kein Netzaufruf auf einem Block-3-Pfad ────────────────
  try {
    const treffer = [];
    ['coach-session', 'coach-warmup', 'coach-cues', 'coach-rpe', 'coach-analyze'].forEach(m => {
      const s = fs.readFileSync(path.join(ROOT, 'js', m + '.js'), 'utf8');
      if (/fetch\s*\(|AI_WORKER_URL|XMLHttpRequest/.test(s)) treffer.push(m);
    });
    const src = fs.readFileSync(SRC, 'utf8');
    const a = src.indexOf('ERZAEHLBOGEN IM TRAINING (Task 17');
    const b = src.indexOf('function _coachEvalRun', a > 0 ? a : 0);
    const block = a > 0 && b > a ? src.slice(a, b) : '';
    const code = String(block).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
    check('Statisch: kein fetch / AI_WORKER_URL / XMLHttpRequest in den fuenf Modulen und im Block, persist() statt save()',
      treffer.length === 0 && block.length > 4000 &&
      !/fetch\s*\(|AI_WORKER_URL|XMLHttpRequest/.test(code) &&
      !/[^a-zA-Z_$.]save\s*\(/.test(code),
      JSON.stringify({ treffer, len: block.length }));
  } catch (e) { check('Statisch: kein Netzaufruf auf einem Block-3-Pfad', false, String(e.message)); }

  console.log('\n-- Blockabschluss-Review Block 3 — Behebungen (Chromium statt Simulator) --');
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
