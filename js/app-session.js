function openSessDetail(sesId) {
  if (!sesId) return;
  _sessDetailId = sesId;
  renderSessDetail();
  openOv('ov-sess-detail');
  haptic && haptic(8);
}

function renderSessDetail() {
  const ses = S.sessions.find(s => s.id === _sessDetailId);
  if (!ses) return;
  const el    = document.getElementById('sess-detail-body');
  const title = document.getElementById('sess-detail-title');
  const d = new Date(ses.date).toLocaleDateString(GT_LOCALE,{weekday:'long',day:'numeric',month:'long'});
  if (title) title.textContent = d;
  if (!el) return;

  el.innerHTML = ses.logs.map((log, li) => {
    const ex     = exById(log.exerciseId);
    const name   = ex ? ex.name : (log._overrideName || log.exerciseId);
    const isTime = ex?.targetType === 'time';
    const unit   = unitLabel();

    const setRows = log.sets.map((s, si) => {
      const wDisp = s.w !== '' && s.w != null ? kgToDisp(s.w) : '';
      const timeCol = isTime
        ? `<span style="font-size:14px;font-weight:600;color:var(--text);min-width:56px;text-align:center">${fmtSec(s.tElapsed||0)}</span>`
        : `<span style="color:var(--text2);font-size:13px">×</span>
           <input type="number" step="1" value="${s.r??''}" placeholder="–"
             style="width:56px;background:var(--inp-bg);border:1.5px solid var(--gl-bdr2);border-radius:10px;padding:8px;font-size:15px;font-weight:600;color:var(--text);font-family:inherit;text-align:center;-webkit-appearance:none;appearance:none"
             oninput="updateSessSet('${ses.id}',${li},${si},'r',this.value)">
           <span style="color:var(--text2);font-size:12px">Wdh</span>`;
      return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid var(--sep)">
        <span style="width:20px;text-align:center;font-size:13px;color:var(--text2);font-weight:600;flex-shrink:0">${si+1}</span>
        <input type="number" step="0.5" value="${wDisp}" placeholder="–"
          style="width:64px;background:var(--inp-bg);border:1.5px solid var(--gl-bdr2);border-radius:10px;padding:8px;font-size:15px;font-weight:600;color:var(--text);font-family:inherit;text-align:center;-webkit-appearance:none;appearance:none"
          oninput="updateSessSet('${ses.id}',${li},${si},'w',this.value)">
        <span style="color:var(--text2);font-size:12px">${unit}</span>
        ${timeCol}
      </div>`;
    }).join('');

    return `<div style="background:var(--gl-bg);border:1px solid var(--gl-bdr);border-radius:16px;padding:12px 14px;box-shadow:var(--gl-shad)">
      <div style="font-size:14px;font-weight:700;margin-bottom:6px">${esc(name)}</div>
      <div style="display:flex;align-items:center;gap:8px;padding-bottom:4px">
        <span style="width:20px;flex-shrink:0"></span>
        <span style="width:64px;text-align:center;font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase">${unit.toUpperCase()}</span>
        <span style="font-size:11px;color:transparent;font-size:12px">×</span>
        ${!isTime ? `<span style="width:56px;text-align:center;font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase">WDH</span>` : ''}
      </div>
      ${setRows}
    </div>`;
  }).join('');
}

function updateSessSet(sesId, li, si, field, val) {
  const ses = S.sessions.find(s => s.id === sesId);
  if (!ses?.logs[li]?.sets[si]) return;
  const num = parseFloat(val);
  if (field === 'w') {
    ses.logs[li].sets[si].w = isNaN(num) ? '' : dispToKg(num);
  } else {
    ses.logs[li].sets[si].r = isNaN(num) ? '' : String(Math.round(num));
  }
  persist();
}

// ── CHART HELPERS ─────────────────────────────────────
// Liefert lesbare X-Achsen-Ticks: keine Rotation, Auto-Skip, dynamisches Limit
function _cXT(n) {
  return {
    font: { size: 10 }, color: '#8e8e93',
    maxRotation: 0, minRotation: 0,
    autoSkip: true,
    maxTicksLimit: n <= 4 ? n : n <= 8 ? 4 : n <= 20 ? 4 : n <= 50 ? 3 : 3
  };
}
// Punkt-Radius: bei vielen Punkten kleiner, über 40 unsichtbar
function _cPR(n) {
  // Glass 2.0: ab ~12 Punkten reine Linie — ruhiger, Tooltip-Hit-Radius bleibt
  return n <= 8 ? 4 : n <= 12 ? 3 : 0;
}
// Standard Y-Achse
function _cYT(cb) {
  return { grid: { color: 'rgba(120,120,128,.08)' }, border: { display: false },
           ticks: { font: { size: 10 }, color: 'rgba(140,140,150,.85)', callback: cb, maxTicksLimit: 5 } };
}

// ── KÖRPERGEWICHT ──────────────────────────────────────
let _weightMiniChart = null;
let _weightFullChart = null;

function _buildGoalHtml(start, goal, cur, unit) {
  if (start == null || goal == null || cur == null) {
    return `<button class="weight-set-goal-btn" onclick="openWeightGoal()">Ziel setzen →</button>`;
  }
  const totalDiff = start - goal;
  const isLoss    = totalDiff > 0;
  const isDone    = isLoss ? cur <= goal : cur >= goal;
  const done      = isLoss ? +(start - cur).toFixed(1) : +(cur - start).toFixed(1);
  const remaining = isLoss ? +(cur - goal).toFixed(1)  : +(goal - cur).toFixed(1);
  const pct       = Math.max(0, Math.min(100, Math.round((done / Math.abs(totalDiff)) * 100)));
  const gainCls   = isLoss ? '' : ' gain';
  const arrow     = isLoss ? '↓' : '↑';
  if (isDone) {
    return `<div class="weight-goal-section">
      <div class="wgt-goal-done">
        <div class="wgt-goal-done-title">Ziel erreicht!</div>
        <div class="wgt-goal-done-sub">${_wFmt(done)} ${unit} ${isLoss?'abgenommen':'zugenommen'} · Ziel: ${_wFmt(goal)} ${unit}</div>
      </div>
      <span class="wgt-edit-link" onclick="openWeightGoal()">✎ Ziel anpassen</span>
    </div>`;
  }
  return `<div class="weight-goal-section">
    <div class="wgt-track-wrap">
      <div class="wgt-track-fill${gainCls}" style="width:${pct}%"></div>
      <div class="wgt-track-dot${gainCls}" style="left:${pct}%"></div>
    </div>
    <div class="wgt-track-labels">
      <div class="wgt-track-lbl"><span class="wgt-track-lbl-val">${_wFmt(start)} ${unit}</span><span class="wgt-track-lbl-sub">Start</span></div>
      <div class="wgt-track-lbl right"><span class="wgt-track-lbl-val">${_wFmt(goal)} ${unit}</span><span class="wgt-track-lbl-sub">Ziel</span></div>
    </div>
    <div class="wgt-stats-row">
      <div class="wgt-stat"><div class="wgt-stat-val">${arrow} ${_wFmt(done)} ${unit}</div><div class="wgt-stat-lbl">${isLoss?'abgenommen':'zugenommen'}</div></div>
      <div class="wgt-pct-badge${gainCls}">${pct} %</div>
      <div class="wgt-stat right"><div class="wgt-stat-val">${_wFmt(remaining)} ${unit}</div><div class="wgt-stat-lbl">noch bis Ziel</div></div>
    </div>
    <span class="wgt-edit-link" onclick="openWeightGoal()">✎ Ziel anpassen</span>
  </div>`;
}

function _buildMiniChart(log, goal, acc) {
  if (_weightMiniChart) { _weightMiniChart.destroy(); _weightMiniChart = null; }
  const canvas = document.getElementById('weight-mini-canvas');
  if (!canvas || log.length < 2) return;
  const pts  = log.slice(-30);
  const data = pts.map(p => p.weight);
  const goalDs = goal != null ? [{
    data: pts.map(() => goal),
    borderColor: 'rgba(52,199,89,.5)', borderDash: [3,3],
    borderWidth: 1.2, pointRadius: 0, fill: false, tension: 0
  }] : [];
  _weightMiniChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels: pts.map(() => ''), datasets: [Object.assign({ data },
      _glowDs(canvas, acc, data.length, false),
      // Die Mini-Kurve ist ein Vorschaubild: kein Punkt, duennere Fuellung.
      { pointRadius: 0, pointHoverRadius: 0, backgroundColor: _accFill(canvas, acc, '30') }
    ), ...goalDs]},
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { display: false },
        y: { display: false }
      }
    }
  });
}

/* ── GEWICHTS-DIAL ────────────────────────────────────────────────────────
   Zahlenrad zum Eintragen des Koerpergewichts direkt auf der Startseite
   (Widget 'weight' in Groesse lg). Portierung eines React/motion-Widgets.

   Abweichung zur Vorlage: dort zieht ein Wisch genau EINE Einheit weiter
   (Flick-Picker). Bei der hier gewaehlten Rastung von 0,1 waeren das zehn
   Wischer pro Kilo — der Streifen folgt deshalb 1:1 dem Finger und rastet
   beim Loslassen ein. Optik (Bogen, Rotation, Ausblenden) bleibt gleich.

   Spec: docs/superpowers/specs/2026-08-07-gewichts-dial-design.md */
const WD_STEP      = 0.1;  // Rastung
const WD_PPU       = 80;   // Pixel pro Einheit → 8 px pro Rastpunkt
const WD_BUF       = 3;    // aufgebautes Fenster: ± 3 Einheiten um den Ursprung
const WD_COMMIT_MS = 600;  // Ruhezeit nach dem Einrasten, bevor geschrieben wird
/* Stuetzstellen des Bogens (Abstand zur Mitte in Einheiten → y-Versatz in px),
   uebernommen aus der useTransform-Kette der Vorlage. */
const WD_Y_D = [0, .5, 1, 1.5, 2, 2.5, 3];
const WD_Y_V = [0,  2, 7,  17, 32,  54, 88];

let _wd = null;  // Zustand des aktiven Dials (es gibt immer hoechstens eines)

function _wdLerp(d, stops, vals) {
  if (d <= stops[0]) return vals[0];
  for (let i = 1; i < stops.length; i++) {
    if (d <= stops[i]) {
      const t = (d - stops[i-1]) / (stops[i] - stops[i-1]);
      return vals[i-1] + (vals[i] - vals[i-1]) * t;
    }
  }
  return vals[vals.length - 1];
}

function _wdSnap(v)  { return Math.round(v / WD_STEP) * WD_STEP; }
function _wdClamp(v) { return _wd ? Math.max(_wd.min, Math.min(_wd.max, v)) : v; }
/* Ablesewert des Dials: immer mit Zehntel, damit die Zahl beim Drehen nicht
   in der Breite springt. */
function _wdFmt(v)   { return v.toFixed(1).replace('.', GT_DEC); }
/* Alle uebrigen Gewichtsangaben: Zehntel nur, wenn vorhanden. Wichtig ist der
   Trenner — ohne ihn stuende „3.3 kg" direkt unter „80,7 kg". */
function _wFmt(v)    { return String(v).replace('.', GT_DEC); }

/* Sinnvoller Bereich je Einheit. Der Log speichert den Wert so, wie er
   angezeigt wird (bestehendes Verhalten), deshalb haengt die Skala an
   S.unitMode und nicht an einer internen kg-Groesse. */
function _wdRange() {
  return S.unitMode === 'lbs' ? { min: 66, max: 550 } : { min: 30, max: 250 };
}

/* Startwert: letzter Eintrag → Startgewicht → neutraler Vorgabewert.
   Dieser Wert wird NIE geschrieben (s. _wdCommit / w.touched) — sonst legte
   jeder App-Start bei Nutzern ohne Gewichts-Tracking einen Eintrag an. */
function _wdStartValue() {
  const log = (S.weightLog || []).slice().sort((a,b) => a.date.localeCompare(b.date));
  if (log.length) return +log[log.length - 1].weight;
  if (S.weightStart != null) return +S.weightStart;
  return S.unitMode === 'lbs' ? 165 : 75;
}

/* Knoten fuer das Fenster um w.origin aufbauen. Jeder Rastpunkt bekommt einen
   Strich, nur ganze Einheiten zusaetzlich eine Zahl — die leere Zahlen-Zeile
   der Zwischenschritte haelt alle Striche auf gleicher Hoehe. */
function _wdBuild() {
  const w = _wd; if (!w) return;
  const n = Math.round(WD_BUF / WD_STEP);
  let html = '';
  for (let i = -n; i <= n; i++) {
    const v = +(w.origin + i * WD_STEP).toFixed(1);
    if (v < w.min - 1e-6 || v > w.max + 1e-6) continue;
    const whole = Math.abs(v - Math.round(v)) < 1e-6;
    html += `<div class="wdial-t${whole ? ' is-num' : ''}" style="left:${(i * WD_STEP * WD_PPU).toFixed(1)}px">`
          + `<span class="wdial-n">${whole ? Math.round(v) : ''}</span><i></i></div>`;
  }
  w.track.innerHTML = html;
  w.nodes = Array.from(w.track.children);
  w.nodes.forEach(node => { node._left = parseFloat(node.style.left); });
}

/* Neu aufbauen, sobald der Wert mehr als eine Einheit vom Ursprung weg ist.
   Ein Fenster von ± 3 Einheiten reicht dann immer bis ueber den Rand hinaus. */
function _wdReframe() {
  const w = _wd; if (!w) return;
  if (Math.abs(w.val - w.origin) <= 1) return;
  w.origin = Math.round(w.val);
  _wdBuild();
}

function _wdPaint() {
  const w = _wd; if (!w) return;
  w.x = -(w.val - w.origin) * WD_PPU;
  for (const node of w.nodes) {
    const dSig = (w.x + node._left) / WD_PPU;   // Abstand zur Mitte in Einheiten
    const d    = Math.abs(dSig);
    if (d > 3) { if (node.style.opacity !== '0') node.style.opacity = '0'; continue; }
    node.style.opacity   = _wdLerp(d, [0, 2, 3], [1, .4, 0]).toFixed(3);
    node.style.transform = `translateX(-50%) translateY(${_wdLerp(d, WD_Y_D, WD_Y_V).toFixed(1)}px)`
                         + ` rotate(${(dSig * 12).toFixed(2)}deg)`
                         + ` scale(${_wdLerp(d, [0, 2], [1, .85]).toFixed(3)})`;
  }
  w.track.style.transform = `translateX(${w.x.toFixed(1)}px)`;
}

/* Anzeige des exakten Werts. Der Haptik-Tick haengt an w.touched, damit das
   Aufbauen der Karte nicht klackt. */
function _wdReadout() {
  const w = _wd; if (!w) return;
  const snapped = +_wdSnap(w.val).toFixed(1);
  if (w.shown === snapped) return;
  w.shown = snapped;
  if (w.valEl) w.valEl.textContent = _wdFmt(snapped);
  if (!w.touched) return;
  const now = Date.now();
  if (now - w.lastTick > 45) { w.lastTick = now; try { hapticTick(); } catch(e) {} }
}

/* Feder statt CSS-Transition: die Bogen-Berechnung braucht den Zwischenwert
   jedes Frames, den eine Transition nicht herausgibt. */
function _wdSpring() {
  const w = _wd; if (!w) return;
  const K = 260, C = 26;
  let last = performance.now();
  const step = t => {
    if (_wd !== w) return;
    const dt = Math.min((t - last) / 1000, .033); last = t;
    const tx = -(w.target - w.origin) * WD_PPU;
    w.velPx += (K * (tx - w.x) - C * w.velPx) * dt;
    w.x     += w.velPx * dt;
    w.val    = w.origin - w.x / WD_PPU;
    if (Math.abs(tx - w.x) < .3 && Math.abs(w.velPx) < 8) {
      w.val = w.target; w.velPx = 0; w.raf = 0;
      _wdReframe(); _wdPaint(); _wdReadout();
      return;
    }
    _wdReframe(); _wdPaint(); _wdReadout();
    w.raf = requestAnimationFrame(step);
  };
  cancelAnimationFrame(w.raf);
  w.raf = requestAnimationFrame(step);
}

function _wdDown(e) {
  const w = _wd; if (!w) return;
  w.dragging = true; w.touched = true;
  w.startX   = e.clientX; w.startVal = w.val;
  w.velPx    = 0; w.samples = [];
  cancelAnimationFrame(w.raf); w.raf = 0;
  clearTimeout(w.commitT); w.commitT = 0;
  try { w.wheel.setPointerCapture(e.pointerId); } catch(err) {}
  try { hapticSelStart(); } catch(err) {}
}

function _wdMove(e) {
  const w = _wd; if (!w || !w.dragging) return;
  w.val = _wdClamp(w.startVal - (e.clientX - w.startX) / WD_PPU);
  w.samples.push({ t: Date.now(), x: e.clientX });
  if (w.samples.length > 5) w.samples.shift();
  _wdReframe(); _wdPaint(); _wdReadout();
}

function _wdUp() {
  const w = _wd; if (!w || !w.dragging) return;
  w.dragging = false;
  try { hapticSelEnd(); } catch(err) {}
  /* Schwung aus den letzten Punkten. Der Deckel ist bewusst klein: bei einer
     Rastung von 0,1 ist ein Nachlauf von mehr als einer halben Einheit kein
     Schwung mehr, sondern ein Sprung an eine Stelle, die niemand gewaehlt hat. */
  let vpx = 0;
  const s = w.samples;
  if (s.length > 1) {
    const dt = (s[s.length-1].t - s[0].t) / 1000;
    if (dt > 0) vpx = -(s[s.length-1].x - s[0].x) / dt;
  }
  const glide = Math.max(-.5, Math.min(.5, vpx / WD_PPU * .05));
  w.target = +_wdClamp(_wdSnap(w.val + glide)).toFixed(1);
  _wdSpring();
  clearTimeout(w.commitT);
  w.commitT = setTimeout(_wdCommit, WD_COMMIT_MS);
}

/* Schreibt den eingestellten Wert auf den heutigen Tag. Laeuft NUR nach einer
   echten Geste (w.touched) — der blosse Anfangswert darf nie in den Log. */
function _wdCommit() {
  const w = _wd; if (!w) return;
  w.commitT = 0;
  if (!w.touched) return;
  const today = new Date().toISOString().slice(0, 10);
  if (!upsertWeightEntry(today, _wdClamp(_wdSnap(w.val)))) return;
  _wdRefreshRest();
}

function _wdInit() {
  const wheel = document.getElementById('wdial-wheel');
  const track = document.getElementById('wdial-track');
  if (!wheel || !track) return;
  const r = _wdRange();
  _wd = {
    wheel, track, valEl: document.getElementById('wdial-val'),
    nodes: [], min: r.min, max: r.max,
    val: 0, x: 0, origin: 0, velPx: 0, target: 0,
    raf: 0, commitT: 0, dragging: false, touched: false,
    samples: [], shown: null, lastTick: 0
  };
  _wd.val    = _wdClamp(+_wdSnap(_wdStartValue()).toFixed(1));
  _wd.origin = Math.round(_wd.val);
  _wdBuild(); _wdPaint(); _wdReadout();
  wheel.addEventListener('pointerdown',   _wdDown);
  wheel.addEventListener('pointermove',   _wdMove);
  wheel.addEventListener('pointerup',     _wdUp);
  wheel.addEventListener('pointercancel', _wdUp);
}

/* Abbau vor jedem Neuaufbau der Karte. Eine noch offene Schreibsperre wird
   dabei sofort eingeloest — sonst ginge ein gerade eingestellter Wert
   verloren, wenn das Raster innerhalb der 600 ms neu zeichnet. */
function _wdDestroy() {
  const w = _wd; if (!w) return;
  cancelAnimationFrame(w.raf);
  if (w.commitT) { clearTimeout(w.commitT); _wdCommit(); }
  _wd = null;
}

/* Alles unterhalb des Dials: Verlaufs-Delta, Mini-Diagramm, Ziel-Balken.
   Bewusst getrennt vom Dial, damit nach dem Schreiben nur dieser Teil neu
   gezeichnet wird — ein voller renderWeightCard() risse den Streifen unter
   dem Finger weg. */
function _weightRestHtml(log, unit, start, goal, cur) {
  const last = log.length ? log[log.length - 1] : null;
  const prev = log.length > 1 ? log[log.length - 2] : null;
  let deltaHtml = '';
  if (last && prev) {
    const diff = +(last.weight - prev.weight).toFixed(1);
    const cls  = diff > 0 ? 'pos' : diff < 0 ? 'neg' : 'neu';
    deltaHtml  = `<span class="weight-delta ${cls}">${diff > 0 ? '+' : ''}${_wFmt(diff)} ${unit}</span>`;
  }
  const miniContent = log.length >= 2
    ? `<canvas id="weight-mini-canvas"></canvas><div class="weight-mini-tap-hint">▶ Details</div>`
    : `<div class="weight-mini-empty">${log.length === 1 ? '1 Eintrag' : 'Noch kein Verlauf'}</div>`;
  return `<div class="weight-rest-row">
      <div class="weight-mini-wrap" onclick="openWeightChartFull()" aria-label="Vollbild-Diagramm">${miniContent}</div>
      <div class="weight-rest-side">
        ${deltaHtml || '<span class="weight-rest-hint">Ziehen zum Einstellen</span>'}
        <button class="weight-add-btn" onclick="openWeightEntry()" aria-label="Gewicht eintragen">+</button>
      </div>
    </div>
    ${_buildGoalHtml(start, goal, cur, unit)}`;
}

function _wdRefreshRest() {
  const rest = document.getElementById('weight-rest');
  if (!rest) return;
  const log   = (S.weightLog || []).slice().sort((a,b) => a.date.localeCompare(b.date));
  const unit  = S.unitMode === 'lbs' ? 'lbs' : 'kg';
  const start = S.weightStart != null ? +S.weightStart : null;
  const goal  = S.weightGoal  != null ? +S.weightGoal  : null;
  const cur   = log.length ? log[log.length - 1].weight : start;
  const acc   = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#007AFF';
  rest.innerHTML = _weightRestHtml(log, unit, start, goal, cur);
  requestAnimationFrame(() => _buildMiniChart(log, goal, acc));
}

function renderWeightCard(el) {
  el = el || document.getElementById('weight-card');
  if (!el) return;
  /* Muss vor dem Lesen des Logs stehen: ein offener Schreibauftrag des Dials
     wird hier eingeloest und veraendert S.weightLog. */
  _wdDestroy();

  const log   = (S.weightLog || []).slice().sort((a,b) => a.date.localeCompare(b.date));
  const unit  = S.unitMode === 'lbs' ? 'lbs' : 'kg';
  const last  = log.length ? log[log.length - 1] : null;
  const prev  = log.length > 1 ? log[log.length - 2] : null;
  const start = S.weightStart != null ? +S.weightStart : null;
  const goal  = S.weightGoal  != null ? +S.weightGoal  : null;
  const cur   = last ? last.weight : start;
  const acc   = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#007AFF';

  let deltaHtml = '';
  if (last && prev) {
    const diff = +(last.weight - prev.weight).toFixed(1);
    const sign = diff > 0 ? '+' : '';
    const cls  = diff > 0 ? 'pos' : diff < 0 ? 'neg' : 'neu';
    deltaHtml  = `<span class="weight-delta ${cls}">${sign}${diff} ${unit}</span>`;
  }

  // Widget-Größe aus dem Wrapper lesen — bei „sm" (verkleinert) wird das
  // schmale Diagramm komplett weggelassen, damit die Karte sauber aussieht.
  const size = el.closest('.hw')?.dataset.size || 'lg';
  const isSm = size === 'sm';
  const isMd = size === 'md';
  const compact = isSm || isMd; // sm & md: ohne Diagramm & Ziel-Block

  /* lg: Zahlenrad als Eingabe, darunter Delta, Mini-Diagramm und Ziel-Balken.
     Auf einer md-Kachel (eine Rastereinheit hoch) waere ein Dial nicht
     bedienbar — dort bleibt die bisherige Kompaktkarte. */
  if (!compact) {
    el.innerHTML = `<div class="weight-card-inner weight-card-dial">
      <div class="wdial-read"><span class="wdial-val" id="wdial-val">–</span><span class="wdial-unit">${unit}</span></div>
      <div class="wdial-wheel" id="wdial-wheel">
        <div class="wdial-track" id="wdial-track"></div>
        <div class="wdial-needle"><i></i><svg viewBox="0 0 10 36" fill="none" preserveAspectRatio="none"><path d="M 5 2 L 9 36 L 1 36 Z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></div>
      </div>
      <div id="weight-rest">${_weightRestHtml(log, unit, start, goal, cur)}</div>
    </div>`;
    _wdInit();
    requestAnimationFrame(() => _buildMiniChart(log, goal, acc));
    return;
  }

  // sm/md haben kein eingebettetes Diagramm — dort öffnet ein Tipp auf die ganze
  // Karte das Vollbild-Diagramm (gleiche Funktion wie das Mini-Chart in lg).
  el.innerHTML = `<div class="weight-card-inner${isSm ? ' weight-card-sm' : ' weight-card-md'}" onclick="openWeightChartFull()" style="cursor:pointer" aria-label="Gewichtsverlauf">
    <div class="weight-top-row">
      <div class="weight-left">
        ${last
          ? `<div class="weight-current-val">${last.weight}</div>
             <div class="weight-current-unit">${unit}</div>
             ${deltaHtml}`
          : `<div class="weight-current-val" style="font-size:22px;color:var(--text2)">—</div>
             <div class="weight-current-unit">${unit}</div>`
        }
      </div>
      <button class="weight-add-btn" onclick="event.stopPropagation();openWeightEntry()" aria-label="Gewicht eintragen">+</button>
    </div>
  </div>`;
}

function openWeightChartFull() {
  if ((S.weightLog || []).length < 2) { openWeightEntry(); return; }
  openOv('ov-weight-chart-full');
  haptic && haptic(8);
  setTimeout(() => {
    if (_weightFullChart) { _weightFullChart.destroy(); _weightFullChart = null; }
    const canvas = document.getElementById('weight-chart-full');
    if (!canvas) return;
    const log  = (S.weightLog || []).slice().sort((a,b) => a.date.localeCompare(b.date));
    const unit = S.unitMode === 'lbs' ? 'lbs' : 'kg';
    const goal = S.weightGoal != null ? +S.weightGoal : null;
    const pts  = log.slice(-40);
    const data = pts.map(p => p.weight);
    const acc  = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#007AFF';
    const goalDs = goal != null ? [{
      data: pts.map(() => goal),
      borderColor: 'rgba(52,199,89,.6)', borderDash: [5,4],
      borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0
    }] : [];
    // Footer: Zeitraum
    const foot = document.getElementById('weight-chart-full-foot');
    if (foot && pts.length) {
      const fmt = d => new Date(d).toLocaleDateString(GT_LOCALE,{day:'numeric',month:'short',year:'numeric'});
      foot.innerHTML = `<span>${fmt(pts[0].date)}</span><span>${fmt(pts[pts.length-1].date)}</span>`;
    }
    _weightFullChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: pts.map(p => new Date(p.date).toLocaleDateString(GT_LOCALE,{day:'numeric',month:'short'})),
        datasets: [Object.assign({ data }, _glowDs(canvas, acc, data.length, true)), ...goalDs]},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: {
          label: ctx => ctx.datasetIndex===0 ? ` ${ctx.parsed.y} ${unit}` : ` Ziel: ${goal} ${unit}`
        }}},
        scales: {
          x: { grid: { display: false }, ticks: _cXT(data.length) },
          y: _cYT(v => v + ' ' + unit)
        }
      }
    });
  }, 80);
}

function openWeightEntry() {
  const today = new Date().toISOString().slice(0, 10);
  const dInp = document.getElementById('weight-date-input');
  if (dInp) dInp.value = today;
  const ul = document.getElementById('weight-unit-label');
  if (ul) ul.textContent = S.unitMode === 'lbs' ? 'lbs' : 'kg';
  const log  = (S.weightLog || []).slice().sort((a,b) => a.date.localeCompare(b.date));
  const wInp = document.getElementById('weight-input');
  if (wInp) wInp.value = log.length ? log[log.length-1].weight : '';
  openOv('ov-weight-entry');
  haptic && haptic(8);
  setTimeout(() => wInp && wInp.focus(), 300);
}

/* Einzige Schreibstelle fuer den Gewichts-Log — benutzt vom Eingabe-Sheet UND
   vom Dial. Ein vorhandener Eintrag desselben Tages wird ueberschrieben, es
   kommt kein zweiter dazu. Liefert false, wenn der Wert unplausibel ist. */
function upsertWeightEntry(date, weight) {
  const w = Math.round(weight * 10) / 10;
  if (!w || w < 20 || w > 500) return false;
  S.weightLog = S.weightLog || [];
  const idx = S.weightLog.findIndex(e => e.date === date);
  if (idx >= 0) S.weightLog[idx].weight = w;
  else S.weightLog.push({ date, weight: w });
  persist();
  // Gewicht auch in Apple Health speichern
  if (S.healthKitEnabled) {
    const HK = _cap('HealthKitPlugin');
    if (HK) HK.saveWeight({ weightKg: w }).catch(() => {});
  }
  return true;
}

function saveWeightEntry() {
  const wInp = document.getElementById('weight-input');
  const dInp = document.getElementById('weight-date-input');
  const w = parseFloat((wInp?.value || '').replace(',', '.'));
  const d = dInp?.value || new Date().toISOString().slice(0, 10);
  if (!upsertWeightEntry(d, w)) {
    wInp?.classList.add('shake');
    setTimeout(() => wInp?.classList.remove('shake'), 400);
    return;
  }
  closeOv('ov-weight-entry');
  renderWeightCard();
  haptic && haptic(20);
}

function openWeightGoal() {
  const unit = S.unitMode === 'lbs' ? 'lbs' : 'kg';
  ['weight-goal-unit-1','weight-goal-unit-2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = unit;
  });
  const sInp = document.getElementById('weight-start-input');
  const gInp = document.getElementById('weight-goal-input');
  if (sInp) sInp.value = S.weightStart ?? '';
  if (gInp) gInp.value = S.weightGoal  ?? '';
  const resetBtn = document.getElementById('weight-goal-reset-btn');
  if (resetBtn) resetBtn.style.display = (S.weightStart != null || S.weightGoal != null) ? '' : 'none';
  openOv('ov-weight-goal');
  haptic && haptic(8);
  setTimeout(() => sInp && sInp.focus(), 300);
}

function saveWeightGoal() {
  const sInp = document.getElementById('weight-start-input');
  const gInp = document.getElementById('weight-goal-input');
  const sv = parseFloat((sInp?.value || '').replace(',', '.'));
  const gv = parseFloat((gInp?.value || '').replace(',', '.'));
  let valid = true;
  if (sInp && (!sv || sv < 20 || sv > 500)) {
    sInp.classList.add('shake'); setTimeout(() => sInp.classList.remove('shake'), 400); valid = false;
  }
  if (gInp && (!gv || gv < 20 || gv > 500)) {
    gInp.classList.add('shake'); setTimeout(() => gInp.classList.remove('shake'), 400); valid = false;
  }
  if (!valid) return;
  S.weightStart = sv;
  S.weightGoal  = gv;
  persist();
  closeOv('ov-weight-goal');
  renderWeightCard();
  haptic && haptic(20);
}

function resetWeightGoal() {
  if (!confirm('Start- und Zielgewicht wirklich zurücksetzen?')) return;
  S.weightStart = null;
  S.weightGoal  = null;
  persist();
  closeOv('ov-weight-goal');
  renderWeightCard();
  haptic && haptic(20);
}

function openWeightHistory() {
  renderWeightHistoryList();
  openOv('ov-weight-history');
  haptic && haptic(8);
}

function renderWeightHistoryList() {
  const wrap = document.getElementById('wh-list-wrap');
  if (!wrap) return;
  const log  = (S.weightLog || []).slice().sort((a,b) => b.date.localeCompare(a.date));
  const unit = S.unitMode === 'lbs' ? 'lbs' : 'kg';
  if (!log.length) {
    wrap.innerHTML = '<div style="text-align:center;padding:40px 0;color:var(--text2);font-size:15px">Noch keine Einträge</div>';
    return;
  }
  wrap.innerHTML = log.map(entry => {
    const d = new Date(entry.date + 'T00:00:00');
    const dateStr = d.toLocaleDateString(GT_LOCALE, {weekday:'short', day:'numeric', month:'short', year:'numeric'});
    return `<div class="wh-item" data-date="${entry.date}">
      <div class="wh-item-track">
        <div class="wh-item-row" onclick="editWeightEntry('${entry.date}')">
          <div class="wh-item-date">${dateStr}</div>
          <div class="wh-item-val">${entry.weight} <span class="wh-item-unit">${unit}</span></div>
          <div class="wh-item-chevron">›</div>
        </div>
        <div class="wh-del-btn" onclick="deleteWeightEntry('${entry.date}')">Löschen</div>
      </div>
    </div>`;
  }).join('');
  wrap.querySelectorAll('.wh-item').forEach(_initWhSwipe);
}

function _initWhSwipe(item) {
  const track = item.querySelector('.wh-item-track');
  const DEL_W = 80;
  let startX = 0, curX = 0, dragging = false, opened = false;

  track.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    dragging = true;
    track.style.transition = 'none';
  }, {passive: true});

  track.addEventListener('touchmove', e => {
    if (!dragging) return;
    let dx = e.touches[0].clientX - startX;
    if (opened) dx -= DEL_W;
    dx = Math.min(0, Math.max(dx, -DEL_W * 1.3));
    curX = dx;
    track.style.transform = `translateX(${dx}px)`;
  }, {passive: true});

  track.addEventListener('touchend', () => {
    dragging = false;
    track.style.transition = 'transform .25s cubic-bezier(.25,.46,.45,.94)';
    const threshold = opened ? -DEL_W * 0.3 : -DEL_W * 0.45;
    if (curX < threshold) {
      track.style.transform = `translateX(-${DEL_W}px)`;
      opened = true;
    } else {
      track.style.transform = 'translateX(0)';
      opened = false;
    }
  });
}

function deleteWeightEntry(date) {
  S.weightLog = (S.weightLog || []).filter(e => e.date !== date);
  persist();
  renderWeightCard();
  renderWeightHistoryList();
  haptic && haptic(10);
}

function editWeightEntry(date) {
  const entry = (S.weightLog || []).find(e => e.date === date);
  if (!entry) return;
  closeOv('ov-weight-history');
  setTimeout(() => {
    const dInp = document.getElementById('weight-date-input');
    const wInp = document.getElementById('weight-input');
    const ul   = document.getElementById('weight-unit-label');
    if (dInp) dInp.value = entry.date;
    if (wInp) wInp.value = entry.weight;
    if (ul)   ul.textContent = S.unitMode === 'lbs' ? 'lbs' : 'kg';
    openOv('ov-weight-entry');
    haptic && haptic(8);
    setTimeout(() => wInp && wInp.focus(), 300);
  }, 220);
}

function renderSuggestions() {
  const el = document.getElementById('sug-list');
  if (!S.exercises.length) {
    el.innerHTML = html_sug('wait','','Los geht\'s!','Füge deine erste Übung hinzu und starte deinen eigenen Trainingsplan.');
    return;
  }
  const cards = S.exercises.map(getSuggestion).filter(Boolean);
  el.innerHTML = cards.length
    ? cards.map(s => html_sug(s.type, s.icon, s.title, s.text)).join('')
    : html_sug('wait','','Noch kein Training','Absolviere dein erstes Training, um Vorschläge zu erhalten.');
}

function html_sug(type, icon, title, text) {
  const ic = icon ? `<div class="sug-ic">${icon}</div>` : '';
  // title/text sind reine Textstrings (können Übungsnamen enthalten) → escapen
  return `<div class="sug ${type}">${ic}<div><div class="sug-title">${esc(title)}</div><div class="sug-sub">${esc(text)}</div></div></div>`;
}

// Hilfsfunktion: Arbeitssätze extrahieren (ohne Aufwärmsätze)
function _workSets(sets) {
  return sets.filter(s => s.w && s.r && (s.type || 'normal') !== 'warmup');
}
/* Arbeitssaetze der LAUFENDEN Einheit, die wirklich schon gehoben wurden.
   buildPlannedSets() fuellt Gewicht und Wiederholungen im Voraus aus — fuer
   abgeschlossene Einheiten ist _workSets() deshalb richtig, fuer das laufende
   Training aber falsch: dort zaehlt es geplante Saetze als erbracht. Genau
   daraus entstanden die falschen Aussagen des Live-Coaches (Top-Satz-Chance
   schon beim ersten Satz, Volumen "fertig", bevor etwas gehoben war). Das
   Haekchen (done) ist die einzige Quelle dafuer, dass ein Satz gelaufen ist. */
function _loggedWorkSets(sets) {
  return (sets || []).filter(s => s.done && s.w && s.r && (s.type || 'normal') !== 'warmup');
}
/* ── Vergleichsbasis: Median der letzten bis zu drei Einheiten ───────────────
   Der Coach verglich gegen GENAU die letzte Einheit. Ein schlechter Tag dort
   liess ihn heute falschen Fortschritt melden, ein guter falschen Rueckschritt.
   Der Median ueber drei Einheiten haelt genau diesen einen Ausreisser aus —
   der Mittelwert taete es nicht, der zieht mit. Ist nur eine Einheit da, ist
   der Median diese Einheit; die Funktion braucht also keinen Sonderfall. */
const COACH_REF_N = 3;
function _median(werte) {
  const a = werte.filter(v => typeof v === 'number' && isFinite(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
function _coachRefSets(exId) {
  const hist = exHistory(exId);
  if (!hist.length) return [];
  const einheiten = hist.slice(-COACH_REF_N).map(h => _workSets(h.sets || []));
  const laenge = einheiten.reduce((m, s) => Math.max(m, s.length), 0);
  const out = [];
  for (let i = 0; i < laenge; i++) {
    const w = _median(einheiten.map(s => s[i] ? (parseFloat(s[i].w) || NaN) : NaN));
    const r = _median(einheiten.map(s => s[i] ? (parseInt(s[i].r) || NaN) : NaN));
    if (w > 0 && r > 0) out.push({ w: String(w), r: String(r) });
  }
  return out;
}

/* ── Wochenvolumen je Muskelgruppe ──────────────────────────────────────────
   Der Coach entschied ueber Saetze nur INNERHALB der laufenden Uebung. Die
   Trainingslehre steuert Volumen aber pro Muskelgruppe und Woche: unter etwa
   zehn harten Saetzen passiert zu wenig, ueber etwa zwanzig kippt das
   Verhaeltnis von Reiz zu Erholung. Beide Zahlen liegen in der App — sie
   wurden nur nie gefragt. Das laufende Training zaehlt mit, aber nur mit den
   tatsaechlich abgehakten Saetzen. */
const MG_WEEK_MIN = 10, MG_WEEK_MAX = 20;
function _weekSetsForMg(mg) {
  if (!mg) return 0;
  let n = 0;
  try {
    const seit = Date.now() - 7 * 864e5;
    const zuMg = Object.create(null);
    (S.exercises || []).forEach(e => { if (e && e.id) zuMg[e.id] = e.muscleGroup; });
    (S.sessions || []).forEach(s => {
      if (!s || new Date(s.date).getTime() < seit) return;
      (s.logs || []).forEach(l => {
        if (l && zuMg[l.exerciseId] === mg) n += _workSets(l.sets || []).length;
      });
    });
    (typeof wkLogs !== 'undefined' ? wkLogs || [] : []).forEach(l => {
      if (l && zuMg[l.exerciseId] === mg) n += _loggedWorkSets(l.sets).length;
    });
  } catch(e) { console.warn('[Coach] Wochenvolumen:', e); return 0; }
  return n;
}

/* Position des Satzes si unter den ARBEITSSAETZEN (Aufwaermsaetze zaehlen nicht).
   Ohne diese Umrechnung verglich der Coach Satz-Index gegen Satz-Index — und
   traf damit im Verlauf regelmaessig einen Aufwaermsatz der letzten Einheit als
   "Vergleichswert vom letzten Mal". */
function _workPosOf(sets, si) {
  let n = -1;
  for (let i = 0; i <= si && i < (sets || []).length; i++) {
    if (((sets[i].type) || 'normal') !== 'warmup') n++;
  }
  return n;
}
/* Vergleichssatz aus der letzten Einheit: gleiche Arbeitssatz-Position, sonst
   der schwerste Arbeitssatz. Aufwaermsaetze fliegen vorher raus. */
function _lastWorkBase(lastSets, workPos) {
  const work = _workSets(lastSets || []);
  if (!work.length) return null;
  const byPos = workPos >= 0 ? work[workPos] : null;
  if (byPos && parseFloat(byPos.w) > 0 && parseInt(byPos.r) > 0) return byPos;
  return work.slice().sort((a, b) => (parseFloat(b.w) || 0) - (parseFloat(a.w) || 0))[0] || null;
}
// Reps-Prüfung: fail = immer als "erreicht" zählen
function _repsOk(s, target) {
  return s.type === 'fail' || parseInt(s.r) >= target;
}

// Steigerungs-Schritt (kg) beim Erreichen des Wdh-Bereichs.
// Priorität: pro Übung (ex.progStep) → global (S.progStepDefault) → null (Auto-Fallback).
// Werte werden intern in kg gespeichert.
function progStepFor(ex) {
  if (ex && ex.progStep != null && ex.progStep !== '' && isFinite(ex.progStep) && Number(ex.progStep) > 0) return Number(ex.progStep);
  if (S.progStepDefault != null && S.progStepDefault !== '' && isFinite(S.progStepDefault) && Number(S.progStepDefault) > 0) return Number(S.progStepDefault);
  return null;
}

/* ── AUTOREGULATION (Phase I): der Check-in STEUERT das nächste Training ──
   Vorher wurde das Post-Workout-Feedback nur gespeichert und der KI als Text
   mitgegeben — angewendet hat es fast nichts (nur „Sehr schwer" bremste einmal
   die Progression). _ciReadiness() leitet aus den letzten 3 Check-ins EINEN
   Zustand ab, der überall greift, wo die App Trainingsentscheidungen trifft:
     • getSuggestedWeight()  → Gewichtsvorschlag (Deload-Faktor / Halten / Push)
     • getSuggestion()       → Begründung in der Übungs-Karte
     • smartRestSecs()       → längere bzw. kürzere Satzpausen
     • startActive()         → Ansage in der Coach-Leiste beim Trainingsstart
     • Tagesempfehlung       → sichtbarer Status auf der Startseite
     • _aiaData()            → dieselbe Lage geht an die KI, damit KI-Antwort
                               und lokale Anpassung nicht widersprechen
   Rein lokal (kein KI-Call, keine Quota). Implizit premium-only: S.checkins
   bekommt nur bei Premium-Nutzern Einträge (_checkinOpen-Gate). Check-ins, die
   älter als CI_STALE_DAYS sind, steuern nichts mehr — sonst würde eine schwere
   Einheit von vor drei Wochen ewig bremsen. */
const CI_STALE_DAYS = 10;
let _ciReadyCache = { key: null, val: null };
function _ciReadiness() {
  try {
    if (!isPremium()) return null;
    const all = (S.checkins || []).filter(c => c && c.feel);
    if (!all.length) return null;
    const last = all[all.length - 1];
    const key = all.length + ':' + (last.sid || '') + ':' + last.feel + ':' + (last.en || 2);
    if (_ciReadyCache.key === key) return _ciReadyCache.val;
    const val = _ciReadinessCalc(all, last);
    _ciReadyCache = { key, val };
    return val;
  } catch(e) { console.warn('[CI] readiness:', e); return null; }
}
function _ciReadinessCalc(all, last) {
  const lastTs = last.d ? new Date(last.d).getTime() : 0;
  if (lastTs && Date.now() - lastTs > CI_STALE_DAYS * 864e5) return null;
  const win   = all.slice(-3);
  const hard  = win.filter(c => c.feel >= 3).length;
  const avgEn = win.reduce((s, c) => s + (c.en || 2), 0) / win.length;
  const en    = last.en || 2;
  const base  = { sid: last.sid, feel: last.feel, en, wFactor: 1, restMult: 1, hold: false, bigStep: false };

  // Mehrfach schwer bei wenig Energie → echter Deload: Gewicht runter + mehr Pause
  if (win.length >= 2 && hard >= 2 && last.feel >= 3 && avgEn <= 1.7) {
    return { ...base, mode: 'deload', wFactor: 0.92, restMult: 1.25, hold: true,
      chip:  _cm('Deload aktiv', 'Deload active'),
      head:  _cm('Erholung geht heute vor', 'Recovery comes first today'),
      text:  _cm('Deine letzten Einheiten waren schwer bei wenig Energie. Ich nehme rund 8 % Gewicht raus und gebe dir längere Pausen.',
                 'Your recent sessions were hard on low energy. I am taking about 8% off the weights and giving you longer rest.'),
      short: _cm('Deload aktiv: ~8 % weniger Gewicht, längere Pausen.', 'Deload active: ~8% less weight, longer rest.'),
      bar:   _cm('Deload: ich habe die Vorschläge um ~8 % gesenkt und die Pausen verlängert.',
                 'Deload: I lowered today’s suggestions by ~8% and extended your rest.'),
      plain: 'Letzte Einheiten mehrfach schwer bei niedriger Energie — App hat Gewichte um 8 % gesenkt und Pausen um 25 % verlängert.' };
  }
  // Letzte Einheit „Sehr schwer" → Progression einmal aussetzen (bisheriges Verhalten)
  if (last.feel === 4) {
    return { ...base, mode: 'hold', restMult: 1.2, hold: true,
      chip:  _cm('Gewicht halten', 'Hold weight'),
      head:  _cm('Heute halten, nicht steigern', 'Hold today, don’t add weight'),
      text:  _cm('Dein letztes Training war sehr schwer. Gleiche Gewichte, etwas mehr Pause — sauber wiederholen schlägt heute jeden Sprung.',
                 'Your last session was very hard. Same weights, a little more rest — a clean repeat beats any jump today.'),
      short: _cm('Heute Gewichte halten statt steigern.', 'Hold the weights today instead of adding.'),
      bar:   _cm('Nach deinem Check-in: Gewichte halten, Pausen etwas länger.',
                 'After your check-in: hold the weights, rest a little longer.'),
      plain: 'Letzte Einheit als „Sehr schwer" bewertet — App setzt Progression aus und verlängert Pausen um 20 %.' };
  }
  // Anstrengend + leerer Tank → leicht zurücknehmen statt stur weiter
  if (last.feel === 3 && en === 1) {
    return { ...base, mode: 'easy', wFactor: 0.96, restMult: 1.12, hold: true,
      chip:  _cm('Leicht gedrosselt', 'Slightly eased'),
      head:  _cm('Etwas zurückgenommen', 'Dialed back a little'),
      text:  _cm('Anstrengend bei niedriger Energie — ich habe die Vorschläge leicht gesenkt und die Pausen verlängert.',
                 'Hard session on low energy — I eased the suggestions a little and extended your rest.'),
      short: _cm('Leicht gesenkt, Pausen etwas länger.', 'Eased a little, rest extended.'),
      bar:   _cm('Energie war niedrig: Vorschläge leicht gesenkt, Pausen länger.',
                 'Energy was low: suggestions eased, rest extended.'),
      plain: 'Letzte Einheit anstrengend bei niedriger Energie — App hat Gewichte um 4 % gesenkt.' };
  }
  // Locker + volle Energie → große Progressionsstufe freigeben, Pausen kürzer
  if (last.feel <= 2 && en === 3) {
    return { ...base, mode: 'push', restMult: 0.92, bigStep: true,
      chip:  _cm('Volle Progression', 'Full progression'),
      head:  _cm('Du hast Luft nach oben', 'You have room to push'),
      text:  _cm('Letztes Training locker bei voller Energie — ich gebe die größere Steigerung frei und kürze die Pausen leicht.',
                 'Last session felt easy on full energy — I unlocked the bigger jump and shortened rest slightly.'),
      short: _cm('Größere Steigerung ist freigegeben.', 'The bigger jump is unlocked.'),
      bar:   _cm('Check-in war stark: größere Steigerung freigegeben.',
                 'Strong check-in: bigger jump unlocked.'),
      plain: 'Letzte Einheit leicht bei hoher Energie — App gibt größere Steigerung frei und kürzt Pausen um 8 %.' };
  }
  return { ...base, mode: 'steady',
    chip:  _cm('Plan läuft', 'On plan'),
    head:  _cm('Alles im grünen Bereich', 'Everything on track'),
    text:  _cm('Dein letzter Check-in passt zum Plan — normale Progression, normale Pausen.',
               'Your last check-in fits the plan — normal progression, normal rest.'),
    short: '',
    bar:   null,
    plain: 'Letzter Check-in unauffällig — normale Progression.' };
}
// Begruendungen der berechneten Gewichtsvorschlaege (Task 4, Coach-Chat
// "Warum X?"), abgelegt JE UEBUNGS-ID. Bewusst NUR im Speicher, nie in
// S/persist() — die Begruendung gilt fuer genau diesen Moment und wuerde als
// Cloud-Feld sofort veralten.
//
// Eine einzelne _lastWeightReason-Variable war hier falsch: startActive() ruft
// getSuggestedWeight() in einer Schleife ueber ALLE Uebungen der Einheit auf,
// danach stand dort immer die Begruendung der LETZTEN Uebung. Am Bankdruecken
// haette der Coach also das Gewicht der Beinpresse begruendet — eine
// konfident formulierte Falschaussage — und "Warum 62,5?" haette die Zahl gar
// nicht mehr getroffen. Invariante jetzt: die Begruendung, die _coachSnap()
// ausliefert, gehoert zwingend zu der Uebung, deren Gewicht der Nutzer gerade
// vor sich hat (Auswahl dort ueber die aktive Uebung in wkLogs). Passt keine,
// bleibt weightReason null und die Frage geht ans Modell.
let _weightReasons = {};
// Gewichtsvorschlag nach Check-in-Lage anpassen (nur runter, nie hoch — hoch
// passiert über die freigegebene größere Progressionsstufe, nicht per Faktor).
// meta (optional): Begruendungs-Grunddaten aus getSuggestedWeight (Task 4) —
// wird hier nur ergaenzt (fromKg/toKg/ciFactor) und unter meta.exId in
// _weightReasons abgelegt. ciFactor = angepasstes Gewicht / rohes Gewicht
// (1.0 = unveraendert), Division durch 0 abgefangen ueber die isFinite/n>0-
// Pruefung unten. Ohne exId wird nichts abgelegt — eine Begruendung ohne
// Uebungsbezug waere nicht zuordenbar und damit wertlos.
/* Gedaechtnis ueber Einheiten hinweg. Der Coach mass die Satz-Schwierigkeit
   waehrend des Trainings, warf sie danach aber weg: die naechste Einheit begann
   wieder beim rohen Progressionsvorschlag, und dieselbe Korrektur passierte
   jede Woche neu. Waren die Arbeitssaetze der letzten Einheit ueberwiegend
   schwer, startet die naechste drei Prozent tiefer; waren sie ueberwiegend
   leicht, drei Prozent hoeher. Zwei gleiche Messungen sind die Untergrenze —
   eine einzelne ist Tagesform (dieselbe Schwelle wie CoachRpe.TREND_MIN). */
function _rpeMemFactor(exId) {
  try {
    if (!exId) return 1;
    const hist = exHistory(exId);
    if (!hist.length) return 1;
    const sets = _workSets(hist[hist.length - 1].sets || []);
    const schwer = sets.filter(s => s.rpeAnswer === 'hard').length;
    const leicht = sets.filter(s => s.rpeAnswer === 'easy').length;
    if (schwer >= 2 && schwer > leicht) return 0.97;
    if (leicht >= 2 && leicht > schwer) return 1.03;
    return 1;
  } catch(_) { return 1; }
}

/* Geplante Entlastungswoche. Der Coach REAGIERTE auf Erschoepfung (Check-in),
   plante sie aber nie. Jede Periodisierung sieht nach vier bis sechs harten
   Wochen eine leichtere vor — nicht weil es dann schon zu spaet ist, sondern
   damit es nicht so weit kommt.
   Gezaehlt werden zusammenhaengende Wochen mit mindestens zwei Einheiten. Eine
   Woche mit hoechstens einer Einheit ist bereits eine Entlastung und setzt den
   Zaehler zurueck; ebenso eine Entlastung, die die App selbst angesetzt hat
   (S.deloadAt). Der Zustand liegt nur lokal — kein neues Cloud-Feld, keine
   Rules-Aenderung. */
const DELOAD_NACH_WOCHEN = 6;
function _deloadDue() {
  try {
    if (!isPremium()) return false;
    const zuletzt = Number(S.deloadAt) || 0;
    if (zuletzt && Date.now() - zuletzt < DELOAD_NACH_WOCHEN * 7 * 864e5) return false;
    const proWoche = Object.create(null);   // Einheiten je Woche
    const saetze   = Object.create(null);   // Arbeitssaetze je Woche
    (S.sessions || []).forEach(s => {
      if (!s || !s.date) return;
      const t = new Date(s.date).getTime();
      if (!isFinite(t)) return;
      const wo = Math.floor(t / (7 * 864e5));
      proWoche[wo] = (proWoche[wo] || 0) + 1;
      let n = 0;
      (s.logs || []).forEach(l => { n += _workSets(l && l.sets).length; });
      saetze[wo] = (saetze[wo] || 0) + n;
    });
    const jetzt = Math.floor(Date.now() / (7 * 864e5));
    /* Eine harte Woche ist nicht einfach eine Woche mit zwei Terminen. Vorher
       zaehlten sechs Wochen mit je zwei lockeren Einheiten genauso wie sechs
       harte — die Entlastung kam dann, ohne dass sich etwas angesammelt haette.
       Bezug ist das eigene Mittel: der Median der Satzzahl ueber die letzten
       zwoelf Wochen mit Training. Wer weniger als drei Viertel davon macht,
       hat sich in dieser Woche bereits selbst entlastet. Ohne Median (weniger
       als drei Wochen Historie) bleibt es beim reinen Terminzaehler — eine
       Schwelle aus zwei Datenpunkten waere geraten. */
    const werte = [];
    for (let wo = jetzt - 1; wo >= jetzt - 12; wo--) {
      if ((proWoche[wo] || 0) > 0) werte.push(saetze[wo] || 0);
    }
    let median = null;
    if (werte.length >= 3) {
      const v = werte.slice().sort((a, b) => a - b);
      const m = Math.floor(v.length / 2);
      median = v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
    }
    const schwelle = median !== null ? median * 0.75 : 0;
    let hart = 0;
    // Die laufende Woche zaehlt nicht mit: sie ist noch nicht vorbei und
    // stuende sonst je nach Wochentag mal als hart, mal als leicht da.
    for (let wo = jetzt - 1; wo >= jetzt - 20; wo--) {
      const genugTermine = (proWoche[wo] || 0) >= 2;
      const genugLast    = (saetze[wo] || 0) >= schwelle;
      if (genugTermine && genugLast) hart++; else break;
    }
    return hart >= DELOAD_NACH_WOCHEN;
  } catch(e) { console.warn('[Coach] Entlastungswoche:', e); return false; }
}
/* Der Faktor liest NICHT direkt _deloadDue(): sobald die Entlastung angesetzt
   und S.deloadAt geschrieben ist, waere _deloadDue() false — und die Gewichte
   spraengen mitten in der Einheit wieder hoch. Die Entscheidung faellt einmal
   beim Start und gilt fuer die ganze Einheit. */
let _deloadActive = false;
/* Eine Entlastung ist eine WOCHE, keine Einheit. Vorher setzte _deloadStart()
   S.deloadAt und war damit selbst der Grund, warum _deloadDue() sofort wieder
   false lieferte: die zweite Einheit derselben Woche lief wieder mit vollen
   100 Prozent. Der Faktor haengt deshalb am Fenster ab dem Zeitstempel, nicht
   am Flag der laufenden Einheit — das Flag entscheidet nur noch, ob die
   Entlastung JETZT beginnt. */
const DELOAD_FENSTER_MS = 7 * 864e5;
function _deloadImFenster() {
  const at = Number(S.deloadAt) || 0;
  return at > 0 && (Date.now() - at) < DELOAD_FENSTER_MS;
}
function _deloadFactor() { return (_deloadActive || _deloadImFenster()) ? 0.90 : 1; }
function _deloadStart() {
  _deloadActive = false;
  if (!_deloadDue()) return false;
  _deloadActive = true;
  S.deloadAt = Date.now();
  try { persist(); } catch(_) {}
  return true;
}

function _ciAdjustW(w, meta) {
  const r = _ciReadiness();
  const n = Number(w);
  // Drei Faktoren, ein Nadeloehr: Check-in (Tagesform), Gedaechtnis der letzten
  // Einheit dieser Uebung und die geplante Entlastungswoche. Sie multiplizieren
  // sich, statt einander zu ueberschreiben — sonst gewaenne willkuerlich der
  // zuletzt geschriebene.
  const f = (r ? r.wFactor : 1) * _rpeMemFactor(meta && meta.exId) * _deloadFactor();
  const out = (Math.abs(f - 1) < 1e-9 || !isFinite(n) || n <= 0) ? w : (() => {
    const step = n >= 40 ? 2.5 : 1;
    const raw  = Math.max(step, Math.round((n * f) / step) * step);
    // Frueher stand hier immer Math.min(n, ...): die Faktoren konnten nur
    // senken. Das Gedaechtnis darf auch heben — dann ist n die UNTERgrenze.
    return f < 1 ? Math.min(n, raw) : Math.max(n, raw);
  })();
  if (meta && meta.exId) {
    const outN = Number(out);
    _weightReasons[meta.exId] = { ...meta, fromKg: n, toKg: outN,
      ciFactor: (isFinite(n) && n > 0 && isFinite(outN)) ? outN / n : 1 };
  }
  return out;
}
// Progressions-Bremse: „Sehr schwer" bei genau dieser Einheit ODER ein aktuell
// aktiver Halte-/Deload-Zustand (der bezieht sich immer auf die jüngste Einheit).
/* Muskelgruppen, die in dieser Einheit wirklich vorkamen. Ermuedung ist zum
   Teil oertlich: ein "Sehr schwer" nach dem Beintag sagt nichts ueber den
   Bizeps aus, bremste aber bisher jede Uebung gleichermassen. */
function _ciSessionMgs(sessionId) {
  const out = new Set();
  try {
    const s = (S.sessions || []).find(x => x && x.id === sessionId);
    (s && s.logs || []).forEach(l => {
      const ex = exById(l && l.exerciseId);
      if (ex && ex.muscleGroup) out.add(ex.muscleGroup);
    });
  } catch(_) {}
  return out;
}
/* Zwei Arten von Bremse, bewusst getrennt:
   OERTLICH  — die eine sehr schwere Einheit (feel 4). Sie gilt nur fuer die
               Muskelgruppen, die darin trainiert wurden. Ist die Gruppe der
               Uebung unbekannt oder liegt die Einheit nicht mehr vor, wird
               konservativ gebremst.
   SYSTEMISCH — Deload, gedrosselt, Entlastungswoche. Sie kommen aus mehreren
               Einheiten und niedriger Energie, betreffen also den ganzen
               Organismus und gelten weiter fuer jede Uebung. */
function _ciBlocksProgression(sessionId, ex) {
  if (!sessionId) return false;
  const r = _ciReadiness();
  if (r && r.hold && r.sid === sessionId && r.mode !== 'hold') return true;  // systemisch
  const c = (S.checkins || []).find(c => c.sid === sessionId);
  const sehrSchwer = !!(c && c.feel === 4) || !!(r && r.hold && r.mode === 'hold' && r.sid === sessionId);
  if (!sehrSchwer) return false;
  const mg = ex && ex.muscleGroup;
  if (!mg) return true;
  const mgs = _ciSessionMgs(sessionId);
  return mgs.size ? mgs.has(mg) : true;
}
// Arbeitssaetze, die die Progression tragen: Job-Saetze, sonst Top-Saetze.
// Steht hier einmal, damit Gewicht und Wiederholungen dieselbe Auswahl sehen.
function _progMainSets(sets) {
  const work = _workSets(sets);
  const job  = work.filter(s => (s.type || 'normal') !== 'top');
  return job.length ? job : work.filter(s => s.type === 'top');
}
function _progTotalReps(sets) {
  return sets.reduce((a, s) => a + (parseInt(s.r) || 0), 0);
}
/* Zweiter Progressionspfad. Die reine Double Progression verlangt ALLE
   Arbeitssaetze am oberen Bereichsende — bei vier Saetzen bricht der letzte
   fast immer um ein bis zwei Wiederholungen ein, was physiologisch normal ist
   und hier zum Dauerstopp wurde. Anerkannt ist deshalb auch der Weg ueber das
   Gesamtvolumen: erster Arbeitssatz oben im Bereich UND in Summe mehr
   Wiederholungen als in der Vorwoche bei GLEICHEM Topgewicht. Das ist
   progressive Ueberlastung ueber die Wiederholungen, bevor die Last steigt. */
function _progFirstSetRule(ex, hist, lastIdx) {
  try {
    if (!ex || !Array.isArray(hist) || lastIdx < 1) return false;
    const cur = _progMainSets((hist[lastIdx] || {}).sets || []);
    if (!cur.length) return false;
    if (!_repsOk(cur[0], ex.targetReps)) return false;
    let prevIdx = -1;
    for (let i = lastIdx - 1; i >= 0; i--) {
      if (_progMainSets((hist[i] || {}).sets || []).length) { prevIdx = i; break; }
    }
    if (prevIdx < 0) return false;
    const prev = _progMainSets(hist[prevIdx].sets || []);
    if (maxW(cur) !== maxW(prev)) return false;   // andere Last, andere Aussage
    return _progTotalReps(cur) > _progTotalReps(prev);
  } catch(e) { console.warn('[Coach] Volumenpfad:', e); return false; }
}
function getSuggestedWeight(ex) {
  const hist = exHistory(ex.id);
  // Jeder Rueckgabepfad raeumt den Eintrag DIESER Uebung ab (bzw. schreibt ihn
  // in _ciAdjustW neu) — sonst bliebe eine veraltete Begruendung zu genau
  // dieser Uebung stehen, sobald sie keinen gerechneten Vorschlag mehr hat
  // (Task 4: "Warum X?" im Coach-Chat wuerde dann eine tote Zahl begruenden).
  if (!hist.length) { delete _weightReasons[ex.id]; return ex.targetWeight ? Number(ex.targetWeight) : null; }
  // Jüngste Einheit mit echtem Arbeitsgewicht suchen — nicht stur die allerletzte.
  // Sonst „vergisst" die App das Gewicht dauerhaft, sobald einmal eine Einheit
  // ohne Gewicht (nur Wdh) gespeichert wurde → nie wieder ein Vorschlag, keine PR.
  let lastIdx = -1;
  for (let i = hist.length - 1; i >= 0; i--) {
    if (_workSets(hist[i].sets).length) { lastIdx = i; break; }
  }
  if (lastIdx < 0) { delete _weightReasons[ex.id]; return ex.targetWeight ? Number(ex.targetWeight) : null; }
  const last = hist[lastIdx];

  const workSets = _workSets(last.sets);
  if (!workSets.length) { delete _weightReasons[ex.id]; return null; }

  // Top-Sätze separat – gelten als eigene Kategorie (1 schwerer Arbeitssatz)
  const topSets  = workSets.filter(s => s.type === 'top');
  const jobSets  = workSets.filter(s => (s.type || 'normal') !== 'top');
  // Drop-Sätze zählen bei den Job-Sätzen mit, treiben aber nicht alleine die Progression
  const mainSets = jobSets.length ? jobSets : topSets;
  const topOnly  = !jobSets.length && topSets.length > 0;

  const lMaxW   = maxW(mainSets);
  const allReps = mainSets.every(s => _repsOk(s, ex.targetReps));
  // Aufwärmsätze zählen nicht als Arbeitssätze: geplante Warmups vom Satz-Soll
  // abziehen, sonst blockiert z. B. 1×Aufwärmen + 2×Arbeit bei targetSets=3
  // die Gewichts-Steigerung dauerhaft (2 Arbeitssätze < 3 Soll).
  const warmups = last.sets.filter(s => (s.type || 'normal') === 'warmup').length;
  const allSets = mainSets.length >= (topOnly ? 1 : Math.max(1, (ex.targetSets || 1) - warmups));

  // Konfigurierbarer Steigerungs-Schritt (pro Übung > global > Auto-Fallback).
  // Top-Satz: kleinere Stufen bis 100 kg (präzisere Intensitätssteuerung)
  const cfgStep   = progStepFor(ex);
  const stepBig   = cfgStep != null ? cfgStep : (topOnly ? (lMaxW >= 100 ? 5 : 2.5) : (lMaxW >= 60 ? 5 : 2.5));
  const stepSmall = cfgStep != null ? cfgStep : 2.5;
  const held = _ciBlocksProgression(last.id, ex);

  // Grunddaten fuer die Task-4-Begruendung (_weightReasons). repRange()
  // liefert {min,max}, die Router-Schnittstelle verlangt ein Array [min,max].
  const rr       = repRange(ex);
  const lastReps = mainSets.map(s => parseInt(s.r) || 0);
  // exId bindet die Begruendung an genau diese Uebung (siehe _weightReasons).
  const reasonBase = { exId: ex.id, exName: ex.name, lastReps, repRange: [rr.min, rr.max] };

  if (!held && lastIdx >= 1) {
    // vorletzte Einheit MIT Arbeitsgewicht (vor lastIdx)
    let prevIdx = -1;
    for (let i = lastIdx - 1; i >= 0; i--) {
      if (_workSets(hist[i].sets).length) { prevIdx = i; break; }
    }
    if (prevIdx >= 0) {
      const pWork   = _workSets(hist[prevIdx].sets);
      const pJob    = pWork.filter(s => (s.type||'normal') !== 'top');
      const pMain   = pJob.length ? pJob : pWork.filter(s => s.type === 'top');
      if (pMain.length) {
        const pAllReps = pMain.every(s => _repsOk(s, ex.targetReps));
        const pMax     = maxW(pMain);
        if (allReps && allSets && pAllReps && lMaxW === pMax) {
          return _ciAdjustW(lMaxW + stepBig, { ...reasonBase, reason: 'repsHigh', stepKg: stepBig });
        }
      }
    }
  }
  // Check-in „locker bei voller Energie" gibt die große Stufe schon nach EINER
  // sauberen Einheit frei (sonst braucht es zwei identische Einheiten) — das
  // ist der Fall 'checkinUp': nicht die Wiederholungen allein tragen die
  // größere Stufe, sondern der gute Check-in gibt sie vorzeitig frei.
  if (!held && allReps && allSets) {
    const ciUp = !!(_ciReadiness()?.bigStep);
    const step = ciUp ? stepBig : stepSmall;
    return _ciAdjustW(lMaxW + step, { ...reasonBase, reason: ciUp ? 'checkinUp' : 'repsHigh', stepKg: step });
  }
  // Volumenpfad: der Bereich ist oben nicht ueberall erreicht, aber der erste
  // Arbeitssatz sitzt oben und in Summe kamen mehr Wiederholungen zusammen als
  // in der Vorwoche. Ohne diesen Zweig steht ein Nutzer, dessen letzter Satz
  // regelmaessig eine Wiederholung nachgibt, dauerhaft auf demselben Gewicht.
  if (!held && _progFirstSetRule(ex, hist, lastIdx)) {
    return _ciAdjustW(lMaxW + stepSmall, { ...reasonBase, reason: 'volumeUp', stepKg: stepSmall });
  }
  // Fallback: Gewicht bleibt. held=true kommt entweder aus "Sehr schwer"
  // bewertet (reine Erholungs-Pause, 'hold') oder aus einem Check-in-Faktor
  // <1 (Deload/leicht gedrosselt, 'checkinDown' -- _ciAdjustW senkt hier
  // tatsaechlich das Gewicht). Ohne held-Bremse liegt es einzig an fehlenden
  // Wiederholungen im Zielbereich ('repsLow').
  const ciR = _ciReadiness();
  const reason = !held ? 'repsLow' : (ciR && ciR.wFactor !== 1 ? 'checkinDown' : 'hold');
  return _ciAdjustW(lMaxW, { ...reasonBase, reason, stepKg: stepSmall });
}

function getSuggestion(ex) {
  const hist = exHistory(ex.id);
  if (!hist.length) return { type:'wait', icon:'', title: ex.name, text:'Noch kein Training. Starte heute!' };

  const last = hist[hist.length-1];
  const workSets = _workSets(last.sets);
  if (!workSets.length) return null;

  const topSets  = workSets.filter(s => s.type === 'top');
  const jobSets  = workSets.filter(s => (s.type || 'normal') !== 'top');
  const mainSets = jobSets.length ? jobSets : topSets;
  const topOnly  = !jobSets.length && topSets.length > 0;

  const lMaxW   = maxW(mainSets);
  const allReps = mainSets.every(s => _repsOk(s, ex.targetReps));
  // Warmups zählen nicht als Arbeitssätze (gleiche Regel wie getSuggestedWeight)
  const warmups = last.sets.filter(s => (s.type || 'normal') === 'warmup').length;
  const allSets = mainSets.length >= (topOnly ? 1 : Math.max(1, (ex.targetSets || 1) - warmups));

  const cfgStep   = progStepFor(ex);
  const stepBig   = cfgStep != null ? cfgStep : (topOnly ? (lMaxW >= 100 ? 5 : 2.5) : (lMaxW >= 60 ? 5 : 2.5));
  const stepSmall = cfgStep != null ? cfgStep : 2.5;
  const held = _ciBlocksProgression(last.id, ex);

  if (held) {
    // Begründung kommt aus dem Check-in-Zustand (Deload/Halten/leicht gedrosselt),
    // damit die Karte dasselbe sagt, was der Gewichtsvorschlag gerade tut.
    const r = _ciReadiness();
    const tgt = _ciAdjustW(lMaxW);
    if (r && r.mode === 'deload') {
      return { type:'hold', icon:'', title:`${ex.name}: Deload`, text:`Mehrere schwere Einheiten bei wenig Energie. Heute ${kgToDisp(tgt)} ${unitLabel()} statt ${kgToDisp(lMaxW)} ${unitLabel()} — bewusst leichter.` };
    }
    if (r && r.mode === 'easy') {
      return { type:'hold', icon:'', title:`${ex.name}: leicht zurückgenommen`, text:`Letztes Training anstrengend bei niedriger Energie. Heute ${kgToDisp(tgt)} ${unitLabel()} und etwas mehr Pause.` };
    }
    return { type:'hold', icon:'', title:`${ex.name}: Erholung vor Steigerung`, text:`Du hast dein letztes Training als "Sehr schwer" bewertet. Heute ${kgToDisp(lMaxW)} ${unitLabel()} halten statt weiter steigern.` };
  }
  if (hist.length >= 2) {
    const prev   = hist[hist.length-2];
    const pWork  = _workSets(prev.sets);
    const pJob   = pWork.filter(s => (s.type||'normal') !== 'top');
    const pMain  = pJob.length ? pJob : pWork.filter(s => s.type === 'top');
    if (pMain.length) {
      const pAllReps = pMain.every(s => _repsOk(s, ex.targetReps));
      const pMax     = maxW(pMain);
      if (allReps && allSets && pAllReps && lMaxW === pMax) {
        const inc    = stepBig;
        const setTxt = topOnly ? 'Top-Satz 2× geschafft' : '2× alle Ziel-Wdh geschafft';
        return { type:'up', icon:'', title:`${ex.name}: Gewicht erhöhen!`, text:`${setTxt}. Versuche ${kgToDisp(lMaxW+inc)} ${unitLabel()} nächstes Mal!` };
      }
    }
  }
  if (allReps && allSets) {
    const txt = topOnly
      ? `Top-Satz geschafft. Nächstes Mal: ${kgToDisp(lMaxW+stepSmall)} ${unitLabel()} als neuen Top-Satz versuchen.`
      : `Alle Ziel-Wdh erreicht. Nächstes Mal: ${kgToDisp(lMaxW+stepSmall)} ${unitLabel()} ausprobieren.`;
    return { type:'up', icon:'', title:`${ex.name}: Super!`, text: txt };
  }
  // Eingebrochen → realistisches Wdh-Ziel vorschlagen
  const sum = mainSets.reduce((a,s) => a + parseInt(s.r||0), 0);
  const avg = Math.max(1, Math.round(sum / mainSets.length));
  const gStr = repGoalStr(ex);
  if (avg < ex.targetReps - 2) {
    return { type:'hold', icon:'', title:`${ex.name}: Wdh aufbauen`, text:`Zuletzt nur ~${avg} Wdh. Versuche ${avg} Wdh bei ${kgToDisp(lMaxW)} ${unitLabel()} sauber zu halten.` };
  }
  return { type:'hold', icon:'', title:`${ex.name}: Fokus`, text:`Ziel: ${ex.targetSets}×${gStr} bei ${kgToDisp(lMaxW)} ${unitLabel()}. Halte das Gewicht.` };
}

function renderLastSession() {
  const el = document.getElementById('last-card');
  if (!S.sessions.length) { el.innerHTML = `<div style="padding:14px;color:var(--text2);font-size:15px;position:relative;z-index:1">Noch kein Training</div>`; return; }
  const last = S.sessions[S.sessions.length-1];
  const d = new Date(last.date);
  const sets = last.logs.reduce((s,l) => s+l.sets.length, 0);
  const trainLabel = deriveTrainingLabel(last);
  el.innerHTML = `<div class="last-swipe-wrap">
    <div class="last-swipe-inner">
      <div class="row last-swipe-row">
        <div class="row-body">
          <div class="row-title">${d.toLocaleDateString(GT_LOCALE,{weekday:'long',day:'numeric',month:'short'})}${trainLabel ? `<span class="last-train-tag">${trainLabel}</span>` : ''}</div>
          <div class="row-sub">${last.logs.map(l=>{const e=exById(l.exerciseId);return e?e.name:l.exerciseId}).join(' · ')}</div>
        </div>
        <span class="badge b-green">${sets} Sätze</span>
      </div>
      <div class="last-swipe-del" onclick="deleteLastSession('${last.id}')">🗑</div>
    </div>
  </div>`;
  initLastSwipe();
}

function _getTodayLabel() {
  try {
    const plan = planFor(todayKey());
    if (plan?.type === 'preset' && plan.id) { const pr = presetById(plan.id); if (pr) return pr.name; }
    if (plan?.type === 'group' && plan.group) return plan.group;
    if (plan?.type === 'exercises' && plan.exIds?.length) {
      const names = plan.exIds.slice(0,2).map(id => exById(id)?.name).filter(Boolean);
      return names.join(' & ');
    }
  } catch(e) {}
  return '';
}

function deriveTrainingLabel(session) {
  const ids = [...new Set(session.logs.map(l => {
    const ex = exById(l.exerciseId);
    return ex?.muscleGroup || null;
  }).filter(Boolean))];
  if (!ids.length) return '';
  if (ids.length === 1) return muscleLabel(ids[0]);
  const hasBeine = ids.some(m => ['beine','legs','unter'].includes(m));
  const hasBrust = ids.some(m => ['brust','push'].includes(m));
  const hasRueck = ids.some(m => ['ruecken','pull'].includes(m));
  const hasOber  = ids.some(m => ['brust','ruecken','arme','schultern','core','push','pull','ober'].includes(m));
  if (hasBeine && hasOber) return 'Ganzkörper';
  if (hasBeine && !hasOber) return ids.length <= 2 ? ids.map(muscleLabel).filter(Boolean).join(' · ') : 'Unterkörper';
  if (hasBrust && !hasRueck) return 'Push';
  if (hasRueck && !hasBrust) return 'Pull';
  if (hasBrust && hasRueck) return 'Oberkörper';
  return ids.length <= 3 ? ids.map(muscleLabel).filter(Boolean).join(' · ') : 'Oberkörper';
}

function deleteLastSession(sesId) {
  if (!confirm('Letztes Training wirklich löschen?')) return;
  S.sessions = S.sessions.filter(s => s.id !== sesId);
  persist();
  haptic(20);
  renderHome();
}

function deleteSession(sesId) {
  S.sessions = S.sessions.filter(s => s.id !== sesId);
  persist();
  haptic(30);
  _compactHistOpen = false;
  renderHome();
}

// ── SESSION HISTORY ──────────────────────────────────
let historyExpanded = false;
let _histSessOpen = new Set();

function renderSessionHistory() {
  const el = document.getElementById('history-card');
  if (!el) return;
  if (!S.sessions.length) {
    historyExpanded = false;
    el.innerHTML = `<div style="padding:14px;color:var(--text2);font-size:15px;position:relative;z-index:1">Noch kein Training</div>`;
    return;
  }
  const sessions = [...S.sessions].reverse();
  const last = sessions[0];
  const rest  = sessions.slice(1);

  const fmtDate = ses => new Date(ses.date).toLocaleDateString(GT_LOCALE,{weekday:'long',day:'numeric',month:'short'});
  const setCount = ses => ses.logs.reduce((n,l) => n + l.sets.length, 0);

  const sessBlock = (ses, idx, topBorder) => {
    const isOpen = _histSessOpen.has(idx);
    const exRows = ses.logs.map(l => {
      const e = exById(l.exerciseId);
      const name = e ? e.name : (l._overrideName || l.exerciseId);
      const mg = e ? muscleLabel(e.muscleGroup) : '';
      return `<div class="hist-ex-row"><span class="hist-ex-name">${esc(name)}${mg?`<span class="hist-ex-mg">${mg}</span>`:''}</span><span class="hist-ex-sets">${l.sets.length} Sätze</span></div>`;
    }).join('');
    return `<div${topBorder?' style="border-top:1px solid var(--sep)"':''}>
      <div class="hist-sess-head" onclick="toggleHistorySess(${idx})">
        <div class="row-body">
          <div class="row-title">${fmtDate(ses)}</div>
          <div class="row-sub">${ses.logs.length} Übung${ses.logs.length===1?'':'en'}</div>
        </div>
        <span class="badge b-green">${setCount(ses)} Sätze</span>
        <div class="history-expand-chev${isOpen?' open':''}">›</div>
      </div>
      <div class="hist-ex-list${isOpen?' open':''}">
        ${exRows}
      </div>
    </div>`;
  };

  let html = sessBlock(last, 0, false);

  if (rest.length) {
    const moreHtml = rest.map((s, i) => sessBlock(s, i+1, true)).join('');
    html += `<div class="history-more-rows${historyExpanded?' open':''}" id="history-more">${moreHtml}</div>`;
    html += `<div class="hist-more-toggle" id="history-top-row" onclick="toggleHistory()">
      <span>${historyExpanded?'Weniger anzeigen':`${rest.length} weitere${rest.length===1?' Training':' Trainings'} anzeigen`}</span>
      <div class="history-expand-chev${historyExpanded?' open':''}">›</div>
    </div>`;
  }

  el.innerHTML = html;
}

function toggleHistorySess(idx) {
  if (_histSessOpen.has(idx)) _histSessOpen.delete(idx); else _histSessOpen.add(idx);
  renderSessionHistory();
  haptic(8);
}

function toggleHistory() {
  historyExpanded = !historyExpanded;
  renderSessionHistory();
  haptic(8);
}

// ── TRACKER CIRCLES ──────────────────────────────────
const TRACKER_OPTIONS = [
  { id:'gym',       label:'Gym' },
  { id:'laufen',    label:'Laufen' },
  { id:'fahrrad',   label:'Fahrrad' },
  { id:'schwimmen', label:'Schwimmen' },
  { id:'kader',     label:'Kader' },
  { id:'dehnen',    label:'Dehnen' },
  { id:'yoga',      label:'Yoga' },
  { id:'spazieren', label:'Spazieren' },
  { id:'hiit',      label:'HIIT' },
];

function getWeekKey() {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const wk = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${wk}`;
}

function renderTrackers(row) {
  row = row || document.getElementById('tracker-row');
  if (!row) return;
  const wk = getWeekKey();
  // Quadrat (sm) & Rechteck (md): kompakte Zusammenfassung statt aller Ringe
  const size = row.closest('.hw')?.dataset.size || 'lg';
  if (size === 'sm' || size === 'md') {
    const items = (S.trackerItems || []);
    if (!items.length) {
      row.innerHTML = `<div class="hw-card" onclick="openTrackerMenu()" style="cursor:pointer"><div class="hw-stat"><div class="hw-sub">Ziele<br>hinzufügen</div></div></div>`;
      return;
    }
    const done = items.filter(it => ((S.trackerCounts[it.id]||{})[wk]||0) >= (it.goal||1)).length;
    row.innerHTML = `<div class="hw-card"><div class="hw-stat">
      <div class="hw-big">${done}<span style="font-size:15px;color:var(--text2)">/${items.length}</span></div>
      <div class="hw-sub">Ziele erreicht</div>
    </div></div>`;
    return;
  }
  const R = 26, CX = 32, CY = 32;
  const circ = +(2 * Math.PI * R).toFixed(1);
  const targets = [];
  const MAX_TRACKER = 4;
  /* Die Akzent-Rampe EINMAL je Renderlauf: getComputedStyle zwingt das Layout
     zur Neuberechnung, und viermal hintereinander waere das in einer Reihe von
     Ringen spuerbar. Der Wert wandert ins Markup und nicht als var(--acc) in
     den Verlauf, weil daraus die vier Stopps erst abgeleitet werden. */
  let accRamp;
  try {
    accRamp = _neonRamp((getComputedStyle(document.documentElement)
      .getPropertyValue('--acc') || '').trim());
  } catch(_) { accRamp = null; }
  if (!accRamp || !accRamp.c1 || accRamp.c1 === accRamp.c2) {
    accRamp = { c1:'rgba(var(--acc-rgb),.95)', c2:'rgba(var(--acc-rgb),1)',
                g1:'rgba(var(--acc-rgb),1)',   g2:'rgba(var(--acc-rgb),1)' };
  }
  const visibleItems = (S.trackerItems || []).slice(0, MAX_TRACKER);
  let html = visibleItems.map(item => {
    const count = (S.trackerCounts[item.id] || {})[wk] || 0;
    const goal  = item.goal || 1;
    const done  = count >= goal;
    const dashoffset = +(circ * (1 - Math.min(count / goal, 1))).toFixed(1);
    targets.push({ id: item.id, dashoffset, done });
    /* Farbverlauf ENTLANG des Bogens — das ist der Kern der Vorlage und war
       der eigentliche Unterschied: dort laeuft der Ring von einem satten,
       dunkleren Ton in einen hellen. Eine einfarbige Linie mit Schein sieht
       daneben immer flach aus, egal wie stark der Schein ist.
       Die Verlaufs-ID muss je Ring eindeutig sein: zwei SVG mit derselben ID
       greifen beide auf die erste zu, und alle Ringe waeren gleich gefaerbt. */
    const gid = 'trg-' + String(item.id).replace(/[^a-zA-Z0-9_-]/g, '');
    const H = item.hue != null ? item.hue : null;
    /* Der Verlauf laeuft von SATT nach HELL, nicht von dunkel nach bunt: in der
       Vorlage ist der Bogen an seinem Ende fast weiss ausgeglueht, waehrend der
       Anfang die volle Farbe traegt. Der Startton bleibt deshalb kraeftig
       (55 % Helligkeit statt 45 %) — zu dunkel gestartet, sieht die untere
       Haelfte des Rings aus wie Schatten und nicht wie Licht. */
    /* Ohne eigenen Farbton kommt die Rampe aus der Akzentfarbe. Frueher stand
       hier schlicht var(--acc-rgb) fuer alle vier Stopps — also gar kein
       Verlauf und kein heller Kern, und genau daran erkennt man Neon. */
    /* Das Gruen fuer ein erreichtes Ziel gilt nur, solange der Ring KEINE
       eigene Farbe hat. Vorher gewann es immer — wer seinem Ring Magenta gab,
       sah ihn beim Erreichen des Ziels gruen werden und hielt die Farbwahl
       fuer kaputt. Dass das Ziel erreicht ist, sagt schon der volle Ring. */
    const r = (done && H == null) ? _neonRamp('#2bd94b') : (H != null
      ? { c1:`hsl(${H},100%,60%)`, c2:`hsl(${H},100%,72%)`,
          g1:`hsl(${H},100%,55%)`, g2:`hsl(${H},100%,65%)` }
      : accRamp);
    const c1 = r.c1, c2 = r.c2, g1 = r.g1, g2 = r.g2;
    return `<div class="tracker-circle-wrap">
      <button class="tracker-ring-btn" data-id="${item.id}"
        onclick="_trackerClick('${item.id}')"
        ontouchstart="_trackerTouchStart(event,this,'${item.id}')"
        ontouchend="_trackerTouchEnd('${item.id}')"
        ontouchmove="_trackerTouchCancel(event)"
        oncontextmenu="trackerLongPress(this,'${item.id}');return false">
        <svg class="tracker-ring-svg" width="64" height="64" viewBox="0 0 64 64">
          <defs>
            <linearGradient id="${gid}" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stop-color="${c1}"/>
              <stop offset="1" stop-color="${c2}"/>
            </linearGradient>
            <!-- Eigener Verlauf fuer Hof und Wolke: VOLLE Farbe, kein
                 ausgeglühtes Ende. Der helle Ton des scharfen Bogens wuerde
                 weichgezeichnet nur grau-weiss verwaschen; das Licht drumherum
                 muss gesaettigt bleiben, sonst wirkt der Ring milchig. -->
            <linearGradient id="${gid}-g" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stop-color="${g1}"/>
              <stop offset="1" stop-color="${g2}"/>
            </linearGradient>
            <!-- Der Neon-Schein. Drei Unschaerfen derselben Linie, von eng nach
                 weit, uebereinandergelegt: die enge traegt die Helligkeit, die
                 weite den Abfall in die Flaeche. Die engste liegt doppelt drin,
                 sonst ist der Kern des Scheins zu schwach.
                 Die Region MUSS gross gesetzt werden — die Vorgabe ist nur zehn
                 Prozent ueber dem Objekt, und ein Schein, der weiter reicht,
                 wird daran abgeschnitten (siehe .tracker-ring-glow). -->
            <filter id="${gid}-f" x="-120%" y="-120%" width="340%" height="340%"
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
          <circle class="tracker-ring-bg" cx="${CX}" cy="${CY}" r="${R}"/>
          <circle class="tracker-ring-glow" cx="${CX}" cy="${CY}" r="${R}"
            filter="url(#${gid}-f)"
            stroke="url(#${gid}-g)" stroke-dasharray="${circ}" stroke-dashoffset="${circ}"/>
          <circle class="tracker-ring-halo" cx="${CX}" cy="${CY}" r="${R}"
            stroke="url(#${gid}-g)" stroke-dasharray="${circ}" stroke-dashoffset="${circ}"/>
          <circle class="tracker-ring-progress${done?' done':''}" cx="${CX}" cy="${CY}" r="${R}"
            stroke="url(#${gid})" stroke-dasharray="${circ}" stroke-dashoffset="${circ}"/>
          <text class="tracker-ring-count" x="${CX}" y="${CY - 5}">${Math.min(count, goal)}</text>
          <text class="tracker-ring-goal" x="${CX}" y="${CY + 9}">/${goal}×</text>
        </svg>
      </button>
      <div class="tracker-circle-label">${esc(item.label)}</div>
    </div>`;
  }).join('');
  if (visibleItems.length < MAX_TRACKER) {
    html += `<button class="tracker-add-btn" onclick="openTrackerMenu()">+</button>`;
  }
  row.innerHTML = html;
  // Ringe von leer auf ihren Wert ziehen
  requestAnimationFrame(() => {
    targets.forEach(({ id, dashoffset }) => {
      // Alle drei Boegen ziehen gemeinsam auf — Hof und Wolke duerfen nicht
      // hinterherhinken, sonst sieht man das Licht dem Wert nachlaufen.
      row.querySelectorAll(`.tracker-ring-btn[data-id="${id}"] .tracker-ring-progress, .tracker-ring-btn[data-id="${id}"] .tracker-ring-halo, .tracker-ring-btn[data-id="${id}"] .tracker-ring-glow`)
        .forEach(el => { el.style.strokeDashoffset = dashoffset; });
    });
  });
}

function openTrackerMenu() {
  const existing = (S.trackerItems || []).map(i => i.id);
  const available = TRACKER_OPTIONS.filter(o => !existing.includes(o.id));
  const opts = available.map(o =>
    `<button class="tracker-menu-item" onclick="_showGoalStep('${o.id}','${o.label}')">${o.label}</button>`
  ).join('');
  const sheet = document.createElement('div');
  sheet.id = 'tracker-sheet';
  sheet.innerHTML = `
    <div class="tracker-sheet-backdrop" onclick="closeTrackerMenu()"></div>
    <div class="tracker-sheet-content">
      <div class="tracker-sheet-title">Kategorie hinzufügen</div>
      <div class="tracker-menu-list" id="tracker-menu-list">
        ${opts}
        <button class="tracker-menu-item tracker-menu-custom" onclick="showCustomTrackerInput()">+ Eigene erstellen ...</button>
      </div>
      <button class="tracker-menu-cancel" onclick="closeTrackerMenu()">Abbrechen</button>
    </div>`;
  document.body.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add('open'));
}

let _pendingTracker = null;

function _showGoalStep(id, label) {
  _pendingTracker = { id, label };
  const sheet = document.getElementById('tracker-sheet');
  if (sheet) sheet.querySelector('.tracker-sheet-title').textContent = 'Wochenziel festlegen';
  const list = document.getElementById('tracker-menu-list');
  if (!list) return;
  list.innerHTML = `
    <div style="padding:4px 16px 10px;color:var(--text2);font-size:13px">
      Wie oft pro Woche möchtest du <strong style="color:var(--text)">${label}</strong> machen?
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;padding:0 16px 16px;align-items:center">
      ${[1,2,3,4,5,6,7].map(n=>`<button class="tracker-goal-btn" onclick="_selectGoal(${n})">${n}×</button>`).join('')}
      <input type="number" id="tracker-goal-num" min="1" max="365" placeholder="8+"
        style="width:62px;height:48px;border-radius:14px;background:var(--g5);border:1.5px solid var(--sep);color:var(--text);font-size:15px;font-weight:600;text-align:center;padding:0 6px;font-family:inherit;outline:none;-webkit-appearance:textfield;box-sizing:border-box;"
        onkeydown="if(event.key==='Enter'){event.preventDefault();_selectGoalFromInput()}">
      <button class="tracker-goal-btn" onclick="_selectGoalFromInput()"
        style="background:var(--acc);color:#fff;border-color:var(--acc)">✓</button>
    </div>`;
  setTimeout(() => document.getElementById('tracker-goal-num')?.focus(), 80);
}

function _selectGoalFromInput() {
  const val = parseInt(document.getElementById('tracker-goal-num')?.value, 10);
  if (!val || val < 1) { document.getElementById('tracker-goal-num')?.focus(); return; }
  _selectGoal(Math.min(val, 365));
}

function _selectGoal(goal) {
  if (!_pendingTracker) return;
  addTracker(_pendingTracker.id, _pendingTracker.label, goal);
  _pendingTracker = null;
}

function showCustomTrackerInput() {
  const list = document.getElementById('tracker-menu-list');
  if (!list) return;
  const sheet = document.getElementById('tracker-sheet');
  if (sheet) sheet.querySelector('.tracker-sheet-title').textContent = 'Eigene Kategorie';
  list.innerHTML = `
    <input id="tracker-custom-input" class="tracker-custom-input" type="text"
      placeholder="Name der Kategorie" maxlength="20" autocomplete="off"
      onkeydown="if(event.key==='Enter')_customTrackerToGoal()" />
    <button class="btn btn-acc" style="margin-top:8px" onclick="_customTrackerToGoal()">Weiter →</button>`;
  setTimeout(() => document.getElementById('tracker-custom-input')?.focus(), 80);
}

function _customTrackerToGoal() {
  const input = document.getElementById('tracker-custom-input');
  const label = input?.value.trim();
  if (!label) { input?.focus(); return; }
  _showGoalStep('custom_' + uid(), label);
}

function closeTrackerMenu() {
  const sheet = document.getElementById('tracker-sheet');
  if (!sheet) return;
  sheet.classList.remove('open');
  setTimeout(() => sheet.remove(), 290);
}

function addTracker(id, label, goal) {
  S.trackerItems = S.trackerItems || [];
  if (!S.trackerItems.find(i => i.id === id)) {
    S.trackerItems.push({ id, label, goal: goal || 1 });
    persist();
  }
  closeTrackerMenu();
  renderTrackers();
}

function incrementTracker(id) {
  const item = (S.trackerItems || []).find(i => i.id === id);
  const goal = item?.goal || 1;
  const wk = getWeekKey();
  if (!S.trackerCounts[id]) S.trackerCounts[id] = {};
  const cur = S.trackerCounts[id][wk] || 0;
  if (cur >= goal) return; // Ziel erreicht – nicht weiter zählen
  S.trackerCounts[id][wk] = cur + 1;
  persist();
  haptic(10);
  _updateTrackerRing(id);
}

function _updateTrackerRing(id) {
  const wk   = getWeekKey();
  const item  = (S.trackerItems || []).find(i => i.id === id);
  if (!item) { renderTrackers(); return; }
  const count = (S.trackerCounts[id] || {})[wk] || 0;
  const goal  = item.goal || 1;
  const done  = count >= goal;
  const R     = 26;
  const circ  = +(2 * Math.PI * R).toFixed(1);
  const dashoffset = +(circ * (1 - Math.min(count / goal, 1))).toFixed(1);
  const row   = document.getElementById('tracker-row');
  const btn   = row?.querySelector(`.tracker-ring-btn[data-id="${id}"]`);
  if (!btn) { renderTrackers(); return; }
  const ring  = btn.querySelector('.tracker-ring-progress');
  /* Beim Erreichen des Ziels wechselt die Farbe — und die steckt in den Stopps
     des Verlaufs, nicht in einer Klasse. Also einmal komplett neu bauen; ein
     Klassenwechsel allein liesse den Ring in der alten Farbe stehen. */
  if (ring && done !== ring.classList.contains('done')) { renderTrackers(); return; }
  const countEl = btn.querySelector('.tracker-ring-count');
  if (ring) {
    /* ALLE drei Ebenen mitziehen. Vorher wanderte nur der scharfe Bogen: beim
       Antippen wuchs die Linie, ihr Licht blieb auf dem alten Stand stehen und
       das Stueck dazwischen sah aus wie eine nackte Linie ohne Schein. */
    btn.querySelectorAll('.tracker-ring-progress, .tracker-ring-halo, .tracker-ring-glow')
      .forEach(el => {
        el.style.strokeDashoffset = dashoffset;
        el.classList.remove('tapped');
        void el.offsetWidth;
        el.classList.add('tapped');
        el.addEventListener('animationend', () => el.classList.remove('tapped'), { once: true });
      });
  }
  if (countEl) countEl.textContent = Math.min(count, goal);
}

function removeTrackerPrompt(btn, id) {
  trackerLongPress(btn, id);
}

let _trackerLPTimer = null;
let _trackerLPFired = false;

/* Startpunkt des Tipps. Er entscheidet, ob eine Fingerbewegung ein Wischen ist
   oder nur das Zittern, das jeder beim Halten hat — siehe _trackerTouchCancel. */
let _trackerLPX = 0, _trackerLPY = 0;
function _trackerTouchStart(event, btn, id) {
  event.preventDefault(); // verhindert Textmarkierung & iOS-Callout
  _trackerLPFired = false;
  const t = event.touches && event.touches[0];
  _trackerLPX = t ? t.clientX : 0;
  _trackerLPY = t ? t.clientY : 0;
  _trackerLPTimer = setTimeout(() => {
    _trackerLPFired = true;
    haptic(30);
    trackerLongPress(btn, id);
  }, 420);
}

function _trackerTouchEnd(id) {
  clearTimeout(_trackerLPTimer);
  _trackerLPTimer = null;
  if (!_trackerLPFired && id) incrementTracker(id); // kurzer Tap → hochzählen
}

/* Hier lag der Grund, warum das Farbmenue praktisch nie aufging: JEDE
   Fingerbewegung brach das Halten ab. Beim Halten wandert der Finger aber
   immer ein paar Pixel — der Timer wurde also fast jedes Mal geloescht, bevor
   die 420 ms um waren, und uebrig blieb ein Zaehl-Tipp.
   Erst ab zehn Pixeln ist es ein Wischen (die Ringe stehen in einer scrollbaren
   Seite, deshalb muss ein echtes Wischen weiter abbrechen). */
function _trackerTouchCancel(event) {
  const t = event && event.touches && event.touches[0];
  if (t) {
    const dx = Math.abs(t.clientX - _trackerLPX);
    const dy = Math.abs(t.clientY - _trackerLPY);
    if (dx < 10 && dy < 10) return;
  }
  clearTimeout(_trackerLPTimer);
  _trackerLPTimer = null;
  _trackerLPFired = true; // echtes Wischen = kein Tap mehr
}

function _trackerClick(id) {
  // Nur für Maus/Desktop – Touch wird über touchend behandelt
  if (window._trackerWasTouch) { window._trackerWasTouch = false; return; }
  incrementTracker(id);
}

function decrementTracker(id) {
  const wk = getWeekKey();
  if (!S.trackerCounts[id]) return;
  const cur = S.trackerCounts[id][wk] || 0;
  if (cur <= 0) return;
  S.trackerCounts[id][wk] = cur - 1;
  persist();
  haptic(10);
  _updateTrackerRing(id);
}

function _closeLPSheet() {
  const pop = document.getElementById('tracker-lp-sheet');
  const bd  = document.getElementById('tracker-lp-bd');
  if (pop) { pop.classList.remove('show'); setTimeout(() => pop.remove(), 180); }
  if (bd)  bd.remove();
}

function _changeTrackerGoal(id) {
  const item = (S.trackerItems || []).find(i => i.id === id);
  if (!item) return;
  const sheet = document.createElement('div');
  sheet.id = 'tracker-sheet';
  sheet.innerHTML = `
    <div class="tracker-sheet-backdrop" onclick="closeTrackerMenu()"></div>
    <div class="tracker-sheet-content">
      <div class="tracker-sheet-title">Ziel ändern: ${esc(item.label)}</div>
      <div class="tracker-menu-list" id="tracker-menu-list">
        <div style="padding:4px 16px 10px;color:var(--text2);font-size:13px">Wie oft pro Woche?</div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;padding:0 16px 16px;align-items:center">
          ${[1,2,3,4,5,6,7].map(n=>`<button class="tracker-goal-btn${(item.goal||1)===n?' selected':''}" onclick="_applyGoalChange('${id}',${n})">${n}×</button>`).join('')}
          <input type="number" id="tracker-goal-num" min="1" max="365" placeholder="8+"
            value="${(item.goal||1) > 7 ? (item.goal||1) : ''}"
            style="width:62px;height:48px;border-radius:14px;background:var(--g5);border:1.5px solid var(--sep);color:var(--text);font-size:15px;font-weight:600;text-align:center;padding:0 6px;font-family:inherit;outline:none;-webkit-appearance:textfield;box-sizing:border-box;"
            onkeydown="if(event.key==='Enter'){event.preventDefault();_applyGoalFromInput('${id}')}">
          <button class="tracker-goal-btn" onclick="_applyGoalFromInput('${id}')"
            style="background:var(--acc);color:#fff;border-color:var(--acc)">✓</button>
        </div>
      </div>
      <button class="tracker-menu-cancel" onclick="closeTrackerMenu()">Abbrechen</button>
    </div>`;
  document.body.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add('open'));
}

function _applyGoalChange(id, goal) {
  const item = (S.trackerItems || []).find(i => i.id === id);
  if (item) { item.goal = goal; persist(); }
  closeTrackerMenu();
  renderTrackers();
}

function _applyGoalFromInput(id) {
  const val = parseInt(document.getElementById('tracker-goal-num')?.value, 10);
  if (!val || val < 1) { document.getElementById('tracker-goal-num')?.focus(); return; }
  _applyGoalChange(id, Math.min(val, 365));
}

/* Sieben Farbtoene, die auf dunklem Grund alle leuchten und sich deutlich
   voneinander unterscheiden. Bewusst keine freie Auswahl: ein Farbrad liefert
   auch Braun und Dunkelblau, und beides ist auf schwarzem Grund kein Neon. */
const TRACKER_HUES = [4, 30, 50, 140, 175, 205, 285];
function _setTrackerHue(id, hue) {
  const it = (S.trackerItems || []).find(i => i.id === id);
  if (!it) return;
  if (hue == null) delete it.hue; else it.hue = hue;
  try { haptic(8); } catch(_) {}
  try { persist(); } catch(_) {}
  renderTrackers();
  // Das Menue bleibt offen: wer eine Farbe sucht, probiert meist mehrere.
  const off = document.querySelectorAll('#tracker-lp-sheet .trh-dot');
  off.forEach(b => b.classList.remove('on'));
  const idx = hue == null ? 0 : TRACKER_HUES.indexOf(hue) + 1;
  if (off[idx]) off[idx].classList.add('on');
}
function trackerLongPress(btn, id) {
  const item = (S.trackerItems || []).find(i => i.id === id);
  if (!item) return;
  const wk    = getWeekKey();
  const count = (S.trackerCounts[id] || {})[wk] || 0;

  _closeLPSheet();

  // Backdrop (fängt Taps außerhalb ab)
  const bd = document.createElement('div');
  bd.id = 'tracker-lp-bd';
  bd.className = 'tracker-popover-backdrop';
  bd.addEventListener('click', _closeLPSheet);

  // Popover
  const pop = document.createElement('div');
  pop.id = 'tracker-lp-sheet';
  pop.className = 'tracker-popover';

  const rows = [];
  if (count > 0) {
    rows.push(`<button class="tracker-popover-item" onclick="_closeLPSheet();decrementTracker('${id}')">−1 rückgängig (${count} → ${count - 1})</button>`);
  }
  rows.push(`<button class="tracker-popover-item" onclick="_closeLPSheet();_changeTrackerGoal('${id}')">Ziel ändern (aktuell ${item.goal||1}×/Woche)</button>`);
  // Farbwahl direkt im Menue statt in einem eigenen Blatt: es sind sieben
  // Punkte, dafuer lohnt kein zweiter Weg. Der erste Punkt ist "wie die App"
  // (kein eigener Farbton) — sonst kaeme man nie wieder zurueck.
  rows.push(`<div class="tracker-popover-hue"><i>${esc(_cm('Farbe','Colour'))}</i>`
    + `<button class="trh-dot trh-std${item.hue == null ? ' on' : ''}" title="${esc(_cm('Farbe der App','App colour'))}"
         onclick="_setTrackerHue('${id}', null)"></button>`
    + TRACKER_HUES.map(h => `<button class="trh-dot${item.hue === h ? ' on' : ''}"
         style="--h:${h}" onclick="_setTrackerHue('${id}', ${h})"></button>`).join('')
    + `</div>`);
  rows.push(`<button class="tracker-popover-item danger" onclick="_closeLPSheet();S.trackerItems=S.trackerItems.filter(i=>i.id!=='${id}');delete S.trackerCounts['${id}'];persist();renderTrackers()">Kategorie entfernen</button>`);
  pop.innerHTML = rows.join('');

  document.body.appendChild(bd);
  document.body.appendChild(pop);

  // Position: über dem Kreis, zentriert; wenn kein Platz → darunter
  requestAnimationFrame(() => {
    const rect = btn.getBoundingClientRect();
    const pw   = pop.offsetWidth  || 200;
    const ph   = pop.offsetHeight || 90;
    const gap  = 8;

    let top  = rect.top - ph - gap;
    const above = top >= 8;
    if (!above) top = rect.bottom + gap;

    let left = rect.left + rect.width / 2 - pw / 2;
    left = Math.max(8, Math.min(window.innerWidth - pw - 8, left));

    pop.style.top  = top + 'px';
    pop.style.left = left + 'px';
    pop.style.transformOrigin = above ? 'bottom center' : 'top center';

    requestAnimationFrame(() => pop.classList.add('show'));
  });
}

let _lastSwipeActive = null;
function initLastSwipe() {
  const wrap = document.querySelector('#last-card .last-swipe-wrap');
  if (!wrap) return;
  const inner = wrap.querySelector('.last-swipe-inner');
  const row   = wrap.querySelector('.last-swipe-row');
  if (!inner || !row) return;
  let startX, startY, tracking = false, wasOpen = false;

  row.addEventListener('touchstart', e => {
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY;
    tracking = true;
    wasOpen = inner.classList.contains('swipe-open');
  }, {passive:true});

  row.addEventListener('touchmove', e => {
    if (!tracking) return;
    const t = e.touches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Math.abs(dy) > Math.abs(dx) + 8) { tracking = false; return; }
    if (Math.abs(dx) < 4) return;
    e.preventDefault();
    const base = wasOpen ? -72 : 0;
    const nx = Math.max(-72, Math.min(0, base + dx));
    inner.style.transition = 'none';
    inner.style.transform = `translateX(${nx}px)`;
  }, {passive:false});

  row.addEventListener('touchend', e => {
    if (!tracking) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - startX;
    const base = wasOpen ? -72 : 0;
    inner.style.transition = '';
    if (base + dx < -36) {
      inner.style.transform = 'translateX(-72px)';
      inner.classList.add('swipe-open');
      _lastSwipeActive = inner;
    } else {
      inner.style.transform = '';
      inner.classList.remove('swipe-open');
      if (_lastSwipeActive === inner) _lastSwipeActive = null;
    }
  }, {passive:true});
}

let _chSwipeActive = null;
function initCompactHistSwipe() {
  document.querySelectorAll('#history-card .last-swipe-inner').forEach(inner => {
    const row = inner.querySelector('.last-swipe-row');
    if (!row) return;
    let startX, startY, tracking = false, wasOpen = false;

    row.addEventListener('touchstart', e => {
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY;
      tracking = true;
      wasOpen = inner.classList.contains('swipe-open');
    }, {passive:true});

    row.addEventListener('touchmove', e => {
      if (!tracking) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.abs(dy) > Math.abs(dx) + 8) { tracking = false; return; }
      if (Math.abs(dx) < 4) return;
      e.preventDefault();
      const base = wasOpen ? -72 : 0;
      const nx = Math.max(-72, Math.min(0, base + dx));
      inner.style.transition = 'none';
      inner.style.transform = `translateX(${nx}px)`;
    }, {passive:false});

    row.addEventListener('touchend', e => {
      if (!tracking) return;
      tracking = false;
      const dx = e.changedTouches[0].clientX - startX;
      const base = wasOpen ? -72 : 0;
      inner.style.transition = '';
      if (base + dx < -36) {
        if (_chSwipeActive && _chSwipeActive !== inner) {
          _chSwipeActive.style.transform = '';
          _chSwipeActive.classList.remove('swipe-open');
        }
        inner.style.transform = 'translateX(-72px)';
        inner.classList.add('swipe-open');
        _chSwipeActive = inner;
      } else {
        inner.style.transform = '';
        inner.classList.remove('swipe-open');
        if (_chSwipeActive === inner) _chSwipeActive = null;
      }
    }, {passive:true});
  });
}

// ── EXERCISE LIST ─────────────────────────────────────
function exProgressStatus(exId) {
  // Nutzt denselben Index wie exHistory() statt eigenem Full-Scan (s. _exIdxAll).
  const sessions = exHistory(exId);
  if (sessions.length < 1) return null;
  if (sessions.length < 2) return 'new';
  const last = sessions[sessions.length-1];
  const prev = sessions[sessions.length-2];
  const lastW = last ? (maxW(last.sets)||0) : 0;
  const prevW = prev ? (maxW(prev.sets)||0) : 0;
  if (lastW > prevW) return 'up';
  if (lastW < prevW) return 'down';
  return 'same';
}

// opts.listOnly = nur die Übungsliste neu bauen. Splits-Rail, Wochenvorschau und
// die Gruppen-Pills hängen NICHT an der Suche — sie beim Tippen mitzurendern war
// der zweite Teil des Such-Ruckelns (kompletter Umbau von drei Bereichen je Zeichen).
function renderExList(opts) {
  const listOnly = !!(opts && opts.listOnly);
  const sub = document.getElementById('ex-sub');
  const el  = document.getElementById('ex-list');

  // Fokus: Splits + Wochen-Rail
  if (!listOnly) {
    renderSplitList();
    renderWeekPreview(); // immer zuerst — darf nicht an frühen Empty-Returns unten scheitern
  }
  const _sc = (S.workoutPresets || []).length;
  const _td = DAYS.filter(d => planFor(d.key).type !== 'none').length;
  if (sub) sub.textContent = `${_sc} Split${_sc!==1?'s':''} · ${_td} Trainingstag${_td!==1?'e':''}`;
  const _dbc = document.getElementById('ex-db-count');
  if (_dbc) _dbc.textContent = ' · ' + (S.exercises.length || 0);

  if (!el) { if (!listOnly) renderWeekPreview(); return; }

  // Filter reduziert: nur Muskelgruppen (kein Modus-Switcher mehr)
  if (S.exFilterMode !== 'muskel') { S.exFilterMode = 'muskel'; persist(); }

  // Gruppen-Pills für aktuellen Modus
  const mode = currentMode();
  // Falls der aktive Filter nicht mehr im neuen Modus existiert → auf 'alle' zurück
  if (!mode.groups.some(g => g.id === exCatFilter)) exCatFilter = 'alle';

  const filterBar = listOnly ? null : document.getElementById('ex-filter-bar');
  if (filterBar) {
    filterBar.innerHTML = mode.groups.map(g => {
      // 'alle' nur tap-bar; echte Gruppen tap (filtern) ODER ziehbar (in Wochentag)
      if (g.id === 'alle') {
        return `<button class="icat${exCatFilter===g.id?' on':''}" onclick="setExCat('${g.id}')">${esc(g.label)}</button>`;
      }
      return `<button class="icat icat-drag${exCatFilter===g.id?' on':''}"
        onmousedown="filterChipPointerDown(event,'${g.id}','${esc(g.label)}')"
        ontouchstart="filterChipPointerDown(event,'${g.id}','${esc(g.label)}')">${g.label}</button>`;
    }).join('');
  }

  // Übungen filtern: aktive Gruppe → muscles=null = alle, sonst Übungen mit muscleGroup in Liste
  const grp = currentGroup();
  let filtered = grp.id === 'alle'
    ? S.exercises
    : S.exercises.filter(ex => exInGroup(ex, mode.id, grp.id));

  // Such-Filter
  if (exSearchText) {
    const q = _normSearch(exSearchText);
    filtered = filtered.filter(ex => _normSearch(ex.name).includes(q));
  }

  if (_dbc) _dbc.textContent = ' · ' + (filtered.length || 0);

  if (!S.exercises.length) {
    el.innerHTML = `<div class="empty"><h3>Noch keine Übungen</h3><p>Erstelle deine eigenen Übungen und baue deinen Trainingsplan auf.</p></div>`;
    return;
  }
  if (!filtered.length) {
    if (exSearchText) {
      el.innerHTML = `<div class="empty"><div class="empty-i">🔍</div><h3>Nichts gefunden</h3><p>Für „${exSearchText}" gibt es keine passende Übung in dieser Gruppe.</p></div>`;
    } else {
      el.innerHTML = `<div class="empty"><div class="empty-i">🏋️</div><h3>Keine Übungen hier</h3><p>Füge Übungen für ${grp.label} hinzu oder wähle eine andere Gruppe.</p></div>`;
    }
    return;
  }

  // Bei aktivem Gruppen-Filter: Swipe entfernt nur aus dieser Gruppe (Übung bleibt global).
  const inGroupView = grp.id !== 'alle';
  el.innerHTML = `<div class="card">${filtered.map(ex => {
    const hist = exHistory(ex.id);
    const last = hist.length ? hist[hist.length-1] : null;
    const lw = last ? maxW(last.sets) : null;
    const mgLabel = ex.muscleGroup ? muscleLabel(ex.muscleGroup) : '';
    const days = exerciseDayLabels(ex.id);
    const goalStr = repGoalStr(ex);
    const rowSub = `${mgLabel ? mgLabel+' · ' : ''}Ziel: ${ex.targetSets}×${goalStr}${lw ? ' · '+kgToDisp(lw)+' '+unitLabel() : ''}${days ? ' · '+days : ''}`;
    const _ps = exProgressStatus(ex.id);
    const _dot = _ps ? `<div class="prog-dot ${_ps}" title="${{up:'Fortschritt ↑',down:'Rückgang ↓',same:'Gleichstand →',new:'Erstes Training'}[_ps]}"></div>` : '';
    const delBtn = inGroupView
      ? `<div class="ex-row-del ex-row-remove" onclick="removeExFromGroup('${ex.id}')">Entfernen</div>`
      : `<div class="ex-row-del" onclick="deleteExDirect('${ex.id}')">🗑</div>`;
    return `<div class="ex-swipe-wrap">
      <div class="ex-swipe-inner">
        <div class="row tap ex-row" data-exid="${ex.id}" onclick="exRowClick(this,'${ex.id}')">
          <div class="ex-drag-handle" onmousedown="exDragStart(event,'${ex.id}')" ontouchstart="exDragStart(event,'${ex.id}')">⠿</div>
          ${ex.img ? `<div class="ex-row-img" style="background-image:url(${ex.img})"></div>` : ''}
          <div class="row-body"><div class="row-title">${esc(ex.name)}</div><div class="row-sub">${rowSub}</div></div>
          ${_dot}<div class="chev">›</div>
        </div>
        ${delBtn}
      </div>
    </div>`;
  }).join('')}</div>`;

  if (!listOnly) renderWeekPreview();
  initExSwipes();
}

function setExCat(id) {
  exCatFilter = id;
  renderExList();
}

function setExFilterMode(mode) {
  if (S.exFilterMode === mode) return;
  S.exFilterMode = mode;
  exCatFilter = 'alle'; // beim Modus-Wechsel zurücksetzen
  persist();
  renderExList();
}

// Übung nur aus der aktuell gefilterten Gruppe entfernen (bleibt global + in anderen Splits)
function removeExFromGroup(exId) {
  const ex = exById(exId);
  const mode = currentMode();
  const grp = currentGroup();
  if (!ex || grp.id === 'alle') return;
  ensureExGroups(ex);
  ex.groups[mode.id] = (ex.groups[mode.id] || []).filter(id => id !== grp.id);
  persist();
  renderExList();
  _dndToast(`${ex.name} aus ${grp.label} entfernt`);
  haptic(12);
}


// ── WOCHENPLAN ────────────────────────────────────────
const DAYS = GT_LANG === 'en' ? [
  { key:'mon', short:'Mon', label:'Monday' },
  { key:'tue', short:'Tue', label:'Tuesday' },
  { key:'wed', short:'Wed', label:'Wednesday' },
  { key:'thu', short:'Thu', label:'Thursday' },
  { key:'fri', short:'Fri', label:'Friday' },
  { key:'sat', short:'Sat', label:'Saturday' },
  { key:'sun', short:'Sun', label:'Sunday' },
] : [
  { key:'mon', short:'Mo', label:'Montag' },
  { key:'tue', short:'Di', label:'Dienstag' },
  { key:'wed', short:'Mi', label:'Mittwoch' },
  { key:'thu', short:'Do', label:'Donnerstag' },
  { key:'fri', short:'Fr', label:'Freitag' },
  { key:'sat', short:'Sa', label:'Samstag' },
  { key:'sun', short:'So', label:'Sonntag' },
];
function todayKey() {
  const js = new Date().getDay(); // 0=So..6=Sa
  return ['sun','mon','tue','wed','thu','fri','sat'][js];
}
function dayByKey(k) { return DAYS.find(d => d.key === k); }
function planFor(dayKey) { return (S.weekPlan && S.weekPlan[dayKey]) || {type:'none'}; }
function groupLabelById(id) {
  for (const m of GROUP_MODES) {
    const g = m.groups.find(g => g.id === id && g.id !== 'alle');
    if (g) return g.label;
  }
  return id;
}
function exerciseDays(exId) {
  const out = [];
  DAYS.forEach(d => {
    const p = planFor(d.key);
    if (p.type === 'exercises' && Array.isArray(p.exIds) && p.exIds.includes(exId)) out.push(d.key);
  });
  return out;
}
function exerciseDayLabels(exId) {
  return exerciseDays(exId).map(k => dayByKey(k).short).join(', ');
}
function syncExerciseToDays(exId, dayKeys) {
  DAYS.forEach(d => {
    const p = planFor(d.key);
    const want = dayKeys.includes(d.key);
    if (want) {
      if (p.type === 'exercises') {
        if (!p.exIds.includes(exId)) p.exIds.push(exId);
      } else if (p.type === 'none') {
        S.weekPlan[d.key] = {type:'exercises', exIds:[exId]};
      } else if (p.type === 'group') {
        S.weekPlan[d.key] = {type:'exercises', exIds:[exId]};
      }
    } else {
      if (p.type === 'exercises' && Array.isArray(p.exIds)) {
        p.exIds = p.exIds.filter(id => id !== exId);
        if (!p.exIds.length) S.weekPlan[d.key] = {type:'none'};
      }
    }
  });
}
// ── SPLITS (= workoutPresets) : Farben & Wochentag-Zuordnung ──
const SPLIT_PALETTE = ['#0A84FF','#FF375F','#30D158','#FF9F0A','#BF5AF2','#64D2FF','#FF9500','#5E5CE6','#FF2D55','#32ADE6'];
function _hexToRgb(h){ h=(h||'').replace('#',''); if(h.length===3)h=h.split('').map(c=>c+c).join(''); const n=parseInt(h,16)||0; return [(n>>16)&255,(n>>8)&255,n&255]; }
function _rgba(hex,a){ const [r,g,b]=_hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
function presetById(pid){ return (S.workoutPresets||[]).find(x=>x.id===pid)||null; }
function presetIndex(pid){ return (S.workoutPresets||[]).findIndex(x=>x.id===pid); }
function splitColor(p){ if(!p) return '#0A84FF'; if(p.color) return p.color; const i=presetIndex(p.id); return SPLIT_PALETTE[(i<0?0:i)%SPLIT_PALETTE.length]; }
function presetDays(pid){ return DAYS.filter(d=>{const p=planFor(d.key); return p.type==='preset'&&p.id===pid;}).map(d=>d.key); }

function planSummary(dayKey) {
  const p = planFor(dayKey);
  if (p.type === 'preset' && p.id) {
    const pr = presetById(p.id);
    if (pr) {
      const cnt = _presetExIdsExisting(pr).length;
      return { badge:pr.name, text:cnt+' Übung'+(cnt!==1?'en':''), empty:false, color:splitColor(pr), presetId:pr.id };
    }
    return { badge:'', text:'Frei', empty:true };
  }
  if (p.type === 'group' && p.group) {
    return { badge:groupLabelById(p.group), text:'Trainingsgruppe', empty:false };
  }
  if (p.type === 'exercises' && Array.isArray(p.exIds) && p.exIds.length) {
    const names = p.exIds.map(id => exById(id)).filter(Boolean).map(e => e.name);
    if (!names.length) return { badge:'', text:'Frei', empty:true };
    return { badge:names.length+' Übung'+(names.length!==1?'en':''), text:names.join(' · '), empty:false };
  }
  return { badge:'', text:'Frei', empty:true };
}

function openPlan() {
  renderPlanList();
  renderSplitChips();
  openOv('ov-plan');
}

const SPLIT_CHIPS = [
  { id:'push',  label:'Push',        emoji:'💥' },
  { id:'pull',  label:'Pull',        emoji:'🪢' },
  { id:'legs',  label:'Legs',        emoji:'🦵' },
  { id:'ober',  label:'Oberkörper',  emoji:'🫁' },
  { id:'unter', label:'Unterkörper', emoji:'🦵' },
  { id:'brust', label:'Brust',       emoji:'💪' },
  { id:'ruecken',label:'Rücken',     emoji:'🪢' },
  { id:'schultern',label:'Schultern',emoji:'🤷' },
  { id:'arme',  label:'Arme',        emoji:'💪' },
  { id:'core',  label:'Core',        emoji:'🧱' }
];
function renderSplitChips() {
  const el = document.getElementById('split-chip-row');
  if (!el) return;
  el.innerHTML = SPLIT_CHIPS.map(c =>
    `<div class="split-chip"
       onmousedown="splitDragStart(event,'${c.id}','${esc(c.label)}','')"
       ontouchstart="splitDragStart(event,'${c.id}','${esc(c.label)}','')">
       <span class="split-grab">⠿</span>
       <span>${esc(c.label)}</span>
     </div>`).join('');
}
function renderPlanList() {
  const el = document.getElementById('plan-list');
  if (!el) return;
  const tk = todayKey();
  el.innerHTML = DAYS.map(d => {
    const s = planSummary(d.key);
    return `<div class="plan-day${d.key===tk?' today':''}" data-daykey="${d.key}" onclick="editPlanDay('${d.key}')">
      <div class="plan-day-name">${d.short}</div>
      <div class="plan-day-body">
        <div class="plan-day-title${s.empty?' empty':''}">${s.badge?`<span class="plan-badge">${s.badge}</span>`:''}${s.empty?'Frei':s.text}</div>
        <div class="plan-day-sub">${d.label}${d.key===tk?' · heute':''}</div>
      </div>
      <div class="plan-day-chev">›</div>
    </div>`;
  }).join('');
}

let planEditDayKey = null;
let planEditDraft  = null;

function editPlanDay(dayKey) {
  planEditDayKey = dayKey;
  const cur = planFor(dayKey);
  planEditDraft = JSON.parse(JSON.stringify(cur));
  if (!planEditDraft.type || planEditDraft.type === 'preset') planEditDraft.type = 'none';
  document.getElementById('plan-day-title').textContent = dayByKey(dayKey).label;
  renderPlanTypeSeg();
  renderPlanTypeBody();
  openOv('ov-plan-day');
}
function setPlanType(t) {
  planEditDraft.type = t;
  if (t === 'group' && !planEditDraft.group) planEditDraft.group = '';
  if (t === 'exercises' && !Array.isArray(planEditDraft.exIds)) planEditDraft.exIds = [];
  renderPlanTypeSeg();
  renderPlanTypeBody();
}
function renderPlanTypeSeg() {
  document.querySelectorAll('#plan-type-seg button').forEach(b => {
    b.classList.toggle('on', b.getAttribute('data-type') === planEditDraft.type);
  });
}
function renderPlanTypeBody() {
  document.getElementById('plan-type-group').style.display      = planEditDraft.type==='group'     ? '' : 'none';
  document.getElementById('plan-type-exercises').style.display  = planEditDraft.type==='exercises' ? '' : 'none';
  document.getElementById('plan-type-none-info').style.display  = planEditDraft.type==='none'      ? '' : 'none';
  if (planEditDraft.type === 'group') renderPlanGroupPicker();
  if (planEditDraft.type === 'exercises') renderPlanExPicker();
}
function renderPlanGroupPicker() {
  const opts = [];
  GROUP_MODES.forEach(m => {
    m.groups.forEach(g => {
      if (g.id === 'alle') return;
      if (!opts.some(o => o.id === g.id)) opts.push({ id:g.id, label:g.label });
    });
  });
  document.getElementById('plan-group-picker').innerHTML = opts.map(o =>
    `<button class="icat${planEditDraft.group===o.id?' on':''}" onclick="setPlanGroup('${o.id}')">${esc(o.label)}</button>`
  ).join('');
}
function setPlanGroup(id) {
  planEditDraft.group = planEditDraft.group === id ? '' : id;
  renderPlanGroupPicker();
}
function renderPlanExPicker() {
  const el = document.getElementById('plan-ex-pick');
  if (!S.exercises.length) {
    el.innerHTML = `<div style="padding:14px;color:var(--text2);font-size:13px;text-align:center">Noch keine Übungen — füge zuerst Übungen hinzu.</div>`;
    return;
  }
  el.innerHTML = S.exercises.map(ex => {
    const on = planEditDraft.exIds && planEditDraft.exIds.includes(ex.id);
    return `<div class="plan-ex-item${on?' on':''}" onclick="togglePlanEx('${ex.id}')">
      <div class="pe-name">${esc(ex.name)}</div>
      <div class="pe-chk">✓</div>
    </div>`;
  }).join('');
}
function togglePlanEx(id) {
  if (!Array.isArray(planEditDraft.exIds)) planEditDraft.exIds = [];
  const i = planEditDraft.exIds.indexOf(id);
  if (i < 0) planEditDraft.exIds.push(id); else planEditDraft.exIds.splice(i, 1);
  renderPlanExPicker();
}
function savePlanDay() {
  if (!planEditDayKey) return;
  let next;
  if (planEditDraft.type === 'group') {
    if (!planEditDraft.group) { alert('Bitte eine Gruppe wählen oder „Frei" auswählen.'); return; }
    next = { type:'group', group:planEditDraft.group };
  } else if (planEditDraft.type === 'exercises') {
    const ids = (planEditDraft.exIds || []).filter(id => exById(id));
    next = ids.length ? { type:'exercises', exIds:ids } : { type:'none' };
  } else {
    next = { type:'none' };
  }
  S.weekPlan[planEditDayKey] = next;
  persist();
  scheduleWorkoutNotifications();
  closeOv('ov-plan-day');
  renderPlanList();
  renderExList();
  renderHome();
}

// ── DRAG-AND-DROP: ÜBUNG → WOCHENPLAN / REIHENFOLGE ───
let _dndExId      = null;
let _dndGhost     = null;
let _dndOver      = null;   // day key (Wochenplan)
let _dndOverRow   = null;   // exId einer anderen Übung (Reihenfolge)
let _dndOverSplit = null;   // split-key (Splits → Tag)
let _dndSplitId   = null;   // beim Split-Drag aktiver Split

function exDragStart(e, exId) {
  e.preventDefault();
  e.stopPropagation();
  const ex = exById(exId);
  if (!ex) return;
 _dndExId = exId;
  _dndSplitId = null;

  _dndGhost = document.createElement('div');
  _dndGhost.className = 'dnd-ghost';
  _dndGhost.innerHTML = `<span class="dnd-ghost-name">${esc(ex.name)}</span>`;
  document.body.appendChild(_dndGhost);

  const cx = e.touches ? e.touches[0].clientX : e.clientX;
  const cy = e.touches ? e.touches[0].clientY : e.clientY;
  _dndMoveGhost(cx, cy);

  document.addEventListener('touchmove', _dndOnMove, {passive:false});
  document.addEventListener('touchend',  _dndOnEnd,  {passive:false});
  document.addEventListener('mousemove', _dndOnMove);
  document.addEventListener('mouseup',   _dndOnEnd);
}

function splitDragStart(e, splitId, label, emoji) {
  e.preventDefault();
  e.stopPropagation();
  _dndSplitId = splitId;
  _dndExId = null;

  _dndGhost = document.createElement('div');
  _dndGhost.className = 'dnd-ghost';
  _dndGhost.innerHTML = `<span class="dnd-ghost-name">${label}</span>`;
  document.body.appendChild(_dndGhost);

  const cx = e.touches ? e.touches[0].clientX : e.clientX;
  const cy = e.touches ? e.touches[0].clientY : e.clientY;
  _dndMoveGhost(cx, cy);

  document.addEventListener('touchmove', _dndOnMove, {passive:false});
  document.addEventListener('touchend',  _dndOnEnd,  {passive:false});
  document.addEventListener('mousemove', _dndOnMove);
  document.addEventListener('mouseup',   _dndOnEnd);
}

// Filter-Pill im Übungen-Tab: Tap = filtern, vertikaler Zug = Split in Wochentag legen.
// Eigener Handler (statt direkt splitDragStart) wegen Tap/Drag/Scroll-Unterscheidung.
function filterChipPointerDown(e, groupId, label) {
  const startX = e.touches ? e.touches[0].clientX : e.clientX;
  const startY = e.touches ? e.touches[0].clientY : e.clientY;
  let started = false, moved = false;
  function move(ev) {
    if (started) return;
    const x = ev.touches ? ev.touches[0].clientX : ev.clientX;
    const y = ev.touches ? ev.touches[0].clientY : ev.clientY;
    const dx = Math.abs(x - startX), dy = Math.abs(y - startY);
    if (dy > 8 && dy > dx) {            // vertikal → Drag starten
      started = true; cleanup();
      splitDragStart(ev, groupId, label, '');
    } else if (dx > 8) {                // horizontal → natives Scrollen der Pill-Leiste
      moved = true; cleanup();
    }
  }
  function up(ev) {
    cleanup();
    if (!started && !moved) { if (ev.cancelable) ev.preventDefault(); setExCat(groupId); }
  }
  function cleanup() {
    document.removeEventListener('touchmove', move);
    document.removeEventListener('touchend', up);
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
  }
  document.addEventListener('touchmove', move, {passive:false});
  document.addEventListener('touchend', up, {passive:false});
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}

function _dndMoveGhost(x, y) {
  if (!_dndGhost) return;
  _dndGhost.style.left = (x - 110) + 'px';
  _dndGhost.style.top  = (y - 38)  + 'px';

  // Wochenplan-Tag-Chips (Übungen-Tab Rail)
  let overKey = null;
  document.querySelectorAll('.wk-cell[data-daykey]').forEach(el => {
    const r = el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) overKey = el.dataset.daykey;
  });
  // Plan-Tage im Wochenplan-Sheet
  if (!overKey) {
    document.querySelectorAll('.plan-day[data-daykey]').forEach(el => {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) overKey = el.dataset.daykey;
    });
  }
  if (overKey !== _dndOver) {
    document.querySelectorAll('.dnd-over').forEach(n => n.classList.remove('dnd-over'));
    _dndOver = overKey;
    if (_dndOver) {
      document.querySelectorAll(`[data-daykey="${_dndOver}"]`).forEach(n => n.classList.add('dnd-over'));
    }
  }

  // Reihenfolge in "Meine Übungen": Übung über andere ex-row
  let overRow = null;
  if (_dndExId) {
    document.querySelectorAll('.ex-row[data-exid]').forEach(el => {
      if (el.dataset.exid === _dndExId) return;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) overRow = el.dataset.exid;
    });
  }
  if (overRow !== _dndOverRow) {
    document.querySelectorAll('.ex-row.dnd-row-over').forEach(n => n.classList.remove('dnd-row-over'));
    _dndOverRow = overRow;
    if (_dndOverRow) {
      const el = document.querySelector(`.ex-row[data-exid="${_dndOverRow}"]`);
      if (el) el.classList.add('dnd-row-over');
    }
  }
}

function _dndOnMove(e) {
  e.preventDefault();
  const t = e.touches ? e.touches[0] : e;
  _dndMoveGhost(t.clientX, t.clientY);
  _dndAutoScroll(t.clientY);
}

function _dndOnEnd(e) {
  document.removeEventListener('touchmove', _dndOnMove);
  document.removeEventListener('touchend',  _dndOnEnd);
  document.removeEventListener('mousemove', _dndOnMove);
  document.removeEventListener('mouseup',   _dndOnEnd);
  _dndAutoScrollStop();

  if (_dndGhost) { _dndGhost.remove(); _dndGhost = null; }
  document.querySelectorAll('.dnd-over,.dnd-row-over').forEach(n => { n.classList.remove('dnd-over'); n.classList.remove('dnd-row-over'); });

  // Priorität: Split-Karte → Tag, Muskelgruppe → Tag, Übung → Tag, Übung → Row
  if (_dndSplitPresetId && _dndOver) {
    _dndDropSplitPreset(_dndSplitPresetId, _dndOver);
  } else if (_dndSplitId && _dndOver) {
    _dndDropSplit(_dndSplitId, _dndOver);
  } else if (_dndExId && _dndOver) {
    _dndDrop(_dndExId, _dndOver);
  } else if (_dndExId && _dndOverRow) {
    _dndReorder(_dndExId, _dndOverRow);
  }
  _dndExId = null; _dndOver = null; _dndOverRow = null; _dndSplitId = null; _dndSplitPresetId = null;
}

let _dndSplitPresetId = null;
function splitPresetDragStart(e, pid) {
  e.preventDefault();
  e.stopPropagation();
  const p = presetById(pid);
  if (!p) return;
  _dndSplitPresetId = pid;
  _dndExId = null; _dndSplitId = null;
  haptic(10);

  _dndGhost = document.createElement('div');
  _dndGhost.className = 'dnd-ghost';
  _dndGhost.innerHTML = `<span class="dnd-ghost-name">${esc(p.name)}</span>`;
  document.body.appendChild(_dndGhost);

  const cx = e.touches ? e.touches[0].clientX : e.clientX;
  const cy = e.touches ? e.touches[0].clientY : e.clientY;
  _dndMoveGhost(cx, cy);

  document.addEventListener('touchmove', _dndOnMove, {passive:false});
  document.addEventListener('touchend',  _dndOnEnd,  {passive:false});
  document.addEventListener('mousemove', _dndOnMove);
  document.addEventListener('mouseup',   _dndOnEnd);
}

function _dndDropSplitPreset(pid, dayKey) {
  const p = presetById(pid);
  if (!p) return;
  S.weekPlan[dayKey] = { type:'preset', id: pid };
  persist();
  scheduleWorkoutNotifications();
  renderWeekPreview();
  renderSplitList();
  renderPlanList();
  if (typeof renderHome === 'function') { try { renderHome(); } catch(e){} }
  const d = dayByKey(dayKey);
  _dndToast(`${p.name} → ${d.label}`);
  hapticSuccess();
}

// ── TAG → SPLIT ZUWEISEN (Tap-Alternative zum Ziehen) ──
let _dayAssignKey = null;
function openDayAssign(dayKey) {
  _dayAssignKey = dayKey;
  const t = document.getElementById('day-assign-title');
  if (t) t.textContent = dayByKey(dayKey).label;
  renderDayAssignList();
  openOv('ov-day-assign');
}
function renderDayAssignList() {
  const el = document.getElementById('day-assign-list');
  if (!el) return;
  const cur = planFor(_dayAssignKey);
  const presets = S.workoutPresets || [];
  const freeOn = cur.type === 'none' || (cur.type === 'preset' && !presetById(cur.id));
  let html = `<div class="da-opt${freeOn?' on':''}" onclick="assignSplitToDay(null)">
    <div class="da-dot" style="background:var(--text2);opacity:.4"></div>
    <div class="da-body"><div class="da-name">Frei</div><div class="da-sub">Kein Training</div></div>
    <div class="da-chk">${freeOn?'✓':''}</div></div>`;
  if (!presets.length) {
    html += `<div style="padding:16px 4px;color:var(--text2);font-size:13px;text-align:center">Noch keine Splits – erstelle zuerst einen Split.</div>`;
  } else {
    html += presets.map(p => {
      const col = splitColor(p);
      const cnt = _presetExIdsExisting(p).length;
      const on  = cur.type === 'preset' && cur.id === p.id;
      return `<div class="da-opt${on?' on':''}" onclick="assignSplitToDay('${p.id}')">
        <div class="da-dot" style="background:${col}"></div>
        <div class="da-body"><div class="da-name">${esc(p.name)}</div><div class="da-sub">${cnt} Übung${cnt!==1?'en':''}</div></div>
        <div class="da-chk" style="color:${col}">${on?'✓':''}</div></div>`;
    }).join('');
  }
  el.innerHTML = html;
}
function assignSplitToDay(pid) {
  if (!_dayAssignKey) return;
  if (pid === null || pid === 'null') S.weekPlan[_dayAssignKey] = { type:'none' };
  else S.weekPlan[_dayAssignKey] = { type:'preset', id: pid };
  persist();
  scheduleWorkoutNotifications();
  renderWeekPreview();
  renderSplitList();
  renderPlanList();
  if (typeof renderHome === 'function') { try { renderHome(); } catch(e){} }
  if (pid && pid !== 'null') hapticSuccess(); else haptic(10);
  closeOv('ov-day-assign');
}
function openDayAdvanced() {
  const k = _dayAssignKey;
  closeOv('ov-day-assign');
  if (k) setTimeout(() => editPlanDay(k), 220);
}

function _dndDrop(exId, dayKey) {
  const p = planFor(dayKey);
  if (p.type === 'exercises') {
    if (p.exIds.includes(exId)) { _dndToast('Bereits an diesem Tag ✓'); return; }
    p.exIds.push(exId);
  } else {
    S.weekPlan[dayKey] = {type:'exercises', exIds:[exId]};
  }
  persist();
  scheduleWorkoutNotifications();
  renderWeekPreview();
  renderExList();
  renderPlanList();
  const ex = exById(exId);
  const d  = dayByKey(dayKey);
  _dndToast(`${ex.name} → ${d.label}`);
}

function _dndDropSplit(splitId, dayKey) {
  let label = splitId;
  for (const m of allModes()) {
    const g = m.groups.find(g => g.id === splitId);
    if (g) { label = g.label; break; }
  }
  S.weekPlan[dayKey] = { type:'group', group: splitId };
  persist();
  scheduleWorkoutNotifications();
  renderWeekPreview();
  renderExList();
  renderPlanList();
  const d = dayByKey(dayKey);
  _dndToast(`${label} → ${d.label}`);
}

function _dndReorder(draggedId, targetId) {
  const ids = S.exercises.map(e => e.id);
  const from = ids.indexOf(draggedId);
  const to   = ids.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return;
  const [item] = S.exercises.splice(from, 1);
  S.exercises.splice(to, 0, item);
  persist();
  renderExList();
  haptic(8);
}

// ── DRAG-AND-DROP: AKTIVES TRAINING (wkLogs umsortieren) ──
let _wkDndLi    = null;
let _wkDndGhost = null;
let _wkDndOver  = null;

function wkDragStart(e, li) {
  e.preventDefault();
  e.stopPropagation();
  const log = wkLogs[li];
  if (!log) return;
  const ex = exById(log.exerciseId);
  if (!ex) return;
  _wkDndLi = li;

  _wkDndGhost = document.createElement('div');
  _wkDndGhost.className = 'dnd-ghost';
  _wkDndGhost.innerHTML = `<span class="dnd-ghost-name">${esc(ex.name)}</span>`;
  document.body.appendChild(_wkDndGhost);

  const cx = e.touches ? e.touches[0].clientX : e.clientX;
  const cy = e.touches ? e.touches[0].clientY : e.clientY;
  _wkDndMove(cx, cy);

  document.addEventListener('touchmove', _wkDndOnMove, {passive:false});
  document.addEventListener('touchend',  _wkDndOnEnd,  {passive:false});
  document.addEventListener('mousemove', _wkDndOnMove);
  document.addEventListener('mouseup',   _wkDndOnEnd);
}
function _wkDndMove(x, y) {
  if (!_wkDndGhost) return;
  _wkDndGhost.style.left = (x - 110) + 'px';
  _wkDndGhost.style.top  = (y - 38)  + 'px';
  let over = null;
  document.querySelectorAll('#log-cards .ex-card[data-li]').forEach(el => {
    if (parseInt(el.dataset.li) === _wkDndLi) return;
    const r = el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) over = parseInt(el.dataset.li);
  });
  if (over !== _wkDndOver) {
    document.querySelectorAll('.ex-card.dnd-wk-over').forEach(n => n.classList.remove('dnd-wk-over'));
    _wkDndOver = over;
    if (_wkDndOver != null) {
      const el = document.querySelector(`#log-cards .ex-card[data-li="${_wkDndOver}"]`);
      if (el) el.classList.add('dnd-wk-over');
    }
  }
}
function _wkDndOnMove(e) {
  e.preventDefault();
  const t = e.touches ? e.touches[0] : e;
  _wkDndMove(t.clientX, t.clientY);
  _dndAutoScroll(t.clientY);
}
function _wkDndOnEnd(e) {
  document.removeEventListener('touchmove', _wkDndOnMove);
  document.removeEventListener('touchend',  _wkDndOnEnd);
  document.removeEventListener('mousemove', _wkDndOnMove);
  document.removeEventListener('mouseup',   _wkDndOnEnd);
  _dndAutoScrollStop();
  if (_wkDndGhost) { _wkDndGhost.remove(); _wkDndGhost = null; }
  document.querySelectorAll('.ex-card.dnd-wk-over').forEach(n => n.classList.remove('dnd-wk-over'));
  if (_wkDndLi != null && _wkDndOver != null && _wkDndLi !== _wkDndOver) {
    const [item] = wkLogs.splice(_wkDndLi, 1);
    wkLogs.splice(_wkDndOver, 0, item);
    renderLogCards();
    haptic(8);
  }
  _wkDndLi = null; _wkDndOver = null;
}

function _dndToast(msg) {
  const t = document.getElementById('update-toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_dndToast._t);
  _dndToast._t = setTimeout(() => t.classList.remove('show'), 2400);
}

// ── DRAG AUTO-SCROLL (wenn nahe oberer/unterer Rand des Scroll-Containers) ──
// Aggressiver, kontinuierlicher Auto-Scroll via requestAnimationFrame:
// solange das Ghost-Element nahe einem Rand bleibt, wird gescrollt – auch
// wenn der Finger nicht weiter bewegt wird. Das fixt den Fall, dass man
// Übungen vom Ende einer langen Seite auf einen Wochentag oben ziehen will.
let _dndScrollRaf = null;
let _dndScrollLastY = 0;
function _dndScroller() {
  // Offenes Sheet: hat eigenen Scroll-Container → diesen nutzen
  const sheet = document.querySelector('.ov.on .sheet');
  if (sheet) {
    const r = sheet.getBoundingClientRect();
    return { node: sheet, top: r.top, bot: r.bottom };
  }
  // Normaler Page-Scroll: document.scrollingElement scrollt (nicht das .pg-div!)
  // Top-Grenze = Unterkante des sticky Headers, damit Auto-Scroll dort beginnt
  const hdr = document.querySelector('.pg.on .hdr');
  const topEdge = hdr ? hdr.getBoundingClientRect().bottom : 0;
  return {
    node: document.scrollingElement || document.documentElement,
 top: topEdge,
    bot: window.innerHeight - 80   // 80px für untere Nav-Leiste freilassen
  };
}
function _dndAutoScroll(y) {
 _dndScrollLastY = y;
  if (_dndScrollRaf) return; // läuft bereits
  const tick = () => {
    _dndScrollRaf = null;
    const y2 = _dndScrollLastY;
    const { node, top, bot } = _dndScroller();
    if (!node) return;
    const EDGE = 120;         // großzügiger Rand: 120px vom Rand triggert scroll
    const MAX_SPEED = 22;     // schnellere Geschwindigkeit für lange Listen
    let dy = 0;
    if (y2 < top + EDGE) {
      const t = Math.max(0, (top + EDGE - y2) / EDGE);
      dy = -MAX_SPEED * t * t;
    } else if (y2 > bot - EDGE) {
      const t = Math.max(0, (y2 - (bot - EDGE)) / EDGE);
      dy =  MAX_SPEED * t * t;
    }
    if (dy !== 0) {
      node.scrollBy(0, dy);
      _dndScrollRaf = requestAnimationFrame(tick);
    }
  };
  _dndScrollRaf = requestAnimationFrame(tick);
}
function _dndAutoScrollStop() {
  if (_dndScrollRaf) { cancelAnimationFrame(_dndScrollRaf); _dndScrollRaf = null; }
}

// ── FEEDBACK ───────────────────────────────────────────
function openFeedback() {
  const msg = document.getElementById('fb-msg');
  if (msg) msg.value = '';
  openOv('ov-feedback');
}
function sendFeedback() {
  const msg = (document.getElementById('fb-msg').value || '').trim();
  if (!msg) { alert('Bitte schreibe eine Nachricht.'); return; }
  const subject = encodeURIComponent('MyGymTrack Feedback');
  const ver = (typeof APP_VERSION === 'string' ? APP_VERSION : '?');
  const body = encodeURIComponent(msg + '\n\n— — — — —\nApp: ' + ver + '\nDevice: ' + (navigator.userAgent||'?'));
  window.location.href = `mailto:wolterlenny362@gmail.com?subject=${subject}&body=${body}`;
  setTimeout(() => closeOv('ov-feedback'), 300);
}

// ── PROGRESSION INFO POPUP ─────────────────────────────
function openProgressionInfo(exId) {
  const body = document.getElementById('prog-info-body');
  let exText = '';
  if (exId) {
    const ex = exById(exId);
    if (ex) {
      const sug = getSuggestion(ex);
      const sw  = getSuggestedWeight(ex);
      const sr  = getSuggestedReps(ex);
      const swDisp = sw ? kgToDisp(sw) + ' ' + unitLabel() : '–';
      exText = `
        <div style="background:rgba(var(--acc-rgb),.08);border:1px solid rgba(var(--acc-rgb),.24);border-radius:14px;padding:12px 14px;margin-bottom:14px">
          <div style="font-weight:700;margin-bottom:4px">${esc(ex.name)}</div>
          <div style="color:var(--text2);font-size:13px">Vorschlag fürs nächste Mal: <b style="color:var(--acc)">${swDisp}</b> × <b style="color:var(--acc)">${sr||repRange(ex).min} Wdh</b>${ex.targetType!=='time'?` <span style="opacity:.7">(Bereich ${repGoalStr(ex)})</span>`:''}</div>
          ${ex.weightScheme && ex.weightScheme!=='straight' ? `<div style="margin-top:4px;font-size:12px;color:var(--text2)">Schema: <b>${SCHEME_SHORT[ex.weightScheme]}</b></div>` : ''}
          ${sug && sug.text ? `<div style="margin-top:6px;font-size:13px;color:var(--text2)">${esc(sug.text)}</div>` : ''}
        </div>`;
    }
  }
  body.innerHTML = exText + `
    <p style="margin:0 0 10px"><b>1. Wiederholungsbereich (Double Progression)</b><br>
    Du arbeitest in einem Bereich, z. B. <b>6–12</b>. Schaffst du in <u>allen</u> Arbeitssätzen das obere Ende (12), steigt das Gewicht — und du startest nächstes Mal wieder unten im Bereich (6). Bis dahin baust du Satz für Satz Wiederholungen auf.</p>
    <p style="margin:0 0 10px"><b>2. Arbeitssätze zählen</b><br>
    Nur <b>Normal-, Top- und Versagen-Sätze</b> fließen in die Progression ein. <b>Aufwärmsätze (W)</b> werden ignoriert — ihr Gewicht wählst du frei (zuletzt genutztes wird vorbelegt).</p>
    <p style="margin:0 0 10px"><b>3. Satz-Typen werden übernommen</b><br>
    Deine Typen (Aufwärmen, Top, Drop …) und das Schema werden ins nächste Training derselben Übung automatisch vorbelegt.</p>
    <p style="margin:0 0 10px"><b>4. Gewichts-Schema über die Sätze</b><br>
    <b>Gleichbleibend:</b> alle gleich · <b>Aufsteigend:</b> letzter Satz am schwersten · <b>Pyramide:</b> hoch und wieder runter · <b>Umgekehrt:</b> schwerster Satz zuerst. MyGymTrack rechnet die Einzelgewichte pro Satz aus.</p>
    <p style="margin:0 0 10px"><b>5. Top-Satz &amp; Versagen</b><br>
    <b>Top-Satz (T):</b> ein schwerer Maximalsatz (RPE 8–10). <b>Bis zum Versagen (F):</b> gilt automatisch als oberes Bereich-Ende erreicht.</p>
    <p style="margin:0;font-size:12px;color:var(--text2)">Tipp: Trägst du im Training einen Rekord ein, wird er direkt im Eingabe-Fenster gefeiert.</p>`;
  openOv('ov-prog-info');
}

// ── INTELLIGENTERE PROGRESSION: Reps-Vorschlag ─────────
function getSuggestedReps(ex) {
  const { min, max } = repRange(ex);
  const hist = exHistory(ex.id);
  if (!hist.length) return min;          // Start am unteren Bereich-Ende
  const last = hist[hist.length-1];
  // Aufwärmsätze komplett ausschließen
  const validSets = _workSets(last.sets);
  if (!validSets.length) return min;
  // Gleiche Satz-Auswahl wie getSuggestedWeight (Job-Sätze vor Top-Sätzen),
  // damit Wdh-Reset und Gewichts-Steigerung IMMER zusammen passieren.
  const jobSets  = validSets.filter(s => (s.type||'normal') !== 'top');
  const topSets  = validSets.filter(s => s.type === 'top');
  const mainSets = jobSets.length ? jobSets : topSets;
  const topOnly  = !jobSets.length && topSets.length > 0;
  // Double Progression: oben im Bereich überall erreicht → Gewicht steigt,
  // Wdh starten nächstes Mal wieder unten im Bereich.
  const allTop = mainSets.every(s => _repsOk(s, max));
  // Reset nur, wenn auch alle Soll-Sätze absolviert wurden (Warmups zählen
  // nicht ins Soll) — sonst würden die Wdh zurückgesetzt, ohne dass das
  // Gewicht steigt: Rückschritt statt Progression.
  const warmups = last.sets.filter(s => (s.type||'normal') === 'warmup').length;
  const allSets = mainSets.length >= (topOnly ? 1 : Math.max(1, (ex.targetSets||1) - warmups));
  // Reset auch auf dem Volumenpfad — Gewichtssprung und Wdh-Reset gehoeren
  // IMMER zusammen (sonst Rueckschritt statt Progression, s. getSuggestedWeight).
  const steigt = (allTop && allSets) || _progFirstSetRule(ex, hist, hist.length - 1);
  if (steigt && !_ciBlocksProgression(last.id, ex)) return min;
  // Noch im Bereich am Aufbauen → eine Wdh mehr anpeilen als der schwächste Satz.
  const minReps = Math.min(...mainSets.map(s => parseInt(s.r) || 0));
  return Math.max(min, Math.min(max, minReps + 1));
}

// ── WHEEL PICKER ───────────────────────────────────────
let _wheelCtx = null; // { li, si, field, isWeight, cols: [{values, idx}], step }
function openWheel(li, si, field) {
  const log = wkLogs[li]; if (!log) return;
  const ex = exById(log.exerciseId); if (!ex) return;
  const isW = field === 'w';
  const curRaw = log.sets[si][field];
  let curDisp = '';
  if (curRaw !== '' && curRaw != null) curDisp = isW ? kgToDisp(curRaw) : curRaw;
  document.getElementById('wheel-title').textContent = isW
    ? `Gewicht (${unitLabel()})`
    : 'Wiederholungen';

  if (isW) {
    // Gewicht-Wheel: ganze + Nachkommastellen (.0, .25, .5, .75)
    const step = S.unitMode === 'lbs' ? 0.5 : 0.25;
    const maxV = S.unitMode === 'lbs' ? 1100 : 500;
    const ints = []; for (let i = 0; i <= maxV; i++) ints.push(i);
    const fracs = S.unitMode === 'lbs' ? [0, 0.5] : [0, 0.25, 0.5, 0.75];
    const cur = parseFloat(curDisp||'0') || 0;
    const iInt = Math.max(0, Math.min(maxV, Math.floor(cur)));
    const iFrac = fracs.indexOf(Math.round((cur - Math.floor(cur)) * 100) / 100);
    _wheelCtx = {
      li, si, field, isWeight:true, step,
      cols:[
        { values: ints,  idx: iInt,  label: unitLabel(), fmt: v => String(v) },
        { values: fracs, idx: Math.max(0, iFrac), label: '.', fmt: v => '.' + String(Math.round(v*100)).padStart(2,'0') }
      ]
    };
  } else {
    // Reps-Wheel: 0–200
    const max = 300;
    const arr = []; for (let i = 0; i <= max; i++) arr.push(i);
    const cur = parseInt(curDisp||'0') || 0;
    _wheelCtx = {
      li, si, field, isWeight:false,
      cols:[
        { values: arr, idx: Math.max(0, Math.min(max, cur)), label:'Wdh', fmt: v => String(v) }
      ]
    };
  }
  _wheelCtx.typed = null;
  renderWheel();
  // Direkt-Eingabe vorbereiten: aktuellen Wert vorbelegen, Einheit anzeigen
  const tIn = document.getElementById('wheel-typein');
  const tUnit = document.getElementById('wheel-typein-unit');
  if (tUnit) tUnit.textContent = isW ? unitLabel() : 'Wdh';
  if (tIn) {
    const v = _wheelDispVal();
    tIn.value = v ? String(v).replace('.', ',') : '';
  }
  openOv('ov-wheel');
}
function renderWheel() {
  const wrap = document.getElementById('wheel-wrap');
  wrap.innerHTML = _wheelCtx.cols.map((c, ci) => {
    const items = c.values.map((v, vi) =>
      `<div class="wheel-item${vi===c.idx?' center':''}" data-vi="${vi}">${c.fmt(v)}</div>`).join('');
    // Padding oben und unten, damit Werte mittig erscheinen können (88px = (220-44)/2)
    return `<div style="flex:1;max-width:160px">
      <div class="wheel-col">
        <div class="wheel-center"></div>
        <div class="wheel-list" id="wheel-list-${ci}" data-ci="${ci}">
          <div style="height:88px"></div>
          ${items}
          <div style="height:88px"></div>
        </div>
      </div>
      <div class="wheel-label">${c.label}</div>
    </div>`;
  }).join('');
  // Scroll-Listener einrichten — JS-basiert mit Inertia + Snap nach Stillstand,
  // damit sich die Walze beim Loslassen flüssig austrudelt (statt sofortigem Snap).
  setTimeout(() => {
    _wheelCtx.cols.forEach((c, ci) => {
      const list = document.getElementById('wheel-list-'+ci);
      if (!list) return;
      list.scrollTo({top: c.idx * 44, behavior: 'auto'});
      let snapTimer = null;
      let isTouching = false;
      let scrollEndPoll = null;
      let lastTop = list.scrollTop;
      let stillCount = 0;
      let _pcRaf = null;

      const updateHighlight = () => {
        const idx = Math.max(0, Math.min(c.values.length-1, Math.round(list.scrollTop / 44)));
        if (idx !== c.idx) {
          c.idx = idx;
          list.querySelectorAll('.wheel-item').forEach((el,i) => el.classList.toggle('center', i === idx));
          hapticTick();
          // Nutzer dreht am Rad → getippter Wert verwirft sich, Eingabefeld folgt
          if (_wheelCtx) _wheelCtx.typed = null;
          _syncTypeInDisplay();
          if (_wheelCtx?.isWeight) {
            cancelAnimationFrame(_pcRaf);
            _pcRaf = requestAnimationFrame(() => _renderPlateCalc(false));
          }
        }
      };

      const snapToCenter = () => {
        const idx = Math.max(0, Math.min(c.values.length-1, Math.round(list.scrollTop / 44)));
        const target = idx * 44;
        if (Math.abs(list.scrollTop - target) > 0.5) {
          list.scrollTo({top: target, behavior: 'smooth'});
        }
        c.idx = idx;
        hapticSelEnd(); // Rad steht still → Selection-Session beenden
      };

      const startScrollEndPoll = () => {
        if (scrollEndPoll) return;
        lastTop = list.scrollTop;
        stillCount = 0;
        scrollEndPoll = setInterval(() => {
          if (isTouching) { stillCount = 0; lastTop = list.scrollTop; return; }
          if (Math.abs(list.scrollTop - lastTop) < 0.5) {
            stillCount++;
            if (stillCount >= 3) {  // 3×80ms = ~240ms ohne Bewegung → snap
              clearInterval(scrollEndPoll);
              scrollEndPoll = null;
              snapToCenter();
            }
          } else {
            stillCount = 0;
            lastTop = list.scrollTop;
          }
        }, 80);
      };

      list.addEventListener('scroll', () => {
        updateHighlight();
        startScrollEndPoll();
      }, {passive: true});

      list.addEventListener('touchstart', () => { isTouching = true; hapticSelStart(); }, {passive: true});
      list.addEventListener('touchend',   () => { isTouching = false; startScrollEndPoll(); }, {passive: true});
      list.addEventListener('touchcancel',() => { isTouching = false; startScrollEndPoll(); }, {passive: true});
      // Pointer für Maus / Desktop
      list.addEventListener('pointerdown', () => { isTouching = true; hapticSelStart(); }, {passive: true});
      window.addEventListener('pointerup',   () => { isTouching = false; startScrollEndPoll(); }, {passive: true});
    });
    _renderPlateCalc();
  }, 30);
}
// Aktueller Anzeigewert (Rad oder getippt) in Anzeige-Einheit
function _wheelDispVal() {
  const c = _wheelCtx;
  if (!c) return 0;
  if (c.typed != null) return c.typed;
  if (c.isWeight) return (c.cols[0].values[c.cols[0].idx] || 0) + (c.cols[1].values[c.cols[1].idx] || 0);
  return c.cols[0].values[c.cols[0].idx] || 0;
}
// Rad-Position ohne Scroll-Listener-Nebenwirkung setzen
function _wheelSetIdx(ci, idx) {
  const c = _wheelCtx?.cols[ci]; if (!c) return;
  c.idx = idx;
  const list = document.getElementById('wheel-list-' + ci);
  if (list) {
    list.scrollTo({ top: idx * 44, behavior: 'auto' });
    list.querySelectorAll('.wheel-item').forEach((el, i) => el.classList.toggle('center', i === idx));
  }
}
// Eingabefeld an aktuelle Rad-Position angleichen (nicht während aktivem Tippen)
function _syncTypeInDisplay() {
  const inp = document.getElementById('wheel-typein');
  if (!inp || !_wheelCtx) return;
  if (document.activeElement === inp) return;
  const v = _wheelDispVal();
  inp.value = v ? String(v).replace('.', ',') : '';
}
// Direkt eingetippter Wert → Rad nachführen + Scheiben-Rechner aktualisieren
function wheelTypeIn(raw) {
  const c = _wheelCtx; if (!c) return;
  const s = String(raw).replace(',', '.').trim();
  if (s === '') { c.typed = null; return; }
  let n = parseFloat(s);
  if (isNaN(n) || n < 0) { c.typed = null; return; }
  c.typed = n;
  if (c.isWeight) {
    const maxV = c.cols[0].values.length - 1;
    _wheelSetIdx(0, Math.max(0, Math.min(maxV, Math.floor(n))));
    const fracVal = Math.round((n - Math.floor(n)) * 100) / 100;
    let fi = 0, best = 1e9;
    c.cols[1].values.forEach((fv, i) => { const d = Math.abs(fv - fracVal); if (d < best) { best = d; fi = i; } });
    _wheelSetIdx(1, fi);
    _renderPlateCalc(false);
  } else {
    const maxV = c.cols[0].values.length - 1;
    _wheelSetIdx(0, Math.max(0, Math.min(maxV, Math.round(n))));
  }
}
function confirmWheel() {
  if (!_wheelCtx) { closeOv('ov-wheel'); return; }
  const { li, si, field, cols, isWeight } = _wheelCtx;
  let value;
  if (isWeight) {
    const disp = _wheelCtx.typed != null ? _wheelCtx.typed
               : (cols[0].values[cols[0].idx] + cols[1].values[cols[1].idx]);
    value = disp ? Number(dispToKg(disp)) : '';
  } else {
    const reps = _wheelCtx.typed != null ? Math.round(_wheelCtx.typed) : cols[0].values[cols[0].idx];
    value = String(reps);
  }
  wkLogs[li].sets[si][field] = value === 0 ? '' : (field === 'r' ? String(value) : value);
  // Das Rad schliesst sich, und dahinter steht eine neue Zahl. Ohne ein
  // Zeichen am Feld selbst ist nicht zu sehen, WO sie gelandet ist — bei vier
  // gleich aussehenden Zeilen ist das eine echte Frage. Der Ring am Feld
  // beantwortet sie und verschwindet von allein.
  _wkWert = { li: li, si: si, field: field, ts: Date.now() };
  // HIER meldet sich der Coach NICHT — weder mit der Vorschlagskarte
  // (_coachEval) noch mit dem Kurzkommentar (_coachMicroReact). Gewicht und
  // Wiederholungen sind an dieser Stelle nur EINGETRAGEN; wer beim naechsten
  // Satz schon das Gewicht aendert, hat ihn noch nicht gemacht. Der Kommentar
  // kam dann zu einem Satz, der noch gar nicht gelaufen war.
  // Beides haengt jetzt ausschliesslich am Haekchen (toggleSetDone) —
  // Aufwaermsaetze eingeschlossen, die werden mit abgehakt.
  if (typeof haptic === 'function') haptic(12);
  closeOv('ov-wheel');
  // PR-Feier NICHT hier — erst wenn der Satz per Häkchen bestätigt wird (toggleSetDone).
  renderLogCards();
}

/* ── PLATE CALCULATOR ───────────────────────────────────
   Zeigt unter dem Gewichts-Wheel live, welche Scheiben pro
   Seite auf die Langhantel müssen. Stangengewicht wählbar. */
const PC_PLATES_KG  = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5];
const PC_PLATES_LBS = [45, 35, 25, 10, 5, 2.5];
// Verfügbare Scheiben im Studio (lokal, nicht in Cloud). Default: alle vorhanden.
function _allPlates() { return S.unitMode === 'lbs' ? PC_PLATES_LBS : PC_PLATES_KG; }
function _plateUnitKey() { return S.unitMode === 'lbs' ? 'lbs' : 'kg'; }
function _availPlates() {
  const all = _allPlates();
  const sel = S.availablePlates && S.availablePlates[_plateUnitKey()];
  if (!Array.isArray(sel)) return all;                 // nichts gewählt → alle
  const filtered = all.filter(p => sel.includes(p));
  return filtered.length ? filtered : all;             // nie komplett leer
}
function togglePlate(p) {
  const u = _plateUnitKey();
  if (!S.availablePlates) S.availablePlates = {};
  if (!Array.isArray(S.availablePlates[u])) S.availablePlates[u] = _allPlates().slice();
  const i = S.availablePlates[u].indexOf(p);
  if (i < 0) S.availablePlates[u].push(p); else S.availablePlates[u].splice(i, 1);
  persist();
  hapticTick();
  _renderPlatesSheet();
  _renderPlateCalc(false);
}
function resetPlates() {
  const u = _plateUnitKey();
  if (S.availablePlates) delete S.availablePlates[u];
  persist();
  hapticTick();
  _renderPlatesSheet();
  _renderPlateCalc(false);
}
function openPlatesSheet() { _renderPlatesSheet(); openOv('ov-plates'); haptic(8); }
function _renderPlatesSheet() {
  const host = document.getElementById('plates-grid');
  if (!host) return;
  const u = _plateUnitKey();
  const sel = (S.availablePlates && Array.isArray(S.availablePlates[u])) ? S.availablePlates[u] : _allPlates();
  const fmtP = v => String(v).replace('.', ',');
  host.innerHTML = _allPlates().map(p =>
    `<button type="button" class="plate-chip${sel.includes(p) ? ' on' : ''}" onclick="togglePlate(${p})">${fmtP(p)}<br><span style="font-size:9px;opacity:.8">${u}</span></button>`
  ).join('');
}
function _pcBars() { return S.unitMode === 'lbs' ? [45, 35, 0] : [20, 15, 10, 0]; }
function _pcCurBar() {
  const bars = _pcBars();
  return bars.includes(S.plateBar) ? S.plateBar : bars[0];
}
function pcSetBar(b) {
  S.plateBar = b;
  persist();
  hapticTick();
  _renderPlateCalc(true);
}
function _wheelCurDisp() {
  const c = _wheelCtx;
  if (!c || !c.isWeight) return 0;
  return (c.cols[0].values[c.cols[0].idx] || 0) + (c.cols[1].values[c.cols[1].idx] || 0);
}
function _renderPlateCalc(withSeg) {
  const box = document.getElementById('plate-calc');
  if (!box) return;
  if (!_wheelCtx || !_wheelCtx.isWeight) { box.style.display = 'none'; return; }
  const _pcEx = _wheelCtx.li != null ? exById(wkLogs[_wheelCtx.li]?.exerciseId) : null;
  if (_pcEx && !_pcEx.showPlateCalc) { box.style.display = 'none'; return; }
  box.style.display = '';
  if (withSeg !== false) {
    const seg = document.getElementById('pc-bar-seg');
    const cur = _pcCurBar();
    if (seg) seg.innerHTML = _pcBars().map(b =>
      `<button class="${b === cur ? 'on' : ''}" onclick="pcSetBar(${b})">${b === 0 ? 'ohne' : b}</button>`).join('');
  }
  const out = document.getElementById('pc-plates');
  if (!out) return;
  const fmtP = v => String(v).replace('.', ',');
  const total = _wheelCurDisp();
  const bar = _pcCurBar();
  const u = unitLabel();
  if (!total) { out.innerHTML = '<span class="pc-msg">Wähle ein Gewicht …</span>'; return; }
  if (bar > 0 && total < bar) {
    out.innerHTML = `<span class="pc-msg">Leichter als die ${bar}-${u}-Stange — Kurzhantel oder Maschine?</span>`;
    return;
  }
  const perSide = (total - bar) / 2;
  if (perSide <= 0) { out.innerHTML = '<span class="pc-msg">Nur die Stange — keine Scheiben nötig</span>'; return; }
  const plates = _availPlates();
  const counts = new Map();
  let rest = perSide;
  plates.forEach(p => { while (rest >= p - 1e-9) { counts.set(p, (counts.get(p) || 0) + 1); rest -= p; } });
  rest = Math.round(rest * 100) / 100;
  out.innerHTML =
    [...counts].map(([p, n]) => `<span class="pc-plate${p < 5 ? ' sm' : ''}">${n > 1 ? n + '×' : ''}${fmtP(p)}</span>`).join('') +
    (rest > 0 ? `<span class="pc-rest">+ ${fmtP(rest)} ${u} pro Seite nicht steckbar (kleinste Scheibe ${fmtP(plates[plates.length - 1])} ${u})</span>` : '');
}

/* ── SUPERSET ───────────────────────────────────────────
   Zwei benachbarte Übungen koppeln: im Wechsel ausführen,
   die Satzpause startet erst, wenn beide Übungen den Satz
   mit gleicher Nummer abgehakt haben. */
function toggleSuperset() {
  const li = _exEditLi;
  if (li == null) return;
  const log = wkLogs[li];
  if (!log) return;
  if (log.ssGroup) {
    const g = log.ssGroup;
    wkLogs.forEach(l => { if (l.ssGroup === g) delete l.ssGroup; });
    _dndToast('Superset gelöst');
  } else {
    const nx = wkLogs[li + 1];
    if (!nx || nx.ssGroup) return;
    const g = 'ss' + Date.now();
    log.ssGroup = g;
    nx.ssGroup = g;
    _dndToast('Superset erstellt');
  }
  haptic(12);
  closeOv('ov-ex-edit');
  renderLogCards();
}

// ── ÜBUNG IM TRAINING BEARBEITEN (umbenennen / ersetzen) ──
let _exEditLi = null;
function openExEditMenu(li) {
  _exEditLi = li;
  const log = wkLogs[li]; if (!log) return;
  const ex = exById(log.exerciseId); if (!ex) return;
  document.getElementById('ex-edit-title').textContent = ex.name;
  document.getElementById('ex-edit-name').value = log._overrideName || ex.name;
  // Superset-Button konfigurieren
  const ssSec = document.getElementById('ss-section');
  const ssBtn = document.getElementById('ss-btn');
  const ssHint = document.getElementById('ss-hint');
  const _exDispName = l => l._overrideName || exById(l.exerciseId)?.name || 'Übung';
  if (log.ssGroup) {
    ssSec.style.display = '';
    ssBtn.textContent = 'Superset lösen';
    const partner = wkLogs.find((l, i) => i !== li && l.ssGroup === log.ssGroup);
    ssHint.textContent = partner ? `Gekoppelt mit „${_exDispName(partner)}"` : '';
  } else if (li < wkLogs.length - 1 && !wkLogs[li + 1].ssGroup) {
    ssSec.style.display = '';
    ssBtn.textContent = `🔗 Superset mit „${_exDispName(wkLogs[li + 1])}"`;
    ssHint.textContent = 'Beide Übungen im Wechsel — die Pause startet erst, wenn beide ihren Satz beendet haben.';
  } else {
    ssSec.style.display = 'none';
  }
  // Wdh-Bereich-Editor: bei Zeit-Übungen ausblenden
  const rrBox = document.getElementById('ex-edit-reprange');
  if (ex.targetType === 'time') {
    rrBox.style.display = 'none';
  } else {
    rrBox.style.display = '';
    const { min, max } = repRange(ex);
    _rrEdit = { sets: ex.targetSets || 3, min, max };
    _renderRepRange();
  }
  openOv('ov-ex-edit');
}

// ── ÜBUNG TAUSCHEN (Schnell-Ersetzen) ──
// Direkt von der Übungskarte aus erreichbar (⇄) ODER aus dem Bearbeiten-Sheet.
// Behält Position + bereits eingetragene Sätze, tauscht nur die Übung aus.
function openExSwap(li) {
  if (li == null || !wkLogs[li]) return;
  _exEditLi = li;
  const ex = exById(wkLogs[li].exerciseId);
  const t = document.getElementById('ex-swap-title');
  if (t) t.textContent = ex ? `„${ex.name}" tauschen` : 'Übung tauschen';
  const s = document.getElementById('ex-swap-search');
  if (s) s.value = '';
  closeOv('ov-ex-edit');           // falls aus dem Bearbeiten-Sheet geöffnet
  renderExSwapList('');
  openOv('ov-ex-swap');
}
function renderExSwapList(query) {
  const list = document.getElementById('ex-swap-list');
  if (list == null || _exEditLi == null || !wkLogs[_exEditLi]) return;
  const curId   = wkLogs[_exEditLi].exerciseId;
  const usedIds = wkLogs.map(l => l.exerciseId);
  const q = _normSearch(query || '');
  const items = S.exercises
    .filter(other => other.id !== curId)
    .filter(other => !q || _normSearch(other.name).includes(q))
    .map(other => {
      const inUse = usedIds.includes(other.id);
      return `<div class="row tap${inUse?' is-disabled':''}" onclick="${inUse?'':`replaceExInWorkout('${other.id}')`}">
        <div class="row-body">
          <div class="row-title">${esc(other.name)}${inUse?' <span style="color:var(--text2);font-size:11px">(schon im Training)</span>':''}</div>
          <div class="row-sub">${other.muscleGroup ? muscleLabel(other.muscleGroup) : ''}</div>
        </div>
        <div class="chev">›</div>
      </div>`;
    });
  list.innerHTML = items.join('') ||
    '<div style="padding:16px;text-align:center;color:var(--text2);font-size:13px">Keine passende Übung gefunden.</div>';
}
let _rrEdit = { sets:3, min:8, max:12 };
function _renderRepRange() {
  document.getElementById('rr-sets').textContent = _rrEdit.sets;
  document.getElementById('rr-min').textContent  = _rrEdit.min;
  document.getElementById('rr-max').textContent  = _rrEdit.max;
}
function rrAdjust(which, delta) {
  if (which === 'sets') _rrEdit.sets = Math.max(1, Math.min(20, _rrEdit.sets + delta));
  if (which === 'min')  _rrEdit.min  = Math.max(1, Math.min(100, _rrEdit.min + delta));
  if (which === 'max')  _rrEdit.max  = Math.max(1, Math.min(100, _rrEdit.max + delta));
  // Min/Max konsistent halten
  if (_rrEdit.min > _rrEdit.max) {
    if (which === 'min') _rrEdit.max = _rrEdit.min;
    else _rrEdit.min = _rrEdit.max;
  }
  hapticTick();
  _renderRepRange();
}
function applyRepRange() {
  if (_exEditLi == null) return;
  const log = wkLogs[_exEditLi]; if (!log) return;
  const ex = exById(log.exerciseId); if (!ex) return;
  ex.targetSets = _rrEdit.sets;
  ex.repMin = _rrEdit.min;
  ex.repMax = _rrEdit.max;
  ex.targetReps = _rrEdit.max; // Ziel = oberes Ende (Kompatibilität)
  ex.targetSetsAt = Date.now(); // s. buildPlannedSets: neues Ziel schlägt die Kopie der letzten Einheit
  persist();
  syncTargetToActiveWk(ex.id);
  haptic && haptic(8);
  closeOv('ov-ex-edit');
  renderLogCards();
}
