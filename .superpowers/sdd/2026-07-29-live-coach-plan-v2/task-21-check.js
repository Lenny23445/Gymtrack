/* Task-21-Verifikation ohne iOS-Simulator (Windows, kein Xcode).
   Jeder Punkt der Pruefliste aus task-21-brief.md ist EIN Check, dazu die
   zusaetzlich verlangten Faelle: leere Woche, allererste Woche, eine einzige
   Einheit, schweigende Prognose, alle vier Toene in beiden Sprachen,
   lbs-Nutzer, Uebungsname mit Markup und die Flaechenzahl im Heute-Tab.

   Die echte Zustellung laesst sich hier nicht pruefen: im Browser gibt es kein
   @capacitor/local-notifications. Geprueft wird deshalb — wie in
   task-19-check.js — die PLANUNGSEBENE ueber ein Doppel, das jeden schedule-
   Aufruf mitschreibt, den Bestand fuehrt und die registrierten Listener
   festhaelt, damit sich ein Tipp auf die Meldung nachfahren laesst.

   Der Modellaufruf laeuft ueber aiCall(); die Funktion wird ersetzt und
   mitgezaehlt. Damit ist auch pruefbar, dass eine Woche hoechstens EINEN
   Aufruf ausloest.

   Die Uhr steht fuer den ganzen Lauf auf MITTWOCH 10:00 der LAUFENDEN Woche.
   Bewusst die laufende und keine kuenstliche: calcStreak() und der
   Wochenplaner lesen weiterhin die echte Systemuhr, und ein Termin in einer
   anderen Kalenderwoche als der echten liesse Bericht und Streak auseinander
   laufen.

   Tipps laufen ueber echte Zeigerfolgen (page.click), nicht ueber synthetisches
   .click(). Eigener Port: 8800 (8793/8794/8795/8796/8797/8798/8799/8917 belegt).

   Aufruf:
     node task-21-check.js              gegen den Arbeitsstand
     node task-21-check.js --root=<dir> gegen einen anderen Baum (Rot-Lauf
                                        gegen den Stand VOR der Aenderung)      */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const puppeteer = require('C:/Users/Anwender/Desktop/Claude/gymtrack/node_modules/puppeteer');

const REPO = 'C:/Users/Anwender/Desktop/Claude/gymtrack';
const argRoot = (process.argv.find(a => a.startsWith('--root=')) || '').slice(7);
const ROOT = argRoot ? path.resolve(argRoot) : REPO;
const SRC  = path.join(ROOT, 'index.html');
const SHOT = path.join(REPO, '.superpowers/sdd/2026-07-29-live-coach-plan-v2/task-21-hub.png');
const PORT = 8800;
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

// Kommentare entfernen. Der Doppelpunkt-Riegel laesst 'https://' stehen. Die
// statischen Pruefungen lesen den CODE des Task-21-Blocks, nicht die
// Erklaerungen darin — sonst schluege der save()-Riegel schon an dem Kommentar
// an, der begruendet, WARUM save() verboten ist.
const ohneKommentar = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const gitZeigen = (pfad) => {
  try { return execSync('git show HEAD:' + pfad, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }
  catch (_) { return null; }
};

const results = [];
const check = (name, cond, got) => results.push({ name, ok: !!cond, got });
const wait = ms => new Promise(r => setTimeout(r, ms));
const PIKTO = /\p{Extended_Pictographic}/u;
const PLATZ = /\{[a-z]+\}/i;
// Der Rot-Lauf laeuft gegen einen Baum, in dem _crBuild() gar nicht existiert:
// dort liefert jeder Aufruf {__err}. Die Pruefungen sollen dann ROT sein, nicht
// den Harness abschiessen.
const O = (x) => (x && !x.__err) ? x : { fehler: (x && x.__err) || 'kein Ergebnis' };

/* ── Das Doppel: laeuft VOR jedem Skript der Seite ────────────────────────
   _isNative() liest window.Capacitor.isNativePlatform(), _cap(name) liest
   window.Capacitor.Plugins[name] — beides top-level const-Bindungen der App und
   von aussen nicht ueberschreibbar. Der einzige Hebel ist window.Capacitor.
   addListener wird mitgeschrieben: nur so laesst sich der getippte
   Berichts-Hinweis nachfahren. */
const STUB = () => {
  window.__cn = { schedule: [], cancel: [], perm: 'granted' };
  window.__cnPending = [];
  window.__cnListeners = {};
  window.__cnReset = function (pending) {
    window.__cn.schedule = []; window.__cn.cancel = [];
    window.__cnPending = (pending || []).slice();
  };
  const LN = {
    checkPermissions: async () => ({ display: window.__cn.perm }),
    requestPermissions: async () => ({ display: window.__cn.perm }),
    createChannel: async () => {},
    getPending: async () => ({ notifications: window.__cnPending.map(n => Object.assign({}, n)) }),
    schedule: async (o) => {
      window.__cn.schedule.push(o);
      ((o && o.notifications) || []).forEach(n => window.__cnPending.push(Object.assign({}, n)));
      return { notifications: (o && o.notifications) || [] };
    },
    cancel: async (o) => {
      window.__cn.cancel.push(o);
      ((o && o.notifications) || []).forEach(n => {
        window.__cnPending = window.__cnPending.filter(x => Number(x.id) !== Number(n.id));
      });
    },
    addListener: (name, cb) => {
      (window.__cnListeners[name] = window.__cnListeners[name] || []).push(cb);
      return { remove() {} };
    }
  };
  window.Capacitor = { isNativePlatform: () => true, Plugins: { LocalNotifications: LN } };
};

/* Grundzustand. opts:
     wochen      Anzahl vergangener Wochen mit je einer Einheit (Standard 8)
     dieseWoche  Einheiten in der LAUFENDEN Woche (Standard 2)
     kurve       'steigend' | 'flach' | 'zickzack'
     ziel        ex.targetWeight fuer ex0 (0 = kein Ziel)
     antwort     Text, den das Modell-Doppel liefert (null = Aufruf faellt aus)
   Die Uhr steht auf Mittwoch 10:00 DIESER Woche; alle Einheiten liegen
   relativ dazu. */
const BOOTSTATE = (o) => {
  const opt = Object.assign({ wochen: 8, dieseWoche: 2, kurve: 'steigend', ziel: 0, antwort: null }, o || {});
  window.isPremium = () => true;
  const gate = document.getElementById('auth-gate'); if (gate) gate.style.display = 'none';

  const b = new Date(); b.setHours(10, 0, 0, 0);
  b.setDate(b.getDate() - ((b.getDay() + 6) % 7) + 2);   // Montag dieser Woche + 2 = Mittwoch
  const NOW = b.getTime();
  window.__NOW = NOW;
  if (!window.__echtNow) window.__echtNow = Date.now.bind(Date);
  Date.now = () => window.__NOW;

  // Der Modellaufruf: mitgezaehlt, Antwort steuerbar. Ohne Antwort verhaelt es
  // sich wie ein Ausfall (aiCall gibt bei jedem Fehlerpfad null zurueck).
  window.__ai = { calls: 0, payloads: [] };
  window.__aiAntwort = opt.antwort;
  window.aiCall = async (kind, payload) => {
    window.__ai.calls++;
    window.__ai.payloads.push({ kind: kind, payload: payload });
    return window.__aiAntwort === null ? null : { text: window.__aiAntwort };
  };
  // Ohne Anmeldung fragt der Bericht bewusst nicht (aiCall zeigte sonst einen
  // Hinweis-Toast). Fuer den Messlauf gilt: angemeldet.
  window._crSignedIn = () => true;

  const NAMEN = ['Bankdrücken', 'Kniebeugen', 'Kreuzheben', 'Latzug'];
  const MG    = ['brust', 'beine', 'ruecken', 'ruecken'];
  S.exercises = NAMEN.map((n, i) => ({
    id: 'ex' + i, name: n, muscleGroup: MG[i],
    targetSets: 3, targetReps: 8, repMin: 6, repMax: 10, targetType: 'reps',
    targetWeight: i === 0 ? opt.ziel : 0
  }));

  const gew = (w) => {
    const stufe = opt.wochen - w;                       // 0 = aelteste Woche
    if (opt.kurve === 'flach')    return 60;
    if (opt.kurve === 'zickzack') return 60 + (stufe % 2 === 0 ? 0 : 12);
    return 60 + stufe * 2.5;
  };
  const mk = (ts, w, exIds) => ({
    id: 's' + ts, date: new Date(ts).toISOString(), duration: 3300,
    logs: (exIds || ['ex0', 'ex1', 'ex2']).map(id => ({ exerciseId: id, sets: [
      { w: w, r: 8, type: 'normal' }, { w: w, r: 8, type: 'normal' }, { w: w, r: 8, type: 'normal' }] }))
  });
  S.sessions = [];
  for (let w = opt.wochen; w >= 1; w--) S.sessions.push(mk(NOW - w * 7 * 864e5, gew(w)));
  for (let i = 0; i < opt.dieseWoche; i++) {
    S.sessions.push(mk(NOW - (i + 1) * 864e5, gew(0)));   // Di / Mo dieser Woche
  }

  S.unitMode = 'kg';
  S.notifEnabled = false;              // die Trainings-Erinnerung ist hier Umgebung
  S.coachReports = [];
  S.coachReportAt = { day: 0, hour: 18 };
  S.coachPush = { state: null, plan: [], permOk: true, owns: false };
  S.aiCoach = Object.assign({}, S.aiCoach, {
    name: 'Max', tone: 'sachlich', preset: 'balanced',
    pushLevel: 'normal', inTraining: 'key', setFeedback: true, live: true, insights: true
  });
  persist();
  window.__cnReset([{ id: 2500, title: 'Pause vorbei' }]);
  return { NOW: NOW, sessions: S.sessions.length };
};

/* Text der Wochen-KACHEL, sichtbar wie beim Nutzer. Seit dem Hub-Umbau stehen
   alle fuenf Kacheln gleichzeitig im DOM — gemessen wird deshalb #ch-card-week
   statt des ganzen Blattes, sonst faerbten Journal, Gespraech und Umfang das
   Ergebnis. */
const HUBTEXT = () => {
  const el = document.getElementById('ch-card-week');
  return {
    text: (el ? el.textContent : '').replace(/\s+/g, ' ').trim(),
    html: el ? el.innerHTML : '',
    zeilen: el ? [...el.querySelectorAll('.ch-jrn, .ch-row')].map(x => (x.textContent || '').replace(/\s+/g, ' ').trim()) : [],
    tab: (typeof _chOpen === 'string') ? _chOpen : null,
    offen: !!(document.getElementById('ov-coach-hub') || {}).classList &&
           document.getElementById('ov-coach-hub').classList.contains('on'),
    /* Seit Task 3 steht die Muskelverteilung als liegendes Balkendiagramm da.
       Ihre Beschriftungen liegen damit nicht mehr im Text, sondern in der
       Diagramm-Konfiguration — gelesen wird deshalb genau dort, und zusaetzlich
       die Textfassung fuer die Vorlesehilfe (aria-label). Das prueft mehr als
       der frühere Textscan: die Zahlen, die wirklich gezeichnet werden. */
    musLabels: (() => { try { const c = document.getElementById('chw-mus-cv');
      const ch = c && Chart.getChart(c); return ch ? ch.data.labels.slice() : null; } catch (_) { return null; } })(),
    volLabels: (() => { try { const c = document.getElementById('chw-vol-cv');
      const ch = c && Chart.getChart(c); return ch ? ch.data.labels.slice() : null; } catch (_) { return null; } })(),
    alt: (() => { try { return [...document.querySelectorAll('#ch-card-week canvas[aria-label]')]
      .map(c => c.getAttribute('aria-label')); } catch (_) { return []; } })(),
    // Pfeile der Kennzahlenzeile: ohne Vorwoche darf hier keiner stehen.
    pfeile: (() => { const n = document.getElementById('chw-nums');
      return n ? (n.textContent || '').replace(/[^↑↓]/g, '') : ''; })()
  };
};

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument(STUB);
  page.on('dialog', d => { try { d.dismiss(); } catch (_) {} });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text().slice(0, 200)); });

  const ev = async (fn, arg) => {
    try { return (arg === undefined) ? await page.evaluate(fn) : await page.evaluate(fn, arg); }
    catch (e) { return { __err: String((e && e.message) || e).slice(0, 240) }; }
  };
  const boot = async (opt) => {
    await page.setOfflineMode(false);
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 60000 });
    await wait(1500);
    return await ev(BOOTSTATE, opt || {});
  };
  // Hub oeffnen und ueber eine ECHTE Zeigerfolge die Kachel "Woche" aufklappen.
  const hubWoche = async () => {
    await ev(() => { try { openCoachHub('chat'); } catch (_) {} });
    await wait(450);
    try { await page.click('#ch-h-week'); } catch (_) {}
    await wait(700);
    return O(await ev(HUBTEXT));
  };
  let r;

  const DREI = 'Vier Einheiten und 18 Sätze stehen. 🎉 Das Volumen liegt über der Vorwoche. '
             + 'Die Serie hält. Ein vierter Satz fällt weg. Ein fünfter auch!';

  // ── 1) Registrierung: script-Tag nach coach-analyze, build.js, sw.js ──────
  await boot({ antwort: DREI });
  const statisch = (() => {
    try {
      const html  = fs.readFileSync(SRC, 'utf8');
      const build = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
      const sw    = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
      const shell = (sw.match(/const SHELL\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';
      return {
        tag:   html.includes('<script src="./js/coach-report.js">'),
        nachAnalyze: html.indexOf('js/coach-report.js') > html.indexOf('js/coach-analyze.js'),
        build: build.includes('js/coach-report.js'),
        shell: shell.includes('./js/coach-report.js'),
        cache: (sw.match(/const CACHE\s*=\s*['"]([^'"]+)['"]/) || [])[1] || null,
        ver:   (html.match(/const APP_VERSION\s*=\s*['"]([^'"]+)['"]/) || [])[1] || null
      };
    } catch (e) { return { err: String(e.message) }; }
  })();
  const swHead = gitZeigen('sw.js'), htmlHead = gitZeigen('index.html');
  const cacheHead = swHead ? ((swHead.match(/const CACHE\s*=\s*['"]([^'"]+)['"]/) || [])[1] || null) : null;
  const verHead   = htmlHead ? ((htmlHead.match(/const APP_VERSION\s*=\s*['"]([^'"]+)['"]/) || [])[1] || null) : null;
  r = O(await ev(() => ({ mod: typeof window.CoachReport, build: typeof window._crBuild,
                          prep: typeof window._crMaybePrepare, max: (function(){ try { return CR_MAX; } catch (_) { return null; } })() })));
  check('Registrierung: coach-report.js haengt als script-Tag NACH coach-analyze, in build.js und im SHELL-Precache — APP_VERSION und CACHE unangetastet',
    statisch.tag === true && statisch.nachAnalyze === true && statisch.build === true &&
    statisch.shell === true && statisch.cache === cacheHead && statisch.ver === verHead &&
    r.mod === 'object' && r.build === 'function' && r.prep === 'function' && r.max === 8,
    JSON.stringify({ statisch, cacheHead, verHead, r }).slice(0, 700));

  // ── 2) _crBuild(): Objekt mit numbers, Text genau drei Saetze, keine Emojis ─
  r = O(await ev(async () => {
    const rep = await _crBuild();
    return { rep: rep, calls: window.__ai.calls, laenge: (S.coachReports || []).length,
             // Nur die Zahlen gehen ans Modell: keine Session, kein Dossier,
             // kein Uebungsname, kein Cache-Hinweis.
             payload: JSON.stringify(window.__ai.payloads[0] || {}) };
  }));
  const saetze = (r.rep && r.rep.text) ? (String(r.rep.text).match(/[^.!?]+[.!?]+/g) || []).length : 0;
  check('await _crBuild(): Objekt mit numbers; text hat GENAU drei Saetze, kein Emoji — und der Aufruf schickt nur Zahlen (kein Dossier, keine Rohdaten, kein Cache-Schluessel)',
    !!r.rep && !!r.rep.numbers && r.rep.numbers.workouts === 2 && r.rep.numbers.sets === 18 &&
    r.rep.numbers.vol > 0 && saetze === 3 && !PIKTO.test(r.rep.text || '') &&
    r.calls === 1 && r.laenge === 1 &&
    !/dossier|logs|exercises|cacheKey|cacheable|Bankdr/i.test(r.payload || '') &&
    /* Hiess bis zur Abschluss-Review von Block 5 'volumeKg'. Der Schluessel
       traegt die Einheit nicht mehr im Namen, weil der Wert seither durch
       kgToDisp() geht: fuer einen lbs-Nutzer stuende sonst ein lbs-Wert unter
       einem Namen, der kg behauptet. Die Einheit steht jetzt einmal im Feld
       'unit'. Geprueft wird weiterhin dasselbe: das Volumen geht mit. */
    /volume/.test(r.payload || '') && /unit/.test(r.payload || ''),
    JSON.stringify({ text: r.rep && r.rep.text, saetze, calls: r.calls, laenge: r.laenge,
                     payload: (r.payload || '').slice(0, 300) }).slice(0, 800));

  // ── 3) Zweiter Aufruf: dasselbe Objekt, kein zweiter Modellaufruf ─────────
  r = O(await ev(async () => {
    const a = await _crBuild();
    const b = await _crBuild();
    return { gleich: a === b, key: a && a.key, laenge: (S.coachReports || []).length,
             calls: window.__ai.calls, textGleich: !!(a && b && a.text === b.text) };
  }));
  check('await _crBuild() zweimal: derselbe Bericht, S.coachReports.length unveraendert, KEIN zweiter Modellaufruf in derselben Woche',
    r.gleich === true && r.laenge === 1 && r.calls === 1 && r.textGleich === true,
    JSON.stringify(r));

  // ── 4) Hub -> "Woche": Zahlen, Einordnung, Verteilung ────────────────────
  const hub = await hubWoche();
  check('Hub -> Kachel "Woche" (echter Tipp auf den Kachelkopf): Einordnung, die drei Kennzahlen mit Vergleich zur Vorwoche und die Verteilung nach Muskelgruppen stehen da — "Wochen in Folge" NICHT mehr, die Zahl steht schon im Heute-Tab (Gestaltungsregel 8)',
    hub.tab === 'week' && hub.offen === true &&
    /Das Volumen liegt über der Vorwoche/.test(hub.text || '') &&
    /Einheiten/.test(hub.text || '') && /Sätze/.test(hub.text || '') &&
    /Volumen/.test(hub.text || '') && /Vorwoche/.test(hub.text || '') &&
    (hub.pfeile || '').length === 3 &&
    !/Wochen in Folge/.test(hub.text || '') &&
    /Schwerpunkte/.test(hub.text || '') &&
    (hub.musLabels || []).indexOf('Brust') >= 0 && (hub.musLabels || []).indexOf('Rücken') >= 0 &&
    (hub.alt || []).some(a => /Brust/.test(a) && /Rücken/.test(a)) &&
    !/NaN|undefined|\[object/.test(hub.text || '') &&
    !(hub.alt || []).some(a => /NaN|undefined/.test(a)) &&
    (hub.zeilen || []).every(z => z && z.length > 1),
    JSON.stringify({ tab: hub.tab, pfeile: hub.pfeile, mus: hub.musLabels, alt: hub.alt,
                     text: (hub.text || '').slice(0, 420) }).slice(0, 900));

  // ── 5) Ziel gesetzt + stabiler Trend: Ausblick MIT Bedingung ─────────────
  await boot({ antwort: DREI, kurve: 'steigend', ziel: 120 });
  r = O(await ev(async () => {
    const rep = await _crBuild();
    return { fc: rep && rep.forecast, ziel: _crGoal(), wochen: _crHistory('ex0').length };
  }));
  const hubZiel = await hubWoche();
  check('Ziel gesetzt + stabiler Trend: der Ausblick erscheint, nennt Wochen und Ziel und traegt eine BEDINGUNG — keine Zusage',
    !!r.fc && r.fc.weeks > 0 && r.fc.weeks <= 52 && r.fc.goalKg === 120 && !!r.fc.ex &&
    r.wochen >= 4 &&
    /Ausblick/.test(hubZiel.text || '') &&
    /wenn|Wenn/.test(hubZiel.text || '') &&
    !/garantiert|sicher erreichst|wirst du erreichen/i.test(hubZiel.text || '') &&
    !PLATZ.test(hubZiel.text || ''),
    JSON.stringify({ fc: r.fc, wochen: r.wochen, text: (hubZiel.text || '').slice(0, 400) }));

  // ── 6) Ohne Ziel: der Ausblick fehlt VOLLSTAENDIG (kein leerer Rahmen) ────
  await boot({ antwort: DREI, kurve: 'steigend', ziel: 0 });
  await ev(async () => { await _crBuild(); });
  const ohneZiel = await hubWoche();
  // ── und unruhiger Verlauf trotz Ziel: ebenfalls nichts ───────────────────
  await boot({ antwort: DREI, kurve: 'zickzack', ziel: 200 });
  const unruhig = O(await ev(async () => {
    const rep = await _crBuild();
    return { fc: rep && rep.forecast, direkt: CoachReport.goalForecast(_crHistory('ex0'), 200, Date.now()) };
  }));
  const hubUnruhig = await hubWoche();
  check('ohne Ziel / unruhiger Verlauf: der Ausblick fehlt vollstaendig — kein Abschnitt, kein leerer Rahmen, keine erfundene Zahl',
    !/Ausblick|Outlook/.test(ohneZiel.text || '') && (ohneZiel.text || '').length > 40 &&
    unruhig.fc === null && unruhig.direkt === null &&
    !/Ausblick|Outlook/.test(hubUnruhig.text || '') && (hubUnruhig.text || '').length > 40 &&
    !/NaN|undefined/.test((ohneZiel.text || '') + (hubUnruhig.text || '')),
    JSON.stringify({ ohneZiel: (ohneZiel.text || '').slice(0, 200), fc: unruhig.fc,
                     unruhig: (hubUnruhig.text || '').slice(0, 200) }));

  // ── 7) Prognose schweigt aus den drei uebrigen Gruenden ──────────────────
  //     zu wenig Wochen · Ziel bereits erreicht · Fortschritt null
  await boot({ antwort: DREI, wochen: 2, kurve: 'steigend', ziel: 120 });
  const duenn = O(await ev(async () => {
    const rep = await _crBuild();
    return { fc: rep && rep.forecast, wochen: _crHistory('ex0').length, ziel: _crGoal() };
  }));
  const hubDuenn = await hubWoche();
  await boot({ antwort: DREI, kurve: 'steigend', ziel: 62 });      // laengst gehoben
  const erreicht = O(await ev(async () => ({ fc: (await _crBuild()).forecast })));
  await boot({ antwort: DREI, kurve: 'flach', ziel: 120 });        // Steigung 0
  const flach = O(await ev(async () => ({ fc: (await _crBuild()).forecast })));
  check('Prognose ist null (zu wenig Wochen, Ziel erreicht, Fortschritt null): der Nutzer sieht die Zahlen ohne Ausblick — ehrliche Flaeche statt leerer Zeile',
    duenn.fc === null && duenn.ziel === null &&
    erreicht.fc === null && flach.fc === null &&
    !/Ausblick|Outlook/.test(hubDuenn.text || '') &&
    /Einheiten/.test(hubDuenn.text || '') && !/NaN|undefined/.test(hubDuenn.text || ''),
    JSON.stringify({ duenn: duenn.fc, wochen: duenn.wochen, erreicht: erreicht.fc, flach: flach.fc,
                     text: (hubDuenn.text || '').slice(0, 220) }));

  // ── 8) Kein Netz: der Bericht entsteht, text === '', kein Fehler ─────────
  await boot({ antwort: DREI });
  await page.setOfflineMode(true);
  r = O(await ev(async () => {
    const rep = await _crBuild();
    return { rep: rep, calls: window.__ai.calls, laenge: (S.coachReports || []).length,
             gespeichert: (() => { try { return (JSON.parse(localStorage.getItem('ft4') || '{}').coachReports || []).length; } catch (_) { return -1; } })() };
  }));
  const hubOffline = await hubWoche();
  await page.setOfflineMode(false);
  check('Netz getrennt: der Bericht entsteht trotzdem, text === "", kein Modellaufruf, kein Fehler — und der Reiter zeigt die Zahlen statt eines leeren Rahmens',
    !!r.rep && r.rep.text === '' && !!r.rep.numbers && r.calls === 0 &&
    r.laenge === 1 && r.gespeichert === 1 &&
    /Zwischenstand|Interim/.test(hubOffline.text || '') === false &&
    /Einheiten/.test(hubOffline.text || '') && !/NaN|undefined/.test(hubOffline.text || ''),
    JSON.stringify({ text: r.rep && r.rep.text, calls: r.calls, laenge: r.laenge,
                     gespeichert: r.gespeichert, hub: (hubOffline.text || '').slice(0, 240) }));

  // ── 9) Woche ohne Training: null, kein Eintrag, ehrliche Flaeche ─────────
  await boot({ antwort: DREI, wochen: 6, dieseWoche: 0 });
  r = O(await ev(async () => {
    const rep = await _crBuild();
    return { rep: rep, laenge: (S.coachReports || []).length, calls: window.__ai.calls };
  }));
  const hubLeer = await hubWoche();
  check('Woche ohne Training: _crBuild() liefert null, KEIN Eintrag, kein Modellaufruf — der Reiter traegt eine ehrliche Flaeche mit dem naechsten Termin',
    r.rep === null && r.laenge === 0 && r.calls === 0 &&
    /noch keine Einheit/.test(hubLeer.text || '') && /Sonntag/.test(hubLeer.text || '') &&
    !/NaN|undefined|\[object/.test(hubLeer.text || '') &&
    (hubLeer.zeilen || []).every(z => z && z.length > 1),
    JSON.stringify({ rep: r.rep, laenge: r.laenge, text: (hubLeer.text || '').slice(0, 300) }));

  // ── 10) Allererste Woche (gar keine Einheit) und EINE einzige Einheit ────
  await boot({ antwort: DREI, wochen: 0, dieseWoche: 0 });
  const ersteWoche = await hubWoche();
  const ersteBau = O(await ev(async () => ({ rep: await _crBuild(), laenge: (S.coachReports || []).length })));
  await boot({ antwort: DREI, wochen: 0, dieseWoche: 1 });
  const eineEinheit = O(await ev(async () => {
    const rep = await _crBuild();
    return { rep: rep, w: rep && rep.numbers.workouts, s: rep && rep.numbers.sets,
             prev: rep && rep.numbers.prevVol, delta: rep && rep.numbers.volDelta };
  }));
  const hubEine = await hubWoche();
  check('Allererste Woche und eine einzige Einheit: keine leere Zeile, kein NaN, kein undefined — und ohne Vorwoche steht KEIN Pfeil und kein Prozent statt einer erfundenen Steigerung',
    ersteBau.rep === null && ersteBau.laenge === 0 &&
    /noch keine Einheit/.test(ersteWoche.text || '') && !/NaN|undefined/.test(ersteWoche.text || '') &&
    !!eineEinheit.rep && eineEinheit.w === 1 && eineEinheit.s === 9 && eineEinheit.prev === 0 &&
    (hubEine.pfeile || '') === '' && !/%/.test(hubEine.text || '') &&
    !/NaN|undefined|\[object/.test(hubEine.text || '') &&
    (hubEine.zeilen || []).every(z => z && z.length > 1),
    JSON.stringify({ erste: (ersteWoche.text || '').slice(0, 160), eine: eineEinheit.w,
                     hub: (hubEine.text || '').slice(0, 260) }));

  // ── 11) Termin in einer Stunde: die Meldung traegt die ECHTE Zusammenfassung ─
  await boot({ antwort: DREI });
  r = O(await ev(async () => {
    const d = new Date(window.__NOW);
    S.coachReportAt = { day: d.getDay(), hour: d.getHours() + 1 };   // in einer Stunde
    persist();
    window.__cnReset([{ id: 2500, title: 'Pause vorbei' }]);
    _crMaybePrepare();
    await new Promise(res => setTimeout(res, 900));
    const pend = window.__cnPending.filter(n => Number(n.id) >= 47000 && Number(n.id) <= 47999);
    return {
      termin: _cnReportAt(window.__NOW) - window.__NOW,
      berichte: (S.coachReports || []).length,
      text: ((S.coachReports || [])[0] || {}).text || '',
      bodies: pend.map(n => ({ kind: n.extra && n.extra.coachKind, body: n.body })),
      calls: window.__ai.calls
    };
  }));
  const bericht = (r.bodies || []).filter(b => b.kind === 'report')[0] || {};
  check('S.coachReportAt "in einer Stunde" + _crMaybePrepare(): getPending() traegt die ECHTE Zusammenfassung als body, nicht "Dein Bericht ist fertig"',
    r.berichte === 1 && r.calls === 1 &&
    /^Vier Einheiten und 18 Sätze stehen\.$/.test((bericht.body || '').trim()) &&
    !/Wochenbericht verfügbar|liegt bereit|Wochenbericht da/.test(bericht.body || '') &&
    !PIKTO.test(bericht.body || ''),
    JSON.stringify({ termin: r.termin, berichte: r.berichte, bodies: r.bodies }).slice(0, 600));

  // ── 12) Rueckfall: ohne fertigen Text bleibt der Einladungstext stehen ───
  r = O(await ev(async () => {
    S.coachReports = []; persist();
    window.__cnReset([{ id: 2500, title: 'Pause vorbei' }]);
    await _cnSync();
    const pend = window.__cnPending.filter(n => (n.extra || {}).coachKind === 'report');
    return { body: (pend[0] || {}).body || '' };
  }));
  check('Rueckfall wie im Brief beschrieben: ohne fertigen Text plant _cnSync() den Einladungstext aus dem Katalog — die Meldung faellt nie aus',
    /Wochenbericht/.test(r.body || '') && (r.body || '').length > 10 && !PIKTO.test(r.body || ''),
    JSON.stringify(r));

  // ── 13) Neun Wochen: das Archiv steht bei acht, neueste zuerst ───────────
  await boot({ antwort: DREI, wochen: 9, dieseWoche: 1 });
  r = O(await ev(async () => {
    // Neun Kalenderwochen nacheinander erzeugen, indem die Uhr Woche fuer
    // Woche vorrueckt. Jede Woche traegt eine Einheit aus dem Grundzustand.
    const basis = window.__NOW;
    for (let w = 9; w >= 1; w--) { window.__NOW = basis - w * 7 * 864e5; await _crBuild(); }
    window.__NOW = basis;
    await _crBuild();
    const keys = (S.coachReports || []).map(x => x.weekKey);
    return { laenge: keys.length, keys: keys, sortiert: keys.slice().sort().reverse().join(',') === keys.join(','),
             gespeichert: (() => { try { return (JSON.parse(localStorage.getItem('ft4') || '{}').coachReports || []).length; } catch (_) { return -1; } })() };
  }));
  check('Neun Wochen kuenstlich angelegt: S.coachReports.length === 8, neueste zuerst, und auch im Speicher stehen acht (persist(), nicht save())',
    r.laenge === 8 && r.sortiert === true && r.gespeichert === 8,
    JSON.stringify(r).slice(0, 500));

  // ── 14) Bericht-Meldung antippen: der Hub oeffnet auf "Woche" ────────────
  await boot({ antwort: DREI });
  r = O(await ev(async () => {
    const cbs = (window.__cnListeners || {})['localNotificationActionPerformed'] || [];
    const vorher = (S.coachReports || []).length;
    cbs.forEach(cb => { try { cb({ notification: { extra: { coachKind: 'report' } } }); } catch (_) {} });
    await new Promise(res => setTimeout(res, 700));
    const ov = document.getElementById('ov-coach-hub');
    return { listener: cbs.length, vorher: vorher, nachher: (S.coachReports || []).length,
             offen: !!(ov && ov.classList.contains('on')), tab: _chOpen,
             aufgeklappt: !!(document.getElementById('ch-card-week') || { classList: { contains: () => false } }).classList.contains('on'),
             body: (document.getElementById('ch-card-week') || {}).textContent || '' };
  }));
  check('Bericht-Meldung antippen: ein Listener auf localNotificationActionPerformed ist verdrahtet, _crBuild() wird nachgeholt und der Hub oeffnet mit AUFGEKLAPPTER Kachel "Woche"',
    r.listener >= 1 && r.offen === true && r.tab === 'week' && r.aufgeklappt === true &&
    r.vorher === 0 && r.nachher === 1 && /Einheiten/.test(r.body || ''),
    JSON.stringify({ listener: r.listener, offen: r.offen, tab: r.tab,
                     vorher: r.vorher, nachher: r.nachher }).slice(0, 400));

  /* ── 15) Alle vier Toene, beide Sprachen, beide Einheiten ────────────────
     Gemessen wird der SATZ, den der Nutzer sieht: forecastSay() liefert den
     Schluessel, _csVars() haengt die Einheit an den WERT, der Katalog fuellt.
     Deshalb laeuft die Runde zweimal — einmal kg, einmal lbs. Der Katalog
     darf in keinem der 16 Faelle eine eigene Einheit mitbringen; genau das war
     bis zu dieser Task der Fall ('{kg} kg', '{kg} Kilo'). */
  r = O(await ev(() => {
    const runde = (einheit) => {
      S.unitMode = einheit;
      const raus = [];
      ['ruhig', 'sachlich', 'hart', 'locker'].forEach(tone => ['de', 'en'].forEach(lang => {
        const say  = CoachReport.forecastSay({ weeks: 7, goalKg: 120 }, 'Bankdrücken');
        const vars = _csVars(say ? say.vars : {});
        raus.push({ tone: tone, lang: lang, s: CoachPersona.say('forecast', vars, CoachPersona.personaGet({ tone: tone }), lang) });
      }));
      return raus;
    };
    const kg = runde('kg'), lbs = runde('lbs');
    S.unitMode = 'kg'; persist();
    return { kg: kg, lbs: lbs };
  }));
  const satzOk = (liste, einheit, verboten) => Array.isArray(liste) && liste.length === 8 &&
    liste.every(x => x.s && x.s.trim().length > 12 && !PLATZ.test(x.s) && !PIKTO.test(x.s) &&
      /wenn|Wenn|if|If/.test(x.s) &&
      !/garantiert|guaranteed|versprech|promise/i.test(x.s) &&
      new RegExp('\\b' + einheit + '\\b').test(x.s) &&
      !new RegExp('\\b' + verboten + '\\b').test(x.s));
  check('Der Prognose-Satz in allen vier Toenen, beiden Sprachen und beiden Einheiten: nie leer, keine {platzhalter}-Reste, eine Bedingung in jedem Ton — und die Einheit haengt am Wert (lbs-Nutzer sieht nie kg)',
    satzOk(r.kg, 'kg', 'lbs') && satzOk(r.lbs, 'lbs', 'kg'),
    JSON.stringify(r).slice(0, 1000));

  // ── 16) lbs-Nutzer: keine kg-Zahl im Bericht ─────────────────────────────
  await boot({ antwort: null, kurve: 'steigend', ziel: 120 });   // ohne Modelltext: nur eigene Ausgabe
  await ev(async () => { S.unitMode = 'lbs'; persist(); await _crBuild(); });
  const hubLbs = await hubWoche();
  check('S.unitMode = "lbs": im ganzen Bericht steht keine kg-Zahl — Zahlen, Vergleich, Bestwerte, Ausblick und Schwerpunkte tragen lbs',
    /lbs/.test(hubLbs.text || '') && !/\bkg\b/i.test(hubLbs.text || '') &&
    /Ausblick/.test(hubLbs.text || '') && /Schwerpunkte/.test(hubLbs.text || '') &&
    !/NaN|undefined/.test(hubLbs.text || ''),
    JSON.stringify({ text: (hubLbs.text || '').slice(0, 500) }));

  // ── 17) Uebungsname mit Markup erscheint als TEXT ────────────────────────
  await boot({ antwort: null, kurve: 'steigend', ziel: 120 });
  r = O(await ev(async () => {
    window.__xss = 0;
    S.exercises[0].name = '<img src=x onerror="window.__xss=1">Bankdrücken';
    S.unitMode = 'kg';
    persist();
    await _crBuild();
    return { ok: true };
  }));
  const hubXss = await hubWoche();
  const xss = O(await ev(() => ({ xss: window.__xss,
    imgs: (document.getElementById('ch-card-week') || document.createElement('div')).querySelectorAll('img').length })));
  check('Uebungsname mit Markup erscheint als TEXT, nicht als Markup (esc() vor innerHTML) — kein onerror laeuft, weder im Ausblick noch bei den Bestwerten',
    xss.xss === 0 && xss.imgs === 0 && !/<img/i.test(hubXss.html || '') &&
    /<img src=x onerror/.test(hubXss.text || ''),
    JSON.stringify({ xss: xss.xss, imgs: xss.imgs, roh: /<img/i.test(hubXss.html || ''),
                     text: (hubXss.text || '').slice(0, 240) }));

  // ── 18) Heute-Tab: danach genauso viele Flaechen wie vorher ──────────────
  // Gestaltungsregel 1: EIN Einstieg im Heute-Tab. Der Bericht wohnt im Hub;
  // die Startseite bekommt keine Karte, keine Zeile, keine Kachel dazu.
  await boot({ antwort: DREI });
  const vorFlaechen = O(await ev(() => {
    try { renderHome(); } catch (_) {}
    return { pad: document.querySelectorAll('#heute-pad > div').length,
             grid: document.querySelectorAll('#heute-grid > *').length,
             coach: document.querySelectorAll('#coach-today-card .aic').length,
             cr: document.querySelectorAll('#pg-heute [id^="cr-"], #pg-heute [class*="cr-"]').length };
  }));
  const nachFlaechen = O(await ev(async () => {
    await _crBuild();
    // Einmal oeffnen, damit die Kacheln gezeichnet sind und gezaehlt werden
    // koennen — danach wieder zu, gemessen wird der Heute-Tab.
    try { openCoachHub('week'); } catch (_) {}
    const hubKacheln = document.querySelectorAll('#ch-body .ch-card').length;
    const hubTabs = document.querySelectorAll('.ch-tabs, .ch-tab').length;
    try { closeOv('ov-coach-hub'); } catch (_) {}
    try { renderHome(); } catch (_) {}
    return { hubKacheln, hubTabs,
             pad: document.querySelectorAll('#heute-pad > div').length,
             grid: document.querySelectorAll('#heute-grid > *').length,
             coach: document.querySelectorAll('#coach-today-card .aic').length,
             cr: document.querySelectorAll('#pg-heute [id^="cr-"], #pg-heute [class*="cr-"]').length,
             tabs: document.querySelectorAll('.tabbar .tab').length };
  }));
  check('Heute-Tab hat nach dem Bericht genauso viele Flaechen wie vorher: zwei Flaechen unter der Kopfzeile, EIN Coach-Einstieg, kein fuenfter Tab, keine sechste Hub-Kachel',
    vorFlaechen.pad === 2 && nachFlaechen.pad === 2 &&
    vorFlaechen.grid === nachFlaechen.grid && vorFlaechen.coach === nachFlaechen.coach &&
    vorFlaechen.coach <= 1 && nachFlaechen.cr === 0 && vorFlaechen.cr === 0 &&
    nachFlaechen.tabs === 5 && nachFlaechen.hubTabs === 0 && nachFlaechen.hubKacheln === 5,
    JSON.stringify({ vorFlaechen, nachFlaechen }));

  // ── 19) Beleg: Screenshot des Wochen-Reiters ─────────────────────────────
  await boot({ antwort: DREI, kurve: 'steigend', ziel: 120 });
  try {
    await ev(async () => { await _crBuild(); });
    const sicht = await hubWoche();
    await page.screenshot({ path: SHOT });
    check('Screenshot des Wochen-Reiters mit Zahlen, Einordnung, Ausblick und Schwerpunkten geschrieben',
      fs.existsSync(SHOT) && fs.statSync(SHOT).size > 5000 &&
      /Ausblick/.test(sicht.text || '') && /Schwerpunkte/.test(sicht.text || ''),
      SHOT + ' ' + (sicht.text || '').slice(0, 200));
  } catch (e) { check('Screenshot des Wochen-Reiters geschrieben', false, String(e.message)); }

  await browser.close();
  server.close();

  // ── 20) Statisch: persist() statt save(), ISO-Woche nicht gemischt ───────
  try {
    const src = fs.readFileSync(SRC, 'utf8');
    const a = src.indexOf('/* ── Woche: der Wochenbericht (Block 5, Task 21)');
    const b = src.indexOf('// ── Bausteine der Kacheln', a > 0 ? a : 0);
    const block = a > 0 && b > a ? src.slice(a, b) : '';
    const code = ohneKommentar(block);
    check('Statisch: der Task-21-Block nutzt persist() und nirgends save(); die Woche laeuft nur ueber CoachAnalyze.isoWeekKey — getWeekKey() (Altformat) wird nicht gemischt',
      block.length > 6000 &&
      !/[^a-zA-Z_$.]save\s*\(/.test(code) &&
      (code.match(/persist\(\)/g) || []).length >= 2 &&
      /CoachAnalyze\.isoWeekKey/.test(code) && !/getWeekKey/.test(code) &&
      (code.match(/catch\s*\(/g) || []).length >= 14 &&
      !PIKTO.test(block.replace(/\u2715/g, '')),
      JSON.stringify({ len: block.length, save: /[^a-zA-Z_$.]save\s*\(/.test(code),
                       persist: (code.match(/persist\(\)/g) || []).length,
                       iso: /CoachAnalyze\.isoWeekKey/.test(code),
                       alt: /getWeekKey/.test(code),
                       emoji: PIKTO.test(block.replace(/\u2715/g, '')) }).slice(0, 600));
  } catch (e) { check('Statisch: persist() statt save(), ISO-Woche nicht gemischt', false, String(e.message)); }

  // ── 21) Statisch: kein zweiter Schreibpfad, kein zweiter Endpunkt ────────
  try {
    const src = fs.readFileSync(SRC, 'utf8');
    const i = src.indexOf('const payload = {');
    const payload = i > 0 ? src.slice(i, i + 2200) : '';
    const modul = fs.readFileSync(path.join(ROOT, 'js', 'coach-report.js'), 'utf8');
    const rulesJetzt = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
    const rulesHead  = gitZeigen('firestore.rules');
    const a = src.indexOf('/* ── Woche: der Wochenbericht (Block 5, Task 21)');
    const b = src.indexOf('// ── Bausteine der Kacheln', a > 0 ? a : 0);
    const code = ohneKommentar(a > 0 && b > a ? src.slice(a, b) : '');
    check('Statisch: S.coachReports steht NICHT im Cloud-Payload, firestore.rules unveraendert, kein fetch und kein zweiter Endpunkt im Block, kein Netzaufruf im Modul',
      payload.length > 500 && !/coachReports|coachReportAt/.test(payload) &&
      rulesHead !== null && rulesJetzt.replace(/\r\n/g, '\n') === rulesHead.replace(/\r\n/g, '\n') &&
      !/fetch\s*\(|XMLHttpRequest|AI_WORKER_URL/.test(code) && /aiCall\('chat'/.test(code) &&
      !/fetch\s*\(|XMLHttpRequest|AI_WORKER_URL|firestore|setDoc/.test(modul),
      JSON.stringify({ imPayload: /coachReports/.test(payload), rulesGleich: rulesHead !== null &&
                       rulesJetzt.replace(/\r\n/g, '\n') === rulesHead.replace(/\r\n/g, '\n'),
                       fetchImBlock: /fetch\s*\(/.test(code), chat: /aiCall\('chat'/.test(code) }).slice(0, 500));
  } catch (e) { check('Statisch: kein zweiter Schreibpfad, kein zweiter Endpunkt', false, String(e.message)); }

  // ── 22) Statisch: der Prompt schreibt drei Saetze und keine Zusage vor ───
  try {
    const src = fs.readFileSync(SRC, 'utf8');
    const i = src.indexOf('async function _crAskModel');
    // 3600 statt 2600: die Funktion traegt seit der Abschluss-Review von Block 5
    // die Umrechnung ueber kgToDisp() samt Begruendung und einen Satz mehr im
    // Auftrag (die Einheit steht im Feld 'unit'). Geprueft wird unveraendert
    // dasselbe — nur reicht der alte Ausschnitt nicht mehr bis zum Schluss.
    const fn = i > 0 ? src.slice(i, i + 3600) : '';
    check('Statisch: _crAskModel schickt personaLine + die Vorgabe "genau drei Saetze, keine Emojis, keine Zusagen" und keinen Vorschlag zum Trainingsplan',
      fn.length > 400 && /personaLine/.test(fn) &&
      /[Gg]enau drei Sätze/.test(fn) && /Exactly three sentences/.test(fn) &&
      /keine Emojis/.test(fn) && /no emojis/.test(fn) &&
      /keine Zusagen über die Zukunft/.test(fn) && /no promises about the future/.test(fn) &&
      /Änderung des Trainingsplans/.test(fn) && /change to the training plan/.test(fn),
      JSON.stringify({ len: fn.length, persona: /personaLine/.test(fn),
                       drei: /[Gg]enau drei Sätze/.test(fn) }).slice(0, 400));
  } catch (e) { check('Statisch: Prompt-Vorgabe steht im Code', false, String(e.message)); }

  console.log('\n-- Task 21 — Wochenbericht erzeugt, geplant, angezeigt (Chromium statt Simulator) --');
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
