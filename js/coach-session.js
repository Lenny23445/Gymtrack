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
  // Reihenfolge: Stufe off → Art auf dieser Stufe erlaubt → nicht gemutet →
  // ONCE noch frei → Budget.
  // force ueberspringt Erlaubnis und Budget, damit der Abschluss nie ausfaellt.
  // force ueberspringt NICHT die Stufe off: dort ist die Obergrenze 0, und ein
  // Coach, der auf "aus" steht und am Ende doch redet, ist ein Fehler.
  // force ueberspringt auch ONCE nicht — der Abschluss bleibt einmalig.
  function emit(sess, kind, key, vars, force) {
    var s = sess || {};
    if (s.level === 'off' || !CAP[s.level]) return { sess: s, out: null };
    if (!force && !kindAllowed(s.level, kind)) return { sess: s, out: null };
    if ((s.muted || []).indexOf(kind) >= 0) return { sess: s, out: null };
    if (ONCE.indexOf(kind) >= 0 && s.said && s.said[kind]) return { sess: s, out: null };
    if (!force && budgetLeft(s) <= 0) return { sess: s, out: null };

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
    if (lastSame) return emit(s, 'greet', 'greet', greetVars(lastSame, s));
    return emit(s, 'greetFirst', 'greetFirst', { ex: s.planName || null });
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
      r = emit(s, 'mid', 'mid', midVars(s));
      if (r.out) return r;
      s = r.sess;
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
    if (v !== null && v >= REST_LONG_S) {
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
  function sessionEnd(sess, summary) {
    var sm = summary || {};
    var sets = num(sm.sets), vol = num(sm.vol), prs = num(sm.prs);
    var s = Object.assign({}, sess, { ended: true });
    return emit(s, FINAL_KIND, FINAL_KIND, {
      sets: sets !== null ? sets : (s.setCount || 0),
      vol:  vol  !== null ? vol  : round1(s.vol || 0),
      prs:  prs
    }, true);
  }

  var API = {
    sessionNew: sessionNew,
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
