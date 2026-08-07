function _cpgReload(){
  // Zwischenspeicher NUR entwerten (ts=0), nicht wegwerfen: der alte Stand bleibt
  // sichtbar, während im Hintergrund neu geladen wird (_renderFeed → _cpgRevalidate).
  // Früher wurde hier geleert — dann blitzte bei jedem Neuladen der Lade-Spinner auf.
  // Blob-URLs bleiben ebenfalls gültig, sonst zeigten die noch stehenden Karten ins Leere.
  Object.values(_cpgCache).forEach(c => { if (c) c.ts = 0; });
  const b = document.getElementById('fr-body');
  if (b && (_socZone === 'community')) _renderFeed(b);
}
/* Frisch geposteten eigenen Post optimistisch oben in den Feed setzen (friends/public
   je nach Zielauswahl). Er liegt in einer SEPARATEN Warteliste, NICHT im Feed-Cache:
   ein Cache-Eintrag mit nur diesem einen Post galt 60 s als „frischer Feed" und
   verdrängte damit alle echten Community-Posts (sie kamen erst nach Ablauf zurück).
   Die Warteliste wird bei jedem Laden vorangestellt und fällt weg, sobald der Server
   denselben Post liefert (gleiche uid+ts) bzw. nach 10 Minuten. */
let _cpgPending = { friends: [], public: [] };
function _cpgInjectOwnPost(base, dest){
  const me = _fbUser?.uid; if (!me) return;
  const keys = [];
  if (dest.friends) keys.push('friends');
  if (dest.public)  keys.push('public');
  keys.forEach(key => {
    const it = { id: 'local-' + uid(), uid: me, kind: 'post', visibility: key, ...base };
    _cpgPending[key] = [it, ...(_cpgPending[key] || [])].slice(0, 5);
  });
  const b = document.getElementById('fr-body');
  if (b && (_socZone === 'community')) _renderFeed(b);
}
/* Eigene, noch nicht vom Server zurückgelieferte Posts vor die geladene Liste hängen.
   Abgelaufene (>10 Min) und serverseitig bestätigte (gleiche uid+ts) fallen raus. */
const _CPG_PEND_MS = 600000;
function _cpgApplyPending(key, items){
  const me = _fbUser?.uid;
  const list = items || [];
  const pend = (_cpgPending[key] || []).filter(p => Date.now() - (p.ts || 0) < _CPG_PEND_MS);
  if (!pend.length || !me) { _cpgPending[key] = pend; return list; }
  const live = pend.filter(p => !list.some(x => x.uid === me && x.ts === p.ts && x.id !== p.id));
  _cpgPending[key] = live;
  if (!live.length) return list;
  return live.concat(list).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 40);
}
/* Zuletzt geladener Stand der aktuellen Zone — egal wie alt (für sofortiges Rendern). */
function _cpgCached(){
  const key = _cpgMode;
  return _cpgApplyPending(key, _cpgCache[key] ? _cpgCache[key].items : []);
}
function _cpgFresh(){
  const c = _cpgCache[_cpgMode];
  return !!(c && Date.now() - (c.ts || 0) < 60000);
}
/* Still nachladen und den sichtbaren Stapel nur ersetzen, wenn sich wirklich etwas
   geändert hat und der Nutzer noch auf der ersten Karte steht (sonst spränge ihm der
   Feed unter dem Finger weg). */
async function _cpgRevalidate(){
  const key = _cpgMode;
  let items;
  try { items = await _cpgLoad(key, true); }
  catch(e) { console.warn('[GymTrack] Feed-Aktualisierung:', e?.code || e); return; }
  if (_cpgMode !== key) return;                          // Zone inzwischen gewechselt
  if (!document.getElementById('cpg-wrap')) return;      // Feed nicht mehr offen
  if (_cpgIdx > 0) return;                               // Nutzer blättert gerade
  const same = items.length === _cpgItems.length
    && items.every((it, i) => it.id === _cpgItems[i]?.id && it.uid === _cpgItems[i]?.uid);
  if (same) return;
  _cpgItems = items; _cpgIdx = 0;
  _cpgRenderStack();
  _cpgFreeBlobs(items);                                  // Bilder verschwundener Posts freigeben
  try { _flamesRefreshBadge(); } catch(_){}
}
/* Feed im Hintergrund vorwärmen (App-Start nach Cloud-Sync + Rückkehr aus dem
   Hintergrund), damit der Community-Tab beim Öffnen sofort aktuell dasteht statt
   erst den Spinner zu zeigen. Gedrosselt, damit es keine Read-Lawine gibt. */
let _cpgPrefetchTs = 0;
async function _cpgPrefetch(){
  if (!_socReady() || !S.socialOn) return;
  // Vorgewärmt wird die Stellung, die der Nutzer zuletzt gewählt hat — nicht
  // mehr die Zone: der Freundes-Feed ist seit dem Umbau kein eigener Tab mehr.
  const key = (_cpgMode === 'friends') ? 'friends' : 'public';
  if (_cpgCache[key] && Date.now() - (_cpgCache[key].ts || 0) < 60000) return;   // frisch genug
  if (Date.now() - _cpgPrefetchTs < 90000) return;
  _cpgPrefetchTs = Date.now();
  try { await _cpgLoad(key, true); } catch(e) { console.warn('[GymTrack] Feed-Vorabladen:', e?.code || e); }
}
function setCpgMode(m){ if (_cpgMode === m) return; _cpgMode = m; haptic(6); const b = document.getElementById('fr-body'); if (b && _socZone === 'community') _renderFeed(b); }

async function _loadPostsFor(uid, onlyFriends){
  try {
    const q = window.FB.query(window.FB.collection('profiles/' + uid + '/posts'),
      window.FB.orderBy('ts','desc'), window.FB.limit(6));
    const snap = await window.FB.getDocs(q);
    const out = [];
    snap.forEach(d => {
      const data = d.data();
      // Freunde-Feed zeigt NUR 'friends'-Posts — ein rein für Community gepostetes
      // Training (visibility:'public') soll nicht zusätzlich hier auftauchen (der
 // Nutzer hat es nur für Community ausgewählt, nicht für Freunde).
      if (onlyFriends && data.visibility !== 'friends') return;
      if ((data.ts || 0) < _postCutoffTs()) return;   // 7-Tage-TTL: Abgelaufenes ausblenden
      out.push({ id:d.id, uid, kind:'post', ...data });
    });
    return out;
  } catch(_) { return []; }
}
/* mode: 'friends'|'public' (Standard: aktuelle Zone) · force: Cache-Frist ignorieren.
   Der Modus ist ein Parameter, damit das Vorabladen im Hintergrund laufen kann, ohne
   die sichtbare Zone (_cpgMode) umzuschalten. */
async function _cpgLoad(mode, force){
  const key = mode || _cpgMode;
  if (!force && _cpgCache[key] && Date.now() - _cpgCache[key].ts < 60000) return _cpgApplyPending(key, _cpgCache[key].items);
  let items = [];
  // Auth noch nicht wiederhergestellt → den zuletzt geladenen Stand behalten statt
  // einen leeren Feed („Noch keine Community-Posts") zu zeigen.
  if (!_socReady()) return _cpgApplyPending(key, _cpgCache[key] ? _cpgCache[key].items : []);
  if (key === 'friends') {
    const ids = [...(S.friends||[])];
    if (_fbUser) ids.unshift(_fbUser.uid);
    await Promise.all(ids.slice(0,30).map(async uid => {
      const [posts, acts] = await Promise.all([_loadPostsFor(uid, true), _loadFeedFor(uid)]);
      posts.forEach(p => items.push(p));
      acts.forEach(a => items.push({ ...a, kind:'act' }));
    }));
  } else {
    // Öffentlicher Community-Feed über alle Nutzer. BEWUSST OHNE orderBy('ts') —
    // where+orderBy auf verschiedenen Feldern bräuchte einen Firestore-Composite-Index;
    // ohne den warf die Abfrage failed-precondition → fälschlich "offline". Nur der
    // where('visibility') braucht lediglich den automatischen Einzelfeld-Index.
    // "Neueste zuerst" macht der client-seitige Sort unten; limit großzügig.
    // Index (visibility ASC, ts DESC) vorhanden → neueste Posts zuerst holen, damit ein
    // frisch geteilter Post beim Live-Reload garantiert im Fenster ist (sonst tauchte das
    // Bild nicht in Echtzeit auf). Fallback ohne Sortierung, falls Index (noch) fehlt.
    let snap;
    try {
      snap = await window.FB.getDocs(window.FB.query(window.FB.collectionGroup('posts'),
        window.FB.where('visibility','==','public'), window.FB.orderBy('ts','desc'), window.FB.limit(40)));
    } catch(e) {
      console.warn('[GymTrack] Community-Feed-Load (Fallback ohne orderBy):', e?.code || e);
      snap = await window.FB.getDocs(window.FB.query(window.FB.collectionGroup('posts'),
        window.FB.where('visibility','==','public'), window.FB.limit(20)));
    }
    snap.forEach(d => {
      const uid = d.ref.parent.parent.id;
      items.push({ id:d.id, uid, kind:'post', ...d.data() });
    });
  }
  const hidden = new Set(S.hiddenPosts || []);
  const blocked = new Set(S.blocked || []);
  // Ein als Foto-Post geteiltes Training NICHT zusätzlich als Text-Aktivität zeigen
  // (sonst „zwei Layouts" fürs selbe Workout). Foto-Post gewinnt; Aktivität desselben
  // Nutzers im ±3-Min-Fenster wird verworfen.
  const _postStamps = items.filter(x => x.kind === 'post').map(x => ({ uid: x.uid, ts: x.ts || 0 }));
  items = items.filter(it => it.kind !== 'act'
    || !_postStamps.some(p => p.uid === it.uid && Math.abs(p.ts - (it.ts || 0)) < 180000));
  items = items
    .filter(it => !blocked.has(it.uid))
    .filter(it => !(it.kind === 'post' && hidden.has(it.uid + '/' + it.id)))
    .filter(it => (it.ts || 0) >= _postCutoffTs())   // 7-Tage-TTL pro Post (auch fremde)
    .sort((a,b) => (b.ts||0) - (a.ts||0))
    .slice(0, 40);
  await _cpgEnrichProfiles(items);   // Autor-Profile laden → Level-Tag hinter JEDEM Namen
  _cpgCache[key] = { ts: Date.now(), items };
  return _cpgApplyPending(key, items);
}
/* Profile der Feed-Autoren best-effort in den _socCache laden, damit _lvlTagForUid()
   das Level auch für fremde Community-Nutzer (nicht nur Freunde/self) anzeigt.
   Nur fehlende UIDs; profiles sind für alle Angemeldeten lesbar. Gecacht via _cpgCache (60 s). */
async function _cpgEnrichProfiles(items){
  if (!_socReady()) return;
  const me = _fbUser?.uid;
  const have = new Set((_socCache || []).map(p => p.uid));
  const need = [...new Set(items.map(it => it.uid))].filter(uid => uid && uid !== me && !have.has(uid));
  if (!need.length) return;
  _socCache = _socCache || [];
  await Promise.all(need.slice(0, 40).map(async uid => {
    try {
      const s = await window.FB.getDoc(window.FB.doc('profiles', uid));
      if (s.exists()) _socCache.push({ uid, ...s.data() });
    } catch(_){}
  }));
}

/* ── Post-Foto: Base64 einmal in eine Blob-URL wandeln ─────────────────────
   Ein Post trägt sein Foto als data:-URL im Dokument (bis 900 000 Zeichen, siehe
   _shfFeedJpeg). Bei 40 Posts im Feed sind das bis zu ~25 MB Zeichenketten, die
   dauerhaft im _cpgCache liegen. Eine Blob-URL zeigt auf denselben Bildinhalt,
   ohne ihn als JS-String zu halten — die Kette wird nach der Wandlung fallen
   gelassen. Beim Blättern bringt das nichts (WebKit hält das dekodierte Bild
   ohnehin, Decode lag bei 0,2 ms) — gemessen wurde der erste Aufbau des Stapels:
   7 ms mit Blob gegen 13 ms mit der Base64-Kette, dazu die eingesparten ~25 MB.
   Die Blob-URLs werden bei _cpgReload wieder freigegeben. */
let _cpgBlobs = new Map();
function _cpgImgSrc(it){
  if (!it || !it.img) return '';
  if (it.img.slice(0, 5) !== 'data:') return it.img;      // schon Blob-/http-URL
  const key = it.uid + '/' + it.id;
  const known = _cpgBlobs.get(key);
  if (known) { it.img = known; return known; }
  try {
    const comma = it.img.indexOf(',');
    const mime = it.img.slice(5, comma).split(';')[0] || 'image/jpeg';
    const bin = atob(it.img.slice(comma + 1));
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([buf], { type: mime }));
    _cpgBlobs.set(key, url);
    it.img = url;                                          // Base64-Kette fällt weg
    return url;
  } catch(_) { return it.img; }                            // defekte Daten: unverändert
}
/* Blob-URLs freigeben, die zu keinem noch gehaltenen Post mehr gehören. Früher wurde
   beim Neuladen pauschal ALLES freigegeben — das geht nicht mehr, seit der alte Stand
   während des Nachladens sichtbar bleibt (revoke → tote Bild-URLs in stehenden Karten). */
function _cpgFreeBlobs(keep){
  const alive = new Set();
  (keep || []).forEach(it => alive.add(it.uid + '/' + it.id));
  Object.values(_cpgCache).forEach(c => (c?.items || []).forEach(it => alive.add(it.uid + '/' + it.id)));
  _cpgBlobs.forEach((u, k) => {
    if (alive.has(k)) return;
    try { URL.revokeObjectURL(u); } catch(_){}
    _cpgBlobs.delete(k);
  });
}
/* Die beiden nächsten Fotos vorab dekodieren. Ohne das trifft die erste
   Dekodierung eines Bildes den Moment, in dem seine Karte auftaucht — gemessen
   28 ms Spitzenframe mitten im Ziehen. img.decode() erledigt dieselbe Arbeit
   vorher und außerhalb des Hauptthreads, danach ist das Auftauchen kostenlos. */
function _cpgPrime(){
  for (let k = 1; k <= 2; k++) {
    const it = _cpgItems[_cpgIdx + k];
    if (!it || it.kind !== 'post' || !it.img || it._primed) continue;
    it._primed = true;
    try {
      const im = new Image();
      im.src = _cpgImgSrc(it);
      if (im.decode) im.decode().catch(() => {});
    } catch(_){}
  }
}
function _cpgActText(a){
  const name = a.uid === _fbUser?.uid ? tr('Du') : (a.name || 'Athlet');
  if (a.type === 'pr') return { day: (a.prName || 'PR'), meta: name + ' · ' + tr('Neuer Rekord') + (a.prVal ? ': ' + a.prVal : '') };
  if (a.type === 'streak') return { day: a.streak + '-' + tr('Wochen-Streak'), meta: name };
  return { day: a.mg ? a.mg + '-Training' : tr('Training'), meta: name + (a.dur ? ' · ' + a.dur + ' Min.' : '') + ((a.prs?.length) ? ' · ' + a.prs.length + ' PR' : '') };
}
function _cpgCardHTML(it, pos){
  const me = _fbUser?.uid;
  const isPost = it.kind === 'post';
  const flameMap = isPost ? (it.flames || {}) : null;
  const fireCount = isPost
    ? Object.keys(flameMap).length
    : Object.values(it.reactions || {}).filter(e => e === '🔥').length;
  const myFire = isPost ? !!flameMap[me] : (it.reactions || {})[me] === '🔥';
  const head = isPost
    ? { day: esc(it.dayName || tr('Training')), meta: [it.dur ? it.dur + ' min' : null, it.gym ? ICO.pin({ s: 12, st: 'display:inline-block;vertical-align:-2px;margin-right:1px' }) + esc(it.gym) : null].filter(Boolean).join(' · ') }
    : _cpgActText(it);
  const acc = _shfAccent();
  // Echtes Foto (rawImg): bei Ladefehler auf Akzent-Gradient zurückfallen, damit kein schwarzer Rahmen bleibt.
  // loading="lazy" ist bei data:/blob: wirkungslos (nichts zu laden), verzögerte aber
  // das Dekodieren der unsichtbaren Unterkarte bis zu ihrem Auftauchen. decoding="async"
  // hält das Dekodieren aus dem Bild heraus, in dem die Karte erscheint.
  const bg = isPost && it.img
    ? `<img class="cpg-img" src="${esc(_cpgImgSrc(it))}" decoding="async" alt=""${it.rawImg ? ` onerror="this.style.display='none'"` : ''}>`
    : `<div class="cpg-img" style="background:linear-gradient(160deg,${acc},#0b1020)"></div>`;
  const flLabel = fireCount
    ? fireCount + ' ' + (fireCount === 1 ? tr('Flamme') : tr('Flammen'))
    : tr('Erste Flamme geben');
  const chips = isPost && (it.mgs||[]).length
    ? `<div class="cpg-chips">${it.mgs.slice(0,4).map(m => `<span class="cpg-chip">${esc(m)}</span>`).join('')}</div>` : '';
  const d = new Date(it.ts || Date.now());
  const vdate = (d.toLocaleDateString(GT_LOCALE, {day:'2-digit', month:'short'}) + ' · ' + d.toLocaleTimeString(GT_LOCALE, {hour:'2-digit', minute:'2-digit'})).toUpperCase();
  // Post trägt nur http-Fotos (base64-Avatare werden beim Schreiben genullt, um das
  // 1-MB-Doc-Limit nicht zu sprengen). Fallback: echtes Profilbild aus dem Cache
  // (profiles/{uid}.photo enthält auch base64), fürs eigene Profil lokal.
  const _avaSrc = it.photo
    || (function(){ const p = (_socCache||[]).find ? (_socCache||[]).find(x => x.uid === it.uid) : null; return p && p.photo ? p.photo : null; })()
    || (it.uid === me ? _profilePhoto() : null);
  const ava = _avaSrc ? `<img src="${esc(_avaSrc)}" alt="">` : _socInitials(it.name);
  const profTap = it.uid === me ? `openProfileEdit()` : `openFrProfile('${it.uid}')`;
  const flame = `<button class="flm-btn${myFire ? ' on' : ''}" id="flm-${it._i}" onclick="toggleFlame(${it._i})" aria-label="${tr('Flamme')}">
      ${_flameSVG(20)}<span class="ct" id="flmct-${it._i}">${fireCount || ''}</span>
    </button>`;
  // Snap-Post: das Bild IST die fertig designte Share-Card (Name/Tag/Stats/Gym/
  // Wasserzeichen/Datum sind eingebacken). Nur die Controls drüberlegen — sonst
  // liegt der HTML-Chrome als zweites Layout über dem gleichen Inhalt.
  if (isPost && it.img) {
    // Poster füllt den Medienbereich; die Reaktions-Flamme sitzt in der Fußleiste
    // UNTER dem Poster und verdeckt so keinen Card-Inhalt mehr.
    // rawImg = reines Gym-Foto → Tag/Stats/Gym als HTML-Overlay drüberlegen (bei
    // gebackenen Share-Cards sind die schon im Bild, dann kein zweites Layout).
    const rawInfo = it.rawImg ? `<div class="cpg-info">
        <div class="day">${head.day}</div>
        <div class="meta">${head.meta || ''}</div>
        ${chips}
      </div>` : '';
    const mediaBg = it.rawImg ? ` style="background:linear-gradient(160deg,${acc},#0b1020)"` : '';
    return `<div class="cpg-card cpg-snap ${pos}" data-i="${it._i}">
    <div class="cpg-snap-media"${mediaBg}>
      ${bg}
      <div class="cpg-topfade"></div>
      <div class="cpg-head">
        <div class="cpg-id" style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;cursor:pointer" onclick="${profTap}">
          <div class="cpg-ava">${ava}</div>
          <div class="n"><b>${esc(it.uid === me ? tr('Du') : (it.name || 'Athlet'))}${_founderTag(it.uid)}${_modTag(it.uid)}${_premTagForUid(it.uid)}${_lvlTagForUid(it.uid)}</b><span>${_timeAgo(it.ts)}</span></div>
        </div>
        <button class="cpg-menu" onclick="openPostMenu(${it._i})" aria-label="${tr('Optionen')}"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button>
      </div>
      ${rawInfo}
      <div class="cpg-foot-fade"></div>
    </div>
    <div class="cpg-snap-foot">${flame}<span class="cpg-flct${fireCount ? '' : ' dim'}" id="flct-${it._i}">${flLabel}</span></div>
  </div>`;
  }
  // Gradient-Card (Text-Activities / Post ohne Bild): HTML-Chrome liefert den Inhalt.
  return `<div class="cpg-card ${pos}" data-i="${it._i}">
    ${bg}
    <div class="cpg-grad"></div>
    <div class="cpg-water">MYGYMTRACK</div>
    <div class="cpg-head">
      <div class="cpg-id" style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;cursor:pointer" onclick="${profTap}">
        <div class="cpg-ava">${ava}</div>
        <div class="n"><b>${esc(it.uid === me ? tr('Du') : (it.name || 'Athlet'))}${_founderTag(it.uid)}${_modTag(it.uid)}${_premTagForUid(it.uid)}${_lvlTagForUid(it.uid)}</b><span>${_timeAgo(it.ts)}</span></div>
      </div>
      <button class="cpg-menu" onclick="openPostMenu(${it._i})" aria-label="${tr('Optionen')}"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button>
    </div>
    <div class="cpg-vdate">${vdate}</div>
    <div class="cpg-info">
      <div class="day">${head.day}</div>
      <div class="meta">${head.meta || ''}</div>
      ${chips}
    </div>
    ${flame}
  </div>`;
}
/* dir: 1 = vorwärts geblättert (dann darf die Unterkarte befördert werden),
   -1 oder nichts = zurück bzw. Neuaufbau (Liste verändert, Feed neu geladen). */
function _cpgRenderStack(dir){
  const w = document.getElementById('cpg-wrap'); if (!w) return;
  _cpgItems.forEach((it, i) => it._i = i);
  if (!_cpgItems.length) {
    const isFr = _cpgMode === 'friends';
    w.style.width = ''; w.style.height = '';   // Sondermaße für Foto-Posts zurücknehmen
    _cpgSetCount('');
    w.innerHTML = `<div class="cpg-empty"><div style="color:var(--acc)">${isFr ? ICO.users({ s: 40 }) : ICO.globe({ s: 40 })}</div>
      <b>${isFr ? tr('Noch nichts von deinen Freunden') : tr('Noch keine Community-Posts')}</b>
      <span style="font-size:13px">${isFr
        ? ((S.friends||[]).length ? tr('Beende ein Training und teile es — es landet hier.') : tr('Füge zuerst Freunde hinzu — oben rechts über das +.'))
        : tr('Teile dein nächstes Training mit der Community!')}</span>
      ${isFr && !(S.friends||[]).length ? `<button class="btn btn-acc" onclick="openFrAdd()">${tr('Freund hinzufügen')}</button>` : ''}</div>`;
    return;
  }
  if (_cpgIdx >= _cpgItems.length) {
    w.style.width = ''; w.style.height = '';
    _cpgSetCount('');
    w.innerHTML = `<div class="cpg-empty"><div style="color:var(--acc)">${ICO.check({ s: 40 })}</div><b>${tr('Alles gesehen!')}</b>
      <button class="btn btn-acc" onclick="_cpgReload()">${tr('Neu laden')}</button></div>`;
    return;
  }
  const top = _cpgItems[_cpgIdx];
  const under = _cpgItems[_cpgIdx + 1];
  // Fertige Share-Layouts sind 3:4. Die separate Flammen-Fußleiste (60px) frisst sonst
  // vom Bildbereich ab (cover → oben/unten abgeschnitten). Darum den Rahmen um die
  // Fußleistenhöhe VERGRÖSSERN, sodass der Medienbereich exakt 3:4 bleibt → Bild passt
  // randlos rein, nichts wird beschnitten. Ohne Snap-Foto: normales 3:4 (CSS).
  // Höhe VOR dem Umbau setzen: sonst liest die Breitenabfrage das Layout zurück,
  // während der neue Inhalt schon steht (erzwungenes Zwischenlayout pro Wechsel).
  // Im Feed-Vollbild (kein Scrollen) begrenzt nicht mehr die Breite, sondern die
  // Resthoehe unter Header/Umschalter/Zonenzeile. Die Breite muss dann so klein
  // gewaehlt werden, dass Bild (3:4) + Fussleiste komplett hineinpassen — sonst
  // waere die Karte unten abgeschnitten.
  const _bw = _cpgWidth(w);
  const _ah = _cpgAvailH(w);
  if (_bw && top.kind === 'post' && top.img) {
    const bw = _ah ? Math.min(_bw, Math.floor((_ah - CPG_FOOT) * 3 / 4)) : _bw;
    w.style.width  = _ah ? bw + 'px' : '';
    w.style.height = Math.round(bw * 4 / 3 + CPG_FOOT) + 'px';
  } else if (_ah && _bw) {
    // Karte ohne Foto (Gradient/Text): weiter 3:4, so gross wie der Platz zulaesst.
    const h = Math.min(_ah, _bw * 4 / 3);
    w.style.width  = Math.round(h * 3 / 4) + 'px';
    w.style.height = Math.round(h) + 'px';
  } else {
    w.style.width = ''; w.style.height = '';
  }
  _cpgSetCount((_cpgIdx + 1) + ' / ' + _cpgItems.length);

  /* Weiterblättern: die untere Karte steht bereits im DOM, mit fertigem Bild und
     fertigem Layout. Sie wird zur oberen BEFÖRDERT (nur Klassenwechsel) statt neu
     gebaut — vorher kostete derselbe Schritt einen kompletten innerHTML-Aufbau
     beider Karten, gemessen ~9 ms Hauptthread genau im Bild des Wechsels, also
     mindestens ein verlorener Frame (auf dem Gerät mehrere). Die neue Unterkarte
     entsteht erst im Bild danach; sie ist unsichtbar (opacity 0), ihr Aufbau fällt
     nicht auf. Passt die Annahme nicht (rückwärts, Liste verändert, erster Aufbau),
     wird wie bisher vollständig gebaut — die Abkürzung ist nie der einzige Weg. */
  const promote = dir === 1 ? w.querySelector('.cpg-card.under') : null;
  if (promote && promote.dataset.i === String(_cpgIdx)) {
    const oldTop = w.querySelector('.cpg-card.top');
    if (oldTop) oldTop.remove();
    promote.style.transition = 'none';
    promote.style.transform = ''; promote.style.opacity = '';
    promote.classList.remove('under'); promote.classList.add('top');
    void promote.offsetWidth;                    // Übergangssperre nur für dieses Bild
    promote.style.transition = '';
    _cpgBindSwipe(w);
    if (under) requestAnimationFrame(() => requestAnimationFrame(() => {
      // Zwischenzeitlich weitergewischt? Dann hat der nächste Lauf schon gebaut.
      if (!w.isConnected || w.querySelector('.cpg-card.under')) return;
      if (_cpgItems[_cpgIdx + 1] !== under) return;
      const t = w.querySelector('.cpg-card.top');
      if (t) t.insertAdjacentHTML('beforebegin', _cpgCardHTML(under, 'under'));
      _cpgPrime();
    }));
    return;
  }
  w.innerHTML = (under ? _cpgCardHTML(under, 'under') : '') + _cpgCardHTML(top, 'top');
  _cpgBindSwipe(w);
  _cpgPrime();
}
/* Rahmenbreite gepuffert: sie ändert sich nur, wenn sich das Fenster ändert
   (.cpg-wrap hängt an 100dvh). Jeder Kartenwechsel las sie vorher neu und erzwang
   damit ein Layout mitten im Umbau. Nullwerte (Rahmen noch unsichtbar) werden
   NICHT gepuffert — sonst fiele die Sonderhöhe für Foto-Posts dauerhaft aus. */
let _cpgW = 0;
function _cpgWidth(w){
  if (_cpgW) return _cpgW;
  const x = w.clientWidth || 0;
  if (x) _cpgW = x;
  return x;
}
window.addEventListener('resize', () => { _cpgW = 0; });
/* Hoehe der Flammen-Fussleiste unter dem Bild — muss zu .cpg-snap-foot im CSS passen. */
const CPG_FOOT = 60;
/* Bildzaehler „3 / 12". Er steht in der Zonenzeile (eigene Gitterspalte), NICHT mehr
   im Kartenrahmen — dort sass er seit der schmaleren Karte eingerueckt und kollidierte
   mit dem Live-Zaehler. Leerer Text = Zeile zeigt nur die Zonenbeschriftung. */
function _cpgSetCount(txt){
  // Auch den unsichtbaren Zwilling links mitschreiben — er haelt die Beschriftung mittig.
  document.querySelectorAll('.cpg-count').forEach(el => { el.textContent = txt || ''; });
}
/* Resthoehe fuer den Rahmen im Feed-Vollbild: Hoehe des Elternblocks minus alles,
   was darueber liegt (Zonenzeile inkl. Abstand). 0 = kein Vollbild (Seite scrollt
   normal, dann entscheidet allein die Breite wie bisher). Die eigene Breite wird
   NICHT mitgezaehlt — sie steht ja gerade zur Disposition. */
function _cpgAvailH(w){
  const pg = document.getElementById('pg-freunde');
  if (!pg || !pg.classList.contains('soc-feed-full')) return 0;
  const par = w.parentElement; if (!par) return 0;
  let belegt = 0;
  for (const el of par.children) {
    if (el === w) continue;
    const cs = getComputedStyle(el);
    belegt += el.getBoundingClientRect().height
            + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
  }
  return Math.max(0, par.clientHeight - belegt);
}
function _cpgBindSwipe(w){
  const card = w.querySelector('.cpg-card.top');
  const under = w.querySelector('.cpg-card.under');
  if (!card) return;
  let sx = 0, sy = 0, dx = 0, dragging = false, horiz = null;
  const W = w.clientWidth || 320;
  card.addEventListener('touchstart', e => {
    // Touch auf Flammen-/Menü-Button NICHT als Swipe werten — sonst blättert
    // ein Tap auf die Reaction zur nächsten Card (Button liegt in der Swipe-Card).
    if (e.target.closest('.flm-btn, .cpg-menu, .cpg-id')) { dragging = false; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    dx = 0; dragging = true; horiz = null;
    card.style.transition = 'none';
    if (under) under.style.transition = 'none';
  }, { passive: true });
  card.addEventListener('touchmove', e => {
    if (!dragging) return;
    const mx = e.touches[0].clientX - sx, my = e.touches[0].clientY - sy;
    if (horiz === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) horiz = Math.abs(mx) > Math.abs(my);
    if (!horiz) return;
    dx = mx;
    const p = Math.min(Math.abs(dx) / W, 1);
    card.style.transform = `translateX(${dx}px) rotate(${dx * 0.035}deg) scale(${1 - p * 0.12})`;
    card.style.opacity = String(1 - p * 0.35);
    // Vorschau der nächsten Card nur beim Vorwärts-Wischen (links). Nach rechts
    // = zurück, da liegt hinten die vorige Card, nicht die "under".
    if (under && dx < 0) { under.style.transform = `scale(${0.9 + p * 0.1})`; under.style.opacity = String(p); }
  }, { passive: true });
  card.addEventListener('touchend', () => {
    if (!dragging) return; dragging = false;
    const forward = dx < 0;              // links wischen = weiter, rechts = zurück
    const canGo = forward ? (_cpgIdx < _cpgItems.length - 1) : (_cpgIdx > 0);
    if (horiz && Math.abs(dx) > Math.max(80, W * 0.28) && canGo) {
      const dir = dx > 0 ? 1 : -1;
      card.style.transition = 'transform .3s cubic-bezier(.3,.7,.4,1), opacity .3s';
      card.style.transform = `translateX(${dir * W * 1.15}px) rotate(${dir * 14}deg) scale(.8)`;
      card.style.opacity = '0';
      if (under && forward) {
        under.style.transition = 'transform .34s cubic-bezier(.34,1.45,.55,1), opacity .25s';
        under.style.transform = 'scale(1)'; under.style.opacity = '1';
      }
      haptic(10);
      setTimeout(() => { _cpgIdx += forward ? 1 : -1; _cpgRenderStack(forward ? 1 : -1); }, 300);
    } else {
      card.style.transition = 'transform .45s cubic-bezier(.34,1.56,.64,1), opacity .3s';
      card.style.transform = ''; card.style.opacity = '';
      if (under) { under.style.transition = 'transform .45s cubic-bezier(.34,1.56,.64,1), opacity .3s'; under.style.transform = ''; under.style.opacity = ''; }
    }
  }, { passive: true });
}

/* ── Flammen-Reaction: Toggle, optimistisch, Animation + Partikel-Burst ── */
async function toggleFlame(i){
  const it = _cpgItems[i];
  if (!it || !_socReady()) return;
  const me = _fbUser.uid;
  const btn = document.getElementById('flm-' + i);
  let on;
  if (it.kind === 'post') {
    it.flames = it.flames || {};
    on = !it.flames[me];
    if (on) it.flames[me] = Date.now(); else delete it.flames[me];
  } else {
    it.reactions = it.reactions || {};
    on = it.reactions[me] !== '🔥';
    if (on) it.reactions[me] = '🔥'; else delete it.reactions[me];
  }
  // Optimistisch: Zähler + Optik sofort, Server danach
  const count = it.kind === 'post'
    ? Object.keys(it.flames).length
    : Object.values(it.reactions).filter(e => e === '🔥').length;
  if (btn) {
    btn.classList.toggle('on', on);
    const ct = document.getElementById('flmct-' + i);
    if (ct) ct.textContent = count || '';
    const lbl = document.getElementById('flct-' + i);
    if (lbl) {
      lbl.textContent = count ? (count + ' ' + (count === 1 ? tr('Flamme') : tr('Flammen'))) : tr('Erste Flamme geben');
      lbl.classList.toggle('dim', !count);
    }
    if (on) {
      btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
      for (let p = 0; p < 8; p++) {
        const s = document.createElement('span');
        s.className = 'flm-part'; s.innerHTML = _flameFillSVG(p % 3 === 1 ? 11 : 16);
        const ang = Math.random() * Math.PI * 2, dist = 34 + Math.random() * 30;
        s.style.setProperty('--fx', Math.cos(ang) * dist + 'px');
        s.style.setProperty('--fy', Math.sin(ang) * dist - 14 + 'px');
        btn.appendChild(s);
        setTimeout(() => s.remove(), 750);
      }
    }
  }
  if (on) hapticSuccess(); else haptic(8);
  // Flammen GEBEN bringt Punkte (einmalig pro fremdem Post — Toggle farmt nichts)
  /* NUR den eigenen Schluessel schreiben, nicht die ganze Map. Der Feed-Cache
     haelt 60 s und wird bei fremden Reaktionen bewusst nicht neu geladen — eine
     komplette Map von dort loeschte fremde Flammen mit und wird von den Rules
     abgelehnt. */
  const _del = (window.FB.deleteField ? window.FB.deleteField() : null);
  try {
    if (it.kind === 'post')
      await window.FB.updateDoc(window.FB.doc('profiles/' + it.uid + '/posts', it.id),
        { ['flames.' + me]: on ? (it.flames[me] || Date.now()) : _del });
    else
      await window.FB.updateDoc(window.FB.doc('profiles/' + it.uid + '/activities', it.id),
        { ['reactions.' + me]: on ? '🔥' : _del });
    // Punkte erst nach dem bestaetigten Schreibvorgang — sonst zaehlt auch ein
    // abgelehnter Tap.
    if (on && it.uid && it.uid !== me) {
      try { _flamesGivenAdd(it.uid + ':' + (it.id || it.ts || '')); } catch(_){}
      _notifyFlamePush(it.uid);   // echte APNs-Push an Post-Besitzer
    }
  } catch(e) {
    // Server lehnte ab → optimistische Änderung zurückrollen
    if (it.kind === 'post') { if (on) delete it.flames[me]; else it.flames[me] = Date.now(); }
    else { if (on) delete it.reactions[me]; else it.reactions[me] = '🔥'; }
    if (btn) {
      btn.classList.toggle('on', !on);
      const ct = document.getElementById('flmct-' + i);
      if (ct) {
        const c2 = it.kind === 'post' ? Object.keys(it.flames).length : Object.values(it.reactions).filter(x => x === '🔥').length;
        ct.textContent = c2 || '';
      }
    }
    console.warn('[GymTrack] Flamme fehlgeschlagen:', e?.code || e);
  }
}

/* ── „…"-Menü: Melden / Ausblenden / Blockieren / (eigene: Löschen) ── */
let _pmItem = null;
function openPostMenu(i){
  const it = _cpgItems[i]; if (!it) return;
  _pmItem = it;
  haptic(8);
  const mine = it.uid === _fbUser?.uid;
  const body = document.getElementById('postmenu-body');
  body.innerHTML = mine
    ? `<button class="btn btn-gray" style="color:#ff453a" onclick="deleteOwnPost()">${tr('Beitrag löschen')}</button>`
    : `<button class="btn btn-gray" onclick="hidePost()">${tr('Beitrag ausblenden')}</button>
       <button class="btn btn-gray" onclick="reportPost()">${tr('Beitrag melden')}</button>
       <button class="btn btn-gray" style="color:#ff453a" onclick="blockFromFeed()">${tr('Nutzer blockieren')}</button>`;
  openOv('ov-postmenu');
}
function _pmRemoveFromFeed(){
  _cpgItems = _cpgItems.filter(x => x !== _pmItem);
  closeOv('ov-postmenu');
  _cpgIdx = Math.min(_cpgIdx, Math.max(_cpgItems.length - 1, 0));
  _cpgRenderStack();
}
function hidePost(){
  if (!_pmItem) return;
  if (_pmItem.kind === 'post') {
    S.hiddenPosts = S.hiddenPosts || [];
    S.hiddenPosts.push(_pmItem.uid + '/' + _pmItem.id);
    if (S.hiddenPosts.length > 300) S.hiddenPosts = S.hiddenPosts.slice(-300);
    persist();
  }
  haptic(10);
  _pmRemoveFromFeed();
}
async function reportPost(){
  if (!_pmItem || !_socReady()) return;
  try {
    await window.FB.addDoc(window.FB.collection('reports'), {
      reporter: _fbUser.uid,
      authorUid: _pmItem.uid,
      postId: _pmItem.id,
      kind: _pmItem.kind,
      ts: Date.now()
    });
    alert(tr('Danke! Der Beitrag wurde gemeldet.'));
  } catch(e) { console.warn('[GymTrack] Report:', e?.code || e); }
  hidePost();
}
function blockFromFeed(){
  if (!_pmItem) return;
  const uid = _pmItem.uid;
  if (!confirm(tr('Nutzer blockieren? Seine Beiträge verschwinden aus deinem Feed.'))) return;
  S.blocked = S.blocked || [];
  if (!S.blocked.includes(uid)) S.blocked.push(uid);
  persist();
  _cpgItems = _cpgItems.filter(x => x.uid !== uid);
  closeOv('ov-postmenu');
  _cpgIdx = Math.min(_cpgIdx, Math.max(_cpgItems.length - 1, 0));
  _cpgRenderStack();
  haptic(14);
}
async function deleteOwnPost(){
  if (!_pmItem || _pmItem.uid !== _fbUser?.uid) return;
  if (!confirm(tr('Diesen Beitrag löschen?'))) return;
  try {
    await window.FB.deleteDoc(window.FB.doc('profiles/' + _fbUser.uid + '/posts', _pmItem.id));
    if (_pmItem.imgPath && window.FB.stDelete) { try { await window.FB.stDelete(_pmItem.imgPath); } catch(_){} }
  } catch(e) { console.warn('[GymTrack] Löschen:', e?.code || e); }
  _pmRemoveFromFeed();
}

/* ── Flammen-Benachrichtigungen (Glocke + Badge) ── */
async function _flamesMine(force){
  if (!force && _flMyPosts && Date.now() - _flMyPostsTs < 60000) return _flMyPosts;
  if (!_socReady()) return [];
  const posts = await _loadPostsFor(_fbUser.uid);
  const out = [];
  posts.forEach(p => {
    _flameBankAdd(p.id, p.flames);   // erhaltene Flammen dauerhaft gutschreiben (Punkte-Basis)
    Object.entries(p.flames || {}).forEach(([fuid, fts]) => {
      if (fuid === _fbUser.uid) return;
      out.push({ fuid, ts: typeof fts === 'number' ? fts : (p.ts || 0), dayName: p.dayName || tr('Training') });
    });
  });
  out.sort((a,b) => b.ts - a.ts);
  _flMyPosts = out; _flMyPostsTs = Date.now();
  return out;
}
async function _flamesRefreshBadge(){
  try {
    const list = await _flamesMine();
    const fresh = list.filter(f => f.ts > (S.flameSeen || 0)).length;
    _flFreshCount = fresh;
    const b = document.getElementById('flm-bell-badge');
    if (b) { b.style.display = fresh ? '' : 'none'; b.textContent = fresh; }
    _updateFrBadges();   // Community-Tab-Badge mitziehen
    if (!_xpAnimBusy) _renderLevelBadge();   // frisch gebankte Flammen → Punkte im Badge aktuell halten
  } catch(_){}
}
async function openFlames(){
  haptic(8);
  openOv('ov-flames');
  const body = document.getElementById('flames-body');
  body.innerHTML = `<div class="soc-empty" style="padding:16px">${tr('Lade…')}</div>`;
  const list = await _flamesMine(true);
  // Namen der Reagierenden sicherstellen: fehlende Profile nachladen (profiles
  // sind für alle Angemeldeten lesbar) — sonst stand hier nur „Jemand".
  const needUids = [...new Set(list.slice(0, 30).map(f => f.fuid))]
    .filter(uid => uid && !((_socCache || []).find?.(x => x.uid === uid)));
  if (needUids.length) {
    await Promise.all(needUids.map(async uid => {
      try {
        const s = await window.FB.getDoc(window.FB.doc('profiles', uid));
        if (s.exists()) (_socCache = _socCache || []).push({ uid, ...s.data() });
      } catch(_){}
    }));
  }
  const nameOf = (uid) => {
    const p = (_socCache || []).find?.(x => x.uid === uid);
    return p?.name || tr('Jemand');
  };
  body.innerHTML = list.length
    ? list.slice(0, 30).map(f => `<div class="flm-note"><span style="flex-shrink:0">${_flameSVG(20)}</span>
        <div class="t"><b>${esc(nameOf(f.fuid))}</b> ${tr('feiert dein Training')} „${esc(f.dayName)}"</div>
        <span class="ts">${_timeAgo(f.ts)}</span></div>`).join('')
    : `<div class="soc-empty" style="padding:16px">${tr('Noch keine Reaktionen.')}<br>${tr('Teile ein Training — Flammen landen hier.')}</div>`;
  S.flameSeen = Date.now();
  persist();
  _flFreshCount = 0;
  _updateFrBadges();   // Community-Tab-Badge zurücksetzen
  const b = document.getElementById('flm-bell-badge');
  if (b) b.style.display = 'none';
}

/* ── Benachrichtigung, wenn jemand auf MEINE Posts eine Flamme gibt ──
   Kein Backend/Cloud-Functions (Spark-Plan) → eine echte Server-Push aufs Sperrbild bei
   KOMPLETT geschlossener App ist damit NICHT möglich (dafür bräuchte es FCM+Cloud-Functions
   = Blaze/Kreditkarte, oder einen Push-Dienst wie OneSignal). Ohne Server machbar:
   Live-onSnapshot auf die eigenen Posts. Solange die App offen ist ODER wieder in den
   Vordergrund kommt, feuert für jede neue fremde Flamme eine lokale Notification + In-App-
   Badge/Toast. Verpasste Flammen (App war zu) werden beim nächsten Öffnen nachgeholt:
   S.flameNotifTs (gerätelokal, wird NICHT in die Cloud gepusht) merkt den Zeitstempel der
   zuletzt gemeldeten Flamme — alles Neuere wird beim Start einmalig gemeldet. */
let _flameNotifUnsub = null;
let _flameNotifSeen  = null;   // Set "postId:reactorUid" — Dedupe innerhalb der Session
let _flameNotifId    = 2600;

function _flameNotifStart(){
  _flameNotifStop();
  if (!_socReady() || !S.socialOn) return;
  _flameNotifSeen = new Set();
  if (S.flameNotifTs == null) { S.flameNotifTs = Date.now(); persist(); }  // erstes Mal: Bestehendes ist Baseline
  _ensureSocialNotifPermission();
  try {
    const q = window.FB.query(window.FB.collection('profiles/' + _fbUser.uid + '/posts'),
      window.FB.orderBy('ts','desc'), window.FB.limit(20));
    _flameNotifUnsub = window.FB.onSnapshot(q, snap => {
      const me = _fbUser?.uid;
      const fresh = [];
      let maxTs = S.flameNotifTs || 0;
      snap.forEach(d => {
        const p = d.data(); const flames = p.flames || {};
        _flameBankAdd(d.id, flames);   // Live eingehende Flammen sofort dauerhaft zählen
        Object.entries(flames).forEach(([fuid, fts]) => {
          if (fuid === me) return;
          const ts = typeof fts === 'number' ? fts : 0;
          const key = d.id + ':' + fuid;
          if (_flameNotifSeen.has(key)) return;
          _flameNotifSeen.add(key);
          if (ts > (S.flameNotifTs || 0)) {          // nur Flammen neuer als die zuletzt gemeldete
            fresh.push({ fuid, ts: ts || Date.now(), dayName: p.dayName || tr('Training') });
            if (ts > maxTs) maxTs = ts;
          }
        });
      });
      _flMyPosts = null;            // Badge-Cache invalidieren, dann neu zählen
      _flamesRefreshBadge();
      if (fresh.length) {
        S.flameNotifTs = maxTs; persist();
        fresh.sort((a,b) => b.ts - a.ts);
        _notifyFlames(fresh);
      }
    }, err => console.warn('[GymTrack] Flammen-Listener:', err?.code || err));
  } catch(e) { console.warn('[GymTrack] Flammen-Listener:', e?.code || e); }
}
function _flameNotifStop(){
  if (_flameNotifUnsub) { try { _flameNotifUnsub(); } catch(_){} _flameNotifUnsub = null; }
  _flameNotifSeen = null;
}
/* ── In-App-Benachrichtigung, wenn ein FREUND einen neuen Post teilt (Echtzeit) ──
   Läuft solange die App offen ist: pro Freund ein onSnapshot auf dessen neueste Posts.
   Neuer Post (ts > S.friendPostTs, nicht von mir) → In-App-Toast + Badge am Community-Tab.
   Nur in-app (kein Server/Push). START-ONCE: nicht bei jedem Foreground neu abonnieren —
   sonst 30 Freunde × Re-Read pro App-Öffnen (Spark-Read-Limit). Firestore-Listener holen
   nach dem Wiederkommen selbst nach. S.friendPostTs (gerätelokal) = zuletzt gemeldeter Post. */
let _friendPostSubs  = [];
let _friendPostSeen  = null;   // Set "friendUid:postId" — Dedupe innerhalb der Session
let _friendPostFresh = 0;      // ungesehene neue Freundes-Posts (Badge am Community-Tab)

function _friendPostNotifStart(){
  if (_friendPostSubs.length) return;              // schon aktiv → nicht neu abonnieren
  if (!_socReady() || !S.socialOn) return;
  const friends = (S.friends || []).slice(0, 30);
  if (!friends.length) return;
  _friendPostSeen = new Set();
  if (S.friendPostTs == null) { S.friendPostTs = Date.now(); persist(); }  // erstes Mal: Bestehendes = Baseline
  const me = _fbUser?.uid;
  friends.forEach(fuid => {
    if (fuid === me) return;
    try {
      const q = window.FB.query(window.FB.collection('profiles/' + fuid + '/posts'),
        window.FB.orderBy('ts','desc'), window.FB.limit(3));
      const un = window.FB.onSnapshot(q, snap => {
        // Nur neue/gelöschte Posts laden den offenen Feed live nach — reine Feld-Updates
        // (Flamme/Reaktion auf einen bereits gerenderten Post, auch die eigene) würden sonst
        // bei JEDEM Flamme-Tap den kompletten Feed sichtbar neu rendern.
        const structural = snap.docChanges().some(c => c.type !== 'modified');
        if (structural && document.getElementById('pg-freunde')?.classList.contains('on')) _liveFeedRefreshSoon();
        const fresh = [];
        let maxTs = S.friendPostTs || 0;
        snap.forEach(d => {
          const p = d.data();
          // Poster-Uhr kann vorgehen (Client-Date.now() im Post) → auf „jetzt" deckeln,
          // sonst schlägt ein bereits gesehener Post nach Vordergrund/Re-Subscribe erneut
          // die lokale friendPostTs und der Badge kommt zurück (Zahl geht nie weg).
          let ts = typeof p.ts === 'number' ? p.ts : 0;
          if (ts > Date.now()) ts = Date.now();
          const key = fuid + ':' + d.id;
          if (_friendPostSeen.has(key)) return;
          _friendPostSeen.add(key);
          // NUR echte „Freunde"-Posts lösen die Freunde-Benachrichtigung aus. Ein öffentlicher
          // Post (visibility 'public') ist ein Community-Post — auch wenn ein Freund ihn teilt —
          // und läuft LEISE über den Community-Listener (nur Zahl, kein Push, kein Banner).
          if (p.visibility !== 'friends') return;
          if (ts > (S.friendPostTs || 0)) { fresh.push({ ts, name: p.name || tr('Ein Freund') }); if (ts > maxTs) maxTs = ts; }
        });
        if (fresh.length) {
          S.friendPostTs = maxTs; persist();
          // Community-Tab gerade offen → Posts direkt live nachladen, kein Badge/Push nötig.
          if (document.getElementById('pg-freunde')?.classList.contains('on')) { _liveFeedRefreshSoon(); return; }
          // FREUNDE: Zahl am Community-Tab UND echte System-Push — KEIN blaues In-App-Banner.
          _friendPostFresh += fresh.length;
          _updateFrBadges();
          const nm = fresh.sort((a,b)=>b.ts-a.ts)[0].name || tr('Ein Freund');
          const body = _friendPostFresh > 1
            ? tr('Neue Posts von deinen Freunden') + ' (' + _friendPostFresh + ')'
            : nm + ' ' + tr('hat einen neuen Post geteilt');
          try { _fireLocalFlameNotif(tr('GymTrack'), body); } catch(_){}
        }
      }, err => console.warn('[GymTrack] Freundes-Post-Listener:', err?.code || err));
      _friendPostSubs.push(un);
    } catch(_){}
  });
}
function _friendPostNotifStop(){
  _friendPostSubs.forEach(u => { try { u(); } catch(_){} });
  _friendPostSubs = [];
  _friendPostSeen = null;
}
/* ── Live-Listener für den ÖFFENTLICHEN Community-Feed (Posts aller Nutzer) ──
   Neuer public-Post (nicht von mir, nicht von Freunden — die laufen über den
   Freundes-Listener oben) → NUR eine Zahl am Community-Tab, KEIN Toast/Push.
   Echtzeit via onSnapshot auf collectionGroup('posts'). Braucht denselben
   Collection-Group-Single-Field-Index auf visibility wie der Feed-Load. */
let _cpgLiveUnsub = null, _cpgLiveSeen = null, _communityPostFresh = 0;
function _communityNotifStart(){
  if (_cpgLiveUnsub) return;                         // schon aktiv
  if (!_socReady() || !S.socialOn) return;
  _cpgLiveSeen = new Set();
  if (S.communityPostTs == null) { S.communityPostTs = Date.now(); persist(); }
  _communitySub(true);                               // erst mit ts-Sortierung (braucht Composite-Index)
}
/* Ein neuer public-Post muss ZUVERLÄSSIG im onSnapshot-Fenster landen → orderBy('ts','desc').
   Ohne orderBy sortiert Firestore nach Doc-ID, ein neuer Post fällt meist aus limit(20) →
   nie Echtzeit. orderBy+where braucht Composite-Index (visibility ASC, ts DESC, COLLECTION_GROUP).
   Fehlt der noch → failed-precondition → Fallback ohne orderBy (unzuverlässig, aber kein Absturz). */
function _communitySub(ordered){
  const me = _fbUser?.uid;
  const onSnap = snap => {
    // Nur neue/gelöschte Posts laden den offenen Feed live nach — reine Feld-Updates
    // (Flamme/Reaktion auf einen bereits gerenderten Post, auch die eigene) würden sonst
    // bei JEDEM Flamme-Tap den kompletten Feed sichtbar neu rendern.
    const structural = snap.docChanges().some(c => c.type !== 'modified');
    if (structural && document.getElementById('pg-freunde')?.classList.contains('on')) _liveFeedRefreshSoon();
    let maxTs = S.communityPostTs || 0, freshN = 0;
    snap.forEach(d => {
      const uid = d.ref.parent.parent.id;
      if (uid === me) return;                         // nur eigene aus; öffentliche Freundes-Posts zählen leise mit
      const p = d.data();
      let ts = typeof p.ts === 'number' ? p.ts : 0;
      if (ts > Date.now()) ts = Date.now();           // Poster-Uhr-Skew deckeln (Badge klebt sonst)
      const key = uid + ':' + d.id;
      if (_cpgLiveSeen.has(key)) return;
      _cpgLiveSeen.add(key);
      if (ts > (S.communityPostTs || 0)) { freshN++; if (ts > maxTs) maxTs = ts; }
    });
    if (freshN) {
      S.communityPostTs = maxTs; persist();
      if (document.getElementById('pg-freunde')?.classList.contains('on')) { _liveFeedRefreshSoon(); return; }
      _communityPostFresh += freshN;
      _updateFrBadges();                               // NUR Zahl — Community bewusst leise
    }
  };
  try {
    const parts = [window.FB.collectionGroup('posts'), window.FB.where('visibility','==','public')];
    if (ordered) parts.push(window.FB.orderBy('ts','desc'));
    parts.push(window.FB.limit(ordered ? 15 : 20));
    const q = window.FB.query(...parts);
    _cpgLiveUnsub = window.FB.onSnapshot(q, onSnap, err => {
      console.warn('[GymTrack] Community-Feed-Listener:', err?.message || err?.code || err);
      // Composite-Index (visibility,ts) fehlt noch → ohne Sortierung weiterlaufen.
      if (ordered && err?.code === 'failed-precondition') {
        try { _cpgLiveUnsub && _cpgLiveUnsub(); } catch(_){}
        _cpgLiveUnsub = null; _cpgLiveSeen = new Set(); _communitySub(false);
      }
    });
  } catch(e){ console.warn('[GymTrack] Community-Feed-Listener:', e?.code || e); }
}
function _communityNotifStop(){
  if (_cpgLiveUnsub) { try { _cpgLiveUnsub(); } catch(_){} _cpgLiveUnsub = null; }
  _cpgLiveSeen = null;
}
/* Offenen Feed live nachladen (debounced), wenn ein neuer Post reinkommt. */
let _liveFeedT = null;
function _liveFeedRefreshSoon(){
  clearTimeout(_liveFeedT);
  _liveFeedT = setTimeout(() => { try { _cpgReload(); } catch(_){} }, 700);
}
/* ── Echtzeit-Freundschaftsanfragen: Zahl am +-Button live + Standard-Benachrichtigung
   (In-App-Toast + lokale Push) bei einer NEUEN Anfrage. Zwei Equality-Filter (to,status)
   brauchen KEINEN Composite-Index. Erster Snapshot = Baseline (kein Nach-Melden alter). */
let _reqUnsub = null, _reqSeen = null;
function _reqNotifStart(){
  if (_reqUnsub) return;
  if (!_socReady() || !S.socialOn) return;
  _reqSeen = null;
  try {
    const q = window.FB.query(window.FB.collection('requests'),
      window.FB.where('to','==',_fbUser.uid), window.FB.where('status','==','pending'));
    _reqUnsub = window.FB.onSnapshot(q, snap => {
      const ids = [], fresh = [];
      snap.forEach(d => {
        const r = d.data();
        if ((S.blocked||[]).includes(r.from)) { window.FB.deleteDoc(window.FB.doc('requests', d.id)).catch(()=>{}); return; }
        ids.push(d.id);
        if (_reqSeen && !_reqSeen.has(d.id)) fresh.push(r);
      });
      _frReqCount = ids.length;
      _updateFrBadges();
      if (document.getElementById('pg-freunde')?.classList.contains('on')) { _loadRequests().then(r => _renderFrReqs(r.inc)).catch(()=>{}); }
      if (_reqSeen && fresh.length) {          // nur echte Neuzugänge melden, nicht den ersten Snapshot
        const nm = fresh[0].fromName || tr('Jemand');
        const body = fresh.length > 1
          ? tr('Neue Freundschaftsanfragen') + ' (' + fresh.length + ')'
          : nm + ' ' + tr('möchte dir folgen');
        try { _fireLocalFlameNotif(tr('GymTrack'), body); } catch(_){}   // echte Push, kein In-App-Banner
      }
      _reqSeen = new Set(ids);
    }, err => console.warn('[GymTrack] Anfragen-Listener:', err?.code || err));
  } catch(e){ console.warn('[GymTrack] Anfragen-Listener:', e?.code || e); }
  _reqAcceptStart();
}
/* Gegenstück: MEINE Anfragen, die der andere angenommen hat. Vorher wurde das
   nur beim Öffnen des Freunde-Tabs eingelöst — wer den Tab nicht öffnete, blieb
   „nicht befreundet" und erfuhr nie davon. Jetzt live: Freund eintragen, Doc
   aufräumen, Bescheid geben. */
let _reqAccUnsub = null, _reqAccSeen = null;
function _reqAcceptStart(){
  if (_reqAccUnsub) return;
  if (!_socReady() || !S.socialOn) return;
  _reqAccSeen = null;
  try {
    const q = window.FB.query(window.FB.collection('requests'),
      window.FB.where('from','==',_fbUser.uid), window.FB.where('status','==','accepted'));
    _reqAccUnsub = window.FB.onSnapshot(q, snap => {
      const fresh = [];
      let added = false;
      snap.forEach(d => {
        const r = d.data();
        if (!S.friends.includes(r.to)) { S.friends.push(r.to); added = true; }
        if (_reqAccSeen && !_reqAccSeen.has(d.id)) fresh.push(r);
        window.FB.deleteDoc(window.FB.doc('requests', d.id)).catch(()=>{});
      });
      if (added) {
        persist(); _pushSocialSoon(); _socCache = null; _frOutgoing = new Set();
        if (document.getElementById('pg-freunde')?.classList.contains('on')) { try { renderFriendsTab(); } catch(_){} }
      }
      if (_reqAccSeen && fresh.length) {
        const body = fresh.length > 1
          ? fresh.length + ' ' + tr('Anfragen wurden angenommen')
          : tr('Ihr seid jetzt Freunde');
        try { _fireLocalFlameNotif(tr('GymTrack'), body); } catch(_){}
      }
      _reqAccSeen = new Set(snap.docs.map(d => d.id));
    }, err => console.warn('[GymTrack] Zusagen-Listener:', err?.code || err));
  } catch(e){ console.warn('[GymTrack] Zusagen-Listener:', e?.code || e); }
}
function _reqNotifStop(){
  if (_reqUnsub){ try{ _reqUnsub(); }catch(_){} _reqUnsub = null; } _reqSeen = null;
  if (_reqAccUnsub){ try{ _reqAccUnsub(); }catch(_){} _reqAccUnsub = null; } _reqAccSeen = null;
}
// Einmalige, sanfte Permission-Anfrage sobald Community aktiv ist (nur nativ).
async function _ensureSocialNotifPermission(){
  const LN = _cap('LocalNotifications');
  if (!LN || S.socNotifAsked) return;
  S.socNotifAsked = true; persist();
  try {
    const perm = await LN.checkPermissions().catch(() => ({ display: 'prompt' }));
    if (perm.display === 'prompt' || perm.display === 'prompt-with-rationale') {
      await LN.requestPermissions().catch(() => {});
    }
    await LN.createChannel?.({ id:'gymtrack-social', name:'Community', importance:5, visibility:1, sound:'default' }).catch(() => {});
  } catch(_){}
}
async function _notifyFlames(fresh){
  // Namen der Reagierenden best-effort nachladen (profiles für alle Angemeldeten lesbar)
  for (const f of fresh) {
    if (!(_socCache||[]).find?.(x => x.uid === f.fuid)) {
      try {
        const s = await window.FB.getDoc(window.FB.doc('profiles', f.fuid));
        if (s.exists()) (_socCache = _socCache||[]).push({ uid: f.fuid, ...s.data() });
      } catch(_){}
    }
  }
  const first = fresh[0];
  const p = (_socCache||[]).find?.(x => x.uid === first.fuid);
  const name = (p && p.name) || tr('Jemand');
  const extra = fresh.length - 1;
  let body = name + ' ' + tr('hat mit einer Flamme auf deinen Post reagiert');
  if (extra > 0) body += ' +' + extra;
  _fireLocalFlameNotif(tr('Neue Flamme'), body);
  // Kein In-App-Toast mehr: nur die System-Push zeigen (blaue In-App-Leiste entfernt)
}
async function _fireLocalFlameNotif(title, body){
  const LN = _cap('LocalNotifications');
  if (LN) {
    try {
      const perm = await LN.checkPermissions().catch(() => ({ display: 'prompt' }));
      if (perm.display !== 'granted') return;   // ungefragt nicht nerven
      await LN.createChannel?.({ id:'gymtrack-social', name:'Community', importance:5, visibility:1, sound:'default' }).catch(() => {});
      const id = (_flameNotifId = _flameNotifId >= 2699 ? 2600 : _flameNotifId + 1);
      await LN.schedule({ notifications: [{
        id, title, body,
        schedule: { at: new Date(Date.now() + 250), allowWhileIdle: true },
        sound: 'default', channelId: 'gymtrack-social'
      }]}).catch(() => {});
    } catch(_){}
  } else if ('Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker) {
    try { const reg = await navigator.serviceWorker.ready; reg.showNotification(title, { body, icon:'icon-192.png', badge:'icon-192.png', tag:'gt-flame' }); } catch(_){}
  }
}
async function toggleReaction(uid, aid, emo){
  if (!_socReady()) return;
  haptic(10);
  const item = (_feedCache?.items||[]).find(x => x.id === aid && x.uid === uid);
  const cur = item?.reactions?.[_fbUser.uid];
  const next = { ...(item?.reactions||{}) };
  if (cur === emo) delete next[_fbUser.uid]; else next[_fbUser.uid] = emo;
  if (item) item.reactions = next;
  const host = document.getElementById('feed-list');
  if (host) host.innerHTML = (_feedCache?.items||[]).map(a => _feedItemHTML(a)).join('');
  // Nur den eigenen Schluessel schreiben — siehe Begruendung bei toggleFlame.
  const me = _fbUser.uid;
  const wert = (cur === emo)
    ? (window.FB.deleteField ? window.FB.deleteField() : null)
    : emo;
  try { await window.FB.updateDoc(window.FB.doc('profiles/' + uid + '/activities', aid), { ['reactions.' + me]: wert }); } catch(_){}
}
/* ── Aktivitäten schreiben (nach Training) ── */
async function _socLogActivity(sess, prs){
  if (!S.socialOn || !S.privacy?.feed || !_socReady()) return;
  const mgCount = {};
  (sess.logs||[]).forEach(l => {
    const ex = exById(l.exerciseId);
    if (ex?.muscleGroup) mgCount[ex.muscleGroup] = (mgCount[ex.muscleGroup]||0) + 1;
  });
  const top = Object.entries(mgCount).sort((a,b) => b[1] - a[1])[0];
  let streak = 0; try { streak = calcStreak().weeks || 0; } catch(_){}
  const act = {
    type:'workout',
    name:(S.userName || _fbUser.displayName || 'Athlet').slice(0,30),
    ts:Date.now(),
    dur:Math.round((sess.duration||0)/60),
    mg: top ? muscleLabel(top[0]) : null,
    prs: (S.privacy?.prs && prs && prs.length) ? prs.slice(0,3).map(p => (p.exName||'').slice(0,28)).filter(Boolean) : [],
    week:_weekStats().ses,
    streak,
    reactions:{}
  };
  try { await window.FB.addDoc(window.FB.collection('profiles/' + _fbUser.uid + '/activities'), act); }
  catch(e) { console.warn('[GymTrack] Activity-Push:', e?.code || e); }
}
function _socAfterWorkout(sess, prs){
  _pushSocialSoon();
  _socLogActivity(sess, prs);
}
/* ── Privatsphäre ── */
const PRIV_DEFS = [
  { k:'gym',    t:'Aktuelles Gym anzeigen',        s:'Gym-Name und Position auf der Karte' },
  { k:'live',   t:'Live-Trainingsstatus anzeigen',  s:'„Trainiert gerade" inkl. Dauer' },
  { k:'lastWk', t:'Letztes Training anzeigen',      s:'„vor 2 Stunden", „gestern" …' },
  { k:'stats',  t:'Trainingsstatistiken anzeigen',  s:'Workouts, Ø Dauer, Lieblingszeit, Muskelgruppen' },
  { k:'prs',    t:'Persönliche Rekorde anzeigen',   s:'Deine Top-3-1RM-Werte' },
  { k:'feed',   t:'Aktivitätsfeed anzeigen',        s:'Beendete Trainings im Feed der Freunde' },
];
/* Trainings-Mitteilungen sind KEINE Privatsphäre-Einstellung (die regelt, was
   andere sehen), sondern eine Empfangs-Einstellung — deshalb ein eigener
   Schalter mit eigenem Feld. Der Push-Worker liest ihn aus dem Profil und
   stellt bei false gar nicht erst zu. */
function setNotifLive(on){
  S.notifLive = !!on;
  persist();
  try { _pushSocialSoon(); } catch(_){}
}
function openPrivacySheet(){
  haptic(8);
  const body = document.getElementById('priv-body'); if (!body) return;
  body.innerHTML = `<div class="priv-hint">Du bestimmst, was Freunde sehen. Name, Wochen-Trainingszahl und Streak sind Teil der Rangliste, solange die Community aktiv ist.</div>
    <div class="card">${PRIV_DEFS.map(d => `
      <div class="row">
        <div class="row-body">
          <div class="row-title">${d.t}</div>
          <div class="row-sub" style="white-space:normal;line-height:1.4">${d.s}</div>
        </div>
        <label class="tgl" onclick="event.stopPropagation()">
          <input type="checkbox" ${S.privacy?.[d.k] ? 'checked' : ''} onchange="setPriv('${d.k}', this.checked)">
          <span class="tgl-track"></span>
        </label>
      </div>`).join('')}
    </div>
    <div class="priv-hint" style="margin-top:18px">Mitteilungen, die du bekommst.</div>
    <div class="card">
      <div class="row">
        <div class="row-body">
          <div class="row-title">Wenn jemand trainiert</div>
          <div class="row-sub" style="white-space:normal;line-height:1.4">Kurze Mitteilung, wenn ein Freund oder jemand aus deiner Gruppe ein Training startet — höchstens eine pro Person und Tag.</div>
        </div>
        <label class="tgl" onclick="event.stopPropagation()">
          <input type="checkbox" ${S.notifLive !== false ? 'checked' : ''} onchange="setNotifLive(this.checked)">
          <span class="tgl-track"></span>
        </label>
      </div>
    </div>`;
  openOv('ov-privacy');
}
function setPriv(k, on){
  S.privacy = S.privacy || {};
  S.privacy[k] = !!on;
  persist();
  _pushSocialSoon();
  haptic(8);
}
function copyFriendCode(btn){
  try { navigator.clipboard.writeText(_socCode()); } catch(_){}
  haptic(10);
  if (btn) { const t = btn.textContent; btn.textContent = 'Kopiert'; setTimeout(()=>btn.textContent = t, 1200); }
}
function shareFriendCode(){
  const txt = 'Füg mich in MyGymTrack hinzu — mein Freundes-Code: ' + _socCode();
  if (navigator.share) navigator.share({ text: txt }).catch(()=>{});
  else copyFriendCode(null);
}

/* ── Gym-Karte (Leaflet, lazy vom CDN) ── */
function _loadLeaflet(){
  if (window.L) return Promise.resolve();
  if (_leafP) return _leafP;
  _leafP = new Promise((res, rej) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = () => res();
    s.onerror = () => { _leafP = null; rej(new Error('Leaflet nicht erreichbar')); };
    document.head.appendChild(s);
  });
  return _leafP;
}
async function _renderSocMapTab(body){
  body.innerHTML = `${_socBackBar('Karte')}<div class="soc-map-wrap">
      <div id="social-map"><div class="soc-empty" style="height:100%;display:flex;align-items:center;justify-content:center">Karte lädt…</div></div>
      <div class="soc-map-search" id="soc-map-search"></div>
      <button class="soc-map-loc" id="soc-map-loc" onclick="socLocateMe()" aria-label="Mein Standort">
        <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.4"/><path d="M12 2v3.2M12 18.8V22M22 12h-3.2M5.2 12H2"/></svg>
      </button>
    </div>
    <div class="soc-map-foot" id="soc-map-foot"></div>`;
  _renderSocMapFoot();     // erst Foot (Höhe steht), dann Karte darauf einpassen
  _renderSocMapSearch();
  _sizeSocMap();
  try { await _loadLeaflet(); } catch(_) {
    const m = document.getElementById('social-map');
    if (m) m.innerHTML = '<div class="soc-empty" style="height:100%;display:flex;align-items:center;justify-content:center">Karte konnte nicht geladen werden — bist du offline?</div>';
    return;
  }
  _initSocMap();
}
// Karte füllt den Bildschirm bis knapp über die Tabbar; pg-Bottom-Padding wird
// neutralisiert, damit die große Karte nicht scrollt.
function _sizeSocMap(){
  const el   = document.getElementById('social-map');
  const wrap = el && el.closest('.soc-map-wrap');
  const bar  = document.querySelector('.tabbar');
  if (!el || !wrap || !bar) return;
  const foot  = document.getElementById('soc-map-foot');
  const footH = foot ? foot.getBoundingClientRect().height : 0;   // Info-Karte sitzt jetzt UNTER der Karte
  const gap   = footH ? 12 : 0;                                   // Abstand Karte ↔ Foot (= .soc-map-foot margin-top)
  const top    = el.getBoundingClientRect().top;
  const barTop = bar.getBoundingClientRect().top;
  const h = Math.max(240, Math.round(barTop - top - 14 - footH - gap));
  el.style.height = h + 'px';
  const pg  = el.closest('.pg');
  const pad = pg ? parseFloat(getComputedStyle(pg).paddingBottom) || 0 : 0;
  wrap.style.marginBottom = '0';
  if (foot) foot.style.marginBottom = (14 - pad) + 'px';          // Bottom-Padding der Seite neutralisieren, damit nichts scrollt
  if (_socMap) { try { _socMap.invalidateSize(); } catch(_){} }
}
window.addEventListener('resize', () => { if (document.getElementById('social-map')) _sizeSocMap(); });
function socLocateMe(){
  if (!_socMap || !navigator.geolocation) { alert('Standort nicht verfügbar.'); return; }
  haptic(6);
  navigator.geolocation.getCurrentPosition(
    p => { try { _socMap.setView([p.coords.latitude, p.coords.longitude], 14); } catch(_){} },
    _ => alert('Standort nicht verfügbar — Ortungsdienste erlauben?'),
    { enableHighAccuracy:true, timeout:8000, maximumAge:60000 }
  );
}
function _renderSocMapSearch(){
  const s = document.getElementById('soc-map-search'); if (!s) return;
  if (_socEditing) {
    s.classList.add('on');
    s.innerHTML = `
      <input class="f-in" id="soc-gym-q" placeholder="Gym suchen (Name, Stadt)" autocomplete="off"
        value="${esc(_socTmp?.name || '')}" oninput="socGymSearchInput(this.value)">
      <div id="soc-gym-res"></div>`;
  } else {
    s.classList.remove('on');
    s.innerHTML = '';
  }
}
function _renderSocMapFoot(){
  const f = document.getElementById('soc-map-foot'); if (!f) return;
  if (_socEditing) {
    f.innerHTML = `
      <div class="soc-foot-hint">Tippe auf die Karte oder such oben dein Gym</div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-gray" style="flex:1" onclick="socCancelGym()">Abbrechen</button>
        <button class="btn btn-acc" style="flex:1" onclick="socSaveGym()">Speichern</button>
      </div>`;
  } else {
    f.innerHTML = `
      <div class="row" style="padding:8px 4px">
        <div class="row-body">
          <div class="row-title">${S.gymName ? esc(S.gymName) : 'Kein Gym festgelegt'}</div>
          <div class="row-sub" style="white-space:normal;line-height:1.4">${S.gymName ? 'Dein Gym — für Freunde auf der Karte sichtbar' : 'Zeig deinen Freunden, wo du trainierst'}</div>
        </div>
        <button class="btn btn-acc" style="width:auto;padding:10px 16px;font-size:14px;flex-shrink:0" onclick="socEditGym()">${S.gymName ? 'Ändern' : 'Festlegen'}</button>
      </div>`;
  }
  _sizeSocMap();   // Foot-Höhe wechselt zwischen Ansehen/Bearbeiten → Karte neu einpassen
}
function _gymPin(initials, me){
  return L.divIcon({ className:'', html:`<div class="gym-pin${me?' me':''}">${initials}</div>`, iconSize:[34,34], iconAnchor:[17,17] });
}
function _initSocMap(){
  const el = document.getElementById('social-map');
  if (!el || !window.L) return;
  el.innerHTML = '';
  if (_socMap) { try { _socMap.remove(); } catch(_){} _socMap = null; }
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  _socMap = L.map(el, { zoomControl:false, attributionControl:false });
  // Attribution ohne Leaflet-„🇺🇦"-Prefix (die blau-gelbe Ukraine-Flagge), nur die
  // pflicht­gemäße Tile-Quelle — unten links, damit der Standort-Knopf frei bleibt.
  L.control.attribution({ prefix:false, position:'bottomleft' }).addTo(_socMap);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/' + (dark?'dark_all':'light_all') + '/{z}/{x}/{y}{r}.png',
    { maxZoom:19, attribution:'&copy; OpenStreetMap &copy; CARTO' }).addTo(_socMap);
  _socMap.on('click', e => {
    if (!_socEditing) return;
    _socTmp = { lat:e.latlng.lat, lng:e.latlng.lng, name:_socTmp?.name || S.gymName || '' };
    _drawSocMarkers();
  });
  _drawSocMarkers(true);
  setTimeout(() => { _sizeSocMap(); try { _socMap.invalidateSize(); } catch(_){} }, 260);
  _loadProfiles().then(() => _drawSocMarkers());
}
function _drawSocMarkers(fit){
  if (!_socMap || !window.L) return;
  _socMarkers.forEach(m => { try { _socMap.removeLayer(m); } catch(_){} });
  _socMarkers = [];
  const pts = [];
  const mine = (_socEditing && _socTmp) ? _socTmp
    : (S.gymLat != null && S.gymLng != null ? { lat:S.gymLat, lng:S.gymLng, name:S.gymName } : null);
  if (mine) {
    const m = L.marker([mine.lat, mine.lng], { icon:_gymPin('DU', true) }).addTo(_socMap)
      .bindPopup(`<b>Du</b>${mine.name ? '<br>' + esc(mine.name) : ''}`);
    _socMarkers.push(m); pts.push([mine.lat, mine.lng]);
  }
  (_socCache||[]).forEach(p => {
    if (p.uid === _fbUser?.uid || p.gymLat == null || p.gymLng == null) return;
    const m = L.marker([p.gymLat, p.gymLng], { icon:_gymPin(_socInitials(p.name), false) }).addTo(_socMap)
      .bindPopup(`<b>${esc(p.name||'')}</b>${p.gymName ? '<br>' + esc(p.gymName) : ''}`);
    _socMarkers.push(m); pts.push([p.gymLat, p.gymLng]);
  });
  if (fit) {
    if (pts.length) _socMap.fitBounds(pts, { padding:[40,40], maxZoom:14 });
    else _socMap.setView([51.16, 10.45], 5); // Deutschland-Übersicht
  }
}
function socEditGym(){
  haptic(8);
  _socEditing = true;
  _socTmp = (S.gymLat != null) ? { lat:S.gymLat, lng:S.gymLng, name:S.gymName } : null;
  _renderSocMapFoot(); _renderSocMapSearch();
}
function socCancelGym(){
  _socEditing = false; _socTmp = null;
  _renderSocMapFoot(); _renderSocMapSearch(); _drawSocMarkers();
}
function socSaveGym(){
  if (!_socTmp) { alert('Erst Standort wählen — Karte antippen oder Gym suchen.'); return; }
  const nameIn = document.getElementById('soc-gym-q');
  S.gymName = ((nameIn && nameIn.value.trim()) || _socTmp.name || 'Mein Gym').slice(0,40);
  S.gymLat = _socTmp.lat; S.gymLng = _socTmp.lng;
  _socEditing = false; _socTmp = null;
  persist(); _pushSocialSoon(); updateSocialUI();
  _renderSocMapFoot(); _renderSocMapSearch(); _drawSocMarkers(true);
  haptic(15);
}
function socGymSearchInput(v){
  clearTimeout(_socSearchT);
  const q = (v||'').trim();
  const res = document.getElementById('soc-gym-res');
  if (q.length < 3) { if (res) res.innerHTML = ''; return; }
  _socSearchT = setTimeout(() => socGymSearch(q), 450);
}
async function socGymSearch(q){
  const res = document.getElementById('soc-gym-res'); if (!res) return;
  res.innerHTML = '<div class="soc-empty" style="padding:10px">Suche…</div>';
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=5&q=' + encodeURIComponent(q));
    const js = await r.json();
    if (!Array.isArray(js) || !js.length) { res.innerHTML = '<div class="soc-empty" style="padding:10px">Nichts gefunden</div>'; return; }
    _socHits = js;
    res.innerHTML = '<div class="soc-search-res">' + js.map((h,i) =>
      `<button onclick="socPickHit(${i})">${esc((h.display_name||'').split(',').slice(0,3).join(','))}</button>`).join('') + '</div>';
  } catch(_) { res.innerHTML = '<div class="soc-empty" style="padding:10px">Suche fehlgeschlagen</div>'; }
}
function socPickHit(i){
  const h = _socHits[i]; if (!h) return;
  _socTmp = { lat:+h.lat, lng:+h.lon, name:(h.display_name||'').split(',')[0].trim().slice(0,40) };
  const q = document.getElementById('soc-gym-q'); if (q) q.value = _socTmp.name;
  const res = document.getElementById('soc-gym-res'); if (res) res.innerHTML = '';
  _drawSocMarkers();
  if (_socMap) _socMap.setView([_socTmp.lat, _socTmp.lng], 15);
  haptic(8);
}

/* ── Heute-Widget: Rangliste ── */
function hwSocial(size){
  if (!S.socialOn) {
    return `<button class="btn btn-acc heute-train-btn" onclick="openSocial()">${size==='sm'?'Freunde':'Community entdecken'}</button>`;
  }
  const wk = getWeekKey();
  const rows = (_socCache||[])
    .map(p => ({ ...p, _v: (p.week && p.week.key === wk) ? (p.week.vol||0) : 0 }))
    .sort((a,b) => b._v - a._v)
    .slice(0, size==='sm' ? 2 : 3);
  if (!rows.length) return `<div class="soc-empty" style="padding:12px 6px;cursor:pointer" onclick="openSocial()">Tippen für Rangliste &amp; Freunde</div>`;
  return `<div style="cursor:pointer" onclick="openSocial()">` + rows.map((p,i) => `
    <div class="soc-row" style="padding:5px 2px">
      <span class="soc-rank${i===0?' top':''}" style="width:18px;font-size:13px">${i+1}</span>
      <div class="soc-ava" style="width:28px;height:28px;font-size:10.5px">${_socInitials(p.name)}</div>
      <div style="flex:1;min-width:0"><div class="soc-name" style="font-size:13px">${esc(p.name||'')}</div></div>
      <span class="soc-val" style="font-size:12.5px">${fmtKg(p._v)}</span>
    </div>`).join('') + `</div>`;
}



// ── DEMO/SIMULATIONS-SEED (nur wenn DEMO_SEED=true) ───────────────
// Baut 6 Monate Trainingshistorie mit stetig steigendem Volumen +
// aktuelle Woche Mo–Sa "abgehakt". Rein im Speicher, nicht persistiert.
function _seedDemoData() {
  // Premium-UI freischalten (Screenshots der KI-/Premium-Features). Nur Demo-Builds:
  // Funktion läuft ausschliesslich bei DEMO_SEED=true, und der Dev-Unlock ist rein lokal.
  try { localStorage.setItem('gt_premiumDev', '1'); } catch(_){}
  // Community mit Beispiel-Daten (Roster, Feed, Rangliste, Karte) statt Login-Gate.
  // Das Flag hing bisher nur am Legacy-Skript .seed_demo.py — im DEMO_SEED-Build war
  // der Freunde-Tab deshalb leer. `gt_demo_bySeed` merkt sich, dass WIR es gesetzt
  // haben, damit der naechste Nicht-Demo-Start beides wieder abraeumt (sonst blockt
  // _demoModeAny() dauerhaft das Aufraeumen der Demo-Daten).
  try { localStorage.setItem('gt_demo', '1'); localStorage.setItem('gt_demo_bySeed', '1'); } catch(_){}
  S.socialOn = true;
  if (!S.userName) S.userName = 'Lenny';
  // Dunkles Theme erzwingen: nach einer Neuinstallation ist der WebView-Storage leer
  // und die App startet hell — die Promo-Screenshots sind aber alle dunkel.
  S.theme = 'dark';
  try { setTheme('dark', true); } catch(_){}
  // Profilbild oben links auf der Heute-Seite (sonst nur die Initiale "L"). Motiv aus
  // dem Gym statt Portrait — im runden Ausschnitt bleibt der Hantelgriff erkennbar.
  const DEMO_AVA = 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=crop&w=300&h=300&q=70';
  /* Ein selbst angelegtes Bild wird NICHT ueberschrieben — der Seed laeuft auf
     echten Geraeten mit echten Profilen. Und was der Seed setzt, merkt er sich
     unter gt_prof_photo_demo: nur DAS raeumt app-boot.js spaeter wieder ab. */
  try {
    const vorhanden = localStorage.getItem('gt_prof_photo');
    if (!vorhanden || !/^data:/i.test(vorhanden)) {
      localStorage.setItem('gt_prof_photo', DEMO_AVA);
      localStorage.setItem('gt_prof_photo_demo', DEMO_AVA);
    }
  } catch(_){}
  // Erholung fuer den Screenshot fest vorgeben. Die Demo trainiert Mo–Sa durch, damit
  // die Wochenleiste voll ist — dieselbe Historie zieht die Akkus aber alle auf
  // "wenig erholt". Feste Werte pro Muskelgruppe loesen das UND geben der Kachel eine
  // Staffelung: zwei volle Akkus, der Rest gestaffelt bis "Fast bereit" — alles gleich
  // gruen sieht nach Attrappe aus. Nur ein Wrapper, die echte Berechnung bleibt
  // unveraendert; getMuscleGroupRecovery() mittelt darauf auf und wird automatisch mit.
  // Je Gruppe eine ANDERE Erholungsstufe, damit die Kachel im Screenshot alle fuenf
  // Zustaende von recoveryState() zeigt: 100 = "Vollständig erholt", >=75 "Bereit",
  // >=55 "Fast bereit", >=30 "Wenig erholt", <30 "Nicht erholt". Brust voll,
  // Schultern halb, Arme leer.
  const DEMO_REC = { brust:100, ruecken:85, beine:65, schultern:50, arme:8, core:100 };
  try {
    const _echteRec = getExerciseRecovery;
    getExerciseRecovery = function() {
      const r = _echteRec.apply(this, arguments);
      for (const id in r) {
        const ex = (S.exercises || []).find(e => e.id === id);
        const pct = DEMO_REC[ex && ex.muscleGroup];
        if (pct == null) continue;
        r[id].recPct = pct; r[id].fatPct = 100 - pct;
      }
      return r;
    };
  } catch(_){}
  const r05 = v => Math.round(v * 2) / 2;                 // auf 0,5-kg-Schritte runden
  // Wdh haengen NUR am Satz-Index, nicht mehr am Wochentag. Vorher war es
  // 8 + ((s + di) % 3) — damit hatte jeder Wochentag eine andere Wdh-Summe und
  // das Volumen sprang von Einheit zu Einheit. Das war die halbe Zickzack-Ursache.
  const repsOf = s => [10,9,9,8,9][s % 5];
  // Übungen (fester Split: Push / Pull / Legs)
  // base = realistisches ENDgewicht nach den drei Jahren. Der Verlauf startet bei
  // 50 % davon (siehe factor). Vorher standen hier Startgewichte, die ein zweiter
  // Durchgang auf eine Ziel-Volumenkurve hochskaliert hat — dabei kamen 245 kg
  // Bankdruecken heraus.
  const EX = [
    { id:'dm_bench', name:'Bankdrücken',      muscleGroup:'brust',     base:100 },
    { id:'dm_ohp',   name:'Schulterdrücken',  muscleGroup:'schultern', base:60  },
    { id:'dm_dip',   name:'Dips',             muscleGroup:'arme',      base:75  },
    { id:'dm_dead',  name:'Kreuzheben',       muscleGroup:'ruecken',   base:180 },
    { id:'dm_row',   name:'Langhantelrudern', muscleGroup:'ruecken',   base:90  },
    { id:'dm_curl',  name:'Bizeps-Curls',     muscleGroup:'arme',      base:35  },
    { id:'dm_squat', name:'Kniebeugen',       muscleGroup:'beine',     base:150 },
    { id:'dm_press', name:'Beinpresse',       muscleGroup:'beine',     base:260 },
  ];
  S.exercises = EX.map(e => {
    const ex = { id:e.id, name:e.name, emoji:'', muscleGroup:e.muscleGroup,
                 targetSets:4, targetReps:9, targetType:'reps', repMin:8, repMax:10,
                 weightScheme:'double', progStep:2.5, targetWeight:0 };
    ensureExGroups(ex);
    return ex;
  });
  const baseOf = id => EX.find(e => e.id === id).base;
  // Satzzahl je Plan so gewaehlt, dass alle drei Einheiten aehnlich viel Volumen
  // ergeben (~10,5 t bei vollem Gewicht). Der Rest-Unterschied (Push lag 5 % unter
  // Legs) wird unten pro Einheit exakt ausgeglichen — sonst zeichnet der Wechsel
  // Push/Pull/Legs ein Zickzack ins Volumen-Chart.
  const TEMPLATES = [
    { ex:['dm_bench','dm_ohp','dm_dip'],  sets:5 },   // Push
    { ex:['dm_dead','dm_row','dm_curl'],  sets:4 },   // Pull
    { ex:['dm_squat','dm_press'],         sets:3 },   // Legs
  ];
  // Referenzvolumen = Mittel der drei Einheiten bei vollem Zielgewicht (~10,7 t).
  // Daran wird jede Einheit ausgerichtet, deshalb bleibt der Korrekturfaktor
  // immer nahe 1 — anders als beim alten Durchgang, der auf 27 t hochskaliert hat.
  const _rohVol = tpl => tpl.ex.reduce((sum, exId) => {
    const w0 = Math.max(2.5, r05(baseOf(exId)));
    let v = 0;
    for (let s = 0; s < tpl.sets; s++) v += (s === 0 ? r05(w0 * 0.9) : w0) * repsOf(s);
    return sum + v;
  }, 0);
  const V_REF = TEMPLATES.reduce((a, t) => a + _rohVol(t), 0) / TEMPLATES.length;

  const WEEKS = 187;                                      // ab Anfang 2023 (Matrix-Screenshot)
  const today = new Date(); today.setHours(18,0,0,0);
  const curMon = new Date(today);
  curMon.setDate(today.getDate() - ((today.getDay()+6)%7)); // Montag dieser Woche

  // ── Schriftzug im Matrix-Raster (Werbe-Screenshots) ───────────────
  // Das Jahresraster der Matrix ist ein 53×7-Feld: Spalte = Kalenderwoche,
  // Zeile 0..6 = Mo..So. Ein Trainingstag = ein Pixel. Damit "malen" die drei
  // vollen Vorjahre den Slogan DON'T / SKIP / LEGS. Das laufende Jahr bleibt
  // bewusst normal Mo–Sa durchtrainiert — sonst waeren Streak, Wochenleiste
  // und Erholungs-Kachel im selben Screenshot kaputt.
  const MX_JAHR  = today.getFullYear();
  const MX_WORDS = { [MX_JAHR]: "DON'T", [MX_JAHR-1]: 'SKIP', [MX_JAHR-2]: 'LEGS' };
  const MX_FONT = {
    D:  ['####.','#...#','#...#','#...#','####.'],
    O:  ['.###.','#...#','#...#','#...#','.###.'],
    N:  ['#...#','##..#','#.#.#','#..##','#...#'],
    "'":['#','#','.','.','.'],
    T:  ['#####','..#..','..#..','..#..','..#..'],
    S:  ['.####','#....','.###.','....#','####.'],
    K:  ['#...#','#..#.','###..','#..#.','#...#'],
    I:  ['###','.#.','.#.','.#.','###'],
    P:  ['####.','#...#','####.','#....','#....'],
    L:  ['#....','#....','#....','#....','#####'],
    E:  ['#####','#....','####.','#....','#####'],
    G:  ['.####','#....','#..##','#...#','.####'],
  };
  const MX_ROW0 = 1;   // Buchstaben auf Di–Sa; Mo und So bleiben als Rand frei
  // Eine Rasterzeile ist hoeher als eine Spalte breit ist. Unskaliert steht der
  // 5x5-Buchstabe deshalb schmal und hoch da und zerfaellt in Punktrauschen.
  // Jede Glyph-Spalte wird deshalb verdoppelt (Vertikalstriche 2 Zellen dick,
  // Buchstabe breiter als hoch). Im LAUFENDEN Jahr reichen die Spalten bis heute
  // aber nicht fuer das breite DON'T — deshalb pro Jahr die groesste Skalierung
  // nehmen, die noch passt.
  const MX_SCALES = [2, 1];

  // Liefert die Datums-Keys, die im Jahr `year` gefuellt sein muessen, damit
  // `word` im Raster steht. Spalte 0 beginnt am Montag der ersten Kalenderwoche
  // — exakt dieselbe Rechnung wie in _mxRenderYears (js/app-streak.js).
  // Nutzbare Spalten eines Jahres (im laufenden Jahr nur bis heute — dahinter
  // ist jede Zelle "future" und laesst sich nicht einfaerben).
  function _mxFreieSpalten(year) {
    const jan1  = new Date(year, 0, 1);
    const start = new Date(jan1);
    start.setDate(jan1.getDate() - ((jan1.getDay()+6)%7));
    const ende  = Math.min(new Date(year, 11, 31).getTime(), today.getTime());
    return Math.floor((ende - start) / 86400000 / 7) + 1;
  }
  function _mxBreite(word, s) {
    const g = Array.from(word).map(ch => MX_FONT[ch]).filter(Boolean);
    return g.reduce((a, gl) => a + gl[0].length * s, 0) + (g.length - 1) * s;
  }
  // EINE Skalierung fuer alle Jahre: unterschiedlich grosse Schrift pro Zeile
  // sieht nach Fehler aus. Also die groesste, die in JEDES Wortjahr passt.
  const skalierung = MX_SCALES.find(s =>
    Object.keys(MX_WORDS).every(y => _mxBreite(MX_WORDS[y], s) + 2 <= _mxFreieSpalten(+y))
  ) || 1;

  function _mxWordKeys(year, word) {
    const jan1  = new Date(year, 0, 1);
    const start = new Date(jan1);
    start.setDate(jan1.getDate() - ((jan1.getDay()+6)%7));
    const dec31 = new Date(year, 11, 31);
    // Im laufenden Jahr endet das Raster bei heute — dahinter sind alle Zellen
    // "future" und lassen sich nicht einfaerben.
    const ende  = Math.min(dec31.getTime(), today.getTime());
    const frei  = Math.floor((ende - start) / 86400000 / 7) + 1;   // nutzbare Spalten

    const scale  = skalierung;
    const breit  = zeile => Array.from(zeile).map(c => c.repeat(scale)).join('');
    const glyphs = Array.from(word).map(ch => MX_FONT[ch]).filter(Boolean).map(g => g.map(breit));
    if (!glyphs.length) return null;

    const breite = g => g[0].length;
    const total  = glyphs.reduce((a, g) => a + breite(g), 0) + (glyphs.length - 1) * scale;
    let col = Math.max(1, Math.floor((frei - total) / 2));   // zentriert
    const keys = new Set();
    glyphs.forEach(g => {
      for (let r = 0; r < g.length; r++) {
        for (let c = 0; c < breite(g); c++) {
          if (g[r][c] !== '#') continue;
          const d = new Date(start);
          d.setDate(start.getDate() + (col + c) * 7 + (MX_ROW0 + r));
          // Randspalten ragen ins Nachbarjahr — die Zellen sind dort "void".
          if (d.getFullYear() === year) keys.add(_localDateKey(d));
        }
      }
      col += breite(g) + scale;
    });
    // Im laufenden Jahr bleibt die AKTUELLE Woche zusaetzlich durchtrainiert —
    // sonst waeren Streak, Wochenleiste und Erholungs-Kachel im selben
    // Screenshot leer. Mehr nicht, sonst steht ein Block neben dem Wort.
    return { keys, normalAb: dec31 > today ? curMon.getTime() : Infinity };
  }
  const MX_WORD_KEYS = {};
  Object.keys(MX_WORDS).forEach(y => {
    const w = _mxWordKeys(+y, MX_WORDS[y]);
    if (w) MX_WORD_KEYS[y] = w;
  });

  // Kandidaten-Tage: durchgehend Mo–Sa (6×), einziger Ruhetag ist der Sonntag.
  const days = [];
  for (let w = 0; w < WEEKS; w++) {
    const weekMon = new Date(curMon);
    weekMon.setDate(curMon.getDate() - (WEEKS - 1 - w) * 7);
    for (let di = 0; di < 6; di++) {
      const d = new Date(weekMon);
      d.setDate(weekMon.getDate() + di);
      d.setHours(18, (di*7) % 40, 0, 0);
      const wort = MX_WORD_KEYS[d.getFullYear()];
      // Schriftzug-Jahre: nur Tage behalten, die einen Buchstaben-Pixel treffen.
      // Hinter normalAb (nur laufendes Jahr) wird wieder normal durchtrainiert.
      if (wort && d.getTime() < wort.normalAb && !wort.keys.has(_localDateKey(d))) continue;
      days.push({ d, di });
    }
  }

  const sessions = [];
  let tmplIdx = 0;
  days.forEach(({ d, di }, idx) => {
    // Fortschritt 0..1 über die drei Jahre, pro EINHEIT (nicht pro Woche) — sonst
    // liegen die sechs Trainings einer Woche exakt aufeinander und die Kurve
    // steigt in Stufen statt stetig.
    const prog = days.length > 1 ? idx / (days.length - 1) : 1;
    // 50 % → 100 % des Zielgewichts, leicht beschleunigend.
    const factor = 0.5 + 0.5 * Math.pow(prog, 1.25);
    // Zukunftstage der aktuellen Woche (Do–Sa liegen nach "jetzt"): als warmup
    // taggen → volles Volumen fürs Chart, aber gedämpfte Ermüdung (sonst würde
    // die negative Zeitdifferenz die Erholung überall auf 0% ziehen).
    const isFuture = d.getTime() > Date.now();
    const tpl = TEMPLATES[tmplIdx % TEMPLATES.length]; tmplIdx++;
    const logs = tpl.ex.map(exId => {
      const w0 = Math.max(2.5, r05(baseOf(exId) * factor));
      const sets = [];
      for (let s = 0; s < tpl.sets; s++) {
        const wt = s === 0 ? r05(w0 * 0.9) : w0;        // 1. Satz etwas leichter
        sets.push(isFuture ? { w: wt, r: repsOf(s), type:'warmup' } : { w: wt, r: repsOf(s) });
      }
      return { exerciseId: exId, sets };
    });
    // Volumen dieser Einheit exakt auf die Zielkurve ziehen. Zwei Schritte:
    // (1) alle Saetze proportional (Faktor liegt zwischen 0,97 und 1,03),
    // (2) die verbleibende Rundungsdifferenz auf den leichten Auftaktsatz.
    // Ergebnis: benachbarte Einheiten unterscheiden sich um < 0,15 % statt um
    // bis zu 8,7 % — im Chart eine durchgehende Linie statt Zickzack.
    const ziel  = V_REF * factor;
    const alle  = logs.flatMap(l => l.sets);
    const volOf = () => alle.reduce((a, s) => a + s.w * s.r, 0);
    const k = ziel / volOf();
    alle.forEach(s => { s.w = Math.max(2.5, r05(s.w * k)); });
    const auftakt = alle[0];
    auftakt.w = Math.max(2.5, r05(auftakt.w + (ziel - volOf()) / auftakt.r));
    sessions.push({
      id: 'dm_' + idx,
      date: d.toISOString(),
      duration: 3300 + (di % 3) * 600,
      logs,
    });
  });
  // Der Feinabgleich oben ist NICHT der alte, weggeworfene Normalisierungs-Durchgang:
  // der hat auf eine frei gesetzte Zielkurve bis 27 t skaliert und damit 245 kg
  // Bankdruecken erzeugt. Hier ist das Ziel aus den realen Basisgewichten abgeleitet
  // (V_REF ~10,7 t), der Faktor bleibt deshalb im Prozentbereich — Bankdruecken
  // laeuft ueber die drei Jahre von rund 50 auf 105 kg.
  S.sessions = sessions;
  // Derselbe Push/Pull/Legs-Split auch als angelegter Plan: drei Presets + Eintrag
  // auf Mo–Sa im Wochenplan (Sonntag Ruhetag). Ohne das stand der Heute-Tab ohne
  // Tagesplan da und der Trainings-Start zeigte "kein Plan" — die Historie kam ja
  // aus denselben Vorlagen, nur angelegt war nie eine.
  S.workoutPresets = [
    { id:'dm_p_push', name:'Push Day', exIds:['dm_bench','dm_ohp','dm_dip'],  color:SPLIT_PALETTE[0] },
    { id:'dm_p_pull', name:'Pull Day', exIds:['dm_dead','dm_row','dm_curl'],  color:SPLIT_PALETTE[1] },
    { id:'dm_p_legs', name:'Leg Day',  exIds:['dm_squat','dm_press'],         color:SPLIT_PALETTE[2] },
  ];
  S.weekPlan = {
    mon:{ type:'preset', id:'dm_p_push' }, tue:{ type:'preset', id:'dm_p_pull' },
    wed:{ type:'preset', id:'dm_p_legs' }, thu:{ type:'preset', id:'dm_p_push' },
    fri:{ type:'preset', id:'dm_p_pull' }, sat:{ type:'preset', id:'dm_p_legs' },
    sun:{ type:'none' },
  };
  S.onboarded = true;                                    // Onboarding überspringen
  // Demo: direkt Statistik-Tab zeigen (nur zum Screenshot-Prüfen)
  setTimeout(() => { try { goTab('stats', document.querySelectorAll('.tab')[2]); } catch(_){} }, 400);
  // Demo-only: Mo–Sa alle als solide Haken zeigen (Zukunftstage nicht ausgrauen)
  if (!document.getElementById('dm-demo-style')) {
    const st = document.createElement('style');
    st.id = 'dm-demo-style';
    // Demo-only: Wochen-Haken voll deckend UND jedes Trainings-Feld im Kalender
    // gleich stark einfaerben. Sonst zeichnet die Volumen-Staffelung (l1–l4) die
    // fruehen Jahre blass — im Screenshot soll die Serie gleichmaessig wirken.
    st.textContent = '.week-dot.future{opacity:1 !important}' +
      '.week-pill.future{background:var(--ng-well)!important}' +
      '.cal-cell.l1,.cal-cell.l2,.cal-cell.l3,.cal-cell.l4{background:var(--acc)!important;color:#fff!important}';
    document.head.appendChild(st);
  }
}

// ── DEMO-DATEN-BEREINIGUNG ───────────────────────────────
// DEMO_SEED-Builds (dm_-IDs) und .seed_demo.py (String-IDs wie 'bench') haben
// Demo-Trainingsdaten auf echten Accounts hinterlassen (persist→Cloud-Sync).
// Echte IDs beginnen mit '_' (uid()) — Demo-IDs sind eindeutig erkennbar und
// werden hier restlos entfernt (Übungen, Sessions, Seed-Presets, Wochenplan-Refs).
// Läuft beim Start UND nach jedem Cloud-Merge, damit kontaminierte Cloud-Docs
// sich selbst heilen. Im Marketing-Simulator (DEMO_SEED/gt_demo) bleibt alles.
const _DEMO_EX_IDS = new Set(['bench','incline','ohp','lateral','pushdown','deadlift','pullup','row','curl','squat','legpress','legcurl']);
function _isDemoExId(id){ return typeof id === 'string' && (id.indexOf('dm_') === 0 || _DEMO_EX_IDS.has(id)); }
function _demoModeAny(){
  try { return DEMO_MODE() || localStorage.getItem('gt_demo_social') === '1'; } catch(_){ return false; }
}
function _purgeDemoData(obj){
  if (typeof DEMO_SEED !== 'undefined' && DEMO_SEED) return false;
  if (_demoModeAny()) return false;
  let hit = false;
  try {
    if (Array.isArray(obj.exercises)) {
      const n = obj.exercises.length;
      obj.exercises = obj.exercises.filter(e => !(e && _isDemoExId(e.id)));
      if (obj.exercises.length !== n) hit = true;
    }
    if (Array.isArray(obj.sessions)) {
      const n = obj.sessions.length;
      obj.sessions = obj.sessions.filter(s => {
        if (!s) return false;
        if (typeof s.id === 'string' && s.id.indexOf('dm_') === 0) return false;
        return !(s.logs || []).some(l => l && _isDemoExId(l.exerciseId));
      });
      if (obj.sessions.length !== n) hit = true;
    }
    // Seed-Presets (Push/Pull/Legs, exIds ausschließlich Demo-Übungen) + deren Wochenplan-Slots
    if (Array.isArray(obj.workoutPresets)) {
      const gone = new Set();
      const n = obj.workoutPresets.length;
      obj.workoutPresets = obj.workoutPresets.filter(p => {
        const bad = p && Array.isArray(p.exIds) && p.exIds.length > 0 && p.exIds.every(_isDemoExId);
        if (bad) gone.add(p.id);
        return !bad;
      });
      if (obj.workoutPresets.length !== n) {
        hit = true;
        if (obj.weekPlan) for (const k in obj.weekPlan) {
          const d = obj.weekPlan[k];
          if (d && d.type === 'preset' && gone.has(d.id)) obj.weekPlan[k] = { type:'none' };
        }
      }
    }
  } catch(_){}
  if (hit) console.log('[GymTrack] Demo-Daten bereinigt');
  return hit;
}

// ═══════════════════════════════════════════════════════
// PREMIUM — ABO (StoreKit 2) · PAYWALL · KI-COACH-CORE
// Status NUR lokal (localStorage 'gt_premium'), NICHT im users-Doc — keine
// Rules-Änderung nötig, kein Sync-Bruch. Quelle der Wahrheit ist StoreKit
// (Transaction.currentEntitlements), der JWS ist der Abo-Beweis für den
// KI-Worker (serverseitige Verifikation gegen Apple-Zertifikate).
// Einziger Firestore-Spiegel: profiles/{uid}.premium (Community-Badge) —
// läuft über den bestehenden _pushSocialProfile-Weg, kein zweiter Schreibpfad.
// ═══════════════════════════════════════════════════════
const AI_WORKER_URL = 'https://gymtrack-ai.wolterlenny362.workers.dev';
const PREM_MONTHLY  = 'gymtrack.premium.monthly';
const PREM_YEARLY   = 'gymtrack.premium.yearly';

let PREM = (() => {
  const base = { active:false, plan:null, exp:null, jws:null, src:null };
  try { return Object.assign(base, JSON.parse(localStorage.getItem('gt_premium')) || {}); }
  catch(_) { return base; }
})();
function _premSave(){ try { localStorage.setItem('gt_premium', JSON.stringify(PREM)); } catch(_){} }

function isPremium(){
  // try/catch: _fbUser ist ein späteres top-level `let` — bei frühem Aufruf
  // (z. B. beim Boot-Rendering vor dem Erreichen der KONTO-Sektion) wäre der
  // Zugriff sonst ein TDZ-ReferenceError, der den kompletten Boot abbricht!
  // WICHTIG: _fbUser und _authSettled je EIGENER try/catch — ein TDZ-Error beim
  // _fbUser-Zugriff darf den Cache-Fallback darunter nicht mit abwürgen (genau
  // das war der Bug: beide standen in einem Block, die Cache-Zeile wurde beim
  // allerersten Boot-Render dadurch NIE erreicht).
  try { if (_fbUser && TEST_UIDS.has(_fbUser.uid)) { try{localStorage.setItem('gt_founderCache','1');}catch(_){} return true; } } catch(_){} // Founder/Tester immer Premium
  // Kaltstart: Auth-Restore (_fbUser/_authSettled) noch nicht fertig (ggf. sogar
  // TDZ, vor der `let`-Deklaration) → letzten bekannten Founder-Stand annehmen,
  // sonst poppen Premium-Badge/KI-Karte erst nach dem Auth-Sync sichtbar auf.
  try {
    if (!_authSettled && localStorage.getItem('gt_founderCache') === '1') return true;
  } catch(_) {
    if (localStorage.getItem('gt_founderCache') === '1') return true;   // _authSettled selbst noch TDZ → erst recht "nicht settled"
  }
  if (localStorage.getItem('gt_premiumDev') === '1') return true;             // Dev-Unlock (nur UI, kein echtes Abo)
  if (!PREM.active) return false;
  return !PREM.exp || (PREM.exp + 3*864e5) > Date.now();  // 3 Tage Kulanz bei Ablauf
}

// ── StoreKit-Bridge (PremiumPlugin, nur nativ — _cap() liefert null im Web) ──
let _pwProducts = null; // [{id, displayPrice, price, period}]
async function _premLoadProducts(){
  const P = _cap('PremiumPlugin'); if (!P) return [];
  try { const r = await P.loadProducts(); _pwProducts = r.products || []; return _pwProducts; }
  catch(e){ console.log('[PREM] Produkte laden:', e?.message||e); return []; }
}
function _premApply(res){
  if (!res) return;
  if (res.active) {
    PREM = { active:true, plan: res.productId === PREM_YEARLY ? 'yearly' : 'monthly',
             exp: res.expiresMs || 0, jws: res.jws || PREM.jws || null, src:'store' };
  } else if (res.status === 'none') {
    PREM = { active:false, plan:null, exp:null, jws:null, src:null };
  }
  _premSave();
  try { premRefreshUI(); } catch(_){}
}
// Premium-Status in profiles/{uid} spiegeln (Community-Badge) — nutzt den
// bestehenden Social-Profil-Push, damit KEIN zweiter Firestore-Schreibpfad entsteht.
async function _syncPremiumProfile(){
  try { if (typeof _pushSocialProfile === 'function') await _pushSocialProfile(); } catch(_){}
}
async function premBuy(productId){
  const P = _cap('PremiumPlugin');
  if (!P) { _dndToast('Premium schließt du in der MyGymTrack iOS-App ab.'); return null; }
  const btn = document.getElementById('pw-cta');
  const origText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Kauf läuft…'; }
  try {
    // uid mitgeben: StoreKit haengt daraus ein appAccountToken an die Transaktion
    // (PremiumPlugin.accountToken(for:)), der KI-Worker rechnet es nach. Ohne das
    // ist der Kaufbeleg ein uebertragbarer Schluessel. Nicht angemeldet -> leer,
    // dann kauft der Plugin-Code ohne Token (der Worker laesst das durch).
    let _pbUid = ''; try { _pbUid = (_fbUser && _fbUser.uid) || ''; } catch(_) {}
    const res = await P.purchase({ productId, uid: _pbUid });
    if (res && res.active) {
      _premApply(res);
      await _syncPremiumProfile();
      haptic(30);
      if (btn) btn.textContent = 'Premium aktiv ✓';
      setTimeout(() => { try { closeOv('ov-paywall'); } catch(_){} }, 700);
      // Einrichtung (Task 10): 420 ms NACH dem Schließen der Paywall (700 ms
      // darüber) — zwei gleichzeitig laufende Overlay-Animationen sehen kaputt
      // aus. Eigener try/catch-Deckel: wirft die Einrichtung, ist der Kauf
      // trotzdem abgeschlossen und die Paywall bleibt geschlossen. Wer schon
      // ein Profil hat (Verlängerung, zweites Gerät), wird nicht neu gefragt.
      setTimeout(() => {
        try {
          // Gestaltungsregel 2: im Training kein Overlay, nichts Modales.
          // openOv() schiebt das Trainings-Sheet über OV_STACK_EXEMPT weg. Die
          // Einrichtung holt der Hub später nach — preset ist dann noch offen.
          if (typeof isWorkoutActive === 'function' && isWorkoutActive()) return;
          const offen = !S.aiCoach || S.aiCoach.preset === undefined;
          if (offen && typeof openCoachSetup === 'function') openCoachSetup();
        } catch(e) { console.warn('[Coach] Einrichtung nach Kauf:', e); }
      }, 700 + 420);
    } else if (res && res.status === 'pending') {
      _dndToast('Kauf wartet auf Bestätigung (z. B. Familienfreigabe).');
      if (btn) { btn.disabled = false; btn.textContent = origText; }
    } else if (btn) { btn.disabled = false; btn.textContent = origText; }
    return res;
  } catch(e) {
    _dndToast('Kauf fehlgeschlagen: ' + (e?.message||e));
    if (btn) { btn.disabled = false; btn.textContent = origText; }
    return null;
  }
}
async function premRestore(){
  const P = _cap('PremiumPlugin');
  if (!P) { _dndToast('Käufe wiederherstellen geht nur in der iOS-App.'); return null; }
  try {
    const res = await P.restore();
    _premApply(res);
    await _syncPremiumProfile();
    _dndToast(res && res.active ? 'Premium aktiv — willkommen zurück!' : 'Kein aktives Abo gefunden.');
    return res;
  } catch(e) { _dndToast('Wiederherstellung fehlgeschlagen: ' + (e?.message||e)); return null; }
}
async function premManage(){
  const P = _cap('PremiumPlugin');
  if (!P) { _dndToast('Abo verwalten geht nur in der iOS-App.'); return; }
  try { await P.manageSubs(); setTimeout(premRefreshEntitlement, 1500); } catch(_){}
}
async function premRefreshEntitlement(){
  const P = _cap('PremiumPlugin'); if (!P) return;
  try { _premApply(await P.getEntitlement()); await _syncPremiumProfile(); } catch(_){}
}
function premGate(feature){ if (isPremium()) return true; openPaywall(feature); return false; }
// Premium-abhängige UI aktualisieren, sofern gerade sichtbar (Settings-Sektion/Paywall).
function premRefreshUI(){
  try { if (document.getElementById('pg-settings')?.classList.contains('on')) renderPremiumSettings(); } catch(_){}
  try { if (document.getElementById('ov-paywall')?.classList.contains('on')) _pwRender(); } catch(_){}
  // Direkt nach dem Kauf muss Premium ÜBERALL sofort da sein, nicht erst nach
  // einem Tab-Wechsel: Tagesbriefing auf der Startseite, Level-/Founder-Badge
  // und der Kontingent-Kopf im KI-Menü hängen alle an isPremium().
  try { renderCoachTodayCard(); } catch(_){}
  try { _renderLevelBadge(); } catch(_){}
  try { _aiQuotaRenderHead(); } catch(_){}
  try { if (isPremium()) aiQuotaRefresh(); } catch(_){}
}
// StoreKit ist die Quelle der Wahrheit — der lokale Cache in localStorage darf sie
// nicht überleben. Deshalb bei JEDEM Start und bei jeder Rückkehr in den Vordergrund
// das Entitlement frisch ziehen (Verlängerung, Ablauf, Rückerstattung, Kauf auf einem
// anderen Gerät, Neuinstallation) und auf die Push-Meldung des Plugins hören
// (PremiumPlugin.load() sendet 'entitlementChanged' bei Transaction.updates).
let _premWatchTries = 0;
function _premWatchEntitlement(){
  if (!_isNative()) return;
  const P = _cap('PremiumPlugin');
  if (!P) { if (_premWatchTries++ < 12) setTimeout(_premWatchEntitlement, 800); return; }
  try { P.addListener('entitlementChanged', (res) => { _premApply(res); _syncPremiumProfile(); }); } catch(_){}
  premRefreshEntitlement();
  try {
    window.Capacitor?.Plugins?.App?.addListener('appStateChange', (st) => {
      if (st && st.isActive) premRefreshEntitlement();
    });
  } catch(_){}
}

// ── KI-Worker (Chat/Live-Coach/Analyse) ───────────────
// aiCall('chat'|'coach'|'analyze', payload) → POST AI_WORKER_URL/<kind> mit
// idToken (wer bist du) + jws (bist du Premium) + lang. 402 = kein Premium
// (Paywall öffnen), 429 = Monatslimit erreicht (Toast, quota trotzdem übernehmen).
// Zeitgrenze je Aufruf-Art. Ohne sie bleibt eine haengende Verbindung (Funkloch
// im Studio, tote TCP-Verbindung) offen, bis das Betriebssystem sie irgendwann
// kappt — die Coach-Leiste stuende so lange auf "denkt nach", und der Nutzer
// kaeme nur ueber Training verlassen oder Neustart wieder heraus.
// Die Werte sind nach oben grosszuegig: eine langsame, aber funktionierende
// Mobilverbindung darf nicht faelschlich abgebrochen werden. 'coach' ist die
// kuerzeste Runde (kleine Nutzlast, kurze Antwort) und blockiert als einzige
// eine sichtbare Flaeche im Training; 'vision' laedt ein Foto hoch.
const AI_TIMEOUT_MS = { coach: 25000, chat: 45000, analyze: 45000, vision: 60000, default: 45000 };
async function aiCall(kind, payload){
  if (!(window.FB && window.FB.configured && _fbUser)) { _dndToast('Bitte zuerst anmelden.'); return null; }
  let idToken;
  try { idToken = await _fbUser.getIdToken(); }
  catch(_) { _dndToast('Bitte zuerst anmelden.'); return null; }
  // Die Zeitgrenze laeuft ueber den GANZEN Aufruf, nicht nur bis zum Kopf der
  // Antwort: ein Datenstrom, der mitten im Rumpf stehen bleibt, haengt genauso.
  const ctrl = new AbortController();
  let abgelaufen = false;
  const frist = setTimeout(() => { abgelaufen = true; try { ctrl.abort(); } catch(_){} },
                           AI_TIMEOUT_MS[kind] || AI_TIMEOUT_MS.default);
  try {
    // Bewusst OHNE Content-Type-Header: einfacher CORS-Request, kein Preflight
    // (WKWebView meldet sonst "Load failed" trotz erreichbarem Worker, s. Commit e5c1562).
    const res = await fetch(AI_WORKER_URL + '/' + kind, {
      method: 'POST',
      body: JSON.stringify({ idToken, jws: PREM.jws || null, lang: GT_LANG, ...payload }),
      signal: ctrl.signal,
    });
    let j = null; try { j = await res.json(); } catch(_){}
    if (res.status === 402) {
      await premRefreshEntitlement();
      // Simulator: der Worker prüft IMMER serverseitig (Firebase-Login + Kaufnachweis),
      // egal was der lokale gt_premiumDev-Bypass clientseitig freischaltet — sonst
      // könnte jeder KI ohne Abo erschleichen. Ohne Founder-Login (der einzige Account,
      // den der Worker ohne Kaufnachweis durchlässt) 402t der Call also weiterhin.
      // Statt der Kauf-Paywall (im Simulator sinnlos, kein echter Kauf möglich) hier
      // zum Login leiten — das eigentliche Hindernis beim KI-Testen.
      const env = await _getInstallInfo();
      const isFounder = !!(_fbUser && TEST_UIDS.has(_fbUser.uid));
      if (env && env.isSimulator && !isFounder) {
        _dndToast('Simulator: mit deinem Founder-Konto anmelden, um KI-Funktionen zu testen.');
        try { openOv('ov-account'); } catch(_) {}
      } else {
        openPaywall(kind);
      }
      return null;
    }
    if (res.status === 429) {
      if (j && j.quota) { try { localStorage.setItem('gt_aiQuota', JSON.stringify(j.quota)); } catch(_){} _aiQuotaTs = Date.now(); try { _aiQuotaRenderHead(); } catch(_){} }
      _dndToast((j && j.error) || 'Du hast dein monatliches KI-Limit erreicht.');
      return null;
    }
    if (!res.ok) { _dndToast((j && j.error) || 'KI gerade nicht erreichbar.'); return null; }
    if (j && j.quota) { try { localStorage.setItem('gt_aiQuota', JSON.stringify(j.quota)); } catch(_){} _aiQuotaTs = Date.now(); try { _aiQuotaRenderHead(); } catch(_){} }
    return j;
  } catch(e) {
    // Klartext statt Sammelmeldung: „Load failed" (WKWebView-Netzfehler) sieht
    // sonst genauso aus wie ein echter Ausfall des Workers.
    console.warn('[GymTrack] KI-Call fehlgeschlagen:', kind, e);
    // Abgelaufene Frist und Netzfehler sind zwei verschiedene Auskuenfte: nach
    // einer Zeitueberschreitung hilft ein zweiter Versuch, bei einem Netzfehler
    // muss der Nutzer erst wieder Empfang haben. Zweisprachig direkt hier — der
    // Woerterbuch-Weg (I18N_EN) erreicht nur unveraenderte Textknoten.
    _dndToast(abgelaufen
      ? _cm('Der Coach antwortet gerade nicht. Versuch es gleich noch einmal.',
            'The coach is not responding right now. Please try again in a moment.')
      : 'KI nicht erreichbar (' + (e?.message || e) + ')');
    return null;
  } finally { clearTimeout(frist); }
}

// ── KI-Coach: LIVE-COACH IM TRAINING (Phase D) ─────────
// Wertet neu eingetragene Sätze im aktiven Training aus (Hook: confirmWheel) und
// zeigt bei auffälligen Mustern (Sprung/Einbruch/Ermüdung/Wdh-Bereich-Ende/Stagnation)
// eine kompakte Vorschlagskarte über der Satzliste der betroffenen Übung (renderLogCards).
// Läuft komplett defensiv — jeder Fehlerpfad bricht NUR den Vorschlag ab, nie das
// aktive Training (try/catch an jeder Einstiegsstelle).
function _coachDefaultState() { return { calls:0, perExercise:{}, seen:[], lastCallTs:0 }; }
function _coachNormalizeState(s) {
  if (!s || typeof s !== 'object') return _coachDefaultState();
  return {
    calls: typeof s.calls === 'number' ? s.calls : 0,
    perExercise: (s.perExercise && typeof s.perExercise === 'object') ? s.perExercise : {},
    seen: Array.isArray(s.seen) ? s.seen : [],
    lastCallTs: typeof s.lastCallTs === 'number' ? s.lastCallTs : 0,
  };
}
// Client-seitiger Vorab-Check des Monats-Limits (spart einen Roundtrip — der Worker
// prüft das Limit ohnehin autoritativ). Defensiv: kaputter/fehlender localStorage-Wert
// → lieber erlauben als fälschlich blockieren.
function _coachQuotaExhausted() {
  try {
    const q = JSON.parse(localStorage.getItem('gt_aiQuota') || 'null');
    if (!q || typeof q.limit !== 'number' || typeof q.used !== 'number') return false;
    return q.used >= q.limit;
  } catch(_) { return false; }
}
// Feste Coach-Leiste: durchgehend sichtbarer Status ("Coach aktiv"/"denkt nach…")
// + zeitweilige Reaktionszeile (Lob/Kurz-Tipp). mode: 'idle' | 'thinking' | 'msg'.
let _coachBarState = { mode: 'idle', msg: '' };
let _coachBarMsgTimer = null;
// Sprachfaehigkeiten stehen HIER und nicht beim uebrigen Stimmen-Code weiter
// unten: die Stimmen-Vorschau in der Einrichtung liest sie, und eine
// let-Deklaration weiter unten waere bis dahin in der temporalen Totzone —
// dieselbe Falle, die im Boot schon einmal isPremium() zerlegt hat.
let _cvCaps = { tts: false, stt: false };
function _coachBarSet(mode, msg, holdMs) {
  _coachBarState.mode = mode || 'idle';
  if (msg !== undefined) _coachBarState.msg = msg || '';
  if (_coachBarMsgTimer) { clearTimeout(_coachBarMsgTimer); _coachBarMsgTimer = null; }
  _coachBarRender();
  if (holdMs) _coachBarMsgTimer = setTimeout(() => {
    _coachBarState = { mode: 'idle', msg: '' }; _coachBarRender();
  }, holdMs);
}
/* Hoehenwechsel der Leiste weich fahren (FLIP).
   Warum ueberhaupt JS: die Leiste hat keine feste Hoehe — sie traegt mal nur den
   Kopf, mal Kopf + ein- bis dreizeilige Nachricht. CSS kann height:auto nicht
   interpolieren, also misst diese Funktion VORHER und NACHHER und laesst die
   Differenz von der CSS-Kurve fahren. Danach wieder height:'' — sonst bliebe die
   Leiste auf einem eingefrorenen Pixelwert stehen und ein spaeterer Zeilenumbruch
   (Drehung, groessere Schrift) wuerde abgeschnitten. */
/* Wechselt den Inhalt der Coach-Leiste. Die Hoehe wird NICHT mehr angefahren:
   eine Hoehen-Blende ist Layout-Arbeit und brach 300 ms lang in jedem Bild die
   darunter liegende Uebungsliste neu um. Die Leiste nimmt ihre neue Hoehe in
   einem Umbruch ein; die sichtbare Bewegung tragen coachMsgIn (Text faehrt ein)
   und coachSweep (Lichtstreifen) — beides Compositor-Arbeit.
   Danach EIN Abgleich von Rastabstand und Fokus-Lage, weil die Karten jetzt
   woanders liegen. */
function _coachBarAnimate(el, apply) {
  apply();
  el.style.height = '';
  if (el._cbEndTimer) clearTimeout(el._cbEndTimer);
  // Ein Bild spaeter: die neue Hoehe steht erst nach dem Layout fest.
  el._cbEndTimer = setTimeout(() => {
    el._cbEndTimer = null;
    try { _wkSyncSnapPad(); _wkFocusDirty = true; _wkFocusSoon(); } catch(_) {}
  }, 0);
}
/* Ist der Vorschlag aufgeklappt? Der Zustand gehoert NICHT an _coachCard: der
   wird bei jeder neuen Karte ersetzt, und ein neuer Vorschlag soll immer
   zugeklappt anfangen — sonst schoebe er beim Erscheinen die Satzliste weg,
   also genau das, was hier abgestellt wird. */
let _coachOfferOpen = false;
/* Welches Karten-Objekt zuletzt gezeichnet wurde — Grundlage fuer "ist der
   Vorschlag neu?" (siehe cb-neu). Bewusst die Objekt-Referenz und keine ID:
   jede neue Karte ist ein neues Objekt, jedes Neuzeichnen dasselbe. */
let _coachOfferShown = null;
/* Auf- und Zuklappen laeuft NUR ueber die Klasse, nie ueber ein Neuzeichnen.
   Das ist der ganze Trick an der Sache: schriebe die Funktion das Markup neu,
   waere der aufgeklappte Teil ein frisches Element — und ein frisches Element
   hat keinen Zustand, von dem aus es sich bewegen koennte. Es stuende sofort
   in seiner Endgroesse da, und genau das sah abgehackt aus. So bleibt das
   Element stehen und faehrt seine Hoehe. */
function _coachOfferToggle() {
  _coachOfferOpen = !_coachOfferOpen;
  haptic(8);
  const el = document.getElementById('wk-coach-bar');
  if (el) el.classList.toggle('open', _coachOfferOpen);
}
/* Die kurze Fassung des Vorschlags. Der Titel des Modells ist bereits knapp
   ("Top-Satz-Chance"); traegt die Aktion einen Wert, steht er dahinter — das
   ist die Zahl, um die es geht, und sie soll man lesen koennen, ohne zu
   tippen. */
function _coachOfferLabel(c) {
  const t = (c.title || c.text || '').trim();
  /* Die Zahl kann an zwei Stellen stehen: an einer Einzel-Aktion ODER an der
     ersten Option. Genau der haeufigste Fall — die lokal erzeugte
     Top-Satz-Chance — nutzt Optionen, und dort fehlte die Zahl in der Zeile.
     Sie ist aber der ganze Punkt der Zeile: ohne sie muss man aufklappen,
     nur um zu erfahren, um welches Gewicht es geht. */
  const a = (c.action && c.action.kind && c.action.kind !== 'none')
    ? c.action
    : ((Array.isArray(c.options) && c.options[0] && c.options[0].action) || {});
  if (a.kind && a.kind !== 'none' && typeof a.value === 'number' && isFinite(a.value))
    return t + ' · ' + kgToDisp(roundToStep(a.value)) + ' ' + unitLabel();
  return t;
}
function _coachBarOfferRender(el) {
  const c = (_coachCard && _coachCard.c) || {};
  const opts = Array.isArray(c.options) ? c.options.filter(o => o && o.label && o.action) : [];
  const hatAktion = !!(c.action && c.action.kind && c.action.kind !== 'none');
  const uebernommen = !!(_coachCard && _coachCard.applied);
  /* Ein NEUER Vorschlag laeuft einmal ein. "Neu" heisst: ein anderes
     Karten-Objekt als beim letzten Zeichnen — ein blosses Neuzeichnen (Satz
     abgehakt, Zeile ergaenzt) ist es nicht, sonst zuckte die Leiste bei jedem
     Haken. Das ist der Moment, in dem sich der Coach meldet, und er soll zu
     sehen sein, ohne dass man ihn suchen muss. */
  const frisch = _coachOfferShown !== _coachCard;
  _coachOfferShown = _coachCard;
  el.style.display = '';
  el.className = 'coach-bar cb-offer' + (_coachOfferOpen ? ' open' : '')
    + (uebernommen ? ' cb-done' : '') + (frisch ? ' cb-neu' : '');
  if (uebernommen) {
    el.innerHTML = `<div class="cb-offer-row"><span class="cb-offer-ok">${ICO.check({s:15})}</span>` +
      `<span class="cb-offer-lbl">${esc(_cm('Übernommen', 'Applied'))}</span>` +
      `<span class="coach-ki-tag">KI</span></div>`;
    return;
  }
  /* Der Haken nimmt an: bei einer Einzel-Aktion sie selbst, bei mehreren Wegen
     den ERSTEN — das Modell setzt seine Empfehlung nach vorn. Wer einen
     anderen Weg will, klappt auf. Gibt es gar keine Aktion (reines Lob),
     bleibt nur das Wegtippen. */
  const jaKnopf = (hatAktion || opts.length)
    ? `<button type="button" class="cb-offer-btn ja" aria-label="${esc(_cm('Annehmen','Accept'))}"
         onclick="event.stopPropagation();${opts.length ? '_coachPickOption(0)' : '_coachAccept()'}">${ICO.check({s:16})}</button>`
    : '';
  /* Der aufklappbare Teil steht IMMER im Markup, auch zugeklappt — er ist dann
     auf Hoehe null gefahren (siehe .cb-offer-more). Nur so hat er beim
     Aufklappen einen Zustand, aus dem heraus er wachsen kann; erst beim Tippen
     erzeugt, spraenge er in seiner vollen Groesse ins Bild. */
  /* Zu welcher Uebung der Vorschlag gehoert. In der Karte war das
     selbstverstaendlich — sie stand ja darin. In der Leiste ist es das nicht
     mehr, und wer inzwischen eine Uebung weiter ist, muesste sonst raten. */
  let fuer = '';
  try {
    const exC = _coachCard && exById(_coachCard.exId);
    if (exC && exC.name && wkLogs.length > 1) fuer = `<div class="cb-offer-for">${esc(exC.name)}</div>`;
  } catch(_) {}
  const mehr = (c.text || opts.length > 1 || fuer)
    ? `<div class="cb-offer-more">
         ${fuer}
         ${c.text ? `<div class="cb-offer-txt">${esc(c.text)}</div>` : ''}
         ${opts.length > 1 ? `<div class="cb-offer-opts">${opts.map((o,i) =>
             `<button type="button" class="cb-offer-opt" onclick="event.stopPropagation();_coachPickOption(${i})">${esc(o.label)}</button>`
           ).join('')}</div>` : ''}
       </div>`
    : '';
  el.innerHTML = `<div class="cb-offer-row" onclick="_coachOfferToggle()">
      <span class="coach-bar-eq"><i></i><i></i><i></i></span>
      <span class="cb-offer-lbl">${esc(_coachOfferLabel(c))}</span>
      <span class="coach-ki-tag">KI</span>
      ${jaKnopf}
      <button type="button" class="cb-offer-btn nein" aria-label="${esc(_cm('Ignorieren','Dismiss'))}"
        onclick="event.stopPropagation();_coachDismiss()">✕</button>
    </div>${mehr}`;
}

function _coachBarRender() {
  const el = document.getElementById('wk-coach-bar'); if (!el) return;
  const on = isPremium() && _coachLevel() !== 'off';
  if (!on) {
    // Nicht mehr display:none — sonst gibt es nichts zu animieren. Erst
    // einklappen, danach aus dem Fluss nehmen.
    if (el.style.display === 'none') return;
    _coachBarAnimate(el, () => { el.className = 'coach-bar is-off'; el.innerHTML = ''; });
    setTimeout(() => { if (el.classList.contains('is-off')) el.style.display = 'none'; }, 340);
    return;
  }
  const thinking = _coachBarState.mode === 'thinking';
  const msg = _coachBarState.msg || '';
  // Die Leiste nennt den Coach beim Namen. Heisst er noch 'Coach', greifen weiter
  // die Woerterbuch-Eintraege (EN: 'Coach live') statt einer zweiten Formulierung.
  const nm = _coachName(), nmE = esc(nm);
  const lbl = (nm === 'Coach')
    ? (thinking ? tr('Coach denkt nach…') : tr('Coach aktiv'))
    : (thinking ? _cm(nmE + ' denkt nach…', nmE + ' is thinking…') : _cm(nmE + ' aktiv', nmE + ' active'));
  // KEIN Bedienelement in der Leiste: Fragen an den Coach laufen ueber den
  // KI-Chat (Knopf unten rechts), nicht ueber ein zweites Mikrofon im Training.
  // Auch keine Satz-Rueckfrage mehr: die Einschaetzung leitet _rpeDerive() aus
  // Soll und Ist ab, statt sie nach jedem Satz zu erfragen.
  /* Ein offener Vorschlag uebernimmt die Leiste, statt eine zweite Flaeche
     aufzumachen. Vorher war das eine eigene Karte — erst mitten im Satz-Log,
     dann als Kasten am unteren Rand — und beide Male nahm sie Sicht weg, die
     im Training niemand uebrig hat. Die Leiste ist ohnehin da und ohnehin
     sichtbar; der Vorschlag kostet damit KEINEN zusaetzlichen Platz.
     Zugeklappt ist er eine Zeile: worum es geht, dazu Annehmen und Verwerfen.
     Erst ein Tipp auf die Zeile zeigt die Begruendung und, falls es mehrere
     Wege gibt, die Auswahl. Wer weiterloggen will, ignoriert ihn einfach. */
  const angebot = !!_coachCard;
  if (angebot) { _coachBarOfferRender(el); return; }
  _coachOfferOpen = false;
  _coachBarAnimate(el, () => {
    el.style.display = '';
    el.className = 'coach-bar' + (thinking ? ' thinking' : '');
    // Rueckgaengig: das EINZIGE Bedienelement der Leiste, und nur solange die
    // Aenderung frisch ist. Es steht hier und nicht in einem Dialog, weil es
    // zur Aenderung gehoert, die eine Zeile darueber angesagt wurde.
    const undo = _coachUndoFrisch()
      ? `<button type="button" class="cb-undo" onclick="_coachUndoDo()">${esc(_cm('Rückgängig', 'Undo'))}</button>`
      : '';
    el.innerHTML = `<div class="coach-bar-head"><span class="coach-bar-eq"><i></i><i></i><i></i></span>` +
      `<span class="coach-bar-lbl">${lbl}</span><span class="coach-ki-tag">KI</span>${undo}</div>` +
      (msg ? `<div class="coach-bar-msg">${esc(msg)}</div>` : '');
  });
  // Lichtstreifen nur bei einer NEUEN Nachricht — sonst würde jeder Re-Render
  // (z.B. Satz-Liste neu gebaut) die Animation erneut auslösen und flackern.
  if (msg && msg !== _coachBarRender._last) {
    el.classList.remove('flash');
    void el.offsetWidth;            // Reflow: Keyframe von vorn starten
    el.classList.add('flash');
  }
  _coachBarRender._last = msg;
}
function _coachClearCard() {
  if (_coachCard && _coachCard.timer) clearTimeout(_coachCard.timer);
  _coachCard = null;
}

// Debounce (~1.2s je Satz, Key = "li_si") — wird vom Abhaken des Satzes (toggleSetDone)
// aufgerufen, NICHT vom Gewicht/Wdh-Commit (confirmWheel): erst wenn der Satz wirklich
// erledigt ist, darf die Vorschlagskarte kommen. Schnelles Ab-/Wiederanhaken desselben
// Satzes löst dank gleichem Key nur EINE Auswertung nach der letzten Änderung aus.
function _coachEval(li, si) {
  const key = li + '_' + si;
  if (_coachEvalTimers[key]) clearTimeout(_coachEvalTimers[key]);
  _coachEvalTimers[key] = setTimeout(() => {
    delete _coachEvalTimers[key];
    try { _coachEvalRun(li, si); } catch(e) { console.warn('[Coach] eval:', e); }
  }, 1200);
}

// Alle bisher geloggten Arbeitssätze (kein Aufwärmen) dieser Übung im laufenden
// Training am/über dem oberen Ende des Ziel-Wdh-Bereichs?
function _coachAllSetsAtRepMax(log, ex) {
  // _loggedWorkSets statt _workSets: die geplanten Saetze tragen bereits die
  // vorgeschlagenen Wiederholungen, und die liegen nach einer Steigerung genau
  // am oberen Bereichsende. Ohne done-Pruefung meldete die Regel deshalb schon
  // beim ERSTEN Satz "alle Saetze am oberen Wdh-Ende".
  const mainSets = _loggedWorkSets(log.sets || []);
  if (!mainSets.length) return false;
  const { max } = repRange(ex);
  return mainSets.every(s => s.type === 'fail' || parseInt(s.r) >= max);
}
// Schwerster Arbeitssatz (kein Aufwärmen) einer Satz-Liste.
function _coachTopSet(sets) {
  const work = (sets || []).filter(s => (s.type || 'normal') !== 'warmup' && s.w && s.r);
  if (!work.length) return null;
  return work.slice().sort((a,b) => (parseFloat(b.w)||0) - (parseFloat(a.w)||0))[0];
}
// Top-Satz (Gewicht × Wdh) über die letzten 2 Einheiten (1 vergangene + die aktuelle)
// identisch → Stagnation.
function _coachIsStalled(exId, log) {
  const hist = exHistory(exId);
  if (hist.length < 1) return false;
  // Nur gehobene Saetze: sonst waere der "aktuelle Top-Satz" der geplante
  // schwerste Satz, und Stagnation stuende fest, bevor er gelaufen ist.
  const curTop = _coachTopSet(_loggedWorkSets(log.sets));
  if (!curTop) return false;
  const curW = parseFloat(curTop.w) || 0, curR = parseInt(curTop.r) || 0;
  if (!curW || !curR) return false;
  return hist.slice(-1).every(h => {
    const top = _coachTopSet(h.sets);
    return !!top && (parseFloat(top.w)||0) === curW && (parseInt(top.r)||0) === curR;
  });
}
// Grobe %-Volumenänderung dieser Übung ggü. der letzten Einheit (best effort, optional).
function _coachVolDelta(exId, li) {
  try {
    const hist = exHistory(exId);
    if (!hist.length) return null;
    // BEIDE Seiten gleich gefiltert. Vorher stand links das volle Satz-Array der
    // letzten Einheit (Aufwaermsaetze eingerechnet) und rechts nur die
    // Arbeitssaetze — die gemeldete Prozentzahl war damit systematisch zu
    // negativ, bei zwei Aufwaermsaetzen um gut 15 Prozentpunkte.
    const lastVol = setsVolume(_coachRefSets(exId));
    if (!(lastVol > 0)) return null;
    const curVol = setsVolume(_loggedWorkSets((wkLogs[li] && wkLogs[li].sets) || []));
    if (!(curVol > 0)) return null;
    return Math.round(((curVol - lastVol) / lastVol) * 100);
  } catch(_) { return null; }
}

// ── Lokale Mikro-Reaktion: bei JEDEM geloggten Satz, KEIN aiCall (kein Token/
// Quota-Verbrauch) — läuft komplett unabhängig von den KI-Trigger-Calls unten
// (_coachEvalRun), damit sich die Leiste "durchgehend dabei" anfühlt, ohne dass
// Kosten getrieben werden. Nie zweimal dieselbe Phrase hintereinander.
let _coachMicroLast = null;
function _coachMicroPick(arr) {
  let m; do { m = arr[Math.floor(Math.random() * arr.length)]; } while (arr.length > 1 && m === _coachMicroLast);
  _coachMicroLast = m; return m;
}
// Kurzform für zweisprachige Coach-Phrasen. Die Leiste wird per innerHTML neu
// gebaut und enthält Zahlen — der Wörterbuch-Weg (I18N_EN) trifft solche Sätze
// nicht, deshalb hier direkt beide Sprachen.
function _cm(de, en) { return GT_LANG === 'en' ? en : de; }

function _coachMicroReact(li, si) {
  if (!isPremium() || _coachLevel() === 'off') return;
  // "Rückmeldung nach dem Satz — Kurzer Kommentar, sobald ein Satz steht": genau
  // dieser Kommentar ist gemeint, hier sitzt der Verbraucher des Schalters.
  // _coachEvalRun() bleibt bewusst außen vor — das ist die Vorschlagskarte des
  // Live-Coaches, die "Live-Coach im Training" (inTraining) steuert. Wäre sie
  // mitgefangen, schaltete ein Schalter zwei Dinge ab und der andere wäre halb
  // wirkungslos.
  try { if (_persona().setFeedback === false) return; } catch(_) {}
  const log = wkLogs[li]; if (!log) return;
  const set = log.sets && log.sets[si]; if (!set) return;
  const ex = exById(log.exerciseId); if (!ex || ex.targetType === 'time') return;
  const w = parseFloat(set.w), r = parseInt(set.r);

  // Aufwärmsätze wurden bisher komplett übersprungen — genau dort fiel auf, dass
  // der Coach "nicht immer da" ist. Sie bekommen jetzt eine eigene Reaktion, die
  // das Aufwärmgewicht ins Verhältnis zum Arbeitsgewicht setzt.
  if ((set.type || 'normal') === 'warmup') {
    if (!(w > 0) && !(r > 0)) return;
    let wm = null;
    try {
      const target = getSuggestedWeight(ex);
      if (target > 0 && w > 0) {
        const pct = Math.round(w / target * 100);
        wm = pct < 95
          ? _coachMicroPick([
              _cm('Aufwärmsatz bei ' + pct + ' % vom Arbeitsgewicht — gut dosiert.',
                  'Warm-up at ' + pct + '% of your working weight — well judged.'),
              _cm(pct + ' % vom Arbeitsgewicht. Locker bleiben, Kraft sparen.',
                  pct + '% of working weight. Stay loose, save your strength.')])
          : _coachMicroPick([
              _cm('Das ist fast schon Arbeitsgewicht — nächster Satz zählt richtig.',
                  'That is nearly your working weight — the next set counts.'),
              _cm('Warm genug. Ab jetzt Arbeitssätze.', 'Warm enough. Working sets from here.')]);
      }
    } catch(_) {}
    if (!wm) wm = _coachMicroPick([
      _cm('Aufwärmsatz notiert — Technik sitzt schon.', 'Warm-up logged — your form is already there.'),
      _cm('Aufgewärmt. Jetzt sauber ins Arbeitsgewicht.', 'Warmed up. Now step into your working weight.')]);
    try { _coachBarSet('msg', wm, 4000); } catch(_) {}
    return;
  }

  if (!(w > 0) || !(r > 0)) return; // Arbeitssatz: erst wenn BEIDES eingetragen ist

  let msg = null;
  try {
    const hist = exHistory(log.exerciseId);
    if (hist.length) {
      // Arbeitssatz gegen Arbeitssatz. Vorher wurde der Satz-Index direkt in die
      // letzte Einheit gehalten: bei zwei Aufwaermsaetzen landete der Vergleich
      // auf einem AUFWAERMSATZ und meldete "+40 % ueber letzter Einheit".
      // Verglichen wird gegen den Median der letzten drei Einheiten, nicht
      // gegen die letzte allein (s. _coachRefSets).
      const base = _lastWorkBase(_coachRefSets(log.exerciseId), _workPosOf(log.sets, si));
      if (base && parseFloat(base.w) > 0 && parseInt(base.r) > 0) {
        const lastE1RM = epley1RM(parseFloat(base.w), parseInt(base.r));
        const curE1RM  = epley1RM(w, r);
        if (lastE1RM > 0 && curE1RM > 0) {
          const diff = (curE1RM - lastE1RM) / lastE1RM;
          const pct = Math.abs(Math.round(diff * 100));
          // Zahlen im Satz: der Woerterbuch-Weg (I18N_EN) trifft solche Texte nicht,
          // deshalb beide Sprachen direkt hier — wie bei den uebrigen Coach-Phrasen.
          if (diff >= 0.05) msg = _coachMicroPick([
            _cm('Stark: +' + pct + ' % über letzter Einheit.', 'Strong: +' + pct + '% over your last session.'),
            _cm('+' + pct + ' % geschätzte Maximalkraft — sauber drauf gelegt.', '+' + pct + '% estimated max strength — cleanly added.'),
            _cm('Klare Verbesserung: +' + pct + ' % zum letzten Mal.', 'Clear improvement: +' + pct + '% vs. last time.')]);
          else if (diff >= 0.02) msg = _coachMicroPick([
            _cm('Leicht gesteigert (+' + pct + ' %) — genau so entsteht Progression.', 'Slight increase (+' + pct + '%) — that is how progression is built.'),
            _cm('+' + pct + ' % — kleiner Schritt, richtige Richtung.', '+' + pct + '% — small step, right direction.')]);
          else if (diff <= -0.08) msg = _coachMicroPick([
            _cm('−' + pct + ' % heute — Erholung zählt auch. Ruhig angehen.', '−' + pct + '% today — recovery counts too. Take it easy.'),
            _cm('Heute etwas leichter (−' + pct + ' %) — passt, hör auf deinen Körper.', 'A bit lighter today (−' + pct + '%) — fine, listen to your body.')]);
        }
      }
    }
    // Wdh-Bereich am oberen Ende → nächste Progressionsstufe direkt ankündigen
    if (!msg && (set.type || 'normal') !== 'warmup') {
      const { max } = repRange(ex);
      if (max && r >= max) msg = _coachMicroPick([
        _cm('Oberes Wdh-Ende erreicht — nächstes Mal ist mehr Gewicht drin.', 'Top of the rep range — more weight is due next time.'),
        _cm('Bereichs-Maximum geschafft. Progression steht an.', 'Range maximum hit. Progression is up next.')]);
    }
  } catch(_) {}
  if (!msg) {
    // Früher schwieg der Coach hier ab dem zweiten Satz — dadurch wirkte er
    // abwesend. Jetzt kommt IMMER eine Rückmeldung, aber mit echtem Bezug
    // (welcher Satz von wie vielen, was als Nächstes ansteht) statt eines
    // beliebigen "Sauber." bei jedem Antippen.
    const all  = log.sets || [];
    let work = 0, doneWork = 0;
    all.forEach((s, i) => {
      if ((s.type || 'normal') === 'warmup') return;
      work++;
      // done statt "hat Werte": die geplanten Saetze sind vorausgefuellt, damit
      // zaehlte frueher jeder offene Satz als erledigt.
      if (s.done || i === si) doneWork++;
    });
    const leftWork = Math.max(0, work - doneWork);
    if ((set.type || 'normal') === 'fail') {
      msg = _coachMicroPick([
        _cm('Bis zum Versagen — den Reiz hast du gesetzt.', 'To failure — the stimulus is set.'),
        _cm('Alles rausgeholt. Jetzt vollständig pausieren.', 'Everything out. Now rest properly.')]);
    } else if (leftWork === 0) {
      const vd = _coachVolDelta(log.exerciseId, li);
      msg = (vd != null && Math.abs(vd) >= 5)
        // _coachBarRender escaped die Nachricht bereits — hier KEIN esc().
        ? _cm(ex.name + ' fertig — Volumen ' + (vd > 0 ? '+' : '') + vd + ' % zur letzten Einheit.',
              ex.name + ' done — volume ' + (vd > 0 ? '+' : '') + vd + '% vs. last session.')
        : _coachMicroPick([
            _cm('Übung abgeschlossen. Sauber durchgezogen.', 'Exercise complete. Solid work.'),
            _cm('Letzter Satz steht — weiter zur nächsten Übung.', 'Last set is in — on to the next exercise.')]);
    } else {
      msg = _coachMicroPick([
        _cm('Satz ' + doneWork + ' von ' + work + ' — noch ' + leftWork + '.',
            'Set ' + doneWork + ' of ' + work + ' — ' + leftWork + ' to go.'),
        _cm('Notiert. Noch ' + leftWork + ' ' + (leftWork === 1 ? 'Satz' : 'Sätze') + ' auf dem Plan.',
            'Logged. ' + leftWork + ' set' + (leftWork === 1 ? '' : 's') + ' left on the plan.'),
        _cm(kgToDisp(w) + ' ' + unitLabel() + ' × ' + r + ' gebucht. Gleiches Tempo halten.',
            kgToDisp(w) + ' ' + unitLabel() + ' × ' + r + ' logged. Keep that pace.')]);
    }
  }
  try { _coachBarSet('msg', msg, 4000); } catch(_) {}
}

/* ══ ERZAEHLBOGEN IM TRAINING (Task 17, Block 3) ══════════════════════════
   Verdrahtung der fuenf reinen Module (CoachSession/Warmup/Cues/Rpe/Analyze)
   an das laufende Training. Regeln, die hier strukturell verankert sind:

   1. GENAU EINE FLAECHE: #wk-coach-bar. Es entsteht keine neue, nichts Modales,
      kein Dialog mit Bestaetigungszwang. Ausgabe laeuft ausschliesslich ueber
      _coachBarSet() in _csEmit().
   2. HOECHSTENS EINE AEUSSERUNG gleichzeitig, eine neue verdraengt die vorige,
      jede verschwindet nach ihrer Haltezeit von selbst (debrief 14 s, sonst 9 s).
      Faellt an einem Moment mehr als eine Aeusserung an (Trainingsstart, Uebung
      geoeffnet), reiht _csSeq() sie auf dem ZEITSTRAHL statt im Bild.
   3. DIE OBERGRENZE (off 0, key 4, full 8) gilt fuer jede UNGEFRAGTE
      Aeusserung, weil jede davon durch CoachSession.emit() laeuft — auch die
      der Nachbarmodule (Aufwaermschema, Technikpunkt, Plateau, Zeitbudget).
      NICHT dagegen zaehlen die Aeusserungen, die eine ANPASSUNG begleiten
      (Gewicht der offenen Saetze, Satz raus/dazu, Wdh-Bereich). Sie sind keine
      Beobachtung, sondern die Ansage einer Aenderung, die der Nutzer sonst
      stillschweigend im Satz-Log vorfaende — schweigen waere hier der
      schlechtere Fehler. Ihre Haeufigkeit begrenzt die Sache selbst: eine
      Anpassung geschieht je Uebung hoechstens einmal.
   4. S.coachSession lebt REIN LOKAL: das Feld steht nicht im Whitelist-payload
      von _pushToCloud(), also gibt es keinen zweiten Firestore-Schreibpfad und
      firestore.rules bleibt unberuehrt. Geschrieben wird mit persist() —
      die Kurzform ohne persist- Praefix existiert in dieser Datei NICHT und
      wuerde im try/catch STILL fehlschlagen; der Coach faenge dann nach jedem Rendern von vorn an zu
      zaehlen und riss die Obergrenze.
   5. Jeder Einstiegspunkt in try/catch: ein Fehler im Coach darf niemals das
      laufende Training abbrechen.
   6. Kein Netzaufruf. Die ganze Tiefe ist algorithmisch — der Bogen laeuft im
      Keller-Gym ohne Empfang genauso.                                        */

const CS_HOLD_MS      = 9000;    // Haltezeit einer Aeusserung
const CS_HOLD_END_MS  = 14000;   // Abschluss darf laenger stehen
// Abstand zweier Aeusserungen desselben Moments. Er ist die Haltezeit und
// nicht die Haelfte davon: bei 4500 verdraengte die zweite Zeile die erste
// nach der halben Lesezeit, und die Zusicherung "jede verschwindet nach ihrer
// Haltezeit" galt nur fuer die letzte einer Reihe.
const CS_GAP_MS       = CS_HOLD_MS;
const CS_LEAD_MS      = 1000;    // Vorlauf am Trainingsstart (die Check-in-Zeile
                                 // aus startActive() steht bei 400 ms noch)
// Schreibtakt fuer den Zustand: Zaehlerstaende (spoken/acks/said/ended) gehen
// SOFORT auf die Platte, alles andere hoechstens alle CS_SAVE_MS. Ohne das
// serialisierte _csPut() bei jedem Satz, jeder Pause und jeder Minute das
// komplette S — bei voller Historie der teuerste Schreibvorgang der App im
// Minutentakt, und zwar fuer Felder (rests, reps, lastTick), deren Verlust
// hoechstens eine Ermuedungserkennung kostet.
const CS_SAVE_MS      = 20000;
// Obergrenze fuer eine gemessene Satzpause. Darueber ist es keine Pause,
// sondern eine Unterbrechung (Telefonat, Geraet besetzt, App weggelegt) — und
// ein einziger solcher Ausreisser macht den Wochenschnitt wertlos.
const CS_REST_MAX_S   = 600;

let _csLastExId = null;          // Entprellung fuer exOpen (das Modul entprellt nicht)
let _csSeenEx   = null;          // je Einheit bereits angesagte Uebungen (Set)
let _csSeenSets = null;          // je Einheit bereits gezaehlte Saetze (Set)
let _csSeqAt    = 0;             // naechster freier Sprechmoment (ms)
let _csRestPlan = 0;             // geplante Laenge der laufenden Satzpause (s)
let _csSaveTs   = 0;             // letzter tatsaechliche Schreibvorgang (ms)
let _csSaveTmr  = null;          // nachlaufender Schreibvorgang
let _csFinalLine = '';           // Bilanz fuer den Bildschirm NACH dem Training
let _csLastSetTs = 0;            // Zeitpunkt des zuletzt abgehakten Arbeitssatzes

function _csOn() {
  try { return isPremium() && _coachLevel() !== 'off'; } catch(_) { return false; }
}

// Zustand holen/schreiben. _csGet gibt null bei fremdem wkTs: ein Zustand aus
// einer anderen Einheit erzaehlte nach einem App-Neustart falsche Zahlen.
function _csGet(wkTs) {
  try {
    let s = S.coachSession;
    if (!s || window.CoachSession.isStale(s, wkTs)) return null;
    // Der Speicher wird nicht geglaubt. Kommt ein Zustand zurueck, dessen
    // Zaehler kein Zahlwert ist (aelterer Stand, halber Schreibvorgang, von
    // Hand veraenderte Ablage), ergab (s.spoken || 0) VOLLES Budget nach dem
    // Neuladen — die teuerste Zahl des Vorhabens aus Versehen zurueckgesetzt.
    // Die Reparaturschicht dafuer liegt im Modul; hier steht nur der Griff
    // danach, und zwar an der einzigen Stelle, die jeder Pfad passiert.
    if (typeof s.spoken !== 'number' || !s.said || typeof s.said !== 'object') {
      const rep = window.CoachSession.sessionResume(s, wkTs);
      if (!rep) return null;
      S.coachSession = s = rep;      // ohne persist(): der naechste _csPut schreibt ohnehin
    }
    // Nach sessionEnd() KEIN Modulaufruf mehr: 'ended' wird im Modul heute nicht
    // geprueft, onExerciseOpen() wuerde danach weiterreden (Training beenden und
    // zum Korrigieren erneut oeffnen ist der reale Ausloeser). Der Riegel steht
    // hier, statt sich auf einen kuenftigen im Modul zu verlassen.
    if (s.ended) return null;
    return s;
  } catch(_) { return null; }
}
/* Zustand setzen. Der Wert steht IMMER sofort im Speicherobjekt — nur der
   Schreibvorgang auf die Platte ist getaktet. Sofort geschrieben wird, sobald
   sich eine Zahl aendert, an der die Obergrenze haengt (spoken, acks, said,
   ended): genau die muss einen Neustart mitten im Training ueberleben, sonst
   faengt der Deckel von vorn an zu zaehlen. Alles andere (rests, reps,
   setCount, lastTick) laeuft ueber den Nachlauf und kostet im schlechtesten
   Fall eine Ermuedungserkennung. */
function _csPut(sess) {
  try {
    const alt = S.coachSession || {};
    const neu = sess || null;
    S.coachSession = neu;
    const zaehlerNeu = !neu || (alt.spoken !== neu.spoken) || (alt.acks !== neu.acks) ||
                       (alt.ended !== neu.ended) ||
                       (Object.keys(alt.said || {}).length !== Object.keys(neu.said || {}).length);
    if (zaehlerNeu || (Date.now() - _csSaveTs) >= CS_SAVE_MS) { _csFlush(); return true; }
    if (!_csSaveTmr) _csSaveTmr = setTimeout(() => { _csSaveTmr = null; try { _csFlush(); } catch(_) {} },
                                             CS_SAVE_MS);
    return true;
  } catch(e) { console.warn('[Coach] Sessionzustand:', e); return false; }
}
function _csFlush() {
  if (_csSaveTmr) { clearTimeout(_csSaveTmr); _csSaveTmr = null; }
  _csSaveTs = Date.now();
  try { persist(); }   // persist() - die Kurzform ohne Praefix gibt es hier nicht
  catch(e) { console.warn('[Coach] Sessionzustand schreiben:', e); }
}

/* Der EINZIGE Weg von einem Modul-out auf den Bildschirm. Die Module geben
   {kind, key, vars} zurueck, nie fertigen Text — formuliert wird hier ueber
   _say() (CoachPersona + Persona + Sprache).
   extra: Zahlenreihe/Sachtext, den kein Katalogsatz tragen kann (Aufwaermsaetze).
   nurExtra: der Sachtext IST der Satz (Technikpunkt aus CoachCues, der laut
   Modulkommentar bewusst nicht durch say() laeuft).                          */
/* Die EINHEIT haengt am WERT, nicht am Katalogsatz. Der Katalog ist seit der
   Blockabschluss-Review einheitenrein ('{kg}' statt '{kg} kg'), weil er sonst
   fuer lbs-Nutzer luegt: gemessen wurde 'zuletzt 100 kg' in der Coach-Leiste,
   waehrend die Satzliste daneben 220 lbs zeigte — der Nutzer legt 100 lbs auf.
   Die Module rechnen weiter rein in kg; umgerechnet und beschriftet wird
   GENAU HIER, an der einzigen Stelle, an der Modulausgabe auf den Katalog
   trifft. null bei Unsinn: CoachPersona.fill() entfernt einen Platzhalter ohne
   Wert samt Leerzeichen, und ohne festes 'kg' bleibt dabei auch keine Einheit
   ohne Zahl stehen. */
function _csWeight(kg) {
  try {
    const n = parseFloat(kg);
    if (!isFinite(n)) return null;
    const loc = _lang() === 'en' ? 'en-US' : 'de-DE';
    return Number(kgToDisp(n)).toLocaleString(loc, { maximumFractionDigits: 1 }) + ' ' + unitLabel();
  } catch(_) { return null; }
}
// Nur 'kg' und 'vol' sind Gewichte. 'pct', 'mins', 'secs', 'weeks', 'reps',
// 'sets' und 'count' bleiben Zahlen und werden von CoachPersona formatiert.
function _csVars(vars) {
  const v = Object.assign({}, vars || {});
  ['kg', 'vol'].forEach(k => { if (typeof v[k] === 'number') v[k] = _csWeight(v[k]); });
  return v;
}

function _csEmit(out, extra, nurExtra) {
  if (!out) return false;
  let txt = '';
  if (!nurExtra) { try { txt = _say(out.key, _csVars(out.vars)) || ''; } catch(_) { txt = ''; } }
  if (extra) txt = txt ? (txt + ' ' + extra) : String(extra);
  txt = String(txt).trim();
  if (!txt) return false;
  // _coachBarRender() escaped die Nachricht selbst (esc vor innerHTML) —
  // Uebungsnamen sind Nutzertext und kommen als Platzhalter hier durch.
  try { _coachBarSet('msg', txt, out.kind === 'debrief' ? CS_HOLD_END_MS : CS_HOLD_MS); } catch(_) {}
  // Block 2 (Stimme) ist gestrichen: speak() existiert nicht. Nur ueber typeof
  // in try/catch, damit Block 2 spaeter nachgeschoben werden kann, ohne diese
  // Stelle anzufassen.
  try { if (typeof speak === 'function') speak(txt); } catch(_) {}
  // Gibt den TEXT zurueck, nicht true: _csEnd() braucht die Bilanz im Wortlaut
  // fuer den Bildschirm, der nach dem Speichern ohnehin folgt. Ein nicht
  // leerer String ist genauso wahr wie true, alle Aufrufstellen pruefen nur
  // auf Wahrheit.
  return txt;
}

/* Rueckhalt fuer die Schluesselmomente. emit() kennt nur EINEN reservierten
   Platz — den fuer den Abschluss. Die Feinheiten (Technikpunkt, Plateau,
   Rueckblick, Zeitbudget, Vorschau nach langer Pause) fallen aber alle beim
   OEFFNEN einer Uebung an, waehrend Halbzeit und Ermuedung erst spaeter in der
   Einheit kommen. Ohne Rueckhalt war das Budget vorher weg und der Bogen brach
   in der Mitte ab (gemessen: greet, exOpen, warmupIntro, cue, plateau,
   restNext, restNext — mid und fatigue kamen nie). Der Aufwaermsatz aus dieser
   Messung faellt inzwischen weg (kein warmupIntro mehr von selbst); die Zahlen
   bleiben, der Bogen hat dadurch nur mehr Luft.
   Der Rueckhalt sitzt hier, an der Aufrufstelle, und kann den Zaehler nur
   SENKEN — die Obergrenze wird davon nie gerissen, nur besser verteilt. */
const CS_RESERVE      = 2;   // Anker (exOpen, warmupIntro): mid + fatigue bleiben frei
const CS_RESERVE_FINE = 3;   // Feinheiten: zusaetzlich ein spaeterer Anker

/* Der Rueckhalt gilt fuer ZWEI Klassen mit verschiedenen Zahlen — das war der
   Fehler der ersten Fassung. Dort pruefte ihn nur die Feinheit, waehrend
   exOpen und warmupIntro ungebremst durchliefen; nachgerechnet (3 Uebungen x
   4 Saetze, Stufe full) frass die zweite Uebung mit ihren beiden Ankern genau
   die zwei Reserveplaetze, und mid fiel bei Satz 6 wieder am Budget aus. Der
   Rueckhalt verschob also nur, statt zu tragen.

   Jetzt konkurrieren drei Klassen um dieselben acht Plaetze:
     Anker      exOpen, warmupIntro — je Uebung, tragen den Ablauf
     Feinheit   cue, recall, plateau, timeBudget — alle beim OEFFNEN faellig
     Spaet      mid, fatigue, debrief — kommen erst in der zweiten Haelfte
   Die Feinheiten sind zuerst da und wuerden ohne strengeren Rueckhalt das
   ganze Budget der ersten Uebung verbrauchen. Deshalb duerfen sie einen Platz
   weniger nehmen als die Anker.

   Nur auf Stufe 'full': mid und fatigue gibt es auf 'key' gar nicht
   (LEVEL_KINDS), ein Rueckhalt fuer sie waere dort ein Maulkorb fuer die
   Schluesselmomente — bei CAP 4 blieben nach der Begruessung null Plaetze.
   Der Rueckhalt kann den Zaehler immer nur SENKEN; die Obergrenze selbst
   bleibt unberuehrt. */
function _csRoom(sess, reserve) {
  try {
    const cap = window.CoachSession.CAP[sess.level] || 0;
    if (sess.level !== 'full') reserve = 0;
    const belegt = (sess.said && sess.said.debrief) ? 0 : 1;   // Platz des Abschlusses
    return (cap - belegt - (sess.spoken || 0)) > reserve;
  } catch(_) { return false; }
}
function _csHasRoom(sess)     { return _csRoom(sess, CS_RESERVE); }
function _csHasRoomFine(sess) { return _csRoom(sess, CS_RESERVE_FINE); }
/* Fuer Aeusserungen, die INNERHALB eines Modulaufrufs entstehen (restNext aus
   onRest): das Ergebnis ist schon gebucht. Ist kein Platz mehr, wird die
   Buchung zurueckgenommen — eine Aeusserung, die nie auf dem Schirm war, darf
   nicht gegen das Budget zaehlen. Der Zustand (rests, lastRest) bleibt, denn
   die Ermuedungserkennung braucht ihn. */
function _csTake(sess, r) {
  if (!r || !r.out) return r || { sess: sess, out: null };
  if (_csHasRoom(sess)) return r;
  // 'said' MUSS mit zurueck: emit() setzt said[kind] gemeinsam mit spoken.
  // Wurde nur spoken erstattet, galt eine ONCE-Art danach als verbraucht,
  // ohne je auf dem Schirm gewesen zu sein — sie kam dann nie wieder.
  return { sess: Object.assign({}, r.sess, {
             spoken:  sess.spoken || 0,
             said:    Object.assign({}, sess.said || {}),
             current: sess.current || null }),
           out: null };
}

// Verzoegert, aber nur solange dieselbe Einheit laeuft.
function _csLater(ms, fn) {
  const ts = timerTs;
  setTimeout(() => {
    try { if (timerTs === ts && _csGet(ts)) fn(); }
    catch(e) { console.warn('[Coach] verzoegert:', e); }
  }, Math.max(0, ms));
}
// Reiht auf dem Zeitstrahl: hoechstens eine Aeusserung im Bild, jede mindestens
// CS_GAP_MS lesbar, bevor die naechste sie verdraengt. Kein Stapel.
function _csSeq(fn) {
  const now = Date.now();
  const at = Math.max(now, _csSeqAt);
  _csSeqAt = at + CS_GAP_MS;
  _csLater(at - now, fn);
}

/* ── Raster und Stange je UEBUNG ──────────────────────────────────────────
   EINE Bedeutung fuer beide Module: `step` ist die kleinste Scheibe JE SEITE.
   CoachWarmup.roundToPlate() verdoppelt intern (Scheiben liegen paarweise),
   CoachRpe.adjustNext(kg, answer, step, barKg) rechnet genauso. Derselbe
   Geraeteparameter darf nicht in einem Modul "je Seite" und im anderen
   "Gesamtsprung" heissen — sonst entstehen Vorschlaege, die niemand auflegen
   kann (57,5 kg waeren 18,75 kg je Seite).

   Die Blockabschluss-Review hat hier den teuersten Fehler des Blocks gefunden:
   die Ableitung war ehrlich gemeint, aber leer. Gemessen wurde 'Aufwaermen:
   17,5 kg x 5' fuer Bankdruecken — unter einer 20-kg-Stange — und bei 60 kg
   '42 kg x 3' (11 kg je Seite). Zwei Ursachen, beide an dieser Stelle:

   1. barKg haengte allein an ex.showPlateCalc. Diesen Schalter setzt KEIN
      Import: pickExFromLibrary() uebernimmt ihn nicht, die Plan-Vorlagen und
      _planImportEx() legen ihn nicht an, und im Uebungsformular ist er auf
      false vorbelegt. Praktisch jede Uebung kam also als "keine Stange"
      heraus. Sein TRUE bleibt die staerkste Aussage (der Nutzer hat es selbst
      gesagt); sein false ist nur der Vorgabewert und damit KEINE Aussage —
      dann entscheidet der Name ueber CoachCues.equipFor().
   2. step war die kleinste Scheibe des Standardsatzes, und der endet bei
      0,5 kg. Damit senkte 'schwer' 50 kg auf 49,5 kg (zahnlos) und das
      Aufwaermen landete auf Stufen, die vier kleine Scheiben je Seite
      braeuchten. Deshalb ein BODEN: 1,25 kg je Seite in kg, 2,5 lbs in lbs —
      an der Stange also 2,5 kg bzw. 5 lbs Gesamtsprung.

   Der Boden gilt bewusst fuer BEIDES, Aufwaermrunden wie Rueckfrage-Stufe:
   die feine Scheibe brachte auch beim Aufwaermen genau die Zahl hervor, die
   die Review als nicht auflegbar benannt hat (42 kg = 11 kg je Seite). Zwei
   verschiedene Raster fuer dasselbe Geraet waeren zudem der Fehler, den der
   Typkontrakt der Module ausdruecklich ausschliesst.

   Quellen im bestehenden Code:
   - CoachCues.equipFor(name) = 'barbell' | 'dumbbell' | 'machine' | null.
     null heisst 'keine Aussage' und wird hier wie 'machine' behandelt: eine
     erfundene Stange rundet auf Scheibenpaare, die es am Geraet nicht gibt,
     und verbietet zugleich jedes Gewicht unter 20 kg. Das ist der teurere
     Fehler, also faellt der Zweifel gegen die Stange aus.
   - S.plateBar via _pcCurBar() = gewaehltes Stangengewicht. Ohne Wahl liefert
     es bars[0] (20 kg / 45 lbs) — eine Langhantel hat eine Stange, auch wenn
     der Nutzer den Scheibenrechner nie geoeffnet hat. Steht dort ausdruecklich
     0 ("ohne"), bleibt es bei 0: das ist eine Wahl und keine Vorgabe.
   - S.availablePlates via _availPlates() = im Studio vorhandene Scheiben.
     Die kleinste davon ist der Ausgangswert fuer step, der Boden hebt sie an.
   - S.unitMode: beide Werte liegen in der ANZEIGE-Einheit (lbs-Stangen 45/35,
     lbs-Scheiben) — deshalb dispToKg() an der Grenze. Die Module rechnen in kg. */
const CS_MIN_PLATE = { kg: 1.25, lbs: 2.5 };   // kleinste Scheibe, die als Sprung noch traegt
const CS_STACK_STEP = { kg: 2.5, lbs: 5 };     // Stufe an Maschine/Kabel/Kurzhantel

// 'barbell' | 'dumbbell' | 'machine'. Nie null: die Verdrahtung muss sich
// entscheiden, und im Zweifel ohne Stange.
function _csEquipKind(ex) {
  try {
    if (ex && ex.showPlateCalc === true) return 'barbell';
    const k = window.CoachCues.equipFor(ex && ex.name);
    return (k === 'barbell' || k === 'dumbbell') ? k : 'machine';
  } catch(_) { return 'machine'; }
}

function _csEquip(ex) {
  let bar = 0, step = 0;
  const einheit = (typeof unitLabel === 'function' && unitLabel() === 'lbs') ? 'lbs' : 'kg';
  const kind = _csEquipKind(ex);
  try {
    if (kind === 'barbell') {
      const b = _pcCurBar();                   // ohne Wahl: 20 kg / 45 lbs
      if (typeof b === 'number' && b > 0) bar = parseFloat(dispToKg(b)) || 0;
    }
  } catch(_) { bar = 0; }
  try {
    if (bar > 0) {
      // An der Stange zaehlt die Scheibe je Seite — aber nie feiner als der Boden.
      const pl = (_availPlates() || []).map(p => parseFloat(p)).filter(p => p > 0);
      const kleinste = pl.length ? Math.min.apply(null, pl) : CS_MIN_PLATE[einheit];
      const disp = Math.max(kleinste, CS_MIN_PLATE[einheit]);
      step = parseFloat(dispToKg(disp)) || 0;
    } else {
      // Kurzhantel, Steckgewicht, Kabelzug: ein Sprung, kein Paar. Die App hat
      // dafuer keine Bestandsangabe — der Scheibenkasten beschreibt die
      // Langhantel, nicht den Stapel. Also eine ehrliche Konstante statt einer
      // Zahl, die aus der falschen Quelle stammt.
      step = parseFloat(dispToKg(CS_STACK_STEP[einheit])) || 0;
    }
  } catch(_) {}
  if (!(step > 0)) { try { step = window.CoachWarmup.DEFAULT_STEP; } catch(_) { step = 2.5; } }
  return { step: step, barKg: bar, kind: kind };
}

/* ── Die fuenf Hilfsfunktionen, die es noch nicht gab ─────────────────────
   Gegen den echten Code gebaut, nicht erfunden. WK als Zustandsobjekt gibt es
   nicht: die laufende Einheit haengt an timerTs (gesetzt in startActive(),
   wiederhergestellt aus gt_active_wk in _restoreActiveWk()) und an wkLogs.
   timerTs ist der stabile wkTs — er ueberlebt den App-Neustart unveraendert,
   genau das braucht isStale().                                               */

// Letzte Einheit desselben Plantags. S.sessions kennt keine Plan-Referenz, also
// ueber die Uebungsmenge: mindestens die Haelfte der heutigen Uebungen kam auch
// damals vor. Weniger waere ein anderer Tag.
function _csLastSame() {
  try {
    const ids = (wkLogs || []).map(l => l && l.exerciseId).filter(Boolean);
    if (!ids.length) return null;
    const list = S.sessions || [];
    for (let i = list.length - 1; i >= 0; i--) {
      const logs = (list[i] && list[i].logs) || [];
      const hits = logs.filter(l => l && ids.indexOf(l.exerciseId) >= 0);
      if (!hits.length || hits.length * 2 < ids.length) continue;
      const leadId = ids.find(id => logs.some(l => l && l.exerciseId === id));
      const lead = logs.find(l => l && l.exerciseId === leadId);
      const top = lead ? _coachTopSet(lead.sets) : null;
      let vol = 0;
      logs.forEach(l => { try { vol += setsVolume(l.sets || []); } catch(_) {} });
      return {
        ex:   (exById(leadId) || {}).name || null,
        kg:   top ? (parseFloat(top.w) || null) : null,
        reps: top ? (parseInt(top.r) || null) : null,
        sets: lead ? (_workSets(lead.sets || []).length || (lead.sets || []).length) : null,
        vol:  Math.round(vol * 10) / 10
      };
    }
  } catch(e) { console.warn('[Coach] letzte gleiche Einheit:', e); }
  return null;
}

// Summe der Zielsaetze des heutigen Tags — steuert die Halbzeit (midAt).
function _csExpectedSets() {
  try {
    const n = (wkLogs || []).reduce((a, l) => {
      const rows = (l && l.sets && l.sets.length) || 0;
      if (rows) return a + rows;
      return a + (parseInt((exById(l && l.exerciseId) || {}).targetSets) || 0);
    }, 0);
    return n > 0 ? n : null;
  } catch(_) { return null; }
}

// Gedrosselte Arten aus dem bestehenden Aktions-Log (js/coach-log.js: fuenf
// Ignorierungen ohne zwischenzeitliche Annahme ⇒ stumm).
function _coachMutedKinds() {
  try { return window.CoachLog.logStats(S.coachLog || []).muted || []; } catch(_) { return []; }
}
// Juengster angenommener Tipp aus demselben Log — die Grundlage fuer den
// Rueckblick (recall), der bisher nie erzaehlt wurde.
function _coachLastAcceptedTip() {
  try {
    const l = S.coachLog || [];
    for (let i = l.length - 1; i >= 0; i--) if (l[i] && l[i].accepted) return l[i];
  } catch(_) {}
  return null;
}

// Trainingstag-Name (Preset, Wochenplan, sonst Heute-Label).
function _csPlanName() {
  try {
    const src = _activePlanSrc;
    if (src && src.type === 'preset' && src.id) { const p = presetById(src.id); if (p) return tr(p.name); }
    if (src && src.type === 'week' && src.dayKey) { const l = _planLabelFor(src.dayKey); if (l) return l; }
    return _getTodayLabel() || null;
  } catch(_) { return null; }
}

// Zuletzt tatsaechlich gehobenes Arbeitsgewicht dieser Uebung (kg).
function _csLastKgFor(exId) {
  try {
    const h = exHistory(exId);
    for (let i = h.length - 1; i >= 0; i--) {
      const top = _coachTopSet(h[i].sets);
      const w = top ? parseFloat(top.w) : 0;
      if (w > 0) return w;
    }
  } catch(_) {}
  return null;
}

/* ── Schnittstelle: Start, Uebung, Satz, Pause, Tick, Ende ───────────────── */

function _csStart() {
  try {
    if (!_csOn() || !timerTs) return;
    _csLastExId = null;
    _csSeenEx = new Set();
    _csSeenSets = new Set();
    _rpeAnswers = [];
    _csFinalLine = '';
    _csLastSetTs = 0;
    _csSaveTs = 0;
    _csSeqAt = Date.now() + CS_LEAD_MS;
    const r = window.CoachSession.onStart(window.CoachSession.sessionNew({
      wkTs: timerTs, level: _coachLevel(), planName: _csPlanName(),
      lastSame: _csLastSame(), muted: _coachMutedKinds(), expectedSets: _csExpectedSets()
    }), { ts: timerTs });
    _csPut(r.sess);
    if (r.out) { const o = r.out; _csSeq(() => _csEmit(o)); }
    _csSyncCurrentEx();   // der Bogen faengt nicht erst bei Satz 1 an
    _csTimeBudget();
  } catch(e) { console.warn('[Coach] Start:', e); }
}

// Nach einem App-Neustart mitten im Training (_restoreActiveWk). Gleicher wkTs ⇒
// der gespeicherte Zustand gilt weiter (die Begruessung war schon). Fremder wkTs
// ⇒ verworfen und neu, aber OHNE Begruessung: die Einheit laeuft bereits.
function _csResume() {
  try {
    if (!_csOn() || !timerTs) return;
    // Ueber sessionResume() und nicht ueber den rohen Zustand: die
    // Reparaturschicht des Moduls (intAtLeast(spoken, saidCount), Typpruefung
    // jedes Feldes) war bis zur Blockabschluss-Review Produktions-Totcode, weil
    // hier nur _csGet() stand. Fehlte 'spoken' im gespeicherten Objekt oder war
    // es kein Zahlwert, ergab (s.spoken || 0) VOLLES Budget nach dem Neuladen,
    // obwohl die Einheit schon geredet hatte.
    let sess = null;
    try { sess = window.CoachSession.sessionResume(S.coachSession, timerTs); } catch(_) { sess = null; }
    if (sess && sess.ended) sess = null;          // beendete Einheit wird nicht fortgesetzt
    _csPut(sess || window.CoachSession.sessionNew({
      wkTs: timerTs, level: _coachLevel(), planName: _csPlanName(),
      lastSame: _csLastSame(), muted: _coachMutedKinds(), expectedSets: _csExpectedSets()
    }));
    _csLastExId = null;
    // Was schon Saetze hat, gilt als angesagt: sonst faengt der Bogen nach
    // jedem Neustart bei jeder Uebung wieder von vorn an.
    _csSeenEx = new Set();
    _csSeenSets = new Set();
    try {
      (wkLogs || []).forEach(l => {
        if (!l) return;
        (l.sets || []).forEach((s, i) => {
          if (!s || !s.done || (s.type || 'normal') === 'warmup') return;
          _csSeenEx.add(String(l.exerciseId));
          _csSeenSets.add(String(l.exerciseId) + '|' + i);   // schon gezaehlt
        });
      });
      if (sess && sess.exId) _csSeenEx.add(String(sess.exId));
    } catch(_) {}
    _csFinalLine = '';
    _csLastSetTs = 0;
    _csSeqAt = Date.now() + CS_LEAD_MS;
    _csSyncCurrentEx();
  } catch(e) { console.warn('[Coach] Wiederaufnahme:', e); }
}

/* Die "geoeffnete" Uebung im Training ist die, an der der Coach dran ist: die
   erste mit offenen Saetzen — dieselbe Definition, die schon die KI-Aura in
   renderLogCards() und snap.active im Chat benutzen. Ein eigener Oeffnen-Zustand
   existiert nicht (alle Karten stehen offen untereinander).                   */
function _csSyncCurrentEx() {
  try {
    if (!_csOn() || !timerTs || !_csGet(timerTs)) return;
    const l = (wkLogs || []).find(x => (x.sets || []).some(s => !s.done)) || (wkLogs || [])[0];
    const ex = l ? exById(l.exerciseId) : null;
    if (ex) _csExercise(ex);
  } catch(_) {}
}

function _csExercise(ex) {
  try {
    if (!_csOn() || !timerTs) return;
    const exId = (ex && ex.id != null) ? String(ex.id) : null;
    if (!exId) return;
    // Entprellung an der AUFRUFSTELLE: dieselbe Uebung erneut geoeffnet gibt
    // keine zweite Ansage. Das Modul entprellt nicht (exOpen gilt je Uebung,
    // steht deshalb bewusst nicht in CoachSession.ONCE).
    if (_csLastExId === exId) return;
    // Der Vergleich mit der ZULETZT geoeffneten Uebung allein reicht nicht:
    // "aktuell" ist die erste Uebung mit offenen Saetzen, und die springt
    // zurueck, sobald der Nutzer zur Korrektur einen Satz einer frueheren
    // Uebung abhakt. Gemessen: Uebung 1 fertig, ein Satz davon abgehakt ->
    // exOpen + warmupIntro + cue ein zweites Mal; zweimal hin und her und der
    // Coach schwieg bis zum Ende der Einheit. Deshalb die Menge der bereits
    // angesagten Uebungen, nicht nur die letzte.
    if (!_csSeenEx) _csSeenEx = new Set();
    if (_csSeenEx.has(exId)) { _csLastExId = exId; return; }
    _csSeenEx.add(exId);
    _csLastExId = exId;
    const sess = _csGet(timerTs); if (!sess) return;
    const lastKg = _csLastKgFor(exId);
    // Der Anker unterliegt dem Rueckhalt wie alles andere: ohne das frassen
    // exOpen und warmupIntro der zweiten Uebung genau die zwei Plaetze, die
    // fuer Halbzeit und Ermuedung reserviert waren.
    const r = _csTake(sess, window.CoachSession.onExerciseOpen(sess, {
      id: exId, name: ex.name, targetSets: ex.targetSets,
      targetReps: ex.targetType === 'time' ? null : ex.targetReps, lastKg: lastKg
    }));
    _csPut(r.sess);
    if (r.out) { const o = r.out; _csSeq(() => _csEmit(o)); }
    // KEIN Aufwaermvorschlag mehr beim Oeffnen einer Uebung: Aufwaermsaetze
    // stehen als Satztyp im Training selbst, die Ansage sagte dieselbe Sache ein
    // zweites Mal und ass dabei einen der wenigen Plaetze des Erzaehlbogens.
    // Gefragt beantwortet der Coach das weiter (Router-Absicht 'warmup',
    // gespeist aus snap.warmupText) — er faengt nur nicht mehr von selbst an.
    _csCue(ex);
    _csRecall(ex);
    _csPlateau(ex);
  } catch(e) { console.warn('[Coach] Uebung geoeffnet:', e); }
}

// Das Aufwaermschema wird NICHT mehr von selbst angesagt (frueher _csWarmup,
// aufgerufen aus _csExercise). CoachWarmup bleibt in Betrieb: es liefert die
// Zahlenreihe fuer snap.warmupText, also fuer die Antwort auf die ausdrueckliche
// Frage "wie soll ich mich aufwaermen?" — Rechnen auf Nachfrage, nicht Reden
// ohne Anlass.
// CoachWarmup.format() schreibt fest "kg" — das Modul ist bewusst einheitenrein.
// Rechnet die App in lbs, wird HIER umgerechnet und beschriftet.
function _csWarmupText(sets) {
  try {
    if (!sets || !sets.length) return '';
    if (unitLabel() === 'kg') return window.CoachWarmup.format(sets, _lang());
    const loc = _lang() === 'en' ? 'en-US' : 'de-DE';
    return sets.map(s => Number(kgToDisp(s.kg)).toLocaleString(loc, { maximumFractionDigits: 1 })
      + ' ' + unitLabel() + (s.reps > 0 ? ' × ' + s.reps : '')).join(', ');
  } catch(_) { return ''; }
}

// Technikpunkt. Ohne Eintrag kommt null — dann sagt der Coach nichts, statt
// einen Allgemeinplatz zu liefern (Entscheidung von js/coach-cues.js).
function _csCue(ex) {
  try {
    const cue = window.CoachCues.cueFor(ex && ex.name, _lang());
    if (!cue) return;
    _csSeq(() => {
      const sess = _csGet(timerTs); if (!sess) return;
      if (!_csHasRoomFine(sess)) return;          // strengerer Rueckhalt: Feinheiten sind zuerst da
      const r = window.CoachSession.emit(sess, 'cue', 'cue', { ex: ex.name });
      _csPut(r.sess);
      // Der Punkt IST der Satz: CoachCues liefert ihn fertig in beiden Sprachen
      // und laeuft laut Modulkommentar bewusst nicht durch say(). Der Katalogsatz
      // 'cue' waere hier ein zweiter, allgemeiner Technikhinweis daneben.
      if (r.out) _csEmit(r.out, cue, true);
    });
  } catch(e) { console.warn('[Coach] Technikpunkt:', e); }
}

// Rueckblick auf einen eigenen Tipp — aus dem BESTEHENDEN Aktions-Log, das
// bisher nie erzaehlt wurde. Nur Tipps aus einer frueheren Einheit.
function _csRecall(ex) {
  try {
    const tip = _coachLastAcceptedTip();
    if (!tip || !tip.exId || String(tip.exId) !== String(ex.id)) return;
    if (!((tip.ts || 0) < (timerTs || 0))) return;
    _csSeq(() => {
      const sess = _csGet(timerTs); if (!sess) return;
      if (!_csHasRoomFine(sess)) return;          // strengerer Rueckhalt: Feinheiten sind zuerst da
      const r = window.CoachSession.emit(sess, 'recall', 'recall', { ex: ex.name });
      _csPut(r.sess); if (r.out) _csEmit(r.out);
    });
  } catch(e) { console.warn('[Coach] Rueckblick:', e); }
}

function _csPlateau(ex) {
  try {
    const diag = window.CoachAnalyze.plateau(_csWeeklyHistory(ex.id));
    if (!diag) return;
    const say = window.CoachAnalyze.plateauSay(diag, ex.name);
    if (!say) return;
    _csSeq(() => {
      const sess = _csGet(timerTs); if (!sess) return;
      if (!_csHasRoomFine(sess)) return;          // strengerer Rueckhalt: Feinheiten sind zuerst da
      const r = window.CoachSession.emit(sess, 'plateau', say.key, say.vars);
      _csPut(r.sess); if (r.out) _csEmit(r.out);
      // Und jetzt die ANTWORT auf das Plateau. Die Beobachtung allein hat den
      // Nutzer nie herausgeholt: er erfuhr, dass er steht, und stand weiter.
      // Ab drei Wochen bietet der Coach den Reset an — zehn Prozent runter und
      // wieder hocharbeiten. Kein Modell, kein Netz, kein Kontingent: das ist
      // Progressionslehre und keine Einschaetzung.
      try { _csPlateauAngebot(ex, diag); } catch(e2) { console.warn('[Coach] Plateau-Angebot:', e2); }
    });
  } catch(e) { console.warn('[Coach] Plateau:', e); }
}
/* Das Angebot als Karte — derselbe Weg wie Top- und Dropsatz, mit Knopf und
   ohne Automatik. Es gilt fuer die ganze Uebung (action 'resetLoad' setzt
   jeden noch offenen Satz), denn ein Reset, der nach einem Satz wieder auf das
   Plateaugewicht springt, waere keiner. */
function _csPlateauAngebot(ex, diag) {
  if (!ex || !diag) return;
  if (typeof _coachCardOffen === 'function' && _coachCardOffen()) return;  // eine offene Karte reicht
  const plan = window.CoachAnalyze.plateauPlan(diag);
  if (!plan) return;
  const li = (typeof wkLogs !== 'undefined' && Array.isArray(wkLogs))
    ? wkLogs.findIndex(l => l && l.exerciseId === ex.id) : -1;
  if (li < 0) return;
  const nm  = (typeof _exDisp === 'function') ? _exDisp(ex.name) : ex.name;
  const von = kgToDisp(plan.fromKg), auf = kgToDisp(plan.toKg), e = unitLabel();
  const c = {
    title: _cm('Plateau lösen', 'Break the plateau'),
    text: _cm(
      nm + ' steht seit ' + plan.weeks + ' Wochen bei ' + von + ' ' + e + '. Zurück auf ' + auf + ' ' + e
        + ' und in den nächsten Wochen wieder hocharbeiten — das ist der übliche Weg aus einem Plateau.',
      nm + ' has been stuck at ' + von + ' ' + e + ' for ' + plan.weeks + ' weeks. Drop to ' + auf + ' ' + e
        + ' and work back up over the next weeks — that is the standard way out of a plateau.'),
    options: [
      { label: _cm('Auf ', 'Down to ') + auf + ' ' + e, action: { kind: 'resetLoad', value: plan.toKg } },
      { label: _cm('Weiter wie geplant', 'Stay on plan'), action: { kind: 'none' } },
    ],
  };
  const w = parseFloat((wkLogs[li].sets || [])[0]?.w) || plan.fromKg;
  if (typeof _coachOffer === 'function') _coachOffer(ex.id, c, w);
}
// Ein Eintrag JE UEBUNG UND WOCHE (Hinweis aus Task 16: mehrere Eintraege pro
// Woche verkuerzen die Spanne, und die Diagnose faellt aus). Der Wochenschluessel
// kommt aus CoachAnalyze.isoWeekKey() — index.html hat bei getWeekKey() ein
// anderes, nicht-ISO-Format ('2026-W5', ohne fuehrende Null). Die beiden Formate
// werden hier NICHT zusammengefuehrt und nirgends gemischt (gehoert zu Block 5).
/* Die Pause ist eine MESSUNG oder sie fehlt. Bis zur Blockabschluss-Review
   stand hier S.restTimerSecs — die Einstellung des Nutzers — in jeder
   Wochenzeile. Der Coach las damit dessen eigene Vorgabe als Beobachtung vor
   ('deine Pausen liegen im Schnitt bei 90 Sekunden'), und plateau.restDelta
   war strukturell immer 0. Gemessen wird jetzt in toggleSetDone(): der Abstand
   zwischen zwei abgehakten Arbeitssaetzen landet als set.rs an der Einheit.
   Ohne diese Zahl (jede Einheit vor dieser Aenderung) bleibt avgRestSecs
   null — CoachAnalyze faellt dann auf den Satzschluessel ohne Pausenzahl
   zurueck, statt eine zu erfinden. */
function _csRestAvg(sets) {
  try {
    const v = (sets || [])
      .filter(s => s && (s.type || 'normal') !== 'warmup')
      .map(s => parseFloat(s.rs))
      .filter(n => isFinite(n) && n > 0);
    if (!v.length) return null;
    return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
  } catch(_) { return null; }
}
function _csWeeklyHistory(exId) {
  const rows = new Map();
  try {
    (S.sessions || []).forEach(s => {
      const ts = new Date(s && s.date).getTime();
      if (!isFinite(ts)) return;
      const wk = window.CoachAnalyze.isoWeekKey(ts);
      if (!wk) return;
      (s.logs || []).forEach(l => {
        if (!l || String(l.exerciseId) !== String(exId)) return;
        const top = _coachTopSet(l.sets);
        const topKg = top ? (parseFloat(top.w) || 0) : 0;
        if (!(topKg > 0)) return;
        let vol = 0; try { vol = setsVolume(l.sets || []); } catch(_) {}
        const rest = _csRestAvg(l.sets);
        const cur = rows.get(wk);
        if (!cur || topKg > cur.topKg) rows.set(wk, { ts: ts, topKg: topKg, vol: vol, avgRestSecs: rest });
        else {
          if (vol > cur.vol) cur.vol = vol;
          if (cur.avgRestSecs == null && rest != null) cur.avgRestSecs = rest;
        }
      });
    });
  } catch(e) { console.warn('[Coach] Wochenverlauf:', e); }
  return [...rows.values()];
}

/* Zeitbudget. Die App hat kein Eingabefeld fuer "ich habe heute X Minuten" —
   das einzige BELEGTE Budget ist die uebliche Dauer der letzten Einheiten.
   prio wird aufsteigend befuellt (1 = wichtigste): die Planreihenfolge, denn
   die erste Uebung des Tages ist die, mit der der Plan rechnet. Gesagt wird nur
   etwas, wenn tatsaechlich etwas herausfaellt.                                */
function _csTimeBudget() {
  try {
    const durs = (S.sessions || []).slice(-10).map(s => (s && s.duration) || 0).filter(v => v > 0);
    if (durs.length < 3) return;
    const mins = Math.round(durs.reduce((a, b) => a + b, 0) / durs.length / 60);
    if (!(mins > 0)) return;
    const rest = (typeof S.restTimerSecs === 'number' && S.restTimerSecs > 0) ? S.restTimerSecs : 90;
    const list = (wkLogs || []).map((l, i) => {
      const ex = exById(l && l.exerciseId) || {};
      return { id: String(l && l.exerciseId), prio: i + 1,
               sets: ((l && l.sets && l.sets.length) || parseInt(ex.targetSets) || 1),
               restSecs: rest };
    });
    const res = window.CoachAnalyze.prioritize(list, mins);
    if (!res || !res.drop || !res.drop.length) return;
    const say = window.CoachAnalyze.prioritizeSay(res, mins);
    if (!say) return;
    _csSeq(() => {
      const sess = _csGet(timerTs); if (!sess) return;
      if (!_csHasRoomFine(sess)) return;          // strengerer Rueckhalt: Feinheiten sind zuerst da
      const r = window.CoachSession.emit(sess, 'timeBudget', say.key, say.vars);
      _csPut(r.sess); if (r.out) _csEmit(r.out);
    });
  } catch(e) { console.warn('[Coach] Zeitbudget:', e); }
}

// Satz abgehakt. mid/fatigue sind Einordnung im Bogen, nicht der "kurze
// Kommentar, sobald ein Satz steht" — den liefert _coachMicroReact() und nur
// der haengt an setFeedback. Die Satz-Rueckfrage (_rpeAsk) haengt daran ebenfalls.
function _csSet(log) {
  try {
    if (!_csOn() || !timerTs) return;
    const sess = _csGet(timerTs); if (!sess) return;
    const r = window.CoachSession.onSet(sess, log || {});
    _csPut(r.sess);
    if (r.out) _csEmit(r.out);
  } catch(e) { console.warn('[Coach] Satz:', e); }
}

// Pausentimer abgelaufen.
function _csRest(secs) {
  try {
    if (!_csOn() || !timerTs) return;
    const sess = _csGet(timerTs); if (!sess) return;
    // restNext entsteht IM Modul. Ist kein Platz mehr, wird die Buchung
    // zurueckgenommen — die Pause selbst bleibt im Zustand (Ermuedung).
    const r = _csTake(sess, window.CoachSession.onRest(sess, secs));
    _csPut(r.sess);
    if (r.out) _csEmit(r.out);
  } catch(e) { console.warn('[Coach] Pause:', e); }
}

// Bestehender Timer-Tick, hoechstens einmal pro Minute (s. _startWkTimer).
function _csTick() {
  try {
    if (!_csOn() || !timerTs) return;
    const sess = _csGet(timerTs); if (!sess) return;
    const r = window.CoachSession.onTick(sess, Date.now());
    _csPut(r.sess);
    if (r.out) _csEmit(r.out);
  } catch(e) { console.warn('[Coach] Tick:', e); }
}

// Training beendet. Der Abschluss faellt nie aus (sessionEnd nutzt force) —
// ausser bei Stufe "off", wo die Obergrenze 0 ist. Danach wird der Zustand
// genullt und persistiert.
function _csEnd(summary) {
  try {
    const sess = timerTs ? _csGet(timerTs) : null;
    if (sess) {
      const r = window.CoachSession.sessionEnd(sess, summary || {});
      // Bestwert an dieselbe Zeile, nicht als zweite Aeusserung: 'prCongrats'
      // hatte bis zur Blockabschluss-Review keinen einzigen Aufrufer, und
      // 'prs' war zugleich aus 'debrief' gefallen — Bestwerte kamen im Coach
      // damit nirgends vor. Eine eigene Art dafuer haette einen weiteren Platz
      // im knappsten Budget des Vorhabens gekostet und waere zudem auf einer
      // Flaeche gelandet, die im selben Tick zugeht. Angehaengt wird nur ein
      // echtes MAXIMALGEWICHT — ein geschaetztes 1RM als 'Bestwert' anzusagen
      // waere eine Zahl, die so nie gehoben wurde.
      let extra = '';
      try {
        const pr = ((summary && summary.prs) || []).find(x => x && x.type === 'weight');
        if (pr) extra = _say('prCongrats', { ex: pr.exName, kg: _csWeight(pr.newVal) }) || '';
      } catch(_) {}
      const line = r.out ? _csEmit(r.out, extra || null) : '';
      // Die Bilanz stand bisher NUR in #wk-coach-bar — und finishWk() schliesst
      // ov-wk 24 Zeilen spaeter im selben Tick. Die 14 s Haltezeit waren tot:
      // ausgerechnet die eine Aeusserung, die im Modul force bekommt, damit sie
      // nie ausfaellt, hat der Nutzer nie gesehen. Sie wandert deshalb auf den
      // Bildschirm, der nach dem Speichern ohnehin steht (Post-Workout-Check-in) —
      // keine neue Flaeche im Training, kein Umbau des Abschluss-Ablaufs.
      if (line) _csFinalLine = String(line);
    }
    _csDiscard();
  } catch(e) { console.warn('[Coach] Abschluss:', e); }
}

// Zustand verwerfen (Abschluss, Abbruch). Danach liefert _csGet() null und kein
// Modulaufruf kann mehr reden.
function _csDiscard() {
  try { _rpeFlushTrend(); } catch(_) {}
  _rpeAnswers = [];
  _csLastExId = null;
  _csSeenEx = null;
  _csSeenSets = null;
  _csLastSetTs = 0;
  _csSeqAt = 0;
  try { S.coachSession = null; persist(); }      // persist() - die Kurzform ohne Praefix gibt es hier nicht
  catch(e) { console.warn('[Coach] Zustand verwerfen:', e); }
}

/* ══ SATZ-EINSCHAETZUNG: abgeleitet statt erfragt ═════════════════════════════
   Bis hierher fragte der Coach nach JEDEM Arbeitssatz "leicht, passend oder
   schwer?" — drei Chips in der Leiste. Die Antwort steht aber bereits in den
   Zahlen: Wer unter der prognostizierten Wiederholungszahl bleibt, hatte einen
   schweren Satz; wer deutlich darueber liegt, einen leichten. Eine Frage, deren
   Antwort man schon kennt, ist eine Unterbrechung ohne Ertrag.
   Die Skala bleibt dieselbe (CoachRpe: easy/ok/hard) und damit auch alles, was
   daran haengt: Gewichtsanpassung, Pausenlaenge, Dossier-Trend.                */
let _rpeAnswers = [];      // Einschaetzungen dieser Einheit (Trend fuers Dossier)
// Richtung der letzten Gewichtskorrektur JE UEBUNG. Grundlage der Daempfung:
// senkt der Coach und muss gleich darauf wieder heben, war die erste Korrektur
// zu gross — dann nur noch der halbe Weg, statt zwischen zwei Werten zu pendeln.
let _rpeLastDir = {};

/* ── Rueckgaengig ────────────────────────────────────────────────────────────
   Der Coach aendert jetzt selbst: Gewicht der offenen Saetze, Satzzahl,
   Wiederholungsbereich. Wer selbst handelt, muss auch zurueckkoennen — sonst
   bleibt dem Nutzer nur, die Aenderung von Hand zu suchen und rueckzubauen.
   Zehn Sekunden, ein Knopf in derselben Leiste, kein Dialog.                  */
const COACH_UNDO_MS = 10000;
let _coachUndoState = null;    // {ts, restore}
function _coachUndoOffer(restore) {
  if (typeof restore !== 'function') return;
  _coachUndoState = { ts: Date.now(), restore };
  setTimeout(() => {
    if (_coachUndoState && Date.now() - _coachUndoState.ts >= COACH_UNDO_MS - 100) {
      _coachUndoState = null;
      try { _coachBarRender(); } catch(_) {}
    }
  }, COACH_UNDO_MS);
}
function _coachUndoFrisch() {
  return !!(_coachUndoState && Date.now() - _coachUndoState.ts < COACH_UNDO_MS);
}
function _coachUndoDo() {
  const u = _coachUndoState;
  _coachUndoState = null;
  if (!u) { try { _coachBarRender(); } catch(_) {} return; }
  try { u.restore(); } catch(e) { console.warn('[Coach] Rueckgaengig:', e); }
  try { haptic(10); } catch(_) {}
  try { renderLogCards(); } catch(_) {}
  try { _saveActiveWk(); } catch(_) {}
  _coachBarSet('msg', _cm('Änderung zurückgenommen.', 'Change undone.'), 3500);
}
// Zustandskopie einer Uebung samt Vorschlagsgewicht. JSON-Kopie genuegt: Saetze
// sind reine Datenobjekte (Zahlen und Zeichenketten), keine Verweise.
function _coachSnapshot(li) {
  const log = wkLogs[li]; if (!log) return null;
  const sets = JSON.parse(JSON.stringify(log.sets || []));
  const sugW = log.sugW, sugR = log.sugR;
  return () => {
    const l = wkLogs[li]; if (!l) return;
    l.sets = JSON.parse(JSON.stringify(sets));
    l.sugW = sugW; l.sugR = sugR;
  };
}

/* Nur die Uebersetzung App-Daten -> Modul-Vertrag. Die Regel selbst steht in
   CoachRpe.derive(): dort ist sie ohne DOM pruefbar, und dieselbe Datei haelt
   bereits die Skala (easy/ok/hard) und die Gewichtsrechnung dazu. */
function _rpeTargetReps(ex, log) {
  const { min, max } = repRange(ex);
  let t = parseInt(log && log.sugR) || 0;
  if (!(t > 0)) t = min;               // ohne Prognose gilt der Bereichsanfang
  return Math.max(min, Math.min(max, t));
}
function _rpeBucketOf(set, ex, log) {
  const { min, max } = repRange(ex);
  return window.CoachRpe.derive(parseInt(set && set.r) || 0, {
    min, max,
    target: _rpeTargetReps(ex, log),
    type: (set && set.type) || 'normal',
  });
}
function _rpeDerive(li, si) {
  try {
    if (!isPremium() || _coachLevel() === 'off') return false;
    // Derselbe Schalter wie in _coachMicroReact: "Rueckmeldung nach dem Satz".
    if (_persona().setFeedback === false) return false;
    const log = wkLogs[li]; if (!log) return false;
    const set = log.sets && log.sets[si]; if (!set || !set.done) return false;
    if ((set.type || 'normal') === 'warmup') return false;
    const ex = exById(log.exerciseId); if (!ex || ex.targetType === 'time') return false;
    const kg = parseFloat(set.w); if (!(kg > 0)) return false;

    const bucket = _rpeBucketOf(set, ex, log);
    if (!bucket) return false;
    set.rpe = window.CoachRpe.toRpe(bucket);
    set.rpeAnswer = bucket;
    _rpeAnswers.push(bucket);

    let gesagt = false;
    // Das Gewicht wird ANGEBOTEN, nicht gesetzt. Vorher aenderte die App es
    // selbst und die KI-Karte bot kurz darauf dasselbe noch einmal an — fuer
    // den Nutzer kreuzten sich zwei Wege zur selben Sache. Jetzt gibt es genau
    // eine Entscheidungsflaeche: die Karte.
    // Weiterhin nur, wenn der Satz mit dem VORGESCHLAGENEN Gewicht gelaufen ist.
    // Wer bewusst schwerer oder leichter aufgelegt hat, hat entschieden; die
    // Prognose gilt dann nicht mehr.
    const sug = parseFloat(log.sugW) || 0;
    const eq  = _csEquip(ex);
    const eigenmaechtig = sug > 0 && Math.abs(kg - sug) > (eq.step || 2.5) + 0.01;
    if (bucket !== 'ok' && !eigenmaechtig && !_coachCardOffen()) {
      // Relativ statt eine Rasterstufe: 2,5 kg weniger auf 200 kg Kreuzheben
      // waeren ein Prozent, nachdem die Wiederholungen eingebrochen sind. Das
      // Raster des Geraets (Stange mit Scheibe je Seite, sonst Stapelstufe)
      // bestimmt nur, wo das Ergebnis einrastet — nicht, wie weit es geht.
      // Daempfung bei Richtungswechsel: hat der Coach bei dieser Uebung eben
      // gesenkt und muesste jetzt heben (oder umgekehrt), war die erste
      // Korrektur zu gross. Dann nur den halben Weg — sonst pendelt das
      // Gewicht von Satz zu Satz zwischen zwei Werten hin und her.
      const dir = bucket === 'hard' ? -1 : 1;
      const vorher = _rpeLastDir[log.exerciseId] || 0;
      const next = window.CoachRpe.adjustByReps(kg, {
        reps: parseInt(set.r) || 0,
        target: _rpeTargetReps(ex, log),
        step: eq.step, barKg: eq.barKg,
        dampen: (vorher && vorher !== dir) ? 0.5 : undefined,
      });
      const offen = (log.sets || []).some(s => !s.done && (s.type || 'normal') !== 'warmup');
      if (next != null && offen && Math.abs(next - kg) > 0.01) {
        const zielW = _rpeTargetReps(ex, log);
        let txt = '';
        try {
          txt = _say(bucket === 'hard' ? 'setOfferHard' : 'setOfferEasy',
                     _csVars({ kg: next })) || '';
        } catch(_) {}
        // Der Grund steht VOR dem Vorschlag: eine Zahl, die der Nutzer im Satz
        // selbst sieht. Ohne sie ist der Vorschlag eine Behauptung.
        const grund = _cm(parseInt(set.r) + ' statt ' + zielW + ' Wiederholungen. ',
                          parseInt(set.r) + ' reps instead of ' + zielW + '. ');
        _rpeLastDir[log.exerciseId] = dir;
        _coachOffer(log.exerciseId, {
          title: bucket === 'hard' ? _cm('Gewicht senken?', 'Lower the weight?')
                                   : _cm('Gewicht erhöhen?', 'Add weight?'),
          text: grund + txt,
          options: [
            { label: kgToDisp(next) + ' ' + unitLabel(), action: { kind: 'sugWeight', value: next } },
            { label: _cm('So lassen', 'Leave it'), action: { kind: 'none' } },
          ],
        }, kg);
        gesagt = true;
      }
    }
    _saveActiveWk();
    return gesagt;
  } catch(e) { console.warn('[Coach] Satz-Einschaetzung:', e); return false; }
}
/* _csAck() (Obergrenze der Quittungsflaeche ueber CoachSession.ACK_CAP) ist
   entfallen. Es deckelte die Antwort auf die Satz-Rueckfrage, weil die bei
   JEDEM Satz kam. Die Rueckfrage gibt es nicht mehr; was jetzt spricht, sagt
   eine tatsaechliche Aenderung an und geschieht je Uebung hoechstens einmal.
   Ein Deckel darueber wuerde die Aenderung stumm machen, nicht seltener. */

// Naechster Vorschlag derselben Uebung: die noch offenen Arbeitssaetze bekommen
// das neue Gewicht, log.sugW zieht mit (dieselbe Struktur, die startActive()
// und getSuggestedWeight() benutzen).
function _rpeSuggestNext(exId, kg) {
  try {
    const log = (wkLogs || []).find(l => l && l.exerciseId === exId); if (!log) return false;
    const v = Math.round(kg * 10) / 10;
    log.sugW = String(v);
    (log.sets || []).forEach(s => { if (!s.done && (s.type || 'normal') !== 'warmup') s.w = String(v); });
    renderLogCards();
    _saveActiveWk();
    return true;
  } catch(e) { console.warn('[Coach] RPE-Vorschlag:', e); return false; }
}
// Trend ins Dossier — erst ab drei Antworten, ueber den BESTEHENDEN Schreibweg
// (_dossierSet), kein zweiter Firestore-Zugriff.
