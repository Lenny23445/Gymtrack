/* GymTrack — Satz-Rueckfrage: leicht / passend / schwer (Baustein Task 15)
   Reine Logik, kein DOM, keine App-Globals, kein Netz. Die Ableitung des
   naechsten Gewichts ist bewusst vollstaendig algorithmisch: sie muss im
   Zweifel erklaerbar sein ("eine Stufe runter, weil du 'schwer' gesagt hast").
   Saetze formuliert dieses Modul nicht — ackFor() liefert nur den
   Persona-Schluessel samt Platzhalterwert.

   TYPKONTRAKT (gilt wortgleich in js/coach-warmup.js — zwei Coach-Module
   duerfen Zahlen nicht verschieden lesen):
   - Ein GEWICHT ist eine endliche Zahl. '60' ist ein String und damit kein
     Gewicht; adjustNext() und ackFor() geben dann null zurueck statt still zu
     rechnen. Die Umwandlung gehoert an die Verdrahtungsstelle, die weiss,
     woher der Wert kommt.
   - Eine OPTION (step, barKg) darf fehlen oder unbrauchbar sein und faellt
     dann auf ihre Vorgabe zurueck.
   - 'step' ist IMMER die kleinste Scheibe JE SEITE. Liegt eine Stange im Spiel
     (barKg > 0), verdoppelt dieses Modul intern, weil Scheiben paarweise
     aufliegen. Vorher meinte 'step' hier den Gesamtsprung und in
     coach-warmup.js die Scheibe je Seite: derselbe Geraeteparameter an beide
     ergab 57,5 kg, was mit 2,5er-Scheiben 18,75 kg je Seite braeuchte. */
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

  // Vorgabe fuer Aufrufstellen ohne Rasterangabe: kleinste Scheibe je Seite
  // 2,5 kg (an der Stange also 5 kg pro Sprung, an der Maschine 2,5 kg).
  var DEFAULT_STEP = 2.5;
  // Vorgabe fuer barKg: KEINE Stange. Maschine oder einzelner Stapel ist der
  // haeufigere Fall und zugleich der, den alte Aufrufe mit drei Argumenten
  // meinten — so bleibt adjustNext(60,'schwer',2.5) weiterhin 57,5.
  var DEFAULT_BAR = 0;
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

  // Zahl heisst Zahl: kein Number('60'). Siehe Typkontrakt im Kopf der Datei.
  function numOf(v) { return (typeof v === 'number' && isFinite(v)) ? v : NaN; }

  function usableStep(step) {
    var s = numOf(step);
    return s > 0 ? s : DEFAULT_STEP;
  }

  function usableBar(barKg) {
    var b = numOf(barKg);
    return b > 0 ? b : DEFAULT_BAR;
  }

  /* adjustNext(kg, answer, step, barKg) -> Zahl | null

     Rechnet in Raster-Einheiten statt in Kilo: so ist das Ergebnis immer ein
     Vielfaches der Schrittweite und damit auflegbar. Krumme Ausgangsgewichte
     (importiert oder von einer Maschine mit eigenem Raster) landen auf der
     naechsten Stufe in die gewuenschte Richtung, nie mehr als eine
     Schrittweite vom tatsaechlich gehobenen Gewicht entfernt.

     Das Raster liegt UEBER dem Stangengewicht: teilbar ist nur der Anteil, den
     man auflegt, und der liegt paarweise auf. Deshalb 2*step an der Stange und
     deshalb die Untergrenze beim Stangengewicht — 17,5 kg unter einer
     20-kg-Stange gibt es nicht. barKg ist optional; ohne ihn gilt Maschine
     bzw. einzelner Stapel, und Aufrufe mit drei Argumenten rechnen wie bisher. */
  function adjustNext(kg, answer, step, barKg) {
    var w = numOf(kg);
    if (!isFinite(w) || w <= 0) return null;

    var b = bucketOf(answer);
    // 'passend', unbekannt und unbeantwortet lassen den Vorschlag exakt
    // stehen — eine unbeantwortete Rueckfrage darf nichts kosten.
    if (b !== 'easy' && b !== 'hard') return w;

    var s = usableStep(step);
    var bar = usableBar(barKg);
    var inc = bar > 0 ? s * 2 : s;

    var q = (w - bar) / inc;
    var qr = Math.round(q);
    if (Math.abs(q - qr) < 1e-9) q = qr; // Float-Rauschen auf dem Raster glaetten

    var units = (b === 'easy') ? Math.floor(q) + 1 : Math.ceil(q) - 1;
    // Ohne Stange ist eine Schrittweite die Untergrenze (nie 0, nie negativ),
    // mit Stange die leere Stange selbst.
    var minUnits = bar > 0 ? 0 : 1;
    if (units < minUnits) units = minUnits;

    return Math.round((bar + units * inc) * 1000) / 1000;
  }

  // Quittung als Schluessel + Platzhalter, damit die Antwort nicht ins Leere
  // geht. 'passend' und keine Antwort erzeugen nichts: hoechstens eine
  // Aeusserung gleichzeitig, und ohne Neuigkeit gibt es keine.
  function ackFor(answer, nextKg) {
    var b = bucketOf(answer);
    if (b !== 'easy' && b !== 'hard') return null;
    var w = numOf(nextKg);
    if (!isFinite(w)) return null;
    // {kg} ist das NEUE Gewicht, nicht das gehobene. Der Satzkatalog sagt das
    // in beiden Richtungen ausdruecklich ('eine Stufe niedriger' / 'naechstes
    // Mal'); die frueheren setAckHard-Varianten behaupteten Bestaendigkeit und
    // widersprachen damit der eigenen Rechnung.
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
              RPE: RPE, DEFAULT_STEP: DEFAULT_STEP, DEFAULT_BAR: DEFAULT_BAR,
              TREND_MIN: TREND_MIN };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachRpe = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
