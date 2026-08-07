/* ── CREWS — gemeinsames Wochenziel im Community-Tab ──────────────────────
   Umsetzung der Design-Spec docs/superpowers/specs/2026-08-06-crews-design.md.

   Eine Crew ist eine feste Gruppe von bis zu 20 Leuten mit EINEM gemeinsamen
   Wochenziel. Kein Ranking innerhalb der Crew — wer dauerhaft Letzter waere,
   steigt aus; die kompetitive Variante gibt es schon als Monats-Rangliste.

   Datenhaltung: ein einziges Dokument crews/{code}. Die Doc-ID IST der
   6-Zeichen-Beitrittscode, dadurch ist Beitreten ein getDoc ohne Query und
   ohne Index. Die Map `wk: {uid: anzahl}` traegt den Wochenstand; jeder Client
   schreibt AUSSCHLIESSLICH seinen eigenen Feldpfad `wk.<uid>` und immer den
   ABSOLUTEN Wert. Disjunkte Feldpfade mergt Firestore ohne Transaktion, und
   ein wiederholter Schreibvorgang nach Netzwerkfehler ergibt denselben Stand
   statt doppelt zu zaehlen.

   Der Wochenschluessel ist bewusst NICHT getWeekKey(): dessen Grenze haengt am
   Wochentag des 1. Januar und verschiebt sich zusaetzlich mit der Sommerzeit.
   Fuer den Rollover muss der Schluessel exakt dann wechseln, wenn auch das
   Zaehlfenster wechselt — daher crewWeekKeyOf(): ISO-Datum des Montags. */

const CREW_ABC      = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // ohne O/0/I/1, wie _socCode()
const CREW_MAX      = 20;     // Mitglieder (auch in den Rules gedeckelt)
const CREW_GOAL_MIN = 3;
const CREW_GOAL_MAX = 60;
const CREW_MIN_SEC  = 900;    // 15 Minuten
const CREW_MIN_SETS = 6;
const CREW_HIST     = 8;      // gespeicherte Wochen

let _crew        = null;    // { id, ...Doc-Daten } oder null
let _crewSub     = null;    // onSnapshot-Unsubscribe
let _crewProfs   = {};      // uid → profiles-Doc (Namen/Bilder der Mitglieder)
let _crewBusy    = false;   // laufende Schreiboperation (Doppeltipp-Schutz)
let _crewLoading = false;
let _crewNewGoal = 12;      // Ziel-Stepper in den Sheets
let _crewErr     = '';      // letzte Fehlermeldung fuer den Screen

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

/* Summe des Wochenbalkens. Nur gueltig, solange der Schluessel im Doc zur
   laufenden Woche passt — steht dort noch die alte Woche, ist der Balken 0
   und der naechste Rollover raeumt auf. */
function crewTotal(data){
  const wk = (data && data.wk) || {};
  return Object.keys(wk).reduce((a, k) => a + (+wk[k] || 0), 0);
}

/* Neuer Doc-Zustand beim Wochenwechsel. Idempotent: der hist-Eintrag entsteht
   nur, wenn der letzte gespeicherte Eintrag einen anderen Schluessel traegt —
   sonst haengen zwei gleichzeitig geoeffnete Apps dieselbe Woche zweimal an. */
function crewRolloverData(data, neuerKey){
  const total = crewTotal(data);
  const goal  = +data.goal || 0;
  const done  = goal > 0 && total >= goal;
  const hist  = Array.isArray(data.hist) ? data.hist.slice() : [];
  const letzt = hist[hist.length - 1];
  if (!letzt || letzt.key !== data.weekKey) hist.push({ key: data.weekKey, total, goal, done });
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
function _crewIsOwner(){ return !!(_crew && _fbUser && _crew.owner === _fbUser.uid); }

/* Crew-Zuordnung lokal setzen. S.crewId steht in der hasOnly-Liste der
   users-Rules UND in CLOUD_NEUE_FELDER (js/app-update.js) — ohne den zweiten
   Eintrag wuerde ein noch nicht deployter Rules-Stand den KOMPLETTEN
   users-Push kippen statt nur den Crew-Teil. */
function _crewSetLocal(id){
  S.crewId = id || null;
  if (!id) _crew = null;
  persist();
}

async function _crewLoad(force){
  if (!S.crewId || !_crewReady()) { _crew = null; return null; }
  if (_crew && _crew.id === S.crewId && !force) return _crew;
  _crewLoading = true;
  try {
    const snap = await window.FB.getDoc(_crewRef(S.crewId));
    if (!snap.exists()) { _crewSetLocal(null); return null; }   // aufgeloest
    _crew = { id: snap.id, ...snap.data() };
    // Rausgeworfen oder auf einem anderen Geraet ausgetreten
    if (!(_crew.members || []).includes(_fbUser.uid)) { _crewSetLocal(null); return null; }
    _crewErr = '';
    _crewLoadProfiles();
    return _crew;
  } catch(e) {
    _crewErr = String(e && e.code || e);
    console.warn('[GymTrack] Crew laden:', _crewErr);
    return null;
  } finally { _crewLoading = false; }
}

/* Namen und Bilder der Mitglieder. Crew-Mitglieder sind nicht zwingend
   Freunde, deshalb ein eigener kleiner Zwischenspeicher statt _socCache. */
function _crewLoadProfiles(){
  if (!_crew) return;
  const fehlend = (_crew.members || []).filter(u => _crewProfs[u] === undefined);
  if (!fehlend.length) return;
  fehlend.forEach(u => { _crewProfs[u] = null; });   // nicht doppelt anfragen
  Promise.all(fehlend.map(u => window.FB.getDoc(window.FB.doc('profiles', u))
    .then(s => { if (s.exists()) _crewProfs[u] = s.data(); })
    .catch(() => {})))
    .then(() => { if (document.getElementById('crew-host')) _crewRender(); });
}

/* Eigenen Wochenstand schreiben — und, falls faellig, vorher den Rollover.
   Beides in EINER Transaktion, damit zwei gleichzeitig startende Clients nicht
   dieselbe Woche zweimal in die Historie schreiben.

   Zaehlen und Rollover landen bewusst nicht in getrennten Schreibvorgaengen:
   ein reiner Zaehl-Write darf weekKey mitschreiben (Rules-Zweig „zaehlen"),
   und wuerde er das VOR dem Rollover tun, waere die abgelaufene Woche samt
   Streak still verloren. */
async function _crewPush(){
  if (!_crewReady() || !S.crewId || !_fbUser) return;
  if (typeof window.FB.runTransaction !== 'function') return;
  const uid = _fbUser.uid;
  const n   = crewCountWeek(S.sessions, Date.now());
  try {
    await window.FB.runTransaction(async tx => {
      const ref  = _crewRef(S.crewId);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('crew-weg');
      const d = snap.data();
      if (!(d.members || []).includes(uid)) throw new Error('kein-mitglied');
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
    if (m.includes('crew-weg') || m.includes('kein-mitglied')) { _crewSetLocal(null); return; }
    console.warn('[GymTrack] Crew-Push:', e && e.code || e);
  }
}

/* Live-Updates auf das eine Crew-Dokument. Start/Stop analog _frStartLive —
   ein weiterlaufender Listener nach Tab-Wechsel ist im Repo schon einmal
   aufgetreten, deshalb haengt der Stop an setSocTab/setSocZone und goTab. */
function _crewStartLive(){
  _crewStopLive();
  if (!_crewReady() || !S.crewId) return;
  try {
    _crewSub = window.FB.onSnapshot(_crewRef(S.crewId), snap => {
      if (!snap.exists()) { _crewSetLocal(null); _crewRender(); return; }
      _crew = { id: snap.id, ...snap.data() };
      if (!(_crew.members || []).includes(_fbUser && _fbUser.uid)) { _crewSetLocal(null); _crewRender(); return; }
      _crewLoadProfiles();
      if (document.getElementById('crew-host') || document.getElementById('fr-crew-host')) _crewRender();
    }, err => console.warn('[GymTrack] Crew-Listener:', err && err.code || err));
  } catch(_){}
}
function _crewStopLive(){
  if (_crewSub) { try { _crewSub(); } catch(_){} _crewSub = null; }
}

/* ── Gruenden · Beitreten · Verlassen ────────────────────────────────────── */

async function crewCreate(name, goal){
  if (_crewBusy) return;
  if (!_crewReady()) { alert('Dafür musst du angemeldet sein und die Community aktiviert haben.'); return; }
  name = (name || '').trim().slice(0, 24);
  goal = Math.max(CREW_GOAL_MIN, Math.min(CREW_GOAL_MAX, Math.round(+goal || 0)));
  if (!name) { alert('Gib deiner Crew einen Namen.'); return; }
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
      name, owner: _fbUser.uid, members: [_fbUser.uid], goal,
      weekKey: crewWeekKey(), wk: {}, streak: 0, hist: [],
      createdAt: jetzt, updatedAt: jetzt
    });
    _crew = null;
    _crewSetLocal(id);
    closeOv('ov-crew');
    haptic(12);
    await _crewLoad(true);
    await _crewPush();
    await _crewLoad(true);
    _crewStartLive();
    _crewRender();
  } catch(e) {
    console.warn('[GymTrack] Crew gründen:', e);
    alert('Crew konnte nicht angelegt werden.\n' + (e && e.code || e));
  } finally { _crewBusy = false; }
}

async function crewJoin(code){
  if (_crewBusy) return;
  if (!_crewReady()) { alert('Dafür musst du angemeldet sein und die Community aktiviert haben.'); return; }
  code = (code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (code.length !== 6) { alert('Der Crew-Code besteht aus 6 Zeichen.'); return; }
  _crewBusy = true;
  try {
    const snap = await window.FB.getDoc(_crewRef(code));
    if (!snap.exists()) { alert('Keine Crew mit diesem Code gefunden.'); return; }
    const d = snap.data();
    const members = d.members || [];
    if (!members.includes(_fbUser.uid)) {
      if (members.length >= CREW_MAX) { alert('Diese Crew ist voll (' + CREW_MAX + ' Mitglieder).'); return; }
      await window.FB.updateDoc(_crewRef(code), { members: members.concat(_fbUser.uid), updatedAt: Date.now() });
    }
    _crew = null;
    _crewSetLocal(code);
    closeOv('ov-crew');
    haptic(12);
    await _crewLoad(true);
    await _crewPush();
    await _crewLoad(true);
    _crewStartLive();
    _crewRender();
  } catch(e) {
    console.warn('[GymTrack] Crew beitreten:', e);
    alert('Beitritt fehlgeschlagen.\n' + (e && e.code || e));
  } finally { _crewBusy = false; }
}

/* Verlassen. Der Eigentuemer loest die Crew fuer alle auf (Uebergabe ist nicht
   Teil von v1), das letzte verbleibende Mitglied loescht das Dokument mit —
   sonst blieben verwaiste Crews stehen. */
async function crewLeave(){
  if (_crewBusy || !_crew) return;
  const mitglieder = (_crew.members || []).length;
  const owner = _crewIsOwner();
  const frage = owner
    ? 'Crew wird für alle ' + mitglieder + (mitglieder === 1 ? ' Mitglied' : ' Mitglieder') + ' aufgelöst. Fortfahren?'
    : 'Crew „' + _crew.name + '" wirklich verlassen?';
  if (!confirm(frage)) return;
  _crewBusy = true;
  const id = _crew.id;
  try {
    _crewStopLive();
    if (owner || mitglieder <= 1) {
      await window.FB.deleteDoc(_crewRef(id));
    } else {
      const wk = { ..._crew.wk };
      delete wk[_fbUser.uid];
      await window.FB.updateDoc(_crewRef(id), {
        members: (_crew.members || []).filter(u => u !== _fbUser.uid),
        wk, updatedAt: Date.now()
      });
    }
    _crewSetLocal(null);
    try { closeOv('ov-crew'); } catch(_){}
    haptic(10);
    _crewRender();
  } catch(e) {
    console.warn('[GymTrack] Crew verlassen:', e);
    alert('Hat nicht geklappt.\n' + (e && e.code || e));
    _crewStartLive();
  } finally { _crewBusy = false; }
}

/* Eigentuemer entfernt ein Mitglied. */
async function crewKick(uid){
  if (_crewBusy || !_crew || !_crewIsOwner() || uid === _fbUser.uid) return;
  const p = _crewProfs[uid];
  if (!confirm((p && p.name ? p.name : 'Mitglied') + ' aus der Crew entfernen?')) return;
  _crewBusy = true;
  try {
    await window.FB.updateDoc(_crewRef(_crew.id), {
      members: (_crew.members || []).filter(u => u !== uid),
      updatedAt: Date.now()
    });
    haptic(8);
    crewOpenSettings();
  } catch(e) {
    console.warn('[GymTrack] Crew-Mitglied entfernen:', e);
    alert('Hat nicht geklappt.\n' + (e && e.code || e));
  } finally { _crewBusy = false; }
}

async function crewSaveSettings(){
  if (_crewBusy || !_crew || !_crewIsOwner()) return;
  const feld = document.getElementById('crew-set-name');
  const name = (feld && feld.value || '').trim().slice(0, 24);
  const goal = Math.max(CREW_GOAL_MIN, Math.min(CREW_GOAL_MAX, Math.round(+_crewNewGoal || 0)));
  if (!name) { alert('Gib deiner Crew einen Namen.'); return; }
  _crewBusy = true;
  try {
    await window.FB.updateDoc(_crewRef(_crew.id), { name, goal, updatedAt: Date.now() });
    closeOv('ov-crew');
    haptic(10);
  } catch(e) {
    console.warn('[GymTrack] Crew speichern:', e);
    alert('Hat nicht geklappt.\n' + (e && e.code || e));
  } finally { _crewBusy = false; }
}

/* ── Teilen ──────────────────────────────────────────────────────────────── */

/* NATIVE APP ZUERST: der https-Link ist nur der klickbare Traeger, der
   Empfaenger landet ueber ?crew=CODE bzw. den Deep-Link in der App. */
function crewShareLink(){
  const web = (typeof GT_WEB === 'string' && GT_WEB) ? GT_WEB : '';
  return web ? web.replace(/\/?$/, '/') + '?crew=' + _crew.id : 'gymtrack://crew/' + _crew.id;
}
function crewCopyCode(btn){
  if (!_crew) return;
  try { navigator.clipboard.writeText(_crew.id); } catch(_){}
  haptic(6);
  if (btn) { const alt = btn.textContent; btn.textContent = 'Kopiert'; setTimeout(() => { btn.textContent = alt; }, 1400); }
}
async function crewShare(){
  if (!_crew) return;
  haptic(8);
  const txt = 'Komm in meine Crew „' + _crew.name + '" bei MyGymTrack — Code: ' + _crew.id + '\n' + crewShareLink();
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
  if (!_crew) return;
  const host = document.getElementById('crew-qr-host'); if (!host) return;
  if (host.dataset.on === '1') { host.dataset.on = '0'; host.innerHTML = ''; return; }
  host.dataset.on = '1';
  host.innerHTML = '<div class="soc-empty" style="padding:10px">Lade QR-Code…</div>';
  const bauen = () => {
    host.innerHTML = '';
    try {
      new QRCode(host, { text: crewShareLink(), width: 168, height: 168, correctLevel: QRCode.CorrectLevel.M });
    } catch(_) { host.innerHTML = '<div class="soc-empty" style="padding:10px">QR-Code nicht verfügbar</div>'; }
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
  _crewNewGoal = Math.max(CREW_GOAL_MIN, Math.min(CREW_GOAL_MAX, _crewNewGoal + delta));
  const el = document.getElementById('crew-goal-val');
  if (el) el.textContent = _crewNewGoal;
  haptic(4);
}
function crewOpenCreate(){
  haptic(8);
  _crewNewGoal = 12;
  _crewSheet('Crew gründen', `
    <div class="crew-field">
      <label for="crew-new-name">Name</label>
      <input id="crew-new-name" maxlength="24" placeholder="z.B. Eisenpark Crew" autocomplete="off" spellcheck="false">
    </div>
    <div class="crew-field">
      <label>Wochenziel · Trainings der ganzen Crew</label>
      <div class="crew-step">
        <button onclick="crewGoal(-1)" aria-label="weniger">−</button>
        <span id="crew-goal-val">${_crewNewGoal}</span>
        <button onclick="crewGoal(1)" aria-label="mehr">+</button>
      </div>
    </div>
    <div class="soc-empty" style="padding:4px 2px 16px;text-align:left">Alle zahlen auf denselben Balken ein. Schafft ihr das Ziel, wächst der Crew-Streak um eine Woche.</div>
    <button class="btn btn-acc" onclick="crewCreate(document.getElementById('crew-new-name').value, _crewNewGoal)">Crew gründen</button>`);
  setTimeout(() => { const el = document.getElementById('crew-new-name'); if (el) el.focus(); }, 320);
}
function crewOpenJoin(prefill){
  haptic(8);
  _crewSheet('Crew beitreten', `
    <div class="crew-field">
      <label for="crew-join-code">Crew-Code</label>
      <input id="crew-join-code" class="crew-code-input" maxlength="6" placeholder="ABC123"
        autocomplete="off" spellcheck="false" value="${esc((prefill || '').toUpperCase())}"
        oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9]/g,'')">
    </div>
    <div class="soc-empty" style="padding:4px 2px 16px;text-align:left">Den Code bekommst du von jemandem aus der Crew. Crews sind nicht durchsuchbar.</div>
    <button class="btn btn-acc" onclick="crewJoin(document.getElementById('crew-join-code').value)">Beitreten</button>`);
  setTimeout(() => { const el = document.getElementById('crew-join-code'); if (el) el.focus(); }, 320);
}
function crewOpenSettings(){
  if (!_crew || !_crewIsOwner()) return;
  haptic(8);
  _crewNewGoal = +_crew.goal || 12;
  const andere = (_crew.members || []).filter(u => u !== _fbUser.uid);
  _crewSheet('Crew verwalten', `
    <div class="crew-field">
      <label for="crew-set-name">Name</label>
      <input id="crew-set-name" maxlength="24" value="${esc(_crew.name || '')}" autocomplete="off" spellcheck="false">
    </div>
    <div class="crew-field">
      <label>Wochenziel · Trainings der ganzen Crew</label>
      <div class="crew-step">
        <button onclick="crewGoal(-1)" aria-label="weniger">−</button>
        <span id="crew-goal-val">${_crewNewGoal}</span>
        <button onclick="crewGoal(1)" aria-label="mehr">+</button>
      </div>
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
    <div class="fradd-sec">Crew auflösen</div>
    <button class="btn crew-danger" onclick="crewLeave()">Crew auflösen</button>`);
}

/* ── Screen ──────────────────────────────────────────────────────────────── */

const _CREW_SVG = {
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  share: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M8.5 7.5 12 4l3.5 3.5"/><path d="M5 12.5V18a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 18v-5.5"/></svg>',
  gear:  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 4v2.4M12 17.6V20M20 12h-2.4M6.4 12H4M17.66 6.34l-1.7 1.7M8.04 15.96l-1.7 1.7M17.66 17.66l-1.7-1.7M8.04 8.04L6.34 6.34"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
};

/* ── Kurzfassung fuer die Freunde-Uebersicht ─────────────────────────────
   Nur Name, Balken und die eine Zeile, die zum Handeln bewegt. Alles Weitere
   (Beitragsliste, Historie, Code, Verwaltung) liegt eine Ebene tiefer — sonst
   waere die Uebersicht schon nach dem ersten Block voll. */
function _crewHomeBlock(){
  const host = document.getElementById('fr-crew-host'); if (!host) return;
  const zeichnen = () => {
    const h = document.getElementById('fr-crew-host'); if (!h) return;
    h.innerHTML = _crewHomeHTML();
  };
  zeichnen();
  if (S.crewId && !_crew) _crewLoad().then(zeichnen).catch(() => {});
  _crewStartLive();
  if (S.crewId) _crewPush().then(() => _crewLoad(true)).then(zeichnen).catch(() => {});
}
/* doc = optionales Crew-Dokument. Der Demo-Modus (Marketing-Screenshots) reicht
   hier seine erfundene Crew herein, statt die Markierung ein zweites Mal in
   eigener Handschrift nachzubauen. */
function _crewHomeHTML(doc){
  const c = doc || _crew;
  if (!doc && !S.crewId) {
    return `<div class="crew-teaser" onclick="crewOpenCreate()">
      <div class="crew-teaser-ico">${_CREW_SVG.users}</div>
      <div style="flex:1;min-width:0">
        <div class="fr-name"><span>Crew starten</span></div>
        <div class="fr-sub">Gemeinsames Wochenziel mit deinen Leuten — jedes Training zählt für alle.</div>
      </div>
      <button class="soc-more" onclick="event.stopPropagation();crewOpenJoin()">Code</button>
    </div>`;
  }
  if (!c) return `<div class="soc-empty" style="padding:14px 16px"><span class="fr-spin" style="display:inline-block;vertical-align:-3px"></span>Lade Crew…</div>`;
  const aktuell = c.weekKey === crewWeekKey();
  const total   = aktuell ? crewTotal(c) : 0;
  const goal    = Math.max(1, +c.goal || 1);
  const rest    = Math.max(0, goal - total);
  const streak  = +c.streak || 0;
  return `<div class="crew-card crew-card-mini" onclick="setSocTab('crew')">
    <div class="crew-head">
      <div style="flex:1;min-width:0">
        <div class="crew-name">${esc(c.name || 'Crew')}</div>
        <div class="crew-sub">${streak ? streak + (streak === 1 ? ' Woche in Folge' : ' Wochen in Folge') : 'Gemeinsames Wochenziel'}</div>
      </div>
      <svg class="fr-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
    </div>
    <div class="crew-bar"><span style="width:${Math.min(100, Math.round(total / goal * 100))}%"></span></div>
    <div class="crew-barrow">
      <span class="crew-total">${total} / ${goal}</span>
      <span class="crew-days">${rest === 0 ? 'Ziel geschafft' : 'Noch ' + rest + (rest === 1 ? ' Training' : ' Trainings')}</span>
    </div>
  </div>`;
}

/* Einstieg aus setSocTab('crew') — die volle Ansicht mit Zurueck-Zeile. */
function _renderSocCrew(body){
  body.innerHTML = `${_socBackBar('Crew')}<div id="crew-host"></div>`;
  _crewRedeemPending();
  _crewRender();
  _crewStartLive();
  if (!S.crewId) return;
  // Beim Oeffnen einmal den eigenen Stand schreiben — deckt Trainings ab, die
  // offline entstanden sind, und stoesst faellige Rollover an.
  _crewLoad()
    .then(() => { _crewRender(); return _crewPush(); })
    .then(() => _crewLoad(true))
    .then(() => _crewRender())
    .catch(() => {});
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
  if (!S.crewId) { host.innerHTML = _crewEmptyHTML(); return; }
  if (!_crew) {
    host.innerHTML = _crewErr
      ? `<div class="soc-empty">Crew konnte nicht geladen werden.<br>${esc(_crewErr)}</div>`
      : `<div class="soc-empty"><span class="fr-spin" style="display:inline-block;vertical-align:-3px"></span>Lade Crew…</div>`;
    return;
  }
  host.innerHTML = _crewCardHTML();
}

function _crewEmptyHTML(){
  return `<div class="fr-empty-hero">
    <div class="soc-gate-ico">${_CREW_SVG.users}</div>
    <div style="font-size:17px;font-weight:700">Noch keine Crew</div>
    <div class="soc-empty" style="padding:0">Eine Crew ist eine feste Gruppe mit einem gemeinsamen Wochenziel. Jedes Training zählt für alle — und der Crew-Streak zählt, wie viele Wochen ihr das Ziel in Folge geschafft habt.</div>
    <button class="btn btn-acc" style="max-width:240px" onclick="crewOpenCreate()">Crew gründen</button>
    <button class="btn" style="max-width:240px;margin-top:10px" onclick="crewOpenJoin()">Mit Code beitreten</button>
  </div>`;
}

function _crewCardHTML(){
  const aktuell = _crew.weekKey === crewWeekKey();
  const wk      = aktuell ? (_crew.wk || {}) : {};
  const total   = aktuell ? crewTotal(_crew) : 0;
  const goal    = Math.max(1, +_crew.goal || 1);
  const pct     = Math.min(100, Math.round(total / goal * 100));
  const rest    = Math.max(0, goal - total);
  const tage    = crewDaysLeft(Date.now());
  const streak  = +_crew.streak || 0;
  const anz     = (_crew.members || []).length;
  const meins   = _fbUser ? (+wk[_fbUser.uid] || 0) : 0;

  const reihen = (_crew.members || [])
    .map(u => ({ uid: u, n: +wk[u] || 0, p: _crewProfs[u] || null }))
    .sort((a, b) => b.n - a.n);
  const bestN = Math.max(1, ...reihen.map(r => r.n));
  const hist  = (Array.isArray(_crew.hist) ? _crew.hist : []).slice(-CREW_HIST);

  return `
  <div class="crew-card">
    <div class="crew-head">
      <div style="flex:1;min-width:0">
        <div class="crew-name">${esc(_crew.name || 'Crew')}</div>
        <div class="crew-sub">${anz} ${anz === 1 ? 'Mitglied' : 'Mitglieder'} · Code ${esc(_crew.id)}</div>
      </div>
      <button class="crew-icobtn" onclick="crewShare()" aria-label="Code teilen">${_CREW_SVG.share}</button>
      ${_crewIsOwner() ? `<button class="crew-icobtn" onclick="crewOpenSettings()" aria-label="Crew verwalten">${_CREW_SVG.gear}</button>` : ''}
    </div>

    <div class="crew-bar"><span style="width:${pct}%"></span></div>
    <div class="crew-barrow">
      <span class="crew-total">${total} / ${goal}</span>
      <span class="crew-days">${tage === 0 ? 'Letzter Tag der Woche' : 'Noch ' + tage + (tage === 1 ? ' Tag' : ' Tage')}</span>
    </div>
    <div class="crew-hint">${rest === 0
      ? 'Wochenziel geschafft — der Streak wächst am Montag.'
      : 'Noch ' + rest + (rest === 1 ? ' Training' : ' Trainings') + ' bis Sonntag'}</div>

    <div class="crew-stats">
      <div class="crew-stat"><span class="crew-stat-v">${streak}</span><span class="crew-stat-l">${streak === 1 ? 'Woche in Folge' : 'Wochen in Folge'}</span></div>
      <div class="crew-stat"><span class="crew-stat-v">${meins}</span><span class="crew-stat-l">Dein Beitrag</span></div>
    </div>
  </div>

  <div class="crew-members">
    ${reihen.map(r => {
      const p   = r.p || {};
      const ich = !!(_fbUser && r.uid === _fbUser.uid);
      const nam = p.name || (ich ? (S.userName || 'Du') : 'Mitglied');
      const ava = p.photo ? `<img src="${esc(p.photo)}" alt="">` : _socInitials(nam);
      return `<div class="crew-mrow${ich ? ' me' : ''}">
        <div class="fr-ava" style="width:34px;height:34px;font-size:12px">${ava}</div>
        <div style="flex:1;min-width:0">
          <div class="crew-mname">${esc(nam)}${ich ? ' (du)' : ''}${_crew.owner === r.uid ? '<span class="crew-owner">Gründer</span>' : ''}</div>
          <div class="crew-mbar"><span style="width:${r.n ? Math.round(r.n / bestN * 100) : 0}%"></span></div>
        </div>
        <span class="crew-mval${r.n ? '' : ' zero'}">${r.n || '·'}</span>
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
    <div class="soc-code">${esc(_crew.id)}</div>
    <div class="soc-code-btns">
      <button onclick="crewCopyCode(this)">Kopieren</button>
      <button onclick="crewShare()">Teilen</button>
      <button onclick="crewShowQR()">QR-Code</button>
    </div>
    <div id="crew-qr-host" style="margin-top:14px"></div>
  </div>

  ${_crewIsOwner() ? '' : `<button class="btn crew-danger" style="margin-top:14px" onclick="crewLeave()">Crew verlassen</button>`}`;
}

/* Beitritts-Link einloesen (?crew=CODE bzw. gymtrack://crew/CODE). Der Code
   wird beim Start in sessionStorage geparkt und hier eingeloest, sobald der
   Crew-Bereich offen ist — gleicher Weg wie ?add=CODE beim Freundescode. */
function _crewRedeemPending(){
  try {
    const code = sessionStorage.getItem('gt_crewCode');
    if (!code) return;
    sessionStorage.removeItem('gt_crewCode');
    setTimeout(() => {
      if (S.crewId) { alert('Du bist bereits in einer Crew. Verlasse sie zuerst, um einer anderen beizutreten.'); return; }
      crewOpenJoin(code);
    }, 250);
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
