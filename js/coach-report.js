/* GymTrack — Wochenbericht (Block 5, Task 20)
   Die Zahlen einer Trainingswoche und die Ziel-Prognose.

   Rein algorithmisch: kein Netzaufruf, kein Modell, kein DOM, keine
   App-Globals, kein Speicher — und ausdruecklich keine Systemuhr. Jeder
   Zeitpunkt kommt als Argument herein, sonst waere die Prognose nicht
   pruefbar. Ein Bericht, den der Nutzer nachrechnen kann, ist der einzige,
   dem er glauben muss.

   Drei Grenzen, die dieses Modul bewusst NICHT ueberschreitet:
   - Es formuliert keine Saetze. Zurueck kommen Schluessel und Platzhalter
     fuer CoachPersona.say(); den Wortlaut haelt allein der Satzkatalog.
   - Es beschreibt, es schreibt nichts vor. Kein Vorschlag zur Aenderung des
     Trainingsplans; die uebergebenen Listen werden nicht angefasst.
   - Es verspricht nichts. Die Prognose ist eine Fortschreibung unter
     Bedingung und faellt lieber ganz aus, als auf duenner Grundlage eine
     Zahl zu nennen — eine erfundene Prognose ist schlimmer als keine. */
(function (root) {
  'use strict';

  // Die drei Werte sind die Anforderung, nicht meine Wahl.
  var MIN_WEEKS          = 4;    // unter vier Kalenderwochen keine Prognose
  var MAX_FORECAST_WEEKS = 52;   // weiter als ein Jahr voraus ist Kaffeesatz
  var MIN_R2             = 0.7;  // darunter ist der Verlauf kein Trend

  var EPS = 1e-9;

  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function round1(v) { return Math.round(v * 10) / 10; }

  // Die ISO-Wochenrechnung liegt in CoachAnalyze und wird von dort geholt —
  // eine zweite Wochenrechnung im Haus laeuft irgendwann auseinander. In
  // Node kommt sie ueber require, im Browser ueber das globale Objekt.
  function analyze() {
    if (root && root.CoachAnalyze) return root.CoachAnalyze;
    if (typeof require === 'function') return require('./coach-analyze.js');
    return null;
  }

  function weekIndex(ts) {
    var A = analyze();
    return A ? A.isoWeekIndex(ts) : null;
  }

  /* epley1rm(kg, reps) -> geschaetztes Einer-Maximum.

     kg x (1 + reps/30). Bei einer Wiederholung ergibt das 103,3 statt 100 —
     das ist die Formel und kein Fehler; ein Test haelt den Wert fest, damit
     sie niemand spaeter "korrigiert". Ohne Gewicht oder ohne ausgefuehrte
     Wiederholung gibt es kein Maximum, also 0 und keine Schaetzung: eine
     Zahl aus einem Satz, den es nicht gab, waere erfunden. Nach oben wird
     nicht gedeckelt — Epley wird bei sehr vielen Wiederholungen ungenau,
     aber eine stille Deckelung waere eine Regel, die niemand vereinbart hat
     und die der Nutzer in seinen Zahlen nicht wiederfaende. */
  function epley1rm(kg, reps) {
    var k = num(kg), r = num(reps);
    if (k === null || k <= 0) return 0;
    if (r === null || r <= 0) return 0;
    return k * (1 + r / 30);
  }

  /* weekStart(ts) -> Montag 00:00 LOKAL.

     Bewusst lokal und nicht UTC: die Woche des Nutzers beginnt in seiner
     Zeitzone, und ein Bericht, der den Sonntagabend schon zur naechsten
     Woche zaehlt, widerspricht dem, was er selbst sieht. (Die ISO-Woche der
     Prognose rechnet dagegen in UTC — dort geht es um Abstaende zwischen
     Wochen, nicht um die Grenze eines Kalendertags.) */
  function weekStart(ts) {
    var t = num(ts);
    if (t === null) return null;
    var d = new Date(t);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // So = 0 -> sechs Tage zurueck
    d.setHours(0, 0, 0, 0); // noch einmal: eine Zeitumstellung faellt sonst um eine Stunde daneben
    return d.getTime();
  }

  // Wochen ueber die Kalenderrechnung verschieben, nicht ueber + 7 Tage in
  // Millisekunden: an einer Zeitumstellung ist eine Woche 167 oder 169
  // Stunden lang, und die Wochengrenze verschoebe sich um eine Stunde.
  function shiftWeeks(startMs, n) {
    var d = new Date(startMs);
    d.setDate(d.getDate() + 7 * n);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  /* Ein Satz zaehlt, wenn er wirklich ausgefuehrt wurde: Wiederholungen
     ueber null, Gewicht eine Zahl ab null. Ein fehlendes Gewicht ist ein
     Bodyweight-Satz (0 kg) und bleibt ein Satz; ein Gewicht, das keine Zahl
     ist, ist dagegen ein kaputter Eintrag und faellt heraus — sonst stuende
     NaN im Bericht, und NaN kg ist keine Auskunft. */
  function normSet(st) {
    if (!st || typeof st !== 'object') return null;
    var reps = num(st.reps);
    if (reps === null || reps <= 0) return null;
    var kg;
    if (st.kg === undefined || st.kg === null) {
      kg = 0;
    } else {
      kg = num(st.kg);
      if (kg === null || kg < 0) return null;
    }
    return {
      ex: (st.ex === undefined || st.ex === null) ? '' : String(st.ex),
      muscle: (st.muscle === undefined || st.muscle === null) ? '' : String(st.muscle),
      kg: kg,
      reps: reps,
      pr: st.pr === true
    };
  }

  function leerZahlen() {
    return { vol: 0, sets: 0, workouts: 0, prs: [], muscles: {},
             prevVol: 0, volDelta: 0, streak: 0 };
  }

  // Volumen einer Zeitspanne [von, bis). Nur hierueber wird gerechnet, damit
  // Woche und Vorwoche garantiert dieselbe Regel benutzen: zwei getrennte
  // Summierungen liefen frueher oder spaeter auseinander, und der Vergleich
  // zur Vorwoche waere dann still falsch.
  function volumeIn(sessions, von, bis) {
    var sum = 0;
    for (var i = 0; i < sessions.length; i++) {
      var ses = sessions[i];
      if (!ses || typeof ses !== 'object') continue;
      var ts = num(ses.ts);
      if (ts === null || ts < von || ts >= bis) continue;
      var sets = Array.isArray(ses.sets) ? ses.sets : [];
      for (var j = 0; j < sets.length; j++) {
        var st = normSet(sets[j]);
        if (st) sum += st.kg * st.reps;
      }
    }
    return Math.round(sum);
  }

  /* weekNumbers(sessions, weekStartTs)
       -> {vol, sets, workouts, prs, muscles, prevVol, volDelta, streak}

     Die Woche laeuft von Montag 00:00 bis zum naechsten Montag 00:00, Ende
     ausschliesslich. weekStartTs darf irgendein Zeitpunkt der Woche sein und
     wird auf den Montag normalisiert — sonst haenge die Abgrenzung daran, zu
     welcher Uhrzeit die Anzeige den Bericht anfordert.

     muscles ist die Verteilung des Volumens ueber die Saetze, die eine
     Muskelgruppe TRAGEN. Saetze ohne Angabe zaehlen in vol und sets, aber
     nicht in die Verteilung; die Summe der Muskelwerte kann darum unter vol
     liegen. Eine erfundene Sammelgruppe waere die Alternative gewesen — die
     haette der Nutzer als Muskelgruppe gelesen, die es nicht gibt.

     streak bleibt 0: den Wert haelt index.html, und ein Modul, das ihn aus
     drei Wochenzahlen selbst schaetzt, widerspraeche der Anzeige. */
  function weekNumbers(sessions, weekStartTs) {
    var out = leerZahlen();
    var start = weekStart(weekStartTs);
    if (start === null || !Array.isArray(sessions)) return out;

    var ende = shiftWeeks(start, 1);
    var davor = shiftWeeks(start, -1);

    for (var i = 0; i < sessions.length; i++) {
      var ses = sessions[i];
      if (!ses || typeof ses !== 'object') continue;
      var ts = num(ses.ts);
      if (ts === null || ts < start || ts >= ende) continue;

      var sets = Array.isArray(ses.sets) ? ses.sets : [];
      var gezaehlt = 0;
      for (var j = 0; j < sets.length; j++) {
        var st = normSet(sets[j]);
        if (!st) continue;
        gezaehlt++;
        var v = st.kg * st.reps;
        out.vol += v;
        // Null Volumen ist kein Anteil an einer Verteilung: ein Bodyweight-
        // Satz erzeugte sonst eine Muskelgruppe mit 0 kg im Diagramm.
        if (st.muscle && v > 0) {
          out.muscles[st.muscle] = (out.muscles[st.muscle] || 0) + v;
        }
        // Ein Rekord ohne Uebungsnamen liesse sich nirgends benennen.
        if (st.pr && st.ex) out.prs.push({ ex: st.ex, kg: st.kg, reps: st.reps });
      }
      // Eine Einheit ohne einen einzigen gueltigen Satz ist keine Einheit.
      if (gezaehlt > 0) {
        out.workouts++;
        out.sets += gezaehlt;
      }
    }

    out.vol = Math.round(out.vol);
    for (var m in out.muscles) {
      if (Object.prototype.hasOwnProperty.call(out.muscles, m)) {
        out.muscles[m] = Math.round(out.muscles[m]);
      }
    }
    out.prevVol = volumeIn(sessions, davor, start);
    out.volDelta = out.vol - out.prevVol;
    return out;
  }

  /* Die Historie der Prognose: je Kalenderwoche ein geschaetztes Maximum.

     Eintraege ohne Gewicht oder ohne Wiederholung fallen heraus, statt als 0
     mitzurechnen — eine 0 in der Reihe zoege die Gerade nach unten und
     erfaende einen Einbruch, den es nie gab. Liegen mehrere Eintraege in
     derselben Woche, zaehlt der beste: eine Woche ist ein Messpunkt, sonst
     erschliche sich eine fleissige Woche das Gewicht von vier Messungen.
     Eintraege aus der Zukunft (nach now) zaehlen nicht mit. */
  function weekPoints(history, now) {
    var perWeek = {};
    if (!Array.isArray(history)) return [];
    for (var i = 0; i < history.length; i++) {
      var e = history[i];
      if (!e || typeof e !== 'object') continue;
      var ts = num(e.ts);
      if (ts === null || ts > now) continue;
      var y = epley1rm(e.kg, e.reps);
      if (y <= 0) continue;
      var x = weekIndex(ts);
      if (x === null) continue;
      if (perWeek[x] === undefined || y > perWeek[x]) perWeek[x] = y;
    }
    var pts = [];
    for (var k in perWeek) {
      if (Object.prototype.hasOwnProperty.call(perWeek, k)) {
        pts.push({ x: Number(k), y: perWeek[k] });
      }
    }
    pts.sort(function (a, b) { return a.x - b.x; });
    return pts;
  }

  /* goalForecast(history, goalKg, now) -> {weeks, goalKg, currentKg} | null

     Lineare Regression der geschaetzten Maxima ueber die ISO-Wochennummer.
     Die Wochennummer und nicht die Position in der Liste ist die x-Achse:
     sonst zaehlte eine dreiwoechige Pause als eine Woche, und der Verlauf
     saehe steiler aus, als er war. Ueber den Jahreswechsel traegt das,
     weil CoachAnalyze fortlaufend zaehlt (2026-W53 und 2027-W01 liegen eine
     Woche auseinander, nicht 52 auseinander).

     Sie schweigt — bewusst streng, jede Regel einzeln:
     - weniger als MIN_WEEKS Kalenderwochen: zu duenn fuer eine Gerade;
     - kein Ziel und kein brauchbarer Zeitpunkt: nichts, worauf man zeigt;
     - Steigung nicht positiv: Stillstand und Rueckgang sind kein Fortschritt;
     - Bestimmtheitsmass unter MIN_R2: ein Zickzack mit zufaellig positiver
       Steigung ist kein Trend, und genau hier duerfte eine Zusage am
       wenigsten stehen;
     - Ziel bereits erreicht, und zwar in ZWEI Lesarten: die Trendlinie steht
       schon darueber, ODER es stand in einer Woche real schon einmal da.
       Die zweite Regel ist die wichtigere: wer 128 kg gehoben hat, laesst
       sich nicht sagen, er brauche dafuer noch eine Woche;
     - weiter als MAX_FORECAST_WEEKS voraus.

     Gerechnet wird ab der letzten Woche MIT Daten, und die Wochen seither
     kommen dazu. So schiebt ein alter Verlauf die Prognose von selbst nach
     hinten und faellt irgendwann ueber die Jahresgrenze heraus, statt so zu
     tun, als sei der Nutzer die ganze Zeit weiter gewachsen. */
  function goalForecast(history, goalKg, now) {
    var goal = num(goalKg);
    if (goal === null || goal <= 0) return null;
    var jetzt = num(now);
    if (jetzt === null) return null;
    var jetztWoche = weekIndex(jetzt);
    if (jetztWoche === null) return null;

    var pts = weekPoints(history, jetzt);
    if (pts.length < MIN_WEEKS) return null;

    var n = pts.length, i;
    var mx = 0, my = 0;
    for (i = 0; i < n; i++) { mx += pts[i].x; my += pts[i].y; }
    mx /= n; my /= n;

    var sxx = 0, syy = 0, sxy = 0;
    for (i = 0; i < n; i++) {
      var dx = pts[i].x - mx, dy = pts[i].y - my;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    if (sxx <= EPS) return null; // alle Punkte in derselben Woche

    var slope = sxy / sxx;
    if (slope <= 0) return null;

    // syy ist hier zwangslaeufig > 0 (sonst waere slope 0), das
    // Bestimmtheitsmass also definiert.
    var r2 = (sxy * sxy) / (sxx * syy);
    if (r2 < MIN_R2) return null;

    var letzte = pts[n - 1].x;
    var cur = my + slope * (letzte - mx); // Trendwert der letzten Datenwoche
    var best = 0;
    for (i = 0; i < n; i++) if (pts[i].y > best) best = pts[i].y;
    if (goal <= cur + EPS || goal <= best + EPS) return null;

    var offen = Math.ceil((goal - cur) / slope);      // immer >= 1, da goal > cur und slope > 0
    var seither = Math.max(0, jetztWoche - letzte);   // Wochen ohne Daten zaehlen mit
    var weeks = offen + seither;
    if (weeks > MAX_FORECAST_WEEKS) return null;

    return { weeks: weeks, goalKg: round1(goal), currentKg: round1(cur) };
  }

  /* reportSay(nums) -> {key:'reportReady', vars:{vol}} | null

     Ohne bewegtes Volumen gibt es nichts anzukuendigen: 'Wochenbericht da,
     0 kg' ist keine Auskunft, sondern eine Zeile, die den Nutzer daran
     erinnert, dass er nichts gemacht hat — dafuer gibt es die
     Rueckhol-Meldung, nicht den Bericht. */
  function reportSay(nums) {
    if (!nums || typeof nums !== 'object') return null;
    var vol = num(nums.vol);
    if (vol === null || vol <= 0) return null;
    return { key: 'reportReady', vars: { vol: Math.round(vol) } };
  }

  /* forecastSay(fc, exName) -> {key:'forecast', vars:{ex, kg, weeks}} | null

     Ohne Uebungsnamen bleibt der Satz nicht etwa kuerzer, sondern kaputt
     ('sind 130 kg bei in 6 Wochen erreichbar'). Einen eigenen Satz ohne
     {ex} gibt es fuer die Prognose nicht, also schweigt sie dann — ein
     halber Satz ist schlimmer als kein Satz. */
  function forecastSay(fc, exName) {
    if (!fc || typeof fc !== 'object') return null;
    var weeks = num(fc.weeks), kg = num(fc.goalKg);
    if (weeks === null || weeks <= 0 || kg === null) return null;
    var ex = (exName === undefined || exName === null) ? '' : String(exName).trim();
    if (!ex) return null;
    return { key: 'forecast', vars: { ex: ex, kg: kg, weeks: weeks } };
  }

  var API = {
    weekNumbers: weekNumbers,
    goalForecast: goalForecast,
    epley1rm: epley1rm,
    weekStart: weekStart,
    reportSay: reportSay,
    forecastSay: forecastSay,
    MIN_WEEKS: MIN_WEEKS,
    MAX_FORECAST_WEEKS: MAX_FORECAST_WEEKS,
    MIN_R2: MIN_R2
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachReport = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
