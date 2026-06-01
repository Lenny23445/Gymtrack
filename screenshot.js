/**
 * My Gym Track — App Store Screenshot Generator
 * Ausführen mit: node screenshot.js
 * Erstellt 5 PNG-Dateien (1290×2796 px) im Ordner appstore-screenshots/
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const SLIDES = [
  { id: 1, name: '01_Dashboard' },
  { id: 2, name: '02_Workout' },
  { id: 3, name: '03_Progress' },
  { id: 4, name: '04_Plaene' },
  { id: 5, name: '05_CTA' },
];

const WIDTH  = 1290;
const HEIGHT = 2796;
const HTML   = path.resolve(__dirname, 'appstore-previews.html');
const OUT    = path.resolve(__dirname, 'appstore-screenshots');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  console.log('🚀 Starte Chromium...');
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--hide-scrollbars',
      `--window-size=${WIDTH},${HEIGHT}`,
    ],
  });

  for (const slide of SLIDES) {
    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });

    const url = `file:///${HTML.replace(/\\/g, '/')}?slide=${slide.id}`;
    console.log(`📸 Slide ${slide.id}/5: ${slide.name}...`);

    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

    // Warte, bis das JS die Slide-Selektion abgeschlossen hat
    await page.waitForFunction(() => {
      const slides = document.querySelectorAll('.slide');
      return slides.length > 0;
    }, { timeout: 10000 }).catch(() => {});

    // Extra-Wartezeit für CSS-Animationen & Gradienten
    await new Promise(r => setTimeout(r, 800));

    const outFile = path.join(OUT, `${slide.name}.png`);
    await page.screenshot({
      path: outFile,
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
    });

    const kb = Math.round(fs.statSync(outFile).size / 1024);
    console.log(`   ✅ Gespeichert: ${outFile} (${kb} KB)`);

    await page.close();
  }

  await browser.close();

  console.log('\n🎉 Alle Screenshots fertig!');
  console.log(`📁 Ordner: ${OUT}`);
  console.log('\nDateien:');
  SLIDES.forEach(s => console.log(`   • ${s.name}.png  (${WIDTH}×${HEIGHT} px)`));
})();
