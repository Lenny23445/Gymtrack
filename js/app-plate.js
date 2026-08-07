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

/* Der Grundkoerper ist in allen Stufen dasselbe matte schwarze Gummi wie auf
   der Vorlage (Endscheibe einer ATLETICA-Kurzhantel). Die Stufe zeigt sich
   ausschliesslich an den beiden Akzentboegen links und rechts — Ring, Schrift
   und Zahl bleiben weiss. Auf der Vorlage ist genau das die einzige Farbe.
   Ab der obersten Stufe kippt der Koerper nach hell: die Chromscheibe ist der
   sichtbare Bruch nach oben.

   koerper*  = Gummireifen aussen (Licht oben links, Kante ringsum dunkel)
   innen*    = eingelassene Flaeche in der Mitte
   ring      = umlaufende duenne Linie
   schrift   = gebogene Schrift + Zahl
   akzent    = die beiden Boegen, einziger Farbtraeger */
const PLATE_STUFEN = [
  { ab: 50, name: 'Chrom',     hell: true,
    koerperHell: '#fbfdff', koerper: '#d3dae1', koerperTief: '#8e98a3',
    innenHell: '#eef2f6', innen: '#d2d9e0', innenTief: '#aab3bd', ring: '#4b545f', schrift: '#1b2026', akzent: '#6f7a86' },
  { ab: 40, name: 'Rot',
    koerperHell: '#3d4147', koerper: '#212429', koerperTief: '#0c0e11',
    innenHell: '#34383e', innen: '#23262b', innenTief: '#141619', ring: '#e2e7ec', schrift: '#f2f5f8', akzent: '#d8453a' },
  { ab: 30, name: 'Blau',
    koerperHell: '#3d4147', koerper: '#212429', koerperTief: '#0c0e11',
    innenHell: '#34383e', innen: '#23262b', innenTief: '#141619', ring: '#e2e7ec', schrift: '#f2f5f8', akzent: '#2a6fd6' },
  { ab: 20, name: 'Gelb',
    koerperHell: '#3d4147', koerper: '#212429', koerperTief: '#0c0e11',
    innenHell: '#34383e', innen: '#23262b', innenTief: '#141619', ring: '#e2e7ec', schrift: '#f2f5f8', akzent: '#e3bb35' },
  { ab: 10, name: 'Grün',
    koerperHell: '#3d4147', koerper: '#212429', koerperTief: '#0c0e11',
    innenHell: '#34383e', innen: '#23262b', innenTief: '#141619', ring: '#e2e7ec', schrift: '#f2f5f8', akzent: '#33a558' },
  { ab: 0,  name: 'Gusseisen',
    koerperHell: '#3d4147', koerper: '#212429', koerperTief: '#0c0e11',
    innenHell: '#34383e', innen: '#23262b', innenTief: '#141619', ring: '#e2e7ec', schrift: '#f2f5f8', akzent: '#9aa3ad' }
];
function plateStufe(level){
  const L = Math.max(1, Math.round(+level || 1));
  return PLATE_STUFEN.find(s => L >= s.ab) || PLATE_STUFEN[PLATE_STUFEN.length - 1];
}

/* Jede Scheibe braucht eigene Verlaufs-IDs — zwei SVGs mit derselben ID auf
   einer Seite teilen sich sonst den ersten Verlauf, und alle Scheiben saehen
   aus wie die erste. */
let _plateNr = 0;

/* Schriftgroesse der Zahl. Zwei Faelle: mit gebogener Schrift (grosse Ansicht)
   sitzt die Zahl so gross im Ring wie das Gewicht auf der Vorlage — sie teilt
   sich den Platz mit MYGYMTRACK und LEVEL. Ohne Schrift (Pille in Liste und
   Kopfzeile) darf sie den ganzen Innenkreis fuellen; dort ist sie das Einzige,
   was gelesen wird. Dreistellige Level muessen in beiden Faellen passen. */
function _plateZahlGroesse(text, mitText){
  if (mitText) return text.length >= 3 ? 19 : text.length === 2 ? 25 : 27;
  return text.length >= 3 ? 26 : text.length === 2 ? 34 : 40;
}

/* Masse der Vorlage, alle in den 100 Einheiten des viewBox.
   Von aussen nach innen: Gummireifen bis 49.5, eingelassene Flaeche ab 40,
   duenner heller Ring bei 35.8, darin auf 30 die gebogene Schrift und die
   beiden Akzentboegen, mittig die Zahl. */
const PL = { rand: 49.5, innen: 40, ring: 35.8, bogen: 31, txtO: 28.5, txtU: 27.6, txtGr: 7.4 };
/* Halbe Laenge der Akzentboegen in Grad. Sie stehen in der Luecke zwischen den
   beiden Schriftzeilen — laenger, und ihre Enden liegen unter dem „K" von
   MYGYMTRACK. */
const PL_BOGEN_GRAD = 24;

/* Aufbau exakt nach der Vorlage (Endscheibe einer ATLETICA-Kurzhantel):
   ein dicker Reifen aus mattem schwarzem Gummi mit weicher, ringsum
   abgerundeter Kante, darin eine leicht eingelassene Flaeche, umlaufend eine
   duenne weisse Linie, oben gebogen der Markenname, unten die Zeile darunter,
   links und rechts je ein kurzer farbiger Bogen und mittig die Zahl — dort,
   wo auf der Hantel das Gewicht steht.

   Material und Licht sind das Entscheidende, nicht die Geometrie:
   - Gummi ist matt. Kein Streiflicht, keine harte Glanzkante — stattdessen ein
     breiter, weicher Schein oben links (`k`) und eine dunkle Kante ringsum
     (`v`), die den Koerper zur Kugel woelbt.
   - Unten rechts liegt ein schwacher Rueckwurf vom Untergrund (`b`); ohne ihn
     saeuft die Scheibe unten ab und wirkt flach aufgeklebt.
   - Die eingelassene Flaeche wirft oben Schatten und hat unten eine helle
     Innenkante (`e`) — genau andersherum als der Koerper, das macht sie tief.
   - Ueber allem liegt eine feine Koernung (`n`), die die Verlaeufe bricht.
     Ohne sie sieht jeder Verlauf nach Kunststoff aus, nicht nach Gummi.

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
  const zg    = _plateZahlGroesse(n, text);
  /* Koernung und weiche Schatten kosten Rechenzeit je Scheibe. In der Liste
     stehen bis zu 20 Pillen nebeneinander und bei 22 px saehe man davon
     ohnehin nichts. */
  const fein  = px >= 90;
  // Endpunkte der beiden Akzentboegen, symmetrisch zur Waagerechten
  const bog = PL_BOGEN_GRAD * Math.PI / 180;
  const bx  = (50 - PL.bogen * Math.cos(bog)).toFixed(2);
  const by1 = (50 - PL.bogen * Math.sin(bog)).toFixed(2);
  const by2 = (50 + PL.bogen * Math.sin(bog)).toFixed(2);

  return `<svg class="lvl-plate" viewBox="0 0 100 100" width="${px}" height="${px}" role="img"
    aria-label="Level ${n}" style="display:block">
    <defs>
      <!-- Gummikoerper: breiter weicher Schein oben links, matt auslaufend -->
      <radialGradient id="${id}k" cx="0.33" cy="0.24" r="0.82">
        <stop offset="0%"   stop-color="${s.koerperHell}"/>
        <stop offset="34%"  stop-color="${s.koerper}"/>
        <stop offset="100%" stop-color="${s.koerperTief}"/>
      </radialGradient>
      <!-- Kante: die Woelbung. Innen nichts, ganz aussen ein schmaler dunkler
           Saum — breit abgedunkelt saehe die Scheibe aus wie ein Reifen. -->
      <radialGradient id="${id}v" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0%"   stop-color="#000" stop-opacity="0"/>
        <stop offset="84%"  stop-color="#000" stop-opacity="0"/>
        <stop offset="95%"  stop-color="#000" stop-opacity="${s.hell ? .1 : .2}"/>
        <stop offset="100%" stop-color="#000" stop-opacity="${s.hell ? .3 : .58}"/>
      </radialGradient>
      <!-- Rueckwurf unten rechts -->
      <radialGradient id="${id}b" cx="0.72" cy="0.86" r="0.5">
        <stop offset="0%"   stop-color="#fff" stop-opacity="${s.hell ? .5 : .13}"/>
        <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
      </radialGradient>
      <!-- Eingelassene Flaeche -->
      <radialGradient id="${id}f" cx="0.36" cy="0.28" r="0.9">
        <stop offset="0%"   stop-color="${s.innenHell}"/>
        <stop offset="45%"  stop-color="${s.innen}"/>
        <stop offset="100%" stop-color="${s.innenTief}"/>
      </radialGradient>
      <!-- Innenkante der Vertiefung: oben Schatten, unten Licht -->
      <linearGradient id="${id}e" x1="0" y1="0" x2="0.25" y2="1">
        <stop offset="0%"   stop-color="#000" stop-opacity=".55"/>
        <stop offset="55%"  stop-color="#000" stop-opacity=".12"/>
        <stop offset="100%" stop-color="#fff" stop-opacity="${s.hell ? .7 : .16}"/>
      </linearGradient>
      <!-- Zahl: oben eine Spur heller, das gibt ihr Tiefe ohne Schlagschatten -->
      <linearGradient id="${id}z" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="${s.hell ? '#2b3138' : '#ffffff'}"/>
        <stop offset="100%" stop-color="${s.schrift}"/>
      </linearGradient>${fein ? `
      <filter id="${id}n" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="3" seed="7" result="t"/>
        <feColorMatrix type="saturate" values="0"/>
      </filter>
      <!-- Der Filter fuellt das Rechteck um die Scheibe, nicht die Scheibe.
           Ohne diesen Ausschnitt liegt die Koernung auch in den Ecken. -->
      <clipPath id="${id}c"><circle cx="50" cy="50" r="${PL.rand}"/></clipPath>` : ''}
    </defs>

    <!-- Koerper -->
    <circle cx="50" cy="50" r="${PL.rand}" fill="url(#${id}k)"/>
    <circle cx="50" cy="50" r="${PL.rand}" fill="url(#${id}b)"/>
    <circle cx="50" cy="50" r="${PL.rand}" fill="url(#${id}v)"/>

    <!-- Eingelassene Flaeche mit Stufe zum Reifen -->
    <circle cx="50" cy="50" r="${PL.innen}" fill="url(#${id}f)"/>
    <circle cx="50" cy="50" r="${PL.innen + .35}" fill="none" stroke="#000"
      stroke-width="1.1" opacity="${s.hell ? .22 : .5}"/>
    <circle cx="50" cy="50" r="${PL.innen - .6}" fill="none" stroke="url(#${id}e)" stroke-width="1.6"/>

    <!-- Umlaufende Linie -->
    <circle cx="50" cy="50" r="${PL.ring}" fill="none" stroke="${s.ring}" stroke-width="1.25" opacity=".95"/>

    <!-- Akzentboegen links und rechts: das Erkennungszeichen der Vorlage,
         hier traegt es die Stufenfarbe. -->
    <path d="M ${bx} ${by2} A ${PL.bogen} ${PL.bogen} 0 0 1 ${bx} ${by1}" fill="none" stroke="${s.akzent}"
      stroke-width="2.6" stroke-linecap="round"/>
    <path d="M ${100 - bx} ${by1} A ${PL.bogen} ${PL.bogen} 0 0 1 ${100 - bx} ${by2}" fill="none" stroke="${s.akzent}"
      stroke-width="2.6" stroke-linecap="round"/>

    ${text ? `
    <path id="${id}o" d="M ${50 - PL.txtO} 50 A ${PL.txtO} ${PL.txtO} 0 0 1 ${50 + PL.txtO} 50" fill="none"/>
    <path id="${id}u" d="M ${50 - PL.txtU} 50 A ${PL.txtU} ${PL.txtU} 0 0 0 ${50 + PL.txtU} 50" fill="none"/>
    <text font-size="${PL.txtGr}" font-weight="700" letter-spacing="1" text-anchor="middle"
      fill="${s.schrift}" style="font-family:inherit">
      <textPath href="#${id}o" startOffset="50%">MYGYMTRACK</textPath>
    </text>
    <text font-size="${PL.txtGr}" font-weight="700" letter-spacing="3.2" text-anchor="middle"
      fill="${s.schrift}" style="font-family:inherit">
      <textPath href="#${id}u" startOffset="50%">LEVEL</textPath>
    </text>` : ''}

    <!-- Zahl: heller Koerper mit duenner dunkler Kontur, wie das Gewicht auf
         der Vorlage. Die Kontur setzt sie von der Flaeche ab, ohne dass sie
         nach Aufkleber aussieht. -->
    <text x="50" y="50" text-anchor="middle" dominant-baseline="central"
      font-size="${zg}" font-weight="800" fill="url(#${id}z)"
      stroke="${s.hell ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.42)'}" stroke-width="${zg * .03}"
      style="font-family:inherit;letter-spacing:${text ? '-.5' : '-1'}px;paint-order:stroke fill">${n}</text>
    ${fein ? `<g clip-path="url(#${id}c)" pointer-events="none">
      <rect x="0" y="0" width="100" height="100" filter="url(#${id}n)"
        opacity="${s.hell ? .1 : .085}" style="mix-blend-mode:overlay"/>
    </g>` : ''}
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
  /* Dieselben 100 Einheiten wie im SVG, nur um 8 % geschrumpft: das PNG
     braucht Luft am Rand, sonst klebt die Scheibe an der Bildkante. */
  const mitte = px / 2;
  const m = px / 100 * .92;
  const M = (v) => v * m;                       // Laenge in Bildpunkten
  const X = (v) => mitte + (v - 50) * m;        // Koordinate

  // Dunkler Hintergrund, damit das PNG auch auf hellen Zeitleisten steht.
  const bg = c.createLinearGradient(0, 0, 0, px);
  bg.addColorStop(0, '#15181c');
  bg.addColorStop(1, '#0a0c0e');
  c.fillStyle = bg; c.fillRect(0, 0, px, px);

  const kreis = (r, fill, stroke, sw, alpha) => {
    c.beginPath(); c.arc(mitte, mitte, M(r), 0, Math.PI * 2);
    c.globalAlpha = alpha == null ? 1 : alpha;
    if (fill)   { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = M(sw || 1); c.stroke(); }
    c.globalAlpha = 1;
  };
  /* Radialverlauf wie im SVG: cx/cy sind Anteile der Scheibenbreite, r ist der
     Anteil, bei dem der letzte Farbstopp sitzt. */
  const strahl = (cx, cy, r, stops) => {
    const d = M(PL.rand * 2);
    const g = c.createRadialGradient(X(0) + d * cx, X(0) + d * cy, 0,
                                     X(0) + d * cx, X(0) + d * cy, d * r);
    stops.forEach(([off, col]) => g.addColorStop(off, col));
    return g;
  };

  // Gummikoerper: weicher Schein oben links, Rueckwurf unten rechts, dunkle Kante
  kreis(PL.rand, strahl(.33, .24, .82, [[0, s.koerperHell], [.34, s.koerper], [1, s.koerperTief]]));
  kreis(PL.rand, strahl(.72, .86, .5, [
    [0, 'rgba(255,255,255,' + (s.hell ? .5 : .13) + ')'], [1, 'rgba(255,255,255,0)']]));
  kreis(PL.rand, strahl(.5, .5, .5, [
    [0, 'rgba(0,0,0,0)'], [.84, 'rgba(0,0,0,0)'],
    [.95, 'rgba(0,0,0,' + (s.hell ? .1 : .2) + ')'],
    [1,   'rgba(0,0,0,' + (s.hell ? .3 : .58) + ')']]));

  // Eingelassene Flaeche mit Stufe zum Reifen
  kreis(PL.innen, strahl(.36, .28, .9, [[0, s.innenHell], [.45, s.innen], [1, s.innenTief]]));
  kreis(PL.innen + .35, null, '#000', 1.1, s.hell ? .22 : .5);
  const kante = c.createLinearGradient(X(50 - PL.innen), X(50 - PL.innen),
                                       X(50 - PL.innen) + M(PL.innen * .5), X(50 + PL.innen));
  kante.addColorStop(0, 'rgba(0,0,0,.55)');
  kante.addColorStop(.55, 'rgba(0,0,0,.12)');
  kante.addColorStop(1, 'rgba(255,255,255,' + (s.hell ? .7 : .16) + ')');
  kreis(PL.innen - .6, null, kante, 1.6);

  // Umlaufende Linie
  kreis(PL.ring, null, s.ring, 1.25, .95);

  // Akzentboegen links und rechts
  const bog = PL_BOGEN_GRAD / 180;
  c.strokeStyle = s.akzent; c.lineWidth = M(2.6); c.lineCap = 'round';
  [[Math.PI * (1 - bog), Math.PI * (1 + bog)], [Math.PI * -bog, Math.PI * bog]].forEach(([a, b]) => {
    c.beginPath(); c.arc(mitte, mitte, M(PL.bogen), a, b); c.stroke();
  });

  // Gebogene Schrift oben und unten — Buchstabe fuer Buchstabe gedreht
  const bogen = (txt, radius, groesse, sperrung, unten) => {
    c.save();
    c.translate(mitte, mitte);
    c.fillStyle = s.schrift;
    c.font = '700 ' + Math.round(M(groesse)) + 'px -apple-system, system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    /* Schrittweite je Zeichen aus der tatsaechlichen Breite — bei fester
       Breite je Buchstabe liefe „MYGYMTRACK" (M breit, R schmal) auseinander. */
    const br = txt.split('').map(ch => c.measureText(ch).width / m + sperrung);
    const ges = br.reduce((a, b) => a + b, 0);
    let lauf = -ges / 2;
    txt.split('').forEach((ch, i) => {
      const t = (lauf + br[i] / 2) / radius;
      lauf += br[i];
      /* Nach dem Drehen zeigt die lokale y-Achse nach aussen, der Buchstabe
         steht also von selbst mit dem Kopf zur Mitte — oben wie unten. Eine
         zusaetzliche Drehung um 180° stellt die untere Zeile auf den Kopf. */
      c.save();
      c.rotate(unten ? -t : t);
      c.translate(0, unten ? M(radius) : -M(radius));
      c.fillText(ch, 0, 0);
      c.restore();
    });
    c.restore();
  };
  bogen('MYGYMTRACK', PL.txtO, PL.txtGr, 1, false);
  bogen('LEVEL',      PL.txtU, PL.txtGr, 3.2, true);

  // Zahl mittig: heller Koerper mit dunkler Kontur
  const zg = _plateZahlGroesse(n, true);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = '800 ' + Math.round(M(zg)) + 'px -apple-system, system-ui, sans-serif';
  c.lineWidth = M(zg * .03); c.lineJoin = 'round';
  c.strokeStyle = s.hell ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.42)';
  c.strokeText(n, mitte, mitte);
  const zf = c.createLinearGradient(0, mitte - M(zg / 2), 0, mitte + M(zg / 2));
  zf.addColorStop(0, s.hell ? '#2b3138' : '#ffffff');
  zf.addColorStop(1, s.schrift);
  c.fillStyle = zf;
  c.fillText(n, mitte, mitte);

  /* Koernung zum Schluss: bricht die Verlaeufe, sonst wirkt alles nach
     Kunststoff. Gekachelt, nicht gestreckt — auf 1080 px hochgezogen waere aus
     dem feinen Korn ein grobes Wolkenmuster geworden. `overlay` haelt die
     Helligkeit; flach darueber gelegt liegt sonst ein grauer Schleier auf der
     Scheibe. */
  c.save();
  c.beginPath(); c.arc(mitte, mitte, M(PL.rand), 0, Math.PI * 2); c.clip();
  c.globalCompositeOperation = 'overlay';
  c.globalAlpha = .09;
  c.fillStyle = c.createPattern(_plateKorn(), 'repeat');
  c.fillRect(0, 0, px, px);
  c.restore();
  c.globalAlpha = 1;

  return cv;
}

/* Koernungs-Kachel fuer den Canvas-Zwilling. Das SVG nimmt dafuer
   feTurbulence; auf dem Canvas gibt es das nicht, also einmal ein Rauschbild
   erzeugen und wiederverwenden — je Scheibe neu waere bei 1080 px spuerbar. */
let _plateKornCv = null;
function _plateKorn(){
  if (_plateKornCv) return _plateKornCv;
  const k = 160;
  const cv = document.createElement('canvas');
  cv.width = cv.height = k;
  const c = cv.getContext('2d');
  const bild = c.createImageData(k, k);
  for (let i = 0; i < bild.data.length; i += 4){
    const v = 110 + Math.random() * 90;
    bild.data[i] = bild.data[i + 1] = bild.data[i + 2] = v;
    bild.data[i + 3] = 255;
  }
  c.putImageData(bild, 0, 0);
  _plateKornCv = cv;
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
    ${L < max ? `<div class="lvlp-next">
      <span>Level ${L + 1}</span>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
    </div>` : ''}
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
