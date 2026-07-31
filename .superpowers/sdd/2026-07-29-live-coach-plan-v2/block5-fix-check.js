/* Abschluss-Review Block 5 — Verifikation der Behebungen (Windows, kein Xcode).

   Ein Check je Befund, plus die fuenf Testluecken, die die Review als
   ueberlebende Mutationen bzw. als ganz ungetestete Zusicherung benannt hat:

     C1  Kontowechsel waehrend eines laufenden _cnSync() — zeitabhaengig, nicht
         mutationsabhaengig. Das LocalNotifications-Doppel bekommt dafuer eine
         einstellbare Bruecken-Latenz (die Review hat 400 ms benutzt); der
         Wechsel faellt 120 ms nach _cnSync() mitten in den Lauf.
     W1  Der Modelltext des Berichts nennt lbs-Nutzern kg.
     W2  Scheitert die Nachkontrolle der Meldungsraeumung, bleibt es still.
     W3  Konto B sieht A's Chatverlauf und kann dessen Planvorschlag importieren.
     P   Die Persona ueberlebt den Kontowechsel (Firestore) — inkl. der
         Reihenfolge Raeumung-vor-Merge, gegen die Gegenprobe gefahren.
     M1-M4 die vier ueberlebenden Mutationen.

   Eigener Port: 8802 (8793-8801 und 8917 belegt).

   Aufruf:
     node block5-fix-check.js              gegen den Arbeitsstand
     node block5-fix-check.js --root=<dir> gegen einen anderen Baum (Rot-Lauf
                                           gegen den Stand VOR der Aenderung)  */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const puppeteer = require('C:/Users/Anwender/Desktop/Claude/gymtrack/node_modules/puppeteer');

const REPO = 'C:/Users/Anwender/Desktop/Claude/gymtrack';
const argRoot = (process.argv.find(a => a.startsWith('--root=')) || '').slice(7);
const ROOT = argRoot ? path.resolve(argRoot) : REPO;
const SRC  = path.join(ROOT, 'index.html');
const PORT = 8802;
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

// Kommentare entfernen — die statischen Pruefungen lesen den CODE, nicht die
// Erklaerungen darin (der Doppelpunkt-Riegel laesst 'https://' stehen).
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
// Rot-Lauf: dort fehlen Funktionen, die es erst nach der Aenderung gibt. Die
// Pruefungen sollen dann ROT sein, nicht den Harness abschiessen.
const O = (x) => (x && !x.__err) ? x : { fehler: (x && x.__err) || 'kein Ergebnis' };

/* ── Die Doppel ───────────────────────────────────────────────────────────
   LocalNotifications wie in task-19/21/22-check.js, aber mit window.__lat:
   jede Bruecken-Runde wartet erst. Nur so ist ein Kontowechsel MITTEN in
   _cnSyncRun ueberhaupt messbar. */
const STUB = () => {
  window.__lat = 0;
  window.__cnFailPending = false;
  window.__cnFailCancel  = false;
  const warte = () => (window.__lat > 0 ? new Promise(r => setTimeout(r, window.__lat)) : Promise.resolve());
  window.__cn = { schedule: [], cancel: [], perm: 'granted' };
  window.__cnPending = [];
  window.__cnListeners = {};
  window.__cnReset = function (pending) {
    window.__cn.schedule = []; window.__cn.cancel = [];
    window.__cnPending = (pending || []).slice();
  };
  const LN = {
    checkPermissions: async () => { await warte(); return { display: window.__cn.perm }; },
    requestPermissions: async () => { await warte(); return { display: window.__cn.perm }; },
    createChannel: async () => { await warte(); },
    getPending: async () => {
      await warte();
      if (window.__cnFailPending) throw new Error('LocalNotifications: getPending nicht verfuegbar');
      return { notifications: window.__cnPending.map(n => Object.assign({}, n)) };
    },
    schedule: async (o) => {
      await warte();
      window.__cn.schedule.push(o);
      ((o && o.notifications) || []).forEach(n => window.__cnPending.push(Object.assign({}, n)));
      return { notifications: (o && o.notifications) || [] };
    },
    cancel: async (o) => {
      await warte();
      if (window.__cnFailCancel) throw new Error('LocalNotifications: cancel nicht verfuegbar');
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

  // console.error mitschreiben — daran haengt "eine Raeumung, die scheitert,
  // ist laut" (Wichtig 2).
  window.__errs = [];
  const _oe = console.error;
  console.error = function () {
    try { window.__errs.push(Array.prototype.slice.call(arguments).map(String).join(' ')); } catch (_) {}
    try { _oe.apply(console, arguments); } catch (_) {}
  };
};

/* Firebase-Doppel. Anders als in task-22-check.js haelt es auch die
   NUTZER-Dokumente (users/<uid>) — daran haengt die Persona-Synchronisierung.
   Jeder Schreibzugriff wird mitgeschrieben: "kein zweiter Schreibpfad". */
const FBSTUB = () => {
  window.__fbWrites = [];
  window.__cloud = { dossier: {}, user: {} };
  const refOf = (a, b) => ({ path: (b === undefined) ? String(a) : (String(a) + '/' + String(b)) });
  window.FB = {
    configured: true,
    auth: { currentUser: null },
    doc: refOf,
    userDocRef: (uid) => refOf('users/' + uid),
    serverTimestamp: () => 0,
    collection: (p) => refOf(p),
    query: () => ({}), where: () => ({}), orderBy: () => ({}), limit: () => ({}),
    getDocs: async () => ({ empty: true, docs: [], forEach(){} }),
    addDoc: async (ref) => { window.__fbWrites.push('add ' + (ref && ref.path)); return refOf('x/y'); },
    increment: (n) => n,
    getDoc: async (ref) => {
      const d = /^users\/([^/]+)\/coach\/dossier$/.exec(ref.path);
      if (d) { const x = window.__cloud.dossier[d[1]]; return { exists: () => !!x, data: () => x }; }
      const u = /^users\/([^/]+)$/.exec(ref.path);
      if (u) { const x = window.__cloud.user[u[1]]; return { exists: () => !!x, data: () => x }; }
      return { exists: () => false, data: () => null };
    },
    setDoc: async (ref, data) => {
      window.__fbWrites.push('set ' + ref.path);
      const kopie = JSON.parse(JSON.stringify(data || {}));
      const d = /^users\/([^/]+)\/coach\/dossier$/.exec(ref.path);
      if (d) { window.__cloud.dossier[d[1]] = kopie; return; }
      const u = /^users\/([^/]+)$/.exec(ref.path);
      if (u) { window.__cloud.user[u[1]] = kopie; }
    },
    updateDoc: async (ref) => { window.__fbWrites.push('update ' + ref.path); },
    deleteDoc: async (ref) => {
      window.__fbWrites.push('delete ' + ref.path);
      const d = /^users\/([^/]+)\/coach\/dossier$/.exec(ref.path);
      if (d) delete window.__cloud.dossier[d[1]];
    },
    onSnapshot: () => (() => {}),
    startPresence: () => {}, stopPresence: () => {},
    signOut: async () => { window.__authTo(null); }
  };
  // Der Auth-Weg der App in EINER Funktion — dieselbe Reihenfolge wie in
  // onAuthStateChanged: _coachHandleAuthUser VOR _onLogin/_onLogout.
  window.__authTo = (uid) => {
    const user = uid ? { uid: uid, isAnonymous: false, email: uid + '@example.test', displayName: uid } : null;
    _coachHandleAuthUser(user);
    _fbUser = user;
    window.FB.auth.currentUser = user;
    try { updateAccountUI(); } catch (_) {}
  };
  // Der VOLLE Anmeldeweg inkl. Cloud-Merge: _coachHandleAuthUser (Raeumung),
  // danach _onLogin (Merge + Push). Genau die Reihenfolge, an der die
  // Persona-Erweiterung haengt.
  window.__loginEcht = async (uid) => {
    const user = { uid: uid, isAnonymous: false, email: uid + '@example.test', displayName: uid };
    _coachHandleAuthUser(user);
    await _onLogin(user);
  };
  // Gegenprobe: DIESELBEN zwei Schritte in der FALSCHEN Reihenfolge.
  window.__loginFalscheReihenfolge = async (uid) => {
    const user = { uid: uid, isAnonymous: false, email: uid + '@example.test', displayName: uid };
    await _onLogin(user);
    _coachHandleAuthUser(user);
  };
};

// Voller Coach-Zustand von Konto A.
const KONTO_A = (uid) => {
  window.isPremium = () => true;
  window._crSignedIn = () => true;
  const gate = document.getElementById('auth-gate'); if (gate) gate.style.display = 'none';
  const NOW = Date.now();
  window.__authTo(uid);
  _initialMergeDone = true;

  window.__ai = { calls: 0, payloads: [] };
  window.__aiAntwort = 'Vier Einheiten stehen. Das Volumen ist gestiegen. Weiter so.';
  window.aiCall = async (kind, payload) => {
    window.__ai.calls++;
    window.__ai.payloads.push({ kind: kind, payload: payload });
    return window.__aiAntwort === null ? null : { text: window.__aiAntwort };
  };

  S.exercises = [{ id:'ex0', name:'Bankdrücken', muscleGroup:'brust', targetSets:3, targetReps:8 }];
  S.sessions  = [{ id:'s1', date:new Date(NOW - 864e5).toISOString(), duration:3300,
                   logs:[{ exerciseId:'ex0', sets:[{ w:60, r:8, type:'normal' }] }] }];
  S.notifEnabled = true;
  S.unitMode = 'kg';

  S.aiCoach = { live:true, insights:true, name:'Nina', tone:'hart', voice:'de-DE-1', voiceOn:true,
                inTraining:'full', setFeedback:true, pushLevel:'eng', preset:'close' };
  S.coachSession = { wkTs: NOW, spoken: 5, acks: 3, said: { greet:1 }, ended:false,
                     rests: [90], reps: [8], setCount: 6, lastTick: NOW };
  S.coachPush = { state: { sentTs: { reminderPlan: NOW - 3600e3 }, day:'2026-07-30', dayCount:2, weekCount:6 },
                  plan: [{ id:'reminderPlan:2026-08-01', at: NOW + 864e5, kind:'reminderPlan' },
                         { id:'report:2026-08-02',      at: NOW + 2 * 864e5, kind:'report' }],
                  permOk: true, owns: true };
  S.coachReports = [{ weekKey:'2026-W31', label:'KW 31 · 27. Jul – 2. Aug',
                      numbers:{ workouts:4, sets:18, vol:12345, prevVol:11000, volDelta:1345, prs:[], streak:3, muscles:{ brust:5000 } },
                      text:'Vier Einheiten und 18 Sätze stehen.', forecast:null, ts: NOW }];
  S.coachReportAt = { day: 2, hour: 21 };
  S.coachLog = [{ ts: NOW, kind:'deload', exId:'ex0', accepted:false }];
  try { _coachMicroLast = 'brust'; } catch (_) {}
  try { _chTab = 'report'; } catch (_) {}

  _aicHist = [{ role:'user', content:'Ich habe Knieprobleme' }, { role:'assistant', content:'Verstanden, Konto-A-Antwort.' }];
  localStorage.setItem('gt_aiChat', JSON.stringify(_aicHist));
  localStorage.setItem('gt_aiQuota', JSON.stringify({ limit:150, used:87 }));
  try { _aicPlanPending = { days: [{ name:'Push A', exercises:[{ name:'Bankdrücken', sets:3, reps:8 }] }] }; } catch (_) {}
  try { _aiaActions = [{ label:'Bankdrücken ergänzen', kind:'add', exercise:'Bankdrücken' }]; } catch (_) {}
  try { _aiaScope = { preset:'p1' }; } catch (_) {}

  persist();
  window.__cnReset([
    { id: 2500,  title:'Pause vorbei' },
    { id: 1001,  title:'Zeit fürs Training!' },
    { id: 47000, title:'Nina', body:'Trainingstag: Bankdrücken', extra:{ coachKind:'reminderPlan' } },
    { id: 47501, title:'Nina', body:'Deine Woche', extra:{ coachKind:'report' } }
  ]);
  return { name: S.aiCoach.name, plan: S.coachPush.plan.length, uid: _coachLastUid };
};

// Was nach einem Wechsel NICHT mehr dastehen darf.
const ZUSTAND = () => {
  let gespeichert = {};
  try { gespeichert = JSON.parse(localStorage.getItem('ft4') || '{}'); } catch (_) {}
  const push = S.coachPush;
  return {
    push: push ? JSON.parse(JSON.stringify(push)) : null,
    gespeicherterPush: gespeichert.coachPush || null,
    zaehlerA: !!(push && push.state && (push.state.dayCount === 2 || push.state.weekCount === 6 ||
               (push.state.sentTs && push.state.sentTs.reminderPlan))),
    zaehlerAImSpeicher: !!(gespeichert.coachPush && gespeichert.coachPush.state &&
               (gespeichert.coachPush.state.dayCount === 2 || gespeichert.coachPush.state.weekCount === 6)),
    pending: (window.__cnPending || []).map(n => Number(n.id)).sort((a, b) => a - b),
    eigene: (window.__cnPending || []).filter(n => Number(n.id) >= 47000 && Number(n.id) <= 47999).length,
    name: (function () { try { return _coachName(); } catch (_) { return 'ERR'; } })(),
    aiCoach: S.aiCoach ? JSON.parse(JSON.stringify(S.aiCoach)) : null,
    tab: (typeof _chTab === 'string') ? _chTab : null,
    micro: (typeof _coachMicroLast === 'undefined') ? 'undefined' : _coachMicroLast,
    planPending: (typeof _aicPlanPending === 'undefined') ? 'undefined' : _aicPlanPending,
    aiaActions: (typeof _aiaActions === 'undefined') ? 'undefined' : (_aiaActions || []).length,
    aiaScope: (typeof _aiaScope === 'undefined') ? 'undefined' : _aiaScope,
    hist: (typeof _aicHist !== 'undefined' && Array.isArray(_aicHist)) ? _aicHist.length : -1,
    log: (document.getElementById('aic-log') || {}).innerHTML || '',
    aiaBody: (document.getElementById('aia-body') || {}).innerHTML || '',
    errs: (window.__errs || []).slice(),
    toast: (document.getElementById('update-toast') || {}).textContent || '',
    schreibpfade: (window.__fbWrites || []).slice()
  };
};

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  // Feste Zeitzone: die Donnerstag-12:00-Normalisierung in _crWeekKey ist genau
  // die Zusicherung, die in UTC+2 traegt (Mutation 2).
  try { await page.emulateTimezone('Europe/Berlin'); } catch (_) {}
  await page.evaluateOnNewDocument(STUB);
  page.on('dialog', async d => { try { await d.accept(); } catch (_) {} });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  const ev = async (fn, arg) => {
    try { return (arg === undefined) ? await page.evaluate(fn) : await page.evaluate(fn, arg); }
    catch (e) { return { __err: String((e && e.message) || e).slice(0, 240) }; }
  };
  const boot = async (uid) => {
    errors.length = 0;
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 60000 });
    await ev(() => { try { localStorage.clear(); } catch (_) {} });
    await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
    await wait(3300);                       // Start plant bei 1200 ms, Bericht bei 2500 ms
    await ev(FBSTUB);
    return await ev(KONTO_A, uid || 'uidA');
  };
  let r;

  /* ══ C1 — Kontowechsel MITTEN im _cnSync() ══════════════════════════════
     400 ms Bruecken-Latenz, Wechsel 120 ms nach dem Anstoss. Der Lauf hat st
     und alt dann schon aus S.coachPush von Konto A gelesen und haengt in
     _cnCancelOwn/checkPermissions.                                          */
  await boot('uidA');
  await ev(() => {
    window.__lat = 400;
    _cnSync();                              // bewusst OHNE await — wie im echten Aufrufer
    setTimeout(() => { window.__authTo('uidB'); }, 120);
  });
  await wait(6000);
  const c1 = O(await ev(ZUSTAND));
  check('C1 — Kontowechsel 120 ms nach _cnSync() (400 ms Bruecken-Latenz): der laufende Lauf schreibt die Zaehler von Konto A NICHT zurueck. S.coachPush bleibt geraeumt, dayCount/weekCount/sentTs.reminderPlan von A sind weg — im Speicherobjekt UND in ft4',
    c1.zaehlerA === false && c1.zaehlerAImSpeicher === false &&
    (c1.push === null || !c1.push.state),
    JSON.stringify({ push: c1.push, gespeichert: c1.gespeicherterPush }).slice(0, 700));

  check('C1 — und der Lauf plant die 47xxx nicht NACH dem Abbestellen neu: nach dem Wechsel steht kein Termin 47000-47999 mehr, der Pausen-Timer (2500) laeuft weiter',
    c1.eigene === 0 && Array.isArray(c1.pending) && c1.pending.indexOf(2500) >= 0,
    JSON.stringify({ pending: c1.pending, eigene: c1.eigene }));

  /* Zweites Fenster, damit nicht nur EIN Zeitpunkt gemessen ist: 2200 ms nach
     dem Anstoss haengt der Lauf nicht mehr im Abbestellen, sondern hinter
     seinem letzten Schreibzugriff im abschliessenden
     scheduleWorkoutNotifications(). Diese Lage war auch vor der Aenderung
     unauffaellig (der Lauf schreibt danach nichts mehr, die synchrone Null der
     Raeumung gewinnt) — die Pruefung haelt das fest, damit eine spaetere
     Zeile hinter dem letzten Riegel nicht unbemerkt wieder eine wird. Der
     finally-Block in _cnSyncRun deckt genau diesen Fall ab; nachgewiesen wird
     er statisch, weil er sich hier bewusst NICHT beobachten laesst.          */
  await boot('uidA');
  await ev(() => {
    window.__lat = 400;
    _cnSync();
    setTimeout(() => { window.__authTo('uidB'); }, 2200);
  });
  await wait(6000);
  const c1b = O(await ev(ZUSTAND));
  check('C1 — zweites Fenster: Kontowechsel 2200 ms nach _cnSync(), also hinter dem letzten Schreibzugriff des Laufs und mitten im abschliessenden scheduleWorkoutNotifications() — auch dieser Ausgang laesst S.coachPush geraeumt zurueck und keinen 47xxx-Termin stehen',
    c1b.zaehlerA === false && c1b.zaehlerAImSpeicher === false &&
    (c1b.push === null || !c1b.push.state) && c1b.eigene === 0,
    JSON.stringify({ push: c1b.push, gespeichert: c1b.gespeicherterPush, pending: c1b.pending }).slice(0, 700));

  /* Gegenprobe: OHNE Wechsel muss derselbe Lauf ganz normal durchgehen —
     sonst waere der Riegel ein Denial-of-Service gegen die eigene Planung. */
  await boot('uidA');
  r = O(await ev(async () => {
    window.__lat = 50;
    await _cnSync();
    return { push: S.coachPush ? JSON.parse(JSON.stringify(S.coachPush)) : null,
             eigene: (window.__cnPending || []).filter(n => Number(n.id) >= 47000 && Number(n.id) <= 47999).length };
  }));
  check('C1 Gegenprobe — ohne Kontowechsel laeuft _cnSync() unveraendert durch: S.coachPush traegt wieder Zustand und Plan, und es stehen eigene Termine (47xxx) im Bestand',
    !!r.push && !!r.push.state && Array.isArray(r.push.plan) && r.push.plan.length > 0 && r.eigene > 0,
    JSON.stringify({ push: r.push, eigene: r.eigene }).slice(0, 500));

  // Statisch: BEIDE Riegel, nicht nur einer.
  try {
    const code = ohneKommentar(fs.readFileSync(SRC, 'utf8'));
    const iDrop = code.indexOf('function _coachDropOwnNotifs');
    const drop  = iDrop > 0 ? code.slice(iDrop, iDrop + 1800) : '';
    const iRun  = code.indexOf('async function _cnSyncRun');
    const run   = iRun > 0 ? code.slice(iRun, iRun + 6000) : '';
    const iWipe = code.indexOf('function _coachWipeLocal');
    const wipe  = iWipe > 0 ? code.slice(iWipe, iWipe + 4000) : '';
    check('C1 statisch — beide Riegel: _coachDropOwnNotifs() haengt ueber _cnEnqueue() in DERSELBEN Warteschlange wie _cnSync(); _cnSyncRun() prueft das Konto-Merkmal (_coachGen) vor jedem Schreibzugriff UND in einem finally, das jeden Ausgang abdeckt (zwischen dem letzten Schreiben und dem Ende des Laufs liegen zwei await); _coachWipeLocal() zaehlt das Merkmal hoch',
      /_cnEnqueue\(/.test(drop) && /function _cnSync\(opts\)\s*\{\s*return _cnEnqueue/.test(code) &&
      /const gen = _coachGen/.test(run) && (run.match(/veraltet\(\)/g) || []).length >= 4 &&
      /finally\s*\{[\s\S]*veraltet\(\)\s*&&\s*S\.coachPush[\s\S]*S\.coachPush = null/.test(run) &&
      /_coachGen\+\+/.test(wipe),
      JSON.stringify({ dropKette: /_cnEnqueue\(/.test(drop), syncKette: /function _cnSync\(opts\)\s*\{\s*return _cnEnqueue/.test(code),
                       genImLauf: /const gen = _coachGen/.test(run),
                       riegel: (run.match(/veraltet\(\)/g) || []).length,
                       finallyRiegel: /finally\s*\{[\s\S]*veraltet\(\)\s*&&\s*S\.coachPush[\s\S]*S\.coachPush = null/.test(run),
                       genHoch: /_coachGen\+\+/.test(wipe) }));
  } catch (e) { check('C1 statisch — beide Riegel', false, String(e.message)); }

  /* ══ W1 — der Modelltext nennt lbs-Nutzern kg ═══════════════════════════ */
  await boot('uidA');
  const lbs = O(await ev(async () => {
    S.unitMode = 'lbs';
    S.coachReports = [];
    const nums = { workouts:4, sets:18, vol:12345, prevVol:11000, volDelta:1345,
                   prs:[], streak:3, muscles:{ brust:5000 } };
    window.__ai.calls = 0; window.__ai.payloads = [];
    const txt = await _crAskModel(nums, { weeks: 7, goalKg: 120, currentKg: 100, ex:'Bankdrücken' });
    // Der ROHE Auftragstext, nicht der stringifizierte Umschlag: die Zahlen
    // stehen als JSON IN diesem String, ein zweites stringify wuerde jedes
    // Anfuehrungszeichen maskieren und die Pruefung ins Leere laufen lassen.
    const p0 = window.__ai.payloads[0];
    const p = (p0 && p0.payload && p0.payload.messages && p0.payload.messages[0]) ? p0.payload.messages[0].content : '';
    return { payload: p, txt: txt, zeile: _csWeight(12345) };
  }));
  check('W1 — S.unitMode="lbs": die Zahlen ans Modell sind umgerechnet (12.345 kg -> 27216) und tragen die Einheit "lbs"; kein Rohwert in kg und kein Schluessel mehr, der "kg" behauptet — die Zahlenzeile im Reiter "Woche" nennt dieselbe Zahl',
    /27216/.test(lbs.payload || '') && /"unit":"lbs"/.test(lbs.payload || '') &&
    !/12345/.test(lbs.payload || '') && !/[Vv]olumeKg|goalKg|muscleVolumeKg|prevVolumeKg/.test(lbs.payload || '') &&
    /27\.?216/.test(String(lbs.zeile || '')),
    JSON.stringify({ zahlen: (lbs.payload || '').slice(-320), zeile: lbs.zeile }));

  const kg = O(await ev(async () => {
    S.unitMode = 'kg';
    const nums = { workouts:4, sets:18, vol:12345, prevVol:11000, volDelta:1345,
                   prs:[], streak:3, muscles:{ brust:5000 } };
    window.__ai.calls = 0; window.__ai.payloads = [];
    await _crAskModel(nums, { weeks: 7, goalKg: 120, currentKg: 100, ex:'Bankdrücken' });
    const p0 = window.__ai.payloads[0];
    return { payload: (p0 && p0.payload && p0.payload.messages && p0.payload.messages[0]) ? p0.payload.messages[0].content : '' };
  }));
  check('W1 — im kg-Modus steht dieselbe Zahl wie vorher (12345) und die Einheit "kg": die Umrechnung ist an der Grenze und nicht im Modul',
    /12345/.test(kg.payload || '') && /"unit":"kg"/.test(kg.payload || '') && !/27216/.test(kg.payload || ''),
    JSON.stringify({ zahlen: (kg.payload || '').slice(-320) }));

  try {
    const src = fs.readFileSync(SRC, 'utf8');
    const i = src.indexOf('async function _crAskModel');
    const fn = i > 0 ? src.slice(i, i + 3600) : '';
    check('W1 statisch — der Auftrag sagt dem Modell in BEIDEN Sprachen, dass die Einheit im Feld "unit" steht und nichts umgerechnet werden darf; die drei Vorgaben aus Task 21 (drei Saetze, keine Emojis, kein Planvorschlag) stehen weiter',
      fn.length > 400 && /kgToDisp\(/.test(fn) && /unitLabel\(\)/.test(fn) &&
      /Einheit, die das Feld "unit" nennt/.test(fn) && /unit" field/.test(fn) &&
      /[Gg]enau drei Sätze/.test(fn) && /Exactly three sentences/.test(fn) &&
      /keine Emojis/.test(fn) && /no emojis/.test(fn) &&
      /Änderung des Trainingsplans/.test(fn) && /change to the training plan/.test(fn),
      JSON.stringify({ len: fn.length, kgToDisp: /kgToDisp\(/.test(fn),
                       de: /Einheit, die das Feld "unit" nennt/.test(fn), en: /unit" field/.test(fn) }));
  } catch (e) { check('W1 statisch — Auftrag nennt die Einheit', false, String(e.message)); }

  /* ══ W2 — scheitert die Nachkontrolle, bleibt es still ══════════════════ */
  await boot('uidA');
  const w2 = O(await ev(async () => {
    window.__errs.length = 0;
    window.__lat = 0;
    window.__cnFailPending = true;                 // getPending faellt aus
    const res = await _coachDropOwnNotifs([{ id:'reminderPlan:2026-08-01' }]);
    window.__cnFailPending = false;
    return { res: res, errs: (window.__errs || []).slice(),
             toast: (document.getElementById('update-toast') || {}).textContent || '' };
  }));
  check('W2 — faellt getPending() bei der Nachkontrolle aus, ist das NICHT still: console.error nennt die unvollstaendige Datentrennung, und der Hinweis steht auf dem Bildschirm',
    !!w2.res && w2.res.ok === false &&
    (w2.errs || []).some(e => /Datentrennung unvollstaendig/i.test(e)) &&
    (w2.errs || []).some(e => /nachlesen|ungeprueft/i.test(e)) &&
    /nicht vollständig zurückgesetzt|could not be reset completely/i.test(w2.toast || ''),
    JSON.stringify({ res: w2.res, errs: (w2.errs || []).slice(0, 3), toast: w2.toast }).slice(0, 700));

  const w2b = O(await ev(async () => {
    window.__errs.length = 0;
    window.__cnFailCancel = true;                  // cancel faellt aus -> Reste bleiben
    window.__cnReset([{ id: 2500 }, { id: 47000, title:'Nina' }]);
    const res = await _coachDropOwnNotifs([]);
    window.__cnFailCancel = false;
    return { res: res, errs: (window.__errs || []).slice() };
  }));
  check('W2 — und _cnCancelOwn() schluckt seinen Fehler nicht mehr: bleibt danach ein 47xxx-Termin stehen, nennt die Konsole BEIDES — den Rest und den gescheiterten cancel-Aufruf',
    !!w2b.res && w2b.res.ok === false && w2b.res.rest === 1 &&
    (w2b.errs || []).some(e => /47000-47999 stehen noch/.test(e)) &&
    (w2b.errs || []).some(e => /Termine abbestellen/.test(e)),
    JSON.stringify({ res: w2b.res, errs: (w2b.errs || []).slice(0, 3) }).slice(0, 700));

  /* ══ W3 — Konto B sieht A's Chat und kann dessen Plan importieren ═══════ */
  await boot('uidA');
  await ev(() => { try { openAiChat(); } catch (_) {} });
  await wait(300);
  const vorW3 = O(await ev(() => ({
    log: (document.getElementById('aic-log') || {}).innerHTML || '',
    knopf: !!document.querySelector('#aic-log .aic-plan-btn')
  })));
  await ev(() => { window.__authTo('uidB'); });
  await wait(700);
  const w3 = O(await ev(ZUSTAND));
  check('W3 — Chat-Blatt offen und ein Planvorschlag steht: nach dem Auth-Wechsel liest Konto B die Unterhaltung von Konto A NICHT weiter — #aic-log ist neu gezeichnet, der Knopf "Plan importieren" ist weg und _aicPlanPending null',
    /Knieprobleme/.test(vorW3.log || '') && vorW3.knopf === true &&
    w3.hist === 0 && !/Knieprobleme|Konto-A-Antwort/.test(w3.log || '') &&
    !/aic-plan-btn/.test(w3.log || '') && w3.planPending === null,
    JSON.stringify({ vorherKnopf: vorW3.knopf, hist: w3.hist, planPending: w3.planPending,
                     log: (w3.log || '').slice(0, 220) }).slice(0, 700));

  check('W3 — dasselbe fuer das Analyse-Blatt: _aiaActions ist leer, _aiaScope null und der Inhalt (Zahlen und Uebungsnamen von Konto A) steht nicht mehr da — sonst uebernimmt Konto B ueber _aiaApply() eine Empfehlung, die ihm nie galt',
    w3.aiaActions === 0 && w3.aiaScope === null && (w3.aiaBody || '') === '',
    JSON.stringify({ actions: w3.aiaActions, scope: w3.aiaScope, body: (w3.aiaBody || '').slice(0, 160) }));

  /* ══ M3 / M4 — die zwei ungedeckten Zeilen der Raeumung ════════════════ */
  check('M3 — Konto A stand im Hub auf "Woche": nach dem Wechsel steht _chTab wieder auf "chat". Ohne diese Zeile landet Konto B direkt in fremden Zahlen statt im Chat',
    w3.tab === 'chat',
    JSON.stringify({ tab: w3.tab }));
  check('M4 — _coachMicroLast ist nach dem Wechsel null (Konto A hatte "brust" gesetzt): die Laufzeitspur des Erzaehlbogens ueberlebt die Trennung nicht',
    w3.micro === null,
    JSON.stringify({ micro: w3.micro }));

  /* ══ M1 — esc() am Modelltext im Reiter "Woche" ═════════════════════════ */
  await boot('uidA');
  const m1 = O(await ev(async () => {
    window.__xss = 0;
    const wk = _crWeekKey(Date.now());
    S.coachReports = [{ weekKey: wk, label:'KW X', ts: Date.now(), forecast: null,
      numbers: { workouts:2, sets:9, vol:5000, prevVol:4000, volDelta:1000, prs:[], streak:1, muscles:{} },
      text: '<img src=x onerror="window.__xss=1">Guter Lauf.' }];
    persist();
    openCoachHub('report');
    await new Promise(r => setTimeout(r, 250));
    const body = document.getElementById('ch-body');
    return { html: body ? body.innerHTML : '', text: body ? body.textContent : '',
             bilder: body ? body.querySelectorAll('img').length : -1, xss: window.__xss };
  }));
  check('M1 — der Modelltext im Reiter "Woche" geht durch esc(): ein <img src=x onerror=...> aus dem Bericht landet als TEXT im Blatt, erzeugt kein Element und fuehrt nichts aus (der Text kommt vom Modell und traegt den Trainingskontext — eine Prompt-Injection darf hier nicht landen)',
    m1.xss === 0 && m1.bilder === 0 &&
    /&lt;img/.test(m1.html || '') && /<img src=x onerror/.test(m1.text || ''),
    JSON.stringify({ xss: m1.xss, bilder: m1.bilder, html: (m1.html || '').slice(0, 200) }));

  /* ══ M2 — Donnerstag-12:00-Normalisierung in _crWeekKey ═══════════════ */
  const m2 = O(await ev(() => {
    // Montag, 27. Juli 2026, 00:30 Ortszeit (Europe/Berlin = UTC+2) — ISO-KW 31.
    const ts = new Date(2026, 6, 27, 0, 30, 0).getTime();
    const ws = CoachReport.weekStart(ts);
    return {
      key: _crWeekKey(ts),
      ohneNormalisierung: CoachAnalyze.isoWeekKey(ws),      // genau die Mutation
      mittags: CoachAnalyze.isoWeekKey(ts + 12 * 36e5),
      label: _crLabel(ws),
      offset: new Date(ts).getTimezoneOffset()
    };
  }));
  check('M2 — Montag 00:30 in UTC+2: _crWeekKey rechnet ueber Donnerstag 12:00 der LOKALEN Woche und liefert "2026-W31". Ohne die Normalisierung faellt derselbe Zeitpunkt in UTC noch in die Vorwoche — der Reiter beschriftete die laufende Woche dann als "KW 30"',
    m2.key === '2026-W31' && m2.mittags === '2026-W31' &&
    m2.ohneNormalisierung === '2026-W30' && /KW 31/.test(m2.label || '') && m2.offset === -120,
    JSON.stringify(m2));

  /* ══ P — die Persona ueberlebt den Kontowechsel ═════════════════════════ */
  await boot('uidA');
  const p1 = O(await ev(async () => {
    await _pushToCloud();
    const doc = window.__cloud.user['uidA'] || {};
    return { hatPersona: !!doc.aiCoach, name: doc.aiCoach && doc.aiCoach.name,
             preset: doc.aiCoach && doc.aiCoach.preset,
             session: Object.prototype.hasOwnProperty.call(doc, 'coachSession'),
             push:    Object.prototype.hasOwnProperty.call(doc, 'coachPush'),
             reports: Object.prototype.hasOwnProperty.call(doc, 'coachReports'),
             dossier: Object.prototype.hasOwnProperty.call(doc, 'dossier'),
             schluessel: Object.keys(doc).length };
  }));
  check('P — _pushToCloud() nimmt die Persona mit (Name, Ton, Umfang, Push-Stufe) und NUR sie: coachSession, coachPush, coachReports und das Dossier stehen weiterhin nicht im Nutzer-Dokument',
    p1.hatPersona === true && p1.name === 'Nina' && p1.preset === 'close' &&
    p1.session === false && p1.push === false && p1.reports === false && p1.dossier === false,
    JSON.stringify(p1));

  // Abmelden und auf DEMSELBEN Konto wieder anmelden -> Persona kommt zurueck.
  const p2 = O(await ev(async () => {
    window.__authTo(null);                       // Abmelden: Raeumung laeuft
    const nachAb = { name: _coachName(), preset: S.aiCoach && S.aiCoach.preset };
    await new Promise(r => setTimeout(r, 60));
    await window.__loginEcht('uidA');            // Raeumung -> Merge, wie in der App
    return { nachAb: nachAb, name: _coachName(), tone: S.aiCoach && S.aiCoach.tone,
             preset: S.aiCoach && S.aiCoach.preset, push: S.aiCoach && S.aiCoach.pushLevel,
             cloudName: (window.__cloud.user['uidA'] || {}).aiCoach && window.__cloud.user['uidA'].aiCoach.name };
  }));
  const p2Karte = O(await ev(() => {
    try { renderHome(); } catch (_) {}
    const k = document.getElementById('coach-today-card');
    return { karte: (k ? k.textContent : '').replace(/\s+/g, ' ').trim() };
  }));
  check('P — abmelden und wieder auf DEMSELBEN Konto anmelden: waehrend der Abmeldung steht der Coach auf "Coach" (die Trennung greift), nach der Anmeldung sind Name, Ton und Push-Stufe aus der Cloud zurueck — und die Heute-Karte traegt den Namen wieder, ohne Neustart',
    p2.nachAb && p2.nachAb.name === 'Coach' && p2.nachAb.preset === undefined &&
    p2.name === 'Nina' && p2.tone === 'hart' && p2.preset === 'close' && p2.push === 'eng' &&
    p2.cloudName === 'Nina' && /Nina/.test(p2Karte.karte || ''),
    JSON.stringify({ p2: p2, karte: (p2Karte.karte || '').slice(0, 160) }).slice(0, 700));

  // A -> B: B hat eine EIGENE Persona in der Cloud.
  await boot('uidA');
  const p3 = O(await ev(async () => {
    await _pushToCloud();                        // A's Persona in die Cloud
    window.__cloud.user['uidB'] = {
      exercises: [], sessions: [], updatedAt: Date.now() - 60000,
      aiCoach: { live:true, insights:true, name:'Bruno', tone:'locker', voice:null, voiceOn:true,
                 inTraining:'key', setFeedback:true, pushLevel:'normal', preset:'balanced' }
    };
    await window.__loginEcht('uidB');
    return { name: _coachName(), tone: S.aiCoach && S.aiCoach.tone, preset: S.aiCoach && S.aiCoach.preset,
             cloudA: (window.__cloud.user['uidA'] || {}).aiCoach && window.__cloud.user['uidA'].aiCoach.name,
             cloudB: (window.__cloud.user['uidB'] || {}).aiCoach && window.__cloud.user['uidB'].aiCoach.name };
  }));
  check('P — Kontowechsel A -> B mit eigener Persona in B\'s Cloud: der Coach heisst "Bruno" und nie "Nina"; A\'s Persona bleibt unangetastet in A\'s Dokument stehen und B\'s wird nicht von der Voreinstellung ueberschrieben',
    p3.name === 'Bruno' && p3.tone === 'locker' && p3.preset === 'balanced' &&
    p3.cloudA === 'Nina' && p3.cloudB === 'Bruno',
    JSON.stringify(p3));

  // Gegenprobe der Reihenfolge: erst Merge, dann Raeumung.
  await boot('uidA');
  const p4 = O(await ev(async () => {
    await _pushToCloud();
    window.__cloud.user['uidB'] = {
      exercises: [], sessions: [], updatedAt: Date.now() - 60000,
      aiCoach: { live:true, insights:true, name:'Bruno', tone:'locker', voice:null, voiceOn:true,
                 inTraining:'key', setFeedback:true, pushLevel:'normal', preset:'balanced' }
    };
    await window.__loginFalscheReihenfolge('uidB');
    return { name: _coachName(), preset: S.aiCoach && S.aiCoach.preset };
  }));
  check('P Gegenprobe — dieselben zwei Schritte in der FALSCHEN Reihenfolge (erst Merge, dann Raeumung): danach steht kein "Bruno" mehr da, sondern die leere Voreinstellung. Die Reihenfolge Raeumung-vor-Merge ist also tragend und kein Zufall — genau so ruft onAuthStateChanged _coachHandleAuthUser vor _onLogin',
    p4.name === 'Coach' && p4.preset === undefined,
    JSON.stringify(p4));

  // Zwei Geraete, zwei Personas: der juengere Stand gewinnt, am Stueck.
  const p5 = O(await ev(() => {
    const A = { live:true, insights:true, name:'Nina', tone:'hart', voice:null, voiceOn:true,
                inTraining:'full', setFeedback:true, pushLevel:'eng', preset:'close' };
    const B = { live:true, insights:true, name:'Bruno', tone:'locker', voice:null, voiceOn:true,
                inTraining:'key', setFeedback:true, pushLevel:'normal', preset:'balanced' };
    const cloudNeuer = _mergeData({ aiCoach: A, updatedAt: 1000 }, { aiCoach: B, updatedAt: 2000 });
    const lokalNeuer = _mergeData({ aiCoach: A, updatedAt: 3000 }, { aiCoach: B, updatedAt: 2000 });
    const nurCloud   = _mergeData({ aiCoach: _coachPersonaDefaults(), updatedAt: 9e12 }, { aiCoach: B, updatedAt: 1000 });
    return { cloudNeuer: cloudNeuer.aiCoach, lokalNeuer: lokalNeuer.aiCoach, nurCloud: nurCloud.aiCoach };
  }));
  check('P — zwei Geraete mit verschiedenen Personas: es entscheidet pick(), also der juengere updatedAt-Stand des ganzen Dokuments, und das aiCoach-Objekt wandert AM STUECK (Name und Ton kommen nie von verschiedenen Geraeten). Und: eine Persona ohne abgeschlossene Einrichtung gilt als "nicht gesetzt" — sonst gewaenne nach jeder Raeumung die leere Voreinstellung, weil persist() den lokalen Stand frisch macht',
    !!p5.cloudNeuer && p5.cloudNeuer.name === 'Bruno' && p5.cloudNeuer.tone === 'locker' &&
    !!p5.lokalNeuer && p5.lokalNeuer.name === 'Nina' && p5.lokalNeuer.tone === 'hart' &&
    !!p5.nurCloud && p5.nurCloud.name === 'Bruno' && p5.nurCloud.preset === 'balanced',
    JSON.stringify(p5).slice(0, 600));

  const schreib = O(await ev(() => ({ w: (window.__fbWrites || []).slice() })));
  const wListe = schreib.w || [];
  check('P — kein zweiter Firestore-Schreibpfad: geschrieben wurde in diesem Lauf nur das Nutzer-Dokument (users/<uid>) und hoechstens das Dossier; nach profiles/ hat niemand geschrieben, und der Coach-Zustand (coachSession/coachPush/coachReports) taucht in keinem Ziel auf',
    wListe.length > 0 && wListe.some(w => /^set users\/[^/]+$/.test(w)) &&
    wListe.every(w => !/\bprofiles\//.test(w)) &&
    wListe.every(w => /^(set|update|delete|add) (users\/|analytics)/.test(w)),
    JSON.stringify(wListe.slice(0, 12)));

  /* ══ Minor ═════════════════════════════════════════════════════════════ */
  try {
    const src  = fs.readFileSync(SRC, 'utf8');
    const code = ohneKommentar(src);
    const iWipe = code.indexOf('function _coachWipeLocal');
    const wipe  = iWipe > 0 ? code.slice(iWipe, iWipe + 4000) : '';
    const iRun  = src.indexOf('async function _crBuildRun');
    const run   = iRun > 0 ? src.slice(iRun, iRun + 2600) : '';
    check('Minor — _crLauf wird beim Kontowechsel gekappt, _crBuildRun prueft das Konto-Merkmal vor BEIDEN Schreibzugriffen, und der Kommentar sagt nicht mehr unbedingt "rep liegt als Referenz in S.coachReports" (nach einer Raeumung haengt rep an nichts mehr)',
      /_crLauf = null/.test(wipe) && /const gen = _coachGen/.test(run) &&
      (run.match(/_coachGen !== gen/g) || []).length >= 2 &&
      /Nur solange das Konto dasselbe ist/.test(run) &&
      !/^\s*\/\/ rep liegt als Referenz in S\.coachReports — die Zuweisung landet im Archiv\.$/m.test(src),
      JSON.stringify({ kappen: /_crLauf = null/.test(wipe), gen: /const gen = _coachGen/.test(run),
                       riegel: (run.match(/_coachGen !== gen/g) || []).length }));
  } catch (e) { check('Minor — _crLauf gekappt und Kommentar richtiggestellt', false, String(e.message)); }

  try {
    const src = fs.readFileSync(SRC, 'utf8');
    const i = src.indexOf('function _crWeekKey');
    const kopf = i > 400 ? src.slice(i - 1400, i) : '';
    const j = src.indexOf('function _cnWeekVol');
    const kopf2 = j > 400 ? src.slice(j - 700, j) : '';
    check('Minor — der Kommentar zu getWeekKey() nennt es nicht mehr "Altformat", sondern einen ANDEREN Algorithmus (Wochen ab dem 1. Januar statt ab dem ersten Donnerstag) und warnt ausdruecklich davor, das mit einem padStart(2,"0") zusammenfuehren zu wollen',
      /anderer Algorithmus|ANDERER ALGORITHMUS/i.test(kopf) && /padStart/.test(kopf) &&
      /ersten Donnerstag/.test(kopf) && !/Altformat '2026-W5' und bleibt unangetastet/.test(kopf) &&
      /andere Rechnung|anderer Algorithmus/i.test(kopf2) && !/Altformat von getWeekKey/.test(kopf2),
      JSON.stringify({ crWeekKey: /anderer Algorithmus|ANDERER ALGORITHMUS/i.test(kopf), padStart: /padStart/.test(kopf),
                       cnWeekVol: /andere Rechnung|anderer Algorithmus/i.test(kopf2) }));
  } catch (e) { check('Minor — getWeekKey-Kommentar richtiggestellt', false, String(e.message)); }

  try {
    const src = fs.readFileSync(SRC, 'utf8');
    const i = src.indexOf('async function doSignOut()');
    const fn = i > 0 ? src.slice(i, i + 2400) : '';
    const de = /das Berichtsarchiv gehen von diesem Gerät — die Zahlen der laufenden Woche rechnet er aus deinen Einheiten neu\. Meldest du dich später wieder mit diesem Konto an, kommen Name und Ton zurück\./.test(fn);
    const en = /the report archive leave this device — the figures for the current week are recalculated from your sessions\. Sign in with this account again later and name and tone come back\./.test(src);
    check('Minor + P — die Rueckfrage beim Abmelden stimmt jetzt in BEIDEN Sprachen: sie sagt, dass das ARCHIV geht (der Reiter "Woche" zeigt sofort wieder Zahlen, frisch aus den Einheiten gerechnet), und dass Name und Ton auf demselben Konto zurueckkommen. Die alte Fassung ("die Wochenberichte werden zurueckgesetzt") ist weg',
      de && en && /confirm\(tr\(/.test(fn) &&
      !/Erzählbogen und die Wochenberichte werden zurückgesetzt/.test(src) &&
      !/session arc and the weekly reports are reset/.test(src),
      JSON.stringify({ de, en, alt: /Erzählbogen und die Wochenberichte werden zurückgesetzt/.test(src) }));
  } catch (e) { check('Minor — Rueckfrage beim Abmelden', false, String(e.message)); }

  /* ══ Bindende Rahmenbedingungen ════════════════════════════════════════ */
  try {
    const rulesJetzt = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
    const rulesHead  = gitZeigen('firestore.rules');
    const code = ohneKommentar(fs.readFileSync(SRC, 'utf8'));
    // Alle setDoc-Ziele im Code: es darf keine neue Schreibstelle geben.
    const ziele = (code.match(/FB\.setDoc\(\s*[^,)]+/g) || []).map(s => s.replace(/\s+/g, ' ').trim());
    const zieleHead = (() => {
      const h = gitZeigen('index.html');
      return h ? (ohneKommentar(h).match(/FB\.setDoc\(\s*[^,)]+/g) || []).map(s => s.replace(/\s+/g, ' ').trim()) : null;
    })();
    const rulesGleich = rulesHead !== null && rulesJetzt.replace(/\r\n/g, '\n') === rulesHead.replace(/\r\n/g, '\n');
    const iPush = code.indexOf('async function _pushToCloud');
    const push  = iPush > 0 ? code.slice(iPush, iPush + 3600) : '';
    check('Bindend — firestore.rules ist unveraendert (aiCoach stand dort bereits im hasOnly), es gibt keine NEUE Firestore-Schreibstelle (dieselben setDoc-Ziele wie in HEAD), und aiCoach reist im BESTEHENDEN _pushToCloud() mit',
      rulesGleich && /'aiCoach'/.test(rulesJetzt) &&
      zieleHead !== null && ziele.join('|') === zieleHead.join('|') &&
      /aiCoach:\s*_coachCloudPersona\(\)/.test(push),
      JSON.stringify({ rulesGleich, ziele: ziele.length, zieleHead: zieleHead && zieleHead.length,
                       imPayload: /aiCoach:\s*_coachCloudPersona\(\)/.test(push) }).slice(0, 500));
  } catch (e) { check('Bindend — firestore.rules unveraendert', false, String(e.message)); }

  try {
    const html = fs.readFileSync(SRC, 'utf8');
    const sw   = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const swHead = gitZeigen('sw.js'), htmlHead = gitZeigen('index.html');
    const ver     = (html.match(/const APP_VERSION\s*=\s*['"]([^'"]+)['"]/) || [])[1] || null;
    const verHead = htmlHead ? ((htmlHead.match(/const APP_VERSION\s*=\s*['"]([^'"]+)['"]/) || [])[1] || null) : null;
    const cache     = (sw.match(/const CACHE\s*=\s*['"]([^'"]+)['"]/) || [])[1] || null;
    const cacheHead = swHead ? ((swHead.match(/const CACHE\s*=\s*['"]([^'"]+)['"]/) || [])[1] || null) : null;
    const clJetzt = (html.match(/'cl-[^']+':\s*\{/g) || []).length;
    const clHead  = htmlHead ? ((htmlHead.match(/'cl-[^']+':\s*\{/g) || []).length) : -1;
    check('Bindend — APP_VERSION, CACHE in sw.js und der CHANGELOG sind unangetastet (eigener Ritualschritt nach dieser Aufgabe)',
      ver !== null && ver === verHead && cache !== null && cache === cacheHead && clJetzt === clHead,
      JSON.stringify({ ver, verHead, cache, cacheHead, clJetzt, clHead }));
  } catch (e) { check('Bindend — APP_VERSION/CACHE/CHANGELOG unangetastet', false, String(e.message)); }

  try {
    const code = ohneKommentar(fs.readFileSync(SRC, 'utf8'));
    const iWipe = code.indexOf('function _coachWipeLocal');
    const wipe  = iWipe > 0 ? code.slice(iWipe, iWipe + 4500) : '';
    check('Bindend — die Raeumung schreibt weiter mit persist() (save() gibt es in dieser Datei nicht und stuerbe still im try/catch), jeder Schritt haengt in schritt(), und der neue Schritt bestellt den angestossenen Cloud-Push wieder ab: eine lokale Trennung schreibt nichts in die Cloud',
      /schritt\('persist', \(\) => \{ persist\(\); \}\)/.test(wipe) && !/[^.\w]save\(\)/.test(wipe) &&
      /_pushTimer/.test(wipe) && /clearTimeout\(_pushTimer\)/.test(wipe),
      JSON.stringify({ persist: /schritt\('persist'/.test(wipe), pushTimer: /clearTimeout\(_pushTimer\)/.test(wipe) }));
  } catch (e) { check('Bindend — persist() und kein Cloud-Schreibzugriff aus der Raeumung', false, String(e.message)); }

  await browser.close();
  server.close();

  console.log('\n-- Abschluss-Review Block 5 — Behebungen (Chromium statt Simulator) --');
  console.log('   Baum: ' + ROOT);
  let fail = 0;
  for (const t of results) {
    console.log((t.ok ? 'PASS  ' : 'FAIL  ') + t.name);
    if (!t.ok) { fail++; console.log('        got: ' + t.got); }
  }
  const relevant = errors.filter(e => !/favicon|firebase|gstatic|net::ERR|Failed to load resource|Tracking Prevention|ERR_INTERNET_DISCONNECTED|Datentrennung unvollstaendig/i.test(e));
  console.log('\nSeitenfehler (gefiltert): ' + (relevant.length ? '\n  ' + relevant.join('\n  ') : 'keine'));
  console.log(`\nErgebnis: ${results.length - fail}/${results.length} PASS`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS-FEHLER: ' + e.message); try { server.close(); } catch (_) {} process.exit(2); });
