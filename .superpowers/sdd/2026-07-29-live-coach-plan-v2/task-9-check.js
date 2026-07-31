/* Task-9-Verifikation ohne iOS-Simulator (Windows, kein Xcode).
   Jeder Punkt der Pruefliste aus task-9-brief.md ist EIN Check. Statischer
   Node-Server + Chromium ueber Puppeteer; die Tagesempfehlung wird gestubbt
   (frisches Profil liefert null), der Renderpfad selbst laeuft echt. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('C:/Users/Anwender/Desktop/Claude/gymtrack/node_modules/puppeteer');

const ROOT = 'C:/Users/Anwender/Desktop/Claude/gymtrack';
const SHOT = path.join(ROOT, '.superpowers/sdd/2026-07-29-live-coach-plan-v2/task-9-hub.png');
const PORT = 8793;
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

// Jeder deutsche Oberflaechen-String, den der Hub ueber tr() rendert. Fehlt einer
// in I18N_EN, bliebe er auf Englisch deutsch stehen — genau der blinde Fleck, den
// eine Zehn-Phrasen-Sperrliste offen liess. 'Journal' fehlt bewusst: es ist im
// Englischen identisch und braucht keinen Schluessel.
// Seit dem Hub-Umbau (fuenf Kacheln statt vier Reitern) tragen die Kacheltitel
// und die Unterzeile des Kopfes eigene Schluessel; 'Chat' und 'Einstellungen'
// gehoeren nicht mehr dazu, weil der Hub sie nicht mehr rendert.
const HUB_TR_KEYS = [
  'Woche','Gespräch','Persönlichkeit','Umfang und Meldungen','dein Coach',
  'Letzter Wortwechsel','Einschränkungen','Vorlieben','Was funktioniert',
  'Dein Ziel','Noch nichts notiert.','Eintrag entfernen','Bestätigung fällig','Wochenbericht',
  'Dein erster Wochenbericht kommt am Sonntag.','Tippen für Chat, Journal und Einstellungen.',
  'Wie soll dein Coach klingen?','Wie viel Coach willst du?','Ruhig','Sachlich','Hart','Locker',
  'Zurückhaltend','Ausgewogen','Eng dabei','Angepasst',
  'Kein Live-Coach, keine Rückmeldung nach dem Satz, stille Nachrichten.',
  'Live-Coach bei Schlüsselmomenten, Rückmeldung nach dem Satz, normale Nachrichten.',
  'Live-Coach bei jedem Satz, Rückmeldung nach dem Satz, enge Nachrichten.',
  'Deine eigene Mischung aus der Feinjustierung.','Feinjustierung','Schlüsselmomente','Jeder Satz',
  'Nachrichten','Rückmeldung nach dem Satz','Kurzer Kommentar, sobald ein Satz steht.',
  'Wie oft der Coach dich außerhalb der App anspricht.',
  'Wie präsent der Coach während einer Einheit ist.',
  'Live-Coach im Training','Tagesempfehlung auf der Startseite',
  'Trainingsvorschlag laut Erholung deiner Muskelgruppen'
];

const results = [];
const check = (name, cond, got) => results.push({ name, ok: !!cond, got });

// Grundzustand fuer jeden Lauf: Premium an, Tagesempfehlung synthetisch (der
// CTA feuert einen Marker statt eines echten Trainingsstarts), Konto gesetzt,
// damit das Dossier ueberhaupt einen Schluessel hat.
const SETUP = () => {
  window.isPremium = () => true;
  window.__ctaRan = false;
  // Original merken: der insights-Check muss den ECHTEN Renderpfad fahren,
  // der Stub wuerde die insights-Pruefung darin ueberspringen.
  if (!window.__origSuggestion) window.__origSuggestion = window._coachTodaySuggestion;
  window._coachTodaySuggestion = () => ({
    kind: 'plan', head: 'Push-Tag steht an', text: 'Zuletzt Bankdruecken 62,5 kg',
    chip: 'Dein Plan', chip2: '3 Uebungen', ringLbl: 'Bereit', pct: 72,
    cta: { label: 'Training starten', on: 'window.__ctaRan=true' }
  });
  _fbUser = { uid: 'chk-uid', isAnonymous: false };
  // Seit Task 10 ist die Weiche in openCoachHub scharf: bei preset===undefined
  // startet die EINRICHTUNG statt des Hubs, und ein frisches Pruefprofil hat
  // genau das. Diese Suite prueft den Hub, also bekommt das Profil hier ein
  // gesetztes Umfangs-Profil. Check 10, der die Weiche selbst prueft, nimmt es
  // gezielt wieder weg.
  S.aiCoach = S.aiCoach || {};
  if (S.aiCoach.preset === undefined) { S.aiCoach.preset = 'balanced'; persist(); }
  // Die zweite Beispielzeile der Ton-Auswahl (#ch-tone-ex) zeigt seit der
  // Blockabschluss-Review nur noch ECHTE Zahlen der letzten beendeten Einheit und
  // entfaellt ganz, wenn keine vorliegt - ein frisches Pruefprofil hat keine.
  // Darum eine Uebung und eine Einheit in den Bestand: 2 x 50 kg x 10 Wdh.
  if (!(S.exercises || []).length) {
    S.exercises = [{ id: 'chk-ex', name: 'Bankdruecken', muscle: 'chest', targetType: 'reps' }];
  }
  if (!(S.sessions || []).length) {
    S.sessions = [{ date: '2026-07-28', logs: [{ exerciseId: 'chk-ex',
      sets: [{ w: 50, r: 10, type: 'normal' }, { w: 50, r: 10, type: 'normal' }] }] }];
  }
  persist();
  // Anmelde-Wand wegblenden: sie liegt mit z-index 1390 ueber dem Sheet (1080) und
  // faengt sonst jeden ECHTEN Zeigerklick ab. Rein visuell, kein Renderpfad.
  const gate = document.getElementById('auth-gate'); if (gate) gate.style.display = 'none';
  renderCoachTodayCard();
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
  // Echter Tipp (mousemove + pointerdown + pointerup) auf das Element mit genau
  // diesem onclick. .click() aus dem Seitenkontext haette Befund 2 nie gefangen:
  // dort gibt es kein Zeitfenster zwischen down und up, in dem ein Rerender den
  // Knopf aus dem DOM nehmen kann.
  const tap = async (sel, onclick) => {
    for (const h of await page.$$(sel)) {
      const oc = await h.evaluate(e => e.getAttribute('onclick'));
      if (oc === onclick) { await h.click(); return true; }
    }
    return false;
  };
  const boot = async () => {
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 1500));
    await ev(SETUP);
  };
  await boot();

  // ── 1) Tipp auf die Coach-Karte oeffnet den Hub ───────────────────────────
  let r = await ev(() => {
    const card = document.querySelector('#coach-today-card .aic');
    const inner = document.querySelector('#coach-today-card .aic-head');
    if (!card || !inner) return { err: 'Karte fehlt' };
    inner.click();                                  // Tap mitten in die Karte
    const ov = document.getElementById('ov-coach-hub');
    return { open: !!(ov && ov.classList.contains('on')),
             // Aus vier Reitern sind fuenf Kacheln geworden; die Zusicherung
             // bleibt dieselbe: die Karte oeffnet ein fertig gezeichnetes Blatt.
             kacheln: document.querySelectorAll('#ov-coach-hub .ch-card').length,
             offen: document.querySelectorAll('#ov-coach-hub .ch-card.on').length,
             reiter: document.querySelectorAll('#ov-coach-hub .ch-tabs, #ov-coach-hub .ch-tab').length };
  });
  check('Tipp auf die Coach-Karte oeffnet ov-coach-hub mit fuenf Kacheln, genau einer offenen und ohne Reiter (Handler verdrahtet)',
    r.open === true && r.kacheln === 5 && r.offen === 1 && r.reiter === 0, JSON.stringify(r));

  // ── 2) Tipp auf den CTA startet das Training, oeffnet den Hub NICHT ───────
  r = await ev(() => {
    closeOv('ov-coach-hub');
    window.__ctaRan = false;
    const go = document.querySelector('#coach-today-card .aic-go');
    if (!go) return { err: 'CTA fehlt' };
    go.click();
    const ov = document.getElementById('ov-coach-hub');
    return { cta: window.__ctaRan === true, hubOpen: !!(ov && ov.classList.contains('on')) };
  });
  check('Tipp auf "Training starten" startet das Training, Hub bleibt zu (closest-Waechter)',
    r.cta === true && r.hubOpen === false, JSON.stringify(r));

  // ── 3) Alle fuenf Kacheln tragen Titel, Kennzahl und Inhalt ──────────────
  // Dieselbe Zusicherung wie frueher fuer die vier Reiter ("Beschriftung
  // gesetzt, Inhalt nicht leer, aktiver markiert"), dazu die Kennzahl, die es
  // beim Reiter noch nicht gab.
  r = await ev(() => {
    openCoachHub('chat');
    const out = {};
    ['chat','week','persona','scope','journal'].forEach(t => {
      coachHubOpen(t);
      const sec = document.getElementById('ch-card-' + t);
      const b   = sec ? sec.querySelector('.ch-card-b') : null;
      out[t] = { len: (b ? b.textContent.trim().length : 0),
                 lbl: sec ? (sec.querySelector('.ch-card-t') || {}).textContent.trim() : '',
                 kz:  sec ? (sec.querySelector('.ch-card-m') || {}).textContent.trim() : '',
                 on:  !!(sec && sec.classList.contains('on')),
                 nurEine: document.querySelectorAll('#ch-body .ch-card.on').length };
    });
    return out;
  });
  check('Alle fuenf Kacheln: Titel und Kennzahl gesetzt, Inhalt nicht leer, immer genau EINE offen',
    ['chat','week','persona','scope','journal'].every(t =>
      r[t] && r[t].len > 20 && r[t].lbl.length > 1 && r[t].kz.length > 2 && r[t].on && r[t].nurEine === 1),
    JSON.stringify(r));

  // ── 4) Journal: Eintrag sichtbar, Loeschknopf entfernt ihn dauerhaft ─────
  r = await ev(() => {
    const now = Date.now();
    CoachMemory.dossierSave(localStorage, 'chk-uid', Object.assign(CoachMemory.dossierEmpty(), {
      goal: 'Kraft',
      limits: [{ t: 'Schulter links zickt', ts: now }],
      prefs:  [{ t: 'Lieber Kurzhanteln', ts: now }],
      works:  [{ t: 'Pause 3 Minuten bei Kniebeuge', ts: now }],
      updatedAt: now
    }));
    openCoachHub('journal');
    const rows = [...document.querySelectorAll('#ch-body .ch-jrn')];
    const hit = rows.find(x => x.textContent.indexOf('Schulter links zickt') >= 0);
    const before = rows.map(x => x.textContent.replace(/\s+/g,' ').trim());
    if (!hit) return { before, err: 'Eintrag nicht sichtbar' };
    const btn = hit.querySelector('button');
    if (!btn) return { before, err: 'Loeschknopf fehlt' };
    btn.click();
    const after = [...document.querySelectorAll('#ch-body .ch-jrn')].map(x => x.textContent.replace(/\s+/g,' ').trim());
    const raw = localStorage.getItem(CoachMemory.dossierKey('chk-uid')) || '';
    return { before, after, inDom: after.some(t => t.indexOf('Schulter links zickt') >= 0),
             inStore: raw.indexOf('Schulter links zickt') >= 0,
             mitDatum: before.some(t => /gilt bis|valid until/.test(t)),
             restLimits: (_dossier().limits || []).length, prefs: (_dossier().prefs || []).length };
  });
  const c4 = r || {};
  check('Journal: Eintrag samt Ablaufdatum sichtbar, Loeschknopf entfernt ihn aus DOM und Speicher',
    !c4.err && c4.mitDatum === true && c4.inDom === false && c4.inStore === false && c4.restLimits === 0 && c4.prefs === 1,
    JSON.stringify(c4));

  // ── 4b) dauerhaft: nach App-Neustart ist der Eintrag weg, der Rest da ────
  await boot();
  r = await ev(() => {
    const d = _dossier();
    return { limits: (d.limits || []).length, prefs: (d.prefs || []).map(e => e.t), goal: d.goal };
  });
  check('Loeschung ueberlebt den App-Neustart (Eintrag weg, uebriges Dossier da)',
    r.limits === 0 && (r.prefs||[]).length === 1 && r.goal === 'Kraft', JSON.stringify(r));

  // ── 5) Markup im Dossier-Eintrag erscheint als Text ──────────────────────
  r = await ev(() => {
    const now = Date.now();
    CoachMemory.dossierSave(localStorage, 'chk-uid', Object.assign(CoachMemory.dossierEmpty(), {
      limits: [{ t: '<b>Schulter</b> zickt', ts: now }], updatedAt: now
    }));
    openCoachHub('journal');
    // Gemessen wird die Journal-KACHEL, nicht das ganze Blatt: seit dem Umbau
    // stehen alle fuenf Kacheln gleichzeitig im DOM, und die Ton- und
    // Profilkarten tragen ihr <b> voellig zu Recht.
    const body = document.getElementById('ch-card-journal');
    const row = [...body.querySelectorAll('.ch-jrn')].find(x => x.textContent.indexOf('Schulter') >= 0);
    return { text: row ? row.textContent.replace(/\s+/g,' ').trim() : null,
             bold: body.querySelectorAll('b').length,
             html: row ? row.innerHTML.indexOf('<b>Schulter</b>') >= 0 : null };
  });
  check('Dossier-Eintrag mit <b> erscheint als Text, nicht als Markup',
    r.text && r.text.indexOf('<b>Schulter</b>') >= 0 && r.bold === 0 && r.html === false, JSON.stringify(r));

  // ── 6) Vier Toene, vier sichtbar verschiedene Beispielsaetze ─────────────
  r = await ev(() => {
    openCoachHub('settings');
    const out = { cards: [], live: [], tones: [] };
    ['ruhig','sachlich','hart','locker'].forEach(t => {
      const card = [...document.querySelectorAll('#ch-body .ch-preset')]
        .find(b => b.getAttribute('onclick') === `setAiCoachOpt('tone','${t}')`);
      if (!card) { out.cards.push(null); return; }
      card.click();
      const on = [...document.querySelectorAll('#ch-body .ch-preset')]
        .find(b => b.getAttribute('onclick') === `setAiCoachOpt('tone','${t}')`);
      out.cards.push(on ? (on.querySelector('span') || {}).textContent : null);
      out.tones.push(S.aiCoach.tone + (on && on.classList.contains('on') ? '+on' : '-off'));
      const ex = document.getElementById('ch-tone-ex');
      out.live.push(ex ? ex.textContent.replace(/\s+/g,' ').trim() : null);
    });
    return out;
  });
  const uniq = a => new Set(a).size;
  check('Ton-Auswahl: vier Karten mit vier verschiedenen Saetzen, Beispielsatz darunter wechselt sichtbar',
    (r.cards||[]).length === 4 && (r.cards||[]).every(x => x && x.length > 12) && uniq(r.cards||[]) === 4 &&
    (r.live||[]).length === 4 && (r.live||[]).every(x => x && x.length > 12) && uniq(r.live||[]) === 4 &&
    (r.tones||[]).join(',') === 'ruhig+on,sachlich+on,hart+on,locker+on',
    JSON.stringify(r));

  // ── 7) "Eng dabei" + Nachrichten "Still" ⇒ Profilanzeige "Angepasst" ─────
  r = await ev(() => {
    openCoachHub('settings');
    const byClick = (sel, on) => [...document.querySelectorAll('#ch-body ' + sel)]
      .find(b => b.getAttribute('onclick') === on);
    const close = byClick('.ch-preset', "setCoachPreset('close')");
    if (!close) return { err: 'Profilkarte "Eng dabei" fehlt' };
    close.click();
    const afterClose = {
      preset: S.aiCoach.preset, push: S.aiCoach.pushLevel,
      lbl: (close.querySelector('b') || {}).textContent,
      on: !!byClick('.ch-preset', "setCoachPreset('close')").classList.contains('on'),
      custom: [...document.querySelectorAll('#ch-body .ch-preset')].some(b => /Angepasst|Custom/.test(b.textContent))
    };
    const still = byClick('.pwz-chip', "setAiCoachOpt('pushLevel','still')");
    if (!still) return { afterClose, err: 'Nachrichten-Schalter "Still" fehlt' };
    still.click();
    const card = [...document.querySelectorAll('#ch-body .ch-preset')].find(b => /Angepasst|Custom/.test(b.textContent));
    return { afterClose, preset: S.aiCoach.preset, push: S.aiCoach.pushLevel,
             customCard: !!card, customOn: !!(card && card.classList.contains('on')),
             customDisabled: !!(card && card.disabled),
             closeStillOn: !!byClick('.ch-preset', "setCoachPreset('close')").classList.contains('on') };
  });
  check('"Eng dabei" + Nachrichten "Still" ⇒ vierte, deaktivierte Karte "Angepasst" ist aktiv',
    !r.err && (r.afterClose||{}).preset === 'close' && (r.afterClose||{}).push === 'eng' && (r.afterClose||{}).on === true &&
    (r.afterClose||{}).custom === false && r.preset === 'custom' && r.push === 'still' &&
    r.customCard === true && r.customOn === true && r.customDisabled === true && r.closeStillOn === false,
    JSON.stringify(r));

  // ── 8) Heute-Tab: keine neue Karte, Zeile oder Kachel ────────────────────
  r = await ev(() => {
    closeOv('ov-coach-hub');
    const pad = document.getElementById('heute-pad');
    const host = document.getElementById('coach-today-card');
    return {
      padKinder: [...pad.children].map(c => c.id || c.className),
      aicKarten: document.querySelectorAll('#pg-heute .aic').length,
      hubImHeute: !!document.querySelector('#pg-heute #ov-coach-hub, #pg-heute .ch-card, #pg-heute .ch-preset'),
      hubUnterBody: document.getElementById('ov-coach-hub').parentElement === document.body,
      hostKinder: host.children.length,
      // Die Tableiste traegt unveraendert ihre fuenf Knoepfe (Heute, Training,
      // Statistik, Community, Einstellungen) - und keiner davon fuehrt zum Coach.
      tabs: [...document.querySelectorAll('.tabbar .tab')].map(b => (b.getAttribute('onclick') || '')),
      coachTab: [...document.querySelectorAll('.tabbar .tab')].some(b =>
        /coach|hub/i.test((b.getAttribute('onclick') || '') + ' ' + b.textContent))
    };
  });
  check('Heute-Tab: nur die bestehende .aic-Karte, kein neues Element, kein fuenfter Tab',
    (r.padKinder||[]).length === 2 && (r.padKinder||[])[0] === 'coach-today-card' && r.aicKarten === 1 &&
    r.hubImHeute === false && r.hubUnterBody === true && r.hostKinder === 1 &&
    (r.tabs||[]).length === 5 && r.coachTab === false,
    JSON.stringify(r));

  // ── 9) renderCoachHub() ist ein no-op, wenn der Hub zu ist ───────────────
  r = await ev(() => {
    openCoachHub('journal'); closeOv('ov-coach-hub');
    const b = document.getElementById('ch-body');
    b.innerHTML = 'SENTINEL';
    let threw = null;
    try { renderCoachHub(); } catch(e) { threw = String(e && e.message); }
    const nachOpt = (() => { setAiCoachOpt('insights', true); return document.getElementById('ch-body').innerHTML; })();
    return { html: b.innerHTML, threw, nachOpt };
  });
  check('renderCoachHub() kehrt bei geschlossenem Overlay frueh zurueck (auch aus setAiCoachOpt)',
    r.html === 'SENTINEL' && r.nachOpt === 'SENTINEL' && r.threw === null, JSON.stringify(r));

  // ── 10) Weiche auf die Einrichtung (Task 10) ─────────────────────────────
  r = await ev(() => {
    const out = {};
    // a) Premium + preset undefined, aber openCoachSetup fehlt ⇒ Hub oeffnet.
    //    Seit Task 10 EXISTIERT die Funktion, also wird sie fuer diesen Teil
    //    kurz weggenommen. Kein delete: eine Funktionsdeklaration im globalen
    //    Gueltigkeitsbereich ist beschreibbar, aber nicht loeschbar.
    const echteEinrichtung = window.openCoachSetup;
    window.openCoachSetup = undefined;
    delete S.aiCoach.preset;
    closeOv('ov-coach-hub');
    openCoachHub('chat');
    out.ohneSetup = document.getElementById('ov-coach-hub').classList.contains('on');
    // b) dieselbe Lage MIT openCoachSetup ⇒ Einrichtung statt Hub
    closeOv('ov-coach-hub');
    window.__setupRan = 0;
    window.openCoachSetup = () => { window.__setupRan++; };
    openCoachHub('chat');
    out.setupRan = window.__setupRan;
    out.hubZu = !document.getElementById('ov-coach-hub').classList.contains('on');
    // c) gesetztes Profil (auch 'custom') ⇒ Hub, keine Einrichtung
    S.aiCoach.preset = 'custom';
    openCoachHub('chat');
    out.customSetupRan = window.__setupRan;
    out.customHubOffen = document.getElementById('ov-coach-hub').classList.contains('on');
    // d) kein Premium ⇒ keine Einrichtung
    closeOv('ov-coach-hub');
    delete S.aiCoach.preset;
    window.isPremium = () => false;
    openCoachHub('chat');
    out.freeSetupRan = window.__setupRan;
    out.freeHubOffen = document.getElementById('ov-coach-hub').classList.contains('on');
    window.isPremium = () => true;
    window.openCoachSetup = echteEinrichtung;   // s. oben: delete greift nicht
    S.aiCoach.preset = 'balanced';
    return out;
  });
  check('Weiche: ohne openCoachSetup oeffnet der Hub, mit ihr startet die Einrichtung nur bei preset===undefined + Premium',
    r.ohneSetup === true && r.setupRan === 1 && r.hubZu === true &&
    r.customSetupRan === 1 && r.customHubOffen === true &&
    r.freeSetupRan === 1 && r.freeHubOffen === true, JSON.stringify(r));

  // ── 11) _dossierRemove auf goal + unbekannte Gruppe/Index ────────────────
  r = await ev(() => {
    const now = Date.now();
    CoachMemory.dossierSave(localStorage, 'chk-uid', Object.assign(CoachMemory.dossierEmpty(), {
      goal: 'Masse', prefs: [{ t: 'Morgens trainieren', ts: now }], updatedAt: now
    }));
    openCoachHub('journal');
    const zielReihe = [...document.querySelectorAll('#ch-body .ch-jrn')].find(x => x.textContent.indexOf('Masse') >= 0);
    if (zielReihe) zielReihe.querySelector('button').click();
    const nachZiel = _dossier();
    _dossierRemove('coachStats', 0);     // fremde Gruppe: nichts passiert
    _dossierRemove('prefs', 9);          // Index daneben: nichts passiert
    _dossierRemove('prefs', -1);
    const nachMuell = _dossier();
    return { goal: nachZiel.goal, prefs: (nachMuell.prefs || []).length,
             stats: !!nachMuell.coachStats, ziel2: nachMuell.goal };
  });
  check('_dossierRemove: Ziel loeschbar, fremde Gruppe und Index daneben aendern nichts',
    r.goal === null && r.ziel2 === null && r.prefs === 1 && r.stats === true, JSON.stringify(r));

  // ── 12) Chat-Reiter: letzter Wortwechsel gekuerzt + Sprung in ov-ai-chat ─
  r = await ev(() => {
    _aicHist.length = 0;
    _aicHist.push({ role:'user', content:'Wie <b>schwer</b> soll ich Bankdruecken?' });
    _aicHist.push({ role:'assistant', content:'X'.repeat(400) });
    openCoachHub('chat');
    // Gemessen wird die Gespraechs-KACHEL: die anderen vier stehen seit dem
    // Umbau gleichzeitig im DOM und tragen ihr eigenes <b>.
    const body = document.getElementById('ch-card-chat');
    const msgs = [...body.querySelectorAll('.aic-msg')];
    const btn = [...body.querySelectorAll('button')].find(b => /coachHubOpenChat/.test(b.getAttribute('onclick') || ''));
    const lang = msgs.map(m => m.textContent.length);
    if (btn) btn.click();
    return { anzahl: msgs.length, bold: body.querySelectorAll('b').length,
             roh: msgs.some(m => m.textContent.indexOf('<b>schwer</b>') >= 0),
             gekuerzt: lang.every(l => l <= 200),
             hubZu: !document.getElementById('ov-coach-hub').classList.contains('on'),
             chatOffen: document.getElementById('ov-ai-chat').classList.contains('on') };
  });
  check('Chat-Reiter: letzter Wortwechsel gekuerzt und escaped, Knopf springt in ov-ai-chat',
    r.anzahl === 2 && r.bold === 0 && r.roh === true && r.gekuerzt === true &&
    r.hubZu === true && r.chatOffen === true, JSON.stringify(r));

  // ── 13) Tagesempfehlung AUS: die Karte bleibt der Zugang (Befund 1) ──────
  r = await ev(() => {
    closeOv('ov-coach-hub');
    // Echter Renderpfad: der Stub aus SETUP wuerde die insights-Pruefung in
    // _coachTodaySuggestion() ueberspringen.
    window._coachTodaySuggestion = window.__origSuggestion;
    setAiCoachOpt('insights', false);
    try { renderHome(); } catch(_) {}
    renderCoachTodayCard();
    const host = document.getElementById('coach-today-card');
    const karte = host.querySelector('.aic');
    const lbl   = host.querySelector('.aic-lbl');
    const out = {
      karte: !!karte, name: lbl ? lbl.textContent : null,
      // Empfehlungsinhalt muss weg sein: Ring, Chips, CTA, Empfehlungskopf
      ring: !!host.querySelector('.aic-ringbox'), chips: !!host.querySelector('.aic-chips'),
      cta: !!host.querySelector('.aic-go'), head: !!host.querySelector('.aic-head'),
      text: karte ? karte.textContent.replace(/\s+/g, ' ').trim() : null,
      // und zwar auch nach einem weiteren renderHome()
      nachHome: null, hubOffen: null, karten: 0
    };
    try { renderHome(); } catch(_) {}
    out.nachHome = !!document.querySelector('#coach-today-card .aic');
    out.karten = document.querySelectorAll('#pg-heute .aic').length;
    const ziel = document.querySelector('#coach-today-card .aic-lbl');
    if (ziel) ziel.click();
    out.hubOffen = document.getElementById('ov-coach-hub').classList.contains('on');
    closeOv('ov-coach-hub');
    setAiCoachOpt('insights', true);
    window._coachTodaySuggestion = () => ({
      kind: 'plan', head: 'Push-Tag steht an', text: 'Zuletzt Bankdruecken 62,5 kg',
      chip: 'Dein Plan', chip2: '3 Uebungen', ringLbl: 'Bereit', pct: 72,
      cta: { label: 'Training starten', on: 'window.__ctaRan=true' }
    });
    renderCoachTodayCard();
    return out;
  });
  check('Tagesempfehlung aus: schmale Karte mit Coach-Namen bleibt und oeffnet den Hub (Befund 1)',
    r.karte === true && r.name === 'Coach' && r.ring === false && r.chips === false &&
    r.cta === false && r.head === false && r.nachHome === true && r.karten === 1 && r.hubOffen === true,
    JSON.stringify(r));

  // ── 14) Erster Tipp nach dem Namensfeld zaehlt (Befund 2) ────────────────
  await ev(() => {
    // Der Chat-Sheet aus Check 12 liegt noch offen und traegt dieselbe Ebene (1080),
    // steht im Markup aber HINTER dem Hub — sein Scrim faengt sonst jeden echten
    // Zeigerklick ab.
    closeOv('ov-ai-chat');
    setAiCoachOpt('name', ''); setAiCoachOpt('tone', 'sachlich'); openCoachHub('persona');
    // Sheet an den Anfang: fruehere Checks haben es gescrollt, und Puppeteer
    // scrollt ein Element genau an die Oberkante — dort liegt der klebende
    // .sh-handle darueber und faengt den Zeigerklick ab (Testartefakt, kein
    // App-Fehler: ein Nutzer tippt auf das, was er sieht).
    const sh = document.querySelector('#ov-coach-hub .sheet'); if (sh) sh.scrollTop = 0;
  });
  await new Promise(r => setTimeout(r, 450));   // Sheet-Einblendung (animation up .28s)
  await page.click('#ch-name');
  await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
  await page.type('#ch-name', 'Nina');
  const getippt = await tap('#ch-body .ch-preset', "setAiCoachOpt('tone','ruhig')");
  r = await ev(() => ({
    tone: S.aiCoach.tone, name: S.aiCoach.name,
    titel: (document.getElementById('ch-title') || {}).textContent,
    feld: (document.getElementById('ch-name') || {}).value,
    // der Name im Beispielsatz-Vorspann muss mitgezogen sein
    ex: (document.getElementById('ch-tone-ex') || {}).textContent
  }));
  check('Erster Tipp direkt nach dem Namensfeld setzt den Ton (Befund 2)',
    getippt === true && r.tone === 'ruhig' && r.name === 'Nina' && r.titel === 'Nina' &&
    r.feld === 'Nina' && /Nina/.test(r.ex || ''),
    JSON.stringify({ getippt, ...r }));

  // ── 15) Feinjustierung bleibt beim Schalten offen (Befund 4) ─────────────
  r = await ev(() => {
    openCoachHub('settings');
    const det = document.querySelector('#ch-body details');
    if (!det) return { err: 'details fehlt' };
    det.open = true;
    const sw = document.querySelector('#ch-body details input[type=checkbox]');
    if (!sw) return { err: 'Schalter fehlt' };
    sw.click();                                   // setFeedback umlegen -> Rerender
    const d1 = document.querySelector('#ch-body details');
    const nachSchalter = !!(d1 && d1.open);
    const chip = [...document.querySelectorAll('#ch-body details .pwz-chip')]
      .find(b => b.getAttribute('onclick') === "setAiCoachOpt('pushLevel','still')");
    if (!chip) return { nachSchalter, err: 'Chip fehlt' };
    chip.click();                                 // Chip -> zweiter Rerender
    const d2 = document.querySelector('#ch-body details');
    const nachChip = !!(d2 && d2.open);           // SOFORT lesen, s. Gegenprobe darunter
    // Gegenprobe: zugeklappt bleibt zugeklappt
    if (d2) d2.open = false;
    const sw2 = document.querySelector('#ch-body details input[type=checkbox]');
    if (sw2) sw2.click();
    const d3 = document.querySelector('#ch-body details');
    return { nachSchalter, nachChip, zuBleibtZu: !!(d3 && !d3.open),
             feedback: S.aiCoach.setFeedback, push: S.aiCoach.pushLevel };
  });
  check('Feinjustierung bleibt nach jedem Schalter offen, zugeklappt bleibt zugeklappt (Befund 4)',
    r.nachSchalter === true && r.nachChip === true && r.zuBleibtZu === true && r.push === 'still',
    JSON.stringify(r));

  // ── 13) Zweisprachigkeit: derselbe Hub auf Englisch ohne deutschen Rest ──
  await page.evaluate(() => localStorage.setItem('gt_lang','en'));
  await boot();
  r = await ev((keys) => {
    const now = Date.now();
    CoachMemory.dossierSave(localStorage, 'chk-uid', Object.assign(CoachMemory.dossierEmpty(), {
      goal: 'Kraft', limits: [{ t: 'Shoulder acts up', ts: now }], updatedAt: now
    }));
    const txt = {};
    ['chat','journal','report','settings'].forEach(t => { openCoachHub(t); txt[t] = document.getElementById('ch-body').textContent.replace(/\s+/g,' ').trim(); });
    const tabs = ['chat','journal','report','settings'].map(k => document.getElementById('ch-tab-' + k).textContent);
    // Fehlender oder unuebersetzter Schluessel = Leck. Geprueft wird der konkrete
    // Bestand in I18N_EN, nicht eine Stichprobe im gerenderten Text.
    const fehlt = keys.filter(k => {
      const v = I18N_EN[k];
      return v === undefined || v === null || v === '' || v === k;
    });
    openCoachHub('journal');
    const aria = (document.querySelector('#ch-body .ch-jrn button') || {}).ariaLabel ||
                 (document.querySelector('#ch-body .ch-jrn button') || { getAttribute: () => null }).getAttribute('aria-label');
    return { tabs, txt, fehlt, aria };
  }, HUB_TR_KEYS);
  // Nur eigene Oberflaechentexte pruefen: 'Kraft' ist ein Dossier-WERT (Daten,
  // bewusst unuebersetzt), deshalb aus der Suche heraus.
  const deutschRest = Object.keys(r.txt || {}).filter(k =>
    /Wochenbericht|Einschränkungen|Vorlieben|Noch nichts notiert|Feinjustierung|Rückmeldung|Nachrichten|Letzter Wortwechsel|Jeder Satz|Zurückhaltend/.test(r.txt[k]));
  check('Zweisprachig: jeder Hub-Schluessel liegt uebersetzt in I18N_EN, aria-label inklusive',
    Array.isArray(r.fehlt) && r.fehlt.length === 0 && r.aria === 'Remove entry',
    JSON.stringify({ fehlt: r.fehlt, aria: r.aria }));
  check('Zweisprachig: Reiter und alle vier Bereiche kommen auf Englisch, kein deutscher Oberflaechentext',
    (r.tabs || []).join('|') === 'Chat|Journal|Week|Settings' && deutschRest.length === 0 &&
    /Weekly report/.test((r.txt||{}).report || '') && /Limits/.test((r.txt||{}).journal || '') &&
    /Fine tuning/.test((r.txt||{}).settings || '') && /Last exchange/.test((r.txt||{}).chat || ''),
    JSON.stringify({ tabs: r.tabs, deutschRest, txt: r.txt }).slice(0, 1200));
  await page.evaluate(() => localStorage.removeItem('gt_lang'));
  await boot();

  // ── Beleg: Screenshot des offenen Hubs (Journal) ─────────────────────────
  try {
    await ev(() => {
      const now = Date.now();
      CoachMemory.dossierSave(localStorage, 'chk-uid', Object.assign(CoachMemory.dossierEmpty(), {
        goal: 'Kraft',
        limits: [{ t: 'Schulter links zickt bei Ueberkopf', ts: now }],
        prefs:  [{ t: 'Lieber Kurzhanteln als Maschinen', ts: now }],
        works:  [{ t: 'Drei Minuten Pause bei Kniebeuge', ts: now }],
        updatedAt: now
      }));
      closeOv('ov-ai-chat');
      // Anmelde-Wand nur fuer den Beleg wegblenden: sie liegt ueber allem und
      // haette sonst den Hub im Bild verdeckt (rein visuell, kein Renderpfad).
      const gate = document.getElementById('auth-gate');
      if (gate) gate.style.display = 'none';
      openCoachHub('journal');
    });
    await new Promise(r => setTimeout(r, 700));
    await page.screenshot({ path: SHOT });
    const sichtbar = await ev(() => {
      const ov = document.getElementById('ov-coach-hub');
      const b = document.getElementById('ch-body');
      return { on: !!(ov && ov.classList.contains('on')), zeilen: b ? b.querySelectorAll('.ch-jrn').length : 0 };
    });
    check('Screenshot des offenen Hubs geschrieben (Hub sichtbar, Journal gefuellt)',
      fs.existsSync(SHOT) && fs.statSync(SHOT).size > 5000 && sichtbar.on === true && sichtbar.zeilen >= 5,
      SHOT + ' ' + JSON.stringify(sichtbar));
  } catch (e) { check('Screenshot des offenen Hubs geschrieben', false, String(e.message)); }

  // ── 18) gt_lang='auto' auf englischem Geraet (Befund 3) ──────────────────
  // Steht ZULETZT: der navigator.language-Griff gilt fuer jedes weitere Dokument
  // dieser Seite und soll die deutschen Checks oben nicht beeinflussen.
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'language',  { get: () => 'en-US' });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  });
  await ev(() => localStorage.removeItem('gt_lang'));
  await boot();
  r = await ev(() => {
    openCoachHub('settings');
    // s. lang-check.js: Beispielwerte aus derselben Quelle wie die Oberflaeche.
    const vars = _chToneVars();
    const soll = {}, ist = {};
    ['ruhig','sachlich','hart','locker'].forEach(t => {
      soll[t] = CoachPersona.say('greet', vars, CoachPersona.personaGet({ tone: t }), 'en');
      const card = [...document.querySelectorAll('#ch-body .ch-preset')]
        .find(b => b.getAttribute('onclick') === `setAiCoachOpt('tone','${t}')`);
      ist[t] = card ? (card.querySelector('span') || {}).textContent : null;
    });
    const exEl = document.getElementById('ch-tone-ex');
    return {
      GT_LANG: GT_LANG, pref: GT_LANG_PREF, lang: _lang(),
      gleich: ['ruhig','sachlich','hart','locker'].every(t => ist[t] === soll[t]),
      ist, soll,
      liveIst: exEl ? (exEl.querySelector('i') || {}).textContent : null,
      // Die zweite Beispielzeile laeuft seit der Blockabschluss-Review ueber
      // 'debrief' mit ECHTEN Zahlen der letzten Einheit (_chToneExVars) statt
      // ueber 'mid' mit erfundenen 4.200 kg / 104 %.
      liveSoll: CoachPersona.say('debrief', _chToneExVars(), _persona(), 'en'),
      tabs: ['chat','journal','report','settings'].map(k => document.getElementById('ch-tab-' + k).textContent).join('|')
    };
  });
  check("gt_lang='auto' auf englischem Geraet: Tonsaetze englisch wie Reiter und Ueberschriften (Befund 3)",
    r.GT_LANG === 'en' && r.pref === 'auto' && r.gleich === true &&
    r.liveIst === r.liveSoll && r.tabs === 'Chat|Journal|Week|Settings',
    JSON.stringify(r).slice(0, 1400));

  await browser.close();
  server.close();

  console.log('\n-- Task 9 — Coach-Hub (Chromium statt Simulator) --');
  let fail = 0;
  for (const t of results) {
    console.log((t.ok ? 'PASS  ' : 'FAIL  ') + t.name);
    if (!t.ok) { fail++; console.log('        got: ' + t.got); }
  }
  const relevant = errors.filter(e => !/favicon|firebase|gstatic|net::ERR|Failed to load resource|Tracking Prevention/i.test(e));
  console.log('\nSeitenfehler (gefiltert): ' + (relevant.length ? '\n  ' + relevant.join('\n  ') : 'keine'));
  console.log(`\nErgebnis: ${results.length - fail}/${results.length} PASS`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS-FEHLER: ' + e.message); try { server.close(); } catch(_) {} process.exit(2); });
