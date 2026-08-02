/* GymTrack — Wochenvolumen und Frequenz je Muskelgruppe

   Reine Arithmetik, kein Modell und kein Netz. Das Modul kennt weder S noch
   exById: es bekommt fertige Zeilen {ts, mg, sets} und gibt Zahlen zurueck.

   WARUM ES DAS GIBT
   Die Richtwerte standen bisher ausschliesslich im Prompt des Workers
   (ai-worker/worker.js). Damit hingen Volumensteuerung und Frequenz an
   Premium, Netz und Monatskontingent — genau die drei Dinge, die im Zweifel
   fehlen. Wochensaetze je Muskelgruppe sind aber die belastbarste
   Stellgroesse ueberhaupt; sie gehoeren in die App und nicht in eine Antwort.

   RICHTWERTE
   Rund 10 Arbeitssaetze je Muskelgruppe und Woche sind die untere Grenze, der
   brauchbare Bereich liegt bei 10 bis 20. Darueber steigt die Erholungslast
   schneller als der Reiz — deshalb 'hoch' und nicht 'besser'. Es sind
   Richtwerte, keine Grenzwerte; das Urteil heisst darum 'low'/'ok'/'high'.

   FREQUENZ
   Zweimal pro Woche je Muskelgruppe schlaegt einmal bei gleichem Volumen.
   Gezaehlt werden TAGE mit Reiz, nicht Einheiten: zwei Einheiten am selben Tag
   sind ein Reiz.

   Aufwaermsaetze gehoeren NICHT in 'sets' — sie tragen kein Volumen im Sinne
   der Richtwerte, und die Aufrufstelle filtert sie bereits (_workSets). */
(function (root) {
  'use strict';

  var WEEK_MS  = 7 * 24 * 60 * 60 * 1000;
  var MEV      = 10;   // untere Grenze je Muskelgruppe und Woche
  var MAV      = 20;   // oberes Ende des brauchbaren Bereichs
  var MIN_DAYS = 2;    // Reiztage je Muskelgruppe und Woche

  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function dayKey(ts) { return Math.floor(ts / 864e5); }

  /* weekLoad(rows, now, weeks) -> {weeks, byMuscle:{mg:{sets, days,
                                    setsPerWeek, daysPerWeek}}, totalSets}

     'weeks' ist das Fenster in Wochen (Vorgabe 1). Die Kennzahlen stehen JE
     WOCHE, sonst waeren sie mit den Richtwerten nicht vergleichbar. Zeilen
     ohne brauchbaren Zeitstempel, ohne Muskelgruppe oder ohne Satzzahl zaehlen
     nicht mit — stillschweigend, denn eine halbe Zeile ist keine Messung. */
  function weekLoad(rows, now, weeks) {
    var w = num(weeks); if (w === null || w < 1) w = 1;
    var jetzt = num(now); if (jetzt === null) jetzt = 0;
    var von = jetzt - w * WEEK_MS;
    var byMuscle = {}, tage = {}, total = 0;

    (rows || []).forEach(function (r) {
      if (!r) return;
      var ts = num(r.ts), n = num(r.sets), mg = r.mg;
      if (ts === null || n === null || n <= 0) return;
      if (typeof mg !== 'string' || !mg) return;
      if (ts <= von || ts > jetzt) return;
      if (!byMuscle[mg]) { byMuscle[mg] = { sets: 0, days: 0 }; tage[mg] = {}; }
      byMuscle[mg].sets += n;
      tage[mg][dayKey(ts)] = true;
      total += n;
    });

    Object.keys(byMuscle).forEach(function (mg) {
      byMuscle[mg].days = Object.keys(tage[mg]).length;
      // Gerundet auf eine Stelle: '12,5 Saetze je Woche' ist eine ehrliche
      // Aussage, '12,4999' waere Genauigkeit, die nicht da ist.
      byMuscle[mg].setsPerWeek = Math.round((byMuscle[mg].sets / w) * 10) / 10;
      byMuscle[mg].daysPerWeek = Math.round((byMuscle[mg].days / w) * 10) / 10;
    });
    return { weeks: w, byMuscle: byMuscle, totalSets: total };
  }

  /* verdict(load, opts) -> [{mg, sets, days, state, freqLow, mev, mav}]
     Sortiert nach Dringlichkeit: zu wenig zuerst, dann zu viel, dann in
     Ordnung — die Zeile, die eine Handlung nach sich zieht, steht oben. */
  function verdict(load, opts) {
    var mev = (opts && num(opts.mev) > 0) ? num(opts.mev) : MEV;
    var mav = (opts && num(opts.mav) > 0) ? num(opts.mav) : MAV;
    var minDays = (opts && num(opts.minDays) > 0) ? num(opts.minDays) : MIN_DAYS;
    var by = (load && load.byMuscle) || {};
    var out = Object.keys(by).map(function (mg) {
      var s = by[mg].setsPerWeek, d = by[mg].daysPerWeek;
      return {
        mg: mg,
        sets: s,
        days: d,
        state: s < mev ? 'low' : (s > mav ? 'high' : 'ok'),
        freqLow: d < minDays,
        mev: mev, mav: mav
      };
    });
    var rang = { low: 0, high: 1, ok: 2 };
    out.sort(function (a, b) {
      if (rang[a.state] !== rang[b.state]) return rang[a.state] - rang[b.state];
      return b.sets - a.sets;
    });
    return out;
  }

  /* worstFirst(list) -> Zeile | null
     Die EINE Zeile, die einen Satz wert ist. Zu wenig Volumen schlaegt zu
     seltene Frequenz, weil ohne Volumen die Frequenz nichts zu verteilen hat.
     Ist alles in Ordnung, gibt es nichts zu sagen — dann null und kein Lob mit
     Zahlen, das keine Handlung traegt. */
  function worstFirst(list) {
    var l = list || [];
    var low = l.filter(function (x) { return x.state === 'low'; })[0];
    if (low) return low;
    var freq = l.filter(function (x) { return x.freqLow && x.state !== 'high'; })[0];
    if (freq) return freq;
    var high = l.filter(function (x) { return x.state === 'high'; })[0];
    return high || null;
  }

  var API = {
    weekLoad: weekLoad,
    verdict: verdict,
    worstFirst: worstFirst,
    MEV: MEV, MAV: MAV, MIN_DAYS: MIN_DAYS, WEEK_MS: WEEK_MS
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachVolume = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
