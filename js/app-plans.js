function applyExRename() {
  if (_exEditLi == null) return;
  const log = wkLogs[_exEditLi]; if (!log) return;
  const ex = exById(log.exerciseId); if (!ex) return;
  const newName = (document.getElementById('ex-edit-name').value || '').trim();
  if (!newName) { alert('Name darf nicht leer sein.'); return; }
  if (newName === ex.name) {
    delete log._overrideName;
  } else {
    log._overrideName = newName;
    // außerdem: die Original-Übung umbenennen (User-Erwartung: dauerhaft)
    ex.name = newName;
    persist();
  }
  closeOv('ov-ex-edit');
  renderLogCards();
}
function replaceExInWorkout(newExId) {
  if (_exEditLi == null) return;
  const log = wkLogs[_exEditLi]; if (!log) return;
  const newEx = exById(newExId); if (!newEx) return;
  // Behalte bisher geloggte Werte, aber wechsle die exerciseId
  log.exerciseId = newExId;
  delete log._overrideName;
  // Suggested Werte neu berechnen
  const sw = getSuggestedWeight(newEx);
  log.sugW = sw != null ? String(sw) : '';
  log.sugR = String(newEx.targetReps);
  closeOv('ov-ex-swap');
  closeOv('ov-ex-edit');
  haptic(12);
  _dndToast('Übung getauscht');
  renderLogCards();
}

// ── CUSTOM SPLITS ─────────────────────────────────────
let _csEdit = null; // {id?, label, groups:[{id,label,muscles:[]}]}
const ALL_MUSCLES = [
  { id:'brust', label:'Brust' },
  { id:'ruecken', label:'Rücken' },
  { id:'schultern', label:'Schultern' },
  { id:'arme', label:'Arme' },
  { id:'beine', label:'Beine' },
  { id:'core', label:'Core' }
];
if (GT_LANG === 'en') {
  const _AM_EN = { brust:'Chest', ruecken:'Back', schultern:'Shoulders', arme:'Arms', beine:'Legs', core:'Core' };
  ALL_MUSCLES.forEach(m => m.label = _AM_EN[m.id] || m.label);
}
function openCustomSplitNew() {
  _csEdit = { label:'', groups:[ { id: uid(), label:'', muscles:[] } ] };
  document.getElementById('cs-title').textContent = 'Eigener Split';
  document.getElementById('cs-name').value = '';
  document.getElementById('cs-delete-btn').style.display = 'none';
  renderCsGroups();
  openOv('ov-custom-split');
}
function openCustomSplitEdit(splitId) {
  const s = (S.customSplits||[]).find(s => s.id === splitId);
  if (!s) return;
  _csEdit = JSON.parse(JSON.stringify(s));
  document.getElementById('cs-title').textContent = 'Split bearbeiten';
  document.getElementById('cs-name').value = _csEdit.label || '';
  document.getElementById('cs-delete-btn').style.display = '';
  renderCsGroups();
  openOv('ov-custom-split');
}
function csAddGroup() {
  _csEdit.groups.push({ id: uid(), label:'', muscles:[] });
  renderCsGroups();
}
function csPreset(kind) {
  const G = (label, muscles) => ({ id: uid(), label, muscles });
  const presets = {
    ppl: { name:'Push / Pull / Legs', groups:[
      G('Push', ['brust','schultern','arme']),
      G('Pull', ['ruecken','arme']),
      G('Legs', ['beine','core']),
    ]},
    oberunter: { name:'Ober- / Unterkörper', groups:[
      G('Oberkörper', ['brust','ruecken','schultern','arme']),
      G('Unterkörper', ['beine','core']),
    ]},
    gk: { name:'Ganzkörper', groups:[
      G('Ganzkörper', ['brust','ruecken','schultern','arme','beine','core']),
    ]},
  };
  const p = presets[kind]; if (!p) return;
  _csEdit.groups = JSON.parse(JSON.stringify(p.groups));
  const nameInp = document.getElementById('cs-name');
  if (nameInp && !nameInp.value.trim()) nameInp.value = p.name;
  renderCsGroups();
}
function csDelGroup(gid) {
  _csEdit.groups = _csEdit.groups.filter(g => g.id !== gid);
  if (!_csEdit.groups.length) _csEdit.groups.push({ id: uid(), label:'', muscles:[] });
  renderCsGroups();
}
function csSetGroupLabel(gid, val) {
  const g = _csEdit.groups.find(g => g.id === gid); if (!g) return;
  g.label = val;
}
function csToggleMuscle(gid, mid) {
  const g = _csEdit.groups.find(g => g.id === gid); if (!g) return;
  const i = g.muscles.indexOf(mid);
  if (i < 0) g.muscles.push(mid); else g.muscles.splice(i,1);
  renderCsGroups();
}
function renderCsGroups() {
  document.getElementById('cs-groups').innerHTML = _csEdit.groups.map((g,gi) => `
    <div style="background:var(--inp-bg);border:1px solid var(--gl-bdr);border-radius:14px;padding:12px">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <input class="f-in" type="text" value="${esc(g.label||'')}" placeholder="Gruppen-Name (z.B. Push A)"
          oninput="csSetGroupLabel('${g.id}', this.value)" style="flex:1">
        <button class="btn btn-danger btn-sm" onclick="csDelGroup('${g.id}')" style="flex:0;padding:8px 12px">−</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${ALL_MUSCLES.map(m =>
          `<button type="button" class="icat${g.muscles.includes(m.id)?' on':''}" onclick="csToggleMuscle('${g.id}','${m.id}')">${m.label}</button>`
        ).join('')}
      </div>
    </div>
  `).join('');
}
function saveCustomSplit() {
  const name = (document.getElementById('cs-name').value || '').trim();
  if (!name) { alert('Bitte gib dem Split einen Namen.'); return; }
  const groups = _csEdit.groups
    .filter(g => (g.label||'').trim() && g.muscles.length)
    .map(g => ({ id: g.id, label: g.label.trim(), muscles: g.muscles.slice() }));
  if (!groups.length) { alert('Mindestens eine Gruppe mit Muskeln benötigt.'); return; }

  if (_csEdit.id) {
    const idx = S.customSplits.findIndex(s => s.id === _csEdit.id);
    if (idx >= 0) S.customSplits[idx] = { id:_csEdit.id, label:name, groups };
  } else {
    const id = 'cs_' + uid();
    S.customSplits.push({ id, label:name, groups });
    S.exFilterMode = id;
  }
  persist();
  closeOv('ov-custom-split');
  if (typeof renderExList === 'function') renderExList();
  if (typeof renderWkFilterBar === 'function') renderWkFilterBar();
}
function deleteCustomSplit() {
  if (!_csEdit || !_csEdit.id) return;
  if (!confirm('Diesen Split wirklich löschen?')) return;
  S.customSplits = S.customSplits.filter(s => s.id !== _csEdit.id);
  if (S.exFilterMode === _csEdit.id) S.exFilterMode = 'muskel';
  if (S.wkFilterMode === _csEdit.id) S.wkFilterMode = 'muskel';
  persist();
  closeOv('ov-custom-split');
  if (typeof renderExList === 'function') renderExList();
  if (typeof renderWkFilterBar === 'function') renderWkFilterBar();
}

function renderWeekPreview() {
  const el = document.getElementById('ex-week-strip');
  if (!el) return;
  const tk = todayKey();
  el.innerHTML = DAYS.map(d => {
    const s = planSummary(d.key);
    const cls = ['wk-cell'];
    if (d.key === tk) cls.push('today');
    let inner, style = '';
    if (!s.empty) {
      cls.push('assigned');
      const col = s.color || '#0A84FF';
      const isHex = typeof col === 'string' && col.startsWith('#');
      // --sc = Split-Farbe als Variable (wie bei .split-card). Nur dadurch kann die
      // Neon-Probe in css/app.css (Block "NEON-PROBE") den Schein faerben.
      /* Auf hellem Grund lag die 14-%-Volltoenung praktisch auf derselben
         Helligkeit wie der Grund daneben — die Zelle "lag auf nichts", und der
         Split-Name darin verlor zusaetzlich Kontrast. Hell bekommt deshalb eine
         weisse Basis mit Farbhauch darauf und einen deutlich staerkeren Rand:
         die Zelle traegt ihre Farbe im RAND, nicht in der Flaeche.
         --sc-ink ist dieselbe Farbe geklemmt — daran haengt der Schein im
         Neon-Block (css/app.css), der sonst als grauer Schmutzrand erschien. */
      const hell = _neonHell();
      const tint = c => `linear-gradient(${c},${c})`;   // Farbschicht ueber der Basis
      const flaeche = isHex
        ? (hell ? `${tint(_rgba(col, 0.09))},rgba(255,255,255,.62)` : _rgba(col, 0.14))
        : 'rgba(var(--acc-rgb),.12)';
      style = `--sc:${col};--sc-ink:${_neonInk(col)};background:${flaeche};border-color:${isHex?_rgba(col, hell?0.85:0.5):'var(--acc)'}`;
      inner = `<div class="wk-cell-l" style="color:${_neonInk(col)}">${esc(s.badge||'Plan')}</div>`;
    } else {
      inner = `<div class="wk-cell-dot"></div><div class="wk-cell-l empty">Frei</div>`;
    }
    return `<button type="button" class="${cls.join(' ')}" data-daykey="${d.key}" style="${style}" onclick="openDayAssign('${d.key}')">
      <div class="wk-cell-d">${d.short.toUpperCase()}</div>${inner}</button>`;
  }).join('');
  const hint = document.getElementById('ex-week-hint');
  if (hint) hint.style.display = (S.workoutPresets && S.workoutPresets.length) ? '' : 'none';
}

// Karten der Splits im Übungen-Tab (Hauptfokus)
function renderSplitList() {
  const el = document.getElementById('ex-splits');
  if (!el) return;
  const presets = S.workoutPresets || [];
  if (!presets.length) {
    el.innerHTML = `<div class="split-empty">
      <h3>Erstelle deinen ersten Split</h3>
      <p>Ein Split bündelt Übungen zu einem Trainingstag – z. B. „Oberkörper 1" oder „Push". Tippe auf <b>＋ Split</b>, wähle Übungen und Wochentage.</p>
    </div>`;
    return;
  }
  el.innerHTML = presets.map(p => {
    const col   = splitColor(p);
    const cnt   = _presetExIdsExisting(p).length;
    const days  = presetDays(p.id);
    const mono  = (p.name || '?').trim().charAt(0).toUpperCase() || '•';
    const pills = days.map(k => `<span class="split-day-pill" style="background:${_rgba(col,.16)};color:${_neonInk(col)}">${dayByKey(k).short}</span>`).join('');
    return `<div class="split-card" style="--sc:${col}">
      <div class="split-grab" onmousedown="splitPresetDragStart(event,'${p.id}')" ontouchstart="splitPresetDragStart(event,'${p.id}')">⠿</div>
      <div class="split-mono" style="background:${col}">${esc(mono)}</div>
      <div class="split-main" onclick="openPresetEdit('${p.id}')">
        <div class="split-name">${esc(p.name)}</div>
        <div class="split-meta">${cnt} Übung${cnt!==1?'en':''}${days.length?`<span class="split-days">${pills}</span>`:''}</div>
      </div>
      <button class="split-edit" onclick="event.stopPropagation();openPresetEdit('${p.id}')" aria-label="Split bearbeiten">✎</button>
      <button class="split-play" style="background:${col}" onclick="event.stopPropagation();startPresetDirect('${p.id}')" aria-label="Split starten">▶</button>
    </div>`;
  }).join('');
}

let _exDbOpen = false;
function toggleExDb() {
  _exDbOpen = !_exDbOpen;
  const db = document.getElementById('ex-db');
  const body = document.getElementById('ex-db-body');
  if (db) db.classList.toggle('open', _exDbOpen);
  if (body) body.style.display = _exDbOpen ? '' : 'none';
  haptic(6);
}

// ── NEW / EDIT EXERCISE ───────────────────────────────
let selExDays = []; // Wochentage, die im Übung-Modal ausgewählt sind
let selShowPlates = false;

function openNewEx(exId) {
  editId = exId;
  selEmoji  = '';
  selMuscle = '';
  selExDays = [];
  selExType = 'reps';
  selScheme = 'straight';
  selShowPlates = false;
  selExImg = null;
  document.getElementById('in-name').value = '';
  document.getElementById('in-sets').value = '3';
  document.getElementById('in-reps-min').value = '8';
  document.getElementById('in-reps').value = '12';
  const psIn = document.getElementById('in-progstep');
  if (psIn) psIn.value = '';
  document.querySelectorAll('.progstep-unit').forEach(u => u.textContent = unitLabel());
  document.getElementById('del-ex-btn').style.display = 'none';
  document.getElementById('ex-sheet-title').textContent = 'Übung hinzufügen';

  if (exId) {
    const ex = exById(exId);
    if (ex) {
      selEmoji  = '';
      selMuscle = ex.muscleGroup || '';
      selExType = ex.targetType || 'reps';
      selScheme = ex.weightScheme || 'straight';
      selShowPlates = ex.showPlateCalc === true;
      selExImg = ex.img || null;
      document.getElementById('in-name').value = ex.name;
      document.getElementById('in-sets').value = ex.targetSets;
      if (selExType === 'time') {
        document.getElementById('in-reps').value = ex.targetReps;
      } else {
        const rr = repRange(ex);
        document.getElementById('in-reps-min').value = rr.min;
        document.getElementById('in-reps').value = rr.max;
        if (psIn) psIn.value = (ex.progStep != null && ex.progStep !== '') ? String(kgToDisp(ex.progStep)) : '';
      }
      document.getElementById('del-ex-btn').style.display = '';
      document.getElementById('ex-sheet-title').textContent = 'Übung bearbeiten';
      selExDays = exerciseDays(exId);
    }
  }
  setExType(selExType);
  renderSchemeSeg();
  renderMusclePicker();
  renderExDayPills();
  const spCb = document.getElementById('in-show-plates');
  if (spCb) spCb.checked = selShowPlates;
  _renderExImgPreview();
  openOv('ov-ex');
}

function renderExDayPills() {
  const el = document.getElementById('ex-day-pills');
  if (!el) return;
  el.innerHTML = DAYS.map(d =>
    `<button type="button" class="day-pill${selExDays.includes(d.key)?' on':''}" onclick="toggleExDay('${d.key}')">${d.short}</button>`
  ).join('');
}
function toggleExDay(k) {
  const i = selExDays.indexOf(k);
  if (i < 0) selExDays.push(k); else selExDays.splice(i, 1);
  renderExDayPills();
}

function renderEmoGrid() {
  const preview = document.getElementById('ex-icon-preview');
  if (preview) {
    if (selEmoji === '') {
      preview.textContent = '–';
      preview.style.opacity = '0.35';
    } else {
      preview.textContent = selEmoji;
      preview.style.opacity = '';
    }
  }
  const noBtn = document.getElementById('no-icon-btn');
  if (noBtn) {
    noBtn.style.borderColor = selEmoji === '' ? 'var(--acc)' : '';
    noBtn.style.color       = selEmoji === '' ? 'var(--acc)' : '';
  }
}
function pickNoIcon() { selEmoji = ''; renderEmoGrid(); }
function pickEmo(e) { selEmoji = e; renderEmoGrid(); }

// ── ÜBUNGS-BILD: auswählen, verkleinern, als Data-URL speichern ──
let selExImg = null;
function onExImgPick(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const max = 220;
      let w = img.width, h = img.height;
      if (w >= h) { if (w > max) { h = Math.round(h * max / w); w = max; } }
      else        { if (h > max) { w = Math.round(w * max / h); h = max; } }
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      selExImg = cv.toDataURL('image/jpeg', 0.6);
      _renderExImgPreview();
    };
    img.onerror = () => alert('Bild konnte nicht geladen werden.');
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
function clearExImg() { selExImg = null; _renderExImgPreview(); }
function _renderExImgPreview() {
  const thumb = document.getElementById('ex-img-thumb');
  const ph    = document.getElementById('ex-img-ph');
  const del   = document.getElementById('ex-img-del');
  if (!thumb) return;
  if (selExImg) {
    thumb.style.backgroundImage = `url(${selExImg})`;
    if (ph)  ph.style.display  = 'none';
    if (del) del.style.display = '';
  } else {
    thumb.style.backgroundImage = '';
    if (ph)  ph.style.display  = '';
    if (del) del.style.display = 'none';
  }
}

function renderMusclePicker() {
  const el = document.getElementById('muscle-picker');
  if (!el) return;

  const secs = [];

  // Muskelgruppen
  secs.push({ title:'Muskelgruppe', opts: MUSCLE_GROUPS.map(g => ({id:g.id, label:g.label})) });

  // Push · Pull · Legs
  const ppl = GROUP_MODES.find(m => m.id === 'ppl');
  if (ppl) secs.push({ title:'Push · Pull · Legs', opts: ppl.groups.filter(g => g.id !== 'alle').map(g => ({id:g.id, label:g.label})) });

  // Ober · Unter
  const ou = GROUP_MODES.find(m => m.id === 'oberunter');
  if (ou) secs.push({ title:'Ober · Unter', opts: ou.groups.filter(g => g.id !== 'alle').map(g => ({id:g.id, label:g.label})) });

  // Eigene Splits
  (S.customSplits || []).forEach(cs => {
    const opts = (cs.groups || []).map(g => ({id:g.id, label:g.label}));
    if (opts.length) secs.push({ title:cs.label, opts });
  });

  el.innerHTML = secs.map(sec =>
    `<div class="mg-split-section">
      <div class="mg-split-section-title">${sec.title}</div>
      <div class="mg-split-chips">
        ${sec.opts.map(opt => `<button class="icat${selMuscle===opt.id?' on':''}" onclick="pickMuscle('${opt.id}')">${esc(opt.label)}</button>`).join('')}
      </div>
    </div>`
  ).join('');
}
function pickMuscle(id) {
  selMuscle = id;
  document.getElementById('muscle-req-hint')?.classList.remove('show');
  renderMusclePicker();
}

function saveEx() {
  const name = document.getElementById('in-name').value.trim();
  if (!name) { alert('Bitte Namen eingeben!'); return; }
  if (!selMuscle) {
    document.getElementById('muscle-req-hint')?.classList.add('show');
    document.getElementById('muscle-picker')?.scrollIntoView({behavior:'smooth',block:'center'});
    return;
  }
  document.getElementById('muscle-req-hint')?.classList.remove('show');
  const sets = parseInt(document.getElementById('in-sets').value)||3;

  // Wiederholungsbereich + Schema (nur bei Wdh-Übungen)
  let reps, repMin = null, repMax = null, scheme = null;
  if (selExType === 'time') {
    reps = parseInt(document.getElementById('in-reps').value)||30;
  } else {
    repMin = parseInt(document.getElementById('in-reps-min').value)||8;
    repMax = parseInt(document.getElementById('in-reps').value)||Math.max(repMin,12);
    if (repMin > repMax) { const t = repMin; repMin = repMax; repMax = t; }
    reps   = repMax;                 // Ziel = oberes Bereich-Ende (Kompatibilität)
    scheme = WEIGHT_SCHEMES.includes(selScheme) ? selScheme : 'straight';
  }
  // Gewichts-Steigerung (Eingabe in Anzeige-Einheit → intern kg). Leer/0 = globaler Standard.
  let progStep = null;
  if (selExType !== 'time') {
    const psRaw = (document.getElementById('in-progstep')?.value || '').replace(',', '.').trim();
    if (psRaw !== '') { const n = dispToKg(parseFloat(psRaw)); if (isFinite(n) && n > 0) progStep = n; }
  }
  const patch = { name, emoji:'', muscleGroup:selMuscle, targetSets:sets, targetReps:reps,
                  targetType:selExType, repMin, repMax, weightScheme:scheme, progStep,
                  showPlateCalc: selExType !== 'time' ? selShowPlates : false,
                  img: selExImg || null,
                  // s. buildPlannedSets: markiert, dass das Satz-/Wdh-Ziel neuer ist als
                  // die letzte Einheit — sonst plant das nächste Training weiter alt.
                  targetSetsAt: Date.now() };

  let savedId;
  if (editId) {
    const ex = exById(editId);
    if (ex) {
      Object.assign(ex, patch);
      // Primär-Muskel geändert → nur Muskel-Modus-Zugehörigkeit neu ableiten,
      // PPL/Ober-Unter/Custom-Memberships bleiben unangetastet.
      ensureExGroups(ex);
      ex.groups.muskel = _deriveGroupIds(ex, modeById('muskel'));
    }
    savedId = editId;
  } else {
    savedId = uid();
    const newEx = { id:savedId, targetWeight:0, ...patch };
    ensureExGroups(newEx); // Zugehörigkeit aus muscleGroup ableiten
    // Wird bei aktivem Gruppen-Filter im Übungen-Tab angelegt → dieser Gruppe zuordnen
    if (exCatFilter && exCatFilter !== 'alle') {
      const mId = currentMode().id;
      if (!newEx.groups[mId].includes(exCatFilter)) newEx.groups[mId].push(exCatFilter);
    }
    S.exercises.push(newEx);
  }
  persist();
  hapticSuccess();
  _indexExercisesSpotlight();
  closeOv('ov-ex');
  renderExList();
  renderHome();

  // Wenn aus aktivem Training heraus aufgerufen → neue Übung direkt hinzufügen
  if (_swapAddPending && !editId) {
    // Aus dem Tausch-Menü → neue Übung ersetzt den getauschten Slot
    _swapAddPending = false;
    if (isWorkoutActive() && _exEditLi != null && wkLogs[_exEditLi]) {
      replaceExInWorkout(savedId);
      openOv('ov-wk');
      updateWkMiniVisibility();
    } else {
      addExToActiveWorkout(savedId);
    }
  } else if (_midAddPending && !editId) {
    _midAddPending = false;
    addExToActiveWorkout(savedId);
  } else if (_presetAddPending && !editId) {
    // Aus dem Plan-Editor heraus → neue Übung direkt im Plan auswählen
    _presetAddPending = false;
    _presetSel.add(savedId);
    openOv('ov-preset');
    renderPresetExList();
  } else {
    _midAddPending = false;
    _presetAddPending = false;
    _swapAddPending = false;
  }
}

// ── EX TYPE TOGGLE ───────────────────────────────────
function setExType(type) {
  selExType = type;
  const repsBtn = document.getElementById('ex-type-reps');
  const timeBtn = document.getElementById('ex-type-time');
  const lbl     = document.getElementById('in-reps-label');
  const minWrap = document.getElementById('rep-min-wrap');
  const schemeRow = document.getElementById('scheme-row');
  if (!repsBtn) return;
  const plateRow = document.getElementById('plate-toggle-row');
  if (type === 'time') {
    repsBtn.classList.remove('on'); timeBtn.classList.add('on');
    if (lbl) lbl.textContent = 'Sek';
    if (minWrap) minWrap.style.display = 'none';
    if (schemeRow) schemeRow.style.display = 'none';
    if (plateRow) plateRow.style.display = 'none';
    const inp = document.getElementById('in-reps');
    if (inp && (inp.value === '10' || inp.value === '12' || !inp.value)) inp.value = '30';
  } else {
    timeBtn.classList.remove('on'); repsBtn.classList.add('on');
    if (lbl) lbl.textContent = 'bis';
    if (minWrap) minWrap.style.display = '';
    if (schemeRow) schemeRow.style.display = '';
    if (plateRow) plateRow.style.display = '';
    const inp = document.getElementById('in-reps');
    if (inp && (inp.value === '30' || !inp.value)) inp.value = '12';
  }
}

// ── GEWICHTS-SCHEMA PICKER ───────────────────────────
function renderSchemeSeg() {
  const seg = document.getElementById('scheme-seg');
  if (!seg) return;
  seg.innerHTML = WEIGHT_SCHEMES.map(k =>
    `<button type="button" class="icat${selScheme===k?' on':''}" onclick="pickScheme('${k}')">${SCHEME_SHORT[k]}</button>`
  ).join('');
  const d = document.getElementById('scheme-desc');
  if (d) d.textContent = SCHEME_DESC[selScheme] || '';
}
function pickScheme(k) {
  selScheme = k;
  haptic(6);
  renderSchemeSeg();
}

// ── TIMER HELPERS ────────────────────────────────────
function fmtSec(s) {
  const sec = Math.max(0, Math.round(s));
  return String(Math.floor(sec/60)).padStart(2,'0') + ':' + String(sec%60).padStart(2,'0');
}

function toggleSetTimer(li, si) {
  const s = wkLogs[li].sets[si];
  const ex = exById(wkLogs[li].exerciseId);
  const target = ex?.targetReps || 0;
  if (s.tRunning) {
    // Pause
    s.tElapsed += Math.floor((Date.now() - s.tStart) / 1000);
    s.tStart = null;
    s.tRunning = false;
    if (!wkLogs.some(l => l.sets.some(ss => ss.tRunning))) {
      clearInterval(setTimerInt); setTimerInt = null;
    }
    renderLogCards();
  } else {
    if (s.done) {
      // Reset
      s.tElapsed = 0; s.done = false;
    }
    s.tStart = Date.now();
    s.tRunning = true;
    if (!setTimerInt) setTimerInt = setInterval(tickSetTimers, 500);
    renderLogCards();
  }
}

function tickSetTimers() {
  let anyRunning = false;
  let needsRender = false;
  wkLogs.forEach((log, li) => {
    const ex = exById(log.exerciseId);
    if (ex?.targetType !== 'time') return;
    log.sets.forEach((s, si) => {
      if (!s.tRunning) return;
      anyRunning = true;
      const elapsed = s.tElapsed + Math.floor((Date.now() - s.tStart) / 1000);
      const target = ex.targetReps || 0;
      const remaining = Math.max(0, target - elapsed);
      const el = document.getElementById(`set-timer-${li}-${si}`);
      if (el) el.querySelector('.set-timer-time').textContent = fmtSec(remaining);
      if (remaining <= 0) {
        s.tRunning = false;
        s.tElapsed = target;
        s.done = true;
        needsRender = true;
      }
    });
  });
  if (needsRender) { renderLogCards(); _syncLiveActivity(); }
  if (!anyRunning) { clearInterval(setTimerInt); setTimerInt = null; }
}

function deleteEx() {
  if (!editId || !confirm('Übung wirklich löschen?')) return;
  S.exercises = S.exercises.filter(e => e.id !== editId);
  S.sessions.forEach(s => { s.logs = s.logs.filter(l => l.exerciseId !== editId); });
  S.sessions = S.sessions.filter(s => s.logs.length > 0);
  persist();
  _statNavStack = []; // Übung weg → Statistik-Drilldown-Kette hinfällig
  _statNavSilent = true; closeOv('ov-ex'); closeOv('ov-det'); _statNavSilent = false;
  renderExList();
  renderHome();
}

// ── SWIPE-TO-DELETE HELPERS ──────────────────────────────
let _swipeActive = null;

function exRowClick(el, exId) {
  const inner = el.closest('.ex-swipe-inner');
  if (inner && inner.classList.contains('swipe-open')) { exCloseSwipe(inner); }
  else { openNewEx(exId); }
}

function exCloseSwipe(inner) {
  inner.style.transform = '';
  inner.classList.remove('swipe-open');
  if (_swipeActive === inner) _swipeActive = null;
}

function deleteExDirect(exId) {
  if (!confirm('Übung wirklich löschen?')) return;
  S.exercises = S.exercises.filter(e => e.id !== exId);
  S.sessions.forEach(s => { s.logs = s.logs.filter(l => l.exerciseId !== exId); });
  S.sessions = S.sessions.filter(s => s.logs.length > 0);
  persist();
  _indexExercisesSpotlight();
  renderExList();
  renderHome();
}

function initExSwipes() {
  document.querySelectorAll('.ex-swipe-wrap').forEach(wrap => {
    const inner = wrap.querySelector('.ex-swipe-inner');
    const row   = wrap.querySelector('.ex-row');
    if (!inner || !row) return;
    let startX, startY, tracking = false, wasOpen = false;

    row.addEventListener('touchstart', e => {
      if (e.target.closest('.ex-drag-handle')) return;
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
        if (_swipeActive && _swipeActive !== inner) exCloseSwipe(_swipeActive);
        _swipeActive = inner;
      } else {
        exCloseSwipe(inner);
      }
    }, {passive:true});
  });
}

// ── EXERCISE DETAIL ───────────────────────────────────
function openDet(exId) {
  detId = exId;
  const ex = exById(exId);
  if (!ex) return;
  document.getElementById('det-title').textContent = (ex.emoji ? ex.emoji+' ' : '')+ex.name;

  const sug = getSuggestion(ex);
  document.getElementById('det-sug').innerHTML = sug
    ? html_sug(sug.type, sug.icon, sug.title, sug.text)
    : '';

  const hist = exHistory(exId);
  renderDetChart(hist);
  renderDet1rmChart(hist);
  render1rmCard(hist);

  const histEl = document.getElementById('det-hist');
  if (!hist.length) {
    histEl.innerHTML = `<div style="padding:14px;color:var(--text2);position:relative;z-index:1">Noch keine Einheiten</div>`;
  } else {
    histEl.innerHTML = [...hist].reverse().slice(0,8).map(h => {
      const d = new Date(h.date);
      const w = maxW(h.sets);
      const totalR = h.sets.reduce((s,set)=>s+(parseInt(set.r)||0),0);
      const e1rm = setsBest1RM(h.sets);
      const clickAttr = h.id ? ` tap" onclick="openSessFromDet('${h.id}')"` : '"';
      return `<div class="row${clickAttr}>
        <div class="row-body">
          <div class="row-title">${d.toLocaleDateString(GT_LOCALE,{weekday:'short',day:'numeric',month:'short'})}</div>
          <div class="row-sub">${h.sets.length} Sätze · Max ${w} kg · ${totalR} Wdh · 1RM ${fmt1RM(e1rm)}</div>
        </div>
        <span class="badge b-acc">${w} kg</span>${h.id ? '<div class="chev">›</div>' : ''}
      </div>`;
    }).join('');
  }
  openOv('ov-det');
}

function render1rmCard(hist) {
  const el = document.getElementById('det-1rm');
  if (!el) return;
  if (!hist.length) { el.innerHTML = ''; return; }
  let best = 0, bestSet = null;
  hist.forEach(h => (h.sets || []).forEach(s => {
    const e = epley1RM(s.w, s.r);
    if (e > best) { best = e; bestSet = { w: s.w, r: s.r, date: h.date }; }
  }));
  const last = hist[hist.length - 1];
  const last1rm = last ? setsBest1RM(last.sets) : 0;
  const delta = best && last1rm ? ((last1rm - best) / best) * 100 : 0;
  const bestSub = bestSet
    ? `aus ${bestSet.r}×${bestSet.w} kg · ${new Date(bestSet.date).toLocaleDateString(GT_LOCALE,{day:'numeric',month:'short',year:'2-digit'})}`
    : '–';
  el.innerHTML = `
    <div class="card" style="padding:16px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;position:relative;z-index:1">
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Geschätztes 1RM</div>
          <div style="font-size:28px;font-weight:700;color:var(--acc);line-height:1.1">${fmt1RM(best)}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:4px">${bestSub}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Letzte</div>
          <div style="font-size:18px;font-weight:700">${fmt1RM(last1rm)}</div>
        </div>
      </div>
    </div>`;
}

function renderDet1rmChart(hist) {
  const canvas = document.getElementById('det-1rm-chart');
  if (det1rmChart) { det1rmChart.destroy(); det1rmChart = null; }
  if (!canvas) return;
  const pts = hist
    .map(h => ({x: new Date(h.date).toLocaleDateString(GT_LOCALE,{day:'numeric',month:'short'}), y: setsBest1RM(h.sets)}))
    .filter(p => p.y > 0);
  if (!pts.length) { canvas.style.display = 'none'; return; }
  canvas.style.display = '';
  const acc = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#007AFF';
  det1rmChart = new Chart(canvas.getContext('2d'), {
    type:'line',
    data:{
      labels: pts.map(p=>p.x),
      datasets:[{
        data: pts.map(p=>p.y),
        ..._glowDs(canvas, acc, pts.length, true)
      }]
    },
    options:{
      responsive:true,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>fmt1RM(c.parsed.y)}}},
      scales:{
        x:{grid:{display:false},ticks:_cXT(pts.length)},
        y:_cYT(v=>v.toFixed(0)+' kg')
      }
    }
  });
}

function renderDetChart(hist) {
  const pts = hist
    .map(h => ({x: new Date(h.date).toLocaleDateString(GT_LOCALE,{day:'numeric',month:'short'}), y: maxW(h.sets)}))
    .filter(p => p.y > 0);
  if (detChart) { detChart.destroy(); detChart = null; }
  if (!pts.length) return;
  const acc = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#007AFF';
  const detCv = document.getElementById('det-chart');
  detChart = new Chart(detCv.getContext('2d'), {
    type:'line',
    data:{
      labels: pts.map(p=>p.x),
      datasets:[{
        data: pts.map(p=>p.y),
        ..._glowDs(detCv, acc, pts.length, true)
      }]
    },
    options:{
      responsive:true,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.parsed.y+' kg'}}},
      scales:{
        x:{grid:{display:false},ticks:_cXT(pts.length)},
        y:_cYT(v=>v+' kg')
      }
    }
  });
}

function editDet() { _statNavStack = []; _statNavSilent = true; closeOv('ov-det'); _statNavSilent = false; setTimeout(()=>openNewEx(detId),80); }
// Aus dem Übungs-Detail eine vergangene Einheit öffnen
function openSessFromDet(sesId) {
  // Kein Rücksprung beim programmatischen Weiter-Navigieren; Kette stattdessen vertiefen
  _statNavSilent = true; closeOv('ov-det'); _statNavSilent = false;
  if (_statNavStack.length) _statNavStack.push('det');
  setTimeout(()=>openSessDetail(sesId),120);
}

// ── STATISTIK ─────────────────────────────────────────
function setsVolume(sets) {
  return sets.reduce((sum, s) => sum + (parseFloat(s.w)||0) * (parseInt(s.r)||0), 0);
}

// ── 1RM (Epley-Formel: w × (1 + r/30)) ────────────────
function epley1RM(weight, reps) {
  const w = parseFloat(weight) || 0;
  const r = parseInt(reps) || 0;
  if (w <= 0 || r <= 0) return 0;
  return w * (1 + r / 30);
}
function setsBest1RM(sets) {
  let best = 0;
  (sets || []).forEach(s => { const e = epley1RM(s.w, s.r); if (e > best) best = e; });
  return best;
}
function exBest1RM(exId) {
  let best = 0;
  exHistory(exId).forEach(h => { const e = setsBest1RM(h.sets); if (e > best) best = e; });
  return best;
}
function fmt1RM(v) {
  if (!v) return '–';
  return v.toFixed(1).replace('.', GT_DEC) + ' kg';
}

function sessionVolume(session, exFilterIds) {
  return session.logs.reduce((sum, l) => {
    if (exFilterIds && !exFilterIds.includes(l.exerciseId)) return sum;
    return sum + setsVolume(l.sets);
  }, 0);
}

function fmtKg(v) {
  if (v >= 1000) return (v/1000).toFixed(1).replace('.', GT_DEC) + ' t';
  return Math.round(v) + ' kg';
}

function dateShort(d) {
  return new Date(d).toLocaleDateString(GT_LOCALE, {day:'numeric', month:'short'});
}

/* ════════════════════════════════════════════════════════════════
   MUSKEL-ERMÜDUNGS-MODUL
   ──────────────────────
   • Berechnet pro Muskel einen Fatigue-Wert (0–100%) aus den Sessions
   • Faktoren: Gewicht × Reps × Satz-Typ-Multiplikator
   • Decay: Half-Life 36 h (nach 36 h ist die Ermüdung halbiert)
   • Fenster: nur Sessions der letzten 7 Tage relevant
   ════════════════════════════════════════════════════════════════ */
const FAT_HALFLIFE_H = 36;
const FAT_WINDOW_H   = 168;            // 7 Tage
const FAT_NORM_LOAD  = 800;            // Normalisierungs-Last für 100% (≈ schwere Trainings-Session pro Muskel)

/* Satz-Typ-Multiplikatoren für die Ermüdung */
function setTypeMul(t) {
  switch ((t || 'normal').toLowerCase()) {
    case 'warmup': return 0.20;   // kaum Ermüdung
    case 'top':    return 1.30;   // schwerster Satz
    /* Backoff zwischen normalem Arbeitssatz und Drop-Satz. Er laeuft mit
       deutlich weniger Gewicht, aber direkt nach dem schwersten Satz der
       Uebung — die Vorermuedung ist der Aufschlag gegenueber 1.00. Weiter
       oben hat er nichts zu suchen: sein Zweck ist gerade, Volumen zu
       sammeln, OHNE die Zeche eines zweiten Maximalsatzes zu zahlen. */
    case 'backoff':return 1.10;
    case 'drop':   return 1.20;   // Drop-Set zerrt mehr
    case 'fail':   return 1.35;   // bis zum Versagen
    default:       return 1.00;   // normaler Arbeitssatz
  }
}

/* Muskel-Definitionen
   - mg: MUSCLE_GROUPS-id für Fallback-Verteilung
   - kw: Schlagworte zum Abgleich gegen Übungsname (lowercase)
   - front/back: Hotspots auf der jeweiligen Ansicht in 0..100 Koordinaten (viewBox 100×160)
*/
const MUSCLES = [
  { id:'chest', label:'Brust', mg:'brust',
    kw:['bank','bench','butterfly','fly','flie','flys','dip','liege','schräg','schraeg','incline','decline','klimm','push-up','pushup','liegestütz','press-up'],
    front:[{cx:37,cy:38,rx:10,ry:7},{cx:63,cy:38,rx:10,ry:7}], back:[] },

  { id:'shoulders_front', label:'Vordere Schulter', mg:'schultern',
    kw:['front-press','vorder','militär','military','arnold','overhead-press','ohp','schulterdrücken','shoulder-press','front-rais','frontheb'],
    front:[{cx:21,cy:28,rx:7.5,ry:6},{cx:79,cy:28,rx:7.5,ry:6}], back:[] },

  { id:'shoulders_side', label:'Seitliche Schulter', mg:'schultern',
    kw:['side-rais','seitheb','lateral','lat-rais','side-lat','upright'],
    front:[{cx:14,cy:30,rx:5,ry:6},{cx:86,cy:30,rx:5,ry:6}],
    back:[{cx:14,cy:30,rx:5,ry:6},{cx:86,cy:30,rx:5,ry:6}] },

  { id:'shoulders_rear', label:'Hintere Schulter', mg:'schultern',
    kw:['rear','hintere','reverse','rev-fly','face-pull','facepull','pull-apart','bent-over-rais','reverse-fly'],
    front:[], back:[{cx:21,cy:29,rx:7,ry:5},{cx:79,cy:29,rx:7,ry:5}] },

  { id:'traps', label:'Trapezius', mg:'ruecken',
    kw:['trap','nacken','shrug','schrug','rack-pull'],
    front:[{cx:50,cy:22,rx:9,ry:3}],
    back:[{cx:50,cy:26,rx:14,ry:6}] },

  { id:'mid_back', label:'Mittlerer Rücken', mg:'ruecken',
    kw:['rhomboid','mittlerer-rücken','mittlerer-ruecken','rud','row','rowing','seated-row','bent-over-row','t-bar','meadows','face-pull','facepull','reverse-fly','rev-fly','pull-apart','retraction'],
    front:[], back:[{cx:50,cy:37,rx:14,ry:7}] },

  { id:'lats', label:'Latissimus', mg:'ruecken',
    kw:['lat','klimmz','klimm','pull-up','pullup','chin','latzug','pulldown','rud','row','rowing','t-bar','seated-row','one-arm','bent-over-row','meadows'],
    front:[], back:[{cx:34,cy:44,rx:9,ry:11},{cx:66,cy:44,rx:9,ry:11}] },

  { id:'lower_back', label:'Unterer Rücken', mg:'ruecken',
    kw:['kreuzheb','deadlift','dead','goodmorn','good-morn','hyperexten','back-exten','rückenstreck'],
    front:[], back:[{cx:50,cy:60,rx:10,ry:6}] },

  { id:'biceps', label:'Bizeps', mg:'arme',
    kw:['biz','bicep','curl','klimm','chin','hammer','konzentr','prediger','preacher','scott'],
    front:[{cx:14,cy:43,rx:4.5,ry:7},{cx:86,cy:43,rx:4.5,ry:7}], back:[] },

  { id:'triceps', label:'Trizeps', mg:'arme',
    kw:['triz','tricep','dip','french','skull','crusher','pushdown','press-down','overhead-ex','kickback','kick-back'],
    front:[], back:[{cx:14,cy:43,rx:4.5,ry:7.5},{cx:86,cy:43,rx:4.5,ry:7.5}] },

  { id:'abs', label:'Bauchmuskeln', mg:'core',
    kw:['bauch','abs','sit-up','situp','crunch','plank','unterarmstütz','beinheb','leg-rais','knee-rais','knie-heb','hollow','dragon','toes-to-bar','v-up'],
    front:[{cx:50,cy:54,rx:6,ry:11}], back:[] },

  { id:'obliques', label:'Schräge Bauchmuskeln', mg:'core',
    kw:['oblique','schräg','side-bend','russian','wood','holzfäll','rotation','seitlich','bicycle','side-plank','side-crunch'],
    front:[{cx:38,cy:55,rx:3,ry:8},{cx:62,cy:55,rx:3,ry:8}], back:[] },

  { id:'glutes', label:'Gesäß', mg:'beine',
    kw:['gluteus','glute','gesäß','po','hip-thrust','thrust','hip-abduct','bridge','b-stand'],
    front:[], back:[{cx:41,cy:71,rx:7,ry:6},{cx:59,cy:71,rx:7,ry:6}] },

  { id:'quads', label:'Quadrizeps', mg:'beine',
    kw:['quad','squat','squad','kniebeug','leg-press','beinpress','beinstreck','leg-exten','extension','front-squat','lunge','ausfall','hack','bulgarian','split-squat','smith','step-up'],
    front:[{cx:42,cy:85,rx:7,ry:13},{cx:58,cy:85,rx:7,ry:13}], back:[] },

  { id:'hamstrings', label:'Beinbeuger', mg:'beine',
    kw:['hamstring','beinbeug','leg-curl','beincurl','rdl','romanian','stiff-leg','stiff-knee','glute-ham','nordic'],
    front:[], back:[{cx:42,cy:88,rx:7,ry:11},{cx:58,cy:88,rx:7,ry:11}] },

  { id:'calves', label:'Waden', mg:'beine',
    kw:['wade','calf','heel','standing-calf','sitting-calf','seated-calf','donkey'],
    front:[], back:[{cx:42,cy:122,rx:5,ry:11},{cx:58,cy:122,rx:5,ry:11}] },
];
if (GT_LANG === 'en') {
  const _MUS_EN = { chest:'Chest', shoulders_front:'Front delts', shoulders_side:'Side delts', shoulders_rear:'Rear delts', traps:'Traps', mid_back:'Mid back', lats:'Lats', lower_back:'Lower back', biceps:'Biceps', triceps:'Triceps', abs:'Abs', obliques:'Obliques', glutes:'Glutes', quads:'Quads', hamstrings:'Hamstrings', calves:'Calves' };
  MUSCLES.forEach(m => m.label = _MUS_EN[m.id] || m.label);
}
const MUSCLES_BY_ID = MUSCLES.reduce((m,x)=>{m[x.id]=x;return m;},{});

/* MUSCLE_GROUP-id → Liste von Muskeln (für Fallback, wenn Übungsname keine Treffer hat) */
const MUSCLES_BY_MG = MUSCLES.reduce((acc, m) => {
  (acc[m.mg] = acc[m.mg] || []).push(m);
  return acc;
}, {});

/* Übung → Verteilung der Last auf Muskeln (Summe = 1.0)
   Heuristik: 1) Schlagwort-Treffer im Namen
              2) Sonst gleichmäßig auf alle Muskeln der Hauptgruppe */
// Kanonische Muskelgruppen (brust/ruecken/beine/arme/schultern/core)
const _CANON_MG = new Set(MUSCLE_GROUPS.map(g => g.id));

/* Löst die kanonischen Muskelgruppen-ids einer Übung robust auf — auch wenn
 ex.muscleGroup fehlt, englisch ist oder eine PPL-/Ober-Unter-/Split-Gruppe.
   Ohne diese Auflösung fielen falsch getaggte Übungen komplett aus der
   Erholungs-Berechnung heraus (Muskel blieb „erholt", letztes Datum veraltet). */
function _resolveMgIds(ex) {
  if (!ex) return [];
  // 1) muscleGroup ist bereits eine kanonische Gruppe
  if (_CANON_MG.has(ex.muscleGroup)) return [ex.muscleGroup];
  // 2) abgeleitete Muskel-Modus-Zugehörigkeit (immer kanonische ids)
  const gm = (ex.groups && Array.isArray(ex.groups.muskel))
    ? ex.groups.muskel.filter(id => _CANON_MG.has(id)) : [];
  if (gm.length) return [...new Set(gm)];
  // 3) muscleGroup ist eine Gruppen-id aus PPL/Ober-Unter/Custom → auf kanonische mg mappen
  if (ex.muscleGroup) {
    for (const m of allModes()) {
      const g = m.groups.find(g => g.id === ex.muscleGroup);
      if (g && g.muscles) {
        const canon = g.muscles.filter(id => _CANON_MG.has(id));
        if (canon.length) return [...new Set(canon)];
      }
    }
  }
  return [];
}

function exerciseMuscleWeights(ex) {
  if (!ex) return {};
  const name = String(ex.name || '').toLowerCase();
  const hits = [];
  for (const m of MUSCLES) {
    if (m.kw.some(k => name.includes(k))) hits.push(m.id);
  }
  if (hits.length) {
    const w = 1 / hits.length;
    return hits.reduce((acc, id) => { acc[id] = w; return acc; }, {});
  }
  // Fallback: kanonische Muskelgruppen robust auflösen → gleichmäßig auf Muskeln verteilen
  const list = _resolveMgIds(ex).flatMap(id => MUSCLES_BY_MG[id] || []);
  if (!list.length) return {};
  const w = 1 / list.length;
  return list.reduce((acc, m) => { acc[m.id] = w; return acc; }, {});
}

/* Heilt eine fehlende/uneindeutige muscleGroup zu einer kanonischen Gruppe, damit
   die Erholung IMMER korrekt zugeordnet wird. Reihenfolge: Namens-Schlagworte →
   Gruppen-/Split-Auflösung. Gibt true zurück, wenn etwas geändert wurde. */
function _healExMuscleGroup(ex) {
  if (!ex || _CANON_MG.has(ex.muscleGroup)) return false;
  // 1) Häufigste Hauptgruppe aus den Namens-Schlagworten
  const name = String(ex.name || '').toLowerCase();
  const tally = {};
  for (const m of MUSCLES) if (m.kw.some(k => name.includes(k))) tally[m.mg] = (tally[m.mg] || 0) + 1;
  let best = null, bestN = 0;
  for (const mg in tally) if (tally[mg] > bestN) { best = mg; bestN = tally[mg]; }
  // 2) Sonst über Gruppen-/Split-Zugehörigkeit auflösen
  if (!best) best = _resolveMgIds(ex)[0] || null;
  if (!best || best === ex.muscleGroup) return false;
  ex.muscleGroup = best;
  ensureExGroups(ex);
  ex.groups.muskel = _deriveGroupIds(ex, modeById('muskel'));
  return true;
}

/* Last eines einzelnen Satzes (in kg-reps-Äquivalent) */
function setLoad(s) {
  const w = parseFloat(s.w) || 0;
  const r = parseInt(s.r)  || 0;
  if (!w || !r) return 0;
  return w * r * setTypeMul(s.type);
}

/* Implizites Körpergewicht für gewichtslose Sätze (Bodyweight-Übungen).
   Nimmt das zuletzt geloggte Körpergewicht, sonst Default. */
function _impliedBodyweight() {
  const wl = S.weightLog || [];
  if (wl.length) {
    const last = [...wl].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const w = parseFloat(last && last.weight);
    if (w > 0) return w;
  }
  return 75;
}

/* Last für die Ermüdungs-/Erholungsberechnung.
   Anders als setLoad zählen hier auch Sätze OHNE Gewicht (Klimmzüge, Dips,
   Liegestütze, Wdh-only): Bodyweight-Training ermüdet den Muskel real, darf
   also die Erholung senken. Synthetisches Gewicht = anteiliges Körpergewicht.
   Volumen-/PR-/1RM-Statistik nutzt weiterhin setLoad (echtes Gewicht). */
function setFatigueLoad(s) {
  const r = parseInt(s.r) || 0;
  if (!r) return 0;
  const w = parseFloat(s.w) || 0;
  const eff = w > 0 ? w : _impliedBodyweight() * 0.6;
  return eff * r * setTypeMul(s.type);
}

/* Berechnet aktuellen Ermüdungs-% pro Muskel (cached) */
let _fatigueCache = null;
function invalidateFatigue() { _fatigueCache = null; }
function getFatigue() {
  if (_fatigueCache && (Date.now() - _fatigueCache.ts) < 60 * 1000) return _fatigueCache.data;
  _fatigueCache = { ts: Date.now(), data: computeFatigueAll() };
  return _fatigueCache.data;
}
function computeFatigueAll() {
  const now = Date.now();
  const cutoff = now - FAT_WINDOW_H * 3600 * 1000;
  /* Akkumuliere pro Muskel: gewichtete Last × Decay */
  const acc = {};
  for (const m of MUSCLES) acc[m.id] = { load:0, lastTs:null, lastEx:null, lastVol:0, hist:[] };

  for (const ses of (S.sessions || [])) {
    const ts = new Date(ses.date).getTime();
    if (!ts || ts < cutoff) continue;
    const hoursAgo = (now - ts) / 3600000;
    const decay = Math.pow(0.5, hoursAgo / FAT_HALFLIFE_H);
    // Phase E: Post-Workout-Check-in als kleiner, klar begrenzter Ermüdungs-Modifier
    // (±8% bei feel 1..4, 2.5 = Mitte/neutral) — KEIN Eingriff in die Kern-Formel,
    // nur ein zusätzlicher Faktor auf den bereits berechneten Beitrag dieser Session.
    const _ciFeelForSes = (S.checkins || []).find(c => c.sid === ses.id)?.feel;
    const feelMul = _ciFeelForSes ? (1 + (_ciFeelForSes - 2.5) * 0.032) : 1;

    for (const log of (ses.logs || [])) {
      const ex = S.exercises.find(e => e.id === log.exerciseId);
      if (!ex) continue;
      const weights = exerciseMuscleWeights(ex);
      const ids = Object.keys(weights);
      if (!ids.length) continue;
      const exVol = (log.sets || []).reduce((s,set)=>s+setFatigueLoad(set), 0);
      if (exVol <= 0) continue;

      for (const id of ids) {
        const w = weights[id];
        const contrib = exVol * w;
        acc[id].load += contrib * decay * feelMul;
        acc[id].hist.push({ date: ses.date, ts, exId: ex.id, exName: ex.name, vol: contrib });
        if (!acc[id].lastTs || ts > acc[id].lastTs) {
          acc[id].lastTs  = ts;
          acc[id].lastEx  = ex.name;
          acc[id].lastVol = contrib;
        }
      }
    }
  }

  /* Normalisieren auf 0..100 */
  const out = {};
  for (const m of MUSCLES) {
    const raw = acc[m.id].load;
    const pct = Math.min(100, Math.round((raw / FAT_NORM_LOAD) * 100));
    out[m.id] = {
      pct,
      raw,
      lastTs:  acc[m.id].lastTs,
      lastEx:  acc[m.id].lastEx,
      lastVol: acc[m.id].lastVol,
      hist:    acc[m.id].hist.sort((a,b)=>b.ts-a.ts),
    };
  }
  return out;
}

/* Farbe für %-Wert */
function fatigueColor(pct) {
  if (pct < 5)  return '#7f8c95';   // grau – erholt
  if (pct < 25) return '#34c759';   // grün – leicht
  if (pct < 60) return '#ff9500';   // orange – mittel
  return '#ff3b30';                  // rot – stark
}
function fatigueState(pct) {
  if (pct < 5)  return 'Erholt';
  if (pct < 25) return 'Leichte Ermüdung';
  if (pct < 60) return 'Mittlere Ermüdung';
  return 'Starke Ermüdung';
}
function fatigueRecoveryHours(pct) {
  // Wie lange bis Wert unter 20% sinkt (Half-Life-Decay)
  if (pct <= 20) return 0;
  return Math.ceil(FAT_HALFLIFE_H * Math.log2(pct / 20));
}
function fmtRecovery(h) {
  if (h <= 0) return 'bereit';
  if (h < 24) return h + ' h';
  const d = Math.floor(h / 24), r = h % 24;
  return r ? (d + ' Tag' + (d>1?'e ':' ') + r + ' h') : (d + ' Tag' + (d>1?'e':''));
}
function fmtLastTraining(ts) {
  if (!ts) return '–';
  const h = Math.floor((Date.now() - ts) / 3600000);
  if (h < 1)  return 'gerade eben';
  if (h < 24) return 'vor ' + h + ' h';
  const d = Math.floor(h / 24);
  if (d === 1) return 'gestern';
  if (d < 7)   return 'vor ' + d + ' Tagen';
  return new Date(ts).toLocaleDateString(GT_LOCALE, { day:'2-digit', month:'2-digit' });
}

/* ════════════════════════════════════════════════════════════════
   MUSKEL-ERHOLUNGS-LISTE (ersetzt das frühere 3D-Modell)
   ──────────────────────
   Akku-Symbol pro Muskel: Recovery% = 100 − Fatigue%
   Sortierung: meist-erholt oben → am wenigsten erholt unten
   Personalisierte Skala: Norm-Last = rolling max aus eigener Historie
   ════════════════════════════════════════════════════════════════ */

/* Personalisierte Norm-Last pro Muskel (rolling max der letzten 90 Tage) */
function _personalNormLoad(muscleId) {
  const now = Date.now();
  const cutoff = now - 90 * 24 * 3600 * 1000;
  let best = 0;
  // Pro Session: gewichtete Last für diesen Muskel summieren, max nehmen.
  for (const ses of (S.sessions || [])) {
    const ts = new Date(ses.date).getTime();
    if (!ts || ts < cutoff) continue;
    let sesLoad = 0;
    for (const log of (ses.logs || [])) {
      const ex = S.exercises.find(e => e.id === log.exerciseId);
      if (!ex) continue;
      const weights = exerciseMuscleWeights(ex);
      const w = weights[muscleId];
      if (!w) continue;
      const exVol = (log.sets || []).reduce((s,set)=>s+setFatigueLoad(set), 0);
      sesLoad += exVol * w;
    }
    if (sesLoad > best) best = sesLoad;
  }
  // Mindestens FAT_NORM_LOAD, damit erste Sessions nicht sofort 100% anzeigen.
  return Math.max(FAT_NORM_LOAD * 0.5, best);
}

/* Recovery% pro Muskel auf Basis personalisierter Skala */
function getRecovery() {
  const now = Date.now();
  const cutoff = now - FAT_WINDOW_H * 3600 * 1000;
  const acc = {};
  for (const m of MUSCLES) acc[m.id] = { load:0, lastTs:null, lastEx:null, lastVol:0, hist:[] };

  for (const ses of (S.sessions || [])) {
    const ts = new Date(ses.date).getTime();
    if (!ts || ts < cutoff) continue;
    const hoursAgo = (now - ts) / 3600000;
    const decay = Math.pow(0.5, hoursAgo / FAT_HALFLIFE_H);

    for (const log of (ses.logs || [])) {
      const ex = S.exercises.find(e => e.id === log.exerciseId);
      if (!ex) continue;
      const weights = exerciseMuscleWeights(ex);
      const ids = Object.keys(weights);
      if (!ids.length) continue;
      const exVol = (log.sets || []).reduce((s,set)=>s+setFatigueLoad(set), 0);
      if (exVol <= 0) continue;
      for (const id of ids) {
        const w = weights[id];
        const contrib = exVol * w;
        acc[id].load += contrib * decay;
        acc[id].hist.push({ date: ses.date, ts, exId: ex.id, exName: ex.name, vol: contrib });
        if (!acc[id].lastTs || ts > acc[id].lastTs) {
          acc[id].lastTs  = ts;
          acc[id].lastEx  = ex.name;
          acc[id].lastVol = contrib;
        }
      }
    }
  }

  const out = {};
  for (const m of MUSCLES) {
    const norm = _personalNormLoad(m.id);
    const fatRaw = acc[m.id].load;
    const fatPct = Math.min(100, Math.round((fatRaw / norm) * 100));
    const recPct = Math.max(0, 100 - fatPct);
    out[m.id] = {
      recPct,
      fatPct,
      raw: fatRaw,
      lastTs:  acc[m.id].lastTs,
      lastEx:  acc[m.id].lastEx,
      lastVol: acc[m.id].lastVol,
      hist:    acc[m.id].hist.sort((a,b)=>b.ts-a.ts),
    };
  }
  return out;
}

/* Akku-Farbe nach Recovery (umgekehrte Logik zu Fatigue):
   0..30% leer = rot · 30..65% halb = orange/gelb · 65..100% voll = grün */
function recoveryColor(pct) {
  if (pct < 30) return '#ff3b30';
  if (pct < 55) return '#ff9500';
  if (pct < 75) return '#ffcc00';
  return '#34c759';
}
/* Aus EINER Farbe die vier Toene des Neonrings ableiten — dieselbe Rampe, die
   die Wochenziel-Ringe aus item.hue bauen (siehe renderTrackers):
   c1/c2 = der scharfe Bogen (satt → fast ausgeglueht), g1/g2 = Hof und Wolke
   (volle Saettigung, sonst verwaschen sie beim Weichzeichnen zu Grau).
   Der Weg ueber den Farbton statt ueber Aufhellen des Hex ist Absicht: #ffcc00
   heller gemacht wird cremeweiss, im Farbton gedreht bleibt es Gelb.
   Rueckfall auf die Eingangsfarbe, falls kein #rrggbb kommt. */
function _neonRamp(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return { c1: hex, c2: hex, g1: hex, g2: hex };
  const n = parseInt(m[1], 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r)      h = ((g - b) / d + (g < b ? 6 : 0));
    else if (mx === g) h = (b - r) / d + 2;
    else               h = (r - g) / d + 4;
    h *= 60;
  }
  h = Math.round(h);
  /* Kein ausgeglühtes, fast weisses Ende: in der Vorlage bleibt der Bogen ueber
     seine ganze Laenge GESAETTIGT und wird nur etwas heller. Ein weisser Kern
     sieht nach Leuchtstoffroehre aus, die Vorlage zeigt aber farbiges Licht. */
  /* Die Helligkeiten kommen aus dem CSS (--nr-*), nicht aus festen Zahlen:
     dieselbe Farbe, die auf Schwarz strahlt, ist auf Weiss zu blass. Der Ring
     wird in den hellen Themes deshalb dunkler und enger gefasst — gleiche
     Farbe, gleiche Geometrie, nur die Helligkeit folgt dem Untergrund. */
  const L = _nrL();
  return {
    c1: `hsl(${h},100%,${L.c1}%)`, c2: `hsl(${h},100%,${L.c2}%)`,
    g1: `hsl(${h},100%,${L.g1}%)`, g2: `hsl(${h},100%,${L.g2}%)`
  };
}
function recoveryState(pct) {
  if (pct >= 100) return 'Vollständig erholt';
  if (pct < 30) return 'Nicht erholt';
  if (pct < 55) return 'Wenig erholt';
  if (pct < 75) return 'Fast bereit';
  return 'Bereit';
}

/* Verwirft den Sessions-Index von _recIdxAll() (Deklaration hier oben, damit
   der Aufrufer nicht in der TDZ des let steht). */
let _recIdx = null, _recIdxKey = '';
function invalidateRecovery() { _recIdx = null; _recIdxKey = ''; }

/* Übungstyp-Schadensfaktor:
   bestimmt wie schnell sich eine Übung erholt (hoher Wert = langsamer).
   Exzentrisch-dominant (RDL, Nordic, Bulgarian) → 1.5
   Schwere Compound (Kreuzheben, Kniebeugen, Bankdrücken) → 1.25
   Moderate Compound (Rudern, Latzug, OHP) → 1.10
   Maschinen / Kabel / Isolation → 0.82 */
function exerciseDamageFactor(ex) {
  if (!ex) return 1.0;
  const n = (ex.name || '').toLowerCase();
  if (/rdl|romanian|rum[äa]n|nordic|bulgar|split.squat|goodmorn|hyperexten|back.exten|negativ/.test(n)) return 1.50;
  if (/kreuzheb|deadlift|kniebeu|squat|bankdrück|bench|klimmz|pull.?up(?!down)|dip/.test(n)) return 1.25;
  if (/ruder|row|schulterdrück|overhead|latzug|pulldown|kurzhantel/.test(n)) return 1.10;
  if (/maschine|machine|kabel|cable|smith|leg.?press|beinpress|butterfly|fly|peck|curls|extension/.test(n)) return 0.82;
  return 1.0;
}

/* Session-Schadensmultiplikator: Top-/Drop-/Failure-Sätze erhöhen die Ermüdung. */
function sessionDamageMul(sets) {
  if (!sets || !sets.length) return 1.0;
  const high = sets.filter(s => ['top','drop','fail'].includes((s.type||'').toLowerCase())).length;
  return 1.0 + (high / sets.length) * 0.35;
}

/* ── EXERCISE-LEVEL RECOVERY ─────────────────────────────────────
   Pro NUTZER-Übung berechnet: aktuelle Last (mit Half-Life-Decay)
   normalisiert auf den persönlichen Peak der letzten 90 Tage.
   Half-Life variiert nach Übungstyp (exzentrisch → länger).
   Damit erscheinen NUR Übungen, die der Nutzer selbst angelegt hat
   – keine Muskel-Pseudo-Einträge wie "Quadrizeps".
   ──────────────────────────────────────────────────────────────── */
/* Sessions-Index fuer die Erholungsrechnung: exerciseId → die je Session schon
   fertig summierten Beitraege. Ohne ihn lief die Schleife unten fuer JEDE Uebung
   ueber ALLE Sessions inkl. Date-Parsing und einem find() ueber deren Logs — und
   sie haengt an smartRestSecs(), laeuft also nach jedem abgehakten Satz.

   Die Liste bleibt in S.sessions-REIHENFOLGE. Die Summe unten ist eine
   Gleitkomma-Addition; eine andere Reihenfolge waere ein anderes Ergebnis.

   Schluessel wie bei _exIdxAll(): Anzahl Sessions + updatedAt. persist() setzt
   updatedAt bei jeder Aenderung neu (der Cloud-Merge uebernimmt es aus dem
   Remote-Doc), damit greift der Cache auch bei bearbeiteten Sessions ohne
   Laengenaenderung. setFatigueLoad() haengt ueber _impliedBodyweight() am
   weightLog — auch das laeuft durch persist(). */
function _recIdxAll() {
  const key = (S.sessions ? S.sessions.length : 0) + '|' + (S.updatedAt || 0);
  if (_recIdx && _recIdxKey === key) return _recIdx;
  const idx = Object.create(null);
  for (const ses of (S.sessions || [])) {
    const ts = new Date(ses.date).getTime();
    if (!ts) continue;
    const seen = Object.create(null);
    for (const log of (ses.logs || [])) {
      // Wie bisher ses.logs.find(): pro Session zaehlt nur der ERSTE Log je Uebung.
      if (!log || !log.exerciseId || seen[log.exerciseId]) continue;
      seen[log.exerciseId] = 1;
      const load = (log.sets || []).reduce((s, set) => s + setFatigueLoad(set), 0);
      if (load <= 0) continue;
      const e = idx[log.exerciseId] || (idx[log.exerciseId] = { list: [], asc: true });
      const prev = e.list[e.list.length - 1];
      if (prev && ts < prev.ts) e.asc = false;
      e.list.push({ ts, load, mul: sessionDamageMul(log.sets) });
    }
  }
  _recIdx = idx; _recIdxKey = key;
  return _recIdx;
}
/* Erster Eintrag ab cutoff. Alles davor liegt ausserhalb BEIDER Fenster (90 Tage
   ist das weitere) und traegt weder zur Last noch zum Peak bei. Nur bei
   chronologischer Liste — sonst waere die Grenze nicht eindeutig. */
function _recIdxStart(e, cutoff) {
  if (!e.asc) return 0;
  let lo = 0, hi = e.list.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (e.list[mid].ts < cutoff) lo = mid + 1; else hi = mid; }
  return lo;
}
function getExerciseRecovery() {
  const now = Date.now();
  const cutoff = now - FAT_WINDOW_H * 3600 * 1000;
  const cutoff90 = now - 90 * 24 * 3600 * 1000;
  const idx = _recIdxAll();
  const out = {};

  for (const ex of (S.exercises || [])) {
    const dmg = exerciseDamageFactor(ex);
    const halflife = FAT_HALFLIFE_H * dmg;
    let load = 0;
    let lastTs = null;
    let peakSession = 0;

    const e = idx[ex.id];
    if (e) for (let i = _recIdxStart(e, cutoff90); i < e.list.length; i++) {
      const ts = e.list[i].ts, sesLoad = e.list[i].load;

      // Peak für persönliche Norm (ohne set-type-Bonus → roher Volume-Peak)
      if (ts >= cutoff90 && sesLoad > peakSession) peakSession = sesLoad;

      // Aktuelle Last im Fenster: Half-Life nach Übungstyp + Set-Typ-Bonus
      if (ts >= cutoff) {
        const hoursAgo = (now - ts) / 3600000;
        const decay = Math.pow(0.5, hoursAgo / halflife);
        load += sesLoad * e.list[i].mul * decay;
        if (!lastTs || ts > lastTs) lastTs = ts;
      }
    }

    const norm = Math.max(FAT_NORM_LOAD * 0.5, peakSession);
    const fatPct = Math.min(100, Math.round((load / norm) * 100));
    const recPct = Math.max(0, 100 - fatPct);
    out[ex.id] = { recPct, fatPct, lastTs };
  }
  return out;
}

/* ── MUSCLE-GROUP-LEVEL RECOVERY ────────────────────────────────
   Aggregiert pro Muskelgruppe den Durchschnitt der Übungs-Fatigue.
   ──────────────────────────────────────────────────────────────── */
function getMuscleGroupRecovery() {
  const exRec = getExerciseRecovery();
  const out = {};
  for (const mg of MUSCLE_GROUPS) {
    const groupExs = (S.exercises || []).filter(ex => ex.muscleGroup === mg.id);
    const trained = groupExs.filter(ex => exRec[ex.id] && exRec[ex.id].lastTs);
    if (!trained.length) {
      out[mg.id] = { recPct:100, fatPct:0, lastTs:null, exercises:groupExs };
      continue;
    }
    const avgFat = trained.reduce((s, ex) => s + (exRec[ex.id].fatPct || 0), 0) / trained.length;
    const lastTs = trained.reduce((max, ex) => { const t = exRec[ex.id].lastTs; return (t > max ? t : max); }, 0) || null;
    out[mg.id] = { recPct:Math.max(0, 100-Math.round(avgFat)), fatPct:Math.round(avgFat), lastTs, exercises:groupExs };
  }
  return out;
}

/* ══ TRAININGSLEISTUNG ═══════════════════════════════════════════════════
   Wie gut laeuft das Training gerade — ausdruecklich NICHT die Erholung.
   Die steht schon als Akku-Liste in der Statistik, und zweimal dasselbe an
   zwei Orten ist keine zweite Aussage, sondern eine Verdopplung, die
   irgendwann auseinanderlaeuft.

   Vier Signale, alle aus geloggten Saetzen — nichts davon ist eine
   Selbsteinschaetzung:

     1. Kraftentwicklung (35 %)  e1RM der zuletzt trainierten Uebungen gegen
        die vorherige Einheit. Das ist der Kern von "wird es besser?".
     2. Zielerreichung  (25 %)   Anteil der Arbeitssaetze, die im Ziel-Wdh-
        Bereich lagen. Miss den Plan an dem, was wirklich passiert ist.
     3. Volumen-Trend   (20 %)   Diese Woche gegen den Schnitt der drei
        Vorwochen.
     4. Konstanz        (20 %)   Einheiten der letzten zwei Wochen gegen die
        eigene Zielfrequenz (obFreq).

   Jedes Signal liefert Wert, Begruendung und — wenn es schwaechelt — einen
   konkreten Vorschlag. Fehlt eins (zu wenig Historie), faellt sein Gewicht
   weg und der Rest wird neu normiert; erfundene Mittelwerte gibt es nicht.
   Ohne jedes Signal liefert die Funktion null und die Leiste bleibt weg. */
function _perfScore() {
  try {
    const ses = (S.sessions || []).filter(s => s && s.date);
    if (!ses.length) return null;
    const teile = [];
    const jetzt = Date.now();

    /* 1 · Kraftentwicklung: je Uebung der letzten drei Einheiten das beste
       e1RM gegen das beste e1RM der Einheit davor. Gemittelt ueber die
       Uebungen, nicht ueber die Saetze — sonst zaehlt eine Uebung mit acht
       Saetzen doppelt so viel wie eine mit vier. */
    try {
      const letzte = ses.slice(-3);
      const deltas = [];
      const gesehen = {};
      letzte.forEach(sn => (sn.logs || []).forEach(l => {
        if (!l || !l.exerciseId || gesehen[l.exerciseId]) return;
        gesehen[l.exerciseId] = 1;
        const hist = exHistory(l.exerciseId);
        if (hist.length < 2) return;
        const best = (sets) => {
          let m = 0;
          _workSets(sets || []).forEach(x => {
            const w = parseFloat(x.w) || 0, r = parseInt(x.r) || 0;
            if (w > 0 && r > 0) { const e = epley1RM(w, r); if (e > m) m = e; }
          });
          return m;
        };
        const neu = best(hist[hist.length - 1].sets), alt = best(hist[hist.length - 2].sets);
        if (neu > 0 && alt > 0) deltas.push((neu - alt) / alt);
      }));
      if (deltas.length) {
        const d = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        // 50 ist "gehalten". +4 % im Schnitt ist stark (100), -4 % schwach (0).
        const wert = Math.max(0, Math.min(100, 50 + (d / 0.04) * 50));
        const pz = (d * 100).toFixed(1).replace('.0', '');
        teile.push({ id:'kraft', g:35, w:wert,
          lbl: _cm('Kraftentwicklung', 'Strength trend'),
          txt: d >= 0.005 ? _cm('Dein geschätztes Maximalgewicht liegt im Schnitt ' + pz + ' % über der Einheit davor.',
                                'Your estimated one-rep max is ' + pz + '% above the session before, on average.')
             : d <= -0.005 ? _cm('Dein geschätztes Maximalgewicht liegt im Schnitt ' + pz + ' % unter der Einheit davor.',
                                'Your estimated one-rep max is ' + pz + '% below the session before, on average.')
             : _cm('Dein geschätztes Maximalgewicht ist stabil geblieben.',
                   'Your estimated one-rep max held steady.'),
          tipp: wert < 45 ? _cm('Bleib zwei Einheiten beim selben Gewicht und hol erst die Wiederholungen zurück — Steigern von einer eingebrochenen Basis aus hält selten.',
                                'Stay at the same weight for two sessions and win the reps back first — adding load from a dip rarely holds.') : null });
      }
    } catch(e) { console.warn('[Perf] Kraft:', e); }

    /* 2 · Zielerreichung: Arbeitssaetze der letzten drei Einheiten im
       Ziel-Wdh-Bereich. Aufwaermsaetze zaehlen nicht — sie sollen den Bereich
       gar nicht treffen. */
    try {
      let treffer = 0, gesamt = 0;
      ses.slice(-3).forEach(sn => (sn.logs || []).forEach(l => {
        const ex = exById(l.exerciseId); if (!ex) return;
        _workSets(l.sets || []).forEach(x => {
          if (!(parseInt(x.r) > 0)) return;
          gesamt++;
          if (_repsOk(x, ex.targetReps)) treffer++;
        });
      }));
      if (gesamt >= 6) {
        const q = treffer / gesamt;
        teile.push({ id:'ziel', g:25, w: Math.round(q * 100),
          lbl: _cm('Zielerreichung', 'Target hit rate'),
          txt: _cm(treffer + ' von ' + gesamt + ' Arbeitssätzen lagen im Ziel-Wiederholungsbereich.',
                   treffer + ' of ' + gesamt + ' working sets landed in the target rep range.'),
          tipp: q < 0.6 ? _cm('Die Gewichte sind für deinen Wiederholungsbereich zu hoch angesetzt. Nimm 5 % raus — im Bereich zu arbeiten bringt mehr als knapp darunter zu scheitern.',
                              'The loads are set too high for your rep range. Take 5% off — working inside the range beats just missing it.') : null });
      }
    } catch(e) { console.warn('[Perf] Ziel:', e); }

    /* 3 · Volumen-Trend: laufende Woche gegen den Schnitt der drei davor. Die
       laufende Woche wird hochgerechnet, sonst stuende am Montag jede Woche
       ein Einbruch da, der keiner ist. */
    try {
      const woche = (t) => Math.floor(t / (7 * 864e5));
      const jetztW = woche(jetzt);
      const vol = {};
      // Gelesen werden nur die Wochen jetztW-3 … jetztW. Alles davor landet in
      // Eimern, die niemand anfasst — sessionVolume() dafuer zu rechnen ist bei
      // langer Historie der teuerste Teil der ganzen Funktion.
      const minT = (jetztW - 3) * 7 * 864e5;
      ses.forEach(sn => {
        const t = new Date(sn.date).getTime(); if (!isFinite(t) || t < minT) return;
        vol[woche(t)] = (vol[woche(t)] || 0) + (sessionVolume(sn) || 0);
      });
      const vor = [1, 2, 3].map(k => vol[jetztW - k] || 0).filter(v => v > 0);
      if (vor.length >= 2) {
        const mittel = vor.reduce((a, b) => a + b, 0) / vor.length;
        // Anteil der laufenden Woche, der schon vorbei ist (Montag = 1/7).
        const tag = ((new Date().getDay() + 6) % 7) + 1;
        const hoch = (vol[jetztW] || 0) / (tag / 7);
        const d = mittel > 0 ? (hoch - mittel) / mittel : 0;
        const wert = Math.max(0, Math.min(100, 50 + (d / 0.25) * 50));
        teile.push({ id:'vol', g:20, w: wert,
          lbl: _cm('Volumen-Trend', 'Volume trend'),
          txt: _cm('Hochgerechnet liegt diese Woche bei ' + Math.round(hoch).toLocaleString(GT_LOCALE) + ' ' + unitLabel() + ' gegenüber ' + Math.round(mittel).toLocaleString(GT_LOCALE) + ' ' + unitLabel() + ' im Schnitt der Vorwochen.',
                   'Projected, this week sits at ' + Math.round(hoch).toLocaleString(GT_LOCALE) + ' ' + unitLabel() + ' versus ' + Math.round(mittel).toLocaleString(GT_LOCALE) + ' ' + unitLabel() + ' averaged over the weeks before.'),
          tipp: wert < 40 ? _cm('Ein Arbeitssatz mehr bei deinen zwei Hauptübungen holt den Rückstand auf, ohne die Einheit spürbar zu verlängern.',
                                'One extra working set on your two main lifts closes the gap without making the session noticeably longer.') : null });
      }
    } catch(e) { console.warn('[Perf] Volumen:', e); }

    /* 4 · Konstanz: Einheiten der letzten 14 Tage gegen die Zielfrequenz aus
       dem Onboarding. Ohne gesetztes Ziel gilt 3× pro Woche als Bezug — das
       ist die Frequenz, auf die die Plaene der App ausgelegt sind. */
    try {
      const ziel = Math.max(1, Math.min(7, parseInt(S.obFreq) || 3)) * 2;
      const anz = ses.filter(sn => {
        const t = new Date(sn.date).getTime();
        return isFinite(t) && jetzt - t <= 14 * 864e5;
      }).length;
      teile.push({ id:'konst', g:20, w: Math.max(0, Math.min(100, Math.round(anz / ziel * 100))),
        lbl: _cm('Konstanz', 'Consistency'),
        txt: _cm(anz + ' von ' + ziel + ' geplanten Einheiten in den letzten 14 Tagen.',
                 anz + ' of ' + ziel + ' planned sessions over the last 14 days.'),
        tipp: anz < ziel * 0.7 ? _cm('Setz dir für die nächste Woche eine Einheit weniger als Ziel und halte die. Ein erreichter Plan trägt weiter als ein verfehlter.',
                                     'Plan one session fewer next week and keep it. A plan you hit carries further than one you miss.') : null });
    } catch(e) { console.warn('[Perf] Konstanz:', e); }

    if (!teile.length) return null;
    const gSum = teile.reduce((s2, t) => s2 + t.g, 0);
    const pct = Math.round(teile.reduce((s2, t) => s2 + t.w * t.g, 0) / gSum);
    // Schwaechstes Signal zuerst — danach richtet sich, was die Detailebene
    // als Erstes vorschlaegt.
    teile.sort((x, y) => x.w - y.w);
    return { pct: Math.max(0, Math.min(100, pct)), teile: teile };
  } catch(e) { console.warn('[Coach] Leistung:', e); return null; }
}
function _perfLabel(pct) {
  if (pct >= 80) return _cm('Top-Form', 'Peak form');
  if (pct >= 62) return _cm('Starke Phase', 'Strong phase');
  if (pct >= 44) return _cm('Solide', 'Steady');
  if (pct >= 26) return _cm('Schwächelt', 'Slipping');
  return _cm('Eingebrochen', 'Stalled');
}

/* ══ SEGMENT-BALKEN ("die Striche") ══════════════════════════════════════
   Ein Wert in Strichen statt in einem durchgezogenen Balken. Der Unterschied
   ist nicht nur Geschmack: ein durchgezogener Balken bei 62 % sieht aus wie
   "irgendwo etwas ueber der Mitte", zwoelf Striche mit sieben gefuellten
   sind ABZAEHLBAR. Man sieht den Wert, ohne die Zahl zu lesen.

   Genau EINE Stelle baut sie, weil sie an mehreren auftauchen (Bereitschaft
   im Coach-Hub, Erholungs-Akkus in der Statistik). Zwei Fassungen desselben
   Musters wuerden sofort auseinanderlaufen.

   Farbe: nicht je Strich, sondern nach dem GESAMTWERT. Ein Verlauf ueber die
   Striche (erster rot, letzter gruen) waere hier falsch — er behauptete, die
   ersten 20 % einer Erholung seien "schlecht" und die letzten "gut". Der Wert
   als Ganzes ist gut oder schlecht, also faerbt er alle gefuellten Striche.
   Innerhalb bleibt ein leichter Helligkeitsverlauf, damit die Reihe lebt. */
/* Der Farbverlauf: leer = rot, halb = gelb, voll = gruen — und dazwischen
   fliessend, ohne Stufen.

   Die Kurve ist BEWUSST nicht linear ueber den Farbkreis. Rot liegt bei 0°,
   Gelb bei 50°, Gruen bei 135°: die untere Haelfte des Wertes muss also nur
   50 Grad durchlaufen, die obere 85. Linear gerechnet laege die Mitte bei
   67° — einem Gelbgruen, das schon nach "fast geschafft" aussieht, obwohl es
   die Haelfte ist. Zwei Aeste, die sich bei 50 % in Gelb treffen, halten die
   Mitte da, wo sie hingehoert.

   Die Helligkeit faellt zur Mitte leicht ab: reines Gelb bei voller
   Saettigung brennt sonst deutlich heller als seine Nachbarn und die Reihe
   bekaeme in der Mitte eine Beule. */
function _segFarbe(pct) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const h = p <= 50 ? (p / 50) * 50 : 50 + ((p - 50) / 50) * 90;
  /* Volle Saettigung und Helligkeit 50 — genau dort ist eine HSL-Farbe am
     kraeftigsten. Jeder Wert darueber mischt Weiss dazu und macht aus dem
     Rot ein Lachs und aus dem Gruen ein Mint. Nur Gelb wird eine Spur
     dunkler gehalten: es ist von Natur aus das hellste der drei und stuende
     sonst als greller Fleck zwischen seinen Nachbarn. */
  const gelbNaehe = 1 - Math.min(1, Math.abs(h - 50) / 30);
  /* Der Deckel aus dem Stylesheet. Auf Dunkel steht er auf 100 und aendert
     nichts; auf hellem Grund zieht er dieselbe Farbe so weit herunter, dass der
     Strich sich von der weissen Karte abhebt. Ohne ihn lagen die Fuellungen bei
     1,03:1 — heller als dieselben Striche im Dark Mode, also genau verkehrt. */
  const l = Math.min(_nrLmax(), 50 - gelbNaehe * 4);
  /* Die FUELLUNG ist eine andere Rolle als die SCHRIFT und bekommt deshalb eine
     eigene Helligkeit — siehe _sigFillL(). Auf Dunkel sind beide identisch. */
  const lf = _sigFillL(h, l);
  return {
    h, s: 100, l, css: `hsl(${h.toFixed(0)},100%,${l.toFixed(0)}%)`,
    lFill: lf, cssFill: `hsl(${h.toFixed(0)},100%,${lf.toFixed(0)}%)`
  };
}
/* ── HELLIGKEIT DER SIGNAL-FUELLUNGEN AUF HELLEM GRUND ──────────────────────
   Bis 02.08.2026 lief die Fuellung durch DENSELBEN Deckel wie die Schrift
   (--neon-lmax: 30). Der Deckel war fuer Text gebaut und dort richtig; als
   Regel fuer Flaechen war er die Ursache dafuer, dass in rosa/hell aus der
   Ampel Matsch wurde: Gelb (h≈50) bei L=30 ist #997700 — Oliv. Orange (h≈25)
   wurde Rostbraun. Nebeneinander waren "wenig erholt" und "nicht erholt" nicht
   mehr zu unterscheiden, und von "gruen, gelb, orange, rot" kam nichts an.

   Der Grund ist nicht Willkuer, sondern Wahrnehmung: die EIGENhelligkeit einer
   satten Farbe haengt stark vom Farbton ab. Gelb ist von Natur aus hell, Gruen
   und Rot sind dunkel. Zwingt man alle auf denselben HSL-L-Wert, verliert
   ausgerechnet Gelb seine Identitaet — es wird braun, nicht dunkelgelb.

   Deshalb hier eine Stuetzstellen-Kurve statt eines Deckels: jeder Farbton
   bekommt die Helligkeit, bei der er noch als DIESE Farbe gelesen wird.
   Rot und Gelb duerfen hell bleiben, Gruen geht deutlich herunter (satt-dunkles
   Gruen liest sich auf Weiss besser als helles). Was an Kontrast fehlt — vor
   allem bei Gelb — traegt nicht die Farbe, sondern die haarfeine dunkle Kante
   um jeden Strich (--sig-ring, gesetzt in _segBarsHTML). Das ist auch der Weg,
   den WCAG 1.4.11 fuer grafische Elemente vorsieht: Umriss statt Flaechenkontrast.

   Auf Dunkel greift die Kurve NICHT — dort ist der uebergebene Wert bereits
   richtig und jede Aenderung waere eine Regression an einer Stelle, die stimmt. */
const _SIG_FILL_L = [[0, 46], [25, 44], [50, 46], [95, 38], [140, 35]];
function _sigFillL(h, fallback) {
  if (!_neonHell()) return fallback;
  const t = _SIG_FILL_L;
  if (h <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (h <= t[i][0]) {
      const [h0, l0] = t[i - 1], [h1, l1] = t[i];
      return l0 + (l1 - l0) * ((h - h0) / (h1 - h0));
    }
  }
  return t[t.length - 1][1];
}
/* Liest --neon-lmax. Der Token war seit dem Neon-Umbau deklariert und hatte
   KEINEN Leser — das ist die gemeinsame Ursache dafuer, dass Erholungsstriche,
   Split-Namen und Prozentzahlen in den hellen Themes unsichtbar waren. Default
   100 heisst "kein Deckel", damit Dark unveraendert bleibt. */
function _nrLmax(){
  try {
    const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--neon-lmax'));
    return isFinite(v) ? Math.max(0, Math.min(100, v)) : 100;
  } catch(_) { return 100; }
}
function _neonHell(){
  try { return document.documentElement.getAttribute('data-theme') !== 'dark'; } catch(_) { return false; }
}
/* Eine fuer Dunkel gebaute Leuchtfarbe als TEXT oder KERN auf hellem Grund
   brauchbar machen: Farbton bleibt, Helligkeit auf den Deckel, Saettigung eine
   Spur hoch (auf Weiss traegt die Saettigung den Kontrast, nicht die
   Helligkeit). Auf Dark unveraendert zurueck.
   BEWUSST nur beim Rendern — die Palette selbst bleibt, wie sie ist. Sonst
   wandern die gedunkelten Werte ueber p.color in gespeicherte und gesyncte
   Daten, und in Dark haette der Nutzer ploetzlich andere Split-Farben. */
function _neonInk(hex){
  if (!_neonHell()) return hex;
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1) || 1);
    if (mx === r)      h = ((g - b) / d + (g < b ? 6 : 0));
    else if (mx === g) h = (b - r) / d + 2;
    else               h = (r - g) / d + 4;
    h *= 60;
  }
  const L = Math.min(_nrLmax(), l * 100);
  const S = Math.min(100, s * 100 + 8);
  return `hsl(${Math.round(h)},${S.toFixed(0)}%,${L.toFixed(0)}%)`;
}
/* Erholungsfarbe als TEXT. recoveryColor() liefert weiter die Signalfarbe fuer
   Ringe und Balken — dort ist sie richtig. Als Schriftfarbe stand dieselbe
   Farbe auf hellem Grund bei 1,25:1 ("62 %" auf der Erholungs-Kachel), und das
   an rund zehn Stellen quer durch Heute- und Statistik-Tab. */
function recoveryInk(pct){ return _neonInk(recoveryColor(pct)); }
/* Senkrechte Fassung der Striche fuer die stehenden Akkus (Erholung gesamt,
   Muskelgruppen-Detail). Gefuellt wird von UNTEN — ein Akku laeuft von unten
   voll, nicht von oben. Sonst dieselbe Sprache wie die liegende Reihe:
   dieselben Farben, derselbe enge Schein, dieselbe Regel, dass die leeren
   Zellen als Skala stehen bleiben. */
function _segBarsVertHTML(pct, n, opts) {
  const o = opts || {};
  const p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  const anz = Math.max(1, parseInt(n) || 8);
  let voll = Math.round((p / 100) * anz);
  if (p > 0 && voll === 0) voll = 1;
  if (p >= 100) voll = anz;
  const f = _segFarbe(p);
  // Fuellung = lFill (eigene Helligkeitskurve auf hellem Grund), nicht die Ink-Helligkeit.
  const H = f.h.toFixed(0), L = f.lFill.toFixed(0);
  const ring = `inset 0 0 0 1px hsla(${H},100%,${Math.max(18, f.lFill - 22).toFixed(0)}%,var(--sig-ring,0))`;
  let out = `<div class="segbar-v${o.cls ? ' ' + o.cls : ''}">`;
  // Von oben nach unten gebaut, gefuellt sind die UNTERSTEN.
  for (let i = 0; i < anz; i++) {
    const an = (anz - i) <= voll;
    /* Volle Neon-Staffel wie ueberall (--gw und --gwa im :root). Hier standen
       vorher 5/9 px ohne dritte Lage — neben Ringen und Segmentreihen sah die
       Batterie dadurch aus, als leuchte sie schwaecher, obwohl sie dieselbe Art
       Wert zeigt. Die Innenlichter bleiben: sie machen aus der Flaeche eine
       Roehre, das ist unabhaengig vom Schein nach aussen. */
    const st = an
      ? `background:hsl(${H},100%,${L}%);`
        + `box-shadow:0 0 var(--gw-1) hsla(${H},100%,var(--ng-1),var(--gwa-1)),`
        + `0 0 var(--gw-2) hsla(${H},100%,var(--ng-2),var(--gwa-2)),`
        + `0 0 var(--gw-3) hsla(${H},100%,var(--ng-3),var(--gwa-3)),`
        + `var(--neon-edge),`
        + `${ring},`
        + `inset 0 -1px 3px hsla(${H},100%,30%,var(--ng-lo)),`
        + `inset 0 1px 2px hsla(${H},100%,80%,var(--ng-hi))`
      : '';
    out += `<i class="${an ? 'on' : 'off'}" style="${st}"></i>`;
  }
  return out + '</div>';
}

/* pct 0–100, n = Anzahl der Striche. Der Anteil wird kaufmaennisch gerundet,
   aber ein Wert ueber 0 bekommt IMMER mindestens einen Strich: "0 von 12"
   fuer 4 % Erholung waere schlicht falsch. */
function _segBarsHTML(pct, n, opts) {
  const o = opts || {};
  const p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  const anz = Math.max(1, parseInt(n) || 12);
  let voll = Math.round((p / 100) * anz);
  if (p > 0 && voll === 0) voll = 1;
  if (p >= 100) voll = anz;
  const f = _segFarbe(p);
  let out = `<div class="segbar${o.cls ? ' ' + o.cls : ''}"${o.label ? ` role="img" aria-label="${esc(o.label)}"` : ''}>`;
  for (let i = 0; i < anz; i++) {
    const an = i < voll;
    // Helligkeit steigt leicht ueber die gefuellten Striche — die Reihe wirkt
    // dadurch gerichtet statt wie ein Block.
    /* Alle gefuellten Striche tragen DIESELBE Farbe. Der frueher hier
       liegende Helligkeitsverlauf ueber die Reihe sollte sie gerichtet wirken
       lassen, nahm ihr aber die Deutlichkeit: der erste Strich war merklich
       dunkler als der letzte, und aus einem klaren Gruen wurde ein Verlauf
       ins Blasse. Eine Reihe, ein Wert, eine Farbe. */
    const l = f.lFill;
    const H = f.h.toFixed(0), S = f.s.toFixed(0);
    /* Die haarfeine Kante in der eigenen, dunkleren Farbe. Sie ist der Ersatz
       fuer den Kontrast, den eine helle Fuellung auf weissem Grund nicht haben
       kann — vor allem bei Gelb. Auf Dunkel steht --sig-ring auf 0, die Kante
       ist dort also nicht vorhanden und es aendert sich nichts. */
    const ring = `inset 0 0 0 1px hsla(${H},100%,${Math.max(18, l - 22).toFixed(0)}%,var(--sig-ring,0))`;
    /* Fassung fuer Gehaeuse (die Erholungs-Batterien): volle Neon-Staffel wie
       jede andere Anzeige, dazu die beiden Innenlichter, die aus der Flaeche
       eine Roehre machen.
       Frueher war der aeussere Schein hier bewusst gestutzt, damit er nicht
       ueber die Huelle hinausstrahlt. Das Ergebnis war aber, dass die Batterie
       neben Ringen und Segmentreihen schwaecher leuchtete als alles andere —
       und der Unterschied faellt staerker auf als der Ueberstand. Der Schein
       darf ueber die Huelle laufen; abschneiden geht ohnehin nicht, weil der
       Nippel der Batterie ausserhalb sitzt und mit weggeschnitten wuerde. */
    if (an && o.eng) {
      out += `<i class="on" style="background:hsl(${H},100%,${l.toFixed(0)}%);`
           + `box-shadow:0 0 var(--gw-1) hsla(${H},100%,var(--ng-1),var(--gwa-1)),`
           + `0 0 var(--gw-2) hsla(${H},100%,var(--ng-2),var(--gwa-2)),`
           + `0 0 var(--gw-3) hsla(${H},100%,var(--ng-3),var(--gwa-3)),`
           + `var(--neon-edge),`
           + `${ring},`
           + `inset 0 -1px 3px hsla(${H},100%,30%,var(--ng-lo)),`
           + `inset 0 1px 2px hsla(${H},100%,80%,var(--ng-hi))"></i>`;
      continue;
    }
    /* Der Schein in drei Lagen: ein enger heller Saum direkt am Strich, ein
       mittlerer Hof und ein weiter, schwacher Schimmer. Eine einzelne Lage
       sieht aus wie ein weicher Schatten; erst die Staffelung liest sich als
       Leuchten. Dazu ein Innenlicht (inset), das den Strich selbst wie eine
       Roehre wirken laesst statt wie eine gefuellte Flaeche. */
    /* Radien und Deckkraften kommen aus der zentralen Neon-Staffel (--gw-*,
       --gwa-* im :root). Frueher standen hier eigene Werte (5/13/26) — neben
       einem Ring mit anderer Staffel las sich das als "leuchtet staerker",
       obwohl beide dasselbe meinten. Nur die FARBE ist hier eigen, weil sie
       vom Wert abhaengt und deshalb aus dem JS kommen muss. */
    const st = an
      ? `background:hsl(${H},${S}%,${l.toFixed(0)}%);`
        + `box-shadow:0 0 var(--gw-1) hsla(${H},100%,var(--ng-1),var(--gwa-1)),`
        + `0 0 var(--gw-2) hsla(${H},${S}%,var(--ng-2),var(--gwa-2)),`
        + `0 0 var(--gw-3) hsla(${H},${S}%,var(--ng-3),var(--gwa-3)),`
        + `var(--neon-edge),`
        + `${ring},`
        + `inset 0 1px 3px hsla(${H},100%,78%,var(--ng-hi))`
      : '';
    // Der letzte gefuellte Strich ist der "aktuelle" — er traegt die Marke.
    const akt = an && i === voll - 1 && !o.flach ? ' is-now' : '';
    out += `<i class="${an ? 'on' : 'off'}${akt}" style="${st}"></i>`;
  }
  return out + '</div>';
}

/* Rendert die Akku-Liste auf dem Stats-Tab – pro Muskelgruppe */
let _recPage = 0;
function setRecPage(page) {
  _recPage = page;
  const slider = document.getElementById('rec-slider');
  if (slider) slider.style.transform = `translateX(${-page * 100}%)`;
  document.getElementById('rec-dot-0')?.classList.toggle('on', page === 0);
  document.getElementById('rec-dot-1')?.classList.toggle('on', page === 1);
  if (page === 1) renderRecOverall();
}
function renderRecOverall() {
  const el = document.getElementById('rec-overall');
  if (!el) return;
  const mgRec = getMuscleGroupRecovery();
  const trained = MUSCLE_GROUPS.map(mg => mgRec[mg.id]).filter(r => r?.lastTs);
  if (!trained.length) {
    el.innerHTML = '<div style="font-size:12px;color:rgba(255,255,255,.55);text-align:center">Noch keine Daten</div>';
    return;
  }
  const pct = Math.round(trained.reduce((s,r) => s + r.recPct, 0) / trained.length);
  const col = recoveryColor(pct);
  const state = recoveryState(pct);
  el.innerHTML = `
    <div class="rec-batt-v-outer">
      <div class="rec-batt-v-cap"></div>
      <div class="rec-batt-v">
        ${_segBarsVertHTML(pct, 7)}
      </div>
    </div>
    <div class="rec-batt-v-pct" style="color:${_neonInk(col)}">${pct}%</div>
    <div class="rec-batt-v-lbl">Gesamterholung<br><b>${state}</b></div>`;
}
function initRecSlider() {
  const box = document.getElementById('rec-box');
  if (!box || box._swipeReady) return;
  box._swipeReady = true;
  let sx = 0, sy = 0;
  box.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, {passive:true});
  box.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0 && _recPage === 0) setRecPage(1);
      else if (dx > 0 && _recPage === 1) setRecPage(0);
    }
  }, {passive:true});
  // Desktop-Maus-Support
  let mx = 0;
  box.addEventListener('mousedown', e => { mx = e.clientX; }, {passive:true});
  box.addEventListener('mouseup', e => {
    const dx = e.clientX - mx;
    if (Math.abs(dx) > 28) {
      if (dx < 0 && _recPage === 0) setRecPage(1);
      else if (dx > 0 && _recPage === 1) setRecPage(0);
    }
  }, {passive:true});
}
function renderRecoveryList() {
  const host = document.getElementById('rec-list');
  if (!host) return;
  const hasSessions = (S.sessions || []).length > 0;
  if (!hasSessions) {
    host.innerHTML = '<div class="rec-list-empty">Noch keine Trainings.<br>Logge dein erstes Workout, um deine Erholung zu sehen.</div>';
    return;
  }
  const mgRec = getMuscleGroupRecovery();
  const rows = MUSCLE_GROUPS
    .map(mg => ({ mg, r: mgRec[mg.id] || { recPct:100, fatPct:0, lastTs:null } }))
    .filter(({r}) => r.lastTs)
    /* Erholteste zuerst, dann abgestuft nach unten. Die Liste beantwortet
       damit die Frage, mit der man sie oeffnet — "was kann ich heute
       trainieren?" —, und nicht die Frage, was gerade wehtut. Ganz unten
       steht, was noch Ruhe braucht. */
    .sort((a,b) => b.r.recPct - a.r.recPct);

  if (!rows.length) {
    host.innerHTML = '<div class="rec-list-empty">Alle Muskeln erholt</div>';
    return;
  }

  host.innerHTML = rows.map(({mg, r}) => {
    const col = recoveryColor(r.recPct);
    const sub = recoveryState(r.recPct) + ' · ' + fmtLastTraining(r.lastTs);
    const emptyCls = r.recPct < 15 ? ' is-empty' : '';
    return '<div class="rec-row" onclick="openMuscleGroupRecoveryDetail(\'' + mg.id + '\')">'
      + '<div class="rec-row-body">'
      + '<div class="rec-row-title">' + mg.label + '</div>'
      + '<div class="rec-row-sub">' + sub + '</div>'
      + '</div>'
      // Huelle und Nippel bleiben — es soll weiter wie eine Batterie aussehen.
      // Nur die Fuellung ist jetzt eine Strichreihe: fuenf Zellen sind das,
      // was in die schmale Huelle passt, ohne dass die Striche zu Faeden
      // werden, und es ist dieselbe Sprache wie die Leistungs-Leiste im
      // Coach-Hub. Die Prozentzahl liegt weiterhin darueber.
      + '<div class="rec-batt' + emptyCls + '">'
      // Ohne Prozentzahl: die Striche SIND der Wert. Die Zahl lag mittig auf
      // der Fuellung und zwang den Schein klein zu halten, damit sie lesbar
      // blieb — jetzt darf er leuchten. Der Zustand steht ohnehin als Text in
      // der Zeile ("Wenig erholt · gerade trainiert").
      + _segBarsHTML(r.recPct, 5, { flach: true, eng: true, cls: 'segbar-batt' })
      + '</div>'
      + '</div>';
  }).join('');
  initRecSlider();
  if (_recPage === 1) renderRecOverall();
}

/* ════════════════════════════════════════════════════════════════
   ÜBUNGS-ERHOLUNGS-DETAIL  (öffnet sich bei Tap auf rec-row)
   Zeigt: Recovery-Ring, letztes Training, Ready-in-Stunden,
   Mini-Historie der letzten 8 Sessions dieser Übung.
   ════════════════════════════════════════════════════════════════ */
function openExRecoveryDetail(exId) {
  const ex = exById(exId);
  if (!ex) return;
  const rec = getExerciseRecovery();
  const r   = rec[exId] || { recPct:100, fatPct:0, lastTs:null };

  /* Kopfzeile des Overlays befüllen */
  document.getElementById('mus-title').textContent  = (ex.emoji ? ex.emoji + ' ' : '') + ex.name;
  document.getElementById('mus-sub-grp').textContent = muscleLabel(ex.muscleGroup) || '';

  const pct   = r.recPct;
  const col   = recoveryColor(pct);
  const state = recoveryState(pct);
  /* "Ready in": wie viele Stunden bis fatPct < 20 (= recPct > 80, Status "Bereit") */
  const readyH = fatigueRecoveryHours(r.fatPct);

  /* SVG-Ring (recPct = Füllung, hoher Wert = grün = gut) */
  const R = 60, C = 2 * Math.PI * R;
  const dash = (pct / 100) * C;

  /* Trainings-Historie dieser Übung (letzte 8 Sessions) */
  const hist = exHistory(exId).slice(-8).reverse();
  const histRows = hist.length
    ? hist.map(h => {
        const w   = maxW(h.sets);
        const vol = h.sets.reduce((s, set) => s + setLoad(set), 0);
        return `<div class="mus-hist-row">
          <span class="mus-hist-date">${fmtLastTraining(new Date(h.date).getTime())}</span>
          <span class="mus-hist-ex">${h.sets.length} Sätze · ${fmtKg(w)}</span>
          <span class="mus-hist-vol">${fmtKg(vol)}</span>
        </div>`;
      }).join('')
    : `<div style="padding:10px;color:var(--text2);font-size:13px;text-align:center">Keine Einheiten in den letzten 7 Tagen.</div>`;

  document.getElementById('mus-body').innerHTML = `
    <div class="mus-ring-wrap">
      <div class="mus-ring">
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r="${R}" fill="none" stroke="var(--gl-bdr)" stroke-width="10"/>
          <circle cx="70" cy="70" r="${R}" fill="none" stroke="${col}" stroke-width="10"
                  stroke-linecap="round" stroke-dasharray="${dash} ${C - dash}"/>
        </svg>
        <div class="mus-ring-val">
          <div class="mus-ring-pct" style="color:${_neonInk(col)}">${pct}%</div>
          <div class="mus-ring-state">${state}</div>
        </div>
      </div>
    </div>
    <div class="mus-stats-grid">
      <div class="mus-stat-box">
        <div class="mus-stat-l">Letztes Training</div>
        <div class="mus-stat-v">${fmtLastTraining(r.lastTs)}</div>
      </div>
      <div class="mus-stat-box">
        <div class="mus-stat-l">Ready in</div>
        <div class="mus-stat-v" style="color:${_neonInk(col)}">${fmtRecovery(readyH)}</div>
      </div>
    </div>
    <div class="s-title" style="margin-top:6px">Trainings-Historie</div>
    <div class="card" style="padding:6px 12px">${histRows}</div>
  `;
  openOv('ov-muscle');
}

/* ════════════════════════════════════════════════════════════════
   MUSKELGRUPPEN-ERHOLUNGS-DETAIL (Tap auf Erholungs-Kachel)
   ════════════════════════════════════════════════════════════════ */
function openMuscleGroupRecoveryDetail(groupId) {
  const mg = MUSCLE_GROUPS.find(m => m.id === groupId);
  if (!mg) return;
  const mgRec = getMuscleGroupRecovery();
  const r = mgRec[groupId] || { recPct:100, fatPct:0, lastTs:null, exercises:[] };

  document.getElementById('mus-title').textContent = mg.label;
  document.getElementById('mus-sub-grp').textContent = 'Muskelgruppe · Erholung';

  const pct   = r.recPct;
  const col   = recoveryColor(pct);
  const state = recoveryState(pct);
  const readyH = fatigueRecoveryHours(r.fatPct);

  const R = 60, C = 2 * Math.PI * R;
  const dash = (pct / 100) * C;

  const exRec = getExerciseRecovery();
  const exRows = (r.exercises || []).map(ex => {
    const er = exRec[ex.id] || { recPct:100, fatPct:0, lastTs:null };
    const c = recoveryColor(er.recPct);
    const trained = er.lastTs ? `<span style="color:${_neonInk(c)};font-weight:600">${er.recPct}%</span>` : `<span style="color:var(--text2)">–</span>`;
    const lastDate = er.lastTs ? fmtLastTraining(er.lastTs) : 'Kein Training';
    return `<div class="mus-hist-row" onclick="openExRecoveryDetail('${ex.id}')" style="cursor:pointer">
      <span class="mus-hist-date">${esc(ex.name)}</span>
      <span class="mus-hist-ex">${trained}</span>
      <span class="mus-hist-vol" style="color:var(--text2)">${lastDate}</span>
    </div>`;
  }).join('') || `<div style="padding:10px;color:var(--text2);font-size:13px;text-align:center">Keine Übungen in dieser Gruppe.</div>`;

  document.getElementById('mus-body').innerHTML = `
    <div class="mus-ring-wrap">
      <div class="mus-ring">
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r="${R}" fill="none" stroke="var(--gl-bdr)" stroke-width="10"/>
          <circle cx="70" cy="70" r="${R}" fill="none" stroke="${col}" stroke-width="10"
                  stroke-linecap="round" stroke-dasharray="${dash} ${C - dash}"/>
        </svg>
        <div class="mus-ring-val">
          <div class="mus-ring-pct" style="color:${_neonInk(col)}">${pct}%</div>
          <div class="mus-ring-state">${state}</div>
        </div>
      </div>
    </div>
    <div class="mus-stats-grid">
      <div class="mus-stat-box">
        <div class="mus-stat-l">Letztes Training</div>
        <div class="mus-stat-v">${fmtLastTraining(r.lastTs)}</div>
      </div>
      <div class="mus-stat-box">
        <div class="mus-stat-l">Ready in</div>
        <div class="mus-stat-v" style="color:${_neonInk(col)}">${fmtRecovery(readyH)}</div>
      </div>
    </div>
    <div class="s-title" style="margin-top:6px">Übungen in dieser Gruppe</div>
    <div class="card" style="padding:6px 12px">${exRows}</div>
  `;
  openOv('ov-muscle');
}

/* Kompat-Stubs für alten Aufruf-Sites */
function renderFatigueMini() { renderRecoveryList(); }
function openFatigueFull()   { /* deprecated – Liste ist direkt sichtbar */ }
function setFatSide()        { /* deprecated */ }
function toggleMuscleEditor(){ /* deprecated */ }
function onEditMuscleChange(){ /* deprecated */ }
function onEditCapsuleChange(){/* deprecated */ }
function onEditRadiusChange(){ /* deprecated */ }
function saveMuscleEdit()    { /* deprecated */ }
function resetMuscleEdit()   { /* deprecated */ }
function addCapsuleAtCurrent(){ /* deprecated */ }
function removeCapsuleAtCurrent(){ /* deprecated */ }
function exportMuscleEdit()  { /* deprecated */ }

/* ════════════════════════════════════════════════════════════════
   MUSKEL-DETAIL-OVERLAY (Tap auf Hotspot)
   ════════════════════════════════════════════════════════════════ */
function openMuscleDetail(id) {
  const m = MUSCLES_BY_ID[id];
  if (!m) return;
  const fat = getFatigue();
  const f = fat[id] || { pct:0, lastTs:null, lastEx:null, hist:[] };

  document.getElementById('mus-title').textContent  = m.label;
  document.getElementById('mus-sub-grp').textContent = muscleLabel(m.mg) || '';

  const pct = f.pct;
  const col = fatigueColor(pct);
  const state = fatigueState(pct);
  const rec = fatigueRecoveryHours(pct);

  /* Ring: SVG circle mit stroke-dasharray */
  const R = 60, C = 2 * Math.PI * R;
  const dash = (pct / 100) * C;

  const histRows = (f.hist || []).slice(0, 8).map(h => `
    <div class="mus-hist-row">
      <span class="mus-hist-date">${fmtLastTraining(h.ts)}</span>
      <span class="mus-hist-ex">${h.exName || '?'}</span>
      <span class="mus-hist-vol">${fmtKg(h.vol)}</span>
    </div>
  `).join('') || `<div style="padding:10px;color:var(--text2);font-size:13px;text-align:center">Keine Einheiten in den letzten 7 Tagen.</div>`;

  document.getElementById('mus-body').innerHTML = `
    <div class="mus-ring-wrap">
      <div class="mus-ring">
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r="${R}" fill="none" stroke="var(--gl-bdr)" stroke-width="10"/>
          <circle cx="70" cy="70" r="${R}" fill="none" stroke="${col}" stroke-width="10"
                  stroke-linecap="round" stroke-dasharray="${dash} ${C-dash}"/>
        </svg>
        <div class="mus-ring-val">
          <div class="mus-ring-pct" style="color:${_neonInk(col)}">${pct}%</div>
          <div class="mus-ring-state">${state}</div>
        </div>
      </div>
    </div>
    <div class="mus-stats-grid">
      <div class="mus-stat-box">
        <div class="mus-stat-l">Letztes Training</div>
        <div class="mus-stat-v">${fmtLastTraining(f.lastTs)}</div>
      </div>
      <div class="mus-stat-box">
        <div class="mus-stat-l">Empfohlene Pause</div>
        <div class="mus-stat-v">${fmtRecovery(rec)}</div>
      </div>
    </div>
    ${f.lastEx ? `<div style="font-size:12px;color:var(--text2);margin-bottom:10px;text-align:center">
      Letzte Übung für diesen Muskel: <span style="color:var(--text);font-weight:600">${f.lastEx}</span>
    </div>` : ''}
    <div class="s-title" style="margin-top:6px">Trainings-Historie (7 Tage)</div>
    <div class="card" style="padding:6px 12px">${histRows}</div>
  `;
  openOv('ov-muscle');
}

/* ── Die Kurve der Diagramme ─────────────────────────────────────────────
   Eine weiche Linie, an den Enden ausgeblendet, nur der aktuelle Punkt
   markiert. Der Lichtschein (Schatten um die Linie, weisses Aufhellen in der
   Mitte) ist auf Wunsch wieder entfernt — geblieben ist die Form. */
/* Der Strich laeuft an beiden Enden weich aus und steht in der Mitte voll — das
   ist die Form der Kurve, KEIN Leuchten: das weisse Aufhellen und der Schatten
   um die Linie sind auf Wunsch wieder raus. */
function _glowStroke(cv, acc){
  try {
    const g = cv.getContext('2d').createLinearGradient(0, 0, cv.clientWidth || 300, 0);
    g.addColorStop(0,   _hexA(acc, .55));
    g.addColorStop(.5,  _hexA(acc, 1));
    g.addColorStop(1,   _hexA(acc, .55));
    return g;
  } catch(_) { return acc; }
}
// #rrggbb + Deckkraft → rgba(). Chart.js bekommt Farben als Strings.
function _hexA(hex, a){
  try {
    const h = String(hex).trim().replace('#','');
    const n = h.length === 3 ? h.split('').map(x=>x+x).join('') : h;
    const r = parseInt(n.slice(0,2),16), g = parseInt(n.slice(2,4),16), b = parseInt(n.slice(4,6),16);
    if (![r,g,b].every(isFinite)) return hex;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  } catch(_) { return hex; }
}
/* Das Aussehen EINER Datenreihe im Leuchtkurven-Stil. Alle Liniendiagramme der
   App teilen es sich — Volumen, Gewicht, 1RM, Muskelgruppe, Coach-Blatt —, sonst
   sieht jede Flaeche anders aus, obwohl sie dasselbe zeigt (Gestaltungsregel 7).
   Die ACHSEN bleiben, wo sie vorher waren: sie sagen, worueber man liest. */
function _glowDs(cv, acc, n, voll){
  const letzt = (n || 1) - 1;
  return {
    borderColor:_glowStroke(cv, acc),
    borderWidth: voll ? 3.2 : 2.6,
    borderCapStyle:'round', borderJoinStyle:'round',
    tension:.45, cubicInterpolationMode:'monotone',
    fill:true, backgroundColor:_accFill(cv, acc),
    // Nur der letzte Punkt steht da: er ist der aktuelle Stand. Eine Reihe
    // gleich grosser Punkte macht aus dem Verlauf wieder eine Tabelle.
    pointRadius: c => c.dataIndex === letzt ? (voll ? 5.5 : 4) : 0,
    pointHoverRadius: voll ? 8 : 6,
    /* Weisser Kern mit farbigem Rand ist auf Schwarz ein leuchtender Punkt —
       auf einer weissen Karte ist es ein hohler Kringel, weil die Fuellung im
       Untergrund verschwindet. Hell dreht die Rollen um: Farbe innen, Weiss
       als trennender Saum. */
    pointBackgroundColor: _neonHell() ? acc : '#fff',
    pointBorderColor:     _neonHell() ? '#fff' : acc,
    pointBorderWidth: voll ? (_neonHell() ? 2.5 : 2.8) : (_neonHell() ? 2 : 2.2)
  };
}
/* Laesst die Linie wirklich leuchten statt nur hell zu sein: der Canvas-Schatten
   liegt ohne Versatz unter dem Strich, also rundherum. Der Radius kommt aus
   derselben Ueberlegung wie die --gw-Staffel im CSS; Canvas kennt keine
   CSS-Variablen, deshalb steht die Zahl hier.
   Der Schatten wird vor der Datenreihe gesetzt und danach wieder abgeraeumt —
   sonst erben Achsen und Tooltip ihn mit. */
/* Der Dimmer aus dem CSS (--neon) fuer den Canvas: Chart.js zeichnet in 2D-Kontext,
   der kennt keine Custom-Properties. Einmal auslesen, Zahl zurueck; faellt der
   Wert weg, bleibt es beim vollen Schein. */
/* Die vier Helligkeiten der Ring-Rampe aus dem CSS. Wie _neonF: der Wert steht
   im Theme, gebraucht wird er im JS. Faellt eine Zahl weg, bleibt der dunkle
   Stand — das ist der, fuer den die Rampe urspruenglich gebaut wurde. */
function _nrL(){
  const D = { c1:60, c2:72, g1:55, g2:65 };
  try {
    const cs = getComputedStyle(document.documentElement);
    const out = {};
    for (const k in D) {
      const v = parseFloat(cs.getPropertyValue('--nr-' + k));
      out[k] = isFinite(v) ? Math.max(0, Math.min(100, v)) : D[k];
    }
    return out;
  } catch(_) { return D; }
}
function _neonF(){
  try {
    const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--neon'));
    return isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
  } catch(_) { return 1; }
}
/* Derselbe Schein fuer Balken. Bis hierher leuchteten nur die Linien, und der
   Unterschied fiel genau dort auf, wo beide nebeneinander stehen: im Coach-Hub
   traegt die Wochenkachel eine leuchtende Bestwert-Linie ueber zwei matten
   Balkenreihen.

   Die Farbe kommt NICHT als eigener Begriff herein — sie ist die Balkenfarbe,
   die der Aufrufer ohnehin setzt. Ein zweiter Farbwert waere eine zweite
   Wahrheit: die Warnfarbe einer ueberzogenen Muskelgruppe wuerde in Akzentblau
   leuchten und damit dem widersprechen, was der Balken sagt.

   Ein Balken hat, anders als eine Linie, FLAECHE. Derselbe Blurwert wirkt an
   ihm deshalb staerker; 10 statt der 12/16 der Linie ist der Ausgleich. */
function _neonBarPlugin(acc){
  return {
    id:'neonbar',
    beforeDatasetDraw(chart, args){
      const ctx = chart.ctx;
      ctx.save();
      let farbe = acc;
      /* Die eigene Farbe des Datensatzes schlaegt den Akzent. backgroundColor
         ist bei den Wochenbalken ein ARRAY (nur der letzte Balken traegt den
         Akzent) — daraus laesst sich kein einzelner Schein bilden, dann bleibt
         es beim uebergebenen Akzent. */
      try {
        const ds = chart.data.datasets[(args && args.index) || 0] || {};
        if (typeof ds.backgroundColor === 'string') farbe = ds.backgroundColor;
      } catch(_) {}
      ctx.shadowColor = _hexA(farbe, .75 * _neonF());
      ctx.shadowBlur  = 10;
      ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    },
    afterDatasetDraw(chart){ chart.ctx.restore(); }
  };
}
function _neonLinePlugin(acc, voll){
  return {
    id:'neonline',
    beforeDatasetDraw(chart){
      const ctx = chart.ctx;
      ctx.save();
      ctx.shadowColor = _hexA(acc, .85 * _neonF());
      ctx.shadowBlur  = voll ? 12 : 16;
      ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    },
    afterDatasetDraw(chart){ chart.ctx.restore(); }
  };
}
/* Die gemeinsame Konfiguration beider Volumen-Diagramme (Kachel und Vollbild).
   In der KACHEL steht keine Achse mehr: sie ist eine Vorschau, und dort zaehlt
   die Form des Verlaufs — geht es rauf oder runter. Zahlen an den Raendern
   fressen dort nicht nur die halbe Flaeche, sie versprechen auch eine
   Genauigkeit, die man auf 160 Pixel Hoehe ohnehin nicht ablesen kann. Wer sie
   braucht, tippt die Kachel an; im Vollbild sind Datums- und Mengenachse da,
   und dort ist auch der Platz dafuer. */
/* ── NEON (Splits im Training-Tab) ─────────────────────────────────
   Standardmaessig AN. Bis 01.08.2026 war das eine Probe hinter localStorage
   'gt_neon', und gesetzt hat die Flag ausschliesslich _seedDemoData() — im
   Upload (DEMO_SEED=false) war der Schalter deshalb nie an, der Tab Training
   kam ohne Neon heraus. Der Default liest jetzt "an, solange nicht ausdruecklich
   abgeschaltet": nur ein explizites '0' (setNeonSplits(false)) dimmt.
   Die Optik selbst steht komplett in css/app.css (Block "NEON").
   Zuruecknehmen = den CSS-Block, diese Funktion und den Aufruf in app-boot.js raus. */
function setNeonSplits(on){
  try { localStorage.setItem('gt_neon', on ? '1' : '0'); } catch(_){}
  document.documentElement.setAttribute('data-neon', on ? '1' : '0');
}
function _applyNeonSplits(){
  let on = true;
  try { on = localStorage.getItem('gt_neon') !== '0'; } catch(_){}
  document.documentElement.setAttribute('data-neon', on ? '1' : '0');
}

function _volChartCfg(cv, pts, acc, voll){
  return {
    type:'line',
    data:{
      labels: pts.map(p=>p.x),
      // clip:false — Chart.js beschneidet eine Datenreihe sonst exakt an der
      // Zeichenflaeche, und der Schein ist Teil der Reihe. Genau daran wurde
      // im Vollbild der letzte Punkt rechts halbiert. Die Luft dafuer steht
      // unten im layout.padding; der Canvasrand kappt weiterhin alles.
      datasets:[Object.assign({ data: pts.map(p=>p.y), clip:false }, _glowDs(cv, acc, pts.length, voll))]
    },
    plugins:[_neonLinePlugin(acc, voll)],
    options:{
      responsive:true, maintainAspectRatio:false,
      // Ohne Achsen braucht die Kachel nur noch Luft fuer den Schein selbst,
      // sonst wird er am Rand des Zeichenbereichs abgeschnitten.
      // Rechts am meisten: dort sitzt der letzte Punkt (Radius 5,5 + 2,8 Rand)
      // UND sein Schein (shadowBlur 12) — zusammen gut 20 Pixel, die vorher
      // nicht da waren. Links/unten laeuft nur die Linie selbst gegen den Rand,
      // die braucht weniger.
      layout:{padding: voll ? {top:16,bottom:6,left:14,right:22}
                            : {top:12,bottom:8,left:6,right:14}},
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>fmtKg(c.parsed.y)}}},
      scales: voll
        ? { x:{grid:{display:false},ticks:_cXT(pts.length)},
            y:_cYT(v=>fmtKg(v)) }
        : { x:{display:false,grid:{display:false}},
            y:{display:false,grid:{display:false},grace:'14%'} }
    }
  };
}

/* ════════════════════════════════════════════════════════════════
   VOLUMEN-VOLLBILD
   ════════════════════════════════════════════════════════════════ */
let _volFullChart = null;
function openVolumeFull() {
  openOv('ov-volume');
  setTimeout(() => {
    if (_volFullChart) { _volFullChart.destroy(); _volFullChart = null; }
    const canvas = document.getElementById('vol-full-chart');
    if (!canvas) return;
    const sessions = [...S.sessions].sort((a,b) => new Date(a.date) - new Date(b.date));
    const pts = sessions.map(s => ({x: dateShort(s.date), y: sessionVolume(s)})).filter(p => p.y > 0);
    const acc = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#007AFF';
    _volFullChart = new Chart(canvas.getContext('2d'), _volChartCfg(canvas, pts, acc, true));
  }, 60);
}

function renderStats() {
  invalidateFatigue();
  renderStatsSummary();
  renderStatsOverallChart();
  renderFatigueMini();
  renderWeekCircles();
  renderStatsMuscleGroups();
  renderStatsExerciseList();
}

// ── ERFOLGE (Meilensteine, Trainingszeit, Kraftsteigerung) ──
function _erfHours(sec) {
  const totalMin = Math.round((sec || 0) / 60);
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  if (h <= 0) return m + ' min';
  return m ? `${h} h ${m} min` : `${h} h`;
}

// Zeitraum-Filter für die Erfolge-Seite: Cutoff-Zeitstempel (0 = Gesamt/kein Filter)
function _erfCutoff(period) {
  const now = new Date();
  const d = new Date(now);
  if (period === 'week')  { d.setDate(d.getDate() - 7);          return d.getTime(); }
  if (period === 'month') { d.setMonth(d.getMonth() - 1);        return d.getTime(); }
  if (period === 'year')  { d.setFullYear(d.getFullYear() - 1);  return d.getTime(); }
  return 0; // Gesamt
}
function setErfPeriod(p) {
  S.erfPeriod = p;
  persist();
  hapticTick();
  renderErfolge();
}

function _erfTotals() {
  const sessions = S.sessions || [];
  const totalTimeSec = sessions.reduce((a, s) => a + (s.duration || 0), 0);
  const totalVol     = sessions.reduce((a, ses) => a + sessionVolume(ses), 0);
  return { totalSessions: sessions.length, totalTimeSec, totalVol, totalHours: totalTimeSec / 3600 };
}

/* Die Meilensteine (Erste Einheit, 10/25/50/100 Einheiten, Stunden, Tonnage)
   sind ENTFERNT — Anzeige, Belohnungs-Toast und Merkliste. Sie feierten Zahlen,
   die mit dem Training nichts zu tun haben: wer 100 Einheiten hat, weiss das.
   S.erfAchieved bleibt als Feld in den Firestore-Rules erlaubt, damit aeltere
   Installationen weiter hochladen duerfen; geschrieben wird es hier nicht mehr. */

/* Kraft je Muskelgruppe im gewaehlten Zeitraum: Ausgangswert (erste Einheit im
   Zeitraum) und Bestwert (beste Einheit im Zeitraum), beides als Summe der
   geschaetzten Einermaxima der Uebungen dieser Gruppe. EINE Rechnung fuer
   Netzdiagramm und Balken — zwei Rechnungen waeren zwei Wahrheiten auf einer
   Flaeche, und genau das ist in dieser App schon einmal passiert. */
function _erfKraft(cutoff){
  return MUSCLE_GROUPS.map(mg => {
    const exs = S.exercises.filter(e => e.muscleGroup === mg.id);
    let start = 0, now = 0, hasData = false;
    exs.forEach(e => {
      let hist = exHistory(e.id);
      if (cutoff) hist = hist.filter(h => new Date(h.date).getTime() >= cutoff);
      if (!hist.length) return;
      const startB = setsBest1RM(hist[0].sets);
      let best = 0;
      hist.forEach(h => { const b = setsBest1RM(h.sets); if (b > best) best = b; });
      if (best > 0) { start += startB; now += best; hasData = true; }
    });
    return { mg, start, now, hasData };
  }).filter(k => k.hasData && k.now > 0);
}
/* ── Das Netzdiagramm ────────────────────────────────────────────────────
   Alles auf EINEM Fleck: wo du stehst (blaue Flaeche), wo du gestartet bist
   (gruene Linie) und wie die Gruppen zueinander stehen. Die Balken darunter
   sagen dasselbe je Gruppe in Zahlen — das Netz ist der Ueberblick, die Balken
   sind die Einzelheiten.

   Skala: JEDE Achse geht bis zum staerksten Wert ueber alle Gruppen, nicht bis
   zum eigenen. Sonst laege jede Gruppe am Rand und das Netz waere immer ein
   volles Sechseck — die Aussage "Beine sind weiter als Arme" ginge verloren.

   Mindestens DREI Gruppen: mit zwei Achsen zeichnet ein Netz eine Linie. */
let erfRadarChart = null;
function _erfRadarDraw(kraft){
  try {
    const cv = document.getElementById('erf-radar');
    if (erfRadarChart) { erfRadarChart.destroy(); erfRadarChart = null; }
    if (!cv || kraft.length < 3) return;
    const acc = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#007AFF';
    const txt2 = getComputedStyle(document.documentElement).getPropertyValue('--text2').trim() || '#888';
    const max = Math.max(...kraft.map(k => k.now), 1);
    const skal = w => Math.round(w / max * 100);
    erfRadarChart = new Chart(cv.getContext('2d'), {
      type:'radar',
      data:{
        // Zwei Zeilen je Achse: Name und darunter "jetzt / Start" — dieselbe
        // Anordnung wie in der Vorlage, nur mit echten Kilo statt Spielwerten.
        labels: kraft.map(k => [tr(k.mg.label), fmt1RM(k.now) + ' / ' + fmt1RM(k.start)]),
        /* Beide Reihen starten auf 0 und werden gleich nach dem ersten Bild auf
           die echten Werte gesetzt (siehe unten). Grund: Chart.js animiert beim
           ERSTEN Aufbau die Punktkoordinaten aus dem Nullpunkt der Zeichen-
           flaeche — also aus der linken oberen Ecke. Das war der Sprung: die
           Flaeche flog von schraeg oben herein, statt zu wachsen. Aus einer
           Wertaenderung 0 → Wert macht dieselbe Animation dagegen genau das,
           was die Balken darunter auch tun: sie waechst aus der Mitte nach
           aussen, jede Achse in ihre eigene Laenge. */
        datasets:[
          { label:tr('Jetzt'), data:kraft.map(() => 0),
            borderColor:acc, backgroundColor:_hexA(acc,.16), borderWidth:2.4,
            pointRadius:3.2, pointBackgroundColor:acc, pointBorderColor:'#fff', pointBorderWidth:1.4 },
          { label:tr('Start'), data:kraft.map(() => 0),
            borderColor:'#41d869', backgroundColor:'rgba(65,216,105,.09)', borderWidth:1.8,
            pointRadius:0, pointHoverRadius:5 }
        ]
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        /* Ruckelfrei in der WKWebView — drei Stellschrauben, alle drei noetig:

           1. Aufloesung deckeln. Chart.js zeichnet per Vorgabe in Geraete-
              pixeln; auf dem iPhone sind das 3x, bei 330 px Kantenlaenge also
              knapp eine Million Pixel, die JEDES Bild neu gefuellt werden —
              Flaeche, Linien und zwoelf Beschriftungszeilen. Bei 2x ist es
              weniger als die Haelfte, und auf einer Netzflaeche mit weichen
              Kanten sieht man den Unterschied nicht.
           2. Dieselbe Taktung wie die uebrigen Aufbauten der Seite: die Balken
              darunter wachsen in 550 ms mit derselben ausklingenden Kurve. Das
              Netz laeuft MIT ihnen los, nicht danach — verzoegert gestartet
              wirkte es wie nachgereicht, obwohl die Seite laengst steht.
           3. KEIN resizeDelay. Es stand hier und war genau der Ruck: Chart.js
              zeichnet dann einmal in der Groesse, die es beim Erzeugen
              vorfindet, und springt eine Sperrzeit spaeter auf die
              tatsaechliche — sichtbar als einmaliges Verrutschen des ganzen
              Diagramms mitten im Aufbau. Statt dessen wird erst gezeichnet,
              wenn die Seite steht (zwei Bilder Vorlauf, s. renderErfolge). */
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        animation:{ duration:560, easing:'easeOutQuart' },
        animations:{ colors:false },
        // Die Ecken-Beschriftung steht AUSSERHALB der Netzflaeche und wurde links
        // und rechts abgeschnitten: Chart.js rechnet den Platz dafuer nicht in
        // die Flaeche ein. Seitlich deshalb deutlich mehr Luft als oben.
        layout:{padding:{top:8,bottom:8,left:30,right:30}},
        plugins:{
          legend:{display:false},
          // Auch KEIN Tooltip: das Netz reagiert auf gar nichts mehr. Die Werte
          // stehen an den Ecken, die Einzelheiten als Balken darunter — eine
          // Flaeche, die auf Beruehrung etwas einblendet, ist ein Bedienelement,
          // und genau das soll sie nicht sein.
          tooltip:{enabled:false}
        },
        scales:{ r:{
          min:0, max:100, beginAtZero:true,
          angleLines:{color:'rgba(128,128,128,.16)'},
          grid:{color:'rgba(128,128,128,.13)'},
          ticks:{display:false, stepSize:25},
          pointLabels:{color:txt2, font:{size:9.5, weight:'700'}, padding:4,
            // Zweizeilig bleibt es, aber lange Gruppennamen werden gekuerzt —
            // sonst schiebt eine Zeile wie "Oberschenkel-Rueckseite" das Netz
            // aus dem Bild.
            callback:(l) => Array.isArray(l)
              ? [String(l[0]).length > 12 ? String(l[0]).slice(0,11) + '…' : l[0], l[1]] : l}
        }},
        // Das Netz ist eine Anzeige, kein Bedienelement: keine Ereignisse, kein
        // Klick, kein Tooltip. Die Details je Gruppe stehen als Balken darunter.
        events:[]
      }
    });
    /* Jetzt die echten Werte nachreichen: das Netz waechst aus der Mitte in
       seine Form. Ein Bild abwarten, sonst faellt Chart.js beides in denselben
       Aufbau zusammen und der Sprung aus der Ecke waere zurueck. Bei
       „Bewegung reduzieren" stehen die Werte sofort — wie ueberall in der App. */
    /* Netz mittig ruecken. Chart.js legt den Mittelpunkt NICHT in die Mitte der
       Flaeche, sondern in die Mitte dessen, was nach Abzug der Eckentexte uebrig
       bleibt — und die sind links und rechts verschieden breit („Rücken 355,8 kg
       / 160,8 kg" gegen „Arme 64,4 kg / 28,0 kg"). Das Netz sass dadurch sichtbar
       aus der Mitte. Hier wird der Versatz gemessen und mit Aussenabstand
       ausgeglichen: eine Seite um 2x den Versatz breiter macht den Mittelpunkt
       um genau den Versatz wandern. Das laeuft OHNE Animation und solange alle
       Werte noch auf 0 stehen — sichtbar ist da nur ein Punkt in der Mitte, also
       ruckt nichts. */
    const zentrieren = () => {
      const c = erfRadarChart, r = c && c.scales && c.scales.r;
      if (!r) return;
      const p = c.options.layout.padding;
      const dx = Math.round(c.width  / 2 - r.xCenter);
      const dy = Math.round(c.height / 2 - r.yCenter);
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      if (dx > 0) p.left = (p.left || 0) + 2 * dx; else if (dx < 0) p.right = (p.right || 0) - 2 * dx;
      if (dy > 0) p.top  = (p.top  || 0) + 2 * dy; else if (dy < 0) p.bottom = (p.bottom || 0) - 2 * dy;
      c.update('none');
    };
    zentrieren();
    zentrieren();   // zweiter Durchlauf: der Abstand verkleinert den Radius leicht
    const zJetzt = kraft.map(k => skal(k.now));
    const zStart = kraft.map(k => skal(k.start));
    const ruhig = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const setzen = () => {
      if (!erfRadarChart) return;
      erfRadarChart.data.datasets[0].data = zJetzt;
      erfRadarChart.data.datasets[1].data = zStart;
      erfRadarChart.update(ruhig ? 'none' : undefined);
    };
    if (ruhig) setzen(); else requestAnimationFrame(setzen);
  } catch(e) { console.warn('[Erfolge] Netzdiagramm:', e); }
}
function renderErfolge() {
  const sub  = document.getElementById('erfolge-sub');
  const body = document.getElementById('erfolge-body');
  if (!body) return;

  const sessions      = S.sessions || [];
  const totalSessions = sessions.length;
  const totalTimeSec  = sessions.reduce((a, s) => a + (s.duration || 0), 0);

  if (sub) sub.textContent = totalSessions
    ? `${totalSessions} Einheit${totalSessions !== 1 ? 'en' : ''} · ${_erfHours(totalTimeSec)} trainiert`
    : 'Deine Ziele warten — leg los!';

  // Hinweis: Auch ohne Daten wird die volle Struktur gezeigt (Meilensteine als Ziele).

  // ── Zeitraum-Filter (Woche / Monat / Jahr / Gesamt) ──
  const period = S.erfPeriod || 'all';
  const cutoff = _erfCutoff(period);
  const perSessions = cutoff ? sessions.filter(s => new Date(s.date).getTime() >= cutoff) : sessions;
  const perTimeSec  = perSessions.reduce((a, s) => a + (s.duration || 0), 0);

  const kraft = _erfKraft(cutoff);

  const maxNow = Math.max(...kraft.map(k => k.now), 1);

  let kraftHtml;
  if (!kraft.length) {
    const emptyMsg = period === 'all'
      ? 'Trage Gewicht & Wiederholungen ein, um deine Kraftentwicklung pro Muskel zu sehen.'
      : 'In diesem Zeitraum gibt es noch nicht genug Trainings für eine Auswertung. Wähle einen längeren Zeitraum.';
    kraftHtml = `<div class="card"><div style="padding:18px;color:var(--text2);font-size:14px;text-align:center;position:relative;z-index:1">
      ${emptyMsg}
    </div></div>`;
  } else {
    // Balken auf gemeinsamer Skala (maxNow): gedämpftes Segment = Ausgangskraft,
    // grünes Segment = Zuwachs. So ist der Zuwachs direkt als grüner Anteil erkennbar.
    kraftHtml = `<div class="card">` + kraft.map(k => {
      const delta = k.now - k.start;
      const pct   = k.start > 0 ? (delta / k.start * 100) : 0;
      const up    = delta > 0.05;
      const deltaTxt = up ? `▲ +${pct.toFixed(0)} %` : '±0 %';
      const baseW = Math.round(k.start / maxNow * 100);
      const gainW = up ? Math.round(delta / maxNow * 100) : 0;
      return `<div class="erf-kraft-row" onclick="openKraftDetail('${k.mg.id}')">
        <div class="erf-kraft-top">
          <span class="erf-kraft-name">${k.mg.label}<span class="erf-chev">›</span></span>
          <span class="erf-kraft-delta${up ? '' : ' flat'}">${deltaTxt}</span>
        </div>
        <div class="erf-kraft-bar${gainW ? '' : ' solo'}">
          <div class="erf-kraft-base" style="width:0" data-w="${baseW}"></div>
          <div class="erf-kraft-gain" style="width:0" data-w="${gainW}"></div>
        </div>
        <div class="erf-kraft-sub">Start ${fmt1RM(k.start)} → jetzt <b>${fmt1RM(k.now)}</b>${up ? ` · <b class="up">+${fmt1RM(delta)}</b> Zuwachs` : ''}</div>
      </div>`;
    }).join('') + `</div>`;
  }

  const kraftLegend = kraft.length ? `<div class="erf-legend">
      <span class="erf-legend-item"><span class="erf-legend-sw base"></span>Ausgangskraft</span>
      <span class="erf-legend-item"><span class="erf-legend-sw gain"></span>Zuwachs</span>
      <span style="margin-left:auto">Tippen für Details ›</span>
    </div>` : '';

  const periodLbl = { week:'Diese Woche', month:'Dieser Monat', year:'Dieses Jahr', all:'Gesamt' }[period];

  body.innerHTML = `
    <div class="erf-period-seg">
      <button class="${period==='week' ?'on':''}" onclick="setErfPeriod('week')">Woche</button>
      <button class="${period==='month'?'on':''}" onclick="setErfPeriod('month')">Monat</button>
      <button class="${period==='year' ?'on':''}" onclick="setErfPeriod('year')">Jahr</button>
      <button class="${period==='all'  ?'on':''}" onclick="setErfPeriod('all')">Gesamt</button>
    </div>

    <div class="erf-time-line">${periodLbl} · Trainingszeit · <b>${_erfHours(perTimeSec)}</b> · ${perSessions.length} Einheit${perSessions.length!==1?'en':''}</div>

    ${kraft.length >= 3 ? `<div>
      <div class="s-title">${tr('Kraftverteilung')}</div>
      <div class="card erf-radar-card">
        <div class="erf-radar-legend">
          <span><i class="jetzt"></i>${tr('Jetzt')}</span>
          <span><i class="start"></i>${tr('Start')}</span>
        </div>
        <div class="erf-radar-wrap"><canvas id="erf-radar"></canvas></div>
      </div>
    </div>` : ''}

    <div>
      <div class="s-title">Kraftsteigerung pro Muskel</div>
      ${kraftLegend}
      ${kraftHtml}
    </div>
`;

  // Balken-Segmente aus 0 hochwachsen lassen (nach dem ersten Paint)
  requestAnimationFrame(() => requestAnimationFrame(() => {
    body.querySelectorAll('.erf-kraft-base,.erf-kraft-gain').forEach(f => { f.style.width = (f.dataset.w || 0) + '%'; });
  }));
  /* Das Netz erst NACH dem Einhaengen zeichnen: Chart.js misst die Flaeche, und
     ein Canvas, das noch nicht im Dokument steht, misst 0. Zwei Bilder Vorlauf,
     nicht eines — beim ersten steht das Seitenlayout noch nicht endgueltig, und
     dann zeichnet Chart.js in einer Groesse, die es kurz darauf korrigiert. Das
     war der Ruck, bei dem das ganze Diagramm einmal versprang. */
  requestAnimationFrame(() => requestAnimationFrame(() => _erfRadarDraw(kraft)));
}

// Bester Satz (höchstes geschätztes 1RM) innerhalb einer Satz-Liste.
function _bestSetOf(sets) {
  let best = null, bestE = 0;
  (sets || []).forEach(s => { const e = epley1RM(s.w, s.r); if (e > bestE) { bestE = e; best = s; } });
  return best ? { set: best, oneRM: bestE } : null;
}

// Für eine Übung: Start-Satz (erste Einheit) + bester je erreichter Satz – passend zur Erfolge-Summe.
function _exKraftDetail(exId) {
  const hist = exHistory(exId);            // chronologisch: hist[0] = erste Einheit
  if (!hist.length) return null;
  const startB = _bestSetOf(hist[0].sets);
  let bestEntry = null, bestE = 0;
  hist.forEach(h => { const b = _bestSetOf(h.sets); if (b && b.oneRM > bestE) { bestE = b.oneRM; bestEntry = { date: h.date, set: b.set, oneRM: b.oneRM }; } });
  if (!startB || !bestEntry) return null;
  return { startEntry: { date: hist[0].date, set: startB.set, oneRM: startB.oneRM }, bestEntry };
}

// Detail-Sheet: zeigt nachvollziehbar, wie die Kraftsteigerung der Gruppe zustande kommt.
function openKraftDetail(mgId) {
  haptic(6);
  const mg = MUSCLE_GROUPS.find(g => g.id === mgId);
  if (!mg) return;
  const rows = S.exercises
    .filter(e => e.muscleGroup === mgId)
    .map(e => ({ e, d: _exKraftDetail(e.id) }))
    .filter(x => x.d)
    .sort((a, b) => (b.d.bestEntry.oneRM - b.d.startEntry.oneRM) - (a.d.bestEntry.oneRM - a.d.startEntry.oneRM));

  document.getElementById('kd-title').textContent = mg.label + ' — Kraftaufbau';
  const body = document.getElementById('kd-body');

  if (!rows.length) {
    body.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text2);font-size:14px">Noch keine verwertbaren Sätze für diese Gruppe.</div>`;
    openOv('ov-kraft');
    return;
  }

  const start = rows.reduce((a, r) => a + r.d.startEntry.oneRM, 0);
  const now   = rows.reduce((a, r) => a + r.d.bestEntry.oneRM, 0);
  const gUp   = now - start > 0.05;
  const gPct  = start > 0 ? (now - start) / start * 100 : 0;

  body.innerHTML = `
    <div class="kd-formula">
      <!-- Textknoten bewusst einzeilig: <b> zerteilt den Satz, und ein Fragment
           mit Zeilenumbruch trifft keinen I18N_EN-Schluessel mehr. -->
      <b>So entsteht der Wert:</b><span> Pro Satz wird ein geschätztes Einer-Maximum (1RM) berechnet — </span><b>Gewicht × (1 + Wdh ÷ 30)</b><span>. „Start" ist der beste Satz deiner </span><b>ersten Einheit</b><span> einer Übung, „Bestwert" dein bisher bester Satz. Die 1RM aller Übungen der Gruppe werden summiert.</span>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <span style="font-size:13px;color:var(--text2)">Gruppe gesamt</span>
      <span style="font-size:16px;font-weight:800;color:${gUp ? _neonInk('#41d869') : 'var(--text2)'}">${gUp ? '▲ +' + gPct.toFixed(0) + ' %' : '±0 %'}</span>
    </div>
    <div style="font-size:13px;color:var(--text2);margin-bottom:6px">Start ${fmt1RM(start)} → jetzt <b style="color:var(--text)">${fmt1RM(now)}</b></div>
    ${rows.map(r => {
      const s = r.d.startEntry, b = r.d.bestEntry;
      const d = b.oneRM - s.oneRM;
      const exUp = d > 0.05;
      const p = s.oneRM > 0 ? d / s.oneRM * 100 : 0;
      const maxv = Math.max(b.oneRM, 1);
      const baseW = Math.round(Math.min(s.oneRM, b.oneRM) / maxv * 100);
      const gainW = exUp ? Math.round(d / maxv * 100) : 0;
      return `<div class="kd-ex">
        <div class="kd-ex-head">
          <span class="kd-ex-name">${esc(r.e.name)}</span>
          <span class="kd-ex-delta${exUp ? '' : ' flat'}">${exUp ? '+' + p.toFixed(0) + ' %' : '±0 %'}</span>
        </div>
        <div class="kd-step"><span class="kd-step-dot start"></span><span class="kd-step-lbl">Start</span><span class="kd-step-val">${fmtWeight(s.set.w)} × ${s.set.r} → <b>${fmt1RM(s.oneRM)}</b></span><span class="kd-step-date">${dateShort(s.date)}</span></div>
        <div class="kd-step"><span class="kd-step-dot best"></span><span class="kd-step-lbl">Bestwert</span><span class="kd-step-val">${fmtWeight(b.set.w)} × ${b.set.r} → <b>${fmt1RM(b.oneRM)}</b></span><span class="kd-step-date">${dateShort(b.date)}</span></div>
        <div class="kd-bar${gainW ? '' : ' solo'}"><div class="b" style="width:${baseW}%"></div>${gainW ? `<div class="g" style="width:${gainW}%"></div>` : ''}</div>
      </div>`;
    }).join('')}
  `;
  openOv('ov-kraft');
}

function renderStatsSummary() {
  const sub = document.getElementById('stats-sub');
  const el  = document.getElementById('stats-summary');
  const totalSessions = S.sessions.length;
  const totalSets = S.sessions.reduce((s, ses) => s + ses.logs.reduce((a,l)=>a+l.sets.length,0), 0);
  const totalVol  = S.sessions.reduce((s, ses) => s + sessionVolume(ses), 0);
  if (sub) sub.textContent = totalSessions ? totalSessions+' Einheit'+(totalSessions!==1?'en':'') : 'Noch keine Daten';
  el.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
    <div style="text-align:center;background:var(--gl-bg-t);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid var(--gl-bdr);border-radius:16px;padding:14px 8px;box-shadow:var(--gl-shad)">
      <div style="font-size:22px;font-weight:700">${totalSessions}</div>
      <div style="font-size:11px;color:var(--text2);margin-top:2px">Einheiten</div>
    </div>
    <div style="text-align:center;background:var(--gl-bg-t);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid var(--gl-bdr);border-radius:16px;padding:14px 8px;box-shadow:var(--gl-shad)">
      <div style="font-size:22px;font-weight:700">${totalSets}</div>
      <div style="font-size:11px;color:var(--text2);margin-top:2px">Sätze</div>
    </div>
    <div style="text-align:center;background:var(--gl-bg-t);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid var(--gl-bdr);border-radius:16px;padding:14px 8px;box-shadow:var(--gl-shad)">
      <div style="font-size:22px;font-weight:700">${fmtKg(totalVol)}</div>
      <div style="font-size:11px;color:var(--text2);margin-top:2px">Volumen</div>
    </div>
  </div>`;
}

function renderStatsOverallChart() {
  const empty = document.getElementById('stats-overall-empty');
  const canvas = document.getElementById('stats-overall-chart');
  if (statsOverallChart) { statsOverallChart.destroy(); statsOverallChart = null; }

  const sessions = [...S.sessions].sort((a,b) => new Date(a.date) - new Date(b.date));
  const pts = sessions.map(s => ({x: dateShort(s.date), y: sessionVolume(s)})).filter(p => p.y > 0);

  if (!pts.length) {
    if (empty) empty.style.display = '';
    if (canvas) canvas.style.display = 'none';
    return;
  }
  if (empty)  empty.style.display = 'none';
  if (canvas) canvas.style.display = '';

  const acc = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#007AFF';
  statsOverallChart = new Chart(canvas.getContext('2d'), _volChartCfg(canvas, pts, acc, false));
  // Die Kennzahl ueber der Kurve: letzte Einheit und der Vergleich zur
  // vorletzten. Die Vorlage stellt die ZAHL nach vorn und laesst die Linie den
  // Verlauf erzaehlen — ohne sie war die Kachel eine Linie ohne Aussage.
  try {
    const kopf = document.getElementById('stats-vol-kopf');
    if (kopf) {
      const letzt = pts[pts.length - 1].y, vor = pts.length > 1 ? pts[pts.length - 2].y : 0;
      let d = '';
      if (vor > 0) {
        const p = Math.round((letzt - vor) / vor * 100);
        d = '<i class="' + (p >= 0 ? 'up' : 'dn') + '">' + (p >= 0 ? '↗' : '↘') + ' ' + Math.abs(p) + ' %</i>';
      }
      kopf.innerHTML = '<b>' + esc(fmtKg(letzt)) + '</b>' + d;
    }
  } catch(e) { console.warn('[Stats] Volumen-Kennzahl:', e); }
}

function statsMode()  {
  // 'splits' = dynamische Linse aus den eigenen/importierten Splits
  if (S.statsFilterMode === 'splits') {
    return { id:'splits', label:'Splits', groups:(S.workoutPresets||[]).map(p => ({ id:p.id, label:p.name, isSplit:true, color:splitColor(p) })) };
  }
  return GROUP_MODES.find(m => m.id === S.statsFilterMode) || GROUP_MODES[0];
}
// Übungs-IDs einer Statistik-Gruppe — Muskel-Modus über Zugehörigkeit, Split-Linse über preset.exIds
function _statGroupExIds(mode, g){
  if (mode.id === 'splits') { const p = presetById(g.id); return p ? _presetExIdsExisting(p) : []; }
  return S.exercises.filter(e => exInGroup(e, mode.id, g.id)).map(e => e.id);
}

/* ── Gleitende Pille im Segment-Umschalter ─────────────────────────
   Die Felder sind unterschiedlich breit ("Muskeln" vs. "Splits"), darum kann
   die Pille nicht in CSS stehen — Breite und Weg kommen aus der Geometrie des
   aktiven Knopfes. left:0 der Pille und offsetLeft haben dieselbe Bezugskante
   (Innenkante des Rahmens), deshalb passt translateX ohne Korrektur. */
function _fmodeSyncThumb(wrap){
  if (!wrap) return;
  const thumb = wrap.querySelector('.fmode-thumb');
  const on    = wrap.querySelector('.fmode-btn.on');
  // Unsichtbar (anderer Tab, display:none) misst der Browser 0 — dann NICHTS
  // setzen, sonst steht die Pille auf Breite 0 und schnellt beim Sichtbarwerden
  // auf. Der ResizeObserver holt es nach, sobald die Leiste eine Groesse hat.
  if (!thumb || !on || !on.offsetWidth) return;
  const ersterSitz = !thumb.style.width;
  if (ersterSitz) thumb.classList.add('fmode-nofx');
  thumb.style.width = on.offsetWidth + 'px';
  thumb.style.transform = 'translateX(' + on.offsetLeft + 'px)';
  // Reflow erzwingen, bevor der Uebergang zurueckkommt: sonst faehrt die Pille
  // beim ersten Zeigen von links herein statt einfach dazustehen.
  if (ersterSitz) { void thumb.offsetWidth; thumb.classList.remove('fmode-nofx'); }
}
/* Nachziehen, wenn die Leiste ihre Groesse bekommt (Tab-Wechsel, Drehung,
   Schriftgroesse des Systems). Ein einmaliger Aufruf beim Rendern reicht nicht:
   der Statistik-Tab ist beim ersten Rendern oft noch ausgeblendet. */
function _fmodeObserve(wrap){
  if (!wrap || wrap._fmodeRO || typeof ResizeObserver === 'undefined') return;
  wrap._fmodeRO = new ResizeObserver(() => _fmodeSyncThumb(wrap));
  wrap._fmodeRO.observe(wrap);
}

function setStatsFilterMode(mode) {
  if (S.statsFilterMode === mode) return;
  S.statsFilterMode = mode;
  persist();
  renderStatsMuscleGroups();
}

function renderStatsMuscleGroups() {
  // Mode-Switcher: Standard nur Muskelgruppen; „Splits" nur, wenn eigene/importierte Splits da sind
  const hasSplits = (S.workoutPresets || []).length > 0;
  if (S.statsFilterMode !== 'muskel' && !(S.statsFilterMode === 'splits' && hasSplits)) S.statsFilterMode = 'muskel';
  const modeBar = document.getElementById('stats-mode-switch');
  if (modeBar) {
    const modes = [{ id:'muskel', label:'Muskeln' }];
    if (hasSplits) modes.push({ id:'splits', label:'Splits' });
    modeBar.style.display = modes.length > 1 ? '' : 'none';
    // Die Leiste wird nur neu gebaut, wenn sich die Felder selbst aendern (Splits
    // kommen dazu/fallen weg). Beim blossen Umschalten bleibt das DOM stehen und
    // nur die Pille wandert — ein Neuaufbau wuerde sie zerstoeren und neu
    // hinsetzen, und genau das soll ja nicht mehr passieren.
    const sig = modes.map(m => m.id).join('|');
    if (modeBar.dataset.modes !== sig) {
      modeBar.dataset.modes = sig;
      modeBar.classList.add('fmode-slide');
      modeBar.innerHTML = '<span class="fmode-thumb"></span>' + modes.map(m =>
        `<button class="fmode-btn${S.statsFilterMode===m.id?' on':''}" onclick="setStatsFilterMode('${m.id}')">${esc(m.label)}</button>`
      ).join('');
      _fmodeObserve(modeBar);
    } else {
      modeBar.querySelectorAll('.fmode-btn').forEach((b, i) =>
        b.classList.toggle('on', modes[i] && modes[i].id === S.statsFilterMode));
    }
    _fmodeSyncThumb(modeBar);
  }
  // Titel an Modus anpassen
  const title = document.getElementById('stats-mg-title');
  if (title) title.textContent = statsMode().id === 'splits' ? 'Deine Splits' : 'Muskelgruppen';

  const el = document.getElementById('stats-mg-list');
  const mode = statsMode();
  const groups = mode.id === 'splits' ? mode.groups : mode.groups.filter(g => g.muscles && g.muscles.length);

  const rows = groups.map(g => {
    const exIds = _statGroupExIds(mode, g);
    const vol = S.sessions.reduce((sum, ses) => sum + sessionVolume(ses, exIds), 0);
    let best1rm = 0;
    exIds.forEach(id => { const e = exBest1RM(id); if (e > best1rm) best1rm = e; });
    return { g, exCount: exIds.length, vol, best1rm };
  }).filter(r => r.exCount > 0);

  if (!rows.length) {
    el.innerHTML = `<div style="padding:18px;color:var(--text2);font-size:14px;text-align:center;position:relative;z-index:1">
      Lege Übungen mit Muskelgruppen an, um hier eine Übersicht zu sehen.
    </div>`;
    return;
  }
  el.innerHTML = rows.map(r => `
    <div class="row tap" onclick="openGroupStat('${r.g.id}')">
      <div class="row-body">
        <div class="row-title">${r.g.label}</div>
        <div class="row-sub">${r.exCount} Übung${r.exCount!==1?'en':''} · ${fmtKg(r.vol)} Volumen${r.best1rm ? ' · 1RM '+fmt1RM(r.best1rm) : ''}</div>
      </div>
      <div class="chev">›</div>
    </div>
  `).join('');
}

let statsExSearchText = '';
function setStatsExSearch(v, fromClear) {
  statsExSearchText = (v || '').trim();
  const inp = document.getElementById('stats-ex-search');
  if (inp && fromClear) inp.value = '';
  const clr = document.getElementById('stats-ex-search-clr');
  if (clr) clr.classList.toggle('on', !!statsExSearchText);
  renderStatsExerciseList();
}

function renderStatsExerciseList() {
  const el = document.getElementById('stats-ex-list');
  if (!S.exercises.length) {
    el.innerHTML = `<div style="padding:18px;color:var(--text2);font-size:14px;text-align:center;position:relative;z-index:1">
      Noch keine Übungen angelegt.
    </div>`;
    return;
  }
  // Nach Muskelgruppe sortieren, dann nach Namen
  let sorted = [...S.exercises].sort((a,b) => {
    const ma = a.muscleGroup || 'zzz', mb = b.muscleGroup || 'zzz';
    if (ma !== mb) return ma.localeCompare(mb);
    return a.name.localeCompare(b.name);
  });
  // Such-Filter
  if (statsExSearchText) {
    const q = _normSearch(statsExSearchText);
    sorted = sorted.filter(ex => _normSearch(ex.name).includes(q));
  }
  if (!sorted.length) {
    el.innerHTML = `<div style="padding:18px;color:var(--text2);font-size:14px;text-align:center;position:relative;z-index:1">
      Nichts gefunden für „${statsExSearchText}".
    </div>`;
    return;
  }
  el.innerHTML = sorted.map(ex => {
    const hist = exHistory(ex.id);
    const last = hist.length ? hist[hist.length-1] : null;
    const lw   = last ? maxW(last.sets) : 0;
    const ses  = hist.length;
    const mgLabel = ex.muscleGroup ? muscleLabel(ex.muscleGroup) : '–';
    const e1rm = exBest1RM(ex.id);
    const sub  = `${mgLabel} · ${ses} Einheit${ses!==1?'en':''}${lw ? ' · Max '+lw+' kg' : ''}${e1rm ? ' · 1RM '+fmt1RM(e1rm) : ''}`;
    return `<div class="row tap" onclick="openDet('${ex.id}')">
      <div class="ico">${ex.emoji}</div>
      <div class="row-body">
        <div class="row-title">${esc(ex.name)}</div>
        <div class="row-sub">${sub}</div>
      </div>
      <div class="chev">›</div>
    </div>`;
  }).join('');
}

// ── GRUPPEN-DETAIL (Muskel / PPL / Ober-Unter) ────────
function openGroupStat(groupId) {
  const mode = statsMode();
  const g = mode.groups.find(g => g.id === groupId);
  if (!g) return;
  mgStatId = groupId;
  document.getElementById('mg-stat-title').textContent = g.label;

  const exIds = _statGroupExIds(mode, g);
  const sessions = [...S.sessions]
    .map(s => ({date: s.date, vol: sessionVolume(s, exIds)}))
    .filter(s => s.vol > 0)
    .sort((a,b) => new Date(a.date) - new Date(b.date));

  // Summary inkl. bestem 1RM
  const totalVol = sessions.reduce((a,s) => a + s.vol, 0);
  const sesCount = sessions.length;
  let best1rm = 0;
  exIds.forEach(id => { const e = exBest1RM(id); if (e > best1rm) best1rm = e; });
  document.getElementById('mg-stat-summary').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
      <div style="text-align:center;background:var(--gl-bg-t);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid var(--gl-bdr);border-radius:16px;padding:14px 6px;box-shadow:var(--gl-shad)">
        <div style="font-size:20px;font-weight:700">${sesCount}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:2px">Einheiten</div>
      </div>
      <div style="text-align:center;background:var(--gl-bg-t);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid var(--gl-bdr);border-radius:16px;padding:14px 6px;box-shadow:var(--gl-shad)">
        <div style="font-size:20px;font-weight:700">${fmtKg(totalVol)}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:2px">Volumen</div>
      </div>
      <div style="text-align:center;background:var(--gl-bg-t);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid var(--gl-bdr);border-radius:16px;padding:14px 6px;box-shadow:var(--gl-shad)">
        <div style="font-size:20px;font-weight:700;color:var(--acc)">${best1rm ? fmt1RM(best1rm) : '–'}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:2px">Bestes 1RM</div>
      </div>
    </div>`;

  // Chart
  renderMgStatChart(sessions);

  // Übungen dieser Gruppe
  const exEl = document.getElementById('mg-stat-ex');
  const exs  = exIds.map(id => exById(id)).filter(Boolean);
  if (!exs.length) {
    exEl.innerHTML = `<div style="padding:14px;color:var(--text2);font-size:14px">Keine Übungen in dieser Gruppe.</div>`;
  } else {
    exEl.innerHTML = exs.map(ex => {
      const hist = exHistory(ex.id);
      const last = hist.length ? hist[hist.length-1] : null;
      const lw = last ? maxW(last.sets) : 0;
      const e1rm = exBest1RM(ex.id);
      return `<div class="row tap" onclick="_statNavStack=['mg'];closeOv('ov-mg-stat');setTimeout(()=>openDet('${ex.id}'),120)">
        <div class="ico">${ex.emoji}</div>
        <div class="row-body">
          <div class="row-title">${esc(ex.name)}</div>
          <div class="row-sub">${hist.length} Einheit${hist.length!==1?'en':''}${lw ? ' · Max '+lw+' kg' : ''}${e1rm ? ' · 1RM '+fmt1RM(e1rm) : ''}</div>
        </div>
        <div class="chev">›</div>
      </div>`;
    }).join('');
  }

  openOv('ov-mg-stat');
}
// Rückwärts-kompatibler Alias
const openMuscleStat = openGroupStat;

function renderMgStatChart(sessions) {
  const empty = document.getElementById('mg-stat-empty');
  const canvas = document.getElementById('mg-stat-chart');
  if (mgStatChart) { mgStatChart.destroy(); mgStatChart = null; }
  if (!sessions.length) {
    if (empty) empty.style.display = '';
    if (canvas) canvas.style.display = 'none';
    return;
  }
  if (empty)  empty.style.display = 'none';
  if (canvas) canvas.style.display = '';
  const acc = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#007AFF';
  mgStatChart = new Chart(canvas.getContext('2d'), {
    type:'line',
    data:{
      labels: sessions.map(s => dateShort(s.date)),
      datasets:[{
        data: sessions.map(s => s.vol),
        ..._glowDs(canvas, acc, sessions.length, true)
      }]
    },
    options:{
      responsive:true,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>fmtKg(c.parsed.y)}}},
      scales:{
        x:{grid:{display:false},ticks:_cXT(sessions.length)},
        y:_cYT(v=>fmtKg(v))
      }
    }
  });
}

// ── WORKOUT ───────────────────────────────────────────
