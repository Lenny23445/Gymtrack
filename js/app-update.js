function _handleWaitingWorker(worker) {
  if (window._gymtrackUpdating) return;
  window._gymtrackUpdating = true;
  window._swUpdateRequested = true;
  try { sessionStorage.setItem('gt_just_updated', '1'); } catch (_) {}
  worker.postMessage({ type: 'SKIP_WAITING' });
}

// ── APP UPDATE ────────────────────────────────────────
// Primär: Direkter Versions-Check beim App-Start (unabhängig von SW-Events)
// Fallback: Standard-SW-Flow (updatefound → skipWaiting → controllerchange → reload)
let swReg = null;

function showUpdateToast(msg, opts) {
  const t = document.getElementById('update-toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showUpdateToast._t);
  const auto = opts && opts.autoHide;
  if (auto) showUpdateToast._t = setTimeout(() => t.classList.remove('show'), auto);
}

// Nach erfolgtem Update: kurzes Bestätigungs-Toast
try {
  if (sessionStorage.getItem('gt_just_updated') === '1') {
    sessionStorage.removeItem('gt_just_updated');
    setTimeout(() => showUpdateToast('✓ Update installiert – ' + APP_VERSION.replace('gymtrack-v',''), { autoHide: 3500 }), 600);
  }
} catch (_) {}

// Beim App-Start: sw.js direkt vom Server holen und Version vergleichen.
async function _runUpdateCheck() {
  if (window._gymtrackUpdating) return;
  if (!navigator.onLine) return;
  try {
    const bust = Date.now() + '-' + Math.random().toString(36).slice(2);
    const res  = await fetch('./sw.js?v=' + bust, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' } });
    if (!res.ok) return;
    const text = await res.text();
    const m    = text.match(/gymtrack-v\d+/);
    if (m && m[0] !== APP_VERSION && !window._gymtrackUpdating) {
      window._gymtrackUpdating = true;
      try { sessionStorage.setItem('gt_just_updated', '1'); } catch (_) {}
      await _doForceUpdate();
    }
  } catch (e) { /* silent */ }
}

// Einmalig kurz nach Start.
// Web/PWA: still automatisch aktualisieren (SW + Cache).
// Native (iOS/App Store): Inhalte sind gebündelt – nicht selbst ladbar.
// Stattdessen prüfen, ob eine neuere Version bereitsteht, und zum Update im
// App Store auffordern.
setTimeout(() => { if (_isNative()) _runNativeUpdateCheck(); else _runUpdateCheck(); }, 1200);
// Simulator-Auto-Unlock ENTFERNT (setzte gt_premiumDev=1 bei jedem Sim-Start →
// premGate feuerte nie, Paywall im Simulator untestbar). Simulator verhält sich
// jetzt wie Produktion und räumt die Altlast aus früheren Läufen weg; der
// MANUELLE Dev-Unlock (gt_premiumDev von Hand setzen) bleibt auf Web/Gerät möglich.
// Fürs KI-Testen im Simulator mit dem Founder-Konto anmelden.
setTimeout(async () => {
  if (!_isNative()) return;
  if (typeof DEMO_SEED !== 'undefined' && DEMO_SEED) return;   // Screenshot-Build: Premium-Unlock soll bleiben
  try {
    const env = await _getInstallInfo();
    // gt_premiumDevKeep = ausdrueckliche Ansage "der Unlock bleibt". Ohne diese
    // Ausnahme loescht der Simulator auch den VON HAND gesetzten Unlock wieder
    // — dann laesst sich im Simulator kein einziges Premium-Feature ansehen,
    // obwohl der Kommentar unten genau das offenhalten wollte. Das Flag muss
    // jemand bewusst setzen; automatisch setzt es niemand, die Paywall bleibt
    // also weiter testbar. Serverseitig aendert es nichts: der Worker prueft
    // das StoreKit-JWS, kein localStorage-Wert kommt dort durch.
    const keep = (() => { try { return localStorage.getItem('gt_premiumDevKeep') === '1'; } catch(_) { return false; } })();
    if (env && env.isSimulator && !keep) localStorage.removeItem('gt_premiumDev');
  } catch(_){}
}, 1200);

// ── NATIVE UPDATE (App Store) ─────────────────────────
// Vollautomatisch über Apples offizielle iTunes-Lookup-API: vergleicht die
// live im App Store stehende Version mit der installierten App-Version.
// Kein manuelles Pflegen einer Versions-Datei nötig.
const APP_STORE_ID       = '6775434876';
const APP_STORE_URL      = 'https://apps.apple.com/app/id' + APP_STORE_ID;
const ITUNES_LOOKUP_URL  = 'https://itunes.apple.com/lookup?id=' + APP_STORE_ID;
let _nativeUpdateInfo = null;

// Semver-Vergleich "1.0.2" vs "1.0.10" → 1 wenn a>b, -1 wenn a<b, sonst 0
function _cmpVer(a, b){
  const pa = String(a||'').split('.').map(n => parseInt(n,10) || 0);
  const pb = String(b||'').split('.').map(n => parseInt(n,10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++){
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

// Installierte Marketing-Version (CFBundleShortVersionString) via @capacitor/app
async function _installedVersion(){
  try{
    const A = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (A && A.getInfo){ const info = await A.getInfo(); return info && info.version; }
  }catch(_){}
  return null;
}

// Install-Quelle (App Store vs. Simulator/Dev/TestFlight) – einmal cachen.
let _installInfo = undefined;
async function _getInstallInfo(){
  if (_installInfo !== undefined) return _installInfo;
  try{
    const WDP = _cap('WidgetDataPlugin');
    if (WDP && WDP.getInstallInfo){ _installInfo = await WDP.getInstallInfo(); return _installInfo; }
  }catch(_){}
  _installInfo = null; // altes Plugin ohne Methode → wie bisher weitermachen
  return _installInfo;
}

async function _runNativeUpdateCheck(){
  if (!_isNative() || !navigator.onLine) return;
  try{
    // Nur echte App-Store-Installationen zum Store-Update auffordern. Simulator,
    // Xcode-Dev und TestFlight sind gegenüber dem Store versionsversetzt und würden
    // sonst „Update verfügbar" zeigen, obwohl es die eigene neueste Version ist.
    const env = await _getInstallInfo();
    if (env && env.isAppStore === false) return;
    const installed = await _installedVersion();
    if (!installed) return;
    const r = await fetch(ITUNES_LOOKUP_URL + '&_=' + Date.now(), { cache:'no-store' });
    if (!r.ok) return;
    const data = await r.json();
    const app  = data && data.results && data.results[0];
    const latest = app && app.version;
    if (!latest) return;
    // Nur auffordern, wenn die App-Store-Version wirklich neuer ist als die installierte
    if (_cmpVer(latest, installed) > 0){
      // Einmal je Store-Version „Später" → bleibt dauerhaft weg (kein Nerven bei jedem Start)
      let dismissed = '';
      try { dismissed = localStorage.getItem('gt_upd_dismissed') || ''; } catch(_){}
      if (dismissed === latest) return;
      _nativeUpdateInfo = { version: latest, notes: 'Version ' + latest };
      _showNativeUpdateBar(_nativeUpdateInfo);
    }
  }catch(_){ /* still */ }
}

function _showNativeUpdateBar(data){
  const bar = document.getElementById('native-update-bar');
  if (!bar) return;
  const sub = document.getElementById('nub-sub');
  if (sub){
    const note = data && data.notes;
    sub.textContent = note ? note : 'Neue Version im App Store verfügbar';
  }
  bar.classList.add('show');
}

function openAppStoreUpdate(){
  // Universal-Link öffnet auf iOS direkt die App-Store-App auf der Produktseite
  _openExternal(APP_STORE_URL);
}

function dismissNativeUpdate(){
  const bar = document.getElementById('native-update-bar');
  if (bar) bar.classList.remove('show');
  try{
    if (_nativeUpdateInfo && _nativeUpdateInfo.version)
      localStorage.setItem('gt_upd_dismissed', _nativeUpdateInfo.version);
  }catch(_){}
}

// Externen Link öffnen – in der nativen App im System-Browser, damit der
// App-Store-Universal-Link die App-Store-App öffnet.
function _openExternal(url){
  try{ if (window.open(url, '_system')) return; }catch(_){}
  try{
    const P = window.Capacitor && window.Capacitor.Plugins;
    if (P && P.Browser && P.Browser.open){ P.Browser.open({ url }); return; }
  }catch(_){}
  try{ location.href = url; }catch(_){}
}

// Beim Zurückkehren in die App erneut prüfen (Tester starten oft nicht neu)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && _isNative()) {
    clearTimeout(_runNativeUpdateCheck._t);
    _runNativeUpdateCheck._t = setTimeout(_runNativeUpdateCheck, 800);
  }
  // Soft-Paywall auch beim Vordergrund-Wechsel prüfen: iOS hält die WebView
  // tagelang im Speicher, ein echter "App-Start" passiert kaum noch. Erst nach
  // 30 min Pause, damit kurzes Wegwischen nichts auslöst; die Intervall-Logik
  // in _maybeWelcomePaywall entscheidet dann, ob wirklich etwas aufgeht.
  if (document.visibilityState === 'hidden') { _pwHidTs = Date.now(); return; }
  if (document.visibilityState === 'visible' && _pwHidTs && Date.now() - _pwHidTs > 18e5) {
    _pwHidTs = 0;
    setTimeout(() => { try { _maybeWelcomePaywall(); } catch(_){} }, 1200);
  }
});
let _pwHidTs = 0;

async function checkForUpdate() {
  const title = document.getElementById('update-title');
  const sub   = document.getElementById('update-sub');
  if (!title) return;

  title.textContent = 'Suche nach Updates…';
  title.style.color = '';
  if (sub) sub.textContent = '';

  try {
    // sw.js vom Server holen (kein Browser-Cache)
    const res     = await fetch('./sw.js?_=' + Date.now(), { cache: 'no-store' });
    const text    = await res.text();
    const m       = text.match(/gymtrack-v\d+/);
    const serverV = m ? m[0] : null;

    if (!serverV) { title.textContent = 'Prüfung fehlgeschlagen'; return; }

    if (serverV !== APP_VERSION) {
      title.textContent = 'Update wird installiert…';
      if (sub) sub.textContent = 'App startet gleich neu…';
      await _doForceUpdate();
    } else {
      title.textContent = '✓ Bereits aktuell';
      if (sub) sub.textContent = '';
      setTimeout(() => {
        title.textContent = 'Auf Updates prüfen';
        title.style.color = '';
        if (sub) sub.textContent = 'Neueste Version installieren';
      }, 3000);
    }
  } catch (err) {
    console.warn('[GymTrack] Update-Check fehlgeschlagen:', err);
    title.textContent = 'Kein Netz – bitte verbinden';
    if (sub) sub.textContent = '';
    setTimeout(() => {
      title.textContent = 'Auf Updates prüfen';
      if (sub) sub.textContent = 'Neueste Version installieren';
    }, 3000);
  }
}

async function _doForceUpdate() {
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r => r.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  }
  window.location.replace(location.href.split('?')[0] + '?_=' + Date.now());
}

// ═══════════════════════════════════════════════════════
// ── KONTO / GOOGLE LOGIN + CLOUD SYNC ──────────────────
// ═══════════════════════════════════════════════════════

/* _fbUser steht bewusst WEITER OBEN (bei APP_VERSION) — Begruendung dort. */
let _authSettled = false;   // true, sobald Auth-Zustand einmal feststeht (Restore/Anon/Logout) — vorher „Verbinde…" statt Login-Gate zeigen
let _fbUnsub    = null;     // Unsubscribe-Fn für Firestore-Snapshot
let _syncing    = false;    // Lock, damit Cloud-Update keinen erneuten Push triggert
let _pushTimer  = null;     // Debounce-Timer für persist→cloud
let _initialMergeDone = false;
let _loginInProgress = false; // verhindert, dass die anonyme Auto-Anmeldung einen laufenden Google-Login stört
let _onLoginUid = null;       // UID, für die _onLogin bereits läuft/lief (gegen Doppelausführung)

/* ── SCHEMA-STAND DES CLOUD-DOKUMENTS ────────────────────────────────────
   Web (immer aktuell) und native App (aktualisiert der Nutzer irgendwann)
   teilen sich DASSELBE users-Dokument. Der Push schrieb bisher eine feste
   Feldliste mit merge:false — ein aelterer Build loeschte damit jedes Feld
   serverseitig, das er selbst noch nicht kennt (zuletzt 'checkins' und
   'aiCoach' waeren so verschwunden). Zwei Sicherungen dagegen:
     1. mergeFields statt merge:false, s. _pushToCloud.
     2. dieser Stand. Hochzaehlen, sobald ein Feld dazukommt oder seine
        Bedeutung wechselt. Ein Client mit NIEDRIGEREM Stand pusht gar nicht
        mehr und bittet stattdessen ums App-Update. */
const CLOUD_SCHEMA_V = 2;
let _cloudSchemaV = 0;        // hoechster im Cloud-Dokument gesehener Stand
let _schemaWarned  = false;
function _cloudSchemaSeen(cloud) {
  const v = Number(cloud && cloud._schemaV) || 0;
  if (v > _cloudSchemaV) _cloudSchemaV = v;
}
function _schemaZuAlt() {
  if (_schemaWarned) return;
  _schemaWarned = true;
  console.warn('[GymTrack] Cloud-Schema ' + _cloudSchemaV + ' > lokal ' + CLOUD_SCHEMA_V + ' — Push verweigert');
  try { _dndToast('Ein anderes Gerät hat neuere Daten gespeichert. Bitte aktualisiere MyGymTrack — bis dahin bleibt dieser Stand nur auf diesem Gerät.'); } catch(_) {}
  try { if (_isNative()) _showNativeUpdateBar({ notes: 'Update nötig — ein anderes Gerät nutzt bereits eine neuere Version.' }); } catch(_) {}
}

// Wrap persist(): auch in die Cloud schicken, wenn eingeloggt
const _origPersist = persist;
persist = function() {
  S.updatedAt = Date.now();
  _origPersist();
  if (_fbUser && !_syncing && _initialMergeDone) {
    // Ab hier gilt der lokale Stand als ungesichert. Erst ein durchgegangener
    // Push nimmt den Vermerk wieder weg — stirbt die App vorher (oder scheitert
    // der Push), schuetzt er die Aenderung im naechsten Merge.
    try { _cloudDirtySet(true); } catch(_) {}
    if (_pushTimer) clearTimeout(_pushTimer);
    _pushTimer = setTimeout(_pushToCloud, 800);
  }
};
window.persist = persist;

async function _pushToCloud() {
  if (!_fbUser || !window.FB || !window.FB.configured) return;
  // Demo-/Marketing-Modus (Simulator-Seeds) synct NIE in die Cloud
  if (_demoModeAny() || (typeof DEMO_SEED !== 'undefined' && DEMO_SEED)) return;
  /* Das Dokument stammt von einem NEUEREN Build. Dieser hier kennt dessen
     Felder nicht und wuerde sie mit seiner eigenen Lesart ueberschreiben. Der
     Vermerk bleibt gesetzt, damit der Merge den lokalen Stand weiter schuetzt. */
  if (_cloudSchemaV > CLOUD_SCHEMA_V) { _cloudDirtySet(true); _schemaZuAlt(); return; }
  try {
    const ref = window.FB.userDocRef(_fbUser.uid);
    // WICHTIG: Jedes Feld hier muss auch im hasOnly() der Firestore-Rules stehen,
    // sonst lehnt Firestore den KOMPLETTEN Push ab (permission-denied).
    const payload = {
      exercises: S.exercises || [],
      sessions:  S.sessions  || [],
      theme:     S.theme,
      companion: S.companion,
      companionOn: S.companionOn,
      exFilterMode: S.exFilterMode,
      wkFilterMode: S.wkFilterMode,
      statsFilterMode: S.statsFilterMode || 'muskel',
      unitMode:  S.unitMode || 'kg',
      glass:     S.glass !== false,
      welcomeShown: S.welcomeShown,
      heuteLayout: S.heuteLayout || null,
      weekPlan:  S.weekPlan || null,
      customSplits: S.customSplits || [],
      workoutPresets: S.workoutPresets || [],
      trackerItems: S.trackerItems || [],
      trackerCounts: S.trackerCounts || {},
      erfAchieved: S.erfAchieved || [],
      weightLog:   S.weightLog || [],
      weightStart: S.weightStart ?? null,
      weightGoal:  S.weightGoal ?? null,
      restTimerSecs: S.restTimerSecs || 90,
      smartRest:  S.smartRest !== false,
      onboarded:  !!S.onboarded,
      userName:   S.userName || null,
      obGoal:     S.obGoal || null,
      obExp:      S.obExp  || null,
      obFreq:     S.obFreq || null,
      socialOn:   !!S.socialOn,
      friendCode: S.friendCode || null,
      friends:    S.friends || [],
      gymName:    S.gymName || null,
      gymLat:     S.gymLat ?? null,
      gymLng:     S.gymLng ?? null,
      checkins:   S.checkins || [],
      /* Die Persona des Coaches — Name, Ton, Umfang im Training, Push-Stufe.
         Sie gehoert dem KONTO, nicht dem Geraet: wer sich abmeldet und wieder
         anmeldet, bekam bisher sein Dossier zurueck, musste dem Coach aber
         Namen und Ton neu geben. 'aiCoach' steht bereits im hasOnly() der
         Rules, firestore.rules bleibt unangetastet.
         Was NICHT mitgeht und warum: das DOSSIER (eigene Subcollection mit
         strengeren Rules — dort stehen gemeldete Einschraenkungen, also
         Gesundheitsangaben), und S.coachSession/S.coachPush/S.coachReports
         (geraete-lokal, s. die Kommentare an ihren Voreinstellungen).
         JSON-Rundlauf statt roher Referenz: ein Feld mit dem Wert undefined
         (etwa ein nie gesetztes preset) laesst Firestore den KOMPLETTEN Push
         abweisen — und zwar still im catch unten. stringify wirft solche
         Schluessel weg, statt das ganze Dokument zu verlieren. */
      aiCoach:    _coachCloudPersona(),
      _schemaV:   CLOUD_SCHEMA_V,
      updatedAt: S.updatedAt || Date.now(),
      _serverTime: window.FB.serverTimestamp()
    };
    /* Flammen-Bank (localStorage 'gt_flameBank', s. js/app-streak.js). Sie lag
       bisher NUR auf dem Geraet: Posts verfallen nach sieben Tagen und die
       Flamme wird beim Loeschen lokal gebucht, also startete ein neues Geraet
       bei 0 — Level und Punkte fielen dauerhaft, nachladbar war nichts mehr.
       Fehlt der Wert, bleibt der Schluessel WEG statt null zu schreiben:
       mergeFields laesst ihn dann unberuehrt, statt den Cloud-Stand zu leeren. */
    const _fb = _flameBankCloud();
    if (_fb) payload.flameBank = _fb;
    /* mergeFields statt merge:false — beides zugleich:
       - Felder, die dieser Build NICHT kennt (neuerer Client), bleiben stehen,
         statt serverseitig geloescht zu werden.
       - jedes AUFGEZAEHLTE Feld wird trotzdem VOLLSTAENDIG ersetzt. Mit einem
         schlichten merge:true waere das falsch: Firestore mischt Maps dann
         tief, und ein geleertes trackerCounts / ein auf 'none' gestellter
         Wochenplan-Tag brachte seine alten Unterschluessel aus der Cloud
         zurueck. Leere Arrays und null schreibt der Payload ohnehin explizit. */
    await _setDocCompat(ref, payload);
    _cloudDirtySet(false);   // bestaetigt: die Cloud kennt diesen Stand
  } catch (e) {
    /* Ein abgelehnter Push war bisher eine Konsolenzeile — und damit der
       Anfang eines stillen Datenverlusts: die Cloud bleibt auf dem alten
       Stand, der naechste Merge zieht ihn herein und ueberschreibt die
       Einstellungen, die es nie hinausgeschafft haben (gemeldet: der Name des
       Coaches sprang nach einem Profil-Speichern zurueck). Der Vermerk hier
       ueberlebt jeden Neustart und macht den lokalen Stand im Merge
       unantastbar, bis ein Push wirklich durchgeht. */
    _cloudDirtySet(true);
    console.warn('[GymTrack] Cloud-Push fehlgeschlagen:', e);
    // permission-denied heisst fast immer: die Rules in der Konsole sind aelter
    // als firestore.rules im Repo (ein Feld fehlt im hasOnly). Das kann der
    // Nutzer nicht beheben — er soll aber wissen, dass gerade nichts gesichert
    // wird, statt es beim naechsten Geraet zu merken.
    if (String(e?.code || e).includes('permission')) {
      try { _dndToast('Sync gerade nicht möglich — deine Daten bleiben auf diesem Gerät.'); } catch(_) {}
    }
  }
}
/* Felder, die firestore.rules erst nach dem naechsten Publish im hasOnly()
   fuehrt. Steht die Konsole noch auf dem alten Stand, lehnt Firestore den
   KOMPLETTEN Push ab (permission-denied) — die App verloere jede Sicherung,
   nicht nur die neuen Felder. Deshalb geht der Push dann EINMAL ohne sie erneut
   hinaus. Nur fuer diese Sitzung gemerkt: nach einem Neustart wird wieder mit
   den vollen Feldern probiert, der Rueckfall verschwindet also von selbst,
   sobald die Rules veroeffentlicht sind. */
const CLOUD_NEUE_FELDER = ['_schemaV', 'flameBank'];
let _cloudFeldRueckfall = false;
async function _setDocCompat(ref, payload) {
  if (_cloudFeldRueckfall) CLOUD_NEUE_FELDER.forEach(k => { delete payload[k]; });
  try {
    await window.FB.setDoc(ref, payload, { mergeFields: Object.keys(payload) });
  } catch (e) {
    if (_cloudFeldRueckfall || !String(e?.code || e).includes('permission')) throw e;
    _cloudFeldRueckfall = true;
    CLOUD_NEUE_FELDER.forEach(k => { delete payload[k]; });
    console.warn('[GymTrack] Cloud-Rules kennen die neuen Felder noch nicht — Push ohne sie');
    await window.FB.setDoc(ref, payload, { mergeFields: Object.keys(payload) });
  }
}

/* Die Bank in der Form, die in die Cloud geht. null heisst „nicht ermittelbar" —
   der Aufrufer laesst den Schluessel dann weg. */
function _flameBankCloud() {
  try {
    if (typeof _flameBank !== 'function') return null;
    const b = _flameBank();
    if (!b) return null;
    return { t: Number(b.t) || 0, k: (b.k && typeof b.k === 'object') ? b.k : {} };
  } catch(_) { return null; }
}

/* Zusammenfuehren der Bank. Sie waechst monoton: 't' zaehlt alle je
   gutgeschriebenen Flammen, 'k' merkt sich die bereits gezaehlten
   (postId:reactorUid) und ist damit der Schutz gegen doppeltes Zaehlen.
   Deshalb gewinnt beim Zaehler das Maximum, und die Schluesselmengen werden
   VEREINIGT — was ein Geraet schon gebucht hat, darf das andere nicht ein
   zweites Mal buchen. Haben beide Seiten auf eigenen Posts gezaehlt, ist die
   Vereinigung groesser als jeder einzelne Zaehler und damit die bessere
   Untergrenze; kleiner als ein Zaehler kann sie nur sein, wenn Schluessel
   geloeschter Posts entfernt wurden (_flameBankPrunePost laesst 't' bewusst
   stehen) — dann traegt das Maximum.
   Geschrieben wird direkt nach localStorage: die Bank steht bewusst NICHT in S,
   sonst liefe sie gegen das hasOnly() der users-Rules. */
function _flameBankMerge(cloudBank) {
  try {
    if (!cloudBank || typeof cloudBank !== 'object') return;
    const lokal = (typeof _flameBank === 'function') ? _flameBank() : { t: 0, k: {} };
    const ck = (cloudBank.k && typeof cloudBank.k === 'object') ? cloudBank.k : {};
    const k  = Object.assign({}, ck, lokal.k || {});
    const t  = Math.max(Number(cloudBank.t) || 0, Number(lokal.t) || 0, Object.keys(k).length);
    localStorage.setItem('gt_flameBank', JSON.stringify({ t: t, k: k }));
    if (t !== (Number(lokal.t) || 0)) { try { _renderLevelBadge(); } catch(_) {} }
  } catch(_) {}
}

/* Gibt es lokale Aenderungen, die die Cloud nie bestaetigt hat? Der Zeitstempel
   liegt in localStorage und NICHT in S: er beschreibt den Zustand DIESES
   Geraets gegenueber der Cloud und haette in einem Feld, das selbst gesynct
   wird, nichts verloren. */
function _cloudDirtySet(an) {
  try {
    if (an) localStorage.setItem('gt_cloud_dirty', String(Date.now()));
    else localStorage.removeItem('gt_cloud_dirty');
  } catch(_) {}
}
function _cloudDirty() {
  try { return !!localStorage.getItem('gt_cloud_dirty'); } catch(_) { return false; }
}

// Listen mit stabilen ids verlustfrei vereinen (Pläne/Splits): nie eine Seite
// komplett verwerfen. Bei id-Kollision gewinnt die neuere Seite. Verhindert,
// dass ein leeres Cloud-Array lokale Pläne überschreibt (Daten-Verlust nach Login).
function _mergeById(cloud, local, cloudNewer) {
  const m = new Map();
  const first  = cloudNewer ? (local || []) : (cloud || []);
  const second = cloudNewer ? (cloud || []) : (local || []);
  first.forEach(x  => { if (x && x.id) m.set(x.id, x); });
  second.forEach(x => { if (x && x.id) m.set(x.id, x); });
  return [...m.values()];
}

// Merge: kombiniere local + cloud verlustfrei
// Grober Fingerabdruck der anzeigerelevanten Daten. Reicht, um zu entscheiden, ob
// ein Cloud-Merge überhaupt einen Rerender wert ist — bewusst billig (keine tiefe
// Serialisierung tausender Sätze), aber empfindlich für alles, was die Startseite zeigt.
function _dataSig() {
  try {
    const ses = S.sessions || [], ex = S.exercises || [];
    const last = ses.length ? ses[ses.length - 1] : null;
    return [ses.length, ex.length, last && last.date, last && last.id,
            S.theme, S.companion, S.streak, S.streakLastDate,
            JSON.stringify(S.weekPlan || null), (S.workoutPresets || []).length,
            (S.trackerItems || []).length, JSON.stringify(S.trackerCounts || null)].join('|');
  } catch(_) { return String(Math.random()); }   // im Zweifel lieber rendern
}
function _mergeData(local, cloud) {
  // Demo-Altlasten aus BEIDEN Quellen filtern, bevor gemergt wird — sonst
  // schleust ein kontaminiertes Cloud-Doc/Gerät die dm_-Daten wieder ein.
  try { _purgeDemoData(local); _purgeDemoData(cloud); } catch(_){}
  _cloudSchemaSeen(cloud);
  try { _flameBankMerge(cloud.flameBank); } catch(_){}
  /* Ein Stand, den die Cloud nie bestaetigt hat, darf nicht von ihr
     ueberschrieben werden. Genau das passierte, wenn ein Push abgelehnt wurde
     (Rules aelter als firestore.rules) oder das Netz fehlte: lokal geaendert,
     nie hochgekommen, und der naechste Merge zog den alten Cloud-Stand
     herein — Coach-Name, Ton und die uebrigen Einstellungen waren wieder die
     von vorher. Solange der Vermerk steht, gewinnt in JEDEM Feld die lokale
     Seite; Uebungen werden ohnehin vereinigt und nicht gewaehlt, da geht dabei
     nichts verloren.
     Steht bewusst VOR den Listen: die Einheiten unten richten sich seit dem
     id-Abgleich ebenfalls danach. */
  const nichtGesichert = (typeof _cloudDirty === 'function') && _cloudDirty();
  const cloudNewer = !nichtGesichert && (cloud.updatedAt || 0) >= (local.updatedAt || 0);
  const exMap = new Map();
  [...(cloud.exercises || []), ...(local.exercises || [])].forEach(ex => {
    if (!ex || !ex.id) return;
    const existing = exMap.get(ex.id);
    if (!existing || (ex.updatedAt || 0) > (existing.updatedAt || 0)) {
      exMap.set(ex.id, ex);
    }
  });
  /* Einheiten werden ueber ihre stabile id abgeglichen (vergeben beim Beenden
     des Trainings, js/app-workout.js). Der fruehere Schluessel aus
     Datum + Uebungsliste war blind gegen genau die Aenderung, die er schuetzen
     sollte: eine NEUE Einheit ueberlebte, eine nachtraeglich BEARBEITETE wurde
     still auf den Cloud-Stand zurueckgesetzt — auch dann, wenn der Push nie
     durchgegangen war. Ausserdem verschmolz er zwei echte Einheiten desselben
     Tages mit derselben Uebungsliste zu einer.
     Alt-Einheiten ohne id behalten den bisherigen Schluessel. Taucht dieselbe
     Einheit auf der einen Seite mit und auf der anderen ohne id auf, gewinnt
     der id-Eintrag, statt zweimal im Verlauf zu stehen. */
  const sesMap = new Map();
  const sesAlt = new Map();          // Datum|Uebungen -> tatsaechlich benutzter Schluessel
  const sesPut = (s) => {
    if (!s) return;
    const alt = (s.date || '') + '|' + (s.logs || []).map(l => l.exerciseId).sort().join(',');
    const key = s.id ? 'id:' + s.id : (sesAlt.get(alt) || alt);
    if (s.id && sesAlt.get(alt) === alt) sesMap.delete(alt);
    sesMap.set(key, s);
    sesAlt.set(alt, key);
  };
  // Verlierer zuerst, Gewinner danach — der zweite Durchlauf ueberschreibt.
  // Bei ungesicherten lokalen Aenderungen ist der Gewinner die lokale Seite.
  (cloudNewer ? (local.sessions || []) : (cloud.sessions || [])).forEach(sesPut);
  (cloudNewer ? (cloud.sessions || []) : (local.sessions || [])).forEach(sesPut);
  // Gewichtsverlauf: Union per Datum (Cloud gewinnt bei gleichem Tag)
  const wlMap = new Map();
  [...(local.weightLog || []), ...(cloud.weightLog || [])].forEach(e => {
    if (e && e.date) wlMap.set(e.date, e);
  });
  // Strukturierte Felder (Plan, Splits, Tracker): neuerer Stand gewinnt.
  // nichtGesichert/cloudNewer stehen weiter oben — s. Begruendung dort.
  const pick = (a, b) => cloudNewer ? (a ?? b) : (b ?? a); // a=cloud, b=local
  return {
    exercises: [...exMap.values()],
    sessions:  [...sesMap.values()].sort((a,b) => new Date(a.date) - new Date(b.date)),
    // Skalare Einstellungen: recency-aware (pick) statt ?? — sonst überschreibt
    // ein ÄLTERER Cloud-Wert eine neuere lokale Änderung, die noch nicht
    // hochgeladen wurde (App vor dem 800ms-Push geschlossen). Genau das ließ
    // z.B. die Standard-Satzpause "nach zweimal Schließen" wieder verschwinden.
    theme:        pick(cloud.theme,        local.theme),
    companion:    pick(cloud.companion,    local.companion),
    companionOn:  pick(cloud.companionOn,  local.companionOn),
    exFilterMode: pick(cloud.exFilterMode, local.exFilterMode),
    wkFilterMode: pick(cloud.wkFilterMode, local.wkFilterMode),
    statsFilterMode: pick(cloud.statsFilterMode, local.statsFilterMode),
    unitMode:     pick(cloud.unitMode,     local.unitMode),
 glass: pick(cloud.glass, local.glass),
    welcomeShown: cloud.welcomeShown || local.welcomeShown,
    heuteLayout:  pick(cloud.heuteLayout,  local.heuteLayout) ?? null,
    weekPlan:     pick(cloud.weekPlan,     local.weekPlan),
    customSplits:   _mergeById(cloud.customSplits,   local.customSplits,   cloudNewer),
    workoutPresets: _mergeById(cloud.workoutPresets, local.workoutPresets, cloudNewer),
    trackerItems: pick(cloud.trackerItems, local.trackerItems) || [],
    trackerCounts: pick(cloud.trackerCounts, local.trackerCounts) || {},
    erfAchieved:  [...new Set([...(cloud.erfAchieved || []), ...(local.erfAchieved || [])])],
    weightLog:    [...wlMap.values()].sort((a,b) => a.date < b.date ? -1 : 1),
    weightStart:  pick(cloud.weightStart,  local.weightStart) ?? null,
    weightGoal:   pick(cloud.weightGoal,   local.weightGoal) ?? null,
    restTimerSecs: pick(cloud.restTimerSecs, local.restTimerSecs),
    smartRest:    pick(cloud.smartRest,    local.smartRest),
    onboarded:    cloud.onboarded || local.onboarded || false,
    userName:     pick(cloud.userName, local.userName) ?? '',
    obGoal:       pick(cloud.obGoal, local.obGoal) ?? null,
    obExp:        pick(cloud.obExp,  local.obExp)  ?? null,
    obFreq:       pick(cloud.obFreq, local.obFreq) ?? null,
    socialOn:     pick(cloud.socialOn, local.socialOn) ?? false,
    friendCode:   cloud.friendCode || local.friendCode || null,
    friends:      [...new Set([...(cloud.friends || []), ...(local.friends || [])])],
    gymName:      pick(cloud.gymName, local.gymName) ?? null,
    gymLat:       pick(cloud.gymLat,  local.gymLat)  ?? null,
    gymLng:       pick(cloud.gymLng,  local.gymLng)  ?? null,
    /* Persona des Coaches (Name, Ton, Umfang im Training, Push-Stufe) —
       DIESELBE Strategie wie fuer die uebrigen strukturierten Felder: pick(),
       also der zuletzt geschriebene Stand, gemessen an updatedAt des ganzen
       Dokuments. Zwei Geraete mit verschiedenen Personas entscheidet damit das
       Geraet, dessen Stand juenger ist — und zwar das aiCoach-Objekt AM
       STUECK. Kein feldweises Mischen: ein halber Coach (Name von hier, Ton von
       dort) waere niemandes Coach.
       Der einzige Zusatz ist die Lesart von "nicht gesetzt": eine Persona ohne
       abgeschlossene Einrichtung ist fuer pick() das, was null fuer jedes
       andere Feld ist. Ohne diese Lesart gaebe es die Erweiterung gar nicht —
       _coachWipeLocal() setzt die Persona auf die Voreinstellung UND ruft
       persist(), damit ist local.updatedAt beim Login nach jedem Kontowechsel
       juenger als die Cloud. pick() nach der reinen Uhr lieferte also immer die
       leere Voreinstellung und schriebe sie beim Push direkt danach auch noch
       ueber die Persona, die in der Cloud des Kontos steht.
       Reihenfolge, die das traegt: erst raeumt _coachHandleAuthUser(), dann
       merged _onLogin(). Andersherum zoege der Merge die Persona des
       Vorbesitzers wieder herein.
       Aufgefuellt auf die Voreinstellung, damit ein aelterer Cloud-Stand ohne
       ein spaeter hinzugekommenes Feld keine Luecke hinterlaesst. */
    aiCoach:      Object.assign(_coachPersonaDefaults(),
                    pick(_coachPersonaGesetzt(cloud.aiCoach), _coachPersonaGesetzt(local.aiCoach)) || local.aiCoach || {}),
    updatedAt:    Math.max(cloud.updatedAt || 0, local.updatedAt || 0, Date.now())
  };
}

async function _onLogin(user) {
  // Kann von onAuthStateChanged UND direkt nach signInWithCredential aufgerufen
  // werden (Letzteres, weil onAuthStateChanged in der WKWebView nicht zuverlässig
  // feuert). Pro UID nur einmal voll verarbeiten — sonst doppelter Sync/Toast.
  _authSettled = true;
  if (_onLoginUid === user.uid) {
    _fbUser = user; updateAccountUI(); _refreshFriendsIfVisible();
    if (!user.isAnonymous) { try { localStorage.setItem('gt_signedIn','1'); } catch(_){} _hideAuthGate(); } else _maybeAuthGate();
    // Re-Auth zur Konto-Löschung abgeschlossen → jetzt löschen
    if (_pendingDelete && !user.isAnonymous) { _pendingDelete = false; _runAccountDeletion(); }
    return;
  }
  _onLoginUid = user.uid;
  console.log('[GymTrack] ✅ Login erkannt:', user.email || user.uid, user.isAnonymous ? '(anonym)' : '');
  _fbUser = user;
  if (!user.isAnonymous) { try { localStorage.setItem('gt_signedIn','1'); } catch(_){} _hideAuthGate(); } else _maybeAuthGate();
  updateAccountUI();
  // Premium-Badge + KI-Karte SOFORT mit dem frischen Auth-Status neu bewerten, statt
 // auf den Cloud-Doc-Fetch weiter unten zu warten — sonst poppen sie sichtbar verzögert auf.
  try { _renderLevelBadge(); renderCoachTodayCard(); } catch(_){}
  _refreshFriendsIfVisible();   // falls User auf dem Freunde-Tab wartet, sofort echten Inhalt zeigen
  if (!window.FB || !window.FB.configured) return;

  // Presence aktivieren (Realtime DB onDisconnect → kein Heartbeat)
  if (window.FB.startPresence) window.FB.startPresence(user);

  // Analytics-Session starten
  analyticsStart(user);

  // Anonyme User: keine Cloud-Sync für Übungs-Daten
  if (user.isAnonymous) {
    _initialMergeDone = true;
    return;
  }

  _syncing = true;
  const _sigBefore = _dataSig();
  try {
    const ref  = window.FB.userDocRef(user.uid);
    console.log('[GymTrack] ☁️ Lade Cloud-Daten…');
    const snap = await window.FB.getDoc(ref);
    let _cloudHadData = false;
    if (snap.exists()) {
      // Cloud-Daten vorhanden → mergen
      const cloud  = snap.data();
      _cloudHadData = (cloud.exercises||[]).length > 0 || (cloud.sessions||[]).length > 0;
      console.log('[GymTrack] ☁️ Cloud-Daten gefunden — merge mit lokal');
      const personaVorher = _coachPersonaSig();
      const merged = _mergeData(S, cloud);
      Object.assign(S, merged);
      _origPersist();
      /* Die Persona kommt seit Block 5 aus der Cloud zurueck — genau hier, beim
         Wiederanmelden auf demselben Konto. _dataSig() kennt sie bewusst nicht
         (sie soll keinen vollen Rerender der Startseite ausloesen), also blieben
         Heute-Karte, Hub und Chat-Kopf sonst bis zum naechsten Start auf
         "Coach" stehen. */
      if (_coachPersonaSig() !== personaVorher) { try { _coachOptRender(); } catch(_) {} }
      // Geänderte Daten zurückschreiben
      await _pushToCloud();
      console.log('[GymTrack] ☁️ Cloud-Push (nach Merge) ok');
    } else {
      // Cloud leer → lokale Daten hochladen
      console.log('[GymTrack] ☁️ Cloud leer — pushe lokale Daten');
      await _pushToCloud();
      console.log('[GymTrack] ☁️ Initial-Push ok');
    }
    // UI nur neu rendern, wenn der Cloud-Merge WIRKLICH etwas geändert hat.
    // Vorher lief der Rerender bedingungslos — sichtbar als "die App lädt ein bis
    // zwei Sekunden nach dem Start noch mal neu" (Heute-Karten bauten sich erneut auf),
    // obwohl in 99 % der Starts identische Daten aus der Cloud kommen.
    if (_dataSig() !== _sigBefore) {
      setTheme(S.theme || 'dark');
      applyCompanion();
      renderHome();
      renderExList();
      renderSettings();
    }
    updateAccountUI();
    // Sync-Bestätigung — nur beim erstmaligen Verbinden zeigen
    if (!localStorage.getItem('gt_synced_' + user.uid)) {
      localStorage.setItem('gt_synced_' + user.uid, '1');
      const _exCount = (S.exercises||[]).length;
      const _syncMsg = _cloudHadData
        ? `☁️ ${_exCount} Übung${_exCount !== 1 ? 'en' : ''} aus der Cloud geladen`
        : `☁️ Konto verbunden`;
      setTimeout(() => showUpdateToast(_syncMsg, { autoHide: 3000 }), 400);
    }

    // Live-Sync von anderen Geräten
    if (_fbUnsub) _fbUnsub();
    _fbUnsub = window.FB.onSnapshot(ref, (snap2) => {
      if (!snap2.exists() || _syncing) return;
      const cloud = snap2.data();
      // Auch am Merge vorbei mitlesen: ein neuerer Build kann das Dokument
      // geschrieben haben, ohne dass sich fuer diesen hier etwas aendert.
      _cloudSchemaSeen(cloud);
      if ((cloud.updatedAt || 0) <= (S.updatedAt || 0)) return;
      _syncing = true;
      const sig = _dataSig();
      const personaVorher = _coachPersonaSig();
      const merged = _mergeData(S, cloud);
      Object.assign(S, merged);
      _origPersist();
      // Zweites Geraet hat den Coach umbenannt oder den Ton geaendert — s.o.
      if (_coachPersonaSig() !== personaVorher) { try { _coachOptRender(); } catch(_) {} }
      if (_dataSig() !== sig) {        // s.o.: kein Rerender ohne echte Änderung
        setTheme(S.theme || 'dark');
        applyCompanion();
        renderHome();
        renderExList();
        renderSettings();
      }
      _syncing = false;
    });
  } catch (e) {
    console.error('[GymTrack] ❌ Login-Sync fehlgeschlagen:', e);
    alert('Cloud-Sync fehlgeschlagen:\n\n' + (e?.code || '') + '\n' + (e?.message || e) +
          '\n\nPrüfe in der Firebase Console:\n• Firestore Database wurde angelegt\n• Firestore-Regeln erlauben dem User Schreibzugriff');
  } finally {
    _syncing = false;
    _initialMergeDone = true;
    _postLoginFlow();   // Cloud-Stand steht → Onboarding (falls nötig), danach Soft-Paywall
    updateAccountUI();
    try { if (isPremium()) aiQuotaRefresh(true); } catch(_){}   // Kontingent-Anzeige vorwärmen
    if (S.socialOn) { _pushRegister(); _flameNotifStart(); _friendPostNotifStart(); _communityNotifStart(); _reqNotifStart(); try { _purgeOldPosts(); } catch(_){} }   // Flammen- + Freundes-Post- + Community-Feed-Listener aktivieren + TTL-Aufräumen
  }
}

function _onLogout() {
  analyticsStop();
  _flameNotifStop();
  _friendPostNotifStop();
  _communityNotifStop();
  _reqNotifStop();
  if (_fbUser && window.FB?.stopPresence) window.FB.stopPresence(_fbUser.uid);
  _fbUser = null;
  try { localStorage.removeItem('gt_signedIn'); } catch(_){}   // Gerät gilt wieder als „nie eingeloggt" → Gate sofort beim nächsten Start
  _authSettled = true;   // Zustand steht fest (abgemeldet) → Login-Gate darf jetzt zeigen
  _onLoginUid = null;
  if (_fbUnsub) { _fbUnsub(); _fbUnsub = null; }
  _initialMergeDone = false;
  updateAccountUI();
  _refreshFriendsIfVisible();
  _maybeAuthGate();
}

// ═══════════════════════════════════════════════════════
// AUTH-GATE — Login-Pflicht (Apple/Google), nicht umgehbar.
// Reihenfolge beim allerersten Start: GATE → Onboarding →
// Soft-Paywall. Das Gate wird schon im INIT gezeigt (synchron,
// vor dem ersten Paint) — sonst blitzt der Startbildschirm auf,
// bis Firebase den Auth-Zustand geklärt hat.
// Anonyme Auto-Anmeldung zählt NICHT als Login.
// ═══════════════════════════════════════════════════════
// Hat dieses Gerät schon mal ein ECHTES Konto benutzt? Nur dann darf der Start
// ungesperrt durchlaufen, während Firebase den Login restauriert (kein Flackern
// für Bestandsnutzer). gt_synced_<uid> deckt Nutzer ab, die vor der Einführung
// von gt_signedIn schon eingeloggt waren.
function _hadRealLogin(){
  try {
    if (localStorage.getItem('gt_signedIn') === '1') return true;
    for (let i = 0; i < localStorage.length; i++) {
      if ((localStorage.key(i) || '').startsWith('gt_synced_')) return true;
    }
  } catch(_){}
  return false;
}
function _authGateNeeded(){
  if (_simDevBypass) return false;                         // Simulator: Apple/Google Sign-In nicht testbar
  if (window.FB && !window.FB.configured) return false;   // ohne Firebase kein Login möglich → nicht aussperren
  if (!_authSettled) return !_hadRealLogin();             // vor dem Auth-Restore: nur echte Neu-Installationen sperren
  return !_fbUser || _fbUser.isAnonymous;
}
function _maybeAuthGate(){
  if (_ob) return;                                  // Onboarding läuft (kommt erst NACH dem Login)
  if (_authGateNeeded()) _showAuthGate(); else _hideAuthGate();
}
// Nach dem Login: erst Onboarding, danach die Soft-Paywall. Läuft genau einmal.
let _postLoginFlowDone = false;
function _postLoginFlow(tries){
  if (_postLoginFlowDone || _ob) return;
  if (_authGateNeeded()) return;                    // noch nicht eingeloggt → Gate steht
  // Bei echtem Login erst den Cloud-Merge abwarten: sonst startet das Onboarding
  // für Bestandsnutzer, deren onboarded-Flag erst aus der Cloud kommt.
  if (_fbUser && !_fbUser.isAnonymous && !_initialMergeDone && (tries || 0) < 25) {
    setTimeout(() => _postLoginFlow((tries || 0) + 1), 400);
    return;
  }
  _postLoginFlowDone = true;
  if (maybeStartOnboarding()) return;               // Paywall folgt dann aus _obClose
  _maybeWelcomePaywall();
}
function _showAuthGate(){
  // Demo-/Screenshot-Builds (DEMO_SEED) sind bewusst nicht gesperrt — sonst ist
  // die App im Simulator ohne echtes Konto nicht prüfbar.
  try { if (typeof DEMO_SEED !== 'undefined' && DEMO_SEED) return; } catch(_){}
  const el = document.getElementById('auth-gate');
  if (!el || el.classList.contains('on')) return;
  const ben = (ico, t, s) => `<div class="ag-ben"><div class="ag-ben-ico">${ico}</div><div><div class="ag-ben-title">${t}</div><div class="ag-ben-sub">${s}</div></div></div>`;
  const svgCloud  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19a4.5 4.5 0 100-9 6 6 0 00-11.5 1.7A4 4 0 007 19h10.5z"/></svg>';
  const svgUsers  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>';
  const svgFlame  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c4.4 0 7-2.8 7-6.5 0-3.5-2.5-5.7-4.2-8C13.5 5.6 12.7 3.7 12.5 2c-2.3 1.6-4 3.9-4.6 6.1-.4-.8-.7-1.8-.8-2.8C4.9 7.5 5 10.6 5 15.5 5 19.2 7.6 22 12 22z"/></svg>';
  const svgApple  = '<svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>';
  const svgG      = '<svg width="19" height="19" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
  el.innerHTML = `
    <div class="ag-body">
      <img class="ob-hero-logo" src="icon-192.png" alt="MyGymTrack">
      <div class="ob-h1">Melde dich an</div>
      <div class="ob-sub">Ein Konto braucht’s, damit deine Trainings sicher sind und du mit Freunden trainieren kannst.</div>
      <div class="ag-benefits">
        ${ben(svgCloud, 'Automatisches Cloud-Backup', 'Nie wieder Daten verlieren — auch beim Handywechsel.')}
        ${ben(svgUsers, 'Freunde & Rangliste', 'Vergleiche dich und bleib gemeinsam dran.')}
        ${ben(svgFlame, 'Community & Flammen', 'Teile Erfolge und sammle deine Wochen-Streak.')}
      </div>
    </div>
    <div class="ag-foot">
      ${_isNative() ? `<button class="ag-btn ag-apple" onclick="doAppleSignIn()">${svgApple} Mit Apple fortfahren</button>` : ''}
      <button class="ag-btn ag-google" onclick="doGoogleSignIn()">${svgG} Mit Google fortfahren</button>
      <div class="ag-legal">Mit der Anmeldung akzeptierst du unsere <a href="https://lenny23445.github.io/Gymtrack/privacy.html" target="_blank" rel="noopener">Datenschutzerklärung</a>. Wir posten nichts ohne dich.</div>
    </div>`;
 el.classList.add('on');
}
function _hideAuthGate(){
  const el = document.getElementById('auth-gate');
  if (!el || !el.classList.contains('on')) return;
  el.style.transition = 'opacity .32s'; el.style.opacity = '0';
  setTimeout(()=>{ el.classList.remove('on'); el.style.opacity=''; el.style.transition=''; el.innerHTML=''; }, 330);
  setTimeout(() => _postLoginFlow(), 600);   // nach dem Login: Onboarding, danach Soft-Paywall
}
// Soft-Paywall — weich: normales Paywall-Sheet, per ✕/Backdrop/Swipe schließbar.
// Drei Auslöser, alle nur lokal (kein users-Feld → keine Rules-Änderung):
//   1) erster Login (Welcome, wie bisher)
//   2) Update-Kampagne: Bestandsnutzer, die den Onboarding-Flow nie durchlaufen
//      haben, bekommen sie beim ersten Start nach diesem Update EINMAL. Gesteuert
//      über PW_CAMPAIGN — NICHT über APP_VERSION, sonst poppt sie im Web bei
//      jedem Deploy neu auf. Neue Kampagne = Konstante hochzählen.
//   3) danach als Erinnerung in wachsenden Abständen (3 → 7 → 14 Tage), damit
//      es Erinnerung bleibt und nicht nervt.
const PW_CAMPAIGN    = 1;                // hochzählen = alle Nicht-Premium sehen sie 1× erneut
const PW_REMIND_DAYS = [3, 7, 14];       // Abstand nach der 1./2./ab der 3. Anzeige
function _maybeWelcomePaywall(){
  try{
    if (isPremium()) return;
    if (_ob) return;                                                          // Onboarding läuft
    if (typeof isWorkoutActive === 'function' && isWorkoutActive()) return;    // nicht ins Training platzen
    if (document.querySelector('.ov.on')) return;                             // kein Sheet überlagern
    const now   = Date.now();
    const seen  = +(localStorage.getItem('gt_pwSeenCount') || 0);
    const last  = +(localStorage.getItem('gt_pwLast') || 0);
    const camp  = +(localStorage.getItem('gt_pwCampaign') || 0);
    const first    = !localStorage.getItem('gt_pwWelcome');   // noch nie gesehen
    const campaign = camp < PW_CAMPAIGN;                      // Bestandsnutzer beim Update
    const gapDays  = PW_REMIND_DAYS[Math.min(Math.max(seen - 1, 0), PW_REMIND_DAYS.length - 1)];
    const due      = last > 0 && (now - last) >= gapDays * 864e5;
    if (!first && !campaign && !due) return;
    localStorage.setItem('gt_pwWelcome', '1');
    localStorage.setItem('gt_pwCampaign', String(PW_CAMPAIGN));
    localStorage.setItem('gt_pwLast', String(now));
    localStorage.setItem('gt_pwSeenCount', String(seen + 1));
    openPaywall();
  }catch(_){}
}

// ── ANALYTICS / NUTZUNGS-TRACKER ──────────────────────
// Schreibt jede Session in Firestore:
//   analytics_users/{uid}     → {uid, firstSeen, lastSeen, totalSessions, totalSec, isAnon}
//   analytics_sessions/{sid}  → {uid, start, lastBeat, duration, isAnon}
// Live-Online-Count nutzt das bestehende RTDB-presence-System.

let _anaSessionRef   = null;
let _anaSessionStart = null;
let _anaLastBeatMs   = null;
let _anaHeartbeat    = null;
const ANA_HEARTBEAT_MS = 120 * 1000; // 120 s — halbiert die Firestore-Schreibkosten

// ── MULTI-TAB LEADER LOCK ──────────────────────────────────────────────────
// Nur der "Leader-Tab" sendet Heartbeats → verhindert Firestore-Spam bei
// vielen offenen Tabs. Leader-Claim läuft nach 90 s ab; anderer Tab übernimmt.
const _ANA_LEADER_KEY = 'gt_ana_leader';
const _ANA_LEADER_TTL = 180000;          // 1,5× Heartbeat-Intervall
const _ANA_TAB_ID     = '_' + Math.random().toString(36).slice(2, 10);

function _tryClaimLead() {
  try {
    const raw  = localStorage.getItem(_ANA_LEADER_KEY);
    const cur  = raw ? JSON.parse(raw) : null;
    const now  = Date.now();
    if (!cur || cur.id === _ANA_TAB_ID || (now - cur.ts) > _ANA_LEADER_TTL) {
      localStorage.setItem(_ANA_LEADER_KEY, JSON.stringify({ id: _ANA_TAB_ID, ts: now }));
      return true;
    }
    return false;
  } catch { return true; } // Im Zweifel senden
}
function _renewLead() {
  try { localStorage.setItem(_ANA_LEADER_KEY, JSON.stringify({ id: _ANA_TAB_ID, ts: Date.now() })); } catch {}
}
function _isLeader() {
  try {
    const cur = JSON.parse(localStorage.getItem(_ANA_LEADER_KEY) || 'null');
    return !cur || cur.id === _ANA_TAB_ID || (Date.now() - cur.ts) > _ANA_LEADER_TTL;
  } catch { return true; }
}
// ──────────────────────────────────────────────────────────────────────────

let _anaDisabled = false; // nach permission-denied nicht erneut versuchen (verhindert Retry-Spam)
async function analyticsStart(user) {
  if (!user || !window.FB?.configured) return;
  if (_anaDisabled) return;
  if (_anaSessionRef) return; // schon getrackt
  // Kein Leader → kein Heartbeat-Interval starten; nach 90 s erneut versuchen
  if (!_tryClaimLead()) {
    setTimeout(() => { if (_fbUser && !_anaSessionRef) analyticsStart(_fbUser); }, _ANA_LEADER_TTL);
    return;
  }
  try {
    _anaSessionStart = Date.now();
    _anaLastBeatMs   = Date.now();
    const userRef = window.FB.doc('analytics_users', user.uid);
    const isAnon  = !!user.isAnonymous;
    // KEIN getDoc hier: die Rules erlauben Lesen nur dem Admin. Der frühere
    // getDoc-Aufruf lief bei JEDEM normalen Nutzer auf permission-denied →
 // Tracking schaltete sich ab (deshalb existierte nur 1 analytics_users-Doc).
    // Stattdessen: update-first, bei not-found (Erstbesuch) anlegen.
    // isPremium/premPlan hier (analytics_users, admin-only lesbar) sind KEIN
    // Widerspruch zur "nicht im users-Doc"-Regel oben — das gilt nur für den
    // Sync-Doc jedes Nutzers selbst; hier ist es ein aggregiertes Admin-Feld
    // fürs Dashboard (Premium-Nutzer zählen/Umsatz schätzen).
    const premFields = { isPremium: isPremium(), premPlan: (PREM.active && PREM.plan) || null };
    try {
      await window.FB.updateDoc(userRef, {
        lastSeen: window.FB.serverTimestamp(),
        totalSessions: window.FB.increment(1),
 isAnon,...premFields
      });
    } catch (e) {
      if ((e?.code || '') !== 'not-found') throw e;
      await window.FB.setDoc(userRef, {
        uid: user.uid,
        firstSeen: window.FB.serverTimestamp(),
        lastSeen:  window.FB.serverTimestamp(),
        totalSessions: 1,
        totalSec: 0,
        isAnon, ...premFields
      });
    }
    _anaSessionRef = await window.FB.addDoc(window.FB.collection('analytics_sessions'), {
      uid: user.uid,
      start: window.FB.serverTimestamp(),
      lastBeat: window.FB.serverTimestamp(),
      duration: 0,
      isAnon
    });
    _anaHeartbeat = setInterval(_analyticsBeat, ANA_HEARTBEAT_MS);
    console.log('[GymTrack] 📊 Analytics-Session gestartet', isAnon ? '(anonym)' : '(Google)');
  } catch (e) {
    if ((e?.code || '') === 'permission-denied') _anaDisabled = true; // Rules blocken → kein Retry
    console.warn('[GymTrack] Analytics-Start fehlgeschlagen (vermutlich Firestore-Rules):', e?.code || e?.message || e);
  }
}

async function _analyticsBeat(force = false) {
  if (!_anaSessionRef || !_anaSessionStart) return;
  // Laufende Intervall-Beats nur senden wenn: Tab sichtbar UND dieser Tab Leader ist
  if (!force && document.visibilityState !== 'visible') return;
  if (!force && !_isLeader()) return;
  try {
    _renewLead(); // Leader-Timestamp auffrischen
    const nowMs  = Date.now();
    const durSec = Math.floor((nowMs - _anaSessionStart) / 1000);
    // Nutzungssekunden seit letztem Beat — gedeckelt auf 300 s, damit lange
    // Hintergrund-Pausen (iOS friert JS ein) nicht als Nutzung zählen.
    const deltaSec = Math.min(300, Math.max(0, Math.round((nowMs - (_anaLastBeatMs || _anaSessionStart)) / 1000)));
    _anaLastBeatMs = nowMs;
    await window.FB.updateDoc(_anaSessionRef, {
      lastBeat: window.FB.serverTimestamp(),
      duration: durSec
    });
    if (_fbUser) {
      const userRef = window.FB.doc('analytics_users', _fbUser.uid);
      await window.FB.updateDoc(userRef, {
        lastSeen: window.FB.serverTimestamp(),
        isPremium: isPremium(), premPlan: (PREM.active && PREM.plan) || null,
        ...(deltaSec > 0 ? { totalSec: window.FB.increment(deltaSec) } : {})
      });
    }
  } catch (e) { /* silent */ }
}

function analyticsStop() {
  if (_anaHeartbeat) { clearInterval(_anaHeartbeat); _anaHeartbeat = null; }
  _analyticsBeat();
  _anaSessionRef   = null;
 _anaSessionStart = null;
}

document.addEventListener('visibilitychange', () => {
 if (document.visibilityState ==='hidden') {
    _analyticsBeat(true); // finaler Beat: immer senden
    // Widget-Daten SOFORT flushen: iOS friert das JS gleich ein — ein noch
    // laufender 800ms-Debounce würde nie feuern → Widget bliebe veraltet.
    _updateWidgetData(true);
    try { _flushActiveWk(); } catch(_) {} // laufendes Training sofort sichern
    // Gleiches Problem beim Coach-Dossier: ein noch laufender 4s-Debounce
    // (z. B. gerade erst eingetragene Einschraenkung) wuerde sonst nie
    // pushen, bevor iOS die App einfriert (Review Wichtig 2).
    try { _dossierFlush(); } catch(_) {}
    // Zum SCHLUSS: der entprellte State-Schreiber (js/app-native.js). Zuletzt,
    // weil die Flushes darueber selbst noch persist() aufrufen koennen.
    try { _persistFlush(); } catch(_) {}
  }
  else if (document.visibilityState === 'visible') {
    if (_fbUser && !_anaSessionRef) analyticsStart(_fbUser);
    _consumeWidgetDeltas(); // im Widget getätigte +1-Taps übernehmen
    _updateWidgetData();    // z. B. Tages-/Wochenwechsel während App im Hintergrund
    if (S.socialOn) { _pushRegister(); _flameNotifStart(); _friendPostNotifStart(); _communityNotifStart(); _reqNotifStart(); }   // Listener binden: Flammen + Freundes-Posts + Community-Feed live
    // Review Fix 1: falls der letzte Dossier-Push nie bestaetigt wurde (App-Kill
    // waehrend des vorigen Backgroundings), jetzt erneut versuchen.
    try { _dossierRetryIfDirty(); } catch(_) {}
  }
});
window.addEventListener('pagehide',     () => { _analyticsBeat(true); _updateWidgetData(true); try { _flushActiveWk(); } catch(_) {} try { _dossierFlush(); } catch(_) {} try { _persistFlush(); } catch(_) {} });
window.addEventListener('beforeunload', () => { _analyticsBeat(true); try { _persistFlush(); } catch(_) {} });

// ── ADMIN-MODUS ───────────────────────────────────────
// 5× tap auf Version-Zeile (binnen 3s) → Admin-Modus aktivieren
let _adminTapTimes = [];
function adminTapCount() {
  const now = Date.now();
  _adminTapTimes = _adminTapTimes.filter(t => now - t < 3000);
  _adminTapTimes.push(now);
  if (_adminTapTimes.length >= 5) {
    _adminTapTimes = [];
    if (!_fbUser) {
      alert('Bitte zuerst anmelden — Admin-Modus benötigt deine UID.');
      return;
    }
    if (confirm('Admin-Modus aktivieren?\n\nDeine UID:\n' + _fbUser.uid + '\n\nDanach erscheint der „App-Statistiken"-Bereich. Beachte: Firestore-Rules müssen ebenfalls auf diese UID gesetzt sein, damit die Daten gelesen werden können.')) {
      S.adminUid = _fbUser.uid;
      persist();
      haptic(40);
      updateAdminUI();
    }
  } else if (_adminTapTimes.length >= 3) {
    // sanftes Feedback dass etwas passiert
    haptic(8);
  }
}
function adminDisable() {
  if (!confirm('Admin-Modus auf diesem Gerät deaktivieren?')) return;
  S.adminUid = '';
  persist();
  updateAdminUI();
}
function adminCopyUid() {
  const uid = _fbUser?.uid;
  if (!uid) { alert('Nicht angemeldet.'); return; }
  navigator.clipboard?.writeText(uid).then(() => {
    haptic(15);
    const t = document.getElementById('update-toast');
    if (t) { t.textContent = '✓ UID kopiert'; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 1600); }
  }).catch(() => alert(uid));
}

async function adminDiagnose() {
  const out = document.getElementById('diag-out');
  if (!out) { try { alert('Diagnose-Element nicht da — alte Version aktiv'); } catch(_){} return; }
  out.style.display = '';
  const lines = [];
  const ok  = (s) => '✅ ' + s;
  const bad = (s) => '❌ ' + s;
  const inf = (s) => 'ℹ️ ' + s;
  const flush = () => { out.textContent = lines.join('\n'); };
  lines.push('Diagnose läuft…'); flush();

  try {
    lines.length = 0;
    lines.push(inf('App-Version: ' + (typeof APP_VERSION === 'string' ? APP_VERSION : '?')));
    if (!window.FB?.configured) { lines.push(bad('Firebase nicht konfiguriert')); flush(); return; }
    lines.push(ok('Firebase configured'));
    const u = window.FB.auth?.currentUser;
    if (!u) { lines.push(bad('Nicht eingeloggt (currentUser ist null)')); flush(); return; }
    lines.push(ok('Eingeloggt: ' + (u.email || '(anonym)')));
    lines.push(inf('UID in App:'));
    lines.push('    ' + u.uid);
    lines.push(inf('Admin-UID gespeichert:'));
    lines.push('    ' + (S.adminUid || '(leer)'));
    lines.push(u.uid === S.adminUid ? ok('UID stimmt mit Admin-UID überein') : bad('UID stimmt NICHT mit Admin-UID überein'));
    flush();

    try {
      const snap = await window.FB.getDocs(window.FB.collection('analytics_sessions'));
      lines.push(ok('analytics_sessions lesen: ' + snap.size + ' Dokumente'));
    } catch (e) {
      lines.push(bad('analytics_sessions LESEN fehlgeschlagen:'));
      lines.push('    ' + (e?.code || e?.message || e));
    }
    flush();

    try {
      const snap = await window.FB.getDocs(window.FB.collection('analytics_users'));
      lines.push(ok('analytics_users lesen: ' + snap.size + ' Dokumente'));
    } catch (e) {
      lines.push(bad('analytics_users LESEN fehlgeschlagen:'));
      lines.push('    ' + (e?.code || e?.message || e));
    }
    flush();

    try {
      const snap = await window.FB.rtdbGet('presence');
      const data = snap.val() || {};
      let online = 0;
      Object.values(data).forEach(p => { if (p && p.online === true) online++; });
      lines.push(ok('RTDB presence lesen: ' + Object.keys(data).length + ' Einträge, ' + online + ' online'));
    } catch (e) {
      lines.push(bad('RTDB presence LESEN fehlgeschlagen:'));
      lines.push('    ' + (e?.code || e?.message || e));
    }
    lines.push('');
    lines.push('— Diagnose fertig —');
    flush();
  } catch (e) {
    lines.push(bad('Unerwarteter Fehler: ' + (e?.message || e)));
    flush();
  }
}
function isAdmin() {
  return !!(S.adminUid && _fbUser && S.adminUid === _fbUser.uid);
}
function updateAdminUI() {
  const sec = document.getElementById('admin-section');
  if (!sec) return;
  sec.style.display = isAdmin() ? '' : 'none';
  const uidSub = document.getElementById('admin-uid-sub');
  if (uidSub && _fbUser) uidSub.textContent = _fbUser.uid;
}

// ── ADMIN-STATISTIKEN LADEN & RENDERN ─────────────────
let _adminStatsInt = null;

function openAdminStats() {
  if (!isAdmin()) return;
  openOv('ov-admin-stats');
  loadAdminStats();
  if (_adminStatsInt) clearInterval(_adminStatsInt);
  _adminStatsInt = setInterval(loadAdminStats, 30000);
}
// Auto-Stop bei Schließen
(function(){
  const orig = closeOv;
  closeOv = function(id) {
    orig(id);
    if (id === 'ov-admin-stats' && _adminStatsInt) {
      clearInterval(_adminStatsInt); _adminStatsInt = null;
    }
  };
})();

function _fmtDur(sec) {
  if (!sec || sec < 1) return '0 s';
  if (sec < 60) return sec + ' s';
  const m = Math.floor(sec/60), s = sec % 60;
  if (m < 60) return m + ':' + String(s).padStart(2,'0') + ' min';
  const h = Math.floor(m/60), mm = m % 60;
  return h + ':' + String(mm).padStart(2,'0') + ' h';
}

// Helper: Promise mit Timeout (verhindert Hänger bei fehlender RTDB-URL etc.)
function _withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout-' + (label||'') + ' (>' + ms + 'ms)')), ms))
  ]);
}

async function loadAdminStats() {
  if (!isAdmin() || !window.FB?.configured) return;
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const statusEl = document.getElementById('admin-stats-status');
  if (statusEl) { statusEl.textContent = 'Lade…'; statusEl.style.color = ''; statusEl.style.fontWeight = ''; }
  const errs = [];
  const now = Date.now();
  const dayMs = 86400000;

  // ── 1) Live-Online (RTDB presence) — optional, mit Timeout
  const loadPresence = (async () => {
    try {
      const snap = await _withTimeout(window.FB.rtdbGet('presence'), 4000, 'rtdb');
      const data = snap.val() || {};
      let online = 0;
      Object.values(data).forEach(p => { if (p && p.online === true) online++; });
      setText('stat-online', online);
      setText('stat-online-sub', 'Live-Count via Realtime Presence');
    } catch(e) {
      setText('stat-online', '?');
      setText('stat-online-sub', 'RTDB nicht erreichbar (optional)');
      errs.push('RTDB: ' + (e?.code || e?.message || e));
    }
  })();

  // ── 2) analytics_users
  const loadUsers = (async () => {
    try {
      const usersSnap = await _withTimeout(
        window.FB.getDocs(window.FB.collection('analytics_users')),
        12000, 'users'
      );
      let dau = 0, wau = 0, mau = 0, total = 0, new7 = 0;
      let ret1 = {seen:0, returned:0}, ret7 = {seen:0, returned:0}, ret30 = {seen:0, returned:0};
      usersSnap.forEach(d => {
        const u = d.data();
        const firstSeen = u.firstSeen?.toMillis?.() || 0;
        const lastSeen  = u.lastSeen?.toMillis?.()  || 0;
        total++;
        const sinceLast = now - lastSeen;
        if (sinceLast < dayMs)    dau++;
        if (sinceLast < 7*dayMs)  wau++;
        if (sinceLast < 30*dayMs) mau++;
        if (firstSeen && now - firstSeen < 7*dayMs) new7++;
        const age = now - firstSeen;
        if (age >= 1*dayMs)   { ret1.seen++;  if (lastSeen - firstSeen >= 0.8*dayMs) ret1.returned++; }
        if (age >= 7*dayMs)   { ret7.seen++;  if (lastSeen - firstSeen >= 6*dayMs)   ret7.returned++; }
        if (age >= 30*dayMs)  { ret30.seen++; if (lastSeen - firstSeen >= 28*dayMs)  ret30.returned++; }
      });
      setText('stat-dau', dau);
      setText('stat-wau', wau);
      setText('stat-mau', mau);
      setText('stat-total', total);
      setText('stat-new-7d', new7);
      const pct = (r) => r.seen ? Math.round(100*r.returned/r.seen) + '%' : '—';
      setText('stat-ret-1',  pct(ret1));
      setText('stat-ret-7',  pct(ret7));
      setText('stat-ret-30', pct(ret30));
    } catch(e) {
      errs.push('Users: ' + (e?.code || e?.message || e));
    }
  })();

  // ── 3) Sessions: ALLE laden, client-seitig filtern (kein Index nötig)
  const loadSessions = (async () => {
    try {
      const sessSnap = await _withTimeout(
        window.FB.getDocs(window.FB.collection('analytics_sessions')),
        12000, 'sessions'
      );
      const durations = [];
      let sess7 = 0, sess30 = 0;
      sessSnap.forEach(d => {
        const s = d.data();
        const startMs = s.start?.toMillis?.() || 0;
        if (!startMs || now - startMs > 30*dayMs) return;
        const dur = s.duration || 0;
        durations.push(dur);
        sess30++;
        if (now - startMs < 7*dayMs) sess7++;
      });
      const avg = durations.length ? Math.round(durations.reduce((a,b)=>a+b,0) / durations.length) : 0;
      const sorted = durations.slice().sort((a,b)=>a-b);
      const med = sorted.length ? sorted[Math.floor(sorted.length/2)] : 0;
      setText('stat-avg-dur', _fmtDur(avg));
      setText('stat-med-dur', _fmtDur(med));
      setText('stat-sess-7d',  sess7);
      setText('stat-sess-30d', sess30);
    } catch(e) {
      errs.push('Sessions: ' + (e?.code || e?.message || e));
    }
  })();

  // Parallel ausführen — ein Fehler/Timeout blockiert nicht die anderen
  await Promise.allSettled([loadPresence, loadUsers, loadSessions]);

  const ts = new Date().toLocaleTimeString(GT_LOCALE,{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  if (statusEl) {
    if (errs.length) {
      statusEl.textContent = '⚠️ ' + errs.join(' · ');
      statusEl.style.color = 'var(--red)';
      statusEl.style.fontWeight = '600';
    } else {
      statusEl.textContent = 'Zuletzt aktualisiert: ' + ts;
      statusEl.style.color = '';
      statusEl.style.fontWeight = '';
    }
  }
}

// ── Google Identity Services (GIS) — funktioniert auch in iOS-PWA ──
let _gisReady = false;

function _initGoogleIdentity() {
  if (!window.google || !window.google.accounts || !window.google.accounts.id) {
    // GIS-Script noch nicht da → später erneut versuchen
    setTimeout(_initGoogleIdentity, 200);
    return;
  }
  try {
    window.google.accounts.id.initialize({
      client_id: window.GOOGLE_CLIENT_ID,
      callback: _handleGoogleCredential,
      auto_select: false,
      cancel_on_tap_outside: false,
      ux_mode: 'popup',
      itp_support: true,
      use_fedcm_for_prompt: true
    });
    _gisReady = true;
    console.log('[GymTrack] 🔑 Google Identity Services bereit');
    // Wenn Sheet offen ist → Button jetzt rendern
    if (document.getElementById('ov-account')?.classList.contains('on')) {
      _renderGisButton();
    }
  } catch (e) {
    console.error('[GymTrack] ❌ GIS-Init fehlgeschlagen:', e);
  }
}

function _renderGisButton() {
  const host = document.getElementById('gsi-btn-host');
  if (!host) return;
  // Native ODER normaler Web-Browser (Desktop/Android) → eigener Button.
  // signInWithPopup ist dort der zuverlässigste Weg. Nur die iOS-Standalone-PWA
  // braucht den GIS-Button, weil dort Popups blockiert sind.
  if (_isNative() || !_isIosStandalonePWA()) {
    host.innerHTML = `<button onclick="doGoogleSignIn()" style="
      display:flex;align-items:center;gap:10px;
      background:#fff;color:#3c4043;border:1px solid #dadce0;border-radius:22px;
      padding:11px 24px;font-size:15px;font-weight:600;font-family:inherit;
      cursor:pointer;min-width:280px;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.12)">
      <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>
      Mit Google anmelden
    </button>`;
    return;
  }
  if (!_gisReady || !window.google) return;
  host.innerHTML = '';
  try {
    window.google.accounts.id.renderButton(host, {
      type: 'standard',
      theme: 'filled_blue',
      size: 'large',
      text: 'signin_with',
      shape: 'pill',
      logo_alignment: 'left',
      locale: 'de',
      width: 280
    });
  } catch (e) {
    console.error('[GymTrack] ❌ GIS renderButton fehlgeschlagen:', e);
    host.innerHTML = '<button class="btn btn-acc" onclick="doGoogleSignIn()">Mit Google anmelden (Fallback)</button>';
  }
}

async function _handleGoogleCredential(response) {
  console.log('[GymTrack] 🔑 Google-Credential erhalten');
  if (!response || !response.credential) {
    console.warn('[GymTrack] Kein ID-Token in Response:', response);
    return;
  }
  if (!window.FB || !window.FB.configured) {
    alert('Firebase nicht konfiguriert.');
    return;
  }
  _loginInProgress = true;
  try {
    const cred   = window.FB.googleCredential(response.credential);
    const result = await window.FB.signInWithCredential(cred);
    console.log('[GymTrack] ✅ Firebase-Login via GIS ok:', result?.user?.email);
  } catch (e) {
    console.error('[GymTrack] ❌ signInWithCredential fehlgeschlagen:', e);
    // Fallback: Redirect-Login (WKWebView-kompatibel — kein window.open() nötig)
    try {
      console.log('[GymTrack] Fallback → signInWithRedirect nach GIS-Fehler');
      try { localStorage.setItem('gt_pendingRedirect','1'); } catch(_){}
      await window.FB.signInWithRedirect();
      return;
    } catch (e2) {
      console.error('[GymTrack] ❌ Redirect-Fallback ebenfalls fehlgeschlagen:', e2);
    }
    alert('Login fehlgeschlagen:\n\n' + (e?.code || '') + '\n' + (e?.message || e));
  } finally {
    _loginInProgress = false;
  }
}

// ── Google Sign-In: PKCE OAuth via ASWebAuthenticationSession ──
const _GG_IOS_CLIENT  = '404501862861-bp9ren7aem7kn324urqo91ejk1mbpmhv.apps.googleusercontent.com';
const _GG_REDIRECT    = 'com.googleusercontent.apps.404501862861-bp9ren7aem7kn324urqo91ejk1mbpmhv:/oauth2redirect/google';
const _GG_CB_SCHEME   = 'com.googleusercontent.apps.404501862861-bp9ren7aem7kn324urqo91ejk1mbpmhv';
let _googlePKCE = null;

async function _pkceChallenge() {
  const verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2,'0')).join('');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  return { verifier, challenge };
}

async function doGoogleSignIn() {
  if (!window.FB?.configured) {
    alert('Firebase ist noch nicht konfiguriert.');
    return;
  }
  if (!_isNative()) {
    // iOS-Standalone-PWA: Popup ist blockiert → GIS-Prompt verwenden.
    if (_isIosStandalonePWA()) {
      console.log('[GymTrack] → GIS-Prompt (iOS-PWA)');
      try { window.google?.accounts?.id?.prompt(); }
      catch(e) { alert('Login fehlgeschlagen:\n' + (e?.code||'') + '\n' + (e?.message||e)); }
      return;
    }
    // Desktop/Android-Web: signInWithPopup (zuverlässigster Weg, kein Redirect-Bug).
    _loginInProgress = true;
    try {
      console.log('[GymTrack] → signInWithPopup');
      await window.FB.signInWithPopup();
    } catch(e) {
      console.warn('[GymTrack] Popup-Login fehlgeschlagen:', e?.code || e);
      // User hat das Fenster selbst geschlossen → still beenden
      if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') return;
      // Popup blockiert / nicht unterstützt → Redirect als Fallback
      if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/operation-not-supported-in-this-environment') {
        try { localStorage.setItem('gt_pendingRedirect','1'); await window.FB.signInWithRedirect(); return; }
        catch(e2) { try{localStorage.removeItem('gt_pendingRedirect');}catch(_){} alert('Login fehlgeschlagen:\n' + (e2?.code||'') + '\n' + (e2?.message||e2)); return; }
      }
      alert('Login fehlgeschlagen:\n' + (e?.code||'') + '\n' + (e?.message||e));
    } finally {
      _loginInProgress = false;
    }
    return;
  }
  // Native (Capacitor iOS): PKCE via ASWebAuthenticationSession ist der offizielle
  // iOS-Weg (kein window.open/opener nötig). Bei jedem PKCE-Fehler automatisch
  // signInWithPopup als Fallback versuchen.
  _loginInProgress = true;
  try {
    await _doNativeGoogleSignInPKCE();
  } finally {
    _loginInProgress = false;
  }
}

// PKCE-Flow für native iOS (ASWebAuthenticationSession)
async function _doNativeGoogleSignInPKCE() {
  const GA = _cap('GoogleAuthPlugin');
  _adbg('Google: plugin=' + (GA ? 'OK' : 'NULL'));
  if (!GA) {
    alert('Google-Login-Plugin nicht verfügbar.\nBitte die App neu starten.');
    return;
  }
  try {
    const pkce  = await _pkceChallenge();
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map(b => b.toString(16).padStart(2,'0')).join('');
    _googlePKCE = { verifier: pkce.verifier, nonce };
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' +
      'client_id='            + encodeURIComponent(_GG_IOS_CLIENT) +
      '&redirect_uri='        + encodeURIComponent(_GG_REDIRECT)   +
      '&response_type=code'   +
      '&scope=openid%20email%20profile' +
      '&code_challenge='      + pkce.challenge +
      '&code_challenge_method=S256' +
      '&nonce='               + nonce;
    window._ggTrace = ['1) PKCE gestartet'];
    _adbg('Google: startAuth →');
    const result = await GA.startAuth({ url, callbackScheme: _GG_CB_SCHEME });
    _adbg('Google: callback=' + (result?.url ? 'OK' : 'NULL'));
    window._ggTrace.push('2) Callback: ' + (result?.url ? result.url.slice(0,60) : '(KEINE URL)'));
    await _handleGoogleOAuthCallback(result.url);
  } catch(e) {
    _googlePKCE = null;
    _adbg('Google PKCE ERR: ' + String(e?.message || e).slice(0, 70));
    if (e?.message === 'cancelled') return;
    console.error('[GymTrack] PKCE-Fehler:', e?.message || e);
    alert('❌ Google-Login:\n' + (e?.code || 'kein code') + '\n' + (e?.message || e));
  }
}

async function _handleGoogleOAuthCallback(rawUrl) {
  try {
    let code, error;
    try {
      const u = new URL(rawUrl);
      code  = u.searchParams.get('code');
      error = u.searchParams.get('error');
    } catch(_) {
      const cm = rawUrl.match(/[?&]code=([^&]+)/);
      const em = rawUrl.match(/[?&]error=([^&]+)/);
      code  = cm ? decodeURIComponent(cm[1]) : null;
      error = em ? decodeURIComponent(em[1]) : null;
    }
    _adbg('Google: code=' + (code ? 'OK' : 'NEIN') + ' err=' + (error || '-'));
    window._ggTrace = window._ggTrace || [];
    window._ggTrace.push('3) code=' + (code?'ja':'NEIN') + ' error=' + (error||'-'));
    if (error) {
      alert('Google Fehler: ' + error +
        (error === 'access_denied' ? '\n→ Konto nicht als Testnutzer eingetragen (OAuth-Zustimmung).' : ''));
      return;
    }
    if (!code || !_googlePKCE) {
      alert('Google: State verloren.\n\nTrace:\n' + (window._ggTrace||[]).join('\n'));
      return;
    }
    _adbg('Google: token-tausch →');
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     _GG_IOS_CLIENT,
        redirect_uri:  _GG_REDIRECT,
        grant_type:    'authorization_code',
        code_verifier: _googlePKCE.verifier
      })
    });
    const tok = await resp.json();
    _googlePKCE = null;
    _adbg('Google: tok=' + (tok.error ? 'ERR:'+tok.error : (tok.id_token ? 'id_token' : '') + (tok.access_token ? '+access' : '')));
    window._ggTrace.push('4) ' + (tok.error ? 'FEHLER ' + tok.error : tok.id_token ? 'id_token OK' : 'kein id_token'));
    if (tok.error) throw new Error(tok.error_description || tok.error);
    if (!tok.id_token && !tok.access_token) throw new Error('Weder ID- noch Access-Token erhalten');
    let fbRes = null;
    if (tok.id_token) {
      try {
        _adbg('Google: signInWithCredential(id_token) →');
        fbRes = await window.FB.signInWithCredential(window.FB.googleCredential(tok.id_token, tok.access_token || null));
        _adbg('Google: id_token OK ✅');
        window._ggTrace.push('5) id_token ok');
      } catch (e1) {
        _adbg('Google: id_token ERR: ' + (e1?.code || String(e1?.message||e1).slice(0,50)));
        window._ggTrace.push('5a) id_token abgelehnt: ' + (e1?.code || e1?.message));
      }
    }
    if (!fbRes) {
      if (!tok.access_token) throw new Error('id_token abgelehnt + kein access_token');
      _adbg('Google: signInWithCredential(access_token) →');
      fbRes = await window.FB.signInWithCredential(window.FB.googleCredential(null, tok.access_token));
      _adbg('Google: access_token OK ✅');
      window._ggTrace.push('5b) access_token ok');
    }
    const user = fbRes?.user || window.FB.auth?.currentUser;
    _adbg('Google: user=' + (user ? (user.email || user.uid) : 'NULL'));
    // Coach-Kontowechsel-Erkennung explizit hier anstossen (Review Fix 4):
    // onAuthStateChanged feuert in der WKWebView nicht zuverlaessig, dieser
    // Pfad ruft _onLogin() direkt auf und wuerde die Erkennung sonst umgehen.
    if (user) { _coachHandleAuthUser(user); _onLogin(user); }
    else _adbg('Google: ⚠️ kein User nach Login!');
  } catch(e) {
    _googlePKCE = null;
    _adbg('Google CB ERR: ' + (e?.code || '') + ' ' + String(e?.message||e).slice(0, 60));
    console.error('[GymTrack] ❌ Google OAuth Callback:', e);
    alert('Google:\n' + (e?.code || 'kein code') + '\n' + (e?.message || e) +
          '\n\nTrace:\n' + (window._ggTrace||[]).join('\n'));
  }
}

function _setupAppUrlListener() {
  const App = window.Capacitor?.Plugins?.App;
  if (!App) return;
  App.addListener('appUrlOpen', (data) => {
    const url = data?.url || '';
    // Google-OAuth-Callback NICHT hier behandeln: ASWebAuthenticationSession liefert
    // die Callback-URL bereits über ihren eigenen Completion-Handler (die startAuth-Promise).
    // Eine zweite Behandlung hier würde nur einen falschen "State verloren"-Fehler auslösen.
    if (url.startsWith('gymtrack://import') || /[?&]import=/.test(url)) {
      _handlePlanImportUrl(url);
    } else if (url.startsWith('gymtrack://')) {
      _handleWidgetDeepLink(url);
    }
  });
  // Kaltstart per Deep-Link (App war geschlossen): Launch-URL nachträglich prüfen.
  try {
    App.getLaunchUrl?.().then(res => {
      const u = res && res.url;
      if (u && (u.startsWith('gymtrack://import') || /[?&]import=/.test(u))) setTimeout(() => { try { _handlePlanImportUrl(u); } catch(_){} }, 900);
    }).catch(()=>{});
  } catch(_){}
  console.log('[GymTrack] 📱 appUrlOpen-Listener registriert');
}

// Deep-Link aus dem Home-Screen-Widget (z.B. gymtrack://day/2 = Mittwoch)
function _handleWidgetDeepLink(url) {
  try {
    // Live-Activity / Dynamic Island angetippt → zurück zum laufenden Training,
    // also dorthin, wo man die App verlassen hat — NICHT zur Statistik.
    if (/^gymtrack:\/\/workout/.test(url)) {
      if (typeof isWorkoutActive === 'function' && isWorkoutActive()
          && typeof resumeWorkout === 'function') {
        resumeWorkout();
      }
      return; // sonst aktuellen Zustand/Tab unverändert lassen
    }
    // Tracker-Ring im Widget angetippt (iOS-16-Fallback) → +1 in der App
    const t = url.match(/^gymtrack:\/\/track\/([^/?#]+)/);
    if (t) {
      goTabId('heute');
      if (typeof incrementTracker === 'function') incrementTracker(decodeURIComponent(t[1]));
      return;
    }
    // Jahresmatrix-Widget angetippt → derselbe Kalender, aber direkt in der
    // Matrix-Ansicht. Das Widget IST dieses Raster; es woanders hin zu öffnen
    // hiesse, den Nutzer nach dem Tippen suchen zu lassen.
    if (/^gymtrack:\/\/matrix/.test(url)) {
      goTabId('heute');
      setTimeout(() => {
        try {
          if (typeof openCalendarOverlay === 'function') openCalendarOverlay();
          if (typeof setCalMode === 'function') setCalMode('matrix');
        } catch(_){}
      }, 120);
      return;
    }
    // Wochentag-Kreis im Widget angetippt → Kalender öffnen, aber Tab bleibt "Heute".
    // NUR für gymtrack://day/N. App soll bei JEDEM Start (auch übers Widget)
    // immer auf "Heute" landen, nie auf der Statistik.
    if (!/^gymtrack:\/\/day\/\d+/.test(url)) return;
    goTabId('heute');
    setTimeout(() => { if (typeof openCalendarOverlay === 'function') openCalendarOverlay(); }, 120);
  } catch(e) {}
}

// SHA256 → Hex. Apple bekommt den Hash der Nonce, Firebase die rohe Nonce.
async function _sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function _adbg(msg) {
  console.log('[AuthDBG] ' + msg);
}

async function doAppleSignIn() {
  _adbg('Apple: start native=' + _isNative());
  let ASP = _cap('AppleSignInPlugin');
  _adbg('Apple: plugin=' + (ASP ? 'OK' : 'NULL'));
  if (!ASP && _isNative()) {
    await new Promise(r => setTimeout(r, 500));
    ASP = _cap('AppleSignInPlugin');
    _adbg('Apple: plugin(retry)=' + (ASP ? 'OK' : 'NULL'));
  }
  if (!ASP) { alert('Apple Sign In nicht verfügbar.\n_isNative: ' + _isNative()); return; }
  if (!window.FB?.configured) { alert('Firebase nicht konfiguriert.'); return; }
  _loginInProgress = true;
  try {
    const rawNonce = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    const hashedNonce = await _sha256Hex(rawNonce);
    _adbg('Apple: authorize() →');
    const result = await ASP.authorize({ nonce: hashedNonce });
    _adbg('Apple: token=' + (result?.identityToken ? 'OK(' + result.identityToken.length + 'ch)' : 'NULL'));
    if (!result?.identityToken) throw new Error('Kein Identity Token von Apple erhalten');
    const cred = window.FB.appleCredential(result.identityToken, rawNonce);
    _adbg('Apple: signInWithCredential →');
    const fbRes = await window.FB.signInWithCredential(cred);
    const user = fbRes?.user || window.FB.auth?.currentUser;
    _adbg('Apple: user=' + (user ? (user.email || user.uid || 'anon') : 'NULL'));
    // Coach-Kontowechsel-Erkennung explizit hier anstossen (Review Fix 4):
    // onAuthStateChanged feuert in der WKWebView nicht zuverlaessig, dieser
    // Pfad ruft _onLogin() direkt auf und wuerde die Erkennung sonst umgehen.
    if (user) { _coachHandleAuthUser(user); _onLogin(user); }
    else _adbg('Apple: ⚠️ kein User — onAuthState-Fallback?');
  } catch(e) {
    _adbg('Apple ERR: ' + (e?.code || '') + ' | ' + String(e?.message || e).slice(0, 70));
    // Nur Abbruch durch den User stumm schlucken.
    if (e?.message === 'cancelled' || e?.code === 'canceled') return;
    console.error('[GymTrack] ❌ Apple Sign In fehlgeschlagen:', e);
    // Klartext-Meldung des nativen Plugins (Simulator/Unknown) direkt zeigen –
    // die rohe „…AuthorizationError error 1000"-Meldung hilft dem User nicht.
    const raw = String(e?.message || e);
    const friendly = (e?.code === 'simulator' || e?.code === 'unknown') ? raw
      : /error 1000|AuthorizationError|1000/i.test(raw)
        ? 'Anmelden mit Apple ist fehlgeschlagen. Im iOS-Simulator geht das nur mit angemeldetem iCloud-Konto – bitte auf einem echten Gerät und mit aktivem iCloud-Login erneut versuchen.'
        : raw;
    alert('Anmelden mit Apple\n\n' + friendly);
  } finally {
    _loginInProgress = false;
  }
}

async function doSignOut() {
  if (!window.FB || !window.FB.configured || !_fbUser) return;
  /* Der Satz nennt seit Task 22 BEIDES: was bleibt und was geht. Die alte
     Fassung ("Deine lokalen Daten bleiben erhalten") war nach der
     Datentrennung nur noch halb wahr — und die fehlende Haelfte ist die
     ueberraschende. tr() greift jetzt ebenfalls; vorher stand der Satz auch
     fuer englische Nutzer auf Deutsch da.
     Zwei Praezisierungen aus der Abschluss-Review von Block 5:
     - "die Wochenberichte werden zurueckgesetzt" stimmte, wirkte aber
       widerlegt: der Reiter "Woche" zeigt dem neuen Konto sofort wieder
       Zahlen. Geraeumt ist das ARCHIV; die Zahlen der laufenden Woche rechnet
       der Coach aus den Einheiten neu, die auf dem Geraet bleiben.
     - Name und Ton kommen seit der Persona-Synchronisierung auf DEMSELBEN
       Konto aus der Cloud zurueck. Ein Satz, der sie ohne Einschraenkung als
       "zurueckgesetzt" ankuendigt, waere jetzt falsch. */
  if (!confirm(tr('Wirklich abmelden?\n\nDeine Trainings und Übungen bleiben auf diesem Gerät. Dein Coach beginnt für das nächste Konto von vorn: Name, Ton, Erzählbogen und das Berichtsarchiv gehen von diesem Gerät — die Zahlen der laufenden Woche rechnet er aus deinen Einheiten neu. Meldest du dich später wieder mit diesem Konto an, kommen Name und Ton zurück.'))) return;
  // Push-Token dieses Geräts aus dem Profil löschen — sonst bleibt er im Konto
  // stehen und der nächste Account, der sich auf DIESEM Gerät anmeldet, bekommt
  // fälschlich Flammen-Push-Benachrichtigungen für Posts des alten Kontos.
  if (_socReady()) { try { await window.FB.updateDoc(window.FB.doc('profiles', _fbUser.uid), { pushToken: null }); } catch(_){} }
  _pushToken = null;
  try { await window.FB.signOut(); } catch(e) { console.warn(e); }
  /* Flammen-Punkte sind kontogebunden und werden seit dem Cloud-Abgleich
     zusammengefuehrt. Bleibt die Bank auf dem Geraet stehen, erbt sie das
     naechste Konto ueber _flameBankMerge und traegt sie in DESSEN Cloud-Doc
     ein — die Bank waechst monoton, das waere nicht mehr rueckgaengig zu
     machen. Beim naechsten Login desselben Kontos kommt sie aus der Cloud. */
  try { localStorage.removeItem('gt_flameBank'); } catch(_) {}
  try { localStorage.removeItem('gt_flamesGiven'); } catch(_) {}
}

// ── Konto endgültig löschen (Apple App Store Guideline 5.1.1(v)) ──
let _pendingDelete = false;

async function doDeleteAccount() {
  if (!window.FB || !window.FB.configured || !_fbUser || _fbUser.isAnonymous) return;
  if (!confirm('Konto und alle Cloud-Daten endgültig löschen?\n\nDeine Trainings, Übungen und Einstellungen in der Cloud werden unwiderruflich entfernt. Das kann NICHT rückgängig gemacht werden.')) return;
  if (!confirm('Letzte Warnung — dein Konto wird jetzt gelöscht. Fortfahren?')) return;
  await _runAccountDeletion();
}

async function _runAccountDeletion() {
  const user = window.FB.auth && window.FB.auth.currentUser;
  if (!user) return;
  let dossierDeleteFailed = false;
  try {
    // 1. Cloud-Daten löschen
    // Reihenfolge zwingend: Firestore loescht Subcollections NICHT mit. Ohne
    // diesen Schritt ueberlebt das Coach-Dossier — und damit gemeldete
    // Einschraenkungen — die Kontoloeschung.
    // Ein Fehlversuch wird einmal wiederholt. Schlaegt auch der zweite Versuch
    // fehl, bleibt das Dossier verwaist zurueck (Auth-User ist dann weg, die
    // Rule kennt keine Admin-Ausnahme fuer Gesundheitsdaten) — das darf NICHT
    // als vollstaendiger Erfolg gemeldet werden, siehe dossierDeleteFailed unten.
    try { await window.FB.deleteDoc(window.FB.doc('users/' + user.uid + '/coach', 'dossier')); }
    catch(e) {
      console.warn('[GymTrack] Dossier-Delete (Versuch 1):', e);
      try { await window.FB.deleteDoc(window.FB.doc('users/' + user.uid + '/coach', 'dossier')); }
      catch(e2) {
        console.warn('[GymTrack] Dossier-Delete (Versuch 2):', e2);
        dossierDeleteFailed = true;
      }
    }
    // Zusaetzlich zum gt_-Rundumschlag in _finishAccountWipe(), weil der nur
    // auf dem Erfolgspfad laeuft. Greift erst, wenn Task 7 coach-memory.js
    // einbindet — bis dahin ist window.CoachMemory undefined und der catch
    // schluckt es.
    try { window.CoachMemory.dossierClear(localStorage, user.uid); } catch(_) {}
    try { await window.FB.deleteDoc(window.FB.userDocRef(user.uid)); } catch(e) { console.warn('[GymTrack] Doc-Delete:', e); }
    try { if (window.FB.stopPresence) window.FB.stopPresence(user.uid); } catch(e) {}
    // 2. Auth-User löschen
    await window.FB.deleteUser();
    // 3. Lokale Daten löschen + Neustart
    _pendingDelete = false;
    _finishAccountWipe(dossierDeleteFailed);
  } catch(e) {
    if (e && e.code === 'auth/requires-recent-login') {
      // Firebase verlangt frische Anmeldung → Re-Auth, danach automatisch löschen
      _pendingDelete = true;
      alert('Zur Sicherheit musst du dich noch einmal anmelden. Danach wird dein Konto automatisch gelöscht.');
      const pid = (user.providerData && user.providerData[0] && user.providerData[0].providerId) || '';
      try {
        if (pid === 'apple.com' && _isNative()) await doAppleSignIn();
        else await doGoogleSignIn();
      } catch(err) { console.warn('[GymTrack] Re-Auth:', err); }
    } else {
      console.error('[GymTrack] Konto-Löschung fehlgeschlagen:', e);
      alert('Löschen fehlgeschlagen:\n' + (e && e.code || '') + '\n' + (e && e.message || e));
      _pendingDelete = false;
    }
  }
}

function _finishAccountWipe(dossierDeleteFailed) {
  // Erst den entprellten Schreiber stoppen, sonst legt sein Timer den geloeschten
  // Stand zwischen removeItem und reload wieder an.
  try { _persistCancel(); } catch(_) {}
  try {
    localStorage.removeItem('ft4');
    Object.keys(localStorage).filter(k => k.indexOf('gt_') === 0).forEach(k => localStorage.removeItem(k));
  } catch(e) {}
  if (dossierDeleteFailed) {
    alert('Dein Konto und alle Daten wurden gelöscht. Ein einzelner Eintrag mit deinen Angaben beim KI-Coach (z. B. Einschränkungen) konnte dabei nicht entfernt werden und ist für niemanden mehr erreichbar. Melde dich über „Feedback senden" in den Einstellungen, falls du möchtest, dass wir ihn entfernen.');
  } else {
    alert('Dein Konto und alle Daten wurden gelöscht.');
  }
  location.reload();
}

function openAccountSheet() {
  renderAccountSheet();
  openOv('ov-account');
}

function renderAccountSheet() {
  const body = document.getElementById('account-body');
  if (!body) return;
  if (!window.FB || !window.FB.configured) {
    body.innerHTML = `
      <div class="gap"></div>
      <div style="text-align:center;padding:20px 8px">
        <div style="font-size:48px;margin-bottom:12px">⚙️</div>
        <div style="font-size:17px;font-weight:600;margin-bottom:6px">Noch nicht eingerichtet</div>
        <div style="color:var(--text2);font-size:14px;line-height:1.5">
          Damit du dich mit deinem Google-Konto anmelden kannst, muss zuerst<br>
          ein Firebase-Projekt eingerichtet werden.<br><br>
          Schau in die <b>CLAUDE.md</b> im Projektordner für die Anleitung.
        </div>
      </div>
    `;
    return;
  }
  if (_fbUser && !_fbUser.isAnonymous) {
    const u = _fbUser;
    const initials = (u.displayName || u.email || '?').split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase();
    const photo = u.photoURL
      ? `<img src="${u.photoURL}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid var(--acc)" alt="">`
      : `<div style="width:72px;height:72px;border-radius:50%;background:var(--acc);color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:600">${initials}</div>`;
    body.innerHTML = `
      <div class="gap"></div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:8px 0 20px">
        ${photo}
        <div style="text-align:center">
          <div style="font-size:18px;font-weight:600">${esc(u.displayName || 'Angemeldet')}</div>
          <div style="color:var(--text2);font-size:14px;margin-top:2px">${u.email || ''}</div>
        </div>
        <div style="background:var(--soft);color:var(--acc);padding:8px 14px;border-radius:20px;font-size:13px;font-weight:600">
          ☁️ Cloud-Sync aktiv
        </div>
      </div>
      <div style="color:var(--text2);font-size:13px;text-align:center;padding:0 16px 16px;line-height:1.5">
        Deine Daten werden automatisch in deinem Google-Konto gesichert.<br>
        Wenn du die App löschst, kannst du dich einfach wieder anmelden und alles ist da.
      </div>
      <button class="btn btn-gray" onclick="doSignOut()" style="margin-top:8px">Abmelden</button>
      <button onclick="doDeleteAccount()" style="width:100%;margin-top:14px;background:none;border:none;color:#ff453a;font-size:14px;font-weight:600;font-family:inherit;padding:10px;cursor:pointer">Konto löschen</button>
      <div style="color:var(--text2);font-size:12px;text-align:center;padding:2px 16px 0;line-height:1.45">Löscht dein Konto und alle Cloud-Daten unwiderruflich.</div>
    `;
  } else {
    const exCount  = (S.exercises||[]).length;
    const sesCount = (S.sessions||[]).length;
    const hasLocalData = exCount > 0 || sesCount > 0;
    const cnt = exCount + ' Übungen · ' + sesCount + ' Trainings';
    const syncHint = _isNative() && !hasLocalData
      ? `<div style="background:rgba(255,160,0,.12);border:1px solid rgba(255,160,0,.25);border-radius:14px;padding:12px 14px;margin-bottom:14px;font-size:13px;color:var(--text);line-height:1.5">
          ℹ️ <b>Daten aus der Browser-Version übertragen?</b><br>
          Öffne <b>gymtrack.app</b> im Browser, melde dich dort zuerst mit demselben Google-Konto an — dann werden deine Daten automatisch hier synchronisiert.
        </div>`
      : `<div style="background:var(--soft);border-radius:14px;padding:12px 14px;margin-bottom:14px;font-size:13px;color:var(--text)">
          💡 Deine aktuellen Daten (<b>${cnt}</b>) bleiben erhalten und werden automatisch übernommen.
        </div>`;
    body.innerHTML = `
      <div class="gap"></div>
      <div style="text-align:center;padding:8px 0 20px">
        <div style="font-size:48px;margin-bottom:10px">☁️</div>
        <div style="font-size:18px;font-weight:600;margin-bottom:6px">Daten in der Cloud sichern</div>
        <div style="color:var(--text2);font-size:14px;line-height:1.5;padding:0 12px">
          Melde dich mit deinem Google-Konto an, damit deine Trainings automatisch<br>
          in der Cloud gespeichert werden. So gehen sie nie verloren — auch wenn<br>
          du die App löschst oder das Handy wechselst.
        </div>
      </div>
      ${syncHint}
      <div id="gsi-btn-host" style="display:flex;justify-content:center;min-height:44px"></div>
      ${_isNative() ? `
      <div style="display:flex;justify-content:center;margin-top:10px">
        <button onclick="doAppleSignIn()" style="
          display:flex;align-items:center;gap:10px;
          background:#000;color:#fff;border:none;border-radius:22px;
          padding:12px 24px;font-size:16px;font-weight:600;font-family:inherit;
          cursor:pointer;min-width:280px;justify-content:center;letter-spacing:-.2px">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
          </svg>
          Mit Apple anmelden
        </button>
      </div>` : ''}
      <div style="text-align:center;margin-top:10px;font-size:12px;color:var(--text2)">
        Falls der Google-Button nicht erscheint:
        <button onclick="doGoogleSignIn()" style="background:none;border:none;color:var(--acc);text-decoration:underline;font-size:12px;padding:0;cursor:pointer">Alternative Methode</button>
      </div>
    `;
    // GIS-Button rendern (nach DOM-Update)
    setTimeout(_renderGisButton, 0);
  }
}

function updateAccountUI() {
  const ico   = document.getElementById('account-ico');
  const title = document.getElementById('account-title');
  const sub   = document.getElementById('account-sub');
  const dataSub = document.getElementById('data-sub');
  if (!title) return;
  if (!window.FB || !window.FB.configured) {
    if (ico) ico.textContent = '☁️';
    title.textContent = 'Cloud-Sync (noch nicht eingerichtet)';
    if (sub) sub.textContent = 'Anleitung in CLAUDE.md';
    if (dataSub) dataSub.textContent = 'Alles gespeichert auf deinem Gerät';
  } else if (_fbUser && !_fbUser.isAnonymous) {
    if (ico) ico.textContent = '✅';
    title.textContent = _fbUser.displayName || _fbUser.email || 'Angemeldet';
    if (sub) sub.textContent = 'Cloud-Sync aktiv – tippe für Details';
    if (dataSub) dataSub.textContent = 'Gespeichert auf deinem Gerät + in der Cloud';
  } else {
    if (ico) ico.textContent = '☁️';
    title.textContent = 'Mit Google anmelden';
    if (sub) sub.textContent = 'Sichere deine Daten in der Cloud';
    if (dataSub) dataSub.textContent = 'Alles gespeichert auf deinem Gerät';
  }
  // Wenn Sheet offen ist, auch dort neu rendern
  if (document.getElementById('ov-account')?.classList.contains('on')) {
    renderAccountSheet();
  }
  // Admin-Sichtbarkeit aktualisieren (UID kann sich geändert haben)
  if (typeof updateAdminUI === 'function') updateAdminUI();
  // Login/Logout kann das Google-Foto liefern/entfernen → Heute-Avatar mitziehen
  try { _renderHdrAva(); } catch(_){}
}

// Firebase initialisieren sobald geladen
function _initFirebaseListeners() {
  if (!window.FB || !window.FB.configured) {
    console.warn('[GymTrack] Firebase nicht konfiguriert');
    updateAccountUI();
    return;
  }
  console.log('[GymTrack] 🔥 Firebase init — warte auf Auth-State…');
  // Redirect-Result abholen (für PWA-Login via Redirect)
  window.FB.getRedirectResult()
    .then(res => {
      if (res && res.user) console.log('[GymTrack] ✅ Redirect-Login erfolgreich:', res.user.email);
      try { localStorage.removeItem('gt_pendingRedirect'); } catch(_){}
    })
    .catch(e => {
      // War wirklich ein Redirect-Login angestoßen? (Flag wird vor signInWithRedirect gesetzt)
      let pending = false;
      try { pending = localStorage.getItem('gt_pendingRedirect') === '1'; localStorage.removeItem('gt_pendingRedirect'); } catch(_){}
      // Beim passiven Startup-Check (kein ausstehender Redirect) wirft Firebase je nach
      // Plattform 'auth/no-auth-event' oder 'auth/argument-error' — das ist KEIN Fehler.
      if (!e?.code || e.code === 'auth/no-auth-event' || e.code === 'auth/argument-error') return;
      console.error('[GymTrack] ❌ Redirect-Result-Error:', e);
      // Nur melden, wenn der Nutzer den Redirect-Login wirklich gestartet hatte
      if (pending) alert('❌ Login (Redirect) fehlgeschlagen:\n' + (e?.code || '') + '\n' + (e?.message || e));
    });
  // Auth-State beobachten
  window.FB.onAuthStateChanged((user) => {
    // Konto-Wechsel-Erkennung fuer den Coach: ausgelagert nach
    // _coachHandleAuthUser (Review Fix 4), weil Apple/Google natives Sign-In
    // denselben Pfad braucht (onAuthStateChanged feuert in der WKWebView
    // nicht zuverlaessig) — s. Definition oben bei den Dossier-Funktionen.
    _coachHandleAuthUser(user);
    console.log('[GymTrack] Auth-State changed:', user ? (user.email || user.uid) : '(abgemeldet)');
    if (user) _onLogin(user);
    else      _onLogout();
  });

  // Anonyme Auth nach 3s Auto-Login (für Analytics auch ohne Google-Login)
  setTimeout(() => {
    if (!_fbUser && !_loginInProgress && window.FB?.signInAnonymously) {
      window.FB.signInAnonymously()
        .then(res => { if (res?.user) _onLogin(res.user); else { _authSettled = true; _refreshFriendsIfVisible(); _maybeAuthGate(); } })
        .catch(e => {
          console.warn('[GymTrack] Anonyme Auth nicht verfügbar (in Firebase Console aktivieren):', e?.code || e?.message);
          _authSettled = true; _refreshFriendsIfVisible(); _maybeAuthGate();   // Zustand steht fest → Login-Gate darf zeigen
        });
    } else if (!_loginInProgress) {
      _authSettled = true; _refreshFriendsIfVisible(); _maybeAuthGate();   // Auth bereits restauriert oder Anon nicht verfügbar
    }
  }, 3000);

  // Sicherheitsnetz: Falls weder onAuthStateChanged feuert noch die anonyme Anmeldung
  // je auflöst (z. B. Netz-Hänger in der WKWebView), darf der Freunde-Tab nicht ewig
  // auf „Verbinde…" stehen bleiben — nach spätestens 8s den Zustand als „fest" markieren.
  setTimeout(() => {
    if (!_authSettled) { _authSettled = true; _refreshFriendsIfVisible(); _maybeAuthGate(); }
  }, 8000);
}
if (window.FB !== undefined) {
  _initFirebaseListeners();
} else {
  window.addEventListener('fb-ready', _initFirebaseListeners, { once: true });
}

// Google Identity Services initialisieren (sobald geladen)
_initGoogleIdentity();

// ── BENACHRICHTIGUNGEN INITIALISIEREN ─────────────────
updateNotifUI();
updateSmartRestUI();
if (_isNative()) {
  scheduleWorkoutNotifications();
} else {
  navigator.serviceWorker?.ready.then(() => scheduleWorkoutNotifications());
}
// Proaktive Meldungen (Task 19): setzt vor allem den Rueckkehr-Anstoss neu —
// wer die App oeffnet, verschiebt ihn. Verzoegert, damit der Start nicht auf
// das Plugin wartet; ohne LocalNotifications kehrt _cnSync() sofort zurueck.
setTimeout(() => { try { _cnSync(); } catch(e) { console.warn('[Coach] Meldungen beim Start:', e); } }, 1200);
/* Wochenbericht (Task 21): liegt der Termin in den naechsten 36 Stunden, wird
   der Bericht jetzt erzeugt und die Meldung mit dem ersten Satz des fertigen
   Textes neu geplant. 2,5 s Verzoegerung, damit der Netzaufruf nicht im
   Startpfad haengt — und NACH _cnSync(1200), sonst plante der Sync gegen einen
   Bericht, den es in dem Moment noch nicht gibt. */
setTimeout(() => { try { _crMaybePrepare(); } catch(e) { console.warn('[Coach] Bericht beim Start:', e); } }, 2500);

// ── APPLE NATIVE FEATURES INITIALISIEREN ──────────────
if (_isNative()) {
  // Google OAuth Callback-Listener (appUrlOpen)
  _setupAppUrlListener();

  /* Getippte Coach-Meldung: nur der Wochenbericht fuehrt irgendwohin, alles
     andere oeffnet die App und laesst sie, wo sie war. _crBuild() holt den
     Bericht nach, falls die App im 36-Stunden-Fenster nie offen war — dann kam
     der Einladungstext, und der Bericht entsteht erst beim Antippen. Das ist der
     bewusst akzeptierte Rueckfall der Geraete-Variante.
     Der Hub oeffnet in JEDEM Fall: schlaegt die Erzeugung fehl (kein Netz,
     Woche ohne Training), steht dort die ehrliche Flaeche statt gar nichts. */
  try {
    const LN = _cap('LocalNotifications');
    if (LN && LN.addListener) {
      LN.addListener('localNotificationActionPerformed', (ev) => {
        try {
          const extra = (ev && ev.notification && ev.notification.extra) || {};
          if (extra.coachKind !== 'report') return;
          Promise.resolve(_crBuild()).catch(() => null).then(() => {
            try { openCoachHub('week'); } catch(e) { console.warn('[Coach] Hub aus Meldung:', e); }
          });
        } catch(e) { console.warn('[Coach] Meldung antippen:', e); }
      });
    }
  } catch(e) { console.warn('[Coach] Meldungs-Listener:', e); }

  // Im Home-Widget getätigte +1-Taps beim Start übernehmen
  setTimeout(_consumeWidgetDeltas, 800);

  // Widget beim Kaltstart immer aktualisieren — auch wenn keine Daten geändert
  // werden (persist() feuert sonst nie → Widget bliebe auf altem Stand).
  setTimeout(() => _updateWidgetData(), 1500);

  // HealthKit
  _initHealthKit();
  updateHealthKitUI();

  // Spotlight: Übungen beim Start indizieren
  setTimeout(_indexExercisesSpotlight, 2000);

  // Dynamic Island: Zombie-Activities aus vorheriger Session bereinigen
  // (kein aktives Training beim App-Start → alle laufenden Activities beenden)
  setTimeout(() => {
    if (!isWorkoutActive()) {
      const LA = _cap('LiveActivityPlugin');
      if (LA?.endAll) LA.endAll().catch(() => {});
    }
  }, 1000);

  // Spotlight-Deep-Link Handler (aus AppDelegate.swift → triggerJSEvent)
  window.addEventListener('spotlightOpen', (e) => {
    try {
      const data = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
      if (data?.exerciseId) {
        const ex = exById(data.exerciseId);
        if (ex) {
          goTab('uebungen', document.querySelectorAll('.tab')[1]);
          setTimeout(() => openDet(data.exerciseId), 300);
        }
      }
    } catch(_) {}
  });
}

// ── ZOOM DEAKTIVIEREN ──────────────────────────────────
document.addEventListener('gesturestart',  e => e.preventDefault(), {passive:false});
document.addEventListener('gesturechange', e => e.preventDefault(), {passive:false});
document.addEventListener('gestureend',    e => e.preventDefault(), {passive:false});
document.addEventListener('touchmove', e => {
  if (e.scale && e.scale !== 1) e.preventDefault();
}, {passive:false});
