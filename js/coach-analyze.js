/* GymTrack — Coach-Analyse (Block 3, Task 16)
   Plateau-Diagnose und Zeitbudget-Priorisierung.

   Rein algorithmisch: kein Netzaufruf, kein Modell, kein DOM, keine
   App-Globals. Das ist Absicht und keine Sparmassnahme — eine Diagnose, die
   der Coach aus Zahlen ableitet, ist erklaerbar und kostet nichts. Alle Daten
   kommen als Argument herein, die Sprache ebenso.

   Zwei Grenzen, die dieses Modul bewusst NICHT ueberschreitet:
   - Es formuliert keine Saetze. Zurueck kommen Schluessel und Platzhalterwerte
     fuer CoachPersona.say(); den Wortlaut haelt allein der Satzkatalog.
   - Es beschreibt, es schreibt nichts vor. Kein Vorschlag zur Aenderung des
     Trainingsplans, kein Schreibzugriff auf die heutige Uebungsliste — die
     Priorisierung gilt fuer die heutige Durchfuehrung, der gespeicherte Plan
     bleibt unberuehrt (auch die uebergebenen Arrays werden nicht umsortiert). */
(function (root) {
  'use strict';

  // Die drei Werte sind die Anforderung, nicht meine Wahl.
  var MIN_WEEKS    = 4;   // unter vier Wochen wird nichts gemeldet
  var SEC_PER_SET  = 55;  // Ausfuehrung eines Satzes ohne Pause
  var REST_DEFAULT = 90;  // Pause, wenn die Uebung keine eigene nennt

  // Bis zu drei ausgelassene Wochen sind Alltag (krank, Urlaub, verschoben) und
  // gehoeren in dasselbe Plateau. Mehr ist eine Pause und kein Stillstand: die
  // Wochen davor sagen ueber das Heute nichts mehr aus, also zaehlt nur der
  // Abschnitt nach der Pause. Ohne diese Grenze meldete das Modul nach einem
  // Sommerloch "steht seit 14 Wochen", was schlicht falsch waere.
  var MAX_GAP_WEEKS = 3;

  // Fuenf Prozent mehr Volumen bei gleichem Gewicht sind Fortschritt (mehr
  // Wiederholungen oder mehr Saetze) und damit kein Plateau. Unter fuenf Prozent
  // liegt woechentliches Rauschen — mit engerer Schranke meldete das Modul nie
  // etwas, mit weiterer uebersaehe es echten Wiederholungsfortschritt.
  var VOL_TOL = 0.05;

  var EPS     = 1e-6;
  var DAY_MS  = 86400000;
  var WEEK_MS = 7 * DAY_MS;

  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function round1(v) { return Math.round(v * 10) / 10; }

  // ── ISO-Woche ───────────────────────────────────────────────────────────
  // Alles in UTC gerechnet: dieselben Millisekunden ergeben dann in jeder
  // Zeitzone dieselbe Woche. Die Woche laeuft Montag bis Sonntag, das ISO-Jahr
  // entscheidet der Donnerstag — deshalb liegt der 29.12.2025 in 2026-W01 und
  // der 01.01.2027 noch in 2026-W53.

  function isoMondayMs(ts) {
    var t = num(ts);
    if (t === null) return null;
    var d = new Date(t);
    if (isNaN(d.getTime())) return null;
    var day = d.getUTCDay() || 7; // Mo = 1 ... So = 7
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - (day - 1) * DAY_MS;
  }

  // Fortlaufende Wochennummer ohne Jahresgrenze. Nur damit laesst sich eine
  // Spanne ueber den Jahreswechsel rechnen; mit der Wochenzahl aus dem
  // Schluessel faellt sie von 53 auf 1 und wird negativ.
  function isoWeekIndex(ts) {
    var mon = isoMondayMs(ts);
    return mon === null ? null : Math.floor(mon / WEEK_MS);
  }

  function isoWeekKey(ts) {
    var mon = isoMondayMs(ts);
    if (mon === null) return null;
    var thu = mon + 3 * DAY_MS;
    var year = new Date(thu).getUTCFullYear();
    var week = Math.floor((thu - Date.UTC(year, 0, 1)) / WEEK_MS) + 1;
    return year + '-W' + (week < 10 ? '0' + week : String(week));
  }

  // ── Plateau ─────────────────────────────────────────────────────────────

  function normRow(r) {
    if (!r || typeof r !== 'object') return null;
    var ts = num(r.ts), kg = num(r.topKg);
    if (ts === null || kg === null || kg <= 0) return null; // ohne Gewicht keine Aussage
    var vol = num(r.vol);
    var rest = num(r.avgRestSecs);
    return {
      ts: ts,
      wk: isoWeekIndex(ts),
      topKg: kg,
      vol: (vol === null || vol < 0) ? 0 : vol,
      avgRestSecs: (rest === null || rest <= 0) ? REST_DEFAULT : rest
    };
  }

  // Eigene Liste, eigene Sortierung: die Historie des Aufrufers wird nicht
  // angefasst. "Neueste zuletzt" ist die Zusage, aufsteigend sortiert wird
  // trotzdem — sonst haengt das Vorzeichen der Deltas an der Aufrufstelle.
  function normHistory(history) {
    if (!Array.isArray(history)) return [];
    var out = [];
    for (var i = 0; i < history.length; i++) {
      var r = normRow(history[i]);
      if (r) out.push(r);
    }
    out.sort(function (a, b) { return a.ts - b.ts; });
    return out;
  }

  // Nur der letzte zusammenhaengende Abschnitt wird beurteilt.
  function trailingRun(list) {
    var start = 0;
    for (var i = 1; i < list.length; i++) {
      if (list[i].wk - list[i - 1].wk - 1 > MAX_GAP_WEEKS) start = i;
    }
    return list.slice(start);
  }

  /* plateau(history) -> {weeks, entries, topKg, volDelta, restDelta,
                          avgRestSecs, weekFrom, weekTo} | null

     Beobachtungen, keine Empfehlung. Gemeldet wird nur, wenn
     - mindestens MIN_WEEKS Eintraege vorliegen,
     - der beurteilte Abschnitt mindestens MIN_WEEKS Kalenderwochen spannt,
     - am Ende nicht mehr Gewicht steht als am Anfang und
     - das Volumen nicht deutlich gewachsen ist.
     Ein einzelner Ausreisser in der Mitte hebt das Plateau NICHT auf: es
     zaehlen erste und letzte Woche des Abschnitts, nicht das Maximum. Sonst
     genuegte eine gute Woche, um die Diagnose auf Dauer stumm zu stellen. */
  function plateau(history) {
    var all = normHistory(history);
    if (all.length < MIN_WEEKS) return null;

    var seg = trailingRun(all);
    if (seg.length < MIN_WEEKS) return null;

    var first = seg[0], last = seg[seg.length - 1];
    var weeks = last.wk - first.wk + 1;
    if (weeks < MIN_WEEKS) return null; // mehrere Eintraege in derselben Woche
    if (last.topKg > first.topKg + EPS) return null;
    if (first.vol > 0 && last.vol > first.vol * (1 + VOL_TOL)) return null;

    var restSum = 0;
    for (var i = 0; i < seg.length; i++) restSum += seg[i].avgRestSecs;

    return {
      weeks: weeks,
      entries: seg.length,
      topKg: round1(last.topKg),
      volDelta: Math.round(last.vol - first.vol),
      restDelta: Math.round(last.avgRestSecs - first.avgRestSecs),
      avgRestSecs: Math.round(restSum / seg.length),
      weekFrom: isoWeekKey(first.ts),
      weekTo: isoWeekKey(last.ts)
    };
  }

  /* plateauSay(diag, exName) -> {key:'plateau', vars:{ex, weeks, secs}} | null
     secs ist die BEOBACHTETE mittlere Pause des Abschnitts, keine Vorgabe.
     Formuliert wird daraus in CoachPersona.say(). */
  function plateauSay(diag, exName) {
    if (!diag || typeof diag !== 'object') return null;
    var weeks = num(diag.weeks), secs = num(diag.avgRestSecs);
    if (weeks === null || secs === null) return null;
    return {
      key: 'plateau',
      vars: { ex: (exName === undefined || exName === null) ? '' : String(exName), weeks: weeks, secs: secs }
    };
  }

  // ── Zeitbudget ──────────────────────────────────────────────────────────

  /* costSecs(ex) -> Sekunden. sets x (Ausfuehrung + Pause). Ohne restSecs gilt
     REST_DEFAULT, ohne brauchbares sets ein Satz — eine Uebung im Plan kostet
     nie null Zeit, sonst rutschte sie gratis in jedes Budget. */
  function costSecs(ex) {
    if (!ex || typeof ex !== 'object') return 0;
    var sets = num(ex.sets);
    sets = (sets === null || sets < 1) ? 1 : Math.round(sets);
    var rest = num(ex.restSecs);
    rest = (rest === null || rest < 0) ? REST_DEFAULT : rest;
    return sets * (SEC_PER_SET + rest);
  }

  // Kleinere prio ist wichtiger (prio 1 = wichtigste Uebung). Ohne prio steht
  // die Uebung hinten an, statt zufaellig vorne zu landen.
  function prioRank(ex) {
    var p = num(ex.prio);
    return p === null ? Number.MAX_VALUE : p;
  }

  /* prioritize(exercises, minutes) -> {keep: string[], drop: string[]}

     Nach prio sortieren, dann der Reihe nach ins Budget fuellen. Passt eine
     Uebung nicht, wird sie gestrichen und die naechste weiter geprueft (nicht
     abgebrochen): so bleiben zwei wichtige kurze Uebungen erhalten, statt an
     einer teuren zu scheitern. Die wichtigste Uebung bleibt IMMER, auch wenn
     sie das Budget allein sprengt — ein Trainingsplan ohne eine einzige Uebung
     ist kein Ergebnis, sondern ein Fehler. Eintraege ohne id fallen heraus,
     weil sie nirgends benannt werden koennten. */
  function prioritize(exercises, minutes) {
    var out = { keep: [], drop: [] };
    if (!Array.isArray(exercises)) return out;

    var list = [];
    for (var i = 0; i < exercises.length; i++) {
      var ex = exercises[i];
      if (!ex || typeof ex !== 'object') continue;
      if (ex.id === undefined || ex.id === null || ex.id === '') continue;
      list.push({ id: String(ex.id), rank: prioRank(ex), cost: costSecs(ex), pos: i });
    }
    if (!list.length) return out;

    // Eigene Liste, stabile Sortierung ueber pos — die Eingabe bleibt, wie sie war.
    list.sort(function (a, b) { return (a.rank - b.rank) || (a.pos - b.pos); });

    var mins = num(minutes);
    var left = (mins === null || mins < 0) ? 0 : mins * 60;

    for (var j = 0; j < list.length; j++) {
      if (j === 0 || list[j].cost <= left) {
        out.keep.push(list[j].id);
        left -= list[j].cost;
      } else {
        out.drop.push(list[j].id);
      }
    }
    return out;
  }

  /* prioritizeSay(result, minutes) -> {key:'timeBudget', vars:{mins, count}} */
  function prioritizeSay(result, minutes) {
    var keep = (result && Array.isArray(result.keep)) ? result.keep : [];
    var mins = num(minutes);
    return { key: 'timeBudget', vars: { mins: mins === null ? '' : Math.round(mins), count: keep.length } };
  }

  var API = {
    plateau: plateau,
    plateauSay: plateauSay,
    prioritize: prioritize,
    prioritizeSay: prioritizeSay,
    costSecs: costSecs,
    isoWeekKey: isoWeekKey,
    isoWeekIndex: isoWeekIndex,
    MIN_WEEKS: MIN_WEEKS,
    SEC_PER_SET: SEC_PER_SET,
    REST_DEFAULT: REST_DEFAULT,
    MAX_GAP_WEEKS: MAX_GAP_WEEKS,
    VOL_TOL: VOL_TOL
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachAnalyze = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
