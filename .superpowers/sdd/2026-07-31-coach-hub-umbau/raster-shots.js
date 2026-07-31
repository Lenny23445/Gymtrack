/* Belege zum Nachtrag: die Kacheln als Raster und die Heute-Karte mit dem
   sichtbaren Einstieg. 390x844, dunkles Thema, Coach "Nina", Premium
   erzwungen. Eigener Port (8805), damit der Lauf neben den Pruefsuiten
   stehen kann.

   Aufruf: node raster-shots.js                                            */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('C:/Users/Anwender/Desktop/Claude/gymtrack/node_modules/puppeteer');

const ROOT = path.resolve(__dirname, '../../..');
const OUT  = __dirname;
const PORT = 8805;
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

/* Ein Bestand, der die Kacheln wirklich fuellt: acht Wochen Verlauf plus zwei
   Einheiten in der laufenden Woche, ein Berichtsarchiv, ein Dossier, ein
   Chatverlauf und ein Plan fuer heute. Ohne das zeigten die Belege ein leeres
   Blatt und belegten nichts. */
const BOOT = () => {
  window.isPremium = () => true;
  const gate = document.getElementById('auth-gate'); if (gate) gate.style.display = 'none';
  const b = new Date(); b.setHours(10, 0, 0, 0);
  b.setDate(b.getDate() - ((b.getDay() + 6) % 7) + 2);
  const NOW = b.getTime();
  window.__NOW = NOW;
  if (!window.__echtNow) window.__echtNow = Date.now.bind(Date);
  Date.now = () => window.__NOW;
  window.aiCall = async () => null;
  window._crSignedIn = () => false;
  _fbUser = { uid: 'shot-uid', isAnonymous: false };

  const NAMEN = ['Bankdrücken', 'Kniebeugen', 'Kreuzheben', 'Latzug'];
  const MG    = ['brust', 'beine', 'ruecken', 'ruecken'];
  S.exercises = NAMEN.map((n, i) => ({
    id: 'ex' + i, name: n, muscleGroup: MG[i],
    targetSets: 3, targetReps: 8, repMin: 6, repMax: 10, targetType: 'reps', targetWeight: 0
  }));
  const mk = (ts, w) => ({
    id: 's' + ts, date: new Date(ts).toISOString(), duration: 3300,
    logs: ['ex0', 'ex1', 'ex2'].map(id => ({ exerciseId: id, sets: [
      { w: w, r: 8, type: 'normal' }, { w: w, r: 8, type: 'normal' }, { w: w, r: 8, type: 'normal' }] }))
  });
  S.sessions = [];
  for (let w = 8; w >= 1; w--) S.sessions.push(mk(NOW - w * 7 * 864e5, 60 + (8 - w) * 2.5));
  for (let i = 0; i < 2; i++) S.sessions.push(mk(NOW - (i + 1) * 864e5, 80));

  S.unitMode = 'kg';
  S.notifEnabled = false;
  S.coachReports = [];
  S.coachReportAt = { day: 0, hour: 18 };
  S.coachPush = { state: null, plan: [], permOk: true, owns: false };
  S.aiCoach = Object.assign({}, S.aiCoach, {
    name: 'Nina', tone: 'hart', preset: 'balanced',
    pushLevel: 'normal', inTraining: 'key', setFeedback: true, live: true, insights: true
  });
  S.weekPlan = S.weekPlan || {};
  S.weekPlan[todayKey()] = { type: 'exercises', exIds: ['ex0', 'ex1'] };
  persist();

  const reps = [];
  for (let w = 8; w >= 1; w--) {
    const ts = NOW - w * 7 * 864e5;
    const ws = CoachReport.weekStart(ts);
    const key = _crWeekKey(ts);
    if (ws === null || !key) continue;
    reps.unshift({ weekKey: key, label: _crLabel(ws),
                   numbers: CoachReport.weekNumbers(_crSessions(), ws),
                   text: '', forecast: null, ts: ts });
  }
  S.coachReports = reps.slice(0, 8);
  persist();

  try {
    CoachMemory.dossierSave(localStorage, 'shot-uid', Object.assign(CoachMemory.dossierEmpty(), {
      goal: 'Kraft',
      limits: [{ t: 'Schulter links zickt bei Überkopf', ts: NOW }],
      prefs:  [{ t: 'Lieber Kurzhanteln als Maschinen', ts: NOW }],
      works:  [{ t: 'Drei Minuten Pause bei Kniebeuge', ts: NOW }],
      updatedAt: NOW
    }));
  } catch (_) {}
  _aicHist = [{ role: 'user', content: 'Wie schwer soll ich Bankdrücken?' },
              { role: 'assistant', content: 'Bleib bei 80 kg und hol dir die achte Wiederholung.' }];
  try { localStorage.setItem('gt_aiChat', JSON.stringify(_aicHist)); } catch (_) {}
  try { renderHome(); } catch (_) {}
  return { ok: true };
};

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.emulateTimezone('Europe/Berlin');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  page.on('dialog', d => { try { d.dismiss(); } catch (_) {} });

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 60000 });
  await wait(1600);
  await page.evaluate(BOOT);
  /* Die Uhr wieder loslassen. Der Bestand oben braucht sie festgestellt
     ("Mittwoch dieser Woche"), Chart.js braucht sie LAUFEND: seine Animationen
     rechnen ueber Date.now(), und mit stehender Uhr blieben die Balken auf
     Hoehe 0 stehen — ein Beleg ohne Balken waere kein Beleg. Die
     Kalenderwoche bleibt dieselbe, die Zahlen aendern sich nicht. */
  await page.evaluate(() => { try { if (window.__echtNow) Date.now = window.__echtNow; } catch (_) {} });
  await wait(400);

  const schuss = async (name) => {
    const f = path.join(OUT, name);
    await page.screenshot({ path: f });
    console.log('  ' + name + '  ' + (fs.existsSync(f) ? fs.statSync(f).size + ' B' : 'FEHLT'));
  };

  // 1) Heute-Karte mit dem neuen Einstiegs-Signal
  await page.evaluate(() => { try { closeOv('ov-coach-hub'); closeOv('ov-ai-chat'); } catch (_) {} goTabId('heute'); renderHome(); });
  await wait(700);
  await schuss('raster-karte.png');

  // 2) Alle fuenf Kacheln zugeklappt im Raster
  await page.evaluate(() => { try { openCoachHub('chat'); } catch (_) {} });
  await wait(700);
  try { await page.click('#ch-h-chat'); } catch (_) {}
  await wait(700);
  await schuss('raster-zu.png');

  // 3) Woche offen, ueber beide Spalten
  try { await page.click('#ch-h-week'); } catch (_) {}
  await wait(1100);
  await schuss('raster-woche.png');

  // 4) Persoenlichkeit offen (Ton-Regler)
  try { await page.click('#ch-h-persona'); } catch (_) {}
  await wait(1100);
  await page.evaluate(() => { const b = document.getElementById('ch-body'); if (b) b.scrollTop = 0; });
  await wait(300);
  await schuss('raster-ton.png');

  await browser.close();
  server.close();
  console.log('\nBelege in ' + OUT);
})().catch(e => { console.error('HARNESS-FEHLER: ' + e.message); try { server.close(); } catch (_) {} process.exit(2); });
