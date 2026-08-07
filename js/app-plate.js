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

/* Der Grundkoerper ist in allen Stufen dunkel wie die Hantel-Vorlage; die
   Stufe zeigt sich an den Akzentboegen (`akzent`), am umlaufenden Ring
   (`ring`) und am Ton der Zahl (`schrift`). Ab der obersten Stufe wird die
   Innenflaeche hell — die Chromscheibe ist der sichtbare Bruch nach oben. */
const PLATE_STUFEN = [
  { ab: 50, name: 'Chrom',     innenHell: '#eef2f6', innen: '#ccd4dc', innenTief: '#9aa4ae', ring: '#9aa4ae', akzent: '#ffffff', schrift: '#1c2126', glanz: .5 },
  { ab: 40, name: 'Rot',       innenHell: '#3a4048', innen: '#262b31', innenTief: '#15181c', ring: '#6b7480', akzent: '#e0483c', schrift: '#f4f7fa', glanz: .26 },
  { ab: 30, name: 'Blau',      innenHell: '#3a4048', innen: '#262b31', innenTief: '#15181c', ring: '#6b7480', akzent: '#3d7fe0', schrift: '#f4f7fa', glanz: .26 },
  { ab: 20, name: 'Gelb',      innenHell: '#3a4048', innen: '#262b31', innenTief: '#15181c', ring: '#6b7480', akzent: '#e8c141', schrift: '#f4f7fa', glanz: .26 },
  { ab: 10, name: 'Grün',      innenHell: '#3a4048', innen: '#262b31', innenTief: '#15181c', ring: '#6b7480', akzent: '#3fb45e', schrift: '#f4f7fa', glanz: .26 },
  { ab: 0,  name: 'Gusseisen', innenHell: '#3a4048', innen: '#262b31', innenTief: '#15181c', ring: '#6b7480', akzent: '#aeb7c1', schrift: '#e6ebf0', glanz: .22 }
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
  return text.length >= 3 ? 26 : text.length === 2 ? 34 : 40;
}

/* Aufbau nach der Endscheibe einer Kurzhantel (Vorlage: ATLETICA-Hantel):
   ein dicker, matter Reifen aussen, darin eine erhabene Innenflaeche mit
   umlaufendem hellem Ring, oben und unten gebogene Schrift, links und rechts
   je ein kurzer Akzentbogen — und mittig gross die Zahl, dort wo auf der
   Hantel das Gewicht steht.

   Der Grundkoerper bleibt in allen Stufen dunkel wie die Vorlage; die Stufe
   zeigt sich an den beiden Akzentboegen und am Ton der Zahl. Eine komplett
   eingefaerbte Scheibe sah nach Spielmarke aus, nicht nach Hantel.

   level      = anzuzeigende Zahl
   px         = Kantenlaenge in Pixeln
   opts.label = gebogene Schrift oben/unten (erst ab ~120 px lesbar) */
function _lvlPlateSVG(level, px, opts){
  const o     = opts || {};
  const s     = plateStufe(level);
  const n     = String(Math.max(1, Math.round(+level || 1)));
  const id    = 'pl' + (++_plateNr);
  const gross = px >= 120;
  const text  = gross && o.label !== false;

  return `<svg class="lvl-plate" viewBox="0 0 100 100" width="${px}" height="${px}" role="img"
    aria-label="Level ${n}" style="display:block">
    <defs>
      <!-- Reifen: matter Gummi, Licht von oben links -->
      <linearGradient id="${id}r" x1="0.2" y1="0" x2="0.8" y2="1">
        <stop offset="0%"   stop-color="#3c4149"/>
        <stop offset="42%"  stop-color="#22262b"/>
        <stop offset="100%" stop-color="#101317"/>
      </linearGradient>
      <!-- Innenflaeche, eine Spur heller als der Reifen -->
      <linearGradient id="${id}f" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0%"   stop-color="${s.innenHell}"/>
        <stop offset="55%"  stop-color="${s.innen}"/>
        <stop offset="100%" stop-color="${s.innenTief}"/>
      </linearGradient>
      <linearGradient id="${id}g" x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0%"   stop-color="#fff" stop-opacity="${s.glanz}"/>
        <stop offset="45%"  stop-color="#fff" stop-opacity="0"/>
        <stop offset="100%" stop-color="#fff" stop-opacity="${s.glanz * .35}"/>
      </linearGradient>
    </defs>

    <!-- Reifen -->
    <circle cx="50" cy="50" r="49.5" fill="url(#${id}r)"/>
    <circle cx="50" cy="50" r="49" fill="none" stroke="#000" stroke-width="1.4" opacity=".55"/>
    <!-- Erhabene Innenflaeche mit umlaufendem Ring -->
    <circle cx="50" cy="50" r="40" fill="url(#${id}f)"/>
    <circle cx="50" cy="50" r="40" fill="none" stroke="#000" stroke-width="2" opacity=".45"/>
    <circle cx="50" cy="50" r="36.5" fill="none" stroke="${s.ring}" stroke-width="1.5" opacity=".85"/>

    <!-- Akzentboegen links und rechts: das Erkennungszeichen der Vorlage,
         hier traegt es die Stufenfarbe. -->
    <path d="M 15.5 62 A 36.5 36.5 0 0 1 15.5 38" fill="none" stroke="${s.akzent}"
      stroke-width="3.2" stroke-linecap="round"/>
    <path d="M 84.5 38 A 36.5 36.5 0 0 1 84.5 62" fill="none" stroke="${s.akzent}"
      stroke-width="3.2" stroke-linecap="round"/>

    ${text ? `
    <path id="${id}o" d="M 20.5 50 A 29.5 29.5 0 0 1 79.5 50" fill="none"/>
    <path id="${id}u" d="M 21.5 50 A 28.5 28.5 0 0 0 78.5 50" fill="none"/>
    <text font-size="7" font-weight="800" letter-spacing="1.9" text-anchor="middle"
      fill="${s.schrift}" opacity=".88" style="font-family:inherit">
      <textPath href="#${id}o" startOffset="50%">MYGYMTRACK</textPath>
    </text>
    <text font-size="6.4" font-weight="800" letter-spacing="2.4" text-anchor="middle"
      fill="${s.schrift}" opacity=".72" style="font-family:inherit">
      <textPath href="#${id}u" startOffset="50%">LEVEL</textPath>
    </text>` : ''}

    <!-- Zahl: dunkle Kopie leicht versetzt darunter, das gibt die Praegung -->
    <text x="50" y="50" text-anchor="middle" dominant-baseline="central"
      font-size="${_plateZahlGroesse(n)}" font-weight="800" fill="#000" opacity=".45"
      style="font-family:inherit;letter-spacing:-1px" transform="translate(0 1)">${n}</text>
    <text x="50" y="50" text-anchor="middle" dominant-baseline="central"
      font-size="${_plateZahlGroesse(n)}" font-weight="800" fill="${s.schrift}"
      style="font-family:inherit;letter-spacing:-1px">${n}</text>

    <circle cx="50" cy="50" r="49.5" fill="url(#${id}g)" pointer-events="none"/>
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

  // Reifen
  const reifen = c.createLinearGradient(M(20), 0, M(80), px);
  reifen.addColorStop(0, '#3c4149');
  reifen.addColorStop(.42, '#22262b');
  reifen.addColorStop(1, '#101317');
  kreis(46, reifen);
  kreis(45.6, null, '#000', 1.4, .55);

  // Erhabene Innenflaeche mit umlaufendem Ring
  const innen = c.createLinearGradient(M(15), 0, M(85), px);
  innen.addColorStop(0, s.innenHell);
  innen.addColorStop(.55, s.innen);
  innen.addColorStop(1, s.innenTief);
  kreis(37, innen);
  kreis(37, null, '#000', 2, .45);
  kreis(33.8, null, s.ring, 1.5, .85);

  // Akzentboegen links und rechts
  c.strokeStyle = s.akzent; c.lineWidth = M(3.2); c.lineCap = 'round';
  [[Math.PI * .72, Math.PI * 1.28], [Math.PI * -.28, Math.PI * .28]].forEach(([a, b]) => {
    c.beginPath(); c.arc(M(50), M(50), M(33.8), a, b); c.stroke();
  });

  // Gebogene Schrift oben und unten — Buchstabe fuer Buchstabe gedreht
  const bogen = (txt, radius, groesse, sperrung, unten, alpha) => {
    c.save();
    c.translate(M(50), M(50));
    c.fillStyle = s.schrift; c.globalAlpha = alpha;
    c.font = '800 ' + Math.round(M(groesse)) + 'px -apple-system, system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const schritt = (groesse * .72 + sperrung) / radius;   // Bogenmass je Zeichen
    txt.split('').forEach((ch, i) => {
      const t = (i - (txt.length - 1) / 2) * schritt;
      c.save();
      c.rotate(unten ? -t : t);
      c.translate(0, unten ? M(radius) : -M(radius));
      if (unten) c.rotate(Math.PI);
      c.fillText(ch, 0, 0);
      c.restore();
    });
    c.restore();
    c.globalAlpha = 1;
  };
  bogen('MYGYMTRACK', 27.5, 6.6, 1.9, false, .88);
  bogen('LEVEL',      26.5, 6.0, 2.4, true,  .72);

  // Zahl mittig, mit dunklem Versatz als Praegung
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const gr = n.length >= 3 ? 26 : n.length === 2 ? 34 : 40;
  c.font = '800 ' + Math.round(M(gr)) + 'px -apple-system, system-ui, sans-serif';
  c.fillStyle = '#000'; c.globalAlpha = .45;
  c.fillText(n, M(50), M(51));
  c.globalAlpha = 1;
  c.fillStyle = s.schrift;
  c.fillText(n, M(50), M(50));

  // Streiflicht zum Schluss ueber alles
  const gl = c.createLinearGradient(M(10), 0, M(90), px);
  gl.addColorStop(0, 'rgba(255,255,255,' + s.glanz + ')');
  gl.addColorStop(.45, 'rgba(255,255,255,0)');
  gl.addColorStop(1, 'rgba(255,255,255,' + (s.glanz * .35) + ')');
  c.save();
  c.beginPath(); c.arc(M(50), M(50), M(46), 0, Math.PI * 2); c.clip();
  c.fillStyle = gl; c.fillRect(0, 0, px, px);
  c.restore();

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
  for (let L = von; L <= bis; L++) seiten.push(_lvlPlatePage(L, eigen, max));
  host.innerHTML = seiten.join('');
  openOv('ov-lvlplate');
  // Ohne Animation auf die eigene Stufe springen — sonst zieht das Blatt
  // sichtbar an allen Stufen vorbei.
  requestAnimationFrame(() => {
    const el = document.getElementById('lvlp-' + mitte);
    if (el) host.scrollTop = el.offsetTop;
  });
}
function _lvlPlatePage(L, eigen, max){
  const s        = plateStufe(L);
  const erreicht = L <= eigen.level;
  const jetzt    = L === eigen.level;
  const schwelle = (typeof _lvlMin === 'function') ? _lvlMin(L) : null;
  const fmt      = (v) => (typeof _fmtXP === 'function') ? _fmtXP(v) : String(v);
  let sub;
  if (jetzt) sub = eigen.max ? 'Maximales Level erreicht' : 'Noch ' + fmt(eigen.toGo) + ' Punkte bis Level ' + (L + 1);
  else if (erreicht) sub = 'Erreicht';
  else sub = schwelle != null ? 'Ab ' + fmt(schwelle) + ' Punkten' : '';
  /* Einordnung auf jeder Seite: wievielte Stufe von wie vielen, und was sie
     kostet. Ohne die Zeile blaettert man durch Scheiben, ohne zu wissen, wo
     man steht oder wie weit es noch geht. */
  const einordnung = `${L} / ${max}` + (schwelle != null ? ' · ' + fmt(schwelle) + ' Punkte' : '');
  return `<section class="lvlp-page" id="lvlp-${L}">
    <div class="lvlp-plate${erreicht ? '' : ' locked'}">${_lvlPlateSVG(L, 300, { label: true })}</div>
    <div class="lvlp-name">${esc(s.name)}</div>
    <div class="lvlp-sub">${esc(sub)}</div>
    <div class="lvlp-meta">${esc(einordnung)}</div>
    <button class="lvlp-share" onclick="lvlPlateShare(${L})" aria-label="Teilen" title="Teilen">
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M8.5 7.5 12 4l3.5 3.5"/><path d="M5 12.5V18a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 18v-5.5"/></svg>
    </button>
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
