function coachSetupDone(skipped){
  try { _csSettlePreset(); } catch(e) { console.warn('[Coach] Einrichtung abschließen:', e); }
  try { closeOv('ov-coach-setup'); } catch(e) { console.warn('[Coach] Einrichtung schließen:', e); }
  // Nur der bewusste Abschluss führt weiter in die Einstellungen — dort steht
  // dasselbe noch einmal, jetzt zum Nachjustieren. Das ✕ ist ein Überspringen
  // und lässt den Nutzer, wo er war.
  if (skipped === false) setTimeout(() => {
    try {
      // Schleifenwächter: wäre preset trotz Rückfall noch offen (etwa weil S
      // nicht beschreibbar ist), würde openCoachHub() die Einrichtung erneut
      // starten. Dann lieber nicht übergeben als den Nutzer einsperren.
      if (!S.aiCoach || S.aiCoach.preset === undefined) { console.warn('[Coach] Einrichtung ohne Profil beendet — keine Übergabe an den Hub'); return; }
      openCoachHub('scope');
    } catch(e) { console.warn('[Coach] Hub nach Einrichtung:', e); }
  }, _CS_DELAY);
}
function _csNavHTML(){
  return `<div class="pwz-nav">${_csStep > 1
      ? `<button type="button" class="btn btn-gray" style="flex:1" onclick="coachSetupStep(${_csStep - 1})">${esc(tr('Zurück'))}</button>`
      : ''}${_csStep < _CS_STEPS
      ? `<button type="button" class="btn btn-acc" style="flex:2" onclick="coachSetupStep(${_csStep + 1})">${esc(_cm('Weiter','Next'))}</button>`
      : `<button type="button" class="btn btn-acc" style="flex:2" onclick="coachSetupDone(false)">${esc(tr('Fertig'))}</button>`}</div>`;
}
// ── Schritt 1: Name und Ton ──────────────────────────────────────────────
function _csStep1HTML(){
  const p = _persona();
  // Noch nichts vergeben ⇒ leeres Feld, damit der Platzhalter „Coach" sichtbar
  // ist. Der Hub zeigt hier _coachName(), also immer „Coach" — beim ersten Mal
  // müsste der Nutzer das Wort erst löschen, um seinen eigenen zu tippen. Steht
  // ein Name, zeigt das Feld den WIRKSAMEN (safeName kürzt und entschärft),
  // nicht den Rohwert.
  let vorbelegt = ''; try { if (S.aiCoach && S.aiCoach.name) vorbelegt = p.name; } catch(_) {}
  return `<div class="pwz-q">${esc(tr('Wie soll dein Coach heißen?'))}</div>
    <div class="pwz-s">${esc(tr('Name und Ton kannst du jederzeit ändern.'))}</div>
    <input type="text" class="pf-inp" id="cst-name" maxlength="20" autocomplete="off" spellcheck="false"
      value="${esc(vorbelegt)}" placeholder="Coach" onchange="coachSetupSetName(this)">
    <div class="ch-sec">${esc(tr('Wie soll dein Coach klingen?'))}</div>
    ${_CH_TONES.map(t =>
      `<button type="button" class="ch-preset ch-voice${t.k === p.tone ? ' on' : ''}" onclick="setAiCoachOpt('tone','${t.k}')">
        <b>${esc(tr(t.de))}</b><span>${esc(_chToneLine(t.k))}</span></button>`).join('')}
    ${(() => { const inner = _chToneExInner();
        return inner ? `<div class="ch-jrn ghost" id="cst-tone-ex">${inner}</div>` : ''; })()}`;
}
/* Der Sprech-Schritt ist ENTFERNT. Er waehlte Stimme und Sprachausgabe fuer den
   Sprech-Knopf im Training — und den Knopf gibt es nicht mehr. Eine Einrichtung,
   die etwas einstellt, das die App nicht mehr hat, ist schlimmer als eine
   fehlende Frage: sie verspricht eine Funktion. Das Datenfeld voiceOn bleibt in
   S.aiCoach unberuehrt liegen, damit nichts anderes darueber stolpert. */

// ── Schritt 2: Umfang ────────────────────────────────────────────────────
function _csStep2HTML(){
  const p = _persona();
  // Vorbelegt ist die MITTLERE, nicht die lauteste. preset ist hier noch offen
  // (undefined) — 'balanced' trägt trotzdem schon die Markierung, damit „Fertig"
  // ohne Tipp dasselbe ergibt wie ein Tipp auf „Ausgewogen".
  const cur = p.preset === undefined ? 'balanced' : p.preset;
  return `<div class="pwz-q">${esc(tr('Wie viel Coach willst du?'))}</div>
    <div class="pwz-s">${esc(_cm(
      p.name + ' hält sich an das, was du hier wählst — ändern kannst du es jederzeit.',
      p.name + ' sticks to what you pick here — you can change it any time.'))}</div>
    ${_CH_PRESETS.map(x =>
      `<button type="button" class="ch-preset${x.k === cur ? ' on' : ''}" onclick="setCoachPreset('${x.k}')">
        <b>${esc(tr(x.de))}</b><span>${esc(tr(x.s))}</span></button>`).join('')}`;
}
// ── Schritt 3: die Meldungen des Coaches ─────────────────────────────────
/* Bis hierher fragte dieser Schritt nach der TRAININGS-ERINNERUNG (S.notifEnabled).
   Die gibt es aber auch OHNE Abo — sie steht in den Einstellungen unter
   "Benachrichtigungen" und hat mit dem Coach nichts zu tun. Wer gerade Premium
   gekauft hat, bekam hier also eine Frage gestellt, die seinen Kauf nicht
   betrifft.

   Was das Abo wirklich dazugibt, sind die Meldungen des Coaches selbst:
   Wochenbericht, Hinweis auf wieder erholte Muskelgruppen, Nachfassen nach
   stillen Tagen. Genau die stehen jetzt hier.

   ZULETZT, weil danach nichts mehr kommt: der Systemdialog erscheint direkt nach
   der Wahl, nicht drei Bildschirme spaeter. iOS zeigt ihn EINMAL pro
   Installation, eine Ablehnung ist dauerhaft. Ausgeloest wird er ueber den
   BESTEHENDEN Weg (setAiCoachOpt('pushLevel', …) → _cnLevelChanged →
   _cnPermission); ein zweiter Abfragepfad waere die naechste Stelle, die
   auseinanderlaeuft.

   Vorbelegt ist die Stufe, die im Schritt davor gewaehlt wurde — "Fertig" ohne
   Tipp aendert hier also nichts. */
const _CS_PUSH = [
  { k:'still',  de:'Nur in der App',   en:'In the app only',
    sd:'Dein Coach meldet sich nie von selbst.',
    se:'Your coach never speaks up on its own.' },
  { k:'normal', de:'Wichtige Momente', en:'Key moments',
    sd:'Wochenbericht, erholte Muskelgruppen, längere Pausen.',
    se:'Weekly report, recovered muscle groups, longer breaks.' },
  { k:'eng',    de:'Eng dabei',        en:'Close by',
    sd:'Dazu Erinnerungen an deinen Trainingstagen.',
    se:'Plus reminders on your training days.' }
];
function _csStep3HTML(){
  const nm = _coachName();
  let cur = 'normal'; try { cur = _persona().pushLevel || 'normal'; } catch(_) {}
  return `<div class="pwz-q">${esc(_cm('Wann darf sich ' + nm + ' melden?',
                                       'When may ' + nm + ' reach out?'))}</div>
    <div class="pwz-s">${esc(_cm(
      'Das sind die Mitteilungen deines Coaches — sie gehören zu Premium. Die einfache Trainings-Erinnerung bleibt davon unberührt in den Einstellungen.',
      "These are your coach's notifications — part of Premium. The plain workout reminder stays untouched in settings."))}</div>
    ${_CS_PUSH.map(x =>
      `<button type="button" class="ch-preset${x.k === cur ? ' on' : ''}" onclick="coachSetupPush('${x.k}')">
        <b>${esc(_cm(x.de, x.en))}</b><span>${esc(_cm(x.sd, x.se))}</span></button>`).join('')}`;
}
/* Aeusserer Deckel wie ueberall in dieser Flaeche: die Funktion haengt an einem
   inline onclick und darf weder den Kauf noch die Einrichtung abbrechen.
   Zweimal gezeichnet, weil die Rueckkehr auf 'still' nach einer Ablehnung
   ASYNCHRON passiert (Systemdialog) — eine Karte, die die Ablehnung nicht
   zeigt, waere die schlechtere Haelfte. */
function coachSetupPush(stufe){
  try { setAiCoachOpt('pushLevel', stufe); }
  catch(e) { console.warn('[Coach] Push-Stufe in der Einrichtung:', e); }
  try { renderCoachSetup(); } catch(_) {}
  setTimeout(() => { try { renderCoachSetup(); } catch(_) {} }, 900);
}
function renderCoachSetup(){
  const ov = document.getElementById('ov-coach-setup');
  // Früh zurück, wenn die Einrichtung zu ist: der Aufruf kommt auch aus
  // _coachOptRender() heraus, also aus Kontexten ohne Einrichtung (Heute-Karte,
  // Live-Leiste, Chat-Kopf) — genau wie bei renderCoachHub().
  if (!ov || !ov.classList.contains('on')) return;
  const body = document.getElementById('cst-body'); if (!body) return;
  try {
    // Kopf per textContent: die eine Stelle, an der der im Modul entschärfte
    // Name doch noch als Markup landen könnte. tr() greift trotzdem.
    const h = document.getElementById('cst-title'); if (h) h.textContent = _coachName();
    const dots = document.getElementById('cst-dots');
    if (dots) { let d = '';
      for (let i = 1; i <= _CS_STEPS; i++) d += `<div class="pwz-dot${i === _csStep ? ' on' : ''}"></div>`;
      dots.innerHTML = d; }
    if (_csHold) return;
    body.innerHTML = _csStep === 3 ? _csStep3HTML()
                   : _csStep === 2 ? _csStep2HTML()
                   : _csStep1HTML();
    // Getrennter Behälter, damit die Leiste nicht mit dem Inhalt wegscrollt.
    const nav = document.getElementById('cst-nav'); if (nav) nav.innerHTML = _csNavHTML();
  } catch(e) { console.warn('[Coach] Einrichtung zeichnen:', e); }
}
// Der Name schreibt sich ohne Rerender des Bodys — dieselbe Aufteilung wie
// coachHubSetName(): Kopf, Eingabefeld und Beispielsatz sind die einzigen
// Stellen der Einrichtung, die ihn tragen.
function coachSetupSetName(el){
  _csHold = true;
  try { setAiCoachOpt('name', (el && el.value) || ''); }
  catch(e) { console.warn('[Coach] Einrichtung Name setzen:', e); }
  finally { _csHold = false; }
  try {
    const nm = _coachName();
    const h = document.getElementById('cst-title'); if (h) h.textContent = nm;
    // Zeigt, was wirklich gespeichert wurde (safeName kürzt und entschärft) —
    // ein leer geräumtes Feld bleibt leer, damit der Platzhalter sichtbar wird.
    if (el) el.value = (S.aiCoach && S.aiCoach.name) ? nm : '';
    const ex = document.getElementById('cst-tone-ex'); if (ex) ex.innerHTML = _chToneExInner();
  } catch(e) { console.warn('[Coach] Einrichtung Name anwenden:', e); }
}
function renderPremiumSettings(){
  const el = document.getElementById('prem-settings-body'); if (!el) return;
  const prem = isPremium();
  const chev = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--text2)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M9 18l6-6-6-6"/></svg>`;
  const rows = [];
  rows.push(`
    <div class="row"${prem ? '' : ` onclick="openPaywall('settings')" style="cursor:pointer"`}>
      <div class="ico" style="background:rgba(247,201,72,.14);border-color:rgba(247,201,72,.32);color:#b8860b">${ICO.crown({s:20})}</div>
      <div class="row-body">
        <div class="row-title">${prem ? 'Premium aktiv' : 'Kein Premium'}</div>
        <div class="row-sub" style="white-space:normal;line-height:1.5;margin-top:2px">${prem ? esc(_premStatusSub()) : 'KI-Chat, Live-Coach &amp; Trainingsanalyse freischalten'}</div>
      </div>
      ${prem ? '' : chev}
    </div>`);
  if (prem) {
    rows.push(`
    <div class="row" onclick="premManage()" style="cursor:pointer">
      <div class="row-body"><div class="row-title">Abo verwalten</div><div class="row-sub">In den App-Store-Einstellungen öffnen</div></div>
      ${chev}
    </div>
    <div class="row" onclick="premRestore()" style="cursor:pointer">
      <div class="row-body"><div class="row-title">Käufe wiederherstellen</div><div class="row-sub">Abo auf diesem Gerät erneut aktivieren</div></div>
      ${chev}
    </div>`);
    const quotaText = _premQuotaText();
    if (quotaText) rows.push(`
    <div class="row">
      <div class="row-body"><div class="row-title">KI-Anfragen</div><div class="row-sub">${esc(quotaText)}</div></div>
    </div>`);
    rows.push(`
    <div class="row">
      <div class="row-body"><div class="row-title">Live-Coach im Training</div><div class="row-sub">Tipps während des Satzes</div></div>
      <label class="tgl" onclick="event.stopPropagation()">
        <input type="checkbox" ${S.aiCoach?.live !== false ? 'checked' : ''} onchange="setAiCoachOpt('live', this.checked)">
        <span class="tgl-track"></span>
      </label>
    </div>
    <div class="row">
      <div class="row-body"><div class="row-title">Tagesempfehlung auf der Startseite</div><div class="row-sub">Trainingsvorschlag laut Erholung deiner Muskelgruppen</div></div>
      <label class="tgl" onclick="event.stopPropagation()">
        <input type="checkbox" ${S.aiCoach?.insights !== false ? 'checked' : ''} onchange="setAiCoachOpt('insights', this.checked)">
        <span class="tgl-track"></span>
      </label>
    </div>`);
  }
  el.innerHTML = rows.join('');
}

// ═══════════════════════════════════════════════════════
// KI-COACH: SCHWEBENDE BUBBLE + RADIALMENÜ (Phase C)
// ═══════════════════════════════════════════════════════
const _AI_RADIAL_ITEMS = [
  { kind:'chat',     ico:'chatBubble', label:'KI-Chat' },
  { kind:'scan',      ico:'camera',    label:'Gerät scannen' },
  { kind:'training',  ico:'chart2',    label:'Trainingsanalyse' },
  { kind:'plan',      ico:'planAdd',   label:'Trainingsplan erstellen' },
  { kind:'workout',   ico:'bolt',      label:'Workout optimieren' },
  { kind:'progress',  ico:'trendUp',   label:'Fortschritt analysieren' },
  { kind:'settings',  ico:'gear',      label:'KI-Einstellungen' },
];
function _aibRender(){
  const b = document.getElementById('ai-bubble');
  if (b) b.innerHTML = '<img src="icon-192.png" alt="" aria-hidden="true">';
  const radial = document.getElementById('ai-radial');
  if (radial) radial.innerHTML = _AI_RADIAL_ITEMS.map(it => `
    <button type="button" class="ai-r-item" aria-label="${esc(it.label)}" onclick="aiRadialAction('${it.kind}')">
      ${ICO[it.ico]({s:19})}<span class="ai-r-lbl">${esc(it.label)}</span>
    </button>`).join('')
    // column-reverse: das LETZTE Kind steht oben — Kontingent-Kopf über den Pillen.
    + `<div class="ai-r-item ai-r-quota" id="ai-r-quota" role="status"></div>`;
  _aiQuotaRenderHead();
}

// ── KI-Kontingent (Monatslimit) ────────────────────────
// Der Worker liefert den Stand bei jeder KI-Antwort mit (aiCall speichert ihn),
// zusätzlich holt /quota ihn ohne Verbrauch — sonst wüsste die App den Stand erst,
// nachdem sie eine Anfrage ausgegeben hat.
let _aiQuotaTs = 0;
function _aiQuotaGet(){
  try {
    const q = JSON.parse(localStorage.getItem('gt_aiQuota') || 'null');
    return (q && typeof q.limit === 'number' && typeof q.used === 'number') ? q : null;
  } catch(_) { return null; }
}
async function aiQuotaRefresh(force){
  try {
    if (!isPremium()) return null;
    if (!force && Date.now() - _aiQuotaTs < 60000) return _aiQuotaGet();
    if (!(window.FB && window.FB.configured && _fbUser) || _fbUser.isAnonymous) return null;
    const idToken = await _fbUser.getIdToken();
    const res = await fetch(AI_WORKER_URL + '/quota', {
      method: 'POST',
      body: JSON.stringify({ idToken, jws: PREM.jws || null }),
    });
    const j = await res.json();
    if (j && j.quota) {
      try { localStorage.setItem('gt_aiQuota', JSON.stringify(j.quota)); } catch(_){}
      _aiQuotaTs = Date.now();
      _aiQuotaRenderHead();
      return j.quota;
    }
  } catch(_){}
  return null;
}
function _aiQuotaRenderHead(){
  const el = document.getElementById('ai-r-quota'); if (!el) return;
  const spark = ICO.sparkle({ s:13 });
  if (!isPremium()) {
    el.classList.remove('low');
    el.innerHTML = `<div class="ai-r-q-top">${spark}<span class="ai-r-q-lbl">${esc(tr('KI-Anfragen'))}</span></div>
      <div class="ai-r-q-sub">${esc(tr('Mit Premium freischalten'))}</div>`;
    return;
  }
  const q = _aiQuotaGet();
  if (!q || q.unlimited) {
    el.classList.remove('low');
    el.innerHTML = `<div class="ai-r-q-top">${spark}<span class="ai-r-q-lbl">${esc(tr('KI-Anfragen'))}</span>
        <span class="ai-r-q-val">${q ? '∞' : '—'}</span></div>
      <div class="ai-r-q-sub">${esc(q ? tr('Unbegrenzt') : tr('Stand wird geladen…'))}</div>`;
    return;
  }
  const left = Math.max(0, q.limit - q.used);
  const pct  = q.limit > 0 ? Math.max(0, Math.min(100, (left / q.limit) * 100)) : 0;
  el.classList.toggle('low', left <= Math.max(3, q.limit * 0.15));
  el.innerHTML = `<div class="ai-r-q-top">${spark}<span class="ai-r-q-lbl">${esc(tr('KI-Anfragen'))}</span>
      <span class="ai-r-q-val">${left}<i> / ${q.limit}</i></span></div>
    <div class="ai-r-q-bar"><div class="ai-r-q-fill" id="ai-r-q-fill"></div></div>
    <div class="ai-r-q-sub">${esc(left > 0 ? tr('übrig diesen Monat') : tr('Limit erreicht — Reset am Monatsanfang'))}</div>`;
  // Breite erst im nächsten Frame setzen, damit der Balken sichtbar hochläuft
  // statt fertig gefüllt aufzuploppen.
  requestAnimationFrame(() => { const f = document.getElementById('ai-r-q-fill'); if (f) f.style.width = pct + '%'; });
}
// Sichtbarer Bereich für Bubble/Menü: unter Statusleiste, über der Tab-Leiste,
// 12px Rand links/rechts. Tab-Leiste live gemessen (bewegt sich mit --sab).
function _aibSafeBounds(){
  const cs  = getComputedStyle(document.documentElement);
  const sat = parseFloat(cs.getPropertyValue('--sat')) || 0;
  const sab = parseFloat(cs.getPropertyValue('--sab')) || 0;
  const tabbar = document.querySelector('.tabbar');
  const tbTop  = tabbar ? tabbar.getBoundingClientRect().top : (window.innerHeight - 74 - sab);
  const top    = sat + 54;
  const bottom = Math.max(top + 60, tbTop - 6);
  return { top, bottom, left:12, right: window.innerWidth - 12 };
}
// Bubble ist fest rechts neben der (gestauchten) Tableiste angedockt (CSS) —
// kein Drag mehr, nur Tap → Menü auf/zu. gt_aiBubblePos wird nicht mehr genutzt.
// ── Radialmenü → vertikaler Stapel: klappt direkt über der Bubble nach oben raus,
// dockt an derselben Kante (links/rechts) wie die Bubble. Abgedunkelter Blur-Hintergrund
// sorgt dafür, dass die Pillen unabhängig vom Seiteninhalt gut lesbar bleiben.
let _aibOpenState = false;
function toggleAiRadial(){ _aibOpenState ? closeAiRadial() : openAiRadial(); }
function openAiRadial(){
  const b = document.getElementById('ai-bubble'); if (!b) return;
  const r = b.getBoundingClientRect();
  const side = (r.left + r.width / 2) < window.innerWidth / 2 ? 'l' : 'r';
  const bounds = _aibSafeBounds();
  const radial = document.getElementById('ai-radial');
  radial.dataset.side = side;
  radial.style.bottom = (window.innerHeight - r.top + 14) + 'px';
  radial.style.left  = side === 'l' ? '14px' : 'auto';
  radial.style.right = side === 'r' ? '14px' : 'auto';
  radial.style.maxWidth = (bounds.right - bounds.left) + 'px';
  _aiQuotaRenderHead();
  aiQuotaRefresh();                       // gedrosselt (60 s) und ohne Verbrauch
  const items = document.querySelectorAll('.ai-r-item');
  items.forEach((el, i) => { el.style.transitionDelay = (i * 28) + 'ms'; });
  document.getElementById('ai-radial-backdrop')?.classList.add('on');
  requestAnimationFrame(() => items.forEach(el => el.classList.add('on')));
  _aibOpenState = true;
  haptic(6);
}
function closeAiRadial(){
  document.querySelectorAll('.ai-r-item').forEach(el => { el.classList.remove('on'); el.style.transitionDelay = '0ms'; });
  document.getElementById('ai-radial-backdrop')?.classList.remove('on');
  _aibOpenState = false;
}
function aiRadialAction(kind){
  closeAiRadial();
  if (kind === 'settings') {
    openSettingsPage();
    setTimeout(() => { document.getElementById('prem-settings-body')?.scrollIntoView({behavior:'smooth', block:'start'}); }, 260);
    return;
  }
  if (!premGate(kind === 'scan' ? 'scan' : 'ai')) return;
  if (kind === 'chat')          openAiChat();
  else if (kind === 'scan')     openAiScan();
  else if (kind === 'plan')     openPlanWizard();
  else if (kind === 'training') openAiAnalyze('training');
  else if (kind === 'workout')  openAiAnalyze('workout');
  else if (kind === 'progress') openAiAnalyze('progress');
}
// ── Sichtbarkeit: aus während Onboarding/Login-Gate/offenem Sheet ──
function _aibSyncVisibility(){
  // Bubble verhält sich wie die Tableiste: bleibt bei offenen Sheets sichtbar
  // (Sheets liegen mit z-index 900 unter Tabbar 1000/Bubble 1060) — versteckt
  // wird sie nur im Onboarding und hinter dem Auth-Gate.
  const hide = document.getElementById('ob-screen')?.classList.contains('on')
            || document.getElementById('auth-gate')?.classList.contains('on');
  document.body.classList.toggle('ai-hidden', hide);
  // Modal-Sperre: offenes Sheet (außer aktives Training) → Tabbar + Bubble
  // durchgriffs-tot (CSS body.sheet-modal). Zentral hier, weil openOv/closeOv
  // beide am Ende _aibSyncVisibility() aufrufen.
  document.body.classList.toggle('sheet-modal', !!document.querySelector('.ov.on:not(#ov-wk)'));
  if (_aibOpenState && (hide || document.querySelector('.ov.on'))) closeAiRadial();
}
// Bubble-Durchmesser = gemessene Tableisten-Höhe (gleiche Unterkante per CSS-bottom):
// Bubble folgt damit auch dem tabbar--min-Schrumpfen beim Scrollen.
function _aibDock(){
  const b = document.getElementById('ai-bubble');
  const tb = document.querySelector('.tabbar');
  if (!b || !tb) return;
  const h = Math.round(tb.getBoundingClientRect().height);
  if (h > 0) {
    // Etwas kleiner als die Tableiste, dafür vertikal mittig zu ihr ausgerichtet
    const d = Math.round(h * 0.8);
    b.style.width = d + 'px'; b.style.height = d + 'px';
    b.style.bottom = 'calc(6px + var(--sab) + ' + Math.round((h - d) / 2) + 'px)';
  }
}
function _aibInit(){
  const b = document.getElementById('ai-bubble'); if (!b) return;
  // Auch die Vorlesehilfe soll den Namen nennen, nicht die Funktionsbezeichnung.
  try { b.setAttribute('aria-label', _coachName()); } catch(_) {}
  _aibRender();
  b.addEventListener('click', toggleAiRadial);
  ['ob-screen', 'auth-gate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) new MutationObserver(_aibSyncVisibility).observe(el, { attributes:true, attributeFilter:['class'] });
  });
  const tb = document.querySelector('.tabbar');
  // ResizeObserver statt MutationObserver: Tabbar-Höhe ändert sich beim
  // tabbar--min-Wechsel über eine .32s-CSS-Transition (Padding). ResizeObserver
  // feuert JEDEN gerenderten Zwischenframe dieser Animation, nicht nur einmal
  // beim Klassenwechsel — Bubble bleibt so während der ganzen Animation exakt
  // an der echten (gemessenen) Tableisten-Höhe angedockt, kein eigenes Timing/
  // keine eigene Transition nötig, die aus dem Tritt geraten könnte.
  if (tb && 'ResizeObserver' in window) new ResizeObserver(_aibDock).observe(tb);
  window.addEventListener('resize', _aibDock);
  _aibDock();
  setTimeout(_aibDock, 600);   // nach Font-/Layout-Settling nachmessen
  _aibSyncVisibility();
}

// ── KI-Chat ────────────────────────────────────────────
let _aicHist = (() => { try { const h = JSON.parse(localStorage.getItem('gt_aiChat')); return Array.isArray(h) ? h : []; } catch(_){ return []; } })();
let _aicBusy = false, _aicPlanPending = null;
let _coachLastUid;
function _aicPush(role, content){
  _aicHist.push({ role, content });
  if (_aicHist.length > 30) _aicHist = _aicHist.slice(-30);
  try { localStorage.setItem('gt_aiChat', JSON.stringify(_aicHist)); } catch(_){}
}
// Der Kopf des Chats traegt den Namen. Bewusst per textContent: das ist die eine
// Stelle, an der der entschaerfte Name doch noch als Markup landen koennte.
function _aicApplyName(){
  const nm = _coachName();
  const h = document.getElementById('aic-title');
  if (h) h.textContent = nm;
  const inp = document.getElementById('aic-in');
  // Platzhalter bleibt der alte, solange der Coach 'Coach' heisst.
  if (inp) inp.placeholder = (nm === 'Coach') ? tr('Frag deinen Coach…') : _cm('Frag ' + nm + '…', 'Ask ' + nm + '…');
}
function openAiChat(seed){
  openOv('ov-ai-chat');
  try { _aicApplyName(); } catch(_) {}
  _aicRenderLog();
  _aicRenderSugg();
  _aicMicInit();
  if (seed) {
    const inp = document.getElementById('aic-in');
    if (inp) inp.value = seed;
    setTimeout(() => aicSend(), 60);
  }
}
function _aicGrow(ta){ ta.style.height = 'auto'; ta.style.height = Math.min(110, ta.scrollHeight) + 'px'; }
// Mini-Markdown NACH esc(): nur **fett** + Listenpunkte — Text bleibt sicher escaped.
function _aicMd(t){
  return esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/^[-•] /gm, '· ');
}
function _aicRenderLog(){
  const log = document.getElementById('aic-log'); if (!log) return;
  if (!_aicHist.length) {
    log.innerHTML = `<div class="aic-msg aic-bot">${tr('Frag mich zu Übungen, Technik oder lass dir einen kompletten Trainingsplan erstellen.')}</div>`;
  } else {
    log.innerHTML = _aicHist.map(m =>
      `<div class="aic-msg ${m.role === 'user' ? 'aic-user' : 'aic-bot'}">${m.role === 'user' ? esc(m.content) : _aicMd(m.content)}</div>`).join('');
  }
  if (_aicPlanPending) log.innerHTML += `<button type="button" class="aic-plan-btn" onclick="aicApplyPlan()">${tr('Plan importieren')}</button>`;
  if (_aicBusy) log.innerHTML += `<div class="aic-typing"><span></span><span></span><span></span></div>`;
  log.scrollTop = log.scrollHeight + 999;
}
// Letzte Einheit < 6h her? Steuert, welche der drei Chip-Reihen erscheint —
// dieselbe Konvention wie anderswo im Code (S.sessions[length-1] = juengste
// Einheit, s. z. B. _relativeDate-Aufrufer), kein zusaetzliches Sortieren.
function _aicRecentSessionDone(){
  try {
    const last = S.sessions && S.sessions.length ? S.sessions[S.sessions.length - 1] : null;
    if (!last || !last.date) return false;
    const t = new Date(last.date).getTime();
    return isFinite(t) && (Date.now() - t) < 6 * 60 * 60 * 1000;
  } catch(e) { return false; }
}
function _aicRenderSugg(){
  const el = document.getElementById('aic-sugg'); if (!el) return;
  if (_aicHist.length) { el.innerHTML = ''; return; }
  // Drei Zustaende, drei Chips (Reihenfolge bindend, siehe Task-5-Brief). Die
  // ersten beiden jeder Reihe beantwortet der lokale Intent-Router
  // (js/coach-intent.js) kostenlos & offline, nur der dritte geht ans Modell.
  let sugg;
  try {
    sugg = isWorkoutActive()
        // Platz zwei ist bewusst NICHT "Wie soll ich mich aufwaermen?": s.warmupText
        // bleibt bis Block 3 ueberall leer, WARMUP_ONLY liefert also durchgehend
        // null und die Frage ginge ans Modell — derselbe Fall, den die Reihe
        // darunter schon vermeidet ("Wie lief die Einheit?"). "Wie viele Saetze
        // noch?" trifft den bestehenden setsLeft-Intent (braucht nur s.active) und
        // ist im laufenden Training praktisch immer beantwortbar. Sobald warmupText
        // in Block 3 befuellt wird, darf der Aufwaerm-Chip zurueck auf Platz zwei.
      ? ['Was ist mein nächster Satz?', 'Wie viele Sätze noch?', 'Alternative zu dieser Übung']
      : _aicRecentSessionDone()
        // "Wie lief die Einheit?" steht bewusst auf Platz DREI statt eins: der
        // Router hat keinen Intent fuer die zuletzt beendete Einheit (nur einen
        // gestern-spezifischen), die Frage geht also ans Modell. Auf Platz eins
        // steht deshalb die Volumenfrage, die der Router lokal beantwortet —
        // sonst waere in dieser Reihe nur ein Chip kostenlos statt zwei.
        ? ['Wie viel Volumen diese Woche?', 'Wie lang ist meine Streak?', 'Wie lief die Einheit?']
        : ['Was steht als Nächstes an?', 'Wie viele Trainings diese Woche?', 'Erstelle mir einen Trainingsplan'];
  } catch(e) { sugg = ['Was steht als Nächstes an?', 'Wie viele Trainings diese Woche?', 'Erstelle mir einen Trainingsplan']; }
  // data-sg="<index>": der Text kommt beim Klick aus DIESEM Array, nie aus dem
  // DOM zurueckgelesen — der alte onclick-String baute Text ins Attribut und
  // waere eine Injektionsstelle, sobald dort mal ein Uebungsname landet.
  el.innerHTML = sugg.map((s, i) => `<button type="button" data-sg="${i}">${esc(tr(s))}</button>`).join('');
  el.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => {
      const ta = document.getElementById('aic-in');
      if (ta) ta.value = sugg[Number(btn.dataset.sg)];
      aicSend();
    };
  });
}

// ── Coach-Gedaechtnis: Bruecke zwischen App-Zustand und den Coach-Einheiten ──
// Das Dossier liegt uid-gekoppelt in localStorage, NICHT in S: Abmelden laesst
// S bewusst stehen, sonst laese das naechste Konto auf diesem Geraet die
// Einschraenkungen des vorigen.
let _dossierPushT = null;
let _dossierPushFn = null;   // fest an den geplanten Push gebundener Aufruf, fuer Sofort-Flush
// Dirty-Marker fuer eine noch NICHT bestaetigt gepushte Dossier-Aenderung.
// PERSISTENT statt reiner In-Memory-Variable (Review Fix 1): iOS friert die
// _dossierPush-Anfrage beim Backgrounden oft mitten im setDoc-Await ein —
// Firestore laeuft hier mit dem Default-Memory-Cache (getFirestore(app) oben,
// keine persistentLocalCache/IndexedDb-Persistenz), die Mutation stirbt mit
// dem Prozess. Eine reine JS-Variable stuende beim naechsten Start wieder auf
// null, obwohl die Aenderung nie in der Cloud ankam — ein Logout direkt danach
// wuerde sie dann faelschlich als "bestaetigt" behandeln und loeschen.
// Schluessel ist uid-gebunden wie der Dossier-Schluessel selbst (derselbe
// Grund: Logout laesst lokale Daten bewusst stehen, s.o.). Wert ist NICHT die
// uid, sondern der updatedAt-Zeitstempel GENAU der Aenderung, die noch
// aussteht (Review Fix 2): ein Konto matcht immer, eine Aenderung nicht —
// sonst loescht ein bestaetigter Push von d1 den Marker auch dann, wenn
// zwischenzeitlich schon d2 geplant wurde. dossierApplyDelta setzt updatedAt
// auf jede Aenderung, das macht es zum eindeutigen Vergleichswert.
function _dossierDirtyKey(uid){ return 'gt_coachDirty:' + uid; }
function _dossierMarkDirty(uid, updatedAt){
  try { localStorage.setItem(_dossierDirtyKey(uid), String(updatedAt)); } catch(_) {}
}
// Loescht den Marker nur, wenn er noch exakt zu der Aenderung gehoert, die
// gerade bestaetigt gepusht wurde — eine inzwischen geplante neuere Aenderung
// (anderer updatedAt-Wert) bleibt als offen markiert.
function _dossierMarkClean(uid, updatedAt){
  try { if (localStorage.getItem(_dossierDirtyKey(uid)) === String(updatedAt)) localStorage.removeItem(_dossierDirtyKey(uid)); } catch(_) {}
}
function _dossierIsDirty(uid){
  try { return localStorage.getItem(_dossierDirtyKey(uid)) != null; } catch(_) { return false; }
}
function _coachUid(){ return (_fbUser && !_fbUser.isAnonymous) ? _fbUser.uid : null; }
function _dossier(){ return window.CoachMemory.dossierLoad(localStorage, _coachUid()); }
function _dossierSet(d){
  const uid = _coachUid(); if (!uid) return;
  window.CoachMemory.dossierSave(localStorage, uid, d);
  _dossierMarkDirty(uid, d.updatedAt);
  if (_dossierPushT) clearTimeout(_dossierPushT);
  // uid wird HIER gebunden (Closure-Parameter), nicht in _dossierPush per
  // _coachUid() neu ermittelt — sonst kann waehrend der 4s-Debounce ein
  // Konto-Wechsel dazu fuehren, dass das Dossier von Konto A unter dem
  // Dokument von Konto B landet (Review Kritisch 1).
  _dossierPushFn = () => _dossierPush(uid, d);
  _dossierPushT = setTimeout(() => { _dossierPushT = null; _dossierPushFn = null; _dossierPush(uid, d); }, 4000);
}
// Task 9: EIN Journal-Eintrag raus. Baut ausschliesslich auf _dossier() und
// _dossierSet() auf — kein zweiter Firestore-Schreibweg: _dossierSet() setzt den
// Dirty-Marker und plant den bestehenden gedrosselten Push (4 s) selbst.
// 'goal' ist EIN Wert, keine Liste (Whitelist im Modul); der Index bleibt in der
// Signatur, damit der Aufrufer im Journal nicht zwei Wege kennen muss.
function _dossierRemove(group, index){
  try {
    const d = _dossier();
    if (group === 'goal') {
      if (!d.goal) return;
      d.goal = null;
    } else {
      if (['limits','prefs','works'].indexOf(group) < 0) return;
      const list = Array.isArray(d[group]) ? d[group] : [];
      const i = Number(index);
      if (!(i >= 0 && i < list.length)) return;
      list.splice(i, 1);
      d[group] = list;
    }
    // Der Dirty-Marker haengt an genau diesem updatedAt — ohne neuen Wert wuerde
    // ein spaeter bestaetigter Push die falsche Aenderung als erledigt abhaken.
    d.updatedAt = Date.now();
    _dossierSet(d);
    try { if (typeof haptic === 'function') haptic(8); } catch(_) {}
    try { renderCoachHub(); } catch(_) {}
  } catch(e) { console.warn('[Coach] Dossier-Eintrag entfernen:', e); }
}
// Sofort-Flush eines noch ausstehenden Pushs — gleiches Muster wie
// _updateWidgetData(immediate)/_pushWidgetData (iOS friert JS beim
// Verstecken/Verlassen der App ein, ein 4s-Debounce wuerde sonst nie feuern).
function _dossierFlush(){
  if (!_dossierPushT) return;
  clearTimeout(_dossierPushT); _dossierPushT = null;
  const fn = _dossierPushFn; _dossierPushFn = null;
  if (fn) fn();
}
// Review Fix 1: erneuter Versuch, falls eine fruehere Aenderung nie bestaetigt
// gepusht wurde (z. B. App-Kill mitten im setDoc-Await beim letzten Start —
// ohne Firestore-Offline-Persistenz sonst nicht wiederherstellbar). Kein
// neuer Debounce-Timer, direkter Versuch; _dossierPush prueft uid/Firebase-
// Status ohnehin selbst, ein doppelter Versuch ist also gefahrlos.
// uid kommt optional als Parameter (Aufruf aus _dossierPull waehrend des
// Logins, BEVOR _fbUser gesetzt ist — s. Kommentar dort). Ohne den Parameter
// faellt die Funktion auf _coachUid() zurueck, das braucht der Aufruf bei
// visibilitychange:visible weiter unten, dort ist _fbUser laengst gesetzt.
// Explizit ueber die uid laden statt _dossier()/_coachUid() zu benutzen: ein
// Aufruf mit uid, aber (noch) leerem globalen _fbUser wuerde sonst ueber
// _dossier() ein LEERES Dossier laden und dieses leere Dossier dann in die
// Cloud pushen — derselbe Datenverlust wie der urspruengliche Pull-Bug, nur
// mit anderem Ausloeser.
function _dossierRetryIfDirty(uid){
  if (_dossierPushT) return;   // schon ein frischer Push geplant - der erledigt es ohnehin gleich
  uid = uid || _coachUid(); if (!uid || !_dossierIsDirty(uid)) return;
  try { _dossierPush(uid, window.CoachMemory.dossierLoad(localStorage, uid)); } catch(_) {}
}
async function _dossierPush(uid, d){
  if (!uid || !window.FB || !window.FB.configured) return;
  // Zweite Absicherung zusaetzlich zur gebundenen uid oben: hat sich das
  // angemeldete Konto seit dem Planen geaendert, wird gar nicht erst
  // versucht zu schreiben (Firestore-Rules wuerden es ohnehin ablehnen,
  // aber so bleibt auch kein unnoetiger permission-denied-Log stehen).
  if (_coachUid() !== uid) return;
  // Kein Dossier-Inhalt ins Log — nur der Fehlercode.
  try {
    await window.FB.setDoc(window.FB.doc('users/' + uid + '/coach', 'dossier'), d, { merge: false });
    _dossierMarkClean(uid, d.updatedAt);
  }
  catch(e) { console.warn('[Coach] Dossier-Push fehlgeschlagen:', (e && e.code) || ''); }
}
// Gegenstueck zum Push: ohne diesen Zug waere das Dossier nach einem
// Geraetewechsel oder einer Neuinstallation weg, obwohl es in der Cloud liegt.
// Die neuere Seite gewinnt — lokal ist waehrend einer Sitzung aktueller,
// die Cloud nach einem Wechsel.
// uid kommt als Parameter vom Aufrufer (_coachHandleAuthUser), NICHT mehr aus
// _coachUid()/_fbUser: _coachHandleAuthUser laeuft laut Aufrufreihenfolge in
// _onLogin/onAuthStateChanged IMMER VOR der Zeile, die _fbUser setzt. Frueher
// las _dossierPull deshalb bei jedem Kaltstart/Kontowechsel _coachUid() ->
// null (oder die uid des vorigen Kontos), der Guard griff, und die Funktion
// tat gar nichts — das lokal-nach-Neuinstallation-leere Dossier wurde nie
// mit der Cloud abgeglichen. Naechster Schreibzugriff (dossierApplyDelta auf
// dem leeren lokalen Stand, dann _dossierPush mit merge:false) hat dann den
// kompletten Cloud-Dossier-Doc ueberschrieben und alle bisherigen
// Einschraenkungen geloescht, ohne dass der Nutzer je etwas davon sah.
async function _dossierPull(uid){
  if (!uid || !window.FB || !window.FB.configured) return;
  // Review Fix 1: laeuft bei jedem Login/Kontowechsel — genau der richtige
  // Moment, um eine vom letzten App-Kill verwaiste, nie bestaetigte Aenderung
  // nachzuholen, bevor unten der Cloud-Stand gelesen wird. uid explizit
  // durchreichen (nicht ueber _coachUid() neu ermitteln) — s. Kommentar bei
  // _dossierRetryIfDirty.
  _dossierRetryIfDirty(uid);
  try {
    const snap = await window.FB.getDoc(window.FB.doc('users/' + uid + '/coach', 'dossier'));
    if (!snap || !snap.exists()) return;
    const cloud = snap.data() || {};
    const lokal = window.CoachMemory.dossierLoad(localStorage, uid);
    if ((cloud.updatedAt || 0) > (lokal.updatedAt || 0)) {
      // Cloud-Inhalt ist fremd (alter Client, manuell editiertes Dokument) —
      // genau wie beim lokalen Laden ueber dossierLoad sanitisieren, statt
      // roh in localStorage zu uebernehmen (Review Minor: nur der Lesepfad
      // filterte bisher). Ein winziges Fake-Store-Objekt laesst dossierLoad
      // die vorhandene Sanitisierung uebernehmen, ohne sie zu duplizieren.
      const fakeStore = { getItem: () => JSON.stringify(cloud), setItem(){}, removeItem(){} };
      window.CoachMemory.dossierSave(localStorage, uid, window.CoachMemory.dossierLoad(fakeStore, uid));
    }
  } catch(e) { console.warn('[Coach] Dossier-Pull fehlgeschlagen:', (e && e.code) || ''); }
}
/* ══ DATENTRENNUNG (Task 22): was der Kontowechsel mitnimmt ════════════════
   Der Coach sammelt inzwischen Persoenliches: den Namen, den er traegt, den
   Erzaehlbogen der laufenden Einheit, die Meldungs-Zaehler und die Zahlen der
   letzten acht Wochen. Nichts davon darf in die naechste Sitzung durchsickern
   — ein Coach, der das neue Konto mit dem Namen des vorigen begruesst oder
   dessen Einschraenkung zitiert, ist ein Vertrauensbruch, der sich nicht
   reparieren laesst.

   Was hier NICHT steht und warum:
   - Das DOSSIER. Es liegt uid-gekoppelt in localStorage und wird vom Aufrufer
     (_coachHandleAuthUser) gezielt fuer die ALTE uid geraeumt, sobald der
     letzte Push bestaetigt war. Pauschal loeschen wuerde eine gerade
     eingetragene, nie gepushte Einschraenkung verlieren — und beim Rueckweg
     auf Konto A holt _dossierPull() den Stand ohnehin aus der Cloud.
   - S.sessions/S.exercises. Die Trainingsdaten bleiben auf dem Geraet; genau
     das verspricht die Rueckfrage beim Abmelden.

   Reihenfolge und Bauart:
   - JEDER Schritt einzeln in try/catch. Ein Fehler darf weder den
     Kontowechsel noch den App-Start abbrechen — aber eine Trennung, die still
     fehlschlaegt, ist schlimmer als ein sichtbarer Fehler. Darum sammelt
     schritt() jeden Fehlschlag, die Funktion gibt die Liste zurueck, und der
     Aufrufer meldet sie laut (console.error + Hinweis auf dem Bildschirm).
   - Geschrieben wird mit persist(). Die Kurzform ohne Praefix existiert in
     dieser Datei NICHT, wuerde einen ReferenceError werfen und im try/catch
     STILL sterben — der Zustand des vorigen Kontos ueberlebte dann den
     naechsten Start.
   - Die geplanten Meldungen (47000-47999) raeumt _coachDropOwnNotifs() ab.
     Das ist der einzige asynchrone Teil; der Abmelde-Pfad ist synchron und
     wartet auf nichts. Seit der Abschluss-Review von Block 5 laeuft er aber
     nicht mehr NEBEN _cnSync(), sondern ueber _cnEnqueue() in DERSELBEN
     Warteschlange — und der Zaehler _coachGen sagt jedem laufenden Lauf, dass
     das Konto unter ihm gewechselt hat. Siehe den Kommentar bei _cnLauf.     */
function _coachWipeLocal(){
  const fehler = [];
  const schritt = (name, fn) => { try { fn(); } catch(e) { fehler.push(name + ': ' + ((e && e.message) || e)); } };

  /* Als ALLERERSTES und ausserhalb von schritt(): der Zaehler muss auch dann
     hochgehen, wenn gleich ein Schritt wirft. Er ist das Merkmal, an dem ein
     laufender _cnSyncRun/_crBuildRun erkennt, dass sein Zustand dem vorigen
     Konto gehoert — ohne ihn schreibt so ein Lauf die Zaehler von Konto A
     nach der Raeumung wieder herein (Abschluss-Review Block 5, Kritisch 1). */
  _coachGen++;
  // Und die Berichts-Kette kappen: ein neuer _crBuild() soll nicht hinter dem
  // Lauf des vorigen Kontos warten. Der alte Lauf selbst laeuft aus und
  // schreibt wegen _coachGen nichts mehr.
  _crLauf = null;

  // 1. Persona zurueck auf die Voreinstellung. preset fehlt in der Fabrik und
  //    bleibt damit undefined: das naechste Konto durchlaeuft die Einrichtung
  //    neu und entscheidet selbst ueber den Umfang.
  schritt('Persona', () => { S.aiCoach = _coachPersonaDefaults(); });

  // 2. Erzaehlbogen der laufenden Einheit — das Feld UND jede Laufzeitspur.
  //    Ohne die Laufzeitvariablen zaehlte der Bogen des vorigen Kontos im
  //    naechsten Training weiter (Obergrenze, angesagte Uebungen, Bilanzzeile).
  schritt('Erzaehlbogen', () => {
    S.coachSession = null;
    if (_csSaveTmr) { clearTimeout(_csSaveTmr); _csSaveTmr = null; }
    _csLastExId = null; _csSeenEx = null; _csSeenSets = null;
    _csSeqAt = 0; _csRestPlan = 0; _csSaveTs = 0; _csFinalLine = ''; _csLastSetTs = 0;
    // Die gesammelten Einschaetzungen gehen NICHT ins Dossier (_rpeFlushTrend
    // bleibt bewusst aus): der Schreibweg zeigte auf die uid des vorigen
    // Kontos und wuerde das gerade geraeumte Dossier neu anlegen.
    _rpeAnswers = [];
    _coachState = _coachDefaultState();
    try { _coachClearCard(); } catch(_) { _coachCard = null; }
    try { Object.keys(_coachEvalTimers || {}).forEach(k => clearTimeout(_coachEvalTimers[k])); } catch(_) {}
    _coachEvalTimers = {};
    if (_coachBarMsgTimer) { clearTimeout(_coachBarMsgTimer); _coachBarMsgTimer = null; }
    _coachBarState  = { mode:'idle', msg:'' };
    _coachMicroLast = null;
  });

  // 3. Meldungs-Zustand. Der Plan wird VOR dem Nullen gerettet: er ist die
  //    zweite Quelle fuer _cnCancelOwn(), falls getPending() nichts liefert.
  let altPlan = [];
  schritt('Meldungen', () => {
    altPlan = (S.coachPush && Array.isArray(S.coachPush.plan)) ? S.coachPush.plan.slice() : [];
    S.coachPush = null;
  });

  // 4. Wochenberichte und Termin. Die Berichte tragen die Zahlen des vorigen
  //    Kontos — Volumen, Saetze, Bestwerte.
  schritt('Wochenberichte', () => {
    S.coachReports  = [];
    S.coachReportAt = _coachReportAtDefault();
  });

  // 5. Aktions-Log. Stand bis Task 22 direkt in _coachHandleAuthUser; es
  //    gehoert an dieselbe Stelle wie der uebrige Zustand. Enthaelt nur
  //    {ts,kind,exId,accepted} — keine Gesundheitsdaten, aber Konto A's
  //    Dismiss-Historie throttelte sonst den Live-Coach von Konto B, und
  //    Konto A's muted-Liste ginge unter Konto B an den /coach-Payload raus.
  schritt('Aktions-Log', () => { S.coachLog = []; });

  /* 6. Chatverlauf. Liegt nicht in S, sondern unter gt_aiChat.
        _aicPlanPending gehoert dazu: es haelt den zuletzt vorgeschlagenen
        Trainingsplan, und der Knopf "Plan importieren" in _aicRenderLog()
        haengt allein daran. Ohne das Nullen liest Konto B nicht nur die
        Unterhaltung von Konto A weiter (das Blatt bleibt beim Auth-Wechsel
        offen), es kann dessen Plan ueber aicApplyPlan() in SEIN Konto
        uebernehmen. Gezeichnet wird in Schritt 10 — _coachOptRender() ruft
        seit der Abschluss-Review auch _aicRenderLog(). */
  schritt('Chatverlauf', () => {
    _aicHist = []; _aicPlanPending = null; localStorage.removeItem('gt_aiChat');
  });

  /* 6b. Analyse-Blatt. _aiaActions traegt die uebernehmbaren Vorschlaege der
        letzten Auswertung (Uebung + Split), _aiaScope den analysierten Split —
        dieselbe Luecke wie beim Plan, nur ueber _aiaApply(). Der Inhalt des
        Blattes wird mitgenommen: er nennt Zahlen und Uebungsnamen von Konto A
        und wird sonst von niemandem neu gezeichnet. */
  schritt('Analyse', () => {
    _aiaActions = []; _aiaScope = null;
    const el = document.getElementById('aia-body'); if (el) el.innerHTML = '';
  });

  // 7. Kontingent-Anzeige. Der gemerkte Stand gehoert dem vorigen Konto; ohne
  //    das Raeumen zeigte das Radialmenue dessen Restanfragen, bis der naechste
  //    /quota-Aufruf durch ist.
  schritt('Kontingent', () => { _aiQuotaTs = 0; localStorage.removeItem('gt_aiQuota'); });

  // 8. Oberflaeche auf Anfang: der Hub darf nicht auf der Kachel "Woche" stehen
  //    bleiben — Konto B landete sonst direkt in fremden Zahlen.
  schritt('Hub', () => {
    _chOpen = ''; _chResetScroll = true;
    // Auch die Zieleingabe und ihr Hinweis gehoerten dem vorigen Konto.
    _chGoalOpen = false; _chGoalEx = ''; _chGoalHint = '';
    try { _chWeekDestroy(); } catch(_) {}
    _chWeekCfg = null;
  });

  // 9. Schreiben. persist(), nicht save().
  schritt('persist', () => { persist(); });

  /* 9b. Und den Cloud-Anstoss, den persist() eben gesetzt hat, wieder
        abbestellen. Der Debounce-Timer feuert 800 ms spaeter — beim
        Kontowechsel also womoeglich erst, wenn _fbUser schon das NEUE Konto
        traegt. Er schriebe dann den geraeumten Zustand (unter anderem die
        leere Persona-Voreinstellung) in das Dokument von Konto B, bevor
        _onLogin() dessen Cloud-Stand ueberhaupt gelesen hat — und die Persona,
        die dort steht, waere weg. Die Datentrennung ist eine LOKALE Trennung;
        sie schreibt nichts in die Cloud. Beim Abmelden greift zusaetzlich, dass
        _onLogout() _fbUser sofort auf null setzt. */
  schritt('Cloud-Anstoss', () => { if (_pushTimer) { clearTimeout(_pushTimer); _pushTimer = null; } });

  // 10. Bild nachziehen — die Heute-Karte traegt den Coach-Namen.
  schritt('Rendern', () => { _coachOptRender(); });

  // 11. Geplante Meldungen. Asynchron, blockiert nichts.
  try { _coachDropOwnNotifs(altPlan); }
  catch(e) { fehler.push('Meldungen abbestellen: ' + ((e && e.message) || e)); }

  if (fehler.length) _coachWipeFailed(fehler);
  return fehler;
}

/* Geplante Meldungen des vorigen Kontos verwerfen. Gefiltert wird strikt auf
   47000-47999 ueber _cnCancelOwn() — ein pauschales cancel() raeumte den
   Pausen-Timer (2500) mit ab. Danach EINMAL scheduleWorkoutNotifications():
   S.coachPush steht auf null, der Coach besitzt die Trainings-Erinnerung also
   nicht mehr, und die generische Planung (1000-1999) holt sich ihren Platz
   zurueck — sofern der Schalter dafuer ueberhaupt an ist.

   Nachgesehen statt geglaubt: _cnCancelOwn() meldet seinen Fehler jetzt zurueck
   (es schluckte ihn frueher selbst). Bleibt danach auch nur EIN 47xxx-Termin
   stehen, meldet sich der Coach des Vorbesitzers auf dem Sperrbildschirm des
   neuen Kontos — das muss laut sein.

   Und wenn die Nachkontrolle selbst nicht durchkommt (Plugin-Fehler, App im
   Hintergrund), ist das KEIN stiller Erfolg: dann ist ungeprueft, ob das
   Abbestellen ueberhaupt angekommen ist. Frueher stand hier ein blankes
   return {ok:false} ohne Konsole und ohne Bildschirm (Abschluss-Review Block 5,
   Wichtig 2).

   Der Lauf haengt ueber _cnEnqueue() in der _cnSync()-Kette: er beginnt erst,
   wenn ein laufender _cnSyncRun fertig ist. Sonst raeumt er ab, waehrend dessen
   LN.schedule() noch unterwegs ist — und die 47xxx stehen danach wieder. */
function _coachDropOwnNotifs(altPlan){
  return _cnEnqueue(async () => {
    const LN = _cap('LocalNotifications');
    if (!LN) return { ok:true, rest:0 };            // Web-PWA: kein Zustellweg
    const abbestellFehler = await _cnCancelOwn(LN, altPlan || []);
    try { await scheduleWorkoutNotifications(); } catch(_) {}
    let lesefehler = null;
    const pend = await LN.getPending().catch(e => { lesefehler = (e && e.message) || e; return null; });
    if (!pend) {
      _coachWipeFailed(['Meldungen: der Bestand liess sich nicht nachlesen (' +
        (lesefehler || 'kein Ergebnis') + ') — ob die Termine des vorigen Kontos abbestellt sind, ist ungeprueft']
        .concat(abbestellFehler ? [abbestellFehler] : []));
      return { ok:false, rest:-1 };
    }
    const rest = (((pend && pend.notifications) || []))
      .filter(n => Number(n && n.id) >= CN_ID_BASE && Number(n && n.id) <= CN_ID_MAX).length;
    // Ein Fehler beim Abbestellen ist nur dann einer, wenn danach auch wirklich
    // etwas stehen geblieben ist — sonst waere es ein Alarm ohne Schaden.
    if (rest > 0) _coachWipeFailed(['Meldungen: ' + rest + ' Termin(e) im Bereich 47000-47999 stehen noch']
      .concat(abbestellFehler ? [abbestellFehler] : []));
    return { ok: rest === 0, rest: rest };
  }).catch(e => {
    _coachWipeFailed(['Meldungen abbestellen: ' + ((e && e.message) || e)]);
    return { ok:false, rest:-1 };
  });
}

/* Ein Scheitern der Trennung bleibt nicht unbemerkt: in die Konsole als
   FEHLER (nicht als Warnung — der Rest der Datei nutzt console.warn fuer
   Erwartbares) und einmal sichtbar auf den Bildschirm. Der Hinweis nennt die
   einzige Handlung, die hilft, und keine Einzelheit des vorigen Kontos.       */
function _coachWipeFailed(fehler){
  try { console.error('[Coach] Datentrennung unvollstaendig:', (fehler || []).join(' | ')); } catch(_) {}
  try {
    _dndToast(_cm('Der Coach konnte nicht vollständig zurückgesetzt werden — bitte die App neu starten.',
                  'The coach could not be reset completely — please restart the app.'));
  } catch(_) {}
}

// Kontowechsel-Erkennung fuer den Coach: NICHT nur an onAuthStateChanged
// haengen (Review Fix 4) — Apple/Google natives Sign-In ruft _onLogin(user)
// direkt auf, WEIL onAuthStateChanged in der WKWebView nicht zuverlaessig
// feuert (s. Kommentar bei _onLogin weiter unten). Ohne diesen Aufruf an
// beiden nativen Einstiegspunkten bleiben ausstehender Push-Timer,
// Chatverlauf, _coachLastUid und _dossierPull() auf dem alten Konto stehen,
// wenn der Nutzer per Apple/Google direkt das Konto wechselt.
function _coachHandleAuthUser(user){
  try {
    const neu = (user && !user.isAnonymous) ? user.uid : null;
    if (_coachLastUid !== undefined && _coachLastUid !== neu) {
      // Der gesamte NICHT uid-gebundene Coach-Zustand an EINER Stelle
      // (Task 22): Persona, Erzaehlbogen, Meldungen, Wochenberichte,
      // Aktions-Log, Chatverlauf. Das uid-gebundene Dossier bleibt unten.
      _coachWipeLocal();
      // Ausstehenden Debounce-Timer kappen: er darf nie unter einem fremden
      // Konto feuern (Review Kritisch 1). _dossierPush prueft die uid beim
      // Feuern zwar zusaetzlich, aber der Timer soll erst gar nicht mehr
      // versuchen zu schreiben, sobald das Konto gewechselt hat.
      if (_dossierPushT) { clearTimeout(_dossierPushT); _dossierPushT = null; _dossierPushFn = null; }
      // Lokales Dossier des alten Kontos nur loeschen, wenn der letzte Push
      // bestaetigt war — sonst geht eine gerade erst eingetragene, nie
      // gepushte Einschraenkung verloren (Review Wichtig 2).
      if (_coachLastUid && !_dossierIsDirty(_coachLastUid)) {
        window.CoachMemory.dossierClear(localStorage, _coachLastUid);
      }
    }
    _coachLastUid = neu;
    // neu explizit durchreichen statt _dossierPull() ueber _coachUid()/_fbUser
    // raten zu lassen — _fbUser ist an dieser Stelle (Aufruf VOR _onLogin,
    // s. Kommentar oben) noch nicht gesetzt, die uid aus dem user-Argument
    // hier ist die einzige verlaessliche Quelle.
    if (neu) _dossierPull(neu);
  } catch(_) {}
}
// Schnappschuss fuer den Intent-Router. Bewusst hier gebaut statt im Router,
// damit der Router nicht an interne App-Strukturen gebunden ist.
function _coachSnap(){
  // unit: einzige Einheiten-Info, die js/coach-intent.js bekommt (Blockab-
  // schluss-Review Block 0, Befund 3). Das Modul kennt S/S.unitMode nicht und
  // rechnet selbst nichts um — alle Zahlen, die den Router unten erreichen,
  // muessen deshalb schon als fertige Anzeigewerte in DIESER Einheit vorliegen
  // (kgToDisp()/unitLabel() liegen nur hier, nicht im Modul). Direkt am
  // Wert-Objekt gesetzt statt in try{}, damit es auch bei einem fruehen Wurf
  // unten immer vorhanden ist.
  //
  // lang: dasselbe Muster fuer die Antwortsprache (Router-i18n). Das Modul
  // kennt localStorage/GT_LANG nicht und liest es nicht selbst — GT_LANG ist
  // hier schon aus 'auto' aufgeloest (siehe Konstante oben in dieser Datei),
  // s.lang bekommt also nie den Rohwert aus localStorage['gt_lang'].
  const snap = { exercises: [], bestSet: {}, lastDone: {}, recovery: {},
                 unit: (S.unitMode === 'lbs' ? 'lbs' : 'kg'),
                 lang: (GT_LANG === 'en' ? 'en' : 'de') };
  try {
    snap.exercises = (S.exercises || []).map(e => ({ id: e.id, name: e.name, muscleGroup: e.muscleGroup }));
    (S.sessions || []).forEach(s => {
      (s.logs || []).forEach(l => {
        const best = (l.sets || []).filter(x => x.type !== 'warmup')
          .sort((a,b) => (parseFloat(b.w)||0) - (parseFloat(a.w)||0))[0];
        if (!best) return;
        const w = parseFloat(best.w) || 0;
        const cur = snap.bestSet[l.exerciseId];
        if (!cur || w > cur.w) snap.bestSet[l.exerciseId] = { w, r: parseInt(best.r) || 0, date: s.date };
        if (!snap.lastDone[l.exerciseId] || s.date > snap.lastDone[l.exerciseId]) snap.lastDone[l.exerciseId] = s.date;
      });
    });
    const rec = getMuscleGroupRecovery();
    MUSCLE_GROUPS.forEach(mg => { if (rec[mg.id]) snap.recovery[muscleLabel(mg.id)] = rec[mg.id].recPct; });
    if (typeof wkLogs !== 'undefined' && Array.isArray(wkLogs) && wkLogs.length) {
      const cur = wkLogs.find(l => (l.sets || []).some(x => !x.done)) || wkLogs[0];
      if (cur) {
        const done = (cur.sets || []).filter(x => x.done).length;
        const nxt  = (cur.sets || []).find(x => !x.done);
        snap.active = { exId: cur.exerciseId, setsTotal: (cur.sets || []).length, setsDone: done,
                        nextW: nxt ? (parseFloat(nxt.w) || null) : null };
        // Naechster Satz als ganzer Satz (Menge + Gewicht + Wdh). Bewusst aus
        // den bereits eingetragenen Werten der Satzzeile, nicht neu gerechnet —
        // so sagt der Chat exakt das, was im Training auch dransteht.
        if (nxt) {
          const exN  = (exById(cur.exerciseId) || {}).name || '';
          const left = (cur.sets || []).filter(x => !x.done).length;
          const w = parseFloat(nxt.w), r = parseInt(nxt.r);
          // Zweisprachig ueber _cm(): der Router reicht dieses Feld unveraendert
          // durch (es ist fertiger Text, kein Baustein), die Sprache muss also
          // schon HIER entschieden werden — sonst antwortet der Router auf eine
          // englische Frage englisch und nur dieser eine Satz bliebe deutsch.
          snap.nextSetText = (exN ? exN + ': ' : '')
            + _cm('noch ' + left + (left === 1 ? ' Satz' : ' Sätze'),
                  left + (left === 1 ? ' set' : ' sets') + ' to go')
            + (isFinite(w) && w > 0 ? ', ' + kgToDisp(w) + ' ' + unitLabel() : '')
            + (isFinite(r) && r > 0 ? _cm(' mal ' + r + ' Wiederholungen', ' for ' + r + ' reps') : '') + '.';
        }
        if (cur.ssGroup) {
          const p = wkLogs.find(l => l !== cur && l.ssGroup === cur.ssGroup);
          const pn = p ? (exById(p.exerciseId) || {}).name : '';
          if (pn) snap.supersetText = _cm('Supersatz mit ' + pn + '.', 'Superset with ' + pn + '.');
        }
      }
    }
    // Laufende Restpause: gleiche Bedingung wie anderswo im Code (_updateLiveActivity) —
    // _restInt ist nur waehrend eines aktiven Pausen-Countdowns gesetzt.
    if (_restInt !== null && _restSecs > 0) snap.restLeftSec = _restSecs;
    // Wochenvolumen aus derselben Quelle wie die Statistik (_weekStats), damit
    // Chat-Antwort und angezeigte Zahl nie auseinanderlaufen.
    try { snap.weekVolumeKg = _weekStats().vol; } catch(_) {}
    const t = _coachTodaySuggestion(); if (t) snap.todayText = t.text;

    // --- Felder fuer die elf zusaetzlichen Router-Fragen (Plan v2, Task 3) ---
    // Jede Quelle in ihrem eigenen try: faellt eine aus, fehlen nicht gleich
    // alle folgenden Felder. Ein fehlendes Feld bleibt undefined — der Router
    // liest das als "keine Antwort" und gibt die Frage ans Modell ab. Ein
    // geratener Wert waere eine Falschaussage und teurer als jeder Aufruf.
    // snap.warmupText: seit Block 3 gefuellt. Zahlen aus CoachWarmup, Raster und
    // Stange aus den Geraeteeinstellungen (_csEquip), Einheit wie in der App
    // (_csWarmupText rechnet fuer lbs um — das Modul schreibt fest "kg").
    try {
      const wL = (Array.isArray(wkLogs) && wkLogs.length)
        ? (wkLogs.find(l => (l.sets || []).some(x => !x.done)) || wkLogs[0]) : null;
      const wEx = wL ? exById(wL.exerciseId) : null;
      if (wEx && wEx.targetType !== 'time') {
        const wKg = getSuggestedWeight(wEx) || _csLastKgFor(wEx.id);
        const eq = _csEquip(wEx);
        const wTxt = _csWarmupText(window.CoachWarmup.warmupSets(Number(wKg), { step: eq.step, barKg: eq.barKg }));
        if (wTxt) snap.warmupText = _cm('Aufwärmen für ' + wEx.name + ': ' + wTxt + '.',
                                        'Warm-up for ' + wEx.name + ': ' + wTxt + '.');
      }
    } catch(_) {}
    try { const ws = _weekStats(); snap.weekWorkouts = ws.ses; } catch(_) {}
    try {
      const planned = DAYS.filter(d => { const p = planFor(d.key); return p && p.type !== 'none'; }).length;
      snap.weekGoal = planned || (parseInt(S.obFreq) || null);
    } catch(_) {}
    try { snap.streakWeeks = calcStreak().weeks; } catch(_) {}
    try {
      // Juengster Rekord ueber alle Uebungen — bestSet steht oben schon fertig.
      let pr = null;
      Object.keys(snap.bestSet).forEach(id => {
        const b = snap.bestSet[id];
        if (!b || !b.date || !(b.w > 0)) return;
        if (!pr || String(b.date) > String(pr.date)) pr = { id, w: b.w, date: b.date };
      });
      const prEx = pr ? exById(pr.id) : null;
      if (prEx) {
        snap.lastPrExName = prEx.name;
        snap.lastPrKg = pr.w;
        snap.lastPrDaysAgo = Math.max(0, Math.round((Date.now() - new Date(pr.date)) / 86400000));
      }
    } catch(_) {}
    try {
      const durs = (S.sessions || []).slice(-10).map(s => s.duration || 0).filter(v => v > 0);
      if (durs.length) snap.avgDurationMin = Math.round(durs.reduce((a, b) => a + b, 0) / durs.length / 60);
    } catch(_) {}
    try {
      const yKey = _gtDayStr(new Date(Date.now() - 86400000));
      const ys = (S.sessions || []).filter(s => _gtDayStr(s.date) === yKey);
      const y = ys[ys.length - 1];
      if (y) {
        const n = (y.logs || []).length;
        // Zahl ueber GT_LOCALE statt hart 'de-DE', Gewicht ueber kgToDisp/
        // unitLabel — sonst bekommt ein englischsprachiger lbs-Nutzer hier
        // deutsche Tausenderpunkte und eine kg-Zahl, waehrend derselbe Router
        // zwei Antworten weiter korrekt in lbs rechnet.
        const yVol = Math.round(kgToDisp(sessionVolume(y)));
        snap.yesterdayText = _cm('Gestern: ' + n + (n === 1 ? ' Übung' : ' Übungen'),
                                 'Yesterday: ' + n + (n === 1 ? ' exercise' : ' exercises'))
          + ', ' + yVol.toLocaleString(GT_LOCALE) + ' ' + unitLabel()
          + _cm(' Volumen.', ' volume.');
      }
    } catch(_) {}
    try {
      const mon = new Date(); mon.setHours(0,0,0,0); mon.setDate(mon.getDate() - ((mon.getDay()+6)%7));
      const mv = {};
      (S.sessions || []).forEach(s => {
        if (new Date(s.date) < mon) return;
        (s.logs || []).forEach(l => {
          const ex = exById(l.exerciseId); if (!ex) return;
          const lbl = muscleLabel(ex.muscleGroup); if (!lbl) return;
          mv[lbl] = (mv[lbl] || 0) + setsVolume(l.sets || []);
        });
      });
      Object.keys(mv).forEach(k => { mv[k] = Math.round(mv[k]); });
      if (Object.keys(mv).length) snap.muscleVolume = mv;
    } catch(_) {}
    try {
      // Ab MORGEN suchen, nicht ab heute — "was steht als naechstes an" meint
      // den naechsten Tag; der heutige gehoert dem today-Intent.
      const order = ['sun','mon','tue','wed','thu','fri','sat'];
      const ji = new Date().getDay();
      for (let i = 1; i <= 7; i++) {
        const k = order[(ji + i) % 7];
        const p = planFor(k);
        if (p && p.type !== 'none') {
          const d = dayByKey(k);
          // d.label kommt aus DAYS und ist schon sprachabhaengig; nur der
          // Fallback war hart deutsch.
          snap.nextPlanDayText = (d ? d.label : k) + ': ' + (_planLabelFor(k) || tr('Training')) + '.';
          break;
        }
      }
    } catch(_) {}
    try {
      const names = []
        .concat((S.workoutPresets || []).map(p => p && p.name))
        .concat((S.customSplits   || []).map(c => c && c.label))
        .filter(Boolean);
      if (names.length) snap.planNames = names.slice(0, 12);
    } catch(_) {}

    // --- Feld fuer Task 4: Begruendung des eigenen Gewichtsvorschlags -------
    // Invariante: ausgeliefert wird NUR die Begruendung der Uebung, deren
    // Gewicht der Nutzer gerade vor sich hat — das ist dieselbe Uebung, die
    // oben schon snap.active gefuellt hat (erste Uebung mit offenem Satz).
    // Ausserhalb eines laufenden Trainings gibt es keine solche Uebung, dann
    // bleibt das Feld null und die Frage geht ans Modell.
    //
    // Zusaetzlich muss die begruendete Zahl die sein, die in der Satzzeile
    // steht: bei Pyramiden-/Drop-Schema schreibt buildPlannedSets baseW *
    // schemeMult in die Zeile, und der Nutzer kann das Gewicht per Wheel
    // ueberschreiben. toKg ist aber das ungewichtete Basisgewicht — passt es
    // nicht zum angezeigten Wert, wuerde der Coach eine Zahl begruenden, die
    // nirgends dransteht. Dann lieber null.
    snap.weightReason = null;
    try {
      const wrExId = snap.active && snap.active.exId;
      if (wrExId) {
        // Nach einem App-Neustart mitten im Training (_restoreActiveWk ruft
        // getSuggestedWeight nicht auf) ist die Map leer — Begruendung dann
        // einmalig nachrechnen, statt die Frage grundlos ans Modell zu geben.
        if (!_weightReasons[wrExId]) { const _wrEx = exById(wrExId); if (_wrEx) getSuggestedWeight(_wrEx); }
        const wr = _weightReasons[wrExId];
        const shown = snap.active.nextW;
        if (wr && shown != null && Math.abs(Number(wr.toKg) - Number(shown)) < 0.001) snap.weightReason = wr;
      }
    } catch(e) { console.warn('[Coach] Gewichtsbegruendung:', e); }

    // --- Anzeigeeinheit: GANZ AM ENDE umrechnen (Befund 3) ------------------
    // Muss nach allen kg-Vergleichen oben laufen, sonst brechen sie im
    // lbs-Modus: der Bestsatz-Vergleich "w > cur.w" braucht durchgehend
    // dieselbe Skala, und der Gewichtsbegruendungs-Abgleich direkt darueber
    // vergleicht wr.toKg (kg, aus _weightReasons) gegen snap.active.nextW —
    // waere nextW hier schon lbs, triaeft der Abgleich nie mehr.
    // snap.nextSetText ist davon nicht betroffen: es baut seine Zahl weiter
    // oben schon eigenstaendig aus dem rohen Satzwert (nxt.w) MIT
    // kgToDisp()/unitLabel() — eine zweite Umrechnung hier wuerde es doppelt
    // umrechnen, deshalb bleibt es unberuehrt.
    // snap.weightReason wird als KOPIE umgerechnet, nie das Original aus
    // _weightReasons mutiert — das Objekt wird an anderer Stelle (Progression
    // in getSuggestedWeight/_ciAdjustW) weiter in kg gebraucht.
    try { if (snap.active && snap.active.nextW != null) snap.active.nextW = kgToDisp(snap.active.nextW); } catch(_) {}
    try { Object.keys(snap.bestSet).forEach(id => { snap.bestSet[id].w = kgToDisp(snap.bestSet[id].w); }); } catch(_) {}
    try { if (snap.lastPrKg != null) snap.lastPrKg = kgToDisp(snap.lastPrKg); } catch(_) {}
    try { if (snap.weekVolumeKg != null) snap.weekVolumeKg = kgToDisp(snap.weekVolumeKg); } catch(_) {}
    try {
      if (snap.muscleVolume) {
        const mvDisp = {};
        Object.keys(snap.muscleVolume).forEach(k => { mvDisp[k] = kgToDisp(snap.muscleVolume[k]); });
        snap.muscleVolume = mvDisp;
      }
    } catch(_) {}
    try {
      if (snap.weightReason) {
        snap.weightReason = Object.assign({}, snap.weightReason, {
          toKg: kgToDisp(snap.weightReason.toKg),
          stepKg: kgToDisp(snap.weightReason.stepKg)
        });
      }
    } catch(_) {}
  } catch(e) { console.warn('[Coach] Snapshot:', e); }
  return snap;
}

// Kompakter Trainingskontext für die KI — bewusst klein gehalten (Kosten!):
// Profil-Eckdaten, Übungsnamen (Cap 60), letzte 5 Einheiten mit Bestsatz je Übung.
function _aicContext(){
  // Beide Coach-Module-Aufrufe abgesichert: ein Fehler hier darf den Chat nie
  // blockieren (Review Kritisch 2) — bei Fehlschlag geht ein leerer Dossier-
  // Text bzw. eine leere Mute-Liste ans Modell, statt den ganzen Aufruf
  // (und damit _aicBusy/den Senden-Button) hart abzubrechen.
  let dossierTxt = '', mutedList = [];
  try { dossierTxt = window.CoachMemory.dossierForPrompt(_dossier()); }
  catch(e) { console.warn('[Coach] Dossier-Kontext fehlgeschlagen:', (e && e.message) || ''); }
  try { mutedList = window.CoachLog.logStats(S.coachLog || []).muted; }
  catch(e) { console.warn('[Coach] Log-Stats fehlgeschlagen:', (e && e.message) || ''); }
  return {
    profile: { goal: S.obGoal || null, exp: S.obExp || null, freq: S.obFreq || null },
    dossier: dossierTxt,
    muted: mutedList,
    exerciseNames: (S.exercises || []).slice(0, 60).map(e => e.name),
    recentSessions: (S.sessions || []).slice(-5).map(s => ({
      date: (s.date || '').slice(0, 10),
      exercises: (s.logs || []).map(l => {
        const ex = exById(l.exerciseId); if (!ex) return null;
        const best = (l.sets || []).filter(x => x.type !== 'warmup')
          .sort((a, b) => (parseFloat(b.w) || 0) - (parseFloat(a.w) || 0))[0];
        return best ? { name: ex.name, w: parseFloat(best.w) || 0, r: parseInt(best.r) || 0 } : { name: ex.name };
      }).filter(Boolean),
    })),
  };
}
async function aicSend(){
  if (_aicBusy) return;
  const ta = document.getElementById('aic-in');
  const t = (ta?.value || '').trim();
  if (!t) return;
  if (ta) { ta.value = ''; _aicGrow(ta); }
  _aicPush('user', t);
  // Lokal beantwortbar? Dann kein Netzaufruf. Die Antwort wandert trotzdem in
  // die Historie, sonst fehlt dem Modell beim naechsten echten Aufruf der Faden.
  // Abgesichert (Review Kritisch 2): wirft der Router (z. B. defekte/fehlende
  // Datei, Syntaxfehler nach Teil-Deploy), faellt der Chat einfach auf den
  // Modell-Pfad zurueck statt den Sende-Button fuer immer zu blockieren.
  let local = null;
  try { local = window.CoachIntent.resolveIntent(t, _coachSnap()); }
  catch(e) { console.warn('[Coach] Intent-Router fehlgeschlagen:', (e && e.message) || ''); local = null; }
  if (local) {
    _aicPlanPending = null;   // sonst bleibt ein "Plan importieren"-Button aus einer vorigen Antwort stehen
    _aicPush('assistant', local.answer);
    _aicRenderLog(); _aicRenderSugg();
    return;
  }
  // Ohne Netz kommt hier ein ruhiger Hinweis statt eines roten Fehlers, eines
  // Stacktrace oder eines haengenden Ladepunkts. Der Router hat die Frage nicht
  // lokal beantwortet — alles, was ab hier folgt, braucht eine Verbindung. Die
  // Zahlen (Streak, Wochenvolumen, naechster Satz, Aufwaermschema) laufen ohne
  // Netz weiter, deshalb sagt der Satz genau das.
  if (navigator.onLine === false) {
    _aicPush('assistant', _cm('Dafür brauche ich kurz Internet. Deine Zahlen und Vorschläge laufen auch ohne weiter.',
                              'I need a connection for that. Your numbers and suggestions keep working without one.'));
    _aicRenderLog(); _aicRenderSugg();
    return;
  }
  _aicBusy = true; _aicPlanPending = null;
  _aicRenderLog(); _aicRenderSugg();
  const send = document.getElementById('aic-send'); if (send) send.disabled = true;
  // try/finally um den kompletten Busy-Zeitraum (Review Fix 5): das haelt die
  // "Senden-Button wird immer wieder frei" Invariante strukturell auch fuer
  // jeden kuenftigen Wurf hier drin, statt sich auf eine Aufzaehlung
  // einzelner abgesicherter Aufrufe zu verlassen (Kritisch 2 sichert heute
  // schon resolveIntent/dossierForPrompt/logStats einzeln ab, aiCall selbst
  // kann laut Code nicht ablehnen — dieses finally greift trotzdem, falls
  // sich das je aendert).
  try {
    const msgs = _aicHist.slice(-16).map(m => ({ role: m.role, content: m.content }));
    const payload = { messages: msgs, context: _aicContext() };
    // Cache-Hinweis fuer den Worker: nur sachliche Fragen ohne Personenbezug.
    // Das ist ausdruecklich nur ein HINWEIS — der Worker rechnet Schluessel und
    // Cachefaehigkeit selbst nach (worker.js, ccVerifiedKey) und cacht nichts,
    // was seine eigene Pruefung nicht besteht.
    // GT_LANG (nicht das rohe localStorage['gt_lang']) — das ist bereits die
    // aufgeloeste Sprache ('auto' -> Geraetesprache) und exakt der Wert, der
    // gleich als lang:GT_LANG mitgeschickt wird. Mit dem rohen Rohwert wuerden
    // alle 'auto'-Nutzer (Standardeinstellung) faelschlich unter 'de' landen,
    // auch bei englischem Geraet — Cache-Kollision mit falscher Antwortsprache.
    // Nur der ERSTE Turn eines Chats ist cachefaehig: der Schluessel haengt nur
    // an dieser einen Frage, nicht an der Historie. "Ich habe Schulterprobleme"
    // gefolgt von "Alternative zu Bankdruecken?" wuerde die schulterspezifische
    // Antwort sonst unter einem Schluessel ohne Vorgeschichte ablegen.
    // Das Modell-Segment steht bewusst auf 'srv': welches Modell tatsaechlich
    // antwortet, weiss nur der Worker (MODEL/PROVIDER). Er ersetzt das Segment
    // beim Nachrechnen durch den echten Modellnamen — ein hier hartcodierter
    // Name wuerde bei einem Modellwechsel still veralten und 30 Tage lang
    // Antworten des alten Modells ausliefern.
    try {
      const exNames = (S.exercises || []).map(e => e && e.name).filter(Boolean);
      if (_aicHist.length === 1 && !window.CoachCache.isPersonal(t, exNames)) {
        payload.cacheable = true;
        payload.cacheKey  = window.CoachCache.cacheKey(t, GT_LANG, 'srv');
      }
    } catch (_) { /* ohne Cache-Hinweis laeuft der Aufruf normal ans Modell */ }
    const res = await aiCall('chat', payload);
    if (!res) return;   // aiCall zeigt Fehler/Paywall bereits per Toast
    let txt = res.text || '';
    const pm = txt.match(/```gtplan\s*([\s\S]*?)```/);
    if (pm) {
      try { _aicPlanPending = JSON.parse(pm[1]); } catch(_){ _aicPlanPending = null; }
      txt = txt.replace(pm[0], '').trim();
    }
    const mm = txt.match(/```gtmem\s*([\s\S]*?)```/);
    if (mm) {
      try {
        const delta = JSON.parse(mm[1]);
        _dossierSet(window.CoachMemory.dossierApplyDelta(_dossier(), delta, Date.now()));
      } catch(_) { /* kaputtes JSON still verwerfen, wie bei gtplan */ }
      txt = txt.replace(mm[0], '').trim();
    }
    _aicPush('assistant', txt || tr('Hier ist dein Plan:'));
  } finally {
    _aicBusy = false;
    if (send) send.disabled = false;
    _aicRenderLog();
  }
}
// Plan-Import: gleicher Mechanismus wie _applyTemplateCore (Presets/weekPlan/exIds/
// Farbe, persist()) — nur die Übungsauflösung ist erweitert: statt reiner
// Namens-Suche in EX_LIBRARY werden unbekannte KI-Übungen direkt aus den
// mitgelieferten Feldern (muscleGroup/sets/repMin/repMax) neu angelegt.
// Import-Einstieg: fragt zuerst per Sheet, ob nicht verplante Übungen behalten
// oder gelöscht werden sollen, dann läuft der eigentliche Import in
// _aicApplyPlanCore() (Mechanik unverändert wie _applyTemplateCore).
function aicApplyPlan(){
  const p = _aicPlanPending; if (!p || !p.days) return;
  const dayKeys = ['mon','tue','wed','thu','fri','sat','sun'].filter(k => p.days[k] && !p.days[k].rest && (p.days[k].exercises || []).length);
  const names = new Set();
  dayKeys.forEach(k => (p.days[k].exercises || []).forEach(e => { if (e && e.name) names.add(String(e.name).trim().toLowerCase()); }));
  const delCnt = (S.exercises || []).filter(e => !names.has(e.name.toLowerCase())).length;
  const el = document.getElementById('plan-apply-body');
  if (el) el.innerHTML = `
    <div class="card" style="padding:14px;line-height:1.55;font-size:14px">
      <b>${esc(String(p.name || 'Neuer Plan').slice(0,40))}</b><br>
      ${dayKeys.length} ${tr('Trainingstage')} · ${names.size} ${tr('Übungen')}<br>
      <span style="color:var(--text2)">${tr('Dein bisheriger Wochenplan wird ersetzt.')}</span>
    </div>
    <button class="btn btn-acc" style="margin-top:14px" onclick="_aicApplyChoice(false)">${tr('Importieren — andere Übungen behalten')}</button>
    ${delCnt > 0 ? `<button class="btn btn-gray" style="margin-top:10px;color:#ff453a" onclick="_aicApplyChoice(true)">${tr('Importieren + nicht verplante Übungen löschen')} (${delCnt})</button>` : ''}
    <div class="soc-empty" style="padding:10px 2px 0;text-align:left;font-size:12px">${tr('Beim Löschen bleibt deine Trainings-Historie erhalten — nur die Übungen verschwinden aus deiner Liste.')}</div>`;
  openOv('ov-plan-apply');
}
function _aicApplyChoice(deleteOthers){
  closeOv('ov-plan-apply');
  _aicApplyPlanCore(!!deleteOthers);
}
function _aicApplyPlanCore(deleteOthers){
  const p = _aicPlanPending; if (!p || !p.days) return;
  const validMg = ['brust','ruecken','beine','arme','schultern','core'];
  const byLabel = {};
  let colorIdx = (S.workoutPresets || []).length;
  const newPlan = {};
  ['mon','tue','wed','thu','fri','sat','sun'].forEach(k => {
    const day = p.days[k];
    if (!day || day.rest || !Array.isArray(day.exercises) || !day.exercises.length) { newPlan[k] = {type:'none'}; return; }
    const ids = [];
    day.exercises.slice(0, 10).forEach(de => {
      const nm = String(de.name || '').trim().slice(0, 60); if (!nm) return;
      let ex = S.exercises.find(e => e.name.toLowerCase() === nm.toLowerCase());
      if (!ex) {
        if (S.exercises.length >= 500) return;
        const libItem = EX_LIBRARY.find(it => it.n.toLowerCase() === nm.toLowerCase());
        ex = {
          id: uid(), name: libItem ? libItem.n : nm, emoji: '',   // KI-Übungen ohne Emoji (Lenny-Regel)
          muscleGroup: validMg.includes(de.muscleGroup) ? de.muscleGroup : (libItem ? libItem.mg : ''),
          targetSets: Math.max(1, Math.min(8, parseInt(de.sets) || libItem?.s || 3)),
          targetReps: Math.max(1, Math.min(30, parseInt(de.repMax) || libItem?.r || 10)),
          targetWeight: 0, targetType: 'reps',
          repMin: Math.max(1, Math.min(29, parseInt(de.repMin) || Math.max(1, (libItem?.r || 10) - 2))),
          repMax: Math.max(1, Math.min(30, parseInt(de.repMax) || (libItem?.r || 10) + 2)),
          weightScheme: 'straight',
        };
        S.exercises.push(ex);
      }
      ids.push(ex.id);
    });
    if (!ids.length) { newPlan[k] = {type:'none'}; return; }
    const label = String(day.label || p.name || 'Training').slice(0, 30);
    let pr = byLabel[label];
    if (!pr) { pr = { id: uid(), name: label, exIds: [], color: SPLIT_PALETTE[(colorIdx++) % SPLIT_PALETTE.length], _ai:true }; byLabel[label] = pr; }
    ids.forEach(id => { if (!pr.exIds.includes(id)) pr.exIds.push(id); });
    newPlan[k] = { type:'preset', id: pr.id };
  });
  S.workoutPresets = [...(S.workoutPresets || []).filter(x => !x._ai), ...Object.values(byLabel)];
  S.weekPlan = newPlan;
  if (deleteOthers) {
    // Nicht verplante Übungen entfernen. Sessions-Historie bleibt unangetastet —
    // alle Render-Pfade prüfen exById() defensiv (fehlende Übung → übersprungen).
    const usedIds = new Set();
    Object.values(byLabel).forEach(pr => (pr.exIds || []).forEach(id => usedIds.add(id)));
    S.exercises = (S.exercises || []).filter(e => usedIds.has(e.id));
    S.workoutPresets = S.workoutPresets
      .map(pr => ({ ...pr, exIds: (pr.exIds || []).filter(id => usedIds.has(id)) }))
      .filter(pr => pr._ai || (pr.exIds || []).length);
  }
  persist();
  try { scheduleWorkoutNotifications(); } catch(_){}
  try { renderHome(); renderExList(); } catch(_){}
  _aicPlanPending = null;
  _aicRenderLog();
  _dndToast(deleteOthers ? 'Plan importiert & Übungsliste aufgeräumt.' : 'Plan importiert — du findest ihn im Heute-Tab.');
  haptic(25);
}

// ── TRAININGSPLAN-WIZARD (Abfrage vor der KI-Plan-Erstellung) ─────────
// Sammelt Frequenz/Ziel/Zeit/Einschränkungen/Wünsche und startet damit den
// KI-Chat — dort läuft die normale Plan-Erstellung inkl. ```gtplan-Import.
const _PWZ_INJ = [
  { id:'keine',      l:'Keine' },
  { id:'knie',       l:'Knie' },
  { id:'schulter',   l:'Schulter' },
  { id:'ruecken',    l:'Unterer Rücken' },
  { id:'ellenbogen', l:'Ellenbogen' },
  { id:'handgelenk', l:'Handgelenk' },
  { id:'huefte',     l:'Hüfte' },
];
const _PWZ_GOALS = [
  { id:'muskel',   l:'Muskelaufbau' },
  { id:'kraft',    l:'Kraft' },
  { id:'abnehmen', l:'Abnehmen' },
  { id:'fit',      l:'Fit bleiben' },
];
let _pwzState = null;
function openPlanWizard(){
  _pwzState = { step:0, freq: S.obFreq || 3, goal: S.obGoal || 'muskel', time: 60, inj: ['keine'], wish: '' };
  _pwzRender();
  openOv('ov-plan-wizard');
}
function _pwzSet(k, v){ _pwzState[k] = v; haptic(5); _pwzRender(); }
function _pwzInjTgl(id){
  const st = _pwzState;
  if (id === 'keine') st.inj = ['keine'];
  else {
    st.inj = st.inj.filter(x => x !== 'keine');
    st.inj = st.inj.includes(id) ? st.inj.filter(x => x !== id) : [...st.inj, id];
    if (!st.inj.length) st.inj = ['keine'];
  }
  haptic(5); _pwzRender();
}
function _pwzNav(d){
  const st = _pwzState; if (!st) return;
  // Freitext des aktuellen Schritts sichern, bevor neu gerendert wird
  const ta = document.getElementById('pwz-wish'); if (ta) st.wish = ta.value.slice(0, 300);
  st.step = Math.max(0, Math.min(4, st.step + d));
  haptic(6); _pwzRender();
}
function _pwzRender(){
  const el = document.getElementById('pwz-body'); if (!el || !_pwzState) return;
  const st = _pwzState;
  const dots = `<div class="pwz-dots">${[0,1,2,3,4].map(i => `<span class="pwz-dot${i<=st.step?' on':''}"></span>`).join('')}</div>`;
  const chips = (arr, sel, fn) => `<div class="pwz-chips">${arr.map(o =>
    `<button type="button" class="pwz-chip${sel===o.v||sel===o.id?' on':''}" onclick="${fn(o)}">${o.l}</button>`).join('')}</div>`;
  let inner = '';
  if (st.step === 0) inner = `
    <div class="pwz-q">Wie oft pro Woche?</div>
    ${chips([2,3,4,5,6].map(n => ({ v:n, l:n+'× pro Woche' })), st.freq, o => `_pwzSet('freq',${o.v})`)}`;
  else if (st.step === 1) inner = `
    <div class="pwz-q">Was ist dein Ziel?</div>
    ${chips(_PWZ_GOALS, st.goal, o => `_pwzSet('goal','${o.id}')`)}`;
  else if (st.step === 2) inner = `
    <div class="pwz-q">Wie viel Zeit pro Einheit?</div>
    ${chips([30,45,60,90].map(n => ({ v:n, l:'ca. '+n+' Min.' })), st.time, o => `_pwzSet('time',${o.v})`)}`;
  else if (st.step === 3) inner = `
    <div class="pwz-q">Verletzungen oder Einschränkungen?</div>
    <div class="pwz-s">Bei Schmerzen bitte ärztlich abklären.</div>
    <div class="pwz-chips">${_PWZ_INJ.map(o =>
      `<button type="button" class="pwz-chip${st.inj.includes(o.id)?' on':''}" onclick="_pwzInjTgl('${o.id}')">${o.l}</button>`).join('')}</div>`;
  else inner = `
    <div class="pwz-q">Noch Wünsche?</div>
    <div class="pwz-s">Optional — z. B. „nur Kurzhanteln". Im Chat weiter anpassbar.</div>
    <textarea id="pwz-ta" class="pwz-ta" maxlength="300" placeholder="Optional…" oninput="_pwzState.wish=this.value">${esc(st.wish)}</textarea>`;
  el.innerHTML = `${dots}${inner}
    <div class="pwz-nav">
      ${st.step > 0 ? `<button class="btn btn-gray" style="flex:1" onclick="_pwzNav(-1)">Zurück</button>` : ''}
      ${st.step < 4
        ? `<button class="btn btn-acc" style="flex:2" onclick="_pwzNav(1)">Weiter</button>`
        : `<button class="btn btn-acc" style="flex:2" onclick="_pwzStart()">Plan erstellen lassen</button>`}
    </div>`;
}
function _pwzStart(){
  const st = _pwzState; if (!st) return;
  const ta = document.getElementById('pwz-ta'); if (ta) st.wish = ta.value.slice(0, 300);
  const goal = (_PWZ_GOALS.find(g => g.id === st.goal) || {}).l || st.goal;
  const inj = st.inj.includes('keine') ? 'keine'
    : st.inj.map(id => (_PWZ_INJ.find(x => x.id === id) || {}).l || id).join(', ') + ' — bitte gelenkschonende Alternativen wählen';
  const seed = tr('Erstelle mir meinen perfekten Trainingsplan.') + '\n'
    + tr('Trainingstage pro Woche:') + ' ' + st.freq + '\n'
    + tr('Ziel:') + ' ' + goal + '\n'
    + tr('Zeit pro Einheit:') + ' ca. ' + st.time + ' ' + tr('Minuten') + '\n'
    + tr('Verletzungen/Einschränkungen:') + ' ' + inj + '\n'
    + (st.wish ? tr('Wünsche:') + ' ' + st.wish + '\n' : '')
    + tr('Bitte erstelle direkt den kompletten Wochenplan.');
  closeOv('ov-plan-wizard');
  _pwzState = null;
  openAiChat(seed);
}

// ── DIKTAT: EIN KERN FÜR CHAT UND TRAINING ─────────
// Native App (WKWebView) kennt die Web Speech API NICHT → dort läuft Diktat über
// das eigene SpeechPlugin.swift (SFSpeechRecognizer). Web/PWA nutzt weiter die
// Web Speech API, wo verfügbar (Safari Desktop, Chrome).
//
// Beide Einstiege — der Mikrofon-Knopf im KI-Chat und der Sprech-Knopf in der
// Coach-Leiste des Trainings — laufen durch _sttStart/_sttStop. Genau EIN
// Aufnahmezustand für die ganze App: zwei gleichzeitige Mikrofonzugriffe gibt
// es auf iOS ohnehin nicht, und ein zweiter Zustand hätte den Knopf im jeweils
// anderen Kontext hängen lassen. Die Diktat-Logik steht deshalb nur hier, nicht
// zweimal.
let _sttRec = null, _sttOn = false, _sttListener = null;
let _sttOnText = null, _sttOnEnd = null, _sttLast = '';
function _sttBusy(){ return _sttOn; }
// Räumt IMMER vollständig auf und meldet den letzten Stand zurück — auch wenn
// der Start scheitert. Sonst bliebe ein 'rec'-Knopf stehen, der nichts aufnimmt.
function _sttFinish(){
  const txt = _sttLast, cb = _sttOnEnd;
  _sttOn = false; _sttRec = null; _sttOnText = null; _sttOnEnd = null; _sttLast = '';
  if (_sttListener) { try { _sttListener.remove(); } catch(_) {} _sttListener = null; }
  if (cb) { try { cb(txt); } catch(e) { console.warn('[Diktat] Abschluss:', e); } }
}
async function _sttStop(){
  if (!_sttOn) return;
  if (_isNative()) {
    const SP = _cap('SpeechPlugin');
    try { if (SP) await SP.stop(); } catch(_) {}
    _sttFinish(); return;
  }
  // Der Web-Zweig meldet sich über onend zurück; nur wenn stop() selbst wirft,
  // räumen wir hier auf.
  try { if (_sttRec) _sttRec.stop(); } catch(_) { _sttFinish(); }
}
// onText(text, isFinal) sieht jeden Zwischenstand, onEnd(text) den letzten.
async function _sttStart(onText, onEnd){
  if (_sttOn) { await _sttStop(); return false; }
  _sttOnText = onText || null; _sttOnEnd = onEnd || null; _sttLast = '';
  const push = (t, fin) => {
    _sttLast = t;
    if (_sttOnText) { try { _sttOnText(t, fin); } catch(e) { console.warn('[Diktat] Verarbeitung:', e); } }
  };
  if (_isNative()) {
    const SP = _cap('SpeechPlugin'); if (!SP) { _sttFinish(); return false; }
    try {
      _sttListener = await SP.addListener('result', (ev) => {
        push(String(ev.transcript || '').trim(), !!ev.isFinal);
        if (ev.isFinal) _sttFinish();
      });
      await SP.start({ lang: GT_LANG === 'en' ? 'en-US' : 'de-DE' });
      _sttOn = true; haptic(8); return true;
    } catch(e) { console.warn('[Diktat] Start:', e); _sttFinish(); return false; }
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { _sttFinish(); return false; }
  const rec = new SR();
  rec.lang = GT_LANG === 'en' ? 'en-US' : 'de-DE';
  rec.continuous = true;
  rec.interimResults = true;
  rec.onresult = (ev) => {
    let t = '';
    for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
    push(t.trim(), false);
  };
  rec.onend = () => _sttFinish();
  rec.onerror = () => _sttFinish();
  try { rec.start(); _sttRec = rec; _sttOn = true; haptic(8); return true; }
  catch(_) { _sttFinish(); return false; }
}

// ── KI-CHAT: DIKTIERFUNKTION ─────────
function _aicMicInit(){
  const btn = document.getElementById('aic-mic'); if (!btn) return;
  if (_isNative()) { btn.style.display = _cap('SpeechPlugin') ? '' : 'none'; return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  btn.style.display = SR ? '' : 'none';   // iOS Safari ohne Support: Diktat über die Tastatur-Mikrofontaste
}
function aicMicToggle(){
  const btn = document.getElementById('aic-mic'); if (!btn) return;
  if (_sttBusy()) { _sttStop(); return; }
  const inp = document.getElementById('aic-in');
  const baseText = inp ? inp.value : '';
  _sttStart(
    (t) => { if (inp) { inp.value = (baseText ? baseText + ' ' : '') + t; _aicGrow(inp); } },
    () => { btn.classList.remove('rec'); }
  ).then(ok => { if (ok) btn.classList.add('rec'); });
}

// ── COACH-STIMME (Block 2) ─────────
// Verfügbarkeit EINMAL ermitteln und merken: _coachBarRender() läuft oft, und
// SpeechPlugin.isAvailable() ist asynchron — es beantwortet die BERECHTIGUNG,
// nicht nur das Vorhandensein des Plugins. Bis die Antwort da ist, gilt "keine
// Fähigkeit": lieber kurz kein Knopf als ein Knopf, der nichts tut.
async function _coachCapsInit(){
  try {
    const SP = _cap('SpeechPlugin');
    let stt = !!SP;
    if (SP) { try { const r = await SP.isAvailable(); stt = !!(r && r.available); } catch(_) { stt = false; } }
    _cvCaps = window.CoachVoice.available({
      tts: !!_cap('TtsPlugin'), stt: stt,
      webTts: typeof speechSynthesis !== 'undefined',
      webStt: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    });
  } catch(e) { console.warn('[Coach] Sprachfähigkeiten:', e); _cvCaps = { tts: false, stt: false }; }
  try { _coachBarRender(); } catch(_) {}
}
function _coachLangTag(){ return GT_LANG === 'en' ? 'en-US' : 'de-DE'; }
// Stimmenliste der aktuellen Sprache — nativ aus dem Plugin, im Browser aus
// speechSynthesis. Immer {id, name, lang, quality}, also genau die Form, die
// CoachVoice.pickVoice erwartet.
async function _coachVoiceList(){
  const lang = _coachLangTag();
  const TTS = _cap('TtsPlugin');
  if (TTS) {
    try { const r = await TTS.voices({ lang: lang }); return (r && r.voices) || []; }
    catch(e) { console.warn('[Coach] Stimmen:', e); return []; }
  }
  if (typeof speechSynthesis === 'undefined') return [];
  try {
    const base = lang.slice(0, 2).toLowerCase();
    return speechSynthesis.getVoices()
      .filter(v => String(v.lang || '').toLowerCase().indexOf(base) === 0)
      .map(v => ({ id: v.voiceURI, name: v.name, lang: v.lang, quality: v.localService ? 'default' : 'enhanced' }));
  } catch(e) { console.warn('[Coach] Stimmen:', e); return []; }
}
// Spricht — und scheitert dabei STUMM. Die Sprachausgabe darf den Ablauf nie
// stören: kein Toast, kein sichtbarer Fehler, nur console.warn.
async function coachSpeak(text){
  try {
    const p = _persona();
    if (p.voiceOn === false) return;
    const t = window.CoachVoice.speakable(text);
    if (!t) return;
    const TTS = _cap('TtsPlugin');
    if (TTS) { await TTS.speak({ text: t, voiceId: p.voice || '', lang: _coachLangTag() }); return; }
    if (typeof speechSynthesis === 'undefined') return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    const id = window.CoachVoice.pickVoice(await _coachVoiceList(), p.voice || null, GT_LANG === 'en' ? 'en' : 'de');
    if (id) { const v = speechSynthesis.getVoices().filter(x => x.voiceURI === id)[0]; if (v) u.voice = v; }
    u.lang = _coachLangTag();
    speechSynthesis.speak(u);
  } catch(e) { console.warn('[Coach] Sprachausgabe:', e); }
}
// ── GERÄTE-SCANNER (Kamera → /vision → Übungs-Animation) ─────────
// Foto wird clientseitig auf max. 1024px verkleinert (Kosten + Upload-Größe),
// der Worker (/vision, Gemini multimodal) erkennt Gerät + Übungen, die Ausführungs-
// Animation kommt aus der offenen free-exercise-db (jsDelivr, 2 Frames im Wechsel).
const _FEDB_BASE = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/';
let _scnResult = null, _scnPhoto = null, _scnBusy = false, _scnAnimT = null, _scnSel = 0;
let _fedbCache = null, _fedbLoading = null;
function _fedbLoad(){
  if (_fedbCache) return Promise.resolve(_fedbCache);
  if (_fedbLoading) return _fedbLoading;
  _fedbLoading = fetch(_FEDB_BASE + 'dist/exercises.json')
    .then(r => { if (!r.ok) throw new Error('fedb ' + r.status); return r.json(); })
    .then(j => { _fedbCache = Array.isArray(j) ? j : []; return _fedbCache; })
    .catch(e => { _fedbLoading = null; console.warn('[Scanner] Übungs-DB:', e); return []; });
  return _fedbLoading;
}
function _fedbNorm(s){ return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
// Füllwörter und Plural-s raus, damit "Seated Cable Rows" und "Seated Cable Row"
// dieselben Tokens ergeben.
// "machine" bleibt bewusst DRIN als bedeutungstragendes Wort: sonst würde
// "Machine Bench Press" als Treffer für "Bench Press" durchgehen.
const _FEDB_STOP = { the:1, a:1, an:1, and:1, with:1, on:1, in:1, of:1, to:1, for:1, exercise:1 };
// Zusatzwörter, die nur die Griff-/Handhaltung beschreiben und die gezeigte
// Bewegung praktisch nicht ändern. Alles andere (Gerät, Position, Seitigkeit)
// gilt als andere Übung.
const _FEDB_SOFT = { wide:1, close:1, narrow:1, grip:1, medium:1, neutral:1,
  overhand:1, underhand:1, alternate:1, alternating:1, parallel:1 };
function _fedbTokens(s){
  return _fedbNorm(s).split(' ')
    .map(w => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) ? w.slice(0, -1) : w)
    .filter(w => w.length > 1 && !_FEDB_STOP[w]);
}
// Bester DB-Treffer für einen englischen Übungsnamen — bewusst STRENG.
// Die alte Fassung nahm jeden Substring-Treffer ("Row" passte auf "Seated Cable
// Row") und sonst den besten Kandidaten ab (Wortanzahl-1) Überschneidung. Damit
// lief regelmäßig die Animation einer anderen Übung — genau der gemeldete Fehler.
// Jetzt zählt beides: Wie viel der Anfrage deckt der DB-Name ab (cover) UND wie
// viel Fremdes bringt er mit (precision). Kein klarer Treffer → null, und der
// Scanner zeigt dann nur die Schritt-Erklärung statt eines falschen Bildes.
function _fedbMatch(db, nameEn){
  const q = _fedbNorm(nameEn); if (!q || !db.length) return null;
  const withImg = db.filter(e => (e.images || []).length);
  const exact = withImg.find(e => _fedbNorm(e.name) === q);
  if (exact) return exact;
  const qt = _fedbTokens(nameEn);
  if (qt.length < 2) return null;   // Ein-Wort-Anfragen ("Row", "Press") sind nie eindeutig
  let best = null, bestExtra = 99;
  withImg.forEach(e => {
    const nt = _fedbTokens(e.name);
    if (nt.length < qt.length) return;
    // Jedes Wort der Anfrage MUSS vorkommen — Teiltreffer sind der Grund, warum
    // vorher fremde Übungen durchkamen.
    if (!qt.every(w => nt.indexOf(w) !== -1)) return;
    // Zusatzwörter im DB-Namen dürfen die Übung nicht verändern. "Wide-Grip Lat
    // Pulldown" ist dieselbe Bewegung wie "Lat Pulldown"; "Ball Leg Curl" oder
    // "Cable Chest Press" sind es NICHT — anderes Gerät, andere Ausführung.
    const extra = nt.filter(w => qt.indexOf(w) === -1);
    if (!extra.every(w => _FEDB_SOFT[w])) return;
    if (extra.length < bestExtra) { bestExtra = extra.length; best = e; }
  });
  return best;
}
function _scnStopAnim(){ if (_scnAnimT) { clearInterval(_scnAnimT); _scnAnimT = null; } }
// Ecken-Rahmen fürs Kamera-Sucherbild (geteilt mit dem Workout-Snap)
function _gtCamFrameHTML(){ return `<div class="gtcam-frame"><i></i><i></i><i></i><i></i></div>`; }
function openAiScan(){
  _scnResult = null; _scnPhoto = null; _scnBusy = false; _scnSel = 0;
  _scnStopAnim();
  openOv('ov-ai-scan');
  _scnCamStep();   // direkt in die In-App-Kamera mit Rahmen
  _fedbLoad();     // DB schon mal im Hintergrund anwärmen
}
function _scnRenderStart(){
  const el = document.getElementById('scn-body'); if (!el) return;
  el.innerHTML = `
    <div class="scn-drop" onclick="_scnCamStep()">
      <div style="color:var(--acc)">${ICO.camera({s:44})}</div>
      <div class="scn-drop-t">${tr('Kamera öffnen')}</div>
      <div class="scn-drop-s">${tr('Die KI erkennt das Gerät und zeigt dir passende Übungen mit Ausführung.')}</div>
    </div>
    <button class="btn btn-gray" style="margin-top:12px" onclick="document.getElementById('scn-file-lib').click()">${tr('Aus Fotos wählen')}</button>`;
}
// In-App-Sucherbild mit Rahmen statt Foto-Picker. Kein getUserMedia (alte iOS-
// Version / Zugriff verweigert) → Fallback auf System-Kamera via capture-Input.
let _scnStream = null;
function _scnStopCam(){ try { _scnStream?.getTracks().forEach(t => t.stop()); } catch(_){} _scnStream = null; }
async function _scnCamStep(){
  const el = document.getElementById('scn-body'); if (!el) return;
  el.innerHTML = `
    <div class="scn-cam">
      <video id="scn-video" autoplay playsinline muted></video>
      ${_gtCamFrameHTML()}
      <div class="gtcam-hint">${tr('Gerät mittig einfangen')}</div>
      <div class="scn-cam-bar">
        <button class="shf-camside" onclick="_scnStopCam();document.getElementById('scn-file-lib').click()" aria-label="${tr('Aus Fotos wählen')}">${ICO.image({s:22})}</button>
        <button class="shf-shutter" onclick="_scnSnap()" aria-label="${tr('Foto aufnehmen')}"></button>
        <button class="shf-camside" onclick="_scnStopCam();_scnRenderStart()" aria-label="${tr('Schließen')}">✕</button>
      </div>
    </div>`;
  try {
    _scnStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1600 } }, audio: false });
    const v = document.getElementById('scn-video');
    if (v) v.srcObject = _scnStream; else _scnStopCam();   // Sheet evtl. schon zu
  } catch(_) {
    _scnRenderStart();
    document.getElementById('scn-file')?.click();
  }
}
function _scnSnap(){
  const v = document.getElementById('scn-video');
  if (!v || !v.videoWidth) return;
  const MAX = 1024, sc = Math.min(1, MAX / Math.max(v.videoWidth, v.videoHeight));
  const cnv = document.createElement('canvas');
  cnv.width = Math.round(v.videoWidth * sc); cnv.height = Math.round(v.videoHeight * sc);
  cnv.getContext('2d').drawImage(v, 0, 0, cnv.width, cnv.height);
  _scnStopCam();
  haptic(10);
  _scnPhoto = cnv.toDataURL('image/jpeg', 0.82);
  _scnAnalyze();
}
function _scnPicked(input){
  const file = input.files && input.files[0]; input.value = '';
  if (!file || _scnBusy) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1024;
      const sc = Math.min(1, MAX / Math.max(img.width, img.height));
      const cnv = document.createElement('canvas');
      cnv.width = Math.round(img.width * sc); cnv.height = Math.round(img.height * sc);
      cnv.getContext('2d').drawImage(img, 0, 0, cnv.width, cnv.height);
      _scnPhoto = cnv.toDataURL('image/jpeg', 0.82);
      _scnAnalyze();
    };
    img.onerror = () => alert('Bild konnte nicht geladen werden.');
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
async function _scnAnalyze(){
  const el = document.getElementById('scn-body'); if (!el || !_scnPhoto) return;
  _scnBusy = true;
  el.innerHTML = `
    <img class="scn-preview" src="${_scnPhoto}" alt="">
    <div style="text-align:center;padding:20px 12px;color:var(--text2);font-size:14.5px">
      <div class="aic-typing" style="justify-content:center;display:flex;margin:0 auto 12px"><span></span><span></span><span></span></div>
      ${tr('Gerät wird erkannt…')}</div>`;
  const res = await aiCall('vision', { img: _scnPhoto.split(',')[1], mime: 'image/jpeg' });
  _scnBusy = false;
  if (!res || !res.v) { _scnRenderStart(); return; }   // aiCall zeigt Fehler/Paywall selbst
  _scnResult = res.v; _scnSel = 0;
  _scnRenderResult();
}
function _scnRenderResult(){
  const el = document.getElementById('scn-body'); if (!el || !_scnResult) return;
  const v = _scnResult;
  _scnStopAnim();
  if (!v.isGym) {
    el.innerHTML = `
      <img class="scn-preview" src="${_scnPhoto}" alt="">
      <div class="card" style="padding:14px;margin-top:12px;font-size:14px;line-height:1.55">
        ${tr('Kein Trainingsgerät erkannt.')}${v.device ? ' ' + esc(v.device) : ''}<br>
        <span style="color:var(--text2)">${tr('Versuch es mit einem Foto, auf dem das Gerät komplett zu sehen ist.')}</span></div>
      <button class="btn btn-acc" style="margin-top:14px" onclick="_scnCamStep()">${tr('Nochmal fotografieren')}</button>`;
    return;
  }
  const exs = (v.exercises || []).slice(0, 3);
  const mgs = (v.muscleGroups || []).map(m => muscleLabel(m) || m);
  // Unsichere Erkennung offen benennen statt Sicherheit vorzutäuschen — und die
  // Ausführungs-Animation bleibt dann weg (s. _scnLoadAnim).
  const conf = typeof v.confidence === 'number' ? v.confidence : 1;
  const unsure = conf < 0.6;
  el.innerHTML = `
    <img class="scn-preview" src="${_scnPhoto}" alt="">
    <div class="scn-device">
      <div class="scn-device-ico">${ICO.check({s:20})}</div>
      <div style="flex:1;min-width:0">
        <div class="scn-device-t">${esc(v.device || '')}</div>
        <div class="scn-device-s">${unsure ? tr('Nicht eindeutig erkannt — halte dich an die Schritte') : _scnByCoach()}</div>
      </div>
    </div>
    ${mgs.length ? `<div class="scn-mg">${mgs.map(m => `<span>${esc(m)}</span>`).join('')}</div>` : ''}
    <div id="scn-anim-wrap"></div>
    ${exs.length ? `<div class="aia-sec-t" style="margin-top:14px">${tr('Übungen an diesem Gerät')}</div>` : ''}
    ${exs.map((e, i) => `
      <div class="scn-ex${i === _scnSel ? ' on' : ''}" onclick="_scnPick(${i})">
        <div style="flex:1;min-width:0">
          <div class="scn-ex-t">${esc(e.name || '')}</div>
          ${e.tip ? `<div class="scn-ex-s">${esc(e.tip)}</div>` : ''}
        </div>
        ${muscleLabel(e.muscleGroup) ? `<span style="font-size:11px;font-weight:800;color:var(--acc)">${esc(muscleLabel(e.muscleGroup))}</span>` : ''}
      </div>`).join('')}
    ${Array.isArray(v.howTo) && v.howTo.length ? `
      <div class="aia-sec-t" style="margin-top:14px">${tr('So führst du sie aus')}</div>
      ${v.howTo.slice(0, 5).map((s, i) => `<div class="scn-step"><div class="scn-step-n">${i + 1}</div><div>${esc(s)}</div></div>`).join('')}` : ''}
    ${v.caution ? `<div class="card" style="padding:11px 12px;margin-top:10px;font-size:12.5px;line-height:1.5;color:var(--text2)"><b style="color:var(--text)">${tr('Häufigster Fehler:')}</b> ${esc(v.caution)}</div>` : ''}
    <div style="display:flex;gap:10px;margin-top:16px">
      <button class="btn btn-gray" style="flex:1" onclick="_scnCamStep()">${tr('Neues Foto')}</button>
      <button class="btn btn-acc" style="flex:1.4" onclick="_scnAddExercise()">${tr('In meine Übungen')}</button>
    </div>`;
  _scnLoadAnim();
}
function _scnPick(i){ _scnSel = i; haptic(5); _scnRenderResult(); }
// Ausführungs-Animation: 2 Frames der free-exercise-db im Wechsel (kein echtes GIF
// nötig, gleiche Wirkung, offene Lizenz, kein API-Key).
async function _scnLoadAnim(){
  const wrap = document.getElementById('scn-anim-wrap'); if (!wrap || !_scnResult) return;
  const ex = (_scnResult.exercises || [])[_scnSel]; if (!ex) return;
  // Unsichere Erkennung → gar keine Animation. Ein Bild, das nicht zum Gerät vor
  // dem Nutzer passt, ist schlechter als keins; die Schritt-Erklärung trägt allein.
  const conf = typeof _scnResult.confidence === 'number' ? _scnResult.confidence : 1;
  if (conf < 0.6) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = `<div class="soc-empty" style="padding:14px">${tr('Lade Ausführungs-Animation…')}</div>`;
  const db = await _fedbLoad();
  const hit = _fedbMatch(db, ex.nameEn || ex.name);
  const cur = document.getElementById('scn-anim-wrap'); if (!cur) return;   // Sheet evtl. schon zu
  if (!hit || !(hit.images || []).length) { cur.innerHTML = ''; return; }
  const imgs = hit.images.slice(0, 2).map(p => _FEDB_BASE + 'exercises/' + p);
  cur.innerHTML = `
    <div class="scn-anim">
      <span class="scn-anim-tag">${tr('Ausführung')} · ${esc(hit.name)}</span>
      <img id="scn-anim-img" src="${imgs[0]}" alt="${esc(ex.name || '')}">
    </div>`;
  _scnStopAnim();
  if (imgs.length > 1) {
    let f = 0;
    _scnAnimT = setInterval(() => {
      const im = document.getElementById('scn-anim-img');
      if (!im) { _scnStopAnim(); return; }
      f = 1 - f; im.src = imgs[f];
    }, 900);
  }
}
function _scnAddExercise(){
  const v = _scnResult; if (!v) return;
  const e = (v.exercises || [])[_scnSel]; if (!e || !e.name) return;
  const nm = String(e.name).trim().slice(0, 60);
  if (S.exercises.find(x => x.name.toLowerCase() === nm.toLowerCase())) { _dndToast('Übung ist schon in deiner Liste.'); return; }
  if (S.exercises.length >= 500) { _dndToast('Übungslimit erreicht.'); return; }
  const validMg = ['brust','ruecken','beine','arme','schultern','core'];
  S.exercises.push({
    id: uid(), name: nm, emoji: '',   // KI-Übungen ohne Emoji (Lenny-Regel)
    muscleGroup: validMg.includes(e.muscleGroup) ? e.muscleGroup : (validMg.includes((v.muscleGroups || [])[0]) ? v.muscleGroups[0] : ''),
    targetSets: 3, targetReps: 12, targetWeight: 0, targetType: 'reps',
    repMin: 8, repMax: 12, weightScheme: 'straight',
  });
  persist();
  try { renderExList(); } catch(_){}
  _dndToast('„' + nm + '" zu deinen Übungen hinzugefügt.');
  haptic(18);
}

// ── KI-Analyse (Training/Workout/Fortschritt) ─────────
const _AIA_TITLES = { training:'Trainingsanalyse', workout:'Workout optimieren', progress:'Fortschritt analysieren' };
// Fokus-Auswahl vor der Analyse: gesamt / einzelner Split / einzelne Übung
function _aiaScopeUI(mode, exList){
  const el = document.getElementById('aia-body'); if (!el) return;
  if (exList) {
    const used = {};
    (S.sessions || []).slice(-40).forEach(s => (s.logs || []).forEach(l => { used[l.exerciseId] = 1; }));
    const exs = (S.exercises || []).slice().sort((a, b) => (used[b.id] || 0) - (used[a.id] || 0)).slice(0, 40);
    el.innerHTML = `<div class="aia-sec-t" style="margin-bottom:8px">${tr('Welche Übung?')}</div>
      ${exs.map(e => `<div class="scn-ex" onclick="openAiAnalyze('progress',{exercise:'${e.id}'})"><div class="scn-ex-t">${esc(e.name)}</div>${muscleLabel(e.muscleGroup) ? `<span style="font-size:11px;font-weight:800;color:var(--acc)">${esc(muscleLabel(e.muscleGroup))}</span>` : ''}</div>`).join('')}
      <button class="btn btn-gray" style="margin-top:12px" onclick="_aiaScopeUI('progress')">${tr('Zurück')}</button>`;
    return;
  }
  const presets = (S.workoutPresets || []).slice(0, 12);
  el.innerHTML = `<div class="aia-sec-t" style="margin-bottom:8px">${mode === 'workout' ? tr('Was möchtest du optimieren?') : tr('Was möchtest du analysieren?')}</div>
    <div class="scn-ex on" onclick="openAiAnalyze('${mode}', null)"><div class="scn-ex-t">${mode === 'workout' ? tr('Letztes Workout') : tr('Gesamter Fortschritt')}</div></div>
    ${presets.map(p => `<div class="scn-ex" onclick="openAiAnalyze('${mode}',{preset:'${p.id}'})"><div class="scn-ex-t">${esc(p.name)}</div><span style="font-size:11px;font-weight:800;color:var(--acc)">${tr('Split')}</span></div>`).join('')}
    ${mode === 'progress' ? `<div class="scn-ex" onclick="_aiaScopeUI('progress', true)"><div class="scn-ex-t">${tr('Einzelne Übung')}</div></div>` : ''}`;
}
/* Check-in-Lage für die KI: die App hat die Vorschläge lokal schon angepasst
   (s. _ciReadiness) — das muss im Datensatz stehen, sonst empfiehlt die KI
   fröhlich "steigere weiter", während der Plan gerade deloadet. */
function _aiaReadinessBlock() {
  try {
    const r = _ciReadiness();
    if (!r) return {};
    return { readiness: {
      state: r.mode,                                   // deload | hold | easy | push | steady
      fromCheckin: { feel: CI_FEELS.find(f => f.v === r.feel)?.label || null,
                     energy: CI_ENERGIES.find(e => e.v === r.en)?.label || null },
      appliedByApp: { weightFactor: r.wFactor, restFactor: r.restMult,
                      progressionPaused: !!r.hold, bigJumpUnlocked: !!r.bigStep },
      note: r.plain,
    }};
  } catch(_) { return {}; }
}
function _aiaData(mode, scope){
  const sc = scope || null;
  // Split-Fokus: Übungsziele + letzte Bestleistungen des gewählten Presets
  if (sc && sc.preset && (mode === 'workout' || mode === 'progress')) {
    const pr = presetById(sc.preset); if (!pr) return {};
    const ids = pr.exIds || [];
    const exData = ids.map(id => {
      const ex = exById(id); if (!ex) return null;
      const hist = exHistory(id); const last = hist[hist.length - 1];
      const best = last ? _coachTopSet(last.sets) : null;
      return { name: ex.name, muscleGroup: ex.muscleGroup, targetSets: ex.targetSets, repMin: ex.repMin, repMax: ex.repMax,
               lastBest: best ? { w: parseFloat(best.w) || 0, r: parseInt(best.r) || 0, date: (last.date || '').slice(0, 10) } : null,
               bestE1RM: Math.round((exBest1RM(id) || 0) * 10) / 10 };
    }).filter(Boolean);
    if (mode === 'workout') return { scope: 'split', split: pr.name, exercises: exData };
    // progress + Split: Wochen-Volumen nur über die Split-Übungen
    const idSet = new Set(ids);
    const weeks = [];
    for (let i = 0; i < 8; i++) {
      const end = Date.now() - i * 7 * 864e5, start = end - 7 * 864e5;
      let vol = 0, sets = 0, sessions = 0;
      (S.sessions || []).forEach(s => {
        const t = new Date(s.date).getTime();
        if (t < start || t >= end) return;
        let hit = false;
        (s.logs || []).forEach(l => { if (!idSet.has(l.exerciseId)) return; hit = true; vol += setsVolume(l.sets || []); sets += (l.sets || []).length; });
        if (hit) sessions++;
      });
      weeks.unshift({ weeksAgo: i, sessions, sets, volumeKg: Math.round(vol) });
    }
    return { scope: 'split', split: pr.name, weeks, exercises: exData };
  }
  // Übungs-Fokus: e1RM-Verlauf einer einzelnen Übung
  if (sc && sc.exercise && mode === 'progress') {
    const ex = exById(sc.exercise); if (!ex) return {};
    const hist = exHistory(sc.exercise).slice(-10);
    return { scope: 'exercise', exercise: ex.name, muscleGroup: ex.muscleGroup,
      history: hist.map(h => {
        const b = _coachTopSet(h.sets);
        const w = b ? parseFloat(b.w) || 0 : 0, r = b ? parseInt(b.r) || 0 : 0;
        return { date: (h.date || '').slice(0, 10), w, r, e1rm: w && r ? Math.round(epley1RM(w, r) * 10) / 10 : 0 };
      }),
      bestE1RM: Math.round((exBest1RM(sc.exercise) || 0) * 10) / 10,
      target: { sets: ex.targetSets, repMin: ex.repMin, repMax: ex.repMax } };
  }
  if (mode === 'workout') {
    const s = (S.sessions || [])[S.sessions.length - 1];
    if (!s) return {};
    const ci = (S.checkins || []).find(c => c.sid === s.id);
    return {
      date: (s.date || '').slice(0, 10),
      durationMin: Math.round((s.duration || 0) / 60),
      exercises: (s.logs || []).map(l => {
        const ex = exById(l.exerciseId);
        return { name: ex ? ex.name : '?', muscleGroup: ex ? ex.muscleGroup : '',
                 sets: (l.sets || []).map(st => ({ w: parseFloat(st.w) || 0, r: parseInt(st.r) || 0, type: st.type || 'normal' })) };
      }),
      // Check-in dieser Einheit (Premium-only, s. _checkinOpen) — Coach soll
      // subjektives Gefühl/Energie in seine Bewertung einbeziehen, wenn vorhanden.
      ...(ci ? { checkin: { feel: CI_FEELS.find(f => f.v === ci.feel)?.label || null, energy: CI_ENERGIES.find(e => e.v === ci.en)?.label || null } } : {}),
      ..._aiaReadinessBlock(),
    };
  }
  if (mode === 'training') {
    const days = _PL_DAY_KEYS.map(k => {
      const d = S.weekPlan && S.weekPlan[k];
      if (!d || d.type === 'none') return { day:k, rest:true };
      let names = [];
      if (d.type === 'preset') { const pr = presetById(d.id); names = pr ? (pr.exIds || []).map(id => exById(id)?.name).filter(Boolean) : []; }
      else if (d.type === 'exercises') { names = (d.exIds || []).map(id => exById(id)?.name).filter(Boolean); }
      return { day:k, rest: !names.length, exercises: names };
    });
    const since = Date.now() - 28 * 864e5;
    const volByMg = {};
    (S.sessions || []).forEach(s => {
      if (new Date(s.date).getTime() < since) return;
      (s.logs || []).forEach(l => {
        const ex = exById(l.exerciseId); if (!ex || !ex.muscleGroup) return;
        volByMg[ex.muscleGroup] = (volByMg[ex.muscleGroup] || 0) + setsVolume(l.sets || []);
      });
    });
    // Letzte Check-ins (Premium-only, s. _checkinOpen) — Coach soll bei wiederholt
    // schwer/energiearm gemeldeten Einheiten z.B. einen Deload vorschlagen.
    const recentCheckins = (S.checkins || []).slice(-5).map(c => ({
      date: c.d ? String(c.d).slice(0, 10) : null,
      feel: CI_FEELS.find(f => f.v === c.feel)?.label || null,
      energy: CI_ENERGIES.find(e => e.v === c.en)?.label || null,
    }));
    return {
      days, activeDaysPerWeek: days.filter(d => !d.rest).length, targetFreqPerWeek: S.obFreq || null,
      volume4wByMuscle: Object.fromEntries(Object.entries(volByMg).map(([k, v]) => [k, Math.round(v)])),
      ...(recentCheckins.length ? { recentCheckins } : {}),
      ..._aiaReadinessBlock(),
    };
  }
  if (mode === 'progress') {
    const weeks = [];
    for (let i = 0; i < 8; i++) {
      const end = Date.now() - i * 7 * 864e5, start = end - 7 * 864e5;
      let vol = 0, sets = 0, sessions = 0;
      (S.sessions || []).forEach(s => {
        const t = new Date(s.date).getTime();
        if (t < start || t >= end) return;
        sessions++;
        (s.logs || []).forEach(l => { vol += setsVolume(l.sets || []); sets += (l.sets || []).length; });
      });
      weeks.unshift({ weeksAgo:i, sessions, sets, volumeKg: Math.round(vol) });
    }
    const cutoff = Date.now() - 28 * 864e5;
    let prCount = 0;
    const e1rmByEx = {};
    (S.exercises || []).forEach(ex => {
      const hist = exHistory(ex.id); if (!hist.length) return;
      const recent = hist.filter(h => new Date(h.date).getTime() >= cutoff);
      const older   = hist.filter(h => new Date(h.date).getTime() <  cutoff);
      const bestRecent = recent.reduce((m, h) => Math.max(m, setsBest1RM(h.sets)), 0);
      const bestOlder  = older.reduce((m, h) => Math.max(m, setsBest1RM(h.sets)), 0);
      if (bestRecent > 0 && bestRecent > bestOlder) prCount++;
      if (bestRecent > 0) e1rmByEx[ex.name] = Math.round(bestRecent * 10) / 10;
    });
    const topLiftsE1RM = Object.entries(e1rmByEx).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, e1rm]) => ({ name, e1rm }));
    const out = { weeks, prCountLast4w: prCount, topLiftsE1RM };
    if (S.checkins) out.checkins = S.checkins;   // Phase E noch nicht gelandet — nur wenn vorhanden
    return out;
  }
  return {};
}
// Lokale Daten-Kacheln: sofort sichtbar (noch bevor die KI antwortet) — der
// Nutzer sieht direkt echte Zahlen aus seinen Daten, die KI-Bewertung kommt oben drauf.
function _aiaFmtK(n){ return n >= 10000 ? (Math.round(n / 100) / 10).toLocaleString(GT_LOCALE) + 'k' : String(Math.round(n)); }
function _aiaLocalHTML(mode, data){
  try {
    // Split-/Übungs-Fokus hat eigene Datenform — Kacheln nur wo die Form passt
    if (data && data.scope === 'exercise') return '';
    if (data && data.scope === 'split' && mode === 'workout') return '';
    if (mode === 'workout') {
      const exs = data.exercises || []; if (!exs.length) return '';
      let sets = 0, vol = 0, best = null;
      exs.forEach(e => (e.sets || []).forEach(s => {
        if (s.type === 'warmup') return;
        sets++; vol += (s.w || 0) * (s.r || 0);
        if (s.w > 0 && (!best || s.w > best.w)) best = { w: s.w, r: s.r, n: e.name };
      }));
      return `<div class="aia-stats">
        <div class="aia-stat"><div class="aia-stat-v">${data.durationMin || 0}<small> Min</small></div><div class="aia-stat-l">${tr('Dauer')}</div></div>
        <div class="aia-stat"><div class="aia-stat-v">${exs.length}</div><div class="aia-stat-l">${tr('Übungen')}</div></div>
        <div class="aia-stat"><div class="aia-stat-v">${sets}</div><div class="aia-stat-l">${tr('Sätze')}</div></div>
        <div class="aia-stat" style="grid-column:span 3"><div class="aia-stat-v">${_aiaFmtK(vol)}<small> ${unitLabel()}</small>${best ? ` <small style="opacity:.8">· ${tr('Top:')} ${esc(best.n)} ${kgToDisp(best.w)} ${unitLabel()} × ${best.r}</small>` : ''}</div><div class="aia-stat-l">${tr('Gesamtvolumen')}</div></div>
      </div>`;
    }
    if (mode === 'training') {
      const volMg = data.volume4wByMuscle || {};
      const entries = Object.entries(volMg).sort((a, b) => b[1] - a[1]);
      const tot = entries.reduce((a, [, v]) => a + v, 0);
      const max = Math.max(1, ...entries.map(([, v]) => v));
      return `<div class="aia-stats">
        <div class="aia-stat"><div class="aia-stat-v">${data.activeDaysPerWeek || 0}<small>×</small></div><div class="aia-stat-l">${tr('Tage geplant')}</div></div>
        <div class="aia-stat"><div class="aia-stat-v">${data.targetFreqPerWeek || '–'}<small>${data.targetFreqPerWeek ? '×' : ''}</small></div><div class="aia-stat-l">${tr('Dein Ziel')}</div></div>
        <div class="aia-stat"><div class="aia-stat-v">${_aiaFmtK(tot)}<small> ${unitLabel()}</small></div><div class="aia-stat-l">${tr('Volumen 4 Wo.')}</div></div>
      </div>
      ${entries.length ? `<div class="aia-sec" style="margin-top:4px"><div class="aia-sec-t">${tr('Muskelgruppen-Balance (4 Wochen)')}</div>
        ${entries.map(([mg, v]) => `<div class="aia-hrow">
          <span class="aia-hrow-l">${esc(muscleLabel(mg) || mg)}</span>
          <div class="aia-hrow-bar"><div class="aia-hrow-fill" style="width:${Math.round(v / max * 100)}%"></div></div>
          <span class="aia-hrow-v">${_aiaFmtK(v)}</span></div>`).join('')}</div>` : ''}`;
    }
    if (mode === 'progress') {
      const weeks = data.weeks || []; if (!weeks.length) return '';
      const cur = weeks[weeks.length - 1] || {};
      const totVol = weeks.reduce((a, w) => a + (w.volumeKg || 0), 0);
      const maxVol = Math.max(1, ...weeks.map(w => w.volumeKg || 0));
      const avgSes = Math.round(weeks.reduce((a, w) => a + (w.sessions || 0), 0) / weeks.length * 10) / 10;
      return `<div class="aia-stats">
        <div class="aia-stat"><div class="aia-stat-v">${data.prCountLast4w || 0}</div><div class="aia-stat-l">${tr('PRs (4 Wo.)')}</div></div>
        <div class="aia-stat"><div class="aia-stat-v">${cur.sessions || 0}<small>×</small></div><div class="aia-stat-l">${tr('Diese Woche')}</div></div>
        <div class="aia-stat"><div class="aia-stat-v">${String(avgSes).replace('.', GT_DEC)}<small>×</small></div><div class="aia-stat-l">${tr('Ø pro Woche')}</div></div>
      </div>
      <div class="aia-sec" style="margin-top:4px"><div class="aia-sec-t">${tr('Volumen-Trend (8 Wochen)')} · ${_aiaFmtK(totVol)} ${unitLabel()}</div>
        <div class="aia-bars">${weeks.map((w, i) => `<div class="aia-bar${i === weeks.length - 1 ? ' hi' : ''}">
          <i style="height:${Math.max(4, Math.round((w.volumeKg || 0) / maxVol * 52))}px"></i>
          <b>${i === weeks.length - 1 ? tr('jetzt') : '-' + (weeks.length - 1 - i)}</b></div>`).join('')}</div></div>
      ${Array.isArray(data.topLiftsE1RM) && data.topLiftsE1RM.length ? `<div class="aia-sec"><div class="aia-sec-t">${tr('Stärkste Übungen (e1RM)')}</div>
        ${(() => { const mx = Math.max(1, ...data.topLiftsE1RM.map(t => t.e1rm)); return data.topLiftsE1RM.map(t => `<div class="aia-hrow">
          <span class="aia-hrow-l">${esc(t.name)}</span>
          <div class="aia-hrow-bar"><div class="aia-hrow-fill" style="width:${Math.round(t.e1rm / mx * 100)}%"></div></div>
          <span class="aia-hrow-v">${kgToDisp(t.e1rm)} ${unitLabel()}</span></div>`).join(''); })()}</div>` : ''}`;
    }
  } catch(e) { console.warn('[Analyse] Kacheln:', e); }
  return '';
}
// KI-Vorschläge mit "Übernehmen"-Button: schreiben direkt in die Übungs-Ziele
let _aiaActions = [];
// Fokus der zuletzt geöffneten Analyse ({preset:id} / {exercise:id} / null). Wird
// beim Übernehmen gebraucht: eine neue Übung gehört in DEN Split, den die KI
// gerade bewertet hat — sonst landet sie nur in der Bibliothek und der Nutzer
// sieht im Training weiterhin nichts davon.
let _aiaScope = null;
function _aiaApply(i){
  const ac = _aiaActions[i]; if (!ac) return;
  const validMg = ['brust','ruecken','beine','arme','schultern','core'];
  const nm = String(ac.exercise || '').trim().slice(0, 60); if (!nm) return;
  const clampI = (v, lo, hi, dflt) => { v = parseInt(v); return isNaN(v) ? dflt : Math.max(lo, Math.min(hi, v)); };
  let ex = S.exercises.find(e => e.name.toLowerCase() === nm.toLowerCase());
  let where = tr('Ziel angepasst');
  if (ac.kind === 'addEx') {
    if (ex) { _dndToast('Übung ist schon in deiner Liste.'); }
    else if (S.exercises.length >= 500) { _dndToast('Übungslimit erreicht.'); return; }
    else {
      const rMin = clampI(ac.repMin, 1, 29, 8), rMax = Math.max(rMin, clampI(ac.repMax, 1, 30, 12));
      ex = {
        id: uid(), name: nm, emoji: '',   // KI-Übungen ohne Emoji (Lenny-Regel)
        muscleGroup: validMg.includes(ac.muscleGroup) ? ac.muscleGroup : '',
        targetSets: clampI(ac.sets, 1, 8, 3), targetReps: rMax, targetWeight: 0, targetType: 'reps',
        repMin: rMin, repMax: rMax, weightScheme: 'straight',
      };
      S.exercises.push(ex);
      try { ensureExGroups(ex); } catch(_){}
    }
    // In den analysierten Split aufnehmen — das ist der Ort, an dem der Nutzer
    // die Empfehlung erwartet ("direkt im Split übernommen").
    const preset = ex && _aiaScope && _aiaScope.preset
      ? (S.workoutPresets || []).find(p => p.id === _aiaScope.preset) : null;
    if (preset) {
      preset.exIds = Array.isArray(preset.exIds) ? preset.exIds : [];
      if (preset.exIds.indexOf(ex.id) === -1) preset.exIds.push(ex.id);
      where = tr('ergänzt in') + ' ' + preset.name;
    } else {
      where = tr('zu deinen Übungen hinzugefügt');
    }
  } else if (!ex) { _dndToast('Übung nicht gefunden — Name geändert?'); return; }
  else if (ac.kind === 'sets') {
    ex.targetSets = clampI(ac.sets, 1, 8, ex.targetSets);
    ex.targetSetsAt = Date.now();   // s. buildPlannedSets — sonst plant das nächste Training weiter alt
    where = tr('neues Ziel') + ': ' + ex.targetSets + ' ' + tr('Sätze');
  } else if (ac.kind === 'reps') {
    const rMin = clampI(ac.repMin, 1, 29, ex.repMin), rMax = Math.max(rMin, clampI(ac.repMax, 1, 30, ex.repMax));
    ex.repMin = rMin; ex.repMax = rMax; ex.targetReps = rMax;
    ex.targetSetsAt = Date.now();
    where = tr('neues Ziel') + ': ' + rMin + '–' + rMax + ' ' + tr('Wdh');
  } else return;
  persist();
  // Läuft die Übung gerade im offenen Training? Dann direkt dort nachziehen.
  const inWk = ex ? syncTargetToActiveWk(ex.id) : false;
  try { renderExList(); renderHome(); } catch(_){}
  const row = document.getElementById('aia-act-' + i);
  const btn = row && row.querySelector('button');
  if (btn) btn.outerHTML = `<span style="color:#30d158;font-weight:800;font-size:13px;display:inline-flex;align-items:center;gap:4px;flex-shrink:0">${ICO.check({s:14})} ${tr('Übernommen')}</span>`;
  haptic(16);
  // _dndToast setzt textContent — hier bewusst KEIN esc(), sonst stünden Entities drin.
  _dndToast(nm + ' · ' + where + (inWk ? ' · ' + tr('im laufenden Training aktualisiert') : ''));
}
// Zahlen in Beobachtungen/Empfehlungen hervorheben — die Aussage soll beim
// Überfliegen an der Zahl hängen bleiben, nicht am Satzbau. Läuft NACH esc(),
// arbeitet also auf bereits escaptem Text (keine XSS-Lücke).
function _aiaNums(s){
  return esc(String(s || '')).replace(/([+−-]?\d+(?:[.,]\d+)?\s?(?:%|kg|lbs|x|×)?)/g,
    '<b style="color:var(--text);font-weight:800">$1</b>');
}
// Kennzahlen-Raster der KI (3-4 Werte mit Trendpfeil). Ersetzt die frühere
// Aufzählung in Fließtext — dieselbe Aussage, aber auf einen Blick erfassbar.
function _aiaMetricsHTML(a){
  const ms = Array.isArray(a.metrics) ? a.metrics.filter(m => m && m.label && m.value != null).slice(0, 4) : [];
  if (!ms.length) return '';
  const arrow = { up:'▲', down:'▼', flat:'▬' };
  return `<div class="aia-stats" style="margin-top:4px">${ms.map(m => {
    const t = String(m.trend || '').toLowerCase();
    const col = m.good === false ? '#ff6b6b' : (m.good === true ? '#2ea84a' : 'var(--text2)');
    return `<div class="aia-stat">
      <div class="aia-stat-v">${esc(String(m.value))}${m.unit ? `<small> ${esc(String(m.unit))}</small>` : ''}</div>
      <div class="aia-stat-l">${esc(String(m.label))}${arrow[t] ? ` <span style="color:${col}">${arrow[t]}</span>` : ''}</div>
    </div>`;
  }).join('')}</div>`;
}
// Ist-gegen-Soll-Balken. Der Soll-Wert steht als Markierung im Balken, damit
// sofort sichtbar ist, ob ein Wert unter oder über dem Richtwert liegt.
function _aiaBarsHTML(a){
  const bs = Array.isArray(a.bars) ? a.bars.filter(b => b && b.label && typeof b.value === 'number').slice(0, 6) : [];
  if (!bs.length) return '';
  const max = Math.max(1, ...bs.map(b => Math.max(b.value || 0, b.target || 0)));
  return `<div class="aia-sec"><div class="aia-sec-t">${tr('Ist gegen Richtwert')}</div>
    ${bs.map(b => {
      const pct = Math.round(Math.min(1, (b.value || 0) / max) * 100);
      const tp  = typeof b.target === 'number' ? Math.round(Math.min(1, b.target / max) * 100) : null;
      const low = tp != null && b.value < b.target;
      return `<div class="aia-hrow">
        <span class="aia-hrow-l">${esc(String(b.label))}</span>
        <div class="aia-hrow-bar">
          <div class="aia-hrow-fill" style="width:${pct}%${low ? ';background:#ff9f0a' : ''}"></div>
          ${tp != null ? `<i style="position:absolute;left:${tp}%;top:0;bottom:0;width:2px;background:var(--text2);opacity:.75"></i>` : ''}
        </div>
        <span class="aia-hrow-v">${esc(String(b.value))}${b.unit ? ' ' + esc(String(b.unit)) : ''}</span></div>`;
    }).join('')}</div>`;
}
function _aiaShow(a, localHTML){
  const el = document.getElementById('aia-body'); if (!el) return;
  const hasScore = typeof a.score === 'number';
  const score = hasScore ? Math.max(0, Math.min(100, Math.round(a.score))) : null;
  const circ = 2 * Math.PI * 38;
  const hasPoints = Array.isArray(a.points) && a.points.length;
  const hasRecos  = Array.isArray(a.recos)  && a.recos.length;
  _aiaActions = Array.isArray(a.actions) ? a.actions.filter(x => x && x.label && x.kind && x.exercise).slice(0, 3) : [];
 el.innerHTML =`    ${localHTML || ''}
    ${hasScore ? `
    <div class="aia-score-wrap">
      <div class="aia-ring"><svg width="86" height="86">
        <circle cx="43" cy="43" r="38" stroke="var(--inp-bg)" stroke-width="8" fill="none"/>
        <circle cx="43" cy="43" r="38" stroke="var(--acc)" stroke-width="8" fill="none" stroke-linecap="round"
          stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - score / 100)}"/></svg>
        <div class="aia-ring-num">${score}</div>
      </div>
      <div style="flex:1;font-size:14.5px;line-height:1.55">${esc(a.summary || '')}</div>
    </div>` : (a.summary ? `<div class="card" style="padding:14px;font-size:14.5px;line-height:1.55">${esc(a.summary)}</div>` : '')}
    ${_aiaMetricsHTML(a)}
    ${_aiaBarsHTML(a)}
    ${hasPoints ? `<div class="aia-sec"><div class="aia-sec-t">${tr('Beobachtungen')}</div>
      ${a.points.map(p => `<div class="aia-item"><div class="aia-dot"></div><div>${_aiaNums(p)}</div></div>`).join('')}</div>` : ''}
    ${hasRecos ? `<div class="aia-sec"><div class="aia-sec-t">${tr('Empfehlungen')}</div>
      ${a.recos.map(r => `<div class="aia-item"><div class="aia-dot" style="background:#2ea84a"></div><div>${_aiaNums(r)}</div></div>`).join('')}</div>` : ''}
    ${_aiaActions.length ? `<div class="aia-sec"><div class="aia-sec-t">${tr('Direkt übernehmen')}</div>
      ${_aiaActions.map((ac, i) => `<div class="aia-act" id="aia-act-${i}">
        <div style="flex:1;min-width:0"><div class="aia-act-t">${esc(ac.label)}</div>${ac.why ? `<div class="aia-act-s">${esc(ac.why)}</div>` : ''}</div>
        <button class="btn btn-acc" style="width:auto;padding:9px 14px;font-size:13px;flex-shrink:0" onclick="_aiaApply(${i})">${tr('Übernehmen')}</button>
      </div>`).join('')}</div>` : ''}
    ${(!hasScore && !a.summary && !hasPoints && !hasRecos && !(a.metrics||[]).length && !(a.bars||[]).length) ? `<div style="text-align:center;padding:24px 12px;color:var(--text2);font-size:14px">${tr('Keine Auswertung erhalten.')}</div>` : ''}
  `;
}
async function openAiAnalyze(mode, scope){
  const el = document.getElementById('aia-body'); if (!el) return;
  const titleEl = document.getElementById('aia-title');
  if (titleEl) titleEl.textContent = tr(_AIA_TITLES[mode] || 'Analyse');
  openOv('ov-ai-analyze');
  // Workout optimieren / Fortschritt: erst den Fokus wählen (gesamt/Split/Übung)
  if ((mode === 'workout' || mode === 'progress') && scope === undefined) { _aiaScopeUI(mode); return; }
  _aiaScope = scope || null;   // s. _aiaApply: neue Übungen gehören in DEN analysierten Split
  const data = _aiaData(mode, scope);
  // Lokale Zahlen SOFORT zeigen — die KI-Bewertung kommt asynchron oben drauf
  const local = _aiaLocalHTML(mode, data);
  el.innerHTML = `${local}<div style="text-align:center;padding:${local ? 18 : 34}px 12px;color:var(--text2);font-size:14.5px">
    <div class="aic-typing" style="justify-content:center;display:flex;margin:0 auto 14px"><span></span><span></span><span></span></div>
    ${tr('Dein Coach bewertet die Zahlen…')}</div>`;
  const res = await aiCall('analyze', { mode, data });
  if (!res || !res.a) {
    el.innerHTML = `${local}<div style="text-align:center;padding:20px 12px;color:var(--text2);font-size:14px;line-height:1.6">${tr('Analyse gerade nicht möglich.')}</div>`;
    return;
  }
  _aiaShow(res.a, local);
}


// Changelog-Popup deaktiviert

// ── PWA ICON + MANIFEST + SERVICE WORKER ──────────────
(function pwaSetup(){
  /* ── Canvas Icon Generator ── */
  function makeIcon(sz){
    const c=document.createElement('canvas');
    c.width=c.height=sz;
    const ctx=c.getContext('2d');
    const r=sz*.225;

    // rounded-rect path helper
    function rr(x,y,w,h,cr){
      ctx.beginPath();
      ctx.moveTo(x+cr,y);
      ctx.arcTo(x+w,y,x+w,y+h,cr);
      ctx.arcTo(x+w,y+h,x,y+h,cr);
      ctx.arcTo(x,y+h,x,y,cr);
      ctx.arcTo(x,y,x+w,y,cr);
      ctx.closePath();
    }

    // — Background gradient —
    const bg=ctx.createLinearGradient(0,0,sz,sz);
    bg.addColorStop(0,'#5B3FFD');
    bg.addColorStop(.45,'#007AFF');
    bg.addColorStop(1,'#30C8FA');
    rr(0,0,sz,sz,r);
    ctx.fillStyle=bg;
    ctx.fill();

    // — Inner glow ring —
    rr(0,0,sz,sz,r);
    ctx.clip();
    const glow=ctx.createRadialGradient(sz*.5,sz*.15,sz*.05,sz*.5,sz*.35,sz*.65);
    glow.addColorStop(0,'rgba(255,255,255,.22)');
    glow.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=glow;
    ctx.fillRect(0,0,sz,sz);

    // — Top sheen —
    const sheen=ctx.createLinearGradient(0,0,0,sz*.55);
    sheen.addColorStop(0,'rgba(255,255,255,.40)');
    sheen.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=sheen;
    ctx.fillRect(0,0,sz,sz*.55);

    // — Dumbbell icon —
    ctx.fillStyle='rgba(255,255,255,.96)';
    const cx=sz/2, cy=sz/2;
    const bw=sz*.36, bh=sz*.058;
    const pw=sz*.082, ph=sz*.29, pr=sz*.024;

    // Bar
    ctx.fillRect(cx-bw/2,cy-bh/2,bw,bh);
    // Left plate
    rr(cx-bw/2-pw,cy-ph/2,pw,ph,pr); ctx.fill();
    // Right plate
    rr(cx+bw/2,cy-ph/2,pw,ph,pr); ctx.fill();

    // — Border highlight —
    ctx.save();
    rr(1,1,sz-2,sz-2,r-.5);
    ctx.strokeStyle='rgba(255,255,255,.28)';
    ctx.lineWidth=2;
    ctx.stroke();
    ctx.restore();

    return c.toDataURL('image/png');
  }

  const icon512 = makeIcon(512);
  const icon192 = makeIcon(192);

  /* ── Set apple-touch-icon ── */
  const ati=document.getElementById('pwa-icon');
  if(ati) ati.href=icon512;

  /* ── Inject dynamic manifest with inline icons ── */
  try{
    const manifest={
      name:'MyGymTrack',
      short_name:'MyGymTrack',
      description:'Dein persönlicher Fitness-Tracker',
      start_url:'./index.html',
      scope:'./',
      display:'standalone',
      orientation:'portrait-primary',
      background_color:'#f4f4f9',
      theme_color:'#007AFF',
      icons:[
        {src:icon192,sizes:'192x192',type:'image/png'},
        {src:icon512,sizes:'512x512',type:'image/png',purpose:'any maskable'}
      ]
    };
    const blob=new Blob([JSON.stringify(manifest)],{type:'application/json'});
    const ml=document.querySelector('link[rel="manifest"]');
    if(ml) ml.href=URL.createObjectURL(blob);
  }catch(e){}

  /* ── Hochformat erzwingen (Web/PWA) ── */
  function _lockPortrait(){
    try{
      const o = screen.orientation;
      if (o && typeof o.lock === 'function') o.lock('portrait').catch(()=>{});
    }catch(e){}
  }
  _lockPortrait();
  window.addEventListener('orientationchange', _lockPortrait);
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) _lockPortrait(); });

  /* ── PWA Install Prompt (Android) ── */
  let _installPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _installPrompt = e;
    const sec = document.getElementById('install-section');
    if (sec) sec.style.display = '';
  });
  window.triggerInstall = async () => {
    if (!_installPrompt) return;
    _installPrompt.prompt();
    const { outcome } = await _installPrompt.userChoice;
    if (outcome === 'accepted') {
      _installPrompt = null;
      const sec = document.getElementById('install-section');
      if (sec) sec.style.display = 'none';
    }
  };

  /* ── Register Service Worker ── */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then(reg => {
        swReg = reg;
        console.log('[GymTrack] SW registered', reg.scope);

        // ── Standard-Update-Flow (funktioniert auf Android & iOS) ──
        // Neuer SW wartet bereits (z.B. Tab war offen beim Deployment)
        if (reg.waiting) _handleWaitingWorker(reg.waiting);

        // Neuer SW wird gefunden (Browser hat sw.js neu heruntergeladen)
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            // 'installed' + controller vorhanden = echter Update (nicht Erstinstallation)
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              _handleWaitingWorker(nw);
            }
          });
        });

        // Wenn neuer SW die Kontrolle übernimmt → nur neu laden wenn Update aktiv angefordert
        let _reloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (window._swUpdateRequested && !_reloading) { _reloading = true; window.location.reload(); }
        });

        // Browser anweisen, sw.js jetzt vom Server zu holen und zu vergleichen
        // (triggert updatefound wenn die Datei sich geändert hat)
        reg.update().catch(() => {});
      })
      .catch(e => console.warn('[GymTrack] SW skip:', e.message));
  }
})();

