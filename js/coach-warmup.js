/* GymTrack — Aufwaermsaetze (Baustein 14, Block 3)

   Reine Arithmetik, kein Modell und kein Netz: das Schema ist eine Konstante,
   der Rest ist Runden. Kein DOM, keine App-Globals — Schrittweite und
   Stangengewicht kommen als Argument herein.

   Das Modul formuliert KEINEN Coach-Satz. format() setzt nur die Zahlenreihe
   ('20 kg × 5, 30 kg × 3'); der Satz drumherum kommt aus
   CoachPersona.say('warmupIntro', …) an der Verdrahtungsstelle. */
(function (root) {
  'use strict';

  // Das verbreitetste Aufwaermschema. Es steht hier als Konstante, damit es an
  // genau einer Stelle steht — nicht, damit es pro Nutzer variiert.
  var SCHEME = [
    { pct: 50, reps: 5 },
    { pct: 70, reps: 3 },
    { pct: 85, reps: 1 }
  ];

  var DEFAULT_STEP = 2.5;  // kleinste Scheibe JE SEITE
  var DEFAULT_BAR  = 20;   // Standard-Langhantel
  var MIN_WORK_KG  = 30;   // darunter gibt es nichts sinnvoll aufzuwaermen

  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : NaN; }

  // Gleitkomma-Staub abschneiden: 20 + 3*2.5 darf nicht als 27.500000000000004
  // in die Anzeige laufen.
  function r3(v) { return Math.round(v * 1000) / 1000; }

  function stepOf(v) { var s = num(v); return s > 0 ? s : DEFAULT_STEP; }
  function barOf(v)  { var b = num(v); return b >= 0 ? b : DEFAULT_BAR; }

  // Der Kern der Rundung. Zwei Punkte, die beide falsch waeren, wenn man das
  // Gesamtgewicht rundete:
  //   1. Die Stange ist fix. Teilbar ist nur der Anteil DARUEBER.
  //   2. Scheiben liegen paarweise auf. Mit 2,5er-Scheiben ist die kleinste
  //      Gesamtstufe 5 kg, nicht 2,5 kg — 43,7 kg werden 45 kg, nicht 42,5 kg.
  // Ohne Stange (Maschine, Steckgewicht, Kabelzug) gibt es kein Paar: dort ist
  // 'step' die Stufe des Stapels selbst.
  function plateStep(step, barKg) {
    return barKg > 0 ? step * 2 : step;
  }

  function roundToPlate(kg, step, barKg) {
    var s = stepOf(step);
    var b = barOf(barKg);
    var w = num(kg);
    // Unter dem Stangengewicht gibt es nichts abzunehmen: die leere Stange ist
    // die Untergrenze, nicht die Null.
    if (!isFinite(w) || w <= b) return r3(b);
    var inc = plateStep(s, b);
    var steps = Math.round((w - b) / inc);
    if (steps < 0) steps = 0;
    return r3(b + steps * inc);
  }

  // Liefert [{kg, reps, pct}] — aufsteigend, ohne Doppelstufe, und garantiert
  // unter dem Arbeitsgewicht. Leere Liste, wenn Aufwaermen nichts brachte.
  function warmupSets(workKg, opts) {
    var o = opts || {};
    var step = stepOf(o.step);
    var bar  = barOf(o.barKg);
    var work = num(workKg);
    if (!isFinite(work) || work <= 0) return [];

    // Untergrenze: zwei Stufen ueber der Stange, aber nie unter 30 kg. Wer mit
    // 25 kg arbeitet, waermt sich nicht an einer 20-kg-Stange auf.
    if (work < Math.max(bar + 2 * step, MIN_WORK_KG)) return [];

    var out = [];
    SCHEME.forEach(function (s) {
      var kg = roundToPlate(work * s.pct / 100, step, bar);
      // Ein 'Aufwaermsatz' auf Arbeitsgewicht ist der Arbeitssatz. Nach dem
      // Aufrunden kann die 85-%-Stufe dort landen — dann faellt sie weg.
      if (kg >= work) return;
      // Runden zwei Prozentstufen auf dasselbe Gewicht, bleibt der erste
      // Eintrag stehen: er traegt die hoehere Wiederholungszahl, und die ist
      // am leichten Gewicht die nuetzlichere Ansage. Damit sind die Saetze
      // zugleich streng steigend.
      if (out.length && kg <= out[out.length - 1].kg) return;
      out.push({ kg: kg, reps: s.reps, pct: s.pct });
    });
    return out;
  }

  // Zahlformat wie in js/coach-persona.js und js/coach-intent.js: deutsch
  // Komma, englisch Punkt. Zwei Coach-Module duerfen nicht verschieden runden.
  function fmtKg(v, lang) {
    return Number(v).toLocaleString(lang === 'en' ? 'en-US' : 'de-DE', { maximumFractionDigits: 1 });
  }

  function format(sets, lang) {
    var l = lang === 'en' ? 'en' : 'de';
    return (sets || []).filter(function (s) {
      return s && isFinite(num(s.kg));
    }).map(function (s) {
      var txt = fmtKg(s.kg, l) + ' kg';
      var reps = num(s.reps);
      return (isFinite(reps) && reps > 0) ? txt + ' × ' + reps : txt;
    }).join(', ');
  }

  var API = {
    warmupSets: warmupSets,
    roundToPlate: roundToPlate,
    format: format,
    SCHEME: SCHEME,
    DEFAULT_STEP: DEFAULT_STEP,
    DEFAULT_BAR: DEFAULT_BAR,
    MIN_WORK_KG: MIN_WORK_KG
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachWarmup = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
