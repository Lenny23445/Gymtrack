/* ── LEVEL ALS HANTELSCHEIBE ───────────────────────────────────────────────
   Das Level stand ueberall als Wort-Pille („LVL 37") — in der Kopfzeile, in
   der Freundesliste, in der Rangliste. Statt dessen zeigt die App jetzt eine
   Gewichtsscheibe mit der Zahl darin: dasselbe Zeichen ueberall, sofort
   erkennbar, und es gehoert ins Gym statt in ein Spielemenue.

   Alles ist SVG, kein Bild:
   - offline verfuegbar (kein zusaetzliches Asset im Service-Worker-Cache),
   - in jeder Groesse scharf, von der 20-px-Pille bis zum Vollbild,
   - farbbar, ohne fuer jede Stufe eine eigene Datei zu pflegen.

   Die Farben folgen den Wettkampfscheiben (schwerer = auffaelliger): Gusseisen
   schwarz, dann gruen, gelb, blau, rot, oben Chrom.

   Fuers Teilen gibt es dieselbe Scheibe noch einmal auf Canvas
   (_lvlPlateCanvas). Ein SVG laesst sich in der WKWebView nicht zuverlaessig
   in ein teilbares Bild verwandeln: <img src="data:image/svg+xml"> aufs Canvas
   zu zeichnen faerbt es je nach Schriftart/Filter als „tainted" ein, und
   toDataURL wirft dann. Der Canvas-Zwilling ist deshalb Absicht. */

const PLATE_STUFEN = [
  { ab: 50, name: 'Chrom',     rand: '#e8edf2', flaeche: '#c9d2da', tief: '#8e99a4', text: '#2b3138', glanz: .55 },
  { ab: 40, name: 'Rot',       rand: '#e0483c', flaeche: '#b8322a', tief: '#7d1f1a', text: '#ffffff', glanz: .30 },
  { ab: 30, name: 'Blau',      rand: '#3d7fe0', flaeche: '#2a5fb8', tief: '#1b3f7d', text: '#ffffff', glanz: .30 },
  { ab: 20, name: 'Gelb',      rand: '#e8c141', flaeche: '#c99f22', tief: '#8a6c12', text: '#3a2f08', glanz: .34 },
  { ab: 10, name: 'Grün',      rand: '#3fb45e', flaeche: '#2a8c46', tief: '#1a5c2d', text: '#ffffff', glanz: .30 },
  { ab: 0,  name: 'Gusseisen', rand: '#4a4f55', flaeche: '#2e3237', tief: '#17191c', text: '#f2f5f8', glanz: .22 }
];
function plateStufe(level){
  const L = Math.max(1, Math.round(+level || 1));
  return PLATE_STUFEN.find(s => L >= s.ab) || PLATE_STUFEN[PLATE_STUFEN.length - 1];
}

/* Jede Scheibe braucht eigene Verlaufs-IDs — zwei SVGs mit derselben ID auf
   einer Seite teilen sich sonst den ersten Verlauf, und alle Scheiben saehen
   aus wie die erste. */
let _plateNr = 0;

/* Schriftgroesse der Zahl. Sie steht mittig auf der Scheibe und ist das
   Einzige, was gelesen werden muss — dreistellige Level muessen deshalb in
   denselben Kreis passen wie einstellige. */
function _plateZahlGroesse(text){
  return text.length >= 3 ? 30 : text.length === 2 ? 38 : 44;
}

/* Aufbau: eine geschlossene Scheibe von der Seite, wie die Scheibe einer
   Kurzhantel — aussen ein schmaler Ring, in der Mitte die Zahl (dort, wo auf
   einer echten Scheibe die Kilogramm stehen). Kein Loch, keine Speichen: der
   erste Entwurf hatte beides, und die Zahl musste sich den Platz mit Nabe und
   Kreuz teilen — bei 22 px war sie damit nicht mehr zu lesen. Jetzt sieht die
   Scheibe in jeder Groesse gleich aus, von der Liste bis zum Vollbild.

   level      = anzuzeigende Zahl
   px         = Kantenlaenge in Pixeln
   opts.label = kleines „LEVEL" ueber der Zahl (erst ab ~120 px lesbar) */
function _lvlPlateSVG(level, px, opts){
  const o     = opts || {};
  const s     = plateStufe(level);
  const n     = String(Math.max(1, Math.round(+level || 1)));
  const id    = 'pl' + (++_plateNr);
  const gross = px >= 120;
  const zeigeLabel = gross && o.label !== false;

  return `<svg class="lvl-plate" viewBox="0 0 100 100" width="${px}" height="${px}" role="img"
    aria-label="Level ${n}" style="display:block">
    <defs>
      <!-- Flaeche LINEAR beleuchtet, nicht radial: ein radialer Verlauf macht
           aus der flachen Scheibe eine Kugel. -->
      <linearGradient id="${id}f" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0%"   stop-color="${s.rand}"/>
        <stop offset="48%"  stop-color="${s.flaeche}"/>
        <stop offset="100%" stop-color="${s.tief}"/>
      </linearGradient>
      <!-- Der schmale Ring aussen: Licht oben links, Schatten unten rechts,
           dazwischen ein heller Streifen — das laesst die Kante gedreht wirken. -->
      <linearGradient id="${id}r" x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0%"   stop-color="${s.rand}"/>
        <stop offset="30%"  stop-color="${s.tief}"/>
        <stop offset="62%"  stop-color="${s.flaeche}"/>
        <stop offset="100%" stop-color="${s.tief}"/>
      </linearGradient>
      <linearGradient id="${id}g" x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0%"   stop-color="#fff" stop-opacity="${s.glanz}"/>
        <stop offset="42%"  stop-color="#fff" stop-opacity="0"/>
        <stop offset="100%" stop-color="#fff" stop-opacity="${s.glanz * .4}"/>
      </linearGradient>
    </defs>

    <!-- Scheibe -->
    <circle cx="50" cy="50" r="49" fill="url(#${id}f)"/>
    <!-- Schmaler Ring aussen -->
    <circle cx="50" cy="50" r="46" fill="none" stroke="url(#${id}r)" stroke-width="6"/>
    <circle cx="50" cy="50" r="49" fill="none" stroke="#000" stroke-width="1.2" opacity=".45"/>
    <circle cx="50" cy="50" r="43" fill="none" stroke="#000" stroke-width="1" opacity=".3"/>
    <circle cx="50" cy="50" r="42.2" fill="none" stroke="#fff" stroke-width=".7" opacity=".14"/>
    <circle cx="50" cy="50" r="49" fill="url(#${id}g)" pointer-events="none"/>

    ${zeigeLabel ? `<text x="50" y="30" text-anchor="middle" font-size="9" font-weight="800"
      letter-spacing="3.4" fill="${s.text}" opacity=".72" style="font-family:inherit">LEVEL</text>` : ''}
    <!-- Zahl: zwei Kopien, die dunkle um 0,8 versetzt — der billigste
         ueberzeugende Praege-Effekt, und er ueberlebt jede Schriftart. -->
    <text x="50" y="${zeigeLabel ? 58 : 50}" text-anchor="middle" dominant-baseline="central"
      font-size="${_plateZahlGroesse(n)}" font-weight="800" fill="#000" opacity=".38"
      style="font-family:inherit;letter-spacing:-1px" transform="translate(0 .8)">${n}</text>
    <text x="50" y="${zeigeLabel ? 58 : 50}" text-anchor="middle" dominant-baseline="central"
      font-size="${_plateZahlGroesse(n)}" font-weight="800" fill="${s.text}"
      style="font-family:inherit;letter-spacing:-1px">${n}</text>
  </svg>`;
}

/* Kleine Scheibe fuer Listen und Kopfzeile. */
function _lvlPlate(level, px){
  const p = px || 22;
  return _lvlPlateSVG(level, p, { flach: p < 44, label: false });
}

/* ── Canvas-Zwilling fuers Teilen ────────────────────────────────────────
   Dieselbe Scheibe mit der 2D-API, damit ein echtes PNG entsteht. Groesse in
   Bildpunkten; die Vollbild-Ansicht teilt mit 1080. */
function _lvlPlateCanvas(level, size){
  const px = size || 1080;
  const s  = plateStufe(level);
  const n  = String(Math.max(1, Math.round(+level || 1)));
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const c = cv.getContext('2d');
  const m = px / 100;            // dieselben Koordinaten wie im SVG
  const M = (v) => v * m;

  // Dunkler Hintergrund, damit das PNG auch auf hellen Zeitleisten steht.
  const bg = c.createLinearGradient(0, 0, 0, px);
  bg.addColorStop(0, '#15181c');
  bg.addColorStop(1, '#0a0c0e');
  c.fillStyle = bg; c.fillRect(0, 0, px, px);

  const kreis = (r, fill, stroke, sw, alpha) => {
    c.beginPath(); c.arc(M(50), M(50), M(r), 0, Math.PI * 2);
    c.globalAlpha = alpha == null ? 1 : alpha;
    if (fill)   { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = M(sw || 1); c.stroke(); }
    c.globalAlpha = 1;
  };

  const flaeche = c.createLinearGradient(M(15), 0, M(85), px);
  flaeche.addColorStop(0, s.rand);
  flaeche.addColorStop(.48, s.flaeche);
  flaeche.addColorStop(1, s.tief);
  kreis(46, flaeche);

  // Schmaler Ring aussen — dieselbe Kante wie im SVG.
  const ring = c.createLinearGradient(M(10), 0, M(90), px);
  ring.addColorStop(0, s.rand);
  ring.addColorStop(.3, s.tief);
  ring.addColorStop(.62, s.flaeche);
  ring.addColorStop(1, s.tief);
  kreis(43.5, null, ring, 5.6);
  kreis(46, null, '#000', 1.2, .45);
  kreis(40.5, null, '#000', 1, .3);
  kreis(39.7, null, '#fff', .7, .14);

  // Streiflicht ueber die ganze Scheibe
  const gl = c.createLinearGradient(M(10), 0, M(90), px);
  gl.addColorStop(0, 'rgba(255,255,255,' + s.glanz + ')');
  gl.addColorStop(.42, 'rgba(255,255,255,0)');
  gl.addColorStop(1, 'rgba(255,255,255,' + (s.glanz * .4) + ')');
  c.fillStyle = gl;
  c.beginPath(); c.arc(M(50), M(50), M(46), 0, Math.PI * 2); c.fill();

  // „LEVEL" ueber der Zahl, gerade gesetzt wie im SVG
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = s.text; c.globalAlpha = .72;
  c.font = '800 ' + Math.round(M(8.4)) + 'px -apple-system, system-ui, sans-serif';
  const sperr = M(3.2);
  'LEVEL'.split('').forEach((ch, i, a) => {
    const b = (i - (a.length - 1) / 2) * (M(6.4) + sperr);
    c.fillText(ch, M(50) + b, M(30));
  });
  c.globalAlpha = 1;

  // Zahl mittig, mit dunklem Versatz als Praegung
  const gr = n.length >= 3 ? 30 : n.length === 2 ? 38 : 44;
  c.font = '800 ' + Math.round(M(gr)) + 'px -apple-system, system-ui, sans-serif';
  c.fillStyle = '#000'; c.globalAlpha = .38;
  c.fillText(n, M(50), M(58.8));
  c.globalAlpha = 1;
  c.fillStyle = s.text;
  c.fillText(n, M(50), M(58));

  return cv;
}

/* ── Vollbild-Ansicht ────────────────────────────────────────────────────
   Eine Seite je Level, senkrecht durchblaetterbar (Scroll-Snap). Startet auf
   dem eigenen Level; darunter die naechsten Stufen, darueber die erreichten. */
const LVLP_UM = 12;   // Stufen um das eigene Level herum

function openLevelPlate(start){
  haptic(8);
  const eigen = (typeof _levelOf === 'function' && typeof _xpSelf === 'function')
    ? _levelOf(_xpSelf()) : { level: 1, pts: 0, toGo: 0, max: false };
  const max   = (typeof MAX_LEVEL === 'number') ? MAX_LEVEL : 99;
  const mitte = Math.max(1, Math.min(max, Math.round(+start || eigen.level)));

  const host = document.getElementById('lvlp-scroll');
  if (!host) return;
  const von = Math.max(1, mitte - LVLP_UM);
  const bis = Math.min(max, mitte + LVLP_UM);
  const seiten = [];
  for (let L = von; L <= bis; L++) seiten.push(_lvlPlatePage(L, eigen));
  host.innerHTML = seiten.join('');
  openOv('ov-lvlplate');
  // Ohne Animation auf die eigene Stufe springen — sonst zieht das Blatt
  // sichtbar an allen Stufen vorbei.
  requestAnimationFrame(() => {
    const el = document.getElementById('lvlp-' + mitte);
    if (el) host.scrollTop = el.offsetTop;
  });
}
function _lvlPlatePage(L, eigen){
  const s        = plateStufe(L);
  const erreicht = L <= eigen.level;
  const jetzt    = L === eigen.level;
  const schwelle = (typeof _lvlMin === 'function') ? _lvlMin(L) : null;
  const fmt      = (v) => (typeof _fmtXP === 'function') ? _fmtXP(v) : String(v);
  let sub;
  if (jetzt) sub = eigen.max ? 'Maximales Level erreicht' : 'Noch ' + fmt(eigen.toGo) + ' Punkte bis Level ' + (L + 1);
  else if (erreicht) sub = 'Erreicht';
  else sub = schwelle != null ? 'Ab ' + fmt(schwelle) + ' Punkten' : '';
  return `<section class="lvlp-page" id="lvlp-${L}">
    <div class="lvlp-plate${erreicht ? '' : ' locked'}">${_lvlPlateSVG(L, 300, { label: true })}</div>
    <div class="lvlp-name">${esc(s.name)}</div>
    <div class="lvlp-sub">${esc(sub)}</div>
    ${jetzt ? `<button class="btn btn-acc lvlp-share" onclick="lvlPlateShare(${L})">Teilen</button>` : ''}
  </section>`;
}

/* Teilen: PNG aus dem Canvas-Zwilling. navigator.share mit Datei, wo es geht
   (iOS-Teilen-Blatt), sonst Download — beides ohne Serverweg. */
async function lvlPlateShare(level){
  haptic(10);
  try {
    const cv = _lvlPlateCanvas(level, 1080);
    const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
    if (!blob) throw new Error('kein Bild');
    const datei = new File([blob], 'level-' + level + '.png', { type: 'image/png' });
    const text  = 'Level ' + level + ' bei MyGymTrack';
    if (navigator.canShare && navigator.canShare({ files: [datei] })) {
      await navigator.share({ files: [datei], text });
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = datei.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch(e) {
    if (String(e && e.name) === 'AbortError') return;   // Teilen abgebrochen
    console.warn('[GymTrack] Level teilen:', e);
    alert('Bild konnte nicht erstellt werden.');
  }
}
