function hapticSelStart() {
  try {
    const H = _cap('Haptics');
    if (H && H.selectionStart) { H.selectionStart(); _hapticSelActive = true; }
  } catch(e) {}
}
function hapticSelEnd() {
  try {
    const H = _cap('Haptics');
    if (H && H.selectionEnd) H.selectionEnd();
  } catch(e) {}
  _hapticSelActive = false;
}
function hapticTick() {
  try {
    const H = _cap('Haptics');
    if (H) {
      // Falls noch keine Session läuft (z. B. Inertia-Scroll ohne Touch) →
      // lazy starten, damit selectionChanged auch wirklich klackt.
      if (!_hapticSelActive && H.selectionStart) { H.selectionStart(); _hapticSelActive = true; }
      if (H.selectionChanged) H.selectionChanged();
      else if (H.impact) H.impact({ style: 'LIGHT' });
    } else if (navigator.vibrate) {
      navigator.vibrate(7);
    }
  } catch(e) {}
}

function goTabId(id) {
  const map = { heute:0, uebungen:1, stats:2, freunde:3, erfolge:4, settings:4 };
  const idx = map[id];
  if (idx == null) return;
  const tabs = document.querySelectorAll('.tabbar .tab');
  if (!tabs[idx]) return;
  goTab(id, tabs[idx]);
}


// ── STREAK (Wochen in Folge mit mind. einem Training) ──
function calcStreak(){
  if (!S.sessions || !S.sessions.length) return { weeks:0, weeksThis:false, lastDate:null, bestWeeks:0, totalWeeks:0, weekHistory:[] };
  const mondayOf = (d) => {
    const x = new Date(d);
    x.setHours(0,0,0,0);
    const dow = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - dow);
    return x.getTime();
  };
  const weeks = new Set(S.sessions.map(s => mondayOf(s.date)));
  const thisMon = mondayOf(new Date());
  // Ueber eine Zeitumstellung hinweg hat eine Woche 167 bzw. 169 Stunden. Feste
  // 7*86400000 ms landen dann eine Stunde neben dem gespeicherten Montag, der
  // Set-Vergleich schlaegt fehl und die Serie reisst scheinbar ab. Deshalb
  // kalenderbasiert versetzen und das Ergebnis durch dieselbe mondayOf-Normierung
  // schicken, aus der auch die Werte im Set stammen.
  const shiftWeeks = (ts, n) => {
    const d = new Date(ts);
    d.setDate(d.getDate() + n * 7);
    return mondayOf(d);
  };
  // Aktueller Streak
  let count = 0, cursor = thisMon;
  if (!weeks.has(cursor)) cursor = shiftWeeks(cursor, -1);
  while (weeks.has(cursor)) { count++; cursor = shiftWeeks(cursor, -1); }
  // Bester Streak (über alle Wochen)
  const sortedWeeks = [...weeks].sort((a,b) => a-b);
  let best = 0, run = 0, prev = null;
  for (const w of sortedWeeks) {
    run = (prev !== null && shiftWeeks(prev, 1) === w) ? run + 1 : 1;
    if (run > best) best = run;
    prev = w;
  }
  // Verlauf der letzten 12 Wochen
  const weekHistory = [];
  for (let i = 11; i >= 0; i--) {
    const wMon = shiftWeeks(thisMon, -i);
    weekHistory.push({ ts: wMon, trained: weeks.has(wMon), isCurrent: wMon === thisMon });
  }
  return {
    weeks: count,
    weeksThis: weeks.has(thisMon),
    lastDate: S.sessions.slice().sort((a,b)=> new Date(b.date)-new Date(a.date))[0]?.date,
    bestWeeks: best,
    totalWeeks: weeks.size,
    weekHistory,
  };
}
function renderStreak(){
  const host = document.getElementById('streak-badge-host');
  if (!host) return;
  const st = calcStreak();
  if (!S.sessions || !S.sessions.length) {
    host.innerHTML = '';
    return;
  }
  const cold = st.weeksThis ? '' : ' cold';
  const tip  = st.weeksThis
    ? st.weeks + ' Wochen in Folge trainiert'
    : 'Trainiere diese Woche, damit die Serie nicht reißt';
  host.innerHTML = `<div class="streak-badge${cold}" title="${tip}" onclick="openStreakDetail()" style="cursor:pointer">
    <span class="streak-fire">${st.weeksThis?_flameSVG(20):'⏳'}</span>
    <span>${st.weeks}</span>
  </div>`;
}
function openStreakDetail() {
  const st = calcStreak();
  document.getElementById('strd-fire').innerHTML = st.weeksThis ? _flameSVG(46, true) : '⏳';
  document.getElementById('strd-weeks').textContent = st.weeks;
  document.getElementById('strd-label').textContent = st.weeks === 1 ? 'Woche in Folge' : 'Wochen in Folge';
  document.getElementById('strd-this-week').innerHTML = st.weeksThis
    ? '<span style="color:#34c759;font-weight:700">✓ Trainiert</span>'
    : '<span style="color:#ff9500;font-weight:600">Noch nicht trainiert</span>';
  document.getElementById('strd-last-date').textContent = st.lastDate
    ? new Date(st.lastDate).toLocaleDateString(GT_LOCALE,{weekday:'short',day:'numeric',month:'long'})
    : '–';
  document.getElementById('strd-best').textContent = st.bestWeeks
    ? st.bestWeeks + (st.bestWeeks === 1 ? ' Woche' : ' Wochen')
    : '–';
  document.getElementById('strd-total-weeks').textContent = st.totalWeeks
    ? st.totalWeeks + (st.totalWeeks === 1 ? ' Woche' : ' Wochen')
    : '–';
  document.getElementById('strd-hist').innerHTML = st.weekHistory.map(w => {
    const cls = ['strd-hist-dot', w.trained?'done':'', w.isCurrent?'current':''].filter(Boolean).join(' ');
    const date = new Date(w.ts).toLocaleDateString(GT_LOCALE,{day:'numeric',month:'short'});
    return `<div class="${cls}" title="${date}"></div>`;
  }).join('');
  const msgs = [
    [12, 'Unglaublich! 3 Monate in Folge — du bist eine Maschine'],
    [8,  'Starke Serie! Bleib dran'],
    [4,  'Super Konstanz! Du bist auf dem richtigen Weg'],
    [2,  'Gut gemacht! Halte die Serie am Leben'],
    [1,  'Guter Start! Trainiere nächste Woche wieder'],
  ];
  const msg = !st.weeksThis && st.weeks === 0
    ? 'Trainiere diese Woche — starte deine Serie!'
    : !st.weeksThis
      ? 'Trainiere diese Woche, damit die Serie nicht reißt!'
      : (msgs.find(([min]) => st.weeks >= min) || [0,'Weiter so!'])[1];
  document.getElementById('strd-msg').textContent = msg;
  openOv('ov-streak');
}

// ── SUCHE im Übungen-Tab ──────────────────────────────
let exSearchText = '';
let _exSearchTimer = null;
function setExSearch(v, clearInput){
  exSearchText = (v||'').trim();
  const clr = document.getElementById('ex-search-clr');
  if (clr) clr.classList.toggle('on', !!exSearchText);
  if (clearInput) {
    const inp = document.getElementById('ex-search');
    if (inp) inp.value = '';
  }
  // Tippen darf nicht auf das Rendern warten: schnelle Anschläge zu einem Render
  // zusammenfassen und dabei nur die Liste neu bauen. Das ✕ (clearInput) rendert
  // sofort, sonst fühlt sich der Tap träge an.
  if (_exSearchTimer) { clearTimeout(_exSearchTimer); _exSearchTimer = null; }
  if (clearInput) { renderExList({ listOnly:true }); return; }
  _exSearchTimer = setTimeout(() => { _exSearchTimer = null; renderExList({ listOnly:true }); }, 90);
}

// ── HEATMAP (letzte 12 Monate, Wochen × Tage) ─────────
function _localDateKey(d) {
  return d.getFullYear() + '-'
    + String(d.getMonth()+1).padStart(2,'0') + '-'
    + String(d.getDate()).padStart(2,'0');
}
// Map lokales YYYY-MM-DD → Tagesvolumen (kg), plus Quartil-Funktion für Stufen 1..4
function _volMap() {
  const map = {};
  S.sessions.forEach(s => {
    const d = new Date(s.date); d.setHours(0,0,0,0);
    const k = _localDateKey(d);
    map[k] = (map[k]||0) + (sessionVolume(s) || 1);
  });
  const active = Object.values(map).filter(v=>v>0).sort((a,b)=>a-b);
  const q = (p) => active.length ? active[Math.min(active.length-1, Math.floor(active.length*p))] : 0;
  const q1=q(.25), q2=q(.50), q3=q(.75);
  const level = (v) => v<=0 ? 0 : (v>q3 ? 4 : v>q2 ? 3 : v>q1 ? 2 : 1);
  return { map, level };
}

const _DOW_MON0 = (d) => (d.getDay()+6)%7; // Mo=0 … So=6
const _WD_LBL   = GT_LANG === 'en' ? ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] : ['Mo','Di','Mi','Do','Fr','Sa','So'];

// ── WOCHENÜBERSICHT (Kreise Mo–So der aktuellen Woche) ──
function renderWeekCircles(){
  const row = document.getElementById('week-circles-row');
  if (!row) return;
  const today = new Date(); today.setHours(0,0,0,0);
  const { map, level } = _volMap();

  // Montag dieser Woche
  const mon = new Date(today);
  mon.setDate(today.getDate() - _DOW_MON0(today));

  let html = '', trained = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon); d.setDate(mon.getDate()+i);
    const k = _localDateKey(d);
    const v = map[k] || 0;
    const lvl = level(v);
    if (v > 0) trained++;
    const isToday  = d.getTime() === today.getTime();
    const isFuture = d > today;
    const cls = [v>0 ? 'l'+lvl : '', isToday?'today':'', isFuture?'future':''].filter(Boolean).join(' ');
    /* Gleiche Bauweise wie im Heute-Widget (siehe hwWeekcal): Kuerzel oben,
       darunter die Kapsel mit dem Datumspunkt. Beide Stellen zeigen dieselbe
       Woche — sie duerfen nicht unterschiedlich aussehen. */
    html += `<div class="week-day${isToday?' is-today':''}">
      <div class="week-day-lbl">${_WD_LBL[i]}</div>
      <div class="week-pill${isToday?' today':''}${isFuture?' future':''}">
        <div class="week-dot ${cls}">${d.getDate()}</div>
      </div>
    </div>`;
  }
  row.innerHTML = html;
  const foot = document.getElementById('week-foot-info');
  if (foot) foot.innerHTML = `<b>${trained}</b> ${trained===1?'Training':'Trainings'} diese Woche`;
}

// ── KALENDER-OVERLAY (letzte Monate) ──
function openCalendarOverlay(){
  haptic(8);
  MX_SEL = null;
  // Zuletzt gewählte Ansicht (Monate/Matrix) wiederherstellen
  const seg = document.getElementById('cal-modes');
  if (seg) {
    seg.dataset.mode = CAL_MODE;
    seg.querySelectorAll('.cal-mode-btn').forEach((b,i) =>
      b.classList.toggle('on', (i===0) === (CAL_MODE==='month')));
  }
  const mv = document.getElementById('cal-view-month');
  const xv = document.getElementById('cal-view-matrix');
  if (mv) mv.hidden = CAL_MODE !== 'month';
  if (xv) xv.hidden = CAL_MODE !== 'matrix';

  _mxApplyFull();
  if (CAL_MODE === 'matrix') renderMatrix(); else renderCalendar();
  openOv('ov-calendar');
  // Erst nach dem Einblenden ans Ende scrollen → aktueller Monat steht unten sichtbar
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (CAL_MODE === 'matrix') {
      // Jetzt steht die echte Kartenbreite fest → Zellgröße exakt neu berechnen
      if (MX_FULL) { renderMatrix(); return; }
      const mx = document.getElementById('mx-scroll');
      if (mx) mx.scrollLeft = mx.scrollWidth;
      return;
    }
    const wrap = document.getElementById('cal-scroll');
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  }));
}
function renderCalendar(monthsBack = 12){
  const wrap = document.getElementById('cal-scroll');
  if (!wrap) return;
  const today = new Date(); today.setHours(0,0,0,0);
  const { map, level } = _volMap();
  const MONATE = GT_LANG === 'en'
    ? ['January','February','March','April','May','June','July','August','September','October','November','December']
    : ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

  // Sessions nach lokalem Datums-Key gruppieren → {label, sesId} pro Trainingstag
  const sessByDay = {};
  (S.sessions || []).forEach(s => {
    const d = new Date(s.date); d.setHours(0,0,0,0);
    const k = _localDateKey(d);
    if (!sessByDay[k]) sessByDay[k] = [];
    sessByDay[k].push(s);
  });
  const dayInfo = (k) => {
    const arr = sessByDay[k];
    if (!arr || !arr.length) return null;
    const s = arr[0];
    return { sesId: s.id, label: deriveTrainingLabel(s) || 'Training' };
  };

  let html = '';
  // Chronologisch: ältester Monat zuerst (oben), aktueller Monat zuletzt (unten)
  for (let mb = monthsBack - 1; mb >= 0; mb--) {
    const ref = new Date(today.getFullYear(), today.getMonth() - mb, 1);
    const year = ref.getFullYear(), month = ref.getMonth();
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const lead = _DOW_MON0(first); // Leerzellen vor dem 1.

    let cells = '';
    const trainedDays = [];
    for (let i = 0; i < lead; i++) cells += `<div class="cal-cell empty"></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const k = _localDateKey(d);
      const v = map[k] || 0;
      const lvl = level(v);
      const isToday  = d.getTime() === today.getTime();
      const isFuture = d > today;
      const info = dayInfo(k);
      const cls = [v>0 ? 'l'+lvl : '', isToday?'today':'', info?'has-sess':''].filter(Boolean).join(' ');
      const title = isFuture ? '' : (info ? info.label + ' · ' + fmtKg(v) : (v>0 ? fmtKg(v) : 'kein Training'));
      const tap = info ? ` onclick="openSessDetail('${info.sesId}')"` : '';
      cells += `<div class="cal-cell ${cls}" title="${title}"${tap}>${day}</div>`;
      if (info) trainedDays.push(`<span class="cal-day-chip" onclick="openSessDetail('${info.sesId}')"><b>${day}.</b> ${info.label}</span>`);
    }
    const dayList = trainedDays.length
      ? `<div class="cal-month-list">${trainedDays.join('')}</div>`
      : '';
    html += `<div class="cal-month">
      <div class="cal-month-title">${MONATE[month]} ${year}</div>
      <div class="cal-grid">${cells}</div>
      ${dayList}
    </div>`;
  }
  wrap.innerHTML = html;
  // Ans Ende scrollen → aktueller Monat steht unten sichtbar
  wrap.scrollTop = wrap.scrollHeight;
}

// ── MATRIX-ANSICHT (Wochen × Wochentage, ganzes Jahr auf einen Blick) ──
const _MX_MON = GT_LANG === 'en'
  ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  : ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
let CAL_MODE   = localStorage.getItem('gt_calMode') || 'month';
let MX_MONTHS  = +(localStorage.getItem('gt_mxRange') || 12) || 12;
let MX_SEL     = null;   // aktuell angetippter Tages-Key
let _MX_SESS   = {};     // Tages-Key → Sessions (beim Rendern gefüllt)

function setCalMode(mode){
  CAL_MODE = mode === 'matrix' ? 'matrix' : 'month';
  localStorage.setItem('gt_calMode', CAL_MODE);
  haptic(8);
  const seg = document.getElementById('cal-modes');
  if (seg) {
    seg.dataset.mode = CAL_MODE;
    seg.querySelectorAll('.cal-mode-btn').forEach((b,i) =>
      b.classList.toggle('on', (i===0) === (CAL_MODE==='month')));
  }
  const mv = document.getElementById('cal-view-month');
  const xv = document.getElementById('cal-view-matrix');
  if (mv) mv.hidden = CAL_MODE !== 'month';
  if (xv) xv.hidden = CAL_MODE !== 'matrix';
  _mxApplyFull();
  if (CAL_MODE === 'matrix') {
    renderMatrix();
  } else {
    renderCalendar();
    const wrap = document.getElementById('cal-scroll');
    if (wrap) requestAnimationFrame(() => { wrap.scrollTop = wrap.scrollHeight; });
  }
}

// Vollansicht: ganze Jahre untereinander, jedes Jahr eine Zeile (kein Querscrollen)
let MX_FULL = localStorage.getItem('gt_mxFull') === '1';

function toggleMxFull(){
  MX_FULL = !MX_FULL;
  localStorage.setItem('gt_mxFull', MX_FULL ? '1' : '0');
  haptic(8);
  _mxApplyFull();
  renderMatrix();
}

function _mxApplyFull(){
  const view = document.getElementById('cal-view-matrix');
  const card = document.querySelector('#ov-calendar .cal-card');
  const btn  = document.getElementById('mx-full-btn');
  // Die Jahres-Ansicht rechnet --mxc/--mxg auf ~5px herunter und schreibt sie
  // INLINE auf dieses Element. Ohne das Aufraeumen erbt die kompakte Ansicht die
  // Miniatur-Zellen: Monatskoepfe schoben sich ineinander ("APMAYJUN") und die
  // Wochentags-Spalte passte nicht mehr zu den Rasterzeilen.
  if (view && !MX_FULL) {
    view.style.removeProperty('--mxc');
    view.style.removeProperty('--mxg');
    view.style.removeProperty('--mxgv');
  }
  if (view) view.classList.toggle('full', MX_FULL);
  if (card) card.classList.toggle('full', MX_FULL && CAL_MODE === 'matrix');
  if (btn)  btn.classList.toggle('on', MX_FULL);
}

function setMxRange(months){
  MX_MONTHS = months;
  localStorage.setItem('gt_mxRange', String(months));
  haptic(6);
  renderMatrix();
}

// Tag im Raster angetippt → Info-Zeile darunter füllen
function mxPick(el){
  const k = el.dataset.k;
  MX_SEL = (MX_SEL === k) ? null : k;
  haptic(5);
  document.querySelectorAll('#mx-scroll .mx-cell.sel').forEach(c => c.classList.remove('sel'));
  if (MX_SEL) el.classList.add('sel');
  _mxRenderSel();
}

function _mxRenderSel(){
  const box = document.getElementById('mx-sel');
  if (!box) return;
  if (!MX_SEL) {
    box.className = 'mx-sel empty';
    box.onclick = null;
    box.textContent = 'Feld antippen für Details';
    return;
  }
  const [y,m,d] = MX_SEL.split('-').map(Number);
  const dt = new Date(y, m-1, d);
  const dLbl = dt.toLocaleDateString(GT_LOCALE, {weekday:'short', day:'numeric', month:'short'});
  const arr  = _MX_SESS[MX_SEL] || [];
  if (!arr.length) {
    box.className = 'mx-sel';
    box.onclick = null;
    box.innerHTML = `<span class="mx-sel-d">${dLbl}</span>
      <span style="color:var(--text2)">Kein Training</span>`;
    return;
  }
  const vol   = arr.reduce((a,s) => a + (sessionVolume(s) || 0), 0);
  const label = arr.map(s => deriveTrainingLabel(s) || 'Training').join(' · ');
  box.className = 'mx-sel tap';
  box.onclick = () => openSessDetail(arr[0].id);
  box.innerHTML = `<span class="mx-sel-d">${dLbl}</span>
    <span>${label}</span>
    <span class="mx-sel-v">${fmtKg(vol)} ›</span>`;
}

// Jahres-Blöcke: pro Jahr eine Zeile aus 53 Wochen-Spalten, neuestes Jahr oben.
// Die Zellgröße wird aus der verfügbaren Breite berechnet, damit nichts quer scrollt.
function _mxRenderYears(wrap, today, map, level){
  const nowY = today.getFullYear();
  let firstY = nowY;
  (S.sessions || []).forEach(s => {
    const y = new Date(s.date).getFullYear();
    if (y && y < firstY) firstY = y;
  });

  const years = [];
  for (let y = nowY; y >= firstY; y--) years.push(y);

  // Zellgröße: 53 Spalten + Wochentags-Spalte müssen in die Kartenbreite passen
  const gap   = 2;
  const wdW   = 22;
  const avail = Math.max(160, (wrap.clientWidth || 340) - wdW - 5);
  const cell  = Math.max(3, Math.floor((avail - 52*gap) / 53));
  const view  = document.getElementById('cal-view-matrix');
  // Vertikal mehr Luft als horizontal: nur so ist die Zeilenhoehe (Zelle + Abstand)
  // gross genug, dass alle sieben Wochentags-Labels nebeneinander Platz haben.
  if (view) {
    view.style.setProperty('--mxc', cell+'px');
    view.style.setProperty('--mxg', gap+'px');
    view.style.setProperty('--mxgv', Math.max(gap, 9 - cell) + 'px');
  }

  let html = '';
  years.forEach(year => {
    const jan1 = new Date(year, 0, 1);
    const start = new Date(jan1);
    start.setDate(jan1.getDate() - _DOW_MON0(jan1));   // Montag der 1. Kalenderwoche
    const dec31 = new Date(year, 11, 31);
    // Tage erst runden: faellt eine Zeitumstellung dazwischen, ist die Differenz
    // um eine Stunde daneben und Math.ceil haengt eine leere 54. Spalte an.
    const weeks = Math.ceil((Math.round((dec31 - start) / 86400000) + 1) / 7);

    // Monatszeile: 12 gleich breite Spalten über die volle Jahresbreite.
    // (Wochen-genaue Positionen würden DEZ über den rechten Rand schieben.)
    const months = _MX_MON.map(m => `<div class="mx-m12">${m}</div>`).join('');

    let cols = '', count = 0;
    for (let w = 0; w < weeks; w++) {
      const colStart = new Date(start); colStart.setDate(start.getDate() + w*7);

      let cells = '';
      for (let i = 0; i < 7; i++) {
        const d = new Date(colStart); d.setDate(colStart.getDate() + i);
        if (d.getFullYear() !== year) { cells += `<div class="mx-cell void"></div>`; continue; }
        if (d > today)                { cells += `<div class="mx-cell future"></div>`; continue; }
        const k   = _localDateKey(d);
        const v   = map[k] || 0;
        const arr = _MX_SESS[k];
        if (arr) count += arr.length;
        const cls = [
          'cal-cell','mx-cell',
          v > 0 ? 'l' + level(v) : '',
          d.getTime() === today.getTime() ? 'today' : '',
          MX_SEL === k ? 'sel' : '',
          'tap'
        ].filter(Boolean).join(' ');
        cells += `<div class="${cls}" data-k="${k}" onclick="mxPick(this)"></div>`;
      }
      cols += `<div class="mx-col">${cells}</div>`;
    }

    html += `<div class="mx-year">
      <div class="mx-year-head"><b>${year}</b><span>${count} ${count===1?'Training':'Trainings'}</span></div>
      <div class="mx-year-body">
        <div class="mx-wdcol">
          <span></span>${_WD_LBL.map(l => `<span>${l}</span>`).join('')}
        </div>
        <div class="mx-cols">
          <div class="mx-mrow m12">${months}</div>
          <div class="mx-grid">${cols}</div>
        </div>
      </div>
    </div>`;
  });

  const wd = document.getElementById('mx-wd');
  if (wd) wd.innerHTML = '';                     // eigene Spalte pro Jahresblock
  wrap.innerHTML = html || `<div class="mx-year-empty">Noch keine Trainings.</div>`;
  wrap.scrollTop = 0;
}

function renderMatrix(){
  const wrap = document.getElementById('mx-scroll');
  if (!wrap) return;
  const today = new Date(); today.setHours(0,0,0,0);
  const { map, level } = _volMap();

  // Sessions nach Tag gruppieren (für Antippen + Info-Zeile)
  _MX_SESS = {};
  (S.sessions || []).forEach(s => {
    const d = new Date(s.date); d.setHours(0,0,0,0);
    const k = _localDateKey(d);
    (_MX_SESS[k] = _MX_SESS[k] || []).push(s);
  });

  _mxApplyFull();
  if (MX_FULL) { _mxRenderYears(wrap, today, map, level); _mxRenderSel(); return; }

  // Range-Chips spiegeln
  const rg = document.getElementById('mx-range');
  if (rg) rg.querySelectorAll('button').forEach(b =>
    b.classList.toggle('on', b.textContent.trim().startsWith(MX_MONTHS===12 ? '1' : String(MX_MONTHS))));

  // Start = Montag der Woche, in der der erste Tag des Startmonats liegt
  const start = new Date(today.getFullYear(), today.getMonth() - (MX_MONTHS - 1), 1);
  start.setDate(start.getDate() - _DOW_MON0(start));
  // Ende = Sonntag der aktuellen Woche → letzte Spalte ist immer voll
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - _DOW_MON0(today)));
  const weeks = Math.round((end - start) / (7*86400000)) + 1;

  const MON_S = _MX_MON;

  let cols = '';
  let lastMonth = -1, sessCount = 0, bestStreak = 0, curStreak = 0;
  const monAt = [];                       // {w, mo} — Spalte, in der ein Monat beginnt

  for (let w = 0; w < weeks; w++) {
    const colStart = new Date(start); colStart.setDate(start.getDate() + w*7);

    // Monatswechsel nur merken (und nicht in der letzten Spalte, sonst läuft die
    // Schrift aus dem Raster). Die Zeile entsteht erst nach der Schleife.
    const mo = colStart.getMonth();
    if (mo !== lastMonth && w < weeks - 1) { monAt.push({ w, mo }); lastMonth = mo; }

    let cells = '', weekTrained = false;
    for (let i = 0; i < 7; i++) {
      const d = new Date(colStart); d.setDate(colStart.getDate() + i);
      const k = _localDateKey(d);
      const v = map[k] || 0;
      const arr = _MX_SESS[k];
      if (d > today) { cells += `<div class="mx-cell future"></div>`; continue; }
      if (arr) { sessCount += arr.length; weekTrained = true; }
      const cls = [
        'cal-cell','mx-cell',
        v > 0 ? 'l' + level(v) : '',
        d.getTime() === today.getTime() ? 'today' : '',
        MX_SEL === k ? 'sel' : '',
        'tap'
      ].filter(Boolean).join(' ');
      cells += `<div class="${cls}" data-k="${k}" onclick="mxPick(this)"></div>`;
    }
    cols += `<div class="mx-col">${cells}</div>`;

    if (weekTrained) { curStreak++; if (curStreak > bestStreak) bestStreak = curStreak; }
    else curStreak = 0;
  }

  // Ein Monatskuerzel ist breiter als eine Spalte und laeuft nach rechts aus.
  // Beginnt der Zeitraum mitten in einem Monat, liegen die ersten beiden Wechsel
  // oft nur eine Spalte auseinander — die Labels klebten dann aneinander
  // ("APRMAY"). In dem Fall gewinnt der spaetere, vollstaendige Monat.
  const monKeep = new Map();
  monAt.forEach((m, i) => {
    const next = monAt[i + 1];
    if (!next || next.w - m.w >= 2) monKeep.set(m.w, m.mo);
  });
  let months = '';
  for (let w = 0; w < weeks; w++)
    months += `<div class="mx-m">${monKeep.has(w) ? MON_S[monKeep.get(w)] : ''}</div>`;

  // Kompakte Ansicht: alle sieben Wochentage beschriften. Die Zeilen sind hier
  // 15px hoch (+4px Abstand) — die 9px-Labels passen vollstaendig hinein. Nur die
  // gedraengte Jahres-Ansicht laesst weiterhin jede zweite Zeile leer.
  const wd = document.getElementById('mx-wd');
  if (wd) wd.innerHTML = `<span></span>` +
    _WD_LBL.map(l => `<span>${l}</span>`).join('');

  wrap.innerHTML = `<div class="mx-cols">
    <div class="mx-mrow">${months}</div>
    <div class="mx-grid">${cols}</div>
  </div>`;

  // Kennzahlen über dem Raster
  const st = document.getElementById('mx-stats');
  if (st) {
    const perWeek = weeks ? (sessCount / weeks) : 0;
    st.innerHTML = `
      <div class="mx-stat"><b>${sessCount}</b><span>Trainings</span></div>
      <div class="mx-stat"><b>${perWeek.toFixed(1).replace('.', GT_DEC)}</b><span>Ø pro Woche</span></div>
      <div class="mx-stat"><b>${bestStreak}</b><span>Beste Serie</span></div>`;
  }
  _mxRenderSel();
  // Jüngste Woche sichtbar: ganz nach rechts scrollen
  requestAnimationFrame(() => { wrap.scrollLeft = wrap.scrollWidth; });
}

// ── ÜBUNGS-BIBLIOTHEK ──────────────────────────────────
// Die Daten (EX_LIBRARY) stehen in js/app-exdb.js — laedt VOR dieser Datei.
let _libCat = 'alle';
let _libT   = null;
// Deckel pro Ansicht: die Bibliothek hat >1.300 Eintraege. Nicht das Rendern ist
// das Problem, sondern der i18n-MutationObserver — der schickt jeden neuen
// Textknoten durch tr(). Deshalb Deckel + Debounce wie in renderExList.
const LIB_MAX = 150;
function libSearchInput(){ clearTimeout(_libT); _libT = setTimeout(renderExLibrary, 110); }
function openExLibrary(){
  haptic(8);
  _libCat = 'alle';
  clearTimeout(_libT);
  const s = document.getElementById('lib-search'); if (s) s.value = '';
  renderExLibrary();
  openOv('ov-ex-lib');
}
function setLibCat(id){ _libCat = id; renderExLibrary(); }
function _libMatch(it, cat, q){
  if (cat !== 'alle' && it.mg !== cat) return false;
  if (q && !_normSearch(it.n).includes(q)) return false;
  return true;
}
function renderExLibrary(){
  const cats = [{id:'alle',label:'Alle'}, ...MUSCLE_GROUPS];
  const catBar = document.getElementById('lib-cat-row');
  if (catBar) {
    catBar.innerHTML = cats.map(c =>
      `<button class="lib-cat${_libCat===c.id?' on':''}" onclick="setLibCat('${c.id}')">${c.label}</button>`
    ).join('');
  }
  const q = _normSearch(document.getElementById('lib-search')?.value || '').trim();
  const list = document.getElementById('lib-list');
  const existingNames = new Set(S.exercises.map(e => e.name.toLowerCase()));
  // Globaler Index statt Position in der gefilterten Liste: pickExFromLibrary
  // loest direkt auf, statt die Filterung zeichengleich nachbauen zu muessen.
  const items = [];
  for (let i = 0; i < EX_LIBRARY.length; i++) {
    if (_libMatch(EX_LIBRARY[i], _libCat, q)) items.push(i);
  }
  if (!items.length) {
    list.innerHTML = `<div style="padding:30px 10px;text-align:center;color:var(--text2);font-size:14px">Keine Übungen gefunden.</div>`;
    return;
  }
  const shown = items.slice(0, LIB_MAX);
  let html = shown.map(gi => {
    const it = EX_LIBRARY[gi];
    const has = existingNames.has(it.n.toLowerCase());
    return `<div class="lib-item" onclick="pickExFromLibrary(${gi})">
      <div style="flex:1;min-width:0">
        <div class="lib-name">${esc(it.n)}</div>
        <div class="lib-mg">${it.mg ? muscleLabel(it.mg) : '—'} · Ziel ${it.s}×${it.t==='time'?fmtSec(it.r):it.r}</div>
      </div>
      ${has ? '<span class="lib-already">vorhanden</span>' : ''}
    </div>`;
  }).join('');
  if (items.length > shown.length) {
    html += `<div style="padding:14px 10px 4px;text-align:center;color:var(--text2);font-size:13px">Mehr Treffer vorhanden · Suche verfeinern</div>`;
  }
  list.innerHTML = html;
}
function pickExFromLibrary(gi){
  const it = EX_LIBRARY[gi];
  if (!it) return;
  haptic(15);
  // Werte ins Formular übernehmen
  document.getElementById('in-name').value = it.n;
  document.getElementById('in-sets').value = it.s;
  if (it.t === 'time') {
    document.getElementById('in-reps').value = it.r;
  } else {
    document.getElementById('in-reps-min').value = Math.max(1, it.r - 2);
    document.getElementById('in-reps').value = it.r + 2;
  }
  selEmoji  = it.e || '';
  selMuscle = it.mg || '';
  selScheme = 'straight';
  setExType(it.t === 'time' ? 'time' : 'reps');
  renderSchemeSeg();
  renderEmoGrid();
  renderMusclePicker();
  closeOv('ov-ex-lib');
}

// ── TRAININGSPLAN-VORLAGEN ────────────────────────────
// Sortierung: aufsteigend nach Trainingstagen. Der Vorlagen-Picker im Plan-Tab
// zeigt sie in genau dieser Reihenfolge; im Onboarding entscheidet das Scoring
// (_obScoreTpl), dort ist die Array-Position nur noch der Gleichstands-Brecher.
//
// fit = Passung zu den Onboarding-Antworten:
//   goals  Ziel aus OB_GOALS      ('muskel'|'kraft'|'abnehmen'|'fit')
//   exps   Erfahrung aus OB_EXPS  ('neu'|'mittel'|'profi')
//   freq   Trainingstage pro Woche, für die die Vorlage gedacht ist
// Ohne fit fällt eine Vorlage im Onboarding hinter alle anderen zurück, bleibt
// im Plan-Tab aber normal auswählbar.
//
// scheme = Satz-/Wiederholungsschema {s, r, band}. Ohne das erbte jede Übung
// stumpf die DB-Vorgabe (meist 3×8–12) — ein Kraftplan mit 3×8 ist aber
// Etikettenschwindel. Aufloesung in _tplTargets: Einzel-Override > Tages-scheme
// > Vorlagen-scheme > DB. Zeit-Uebungen (Plank & Co.) ignorieren das Schema,
// sonst wuerde aus 5×5 ein 5-Sekunden-Plank.
const PLAN_TEMPLATES = [
  // ══ 2 TAGE ═════════════════════════════════════════
  {
    id:'fullbody2', emoji:'🌱', title:'Ganzkörper (2×/Woche)', freq:'2 Tage',
    fit:{goals:['fit','abnehmen','muskel','kraft'], exps:['neu','mittel'], freq:[2]},
    scheme:{s:3, r:10},
    desc:'Zwei Ganzkörper-Einheiten mit allen Grundbewegungen. Das Minimum, mit dem du sichtbar vorankommst.',
    days:{
      mon:{type:'exercises', libNames:['Kniebeugen','Bankdrücken','Latzug','Schulterdrücken','Plank']},
      tue:{type:'none'},
      wed:{type:'none'},
      thu:{type:'exercises', libNames:['Rumänisches Kreuzheben','Beinpresse','Kurzhantel-Rudern','KH-Schulterdrücken','Crunches']},
      fri:{type:'none'},
      sat:{type:'none'},
      sun:{type:'none'}
    }
  },
  {
    id:'upperlower2', emoji:'⚖️', title:'Ober · Unterkörper (2×/Woche)', freq:'2 Tage',
    fit:{goals:['muskel','kraft'], exps:['mittel','profi'], freq:[2]},
    scheme:{s:4, r:8},
    desc:'Ein Oberkörper- und ein Unterkörpertag. Mehr Volumen pro Einheit als Ganzkörper, wenn du nur zweimal kannst.',
    days:{
      mon:{type:'none'},
      tue:{type:'exercises', libNames:['Bankdrücken','Klimmzüge','Schulterdrücken','Bizeps-Curls (LH)','Trizepsdrücken (Kabel)']},
      wed:{type:'none'},
      thu:{type:'none'},
      fri:{type:'exercises', libNames:['Kniebeugen','Rumänisches Kreuzheben','Beinpresse','Beinbeuger','Wadenheben']},
      sat:{type:'none'},
      sun:{type:'none'}
    }
  },
  // ══ 3 TAGE ═════════════════════════════════════════
  {
    id:'fullbody3', emoji:'💪', title:'Full Body (3×/Woche)', freq:'3 Tage',
    fit:{goals:['fit','abnehmen','muskel'], exps:['neu'], freq:[3]},
    scheme:{s:3, r:10},
    desc:'Ganzkörper jeweils Mo/Mi/Fr. Ideal für Einsteiger oder bei wenig Zeit.',
    days:{
      mon:{type:'exercises', libNames:['Kniebeugen','Bankdrücken','Rudern (Langhantel)','Schulterdrücken','Plank']},
      tue:{type:'none'},
      wed:{type:'exercises', libNames:['Kreuzheben','Klimmzüge','KH-Schulterdrücken','Beinpresse','Crunches']},
      thu:{type:'none'},
      fri:{type:'exercises', libNames:['Kniebeugen','Schrägbankdrücken','Latzug','Seitheben','Beinheben']},
      sat:{type:'none'},
      sun:{type:'none'}
    }
  },
  {
    id:'ppl3', emoji:'🏋️', title:'Push · Pull · Legs (3×/Woche)', freq:'3 Tage',
    fit:{goals:['muskel','kraft'], exps:['neu','mittel'], freq:[3]},
    scheme:{s:3, r:10},
    desc:'Einsteiger-Variante: Eine PPL-Runde pro Woche mit 1–2 Tagen Pause zwischen Einheiten.',
    days:{
      mon:{type:'exercises', libNames:['Bankdrücken','Schulterdrücken','Schrägbankdrücken','Seitheben','Trizepsdrücken (Kabel)']},
      tue:{type:'none'},
      wed:{type:'exercises', libNames:['Klimmzüge','Rudern (Langhantel)','Latzug','Bizeps-Curls (LH)','Face Pulls']},
      thu:{type:'none'},
      fri:{type:'exercises', libNames:['Kniebeugen','Rumänisches Kreuzheben','Beinpresse','Beinbeuger','Wadenheben']},
      sat:{type:'none'},
      sun:{type:'none'}
    }
  },
  {
    id:'strength3', emoji:'🥇', title:'Grundübungen-Kraft (3×/Woche)', freq:'3 Tage',
    fit:{goals:['kraft'], exps:['neu','mittel'], freq:[3]},
    scheme:{s:5, r:5, band:1},
    desc:'Drei kurze Einheiten aus schweren Grundübungen — 5 Sätze à 5 Wiederholungen. Wenig Übungen, viel Gewicht.',
    days:{
      mon:{type:'exercises', libNames:['Kniebeugen','Bankdrücken','Rudern (Langhantel)','Plank']},
      tue:{type:'none'},
      wed:{type:'exercises', libNames:['Front-Kniebeuge','Schulterdrücken',{n:'Kreuzheben', s:3, r:5, band:1},{n:'Hyperextensions', s:3, r:12}]},
      thu:{type:'none'},
      fri:{type:'exercises', libNames:['Kniebeugen','Schrägbankdrücken','Klimmzüge',{n:'Engers Bankdrücken', s:3, r:8}]},
      sat:{type:'none'},
      sun:{type:'none'}
    }
  },
  {
    id:'circuit3', emoji:'🔥', title:'Ganzkörper-Zirkel (3×/Woche)', freq:'3 Tage',
    fit:{goals:['abnehmen','fit'], exps:['neu','mittel'], freq:[3]},
    scheme:{s:3, r:15, band:3},
    desc:'Ganzkörper mit hohen Wiederholungen und kurzen Pausen. Viel Bewegung pro Einheit, gut zum Abnehmen.',
    days:{
      mon:{type:'exercises', libNames:['Goblet Squat','Liegestütze','Kurzhantel-Rudern','KH-Schulterdrücken','Mountain Climbers']},
      tue:{type:'none'},
      wed:{type:'exercises', libNames:['Ausfallschritte (KH)','Latzug','Brustpresse (Maschine)','Plank','Russian Twists']},
      thu:{type:'none'},
      fri:{type:'exercises', libNames:['Beinpresse','Kabelrudern sitzend','Kabelzug Brust','Seitheben','Bicycle Crunches']},
      sat:{type:'none'},
      sun:{type:'none'}
    }
  },
  // ══ 4 TAGE ═════════════════════════════════════════
  {
    id:'upperlower', emoji:'⬆️', title:'Upper · Lower (4×/Woche)', freq:'4 Tage',
    fit:{goals:['muskel','kraft'], exps:['mittel','profi'], freq:[4]},
    scheme:{s:4, r:8},
    desc:'Oberkörper- und Unterkörper-Splits jeweils zweimal. Solide Mischung aus Volumen und Erholung.',
    days:{
      mon:{type:'exercises', libNames:['Bankdrücken','Rudern (Langhantel)','Schulterdrücken','Klimmzüge','Bizeps-Curls (LH)']},
      tue:{type:'exercises', libNames:['Kniebeugen','Rumänisches Kreuzheben','Beinpresse','Beinbeuger','Wadenheben']},
      wed:{type:'none'},
      thu:{type:'exercises', libNames:['Schrägbankdrücken','Kurzhantel-Rudern','KH-Schulterdrücken','Latzug','Trizepsdrücken (Kabel)']},
      fri:{type:'exercises', libNames:['Kreuzheben','Front-Kniebeuge','Ausfallschritte','Beinstrecker','Hip Thrust']},
      sat:{type:'none'},
      sun:{type:'none'}
    }
  },
  {
    id:'ppl4', emoji:'🔁', title:'Push · Pull · Legs · Oberkörper (4×/Woche)', freq:'4 Tage',
    fit:{goals:['muskel'], exps:['mittel','profi'], freq:[4]},
    scheme:{s:4, r:10},
    desc:'Eine PPL-Runde plus ein zusätzlicher Oberkörpertag. Brust, Rücken und Schultern kommen zweimal pro Woche dran.',
    days:{
      mon:{type:'exercises', libNames:['Bankdrücken','Schulterdrücken','Schrägbankdrücken (KH)','Seitheben','Trizepsdrücken (Seil)']},
      tue:{type:'exercises', libNames:['Klimmzüge','Rudern (Langhantel)','Latzug (neutral)','Face Pulls','Bizeps-Curls (SZ-Stange)']},
      wed:{type:'none'},
      thu:{type:'exercises', libNames:['Kniebeugen','Rumänisches Kreuzheben','Beinpresse','Beinbeuger sitzend','Wadenheben']},
      fri:{type:'exercises', libNames:['Schrägbankdrücken','Brustgestütztes Rudern','KH-Schulterdrücken','Hammer-Curls','Überkopf-Trizepsdrücken']},
      sat:{type:'none'},
      sun:{type:'none'}
    }
  },
  {
    id:'strength4', emoji:'🧱', title:'Kraft: Ober · Unterkörper (4×/Woche)', freq:'4 Tage',
    fit:{goals:['kraft'], exps:['mittel','profi'], freq:[4]},
    scheme:{s:4, r:8},
    desc:'Je ein schwerer und ein leichterer Ober- und Unterkörpertag. Schwer für Maximalkraft (5×5), leicht für Technik und Volumen.',
    days:{
      mon:{type:'exercises', scheme:{s:5, r:5, band:1}, libNames:['Bankdrücken','Rudern (Langhantel)','Schulterdrücken',{n:'Engers Bankdrücken', s:3, r:8}]},
      tue:{type:'exercises', scheme:{s:5, r:5, band:1}, libNames:['Kniebeugen',{n:'Kreuzheben', s:3, r:5, band:1},'Beinpresse',{n:'Wadenheben', s:4, r:12}]},
      wed:{type:'none'},
      thu:{type:'exercises', libNames:['Bankdrücken mit Pause','Klimmzüge','KH-Schulterdrücken','Face Pulls','Bizeps-Curls (LH)']},
      fri:{type:'exercises', libNames:['Front-Kniebeuge','Rumänisches Kreuzheben','Bulgarian Split Squats','Beinbeuger','Hyperextensions']},
      sat:{type:'none'},
      sun:{type:'none'}
    }
  },
  {
    id:'fullbody4', emoji:'⚡', title:'Ganzkörper kurz (4×/Woche)', freq:'4 Tage',
    fit:{goals:['fit','abnehmen'], exps:['neu','mittel'], freq:[4]},
    scheme:{s:3, r:12},
    desc:'Vier kurze Ganzkörper-Einheiten mit je vier Übungen. Passt auch in eine halbe Stunde.',
    days:{
      mon:{type:'exercises', libNames:['Kniebeugen','Bankdrücken','Latzug','Plank']},
      tue:{type:'exercises', libNames:['Rumänisches Kreuzheben','Schulterdrücken','Kabelrudern sitzend','Crunches']},
      wed:{type:'none'},
      thu:{type:'exercises', libNames:['Beinpresse','Schrägbankdrücken (KH)','Klimmzüge','Russian Twists']},
      fri:{type:'exercises', libNames:['Ausfallschritte','Butterfly (Maschine)','Kurzhantel-Rudern','Beinheben']},
      sat:{type:'none'},
      sun:{type:'none'}
    }
  },
  {
    id:'bodypart4', emoji:'🎯', title:'Muskelgruppen-Split (4×/Woche)', freq:'4 Tage',
    fit:{goals:['muskel'], exps:['neu','mittel'], freq:[4]},
    scheme:{s:4, r:10},
    desc:'Brust & Trizeps, Rücken & Bizeps, Beine, Schultern & Core. Jede Gruppe hat ihren eigenen Tag.',
    days:{
      mon:{type:'exercises', libNames:['Bankdrücken','Schrägbankdrücken','Butterfly (Maschine)','Trizepsdrücken (Kabel)','Dips']},
      tue:{type:'exercises', libNames:['Klimmzüge','Rudern (Langhantel)','Latzug','Bizeps-Curls (LH)','Hammer-Curls']},
      wed:{type:'none'},
      thu:{type:'exercises', libNames:['Kniebeugen','Beinpresse','Beinbeuger','Beinstrecker','Wadenheben']},
      fri:{type:'exercises', libNames:['Schulterdrücken','Seitheben','Reverse Flys','Shrugs','Plank']},
      sat:{type:'none'},
      sun:{type:'none'}
    }
  },
  // ══ 5 TAGE ═════════════════════════════════════════
  {
    id:'bro5', emoji:'🧩', title:'Muskelgruppen-Split (5×/Woche)', freq:'5 Tage',
    fit:{goals:['muskel','abnehmen'], exps:['neu','mittel'], freq:[5]},
    scheme:{s:4, r:10},
    desc:'Klassischer Bro-Split: Brust, Rücken, Beine, Schultern, Arme — jeweils ein ganzer Tag pro Gruppe.',
    days:{
      mon:{type:'exercises', libNames:['Bankdrücken','Schrägbankdrücken','Kurzhantel-Bankdrücken','Fliegende','Kabel-Crossover']},
      tue:{type:'exercises', libNames:['Klimmzüge','Rudern (Langhantel)','Latzug','T-Bar Rudern','Face Pulls']},
      wed:{type:'exercises', libNames:['Kniebeugen','Beinpresse','Rumänisches Kreuzheben','Beinbeuger','Wadenheben']},
      thu:{type:'exercises', libNames:['Schulterdrücken','Seitheben','Reverse Flys','Frontheben','Shrugs']},
      fri:{type:'exercises', libNames:['Bizeps-Curls (LH)','Hammer-Curls','Preacher Curls','Trizepsdrücken (Seil)','Überkopf-Trizepsdrücken']},
      sat:{type:'none'},
      sun:{type:'none'}
    }
  },
  {
    id:'ppl5', emoji:'🌀', title:'Push · Pull · Legs · Ober · Unter (5×/Woche)', freq:'5 Tage',
    fit:{goals:['muskel'], exps:['mittel','profi'], freq:[5]},
    scheme:{s:4, r:10},
    desc:'PPL zum Wochenstart, danach je ein Ober- und Unterkörpertag. Hohes Volumen bei fünf Tagen.',
    days:{
      mon:{type:'exercises', libNames:['Bankdrücken','Schulterdrücken','Schrägbankdrücken (KH)','Seitheben','Trizepsdrücken (Seil)']},
      tue:{type:'exercises', libNames:['Klimmzüge','Rudern (Langhantel)','Latzug (neutral)','Face Pulls','Bizeps-Curls (SZ-Stange)']},
      wed:{type:'exercises', libNames:['Kniebeugen','Rumänisches Kreuzheben','Beinpresse','Beinbeuger sitzend','Wadenheben']},
      thu:{type:'none'},
      fri:{type:'exercises', libNames:['Schrägbankdrücken','Brustgestütztes Rudern','Arnold Press','Hammer-Curls','Überkopf-Trizepsdrücken']},
      sat:{type:'exercises', libNames:['Front-Kniebeuge','Bulgarian Split Squats','Hip Thrust','Beinstrecker','Wadenheben']},
      sun:{type:'none'}
    }
  },
  {
    id:'upperlower5', emoji:'🧨', title:'Ober · Unter · Ganzkörper (5×/Woche)', freq:'5 Tage',
    fit:{goals:['kraft','muskel'], exps:['profi'], freq:[5]},
    scheme:{s:4, r:8},
    desc:'Zweimal Ober-, zweimal Unterkörper plus ein Ganzkörpertag obendrauf. Sehr hohes Volumen, nur mit guter Regeneration.',
    days:{
      mon:{type:'exercises', libNames:['Bankdrücken','Rudern (Langhantel)','Schulterdrücken','Klimmzüge','Trizepsdrücken (Kabel)']},
      tue:{type:'exercises', libNames:['Kniebeugen','Rumänisches Kreuzheben','Beinpresse','Beinbeuger','Wadenheben']},
      wed:{type:'none'},
      thu:{type:'exercises', libNames:['Schrägbankdrücken','Kurzhantel-Rudern','KH-Schulterdrücken','Latzug','Bizeps-Curls (LH)']},
      fri:{type:'exercises', libNames:['Kreuzheben','Front-Kniebeuge','Bulgarian Split Squats','Beinstrecker','Hip Thrust']},
      sat:{type:'exercises', libNames:['Push Press','Pendlay-Rudern','Goblet Squat','Face Pulls','Hängendes Beinheben']},
      sun:{type:'none'}
    }
  },
  // ══ 6 TAGE ═════════════════════════════════════════
  {
    id:'ppl6', emoji:'🔄', title:'Push · Pull · Legs (6×/Woche)', freq:'6 Tage',
    fit:{goals:['muskel','kraft','abnehmen'], exps:['mittel','profi'], freq:[6]},
    scheme:{s:4, r:10},
    desc:'Klassisches Bodybuilding-Schema. Push (Brust/Schulter/Trizeps), Pull (Rücken/Bizeps), Legs zweimal die Woche.',
    days:{
      mon:{type:'exercises', libNames:['Bankdrücken','Schrägbankdrücken','Schulterdrücken','Seitheben','Trizepsdrücken (Kabel)']},
      tue:{type:'exercises', libNames:['Klimmzüge','Rudern (Langhantel)','Latzug','Face Pulls','Bizeps-Curls (LH)']},
      wed:{type:'exercises', libNames:['Kniebeugen','Rumänisches Kreuzheben','Beinpresse','Beinbeuger','Wadenheben']},
      thu:{type:'exercises', libNames:['Kurzhantel-Bankdrücken','Fliegende','KH-Schulterdrücken','Reverse Flys','French Press']},
      fri:{type:'exercises', libNames:['Kreuzheben','T-Bar Rudern','Kurzhantel-Rudern','Hammer-Curls','Shrugs']},
      sat:{type:'exercises', libNames:['Front-Kniebeuge','Ausfallschritte','Hip Thrust','Beinstrecker','Wadenheben']},
      sun:{type:'none'}
    }
  },
  {
    id:'arnold', emoji:'🏆', title:'Arnold Split (6×/Woche)', freq:'6 Tage',
    fit:{goals:['muskel'], exps:['profi'], freq:[6]},
    scheme:{s:4, r:10},
    desc:'Brust+Rücken, Schultern+Arme, Beine — zweimal pro Woche. Hohes Volumen, fortgeschritten.',
    days:{
      mon:{type:'exercises', libNames:['Bankdrücken','Schrägbankdrücken','Klimmzüge','Rudern (Langhantel)','Fliegende']},
      tue:{type:'exercises', libNames:['Schulterdrücken','Seitheben','Bizeps-Curls (LH)','Trizepsdrücken (Kabel)','Hammer-Curls']},
      wed:{type:'exercises', libNames:['Kniebeugen','Rumänisches Kreuzheben','Beinpresse','Beinbeuger','Wadenheben']},
      thu:{type:'exercises', libNames:['Kurzhantel-Bankdrücken','Fliegende','Latzug','T-Bar Rudern','Pullover']},
      fri:{type:'exercises', libNames:['Arnold Press','Reverse Flys','Hammer-Curls','French Press','Preacher Curls']},
      sat:{type:'exercises', libNames:['Front-Kniebeuge','Ausfallschritte','Hip Thrust','Beinstrecker','Wadenheben']},
      sun:{type:'none'}
    }
  }
];
function openTemplatePicker(){
  haptic(8);
  renderTemplatePicker();
  openOv('ov-plan-tpl');
}
function renderTemplatePicker(){
  const el = document.getElementById('tpl-list');
  if (!el) return;
  el.innerHTML = PLAN_TEMPLATES.map(t => {
    const days = Object.entries(t.days).filter(([_,v])=>v.type!=='none').map(([k]) => dayByKey(k).short);
    const sch  = _obTplSchemeLbl(t);
    return `<button class="tpl-card" onclick="applyTemplate('${t.id}')">
      <div class="tpl-card-head">
        <span class="tpl-card-title">${t.title}</span>
        <span class="tpl-card-freq">${t.freq}</span>
      </div>
      <div class="tpl-card-desc">${t.desc}</div>
      ${sch ? `<div class="tpl-card-desc">Schema: ${sch}</div>` : ''}
      <div class="tpl-card-days">${days.map(d => `<span class="tpl-day-chip">${d}</span>`).join('')}</div>
    </button>`;
  }).join('');
}
function applyTemplate(id){
  const tpl = PLAN_TEMPLATES.find(t => t.id === id);
  if (!tpl) return;
  if (!confirm('Aktuellen Wochenplan überschreiben mit „'+tpl.title+'"?')) return;
  haptic(20);
  _applyTemplateCore(tpl);
  closeOv('ov-plan-tpl');
  renderPlanList();
  renderExList();
  renderHome();
  // Toast
  const t = document.getElementById('update-toast');
  if (t) { t.textContent = '✓ Plan übernommen: ' + tpl.title; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 2400); }
}

// Kern der Plan-Übernahme — auch vom Onboarding genutzt (ohne Confirm/Toast/Sheet)
// Split-Namen pro Vorlagen-Tag → aus dem Import werden echte, benannte Splits
// (gleiches Label = ein Split, Übungen werden vereinigt). So bekommen die Tage
// Farbe + sprechendes Label (Push/Pull/Ober/Unter …) und sind normal editierbar.
const _TPL_DAY_LABELS = {
  fullbody2:   { mon:'Ganzkörper A', thu:'Ganzkörper B' },
  upperlower2: { tue:'Oberkörper', fri:'Unterkörper' },
  fullbody3:   { mon:'Ganzkörper', wed:'Ganzkörper', fri:'Ganzkörper' },
  ppl3:        { mon:'Push', wed:'Pull', fri:'Legs' },
  strength3:   { mon:'Kraft A', wed:'Kraft B', fri:'Kraft C' },
  circuit3:    { mon:'Zirkel A', wed:'Zirkel B', fri:'Zirkel C' },
  upperlower:  { mon:'Oberkörper', tue:'Unterkörper', thu:'Oberkörper', fri:'Unterkörper' },
  ppl4:        { mon:'Push', tue:'Pull', thu:'Legs', fri:'Oberkörper' },
  strength4:   { mon:'Oberkörper schwer', tue:'Unterkörper schwer', thu:'Oberkörper leicht', fri:'Unterkörper leicht' },
  fullbody4:   { mon:'Ganzkörper A', tue:'Ganzkörper B', thu:'Ganzkörper C', fri:'Ganzkörper D' },
  bodypart4:   { mon:'Brust & Trizeps', tue:'Rücken & Bizeps', thu:'Beine', fri:'Schultern & Core' },
  bro5:        { mon:'Brust', tue:'Rücken', wed:'Beine', thu:'Schultern', fri:'Arme' },
  ppl5:        { mon:'Push', tue:'Pull', wed:'Legs', fri:'Oberkörper', sat:'Unterkörper' },
  upperlower5: { mon:'Oberkörper', tue:'Unterkörper', thu:'Oberkörper', fri:'Unterkörper', sat:'Ganzkörper' },
  ppl6:        { mon:'Push', tue:'Pull', wed:'Legs', thu:'Push', fri:'Pull', sat:'Legs' },
  arnold:      { mon:'Brust & Rücken', tue:'Schultern & Arme', wed:'Beine', thu:'Brust & Rücken', fri:'Schultern & Arme', sat:'Beine' },
};
function _deriveDayLabel(ids){
  const mg = {};
  ids.forEach(id => { const e = exById(id); if (e && e.muscleGroup) mg[e.muscleGroup] = (mg[e.muscleGroup]||0)+1; });
  const top = Object.entries(mg).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([g])=>muscleLabel(g)).filter(Boolean);
  return top.length ? top.join(' · ') : null;
}
// Das Ziel aus dem Onboarding verschiebt den Wiederholungsbereich noch einmal:
// wer stärker werden will, trainiert schwerer und kürzer, wer abnehmen oder fit
// bleiben will, länger und leichter. Beidseitig gedeckelt — sonst wird aus einem
// 5×5 ein 5×2 und aus dem Zirkelplan ein 18er-Satz.
function _tplGoalReps(r, goal){
  if (goal === 'kraft')                      return Math.max(5,  r - 3);
  if (goal === 'abnehmen' || goal === 'fit') return Math.min(15, r + 3);
  return r;
}
// Satz-/Wiederholungsziele einer Vorlagen-Übung. Auflösung von stark nach schwach:
// Einzel-Override (Objekt in libNames) → Tages-scheme → Vorlagen-scheme → Übungs-DB.
// Zeit-Übungen (Plank & Co.) bleiben beim DB-Wert, außer ein Einzel-Override sagt
// ausdrücklich etwas anderes: sonst macht ein 5×5-Schema aus dem Plank 5 Sekunden.
function _tplTargets(libItem, ov, daySch, tplSch, goal){
  const isTime = libItem.t === 'time';
  const sch    = ov || (isTime ? null : (daySch || tplSch)) || null;
  const s      = (sch && sch.s != null) ? sch.s : libItem.s;
  const band   = (sch && sch.band != null) ? sch.band : 2;
  let   r      = (sch && sch.r != null) ? sch.r : libItem.r;
  if (!isTime) r = _tplGoalReps(r, goal);
  return {
    targetSets: s, targetReps: r,
    targetType: isTime ? 'time' : 'reps',
    repMin: isTime ? null : Math.max(1, r - band),
    repMax: isTime ? null : r + band,
    weightScheme: isTime ? null : 'straight'
  };
}
// opts.goal überschreibt das gespeicherte Ziel — im Onboarding steht die Antwort
// noch in _ob und ist bei diesem Aufruf noch nicht in S geschrieben.
function _applyTemplateCore(tpl, opts){
  const goal = (opts && 'goal' in opts) ? opts.goal : (S.obGoal || null);
  // Zuvor automatisch erzeugte Vorlagen-Splits entfernen (editierte bleiben, weil savePreset _tpl verwirft)
  S.workoutPresets = (S.workoutPresets || []).filter(p => !p._tpl);
  const labels = _TPL_DAY_LABELS[tpl.id] || {};
  const newPlan = {};
  const byLabel = {};                       // Label → Split (Dedup + Übungs-Union)
  let colorIdx = (S.workoutPresets || []).length;
  // Übungen mit Trainingshistorie bleiben unangetastet — deren Ziele hat sich der
  // Nutzer erarbeitet. Nie geloggte dürfen das Schema der Vorlage übernehmen,
  // sonst trüge ein Kraftplan weiter die 3×8 aus der Bibliothek.
  const trained = new Set();
  (S.sessions || []).forEach(se => (se.exercises || []).forEach(e => trained.add(e.id)));
  Object.entries(tpl.days).forEach(([dayKey, def]) => {
    if (def.type === 'group' && def.group) { newPlan[dayKey] = { type:'group', group: def.group }; return; }
    if (def.type === 'exercises' && Array.isArray(def.libNames)) {
      const ids = [];
      def.libNames.forEach(entry => {
        const ov      = (entry && typeof entry === 'object') ? entry : null;
        const name    = ov ? ov.n : entry;
        const libItem = EX_LIBRARY.find(it => it.n === name);
        let ex = S.exercises.find(e => e.name.toLowerCase() === String(name).toLowerCase());
        if (!ex) {
          if (libItem) {
            ex = Object.assign(
              { id: uid(), name: libItem.n, emoji: libItem.e, muscleGroup: libItem.mg || '', targetWeight: 0 },
              _tplTargets(libItem, ov, def.scheme, tpl.scheme, goal)
            );
            S.exercises.push(ex);
          }
        } else if (libItem && !trained.has(ex.id)) {
          Object.assign(ex, _tplTargets(libItem, ov, def.scheme, tpl.scheme, goal));
        }
        if (ex) ids.push(ex.id);
      });
      if (!ids.length) { newPlan[dayKey] = { type:'none' }; return; }
      const label = labels[dayKey] || _deriveDayLabel(ids) || tpl.title;
      let pr = byLabel[label];
      if (!pr) {
        pr = { id: uid(), name: label, exIds: [], color: SPLIT_PALETTE[(colorIdx++) % SPLIT_PALETTE.length], _tpl: true };
        byLabel[label] = pr;
      }
      ids.forEach(id => { if (!pr.exIds.includes(id)) pr.exIds.push(id); });
      newPlan[dayKey] = { type:'preset', id: pr.id };
    } else {
      newPlan[dayKey] = { type:'none' };
    }
  });
  ['mon','tue','wed','thu','fri','sat','sun'].forEach(k => { if (!newPlan[k]) newPlan[k] = {type:'none'}; });
  S.workoutPresets = [...(S.workoutPresets || []), ...Object.values(byLabel)];
  S.weekPlan = newPlan;
  persist();
  scheduleWorkoutNotifications();
}

/* ── Plan / Split teilen & importieren (QR + Deep-Link, offline) ─────────
   Ein Split oder der ganze Wochenplan wird kompakt serialisiert und in einen
   gymtrack://import?d=<b64>-Deep-Link gepackt. Der Link steckt im QR-Code
   (Kamera des Freundes öffnet direkt die App) und lässt sich extern teilen.
   Import läuft über den appUrlOpen-Listener → Vorschau-Sheet → Übernehmen. */
const PLAN_SHARE_VER = 1;
const _PL_DAY_KEYS = ['mon','tue','wed','thu','fri','sat','sun'];
const _PL_DAY_NAME = { mon:'Montag', tue:'Dienstag', wed:'Mittwoch', thu:'Donnerstag', fri:'Freitag', sat:'Samstag', sun:'Sonntag' };
function _exMini(ex){ return [ex.name || '', ex.emoji || '', ex.muscleGroup || '']; }
function _presetToMini(p){
  const exs = (p.exIds || []).map(id => (S.exercises || []).find(e => e.id === id)).filter(Boolean);
  return { n: p.name || 'Split', c: p.color || '', e: exs.map(_exMini) };
}
function _serializeSplit(pid){
  const p = presetById(pid); if (!p) return null;
  const m = _presetToMini(p);
  if (!m.e.length) return null;
  return { v: PLAN_SHARE_VER, t: 'split', n: m.n, c: m.c, e: m.e };
}
function _serializeWeek(){
  const presets = [], idxOf = {}, w = {};
  _PL_DAY_KEYS.forEach(k => {
    const d = S.weekPlan && S.weekPlan[k]; if (!d) return;
    if (d.type === 'preset') {
      const p = presetById(d.id); if (!p) return;
      if (idxOf[p.id] == null) { idxOf[p.id] = presets.length; presets.push(_presetToMini(p)); }
      w[k] = idxOf[p.id];
    } else if (d.type === 'exercises' && (d.exIds || []).length) {
      const exs = (d.exIds || []).map(id => (S.exercises || []).find(e => e.id === id)).filter(Boolean);
      if (exs.length) { w[k] = presets.length; presets.push({ n: '', c: '', e: exs.map(_exMini) }); }
    }
  });
  return { v: PLAN_SHARE_VER, t: 'week', p: presets, w };
}
// UTF-8-sicheres URL-sicheres base64 (Umlaute in Übungsnamen!)
function _b64url(str){ return btoa(unescape(encodeURIComponent(str))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function _unb64url(s){ s = String(s||'').replace(/-/g,'+').replace(/_/g,'/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); }
function _encodeShare(obj){ return _b64url(JSON.stringify(obj)); }
function _decodeShare(b64){ try { return JSON.parse(_unb64url(b64)); } catch(_){ return null; } }
/* Teilen läuft NUR über den QR-Code (Lennys Vorgabe 2026-07-22): Der QR trägt
   den direkten App-Deep-Link gymtrack://import?d=… — Kamera scannt, App öffnet
   sofort die Import-Vorschau. KEIN Web-/GitHub-Umweg, keine Link-Buttons.
   (Die ?import=-Handler bleiben drin, falls später Universal Links kommen.) */
function _shareLink(obj){ return 'gymtrack://import?d=' + _encodeShare(obj); }

let _planShareLinkCur = '';
function openPlanShareWeek(){
  const hasPlan = _PL_DAY_KEYS.some(k => S.weekPlan && S.weekPlan[k] && S.weekPlan[k].type !== 'none');
  if (!hasPlan) { showUpdateToast(tr('Dein Wochenplan ist noch leer.')); return; }
  const obj = _serializeWeek();
  if (!obj.p.length) { showUpdateToast(tr('Dein Wochenplan ist noch leer.')); return; }
  const days = Object.keys(obj.w).length;
  _openPlanShare(obj, tr('Plan teilen'), obj.p.length + ' ' + tr('Splits') + ' · ' + days + ' ' + tr('Trainingstage'));
}
function openPlanShareSplit(){
  const pid = (typeof _presetEditId !== 'undefined') ? _presetEditId : null;
  if (!pid) { showUpdateToast(tr('Split zuerst speichern, dann teilen.')); return; }
  const obj = _serializeSplit(pid);
  if (!obj) { showUpdateToast(tr('Dieser Split hat noch keine Übungen.')); return; }
  _openPlanShare(obj, tr('Split teilen'), esc(obj.n) + ' · ' + obj.e.length + ' ' + tr('Übungen'));
}
function _openPlanShare(obj, title, sub){
  haptic(8);
  _planShareLinkCur = _shareLink(obj);
  const t = document.getElementById('plshare-title'); if (t) t.textContent = title;
  const s = document.getElementById('plshare-sub'); if (s) s.innerHTML = sub;
  openOv('ov-plshare');
  _plShareRenderQR(_planShareLinkCur);
}
async function _plShareRenderQR(link){
  const host = document.getElementById('plshare-qr'); if (!host) return;
  host.innerHTML = '<div class="plshare-noqr">…</div>';
  try { await _loadQRLib(); } catch(_){ host.innerHTML = '<div class="plshare-noqr">' + tr('QR offline nicht verfügbar – bitte mit Internet erneut öffnen.') + '</div>'; return; }
  host.innerHTML = '';
  try { new QRCode(host, { text: link, width: 232, height: 232, colorDark: '#0b0d12', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.L }); }
  catch(_){ host.innerHTML = '<div class="plshare-noqr">' + tr('Plan zu groß für einen QR-Code – teile einzelne Splits.') + '</div>'; }
}
function _plShareShare(){
  const l = _planShareLinkCur; if (!l) return; haptic(8);
  const txt = tr('Trainingsplan in MyGymTrack importieren');
  if (navigator.share) { navigator.share({ title: 'MyGymTrack', text: txt + ':\n' + l }).catch(()=>{}); }
  else _plShareCopy();
}
function _plShareCopy(){
  const l = _planShareLinkCur; if (!l) return;
  try { navigator.clipboard.writeText(l); showUpdateToast(tr('Link kopiert')); haptic(8); } catch(_){ showUpdateToast(tr('Kopieren nicht möglich')); }
}

// Übung aus Mini-Array anlegen/finden → gibt Übungs-ID zurück
function _planImportEx(mini){
  const name = (mini && mini[0] || '').trim(); if (!name) return null;
  let ex = (S.exercises || []).find(e => (e.name || '').toLowerCase() === name.toLowerCase());
  if (ex) return ex.id;
  const lib = (typeof EX_LIBRARY !== 'undefined') ? EX_LIBRARY.find(it => it.n.toLowerCase() === name.toLowerCase()) : null;
  if (lib) {
    const isTime = lib.t === 'time';
    ex = { id: uid(), name: lib.n, emoji: lib.e || mini[1] || '', muscleGroup: lib.mg || mini[2] || '',
      targetSets: lib.s, targetReps: lib.r, targetWeight: 0, targetType: isTime ? 'time' : 'reps',
      repMin: isTime ? null : Math.max(1, lib.r - 2), repMax: isTime ? null : lib.r + 2, weightScheme: isTime ? null : 'straight' };
  } else {
    ex = { id: uid(), name, emoji: mini[1] || '', muscleGroup: mini[2] || '',
      targetSets: 3, targetReps: 10, targetWeight: 0, targetType: 'reps', repMin: 8, repMax: 12, weightScheme: 'straight' };
  }
  if (!Array.isArray(S.exercises)) S.exercises = [];
  S.exercises.push(ex);
  return ex.id;
}
// gymtrack://import?d=… ODER https://…/?import=… → Vorschau öffnen. true = war ein Import-Link.
let _lastImportSig = '', _lastImportAt = 0, _planImportD = '';
function _handlePlanImportUrl(url){
  const m = /[?&](?:d|import)=([^&#]+)/.exec(url || ''); if (!m) { showUpdateToast(tr('Ungültiger Plan-Link')); return true; }
  // Kaltstart (getLaunchUrl) + appUrlOpen könnten denselben Link doppelt liefern.
  if (m[1] === _lastImportSig && Date.now() - _lastImportAt < 4000) return true;
  _lastImportSig = m[1]; _lastImportAt = Date.now(); _planImportD = m[1];
  const obj = _decodeShare(m[1]);
  if (!obj || obj.v !== PLAN_SHARE_VER || (obj.t !== 'split' && obj.t !== 'week')) { showUpdateToast(tr('Ungültiger Plan-Link')); return true; }
  _planImportPreview(obj);
  return true;
}
let _planImportObj = null;
function _planImportPreview(obj){
  _planImportObj = obj;
  const ttl = document.getElementById('plimport-title');
  const body = document.getElementById('plimport-body'); if (!body) return;
  if (obj.t === 'split') {
    if (ttl) ttl.textContent = tr('Split importieren');
    const exs = obj.e || [];
    body.innerHTML =
      '<div class="plimp-card"><div class="plimp-hd"><span class="plimp-dot" style="background:' + esc(obj.c || '#0A84FF') + '"></span>' +
      '<span class="plimp-name">' + esc(obj.n || 'Split') + '</span></div>' +
      '<div class="plimp-meta">' + exs.length + ' ' + tr('Übungen') + '</div>' +
      '<div class="plimp-exs">' + exs.map(e => '<span class="plimp-ex">' + esc(e[0] || '') + '</span>').join('') + '</div></div>' +
      '<div class="plimp-note">' + tr('Fehlende Übungen werden automatisch in deine Bibliothek angelegt.') + '</div>';
  } else {
    if (ttl) ttl.textContent = tr('Plan importieren');
    const w = obj.w || {}, P = obj.p || [];
    const rows = _PL_DAY_KEYS.filter(k => w[k] != null).map(k => {
      const p = P[w[k]] || {};
      return '<div class="plimp-row"><span class="plimp-day">' + tr(_PL_DAY_NAME[k]) + '</span>' +
        '<span class="plimp-dot" style="background:' + esc(p.c || '#0A84FF') + '"></span>' +
        '<span class="plimp-name2">' + esc(p.n || tr('Training')) + '</span></div>';
    }).join('');
    const nEx = P.reduce((s, p) => s + ((p.e || []).length), 0);
    body.innerHTML =
      '<div class="plimp-card"><div class="plimp-meta">' + P.length + ' ' + tr('Splits') + ' · ' + Object.keys(w).length + ' ' + tr('Trainingstage') + ' · ' + nEx + ' ' + tr('Übungen') + '</div>' +
      '<div class="plimp-rows">' + rows + '</div></div>' +
      '<div class="plimp-warn">' + tr('Beim Importieren wird dein aktueller Wochenplan ersetzt. Fehlende Übungen werden automatisch angelegt.') + '</div>';
  }
  // Im Browser (Web-Version) geöffnet: zusätzlich anbieten, den Import direkt in
  // der installierten nativen App zu öffnen (Deep-Link mit derselben Payload).
  if (!window.Capacitor?.isNativePlatform?.() && _planImportD) {
    body.innerHTML += '<button class="btn" style="width:100%;margin-top:12px" ' +
      'onclick="location.href=\'gymtrack://import?d=\'+_planImportD">' + tr('In der MyGymTrack-App öffnen') + '</button>';
  }
  openOv('ov-plimport');
}
function _planImportApply(){
  const obj = _planImportObj; if (!obj) { closeOv('ov-plimport'); return; }
  try {
    if (obj.t === 'split') {
      const ids = (obj.e || []).map(_planImportEx).filter(Boolean);
      if (!ids.length) { showUpdateToast(tr('Keine Übungen im Split.')); closeOv('ov-plimport'); return; }
      let name = obj.n || tr('Importierter Split');
      if ((S.workoutPresets || []).some(p => (p.name || '').toLowerCase() === name.toLowerCase())) name = name + ' ' + tr('(Import)');
      const pr = { id: uid(), name, exIds: ids, color: (typeof obj.c === 'string' && obj.c) ? obj.c : SPLIT_PALETTE[(S.workoutPresets || []).length % SPLIT_PALETTE.length] };
      S.workoutPresets = [...(S.workoutPresets || []), pr];
    } else {
      const P = obj.p || [], idxToId = {};
      P.forEach((p, i) => {
        const ids = (p.e || []).map(_planImportEx).filter(Boolean);
        const pr = { id: uid(), name: p.n || tr('Training'), exIds: ids, color: (typeof p.c === 'string' && p.c) ? p.c : SPLIT_PALETTE[i % SPLIT_PALETTE.length] };
        S.workoutPresets = [...(S.workoutPresets || []), pr]; idxToId[i] = pr.id;
      });
      const np = {}; _PL_DAY_KEYS.forEach(k => np[k] = { type: 'none' });
      Object.entries(obj.w || {}).forEach(([k, idx]) => { if (idxToId[idx] != null && np[k]) np[k] = { type: 'preset', id: idxToId[idx] }; });
      S.weekPlan = np;
    }
    persist();
    try { scheduleWorkoutNotifications(); } catch(_){}
    ['renderSplitChips','renderPlanList','renderWeekPreview','renderWeekCircles','renderHeuteGrid'].forEach(fn => { try { if (typeof window[fn] === 'function') window[fn](); } catch(_){} });
    closeOv('ov-plimport');
    try { hapticSuccess(); } catch(_){}
    showUpdateToast(obj.t === 'split' ? tr('Split importiert') : tr('Plan importiert'));
  } catch(e) { showUpdateToast(tr('Import fehlgeschlagen')); }
}

// ── SET-TYPEN (normal / warmup / top / drop / fail) ─────────
/* Reihenfolge = Reihenfolge im Picker und im Training: erst leichter werden
   (Aufwärmen), dann der schwerste Satz, dann die beiden Wege danach — einen
   Schritt zurück (Backoff) oder die Intensitätstechniken (Drop, Versagen). */
const SET_TYPES = ['normal','warmup','top','backoff','drop','fail'];
const SET_TYPE_LABEL = { normal:'', warmup:'W', top:'T', backoff:'B', drop:'D', fail:'F' };
const SET_TYPE_TITLE = GT_LANG === 'en'
  ? { normal:'Normal', warmup:'Warm-up', top:'Top set', backoff:'Back-off set', drop:'Drop set', fail:'To failure' }
  : { normal:'Normal', warmup:'Aufwärmen', top:'Top-Satz', backoff:'Backoff-Satz', drop:'Drop-Satz', fail:'Bis zum Versagen' };
const SET_TYPE_DESC = {
  normal: 'Regulärer Arbeitssatz mit deinem normalen Trainingsgewicht. Zählt voll zum Trainingsvolumen.',
  warmup: 'Leichter Satz mit weniger Gewicht (ca. 40–60 %), um Muskeln, Gelenke und Nervensystem aufzuwärmen. Zählt nicht zum Trainingsvolumen.',
  top:    'Dein schwerster Arbeitssatz des Tages mit maximalem Gewicht und hoher Intensität (RPE 8–10). Meist nur 1 Satz pro Übung.',
  backoff:'Nach dem Top-Satz mit 10–20 % weniger Gewicht weitertrainieren, um Volumen zu sammeln, ohne noch einmal ans Maximum zu gehen. Volle Pause davor. Zählt voll zum Trainingsvolumen und belastet weniger als ein Drop- oder Versagens-Satz.',
  drop:   'Direkt nach dem Versagen Gewicht um 20–40 % reduzieren und ohne Pause weitermachen, bis du erneut versagst. Sehr hohe Intensität.',
  fail:   'Wiederholungen bis zur kompletten muskulären Erschöpfung — keine Reps in Reserve. Sparsam einsetzen wegen hoher Belastung.'
};
let _setTypeTarget = null;
function openSetTypePopup(li, si){
  _setTypeTarget = { li, si };
  haptic(8);
  const cur = (wkLogs[li] && wkLogs[li].sets[si] && wkLogs[li].sets[si].type) || 'normal';
  document.querySelectorAll('.settype-card').forEach(c =>
    c.classList.toggle('on', c.dataset.type === cur));
  openOv('ov-settype');
}
function pickSetType(type){
  if (!_setTypeTarget) return;
  const { li, si } = _setTypeTarget;
  if (wkLogs[li] && wkLogs[li].sets[si]) {
    wkLogs[li].sets[si].type = type;
    haptic(10);
  }
  closeOv('ov-settype');
  _setTypeTarget = null;
  renderLogCards();
}

// ── LIVE-VERGLEICH: letztes Mal pro Satz ──────────────
function lastSessionSetsFor(exId){
  const hist = exHistory(exId);
  if (!hist.length) return null;
  // Jüngste Einheit MIT echtem Arbeitsgewicht bevorzugen, damit „letztes Mal"
  // und die Vorbelegung wieder Gewicht zeigen — auch wenn die allerletzte
  // Einheit versehentlich ohne Gewicht gespeichert wurde.
  for (let i = hist.length - 1; i >= 0; i--) {
    if ((hist[i].sets || []).some(s => parseFloat(s.w) > 0)) return hist[i].sets;
  }
  return hist[hist.length-1].sets || null;
}

// ═══════════════════════════════════════════════════════
// ONBOARDING — ERSTEINRICHTUNG (Ziel, Erfahrung, Frequenz, Plan)
// ═══════════════════════════════════════════════════════
const _OB_SVG = {
  dumbbell: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round"><path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11"/></svg>',
  trend:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>',
  bar:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11"/></svg>',
  flame:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c2.6 3.6 5 6 5 9.4A5.4 5.4 0 0 1 12 18a5.4 5.4 0 0 1-5-5.6C7 9 9.4 6.6 12 3z"/><path d="M12 18c-1.4 0-2.5-1.1-2.5-2.6 0-1.5 1.2-2.7 2.5-4 1.3 1.3 2.5 2.5 2.5 4 0 1.5-1.1 2.6-2.5 2.6z"/></svg>',
  heart:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.5-9-8.8C1.8 8.5 3.5 5 6.7 5c2 0 3.3 1.1 4.3 2.6C12 6.1 13.3 5 15.3 5c3.2 0 4.9 3.5 3.7 6.2-2 4.3-7 8.8-7 8.8z"/></svg>',
  check:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  users:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
};
const OB_GOALS = [
  {id:'muskel',   t:'Muskeln aufbauen',   s:'Mehr Masse, bessere Form',        ico:_OB_SVG.trend},
  {id:'kraft',    t:'Stärker werden',     s:'Mehr Gewicht auf der Stange',     ico:_OB_SVG.bar},
  {id:'abnehmen', t:'Abnehmen',           s:'Kalorien verbrennen, definieren', ico:_OB_SVG.flame},
  {id:'fit',      t:'Fit & gesund bleiben', s:'Regelmäßig in Bewegung',        ico:_OB_SVG.heart},
];
const OB_EXPS = [
  {id:'neu',    t:'Anfänger',        s:'Unter 1 Jahr Training'},
  {id:'mittel', t:'Fortgeschritten', s:'1–3 Jahre Training'},
  {id:'profi',  t:'Profi',           s:'Über 3 Jahre Training'},
];
let _ob = null;

// Rückgabe: true = Onboarding läuft jetzt (Aufrufer wartet dann auf _obClose).
function maybeStartOnboarding(){
  if (S.onboarded || S.welcomeShown) return false;
  if ((S.sessions||[]).length || (S.exercises||[]).length) { S.onboarded = true; persist(); return false; }
  startOnboarding();
  return true;
}
function startOnboarding(){
  _ob = { step:0, name:'', goal:null, exp:null, freq:null, tpl:null, showAll:false, applied:false };
  renderOb();
  document.getElementById('ob-screen').classList.add('on');
}
function skipOnboarding(){ haptic(6); _obClose(); }
function _obClose(){
  S.onboarded = true; S.welcomeShown = true;
  persist();
  const el = document.getElementById('ob-screen');
  if (el){
    el.style.transition = 'opacity .32s'; el.style.opacity = '0';
    setTimeout(()=>{ el.classList.remove('on'); el.style.opacity=''; el.style.transition=''; el.innerHTML=''; }, 330);
  }
  _ob = null;
  renderHome(); renderExList();
  // Reihenfolge: Login → Onboarding → Soft-Paywall. Das Gate lief schon vor dem
  // Onboarding; hier nur noch Sicherheitsnetz (z. B. Logout mittendrin).
  if (_authGateNeeded()) { _maybeAuthGate(); return; }
  setTimeout(_maybeWelcomePaywall, 420);   // Soft-Paywall direkt nach dem Onboarding (wegklickbar)
}
function obFinish(){
  haptic(15);
  _obClose();
}
function obFinishCloud(){
  haptic(15);
  _obClose();
  setTimeout(()=>{ try{ openAccountSheet(); }catch(_){} }, 420);
}
// Passung einer Vorlage zu den Antworten. Die Frequenz ist das harte Kriterium:
// ein 6er-Split bei zwei geplanten Tagen ist kein Vorschlag, sondern ein Fehler —
// deshalb fliegt alles mit mehr als einem Tag Abstand raus (Score -1). Ziel und
// Erfahrung feilen danach nur noch an der Reihenfolge.
function _obScoreTpl(t, goal, exp, freq){
  const f = (t.fit && t.fit.freq) || [];
  const dist = f.length ? Math.min(...f.map(n => Math.abs(n - freq))) : 99;
  if (dist > 1) return -1;
  // 6 ist absichtlich mehr, als Ziel und Erfahrung zusammen einbringen koennen:
  // sonst schoebe sich eine Vorlage mit doppeltem Treffer, aber einem Tag
  // Abstand, vor die exakt passende — und der Nutzer bekaeme fuenf Tage
  // empfohlen, nachdem er sechs angegeben hat.
  let sc = dist === 0 ? 6 : 1;
  if (goal && t.fit && t.fit.goals.includes(goal)) sc += 2;
  // goals[0] ist das Ziel, für das die Vorlage gebaut wurde — der Rest sind
  // Ziele, für die sie auch taugt. Ohne diesen Punkt liefen spezialisierte
  // Vorlagen in Gleichstände: „Stärker werden, 3 Tage" empfahl den PPL-Plan
  // statt des Kraftplans, weil beide Ziel und Erfahrung gleich gut trafen.
  if (goal && t.fit && t.fit.goals[0] === goal)    sc += 1;
  if (exp  && t.fit && t.fit.exps.includes(exp))   sc += 2;
  return sc;
}
// Vorlagen mit passender Frequenz, beste zuerst. Gleichstand → Reihenfolge im
// Array, damit derselbe Fragebogen immer dieselbe Empfehlung liefert.
function _obRankTpls(){
  const goal = _ob ? _ob.goal : S.obGoal;
  const exp  = _ob ? _ob.exp  : S.obExp;
  const freq = (_ob ? _ob.freq : S.obFreq) || 3;
  return PLAN_TEMPLATES
    .map((t, i) => ({ t, i, sc: _obScoreTpl(t, goal, exp, freq) }))
    .filter(x => x.sc >= 0)
    .sort((a, b) => (b.sc - a.sc) || (a.i - b.i))
    .map(x => x.t);
}
// Passende zuerst, danach der Rest in Bibliotheks-Reihenfolge — der Rest wird
// erst nach „Alle Pläne anzeigen" sichtbar, bleibt aber wählbar.
function _obTplList(){
  const ranked = _obRankTpls();
  return ranked.concat(PLAN_TEMPLATES.filter(t => ranked.indexOf(t) < 0));
}
function _obRecTpl(){
  const r = _obRankTpls();
  return r.length ? r[0].id : 'fullbody3';
}
// Satz-/Wdh-Spanne einer Vorlage für die Karte — mit dem Ziel-Versatz aus
// _tplGoalReps, damit die Karte das anzeigt, was der Plan hinterher wirklich
// enthält. Zeit-Übungen bleiben draußen: ihre Sekunden gehören nicht in eine
// Wiederholungsspanne.
function _obTplSchemeLbl(t){
  const goal = _ob ? _ob.goal : S.obGoal;
  const ss = [], rs = [];
  Object.values(t.days).forEach(d => {
    if (d.type !== 'exercises' || !Array.isArray(d.libNames)) return;
    d.libNames.forEach(entry => {
      const ov  = (entry && typeof entry === 'object') ? entry : null;
      const li  = EX_LIBRARY.find(x => x.n === (ov ? ov.n : entry));
      if (li && li.t === 'time' && !ov) return;
      const sch = ov || d.scheme || t.scheme;
      if (!sch || sch.s == null || sch.r == null) return;
      ss.push(sch.s); rs.push(li && li.t === 'time' ? sch.r : _tplGoalReps(sch.r, goal));
    });
  });
  if (!ss.length) return '';
  const rng = a => { const lo = Math.min(...a), hi = Math.max(...a); return lo === hi ? String(lo) : lo + '–' + hi; };
  return rng(ss) + ' Sätze · ' + rng(rs) + ' Wdh.';
}
// Bewusst KEIN Auto-Weiter mehr nach der Auswahl: das sprang gefühlt „von
// alleine" weiter und bestätigte Dinge, die der Nutzer nur antippen wollte.
// Weiter geht es ausschließlich über den Weiter-Button.
function obPickGoal(id){ _ob.goal = id; haptic(8); renderOb(); }
function obPickExp(id){ _ob.exp = id; haptic(8); renderOb(); }
function obPickFreq(n){ _ob.freq = n; haptic(8); _ob.tpl = null; _ob.showAll = false; renderOb(); }
function obPickTpl(id){ _ob.tpl = id; haptic(8); renderOb(); }
function obShowAllTpls(){ if (!_ob) return; _ob.showAll = true; haptic(6); renderOb(); }
function obBack(){ if(!_ob || _ob.step===0) return; haptic(6); _ob.step--; renderOb(); }
function obNext(){
  if (!_ob) return;
  const s = _ob.step;
  if (s === 1) _ob.name = (document.getElementById('ob-name')?.value || '').trim().slice(0,30);
  if (s === 2 && !_ob.goal) return;
  if (s === 3 && !_ob.exp)  return;
  if (s === 4 && !_ob.freq) return;
  if (s === 5) {
    const tpl = PLAN_TEMPLATES.find(t => t.id === (_ob.tpl || _obRecTpl()));
    // Ziel ausdrücklich mitgeben: _obSaveAnswers schreibt es erst danach nach S.
    if (tpl) { _applyTemplateCore(tpl, { goal: _ob.goal }); _ob.applied = true; }
    _obSaveAnswers();
  }
  haptic(10);
  _ob.step = s + 1;
  renderOb();
}
function obSkipPlan(){
  _ob.applied = false;
  _obSaveAnswers();
  haptic(8);
  _ob.step = 6;
  renderOb();
}
function _obSaveAnswers(){
  if (_ob.name) S.userName = _ob.name;
  S.obGoal = _ob.goal || null;
  S.obExp  = _ob.exp  || null;
  S.obFreq = _ob.freq || null;
  persist();
}
function _obStepHTML(s){
  if (s === 0) return `<div class="ob-hero">
      <img class="ob-hero-logo" src="icon-192.png" alt="MyGymTrack">
      <div class="ob-h1">Willkommen bei MyGymTrack</div>
      <div class="ob-sub">Dein Trainings-Tagebuch mit Gewichtsvorschlägen, Plänen, Statistiken und Freunde-Rangliste. In einer Minute eingerichtet.</div>
    </div>`;
  if (s === 1) return `<div class="ob-q">Wie heißt du?</div>
    <div class="ob-qsub">Optional — wird in der Freunde-Rangliste angezeigt.</div>
    <input class="ob-name-in" id="ob-name" maxlength="30" placeholder="Dein Vorname" value="${esc(_ob.name)}" autocomplete="given-name">`;
  if (s === 2) return `<div class="ob-q">Was ist dein Ziel?</div>
    <div class="ob-qsub">Hilft uns, dir die richtigen Vorschläge zu machen.</div>
    <div class="ob-opts">${OB_GOALS.map(g => `
      <button class="ob-opt${_ob.goal===g.id?' on':''}" onclick="obPickGoal('${g.id}')">
        <div class="ob-opt-ico">${g.ico}</div>
        <div><div class="ob-opt-title">${g.t}</div><div class="ob-opt-sub">${g.s}</div></div>
      </button>`).join('')}</div>`;
  if (s === 3) return `<div class="ob-q">Wie viel Erfahrung hast du?</div>
    <div class="ob-qsub">Bestimmt, welcher Trainingsplan zu dir passt.</div>
    <div class="ob-opts">${OB_EXPS.map(e => `
      <button class="ob-opt${_ob.exp===e.id?' on':''}" onclick="obPickExp('${e.id}')">
        <div><div class="ob-opt-title">${e.t}</div><div class="ob-opt-sub">${e.s}</div></div>
      </button>`).join('')}</div>`;
  if (s === 4) return `<div class="ob-q">Wie oft pro Woche willst du trainieren?</div>
    <div class="ob-qsub">Realistisch bleiben — lieber konstant 3× als geplant 6×.</div>
    <div class="ob-freq">${[2,3,4,5,6].map(n => `
      <button class="${_ob.freq===n?'on':''}" onclick="obPickFreq(${n})">${n}</button>`).join('')}</div>
    <div class="ob-freq-lbl">Tage pro Woche</div>`;
  if (s === 5) {
    const rec = _obRecTpl();
    if (!_ob.tpl) _ob.tpl = rec;
    const all   = _obTplList();
    const shown = _ob.showAll ? all : all.slice(0, 4);
    // Die gewählte Vorlage darf nie aus der Liste fallen (Zurück → Frequenz ändern
    // → die alte Wahl liegt plötzlich hinter dem Mehr-Button): sonst steht oben
    // „Plan übernehmen" für etwas, das der Nutzer gar nicht mehr sieht.
    if (!shown.some(t => t.id === _ob.tpl)) {
      const picked = all.find(t => t.id === _ob.tpl);
      if (picked) shown.push(picked);
    }
    const cards = shown.map(t => {
      const days = Object.entries(t.days).filter(([_,v])=>v.type!=='none').map(([k]) => dayByKey(k).short);
      const sch  = _obTplSchemeLbl(t);
      return `<button class="ob-tpl${t.id===_ob.tpl?' on':''}" onclick="obPickTpl('${t.id}')">
          ${t.id===rec?'<span class="ob-tpl-badge">Empfohlen für dich</span>':''}
          <div class="ob-tpl-title">${t.title}</div>
          <div class="ob-tpl-desc">${t.desc}</div>
          ${sch ? `<div class="ob-tpl-desc">Schema: ${sch}</div>` : ''}
          <div class="ob-tpl-days">${days.map(d=>`<span class="ob-day-chip">${d}</span>`).join('')}</div>
        </button>`;
    }).join('');
    const more = (!_ob.showAll && all.length > shown.length)
      ? `<button class="ob-ghost" onclick="obShowAllTpls()">Alle ${all.length} Pläne anzeigen</button>` : '';
    return `<div class="ob-q">Dein Startplan</div>
      <div class="ob-qsub">Basierend auf deinen Angaben. Übungen, Tage und Wiederholungen kannst du jederzeit anpassen.</div>
      <div class="ob-opts">${cards}</div>${more}`;
  }
  return `<div class="ob-hero" style="padding-top:12vh">
      <div class="ob-done-ring">${_OB_SVG.check}</div>
      <div class="ob-h1">Alles bereit${_ob.name ? ', ' + esc(_ob.name) : ''}!</div>
      <div class="ob-sub">${_ob.applied
        ? 'Dein Wochenplan ist eingerichtet — du findest ihn im Heute-Tab. Zeit für dein erstes Training.'
        : 'Leg direkt los: Erstelle Übungen oder starte dein erstes Training im Heute-Tab.'}</div>
    </div>`;
}
function renderOb(){
  const el = document.getElementById('ob-screen');
  if (!el || !_ob) return;
  const s = _ob.step;
  const canNext = !(s===2 && !_ob.goal) && !(s===3 && !_ob.exp) && !(s===4 && !_ob.freq);
  const primary = s===0 ? 'Los geht’s' : s===5 ? 'Plan übernehmen' : s===6 ? 'Los geht’s' : 'Weiter';
  const foot = s === 6
    ? `<button class="btn btn-acc" onclick="obFinish()">${primary}</button>`
    : `<button class="btn btn-acc" onclick="obNext()" ${canNext?'':'disabled style="opacity:.45"'}>${primary}</button>
       ${s===0 ? '<button class="ob-ghost" onclick="skipOnboarding()">Ohne Einrichtung starten — alles selbst anlegen</button>' : ''}
       ${s===5 ? '<button class="ob-ghost" onclick="obSkipPlan()">Ohne Plan starten</button>' : ''}`;
  el.innerHTML = `
    <div class="ob-top">
      ${s>0 && s<6 ? `<button class="hdr-icon-btn" onclick="obBack()" aria-label="Zurück"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>` : '<div style="width:38px"></div>'}
      <div class="ob-dots">${Array.from({length:7},(_,i)=>`<div class="ob-dot${i===s?' on':''}"></div>`).join('')}</div>
      ${s<6 ? '<button class="ob-skip" onclick="skipOnboarding()">Überspringen</button>' : '<div style="width:38px"></div>'}
    </div>
    <div class="ob-body"><div class="ob-step">${_obStepHTML(s)}</div></div>
    <div class="ob-foot">${foot}</div>`;
}

// ═══════════════════════════════════════════════════════
// COMMUNITY — FREUNDE · RANGLISTE · GYM-KARTE
// Firestore-Collection profiles/{uid} (öffentliches Opt-in-Profil).
// Follow-Modell: Wessen Code du eingibst, den siehst du.
// ═══════════════════════════════════════════════════════
/* 'home' = die eine scrollende Freunde-Seite (Crew · Freunde · Rangliste · Karte).
   'friends'/'crew'/'board'/'map' sind die VOLLEN Ansichten dahinter, erreichbar
   ueber „alle anzeigen" und jeweils mit Zurueck-Zeile. */
let _socTab = 'home', _socMetric = 'vol', _socPushT = null;
let _socZone = 'community';   // Oberste Ebene: 'community' (Standard, öffentlicher Feed) | 'friends'
let _frSubs = [], _frTimer = null, _frPresence = {}, _frReqCount = 0, _feedCache = null, _frListDrawn = false;
let _socCache = null, _socCacheTs = 0;
let _socMap = null, _socMarkers = [], _leafP = null;
let _socEditing = false, _socTmp = null, _socSearchT = null, _socHits = [];

function _socReady(){ return !!(window.FB && window.FB.configured && _fbUser && !_fbUser.isAnonymous); }
function _socCode(){
  if (!S.friendCode) {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    S.friendCode = Array.from({length:6}, () => abc[Math.floor(Math.random()*abc.length)]).join('');
    persist();
  }
  return S.friendCode;
}
function _socInitials(name){
  return esc((name||'?').trim().split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase() || '?');
}
function _weekStats(){
  const mon = new Date(); mon.setHours(0,0,0,0); mon.setDate(mon.getDate() - ((mon.getDay()+6)%7));
  let vol = 0, ses = 0;
  (S.sessions||[]).forEach(s => {
    const d = new Date(s.date);
    if (d >= mon) { ses++; try { vol += sessionVolume(s); } catch(_){} }
  });
  return { key: getWeekKey(), vol: Math.round(vol), ses };
}
function _monthStats(){
  const key = _monthKey();
  let ses = 0, vol = 0;
  (S.sessions||[]).forEach(s => {
    const d = new Date(s.date);
    if (d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') === key) {
      ses++; try { vol += sessionVolume(s); } catch(_){}
    }
  });
  return { key, ses, vol: Math.round(vol) };
}
function _socOwnStats(){
  const ses = S.sessions || [];
  const last30 = ses.slice(-30);
  const avgDur = last30.length ? Math.round(last30.reduce((a,s) => a + (s.duration||0), 0) / last30.length / 60) : 0;
  const hours = {};
  ses.slice(-60).forEach(s => { const h = new Date(s.date).getHours(); hours[h] = (hours[h]||0) + 1; });
  const fav = Object.entries(hours).sort((a,b) => b[1] - a[1])[0];
  const mg = {};
  last30.forEach(s => (s.logs||[]).forEach(l => {
    const ex = exById(l.exerciseId);
    if (ex?.muscleGroup) mg[ex.muscleGroup] = (mg[ex.muscleGroup]||0) + setsVolume(l.sets);
  }));
  const topMg = Object.entries(mg).sort((a,b) => b[1] - a[1]).slice(0,2).map(([id]) => muscleLabel(id));
  let prs = [];
  if (S.privacy?.prs) {
    prs = (S.exercises||[])
      .map(e => ({ n: e.name.slice(0,24), w: exBest1RM(e.id) || 0 }))
      .filter(p => p.w > 0)
      .sort((a,b) => b.w - a.w)
      .slice(0,3);
  }
  return { total: ses.length, avgDur, favH: fav ? +fav[0] : null, topMg, prs };
}
/* Was vom „Über mich" wirklich in die Cloud darf. Das Geburtsdatum bleibt
   bewusst LOKAL — geteilt wird nur die daraus errechnete Altersangabe. */
function _socAboutPayload(){
  const { birth, ...rest } = _profAbout();
  const age = _pfAgeFrom(birth);
  return age == null ? rest : { ...rest, age };
}
async function _pushSocialProfile(){
  if (!S.socialOn || !_socReady()) return;
  // Demo-/Marketing-Simulator pusht kein Community-Profil (Fake-"Lenny"-Profile)
  try { if (_demoModeAny() || (typeof DEMO_SEED !== 'undefined' && DEMO_SEED)) return; } catch(_){}
  let streak = 0; try { streak = calcStreak().weeks || 0; } catch(_){}
  const w = _weekStats();
  const P = S.privacy || {};
  const liveOn = P.live && typeof isWorkoutActive === 'function' && isWorkoutActive() && timerTs;
  const lastSess = (S.sessions||[])[(S.sessions||[]).length - 1];
  const payload = {
    name: (S.userName || _fbUser.displayName || 'Athlet').slice(0,30),
    code: _socCode(),
    photo: _profilePhoto() || _fbUser.photoURL || null,
    gymName: P.gym ? (S.gymName || null) : null,
    gymLat:  P.gym ? (S.gymLat  ?? null) : null,
    gymLng:  P.gym ? (S.gymLng  ?? null) : null,
    week: { key: w.key, vol: w.vol, ses: w.ses },
    month: _monthStats(),
    streak,
    lastWk: (P.lastWk && lastSess) ? new Date(lastSess.date).getTime() : null,
    live: liveOn ? { on:true, start:timerTs, gym: P.gym ? (S.gymName || null) : null } : null,
    stats: P.stats ? _socOwnStats() : null,
    friends: S.friends || [],
    notifLive: S.notifLive !== false,   // Empfangs-Schalter: der Push-Worker liest ihn hier
    premium: (typeof isPremium === 'function') ? isPremium() : false,
    about: _socAboutPayload(),   // Erfahrung/Alter/Stärken/Lieblingsübungen/Bio fürs Freundesprofil
    updatedAt: Date.now()
  };
  if (_pushToken) payload.pushToken = _pushToken;   // APNs-Token fürs Sperrbild-Push mitschreiben (merge:false würde ihn sonst löschen)
  try {
    await window.FB.setDoc(window.FB.doc('profiles', _fbUser.uid), payload, { merge:false });
  } catch(e) {
    // Rules noch ohne 'about'-Feld deployt? Dann ohne about pushen, damit
    // Rangliste/Live-Status weiterlaufen (Graceful Degradation statt Totalausfall).
    if (String(e?.code || e).includes('permission')) {
      try {
        const { about, ...rest } = payload;
        await window.FB.setDoc(window.FB.doc('profiles', _fbUser.uid), rest, { merge:false });
        console.warn('[GymTrack] Community-Push ohne about (Rules aktualisieren!)');
      } catch(e2) { console.warn('[GymTrack] Community-Push fehlgeschlagen:', e2?.code || e2); }
    } else console.warn('[GymTrack] Community-Push fehlgeschlagen:', e?.code || e);
  }
}
function _pushSocialSoon(){ clearTimeout(_socPushT); _socPushT = setTimeout(_pushSocialProfile, 1500); }

/* ── Echte Push (APNs) ─────────────────────────────────────────────────────
   Nur nativ (iOS). Fragt einmalig Push-Erlaubnis, registriert bei APNs, holt
   den Device-Token und speichert ihn in profiles/{uid}.pushToken. */
async function _pushRegister(){
  const PN = _cap('PushNotifications');
  if (!PN || _pushReg) return;
  _pushReg = true;
  try {
    if (!PN.__gtBound) {
      PN.__gtBound = true;
      PN.addListener('registration', (t) => {
        _pushToken = t && t.value ? String(t.value) : null;
        if (_pushToken && S.socialOn && _socReady()) { try { _pushSocialProfile(); } catch(_){} }
      });
      PN.addListener('registrationError', (e) => {
        console.warn('[GymTrack] Push-Registrierung fehlgeschlagen:', e);
      });
    }
    let perm = await PN.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PN.requestPermissions();
    }
    if (perm.receive === 'granted') { await PN.register(); }
    else { _pushReg = false; }   // abgelehnt → später erneut versuchen dürfen
  } catch(e) { _pushReg = false; console.warn('[GymTrack] Push-Setup:', e); }
}

/* Ruft den Cloudflare-Worker, damit der Post-Besitzer eine echte Push bekommt.
   Der Worker liest den Empfänger-Token aus Firestore MIT unserem idToken —
   kein Missbrauch möglich. Fire-and-forget, blockiert die UI nie. */
async function _notifyFlamePush(toUid){
  try {
    if (!PUSH_WORKER_URL || !_fbUser || !toUid) return;
    const idToken = await _fbUser.getIdToken();
    // Bewusst OHNE Content-Type-Header: einfacher CORS-Request, kein Preflight
    // (WKWebView meldet sonst "Load failed" trotz erreichbarem Worker, s. Commit 7bfe5ab).
    fetch(PUSH_WORKER_URL, {
      method: 'POST',
      body: JSON.stringify({ toUid, idToken, fromName: (S.userName || _fbUser.displayName || 'Jemand').slice(0,40) })
    }).catch(()=>{});
  } catch(_){}
}

/* ── „Jemand trainiert gerade" ───────────────────────────────────────────
   Beim Trainingsstart bekommen Freunde und Gruppenleute eine kurze Mitteilung.
   Drei Bremsen, damit daraus kein Dauerbrummen wird:
   - Wer seinen Live-Status nicht teilt (S.privacy.live), sendet auch nichts.
     Es wäre widersprüchlich, den Status zu verbergen und ihn zu pushen.
   - Höchstens EINE Mitteilung je Empfänger und Tag (lokal gemerkt).
   - Der Empfänger kann sie ganz abschalten (S.notifLive → profiles.notifLive);
     das prüft der Worker, nicht der Absender — sonst könnte man es umgehen.
   Fire-and-forget: blockiert den Trainingsstart nie. */
function _livePushSeen(){
  try { return JSON.parse(localStorage.getItem('gt_livePush') || '{}'); } catch(_) { return {}; }
}
async function _notifyLivePush(){
  try {
    if (!PUSH_WORKER_URL || !_fbUser || !S.socialOn) return;
    if (!(S.privacy && S.privacy.live)) return;
    try { if (_demoModeAny() || (typeof DEMO_SEED !== 'undefined' && DEMO_SEED)) return; } catch(_){}
    const heute = new Date().toDateString();
    const seen  = _livePushSeen();
    // Empfänger sammeln: Freunde + alle Gruppenmitglieder. Die Gruppen-uid trägt
    // ihre cid mit, damit der Worker die Berechtigung am Gruppendokument prüfen
    // kann (Gruppenleute sind nicht zwingend befreundet).
    const ziele = new Map();
    (S.friends || []).forEach(u => ziele.set(u, { kind: 'live' }));
    try {
      (typeof _crewMine === 'function' ? _crewMine() : []).forEach(c =>
        (c.members || []).forEach(u => { if (u !== _fbUser.uid && !ziele.has(u)) ziele.set(u, { kind: 'crewlive', cid: c.id }); }));
    } catch(_){}
    const offen = [...ziele.entries()].filter(([u]) => seen[u] !== heute).slice(0, 25);
    if (!offen.length) return;
    const idToken = await _fbUser.getIdToken();
    const name = (S.userName || _fbUser.displayName || 'Jemand').slice(0, 40);
    offen.forEach(([toUid, o]) => {
      seen[toUid] = heute;
      // Bewusst OHNE Content-Type-Header: einfacher CORS-Request, kein Preflight
      // (WKWebView meldet sonst "Load failed" trotz erreichbarem Worker).
      fetch(PUSH_WORKER_URL, {
        method: 'POST',
        body: JSON.stringify({ toUid, idToken, fromName: name, kind: o.kind, cid: o.cid })
      }).catch(()=>{});
    });
    try { localStorage.setItem('gt_livePush', JSON.stringify(seen)); } catch(_){}
  } catch(_){}
}

/* Selbsttest: registriert, schickt eine Push an DICH SELBST und zeigt in Klartext,
   woran es hängt. Ein Gerät reicht, keine Cloudflare-Logs nötig. */
function toggleSocial(on){
  S.socialOn = !!on;
  persist();
  if (on) { _socCode(); _pushRegister(); _pushSocialProfile(); _flameNotifStart(); _friendPostNotifStart(); _communityNotifStart(); _reqNotifStart(); }
  else if (_socReady()) {
    try { window.FB.deleteDoc(window.FB.doc('profiles', _fbUser.uid)); } catch(_){}
    _socCache = null;
    _flameNotifStop();
    _friendPostNotifStop();
    _communityNotifStop();
    _reqNotifStop();
  }
  updateSocialUI();
}
function setSocialName(v){
  S.userName = (v||'').trim().slice(0,30);
  persist();
  _pushSocialSoon();
  updateSocialUI();
}
function updateSocialUI(){
  const t = document.getElementById('soc-toggle'); if (t) t.checked = !!S.socialOn;
  const n = document.getElementById('soc-name-input'); if (n && document.activeElement !== n) n.value = S.userName || '';
  const sub = document.getElementById('soc-sub');
  if (sub) sub.textContent = S.socialOn
    ? 'Dein Code: ' + _socCode() + (S.gymName ? ' · ' + S.gymName : '')
    : 'Erst Community aktivieren';
}

function openSocial(){
  haptic(8);
  goTabId('freunde');
}
function setSocTab(t){
  _socTab = t; haptic(6);
  if (t !== 'friends') _frStopLive();
  if (t !== 'crew') { try { _crewStopLive(); } catch(_){} }   // Listener nie ueber den Chip hinaus laufen lassen
  renderFriendsTab();
}
/* Oberste Umschaltung Community (öffentlich) ↔ Freunde (privat: Feed/Rangliste/Karte) */
function setSocZone(z){
  if (_socZone === z) return;
  _socZone = z; haptic(6);
  if (z === 'community') { _frStopLive(); try { _crewStopLive(); } catch(_){} }
  else _socTab = 'home';   // Freunde-Zone startet immer auf der Uebersicht
  renderFriendsTab();
}
function setSocMetric(m){ _socMetric = m; haptic(6); renderFriendsTab(); }

async function _loadProfiles(force){
  if (!force && _socCache && Date.now() - _socCacheTs < 60000) return _socCache;
  const ids = [...(S.friends||[])];
  const my = _fbUser?.uid;
  if (my && !ids.includes(my)) ids.unshift(my);
  const out = [];
  await Promise.all(ids.map(async id => {
    try {
      const snap = await window.FB.getDoc(window.FB.doc('profiles', id));
      if (snap.exists()) out.push({ uid:id, ...snap.data() });
    } catch(_){}
  }));
  _socCache = out; _socCacheTs = Date.now();
  return out;
}

// ── DEMO-MODUS (Marketing) ───────────────────────────────
// Aktiv über localStorage-Flag `gt_demo=1` (setzt .seed_demo.py). Rendert eine
// emoji-freie Beispiel-Community komplett lokal — ohne Firebase, Login oder
// Cloud-Push. Nur für Marketing-Screenshots im Simulator.
function DEMO_MODE(){ try { return localStorage.getItem('gt_demo') === '1'; } catch(_){ return false; } }
const _DEMO_ROSTER = [
  { uid:'demo1', name:'Max Berger',   gymName:'FitZone Mitte', ses:4, mon:14, vol:18400, streak:6,  agoMin:3,    live:true,  gymLat:52.5200, gymLng:13.4050, photo:'https://i.pravatar.cc/150?img=12' },
  { uid:'demo2', name:'Lena Frank',   gymName:'McFit Nord',    ses:3, mon:11, vol:12900, streak:12, agoMin:130,  live:false, gymLat:52.5601, gymLng:13.4020, photo:'https://i.pravatar.cc/150?img=47' },
  { uid:'demo3', name:'Tom Krause',   gymName:'Gym 80',        ses:5, mon:17, vol:22600, streak:3,  agoMin:1440, live:false, gymLat:52.4890, gymLng:13.3420, photo:'https://i.pravatar.cc/150?img=33', mod:true },
  { uid:'demo4', name:'Sara Weber',   gymName:'Body Culture',  ses:2, mon:9,  vol:9800,  streak:8,  agoMin:4320, live:false, gymLat:52.5060, gymLng:13.4520, photo:'https://i.pravatar.cc/150?img=45' },
  { uid:'demo5', name:'Jonas Peters', gymName:'FitStar West',  ses:4, mon:13, vol:16100, streak:1,  agoMin:305,  live:false, gymLat:52.5150, gymLng:13.3010, photo:'https://i.pravatar.cc/150?img=51' },
];
// Aus dem Roster abgeleitet — welche Demo-UIDs im Screenshot-Roster als Moderator markiert sind.
const _DEMO_MOD_UIDS = new Set(_DEMO_ROSTER.filter(d => d.mod).map(d => d.uid));
function _demoMe(){ return { uid:'demo-me', name:(S.userName||'Lenny'), gymName:'FitZone Mitte', ses:5, mon:18, vol:24200, streak:9, agoMin:60, live:false, gymLat:52.5170, gymLng:13.3880, photo:'https://i.pravatar.cc/150?img=68' }; }
function _demoProfile(d){
  return {
    uid:d.uid, name:d.name, photo:d.photo||null, gymName:d.gymName,
    week:{ key:getWeekKey(), vol:d.vol, ses:d.ses },
    month:{ key:_monthKey(), ses:d.mon },
    streak:d.streak,
    lastWk: Date.now() - d.agoMin*60000,
    live: d.live ? { on:true, start: Date.now() - 26*60000, gym:d.gymName } : null,
  };
}
// Snap-Foto-Posts für den Demo-Feed — je Post ein anderes Share-Layout, damit
// sich im Simulator alle Snap-Designs im echten Card-Pager prüfen lassen.
// Echte Gym-Fotos als Post-Hintergrund (Unsplash-CDN, hotlink-fähig). Als reines
// <img> gerendert (kein Canvas → kein CORS-Taint), Text liegt als HTML-Overlay drüber.
const _GYM_PHOTO = [
  'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=800&q=70',
  'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?auto=format&fit=crop&w=800&q=70',
  'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=800&q=70',
  'https://images.unsplash.com/photo-1558611848-73f7eb4001a1?auto=format&fit=crop&w=800&q=70',
  'https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?auto=format&fit=crop&w=800&q=70',
  'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?auto=format&fit=crop&w=800&q=70',
];
// Vorgeladene Image-Objekte (crossOrigin, damit das Canvas beim gebackenen
// Demo-Layout nicht "tainted" wird) — je Foto ein Promise, das auflöst sobald
// geladen (oder mit null bei Fehler, dann fällt das Layout auf Akzent-Verlauf zurück).
const _GYM_PHOTO_IMG = _GYM_PHOTO.map(url => {
  const im = new Image();
  im.crossOrigin = 'anonymous';
  im._ready = new Promise(res => { im.onload = () => res(im); im.onerror = () => res(null); });
  im.src = url;
  return im;
});
const _DEMO_POSTS = [
  { name:'Max Berger',   dayName:'Push Day',     dur:3480, mgs:['Brust','Schulter','Trizeps'], gym:'FitZone Mitte', prCount:2, photo:_GYM_PHOTO[0], ava:'https://i.pravatar.cc/150?img=12', fl:14, agoMin:8    },
  { name:'Lena Frank',   dayName:'Leg Day',      dur:3900, mgs:['Beine','Waden'],              gym:'McFit Nord',    prCount:1, photo:_GYM_PHOTO[1], ava:'https://i.pravatar.cc/150?img=47', fl:8,  agoMin:52   },
  { name:'Tom Krause',   dayName:'Pull',         dur:3120, mgs:['Rücken','Bizeps'],            gym:'Gym 80',        prCount:0, photo:_GYM_PHOTO[2], ava:'https://i.pravatar.cc/150?img=33', fl:3,  agoMin:180  },
  { name:'Sara Weber',   dayName:'Ganzkörper',   dur:2760, mgs:['Beine','Brust','Rücken'],     gym:'Body Culture',  prCount:3, photo:_GYM_PHOTO[3], ava:'https://i.pravatar.cc/150?img=45', fl:27, agoMin:1500 },
  { name:'Jonas Peters', dayName:'Oberkörper',   dur:3300, mgs:['Brust','Rücken','Arme'],      gym:'FitStar West',  prCount:1, photo:_GYM_PHOTO[4], ava:'https://i.pravatar.cc/150?img=51', fl:5,  agoMin:340  },
  { name:'Lenny',        dayName:'Beine schwer', dur:3660, mgs:['Beine','Po'],                 gym:'FitZone Mitte', prCount:2, photo:_GYM_PHOTO[5], ava:'https://i.pravatar.cc/150?img=68', fl:11, me:true, agoMin:60 },
];
// Fake-Flammen-Map mit n Reaktoren (nur Demo — für sichtbaren Reaktions-Zähler).
function _demoFlames(n){ const o={}; for(let k=0;k<n;k++) o['demofan'+k]=Date.now()-k*60000; return o; }
// Ein Share-Layout mit beliebigen Daten auf Canvas rendern — schaltet temporär
// die _shf*-Globals um und setzt sie zurück; nutzt exakt denselben Renderer wie
// der echte Share-Flow, also sehen die Demo-Snaps aus wie die echten Posts.
function _demoRenderLayout(li, data, pal, bgPhoto){
  const sv = { d:_shfData, p:_shfPhoto, pal:_shfPalIdx, cc:_shfCustomCol };
  _shfData = data; _shfPhoto = bgPhoto || null; _shfPalIdx = pal; _shfCustomCol = null;
  let url = '';
  try { url = _shfRender(li, 540, 720).toDataURL('image/jpeg', 0.9); }
  catch(_) {
    // Canvas getaintet (Bild ohne CORS-Header geladen) → Fallback ohne Foto (Akzent-Verlauf).
    _shfPhoto = null;
    try { url = _shfRender(li, 540, 720).toDataURL('image/jpeg', 0.9); } catch(__) {}
  }
  finally { _shfData = sv.d; _shfPhoto = sv.p; _shfPalIdx = sv.pal; _shfCustomCol = sv.cc; }
  return url;
}
// Feed-Vollbild an/aus: nur im Karten-Feed darf die Seite auf Viewport-Hoehe fixiert
// werden (CSS #pg-freunde.soc-feed-full). Bei Gates, Rangliste, Karte und Freundesliste
// muss die Seite normal scrollen — sonst waeren laengere Inhalte abgeschnitten.
function _socFeedFull(on){
  const pg = document.getElementById('pg-freunde');
  if (pg) pg.classList.toggle('soc-feed-full', !!on);
}
function _renderDemoFriends(body){
  try { _frStopLive(); } catch(_){}
  _socFeedFull(_socZone === 'community');
  if (_socZone === 'community') return _renderDemoFeed(body);
  if (_socTab === 'board') return _renderDemoBoard(body);
  if (_socTab === 'map')   return _renderDemoMap(body);
  if (_socTab === 'crew')  return _renderDemoCrew(body);
  return _renderDemoOverview(body);   // 'home' = Uebersicht, 'friends' = ganze Liste
}
function _demoCard(p){
  const wk = getWeekKey();
  const online = !!(p.live && p.live.on);
  let sub;
  if (online){
    const mins = Math.max(1, Math.round((Date.now()-(p.live.start||Date.now()))/60000));
    sub = `<span class="fr-live-badge"><span class="fr-live-dot"></span>Trainiert gerade · seit ${mins} Min.</span>`;
    if (p.live.gym) sub += `<div class="fr-sub" style="margin-top:5px">${esc(p.live.gym)}</div>`;
  } else {
    sub = `<div class="fr-sub">${p.lastWk ? 'Training ' + _timeAgo(p.lastWk) : 'Noch kein Training'}${p.gymName ? ' · ' + esc(p.gymName) : ''}</div>`;
  }
  const wses = (p.week && p.week.key === wk) ? p.week.ses : 0;
  const ava = p.photo ? `<img src="${esc(p.photo)}" alt="">` : _socInitials(p.name);
  // Antippbar wie die echte Karte. Fehlte bisher komplett: im Demo-Modus liess
  // sich kein Freundesprofil oeffnen, was beim Pruefen im Simulator wie ein
  // toter Bildschirm wirkt. openFrProfile liest nur _socCache (kein Firestore),
  // deshalb reicht es, den Zwischenspeicher mit den Demo-Profilen zu fuellen.
  return `<div class="fr-card${online?' live':''}" onclick="openFrProfile('${p.uid}')">
    <div class="fr-ava-wrap"><div class="fr-ava">${ava}</div><div class="fr-dot${online?' on':''}"></div></div>
    <div style="flex:1;min-width:0">
      <div class="fr-name"><span>${esc(p.name)}</span>${_modTag(p.uid)}${_lvlPillFor(p)}</div>
      ${sub}
      <div class="fr-pills">
        <span class="fr-pill">${wses}× diese Woche</span>
        ${p.streak ? `<span class="fr-pill fire">${_flameSVG(12)}${p.streak} Wo.</span>` : ''}
      </div>
    </div>
    <svg class="fr-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
  </div>`;
}
/* Erfundene Crew fuer den Demo-Modus. Rein lokal — _crewReady() ist im Demo
   false, es geht also nie ein Schreibvorgang in die echte Datenbank. */
const _DEMO_CREW = {
  id: 'EPK7QM', name: 'Eisenpark Crew', owner: 'demo-me', goal: 20, goalType: 'ses', streak: 3,
  members: ['demo-me', 'demo1', 'demo2', 'demo3', 'demo4', 'demo5'],
  wk: { 'demo-me': 5, demo1: 4, demo2: 3, demo3: 3, demo4: 2, demo5: 0 },
  hist: [
    { key: '2026-06-15', total: 22, goal: 20, done: true },
    { key: '2026-06-22', total: 17, goal: 20, done: false },
    { key: '2026-06-29', total: 21, goal: 20, done: true },
    { key: '2026-07-06', total: 24, goal: 20, done: true },
    { key: '2026-07-13', total: 20, goal: 20, done: true },
    { key: '2026-07-20', total: 18, goal: 20, done: false },
    { key: '2026-07-27', total: 23, goal: 20, done: true },
    { key: '2026-08-03', total: 21, goal: 20, done: true }
  ]
};
function _demoCrewDoc(){ return { ..._DEMO_CREW, weekKey: crewWeekKey() }; }
function _demoCrewProfs(){
  const o = { 'demo-me': { name: S.userName || 'Lenny', photo: 'https://i.pravatar.cc/150?img=68' } };
  _DEMO_ROSTER.forEach(d => { o[d.uid] = { name: d.name, photo: d.photo }; });
  return o;
}
/* Demo-Uebersicht in derselben Gliederung wie die echte Seite — sonst zeigen
   Marketing-Screenshots eine App, die es so nicht mehr gibt. */
function _renderDemoOverview(body){
  const profs = _DEMO_ROSTER.map(_demoProfile);
  profs.sort((a,b)=> (b.live&&b.live.on?2:0)-(a.live&&a.live.on?2:0) || (b.lastWk||0)-(a.lastWk||0));
  _socCache = profs; _socCacheTs = Date.now();   // damit openFrProfile die Demo-Leute findet
  const voll  = _socTab === 'friends';
  const sicht = voll ? profs : profs.slice(0, 4);
  const wk    = getWeekKey();
  const board = profs.concat([{ uid:'demo-me', name:S.userName||'Lenny', photo:'https://i.pravatar.cc/150?img=68', week:{key:wk,vol:24200,ses:5} }])
    .map(p => ({ ...p, _v: _socVal(p, wk) })).sort((a,b) => b._v - a._v).slice(0, 3);
  const liste = sicht.map((p,i)=>_demoCard(p).replace('class="fr-card', `style="animation-delay:${Math.min(i*40,240)}ms" class="fr-card`)).join('')
    + (voll ? '' : `<button class="soc-rest" onclick="setSocTab('friends')">Noch ${profs.length - sicht.length} weitere anzeigen</button>`);
  if (voll) { body.innerHTML = `${_socBackBar('Freunde')}<div id="fr-list">${liste}</div>`; return; }
  body.innerHTML = `
    <div id="fr-crew-host">${_crewHomeHTML(_demoCrewDoc())}</div>
    ${_socSec('Freunde', 'Alle anzeigen', 'friends')}
    <div id="fr-list">${liste}</div>
    ${_socSec('Rangliste · diese Woche', 'Ganze Rangliste', 'board')}
    <div id="fr-board-mini">${board.map((p,i) => `
      <div class="soc-row${p.uid==='demo-me'?' me':''}">
        <span class="soc-rank${i===0?' top':''}">${i+1}</span>
        <div class="soc-ava"><img src="${esc(p.photo)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" alt=""></div>
        <div style="flex:1;min-width:0"><div class="soc-name">${esc(p.name||'')}${p.uid==='demo-me'?' (du)':''}</div></div>
        <span class="soc-val">${_socFmtVal(p._v)}</span>
      </div>`).join('')}</div>
    ${_socSec('Karte', 'Große Karte', 'map')}
    <div id="fr-map-mini"><div class="fr-map-card" onclick="setSocTab('map')">
      <div class="fr-map-ico">${_OB_SVG.users}</div>
      <div style="flex:1;min-width:0">
        <div class="fr-name"><span>Gyms in deiner Nähe</span></div>
        <div class="fr-sub">${_DEMO_ROSTER.length} Freunde trainieren in eingetragenen Gyms</div>
      </div>
      <svg class="fr-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
    </div></div>`;
}
/* Volle Crew-Ansicht im Demo: dasselbe Markup wie echt, nur mit erfundenem
   Dokument. Wird danach sofort zurueckgesetzt, damit kein Demo-Stand haengen
   bleibt, wenn jemand den Demo-Modus abschaltet. */
function _renderDemoCrew(body){
  const svc = _crews, svo = _crewOpen, svp = _crewProfs;
  const d = _demoCrewDoc();
  _crews = { [d.id]: d }; _crewOpen = d.id; _crewProfs = _demoCrewProfs();
  body.innerHTML = `${_socBackBar('Gruppe')}<div id="crew-host">${_crewCardHTML(d)}</div>`;
  _crews = svc; _crewOpen = svo; _crewProfs = svp;
}
async function _renderDemoFeed(body){
  _cpgMode = (_socZone === 'community') ? 'public' : 'friends';
  const isPub = _cpgMode === 'public';
  body.innerHTML = `
    <div class="cpg-zone"><span class="cpg-zone-t">${isPub ? ICO.globe({ s: 16 }) + `<span>${tr('Alle MyGymTrack-Nutzer')}</span>` : ICO.users({ s: 16 }) + `<span>${tr('Nur deine Freunde')}</span>`}<span class="cpg-live js-live-count"></span></span><span class="cpg-count" id="cpg-count"></span></div>
    <div class="cpg-wrap" id="cpg-wrap"></div>`;
  // Auf die Vorlade-Promises der Gym-Fotos warten, damit sie als echter
  // Bildhintergrund ins gebackene Layout einfließen (statt Akzent-Verlauf).
  await Promise.all(_GYM_PHOTO_IMG.map(im => im._ready));
  const now = Date.now();
  _cpgItems = _DEMO_POSTS.map((p, i) => {
    const nm  = p.me ? (S.userName || 'Lenny') : p.name;
    const ts  = now - p.agoMin * 60000;
    // Fertig gestaltetes Share-Layout (3:4) backen — exakt wie ein echter Post.
    // Je Post ein anderes Layout + eine andere Farbpalette, damit alle Designs
    // im Card-Pager sichtbar sind (Palette 0 = App-Theme wird übersprungen).
    const layoutImg = _demoRenderLayout(
      i % SHARE_LAYOUTS.length,
      { dayName: p.dayName, duration: p.dur, mgs: p.mgs, gym: p.gym,
        date: new Date(ts), username: nm, photo: null, prCount: p.prCount || 0 },
      (i % (SHF_PALETTES.length - 1)) + 1,
      _GYM_PHOTO_IMG[i % _GYM_PHOTO_IMG.length]
    );
    return {
      id: 'demo-post-' + i, uid: p.me ? 'demo-me' : ('demo' + (i + 1)), kind: 'post',
      // Gebackenes Layout → Bild IST die fertige Card (kein HTML-Overlay, kein rawImg).
      // photo = Kopf-Avatar (rund, oben im Post) — getrennt vom gebackenen Hintergrundfoto.
      name: nm, photo: p.ava || null, img: layoutImg,
      dayName: p.dayName, dur: Math.round(p.dur / 60), gym: p.gym, mgs: p.mgs, prCount: p.prCount || 0,
      visibility: isPub ? 'public' : 'friends', ts, flames: _demoFlames(p.fl || 0)
    };
  });
  _cpgIdx = 0;
  _cpgRenderStack();
}
function _renderDemoBoard(body){
  body.innerHTML = `<div class="soc-chips" style="flex-wrap:wrap">
      <button class="soc-chip${_socMetric==='vol'?' on':''}" onclick="setSocMetric('vol')">Volumen</button>
      <button class="soc-chip${_socMetric==='ses'?' on':''}" onclick="setSocMetric('ses')">Trainings</button>
      <button class="soc-chip${_socMetric==='monat'?' on':''}" onclick="setSocMetric('monat')">Monat</button>
      <button class="soc-chip${_socMetric==='streak'?' on':''}" onclick="setSocMetric('streak')">Streak</button>
    </div><div id="soc-board"></div>`;
  const wk = getWeekKey();
  const rows = [..._DEMO_ROSTER, _demoMe()].map(_demoProfile).map(p=>({ ...p, _v:_socVal(p, wk) })).sort((a,b)=>b._v-a._v);
  const hint = _socMetric==='xp' ? 'Level steigt mit Trainings, Streak & Flammen.'
             : _socMetric==='streak' ? 'Streak zählt Trainingswochen in Folge.'
             : _socMetric==='monat'  ? 'Monats-Ranking — zählt Trainings im ' + new Date().toLocaleDateString(GT_LOCALE,{month:'long'}) + '.'
             : 'Rangliste zählt die aktuelle Woche (Mo–So).';
  const el = document.getElementById('soc-board');
  el.innerHTML = rows.map((p,i)=>`
    <div class="soc-row${p.uid==='demo-me'?' me':''}">
      <span class="soc-rank${i===0?' top':''}">${i+1}</span>
      <div class="soc-ava">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : _socInitials(p.name)}</div>
      <div style="flex:1;min-width:0">
        <div class="soc-name">${esc(p.name)}${_founderTag(p.uid)}${_modTag(p.uid)}${_lvlPillFor(p)}${p.uid==='demo-me'?' (du)':''}</div>
        <div class="soc-sub">${_socMetric==='xp'?tr('Level')+' '+_levelOf(p._v).level:(p.gymName?esc(p.gymName):(_socMetric==='streak'?'Wochen in Folge':'aktueller Zeitraum'))}</div>
      </div>
      <span class="soc-val">${_socFmtVal(p._v)}</span>
    </div>`).join('') + `<div class="soc-empty" style="padding:12px 16px 8px;font-size:12.5px">${hint}</div>`;
}
function _renderDemoMap(body){
  body.innerHTML = `<div class="soc-map-wrap">
      <div id="social-map"><div class="soc-empty" style="height:100%;display:flex;align-items:center;justify-content:center">Karte lädt…</div></div>
      <button class="soc-map-loc" id="soc-map-loc" onclick="socLocateMe()" aria-label="Mein Standort">
        <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.4"/><path d="M12 2v3.2M12 18.8V22M22 12h-3.2M5.2 12H2"/></svg>
      </button>
    </div>
    <div class="soc-map-foot" id="soc-map-foot"></div>`;
  const foot = document.getElementById('soc-map-foot');
  if (foot) foot.innerHTML = `<div class="row" style="padding:8px 4px">
      <div class="row-body">
        <div class="row-title">Wo deine Freunde trainieren</div>
        <div class="row-sub" style="white-space:normal;line-height:1.4">Tippe auf einen Pin für Details</div>
      </div></div>`;
  _sizeSocMap();
  _loadLeaflet().then(_initDemoMap).catch(() => {
    const m = document.getElementById('social-map');
    if (m) m.innerHTML = '<div class="soc-empty" style="height:100%;display:flex;align-items:center;justify-content:center">Karte konnte nicht geladen werden — bist du offline?</div>';
  });
}
function _initDemoMap(){
  const el = document.getElementById('social-map');
  if (!el || !window.L) return;
  el.innerHTML = '';
  if (_socMap) { try { _socMap.remove(); } catch(_){} _socMap = null; }
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  _socMap = L.map(el, { zoomControl:false, attributionControl:false });
  L.control.attribution({ prefix:false, position:'bottomleft' }).addTo(_socMap);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/' + (dark?'dark_all':'light_all') + '/{z}/{x}/{y}{r}.png',
    { maxZoom:19, attribution:'&copy; OpenStreetMap &copy; CARTO' }).addTo(_socMap);
  _socMarkers.forEach(m => { try { _socMap.removeLayer(m); } catch(_){} });
  _socMarkers = [];
  const pts = [];
  const me = _demoMe();
  if (me.gymLat != null) {
    const m = L.marker([me.gymLat, me.gymLng], { icon:_gymPin('DU', true) }).addTo(_socMap)
      .bindPopup(`<b>Du</b><br>${esc(me.gymName)}`);
    _socMarkers.push(m); pts.push([me.gymLat, me.gymLng]);
  }
  _DEMO_ROSTER.forEach(p => {
    if (p.gymLat == null) return;
    const m = L.marker([p.gymLat, p.gymLng], { icon:_gymPin(_socInitials(p.name), false) }).addTo(_socMap)
      .bindPopup(`<b>${esc(p.name)}</b><br>${esc(p.gymName)}`);
    _socMarkers.push(m); pts.push([p.gymLat, p.gymLng]);
  });
  if (pts.length) _socMap.fitBounds(pts, { padding:[40,40], maxZoom:14 });
  else _socMap.setView([52.52, 13.405], 11);
  setTimeout(() => { _sizeSocMap(); try { _socMap.invalidateSize(); } catch(_){} }, 260);
}

function renderFriendsTab(){
  const body = document.getElementById('fr-body'); if (!body) return;
  _socFeedFull(false);   // Standard: normal scrollende Seite; Feed-Pfade schalten unten wieder an
  document.querySelectorAll('#soc-zone-toggle .szt').forEach(b => b.classList.toggle('on', b.dataset.z === _socZone));
  // Community/Freunde geöffnet → ALLES „Passive" als gesehen markieren, damit die
  // Zahl unten am Community-Tab zuverlässig verschwindet: neue Freundes-Posts UND
  // Flammen auf eigene Posts. (Freundschaftsanfragen bleiben separat am +-Button.)
  _friendPostFresh = 0;
  _communityPostFresh = 0;
  _flFreshCount = 0;
  S.friendPostTs = Date.now();
  S.communityPostTs = Date.now();
  S.flameSeen = Date.now();
  persist();
  const _bb = document.getElementById('flm-bell-badge'); if (_bb) _bb.style.display = 'none';
  _updateFrBadges();
  // Live-Listener SICHER starten, sobald der Tab offen ist (idempotent, Guards verhindern
  // Doppel-Abos). Beim Kaltstart laufen die Start-Aufrufe evtl. vor „Auth settled" ins Leere
  // (_socReady() noch false) → dann würde der Community-Feed erst nach App-Neustart live sein.
  if (_socReady() && S.socialOn) { try { _pushRegister(); _flameNotifStart(); _friendPostNotifStart(); _communityNotifStart(); _reqNotifStart(); _purgeOldPosts(); } catch(_){} }
  if (DEMO_MODE()) return _renderDemoFriends(body);
  if (!window.FB || !window.FB.configured) {
    body.innerHTML = `<div class="soc-gate"><div class="soc-gate-ico">${_OB_SVG.users}</div>
      <div style="font-size:16px;font-weight:700">Cloud nicht eingerichtet</div>
      <div class="soc-empty" style="padding:0">Für die Community wird Firebase benötigt — Anleitung in der CLAUDE.md.</div></div>`;
    return;
  }
  // Auth-Restore läuft in der WKWebView verzögert an — solange noch kein Zustand
  // feststeht, „Verbinde…" zeigen statt fälschlich den Login-Gate (sonst blitzt
  // „Jetzt anmelden" auf, obwohl der User längst angemeldet ist).
  if ((!_fbUser || _fbUser.isAnonymous) && !_authSettled) {
    body.innerHTML = `<div class="soc-gate"><div class="soc-gate-ico">${_OB_SVG.users}</div>
      <div style="font-size:16px;font-weight:700">Verbinde…</div>
      <div class="soc-empty" style="padding:0"><span class="fr-spin" style="display:inline-block;vertical-align:-3px"></span> Cloud-Verbindung wird aufgebaut</div></div>`;
    return;
  }
  // Bereits hinzugefügte Freunde auch OHNE echtes Google-Konto laden: das Lesen der
  // öffentlichen Profile geht mit anonymer Auth (Firestore-Regel: read if auth != null).
  // So erscheinen die Freunde direkt, auch wenn die Google-Session in der WKWebView mal
  // nicht restauriert wurde. Login-Gate nur, wenn gar kein Account da ist ODER noch keine
  // Freunde vorhanden sind (dann ist Anmelden zum Hinzufügen/Sichern sinnvoll).
  const _hasFriends = Array.isArray(S.friends) && S.friends.length > 0;
  if (!_fbUser || (_fbUser.isAnonymous && !_hasFriends)) {
    body.innerHTML = `<div class="soc-gate"><div class="soc-gate-ico">${_OB_SVG.users}</div>
      <div style="font-size:16px;font-weight:700">Freunde hinzufügen</div>
      <div class="soc-empty" style="padding:0">Füge Freunde hinzu, um deren Live-Status, Feed und Rangliste zu sehen — dafür meldest du dich einmal kurz an.</div>
      <button class="btn btn-acc" style="max-width:260px" onclick="openAccountSheet()">Jetzt anmelden</button></div>`;
    return;
  }
  if (!S.socialOn) {
    body.innerHTML = `<div class="soc-gate"><div class="soc-gate-ico">${_OB_SVG.users}</div>
      <div style="font-size:16px;font-weight:700">Community ist aus</div>
      <div class="soc-empty" style="padding:0">Aktiviere die Community für Freunde, Live-Status, Feed und Rangliste. Was andere sehen dürfen, bestimmst du in der Privatsphäre.</div>
      <button class="btn btn-acc" style="max-width:260px" onclick="toggleSocial(true);renderFriendsTab()">Aktivieren</button></div>`;
    return;
  }
  // QR-Deep-Link (?add=CODE) einlösen
  try {
    const pend = sessionStorage.getItem('gt_addCode');
    if (pend) { sessionStorage.removeItem('gt_addCode'); setTimeout(()=>openFrAdd(pend), 250); }
  } catch(_){}
  if (_socZone === 'community') { _socFeedFull(true); return _renderFeed(body); }
  if (_socTab === 'crew')    return _renderSocCrew(body);
  if (_socTab === 'board')   return _renderSocBoard(body);
  if (_socTab === 'map')     return _renderSocMapTab(body);
  if (_socTab === 'friends') return _renderFrOverview(body);
  return _renderFrHome(body);
}

// Freunde-Tab neu aufbauen, sobald der Auth-Zustand feststeht — aber nur wenn
// er gerade sichtbar ist. Behebt: beim ersten Öffnen stand „Jetzt anmelden",
// weil der Login noch nicht restauriert war, und der Freund erschien erst nach
// einem Segment-Wechsel (der renderFriendsTab erneut auslöste).
function _refreshFriendsIfVisible(){
  if (document.getElementById('pg-freunde')?.classList.contains('on')) {
    try { renderFriendsTab(); } catch(_){}
  }
}

// ── EIGENES PROFIL: Name + Bild selbst bestimmen ─────────
// Bild in separatem localStorage-Key (NICHT in S → umgeht die users-hasOnly-Regel);
// Name in S.userName (bereits erlaubt). Beides fließt in _pushSocialProfile → profiles/{uid}.
let _pendingProfilePhoto; // undefined = unverändert · null = entfernen · string = neues DataURL
function _profilePhoto(){ try { return localStorage.getItem('gt_prof_photo') || null; } catch(_){ return null; } }
function _profileName(){ return (S.userName || _fbUser?.displayName || '').slice(0,30); }
const _PF_CAM_SVG = '<span class="pf-cam"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.1-1.8h8.4L17.3 7h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"/><circle cx="12" cy="13" r="3.4"/></svg></span>';
function _renderFreditAva(photo, name){
  const el = document.getElementById('fredit-ava'); if (!el) return;
  el.innerHTML = (photo ? `<img src="${esc(photo)}" alt="">` : esc(_socInitials(name || 'A'))) + _PF_CAM_SVG;
  const rm = document.getElementById('fredit-remove'); if (rm) rm.style.display = photo ? '' : 'none';
}
/* ── Profil "Über mich": Erfahrung/Stärken/Lieblingsmuskeln/Bio ──
   Bewusst in localStorage 'gt_prof_about' (wie gt_prof_photo), NICHT in S —
   umgeht die users-hasOnly-Regel. Sichtbar für Freunde via profiles.about. */
const _PF_STRENGTHS = ['Bankdrücken','Kniebeugen','Kreuzheben','Schulterdrücken','Klimmzüge','Ausdauer','Beweglichkeit','Disziplin'];
/* Erfahrung wird in MONATEN geführt (0–180 = 0–15 Jahre), damit das Maßband
   feine Rasten hat. expYears bleibt als gerundeter Wert erhalten — ältere
   Installationen und fremde Profile ohne expMonths lesen weiter darüber. */
const _PF_EXP_STEP = 3;                       // Monate pro Strich
const _PF_EXP_MAX  = 180;                     // 15 Jahre
const _PF_EXP_N    = _PF_EXP_MAX / _PF_EXP_STEP + 1;   // 61 Striche
let _pfSel = null;
function _profAbout(){
  try {
    const a = JSON.parse(localStorage.getItem('gt_prof_about') || 'null') || {};
    const yrs = typeof a.expYears === 'number' && isFinite(a.expYears) ? Math.max(0, Math.min(15, Math.round(a.expYears))) : null;
    const mon = typeof a.expMonths === 'number' && isFinite(a.expMonths)
      ? Math.max(0, Math.min(_PF_EXP_MAX, Math.round(a.expMonths)))
      : (yrs == null ? null : yrs * 12);
    return {
      expYears:  mon == null ? yrs : Math.round(mon / 12),
      expMonths: mon,
      birth:     /^\d{4}-\d{2}-\d{2}$/.test(a.birth || '') ? a.birth : '',
      strengths: Array.isArray(a.strengths) ? a.strengths.slice(0, 3).map(s => String(s).slice(0, 24)) : [],
      favMg:     Array.isArray(a.favMg) ? a.favMg.slice(0, 3) : [],
      favEx:     Array.isArray(a.favEx) ? a.favEx.slice(0, 3).map(s => String(s).slice(0, 28)) : [],
      bio:       typeof a.bio === 'string' ? a.bio.slice(0, 140) : '',
    };
  } catch(_){ return { expYears: null, expMonths: null, birth: '', strengths: [], favMg: [], favEx: [], bio: '' }; }
}
/* Alter aus dem Geburtsdatum. Nur die Zahl verlässt das Gerät (siehe _pushSocialProfile). */
function _pfAgeFrom(iso){
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return null;
  const b = new Date(iso + 'T00:00:00');
  if (isNaN(b)) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return (age >= 10 && age <= 110) ? age : null;
}
function _pfExpStufe(mon){
  return mon < 12 ? tr('Einsteiger') : mon < 60 ? tr('Fortgeschritten') : mon < 120 ? tr('Erfahren') : tr('Profi');
}
/* Klartext für ein Maßband-Ergebnis: „3 Jahre 6 Monate" / „unter 1 Jahr". */
function _pfExpMonLabel(mon){
  if (mon == null) return '–';
  mon = Math.max(0, Math.min(_PF_EXP_MAX, Math.round(mon)));
  if (mon === 0) return tr('Noch keine Erfahrung');
  if (mon >= _PF_EXP_MAX) return '15+ ' + tr('Jahre');
  const y = Math.floor(mon / 12), m = mon % 12;
  const yTxt = y ? y + ' ' + (y === 1 ? tr('Jahr') : tr('Jahre')) : '';
  const mTxt = m ? m + ' ' + (m === 1 ? tr('Monat') : tr('Monate')) : '';
  return (yTxt && mTxt) ? yTxt + ' ' + mTxt : (yTxt || mTxt);
}
/* Rückwärtskompatible Kurzform (Jahre) — nutzt weiter das Freundesprofil. */
function _pfExpLabel(y){
  if (y == null) return '–';
  return _pfExpStufe(y * 12) + ' · ' + (y === 0 ? tr('unter 1 Jahr') : y >= 15 ? '15+ ' + tr('Jahre') : y + ' ' + (y === 1 ? tr('Jahr') : tr('Jahre')));
}
/* ── Maßband: viele Striche, rastet an jedem ein und klackt dabei ──
   Native Scroll-Snap statt eigener Drag-Physik: iOS-Trägheit bleibt erhalten,
   der scroll-Handler meldet nur den Rastwechsel (Haptik + Beschriftung). */
let _pfExpMon = 0, _pfExpIdx = -1, _pfExpEndT = null;
function _pfBuildRuler(mon){
  const strip = document.getElementById('pf-exp-strip'); if (!strip) return;
  let h = '<div class="pf-ruler-pad"></div>';
  for (let i = 0; i < _PF_EXP_N; i++) {
    const m = i * _PF_EXP_STEP, maj = m % 12 === 0;
    h += `<div class="pf-tick${maj ? ' maj' : ''}" data-i="${i}"><i></i>${maj ? `<b>${m / 12}</b>` : ''}</div>`;
  }
  strip.innerHTML = h + '<div class="pf-ruler-pad"></div>';
  const sc = document.getElementById('pf-exp-scroll');
  if (sc && !sc._pfBound) {
    sc._pfBound = true;
    sc.addEventListener('scroll', _pfExpOnScroll, { passive: true });
    sc.addEventListener('touchstart', () => { try { hapticSelStart(); } catch(_){} }, { passive: true });
  }
  _pfExpIdx = -1;
  _pfSetExp(mon == null ? 12 : mon, true);
}
/* Rasterposition anfahren (ohne Animation beim Öffnen — sonst scrollt das Band
   sichtbar los, während das Sheet noch aufgeht). */
function _pfSetExp(mon, jump){
  const sc = document.getElementById('pf-exp-scroll'); if (!sc) return;
  const idx = Math.max(0, Math.min(_PF_EXP_N - 1, Math.round(mon / _PF_EXP_STEP)));
  const tick = sc.querySelector('.pf-tick'); const tw = tick ? tick.getBoundingClientRect().width || 14 : 14;
  _pfApplyExpIdx(idx, true);
  const go = () => { sc.scrollTo({ left: idx * tw, behavior: jump ? 'auto' : 'smooth' }); };
  go();
  if (jump) requestAnimationFrame(go);   // Sheet-Öffnung: Breite steht erst im nächsten Frame
}
function _pfExpOnScroll(){
  const sc = document.getElementById('pf-exp-scroll'); if (!sc) return;
  const tick = sc.querySelector('.pf-tick'); if (!tick) return;
  const tw = tick.getBoundingClientRect().width || 14;
  const idx = Math.max(0, Math.min(_PF_EXP_N - 1, Math.round(sc.scrollLeft / tw)));
  _pfApplyExpIdx(idx);
  clearTimeout(_pfExpEndT);
  _pfExpEndT = setTimeout(() => { try { hapticSelEnd(); } catch(_){} }, 220);
}
function _pfApplyExpIdx(idx, silent){
  if (idx === _pfExpIdx) return;
  _pfExpIdx = idx;
  _pfExpMon = idx * _PF_EXP_STEP;
  if (!silent) { try { hapticTick(); } catch(_){} }
  const strip = document.getElementById('pf-exp-strip');
  if (strip) strip.querySelectorAll('.pf-tick').forEach(t => {
    const i = +t.dataset.i;
    t.classList.toggle('on', i <= idx);
    t.classList.toggle('cur', i === idx);
  });
  const val = document.getElementById('pf-exp-val');
  if (val) {
    val.textContent = _pfExpMonLabel(_pfExpMon);
    if (!silent) { val.classList.remove('bump'); void val.offsetWidth; val.classList.add('bump'); }
  }
  const lvl = document.getElementById('pf-exp-lvl');
  if (lvl) lvl.textContent = _pfExpStufe(_pfExpMon);
}
function _pfBirthChanged(){
  const inp = document.getElementById('pf-birth');
  const chip = document.getElementById('pf-age');
  const age = _pfAgeFrom(inp?.value);
  if (chip) {
    chip.style.display = age == null ? 'none' : '';
    chip.textContent = age == null ? '' : age + ' ' + tr('Jahre');
  }
  if (age != null) haptic(5);
}
function _pfTgl(kind, val){
  if (!_pfSel) return;
  const arr = _pfSel[kind];
  const i = arr.indexOf(val);
  if (i >= 0) arr.splice(i, 1);
  else { if (arr.length >= 3) return; arr.push(val); }
  haptic(5); _pfRenderChips();
}
function _pfRenderChips(){
  const st = document.getElementById('pf-strengths');
  if (st) st.innerHTML = _PF_STRENGTHS.map(s =>
    `<button type="button" class="pf-chip${_pfSel.strengths.includes(s) ? ' on' : ''}" onclick="_pfTgl('strengths','${s.replace(/'/g, "\\'")}')">${tr(s)}</button>`).join('');
  const fm = document.getElementById('pf-favmg');
  if (fm) fm.innerHTML = MUSCLE_GROUPS.map(g =>
    `<button type="button" class="pf-chip${_pfSel.favMg.includes(g.id) ? ' on' : ''}" onclick="_pfTgl('favMg','${g.id}')">${g.label}</button>`).join('');
  _pfRenderFavEx();
}
/* ── Lieblingsübungen: aus der eigenen Übungsliste, sonst Standard-Klassiker ── */
function _pfExPool(){
  const own = (S.exercises || []).map(e => ({ n: String(e.name || '').slice(0, 28), g: e.muscleGroup || '' })).filter(e => e.n);
  const seen = new Set(own.map(e => e.n.toLowerCase()));
  _PF_STRENGTHS.slice(0, 5).forEach(n => { if (!seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); own.push({ n, g: '' }); } });
  return own;
}
function _pfExSearch(q){
  const host = document.getElementById('pf-favex-list'); if (!host) return;
  q = (q || '').trim().toLowerCase();
  if (!q) { host.innerHTML = ''; return; }
  const sel = (_pfSel?.favEx || []).map(s => s.toLowerCase());
  const hits = _pfExPool().filter(e => e.n.toLowerCase().includes(q) && !sel.includes(e.n.toLowerCase())).slice(0, 6);
  host.innerHTML = hits.length
    ? `<div class="pf-exlist">${hits.map(e => `<div class="pf-exrow" onclick="_pfAddFavEx('${e.n.replace(/'/g, "\\'")}')">
        <span class="pf-exrow-n">${esc(e.n)}</span>${e.g ? `<span class="pf-exrow-g">${esc(muscleLabel(e.g) || e.g)}</span>` : ''}</div>`).join('')}</div>`
    : `<div class="soc-empty" style="padding:10px 2px;text-align:left;font-size:12.5px">${tr('Keine Übung gefunden')}</div>`;
}
function _pfAddFavEx(name){
  if (!_pfSel) return;
  const n = String(name || '').slice(0, 28);
  if (!n || _pfSel.favEx.length >= 3 || _pfSel.favEx.some(x => x.toLowerCase() === n.toLowerCase())) return;
  _pfSel.favEx.push(n);
  haptic(8);
  const q = document.getElementById('pf-favex-q'); if (q) q.value = '';
  _pfExSearch('');
  _pfRenderFavEx();
}
function _pfRmFavEx(i){
  if (!_pfSel) return;
  _pfSel.favEx.splice(i, 1); haptic(5); _pfRenderFavEx();
}
function _pfRenderFavEx(){
  const host = document.getElementById('pf-favex-sel'); if (!host || !_pfSel) return;
  host.innerHTML = _pfSel.favEx.length
    ? _pfSel.favEx.map((n, i) => `<span class="pf-selchip">${esc(n)}<button type="button" aria-label="${tr('Entfernen')}" onclick="_pfRmFavEx(${i})">✕</button></span>`).join('')
    : `<div class="soc-empty" style="padding:2px 2px 0;text-align:left;font-size:12.5px">${tr('Noch keine gewählt — such unten nach deinen Übungen.')}</div>`;
  const q = document.getElementById('pf-favex-q');
  if (q) q.style.display = _pfSel.favEx.length >= 3 ? 'none' : '';
}
function openProfileEdit(){
  _pendingProfilePhoto = undefined;
  const nameInp = document.getElementById('fredit-name');
  if (nameInp) nameInp.value = _profileName();
  _renderFreditAva(_profilePhoto(), _profileName());
  const ab = _profAbout();
  _pfSel = { strengths: [...ab.strengths], favMg: [...ab.favMg], favEx: [...ab.favEx] };
  const birth = document.getElementById('pf-birth');
  if (birth) {
    birth.value = ab.birth || '';
    // mind. 10 Jahre alt — kalenderbasiert: 10*365,25 Tage verfehlen den Stichtag
    // je nach Schaltjahren, und toISOString haette zusaetzlich in UTC gerechnet.
    const maxBirth = new Date(); maxBirth.setHours(0,0,0,0);
    maxBirth.setFullYear(maxBirth.getFullYear() - 10);
    birth.max = _localDateKey(maxBirth);
  }
  _pfBirthChanged();
  const bio = document.getElementById('pf-bio');
  if (bio) { bio.value = ab.bio; const c = document.getElementById('pf-bio-count'); if (c) c.textContent = 140 - ab.bio.length; }
  const q = document.getElementById('pf-favex-q'); if (q) q.value = '';
  _pfExSearch('');
  _pfRenderChips();
  openOv('ov-fredit');
  _pfBuildRuler(ab.expMonths);
}
function _pickProfilePhoto(input){
  const file = input.files && input.files[0]; input.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      // Quadratisch mittig beschneiden + auf 256px verkleinern → kleines JPEG (Firestore-Doc < 1 MB)
      const SZ = 256, cnv = document.createElement('canvas'); cnv.width = SZ; cnv.height = SZ;
      const ctx = cnv.getContext('2d');
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, SZ, SZ);
      _pendingProfilePhoto = cnv.toDataURL('image/jpeg', 0.82);
      _renderFreditAva(_pendingProfilePhoto, document.getElementById('fredit-name')?.value);
      // Sofort übernehmen, nicht erst beim Speichern: ✕ statt „Speichern" warf das
      // gewählte Bild sonst kommentarlos weg und der Heute-Avatar blieb alt
      try { localStorage.setItem('gt_prof_photo', _pendingProfilePhoto); } catch(e) { alert('Bild zu groß zum Speichern — bitte kleineres wählen.'); return; }
      try { _renderHdrAva(); } catch(_){}
      try { _pushSocialProfile(); } catch(_){}
    };
    img.onerror = () => alert('Bild konnte nicht geladen werden.');
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
function removeProfilePhoto(){
  _pendingProfilePhoto = null;
  _renderFreditAva(null, document.getElementById('fredit-name')?.value);
  try { localStorage.removeItem('gt_prof_photo'); } catch(_){}
  try { _renderHdrAva(); } catch(_){}
  try { _pushSocialProfile(); } catch(_){}
}
async function saveProfileEdit(){
  const name = (document.getElementById('fredit-name')?.value || '').trim().slice(0,30);
  if (name) S.userName = name;
  const mon = Math.max(0, Math.min(_PF_EXP_MAX, _pfExpMon | 0));
  const birth = (document.getElementById('pf-birth')?.value || '');
  const ab = {
    expMonths: mon,
    expYears: Math.round(mon / 12),          // Kompatibilität: ältere Clients lesen nur Jahre
    birth: /^\d{4}-\d{2}-\d{2}$/.test(birth) ? birth : '',
    strengths: (_pfSel?.strengths || []).slice(0, 3),
    favMg: (_pfSel?.favMg || []).slice(0, 3),
    favEx: (_pfSel?.favEx || []).slice(0, 3),
    bio: (document.getElementById('pf-bio')?.value || '').trim().slice(0, 140),
  };
  try { localStorage.setItem('gt_prof_about', JSON.stringify(ab)); } catch(_){}
  if (_pendingProfilePhoto !== undefined) {
    try {
      if (_pendingProfilePhoto) localStorage.setItem('gt_prof_photo', _pendingProfilePhoto);
      else localStorage.removeItem('gt_prof_photo');
    } catch(e) { alert('Bild zu groß zum Speichern — bitte kleineres wählen.'); return; }
  }
  persist();
  try { updateAccountUI(); } catch(_){}
  try { _renderHdrAva(); } catch(_){}
  closeOv('ov-fredit');
  haptic(12);
  _socCache = null;                    // Cache leeren, damit die eigene Karte neu lädt
  try { await _pushSocialProfile(); } catch(_){}
  try { renderFriendsTab(); } catch(_){}
}

function _monthKey(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'); }
function _socVal(p, wk){
  if (_socMetric === 'xp') return (p.uid === _fbUser?.uid) ? _xpSelf() : _xpOf(p);
  if (_socMetric === 'streak') return p.streak || 0;
  if (_socMetric === 'monat') return (p.month && p.month.key === _monthKey()) ? (p.month.ses || 0) : 0;
  if (!p.week || p.week.key !== wk) return 0;
  return _socMetric === 'vol' ? (p.week.vol || 0) : (p.week.ses || 0);
}
function _socFmtVal(v){
  if (_socMetric === 'xp') return _fmtXP(v) + ' XP';
  if (_socMetric === 'vol') return fmtKg(v);
  if (_socMetric === 'ses' || _socMetric === 'monat') return v + '×';
  return v + ' Wo.';
}
async function _renderSocBoard(body){
  body.innerHTML = `${_socBackBar('Rangliste')}<div class="soc-chips" style="flex-wrap:wrap">
      <button class="soc-chip${_socMetric==='vol'?' on':''}" onclick="setSocMetric('vol')">Volumen</button>
      <button class="soc-chip${_socMetric==='ses'?' on':''}" onclick="setSocMetric('ses')">Trainings</button>
      <button class="soc-chip${_socMetric==='monat'?' on':''}" onclick="setSocMetric('monat')">Monat</button>
      <button class="soc-chip${_socMetric==='streak'?' on':''}" onclick="setSocMetric('streak')">Streak</button>
    </div>
    <div id="soc-board"><div class="soc-empty">Lade Rangliste…</div></div>`;
  try { await _pushSocialProfile(); } catch(_){}
  const profs = await _loadProfiles(true);
  const el = document.getElementById('soc-board'); if (!el) return;
  if (profs.length <= 1) {
    el.innerHTML = `<div class="soc-empty">Noch niemand zum Vergleichen.<br>Füge oben rechts Freunde hinzu.</div>`;
    return;
  }
  const wk = getWeekKey();
  const rows = profs.map(p => ({ ...p, _v: _socVal(p, wk) })).sort((a,b) => b._v - a._v);
  const hint = _socMetric==='xp' ? 'Level steigt mit Trainings, Streak & Flammen.'
             : _socMetric==='streak' ? 'Streak zählt Trainingswochen in Folge.'
             : _socMetric==='monat'  ? 'Monats-Ranking — zählt Trainings im ' + new Date().toLocaleDateString(GT_LOCALE,{month:'long'}) + '.'
             : 'Rangliste zählt die aktuelle Woche (Mo–So).';
  el.innerHTML = rows.map((p,i) => `
    <div class="soc-row${p.uid===_fbUser.uid?' me':''}">
      <span class="soc-rank${i===0?' top':''}">${i+1}</span>
      <div class="soc-ava">${p.photo?`<img src="${esc(p.photo)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" alt="">`:_socInitials(p.name)}</div>
      <div style="flex:1;min-width:0">
        <div class="soc-name">${esc(p.name||'')}${_founderTag(p.uid)}${_lvlPillFor(p)}${p.uid===_fbUser.uid?' (du)':''}</div>
        <div class="soc-sub">${_socMetric==='xp' ? tr('Level')+' '+_levelOf(p._v).level : (p.gymName ? esc(p.gymName) : (_socMetric==='streak' ? 'Wochen in Folge' : 'aktueller Zeitraum'))}</div>
      </div>
      <span class="soc-val">${_socFmtVal(p._v)}</span>
    </div>`).join('') +
    `<div class="soc-empty" style="padding:12px 16px 8px;font-size:12.5px">${hint}</div>`;
}
/* ── Freunde-Übersicht (Karten mit Live-Status) ── */
function _timeAgo(ts){
  if (!ts) return '';
  const d = Date.now() - ts;
  if (d < 60000) return 'gerade eben';
  const m = Math.floor(d/60000); if (m < 60) return 'vor ' + m + ' Min.';
  const h = Math.floor(m/60);    if (h < 24) return 'vor ' + h + ' Std.';
  const days = Math.floor(h/24); if (days === 1) return 'gestern';
  if (days < 7) return 'vor ' + days + ' Tagen';
  const w = Math.floor(days/7);  return w === 1 ? 'vor 1 Woche' : 'vor ' + w + ' Wochen';
}
let _flFreshCount = 0;   // Anzahl neuer (ungesehener) Flammen-Reaktionen auf eigene Posts
function _updateFrBadges(){
  const req = _frReqCount || 0;
  // Community-Tab (unten): NUR „neues zum Anschauen" — Freundes-Posts + Flammen.
  // Anfragen sind aktionsbedürftig (annehmen/ablehnen) und bleiben separat am +-Button
  // (fr-add-badge); sonst würde die Tab-Zahl nie durch bloßes Anschauen weggehen.
  const tabN = (_flFreshCount || 0) + (_friendPostFresh || 0) + (_communityPostFresh || 0);
  // Zahl bis 9 anzeigen, darüber „9+".
  const setB = (id, n) => { const el = document.getElementById(id); if (el) { el.style.display = n ? 'block' : 'none'; el.textContent = n > 9 ? '9+' : n; } };
  setB('fr-tab-badge', tabN);   // unten am Community-Tab
  setB('fr-add-badge', req);    // nur Freundschaftsanfragen am +-Button
}
/* Zurueck-Zeile der vollen Ansichten. Seit die Chip-Leiste weg ist, ist sie der
   einzige Weg zurueck auf die Uebersicht — ohne sie waere man in Rangliste oder
   Karte gefangen. */
function _socBackBar(titel){
  return `<div class="soc-back"><button onclick="setSocTab('home')" aria-label="Zurück">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
    </button><span>${esc(titel)}</span></div>`;
}
/* Abschnitts-Kopf der Uebersicht: Titel links, Sprung in die volle Ansicht rechts. */
function _socSec(titel, mehr, ziel){
  return `<div class="soc-sec"><span>${esc(titel)}</span>${
    mehr ? `<button class="soc-more" onclick="setSocTab('${ziel}')">${esc(mehr)}</button>` : ''}</div>`;
}

/* ── Freunde-Zone: EINE scrollende Seite ──────────────────────────────────
   Vorher lagen Freunde, Feed, Crew, Rangliste und Karte hinter fuenf Chips.
   Jetzt steht alles untereinander: erst die eigene Karte und offene Anfragen,
   dann die Crew (mit gemeinsamem Wochenbalken), dann die Freundesliste, dann
   die Rangliste, unten der Einstieg in die Karte. Die vollen Ansichten sind
   weiter da — nur nicht mehr als Pflicht-Klick, sondern als „alle anzeigen". */
async function _renderFrHome(body){
  try { _checkLevelUp(true); } catch(_){}
  // Die eigene Level-Karte steht hier NICHT mehr: Level und Punkte zeigt schon
  // die Kopfzeile — zweimal dieselbe Zahl kostet nur den halben Bildschirm.
  body.innerHTML = `<div class="fr-ptr" id="fr-ptr"></div>
    <div id="fr-req-host"></div>
    <div id="fr-crew-host"></div>
    ${_socSec('Freunde', 'Alle anzeigen', 'friends')}
    <div id="fr-list"><div class="soc-empty"><span class="fr-spin" style="display:inline-block;vertical-align:-3px"></span>Lade Freunde…</div></div>
    ${_socSec('Rangliste · diese Woche', 'Ganze Rangliste', 'board')}
    <div id="fr-board-mini"></div>
    ${_socSec('Karte', 'Große Karte', 'map')}
    <div id="fr-map-mini"></div>`;
  _frListDrawn = false;
  _initFrPull(body);
  _loadRequests().then(r => _renderFrReqs(r.inc));
  // Crew-Block asynchron nachziehen — er haengt an einem eigenen Dokument und
  // darf die Freundesliste nicht aufhalten.
  try { if (typeof _crewHomeBlock === 'function') _crewHomeBlock(); } catch(_){}
  _frLimit = 4;
  await _loadProfiles();
  _renderFrList();
  _renderFrBoardMini();
  _renderFrMapMini();
  _frStartLive();
}
/* Kurz-Rangliste: dieselbe Kennzahl wie die volle Ansicht (_socVal), nur die
   ersten drei. Steht keiner zum Vergleichen da, bleibt der Abschnitt leer statt
   eine Rangliste mit einem einzigen Namen zu zeigen. */
function _renderFrBoardMini(){
  const el = document.getElementById('fr-board-mini'); if (!el) return;
  const profs = (_socCache || []).filter(p => !(S.blocked || []).includes(p.uid));
  if (profs.length <= 1) { el.innerHTML = `<div class="soc-empty" style="padding:14px 16px">Noch niemand zum Vergleichen.</div>`; return; }
  const wk = getWeekKey();
  const rows = profs.map(p => ({ ...p, _v: _socVal(p, wk) })).sort((a, b) => b._v - a._v).slice(0, 3);
  el.innerHTML = rows.map((p, i) => `
    <div class="soc-row${p.uid === _fbUser?.uid ? ' me' : ''}">
      <span class="soc-rank${i === 0 ? ' top' : ''}">${i + 1}</span>
      <div class="soc-ava">${p.photo ? `<img src="${esc(p.photo)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" alt="">` : _socInitials(p.name)}</div>
      <div style="flex:1;min-width:0"><div class="soc-name">${esc(p.name || '')}${_founderTag(p.uid)}${p.uid === _fbUser?.uid ? ' (du)' : ''}</div></div>
      <span class="soc-val">${_socFmtVal(p._v)}</span>
    </div>`).join('');
}
/* Karten-Einstieg. Bewusst KEINE zweite Leaflet-Instanz: die grosse Karte misst
   sich an der Bildschirmhoehe (_sizeSocMap) und wuerde in einem 160-px-Kasten
   gegen ihre eigene Groessenrechnung arbeiten. */
function _renderFrMapMini(){
  const el = document.getElementById('fr-map-mini'); if (!el) return;
  const mit = (_socCache || []).filter(p => p.gymLat != null && p.gymLng != null && p.uid !== _fbUser?.uid).length;
  el.innerHTML = `<div class="fr-map-card" onclick="setSocTab('map')">
    <div class="fr-map-ico">${_OB_SVG.users}</div>
    <div style="flex:1;min-width:0">
      <div class="fr-name"><span>Gyms in deiner Nähe</span></div>
      <div class="fr-sub">${mit ? mit + (mit === 1 ? ' Freund trainiert' : ' Freunde trainieren') + ' in eingetragenen Gyms' : 'Trag dein Gym ein und finde Leute in der Nähe'}</div>
    </div>
    <svg class="fr-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
  </div>`;
}

async function _renderFrOverview(body){
  try { _checkLevelUp(true); } catch(_){}   // Rang-Index seeden (kein Fake-Level-Up beim ersten Öffnen)
  _frLimit = 0;
  body.innerHTML = `${_socBackBar('Freunde')}<div class="fr-ptr" id="fr-ptr"></div><div id="fr-req-host"></div><div id="fr-list"><div class="soc-empty"><span class="fr-spin" style="display:inline-block;vertical-align:-3px"></span>Lade Freunde…</div></div>`;
  _frListDrawn = false;   /* Einblend-Animation nur beim ersten Aufbau, nicht bei Live-Updates */
  _initFrPull(body);
  _loadRequests().then(r => _renderFrReqs(r.inc));
  await _loadProfiles();
  _renderFrList();
  _frStartLive();
}
/* Profilfotos der Anfragenden (das requests-Doc trägt nur den Namen) — best effort,
   einmal geladen und gemerkt, danach wird die Karte einmal neu gezeichnet. */
let _reqProfCache = {};
let _frLastReqs = [];
function _reqLoadPhotos(inc){
  const missing = inc.filter(r => r.from && _reqProfCache[r.from] === undefined);
  if (!missing.length) return;
  missing.forEach(r => { _reqProfCache[r.from] = null; });   // nicht doppelt anfragen
  Promise.all(missing.map(r => window.FB.getDoc(window.FB.doc('profiles', r.from))
    .then(s => { if (s.exists()) _reqProfCache[r.from] = s.data(); })
    .catch(() => {})))
    .then(() => { if (document.getElementById('fr-req-host')) _renderFrReqs(_frLastReqs); });
}
function _renderFrReqs(inc){
  const host = document.getElementById('fr-req-host'); if (!host) return;
  _frLastReqs = inc || [];
  if (!inc || !inc.length) { host.innerHTML = ''; return; }
  _reqLoadPhotos(inc);
  host.innerHTML = `<div class="fr-req-card">
    <div class="fr-req-head">${inc.length} Freundschaftsanfrage${inc.length>1?'n':''}</div>
    ${inc.map(r => {
      const prof = _reqProfCache[r.from] || null;
      const ava = prof && prof.photo ? `<img src="${esc(prof.photo)}" alt="">` : esc(_socInitials(r.fromName));
      const sub = prof && prof.gymName ? esc(prof.gymName) : (r.fromCode ? tr('Code') + ' ' + esc(r.fromCode) : tr('möchte dir folgen'));
      return `<div class="fr-req-row">
      <div class="fr-ava" style="width:42px;height:42px;font-size:14px">${ava}</div>
      <div style="flex:1;min-width:0">
        <div class="fr-name"><span>${esc(r.fromName||'')}</span>${prof ? _lvlPillFor({ ...prof, uid: r.from }) : ''}</div>
        <div class="fr-sub">${sub}</div>
      </div>
      <div class="fr-req-btns">
        <button class="fr-req-ok" onclick="acceptRequest('${r.id}','${r.from}')">Annehmen</button>
        <button class="fr-req-no" onclick="declineRequest('${r.id}')">Ablehnen</button>
      </div>
    </div>`; }).join('')}
  </div>`;
}
function _frCardHTML(p){
  const live = !!(p.live && p.live.on);
  const online = live || !!_frPresence[p.uid];
  const wk = getWeekKey();
  const wses = (p.week && p.week.key === wk) ? (p.week.ses || 0) : 0;
  const ava = p.photo ? `<img src="${esc(p.photo)}" alt="">` : _socInitials(p.name);
  let sub;
  if (live) {
    const mins = Math.max(1, Math.round((Date.now() - (p.live.start || Date.now())) / 60000));
    sub = `<span class="fr-live-badge"><span class="fr-live-dot"></span>Trainiert gerade · seit ${mins < 60 ? mins + ' Min.' : Math.floor(mins/60) + ' Std. ' + (mins%60) + ' Min.'}</span>`;
    if (p.live.gym) sub += `<div class="fr-sub" style="margin-top:5px">${esc(p.live.gym)}</div>`;
  } else {
    sub = `<div class="fr-sub">${p.lastWk ? 'Training ' + _timeAgo(p.lastWk) : 'Noch kein Training'}${p.gymName ? ' · ' + esc(p.gymName) : ''}</div>`;
  }
  return `<div class="fr-card${live?' live':''}" onclick="openFrProfile('${p.uid}')">
    <div class="fr-ava-wrap"><div class="fr-ava">${ava}</div><div class="fr-dot${online?' on':''}"></div></div>
    <div style="flex:1;min-width:0">
      <div class="fr-name"><span>${esc(p.name||'')}</span>${_founderTag(p.uid)}${_lvlPillFor(p)}</div>
      ${sub}
      <div class="fr-pills">
        <span class="fr-pill">${wses}× diese Woche</span>
        ${p.streak ? `<span class="fr-pill fire">${_flameSVG(12)}${p.streak} Wo.</span>` : ''}
      </div>
    </div>
    <svg class="fr-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
  </div>`;
}
let _frLimit = 0;   // 0 = ganze Liste; auf der Uebersicht nur die ersten paar
function _renderFrList(){
  const el = document.getElementById('fr-list'); if (!el) return;
  const friends = (_socCache||[]).filter(p => p.uid !== _fbUser?.uid && !(S.blocked||[]).includes(p.uid));
  if (!friends.length) {
    el.innerHTML = `<div class="fr-empty-hero">
      <div class="soc-gate-ico">${_OB_SVG.users}</div>
      <div style="font-size:17px;font-weight:700">Noch keine Freunde</div>
      <div class="soc-empty" style="padding:0">Füge Freunde hinzu und seht gegenseitig Live-Status, Trainings und Ranglisten.</div>
      <button class="btn btn-acc" style="max-width:240px" onclick="openFrAdd()">Freund hinzufügen</button>
    </div>`;
    return;
  }
  const rank = p => (p.live && p.live.on ? 2 : 0) + (_frPresence[p.uid] ? 1 : 0);
  friends.sort((a,b) => rank(b) - rank(a) || (b.lastWk||0) - (a.lastWk||0));
  const anim = !_frListDrawn; _frListDrawn = true;
  const sicht = _frLimit ? friends.slice(0, _frLimit) : friends;
  el.innerHTML = sicht.map((p,i) => _frCardHTML(p).replace('class="fr-card',
    anim ? `style="animation-delay:${Math.min(i*40,240)}ms" class="fr-card` : 'class="fr-card noanim')).join('')
    + (friends.length > sicht.length
        ? `<button class="soc-rest" onclick="setSocTab('friends')">Noch ${friends.length - sicht.length} weitere anzeigen</button>` : '');
}
/* Pull-to-Refresh */
let _ptrY = null, _ptrOn = false;
function _initFrPull(body){
  body.ontouchstart = e => { _ptrY = (window.scrollY <= 0) ? e.touches[0].clientY : null; _ptrOn = false; };
  body.ontouchmove = e => {
    if (_ptrY == null) return;
    const dy = e.touches[0].clientY - _ptrY;
    const ptr = document.getElementById('fr-ptr'); if (!ptr) return;
    if (dy > 70 && !_ptrOn) { _ptrOn = true; ptr.style.height = '44px'; ptr.innerHTML = '<span class="fr-spin"></span>Aktualisieren…'; haptic(8); }
  };
  body.ontouchend = async () => {
    if (_ptrOn) {
      _socCache = null; _feedCache = null;
      await _renderFrOverview(document.getElementById('fr-body'));
    }
    _ptrY = null; _ptrOn = false;
  };
}
/* ── Live-Updates (Firestore onSnapshot + RTDB-Presence) ── */
function _frStartLive(){
  _frStopLive();
  if (!_socReady() || !S.socialOn) return;
  (S.friends||[]).slice(0,50).forEach(uid => {
    try {
      const un = window.FB.onSnapshot(window.FB.doc('profiles', uid), snap => {
        if (!snap.exists()) return;
        const d = { uid, ...snap.data() };
        const i = (_socCache||[]).findIndex(p => p.uid === uid);
        if (i >= 0) _socCache[i] = d; else (_socCache = _socCache||[]).push(d);
        if ((_socTab === 'friends' || _socTab === 'home') && document.getElementById('pg-freunde')?.classList.contains('on')) _renderFrList();
      });
      _frSubs.push(un);
    } catch(_){}
    try {
      const un2 = window.FB.rtdbWatch('presence/' + uid, snap => {
        const v = snap && snap.val();
        _frPresence[uid] = !!(v && v.online);
        if ((_socTab === 'friends' || _socTab === 'home') && document.getElementById('pg-freunde')?.classList.contains('on')) _renderFrList();
      });
      _frSubs.push(un2);
    } catch(_){}
  });
  _frTimer = setInterval(() => {   // „seit X Min." / „vor X Min." aktuell halten
    if ((_socTab === 'friends' || _socTab === 'home') && document.getElementById('pg-freunde')?.classList.contains('on')) _renderFrList();
  }, 60000);
}
function _frStopLive(){
  _frSubs.forEach(u => { try { u(); } catch(_){} });
  _frSubs = [];
  if (_frTimer) { clearInterval(_frTimer); _frTimer = null; }
}
/* ── Freundschaftsanfragen ────────────────────────────────────────────────
   Doc-ID ist bewusst deterministisch (`<from>__<to>`): dieselbe Anfrage kann
   dadurch nie doppelt entstehen, egal wie oft getippt wird, und „zurückziehen"
   trifft immer genau das richtige Dokument. Die Rules prüfen nur die Felder,
   nicht die ID — deshalb ist setDoc hier erlaubt wie addDoc. */
let _frOutgoing = new Set();   // uids, an die eine Anfrage offen rausgeht
function _reqId(from, to){ return from + '__' + to; }
async function _loadRequests(){
  if (!_socReady()) return { inc: [] };
  const inc = [];
  try {
    const q = window.FB.query(window.FB.collection('requests'),
      window.FB.where('to','==',_fbUser.uid), window.FB.where('status','==','pending'));
    (await window.FB.getDocs(q)).forEach(d => {
      const r = { id:d.id, ...d.data() };
      if ((S.blocked||[]).includes(r.from)) window.FB.deleteDoc(window.FB.doc('requests', d.id)).catch(()=>{});
      else inc.push(r);
    });
  } catch(_){}
  try { // Eigene ausgehende Anfragen: offene merken, angenommene einlösen
    const q2 = window.FB.query(window.FB.collection('requests'), window.FB.where('from','==',_fbUser.uid));
    const snap = await window.FB.getDocs(q2);
    const out = new Set();
    let added = false;
    for (const d of snap.docs) {
      const r = d.data();
      if (r.status === 'accepted') {
        if (!S.friends.includes(r.to)) { S.friends.push(r.to); added = true; }
        window.FB.deleteDoc(window.FB.doc('requests', d.id)).catch(()=>{});
      } else if (r.status === 'pending') out.add(r.to);
    }
    _frOutgoing = out;
    if (added) { persist(); _pushSocialSoon(); _socCache = null; }
  } catch(_){}
  _frReqCount = inc.length;
  _updateFrBadges();
  return { inc };
}
async function acceptRequest(id, from){
  haptic(15);
  if (!S.friends.includes(from)) S.friends.push(from);
  persist(); _pushSocialSoon(); _socCache = null;
  // Absender löst 'accepted' selbst ein und löscht das Doc — bis dahin bleibt es liegen.
  try { await window.FB.updateDoc(window.FB.doc('requests', id), { status:'accepted' }); } catch(_){}
  _frReqCount = Math.max(0, _frReqCount - 1); _updateFrBadges();
  const nm = (_frLastReqs.find(r => r.id === id) || {}).fromName || tr('Ihr');
  try { showUpdateToast(nm + ' ' + tr('ist jetzt dein Freund'), { autoHide:2600 }); } catch(_){}
  renderFriendsTab();
}
async function declineRequest(id){
  haptic(8);
  try { await window.FB.deleteDoc(window.FB.doc('requests', id)); } catch(_){}
  _frReqCount = Math.max(0, _frReqCount - 1); _updateFrBadges();
  renderFriendsTab();
}
/* Gegenseitigkeit: hat die andere Person mir schon geschrieben, wird sofort
   befreundet statt eine zweite Anfrage in die Gegenrichtung zu schicken. */
async function _tryMutualAccept(uid){
  try {
    const s = await window.FB.getDoc(window.FB.doc('requests', _reqId(uid, _fbUser.uid)));
    if (!s.exists() || s.data().status !== 'pending') return false;
    await acceptRequest(s.id, uid);
    return true;
  } catch(_){ return false; }
}
async function _sendRequest(toUid, toName){
  if (toUid === _fbUser.uid) { alert('Das bist du selbst.'); return false; }
  if (S.friends.includes(toUid)) { alert('Ihr seid schon Freunde.'); return false; }
  if ((S.blocked||[]).includes(toUid)) { alert('Dieser Nutzer ist blockiert.'); return false; }
  if (await _tryMutualAccept(toUid)) {
    try { showUpdateToast(tr('Ihr seid jetzt Freunde') + ' — ' + toName, { autoHide:2800 }); } catch(_){}
    return true;
  }
  try {
    await window.FB.setDoc(window.FB.doc('requests', _reqId(_fbUser.uid, toUid)), {
      from:_fbUser.uid, to:toUid,
      fromName:(S.userName || _fbUser.displayName || 'Athlet').slice(0,30),
      fromCode:_socCode(), ts:Date.now(), status:'pending'
    });
    _frOutgoing.add(toUid);
    hapticSuccess();
    try { showUpdateToast(tr('Anfrage an') + ' ' + toName + ' ' + tr('gesendet'), { autoHide:2400 }); } catch(_){}
    return true;
  } catch(e) { alert('Anfrage fehlgeschlagen: ' + (e?.code || e?.message || e)); return false; }
}
/* Offene eigene Anfrage wieder einsammeln. */
async function cancelRequest(toUid, btn){
  if (btn) btn.disabled = true;
  try { await window.FB.deleteDoc(window.FB.doc('requests', _reqId(_fbUser.uid, toUid))); } catch(_){}
  _frOutgoing.delete(toUid);
  haptic(8);
  try { showUpdateToast(tr('Anfrage zurückgezogen'), { autoHide:2000 }); } catch(_){}
  if (btn) {
    btn.disabled = false;
    btn.textContent = tr('Anfragen');
    btn.className = 'fr-req-ok';
    btn.setAttribute('onclick', `_frSendReqBtn(this,'${toUid}','')`);
  }
}
/* Ein Button für Suche UND Freundesprofil: sendet, zeigt danach „Angefragt"
   und wird zum Zurückziehen. */
async function _frSendReqBtn(btn, uid, name){
  btn.disabled = true;
  const ok = await _sendRequest(uid, name || '');
  btn.disabled = false;
  if (!ok) return;
  if (S.friends.includes(uid)) { btn.outerHTML = `<span class="fr-pill">${tr('Befreundet')}</span>`; return; }
  btn.textContent = tr('Angefragt');
  btn.className = 'fr-req-no';
  btn.setAttribute('onclick', `cancelRequest('${uid}',this)`);
}
/* Altname bleibt erhalten (wird noch aus älteren Renderpfaden aufgerufen). */
async function _frProfileSendReq(btn, uid, name){ return _frSendReqBtn(btn, uid, name); }
function removeFriend(uid){
  if (!confirm('Freund aus deiner Liste entfernen?')) return;
  S.friends = (S.friends||[]).filter(x => x !== uid);
  persist(); _pushSocialSoon();
  _socCache = null;
  closeOv('ov-frprofile');
  renderFriendsTab();
}
function blockUser(uid){
  if (!confirm('Nutzer blockieren? Er kann dir keine Anfragen mehr senden und verschwindet aus deiner Liste.')) return;
  S.blocked = S.blocked || [];
  if (!S.blocked.includes(uid)) S.blocked.push(uid);
  S.friends = (S.friends||[]).filter(x => x !== uid);
  persist(); _pushSocialSoon();
  _socCache = null;
  closeOv('ov-frprofile');
  renderFriendsTab();
}
/* ── Freund hinzufügen (Suche · Code · QR · Anfragen) ── */
let _frSearchT = null;
function openFrAdd(prefill){
  haptic(8);
  const body = document.getElementById('fradd-body'); if (!body) return;
  body.innerHTML = `
    <div class="soc-add-row" style="margin-top:4px">
      <input id="fradd-q" placeholder="Name oder Code suchen" autocomplete="off" spellcheck="false"
        style="letter-spacing:normal;text-transform:none;font-weight:600"
        oninput="frSearchInput(this.value)" value="${esc(prefill||'')}">
    </div>
    <div id="fradd-res"></div>
    <div class="fradd-sec">Dein Code</div>
    <div class="soc-code-card" style="margin-bottom:0">
      <div class="soc-code">${_socCode()}</div>
      <div class="soc-code-btns">
        <button onclick="copyFriendCode(this)">Kopieren</button>
        <button onclick="shareFriendCode()">Teilen</button>
        <button onclick="showFrQR()">QR-Code</button>
      </div>
      <div id="fr-qr-host" style="margin-top:14px"></div>
    </div>`;
  openOv('ov-fradd');
  // Offene eigene Anfragen kennen, damit die Treffer sofort „Angefragt" zeigen
  _loadRequests().catch(()=>{});
  if (prefill) frSearchInput(prefill);
}
function frSearchInput(v){
  clearTimeout(_frSearchT);
  const q = (v||'').trim();
  const res = document.getElementById('fradd-res');
  if (q.length < 2) { if (res) res.innerHTML = ''; return; }
  _frSearchT = setTimeout(() => frSearch(q), 380);
}
async function frSearch(q){
  const res = document.getElementById('fradd-res'); if (!res) return;
  res.innerHTML = `<div class="soc-empty" style="padding:12px"><span class="fr-spin" style="display:inline-block;vertical-align:-3px"></span>Suche…</div>`;
  const hits = new Map();
  try { // Code exakt
    if (/^[A-Z2-9]{6}$/.test(q.toUpperCase())) {
      const qc = window.FB.query(window.FB.collection('profiles'), window.FB.where('code','==',q.toUpperCase()), window.FB.limit(1));
      (await window.FB.getDocs(qc)).forEach(d => hits.set(d.id, { uid:d.id, ...d.data() }));
    }
  } catch(_){}
  try { // Name-Präfix
    const qn = window.FB.query(window.FB.collection('profiles'),
      window.FB.where('name','>=',q), window.FB.where('name','<=',q+''), window.FB.limit(8));
    (await window.FB.getDocs(qn)).forEach(d => hits.set(d.id, { uid:d.id, ...d.data() }));
  } catch(_){}
  const list = [...hits.values()].filter(p => p.uid !== _fbUser.uid && !(S.blocked||[]).includes(p.uid));
  if (!list.length) { res.innerHTML = '<div class="soc-empty" style="padding:12px">Niemanden gefunden. Tipp: 6-stelliger Code funktioniert immer.</div>'; return; }
  res.innerHTML = list.map(p => {
    const isFriend = S.friends.includes(p.uid);
    return `<div class="soc-row">
      <div class="fr-ava" style="width:42px;height:42px;font-size:14px">${p.photo?`<img src="${esc(p.photo)}" alt="">`:_socInitials(p.name)}</div>
      <div style="flex:1;min-width:0">
        <div class="soc-name">${esc(p.name||'')}</div>
        <div class="soc-sub">${p.gymName ? esc(p.gymName) : 'Code ' + esc(p.code||'')}</div>
      </div>
      ${isFriend
        ? '<span class="fr-pill">Befreundet</span>'
        : (_frOutgoing.has(p.uid)
          ? `<button class="fr-req-no" style="border:none;border-radius:12px;padding:9px 14px;font-size:13.5px;font-weight:700;font-family:inherit;cursor:pointer" onclick="cancelRequest('${p.uid}',this)">Angefragt</button>`
          : `<button class="fr-req-ok" style="border:none;border-radius:12px;padding:9px 14px;font-size:13.5px;font-weight:700;font-family:inherit;cursor:pointer" onclick="_frSendReqBtn(this,'${p.uid}','${esc(p.name||'')}')">Anfragen</button>`)}
    </div>`;
  }).join('');
}
function _loadQRLib(){
  if (window.QRCode) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}
async function showFrQR(){
  const host = document.getElementById('fr-qr-host'); if (!host) return;
  host.innerHTML = '<div class="soc-empty" style="padding:8px">QR lädt…</div>';
  try { await _loadQRLib(); } catch(_) { host.innerHTML = '<div class="soc-empty" style="padding:8px">QR offline nicht verfügbar</div>'; return; }
  host.innerHTML = '<div id="fr-qr"></div><div class="soc-empty" style="padding:8px 0 0;font-size:12.5px">Mit der iPhone-Kamera scannen — öffnet MyGymTrack mit deinem Code.</div>';
  new QRCode(document.getElementById('fr-qr'), { text: GT_WEB + '/?add=' + _socCode(), width:150, height:150, correctLevel:QRCode.CorrectLevel.M });
}
/* ── Gamification: Level & Punkte ──────────────────────────
   Punkte komplett client-seitig aus vorhandenen Daten (kein Firestore-Feld,
   keine Rules-Änderung). Bewusst clean: numerische Level, keine Spiel-Symbole.
   Zuletzt erreichtes Level in separatem localStorage-Key 'gt_level'
   (nicht in S → umgeht die users-hasOnly-Regel). */
const PTS_PER = { workout:100, streakWk:50, flame:20, flameGiven:10 };
/* Gegebene Flammen (localStorage 'gt_flamesGiven', gleiche Mechanik wie die
   Flame-Bank): jede Flamme an einen fremden Post zählt genau EINMAL Punkte —
   An/Aus-Getoggle farmt nichts, Zähler t bleibt monoton. Animiert zum Reagieren. */
function _flamesGiven(){
  try { const b = JSON.parse(localStorage.getItem('gt_flamesGiven') || '{}'); return { t: b.t || 0, k: b.k || {} }; }
  catch(_){ return { t: 0, k: {} }; }
}
function _flamesGivenAdd(key){
  if (!key) return;
  const b = _flamesGiven();
  if (b.k[key]) return;
  b.k[key] = 1; b.t++;
  try { localStorage.setItem('gt_flamesGiven', JSON.stringify(b)); } catch(_){}
}
function _fmtXP(v){ try { return Math.round(v).toLocaleString(GT_LOCALE); } catch(_) { return String(Math.round(v)); } }
function _xpOf(p){   // Punkte eines fremden Profils (nur öffentlich sichtbare Felder)
  const total = (p && p.stats && p.stats.total) || 0;
  const streak = (p && p.streak) || 0;
  return total*PTS_PER.workout + streak*PTS_PER.streakWk;
}
function _xpSelf(){   // eigene Punkte aus lokalen Daten (auch ohne Statistik-Freigabe)
  const total = (S.sessions || []).length;
  let streak = 0; try { streak = calcStreak().weeks || 0; } catch(_){}
  // Flammen aus der dauerhaften Flame-Bank (monoton wachsend) statt aus dem
  // flüchtigen Post-Cache: Der war nach jedem Post/Reload kurz null → Punkte
  // und Level sprangen sichtbar runter („Level verschwunden / nichts eingezahlt").
  // Außerdem überleben die Punkte so das wöchentliche Post-Löschen.
  let flames = 0; try { flames = _flameBank().t || 0; } catch(_){}
  let given = 0; try { given = _flamesGiven().t || 0; } catch(_){}
  return total*PTS_PER.workout + streak*PTS_PER.streakWk + flames*PTS_PER.flame + given*PTS_PER.flameGiven;
}
/* Punkte-Schwelle für ein Level. Kalibriert auf „Level 100 nach ~3 Jahren, 3× pro Woche":
   3 Workouts/Woche · 156 Wochen ≈ 468 Workouts × 100 Pkt = 46 800 + Streak (~156 Wo × 50
   ≈ 7 800) ≈ 54 600 Pkt. Sanft wachsende Kurve (Potenz 1,5): frühe Level kommen schnell,
   späte deutlich langsamer. _lvlMin(2)=55, (10)≈1 485, (50)≈18 870, (90)≈46 180, (100)≈54 180.
   (Erhaltene Flammen zählen zusätzlich — sehr aktive Community-Nutzer sind entsprechend früher da.) */
const MAX_LEVEL = 100;
const _LVL_K = 55;
function _lvlMin(L){ return L <= 1 ? 0 : Math.round(_LVL_K * Math.pow(L - 1, 1.5)); }
function _levelOf(pts){
  pts = Math.max(0, pts);
  let L = Math.floor(1 + Math.pow(pts / _LVL_K, 2 / 3));
  if (!(L >= 1)) L = 1;
  // Rundungs-Korrektur: exakt gegen die (gerundeten) _lvlMin-Schwellen abgleichen
  while (L < MAX_LEVEL && pts >= _lvlMin(L + 1)) L++;
  while (L > 1 && pts < _lvlMin(L)) L--;
  if (L > MAX_LEVEL) L = MAX_LEVEL;
  const max = L >= MAX_LEVEL;
  const base = _lvlMin(L), next = max ? base : _lvlMin(L + 1);
  const pct = max ? 100 : Math.max(3, Math.min(100, Math.round((pts - base) / (next - base) * 100)));
  return { level:L, pts, base, next, toGo: max ? 0 : (next - pts), pct, max };
}
/* Level-Zahl eines Profils. Rückwärtskompatibel: nimmt Profil ODER Punkte-Zahl. */
function _socLevel(p){
  const pts = (p && typeof p === 'object') ? _xpOf(p) : (+p || 0);
  return _levelOf(pts).level;
}
/* Level-Zeichen neben Namen — als Hantelscheibe mit der Zahl darin
   (js/app-plate.js). Die alte Wort-Pille „LVL 37" gibt es nicht mehr; die
   Scheibe ist auf einen Blick erkennbar und trägt die Stufe in der Farbe. */
function _lvlTagForUid(uid){
  if (uid && uid === _fbUser?.uid) return `<span class="lvl-tag">${_lvlPlate(_levelOf(_xpSelf()).level, 22)}</span>`;
  const p = (_socCache || []).find ? (_socCache || []).find(x => x.uid === uid) : null;
  return p ? `<span class="lvl-tag">${_lvlPlate(_socLevel(p), 22)}</span>` : '';
}
/* Level-Zeichen aus einem Profil-Objekt (für Freunde-/Rang-Listen; self exakt). */
function _lvlPillFor(p){
  const lv = (p && p.uid && p.uid === _fbUser?.uid) ? _levelOf(_xpSelf()).level : _socLevel(p);
  return `<span class="lvl-tag">${_lvlPlate(lv, 22)}</span>`;
}
/* Header-Badge (Startseite, neben der Flamme). */
function _renderLevelBadge(){
  const host = document.getElementById('level-badge-host');
  if (!host) return;
  if (!S.sessions || !S.sessions.length) { host.innerHTML = ''; return; }
  const L = _levelOf(_xpSelf());
  // Tippen öffnet die große Scheibe (openLevelPlate) statt des Info-Blatts —
  // dort stehen dieselben Angaben, nur sichtbar statt in Textzeilen.
  host.innerHTML = `<div class="lvl-badge" id="lvl-badge-el" title="${tr('Level')} ${L.level} · ${_fmtXP(L.pts)} ${tr('Punkte')}" onclick="openLevelPlate()">
    ${_lvlPlate(L.level, 32)}<span class="lvl-badge-pts" id="lvl-badge-pts">${_fmtXP(L.pts)}</span>
  </div>`;
  // Premium-Abzeichen als eigenständiges Element zwischen Level und Streak (nicht mehr in der Level-Pille).
  const ph = document.getElementById('prem-badge-host');
  if (ph) ph.innerHTML = isPremium()
    ? `<span class="prem-tag prem-tag-solo" title="Premium" aria-label="Premium" onclick="openPremHub()">${_premBadgeSVG(17)}</span>`
    : '';
}
/* Eigene Level-Karte (Community-Übersicht). */
function _selfLevelCardHTML(){
  const L = _levelOf(_xpSelf());
  const sub = L.max ? tr('Maximales Level erreicht')
    : (GT_LANG === 'en'
      ? _fmtXP(L.toGo) + ' points → Level ' + (L.level + 1)
      : 'Noch ' + _fmtXP(L.toGo) + ' Punkte → Level ' + (L.level + 1));
  return `<div class="lvl-card" onclick="openLevelPlate()">
    <div class="lvl-card-plate">${_lvlPlate(L.level, 54)}</div>
    <div style="flex:1;min-width:0">
      <div class="lvl-top">
        <span class="lvl-rank">${tr('Level')} ${L.level}</span>
        <span class="lvl-xp">${_fmtXP(L.pts)} ${tr('Punkte')}</span>
      </div>
      <div class="lvl-bar"><div class="lvl-fill" style="width:${L.pct}%"></div></div>
      <div class="lvl-sub">${sub}</div>
    </div>
  </div>`;
}
/* Level-Info-Sheet: aktuelle Stufe + kommende Level + Punkte-Regeln. */
function openLevelInfo(){
  haptic(8);
  const L = _levelOf(_xpSelf());
  const steps = [];
  for (let l = 1; l <= MAX_LEVEL; l++) steps.push(l);
  const ladder = steps.map(l => `
    <div class="lvl-step${l === L.level ? ' on' : ''}">
      <span class="s-name">${tr('Level')} ${l}</span>
      <span class="s-xp">${l === L.level ? tr('Aktuell') + ' · ' : ''}${_fmtXP(_lvlMin(l))} ${tr('Punkte')}</span>
    </div>`).join('');
  const body = document.getElementById('lvlinfo-body');
  if (body) body.innerHTML = `
    <div class="lvl-card" style="margin:0 0 16px">
      <div class="lvl-top"><span class="lvl-rank">${tr('Level')} ${L.level}</span><span class="lvl-xp">${_fmtXP(L.pts)} ${tr('Punkte')}</span></div>
      <div class="lvl-bar"><div class="lvl-fill" style="width:${L.pct}%"></div></div>
      <div class="lvl-sub">${L.max?tr('Maximales Level erreicht'):(GT_LANG==='en'?_fmtXP(L.toGo)+' points → Level '+(L.level+1):'Noch '+_fmtXP(L.toGo)+' Punkte → Level '+(L.level+1))}</div>
    </div>
    <div class="lvl-ladder" style="max-height:46vh;overflow-y:auto;-webkit-overflow-scrolling:touch">${ladder}</div>
    <div class="lvl-xp-rules">${tr('So sammelst du Punkte')}:<br>
      <b>+${PTS_PER.workout}</b> ${tr('pro Training')} · <b>+${PTS_PER.streakWk}</b> ${tr('pro Streak-Woche')} · <b>+${PTS_PER.flame}</b> ${tr('pro erhaltener Flamme')}</div>`;
  openOv('ov-lvlinfo');
  // Ladder zum aktuellen Level scrollen, damit man ab dort bis 100 blättern kann.
  setTimeout(() => { const on = document.querySelector('#lvlinfo-body .lvl-step.on'); if (on) on.scrollIntoView({ block:'center' }); }, 70);
}
function _checkLevelUp(silent){
  const L = _levelOf(_xpSelf()).level;
  let raw = null; try { raw = localStorage.getItem('gt_level'); } catch(_){}
  const prev = (raw == null) ? L : (parseInt(raw,10) || 1);
  try { localStorage.setItem('gt_level', String(L)); } catch(_){}
  if (raw != null && !silent && L > prev) _celebrateLevelUp(L);
}
function _celebrateLevelUp(L){
  try { fireConfetti(90); } catch(_){}
  try { haptic([20,40,20,40,30]); } catch(_){}
  try { showUpdateToast(tr('Level up! Du bist jetzt') + ' ' + tr('Level') + ' ' + L, { autoHide:4200 }); } catch(_){}
}
/* Punkte-Ticker: fliegt beim Training-Ende von unten nach oben ins Header-Badge,
   Vibration + Zahl zählt hoch. */
let _xpGainPending = false;
let _xpAnimBusy = false;   // Ticker läuft → Badge nicht zwischendurch neu rendern
function _countUp(el, from, to, ms){
  if (!el) return;
  const t0 = performance.now();
  (function step(t){ const k = Math.min(1, (t - t0) / ms); const v = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))); el.textContent = _fmtXP(v); if (k < 1) requestAnimationFrame(step); })(t0);
}
/* Punkte-Ticker: zentrale „+100"-Pille poppt auf, Punkte-Partikel strömen ins
   Header-Badge, Vibration, Zahl zählt hoch, danach ggf. Level-Up-Feier. */
function _xpGainOnFinish(){
  _xpAnimBusy = true;
  const gain = PTS_PER.workout;
  // Badge sicherstellen (nach dem 1. Training existiert es evtl. noch nicht) und
  // den Zähler zunächst auf den ALTEN Stand setzen, damit er sichtbar hochklettert.
  _renderLevelBadge();
  const newPts = _xpSelf();
  const startPts = Math.max(0, newPts - gain);
  const pe0 = document.getElementById('lvl-badge-pts'); if (pe0) pe0.textContent = _fmtXP(startPts);
  const badge = document.getElementById('lvl-badge-el');
  const rc = badge ? badge.getBoundingClientRect() : null;
  const tgt = (rc && rc.width) ? { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 } : { x: window.innerWidth - 46, y: 66 };
  const cx = window.innerWidth / 2, cy = window.innerHeight * 0.52;
  // zentrale „+100"-Pille: poppt auf, hält kurz, verblasst (Kontext-Label)
  try {
    const pill = document.createElement('div');
    pill.className = 'xp-pill'; pill.textContent = '+' + gain + ' ' + tr('Punkte');
    pill.style.left = cx + 'px'; pill.style.top = (cy - 78) + 'px';
    document.body.appendChild(pill);
    requestAnimationFrame(() => pill.classList.add('in'));
    setTimeout(() => { pill.style.opacity = '0'; pill.style.transform = 'translate(-50%,-50%) scale(.72) translateY(-16px)'; }, 1500);
    setTimeout(() => { try { pill.remove(); } catch(_){} }, 2050);
  } catch(_){}
  // Punkte einzeln nacheinander „aufkommen", jeder schießt nach oben ins Level-
  // Badge; der Zähler klettert Punkt für Punkt mit.
  const N = 10, gap = 118, hold = 210, fly = 520;
  let landed = 0;
  // Vibrations-Linie: pro Punkt ein Tick in schneller Folge, synchron zum Einfliegen.
  setTimeout(() => { try { _xpHapticLine(gain, N * gap + fly); } catch(_){} }, hold + 120);
  for (let i = 0; i < N; i++) {
    setTimeout(() => {
      const dot = document.createElement('div'); dot.className = 'xp-dot';
      const sx = cx + (Math.random() - 0.5) * 58, sy = cy + (Math.random() - 0.5) * 22;
      dot.style.left = sx + 'px'; dot.style.top = sy + 'px';
      document.body.appendChild(dot);
      // kurz aufkommen, dann nach oben schießen
      setTimeout(() => {
        dot.style.transform = `translate(calc(-50% + ${tgt.x - sx}px), calc(-50% + ${tgt.y - sy}px)) scale(.3)`;
        dot.style.opacity = '0';
      }, hold);
      // Ankunft: Partikel weg, EINE Vibration, Zähler + Badge-Bump
      setTimeout(() => {
        try { dot.remove(); } catch(_){}
        landed++;
        // Haptik läuft als fließende _xpHapticLine (nicht ein Bump pro Dot).
        const shown = (landed >= N) ? newPts : (startPts + Math.round(gain * landed / N));
        const pe = document.getElementById('lvl-badge-pts'); if (pe) pe.textContent = _fmtXP(shown);
        const b = document.getElementById('lvl-badge-el');
        if (b) { b.classList.add('bump'); setTimeout(() => { try { b.classList.remove('bump'); } catch(_){} }, 240); }
        if (landed >= N) { try { _checkLevelUp(); } catch(_){} }
      }, hold + fly);
    }, 260 + i * gap);
  }
  // Sicherheitsnetz: egal was mit den Timern passiert (Hintergrund, gedrosselte
  // Timeouts, entfernte Elemente) — am Ende steht IMMER der echte Punktestand im
  // frisch gerenderten Badge. Das fixt „Level oben verschwunden / Punkte fehlen".
  setTimeout(() => {
    _xpAnimBusy = false;
    try { _renderLevelBadge(); _checkLevelUp(); } catch(_){}
  }, 260 + N * gap + hold + fly + 400);
}
/* ── Freundes-Profil ── */
async function openFrProfile(uid){
  haptic(8);
  const p = (_socCache||[]).find(x => x.uid === uid); if (!p) return;
  const isFriend = (S.friends||[]).includes(uid);
  const t = document.getElementById('frp-title'); if (t) t.textContent = p.name || 'Profil';
  const body = document.getElementById('frp-body'); if (!body) return;
  const live = !!(p.live && p.live.on);
  const st = p.stats || null;
  const wk = getWeekKey();
  const wses = (p.week && p.week.key === wk) ? (p.week.ses||0) : 0;
  const meW = _weekStats().ses;
  const maxV = Math.max(wses, meW, 1);
  const favH = (st && st.favH != null) ? (st.favH + '–' + ((st.favH+2)%24) + ' Uhr') : null;
  const stats = [
    [String(p.streak||0) + ' Wo.', 'Trainings-Streak'],
    [st ? String(st.total) : '–', 'Workouts gesamt'],
    [String(wses) + '×', 'Diese Woche'],
    [st && st.avgDur ? st.avgDur + ' Min.' : '–', 'Ø Trainingsdauer'],
    [favH || '–', 'Häufigste Zeit'],
    [p.lastWk ? _timeAgo(p.lastWk) : '–', 'Letztes Training'],
  ];
  body.innerHTML = `
    <div class="frp-hero">
      <div class="fr-ava-wrap">
        <div class="fr-ava lg">${p.photo?`<img src="${esc(p.photo)}" alt="">`:_socInitials(p.name)}</div>
        <div class="fr-dot${live||_frPresence[uid]?' on':''}" style="width:17px;height:17px"></div>
      </div>
      <div class="ob-h1" style="font-size:22px;margin:12px 0 2px">${esc(p.name||'')}${_founderTag(uid, 18)}${_premTagForUid(uid, 16)}</div>
      ${p.gymName ? `<div class="fr-sub" style="justify-content:center">${esc(p.gymName)}</div>` : ''}
      ${uid === FOUNDER_UID ? `<div class="frp-founder"><span>${tr('Gründer von MyGymTrack')}</span></div>` : ''}
      <div class="frp-level" onclick="event.stopPropagation()">${tr('Level')} ${_socLevel(p)}<span class="frp-xp">${_fmtXP(_xpOf(p))} ${tr('Punkte')}</span></div>
      ${live ? `<div style="margin-top:10px"><span class="fr-live-badge"><span class="fr-live-dot"></span>Trainiert gerade${p.live.gym?' · '+esc(p.live.gym):''}</span></div>` : ''}
    </div>
    <div class="frp-grid">${stats.map(s => `<div class="frp-stat"><div class="frp-stat-v">${s[0]}</div><div class="frp-stat-l">${s[1]}</div></div>`).join('')}</div>
    ${(() => {
      const ab = p.about || {};
      // Monate bevorzugen, Jahre als Rückfalllinie für Profile älterer App-Stände
      const mon = (typeof ab.expMonths === 'number' && isFinite(ab.expMonths))
        ? Math.max(0, Math.min(180, Math.round(ab.expMonths)))
        : (ab.expYears != null ? Math.max(0, Math.min(15, parseInt(ab.expYears) || 0)) * 12 : null);
      const age = (typeof ab.age === 'number' && ab.age >= 10 && ab.age <= 110) ? ab.age : null;
      const has = ab.bio || mon != null || age != null || (ab.strengths || []).length || (ab.favMg || []).length || (ab.favEx || []).length;
      if (!has) return '';
      return `<div class="frp-sec">${tr('Über')} ${esc((p.name || '').split(' ')[0])}</div>
      <div class="frp-about">
        ${ab.bio ? `<div class="frp-bio">${esc(String(ab.bio).slice(0, 140))}</div>` : ''}
        ${age != null ? `<div class="frp-exp-row" style="font-size:12px;font-weight:700;color:var(--text2);margin-top:${ab.bio ? 10 : 0}px"><span>${tr('Alter')}</span><span class="frp-badge">${age} ${tr('Jahre')}</span></div>` : ''}
        ${mon != null ? `<div class="frp-exp-row" style="font-size:12px;font-weight:700;color:var(--text2);margin-top:${(ab.bio || age != null) ? 10 : 0}px"><span>${tr('Trainingserfahrung')}</span><span class="frp-badge">${esc(_pfExpStufe(mon) + ' · ' + _pfExpMonLabel(mon))}</span></div>
        <div class="frp-exp-track"><div class="frp-exp-fill" style="width:${Math.max(6, Math.min(100, Math.round(mon / 180 * 100)))}%"></div></div>` : ''}
        ${(ab.favEx || []).length ? `<div class="frp-sec" style="margin:12px 0 6px">${tr('Lieblingsübungen')}</div><div class="frp-badges">${ab.favEx.slice(0, 3).map(n => `<span class="frp-badge">${esc(String(n).slice(0, 28))}</span>`).join('')}</div>` : ''}
        ${(ab.strengths || []).length ? `<div class="frp-sec" style="margin:12px 0 6px">${tr('Stärken')}</div><div class="frp-badges">${ab.strengths.slice(0, 3).map(s => `<span class="frp-badge">${esc(tr(String(s).slice(0, 24)))}</span>`).join('')}</div>` : ''}
        ${(ab.favMg || []).length ? `<div class="frp-sec" style="margin:12px 0 6px">${tr('Lieblings-Muskelgruppen')}</div><div class="frp-badges">${ab.favMg.slice(0, 3).map(m => `<span class="frp-badge">${esc(muscleLabel(m) || String(m).slice(0, 20))}</span>`).join('')}</div>` : ''}
      </div>`;
    })()}
    ${st && st.topMg && st.topMg.length ? `<div class="frp-sec">Meist trainiert</div>
      <div class="frp-badges">${st.topMg.map(m => `<span class="frp-badge">${esc(m)}</span>`).join('')}</div>` : ''}
    <div class="frp-sec">Diese Woche · Du vs. ${esc((p.name||'').split(' ')[0])}</div>
    <div class="frp-vs">
      <div class="frp-vs-row"><span class="frp-vs-name">Du</span><div class="frp-vs-bar"><div class="frp-vs-fill" style="width:${meW/maxV*100}%"></div></div><span class="frp-vs-v">${meW}</span></div>
      <div class="frp-vs-row"><span class="frp-vs-name">${esc((p.name||'').split(' ')[0])}</span><div class="frp-vs-bar"><div class="frp-vs-fill" style="width:${wses/maxV*100}%;background:#30d158"></div></div><span class="frp-vs-v">${wses}</span></div>
    </div>
    ${st && st.prs && st.prs.length ? `<div class="frp-sec">Persönliche Rekorde</div>
      <div class="frp-vs">${st.prs.map(pr => `<div class="frp-vs-row"><span class="frp-vs-name" style="width:auto;flex:1">${esc(pr.n)}</span><span class="frp-vs-v" style="width:auto">${fmtWeight(pr.w)}</span></div>`).join('')}</div>` : ''}
    <div class="frp-sec">Aktivität</div>
    <div id="frp-feed"><div class="soc-empty" style="padding:10px">Lade…</div></div>
    <div style="display:flex;gap:8px;margin-top:20px">
      ${isFriend
        ? `<button class="btn btn-gray" style="flex:1" onclick="removeFriend('${uid}')">Entfernen</button>`
        : (_frOutgoing.has(uid)
          ? `<button class="btn btn-gray" style="flex:1" onclick="cancelRequest('${uid}',this)">Angefragt</button>`
          : `<button class="btn fr-req-ok" style="flex:1" onclick="_frSendReqBtn(this,'${uid}','${esc(p.name||'')}')">Anfragen</button>`)}
      <button class="btn btn-gray" style="flex:1;color:#ff453a" onclick="blockUser('${uid}')">Blockieren</button>
    </div>`;
  openOv('ov-frprofile');
  _loadFeedFor(uid).then(items => {
    const el = document.getElementById('frp-feed'); if (!el) return;
    el.innerHTML = items.length
      ? items.slice(0,5).map(a => _feedItemHTML(a, true)).join('')
      : '<div class="soc-empty" style="padding:10px">Noch keine Aktivitäten.</div>';
  });
}
/* 1:1-Freunde-Chat wurde auf Wunsch komplett entfernt (2026-07-24) —
   Community bleibt bewusst bei Flammen-Reaktionen ohne Direktnachrichten. */

/* ── Activity-Feed ── */
/* ── 7-Tage-Lebensdauer PRO Post/Aktivität ───────────────────────────────
   Jeder Post hat seinen EIGENEN Timer: er lebt genau 7×24 h ab `ts` und
   verschwindet dann einzeln (rollierendes Fenster). Kein gemeinsamer
   Sonntag-Reset mehr → der Feed ist nie komplett leer.
   Kein Backend (Spark-Plan) → zweigleisig:
   1) ANZEIGE: alle Feed-Loader filtern Einträge älter als 7 Tage raus
      (wirkt sofort, auch für Posts fremder Nutzer, die ihre App nicht öffnen).
   2) LÖSCHEN: jeder Client räumt beim Start seine EIGENEN abgelaufenen Posts/
      Aktivitäten aus Firestore (Rules erlauben delete nur dem Autor). Erhaltene
      Flammen werden VORHER dauerhaft in der Flame-Bank gutgeschrieben — Punkte bleiben. */
const POST_TTL_MS = 7 * 24 * 60 * 60 * 1000;
function _postCutoffTs(){ return Date.now() - POST_TTL_MS; }
/* Flame-Bank: dauerhaft gezählte, erhaltene Flammen (localStorage 'gt_flameBank',
   nicht in S → umgeht die users-hasOnly-Regel). Monoton wachsend: jede Flamme
   (postId:reactorUid) zählt genau einmal — auch nachdem der Post gelöscht wurde.
   Damit schwanken Level/Punkte nicht mehr, wenn der Post-Cache gerade leer ist. */
function _flameBank(){
  try { const b = JSON.parse(localStorage.getItem('gt_flameBank') || '{}'); return { t: b.t || 0, k: b.k || {} }; }
  catch(_){ return { t: 0, k: {} }; }
}
function _flameBankAdd(postId, flames){
  if (!postId || !flames) return;
  const me = _fbUser?.uid;
  const b = _flameBank();
  let changed = false;
  Object.keys(flames).forEach(fuid => {
    if (fuid === me) return;
    const key = postId + ':' + fuid;
    if (!b.k[key]) { b.k[key] = 1; b.t++; changed = true; }
  });
  if (changed) { try { localStorage.setItem('gt_flameBank', JSON.stringify(b)); } catch(_){} }
}
function _flameBankPrunePost(postId){
  // Post ist endgültig gelöscht → Dedupe-Keys dazu freigeben (Zähler t bleibt!)
  try {
    const b = _flameBank();
    let changed = false;
    Object.keys(b.k).forEach(k => { if (k.startsWith(postId + ':')) { delete b.k[k]; changed = true; } });
    if (changed) localStorage.setItem('gt_flameBank', JSON.stringify(b));
  } catch(_){}
}
/* Posts sterben einzeln (jeder 7 Tage nach seinem `ts`) → nicht nur beim Start
   aufräumen: max. 1× pro 3 h, damit lang offene Apps auch abräumen. */
let _ttlPurgeTs = 0;
async function _purgeOldPosts(){
  if (Date.now() - _ttlPurgeTs < 3 * 60 * 60 * 1000 || !_socReady() || !S.socialOn) return;
  _ttlPurgeTs = Date.now();
  const cut = _postCutoffTs();
  try {
    const snap = await window.FB.getDocs(window.FB.query(
      window.FB.collection('profiles/' + _fbUser.uid + '/posts'), window.FB.where('ts','<',cut)));
    const jobs = [];
    snap.forEach(d => {
      _flameBankAdd(d.id, d.data().flames);   // Punkte sichern, BEVOR der Post stirbt
      jobs.push(window.FB.deleteDoc(d.ref).then(() => _flameBankPrunePost(d.id)));
    });
    await Promise.all(jobs);
    if (jobs.length) console.log('[GymTrack] TTL-Aufräumen: ' + jobs.length + ' alte Posts gelöscht');
  } catch(e){ console.warn('[GymTrack] TTL-Aufräumen Posts:', e?.code || e); }
  try {
    const snap = await window.FB.getDocs(window.FB.query(
      window.FB.collection('profiles/' + _fbUser.uid + '/activities'), window.FB.where('ts','<',cut)));
    const jobs = [];
    snap.forEach(d => jobs.push(window.FB.deleteDoc(d.ref)));
    await Promise.all(jobs);
  } catch(e){ console.warn('[GymTrack] TTL-Aufräumen Activities:', e?.code || e); }
}
async function _loadFeedFor(uid){
  try {
    const q = window.FB.query(window.FB.collection('profiles/' + uid + '/activities'),
      window.FB.orderBy('ts','desc'), window.FB.limit(6));
    const snap = await window.FB.getDocs(q);
    const out = [], cut = _postCutoffTs();
    snap.forEach(d => {
      const data = d.data();
      if ((data.ts || 0) < cut) return;   // 7-Tage-TTL: Abgelaufenes ausblenden
      out.push({ id:d.id, uid, ...data });
    });
    return out;
  } catch(_) { return []; }
}
async function _loadFeed(force){
  if (!force && _feedCache && Date.now() - (_feedCache.ts||0) < 60000) return _feedCache.items;
  const ids = [...(S.friends||[])];
  if (_fbUser) ids.unshift(_fbUser.uid);
  const items = [];
  await Promise.all(ids.slice(0,30).map(async uid => {
    (await _loadFeedFor(uid)).forEach(a => items.push(a));
  }));
  items.sort((a,b) => (b.ts||0) - (a.ts||0));
  _feedCache = { ts: Date.now(), items: items.slice(0,30) };
  return _feedCache.items;
}
const _FEED_EMOJIS = ['💪','🔥','👏','❤️'];
function _feedItemHTML(a, compact){
  const me = a.uid === _fbUser?.uid;
  const name = me ? 'Du' : (a.name || 'Athlet');
  const hat = me ? 'hast' : 'hat';
  let txt;
  if (a.type === 'pr') txt = `<b>${esc(name)}</b> ${hat} einen neuen Rekord aufgestellt: <b>${esc(a.prName||'')}</b> ${esc(a.prVal||'')}`;
  else if (a.type === 'streak') txt = `<b>${esc(name)}</b> ${hat} eine <b>${a.streak}-Wochen-Streak</b> erreicht`;
  else {
    txt = `<b>${esc(name)}</b> ${hat} ${a.mg ? 'ein <b>' + esc(a.mg) + '-Training' : 'ein <b>Training'}</b> beendet${a.dur ? ' · ' + a.dur + ' Min.' : ''}`;
    if (a.prs && a.prs.length) txt += `<br>Neue${a.prs.length>1?'':'r'} Rekord${a.prs.length>1?'e':''}: <b>${a.prs.map(esc).join(', ')}</b>`;
    if ((a.week||0) >= 4) txt += `<br>Bereits <b>${a.week}× diese Woche</b> trainiert`;
  }
  const my = a.reactions && a.reactions[_fbUser?.uid];
  const counts = {};
  Object.values(a.reactions||{}).forEach(e => counts[e] = (counts[e]||0) + 1);
  const reacts = compact ? '' : `<div class="feed-reacts">${_FEED_EMOJIS.map(e =>
    `<button class="feed-react${my===e?' on':''}" onclick="event.stopPropagation();toggleReaction('${a.uid}','${a.id}','${e}')">${e}${counts[e]?' '+counts[e]:''}</button>`).join('')}</div>`;
  return `<div class="feed-item">
    <div class="fr-ava" style="width:40px;height:40px;font-size:13px;flex-shrink:0">${_socInitials(a.name)}</div>
    <div style="flex:1;min-width:0">
      <div class="feed-txt">${txt}</div>
      <div class="feed-time">${_timeAgo(a.ts)}</div>
      ${reacts}
    </div>
  </div>`;
}
/* ── CARD-PAGER-FEED: ein Post pro Bildschirm, eigene Swipe-Transition
   (Card schrumpft raus, nächste wächst von hinten nach). Quellen:
   Foto-Posts (profiles/{uid}/posts) + alte Text-Activities als Gradient-Cards. ── */
let _cpgMode = 'friends';        // 'friends' | 'public'
let _cpgItems = [], _cpgIdx = 0, _cpgCache = {};
let _flMyPosts = null, _flMyPostsTs = 0;

/* ── Live-Zähler: wie viele Nutzer trainieren GERADE (profiles.live.on) ──
   Equality-Query auf das Map-Feld (Auto-Index), Cache 60 s, Karteileichen
   (App gekillt, live blieb stehen) über live.start < 4 h gefiltert. */
let _socLiveN = null, _socLiveTs = 0;
async function _socLiveRefresh(){
  const els = document.querySelectorAll('.js-live-count');
  if (!els.length || !(window.FB && window.FB.configured && _fbUser)) return;
  if (Date.now() - _socLiveTs > 60000) {
    try {
      const snap = await window.FB.getDocs(window.FB.query(
        window.FB.collection('profiles'), window.FB.where('live.on', '==', true), window.FB.limit(100)));
      let n = 0;
      const cutoff = Date.now() - 4 * 3600e3;
      snap.forEach(d => { const l = d.data().live; if (l && l.on && (!l.start || l.start > cutoff)) n++; });
      _socLiveN = n; _socLiveTs = Date.now();
    } catch(e) { console.warn('[GymTrack] Live-Zähler:', e?.code || e); return; }
  }
  document.querySelectorAll('.js-live-count').forEach(el => {
    if (_socLiveN > 0) {
      el.classList.add('on');
      el.innerHTML = `· <i></i>${_socLiveN} ${tr('im Training')}`;
    } else el.classList.remove('on');
  });
}
async function _renderFeed(body){
  // Seit dem Umbau vom 07.08.2026 ist der Feed NUR noch in der Community-Zone.
  // Der Freundes-Feed ist damit kein eigener Chip mehr, sondern die zweite
  // Stellung dieses Umschalters — ein Griff statt zwei Ebenen.
  if (_cpgMode !== 'friends') _cpgMode = 'public';
  const isPub = _cpgMode === 'public';
  // Zuletzt geladener Stand (egal wie alt) wird SOFORT gezeigt — dadurch steht der Feed
  // beim Öffnen des Tabs fertig da, statt erst den Lade-Spinner zu zeigen und sich dann
  // sichtbar aufzubauen. Ist er veraltet, läuft die Aktualisierung still im Hintergrund
  // (_cpgRevalidate) und tauscht die Karten nur, wenn sich wirklich etwas geändert hat.
  const cached = _cpgCached();
  body.innerHTML = `
    <div class="cpg-seg">
      <button class="${isPub ? 'on' : ''}" onclick="setCpgMode('public')">${ICO.globe({ s: 15 })}<span>Alle</span></button>
      <button class="${isPub ? '' : 'on'}" onclick="setCpgMode('friends')">${ICO.users({ s: 15 })}<span>Nur Freunde</span></button>
    </div>
    <div class="cpg-zone"><span class="cpg-zone-t"><span class="cpg-live js-live-count"></span></span><span class="cpg-count" id="cpg-count"></span></div>
    <div class="cpg-wrap" id="cpg-wrap">${cached.length ? '' : `
      <div class="cpg-empty"><span class="fr-spin" style="display:inline-block"></span>${tr('Lade Feed…')}</div>`}
    </div>`;
  try { _socLiveRefresh(); } catch(_){}
  try { _purgeOldPosts(); } catch(_){}   // eigene abgelaufene Posts abräumen (3h-Throttle)
  if (cached.length) {
    _cpgItems = cached; _cpgIdx = 0;
    _cpgRenderStack();
    _flamesRefreshBadge();
    if (!_cpgFresh()) _cpgRevalidate();
    return;
  }
  let items = [];
  try { items = await _cpgLoad(); }
  catch(e) {
    console.warn('[GymTrack] Feed-Load:', e?.code || e);
    const w = document.getElementById('cpg-wrap');
    if (w) w.innerHTML = `<div class="cpg-empty"><div style="color:var(--acc)">${ICO.wifiOff({ s: 38 })}</div><b>${tr('Feed konnte nicht geladen werden')}</b><span style="font-size:13px">${tr('Versuch es gleich nochmal.')}</span><button class="btn btn-acc" onclick="_cpgReload()">${tr('Nochmal versuchen')}</button></div>`;
    return;
  }
  _cpgItems = items; _cpgIdx = 0;
  _cpgRenderStack();
  _flamesRefreshBadge();
}
