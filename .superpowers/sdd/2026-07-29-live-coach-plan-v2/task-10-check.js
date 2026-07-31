/* Task-10-Verifikation ohne iOS-Simulator (Windows, kein Xcode).
   Jeder Punkt der Pruefliste aus task-10-brief.md ist EIN Check, dazu die
   Verhaltensdetails (kein Backdrop-onclick, 420 ms nach dem Kauf, kein Aufruf
   beim App-Start) und die globalen Regeln (Zweisprachigkeit, kein Emoji, ein
   Einstieg im Heute-Tab). Statischer Node-Server + Chromium ueber Puppeteer.
   Tipps laufen ueber echte Zeigerfolgen (ElementHandle.click), nicht ueber
   synthetisches .click() aus dem Seitenkontext — genau daran ist in Task 9 ein
   echter Fehler durch die Suite gerutscht. Eigener Port: 8794 (task-9 haelt 8793). */
const http = require('http');
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '../../..');
const puppeteer = require(path.join(REPO, 'node_modules/puppeteer'));

const argRoot = (process.argv.find(a => a.startsWith('--root=')) || '').slice(7);
const ROOT = argRoot ? path.resolve(argRoot) : REPO;
const SRC  = path.join(ROOT, 'index.html');
const SHOT = path.join(ROOT, '.superpowers/sdd/2026-07-29-live-coach-plan-v2/task-10-setup.png');
const PORT = 8794;
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

// Jeder deutsche Oberflaechen-String, den die Einrichtung NEU ueber tr()
// rendert. Geprueft wird der konkrete Schluesselbestand, nicht eine Stichprobe
// im gerenderten Text: in Task 9 ist aufgefallen, dass eine Zehn-Phrasen-Sperr-
// liste fehlende Schluessel nicht faengt. Kurze Schalterwoerter (Weiter, Name)
// laufen bewusst ueber _cm(de,en) und haben deshalb keinen globalen Schluessel.
const SETUP_TR_KEYS = [
  'Wie soll dein Coach heißen?',
  'Name und Ton kannst du jederzeit ändern.',
  // aus dem Hub mitbenutzt (dieselbe Darstellung, dieselben Schluessel)
  'Wie soll dein Coach klingen?', 'Wie viel Coach willst du?',
  'Ruhig', 'Sachlich', 'Hart', 'Locker',
  'Zurückhaltend', 'Ausgewogen', 'Eng dabei',
  'Kein Live-Coach, keine Rückmeldung nach dem Satz, stille Nachrichten.',
  'Live-Coach bei Schlüsselmomenten, Rückmeldung nach dem Satz, normale Nachrichten.',
  'Live-Coach bei jedem Satz, Rückmeldung nach dem Satz, enge Nachrichten.',
  'Zurück', 'Fertig', 'Überspringen',
  // Schritt 3 (Trainings-Erinnerung). Die zusammengesetzten Zeilen tragen den
  // Coach-Namen bzw. die Uhrzeit und laufen deshalb ueber _cm(de,en) — nur die
  // freistehenden Strings brauchen einen globalen Schluessel.
  'Die Erinnerung nennt Übung, Sätze, Wiederholungen und Gewicht deines nächsten Trainings.',
  'Nicht erinnern', 'Ja, erinnere mich'
];

// Der CACHE-Name von sw.js zum Zeitpunkt des Laufs: der Versions-Bump ist ein
// eigener Ritualschritt nach dieser Task, diese Welle darf ihn nicht anfassen.
const SW_CACHE_VORHER = (function () {
  try { return (fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8')
    .match(/const CACHE\s*=\s*['"]([^'"]+)['"]/) || [])[1] || null; } catch (_) { return null; }
})();

const results = [];
const check = (name, cond, got) => results.push({ name, ok: !!cond, got });
const wait = ms => new Promise(r => setTimeout(r, ms));

// Grundzustand fuer jeden Lauf: Premium an, Anmelde-Wand weg (z-index 1390,
// faengt sonst jeden echten Zeigerklick ab — rein visuell, kein Renderpfad).
const BOOTSTATE = () => {
  window.isPremium = () => true;
  const gate = document.getElementById('auth-gate'); if (gate) gate.style.display = 'none';
  // Ein frisches Profil hat WEDER Uebungen NOCH Einheiten. Beides wird gebraucht:
  // die zweite Beispielzeile der Ton-Auswahl zeigt seit Triage 1 nur ECHTE Zahlen
  // und entfaellt ohne Verlauf, und _coachMicroReact braucht eine Uebung, die
  // exById() findet (exById ist eine const-Arrow ueber S.exercises - nicht
  // stubbar, also wird der Bestand selbst gefuellt).
  if (!(S.exercises || []).length) {
    S.exercises = [{ id: 'chk-ex', name: 'Bankdruecken', muscle: 'chest', targetType: 'reps' }];
  }
  if (!(S.sessions || []).length) {
    S.sessions = [{ date: '2026-07-28', logs: [{ exerciseId: 'chk-ex',
      sets: [{ w: 50, r: 10, type: 'normal' }, { w: 50, r: 10, type: 'normal' }] }] }];
  }
  persist();
};

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text().slice(0, 200)); });

  // Ein geplatzter Check darf den Lauf nicht abbrechen: sonst zeigt der Lauf VOR
  // der Aenderung nur den ersten Fehler statt der ganzen Pruefliste.
  const ev = async (fn, arg) => {
    try { return (arg === undefined) ? await page.evaluate(fn) : await page.evaluate(fn, arg); }
    catch (e) { return { __err: String((e && e.message) || e).slice(0, 200) }; }
  };
  const boot = async () => {
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 60000 });
    await wait(1500);
    await ev(BOOTSTATE);
  };
  // Echter Tipp auf das Element mit genau diesem onclick. scrollIntoView mit
  // block:'center' vorher, weil Puppeteer sonst an die Oberkante scrollt — dort
  // liegt der klebende .sh-handle darueber und faengt den Zeigerklick ab
  // (Testartefakt, kein App-Fehler: ein Nutzer tippt auf das, was er sieht).
  const tap = async (sel, onclick) => {
    try {
      for (const h of await page.$$(sel)) {
        const oc = await h.evaluate(e => e.getAttribute('onclick'));
        if (oc !== onclick) continue;
        await h.evaluate(e => e.scrollIntoView({ block: 'center' }));
        await wait(70);
        await h.click();
        return true;
      }
      return 'kein Element mit onclick=' + onclick;
    } catch (e) { return 'Tipp geplatzt (' + onclick + '): ' + String(e.message).slice(0, 120); }
  };
  // Bestandsnutzer-Pfad aus dem Brief: im Browser laeuft kein echter Kauf.
  const reset = () => ev(() => {
    try { closeOv('ov-coach-setup'); } catch(_) {}
    try { closeOv('ov-coach-hub'); } catch(_) {}
    S.aiCoach = S.aiCoach || {};
    delete S.aiCoach.preset;
    persist();
  });

  await boot();

  // ── 0) Kein Aufruf beim App-Start ────────────────────────────────────────
  let r = await ev(() => {
    S.aiCoach = S.aiCoach || {}; delete S.aiCoach.preset; persist();
    return { fn: typeof window.openCoachSetup,
             markup: !!document.getElementById('ov-coach-setup'),
             offen: !!(document.getElementById('ov-coach-setup') || {}).classList
                     && document.getElementById('ov-coach-setup').classList.contains('on') };
  });
  const nachNeustart = (await boot(), await ev(() => ({
    preset: S.aiCoach ? S.aiCoach.preset : 'kein aiCoach',
    offen: !!(document.getElementById('ov-coach-setup') || { classList: { contains: () => false } }).classList.contains('on')
  })));
  check('Einrichtung existiert, startet aber NICHT beim App-Start (fehlendes preset allein reicht nicht)',
    r.fn === 'function' && r.markup === true && nachNeustart.offen === false &&
    nachNeustart.preset === undefined, JSON.stringify({ r, nachNeustart }));

  // ── 1) Hub oeffnen bei fehlendem preset ⇒ Einrichtung statt Hub ──────────
  await ev(BOOTSTATE);
  r = await ev(() => {
    openCoachHub('chat');
    const cs = document.getElementById('ov-coach-setup');
    const hub = document.getElementById('ov-coach-hub');
    return {
      setupOffen: !!(cs && cs.classList.contains('on')),
      hubZu: !(hub && hub.classList.contains('on')),
      dots: document.querySelectorAll('#cst-dots .pwz-dot').length,
      dotsOn: document.querySelectorAll('#cst-dots .pwz-dot.on').length,
      titel: (document.getElementById('cst-title') || {}).textContent,
      // Schritt 1 traegt Namensfeld und die vier Tonkarten mit Beispielsatz
      feld: !!document.getElementById('cst-name'),
      max: (document.getElementById('cst-name') || {}).getAttribute
             ? document.getElementById('cst-name').getAttribute('maxlength') : null,
      ph: (document.getElementById('cst-name') || {}).placeholder,
      karten: document.querySelectorAll('#cst-body .ch-preset').length,
      saetze: [...document.querySelectorAll('#cst-body .ch-preset span')].map(s => s.textContent.trim())
    };
  });
  check('Hub bei fehlendem preset: Einrichtung startet bei Schritt 1 (Namensfeld maxlength=20, Platzhalter "Coach", vier Tonkarten)',
    r.setupOffen === true && r.hubZu === true && r.dots === 3 && r.dotsOn === 1 &&
    r.feld === true && r.max === '20' && r.ph === 'Coach' && r.karten === 4 &&
    (r.saetze || []).length === 4 && new Set(r.saetze || []).size === 4 &&
    (r.saetze || []).every(s => s && s.length > 12), JSON.stringify(r).slice(0, 900));

  // ── 2) Kein onclick auf dem Overlay-Hintergrund ──────────────────────────
  // Erst die Einblendung abwarten (.sheet faehrt in .28s hoch), sonst liegt die
  // gemessene Oberkante noch am unteren Rand und der "Tipp daneben" landet mitten
  // im Sheet. Der Trefferpunkt wird BELEGT (elementFromPoint === das Overlay),
  // damit der Check nicht versehentlich ins Leere klickt und trotzdem gruen wird.
  await wait(500);
  const rect = await ev(() => {
    const sh = document.querySelector('#ov-coach-setup .sheet');
    const b = sh ? sh.getBoundingClientRect() : null;
    const y = b ? Math.max(8, Math.round(b.top) - 40) : 8;
    const hit = document.elementFromPoint(195, y);
    return { attr: document.getElementById('ov-coach-setup').getAttribute('onclick'),
             top: b ? Math.round(b.top) : null, y, treffer: hit ? (hit.id || hit.className) : null,
             hubAttr: document.getElementById('ov-coach-hub').getAttribute('onclick') };
  });
  if (rect && typeof rect.y === 'number') await page.mouse.click(195, rect.y);
  r = await ev(() => ({
    offen: document.getElementById('ov-coach-setup').classList.contains('on'),
    step: typeof _csStep === 'undefined' ? null : _csStep,
    preset: S.aiCoach.preset
  }));
  check('Kein onclick auf dem Hintergrund: echter Tipp daneben bricht die Einrichtung nicht ab (Hub hat den Handler weiter)',
    rect.attr === null && typeof rect.hubAttr === 'string' && /closeOv/.test(rect.hubAttr || '') &&
    rect.treffer === 'ov-coach-setup' && rect.top > 60 &&
    r.offen === true && r.step === 1 && r.preset === undefined, JSON.stringify({ rect, r }));

  // ── 2b) Der Sammel-Zuhoerer lebt: fremdes Overlay schliesst weiter ───────
  // Der Check darueber belegt nur, dass die Einrichtung NICHT schliesst. Nimmt
  // man den Sammel-Zuhoerer (index.html: forEach ueber alle .ov) ganz weg, waere
  // auch er gruen — waehrend 14 Overlays ohne inline onclick (ov-wk, ov-plan,
  // ov-det, ov-mg-stat, ov-ex-lib, ov-share …) den Hintergrund-Tipp verlieren.
  // Darum hier ein echter Zeigerklick auf den Hintergrund von ov-plan, das
  // ebenfalls kein inline onclick traegt.
  const fremd = await ev(() => {
    closeOv('ov-coach-setup');
    openOv('ov-plan');
    const sh = document.querySelector('#ov-plan .sheet');
    const b = sh ? sh.getBoundingClientRect() : null;
    const y = b ? Math.max(8, Math.round(b.top) - 40) : 8;
    const hit = document.elementFromPoint(195, y);
    return { attr: document.getElementById('ov-plan').getAttribute('onclick'),
             y, treffer: hit ? (hit.id || hit.className) : null,
             offen: document.getElementById('ov-plan').classList.contains('on') };
  });
  if (fremd && typeof fremd.y === 'number') await page.mouse.click(195, fremd.y);
  const fremdNach = await ev(() => ({
    zu: !document.getElementById('ov-plan').classList.contains('on')
  }));
  check('Fremdes Overlay ohne inline onclick (ov-plan) schliesst per Hintergrund-Tipp weiter — nur die Einrichtung ist ausgenommen',
    fremd.attr === null && fremd.treffer === 'ov-plan' && fremd.offen === true && fremdNach.zu === true,
    JSON.stringify({ fremd, fremdNach }));

  // ── 3) Schritt 1: Name tippen, dann alle vier Toene ──────────────────────
  // Der ERSTE Tipp kommt direkt nach dem Namensfeld: das onchange feuert beim
  // Blur, also zwischen pointerdown und pointerup — ohne Haltewaechter nimmt der
  // Rerender die getippte Karte aus dem DOM und der Tipp ist verloren (Befund 2
  // aus Task 9, hier fuer die Einrichtung).
  await reset();
  await ev(() => { openCoachHub('chat');
    const sh = document.querySelector('#ov-coach-setup .sheet'); if (sh) sh.scrollTop = 0; });
  await wait(500);
  let nameOk = false;
  try {
    await page.click('#cst-name');
    await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
    await page.type('#cst-name', 'Nina');
    nameOk = true;
  } catch (e) { nameOk = String(e.message).slice(0, 120); }
  const toene = ['ruhig', 'sachlich', 'hart', 'locker'];
  const live = [], gesetzt = [], getippt = [];
  for (const t of toene) {
    getippt.push(await tap('#cst-body .ch-preset', `setAiCoachOpt('tone','${t}')`));
    const s = await ev((tk) => ({
      tone: S.aiCoach.tone,
      on: !![...document.querySelectorAll('#cst-body .ch-preset')].find(b =>
            b.getAttribute('onclick') === `setAiCoachOpt('tone','${tk}')` && b.classList.contains('on')),
      ex: (document.getElementById('cst-tone-ex') || {}).textContent,
      name: S.aiCoach.name, titel: (document.getElementById('cst-title') || {}).textContent,
      feld: (document.getElementById('cst-name') || {}).value
    }), t);
    live.push((s.ex || '').replace(/\s+/g, ' ').trim());
    gesetzt.push(s.tone + (s.on ? '+on' : '-off'));
    if (t === 'locker') { r = s; }
  }
  check('Schritt 1: erster Tipp nach dem Namensfeld zaehlt, alle vier Toene setzen sich und der Beispielsatz wechselt jedes Mal',
    nameOk === true && getippt.every(x => x === true) &&
    gesetzt.join(',') === 'ruhig+on,sachlich+on,hart+on,locker+on' &&
    live.length === 4 && new Set(live).size === 4 && live.every(x => x && x.length > 12) &&
    r.name === 'Nina' && r.titel === 'Nina' && r.feld === 'Nina' && /Nina/.test(live[3] || ''),
    JSON.stringify({ nameOk, getippt, gesetzt, live, r }).slice(0, 1100));

  // ── 4) preset bleibt bis zum Abschluss offen ──────────────────────────────
  r = await ev(() => ({ preset: S.aiCoach.preset, step: typeof _csStep === 'undefined' ? null : _csStep,
    offen: !!(document.getElementById('ov-coach-setup') || { classList: { contains: () => false } }).classList.contains('on') }));
  check('Name und Ton lassen preset offen und die Einrichtung auf Schritt 1 (sonst entfaellt die Frage nach dem Umfang)',
    r.preset === undefined && r.step === 1 && r.offen === true, JSON.stringify(r));

  // ── 5) Schritt 2: nur Schalter + Erklaersatz, kein leerer Listenrahmen ────
  const weiter1 = await tap('#cst-nav .btn', 'coachSetupStep(2)');
  r = await ev(() => {
    const body = document.getElementById('cst-body');
    const vc = document.getElementById('cst-voices');
    return {
      step: _csStep, dotsOn: [...document.querySelectorAll('#cst-dots .pwz-dot')].findIndex(d => d.classList.contains('on')),
      schalter: body.querySelectorAll('input[type=checkbox]').length,
      onchange: (body.querySelector('input[type=checkbox]') || {}).getAttribute
                  ? body.querySelector('input[type=checkbox]').getAttribute('onchange') : null,
      text: body.textContent.replace(/\s+/g, ' ').trim(),
      // Kein Platzhalterkasten: der Behaelter der spaeteren Stimmenliste ist
      // leer und traegt weder Klasse noch Rahmen noch Hoehe.
      vcDa: !!vc, vcLeer: vc ? vc.children.length === 0 && vc.textContent.trim() === '' : null,
      vcKlasse: vc ? (vc.className || '') : null,
      vcHoehe: vc ? Math.round(vc.getBoundingClientRect().height) : null,
      kaesten: body.querySelectorAll('.ch-jrn, .ch-preset').length,
      // Die Leiste liegt in #cst-nav, ausserhalb des Scrollinhalts - deshalb
      // klebt sie am Rand und die primaere Aktion bleibt im Bild (Check 19).
      zurueck: !![...document.querySelectorAll('#cst-nav .btn')].find(b => b.getAttribute('onclick') === 'coachSetupStep(1)'),
      navAusserhalbBody: document.getElementById('cst-nav').parentElement !== document.getElementById('cst-body')
    };
  });
  // Block 2 (Stimme) ist gestrichen, nicht verschoben: der Stimmen-Schritt ist aus
  // der Oberflaeche raus, die Einrichtung ist zweistufig (Name+Ton, Umfang). Das
  // DATENFELD voiceOn bleibt in S.aiCoach und in personaGet unangetastet.
  check('Schritt 2 ist der Umfang: kein Stimmen-Schritt mehr (kein Schalter, kein Sprech-Satz, kein #cst-voices), Leiste ausserhalb des Scrollinhalts',
    weiter1 === true && r.step === 2 && r.dotsOn === 1 && r.schalter === 0 &&
    r.onchange === null && r.zurueck === true &&
    !/Sprech-Button/.test(r.text || '') && !/nie von selbst/.test(r.text || '') &&
    !/sprechen\?/.test(r.text || '') && !/Sprachausgabe/.test(r.text || '') &&
    r.vcDa === false && r.kaesten === 3 &&
    r.navAusserhalbBody === true,
    JSON.stringify(r).slice(0, 900));

  // ── 6) Stimme ist aus der Oberflaeche raus, das Datenfeld lebt weiter ─────
  r = await ev(() => {
    const out = { schritte: _CS_STEPS };
    // a) Die kuenftige Funktion wird nicht mehr gerufen: Block 2 ist gestrichen.
    //    Ein Wurf darf trotzdem nichts anrichten - er darf gar nicht auftreten.
    window.__voicesGerufen = 0;
    window._csRenderVoices = () => { window.__voicesGerufen++; throw new Error('darf nicht gerufen werden'); };
    let txt = '';
    for (const st of [1, 2, 3]) { coachSetupStep(st); txt += ' ' + document.getElementById('cst-body').textContent; }
    out.gerufen = window.__voicesGerufen;
    delete window._csRenderVoices;
    // b) Bereichswache: Schritt 4 gibt es nicht, _csStep bleibt stehen. Schritt 3
    //    ist seit der Erinnerungsfrage ein GUELTIGER Schritt und muss greifen.
    coachSetupStep(1); coachSetupStep(4);
    out.nach4 = _csStep;
    coachSetupStep(3);
    out.nach3 = _csStep;
    coachSetupStep(2);
    out.nach2 = _csStep;
    // c) Kein Stimmen-Element irgendwo in der Einrichtung.
    out.voicesEl = !!document.getElementById('cst-voices');
    out.schalter = document.querySelectorAll('#ov-coach-setup input[type=checkbox]').length;
    out.text = txt.replace(/\s+/g, ' ').trim().slice(0, 400);
    // d) Das DATENFELD bleibt: S.aiCoach.voiceOn und personaGet tragen es weiter.
    out.feldDa = 'voiceOn' in (S.aiCoach || {});
    out.personaHatFeld = 'voiceOn' in CoachPersona.personaGet({});
    setAiCoachOpt('voiceOn', false);
    out.schreibbar = S.aiCoach.voiceOn === false && _persona().voiceOn === false;
    setAiCoachOpt('voiceOn', true);
    out.wiederAn = _persona().voiceOn === true;
    return out;
  });
  check('Stimme aus der Oberflaeche entfernt (drei Schritte: Name+Ton, Umfang, Erinnerung — kein Schalter, _csRenderVoices wird nie gerufen) — Datenfeld voiceOn lebt weiter',
    r.schritte === 3 && r.gerufen === 0 && r.nach4 === 1 && r.nach3 === 3 && r.nach2 === 2 &&
    r.voicesEl === false && r.schalter === 0 &&
    !/Sprech|Sprachausgabe|sprechen/.test(r.text || '') &&
    r.feldDa === true && r.personaHatFeld === true && r.schreibbar === true && r.wiederAn === true,
    JSON.stringify(r).slice(0, 900));

  // ── 7) Schritt 2 (Umfang): die mittlere ist vorbelegt, nicht die lauteste ─
  const weiter2 = await ev(() => { coachSetupStep(1); return true; }) &&
                  await tap('#cst-nav .btn', 'coachSetupStep(2)');
  r = await ev(() => {
    const body = document.getElementById('cst-body');
    const karten = [...body.querySelectorAll('.ch-preset')];
    return {
      step: _csStep, anzahl: karten.length,
      onclicks: karten.map(b => b.getAttribute('onclick')),
      on: karten.filter(b => b.classList.contains('on')).map(b => b.getAttribute('onclick')),
      saetze: karten.map(b => (b.querySelector('span') || {}).textContent.trim()),
      preset: S.aiCoach.preset,
      // Der Umfang ist seit der Erinnerungsfrage NICHT mehr der letzte Schritt:
      // die primaere Aktion heisst hier "Weiter" und fuehrt auf Schritt 3.
      weiter: !![...document.querySelectorAll('#cst-nav .btn')].find(b => b.getAttribute('onclick') === 'coachSetupStep(3)')
    };
  });
  check('Schritt 2 (Umfang): drei Profile mit je einem Beschreibungssatz, vorbelegt die MITTLERE ("Ausgewogen"), nicht die lauteste',
    weiter2 === true && r.step === 2 && r.anzahl === 3 &&
    (r.onclicks || []).join(',') === "setCoachPreset('quiet'),setCoachPreset('balanced'),setCoachPreset('close')" &&
    (r.on || []).join(',') === "setCoachPreset('balanced')" && r.preset === undefined &&
    (r.saetze || []).length === 3 && (r.saetze || []).every(s => s && s.length > 20) &&
    new Set(r.saetze || []).size === 3 && r.weiter === true, JSON.stringify(r).slice(0, 900));

  // ── 7b) Schritt 3: die Trainings-Erinnerung wird ANGEBOTEN ────────────────
  // Der inhaltliche Wert von Block 4 haengt an S.notifEnabled — einem Schalter,
  // der per Default aus ist und tief in den Einstellungen liegt. Ohne diese
  // Frage bleibt die Vorzeigefunktion fuer einen frischen Nutzer unsichtbar.
  // Vorbelegt ist die ZURUECKHALTENDE Karte: "Fertig" ohne Tipp schaltet nichts
  // ein, und der Systemdialog kommt nur nach einem bewussten Ja.
  const weiter3 = await tap('#cst-nav .btn', 'coachSetupStep(3)');
  r = await ev(() => {
    const body = document.getElementById('cst-body');
    const karten = [...body.querySelectorAll('.ch-preset')];
    return {
      step: _csStep,
      dotsAnzahl: document.querySelectorAll('#cst-dots .pwz-dot').length,
      dotsOn: [...document.querySelectorAll('#cst-dots .pwz-dot')].findIndex(d => d.classList.contains('on')),
      anzahl: karten.length,
      onclicks: karten.map(b => b.getAttribute('onclick')),
      on: karten.filter(b => b.classList.contains('on')).map(b => b.getAttribute('onclick')),
      frage: (body.querySelector('.pwz-q') || {}).textContent || '',
      saetze: karten.map(b => ((b.querySelector('span') || {}).textContent || '').trim()),
      notif: S.notifEnabled,
      schalter: body.querySelectorAll('input[type=checkbox]').length,
      fertig: !![...document.querySelectorAll('#cst-nav .btn')].find(b => b.getAttribute('onclick') === 'coachSetupDone(false)'),
      zurueck: !![...document.querySelectorAll('#cst-nav .btn')].find(b => b.getAttribute('onclick') === 'coachSetupStep(2)'),
      navAusserhalbBody: document.getElementById('cst-nav').parentElement !== document.getElementById('cst-body')
    };
  });
  check('Schritt 3 bietet die Trainings-Erinnerung an: zwei Karten, vorbelegt die zurueckhaltende ("Nicht erinnern"), S.notifEnabled bleibt aus, primaere Aktion ist "Fertig"',
    weiter3 === true && r.step === 3 && r.dotsAnzahl === 3 && r.dotsOn === 2 &&
    r.anzahl === 2 && r.schalter === 0 &&
    (r.onclicks || []).join(',') === 'coachSetupReminder(false),coachSetupReminder(true)' &&
    (r.on || []).join(',') === 'coachSetupReminder(false)' &&
    r.notif === false && r.fertig === true && r.zurueck === true &&
    r.navAusserhalbBody === true && /erinner/i.test(r.frage) &&
    (r.saetze || []).length === 2 && (r.saetze || []).every(s => s && s.length > 20) &&
    new Set(r.saetze || []).size === 2, JSON.stringify(r).slice(0, 900));
  await ev(() => { coachSetupStep(2); });

  // ── 8) "Zurueckhaltend" + "Fertig" ⇒ Profil vollstaendig, Hub auf Einstellungen ─
  const tippQuiet = await tap('#cst-body .ch-preset', "setCoachPreset('quiet')");
  const nachQuiet = await ev(() => ({ preset: S.aiCoach.preset, inTraining: S.aiCoach.inTraining,
    live: S.aiCoach.live, push: S.aiCoach.pushLevel, feedback: S.aiCoach.setFeedback,
    on: [...document.querySelectorAll('#cst-body .ch-preset')].filter(b => b.classList.contains('on'))
          .map(b => b.getAttribute('onclick')).join(',') }));
  const weiterAufDrei = await tap('#cst-nav .btn', 'coachSetupStep(3)');
  const tippFertig = weiterAufDrei === true && await tap('#cst-nav .btn', 'coachSetupDone(false)');
  await wait(700);
  r = await ev(() => ({
    setupZu: !document.getElementById('ov-coach-setup').classList.contains('on'),
    hubOffen: document.getElementById('ov-coach-hub').classList.contains('on'),
    // Seit dem Hub-Umbau uebergibt die Einrichtung an die KACHEL "Umfang und
    // Meldungen" statt an den Reiter "Einstellungen" — dieselbe Zusicherung:
    // der Nutzer landet dort, wo er sein Profil nachjustiert, und die Flaeche
    // ist offen und nicht bloss vorhanden.
    tab: _chOpen, tabOn: !!(document.getElementById('ch-card-scope') || {}).classList
           && document.getElementById('ch-card-scope').classList.contains('on'),
    // Durch Schritt 3 hindurch, ohne die Erinnerung zu waehlen: nichts wurde
    // ungefragt eingeschaltet, weder im Zustand noch auf der Platte.
    notif: S.notifEnabled,
    notifGespeichert: (() => { try { return JSON.parse(localStorage.getItem('ft4') || '{}').notifEnabled; } catch(_) { return 'lesefehler'; } })(),
    gespeichert: (() => { try { return (JSON.parse(localStorage.getItem('ft4') || '{}').aiCoach || {}); } catch(_) { return {}; } })()
  }));
  check('Schritt 2 "Zurueckhaltend", Schritt 3 unberuehrt, dann "Fertig": preset quiet, inTraining off, live false, pushLevel still, Erinnerung AUS — danach Hub auf "Einstellungen"',
    tippQuiet === true && weiterAufDrei === true && tippFertig === true &&
    r.notif === false && r.notifGespeichert !== true &&
    nachQuiet.preset === 'quiet' && nachQuiet.inTraining === 'off' && nachQuiet.live === false &&
    nachQuiet.push === 'still' && nachQuiet.feedback === false &&
    nachQuiet.on === "setCoachPreset('quiet')" &&
    r.setupZu === true && r.hubOffen === true && r.tab === 'scope' && r.tabOn === true &&
    r.gespeichert.preset === 'quiet' && r.gespeichert.inTraining === 'off' && r.gespeichert.live === false &&
    r.gespeichert.pushLevel === 'still',
    JSON.stringify({ tippQuiet, weiterAufDrei, tippFertig, nachQuiet, r }).slice(0, 1100));

  // ── 9) Hub erneut oeffnen ⇒ keine zweite Einrichtung ─────────────────────
  r = await ev(() => {
    closeOv('ov-coach-hub');
    openCoachHub('chat');
    const out = { setup: document.getElementById('ov-coach-setup').classList.contains('on'),
                  hub: document.getElementById('ov-coach-hub').classList.contains('on'), tab: _chOpen };
    // 'custom' ist ein gesetztes Profil und darf ebenfalls nicht erneut fragen
    closeOv('ov-coach-hub');
    S.aiCoach.preset = 'custom'; persist();
    openCoachHub('journal');
    out.customSetup = document.getElementById('ov-coach-setup').classList.contains('on');
    out.customHub = document.getElementById('ov-coach-hub').classList.contains('on');
    return out;
  });
  check('Hub erneut oeffnen: keine zweite Einrichtung — auch preset "custom" fragt nicht erneut',
    r.setup === false && r.hub === true && r.tab === 'chat' &&
    r.customSetup === false && r.customHub === true, JSON.stringify(r));

  // ── 10) Werte ueberleben den App-Neustart (persist statt save) ────────────
  await boot();
  r = await ev(() => ({ name: S.aiCoach.name, tone: S.aiCoach.tone, preset: S.aiCoach.preset,
                        inTraining: S.aiCoach.inTraining, live: S.aiCoach.live, push: S.aiCoach.pushLevel }));
  check('Werte ueberleben den App-Neustart: Name, Ton und das ganze Profil sind noch da (persist(), nicht save())',
    r.name === 'Nina' && r.tone === 'locker' && r.preset === 'custom' &&
    r.inTraining === 'off' && r.live === false && r.push === 'still', JSON.stringify(r));

  // ── 11) Sofort ✕ ⇒ preset 'balanced', keine erneute Frage ────────────────
  await ev(BOOTSTATE);
  await reset();
  r = await ev(() => { openCoachHub('chat'); return { offen: document.getElementById('ov-coach-setup').classList.contains('on') }; });
  await ev(() => { const sh = document.querySelector('#ov-coach-setup .sheet'); if (sh) sh.scrollTop = 0; });
  await wait(450);
  const tippX = await tap('#ov-coach-setup .x-btn', 'coachSetupDone(true)');
  await wait(700);
  const nachX = await ev(() => ({
    preset: S.aiCoach.preset, inTraining: S.aiCoach.inTraining, live: S.aiCoach.live, push: S.aiCoach.pushLevel,
    setupZu: !document.getElementById('ov-coach-setup').classList.contains('on'),
    // Ueberspringen fuehrt NICHT in den Hub — es laesst den Nutzer, wo er war
    hubZu: !document.getElementById('ov-coach-hub').classList.contains('on'),
    gespeichert: (() => { try { return (JSON.parse(localStorage.getItem('ft4') || '{}').aiCoach || {}).preset; } catch(_) { return null; } })()
  }));
  const nochmal = await ev(() => { openCoachHub('chat'); return {
    setup: document.getElementById('ov-coach-setup').classList.contains('on'),
    hub: document.getElementById('ov-coach-hub').classList.contains('on') }; });
  check('Sofort ✕: preset "balanced" (ausgewogen, vollstaendig) und beim naechsten Hub-Oeffnen keine erneute Frage',
    r.offen === true && tippX === true && nachX.preset === 'balanced' && nachX.inTraining === 'key' &&
    nachX.live === true && nachX.push === 'normal' && nachX.setupZu === true && nachX.hubZu === true &&
    nachX.gespeichert === 'balanced' && nochmal.setup === false && nochmal.hub === true,
    JSON.stringify({ r, tippX, nachX, nochmal }));

  // ── 12) Jeder Schliessweg legt ein Profil fest (Swipe-Dismiss) ────────────
  r = await ev(() => {
    closeOv('ov-coach-hub');
    S.aiCoach = S.aiCoach || {}; delete S.aiCoach.preset; persist();
    openCoachHub('chat');
    const offen = document.getElementById('ov-coach-setup').classList.contains('on');
    // Swipe-to-dismiss (initSheetSwipe) ruft closeOv direkt — ohne Netz bliebe
    // preset offen und der Hub fragte beim naechsten Oeffnen wieder.
    closeOv('ov-coach-setup');
    const nach = S.aiCoach.preset;
    openCoachHub('chat');
    return { offen, nach, setup: document.getElementById('ov-coach-setup').classList.contains('on'),
             hub: document.getElementById('ov-coach-hub').classList.contains('on'),
             gespeichert: (() => { try { return (JSON.parse(localStorage.getItem('ft4') || '{}').aiCoach || {}).preset; } catch(_) { return null; } })() };
  });
  check('Auch der stille Schliessweg (Swipe-Dismiss ⇒ closeOv) legt "balanced" fest, statt beim naechsten Mal wieder zu fragen',
    r.offen === true && r.nach === 'balanced' && r.gespeichert === 'balanced' &&
    r.setup === false && r.hub === true, JSON.stringify(r));

  // ── 12b) Faellt setCoachPreset() aus, landet der Nutzer trotzdem im Hub ──
  // setCoachPreset() kehrt bei fehlendem CoachPersona.PRESETS wirkungslos zurueck
  // ("if (!P) return;"). Ohne Deckel bleibt preset undefined, coachSetupDone
  // uebergibt an openCoachHub, deren Weiche die Einrichtung erneut startet — der
  // Nutzer kommt nur noch ueber ✕ heraus und erreicht den Hub nie.
  r = await ev(async () => {
    window.isPremium = () => true;
    closeOv('ov-coach-hub'); closeOv('ov-coach-setup');
    S.aiCoach = S.aiCoach || {}; delete S.aiCoach.preset; persist();
    openCoachHub('chat');
    const offen = document.getElementById('ov-coach-setup').classList.contains('on');
    const echt = CoachPersona.PRESETS;
    CoachPersona.PRESETS = undefined;
    let threw = null;
    try { coachSetupDone(false); } catch(e) { threw = String(e && e.message); }
    await new Promise(r2 => setTimeout(r2, 800));
    const out = { offen, threw,
      preset: S.aiCoach.preset, inTraining: S.aiCoach.inTraining, live: S.aiCoach.live,
      push: S.aiCoach.pushLevel, feedback: S.aiCoach.setFeedback,
      setupZu: !document.getElementById('ov-coach-setup').classList.contains('on'),
      hubOffen: document.getElementById('ov-coach-hub').classList.contains('on'),
      gespeichert: (() => { try { return (JSON.parse(localStorage.getItem('ft4') || '{}').aiCoach || {}).preset; } catch(_) { return null; } })() };
    CoachPersona.PRESETS = echt;
    return out;
  });
  check('Modul-Teilausfall (CoachPersona.PRESETS weg): "Fertig" legt trotzdem "balanced" fest und der Nutzer landet im Hub, keine Schleife',
    r.offen === true && r.threw === null && r.preset === 'balanced' && r.inTraining === 'key' &&
    r.live === true && r.push === 'normal' && r.feedback === true && r.gespeichert === 'balanced' &&
    r.setupZu === true && r.hubOffen === true, JSON.stringify(r));

  /* ── 12c) Hub: Scrollposition ueberlebt den Schalter, der Kachelwechsel holt
     die neue Kachel in Sicht ─────────────────────────────────────────────
     Dieselbe Zusicherung wie vor dem Umbau, uebersetzt auf das Akkordeon: ein
     SCHALTER darf die Position nicht wegwerfen (sonst nimmt der Sprung an den
     Anfang den gerade getippten Chip aus dem Bild), ein KACHELWECHSEL setzt
     nicht mehr auf 0, sondern scrollt die geoeffnete Kachel in Sicht — ein
     Inhalt, der ausserhalb des Bildes aufklappt, waere derselbe Fehler in
     anderer Richtung. */
  r = await ev(() => {
    closeOv('ov-coach-setup');
    S.aiCoach.preset = 'balanced'; persist();
    openCoachHub('scope');
    const body = document.getElementById('ch-body');
    const det = body.querySelector('#ch-card-scope details'); if (det) det.open = true;
    body.scrollTop = body.scrollHeight;          // ganz nach unten
    const vorher = Math.round(body.scrollTop);
    const chip = [...body.querySelectorAll('#ch-card-scope details .pwz-chip')]
      .find(b => b.getAttribute('onclick') === "setAiCoachOpt('inTraining','off')");
    if (!chip) return { err: 'Chip "Aus" fehlt', vorher };
    chip.click();                                 // Schalter -> Rerender
    const nachSchalter = Math.round(document.getElementById('ch-body').scrollTop);
    coachHubOpen('journal');                      // Kachelwechsel
    return { vorher, nachSchalter, offen: _chOpen,
             scrollbar: vorher > 50, level: S.aiCoach.inTraining,
             scopeZu: !document.getElementById('ch-card-scope').classList.contains('on') };
  });
  await wait(700);                                // 260 ms Aufklappen + Scroll-Nachlauf
  const nachWechsel = await ev(() => {
    const body = document.getElementById('ch-body');
    const sec  = document.getElementById('ch-card-journal');
    if (!body || !sec) return { err: 'Kachel fehlt' };
    const br = body.getBoundingClientRect(), sr = sec.getBoundingClientRect();
    return { top: Math.round(body.scrollTop),
             kopfImBild: sr.top >= br.top - 2 && sr.top < br.bottom };
  });
  check('Hub: Scrollposition ueberlebt einen Schalter (kein Sprung an den Anfang), und der Kachelwechsel holt die geoeffnete Kachel in Sicht',
    !r.err && r.scrollbar === true && r.nachSchalter === r.vorher &&
    r.offen === 'journal' && r.scopeZu === true && r.level === 'off' &&
    !nachWechsel.err && nachWechsel.kopfImBild === true,
    JSON.stringify({ r, nachWechsel }));

  // ── 13) Kaufpfad: Erfolgszweig ruft die Einrichtung, 420 ms NACH der Paywall ─
  await boot();
  r = await ev(async () => {
    window.isPremium = () => true;
    const gate = document.getElementById('auth-gate'); if (gate) gate.style.display = 'none';
    S.aiCoach = S.aiCoach || {}; delete S.aiCoach.preset; persist();
    // StoreKit gibt es im Browser nicht: Kauf, Entitlement und Profil-Sync
    // gestubbt, der Erfolgszweig von premBuy laeuft danach ECHT durch. _cap und
    // _isNative sind const-Arrows — sie lassen sich nicht ueber window
    // ersetzen, wohl aber ihre Quelle window.Capacitor.
    window.Capacitor = { isNativePlatform: () => true,
      Plugins: { PremiumPlugin: { purchase: async () => ({ active: true }) } } };
    window._premApply = () => {};
    window._syncPremiumProfile = async () => {};
    openOv('ov-paywall');
    const res = await premBuy('gt_premium_monthly');
    const t0 = Date.now();
    const spur = [];
    await new Promise(done => {
      const iv = setInterval(() => {
        spur.push({ t: Date.now() - t0,
                    pw: document.getElementById('ov-paywall').classList.contains('on'),
                    cs: document.getElementById('ov-coach-setup').classList.contains('on') });
        if (Date.now() - t0 > 1500) { clearInterval(iv); done(); }
      }, 100);
    });
    const bei = (ms) => spur.filter(s => s.t <= ms).pop() || null;
    return { aktiv: !!(res && res.active), bei800: bei(800), bei1000: bei(1000), ende: spur[spur.length - 1],
             step: _csStep, titelDa: !!document.getElementById('cst-title') };
  });
  check('Kaufpfad: Erfolgszweig schliesst die Paywall und oeffnet die Einrichtung erst danach (420 ms Versatz, keine zwei Animationen)',
    r.aktiv === true && r.bei800 && r.bei800.pw === false && r.bei800.cs === false &&
    r.bei1000 && r.bei1000.cs === false && r.ende && r.ende.cs === true && r.ende.pw === false && r.step === 1,
    JSON.stringify(r).slice(0, 900));

  // ── 14) Wirft die Einrichtung, bleibt der Kauf abgeschlossen ──────────────
  await boot();
  r = await ev(async () => {
    window.isPremium = () => true;
    S.aiCoach = S.aiCoach || {}; delete S.aiCoach.preset; persist();
    window.Capacitor = { isNativePlatform: () => true,
      Plugins: { PremiumPlugin: { purchase: async () => ({ active: true }) } } };
    window._premApply = () => { window.__applied = true; };
    window._syncPremiumProfile = async () => { window.__synced = true; };
    window.openCoachSetup = () => { throw new Error('Einrichtung geplatzt'); };
    openOv('ov-paywall');
    const res = await premBuy('gt_premium_monthly');
    await new Promise(r2 => setTimeout(r2, 1500));
    return { aktiv: !!(res && res.active), applied: window.__applied === true, synced: window.__synced === true,
             pwZu: !document.getElementById('ov-paywall').classList.contains('on'),
             csZu: !document.getElementById('ov-coach-setup').classList.contains('on') };
  });
  check('Wirft die Einrichtung, ist der Kauf trotzdem abgeschlossen und die Paywall bleibt geschlossen',
    r.aktiv === true && r.applied === true && r.synced === true && r.pwZu === true && r.csZu === true,
    JSON.stringify(r));

  // ── 15) Heute-Tab: kein zweiter Einstieg, kein fuenfter Tab ───────────────
  await boot();
  r = await ev(() => {
    window.isPremium = () => true;
    _fbUser = { uid: 'chk-uid', isAnonymous: false };
    // Frisches Profil liefert keine Empfehlung: ohne Stub bleibt die Karte leer
    // und der Check zaehlte null statt der EINEN bestehenden Karte (task-9
    // stubbt sie aus demselben Grund).
    window._coachTodaySuggestion = () => ({
      kind: 'plan', head: 'Push-Tag steht an', text: 'Zuletzt Bankdruecken 62,5 kg',
      chip: 'Dein Plan', chip2: '3 Uebungen', ringLbl: 'Bereit', pct: 72,
      cta: { label: 'Training starten', on: 'window.__ctaRan=true' } });
    try { renderCoachTodayCard(); } catch(_) {}
    const pad = document.getElementById('heute-pad');
    return {
      padKinder: [...pad.children].map(c => c.id || c.className),
      aicKarten: document.querySelectorAll('#pg-heute .aic').length,
      setupImHeute: !!document.querySelector('#pg-heute #ov-coach-setup, #pg-heute .pwz-dots'),
      setupUnterBody: document.getElementById('ov-coach-setup').parentElement === document.body,
      tabs: document.querySelectorAll('.tabbar .tab').length,
      setupTab: [...document.querySelectorAll('.tabbar .tab')].some(b =>
        /coachSetup|CoachSetup/.test((b.getAttribute('onclick') || '') + ' ' + b.textContent)),
      // ein einziger Aufrufer im Heute-Tab: der Hub. Sonst nur der Kaufpfad.
      einstiege: [...document.querySelectorAll('#pg-heute [onclick]')].filter(e =>
        /openCoachSetup/.test(e.getAttribute('onclick') || '')).length
    };
  });
  check('Heute-Tab unveraendert: keine neue Flaeche, kein fuenfter Tab, kein zweiter Einstieg in die Einrichtung',
    (r.padKinder || []).length === 2 && (r.padKinder || [])[0] === 'coach-today-card' && r.aicKarten === 1 &&
    r.setupImHeute === false && r.setupUnterBody === true && r.tabs === 5 &&
    r.setupTab === false && r.einstiege === 0, JSON.stringify(r));

  // ── 16) Kein Emoji, freier Text als Text ─────────────────────────────────
  r = await ev(() => {
    window.isPremium = () => true;
    S.aiCoach = S.aiCoach || {}; delete S.aiCoach.preset;
    // Name mit Markup: safeName() im Modul entschaerft, esc() an der Renderstelle
    // ist die zweite Sperre. Beides muss halten.
    S.aiCoach.name = '<b>Nina</b>&"';
    persist();
    openCoachHub('chat');
    const txt = [];
    let bold = 0, roh = false, feld = null;
    for (const s of [1, 2, 3]) {
      coachSetupStep(s);
      const body = document.getElementById('cst-body');
      txt.push(body.textContent);
      bold += body.querySelectorAll('b').length;
      if (body.innerHTML.indexOf('<b>Nina</b>') >= 0) roh = true;
      if (s === 1) feld = (document.getElementById('cst-name') || {}).value;
    }
    const alles = txt.join(' ') + ' ' + (document.getElementById('cst-title') || {}).textContent;
    // \\p{Extended_Pictographic} statt eines Bereichsfensters: der alte Riegel
    // deckte nur U+1F000-1FAFF + FE0F, Dingbats und Symbole rutschten durch.
    // U+2715 ✕ ist in dieser Codebasis erlaubt und bestehendes Muster der
    // .x-btn — gezielt herausgenommen, statt den Riegel aufzuweichen.
    const riegel = (t) => /\p{Extended_Pictographic}/u.test(String(t).replace(/\u2715/g, ''));
    return { emoji: riegel(alles),
             // Gegenprobe: der Riegel muss echte Piktogramme auch fangen, sonst
             // waere er still kaputt und der Check gruen aus dem falschen Grund.
             riegelFaengt: ['\u2705', '\u274C', '\u2B50', '\u{1F600}', '\u26A1'].every(riegel),
             riegelLaesstXDurch: riegel('\u2715') === false,
             bold, roh, feld,
             titel: (document.getElementById('cst-title') || {}).textContent,
             // Schritt 1 hat 4 Tonkarten-<b>, Schritt 2 drei Profil-<b>,
             // Schritt 3 zwei Erinnerungs-<b> -> 9
             erwartetBold: 9,
             text: alles.replace(/\s+/g, ' ').trim().slice(0, 300) };
  });
  check('Kein Emoji in der Einrichtung (Riegel Extended_Pictographic, ✕ ausgenommen und Riegel gegengeprueft), Name mit Markup als Text',
    r.emoji === false && r.riegelFaengt === true && r.riegelLaesstXDurch === true &&
    r.roh === false && r.bold === r.erwartetBold &&
    r.titel === 'bNina/b' && r.feld === 'bNina/b', JSON.stringify(r).slice(0, 700));

  // ── 17) Zweisprachigkeit: Schluesselbestand + englischer Durchlauf ────────
  await page.evaluate(() => localStorage.setItem('gt_lang', 'en'));
  await boot();
  r = await ev((keys) => {
    window.isPremium = () => true;
    S.aiCoach = S.aiCoach || {}; delete S.aiCoach.preset; S.aiCoach.name = ''; S.aiCoach.tone = 'sachlich';
    persist();
    // Fehlender oder unuebersetzter Schluessel = Leck. Geprueft wird der konkrete
    // Bestand in I18N_EN, nicht eine Stichprobe im gerenderten Text.
    const fehlt = keys.filter(k => { const v = I18N_EN[k]; return v === undefined || v === null || v === '' || v === k; });
    openCoachHub('chat');
    const txt = {};
    for (const s of [1, 2, 3]) { coachSetupStep(s);
      // Inhalt UND Leiste: die Leiste liegt seit dem Sticky-Fuss aussen, ihre
      // Woerter (Weiter/Zurueck/Fertig) sollen weiter mitgeprueft werden.
      txt[s] = (document.getElementById('cst-body').textContent + ' ' +
                document.getElementById('cst-nav').textContent).replace(/\s+/g, ' ').trim(); }
    coachSetupStep(1);
    const ex = [...document.querySelectorAll('#cst-body .ch-preset span')].map(s => s.textContent.trim());
    const soll = ['ruhig', 'sachlich', 'hart', 'locker'].map(t =>
      CoachPersona.say('greet', _chToneVars(), CoachPersona.personaGet({ tone: t }), 'en'));
    return { fehlt, txt, exGleich: ex.join('|') === soll.join('|'), ex, soll,
             skip: (document.querySelector('#ov-coach-setup .x-btn') || {}).getAttribute('aria-label') };
  }, SETUP_TR_KEYS);
  const deutschRest = Object.keys(r.txt || {}).filter(k => /heißen|jederzeit|Zurückhaltend|Ausgewogen|Eng dabei|Rückmeldung|Nachrichten|Weiter|Zurück|Fertig|hält sich|letzten Einheit|erinner|Erinnerung|Täglich|Trainingstagen|Erlaubnis/.test(r.txt[k]));
  check('Zweisprachig: jeder neue Schluessel liegt uebersetzt in I18N_EN, aria-label des ✕ inklusive',
    Array.isArray(r.fehlt) && r.fehlt.length === 0 && r.skip === 'Skip', JSON.stringify({ fehlt: r.fehlt, skip: r.skip }));
  check('Zweisprachig: alle drei Schritte kommen auf Englisch, kein deutscher Oberflaechentext, Tonsaetze englisch',
    deutschRest.length === 0 && r.exGleich === true &&
    /What should your coach be called\?/.test((r.txt || {})['1'] || '') &&
    /How much coach/.test((r.txt || {})['2'] || '') &&
    /remind you/i.test((r.txt || {})['3'] || '') &&
    /No reminder/.test((r.txt || {})['3'] || '') &&
    /Yes, remind me/.test((r.txt || {})['3'] || ''),
    JSON.stringify({ deutschRest, txt: r.txt, ex: r.ex, soll: r.soll }).slice(0, 1300));
  await page.evaluate(() => localStorage.removeItem('gt_lang'));
  await boot();

  // ── 18) Beleg: Screenshot der offenen Einrichtung ────────────────────────
  try {
    await ev(() => {
      window.isPremium = () => true;
      const gate = document.getElementById('auth-gate'); if (gate) gate.style.display = 'none';
      S.aiCoach = S.aiCoach || {}; delete S.aiCoach.preset; S.aiCoach.name = ''; S.aiCoach.tone = 'sachlich';
      persist();
      openCoachHub('chat');
    });
    await wait(700);
    await page.screenshot({ path: SHOT });
    const sichtbar = await ev(() => ({
      on: document.getElementById('ov-coach-setup').classList.contains('on'),
      karten: document.querySelectorAll('#cst-body .ch-preset').length,
      dots: document.querySelectorAll('#cst-dots .pwz-dot').length
    }));
    check('Screenshot der offenen Einrichtung geschrieben (Schritt 1 sichtbar)',
      fs.existsSync(SHOT) && fs.statSync(SHOT).size > 5000 && sichtbar.on === true &&
      sichtbar.karten === 4 && sichtbar.dots === 3, SHOT + ' ' + JSON.stringify(sichtbar));
  } catch (e) { check('Screenshot der offenen Einrichtung geschrieben', false, String(e.message)); }

  // ── 20) Important 1: der live-Rundlauf aus/ein ist verlustfrei ───────────
  // Nachgefahren: Profil "Eng dabei" -> in den Premium-Einstellungen "Live-Coach
  // im Training" aus -> wieder ein. Vorher endete das bei
  // {preset:'custom', inTraining:'key', pushLevel:'eng'} - zwei Tipps auf einem
  // fremden Bildschirm degradierten das Profil auf einen Mischzustand, den kein
  // Profil beschreibt.
  r = await ev(() => {
    const aus = [];
    const lese = () => ({ preset: S.aiCoach.preset, inTraining: S.aiCoach.inTraining,
      setFeedback: S.aiCoach.setFeedback, pushLevel: S.aiCoach.pushLevel, live: S.aiCoach.live });
    const out = {};
    for (const p of ['quiet', 'balanced', 'close']) {
      setCoachPreset(p);
      const vorher = lese();
      setAiCoachOpt('live', false);
      const dazwischen = lese();
      setAiCoachOpt('live', true);
      const nachher = lese();
      aus.push({ p, vorher, dazwischen, nachher,
                 gleich: JSON.stringify(vorher) === JSON.stringify(nachher) });
    }
    out.profile = aus;
    // Auch aus 'custom' heraus: eigene Mischung, aus/ein, alles zurueck.
    setCoachPreset('close');
    setAiCoachOpt('pushLevel', 'still');
    const cVor = lese();
    setAiCoachOpt('live', false);
    setAiCoachOpt('live', true);
    const cNach = lese();
    out.custom = { vorher: cVor, nachher: cNach,
                   gleich: JSON.stringify(cVor) === JSON.stringify(cNach) };
    return out;
  });
  // 'quiet' hat den Schalter von Haus aus AUS. Ein Tipp auf "aus" ist dort kein
  // Zustandswechsel, und der Tipp auf "ein" IST eine Entscheidung des Nutzers —
  // exakte Gleichheit waere hier die falsche Forderung (die Invariante verbietet
  // live:true bei Stufe 'off'). Gefordert ist stattdessen: kein Kollateralschaden,
  // setFeedback und pushLevel bleiben unangetastet.
  const q = (r.profile || [])[0] || {};
  const quietOk = q.p === 'quiet' &&
    q.nachher && q.nachher.setFeedback === q.vorher.setFeedback &&
    q.nachher.pushLevel === q.vorher.pushLevel &&
    q.nachher.inTraining !== 'off' && q.nachher.live === true;
  check('Important 1: der Rundlauf "Live-Coach aus/ein" ist verlustfrei — Profil, Stufe, Rueckmeldung und Nachrichten kommen exakt zurueck',
    Array.isArray(r.profile) && r.profile.length === 3 && quietOk &&
    r.profile.slice(1).every(x => x.gleich === true && x.dazwischen.inTraining === 'off' &&
                                  x.dazwischen.live === false) &&
    r.profile[2].vorher.inTraining === 'full' && r.profile[2].vorher.preset === 'close' &&
    r.profile[2].nachher.preset === 'close' && r.profile[2].nachher.pushLevel === 'eng' &&
    r.profile[1].nachher.preset === 'balanced' &&
    r.custom && r.custom.gleich === true && r.custom.nachher.preset === 'custom' &&
    r.custom.nachher.pushLevel === 'still' && r.custom.nachher.inTraining === 'full',
    JSON.stringify(r).slice(0, 1600));

  // ── 21) Die Invariante, jede Richtung einzeln ────────────────────────────
  r = await ev(() => {
    const out = {};
    setCoachPreset('balanced');
    setAiCoachOpt('inTraining', 'off');
    out.a = { inTraining: S.aiCoach.inTraining, live: S.aiCoach.live };
    setAiCoachOpt('inTraining', 'full');
    out.b = { inTraining: S.aiCoach.inTraining, live: S.aiCoach.live };
    setAiCoachOpt('live', false);
    out.c = { inTraining: S.aiCoach.inTraining, live: S.aiCoach.live };
    setAiCoachOpt('live', true);
    out.d = { inTraining: S.aiCoach.inTraining, live: S.aiCoach.live };
    // aus 'off' heraus einschalten, ohne dass vorher etwas gemerkt wurde:
    // die Stufe darf nicht 'off' bleiben, sonst widerspraeche sie live===true
    S.aiCoach.inTraining = 'off'; S.aiCoach.live = false; persist();
    setAiCoachOpt('live', true);
    out.e = { inTraining: S.aiCoach.inTraining, live: S.aiCoach.live };
    return out;
  });
  check('Invariante live !== false ⟺ inTraining !== "off" haelt in beide Richtungen, auch ohne gemerkte Stufe',
    r.a && r.a.inTraining === 'off' && r.a.live === false &&
    r.b && r.b.inTraining === 'full' && r.b.live === true &&
    r.c && r.c.inTraining === 'off' && r.c.live === false &&
    r.d && r.d.inTraining === 'full' && r.d.live === true &&
    r.e && r.e.inTraining !== 'off' && r.e.live === true, JSON.stringify(r));

  // ── 22) Important 2: setFeedback schaltet die Rueckmeldung wirklich ab ───
  r = await ev(() => {
    // Minimale Trainingslage: eine Uebung, ein erledigter Arbeitssatz.
    // exById ist eine const-Arrow ueber S.exercises und nicht stubbar - also eine
    // ECHTE Uebung in den Bestand. wkLogs ist ein top-level `let` und liegt nicht
    // auf window: eine Zuweisung an window.wkLogs waere wirkungslos gewesen und
    // der Check leer gruen (frueherer Lauf: an=0, aus=0).
    if (!(S.exercises || []).length) {
      S.exercises = [{ id: 'chk-ex', name: 'Bankdruecken', muscle: 'chest', targetType: 'reps' }];
    }
    const ex = S.exercises[0];
    // ZWEI Saetze, nur der erste erledigt: so laeuft der Zweig ohne
    // _coachVolDelta und ohne Netzpfad - geprueft wird die Wache, nicht der Satz.
    wkLogs.length = 0;
    wkLogs.push({ exerciseId: ex.id, sets: [
      { w: 60, r: 8, done: true, type: 'normal' }, { w: 60, r: 8, type: 'normal' }] });
    const gesagt = [];
    const echt = window._coachBarSet;
    window._coachBarSet = (mode, msg) => { gesagt.push(mode + ':' + String(msg).slice(0, 60)); };
    window.isPremium = () => true;
    setCoachPreset('balanced');                 // inTraining 'key', setFeedback true
    setAiCoachOpt('setFeedback', true);
    gesagt.length = 0;
    try { _coachMicroReact(0, 0); } catch(e) { return { err: 'an: ' + e.message }; }
    const an = gesagt.length;
    setAiCoachOpt('setFeedback', false);
    gesagt.length = 0;
    try { _coachMicroReact(0, 0); } catch(e) { return { err: 'aus: ' + e.message }; }
    const aus = gesagt.length;
    setAiCoachOpt('setFeedback', true);
    gesagt.length = 0;
    try { _coachMicroReact(0, 0); } catch(e) { return { err: 'wieder an: ' + e.message }; }
    const wiederAn = gesagt.length;
    // Gegenprobe: die Stufe 'off' schweigt weiter unabhaengig von setFeedback
    setAiCoachOpt('inTraining', 'off');
    gesagt.length = 0;
    try { _coachMicroReact(0, 0); } catch(_) {}
    const stufeAus = gesagt.length;
    window._coachBarSet = echt;
    setCoachPreset('balanced');
    return { an, aus, wiederAn, stufeAus };
  });
  check('Important 2: "Rueckmeldung nach dem Satz" aus laesst _coachMicroReact schweigen, ein laesst ihn wieder reden',
    !r.err && r.an === 1 && r.aus === 0 && r.wiederAn === 1 && r.stufeAus === 0, JSON.stringify(r));

  // ── 23) Triage 1: keine erfundenen Zahlen auf der Vertrauensflaeche ──────
  r = await ev(() => {
    const out = {};
    S.aiCoach.preset = 'balanced'; S.aiCoach.tone = 'sachlich';
    // a) ohne Trainingsverlauf: die zweite Beispielzeile entfaellt GANZ
    const echtSess = S.sessions;
    S.sessions = [];
    persist();
    openCoachHub('persona');
    out.ohneVerlauf = !!document.getElementById('ch-tone-ex');
    // Gemessen wird die Kachel "Persönlichkeit": seit dem Umbau stehen alle
    // fuenf gleichzeitig im DOM, und die Wochen-Kachel nennt eigene Zahlen.
    out.ohneText = (document.getElementById('ch-card-persona').textContent.match(/4\.?200|104 ?(Prozent|percent|%)/) || [null])[0];
    // b) mit echtem Verlauf: die Zeile zeigt die ECHTEN Werte der letzten Einheit
    const ex = (S.exercises || [])[0];
    S.sessions = [{ date: '2026-07-28', logs: [{ exerciseId: ex ? ex.id : 'x',
      sets: [{ w: 50, r: 10, type: 'normal' }, { w: 50, r: 10, type: 'normal' }] }] }];
    persist();
    openCoachHub('persona');
    const el = document.getElementById('ch-tone-ex');
    out.mitVerlauf = !!el;
    out.text = el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
    // 2 Saetze x 50 kg x 10 Wdh = 1000 kg Gesamtvolumen
    out.echteZahlen = !!(out.text && /1\.?000/.test(out.text) && /\b2\b/.test(out.text));
    out.erfunden = !!(out.text && /4\.?200|104/.test(out.text));
    S.sessions = echtSess; persist();
    return out;
  });
  check('Triage 1: die zweite Beispielzeile traegt echte Zahlen der letzten Einheit und entfaellt ohne Verlauf — nirgends erfundene 4.200 kg / 104 %',
    r.ohneVerlauf === false && (r.ohneText === null || r.ohneText === undefined) &&
    r.mitVerlauf === true && r.echteZahlen === true && r.erfunden === false,
    JSON.stringify(r).slice(0, 700));

  // ── 24) Triage 2: Journal sagt, dass ein Konto fehlt ────────────────────
  r = await ev(() => {
    const echt = _fbUser;
    _fbUser = null;                              // kein Konto
    openCoachHub('journal');
    const ohne = document.getElementById('ch-card-journal').textContent.replace(/\s+/g, ' ').trim();
    _fbUser = { uid: 'chk-uid', isAnonymous: false };
    openCoachHub('journal');
    const mit = document.getElementById('ch-card-journal').textContent.replace(/\s+/g, ' ').trim();
    _fbUser = echt || { uid: 'chk-uid', isAnonymous: false };
    return { ohne: ohne.slice(0, 400), mit: mit.slice(0, 300),
             hinweisOhne: /Konto|account/i.test(ohne), hinweisMit: /Konto|account/i.test(mit),
             leer: (ohne.match(/Noch nichts notiert/g) || []).length };
  });
  check('Triage 2: ohne Konto sagt das Journal, dass es ein Konto braucht — mit Konto steht der Hinweis nicht da',
    r.hinweisOhne === true && r.hinweisMit === false, JSON.stringify(r).slice(0, 700));

  // ── 25) Triage 3: die Karte ist per Tastatur erreichbar, ohne Button-in-Button ──
  // role="button" sass frueher auf der GANZEN Karte (.aic) — die aber den echten
  // "Training starten"-Knopf (.aic-go) enthaelt, also Button in Button (ungueltiges
  // ARIA). Jetzt traegt NUR der Kopfbereich (.aic-top) role/tabindex/aria-label,
  // der CTA-Knopf liegt als Geschwister in .aic-btns ausserhalb dieses Teilbaums.
  await ev(() => {
    // Defensiv beide Overlays zu: der Emoji- und der Screenshot-Check weiter
    // oben loesen ueber die fehlende preset-Weiche openCoachSetup() aus und
    // schliessen es nicht wieder — ein liegen gebliebenes ov-coach-setup legt
    // sich sonst als Sheet ueber den Heute-Tab und faengt den CTA-Tipp ab.
    closeOv('ov-coach-hub');
    closeOv('ov-coach-setup');
    window.isPremium = () => true;
    _fbUser = { uid: 'chk-uid', isAnonymous: false };
    window.__ctaRan = false;
    window._coachTodaySuggestion = () => ({
      kind: 'plan', head: 'Push-Tag steht an', text: 'Zuletzt Bankdruecken 62,5 kg',
      chip: 'Dein Plan', chip2: '3 Uebungen', ringLbl: 'Bereit', pct: 72,
      cta: { label: 'Training starten', on: 'window.__ctaRan=true' } });
    S.aiCoach.preset = 'balanced'; persist();
    renderCoachTodayCard();
  });
  const kbAttr = await ev(() => {
    const card = document.querySelector('#coach-today-card .aic');
    const top = card ? card.querySelector('.aic-top') : null;
    const cta = card ? card.querySelector('.aic-go') : null;
    return (card && top && cta) ? {
      cardRole: card.getAttribute('role'), cardTab: card.getAttribute('tabindex'),
      topRole: top.getAttribute('role'), topTab: top.getAttribute('tabindex'),
      topLabel: top.getAttribute('aria-label'), fokussierbar: typeof top.focus === 'function',
      // Der CTA-Knopf darf in KEINEM role="button"-Teilbaum stecken (Button in Button).
      ctaInButtonRolle: !!cta.closest('[role="button"]'),
      ctaIstInTop: top.contains(cta)
    } : { err: 'Karte/Kopf/CTA fehlt' };
  });
  let kbEnter = null, kbSpace = null;
  try {
    await ev(() => { const t = document.querySelector('#coach-today-card .aic .aic-top'); if (t) t.focus(); });
    await page.keyboard.press('Enter');
    kbEnter = await ev(() => {
      const o = document.getElementById('ov-coach-hub').classList.contains('on');
      closeOv('ov-coach-hub');
      const t = document.querySelector('#coach-today-card .aic .aic-top'); if (t) t.focus();
      return o;
    });
    await page.keyboard.press('Space');
    kbSpace = await ev(() => {
      const o = document.getElementById('ov-coach-hub').classList.contains('on');
      closeOv('ov-coach-hub');
      return o;
    });
  } catch (e) { kbEnter = 'Fehler: ' + e.message; }
  // Echter Tipp auf den CTA (ElementHandle.click(), kein synthetisches .click()
  // aus dem Seitenkontext — genau daran ist in Task 9 ein echter Fehler durch
  // die Suite gerutscht): muss das Training starten, nicht den Hub oeffnen.
  let ctaTipp = 'kein .aic-go gefunden';
  for (const h of await page.$$('#coach-today-card .aic-go')) {
    await h.evaluate(e => e.scrollIntoView({ block: 'center' }));
    await wait(70);
    await h.click();
    ctaTipp = true;
    break;
  }
  const nachCtaTipp = await ev(() => ({
    ctaRan: window.__ctaRan === true,
    hubOffen: document.getElementById('ov-coach-hub').classList.contains('on')
  }));
  check('Triage 3: der Kopfbereich (.aic-top) traegt role=button und tabindex=0 und oeffnet den Hub per Enter und Leertaste; der CTA-Knopf steckt in keinem role=button-Teilbaum und ein echter Tipp darauf startet das Training statt den Hub',
    kbAttr.cardRole === null && kbAttr.cardTab === null &&
    kbAttr.topRole === 'button' && kbAttr.topTab === '0' && typeof kbAttr.topLabel === 'string' && kbAttr.topLabel.length > 0 &&
    kbAttr.ctaInButtonRolle === false && kbAttr.ctaIstInTop === false &&
    kbEnter === true && kbSpace === true &&
    ctaTipp === true && nachCtaTipp.ctaRan === true && nachCtaTipp.hubOffen === false,
    JSON.stringify({ kbAttr, kbEnter, kbSpace, ctaTipp, nachCtaTipp }));

  /* ── 26) Triage 4: kein zweites Bedienidiom im Blatt ─────────────────────
     Gestaltungsregel 7: dieselbe Bedienabsicht ("eins von N") muss in der App
     gleich aussehen. Der Verstoss war das Segmented Control (.ch-tabs/.ch-tab),
     das sonst NIRGENDS vorkam und im selben Sheet gegen die .pwz-chip-Reihe der
     Feinjustierung stand. Mit dem Hub-Umbau entfaellt es ersatzlos — die
     Zusicherung wandert deshalb mit: es darf weder wiederkommen, noch darf die
     Kachel, die an seine Stelle tritt, eine eigene Optik mitbringen. Verglichen
     wird die Kachelflaeche gegen die .ch-jrn-Zeile im SELBEN Sheet (Rahmen und
     Fuellung) und gegen die .ch-preset-Karte (Radius). */
  await ev(() => {
    S.aiCoach.preset = 'balanced'; persist();
    closeOv('ov-coach-setup');
    openCoachHub('scope');
    const det = document.querySelector('#ch-card-scope details'); if (det) det.open = true;
  });
  await wait(320);
  r = await ev(() => {
    const karte  = document.querySelector('#ch-body .ch-card');
    const preset = document.querySelector('#ch-body .ch-preset');
    if (!karte || !preset) return { err: 'Kachel oder Karte fehlt' };
    /* Die Glaszeile als PROBE: ob gerade ein Dossier-Eintrag oder ein Bericht
       im Blatt steht, haengt am Lauf — die Regel .ch-jrn haengt es nicht. Eine
       leere Probe misst genau diese Regel, und nur sie ist der Vergleichspunkt
       ("kein eigenes Aussehen, dieselben Bausteine wie die bestehende Zeile").
       .ghost bleibt draussen: das ist der GEDAEMPFTE Zustand derselben Zeile. */
    const probe = document.createElement('div');
    probe.className = 'ch-jrn';
    document.getElementById('ch-body').appendChild(probe);
    const cs = (el) => { const c = getComputedStyle(el);
      return { bg: c.backgroundColor, bgImg: c.backgroundImage, bw: c.borderTopWidth,
               bs: c.borderTopStyle, bc: c.borderTopColor, br: c.borderTopRightRadius }; };
    const k = cs(karte), j = cs(probe), p = cs(preset);
    probe.remove();
    return {
      karte: k, jrnProbe: j, preset: p,
      // Rahmen und Fuellung wie die bestehende Glaszeile, Radius wie die
      // bestehende Karte — nichts Neues, nur groesser gefasst.
      rahmenGleich: k.bw === j.bw && k.bs === j.bs && k.bc === j.bc && k.bg === j.bg,
      radiusGleich: k.br === p.br,
      // Und das Segmented Control ist weg: keine Klasse, kein Traeger, kein
      // Element mit role=tab irgendwo im Blatt.
      traeger: document.querySelectorAll('#ov-coach-hub .ch-tabs, #ov-coach-hub .ch-tab').length,
      rollen: document.querySelectorAll('#ov-coach-hub [role=tab], #ov-coach-hub [role=tablist], #ov-coach-hub [role=tabpanel]').length,
      kacheln: document.querySelectorAll('#ch-body .ch-card').length,
      // Die Chip-Reihe der Feinjustierung steht unveraendert daneben.
      chips: document.querySelectorAll('#ch-card-scope .pwz-chip').length
    };
  });
  check('Triage 4: das Segmented Control ist ersatzlos weg (keine .ch-tabs/.ch-tab, keine tab-Rollen) und die Kachel bringt keine eigene Optik mit — Rahmen und Fuellung wie die .ch-jrn-Zeile, Radius wie die .ch-preset-Karte im selben Sheet',
    !r.err && r.traeger === 0 && r.rollen === 0 && r.kacheln === 5 && r.chips > 0 &&
    r.rahmenGleich === true && r.radiusGleich === true,
    JSON.stringify(r).slice(0, 1100));

  // ── 27) Triage 6: setAiCoachOpt/setCoachPreset ueberleben ein Wurf-persist ─
  r = await ev(() => {
    // persist ist ein top-level `let` und liegt NICHT auf window - eine Zuweisung
    // an window.persist ersetzt es nicht und der Check waere leer gruen. Statt
    // dessen die Quelle: localStorage.setItem, das persist() als erstes ruft.
    const echtSet = localStorage.setItem.bind(localStorage);
    let gerendert = 0;
    const echtRender = window._coachOptRender;
    window._coachOptRender = () => { gerendert++; };
    localStorage.setItem = () => { throw new Error('Speicherquote voll'); };
    let w1 = null, w2 = null;
    try { setAiCoachOpt('tone', 'hart'); } catch(e) { w1 = String(e.message); }
    const nachOpt = { tone: S.aiCoach.tone, gerendert };
    try { setCoachPreset('quiet'); } catch(e) { w2 = String(e.message); }
    const nachPreset = { preset: S.aiCoach.preset, gerendert };
    localStorage.setItem = echtSet; window._coachOptRender = echtRender;
    setCoachPreset('balanced'); setAiCoachOpt('tone', 'sachlich');
    return { w1, w2, nachOpt, nachPreset };
  });
  check('Triage 6: wirft persist(), propagiert der Fehler NICHT aus dem onclick-Handler und _coachOptRender laeuft trotzdem',
    r.w1 === null && r.w2 === null && r.nachOpt && r.nachOpt.tone === 'hart' &&
    r.nachOpt.gerendert >= 1 && r.nachPreset && r.nachPreset.preset === 'quiet' &&
    r.nachPreset.gerendert >= 2, JSON.stringify(r));

  // ── 28) Triage 7: die Einrichtung verdraengt kein laufendes Training ─────
  await boot();
  r = await ev(async () => {
    window.isPremium = () => true;
    const gate = document.getElementById('auth-gate'); if (gate) gate.style.display = 'none';
    S.aiCoach = S.aiCoach || {}; delete S.aiCoach.preset; persist();
    window.isWorkoutActive = () => true;                 // Einheit laeuft
    window.Capacitor = { isNativePlatform: () => true,
      Plugins: { PremiumPlugin: { purchase: async () => ({ active: true }) } } };
    window._premApply = () => {};
    window._syncPremiumProfile = async () => {};
    openOv('ov-paywall');
    const res = await premBuy('gt_premium_monthly');
    await new Promise(r2 => setTimeout(r2, 1600));
    const out = {
      aktiv: !!(res && res.active),
      csZu: !document.getElementById('ov-coach-setup').classList.contains('on'),
      pwZu: !document.getElementById('ov-paywall').classList.contains('on'),
      presetOffen: S.aiCoach.preset === undefined
    };
    // Und der Hub holt sie danach nach, sobald kein Training mehr laeuft.
    window.isWorkoutActive = () => false;
    openCoachHub('chat');
    out.spaeterNachgeholt = document.getElementById('ov-coach-setup').classList.contains('on');
    return out;
  });
  check('Triage 7: Kauf im laufenden Training schiebt kein Overlay ueber die Einheit — preset bleibt offen und der Hub holt die Einrichtung danach nach',
    r.aktiv === true && r.csZu === true && r.pwZu === true && r.presetOffen === true &&
    r.spaeterNachgeholt === true, JSON.stringify(r));

  // ── 19) Die primaere Aktion jedes Schritts liegt OHNE Scrollen im Bild ───
  // Der Check, der Critical 1 haette fangen muessen: bei 390x844 stand "Weiter"
  // 35 px unter dem Rand, sichtbar waren nur Name, die vier Toene und das ✕ —
  // wer vorwaerts will, findet nur das ✕, und das setzt 'balanced'. Gemessen
  // wird OHNE vorheriges Scrollen (sheet.scrollTop muss 0 sein) und zusaetzlich
  // bei 375x667, dem haerteren Fall.
  const NAV_MASSE = {};
  for (const vp of [{ w: 390, h: 844 }, { w: 375, h: 667 }]) {
    await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 2 });
    await boot();
    const key = vp.w + 'x' + vp.h;
    await ev(() => {
      window.isPremium = () => true;
      const gate = document.getElementById('auth-gate'); if (gate) gate.style.display = 'none';
      S.aiCoach = S.aiCoach || {}; delete S.aiCoach.preset;
      S.aiCoach.name = ''; S.aiCoach.tone = 'sachlich'; persist();
      openCoachHub('chat');
    });
    // Die Einblendung (animation:up .28s) muss durch sein, sonst misst der Check
    // die Zwischenstellung des Sheets statt seiner Ruhelage.
    await wait(600);
    const mess = {};
    for (const st of [1, 2, 3]) {
      mess[st] = await ev((stp) => {
        coachSetupStep(stp);
        const sheet = document.querySelector('#ov-coach-setup .sheet');
        const prim = document.querySelector('#ov-coach-setup .pwz-nav .btn-acc');
        const nav = document.querySelector('#ov-coach-setup .pwz-nav');
        if (!prim || !sheet) return { err: 'primaere Aktion fehlt' };
        const rb = prim.getBoundingClientRect();
        const rn = nav.getBoundingClientRect();
        const cx = Math.round(rb.left + rb.width / 2), cy = Math.round(rb.top + rb.height / 2);
        const hit = document.elementFromPoint(cx, cy);
        return {
          label: prim.textContent.trim(),
          inhalt: sheet.scrollHeight, sicht: sheet.clientHeight, scroll: Math.round(sheet.scrollTop),
          oben: Math.round(rb.top), unten: Math.round(rb.bottom), hoehe: Math.round(rb.height),
          navUnten: Math.round(rn.bottom), vh: window.innerHeight,
          ganzImBild: rb.top >= 0 && rb.bottom <= window.innerHeight + 0.5 && rb.height >= 40,
          trefferIstAktion: !!(hit && prim.contains(hit))
        };
      }, st);
    }
    NAV_MASSE[key] = mess;
    check('Primaere Aktion ALLER DREI Schritte liegt ohne Scrollen vollstaendig im Bild und ist tippbar (' + key + ')',
      [1, 2, 3].every(st => mess[st] && mess[st].ganzImBild === true &&
                         mess[st].trefferIstAktion === true && mess[st].scroll === 0),
      JSON.stringify(mess));
  }
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

  // ── 29) Migration bestehender Profile (index.html: Invariante beim Start) ─
  // Der eine Pfad, der beim Update ueber die Daten JEDES bestehenden Nutzers
  // laeuft - und den die Skripte bisher nicht erreichten, weil sie mit frischem
  // Profil booten. Geseedet wird VOR dem Laden der Seite.
  const MIGR = [
    { name: 'Bestandsnutzer hatte den Live-Coach aus', seed: { live:false, insights:true },
      soll: { inTraining:'off', live:false } },
    { name: 'Bestandsnutzer hatte ihn an', seed: { live:true, insights:true },
      soll: { inTraining:'key', live:true } },
    { name: 'widerspruechlich: live true, Stufe off', seed: { live:true, inTraining:'off' },
      soll: { inTraining:'off', live:false } },
    { name: 'widerspruechlich: live false, Stufe full', seed: { live:false, inTraining:'full' },
      soll: { inTraining:'off', live:false } },
    { name: 'ungueltige Werte werden normalisiert',
      seed: { live:true, inTraining:'laut', pushLevel:'dauernd', tone:42, name:'<b>X</b>' },
      soll: { inTraining:'key', live:true } }
  ];
  for (const m of MIGR) {
    await page.evaluateOnNewDocument((raw) => {
      try { localStorage.setItem('ft4', raw); } catch(_) {}
    }, JSON.stringify({ exercises: [], sessions: [], aiCoach: m.seed }));
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 60000 });
    await wait(1200);
    const got = await ev(() => ({
      aiCoach: JSON.parse(JSON.stringify(S.aiCoach)),
      persona: JSON.parse(JSON.stringify(_persona())),
      // Die Invariante muss nach dem Start in BEIDE Richtungen stimmen
      konsistent: (S.aiCoach.live !== false) === (S.aiCoach.inTraining !== 'off')
    }));
    const a = got.aiCoach || {}, p = got.persona || {};
    const okBasis = a.inTraining === m.soll.inTraining && a.live === m.soll.live &&
                    got.konsistent === true;
    // Beim ungueltigen Stand wird auch S.aiCoach selbst normalisiert (sonst liest
    // jeder, der die Felder direkt anfasst, 'laut'/'dauernd'). Name und preset
    // bleiben absichtlich roh: safeName('') waere 'Coach' - ein Name, den der
    // Nutzer nie gewaehlt hat - und ein ungueltiges preset soll die Einrichtung
    // ausloesen, nicht stillschweigend zu einem Profil werden.
    const okNorm = m.name.indexOf('ungueltige') < 0 ? true :
      (a.inTraining === 'key' && a.pushLevel === 'normal' && a.tone === 'sachlich' &&
       a.name === '<b>X</b>' && p.name === 'bX/b' && p.tone === 'sachlich');
    check('Migration: ' + m.name + ' ⇒ inTraining "' + m.soll.inTraining + '", live ' + m.soll.live + ', Invariante konsistent',
      okBasis && okNorm, JSON.stringify(got).slice(0, 700));
  }

  // ── 31) Die Erinnerung in der Einrichtung: Zustimmung, Ablehnung, kein Premium ─
  // Eigene Seite mit einem Capacitor-Doppel. Ohne das laeuft _cnPermission() in
  // den Web-Zweig (kein Plugin ⇒ true) und die eine Sache, die hier wirklich
  // zaehlt, waere gar nicht messbar: WIE OFT der Systemdialog kommt. iOS zeigt
  // ihn EINMAL pro Installation, eine Ablehnung ist dauerhaft — deshalb wird
  // jeder requestPermissions()-Aufruf gezaehlt.
  const LN_STUB = () => {
    window.__ln = { reqs: 0, checks: 0, perm: 'prompt', antwort: 'granted',
                    schedule: [], cancel: [], channels: [] };
    window.__lnPending = [];
    const LN = {
      checkPermissions: async () => { window.__ln.checks++; return { display: window.__ln.perm }; },
      requestPermissions: async () => {
        window.__ln.reqs++; window.__ln.perm = window.__ln.antwort;
        return { display: window.__ln.perm };
      },
      createChannel: async (c) => { window.__ln.channels.push(c); },
      getPending: async () => ({ notifications: window.__lnPending.map(n => Object.assign({}, n)) }),
      schedule: async (o) => {
        window.__ln.schedule.push(o);
        ((o && o.notifications) || []).forEach(n => window.__lnPending.push(Object.assign({}, n)));
        return { notifications: (o && o.notifications) || [] };
      },
      cancel: async (o) => {
        window.__ln.cancel.push(o);
        ((o && o.notifications) || []).forEach(n => {
          window.__lnPending = window.__lnPending.filter(x => Number(x.id) !== Number(n.id));
        });
      }
    };
    window.Capacitor = { isNativePlatform: () => true, Plugins: { LocalNotifications: LN } };
  };
  const p2 = await browser.newPage();
  await p2.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const fehler2 = [];
  p2.on('pageerror', e => fehler2.push('pageerror: ' + e.message));
  p2.on('console', m => { if (m.type() === 'error') fehler2.push('console.error: ' + m.text().slice(0, 200)); });
  await p2.evaluateOnNewDocument(LN_STUB);
  const ev2 = async (fn, arg) => {
    try { return (arg === undefined) ? await p2.evaluate(fn) : await p2.evaluate(fn, arg); }
    catch (e) { return { __err: String((e && e.message) || e).slice(0, 200) }; }
  };
  const tap2 = async (sel, onclick) => {
    try {
      for (const h of await p2.$$(sel)) {
        const oc = await h.evaluate(e => e.getAttribute('onclick'));
        if (oc !== onclick) continue;
        await h.evaluate(e => e.scrollIntoView({ block: 'center' }));
        await wait(70);
        await h.click();
        return true;
      }
      return 'kein Element mit onclick=' + onclick;
    } catch (e) { return 'Tipp geplatzt (' + onclick + '): ' + String(e.message).slice(0, 120); }
  };
  // premium=false fuehrt die Einrichtung ueber openCoachSetup() direkt vor: der
  // Hub-Weg ist premium-verriegelt, der Riegel gegen den Systemdialog sitzt aber
  // in _cnPermission() selbst und muss auch dann halten, wenn die Flaeche offen ist.
  const boot2 = async (premium) => {
    await p2.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 60000 });
    await wait(1500);
    await ev2((prem) => {
      window.isPremium = () => prem;
      const gate = document.getElementById('auth-gate'); if (gate) gate.style.display = 'none';
      S.exercises = [{ id:'chk-ex', name:'Bankdruecken', muscleGroup:'brust',
                       targetSets:3, targetReps:8, targetType:'reps' }];
      S.weekPlan.mon = { type:'exercises', exIds:['chk-ex'] };
      S.notifEnabled = false;
      S.aiCoach = S.aiCoach || {}; delete S.aiCoach.preset;
      S.aiCoach.name = 'Nina'; S.aiCoach.tone = 'sachlich';
      persist();
      openCoachSetup();
      coachSetupStep(3);
      // Der Sync beim App-Start hat checkPermissions() schon angefasst; gezaehlt
      // werden soll NUR, was die Einrichtung ausloest.
      window.__ln.reqs = 0; window.__ln.checks = 0;
    }, premium);
    await wait(300);
  };
  const lage2 = () => ev2(() => ({
    notif: S.notifEnabled,
    reqs: window.__ln.reqs,
    perm: window.__ln.perm,
    permOk: !!(S.coachPush && S.coachPush.permOk),
    step: _csStep,
    on: [...document.querySelectorAll('#cst-body .ch-preset')]
          .filter(b => b.classList.contains('on')).map(b => b.getAttribute('onclick')).join(','),
    toastAn: !!(document.getElementById('update-toast') || {}).classList &&
             document.getElementById('update-toast').classList.contains('show'),
    toast: (document.getElementById('update-toast') || {}).textContent || '',
    gespeichert: (() => { try { return JSON.parse(localStorage.getItem('ft4') || '{}').notifEnabled; } catch(_) { return 'lesefehler'; } })(),
    setupOffen: document.getElementById('ov-coach-setup').classList.contains('on'),
    fertig: !![...document.querySelectorAll('#cst-nav .btn')].find(b => b.getAttribute('onclick') === 'coachSetupDone(false)')
  }));

  // a) Zustimmung mit Premium: Schalter an, Dialog GENAU EINMAL
  await boot2(true);
  const jaTipp = await tap2('#cst-body .ch-preset', 'coachSetupReminder(true)');
  await wait(600);
  const nachJa = await lage2();
  // Zweiter Tipp auf dieselbe Karte: die Berechtigung steht schon, also darf
  // kein zweiter Systemdialog kommen.
  const jaNochmal = await tap2('#cst-body .ch-preset', 'coachSetupReminder(true)');
  await wait(600);
  const nachJa2 = await lage2();
  check('Zustimmung in der Einrichtung: S.notifEnabled wird gesetzt und ueberlebt persist(), die Berechtigung wird GENAU EINMAL erfragt (auch beim zweiten Tipp kein zweiter Systemdialog), die Karte "Ja, erinnere mich" ist markiert',
    jaTipp === true && jaNochmal === true &&
    nachJa.notif === true && nachJa.gespeichert === true && nachJa.reqs === 1 &&
    nachJa.on === 'coachSetupReminder(true)' && nachJa.setupOffen === true && nachJa.step === 3 &&
    nachJa2.reqs === 1 && nachJa2.notif === true,
    JSON.stringify({ jaTipp, jaNochmal, nachJa, nachJa2 }).slice(0, 900));

  // b) Ablehnung: sauberer Zustand, ruhiger Hinweis, KEIN Fehler
  await boot2(true);
  await ev2(() => { window.__ln.antwort = 'denied'; });
  const neinTipp = await tap2('#cst-body .ch-preset', 'coachSetupReminder(true)');
  await wait(600);
  const nachNein = await lage2();
  const fertigNachNein = await tap2('#cst-nav .btn', 'coachSetupDone(false)');
  await wait(700);
  const endeNachNein = await ev2(() => ({
    setupZu: !document.getElementById('ov-coach-setup').classList.contains('on'),
    hubOffen: document.getElementById('ov-coach-hub').classList.contains('on'),
    preset: S.aiCoach.preset, notif: S.notifEnabled
  }));
  check('Ablehnung in der Einrichtung: Berechtigung einmal erfragt, S.notifEnabled bleibt aus (auch auf der Platte), die Karte springt auf "Nicht erinnern" zurueck, ruhiger Hinweis ueber _dndToast statt Fehler — und "Fertig" fuehrt danach normal weiter',
    neinTipp === true && nachNein.reqs === 1 && nachNein.notif === false &&
    nachNein.gespeichert !== true && nachNein.on === 'coachSetupReminder(false)' &&
    nachNein.toastAn === true && /Mitteilungen|notifications/i.test(nachNein.toast) &&
    nachNein.setupOffen === true && nachNein.step === 3 && nachNein.fertig === true &&
    fertigNachNein === true && endeNachNein.setupZu === true && endeNachNein.hubOffen === true &&
    endeNachNein.preset === 'balanced' && endeNachNein.notif === false,
    JSON.stringify({ neinTipp, nachNein, fertigNachNein, endeNachNein }).slice(0, 1000));

  // c) Ohne Premium wird der einmalige Systemdialog NICHT verbrannt
  await boot2(false);
  const jaOhnePrem = await tap2('#cst-body .ch-preset', 'coachSetupReminder(true)');
  await wait(600);
  const nachOhnePrem = await lage2();
  check('Ohne Premium loest die Einrichtung den Systemdialog NICHT aus (requestPermissions bleibt bei 0) und schaltet die Erinnerung nicht ein — der einmalige iOS-Dialog bleibt fuer den Tag nach dem Kauf erhalten',
    jaOhnePrem === true && nachOhnePrem.reqs === 0 && nachOhnePrem.notif === false &&
    nachOhnePrem.gespeichert !== true && nachOhnePrem.on === 'coachSetupReminder(false)' &&
    nachOhnePrem.setupOffen === true,
    JSON.stringify({ jaOhnePrem, nachOhnePrem }).slice(0, 800));

  const fehler2Rel = fehler2.filter(e => !/favicon|firebase|gstatic|net::ERR|Failed to load resource|Tracking Prevention/i.test(e));
  check('Die drei Erinnerungs-Durchlaeufe hinterlassen keinen Seitenfehler (Zustimmung, Ablehnung und der Fall ohne Premium laufen alle durch try/catch)',
    fehler2Rel.length === 0, fehler2Rel.join(' | ').slice(0, 600));
  await p2.close();

  await browser.close();
  server.close();

  // ── 30) Statisch: kein Emoji im Notification-Titel (sw.js) ───────────────
  try {
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const titel = (sw.match(/showNotification\(\s*(['"`])([^'"`]*)\1/g) || []);
    const piktogramm = /\p{Extended_Pictographic}/u;
    const treffer = titel.filter(t => piktogramm.test(t.replace(/\u2715/g, '')));
    // CACHE bleibt unangetastet - der Versions-Bump ist ein eigener Ritualschritt.
    const cache = (sw.match(/const CACHE\s*=\s*['"]([^'"]+)['"]/) || [])[1] || null;
    check('Statisch: kein Emoji im Notification-Titel von sw.js (CACHE unangetastet)',
      titel.length > 0 && treffer.length === 0 && cache === SW_CACHE_VORHER,
      JSON.stringify({ titel, treffer, cache, erwartet: SW_CACHE_VORHER }));
  } catch (e) { check('Statisch: kein Emoji im Notification-Titel von sw.js', false, String(e.message)); }

  // ── 19) Statisch: kein save(), Kaufpfad an der richtigen Stelle ───────────
  // Der teuerste Fehler dieses Blocks faellt zur Laufzeit NICHT auf: save()
  // existiert nicht, wirft ReferenceError und stirbt still im try/catch.
  try {
    const src = fs.readFileSync(SRC, 'utf8');
    const a = src.indexOf('COACH-EINRICHTUNG (Task 10)');
    const b = src.indexOf('function renderPremiumSettings', a > 0 ? a : 0);
    const block = a > 0 && b > a ? src.slice(a, b) : '';
    const pb = src.indexOf('async function premBuy(');
    const pbEnd = src.indexOf('async function premRestore(', pb > 0 ? pb : 0);
    const buy = pb > 0 && pbEnd > pb ? src.slice(pb, pbEnd) : '';
    const erfolg = buy.slice(buy.indexOf('res && res.active'), buy.indexOf("res && res.status === 'pending'"));
    check('Statisch: der Einrichtungs-Block nutzt persist() und nirgends save(); der Kaufpfad ruft openCoachSetup im Erfolgszweig mit 420 ms Versatz in try/catch',
      block.length > 800 && !/[^a-zA-Z_$.]save\s*\(/.test(block) && /persist\(\)|setCoachPreset\(/.test(block) &&
      /openCoachSetup/.test(erfolg) && /700 \+ 420/.test(erfolg) && /try\s*\{/.test(erfolg) &&
      /console\.warn/.test(erfolg) && !/[^a-zA-Z_$.]save\s*\(/.test(erfolg),
      JSON.stringify({ blockLen: block.length, saveImBlock: /[^a-zA-Z_$.]save\s*\(/.test(block),
                       erfolgLen: erfolg.length, hatAufruf: /openCoachSetup/.test(erfolg),
                       hatVersatz: /700 \+ 420/.test(erfolg) }));
  } catch (e) { check('Statisch: kein save(), Kaufpfad im Erfolgszweig', false, String(e.message)); }

  console.log('\n-- Task 10 — Einrichtung beim Abo-Abschluss (Chromium statt Simulator) --');
  let fail = 0;
  for (const t of results) {
    console.log((t.ok ? 'PASS  ' : 'FAIL  ') + t.name);
    if (!t.ok) { fail++; console.log('        got: ' + t.got); }
  }
  console.log('\nMessung der primaeren Aktion (ohne Scrollen):');
  for (const k of Object.keys(NAV_MASSE)) {
    console.log('  ' + k + ':');
    for (const st of [1, 2, 3]) {
      const m = (NAV_MASSE[k] || {})[st] || {};
      console.log('    Schritt ' + st + ': "' + m.label + '" Inhalt ' + m.inhalt + ' px / Sicht ' +
        m.sicht + ' px / Aktion ' + m.oben + '-' + m.unten + ' px / Leiste endet ' + m.navUnten + ' px / bei ' + m.vh +
        ' px Viewport, scrollTop ' + m.scroll + ', ganz im Bild: ' + m.ganzImBild +
        ', tippbar: ' + m.trefferIstAktion);
    }
  }

  const relevant = errors.filter(e => !/favicon|firebase|gstatic|net::ERR|Failed to load resource|Tracking Prevention/i.test(e));
  console.log('\nSeitenfehler (gefiltert): ' + (relevant.length ? '\n  ' + relevant.join('\n  ') : 'keine'));
  console.log(`\nErgebnis: ${results.length - fail}/${results.length} PASS`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS-FEHLER: ' + e.message); try { server.close(); } catch(_) {} process.exit(2); });
