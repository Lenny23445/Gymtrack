/* Fix-Welle zur Abschluss-Review des Coach-Hub-Umbaus.

   Jeder Befund der Review bekommt hier GENAU EINE Pruefung, und jede ist so
   gebaut, dass sie am ungefixten Baum ROT ist:

     C1  ein Kraftziel wird zum Arbeitsgewicht (ex.targetWeight)
     I1  Vorwoche ueber Millisekunden statt Kalender (Fruehjahrsumstellung)
     I2  Heute-Karte und Wochenkachel nennen verschiedene Zahlen
     I3  der Ton-Regler verliert nach der Zeigergeste die Tastatur
     M1  Wochenbalken: acht Balken, die keine acht zusammenhaengenden Wochen sind
     M2  "1.200" wird still zu 1,2 und mit dem falschen Hinweis abgelehnt
     H   Heute-Karte: was heute ansteht steht gross, die Wochenzahl klein

   Die drei Zeitbefunde brauchen eine FESTE Uhr UND eine feste Zeitzone: sie
   haengen an der Fruehjahrsumstellung (Europe/Berlin, So 29.03.2026). Beides
   wird gesetzt — process.env.TZ fuer Node, page.emulateTimezone fuer Chromium,
   Date.now() im Seitenkontext fuer die App. Ohne das waere der Lauf im Sommer
   gruen und im April rot.

   Eigener Port: 8804 (8793 task-9, 8794 task-10, 8795 task-17, 8796 block3,
   8798 task-19, 8800 task-21, 8801 task-22, 8802 block5, 8803 hub).

   Aufruf:
     node fix-check.js              gegen den Arbeitsstand
     node fix-check.js --root=<dir> gegen einen anderen Baum (Rot-Lauf)         */
process.env.TZ = 'Europe/Berlin';
const http = require('http');
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '../../..');
const puppeteer = require(path.join(REPO, 'node_modules/puppeteer'));

const argRoot = (process.argv.find(a => a.startsWith('--root=')) || '').slice(7);
const ROOT = argRoot ? path.resolve(argRoot) : REPO;
const SRC  = path.join(ROOT, 'index.html');
const PORT = 8804;
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
// Ein Rot-Lauf gegen einen Baum ohne die neuen Funktionen liefert {__err} —
// die Pruefung soll dann ROT sein, nicht den Harness abschiessen.
const O = (x) => (x && !x.__err) ? x : { fehler: (x && x.__err) || 'kein Ergebnis' };

/* Grundzustand. Alles kommt als Kalenderdatum herein ([Jahr, MonatIndex, Tag,
   Stunde, Minute]) und wird IM BROWSER zu einem Zeitstempel gemacht: nur so
   liegt eine Einheit garantiert in der Woche, in der sie liegen soll — an einer
   Zeitumstellung ist eine Woche 167 oder 169 Stunden lang. */
const BOOT = (o) => {
  const opt = Object.assign({ now: [2026, 2, 30, 10, 0], einheiten: [], reihe: null,
                              berichte: [], unit: 'kg' }, o || {});
  const D = (a) => new Date(a[0], a[1], a[2], a[3] || 0, a[4] || 0, 0, 0).getTime();

  window.isPremium = () => true;
  const gate = document.getElementById('auth-gate'); if (gate) gate.style.display = 'none';

  const NOW = D(opt.now);
  window.__NOW = NOW;
  if (!window.__echtNow) window.__echtNow = Date.now.bind(Date);
  Date.now = () => window.__NOW;

  // Kein Netz im Messlauf.
  window.aiCall = async () => null;
  window._crSignedIn = () => false;
  _fbUser = { uid: 'fix-uid', isAnonymous: false };

  const NAMEN = ['Bankdrücken', 'Kniebeugen', 'Kreuzheben', 'Latzug'];
  const MG    = ['brust', 'beine', 'ruecken', 'ruecken'];
  S.exercises = NAMEN.map((n, i) => ({
    id: 'ex' + i, name: n, muscleGroup: MG[i],
    targetSets: 3, targetReps: 8, repMin: 6, repMax: 10, targetType: 'reps', targetWeight: 0
  }));

  const mk = (ts, e, i) => {
    const sets = [];
    for (let k = 0; k < (e.saetze || 1); k++) sets.push({ w: e.w, r: e.r, type: 'normal' });
    return { id: 'fs' + i + '-' + ts, date: new Date(ts).toISOString(), duration: 3300,
             logs: [{ exerciseId: e.ex || 'ex0', sets: sets }] };
  };
  S.sessions = (opt.einheiten || []).map((e, i) => mk(D(e.at), e, i));

  // Eine Reihe gleichartiger Wochen: Startdatum plus n Kalenderwochen. Bewusst
  // ueber setDate() und nicht ueber + 7 Tage in Millisekunden — sonst haette der
  // Pruefstand denselben Fehler wie der Code, den er misst.
  if (opt.reihe) {
    const r = opt.reihe;
    const d = new Date(D(r.start));
    for (let i = 0; i < r.wochen; i++) {
      S.sessions.push(mk(d.getTime(), r, 100 + i));
      d.setDate(d.getDate() + 7);
    }
  }

  S.unitMode = opt.unit;
  S.notifEnabled = false;
  S.coachReports = [];
  S.coachReportAt = { day: 0, hour: 18 };
  S.coachPush = { state: null, plan: [], permOk: true, owns: false };
  S.aiCoach = Object.assign({}, S.aiCoach, {
    name: 'Max', tone: 'sachlich', preset: 'balanced',
    pushLevel: 'normal', inTraining: 'key', setFeedback: true, live: true, insights: true
  });
  persist();

  // Archivierte Wochenberichte, so wie _crBuild() sie ablegt.
  (opt.berichte || []).forEach(b => {
    const ts  = D(b.at);
    const ws  = CoachReport.weekStart(ts);
    const key = _crWeekKey(ts);
    if (ws === null || !key) return;
    S.coachReports.unshift({
      weekKey: key, label: _crLabel(ws),
      numbers: { vol: b.vol, sets: b.sets, workouts: b.workouts, prs: [], muscles: {},
                 prevVol: b.prevVol || 0, volDelta: 0, streak: 0 },
      text: b.text || 'Ordentliche Woche.', forecast: null, ts: ts
    });
  });
  persist();

  return { NOW: NOW, sessions: S.sessions.length, berichte: S.coachReports.length,
           wsNow: new Date(CoachReport.weekStart(NOW)).toString().slice(0, 15) };
};

// Die Kennzahlenzeile der Wochenkachel, so wie der Nutzer sie liest.
const KENNZAHLEN = () => [...document.querySelectorAll('#chw-nums .aia-stat')].map(s => ({
  wert:  ((s.querySelector('.chw-n') || {}).textContent || '').trim(),
  label: ((s.querySelector('.aia-stat-l') || {}).textContent || '').trim(),
  delta: ((s.querySelector('.chw-d') || {}).textContent || '').replace(/\s+/g, ' ').trim()
}));

// Die Heute-Karte: beide Zeilen, ihr Text UND ihre Schriftgroesse.
const KARTE = () => {
  const host = document.getElementById('coach-today-card');
  const q = (s) => host ? host.querySelector(s) : null;
  const gr = (el) => el ? parseFloat(getComputedStyle(el).fontSize) : -1;
  const head = q('.aic-head'), sub = q('.aic-txt .aic-sub');
  return {
    head: head ? (head.textContent || '').trim() : null,
    sub:  sub ? (sub.textContent || '').trim() : null,
    headGroesse: gr(head), subGroesse: gr(sub),
    einstiege: [...document.querySelectorAll('#pg-heute *')].filter(el =>
      /openCoachHub/.test(String(el.onclick || '') + ' ' + (el.getAttribute('onclick') || ''))).length
  };
};

const STUB_EMPFEHLUNG = () => {
  window._coachTodaySuggestion = () => ({
    kind: 'plan', head: 'Push-Tag steht an', text: 'Zuletzt Bankdrücken 62,5 kg',
    chip: 'Dein Plan', chip2: '3 Übungen', ringLbl: 'Bereit', pct: 72,
    cta: { label: 'Training starten', on: 'window.__ctaRan=true' }
  });
  _aicSig = null;
  renderCoachTodayCard();
};

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.emulateTimezone('Europe/Berlin');
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  page.on('dialog', d => { try { d.dismiss(); } catch (_) {} });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text().slice(0, 200)); });

  const ev = async (fn, arg) => {
    try { return (arg === undefined) ? await page.evaluate(fn) : await page.evaluate(fn, arg); }
    catch (e) { return { __err: String((e && e.message) || e).slice(0, 240) }; }
  };
  const boot = async (opt) => {
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 60000 });
    await wait(1500);
    return O(await ev(BOOT, opt || {}));
  };
  const hubAuf = async (kachel) => {
    await ev((k) => { try { closeOv('ov-ai-chat'); openCoachHub(k); } catch (_) {} }, kachel || 'week');
    await wait(700);
  };
  let r;

  /* ══════════════════════════════════════════════════════════════════════
     C1 — ein Kraftziel darf nie zum Arbeitsgewicht werden
     getSuggestedWeight() gibt ex.targetWeight als ARBEITSGEWICHT zurueck,
     solange die Uebung keine Historie mit Gewicht hat (index.html:12807/12815).
     Ein Ziel auf so einer Uebung wird im Training angesagt.
     ══════════════════════════════════════════════════════════════════════ */
  const ACHT_WOCHEN = { start: [2026, 3, 13, 10, 0], wochen: 8, saetze: 3, w: 60, r: 8, ex: 'ex0' };
  await boot({ now: [2026, 5, 10, 10, 0], reihe: ACHT_WOCHEN });

  r = O(await ev(() => {
    const ex3 = exById('ex3');                       // Latzug: nie geloggt
    const vorher = getSuggestedWeight(ex3);
    const kand   = _chGoalCandidates().map(e => e.id);
    _chGoalEx = 'ex3';
    coachSetGoal('ex3', 100);
    return {
      vorher: vorher, nachher: getSuggestedWeight(exById('ex3')),
      kand: kand, verlauf3: _crHistory('ex3').length, verlauf0: _crHistory('ex0').length,
      target: (S.exercises || []).map(e => e && e.targetWeight),
      hinweis: (typeof _chGoalHint === 'string') ? _chGoalHint : null,
      // Die Aufwaermleiter haengt am selben Wert — sie darf gar nicht erst
      // entstehen, wenn es kein Arbeitsgewicht gibt.
      warmup: (function () {
        try { const w = getSuggestedWeight(exById('ex3'));
              return w == null ? null : (window.CoachWarmup ? 'leiter' : 'kein-modul'); }
        catch (_) { return 'fehler'; }
      })()
    };
  }));
  check('C1 — Kraftziel auf einer Uebung OHNE Verlauf: sie steht gar nicht zur Wahl, das Ziel wird mit Hinweis abgelehnt, ex.targetWeight bleibt 0 und getSuggestedWeight() bleibt null (kein Ziel als Arbeitsgewicht im Training)',
    r.vorher === null && r.nachher === null && r.verlauf3 === 0 &&
    Array.isArray(r.kand) && r.kand.indexOf('ex3') < 0 &&
    (r.target || []).every(t => !t) && (r.hinweis || '').length > 10 && r.warmup === null,
    JSON.stringify(r));

  check('C1 — die Einschraenkung kostet keine Funktion: Uebungen MIT genug Messwochen stehen weiter zur Wahl und lassen sich als Ziel setzen',
    Array.isArray(r.kand) && r.kand.indexOf('ex0') >= 0 && r.verlauf0 >= 4,
    JSON.stringify({ kand: r.kand, verlauf0: r.verlauf0 }));

  r = O(await ev(() => {
    coachSetGoal('ex0', 120);
    return { target: (S.exercises || []).map(e => e && e.targetWeight),
             hinweis: (typeof _chGoalHint === 'string') ? _chGoalHint : null };
  }));
  check('C1 — Gegenprobe: ein Ziel auf der Uebung MIT Verlauf wird weiterhin gesetzt (genau eines, ohne Hinweis)',
    (r.target || []).filter(t => t > 0).length === 1 && (r.target || [])[0] === 120 &&
    !(r.hinweis || '').length,
    JSON.stringify(r));

  /* ══════════════════════════════════════════════════════════════════════
     M2 — "1.200" wird still zu 1,2
     ══════════════════════════════════════════════════════════════════════ */
  await boot({ now: [2026, 5, 10, 10, 0], reihe: ACHT_WOCHEN });
  r = O(await ev(() => {
    coachSetGoal('ex0', '1.200');
    return { hinweis: (typeof _chGoalHint === 'string') ? _chGoalHint : null,
             target: (S.exercises || []).map(e => e && e.targetWeight) };
  }));
  check('M2 — "1.200" wird als EINGABEFEHLER benannt (die Zahl steht im Hinweis) und nicht mit "Du hebst rechnerisch schon ..." abgelehnt; ex.targetWeight bleibt 0',
    (r.hinweis || '').length > 10 &&
    !/rechnerisch schon|already at an estimated/i.test(r.hinweis || '') &&
    /1\.200/.test(r.hinweis || '') &&
    (r.target || []).every(t => !t),
    JSON.stringify(r));

  /* ══════════════════════════════════════════════════════════════════════
     I1 — Vorwoche ueber den Kalender, nicht ueber Millisekunden
     Laufende Woche: Mo 30.03.2026 (die Woche NACH der Umstellung am 29.03).
     ws - 7 * 864e5 landet auf So 22.03 23:00 -> Wochenstart Mo 16.03, also eine
     Woche zu weit zurueck.
       Woche 16.03 (falsch):  2 Einheiten, 2 Saetze, 1.000 kg
       Woche 23.03 (richtig): 1 Einheit,   3 Saetze, 1.500 kg
       laufende Woche:        1 Einheit,   4 Saetze, 2.000 kg
     Die drei Deltas sind in beiden Lesarten verschieden — die Pruefung kann
     also nicht zufaellig gruen sein.
     ══════════════════════════════════════════════════════════════════════ */
  const DST_EINHEITEN = [
    { at: [2026, 2, 16, 10, 0], saetze: 1, w: 50, r: 10, ex: 'ex0' },
    { at: [2026, 2, 18, 10, 0], saetze: 1, w: 50, r: 10, ex: 'ex0' },
    { at: [2026, 2, 24, 10, 0], saetze: 3, w: 50, r: 10, ex: 'ex0' },
    { at: [2026, 2, 30,  9, 0], saetze: 4, w: 50, r: 10, ex: 'ex0' }
  ];
  const dst = await boot({ now: [2026, 2, 30, 10, 0], einheiten: DST_EINHEITEN });

  r = O(await ev(() => {
    const w = _aicWeek();
    // Erwartungswerte ohne shiftWeeks() gerechnet: feste Kalenderdaten mitten
    // in der jeweiligen Woche. So misst der Pruefstand nicht sich selbst.
    const woche = (a) => CoachReport.weekNumbers(_crSessions(), new Date(a[0], a[1], a[2], 12, 0).getTime());
    return { vol: w && w.vol, prev: w && w.prev,
             sollPrev: woche([2026, 2, 25]).vol,     // Woche 23.03
             falschPrev: woche([2026, 2, 18]).vol }; // Woche 16.03
  }));
  check('I1 — Heute-Karte in der Woche nach der Fruehjahrsumstellung: "Vorwoche" ist die Kalenderwoche davor (23.03), nicht die vorletzte (16.03)',
    r.vol === 2000 && r.prev === 1500 && r.sollPrev === 1500 && r.falschPrev === 1000,
    JSON.stringify(Object.assign({ wsNow: dst.wsNow }, r)));

  await hubAuf('week');
  r = O(await ev(KENNZAHLEN));
  const deltas = Array.isArray(r) ? r.map(x => x.delta) : [];
  check('I1 — Wochenkachel in derselben Woche: Einheiten, Saetze und Volumen vergleichen gegen die Woche 23.03 (→ 0 %, ↑ 33 %, ↑ 33 %) statt gegen die vorletzte',
    deltas.length === 3 && deltas[0] === '→ 0 %' && deltas[1] === '↑ 33 %' && deltas[2] === '↑ 33 %',
    JSON.stringify(r));

  /* ══════════════════════════════════════════════════════════════════════
     M1 — acht Balken sind acht ZUSAMMENHAENGENDE Wochen
     Uhr: Mo 06.04.2026 00:30 lokal. now - i*7*864e5 rutscht ueber die
     Umstellung um eine Stunde zurueck und ueberspringt dabei eine Wochengrenze.
     ══════════════════════════════════════════════════════════════════════ */
  await boot({ now: [2026, 3, 6, 0, 30],
               reihe: { start: [2026, 0, 5, 10, 0], wochen: 14, saetze: 2, w: 50, r: 10, ex: 'ex0' } });
  r = O(await ev(() => {
    const daten = _chWeekBarData(_crCurrent()) || [];
    return { keys: daten.map(x => x.weekKey) };
  }));
  const keys = (r.keys || []);
  const nr = keys.map(k => parseInt(String(k).split('-W')[1], 10));
  const lueckenlos = nr.length === 8 && nr.every((v, i) => i === 0 || v === nr[i - 1] + 1);
  check('M1 — Wochenbalken um 00:30 in der Woche nach der Umstellung: acht Balken sind acht ZUSAMMENHAENGENDE Kalenderwochen, keine faellt aus dem Bild',
    keys.length === 8 && lueckenlos,
    JSON.stringify({ keys: keys }));

  /* ══════════════════════════════════════════════════════════════════════
     I2 — eine Quelle fuer "diese Woche"
     Der Bericht der laufenden Woche liegt im Archiv (So 18:00 gebaut, 1.000 kg),
     danach kommt eine Einheit dazu. Karte und Kachel duerfen sich nicht
     widersprechen.
     ══════════════════════════════════════════════════════════════════════ */
  await boot({
    now: [2026, 5, 10, 19, 0],                                  // Mi 10.06.2026 19:00
    einheiten: [
      { at: [2026, 5,  3, 10, 0], saetze: 2, w: 50, r: 10, ex: 'ex0' },  // Vorwoche: 1.000 kg
      { at: [2026, 5,  8, 10, 0], saetze: 2, w: 50, r: 10, ex: 'ex0' },  // laufende Woche
      { at: [2026, 5, 10, 18, 0], saetze: 2, w: 50, r: 10, ex: 'ex0' }   // die Einheit NACH dem Bericht
    ],
    berichte: [{ at: [2026, 5, 9, 18, 0], vol: 1000, sets: 2, workouts: 1, prevVol: 1000 }]
  });
  await ev(STUB_EMPFEHLUNG);
  await wait(300);
  await hubAuf('week');
  r = O(await ev(() => {
    const kachel = _chKzWeek(_crCurrent());
    const karte  = _aicWeekText(_aicWeek());
    return {
      kachel: kachel, karte: karte,
      kartenZeile: ((document.querySelector('#coach-today-card .aic-txt .aic-sub') || {}).textContent || '').trim(),
      nums: [...document.querySelectorAll('#chw-nums .aia-stat')].map(s =>
        ((s.querySelector('.chw-n') || {}).textContent || '').trim()),
      balken: (_chWeekBarData(_crCurrent()) || []).slice(-1).map(x => x.vol)[0],
      archiv: ((S.coachReports || [])[0] || {}).numbers,
      berichtText: (_crCurrent() || { rep: {} }).rep.text,
      fertig: (_crCurrent() || {}).fertig
    };
  }));
  check('I2 — Bericht im Archiv PLUS eine spaetere Einheit: Heute-Karte und Wochenkachel nennen fuer die laufende Woche exakt dieselbe Zahl',
    typeof r.kachel === 'string' && r.kachel.length > 3 && r.kachel === r.karte,
    JSON.stringify(r));

  check('I2 — und es ist die Zahl aus den EINHEITEN (2.000), nicht der eingefrorene Archivwert (1.000) — die Einheit nach dem Berichtstermin verschwindet nicht; Text und Prognose bleiben aus dem Bericht',
    /2\.000/.test(r.kachel || '') && (r.nums || []).indexOf('2.000') >= 0 &&
    r.balken === 2000 && ((r.archiv || {}).vol === 1000) &&
    r.fertig === true && typeof r.berichtText === 'string' && r.berichtText.length > 3,
    JSON.stringify({ kachel: r.kachel, nums: r.nums, balken: r.balken,
                     archiv: r.archiv, fertig: r.fertig, text: r.berichtText }));

  /* ══════════════════════════════════════════════════════════════════════
     H — Heute-Karte: was heute ansteht steht gross, die Wochenzahl klein
     ══════════════════════════════════════════════════════════════════════ */
  const k = O(await ev(KARTE));
  check('H — Heute-Karte: die Handlungsaufforderung ("was heute ansteht") traegt die groessere Schrift, die Wochenzahl steht kleiner darunter — beide Angaben bleiben auf der Karte',
    k.head === 'Push-Tag steht an' &&
    /[↑↓→]/.test(k.sub || '') && /%/.test(k.sub || '') && /\d/.test(k.sub || '') &&
    k.headGroesse > k.subGroesse,
    JSON.stringify(k));

  check('H — Gestaltungsregel 1 haelt: im Heute-Tab gibt es genau EINEN Einstieg in den Coach-Hub',
    k.einstiege === 1,
    JSON.stringify({ einstiege: k.einstiege }));

  /* ══════════════════════════════════════════════════════════════════════
     I3 — nach der Zeigergeste bleibt die Tastatur bedienbar
     ══════════════════════════════════════════════════════════════════════ */
  await boot({ now: [2026, 5, 10, 10, 0], reihe: ACHT_WOCHEN });
  await hubAuf('persona');
  await ev(() => { try { setAiCoachOpt('tone', 'sachlich'); } catch (_) {} });
  await wait(300);
  let gezogen = false;
  try {
    const h = await page.$('#ch-tone-slider');
    const box = h && await h.boundingBox();
    if (box) {
      const y = box.y + box.height / 2;
      await page.mouse.move(box.x + 4, y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * (2 / 3), y, { steps: 8 });
      await page.mouse.up();
      gezogen = true;
    }
  } catch (e) { gezogen = String(e.message).slice(0, 140); }
  await wait(500);                                   // 190 ms Rerender + Luft
  const nachZug = O(await ev(() => ({ tone: (S.aiCoach || {}).tone,
    fokus: document.activeElement ? document.activeElement.id || document.activeElement.tagName : null })));
  await page.keyboard.press('ArrowLeft');
  await wait(350);
  const nachTaste = O(await ev(() => ({ tone: (S.aiCoach || {}).tone,
    now: (document.getElementById('ch-tone-slider') || { getAttribute: () => null }).getAttribute('aria-valuenow'),
    fokus: document.activeElement ? document.activeElement.id || document.activeElement.tagName : null })));
  check('I3 — Ziehen und danach Pfeiltaste: nach der Zeigergeste liegt der Fokus wieder auf dem Regler, und die Pfeiltaste bewegt ihn um genau einen Rastpunkt zurueck',
    gezogen === true && nachZug.tone === 'hart' && nachZug.fokus === 'ch-tone-slider' &&
    nachTaste.tone === 'sachlich' && nachTaste.now === '1' && nachTaste.fokus === 'ch-tone-slider',
    JSON.stringify({ gezogen, nachZug, nachTaste }));

  await browser.close();
  server.close();

  /* ── Statisch: keine Millisekunden-Wochenrechnung mehr im Coach-Code ──── */
  try {
    // Gemessen wird der CODE, nicht die Erklaerung: der Kommentar, der
    // begruendet, WARUM 7 * 864e5 hier falsch war, darf stehen bleiben.
    const roh = fs.readFileSync(SRC, 'utf8');
    const src = String(roh)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const stelle = (name) => {
      const i = src.indexOf('function ' + name);
      if (i < 0) return '';
      const j = src.indexOf('\nfunction ', i + 1);
      return src.slice(i, j > i ? j : i + 3000);
    };
    const verdaechtig = (s) => /7\s*\*\s*864e5|7\s*\*\s*24\s*\*\s*36e5|604800000/.test(s);
    const treffer = ['_aicWeek', '_chWeekNumsHTML', '_chWeekBarData'].filter(n => verdaechtig(stelle(n)));
    check('Statisch: _aicWeek, _chWeekNumsHTML und _chWeekBarData verschieben Wochen ueber den Kalender (CoachReport.shiftWeeks) — nirgends mehr ueber 7 * 864e5',
      treffer.length === 0 && /shiftWeeks/.test(src),
      JSON.stringify({ treffer, exportiert: /shiftWeeks/.test(src) }));
  } catch (e) { check('Statisch: keine Millisekunden-Wochenrechnung', false, String(e.message)); }

  try {
    const rep = fs.readFileSync(path.join(ROOT, 'js/coach-report.js'), 'utf8');
    check('Statisch: js/coach-report.js exportiert shiftWeeks — die Kalenderrechnung liegt weiter im Modul und wird nicht in index.html nachgebaut',
      /shiftWeeks:\s*shiftWeeks/.test(rep),
      JSON.stringify({ export: /shiftWeeks:\s*shiftWeeks/.test(rep) }));
  } catch (e) { check('Statisch: shiftWeeks exportiert', false, String(e.message)); }

  console.log('\n-- Fix-Welle zur Abschluss-Review des Coach-Hub-Umbaus --');
  console.log('   Baum: ' + ROOT + '   Zeitzone: ' + process.env.TZ);
  let fail = 0;
  for (const t of results) {
    console.log((t.ok ? 'PASS  ' : 'FAIL  ') + t.name);
    if (!t.ok) { fail++; console.log('        got: ' + String(t.got).slice(0, 700)); }
  }
  const relevant = errors.filter(e => !/favicon|firebase|gstatic|net::ERR|Failed to load resource|Tracking Prevention|ERR_INTERNET_DISCONNECTED/i.test(e));
  console.log('\nSeitenfehler (gefiltert): ' + (relevant.length ? '\n  ' + relevant.join('\n  ') : 'keine'));
  console.log(`\nErgebnis: ${results.length - fail}/${results.length} PASS`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS-FEHLER: ' + e.message); try { server.close(); } catch (_) {} process.exit(2); });
