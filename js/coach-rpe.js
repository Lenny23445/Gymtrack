/* GymTrack — Satz-Rueckfrage: leicht / passend / schwer (Baustein Task 15)
   Reine Logik, kein DOM, keine App-Globals, kein Netz. Die Ableitung des
   naechsten Gewichts ist bewusst vollstaendig algorithmisch: sie muss im
   Zweifel erklaerbar sein ("eine Stufe runter, weil du 'schwer' gesagt hast").
   Saetze formuliert dieses Modul nicht — ackFor() liefert nur den
   Persona-Schluessel samt Platzhalterwert. */
(function (root) {
  'use strict';

  // Bewusst grob: drei Stufen statt einer Zehnerskala, die niemand ehrlich
  // ausfuellt. 6 = klar Reserve, 8 = passend, 9,5 = fast am Limit.
  var RPE = { easy: 6, ok: 8, hard: 9.5 };

  // Antwort-Woerter beider Sprachen auf denselben Eimer. Intern deutsch
  // erhoben, Sprache kommt an der Oberflaeche dazu — das Modul liest nie
  // selbst localStorage.
  var BUCKET = {
    leicht: 'easy',  easy: 'easy',
    passend: 'ok',   ok: 'ok',
    schwer: 'hard',  hard: 'hard'
  };

  // Vorgabe fuer Aufrufstellen ohne Rasterangabe (Hanteln/Langhantel in
  // Europa): 2 x 1,25 kg Scheiben = 2,5 kg pro Sprung.
  var DEFAULT_STEP = 2.5;
  var TREND_MIN = 2; // Ein einzelner Satz behauptet noch keinen Trend.

  function bucketOf(answer) {
    if (typeof answer !== 'string') return null;
    var k = answer.trim().toLowerCase();
    return BUCKET[k] || null;
  }

  function toRpe(answer) {
    var b = bucketOf(answer);
    return b ? RPE[b] : null;
  }

  function usableStep(step) {
    var s = Number(step);
    return (isFinite(s) && s > 0) ? s : DEFAULT_STEP;
  }

  // Rechnet in Raster-Einheiten statt in Kilo: so ist das Ergebnis immer ein
  // Vielfaches der Schrittweite und damit auflegbar. Krumme Ausgangsgewichte
  // (importiert oder von einer Maschine mit eigenem Raster) landen auf der
  // naechsten Stufe in die gewuenschte Richtung, nie mehr als eine
  // Schrittweite vom tatsaechlich gehobenen Gewicht entfernt.
  function adjustNext(kg, answer, step) {
    var w = Number(kg);
    if (!isFinite(w) || w <= 0) return null;

    var b = bucketOf(answer);
    // 'passend', unbekannt und unbeantwortet lassen den Vorschlag exakt
    // stehen — eine unbeantwortete Rueckfrage darf nichts kosten.
    if (b !== 'easy' && b !== 'hard') return w;

    var s = usableStep(step);
    var q = w / s;
    var qr = Math.round(q);
    if (Math.abs(q - qr) < 1e-9) q = qr; // Float-Rauschen auf dem Raster glaetten

    var units = (b === 'easy') ? Math.floor(q) + 1 : Math.ceil(q) - 1;
    if (units < 1) units = 1; // nie unter eine Schrittweite, nie 0 oder negativ

    return Math.round(units * s * 1000) / 1000;
  }

  // Quittung als Schluessel + Platzhalter, damit die Antwort nicht ins Leere
  // geht. 'passend' und keine Antwort erzeugen nichts: hoechstens eine
  // Aeusserung gleichzeitig, und ohne Neuigkeit gibt es keine.
  function ackFor(answer, nextKg) {
    var b = bucketOf(answer);
    if (b !== 'easy' && b !== 'hard') return null;
    var w = Number(nextKg);
    if (!isFinite(w)) return null;
    return { key: b === 'easy' ? 'setAckEasy' : 'setAckHard', vars: { kg: w } };
  }

  // Trend fuers Dossier. Mehrheit UND mindestens zwei gleiche Antworten,
  // sonst 'ok': ein Gleichstand oder eine einzelne Angabe ist kein Trend.
  function summarize(answers) {
    var list = Array.isArray(answers) ? answers : [];
    var out = { easy: 0, ok: 0, hard: 0, trend: 'ok' };
    for (var i = 0; i < list.length; i++) {
      var b = bucketOf(list[i]);
      if (b) out[b]++; // Unsinn und unbeantwortet zaehlen gar nicht mit
    }
    if (out.hard > out.easy && out.hard >= TREND_MIN) out.trend = 'hard';
    else if (out.easy > out.hard && out.easy >= TREND_MIN) out.trend = 'easy';
    return out;
  }

  var API = { toRpe: toRpe, adjustNext: adjustNext, ackFor: ackFor,
              summarize: summarize,
              RPE: RPE, DEFAULT_STEP: DEFAULT_STEP, TREND_MIN: TREND_MIN };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachRpe = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
