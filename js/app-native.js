function muscleLabel(id) {
  const g = MUSCLE_GROUPS.find(g => g.id === id);
  if (g) return g.label;
  for (const mode of GROUP_MODES) {
    const grp = mode.groups.find(g => g.id === id);
    if (grp) return grp.label;
  }
  for (const cs of (S.customSplits || [])) {
    const grp = (cs.groups || []).find(g => g.id === id);
    if (grp) return grp.label + ' · ' + cs.label;
  }
  return '';
}

/* ── FILTER-MODI im Übungen-Tab ──
   Jede Gruppe enthält 'muscles': null = alle Übungen, sonst Array von MUSCLE_GROUPS.id */
const GROUP_MODES = [
  {
    id:'muskel', label:'Muskeln',
    groups:[
      { id:'alle',      label:'Alle',      muscles:null },
      { id:'brust',     label:'Brust',     muscles:['brust'] },
      { id:'ruecken',   label:'Rücken',    muscles:['ruecken'] },
      { id:'beine',     label:'Beine',     muscles:['beine'] },
      { id:'arme',      label:'Arme',      muscles:['arme'] },
      { id:'schultern', label:'Schultern', muscles:['schultern'] },
      { id:'core',      label:'Core',      muscles:['core'] },
    ]
  },
  {
    id:'ppl', label:'Push · Pull · Legs',
    groups:[
      { id:'alle', label:'Alle',  muscles:null },
      { id:'push', label:'Push',  muscles:['brust','schultern','arme','push'] },
      { id:'pull', label:'Pull',  muscles:['ruecken','arme','pull'] },
      { id:'legs', label:'Legs',  muscles:['beine','legs'] },
      { id:'core', label:'Core',  muscles:['core'] },
    ]
  },
  {
    id:'oberunter', label:'Ober · Unter',
    groups:[
      { id:'alle',  label:'Alle',        muscles:null },
      { id:'ober',  label:'Oberkörper',  muscles:['brust','ruecken','arme','schultern','core','ober'] },
      { id:'unter', label:'Unterkörper', muscles:['beine','unter'] },
    ]
  },
];
if (GT_LANG === 'en') {
  const _GM_EN = { alle:'All', brust:'Chest', ruecken:'Back', beine:'Legs', arme:'Arms', schultern:'Shoulders', core:'Core', ober:'Upper body', unter:'Lower body' };
  GROUP_MODES.forEach(m => {
    if (m.id === 'muskel') m.label = 'Muscles';
    if (m.id === 'oberunter') m.label = 'Upper · Lower';
    m.groups.forEach(g => { if (_GM_EN[g.id]) g.label = _GM_EN[g.id]; });
  });
}
function allModes() {
  const custom = (S.customSplits || []).map(s => ({
    id: s.id,
    label: s.label,
    isCustom: true,
    groups: [{ id:'alle', label: GT_LANG === 'en' ? 'All' : 'Alle', muscles:null }, ...(s.groups || []).map(g => ({ id:g.id, label:g.label, muscles:g.muscles }))]
  }));
  return [...GROUP_MODES, ...custom];
}
function modeById(id) { return allModes().find(m => m.id === id) || allModes()[0]; }
function currentMode()  { return modeById(S.exFilterMode); }
function currentGroup() { const m = currentMode(); return m.groups.find(g => g.id === exCatFilter) || m.groups[0]; }

/* ── SPLIT-ZUGEHÖRIGKEIT (pro Modus, unabhängig) ──
   Übungen tragen ex.groups = { [modeId]: [groupId,...] }. Fehlt der Eintrag
   (Altdaten oder noch nicht migriert), wird aus ex.muscleGroup abgeleitet. */
function _deriveGroupIds(ex, mode) {
  return mode.groups
    .filter(g => g.muscles && g.muscles.includes(ex.muscleGroup))
    .map(g => g.id);
}
function exInGroup(ex, modeId, groupId) {
  if (!ex) return false;
  if (groupId === 'alle') return true;
  const mode = modeById(modeId);
  const explicit = ex.groups && ex.groups[modeId];
  if (Array.isArray(explicit)) return explicit.includes(groupId);
  // Fallback: aus muscleGroup ableiten
  const g = mode.groups.find(g => g.id === groupId);
  return !!(g && g.muscles && g.muscles.includes(ex.muscleGroup));
}
// groupId ist über alle Modi eindeutig → passenden Modus auflösen, dann prüfen
function exInNamedGroup(ex, groupId) {
  if (groupId === 'alle') return true;
  for (const m of allModes()) {
    if (m.groups.some(g => g.id === groupId)) return exInGroup(ex, m.id, groupId);
  }
  return false;
}
// Sichert, dass ex.groups für alle aktuellen Modi befüllt ist (Migration/Lazy)
function ensureExGroups(ex) {
  if (!ex.groups || typeof ex.groups !== 'object') ex.groups = {};
  for (const m of allModes()) {
    if (!Array.isArray(ex.groups[m.id])) ex.groups[m.id] = _deriveGroupIds(ex, m);
  }
  return ex.groups;
}

/* ── Einheiten (kg / lbs) ── */
const LBS_PER_KG = 2.20462;
function unitLabel() { return S.unitMode === 'lbs' ? 'lbs' : 'kg'; }
function kgToDisp(v) {
  if (v === '' || v == null || isNaN(parseFloat(v))) return v;
  const n = parseFloat(v);
  if (S.unitMode === 'lbs') return Math.round(n * LBS_PER_KG * 2) / 2;
  return n;
}
function dispToKg(v) {
  if (v === '' || v == null || isNaN(parseFloat(v))) return v;
  const n = parseFloat(v);
  if (S.unitMode === 'lbs') return Math.round((n / LBS_PER_KG) * 10) / 10;
  return n;
}
function fmtWeight(v) {
  if (v === '' || v == null || isNaN(parseFloat(v))) return '–';
  const d = kgToDisp(v);
  return d + ' ' + unitLabel();
}
function setUnitMode(m) {
  if (m !== 'kg' && m !== 'lbs') return;
  S.unitMode = m;
  persist();
  document.querySelectorAll('[data-unit-btn]').forEach(b => {
    b.classList.toggle('on', b.dataset.unitBtn === m);
  });
  if (typeof renderExList === 'function') renderExList();
  if (typeof renderHome === 'function') renderHome();
  if (typeof renderLogCards === 'function' && isWorkoutActive && isWorkoutActive()) renderLogCards();
}

/* ── BEGLEITER ── */
const COMPANIONS = [
  { id:'dackel', name:'Dackel',   emoji:'🐕', desc:'Der treue Klassiker',   available:true  },
  { id:'katze',  name:'Katze',    emoji:'🐱', desc:'Bald verfügbar',        available:false },
  { id:'hase',   name:'Hase',     emoji:'🐰', desc:'Bald verfügbar',        available:false },
  { id:'fuchs',  name:'Fuchs',    emoji:'🦊', desc:'Bald verfügbar',        available:false },
  { id:'baer',   name:'Bär',      emoji:'🐻', desc:'Bald verfügbar',        available:false },
  { id:'pinguin',name:'Pinguin',  emoji:'🐧', desc:'Bald verfügbar',        available:false },
];

let _iconCatIdx = 0;

function openIconPicker() {
  /* Leiste + Dackel ausblenden damit das Sheet vollen Platz hat */
  document.querySelector('.tabbar').style.opacity   = '0';
  document.querySelector('.tabbar').style.pointerEvents = 'none';
  document.getElementById('dackel-lane').style.opacity = '0';
  _iconCatIdx = 0;
  renderIconCatBar();
  renderIconFullGrid();
  openOv('ov-icons');
}

function closeIconPicker() {
  /* Leiste + Dackel wiederherstellen */
  document.querySelector('.tabbar').style.opacity   = '';
  document.querySelector('.tabbar').style.pointerEvents = '';
  document.getElementById('dackel-lane').style.opacity = '';
  closeOv('ov-icons');
}

function renderIconCatBar() {
  document.getElementById('icon-cats').innerHTML = ICON_CATS.map((c,i) =>
    `<button class="icat${i===_iconCatIdx?' on':''}" onclick="selectIconCat(${i})">${c.label}</button>`
  ).join('');
}

function selectIconCat(i) {
  _iconCatIdx = i;
  renderIconCatBar();
  renderIconFullGrid();
}

function renderIconFullGrid() {
  const icons = ICON_CATS[_iconCatIdx].icons;
  document.getElementById('icon-full-grid').innerHTML = icons.map(e =>
    `<button class="emo-btn${e===selEmoji?' on':''}" onclick="pickIconFromPicker('${e}')">${e}</button>`
  ).join('');
}

function pickIconFromPicker(e) {
  pickEmo(e);
  closeIconPicker();
}

let S = (() => {
  try { return JSON.parse(localStorage.getItem('ft4') || '{}'); } catch(e) { return {}; }
})();
S.exercises  = S.exercises  || [];
S.sessions   = S.sessions   || [];
S.theme      = S.theme      || 'dark';   // Standard: Darkmode mit Glas
S.glass      = S.glass !== undefined ? S.glass : true;
S.companion   = S.companion   || 'dackel';
S.companionOn = false; // Begleiter-Feature entfernt — immer aus
S.exFilterMode = S.exFilterMode || 'muskel';
S.wkFilterMode = S.wkFilterMode || 'muskel';
S.statsFilterMode = S.statsFilterMode || 'muskel';
S.unitMode    = S.unitMode    || 'kg';   // 'kg' | 'lbs'
S.customSplits = Array.isArray(S.customSplits) ? S.customSplits : []; // [{id,label,groups:[{id,label,muscles:[]}]}]
S.workoutPresets = Array.isArray(S.workoutPresets) ? S.workoutPresets : []; // [{id,name,exIds:[]}] – fertige Trainingspläne fürs Schnellstart
// Split-Zugehörigkeit pro Übung migrieren: ex.groups = {modeId:[groupId,...]}.
// Einmalig aus muscleGroup ableiten → bisheriges Verhalten bleibt erhalten, danach unabhängig editierbar.
S.exercises.forEach(ex => ensureExGroups(ex));
// Wochenplan: pro Tag {type:'none'|'group'|'exercises', group?:string, exIds?:string[]}
S.weekPlan = S.weekPlan || { mon:{type:'none'}, tue:{type:'none'}, wed:{type:'none'}, thu:{type:'none'}, fri:{type:'none'}, sat:{type:'none'}, sun:{type:'none'} };
['mon','tue','wed','thu','fri','sat','sun'].forEach(k => { if (!S.weekPlan[k]) S.weekPlan[k] = {type:'none'}; });
S.notifEnabled    = S.notifEnabled    || false;
S.notifTime       = S.notifTime       || '08:00';
S.restTimerSecs   = S.restTimerSecs   || 90;     // manuelle Standard-Satzpause
S.smartRest       = S.smartRest !== undefined ? S.smartRest : true; // Pausenintelligenz an
S.healthKitEnabled = S.healthKitEnabled || false;
S.trackerItems  = S.trackerItems  || [];
S.trackerCounts = S.trackerCounts || {};
// Erfolge: bereits erreichte Meilensteine merken. Bestehende Nutzer werden NICHT
// rückwirkend gefeiert – ihre aktuell erfüllten Meilensteine gelten als „bekannt".
if (!Array.isArray(S.erfAchieved)) {
  // Meilensteine sind entfernt; das Feld bleibt leer bestehen, damit Sync und
  // Rules unveraendert weiterlaufen.
  S.erfAchieved = [];
}
S.weightLog     = S.weightLog     || []; // [{date:'YYYY-MM-DD', weight:80.5}]
S.weightStart   = S.weightStart   ?? null; // Startgewicht (einmalig)
S.weightGoal    = S.weightGoal    ?? null; // Zielgewicht
// heuteLayout: null = Default-Layout verwenden
if (S.heuteLayout !== undefined && !Array.isArray(S.heuteLayout)) S.heuteLayout = null;
// Onboarding + Community
S.onboarded = S.onboarded || false;
S.userName  = S.userName  || '';
S.socialOn  = S.socialOn  || false;
S.friends   = Array.isArray(S.friends) ? S.friends : []; // UIDs der Freunde
S.blocked   = Array.isArray(S.blocked) ? S.blocked : []; // blockierte UIDs (nur lokal)
// Privatsphäre: was Freunde sehen dürfen (alles einzeln schaltbar)
S.privacy = Object.assign({ gym:true, live:true, lastWk:true, stats:true, prs:false, feed:true }, S.privacy || {});
// KI-Coach-Feature-Toggles (Premium) — bewusst geräte-lokal wie S.privacy, kein Cloud-Sync-Feld.
// preset fehlt hier absichtlich: solange es undefined ist, holt der Hub die
// Einrichtung nach. 'custom' und 'quiet' sind gültige Werte und lösen sie nicht aus.
/* EINE Quelle für die Voreinstellung (Task 22): der Start hier UND die
   Datentrennung beim Kontowechsel (_coachWipeLocal) setzen dieselben Werte.
   Zwei getrennte Listen liefen beim ersten neuen Feld auseinander — und ein
   Feld, das die Trennung vergisst, trägt den Coach des vorigen Kontos weiter.
   Die Fabrik gibt jedes Mal ein FRISCHES Objekt: eine geteilte Referenz würde
   beim ersten setAiCoachOpt() die Voreinstellung selbst umschreiben. */
const COACH_PERSONA_DEFAULTS = Object.freeze({
  live:true, insights:true,
  name:'', tone:'sachlich', voice:null, voiceOn:true,
  inTraining:'key', setFeedback:true, pushLevel:'normal'
});
function _coachPersonaDefaults(){ return Object.assign({}, COACH_PERSONA_DEFAULTS); }
/* Die Persona in der Form, die in die Cloud geht (s. _pushToCloud). Der
   JSON-Rundlauf ist kein Zierrat: ein Schluessel mit dem Wert undefined laesst
   Firestore den KOMPLETTEN Push abweisen, und der Fehler stirbt dort in einem
   catch — die App verlöre still jede weitere Sicherung. */
function _coachCloudPersona(){
  try { return S.aiCoach ? JSON.parse(JSON.stringify(S.aiCoach)) : null; }
  catch(e) { console.warn('[Coach] Persona für die Cloud:', e); return null; }
}
/* Ist das ueberhaupt eine Persona? preset === undefined heisst in dieser App an
   jeder Stelle dasselbe: die Einrichtung steht noch aus (der Hub startet dann
   den Assistenten). Fuer die Zusammenfuehrung ist genau das "nicht gesetzt" —
   siehe die Begruendung in _mergeData. */
function _coachPersonaGesetzt(o){
  return (o && typeof o === 'object' && o.preset !== undefined) ? o : null;
}
// Fingerabdruck der Persona. Reicht, um nach einem Cloud-Merge zu entscheiden,
// ob die Coach-Flaechen nachgezogen werden muessen — _dataSig() kennt aiCoach
// bewusst nicht (kein voller Rerender der Startseite fuer einen Namen).
function _coachPersonaSig(){
  try { return JSON.stringify(S.aiCoach || null); } catch(_) { return String(Math.random()); }
}
// Termin des Wochenberichts, ebenfalls als Fabrik: die Zeilen unten schreiben
// day/hour direkt auf das Objekt.
function _coachReportAtDefault(){ return { day:0, hour:18 }; }
S.aiCoach = Object.assign(_coachPersonaDefaults(), S.aiCoach || {});
// Ungültige Werte aus älteren oder fremden Ständen normalisieren. _persona() tut
// das beim LESEN, die Felder selbst blieben bisher krumm — wer S.aiCoach direkt
// anfasst (die Invariante darunter, der live-Schalter, _coachPresetMatches),
// traf dann auf 'laut' oder 'dauernd'. Name und preset bleiben absichtlich roh:
// safeName('') wäre 'Coach' — ein Name, den der Nutzer nie gewählt hat — und ein
// ungültiges preset soll die Einrichtung auslösen, nicht stillschweigend zu
// einem Profil werden.
try {
  const _cpNorm = CoachPersona.personaGet(S.aiCoach);
  S.aiCoach.tone       = _cpNorm.tone;
  S.aiCoach.inTraining = _cpNorm.inTraining;
  S.aiCoach.pushLevel  = _cpNorm.pushLevel;
} catch(e) { console.warn('[Coach] Normalisierung beim Start:', e); }
// Invariante: live !== false ⟺ inTraining !== 'off'. Vier Stellen im Training
// fragen die Stufe ab; wer nur eine der beiden Seiten setzt, umgeht sie.
// Bestandsnutzer, die den Live-Coach abgeschaltet hatten, bleiben abgeschaltet —
// sonst fängt der Coach nach dem Update ungefragt wieder an zu reden.
if (S.aiCoach.live === false) S.aiCoach.inTraining = 'off';
else if (S.aiCoach.inTraining === 'off') S.aiCoach.live = false;
else S.aiCoach.live = true;
// Post-Workout-Check-ins (Phase E): [{sid, d, feel:1-4, en:1-3}], auf 400 Einträge gedeckelt.
if (!S.checkins) S.checkins = [];
// Proaktive Meldungen (Block 4): Zustand des Frequenz-Deckels (state) plus die
// zuletzt geplanten Termine (plan) und der zuletzt gesehene Berechtigungsstand.
// Bewusst GERÄTE-LOKAL: _pushCloud() zählt seine Felder einzeln auf, coachPush
// steht dort nicht — kein zweiter Firestore-Schreibpfad, firestore.rules
// unangetastet. Zwei Geräte dürfen sich ihre Zähler auch gar nicht gegenseitig
// überschreiben: gemeldet wird auf dem Gerät, nicht im Konto.
if (!S.coachPush || typeof S.coachPush !== 'object' || Array.isArray(S.coachPush)) S.coachPush = { state:null, plan:[], permOk:false, owns:false };
if (!Array.isArray(S.coachPush.plan)) S.coachPush.plan = [];
/* Wochenbericht (Block 5): das Archiv der letzten acht Wochen und der Termin,
   an dem der Bericht fällig ist (day 0 = Sonntag, hour = volle Ortszeit-Stunde).
   Ebenfalls bewusst GERÄTE-LOKAL: _pushToCloud() zählt seine Felder einzeln
   auf, coachReports steht dort nicht — kein zweiter Firestore-Schreibpfad,
   firestore.rules unangetastet. Die Zahlen einer Woche gehören außerdem auf das
   Gerät, auf dem sie entstanden sind; zwei Geräte dürften sie sich nicht
   gegenseitig überschreiben.
   Beide Felder werden hier normalisiert, nicht erst beim Lesen: ein krummer
   Wert aus einem älteren Stand ergäbe sonst einen Termin, der nie eintritt. */
if (!Array.isArray(S.coachReports)) S.coachReports = [];
if (!S.coachReportAt || typeof S.coachReportAt !== 'object' || Array.isArray(S.coachReportAt)) S.coachReportAt = _coachReportAtDefault();
S.coachReportAt.day  = (Math.floor(Number(S.coachReportAt.day))  >= 0 && Math.floor(Number(S.coachReportAt.day))  <= 6)  ? Math.floor(Number(S.coachReportAt.day))  : 0;
S.coachReportAt.hour = (Math.floor(Number(S.coachReportAt.hour)) >= 0 && Math.floor(Number(S.coachReportAt.hour)) <= 23) ? Math.floor(Number(S.coachReportAt.hour)) : 18;

let persist = () => {
  localStorage.setItem('ft4', JSON.stringify(S));
  _updateWidgetData();
};

// ── COACH-PERSONA: der dünne Wrapper um js/coach-persona.js ──────────
// Das Modul kennt keine App-Globals, Persona und Sprache müssen hereinkommen.
// Die Spec schreibt say(key, vars) — genau diese Kurzform sehen die
// Aufrufstellen dank _say(). Jeder Helfer fällt im Fehlerfall auf den Standard
// zurück: ein Fehler im Coach darf nie das laufende Training abbrechen.
function _persona() {
  try { return CoachPersona.personaGet(S.aiCoach); }
  catch(_) { try { return CoachPersona.personaGet({}); } catch(__) { return { name:'Coach', tone:'sachlich', voice:null, voiceOn:true, inTraining:'key', setFeedback:true, pushLevel:'normal', insights:true }; } }
}
function _lang() { try { return GT_LANG === 'en' ? 'en' : 'de'; } catch(_) { return 'de'; } }
/* Der Uebungsname im Katalogsatz ist derselbe Name, der zwei Zeilen tiefer auf
   der Uebungskarte steht — also der ANZEIGE-Name. Intern heisst die Uebung
   weiter deutsch ('Kreuzheben'), die Karte zeigt im englischen Modus aber
   'Deadlift'; ohne diese Stelle stand in der Coach-Leiste 'Kreuzheben: last
   session 180 kg' ueber einer Karte mit der Aufschrift 'Deadlift'. tr() ist
   genau die Abbildung, die auch die Karte benutzt, und im deutschen Modus
   gibt sie den Namen unveraendert zurueck. */
function _exDisp(name) {
  if (typeof name !== 'string' || !name) return name;
  try { return tr(name) || name; } catch(_) { return name; }
}
/* Gegenstueck: eine Uebung ueber IRGENDEINEN ihrer Namen finden. Das Modell
   bekommt die Anzeige-Namen und antwortet mit ihnen; gespeichert ist der
   deutsche. Ohne diesen Vergleich legt ein Plan-Import oder eine 'addEx'-
   Aktion eine zweite Uebung ohne Historie an, obwohl es dieselbe ist. */
function _exFindByAnyName(nm) {
  const s = String(nm || '').trim().toLowerCase();
  if (!s) return null;
  try {
    return (S.exercises || []).find(e => {
      const n = String((e && e.name) || '').trim().toLowerCase();
      return n === s || String(_exDisp(e && e.name) || '').trim().toLowerCase() === s;
    }) || null;
  } catch(_) { return null; }
}
function _say(key, vars) {
  try {
    const v = Object.assign({}, vars || {});
    if (typeof v.ex === 'string') v.ex = _exDisp(v.ex);
    return CoachPersona.say(key, v, _persona(), _lang());
  } catch(_) { return ''; }
}
function _coachName()  { return _persona().name; }
function _coachLevel() { return _persona().inTraining; }

// ── GLASS 2.0: CHART-DESIGN (globale Defaults + weiche Verläufe) ──
if (window.Chart) {
  const C = window.Chart;
  C.defaults.font.family = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',sans-serif";
  C.defaults.font.size = 11;
  C.defaults.font.weight = '600';
  C.defaults.animation.duration = 850;
  C.defaults.animation.easing = 'easeOutQuart';
  C.defaults.elements.line.borderCapStyle = 'round';
  C.defaults.elements.line.borderJoinStyle = 'round';
  C.defaults.elements.bar.borderRadius = 7;
  C.defaults.elements.bar.borderSkipped = false;
  C.defaults.plugins.tooltip.backgroundColor = 'rgba(24,24,32,.88)';
  C.defaults.plugins.tooltip.titleFont = {size:11, weight:'600'};
  C.defaults.plugins.tooltip.bodyFont = {size:13, weight:'700'};
  C.defaults.plugins.tooltip.cornerRadius = 10;
  C.defaults.plugins.tooltip.padding = 10;
  C.defaults.plugins.tooltip.displayColors = false;
  C.defaults.plugins.legend.labels.boxWidth = 8;
  C.defaults.plugins.legend.labels.usePointStyle = true;
  C.defaults.interaction = { mode: 'index', intersect: false };
  C.defaults.elements.point.hitRadius = 14;
  C.defaults.elements.point.hoverRadius = 5;
}
// Vertikaler Akzent-Verlauf als Flächenfüllung unter Linien-Charts
function _accFill(canvas, hex, aTop) {
  try {
    const ctx = canvas.getContext('2d');
    const h = canvas.clientHeight || canvas.height || 220;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    /* Auf Dunkel ist die Flaeche unter der Kurve praktisch unsichtbar (1,03),
       auf Weiss traegt dieselbe Deckkraft deutlich — und weil die Fuellung am
       letzten Punkt endet, entsteht rechts eine senkrechte Schnittkante, die
       sich als Rechteck liest statt als Auslaufen. Hell deshalb schwaecher.
       _neonHell() wohnt in app-plans.js und wird SPAETER geladen; der Aufruf
       hier passiert zur Laufzeit, der Waechter deckt nur den Fall ab, dass
       jemand _accFill frueher aufruft. */
    const hell = (typeof _neonHell === 'function') ? _neonHell()
               : (document.documentElement.getAttribute('data-theme') !== 'dark');
    g.addColorStop(0, hex + (aTop || (hell ? '26' : '3D')));
    g.addColorStop(.55, hex + (hell ? '0D' : '14'));
    g.addColorStop(1, hex + '00');
    return g;
  } catch(e) { return hex + '22'; }
}

// ── GLASS 2.0: ANIMIERTE FLAMME (ersetzt 🔥 in Streak-Badge + Detail) ──
// Eindeutige Gradient-IDs pro Instanz: url(#…) auf ein SVG in einem
// display:none-Tab (z. B. Badge im versteckten Heute-Tab) rendert sonst schwarz.
let _flameN = 0;
function _flameSVG(px, embers) {
  const w = px, h = Math.round(px * 1.18);
  const u = 'flg' + (_flameN++);
  return `<span class="fl" style="width:${w}px;height:${h}px">` +
    (embers ? `<i class="fl-ember" style="--ember-x:6px"></i><i class="fl-ember" style="--ember-x:-7px"></i><i class="fl-ember" style="--ember-x:3px"></i>` : '') +
    `<svg viewBox="0 0 24 28" width="${w}" height="${h}" aria-hidden="true">
      <defs>
        <linearGradient id="${u}A" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#FFB340"/><stop offset=".55" stop-color="#FF7A00"/><stop offset="1" stop-color="#FF3B30"/>
        </linearGradient>
        <linearGradient id="${u}B" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#FFE066"/><stop offset="1" stop-color="#FF9500"/>
        </linearGradient>
      </defs>
      <path class="fl-outer" fill="url(#${u}A)" d="M12 1.5c.6 3.4-1 5.6-2.9 7.8C7 11.7 4.8 14 4.8 17.4c0 4.8 3.3 8.6 7.2 8.6s7.2-3.8 7.2-8.6c0-2.6-1.2-4.6-2.5-6.5-.5-.8-1.6-.7-2 .2-.3.7-.7 1.3-1.3 1.7.5-3.9-1.5-8.3-1.4-11.3z"/>
      <path class="fl-inner" fill="url(#${u}B)" d="M12 9.2c.3 2-.6 3.3-1.7 4.6-1.1 1.4-2.3 2.8-2.3 4.8 0 3 2 5.4 4 5.4s4-2.4 4-5.4c0-1.6-.7-2.9-1.5-4.1-.3-.5-1-.4-1.2.1-.2.4-.4.8-.8 1.1.3-2.4-.7-4.7-.5-6.5z"/>
      <ellipse class="fl-core" fill="#FFF7E0" cx="12" cy="21.6" rx="2.3" ry="3"/>
    </svg></span>`;
}

// ── CAPACITOR NATIVE PLUGINS ───────────────────────────────
const _isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform?.());
const _cap = (name) => _isNative() ? window.Capacitor?.Plugins?.[name] : null;
// iOS-Standalone-PWA (Homescreen): hier ist signInWithPopup blockiert → GIS nötig.
// Alle anderen Web-Browser (Desktop/Android) nutzen das zuverlässige signInWithPopup.
const _isIosStandalonePWA = () =>
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
   (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) &&
  (window.navigator.standalone === true ||
   window.matchMedia?.('(display-mode: standalone)').matches);

// Widget-Daten an iOS-Widget senden (debounced; immediate=true beim App-Verlassen)
let _widgetDebounce = null;
function _updateWidgetData(immediate) {
  if (!_isNative()) return;
  clearTimeout(_widgetDebounce);
  if (immediate) { _pushWidgetData(); return; }
  _widgetDebounce = setTimeout(_pushWidgetData, 800);
}
// Plan-Label für einen Wochentag ('mon'…'sun') — wie die Heute-Anzeige
function _planLabelFor(dayKey) {
  const p = typeof planFor === 'function' ? planFor(dayKey) : null;
  if (p?.type === 'preset' && p.id) { const pr = presetById(p.id); return pr ? tr(pr.name) : ''; }
  if (p?.type === 'group' && p.group) return tr(p.group);
  if (p?.type === 'exercises' && p.exIds?.length) {
    return p.exIds.slice(0,2)
      .map(id => tr(S.exercises.find(e => e.id === id)?.name))
      .filter(Boolean).join(', ');
  }
  return '';
}
function _pushWidgetData() {
  try {
    const WDP = _cap('WidgetDataPlugin');
    if (!WDP) return;
    const streak  = typeof calcStreak === 'function' ? (calcStreak().weeks || 0) : 0;
    const todayStr = _planLabelFor(todayKey());
    const now   = new Date();
    // Woche beginnt Montag (deutsche Zählung) — nicht Sonntag!
    const dow0  = (now.getDay()+6)%7; // 0=Mo … 6=So
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - dow0);
    weekStart.setHours(0,0,0,0);
    const weekSess = (S.sessions || []).filter(s => new Date(s.date) >= weekStart).length;
    const last     = S.sessions?.length ? S.sessions[S.sessions.length - 1] : null;
    const lastStr  = last ? tr(_relativeDate(last.date)) : '';
    // Wochen-Kreise Mo–So: Intensitätslevel 0–4 je Tag + heutiger Index (0=Mo)
    let weekDays = '0,0,0,0,0,0,0', todayIdx = 0, weekStartKey = '';
    try {
      const t0 = new Date(); t0.setHours(0,0,0,0);
      todayIdx = (t0.getDay()+6)%7;
      const mon = new Date(t0); mon.setDate(t0.getDate()-todayIdx);
      weekStartKey = _localDateKey(mon);
      const { map, level } = _volMap();
      const lv = [];
      for (let i=0;i<7;i++){ const d=new Date(mon); d.setDate(mon.getDate()+i);
        lv.push(level(map[_localDateKey(d)]||0)); }
      weekDays = lv.join(',');
    } catch(e) {}
    // Pläne aller 7 Tage (Mo…So): Widget zeigt damit auch nach Mitternacht den
    // RICHTIGEN Tagesplan, ohne dass die App geöffnet werden muss.
    let plansJson = '[]';
    try {
      plansJson = JSON.stringify(['mon','tue','wed','thu','fri','sat','sun'].map(_planLabelFor));
    } catch(e) {}
    /* Jahresmatrix fürs Homescreen-Widget: 53 Wochenspalten à 7 Tage als eine
       Ziffernkette, ältester Tag zuerst. Eine Ziffer je Tag (Stufe 0–4) statt
       JSON — 371 Zeichen passen ohne Weiteres in die App-Group, ein Array
       gleicher Länge wäre das Zehnfache.
       Die Kette endet am SONNTAG der laufenden Woche, nicht heute: nur so geht
       das Raster in ganzen Spalten auf. Die Tage nach heute tragen die 9 —
       das Widget lässt sie leer, statt sie als "nicht trainiert" zu zeigen.
       Ein Tag ohne Eintrag ist keine Aussage über die Zukunft. */
    let yearDays = '', yearEndKey = '';
    try {
      const { map, level } = _volMap();
      const t0 = new Date(); t0.setHours(0,0,0,0);
      yearEndKey = _localDateKey(t0);
      const end = new Date(t0); end.setDate(t0.getDate() + (6 - ((t0.getDay()+6)%7)));
      const N = 53 * 7, out = [];
      for (let i = N - 1; i >= 0; i--) {
        const d = new Date(end); d.setDate(end.getDate() - i);
        out.push(d > t0 ? 9 : level(map[_localDateKey(d)] || 0));
      }
      yearDays = out.join('');
    } catch(e) {}
    // Tracker-Ringe (max 4) als Snapshot für das interaktive Widget
    let trackerJson = '{"weekKey":"","items":[]}';
    try {
      const wk = (typeof getWeekKey === 'function') ? getWeekKey() : '';
      const items = (S.trackerItems || []).slice(0, 4).map(it => ({
        id: it.id, label: it.label, goal: it.goal || 1,
        count: Math.min((S.trackerCounts[it.id] || {})[wk] || 0, it.goal || 1)
      }));
      trackerJson = JSON.stringify({ weekKey: wk, items });
    } catch(e) {}
    WDP.updateWidget({
      streakWeeks:   streak,
      todayPlan:     todayStr,
      totalSessions: (S.sessions||[]).length,
      weekSessions:  weekSess,
      lastWorkout:   lastStr,
      weekDays:      weekDays,
      todayIndex:    todayIdx,
      weekStartKey:  weekStartKey,
      plansJson:     plansJson,
      trackerJson:   trackerJson,
      yearDays:      yearDays,
      yearEndKey:    yearEndKey
    }).then(() => WDP.reloadWidget()).catch(() => {});
  } catch(e) {}
}

// Vom Home-Widget getätigte +1-Taps (App-Group-Deltas) in die App übernehmen
async function _consumeWidgetDeltas() {
  if (!_isNative()) return;
  const WDP = _cap('WidgetDataPlugin');
  if (!WDP || !WDP.getWidgetDeltas) return;
  try {
    const r = await WDP.getWidgetDeltas();
    const deltas = JSON.parse(r?.deltas || '{}');
    if (!deltas || !Object.keys(deltas).length) return;
    const wk = (typeof getWeekKey === 'function') ? getWeekKey() : '';
    let changed = false;
    Object.entries(deltas).forEach(([id, n]) => {
      const it = (S.trackerItems || []).find(i => i.id === id);
      if (!it || !n) return;
      if (!S.trackerCounts[id]) S.trackerCounts[id] = {};
      const goal = it.goal || 1;
      S.trackerCounts[id][wk] = Math.min(goal, (S.trackerCounts[id][wk] || 0) + n);
      changed = true;
    });
    if (changed) { persist(); if (typeof renderTrackers === 'function') renderTrackers(); }
  } catch(e) {}
}
function _relativeDate(iso) {
  const d = new Date(iso); const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Gestern';
  if (diff < 7)  return 'Vor ' + diff + ' Tagen';
  return d.toLocaleDateString(GT_LOCALE, { day:'2-digit', month:'2-digit' });
}

// ── LIVE ACTIVITY ──────────────────────────────────────────
let _liveActivityActive = false;
function _startLiveActivity(workoutName, exerciseName, setsDone, totalSets) {
  const LA = _cap('LiveActivityPlugin'); if (!LA) return;
  LA.start({ workoutName: tr(workoutName), exerciseName: tr(exerciseName), setsDone, totalSets, startTimestamp: timerTs || Date.now() })
    .then(r => { _liveActivityActive = !!r?.started; })
    .catch(() => {});
}
function _updateLiveActivity(exerciseName, setsDone, totalSets, restSeconds, isResting, restEndsAt) {
  if (!_liveActivityActive) return;
  const LA = _cap('LiveActivityPlugin'); if (!LA) return;
  LA.update({ exerciseName: tr(exerciseName), setsDone, totalSets, restSeconds: restSeconds||0, isResting: !!isResting, restEndsAt: restEndsAt||0 })
    .catch(() => {});
}
function _endLiveActivity() {
  if (!_liveActivityActive) return;
  _liveActivityActive = false;
 const LA = _cap('LiveActivityPlugin'); if (!LA) return;
  LA.end().catch(() => {});
}
// Berechnet den aktuellen Workout-Zustand und schiebt ihn in die Dynamic Island.
function _syncLiveActivity() {
  if (!_liveActivityActive || !wkLogs.length) return;
  let totalSets = 0, doneSets = 0;
  for (const l of wkLogs) {
    if (!l.sets) continue;
    totalSets += l.sets.length;
    doneSets  += l.sets.filter(s => s.done).length;
 }
  // Aktuelle Übung: erste mit offenem Satz, sonst die letzte.
  const curLog = wkLogs.find(l => l.sets?.some(s => !s.done)) || wkLogs[wkLogs.length - 1];
  const exName = exById(curLog?.exerciseId)?.name || '';
  const resting = _restInt !== null && _restSecs > 0;
  _updateLiveActivity(exName, doneSets, totalSets, resting ? _restSecs : 0, resting, resting ? _restEndTs : 0);
}

// ── SPOTLIGHT ─────────────────────────────────────────────
let _spotlightDebounce = null;
function _indexExercisesSpotlight() {
  if (!_isNative()) return;
  clearTimeout(_spotlightDebounce);
  _spotlightDebounce = setTimeout(() => {
    const SP = _cap('SpotlightPlugin'); if (!SP) return;
    const items = (S.exercises || []).map(e => ({
      id: e.id, name: e.name, muscleGroup: e.muscleGroup || ''
    }));
    SP.indexExercises({ items }).catch(() => {});
  }, 1500);
}

// ── HEALTHKIT ─────────────────────────────────────────────
async function _initHealthKit() {
  if (!_isNative()) return;
  const HK = _cap('HealthKitPlugin'); if (!HK) return;
  const { available } = await HK.isAvailable().catch(() => ({ available: false }));
  if (!available) return;
  const hkCard = document.getElementById('healthkit-card');
  if (hkCard) hkCard.style.display = '';
  if (S.healthKitEnabled) {
    await HK.requestHKPermissions().catch(() => {});
    _importWeightFromHealthKit();
  }
}
async function _importWeightFromHealthKit() {
  if (!_isNative() || !S.healthKitEnabled) return;
  const HK = _cap('HealthKitPlugin'); if (!HK) return;
  try {
    const res = await HK.getLatestWeight();
    if (!res || res.weightKg == null) return;
    const weightKg = +res.weightKg.toFixed(1);
    const d = res.date ? new Date(res.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    S.weightLog = S.weightLog || [];
    const existing = S.weightLog.find(e => e.date === d);
    if (existing && existing.weight === weightKg) return;
    if (existing) existing.weight = weightKg;
    else S.weightLog.push({ date: d, weight: weightKg });
    persist();
    renderWeightCard();
    const t = document.getElementById('update-toast');
    if (t) { t.textContent = 'Gewicht aus Apple Health importiert'; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500); }
  } catch(e) {}
}

async function _saveWorkoutToHealthKit(session) {
  if (!_isNative() || !S.healthKitEnabled) return;
  const HK = _cap('HealthKitPlugin'); if (!HK) return;
  try {
    await HK.saveWorkout({
      startTime: timerTs,
      duration:  session.duration || 0,
      calories:  _estimateCalories(session),
      sessionId: session.id
    });
  } catch(e) {}
}
function _estimateCalories(session) {
  if (!session?.logs?.length) return 0;
  let totalSets = 0;
  session.logs.forEach(l => { totalSets += (l.sets||[]).filter(s => s.w || s.r).length; });
  return Math.round(totalSets * 5.5);
}
async function toggleHealthKit(checked) {
  S.healthKitEnabled = checked; persist();
  if (!checked) { updateHealthKitUI(); return; }
  const HK = _cap('HealthKitPlugin'); if (!HK) { updateHealthKitUI(); return; }
  const { granted } = await HK.requestHKPermissions().catch(() => ({ granted: false }));
  if (!granted) { S.healthKitEnabled = false; persist(); }
  updateHealthKitUI();
}
function updateHealthKitUI() {
  const tgl = document.getElementById('hk-toggle');
  const sub = document.getElementById('hk-sub');
  if (tgl) tgl.checked = !!S.healthKitEnabled;
  if (sub) sub.textContent = S.healthKitEnabled
    ? 'Workouts werden in Apple Health gespeichert'
    : 'Trainings und Gewicht in Apple Health sichern';
}

// working state
let editId = null;
let selEmoji = '🏋️';
let selMuscle   = '';      // aktuell ausgewählt im Formular
let selExType   = 'reps';  // 'reps' | 'time' im Übung-Formular
let selScheme   = 'straight';  // Gewichts-Schema im Übung-Formular
let exCatFilter = 'alle';  // Filter im Übungen-Tab
let wkCatFilter = 'alle';  // Filter im Workout-Picker
let wkExIds = [];
let wkLogs  = [];
// Live-Coach im Training (Phase D): Rate-Limit-Zustand + aktive Vorschlagskarte.
// _coachDefaultState() steht in js/app-community.js, also in einer SPAETEREN Datei.
// Frueher stand hier `= _coachDefaultState()` — das ging, solange alles ein einziger
// <script>-Block war (Function-Declarations sind ueber den ganzen Block gehoisted).
// Seit dem Modul-Split hoistet nur noch innerhalb einer Datei: der Aufruf waere hier
// ein ReferenceError. Belegt wird der Zustand deshalb in js/app-boot.js, das als
// letztes laedt. Bis dahin null — gelesen wird er ohnehin erst im Training.
let _coachState = null;
let _coachCard  = null;    // { exId, c, applied, baseW, timer } – aktuell angezeigte Vorschlagskarte
let _coachEvalTimers = {}; // Debounce-Timer je "li_si", s. _coachEval()
// Plan, aus dem das aktuelle Training gestartet wurde: {type:'preset',id} | {type:'week',dayKey} | null.
// Wird am Ende genutzt, um optional die im Training geänderte Übungsliste in den Plan zu übernehmen.
let _activePlanSrc = null;
let timerInt = null, timerTs = null;
let setTimerInt = null;
let detId = null;
let detChart = null;
let det1rmChart = null;
let statsOverallChart = null;
let mgStatChart = null;
let mgStatId = null;

// ── NOTIFICATIONS ─────────────────────────────────────
// Gibt seit Task 19 das Promise des gewaehlten Zweiges zurueck. Die fuenfzehn
// bestehenden Aufrufstellen ignorieren den Rueckgabewert wie bisher; _cnSync()
// wartet darauf, damit die Uebergabe der Erinnerung abgeschlossen ist, bevor
// der naechste Lauf den Bestand liest.
function scheduleWorkoutNotifications() {
  if (!S.notifEnabled) return;
  if (_isNative()) {
    // Hat der Coach die Trainings-Erinnerung übernommen (Task 19), wird die
    // generische NICHT mehr geplant: sonst lägen am selben Termin „Zeit fürs
    // Training!" und „Heute steht Bankdrücken an: 3 Sätze zu 8 bei 62,5 kg"
    // übereinander. Übernommen ist sie nur, wenn wirklich eine inhaltliche
    // Erinnerung im Plan steht (_cnSync setzt S.coachPush.owns) — sonst bleibt
    // die alte Planung stehen, statt durch eine halbe ersetzt zu werden.
    if (_cnOwnsReminder()) return _cnDropGeneric();
    return _scheduleNativeNotifications();
  } else {
    // Web-PWA: der Coach hat hier keinen Zustellweg (kein LocalNotifications-
    // Plugin), also gibt es auch nichts zu verdrängen. sw.js bleibt zuständig.
    return _scheduleWebNotifications();
  }
}

function _buildNotifList() {
  const [h, m] = S.notifTime.split(':').map(Number);
  const dayKeys  = ['sun','mon','tue','wed','thu','fri','sat'];
  const dayNames = { mon:'Montag', tue:'Dienstag', wed:'Mittwoch', thu:'Donnerstag',
                     fri:'Freitag', sat:'Samstag', sun:'Sonntag' };
  const list = [];
  const now  = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    d.setHours(h, m, 0, 0);
    if (d <= now) continue;
    const key  = dayKeys[d.getDay()];
    const plan = S.weekPlan?.[key];
    if (!plan || plan.type === 'none') continue;
    let label = 'Training';
    if (plan.type === 'group' && plan.group) label = plan.group;
    else if (plan.type === 'exercises' && plan.exIds?.length) {
      const names = plan.exIds.map(id => S.exercises.find(e => e.id === id)?.name).filter(Boolean);
      label = names.slice(0,2).join(', ') + (names.length > 2 ? ' +' + (names.length-2) : '');
    }
    list.push({ timestamp: d.getTime(), day: dayNames[key], label });
  }
  return list;
}

// Wöchentlich wiederkehrende Erinnerungen je geplantem Trainingstag.
// JS getDay(): 0=So..6=Sa  →  Capacitor weekday: 1=So..7=Sa
function _buildWeeklyNotifList() {
  const [h, m] = S.notifTime.split(':').map(Number);
  const dayKeys  = ['sun','mon','tue','wed','thu','fri','sat']; // Index = getDay()
  const dayNames = { mon:'Montag', tue:'Dienstag', wed:'Mittwoch', thu:'Donnerstag',
                     fri:'Freitag', sat:'Samstag', sun:'Sonntag' };
  const out = [];
  for (let jsDay = 0; jsDay < 7; jsDay++) {
    const key  = dayKeys[jsDay];
    const plan = S.weekPlan?.[key];
    if (!plan || plan.type === 'none') continue;
    let label = 'Training';
    if (plan.type === 'group' && plan.group) label = plan.group;
    else if (plan.type === 'exercises' && plan.exIds?.length) {
      const names = plan.exIds.map(id => S.exercises.find(e => e.id === id)?.name).filter(Boolean);
      label = names.slice(0,2).join(', ') + (names.length > 2 ? ' +' + (names.length-2) : '');
    }
    out.push({ weekday: jsDay + 1, hour: h, minute: m, day: dayNames[key], label });
  }
  return out;
}

async function _scheduleNativeNotifications() {
  const LN = _cap('LocalNotifications'); if (!LN) return;
  try {
    // Permission muss vorhanden sein (toggleNotif fragt beim Aktivieren an).
    const perm = await LN.checkPermissions().catch(() => ({ display: 'prompt' }));
    if (perm.display !== 'granted') return;

    // Channel (Android; auf iOS ignoriert) – hohe Wichtigkeit für Banner & Ton.
    // Eine Stelle für Kanal und Wichtigkeit, s. _cnChannel(): Android friert die
    // Wichtigkeit beim ersten createChannel ein.
    await _cnChannel(LN);

    // Alte GymTrack-Notifs (ID 1000–1999) entfernen
    const existing = await LN.getPending().catch(() => ({ notifications: [] }));
    const gymIds   = existing.notifications
      .filter(n => n.id >= 1000 && n.id < 2000)
      .map(n => ({ id: n.id }));
    if (gymIds.length) await LN.cancel({ notifications: gymIds }).catch(() => {});

    const [h, m] = S.notifTime.split(':').map(Number);
    const weekly = _buildWeeklyNotifList();
    let notifs;
    if (weekly.length) {
      // Pro geplantem Tag eine WÖCHENTLICH WIEDERKEHRENDE Erinnerung
      // → überlebt App-Schließen & Neustart, kein erneutes Planen nötig
      notifs = weekly.map((it, i) => ({
        id:       1000 + i,
        title:    tr('Zeit fürs Training!'),
        body:     it.day + ': ' + tr(it.label),
        schedule: { on: { weekday: it.weekday, hour: it.hour, minute: it.minute },
                    repeats: true, allowWhileIdle: true },
        sound:    'default',
        channelId: 'gymtrack-reminders'
      }));
    } else {
      // Kein Wochenplan hinterlegt → TÄGLICHE Erinnerung, damit der Schalter wirkt
      notifs = [{
        id:       1000,
        title:    tr('Zeit fürs Training!'),
        body:     tr('Bereit für deine heutige Einheit?'),
        schedule: { on: { hour: h, minute: m }, repeats: true, allowWhileIdle: true },
        sound:    'default',
        channelId: 'gymtrack-reminders'
      }];
    }
    await LN.schedule({ notifications: notifs });
  } catch(e) { console.warn('[GymTrack] Native Notification Schedule fehlgeschlagen:', e); }
}

function _scheduleWebNotifications() {
  if (Notification.permission !== 'granted') return;
  if (!navigator.serviceWorker?.controller) return;
  navigator.serviceWorker.controller.postMessage({
    type: 'SCHEDULE_WORKOUT_NOTIFS',
    notifications: _buildNotifList()
  });
}

function updateSmartRestUI() {
  const toggle = document.getElementById('smartrest-toggle');
  const row    = document.getElementById('restsecs-row');
  const input  = document.getElementById('restsecs-input');
  const sub    = document.getElementById('smartrest-sub');
  if (!toggle) return;
  toggle.checked = !!S.smartRest;
  if (row)   row.style.display = S.smartRest ? 'none' : '';
  if (input) input.value = S.restTimerSecs || 90;
  if (sub)   sub.textContent = S.smartRest
    ? 'Wählt die Satzpause automatisch je nach Übung, Belastung & Gewicht'
    : 'Aus – es gilt die feste Standard-Pause';
}
function toggleSmartRest(checked) {
  S.smartRest = !!checked;
  persist();
  updateSmartRestUI();
  haptic(10);
}
function setRestSecs(val) {
  const n = Math.max(10, Math.min(600, parseInt(val, 10) || 90));
  S.restTimerSecs = n;
  persist();
  const input = document.getElementById('restsecs-input');
  if (input) input.value = n;
}
function updateNotifUI() {
  const toggle  = document.getElementById('notif-toggle');
  const timeRow = document.getElementById('notif-time-row');
  const sub     = document.getElementById('notif-sub');
  const input   = document.getElementById('notif-time-input');
  if (!toggle) return;
  const active = S.notifEnabled;
  toggle.checked = active;
  if (timeRow) timeRow.style.display = active ? '' : 'none';
  if (input) input.value = S.notifTime;
  if (!sub) return;
  if (active) {
    const hasPlan = ['mon','tue','wed','thu','fri','sat','sun']
      .some(k => S.weekPlan?.[k] && S.weekPlan[k].type !== 'none');
    sub.textContent = hasPlan
      ? 'Aktiv – an deinen Trainingstagen um ' + S.notifTime + ' Uhr'
      : 'Aktiv – täglich um ' + S.notifTime + ' Uhr';
  } else {
    sub.textContent = 'Erinnert dich an geplante Trainings';
  }
}

async function toggleNotif(checked) {
  if (checked) {
    if (_isNative()) {
      const LN = _cap('LocalNotifications');
      if (LN) {
        const { display } = await LN.requestPermissions().catch(() => ({ display: 'denied' }));
        if (display !== 'granted') {
          document.getElementById('notif-toggle').checked = false;
          updateNotifUI();
          return;
        }
        // Channel für Android-Kompatibilität (wird auf iOS ignoriert) — dieselbe
        // Wichtigkeit wie überall sonst, s. _cnChannel().
        await _cnChannel(LN);
      }
    } else {
      if (!('Notification' in window)) {
        document.getElementById('notif-toggle').checked = false;
        alert('Dein Browser unterstützt leider keine Benachrichtigungen.');
        return;
      }
      if (Notification.permission === 'denied') {
        document.getElementById('notif-toggle').checked = false;
        updateNotifUI();
        return;
      }
      if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          document.getElementById('notif-toggle').checked = false;
          updateNotifUI();
          return;
        }
      }
    }
    S.notifEnabled = true;
    persist();
    scheduleWorkoutNotifications();
  } else {
    S.notifEnabled = false;
    persist();
    if (_isNative()) {
      const LN = _cap('LocalNotifications');
      if (LN) {
        const existing = await LN.getPending().catch(() => ({ notifications: [] }));
        const gymIds   = existing.notifications.filter(n => n.id >= 1000 && n.id < 2000);
        if (gymIds.length) LN.cancel({ notifications: gymIds }).catch(() => {});
      }
    } else if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CANCEL_WORKOUT_NOTIFS' });
    }
  }
  updateNotifUI();
}

function setNotifTime(val) {
  S.notifTime = val;
  persist();
  scheduleWorkoutNotifications();
  updateNotifUI();
}

/* ═══ PROAKTIVE MELDUNGEN (Task 19): der Coach bei geschlossener App ════════
   js/coach-notify.js entscheidet OB und WANN gemeldet wird — hier steht nur
   das Zustellen. Zugestellt wird über @capacitor/local-notifications, denselben
   Weg, den die Trainings-Erinnerung (ids 1000–1999) und der Pausen-Timer
   (id 2500) schon nutzen. Ein zweiter Kanal wäre ein zweites System für
   dieselbe Sache.

   EIGENER NUMMERNRAUM 47000–47999, und der ist nicht optional: ein pauschales
   LN.cancel() räumte den laufenden Pausen-Timer mit ab.

   Rein lokal: S.coachPush steht nicht im Cloud-Payload, es gibt keinen
   Netzaufruf in diesem Block, firestore.rules bleibt unberührt.

   Jeder Einstiegspunkt liegt in try/catch: ein Fehler im Coach darf nie das
   laufende Training oder den App-Start abbrechen. Gespeichert wird mit
   persist(); ein save-Aufruf existiert in dieser App nicht, würfe einen
   ReferenceError und stürbe im try/catch daneben still. */
const CN_ID_BASE = 47000;
const CN_ID_MAX  = 47999;
// Derselbe Kanal wie die bestehende Trainings-Erinnerung: zwei Kanäle für
// dieselbe Art Meldung wären zwei Schalter in den Systemeinstellungen.
const CN_CHANNEL = 'gymtrack-reminders';
/* Ein Kanal, EINE Wichtigkeit. Android friert sie beim ersten createChannel für
   die Lebensdauer der Installation ein — stand an einer Stelle 4 und an einer
   anderen 5, entschied allein die Reihenfolge des ersten Aufrufs über Banner
   und Ton. 5 ist der Wert, den die bestehende Trainings-Erinnerung schon immer
   wollte („hohe Wichtigkeit für Banner & Ton"); alle vier Aufrufstellen gehen
   jetzt durch _cnChannel(). */
const CN_CHANNEL_IMPORTANCE = 5;
async function _cnChannel(LN) {
  try {
    const P = LN || _cap('LocalNotifications');
    if (!P || !P.createChannel) return;
    await P.createChannel({ id: CN_CHANNEL, name: 'Trainings-Erinnerungen',
                            importance: CN_CHANNEL_IMPORTANCE, visibility: 1, sound: 'default' });
  } catch(e) { console.warn('[Coach] Kanal anlegen:', e); }
}

/* Stabile Zahl aus der Text-id des Moduls ('kind:YYYY-MM-DD') —
   LocalNotifications verlangt Integer. Die Art bekommt einen eigenen
   Hunderterblock, der Tag den Rest: derselbe Kontext ergibt bei jedem Lauf
   dieselbe id (keine Dubletten nach App-Neustart), und zwei Kandidaten
   verschiedener Art können sich nie gegenseitig überschreiben. */
function _cnIdFor(id) {
  const s = String(id == null ? '' : id);
  let ki = -1;
  try { ki = (window.CoachNotify ? CoachNotify.KINDS : []).indexOf(s.split(':')[0]); } catch(_) {}
  const slot = ki >= 0 ? ki : 9;   // 9 → 47900–47999, immer noch im eigenen Raum
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return CN_ID_BASE + slot * 100 + (h % 100);
}

/* Ortszeit gegen UTC in Minuten. Ohne diesen Wert rechnete der Tagesdeckel in
   UTC — ein Nutzer auf UTC+9 bekäme das doppelte Tagesbudget, weil sein
   Vormittag und sein Abend auf zwei UTC-Tage fallen. */
function _cnTz() { try { return -new Date().getTimezoneOffset(); } catch(_) { return 0; } }

function _cnLevel() { try { return _persona().pushLevel; } catch(_) { return 'still'; } }

/* Markdown-Auszeichnung raus, Satz bleibt stehen.

   Der Wochenbericht kommt aus dem Modell, und das schreibt Zahlen gern fett:
   "**12.450 kg**". Der Chat rendert das (_aicMd in app-coach-setup.js), die
   Meldung und der Wochen-Reiter des Coach-Hubs koennen es nicht — dort stand
   die Auszeichnung woertlich im Text.

   Wie bei speakable() in coach-voice.js ist die gefaehrlichere Haelfte die zu
   weit greifende Regel. Darum steht neben jeder Ersetzung, was sie NICHT
   anfassen darf:

   - fett nur als PAAR und ohne Marker dazwischen ([^*]+ / [^_]+). Ein gieriger
     Ausdruck verschluckt bei zwei fetten Stellen alles dazwischen; ein halbes
     Paar bleibt unangetastet stehen, statt Text mitzureissen.
   - EINZELNE Sternchen und Unterstriche bleiben. "Bank 3 * 8" ist eine
     Satzangabe und keine Kursivschrift, "week_key" ein Bezeichner. Kursiv
     schreibt das Modell praktisch nie, der Schaden waere aber jedes Mal da.
   - Rauten nur am ZEILENANFANG (^ mit m-Flag) — eine Raute mitten im Satz ist
     keine Ueberschrift.

   Zeilenumbrueche bleiben stehen: _cnPlain() zieht sie danach ohnehin
   zusammen, die Anzeige im Hub braucht sie. */
function _mdPlain(s) {
  try {
    return String(s == null ? '' : s)
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^[ \t]*#{1,6}[ \t]+/gm, '');
  } catch(_) { return ''; }
}

/* Keine Emojis, auch nicht im Titel: der Coach-Name ist Nutzereingabe. Das
   Modul entschärft ihn für die Oberfläche, hier wird zusätzlich alles
   Piktogrammartige und jedes Steuerzeichen entfernt — eine Meldung ist eine
   Zeile Text. Die Auszeichnung geht durch _mdPlain() voraus: eine Meldung
   kennt keine Fettschrift, und ein Bericht aus dem Archiv ist entstanden,
   bevor _crClean() sie entfernt hat. */
function _cnPlain(s) {
  try {
    return _mdPlain(s)
      .replace(/[\p{Extended_Pictographic}\u{FE00}-\u{FE0F}\u{1F3FB}-\u{1F3FF}\u{200D}]/gu, '')
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch(_) { return ''; }
}

function _cnTitle() {
  try { return _cnPlain(_coachName()) || 'Coach'; } catch(_) { return 'Coach'; }
}

/* Die EINHEIT hängt am WERT, nicht am Katalogsatz — dieselbe Regel, die Block 3
   schon für den Erzählbogen im Training durchgesetzt hat.

   Vorher trugen 'anniversary', 'reminderPlan' und 'reportReady' ihr „kg" fest
   im Katalog und wurden deshalb von der Umrechnung ausgenommen. Für einen
   lbs-Nutzer stand damit „…8 Wiederholungen, 62,5 kg." direkt neben einer
   Gratulation mit „154,5 lbs" — zwei Einheiten in derselben Meldereihe, und die
   falsche davon nennt eine Zahl, die so nie auf der Stange lag. Jetzt geht die
   blanke Zahl durch _csWeight(), genau wie bei 'prCongrats'. Der Katalog ist
   einheitenrein; ein Test in coach-persona.test.js hält das fest. */
function _cnText(key, vars) {
  try {
    const v = Object.assign({}, vars || {});
    if (typeof v.kg  === 'number') v.kg  = _csWeight(v.kg);
    if (typeof v.vol === 'number') v.vol = _csWeight(v.vol);
    return _cnPlain(_say(key, v) || '');
  } catch(e) { console.warn('[Coach] Meldungstext:', e); return ''; }
}

function _cnPersist() { try { persist(); } catch(e) { console.warn('[Coach] Meldungen sichern:', e); } }

// Hat der Coach die Trainings-Erinnerung übernommen? Nur dann verdrängt er die
// generische. Synchron gelesen, weil scheduleWorkoutNotifications() an
// fünfzehn Stellen synchron gerufen wird.
function _cnOwnsReminder() {
  try { return !!(_isNative() && S.coachPush && S.coachPush.owns === true); } catch(_) { return false; }
}

// Die alte, generische Planung (ids 1000–1999) abräumen. Der Pausen-Timer
// (2500) und der eigene Raum (47000+) bleiben unberührt.
async function _cnDropGeneric() {
  try {
    const LN = _cap('LocalNotifications'); if (!LN) return;
    const pend = await LN.getPending().catch(() => ({ notifications: [] }));
    const ids = (((pend && pend.notifications) || []))
      .filter(n => n && Number(n.id) >= 1000 && Number(n.id) < 2000)
      .map(n => ({ id: Number(n.id) }));
    if (ids.length) await LN.cancel({ notifications: ids }).catch(() => {});
  } catch(e) { console.warn('[Coach] alte Erinnerung entfernen:', e); }
}

/* Nur die EIGENEN Termine abbestellen. Gelesen wird beides: der Bestand aus
   getPending() (fängt Waisen aus früheren Ständen) und der zuletzt gemerkte
   Plan (falls getPending() nichts liefert). Gefiltert wird strikt auf
   47000–47999 — der Pausen-Timer läuft weiter.

   Rückgabe: null, wenn alles durchkam, sonst EIN Satz, der den Fehlschlag
   nennt. Der Ablauf bleibt derselbe wie vorher (ein Lesefehler verhindert das
   Abbestellen nicht, der gemerkte Plan trägt es dann allein) — neu ist nur,
   dass der Aufrufer davon erfährt. _cnSyncRun() ignoriert den Wert bewusst: ein
   fehlgeschlagenes Abbestellen korrigiert dort der nächste Lauf. Beim
   Kontowechsel gibt es keinen nächsten Lauf, deshalb sieht
   _coachDropOwnNotifs() genau hin (Abschluss-Review Block 5, Wichtig 2). */
async function _cnCancelOwn(LN, alt) {
  try {
    const ids = {};
    let lesefehler = null;
    try {
      const pend = await LN.getPending().catch(e => { lesefehler = (e && e.message) || e; return { notifications: [] }; });
      (((pend && pend.notifications) || [])).forEach(n => {
        const i = Number(n && n.id);
        if (i >= CN_ID_BASE && i <= CN_ID_MAX) ids[i] = true;
      });
    } catch(e) { lesefehler = (e && e.message) || e; }
    (alt || []).forEach(e => { if (e && e.id) ids[_cnIdFor(e.id)] = true; });
    const liste = Object.keys(ids).map(i => ({ id: Number(i) }));
    let abbestellfehler = null;
    if (liste.length) await LN.cancel({ notifications: liste }).catch(e => { abbestellfehler = (e && e.message) || e; });
    if (lesefehler || abbestellfehler) {
      return 'Termine abbestellen: ' + (abbestellfehler ? ('cancel: ' + abbestellfehler) : ('getPending: ' + lesefehler));
    }
    return null;
  } catch(e) {
    console.warn('[Coach] Termine abbestellen:', e);
    return 'Termine abbestellen: ' + ((e && e.message) || e);
  }
}

// ── Die sechs Zulieferer: gegen den echten Code gebaut, nichts erfunden ─────

// Zeitpunkt der letzten gespeicherten Einheit.
function _cnLastWorkoutTs() {
  try {
    let best = null;
    (S.sessions || []).forEach(s => {
      const t = (s && s.date) ? new Date(s.date).getTime() : NaN;
      if (isFinite(t) && (best === null || t > best)) best = t;
    });
    return best;
  } catch(e) { console.warn('[Coach] letzte Einheit:', e); return null; }
}

/* Übungs-ids eines Plantages — dieselbe Auflösung wie beim Trainingsstart
   (Preset / Wochenplan-Gruppe / feste Liste). Keine zweite Lesart des
   Wochenplans, sonst erinnerte die Meldung an etwas anderes, als der Start
   danach vorauswählt. */
function _cnPlanExIds(p) {
  try {
    if (!p) return [];
    if (p.type === 'preset' && p.id) { const pr = presetById(p.id); return pr ? _presetExIdsExisting(pr) : []; }
    if (p.type === 'exercises' && Array.isArray(p.exIds)) return p.exIds.filter(id => S.exercises.some(e => e.id === id));
    if (p.type === 'group' && p.group) {
      for (const m of allModes()) {
        const g = m.groups.find(x => x.id === p.group);
        if (g && g.muscles) return S.exercises.filter(e => exInGroup(e, m.id, g.id)).map(e => e.id);
      }
    }
  } catch(e) { console.warn('[Coach] Plantag lesen:', e); }
  return [];
}

/* Nächster geplanter Trainingstag MIT konkretem Inhalt: Übung, Gewicht, Sätze,
   Wiederholungen. Die Uhrzeit ist die, die der Nutzer für seine Erinnerung
   gewählt hat (S.notifTime) — der Coach erfindet keinen zweiten Termin.
   Fehlt einer der vier Werte, gibt es keinen Kandidaten: das Modul striche ihn
   ohnehin (Gestaltungsregel 8), und die generische Erinnerung bleibt dann
   stehen, statt durch eine halbe ersetzt zu werden. */
function _cnNextWorkout(now) {
  try {
    const keys = ['sun','mon','tue','wed','thu','fri','sat'];   // Index = getDay()
    const teile = String(S.notifTime || '08:00').split(':');
    const h  = Math.min(23, Math.max(0, parseInt(teile[0], 10) || 8));
    const mi = Math.min(59, Math.max(0, parseInt(teile[1], 10) || 0));
    for (let i = 0; i < 8; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      d.setHours(h, mi, 0, 0);
      if (d.getTime() <= now) continue;
      const ids = _cnPlanExIds(planFor(keys[d.getDay()]));
      for (let k = 0; k < ids.length; k++) {
        const ex = exById(ids[k]);
        if (!ex || ex.targetType === 'time') continue;
        let kg = null;
        try { kg = getSuggestedWeight(ex); } catch(_) { kg = null; }
        const sets = parseInt(ex.targetSets, 10) || 0;
        const reps = parseInt(ex.targetReps, 10) || 0;
        if (!(kg > 0) || !(sets > 0) || !(reps > 0)) continue;
        return { at: d.getTime(), ex: ex.name, kg: kg, sets: sets, reps: reps };
      }
    }
  } catch(e) { console.warn('[Coach] nächstes Training:', e); }
  return null;
}

/* Termin des Wochenberichts — jetzt aus S.coachReportAt statt fest verdrahtet
   (Block 5): {day, hour} in Ortszeit, 0 = Sonntag. Standard bleibt Sonntag,
   nur eine Stunde früher als der bisherige feste Wert (18 statt 19 Uhr), damit
   Termin und Anzeige DIESELBE Quelle haben — zwei Zahlen für denselben Termin
   liefen beim ersten Verstellen auseinander.
   Die Werte werden hier noch einmal geprüft und nicht nur beim Start: wer
   S.coachReportAt zur Laufzeit anfasst, soll keinen Termin erzeugen können, den
   new Date() als Invalid Date liest. */
function _cnReportAt(now) {
  try {
    const at = (S.coachReportAt && typeof S.coachReportAt === 'object') ? S.coachReportAt : {};
    let tag = Math.floor(Number(at.day));  if (!(tag >= 0 && tag <= 6))  tag = 0;
    let std = Math.floor(Number(at.hour)); if (!(std >= 0 && std <= 23)) std = 18;
    const d = new Date(now);
    d.setHours(std, 0, 0, 0);
    const bis = (tag - d.getDay() + 7) % 7;
    if (bis > 0 || d.getTime() <= now) d.setDate(d.getDate() + (bis || 7));
    return d.getTime();
  } catch(e) { console.warn('[Coach] Berichtstermin:', e); return null; }
}

/* Volumen der laufenden ISO-Woche. Der Wochenschlüssel kommt aus
   CoachAnalyze.isoWeekKey — die EINZIGE Wochenrechnung des Vorhabens.
   getWeekKey() ('2026-W5') bleibt hier bewusst außen vor, und zwar nicht wegen
   des Formats: es ist eine andere Rechnung (Wochen ab dem 1. Januar statt ab
   dem ersten Donnerstag) und liefert an Jahresgrenzen eine andere Woche. Siehe
   den Kommentar bei _crWeekKey. */
function _cnWeekVol(now) {
  try {
    if (!window.CoachAnalyze) return null;
    const wk = CoachAnalyze.isoWeekKey(now);
    if (!wk) return null;
    let vol = 0;
    (S.sessions || []).forEach(s => {
      const t = (s && s.date) ? new Date(s.date).getTime() : NaN;
      if (!isFinite(t) || CoachAnalyze.isoWeekKey(t) !== wk) return;
      try { vol += sessionVolume(s) || 0; } catch(_) {}
    });
    return vol > 0 ? Math.round(vol) : null;
  } catch(e) { console.warn('[Coach] Wochenvolumen:', e); return null; }
}

/* Deload: KEINE zweite Erholungsrechnung. Dieselbe Lage, die auch die
   Gewichtsvorschläge, die Pausenlänge und die Tagesempfehlung steuert. */
function _cnDeloadDue() {
  try { const r = _ciReadiness(); return !!(r && r.mode === 'deload'); }
  catch(e) { console.warn('[Coach] Deload-Prüfung:', e); return false; }
}

/* Jahresrückblick: eine Einheit vor 365 ± 3 Tagen, deren damaliges Topgewicht
   heute überboten ist. Bei gleichem oder niedrigerem Gewicht null — ein
   Rückblick, der Stillstand feiert, ist schlimmer als keiner. */
function _cnAnniversary(now) {
  try {
    const JAHR = 365 * 864e5, TOL = 3 * 864e5;
    const alt = [];
    (S.sessions || []).forEach(s => {
      const t = (s && s.date) ? new Date(s.date).getTime() : NaN;
      if (!isFinite(t)) return;
      const ab = Math.abs((now - t) - JAHR);
      if (ab <= TOL) alt.push({ ts: t, s: s, ab: ab });
    });
    if (!alt.length) return null;
    alt.sort((a, b) => a.ab - b.ab);
    for (let i = 0; i < alt.length; i++) {
      let damals = null;
      (alt[i].s.logs || []).forEach(l => {
        const top = _coachTopSet(l.sets);
        const w = top ? (parseFloat(top.w) || 0) : 0;
        if (w > 0 && (!damals || w > damals.kg)) damals = { exId: l.exerciseId, kg: w };
      });
      if (!damals) continue;
      const ex = exById(damals.exId);
      if (!ex) continue;
      let heute = 0;
      (S.sessions || []).forEach(s => {
        const t = (s && s.date) ? new Date(s.date).getTime() : NaN;
        if (!isFinite(t) || t <= alt[i].ts) return;
        (s.logs || []).forEach(l => {
          if (l.exerciseId !== damals.exId) return;
          const top = _coachTopSet(l.sets);
          const w = top ? (parseFloat(top.w) || 0) : 0;
          if (w > heute) heute = w;
        });
      });
      if (heute > damals.kg) return { ex: ex.name, kg: damals.kg };
    }
  } catch(e) { console.warn('[Coach] Jahresrückblick:', e); }
  return null;
}

/* Berechtigung — NUR vom Hub aus, an genau zwei Stellen: beim Wechsel der
   Push-Stufe weg von 'still' und über die Zeile „Mitteilungen erlauben" in den
   Coach-Einstellungen (s. _cnNeedsPerm). An beiden versteht der Nutzer, wofür;
   beim App-Start nicht — und iOS fragt nur einmal pro Installation.
   Ohne Plugin (Web-PWA) gibt es nichts zu fragen und erst recht nichts
   zurückzunehmen: die Einstellung bleibt stehen, _cnSync() schweigt ohnehin. */
async function _cnPermission() {
  try {
    /* Ohne Premium wird NICHT gefragt. iOS zeigt den Systemdialog genau einmal
       pro Installation: lehnt ein Gratis-Nutzer ihn für eine Funktion ab, die
       er gar nicht hat, ist die Berechtigung nach einem späteren Kauf verbrannt
       und wird nie wieder erfragt. Der Riegel steht hier und nicht nur an der
       Aufrufstelle, damit ihn keine spätere Fläche versehentlich umgeht. */
    let premium = false;
    try { premium = !!isPremium(); } catch(_) { premium = false; }
    if (!premium) return false;
    const LN = _cap('LocalNotifications');
    if (!LN) return true;
    let perm = await LN.checkPermissions().catch(() => ({ display:'prompt' }));
    if (!perm || perm.display !== 'granted') {
      perm = await LN.requestPermissions().catch(() => ({ display:'denied' }));
    }
    const ok = !!(perm && perm.display === 'granted');
    if (ok) await _cnChannel(LN);
    return ok;
  } catch(e) { console.warn('[Coach] Berechtigung:', e); return false; }
}

/* Fehlt die Berechtigung an einer Stelle, an der sie etwas ändern würde?

   Der Standard-pushLevel ist 'normal' (Preset 'balanced'), nicht 'still' — der
   Wechsel „weg von still" trat für einen normalen Nutzer deshalb NIE ein, der
   Dialog kam nie, und _cnSync() brach still an der fehlenden Berechtigung ab:
   der ganze Block tat nichts, ohne Fehler und ohne Hinweis. Den Dialog erreichte
   nur, wer erst auf „Still" und dann zurück stellte.

   Deshalb bietet der Coach-Hub ihn aktiv an. Beim App-Start wird weiterhin NICHT
   gefragt: iOS zeigt den Dialog einmal pro Installation, und eine Ablehnung beim
   Start ist dauerhaft — die schlechteste Stelle, die es dafür gibt.

   Gelesen wird der zuletzt gemerkte Stand (S.coachPush.permOk) statt
   checkPermissions(): die Oberfläche rendert synchron. _cnSync() schreibt den
   Wert bei jedem Lauf fort. */
function _cnNeedsPerm() {
  try {
    if (!_isNative()) return false;
    let premium = false;
    try { premium = !!isPremium(); } catch(_) { premium = false; }
    if (!premium) return false;
    if (_cnLevel() === 'still') return false;
    return !(S.coachPush && S.coachPush.permOk === true);
  } catch(e) { console.warn('[Coach] Berechtigungsstand:', e); return false; }
}

/* Hängt an setAiCoachOpt('pushLevel', …) und setCoachPreset(): die neue Stufe
   gilt sofort, nicht erst morgen. Weg von 'still' wird die Berechtigung
   erfragt; verweigert der Nutzer, springt die Auswahl auf den vorigen Wert
   zurück und ein ruhiger Hinweis erscheint. Das ist KEIN Fehler. */
async function _cnLevelChanged(vorher) {
  try {
    const jetzt = _cnLevel();
    /* Ohne Premium wird der einmalige Systemdialog nicht verbrannt (s.
       _cnPermission). Die gewählte Stufe bleibt trotzdem stehen: sie ist eine
       Voreinstellung für den Tag, an dem das Abo da ist, kein Versprechen für
       heute — und _cnSync() schweigt ohne Premium ohnehin. Ein Rücksprung auf
       „Still" wäre hier eine Fehlermeldung für einen Fehler, den niemand
       gemacht hat. */
    let premium = false;
    try { premium = !!isPremium(); } catch(_) { premium = false; }
    if (premium && jetzt !== 'still' && vorher === 'still') {
      const ok = await _cnPermission();
      if (!ok) {
        S.aiCoach = S.aiCoach || {};
        S.aiCoach.pushLevel = 'still';
        try { _coachPresetSync(); } catch(_) {}
        _cnPersist();
        try { _coachOptRender(); } catch(_) {}
        try { _dndToast(_cm('Ohne Mitteilungen meldet sich dein Coach nur in der App.',
                            'Without notifications your coach only speaks inside the app.')); } catch(_) {}
        await _cnSync();
        return;
      }
    }
    await _cnSync();
  } catch(e) { console.warn('[Coach] Push-Stufe:', e); }
}

/* _cnSync() — verwirft zuerst die EIGENEN alten Termine, plant dann alles neu
   und schreibt die Zähler fort.

   Reihenfolge, und keine Stufe ist tauschbar:
     1. Fällige Termine des letzten Plans in den Zustand schreiben. Nur die:
        was noch aussteht, wird gleich verworfen und neu geplant und darf
        deshalb NICHT gegen das Budget zählen — sonst verbrauchte jeder
        App-Start das Tagesbudget ein zweites Mal und der Coach verstummte.
     2. Eigene Termine abbestellen (nur 47000–47999).
     3. Neu planen — der Deckel liegt VOR der Planung, im Modul.
     4. Zustellen, sichern, die generische Erinnerung übergeben oder holen.

   Ein Lauf nach dem anderen: drei Einstiegspunkte hängen _cnSync() ohne await
   auf (App-Start, Ende der Einheit, Wechsel der Push-Stufe). Endet ein Training
   weniger als 1,2 s nach dem App-Start, oder tippt der Nutzer „Normal" und
   sofort „Eng", lesen sonst zwei Läufe S.coachPush.plan, bevor einer schreibt:
   dieselben fälligen Termine zählen zweimal gegen das Budget (das Budget ist zu
   früh weg, der Coach verstummt), und der zweite Lauf setzt owns:false, während
   seine 47xxx-Termine stehen — dann holt sich die generische Erinnerung ihren
   Platz zurück und zum selben Termin liefern ZWEI Meldungen.

   Die Warteschlange ist bewusst eine Kette und kein Verwerfen: jeder Aufruf
   trägt eigene Angaben (etwa den frischen Bestwert aus finishWk), die ein
   übersprungener Lauf verlieren würde. */
let _cnLauf = null;

/* Die Kette ist NICHT nur fuer zwei _cnSync()-Laeufe da, sondern auch fuer die
   Raeumung beim Kontowechsel — und die braucht BEIDE Riegel, weil jeder allein
   ein Leck laesst (Abschluss-Review Block 5, Kritisch 1):

   1. _cnEnqueue() haengt _coachDropOwnNotifs() in dieselbe Kette. Ohne das
      startet das Abbestellen NEBEN einem laufenden _cnSyncRun: dessen
      LN.schedule() ist dann womoeglich schon unterwegs und landet NACH dem
      cancel — der Coach von Konto A meldet sich auf dem Sperrbildschirm von
      Konto B. Nur die Reihenfolge ueber die Kette schliesst das aus.
   2. _coachGen ist das Merkmal des Kontos: _coachWipeLocal() zaehlt es hoch,
      jeder Lauf merkt sich seinen Stand beim Start und prueft ihn VOR jedem
      Zurueckschreiben. Ohne das rettet ein Lauf, der st/alt noch aus
      S.coachPush von Konto A gelesen hat und in _cnCancelOwn/checkPermissions
      haengt, dessen Zaehler (dayCount, weekCount, sentTs) beim Zurueckschreiben
      wieder herein — die Kette allein verhindert das nicht, weil die Raeumung
      S.coachPush SYNCHRON auf null setzt und danach erst drankommt. Konto B
      erbte sonst das verbrauchte Budget von Konto A, und zwar dauerhaft: der
      Stand steht ueber _cnPersist() auch in ft4.
   Das Fenster sind zwei native Bruecken-Runden, auf dem Geraet 50-300 ms.

   _coachGen ist bewusst KONTO-weit und nicht meldungs-eigen: derselbe Zaehler
   kappt den Berichtslauf (_crBuildRun), der ueber seinen Modellaufruf ein
   genauso langes Fenster hat. Ein zweiter Zaehler daneben liefe beim ersten
   neuen Feld auseinander. */
let _coachGen = 0;
function _cnEnqueue(fn) {
  try {
    const vorher = _cnLauf || Promise.resolve();
    const lauf = vorher.catch(() => {}).then(fn);
    _cnLauf = lauf;
    lauf.catch(() => {}).then(() => { if (_cnLauf === lauf) _cnLauf = null; });
    return lauf;
  } catch(e) { console.warn('[Coach] Meldungen einreihen:', e); return Promise.resolve(); }
}
function _cnSync(opts) { return _cnEnqueue(() => _cnSyncRun(opts)); }

async function _cnSyncRun(opts) {
  const o = opts || {};
  // Der Kontostand beim START dieses Laufs. Aendert er sich unterwegs, gehoert
  // alles, was dieser Lauf in der Hand haelt, dem vorigen Konto.
  const gen = _coachGen;
  const veraltet = () => _coachGen !== gen;
  try {
    const LN = _cap('LocalNotifications');
    /* Fail-closed, und zwar VOR allem anderen: fällt js/coach-notify.js einmal
       nicht mit (Cache-Miss, Teil-Update, Parse-Fehler), dann BESITZT der Coach
       die Trainings-Erinnerung nicht mehr. Stand owns weiter auf true, meldete
       _cnOwnsReminder() das weiter, scheduleWorkoutNotifications() räumte über
       _cnDropGeneric() die ids 1000–1999 ab und plante keine eigene — kein
       Coach-Termin, keine generische Erinnerung, keine Fehlermeldung. Task 18
       baut bewusst fail-closed; hier wäre fail-open an der teuersten Stelle.
       Die eigenen Waisen werden dabei abbestellt: _cnCancelOwn() filtert auf
       47000–47999 und braucht das Modul nicht. */
    if (!window.CoachNotify || !LN) {
      const waisen = (S.coachPush && Array.isArray(S.coachPush.plan)) ? S.coachPush.plan : [];
      if (S.coachPush) { S.coachPush.plan = []; S.coachPush.owns = false; }
      _cnPersist();
      if (LN) {                            // Web-PWA: kein Zustellweg, kein Eingriff
        await _cnCancelOwn(LN, waisen);
        try { await scheduleWorkoutNotifications(); } catch(_) {}
      }
      return;
    }
    const tz  = _cnTz();
    const now = Date.now();

    let st = (S.coachPush && S.coachPush.state) || CoachNotify.notifyNew();
    const alt = (S.coachPush && Array.isArray(S.coachPush.plan)) ? S.coachPush.plan : [];
    alt.forEach(e => {
      if (e && typeof e.at === 'number' && e.at <= now) st = CoachNotify.record(st, e.kind, e.at, tz);
    });

    await _cnCancelOwn(LN, alt);

    let premium = false;
    try { premium = !!isPremium(); } catch(_) { premium = false; }
    const perm = await LN.checkPermissions().catch(() => ({ display:'prompt' }));
    const erlaubt = !!(perm && perm.display === 'granted');
    /* Erster Riegel, und zwar VOR dem ersten Schreibzugriff: st traegt die
       Zaehler des Kontos, das beim Start dieses Laufs angemeldet war. Hat die
       Raeumung inzwischen S.coachPush geleert, ist hier Schluss — geschrieben
       wird nichts, abbestellt ist oben schon. */
    if (veraltet()) return;
    S.coachPush = { state: st, plan: [], permOk: erlaubt, owns: false };

    if (!premium || !erlaubt) {
      // Ohne Premium meldet der Coach nicht, ohne Berechtigung bleibt er still.
      // Die generische Erinnerung holt sich dann ihren Platz zurück.
      _cnPersist();
      try { await scheduleWorkoutNotifications(); } catch(_) {}
      return;
    }

    let busy = false;
    try { busy = !!isWorkoutActive(); } catch(_) { busy = false; }

    const plan = CoachNotify.planAll({
      now: now,
      level: _cnLevel(),
      state: st,
      tzOffsetMin: tz,
      workoutActive: busy,
      reportAt:  _cnReportAt(now),
      reportVol: _cnWeekVol(now),
      /* Die Trainings-Erinnerung hängt am sichtbaren Schalter „Benachrichtigungen
         → Trainings-Erinnerungen". Sein Untertitel verspricht genau diese eine
         Sache; wer sie abbestellt, darf sie nicht mit anderem Absender
         zurückbekommen — „Trainingstag: Bankdrücken, 3 Sätze, 8 Wiederholungen,
         72,5 kg." IST die Trainings-Erinnerung, nur inhaltlich.

         Die übrigen Arten hängen bewusst NICHT daran: Rückkehr-Anstoß,
         Jahresrückblick, Deload-Rat, PR-Gratulation und Wochenbericht sind
         keine „Erinnerung an geplante Trainings". Sie gehören den Push-Chips im
         Hub („Wie oft der Coach dich außerhalb der App anspricht"), und dort
         steht mit „Still" der Schalter, der wirklich alles abstellt. Ein Schalter
         mit dem Namen „Trainings-Erinnerungen" wäre sonst ein zweiter, falsch
         beschrifteter Hauptschalter — und er nähme dem Nutzer den Wochenbericht,
         das eine Versprechen, das sogar auf „Still" gilt.

         Nebeneffekt und Absicht zugleich: ohne den Schalter steht kein
         'reminderPlan' im Plan, owns bleibt false, und die generische Erinnerung
         behält ihren Platz — den sie wegen !S.notifEnabled ebenfalls nicht
         nutzt. Es meldet sich also niemand. */
      nextWorkout:   S.notifEnabled ? _cnNextWorkout(now) : null,
      lastWorkoutTs: _cnLastWorkoutTs(),
      deload:        _cnDeloadDue(),
      anniversary:   _cnAnniversary(now),
      pr: o.pr || null
    }) || [];

    const notifs = [], behalten = [];
    plan.forEach(e => {
      /* Der Wochenbericht trägt auf dem Sperrbildschirm die ECHTE
         Zusammenfassung, nicht die Einladung, sie abzurufen (Task 21). Der
         Einladungstext aus dem Katalog bleibt der Rückfall — er greift, wenn
         die App im 36-Stunden-Fenster nie offen war und deshalb noch kein
         fertiger Text existiert. Genau dieser Rückfall ist die bewusst
         akzeptierte Schwäche der Geräte-Variante; ein Server-Cron wäre die
         Alternative und steht ausdrücklich nicht im Plan. */
      let body = '';
      if (e.kind === 'report') { try { body = _crNotifBody(e.at); } catch(_) { body = ''; } }
      if (!body) body = _cnText(e.key, e.vars);
      if (!body) return;                    // ohne Satz keine Meldung
      notifs.push({
        id:        _cnIdFor(e.id),
        title:     _cnTitle(),
        body:      body,
        schedule:  { at: new Date(e.at), allowWhileIdle: true },
        sound:     'default',
        channelId: CN_CHANNEL,
        extra:     { coachKind: e.kind }
      });
      behalten.push({ id: e.id, at: e.at, kind: e.kind });
    });

    if (notifs.length) {
      // Zweiter Riegel: nach dem Wechsel wird nichts mehr GEPLANT. Sonst
      // stellte dieser Lauf die 47xxx wieder hin, die die Raeumung gerade
      // abbestellt hat. Den Zustand raeumt der finally-Block unten.
      if (veraltet()) return;
      await _cnChannel(LN);
      await LN.schedule({ notifications: notifs });
    }

    /* Dritter Riegel: schedule() ist eine Bruecken-Runde und damit selbst ein
       Fenster. Faellt der Wechsel hier hinein, wird der Plan nicht mehr
       fortgeschrieben — die eben geplanten Termine raeumt _coachDropOwnNotifs()
       ab, das ueber _cnEnqueue() in derselben Kette HINTER diesem Lauf steht. */
    if (veraltet()) return;
    S.coachPush.plan = behalten;
    S.coachPush.owns = behalten.some(e => e.kind === 'reminderPlan');
    _cnPersist();
    // Übernommen → die generische Erinnerung räumen; sonst holt sie sich ihren
    // Platz zurück. Beides macht scheduleWorkoutNotifications() selbst, es liest
    // dafür S.coachPush.owns — und ruft _cnSync() nicht seinerseits, also keine
    // Schleife. Awaited, weil beide Zweige asynchron sind: sonst endete
    // _cnSync(), während die Übergabe noch lief, und der nächste Lauf sähe
    // einen halben Bestand.
    try { await scheduleWorkoutNotifications(); } catch(_) {}
  } catch(e) { console.warn('[Coach] Meldungen planen:', e); }
  finally {
    /* Letzter Riegel, und der einzige, der WIRKLICH jeden Ausgang abdeckt: die
       drei Pruefungen oben verhindern das Planen, aber zwischen dem letzten
       Schreibzugriff und dem Ende dieses Laufs liegen noch zwei await auf
       scheduleWorkoutNotifications(). Faellt der Kontowechsel dorthin, stuende
       S.coachPush danach wieder mit den Zaehlern des vorigen Kontos da — nur
       eben ohne dass irgendeine Zeile oben es gemerkt haette. Die Zusicherung
       lautet deshalb: kehrt dieser Lauf zurueck und hat sich das Konto
       unterwegs geaendert, ist S.coachPush leer. */
    try {
      if (veraltet() && S.coachPush) { S.coachPush = null; _cnPersist(); }
    } catch(e) { console.warn('[Coach] Meldungen nach Kontowechsel:', e); }
  }
}

// ── HELPERS ───────────────────────────────────────────
const uid  = () => '_' + Math.random().toString(36).slice(2);
const exById = id => S.exercises.find(e => e.id === id);

// ── Sessions-Index: exerciseId → chronologisch sortierte Einheiten ──────────
// exHistory() scannte pro Aufruf ALLE Sessions inkl. new Date()-Parsing und
// Sortierung. renderExList() ruft es einmal pro Zeile auf, exProgressStatus()
// noch einmal — bei jedem Tastendruck in der Suchleiste also
// O(Übungen × Sessions) Date-Parses. Genau das war das spürbare Ruckeln.
// Der Index wird einmal je Datenstand gebaut; Key = Anzahl Sessions + updatedAt
// (persist() bumpt updatedAt, der Cloud-Merge übernimmt es aus dem Remote-Doc),
// damit jede Änderung den Cache sicher verwirft.
let _exIdx = null, _exIdxKey = '';
