/* Abnahme-Beleg Blockabschluss 4: ein Screenshot bei 390x844, Coach-Name
   "Nina", Premium erzwungen — die Coach-Einrichtung an der Stelle, an der die
   Trainings-Erinnerung angeboten wird (Schritt 3 von 3).
   Muster: abnahme-4-5-shots.js. Kein Test, reine Beleg-Erzeugung.
   Eigener Port: 8799 (8793/8794/8795/8796/8797/8798/8917 sind belegt). */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('C:/Users/Anwender/Desktop/Claude/gymtrack/node_modules/puppeteer');

const ROOT = 'C:/Users/Anwender/Desktop/Claude/gymtrack';
const DIR  = path.join(ROOT, '.superpowers/sdd/2026-07-29-live-coach-plan-v2');
const SHOT = path.join(DIR, 'abnahme-6-erinnerung.png');
const PORT = 8799;
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

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto('http://localhost:' + PORT + '/index.html', { waitUntil: 'networkidle2', timeout: 60000 });
  await wait(1500);

  await page.evaluate(() => {
    window.isPremium = () => true;
    const gate = document.getElementById('auth-gate'); if (gate) gate.style.display = 'none';
    // Ein Wochenplan macht den Erklaersatz der Karte wahr: "an deinen
    // Trainingstagen" soll nicht ins Leere zeigen.
    S.exercises = [{ id:'ex0', name:'Bankdrücken', muscleGroup:'brust',
                     targetSets:3, targetReps:8, repMin:6, repMax:10, targetType:'reps' }];
    ['mon','wed','fri'].forEach(k => { S.weekPlan[k] = { type:'exercises', exIds:['ex0'] }; });
    S.notifTime = '08:00';
    S.notifEnabled = false;                      // Auslieferungszustand
    S.aiCoach = Object.assign({}, S.aiCoach, { name: 'Nina', tone: 'sachlich' });
    delete S.aiCoach.preset;                     // frischer Nutzer ⇒ Einrichtung
    persist();
    openCoachHub('chat');                        // Weiche fuehrt in die Einrichtung
  });
  // Die Einblendung (animation:up .28s) muss durch sein, sonst zeigt der Beleg
  // die Zwischenstellung des Sheets statt seiner Ruhelage.
  await wait(700);
  await page.evaluate(() => { coachSetupStep(3); });
  await wait(500);

  const lage = await page.evaluate(() => ({
    offen: document.getElementById('ov-coach-setup').classList.contains('on'),
    step: _csStep,
    titel: (document.getElementById('cst-title') || {}).textContent,
    frage: (document.querySelector('#cst-body .pwz-q') || {}).textContent,
    karten: [...document.querySelectorAll('#cst-body .ch-preset')].map(b => ({
      onclick: b.getAttribute('onclick'), on: b.classList.contains('on'),
      titel: (b.querySelector('b') || {}).textContent })),
    notif: S.notifEnabled,
    prim: (document.querySelector('#cst-nav .btn-acc') || {}).textContent
  }));
  await page.screenshot({ path: SHOT });
  console.log('Beleg: ' + SHOT);
  console.log(JSON.stringify(lage, null, 2));
  await browser.close();
  server.close();
})().catch(e => { console.error('FEHLER: ' + e.message); try { server.close(); } catch (_) {} process.exit(2); });
