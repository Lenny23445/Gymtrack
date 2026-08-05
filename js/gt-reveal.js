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

   Es entsteht keine einzige neue Keyframe. Beide Wege nutzen die CSS-Uebergaenge,
   die an diesen Klassen ohnehin schon haengen (transition:width .5s bzw.
   transition:background .45s) — angestossen wird nur ihr Startwert.

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
     uebersprungen (dann gibt es kein Ziel, auf das zurueckgestellt werden
     koennte, und ein aus dem Stylesheet geratenes waere schlechter als keine
     Bewegung). */
  var GROESSE = [
    { sel: '.aia-hrow-fill', achse: 'width'  },
    { sel: '.aia-bar i',     achse: 'height' },
    { sel: '.lvl-fill',      achse: 'width'  }
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
     einzigen Stilwechsel zusammen und es gibt keinen Uebergang zu sehen. */
  function reflow(el) { return el.offsetWidth; }

  /* Der Versatz darf nicht liegen bleiben: die naechste ECHTE Wertaenderung
     (neuer Satz eingetragen, Erholung neu gerechnet) traege ihn sonst mit und
     zoegerte grundlos. */
  function spaeterAufraeumen(el, ms) {
    try {
      root.setTimeout(function () { el.style.transitionDelay = ''; }, ms + AUFRAEUMEN);
    } catch (_) { el.style.transitionDelay = ''; }
  }

  function riseGroesse(el, achse, i) {
    var ziel = el.style[achse];
    if (!ziel) return;
    var ms = verzug(i);
    el.style.transition = 'none';
    el.style.transitionDelay = '0ms';
    el.style[achse] = '0';
    reflow(el);
    el.style.transition = '';
    el.style.transitionDelay = ms + 'ms';
    el.style[achse] = ziel;
    spaeterAufraeumen(el, ms);
  }

  /* Ein Strich gilt als gefuellt, wenn der Renderer ihm eine eigene Farbe
     gegeben hat. Die leeren tragen keine — sie kommen aus dem Stylesheet
     (--ng-well). Genau das macht den Weg hier so einfach: die Farbe kurz
     wegnehmen heisst "leere Huelse", zurueckgeben heisst "leuchtet". */
  function riseSegmente(bar, rueckwaerts) {
    var kinder, gefuellt = [], i, el;
    try { kinder = bar.children || []; } catch (_) { return; }
    for (i = 0; i < kinder.length; i++) {
      el = kinder[i];
      if (el && el.style && el.style.background) gefuellt.push(el);
    }
    if (!gefuellt.length) return;
    if (rueckwaerts) gefuellt.reverse();

    for (i = 0; i < gefuellt.length; i++) {
      el = gefuellt[i];
      var bg = el.style.background, sh = el.style.boxShadow;
      var ms = verzug(i);
      el.style.transition = 'none';
      el.style.transitionDelay = '0ms';
      el.style.background = '';
      el.style.boxShadow  = '';
      reflow(el);
      el.style.transition = '';
      el.style.transitionDelay = ms + 'ms';
      el.style.background = bg;
      el.style.boxShadow  = sh;
      spaeterAufraeumen(el, ms);
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

      GROESSE.forEach(function (g) {
        var els = w.querySelectorAll(g.sel);
        for (var i = 0; i < els.length; i++) riseGroesse(els[i], g.achse, i);
      });

      SEGMENTE.forEach(function (s) {
        var bars = w.querySelectorAll(s.sel);
        for (var i = 0; i < bars.length; i++) riseSegmente(bars[i], s.rueckwaerts);
      });
    } catch (e) { console.warn('[Reveal]', e); }
  }

  var API = { gtReveal: gtReveal, verzug: verzug, STUFE: STUFE, MAX_VERZUG: MAX_VERZUG };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.GtReveal = API;
  root.gtReveal = gtReveal;
})(typeof globalThis !== 'undefined' ? globalThis : this);
