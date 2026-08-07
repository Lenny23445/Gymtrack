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
const PLATE_MATS = [
  { key: 'gold',   name: 'Gold',     ab: 100, metall: true,
    glanz: '#fffbea', mitte: '#c99a2c', tief: '#4a3106',
    innenGlanz: '#fff3c4', innenMitte: '#b88922', innenTief: '#3d2705',
    ring: '#7d5a17', schrift: '#6b4c12', schriftTief: '#432f08', akzent: '#fff0b8',
    korn: { bf: '2.6', okt: 2, tiefe: .7, staerke: .12 } },
  { key: 'silber', name: 'Silber',   ab: 50, metall: true,
    glanz: '#ffffff', mitte: '#a4adb6', tief: '#3c4249',
    innenGlanz: '#fbfcfd', innenMitte: '#98a1aa', innenTief: '#343a40',
    ring: '#5a626a', schrift: '#464d54', schriftTief: '#2b3036', akzent: '#ffffff',
    korn: { bf: '2.6', okt: 2, tiefe: .7, staerke: .12 } },
  { key: 'bronze', name: 'Bronze',   ab: 30, metall: true,
    glanz: '#fff0dc', mitte: '#a96329', tief: '#3f2007',
    innenGlanz: '#f9ddbb', innenMitte: '#9a5824', innenTief: '#351b06',
    ring: '#6b4020', schrift: '#5a3418', schriftTief: '#38200d', akzent: '#ffe2ba',
    korn: { bf: '2.6', okt: 2, tiefe: .7, staerke: .12 } },
  { key: 'standard', name: 'Standard', ab: 0,
    koerperHell: '#3d4147', koerper: '#212429', koerperTief: '#0c0e11',
    innenHell: '#34383e', innen: '#23262b', innenTief: '#141619',
    ring: '#e2e7ec', schrift: '#f2f5f8', schriftTief: '#aeb6bf', akzent: null,
    korn: { bf: '3.4', okt: 2, tiefe: 1.2, staerke: .3 } }
];
const PLATE_MAT_WAHL = 'gt_plateMat';

/* Welche Materialien hat dieses Level freigeschaltet — von unten nach oben. */
function plateMatsFrei(level){
  const L = Math.max(1, Math.round(+level || 1));
  return PLATE_MATS.filter(m => L >= m.ab).sort((a, b) => a.ab - b.ab);
}

/* Gewaehltes Material. Die Wahl liegt bewusst nur lokal (localStorage), nicht
   im users-Doc: ein neues Cloud-Feld muesste erst in die hasOnly-Liste der
   Firestore-Rules, sonst schlaegt der KOMPLETTE users-Push mit
   permission-denied fehl. Vorgabe ist das hoechste freigeschaltete Material —
   wer Bronze erreicht, soll es auch sehen, ohne es erst zu suchen. */
function plateMat(level, wahl){
  const frei = plateMatsFrei(level);
  const k = wahl || (() => { try { return localStorage.getItem(PLATE_MAT_WAHL); } catch(e){ return null; } })();
  return frei.find(m => m.key === k) || frei[frei.length - 1];
}

/* Akzentfarbe des Standardmaterials: die Akzentfarbe der App. Damit traegt die
   Scheibe das Thema mit (hell, rosa, dunkel, blau, Premium-Themes) statt einer
   eigenen, zweiten Farbwelt. Metallscheiben faerben ihren Akzent selbst. */
function _plateAkzent(){
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim();
    if (v) return v;
  } catch(e){}
  return '#2a6fd6';
}

/* ── Metall ──────────────────────────────────────────────────────────────
   Vorlage ist eine polierte Metallkugel: kein gleichmaessiger Verlauf und
   keine Strahlen, sondern wenige weiche Lichtflecken auf einem dunkleren
   Grund — das Bild der Umgebung, das sich in der Oberflaeche spiegelt.

   Zwei Anlaeufe davor lagen daneben. Ein Baenderverlauf quer ueber die
   Scheibe sah nach Holzmaserung aus (alle Baender in derselben Richtung), ein
   Faecher aus Keilen nach Speichenrad (Strahlen, die in der Mitte spitz
   zusammenlaufen). Poliertes Metall hat weder das eine noch das andere.

   Jeder Reflex ist ein eigener Radialverlauf, der als voller Kreis gemalt
   wird — die Form macht der Verlauf, nicht die Geometrie. Damit bleibt alles
   ohne Ausschnitt innerhalb der Scheibe. */
function _plateMix(a, b, t){
  const h = (c) => [1, 3, 5].map(i => parseInt(c.substr(i, 2), 16));
  const A = h(a), B = h(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/* Lage der Reflexe, gemeinsam fuer SVG und Canvas. cx/cy/r sind Anteile der
   Scheibenbreite, `ton` waehlt Glanz oder Tiefe, `a` die Deckkraft. */
const PL_REFLEXE = [
  { cx: .33, cy: .22, r: .36, ton: 'glanz', a: .95 },  // Hauptlicht oben links
  { cx: .29, cy: .19, r: .12, ton: 'glanz', a: 1 },    // sein harter Kern
  { cx: .70, cy: .15, r: .20, ton: 'glanz', a: .85 },  // zweites Licht oben rechts
  { cx: .18, cy: .62, r: .26, ton: 'tief',  a: .6 },   // Schattenzone links unten
  { cx: .78, cy: .70, r: .30, ton: 'tief',  a: .55 },  // Schattenzone rechts unten
  { cx: .52, cy: .95, r: .28, ton: 'glanz', a: .5 }    // Rueckwurf vom Untergrund
];

/* Verlaufs-Definitionen eines Metallstuecks. `pre` haelt Koerper und
   Innenflaeche auseinander, sonst teilten sie sich dieselben IDs. */
function _plateSpiegelDefs(id, pre, glanz, mitte, tief){
  const basis = `<linearGradient id="${id}${pre}b" x1="0.2" y1="0" x2="0.78" y2="1">
      <stop offset="0%"   stop-color="${_plateMix(glanz, mitte, .35)}"/>
      <stop offset="30%"  stop-color="${mitte}"/>
      <stop offset="62%"  stop-color="${_plateMix(mitte, tief, .5)}"/>
      <stop offset="100%" stop-color="${tief}"/>
    </linearGradient>`;
  return basis + PL_REFLEXE.map((f, i) => `<radialGradient id="${id}${pre}${i}" cx="${f.cx}" cy="${f.cy}" r="${f.r}">
      <stop offset="0%"   stop-color="${f.ton === 'glanz' ? glanz : tief}" stop-opacity="${f.a}"/>
      <stop offset="42%"  stop-color="${f.ton === 'glanz' ? glanz : tief}" stop-opacity="${(f.a * .38).toFixed(2)}"/>
      <stop offset="100%" stop-color="${f.ton === 'glanz' ? glanz : tief}" stop-opacity="0"/>
    </radialGradient>`).join('');
}

/* Hexfarbe mit Deckkraft. Canvas-Verlaeufe brauchen rgba(); ein Hex mit
   Alpha-Suffix versteht nicht jede WebView. */
function _plateRgba(hex, a){
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16));
  return `rgba(${r},${g},${b},${(+a).toFixed(3)})`;
}

/* Die Kreise dazu — Grundton zuerst, dann die Reflexe uebereinander. */
function _plateSpiegel(id, pre, r){
  return `<circle cx="50" cy="50" r="${r}" fill="url(#${id}${pre}b)"/>`
    + PL_REFLEXE.map((f, i) => `<circle cx="50" cy="50" r="${r}" fill="url(#${id}${pre}${i})"/>`).join('');
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

/* Die Zahl steht nicht mehr mittig — dort sitzt die Bohrung. Sie wird auf
   beide Seiten verteilt, wie das Gewicht um das Loch einer echten Scheibe:
   37 wird zu 3 | 7.

   Einstellige Level bekommen eine fuehrende Null (7 -> 0 | 7). Ohne sie
   stuende auf einer Seite nichts und die Scheibe waere sichtbar schief.

   Dreistellige teilen 1 | 2 (100 -> 1 | 00). Andersherum (10 | 3) stand der
   breite Block links und der schmale rechts — die Scheibe kippte sichtbar zur
   Seite, und die Ziffern links wurden so schmal, dass sie nicht mehr zu den
   anderen Stufen passten. */
function _plateZahlTeilen(n){
  const t = n.length === 1 ? '0' + n : n;
  const links = Math.floor(t.length / 2);
  return [t.slice(0, links), t.slice(links)];
}

/* Masse der Vorlage, alle in den 100 Einheiten des viewBox.
   Von aussen nach innen: Gummireifen bis 49.5, eingelassene Flaeche ab 40,
   duenner heller Ring bei 35.8, darin auf 30 die gebogene Schrift und die
   beiden Akzentboegen, mittig die Zahl. */
const PL = { rand: 49.5, innen: 40, ring: 35.8, bogen: 31, txtO: 28.5, txtU: 27.6, txtGr: 7.4,
             loch: 8.2, buchse: 10.8, zahlX: 21.5 };
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
  const s     = plateMat(level, o.mat);
  const akz   = s.akzent || _plateAkzent();
  // Metall ist ein heller Untergrund — Schatten, Kanten und Konturen brauchen
  // dort andere Staerken als das schwarze Gummi.
  const hell  = !!s.metall;
  const n     = String(Math.max(1, Math.round(+level || 1)));
  const id    = 'pl' + (++_plateNr);
  const gross = px >= 120;
  const text  = gross && o.label !== false;
  const zg    = _plateZahlGroesse(n, text);   // mit Bohrung unten neu gesetzt
  /* Koernung und weiche Schatten kosten Rechenzeit je Scheibe. In der Liste
     stehen bis zu 20 Pillen nebeneinander und bei 22 px saehe man davon
     ohnehin nichts. */
  const fein  = px >= 90;
  /* Bohrung und die auf beide Seiten verteilte Zahl gibt es nur in der grossen
     Ansicht. In der 22-px-Pille stuenden links und rechts eines Lochs zwei
     Ziffern von je 4 px — dort bleibt die Zahl gross in der Mitte. */
  /* Ab Level 100 keine Bohrung: dreistellig ginge nur als 1 | 00, und das
     stand schief. Die hoechste Stufe traegt ihre Zahl mittig — sie ist ohnehin
     der Bruch nach oben. */
  const loch  = fein && +n < 100;
  const [zLinks, zRechts] = _plateZahlTeilen(n);
  /* Neben der Bohrung steht je Seite nur eine Ziffer — die darf groesser sein
     als die ganze Zahl in der Mitte. Erst ab zwei Ziffern je Seite (Level ab
     1000) muss sie zurueck. */
  const zgr = loch ? (Math.max(zLinks.length, zRechts.length) > 1 ? 16 : 23)
                   : (text ? _plateZahlGroesse(n, true) : zg);
  // Endpunkte der beiden Akzentboegen, symmetrisch zur Waagerechten
  const bog = PL_BOGEN_GRAD * Math.PI / 180;
  const bx  = (50 - PL.bogen * Math.cos(bog)).toFixed(2);
  const by1 = (50 - PL.bogen * Math.sin(bog)).toFixed(2);
  const by2 = (50 + PL.bogen * Math.sin(bog)).toFixed(2);

  return `<svg class="lvl-plate" viewBox="0 0 100 100" width="${px}" height="${px}" role="img"
    aria-label="Level ${n}" style="display:block">
    <defs>
      ${s.metall ? _plateSpiegelDefs(id, 'k', s.glanz, s.mitte, s.tief)
                 + _plateSpiegelDefs(id, 'f', s.innenGlanz, s.innenMitte, s.innenTief) : ''}
      <!-- Koerper. Gummi: breiter weicher Schein oben links, matt auslaufend.
           Metall: schmale Baender quer ueber die Scheibe — die abrupten
           Wechsel hell/dunkel sind das, was ein Auge als Metall liest, ein
           weicher Verlauf bliebe farbiger Lack. -->
      ${s.metall ? '' : `<radialGradient id="${id}k" cx="0.33" cy="0.24" r="0.82">
        <stop offset="0%"   stop-color="${s.koerperHell}"/>
        <stop offset="34%"  stop-color="${s.koerper}"/>
        <stop offset="100%" stop-color="${s.koerperTief}"/>
      </radialGradient>`}
      <!-- Kante: die Woelbung. Innen nichts, ganz aussen ein schmaler dunkler
           Saum — breit abgedunkelt saehe die Scheibe aus wie ein Reifen. -->
      <radialGradient id="${id}v" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0%"   stop-color="#000" stop-opacity="0"/>
        <stop offset="84%"  stop-color="#000" stop-opacity="0"/>
        <stop offset="93%"  stop-color="#000" stop-opacity="${hell ? .1 : .26}"/>
        <stop offset="100%" stop-color="#000" stop-opacity="${hell ? .34 : .58}"/>
      </radialGradient>
      <!-- Rueckwurf unten rechts -->
      <radialGradient id="${id}b" cx="0.74" cy="0.92" r="0.42">
        <stop offset="0%"   stop-color="#fff" stop-opacity="${hell ? .16 : .07}"/>
        <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
      </radialGradient>
      <!-- Eingelassene Flaeche. Beim Metall laufen die Baender andersherum als
           auf dem Koerper — dieselbe Richtung liesse Reifen und Flaeche zu
           einem Stueck verschmelzen. -->
      ${s.metall ? '' : `<radialGradient id="${id}f" cx="0.36" cy="0.28" r="0.9">
        <stop offset="0%"   stop-color="${s.innenHell}"/>
        <stop offset="45%"  stop-color="${s.innen}"/>
        <stop offset="100%" stop-color="${s.innenTief}"/>
      </radialGradient>`}
      <!-- Innenkante der Vertiefung: oben Schatten, unten Licht -->
      <linearGradient id="${id}e" x1="0" y1="0" x2="0.25" y2="1">
        <stop offset="0%"   stop-color="#000" stop-opacity=".55"/>
        <stop offset="55%"  stop-color="#000" stop-opacity=".12"/>
        <stop offset="100%" stop-color="#fff" stop-opacity="${hell ? .45 : .16}"/>
      </linearGradient>
      <!-- Zahl: oben eine Spur heller, das gibt ihr Tiefe ohne Schlagschatten -->
      <linearGradient id="${id}z" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="${s.metall ? s.schrift : '#ffffff'}"/>
        <stop offset="100%" stop-color="${s.metall ? s.schriftTief : s.schrift}"/>
      </linearGradient>
      <!-- Metallbuchse in der Bohrung: harte Wechsel hell/dunkel, das macht
           den Chromeindruck. Ein weicher Verlauf saehe nach grauem Lack aus. -->
      <linearGradient id="${id}m" x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0%"   stop-color="#fdfefe"/>
        <stop offset="18%"  stop-color="#aeb6be"/>
        <stop offset="34%"  stop-color="#f0f3f6"/>
        <stop offset="52%"  stop-color="#7c848d"/>
        <stop offset="70%"  stop-color="#dde2e7"/>
        <stop offset="86%"  stop-color="#69707a"/>
        <stop offset="100%" stop-color="#c3cad1"/>
      </linearGradient>
      <!-- Bohrung: der Blick in den Kanal, unten heller als oben -->
      <radialGradient id="${id}l" cx="0.5" cy="0.72" r="0.75">
        <stop offset="0%"   stop-color="#2a2f35"/>
        <stop offset="60%"  stop-color="#14171a"/>
        <stop offset="100%" stop-color="#050607"/>
      </radialGradient>
      <!-- Schattenkante im Kanal. Frueher war das ein Halbkreis-Pfad von links
           nach rechts: seine beiden stumpfen Enden sassen genau auf der
           Waagerechten und waren als deutlicher Absatz zu sehen — die Bohrung
           zerfiel optisch in zwei Halbkreise. Jetzt laeuft der Schatten als
           voller Ring rundum und verliert sich nach unten im Verlauf. -->
      <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="#000" stop-opacity=".62"/>
        <stop offset="34%"  stop-color="#000" stop-opacity=".38"/>
        <stop offset="66%"  stop-color="#000" stop-opacity=".14"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0"/>
      </linearGradient>${fein ? `
      <!-- Koernung. Sie liegt NICHT als eigenes Element mit
           mix-blend-mode darueber — das ignoriert die WKWebView, in der App
           war davon nichts zu sehen. Statt dessen mischt der Filter das
           Rauschen selbst ueber den Koerper (feBlend), und feComposite
           schneidet das Ergebnis wieder auf die Scheibe zurecht; ohne das
           bliebe das Rauschquadrat des Filterbereichs stehen. -->
      <!-- color-interpolation-filters="sRGB" ist Pflicht: per Vorgabe rechnen
           SVG-Filter in linearRGB, und dort uebersteuert der Overlay auf dem
           dunklen Gummi so sehr, dass die Scheibe wie Schleifpapier aussieht. -->
      <!-- Das Rauschen wird nicht direkt eingefaerbt, sondern als Hoehenkarte
           beleuchtet (feDiffuseLighting). Flach eingeblendetes Rauschen bleibt
           Bildrauschen; erst Licht aus derselben Richtung wie auf der ganzen
           Scheibe (oben links) macht daraus Poren, die man als Oberflaeche
           liest. Beim Metall ist das Rauschen quer gestreckt
           (baseFrequency "0.012 2.6") — das ergibt den feinen Schliff. -->
      <filter id="${id}n" x="-1%" y="-1%" width="102%" height="102%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="${s.korn.bf}" numOctaves="${s.korn.okt}" seed="7" result="t"/>
        <feDiffuseLighting in="t" surfaceScale="${s.korn.tiefe}" diffuseConstant="1"
          lighting-color="#ffffff" result="li">
          <feDistantLight azimuth="135" elevation="55"/>
        </feDiffuseLighting>
        <feColorMatrix in="li" type="saturate" values="0" result="lg"/>
        <!-- Relief um Mittelgrau zusammenstauchen: overlay laesst 0.5
             unveraendert, der Rest hellt auf oder dunkelt ab. Voller Umfang
             waere eine Mondlandschaft, kein Gummi. -->
        <feComponentTransfer in="lg" result="k">
          <feFuncR type="linear" slope="${s.korn.staerke}" intercept="${(.5 - s.korn.staerke / 2).toFixed(3)}"/>
          <feFuncG type="linear" slope="${s.korn.staerke}" intercept="${(.5 - s.korn.staerke / 2).toFixed(3)}"/>
          <feFuncB type="linear" slope="${s.korn.staerke}" intercept="${(.5 - s.korn.staerke / 2).toFixed(3)}"/>
          <feFuncA type="linear" slope="0" intercept="1"/>
        </feComponentTransfer>
        <!-- Multiplikativ statt feBlend mode="overlay": overlay hellte in der
             WKWebView so stark auf, dass aus dem schwarzen Gummi ein
             mittelgrauer Reifen wurde (in Chrome sah dieselbe Datei richtig
             aus). arithmetic mit k1=2 rechnet Farbe x 2 x Relief — Relief 0.5
             laesst die Farbe unveraendert, hell und dunkel modulieren sie um
             denselben Betrag nach oben und unten. -->
        <feComposite in="SourceGraphic" in2="k" operator="arithmetic" k1="2" k2="0" k3="0" k4="0" result="b"/>
        <feComposite in="b" in2="SourceGraphic" operator="in"/>
      </filter>
      <!-- Der Filterbereich ist ein RECHTECK, und die WKWebView gibt ihn auch
           als solches zurueck: das Ergebnis kam dort mit voller Deckkraft ueber
           die ganze Kachel, statt nur ueber der Scheibe. Auf der Scheibe selbst
           faellt das nicht auf (darueber liegen Ring, Schrift, Zahl), wohl aber
           im Schlagschatten — der rechnet aus dem Alphakanal, und so lag hinter
           der runden Scheibe ein schwarzes Viereck. clip-path greift NACH dem
           Filter und schneidet dessen Ergebnis wieder rund. -->
      <clipPath id="${id}c"><circle cx="50" cy="50" r="${PL.rand}"/></clipPath>` : ''}
    </defs>

    <!-- Koerper und eingelassene Flaeche. Beides zusammen durch den
         Koernungsfilter — Ring, Schrift und Zahl bleiben glatt, gekoernt ist
         nur das Gummi. -->
    <g${fein ? ` filter="url(#${id}n)" clip-path="url(#${id}c)"` : ''}>
      ${s.metall ? _plateSpiegel(id, 'k', PL.rand)
                 : `<circle cx="50" cy="50" r="${PL.rand}" fill="url(#${id}k)"/>`}
      <circle cx="50" cy="50" r="${PL.rand}" fill="url(#${id}b)"/>
      <circle cx="50" cy="50" r="${PL.rand}" fill="url(#${id}v)"/>
      ${s.metall ? _plateSpiegel(id, 'f', PL.innen)
                 : `<circle cx="50" cy="50" r="${PL.innen}" fill="url(#${id}f)"/>`}
      <circle cx="50" cy="50" r="${PL.innen + .35}" fill="none" stroke="#000"
        stroke-width="1.1" opacity="${hell ? .3 : .5}"/>
      <circle cx="50" cy="50" r="${PL.innen - .6}" fill="none" stroke="url(#${id}e)" stroke-width="1.6"/>
    </g>

    <!-- Umlaufende Linie -->
    <circle cx="50" cy="50" r="${PL.ring}" fill="none" stroke="${s.ring}" stroke-width="1.25" opacity=".95"/>

    <!-- Akzentboegen links und rechts: das Erkennungszeichen der Vorlage,
         hier traegt es die Stufenfarbe. -->
    <path d="M ${bx} ${by2} A ${PL.bogen} ${PL.bogen} 0 0 1 ${bx} ${by1}" fill="none" stroke="${akz}"
      stroke-width="2.6" stroke-linecap="round"/>
    <path d="M ${100 - bx} ${by1} A ${PL.bogen} ${PL.bogen} 0 0 1 ${100 - bx} ${by2}" fill="none" stroke="${akz}"
      stroke-width="2.6" stroke-linecap="round"/>

    ${text ? `
    <path id="${id}o" d="M ${50 - PL.txtO} 50 A ${PL.txtO} ${PL.txtO} 0 0 1 ${50 + PL.txtO} 50" fill="none"/>
    <path id="${id}u" d="M ${50 - PL.txtU} 50 A ${PL.txtU} ${PL.txtU} 0 0 0 ${50 + PL.txtU} 50" fill="none"/>
    <text font-size="${PL.txtGr}" font-weight="700" letter-spacing="1" text-anchor="middle"
      fill="${s.metall ? `url(#${id}z)` : s.schrift}"${s.metall ? ` stroke="rgba(255,255,255,.5)" stroke-width=".55"` : ''}
      style="font-family:inherit;paint-order:stroke fill">
      <textPath href="#${id}o" startOffset="50%">MYGYMTRACK</textPath>
    </text>
    <text font-size="${PL.txtGr}" font-weight="700" letter-spacing="3.2" text-anchor="middle"
      fill="${s.metall ? `url(#${id}z)` : s.schrift}"${s.metall ? ` stroke="rgba(255,255,255,.5)" stroke-width=".55"` : ''}
      style="font-family:inherit;paint-order:stroke fill">
      <textPath href="#${id}u" startOffset="50%">LEVEL</textPath>
    </text>` : ''}

    ${loch ? `
    <!-- Bohrung mit Metallbuchse -->
    <circle cx="50" cy="50" r="${PL.buchse}" fill="url(#${id}m)"/>
    <circle cx="50" cy="50" r="${PL.buchse}" fill="none" stroke="#000" stroke-width=".9" opacity=".45"/>
    <circle cx="50" cy="50" r="${PL.loch}" fill="url(#${id}l)"/>
    <!-- Schattenkante oben im Kanal: ohne sie sieht das Loch aus wie ein
         schwarzer Punkt statt wie eine Oeffnung. Voller Ring mit auslaufendem
         Verlauf (s. ${id}s) — kein abgehacktes Bogenende mehr. -->
    <circle cx="50" cy="50" r="${PL.loch}" fill="none" stroke="url(#${id}s)" stroke-width="1.9"/>` : ''}

    <!-- Zahl: heller Koerper mit duenner dunkler Kontur, wie das Gewicht auf
         der Vorlage. Bei Bohrung steht sie links und rechts davon. -->
    ${loch ? `
    <text x="${50 - PL.zahlX}" y="50" text-anchor="middle" dominant-baseline="central"
      font-size="${zgr}" font-weight="800" fill="url(#${id}z)"
      stroke="${hell ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.45)'}" stroke-width="${zgr * .03}"
      style="font-family:inherit;letter-spacing:-.5px;paint-order:stroke fill">${zLinks}</text>
    <text x="${50 + PL.zahlX}" y="50" text-anchor="middle" dominant-baseline="central"
      font-size="${zgr}" font-weight="800" fill="url(#${id}z)"
      stroke="${hell ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.45)'}" stroke-width="${zgr * .03}"
      style="font-family:inherit;letter-spacing:-.5px;paint-order:stroke fill">${zRechts}</text>` : `
    <text x="50" y="50" text-anchor="middle" dominant-baseline="central"
      font-size="${zg}" font-weight="800" fill="url(#${id}z)"
      stroke="${hell ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.45)'}" stroke-width="${zg * .03}"
      style="font-family:inherit;letter-spacing:-1px;paint-order:stroke fill">${n}</text>`}
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
function _lvlPlateCanvas(level, size, mat){
  const px = size || 1080;
  const s  = plateMat(level, mat);
  const akz = s.akzent || _plateAkzent();
  const hell = !!s.metall;
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

  /* Spiegelnde Metallflaeche wie im SVG: Grundton plus weiche Lichtflecken. */
  const spiegel = (r, glanz, mitteF, tief) => {
    const d = M(r * 2);
    const g0 = c.createLinearGradient(X(50 - r) + d * .2, X(50 - r), X(50 - r) + d * .78, X(50 + r));
    g0.addColorStop(0, _plateMix(glanz, mitteF, .35));
    g0.addColorStop(.3, mitteF);
    g0.addColorStop(.62, _plateMix(mitteF, tief, .5));
    g0.addColorStop(1, tief);
    kreis(r, g0);
    PL_REFLEXE.forEach(f => {
      const col = f.ton === 'glanz' ? glanz : tief;
      const cx = X(50 - r) + d * f.cx, cy = X(50 - r) + d * f.cy;
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, d * f.r);
      g.addColorStop(0, _plateRgba(col, f.a));
      g.addColorStop(.42, _plateRgba(col, f.a * .38));
      g.addColorStop(1, _plateRgba(col, 0));
      kreis(r, g);
    });
  };

  // Koerper: Gummi mit weichem Schein, Metall mit Spiegelungen
  if (s.metall) spiegel(PL.rand, s.glanz, s.mitte, s.tief);
  else kreis(PL.rand, strahl(.33, .24, .82, [[0, s.koerperHell], [.34, s.koerper], [1, s.koerperTief]]));
  kreis(PL.rand, strahl(.72, .86, .5, [
    [0, 'rgba(255,255,255,' + (hell ? .16 : .07) + ')'], [1, 'rgba(255,255,255,0)']]));
  kreis(PL.rand, strahl(.5, .5, .5, [
    [0, 'rgba(0,0,0,0)'], [.84, 'rgba(0,0,0,0)'],
    [.95, 'rgba(0,0,0,' + (hell ? .08 : .2) + ')'],
    [1,   'rgba(0,0,0,' + (hell ? .34 : .58) + ')']]));

  // Eingelassene Flaeche mit Stufe zum Reifen
  if (s.metall) spiegel(PL.innen, s.innenGlanz, s.innenMitte, s.innenTief);
  else kreis(PL.innen, strahl(.36, .28, .9, [[0, s.innenHell], [.45, s.innen], [1, s.innenTief]]));
  kreis(PL.innen + .35, null, '#000', 1.1, hell ? .3 : .5);
  const kante = c.createLinearGradient(X(50 - PL.innen), X(50 - PL.innen),
                                       X(50 - PL.innen) + M(PL.innen * .5), X(50 + PL.innen));
  kante.addColorStop(0, 'rgba(0,0,0,.55)');
  kante.addColorStop(.55, 'rgba(0,0,0,.12)');
  kante.addColorStop(1, 'rgba(255,255,255,' + (hell ? .45 : .16) + ')');
  kreis(PL.innen - .6, null, kante, 1.6);

  // Umlaufende Linie
  kreis(PL.ring, null, s.ring, 1.25, .95);

  // Akzentboegen links und rechts
  const bog = PL_BOGEN_GRAD / 180;
  c.strokeStyle = akz; c.lineWidth = M(2.6); c.lineCap = 'round';
  [[Math.PI * (1 - bog), Math.PI * (1 + bog)], [Math.PI * -bog, Math.PI * bog]].forEach(([a, b]) => {
    c.beginPath(); c.arc(mitte, mitte, M(PL.bogen), a, b); c.stroke();
  });

  // Gebogene Schrift oben und unten — Buchstabe fuer Buchstabe gedreht
  const bogen = (txt, radius, groesse, sperrung, unten) => {
    c.save();
    c.translate(mitte, mitte);
    c.fillStyle = s.schrift;
    c.strokeStyle = 'rgba(255,255,255,.5)';
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
      if (s.metall){ c.lineWidth = M(.7); c.strokeText(ch, 0, 0); }
      c.fillText(ch, 0, 0);
      c.restore();
    });
    c.restore();
  };
  bogen('MYGYMTRACK', PL.txtO, PL.txtGr, 1, false);
  bogen('LEVEL',      PL.txtU, PL.txtGr, 3.2, true);

  // Bohrung mit Metallbuchse — ab Level 100 entfaellt sie, die Zahl steht mittig
  const cLoch = +n < 100;
  const met = c.createLinearGradient(X(50 - PL.buchse), X(50 - PL.buchse),
                                     X(50 + PL.buchse), X(50 + PL.buchse));
  [[0, '#fdfefe'], [.18, '#aeb6be'], [.34, '#f0f3f6'], [.52, '#7c848d'],
   [.7, '#dde2e7'], [.86, '#69707a'], [1, '#c3cad1']].forEach(([o, col]) => met.addColorStop(o, col));
  if (cLoch){
  kreis(PL.buchse, met);
  kreis(PL.buchse, null, '#000', .9, .45);
  const kanal = c.createRadialGradient(mitte, mitte + M(PL.loch * .44), 0,
                                       mitte, mitte + M(PL.loch * .44), M(PL.loch * 1.5));
  kanal.addColorStop(0, '#2a2f35'); kanal.addColorStop(.6, '#14171a'); kanal.addColorStop(1, '#050607');
  kreis(PL.loch, kanal);
  /* Schattenkante wie im SVG: voller Ring mit nach unten auslaufendem Verlauf.
     Der frühere Halbkreis (arc PI..0) endete stumpf auf der Waagerechten und
     teilte die Bohrung sichtbar in zwei Hälften. */
  const kanalKante = c.createLinearGradient(0, mitte - M(PL.loch), 0, mitte + M(PL.loch));
  kanalKante.addColorStop(0,   'rgba(0,0,0,.62)');
  kanalKante.addColorStop(.34, 'rgba(0,0,0,.38)');
  kanalKante.addColorStop(.66, 'rgba(0,0,0,.14)');
  kanalKante.addColorStop(1,   'rgba(0,0,0,0)');
  kreis(PL.loch, null, kanalKante, 1.9);
  }

  // Zahl links und rechts der Bohrung
  const [zLinks, zRechts] = _plateZahlTeilen(n);
  const zg = !cLoch ? _plateZahlGroesse(n, true)
                    : (Math.max(zLinks.length, zRechts.length) > 1 ? 16 : 23);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = '800 ' + Math.round(M(zg)) + 'px -apple-system, system-ui, sans-serif';
  c.lineWidth = M(zg * .03); c.lineJoin = 'round';
  c.strokeStyle = hell ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.45)';
  const zf = c.createLinearGradient(0, mitte - M(zg / 2), 0, mitte + M(zg / 2));
  zf.addColorStop(0, s.metall ? s.schrift : '#ffffff');
  zf.addColorStop(1, s.metall ? s.schriftTief : s.schrift);
  (cLoch ? [[zLinks, -PL.zahlX], [zRechts, PL.zahlX]] : [[n, 0]]).forEach(([txt, dx]) => {
    c.strokeStyle = hell ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.45)';
    c.strokeText(txt, X(50 + dx), mitte);
    c.fillStyle = zf;
    c.fillText(txt, X(50 + dx), mitte);
  });

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
let _lvlpMitte = 0;   // Stufe, auf der das Vollbild zuletzt stand

function openLevelPlate(start){
  haptic(8);
  const eigen = (typeof _levelOf === 'function' && typeof _xpSelf === 'function')
    ? _levelOf(_xpSelf()) : { level: 1, pts: 0, toGo: 0, max: false };
  const max   = (typeof MAX_LEVEL === 'number') ? MAX_LEVEL : 99;
  const mitte = Math.max(1, Math.min(max, Math.round(+start || eigen.level)));
  _lvlpMitte = mitte;

  const host = document.getElementById('lvlp-scroll');
  if (!host) return;
  const von = Math.max(1, mitte - LVLP_UM);
  const bis = Math.min(max, mitte + LVLP_UM);
  const seiten = [];
  for (let L = von; L <= bis; L++) seiten.push(_lvlPlatePage(L, eigen, max));
  host.innerHTML = seiten.join('');
  _lvlPlateMatBar(eigen.level);
  openOv('ov-lvlplate');
  // Ohne Animation auf die eigene Stufe springen — sonst zieht das Blatt
  // sichtbar an allen Stufen vorbei.
  requestAnimationFrame(() => {
    const el = document.getElementById('lvlp-' + mitte);
    if (el) host.scrollTop = el.offsetTop;
  });
}
function _lvlPlatePage(L, eigen, max){
  const s        = plateMat(L);
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

/* ── Materialwahl ────────────────────────────────────────────────────────
   Die Meilensteine schalten Materialien frei (Bronze ab 30, Silber ab 50,
   Gold ab 100), ersetzen einander aber nicht: wer Bronze hat, darf weiter das
   Standarddesign tragen. Deshalb eine Leiste statt einer festen Zuordnung.

   Gesperrte Materialien bleiben sichtbar und zeigen die noetige Stufe — ein
   Ziel, das man sieht, zieht besser als eines, von dem man nichts weiss. */
function _lvlPlateMatBar(level){
  const host = document.getElementById('lvlp-mats');
  if (!host) return;
  const aktiv = plateMat(level).key;
  const L = Math.max(1, Math.round(+level || 1));
  // Von unten nach oben, damit Standard links steht und Gold rechts
  const mats = PLATE_MATS.slice().sort((a, b) => a.ab - b.ab);
  host.innerHTML = mats.map(m => {
    const frei = L >= m.ab;
    return `<button class="lvlp-mat${m.key === aktiv ? ' on' : ''}${frei ? '' : ' locked'}"
      ${frei ? `onclick="setPlateMat('${m.key}')"` : 'disabled'}
      title="${esc(m.name)}${frei ? '' : ' · ab Level ' + m.ab}">
      ${_lvlPlateSVG(Math.max(L, m.ab), 34, { label: false, mat: m.key })}
      <span>${esc(frei ? m.name : 'Lvl ' + m.ab)}</span>
    </button>`;
  }).join('');
}

/* Wahl uebernehmen: speichern, Vollbild neu aufbauen und die Pillen in der
   App nachziehen — sonst traegt die Kopfzeile bis zum naechsten Neuaufbau
   noch das alte Material. */
function setPlateMat(key){
  haptic(8);
  try { localStorage.setItem(PLATE_MAT_WAHL, key); } catch(e){}
  const eigen = (typeof _levelOf === 'function' && typeof _xpSelf === 'function')
    ? _levelOf(_xpSelf()) : { level: 1 };
  const host = document.getElementById('lvlp-scroll');
  const oben = host ? host.scrollTop : 0;
  openLevelPlate(_lvlpMitte || eigen.level);
  if (host) requestAnimationFrame(() => { host.scrollTop = oben; });
  if (typeof _renderLevelBadge === 'function') _renderLevelBadge();
  if (typeof renderFriendsTab === 'function' && document.getElementById('pg-freunde')?.classList.contains('on')) renderFriendsTab();
}

/* data-URL in Bytes, ohne fetch. fetch waere ein eigener Task — und genau der
   kostet beim Teilen die Nutzer-Geste (s. lvlPlateShare). */
function _plateDataBytes(url){
  const roh = atob(url.slice(url.indexOf(',') + 1));
  const arr = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i++) arr[i] = roh.charCodeAt(i);
  return arr;
}

/* Rueckfallweg ohne Teilen-Blatt: Bild herunterladen (Web/Desktop). */
function _platePngDownload(datei){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(datei);
  a.download = datei.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* Teilen: PNG aus dem Canvas-Zwilling. navigator.share mit Datei, wo es geht
   (iOS-Teilen-Blatt), sonst Download — beides ohne Serverweg.

   ALLES SYNCHRON bis zum share-Aufruf, und das ist kein Schoenheitsfehler:
   WebKit haengt die Erlaubnis fuers Teilen an die Geste des Taps und verwirft
   sie, sobald davor ein eigener Task laeuft. `await cv.toBlob(...)` war so
   einer — danach warf navigator.share NotAllowedError, das Blatt ging nie auf,
   und weil alles in einem catch landete, log die App den Nutzer mit "Bild
   konnte nicht erstellt werden" an, obwohl das PNG fertig dalag.
   Deshalb toDataURL (synchron) statt toBlob, Bytes von Hand statt fetch, und
   getrennte Meldungen fuer Bildaufbau und Teilen. Bewacht von
   test/plate-share.test.js. */
function lvlPlateShare(level){
  haptic(10);
  let datei;
  try {
    const cv  = _lvlPlateCanvas(level, 1080);   // Material folgt der lokalen Wahl
    const url = cv.toDataURL('image/png');
    datei = new File([_plateDataBytes(url)], 'level-' + level + '.png', { type: 'image/png' });
  } catch(e) {
    console.warn('[GymTrack] Level-Bild:', e);
    alert('Bild konnte nicht erstellt werden.');
    return;
  }
  const text = 'Level ' + level + ' bei MyGymTrack';
  try {
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [datei] })) {
      navigator.share({ files: [datei], text }).catch(e => {
        if (String(e && e.name) === 'AbortError') return;   // Teilen abgebrochen
        console.warn('[GymTrack] Level teilen:', e);
        _platePngDownload(datei);                            // lieber sichern als nichts
      });
      return;
    }
  } catch(e) {
    /* Aeltere WebKits werfen hier synchron statt das Promise abzulehnen. */
    if (String(e && e.name) !== 'AbortError') console.warn('[GymTrack] Level teilen:', e);
    else return;
  }
  _platePngDownload(datei);
}
