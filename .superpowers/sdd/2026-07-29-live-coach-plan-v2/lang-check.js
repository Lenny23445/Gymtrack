/* Lang-Fix-Verifikation: _lang() muss der tatsaechlichen Anzeigesprache (GT_LANG)
   folgen, nicht nur gt_lang lesen. Statischer Node-Server + Chromium ueber
   Puppeteer, drei isolierte Browser-Kontexte (eigenes localStorage je Fall):
     1) gt_lang unbenannt, Geraet Englisch  -> _lang()==='en', GT_LANG===_lang()
     2) gt_lang='de', Geraet Englisch        -> _lang()==='de' (manuelle Wahl siegt)
     3) gt_lang unbenannt, Geraet Deutsch    -> _lang()==='de'
   Zusaetzlich in Fall 1: ein echter Coach-Satz (_say('exOpen', ...)) zieht mit,
   verglichen gegen CoachPersona.say(..., 'en') direkt. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '../../..');
const puppeteer = require(path.join(REPO, 'node_modules/puppeteer'));

const argRoot = (process.argv.find(a => a.startsWith('--root=')) || '').slice(7);
const ROOT = argRoot ? path.resolve(argRoot) : REPO;
const PORT = 8917; // eigener Port, unabhaengig von task-9-check.js (8793)
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

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  // Jeder Fall bekommt einen eigenen Browser-Kontext: eigenes localStorage,
  // keine Reihenfolge-Abhaengigkeit zwischen den drei Faellen.
  const runCase = async (label, { navLang, navLangs, presetGtLang }, evalFn) => {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    // Laeuft VOR jedem Dokument dieser Seite/Kontext: Geraetesprache faelschen,
    // und (falls verlangt) gt_lang bereits setzen, bevor index.html sein
    // Top-Level-Script (GT_LANG-Berechnung bei ~7466) ueberhaupt ausfuehrt.
    await page.evaluateOnNewDocument((nl, nls, preset) => {
      Object.defineProperty(navigator, 'language',  { get: () => nl });
      Object.defineProperty(navigator, 'languages', { get: () => nls });
      if (preset !== null) localStorage.setItem('gt_lang', preset);
    }, navLang, navLangs, presetGtLang === undefined ? null : presetGtLang);
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 800));
    let r;
    try { r = await page.evaluate(evalFn); }
    catch (e) { r = { __err: String((e && e.message) || e).slice(0, 300) }; }
    await ctx.close();
    return { r, errors };
  };

  // ── Fall 1: gt_lang nicht gesetzt, Geraet Englisch ───────────────────────
  let { r: r1 } = await runCase('en-auto', { navLang: 'en-US', navLangs: ['en-US','en'], presetGtLang: null }, () => {
    // Dieselbe Quelle wie die Oberflaeche: der Satzkatalog traegt seit der
    // Blockabschluss-Review keine feste Einheit mehr, die Einheit haengt am
    // Wert. Ein Literal hier pruefte den Satz gegen andere Werte als die App.
    const vars = _chToneVars();
    return {
      GT_LANG_PREF, GT_LANG, lang: _lang(),
      say: _say('exOpen', vars),
      sollSay: CoachPersona.say('exOpen', vars, _persona(), 'en')
    };
  });
  check('Fall 1 — gt_lang unbenannt, Geraet Englisch: _lang() ist "en" und deckt sich mit GT_LANG',
    r1.GT_LANG_PREF === 'auto' && r1.GT_LANG === 'en' && r1.lang === 'en' && r1.lang === r1.GT_LANG,
    JSON.stringify(r1));
  check('Fall 1 — echter Coach-Satz (_say) zieht mit: exOpen auf Englisch wie CoachPersona.say(...,"en")',
    typeof r1.say === 'string' && r1.say.length > 0 && r1.say === r1.sollSay,
    JSON.stringify(r1));

  // ── Fall 2: gt_lang='de' auf Englischem Geraet (manuelle Wahl siegt) ─────
  let { r: r2 } = await runCase('en-manual-de', { navLang: 'en-US', navLangs: ['en-US','en'], presetGtLang: 'de' }, () => ({
    GT_LANG_PREF, GT_LANG, lang: _lang()
  }));
  check('Fall 2 — gt_lang="de" auf Englischem Geraet: _lang() ist "de" (manuelle Wahl schlaegt Geraet)',
    r2.GT_LANG_PREF === 'de' && r2.GT_LANG === 'de' && r2.lang === 'de',
    JSON.stringify(r2));

  // ── Fall 3: gt_lang nicht gesetzt, Geraet Deutsch ────────────────────────
  let { r: r3 } = await runCase('de-auto', { navLang: 'de-DE', navLangs: ['de-DE','de'], presetGtLang: null }, () => ({
    GT_LANG_PREF, GT_LANG, lang: _lang()
  }));
  check('Fall 3 — gt_lang unbenannt, Geraet Deutsch: _lang() ist "de"',
    r3.GT_LANG_PREF === 'auto' && r3.GT_LANG === 'de' && r3.lang === 'de',
    JSON.stringify(r3));

  await browser.close();
  server.close();

  console.log('\n-- Lang-Fix — _lang() folgt GT_LANG --');
  let fail = 0;
  for (const t of results) {
    console.log((t.ok ? 'PASS  ' : 'FAIL  ') + t.name);
    if (!t.ok) { fail++; console.log('        got: ' + t.got); }
  }
  console.log(`\nErgebnis: ${results.length - fail}/${results.length} PASS`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS-FEHLER: ' + e.message); try { server.close(); } catch(_) {} process.exit(2); });
