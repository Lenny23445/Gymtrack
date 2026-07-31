/* Abnahme-Belege Block 3: zwei Screenshots bei 390x844, Coach-Name "Nina",
   Premium erzwungen. Muster: task-17-check.js (Server + Puppeteer, eigener Port).
   Kein Test — reine Beleg-Erzeugung fuer die Abnahme, kein PASS/FAIL-Gate. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '../../..');
const puppeteer = require(path.join(REPO, 'node_modules/puppeteer'));

const argRoot = (process.argv.find(a => a.startsWith('--root=')) || '').slice(7);
const ROOT = argRoot ? path.resolve(argRoot) : REPO;
const DIR  = path.join(ROOT, '.superpowers/sdd/2026-07-29-live-coach-plan-v2');
const SHOT_TRAINING = path.join(DIR, 'abnahme-4-training.png');
const SHOT_RUECKFRAGE = path.join(DIR, 'abnahme-5-rueckfrage.png');
const PORT = 8797; // eigener Port (8793/8794/8795 sind von task-9/10/17 belegt)
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

const wait = ms => new Promise(r => setTimeout(r, ms));

// Grundzustand: Premium an, Coach-Name "Nina", sechs Uebungen, zehn Einheiten
// Verlauf (gleiches Topgewicht), damit die Begruessung auf einen echten
// letzten Stand verweisen kann statt auf einen Erstlauf-Platzhalter.
const BOOTSTATE = () => {
  window.isPremium = () => true;
  const gate = document.getElementById('auth-gate'); if (gate) gate.style.display = 'none';
  const NAMEN = ['Bankdrücken', 'Kniebeugen', 'Kreuzheben', 'Latzug', 'Beinpresse', 'Bizeps-Curls (LH)'];
  S.exercises = NAMEN.map((n, i) => ({
    id: 'ex' + i, name: n, muscleGroup: i < 3 ? 'brust' : 'ruecken',
    targetSets: 4, targetReps: 8, repMin: 6, repMax: 10, targetType: 'reps',
    showPlateCalc: i < 3 || i === 5
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
  delete S.availablePlates;
  S.plateBar = 20;
  S.coachSession = null;
  S.aiCoach = Object.assign({}, S.aiCoach, { name: 'Nina', tone: 'sachlich', inTraining: 'key', setFeedback: true, pushLevel: 'normal', voiceOn: true });
  persist();
};

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  page.on('dialog', d => { try { d.dismiss(); } catch (_) {} });

  const ev = async (fn, arg) => (arg === undefined) ? await page.evaluate(fn) : await page.evaluate(fn, arg);

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 60000 });
  await wait(1400);
  await ev(BOOTSTATE);

  // Training starten: erste drei Uebungen, Overlay auf.
  await ev(() => {
    wkExIds = S.exercises.slice(0, 3).map(e => e.id);
    startActive();
    openOv('ov-wk');
  });
  // Sheet-Einblendung (animation:up .28s) abwarten, dann die Begruessung: sie
  // braucht einen Moment, bis sie in #wk-coach-bar steht (CS_GAP_MS-Anlauf).
  await wait(2200);

  const nachStart = await ev(() => ({
    bar: (document.getElementById('wk-coach-bar').textContent || '').trim(),
    sichtbar: document.getElementById('wk-coach-bar').style.display !== 'none'
  }));
  console.log('Vor Screenshot 1 — Coach-Leiste: ' + JSON.stringify(nachStart));

  await page.screenshot({ path: SHOT_TRAINING });
  console.log('Geschrieben: ' + SHOT_TRAINING + ' (' + fs.statSync(SHOT_TRAINING).size + ' bytes)');

  // Ersten Arbeitssatz abhaken -> Satz-Rueckfrage (drei Chips) erscheint
  // synchron in derselben Leiste, 8 s Zeitfenster.
  await ev(() => {
    wkLogs[0].sets[0].w = '60';
    wkLogs[0].sets[0].r = '8';
    toggleSetDone(0, 0);
  });
  await wait(500); // Sheet-/Chip-Einblendung abwarten

  const rueckfrage = await ev(() => ({
    frage: (document.querySelector('#wk-coach-bar .cb-ask3-q') || {}).textContent || '',
    chips: [...document.querySelectorAll('#wk-coach-bar .cb-ask3 button')].map(b => b.textContent.trim())
  }));
  console.log('Vor Screenshot 2 — Rueckfrage: ' + JSON.stringify(rueckfrage));

  await page.screenshot({ path: SHOT_RUECKFRAGE });
  console.log('Geschrieben: ' + SHOT_RUECKFRAGE + ' (' + fs.statSync(SHOT_RUECKFRAGE).size + ' bytes)');

  await browser.close();
  server.close();
})().catch(e => { console.error('FEHLER: ' + e.message); try { server.close(); } catch (_) {} process.exit(1); });
