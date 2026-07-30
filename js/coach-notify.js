/* GymTrack — Frequenz-Deckel und Planung der lokalen Meldungen (Baustein 18)

   Block 4 gibt dem Coach eine Stimme bei geschlossener App. Dieses Modul
   entscheidet AUSSCHLIESSLICH, OB und WANN etwas gemeldet wird. Das Zustellen
   ueber @capacitor/local-notifications macht die Verdrahtung.

   Der Deckel gilt VOR der Planung: was nicht durchpasst, wird gar nicht erst
   eingeplant — nicht erst beim Ausliefern verworfen. Eine App, die zu oft
   meldet, wird stummgeschaltet und nie wieder eingeschaltet; das ist der
   einzige Fehler dieses Bausteins, den man nicht mehr zurueckholen kann.

   Reine Logik: kein DOM, keine App-Globals, kein localStorage, kein
   Date.now(). Jeder Zeitpunkt kommt als Argument herein — sonst waere weder
   das Nachtfenster noch der Wochenwechsel pruefbar.

   Das Modul FORMULIERT NICHT. Es gibt {key, vars} zurueck; den Satz macht die
   Aufrufstelle mit CoachPersona.say(). Deshalb nie {title} oder {text}. Damit
   sind auch die Emoji-Regel und die Zweisprachigkeit erledigt: hier entsteht
   ueberhaupt kein Text. */
(function (root) {
  'use strict';

  var MIN  = 60 * 1000;
  var HOUR = 60 * MIN;
  var DAY  = 24 * HOUR;

  /* Die Stufe kommt aus der Persona (pushLevel). 'still' heisst schweigen —
     mit genau einer Ausnahme, siehe UNCAPPED.
     day  = Meldungen je Kalendertag
     week = Meldungen je ISO-Woche
     Die Wochenzahl ist knapper als 7 x day: mehrere Meldungen an einem Tag
     sind ein Ausnahmefall (frischer Bestwert plus faelliger Anstoss), kein
     Dauerzustand. */
  var CAPS = {
    still:  { day: 0, week: 0 },
    normal: { day: 1, week: 4 },
    eng:    { day: 2, week: 8 }
  };

  /* Mindestabstand je Art, unabhaengig vom Deckel. Absolute Millisekunden und
     keine Kalenderrechnung: eine Zeitumstellung verschiebt einen Cooldown
     damit nie um einen ganzen Tag.
     prCongrats 0   — ein PR ist ein Ereignis, kein Zustand. Wer drei Bestwerte
                      in einer Woche hebt, soll drei Mal hoeren; begrenzt wird
                      das ueber den Tages- und Wochendeckel, nicht hier.
     reminderPlan 0 — die Trainingserinnerung folgt dem Plan, nicht der Uhr. */
  var COOLDOWN = {
    prCongrats:     0,
    deload:         7 * DAY,
    returnNudge:    5 * DAY,
    anniversary:  365 * DAY,
    reminderPlan:   0,
    report:         6 * DAY
  };

  /* Der Wochenbericht ist das eine Versprechen, das auch auf 'still' gilt. Er
     steht deshalb ausserhalb des Deckels UND zaehlt nicht mit — sonst frisst
     er das Budget der Meldungen, die der Nutzer angefordert hat. Sein
     Mindestabstand (6 Tage) gilt trotzdem; ohne ihn waere COOLDOWN.report
     eine tote Zahl. */
  var UNCAPPED = ['report'];

  var KINDS = Object.keys(COOLDOWN);

  // Art -> Satzschluessel im Katalog. Nur 'report' weicht ab: die Art heisst
  // nach dem Anlass, der Schluessel nach dem Satz.
  var KEY_OF = {
    report:       'reportReady',
    reminderPlan: 'reminderPlan',
    returnNudge:  'returnNudge',
    deload:       'deload',
    anniversary:  'anniversary',
    prCongrats:   'prCongrats'
  };

  /* Gestaltungsregel 8: eine Meldung ohne Zahl oder konkrete Beobachtung wird
     gestrichen. CoachPersona.fill() entfernt einen Platzhalter ohne Wert samt
     Leerzeichen, die EINHEIT daneben bleibt aber stehen — aus '{vol} kg in
     dieser Woche' wird 'kg in dieser Woche'. Deshalb entscheidet dieses Modul
     VOR dem Einplanen, ob alle Werte da sind, die der Satz braucht. Fehlt
     einer, faellt der Kandidat aus.
     'deload' steht mit leerer Liste da: der Satz traegt in allen vier Toenen
     eine Beobachtung ('Belastung hoch, Erholung niedrig') und keinen
     Platzhalter. */
  var NEEDS = {
    reportReady:  ['vol'],
    reminderPlan: ['ex', 'kg', 'sets', 'reps'],
    returnNudge:  ['days'],
    anniversary:  ['ex', 'kg'],
    prCongrats:   ['ex', 'kg'],
    deload:       []
  };

  // Ortszeit-Fenster, in dem sich niemand meldet, und die Stunde, auf die eine
  // Meldung aus dem Fenster geschoben wird. Eine Erinnerung um drei Uhr nachts
  // ist der kuerzeste Weg zur abgeschalteten Benachrichtigung.
  var QUIET_FROM = 22;
  var QUIET_TO   = 7;
  var WAKE_HOUR  = 8;

  // Vorlaufzeiten der Kandidaten.
  var RETURN_AFTER = 5 * DAY;  // so lange ohne Einheit, dann der Anstoss
  var PR_DELAY     = 60 * 1000; // der Bestwert ist frisch, aber nicht sofort
  var DELOAD_AT    = 2 * HOUR;  // nach dem Training, nicht mittendrin
  var ANNIV_AT     = 4 * HOUR;  // ein Rueckblick hat keine Eile

  function num(v) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return (typeof n === 'number' && isFinite(n)) ? n : null;
  }

  // Zahl, die im Satz stehen soll: 0 und negativ sind hier keine Aussage,
  // sondern eine fehlende Messung.
  function pos(v) {
    var n = num(v);
    return (n !== null && n > 0) ? n : null;
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function count(v) {
    var n = num(v);
    return (n === null || n < 0) ? 0 : Math.floor(n);
  }

  function str(v) { return typeof v === 'string' ? v : ''; }

  /* CoachAnalyze.isoWeekKey() ist die EINZIGE Wochenrechnung des Vorhabens.
     Eine zweite hier haette an genau den Stellen abweichen koennen, an denen
     es weh tut (Jahreswechsel, KW 53) — und dann zaehlte der Wochendeckel
     gegen einen anderen Schluessel als die Wochenauswertung.

     Aufgeloest wird SPAET und ohne Zwischenspeichern des Fehlschlags: im
     Browser haengt es an der Reihenfolge der <script>-Tags, und ein zu frueh
     gemerktes null waere dauerhaft. In Node kommt das Modul ueber require()
     dazu, damit die Testsuite coach-notify allein laden kann. */
  function analyze() {
    if (root.CoachAnalyze && typeof root.CoachAnalyze.isoWeekKey === 'function') {
      return root.CoachAnalyze;
    }
    if (typeof require === 'function') {
      try {
        var m = require('./coach-analyze.js');
        if (m && typeof m.isoWeekKey === 'function') return m;
      } catch (e) { /* im Browser gibt es kein require — das ist kein Fehler */ }
    }
    return null;
  }

  /* Der optionale tzOffsetMin ist der Abstand der Ortszeit zu UTC in Minuten
     (-new Date().getTimezoneOffset()). Ohne ihn laufen die Schluessel auf UTC
     — das ist der Vertrag aus der Schnittstelle und bleibt so.

     Er ist trotzdem wichtig: der Tagesdeckel meint den Kalendertag des
     NUTZERS. Fuer jemanden auf UTC+9 lieferte ein UTC-Tagesschluessel sonst
     zwei Budgets fuer einen lokalen Tag, weil dessen Vormittag und Abend auf
     zwei UTC-Tage fallen. planAll() reicht den Wert deshalb durch.

     Sommerzeit: der Versatz wird zum Planungszeitpunkt eingesetzt und gilt
     fuer den ganzen Plan. Ueber eine Umstellung hinweg liegt eine Meldung
     damit hoechstens eine Stunde daneben — an den Raendern des Nachtfensters
     also nie im echten Schlaf. Die App plant bei jedem Start neu; die stabile
     id verhindert dabei Dubletten. */
  function shift(ts, tzOffsetMin) {
    return ts + (num(tzOffsetMin) || 0) * MIN;
  }

  function dayKey(ts, tzOffsetMin) {
    var t = num(ts);
    if (t === null) return '';
    var d = new Date(shift(t, tzOffsetMin));
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }

  function weekKey(ts, tzOffsetMin) {
    var t = num(ts);
    if (t === null) return null;
    var a = analyze();
    return a ? a.isoWeekKey(shift(t, tzOffsetMin)) : null;
  }

  function notifyNew() {
    return { sentTs: {}, dayCount: 0, dayKey: '', weekCount: 0, weekKey: '' };
  }

  /* Der Zustand kommt aus einem Speicher, also wird ihm nicht geglaubt. Ein
     kaputtes dayCount waere geschenktes Budget, ein kaputtes sentTs ein
     uebersprungener Cooldown. */
  function norm(state) {
    var o = (state && typeof state === 'object' && !Array.isArray(state)) ? state : {};
    var sent = {};
    if (o.sentTs && typeof o.sentTs === 'object') {
      KINDS.forEach(function (k) {
        var v = num(o.sentTs[k]);
        if (v !== null) sent[k] = v;
      });
    }
    return {
      sentTs:    sent,
      dayCount:  count(o.dayCount),
      dayKey:    str(o.dayKey),
      weekCount: count(o.weekCount),
      weekKey:   str(o.weekKey)
    };
  }

  /* mayNotify(state, kind, level, now [, tzOffsetMin]) -> boolean

     Reihenfolge: brauchbare Zeit -> bekannte Art -> Mindestabstand -> ausser
     Konkurrenz? -> Stufe -> Tag -> Woche.

     Der Mindestabstand steht VOR der UNCAPPED-Ausnahme, damit auch der
     Wochenbericht seine sechs Tage einhaelt.

     Eine unbekannte Art faellt durch. Ein Tippfehler im Aufruf soll keine
     Meldung erzeugen, die keinem Deckel und keinem Cooldown unterliegt.

     Eine unbekannte Stufe wird wie 'still' behandelt. Nach oben zu raten waere
     hier der teurere Fehler.

     Faellt der Wochenschluessel aus (CoachAnalyze nicht geladen), sperrt der
     Deckel statt zu oeffnen. Ein Frequenz-Deckel, der bei fehlender
     Abhaengigkeit durchlaesst, ist schlimmer als einer, der zu viel sperrt —
     der Wochenbericht kommt weiterhin durch. Ein Test haelt fest, dass dieser
     Fall im Betrieb nicht eintritt. */
  function mayNotify(state, kind, level, now, tzOffsetMin) {
    var t = num(now);
    if (t === null) return false;
    if (KINDS.indexOf(kind) < 0) return false;

    var s = norm(state);
    var sent = s.sentTs[kind];
    if (sent !== undefined && (t - sent) < COOLDOWN[kind]) return false;

    if (UNCAPPED.indexOf(kind) >= 0) return true;

    var cap = CAPS[level] || CAPS.still;
    if (cap.day <= 0 || cap.week <= 0) return false;

    if (dayKey(t, tzOffsetMin) === s.dayKey && s.dayCount >= cap.day) return false;

    var wk = weekKey(t, tzOffsetMin);
    if (wk === null) return false;
    if (wk === s.weekKey && s.weekCount >= cap.week) return false;

    return true;
  }

  /* record(state, kind, now [, tzOffsetMin]) -> neuer State

     Schreibt fort, mutiert nie: ein verworfener Rueckgabewert darf nicht
     trotzdem gegen das Budget zaehlen. Der Zaehler springt auf 1 zurueck,
     sobald der Schluessel wechselt — daran haengt, dass Tages- und
     Wochendeckel ueberhaupt je wieder aufgehen. */
  function record(state, kind, now, tzOffsetMin) {
    var s = norm(state);
    var t = num(now);
    if (t === null || KINDS.indexOf(kind) < 0) return s;

    var sent = Object.assign({}, s.sentTs);
    sent[kind] = t;

    if (UNCAPPED.indexOf(kind) >= 0) {
      return {
        sentTs:    sent,
        dayCount:  s.dayCount,
        dayKey:    s.dayKey,
        weekCount: s.weekCount,
        weekKey:   s.weekKey
      };
    }

    var dk = dayKey(t, tzOffsetMin);
    var wk = weekKey(t, tzOffsetMin) || '';
    return {
      sentTs:    sent,
      dayCount:  (dk === s.dayKey  ? s.dayCount  : 0) + 1,
      dayKey:    dk,
      weekCount: (wk === s.weekKey ? s.weekCount : 0) + 1,
      weekKey:   wk
    };
  }

  /* Uebungsnamen kommen aus Nutzereingaben und landen ungefiltert im
     Meldungstext. Symbole und Emojis fliegen raus (Projektregel: keine Emojis
     in Meldungen), Steuerzeichen ebenso, Laenge gedeckelt — eine Meldung ist
     eine Zeile, kein Absatz. Umlaute bleiben. Bleibt nichts uebrig, gibt es
     keinen Namen und damit nach Regel 8 auch keine Meldung. */
  function cleanName(v) {
    var s = String(v === null || v === undefined ? '' : v)
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{20D0}-\u{20FF}]/gu, '')
      .replace(/[<>&"'`\\{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40)
      .trim();
    return s || null;
  }

  // Alles hat einen Wert, den der Satz braucht? Sonst faellt der Kandidat aus.
  function complete(key, vars) {
    var need = NEEDS[key] || [];
    for (var i = 0; i < need.length; i++) {
      var v = vars[need[i]];
      if (v === null || v === undefined || v === '') return false;
    }
    return true;
  }

  /* Aus dem Nachtfenster heraus, immer nach vorn. Damit bleibt ein Termin, der
     schon in der Zukunft lag, auch nach dem Schieben in der Zukunft. */
  function outOfNight(at, tzOffsetMin) {
    var tz = num(tzOffsetMin) || 0;
    var d = new Date(at + tz * MIN);
    var h = d.getUTCHours();
    if (h >= QUIET_FROM) {
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, WAKE_HOUR, 0, 0) - tz * MIN;
    }
    if (h < QUIET_TO) {
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), WAKE_HOUR, 0, 0) - tz * MIN;
    }
    return at;
  }

  /* Die Kandidaten in der Reihenfolge ihres Vorrangs. Sie ist nicht nur
     Geschmack: bei gleichem Zeitpunkt entscheidet sie, wer den Tagesplatz
     bekommt (die Sortierung ist stabil). Vorn steht, was der Nutzer selbst
     ausgeloest hat oder heute braucht; hinten der Rueckblick. */
  function candidates(c, now, busy) {
    var out = [];

    var reportAt = num(c.reportAt);
    if (reportAt !== null) {
      out.push({ kind: 'report', at: reportAt, vars: { vol: pos(c.reportVol) } });
    }

    var pr = c.pr || null;
    if (pr) {
      out.push({ kind: 'prCongrats', at: now + PR_DELAY,
                 vars: { ex: cleanName(pr.ex), kg: pos(pr.kg) } });
    }

    // Wer gerade in der Halle steht, braucht keine Ansage, was heute ansteht,
    // und keinen Deload-Rat mitten im Satz. Der Bestwert bleibt: er ist die
    // Antwort auf das, was eine Minute vorher passiert ist.
    var nw = c.nextWorkout || null;
    if (nw && !busy) {
      out.push({ kind: 'reminderPlan', at: num(nw.at),
                 vars: { ex: cleanName(nw.ex), kg: pos(nw.kg),
                         sets: pos(nw.sets), reps: pos(nw.reps) } });
    }

    if (c.deload === true && !busy) {
      out.push({ kind: 'deload', at: now + DELOAD_AT, vars: {} });
    }

    var lastWk = num(c.lastWorkoutTs);
    if (lastWk !== null) {
      // Wer die App oeffnet, verschiebt den Anstoss: der Termin von damals ist
      // verstrichen, gemeint war 'fuenf Tage ohne Einheit' und nicht 'fuenf
      // Tage nach dem letzten Training, egal wie lange das her ist'.
      var at = lastWk + RETURN_AFTER;
      if (at <= now) at = now + RETURN_AFTER;
      out.push({ kind: 'returnNudge', at: at, since: lastWk, vars: {} });
    }

    var an = c.anniversary || null;
    if (an) {
      out.push({ kind: 'anniversary', at: now + ANNIV_AT,
                 vars: { ex: cleanName(an.ex), kg: pos(an.kg) } });
    }

    return out;
  }

  /* planAll(ctx) -> [{id, at, kind, key, vars}]

     ctx = {
       now,            Pflicht — ohne verlaessliche Uhrzeit wird nichts geplant
       level,          'still' | 'normal' | 'eng' (Persona.pushLevel)
       state,          Zustand aus notifyNew() / record()
       tzOffsetMin,    Ortszeit gegen UTC in Minuten, Standard 0
       workoutActive,  laeuft gerade eine Einheit?
       reportAt, reportVol,
       nextWorkout: {at, ex, kg, sets, reps},
       lastWorkoutTs,
       deload,         Deload empfohlen?
       anniversary: {ex, kg},
       pr: {ex, kg}
     }

     Der Kern: die Kandidaten laufen durch mayNotify mit einem
     FORTGESCHRIEBENEN Zustand. Ohne das kaemen fuenf Kandidaten am selben Tag
     alle durch, weil jeder gegen denselben Zaehler prueft.

     Reihenfolge der Schritte, und keine davon ist tauschbar:
       1. Vergangenes streichen — ein verstrichener Termin wird nicht in die
          Nacht-Korrektur geschoben und dadurch wiederbelebt.
       2. Aus dem Nachtfenster schieben — VOR der Zaehlung, weil sich dabei der
          Kalendertag aendern kann.
       3. Werte berechnen — {days} haengt am endgueltigen Zeitpunkt.
       4. Regel 8 — halbe Saetze fallen aus, bevor sie einen Platz belegen.
       5. Sortieren — sonst greift der Deckel in der falschen Reihenfolge.
       6. Deckel mit fortgeschriebenem Zustand.

     Die id ist kind + ':' + dayKey(at) und damit stabil: derselbe Kontext
     ergibt denselben Plan, ein erneuter Lauf erzeugt keine Dubletten. Sie
     enthaelt bewusst KEINE Nutzereingabe und keine Uhrzeit — beides waere bei
     jedem Lauf ein anderer Wert und damit eine neue Meldung. */
  function planAll(ctx) {
    var c = ctx || {};
    var now = num(c.now);
    if (now === null) return [];

    var level = CAPS[c.level] ? c.level : 'still';
    var tz    = num(c.tzOffsetMin) || 0;
    var busy  = c.workoutActive === true;

    var cands = candidates(c, now, busy).filter(function (cd) {
      return num(cd.at) !== null && cd.at > now;             // 1
    });

    cands.forEach(function (cd) {
      cd.at  = outOfNight(cd.at, tz);                        // 2
      cd.key = KEY_OF[cd.kind];                              // 3
      if (cd.kind === 'returnNudge') {
        cd.vars = { days: Math.max(1, Math.round((cd.at - cd.since) / DAY)) };
      }
    });

    cands = cands.filter(function (cd) {
      return complete(cd.key, cd.vars);                      // 4
    });

    cands.sort(function (a, b) { return a.at - b.at; });      // 5

    var out = [];
    var s = norm(c.state);
    cands.forEach(function (cd) {                            // 6
      if (!mayNotify(s, cd.kind, level, cd.at, tz)) return;
      s = record(s, cd.kind, cd.at, tz);
      out.push({
        id:   cd.kind + ':' + dayKey(cd.at, tz),
        at:   cd.at,
        kind: cd.kind,
        key:  cd.key,
        vars: cd.vars
      });
    });
    return out;
  }

  var API = {
    notifyNew: notifyNew,
    weekKey: weekKey,
    dayKey: dayKey,
    mayNotify: mayNotify,
    record: record,
    planAll: planAll,
    CAPS: CAPS,
    COOLDOWN: COOLDOWN,
    UNCAPPED: UNCAPPED,
    KINDS: KINDS,
    KEY_OF: KEY_OF,
    QUIET_FROM: QUIET_FROM,
    QUIET_TO: QUIET_TO,
    WAKE_HOUR: WAKE_HOUR,
    RETURN_AFTER: RETURN_AFTER
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachNotify = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
