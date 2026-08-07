/* ── CREWS — gemeinsame Wochenziele im Community-Tab ──────────────────────
   Umsetzung der Design-Spec docs/superpowers/specs/2026-08-06-crews-design.md,
   erweitert am 07.08.2026 um mehrere Gruppen, waehlbare Zielarten und
   Einladungen an ausgesuchte Freunde.

   Datenhaltung: ein Dokument je Crew unter crews/{code}. Die Doc-ID IST der
   6-Zeichen-Beitrittscode, dadurch ist Beitreten ein getDoc ohne Query und
   ohne Index. Die Map `wk: {uid: wert}` traegt den Wochenstand; jeder Client
   schreibt AUSSCHLIESSLICH seinen eigenen Feldpfad `wk.<uid>` und immer den
   ABSOLUTEN Wert. Disjunkte Feldpfade mergt Firestore ohne Transaktion, und
   ein wiederholter Schreibvorgang nach Netzwerkfehler ergibt denselben Stand
   statt doppelt zu zaehlen.

   Der Wochenschluessel ist bewusst NICHT getWeekKey(): dessen Grenze haengt am
   Wochentag des 1. Januar und verschiebt sich zusaetzlich mit der Sommerzeit.
   Fuer den Rollover muss der Schluessel exakt dann wechseln, wenn auch das
   Zaehlfenster wechselt — daher crewWeekKeyOf(): ISO-Datum des Montags. */

const CREW_ABC      = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // ohne O/0/I/1, wie _socCode()
const CREW_MAX      = 20;     // Mitglieder je Crew (auch in den Rules gedeckelt)
const CREW_MAX_MINE = 5;      // Gruppen je Person — jede Gruppe ist ein eigener Listener
const CREW_MIN_SEC  = 900;    // 15 Minuten
const CREW_MIN_SETS = 6;
const CREW_HIST     = 8;      // gespeicherte Wochen

/* Zielarten. `max` ist der Deckel je Person und Woche — er steht genauso in den
   Rules und ist die einzige harte Bremse gegen aufgeblasene Zaehlerstaende. */
const CREW_GOALS = {
  ses:  { label: 'Trainings',      einheit: '',     min: 3,   max: 60,     deckel: 7,      schritt: 1,    hilfe: 'Alle Trainings der Gruppe zusammen.' },
  vol:  { label: 'Volumen',        einheit: 'kg',   min: 5000, max: 500000, deckel: 200000, schritt: 5000, hilfe: 'Bewegtes Gewicht der ganzen Gruppe.' },
  min:  { label: 'Trainingszeit',  einheit: 'Min.', min: 60,  max: 3000,   deckel: 1500,   schritt: 30,   hilfe: 'Trainingsminuten aller Mitglieder.' },
  each: { label: 'Jeder X-mal',    einheit: '',     min: 1,   max: 7,      deckel: 7,      schritt: 1,    hilfe: 'Geschafft nur, wenn JEDES Mitglied so oft trainiert.' }
};
function crewGoalDef(typ){ return CREW_GOALS[typ] || CREW_GOALS.ses; }

let _crews       = {};      // id → Dokument
let _crewSubs    = {};      // id → onSnapshot-Unsubscribe
let _crewProfs   = {};      // uid → profiles-Doc (Namen/Bilder der Mitglieder)
let _crewInvites = [];      // offene Einladungen an mich
let _crewInvSub  = null;
let _crewBusy    = false;   // laufende Schreiboperation (Doppeltipp-Schutz)
let _crewOpen    = null;    // id der gerade geoeffneten vollen Ansicht
let _crewErr     = '';
let _crewNewGoal = 12;      // Ziel-Stepper in den Sheets
let _crewNewType = 'ses';
let _crewPick    = [];      // beim Gruenden ausgewaehlte Freunde (uids)

/* ── Reine Rechen-Helfer (ohne DOM/Firebase — genau so auch getestet) ── */

/* Montag der Woche als ISO-Datum, z.B. '2026-08-03'. Sortiert lexikografisch
   korrekt und ist ueber den Jahreswechsel hinweg eindeutig. */
function crewWeekKeyOf(ts){
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function crewWeekKey(){ return crewWeekKeyOf(Date.now()); }

/* Wie viele Trainings der Woche zaehlen. Eine Einheit zaehlt, wenn sie
   mindestens 15 Minuten dauerte ODER mindestens 6 Saetze enthielt — und
   hoechstens eine pro Kalendertag. Ohne diesen Riegel liesse sich der Balken
   mit Zwei-Minuten-Einheiten fluten.

   Der Wert wird IMMER absolut neu gerechnet, nie hochgezaehlt: dadurch heilt
   sich der Zaehler nach Offline-Phasen, Cloud-Merges und nachtraeglich
   geloeschten Einheiten von selbst. */
function crewCountWeek(sessions, jetzt){
  const key  = crewWeekKeyOf(jetzt);
  const tage = new Set();
  (sessions || []).forEach(s => {
    const t = new Date(s && s.date).getTime();
    if (!isFinite(t) || t > jetzt) return;
    if (crewWeekKeyOf(t) !== key) return;
    const saetze = (s.logs || []).reduce((a, l) => a + ((l && l.sets ? l.sets.length : 0)), 0);
    if ((s.duration || 0) < CREW_MIN_SEC && saetze < CREW_MIN_SETS) return;
    tage.add(new Date(t).toDateString());
  });
  return Math.min(tage.size, 7);
}

/* Eigener Wochenwert je Zielart. Volumen und Zeit zaehlen JEDE Einheit der
   Woche — der 15-Minuten-Riegel oben schuetzt den Trainings-ZAEHLER vor
   Zwei-Minuten-Einheiten; bei Volumen und Zeit traegt eine kurze Einheit
   ohnehin nur ihren echten (kleinen) Beitrag bei.
   volFn wird hereingereicht, damit die Funktion ohne die App testbar ist. */
function crewMetricWeek(sessions, jetzt, typ, volFn){
  if (typ === 'vol' || typ === 'min') {
    const key = crewWeekKeyOf(jetzt);
    let summe = 0;
    (sessions || []).forEach(s => {
      const t = new Date(s && s.date).getTime();
      if (!isFinite(t) || t > jetzt || crewWeekKeyOf(t) !== key) return;
      if (typ === 'min') summe += Math.round((s.duration || 0) / 60);
      else { try { summe += volFn ? (volFn(s) || 0) : 0; } catch(_){} }
    });
    return Math.min(Math.round(summe), crewGoalDef(typ).deckel);
  }
  return crewCountWeek(sessions, jetzt);   // 'ses' und 'each'
}

/* Summe des Wochenbalkens. Nur gueltig, solange der Schluessel im Doc zur
   laufenden Woche passt — steht dort noch die alte Woche, ist der Balken 0
   und der naechste Rollover raeumt auf. */
function crewTotal(data){
  const wk = (data && data.wk) || {};
  return Object.keys(wk).reduce((a, k) => a + (+wk[k] || 0), 0);
}

/* Ist das Wochenziel geschafft? Bei 'each' zaehlt NICHT die Summe, sondern ob
   jedes einzelne Mitglied sein Soll erreicht hat. */
function crewDone(data){
  const goal = +data.goal || 0;
  if (goal <= 0) return false;
  const wk = data.wk || {};
  if (data.goalType === 'each') {
    const m = data.members || [];
    return m.length > 0 && m.every(u => (+wk[u] || 0) >= goal);
  }
  return crewTotal(data) >= goal;
}

/* Neuer Doc-Zustand beim Wochenwechsel. Idempotent: der hist-Eintrag entsteht
   nur, wenn der letzte gespeicherte Eintrag einen anderen Schluessel traegt —
   sonst haengen zwei gleichzeitig geoeffnete Apps dieselbe Woche zweimal an. */
function crewRolloverData(data, neuerKey){
  const total = crewTotal(data);
  const done  = crewDone(data);
  const hist  = Array.isArray(data.hist) ? data.hist.slice() : [];
  const letzt = hist[hist.length - 1];
  if (!letzt || letzt.key !== data.weekKey) hist.push({ key: data.weekKey, total, goal: +data.goal || 0, done });
  return {
    wk:        {},
    weekKey:   neuerKey,
    streak:    done ? (+data.streak || 0) + 1 : 0,
    hist:      hist.slice(-CREW_HIST),
    updatedAt: Date.now()
  };
}

/* Verbleibende Tage bis Sonntag (0 = heute ist Sonntag). */
function crewDaysLeft(jetzt){
  const d = new Date(jetzt);
  return 6 - ((d.getDay() + 6) % 7);
}

function _crewNewCode(){
  return Array.from({ length: 6 }, () => CREW_ABC[Math.floor(Math.random() * CREW_ABC.length)]).join('');
}
/* Grosse Zahlen lesbar: 100.000 kg → „100.000". Nutzt die Locale der App. */
function _crewNum(n){ try { return (+n || 0).toLocaleString(GT_LOCALE); } catch(_) { return String(n); } }
function _crewVal(n, typ){
  const d = crewGoalDef(typ);
  return _crewNum(n) + (d.einheit ? ' ' + d.einheit : '');
}

/* ── Lokale Zuordnung ───────────────────────────────────────────────────── */

/* S.crewIds ist die Liste der eigenen Gruppen. S.crewId (Einzahl) war der
   Stand von heute Vormittag und wird beim ersten Aufruf uebernommen — sonst
   waere jeder, der die Crew vor dem Update angelegt hat, still draussen. */
function _crewIds(){
  if (!Array.isArray(S.crewIds)) S.crewIds = [];
  if (S.crewId && !S.crewIds.includes(S.crewId)) { S.crewIds.push(S.crewId); persist(); }
  return S.crewIds;
}
function _crewAdd(id){
  const ids = _crewIds();
  if (!ids.includes(id)) { ids.push(id); S.crewId = ids[0]; persist(); }
}
function _crewDrop(id){
  S.crewIds = _crewIds().filter(x => x !== id);
  S.crewId  = S.crewIds[0] || null;
  delete _crews[id];
  _crewStopOne(id);
  persist();
}

/* ── Firestore ───────────────────────────────────────────────────────────── */

function _crewReady(){
  if (!window.FB || !window.FB.configured) return false;
  if (typeof _socReady === 'function' && !_socReady()) return false;
  // Demo-/Marketing-Simulator schreibt NIE in die echte Datenbank — sonst
  // stehen Fake-Crews zwischen den echten (gleiche Sperre wie _pushSocialProfile).
  try { if (_demoModeAny() || (typeof DEMO_SEED !== 'undefined' && DEMO_SEED)) return false; } catch(_){}
  return true;
}
function _crewRef(id){ return window.FB.doc('crews', id); }
function _crewIsOwner(c){ return !!(c && _fbUser && c.owner === _fbUser.uid); }
function _crewMine(){ return _crewIds().map(id => _crews[id]).filter(Boolean); }

async function _crewLoad(id, force){
  if (!_crewReady()) return null;
  if (_crews[id] && !force) return _crews[id];
  try {
    const snap = await window.FB.getDoc(_crewRef(id));
    if (!snap.exists()) { _crewDrop(id); return null; }
    const doc = { id: snap.id, ...snap.data() };
    if (!(doc.members || []).includes(_fbUser.uid)) { _crewDrop(id); return null; }
    _crews[id] = doc;
    _crewErr = '';
    _crewLoadProfiles();
    return doc;
  } catch(e) {
    _crewErr = String(e && e.code || e);
    console.warn('[GymTrack] Crew laden:', _crewErr);
    return null;
  }
}
function _crewLoadAll(force){ return Promise.all(_crewIds().map(id => _crewLoad(id, force))); }

/* Namen und Bilder der Mitglieder. Crew-Mitglieder sind nicht zwingend
   Freunde, deshalb ein eigener kleiner Zwischenspeicher statt _socCache. */
function _crewLoadProfiles(){
  const alle = new Set();
  _crewMine().forEach(c => (c.members || []).forEach(u => alle.add(u)));
  const fehlend = [...alle].filter(u => _crewProfs[u] === undefined);
  if (!fehlend.length) return;
  fehlend.forEach(u => { _crewProfs[u] = null; });   // nicht doppelt anfragen
  Promise.all(fehlend.map(u => window.FB.getDoc(window.FB.doc('profiles', u))
    .then(s => { if (s.exists()) _crewProfs[u] = s.data(); })
    .catch(() => {})))
    .then(() => _crewRender());
}

/* Eigenen Wochenstand schreiben — und, falls faellig, vorher den Rollover.
   Beides in EINER Transaktion, damit zwei gleichzeitig startende Clients nicht
   dieselbe Woche zweimal in die Historie schreiben.

   Zaehlen und Rollover landen bewusst nicht in getrennten Schreibvorgaengen:
   ein reiner Zaehl-Write darf weekKey mitschreiben (Rules-Zweig „zaehlen"),
   und wuerde er das VOR dem Rollover tun, waere die abgelaufene Woche samt
   Streak still verloren. */
async function _crewPushOne(id){
  if (!_crewReady() || !id || !_fbUser) return;
  if (typeof window.FB.runTransaction !== 'function') return;
  const uid = _fbUser.uid;
  try {
    await window.FB.runTransaction(async tx => {
      const ref  = _crewRef(id);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('crew-weg');
      const d = snap.data();
      if (!(d.members || []).includes(uid)) throw new Error('kein-mitglied');
      const n   = crewMetricWeek(S.sessions, Date.now(), d.goalType,
                                 typeof sessionVolume === 'function' ? sessionVolume : null);
      const key = crewWeekKey();
      if (d.weekKey !== key) {
        const roll = crewRolloverData(d, key);
        roll.wk = n > 0 ? { [uid]: n } : {};
        tx.update(ref, roll);
      } else if ((d.wk || {})[uid] !== n) {
        tx.update(ref, { ['wk.' + uid]: n, updatedAt: Date.now() });
      }
    });
  } catch(e) {
    const m = String(e && e.message || e);
    if (m.includes('crew-weg') || m.includes('kein-mitglied')) { _crewDrop(id); return; }
    console.warn('[GymTrack] Crew-Push:', e && e.code || e);
  }
}
/* Aufgerufen nach jedem beendeten Training (js/app-workout.js) und beim
   Oeffnen des Community-Tabs. */
function _crewPush(){ return Promise.all(_crewIds().map(_crewPushOne)); }

/* Live-Updates je Crew. Start/Stop analog _frStartLive — ein weiterlaufender
   Listener nach Tab-Wechsel ist im Repo schon einmal aufgetreten, deshalb
   haengt der Stop an setSocTab/setSocZone und goTab. */
function _crewStartLive(){
  if (!_crewReady()) return;
  _crewIds().forEach(id => {
    if (_crewSubs[id]) return;
    try {
      _crewSubs[id] = window.FB.onSnapshot(_crewRef(id), snap => {
        if (!snap.exists()) { _crewDrop(id); _crewRender(); return; }
        const doc = { id: snap.id, ...snap.data() };
        if (!(doc.members || []).includes(_fbUser && _fbUser.uid)) { _crewDrop(id); _crewRender(); return; }
        _crews[id] = doc;
        _crewLoadProfiles();
        _crewRender();
      }, err => console.warn('[GymTrack] Crew-Listener:', err && err.code || err));
    } catch(_){}
  });
  _crewInviteWatch();
}
function _crewStopOne(id){
  if (_crewSubs[id]) { try { _crewSubs[id](); } catch(_){} delete _crewSubs[id]; }
}
function _crewStopLive(){
  Object.keys(_crewSubs).forEach(_crewStopOne);
  if (_crewInvSub) { try { _crewInvSub(); } catch(_){} _crewInvSub = null; }
}

/* ── Einladungen ─────────────────────────────────────────────────────────
   Beim Gruenden ausgewaehlte Freunde bekommen eine Einladung statt still in
   die Gruppe gesteckt zu werden: die Rules erlauben ohnehin nur, die EIGENE
   uid in members zu schreiben — und ungefragt in einer Gruppe zu landen waere
   auch als Verhalten falsch. Doc-ID ist fest `<cid>__<uid>`, dadurch kann
   dieselbe Einladung nie doppelt entstehen (gleiches Muster wie _reqId). */
function _crewInvId(cid, uid){ return cid + '__' + uid; }
function _crewInviteWatch(){
  if (!_crewReady() || _crewInvSub) return;
  try {
    const q = window.FB.query(window.FB.collection('crew_invites'),
      window.FB.where('to', '==', _fbUser.uid));
    _crewInvSub = window.FB.onSnapshot(q, snap => {
      _crewInvites = [];
      snap.forEach(d => _crewInvites.push({ id: d.id, ...d.data() }));
      _crewRender();
    }, () => {});
  } catch(_){}
}
async function _crewInvite(cid, uids){
  if (!_crewReady() || !uids || !uids.length) return;
  const name = (S.userName || _fbUser.displayName || 'Jemand').slice(0, 30);
  await Promise.all(uids.slice(0, CREW_MAX).map(uid =>
    window.FB.setDoc(window.FB.doc('crew_invites', _crewInvId(cid, uid)), {
      cid, to: uid, from: _fbUser.uid, fromName: name,
      crewName: (_crews[cid] && _crews[cid].name || '').slice(0, 24), ts: Date.now()
    }).catch(e => console.warn('[GymTrack] Crew-Einladung:', e && e.code || e))
  ));
}
async function crewAcceptInvite(id, cid){
  const inv = _crewInvites.find(i => i.id === id);
  await crewJoin(cid);
  try { await window.FB.deleteDoc(window.FB.doc('crew_invites', id)); } catch(_){}
  _crewInvites = _crewInvites.filter(i => i.id !== id);
  if (!inv) _crewRender();
}
async function crewDeclineInvite(id){
  haptic(6);
  try { await window.FB.deleteDoc(window.FB.doc('crew_invites', id)); } catch(_){}
  _crewInvites = _crewInvites.filter(i => i.id !== id);
  _crewRender();
}

/* ── Gruenden · Beitreten · Verlassen ────────────────────────────────────── */

async function crewCreate(name, goal, typ, eingeladene){
  if (_crewBusy) return;
  if (!_crewReady()) { alert('Dafür musst du angemeldet sein und die Community aktiviert haben.'); return; }
  if (_crewIds().length >= CREW_MAX_MINE) { alert('Mehr als ' + CREW_MAX_MINE + ' Gruppen gehen nicht.'); return; }
  name = (name || '').trim().slice(0, 24);
  const def = crewGoalDef(typ);
  goal = Math.max(def.min, Math.min(def.max, Math.round(+goal || 0)));
  if (!name) { alert('Gib deiner Gruppe einen Namen.'); return; }
  _crewBusy = true;
  try {
    let id = '';
    // Doc-ID ist der Beitrittscode. Kollision faengt der Lesevorgang ab.
    for (let i = 0; i < 6 && !id; i++) {
      const c = _crewNewCode();
      const s = await window.FB.getDoc(_crewRef(c));
      if (!s.exists()) id = c;
    }
    if (!id) throw new Error('kein freier Code');
    const jetzt = Date.now();
    await window.FB.setDoc(_crewRef(id), {
      name, owner: _fbUser.uid, members: [_fbUser.uid], goal, goalType: typ in CREW_GOALS ? typ : 'ses',
      weekKey: crewWeekKey(), wk: {}, streak: 0, hist: [],
      createdAt: jetzt, updatedAt: jetzt
    });
    _crewAdd(id);
    closeOv('ov-crew');
    haptic(12);
    await _crewLoad(id, true);
    if (eingeladene && eingeladene.length) await _crewInvite(id, eingeladene);
    await _crewPushOne(id);
    await _crewLoad(id, true);
    _crewStartLive();
    _crewRender();
  } catch(e) {
    console.warn('[GymTrack] Gruppe gründen:', e);
    alert('Gruppe konnte nicht angelegt werden.\n' + (e && e.code || e));
  } finally { _crewBusy = false; }
}

async function crewJoin(code){
  if (_crewBusy) return;
  if (!_crewReady()) { alert('Dafür musst du angemeldet sein und die Community aktiviert haben.'); return; }
  code = (code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (code.length !== 6) { alert('Der Gruppen-Code besteht aus 6 Zeichen.'); return; }
  if (_crewIds().includes(code)) { closeOv('ov-crew'); return; }
  if (_crewIds().length >= CREW_MAX_MINE) { alert('Mehr als ' + CREW_MAX_MINE + ' Gruppen gehen nicht.'); return; }
  _crewBusy = true;
  try {
    const snap = await window.FB.getDoc(_crewRef(code));
    if (!snap.exists()) { alert('Keine Gruppe mit diesem Code gefunden.'); return; }
    const d = snap.data();
    const members = d.members || [];
    if (!members.includes(_fbUser.uid)) {
      if (members.length >= CREW_MAX) { alert('Diese Gruppe ist voll (' + CREW_MAX + ' Mitglieder).'); return; }
      await window.FB.updateDoc(_crewRef(code), { members: members.concat(_fbUser.uid), updatedAt: Date.now() });
    }
    _crewAdd(code);
    closeOv('ov-crew');
    haptic(12);
    await _crewLoad(code, true);
    await _crewPushOne(code);
    await _crewLoad(code, true);
    _crewStartLive();
    _crewRender();
  } catch(e) {
    console.warn('[GymTrack] Gruppe beitreten:', e);
    alert('Beitritt fehlgeschlagen.\n' + (e && e.code || e));
  } finally { _crewBusy = false; }
}

/* Verlassen. Der Eigentuemer loest die Gruppe fuer alle auf (Uebergabe ist
   nicht Teil von v1), das letzte verbleibende Mitglied loescht das Dokument
   mit — sonst blieben verwaiste Gruppen stehen. */
async function crewLeave(id){
  const c = _crews[id || _crewOpen]; if (_crewBusy || !c) return;
  const mitglieder = (c.members || []).length;
  const owner = _crewIsOwner(c);
  const frage = owner
    ? 'Gruppe wird für alle ' + mitglieder + (mitglieder === 1 ? ' Mitglied' : ' Mitglieder') + ' aufgelöst. Fortfahren?'
    : 'Gruppe „' + c.name + '" wirklich verlassen?';
  if (!confirm(frage)) return;
  _crewBusy = true;
  try {
    _crewStopOne(c.id);
    if (owner || mitglieder <= 1) {
      await window.FB.deleteDoc(_crewRef(c.id));
    } else {
      const wk = { ...c.wk };
      delete wk[_fbUser.uid];
      await window.FB.updateDoc(_crewRef(c.id), {
        members: (c.members || []).filter(u => u !== _fbUser.uid),
        wk, updatedAt: Date.now()
      });
    }
    _crewDrop(c.id);
    try { closeOv('ov-crew'); } catch(_){}
    haptic(10);
    if (_crewOpen === c.id) { _crewOpen = null; setSocTab('home'); return; }
    _crewRender();
  } catch(e) {
    console.warn('[GymTrack] Gruppe verlassen:', e);
    alert('Hat nicht geklappt.\n' + (e && e.code || e));
    _crewStartLive();
  } finally { _crewBusy = false; }
}

/* Eigentuemer entfernt ein Mitglied. */
async function crewKick(uid){
  const c = _crews[_crewOpen];
  if (_crewBusy || !c || !_crewIsOwner(c) || uid === _fbUser.uid) return;
  const p = _crewProfs[uid];
  if (!confirm((p && p.name ? p.name : 'Mitglied') + ' aus der Gruppe entfernen?')) return;
  _crewBusy = true;
  try {
    await window.FB.updateDoc(_crewRef(c.id), {
      members: (c.members || []).filter(u => u !== uid),
      updatedAt: Date.now()
    });
    haptic(8);
    crewOpenSettings();
  } catch(e) {
    console.warn('[GymTrack] Mitglied entfernen:', e);
    alert('Hat nicht geklappt.\n' + (e && e.code || e));
  } finally { _crewBusy = false; }
}

async function crewSaveSettings(){
  const c = _crews[_crewOpen];
  if (_crewBusy || !c || !_crewIsOwner(c)) return;
  const feld = document.getElementById('crew-set-name');
  const name = (feld && feld.value || '').trim().slice(0, 24);
  const def  = crewGoalDef(c.goalType);
  const goal = Math.max(def.min, Math.min(def.max, Math.round(+_crewNewGoal || 0)));
  if (!name) { alert('Gib deiner Gruppe einen Namen.'); return; }
  _crewBusy = true;
  try {
    await window.FB.updateDoc(_crewRef(c.id), { name, goal, updatedAt: Date.now() });
    closeOv('ov-crew');
    haptic(10);
  } catch(e) {
    console.warn('[GymTrack] Gruppe speichern:', e);
    alert('Hat nicht geklappt.\n' + (e && e.code || e));
  } finally { _crewBusy = false; }
}

/* ── Teilen ──────────────────────────────────────────────────────────────── */

/* NATIVE APP ZUERST: der https-Link ist nur der klickbare Traeger, der
   Empfaenger landet ueber ?crew=CODE bzw. den Deep-Link in der App. */
function crewShareLink(id){
  const web = (typeof GT_WEB === 'string' && GT_WEB) ? GT_WEB : '';
  return web ? web.replace(/\/?$/, '/') + '?crew=' + id : 'gymtrack://crew/' + id;
}
function crewCopyCode(btn){
  const c = _crews[_crewOpen]; if (!c) return;
  try { navigator.clipboard.writeText(c.id); } catch(_){}
  haptic(6);
  if (btn) { const alt = btn.textContent; btn.textContent = 'Kopiert'; setTimeout(() => { btn.textContent = alt; }, 1400); }
}
async function crewShare(id){
  const c = _crews[id || _crewOpen]; if (!c) return;
  haptic(8);
  const txt = 'Komm in meine Gruppe „' + c.name + '" bei MyGymTrack — Code: ' + c.id + '\n' + crewShareLink(c.id);
  try {
    if (navigator.share) { await navigator.share({ text: txt }); return; }
  } catch(_) { return; }   // Nutzer hat den Teilen-Dialog abgebrochen
  try {
    navigator.clipboard.writeText(txt);
    if (typeof showUpdateToast === 'function') showUpdateToast(tr('Einladung kopiert'), { autoHide: 2200 });
  } catch(_){}
}
/* QR ueber das ohnehin schon lazy geladene qrcodejs (gleicher Weg wie showFrQR). */
function crewShowQR(){
  const c = _crews[_crewOpen]; if (!c) return;
  const host = document.getElementById('crew-qr-host'); if (!host) return;
  if (host.dataset.on === '1') { host.dataset.on = '0'; host.innerHTML = ''; return; }
  host.dataset.on = '1';
  host.innerHTML = '<div class="soc-empty" style="padding:10px">Lade QR-Code…</div>';
  const bauen = () => {
    host.innerHTML = '';
    try { new QRCode(host, { text: crewShareLink(c.id), width: 168, height: 168, correctLevel: QRCode.CorrectLevel.M }); }
    catch(_) { host.innerHTML = '<div class="soc-empty" style="padding:10px">QR-Code nicht verfügbar</div>'; }
  };
  if (window.QRCode) return bauen();
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
  s.onload = bauen;
  s.onerror = () => { host.innerHTML = '<div class="soc-empty" style="padding:10px">QR-Code nicht verfügbar</div>'; };
  document.head.appendChild(s);
}

/* ── Sheets ──────────────────────────────────────────────────────────────── */

function _crewSheet(titel, html){
  const t = document.getElementById('crew-sh-title');
  const b = document.getElementById('crew-sh-body');
  if (!t || !b) return;
  t.textContent = tr(titel);
  b.innerHTML = html;
  openOv('ov-crew');
}
function crewGoal(delta){
  const def = crewGoalDef(_crewNewType);
  _crewNewGoal = Math.max(def.min, Math.min(def.max, _crewNewGoal + delta * def.schritt));
  const el = document.getElementById('crew-goal-val');
  if (el) el.textContent = _crewVal(_crewNewGoal, _crewNewType);
  haptic(4);
}
function crewSetType(t){
  _crewNewType = t in CREW_GOALS ? t : 'ses';
  const def = crewGoalDef(_crewNewType);
  _crewNewGoal = Math.max(def.min, Math.min(def.max, def.schritt * (_crewNewType === 'vol' ? 20 : _crewNewType === 'min' ? 10 : _crewNewType === 'each' ? 3 : 12)));
  haptic(6);
  crewOpenCreate(true);
}
function _crewTypeChips(){
  return `<div class="soc-chips" style="flex-wrap:wrap">${Object.keys(CREW_GOALS).map(t =>
    `<button class="soc-chip${t === _crewNewType ? ' on' : ''}" onclick="crewSetType('${t}')">${CREW_GOALS[t].label}</button>`).join('')}</div>
    <div class="soc-empty" style="padding:0 2px 12px;text-align:left;font-size:13px">${crewGoalDef(_crewNewType).hilfe}</div>`;
}
/* Freundes-Auswahl beim Gruenden. Ausgewaehlte bekommen eine Einladung —
   niemand landet ungefragt in einer Gruppe. */
function crewTogglePick(uid){
  _crewPick = _crewPick.includes(uid) ? _crewPick.filter(u => u !== uid) : _crewPick.concat(uid);
  haptic(4);
  const el = document.querySelector(`.crew-pick[data-u="${uid}"]`);
  if (el) el.classList.toggle('on', _crewPick.includes(uid));
  const n = document.getElementById('crew-pick-n');
  if (n) n.textContent = _crewPick.length ? ' · ' + _crewPick.length : '';
}
function _crewPickList(){
  const freunde = (_socCache || []).filter(p => p.uid !== _fbUser?.uid && !(S.blocked || []).includes(p.uid));
  if (!freunde.length) return `<div class="soc-empty" style="padding:8px 2px;text-align:left">Noch keine Freunde — du kannst die Gruppe auch später per Code teilen.</div>`;
  return freunde.map(p => `<div class="crew-pick${_crewPick.includes(p.uid) ? ' on' : ''}" data-u="${esc(p.uid)}" onclick="crewTogglePick('${esc(p.uid)}')">
      <div class="fr-ava" style="width:34px;height:34px;font-size:12px">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : _socInitials(p.name)}</div>
      <div style="flex:1;min-width:0"><div class="crew-mname">${esc(p.name || 'Freund')}</div></div>
      <span class="crew-tick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
    </div>`).join('');
}
function crewOpenCreate(behalten){
  haptic(8);
  if (!behalten) { _crewNewType = 'ses'; _crewNewGoal = 12; _crewPick = []; }
  const merk = behalten ? (document.getElementById('crew-new-name')?.value || '') : '';
  _crewSheet('Gruppe erstellen', `
    <div class="crew-field">
      <label for="crew-new-name">Name</label>
      <input id="crew-new-name" maxlength="24" placeholder="z.B. Eisenpark Crew" autocomplete="off" spellcheck="false" value="${esc(merk)}">
    </div>
    <div class="crew-field">
      <label>Ziel der Woche</label>
      ${_crewTypeChips()}
      <div class="crew-step">
        <button onclick="crewGoal(-1)" aria-label="weniger">−</button>
        <span id="crew-goal-val">${_crewVal(_crewNewGoal, _crewNewType)}</span>
        <button onclick="crewGoal(1)" aria-label="mehr">+</button>
      </div>
    </div>
    <div class="crew-field">
      <label>Wen einladen<span id="crew-pick-n">${_crewPick.length ? ' · ' + _crewPick.length : ''}</span></label>
      ${_crewPickList()}
    </div>
    <button class="btn btn-acc" onclick="crewCreate(document.getElementById('crew-new-name').value, _crewNewGoal, _crewNewType, _crewPick)">Gruppe erstellen</button>`);
  if (!behalten) setTimeout(() => { const el = document.getElementById('crew-new-name'); if (el) el.focus(); }, 320);
}
function crewOpenJoin(prefill){
  haptic(8);
  _crewSheet('Gruppe beitreten', `
    <div class="crew-field">
      <label for="crew-join-code">Gruppen-Code</label>
      <input id="crew-join-code" class="crew-code-input" maxlength="6" placeholder="ABC123"
        autocomplete="off" spellcheck="false" value="${esc((prefill || '').toUpperCase())}"
        oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9]/g,'')">
    </div>
    <div class="soc-empty" style="padding:4px 2px 16px;text-align:left">Den Code bekommst du von jemandem aus der Gruppe. Gruppen sind nicht durchsuchbar.</div>
    <button class="btn btn-acc" onclick="crewJoin(document.getElementById('crew-join-code').value)">Beitreten</button>`);
  setTimeout(() => { const el = document.getElementById('crew-join-code'); if (el) el.focus(); }, 320);
}
function crewOpenSettings(){
  const c = _crews[_crewOpen];
  if (!c || !_crewIsOwner(c)) return;
  haptic(8);
  _crewNewGoal = +c.goal || 12;
  const def = crewGoalDef(c.goalType);
  const andere = (c.members || []).filter(u => u !== _fbUser.uid);
  _crewSheet('Gruppe verwalten', `
    <div class="crew-field">
      <label for="crew-set-name">Name</label>
      <input id="crew-set-name" maxlength="24" value="${esc(c.name || '')}" autocomplete="off" spellcheck="false">
    </div>
    <div class="crew-field">
      <label>Wochenziel · ${esc(def.label)}</label>
      <div class="crew-step">
        <button onclick="_crewNewGoal=Math.max(${def.min},_crewNewGoal-${def.schritt});document.getElementById('crew-goal-val').textContent=_crewVal(_crewNewGoal,'${c.goalType || 'ses'}');haptic(4)" aria-label="weniger">−</button>
        <span id="crew-goal-val">${_crewVal(_crewNewGoal, c.goalType)}</span>
        <button onclick="_crewNewGoal=Math.min(${def.max},_crewNewGoal+${def.schritt});document.getElementById('crew-goal-val').textContent=_crewVal(_crewNewGoal,'${c.goalType || 'ses'}');haptic(4)" aria-label="mehr">+</button>
      </div>
      <div class="soc-empty" style="padding:8px 2px 0;text-align:left;font-size:13px">Die Zielart lässt sich nachträglich nicht ändern — sonst stünde die Historie in zwei Einheiten da.</div>
    </div>
    <button class="btn btn-acc" onclick="crewSaveSettings()">Speichern</button>
    ${andere.length ? `<div class="fradd-sec">Mitglieder</div>` + andere.map(u => {
      const p = _crewProfs[u] || {};
      return `<div class="crew-mrow">
        <div class="fr-ava" style="width:34px;height:34px;font-size:12px">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : _socInitials(p.name)}</div>
        <div style="flex:1;min-width:0"><div class="crew-mname">${esc(p.name || 'Mitglied')}</div></div>
        <button class="fr-req-no" onclick="crewKick('${esc(u)}')">Entfernen</button>
      </div>`;
    }).join('') : ''}
    <div class="fradd-sec">Gruppe auflösen</div>
    <button class="btn crew-danger" onclick="crewLeave('${esc(c.id)}')">Gruppe auflösen</button>`);
}

/* ── Screen ──────────────────────────────────────────────────────────────── */

const _CREW_SVG = {
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  plus:  '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  share: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M8.5 7.5 12 4l3.5 3.5"/><path d="M5 12.5V18a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 18v-5.5"/></svg>',
  gear:  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 4v2.4M12 17.6V20M20 12h-2.4M6.4 12H4M17.66 6.34l-1.7 1.7M8.04 15.96l-1.7 1.7M17.66 17.66l-1.7-1.7M8.04 8.04L6.34 6.34"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
};

/* Der Gruppen-Abschnitt der Freunde-Uebersicht: Kopfzeile mit +-Knopf, offene
   Einladungen, je Gruppe eine Karte mit Balken. Ohne Gruppe steht hier ein
   grosses Feld „Gruppe erstellen" statt einer schmalen Zeile — es ist der
   Einstieg, nicht eine Kleinigkeit am Rand. */
function _crewHomeBlock(){
  _crewRender();
  _crewStartLive();
  _crewLoadAll().then(() => { _crewRender(); return _crewPush(); })
    .then(() => _crewLoadAll(true)).then(() => _crewRender()).catch(() => {});
}
function _crewHomeHTML(demoDoc){
  const crews = demoDoc ? [demoDoc] : _crewMine();
  const kopf = `<div class="soc-sec"><span>Gruppen</span>
    <button class="crew-add" onclick="crewOpenCreate()" aria-label="Gruppe erstellen">${_CREW_SVG.plus}</button></div>`;
  const einladungen = _crewInvites.map(i => `<div class="crew-inv">
      <div class="crew-teaser-ico">${_CREW_SVG.users}</div>
      <div style="flex:1;min-width:0">
        <div class="fr-name"><span>${esc(i.crewName || 'Gruppe')}</span></div>
        <div class="fr-sub">${esc(i.fromName || 'Jemand')} lädt dich ein</div>
      </div>
      <div class="fr-req-btns">
        <button class="fr-req-ok" onclick="crewAcceptInvite('${esc(i.id)}','${esc(i.cid)}')">Beitreten</button>
        <button class="fr-req-no" onclick="crewDeclineInvite('${esc(i.id)}')">Nein</button>
      </div>
    </div>`).join('');
  if (!crews.length) {
    // Eine schmale Zeile, kein Werbeblock: der Kasten mit Erklärtext und zwei
    // Knöpfen fuellte ohne Gruppe die halbe Freunde-Seite und schob Freundes-
    // liste, Rangliste und Karte aus dem Bild.
    return kopf + einladungen + `<div class="crew-slim" onclick="crewOpenCreate()">
      <span class="crew-slim-ico">${_CREW_SVG.users}</span>
      <span class="crew-slim-txt">Gruppe hinzufügen</span>
      <button class="crew-slim-join" onclick="event.stopPropagation();crewOpenJoin()">Code</button>
    </div>`;
  }
  return kopf + einladungen + crews.map(c => _crewMiniHTML(c)).join('');
}
function _crewMiniHTML(c){
  const aktuell = c.weekKey === crewWeekKey();
  const typ     = c.goalType || 'ses';
  const goal    = Math.max(1, +c.goal || 1);
  const each    = typ === 'each';
  const total   = !aktuell ? 0 : (each ? (c.members || []).filter(u => (+(c.wk || {})[u] || 0) >= goal).length : crewTotal(c));
  const soll    = each ? Math.max(1, (c.members || []).length) : goal;
  const rest    = Math.max(0, soll - total);
  const streak  = +c.streak || 0;
  crewBonusPruefen(c);
  return `<div class="crew-card crew-card-mini" onclick="crewOpenFull('${esc(c.id)}')">
    <div class="crew-head">
      <div style="flex:1;min-width:0">
        <div class="crew-name">${esc(c.name || 'Gruppe')}</div>
        <div class="crew-sub">${streak ? streak + (streak === 1 ? ' Woche in Folge' : ' Wochen in Folge') : crewGoalDef(typ).label + ' · Wochenziel'}</div>
      </div>
      <svg class="fr-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
    </div>
    <div class="crew-bar"><span style="width:${Math.min(100, Math.round(total / soll * 100))}%"></span></div>
    <div class="crew-barrow">
      <span class="crew-total">${each ? total + ' / ' + soll : _crewVal(total, typ) + ' / ' + _crewVal(goal, typ)}</span>
      <span class="crew-days">${rest === 0 ? 'Ziel geschafft' : (each ? rest + (rest === 1 ? ' fehlt noch' : ' fehlen noch') : 'Noch ' + _crewVal(rest, typ))}</span>
    </div>
  </div>`;
}

/* ── Gruppen-Belohnung ───────────────────────────────────────────────────
   Schafft die Gruppe ihr Wochenziel, bekommt jedes Mitglied 120 Punkte fuers
   eigene Level (PTS_PER.crewWeek). Zwei Bedingungen halten das sauber:

   - Nur mit eigenem Beitrag. Sonst zoege ein Trittbrettfahrer jede Woche
     Punkte aus der Arbeit der anderen.
   - Nur einmal je Woche, erkannt am Wochenschluessel des Gruppendokuments.
     Der Eintrag liegt lokal; mehrfaches Oeffnen der Ansicht zahlt nicht
     mehrfach aus. */
function crewBonusPruefen(c){
  if (!c || c.weekKey !== crewWeekKey()) return;
  const uid = _fbUser?.uid;
  if (!uid || !(+(c.wk || {})[uid] > 0)) return;      // ohne eigenen Beitrag nichts
  const typ  = c.goalType || 'ses';
  const each = typ === 'each';
  const goal = Math.max(1, +c.goal || 1);
  const total = each ? (c.members || []).filter(u => (+(c.wk || {})[u] || 0) >= goal).length : crewTotal(c);
  const soll  = each ? Math.max(1, (c.members || []).length) : goal;
  if (total < soll) return;
  let b; try { b = JSON.parse(localStorage.getItem('gt_crewBonus') || '{}'); } catch(e){ b = {}; }
  if (!Array.isArray(b.w)) b.w = [];
  const k = c.id + '|' + c.weekKey;                  // je Gruppe und Woche einmal
  if (b.w.includes(k)) return;
  b.w.push(k);
  if (b.w.length > 300) b.w = b.w.slice(-300);       // Deckel gegen unbegrenztes Wachsen
  try { localStorage.setItem('gt_crewBonus', JSON.stringify(b)); } catch(e){}
  if (typeof _renderLevelBadge === 'function') _renderLevelBadge();
}

/* Volle Ansicht einer Gruppe (setSocTab('crew') zeigt die zuletzt geoeffnete). */
function crewOpenFull(id){ _crewOpen = id; haptic(6); setSocTab('crew'); }
function _renderSocCrew(body){
  if (!_crewOpen || !_crewIds().includes(_crewOpen)) _crewOpen = _crewIds()[0] || null;
  body.innerHTML = `${_socBackBar('Gruppe')}<div id="crew-host"></div>`;
  _crewRedeemPending();
  _crewRender();
  _crewStartLive();
  if (!_crewOpen) return;
  _crewLoad(_crewOpen).then(() => { _crewRender(); return _crewPushOne(_crewOpen); })
    .then(() => _crewLoad(_crewOpen, true)).then(() => _crewRender()).catch(() => {});
}

function _crewRender(){
  const host = document.getElementById('crew-host');
  // Auf der Freunde-Uebersicht haengt nur der Kurzblock im DOM — Live-Updates
  // muessen auch dort ankommen, sonst steht der Balken still, bis man die volle
  // Ansicht oeffnet.
  if (!host) {
    const mini = document.getElementById('fr-crew-host');
    if (mini) mini.innerHTML = _crewHomeHTML();
    return;
  }
  const c = _crews[_crewOpen];
  if (!c) {
    host.innerHTML = _crewErr
      ? `<div class="soc-empty">Gruppe konnte nicht geladen werden.<br>${esc(_crewErr)}</div>`
      : (_crewOpen ? `<div class="soc-empty"><span class="fr-spin" style="display:inline-block;vertical-align:-3px"></span>Lade Gruppe…</div>`
                   : _crewHomeHTML());
    return;
  }
  host.innerHTML = _crewCardHTML(c);
}

function _crewCardHTML(c){
  const aktuell = c.weekKey === crewWeekKey();
  const wk      = aktuell ? (c.wk || {}) : {};
  const typ     = c.goalType || 'ses';
  const each    = typ === 'each';
  const goal    = Math.max(1, +c.goal || 1);
  const total   = each ? (c.members || []).filter(u => (+wk[u] || 0) >= goal).length : (aktuell ? crewTotal(c) : 0);
  const soll    = each ? Math.max(1, (c.members || []).length) : goal;
  const rest    = Math.max(0, soll - total);
  const tage    = crewDaysLeft(Date.now());
  const streak  = +c.streak || 0;
  const anz     = (c.members || []).length;
  const meins   = _fbUser ? (+wk[_fbUser.uid] || 0) : 0;

  const reihen = (c.members || [])
    .map(u => ({ uid: u, n: +wk[u] || 0, p: _crewProfs[u] || null }))
    .sort((a, b) => b.n - a.n);
  const bestN = Math.max(1, ...reihen.map(r => r.n));
  const hist  = (Array.isArray(c.hist) ? c.hist : []).slice(-CREW_HIST);

  return `
  <div class="crew-card">
    <div class="crew-head">
      <div style="flex:1;min-width:0">
        <div class="crew-name">${esc(c.name || 'Gruppe')}</div>
        <div class="crew-sub">${anz} ${anz === 1 ? 'Mitglied' : 'Mitglieder'} · Code ${esc(c.id)}</div>
      </div>
      <button class="crew-icobtn" onclick="crewShare('${esc(c.id)}')" aria-label="Code teilen">${_CREW_SVG.share}</button>
      ${_crewIsOwner(c) ? `<button class="crew-icobtn" onclick="crewOpenSettings()" aria-label="Gruppe verwalten">${_CREW_SVG.gear}</button>` : ''}
    </div>

    <div class="crew-bar"><span style="width:${Math.min(100, Math.round(total / soll * 100))}%"></span></div>
    <div class="crew-barrow">
      <span class="crew-total">${each ? total + ' / ' + soll : _crewVal(total, typ) + ' / ' + _crewVal(goal, typ)}</span>
      <span class="crew-days">${tage === 0 ? 'Letzter Tag der Woche' : 'Noch ' + tage + (tage === 1 ? ' Tag' : ' Tage')}</span>
    </div>
    <div class="crew-hint">${rest === 0
      ? 'Wochenziel geschafft — jeder mit Beitrag bekommt ' + PTS_PER.crewWeek + ' Punkte, der Streak wächst am Montag.'
      : (each ? rest + (rest === 1 ? ' Mitglied hat sein Ziel noch nicht' : ' Mitglieder haben ihr Ziel noch nicht')
              : 'Noch ' + _crewVal(rest, typ) + ' bis Sonntag')}</div>

    <div class="crew-stats">
      <div class="crew-stat"><span class="crew-stat-v">${streak}</span><span class="crew-stat-l">${streak === 1 ? 'Woche in Folge' : 'Wochen in Folge'}</span></div>
      <div class="crew-stat"><span class="crew-stat-v">${_crewVal(meins, typ)}</span><span class="crew-stat-l">Dein Beitrag</span></div>
    </div>
  </div>

  <div class="crew-members">
    ${reihen.map(r => {
      const p   = r.p || {};
      const ich = !!(_fbUser && r.uid === _fbUser.uid);
      const nam = p.name || (ich ? (S.userName || 'Du') : 'Mitglied');
      const ava = p.photo ? `<img src="${esc(p.photo)}" alt="">` : _socInitials(nam);
      const ok  = each && r.n >= goal;
      return `<div class="crew-mrow${ich ? ' me' : ''}">
        <div class="fr-ava" style="width:34px;height:34px;font-size:12px">${ava}</div>
        <div style="flex:1;min-width:0">
          <div class="crew-mname">${esc(nam)}${ich ? ' (du)' : ''}${c.owner === r.uid ? '<span class="crew-owner">Gründer</span>' : ''}${ok ? '<span class="crew-owner">geschafft</span>' : ''}</div>
          <div class="crew-mbar"><span style="width:${r.n ? Math.round(r.n / bestN * 100) : 0}%"></span></div>
        </div>
        <span class="crew-mval${r.n ? '' : ' zero'}">${r.n ? _crewVal(r.n, typ) : '·'}</span>
      </div>`;
    }).join('')}
  </div>

  ${hist.length ? `<div class="crew-hist">
    <div class="crew-hist-l">${hist.length === 1 ? 'Letzte Woche' : 'Letzte ' + hist.length + ' Wochen'}</div>
    <div class="crew-hist-row">${hist.map(h =>
      `<span class="crew-hp${h.done ? ' ok' : ''}" title="${esc(h.key || '')} · ${h.total || 0}/${h.goal || 0}">${h.done ? _CREW_SVG.check : _CREW_SVG.cross}</span>`
    ).join('')}</div>
  </div>` : ''}

  <div class="soc-code-card" style="margin-top:16px">
    <div class="soc-code">${esc(c.id)}</div>
    <div class="soc-code-btns">
      <button onclick="crewCopyCode(this)">Kopieren</button>
      <button onclick="crewShare('${esc(c.id)}')">Teilen</button>
      <button onclick="crewShowQR()">QR-Code</button>
    </div>
    <div id="crew-qr-host" style="margin-top:14px"></div>
  </div>

  ${_crewIsOwner(c) ? '' : `<button class="btn crew-danger" style="margin-top:14px" onclick="crewLeave('${esc(c.id)}')">Gruppe verlassen</button>`}`;
}

/* Beitritts-Link einloesen (?crew=CODE bzw. gymtrack://crew/CODE). Der Code
   wird beim Start in sessionStorage geparkt und hier eingeloest, sobald der
   Gruppen-Bereich offen ist — gleicher Weg wie ?add=CODE beim Freundescode. */
function _crewRedeemPending(){
  try {
    const code = sessionStorage.getItem('gt_crewCode');
    if (!code) return;
    sessionStorage.removeItem('gt_crewCode');
    setTimeout(() => crewOpenJoin(code), 250);
  } catch(_){}
}

/* Deep-Link/Startparameter merken. Wird aus app-boot.js (Web/Kaltstart) und aus
   dem appUrlOpen-Listener (native App) aufgerufen. */
function _crewStashCode(code){
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (c.length !== 6) return false;
  try { sessionStorage.setItem('gt_crewCode', c); } catch(_){ return false; }
  return true;
}
