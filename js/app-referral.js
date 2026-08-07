/* ═══════════════════════════════════════════════════════════════════════════
   REFERRAL — Gratis-Premium durch Einladung
   ───────────────────────────────────────────────────────────────────────────
   Wer seinen Code weitergibt und eine Einlösung auslöst, bekommt 7 Tage Premium
   geschenkt, der Geworbene ebenfalls. Deckel: 2 Einlösungen JE CODE — danach ist
   der Code tot, auch für Fremde (sonst verschafft ein öffentlich geposteter Code
   beliebig vielen Fremden Gratis-Premium samt KI).

   Quelle der Wahrheit ist AUSSCHLIESSLICH der Worker (KV-Namespace gymtrack-ref).
   Was hier in localStorage liegt, ist reine Anzeige: die teure Seite (KI) prüft
   der Worker bei jeder Anfrage selbst. Wer den Cache manipuliert, schaltet
   höchstens Oberfläche frei — genau wie beim bestehenden gt_premiumDev.

   Anonyme Konten sind ausgeschlossen. Die App meldet beim Start automatisch
   anonym an; ohne diese Grenze wäre "App-Daten löschen" ein Ein-Klick-Weg zu
   einer neuen Gratiswoche, beliebig oft.
   Design: docs/superpowers/specs/2026-08-07-referral-gratiswoche-design.md
   ═══════════════════════════════════════════════════════════════════════════ */

const REF_SYNC_MS = 3600e3;   // /ref/status höchstens einmal pro Stunde

let REF = (() => {
  const base = { code:null, trialExp:0, invited:0, maxRedeems:2, usedCode:null,
                 aiUsed:0, aiLimit:15, anon:true, ts:0 };
  try { return Object.assign(base, JSON.parse(localStorage.getItem('gt_ref')) || {}); }
  catch(_) { return base; }
})();
function _refSave(){ try { localStorage.setItem('gt_ref', JSON.stringify(REF)); } catch(_){} }

function refTrialActive(){ return !!(REF.trialExp && REF.trialExp > Date.now()); }
function refDaysLeft(){ return Math.max(0, Math.ceil((REF.trialExp - Date.now()) / 864e5)); }
function refCanEarn(){ return (REF.invited || 0) < (REF.maxRedeems || 2); }

/* ── Worker-Aufruf. Immer POST, damit das idToken im Body bleibt und nicht als
   Query-Parameter in Server-Logs landet. ──────────────────────────────────── */
async function _refCall(path, body){
  let u = null; try { u = _fbUser; } catch(_) {}
  if (!u) return { error:'auth' };
  if (u.isAnonymous) return { error:'anon' };
  let idToken;
  try { idToken = await u.getIdToken(); } catch(_) { return { error:'auth' }; }
  try {
    const res = await fetch(AI_WORKER_URL + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, ...(body || {}) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || ('HTTP ' + res.status) };
    return data;
  } catch(e) { return { error: String(e && e.message || e) }; }
}

/* Antwort von /ref/me bzw. /ref/status übernehmen und Premium nachziehen. */
function _refAdopt(d){
  if (!d || d.error) return false;
  REF = { ...REF, code: d.code || null, trialExp: d.trialExp || 0, invited: d.invited || 0,
          maxRedeems: d.maxRedeems || 2, usedCode: d.usedCode || null,
          aiUsed: d.aiUsed || 0, aiLimit: d.aiLimit || 15, anon: !!d.anon, ts: Date.now() };
  _refSave();
  refApplyTrial();
  return true;
}

/* Trial in den Premium-Zustand spiegeln. Ein echtes Abo hat immer Vorrang: es
   liefert den JWS, den der KI-Worker sehen will — den würde ein Trial-Eintrag
   überschreiben und die KI damit für einen Zahler abwürgen. */
function refApplyTrial(){
  try {
    if (PREM.active && PREM.src === 'store') return;
    if (refTrialActive()) {
      if (PREM.src !== 'trial' || PREM.exp !== REF.trialExp) {
        PREM = { active:true, plan:'trial', exp: REF.trialExp, jws:null, src:'trial' };
        _premSave(); premRefreshUI();
      }
    } else if (PREM.src === 'trial') {
      PREM = { active:false, plan:null, exp:null, jws:null, src:null };
      _premSave(); premRefreshUI();
      _refTrialOverHint();
    }
  } catch(_) {}
}

/* Einmaliger Hinweis, wenn die geschenkte Zeit abgelaufen ist — ohne den wirkt
   das plötzliche Verschwinden der KI wie ein Fehler. */
function _refTrialOverHint(){
  try {
    if (localStorage.getItem('gt_refOverSeen') === String(REF.trialExp || 0)) return;
    localStorage.setItem('gt_refOverSeen', String(REF.trialExp || 0));
    if (typeof _dndToast === 'function') _dndToast(tr('Dein Gratis-Premium ist vorbei.'));
  } catch(_) {}
}

/* Stand vom Worker holen. force=true umgeht die Stundensperre (nach Einlösung,
   beim Öffnen des Sheets). withCode ruft /ref/me, das zusätzlich den Code anlegt. */
async function refSync(force, withCode){
  if (!force && REF.ts && (Date.now() - REF.ts) < REF_SYNC_MS) { refApplyTrial(); return REF; }
  const d = await _refCall(withCode ? '/ref/me' : '/ref/status');
  if (d && d.error === 'anon') { REF.anon = true; _refSave(); return REF; }
  _refAdopt(d);
  return REF;
}

/* ── Einlösen ─────────────────────────────────────────────────────────────── */

const _REF_REASON = {
  anonymous:        'Melde dich mit Apple oder Google an, dann klappt es.',
  unknown:          'Diesen Code gibt es nicht.',
  self:             'Das ist dein eigener Code.',
  already_redeemed: 'Du hast schon einen Einladungscode eingelöst.',
  code_exhausted:   'Dieser Code wurde schon zweimal eingelöst.',
  unavailable:      'Einladungen sind gerade nicht verfügbar. Später nochmal versuchen.',
};

async function refRedeemCode(code, opts){
  const c = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!c) return false;
  const d = await _refCall('/ref/redeem', { code: c });
  if (d && d.error) {
    if (d.error === 'anon') { _dndToast(tr(_REF_REASON.anonymous)); return false; }
    _dndToast(tr('Einlösen fehlgeschlagen: ') + d.error);
    return false;
  }
  if (!d || !d.ok) {
    _dndToast(tr(_REF_REASON[d && d.reason] || _REF_REASON.unavailable));
    return false;
  }
  await refSync(true, true);
  try { haptic(30); } catch(_){}
  _dndToast(tr('Premium freigeschaltet — 7 Tage geschenkt!'));
  if (!(opts && opts.keepSheet)) { try { closeOv('ov-invite'); } catch(_){} }
  return true;
}

/* Gemerkten Link-Code einlösen (?ref=CODE / gymtrack://ref/CODE). Läuft nach dem
   Login — vorher gibt es kein idToken, mit dem der Worker etwas anfangen könnte. */
async function refRedeemPending(){
  let c = null;
  try { c = localStorage.getItem('gt_refPending'); } catch(_){}
  if (!c) return false;
  let u = null; try { u = _fbUser; } catch(_) {}
  if (!u || u.isAnonymous) return false;          // später erneut versuchen
  try { localStorage.removeItem('gt_refPending'); } catch(_){}
  return await refRedeemCode(c);
}

/* ── Paywall-Banner ───────────────────────────────────────────────────────── */

function refBannerHTML(){
  const aktiv = refTrialActive();
  const tage  = refDaysLeft();
  if (refCanEarn()) {
    const titel = aktiv
      ? tr('Gratis-Premium noch') + ' ' + tage + ' ' + tr(tage === 1 ? 'Tag' : 'Tage')
      : tr('1 Woche Premium gratis');
    const sub = aktiv
      ? tr('Du kannst dir noch eine Woche holen: lade einen Freund ein.')
      : tr('Lade einen Freund ein — löst er deinen Code ein, bekommt ihr beide eine Woche Premium geschenkt.');
    return `<button class="ref-banner" onclick="openInviteSheet()">
      <span class="ref-banner-ico">${ICO.users({s:20})}</span>
      <span class="ref-banner-txt"><b>${esc(titel)}</b><small>${esc(sub)}</small></span>
      <span class="ref-banner-arrow">${ICO.share({s:16})}</span>
    </button>`;
  }
  if (aktiv) {
    return `<div class="ref-banner ref-banner-static">
      <span class="ref-banner-ico">${ICO.check({s:20})}</span>
      <span class="ref-banner-txt"><b>${esc(tr('Deine Gratis-Wochen laufen noch') + ' ' + tage + ' ' + tr(tage === 1 ? 'Tag' : 'Tage'))}</b>
      <small>${esc(tr('Danach geht es mit Premium weiter.'))}</small></span>
    </div>`;
  }
  return '';   // Deckel erreicht und nichts mehr aktiv — kein toter Hinweis
}

/* ── Einladen-Sheet ───────────────────────────────────────────────────────── */

function openInviteSheet(){
  try { haptic(8); } catch(_){}
  openOv('ov-invite');
  _refRender();
  refSync(true, true).then(() => _refRender());
}

function _refRender(){
  const el = document.getElementById('inv-body'); if (!el) return;
  let u = null; try { u = _fbUser; } catch(_) {}
  const angemeldet = !!(u && !u.isAnonymous);
  const rest = Math.max(0, (REF.maxRedeems || 2) - (REF.invited || 0));

  if (!angemeldet) {
    el.innerHTML = `<div class="ref-empty">${ICO.users({s:34})}
      <h3>${tr('Erst anmelden')}</h3>
      <p>${tr('Gratis-Wochen gibt es nur für angemeldete Konten (Apple oder Google) — sonst könnte man sie beliebig oft neu holen.')}</p></div>`;
    return;
  }

  const codeBlock = REF.code
    ? `<button class="ref-code" onclick="refCopyCode(this)" aria-label="${tr('Code kopieren')}">${esc(REF.code)}</button>`
    : `<div class="ref-code ref-code-load">…</div>`;

  const status = refTrialActive()
    ? tr('Aktiv bis') + ' ' + new Date(REF.trialExp).toLocaleDateString(GT_LOCALE)
    : tr('Noch keine Gratis-Woche eingelöst.');

  el.innerHTML = `
    <div class="ref-hero">
      <div class="ref-hero-ico">${ICO.sparkle({s:26})}</div>
      <h3>${tr('Beide bekommen eine Woche')}</h3>
      <p>${tr('Löst ein Freund deinen Code ein, bekommt ihr beide 7 Tage Premium geschenkt.')}</p>
    </div>
    ${codeBlock}
    <div class="ref-steps">
      <div><span>1</span>${tr('Code oder Link teilen')}</div>
      <div><span>2</span>${tr('Freund lädt die App und gibt den Code ein')}</div>
      <div><span>3</span>${tr('Premium läuft bei euch beiden sofort')}</div>
    </div>
    <button class="btn btn-acc ref-share" onclick="refShare()">${ICO.share({s:16})} ${tr('Einladung teilen')}</button>
    <button class="btn ref-qr-btn" onclick="refShowQR()">${tr('QR-Code anzeigen')}</button>
    <div id="ref-qr-host" data-on="0"></div>
    <div class="ref-status">
      <b>${esc((REF.invited || 0) + ' ' + tr('von') + ' ' + (REF.maxRedeems || 2) + ' ' + tr('Gratis-Wochen geholt'))}</b>
      <small>${esc(status)}</small>
      <small>${esc(rest > 0
        ? tr('Dein Code funktioniert noch für') + ' ' + rest + ' ' + tr(rest === 1 ? 'Einlösung' : 'Einlösungen') + '.'
        : tr('Dein Code ist aufgebraucht.'))}</small>
    </div>
    ${REF.usedCode ? '' : `<button class="ref-link" onclick="refAskCode()">${tr('Ich habe einen Einladungscode')}</button>`}`;
}

/* Der https-Link ist nur der klickbare TRÄGER (in iMessage/WhatsApp/QR anklickbar,
   gymtrack:// waere es nicht). Er landet NICHT in der Web-App: js/app-boot.js
   springt beim ?ref-Aufruf erst per Deep-Link in eine installierte App und
   schickt den Rest in den App Store — die native App ist das Ziel. */
function refLink(){
  const web = (typeof GT_WEB === 'string' && GT_WEB) ? GT_WEB : '';
  return web ? web.replace(/\/?$/, '/') + '?ref=' + (REF.code || '') : 'gymtrack://ref/' + (REF.code || '');
}
function refCopyCode(btn){
  if (!REF.code) return;
  try { navigator.clipboard.writeText(REF.code); } catch(_){}
  try { haptic(6); } catch(_){}
  if (btn) { const alt = btn.textContent; btn.textContent = tr('Kopiert'); setTimeout(() => { btn.textContent = alt; }, 1400); }
}
async function refShare(){
  if (!REF.code) return;
  try { haptic(8); } catch(_){}
  // Der Code steht bewusst IM Text: nach dem Umweg über den App Store kennt die
  // frisch installierte App ihn nicht (iOS hat keinen Install-Referrer), er muss
  // also lesbar bleiben und wird in der App unter „Ich habe einen
  // Einladungscode" eingegeben.
  const txt = tr('Hol dir MyGymTrack — mit meinem Code bekommen wir beide eine Woche Premium gratis. Code: ')
            + REF.code + '\n' + refLink()
            + '\n' + tr('Link öffnen, App laden, Code eingeben.');
  try {
    if (navigator.share) { await navigator.share({ text: txt }); return; }
  } catch(_) { return; }   // Teilen-Dialog abgebrochen
  try {
    navigator.clipboard.writeText(txt);
    if (typeof showUpdateToast === 'function') showUpdateToast(tr('Einladung kopiert'), { autoHide: 2200 });
  } catch(_){}
}
/* QR über dasselbe lazy geladene qrcodejs wie Crew- und Freundescode. */
function refShowQR(){
  const host = document.getElementById('ref-qr-host'); if (!host || !REF.code) return;
  if (host.dataset.on === '1') { host.dataset.on = '0'; host.innerHTML = ''; return; }
  host.dataset.on = '1';
  host.innerHTML = `<div class="soc-empty" style="padding:10px">${tr('Lade QR-Code…')}</div>`;
  const bauen = () => {
    host.innerHTML = '';
    try { new QRCode(host, { text: refLink(), width: 168, height: 168, correctLevel: QRCode.CorrectLevel.M }); }
    catch(_) { host.innerHTML = `<div class="soc-empty" style="padding:10px">${tr('QR-Code nicht verfügbar')}</div>`; }
  };
  if (window.QRCode) return bauen();
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
  s.onload = bauen;
  s.onerror = () => { host.innerHTML = `<div class="soc-empty" style="padding:10px">${tr('QR-Code nicht verfügbar')}</div>`; };
  document.head.appendChild(s);
}

function refAskCode(){
  const c = prompt(tr('Einladungscode eingeben:'));
  if (!c) return;
  refRedeemCode(c, { keepSheet: true }).then(ok => { if (ok) _refRender(); });
}

/* ── Konto-Löschung ───────────────────────────────────────────────────────── */
/* MUSS vor window.FB.deleteUser() laufen: danach gibt es kein gültiges idToken
   mehr, und die Einträge im Worker-KV blieben liegen (Apple 5.1.1(v)/DSGVO). */
async function refForget(){
  try { await _refCall('/ref/forget'); } catch(_){}
  REF = { code:null, trialExp:0, invited:0, maxRedeems:2, usedCode:null, aiUsed:0, aiLimit:15, anon:true, ts:0 };
  _refSave();
  try { localStorage.removeItem('gt_refPending'); localStorage.removeItem('gt_refOverSeen'); } catch(_){}
}
