/* GymTrack — Erzaehlbogen der laufenden Einheit (Baustein 13)

   Der Coach reagierte bisher auf Einzelsaetze und wusste nicht, wo in der
   Einheit man steht. Dieses Modul haelt den Bogen: Begruessung mit dem, was
   beim letzten Mal stand, Einordnung zur Halbzeit, Ermuedung, Stillstand,
   Bilanz am Ende — und dabei eine HARTE Obergrenze je Einheit.

   Reine Logik, kein DOM, keine App-Globals, kein Modellaufruf: alles kommt als
   Argument herein. Der Zustand wird unveraenderlich fortgeschrieben, nie
   in-place mutiert — sonst wuerde ein verworfener Rueckgabewert trotzdem gegen
   das Budget zaehlen.

   Das Modul formuliert NICHT. Es gibt den Satzschluessel plus Platzhalter
   zurueck; den Satz macht die Aufrufstelle mit CoachPersona.say(). Deshalb
   {kind, key, vars} und niemals {text}. */
(function (root) {
  'use strict';

  // Die wichtigste Zahl des Vorhabens: zwoelf Trigger sind gebaut, hoechstens
  // acht kommen durch. Danach schweigt der Coach bis zum Ende der Einheit.
  var CAP = { off: 0, key: 4, full: 8 };

  var LEVELS = ['off', 'key', 'full'];

  // Was auf welcher Stufe ueberhaupt vorkommen darf. full ist key PLUS die
  // Feinheiten — abgeleitet, nicht zweimal von Hand gepflegt.
  // Nicht jede Art hat einen Ausloeser IN DIESEM MODUL: 'warmupIntro',
  // 'restTip', 'recall', 'plateau', 'timeBudget' und 'cue' emittiert die
  // Verdrahtung selbst ueber emit(sess, kind, key, vars) — die Texte dazu
  // kommen aus CoachWarmup, CoachCues und CoachAnalyze. Die Liste steht hier,
  // weil emit() die EINZIGE Ausgabestelle ist und die Obergrenze sonst nur
  // fuer die Arten gaelte, die dieses Modul selbst ausloest.
  var KEY_KINDS  = ['greet', 'greetFirst', 'exOpen', 'warmupIntro', 'debrief'];
  var FULL_EXTRA = ['mid', 'restTip', 'restNext', 'fatigue', 'stall', 'recall',
                    'plateau', 'timeBudget', 'cue'];
  var LEVEL_KINDS = {
    off:  [],
    key:  KEY_KINDS.slice(),
    full: KEY_KINDS.concat(FULL_EXTRA)
  };

  // Arten, die je Einheit hoechstens einmal vorkommen. exOpen fehlt bewusst:
  // die Ansage gilt je Uebung, nicht je Einheit.
  var ONCE = ['greet', 'greetFirst', 'mid', 'fatigue', 'stall', 'debrief',
              'recall', 'plateau', 'timeBudget'];

  var FINAL_KIND = 'debrief';

  var STALL_MS            = 12 * 60 * 1000; // 12 Minuten ohne Satz
  var REST_LONG_S         = 60;             // ab hier lohnt die Vorschau
  var MID_FALLBACK_SET    = 6;              // Halbzeit ohne Erwartungswert
  var FATIGUE_REP_DROP    = 2;              // Wiederholungen unter Erstsatz
  var FATIGUE_REST_FACTOR = 1.25;           // Pause gegen die drittletzte

  function num(v) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return (typeof n === 'number' && isFinite(n)) ? n : null;
  }

  function round1(v) { return Math.round(v * 10) / 10; }

  // Der Riegel gegen den halben Satz. CoachPersona.fill() entfernt einen
  // Platzhalter ohne Wert samt Leerzeichen — die EINHEIT daneben bleibt aber
  // stehen: aus '{kg} kg' wird 'kg'. Deshalb entscheidet dieses Modul VOR dem
  // Emittieren, ob der gewaehlte Satzschluessel ueberhaupt alle Werte hat, die
  // seine Vorlagen brauchen. Fehlt einer, kommt ein Schluessel ohne diesen
  // Platzhalter zum Zug oder die Aeusserung faellt aus.
  function has() {
    for (var i = 0; i < arguments.length; i++) {
      var v = arguments[i];
      if (v === null || v === undefined || v === '') return false;
    }
    return true;
  }

  function kindAllowed(level, kind) {
    var list = LEVEL_KINDS[level] || [];
    return list.indexOf(kind) >= 0;
  }

  function sessionNew(ctx) {
    var c = ctx || {};
    var exp = num(c.expectedSets);
    return {
      wkTs:         num(c.wkTs),
      level:        LEVELS.indexOf(c.level) >= 0 ? c.level : 'key',
      planName:     c.planName ? String(c.planName) : null,
      lastSame:     c.lastSame || null,
      muted:        Array.isArray(c.muted) ? c.muted.map(String) : [],
      expectedSets: (exp !== null && exp > 0) ? Math.round(exp) : null,
      spoken:       0,      // Aeusserungen dieser Einheit, inklusive Abschluss
      said:         {},     // welche Art schon vorkam (ONCE-Buchhaltung)
      setCount:     0,
      vol:          0,
      reps:         [],     // Wiederholungen der LAUFENDEN Uebung
      repsExId:     null,
      rests:        [],     // Pausen der Einheit in Sekunden
      lastRest:     null,
      lastSetTs:    null,
      exId:         null,
      exName:       null,
      exSets:       null,
      exReps:       null,
      exKg:         null,
      startedTs:    null,
      lastTick:     null,
      current:      null,   // letzte Aeusserung; eine neue verdraengt sie
      ended:        false
    };
  }

  // Ein Zustand aus einer anderen Einheit ist wertlos: nach einem App-Neustart
  // mitten im Training erzaehlte er sonst falsche Zahlen.
  function isStale(sess, wkTs) {
    if (!sess) return true;
    var a = num(sess.wkTs), b = num(wkTs);
    if (a === null || b === null) return true;
    return a !== b;
  }

  function intAtLeast(v, min) {
    var n = num(v);
    n = (n === null) ? min : Math.floor(n);
    return n < min ? min : n;
  }

  function numOrNull(v) { return num(v); }

  function arrOfNum(v) {
    if (!Array.isArray(v)) return [];
    var out = [];
    for (var i = 0; i < v.length; i++) {
      var n = num(v[i]);
      if (n !== null) out.push(n);
    }
    return out;
  }

  /* sessionResume(saved, wkTs) -> sess | null

     sessionNew() legt IMMER neu an — auch bei derselben Einheit. Wer eine
     laufende Einheit fortsetzen will (App-Neustart, Tab-Wechsel, Rueckkehr aus
     dem Hintergrund), nimmt diese Funktion: sie uebernimmt 'spoken' und 'said'
     und damit die Obergrenze. Ohne sie waere jeder Wiedereinstieg ein frisches
     Budget, und aus 8 Aeusserungen je Einheit wuerden 8 je App-Start.

     Der Zustand kommt aus einem Speicher, also wird ihm nicht geglaubt: jedes
     Feld laeuft durch dieselbe Pruefung wie in sessionNew(). 'spoken' faellt
     dabei nie unter die Zahl der bereits gesagten Arten — ein abgeschnittener
     Zaehler waere geschenktes Budget. 'current' wird bewusst nicht
     uebernommen: die letzte Aeusserung ist gesagt, sie soll nicht erneut
     erscheinen. Null heisst: nicht fortsetzbar, die Aufrufstelle legt mit
     sessionNew() neu an. */
  function sessionResume(saved, wkTs) {
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return null;
    if (isStale(saved, wkTs)) return null;

    var base = sessionNew({
      wkTs:         saved.wkTs,
      level:        saved.level,
      planName:     saved.planName,
      lastSame:     saved.lastSame,
      muted:        saved.muted,
      expectedSets: saved.expectedSets
    });

    var said = {};
    var saidCount = 0;
    if (saved.said && typeof saved.said === 'object') {
      Object.keys(saved.said).forEach(function (k) {
        if (saved.said[k]) { said[k] = true; saidCount++; }
      });
    }

    return Object.assign(base, {
      spoken:    intAtLeast(saved.spoken, saidCount),
      said:      said,
      setCount:  intAtLeast(saved.setCount, 0),
      vol:       num(saved.vol) !== null && num(saved.vol) > 0 ? num(saved.vol) : 0,
      reps:      arrOfNum(saved.reps),
      repsExId:  (saved.repsExId === null || saved.repsExId === undefined) ? null : String(saved.repsExId),
      rests:     arrOfNum(saved.rests),
      lastRest:  numOrNull(saved.lastRest),
      lastSetTs: numOrNull(saved.lastSetTs),
      exId:      (saved.exId === null || saved.exId === undefined) ? null : String(saved.exId),
      exName:    saved.exName ? String(saved.exName) : null,
      exSets:    numOrNull(saved.exSets),
      exReps:    numOrNull(saved.exReps),
      exKg:      numOrNull(saved.exKg),
      startedTs: numOrNull(saved.startedTs),
      lastTick:  numOrNull(saved.lastTick),
      current:   null,
      ended:     saved.ended === true
    });
  }

  // Das Budget haelt einen Platz fuer den Abschluss frei, solange der noch
  // aussteht. Nur so bleibt "hoechstens CAP Aeusserungen je Einheit" auch dann
  // wahr, wenn der erzwungene Abschluss dazukommt.
  function budgetLeft(s) {
    var cap = CAP[s.level] || 0;
    var reserve = s.said[FINAL_KIND] ? 0 : 1;
    return cap - reserve - (s.spoken || 0);
  }

  // DIE EINZIGE AUSGABESTELLE. Jede Aeusserung, auch die der Nachbarmodule,
  // laeuft hier durch — sonst waere die Obergrenze nur eine Absichtserklaerung.
  // Reihenfolge: Stufe off → Einheit beendet → Art auf dieser Stufe erlaubt →
  // nicht gemutet → ONCE noch frei → Budget.
  //
  // force ueberspringt Erlaubnis und Budget, damit der Abschluss nie ausfaellt
  // — und gilt AUSSCHLIESSLICH fuer den Abschluss. Als offener Parameter war
  // force ein Generalschluessel: 'cue' mit gesetztem fuenften Argument brachte
  // 13 Aeusserungen bei CAP 8 durch und ignorierte dabei auch den
  // Stufenfilter. Ein Aufruf mit force an einer anderen Art wird jetzt still
  // wie ein normaler Aufruf behandelt.
  // force ueberspringt NICHT die Stufe off: dort ist die Obergrenze 0, und ein
  // Coach, der auf "aus" steht und am Ende doch redet, ist ein Fehler.
  // force ueberspringt auch ONCE und die Mute-Liste nicht.
  function emit(sess, kind, key, vars, force) {
    var s = sess || {};
    var forced = !!force && kind === FINAL_KIND;
    if (s.level === 'off' || !CAP[s.level]) return { sess: s, out: null };
    // Nach dem Abschluss ist die Einheit erzaehlt. Realer Ausloeser: Training
    // beenden, dann erneut oeffnen, um einen Satz zu korrigieren — der Coach
    // begann danach von vorn zu reden.
    if (s.ended) return { sess: s, out: null };
    if (!forced && !kindAllowed(s.level, kind)) return { sess: s, out: null };
    if ((s.muted || []).indexOf(kind) >= 0) return { sess: s, out: null };
    if (ONCE.indexOf(kind) >= 0 && s.said && s.said[kind]) return { sess: s, out: null };
    if (!forced && budgetLeft(s) <= 0) return { sess: s, out: null };

    var out = { kind: kind, key: key || kind, vars: vars || {} };
    var said = Object.assign({}, s.said);
    said[kind] = true;
    var next = Object.assign({}, s, {
      spoken:  (s.spoken || 0) + 1,
      said:    said,
      current: out
    });
    return { sess: next, out: out };
  }

  function greetVars(lastSame, s) {
    var l = lastSame || {};
    return {
      ex:   l.ex || l.name || s.planName || null,
      kg:   num(l.kg),
      sets: num(l.sets),
      reps: num(l.reps)
    };
  }

  function onStart(sess, ctx) {
    var c = ctx || {};
    var lastSame = ('lastSame' in c) ? c.lastSame : (sess || {}).lastSame;
    var s = Object.assign({}, sess, {
      lastSame:  lastSame || null,
      planName:  c.planName ? String(c.planName) : (sess || {}).planName,
      startedTs: num(c.ts) !== null ? num(c.ts) : (sess || {}).startedTs
    });
    // 'greet' nennt Gewicht, Saetze und Wiederholungen der letzten Einheit.
    // Fehlt eine dieser Zahlen, gibt es nichts zu vergleichen — dann ist
    // 'greetFirst' der richtige Schluessel und nicht der halbe Vergleich.
    if (lastSame) {
      var gv = greetVars(lastSame, s);
      if (has(gv.ex, gv.kg, gv.sets, gv.reps)) return emit(s, 'greet', 'greet', gv);
      if (has(gv.ex)) return emit(s, 'greetFirst', 'greetFirst', { ex: gv.ex });
      return { sess: s, out: null };
    }
    // Ohne Namen bleibt von der Erstansage ein Satz ohne Subjekt uebrig
    // ('steht heute zum ersten Mal an'). Dann lieber nichts sagen.
    if (!has(s.planName)) return { sess: s, out: null };
    return emit(s, 'greetFirst', 'greetFirst', { ex: s.planName });
  }

  function onExerciseOpen(sess, ex) {
    var e = ex || {};
    var id = (e.id === null || e.id === undefined) ? null : String(e.id);
    var s = Object.assign({}, sess, {
      exId:     id,
      exName:   e.name ? String(e.name) : null,
      exSets:   num(e.targetSets),
      exReps:   num(e.targetReps),
      exKg:     num(e.lastKg),
      reps:     [],   // Wiederholungsreihe gilt je Uebung
      repsExId: id
    });
    // Ohne Namen gibt es keinen Satz: alle vier Toene beginnen mit {ex}.
    if (!has(s.exName)) return { sess: s, out: null };
    // Ohne Vorgewicht traegt die exOpen-Vorlage eine Einheit ohne Zahl
    // ('zuletzt kg bei 8 Wiederholungen'). Das trifft JEDE erstmals gefahrene
    // Uebung, im ersten Training also durchgehend. Unterdruecken waere hier
    // teuer — auf Stufe 'key' ist exOpen eine von fuenf erlaubten Arten und
    // das erste Training bliebe fast stumm. Stattdessen uebernimmt
    // 'greetFirst': derselbe Anlass ('keine Vergleichswerte vorhanden'), ein
    // Schluessel ohne {kg}, in allen vier Toenen formuliert. Die Art bleibt
    // 'exOpen' — sie gilt je Uebung und faellt nicht unter ONCE.
    if (!has(s.exKg)) return emit(s, 'exOpen', 'greetFirst', { ex: s.exName });
    // Gewicht da, aber Plandaten fehlen: dafuer gibt es keinen Satzschluessel
    // ohne diese Platzhalter, und 'zum ersten Mal' waere dann falsch. Die
    // Ansage faellt aus.
    if (!has(s.exSets, s.exReps)) return { sess: s, out: null };
    return emit(s, 'exOpen', 'exOpen', {
      ex: s.exName, sets: s.exSets, kg: s.exKg, reps: s.exReps
    });
  }

  function midAt(s) {
    return s.expectedSets ? Math.ceil(s.expectedSets / 2) : MID_FALLBACK_SET;
  }

  function midVars(s) {
    var v = { vol: round1(s.vol) };
    var lastVol = num((s.lastSame || {}).vol);
    if (lastVol !== null && lastVol > 0) v.pct = Math.round(s.vol / lastVol * 100);
    return v;
  }

  // Einzeln ist beides normal — zusammen ist es Reserve am Ende: die
  // Wiederholungen fallen UND die Pausen wachsen.
  function isFatigued(s) {
    var r = s.reps || [], p = s.rests || [];
    if (r.length < 2 || p.length < 3) return false;
    var repsDrop = r[r.length - 1] <= r[0] - FATIGUE_REP_DROP;
    var restRise = p[p.length - 1] > p[p.length - 3] * FATIGUE_REST_FACTOR;
    return repsDrop && restRise;
  }

  function onSet(sess, log) {
    var l = log || {};
    var reps = num(l.reps), kg = num(l.kg), ts = num(l.ts);
    var id = (l.exId === null || l.exId === undefined) ? null : String(l.exId);
    var series = (id !== null && id === sess.repsExId) ? (sess.reps || []).slice() : [];
    if (reps !== null) series.push(reps);

    var s = Object.assign({}, sess, {
      setCount:  (sess.setCount || 0) + 1,
      vol:       (sess.vol || 0) + (reps || 0) * (kg || 0),
      reps:      series,
      repsExId:  id !== null ? id : sess.repsExId,
      lastSetTs: ts !== null ? ts : Date.now()
    });

    // Hoechstens EINE Aeusserung gleichzeitig. Die Einordnung zur Halbzeit hat
    // Vorrang vor der Ermuedung; die Ermuedung kommt beim naechsten Satz noch.
    var r;
    if (s.setCount >= midAt(s)) {
      // Die Halbzeit IST der Vergleich mit der letzten Einheit: drei der vier
      // Toene bauen den Satz um {pct} herum. Ohne Vorwochenvolumen bliebe
      // 'etwa Prozent zur letzten Einheit' stehen. Es gibt keinen Schluessel
      // fuer eine Halbzeit ohne Vergleich, also faellt die Ansage aus — sie
      // kostet hier wenig: 'mid' gibt es nur auf Stufe full, wo Budget da ist.
      var mv = midVars(s);
      if (has(mv.vol, mv.pct)) {
        r = emit(s, 'mid', 'mid', mv);
        if (r.out) return r;
        s = r.sess;
      }
    }
    if (isFatigued(s)) {
      r = emit(s, 'fatigue', 'fatigue', {});
      if (r.out) return r;
      s = r.sess;
    }
    return { sess: s, out: null };
  }

  function onRest(sess, secs) {
    var v = num(secs);
    var s = Object.assign({}, sess, {
      rests:    (sess.rests || []).concat(v === null ? [] : [v]),
      lastRest: v !== null ? v : sess.lastRest
    });
    // Die Vorschau besteht aus genau diesen zwei Zahlen; alle vier Toene
    // nennen beide. Fehlt eine, bleibt eine Einheit ohne Zahl stehen ('Als
    // Naechstes kg mit 8 Wiederholungen'). Einen Schluessel fuer eine Vorschau
    // ohne Gewicht gibt es nicht, und eine Vorschau ohne Zahlen kuendigt
    // nichts an — also faellt sie aus.
    if (v !== null && v >= REST_LONG_S && has(s.exKg, s.exReps)) {
      return emit(s, 'restNext', 'restNext', { kg: s.exKg, reps: s.exReps });
    }
    return { sess: s, out: null };
  }

  function onTick(sess, now) {
    var t = num(now);
    if (t === null) t = Date.now();
    var s = Object.assign({}, sess, { lastTick: t });
    if (s.lastSetTs && (t - s.lastSetTs) >= STALL_MS) {
      return emit(s, 'stall', 'stall', {});
    }
    return { sess: s, out: null };
  }

  // Der Abschluss faellt nie aus (force). Ihn am Budget scheitern zu lassen
  // waere die eine Stelle, an der Sparsamkeit als Gleichgueltigkeit ankommt.
  // 'prs' steht bewusst NICHT in den Platzhaltern: der Satzkatalog kennt
  // {prs} nicht, ein Wert ohne Vorlage wandert nur ungelesen durch. Die
  // Bestwerte haben mit 'prCongrats' einen eigenen Schluessel — dort gehoeren
  // sie hin, nicht in die Bilanz. Der Katalog waere die einzige Stelle, an der
  // sich das aendern liesse (alle vier Toene, beide Sprachen); solange er das
  // nicht hergibt, ist eine tote Variable die schlechtere Haelfte.
  function sessionEnd(sess, summary) {
    var sm = summary || {};
    var sets = num(sm.sets), vol = num(sm.vol);
    var s = sess || {};
    var r = emit(s, FINAL_KIND, FINAL_KIND, {
      sets: sets !== null ? sets : (s.setCount || 0),
      vol:  vol  !== null ? vol  : round1(s.vol || 0)
    }, true);
    // 'ended' wird IMMER gesetzt, auch auf Stufe off und auch wenn der
    // Abschluss schon lief: die Einheit ist beendet, unabhaengig davon, ob der
    // Coach dazu etwas gesagt hat.
    return { sess: Object.assign({}, r.sess, { ended: true }), out: r.out };
  }

  var API = {
    sessionNew: sessionNew,
    sessionResume: sessionResume,
    isStale: isStale,
    onStart: onStart,
    onExerciseOpen: onExerciseOpen,
    onSet: onSet,
    onRest: onRest,
    onTick: onTick,
    sessionEnd: sessionEnd,
    emit: emit,
    CAP: CAP,
    LEVEL_KINDS: LEVEL_KINDS,
    ONCE: ONCE,
    STALL_MS: STALL_MS,
    REST_LONG_S: REST_LONG_S,
    MID_FALLBACK_SET: MID_FALLBACK_SET
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachSession = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
