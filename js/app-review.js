/* ══════════════════════════════════════════════════════════════════════════
   APP-BEWERTUNG (App-Store-Rating-Prompt)

   Zwei getrennte Wege, bewusst nicht vermischt:

   1) NATIV (iOS): Apples eigener Dialog via `ReviewPlugin` →
      `AppStore.requestReview(in:)` bzw. `SKStoreReviewController`. Das ist das
      Popup, das der Nutzer aus anderen Apps kennt — es sieht nicht nur nativ
      aus, es IST das System-Popup. Bewertet wird direkt darin, ohne die App
      zu verlassen. Ob es erscheint, entscheidet iOS allein (max. drei
      Anzeigen pro 365 Tage, ohne Rueckmeldung an die App). Genau deshalb wird
      hier NIE ein Ersatzdialog nachgeschoben, wenn nichts kommt: sonst haette
      man zwei Popups uebereinander, sobald iOS doch anzeigt. Apple verbietet
      ausserdem, den System-Dialog an eine Button-Aktion zu haengen — er darf
      nur unaufgefordert nach einem positiven Moment auftauchen.

   2) WEB/PWA: dort gibt es keinen System-Dialog. Fuer diesen Kanal steht ein
      nachgebauter Dialog im Stil eines UIAlertControllers bereit (`.rev-*` in
      css/app.css). Der fuehrt bei 4-5 Sternen direkt auf die App-Store-Seite
      mit geoeffnetem Bewertungsformular (`?action=write-review`) und leitet
      1-3 Sterne stattdessen ins Feedback-Formular — das ist auf der Website
      erlaubt (die Guideline gegen gefiltertes Nachfragen gilt dem
      System-Dialog).

   Ausloeser: der Abschluss einer Trainingseinheit. `_revArm()` merkt sich das
   in finishWk() vor, `_revAfterWorkout()` loest erst aus, wenn der Bildschirm
   wieder ruhig ist (Share-Flow zu, Punkte-Ticker durch). Beim ERSTEN
   abgeschlossenen Training kommt die Frage — danach erst wieder weit spaeter
   (REV_SCHWELLEN) und nie oefter als alle REV_SPERRE_TAGE Tage.

   Zustand liegt in localStorage['gt_review'], NICHT in S: der users-Doc-Push
   hat eine hasOnly-Feldliste in den Firestore-Rules, ein neuer Schluessel dort
   wuerde den kompletten Sync mit permission-denied abwuergen (s. CLAUDE.md).
   ══════════════════════════════════════════════════════════════════════════ */

const REV_KEY         = 'gt_review';
const REV_SCHWELLEN   = [1, 12, 45];   // nach der wievielten Einheit gefragt wird
const REV_SPERRE_TAGE = 120;           // Mindestabstand zwischen zwei Fragen
const REV_WRITE_URL   = 'https://apps.apple.com/app/id6775434876?action=write-review';

function _revState() {
  try {
    const o = JSON.parse(localStorage.getItem(REV_KEY) || '{}');
    return (o && typeof o === 'object') ? o : {};
  } catch(_) { return {}; }
}
function _revSave(patch) {
  try { localStorage.setItem(REV_KEY, JSON.stringify(Object.assign(_revState(), patch, { v: 1 }))); }
  catch(_) {}
}

/* Ist die Frage jetzt faellig? Die Schwelle wird ueber die Anzahl bereits
   gestellter Fragen (count) ausgewaehlt, nicht ueber die Session-Zahl allein:
   loescht jemand alte Einheiten, faellt er sonst auf eine Schwelle zurueck,
   die er laengst passiert hat, und wird ein zweites Mal gefragt. */
function _revFaellig() {
  const st = _revState();
  if (st.done) return false;                                   // hat bereits bewertet
  const gestellt = +st.count || 0;
  if (gestellt >= REV_SCHWELLEN.length) return false;          // Kontingent aufgebraucht
  const naechste = REV_SCHWELLEN[gestellt];
  const einheiten = (typeof S === 'object' && S && Array.isArray(S.sessions)) ? S.sessions.length : 0;
  if (einheiten < naechste) return false;
  if (st.asked && (Date.now() - st.asked) < REV_SPERRE_TAGE * 864e5) return false;
  return true;
}

/* ── Vormerken + ausloesen ─────────────────────────────────────────────────
   finishWk() ruft _revArm(); der eigentliche Anstoss kommt erst aus _shfExit()
   (Share-Flow geschlossen) bzw. aus dem Fehlerpfad von _finishWkContinue().
   Ohne die Flagge wuerde ein spaeter allein geoeffneter Share-Flow die Frage
   ohne frisches Training ausloesen. */
let _revPending = false;
function _revArm() { _revPending = true; }

function _revAfterWorkout() {
  if (!_revPending) return;
  _revPending = false;
  if (!_revFaellig()) return;
  // Abstand zum Punkte-Ticker (_xpGainOnFinish startet 420 ms nach _shfExit und
  // fliegt dann rund eine Sekunde). Erst danach ist der Bildschirm ruhig.
  setTimeout(() => { try { _revAsk(); } catch(e) { console.warn('[Review]', e); } }, 1800);
}

/* Stellt die Frage — nativ oder als Nachbau. `asked`/`count` steigen in beiden
   Faellen, auch wenn iOS den Dialog verschluckt: sonst fragt die App nach jedem
   Training erneut an und verbrennt das Jahreskontingent von drei Anzeigen. */
function _revAsk() {
  const P = (typeof _cap === 'function') ? _cap('ReviewPlugin') : null;
  _revSave({ asked: Date.now(), count: (+_revState().count || 0) + 1 });
  if (P && P.requestReview) { P.requestReview().catch(e => console.warn('[Review] nativ:', e)); return; }
  _revSheetOpen();
}

/* ── App Store direkt (Einstellungs-Zeile + 4-5-Sterne-Zweig im Nachbau) ──── */
function _revOpenStore() {
  _revSave({ done: true, doneAt: Date.now() });
  const P = (typeof _cap === 'function') ? _cap('ReviewPlugin') : null;
  if (P && P.openWriteReview) { P.openWriteReview().catch(() => _openExternal(REV_WRITE_URL)); return; }
  _openExternal(REV_WRITE_URL);
}

/* Einstellungen → „App bewerten". Bewusst IMMER der Weg in den App Store und
   nie der System-Dialog: Apple erlaubt requestReview() nicht als Reaktion auf
   einen Tipp des Nutzers. */
function openRateApp() {
  try { haptic(10); } catch(_) {}
  _revOpenStore();
}

/* ── Nachbau fuer Web/PWA (Stil: UIAlertController) ────────────────────────
   Wird beim ersten Bedarf ins DOM gehaengt statt fest in index.html zu stehen:
   das Ding ist kein `.ov`-Bottom-Sheet (kein Swipe, kein openOv/closeOv,
   eigener Stacking-Kontext) und haette dort nur Verwechslungsgefahr erzeugt. */
let _revSheetEl = null;
function _revSheetOpen() {
  if (!_revSheetEl) {
    _revSheetEl = document.createElement('div');
    _revSheetEl.id = 'rev-ov';
    _revSheetEl.className = 'rev-ov';
    _revSheetEl.addEventListener('click', e => { if (e.target === _revSheetEl) _revSheetClose(); });
    document.body.appendChild(_revSheetEl);
  }
  const sterne = [1,2,3,4,5].map(n => `
      <button class="rev-star" aria-label="${n} von 5" onclick="_revRate(${n})">
        <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
          <path d="M12 3.6l2.6 5.3 5.85.85-4.23 4.12 1 5.83L12 16.95l-5.22 2.75 1-5.83-4.23-4.12 5.85-.85z"/>
        </svg>
      </button>`).join('');
  _revSheetEl.innerHTML = `
    <div class="rev-alert" role="dialog" aria-modal="true" aria-labelledby="rev-h">
      <div class="rev-head">
        <div class="rev-title" id="rev-h">Gefällt dir MyGymTrack?</div>
        <div class="rev-sub">Tippe auf einen Stern, um die App zu bewerten.</div>
        <div class="rev-stars">${sterne}</div>
      </div>
      <button class="rev-btn" onclick="_revSheetClose()">Nicht jetzt</button>
    </div>`;
  requestAnimationFrame(() => _revSheetEl.classList.add('on'));
}
function _revSheetClose() {
  if (!_revSheetEl) return;
  _revSheetEl.classList.remove('on');
  setTimeout(() => { if (_revSheetEl && !_revSheetEl.classList.contains('on')) _revSheetEl.innerHTML = ''; }, 220);
}
/* 4-5 Sterne → App Store. 1-3 → Feedback-Formular statt oeffentlicher Kritik;
   der Nutzer soll seinen Aerger loswerden koennen, ohne den Umweg ueber eine
   Ein-Stern-Rezension. */
function _revRate(n) {
  try { haptic(10); } catch(_) {}
  _revSheetClose();
  if (n >= 4) { _revOpenStore(); return; }
  _revSave({ done: true, doneAt: Date.now(), negativ: n });
  setTimeout(() => { try { openFeedback(); } catch(_) {} }, 240);
}

/* Testhilfe (Simulator/Konsole): `_revDebug()` zeigt den nativen Dialog,
   `_revDebug('sheet')` den Nachbau, `_revDebug('reset')` loescht den Zustand,
   damit der Ablauf nach dem naechsten Training wieder von vorn laeuft. */
function _revDebug(modus) {
  if (modus === 'reset') { try { localStorage.removeItem(REV_KEY); } catch(_) {} console.log('[Review] Zustand geloescht'); return; }
  if (modus === 'sheet') { _revSheetOpen(); return; }
  const P = (typeof _cap === 'function') ? _cap('ReviewPlugin') : null;
  if (!P) { console.log('[Review] kein natives Plugin → Nachbau'); _revSheetOpen(); return; }
  P.requestReview().then(r => console.log('[Review] angefragt', r)).catch(e => console.warn('[Review]', e));
}
