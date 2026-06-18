/**
 * GymTrack — Promo/Werbe-Screenshots aller Tabs mit Demo-Fülldaten
 * Start:  node promo-screenshots.js
 * Voraussetzung: Dev-Server läuft auf http://localhost:5500
 * Erzeugt 4 PNGs (1290×2796) in appstore-screenshots/tabs/
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const W = 430, H = 932, SCALE = 3;          // 1290 × 2796
const URL = 'http://localhost:5500/index.html';
const OUT = path.resolve(__dirname, 'appstore-screenshots', 'tabs');

const TABS = [
  { id: 'heute',    file: '01_Heute' },
  { id: 'uebungen', file: '02_Uebungen' },
  { id: 'stats',    file: '03_Statistik' },
  { id: 'erfolge',  file: '04_Erfolge' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  console.log('🚀 Starte Chromium …');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--hide-scrollbars',
           `--window-size=${W},${H}`],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: SCALE });
  console.log('🌐 Lade App …');
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 45000 });

  // Warten, bis App-Funktionen & Firebase-Anonymlogin durch sind
  await page.waitForFunction(
    () => typeof loadTourDemo === 'function' && typeof goTabId === 'function',
    { timeout: 20000 }
  );
  await sleep(3500); // Firebase Anon-Login + erster Snapshot settlen lassen

  // Live-Sync abklemmen + Demo-Daten laden (werden NICHT persistiert)
  await page.evaluate(() => {
    document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on'));
    try { if (window.FB) window.FB.onSnapshot = () => () => {}; } catch (e) {}
    try { if (typeof persist === 'function') { window.__op = persist; persist = () => {}; } } catch (e) {}
    // Demo-Daten sicher laden (Tour startet sie ggf. schon selbst)
    try { if (!_tourDemoActive) loadTourDemo(); } catch (e) {}
  });
  await sleep(400);

  // Tour-/Welcome-Overlay nur visuell entfernen — NICHT die End-Funktion
  // aufrufen (die würde restoreTourDemo() machen und die Demo-Daten löschen).
  const killTour = () => page.evaluate(() => {
    ['tour-veil-t','tour-veil-b','tour-veil-l','tour-veil-r',
     'tour-blocker','tour-ring','tour-card'].forEach(id => {
      const e = document.getElementById(id); if (e) e.remove();
    });
    document.querySelectorAll('.ov.on').forEach(o => o.classList.remove('on'));
  });
  await killTour();
  await sleep(200);

  for (const t of TABS) {
    await page.evaluate((id) => {
      goTabId(id);
      const app = document.querySelector('.app, #app, body');
      if (app && app.scrollTo) app.scrollTo({ top: 0 });
      window.scrollTo(0, 0);
    }, t.id);
    await killTour();
    await sleep(900); // Render + Charts + Animationen

    const outFile = path.join(OUT, `${t.file}.png`);
    await page.screenshot({ path: outFile, clip: { x: 0, y: 0, width: W, height: H } });
    const kb = Math.round(fs.statSync(outFile).size / 1024);
    console.log(`📸 ${t.file}.png  (${kb} KB)`);
  }

  await browser.close();
  console.log(`\n🎉 Fertig! Ordner: ${OUT}`);
})();
