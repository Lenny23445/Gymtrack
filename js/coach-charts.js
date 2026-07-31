/* GymTrack — Diagramm-Konfigurationen der Wochenkachel (Coach-Hub-Umbau, Task 1)

   Zahlen herein, fertige Chart.js-Konfiguration heraus. Gezeichnet wird
   hier nichts: kein Chart-Aufruf, keine Oberflaeche, kein Speicher, keine
   Systemuhr. Das ist der ganze Zweck des Moduls — eine Diagrammlogik, die
   mitten in einer Renderfunktion steht, laesst sich nur im Browser
   nachsehen; hier laesst sie sich nachrechnen.

   Vier Grenzen, die dieses Modul bewusst NICHT ueberschreitet:

   - Es liest keine Farben. Der Akzent und die gedaempfte Farbe kommen als
     opts.accent und opts.muted herein. Ein Modul, das selbst in die
     Formatvorlagen greift, haette Oberflaechenwissen und waere nicht
     pruefbar.
   - Es rechnet keine Einheiten um. Die Werte gehen unveraendert durch;
     opts.unit beschriftet nur. Wer hier heimlich mal 2,2 rechnet, liefert
     dem Nutzer Zahlen, die er in seinen eigenen Saetzen nicht wiederfindet.
   - Es liest die Spracheinstellung nicht selbst. opts.lang entscheidet.
   - Es beschoenigt keine duenne Datenlage. Reicht sie nicht, kommt null
     zurueck, und die Aufrufstelle laesst den Bereich WEG. Ein leerer
     Rahmen mit einer Achse ohne Daten sieht nach Aussage aus und ist
     keine.

   Aussehen: Achsen, Schriftgroessen, Rasterfarben und der Verlauf unter
   der Linie sind aus den bestehenden Diagrammen uebernommen (_cXT, _cYT,
   _cPR, _accFill). Bewusst kopiert statt geholt — die Helfer dort nehmen
   ein Zeichenfeld entgegen und haengen an der Oberflaeche. Aendert sich
   dort das Aussehen, muss es hier mitwandern; dafuer bleibt dieses Modul
   ohne Oberflaechenbindung. */
(function (root) {
  'use strict';

  // Untergrenzen. Ein einzelner Balken ist kein Verlauf, und unter vier
  // Wochen ist kein Trend — dieselbe Grenze, die CoachReport.MIN_WEEKS fuer
  // die Prognose zieht. Zwei verschiedene Grenzen hiessen: die Kachel zeigt
  // eine Linie, zu der die Prognose schweigt.
  var MIN_BARS   = 2;
  var MIN_POINTS = 4;

  // Acht Wochen sind die Spanne der Kachel (das Berichtsarchiv haelt
  // hoechstens acht, die laufende Woche kommt dazu — ohne Deckel waeren es
  // neun Balken in einem Bild, das acht verspricht).
  var MAX_BARS = 8;

  // Ein halbes Jahr Wochenachse. Wer nach einem Jahr Pause zurueckkommt,
  // bekaeme sonst eine Achse mit 52 Positionen, auf der vier Punkte kleben.
  var MAX_SPAN = 26;

  var BAR_MS   = 320;  // Balken wachsen von unten
  var BAR_STEP = 30;   // je Balken versetzt
  var LINE_MS  = 300;  // wie das bestehende Mini-Diagramm

  var HEX6 = /^#[0-9a-fA-F]{6}$/;
  var WEEK_NR = /-W(\d{1,2})$/;

  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

  function langOf(o) { return (o && o.lang === 'en') ? 'en' : 'de'; }

  function unitOf(o) {
    var u = o && o.unit;
    return (typeof u === 'string' && u.trim()) ? u.trim() : '';
  }

  function txt(o, de, en) { return langOf(o) === 'en' ? en : de; }

  /* Zahlen in der Schreibweise der gewaehlten Sprache: 12.500 gegen 12,500.
     Ohne das steht auf einer englischen Achse eine deutsche Zahl. */
  function fmtNum(v, digits, o) {
    var n = num(v);
    if (n === null) return '';
    return n.toLocaleString(langOf(o) === 'en' ? 'en-US' : 'de-DE',
      { maximumFractionDigits: digits });
  }

  // Die Einheit gehoert an den Wert, nicht in den Satz. Fehlt sie, wird
  // keine erfunden.
  function withUnit(s, o) {
    var u = unitOf(o);
    return u ? s + ' ' + u : s;
  }

  function fmtVol(v, o) { return withUnit(fmtNum(v, 0, o), o); }
  function fmtKg(v, o)  { return withUnit(fmtNum(v, 1, o), o); }

  // ── Aussehen, uebernommen aus den bestehenden Diagrammen ────────────────

  // entspricht _cXT(n)
  function xTicks(n) {
    return {
      font: { size: 10 }, color: '#8e8e93',
      maxRotation: 0, minRotation: 0,
      autoSkip: true,
      maxTicksLimit: n <= 4 ? n : n <= 8 ? 4 : n <= 20 ? 4 : 3
    };
  }

  // entspricht _cYT(cb)
  function valueAxis(cb) {
    return {
      grid: { color: 'rgba(120,120,128,.08)' },
      border: { display: false },
      ticks: { font: { size: 10 }, color: 'rgba(140,140,150,.85)', callback: cb, maxTicksLimit: 5 }
    };
  }

  // entspricht _cPR(n)
  function pointRadius(n) { return n <= 8 ? 4 : n <= 12 ? 3 : 0; }

  /* entspricht _accFill(canvas, hex): der Verlauf unter der Linie, gebaut
     aus dem hereingegebenen Akzent. Als Funktion, weil das Zeichenfeld erst
     beim Zeichnen existiert — Chart.js reicht es hier herein. Ist die Farbe
     keine sechsstellige Hexfarbe, entsteht GAR kein Verlauf: aus
     'rgb(0,122,255)' + '3D' wuerde sonst ein Farbwert, den niemand
     vereinbart hat. */
  function fillFor(accent) {
    var hex = (typeof accent === 'string' && HEX6.test(accent)) ? accent : null;
    return function (ctx) {
      if (!hex) return 'transparent';
      try {
        var chart = ctx && ctx.chart;
        var c = chart && chart.ctx;
        if (!c || typeof c.createLinearGradient !== 'function') return 'transparent';
        var area = chart.chartArea;
        var h = (area && num(area.bottom)) || num(chart.height) || 220;
        var g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, hex + '3D');
        g.addColorStop(.55, hex + '14');
        g.addColorStop(1, hex + '00');
        return g;
      } catch (e) { return hex + '22'; }
    };
  }

  /* Balken wachsen von unten, je Balken versetzt. Bei reduzierter Bewegung
     traegt die Aufrufstelle opts.reduceMotion herein — eine Medienabfrage
     kann dieses Modul nicht lesen, und eine Bewegung, die die Regel
     ignoriert, waere ein Fehler ohne Sichtbarkeit im Test. */
  function barAnimation(o) {
    if (o && o.reduceMotion) return { duration: 0, delay: function () { return 0; } };
    return {
      duration: BAR_MS,
      delay: function (ctx) {
        return (ctx && ctx.type === 'data' && ctx.mode === 'default')
          ? ctx.dataIndex * BAR_STEP : 0;
      }
    };
  }

  function lineAnimation(o) {
    return { duration: (o && o.reduceMotion) ? 0 : LINE_MS };
  }

  function baseOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    };
  }

  /* '2026-W23' -> 'KW 23' / 'Week 23'. Dieselbe Form wie die bestehende
     Wochen-Beschriftung des Berichts. Laesst sich die Nummer nicht lesen,
     bleibt die Beschriftung leer statt geraten. */
  function weekLabel(key, opts) {
    var m = WEEK_NR.exec(key);
    if (!m) return '';
    var nr = parseInt(m[1], 10);
    if (!isFinite(nr)) return '';
    return txt(opts, 'KW ' + nr, 'Week ' + nr);
  }

  // ── volumeBars ──────────────────────────────────────────────────────────

  /* volumeBars(weeks, opts) -> Chart.js-Konfiguration | null

     weeks = [{weekKey:'2026-W23', vol}], juengste zuletzt. Die Reihenfolge
     wird NICHT angetastet: sie kommt aus dem Berichtsarchiv und ist dort
     bereits die zeitliche. Ein Sortieren nach Volumen ergaebe ein Bild, das
     wie ein Verlauf aussieht und keiner ist.

     Eine Woche mit Volumen 0 bleibt stehen — eine Pause ist eine Aussage,
     keine fehlende Zahl. Eine Woche ohne Schluessel oder ohne Zahl faellt
     weg; sie haette keine Beschriftung und keine Hoehe.

     Die letzte Woche traegt den Akzent, alle anderen die gedaempfte Farbe.
     Ohne diesen Unterschied weiss der Nutzer nicht, welcher Balken die
     laufende Woche ist — und genau die ist die einzige, die er noch
     beeinflussen kann. */
  function volumeBars(weeks, opts) {
    if (!Array.isArray(weeks)) return null;

    var rows = [];
    for (var i = 0; i < weeks.length; i++) {
      var w = weeks[i];
      if (!w || typeof w !== 'object') continue;
      var v = num(w.vol);
      if (v === null || v < 0) continue;
      var key = (typeof w.weekKey === 'string') ? w.weekKey : '';
      if (!key) continue;
      rows.push({ key: key, vol: v });
    }
    if (rows.length > MAX_BARS) rows = rows.slice(rows.length - MAX_BARS);
    if (rows.length < MIN_BARS) return null;

    var acc = opts && opts.accent;
    var mut = opts && opts.muted;
    var last = rows.length - 1;

    return {
      type: 'bar',
      data: {
        labels: rows.map(function (r) { return weekLabel(r.key, opts); }),
        datasets: [{
          data: rows.map(function (r) { return r.vol; }),
          backgroundColor: rows.map(function (r, ix) { return ix === last ? acc : mut; }),
          borderWidth: 0,
          borderRadius: 4,
          borderSkipped: false,
          maxBarThickness: 28
        }]
      },
      options: Object.assign(baseOptions(), {
        animation: barAnimation(opts),
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) { return ' ' + fmtVol(c.parsed.y, opts); } } }
        },
        scales: {
          x: { grid: { display: false }, ticks: xTicks(rows.length) },
          y: Object.assign({ beginAtZero: true },
               valueAxis(function (v) { return fmtVol(v, opts); }))
        }
      })
    };
  }

  // ── muscleBars ──────────────────────────────────────────────────────────

  /* muscleBars(muscles, opts) -> Chart.js-Konfiguration | null

     muscles = [{id, label, vol}], liegende Balken. Hier WIRD sortiert, und
     zwar absteigend nach Volumen: die Frage der Kachel ist, woran diese
     Woche gearbeitet wurde, und die Antwort steht dann oben.

     Eine Gruppe ohne Beschriftung faellt weg. Die Kennung als Ersatz zu
     nehmen waere eine erfundene Beschriftung — der Nutzer laese eine
     interne Zeichenfolge und haette den Balken lieber gar nicht gesehen.
     Eine Gruppe ohne Volumen faellt ebenfalls weg; null ist kein Anteil an
     einer Verteilung.

     Alle Balken tragen den Akzent: das ist EINE Reihe, hier hebt sich
     nichts gegen etwas anderes ab. */
  function muscleBars(muscles, opts) {
    if (!Array.isArray(muscles)) return null;

    var rows = [];
    for (var i = 0; i < muscles.length; i++) {
      var m = muscles[i];
      if (!m || typeof m !== 'object') continue;
      var v = num(m.vol);
      if (v === null || v <= 0) continue;
      var label = (typeof m.label === 'string') ? m.label.trim() : '';
      if (!label) continue;
      rows.push({ label: label, vol: v });
    }
    if (rows.length < MIN_BARS) return null;
    rows.sort(function (a, b) { return b.vol - a.vol; });

    return {
      type: 'bar',
      data: {
        labels: rows.map(function (r) { return r.label; }),
        datasets: [{
          data: rows.map(function (r) { return r.vol; }),
          backgroundColor: opts && opts.accent,
          borderWidth: 0,
          borderRadius: 4,
          borderSkipped: false,
          maxBarThickness: 18
        }]
      },
      options: Object.assign(baseOptions(), {
        indexAxis: 'y',
        animation: barAnimation(opts),
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) { return ' ' + fmtVol(c.parsed.x, opts); } } }
        },
        scales: {
          x: Object.assign({ beginAtZero: true },
               valueAxis(function (v) { return fmtVol(v, opts); })),
          // autoSkip aus: eine uebersprungene Gruppe waere ein Balken ohne Namen.
          y: { grid: { display: false },
               ticks: { font: { size: 10 }, color: '#8e8e93', autoSkip: false } }
        }
      })
    };
  }

  // ── oneRmLine ───────────────────────────────────────────────────────────

  /* Die Prognose als Zahlenpaar, oder null. Erwartet die Form von
     CoachReport.goalForecast() ({goalKg, weeks}); kg wird als Schluessel
     mitgelesen, damit die Aufrufstelle nicht umpacken muss. */
  function trendData(letzter, goal) {
    if (!goal || typeof goal !== 'object') return null;
    var kg = num(goal.goalKg);
    if (kg === null) kg = num(goal.kg);
    var weeks = num(goal.weeks);
    if (kg === null || weeks === null) return null;
    weeks = Math.round(weeks);
    if (weeks < 1) return null;
    if (letzter === null || kg <= letzter) return null;   // Ziel bereits erreicht
    return { kg: kg, weeks: weeks };
  }

  /* Wochenabstand zum juengsten echten Punkt: '-3 Wo.' / 'zuletzt' /
     '+2 Wo.'. Bewusst relativ und nicht als Kalenderwoche — die Punkte
     kommen als fortlaufende Wochennummer herein, aus der sich ohne
     Datumsrechnung keine Kalenderwoche ergibt. Geraten wird hier nichts. */
  function weekOffsetLabel(delta, opts) {
    var d = num(delta);
    if (d === null) return '';
    d = Math.round(d);
    if (d === 0) return txt(opts, 'zuletzt', 'latest');
    return (d > 0 ? '+' + d : String(d)) + txt(opts, ' Wo.', ' wk');
  }

  /* oneRmLine(points, goal, opts) -> Chart.js-Konfiguration | null

     points = [{weekIndex, kg}], weekIndex ist die fortlaufende
     ISO-Wochennummer aus CoachAnalyze.isoWeekIndex. Genau deshalb ist sie
     die Achse und nicht die Position in der Liste: eine dreiwoechige Pause
     zaehlte sonst als eine Woche, und der Verlauf saehe steiler aus, als er
     war. Die Wochen ohne Daten stehen als Luecke auf der Achse, und die
     Linie bricht dort ab (spanGaps: false).

     Je Woche zaehlt der hoechste Wert — es ist ein Bestwert-Verlauf.

     goal ist das Ergebnis von CoachReport.goalForecast(), also
     {goalKg, weeks}. Eine Zielzahl OHNE Wochenzahl ergibt keine Trendlinie:
     wie lange es dauert, weiss allein die Prognose, und dieses Modul
     erfindet den Zeitraum nicht. Aus demselben Grund entsteht keine
     Trendlinie zu einem Ziel, das schon erreicht ist. */
  function oneRmLine(points, goal, opts) {
    if (!Array.isArray(points)) return null;

    // Je Woche der hoechste Wert.
    var best = {}, idx = [];
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      if (!p || typeof p !== 'object') continue;
      var wi = num(p.weekIndex), kg = num(p.kg);
      if (wi === null || kg === null || kg <= 0) continue;
      wi = Math.round(wi);
      if (!Object.prototype.hasOwnProperty.call(best, wi)) { best[wi] = kg; idx.push(wi); }
      else if (kg > best[wi]) best[wi] = kg;
    }
    idx.sort(function (a, b) { return a - b; });

    // Nur die Wochen innerhalb der Achsenspanne, gerechnet ab der juengsten.
    if (idx.length) {
      var jung = idx[idx.length - 1];
      idx = idx.filter(function (w) { return w > jung - MAX_SPAN; });
    }
    if (idx.length < MIN_POINTS) return null;

    var von = idx[0], bis = idx[idx.length - 1];
    var span = bis - von + 1;

    var werte = new Array(span), labels = new Array(span);
    for (var s = 0; s < span; s++) { werte[s] = null; labels[s] = weekOffsetLabel(von + s - bis, opts); }
    for (var j = 0; j < idx.length; j++) werte[idx[j] - von] = best[idx[j]];

    var letzter = werte[span - 1];
    var trend = trendData(letzter, goal);

    var datasets = [{
      label: txt(opts, 'Bestwert', 'Best'),
      data: werte,
      borderColor: opts && opts.accent,
      backgroundColor: fillFor(opts && opts.accent),
      fill: true,
      tension: .4,
      pointBackgroundColor: opts && opts.accent,
      pointRadius: pointRadius(idx.length),
      pointHoverRadius: 7,
      borderWidth: 2.5,
      spanGaps: false
    }];

    if (trend) {
      for (var t = 0; t < trend.weeks; t++) {
        werte.push(null);
        labels.push(weekOffsetLabel(t + 1, opts));
      }
      var linie = new Array(span - 1);
      for (var n = 0; n < span - 1; n++) linie[n] = null;
      linie.push(letzter);
      for (var q = 1; q <= trend.weeks; q++) {
        linie.push(letzter + (trend.kg - letzter) * q / trend.weeks);
      }
      // Der letzte Punkt liegt exakt auf dem Ziel — eine Trendlinie, die
      // knapp daneben endet, waere eine andere Zusage als die Prognose.
      linie[linie.length - 1] = trend.kg;
      datasets.push({
        label: txt(opts, 'Prognose', 'Forecast'),
        data: linie,
        borderColor: opts && opts.muted,
        borderDash: [5, 4],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
        tension: 0,
        spanGaps: false
      });
    }

    return {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: Object.assign(baseOptions(), {
        animation: lineAnimation(opts),
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) {
            var name = c && c.dataset && c.dataset.label;
            return ' ' + (name ? name + ': ' : '') + fmtKg(c.parsed.y, opts);
          } } }
        },
        scales: {
          x: { grid: { display: false }, ticks: xTicks(labels.length) },
          y: valueAxis(function (v) { return fmtKg(v, opts); })
        }
      })
    };
  }

  var API = {
    volumeBars: volumeBars,
    muscleBars: muscleBars,
    oneRmLine: oneRmLine,
    MIN_BARS: MIN_BARS,
    MIN_POINTS: MIN_POINTS,
    MAX_BARS: MAX_BARS,
    MAX_SPAN: MAX_SPAN
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachCharts = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
