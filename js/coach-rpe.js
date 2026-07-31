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
  // Toleranz der Ableitung, in Wiederholungen. Eine einzelne Wiederholung mehr
  // oder weniger ist Tagesform — mit TOL 1 loeste praktisch jeder Satz eine
  // Anpassung aus, und die Anpassung waere damit so beliebig wie das Rauschen,
  // das sie ausloest.
  var TOL = 2;

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

  /* ── Lastanpassung nach Wiederholungsabweichung ────────────────────────────
     adjustNext() bewegt GENAU EINE Rasterstufe. Das ist an einer Maschine mit
     2,5-kg-Stufe brauchbar und beim Kreuzheben Unsinn: mit 1,25er-Scheiben sind
     das 2,5 kg auf 200 kg — ein Prozent, nachdem die Wiederholungen um drei
     eingebrochen sind. Die Stufengroesse beschreibt das GERAET, nicht die Last.

     Sportwissenschaftlich ist die Last relativ: das Verhaeltnis von Last zu
     erreichbaren Wiederholungen. Genau das beschreibt die Epley-Gleichung, mit
     der die App ohnehin ueberall rechnet (1RM = w * (1 + r/30)). Nach ihr
     aufgeloest ergibt sich das Gewicht, das bei GLEICHER geschaetzter
     Maximalkraft die Zielwiederholungen zulaesst:

         w_neu = w * (1 + r_ist/30) / (1 + r_ziel/30)

     Kreuzheben 200 kg, Ziel 8, geschafft 5  ->  184 kg statt 199,5 kg.
     Beinpresse 100 kg, Ziel 12, geschafft 9 ->  93 kg.

     Gedeckelt wird trotzdem, denn die Gleichung ist eine Schaetzung und kein
     Gesetz: mehr als 15 Prozent runter ist innerhalb einer Einheit kein
     Anpassen mehr, sondern ein anderer Trainingsreiz, und mehr als 10 Prozent
     rauf traegt keine Progressionslehre. Beide Grenzen sind ueberschreibbar.

     Gerundet wird auf das Raster des GERAETS (an der Stange Scheibe je Seite
     mal zwei, sonst die Stufe des Stapels) — und immer um mindestens eine
     Stufe, sonst haette eine erkannte Abweichung folgenlos bleiben koennen. */
  /* Deckel. Feste 15 und 10 Prozent waren fuer jeden Bereich dieselbe Zahl —
     und damit fuer keinen richtig. Was eine Wiederholung an Last WERT ist,
     haengt am Bereich: nach Epley traegt sie bei drei Zielwiederholungen rund
     3 Prozent der Last, bei zwanzig nur noch 2. Im Kraftbereich bremste ein
     starrer Deckel also zu frueh, im Ausdauerbereich liess er zu viel zu.

     Der Deckel ist deshalb ein Vielfaches dieses Werts: vier Wiederholungen
     nach unten, zweieinhalb nach oben. Nach unten mehr, weil ein Einbruch
     schnell korrigiert gehoert, nach oben weniger, weil Progression sich
     bewaehren muss. Die aeusseren Grenzen bleiben, damit kein Bereich absurde
     Werte erzeugt. */
  var CAP_DOWN_MIN = 0.05, CAP_DOWN_MAX = 0.20;
  var CAP_UP_MIN   = 0.03, CAP_UP_MAX   = 0.12;
  var CAP_DOWN = 0.15;   // Rueckfallwerte ohne brauchbaren Zielbereich
  var CAP_UP   = 0.10;

  function klemme(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // capsFor(target) -> {down, up}
  function capsFor(target) {
    var t = numOf(target);
    if (!isFinite(t) || t <= 0) return { down: CAP_DOWN, up: CAP_UP };
    var proRep = (1 / 30) / (1 + t / 30);      // Lastanteil einer Wiederholung
    return {
      down: klemme(4   * proRep, CAP_DOWN_MIN, CAP_DOWN_MAX),
      up:   klemme(2.5 * proRep, CAP_UP_MIN,   CAP_UP_MAX)
    };
  }

  function usableCap(v, fallback) {
    var c = numOf(v);
    return (c > 0 && c < 1) ? c : fallback;
  }

  // Auf das Geraeteraster legen. 'dir' erzwingt Bewegung: eine Anpassung, die
  // beim Ausgangsgewicht landet, waere eine Anpassung, die nichts anpasst.
  function snapTo(ziel, inc, bar, dir, von) {
    var q = (ziel - bar) / inc;
    var minUnits = bar > 0 ? 0 : 1;
    var units = Math.round(q);
    if (units < minUnits) units = minUnits;
    var out = Math.round((bar + units * inc) * 1000) / 1000;
    if (dir !== 0 && Math.abs(out - von) < 1e-9) {
      units += dir;
      if (units < minUnits) units = minUnits;
      out = Math.round((bar + units * inc) * 1000) / 1000;
    }
    return out;
  }

  /* adjustByReps(kg, opts) -> Zahl | null
     opts: {reps, target, step, barKg, maxDownPct, maxUpPct}
     step ist wie ueberall in diesem Modul die kleinste Scheibe JE SEITE; ohne
     barKg gilt Maschine/Kabel/Kurzhantel, dort ist step die ganze Stufe. */
  function adjustByReps(kg, opts) {
    var w = numOf(kg);
    if (!isFinite(w) || w <= 0) return null;
    var o = opts || {};
    var r = numOf(o.reps), t = numOf(o.target);
    if (!isFinite(r) || r <= 0 || !isFinite(t) || t <= 0) return null;
    if (r === t) return w;

    var s = usableStep(o.step);
    var bar = usableBar(o.barKg);
    var inc = bar > 0 ? s * 2 : s;

    var ziel = w * (1 + r / 30) / (1 + t / 30);

    /* Daempfung gegen Pendeln. Hat die App eben erst gesenkt und muesste jetzt
       wieder heben, war die erste Korrektur zu gross — dann nur den halben Weg
       gehen, statt zwischen zwei Werten hin und her zu springen. 'dampen' ist
       der Anteil der Abweichung, der noch gegangen wird; die Aufrufstelle kennt
       die Richtung der letzten Korrektur, dieses Modul nicht. */
    var d = numOf(o.dampen);
    if (isFinite(d) && d > 0 && d < 1) ziel = w + (ziel - w) * d;

    var caps = capsFor(t);
    var unten = w * (1 - usableCap(o.maxDownPct, caps.down));
    var oben  = w * (1 + usableCap(o.maxUpPct, caps.up));
    if (ziel < unten) ziel = unten;
    if (ziel > oben)  ziel = oben;

    return snapTo(ziel, inc, bar, r < t ? -1 : 1, w);
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

  /* derive(reps, opts) -> 'easy' | 'ok' | 'hard' | null

     Dieselbe Skala wie bucketOf(), nur aus Zahlen statt aus einer Antwort. Die
     Rueckfrage nach jedem Satz ist damit entfallen: was der Nutzer geantwortet
     haette, steht bereits im Satz. Weniger Wiederholungen als prognostiziert
     heisst schwer, mehr heisst leicht.

     opts: {min, max, target, type}
     - min/max sind die Grenzen des Wiederholungsbereichs der Uebung. Sie sind
       HARTE Kanten: unterhalb des Minimums ist der Satz schwer und oberhalb des
       Maximums leicht, ganz gleich, was die Prognose sagte.
     - target ist die Prognose (Vorschlag der App). Fehlt sie, gilt das Minimum —
       der Anfang des Bereichs ist die Vorgabe der Double Progression.
     - type === 'fail' (bis zum Versagen) unter der Prognose ist immer schwer:
       da war die Grenze erreicht, nicht die Wiederholungszahl.
     Zahl heisst Zahl (Typkontrakt im Kopf der Datei): '8' ist ein String und
     ergibt null, statt still als 8 gelesen zu werden. */
  function derive(reps, opts) {
    var r = numOf(reps);
    if (!isFinite(r) || r <= 0) return null;
    var o = opts || {};
    var min = numOf(o.min); if (!isFinite(min) || min <= 0) min = 1;
    var max = numOf(o.max); if (!isFinite(max) || max < min) max = min;
    var tgt = numOf(o.target); if (!isFinite(tgt) || tgt <= 0) tgt = min;
    if (tgt < min) tgt = min;
    if (tgt > max) tgt = max;
    if (o.type === 'fail' && r < tgt) return 'hard';
    if (r < min || r <= tgt - TOL) return 'hard';
    if (r > max || r >= tgt + TOL) return 'easy';
    return 'ok';
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

  var API = { toRpe: toRpe, adjustNext: adjustNext, adjustByReps: adjustByReps,
              ackFor: ackFor, summarize: summarize, derive: derive,
              RPE: RPE, DEFAULT_STEP: DEFAULT_STEP, DEFAULT_BAR: DEFAULT_BAR,
              TREND_MIN: TREND_MIN, TOL: TOL, capsFor: capsFor,
              CAP_DOWN: CAP_DOWN, CAP_UP: CAP_UP,
              CAP_DOWN_MIN: CAP_DOWN_MIN, CAP_DOWN_MAX: CAP_DOWN_MAX,
              CAP_UP_MIN: CAP_UP_MIN, CAP_UP_MAX: CAP_UP_MAX };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachRpe = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
