/* ── BOOT ───────────────────────────────────────────────
   Startsequenz der App. Stand frueher mitten im Skript, direkt nach dem KI-Block.
   Sie muss aber ganz zum Schluss laufen: sie ruft _hadRealLogin() und _showAuthGate()
   auf, die in js/app-update.js stehen — also in einer spaeteren Datei. Solange alles
   ein einziger <script>-Block war, hat Function-Hoisting das ueberdeckt; ueber
   Dateigrenzen hinweg hoistet nichts mehr. Deshalb steht der Block hier unten und
   wandert beim Split unveraendert nach js/app-boot.js. */
_coachState = _coachDefaultState();   // deklariert in js/app-native.js, Fabrik in js/app-community.js
// ── INIT ──────────────────────────────────────────────
setTheme(S.theme);
setGlass(S.glass);
applyCompanion();
try { if (typeof DEMO_SEED !== 'undefined' && DEMO_SEED) _seedDemoData(); } catch(_){}
// Zurueck auf DEMO_SEED=false: das vom Seed gesetzte gt_demo wieder abraeumen. Sonst
// bliebe die Demo-Community stehen UND _demoModeAny() wuerde _purgeDemoData() blocken.
try {
  if ((typeof DEMO_SEED === 'undefined' || !DEMO_SEED) && localStorage.getItem('gt_demo_bySeed') === '1') {
    localStorage.removeItem('gt_demo'); localStorage.removeItem('gt_demo_bySeed');
    localStorage.removeItem('gt_premiumDev');
    /* NUR das Demo-Portrait, niemals das eigene Bild. Vorher stand hier ein
       bedingungsloses removeItem: wer die App einmal mit Simulationsdaten
       gestartet hatte, verlor beim naechsten Start ohne Seed sein selbst
       angelegtes Profilbild — ohne Meldung und ohne Weg zurueck.
       Zwei Merkmale, beide muessen zutreffen:
       - der beim Seed gemerkte Wert (gt_prof_photo_demo) ist noch derselbe und
       - das Bild ist kein 'data:'-Bild. Selbst angelegte Bilder entstehen
         IMMER im Canvas (_pickProfilePhoto) und sind damit data-URLs; das
         Demo-Portrait ist eine https-Adresse. Das faengt auch die Altbestaende
         ab, die noch keinen gemerkten Wert haben. */
    try {
      const foto = localStorage.getItem('gt_prof_photo') || '';
      const seed = localStorage.getItem('gt_prof_photo_demo') || '';
      const istDemo = foto && !/^data:/i.test(foto) && (!seed || foto === seed);
      if (istDemo) localStorage.removeItem('gt_prof_photo');
      localStorage.removeItem('gt_prof_photo_demo');
    } catch(_) {}
    // 'gt_neon' wird hier BEWUSST nicht mehr abgeraeumt: das Neon im Tab Training
    // haengt nicht mehr am Demo-Build, es ist der Normalzustand (s. _applyNeonSplits).
  }
} catch(_){}
try { if (_purgeDemoData(S)) persist(); } catch(_){}   // Demo-Altlasten lokal entfernen
_applyNeonSplits();   // Neon fuer die Splits — an, ausser localStorage gt_neon='0'
migrateExercises();   // feste Wdh-Zahlen → Bereich + Standard-Schema
renderHome();
renderExList();
initTabIndicator();
initSheetSwipe();
initTabDrag();
initPageSwipe();
_aibInit();   // KI-Coach-Bubble: Icons rendern, Position wiederherstellen, Drag/Tap verdrahten
_coachCapsInit();   // Stimme/Diktat: Fähigkeiten einmal klären (Berechtigung ist asynchron)
_premWatchEntitlement();   // Abo-Status bei jedem Start/Vordergrund frisch von StoreKit holen
_restoreActiveWk();   // abgebrochenes/unterbrochenes Training wiederherstellen
// Startreihenfolge: Login-Gate ZUERST (synchron gerendert, damit der Startbildschirm
// nicht kurz aufblitzt), Onboarding erst NACH dem Login, danach die Soft-Paywall.
// Bewusst nur _hadRealLogin() statt _authGateNeeded(): _fbUser/_authSettled sind
// spätere top-level `let`s — ein Zugriff hier wäre ein TDZ-Fehler und würde den
// kompletten Boot abbrechen (gleiche Falle wie früher in isPremium()).
if (!_hadRealLogin()) _showAuthGate();
else setTimeout(maybeStartOnboarding, 0);   // eingeloggtes Gerät: normaler Start
// Sicherheitsnetz: Wenn Firebase gar nicht lädt (offline/Blocker), darf das Gate
// niemanden dauerhaft aussperren — nach 10 s öffnen und normal weitermachen.
setTimeout(() => {
  if (!window.FB || !window.FB.configured) { _hideAuthGate(); _postLoginFlow(); }
}, 10000);
// Simulator-Dev-Bypass: Apple Sign-In braucht ein im Simulator angemeldetes
// iCloud-Konto (fast nie vorhanden), Google Sign-In hängt dort im OAuth-Browser-
// Flow — das Pflicht-Login würde JEDEN Test im Simulator blockieren. Flag statt
// Einmal-hide, weil der spätere anonyme Auth-Listener (_maybeAuthGate) das Gate
// sonst wieder aufmacht (Anonymous zählt nicht als echter Login). Auf einem
// echten Gerät bleibt der Login-Zwang unverändert bestehen.
let _simDevBypass = false;
setTimeout(async () => { const env = await _getInstallInfo(); if (env && env.isSimulator) { _simDevBypass = true; _hideAuthGate(); _postLoginFlow(); } }, 0);
// Aufbau ist durch (Home/Übungen gerendert, Gate bzw. Onboarding entschieden) —
// der Boot-Splash bleibt aber liegen, bis auch der ERSTE Cloud-Merge durch ist
// (Deckel: 1200 ms). Grund: _onLogin() rendert nach dem Merge Heute/Übungen/
// Einstellungen neu und setzt Theme + Begleiter — genau dieses Nachrendern war
// das kurze "die Heute-Seite lädt gleich nach dem Start noch mal neu". Unter der
// Abdeckung passiert es unsichtbar. Ohne echten Login (oder wenn Firebase nicht
// lädt) kommt gar kein Merge → dann sofort raus, kein künstliches Warten.
// _initialMergeDone ist ein späterer top-level `let` (TDZ!) — Zugriff deshalb
// nur in try/catch, sonst bricht der komplette Boot ab.
(function _bootReveal(){
  const t0 = Date.now();
  const merged = () => { try { return !!_initialMergeDone; } catch(_) { return false; } };
  const reveal = () => requestAnimationFrame(() => requestAnimationFrame(() => {
    try { window._bootSplashDone && window._bootSplashDone(); } catch(_){}
  }));
  if (!_hadRealLogin()) { reveal(); return; }
  (function wait(){
    if (merged() || Date.now() - t0 > 1200) { reveal(); return; }
    setTimeout(wait, 60);
  })();
})();
try { _checkLevelUp(true); } catch(_){}   // Rang-Index einmalig seeden (kein Fake-Level-Up für Bestandsnutzer)
if (S.socialOn) setTimeout(() => { try { _pushSocialProfile(); _loadRequests(); } catch(_){} }, 5000);   // Community-Profil + Anfragen nach Auth-Settle
// QR-Deep-Link (?add=CODE) merken — wird beim Öffnen des Freunde-Tabs eingelöst
try {
  const _addCode = new URLSearchParams(location.search).get('add');
  if (_addCode) {
    sessionStorage.setItem('gt_addCode', _addCode.toUpperCase().slice(0,6));
    history.replaceState(null, '', location.pathname);
  }
} catch(_){}
// Einladung fürs Gratis-Premium (?ref=CODE) merken. Eingelöst wird erst nach dem
// Login (refRedeemPending) — ohne angemeldetes Konto kann der Worker die Woche
// niemandem gutschreiben. Anonyme Konten sind bewusst ausgeschlossen.
try {
  const _refCode = new URLSearchParams(location.search).get('ref');
  if (_refCode && /^[A-Za-z0-9]{7}$/.test(_refCode)) {
    localStorage.setItem('gt_refPending', _refCode.toUpperCase());
    history.replaceState(null, '', location.pathname);
    // Im Browser (kein Install-Referrer unter iOS) muss der Code sichtbar
    // bleiben, sonst weiss der Empfaenger nach der Installation nicht mehr,
    // was er eingeben soll.
    if (typeof _isNative === 'function' && !_isNative()) {
      setTimeout(() => {
        try { _dndToast(tr('Einladungscode gemerkt: ') + _refCode.toUpperCase() + ' — ' + tr('anmelden und Gratis-Woche kassieren.')); } catch(_){}
      }, 2600);
    }
  }
} catch(_){}
// Gratis-Premium: gemerkten Code einlösen + Stand vom Worker holen. Nach dem
// Auth-Settle, gleiche Verzögerung wie beim Community-Profil oben.
setTimeout(() => {
  try { refRedeemPending().then(ok => { if (!ok) refSync(false); }); } catch(_){}
}, 5200);
// Crew-Einladung (?crew=CODE) merken — eingelöst beim Öffnen des Crew-Bereichs
try {
  const _crewCode = new URLSearchParams(location.search).get('crew');
  if (_crewCode && _crewStashCode(_crewCode)) history.replaceState(null, '', location.pathname);
} catch(_){}
// Plan/Split-Import-Link (?import=…): der https-Link ist nur der klickbare TRÄGER.
// NATIVE APP ZUERST: Im Browser sofort per Deep-Link in die installierte App
// springen (iOS fragt „In ‚MyGymTrack' öffnen?" → App zeigt die Import-Vorschau
// über appUrlOpen). Die Web-Vorschau dahinter ist nur Fallback für Empfänger
// ohne App (inkl. „In der MyGymTrack-App öffnen"-Button).
try {
  const _impD = new URLSearchParams(location.search).get('import');
  if (_impD) {
    history.replaceState(null, '', location.pathname);
    if (!window.Capacitor?.isNativePlatform?.()) {
      setTimeout(() => { try { location.href = 'gymtrack://import?d=' + _impD; } catch(_){} }, 80);
    }
    setTimeout(() => { try { _handlePlanImportUrl('?import=' + _impD); } catch(_){} }, 700);
  }
} catch(_){}


// Migration: bei alten Usern (lastSeenVersion gesetzt, aber seenChangelog leer)
// → alle aktuellen Keys als gesehen markieren, damit das Popup nicht nochmal kommt
// nach diesem Update.
if (!Array.isArray(S.seenChangelog)) {
  S.seenChangelog = S.lastSeenVersion ? Object.keys(CHANGELOG) : [];
  persist();
}

