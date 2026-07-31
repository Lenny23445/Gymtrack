/* Task-22-Verifikation ohne iOS-Simulator (Windows, kein Xcode).

   Geprueft wird die DATENTRENNUNG: wechselt das Konto oder meldet sich der
   Nutzer ab, darf nichts vom Coach des vorigen Kontos durchsickern. Jeder
   Punkt der Pruefliste aus task-22-brief.md ist EIN Check, dazu die zusaetzlich
   verlangten Faelle: abmelden und ohne Konto weiterarbeiten, A -> B -> zurueck
   zu A, die geplanten Meldungen im Nummernraum 47000-47999, der Hinweistext der
   Kontoloeschung und ein Dossier-Eintrag mit Markup.

   Was hier NICHT geprueft werden kann und im Bericht als offen steht:
   ein ECHTER Firebase-Kontowechsel und der Cloud-Merge. Firebase laeuft im
   Messlauf ueber ein Doppel (window.FB), das Dossier-Dokumente in einer Map
   haelt — damit ist der Weg "Dossier kommt beim Rueckweg aus der Cloud"
   pruefbar, die echte Netz-Runde nicht.

   Die Meldungen laufen wie in task-19/21-check.js ueber ein
   LocalNotifications-Doppel, das schedule/cancel mitschreibt und den Bestand
   fuehrt (getPending). Nur so ist "kein 47xxx-Termin ueberlebt den Wechsel"
   ueberhaupt messbar.

   Tipps laufen ueber echte Zeigerfolgen (page.click) — Abmelden-Knopf im
   Konto-Blatt, Hub-Reiter, die neuen Chips des Berichtstermins.
   Eigener Port: 8801 (8793-8800 und 8917 belegt).

   Aufruf:
     node task-22-check.js              gegen den Arbeitsstand
     node task-22-check.js --root=<dir> gegen einen anderen Baum (Rot-Lauf
                                        gegen den Stand VOR der Aenderung)     */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const puppeteer = require('C:/Users/Anwender/Desktop/Claude/gymtrack/node_modules/puppeteer');

const REPO = 'C:/Users/Anwender/Desktop/Claude/gymtrack';
const argRoot = (process.argv.find(a => a.startsWith('--root=')) || '').slice(7);
const ROOT = argRoot ? path.resolve(argRoot) : REPO;
const SRC  = path.join(ROOT, 'index.html');
const SHOT = path.join(REPO, '.superpowers/sdd/2026-07-29-live-coach-plan-v2/task-22-hub.png');
const PORT = 8801;
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

// Kommentare entfernen (der Doppelpunkt-Riegel laesst 'https://' stehen). Die
// statischen Pruefungen lesen den CODE, nicht die Erklaerungen darin — sonst
// schluege der save()-Riegel schon an dem Kommentar an, der begruendet, WARUM
// save() verboten ist.
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
// Der Rot-Lauf laeuft gegen einen Baum, in dem _coachWipeLocal() gar nicht
// existiert: dort liefert jeder Aufruf {__err}. Die Pruefungen sollen dann ROT
// sein, nicht den Harness abschiessen.
const O = (x) => (x && !x.__err) ? x : { fehler: (x && x.__err) || 'kein Ergebnis' };

/* ── Die Doppel: laufen VOR jedem Skript der Seite ────────────────────────
   LocalNotifications wie in task-19/21-check.js (window.Capacitor ist der
   einzige Hebel, _cap()/_isNative() sind top-level-Bindungen).                */
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

/* Firebase-Doppel. Erst NACH dem Laden gesetzt (nicht in evaluateOnNewDocument),
   damit der Auth-Aufbau der App unangetastet bleibt: geprueft wird die
   Kontowechsel-Erkennung (_coachHandleAuthUser), nicht der Anmeldeweg von
   Google/Apple. Jeder Schreibzugriff wird mitgeschrieben — daran haengt der
   Nachweis "kein zweiter Firestore-Schreibpfad". */
const FBSTUB = () => {
  window.__fbWrites = [];
  window.__cloud = { dossier: {} };
  const refOf = (a, b) => ({ path: (b === undefined) ? String(a) : (String(a) + '/' + String(b)) });
  window.FB = {
    configured: true,
    auth: { currentUser: null },
    doc: refOf,
    userDocRef: (uid) => refOf('users/' + uid),
    serverTimestamp: () => 0,
    getDoc: async (ref) => {
      const m = /^users\/(.+)\/coach\/dossier$/.exec(ref.path);
      const d = m ? window.__cloud.dossier[m[1]] : null;
      return { exists: () => !!d, data: () => d };
    },
    setDoc: async (ref, data) => {
      window.__fbWrites.push('set ' + ref.path);
      const m = /^users\/(.+)\/coach\/dossier$/.exec(ref.path);
      if (m) window.__cloud.dossier[m[1]] = JSON.parse(JSON.stringify(data || {}));
    },
    updateDoc: async (ref) => { window.__fbWrites.push('update ' + ref.path); },
    deleteDoc: async (ref) => {
      window.__fbWrites.push('delete ' + ref.path);
      const m = /^users\/(.+)\/coach\/dossier$/.exec(ref.path);
      if (m) delete window.__cloud.dossier[m[1]];
    },
    onSnapshot: () => (() => {}),
    startPresence: () => {}, stopPresence: () => {},
    signOut: async () => { window.__authTo(null); }
  };
  // Der Auth-Weg der App in EINER Funktion: dieselbe Reihenfolge wie in
  // onAuthStateChanged (_coachHandleAuthUser VOR dem Setzen von _fbUser).
  window.__authTo = (uid) => {
    const user = uid ? { uid: uid, isAnonymous: false, email: uid + '@example.test', displayName: uid } : null;
    _coachHandleAuthUser(user);
    _fbUser = user;
    window.FB.auth.currentUser = user;
    try { updateAccountUI(); } catch (_) {}
  };
};

// Voller Coach-Zustand von Konto A. Jedes Feld der Liste aus dem Auftrag ist
// belegt — sonst prueft der Vergleich hinterher gegen einen leeren Wert.
// Die Anmeldung laeuft ZUERST: laedt die echte Firebase-Bibliothek doch einmal
// und meldet "abgemeldet", steht _coachLastUid auf null statt undefined, und
// der erste __authTo() waere selbst schon ein Kontowechsel — er wuerde den
// gerade gesetzten Zustand wieder abraeumen.
const KONTO_A = (uid) => {
  window.isPremium = () => true;
  const gate = document.getElementById('auth-gate'); if (gate) gate.style.display = 'none';
  const NOW = Date.now();
  /* Und _coachLastUid ausdruecklich auf undefined statt auf null: laedt die
     echte Firebase-Bibliothek doch einmal und meldet "abgemeldet", steht dort
     null — der __authTo() unten waere dann SELBST schon ein Kontowechsel und
     raeumte eine Runde ab, bevor der Zustand ueberhaupt steht. Bis zur
     Abschluss-Review von Block 5 fiel das nicht auf: _coachDropOwnNotifs()
     las den Bestand damals noch synchron, also VOR dem __cnReset() am Ende
     dieser Funktion, und fand nichts. Seit die Raeumung in der _cnSync()-Kette
     haengt (Kritisch 1), laeuft sie eine Runde spaeter — und raeumte dann die
     Termine ab, die diese Vorbereitung gerade erst gesetzt hat. Der Fall ist
     ein Artefakt der Vorbereitung, kein Verhalten der App: in der App
     erscheinen 47xxx-Termine nur ueber _cnSync(), und das steht in derselben
     Kette. */
  _coachLastUid = undefined;
  window.__authTo(uid);
  _initialMergeDone = true;

  S.exercises = [{ id:'ex0', name:'Bankdrücken', muscleGroup:'brust', targetSets:3, targetReps:8 }];
  S.sessions  = [{ id:'s1', date:new Date(NOW - 864e5).toISOString(), duration:3300,
                   logs:[{ exerciseId:'ex0', sets:[{ w:60, r:8, type:'normal' }] }] }];
  S.notifEnabled = true;                       // die generische Erinnerung ist hier Umgebung
  S.unitMode = 'kg';

  S.aiCoach = { live:true, insights:true, name:'Nina', tone:'hart', voice:'de-DE-1', voiceOn:true,
                inTraining:'full', setFeedback:true, pushLevel:'eng', preset:'close' };
  S.coachSession = { wkTs: NOW, spoken: 5, acks: 3, said: { greet:1, mid:1 }, ended:false,
                     rests: [90, 120], reps: [8, 8], setCount: 6, lastTick: NOW };
  S.coachPush = { state: { sentTs: { reminderPlan: NOW - 3600e3 }, day:'2026-07-30', dayCount:2, weekCount:6 },
                  plan: [{ id:'reminderPlan:2026-08-01', at: NOW + 864e5, kind:'reminderPlan' },
                         { id:'report:2026-08-02',      at: NOW + 2 * 864e5, kind:'report' }],
                  permOk: true, owns: true };
  S.coachReports = [{ weekKey:'2026-W31', label:'KW 31 · 27. Jul – 2. Aug',
                      numbers:{ workouts:4, sets:18, vol:12345, prevVol:11000, volDelta:1345, prs:[], streak:3, muscles:{ brust:5000 } },
                      text:'Vier Einheiten und 18 Sätze stehen.', forecast:null, ts: NOW }];
  S.coachReportAt = { day: 2, hour: 21 };      // bewusst NICHT die Voreinstellung
  S.coachLog = [{ ts: NOW, kind:'deload', exId:'ex0', accepted:false }];

  _aicHist = [{ role:'user', content:'Ich habe Knieprobleme' }, { role:'assistant', content:'Verstanden.' }];
  localStorage.setItem('gt_aiChat', JSON.stringify(_aicHist));
  localStorage.setItem('gt_aiQuota', JSON.stringify({ limit:150, used:87 }));

  const dossierA = Object.assign(window.CoachMemory.dossierEmpty(), {
    goal: 'Kraft',
    limits: [{ t:'Knieprobleme links', ts: NOW }],
    prefs:  [{ t:'Trainiert am liebsten morgens', ts: NOW }],
    updatedAt: NOW
  });
  window.CoachMemory.dossierSave(localStorage, uid, dossierA);
  window.__cloud.dossier[uid] = JSON.parse(JSON.stringify(dossierA));

  persist();

  // Bestand der geplanten Meldungen: der Pausen-Timer, die generische
  // Erinnerung und zwei eigene Termine des Coaches von Konto A.
  window.__cnReset([
    { id: 2500,  title:'Pause vorbei' },
    { id: 1001,  title:'Zeit fürs Training!' },
    { id: 47000, title:'Nina', body:'Trainingstag: Bankdrücken', extra:{ coachKind:'reminderPlan' } },
    { id: 47501, title:'Nina', body:'Deine Woche', extra:{ coachKind:'report' } }
  ]);
  return { name: S.aiCoach.name, plan: S.coachPush.plan.length, uid: _coachLastUid };
};

// Alles, was der naechste Nutzer NICHT sehen darf — in einem Rutsch abgefragt.
const ZUSTAND = () => {
  const ls = (k) => { try { return localStorage.getItem(k); } catch (_) { return 'ERR'; } };
  let gespeichert = {};
  try { gespeichert = JSON.parse(localStorage.getItem('ft4') || '{}'); } catch (_) {}
  return {
    aiCoach: S.aiCoach ? JSON.parse(JSON.stringify(S.aiCoach)) : null,
    presetTyp: S.aiCoach ? typeof S.aiCoach.preset : 'kein aiCoach',
    presetOffen: !!(S.aiCoach && S.aiCoach.preset === undefined),
    name: (function () { try { return _coachName(); } catch (_) { return 'ERR'; } })(),
    session: S.coachSession,
    push: S.coachPush,
    reports: (S.coachReports || []).length,
    reportAt: S.coachReportAt ? JSON.parse(JSON.stringify(S.coachReportAt)) : null,
    log: (S.coachLog || []).length,
    hist: (typeof _aicHist !== 'undefined' && Array.isArray(_aicHist)) ? _aicHist.length : -1,
    chat: ls('gt_aiChat'),
    quota: ls('gt_aiQuota'),
    // Auch auf der Platte, nicht nur im Speicherobjekt: persist() statt save().
    gespeichertName:    (gespeichert.aiCoach || {}).name,
    gespeichertPreset:  Object.prototype.hasOwnProperty.call(gespeichert.aiCoach || {}, 'preset'),
    gespeichertSession: gespeichert.coachSession === null || gespeichert.coachSession === undefined,
    gespeichertPush:    gespeichert.coachPush === null || gespeichert.coachPush === undefined,
    gespeichertReports: (gespeichert.coachReports || []).length,
    gespeichertReportAt: gespeichert.coachReportAt || null,
    pending: (window.__cnPending || []).map(n => Number(n.id)).sort((a, b) => a - b),
    eigene: (window.__cnPending || []).filter(n => Number(n.id) >= 47000 && Number(n.id) <= 47999).length,
    dossier: (function () { try { return _dossier(); } catch (_) { return null; } })(),
    schreibpfade: (window.__fbWrites || []).slice()
  };
};

// Voreinstellung der Persona, wie sie nach der Trennung dastehen muss.
const istVoreinstellung = (a) => !!a &&
  a.name === '' && a.tone === 'sachlich' && a.inTraining === 'key' &&
  a.setFeedback === true && a.pushLevel === 'normal' && a.live === true &&
  a.insights === true && a.voiceOn === true && a.voice === null &&
  a.preset === undefined && a.liveWas === undefined;

const HUBTEXT = () => {
  const el = document.getElementById('ch-body');
  const ov = document.getElementById('ov-coach-hub');
  return {
    text: (el ? el.textContent : '').replace(/\s+/g, ' ').trim(),
    html: el ? el.innerHTML : '',
    tab: (typeof _chTab === 'string') ? _chTab : null,
    offen: !!(ov && ov.classList.contains('on')),
    setupOffen: !!((document.getElementById('ov-coach-setup') || {}).classList || { contains: () => false }).contains('on')
  };
};

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument(STUB);
  let dialogAntwort = 'accept';
  page.on('dialog', async d => { try { dialogAntwort === 'accept' ? await d.accept() : await d.dismiss(); } catch (_) {} });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text().slice(0, 200)); });

  const ev = async (fn, arg) => {
    try { return (arg === undefined) ? await page.evaluate(fn) : await page.evaluate(fn, arg); }
    catch (e) { return { __err: String((e && e.message) || e).slice(0, 240) }; }
  };
  /* Jeder Lauf beginnt mit LEEREM Speicher: localStorage ueberlebt page.goto,
     ein Bericht oder ein Dossier aus dem vorigen Abschnitt faerbte sonst den
     naechsten. Danach 3,3 s warten — der Start plant seine Meldungen bei
     1200 ms und zieht den Wochenbericht bei 2500 ms vor; wer frueher misst,
     misst gegen einen Bestand, der sich noch bewegt. */
  const boot = async (uid) => {
    errors.length = 0;
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 60000 });
    await ev(() => { try { localStorage.clear(); } catch (_) {} });
    await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
    await wait(3300);
    await ev(FBSTUB);
    return await ev(KONTO_A, uid || 'uidA');
  };
  // Hub oeffnen und ueber eine ECHTE Zeigerfolge auf einen Reiter wechseln.
  const hubAuf = async (tab) => {
    await ev(() => { try { openCoachHub('chat'); } catch (_) {} });
    await wait(250);
    if (tab) { try { await page.click('#ch-tab-' + tab); } catch (_) {} await wait(300); }
    return O(await ev(HUBTEXT));
  };
  let r;

  /* ── 1) Der Abmelde-Weg als echte Zeigerfolge ────────────────────────────
     Konto-Blatt oeffnen, auf "Abmelden" tippen, Rueckfrage bestaetigen. Der
     Rest laeuft wie in der App: FB.signOut() -> Auth-Zustand null ->
     _coachHandleAuthUser(null).                                              */
  const vorA = await boot('uidA');
  await ev(() => { try { openAccountSheet(); } catch (_) {} });
  await wait(300);
  const knopf = await page.$$eval('#account-body button', bs =>
    bs.map((b, i) => ({ i, t: (b.textContent || '').trim() }))).catch(() => []);
  const idx = (knopf.find(b => /Abmelden|Sign out/.test(b.t)) || {}).i;
  if (idx !== undefined) {
    const handles = await page.$$('#account-body button');
    try { await handles[idx].click(); } catch (_) {}
  }
  await wait(900);
  const nachAb = O(await ev(ZUSTAND));
  check('Abmelden ueber den echten Knopf im Konto-Blatt: JEDES Feld des Coach-Zustands ist zurueckgesetzt — Persona auf die Voreinstellung mit preset undefined, coachSession null, coachPush null, coachReports leer, coachReportAt {day:0,hour:18}, coachLog leer, Chatverlauf und Kontingent geraeumt',
    istVoreinstellung(nachAb.aiCoach) && nachAb.name === 'Coach' &&
    nachAb.session === null && nachAb.push === null &&
    nachAb.reports === 0 && !!nachAb.reportAt && nachAb.reportAt.day === 0 && nachAb.reportAt.hour === 18 &&
    nachAb.log === 0 && nachAb.hist === 0 && nachAb.chat === null && nachAb.quota === null,
    JSON.stringify({ knopf, aiCoach: nachAb.aiCoach, session: nachAb.session, push: nachAb.push,
                     reports: nachAb.reports, reportAt: nachAb.reportAt, log: nachAb.log,
                     hist: nachAb.hist, chat: nachAb.chat, quota: nachAb.quota }).slice(0, 900));

  // ── 2) Und zwar auch AUF DER PLATTE: persist(), nicht save() ─────────────
  check('Der zurueckgesetzte Zustand steht auch im Speicher (ft4) — geschrieben wurde mit persist(); ein save() waere im try/catch still gescheitert und der Zustand des vorigen Kontos ueberlebte den naechsten Start',
    nachAb.gespeichertName === '' && nachAb.gespeichertPreset === false &&
    nachAb.gespeichertSession === true && nachAb.gespeichertPush === true &&
    nachAb.gespeichertReports === 0 &&
    !!nachAb.gespeichertReportAt && nachAb.gespeichertReportAt.day === 0 && nachAb.gespeichertReportAt.hour === 18,
    JSON.stringify({ name: nachAb.gespeichertName, presetImSpeicher: nachAb.gespeichertPreset,
                     session: nachAb.gespeichertSession, push: nachAb.gespeichertPush,
                     reports: nachAb.gespeichertReports, reportAt: nachAb.gespeichertReportAt }));

  /* ── 3) Geplante Meldungen: 47xxx weg, Pausen-Timer und die generische
         Erinnerung unberuehrt bzw. zurueck an ihrem Platz ─────────────────── */
  check('Nach dem Abmelden steht KEIN Termin 47000-47999 mehr; der Pausen-Timer (2500) laeuft weiter und die generische Trainings-Erinnerung (1000-1999) hat ihren Platz zurueck',
    Array.isArray(nachAb.pending) && nachAb.eigene === 0 &&
    nachAb.pending.indexOf(2500) >= 0 &&
    nachAb.pending.some(id => id >= 1000 && id < 2000),
    JSON.stringify({ pending: nachAb.pending, eigene: nachAb.eigene }));

  /* ── 4) Ohne Konto weiterarbeiten: die Flaechen tragen nichts von Konto A ─ */
  const ohneKonto = O(await ev(() => {
    try { closeOv('ov-account'); } catch (_) {}
    try { renderHome(); } catch (_) {}
    const heute = document.getElementById('pg-heute');
    const karte = document.getElementById('coach-today-card');
    return {
      heute: (heute ? heute.textContent : '').replace(/\s+/g, ' ').trim(),
      karte: (karte ? karte.textContent : '').replace(/\s+/g, ' ').trim(),
      uid: (function () { try { return _coachUid(); } catch (_) { return 'ERR'; } })()
    };
  }));
  const ohneKontoHub = await hubAuf(null);
  check('Abmelden und ohne Konto weiterarbeiten: weder Heute-Tab noch Coach-Karte tragen "Nina" oder eine Zahl von Konto A — und weil preset offen ist, faengt der Hub mit der Einrichtung an statt mit dem Coach des Vorbesitzers',
    ohneKonto.uid === null &&
    !/Nina/.test(ohneKonto.heute || '') && !/12345|12\.345/.test(ohneKonto.heute || '') &&
    !/Nina/.test(ohneKonto.karte || '') &&
    ohneKontoHub.setupOffen === true && ohneKontoHub.offen === false,
    JSON.stringify({ uid: ohneKonto.uid, karte: (ohneKonto.karte || '').slice(0, 160),
                     setup: ohneKontoHub.setupOffen, hub: ohneKontoHub.offen }).slice(0, 500));

  /* ── 5) Konto B anmelden: Karte zeigt "Coach", der Hub startet die
         Einrichtung, "Woche" ist leer ─────────────────────────────────────── */
  r = O(await ev(() => {
    try { closeOv('ov-coach-setup'); } catch (_) {}
    window.__authTo('uidB');
    return { uid: _coachLastUid };
  }));
  await wait(400);
  const nachB = O(await ev(ZUSTAND));
  const bKarte = O(await ev(() => {
    try { renderHome(); } catch (_) {}
    const k = document.getElementById('coach-today-card');
    return { karte: (k ? k.textContent : '').replace(/\s+/g, ' ').trim(),
             name: (function () { try { return _coachName(); } catch (_) { return 'ERR'; } })() };
  }));
  check('Konto B angemeldet, Heute-Tab: die Karte traegt "Coach" und NICHT "Nina" — die Persona ist zurueckgesetzt, nicht nur die Anzeige',
    bKarte.name === 'Coach' && !/Nina/.test(bKarte.karte || '') &&
    istVoreinstellung(nachB.aiCoach),
    JSON.stringify({ name: bKarte.name, karte: (bKarte.karte || '').slice(0, 160),
                     aiCoach: nachB.aiCoach }).slice(0, 600));

  // Hub oeffnen -> Einrichtung startet (preset === undefined)
  const bHub = await hubAuf(null);
  check('Konto B oeffnet den Hub: die Einrichtung startet (preset ist undefined) — das neue Konto entscheidet selbst ueber den Umfang, statt das Profil "Eng dabei" von Konto A zu erben',
    nachB.presetOffen === true && nachB.presetTyp === 'undefined' &&
    bHub.setupOffen === true && bHub.offen === false,
    JSON.stringify({ presetTyp: nachB.presetTyp, setup: bHub.setupOffen, hub: bHub.offen }));

  // "Woche": kein Bericht von Konto A. Die Einrichtung wird dafuer beendet
  // (preset gesetzt), sonst laesst die Weiche den Hub gar nicht erst auf.
  const bWoche = O(await ev(async () => {
    try { closeOv('ov-coach-setup'); } catch (_) {}
    setCoachPreset('balanced');
    return { preset: S.aiCoach.preset, reports: (S.coachReports || []).length };
  }));
  const bWocheHub = await hubAuf('report');
  /* Wichtig fuer die Bewertung: der Reiter ist NICHT leer — er zeigt den frisch
     gerechneten Zwischenstand aus den Trainingsdaten, die bewusst auf dem
     Geraet bleiben (genau das verspricht die Rueckfrage beim Abmelden, und der
     Cloud-Merge uebernimmt sie beim naechsten Login). Weg sein muss der
     GESPEICHERTE Bericht von Konto A: seine Zahlen (4 Einheiten, 18 Saetze,
     12345 kg) und der Satz, den das Modell fuer Konto A geschrieben hat.     */
  check('Konto B, Hub -> "Woche": kein gespeicherter Bericht von Konto A mehr — weder die Zahlen (4 Einheiten, 18 Saetze, 12345 kg) noch der fuer Konto A geschriebene Satz; was dasteht, ist der frisch gerechnete Zwischenstand aus den lokalen Trainingsdaten',
    bWoche.reports === 0 && bWocheHub.tab === 'report' &&
    !/12345|12\.345/.test(bWocheHub.text || '') &&
    !/Vier Einheiten und 18 Sätze/.test(bWocheHub.text || '') &&
    /Einheiten1/.test((bWocheHub.text || '').replace(/\s+/g, '')) &&
    !/NaN|undefined|\[object/.test(bWocheHub.text || ''),
    JSON.stringify({ reports: bWoche.reports, tab: bWocheHub.tab, text: (bWocheHub.text || '').slice(0, 320) }));

  /* ── 6) Konsole: die rein lokalen Felder stehen auf null ─────────────────
     Der Brief nennt genau diese zwei namentlich.                             */
  check('Konsole nach dem Kontowechsel: S.coachSession und S.coachPush sind null, S.coachReports ist leer und S.coachReportAt steht auf {day:0, hour:18}',
    nachB.session === null && nachB.push === null && nachB.reports === 0 &&
    !!nachB.reportAt && nachB.reportAt.day === 0 && nachB.reportAt.hour === 18,
    JSON.stringify({ session: nachB.session, push: nachB.push, reports: nachB.reports, reportAt: nachB.reportAt }));

  /* ── 7) A -> B -> zurueck zu A ────────────────────────────────────────────
     A bekommt sein Dossier wieder (aus der Cloud), B hinterlaesst nichts, und
     die rein lokalen Felder bleiben leer: sie sind bewusst NICHT synchronisiert. */
  r = O(await ev(async () => {
    // Konto B legt eigene Spuren an, bevor es geht.
    S.coachReports = [{ weekKey:'2026-W32', label:'KW 32', numbers:{ workouts:1, sets:3, vol:999 }, text:'B war da.', ts: Date.now() }];
    S.aiCoach.name = 'Bodo';
    const dB = Object.assign(window.CoachMemory.dossierEmpty(),
      { goal:'Masse', limits:[{ t:'Schulter rechts', ts: Date.now() }], updatedAt: Date.now() });
    window.CoachMemory.dossierSave(localStorage, 'uidB', dB);
    window.__cloud.dossier['uidB'] = JSON.parse(JSON.stringify(dB));
    persist();
    // Zurueck auf Konto A.
    window.__authTo('uidA');
    await new Promise(res => setTimeout(res, 500));
    const d = _dossier();
    return {
      dossierA: d,
      limits: (d && d.limits || []).map(x => x.t),
      goal: d && d.goal,
      // Der Schluessel von Konto B darf lokal nicht mehr liegen.
      bImSpeicher: localStorage.getItem(window.CoachMemory.dossierKey('uidB')),
      name: _coachName(),
      reports: (S.coachReports || []).length,
      session: S.coachSession, push: S.coachPush,
      reportAt: JSON.parse(JSON.stringify(S.coachReportAt || {}))
    };
  }));
  check('Konto A -> B -> zurueck zu A: A bekommt sein Dossier wieder (Ziel "Kraft", Einschraenkung "Knieprobleme links") — B hinterlaesst weder Dossier noch Bericht noch Namen, und die rein lokalen Felder bleiben leer (sie sind bewusst nicht synchronisiert)',
    !!r.dossierA && r.goal === 'Kraft' &&
    (r.limits || []).some(t => /Knieprobleme/.test(t)) &&
    !(r.limits || []).some(t => /Schulter/.test(t)) &&
    r.bImSpeicher === null &&
    r.name !== 'Bodo' && r.name !== 'Nina' && r.name === 'Coach' &&
    r.reports === 0 && r.session === null && r.push === null &&
    !!r.reportAt && r.reportAt.day === 0 && r.reportAt.hour === 18,
    JSON.stringify({ goal: r.goal, limits: r.limits, bImSpeicher: r.bImSpeicher, name: r.name,
                     reports: r.reports, session: r.session, push: r.push, reportAt: r.reportAt }).slice(0, 700));

  /* ── 8) Kein zweiter Firestore-Schreibpfad waehrend des ganzen Wechsels ── */
  r = O(await ev(() => ({ writes: (window.__fbWrites || []).slice() })));
  // Bestehende Wege: der Cloud-Sync (users/{uid}), der Dossier-Push
  // (users/{uid}/coach/dossier), der Push-Token im Community-Profil
  // (profiles/{uid}) und die Analytics-Sitzung (analytics_users/{uid}) — die
  // laeuft unabhaengig vom Coach und war vor dieser Task genauso da.
  const fremde = (r.writes || []).filter(w =>
    !/^(set|update) users\/[^/]+$/.test(w) &&
    !/^set users\/[^/]+\/coach\/dossier$/.test(w) &&
    !/^update profiles\/[^/]+$/.test(w) &&
    !/^set analytics_users\//.test(w));
  check('Der ganze Kontowechsel schreibt NUR ueber die bestehenden Wege: users/{uid} (Cloud-Sync), users/{uid}/coach/dossier (Dossier-Push), der Push-Token in profiles/{uid} und die Analytics-Sitzung — kein neues Dokument, keine neue Sammlung, nichts mit Persona, Meldungs-Zustand oder Wochenbericht',
    Array.isArray(r.writes) && fremde.length === 0 &&
    !(r.writes || []).some(w => /persona|coachPush|coachReport|coachSession|notify/i.test(w)),
    JSON.stringify({ writes: (r.writes || []).slice(0, 12), fremde }).slice(0, 600));

  /* ── 9) Kein Wechsel, keine Trennung ─────────────────────────────────────
     Zwei Faelle, die NICHT raeumen duerfen: der Kaltstart (_coachLastUid ist
     undefined) und ein zweiter Auth-Durchlauf mit DEMSELBEN Konto (die App
     ruft _coachHandleAuthUser an drei Stellen). Raeumte einer davon, verloere
     jeder App-Start den Coach.                                               */
  const kalt = await boot('uidA');
  const kaltZ = O(await ev(() => {
    _coachLastUid = undefined;                                   // Kaltstart nachstellen
    _coachHandleAuthUser({ uid:'uidA', isAnonymous:false });
    const nachKalt = { name: _coachName(), preset: S.aiCoach && S.aiCoach.preset,
                       reports: (S.coachReports || []).length, session: S.coachSession, push: S.coachPush };
    _coachHandleAuthUser({ uid:'uidA', isAnonymous:false });      // derselbe Nutzer, zweiter Aufruf
    return { nachKalt: nachKalt,
             nachZweit: { name: _coachName(), preset: S.aiCoach && S.aiCoach.preset,
                          reports: (S.coachReports || []).length, session: S.coachSession, push: S.coachPush },
             eigene: (window.__cnPending || []).filter(n => Number(n.id) >= 47000 && Number(n.id) <= 47999).length };
  }));
  check('Kein Wechsel, keine Trennung: weder der Kaltstart (_coachLastUid undefined) noch ein zweiter Auth-Durchlauf mit demselben Konto raeumt etwas ab — Name "Nina", Profil "close", Bericht, Erzaehlbogen, Meldungs-Zustand und die eigenen Termine stehen unveraendert',
    kaltZ.nachKalt && kaltZ.nachKalt.name === 'Nina' && kaltZ.nachKalt.preset === 'close' &&
    kaltZ.nachKalt.reports === 1 && kaltZ.nachKalt.session !== null && kaltZ.nachKalt.push !== null &&
    kaltZ.nachZweit && kaltZ.nachZweit.name === 'Nina' && kaltZ.nachZweit.preset === 'close' &&
    kaltZ.nachZweit.reports === 1 && kaltZ.nachZweit.session !== null && kaltZ.nachZweit.push !== null &&
    kaltZ.eigene === 2,
    JSON.stringify({ vorA, kalt, nachKalt: kaltZ.nachKalt, nachZweit: kaltZ.nachZweit,
                     eigene: kaltZ.eigene }).slice(0, 600));

  /* ── 10) Ein Scheitern bleibt NICHT unbemerkt ────────────────────────────
     Ein Schritt wird sabotiert. Die Trennung laeuft trotzdem weiter (die
     uebrigen Felder sind geraeumt), meldet den Fehlschlag zurueck, schreibt
     ihn als FEHLER in die Konsole und zeigt ihn einmal auf dem Bildschirm.   */
  await boot('uidA');
  r = O(await ev(() => {
    window.__toast = '';
    const echt = window._dndToast;
    window._dndToast = (m) => { window.__toast = String(m); try { echt(m); } catch (_) {} };
    window._coachPersonaDefaults = () => { throw new Error('Sabotage'); };
    const fehler = _coachWipeLocal();
    return { fehler: fehler, anzahl: (fehler || []).length,
             toast: window.__toast,
             // trotz Sabotage: der Rest ist geraeumt
             session: S.coachSession, reports: (S.coachReports || []).length,
             chat: localStorage.getItem('gt_aiChat') };
  }));
  const fehlerLog = errors.filter(e => /Datentrennung unvollstaendig/.test(e));
  check('Ein Schritt scheitert: die Trennung bricht NICHT ab (die uebrigen Felder sind geraeumt), gibt die Fehlerliste zurueck, schreibt console.error("Datentrennung unvollstaendig") und zeigt einen Hinweis — eine still fehlschlagende Trennung waere schlimmer als ein sichtbarer Fehler',
    Array.isArray(r.fehler) && r.anzahl >= 1 && /Persona/.test((r.fehler || []).join(' ')) &&
    r.session === null && r.reports === 0 && r.chat === null &&
    /zurückgesetzt|reset/.test(r.toast || '') && fehlerLog.length >= 1,
    JSON.stringify({ fehler: r.fehler, toast: r.toast, log: fehlerLog.slice(0, 2) }).slice(0, 600));

  /* ── 11) Dossier-Eintrag mit Markup erscheint als TEXT ───────────────────── */
  await boot('uidA');
  await ev(() => {
    window.__xss = 0;
    const d = Object.assign(window.CoachMemory.dossierEmpty(), {
      goal: 'Kraft',
      limits: [{ t: '<img src=x onerror="window.__xss=1">Knie', ts: Date.now() }],
      updatedAt: Date.now()
    });
    window.CoachMemory.dossierSave(localStorage, 'uidA', d);
  });
  const jrn = await hubAuf('journal');
  const xss = O(await ev(() => ({ xss: window.__xss,
    imgs: (document.getElementById('ch-body') || document.createElement('div')).querySelectorAll('img').length })));
  check('Ein Dossier-Eintrag mit Markup erscheint im Journal als TEXT, nicht als Markup (esc() vor innerHTML) — kein onerror laeuft',
    xss.xss === 0 && xss.imgs === 0 && !/<img/i.test(jrn.html || '') &&
    /<img src=x onerror/.test(jrn.text || ''),
    JSON.stringify({ xss: xss.xss, imgs: xss.imgs, roh: /<img/i.test(jrn.html || ''),
                     text: (jrn.text || '').slice(0, 200) }));

  /* ── 12) Zusatzauftrag: der Termin des Wochenberichts ist bedienbar ──────
     Genau EINE Flaeche, im HUB. Getippt wird echt: erst der Reiter
     "Einstellungen", dann ein Tag-Chip, dann ein Stunden-Chip.               */
  await boot('uidA');
  const setup = await hubAuf('settings');
  const chips = O(await ev(() => {
    const body = document.getElementById('ch-body');
    const alle = [...(body ? body.querySelectorAll('.pwz-chip') : [])];
    const at = alle.filter(b => /coachHubSetReportAt/.test(b.getAttribute('onclick') || ''));
    return {
      tage:    at.filter(b => /'day'/.test(b.getAttribute('onclick') || '')).map(b => (b.textContent || '').trim()),
      stunden: at.filter(b => /'hour'/.test(b.getAttribute('onclick') || '')).length,
      abschnitte: [...(body ? body.querySelectorAll('.ch-sec') : [])].map(s => (s.textContent || '').split('\n')[0].trim())
    };
  }));
  const vorTermin = O(await ev(() => ({ at: JSON.parse(JSON.stringify(S.coachReportAt || {})),
                                        naechster: _cnReportAt(Date.now()) })));
  // Echte Zeigerfolge: Mittwoch (Index 3) und 7 Uhr.
  try {
    const handles = await page.$$('#ch-body .pwz-chip');
    const meta = await page.$$eval('#ch-body .pwz-chip', bs => bs.map(b => b.getAttribute('onclick') || ''));
    const iTag = meta.indexOf("coachHubSetReportAt('day',3)");
    if (iTag >= 0) { await handles[iTag].click(); await wait(300); }
    const handles2 = await page.$$('#ch-body .pwz-chip');
    const meta2 = await page.$$eval('#ch-body .pwz-chip', bs => bs.map(b => b.getAttribute('onclick') || ''));
    const iStd = meta2.indexOf("coachHubSetReportAt('hour',7)");
    if (iStd >= 0) { await handles2[iStd].click(); await wait(300); }
  } catch (_) {}
  const nachTermin = O(await ev(() => {
    let gespeichert = {}; try { gespeichert = JSON.parse(localStorage.getItem('ft4') || '{}'); } catch (_) {}
    return { at: JSON.parse(JSON.stringify(S.coachReportAt || {})),
             platte: gespeichert.coachReportAt || null,
             naechster: _cnReportAt(Date.now()),
             satz: (document.getElementById('ch-body') || {}).textContent || '' };
  }));
  check('Zusatzauftrag: die Coach-Einstellungen im HUB tragen genau eine Bedienflaeche fuer den Berichtstermin (7 Tage, 24 volle Stunden); ein echter Tipp auf "Mi" und "7" verschiebt S.coachReportAt von {day:2,hour:21} auf {day:3,hour:7}, schreibt es auf die Platte und zieht den Satz darunter mit',
    setup.tab === 'settings' &&
    (chips.tage || []).length === 7 && chips.stunden === 24 &&
    (chips.tage || []).join(',') === 'So,Mo,Di,Mi,Do,Fr,Sa' &&
    (chips.abschnitte || []).some(s => /Wochenbericht/.test(s)) &&
    !!vorTermin.at && vorTermin.at.day === 2 && vorTermin.at.hour === 21 &&
    !!nachTermin.at && nachTermin.at.day === 3 && nachTermin.at.hour === 7 &&
    !!nachTermin.platte && nachTermin.platte.day === 3 && nachTermin.platte.hour === 7 &&
    /Mittwoch/.test(nachTermin.satz || '') && /7 Uhr/.test(nachTermin.satz || '') &&
    typeof nachTermin.naechster === 'number' && nachTermin.naechster > 0,
    JSON.stringify({ tab: setup.tab, tage: chips.tage, stunden: chips.stunden,
                     abschnitte: (chips.abschnitte || []).slice(0, 8),
                     vor: vorTermin.at, nach: nachTermin.at, platte: nachTermin.platte,
                     satz: (nachTermin.satz || '').slice(-160) }).slice(0, 800));

  /* ── 13) Der Termin laesst sich auch WIRKLICH verstellen ─────────────────
     Grundzustand steht auf Mittwoch 7 Uhr; hier wird auf Sonntag 20 Uhr
     getippt, damit der Nachweis nicht auf dem Ausgangswert sitzenbleibt.     */
  try {
    const handles = await page.$$('#ch-body .pwz-chip');
    const meta = await page.$$eval('#ch-body .pwz-chip', bs => bs.map(b => b.getAttribute('onclick') || ''));
    const iTag = meta.indexOf("coachHubSetReportAt('day',0)");
    if (iTag >= 0) { await handles[iTag].click(); await wait(300); }
    const handles2 = await page.$$('#ch-body .pwz-chip');
    const meta2 = await page.$$eval('#ch-body .pwz-chip', bs => bs.map(b => b.getAttribute('onclick') || ''));
    const iStd = meta2.indexOf("coachHubSetReportAt('hour',20)");
    if (iStd >= 0) { await handles2[iStd].click(); await wait(300); }
  } catch (_) {}
  const verstellt = O(await ev(() => ({
    at: JSON.parse(JSON.stringify(S.coachReportAt || {})),
    naechster: _cnReportAt(Date.now()),
    stunde: new Date(_cnReportAt(Date.now())).getHours(),
    tag: new Date(_cnReportAt(Date.now())).getDay(),
    satz: (document.getElementById('ch-body') || {}).textContent || '',
    markiert: [...(document.getElementById('ch-body') || document.createElement('div')).querySelectorAll('.pwz-chip.on')]
      .filter(b => /coachHubSetReportAt/.test(b.getAttribute('onclick') || '')).map(b => (b.textContent || '').trim())
  })));
  check('Der Termin wird wirklich verstellt: Tipp auf "So" und "20" ergibt S.coachReportAt {day:0,hour:20}, _cnReportAt() faellt auf Sonntag 20 Uhr, und genau zwei Chips stehen markiert',
    verstellt.at && verstellt.at.day === 0 && verstellt.at.hour === 20 &&
    verstellt.tag === 0 && verstellt.stunde === 20 &&
    (verstellt.markiert || []).length === 2 &&
    /Sonntag/.test(verstellt.satz || '') && /20 Uhr/.test(verstellt.satz || ''),
    JSON.stringify({ at: verstellt.at, tag: verstellt.tag, stunde: verstellt.stunde,
                     markiert: verstellt.markiert, satz: (verstellt.satz || '').slice(-140) }).slice(0, 500));

  /* ── 14) Englisch: der neue Abschnitt hat ein Gegenpart, keine Emojis ──── */
  const en = O(await ev(() => {
    try { localStorage.setItem('gt_lang', 'en'); } catch (_) {}
    return { ok: true };
  }));
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 60000 });
  await wait(1500);
  await ev(FBSTUB);
  await ev(KONTO_A, 'uidA');
  const enHub = await hubAuf('settings');
  const enTexte = O(await ev(() => {
    const b = document.getElementById('ch-body');
    const sec = [...(b ? b.querySelectorAll('.ch-sec') : [])].map(s => (s.textContent || '').replace(/\s+/g, ' ').trim());
    const ghost = [...(b ? b.querySelectorAll('.ch-jrn.ghost') : [])].map(s => (s.textContent || '').replace(/\s+/g, ' ').trim());
    return { sec, ghost, lang: (typeof GT_LANG === 'string') ? GT_LANG : '?' };
  }));
  await ev(() => { try { localStorage.removeItem('gt_lang'); } catch (_) {} });
  check('Englische App: der neue Abschnitt heisst "Weekly report" mit "Day"/"Time" und der Satz darunter steht auf Englisch — kein deutscher Rest, kein Emoji',
    enTexte.lang === 'en' &&
    (enTexte.sec || []).some(s => /Weekly report/.test(s)) &&
    !(enTexte.sec || []).some(s => /Wochenbericht|Uhrzeit/.test(s)) &&
    (enTexte.ghost || []).some(s => /The report arrives on .+ at \d+:00\./.test(s)) &&
    !PIKTO.test((enTexte.sec || []).concat(enTexte.ghost || []).join(' ')),
    JSON.stringify({ lang: enTexte.lang, sec: (enTexte.sec || []).slice(0, 8), ghost: enTexte.ghost }).slice(0, 700));

  /* ── 15) Kein zweiter Einstieg, kein fuenfter Tab, kein fuenfter Reiter ── */
  await boot('uidA');
  const flaechen = O(await ev(() => {
    try { renderHome(); } catch (_) {}
    return { pad: document.querySelectorAll('#heute-pad > div').length,
             coach: document.querySelectorAll('#coach-today-card .aic').length,
             tabs: document.querySelectorAll('.tabbar .tab').length,
             hubTabs: document.querySelectorAll('.ch-tabs .ch-tab').length };
  }));
  check('Gestaltungsregel 1 haelt: zwei Flaechen unter der Kopfzeile, EIN Coach-Einstieg im Heute-Tab, kein fuenfter Tab und kein fuenfter Hub-Reiter — der Berichtstermin hat keine eigene Flaeche bekommen',
    flaechen.pad === 2 && flaechen.coach <= 1 && flaechen.tabs === 5 && flaechen.hubTabs === 4,
    JSON.stringify(flaechen));

  /* ── 16) Beleg: Screenshot der Coach-Einstellungen mit dem Termin ───────── */
  const shot = await hubAuf('settings');
  try {
    await ev(() => { const b = document.getElementById('ch-body'); if (b) b.scrollTop = b.scrollHeight; });
    await wait(250);
    await page.screenshot({ path: SHOT });
    check('Screenshot der Coach-Einstellungen mit dem Berichtstermin geschrieben',
      fs.existsSync(SHOT) && fs.statSync(SHOT).size > 5000 && /Wochenbericht/.test(shot.text || ''),
      SHOT);
  } catch (e) { check('Screenshot der Coach-Einstellungen geschrieben', false, String(e.message)); }

  await browser.close();
  server.close();

  /* ── 17) Statisch: die Trennung selbst ──────────────────────────────────── */
  try {
    const src = fs.readFileSync(SRC, 'utf8');
    const a = src.indexOf('function _coachWipeLocal(');
    const b = src.indexOf('function _coachHandleAuthUser(', a > 0 ? a : 0);
    const block = (a > 0 && b > a) ? src.slice(a, b) : '';
    const code = ohneKommentar(block);
    check('Statisch: _coachWipeLocal() nutzt persist() und nirgends save(), faengt jeden Schritt einzeln ab, setzt alle sechs Felder und raeumt die eigenen Meldungen ueber den Nummernraum-Filter ab (kein pauschales cancel())',
      block.length > 1200 &&
      !/[^a-zA-Z_$.]save\s*\(/.test(code) &&
      /persist\(\)/.test(code) &&
      /S\.aiCoach\s*=\s*_coachPersonaDefaults\(\)/.test(code) &&
      /S\.coachSession\s*=\s*null/.test(code) &&
      /S\.coachPush\s*=\s*null/.test(code) &&
      /S\.coachReports\s*=\s*\[\]/.test(code) &&
      /S\.coachReportAt\s*=\s*_coachReportAtDefault\(\)/.test(code) &&
      /S\.coachLog\s*=\s*\[\]/.test(code) &&
      /_coachDropOwnNotifs/.test(code) &&
      (code.match(/try\s*\{/g) || []).length >= 3 &&
      !PIKTO.test(block),
      JSON.stringify({ len: block.length, save: /[^a-zA-Z_$.]save\s*\(/.test(code),
                       persist: /persist\(\)/.test(code) }).slice(0, 400));
  } catch (e) { check('Statisch: _coachWipeLocal() nutzt persist() statt save()', false, String(e.message)); }

  /* ── 18) Statisch: kein zweiter Firestore-Schreibpfad, Rules unangetastet ─
     Die beiden Greps aus dem Brief, als Pruefung.                            */
  try {
    const src = fs.readFileSync(SRC, 'utf8');
    // Alle Schreibaufrufe mit Coach-/Profil-Bezug einsammeln — und gegen den
    // Stand VOR dieser Task vergleichen. Eine Liste, die sich nicht geaendert
    // hat, ist der belastbare Nachweis: kein neuer Schreibpfad, kein neues
    // Dokument, keine neue Sammlung.
    const schreibpfade = (s) => (ohneKommentar(s).match(/(setDoc|updateDoc|addDoc|deleteDoc)\([^)]*\)/g) || [])
      .filter(t => /profile|coach|persona|report|notify/i.test(t))
      .map(t => t.replace(/\s+/g, ' ').trim()).sort();
    const treffer = schreibpfade(src);
    const htmlHead = gitZeigen('index.html');
    const trefferHead = htmlHead ? schreibpfade(htmlHead) : null;
    /* Der Filter oben zieht wegen der Woerter "report"/"profile" auch zwei
       Community-Wege mit herein, die mit dem Coach nichts zu tun haben:
       collection('reports') (Missbrauchsmeldung) und die Aktivitaeten unter
       profiles/{uid}/activities. Beide sind Bestand und stehen deshalb in der
       Liste des Erlaubten — was NICHT vorkommen darf, ist ein Schreibweg, der
       einen Coach-Zustand nennt. */
    const erlaubt = treffer.every(t =>
      /(doc|collection)\('profiles/.test(t) || /\/coach'/.test(t) || /collection\('reports'\)/.test(t)) &&
      !treffer.some(t => /aiCoach|coachPush|coachReports|coachSession|coachReportAt|persona/i.test(t));
    // Zweiter Grep des Briefs, ohne Kommentare: die Module rechnen, sie reden
    // nicht mit dem Netz. Ohne den Kommentarschnitt schluege schon der Satz
    // "kein DOM- und kein Firestore-Zugriff" in coach-memory.js an.
    const module = fs.readdirSync(path.join(ROOT, 'js')).filter(f => /^coach-.*\.js$/.test(f));
    const netz = module.filter(f => /firestore|setDoc|firebase/i.test(ohneKommentar(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'))));
    const rulesJetzt = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
    const rulesHead  = gitZeigen('firestore.rules');
    const wipeDa = /function _coachWipeLocal\(/.test(src);
    check('Statisch (die beiden Greps des Briefs): die Datentrennung existiert und bringt KEINEN neuen Schreibpfad mit — die Liste der Coach-/Profil-bezogenen setDoc/updateDoc/deleteDoc ist Zeichen fuer Zeichen dieselbe wie vor der Task, alle liegen unter profiles/{uid} oder users/{uid}/coach, js/coach-*.js ruft kein Netz, firestore.rules ist unveraendert',
      wipeDa && treffer.length > 0 && erlaubt && netz.length === 0 &&
      trefferHead !== null && treffer.join('\n') === trefferHead.join('\n') &&
      rulesHead !== null && rulesJetzt.replace(/\r\n/g, '\n') === rulesHead.replace(/\r\n/g, '\n'),
      JSON.stringify({ wipeDa, anzahl: treffer.length, anzahlHead: trefferHead && trefferHead.length,
                       gleich: trefferHead !== null && treffer.join('\n') === trefferHead.join('\n'),
                       erlaubt, netz,
                       rulesGleich: rulesHead !== null && rulesJetzt.replace(/\r\n/g, '\n') === rulesHead.replace(/\r\n/g, '\n') }).slice(0, 700));
  } catch (e) { check('Statisch: kein zweiter Firestore-Schreibpfad, firestore.rules unveraendert', false, String(e.message)); }

  /* ── 19) Statisch: die Meldungs-Aufraeumung filtert auf 47000-47999 ─────── */
  try {
    const src = fs.readFileSync(SRC, 'utf8');
    const a = src.indexOf('function _coachDropOwnNotifs(');
    const b = src.indexOf('function _coachWipeFailed(', a > 0 ? a : 0);
    const fn = (a > 0 && b > a) ? src.slice(a, b) : '';
    const code = ohneKommentar(fn);
    check('Statisch: _coachDropOwnNotifs() geht ueber _cnCancelOwn() (Filter 47000-47999) und ruft NIE ein pauschales cancel() — der Pausen-Timer (2500) und die generische Erinnerung (1000-1999) bleiben unangetastet; danach wird nachgesehen, ob wirklich keiner mehr steht',
      fn.length > 300 && /_cnCancelOwn\(/.test(code) &&
      /CN_ID_BASE/.test(code) && /CN_ID_MAX/.test(code) &&
      /getPending\(/.test(code) && /_coachWipeFailed\(/.test(code) &&
      !/LN\.cancel\(\s*\)/.test(code) && !/\.cancel\(\{\s*\}\)/.test(code),
      JSON.stringify({ len: fn.length, cancelOwn: /_cnCancelOwn\(/.test(code),
                       nachsehen: /getPending\(/.test(code) }).slice(0, 400));
  } catch (e) { check('Statisch: Meldungs-Aufraeumung filtert auf 47000-47999', false, String(e.message)); }

  /* ── 20) Statisch: die Rueckfrage beim Abmelden sagt jetzt die Wahrheit ── */
  try {
    const src = fs.readFileSync(SRC, 'utf8');
    const i = src.indexOf('async function doSignOut()');
    const fn = i > 0 ? src.slice(i, i + 1400) : '';
    const alt = /Wirklich abmelden\? Deine lokalen Daten bleiben erhalten\./.test(src);
    const neuDe = /Dein Coach beginnt für das nächste Konto von vorn/.test(fn);
    const neuEn = /Your coach starts over for the next account/.test(src);
    check('Statisch: die Rueckfrage beim Abmelden nennt jetzt BEIDES — was bleibt (Trainings, Uebungen) und was zurueckgesetzt wird (Coach) — mit englischem Gegenpart in I18N_EN; die alte, nur noch halb wahre Fassung ist weg',
      fn.length > 200 && neuDe && neuEn && !alt && /confirm\(tr\(/.test(fn),
      JSON.stringify({ len: fn.length, neuDe, neuEn, alteFassung: alt, tr: /confirm\(tr\(/.test(fn) }));
  } catch (e) { check('Statisch: Rueckfrage beim Abmelden aktualisiert', false, String(e.message)); }

  /* ── 21) Statisch: der Hinweistext der Kontoloeschung stimmt weiter ──────
     Er verspricht, dass ALLES weg ist bis auf EINEN Dossier-Eintrag, der nicht
     entfernt werden konnte. Das bleibt wahr: _finishAccountWipe() raeumt ft4
     und jeden gt_-Schluessel, die Datentrennung setzt zusaetzlich den
     Coach-Zustand zurueck — beides entfernt, nichts kommt hinzu.             */
  try {
    const src = fs.readFileSync(SRC, 'utf8');
    const i = src.indexOf('function _finishAccountWipe(');
    const fn = i > 0 ? src.slice(i, i + 1500) : '';
    const hinweis = /Ein einzelner Eintrag mit deinen Angaben beim KI-Coach/.test(fn);
    check('Der Hinweistext der Kontoloeschung stimmt nach der Aenderung weiter: _finishAccountWipe() raeumt ft4 (und damit den gesamten Coach-Zustand) plus jeden gt_-Schluessel (Dossier, Chat, Kontingent) — genannt wird weiterhin nur der EINE Dossier-Eintrag, der in der Cloud nicht entfernt werden konnte',
      fn.length > 300 && hinweis &&
      /localStorage\.removeItem\('ft4'\)/.test(fn) &&
      /indexOf\('gt_'\) === 0/.test(fn) &&
      /location\.reload\(\)/.test(fn),
      JSON.stringify({ len: fn.length, hinweis, ft4: /localStorage\.removeItem\('ft4'\)/.test(fn) }));
  } catch (e) { check('Hinweistext der Kontoloeschung geprueft', false, String(e.message)); }

  /* ── 22) Statisch: APP_VERSION, CACHE und CHANGELOG unangetastet ────────── */
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
    check('APP_VERSION, CACHE in sw.js und der CHANGELOG sind unangetastet — das ist ein eigener Ritualschritt nach dieser Task',
      ver !== null && ver === verHead && cache !== null && cache === cacheHead && clJetzt === clHead,
      JSON.stringify({ ver, verHead, cache, cacheHead, clJetzt, clHead }));
  } catch (e) { check('APP_VERSION/CACHE/CHANGELOG unangetastet', false, String(e.message)); }

  console.log('\n-- Task 22 — Datentrennung und Kontowechsel (Chromium statt Simulator) --');
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
