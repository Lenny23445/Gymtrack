function openWorkout() {
  // Wenn ein Training bereits läuft → nur wieder anzeigen, NICHT zurücksetzen
  if (isWorkoutActive()) {
    resumeWorkout();
    return;
  }
  if (!S.exercises.length) {
    alert('Füge zuerst eine Übung hinzu!');
    goTab('uebungen', document.querySelectorAll('.tab')[1]);
    return;
  }
  wkExIds = [];
  wkLogs  = [];
  wkCatFilter = 'alle';
  _activePlanSrc = null;

  // Heutige Übungen aus dem Wochenplan vorauswählen
  let planHintText = '';
  const todayPlan = planFor(todayKey());
  if (todayPlan.type === 'preset' && todayPlan.id) {
    const pr = presetById(todayPlan.id);
    const ids = pr ? _presetExIdsExisting(pr) : [];
    if (ids.length) {
      wkExIds = ids.slice();
      planHintText = pr.name + ' · ' + ids.length + ' Übung' + (ids.length !== 1 ? 'en' : '') + ' vorausgewählt';
      _activePlanSrc = { type:'preset', id: pr.id };
    }
  } else if (todayPlan.type === 'exercises' && Array.isArray(todayPlan.exIds) && todayPlan.exIds.length) {
    wkExIds = todayPlan.exIds.filter(id => S.exercises.some(ex => ex.id === id));
    if (wkExIds.length) {
      planHintText = wkExIds.length + ' Übung' + (wkExIds.length !== 1 ? 'en' : '') + ' aus deinem Wochenplan vorausgewählt';
      _activePlanSrc = { type:'week', dayKey: todayKey() };
    }
  } else if (todayPlan.type === 'group' && todayPlan.group) {
    for (const m of allModes()) {
      const g = m.groups.find(g => g.id === todayPlan.group);
      if (g && g.muscles) {
        wkExIds = S.exercises.filter(ex => exInGroup(ex, m.id, g.id)).map(ex => ex.id);
        if (wkExIds.length) planHintText = g.label + ' aus deinem Wochenplan vorausgewählt';
        break;
      }
    }
  }

  const hint = document.getElementById('wk-plan-hint');
  if (hint) { hint.style.display = planHintText ? '' : 'none'; hint.textContent = planHintText; }

  document.getElementById('wk-step1').style.display = '';
  document.getElementById('wk-step2').style.display = 'none';
  document.getElementById('wk-title').textContent = 'Training';
  renderWkPresets();
  renderWkFilterBar();
  renderWkPicker();
  openOv('ov-wk');
}

function wkMode()  { return modeById(S.wkFilterMode); }
function wkGroup() { const m = wkMode(); return m.groups.find(g => g.id === wkCatFilter) || m.groups[0]; }

function renderWkFilterBar() {
  // Mode-Switcher
  const modeBar = document.getElementById('wk-mode-switch');
  if (modeBar) {
    modeBar.innerHTML = allModes().map(m =>
      `<button class="fmode-btn${S.wkFilterMode===m.id?' on':''}" onclick="setWkFilterMode('${m.id}')">${esc(m.label)}</button>`
    ).join('') + `<button class="fmode-btn fmode-add" onclick="openCustomSplitNew()" title="Eigenen Split erstellen">＋</button>`;
  }
  // Falls aktiver Filter nicht im neuen Modus existiert → 'alle'
  const mode = wkMode();
  if (!mode.groups.some(g => g.id === wkCatFilter)) wkCatFilter = 'alle';

  const bar = document.getElementById('wk-filter-bar');
  if (!bar) return;
  bar.innerHTML = mode.groups.map(g =>
    `<button class="icat${wkCatFilter===g.id?' on':''}" onclick="setWkCat('${g.id}')">${esc(g.label)}</button>`
  ).join('');
}

function setWkCat(id) {
  wkCatFilter = id;
  _activePlanSrc = null; // manuelle Gruppen-Auswahl → kein gespeicherter Plan als Quelle
  const grp = wkGroup();
  // Gruppe antippen → alle Übungen dieser Gruppe automatisch auswählen
  if (grp.id !== 'alle') {
    wkExIds = S.exercises.filter(ex => exInGroup(ex, wkMode().id, grp.id)).map(ex => ex.id);
  } else {
    wkExIds = []; // "Alle" → Auswahl zurücksetzen
  }
  renderWkFilterBar();
  renderWkPicker();
  renderWkPresets();
}

function setWkFilterMode(mode) {
  if (S.wkFilterMode === mode) return;
  S.wkFilterMode = mode;
  wkCatFilter = 'alle';
  wkExIds = [];
  _activePlanSrc = null;
  persist();
  renderWkFilterBar();
  renderWkPicker();
}

function renderWkPicker() {
  const grp = wkGroup();
  const filtered = grp.id === 'alle'
    ? S.exercises
    : S.exercises.filter(ex => exInGroup(ex, wkMode().id, grp.id));

  const title = document.getElementById('wk-step1-title');
  if (title) title.textContent = wkCatFilter === 'alle'
    ? 'Welche Übungen heute?'
    : grp.label + ' – Übungen auswählen';

  const btn = document.getElementById('wk-start-btn');
  if (btn) btn.textContent = wkExIds.length
    ? '▶  ' + wkExIds.length + ' Übung' + (wkExIds.length !== 1 ? 'en' : '') + ' starten'
    : 'Training starten ▶';

  if (!filtered.length) {
    document.getElementById('wk-picker').innerHTML =
      `<div style="padding:18px;text-align:center;color:var(--text2);font-size:15px;position:relative;z-index:1">
        Keine Übungen für ${grp.label}.<br>
        <span style="font-size:13px">Erstelle Übungen im Tab „Übungen".</span>
      </div>`;
    return;
  }

  document.getElementById('wk-picker').innerHTML = filtered.map(ex => {
    const sel = wkExIds.includes(ex.id);
    return `<div class="row tap" onclick="toggleEx('${ex.id}')">
      <div class="row-body">
        <div class="row-title">${esc(ex.name)}</div>
        <div class="row-sub">Ziel: ${ex.targetSets}×${repGoalShort(ex)}${ex.targetType==='time'?'':' Wdh'}</div>
      </div>
      <div class="wk-chk${sel?' on':''}" id="wchk-${ex.id}">${sel?'✓':''}</div>
    </div>`;
  }).join('');
}

function _updWkStartBtn() {
  const btn = document.getElementById('wk-start-btn');
  if (btn) btn.textContent = wkExIds.length
    ? '▶  ' + wkExIds.length + ' Übung' + (wkExIds.length !== 1 ? 'en' : '') + ' starten'
    : 'Training starten ▶';
}

function toggleEx(id) {
  const idx = wkExIds.indexOf(id);
  const chk = document.getElementById('wchk-'+id);
  if (idx >= 0) {
    wkExIds.splice(idx,1);
    if (chk) { chk.classList.remove('on'); chk.textContent = ''; }
  } else {
    wkExIds.push(id);
    if (chk) { chk.classList.add('on'); chk.textContent = '✓'; }
  }
  _updWkStartBtn();
  renderWkPresets(); // Preset-Markierung anpassen, falls Auswahl abweicht
}

/* ── WORKOUT-PRESETS (Trainingspläne) ─────────────────────
   S.workoutPresets = [{id, name, exIds:[]}]. Schnellstart: Plan
   antippen → alle enthaltenen Übungen auf einmal vorausgewählt. */
function _presetExIdsExisting(p) {
  return (p.exIds || []).filter(id => S.exercises.some(ex => ex.id === id));
}
function _presetIsActive(p) {
  const ids = _presetExIdsExisting(p);
  if (!ids.length || ids.length !== wkExIds.length) return false;
  return ids.every(id => wkExIds.includes(id));
}
function renderWkPresets() {
  const host = document.getElementById('wk-presets');
  if (!host) return;
  const presets = S.workoutPresets || [];
  if (!presets.length) {
    host.innerHTML = `<div class="wk-preset-empty">
      Noch keine Pläne. Mit <b>＋ Plan</b> stellst du z. B. „Oberkörper 1" aus deinen Übungen zusammen und startest ihn künftig mit einem Tipp.
    </div>`;
    return;
  }
  host.innerHTML = presets.map(p => {
    const cnt = _presetExIdsExisting(p).length;
    const on  = _presetIsActive(p);
    return `<div class="wk-preset-card${on?' on':''}" onclick="applyPreset('${p.id}')">
      <div class="wkp-body">
        <div class="wkp-name">${esc(p.name)}</div>
        <div class="wkp-sub">${cnt} Übung${cnt!==1?'en':''}</div>
      </div>
      <button class="wkp-edit" onclick="event.stopPropagation();openPresetEdit('${p.id}')" aria-label="Plan bearbeiten">✎</button>
      <div class="wkp-chk">${on?'✓':''}</div>
    </div>`;
  }).join('');
}
function applyPreset(id) {
  const p = (S.workoutPresets || []).find(x => x.id === id);
  if (!p) return;
  const ids = _presetExIdsExisting(p);
  if (!ids.length) { _dndToast('Plan enthält keine vorhandenen Übungen'); return; }
  if (_presetIsActive(p)) {
    wkExIds = []; // erneutes Tippen → Auswahl aufheben
    _activePlanSrc = null;
  } else {
    wkExIds = ids.slice();
    _activePlanSrc = { type:'preset', id: p.id };
  }
  haptic(12);
  // Hinweis-Banner ausblenden, Filter-Auswahl auf "alle" lassen
  const hint = document.getElementById('wk-plan-hint');
  if (hint) hint.style.display = 'none';
  _updWkStartBtn();
  renderWkPresets();
  renderWkPicker();
}

let _presetEditId = null;
let _presetSel = new Set();
let _presetColor = SPLIT_PALETTE[0];
let _presetDays = new Set();
function openPresetEdit(id) {
  if (!S.exercises.length) { alert('Lege zuerst Übungen an!'); return; }
  _presetEditId = id;
  const p = id ? (S.workoutPresets || []).find(x => x.id === id) : null;
  _presetSel = new Set(p ? _presetExIdsExisting(p) : (typeof wkExIds !== 'undefined' ? wkExIds.slice() : []));
  _presetColor = p ? splitColor(p) : SPLIT_PALETTE[(S.workoutPresets || []).length % SPLIT_PALETTE.length];
  _presetDays = new Set(id ? presetDays(id) : []);
  document.getElementById('preset-title').textContent = p ? 'Split bearbeiten' : 'Neuer Split';
  document.getElementById('preset-name').value = p ? p.name : '';
  const sInp = document.getElementById('preset-search'); if (sInp) sInp.value = '';
  const delBtn = document.getElementById('preset-delete-btn');
  if (delBtn) delBtn.style.display = p ? '' : 'none';
  renderPresetColorRow();
  renderPresetDayRow();
  renderPresetExList();
  openOv('ov-preset');
}
// Eigene Split-Farben (frei gewählt) — rein lokal, kein Cloud-Feld.
function customColors() {
  try { const a = JSON.parse(localStorage.getItem('gt_customColors') || '[]'); return Array.isArray(a) ? a.filter(isHex) : []; }
  catch(_) { return []; }
}
function rememberCustomColor(c) {
  const list = customColors().filter(x => x.toUpperCase() !== c.toUpperCase());
  list.unshift(c);
  try { localStorage.setItem('gt_customColors', JSON.stringify(list.slice(0, 8))); } catch(_){}
}
function isHex(c) { return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c); }

function renderPresetColorRow() {
  const el = document.getElementById('preset-color-row');
  if (!el) return;
  const cur = (_presetColor || '').toUpperCase();
  const swatches = SPLIT_PALETTE.concat(customColors().filter(c => !SPLIT_PALETTE.some(p => p.toUpperCase() === c.toUpperCase())));
  const isCustom = isHex(_presetColor) && !swatches.some(c => c.toUpperCase() === cur);
  el.innerHTML = swatches.map(c =>
    `<div class="sp-color${c.toUpperCase()===cur?' on':''}" style="background:${c}" onclick="pickPresetColor('${c}')"></div>`
  ).join('') +
  `<label class="sp-color sp-custom${isCustom?' on':''}" id="preset-cust-sw" title="Eigene Farbe" aria-label="Eigene Farbe"
      ${isCustom ? `style="background:${_presetColor}"` : ''}>
     <input type="color" id="preset-col-inp" value="${isHex(_presetColor)?_presetColor:SPLIT_PALETTE[0]}"
            oninput="pickCustomColor(this.value,false)" onchange="pickCustomColor(this.value,true)">
   </label>`;
}
// Native Farbpalette (input type=color) — live oninput färbt nur, erst onchange
// (Picker geschlossen) wird die Reihe neu gerendert; sonst reißt es den offenen Picker weg.
function pickCustomColor(c, done) {
  if (!isHex(c)) return;
  _presetColor = c.toUpperCase();
  const lab = document.getElementById('preset-cust-sw');
  if (lab) { lab.style.background = _presetColor; lab.classList.add('on'); }
  document.querySelectorAll('#preset-color-row .sp-color:not(.sp-custom).on').forEach(e => e.classList.remove('on'));
  if (done) { rememberCustomColor(_presetColor); renderPresetColorRow(); hapticTick && hapticTick(); }
}
function pickPresetColor(c) { _presetColor = c; renderPresetColorRow(); hapticTick && hapticTick(); }

function renderPresetDayRow() {
  const el = document.getElementById('preset-day-row');
  if (!el) return;
  el.innerHTML = DAYS.map(d =>
    `<div class="sp-day${_presetDays.has(d.key)?' on':''}" onclick="togglePresetDay('${d.key}')">${d.short}</div>`
  ).join('');
}
function togglePresetDay(k) {
  if (_presetDays.has(k)) _presetDays.delete(k); else _presetDays.add(k);
  renderPresetDayRow();
  hapticTick && hapticTick();
}
function renderPresetExList() {
  const list = document.getElementById('preset-ex-list');
  if (!list) return;
  const q = _normSearch((document.getElementById('preset-search')?.value || '').trim());
  const items = S.exercises.filter(ex => !q || _normSearch(ex.name).includes(q));
  const cnt = document.getElementById('preset-count');
  if (cnt) cnt.textContent = _presetSel.size ? '· ' + _presetSel.size : '';
  if (!items.length) {
    list.innerHTML = `<div style="padding:18px;text-align:center;color:var(--text2);font-size:14px">Keine Übung gefunden.</div>`;
    return;
  }
  list.innerHTML = items.map(ex => {
    const on = _presetSel.has(ex.id);
    return `<div class="ex-swipe-wrap">
      <div class="ex-swipe-inner">
        <div class="preset-ex-row${on?' on':''}" data-exid="${ex.id}" onclick="presetExRowClick(this,'${ex.id}')">
          <div class="pex-body">
            <div class="pex-name">${esc(ex.name)}</div>
            <div class="pex-sub">${esc(ex.muscleGroup||'')}</div>
          </div>
          <div class="pex-chk">${on?'✓':''}</div>
        </div>
        <div class="ex-row-del" onclick="deleteExFromPreset('${ex.id}')">🗑</div>
      </div>
    </div>`;
  }).join('');
  _initPresetSwipes();
}
function togglePresetEx(id) {
  if (_presetSel.has(id)) _presetSel.delete(id); else _presetSel.add(id);
  hapticTick();
  renderPresetExList();
}
// Tap auf eine Zeile: offenen Lösch-Swipe erst schließen, sonst Auswahl umschalten.
function presetExRowClick(el, id) {
  const inner = el.closest('.ex-swipe-inner');
  if (inner && inner.classList.contains('swipe-open')) { exCloseSwipe(inner); return; }
  togglePresetEx(id);
}
// Nach links wischen → 🗑 → Übung komplett löschen (wie in der Übungsliste).
function deleteExFromPreset(exId) {
  const ex = exById(exId);
  if (!confirm('Übung „' + (ex ? ex.name : '') + '" wirklich löschen?')) return;
  S.exercises = S.exercises.filter(e => e.id !== exId);
  S.sessions.forEach(s => { s.logs = s.logs.filter(l => l.exerciseId !== exId); });
  S.sessions = S.sessions.filter(s => s.logs.length > 0);
  _presetSel.delete(exId);
  persist();
  if (typeof _indexExercisesSpotlight === 'function') _indexExercisesSpotlight();
  _swipeActive = null;
  renderPresetExList();
}
// Swipe-to-delete für die Übungszeilen im Split-Editor (eigene Init, damit der
// Tap die Auswahl togglet statt die Detailansicht zu öffnen).
function _initPresetSwipes() {
  document.querySelectorAll('#preset-ex-list .ex-swipe-wrap').forEach(wrap => {
    const inner = wrap.querySelector('.ex-swipe-inner');
    const row   = wrap.querySelector('.preset-ex-row');
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
      if (Math.abs(dy) > Math.abs(dx) + 8) { tracking = false; return; }  // vertikal → Liste scrollt
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
function savePreset() {
  const name = (document.getElementById('preset-name')?.value || '').trim();
  if (!name) { alert('Gib dem Plan einen Namen.'); return; }
  if (!_presetSel.size) { alert('Wähle mindestens eine Übung.'); return; }
  // Reihenfolge wie in der Übungsliste beibehalten
  const exIds = S.exercises.filter(ex => _presetSel.has(ex.id)).map(ex => ex.id);
  if (!Array.isArray(S.workoutPresets)) S.workoutPresets = [];
  let id = _presetEditId;
  if (_presetEditId) {
    const i = S.workoutPresets.findIndex(x => x.id === _presetEditId);
    if (i >= 0) S.workoutPresets[i] = { id: _presetEditId, name, exIds, color: _presetColor };
  } else {
    id = uid();
    S.workoutPresets.push({ id, name, exIds, color: _presetColor });
  }
  // Wochentage synchronisieren: gewählte Tage → dieser Split, entfernte → frei
  if (!S.weekPlan) S.weekPlan = {};
  DAYS.forEach(d => {
    const cur = planFor(d.key);
    if (_presetDays.has(d.key)) S.weekPlan[d.key] = { type:'preset', id };
    else if (cur.type === 'preset' && cur.id === id) S.weekPlan[d.key] = { type:'none' };
  });
  persist();
  scheduleWorkoutNotifications();
  hapticSuccess();
  closeOv('ov-preset');
  renderWkPresets();
  renderWeekPreview();
  renderSplitList();
  if (typeof renderExList === 'function') { try { renderExList(); } catch(e){} }
  if (typeof renderHome === 'function') { try { renderHome(); } catch(e){} }
}
function deletePreset() {
  if (!_presetEditId) return;
  const p = (S.workoutPresets || []).find(x => x.id === _presetEditId);
  if (!confirm('Split „' + (p?.name || '') + '" löschen?')) return;
  const delId = _presetEditId;
  S.workoutPresets = (S.workoutPresets || []).filter(x => x.id !== delId);
  // Wochenplan-Tage, die auf diesen Split zeigen, freigeben
  DAYS.forEach(d => { const c = planFor(d.key); if (c.type === 'preset' && c.id === delId) S.weekPlan[d.key] = { type:'none' }; });
  persist();
  scheduleWorkoutNotifications();
  hapticSuccess();
 closeOv('ov-preset');
  renderWkPresets();
  renderWeekPreview();
  renderSplitList();
  if (typeof renderExList === 'function') { try { renderExList(); } catch(e){} }
  if (typeof renderHome === 'function') { try { renderHome(); } catch(e){} }
}

/* ── ÜBUNG MITTEN IM TRAINING HINZUFÜGEN ─────────────── */
let _midAddQ = '';
let _midAddPending = false; // true = neue Übung nach Speichern direkt ins Training
let _presetAddPending = false; // true = neue Übung nach Speichern direkt in den Plan übernehmen
let _swapAddPending = false; // true = neue Übung nach Speichern direkt in den getauschten Slot

function openNewExFromWorkout() {
  _midAddPending = true;
  closeOv('ov-mid-add');
  closeOv('ov-wk');          // Workout temp. verbergen (ov-ex liegt im DOM davor → würde sonst dahinter verschwinden)
  updateWkMiniVisibility();  // Mini-Indikator erscheint oben
  openNewEx(null);
}

// Aus dem Tausch-Menü heraus eine komplett neue Übung anlegen.
// Nach dem Speichern ersetzt sie die aktuell getauschte Übung (behält Slot + Sätze).
function openNewExFromSwap() {
  _swapAddPending = true;    // _exEditLi (Ziel-Slot) bleibt erhalten
  closeOv('ov-ex-swap');
  closeOv('ov-wk');
  updateWkMiniVisibility();
  openNewEx(null);
}

// Aus dem Plan-Editor heraus eine komplett neue Übung anlegen.
// Nach dem Speichern wird sie automatisch im Plan ausgewählt.
function openNewExFromPreset() {
  _presetAddPending = true;
  closeOv('ov-preset');
  openNewEx(null);
}

/* Wird vom ✕-Button und Backdrop-Tap von ov-ex aufgerufen.
   Wenn aus aktivem Training heraus geöffnet → Workout wieder einblenden. */
function onCloseExOverlay() {
  closeOv('ov-ex');
  if (_midAddPending || _swapAddPending) {
    _midAddPending = false;
    _swapAddPending = false;
    if (isWorkoutActive()) { openOv('ov-wk'); updateWkMiniVisibility(); }
  } else if (_presetAddPending) {
    _presetAddPending = false;
    openOv('ov-preset');          // Plan-Editor wieder einblenden
    renderPresetExList();
  }
}

function openMidAddExercise() {
  _midAddQ = '';
  const inp = document.getElementById('mid-add-search');
  if (inp) inp.value = '';
  renderMidAddList();
  openOv('ov-mid-add');
  setTimeout(() => { const inp2 = document.getElementById('mid-add-search'); if (inp2) inp2.focus(); }, 200);
}
// Suche unempfindlich gegen Groß/Klein UND Umlaute/Akzente:
// "u" findet "Überzüge", "ruck" findet "Rückenheber", "ss"↔"ß".
function _normSearch(s){
  return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ß/g,'ss');
}
function renderMidAddList() {
  const list = document.getElementById('mid-add-list');
  if (!list) return;
  const q = _normSearch(_midAddQ);
  const activeIds = new Set((wkLogs || []).map(l => l.exerciseId));
  const exs = (S.exercises || []).filter(ex => !q || _normSearch(ex.name).includes(q));
  if (!exs.length) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text2)">Keine Übungen gefunden</div>';
    return;
  }
  list.innerHTML = exs.map(ex => {
    const already = activeIds.has(ex.id);
    const mg = MUSCLE_GROUPS.find(m => m.id === ex.muscleGroup);
    return `<div class="row tap" onclick="addExToActiveWorkout('${ex.id}')">
      <div class="row-body">
        <div class="row-title">${esc(ex.name)}${already?'<span style="font-size:11px;color:var(--text2);margin-left:6px">bereits drin</span>':''}</div>
        <div class="row-sub">${mg ? mg.label : ex.muscleGroup}</div>
      </div>
      <div style="color:var(--acc);font-size:22px;font-weight:300;padding-left:8px">＋</div>
    </div>`;
  }).join('');
}
function addExToActiveWorkout(exId) {
  const ex = exById(exId);
  if (!ex) return;
  const sw = getSuggestedWeight(ex);
  const defaultW = sw != null ? String(sw) : '';
  const defaultR = String(getSuggestedReps(ex));
  wkLogs.push({ exerciseId:exId, sugW:defaultW, sugR:defaultR, sets: buildPlannedSets(ex) });
  closeOv('ov-mid-add');
 openOv('ov-wk'); // Workout-Sheet wieder öffnen
  updateWkMiniVisibility();
  renderLogCards();
  // Zur neu hinzugefügten Karte scrollen
  setTimeout(() => {
    const cards = document.querySelectorAll('#log-cards .ex-card');
    if (cards.length) cards[cards.length - 1].scrollIntoView({behavior:'smooth', block:'start'});
  }, 150);
  haptic(10);
}

function startActive() {
  if (!wkExIds.length) { alert('Wähle mindestens eine Übung!'); return; }
  _ensureRestNotifPermission(); // Pause-Ende-Signal darf im Hintergrund feuern
  _livePR = {};   // Live-PR-Tracker für neue Einheit zurücksetzen
  _coachState = _coachDefaultState(); // Live-Coach-Rate-Limits für neue Einheit zurücksetzen
  _coachClearCard();
  _coachEvalTimers = {};
  _coachBarState = { mode: 'idle', msg: '' };
  _rpeLastDir = {};        // Daempfung gilt je Einheit, nicht ueber Wochen
  _coachUndoState = null;  // ein Rueckgaengig der letzten Einheit gilt nicht mehr
  // Der Coach eröffnet mit dem, was er aus dem letzten Check-in gemacht hat —
  // so ist die Anpassung nicht nur in den Zahlen, sondern auch ausgesprochen.
  // Geplante Entlastungswoche VOR dem Bauen der Saetze entscheiden: die
  // Gewichtsvorschlaege entstehen gleich darunter und muessen den Faktor schon
  // kennen (getSuggestedWeight -> _ciAdjustW -> _deloadFactor).
  let _dl = false;
  try { _dl = _deloadStart(); } catch(e) { console.warn('[Coach] Entlastung:', e); }
  try {
    const _rd = _ciReadiness();
    const _txt = _dl
      ? _cm('Sechs harte Wochen am Stück — diese Einheit läuft als geplante Entlastung, rund 10 % weniger Gewicht.',
            'Six hard weeks in a row — this session runs as a planned deload, about 10% less weight.')
      : (_rd && _rd.bar) ? _rd.bar : '';
    if (_txt) setTimeout(() => _coachBarSet('msg', _txt, 9000), 400);
  } catch(_) {}
  wkLogs = wkExIds.map(exId => {
    const ex = exById(exId);
    const sw = getSuggestedWeight(ex);
    const defaultW = sw != null ? String(sw) : '';
    const defaultR = String(getSuggestedReps(ex));
    return { exerciseId:exId, sugW:defaultW, sugR:defaultR, sets: buildPlannedSets(ex) };
  });
  timerTs = Date.now();
  // Live Activity starten
  if (wkLogs.length) {
    const firstEx = exById(wkLogs[0]?.exerciseId);
    const totalS  = wkLogs.reduce((a,l) => a + (l.sets?.length||0), 0);
    _startLiveActivity(
      _getTodayLabel() || 'Training',
      firstEx?.name || '',
      0, totalS
    );
  }
  _startWkTimer();
  _pushSocialSoon();   // Community: Live-Status „trainiert gerade" für Freunde
  document.getElementById('wk-step1').style.display = 'none';
  document.getElementById('wk-step2').style.display = '';
  document.getElementById('wk-title').textContent = 'Aktives Training';
  renderLogCards();
  // Erzaehlbogen (Task 17): Begruessung, erste Uebung, Aufwaermschema. Laeuft
  // NACH renderLogCards(), damit _csSyncCurrentEx() eine gefuellte Satzliste
  // sieht, und mit CS_LEAD_MS Vorlauf, weil die Check-in-Zeile oben bei 400 ms
  // in dieselbe Leiste schreibt — die neuere Meldung verdraengt die vorige.
  try { _csStart(); } catch(e) { console.warn('[Coach] Start:', e); }
}

function _startWkTimer() {
  clearInterval(timerInt);
  timerInt = setInterval(()=>{
    const e = Math.floor((Date.now()-timerTs)/1000);
    const str = String(Math.floor(e/60)).padStart(2,'0')+':'+String(e%60).padStart(2,'0');
    const tv = document.getElementById('timer-v'); if (tv) tv.textContent = str;
    const mv = document.getElementById('wk-mini-v'); if (mv) mv.textContent = str;
    // Bestehender Tick, HOECHSTENS einmal pro Minute (CoachSession.onTick prueft
    // Stillstand ab 12 Minuten ohne Satz).
    if (e > 0 && e % 60 === 0) { try { _csTick(); } catch(_) {} }
  },1000);
}

/* ── AKTIVES TRAINING ÜBERLEBT APP-NEUSTART ─────────────────
   iOS beendet die App gern im Hintergrund (App-Wechsel, Sperrbildschirm,
   lange Pause im Gym). Der komplette Workout-Zustand wird deshalb bei
   jeder Änderung in localStorage gesichert und beim Start wiederhergestellt. */
const _AWK_KEY = 'gt_active_wk';
function _saveActiveWk() {
  try {
    if (!timerTs || !wkLogs.length) return;
    const restActive = _restInt !== null && _restEndTs > Date.now();
    localStorage.setItem(_AWK_KEY, JSON.stringify({
      logs: wkLogs, exIds: wkExIds, ts: timerTs,
      note: document.getElementById('wk-note')?.value || '',
      planSrc: _activePlanSrc || null,            // Quelle für „Plan übernehmen?"
      restEndTs: restActive ? _restEndTs : 0,     // laufende Pause übersteht App-Neustart
      restSmart: restActive ? _restSmart : false,
      coachState: _coachState                      // Live-Coach-Rate-Limits übersteht App-Neustart
    }));
  } catch(_) {}
}
// Gebündelter Speicher für den heißen Render-Pfad: localStorage.setItem + JSON.stringify
// sind synchron und würden bei jedem Satz-Haken/Render kurz ruckeln. Kritische Momente
// (Pausenstart/-ende, Notiz) rufen weiterhin _saveActiveWk() direkt auf; hier reicht
// „bald". Flush bei App-Hintergrund (_flushActiveWk) sichert den letzten Stand.
let _saveWkT = null;
function _saveActiveWkSoon() {
  if (_saveWkT) return;
  _saveWkT = setTimeout(() => { _saveWkT = null; _saveActiveWk(); }, 400);
}
function _flushActiveWk() {
  if (_saveWkT) { clearTimeout(_saveWkT); _saveWkT = null; }
  _saveActiveWk();
}
function _clearActiveWk() { try { localStorage.removeItem(_AWK_KEY); } catch(_) {} }
function _restoreActiveWk() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(_AWK_KEY) || 'null'); } catch(_) {}
  if (!saved || !Array.isArray(saved.logs) || !saved.logs.length || !saved.ts) return;
  // Älter als 8 h → vermutlich vergessen, still verwerfen
  if (Date.now() - saved.ts > 8 * 3600 * 1000) { _clearActiveWk(); return; }
  const logs = saved.logs.filter(l => l && exById(l.exerciseId));
  if (!logs.length) { _clearActiveWk(); return; }
  wkLogs  = logs;
  wkExIds = Array.isArray(saved.exIds) && saved.exIds.length ? saved.exIds : logs.map(l => l.exerciseId);
  timerTs = saved.ts;
  _coachState = _coachNormalizeState(saved.coachState); // Live-Coach-Rate-Limits übersteht App-Neustart
  _coachCard = null; // evtl. offene Vorschlagskarte ist nach Neustart nicht mehr aktuell
  _coachEvalTimers = {};
  // Laufende Zeit-Satz-Timer pausieren — der Neustart hat sie beendet
  wkLogs.forEach(l => (l.sets || []).forEach(s => {
    if (s.tRunning) { s.tElapsed = s.tElapsed || 0; s.tRunning = false; s.tStart = null; }
  }));
  const s1 = document.getElementById('wk-step1'), s2 = document.getElementById('wk-step2');
  if (s1) s1.style.display = 'none';
  if (s2) s2.style.display = '';
  const t = document.getElementById('wk-title'); if (t) t.textContent = 'Aktives Training';
  const note = document.getElementById('wk-note'); if (note) note.value = saved.note || '';
  _activePlanSrc = saved.planSrc || null;
  /* Die Begruendungen der Gewichtsvorschlaege (_weightReasons) liegen bewusst
     nur im Speicher — nach einem Neustart sind sie also weg, waehrend die
     vorgeschlagenen ZAHLEN in wkLogs weiterleben. Genau dann stuende der Wert
     ohne Erklaerung da ("warum 135?"), und zwar in der Lage, in der man am
     ehesten fragt: mitten in der Einheit, nach einem Blick aufs Handy.
     Der Aufruf rechnet dieselbe Funktion noch einmal fuer jede Uebung; der
     Rueckgabewert wird verworfen, uebernommen wird nichts — die eingetragenen
     Gewichte bleiben, wie sie sind. Nur die Begruendung entsteht neu. */
  try {
    wkLogs.forEach(l => {
      const e = exById(l.exerciseId);
      if (e) getSuggestedWeight(e);
    });
  } catch(e) { console.warn('[Training] Begruendungen:', e); }
  _startWkTimer();
  renderLogCards();
  updateWkMiniVisibility();
  // Laufende Satzpause wiederherstellen, falls sie beim Neustart noch nicht abgelaufen war
  if (saved.restEndTs && saved.restEndTs > Date.now()) {
    _restSmart = !!saved.restSmart;
    _restEndTs = saved.restEndTs;
    _restSecs  = Math.max(0, Math.round((_restEndTs - Date.now()) / 1000));
    _beginRestCountdown();
  }
  // Dynamic Island wieder verbinden: die Live Activity überlebt den App-Kill im
  // System, aber _liveActivityActive startet als false → ohne Reconnect kämen nie
  // wieder Updates an (Island wirkt "tot"). Gleiches timerTs ⇒ Plugin re-attached.
  const laFirst = wkLogs.find(l => l.sets?.some(s => !s.done)) || wkLogs[0];
  const laTotal = wkLogs.reduce((a,l) => a + (l.sets?.length||0), 0);
  const laDone  = wkLogs.reduce((a,l) => a + (l.sets?.filter(s=>s.done).length||0), 0);
  _startLiveActivity(_getTodayLabel() || 'Training', exById(laFirst?.exerciseId)?.name || '', laDone, laTotal);
  setTimeout(_syncLiveActivity, 800); // aktuellen Zustand (inkl. laufender Pause) nachpushen
  // Erzaehlbogen wieder aufnehmen: gleicher wkTs (timerTs === saved.ts) ⇒ der
  // gespeicherte Zustand gilt weiter und die Obergrenze zaehlt nicht von vorn.
  try { _csResume(); } catch(e) { console.warn('[Coach] Wiederaufnahme:', e); }
}

/* ── Fokus-Modus: welche Uebung ist "dran"? ──
   _wkFocusLi lebt hier im Modul, weil es den Zustand ueber Renderlaeufe hinweg
   traegt. Gesetzt werden die Klassen ausschliesslich von _wkFocusApply() — auch
   direkt nach jedem Rendern, also noch vor dem naechsten Bild und damit ohne
   Flackern. Die Auswahl selbst (Geometrie, Superset-Einheit) rechnet
   WorkoutFocus (js/workout-focus.js, unter node --test geprueft). */
let _wkFocusLi = -1;
/* Kartenlage in KOORDINATEN DES SCROLLERS (top/bottom relativ zum Inhalt, nicht
   zum Bildschirm). Einmal je Renderlauf gemessen, danach nur noch gerechnet:
   waehrend des Scrollens darf KEIN getBoundingClientRect mehr laufen. Genau das
   war der Ruckler — ein IntersectionObserver mit fuenf Schwellen las bei jeder
   Meldung alle Karten neu aus, und weil _wkFocusApply() vorher Klassen gesetzt
   hatte, erzwang jeder dieser Lesevorgaenge ein vollstaendiges Layout. Bei
   backdrop-filter auf jeder Karte kostet das Watt, nicht nur Millisekunden. */
let _wkFocusBoxes = null;
let _wkFocusDirty = true;
let _wkFocusRaf = 0;
let _wkFocusBound = false;
let _wkSnapPadPx = 0;

function _wkFocusApply() {
  const cards = document.querySelectorAll('#log-cards .ex-card');
  const unit = (_wkFocusLi >= 0 && typeof WorkoutFocus !== 'undefined')
    ? WorkoutFocus.focusUnitOf(wkLogs, _wkFocusLi) : [];
  cards.forEach(c => {
    const li = +c.dataset.li;
    const drin = unit.includes(li);
    c.classList.toggle('dimmed', unit.length > 0 && !drin);
    // Die eingerastete Einheit traegt das Zeichen SELBST (Rahmen, Schatten,
    // angehoben) — vorher gab es nur "die anderen sind dunkler", und dann
    // erkennt man den Moment des Einrastens erst am Umfeld.
    c.classList.toggle('locked', unit.length > 0 && drin);
  });
}

/* Die einzige Messstelle. Laeuft nach dem Rendern, nach Hoehenwechseln der
   Kopfleisten und beim ersten Tick — nie waehrend einer Scrollbewegung. */
function _wkFocusMeasure(sheet, wrap) {
  const sr = sheet.getBoundingClientRect();
  const base = sr.top - sheet.scrollTop;      // Bildschirm → Inhaltskoordinaten
  const boxes = [];
  wrap.querySelectorAll('.ex-card').forEach(c => {
    const r = c.getBoundingClientRect();
    boxes.push({ li: +c.dataset.li, top: r.top - base, bottom: r.bottom - base });
  });
  _wkFocusBoxes = boxes;
  _wkFocusDirty = false;
}

function _wkFocusTick() {
  _wkFocusRaf = 0;
  try {
    if (typeof WorkoutFocus === 'undefined') return;
    const sheet = document.querySelector('#ov-wk .sheet');
    const wrap  = document.getElementById('log-cards');
    if (!sheet || !wrap) return;
    if (_wkFocusDirty || !_wkFocusBoxes) _wkFocusMeasure(sheet, wrap);
    const boxes = _wkFocusBoxes;
    if (!boxes || boxes.length < 2) return;
    // Mitte der BUEHNE, nicht des Sheets: der Bereich hinter dem klebenden Kopf
    // zaehlt nicht mit, sonst gilt eine Karte als "dran", die dort verdeckt liegt.
    const pad = _wkSnapPadPx || 72;
    const mid = sheet.scrollTop + pad + (sheet.clientHeight - pad) / 2;
    // Mit Vorsprung fuer die bereits gewaehlte Karte: ohne den kippte der Fokus
    // beim Scrollen mehrfach zwischen zwei fast gleich weit entfernten Karten
    // hin und her. 56 px ~ eine Satzzeile — gross genug gegen das Zittern, klein
    // genug, dass ein echter Wechsel sofort durchkommt.
    const cur = _wkFocusLi >= 0 ? boxes.findIndex(b => b.li === _wkFocusLi) : -1;
    const idx = WorkoutFocus.pickFocusedStable(boxes, mid, cur, 56);
    const li = idx >= 0 ? boxes[idx].li : -1;
    if (li !== _wkFocusLi) { _wkFocusLi = li; _wkFocusApply(); }
  } catch(_) {}
}

// Hoechstens EINE Auswertung je Bild. Das Scroll-Ereignis selbst tut nichts.
function _wkFocusSoon() { if (!_wkFocusRaf) _wkFocusRaf = requestAnimationFrame(_wkFocusTick); }

/* ── Kein Nachrasten mehr ─────────────────────────────────────────────────
   Frueher raeumte hier eine Funktion 180 ms nach dem Stillstand nach: bei
   'proximity' blieb die Ansicht sonst zwischen zwei Karten stehen. Mit
   'mandatory' + scroll-snap-stop:always gibt es diesen Zwischenzustand nicht
   mehr — WebKit setzt selbst auf genau einen Rastpunkt, und zwar auf den
   naechsten, nie auf einen uebersprungenen. Eine zweite Kraft auf derselben
   Achse waere jetzt schaedlich: sie zoege gegen das Einrasten und laese sich
   als Nachschlagen. */

/* Rastabstand = Klebe-Offset von #wk-sticky (58px) + dessen echte Hoehe.
   Coach-Leiste und Pausenbalken kommen und gehen; ein fester Wert waere
   entweder zu klein (Karte liegt hinter der Leiste) oder zu gross (Karte
   startet mit einer Luecke). Ein ResizeObserver haelt den Wert nach. */
let _wkStickyRO = null;
let _wkSnapPadRaf = 0;

/* Nur schreiben, wenn sich der Wert wirklich aendert. Die Coach-Leiste faehrt
   ihre Hoehe ueber 300 ms — ohne diese Schranke meldete der ResizeObserver
   JEDEN Zwischenwert, jeder davon setzte eine CSS-Variable am Scroller, und
   jede Aenderung von scroll-padding zwingt WebKit, die Rastpunkte des ganzen
   Blattes neu zu rechnen. Das war die zweite Haelfte der Hitze. */
function _wkSyncSnapPad() {
  const sheet = document.querySelector('#ov-wk .sheet');
  const sticky = document.getElementById('wk-sticky');
  if (!sheet || !sticky) return;
  const v = Math.round(58 + sticky.getBoundingClientRect().height + 8);
  if (v === _wkSnapPadPx) return;
  _wkSnapPadPx = v;
  sheet.style.setProperty('--wk-snap-pad', v + 'px');
  // Die Leisten sind gewachsen/geschrumpft → die Karten liegen woanders.
  _wkFocusDirty = true;
  _wkFocusSoon();
}
/* Hoechstens EIN Abgleich je Bild. Die Kette dahinter ist teuer: Rastabstand
   schreiben → WebKit rechnet die Rastpunkte des ganzen Blattes neu → Kartenlage
   neu messen. Der ResizeObserver an #wk-sticky meldet dagegen jede Regung. */
function _wkSnapPadSoon() {
  if (_wkSnapPadRaf) return;
  _wkSnapPadRaf = requestAnimationFrame(() => { _wkSnapPadRaf = 0; _wkSyncSnapPad(); });
}

function _wkFocusObserve() {
  try {
    _wkSyncSnapPad();
    const sticky = document.getElementById('wk-sticky');
    if (sticky && !_wkStickyRO && typeof ResizeObserver !== 'undefined') {
      _wkStickyRO = new ResizeObserver(() => _wkSnapPadSoon());
      _wkStickyRO.observe(sticky);
    }
  } catch(_) {}
  const wrap = document.getElementById('log-cards');
  const sheet = document.querySelector('#ov-wk .sheet');
  if (!wrap || !sheet || typeof WorkoutFocus === 'undefined') return;
  const cards = wrap.querySelectorAll('.ex-card');
  // Bei 0–1 Karten gibt es nichts zu fokussieren — nichts dimmen.
  wrap.classList.toggle('focus-on', cards.length > 1);
  if (cards.length < 2) { _wkFocusLi = -1; _wkFocusBoxes = null; return; }
  if (_wkFocusLi >= wkLogs.length) _wkFocusLi = -1;   // nach Entfernen/Umsortieren
  // EIN passiver Zuhoerer fuer die Lebensdauer des Blattes — nicht ein Observer
  // je Karte, der bei jedem Rendern neu aufgebaut wird.
  if (!_wkFocusBound) {
    sheet.addEventListener('scroll', _wkFocusSoon, { passive: true });
    _wkFocusBound = true;
  }
  _wkFocusDirty = true;
  _wkFocusSoon();
}

/* ── Karten-Diff: nur austauschen, was sich geaendert hat ──────────────────
   Bis hierher ersetzte jeder Satz-Haken #log-cards komplett per innerHTML. Bei
   sechs Uebungen heisst das: sechs Glaskarten (jede mit backdrop-filter, also
   je einer eigenen Weichzeichner-Ebene) werden verworfen und neu aufgebaut,
   dazu alle Satzzeilen, Wischgriffe und Knoepfe — fuer EINEN Haken. Genau das
   war das Stocken beim Abhaken.

   Jetzt liefert renderLogCards() je Uebung ein Stueck Markup. Verglichen wird
   Zeichenkette gegen Zeichenkette; ausgetauscht wird nur, wo sie sich
   unterscheiden. Beim Abhaken ist das genau eine Karte, die anderen behalten
   ihre Ebenen und ihren Zustand.

   Bricht die Annahme (Anzahl geaendert, Karte nicht auffindbar, erster
   Aufbau), faellt die Funktion auf den vollstaendigen Aufbau zurueck — der
   Diff ist eine Abkuerzung, nie die einzige Moeglichkeit. */
let _lcChunks = null;
/* Anker gegen das Wegrutschen: taucht die Vorschlagskarte des Coaches auf,
   waechst die Uebungskarte nach UNTEN — und alles darunter rutscht mit. Stand
   die eingerastete Uebung weiter oben, schob es sie aus dem Bild; genau das war
   der Befund ("dann ist die Uebung ganz schnell ausserhalb vom Sichtfeld").

   Gemessen wird die Bildschirmlage der eingerasteten Karte VOR und NACH dem
   Austausch; die Differenz wird auf den Scrollstand addiert. Die Karte steht
   danach exakt dort, wo sie vorher stand — der neue Inhalt waechst um sie
   herum, statt sie wegzuschieben. */
function _lcAnker(){
  try {
    const sheet = document.querySelector('#ov-wk .sheet');
    if (!sheet || _wkFocusLi < 0) return null;
    const el = sheet.querySelector('#log-cards .ex-card[data-li="' + _wkFocusLi + '"]');
    if (!el) return null;
    return { sheet: sheet, li: _wkFocusLi, top: el.getBoundingClientRect().top };
  } catch(_) { return null; }
}
function _lcAnkerHalten(a){
  if (!a) return;
  try {
    const el = a.sheet.querySelector('#log-cards .ex-card[data-li="' + a.li + '"]');
    if (!el) return;
    const d = el.getBoundingClientRect().top - a.top;
    if (Math.abs(d) > 0.5) a.sheet.scrollTop += d;
  } catch(_) {}
}
function _lcApply(chunks) {
  const wrap = document.getElementById('log-cards');
  if (!wrap) return;
  const anker = _lcAnker();
  const voll = () => {
    wrap.innerHTML = chunks.join('');
    _lcChunks = chunks.slice();
  };
  if (!_lcChunks || _lcChunks.length !== chunks.length || !wrap.firstElementChild) { voll(); _lcAnkerHalten(anker); return; }
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i] === _lcChunks[i]) continue;
    const card = wrap.querySelector('.ex-card[data-li="' + i + '"]');
    if (!card) { voll(); _lcAnkerHalten(anker); return; }   // Annahme gebrochen → alles neu
    // Der Supersatz-Verbinder gehoert zum Stueck und steht VOR der Karte.
    const vor = card.previousElementSibling;
    const alt = (vor && vor.classList.contains('ss-connector')) ? [vor, card] : [card];
    const tmp = document.createElement('div');
    tmp.innerHTML = chunks[i];
    const neu = [...tmp.childNodes];
    alt[0].before(...neu);
    alt.forEach(n => n.remove());
  }
  _lcChunks = chunks.slice();
  _lcAnkerHalten(anker);
  // Die Karten liegen jetzt anders — die Messwerte des Fokus sind veraltet.
  _wkFocusDirty = true;
  _wkFocusSoon();
}

function renderLogCards() {
  // Vorschlagskarte des Live-Coaches gehört zu einer bestimmten Übung — wenn die
  // (z. B. per Swipe) aus dem Training entfernt wurde, ist die Karte hinfällig.
  try { if (_coachCard && !wkLogs.some(l => l.exerciseId === _coachCard.exId)) _coachClearCard(); } catch(_) {}
  // KI-Aura: pulsierender Glow um die Übung, an der der Live-Coach gerade "dran ist"
  // (erste Übung mit offenen Sätzen) — sichtbares Signal, dass die KI mitliest.
  let _auraLi = -1;
  try {
    if (typeof isPremium === 'function' && isPremium() && _coachLevel() !== 'off')
      _auraLi = wkLogs.findIndex(l => (l.sets || []).some(s => !s.done));
  } catch(_) {}
  // Das Dimmen steht bewusst NICHT mehr im Markup: es haengt allein an
  // _wkFocusApply(). Sonst haetten Vorlage und DOM zwei Quellen fuer denselben
  // Zustand — und beim Karten-Diff unten wuerde eine Karte mit unveraendertem
  // Markup eine zwischenzeitlich gesetzte Klasse behalten. _wkFocusApply()
  // laeuft am Ende dieser Funktion, also noch vor dem naechsten Bild.
  const _chunks = wkLogs.map((log,li)=>{
    const ex = exById(log.exerciseId);
    const isTime = ex.targetType === 'time';
    const goalLabel = isTime ? `${ex.targetSets}×${fmtSec(ex.targetReps)}` : `${ex.targetSets}×${repGoalShort(ex)}`;
    const prevSets = lastSessionSetsFor(log.exerciseId);
    const displayName = log._overrideName || ex.name;
    const ssLinked = !!log.ssGroup;
    const ssConnector = ssLinked && li > 0 && wkLogs[li-1].ssGroup === log.ssGroup
      ? '<div class="ss-connector"><span></span></div>' : '';
    return `${ssConnector}<div class="ex-card${ssLinked ? ' ss-linked' : ''}${li === _auraLi ? ' coach-aura' : ''}" data-li="${li}">
      <div class="ex-card-swipe-bg"><span>🗑 Entfernen</span></div>
      <div class="ex-head">
        <span class="wk-drag-handle" onmousedown="wkDragStart(event,${li})" ontouchstart="wkDragStart(event,${li})">⠿</span>
        <span class="ex-title ex-title-tap" onclick="openExEditMenu(${li})">${esc(displayName)} <span style="opacity:.45;font-size:13px;margin-left:4px">›</span></span>
        ${ssLinked ? '<span class="ss-badge">SS</span>' : ''}
        <span class="ex-goal-tap" style="font-size:13px;color:var(--text2)" onclick="openExEditMenu(${li})">Ziel: ${goalLabel} ›</span>
        <button class="ex-chart-btn" onclick="openDet('${log.exerciseId}')" title="Verlauf & Diagramm" aria-label="Verlauf & Diagramm"><svg viewBox="0 0 24 24"><polyline points="3,17 9,11 13,15 21,6"/><polyline points="15,6 21,6 21,12"/></svg></button>
        <button class="ex-swap-btn" onclick="openExSwap(${li})" title="Übung tauschen" aria-label="Übung tauschen">⇄</button>
      </div>
      <div class="ex-body">
        <div class="set-hdr"><span></span><span></span><span>TYP</span><span>${unitLabel().toUpperCase()}</span><span>${isTime?'ZEIT':'WDH'}</span><span></span></div>
        ${log.sets.map((s,si)=>{
          const elapsed = s.tRunning ? s.tElapsed + Math.floor((Date.now()-s.tStart)/1000) : (s.tElapsed||0);
          const remaining = Math.max(0, (ex.targetReps||0) - elapsed);
          const timerCls = s.done ? 'done-t' : (s.tRunning ? 'running' : '');
          const timerIcon = s.tRunning ? '⏸' : (s.tElapsed > 0 ? '↺' : '▶');
          const type = s.type || 'normal';
          const typeLabel = SET_TYPE_LABEL[type] || '';
          // Letztes Mal Hint
          let prevHint = '';
          if (prevSets && prevSets[si]) {
            const p = prevSets[si];
            if (isTime) {
              const t = parseInt(p.r||p.tElapsed||0);
              if (t > 0) prevHint = `<div class="set-prev-hint">letztes Mal: <b>${fmtSec(t)}</b>${p.w?` @ <b>${kgToDisp(p.w)} ${unitLabel()}</b>`:''}</div>`;
            } else if (p.w || p.r) {
              prevHint = `<div class="set-prev-hint">letztes Mal: <b>${p.w?kgToDisp(p.w)+' '+unitLabel():'–'}</b> × <b>${p.r||'–'}</b></div>`;
            }
          }
          const wDisp = s.w === '' || s.w == null ? '' : kgToDisp(s.w);
          const _neu = !!(_wkNeueZeile && _wkNeueZeile.li === li && _wkNeueZeile.si === si
                          && Date.now() - _wkNeueZeile.ts < 800);
          return `
        <div class="set-row${s.done?' done':''}${_neu?' set-row-neu':''}" data-si="${si}">
          <button class="set-del" onclick="delSet(${li},${si})">−</button>
          <div class="set-n">${s.pr?'<span class="set-pr-star" title="Persönlicher Rekord!">🏆</span>':si+1}</div>
          <button class="set-type ${type}" onclick="openSetTypePopup(${li},${si})" title="${SET_TYPE_TITLE[type]} – tippen für Typ-Auswahl">${typeLabel||'•'}</button>
          <button class="set-in set-in-btn${s.w && s.w===log.sugW?' is-sug':''}${_wkFrisch(_wkWert,li,si) && _wkWert.field==='w'?' just-set':''}" onclick="openWheel(${li},${si},'w')">${wDisp===''?'<span class="set-in-ph">–</span>':wDisp}</button>
          ${isTime
            ? `<button class="set-timer-btn ${timerCls}" id="set-timer-${li}-${si}" onclick="toggleSetTimer(${li},${si})">
                <span class="set-timer-time">${s.done ? fmtSec(ex.targetReps) : fmtSec(remaining)}</span>
                <span style="font-size:12px">${s.done ? '✓' : timerIcon}</span>
               </button>`
            : `<button class="set-in set-in-btn${s.r && s.r===log.sugR?' is-sug':''}${_wkFrisch(_wkWert,li,si) && _wkWert.field==='r'?' just-set':''}" onclick="openWheel(${li},${si},'r')">${s.r===''||s.r==null?'<span class="set-in-ph">–</span>':s.r}</button>`
          }
          <button class="set-chk${s.done?' done':''}${s.done && _wkFrisch(_wkTick,li,si,600)?' just-done':''}" onclick="toggleSetDone(${li},${si})">
            <svg viewBox="0 0 12 10"><polyline points="1,5.5 4.5,9 11,1"/></svg>
          </button>
        </div>${prevHint}`;}).join('')}
        <button class="add-set-btn" onclick="addSet(${li})">+ Satz</button>
      </div>
    </div>`;
  });
  _lcApply(_chunks);
  _attachSwipeToDelete();
  // Erst die Fokus-Schicht neu anbinden (sie begrenzt _wkFocusLi nach dem
  // Entfernen/Umsortieren), dann die Klassen setzen — noch im selben Bild.
  try { _wkFocusObserve(); } catch(_) {}
  try { _wkFocusApply(); } catch(_) {}
  _saveActiveWkSoon();
  try { _coachBarRender(); } catch(_) {}
  // Deckt toggleSetDone/addSet/delSet gleich mit ab: alle drei rendern neu.
  try { _wkBarRender(); } catch(_) {}
  // "Uebung geoeffnet": die erste Uebung mit offenen Saetzen — dieselbe Uebung
  // erneut liefert dank Entprellung in _csExercise() KEINE zweite Ansage.
  try { _csSyncCurrentEx(); } catch(_) {}
}

/* ── SWIPE-TO-DELETE (Übung im aktiven Training nach links wischen) ──
   Threshold: 35% der Card-Breite. Unter dem Threshold → zurückspringen.
   Über dem Threshold → Card raus-animieren + aus wkLogs löschen.        */
function _attachSwipeToDelete() {
  const cards = document.querySelectorAll('#log-cards .ex-card');
  cards.forEach(card => {
    if (card._swipeBound) return;
    card._swipeBound = true;
    let startX = 0, startY = 0;
    let dx = 0;
    let active = false;
    let decided = false;
    let dir = null; // 'h' | 'v'
    const bg = card.querySelector('.ex-card-swipe-bg');

    const onStart = (e) => {
      // Wenn das Touch auf einem Button / Input / Drag-Handle startet → kein Swipe
      const tgt = e.target;
      if (tgt.closest('button, input, .wk-drag-handle, .set-in, .set-chk, .set-del, .set-type, .set-timer-btn, .add-set-btn, .ex-info-btn, .ex-title-tap')) return;
      const t = e.touches ? e.touches[0] : e;
      startX = t.clientX; startY = t.clientY;
      dx = 0; active = true; decided = false; dir = null;
      card.classList.add('is-swiping');
    };
    const _resetCard = () => {
      card.style.transform = '';
      if (bg) bg.classList.remove('on');
      card.classList.remove('is-swiping');
    };
    const onMove = (e) => {
      if (!active) return;
      // Tab-Wechsel hat Vorrang → Lösch-Swipe sofort abbrechen
      if (window._tabSwipeActive) { active = false; _resetCard(); return; }
      const t = e.touches ? e.touches[0] : e;
      const ax = t.clientX - startX;
      const ay = t.clientY - startY;
      if (!decided) {
        if (Math.abs(ax) > 8 || Math.abs(ay) > 8) {
          decided = true;
          dir = Math.abs(ax) > Math.abs(ay) ? 'h' : 'v';
        }
      }
      if (dir !== 'h') return;
      // Nur Links-Swipe (negative dx)
      dx = Math.min(0, ax);
      card.style.transform = 'translateX(' + dx + 'px)';
      const cw = card.offsetWidth || 1;
      if (bg) bg.classList.toggle('on', Math.abs(dx) > cw * 0.15);
      if (Math.abs(ax) > 8 && e.cancelable) e.preventDefault();
    };
    const onEnd = () => {
      if (!active) return;
      active = false;
      card.classList.remove('is-swiping');
      // Tab-Wechsel hat Vorrang → nicht löschen
      if (window._tabSwipeActive) { _resetCard(); return; }
      if (dir !== 'h') {
        card.style.transform = ''; if (bg) bg.classList.remove('on');
        return;
      }
      const cw = card.offsetWidth || 1;
      const li = parseInt(card.dataset.li);
      if (Math.abs(dx) > cw * 0.35 && !Number.isNaN(li)) {
        card.classList.add('swipe-removing');
        try { haptic([15, 30, 15]); } catch(_) {}
        setTimeout(() => {
          wkLogs.splice(li, 1);
          renderLogCards();
        }, 320);
      } else {
        card.style.transform = '';
        if (bg) bg.classList.remove('on');
      }
    };

    card.addEventListener('touchstart', onStart, {passive: true});
    card.addEventListener('touchmove',  onMove,  {passive: false});
    card.addEventListener('touchend',   onEnd);
    card.addEventListener('touchcancel', onEnd);
    card.addEventListener('mousedown',  onStart);
    card.addEventListener('mousemove',  onMove);
    card.addEventListener('mouseup',    onEnd);
    card.addEventListener('mouseleave', onEnd);
  });
}

function setVal(li,si,f,v) { wkLogs[li].sets[si][f]=v; _saveActiveWk(); }
let _restInt = null, _restSecs = 0, _restEndTs = 0, _restSmart = false, _restTotal = 0;
/* ── PAUSENINTELLIGENZ ──────────────────────────────────────
   Empfohlene Satzpause abhängig von Übung (Muskelgruppe),
   Belastung (Wiederholungen) und Gewicht relativ zum Bestwert. */
function smartRestSecs(ex, set) {
  // Zeit-/Halte-Übungen: kurze feste Pause
  if (ex?.targetType === 'time') return 60;

  // Basis nach Muskelgruppe – große, mehrgelenkige Muskeln brauchen länger
  const base = ({
    beine: 150, ruecken: 150, brust: 120,
    schultern: 90, arme: 75, core: 60
  })[ex?.muscleGroup] ?? 90;

  let secs = base;

  // Wiederholungen des gerade beendeten Satzes:
  // wenige Wdh = schwer/Kraft → mehr Pause; viele Wdh = Ausdauer → weniger
  const reps = parseFloat(set?.r);
  if (!isNaN(reps) && reps > 0) {
    if (reps <= 5)       secs *= 1.30;
    else if (reps <= 8)  secs *= 1.15;
    else if (reps <= 12) secs *= 1.00;
    else if (reps <= 15) secs *= 0.85;
    else                 secs *= 0.75;
  }

  // Gewicht relativ zum bisherigen Bestwert dieser Übung (Intensitäts-Proxy)
  const w = parseFloat(set?.w);
  if (!isNaN(w) && w > 0 && ex?.id) {
    let best = 0;
    exHistory(ex.id).forEach(h => { const m = maxW(h.sets); if (m > best) best = m; });
    if (best > 0) {
      const ratio = w / best;
      if (ratio >= 0.95)      secs *= 1.15;
      else if (ratio >= 0.85) secs *= 1.05;
      else if (ratio <= 0.60) secs *= 0.90;
    }
  }

  // Post-Workout-Check-in wirkt mit: schwer/energiearm → längere Pausen,
  // locker bei voller Energie → etwas kürzere (s. _ciReadiness).
  const rd = _ciReadiness();
  if (rd && rd.restMult !== 1) secs *= rd.restMult;

  // Ermuedung der Muskelgruppe (Erholungsmodell). Wer mit 70 % Restermuedung in
  // die Uebung geht, braucht zwischen den Saetzen laenger — das ist derselbe
  // Wert, aus dem der Live-Coach auch Volumen und Vorschlaege ableitet.
  try {
    const mgRec = getMuscleGroupRecovery();
    const fat = (ex && ex.muscleGroup && mgRec[ex.muscleGroup]) ? (mgRec[ex.muscleGroup].fatPct || 0) : 0;
    if (fat >= 60)      secs *= 1.20;
    else if (fat >= 40) secs *= 1.10;
    else if (fat <= 15) secs *= 0.95;
  } catch(_) {}

  // Wie sich der GERADE beendete Satz gemessen hat (_rpeDerive schreibt die
  // abgeleitete Einschaetzung auf den Satz). Ein Satz unter der Prognose heisst
  // laengere Pause, einer darueber darf kuerzer werden.
  const feel = set && set.rpeAnswer;
  if (feel === 'hard')      secs *= 1.15;
  else if (feel === 'easy') secs *= 0.92;

  secs = Math.round(secs / 5) * 5;          // auf 5s runden
  return Math.max(45, Math.min(240, secs)); // sinnvolle Grenzen 45s–4min
}

// ── Pause-Ende-Signal im Hintergrund ──────────────────
// In-App feuert haptic() beim Erreichen von 0. Im Hintergrund drosselt iOS
// setInterval → der Tick kommt nicht zuverlässig. Darum planen wir zusätzlich
// eine lokale Notification (Banner + Ton + Vibration) auf den Endzeitpunkt.
// Wird die Pause vorzeitig beendet/verlängert oder läuft sie in der offenen App
// aus, canceln wir die Notification wieder, damit kein doppeltes Signal kommt.
const REST_NOTIF_ID = 2500;
let _restNotifPermAsked = false;
async function _ensureRestNotifPermission() {
  const LN = _cap('LocalNotifications'); if (!LN || _restNotifPermAsked) return;
  _restNotifPermAsked = true;
  try {
    const perm = await LN.checkPermissions().catch(() => ({ display: 'prompt' }));
    if (perm.display === 'prompt' || perm.display === 'prompt-with-rationale') {
      await LN.requestPermissions().catch(() => {});
    }
    await LN.createChannel?.({
      id: 'gymtrack-reminders', name: 'Trainings-Erinnerungen',
      importance: 5, visibility: 1, sound: 'default'
    }).catch(() => {});
  } catch (e) {}
}
function _scheduleRestEndNotif(atTs) {
  const LN = _cap('LocalNotifications'); if (!LN) return;
  try {
    LN.schedule({ notifications: [{
      id: REST_NOTIF_ID,
      title: 'Pause vorbei',
      body: 'Weiter geht’s – nächster Satz!',
      schedule: { at: new Date(atTs), allowWhileIdle: true },
      sound: 'default',
      channelId: 'gymtrack-reminders'
 }]}).catch(() => {});
  } catch (e) {}
}
function _cancelRestEndNotif() {
  const LN = _cap('LocalNotifications'); if (!LN) return;
  try { LN.cancel({ notifications: [{ id: REST_NOTIF_ID }] }).catch(() => {}); } catch (e) {}
}

function startRestTimer(ex, set) {
  // Pausenintelligenz aktiv & Kontext vorhanden → empfohlene Pause, sonst manueller Standard
  _restSmart = !!(S.smartRest && ex);
  _restSecs = _restSmart ? smartRestSecs(ex, set) : (S.restTimerSecs || 90);
  _restEndTs = Date.now() + _restSecs * 1000; // Endzeitpunkt für native Live-Activity-Countdown
  _restTotal = _restSecs;            // Bezugsgroesse fuer den Fortschrittsfaden
  _scheduleRestEndNotif(_restEndTs); // Hintergrund-Signal planen
  _beginRestCountdown();
  _saveActiveWk(); // Endzeitpunkt sichern → übersteht App-Neustart (s. _restoreActiveWk)
}
// Startet/zeigt die Anzeige aus dem absoluten Endzeitpunkt (_restEndTs). Wird sowohl
// beim normalen Start als auch beim Wiederherstellen nach App-Neustart genutzt.
function _beginRestCountdown() {
  clearInterval(_restInt);
  // Geplante Laenge dieser Pause fuer den Erzaehlbogen festhalten: bei Ablauf ist
  // _restSecs 0, und CoachSession.onRest() braucht die tatsaechliche Pausenlaenge
  // (Vorschau ab 60 s, Ermuedung aus wachsenden Pausen).
  _csRestPlan = _restSecs || 0;
  // Beim Wiederherstellen nach App-Neustart fehlt die Bezugsgroesse — dann
  // gilt der laufende Rest als Gesamtlaenge, sonst waere der Faden leer.
  if (!_restTotal || _restTotal < _restSecs) _restTotal = _restSecs;
  _updRest();
  // Anzeige aus dem absoluten Endzeitpunkt (_restEndTs) ableiten — exакt dieselbe
  // Quelle wie die native Dynamic Island, exakt. So bleiben App und Island synchron, auch
  // wenn setInterval im Hintergrund gedrosselt wird oder ein Tick verspätet feuert.
  let _lastShown = -1;
  _restInt = setInterval(() => {
    const remaining = Math.max(0, Math.round((_restEndTs - Date.now()) / 1000));
    _restSecs = remaining;
    if (remaining !== _lastShown) {
      _updRest();
      _lastShown = remaining;
      _syncLiveActivity(); // nur bei Sekundenwechsel an die Dynamic Island pushen
    }
    if (remaining <= 0) {
      clearInterval(_restInt); _restInt = null;
      _wkBarRender();
      _cancelRestEndNotif(); // App war offen → in-App-Signal reicht, Banner unterdrücken
      haptic([30,50,30]);
      _saveActiveWk(); // beendete Pause sichern, damit sie beim Neustart nicht wiederkehrt
      try { _csRest(_csRestPlan); } catch(_) {}   // Pausentimer abgelaufen
    }
  }, 250);
  _syncLiveActivity();
}
function _updRest() {
  const el = document.getElementById('rest-timer-val');
  if (!el) return;
  el.textContent = Math.floor(_restSecs/60) + ':' + String(_restSecs%60).padStart(2,'0');
  _wkBarRender();
}
/* Zeichnet die Trainings-Leiste. Zwei Zustaende, GLEICHE Hoehe: laeuft eine
   Pause, zeigt die rechte Seite sie samt Faden; sonst steht dort der
   Satzfortschritt. Nur der Inhalt wechselt — die Hoehe von #wk-sticky bleibt,
   damit die Rastpunkte des Blattes nicht neu gerechnet werden muessen. */
function _wkBarRender() {
  const rest = document.getElementById('wk-rest');
  const prog = document.querySelector('#wk-bar-prog i');
  const sp   = document.getElementById('wk-setprog');
  if (!rest || !sp || typeof WorkoutBar === 'undefined') return;
  const laeuft = _restInt != null && _restSecs > 0;
  rest.style.display = laeuft ? '' : 'none';
  sp.style.display   = laeuft ? 'none' : '';
  if (laeuft) {
    const lbl = rest.querySelector('.wkb-rest-lbl');
    if (lbl) lbl.textContent = _restSmart ? 'Pause · Auto' : 'Pause';
    if (prog) prog.style.width = (WorkoutBar.restFraction(_restSecs, _restTotal) * 100) + '%';
  } else {
    if (prog) prog.style.width = '0%';
    const p = WorkoutBar.setProgress(typeof wkLogs !== 'undefined' ? wkLogs : []);
    sp.textContent = p.done + '/' + p.total + ' Sätze';
  }
}
function skipRest() {
  clearInterval(_restInt); _restInt = null;
  _wkBarRender();
  _cancelRestEndNotif();
  _syncLiveActivity();
  _saveActiveWk(); // übersprungene Pause sichern
}
function adjustRest(delta) {
  _restSecs = Math.max(0, _restSecs + delta);
  if (_restSecs <= 0) { skipRest(); return; }
  _restTotal = Math.max(_restTotal, _restSecs);   // "+15" darf den Faden nicht ueber 100 % treiben
  _restEndTs = Date.now() + _restSecs * 1000;
  _csRestPlan = _restSecs;           // verschobene Pause ist die neue geplante Laenge
  _scheduleRestEndNotif(_restEndTs); // verschobenes Ende neu planen (überschreibt gleiche ID)
  _updRest();
  haptic(8);
  _syncLiveActivity();
  _saveActiveWk(); // verschobenes Pausen-Ende sichern
}
/* ── Auto-Weiter: letzter offener Satz der Einheit abgehakt → naechste offene
   Uebung ins Bild. 600 ms Verzoegerung, damit der Haken-Moment sichtbar bleibt.
   Unterdrueckt, wenn ueber dem Training ein Overlay liegt (Wheel, Satz-Typ,
   Untersheets) oder der Finger noch auf dem Sheet ist — wer selbst nach oben
   scrollt (etwa zum "Abbrechen"), soll nicht weggezogen werden. ── */
let _wkAdvTimer = null;
let _wkSheetTouching = false;
(function () {
  const sheet = document.querySelector('#ov-wk .sheet');
  if (!sheet) return;
  sheet.addEventListener('touchstart',  () => { _wkSheetTouching = true;  }, { passive: true });
  sheet.addEventListener('touchend',    () => { _wkSheetTouching = false; }, { passive: true });
  sheet.addEventListener('touchcancel', () => { _wkSheetTouching = false; }, { passive: true });
})();

/* Steht fuer diese Uebung noch eine Coach-Auswertung aus? Drei Phasen, und in
   allen dreien darf das Blatt nicht weiterziehen:
   1. die Entprellung laeuft noch (_coachEvalTimers, Schluessel "li_si"),
   2. die Anfrage ist unterwegs (die Leiste steht auf 'thinking'),
   3. ein Vorschlag steht und wartet auf Antwort (_coachCard). */
function _coachBeschaeftigt(li) {
  try {
    if (_coachCard) return true;
    if (_coachBarState && _coachBarState.mode === 'thinking') return true;
    const p = li + '_';
    return Object.keys(_coachEvalTimers || {}).some(k => k.indexOf(p) === 0);
  } catch(_) { return false; }
}
function _wkAutoAdvance(li) {
  if (typeof WorkoutFocus === 'undefined') return;
  const unit = WorkoutFocus.focusUnitOf(wkLogs, li);
  if (!unit.length) return;
  const stillOpen = unit.some(i => (wkLogs[i].sets || []).some(s => !s.done));
  if (stillOpen) return;                                  // Einheit noch nicht fertig
  if (WorkoutFocus.nextOpenUnit(wkLogs, li) == null) return;  // alles fertig → kein Scroll
  clearTimeout(_wkAdvTimer);
  const seit = Date.now();
  /* Der Coach braucht laenger als das Blatt: die Auswertung ist um 1,2 s
     entprellt, das Weiterziehen lief nach 0,6 s. Der Vorschlag zur eben
     beendeten Uebung erschien also GRUNDSAETZLICH erst, nachdem man schon
     woanders stand — und die Uebung, um die es ging, lag dann ausgegraut
     ausserhalb des Bildes. Es war nie ein Zufall, sondern immer so.
     Jetzt wartet das Weiterziehen, bis der Coach fertig ist: kein Vorschlag
     unterwegs, keiner offen. Die Obergrenze faengt den Fall ab, dass ein
     Vorschlag unbeantwortet stehen bleibt — nach einer Minute zieht das Blatt
     weiter, damit es nicht stehen bleibt, nur weil man nicht antwortet. */
  const MAX_WARTEN = 60000;
  const tick = () => {
    _wkAdvTimer = 0;
    if (document.querySelector('.ov.on:not(#ov-wk)')) return;  // Wheel/Satz-Typ/Untersheet offen
    if (_wkSheetTouching) return;                              // Nutzer scrollt/beruehrt gerade
    // Lage neu bewerten: ein angenommener Top-Satz haengt der eben beendeten
    // Uebung einen Satz an — dann ist sie nicht mehr fertig und das Blatt hat
    // hier gar nichts mehr zu suchen.
    const u = WorkoutFocus.focusUnitOf(wkLogs, li);
    if (!u.length || u.some(i => ((wkLogs[i] && wkLogs[i].sets) || []).some(s => !s.done))) return;
    if (_coachBeschaeftigt(li) && Date.now() - seit < MAX_WARTEN) {
      _wkAdvTimer = setTimeout(tick, 700);
      return;
    }
    const target = WorkoutFocus.nextOpenUnit(wkLogs, li);
    if (target == null) return;
    const card = document.querySelector(`#log-cards .ex-card[data-li="${target}"]`);
    if (!card) return;
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };
  _wkAdvTimer = setTimeout(tick, 600);
}

function toggleSetDone(li,si) {
  const next = !wkLogs[li].sets[si].done;
  wkLogs[li].sets[si].done = next;
  // Nur beim Setzen, nicht beim Zuruecknehmen: das Aufploppen ist die
  // Bestaetigung "geschafft" — beim Abwaehlen waere es eine Feier fuer nichts.
  _wkTick = next ? { li: li, si: si, ts: Date.now() } : null;
  haptic(next ? 18 : 8);
  if (next) {
    // Satz jetzt bestätigt → erst jetzt auf PR prüfen und ggf. feiern.
    try { checkLiveSetPR(li, si); } catch(_) {}
    // Live-Coach-Vorschlagskarte (KI, ratenlimitiert) wird erst hier ausgeloest, nicht
    // schon beim Eintragen von Gewicht/Wdh im Wheel: "Satz erledigt" ist dieses
    // Haekchen, nicht der Wheel-Commit (vorher kam die Karte zu frueh).
    try { _coachEval(li, si); } catch(_) {}
    // Der Coach meldet sich im Moment des Abhakens — das ist der Punkt, an dem
    // der Nutzer den Satz als erledigt erlebt (Aufwärmsätze eingeschlossen).
    try { _coachMicroReact(li, si); } catch(_) {}
    // Fokus-Modus: war das der letzte offene Satz dieser Einheit, holt der
    // naechste offene Block sich gleich die Buehne.
    try { _wkAutoAdvance(li); } catch(_) {}
    // Erzaehlbogen (Task 17): Halbzeit-Einordnung und Ermuedung. Aufwaermsaetze
    // zaehlen nicht in den Bogen — sie sind kein Arbeitssatz.
    try {
      const _cl = wkLogs[li], _cs = _cl && _cl.sets && _cl.sets[si];
      // Ein Satz zaehlt EINMAL in den Bogen. Abhaken, zur Korrektur wieder
      // abwaehlen und erneut abhaken ist ein realer Ablauf; ohne diesen Riegel
      // wuchsen setCount und Volumen bei jedem Mal weiter, die Halbzeit kam zu
      // frueh und meldete ein Volumen, das so nie bewegt wurde.
      if (!_csSeenSets) _csSeenSets = new Set();
      const _ck = String(_cl && _cl.exerciseId) + '|' + si;
      if (_cs && (_cs.type || 'normal') !== 'warmup' && !_csSeenSets.has(_ck)) {
        _csSeenSets.add(_ck);
        const _now = Date.now();
        // ECHTE Pause statt S.restTimerSecs: der Abstand zum zuletzt
        // abgehakten Arbeitssatz. Erst ab dem zweiten Satz, und nur bis
        // CS_REST_MAX_S — laenger ist eine Unterbrechung und keine Satzpause,
        // und ein Ausreisser wuerde den Wochenschnitt unbrauchbar machen.
        if (_csLastSetTs > 0) {
          const _rs = Math.round((_now - _csLastSetTs) / 1000);
          if (_rs > 0 && _rs <= CS_REST_MAX_S) _cs.rs = _rs;
        }
        _csLastSetTs = _now;
        _csSet({ exId: _cl.exerciseId, reps: parseInt(_cs.r) || null,
                 kg: parseFloat(_cs.w) || null, ts: _now });
      }
    } catch(_) {}
    // Satz-Einschaetzung: abgeleitet aus Soll und Ist, nicht mehr erfragt.
    // Steht VOR startRestTimer() — smartRestSecs() liest die Einschaetzung.
    try { _rpeDerive(li, si); } catch(_) {}
    const log = wkLogs[li];
    if (log.ssGroup) {
      // Superset: Pause erst, wenn ALLE gekoppelten Übungen Satz Nr. si fertig haben
      const partners = wkLogs.filter(l => l.ssGroup === log.ssGroup);
      const allDone = partners.every(p => !p.sets[si] || p.sets[si].done);
      if (allDone) {
        startRestTimer(exById(log.exerciseId), log.sets[si]);
      } else {
        skipRest();
        const nextP = partners.find(p => p.sets[si] && !p.sets[si].done);
        if (nextP) _dndToast('Weiter mit ' + (nextP._overrideName || exById(nextP.exerciseId)?.name || 'Partner-Übung'));
      }
    } else {
      startRestTimer(exById(log.exerciseId), log.sets[si]);
    }
  } else skipRest();
  renderLogCards();
}
/* Welche Zeile gerade dazugekommen ist. Der Karten-Diff baut die Satzliste als
   Zeichenkette neu auf, die neue Zeile ist also ein frisches Element und
   erscheint schlagartig — beim Knopf "+ Satz" wie beim Top-Satz des Coaches
   ("das ist einfach abgehackt"). Diese Notiz gibt genau EINER Zeile die
   Auffahrt mit; alle anderen bleiben ohne Animation und flackern dadurch beim
   Abhaken nicht mit.
   Der Zeitstempel steht hier, weil eine Coach-Aktion zweimal hintereinander
   rendert (addSet rendert selbst, danach der Aufrufer nochmal). Beide Laeufe
   liegen im selben Tick — gezeichnet wird nur der zweite, und der soll die
   Animation noch haben. */
let _wkNeueZeile = null;
/* Dieselbe Notiz-Technik fuer die beiden anderen Bewegungen im Satz-Log: den
   frisch gesetzten Haken und den eben eingetragenen Wert. Warum ueberhaupt
   eine Notiz und nicht einfach eine CSS-Animation an .done bzw. am Feld: das
   Satz-Log wird als Zeichenkette neu gebaut, jede Zeile ist danach ein
   frisches Element — eine Animation an der Klasse liefe also bei JEDEM
   Neuzeichnen auf ALLEN erledigten Zeilen gleichzeitig los. Sichtbar waere
   das nicht als Bestaetigung, sondern als Flackern. Die Notiz sagt: genau
   diese eine Zeile, genau jetzt. */
let _wkTick = null;   // zuletzt abgehakter Satz
let _wkWert = null;   // zuletzt eingetragener Wert: { li, si, field, ts }
function _wkFrisch(m, li, si, ms) {
  return !!(m && m.li === li && m.si === si && Date.now() - m.ts < (ms || 800));
}
function addSet(li) {
  const ex = exById(wkLogs[li].exerciseId);
  const p = wkLogs[li].sets.slice(-1)[0];
  if (ex?.targetType === 'time') {
    wkLogs[li].sets.push({w:p?.w||'', tElapsed:0, tRunning:false, tStart:null});
  } else {
    wkLogs[li].sets.push({w:p?.w||'', r:p?.r||''});
  }
  _wkNeueZeile = { li: li, si: wkLogs[li].sets.length - 1, ts: Date.now() };
  renderLogCards();
  _syncLiveActivity();
}
function delSet(li,si) {
  if (wkLogs[li].sets.length<=1) return;
  const weg = () => {
    // Innerhalb der Wartezeit kann sich die Liste geaendert haben (Coach-
    // Aktion, Wiederherstellung): dann lieber nichts loeschen als den
    // falschen Satz.
    if (!wkLogs[li] || !wkLogs[li].sets[si] || wkLogs[li].sets.length <= 1) { renderLogCards(); return; }
    wkLogs[li].sets.splice(si,1);
    renderLogCards();
    _syncLiveActivity();
  };
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const row = document.querySelector(`#log-cards .ex-card[data-li="${li}"] .set-row[data-si="${si}"]`);
  if (!row || reduce) { weg(); return; }
  // Die Zeile faehrt hinaus, DANN wird gerechnet. Vorher verschwand sie
  // schlagartig und die Zeilen darunter sprangen eine Position hoch — bei
  // einem Loeschen, das man auch versehentlich ausloest, ist das die
  // unklarste aller Rueckmeldungen.
  haptic(8);
  row.classList.add('set-row-weg');
  const hint = row.nextElementSibling;
  if (hint && hint.classList.contains('set-prev-hint')) hint.classList.add('set-row-weg');
  setTimeout(weg, 240);
}

// Ziel-Satzzahl einer Übung SOFORT in ein laufendes Training spiegeln.
// Ohne das passiert nach „Übernehmen" in der offenen Trainingsansicht sichtbar
// nichts — die Empfehlung würde erst beim nächsten Training greifen, und genau so
// fühlte es sich an, als käme sie gar nicht an. Bereits abgehakte Sätze bleiben
// unangetastet: angepasst werden nur die noch offenen Zeilen am Ende.
// Rückgabe: true, wenn die Übung im laufenden Training vorkam.
function syncTargetToActiveWk(exId){
  try {
    if (!Array.isArray(wkLogs) || !wkLogs.length) return false;
    const li = wkLogs.findIndex(l => l && l.exerciseId === exId);
    if (li < 0) return false;
    const ex = exById(exId); if (!ex) return false;
    const log = wkLogs[li];
    const sets = log.sets || (log.sets = []);
    const target = Math.max(1, Math.min(12, parseInt(ex.targetSets) || sets.length));
    const isTime = ex.targetType === 'time';
    while (sets.length < target) {
      const p = sets[sets.length - 1];
      sets.push(isTime ? { w:(p && p.w) || '', tElapsed:0, tRunning:false, tStart:null }
                       : { w:(p && p.w) || '', r:(p && p.r) || '' });
    }
    // Kürzen nur von hinten und nur solange die letzte Zeile weder abgehakt noch
    // ausgefüllt ist — geloggte Arbeit darf eine Empfehlung nie löschen.
    while (sets.length > target && sets.length > 1) {
      const last = sets[sets.length - 1];
      if (last.done || last.r || last.tElapsed) break;
      sets.pop();
    }
    renderLogCards();
    try { _saveActiveWk(); } catch(_){}
    try { _syncLiveActivity(); } catch(_){}
    return true;
  } catch(e) { console.warn('[Ziel] Sync ins Training:', e); return false; }
}

/* Übungen, die im Training ersetzt/hinzugefügt wurden, bleiben zunächst nur für
   diese Einheit. Weicht die tatsächliche Übungsliste vom Quell-Plan ab, fragen wir
   am Ende, ob der Plan dauerhaft übernommen werden soll. Die Trainingsdaten selbst
   sind davon unabhängig (werden in finishWk so oder so gespeichert). */
function _maybeUpdatePlanFromSession(valid) {
  const src = _activePlanSrc;
  if (!src) return;
  let planObj = null, planName = '';
  if (src.type === 'preset') {
    planObj = (S.workoutPresets || []).find(x => x.id === src.id);
    if (planObj) planName = '„' + planObj.name + '"';
  } else if (src.type === 'week') {
    const wp = S.weekPlan && S.weekPlan[src.dayKey];
    if (wp && wp.type === 'exercises') { planObj = wp; planName = 'dein Tagesplan'; }
  }
  if (!planObj) return;
  const planIds = (planObj.exIds || []).filter(id => S.exercises.some(ex => ex.id === id));
  const sessIds = [];
  valid.forEach(l => { if (l.exerciseId && !sessIds.includes(l.exerciseId)) sessIds.push(l.exerciseId); });
  // Reihenfolge egal — nur ob sich die Menge der Übungen unterscheidet
  const sameSet = sessIds.length === planIds.length && sessIds.every(id => planIds.includes(id));
  if (sameSet) return;
  if (confirm('Du hast die Übungen in diesem Training geändert.\n\nSoll ' + (planName || 'der Plan') +
              ' dauerhaft mit diesen Übungen aktualisiert werden?\n\n(Deine Trainingsdaten werden so oder so gespeichert.)')) {
    planObj.exIds = sessIds.slice();
    persist();
  }
}

function finishWk() {
  clearInterval(timerInt); timerInt = null;
  clearInterval(setTimerInt); setTimerInt = null;
  try { Object.keys(_coachEvalTimers).forEach(k => clearTimeout(_coachEvalTimers[k])); _coachEvalTimers = {}; _coachClearCard(); } catch(_) {}
  // Zeit-Übungen: elapsed als r sichern
  wkLogs.forEach(l => {
    const ex = exById(l.exerciseId);
    if (ex?.targetType === 'time') {
      l.sets.forEach(s => { s.r = String(s.tElapsed||0); });
    }
  });
  skipRest();
  const dur = Math.floor((Date.now()-timerTs)/1000);
  const valid = wkLogs.filter(l=>l.sets.some(s=>s.w||s.r||s.tElapsed>0));
  if (!valid.length) { alert('Trag mindestens einen Satz ein!'); return; }
  const _wkNote = document.getElementById('wk-note')?.value?.trim() || '';
  if (document.getElementById('wk-note')) document.getElementById('wk-note').value = '';

  const _newSess = {id:uid(), date:new Date().toISOString(), duration:dur, note:_wkNote||undefined, logs:valid};
  S.sessions.push(_newSess);
  // Aktions-Log: Ergebnis nachtragen. Beim Annehmen steht im Log nur DASS ein
  // Vorschlag angenommen wurde — mit welchem Gewicht der Satz danach wirklich
  // lief, weiß erst die fertige Einheit. Je Übung+Typ genau einmal (Map), und
  // nur für Einträge aus DIESER Einheit ohne bereits gesetztes Ergebnis.
  try {
    const _seit = timerTs || 0;
    const _offen = new Map();
    (S.coachLog || []).forEach(e => {
      if (!e.accepted || e.outcomeW != null || !e.exId || (e.ts || 0) < _seit) return;
      _offen.set(e.exId + '|' + e.kind, e);
    });
    _offen.forEach(e => {
      const _l = valid.find(l => l.exerciseId === e.exId);
      const _top = _l ? _coachTopSet(_l.sets) : null;
      if (_top) S.coachLog = window.CoachLog.logOutcome(S.coachLog, e.exId, e.kind, parseFloat(_top.w) || 0);
    });
  } catch(e) { console.warn('[Coach] Outcome:', e); }
  persist();
  // Abschluss des Erzaehlbogens. Er laeuft weiter VOR closeOv('ov-wk') — die
  // Zeile geht aber nicht mehr nur in #wk-coach-bar (das Overlay schliesst
  // 24 Zeilen weiter unten im selben Tick, die Haltezeit war dort tot),
  // sondern zusaetzlich in _csFinalLine und von dort in das Check-in-Sheet,
  // das ohnehin direkt danach aufgeht. sessionEnd() nutzt force: die Bilanz
  // faellt nie am Budget aus (nur Stufe "off" schweigt). Danach wird
  // S.coachSession genullt und persistiert (_csEnd).
  // Bestwerte fuer den Erzaehlbogen UND fuer 'prCongrats' — EIN Scan reicht.
  // detectPRs() ist frei von Nebenwirkungen und liest nur S.sessions; der Wert
  // wird gleich unten weiterbenutzt, statt denselben Scan ueber
  // S.sessions x logs x sets beim Trainingsende ein zweites Mal zu fahren.
  // Die Kette in _finishWkContinue() bleibt unberuehrt.
  let _csPrs = null;
  try {
    let _csSets = 0, _csVol = 0;
    valid.forEach(l => {
      try { _csSets += _workSets(l.sets || []).length; _csVol += setsVolume(l.sets || []); } catch(_) {}
    });
    try { _csPrs = detectPRs(_newSess) || []; } catch(_) { _csPrs = []; }
    _csEnd({ sets: _csSets, vol: Math.round(_csVol * 10) / 10, prs: _csPrs });
  } catch(e) { console.warn('[Coach] Abschluss:', e); }
  // Block 4 (Task 19): neue Trainings-Erinnerung, PR-Gratulation und
  // Deload-Pruefung. Laeuft NACH persist(), damit die frische Einheit schon in
  // S.sessions steht — sonst plante der Rueckkehr-Anstoss gegen den alten
  // Stand. Nur der Gewichts-PR traegt eine echte Kilozahl; ein geschaetztes
  // 1RM waere in "Neuer Bestwert bei {ex}: {kg}" eine Zahl, die so nie auf der
  // Stange lag. Bewusst nicht awaited: finishWk() wartet auf nichts.
  try {
    let _cnPr = null;
    try {
      // Das Ergebnis von oben. Nur wenn der Block darueber gestorben ist, wird
      // neu gescannt — dann ist der zweite Lauf kein Doppel, sondern der erste.
      const _liste = _csPrs || detectPRs(_newSess) || [];
      const _p = _liste.filter(x => x && x.type === 'weight' && x.newVal > 0)[0];
      if (_p) _cnPr = { ex: _p.exName, kg: _p.newVal };
    } catch(_) {}
    _cnSync({ pr: _cnPr });
  } catch(e) { console.warn('[Coach] Meldungen nach der Einheit:', e); }
  // Gamification: Punkte-Ticker NICHT hier feuern — er läuft sonst unsichtbar
  // hinter dem Share-/Snap-Flow. Nur vormerken; ausgelöst wird er, sobald der
  // Share-Flow geschlossen ist (_shfExit).
  _xpGainPending = true;
  // Trainingstag-Name für die Share-Card sichern, BEVOR die Plan-Quelle genullt wird
  let _shareDayName = null;
  try {
    const src = _activePlanSrc;
    if (src?.type === 'preset' && src.id) { const p = presetById(src.id); _shareDayName = p ? tr(p.name) : null; }
    else if (src?.type === 'week' && src.dayKey) _shareDayName = _planLabelFor(src.dayKey) || null;
  } catch(_) {}
  // Optional geänderte Übungsliste in den Quell-Plan übernehmen (fragt nur bei Abweichung)
  try { _maybeUpdatePlanFromSession(valid); } catch(_) {}
  _activePlanSrc = null;
  _endLiveActivity();
  _saveWorkoutToHealthKit(_newSess);
  haptic([20,40,20]);
  _clearActiveWk();
  timerTs = null;
  wkLogs = [];
  wkExIds = [];
  closeOv('ov-wk');
  updateWkMiniVisibility();
  // === Auto-Sync: Muskel-Erholung neu berechnen + Liste re-rendern ===
  invalidateFatigue();
  invalidateRecovery();
  try {
    const statsActive = document.getElementById('pg-stats')?.classList.contains('on');
    if (statsActive) renderRecoveryList();
  } catch(_) {}
  // Post-Workout-Check-in (Phase E, Premium+KI-exklusiv seit Phase H): der Rest
  // der Kette (PR-Erkennung, Share-Flow, renderHome, Meilensteine, Social-Push) läuft
  // NICHT mehr hier direkt weiter, sondern erst wenn das Check-in-Sheet zugeht —
  // s. _finishWkContinue()/_checkinOpen() weiter unten und der closeOv('ov-checkin')-Hook.
  // Free-User überspringen das Sheet komplett (_checkinOpen prüft isPremium()).
  _checkinOpen(_newSess, _shareDayName);
}

/* Tail-Ende von finishWk() (Phase E hierher ausgelagert, Inhalt unverändert): läuft
   erst NACH dem Post-Workout-Check-in-Sheet — s. _checkinOpen()/closeOv('ov-checkin').
   sess = die neue Session (früher „newSession"/„_newSess"), dayName = Trainingstag-
   Name für die Share-Card (früher „_shareDayName"). */
function _finishWkContinue(sess, dayName) {
  // PR-Erkennung + Feier vor dem Share-Flow, damit die Share-Card die PRs zeigen kann.
  const newSession = sess;
  const prs = detectPRs(newSession);
  if (prs.length) celebratePRs(prs);
  // Share-Flow abgesichert: wirft er (Canvas/Avatar), liefen sonst renderHome &
  // Punkte-Ticker nie → Level-Badge blieb stehen/verschwand und Punkte kamen nie an.
  try { startShareFlow(newSession, prs, dayName); }
  catch(e) {
    console.warn('[GymTrack] Share-Flow-Fehler:', e);
    if (_xpGainPending) { _xpGainPending = false; setTimeout(() => { try { _xpGainOnFinish(); } catch(_){} }, 600); }
  }
  renderHome();
  _pushSocialSoon();         // Stats-Push + Live-Status aus; Activity loggt der Share-Flow beim Beenden
}

/* ── POST-WORKOUT CHECK-IN (Phase E, Premium+KI-exklusiv seit Phase H) ──
   ov-checkin fragt „Wie hat sich dein Training angefühlt?" (feel 1-4) +
   Energielevel (en 1-3), bevor die finishWk-Kette (_finishWkContinue) weiterläuft.
   _checkinContinued ist der Wächter: egal ob der Nutzer speichert, überspringt
   oder das Sheet wegwischt/wegtippt — closeOv('ov-checkin') ruft am Ende IMMER
   _finishWkContinue() auf, aber garantiert nur genau EINMAL pro Training.
   Free-User bekommen das Sheet gar nicht erst zu sehen (kein Paywall-Popup,
   einfach direkter Sprung in die finishWk-Kette wie beim Überspringen) — das
   hält S.checkins zugleich implizit premium-only, worauf _ciBlocksProgression
   und die KI-Analyse (_aiaData) sich verlassen. */
let _checkinSess = null, _checkinDayName = null, _checkinContinued = false;
let _ciFeel = null, _ciEnergy = 2;   // Energie startet neutral vorbelegt (Mittel)

const CI_FEELS = [
  { v:1, ico:'effort1', label:'Sehr leicht' },
  { v:2, ico:'effort2', label:'Gut' },
  { v:3, ico:'effort3', label:'Anstrengend' },
  { v:4, ico:'effort4', label:'Sehr schwer' },
];
const CI_ENERGIES = [ { v:1, label:'Niedrig' }, { v:2, label:'Mittel' }, { v:3, label:'Hoch' } ];

function _checkinOpen(sess, dayName) {
  if (!isPremium()) { _finishWkContinue(sess, dayName); return; }
  _checkinSess = sess;
  _checkinDayName = dayName;
  _checkinContinued = false;
  _ciFeel = null;
  _ciEnergy = 2;
  _renderCheckin();
  openOv('ov-checkin');
}
function _ciSetFeel(v) { _ciFeel = v; haptic(8); _renderCheckin(); }
function _ciSetEnergy(v) { _ciEnergy = v; haptic(8); _renderCheckin(); }
/* Die Bilanz des Erzaehlbogens auf dem Bildschirm, der nach dem Speichern
   ohnehin steht. Sie ist KEINE zweite Coach-Flaeche: das Training ist zu
   Ende, #wk-coach-bar existiert nicht mehr, und hier steht eine einzelne
   Textzeile ohne Bedienelemente — kein Overlay im Overlay, nichts Modales.
   Der Text kommt fertig formuliert aus _csEmit() (Persona, Sprache, Einheit)
   und wird als Text gesetzt: er traegt Uebungsnamen, also Nutzertext. */
function _ciCoachLineHTML() {
  const t = (_csFinalLine || '').trim();
  if (!t) return '';
  return `<div class="ci-coach">${esc(t)}</div>`;
}
function _renderCheckin() {
  const el = document.getElementById('checkin-body');
  if (!el) return;
  el.innerHTML = _ciCoachLineHTML() + `
    <div class="ob-q" style="font-size:18px">Wie hat sich dein Training angefühlt?</div>
    <div class="ob-opts" style="margin-top:14px">${CI_FEELS.map(f => `
      <button class="ob-opt${_ciFeel===f.v?' on':''}" onclick="_ciSetFeel(${f.v})">
        <div class="ob-opt-ico">${ICO[f.ico]({s:20})}</div>
        <div><div class="ob-opt-title">${f.label}</div></div>
      </button>`).join('')}
    </div>
    <div class="s-title" style="margin:20px 0 8px">Energielevel</div>
    <div class="fmode-wrap" style="margin:0">${CI_ENERGIES.map(en => `
      <button class="fmode-btn${_ciEnergy===en.v?' on':''}" onclick="_ciSetEnergy(${en.v})">${en.label}</button>`).join('')}
    </div>
    <button class="btn btn-acc" style="margin-top:22px" onclick="_ciConfirm()">Fertig</button>
    <button class="ob-skip" style="display:block;margin:10px auto 0;text-align:center" onclick="_ciSkip()">Überspringen</button>
  `;
}
function _ciConfirm() {
  if (_ciFeel) {
    S.checkins = S.checkins || [];
    S.checkins.push({ sid: _checkinSess?.id, d: _checkinSess?.date, feel: _ciFeel, en: _ciEnergy || 2 });
    while (S.checkins.length > 400) S.checkins.shift();
    persist();
  }
  closeOv('ov-checkin');
}
function _ciSkip() { closeOv('ov-checkin'); }

function cancelWk() {
  if (!confirm('Training abbrechen? Eingetragene Daten werden verworfen.')) return;
  // Erzaehlbogen mit verwerfen: sonst bliebe der Zustand mit altem wkTs stehen
  // (isStale faengt ihn zwar, aber der Abbruch ist der ehrlichere Ort).
  try { _csDiscard(); } catch(_) {}
  _activePlanSrc = null;
  try { Object.keys(_coachEvalTimers).forEach(k => clearTimeout(_coachEvalTimers[k])); _coachEvalTimers = {}; _coachClearCard(); } catch(_) {}
  _endLiveActivity();
  clearInterval(timerInt); timerInt = null;
  clearInterval(setTimerInt); setTimerInt = null;
  skipRest();
  if (document.getElementById('wk-note')) document.getElementById('wk-note').value = '';
  _clearActiveWk();
  timerTs = null;
  wkLogs = [];
  wkExIds = [];
  closeOv('ov-wk');
  updateWkMiniVisibility();
  renderHome();
  _pushSocialSoon();   // Community: Live-Status wieder aus
}

function fireConfetti(count = 90) {
  try {
    let host = document.getElementById('confetti-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'confetti-host';
      host.className = 'confetti-host';
      document.body.appendChild(host);
    }
    const colors = ['#FF3B30','#FF9500','#FFCC00','#34C759','#5AC8FA','#007AFF','#AF52DE','#FF2D55'];
    const W = window.innerWidth;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-piece';
      const startX = Math.random() * W;
      const drift  = (Math.random() - 0.5) * 240;
      const rot    = (Math.random() * 1080 + 360) * (Math.random() < .5 ? -1 : 1);
      const dur    = 2.4 + Math.random() * 1.6;
      const delay  = Math.random() * 0.3;
      p.style.left = startX + 'px';
      p.style.background = colors[i % colors.length];
      p.style.setProperty('--cx', drift + 'px');
      p.style.setProperty('--cr', rot + 'deg');
      p.style.animationDuration = dur + 's';
      p.style.animationDelay = delay + 's';
      frag.appendChild(p);
    }
    host.appendChild(frag);
    setTimeout(() => { host.innerHTML = ''; }, 4500);
  } catch (e) { /* silent */ }
}

/* ── PR-ERKENNUNG ──
   Vergleicht jeden Set der neuen Session mit allen vorherigen Sessions:
   - max-weight       : neues schwerstes je gemachtes Gewicht
   - max-reps-at-w    : meiste Reps bei einem Gewicht das mindestens so schwer war
   - max-1rm          : neues bestes geschätztes 1RM (Epley)                       */
function detectPRs(newSession) {
  if (!newSession || !newSession.logs) return [];
  const prs = [];
  const prevSessions = (S.sessions || []).filter(s => s.id !== newSession.id);

  for (const log of newSession.logs) {
    const ex = exById(log.exerciseId);
    if (!ex) continue;
    if (ex.targetType === 'time') continue; // Zeit-Übungen: keine PR-Logik

    // Beste vorherige Werte sammeln
    let prevMaxW = 0, prevMax1RM = 0;
    const prevRepsAt = {}; // w(rounded) → maxReps
    for (const ps of prevSessions) {
      for (const pl of (ps.logs || [])) {
        if (pl.exerciseId !== ex.id) continue;
        for (const s of (pl.sets || [])) {
          const w = parseFloat(s.w) || 0;
          const r = parseInt(s.r)   || 0;
          if (!w || !r) continue;
          if (w > prevMaxW) prevMaxW = w;
          const oneRm = w * (1 + r/30);
          if (oneRm > prevMax1RM) prevMax1RM = oneRm;
          const key = Math.round(w * 4) / 4; // 0.25er Bucket
          if (!prevRepsAt[key] || r > prevRepsAt[key]) prevRepsAt[key] = r;
        }
      }
    }

    // Neue Sets prüfen
    let bestNewW = 0, bestNewSet = null, bestNew1RM = 0, bestNew1RMSet = null;
    let repsPR = null;
    for (const s of (log.sets || [])) {
      const w = parseFloat(s.w) || 0;
      const r = parseInt(s.r)   || 0;
      if (!w || !r) continue;
      if (w > bestNewW) { bestNewW = w; bestNewSet = s; }
      const oneRm = w * (1 + r/30);
      if (oneRm > bestNew1RM) { bestNew1RM = oneRm; bestNew1RMSet = s; }
      // Reps-PR: bei gleichem oder schwererem Gewicht mehr Reps als je zuvor
      const key = Math.round(w * 4) / 4;
      const prevR = prevRepsAt[key] || 0;
      if (prevR > 0 && r > prevR && (!repsPR || r > repsPR.r)) {
        repsPR = { w, r, prevR };
      }
    }

    // PR-Typen sammeln (max-weight hat Vorrang, dann 1RM, dann reps)
    if (prevMaxW > 0 && bestNewW > prevMaxW) {
      prs.push({
        type: 'weight', exId: ex.id, exName: ex.name,
        newVal: bestNewW, prevVal: prevMaxW,
        label: 'Neues Max-Gewicht', unit: unitLabel()
      });
    } else if (prevMax1RM > 0 && bestNew1RM > prevMax1RM + 0.5) {
      prs.push({
        type: '1rm', exId: ex.id, exName: ex.name,
        newVal: Math.round(bestNew1RM * 10) / 10,
        prevVal: Math.round(prevMax1RM * 10) / 10,
        label: 'Neues 1RM (geschätzt)', unit: unitLabel()
      });
    } else if (repsPR) {
      prs.push({
        type: 'reps', exId: ex.id, exName: ex.name,
        newVal: repsPR.r, prevVal: repsPR.prevR,
        label: 'Neue Reps-Bestleistung bei ' + kgToDisp(repsPR.w) + ' ' + unitLabel(),
        unit: 'Wdh'
      });
    }
  }
  return prs;
}

/* Zelebrieren: dicker Burst-Toast pro PR, gestaffelt + Haptik + Extra-Konfetti */
function celebratePRs(prs) {
  if (!prs || !prs.length) return;
  let host = document.getElementById('pr-burst-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'pr-burst-host';
    host.className = 'pr-burst-host';
    document.body.appendChild(host);
  }
  try { haptic([30, 60, 30, 60, 30]); } catch(_) {}
  prs.forEach((pr, i) => {
    setTimeout(() => {
      const el = document.createElement('div');
      el.className = 'pr-burst';
      el.innerHTML = '<div>NEUER PR</div>'
        + '<div class="pr-burst-sub">' + pr.exName + '</div>'
        + '<div class="pr-burst-sub">' + pr.label + ': <b>' + pr.newVal + ' ' + pr.unit + '</b></div>'
        + (pr.prevVal ? '<div class="pr-burst-sub" style="opacity:.65;font-size:11px">vorher ' + pr.prevVal + ' ' + pr.unit + '</div>' : '');
      host.appendChild(el);
      try { fireConfetti(45); } catch(_) {}
      setTimeout(() => el.remove(), 1700);
    }, i * 1200);
  });
}

/* ── WORKOUT-SHARE-FLOW ─────────────────────────────────
   Ersetzt den alten Done-Screen komplett: Layout-Rattle →
   In-App-Kamera (nativ CameraPlugin/AVFoundation, Web-Fallback
   getUserMedia) → Layout-Swipe auf dem Foto → Teilen. */

/* ── SVG-ICON-SET ────────────────────────────────────────────────────
   HARD-REGEL: keine Emojis in der UI — alles als Vektor-Symbol.
   stroke=currentColor → erbt die Textfarbe. o.s = Größe px. ── */
function _svg(inner, o){ const s=(o&&o.s)||22; return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="${(o&&o.sw)||2}" stroke-linecap="round" stroke-linejoin="round" style="display:block;${(o&&o.st)||''}">${inner}</svg>`; }
const ICO = {
  camera:o=>_svg('<path d="M6.4 7l1.1-1.8A1 1 0 0 1 8.4 4.7h7.2a1 1 0 0 1 .9.5L17.6 7H20a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 4 7z"/><circle cx="12" cy="12.4" r="3.3"/>',o),
  users:o=>_svg('<circle cx="9" cy="8" r="3.1"/><path d="M2.6 19c0-3.4 2.9-5.3 6.4-5.3s6.4 1.9 6.4 5.3"/><path d="M16.8 5.2a3 3 0 0 1 0 5.7M18.4 19c0-2.5-1-4.2-2.6-5.1"/>',o),
  globe:o=>_svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.4 2.6 15.6 0 18M12 3c-2.6 2.4-2.6 15.6 0 18"/>',o),
  share:o=>_svg('<path d="M12 15V4M8.5 7.5 12 4l3.5 3.5"/><path d="M5 12.5V18a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 18v-5.5"/>',o),
  flame:o=>_svg('<path d="M12 3c.4 3-1.8 4.2-3.2 6C7 11.5 7 14 8.4 15.9 9.5 17.4 10.9 18 12 18s2.5-.6 3.6-2.1C17 14 17 11.3 15.4 9.3c-.7-.9-1.5-1.6-1.9-2.8-.6 1-1.3 1.6-2 2C11 5.8 11.5 4.2 12 3z"/>',o),
  pin:o=>_svg('<path d="M12 21c4-4 6.4-7 6.4-10.4A6.4 6.4 0 0 0 5.6 10.6C5.6 14 8 17 12 21z"/><circle cx="12" cy="10.4" r="2.2"/>',o),
  image:o=>_svg('<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="8.4" cy="10" r="1.5"/><path d="M4.2 17l4.3-3.8 3 2.5L15 11l4.8 4.8"/>',o),
  flip:o=>_svg('<path d="M4 9a8 8 0 0 1 13-2.5L20 9M20 5v4h-4"/><path d="M20 15a8 8 0 0 1-13 2.5L4 15M4 19v-4h4"/>',o),
  bolt:o=>_svg('<path d="M13 3 5 13h6l-1 8 8-11h-6z"/>',o),
  // Pfade 1:1 aus dem bestehenden .aic-mic-Knopf des Chats — ein zweites
  // Mikrofon-Zeichen waere derselbe Knopf in zwei Handschriften.
  mic:o=>_svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',o),
  check:o=>_svg('<path d="M20 6 9 17l-5-5"/>',o),
  wifiOff:o=>_svg('<path d="M2 8.8C5 6.4 8.4 5.2 12 5.2c1.3 0 2.6.2 3.8.5M18.4 8a13 13 0 0 1 3.6 2.8M8.5 12.2A8 8 0 0 1 12 11c1.3 0 2.4.3 3.4.9M12 20l.01 0M9.4 15.6A4 4 0 0 1 12 14.8M2 2l20 20"/>',o),
};
// Premium/KI-Coach-Icons (Vektor, kein Emoji — UI-Regel)
Object.assign(ICO, {
  sparkle:o=>_svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.9 2.6L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z"/>',o),
  robot:o=>_svg('<rect x="4.5" y="8" width="15" height="11" rx="3"/><path d="M12 8V4.8M12 4.8a1.4 1.4 0 1 0-.01 0z"/><circle cx="9.2" cy="13" r="1.1"/><circle cx="14.8" cy="13" r="1.1"/><path d="M9.5 16.2h5"/>',o),
  chart2:o=>_svg('<path d="M3.5 20h17M6.5 16.5v-6M11 16.5V4.5M15.5 16.5v-8M20 16.5v-4"/>',o),
  crown:o=>_svg('<path d="M4 8.5 7.5 12l4.5-6 4.5 6L20 8.5V17a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17z"/>',o),
});
// Phase C: KI-Coach-Bubble/Radialmenü-Icons (Vektor, kein Emoji — UI-Regel)
Object.assign(ICO, {
  chatBubble:o=>_svg('<rect x="3.5" y="5" width="17" height="12" rx="4"/><path d="M8 17v3l4-3"/><path d="M8 10h8M8 13h5"/>',o),
  planAdd:o=>_svg('<rect x="3.5" y="5.5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v6M9 16h6"/>',o),
  trendUp:o=>_svg('<path d="M3.5 17l6-6 4 4 7-8"/><path d="M15.5 6.5H20.5V11.5"/>',o),
  gear:o=>_svg('<circle cx="12" cy="12" r="3"/><path d="M12 4v2.4M12 17.6V20M20 12h-2.4M6.4 12H4M17.66 6.34l-1.7 1.7M8.04 15.96l-1.7 1.7M17.66 17.66l-1.7-1.7M8.04 8.04L6.34 6.34"/>',o),
  // Winkel. Zeigt von Haus aus nach unten; der Zurück-Pfeil im Coach-Hub dreht
  // ihn per CSS um 90° nach links (.ch-back) — ein Zeichen, mehrere Richtungen,
  // keine zweite Form.
  chevron:o=>_svg('<path d="M6 9.5 12 15.5 18 9.5"/>',o),
  // Zeigt an, dass hinter einer Fläche mehr liegt — der Einstieg in den
  // Coach-Hub auf der Heute-Karte. Dieselbe Form wie chevron, nur gedreht.
  chevronRight:o=>_svg('<path d="M9.5 6 15.5 12 9.5 18"/>',o),
  // Das Zeichen der App: die Hantel aus dem Startknopf, hier in der ICO-Form
  // (currentColor statt festem Weiss), damit sie in jedem Theme mitgeht.
  dumbbell:o=>_svg('<path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11"/>',o),
  // Symbol der Journal-Kachel. Ein aufgeschlagenes Heft: das Journal ist das,
  // was der Coach über den Nutzer notiert hat.
  book:o=>_svg('<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 1 4 15.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h4.5a1.5 1.5 0 0 0 1.5-1.5z"/>',o),
});
// Phase E: Check-in-Anstrengungs-Gauge (4 Balken, 1..4 davon gefüllt = Intensität)
Object.assign(ICO, {
  effort1:o=>_svg('<rect x="2" y="15" width="3.5" height="6" rx="1.2" fill="currentColor" stroke="none"/><rect x="7.5" y="12" width="3.5" height="9" rx="1.2"/><rect x="13" y="9" width="3.5" height="12" rx="1.2"/><rect x="18.5" y="6" width="3.5" height="15" rx="1.2"/>',o),
  effort2:o=>_svg('<rect x="2" y="15" width="3.5" height="6" rx="1.2" fill="currentColor" stroke="none"/><rect x="7.5" y="12" width="3.5" height="9" rx="1.2" fill="currentColor" stroke="none"/><rect x="13" y="9" width="3.5" height="12" rx="1.2"/><rect x="18.5" y="6" width="3.5" height="15" rx="1.2"/>',o),
  effort3:o=>_svg('<rect x="2" y="15" width="3.5" height="6" rx="1.2" fill="currentColor" stroke="none"/><rect x="7.5" y="12" width="3.5" height="9" rx="1.2" fill="currentColor" stroke="none"/><rect x="13" y="9" width="3.5" height="12" rx="1.2" fill="currentColor" stroke="none"/><rect x="18.5" y="6" width="3.5" height="15" rx="1.2"/>',o),
  effort4:o=>_svg('<rect x="2" y="15" width="3.5" height="6" rx="1.2" fill="currentColor" stroke="none"/><rect x="7.5" y="12" width="3.5" height="9" rx="1.2" fill="currentColor" stroke="none"/><rect x="13" y="9" width="3.5" height="12" rx="1.2" fill="currentColor" stroke="none"/><rect x="18.5" y="6" width="3.5" height="15" rx="1.2" fill="currentColor" stroke="none"/>',o),
});
/* Flammen-Icon gefüllt (Reaction-Button/Verlauf) — eigenes Verlaufs-SVG. */
function _flameFillSVG(s){ s=s||20; return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" style="display:block"><defs><linearGradient id="flg${s}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd24a"/><stop offset="1" stop-color="#ff5a1f"/></linearGradient></defs><path d="M12 2.5c.5 3.2-2 4.5-3.5 6.4C6.8 11.4 6.8 14.2 8.4 16.2 9.6 17.7 11 18.5 12 18.5s2.4-.8 3.6-2.3c1.6-2 1.6-5 0-7.1-.8-1-1.7-1.8-2-3.1-.7 1.1-1.4 1.8-2.2 2.2C11 5.9 11.5 4 12 2.5z" fill="url(#flg${s})"/></svg>`; }
/* Gründer-Kennzeichnung: Neon-Krone neben dem Namen im Community-Feed.
   FOUNDER_UID = Admin-/Gründer-Account (identisch mit der Admin-UID in den Firestore-Rules). */
const FOUNDER_UID = 'GMm3AlNn1pVRL6cc76opBgnM9sr1';
// Zusaetzliche Tester-UIDs (siehe ai-worker/worker.js, gleiche Liste) - kommen wie
// Founder ueberall ohne Abo durch, inkl. echter KI-Antworten (Worker prueft dieselbe UID).
const TEST_UIDS = new Set([FOUNDER_UID, 'wbOGsL3zsyb1ylzEXPhgpqWdeOg1']);
function _founderBadge(){ return `<span class="founder-tag" title="Founder" aria-label="Founder">Founder</span>`; }
function _founderTag(uid, s){ return uid === FOUNDER_UID ? _founderBadge(s) : ''; }
// Moderator-Kennzeichnung: nur fürs Demo/Screenshot-Roster (kein echtes Rollen-System) —
// markiert Testprofile in _DEMO_ROSTER, damit Community/Freunde-Testdaten auch einen
// Moderator zeigen. _DEMO_MOD_UIDS wird unten direkt aus dem Roster abgeleitet.
function _modBadge(){ return `<span class="mod-tag" title="Moderator" aria-label="Moderator">Moderator</span>`; }
function _modTag(uid){ return (typeof _DEMO_MOD_UIDS !== 'undefined' && _DEMO_MOD_UIDS.has(uid)) ? _modBadge() : ''; }

/* Phase G: Community-Premium-Abzeichen — kleine Hantel in festem Metallic-Silber-
   Verlauf (KEIN var(--acc)), damit sie in allen 5 Themes gleich „wertig" aussieht. */
function _premBadgeSVG(s){
  s = s || 15;
  return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" style="display:block"><defs><linearGradient id="premg${s}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6d268"/><stop offset=".5" stop-color="#fff6d8"/><stop offset="1" stop-color="#d9a534"/></linearGradient></defs><g fill="none" stroke="url(#premg${s})" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9v6M17 9v6M4.5 10.2v3.6M19.5 10.2v3.6M7 12h10"/></g></svg>`;
}
ICO.premBadge = o => _premBadgeSVG(o && o.s);
/* „Premium"-Abzeichen neben Namen — analog _lvlTagForUid/_founderTag: eigener Status
   direkt aus isPremium(), fremder aus _socCache (dort spiegelt _pushSocialProfile das
   premium-Feld, s. Phase B). */
function _premTagForUid(uid, s){
  if (!uid) return '';
  const has = uid === _fbUser?.uid
    ? isPremium()
    : !!(((_socCache || []).find ? (_socCache || []).find(x => x.uid === uid) : null)?.premium);
  return has ? `<span class="prem-tag" title="Premium" aria-label="Premium">${_premBadgeSVG(s)}</span>` : '';
}

/* ── Canvas-Icons für die Share-Card (statt Emoji auf dem Bild) ── */
function _cvPin(ctx, cx, cy, r, col){
  ctx.save(); ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx - r*0.62, cy + r*0.4); ctx.lineTo(cx + r*0.62, cy + r*0.4); ctx.lineTo(cx, cy + r*1.75); ctx.closePath(); ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.arc(cx, cy, r*0.42, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}
function _cvDumbbell(ctx, cx, cy, s, col){
  ctx.save(); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = s*0.14; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - s*0.44, cy); ctx.lineTo(cx + s*0.44, cy); ctx.stroke();
  [-1,1].forEach(d=>{ const x=cx+d*s*0.5;
    ctx.fillRect(x - s*0.07, cy - s*0.34, s*0.14, s*0.68);
    ctx.fillRect(x + d*s*0.12 - s*0.055, cy - s*0.46, s*0.11, s*0.92); });
  ctx.restore();
}

/* ── FARBPALETTEN für die Share-Card (Index 0 = App-Akzent/Theme) ── */
const SHF_PALETTES = [
  { id:'app',     name:'App',     accent:null,      bg:'#0b1020' },
  { id:'violet',  name:'Violett', accent:'#8B5CF6', bg:'#160f2e' },
  { id:'sunset',  name:'Sunset',  accent:'#FF6B35', bg:'#2a0f14' },
  { id:'emerald', name:'Grün',    accent:'#10B981', bg:'#04231b' },
  { id:'rose',    name:'Pink',    accent:'#FF2D78', bg:'#2a0a1e' },
  { id:'ocean',   name:'Ocean',   accent:'#06B6D4', bg:'#062033' },
  { id:'gold',    name:'Gold',    accent:'#F5B301', bg:'#241a04' },
  { id:'mono',    name:'Mono',    accent:'#E5E7EB', bg:'#0a0a0c' },
];
let _shfPalIdx = 0;
let _shfCustomCol = null;   // frei per Farbrad gewählte Farbe (_shfPalIdx === -1 = Custom-Modus)
let _shfUserPal = false;    // Nutzer hat selbst gewählt → Auto-Vorauswahl fasst nichts mehr an
/* Auto-Vorauswahl der Layout-Farbe: Foto klein rastern, Durchschnittsfarbe/-helligkeit
   bestimmen und die Palette mit dem besten Kontrast (WCAG-Ratio + Farbabstand,
   damit z.B. Grün nicht auf Rasen-Grün landet) als STANDARD setzen. Der Nutzer
   behält die volle Kontrolle über die Swatch-Reihe — das hier ist nur der Default. */
function _shfAutoPal(img){
  try {
    const c = document.createElement('canvas'); c.width = 24; c.height = 32;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, 24, 32);
    const d = x.getImageData(0, 0, 24, 32).data;
    let r = 0, g = 0, b = 0; const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i+1]; b += d[i+2]; }
    r /= n; g /= n; b /= n;
    const lum = (rgb) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
      return .2126 * f(rgb[0]) + .7152 * f(rgb[1]) + .0722 * f(rgb[2]); };
    const hex2rgb = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
    const Lb = lum([r, g, b]);
    let best = 0, bestScore = -1; const scores = [];
    SHF_PALETTES.forEach((p, i) => {
      const acc = p.accent || _shfAppAcc();
      if (!/^#[0-9a-f]{6}$/i.test(acc)) { scores[i] = 0; return; }
      const rgb = hex2rgb(acc);
      const ratio = (Math.max(lum(rgb), Lb) + .05) / (Math.min(lum(rgb), Lb) + .05);
      const dist = Math.abs(rgb[0] - r) + Math.abs(rgb[1] - g) + Math.abs(rgb[2] - b);
      scores[i] = ratio * 100 + dist * .15;
      if (scores[i] > bestScore) { bestScore = scores[i]; best = i; }
    });
    // App-Farbe (Index 0) bevorzugen, wenn sie fast genauso gut lesbar ist — Branding
    if (scores[0] >= bestScore * .85) return 0;
    return best;
  } catch(_) { return 0; }
}
function _shfAppAcc(){
  try { return getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#007AFF'; }
  catch(_) { return '#007AFF'; }
}
// Freifarbe → dunkler Karten-Hintergrund im selben Farbton
function _shfDarken(hex, keep){
  const h = (hex||'').replace('#','');
  if (h.length < 6) return '#0b1020';
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  const to = v => Math.max(0, Math.min(255, Math.round(v*keep))).toString(16).padStart(2,'0');
  return '#' + to(r) + to(g) + to(b);
}
function _shfPalBg(){
  if (_shfPalIdx === -1 && _shfCustomCol) return _shfDarken(_shfCustomCol, 0.18);
  return SHF_PALETTES[_shfPalIdx]?.bg || '#0b1020';
}

let _shfData = null, _shfSes = null, _shfPrs = [];
let _shfPhoto = null;              // Image-Objekt oder null (→ Gradient-Card)
let _shfLayout = 0;
let _shfRattleT = [];
let _shfStream = null, _shfFacing = 'user', _shfFlashOn = false;
let _shfRendered = [];             // dataURL je Layout (Editor/Teilen-Cache)
let _shfPosted = false;            // wurde als Post hochgeladen? (steuert Activity-Fallback)

function _shfAccent() {
  if (_shfPalIdx === -1 && _shfCustomCol) return _shfCustomCol;
  const pal = SHF_PALETTES[_shfPalIdx];
  if (pal && pal.accent) return pal.accent;
  return _shfAppAcc();
}
function _shfRelTime(d) {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return tr('gerade eben');
  if (mins < 60) return tr('vor') + ' ' + mins + ' min';
  return d.toLocaleTimeString(GT_LOCALE, {hour:'2-digit', minute:'2-digit'}) + (GT_LANG === 'en' ? '' : ' Uhr');
}
function _shfDurStr(sec) {
  const m = Math.round((sec||0)/60), h = Math.floor(m/60);
  return h ? h + 'h ' + (m%60 ? (m%60) + 'min' : '') : m + ' min';
}

// Trainingsdaten → Share-Daten (WorkoutShareData-Äquivalent aus dem Auftrag)
function _shfBuildData(ses, prs, dayName) {
  const mgs = [...new Set((ses.logs||[]).map(l => exById(l.exerciseId)?.muscleGroup).filter(Boolean))]
    .map(m => { try { return muscleLabel(m); } catch(_) { return m; } });
  return {
    dayName: (dayName || mgs.slice(0,2).join(' + ') || tr('Training')).slice(0, 40),
    duration: ses.duration || 0,
    mgs: mgs.slice(0,4),
    gym: (S.privacy?.gym && S.gymName) ? S.gymName : null,
    date: new Date(ses.date),
    username: (S.userName || _fbUser?.displayName || 'Athlet').slice(0,30),
    photo: _profilePhoto() || _fbUser?.photoURL || null,
    prCount: (prs||[]).length
  };
}

/* ── Layout-System: Registry, damit neue Designs später nur ein
   Objekt brauchen ({id, name, render}). Rendert auf Canvas —
   dasselbe Rendering für Live-Preview und finales Bild. ── */
const SHF_W = 1080, SHF_H = 1440;

function _shfDrawBase(ctx, img, W, H) {
  if (img) {
    const s = Math.max(W / img.width, H / img.height);
    const w = img.width * s, h = img.height * s;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  } else {
    const acc = _shfAccent();
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, acc); g.addColorStop(1, _shfPalBg());
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // Branded Muster (kein Emoji): konzentrische Ringe + große Vektor-Hantel, dezent.
    ctx.save();
    ctx.globalAlpha = 0.10; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    for (let r = W * 0.18; r < W * 0.95; r += W * 0.13) {
      ctx.beginPath(); ctx.arc(W / 2, H * 0.6, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 0.14;
    _cvDumbbell(ctx, W / 2, H * 0.6, W * 0.42, '#fff');
    ctx.restore();
  }
}
function _shfAvatarRow(ctx, d, x, y) {
  const r = 34;
  ctx.save();
  ctx.beginPath(); ctx.arc(x + r, y + r, r, 0, Math.PI * 2); ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fill();
  ctx.clip();
  if (d._avaImg) ctx.drawImage(d._avaImg, x, y, r * 2, r * 2);
  else {
    ctx.fillStyle = '#fff'; ctx.font = 'bold 26px -apple-system,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(_socInitials(d.username), x + r, y + r + 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
  ctx.fillStyle = '#fff'; ctx.font = '800 30px -apple-system,sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 10;
  ctx.fillText(d.username, x + r * 2 + 18, y + 28);
  ctx.font = '500 22px -apple-system,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.fillText(_shfRelTime(d.date), x + r * 2 + 18, y + 60);
  ctx.shadowBlur = 0;
}
function _shfVDate(ctx, d, W, H) {
  ctx.save();
  ctx.translate(W - 34, H / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = 'rgba(255,255,255,.6)';
  ctx.font = '700 22px -apple-system,sans-serif';
  ctx.textAlign = 'center';
  const ds = d.date.toLocaleDateString(GT_LOCALE, {day:'2-digit', month:'short'}).toUpperCase()
    + '  ·  ' + d.date.toLocaleTimeString(GT_LOCALE, {hour:'2-digit', minute:'2-digit'});
  ctx.fillText(ds.split('').join(' '), 0, 0);
  ctx.restore();
}
function _shfWatermark(ctx, W, H, opts) {
  ctx.save();
  ctx.translate(W / 2, H * (opts?.y ?? 0.44));
  ctx.rotate(-0.14);
  ctx.fillStyle = 'rgba(255,255,255,' + (opts?.a ?? 0.12) + ')';
  ctx.font = '900 ' + (opts?.s ?? 92) + 'px -apple-system,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MYGYMTRACK', 0, 0);
  ctx.restore();
}

const SHARE_LAYOUTS = [
  {
    id: 'classic', name: 'Classic',
    render(ctx, img, d, W, H) {
      _shfDrawBase(ctx, img, W, H);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,.45)'); g.addColorStop(0.28, 'rgba(0,0,0,0)');
      g.addColorStop(0.62, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.62)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      _shfWatermark(ctx, W, H);
      _shfVDate(ctx, d, W, H);
      // Muskelgruppen-Chips über dem CTA
      let cx = 48, cy = H - 260;
      ctx.font = '700 24px -apple-system,sans-serif';
      d.mgs.forEach(m => {
        const w = ctx.measureText(m).width + 44;
        ctx.fillStyle = 'rgba(255,255,255,.2)';
        ctx.beginPath(); ctx.roundRect(cx, cy, w, 52, 26); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText(m, cx + 22, cy + 35);
        cx += w + 14;
      });
      if (d.gym) {
        _cvPin(ctx, 58, cy - 40, 12, 'rgba(255,255,255,.85)');
        ctx.font = '600 26px -apple-system,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.fillText(d.gym, 82, cy - 26);
      }
      // Großer abgerundeter CTA unten mittig
      const acc = _shfAccent();
      const bw = W - 96, bh = 118, bx = 48, by = H - bh - 64;
      ctx.fillStyle = acc;
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 32); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.font = '900 42px -apple-system,sans-serif';
      ctx.fillText(d.dayName.toUpperCase(), W / 2, by + 52);
      ctx.font = '700 30px -apple-system,sans-serif'; ctx.globalAlpha = 0.9;
      ctx.fillText(_shfDurStr(d.duration) + (d.prCount ? '  ·  ' + d.prCount + ' PR' : ''), W / 2, by + 92);
      ctx.globalAlpha = 1; ctx.textAlign = 'left';
    }
  },
  {
    id: 'bold', name: 'Bold',
    render(ctx, img, d, W, H) {
      _shfDrawBase(ctx, img, W, H);
      const g = ctx.createLinearGradient(0, H * 0.45, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.88)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.font = '900 30px -apple-system,sans-serif';
      ctx.fillText('MYGYMTRACK', 48, 76);
      _shfVDate(ctx, d, W, H);
      const acc = _shfAccent();
      ctx.fillStyle = acc;
      ctx.font = '900 132px -apple-system,sans-serif';
      const dur = _shfDurStr(d.duration);
      ctx.fillText(dur, 44, H - 232);
      ctx.fillStyle = '#fff';
      ctx.font = '900 76px -apple-system,sans-serif';
      const dn = d.dayName.toUpperCase();
      ctx.fillText(dn.length > 16 ? dn.slice(0, 15) + '…' : dn, 48, H - 130);
      ctx.font = '600 30px -apple-system,sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.fillText(d.mgs.join('  ·  ') + (d.gym ? '  ·  ' + d.gym : ''), 48, H - 72);
    }
  },
  {
    id: 'clean', name: 'Clean',
    render(ctx, img, d, W, H) {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      const m = 44, ph = H - 330;
      ctx.save();
      ctx.beginPath(); ctx.roundRect(m, m, W - m * 2, ph, 28); ctx.clip();
      if (img) {
        const s = Math.max((W - m * 2) / img.width, ph / img.height);
        ctx.drawImage(img, m + (W - m * 2 - img.width * s) / 2, m + (ph - img.height * s) / 2, img.width * s, img.height * s);
      } else {
        _shfDrawBase(ctx, null, W, H);
      }
      ctx.restore();
      ctx.save();
      ctx.beginPath(); ctx.roundRect(m, m, W - m * 2, ph, 28); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.font = '900 26px -apple-system,sans-serif';
      ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 8;
      ctx.fillText('MYGYMTRACK', m + 28, m + 50);
      ctx.restore();
      // Polaroid-Fuß: Daten dunkel auf weiß
      ctx.fillStyle = '#0b0d12';
      ctx.font = '900 56px -apple-system,sans-serif';
      ctx.fillText(d.dayName, m, ph + m + 92);
      ctx.font = '600 30px -apple-system,sans-serif';
      ctx.fillStyle = '#6b7280';
      ctx.fillText(_shfDurStr(d.duration)
        + (d.prCount ? '  ·  ' + d.prCount + ' PR' : ''), m, ph + m + 146);
      ctx.fillStyle = '#9ca3af';
      ctx.font = '600 26px -apple-system,sans-serif';
      ctx.fillText(d.date.toLocaleDateString(GT_LOCALE, {weekday:'long', day:'numeric', month:'long'})
        + (d.gym ? '  ·  ' + d.gym : ''), m, ph + m + 192);
      const acc = _shfAccent();
      ctx.fillStyle = acc;
      ctx.beginPath(); ctx.roundRect(W - m - 150, ph + m + 60, 150, 58, 29); ctx.fill();
      _cvDumbbell(ctx, W - m - 100, ph + m + 89, 30, '#fff');
      ctx.fillStyle = '#fff'; ctx.font = '800 30px -apple-system,sans-serif';
      ctx.textAlign = 'center'; ctx.fillText(String(d.mgs.length), W - m - 56, ph + m + 99);
      ctx.textAlign = 'left';
    }
  },
  {
    id: 'minimal', name: 'Minimal',
    render(ctx, img, d, W, H) {
      _shfDrawBase(ctx, img, W, H);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,.5)'); g.addColorStop(0.5, 'rgba(0,0,0,.15)'); g.addColorStop(1, 'rgba(0,0,0,.82)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const acc = _shfAccent();
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = '800 26px -apple-system,sans-serif';
      ctx.fillText('MYGYMTRACK', W / 2, 96);
      ctx.fillStyle = acc; ctx.fillRect(W / 2 - 42, H * 0.4 - 6, 84, 5);
      ctx.fillStyle = '#fff'; ctx.font = '900 86px -apple-system,sans-serif';
      const dn = d.dayName.toUpperCase();
      ctx.fillText(dn.length > 14 ? dn.slice(0, 13) + '…' : dn, W / 2, H * 0.4 + 74);
      ctx.font = '700 34px -apple-system,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fillText(_shfDurStr(d.duration) + (d.prCount ? '  ·  ' + d.prCount + ' PR' : ''), W / 2, H * 0.4 + 134);
      ctx.font = '600 28px -apple-system,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.72)';
      if (d.gym) ctx.fillText(d.gym, W / 2, H - 92);
      ctx.textAlign = 'left';
    }
  },
  {
    id: 'frame', name: 'Rahmen',
    render(ctx, img, d, W, H) {
      ctx.fillStyle = _shfPalBg(); ctx.fillRect(0, 0, W, H);
      const acc = _shfAccent(), pad = 46, iw = W - pad * 2, ih = H - pad * 2 - 150;
      ctx.save(); ctx.beginPath(); ctx.roundRect(pad, pad, iw, ih, 30); ctx.clip();
      _shfDrawBase(ctx, img, W, H);
      const gg = ctx.createLinearGradient(0, ih * 0.4, 0, pad + ih);
      gg.addColorStop(0, 'rgba(0,0,0,0)'); gg.addColorStop(1, 'rgba(0,0,0,.6)');
      ctx.fillStyle = gg; ctx.fillRect(pad, pad, iw, ih);
      ctx.restore();
      // Canvas kennt keine CSS-Variablen — der Dimmer kommt ueber _neonF().
      ctx.save(); ctx.strokeStyle = acc; ctx.lineWidth = 8;
      ctx.shadowColor = _hexA(acc, _neonF()); ctx.shadowBlur = 34;
      ctx.beginPath(); ctx.roundRect(pad, pad, iw, ih, 30); ctx.stroke();
      ctx.restore();
      let cx = pad + 20, cy = pad + ih - 74;
      ctx.font = '700 24px -apple-system,sans-serif';
      d.mgs.forEach(m => { const w = ctx.measureText(m).width + 40;
        ctx.fillStyle = 'rgba(0,0,0,.42)'; ctx.beginPath(); ctx.roundRect(cx, cy, w, 50, 25); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText(m, cx + 20, cy + 33); cx += w + 12; });
      const fy = pad + ih + 52;
      ctx.fillStyle = '#fff'; ctx.font = '900 52px -apple-system,sans-serif';
      ctx.fillText(d.dayName, pad, fy);
      ctx.fillStyle = acc; ctx.font = '800 32px -apple-system,sans-serif';
      ctx.fillText(_shfDurStr(d.duration) + (d.prCount ? '  ·  ' + d.prCount + ' PR' : ''), pad, fy + 46);
      if (d.gym) { _cvPin(ctx, pad + 10, fy + 80, 11, 'rgba(255,255,255,.6)');
        ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '600 26px -apple-system,sans-serif';
        ctx.fillText(d.gym, pad + 32, fy + 90); }
    }
  },
  {
    id: 'stats', name: 'Stats',
    render(ctx, img, d, W, H) {
      const acc = _shfAccent();
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, acc); g.addColorStop(1, _shfPalBg());
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.globalAlpha = .08; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      for (let r = W * 0.2; r < W * 1.1; r += W * 0.14) { ctx.beginPath(); ctx.arc(W * 0.85, H * 0.14, r, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = '800 28px -apple-system,sans-serif';
      ctx.fillText('MYGYMTRACK', 56, 94);
      ctx.fillStyle = '#fff'; ctx.font = '900 100px -apple-system,sans-serif';
      const dn = d.dayName; ctx.fillText(dn.length > 15 ? dn.slice(0, 14) + '…' : dn, 52, H * 0.52);
      const stats = [[_shfDurStr(d.duration), tr('Dauer')], [String(d.mgs.length), tr('Muskeln')], [String(d.prCount || 0), 'PR']];
      const sy = H * 0.52 + 90; let sx = 56;
      stats.forEach(s => {
        ctx.fillStyle = '#fff'; ctx.font = '900 60px -apple-system,sans-serif'; ctx.fillText(s[0], sx, sy + 56);
        ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.font = '600 24px -apple-system,sans-serif'; ctx.fillText(s[1], sx, sy + 98);
        sx += 320;
      });
      if (d.gym) { _cvPin(ctx, 66, H - 92, 12, 'rgba(255,255,255,.85)');
        ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = '600 28px -apple-system,sans-serif';
        ctx.fillText(d.gym, 90, H - 82); }
      _shfWatermark(ctx, W, H, { y: 0.83, a: 0.1, s: 66 });
    }
  }
];

function _shfRender(li, w, h) {
  const c = document.createElement('canvas');
  c.width = w || SHF_W; c.height = h || SHF_H;
  const ctx = c.getContext('2d');
  const sc = (w || SHF_W) / SHF_W;
  ctx.scale(sc, sc);
  SHARE_LAYOUTS[li].render(ctx, _shfPhoto, _shfData, SHF_W, SHF_H);
  return c;
}
function _shfRenderAll() {
  _shfRendered = SHARE_LAYOUTS.map((_, i) => _shfRender(i, 540, 720).toDataURL('image/jpeg', 0.9));
}

/* ── Einstieg (aus finishWk) ── */
function startShareFlow(ses, prs, dayName) {
  _shfSes = ses; _shfPrs = prs || [];
  _shfData = _shfBuildData(ses, prs, dayName);
  _shfPhoto = null; _shfLayout = 0; _shfRendered = []; _shfPosted = false; _shfPalIdx = 0; _shfCustomCol = null; _shfUserPal = false;
  // Avatar fürs Canvas vorladen (nur data-URLs — Remote-URLs würden den Canvas tainten)
  const p = _shfData.photo;
  if (p && p.startsWith('data:')) {
    const im = new Image();
    im.onload = () => { _shfData._avaImg = im; };
    im.src = p;
  }
 openOv('ov-share');
  _shfRattleStart();
}
function _shfExit() {
  _shfRattleT.forEach(clearTimeout); _shfRattleT = [];
  _shfStopStream();
  closeOv('ov-share');
  // Nicht als Post geteilt → Training wie bisher als Text-Activity in den Feed
  if (!_shfPosted && _shfSes) { try { _socLogActivity(_shfSes, _shfPrs); } catch(_) {} }
  _shfSes = null; _shfPhoto = null; _shfRendered = [];
  // Punkte-Ticker jetzt zeigen (Share-Flow ist geschlossen). Kurz warten, bis
  // das Sheet weg-animiert ist, damit der Ticker frei nach oben fliegt.
  if (_xpGainPending) { _xpGainPending = false; setTimeout(() => { try { _xpGainOnFinish(); } catch(_){} }, 420); }
}

/* ── Schritt 1: Layout-Rattle (Glücksrad-Auslauf + Haptik-Ticks) ── */
function _shfRattleStart() {
  const body = document.getElementById('shf-body');
  const minis = SHARE_LAYOUTS.map((_, i) => _shfRender(i, 270, 360).toDataURL('image/jpeg', 0.85));
  body.innerHTML = `
    <div class="shf-top"><button class="shf-x" onclick="_shfExit()">✕</button>
      <div class="shf-title">${tr('Dein Look')}</div><div style="width:42px"></div></div>
    <div class="shf-rattle" id="shf-rattle" onclick="_shfRattleStop()">
      <div class="shf-rcard back2"></div>
      <div class="shf-rcard back1"></div>
      <div class="shf-rcard top" id="shf-rtop"><img id="shf-rimg" src="${minis[0]}"><div class="shf-rname" id="shf-rname">${SHARE_LAYOUTS[0].name}</div></div>
    </div>
    <div class="shf-hint">${tr('Tippen zum Festlegen')}</div>`;
  hapticSelStart();
  // Auslaufende Tick-Kette: schnell → langsam, Ende bleibt stehen
  const delays = [70, 70, 75, 80, 90, 100, 115, 135, 160, 195, 240, 300, 380, 470];
  let t = 0, idx = _shfLayout, stopped = false;
  window._shfRattleStopFlag = () => stopped = true;
  delays.forEach((d, i) => {
    t += d;
    _shfRattleT.push(setTimeout(() => {
      if (stopped) return;
      idx = (idx + 1) % SHARE_LAYOUTS.length;
      _shfLayout = idx;
      const img = document.getElementById('shf-rimg'), nm = document.getElementById('shf-rname');
      if (img) { img.src = minis[idx]; nm.textContent = SHARE_LAYOUTS[idx].name; }
      haptic(6);   // deutlicher LIGHT-Impact pro Bild (statt subtilem Selection-Tick)
      if (i === delays.length - 1) _shfRattleLand();
    }, t));
  });
}
function _shfRattleStop() {   // Tap: sofort festlegen
  if (window._shfRattleStopFlag) window._shfRattleStopFlag();
  _shfRattleT.forEach(clearTimeout); _shfRattleT = [];
  _shfRattleLand();
}
function _shfRattleLand() {
  hapticSelEnd();
  const top = document.getElementById('shf-rtop');
  if (top) top.classList.add('landed');
  haptic(16);
  setTimeout(_shfCameraStep, 480);
}

/* ── Schritt 2: Kamera (nativ bevorzugt, Web-Fallback) ── */
async function _shfCameraStep() {
  // In-App-Kamera mit App-Rahmen zuerst (gleiches Sucher-Design wie der Geräte-
  // Scanner). Das native CameraPlugin (System-Kamera ohne eigenes Design) bleibt
  // nur Fallback für Umgebungen ohne getUserMedia.
  if (navigator.mediaDevices?.getUserMedia) { _shfWebCamStep(); return; }
  const CP = _cap('CameraPlugin');
  if (CP) {
    let res = null;
    try { res = await CP.capture({}); } catch (_) {}
    if (res?.photo) {
      const img = new Image();
      img.onload = () => { _shfPhoto = img; _shfEditorStep(); };
      img.src = 'data:image/jpeg;base64,' + res.photo;
      return;
    }
    // verweigert/abgebrochen → Editor mit Gradient-Card (teilen bleibt möglich)
    _shfEditorStep();
    return;
  }
  _shfWebCamStep();
}
function _shfStopStream() {
  try { _shfStream?.getTracks().forEach(t => t.stop()); } catch(_) {}
  _shfStream = null;
}
async function _shfWebCamStep() {
  const body = document.getElementById('shf-body');
  body.innerHTML = `
    <div class="shf-top"><button class="shf-x" onclick="_shfStopStream();_shfEditorStep()">✕</button>
      <div class="shf-title">${tr('Foto')}</div>
      <button class="shf-x" id="shf-flashbtn" onclick="_shfToggleFlash()" aria-label="${tr('Blitz')}">${ICO.bolt({ s: 20 })}</button></div>
    <div class="shf-cam"><video id="shf-video" autoplay playsinline muted></video>
      <div class="shf-flashfx" id="shf-flashfx"></div>
      ${_gtCamFrameHTML()}
      <div class="shf-cam-bar">
        <button class="shf-camside" onclick="_shfPickGallery()" aria-label="${tr('Galerie')}">${ICO.image({ s: 22 })}</button>
        <button class="shf-shutter" onclick="_shfWebSnap()" aria-label="${tr('Foto aufnehmen')}"></button>
        <button class="shf-camside" onclick="_shfFlipCam()" aria-label="${tr('Kamera wechseln')}">${ICO.flip({ s: 22 })}</button>
      </div></div>`;
  try {
    _shfStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: _shfFacing, width: {ideal: 1920} }, audio: false });
    const v = document.getElementById('shf-video');
    v.srcObject = _shfStream;
    v.classList.toggle('mirror', _shfFacing === 'user');
  } catch (_) {
    // Berechtigung verweigert / keine Kamera → Galerie oder ohne Foto weiter
    document.querySelector('.shf-cam').innerHTML = `
      <div class="cpg-empty" style="height:100%">
        <div style="color:var(--acc)">${ICO.camera({ s: 46 })}</div>
        <div><b>${tr('Kein Kamera-Zugriff')}</b><br><span style="font-size:13px">${tr('Erlaube die Kamera in den iOS-Einstellungen oder wähle ein Foto aus der Galerie.')}</span></div>
        <button class="shf-btn" style="flex:0 0 auto;padding:13px 26px" onclick="_shfPickGallery()">${tr('Aus Galerie wählen')}</button>
        <button class="shf-btn ghost" style="flex:0 0 auto;padding:13px 26px" onclick="_shfEditorStep()">${tr('Ohne Foto weiter')}</button>
      </div>`;
  }
}
function _shfToggleFlash() {
  _shfFlashOn = !_shfFlashOn;
  const b = document.getElementById('shf-flashbtn');
  if (b) b.style.background = _shfFlashOn ? 'rgba(255,214,10,.4)' : 'rgba(255,255,255,.14)';
  haptic(6);
}
function _shfFlipCam() {
  _shfFacing = _shfFacing === 'user' ? 'environment' : 'user';
  haptic(8);
  _shfStopStream();
  _shfWebCamStep();
}
function _shfWebSnap() {
  const v = document.getElementById('shf-video');
  if (!v || !v.videoWidth) return;
  const fire = () => {
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext('2d');
    if (_shfFacing === 'user') { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, 0, 0);
    const img = new Image();
    img.onload = () => { _shfPhoto = img; _shfStopStream(); _shfEditorStep(); };
    img.src = c.toDataURL('image/jpeg', 0.9);
  };
  haptic(14);
  if (_shfFlashOn) {
    const fx = document.getElementById('shf-flashfx');
    if (fx) { fx.style.opacity = 1; setTimeout(() => { fire(); fx.style.opacity = 0; }, 180); return; }
  }
  fire();
}
function _shfPickGallery() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = () => {
    const f = inp.files?.[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const img = new Image();
      img.onload = () => { _shfPhoto = img; _shfStopStream(); _shfEditorStep(); };
      img.src = rd.result;
    };
    rd.readAsDataURL(f);
  };
  inp.click();
}

/* Farbpalette wechseln → alle Layouts neu rendern + Slides/Swatches aktualisieren */
function _shfSetPal(i) {
  if (_shfPalIdx === i) return;
  _shfPalIdx = i; _shfUserPal = true; haptic(6);
  _shfRenderAll();
  const sw = document.getElementById('shf-swipe');
  if (sw) [...sw.children].forEach((el, idx) => { const im = el.querySelector('img'); if (im && _shfRendered[idx]) im.src = _shfRendered[idx]; });
  document.querySelectorAll('#shf-pal .shf-sw').forEach((b, idx) => b.classList.toggle('on', idx === i));
}

/* Farbrad: der <input type=color> IST das antippbare Swatch (per <label>),
   damit iOS den nativen Farb-Picker auf echten User-Tap öffnet. */
function _shfSetCustomCol(hex) {
  _shfCustomCol = hex; _shfPalIdx = -1; _shfUserPal = true; haptic(6);
  _shfRenderAll();
  const sw = document.getElementById('shf-swipe');
  if (sw) [...sw.children].forEach((el, idx) => { const im = el.querySelector('img'); if (im && _shfRendered[idx]) im.src = _shfRendered[idx]; });
  document.querySelectorAll('#shf-pal .shf-sw').forEach(b => b.classList.remove('on'));
  const wb = document.querySelector('#shf-pal .shf-sw-wheel');
  if (wb) { wb.classList.add('on'); wb.style.background = hex; }
}

/* ── Schritt 3: Layout-Swipe auf dem Foto ── */
function _shfEditorStep() {
  _shfStopStream();
  // Standard-Layoutfarbe automatisch nach Foto-Kontrast — solange der Nutzer
  // noch nicht selbst in der Swatch-Reihe gewählt hat.
  if (_shfPhoto && !_shfUserPal) { _shfPalIdx = _shfAutoPal(_shfPhoto); _shfCustomCol = null; }
  _shfRenderAll();
  const body = document.getElementById('shf-body');
  body.innerHTML = `
    <div class="shf-top"><button class="shf-x" onclick="_shfExit()">✕</button>
      <div class="shf-title">${tr('Layout wählen')}</div><div style="width:42px"></div></div>
    <div class="shf-edit">
      <div class="shf-swipe" id="shf-swipe">
        ${_shfRendered.map((u, i) => `<div class="shf-slide${i === _shfLayout ? ' on' : ''}"><img src="${u}" alt="${SHARE_LAYOUTS[i].name}"></div>`).join('')}
      </div>
      <div class="shf-dots" id="shf-dots">
        ${SHARE_LAYOUTS.map((_, i) => `<div class="shf-dot${i === _shfLayout ? ' on' : ''}"></div>`).join('')}
      </div>
      ${(() => {
        const n = (S.sessions || []).length;
        const totMin = Math.round((S.sessions || []).reduce((a, s) => a + (s.duration || 0), 0) / 60);
        const lastMin = Math.round(((S.sessions || [])[n - 1]?.duration || 0) / 60);
        const fmtT = totMin >= 60 ? Math.floor(totMin / 60) + ' h ' + (totMin % 60) + ' m' : totMin + ' m';
        return `<div class="shf-stats">
          <div><span class="l">${tr('Sessions')}</span><b>${n}<i>+1</i></b></div>
          <div><span class="l">${tr('Aktive Zeit')}</span><b>${fmtT}${lastMin ? `<i>+${lastMin} m</i>` : ''}</b></div>
        </div>`;
      })()}
    </div>
    <div class="shf-pal" id="shf-pal">
      ${SHF_PALETTES.map((p, i) => `<button class="shf-sw${i === _shfPalIdx ? ' on' : ''}" onclick="_shfSetPal(${i})" style="background:${p.accent || _shfAppAcc()}" aria-label="${p.name}"></button>`).join('')}
      <label class="shf-sw shf-sw-wheel${_shfPalIdx === -1 ? ' on' : ''}" aria-label="${tr('Farbe wählen')}" style="${_shfCustomCol ? `background:${_shfCustomCol}` : 'background:conic-gradient(from 210deg,#FF2D78,#F5B301,#10B981,#06B6D4,#8B5CF6,#FF2D78)'};position:relative;overflow:hidden;display:inline-block">
        <input type="color" id="shf-col-inp" value="${_shfCustomCol || _shfAppAcc()}" oninput="_shfSetCustomCol(this.value)" onchange="_shfSetCustomCol(this.value)" style="position:absolute;top:-7px;left:-7px;width:44px;height:44px;opacity:0;border:0;padding:0;margin:0;cursor:pointer">
      </label>
    </div>
    </div>
    <div class="shf-cta">
      <button class="shf-btn ghost" style="flex:0 0 auto;padding:14px 18px" onclick="_shfCameraStep()" aria-label="${tr('Foto')}">${ICO.camera({ s: 24 })}</button>
      <button class="shf-btn" onclick="_shfShareStep()">${tr('Weiter')}</button>
    </div>`;
  const sw = document.getElementById('shf-swipe');
  // Startposition = im Rattle gelandetes Layout
  requestAnimationFrame(() => {
    const slide = sw.children[_shfLayout];
    if (slide) sw.scrollLeft = slide.offsetLeft - (sw.clientWidth - slide.clientWidth) / 2;
  });
  let lastIdx = _shfLayout;
  sw.addEventListener('scroll', () => {
    const mid = sw.scrollLeft + sw.clientWidth / 2;
    let idx = 0, best = 1e9;
    [...sw.children].forEach((el, i) => {
      const c = el.offsetLeft + el.clientWidth / 2, dd = Math.abs(c - mid);
      if (dd < best) { best = dd; idx = i; }
    });
    if (idx !== lastIdx) { lastIdx = idx; _shfLayout = idx; hapticTick();
      [...sw.children].forEach((el, i) => el.classList.toggle('on', i === idx));
      [...document.getElementById('shf-dots').children].forEach((d, i) => d.classList.toggle('on', i === idx));
    }
  }, { passive: true });
}

/* ── Schritt 4: Teilen ── */
function _shfShareStep() {
  const body = document.getElementById('shf-body');
  const canPost = !!(S.socialOn && _socReady());
  body.innerHTML = `
    <div class="shf-top"><button class="shf-x" onclick="_shfEditorStep()">‹</button>
      <div class="shf-title">${tr('Teilen')}</div>
      <button class="shf-x" onclick="_shfExit()">✕</button></div>
    <div class="shf-share">
      <div class="shf-preview"><img src="${_shfRendered[_shfLayout]}"></div>
      ${canPost ? `
      <div class="shf-dest" onclick="_shfTgl('friends')">
        <div class="ico">${ICO.users({ s: 20 })}</div>
        <div class="t"><b>${tr('Freunde')}</b><span>${tr('Nur dein Freundeskreis')}</span></div>
        <label class="tgl" onclick="event.stopPropagation()"><input type="checkbox" id="shf-tg-friends" checked><span class="tgl-track"></span></label>
      </div>
      <div class="shf-dest" onclick="_shfTgl('public')">
        <div class="ico">${ICO.globe({ s: 20 })}</div>
        <div class="t"><b>Community</b><span>${tr('Öffentlich für alle MyGymTrack-Nutzer')}</span></div>
        <label class="tgl" onclick="event.stopPropagation()"><input type="checkbox" id="shf-tg-public"><span class="tgl-track"></span></label>
      </div>` : `
      <div class="shf-dest"><div class="ico">${ICO.users({ s: 20 })}</div>
        <div class="t"><b>${tr('Community aus')}</b><span>${tr('Aktiviere die Community im Community-Tab, um Beiträge zu posten.')}</span></div></div>`}
      <div class="shf-dest" onclick="_shfExtern()">
        <div class="ico">${ICO.share({ s: 20 })}</div>
        <div class="t"><b>${tr('Extern teilen')}</b><span>Instagram, WhatsApp, ${tr('Fotos')} …</span></div>
      </div>
      <button class="shf-btn" id="shf-postbtn" onclick="_shfPublish()">${canPost ? tr('Posten') : tr('Fertig')}</button>
    </div>`;
}
function _shfTgl(k) {
  const el = document.getElementById('shf-tg-' + k);
  if (el) { el.checked = !el.checked; haptic(6); }
}
async function _shfFinalJpeg() {
  return _shfRender(_shfLayout).toDataURL('image/jpeg', 0.82);
}
// Kompakte base64-Variante fürs Firestore-Dokument (kein Storage nötig): kleinere
// Auflösung + Qualität notfalls runter, bis der data-URL sicher unter dem
// Firestore-1-MB-Limit liegt (~0,9 MB Reserve für die übrigen Post-Felder).
async function _shfFeedJpeg() {
  const cv = _shfRender(_shfLayout, 720, 960);
  for (const q of [0.72, 0.6, 0.48, 0.38]) {
    const url = cv.toDataURL('image/jpeg', q);
    if (url.length < 900000) return url;
  }
  return cv.toDataURL('image/jpeg', 0.3);
}
async function _shfExtern() {
  haptic(10);
  try {
    const dataUrl = await _shfFinalJpeg();
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], 'mygymtrack-workout.jpg', { type: 'image/jpeg' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'MyGymTrack' });
    } else {
      const a = document.createElement('a');
      a.href = dataUrl; a.download = 'mygymtrack-workout.jpg'; a.click();
    }
  } catch (e) { if (e?.name !== 'AbortError') console.warn('[GymTrack] Extern teilen:', e); }
}
async function _shfPublish() {
  const fr = document.getElementById('shf-tg-friends')?.checked;
  const pb = document.getElementById('shf-tg-public')?.checked;
  if (!fr && !pb) { _shfExit(); return; }           // nichts gewählt → einfach fertig
  if (!_socReady()) { _shfExit(); return; }
  const btn = document.getElementById('shf-postbtn');
  btn.disabled = true; btn.textContent = tr('Wird gepostet…');
  // Optimistisch als „gepostet" markieren, BEVOR asynchron hochgeladen wird: sonst
  // könnte ein parallel schließender Share-Flow (_shfExit) dasselbe Training ZUSÄTZLICH
  // als Text-Aktivität loggen → doppelter Feed-Eintrag. Bei Fehler unten zurücksetzen.
  _shfPosted = true;
  try {
    const d = _shfData;
    // Foto als komprimiertes base64-JPEG direkt im Post ablegen (kein Firebase Storage
    // → kein Blaze-Plan/Kosten). imgPath bleibt null, also kein Storage-Delete nötig.
    const img = await _shfFeedJpeg();
    const base = {
      ts: Date.now(), img: img, imgPath: null,
      layout: SHARE_LAYOUTS[_shfLayout].id,
      dayName: d.dayName, dur: Math.round(d.duration / 60),
      mgs: d.mgs, gym: d.gym || null,
      name: d.username, photo: d.photo && d.photo.startsWith('http') ? d.photo : null,
      flames: {}
    };
    // Jede ausgewählte Zielgruppe bekommt ein EIGENES Post-Doc mit exakt EINEM
    // visibility-Wert — Freunde-Feed zeigt nur 'friends'-Docs, Community-Feed nur
    // 'public'-Docs (siehe _loadPostsFor-Filter). So landet der Post NUR dort, wo
    // er ausgewählt wurde, statt automatisch auch beim jeweils anderen Ziel.
    const writes = [];
    if (fr) writes.push(window.FB.setDoc(window.FB.doc('profiles/' + _fbUser.uid + '/posts', uid()), { ...base, visibility: 'friends' }));
    if (pb) writes.push(window.FB.setDoc(window.FB.doc('profiles/' + _fbUser.uid + '/posts', uid()), { ...base, visibility: 'public' }));
    // Eigenen Post SOFORT in den Feed-Cache einspeisen, damit er beim nächsten
    // Öffnen ohne Warten (60s-Cache/Neuladen) ganz oben steht — „Echtzeit"-Gefühl.
    try { _cpgInjectOwnPost(base, { friends: fr, public: pb }); } catch(_) {}
    await Promise.all(writes);
    _shfPosted = true;
    hapticSuccess();
    _shfExit();
  } catch (e) {
    _shfPosted = false;   // Upload fehlgeschlagen → Text-Aktivitäts-Fallback wieder erlauben
    console.warn('[GymTrack] Post fehlgeschlagen:', e?.code || e);
    btn.disabled = false; btn.textContent = tr('Posten');
    alert(tr('Posten fehlgeschlagen — bist du offline?'));
  }
}

// ── BEGLEITER ─────────────────────────────────────────
function openCompanionPicker() {
  renderCompanionGrid();
  openOv('ov-companion');
}

function renderCompanionGrid() {
  document.getElementById('companion-grid').innerHTML = COMPANIONS.map(c => {
    const active  = S.companion === c.id;
    const locked  = !c.available;
    return `<div class="companion-card${active?' on':''}${locked?' locked':''}"
                 onclick="${locked ? '' : `selectCompanion('${c.id}')`}">
      ${active ? '<div class="cc-chk">✓</div>' : ''}
      ${locked ? '<div class="cc-lock">🔒</div>' : ''}
      <span class="cc-ico">${c.emoji}</span>
      <div class="cc-name">${esc(c.name)}</div>
      <div class="cc-sub">${c.desc}</div>
    </div>`;
  }).join('');
}

function selectCompanion(id) {
  const c = COMPANIONS.find(c => c.id === id);
  if (!c || !c.available) return;
  S.companion = id;
  persist();
  applyCompanion();
  renderCompanionGrid();           // Auswahl optisch aktualisieren
  updateCompanionSettingsRow();    // Einstellungs-Zeile aktualisieren
}

function applyCompanion() {
  const c    = COMPANIONS.find(c => c.id === S.companion) || COMPANIONS[0];
  const lane = document.getElementById('dackel-lane');
  if (lane) lane.style.display = S.companionOn ? '' : 'none';
  const chk  = document.getElementById('companion-toggle');
  if (chk)  chk.checked = S.companionOn;
  const pickRow = document.getElementById('companion-picker-row');
  if (pickRow) pickRow.style.display = S.companionOn ? '' : 'none';
  updateCompanionSettingsRow(c);
}

function toggleCompanion(on) {
  S.companionOn = on;
  persist();
  const lane = document.getElementById('dackel-lane');
  if (lane) lane.style.display = on ? '' : 'none';
  const pickRow = document.getElementById('companion-picker-row');
  if (pickRow) pickRow.style.display = on ? '' : 'none';
}

function updateCompanionSettingsRow(c) {
  c = c || COMPANIONS.find(c => c.id === S.companion) || COMPANIONS[0];
  const name = document.getElementById('companion-settings-name');
  if (name) name.textContent = c.name;
}

// ── SETTINGS ──────────────────────────────────────────
function renderSettings() {
  document.getElementById('data-info').textContent =
    S.exercises.length+' Übungen · '+S.sessions.length+' Trainings gespeichert';
  updateCompanionSettingsRow();
  updateAdminUI();
  updateSocialUI();
  renderPremiumSettings();
  // Unit-Toggle aktuellen Stand anzeigen
  document.querySelectorAll('[data-unit-btn]').forEach(b => {
    b.classList.toggle('on', b.dataset.unitBtn === (S.unitMode||'kg'));
  });
  // Globale Steigerung (in Anzeige-Einheit)
  const gps = document.getElementById('in-progstep-global');
  if (gps) gps.value = (S.progStepDefault != null && S.progStepDefault !== '') ? String(kgToDisp(S.progStepDefault)) : '';
}

// Globaler Gewichts-Steigerungs-Schritt (Eingabe in Anzeige-Einheit → intern kg).
// Bewusst NICHT in der Cloud (Firestore-hasOnly-Regeln) — reine Geräte-Einstellung.
function setGlobalProgStep(v) {
  const raw = String(v || '').replace(',', '.').trim();
  if (raw === '') { S.progStepDefault = null; }
  else { const n = dispToKg(parseFloat(raw)); S.progStepDefault = (isFinite(n) && n > 0) ? n : null; }
  persist();
  const gps = document.getElementById('in-progstep-global');
  if (gps) gps.value = (S.progStepDefault != null) ? String(kgToDisp(S.progStepDefault)) : '';
  if (typeof renderSuggestions === 'function' && document.getElementById('sug-list')) renderSuggestions();
}

// ── BACKUP: EXPORT ────────────────────────────────────
function exportData() {
  const data     = localStorage.getItem('ft4') || '{}';
  const filename = 'gymtrack-backup-' + new Date().toISOString().slice(0,10) + '.json';
  // iOS: Web Share API mit Datei
  if (navigator.share && navigator.canShare) {
    const file = new File([data], filename, {type:'application/json'});
    if (navigator.canShare({files:[file]})) {
      navigator.share({files:[file], title:'MyGymTrack Backup'}).catch(()=>{});
      return;
 }
 }
 // Fallback: Download-Link
 const url = URL.createObjectURL(new Blob([data],{type:'application/json'}));
 const a = Object.assign(document.createElement('a'),{href:url, download:filename});
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
}

// ── BACKUP: IMPORT ────────────────────────────────────
function importData() {
  const input = document.createElement('input');
  input.type  = 'file';
  input.accept = '.json,application/json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (parsed.exercises !== undefined || parsed.sessions !== undefined) {
          localStorage.setItem('ft4', ev.target.result);
          alert('Daten wiederhergestellt! App wird neu geladen.');
          location.reload();
        } else { alert('Ungültige Backup-Datei!'); }
      } catch { alert('Datei konnte nicht gelesen werden!'); }
    };
    reader.readAsText(file);
  };
  document.body.appendChild(input);
  input.click();
  setTimeout(()=>document.body.removeChild(input), 1000);
}

// ── SHEET SWIPE-TO-DISMISS ────────────────────────────
function initSheetSwipe() {
  document.querySelectorAll('.ov').forEach(ov => {
    if (ov.id === 'ov-share') return;                      // Vollbild-Share-Flow – kein Sheet
    const sheet  = ov.firstElementChild;                   // Karte/Sheet (egal welche CSS-Klasse)
    const handle = sheet && sheet.querySelector(':scope > .sh-handle');
    if (!sheet || !handle) return;

    let sy = 0, ly = 0, dragging = false, hasMoved = false, armed = false;

    /* Scrollbarer Vorfahre unter dem Finger. Steht der nicht ganz oben, gehört
       die Abwärtsgeste dem Scrollen und nicht dem Sheet. */
    const scrolledDown = t => {
      for (let el = t; el && el !== ov; el = el.parentElement) {
        if (el.scrollHeight - el.clientHeight > 2) {
          const oy = getComputedStyle(el).overflowY;
          if (oy === 'auto' || oy === 'scroll') return el.scrollTop > 0;
        }
      }
      return false;
    };
    /* Eingabeelemente behalten ihre eigene Geste (Wheel, Slider, Textfeld, ✕). */
    const ownsGesture = t => !!(t && t.closest && t.closest('input,textarea,select,.x-btn'));
    /* Im KOPF gilt das für JEDEN Knopf, nicht nur ✕. Der Kopf-Handler ruft
       start(e,true) und damit sofort preventDefault() — das verschluckt den
       nachfolgenden click. Bisher stand nur .x-btn auf der Ausnahmeliste, also
       war der Zurück-Pfeil des Coach-Hubs (.ch-back) tot: sichtbar, tippbar,
       ohne Wirkung. Die Ausnahme gilt bewusst NUR hier — im Sheet-Inhalt darf
       eine Abwärtsgeste weiterhin auf einem Knopf beginnen. */
    const headOwnsGesture = t => ownsGesture(t)
      || !!(t && t.closest && t.closest('button,a,[role="button"]'));

    const start = (e, immediate) => {
      sy = ly  = e.touches[0].clientY;
      hasMoved = false;
      dragging = immediate;
      armed    = true;
      if (immediate) {
        sheet.style.transition = 'none';
        /* WICHTIG: non-passive + preventDefault verhindert, dass der Browser
           sofort einen Scroll startet und unsere touchmove-Events ignoriert */
        e.preventDefault();
        e.stopPropagation();
      }
    };

    handle.addEventListener('touchstart', e => start(e, true), { passive: false });

    /* Auch die Kopfzeile zieht — das ist die Stelle, die man intuitiv anfasst. */
    const head = sheet.querySelector(':scope > .sh-head');
    if (head) head.addEventListener('touchstart', e => {
      if (headOwnsGesture(e.target)) return;
      start(e, true);
    }, { passive: false });

    /* Und das Sheet selbst, solange sein Inhalt oben steht. Hier NICHT sofort
       übernehmen: erst in touchmove entscheiden, sonst bricht das Scrollen. */
    sheet.addEventListener('touchstart', e => {
      if (dragging || ownsGesture(e.target) || scrolledDown(e.target)) return;
      start(e, false);
    }, { passive: true });

    sheet.addEventListener('touchmove', e => {
      if (!armed) return;
      ly = e.touches[0].clientY;
      const dy = ly - sy;
      if (dy <= 0) return;
      if (!dragging) {
        /* Erst ab einer klaren Abwärtsgeste übernehmen, damit Taps und
           kurze Wischer im Inhalt unberührt bleiben. */
        if (dy < 8 || scrolledDown(e.target)) return;
        dragging = true;
        sheet.style.transition = 'none';
      }
      hasMoved = true;
      e.preventDefault();
      sheet.style.transform = `translateY(${(dy * 0.62).toFixed(1)}px)`;
      sheet.style.opacity   = String(Math.max(0.3, 1 - dy / 460));
    }, { passive: false });

    /* Schließ-Animation */
    const dismiss = () => {
      ov.style.transition    = 'background .22s';
      ov.style.background    = 'rgba(0,0,0,0)';
      sheet.style.transition = 'transform .22s cubic-bezier(.55,0,1,.55), opacity .2s';
      sheet.style.transform  = 'translateY(110%)';
      sheet.style.opacity    = '0';
      setTimeout(() => {
        /* Erst schließen (display:none) – DANN Styles zurücksetzen,
           sonst ist der Rücksprung kurz sichtbar (der "klappt nicht"-Bug) */
        if (ov.id === 'ov-icons') closeIconPicker();
        else closeOv(ov.id);
        ov.style.transition    = ov.style.background    = '';
        sheet.style.transition = sheet.style.transform  = sheet.style.opacity = '';
      }, 240);
    };

    const onEnd = () => {
      armed = false;
      if (!dragging) return;
      dragging = false;
      const dy = ly - sy;

      if (hasMoved && dy > 70) {
        dismiss();
      } else {
        /* Zu wenig gezogen → Feder-Rücksprung */
        sheet.style.transition = 'transform .38s cubic-bezier(.32,1.1,.32,1), opacity .26s';
        sheet.style.transform  = '';
        sheet.style.opacity    = '';
        setTimeout(() => { sheet.style.transition = ''; }, 420);
      }
    };

    /* Am Sheet, nicht am Griff: deckt per Bubbling Griff, Kopfzeile und Inhalt ab. */
    sheet.addEventListener('touchend',    onEnd, { passive: true });
    sheet.addEventListener('touchcancel', onEnd, { passive: true });
  });
}

// ── DRAG TAB INDICATOR (Liquid Glass long-press) ──────
let _dragTimer   = null;
let _dragActive  = false;
let _dragBarRect = null;
let _dragTabs    = null;
let _dragTabW    = 0;
let _dragIndW    = 0;
let _swallowClick = false;

const TAB_IDS = ['heute', 'uebungen', 'stats', 'freunde', 'erfolge'];

function initTabDrag() {
  const bar = document.querySelector('.tabbar');
  const ind = document.getElementById('tab-indicator');

  bar.addEventListener('touchstart', e => {
    _dragActive = false;
    _dragTimer  = setTimeout(() => {
      _dragActive   = true;
      _dragBarRect  = bar.getBoundingClientRect();
      _dragTabs     = [...bar.querySelectorAll('.tab')];
      _dragTabW     = _dragBarRect.width / _dragTabs.length;
      _dragIndW     = ind.offsetWidth;
      ind.style.transition = 'none';
      if (navigator.vibrate) navigator.vibrate(8);
    }, 400);
  }, { passive: true });

  bar.addEventListener('touchmove', e => {
    if (!_dragActive) return;
    e.preventDefault();
    const x      = e.touches[0].clientX - _dragBarRect.left;
    const minX   = 5;
    const maxX   = _dragBarRect.width - 5 - _dragIndW;
    const posX   = Math.max(minX, Math.min(maxX, x - _dragIndW / 2));
    ind.style.transform = `translateX(${posX}px)`;
    _indX = posX; _indW = _dragIndW;   // festgeschriebene Geometrie mitführen → sauberer Stretch beim Loslassen

    const idx = Math.max(0, Math.min(_dragTabs.length - 1, Math.floor(x / _dragTabW)));
    _dragTabs.forEach((t, i) => t.classList.toggle('on', i === idx));
  }, { passive: false });

  const onEnd = e => {
    clearTimeout(_dragTimer);
    if (!_dragActive) return;
    _dragActive   = false;
    _swallowClick = true;
    ind.style.transition = '';

    const x   = e.changedTouches[0].clientX - _dragBarRect.left;
    const idx = Math.max(0, Math.min(_dragTabs.length - 1, Math.floor(x / _dragTabW)));
    goTab(TAB_IDS[idx], _dragTabs[idx]);
  };

  bar.addEventListener('touchend',    onEnd, { passive: true });
  bar.addEventListener('touchcancel', e => {
    clearTimeout(_dragTimer);
    _dragActive = false;
    ind.style.transition = '';
  }, { passive: true });

  // Swallow the click that fires after touchend so the normal onclick doesn't double-fire
  bar.addEventListener('click', e => {
    if (_swallowClick) { e.stopPropagation(); _swallowClick = false; }
  }, true);
}

// ── PAGE SWIPE (horizontal wischen zwischen Tabs) ────────
function initPageSwipe() {
  let sx = 0, sy = 0, tracking = false;

  document.addEventListener('touchstart', e => {
    tracking = false;
    window._tabSwipeActive = false;
    if (e.touches.length > 1) return;                 // Pinch/Zoom (z.B. Karte) → nie Tab-Wechsel
    if (document.querySelector('.ov.on')) return;
    const t  = e.touches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    if (!el || el.closest('.tabbar') || el.closest('.ov')) return;
    if (_hasHScrollParent(el)) return;
    if (el.closest('.ex-swipe-wrap, .last-swipe-inner, #log-cards, .wh-item, #rec-box, .soc-map-wrap, .cpg-card')) return;
    sx = t.clientX; sy = t.clientY; tracking = true;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!tracking) return;
    if (e.touches.length > 1) { tracking = false; return; }  // zweiter Finger landet → Pinch, kein Swipe
    const dx = Math.abs(e.touches[0].clientX - sx);
    const dy = Math.abs(e.touches[0].clientY - sy);
    if (dy > dx + 8) { tracking = false; return; }
    // Sobald klar erkennbar ein Tab-Wechsel → Flag setzen, damit Lösch-Swipe abgebrochen wird
    if (dx > 50 && dx > dy * 1.5) window._tabSwipeActive = true;
  }, { passive: true });

  document.addEventListener('touchend', e => {
    const wasTabSwipe = window._tabSwipeActive;
    window._tabSwipeActive = false;
    if (!tracking) return;
    tracking = false;
    if (document.querySelector('.ov.on')) return;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) < 65 || Math.abs(dy) > Math.abs(dx) * 0.65) return;
    const cur = TAB_IDS.findIndex(id => document.getElementById('pg-' + id)?.classList.contains('on'));
    if (cur < 0) return;
    const next = dx < 0 ? Math.min(cur + 1, TAB_IDS.length - 1) : Math.max(cur - 1, 0);
    if (next === cur) return;
    const tabs = [...document.querySelectorAll('.tabbar .tab')];
    goTab(TAB_IDS[next], tabs[next]);
  }, { passive: true });
}

function _hasHScrollParent(el) {
  while (el && el !== document.body) {
    const st = window.getComputedStyle(el);
    if ((st.overflowX === 'scroll' || st.overflowX === 'auto') && el.scrollWidth > el.clientWidth) return true;
    el = el.parentElement;
  }
  return false;
}

// ── HINTERGRUND-SCROLL SPERREN, SOLANGE EIN SHEET OFFEN IST ──
// Ohne das scrollt beim Wischen im Sheet-Kopf (Name/Farbe/Tage) die Seite
// dahinter mit. Gescrollt wird NUR noch innerhalb des Sheets – in einem echten
// vertikalen Scroll-Container (z. B. #preset-ex-list). Alles andere (Backdrop,
// nicht scrollbarer Sheet-Kopf) blockt den Touchmove → Trainingsansicht bleibt fix.
function _vScrollableAncestor(el, root) {
  while (el && el !== root && el !== document.body) {
    if (el.scrollHeight > el.clientHeight + 1) {
      const oy = window.getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') return el;
    }
    el = el.parentElement;
  }
  return null;
}
document.addEventListener('touchmove', e => {
  if (e.touches.length > 1) return;                       // Pinch/Zoom nie blocken
  if (!document.querySelector('.ov.on')) return;          // kein Sheet offen → normal
  const ov = e.target.closest && e.target.closest('.ov.on');
  if (!ov) { e.preventDefault(); return; }                // Touch außerhalb offener Sheets
  if (_vScrollableAncestor(e.target, ov)) return;         // im vertikalen Sheet-Scroller → erlauben
  if (_hasHScrollParent(e.target)) return;                // horizontale Reihen (Farb-/Tage-Chips)
  if (e.target.closest('.leaflet-container, canvas')) return; // Karten / Charts pannen lassen
  e.preventDefault();                                     // Sheet-Kopf / Backdrop → nichts scrollt
}, { passive: false });

// ── CHANGELOG POPUP ─────────────────────────────────────
// CHANGELOG-Keys sind STABIL (überleben Versionsbump). Es wird nur angezeigt,
// was der User noch NICHT in S.seenChangelog hat. Reihenfolge: NEUESTE zuerst.
function pendingChangelogKeys() {
  const seen = new Set(S.seenChangelog || []);
  return Object.keys(CHANGELOG).filter(k => !seen.has(k));
}

function _clEntry(k) {
  const e = CHANGELOG[k];
  if (Array.isArray(e)) return { label: k, items: e }; // Legacy
  return { label: (e && e.label) || k, items: (e && e.items) || [] };
}

function showChangelog() {
  const keys = pendingChangelogKeys().filter(k => _clEntry(k).items.length);
  if (!keys.length) return;

  const headerVer = document.getElementById('changelog-version');
  const summary   = document.getElementById('changelog-summary');
  const scroll    = document.getElementById('changelog-scroll');

  const newest = _clEntry(keys[0]);
  if (headerVer) {
    headerVer.textContent = keys.length === 1
      ? newest.label
      : `${keys.length} Updates · aktuell ${newest.label}`;
  }
  if (summary) {
    summary.textContent = keys.length > 1
      ? `Du hast ${keys.length} Updates verpasst — alles, was seitdem dazukam:`
      : '';
    summary.style.display = keys.length > 1 ? '' : 'none';
  }
  if (scroll) {
    scroll.innerHTML = keys.map((k, i) => {
      const e = _clEntry(k);
      const head = keys.length > 1
        ? `<div class="changelog-section-head">
             <span class="ver-pill">${e.label}</span>
             ${i === 0 ? '<span>Neueste</span>' : ''}
           </div>`
        : '';
      return `<div class="changelog-section">
        ${head}
        <ul class="changelog-list">
          ${e.items.map(c => `<li><span class="changelog-dot"></span><span>${c}</span></li>`).join('')}
        </ul>
      </div>`;
    }).join('');
  }
  openOv('ov-changelog');
}

function dismissChangelog() {
  // Alle aktuellen Keys als gesehen markieren — Popup erscheint erst wieder
  // wenn NEUE Keys in CHANGELOG hinzukommen.
  S.seenChangelog   = Object.keys(CHANGELOG);
  S.lastSeenVersion = APP_VERSION; // Legacy
  persist();
  closeOv('ov-changelog');
}


// ── HAPTIC FEEDBACK ────────────────────────────────────
function haptic(ms) {
  try {
    const H = _cap('Haptics');
    if (H) {
      if      (ms <= 5)  H.selectionStart?.();
      else if (ms <= 12) H.impact({ style: 'LIGHT'  });
      else if (ms <= 22) H.impact({ style: 'MEDIUM' });
      else               H.impact({ style: 'HEAVY'  });
    } else if (navigator.vibrate) {
      navigator.vibrate(ms || 10);
    }
  } catch(e) {}
}
/* Punkte-Vibrations-„Linie": pro Punkt ein feiner Tick in schneller Folge, sodass
   sich das Einzahlen der Punkte wie ein fließendes Ratschen anfühlt — nicht ein
   einzelnes langes Brummen. Gedeckelt, damit es nicht endlos vibriert. */
function _xpHapticLine(points, totalMs){
  const n = Math.max(1, Math.min(points|0, 60));
  const step = Math.max(15, (totalMs||1200) / n);
  hapticSelStart();
  for (let i = 1; i <= n; i++) setTimeout(() => { try { hapticTick(); } catch(_){} }, Math.round(i * step));
  setTimeout(() => { try { hapticSelEnd(); } catch(_){} }, Math.round(n * step) + 60);
}
// Weiches „Erledigt"-Feedback: kurzer Doppel-Impuls (Erstellen/Speichern/Zuweisen)
function hapticSuccess() {
  try {
    const H = _cap('Haptics');
    if (H && H.notification) { H.notification({ type:'SUCCESS' }); return; }
  } catch(e) {}
  haptic(20);
  setTimeout(() => haptic(9), 95);
}

// Feiner „Klick" pro Walzen-Wert (wie Apple Picker).
// WICHTIG (iOS): selectionChanged() feuert nur, wenn vorher selectionStart()
// den Feedback-Generator erzeugt hat — sonst ist er nil und es passiert NICHTS.
// Darum wird beim Anfassen des Rades hapticSelStart() aufgerufen und beim
// Stillstand hapticSelEnd(). Ein Flag merkt sich, ob die Session läuft.
let _hapticSelActive = false;
