/* Hub-Umbau-Verifikation ohne iOS-Simulator (Windows, kein Xcode).
   Task 2: aus vier Reitern wird EIN Blatt mit fuenf aufklappenden Kacheln.
   Jede Zeile der Testfall-Tabelle aus dem Plan ist EIN Check, dazu die
   Fallstricke, die in dieser Codebasis schon einmal zugeschlagen haben
   (Rerender bei geschlossenem Blatt, verschluckter erster Tipp, esc()).

   Statischer Node-Server + Chromium ueber Puppeteer. Getippt wird ueber ECHTE
   Zeigerfolgen (page.click / ElementHandle.click), nicht ueber synthetisches
   .click() aus dem Seitenkontext: genau daran ist hier schon ein echter Fehler
   durchgerutscht (Befund 2 aus Task 9 — ein Rerender zwischen pointerdown und
   pointerup verschluckte den ersten Tipp, .click() hat dieses Zeitfenster gar
   nicht).

   Eigener Port: 8803 (8793 task-9, 8794 task-10, 8795 task-17, 8796 block3,
   8798 task-19, 8800 task-21, 8801 task-22, 8802 block5).

   Aufruf:
     node hub-check.js              gegen den Arbeitsstand
     node hub-check.js --root=<dir> gegen einen anderen Baum (Rot-Lauf)         */
const http = require('http');
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '../../..');
const puppeteer = require(path.join(REPO, 'node_modules/puppeteer'));

const argRoot = (process.argv.find(a => a.startsWith('--root=')) || '').slice(7);
const ROOT = argRoot ? path.resolve(argRoot) : REPO;
const SRC  = path.join(ROOT, 'index.html');
const PORT = 8803;
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

// Kommentare entfernen (Blockkommentare und Zeilenreste). Der Doppelpunkt-Riegel
// laesst 'https://' stehen. Die statischen Pruefungen lesen den CODE, nicht die
// Erklaerungen darin — sonst schluege der save()-Riegel schon an dem Kommentar
// an, der begruendet, WARUM save() verboten ist.
const ohneKommentar = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const results = [];
const check = (name, cond, got) => results.push({ name, ok: !!cond, got });
const wait = ms => new Promise(r => setTimeout(r, ms));
const PIKTO = /\p{Extended_Pictographic}/u;
// Ein Rot-Lauf laeuft gegen einen Baum, in dem die neuen Funktionen gar nicht
// existieren: dort liefert jeder Aufruf {__err}. Die Pruefungen sollen dann ROT
// sein, nicht den Harness abschiessen.
const O = (x) => (x && !x.__err) ? x : { fehler: (x && x.__err) || 'kein Ergebnis' };

const KACHELN = ['chat', 'week', 'persona', 'scope', 'journal'];

/* Grundzustand: Premium an, Anmelde-Wand weg, ein Konto (sonst hat das Journal
   keinen Schluessel), acht Wochen Verlauf plus zwei Einheiten in der laufenden
   Woche (sonst haette die Wochen-Kennzahl nichts zu zeigen und der Lauf waere
   gruen aus dem falschen Grund) und ein Chatverlauf mit zwei Nachrichten.
   Die Uhr steht auf Mittwoch 10:00 dieser Woche — dieselbe Bauart wie in
   task-21-check.js, damit "laufende Woche" und "Vorwoche" definiert sind. */
const BOOTSTATE = (o) => {
  const opt = Object.assign({ wochen: 8, dieseWoche: 2, unit: 'kg', berichte: true, einzel: false }, o || {});
  window.isPremium = () => true;
  const gate = document.getElementById('auth-gate'); if (gate) gate.style.display = 'none';

  const b = new Date(); b.setHours(10, 0, 0, 0);
  b.setDate(b.getDate() - ((b.getDay() + 6) % 7) + 2);   // Montag dieser Woche + 2 = Mittwoch
  const NOW = b.getTime();
  window.__NOW = NOW;
  if (!window.__echtNow) window.__echtNow = Date.now.bind(Date);
  Date.now = () => window.__NOW;

  // Kein Netz im Messlauf: der Bericht darf an keiner Modellantwort haengen.
  window.__ai = { calls: 0 };
  window.aiCall = async () => { window.__ai.calls++; return null; };
  window._crSignedIn = () => false;

  _fbUser = { uid: 'hub-uid', isAnonymous: false };

  const NAMEN = ['Bankdrücken', 'Kniebeugen', 'Kreuzheben', 'Latzug'];
  const MG    = ['brust', 'beine', 'ruecken', 'ruecken'];
  S.exercises = NAMEN.map((n, i) => ({
    id: 'ex' + i, name: n, muscleGroup: MG[i],
    targetSets: 3, targetReps: 8, repMin: 6, repMax: 10, targetType: 'reps', targetWeight: 0
  }));
  // einzel: nur EINE Uebung je Einheit -> genau eine Muskelgruppe, also keine
  // Verteilung. So heisst "ohne Verlauf" auch wirklich ohne Verlauf.
  const IDS = opt.einzel ? ['ex0'] : ['ex0', 'ex1', 'ex2'];
  const mk = (ts, w) => ({
    id: 's' + ts, date: new Date(ts).toISOString(), duration: 3300,
    logs: IDS.map(id => ({ exerciseId: id, sets: [
      { w: w, r: 8, type: 'normal' }, { w: w, r: 8, type: 'normal' }, { w: w, r: 8, type: 'normal' }] }))
  });
  S.sessions = [];
  for (let w = opt.wochen; w >= 1; w--) S.sessions.push(mk(NOW - w * 7 * 864e5, 60 + (opt.wochen - w) * 2.5));
  for (let i = 0; i < opt.dieseWoche; i++) S.sessions.push(mk(NOW - (i + 1) * 864e5, 60 + opt.wochen * 2.5));

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

  /* Das Berichtsarchiv, so wie es nach opt.wochen Wochen Nutzung dastuende:
     _crBuild() legt je Kalenderwoche EINEN Eintrag an, neueste zuerst,
     hoechstens acht. Genau daraus baut die Kachel ihre Volumenbalken — ein
     leeres Archiv heisst zu Recht "noch kein Verlauf". */
  if (opt.berichte && opt.wochen > 0) {
    const reps = [];
    for (let w = opt.wochen; w >= 1; w--) {
      const ts = NOW - w * 7 * 864e5;
      const ws = CoachReport.weekStart(ts);
      const key = _crWeekKey(ts);
      if (ws === null || !key) continue;
      reps.unshift({ weekKey: key, label: _crLabel(ws),
                     numbers: CoachReport.weekNumbers(_crSessions(), ws),
                     text: '', forecast: null, ts: ts });
    }
    S.coachReports = reps.slice(0, 8);   // neueste zuerst, wie CR_MAX es haelt
    persist();
  }

  // Dossier: drei Eintraege plus Ziel -> die Journal-Kennzahl hat einen Wert.
  try {
    const now = NOW;
    CoachMemory.dossierSave(localStorage, 'hub-uid', Object.assign(CoachMemory.dossierEmpty(), {
      goal: 'Kraft',
      limits: [{ t: 'Schulter links zickt', ts: now }],
      prefs:  [{ t: 'Lieber Kurzhanteln', ts: now }],
      works:  [{ t: 'Drei Minuten Pause bei Kniebeuge', ts: now }],
      updatedAt: now
    }));
  } catch (_) {}

  // Chatverlauf: zwei Nachrichten -> die Chat-Kennzahl hat einen Wert.
  _aicHist = [{ role: 'user', content: 'Wie schwer soll ich Bankdrücken?' },
              { role: 'assistant', content: 'Bleib bei 62,5 kg.' }];
  try { localStorage.setItem('gt_aiChat', JSON.stringify(_aicHist)); } catch (_) {}

  return { NOW: NOW, sessions: S.sessions.length };
};

// Zustand aller fuenf Kacheln, so wie ihn der Nutzer sieht.
const KACHELSTAND = () => {
  const ids = ['chat', 'week', 'persona', 'scope', 'journal'];
  const body = document.getElementById('ch-body');
  return {
    offen: (typeof _chOpen === 'string') ? _chOpen : null,
    ovOffen: !!(document.getElementById('ov-coach-hub') || {}).classList &&
             document.getElementById('ov-coach-hub').classList.contains('on'),
    anzahl: document.querySelectorAll('#ch-body .ch-card').length,
    reiter: document.querySelectorAll('.ch-tabs, .ch-tab').length,
    scroll: body ? Math.round(body.scrollTop) : -1,
    karten: ids.map(k => {
      const sec = document.getElementById('ch-card-' + k);
      const h   = document.getElementById('ch-h-' + k);
      const t   = sec ? sec.querySelector('.ch-card-t') : null;
      const m   = sec ? sec.querySelector('.ch-card-m') : null;
      const w   = sec ? sec.querySelector('.ch-card-w') : null;
      return {
        k: k, da: !!sec,
        on: !!(sec && sec.classList.contains('on')),
        aria: h ? h.getAttribute('aria-expanded') : null,
        titel: t ? (t.textContent || '').replace(/\s+/g, ' ').trim() : null,
        kennzahl: m ? (m.textContent || '').replace(/\s+/g, ' ').trim() : null,
        rows: w ? getComputedStyle(w).gridTemplateRows : null,
        hoehe: sec ? Math.round(sec.getBoundingClientRect().height) : -1,
        inhalt: sec ? ((sec.querySelector('.ch-card-b') || {}).textContent || '').trim().length : -1
      };
    })
  };
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
  const boot = async (opt) => {
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 60000 });
    await wait(1500);
    return await ev(BOOTSTATE, opt || {});
  };
  // Hub oeffnen und die Einblendung (animation:up .28s) abwarten.
  const hubAuf = async (kachel) => {
    await ev((k) => { try { closeOv('ov-ai-chat'); openCoachHub(k); } catch (_) {} }, kachel || 'chat');
    await wait(600);
    return O(await ev(KACHELSTAND));
  };
  // ECHTER Tipp auf den Kopf einer Kachel.
  const tippKachel = async (k) => {
    try { await page.click('#ch-h-' + k); } catch (e) { return String(e.message).slice(0, 140); }
    await wait(700);                       // 260 ms Aufklappen + 300 ms Scroll-Nachlauf
    return true;
  };
  let r;

  await boot();

  // ── 1) Hub oeffnen: genau EINE Kachel offen, die anderen zu ──────────────
  const start = await hubAuf('chat');
  check('Hub oeffnen: fuenf Kacheln, genau EINE offen (chat), die anderen zu — und keine .ch-tabs/.ch-tab mehr im Dokument',
    start.ovOffen === true && start.anzahl === 5 && start.reiter === 0 &&
    (start.karten || []).length === 5 && (start.karten || []).every(x => x.da) &&
    (start.karten || []).filter(x => x.on).length === 1 &&
    ((start.karten || [])[0] || {}).on === true && start.offen === 'chat' &&
    (start.karten || []).every(x => x.aria === (x.on ? 'true' : 'false')),
    JSON.stringify(start).slice(0, 900));

  // ── 2) Tipp auf eine geschlossene Kachel: sie oeffnet, die vorige schliesst ─
  const tipp2 = await tippKachel('persona');
  const nach2 = O(await ev(KACHELSTAND));
  check('Echter Tipp auf eine geschlossene Kachel: sie oeffnet, die vorige schliesst — nie zwei offen',
    tipp2 === true && nach2.offen === 'persona' &&
    (nach2.karten || []).filter(x => x.on).length === 1 &&
    ((nach2.karten || []).find(x => x.k === 'persona') || {}).on === true &&
    ((nach2.karten || []).find(x => x.k === 'chat') || {}).on === false,
    JSON.stringify({ tipp2, offen: nach2.offen, on: (nach2.karten || []).map(x => x.k + ':' + x.on) }));

  // ── 3) Tipp auf die OFFENE Kachel: sie schliesst, keine ist offen ────────
  const tipp3 = await tippKachel('persona');
  const nach3 = O(await ev(KACHELSTAND));
  check('Echter Tipp auf die offene Kachel schliesst sie — "keine offen" ist ein gueltiger Zustand',
    tipp3 === true && nach3.offen === '' &&
    (nach3.karten || []).filter(x => x.on).length === 0 &&
    (nach3.karten || []).every(x => x.aria === 'false'),
    JSON.stringify({ tipp3, offen: nach3.offen, on: (nach3.karten || []).map(x => x.k + ':' + x.on) }));

  // ── 4) Zugeklappt sagt jede Kachel etwas: Titel PLUS eine Kennzahl ───────
  const zu = nach3;
  const kz = (k) => ((zu.karten || []).find(x => x.k === k) || {}).kennzahl || '';
  check('Alle fuenf zugeklappt: jede traegt Titel UND genau eine Kennzahl — keine ist leer',
    (zu.karten || []).length === 5 &&
    (zu.karten || []).every(x => (x.titel || '').length > 2 && (x.kennzahl || '').length > 2) &&
    /2/.test(kz('chat')) &&                                   // zwei Nachrichten
    /\d/.test(kz('week')) && /[↑↓]/.test(kz('week')) &&        // Volumen mit Pfeil zur Vorwoche
    /Max/.test(kz('persona')) && /·/.test(kz('persona')) &&    // "Max · Sachlich"
    /Ausgewogen/.test(kz('scope')) &&                          // das gewaehlte Profil
    /4/.test(kz('journal')),                                   // Ziel + drei Eintraege
    JSON.stringify((zu.karten || []).map(x => x.titel + ' | ' + x.kennzahl)));

  // ── 5) Kennzahl ohne Datenlage: eigener Satz statt leerer Zeile ──────────
  r = O(await ev(() => {
    _aicHist.length = 0;
    try { localStorage.removeItem('gt_aiChat'); } catch (_) {}
    try { CoachMemory.dossierSave(localStorage, 'hub-uid', CoachMemory.dossierEmpty()); } catch (_) {}
    renderCoachHub();
    const g = (k) => ((document.getElementById('ch-card-' + k) || document.createElement('div'))
      .querySelector('.ch-card-m') || {}).textContent || '';
    return { chat: g('chat').trim(), journal: g('journal').trim() };
  }));
  check('Ohne Datenlage steht kein leeres Feld: "noch kein Gespraech" bzw. "noch nichts notiert"',
    /noch kein Gespräch/i.test(r.chat || '') && /noch nichts notiert/i.test(r.journal || ''),
    JSON.stringify(r));

  // ── 6) Kachel unten im Blatt oeffnen: sie wird in Sicht gescrollt ────────
  await boot();
  await hubAuf('chat');
  const vorScroll = O(await ev(() => ({ top: Math.round((document.getElementById('ch-body') || {}).scrollTop || 0) })));
  const tipp6 = await tippKachel('journal');
  r = O(await ev(() => {
    const body = document.getElementById('ch-body');
    const sec  = document.getElementById('ch-card-journal');
    if (!body || !sec) return { err: 'Kachel fehlt' };
    const br = body.getBoundingClientRect(), sr = sec.getBoundingClientRect();
    return { top: Math.round(body.scrollTop), kopfImBild: sr.top >= br.top - 2 && sr.top < br.bottom,
             offen: _chOpen, hoehe: Math.round(sr.height) };
  }));
  check('Die unterste Kachel oeffnet und wird in Sicht gescrollt (ihr Kopf steht im sichtbaren Bereich, nicht darunter)',
    tipp6 === true && !r.err && r.offen === 'journal' && r.top > vorScroll.top &&
    r.kopfImBild === true, JSON.stringify({ vor: vorScroll.top, nach: r }));

  // ── 7) Schalter in "scope": Scrollposition bleibt, Kachel bleibt offen ───
  await boot();
  await hubAuf('scope');
  // Den Ziel-Chip selbst mittig ins Bild holen: ElementHandle.click() scrollt
  // sonst von sich aus und der Vergleich maesse die Rollbewegung des Harness.
  const chipDa = O(await ev(() => {
    const det = document.querySelector('#ch-card-scope details'); if (det) det.open = true;
    const chip = [...document.querySelectorAll('#ch-card-scope .pwz-chip')]
      .find(b => b.getAttribute('onclick') === "setAiCoachOpt('inTraining','off')");
    if (!chip) return { da: false };
    chip.id = 'hub-chip';
    chip.scrollIntoView({ block: 'center' });
    return { da: true };
  }));
  await wait(300);
  const vorSchalter = O(await ev(() => ({ top: Math.round(document.getElementById('ch-body').scrollTop),
                                          offen: _chOpen, level: S.aiCoach.inTraining })));
  let tipp7 = false;
  try { await page.click('#hub-chip'); tipp7 = true; } catch (e) { tipp7 = String(e.message).slice(0, 140); }
  await wait(400);
  const nachSchalter = O(await ev(() => ({ top: Math.round(document.getElementById('ch-body').scrollTop),
    offen: _chOpen, level: S.aiCoach.inTraining,
    on: !!(document.getElementById('ch-card-scope') || { classList: { contains: () => false } }).classList.contains('on'),
    det: !!(document.querySelector('#ch-card-scope details') || {}).open })));
  check('Echter Tipp auf einen Schalter in "Umfang und Meldungen": der Wert greift, die Kachel bleibt offen, die Scrollposition bleibt stehen und die Feinjustierung bleibt aufgeklappt',
    chipDa.da === true && tipp7 === true && vorSchalter.top > 30 &&
    nachSchalter.top === vorSchalter.top && nachSchalter.offen === 'scope' &&
    nachSchalter.on === true && nachSchalter.det === true &&
    vorSchalter.level !== 'off' && nachSchalter.level === 'off',
    JSON.stringify({ chipDa, tipp7, vorSchalter, nachSchalter }));

  // ── 8) Bewegung, verbindlich: grid-template-rows 0fr -> 1fr, 260 ms ──────
  r = O(await ev(() => {
    const zu  = document.querySelector('#ch-card-chat .ch-card-w');
    const auf = document.querySelector('#ch-card-scope .ch-card-w');
    if (!zu || !auf) return { err: 'Kachelhuelle fehlt' };
    const a = getComputedStyle(zu), b = getComputedStyle(auf);
    return { zuRows: a.gridTemplateRows, aufRows: b.gridTemplateRows,
             prop: a.transitionProperty, dauer: a.transitionDuration, kurve: a.transitionTimingFunction,
             display: a.display,
             // max-height darf die Bewegung NICHT tragen: es rastet bei
             // unbekannter Inhaltshoehe.
             maxH: a.maxHeight };
  }));
  check('Aufklappen laeuft ueber grid-template-rows 0fr -> 1fr in 260 ms mit cubic-bezier(.22,.61,.36,1) — nicht ueber max-height',
    !r.err && r.display === 'grid' && /transition/.test('transition') &&
    /grid-template-rows/.test(r.prop || '') && (r.dauer || '').indexOf('0.26s') === 0 &&
    /cubic-bezier\(0.22,\s*0.61,\s*0.36,\s*1\)/.test((r.kurve || '').replace(/\s+/g, ' ')) &&
    r.zuRows === '0px' && parseFloat(r.aufRows) > 30 && r.maxH === 'none',
    JSON.stringify(r));

  // ── 9) Journal-Eintrag mit Markup erscheint als TEXT ─────────────────────
  await boot();
  r = O(await ev(() => {
    window.__xss = 0;
    CoachMemory.dossierSave(localStorage, 'hub-uid', Object.assign(CoachMemory.dossierEmpty(), {
      limits: [{ t: '<img src=x onerror="window.__xss=1">Knie', ts: Date.now() }], updatedAt: Date.now()
    }));
    openCoachHub('journal');
    const sec = document.getElementById('ch-card-journal');
    return { xss: window.__xss, html: sec ? sec.innerHTML : '', text: sec ? sec.textContent : '',
             imgs: sec ? sec.querySelectorAll('img').length : -1,
             bold: sec ? sec.querySelectorAll('b').length : -1 };
  }));
  check('Journal-Eintrag mit Markup erscheint als TEXT (esc() beim Umzug nicht verloren) — kein Element, kein onerror',
    r.xss === 0 && r.imgs === 0 && r.bold === 0 &&
    /&lt;img/.test(r.html || '') && /<img src=x onerror/.test(r.text || ''),
    JSON.stringify({ xss: r.xss, imgs: r.imgs, bold: r.bold, text: (r.text || '').slice(0, 160) }));

  // ── 10) renderCoachHub() bleibt no-op bei geschlossenem Blatt ────────────
  // Der Aufruf kommt auch aus _coachOptRender() heraus, also aus Kontexten ohne
  // Hub (Live-Leiste, Heute-Karte, Chat-Kopf).
  r = O(await ev(() => {
    openCoachHub('journal'); closeOv('ov-coach-hub');
    const b = document.getElementById('ch-body');
    b.innerHTML = 'SENTINEL';
    let threw = null;
    try { renderCoachHub(); } catch (e) { threw = String(e && e.message); }
    const nachOpt = (() => { setAiCoachOpt('insights', true); return document.getElementById('ch-body').innerHTML; })();
    let threw2 = null;
    try { coachHubOpen('week'); } catch (e) { threw2 = String(e && e.message); }
    return { html: b.innerHTML, threw, threw2, nachOpt };
  }));
  check('renderCoachHub() kehrt bei geschlossenem Overlay frueh zurueck (auch aus setAiCoachOpt), coachHubOpen() wirft dabei nicht',
    r.html === 'SENTINEL' && r.nachOpt === 'SENTINEL' && r.threw === null && r.threw2 === null,
    JSON.stringify(r));

  // ── 11) Der erste Tipp direkt nach dem Namensfeld zaehlt (_chHoldBody) ───
  // onchange feuert beim Blur, also zwischen pointerdown und pointerup des
  // naechsten Tipps. Ohne den Waechter nimmt der Rerender die getippte Tonkarte
  // aus dem DOM und der Tipp ist verloren.
  await boot();
  await ev(() => { setAiCoachOpt('name', ''); setAiCoachOpt('tone', 'sachlich'); });
  await hubAuf('persona');
  await ev(() => { const sh = document.querySelector('#ov-coach-hub .sheet'); if (sh) sh.scrollTop = 0; });
  let nameOk = false;
  try {
    await page.click('#ch-name');
    await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
    await page.type('#ch-name', 'Nina');
    nameOk = true;
  } catch (e) { nameOk = String(e.message).slice(0, 140); }
  /* Die erste GESTE direkt nach dem Namensfeld: seit Task 4 ist das der
     Ton-Regler und nicht mehr eine Tonkarte. Die Zusicherung ist dieselbe —
     das onchange des Namensfeldes feuert beim Blur, also mitten in der Geste,
     und ohne den Waechter naehme der Rerender den Regler aus dem DOM. */
  let getippt = false;
  try {
    const h = await page.$('#ch-tone-slider');
    const box = h ? await h.boundingBox() : null;
    if (box) {
      const y = box.y + box.height / 2;
      await page.mouse.move(box.x + box.width / 2, y);
      await page.mouse.down();
      await page.mouse.move(box.x + 3, y, { steps: 6 });
      await page.mouse.up();
      getippt = true;
    }
  } catch (e) { getippt = String(e.message).slice(0, 140); }
  await wait(400);
  r = O(await ev(() => ({
    tone: S.aiCoach.tone, name: S.aiCoach.name,
    titel: (document.getElementById('ch-title') || {}).textContent,
    feld: (document.getElementById('ch-name') || {}).value,
    ex: (document.getElementById('ch-tone-ex') || {}).textContent,
    offen: _chOpen,
    kennzahl: ((document.querySelector('#ch-card-persona .ch-card-m') || {}).textContent || '').trim()
  })));
  check('Erster Tipp direkt nach dem Namensfeld setzt den Ton (_chHoldBody haelt), Kopf, Feld, Beispielsatz und die Kennzahl der Kachel ziehen mit',
    nameOk === true && getippt === true && r.tone === 'ruhig' && r.name === 'Nina' &&
    r.titel === 'Nina' && r.feld === 'Nina' && /Nina/.test(r.ex || '') &&
    r.offen === 'persona' && /Nina/.test(r.kennzahl || '') && /Ruhig/i.test(r.kennzahl || ''),
    JSON.stringify({ nameOk, getippt, ...r }).slice(0, 700));

  // ── 12) Die Kachel "Gespraech" verlinkt den bestehenden Chat ────────────
  // Der Chat zieht NICHT um: aicSend(), Diktat und Verlauf haengen an ov-ai-chat.
  await boot();
  await hubAuf('chat');
  r = O(await ev(() => {
    const sec = document.getElementById('ch-card-chat');
    const btn = [...(sec ? sec.querySelectorAll('button') : [])]
      .find(b => /coachHubOpenChat/.test(b.getAttribute('onclick') || ''));
    const msgs = sec ? sec.querySelectorAll('.aic-msg').length : -1;
    if (btn) btn.click();
    return { knopf: !!btn, msgs,
             hubZu: !document.getElementById('ov-coach-hub').classList.contains('on'),
             chatOffen: document.getElementById('ov-ai-chat').classList.contains('on') };
  }));
  check('Kachel "Gespraech": letzter Wortwechsel als Vorschau, der Knopf springt in das bestehende ov-ai-chat (der Chat zieht nicht um)',
    r.knopf === true && r.msgs === 2 && r.hubZu === true && r.chatOffen === true,
    JSON.stringify(r));

  // ── 13) Heute-Tab vorher/nachher: Gestaltungsregel 1 ────────────────────
  await boot();
  r = O(await ev(() => {
    try { closeOv('ov-ai-chat'); closeOv('ov-coach-hub'); } catch (_) {}
    try { renderHome(); } catch (_) {}
    const vor = { pad: document.querySelectorAll('#heute-pad > div').length,
                  aic: document.querySelectorAll('#pg-heute .aic').length,
                  tabs: document.querySelectorAll('.tabbar .tab').length };
    openCoachHub('week');
    closeOv('ov-coach-hub');
    try { renderHome(); } catch (_) {}
    const nach = { pad: document.querySelectorAll('#heute-pad > div').length,
                   aic: document.querySelectorAll('#pg-heute .aic').length,
                   tabs: document.querySelectorAll('.tabbar .tab').length,
                   hubImHeute: !!document.querySelector('#pg-heute #ov-coach-hub, #pg-heute .ch-card, #pg-heute .ch-preset'),
                   hubUnterBody: document.getElementById('ov-coach-hub').parentElement === document.body,
                   coachTab: [...document.querySelectorAll('.tabbar .tab')].some(b =>
                     /coach|hub/i.test((b.getAttribute('onclick') || '') + ' ' + b.textContent)) };
    return { vor, nach };
  }));
  check('Gestaltungsregel 1: der Heute-Tab hat vorher und nachher gleich viele Flaechen, genau EINE .aic-Karte, fuenf Tab-Knoepfe und keinen zweiten Coach-Einstieg',
    (r.vor || {}).pad === (r.nach || {}).pad && (r.vor || {}).pad === 2 &&
    (r.vor || {}).aic === 1 && (r.nach || {}).aic === 1 &&
    (r.nach || {}).tabs === 5 && (r.nach || {}).hubImHeute === false &&
    (r.nach || {}).hubUnterBody === true && (r.nach || {}).coachTab === false,
    JSON.stringify(r));

  // ── 14) lbs: die Wochen-Kennzahl nennt keine kg-Zahl ────────────────────
  await boot({ unit: 'lbs' });
  const lbs = await hubAuf('chat');
  check('S.unitMode="lbs": die Kennzahl der Wochen-Kachel steht in lbs, keine kg-Zahl im Blatt',
    /lbs/.test(((lbs.karten || []).find(x => x.k === 'week') || {}).kennzahl || '') &&
    !/\bkg\b/.test(((lbs.karten || []).find(x => x.k === 'week') || {}).kennzahl || ''),
    JSON.stringify((lbs.karten || []).map(x => x.k + ': ' + x.kennzahl)));

  // ── 15) Zweisprachig: fuenf Kacheln auf Englisch, kein deutscher Rest ────
  await page.evaluate(() => localStorage.setItem('gt_lang', 'en'));
  await boot();
  const en = await hubAuf('chat');
  const enTitel = (en.karten || []).map(x => x.titel).join('|');
  const enKz = (en.karten || []).map(x => x.kennzahl).join(' | ');
  check('Englische App: alle fuenf Kacheltitel und ihre Kennzahlen kommen auf Englisch — kein deutscher Oberflaechentext, kein Emoji',
    enTitel === 'Conversation|Week|Personality|Scope and notifications|Journal' &&
    !/Nachricht|Eintrag|Einträge|Gespräch|noch nichts|Ausgewogen/.test(enKz) &&
    !PIKTO.test(enTitel + ' ' + enKz),
    JSON.stringify({ enTitel, enKz }));
  await page.evaluate(() => localStorage.removeItem('gt_lang'));

  // ── 16) prefers-reduced-motion: alle Uebergaenge auf 0 ms ───────────────
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await boot();
  await hubAuf('chat');
  r = O(await ev(() => {
    const w = document.querySelector('#ch-card-chat .ch-card-w');
    const sec = document.getElementById('ch-card-chat');
    const kind = document.querySelector('#ch-card-chat .ch-card-b > .ch-in > *');
    if (!w || !sec) return { err: 'Kachel fehlt' };
    const cs = getComputedStyle(w);
    return { dauer: cs.transitionDuration,
             sweep: getComputedStyle(sec, '::after').animationName,
             inhalt: kind ? getComputedStyle(kind).animationName : 'kein Kind',
             opac: kind ? getComputedStyle(kind).opacity : null };
  }));
  check('prefers-reduced-motion: reduce — der Uebergang der Kachel steht auf 0 s, weder Lichtstreifen noch Inhaltsversatz laufen, und der Inhalt bleibt sichtbar',
    !r.err && r.dauer === '0s' && r.sweep === 'none' && r.inhalt === 'none' && r.opac === '1',
    JSON.stringify(r));
  await page.emulateMediaFeatures([]);

  /* ══════════════════════════════════════════════════════════════════════
     TASK 3 — Diagramme und Kraftziel in der Wochenkachel
     ══════════════════════════════════════════════════════════════════════ */

  // Zustand der Wochenkachel, so wie ihn der Nutzer sieht.
  const WOCHE = () => {
    const sec = document.getElementById('ch-card-week');
    const cv = (id) => document.getElementById(id);
    const chartOf = (id) => { const c = cv(id); return c ? Chart.getChart(c) : null; };
    const c1 = chartOf('chw-1rm-cv');
    return {
      offen: (typeof _chOpen === 'string') ? _chOpen : null,
      // Zwei unabhaengige Zaehlungen: die eigene Liste und das, was Chart.js
      // wirklich an den Zeichenfeldern haelt. Nur wenn beide null sind, ist
      // nichts liegen geblieben.
      inst: (typeof _chWeekInst !== 'undefined' && Array.isArray(_chWeekInst)) ? _chWeekInst.length : -1,
      lebend: sec ? [...sec.querySelectorAll('canvas')].filter(c => !!Chart.getChart(c)).length : -1,
      nums: !!document.getElementById('chw-nums'),
      numTexte: sec ? [...sec.querySelectorAll('#chw-nums .aia-stat')].map(x => (x.textContent || '').replace(/\s+/g, ' ').trim()) : [],
      pfeile: sec ? (sec.querySelector('#chw-nums') || { textContent: '' }).textContent.replace(/[^↑↓]/g, '') : '',
      vol: !!document.getElementById('chw-vol'),
      mus: !!document.getElementById('chw-mus'),
      rm:  !!document.getElementById('chw-1rm'),
      ziel: !!document.getElementById('chw-goal-cta'),
      zielTxt: ((document.getElementById('chw-goal-cta') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      hinweis: ((document.getElementById('chw-goal-hint') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      musHinweis: ((document.getElementById('chw-mus') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      text: sec ? (sec.textContent || '').replace(/\s+/g, ' ').trim() : '',
      target: (S.exercises || []).map(e => e && e.targetWeight),
      // Die Konfiguration, wie sie wirklich am Zeichenfeld haengt.
      volLabels: (() => { const c = chartOf('chw-vol-cv'); return c ? c.data.labels.slice() : null; })(),
      volFarben: (() => { const c = chartOf('chw-vol-cv'); return c ? c.data.datasets[0].backgroundColor.slice() : null; })(),
      musLabels: (() => { const c = chartOf('chw-mus-cv'); return c ? c.data.labels.slice() : null; })(),
      musAchse:  (() => { const c = chartOf('chw-mus-cv'); return c ? c.options.indexAxis : null; })(),
      rmTrend: (c1 && c1.data.datasets[1]) ? c1.data.datasets[1].data.slice(-1)[0] : null,
      rmDs: c1 ? c1.data.datasets.length : 0,
      achseY: (() => { const c = chartOf('chw-vol-cv');
        try { return c ? String(c.options.scales.y.ticks.callback(1000)) : null; } catch (_) { return 'fehler'; } })(),
      animation: (() => { const c = chartOf('chw-vol-cv');
        try { return c ? c.options.animation.duration : null; } catch (_) { return 'fehler'; } })()
    };
  };

  // ── 17) Registrierung: script-Tag, build.js, sw.js — CACHE unangetastet ──
  const swVorher = (() => {
    try { return (fs.readFileSync(path.join(REPO, 'sw.js'), 'utf8')
      .match(/const CACHE\s*=\s*['"]([^'"]+)['"]/) || [])[1] || null; } catch (_) { return null; }
  })();
  await boot();
  const reg = (() => {
    try {
      const html = fs.readFileSync(SRC, 'utf8');
      const build = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
      const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
      const shell = (sw.match(/const SHELL\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';
      return {
        tag: html.includes('<script src="./js/coach-charts.js">'),
        build: build.includes('js/coach-charts.js'),
        shell: shell.includes('./js/coach-charts.js'),
        cache: (sw.match(/const CACHE\s*=\s*['"]([^'"]+)['"]/) || [])[1] || null
      };
    } catch (e) { return { err: String(e.message) }; }
  })();
  r = O(await ev(() => ({ mod: typeof window.CoachCharts,
    fns: window.CoachCharts ? ['volumeBars', 'muscleBars', 'oneRmLine'].filter(k => typeof CoachCharts[k] === 'function').length : 0,
    bars: window.CoachCharts ? CoachCharts.MIN_BARS : null,
    points: window.CoachCharts ? CoachCharts.MIN_POINTS : null,
    chart: typeof window.Chart })));
  check('Registrierung: coach-charts.js haengt als script-Tag, in der Kopierliste von build.js und im SHELL-Precache — CACHE unangetastet, das Modul ist zur Laufzeit da',
    reg.tag === true && reg.build === true && reg.shell === true && reg.cache === swVorher &&
    r.mod === 'object' && r.fns === 3 && r.bars === 2 && r.points === 4 && r.chart === 'function',
    JSON.stringify({ reg, r }));

  // ── 18) Kachel zu: keine einzige Chart-Instanz ──────────────────────────
  await hubAuf('chat');            // Blatt offen, Wochenkachel aber ZU
  const zuVorher = O(await ev(WOCHE));
  check('Kachel "Woche" geschlossen: null Chart-Instanzen — die vier Diagramme werden NICHT im Voraus gezeichnet',
    zuVorher.offen === 'chat' && zuVorher.inst === 0 && zuVorher.lebend === 0,
    JSON.stringify({ offen: zuVorher.offen, inst: zuVorher.inst, lebend: zuVorher.lebend }));

  // ── 19) Kachel auf: die Instanzen entstehen ─────────────────────────────
  const auf19 = await tippKachel('week');
  const offen19 = O(await ev(WOCHE));
  check('Kachel "Woche" oeffnen: die Diagramme entstehen erst jetzt — Volumen, Muskelverteilung und die Kennzahlenzeile stehen da',
    auf19 === true && offen19.offen === 'week' && offen19.inst >= 2 &&
    offen19.inst === offen19.lebend && offen19.nums === true &&
    offen19.vol === true && offen19.mus === true,
    JSON.stringify({ auf19, inst: offen19.inst, lebend: offen19.lebend,
                     nums: offen19.nums, vol: offen19.vol, mus: offen19.mus }));

  // ── 20) Kachel zu: die Instanzen sind wieder weg (kein Speicherleck) ────
  const zu20 = await tippKachel('week');
  const nach20 = O(await ev(WOCHE));
  check('Kachel "Woche" schliessen: alle Chart-Instanzen sind zerstoert — ohne destroy() waechst der Speicher bei jedem Oeffnen',
    zu20 === true && nach20.offen === '' && nach20.inst === 0 && nach20.lebend === 0,
    JSON.stringify({ zu20, offen: nach20.offen, inst: nach20.inst, lebend: nach20.lebend }));

  // ── 21) Auch das Schliessen des BLATTES raeumt auf ──────────────────────
  await hubAuf('week');
  const vorZu = O(await ev(WOCHE));
  r = O(await ev(() => { closeOv('ov-coach-hub');
    return { inst: (typeof _chWeekInst !== 'undefined') ? _chWeekInst.length : -1,
             lebend: [...document.querySelectorAll('#ch-card-week canvas')].filter(c => !!Chart.getChart(c)).length }; }));
  check('Das Blatt zu machen raeumt die Diagramme ebenfalls ab — nicht nur der Tipp auf die Kachel',
    vorZu.inst >= 2 && r.inst === 0 && r.lebend === 0,
    JSON.stringify({ vorher: vorZu.inst, nachher: r }));

  // ── 22) Acht Wochen Volumen: die laufende Woche hebt sich ab ────────────
  await hubAuf('week');
  const acht = O(await ev(WOCHE));
  const farben = acht.volFarben || [];
  check('Acht Wochen Volumen: die Balken stehen in zeitlicher Reihenfolge, die laufende Woche traegt den Akzent und alle anderen die gedaempfte Farbe',
    acht.vol === true && (acht.volLabels || []).length >= 2 && (acht.volLabels || []).length <= 8 &&
    (acht.volLabels || []).every(l => /^(KW|Week) \d+$/.test(l)) &&
    farben.length === (acht.volLabels || []).length &&
    farben[farben.length - 1] !== farben[0] &&
    farben.slice(0, -1).every(f => f === farben[0]),
    JSON.stringify({ labels: acht.volLabels, farben }).slice(0, 500));

  // ── 23) Kennzahlen: drei Ziffern, jede mit Pfeil und Prozent ────────────
  check('Kennzahlen: Einheiten, Saetze und Volumen als grosse Ziffern, jede mit Pfeil und Prozent zur Vorwoche — "Wochen in Folge" steht NICHT mehr da (die Zahl steht schon im Heute-Tab)',
    acht.nums === true && (acht.numTexte || []).length === 3 &&
    (acht.numTexte || []).every(t => /\d/.test(t)) &&
    /Einheiten/.test(acht.text || '') && /Sätze/.test(acht.text || '') && /Volumen/.test(acht.text || '') &&
    /Vorwoche/.test(acht.text || '') && (acht.pfeile || '').length === 3 &&
    !/Wochen in Folge/.test(acht.text || ''),
    JSON.stringify({ numTexte: acht.numTexte, pfeile: acht.pfeile,
                     streak: /Wochen in Folge/.test(acht.text || '') }));

  // ── 24) Muskelverteilung: liegende Balken PLUS Pflichthinweis ───────────
  check('Muskelverteilung: liegende Balken je Gruppe, absteigend — mit dem Pflichthinweis, dass Saetze ohne zugeordnete Muskelgruppe fehlen',
    acht.mus === true && acht.musAchse === 'y' &&
    (acht.musLabels || []).length >= 2 &&
    (acht.musLabels || []).indexOf('Brust') >= 0 && (acht.musLabels || []).indexOf('Rücken') >= 0 &&
    /Muskelgruppe/.test(acht.musHinweis || '') && /Summe/.test(acht.musHinweis || ''),
    JSON.stringify({ labels: acht.musLabels, achse: acht.musAchse,
                     hinweis: (acht.musHinweis || '').slice(0, 200) }));

  // ── 25) Ohne Verlauf: die Kennzahlen stehen, die Diagramme fehlen GANZ ──
  await boot({ wochen: 0, dieseWoche: 1, berichte: false, einzel: true });
  const duenn = await (async () => { await hubAuf('week'); return O(await ev(WOCHE)); })();
  check('Profil ohne Verlauf: die Kennzahlenzeile steht, aber KEIN leerer Rahmen — Volumen, Muskelverteilung und Bestwert-Verlauf entfallen vollstaendig',
    duenn.nums === true && duenn.vol === false && duenn.mus === false && duenn.rm === false &&
    duenn.inst === 0 && duenn.lebend === 0 && /\d/.test(duenn.text || ''),
    JSON.stringify({ nums: duenn.nums, vol: duenn.vol, mus: duenn.mus, rm: duenn.rm, inst: duenn.inst }));

  // ── 26) Ohne Vorwoche kein Pfeil: keine erfundene Steigerung ────────────
  check('Ohne Vorwoche steht kein Pfeil und kein Prozent — eine Steigerung gegenueber nichts hat niemand erbracht',
    (duenn.pfeile || '') === '' && !/NaN|undefined|Infinity/.test(duenn.text || ''),
    JSON.stringify({ pfeile: duenn.pfeile, text: (duenn.text || '').slice(0, 200) }));

  // ── 27) Kein Kraftziel: die Zeile "Ziel setzen", kein Verlaufsdiagramm ──
  await boot();
  await hubAuf('week');
  const ohneZiel = O(await ev(WOCHE));
  check('Kein Kraftziel gesetzt: die Zeile "Ziel setzen" steht da und es gibt KEIN Bestwert-Diagramm — eine Prognose ohne Ziel waere erfunden',
    ohneZiel.ziel === true && /Ziel setzen|Set a target/i.test(ohneZiel.zielTxt || '') &&
    ohneZiel.rm === false && (ohneZiel.target || []).every(t => !t),
    JSON.stringify({ ziel: ohneZiel.ziel, txt: ohneZiel.zielTxt, rm: ohneZiel.rm, target: ohneZiel.target }));

  // ── 28) Ziel UNTER dem Erreichten wird abgelehnt ────────────────────────
  const setzeZiel = async (wert) => {
    // Die Eingabe nur aufklappen, wenn sie ZU ist: der Kopf ist ein Umschalter,
    // ein zweiter Tipp klappte sie wieder zu.
    try {
      if (!(await page.$('#chw-goal-in'))) { await page.click('#chw-goal-cta'); await wait(350); }
    } catch (_) {}
    try {
      // Feld leeren wie in task-9/task-10: ein Dreifachklick markiert in
      // diesem Sheet nicht zuverlaessig, und ein angehaengter Wert waere ein
      // Testartefakt (aus 104 und 93 wuerde 10493).
      await page.click('#chw-goal-in');
      await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
      await page.type('#chw-goal-in', String(wert));
      await page.click('#chw-goal-save');
      await wait(600);
      return true;
    } catch (e) { return String(e.message).slice(0, 140); }
  };
  const ist1rm = O(await ev(() => {
    // Das aktuelle geschaetzte Maximum von ex0: 77,5 kg x 8 Wdh (Epley).
    let best = 0;
    (S.sessions || []).forEach(s => (s.logs || []).forEach(l => {
      if (l.exerciseId !== 'ex0') return;
      (l.sets || []).forEach(x => { const v = CoachReport.epley1rm(x.w, x.r); if (v > best) best = v; });
    }));
    return { best: Math.round(best * 10) / 10 };
  }));
  const zuNiedrig = await setzeZiel(Math.floor((ist1rm.best || 98) - 8));
  const nachNiedrig = O(await ev(WOCHE));
  check('Ziel UNTERHALB des geschaetzten Maximums wird abgelehnt: ein Hinweis nennt das erreichte Maximum, ex.targetWeight bleibt 0 und kein Diagramm entsteht',
    zuNiedrig === true && (nachNiedrig.target || []).every(t => !t) &&
    (nachNiedrig.hinweis || '').length > 10 && /\d/.test(nachNiedrig.hinweis || '') &&
    nachNiedrig.rm === false,
    JSON.stringify({ zuNiedrig, ist: ist1rm.best, hinweis: nachNiedrig.hinweis, target: nachNiedrig.target }));

  // ── 29) Ziel DARUEBER: der Verlauf erscheint, die Trendlinie endet am Ziel ─
  const hoch = await setzeZiel(120);
  const nachHoch = O(await ev(WOCHE));
  check('Ziel oberhalb des Erreichten: der Bestwert-Verlauf erscheint, traegt eine zweite (gestrichelte) Reihe und die Trendlinie endet EXAKT auf dem gesetzten Wert — kein 116.79999999999998',
    hoch === true && nachHoch.rm === true && nachHoch.rmDs === 2 &&
    nachHoch.rmTrend === 120 && (nachHoch.target || [])[0] === 120 &&
    /Ziel ändern|Change target/i.test(nachHoch.zielTxt || '') && nachHoch.inst >= 3,
    JSON.stringify({ hoch, rm: nachHoch.rm, ds: nachHoch.rmDs, trend: nachHoch.rmTrend,
                     target: nachHoch.target, txt: nachHoch.zielTxt, inst: nachHoch.inst }));

  // ── 30) Genau EIN Ziel gleichzeitig ────────────────────────────────────
  r = O(await ev(() => { try { coachSetGoal('ex1', 200); } catch (_) {} return { target: (S.exercises || []).map(e => e.targetWeight) }; }));
  check('Ein neues Ziel ersetzt das angezeigte: hoechstens EIN ex.targetWeight ist ungleich 0',
    (r.target || []).filter(t => t > 0).length === 1 && (r.target || [])[1] > 0 && !(r.target || [])[0],
    JSON.stringify(r));

  // ── 31) Ziel entfernen: der Verlauf verschwindet, die Zeile steht wieder ─
  await ev(() => { try { coachSetGoal('ex0', 120); } catch (_) {} });
  await wait(400);
  let weg = false;
  try { await page.click('#chw-goal-clear'); weg = true; } catch (e) { weg = String(e.message).slice(0, 140); }
  await wait(500);
  const nachWeg = O(await ev(WOCHE));
  check('Ziel entfernen: targetWeight faellt auf 0, der Bestwert-Verlauf verschwindet und die Zeile "Ziel setzen" steht wieder da',
    weg === true && (nachWeg.target || []).every(t => !t) && nachWeg.rm === false &&
    /Ziel setzen|Set a target/i.test(nachWeg.zielTxt || ''),
    JSON.stringify({ weg, target: nachWeg.target, rm: nachWeg.rm, txt: nachWeg.zielTxt }));

  // ── 31b) Die Uebungsauswahl ist bedienbar (echte Zeigerfolge) ───────────
  await boot();
  await hubAuf('week');
  let gewaehlt = false;
  try {
    await page.click('#chw-goal-cta');
    await wait(400);
    const chips = await page.$$('#chw-goal .chw-pick .pwz-chip');
    if (chips.length >= 2) { await chips[1].click(); gewaehlt = true; }
  } catch (e) { gewaehlt = String(e.message).slice(0, 140); }
  await wait(400);
  r = O(await ev(() => {
    const on = [...document.querySelectorAll('#chw-goal .chw-pick .pwz-chip.on')].map(b => (b.textContent || '').trim());
    return { on, anzahl: document.querySelectorAll('#chw-goal .chw-pick .pwz-chip').length,
             gewaehlt: (typeof _chGoalEx === 'string') ? _chGoalEx : null,
             vorschlag: (document.getElementById('chw-goal-in') || {}).value };
  }));
  check('Der Nutzer kann eine ANDERE Uebung waehlen: die Auswahl bietet alle seine Uebungen (vorgeschlagene zuerst), ein echter Tipp markiert genau eine und zieht den Vorschlagswert mit',
    gewaehlt === true && r.anzahl >= 2 && (r.on || []).length === 1 &&
    r.gewaehlt && r.gewaehlt !== 'ex0' && /\d/.test(String(r.vorschlag || '')),
    JSON.stringify(r));

  // ── 31c) Uebungsname mit Markup erscheint als TEXT ──────────────────────
  r = O(await ev(() => {
    window.__xss = 0;
    S.exercises[0].name = '<img src=x onerror="window.__xss=1">Bankdrücken';
    persist();
    _chGoalEx = 'ex0';
    coachSetGoal('ex0', 130);
    const sec = document.getElementById('ch-card-week');
    return { xss: window.__xss, imgs: sec ? sec.querySelectorAll('img').length : -1,
             roh: /<img/i.test(sec ? sec.innerHTML : ''),
             text: sec ? (sec.textContent || '') : '' };
  }));
  check('Uebungsname mit Markup erscheint in Zielzeile und Diagramm-Untertitel als TEXT (esc() vor innerHTML) — kein Element, kein onerror',
    r.xss === 0 && r.imgs === 0 && r.roh === false && /<img src=x onerror/.test(r.text || ''),
    JSON.stringify({ xss: r.xss, imgs: r.imgs, roh: r.roh, text: (r.text || '').slice(0, 160) }));

  // ── 32) lbs: keine kg-Zahl in der Kachel, Achsen nennen lbs ─────────────
  await boot({ unit: 'lbs' });
  await ev(() => { try { coachSetGoal('ex0', 300); } catch (_) {} });
  await wait(300);
  await hubAuf('week');
  const lbsW = O(await ev(WOCHE));
  check('S.unitMode = "lbs": in der ganzen Wochenkachel steht keine kg-Zahl, und die Achsen der Diagramme nennen lbs',
    /lbs/.test(lbsW.text || '') && !/\bkg\b/.test(lbsW.text || '') &&
    / lbs$/.test(lbsW.achseY || '') && lbsW.rm === true,
    JSON.stringify({ achse: lbsW.achseY, rm: lbsW.rm, text: (lbsW.text || '').slice(0, 300) }));

  // ── 33) prefers-reduced-motion: die Chart-Animation steht auf 0 ─────────
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await boot();
  await hubAuf('week');
  const redW = O(await ev(WOCHE));
  check('prefers-reduced-motion: reduce — auch die Chart.js-Animation steht auf 0 (opts.reduceMotion wird gesetzt; eine Medienabfrage kann das Modul nicht lesen)',
    redW.vol === true && redW.animation === 0,
    JSON.stringify({ vol: redW.vol, animation: redW.animation }));
  await page.emulateMediaFeatures([]);

  /* ══════════════════════════════════════════════════════════════════════
     TASK 4 — Ton-Regler, Heute-Karte, Volumenbalken ohne Archiv
     ══════════════════════════════════════════════════════════════════════ */

  const REGLER = () => {
    const el = document.getElementById('ch-tone-slider');
    return {
      da: !!el,
      rolle: el ? el.getAttribute('role') : null,
      tab: el ? el.getAttribute('tabindex') : null,
      min: el ? el.getAttribute('aria-valuemin') : null,
      max: el ? el.getAttribute('aria-valuemax') : null,
      now: el ? el.getAttribute('aria-valuenow') : null,
      txt: el ? el.getAttribute('aria-valuetext') : null,
      rasten: document.querySelectorAll('#ch-tone-slider .cts-dot').length,
      // Die vier Tonkarten sind ersetzt, nicht ergaenzt.
      karten: [...document.querySelectorAll('#ch-card-persona .ch-preset')]
        .filter(b => /setAiCoachOpt\('tone'/.test(b.getAttribute('onclick') || '')).length,
      satz: ((document.getElementById('ch-tone-say') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      tone: (S.aiCoach || {}).tone,
      typ: typeof (S.aiCoach || {}).tone,
      fokus: document.activeElement ? document.activeElement.id : null,
      dauer: el ? getComputedStyle(el.querySelector('.cts-knob') || el).transitionDuration : null
    };
  };
  // Echte Zeigergeste auf den Regler: an die Position des i-ten Rastpunkts
  // ziehen und loslassen.
  const ziehe = async (i) => {
    const h = await page.$('#ch-tone-slider');
    if (!h) return null;
    const box = await h.boundingBox();
    if (!box) return null;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + 4, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * (i / 3), y, { steps: 8 });
    await wait(120);
    const waehrend = await ev(() => ({
      satz: ((document.getElementById('ch-tone-say') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      tone: (S.aiCoach || {}).tone
    }));
    await page.mouse.up();
    await wait(350);
    return waehrend;
  };

  await boot();
  await hubAuf('persona');

  // ── 39) Der Regler steht da, die vier Tonkarten sind ersetzt ────────────
  r = O(await ev(REGLER));
  check('Ton-Regler: vier Rastpunkte, role="slider", tabindex="0", aria-valuemin/max/now/valuetext — und die vier Tonkarten sind ERSETZT, nicht ergaenzt',
    r.da === true && r.rolle === 'slider' && r.tab === '0' && r.rasten === 4 &&
    r.min === '0' && r.max === '3' && r.now === '1' && /Sachlich/i.test(r.txt || '') &&
    r.karten === 0 && (r.satz || '').length > 10,
    JSON.stringify(r).slice(0, 500));

  // ── 40) Ziehen auf jeden Rastpunkt schreibt den Ton als STRING ──────────
  const TOENE = ['ruhig', 'sachlich', 'hart', 'locker'];
  const gezogen = [], saetze = [], waehrendDrag = [];
  for (let i = 0; i < 4; i++) {
    const w = await ziehe(i);
    waehrendDrag.push(w && w.satz);
    const nach = O(await ev(REGLER));
    gezogen.push(nach.tone + ':' + nach.typ + ':' + nach.now + ':' + (nach.txt || ''));
    saetze.push(nach.satz);
  }
  check('Ziehen ueber alle vier Rastpunkte: S.aiCoach.tone traegt jedes Mal den TON ALS STRING (nie true), aria-valuenow und aria-valuetext ziehen mit — zwischen den Punkten landet nie ein Zustand',
    gezogen.length === 4 &&
    TOENE.every((t, i) => gezogen[i].indexOf(t + ':string:' + i + ':') === 0) &&
    gezogen.every(g => !/:boolean:|:number:/.test(g)),
    JSON.stringify(gezogen));

  // ── 41) Der Beispielsatz unterscheidet sich zwischen allen vier ─────────
  check('Der Beispielsatz klingt in allen vier Toenen verschieden — und er wechselt schon WAEHREND des Ziehens, nicht erst beim Loslassen',
    saetze.length === 4 && saetze.every(s => s && s.length > 10) &&
    new Set(saetze).size === 4 &&
    waehrendDrag.filter(Boolean).length === 4 && new Set(waehrendDrag.filter(Boolean)).size === 4,
    JSON.stringify({ saetze, waehrendDrag }).slice(0, 800));

  // ── 42) Pfeiltasten bewegen den Regler und schreiben ────────────────────
  await ev(() => { try { setAiCoachOpt('tone', 'sachlich'); } catch (_) {} });
  await wait(250);
  let tasten = false;
  try {
    await page.focus('#ch-tone-slider');
    await page.keyboard.press('ArrowRight');
    await wait(250);
    tasten = true;
  } catch (e) { tasten = String(e.message).slice(0, 140); }
  const nachRechts = O(await ev(REGLER));
  await page.keyboard.press('ArrowLeft');
  await wait(250);
  await page.keyboard.press('ArrowLeft');
  await wait(250);
  const nachLinks = O(await ev(REGLER));
  check('Der Regler ist per Tastatur bedienbar: Pfeil rechts/links bewegt ihn um genau einen Rastpunkt, schreibt den Ton und der Fokus bleibt auf dem Regler',
    tasten === true && nachRechts.tone === 'hart' && nachRechts.now === '2' &&
    /Hart/i.test(nachRechts.txt || '') && nachRechts.fokus === 'ch-tone-slider' &&
    nachLinks.tone === 'ruhig' && nachLinks.now === '0' && nachLinks.fokus === 'ch-tone-slider',
    JSON.stringify({ tasten, rechts: nachRechts.tone, links: nachLinks.tone,
                     fokus: nachLinks.fokus, now: nachLinks.now }));

  // ── 43) Heute-Karte: Ring der naechsten faelligen Gruppe + Wochenzahl ───
  const KARTE = () => {
    const host = document.getElementById('coach-today-card');
    const q = (s) => host ? host.querySelector(s) : null;
    return {
      karten: document.querySelectorAll('#pg-heute .aic').length,
      pad: document.querySelectorAll('#heute-pad > div').length,
      tabs: document.querySelectorAll('.tabbar .tab').length,
      ring: ((q('.aic-r-val') || {}).textContent || '').trim(),
      gruppe: ((q('.aic-r-lbl') || {}).textContent || '').trim(),
      woche: ((q('.aic-head') || {}).textContent || '').trim(),
      heute: ((q('.aic-sub') || {}).textContent || '').trim(),
      satz: ((q('.aic-say') || {}).textContent || '').trim(),
      cta: !!q('.aic-go'),
      rolle: (q('.aic-top') || { getAttribute: () => null }).getAttribute('role'),
      text: host ? (host.textContent || '').replace(/\s+/g, ' ').trim() : ''
    };
  };
  await boot();
  r = O(await ev(() => {
    // Ein Plan fuer heute: damit die Karte ihren CTA traegt und "was heute
    // ansteht" etwas zu sagen hat.
    S.weekPlan = S.weekPlan || {};
    S.weekPlan[todayKey()] = { type: 'exercises', exIds: ['ex0', 'ex1'] };
    persist();
    closeOv('ov-coach-hub');
    renderHome();
    const mgRec = getMuscleGroupRecovery();
    const kand = MUSCLE_GROUPS.map(mg => ({ mg, r: mgRec[mg.id] })).filter(c => c.r && c.r.lastTs)
      .sort((a, b) => b.r.recPct - a.r.recPct);
    const ws = CoachReport.weekStart(Date.now());
    const n  = CoachReport.weekNumbers(_crSessions(), ws);
    const v  = CoachReport.weekNumbers(_crSessions(), ws - 7 * 864e5);
    return { soll: kand[0] ? { lbl: muscleLabel(kand[0].mg.id), pct: kand[0].r.recPct } : null,
             vol: Math.round(kgToDisp(n.vol)), vorVol: Math.round(kgToDisp(v.vol)),
             karte: null };
  }));
  const karte = O(await ev(KARTE));
  check('Heute-Karte, Zone links: der Ring zeigt die Erholung der naechsten faelligen Muskelgruppe und ihren NAMEN darunter — kein allgemeiner Durchschnittswert mehr',
    !!r.soll && karte.gruppe === r.soll.lbl && karte.ring.indexOf(String(r.soll.pct)) === 0,
    JSON.stringify({ soll: r.soll, ring: karte.ring, gruppe: karte.gruppe }));

  check('Heute-Karte, Zone rechts: erste Zeile ist das Volumen der laufenden Woche mit Pfeil und Prozent zur Vorwoche (gegen CoachReport.weekNumbers gerechnet), zweite Zeile sagt, was heute ansteht',
    /[↑↓→]/.test(karte.woche || '') && /%/.test(karte.woche || '') &&
    (karte.woche || '').indexOf(String(r.vol).replace(/\B(?=(\d{3})+(?!\d))/g, '.')) >= 0 &&
    (karte.heute || '').length > 3 && !/NaN|undefined/.test(karte.woche + karte.heute),
    JSON.stringify({ vol: r.vol, vorVol: r.vorVol, woche: karte.woche, heute: karte.heute }));

  check('Heute-Karte: darunter EIN Satz vom Coach aus der Sprachfabrik, der CTA "Training starten" steht weiter da, und der Kopfbereich behaelt Rolle und Tastaturzugang',
    (karte.satz || '').length > 10 && karte.cta === true && karte.rolle === 'button' &&
    !/\{[a-z]+\}/i.test(karte.satz || ''),
    JSON.stringify({ satz: karte.satz, cta: karte.cta, rolle: karte.rolle }));

  // ── 44) Der Coach-Satz wechselt mit dem Ton ────────────────────────────
  r = O(await ev(() => {
    const lies = () => ((document.querySelector('#coach-today-card .aic-say') || {}).textContent || '').trim();
    const out = {};
    ['ruhig', 'sachlich', 'hart', 'locker'].forEach(t => { setAiCoachOpt('tone', t); out[t] = lies(); });
    return out;
  }));
  check('Der Satz auf der Karte steht im GEWAEHLTEN Ton: alle vier Toene ergeben vier verschiedene Saetze',
    Object.keys(r || {}).length === 4 && Object.values(r).every(v => v && v.length > 10) &&
    new Set(Object.values(r)).size === 4,
    JSON.stringify(r).slice(0, 600));

  // ── 45) CTA startet das Training und oeffnet NICHT den Hub ─────────────
  await ev(() => { try { closeOv('ov-coach-hub'); } catch (_) {} goTabId('heute'); renderHome(); });
  await wait(300);
  let ctaTipp = false;
  try { await page.click('#coach-today-card .aic-go'); ctaTipp = true; } catch (e) { ctaTipp = String(e.message).slice(0, 140); }
  await wait(400);
  const nachCta = O(await ev(() => ({
    hub: document.getElementById('ov-coach-hub').classList.contains('on'),
    tab: (document.querySelector('.page.on') || {}).id || null })));
  check('Tipp auf "Training starten" startet das Training und oeffnet den Hub NICHT (der closest("button, a")-Waechter haelt)',
    ctaTipp === true && nachCta.hub === false && nachCta.tab !== 'pg-heute',
    JSON.stringify({ ctaTipp, nachCta }));

  // ── 46) Tipp daneben und Enter oeffnen den Hub ─────────────────────────
  await ev(() => { goTabId('heute'); renderHome(); });
  await wait(300);
  let daneben = false;
  try { await page.click('#coach-today-card .aic-top'); daneben = true; } catch (e) { daneben = String(e.message).slice(0, 140); }
  await wait(400);
  const nachDaneben = O(await ev(() => {
    const auf = document.getElementById('ov-coach-hub').classList.contains('on');
    closeOv('ov-coach-hub');
    return { auf };
  }));
  await wait(200);
  let enter = false;
  try { await page.focus('#coach-today-card .aic-top'); await page.keyboard.press('Enter'); enter = true; }
  catch (e) { enter = String(e.message).slice(0, 140); }
  await wait(400);
  const nachEnter = O(await ev(() => ({ auf: document.getElementById('ov-coach-hub').classList.contains('on') })));
  check('Tipp neben den CTA oeffnet den Hub, und Enter auf dem Kopfbereich tut dasselbe — die Karte bleibt der einzige Zugang',
    daneben === true && nachDaneben.auf === true && enter === true && nachEnter.auf === true,
    JSON.stringify({ daneben, nachDaneben, enter, nachEnter }));

  // ── 47) Umbenennen zeichnet die Karte neu (Signatur) ───────────────────
  r = O(await ev(() => {
    closeOv('ov-coach-hub');
    renderHome();
    const vor = (document.querySelector('#coach-today-card .aic-lbl') || {}).textContent;
    setAiCoachOpt('name', 'Nina');
    const nach = (document.querySelector('#coach-today-card .aic-lbl') || {}).textContent;
    // Und ein reiner Tonwechsel darf die Karte ebenfalls nicht einfrieren.
    setAiCoachOpt('tone', 'hart');
    const satz1 = (document.querySelector('#coach-today-card .aic-say') || {}).textContent;
    setAiCoachOpt('tone', 'locker');
    const satz2 = (document.querySelector('#coach-today-card .aic-say') || {}).textContent;
    return { vor, nach, satz1, satz2 };
  }));
  check('Die Karten-Signatur (_aicSig) traegt alle neuen Werte: nach setAiCoachOpt("name") steht der neue Name da, und ein Tonwechsel zeichnet den Satz neu — genau hier ist in Task 8 ein Fehler entstanden',
    r.vor !== 'Nina' && r.nach === 'Nina' && r.satz1 && r.satz2 && r.satz1 !== r.satz2,
    JSON.stringify(r).slice(0, 500));

  // ── 48) lbs: keine kg-Zahl auf der Karte ───────────────────────────────
  await boot({ unit: 'lbs' });
  r = O(await ev(() => {
    S.weekPlan = S.weekPlan || {};
    S.weekPlan[todayKey()] = { type: 'exercises', exIds: ['ex0', 'ex1'] };
    persist();
    closeOv('ov-coach-hub');
    renderHome();
    const host = document.getElementById('coach-today-card');
    return { text: host ? (host.textContent || '').replace(/\s+/g, ' ').trim() : '' };
  }));
  check('S.unitMode = "lbs": auf der Heute-Karte steht keine kg-Zahl — die Einheit haengt am Wert, nicht im Satz',
    /lbs/.test(r.text || '') && !/\bkg\b/.test(r.text || '') && !/NaN|undefined/.test(r.text || ''),
    JSON.stringify(r).slice(0, 400));

  // ── 49) Gestaltungsregel 1 haelt auch nach dem Umbau der Karte ─────────
  const flaechen = O(await ev(KARTE));
  check('Gestaltungsregel 1: der Heute-Tab traegt weiterhin zwei Flaechen unter der Kopfzeile, genau EINE .aic-Karte und fuenf Tab-Knoepfe — die drei Zonen liegen in EINEM Rahmen',
    flaechen.karten === 1 && flaechen.pad === 2 && flaechen.tabs === 5,
    JSON.stringify({ karten: flaechen.karten, pad: flaechen.pad, tabs: flaechen.tabs }));

  // ── 50) Volumenbalken ohne Berichtsarchiv ──────────────────────────────
  await boot({ berichte: false });
  await hubAuf('week');
  const ohneArchiv = O(await ev(WOCHE));
  check('Leeres Berichtsarchiv, aber acht Wochen Einheiten: die Volumenbalken erscheinen trotzdem — sonst bliebe die Kachel genau in den ersten acht Wochen leer, in denen der Nutzer ueber das Abo entscheidet',
    ohneArchiv.vol === true && (ohneArchiv.volLabels || []).length >= 5 &&
    (ohneArchiv.volLabels || []).every(l => /^(KW|Week) \d+$/.test(l)),
    JSON.stringify({ vol: ohneArchiv.vol, labels: ohneArchiv.volLabels }));

  // ── 51) Archivwert schlaegt Rechnung ───────────────────────────────────
  r = O(await ev(() => {
    // Drei Wochen bekommen einen Bericht mit einem Wert, den die Rechnung aus
    // den Einheiten NIE ergaebe. Steht er im Bild, hat das Archiv gewonnen.
    const now = Date.now();
    const reps = [];
    for (let w = 3; w >= 1; w--) {
      const ts = now - w * 7 * 864e5;
      const ws = CoachReport.weekStart(ts);
      const key = _crWeekKey(ts);
      if (ws === null || !key) continue;
      reps.unshift({ weekKey: key, label: _crLabel(ws),
                     numbers: { workouts: 1, sets: 1, vol: 4321, prevVol: 0, volDelta: 0, prs: [], muscles: {}, streak: 0 },
                     text: '', forecast: null, ts: ts });
    }
    S.coachReports = reps;
    persist();
    renderCoachHub();
    const c = Chart.getChart(document.getElementById('chw-vol-cv'));
    return { labels: c ? c.data.labels.slice() : null, werte: c ? c.data.datasets[0].data.slice() : null,
             archiv: reps.map(x => x.weekKey), soll: Math.round(kgToDisp(4321)) };
  }));
  const treffer = (r.werte || []).filter(v => Math.round(v) === r.soll).length;
  check('Archiv mit drei Wochen, Einheiten ueber acht: alle Balken stehen, und die drei archivierten Wochen tragen den ARCHIVWERT — Bericht schlaegt Rechnung, immer',
    (r.labels || []).length >= 5 && treffer === 3 &&
    (r.werte || []).every(v => typeof v === 'number' && isFinite(v)),
    JSON.stringify({ labels: r.labels, werte: r.werte, soll: r.soll, treffer }).slice(0, 500));

  // ── 52) Trainingsfreie Woche: 0 statt NaN ──────────────────────────────
  r = O(await ev(() => {
    // Die Woche vor der laufenden komplett leeren — weder Einheit noch Bericht.
    const ws = CoachReport.weekStart(Date.now()) - 7 * 864e5;
    S.coachReports = [];
    S.sessions = (S.sessions || []).filter(s => {
      const ts = new Date(s.date).getTime();
      return !(ts >= ws && ts < ws + 7 * 864e5);
    });
    persist();
    renderCoachHub();
    const c = Chart.getChart(document.getElementById('chw-vol-cv'));
    return { werte: c ? c.data.datasets[0].data.slice() : null,
             labels: c ? c.data.labels.slice() : null };
  }));
  check('Eine Woche ohne Einheit und ohne Bericht steht als 0 im Bild, nicht als NaN und nicht als Luecke ohne Beschriftung — eine Pause ist eine Aussage',
    (r.werte || []).length >= 3 && (r.werte || []).every(v => typeof v === 'number' && isFinite(v)) &&
    (r.werte || []).some(v => v === 0) &&
    (r.labels || []).every(l => /^(KW|Week) \d+$/.test(l)),
    JSON.stringify(r).slice(0, 400));

  // ── 53) prefers-reduced-motion: der Regler rastet ohne Uebergang ───────
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await boot();
  await hubAuf('persona');
  r = O(await ev(REGLER));
  check('prefers-reduced-motion: reduce — der Griff des Ton-Reglers rastet ohne Uebergang ein (0 s)',
    r.da === true && r.dauer === '0s',
    JSON.stringify({ da: r.da, dauer: r.dauer }));
  await page.emulateMediaFeatures([]);

  await browser.close();
  server.close();

  // ── 54) Statisch: die alte Struktur ist weg, nicht nur unsichtbar ───────
  // Gemessen wird der CODE, nicht die Erklaerung: der Kommentar, der begruendet,
  // WARUM das Segmented Control entfaellt, darf stehen bleiben.
  try {
    const src = fs.readFileSync(SRC, 'utf8');
    const code = ohneKommentar(src);
    check('Statisch: _CH_TABS, coachHubTab(), _chTab, .ch-tabs, .ch-tab und die vier Reiter-Ids sind aus index.html verschwunden — das Segmented Control ueberlebt nirgends',
      !/_CH_TABS/.test(code) && !/coachHubTab\s*\(/.test(code) && !/_chTab\b/.test(code) &&
      !/\.ch-tabs\b/.test(code) && !/\.ch-tab\b/.test(code) && !/ch-tab-/.test(code),
      JSON.stringify({ chTabs: /_CH_TABS/.test(code), fn: /coachHubTab\s*\(/.test(code),
                       varr: /_chTab\b/.test(code), css: /\.ch-tabs\b/.test(code),
                       cls: /\.ch-tab\b/.test(code), ids: /ch-tab-/.test(code) }));
  } catch (e) { check('Statisch: die alte Reiterstruktur ist weg', false, String(e.message)); }

  // ── 55) Statisch: der Hub-Block nutzt persist(), keine Emojis, esc() ────
  try {
    const src = fs.readFileSync(SRC, 'utf8');
    const a = src.indexOf('// ═══ COACH-HUB: ein Blatt mit fünf aufklappenden Kacheln');
    const b = src.indexOf('COACH-EINRICHTUNG (Task 10', a > 0 ? a : 0);
    const block = a > 0 && b > a ? src.slice(a, b) : '';
    const code = ohneKommentar(block);
    check('Statisch: der Hub-Block nutzt persist() und nirgends save(), traegt kein Emoji, jeder Einstiegspunkt liegt in try/catch',
      block.length > 4000 && !/[^a-zA-Z_$.]save\s*\(/.test(code) &&
      !PIKTO.test(block.replace(/\u2715/g, '')) &&
      /function coachHubOpen\s*\(/.test(code) && /_chHoldBody/.test(code) &&
      /_chOpen/.test(code) && (code.match(/catch\s*\(/g) || []).length >= 12,
      JSON.stringify({ len: block.length, save: /[^a-zA-Z_$.]save\s*\(/.test(code),
                       emoji: PIKTO.test(block.replace(/\u2715/g, '')),
                       catches: (code.match(/catch\s*\(/g) || []).length }).slice(0, 500));
  } catch (e) { check('Statisch: persist(), keine Emojis, try/catch im Hub-Block', false, String(e.message)); }

  // ── 56) Statisch: _chOpen wird beim Kontowechsel zurueckgesetzt ─────────
  try {
    const src = fs.readFileSync(SRC, 'utf8');
    const a = src.indexOf("schritt('Hub'");
    const zeile = a > 0 ? src.slice(a, a + 200) : '';
    check('Statisch: die Datentrennung setzt _chOpen zurueck (dieselbe Stelle, an der bisher _chTab genullt wurde) — Konto B landet nicht in fremden Zahlen',
      a > 0 && /_chOpen\s*=\s*'chat'/.test(zeile) && !/_chTab/.test(zeile),
      JSON.stringify({ zeile: zeile.split('\n')[0] }));
  } catch (e) { check('Statisch: _chOpen wird beim Kontowechsel zurueckgesetzt', false, String(e.message)); }

  console.log('\n-- Hub-Umbau, Task 2 — ein Blatt mit fuenf Kacheln (Chromium statt Simulator) --');
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
