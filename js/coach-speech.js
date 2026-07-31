/* GymTrack — Sprach-Parser fuer die Coach-Leiste im Training.

   Der Sprech-Knopf liefert einen Text. Dieses Modul entscheidet als ERSTES,
   ob dieser Text eine HANDLUNG ist:

     logSet  — "80 Kilo 8 Wiederholungen"      -> Satz eintragen
     addSet  — "soll ich noch einen Topsatz?"  -> Satz anhaengen
     explain — "wie fuehre ich das aus?"       -> Ausfuehrung erklaeren

   Alles andere ergibt null und laeuft weiter wie bisher: erst der
   Intent-Router (js/coach-intent.js), dann das Modell.

   ZWEI DINGE, DIE MAN BEIM AENDERN WISSEN MUSS
   ============================================
   1) ERLAUBNISLISTE, NICHT SPERRLISTE. logSet und addSet tragen etwas ins
      Trainingsprotokoll ein — ein Fehltreffer schreibt also ungefragt Zahlen
      in die Daten des Nutzers. Deshalb muss JEDES Wort der Aeusserung in der
      jeweiligen Liste stehen; ein einziges unbekanntes Wort bricht die Form
      und die Aeusserung laeuft als Frage weiter. Das ist dieselbe
      Entscheidung wie bei WARMUP_ONLY in coach-intent.js, aus demselben
      Grund: eine Sperrliste ist nach aussen offen, eine Erlaubnisliste nicht.
      'explain' ist bewusst LOCKER — es loest keine Handlung aus, sondern
      formt nur die Frage ans Modell; ein Fehltreffer kostet dort nichts.

   2) DAS GESUNDHEITS-GATE IST GELIEHEN, NICHT NACHGEBAUT. medical() lebt in
      coach-intent.js und wird von dort geholt. Eine zweite Wortliste hier
      waere genau der Fehler, den die Umkehr dort behoben hat: zwei Listen
      laufen auseinander, und die schlechtere entscheidet. Fehlt das Modul
      (falsche Ladereihenfolge), antwortet dieses Modul auf NICHTS mehr —
      lieber kein lokaler Treffer als einer ohne Gesundheitspruefung. */
(function (root) {
  'use strict';

  // Zahlwoerter bis zwoelf — darueber diktiert praktisch jeder Ziffern, und
  // eine laengere Tabelle brachte nur mehr Woerter in die Erlaubnisliste.
  var WORDNUM = {
    ein: 1, eine: 1, eins: 1, zwei: 2, drei: 3, vier: 4, fuenf: 5, sechs: 6,
    sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwoelf: 12,
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
    nine: 9, ten: 10, eleven: 11, twelve: 12
  };
  var UNIT_KG  = { kg: 1, kgs: 1, kilo: 1, kilos: 1, kilogramm: 1, kilogramms: 1, kilogram: 1, kilograms: 1 };
  var UNIT_LBS = { lbs: 1, lb: 1, pfund: 1, pound: 1, pounds: 1 };
  // Wiederholungs-Marker. 'mal'/'x'/'times' sind DOPPELDEUTIG: zwischen zwei
  // Zahlen sind sie ein Mal-Zeichen ("80 mal 8" = 80 kg x 8 Wdh), hinter einer
  // Zahl ein Wiederholungswort ("5 mal gemacht"). Siehe parseLogSet() unten.
  var REP_MARK = { wiederholung: 1, wiederholungen: 1, wdh: 1, reps: 1, rep: 1,
                   repetitions: 1, mal: 1, x: 1, times: 1 };
  // Inhaltsleere Woerter, die in einem Satz-Diktat vorkommen duerfen. Jedes
  // Wort hier ist eine bewusste Entscheidung: es darf die Aussage nicht
  // veraendern koennen. Verben wie 'schaffe', 'sind', 'is' fehlen deshalb —
  // sie machen aus der Meldung eine Frage.
  var LOG_FILL = { ich: 1, hab: 1, habe: 1, hatte: 1, gemacht: 1, geschafft: 1, mit: 1, bei: 1,
                   und: 1, dann: 1, jetzt: 1, gerade: 1, eben: 1, so: 1, nur: 1, noch: 1,
                   das: 1, den: 1, die: 1, der: 1, dem: 1, waren: 1, insgesamt: 1, auf: 1,
                   fuer: 1, i: 1, did: 1, done: 1, made: 1, got: 1, with: 1, and: 1, then: 1,
                   just: 1, the: 1, a: 1, an: 1, at: 1, for: 1, of: 1, now: 1 };

  // Erlaubnisliste fuer "Satz anhaengen". Bewusst eng: alles, was aus dem
  // Wunsch eine Frage UEBER Saetze macht ('wie viele', 'war das', 'how many'),
  // fehlt hier und bricht damit die Form.
  var ADD_NOUN = { satz: 1, set: 1, topsatz: 1, topset: 1 };
  var ADD_FILL = { soll: 1, sollte: 1, ich: 1, wir: 1, noch: 1, einen: 1, einem: 1, ein: 1,
                   eine: 1, nen: 1, den: 1, dem: 1, das: 1, der: 1, machen: 1, mache: 1,
                   machs: 1, macht: 1, dazu: 1, dran: 1, dranhaengen: 1, haengen: 1, hinzu: 1,
                   hinzufuegen: 1, packen: 1, pack: 1, drauf: 1, bitte: 1, mal: 1, jetzt: 1,
                   gleich: 1, direkt: 1, kurz: 1, vielleicht: 1, was: 1, meinst: 1, du: 1,
                   ok: 1, okay: 1, und: 1, mit: 1,
                   should: 1, i: 1, we: 1, do: 1, add: 1, another: 1, one: 1, more: 1,
                   a: 1, an: 1, the: 1, please: 1, now: 1, extra: 1, put: 1, in: 1, with: 1,
                   lets: 1, let: 1, us: 1, shall: 1 };

  // Erklaerwunsch. LOCKER, siehe Kopf: loest keine Handlung aus.
  var EXPLAIN = /erklaer|erklar|erlaeuter|explain|wie fuehre ich|wie mache ich|wie macht man|wie geht (?:die|das|der)|how do i (?:do|perform)|how to (?:do|perform)|worauf (?:muss|soll|sollte) ich achten|ausfuehrung|technik|form check|richtig aus|sauber aus/;

  // Kleinschreibung, Umlaute aufgeloest, Dezimalkomma zu Punkt. Der Trenner
  // MUSS als Punkt ueberleben — sonst wird aus '82,5 kg' die Folge '82 5 kg'
  // und daraus zwei Zahlen statt einer. Punkte OHNE Ziffern drumherum (Satz-
  // ende) fallen dagegen weg.
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/(\d)[.,](\d)/g, '$1$2')
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(//g, '.')
      .replace(/\s+/g, ' ').trim();
  }

  function isNum(t) { return /^\d+(?:\.\d+)?$/.test(t); }
  function numOf(t) { return isNum(t) ? parseFloat(t) : (WORDNUM[t] != null ? WORDNUM[t] : null); }

  // Gesundheits-Gate aus coach-intent.js. Fehlt das Modul, gilt JEDE
  // Aeusserung als gesperrt (siehe Kopf, Punkt 2).
  function blockedByHealth(text) {
    var CI = (typeof module !== 'undefined' && module.exports) ? require('./coach-intent.js') : root.CoachIntent;
    if (!CI || typeof CI.medical !== 'function') return true;
    return CI.medical(text);
  }

  // ---- Satz-Diktat --------------------------------------------------------
  function parseLogSet(toks) {
    var nums = [];      // { v, role: 'w'|'r'|null, at }
    var sawMarker = false, unit = null;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (numOf(t) != null) { nums.push({ v: numOf(t), role: null, at: i }); continue; }
      if (UNIT_KG[t] || UNIT_LBS[t]) {
        sawMarker = true;
        var u = UNIT_KG[t] ? 'kg' : 'lbs';
        if (unit && unit !== u) return null;    // '80 kg 5 lbs' ist keine Meldung
        unit = u;
        // Die Einheit gehoert zur Zahl unmittelbar davor ('80 kilo').
        var prev = nums[nums.length - 1];
        if (prev && prev.at === i - 1 && prev.role == null) prev.role = 'w';
        continue;
      }
      if (REP_MARK[t]) {
        sawMarker = true;
        // Zwischen zwei Zahlen ist der Marker ein Mal-Zeichen und gehoert
        // KEINER von beiden ('80 mal 8'): links das Gewicht, rechts die
        // Wiederholungen. Sonst zaehlt er die Zahl davor als Wiederholungen.
        var nextIsNum = i + 1 < toks.length && numOf(toks[i + 1]) != null;
        var pv = nums[nums.length - 1];
        if (nextIsNum && pv && pv.at === i - 1) continue;
        if (pv && pv.at === i - 1 && pv.role == null) pv.role = 'r';
        continue;
      }
      if (LOG_FILL[t]) continue;
      return null;                               // unbekanntes Wort bricht die Form
    }
    if (!nums.length || nums.length > 2) return null;
    var w = null, r = null;
    nums.forEach(function (n) { if (n.role === 'w') w = n.v; else if (n.role === 'r') r = n.v; });
    var open = nums.filter(function (n) { return n.role == null; });
    if (nums.length === 2 && open.length === 1) {
      // Eine Zahl ist bestimmt, die andere bekommt die freie Rolle.
      if (w == null) w = open[0].v; else if (r == null) r = open[0].v;
    } else if (nums.length === 2 && open.length === 2) {
      // '80 mal 8': der Marker stand zwischen den Zahlen, keine ist bestimmt.
      // Ohne jeden Marker waeren zwei blanke Zahlen mehrdeutig -> null.
      if (!sawMarker) return null;
      w = open[0].v; r = open[1].v;
    } else if (nums.length === 1 && open.length === 1) {
      return null;                               // blosse Zahl, keine Aussage
    }
    if (w == null && r == null) return null;
    if (!sawMarker) return null;
    // Plausibilitaet: eine verhoerte Zahl ist schlimmer als eine Rueckfrage.
    if (w != null) {
      var maxW = unit === 'lbs' ? 900 : 400;
      if (!(w >= 0.5 && w <= maxW)) return null;
    }
    if (r != null && !(r >= 1 && r <= 50 && r === Math.round(r))) return null;
    return { kind: 'logSet', weight: w, unit: w == null ? null : unit, reps: r };
  }

  // ---- Satz anhaengen -----------------------------------------------------
  function parseAddSet(toks) {
    var nounAt = -1, top = false, w = null, unit = null, fillers = 0;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (ADD_NOUN[t]) {
        if (nounAt >= 0) return null;            // zwei Satz-Woerter: keine klare Form
        nounAt = i;
        if (t === 'topsatz' || t === 'topset') top = true;
        continue;
      }
      if (t === 'top' || t === 'schwerer' || t === 'schweren' || t === 'heavy' || t === 'heavier') {
        top = true; fillers++; continue;
      }
      if (numOf(t) != null) { if (w != null) return null; w = numOf(t); continue; }
      if (UNIT_KG[t] || UNIT_LBS[t]) { unit = UNIT_KG[t] ? 'kg' : 'lbs'; continue; }
      if (ADD_FILL[t]) { fillers++; continue; }
      return null;
    }
    if (nounAt < 0) return null;
    // Blosses 'Satz' ist zu duenn — erst ein Zusatzwort ('noch einen', 'top')
    // macht daraus den Wunsch nach einem WEITEREN Satz.
    if (!top && !fillers) return null;
    if (w != null) {
      var maxW = unit === 'lbs' ? 900 : 400;
      if (!(w >= 0.5 && w <= maxW)) return null;
    }
    return { kind: 'addSet', top: top, weight: w, unit: w == null ? null : unit };
  }

  function parse(text) {
    var raw = String(text == null ? '' : text).trim();
    if (!raw) return null;
    if (blockedByHealth(raw)) return null;
    var q = norm(raw);
    if (!q) return null;
    var toks = q.split(' ');
    var add = parseAddSet(toks);
    if (add) return add;
    var log = parseLogSet(toks);
    if (log) return log;
    if (EXPLAIN.test(q)) return { kind: 'explain', q: raw };
    return null;
  }

  var API = { parse: parse, normalize: norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachSpeech = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
