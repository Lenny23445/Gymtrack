function _exIdxAll() {
  const key = (S.sessions ? S.sessions.length : 0) + '|' + (S.updatedAt || 0);
  if (_exIdx && _exIdxKey === key) return _exIdx;
  const idx = Object.create(null);
  (S.sessions || []).forEach(s => {
    const t = new Date(s.date).getTime();
    const seen = Object.create(null);
    (s.logs || []).forEach(l => {
      // Wie bisher s.logs.find(): pro Session zählt nur der ERSTE Log je Übung.
      if (!l || !l.exerciseId || seen[l.exerciseId]) return;
      seen[l.exerciseId] = 1;
      (idx[l.exerciseId] || (idx[l.exerciseId] = [])).push({ id: s.id, date: s.date, _t: t, sets: l.sets });
    });
  });
  for (const k in idx) idx[k].sort((a, b) => a._t - b._t);
  _exIdx = idx; _exIdxKey = key;
  return _exIdx;
}
// Rückgabe ist der gecachte Array — Aufrufer lesen nur (geprüft). Wer die Liste
// umbauen will, muss vorher kopieren (slice), sonst kippt der Cache.
function exHistory(exId) {
  return _exIdxAll()[exId] || [];
}

function maxW(sets) {
  const vals = sets.map(s => parseFloat(s.w)||0).filter(v=>v>0);
  return vals.length ? Math.max(...vals) : 0;
}

// HTML-Escaping für alle frei eingegebenen Texte (Übungsnamen, Plan-/Split-
// Namen, Tracker-Labels, Notizen). Ohne das kann ein Name wie
// `<img src=x onerror=…>` beim innerHTML-Rendern Code ausführen (Stored XSS —
// besonders kritisch, weil Daten per Cloud-Sync zwischen Geräten wandern).
// Function-Declaration → gehoistet, in allen Render-Funktionen verfügbar.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── WIEDERHOLUNGSBEREICH & SATZSCHEMA (Double Progression) ──
const WEIGHT_SCHEMES = ['straight','ascending','pyramid','reverse'];
const SCHEME_SHORT = { straight:'Gleich', ascending:'Aufsteigend', pyramid:'Pyramide', reverse:'Umgekehrt' };
const SCHEME_DESC = {
  straight:'Alle Arbeitssätze mit demselben Gewicht (Straight Sets).',
  ascending:'Jeder Satz etwas schwerer — der letzte Satz ist der schwerste.',
  pyramid:'Erst schwerer werden bis zur Mitte, danach wieder leichter.',
  reverse:'Schwerster Satz zuerst, danach von Satz zu Satz leichter (Reverse Pyramid).'
};
const DROP_PCT   = 0.70;       // Drop-Satz = 70 % seines Schema-Gewichts

function repRange(ex){
  if(!ex) return { min:8, max:12 };
  const max = ex.repMax != null ? ex.repMax : (ex.targetReps || 10);
  const min = ex.repMin != null ? ex.repMin : max;
  return { min: Math.min(min,max), max: Math.max(min,max) };
}
function repGoalStr(ex){
  if(ex.targetType === 'time') return fmtSec(ex.targetReps);
  const {min,max} = repRange(ex);
  return min===max ? `${max} Wdh` : `${min}–${max} Wdh`;
}
function repGoalShort(ex){
  if(ex.targetType === 'time') return fmtSec(ex.targetReps);
  const {min,max} = repRange(ex);
  return min===max ? `${max}` : `${min}–${max}`;
}
function roundToStep(w){
  if(!isFinite(w) || w<=0) return 0;
  const step = 1.25;
  return Math.round(w/step)*step;
}
// Schema-Multiplikator bezogen auf das schwerste Arbeitsgewicht (=1.0)
function schemeMult(scheme, i, n){
  if(n<=1) return 1;
  switch(scheme){
    case 'ascending': return 1 - (n-1-i)*0.05;            // letzter Satz = schwerster
    case 'reverse':   return 1 - i*0.05;                  // erster Satz = schwerster
    case 'pyramid': { const mid=(n-1)/2; return 1 - Math.abs(i-mid)*0.05; }
    default:          return 1;                           // straight
  }
}

// Plant die Sätze fürs nächste Training: übernimmt die Satz-Typen aus der
// letzten Einheit und berechnet pro Satz das Gewicht (Schema + Aufwärm-%).
// Bringt die Satz-Typen der letzten Einheit auf eine neue Ziel-Satzzahl:
// auffüllen immer mit Arbeitssätzen, kürzen bevorzugt bei Arbeitssätzen —
// Aufwärmsätze bleiben stehen, solange es noch Arbeitssätze zu streichen gibt.
function fitSetTypes(types, n){
  const out = types.slice();
  n = Math.max(1, Math.min(12, parseInt(n) || out.length));
  while (out.length < n) out.push('normal');
  while (out.length > n) {
    let i = out.length - 1;
    while (i > 0 && out[i] === 'warmup') i--;
    out.splice(i, 1);
  }
  return out;
}

function buildPlannedSets(ex){
  const isTime = ex.targetType === 'time';
  const prev   = lastSessionSetsFor(ex.id);
  let types = (prev && prev.length)
    ? prev.map(s => s.type || 'normal')
    : Array.from({length: ex.targetSets || 3}, () => 'normal');
  if(!types.length) types = ['normal'];
  // Die Planung kopiert bewusst die Satz-Struktur der letzten Einheit (Aufwärmsätze
  // bleiben so erhalten). Dadurch kam eine GEÄNDERTE Ziel-Satzzahl aber nie im
  // Training an — weder aus einer übernommenen KI-Empfehlung noch aus einer
  // manuellen Änderung. targetSetsAt merkt sich, wann das Ziel zuletzt geändert
  // wurde: liegt das NACH der letzten Einheit, gewinnt das Ziel über die Kopie.
  const changedAt = ex.targetSetsAt || 0;
  if (changedAt) {
    const hist = exHistory(ex.id);
    const lastAt = hist.length ? new Date(hist[hist.length-1].date).getTime() : 0;
    if (changedAt > lastAt) types = fitSetTypes(types, ex.targetSets);
  }

  const baseW  = getSuggestedWeight(ex);     // schwerstes Arbeitsgewicht (oder null)
  const sugR   = String(getSuggestedReps(ex));
  const scheme = ex.weightScheme || 'straight';

  // Positionen der Arbeitssätze (ohne Aufwärmen) für die Schema-Verteilung
  const workIdx = [];
  types.forEach((t,i) => { if(t !== 'warmup') workIdx.push(i); });
  const nW = workIdx.length || 1;

  return types.map((t,i) => {
    let w = '';
    if(t === 'warmup'){
      // Aufwärmgewicht frei wählbar – nicht mehr automatisch berechnen,
      // nur das zuletzt genutzte Aufwärmgewicht als Startwert vorbelegen.
      if(prev && prev[i] && prev[i].w) w = String(prev[i].w);
    } else if(baseW != null){
      const pos  = Math.max(0, workIdx.indexOf(i));
      let mult   = schemeMult(scheme, pos, nW);
      if(t === 'drop') mult *= DROP_PCT;
      // Voll-Gewicht-Satz (mult===1): baseW ist bereits das echte Arbeitsgewicht
      // vom Vorschlag – NICHT aufs 1,25er-Raster runden, sonst würde z. B. 93 kg
      // (per 0,25er-Wheel eingetragen) grundlos auf 92,5 verschoben. Nur die
      // skalierten Sätze (Schema < 1 / Drop) aufs Hantelraster snappen.
      w = String(mult === 1 ? baseW : roundToStep(baseW * mult));
    } else if(prev && prev[i] && prev[i].w){
      w = String(prev[i].w);
    }
    if(isTime) return { w, tElapsed:0, tRunning:false, tStart:null, type: t };
    // Wdh nur vorbelegen, wenn es Kontext gibt (Gewicht für diesen Satz ODER
    // frühere Wdh-Daten dieser Übung). Sonst bleibt ein frischer Satz KOMPLETT
    // leer — sonst sah er fertig aus (Wdh gefüllt, Gewicht leer) und wurde blind
    // abgehakt → Einheit ohne Gewicht gespeichert (keine Statistik, keine PR).
    const hasPrevReps = !!(prev && prev[i] && (prev[i].r || prev[i].r === 0) && String(prev[i].r) !== '');
    const r = (t === 'warmup') ? '' : ((w !== '' || hasPrevReps) ? sugR : '');
    return { w, r, type: t };
  });
}

// Einmalige Migration: feste Wdh-Zahl → sinnvoller Bereich + Standard-Schema
function migrateExercises(){
  let changed = false;
  (S.exercises || []).forEach(ex => {
    if(_healExMuscleGroup(ex)) changed = true;   // Muskelgruppe für Erholung sicherstellen (auch Zeit-Übungen)
    if(ex.targetType === 'time') return;     // Zeit-Übungen: kein Bereich/Schema
    if(ex.repMax == null || ex.repMin == null){
      const base = ex.targetReps || 10;
      ex.repMax = base + 2;
      ex.repMin = Math.max(1, base - 2);
      ex.targetReps = ex.repMax;             // Ziel = oberes Bereich-Ende (Kompatibilität)
      changed = true;
    }
    if(!ex.weightScheme){ ex.weightScheme = 'straight'; changed = true; }
  });
  if(changed) persist();
}

// ── LIVE-PR IM EINGABE-FENSTER ──────────────────────────────
// Beste je gespeicherten Werte einer Übung (für sofortige PR-Erkennung).
let _livePR = {};   // exId → { maxW, max1RM, repsAt } (Session-Lauf)
function exBestStats(exId){
  let maxW = 0, max1RM = 0; const repsAt = {};
  for(const ps of (S.sessions || [])){
    for(const pl of (ps.logs || [])){
      if(pl.exerciseId !== exId) continue;
      for(const s of (pl.sets || [])){
        const w = parseFloat(s.w)||0, r = parseInt(s.r)||0;
        if(!w || !r) continue;
        if(w > maxW) maxW = w;
        const o = w*(1+r/30); if(o > max1RM) max1RM = o;
        const k = Math.round(w*4)/4; if(!repsAt[k] || r > repsAt[k]) repsAt[k] = r;
      }
    }
  }
  return { maxW, max1RM, repsAt };
}
// Prüft den gerade eingetragenen Satz gegen die Historie und feiert PRs sofort.
function checkLiveSetPR(li, si){
  const log = wkLogs[li]; if(!log) return;
  const ex  = exById(log.exerciseId); if(!ex || ex.targetType === 'time') return;
  const s   = log.sets[si]; if(!s) return;
  const w = parseFloat(s.w)||0, r = parseInt(s.r)||0;
  if(!w || !r) return;
  const best = exBestStats(ex.id);
  const seen = _livePR[ex.id] || (_livePR[ex.id] = { maxW:best.maxW, max1RM:best.max1RM, repsAt:{...best.repsAt} });
  const o = w*(1+r/30);
  const k = Math.round(w*4)/4;
  // PR-Typ nach Priorität bestimmen (gegen die bisher gesehenen Bestwerte)
  let pr = null;
  if(best.maxW > 0 && w > seen.maxW){
    pr = { label:'Neues Max-Gewicht', val: kgToDisp(w)+' '+unitLabel() };
  } else if(best.max1RM > 0 && o > seen.max1RM + 0.5){
    pr = { label:'Neues 1RM (geschätzt)', val: (Math.round(o*10)/10)+' '+unitLabel() };
  } else {
    const prev = seen.repsAt[k] || 0;
    if(prev > 0 && r > prev){
      pr = { label:'Reps-Bestleistung bei '+kgToDisp(w)+' '+unitLabel(), val: r+' Wdh' };
    }
  }
  // Schwellen immer hochziehen → derselbe Satz feiert nur einmal (kein Kaskaden-PR)
  seen.maxW       = Math.max(seen.maxW, w);
  seen.max1RM     = Math.max(seen.max1RM, o);
  seen.repsAt[k]  = Math.max(seen.repsAt[k] || 0, r);
  if(pr){ s.pr = true; celebrateLivePR(pr); }
}
function celebrateLivePR(pr){
  try { haptic([25,50,25]); } catch(_){}
  try { fireConfetti(40); } catch(_){}
  let host = document.getElementById('pr-burst-host');
  if(!host){
    host = document.createElement('div');
    host.id = 'pr-burst-host';
    host.className = 'pr-burst-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = 'pr-burst';
  el.innerHTML = '<div>PR!</div><div class="pr-burst-sub">' + pr.label + ': <b>' + pr.val + '</b></div>';
  host.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

// ── NAVIGATION ────────────────────────────────────────
function isWorkoutActive() {
  const step2 = document.getElementById('wk-step2');
  return !!(timerInt && wkLogs && wkLogs.length && step2 && step2.style.display !== 'none');
}
function updateWkMiniVisibility() {
  const mini = document.getElementById('wk-mini');
  if (!mini) return;
  const ovOpen = document.getElementById('ov-wk')?.classList.contains('on');
  // Auch verstecken, wenn ein Trainings-Untersheet (Statistik/Übung tauschen/…) offen ist:
  // das Banner liegt fix bei z-index 1050 und würde sonst den ✕/Kopf des Sheets überdecken
  // → Sheet ließe sich nicht schließen (lag „hinter" dem Trainings-Banner).
  const subOpen = (typeof WK_SUB_SHEETS !== 'undefined') &&
    WK_SUB_SHEETS.some(id => document.getElementById(id)?.classList.contains('on'));
  const show = isWorkoutActive() && !ovOpen && !subOpen;
  mini.classList.toggle('on', show);
  document.body.classList.toggle('wk-active', show);
  if (show) {
    // Tatsächliche Banner-Unterkante messen → genau so viel Platz freihalten
    requestAnimationFrame(() => {
      const r = mini.getBoundingClientRect();
      document.body.style.setProperty('--wk-clear', Math.round(r.bottom + 8) + 'px');
    });
  } else {
    document.body.style.removeProperty('--wk-clear');
  }
}
function resumeWorkout() {
  haptic(8);
  openOv('ov-wk');
  updateWkMiniVisibility();
}
function goTab(id, btn) {
  // Close all open overlays before switching tabs
  _suppressWkRestore = true;   // Workout-Sheet beim Tab-Wechsel NICHT wieder aufpoppen lassen
  document.querySelectorAll('.ov.on').forEach(ov => {
    if (ov.id === 'ov-icons') closeIconPicker();
    else closeOv(ov.id);
  });
  _suppressWkRestore = false;
  updateWkMiniVisibility();
  // Remove active page (force reflow so animation re-triggers)
  document.querySelectorAll('.pg').forEach(p => {
    p.classList.remove('on');
  });
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));

  // Trigger animation: remove then re-add .on so keyframe restarts
  const pg = document.getElementById('pg-' + id);
  pg.style.animation = 'none';
  pg.offsetHeight; // reflow
  pg.style.animation = '';
  pg.classList.add('on');

  btn.classList.add('on');
  moveTabIndicator(btn);

  if (id === 'heute')     renderHome();
  if (id === 'uebungen')  renderExList();
  if (id === 'stats')     renderStats();
  if (id === 'freunde') { _socZone = 'community'; renderFriendsTab(); }   // Standard: Community-Feed
  if (id === 'erfolge')   renderErfolge();
  if (id === 'settings')  renderSettings();
  if (id !== 'freunde')   _frStopLive();   // Live-Listener nur solange Freunde-Tab offen
}

// ── ERFOLGE ↔ EINSTELLUNGEN (Sub-Page-Navigation, Tab bleibt "Erfolge") ──
function openSettingsPage() {
  haptic(6);
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
  const pg = document.getElementById('pg-settings');
  pg.style.animation = 'none'; pg.offsetHeight; pg.style.animation = '';
  pg.classList.add('on');
  document.querySelector('.app')?.scrollTo({top:0});
  window.scrollTo(0,0);
  renderSettings();
}
function closeSettingsPage() {
  haptic(6);
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
  const pg = document.getElementById('pg-erfolge');
  pg.style.animation = 'none'; pg.offsetHeight; pg.style.animation = '';
  pg.classList.add('on');
  window.scrollTo(0,0);
  renderErfolge();
}

// Zuletzt FESTGESCHRIEBENE Blob-Geometrie (Ziel, nicht Live-Rect!). Wird als
// „von" für die Stretch-Animation genutzt. Live-Rect lesen war der Bug: mitten
// in der Feder-Animation ist die Rect gedehnt → schnelles Tippen kompoundierte
// den Stretch, Bubble driftete/wurde überbreit statt zentriert.
let _indX = null, _indW = null;
// Sauberes Gleiten statt Liquid-Blob: eine ruhige Ease-Kurve ohne Overshoot/Squish.
// Der alte Stretch-dann-Einrasten-Trick sah bei schnellem Tippen „komisch" aus
// (Bubble driftete/überschoss). Jetzt: Position + Breite direkt zum Ziel animieren.
const _IND_SPRING = 'transform .40s cubic-bezier(.32,.72,0,1), width .40s cubic-bezier(.32,.72,0,1)';
function moveTabIndicator(activeTab) {
  const bar = document.querySelector('.tabbar');
  const ind = document.getElementById('tab-indicator');
  if (!ind || !bar || !activeTab) return;

  const barRect = bar.getBoundingClientRect();
  const tabRect = activeTab.getBoundingClientRect();
  if (!tabRect.width) return;                       // Layout noch nicht bereit
  // Pill exakt mittig auf dem Tab: Indikator liegt absolut in der Padding-Box der
  // Tab-Leiste (Ursprung = barRect.left + Border-Breite). CSS `left:6px` ist bereits
  // die Grundposition, translateX(newX) verschiebt relativ dazu. Border-Breite live
  // aus clientLeft statt fester Konstante → kein 1px-Versatz. Auf ganze Pixel runden,
  // damit die halbtransparente Pille scharf (nicht sub-pixel-verwaschen) sitzt.
  const padLeft = barRect.left + bar.clientLeft;
  const newX    = Math.round(tabRect.left - padLeft - 6);
  const newW    = Math.round(tabRect.width);

  // Erste Platzierung: ohne Animation setzen und festschreiben.
  if (_indX == null) {
    ind.style.transition = 'none';
    ind.style.width      = newW + 'px';
    ind.style.transform  = `translateX(${newX}px)`;
    ind.offsetHeight;                               // Reflow → Startzustand fixieren
    _indX = newX; _indW = newW;
    return;
  }

  // Direkt und ruhig zum Ziel gleiten (kein Stretch, kein scaleY, kein Overshoot).
  ind.style.transition = _IND_SPRING;
  ind.style.width      = `${newW}px`;
  ind.style.transform  = `translateX(${newX}px)`;

  _indX = newX; _indW = newW;                       // Ziel festschreiben (nicht Live-Rect!)
}

function initTabIndicator() {
  requestAnimationFrame(() => {
    const active = document.querySelector('.tab.on');
    if (active) moveTabIndicator(active);
  });
}
// Sheets, die im aktiven Training das Workout-Sheet ERSETZEN statt darüber zu
// stapeln (kein "Fenster in Fenster"). Beim Schließen kommt das Workout zurück.
const WK_SUB_SHEETS = ['ov-ex-swap','ov-ex-edit','ov-mid-add','ov-det','ov-mg-stat','ov-prog-info','ov-ex','ov-sess-detail'];
let _wkHiddenBySub   = false; // ov-wk wurde von einem Untersheet verdrängt
let _suppressWkRestore = false; // z. B. beim Tab-Wechsel: alles zu, nichts wiederherstellen
// Statistik-Drilldown (Gruppe → Übung → Einheit): X/Swipe geht einen Schritt
// zurück statt alles zu schließen. Stack hält die Rücksprungziele ('mg'|'det').
let _statNavStack  = [];
let _statNavSilent = false; // programmatischer closeOv → nicht zurücknavigieren
// Sheets, die bewusst ÜBER dem aktiven Training liegen dürfen (Picker) —
// alles andere verdrängt ov-wk, statt sich überlappend drüberzulegen.
const OV_STACK_EXEMPT = ['ov-wk','ov-wheel','ov-settype'];
function openOv(id)  {
  if (!OV_STACK_EXEMPT.includes(id)) {
    const wk = document.getElementById('ov-wk');
    if (wk && wk.classList.contains('on')) { wk.classList.remove('on'); _wkHiddenBySub = true; }
  }
  document.getElementById(id).classList.add('on');
  if (id === 'ov-wk') _wkHiddenBySub = false;
  updateWkMiniVisibility();
  try { _aibSyncVisibility(); } catch(_){}
}
function closeOv(id) {
  document.getElementById(id).classList.remove('on');
  if (id === 'ov-widget-add') document.body.classList.remove('wpick-open');
  /* Coach-Hub: die Diagramme der Wochenkachel abräumen. EINZIGER Anlaufpunkt
     für ALLE Schließwege (✕, Hintergrund-Tipp, Swipe-Dismiss, Sprung in den
     Chat). Chart.js hält seine Instanzen an der Zeichenfläche; ohne destroy()
     wächst der Speicher bei jedem Öffnen des Blattes. */
  if (id === 'ov-coach-hub') {
    try { if (typeof _chWeekDestroy === 'function') _chWeekDestroy(); }
    catch(e) { console.warn('[Coach] Hub schließen:', e); }
  }
  // Coach-Einrichtung (Task 10): JEDER Schließweg legt ein Profil fest. Das ✕
  // geht über coachSetupDone(true), das Swipe-Dismiss (initSheetSwipe) ruft
  // closeOv direkt — ohne dieses Netz bliebe preset offen und der Hub fragte
  // beim nächsten Öffnen wieder. Beide Wege sind idempotent: ein bereits
  // gesetztes Profil rührt _csSettlePreset() nicht an.
  if (id === 'ov-coach-setup') {
    try { if (typeof _csSettlePreset === 'function') _csSettlePreset(); }
    catch(e) { console.warn('[Coach] Einrichtung schließen:', e); }
  }
  // Post-Workout-Check-in (Phase E): einziger Anlaufpunkt für ALLE Schließwege
  // (Fertig/Überspringen rufen closeOv direkt, Backdrop-Klick + Swipe-Dismiss tun es
  // ebenfalls). Wächter _checkinContinued garantiert genau EINEN Lauf der finishWk-
  // Tail-Kette (_finishWkContinue), egal welcher Pfad das Sheet schließt.
  if (id === 'ov-checkin' && !_checkinContinued) {
    _checkinContinued = true;
    const sess = _checkinSess, dayName = _checkinDayName;
    _checkinSess = null; _checkinDayName = null;
    try { _finishWkContinue(sess, dayName); } catch(e) { console.warn('[GymTrack] _finishWkContinue:', e); }
  }
  // Statistik-Drilldown: einen Schritt zurück (Einheit → Übung → Gruppe)
  if ((id === 'ov-det' || id === 'ov-sess-detail') && _statNavStack.length && !_statNavSilent) {
    if (_suppressWkRestore) {
      _statNavStack = []; // Tab-Wechsel: Kette verwerfen, nichts wieder öffnen
    } else {
      const back = _statNavStack.pop();
      if (back === 'det' && id === 'ov-sess-detail' && typeof detId !== 'undefined' && detId) {
        setTimeout(() => openDet(detId), 120);
      } else if (back === 'mg' && id === 'ov-det' && typeof mgStatId !== 'undefined' && mgStatId) {
        setTimeout(() => openGroupStat(mgStatId), 120);
      } else {
        _statNavStack = []; // unerwartete Reihenfolge → Kette abbrechen
      }
    }
  }
  // Workout-Sheet wiederherstellen, wenn das letzte verdrängende Sheet zugeht
  if (id === 'ov-ai-scan') { try { _scnStopCam(); _scnStopAnim(); } catch(_){} }   // Kamera/Animation nie weiterlaufen lassen
  if (!OV_STACK_EXEMPT.includes(id) && _wkHiddenBySub && !_suppressWkRestore
      && !(typeof _midAddPending  !== 'undefined' && _midAddPending)
      && !(typeof _swapAddPending !== 'undefined' && _swapAddPending)
      && !document.querySelector('.ov.on:not(#ov-wk)')
      && typeof isWorkoutActive === 'function' && isWorkoutActive()) {
    _wkHiddenBySub = false;
    document.getElementById('ov-wk')?.classList.add('on');
  }
  updateWkMiniVisibility();
  try { _aibSyncVisibility(); } catch(_){}
}
// Backdrop-Tipp schließt das Overlay — für JEDES .ov, unabhängig vom inline
// onclick im Markup. Genau eine Ausnahme: die Coach-Einrichtung (Task 10). Dort
// darf ein versehentlicher Tipp daneben nicht abbrechen; das ✕ überspringt
// bewusst und sichtbar. Das fehlende onclick im Markup allein reicht dafür
// nicht, dieser Sammel-Zuhörer hätte es überstimmt.
document.querySelectorAll('.ov').forEach(o => {
  if (o.id === 'ov-coach-setup') return;
  o.addEventListener('click', e => {
    if (e.target===o) { if (o.id==='ov-icons') closeIconPicker(); else closeOv(o.id); }
  });
});

// ── THEME ─────────────────────────────────────────────
function setTheme(t) {
  S.theme = t;
  persist();
  document.documentElement.setAttribute('data-theme', t);
  ['light','rosa','dark','blau','grün'].forEach(n =>
    document.getElementById('chk-'+n).style.visibility = n===t ? 'visible' : 'hidden'
  );
}
function setGlass(on) {
  S.glass = on;
  persist();
  document.documentElement.dataset.glass = on ? 'on' : 'off';
  const el = document.getElementById('glass-toggle');
  if (el) el.checked = on;
}

// ── HOME ──────────────────────────────────────────────
/* ════════════════════════════════════════════════════════════════
   ANPASSBARER „HEUTE"-BILDSCHIRM  (iOS-Kontrollzentrum-Style)
   Long-Press → Bearbeiten · Drag & Drop · Größe · Widget-Picker
   Layout in S.heuteLayout = [{type, size:'lg'|'sm'}, …]
   ════════════════════════════════════════════════════════════════ */
const DEFAULT_HEUTE_LAYOUT = [
  /* Reihenfolge nach dem, was beim Aufschlagen zaehlt: erst die Woche als
     Ueberblick, dann die beiden Quadrate, dann der Knopf ueber die volle
     Breite. Auf einer Startseite ohne Eintraege haelt diese Folge die Flaeche
     zusammen — vorher stand oben die Coach-Kachel, die ohne Abo leer bleibt
     und ein Loch hinterliess (siehe renderHeuteGrid: leere Kacheln fallen aus
     dem Raster). */
  {type:'weekcal', size:'lg'},   // Wochenuebersicht Mo–So
  {type:'streak',  size:'sm'},   // links
  {type:'recovery',size:'sm'},   // rechts daneben
  {type:'train',   size:'lg'},   // lange Leiste ueber beide Spalten (lgRows:1)
  {type:'woche',   size:'lg'},   // Wochenziele
  /* Der Coach steht bewusst NICHT mehr ganz oben: fuer Abonnenten bleibt er
     sichtbar, ohne Abo faellt seine Kachel hier heraus, ohne dass die obere
     Haelfte der Seite darunter leidet. */
  {type:'coach',   size:'lg'},
  {type:'weight',  size:'md'},
  {type:'volume',  size:'md'},
  {type:'history', size:'lg'},
];

/* Größen-Reihenfolge: sm (quadratisch) < md (kleine rechteckig) < lg (groß).
   Jedes Widget unterstützt alle drei Formen; sizes ist aufsteigend sortiert. */
const HW_RANK = {sm:0, md:1, lg:2};
const WIDGET_DEFS = {
  /* 'weekcal' steht bewusst NICHT in DEFAULT_HEUTE_LAYOUT — dieselbe Uebersicht
     liegt schon im Statistik-Tab, standardmaessig waere das doppelt. Waehlbar ist
     es aber wieder: wer die Woche auf dem Heute-Tab sehen will, holt es sich im
     Bearbeiten-Modus dazu. */
  weekcal: {title:'Diese Woche',     icon:'📅', label:'Diese Woche',      desc:'Wochenübersicht Mo–So',       sizes:['sm','md','lg'], lgRows:2, build:hwWeekcal},
  woche:   {title:'Wochenziele',     icon:'🎯', label:'Wochenziele',      desc:'Wochen-Tracker-Ringe',        sizes:['sm','md','lg'], lgRows:()=>((S.trackerItems||[]).length>2?2:1), build:()=>`<div class="tracker-row" id="tracker-row"></div>`, fill:(...a)=>renderTrackers(...a)},
  weight:  {title:'Körpergewicht',   icon:'⚖️', label:'Körpergewicht',    desc:'Gewicht & Verlauf',           sizes:['sm','md','lg'], lgRows:3, build:()=>`<div class="card" id="weight-card"></div>`, fill:(...a)=>renderWeightCard(...a)},
  history: {title:'Letzte Trainings',icon:'🏋️', label:'Letzte Trainings', desc:'Deine letzten Einheiten',     sizes:['lg'],           lgRows:3, build:()=>`<div class="card" id="history-card"></div>`, fill:renderCompactHistory},
  train:   {title:'',                icon:'▶️', label:'Training starten',  desc:'Schnellstart-Button',         sizes:['sm','md','lg'], lgRows:1, build:(size)=>`<button class="btn btn-acc heute-train-btn" onclick="openWorkout()">▶&nbsp; ${size==='sm'?'Start':'Training starten'}</button>`},
  streak:  {title:'Streak',          icon:'🔥', label:'Streak',            desc:'Wochen in Folge',             sizes:['sm','md','lg'], lgRows:2, build:hwStreak},
  volume:  {title:'Volumen',         icon:'📊', label:'Volumen',           desc:'Gesamt-Volumen & Trend',      sizes:['sm','md','lg'], lgRows:2, build:hwVolume},
  recovery:{title:'Erholung',        icon:'🔋', label:'Erholung',          desc:'Muskel-Erholung',             sizes:['sm','md','lg'], lgRows:3, build:hwRecovery},
  heatmap: {title:'Aktivität',       icon:'🟩', label:'Aktivität',         desc:'Trainings-Heatmap',           sizes:['sm','md','lg'], lgRows:2, build:hwHeatmap},
  muscles: {title:'Muskelgruppen',   icon:'💪', label:'Muskelgruppen',     desc:'Volumen-Verteilung',          sizes:['sm','md','lg'], lgRows:3, build:hwMuscles},
  onerm:   {title:'1RM-Bestwerte',   icon:'📈', label:'1RM-Bestwerte',     desc:'Top-Übungen (Epley)',         sizes:['sm','md','lg'], lgRows:3, build:hwOneRM},
  qadd:    {title:'',                icon:'➕', label:'Übung hinzufügen',  desc:'Schnellzugriff',              sizes:['sm','md','lg'], lgRows:1, build:(size)=>hwQuick('','Übung','openNewEx(null)',size)},
  qweight: {title:'',                icon:'⚖️', label:'Gewicht eintragen', desc:'Schnellzugriff',              sizes:['sm','md','lg'], lgRows:1, build:(size)=>hwQuick('','Gewicht','openWeightEntry()',size)},
  plans:   {title:'Deine Trainingspläne', icon:'', label:'Trainingspläne', desc:'Pläne mit einem Tipp starten', sizes:['sm','md','lg'], lgRows:2, build:hwPlans},
  social:  {title:'Rangliste',       icon:'', label:'Rangliste',        desc:'Wochen-Vergleich mit Freunden', sizes:['sm','md','lg'], lgRows:2, build:(...a)=>hwSocial(...a)},
  // Der Coach steht im Raster wie jedes andere Widget — kein Sonderplatz mehr
  // ueber dem Raster. Sein Inhalt richtet sich nach der Groesse (s. _aicSize).
  coach:   {title:'',                icon:'', label:'KI-Coach',         desc:'Tagesempfehlung & Coach-Menü', sizes:['sm','md','lg'], lgRows:2, build:()=>`<div id="coach-today-card"></div>`, fill:renderCoachTodayCard},
};
const WIDGET_PICK_ORDER = ['woche','weekcal','weight','history','train','plans','social','streak','volume','recovery','muscles','onerm','qadd','qweight'];

let heuteEditMode = false;

function getHeuteLayout(){
  if (Array.isArray(S.heuteLayout) && S.heuteLayout.length)
    return S.heuteLayout.filter(w => w && WIDGET_DEFS[w.type]);
  /* Standardraster: fuer Abonnenten steht der Coach GANZ OBEN — er ist der
     sichtbare Gegenwert des Abos und soll nicht unter fuenf anderen Kacheln
     liegen. Damit landet er an derselben Stelle wie bei Nutzern mit eigenem
     Raster (_migCoachWidget schiebt ihn dort per unshift nach vorn) — vorher
     hing die Position davon ab, ob jemand das Raster je angefasst hatte.
     Ohne Abo bleibt die Reihenfolge unveraendert: die Coach-Kachel ist dann
     leer und faellt per .hw-leer aus dem Raster — oben wuerde sie nur die
     Luecke hinterlassen, wegen der sie urspruenglich nach unten gewandert ist.
     isPremium() steht in einer spaeteren Datei — der Aufruf hier ist ok, weil
     er erst zur Laufzeit passiert; try/catch, damit ein Fehler dort nie das
     komplette Heute-Raster mitreisst. */
  const def = DEFAULT_HEUTE_LAYOUT.map(w => ({...w}));
  try {
    if (isPremium()) {
      const i = def.findIndex(w => w.type === 'coach');
      if (i > 0) def.unshift(def.splice(i, 1)[0]);
    }
  } catch(_){}
  return def;
}
/* Einmalige Nachruestung: wer schon ein eigenes Raster gespeichert hat, kennt
   das Coach-Widget nicht — die Karte stand frueher FEST ueber dem Raster. Ohne
   diesen Schritt waere der Coach nach dem Update einfach weg.
   Der Merker ist Pflicht: wer das Widget bewusst entfernt, darf es nicht bei
   jedem Start zurueckbekommen. */
function _migCoachWidget(){
  try {
    if (S.heuteCoachMig) return;
    S.heuteCoachMig = 1;
    if (Array.isArray(S.heuteLayout) && S.heuteLayout.length
        && !S.heuteLayout.some(w => w && w.type === 'coach')) {
      S.heuteLayout.unshift({ type:'coach', size:'lg' });
    }
    persist();
  } catch(e) { console.warn('[Heute] Coach-Widget nachruesten:', e); }
}
function _heuteLayout(){
  if (!Array.isArray(S.heuteLayout)) S.heuteLayout = getHeuteLayout();
  return S.heuteLayout;
}

function renderHeuteGrid(){
  const grid = document.getElementById('heute-grid');
  if (!grid) return;
  _migCoachWidget();
  const layout = getHeuteLayout();
  if (!layout.length){
    grid.innerHTML = `<div class="heute-grid-empty">Keine Widgets.<br>Lange auf die Seite drücken oder ＋ tippen, um welche hinzuzufügen.</div>`;
  } else {
    // Lineare Ausgabe — das CSS-Grid übernimmt Form & dichte Packung
    grid.innerHTML = layout.map((w, i) => {
      const def  = WIDGET_DEFS[w.type];
      const size = def.sizes.includes(w.size) ? w.size : def.sizes[0];
      const canResize = def.sizes.length > 1;
      // lg darf je nach Inhalt mehrere Rastereinheiten hoch sein
      /* lgRows darf auch eine Funktion sein: die Wochenziele brauchen zwei
         Rasterzeilen, sobald Ringe da sind, und nur eine, solange dort bloss
         der Plus-Knopf steht — sonst haengt unter dem Knopf eine halbe leere
         Kachel. */
      const rows = typeof def.lgRows === 'function' ? (def.lgRows() || 1) : (def.lgRows || 2);
      const spanStyle = size === 'lg' ? ` style="grid-row:span ${rows}"` : '';
      const titleHtml = (size === 'lg' && def.title) ? `<div class="hw-title">${def.title}</div>` : '';
      return `<div class="hw hw-${size}" data-type="${w.type}" data-size="${size}" data-idx="${i}"${spanStyle}>
        <div class="hw-badge hw-remove" onclick="removeWidget(${i})">−</div>
        ${titleHtml}
        <div class="hw-content">${def.build(size)}</div>
        ${canResize ? `<div class="hw-rsz" data-idx="${i}" aria-label="Größe ziehen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a1 1 0 0 1-1-1v-4"/><path d="M4 16 9 21"/><path d="M15 3h4a1 1 0 0 1 1 1v4"/><path d="M20 8 15 3"/></svg></div>` : ''}
      </div>`;
    }).join('');
  }
  _sizeHeuteGrid();
  layout.forEach(w => { const d = WIDGET_DEFS[w.type]; if (d && d.fill) { try { d.fill(); } catch(e){} } });
  /* Erst NACH fill() steht fest, ob eine Kachel wirklich etwas zeigt: der Coach
     etwa entscheidet dort, ob er eine Empfehlung hat. Leere Kacheln bekommen
     .hw-leer und fallen aus dem Raster — vorher stand an ihrer Stelle ein Loch,
     das wie ein Ladefehler aussah. */
  grid.querySelectorAll('.hw').forEach(el => {
    const inhalt = el.querySelector('.hw-content');
    /* Auf VORHANDENE Kinder zu prüfen reicht nicht: der Coach lässt seinen
       Wirtscontainer stehen und leert nur dessen Inneres — die Kachel hätte
       weiter als "gefüllt" gegolten. Gezählt wird deshalb, ob überhaupt etwas
       Sichtbares drinsteht: Text, ein Symbol, ein Bild oder ein Bedienelement. */
    const leer = !inhalt || (!inhalt.textContent.trim()
      && !inhalt.querySelector('svg,img,canvas,input,button'));
    el.classList.toggle('hw-leer', leer);
  });
  attachHeuteGestures(grid);
}

/* Rastereinheit so berechnen, dass ein Quadrat (2 Einheiten) wirklich quadratisch ist */
function _sizeHeuteGrid(){
  const grid = document.getElementById('heute-grid');
  if (!grid) return;
  const g = 12;
  const w = grid.clientWidth;
  if (!w) return;
  const col  = (w - g) / 2;        // Spaltenbreite
  const unit = (col - g) / 2;      // 2 Einheiten + 1 Lücke = Spaltenbreite ⇒ Quadrat
  grid.style.setProperty('--hw-unit', unit + 'px');
}
window.addEventListener('resize', _sizeHeuteGrid);

/* ── Kompakte Widget-Renderer · emoji-frei · Listen nur in lg, Stat in sm/md ── */
/* Der Streak zeigt eine FLAMME, nicht nur eine Zahl. Und zwar DIESELBE, die
   im Streak-Abzeichen oben und im Streak-Blatt lodert: _flameSVG zeichnet drei
   Lagen (aussen, innen, Kern), jede mit eigenem Rhythmus (1,9 s / 1,25 s /
   0,95 s). Weil die Zeiten nicht aufgehen, wiederholt sich das Muster praktisch
   nie — das ist der Unterschied zwischen "lodert" und "pulsiert".
   Die einfache _flameFillSVG (ein Pfad, keine Bewegung) stand hier zuerst und
   war der Fehler: zwei Flammen in einer App, von denen nur eine lebt.

   Gezaehlt werden WOCHEN, nicht Tage (calcStreak). Das ist bei Krafttraining
   die richtige Groesse — taeglich trainiert niemand, und ein Tages-Streak
   waere nach dem ersten Ruhetag gerissen.

   Der Schein liegt hinter der Flamme, nicht auf ihr: ein weicher runder
   Verlauf plus ein enger Ring. Ein Filter (drop-shadow) auf dem SVG selbst
   waere teurer und wuerde bei jedem Neuzeichnen der Startseite neu gerastert.
   Bei erloschenem Streak (0 Wochen) leuchtet nichts — eine leuchtende Flamme
   ueber einer Null waere eine Feier fuer nichts. */
function hwStreak(size){
  const st = calcStreak();
  const aus = !st.weeks;
  const gr  = size === 'lg' ? 62 : (size === 'md' ? 50 : 38);
  const sub = size === 'sm'
    ? _cm('Streak', 'Streak')
    : (st.bestWeeks ? _cm('Streak · Best ' + st.bestWeeks, 'Streak · best ' + st.bestWeeks) : _cm('Wochen-Streak', 'Week streak'));
  const einheit = st.weeks === 1 ? _cm('Woche', 'week') : _cm('Wochen', 'weeks');
  return `<div class="hw-card hw-streak${aus ? ' is-aus' : ''}"><div class="hw-stat">
    <div class="strk-flame" style="--fl:${gr}px">${_flameSVG(gr, true)}</div>
    <div class="strk-val">${st.weeks}<span>${einheit}</span></div>
    <div class="hw-sub">${sub}</div>
  </div></div>`;
}
/* Der Verlauf als Balkenreihe statt als Linie. Dieselbe Ueberlegung wie bei
   den Strichen: eine Linie zeigt eine Form, Balken zeigen einzelne Werte —
   und hier IST jeder Punkt ein einzelnes Training bzw. ein Wiegetag. Der
   letzte Balken steht heller, das ist der aktuelle.
   Kein SVG mehr: fuenfzehn Rechtecke als Flexbox sind billiger als ein
   Zeichenknoten mit Polyline, und der Schein laesst sich per box-shadow
   setzen statt per Filter, den WebKit je Bild neu rastert. */
function _sparkline(arr){
  if (!arr || arr.length < 2) return '';
  const max = Math.max(...arr), min = Math.min(...arr), rng = (max-min)||1;
  const n = arr.length;
  return `<div class="hw-spark">` + arr.map((v,i)=>{
    // Mindesthoehe 12 %: ein Wert am unteren Ende waere sonst unsichtbar und
    // saehe aus wie ein fehlender Tag.
    const h = 12 + ((v-min)/rng) * 88;
    const jetzt = i === n-1 ? ' is-now' : '';
    return `<i class="${jetzt.trim()}" style="height:${h.toFixed(1)}%"></i>`;
  }).join('') + `</div>`;
}
function hwVolume(size){
  const sessions = [...S.sessions].sort((a,b)=>new Date(a.date)-new Date(b.date));
  const vols = sessions.map(s=>sessionVolume(s)).filter(v=>v>0);
  if (!vols.length) return `<div class="hw-card"><div class="hw-stat"><div class="hw-empty-mini">Noch keine Trainings</div></div></div>`;
  const total = vols.reduce((a,b)=>a+b,0);
  if (size === 'sm') return `<div class="hw-card" onclick="openVolumeFull()"><div class="hw-stat">
    <div class="hw-big" style="font-size:23px">${fmtKg(total)}</div>
    <div class="hw-sub">Volumen</div>
  </div></div>`;
  if (size === 'md') return `<div class="hw-card" onclick="openVolumeFull()"><div class="hw-stat">
    <div class="hw-big">${fmtKg(total)}</div>
    <div class="hw-sub">Volumen</div>
  </div></div>`;
  return `<div class="hw-card" onclick="openVolumeFull()" style="justify-content:center">
    <div class="hw-big">${fmtKg(total)}</div>
    <div class="hw-sub">Gesamt-Volumen · ${S.sessions.length} Einheit${S.sessions.length!==1?'en':''}</div>
    ${_sparkline(vols.slice(-16))}
  </div>`;
}
function hwRecovery(size){
  const mgRec = getMuscleGroupRecovery();
  const trained = MUSCLE_GROUPS
    .map(mg => ({mg, r: mgRec[mg.id] || {recPct:100,lastTs:null}}))
    .filter(x => x.r.lastTs);
  if (!trained.length) return `<div class="hw-card"><div class="hw-stat"><div class="hw-empty-mini">Alle Muskeln erholt</div></div></div>`;

  // Quadrat (sm): Erholungs-Batterie (Gesamterholung) — wie gehabt
  if (size === 'sm'){
    const pct = Math.round(trained.reduce((s,x)=>s+x.r.recPct,0)/trained.length);
    const col = recoveryColor(pct);
    const state = recoveryState(pct);
    return `<div class="hw-card hw-rec-batt" onclick="goTabId('stats')" style="cursor:pointer">
      <div class="rec-batt-v-outer">
        <div class="rec-batt-v-cap"></div>
        <div class="rec-batt-v">${_segBarsVertHTML(pct, 7)}</div>
      </div>
      <div class="rec-batt-v-pct" style="color:${_neonInk(col)}">${pct}%</div>
      <div class="rec-batt-v-lbl"><b>${state}</b></div>
    </div>`;
  }
  // Rechteck (md): kompakte Gesamterholung als Zahl
  if (size === 'md'){
    const pct = Math.round(trained.reduce((s,x)=>s+x.r.recPct,0)/trained.length);
    const col = recoveryColor(pct);
    return `<div class="hw-card" onclick="goTabId('stats')" style="cursor:pointer"><div class="hw-stat">
      <div class="hw-big" style="color:${_neonInk(col)}">${pct}%</div>
      <div class="hw-sub">${recoveryState(pct)}</div>
    </div></div>`;
  }

  // Liste (lg): identisches Design wie die Erholung im Statistik-Tab (rec-row + Akku-Balken)
  // Gleiche Reihenfolge wie die Liste im Statistik-Tab (erholteste zuerst) —
  // dieselbe Ansicht darf nicht an zwei Stellen andersherum sortiert sein.
  const rows = trained.sort((a,b)=>b.r.recPct-a.r.recPct).slice(0,5);
  return `<div class="hw-card rec-list-mini" style="gap:0">` + rows.map(({mg,r})=>{
    const col = recoveryColor(r.recPct);
    const sub = recoveryState(r.recPct) + ' · ' + fmtLastTraining(r.lastTs);
    const emptyCls = r.recPct < 15 ? ' is-empty' : '';
    return `<div class="rec-row" onclick="openMuscleGroupRecoveryDetail('${mg.id}')">
      <div class="rec-row-body">
        <div class="rec-row-title">${mg.label}</div>
        <div class="rec-row-sub">${sub}</div>
      </div>
      <div class="rec-seg-wrap">
        ${_segBarsHTML(r.recPct, 10, { flach: true, cls: 'segbar-mini',
          label: mg.label + ' ' + r.recPct + ' %' })}
        <span class="rec-seg-val" style="color:${_neonInk(col)}">${r.recPct}%</span>
      </div>
    </div>`;
  }).join('') + `</div>`;
}
function hwHeatmap(size){
  if (!S.sessions.length) return `<div class="hw-card"><div class="hw-stat"><div class="hw-empty-mini">Noch keine Aktivität</div></div></div>`;
  const map = {};
  S.sessions.forEach(s => { const k=_localDateKey(new Date(s.date)); map[k]=(map[k]||0)+(sessionVolume(s)||1); });
  const active = Object.values(map).filter(v=>v>0).sort((a,b)=>a-b);
  const q = p => active.length ? active[Math.min(active.length-1, Math.floor(active.length*p))] : 0;
  const q1=q(.25), q2=q(.5), q3=q(.75);
  const today = new Date(); today.setHours(0,0,0,0);
  const dow = (today.getDay()+6)%7;
  const end = new Date(today); end.setDate(today.getDate()+(6-dow));
  // sm=7 Wochen (quadratisch) · md=26 Wochen (flach & breit) · lg=14 Wochen
  const WEEKS = size==='sm' ? 7 : size==='md' ? 26 : 14;
  const start = new Date(end); start.setDate(end.getDate()-(WEEKS*7-1));
  let html = '';
  for (let c=0;c<WEEKS;c++){
    html += '<div class="hw-hm-col">';
    for (let r=0;r<7;r++){
      const d = new Date(start); d.setDate(start.getDate()+c*7+r);
      const fut = d>today;
      let lvl = 0;
      if (!fut){ const v=map[_localDateKey(d)]||0; lvl = v<=0?0:v<=q1?1:v<=q2?2:v<=q3?3:4; }
      html += `<div class="hw-hm-cell l${lvl}${fut?' fut':''}"></div>`;
    }
    html += '</div>';
  }
  return `<div class="hw-card hw-hm-wrap">${html}</div>`;
}
function hwWeekcal(size){
  /* Frueher stand hier ein Frueh-Ausstieg mit dem blossen Satz "Noch keine
     Trainings diese Woche" — auf einer grossen Kachel war das eine leere
     Flaeche mit einer Zeile darin. Das Wochenraster wird deshalb IMMER
     gezeichnet: sieben Tage mit Datum sind auch ohne einen einzigen Eintrag
     eine Aussage (die Woche, in der man steht), und die Kachel traegt sich
     selbst. Die leeren Tage zeigt das CSS ohnehin als blossen Umriss. */
  const today = new Date(); today.setHours(0,0,0,0);
  const { map, level } = _volMap();
  const mon = new Date(today); mon.setDate(today.getDate() - _DOW_MON0(today));
  let days = '', trained = 0, dots = '';
  for (let i=0;i<7;i++){
    const d = new Date(mon); d.setDate(mon.getDate()+i);
    const v = map[_localDateKey(d)] || 0;
    if (v>0) trained++;
    const isToday  = d.getTime()===today.getTime();
    const isFuture = d>today;
    const cls = [v>0?'l'+level(v):'', isToday?'today':'', isFuture?'future':''].filter(Boolean).join(' ');
    /* Das Kuerzel steht jetzt UEBER der Kapsel und die Kapsel traegt den
       Tagespunkt: erst wonach man sucht (der Wochentag), dann was an dem Tag
       war. "Heute" haengt an der Spalte, nicht am Punkt — deshalb bekommt die
       week-day die Markierung und nicht mehr der Punkt (siehe CSS).
       Im Punkt steht das Datum statt eines Hakens: die trainierten Tage sind
       an Fuellung und Schein zu erkennen, und die Zahl beantwortet nebenbei
       die Frage, um welche Woche es ueberhaupt geht. */
    days += `<div class="week-day${isToday?' is-today':''}">`
          + `<div class="week-day-lbl">${_WD_LBL[i]}</div>`
          + `<div class="week-pill${isToday?' today':''}${isFuture?' future':''}">`
          + `<div class="week-dot ${cls}">${d.getDate()}</div></div></div>`;
    dots += `<span class="wk-mini-dot ${cls}"></span>`;
  }
  if (size === 'sm') return `<div class="hw-card hw-week" onclick="openCalendarOverlay()"><div class="hw-stat">
    <div class="hw-big">${trained}<span style="font-size:15px;color:var(--text2)">/7</span></div>
    <div class="wk-mini-row">${dots}</div>
    <div class="hw-sub">Diese Woche</div>
  </div></div>`;
  if (size === 'md') return `<div class="hw-card hw-week" onclick="openCalendarOverlay()" style="justify-content:center"><div class="hw-stat">
    <div class="hw-big">${trained}<span style="font-size:15px;color:var(--text2)">/7</span></div>
    <div class="wk-mini-row">${dots}</div>
  </div></div>`;
  return `<div class="hw-card hw-week" onclick="openCalendarOverlay()" style="justify-content:center">
    <div class="week-circles-row">${days}</div>
    <div class="hw-week-foot"><span><b>${trained}</b> ${trained===1?'Training':'Trainings'} diese Woche</span><span>Kalender →</span></div>
  </div>`;
}
function hwMuscles(size){
  const tot = {}; let grand = 0;
  S.sessions.forEach(s => s.logs.forEach(l => {
    const ex = exById(l.exerciseId); if (!ex) return;
    const g = ex.muscleGroup || 'other';
    const v = setsVolume(l.sets);
    tot[g] = (tot[g]||0)+v; grand += v;
  }));
  if (!grand) return `<div class="hw-card"><div class="hw-stat"><div class="hw-empty-mini">Noch keine Daten</div></div></div>`;
  const all = MUSCLE_GROUPS.map(mg=>({mg,v:tot[mg.id]||0})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v);
  /* Nur die quadratische Kleinstform zeigt eine einzelne Zahl — dort ist fuer
     eine Liste schlicht kein Platz. Die mittlere Groesse zeigt dieselbe
     Verteilung wie die grosse: eine Verteilung, von der man nur den groessten
     Posten sieht, ist keine Verteilung mehr. Kompakt wird sie ueber schmalere
     Beschriftung und weniger Striche, nicht ueber weniger Zeilen. */
  if (size === 'sm'){
    const top = all[0];
    return `<div class="hw-card"><div class="hw-stat">
      <div class="hw-big">${Math.round(top.v/grand*100)}%</div>
      <div class="hw-sub">${top.mg.label}</div>
    </div></div>`;
  }
  const kompakt = size === 'md';
  const rows = all.slice(0, kompakt ? 5 : 6);
  const max = rows[0].v || 1;
  /* Eine Kopfzeile, die sagt, WAS hier verglichen wird. Ohne sie stand da nur
     eine Liste von Muskelgruppen mit Balken, und dass es um die Verteilung des
     Gesamtvolumens geht — nicht etwa um Erholung oder Energie — musste man
     raten. Genau das ist passiert.
     Die Balken zeigen den Anteil am STAERKSTEN Wert (so ist der Vergleich
     untereinander ablesbar), die Prozentzahl den Anteil am Gesamtvolumen. */
  /* Weniger Striche in der kompakten Form ist Absicht: bei zehn blieben in der
     halben Kachelbreite gut zwei Pixel je Strich, und ein Strich, der schmaler
     ist als sein eigener Schein, verschwindet in ihm — die Reihe sah aus wie
     ein durchgehender Balken. Sechs Striche behalten die Luecken. */
  const segN = kompakt ? 6 : 10;
  return `<div class="hw-card hw-mg-card${kompakt ? ' hw-mg-kompakt' : ''}">
    <div class="hw-mg-head">${esc(_cm('Volumen-Verteilung','Volume split'))}
      <span>${esc(_cm('Anteil am Gesamtvolumen','share of total volume'))}</span></div>`
    + rows.map(({mg,v})=>`
    <div class="hw-mg-row">
      <span class="hw-mg-label">${mg.label}</span>
      <span class="hw-mg-seg">${_segBarsHTML(Math.max(5,Math.round(v/max*100)), segN, { flach:true, cls:'segbar-mini' })}</span>
      <span class="hw-mg-val">${Math.round(v/grand*100)}%</span>
    </div>`).join('') + `</div>`;
}
function hwOneRM(size){
  const all = (S.exercises||[]).map(ex=>({ex, orm:exBest1RM(ex.id)})).filter(x=>x.orm>0).sort((a,b)=>b.orm-a.orm);
  if (!all.length) return `<div class="hw-card"><div class="hw-stat"><div class="hw-empty-mini">Noch keine 1RM-Daten</div></div></div>`;
  if (size === 'sm' || size === 'md'){
    const t = all[0];
    return `<div class="hw-card"><div class="hw-stat">
      <div class="hw-sub" style="max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.ex.name)}</div>
      <div class="hw-big" style="color:var(--acc)">${fmt1RM(t.orm)}</div>
      <div class="hw-sub">1RM-Best</div>
    </div></div>`;
  }
  const rows = all.slice(0,5);
  return `<div class="hw-card">` + rows.map(({ex,orm})=>`
    <div class="hw-orm-row">
      <span class="hw-orm-name">${esc(ex.name)}</span>
      <span class="hw-orm-val">${fmt1RM(orm)}</span>
    </div>`).join('') + `</div>`;
}
function hwQuick(icon,label,fn,size){
  const ic = icon ? `<span class="hw-quick-ico">${icon}</span>` : '';
  return `<button class="hw-card hw-quick" onclick="${fn}"><div class="hw-stat">${ic}<span class="hw-quick-lbl">${label}</span></div></button>`;
}
function hwPlans(size){
  const presets = (S.workoutPresets||[]).filter(p => _presetExIdsExisting(p).length);
  if (!presets.length) return `<div class="hw-card" onclick="openWorkout()"><div class="hw-stat"><div class="hw-empty-mini">Noch keine Pläne</div></div></div>`;
  // sm/md: kompakte Übersicht → öffnet die Plan-Auswahl
  if (size === 'sm' || size === 'md'){
    return `<div class="hw-card" onclick="openWorkout()"><div class="hw-stat">
      <div class="hw-big">${presets.length}</div>
      <div class="hw-sub">${presets.length===1?'Plan':'Pläne'}</div>
    </div></div>`;
  }
  // lg: Pläne einzeln antippbar → direkt starten
  const rows = presets.slice(0,5);
  return `<div class="hw-card">` + rows.map(p=>{
    const cnt = _presetExIdsExisting(p).length;
    return `<div class="hw-plan-row" onclick="startPresetDirect('${p.id}')">
      <span class="hw-plan-name">${esc(p.name)}</span>
      <span class="hw-plan-right">
        <span class="hw-plan-meta">${cnt} Üb.</span>
        <button class="hw-plan-start" onclick="event.stopPropagation();startPresetDirect('${p.id}')">▶ Start</button>
      </span>
    </div>`;
  }).join('') + `</div>`;
}
// Plan aus dem Widget heraus starten → öffnet wie der normale Flow zuerst die
// Übungs-Auswahl (Step 1) mit den Plan-Übungen vorausgewählt. Erst der finale
// „Training starten"-Button führt ins aktive Training.
function startPresetDirect(id){
  if (heuteEditMode) return;                 // im Bearbeiten-Modus nicht starten
  if (isWorkoutActive()){ openWorkout(); return; } // läuft schon → nur anzeigen
  const p = (S.workoutPresets||[]).find(x=>x.id===id);
  if (!p) return;
  const ids = _presetExIdsExisting(p);
  if (!ids.length){ alert('Plan enthält keine vorhandenen Übungen'); return; }
  wkExIds = ids.slice();
  wkLogs  = [];
  wkCatFilter = 'alle';
  _activePlanSrc = { type:'preset', id: p.id };

  // Plan-Hinweis wie beim Wochenplan anzeigen
  const hint = document.getElementById('wk-plan-hint');
  const hintText = p.name + ' · ' + ids.length + ' Übung' + (ids.length !== 1 ? 'en' : '') + ' vorausgewählt';
  if (hint) { hint.style.display = ''; hint.textContent = hintText; }

  // Step 1 (Auswahl/Prüfen) zeigen — identisch zum normalen openWorkout()
  document.getElementById('wk-step1').style.display = '';
  document.getElementById('wk-step2').style.display = 'none';
  document.getElementById('wk-title').textContent = 'Training';
  renderWkPresets();
  renderWkFilterBar();
  renderWkPicker();
  openOv('ov-wk');
}

/* ── Bearbeitungs-Modus ── */
function enterEditMode(){
  if (heuteEditMode) return;
  heuteEditMode = true;
  const pad = document.getElementById('heute-pad');
  if (pad) pad.classList.add('editing');
  const bar = document.getElementById('heute-edit-bar');
  if (bar) bar.classList.add('visible');
}
function exitEditMode(){
  heuteEditMode = false;
  const pad = document.getElementById('heute-pad');
  if (pad) pad.classList.remove('editing');
  const bar = document.getElementById('heute-edit-bar');
  if (bar) bar.classList.remove('visible');
}
function removeWidget(i){
  const L = _heuteLayout();
  if (i<0 || i>=L.length) return;
  L.splice(i,1);
  persist(); renderHeuteGrid();
}
function clearAllWidgets(){
  const L = _heuteLayout();
  if (!L.length) return;
  if (!confirm('Wirklich alle Widgets von der Startseite entfernen?')) return;
  L.length = 0;
  haptic && haptic(20);
  persist(); renderHeuteGrid();
}
function toggleWidgetSize(i){
  const L = _heuteLayout(); const w = L[i]; if (!w) return;
  const def = WIDGET_DEFS[w.type]; if (!def || def.sizes.length < 2) return;
  const cur = def.sizes.includes(w.size) ? w.size : def.sizes[0];
  w.size = def.sizes[(def.sizes.indexOf(cur)+1) % def.sizes.length];
  persist(); renderHeuteGrid();
}
let _pendingWidgetInsertAfter = null;

function addWidget(type, size){
  if (!WIDGET_DEFS[type]) return;
  const L = _heuteLayout();
  if (L.some(w=>w.type===type)) return;
  const def = WIDGET_DEFS[type];
  // Im Picker gewählte Größe übernehmen, sonst Standard
  let sz = (size && def.sizes.includes(size)) ? size : def.sizes[0];
  let insertAt = L.length;
  if (_pendingWidgetInsertAfter !== null) {
    insertAt = _pendingWidgetInsertAfter + 1;
    if (!size && def.sizes.includes('sm')) sz = 'sm';
    _pendingWidgetInsertAfter = null;
  }
  L.splice(insertAt, 0, {type, size: sz});
  persist();
  if (!heuteEditMode) enterEditMode();
  renderHeuteGrid();
  // Nach der Auswahl schließt sich der Picker (Apple-Verhalten) — das Widget
  // liegt danach sichtbar im Raster, statt hinter dem offenen Sheet.
  try { haptic && haptic(10); } catch(_){}
  closeOv('ov-widget-add');
}

/* ── Widget-Picker (Bottom-Sheet · Apple-Style Galerie) ── */
function openWidgetPicker(){ _pendingWidgetInsertAfter = null; document.body.classList.add('wpick-open'); renderWidgetPicker(); openOv('ov-widget-add'); }
function openWidgetPickerAt(afterIdx){ _pendingWidgetInsertAfter = afterIdx; document.body.classList.add('wpick-open'); renderWidgetPicker(); openOv('ov-widget-add'); }
/* Galerie-Reihenfolge: erst die großen (span-2) „Feature"-Widgets, dann die
   quadratischen/kleinen paarweise – so entstehen keine Lücken im 2er-Raster. */
const WIDGET_GALLERY_ORDER = ['woche','history','muscles','onerm','streak','volume','recovery','weight','train','qadd','qweight'];
/* Repräsentative Start-Größe je Widget (so wie es nachher real aussieht). */
const WIDGET_PREVIEW_SIZE = {
  woche:'lg', history:'lg', muscles:'lg', onerm:'lg',
  streak:'sm', volume:'sm', recovery:'sm', weight:'sm',
  train:'md', qadd:'md', qweight:'md'
};
const _WA_SIZE_LBL = {sm:'S', md:'M', lg:'L'};
let _waPickSize = {};   // je Typ aktuell im Picker gewählte Vorschau-Größe

function _waSizeFor(type){
  const def = WIDGET_DEFS[type]; if (!def) return 'sm';
  let s = _waPickSize[type] || WIDGET_PREVIEW_SIZE[type];
  if (!s || !def.sizes.includes(s)) s = def.sizes[def.sizes.length-1];
  return s;
}
function setWaSize(type, size){
  const def = WIDGET_DEFS[type];
  if (!def || !def.sizes.includes(size)) return;
  _waPickSize[type] = size;
  // Nur diese eine Karte neu aufbauen → Scrollposition bleibt erhalten
  const card = document.querySelector(`#widget-add-list .wa-card[data-type="${type}"]`);
  if (!card){ renderWidgetPicker(); return; }
  card.outerHTML = _waCardHTML(type);
  const fresh = document.querySelector(`#widget-add-list .wa-card[data-type="${type}"]`);
  if (fresh) _decorateWaCard(fresh);
}

/* HTML einer einzelnen Galerie-Karte: echte Vorschau + S/M/L-Wahl + Name */
function _waCardHTML(type){
  const def = WIDGET_DEFS[type]; if (!def) return '';
  const added = getHeuteLayout().some(w=>w.type===type);
  const size  = _waSizeFor(type);
  const span2 = size === 'lg';
  const titleHtml = (size === 'lg' && def.title) ? `<div class="hw-title">${def.title}</div>` : '';
  const spanStyle = size === 'lg' ? ` style="grid-row:span ${def.lgRows||2}"` : '';
  // Echte Widget-Markup; IDs entfernen, damit globale fill-Aufrufe weiterhin
  // das echte Dashboard-Element treffen – nicht die Vorschau.
  const inner = def.build(size).replace(/ id="(tracker-row|weight-card|history-card)"/g,'');
  const name  = def.label || def.title || type;
  // S/M/L-Umschalter – nur wenn das Widget mehrere Größen unterstützt
  const sizeSel = def.sizes.length > 1
    ? `<div class="wa-sizes">${def.sizes.map(s=>
        `<span class="wa-size-seg${s===size?' on':''}" onclick="event.stopPropagation();setWaSize('${type}','${s}')">${_WA_SIZE_LBL[s]||s}</span>`
      ).join('')}</div>`
    : `<div class="wa-sizes"><span class="wa-size-seg on wa-size-only">${_WA_SIZE_LBL[size]||size}</span></div>`;
  return `<div class="wa-card${span2?' span2':''}${added?' added':''}" data-type="${type}" data-size="${size}"${added?'':` onclick="addWidget('${type}','${size}')"`}>
    <div class="wa-stage">
      <div class="wa-stage-grid cols${span2?2:1}">
        <div class="hw hw-${size}" data-type="${type}" data-size="${size}"${spanStyle}>
          ${titleHtml}
          <div class="hw-content">${inner}</div>
        </div>
      </div>
    </div>
    ${sizeSel}
    <div class="wa-meta">
      <span class="wa-name">${name}</span>
      <span class="wa-plus">${added?'✓':'＋'}</span>
    </div>
  </div>`;
}

/* Vorschau einer Karte messen + (bei datengetriebenen Widgets) befüllen */
function _decorateWaCard(card){
  if (!card) return;
  _sizeWaStage(card.querySelector('.wa-stage-grid'), card.dataset.size);
  const def = WIDGET_DEFS[card.dataset.type];
  if (def && def.fill){
    const hw = card.querySelector('.hw');
    const el = card.dataset.type==='woche' ? hw.querySelector('.tracker-row') : hw.querySelector('.card');
    if (el){ try{ def.fill(el); }catch(e){} }
  }
}

function renderWidgetPicker(){
  const host = document.getElementById('widget-add-list');
  if (!host) return;
  const order = WIDGET_GALLERY_ORDER.filter(t=>WIDGET_DEFS[t]);
  WIDGET_PICK_ORDER.forEach(t=>{ if(!order.includes(t)) order.push(t); });
  host.innerHTML = order.map(t=>_waCardHTML(t)).join('');
  const decorate = ()=> host.querySelectorAll('.wa-card').forEach(_decorateWaCard);
  // Zweimal: sofort + nächster Frame (Sheet hat beim Öffnen evtl. noch keine Breite)
  requestAnimationFrame(()=>{ decorate(); requestAnimationFrame(decorate); });
}

/* Rastereinheit einer Vorschau so wählen, dass die Kachel real-proportional ist:
   sm → Quadrat · md → flaches Rechteck · lg → volle Breite (2 Spalten). */
function _sizeWaStage(stage, size){
  if (!stage) return;
  const gap = 12;
  const w = stage.clientWidth;
  if (!w) return;
  let unit;
  if (size === 'lg'){ const col = (w-gap)/2; unit = (col-gap)/2; }
  else { unit = (w-gap)/2; }   // 1-Spalten-Bühne: 2 Einheiten + Lücke = Breite ⇒ Quadrat
  stage.style.setProperty('--hw-unit', unit+'px');
}
window.addEventListener('resize', ()=>{
  const ov = document.getElementById('ov-widget-add');
  if (!ov || !ov.classList.contains('on')) return;
  document.querySelectorAll('#widget-add-list .wa-card').forEach(card=>{
    _sizeWaStage(card.querySelector('.wa-stage-grid'), card.dataset.size);
  });
});

/* ── Gesten: Long-Press (Bearbeiten) + Drag & Drop (Umsortieren) ── */
let _hlpTimer=null, _hlpStart=null, _hDrag=null, _hRsz=null;
function attachHeuteGestures(grid){
  if (grid._gestBound) return;
  grid._gestBound = true;
  grid.addEventListener('pointerdown', _hOnDown);
  grid.addEventListener('pointermove', _hOnMove, {passive:false});
  grid.addEventListener('pointerup', _hOnUp);
  grid.addEventListener('pointercancel', _hOnUp);
  grid.addEventListener('contextmenu', e=>{ if (heuteEditMode) e.preventDefault(); });
}
function _hClearLP(){ if (_hlpTimer){ clearTimeout(_hlpTimer); _hlpTimer=null; } }
function _hOnDown(e){
  if (e.pointerType==='mouse' && e.button!==0) return;
  const tile = e.target.closest('.hw');
  if (heuteEditMode){
    if (e.target.closest('.hw-badge')) return;
    // Resize-Griff gezogen → Größe per Ziehen anpassen (statt Tippen)
    const rsz = e.target.closest('.hw-rsz');
    if (rsz){
      const idx = parseInt(rsz.dataset.idx||'-1');
      const grid = document.getElementById('heute-grid');
      const tile = grid && grid.querySelector(`.hw[data-idx="${idx}"]`);
      _hRsz = {idx, id:e.pointerId, sx:e.clientX, sy:e.clientY, moved:false, tile};
      if (tile){
        const tr = tile.getBoundingClientRect();
        _hRsz.tr = tr;
        const L = _heuteLayout();
        _hRsz.lastWant = (L[idx] && L[idx].size) || null;
        // Kontinuierliches Resize-Frame, das dem Finger folgt (Apple-Stil)
        const f = document.createElement('div');
        f.className = 'hw-rsz-frame';
        f.style.left = tr.left+'px'; f.style.top = tr.top+'px';
        f.style.width = tr.width+'px'; f.style.height = tr.height+'px';
        document.body.appendChild(f);
        _hRsz.frame = f;
        tile.classList.add('hw-resizing');
      }
      try { grid.setPointerCapture(e.pointerId); } catch(_){}
      e.preventDefault();
      return;
    }
    if (!tile) return;
    _hDrag = {tile, idx:parseInt(tile.dataset.idx||'-1'), id:e.pointerId, sx:e.clientX, sy:e.clientY, started:false, overEl:null};
    return;
  }
  if (e.target.closest('.tracker-ring-btn')) return; // hat eigenen Long-Press
  _hlpStart = {x:e.clientX, y:e.clientY};
  _hClearLP();
  _hlpTimer = setTimeout(()=>{ _hlpTimer=null; enterEditMode(); if (navigator.vibrate) navigator.vibrate(18); }, 480);
}
function _hOnMove(e){
  if (_hlpTimer && _hlpStart && Math.hypot(e.clientX-_hlpStart.x, e.clientY-_hlpStart.y) > 10) _hClearLP();
  if (_hRsz && _hRsz.id===e.pointerId){ e.preventDefault(); _hResizeMove(e); return; }
  if (_hDrag && _hDrag.id===e.pointerId){
    if (!_hDrag.started){
      if (Math.hypot(e.clientX-_hDrag.sx, e.clientY-_hDrag.sy) < 8) return;
      _hStartDrag(e);
    }
    e.preventDefault();
    _hMoveDrag(e);
  }
}
function _hOnUp(e){
  _hClearLP();
  if (_hRsz){ _hResizeEnd(); _hRsz = null; }
  if (_hDrag){
    if (_hDrag.started){
      if (_hDrag.ghost) _hDrag.ghost.remove();
      _hDrag.tile.style.opacity='';
      _hCommitOrder();
    }
    _hDrag = null;
  }
}
function _hStartDrag(e){
  const t = _hDrag.tile;
  const r = t.getBoundingClientRect();
  _hDrag.ox = e.clientX - r.left;
  _hDrag.oy = e.clientY - r.top;
  const g = t.cloneNode(true);
  g.classList.add('hw-ghost');
  g.style.position='fixed'; g.style.left=r.left+'px'; g.style.top=r.top+'px';
  g.style.width=r.width+'px'; g.style.height=r.height+'px';
  g.style.margin='0'; g.style.pointerEvents='none'; g.style.zIndex='9999';
  document.body.appendChild(g);
  _hDrag.ghost = g;
  t.style.opacity = '0';
  _hDrag.started = true;
  const grid = document.getElementById('heute-grid');
  try { grid.setPointerCapture(_hDrag.id); } catch(_){}
  if (navigator.vibrate) navigator.vibrate(8);
}
function _hMoveDrag(e){
  const g = _hDrag.ghost;
  g.style.left = (e.clientX - _hDrag.ox) + 'px';
  g.style.top  = (e.clientY - _hDrag.oy) + 'px';
  g.style.display='none';
  const el = document.elementFromPoint(e.clientX, e.clientY);
  g.style.display='';
  document.querySelectorAll('#heute-grid .hw-drop-hint').forEach(h=>h.classList.remove('hw-drop-hint'));
  const over = el && el.closest ? el.closest('.hw') : null;
  if (over && over !== _hDrag.tile) {
    over.classList.add('hw-drop-hint');
    _hDrag.overEl = over;
  } else {
    _hDrag.overEl = null;
  }
}
function _hCommitOrder(){
  document.querySelectorAll('#heute-grid .hw-drop-hint').forEach(h=>h.classList.remove('hw-drop-hint'));
  if (_hDrag && _hDrag.overEl) {
    const L = _heuteLayout();
    const from = parseInt(_hDrag.tile.dataset.idx);
    const to   = parseInt(_hDrag.overEl.dataset.idx);
    if (!isNaN(from) && !isNaN(to) && from !== to) {
      [L[from], L[to]] = [L[to], L[from]];
      persist();
    }
  }
  renderHeuteGrid();
}

/* ── Größe per Ziehen am Eck-Griff anpassen (Apple-Stil) ── */
function _hDesiredSize(def, idx, cx, cy){
  const grid = document.getElementById('heute-grid'); if (!grid) return null;
  const gr   = grid.getBoundingClientRect();
  const tile = grid.querySelector(`.hw[data-idx="${idx}"]`); if (!tile) return null;
  const tr   = tile.getBoundingClientRect();
  const g    = 12;
  const col  = (gr.width - g) / 2;           // eine Spaltenbreite
  const wWant = cx - tr.left;                // gewünschte Breite (ab Kachel-Links)
  const hWant = cy - tr.top;                 // gewünschte Höhe  (ab Kachel-Oben)
  // Breit (> ~1,3 Spalten) → groß (2 Spalten); sonst 1 Spalte → flach (md) oder hoch (sm)
  let cand;
  if (wWant > col * 1.3) cand = 'lg';
  else cand = (hWant < col * 0.62) ? 'md' : 'sm';
  if (def.sizes.includes(cand)) return cand;
  // Auf nächstunterstützte Größe einrasten
  let best = def.sizes[0], bd = 99;
  def.sizes.forEach(s => { const d = Math.abs((HW_RANK[s]??0) - (HW_RANK[cand]??0)); if (d < bd){ bd = d; best = s; } });
  return best;
}
function _hResizeMove(e){
  const L = _heuteLayout(); const w = L[_hRsz.idx]; if (!w) return;
  const def = WIDGET_DEFS[w.type]; if (!def || !_hRsz.frame) return;
  if (!_hRsz.moved && Math.hypot(e.clientX-_hRsz.sx, e.clientY-_hRsz.sy) < 6) return;
  _hRsz.moved = true;

  const grid = document.getElementById('heute-grid');
  const gr   = grid.getBoundingClientRect();
  const tr   = _hRsz.tr;
  const g    = 12;
  const unit = parseFloat(getComputedStyle(grid).getPropertyValue('--hw-unit')) || 78;
  const col  = (gr.width - g) / 2;

  // Frame folgt dem Finger kontinuierlich (mit sinnvollen Grenzen) → echtes Ziehen
  const minW = col * 0.5, maxW = gr.right - tr.left;
  const minH = unit * 0.8, maxH = unit * 4 + g * 3;
  const wWant = Math.max(minW, Math.min(maxW, e.clientX - tr.left));
  const hWant = Math.max(minH, Math.min(maxH, e.clientY - tr.top));
  _hRsz.frame.style.width  = wWant + 'px';
  _hRsz.frame.style.height = hWant + 'px';

  // Welche diskrete Größe würde einrasten? → nur Vorschau + Haptik bei Wechsel
  const want = _hDesiredSize(def, _hRsz.idx, e.clientX, e.clientY);
  if (want && want !== _hRsz.lastWant){
    _hRsz.lastWant = want;
    _hRsz.frame.classList.add('snap');
    setTimeout(()=>_hRsz.frame && _hRsz.frame.classList.remove('snap'), 180);
    hapticTick();
  }
}
function _hResizeEnd(){
  if (_hRsz && _hRsz.frame) _hRsz.frame.remove();
  document.querySelectorAll('#heute-grid .hw-resizing').forEach(t => t.classList.remove('hw-resizing'));
  if (!_hRsz) return;
  const L = _heuteLayout(); const w = L[_hRsz.idx]; const def = w && WIDGET_DEFS[w.type];
  if (!def || def.sizes.length <= 1){ return; }
  const cur = def.sizes.includes(w.size) ? w.size : def.sizes[0];
  if (_hRsz.moved){
    // Auf die beim Ziehen ermittelte Zielgröße einrasten (animiert)
    const target = _hRsz.lastWant && def.sizes.includes(_hRsz.lastWant) ? _hRsz.lastWant : cur;
    if (target !== cur){
      w.size = target;
      persist(); renderHeuteGrid();
      const tile = document.querySelector(`#heute-grid .hw[data-idx="${_hRsz.idx}"]`);
      if (tile){ tile.classList.add('hw-snap-in'); setTimeout(()=>tile.classList.remove('hw-snap-in'), 320); }
      haptic && haptic(10);
    }
  } else {
    // Reines Tippen auf den Griff → nächste Größe (Entdeckbarkeit)
    w.size = def.sizes[(def.sizes.indexOf(cur)+1) % def.sizes.length];
    persist(); renderHeuteGrid();
  }
}

/* Profilbild oben links auf der Heute-Seite (ersetzt die Begrüßung).
   Tipp öffnet das Profil-Sheet. Fallback: Initialen, sonst Kopf-Silhouette. */
function _renderHdrAva(){
  const el = document.getElementById('hdr-ava'); if (!el) return;
  let photo = null;
  try { photo = _profilePhoto() || _fbUser?.photoURL || null; } catch(_){}
  const name = _profileName();
  if (photo) el.innerHTML = `<img src="${esc(photo)}" alt="">`;
  else if (name) el.innerHTML = `<span class="hdr-ava-ini">${_socInitials(name)}</span>`;
  else el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.3" r="3.5"/><path d="M5.2 19.2c1.4-2.9 3.9-4.4 6.8-4.4s5.4 1.5 6.8 4.4"/></svg>';
}

function renderHome() {
  _renderHdrAva();
  renderStreak();
  _renderLevelBadge();
 renderHeuteGrid();
  renderCoachTodayCard();
}

/* ── KI-COACH: TAGESBRIEFING AUF DER STARTSEITE (Phase G, neu gebaut Phase I) ──
   Rein lokal berechnet (Erholung + Wochenplan + Post-Workout-Check-in liegen
   längst vor) — kein KI-Call, kein Kosten-/Quota-Verbrauch. Anders als vorher
   verschwindet die Karte NICHT, sobald ein Plan für heute steht: der Coach soll
   sich anfühlen, als wäre er jeden Tag dabei, also kommentiert er auch geplante
   Tage, den Tag nach dem Training und reine Erholungstage. Vier Lagen:
     done  → heute schon trainiert (Erholung läuft, Check-in ist eingerechnet)
     plan  → für heute ist ein Plan hinterlegt (+ Check-in-Anpassung ansagen)
     focus → kein Plan, eine Muskelgruppe ist erholt genug
     rest  → kein Plan, nichts ausreichend erholt → Erholungstag empfehlen */
function _gtDayStr(d) {
  const x = d ? new Date(d) : new Date();
  if (isNaN(x)) return '';
  return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0') + '-' + String(x.getDate()).padStart(2,'0');
}
function _coachTodaySuggestion() {
  try {
    if (!isPremium() || !S.aiCoach || S.aiCoach.insights === false) return null;
    // Kein Wegklicken mehr: das Tagesbriefing ist der sichtbare Gegenwert des Abos
    // und war nach einem versehentlichen ✕ den Rest des Tages weg. Wer es dauerhaft
    // nicht will, schaltet "Tagesempfehlung auf der Startseite" in den Einstellungen aus.

    const rd     = _ciReadiness();
    const mgRec  = getMuscleGroupRecovery();
    const trained = MUSCLE_GROUPS.map(mg => ({ mg, r: mgRec[mg.id] })).filter(c => c.r && c.r.lastTs);
    const plan   = planFor(todayKey());
    const hasPlan = plan && plan.type !== 'none';
    const today  = _gtDayStr();
    const didToday = (S.sessions || []).some(s => _gtDayStr(s.date) === today);
    if (!trained.length && !hasPlan) return null;   // ganz frischer Account: nichts erfinden

    const overall = trained.length
      ? Math.round(trained.reduce((s,c) => s + c.r.recPct, 0) / trained.length) : 100;
    const sorted = trained.slice().sort((a,b) => b.r.recPct - a.r.recPct);
    const best   = sorted[0] || null;
    const worst  = sorted[sorted.length-1] || null;
    const chip2  = rd ? rd.chip : null;

    // 1) Heute schon trainiert → Erholungs-Briefing statt "starte jetzt"
    if (didToday) {
      return { kind:'done', pct: overall, ringLbl: _cm('Erholung','Recovery'),
        head: _cm('Einheit im Kasten', 'Session in the bag'),
        text: (rd && rd.short
          ? _cm(`Check-in eingerechnet. ${rd.short}`, `Check-in factored in. ${rd.short}`)
          : _cm('Erholung läuft. Ich beobachte deine Muskelgruppen und melde mich, sobald wieder was bereit ist.',
                'Recovery is running. I am watching your muscle groups and will speak up when something is ready.')),
        chip: _cm('Heute trainiert','Trained today'), chip2 };
    }

    // 2) Plan für heute → Coach kommentiert den eigenen Plan (statt zu schweigen)
    if (hasPlan) {
      const lbl = _planLabelFor(todayKey()) || _cm('Trainingstag','Training day');
      const base = _cm(`${lbl} steht heute an.`, `${lbl} is on the plan today.`);
      return { kind:'plan', pct: overall, ringLbl: _cm('Bereit','Ready'),
        head: lbl,
        text: rd && rd.short ? `${base} ${rd.short}`
                             : `${base} ${_cm(`Im Schnitt bist du zu ${overall} % erholt.`, `You are ${overall}% recovered on average.`)}`,
        chip: _cm('Dein Plan','Your plan'), chip2 };
    }

    // 3) Kein Plan, aber etwas ist erholt → konkreter Fokus
    if (best && best.r.recPct >= 70) {
      let text = _cm(`${muscleLabel(best.mg.id)} ist zu ${best.r.recPct} % erholt — der beste Fokus für heute.`,
                     `${muscleLabel(best.mg.id)} is ${best.r.recPct}% recovered — your best focus today.`);
      // Höchstens ZWEI Aussagen pro Karte — die Check-in-Anpassung hat Vorrang
      // vor dem "schone Muskelgruppe X"-Hinweis, sonst wird der Text zur Wand.
      if (rd && rd.short) text += ' ' + rd.short;
      else if (worst && worst.mg.id !== best.mg.id && worst.r.recPct < 40) {
        text += ' ' + _cm(`${muscleLabel(worst.mg.id)} liegt bei ${worst.r.recPct} % — heute lieber schonen.`,
                          `${muscleLabel(worst.mg.id)} is at ${worst.r.recPct}% — better to spare it today.`);
      }
      return { kind:'focus', pct: best.r.recPct, ringLbl: muscleLabel(best.mg.id), mgId: best.mg.id,
        head: _cm(`${muscleLabel(best.mg.id)} ist bereit`, `${muscleLabel(best.mg.id)} is ready`),
        text, chip: _cm('Empfehlung für heute','Recommendation for today'), chip2 };
    }

    // 4) Nichts ausreichend erholt → Erholungstag ist die Empfehlung
    return { kind:'rest', pct: overall, ringLbl: _cm('Erholung','Recovery'),
      head: _cm('Heute Erholungstag', 'Recovery day today'),
      text: (best
        ? _cm(`Nichts ist wieder voll da — ${muscleLabel(best.mg.id)} liegt bei ${best.r.recPct} %. Ein ruhiger Tag zahlt sich morgen aus.`,
              `Nothing is fully back — ${muscleLabel(best.mg.id)} is at ${best.r.recPct}%. A calm day pays off tomorrow.`)
        : _cm('Deine Muskulatur erholt sich noch. Ein ruhiger Tag zahlt sich morgen aus.',
              'Your muscles are still recovering. A calm day pays off tomorrow.')),
      chip: _cm('Empfehlung für heute','Recommendation for today'), chip2 };
  } catch(e) { console.warn('[Coach] today suggestion:', e); return null; }
}
/* ── Die drei Zonen der Heute-Karte ──────────────────────────────────────
   Links der Ring der nächsten fälligen Muskelgruppe, rechts Wochenvolumen und
   was heute ansteht, darunter ein Satz vom Coach. Alle drei in EINEM Rahmen:
   es bleibt bei genau einer Karte im Heute-Tab (Gestaltungsregel 1). */

/* Die nächste fällige Gruppe ist die am weitesten erholte — die, die als
   nächste wieder dran ist. Gruppen ohne Trainingsspur zählen nicht mit: 100 %
   Erholung ohne je trainiert zu haben ist keine Auskunft. */
function _aicNextMuscle(){
  try {
    const rec = getMuscleGroupRecovery();
    const cand = MUSCLE_GROUPS.map(mg => ({ mg: mg, r: rec[mg.id] })).filter(c => c.r && c.r.lastTs);
    if (!cand.length) return null;
    cand.sort((a, b) => b.r.recPct - a.r.recPct);
    const top = cand[0];
    return { id: top.mg.id, label: muscleLabel(top.mg.id) || top.mg.id,
             pct: Math.max(0, Math.min(100, Math.round(top.r.recPct))) };
  } catch(e) { console.warn('[Coach] Nächste Muskelgruppe:', e); return null; }
}
/* Volumen der laufenden Woche und der Vorwoche, in kg. Beides kommt aus
   _crNowNumbers() — DERSELBEN Quelle, aus der auch die Wochenkachel liest.
   Zwei getrennte Rechnungen hiessen: zwei Zahlen für dieselbe Woche auf zwei
   Flächen derselben App, und genau das ist hier schon einmal passiert.
   Die Vorwoche kommt aus n.prevVol und nicht mehr aus einem zweiten Lauf über
   ws - 7 * 864e5: prevVol rechnet über den Kalender (CoachReport.shiftWeeks),
   die Millisekunden landeten in der Woche nach der Frühjahrsumstellung eine
   Stunde und damit eine ganze Woche zu weit zurück. */
function _aicWeek(){
  try {
    const n = _crNowNumbers();
    if (!n) return null;
    return { vol: Math.round(Number(n.vol) || 0), prev: Math.round(Number(n.prevVol) || 0) };
  } catch(e) { console.warn('[Coach] Wochenvolumen der Karte:', e); return null; }
}
// Die Einheit hängt am WERT (_csWeight). Ohne Vorwoche kein Pfeil und kein
// Prozent: eine Steigerung gegenüber nichts hat niemand erbracht.
function _aicWeekText(w){
  try {
    if (!w) return '';
    const t = _csWeight(w.vol) || '';
    if (!(w.prev > 0)) return t;
    const d = w.vol - w.prev;
    const pf = d > 0 ? '↑' : d < 0 ? '↓' : '→';
    return t + ' ' + pf + ' ' + Math.round(Math.abs(d) / w.prev * 100) + ' %';
  } catch(e) { console.warn('[Coach] Wochenzeile:', e); return ''; }
}
/* Ein Satz vom Coach im gewählten Ton, aus der Sprachfabrik — mit ECHTEN
   Zahlen. Zwei Lagen, beide belegbar: liegt die letzte Einheit zwei Tage oder
   länger zurück, zählt der Satz die Tage; sonst spricht er über die letzte
   Einheit. Gibt es weder das eine noch das andere, steht dort kein Satz —
   erfundene Zahlen auf der Vertrauensfläche waren schon ein Befund. */
function _aicSay(){
  try {
    const ses = (S.sessions || []).filter(x => x && x.date && Array.isArray(x.logs));
    if (!ses.length) return '';
    const last = ses.slice().sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    const ts = new Date(last.date).getTime();
    if (!isFinite(ts)) return '';
    const tage = Math.floor((Date.now() - ts) / 864e5);
    if (tage >= 2) return _say('returnNudge', { days: tage }) || '';
    let sets = 0;
    (last.logs || []).forEach(l => (l.sets || []).forEach(x => { if (parseInt(x && x.r, 10) > 0) sets++; }));
    const vol = Math.round(sessionVolume(last));
    if (!(sets > 0) || !(vol > 0)) return '';
    return _say('debrief', _csVars({ sets: sets, vol: vol })) || '';
  } catch(e) { console.warn('[Coach] Kartensatz:', e); return ''; }
}
// Signatur der zuletzt gerenderten Karte: verhindert, dass jeder renderHome()
// (Tab-Wechsel, Sync, Timer) die Einblend-Animation erneut abfeuert.
let _aicSig = null;
/* ── Das Wellenfeld der Coach-Karte ──────────────────────────────────────
   Vorlage: ein Punktgitter, durch das Wellen rollen — die Punkte selbst gehen
   mit. Genau das kann CSS nicht: ein Verlaufsraster kann als Ganzes wandern,
   aber der einzelne Punkt bleibt an seinem Platz im Muster. Deshalb Canvas.

   Gerechnet wird ein Gitter in Zeilen (Tiefe) und Spalten (Breite). Die Hoehe
   jedes Punktes ist die Summe DREI verschieden schneller Sinuswellen — eine
   einzelne Welle sieht aus wie ein wehendes Tuch, erst die Ueberlagerung
   ergibt das unruhige Feld der Vorlage. Perspektive entsteht ueber die Zeile:
   weiter hinten liegen die Zeilen dichter, die Punkte kleiner und blasser.

   Kosten: rund 700 Punkte je Bild, gezeichnet als fillRect (kein arc/Pfad).
   Gemalt wird nur, wenn die Karte SICHTBAR ist — die Schleife haelt bei
   verstecktem Tab, ausgehaengter Karte oder weggescrolltem Feld an und laeuft
   erst wieder an, wenn sie zurueckkommt. Ein Hintergrundbild, das im
   Hintergrund weiterrechnet, ist Akkuverbrauch ohne Gegenwert. */
/* Mehrere Felder gleichzeitig (Heute-Karte UND Coach-Blatt) teilen sich EINE
   Schleife: zwei getrennte requestAnimationFrame-Ketten auf demselben Bild sind
   zwei Zeitachsen, die auseinanderlaufen — und doppelte Aufwachkosten. */
const _AIC_WV = { felder: [], raf: 0, t0: 0 };
function _aicWaveDrop(cv){
  _AIC_WV.felder = _AIC_WV.felder.filter(f => {
    if (cv && f.cv !== cv) return true;
    if (!cv && f.cv && f.cv.isConnected) return true;
    try { if (f.io) f.io.disconnect(); } catch(_) {}
    return false;
  });
  if (!_AIC_WV.felder.length && _AIC_WV.raf) { cancelAnimationFrame(_AIC_WV.raf); _AIC_WV.raf = 0; }
}
function _aicWaveStop(){
  try {
    _AIC_WV.felder.forEach(f => { try { if (f.io) f.io.disconnect(); } catch(_) {} });
    _AIC_WV.felder = [];
    if (_AIC_WV.raf) cancelAnimationFrame(_AIC_WV.raf);
    _AIC_WV.raf = 0;
  } catch(_) {}
}
/* Ein Feld anhaengen. dicht steuert, wie stark es auftraegt: die Heute-Karte
   ist die Buehne (1), das Blatt liegt hinter Kacheln und bleibt Dunst (.62). */
function _aicWaveAttach(cv, dicht){
  try {
    if (!cv || !cv.getContext) return;
    _aicWaveDrop(cv);                                  // denselben Knoten nie doppelt
    const f = { cv: cv, ctx: cv.getContext('2d'), io: null, ruht: false, dicht: dicht || 1 };
    if (!f.ctx) return;
    _AIC_WV.felder.push(f);
    _aicWaveSize(f);
    // Reduzierte Bewegung: EIN Bild, dann Ruhe. Das Feld bleibt sichtbar (es ist
    // Textur, keine Meldung), nur die Bewegung entfaellt.
    if (typeof _chReduceMotion === 'function' && _chReduceMotion()) { _aicWaveDraw(f, 0); return; }
    try {
      f.io = new IntersectionObserver((es) => {
        f.ruht = !es.some(e => e.isIntersecting);
        if (!f.ruht) _aicWaveLoop();
      }, { threshold: 0 });
      f.io.observe(cv);
    } catch(_) {}
    if (!_AIC_WV.t0) _AIC_WV.t0 = performance.now();
    _aicWaveLoop();
  } catch(e) { console.warn('[Coach] Wellenfeld:', e); }
}
function _aicWaveStart(card){
  _aicWaveDrop(null);                                  // abgeraeumte Karten vergessen
  _aicWaveAttach(card && card.querySelector('.aic-wv'), 1);
}
function _aicWaveSize(f){
  const cv = f.cv, ctx = f.ctx;
  if (!cv || !ctx) return;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return;
  // Auf 2 gedeckelt: 3x-Displays verdreifachen die Flaeche fuer einen
  // Unterschied, den bei 1,5-px-Punkten niemand sieht.
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(w * dpr)) cv.width = Math.round(w * dpr);
  if (cv.height !== Math.round(h * dpr)) cv.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
// Der Akzent als Zahlentripel. Einmal je Bild aus dem Stylesheet zu lesen wäre
// ein erzwungenes Layout — deshalb gepuffert und nur bei Themenwechsel neu.
const _AIC_WV_CACHE = {};
function _aicWaveVar(name, ersatz){
  try {
    const key = (document.documentElement.getAttribute('data-theme') || '') + '|' + name;
    const c = _AIC_WV_CACHE[name];
    if (c && c.key === key) return c.rgb;
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const p = v.split(',').map(x => parseInt(x, 10));
    const rgb = (p.length === 3 && p.every(n => isFinite(n))) ? p : ersatz;
    _AIC_WV_CACHE[name] = { key: key, rgb: rgb };
    return rgb;
  } catch(_) { return ersatz; }
}
function _aicWaveRGB(){ return _aicWaveVar('--acc-rgb', [0, 122, 255]); }
/* Wohin der Kamm laeuft. Im Dunkeln nach Weiss — dort IST Weiss das Licht. Auf
   den hellen Themes waere das ein weisser Punkt auf weissem Glas, also nach
   --acc-ink, der dunklen Fassung des Akzents: derselbe Kontrast, nur
   andersherum. Ohne diese Umkehr lagen alle Punkte auf derselben blassen
   Helligkeit und aus der Welle wurde ein gleichmaessiger Punktteppich. */
function _aicWaveInk(){ return _aicWaveVar('--acc-ink', [0, 52, 120]); }
const _AIC_ZEILEN = 20, _AIC_SPALTEN = 64;
function _aicWaveDraw(f, t){
  const cv = f.cv, ctx = f.ctx;
  if (!cv || !ctx) return;
  const W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  ctx.clearRect(0, 0, W, H);
  const rgb = _aicWaveRGB();
  const hell = document.documentElement.getAttribute('data-theme') !== 'dark';
  const ziel = hell ? _aicWaveInk() : [255, 255, 255];
  const dicht = f.dicht;
  for (let r = 0; r < _AIC_ZEILEN; r++) {
    // d = Naehe zum Betrachter. Die Potenz staucht die hinteren Zeilen
    // zusammen — das ist die ganze Perspektive.
    const d = r / (_AIC_ZEILEN - 1);
    const zeilenY = H * (0.20 + 0.86 * Math.pow(d, 1.7));
    const breite  = W * (0.92 + 0.34 * d);
    const amp     = H * 0.078 * (0.30 + d);
    for (let c = 0; c < _AIC_SPALTEN; c++) {
      const u = c / (_AIC_SPALTEN - 1) - 0.5;
      const x = W * 0.5 + u * breite;
      if (x < -4 || x > W + 4) continue;
      const w1 = Math.sin(u * 6.2 + t * 0.62 + d * 2.4);
      const w2 = Math.sin(u * 11.4 - t * 0.93 + d * 1.2) * 0.55;
      const w3 = Math.sin(u * 3.1 + t * 0.38 - d * 0.7) * 0.38;
      const h  = w1 + w2 + w3;                       // -1.93 … 1.93
      const y  = zeilenY + h * amp;
      if (y < -3 || y > H + 3) continue;
      const kamm = Math.max(0, Math.min(1, (h + 1.93) / 3.86));
      const gr = (0.6 + 1.25 * d) * (0.72 + 0.55 * kamm);
      // Auf dem Kamm laeuft der Punkt in die Spitzenfarbe, im Tal traegt er den
      // Akzent — so bekommt die Welle eine Kante, statt gleichmaessig zu leuchten.
      /* Hell greift die Spitzenfarbe FRUEHER: die Tinte muss den Kamm allein
         tragen (im Dunkeln hilft ihr der schwarze Grund dabei). Mit derselben
         schmalen Rampe wie dort blieb vom Kamm nur ein Saum. */
      const spitz = hell ? Math.max(0, (kamm - 0.42) / 0.58)
                         : Math.max(0, (kamm - 0.62) / 0.38);
      const R = Math.round(rgb[0] + (ziel[0] - rgb[0]) * spitz);
      const G = Math.round(rgb[1] + (ziel[1] - rgb[1]) * spitz);
      const B = Math.round(rgb[2] + (ziel[2] - rgb[2]) * spitz);
      /* Die Taeler muessen auf hellem Grund WEG. Mit der alten Grundhelligkeit
         (0.14) stand jeder Punkt gleich sichtbar da — das war der Punktteppich,
         der die Welle zugedeckt hat. Jetzt traegt fast nur noch der Kamm. */
      const a = (hell ? (0.015 + 0.66 * kamm) : (0.14 + 0.78 * kamm))
              * (0.32 + 0.68 * d) * dicht;
      ctx.fillStyle = 'rgba(' + R + ',' + G + ',' + B + ',' + a.toFixed(3) + ')';
      ctx.fillRect(x - gr / 2, y - gr / 2, gr, gr);
    }
  }
}
function _aicWaveLoop(){
  if (_AIC_WV.raf) return;
  const schritt = (jetzt) => {
    _AIC_WV.raf = 0;
    let offen = 0;
    for (let i = _AIC_WV.felder.length - 1; i >= 0; i--) {
      const f = _AIC_WV.felder[i];
      // Ausgehaengtes Canvas (Rerender) faellt raus — der neue Lauf startet
      // ueber _aicCardTap bzw. openCoachHub mit einem neuen Knoten.
      if (!f.cv || !f.cv.isConnected) { try { if (f.io) f.io.disconnect(); } catch(_) {} _AIC_WV.felder.splice(i, 1); continue; }
      if (f.ruht) continue;
      _aicWaveSize(f);
      _aicWaveDraw(f, (jetzt - _AIC_WV.t0) / 1000);
      offen++;
    }
    if (!_AIC_WV.felder.length) return;
    if (!offen) return;                                // alle ruhen: Wecken per Ereignis
    if (document.hidden) return;
    _AIC_WV.raf = requestAnimationFrame(schritt);
  };
  if (document.hidden) return;
  _AIC_WV.raf = requestAnimationFrame(schritt);
}
// Rueckkehr aus dem Hintergrund: die Schleife haelt bei document.hidden an und
// braucht diesen Anstoss, sonst bliebe das Feld nach dem Wiederaufwecken stehen.
document.addEventListener('visibilitychange', () => { if (!document.hidden) _aicWaveLoop(); });
// Beide Karten-Varianten hängen am selben Tap-Ziel: die Karte ist der EINZIGE
// Zugang zum Coach-Hub (Gestaltungsregel 1). Die Karte trägt seit dem Rückbau
// KEINEN Startknopf mehr — der Trainingsstart wohnt im Schnellstart-Widget und
// im Wochenplan, die Karte führt ausschliesslich in den Hub. Der
// closest("button, a")-Wächter bleibt trotzdem stehen: Kartentexte tragen
// gelegentlich Links, und ein Tipp darauf darf nicht im Hub landen.
function _aicCardTap(card) {
  if (!card) return;
  requestAnimationFrame(() => card.classList.add('in'));
  // Das Wellenfeld haengt am Canvas DIESER Karte: jeder Rerender tauscht den
  // Knoten, also startet der Lauf hier neu (und der alte wird abgeraeumt).
  _aicWaveStart(card);
  card.style.cursor = 'pointer';
  // Die Karte ist der EINZIGE Zugang zum Hub — als reines Tap-Ziel war er für
  // Tastatur und VoiceOver unerreichbar. role/tabindex/aria-label sitzen auf dem
  // KOPFBEREICH (.aic-top), nicht auf der ganzen Karte: der Kopf ist die Zeile
  // mit dem Winkel nach rechts, also die Stelle, die den Hub ankündigt. aria-label benennt
  // die AKTION statt des ganzen Kartentextes, damit die Vorlesestimme
  // "Coach-Menü öffnen" sagt und nicht den kompletten Empfehlungsblock.
  const top = card.querySelector('.aic-top') || card;
  top.setAttribute('role', 'button');
  top.setAttribute('tabindex', '0');
  top.setAttribute('aria-label', _cm('Coach-Menü öffnen', 'Open coach menu'));
  /* Druckzustand unter dem Finger. Bewusst in JS und nicht als :active im
     Stylesheet: :active greift auch auf Vorfahren des gedrückten Elements, die
     Karte schrumpfte also mit, sobald ein Kind-Element gedrückt wurde —
     genau die Flächen, die derselbe closest("button, a")-Wächter ausnimmt.
     Losgelassen wird auf jedem Weg (up, cancel, leave), sonst bliebe die Karte
     eingedrückt stehen. */
  const los = () => { try { card.classList.remove('press'); } catch(_) {} };
  card.onpointerdown = (ev) => {
    try { if (ev.target.closest('button, a')) return; card.classList.add('press'); }
    catch(_) {}
  };
  card.onpointerup = los;
  card.onpointercancel = los;
  card.onpointerleave = los;
  card.onclick = (ev) => {
    los();
    if (ev.target.closest('button, a')) return;
    try { if (typeof haptic === 'function') haptic(8); } catch(_) {}
    try { openCoachHub(); } catch(e) { console.warn('[Coach] Hub öffnen:', e); }
  };
  card.onkeydown = (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
    // Buttons und Links in der Karte behalten ihre eigene Taste.
    if (ev.target !== top && ev.target.closest('button, a')) return;
    ev.preventDefault();
    try { if (typeof haptic === 'function') haptic(8); } catch(_) {}
    try { openCoachHub(); } catch(e) { console.warn('[Coach] Hub öffnen:', e); }
  };
}
/* Die Coach-Karte ist ein WIDGET wie die anderen: sie liegt im Raster des
   Heute-Tabs und laesst sich in der Groesse ziehen. Was sie zeigt, haengt an
   dieser Groesse — eine Karte, die klein gezogen denselben Text traegt, ist
   nicht kleiner, sondern nur gedraengter:
     sm  Ring und Name. Wie weit bin ich erholt, mehr nicht.
     md  dazu die Schlagzeile des Tages und die Wochenzahl.
     lg  dazu der Satz vom Coach und die Chips (voller Umfang wie bisher). */
function _aicSize(host){
  try { return (host.closest('.hw') || {}).dataset?.size || 'lg'; } catch(_) { return 'lg'; }
}
function renderCoachTodayCard() {
  const host = document.getElementById('coach-today-card');
  if (!host) return;
  const groesse = _aicSize(host);
  const klein = groesse === 'sm', mittel = groesse === 'md';
  try {
    const s = _coachTodaySuggestion();
    if (!s) {
      // "Tagesempfehlung auf der Startseite" aus heißt: kein EMPFEHLUNGSINHALT
      // (Ring, Text, Chips, CTA) — die Karte selbst bleibt stehen, denn sie ist der
      // einzige Zugang zum Coach-Hub. Ohne diesen Zweig löschte der Schalter den
      // Zugang gleich mit und der Nutzer käme im Heute-Tab nicht mehr zum Coach.
      // Andere Gründe für null (kein Premium, ganz frisches Konto) lassen die
      // Fläche weiter leer — dort gibt es auch nichts zu öffnen.
      let stumm = false;
      try { stumm = !!(isPremium() && S.aiCoach && S.aiCoach.insights === false); } catch(_) {}
      if (!stumm) { host.innerHTML = ''; _aicSig = null; return; }
      const sigQ = 'quiet|' + groesse + '|' + _coachName();
      if (sigQ === _aicSig && host.firstElementChild) return;
      _aicSig = sigQ;
      host.innerHTML = `<div class="aic aic-${groesse}">
        <span class="aic-aur" aria-hidden="true"></span>
        <canvas class="aic-wv" aria-hidden="true"></canvas>
        <div class="aic-in">
          <div class="aic-top">
            <span class="aic-orb">${ICO.dumbbell({s:14})}</span>
            <span class="aic-lbl">${esc(_coachName())}</span>
            <span class="aic-go-hint" aria-hidden="true">${ICO.chevronRight({s:15})}</span>
          </div>
          ${klein ? '' : `<div class="aic-sub">${esc(tr('Tippen für Chat, Journal und Einstellungen.'))}</div>`}
        </div>
      </div>`;
      _aicCardTap(host.firstElementChild);
      return;
    }
    /* Die drei Zonen. Der Ring zeigt die nächste fällige Muskelgruppe statt
       eines Durchschnitts über alle — ein allgemeiner Wert sagt niemandem,
       was er heute tun soll. Fehlt jede Trainingsspur (ganz frisches Konto
       mit Plan), bleibt der bisherige Gesamtwert stehen. */
    const mg   = _aicNextMuscle();
    const week = _aicWeek();
    const satz = _aicSay();
    const pct  = mg ? mg.pct : Math.max(0, Math.min(100, Math.round(s.pct || 0)));
    const ringLbl = mg ? mg.label : (s.ringLbl || '');
    const wochenZeile = _aicWeekText(week);
    /* JEDER Wert, der auf der Karte steht, gehört in die Signatur — sonst
       hält der Cache die Karte fest und der geänderte Wert erscheint erst bei
       der nächsten Inhaltsänderung. Genau dieser Fehler ist in Task 8 mit dem
       Coach-Namen passiert; Ton, Einheit, Gruppe und Wochenzahl hängen jetzt
       mit drin. */
    const sig = [groesse, s.kind, s.head, s.chip2, ringLbl, pct, wochenZeile, satz,
                 _coachName(), unitLabel()].join('|');
    if (sig === _aicSig && host.firstElementChild) return;
    _aicSig = sig;

    const C   = 163.4;                       // Umfang r=26
    const off = C * (1 - pct / 100);
    const col = recoveryColor(pct);
    const ramp = _neonRamp(col);
    host.innerHTML = `<div class="aic aic-${groesse}">
      <span class="aic-aur" aria-hidden="true"></span>
      <canvas class="aic-wv" aria-hidden="true"></canvas>
      <span class="aic-sheen" aria-hidden="true"></span>
      <div class="aic-in">
        <div class="aic-top">
          <span class="aic-orb">${ICO.dumbbell({s:14})}</span>
          <span class="aic-lbl">${esc(_coachName())}</span>
          ${klein ? '' : `<span class="aic-live"><i></i>${esc(s.chip)}</span>`}
          <span class="aic-go-hint" aria-hidden="true">${ICO.chevronRight({s:15})}</span>
        </div>
        <div class="aic-main">
          <div class="aic-left">
            <div class="aic-ringbox">
              <svg viewBox="0 0 64 64" width="62" height="62" aria-hidden="true" focusable="false">
                <defs>
                  <!-- Zwei Verlaeufe wie bei den Wochenziel-Ringen: der scharfe
                       Bogen glueht zum Ende hin aus, Hof und Wolke bleiben voll
                       gesaettigt. Die IDs tragen den Prozentwert, weil dieselbe
                       Karte in mehreren Groessen im Dokument stehen kann und
                       zwei gleiche IDs beide auf den ersten Verlauf zeigen. -->
                  <linearGradient id="aicg${pct}" x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0" stop-color="${ramp.c1}"/><stop offset="1" stop-color="${ramp.c2}"/>
                  </linearGradient>
                  <linearGradient id="aicg${pct}-g" x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0" stop-color="${ramp.g1}"/><stop offset="1" stop-color="${ramp.g2}"/>
                  </linearGradient>
                  <!-- Neon-Schein, identisch zu den Wochenziel-Ringen: drei
                       Unschaerfen uebereinander, Region gross genug gesetzt. -->
                  <filter id="aicg${pct}-f" x="-120%" y="-120%" width="340%" height="340%"
                          color-interpolation-filters="sRGB">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="n"/>
                    <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="m"/>
                    <feGaussianBlur in="SourceGraphic" stdDeviation="7.5" result="w"/>
                    <feMerge>
                      <feMergeNode in="w"/>
                      <feMergeNode in="m"/>
                      <feMergeNode in="n"/><feMergeNode in="n"/>
                    </feMerge>
                  </filter>
                </defs>
                <circle class="aic-r-bg" cx="32" cy="32" r="26"/>
                <!-- Derselbe Bogen zweimal DARUNTER: weit und diffus als Wolke,
                     eng und satt als Hof. Der scharfe Bogen darueber traegt den
                     hellen Verlauf. -->
                <circle class="aic-r-glow" cx="32" cy="32" r="26" filter="url(#aicg${pct}-f)" style="stroke:url(#aicg${pct}-g);stroke-dasharray:${C};stroke-dashoffset:${off.toFixed(1)};--aic-off:${off.toFixed(1)}"/>
                <circle class="aic-r-halo" cx="32" cy="32" r="26" style="stroke:url(#aicg${pct}-g);stroke-dasharray:${C};stroke-dashoffset:${off.toFixed(1)};--aic-off:${off.toFixed(1)}"/>
                <circle class="aic-r-fg" cx="32" cy="32" r="26" style="stroke:url(#aicg${pct});stroke-dasharray:${C};stroke-dashoffset:${off.toFixed(1)};--aic-off:${off.toFixed(1)}"/>
              </svg>
              <div class="aic-r-val" style="color:${_neonInk(col)}">${pct}<span>%</span></div>
            </div>
            ${ringLbl ? `<div class="aic-r-lbl">${esc(ringLbl)}</div>` : ''}
          </div>
          <!-- Was HEUTE ansteht trägt die große Schrift, die Wochenzahl steht
               kleiner darunter: die sichtbarste Zeile der Startseite gehört der
               Handlungsaufforderung, nicht einer Kennzahl. In der kleinsten
               Stufe faellt der Block ganz weg — dort steht nur der Ring. -->
          ${klein ? '' : `<div class="aic-txt">
            <div class="aic-head">${esc(s.head)}</div>
            ${wochenZeile ? `<div class="aic-sub">${esc(wochenZeile)}</div>` : ''}
          </div>`}
        </div>
        ${(!klein && !mittel && satz) ? `<div class="aic-say">${esc(satz)}</div>` : ''}
        ${(!klein && !mittel && s.chip2) ? `<div class="aic-chips"><span class="aic-chip">${ICO.bolt({s:11})}${esc(s.chip2)}</span></div>` : ''}
      </div>
    </div>`;
    _aicCardTap(host.firstElementChild);
  } catch(e) { console.warn('[Coach] today card render:', e); host.innerHTML = ''; }
}
// Altlast: wer die Karte früher weggeklickt hat, trägt den Ausblend-Schlüssel noch
// im localStorage. Einmal entfernen, sonst bliebe die Karte beim Update weiterhin weg.
try { localStorage.removeItem('gt_coachTodayDismiss'); } catch(_) {}
// Kompakte History für Heute-Tab (erweiterbar)
let _compactHistOpen = false;

function renderCompactHistory(el) {
  el = el || document.getElementById('history-card');
  if (!el) return;
  const size = el.closest('.hw')?.dataset.size || 'lg';
  if (!S.sessions.length) {
    el.innerHTML = `<div style="padding:13px 16px;color:var(--text2);font-size:14px;position:relative;z-index:1${size==='sm'?';text-align:center':''}">Noch kein Training</div>`;
    return;
  }
  const sessions = [...S.sessions].sort((a,b) => new Date(b.date)-new Date(a.date));
  const last = sessions[0];
  const rest = sessions.slice(1, 4);
  const fmt   = s => new Date(s.date).toLocaleDateString(GT_LOCALE,{weekday:'short',day:'numeric',month:'short'});
  const sets  = s => s.logs.reduce((n,l)=>n+l.sets.length,0);
  const label = s => { const lbl = deriveTrainingLabel(s); return lbl ? `<span class="last-train-tag">${lbl}</span>` : ''; };

  // Quadratisch (sm): nur die wichtigste Info — letztes Training kompakt
  // Quadrat (sm) & Rechteck (md): kompakt — letzte Einheit (Sätze + Datum)
  if (size === 'sm' || size === 'md') {
    el.innerHTML = `<div class="hist-${size}" onclick="openSessDetail('${last.id}')">
      <div class="hw-big" style="font-size:${size==='sm'?'26px':'22px'}">${sets(last)}</div>
      <div class="hw-sub">Sätze</div>
      <div class="hw-sub" style="margin-top:1px">${fmt(last)}</div>
    </div>`;
    return;
  }

  // Sub-Zeilen mit Swipe-to-Delete
  const row = (s, border) => `
    <div class="ch-swipe-wrap"${border?' style="border-top:1px solid var(--sep)"':''}>
      <div class="last-swipe-inner" data-ses="${s.id}">
        <div class="last-swipe-row" style="padding:10px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;position:relative;z-index:1" onclick="openSessDetail('${s.id}')">
          <div>
            <div style="font-size:13px;font-weight:600">${fmt(s)}${label(s)}</div>
            <div style="font-size:11px;color:var(--text2);margin-top:1px">${s.logs.length} Übung${s.logs.length===1?'':'en'}</div>
          </div>
          <span class="badge b-green">${sets(s)} Sätze</span>
        </div>
        <div class="last-swipe-del" onclick="deleteSession('${s.id}')">🗑</div>
      </div>
    </div>`;

  // Hauptzeile: Klick auf Zeile → Detail öffnen; Klick auf Pfeil → Dropdown togglen
  const chevRot = _compactHistOpen ? 'rotate(90deg)' : 'rotate(0deg)';
  const hasMore = rest.length > 0;
  let html = `<div class="ch-swipe-wrap">
    <div class="last-swipe-inner" data-ses="${last.id}">
      <div class="last-swipe-row" style="padding:12px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;position:relative;z-index:1" onclick="openSessDetail('${last.id}')">
        <div>
          <div style="font-size:14px;font-weight:600">${fmt(last)}${label(last)}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:1px">${last.logs.length} Übung${last.logs.length===1?'':'en'}</div>
        </div>
        <div style="display:flex;align-items:center;gap:4px">
          <span class="badge b-green">${sets(last)} Sätze</span>
          ${hasMore ? `<span ontouchstart="event.stopPropagation()" onclick="event.stopPropagation();toggleCompactHistory()" style="color:var(--text2);font-size:20px;display:inline-block;transition:transform .25s;transform:${chevRot};padding:4px 6px;cursor:pointer">›</span>` : ''}
        </div>
      </div>
      <div class="last-swipe-del" onclick="deleteSession('${last.id}')">🗑</div>
    </div>
  </div>`;

  if (hasMore && _compactHistOpen) {
    html += rest.map(s => row(s, true)).join('');
  }
  el.innerHTML = html;
  initCompactHistSwipe();
}

function toggleCompactHistory() {
  const sessions = [...(S.sessions||[])];
  if (sessions.length < 2) { openSessDetail(sessions[0]?.id); return; }
  _compactHistOpen = !_compactHistOpen;
  renderCompactHistory();
  haptic && haptic(8);
}

// ── SESSION DETAIL / BEARBEITEN ───────────────────────
let _sessDetailId = null;

