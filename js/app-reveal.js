/* GymTrack — Aufbau-Animation beim Oeffnen einer Seite

   Ein Wert, der beim Oeffnen einer Seite fertig dasteht, ist eine Zahl. Ein
   Wert, der in seine Hoehe waechst, ist eine Bewegung, und Bewegung liest sich
   als Groesse: man sieht, dass 80 % weiter laufen als 30 %, bevor man die Zahl
   gelesen hat. Genau deshalb baut sich hier bei JEDEM Oeffnen wieder auf und
   nicht nur beim ersten — der zweite Blick auf den Statistik-Tab soll dieselbe
   Aussage machen wie der erste.

   Zwei Arten von Werttraegern, und der Unterschied ist der ganze Grund fuer
   die zwei Wege in diesem Modul:

   - GROESSE: Balken und Fuellungen, deren Breite oder Hoehe der Wert IST
     (.aia-hrow-fill, .aia-bar i, .lvl-fill). Sie starten bei 0 und wachsen.
   - FARBE: Segmentreihen und Akkus (.segbar, .segbar-v). Ihre Striche haben
     FESTE Groesse; den Wert traegt, wie viele davon leuchten. Sie zu
     schrumpfen waere falsch — die leeren Huelsen sind die Skala und muessen
     stehen bleiben. Sie leuchten stattdessen nacheinander auf.

   Es entsteht keine einzige neue Keyframe. Gewachsen wird ueber transform
   (scaleX/scaleY um den Rand, der stehen bleibt) und NICHT ueber width/height:
   eine Groessenanimation zwingt den WebView bei jedem einzelnen Bild zu einem
   neuen Layout, und auf aelteren iPhones ruckelt dann die ganze Seite mit. Die
   Layout-Groesse steht deshalb die ganze Zeit auf dem Zielwert; sichtbar
   waechst nur die Skalierung von 0 auf 1, der Endzustand ist damit exakt der
   ungerechnete. Dauer und Kurve stehen je Traeger in GROESSE, weil das
   Stylesheet nur width/height taktet — transform muss inline mitgetaktet
   werden, sonst gaebe es gar keinen Uebergang. Die Segmentreihen nutzen weiter
   ihren Farbuebergang (transition:background .45s).

   Der Versatz zaehlt INNERHALB einer Gruppe, nicht ueber die ganze Seite. Auf
   einem Statistik-Tab mit acht Muskelzeilen liefe ein durchgehender Zaehler
   sonst zwei Sekunden lang durch, und die letzte Zeile kaeme an, wenn der
   Nutzer laengst weitergescrollt hat.

   Bei prefers-reduced-motion tut das Modul GAR NICHTS. Nicht "schneller",
   nicht "kuerzer" — die Werte stehen dann sofort, so wie ohne dieses Modul. */
(function (root) {
  'use strict';

  /* Werttraeger, deren GROESSE der Wert ist. achse = die Eigenschaft, die der
     Renderer als inline-Stil setzt; ohne inline-Wert wird das Element
     uebersprungen (dann hat der Renderer ihm keinen Wert gegeben, und was aus
     dem Stylesheet kommt ist Grundgeruest, kein Messwert).

     skala/ursprung = dieselbe Achse als transform, verankert an dem Rand, der
     beim Wachsen stehen bleibt: Fuellungen wachsen nach rechts, die Saeulen des
     Volumen-Trends nach oben (ihre Beschriftung sitzt unter ihnen und darf sich
     nicht bewegen). takt = Dauer und Kurve, wie sie fuer die Achse im
     Stylesheet stehen — beides muss zusammen bleiben, sonst laeuft der Aufbau
     anders als jede spaetere echte Wertaenderung.

     Alle drei Traeger sind LEER (die Beschriftungen sind Geschwister, nicht
     Kinder). Deshalb geht scale hier ohne Gegen-Transform; ein Traeger mit
     Inhalt duerfte so nicht animiert werden, der Inhalt wuerde mitverzerren. */
  var GROESSE = [
    { sel: '.aia-hrow-fill', achse: 'width',  skala: 'scaleX',
      ursprung: 'left center',   takt: '.5s cubic-bezier(.2,.8,.3,1)' },
    { sel: '.aia-bar i',     achse: 'height', skala: 'scaleY',
      ursprung: 'center bottom', takt: '.5s cubic-bezier(.2,.8,.3,1)' },
    { sel: '.lvl-fill',      achse: 'width',  skala: 'scaleX',
      ursprung: 'left center',   takt: '.55s cubic-bezier(.32,1,.32,1)' }
  ];

  /* Segmentreihen. rueckwaerts = die gefuellten Striche stehen am ENDE der
     Kinderliste und muessen von dort aus aufleuchten: ein Akku laeuft von
     unten voll, nicht von oben. */
  var SEGMENTE = [
    { sel: '.segbar',   rueckwaerts: false },
    { sel: '.segbar-v', rueckwaerts: true  }
  ];

  var STUFE      = 30;    // ms Versatz je Element innerhalb einer Gruppe
  var MAX_VERZUG = 240;   // Deckel: eine lange Liste soll nicht troepfeln
  var AUFRAEUMEN = 1000;  // ms bis der Versatz wieder abgeraeumt wird

  /* Segmentreihen brauchen eine EIGENE Taktung, und das ist keine
     Geschmacksfrage: die Striche wechseln nur die Farbe, und der Uebergang
     dafuer steht im Stylesheet auf 450 ms. Mit 30 ms Versatz ueberlappen fuenf
     Zellen zu ueber 90 % — dann faerbt sich die ganze Batterie auf einmal ein
     und genau das war der Fehler: es sah nicht aus, als LADE sie sich.

     Damit eine Reihe als Ladevorgang liest, muss jede Zelle sichtbar NACH der
     vorigen kommen. Also: kurzer Uebergang je Zelle, dafuer deutlicher
     Abstand. Der Abstand richtet sich nach der Anzahl, damit eine Batterie mit
     fuenf Zellen und eine Leiste mit zwoelf beide in derselben Zeit fertig
     sind — sonst tickerte die lange Reihe doppelt so lange wie die kurze,
     obwohl beide dasselbe meinen. */
  var SEG_MS      = 170;   // Uebergang je Strich (ueberschreibt das Stylesheet)
  var SEG_GESAMT  = 520;   // so lange dauert eine Reihe, egal wie viele Striche
  var SEG_MIN     = 28;    // darunter verschmelzen die Striche wieder
  var SEG_MAX     = 95;    // darueber wirkt es zaeh statt zuegig

  /* Der Abstand zwischen zwei Strichen einer Reihe. Ausgelagert und geprueft,
     weil er der ganze Unterschied zwischen "laedt" und "ist halt da" ist. */
  function segSchritt(anzahl) {
    var n = (typeof anzahl === 'number' && isFinite(anzahl) && anzahl > 1)
      ? Math.round(anzahl) : 1;
    if (n <= 1) return 0;
    return Math.max(SEG_MIN, Math.min(SEG_MAX, Math.round(SEG_GESAMT / (n - 1))));
  }

  function reduziert() {
    try {
      return !!(root.matchMedia &&
                root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (_) { return false; }
  }

  /* Der Versatz eines Elements an Position i. Ausgelagert, weil er die einzige
     Rechnung in diesem Modul ist und sich ohne Browser pruefen laesst. */
  function verzug(i) {
    var n = (typeof i === 'number' && isFinite(i) && i > 0) ? i : 0;
    return Math.min(MAX_VERZUG, Math.round(n) * STUFE);
  }

  /* Ohne diesen Lesezugriff fasst der Browser Startwert und Zielwert zu einem
     einzigen Stilwechsel zusammen und es gibt keinen Uebergang zu sehen.

     Er faellt EINMAL fuer den ganzen Durchlauf an, nicht je Element: ein
     Lesezugriff zwingt den WebView zum vollstaendigen Layout, und wer zwischen
     zwei Schreibvorgaengen liest, bezahlt das je Balken erneut. Auf einem
     Statistik-Tab mit Zeilen, Saeulen und Akkus waren das ueber vierzig
     erzwungene Layouts in einem Frame. Deshalb: erst alle Startzustaende
     schreiben, dann einmal lesen, dann alle Ziele schreiben. */
  function reflow(el) { return el.offsetWidth; }

  /* Der Versatz darf nicht liegen bleiben: die naechste ECHTE Wertaenderung
     (neuer Satz eingetragen, Erholung neu gerechnet) traege ihn sonst mit und
     zoegerte grundlos. Bei den Groessen faellt zugleich das transform weg — es
     steht dann auf 1 und ist damit dasselbe wie keins, aber ein liegen
     gebliebener Stapelkontext waere trotzdem einer zu viel. */
  function spaeterAufraeumen(el, ms, mitTransform) {
    function frei() {
      el.style.transitionDelay = ''; el.style.transition = '';
      if (mitTransform) { el.style.transform = ''; el.style.transformOrigin = ''; }
    }
    try { root.setTimeout(frei, ms + AUFRAEUMEN); } catch (_) { frei(); }
  }

  function startGroesse(el, g) {
    if (!el.style[g.achse]) return false;
    el.style.transition = 'none';
    el.style.transitionDelay = '0ms';
    el.style.transformOrigin = g.ursprung;
    el.style.transform = g.skala + '(0)';
    return true;
  }

  /* Die Achse bleibt im Uebergang stehen, obwohl hier nur transform wandert:
     waehrend des Aufbaus haengt der Versatz am Element, und eine echte
     Wertaenderung, die in dieses Fenster faellt, soll so laufen wie sonst
     auch — ohne die Zeile spraenge sie hart. */
  function zielGroesse(el, g, i) {
    var ms = verzug(i);
    el.style.transition = 'transform ' + g.takt + ', ' + g.achse + ' ' + g.takt;
    el.style.transitionDelay = ms + 'ms';
    el.style.transform = g.skala + '(1)';
    spaeterAufraeumen(el, ms, true);
  }

  /* Ein Strich gilt als gefuellt, wenn der Renderer ihm eine eigene Farbe
     gegeben hat. Die leeren tragen keine — sie kommen aus dem Stylesheet
     (--ng-well). Genau das macht den Weg hier so einfach: die Farbe kurz
     wegnehmen heisst "leere Huelse", zurueckgeben heisst "leuchtet". */
  function startSegmente(bar, rueckwaerts) {
    var kinder, gefuellt = [], i, el;
    try { kinder = bar.children || []; } catch (_) { return null; }
    for (i = 0; i < kinder.length; i++) {
      el = kinder[i];
      if (el && el.style && el.style.background) {
        gefuellt.push({ el: el, bg: el.style.background, sh: el.style.boxShadow });
      }
    }
    if (!gefuellt.length) return null;
    if (rueckwaerts) gefuellt.reverse();

    for (i = 0; i < gefuellt.length; i++) {
      el = gefuellt[i].el;
      el.style.transition = 'none';
      el.style.transitionDelay = '0ms';
      el.style.background = '';
      el.style.boxShadow  = '';
    }
    return gefuellt;
  }

  function zielSegmente(gefuellt) {
    var schritt = segSchritt(gefuellt.length), i, s, ms;
    for (i = 0; i < gefuellt.length; i++) {
      s = gefuellt[i];
      ms = i * schritt;
      /* Der kurze Uebergang wird hier gesetzt und nicht dem Stylesheet
         ueberlassen: dort stehen 450 ms, und die sind fuer eine ECHTE
         Wertaenderung richtig (die Erholung springt nicht, sie wandert). Fuer
         den Aufbau waeren sie zu lang — die Striche liefen ineinander. */
      s.el.style.transition = 'background ' + SEG_MS + 'ms linear, box-shadow ' + SEG_MS + 'ms linear';
      s.el.style.transitionDelay = ms + 'ms';
      s.el.style.background = s.bg;
      s.el.style.boxShadow  = s.sh;
      // Nach dem Aufbau zurueck auf den Uebergang aus dem Stylesheet.
      spaeterAufraeumen(s.el, ms + SEG_MS);
    }
  }

  /* gtReveal(wurzel)

     wurzel = Element oder Dokument, in dem gesucht wird. Ohne Angabe das ganze
     Dokument. Mehrfach hintereinander aufrufbar: jeder Lauf setzt nur Start-
     und Zielwert neu, es sammelt sich nichts an. */
  function gtReveal(wurzel) {
    try {
      if (reduziert()) return;
      var w = wurzel || (root.document || null);
      if (!w || typeof w.querySelectorAll !== 'function') return;

      var groessen = [], reihen = [], k;

      // Erster Durchgang: nur schreiben, nichts lesen.
      GROESSE.forEach(function (g) {
        var els = w.querySelectorAll(g.sel);
        for (var i = 0; i < els.length; i++) {
          // Der Versatz zaehlt die Position in der Gruppe, auch uebersprungene:
          // sonst rueckte eine Zeile ohne Wert die folgenden mit auf.
          if (startGroesse(els[i], g)) groessen.push({ el: els[i], g: g, i: i });
        }
      });

      SEGMENTE.forEach(function (s) {
        var bars = w.querySelectorAll(s.sel);
        for (var i = 0; i < bars.length; i++) {
          var reihe = startSegmente(bars[i], s.rueckwaerts);
          if (reihe) reihen.push(reihe);
        }
      });

      var erstes = (groessen[0] && groessen[0].el) ||
                   (reihen[0] && reihen[0][0] && reihen[0][0].el) || null;
      if (!erstes) return;
      reflow(erstes);

      // Zweiter Durchgang: wieder nur schreiben. Dazwischen kein Lesezugriff,
      // sonst kostet jeder Balken sein eigenes Layout.
      for (k = 0; k < groessen.length; k++) {
        zielGroesse(groessen[k].el, groessen[k].g, groessen[k].i);
      }
      for (k = 0; k < reihen.length; k++) zielSegmente(reihen[k]);
    } catch (e) { console.warn('[Reveal]', e); }
  }

  var API = { gtReveal: gtReveal, verzug: verzug, segSchritt: segSchritt,
              STUFE: STUFE, MAX_VERZUG: MAX_VERZUG,
              SEG_MS: SEG_MS, SEG_GESAMT: SEG_GESAMT, SEG_MIN: SEG_MIN, SEG_MAX: SEG_MAX };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.GtReveal = API;
  root.gtReveal = gtReveal;
})(typeof globalThis !== 'undefined' ? globalThis : this);
