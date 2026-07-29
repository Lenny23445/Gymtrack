/* GymTrack — Intent-Router (Baustein 3)
   Beantwortet haeufige Gym-Fragen aus lokalen Daten, ohne LLM-Aufruf.
   Bekommt einen fertigen Datenschnappschuss statt globaler App-Variablen —
   dadurch ohne Browser testbar und nicht an interne Strukturen gebunden. */
(function (root) {
  'use strict';

  // Ein Treffer verlangt ein eindeutiges Muster UND vorhandene Daten. Alles
  // Wertende, Planende oder Medizinische geht bewusst ans Modell.
  //
  // Krankheits-Woerter (krank/erkaeltet/fieber/...) standen hier testweise
  // drin, um eine Kollision in Intent 5 (Erholung) abzufangen -- falscher
  // Hebel: BLOCK gilt fuer ALLE acht Intents, nicht nur fuer einen, und
  // blockierte dadurch z.B. "ich bin erkaeltet, wie viele saetze noch?"
  // komplett, obwohl die Frage mit Erholung nichts zu tun hat. Ausserdem loeste
  // es nicht einmal das Problem, fuer das es gedacht war: der dokumentierte
  // Fehltreffer ("ich war im Erholungsurlaub, meine Brust hat sich ausgeruht")
  // enthaelt gar kein Krankheitswort. Entfernt -- Schutz fuer Intent 5 sitzt
  // jetzt direkt bei Intent 5 (siehe dort, inkl. Einschaetzung der Grenzen).
  var BLOCK = /(plan|programm|schmerz|weh|verletz|zwick|lieber|besser|sollte ich|soll ich|meinst du|warum|erklaer|hurts|pain|should i)/;

  // Die beiden Vorab-Ausnahmen (Aufwaermen, Gewichtsbegruendung) liefen bisher
  // an BLOCK KOMPLETT vorbei. Damit kam mit dem einen Wort, das die Ausnahme
  // braucht, auch alles Wertende und Planende durch ("warum soll ich das
  // gewicht nehmen?", "warum steht im plan 60 kg?"). Richtig ist: jede
  // Ausnahme klammert genau das Wort aus, das sie braucht, und laesst den
  // REST von BLOCK weiter greifen. Aufwaermen braucht "soll ich"/"should i",
  // die Gewichtsbegruendung braucht "warum"/"erklaer".
  var BLOCK_MINUS_SOLL  = /(plan|programm|schmerz|weh|verletz|zwick|lieber|besser|meinst du|warum|erklaer|hurts|pain)/;
  var BLOCK_MINUS_WARUM = /(plan|programm|schmerz|weh|verletz|zwick|lieber|besser|sollte ich|soll ich|meinst du|hurts|pain|should i)/;

  // STRUKTURELLES GATE gegen Fehltreffer durch Alltagswoerter: manche
  // Ankerworte sind ausserhalb des Trainingskontexts voellig normale Woerter
  // (gewicht/weight, sets, volume, erhol/recover). So ein Wort allein beweist
  // keinen Fitnessbezug. Die Regel: ein doppeldeutiges Ankerwort zaehlt nur
  // zusammen mit einem zweiten, unabhaengigen Signal irgendwo im selben Satz
  // (Reihenfolge egal) -- meist ein zweites Fitness-Wort, bei Intent 5 (siehe
  // dort) ein Frage-Signal, weil dort kein Wort als zweiter Beleg taugt.
  // "two()" ist diese eine Kombinations-Regel an einer Stelle, genutzt von
  // Intent 1, 3 (Englisch-Zweig), 5 und 7.
  //
  // Zwei Faelle brauchen das Gate NICHT und nutzen stattdessen eine praezise,
  // handgewaehlte Phrase (Intent 2, 4, 6, 8): dort ist die Doppeldeutigkeit
  // keine "Wort ohne Trainingsbezug"-Frage, sondern eine lexikalische
  // Unterscheidung (z.B. "record" als Verb vs. Substantiv, Erzaehlsatz vs.
  // Frage), die ein zweites beliebiges Fitness-Wort nicht aufloest -- ein
  // zweites Fitness-Wort im Satz macht "ich will mein Training protokollieren"
  // nicht weniger mehrdeutig. Modul nutzt also zwei Mechanismen, nicht einen:
  // Kombinator wo ein zweites unabhaengiges Wort die Frage entscheidet,
  // praezise Phrase wo das nicht reicht. Eindeutige mehrwortige Fachbegriffe
  // (z.B. "wie viele saetze", "was steht heute an") brauchen keins von beiden,
  // weil sie ausserhalb des Trainings praktisch nie vorkommen.
  function two(q, a, b) { return a.test(q) && b.test(q); }

  // Medizinische Teilmenge von BLOCK. Gebraucht fuer die Vorab-Ausnahmen, die
  // VOR BLOCK laufen (Aufwaermen, Task 3): "wie soll ich mich aufwaermen?"
  // enthaelt "soll ich" und faellt sonst in BLOCK, obwohl die Frage rein
  // schematisch ist. Die Ausnahme darf aber niemals eine Schmerz- oder
  // Verletzungsmeldung einfangen -- die gehoert ausnahmslos ans Modell.
  //
  // ACHTUNG, TRAGWEITE: diese Listen sind SPERRlisten und damit ausdruecklich
  // NICHT mehr die tragende Schicht. Sie versagen nach aussen offen -- jede
  // Beschwerdeform, die zufaellig nicht aufgezaehlt ist, rutscht durch
  // ("warum knackt es bei 60 kg?", "ich bin schwanger, wie aufwaermen?",
  // "warum wird mir uebel bei dem gewicht?"). Jede Reviewrunde schloss nur die
  // Saetze, die zufaellig im Bericht standen. Die eigentliche Absicherung ist
  // deshalb die Ganzform-Verankerung der beiden Ausnahmen (WARMUP_ONLY und
  // whyRe weiter unten); MED_HARD/BODY/COMPLAIN bleiben nur als zusaetzliche
  // Sicherung stehen, falls eine erlaubte Ganzform doch einmal zu weit ist.
  //   MED_HARD  -- eindeutige Krankheits-/Beschwerde-/Behandlungswoerter,
  //                blocken allein;
  //   BODY + COMPLAIN -- ein Koerperteil zusammen mit einer Beschwerde- oder
  //                Risikoaussage ("knackt das knie", "gefaehrlich fuer mein
  //                knie"). Ein Koerperteil ALLEIN blockt bewusst nicht, sonst
  //                waere jede normale Frage mit Muskelnamen betroffen.
  // Beide Listen gelten nur fuer die zwei Ausnahmen -- ein Fehlalarm kostet
  // hier nur eine lokale Antwort (die Frage geht ans Modell), waehrend ein
  // Durchlasser eine medizinische Falschauskunft waere.
  var MED_HARD = /schmerz|weh|verletz|zwick|ziep|hurts|pain|injur|\bache|\bsore\b|krank|erkaelt|fieber|grippe|entzuend|zerr|riss|gerissen|\breha\b|arzt|aerzt|physio|\bop\b|operation|meniskus|bandscheibe|kreuzband|\btaub\b|kribbel|prellung|kaputt/;
  var BODY     = /knie|schulter|ruecken|nacken|huefte|handgelenk|ellenbogen|ellbogen|sprunggelenk|knoechel|wirbel|achilles|gelenk|sehne|knee|shoulder|wrist|elbow|ankle|joint|tendon/;
  var COMPLAIN = /knack|knirsch|ziep|stich|brenn|schwill|geschwoll|taub|kribbel|klemm|gefaehrl|riskant|schaedl|schon(t|en)|blockiert|instabil|ueberlast/;
  function medical(q) { return MED_HARD.test(q) || (BODY.test(q) && COMPLAIN.test(q)); }

  // ERLAUBNISLISTE der Aufwaerm-Ausnahme, verankert auf die GANZE normalisierte
  // Frage (^...$). Bisher galt "irgendwo im Satz ein Aufwaermwort UND kein
  // verbotenes Wort" -- eine Sperrliste mit zwei Ausfallarten: sie liess jede
  // nicht aufgezaehlte Meldung durch ("ich bin schwanger, wie soll ich mich
  // aufwaermen?" bekam ein Schema), und sie verschluckte fremde Fragen, sobald
  // das Aufwaermwort nur nebenbei vorkam ("wie viele saetze noch nach dem
  // aufwaermen?" -> Aufwaermschema statt Satzzahl). Beides zeigte sich erst mit
  // gefuelltem warmupText, also ab Block 3 im Normalbetrieb.
  //
  // Die Verankerung dreht die Ausfallrichtung um: die Ausnahme greift nur,
  // wenn die Frage ALS GANZES eine der wenigen bekannten Schema-Formen hat.
  // Haengt irgendein Nebensatz dran -- Beschwerde, Vorerkrankung, zweite Frage
  // --, passt die Form nicht mehr, die Ausnahme greift nicht, und die Frage
  // laeuft wie jede andere durch BLOCK und die uebrigen Intents. Das versagt
  // nach innen geschlossen: eine unbekannte Formulierung kostet hoechstens
  // einen Modellaufruf, statt eine medizinische Meldung mit einer
  // Trainingsanweisung zu beantworten. Neue Formulierungen gehoeren hier
  // aufgenommen -- NICHT als weiteres Verbotswort in MED_HARD.
  var WARMUP_ONLY = new RegExp(
    '^(?:' +
      '(?:wie|womit|was)' +
      '(?: (?:soll|sollte|muss|kann|mache|mach))?(?: ich)?(?: mich)?' +
      '(?: (?:am besten|richtig|heute|jetzt|vorher|davor|zuerst))?(?: mich)?' +
      ' (?:aufwaermen|einwaermen|warm ?machen)' +
    '|' +
      'how (?:should|do|can|shall|would) (?:i|we)(?: best)? warm ?up' +
    ')$'
  );

  // "gewicht"/"weight" ist auch das KOERPERgewicht. Der Coach begruendet aber
  // ausschliesslich seinen eigenen Hantel-Vorschlag -- Waage-, Zu- und
  // Abnehmfragen gehoeren ans Modell, auch wenn die vorgeschlagene Zahl
  // zufaellig danebensteht ("wieso wiege ich 60 kilo?").
  var BODYWEIGHT = /koerpergewicht|body ?weight|abnehm|zunehm|zugenommen|abgenommen|an gewicht|wiege ich|\bwaage\b|gewicht verloren/;

  // Muskelgruppen-Woerter als reines JA/NEIN, ob eine Volumenfrage ueberhaupt
  // muskelspezifisch gemeint ist. Die ZAHL kommt ausschliesslich aus
  // s.muscleVolume; diese Liste liefert nie einen Wert, nur die Unterscheidung
  // "Gesamtvolumen" vs. "Volumen einer Gruppe". Ohne sie wuerde eine
  // Brust-Frage bei fehlendem s.muscleVolume vom Gesamtvolumen-Intent mit
  // einer konfident falschen Zahl beantwortet.
  var MUSCLE = /brust|ruecken|beine|\bbein\b|schulter|\barme\b|\barm\b|bauch|bizeps|trizeps|waden|gesaess|\bpo\b|chest|\bback\b|\blegs\b|shoulder|\barms\b|\babs\b|biceps|triceps|glutes|calves/;

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function num(n) {
    return Number(n).toLocaleString('de-DE', { maximumFractionDigits: 1 });
  }

  function datum(iso) {
    var p = String(iso || '').slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : '';
  }

  function findExercise(q, list) {
    var hit = null, best = 0;
    (list || []).forEach(function (ex) {
      var n = norm(ex.name);
      if (n && q.indexOf(n) >= 0 && n.length > best) { hit = ex; best = n.length; }
    });
    return hit;
  }

  // Task 4: Begruendungstext fuer den eigenen Gewichtsvorschlag. Nennt in
  // jedem Fall Zahl, Regel und Schrittweite -- "weil du bereit bist" waere
  // wertlos. wr folgt der Schnittstelle aus dem Task-4-Brief (exName, fromKg,
  // toKg, stepKg, reason, lastReps, repRange, ciFactor).
  function weightWhyAnswer(wr) {
    var reps  = (wr.lastReps || []).join('/');
    var range = (wr.repRange && wr.repRange.length === 2) ? wr.repRange[0] + '–' + wr.repRange[1] : '';
    var step  = num(wr.stepKg) + ' kg';
    var to    = num(wr.toKg) + ' kg';
    var name  = wr.exName ? wr.exName + ': ' : '';
    var pct   = wr.ciFactor != null ? Math.round((1 - wr.ciFactor) * 100) : 0;

    if (wr.reason === 'repsHigh') {
      return name + 'Zuletzt ' + reps + ' Wiederholungen geschafft (Bereich ' + range +
        ') — Regel: oben im Bereich steigt das Gewicht um die Schrittweite ' + step +
        ', neues Gewicht ' + to + '.';
    }
    if (wr.reason === 'repsLow') {
      return name + 'Zuletzt ' + reps + ' Wiederholungen geschafft (Bereich ' + range +
        '), den Bereich oben also nicht erreicht — Regel: das Gewicht bleibt bei ' + to +
        ', die Schrittweite ' + step + ' greift erst, wenn der Bereich oben klappt.';
    }
    if (wr.reason === 'checkinUp') {
      return name + 'Dein Check-in zeigt gute Erholung — Regel: dadurch ist die größere Schrittweite ' +
        step + ' schon jetzt freigegeben, neues Gewicht ' + to + '.';
    }
    if (wr.reason === 'checkinDown') {
      return name + 'Dein Check-in zeigt weniger Erholung — Regel: das Gewicht sinkt deshalb um ' + pct +
        '% auf ' + to + ' (Basis-Schrittweite ' + step + ').';
    }
    // 'hold' bzw. unbekannter Wert: gleiche Formulierung wie repsLow-Fallback,
    // aber mit Erholungs-Begruendung statt Wiederholungs-Begruendung.
    // "im Bereich" darf NICHT unbedingt behauptet werden: reason 'hold'
    // entsteht auch bei einer als "Sehr schwer" bewerteten Einheit mit
    // VERFEHLTEM Bereich ([5,5,4] bei 6-8) -- der Satz waere dann in sich
    // widerspruechlich und faktisch falsch. Bereich wird deshalb nur genannt,
    // nicht behauptet, wenn die Wiederholungen darunter/darueber lagen.
    var inRange = !!(range && (wr.lastReps || []).length &&
      (wr.lastReps || []).every(function (v) { return v >= wr.repRange[0] && v <= wr.repRange[1]; }));
    var rangeTxt = !range ? '' : (inRange ? ' im Bereich ' + range : ' (Bereich ' + range + ')');
    return name + 'Zuletzt ' + reps + ' Wiederholungen' + rangeTxt +
      ' — Regel: Erholung geht vor Steigerung, Gewicht bleibt bei ' + to + ', Schrittweite ' + step + ' folgt danach.';
  }

  function resolveIntent(text, snap) {
    var q = norm(text);
    if (!q) return null;
    var s = snap || {};

    // VORAB-AUSNAHME (laeuft VOR BLOCK). Aufwaermen wird im Deutschen fast
    // immer als "wie soll ich mich aufwaermen?" gefragt -- "soll ich" steht in
    // BLOCK, die Frage kaeme also nie an. Sie ist aber weder wertend noch
    // planend: die Antwort ist ein aus dem Arbeitsgewicht gerechnetes Schema.
    //
    // Traegt wird die Ausnahme von WARMUP_ONLY (Erlaubnisliste auf die ganze
    // Frage, siehe dort). medical() und BLOCK_MINUS_SOLL stehen nur noch als
    // zusaetzliche Sicherung dahinter -- durch die Verankerung koennen ihre
    // Woerter in einer erlaubten Form gar nicht mehr vorkommen.
    //
    // Fehlt das Schema, faellt die Frage auf die spaeteren Intents DURCH
    // (frueher: harter Abbruch mit null). Der Abbruch hat echte Fragen
    // verschluckt, sobald das Aufwaermwort nur nebenbei vorkam.
    if (WARMUP_ONLY.test(q) && !medical(q) && !BLOCK_MINUS_SOLL.test(q) && s.warmupText) {
      return { intent: 'warmup', answer: s.warmupText };
    }

    // VORAB-AUSNAHME 2 (Task 4): Begruendung des eigenen Gewichtsvorschlags.
    // "warum" steht bewusst in BLOCK (siehe oben) -- ohne diese Ausnahme kaeme
    // die Frage nie an, "warum" bleibt aber drin, sonst rutschen wertende
    // Fragen ("warum ist mein plan so aufgebaut?") durch.
    //
    // Auch hier ERLAUBNISLISTE statt Sperrliste (Begruendung ausfuehrlich bei
    // WARMUP_ONLY). Der Vorlaeufer verlangte nur, dass Warum-Wort und
    // Gewichts-Signal innerhalb von 24 Zeichen beieinanderstehen und kein Wort
    // einer Verbotsliste im Satz vorkommt. Das ist nach aussen offen: jede
    // Beschwerde ohne Koerperteilwort passt zwischen die 24 Zeichen und bekam
    // die Progressionsregel als Antwort ("warum knackt es bei 60 kg?", "warum
    // wird mir uebel bei dem gewicht?", "warum ist das gewicht bei meiner
    // arthrose ok?"). Deshalb: die Frage muss ALS GANZES eine der bekannten
    // Formen haben -- Warum-Wort, aufgezaehlte Fuellwoerter, Gewichts-Signal,
    // Satzende. Ein Verb, ein Koerperteil, ein zweiter Halbsatz bricht die
    // Form, und die Frage laeuft weiter durch BLOCK.
    //
    // medical/BODYWEIGHT/BLOCK_MINUS_WARUM bleiben als zusaetzliche Sicherung
    // davor stehen. Ohne aktiven Vorschlag (s.weightReason) greift die
    // Ausnahme gar nicht -- sonst wuerde der Router eine Begruendung erfinden,
    // wo keine ansteht.
    if (!medical(q) && !BODYWEIGHT.test(q) && !BLOCK_MINUS_WARUM.test(q) && s.weightReason) {
      var wr = s.weightReason;
      // norm() ersetzt Komma UND Punkt durch Leerzeichen -- "62,5" und "62.5"
      // werden dadurch beide zu "62 5". Muster also aus Ganzzahl- und
      // Nachkommateil bauen, das Leerzeichen dazwischen optional lassen.
      var toParts = String(wr.toKg).split('.');
      var numSig  = toParts.length === 2 ? toParts[0] + ' ?' + toParts[1] : String(Math.round(Number(wr.toKg)));
      // Fuellwoerter sind NAMENTLICH aufgezaehlt und stehen zwischen Warum-Wort
      // und Gewichts-Signal. Alles, was nicht in dieser kurzen Liste steht,
      // bricht die Form -- das ist der ganze Mechanismus.
      var fill = '(?:(?:ist|sind|war|waren|es|das|dieses|dieser|diese|dies|denn|' +
                 'eigentlich|genau|heute|jetzt|nun|is|are|it|the|this|that|now|today) )*';
      // Gewichts-Signal am Satzende: entweder das Wort selbst, oder die
      // vorgeschlagene Zahl (optional mit Einheit). Die Zahl steht dadurch
      // automatisch als eigenes Wort und nur am Satzende -- "warum ist mein 1rm
      // 160 gesunken?" und "warum nur 100 kalorien?" haben Text dahinter und
      // fallen an '$'.
      var wSig = '(?:gewicht|weight|' + numSig + '(?: ?(?:kg|kilo|lbs|pfund))?)';
      var whyRe = new RegExp(
        '^(?:warum|wieso|weshalb|why|wie kommst du (?:auf|darauf)|how come|' +
        'how did you (?:get|pick|choose)) ' + fill + wSig + '$'
      );
      if (whyRe.test(q)) {
        return { intent: 'weightWhy', answer: weightWhyAnswer(wr) };
      }
    }

    if (BLOCK.test(q)) return null;

    // 1) Naechstes Gewicht -- "gewicht"/"weight" allein ist z.B. auch eine
    // Frage zum Koerpergewicht/Abnehmen. Gate: braucht zusaetzlich einen
    // "naechster Satz"-Bezug, sonst kein Treffer.
    if (two(q, /gewicht|weight/, /naechste[nsr]? satz|next set/)) {
      if (s.active && s.active.nextW != null) {
        return { intent: 'nextWeight', answer: 'Nächster Satz: ' + num(s.active.nextW) + ' kg.' };
      }
      return null;
    }

    // 1b) Naechster Satz als Ganzes (Saetze x Wdh. bei Gewicht). Steht NACH
    // Intent 1, damit die reine Gewichtsfrage weiter die kurze Antwort bekommt.
    // Verlangt den Besitz-/Nominativbezug "mein naechster satz": "beim
    // naechsten satz" ist eine Frage NACH etwas anderem (Uebung, Wdh.) und
    // wird von zwei bestehenden Tests ausdruecklich als "ans Modell" gefuehrt.
    if (/mein(en|em)? naechste[nrs]? satz|my next set/.test(q)) {
      if (!s.nextSetText) return null;
      return { intent: 'nextSet', answer: s.nextSetText };
    }

    // 2) Rekord -- "record" ist im Englischen auch ein Verb ("to record a
    // workout in a journal"). Nur "my record"/"personal record" (Substantiv
    // mit Besitzbezug) zaehlt; das deutsche Lehnwort "rekord" hat ausserhalb
    // des Sport-/Bestleistungskontexts praktisch keine Alltagsbedeutung.
    if (/rekord|bestleistung|bester satz|bestes satz|personal best|my record|personal record/.test(q)) {
      var ex = findExercise(q, s.exercises);
      if (!ex) return null;
      var b = (s.bestSet || {})[ex.id];
      if (!b) return null;
      return { intent: 'best',
               answer: ex.name + ': ' + num(b.w) + ' kg mal ' + b.r + ' Wiederholungen, am ' + datum(b.date) + '.' };
    }

    // 3) Verbleibende Saetze
    // "wie viele"/"wieviele" muss direkt vor "saetze"/"satz" stehen (nur durch
    // Leerraum getrennt) — sonst matcht z.B. "wie viele Wiederholungen beim
    // naechsten Satz" (Frage zu Wiederholungen, kein Bezug zu Restsaetzen).
    // Englisch "how many sets"/"sets left" ist bare mehrdeutig (Tennis/andere
    // Satz-Spiele: "how many sets are there in a tennis match") -- und anders
    // als bei Intent 7 hier auch real erreichbar, weil s.active im laufenden
    // Training staendig befuellt ist. Gate: zusaetzliches Trainingswort noetig.
    if (/(wie viele|wieviele)\s+(saetze|satz)|saetze noch/.test(q) ||
        two(q, /how many sets|sets left/, /workout|training|gym|reps?\b/)) {
      if (!s.active || s.active.setsTotal == null || s.active.setsDone == null) return null;
      var left = s.active.setsTotal - s.active.setsDone;
      if (left < 0) return null;
      return { intent: 'setsLeft',
               answer: left === 1 ? 'Noch 1 Satz.' : 'Noch ' + left + ' Sätze.' };
    }

    // 4) Restpause -- "rest" allein ist ein normales englisches Wort
    // (Ruhetag "rest day", Pronomen "der Rest von meinen Freunden"). Gate:
    // "my rest" (Besitzbezug auf die eigene Pause) oder "rest ... left"
    // (Restdauer-Frage) sind eindeutig; "pause" (Deutsch) und "rest timer"
    // sind als feste Fachbegriffe ohne Alltagsbedeutung weiter bare genug.
    if (/pause|rest timer|my rest|rest[\s\S]*left/.test(q)) {
      if (!s.restLeftSec) return null;
      return { intent: 'rest', answer: 'Noch ' + s.restLeftSec + ' Sekunden Pause.' };
    }

    // 5) Erholung -- Muskelgruppen-Name allein beweist keinen Fitnessbezug:
    // JEDER Name in dieser App (Brust, Beine, Bauch, Ruecken, Schulter, Arme)
    // ist zugleich ein gewoehnliches Koerperteil-Wort. Das ist kein
    // Einzelfall, sondern systematisch -- ein zweites-Fitness-Wort-Gate wie
    // bei Intent 1/3/7 hilft hier nicht, weil der Muskelname selbst das
    // zweite Wort waere. Stattdessen: Frageform verlangen (wie/how) statt
    // blossem Wortstamm -- Erzaehlsaetze ueber Urlaub o.ae. sind so gut wie
    // nie als Frage mit "wie"/"how" formuliert. Schliesst den gemeldeten Fall
    // ("Ich war im Erholungsurlaub, meine Brust hat sich ausgeruht") vollstaen-
    // dig, aber NICHT jede denkbare Umformung (z.B. "Wie war mein Erholungs-
    // urlaub, meine Brust hat sich ausgeruht?" traegt "wie" zufaellig incl. und
    // matcht weiter falsch) -- echte Trennung von Erzaehlsatz und Frage
    // braucht Semantik, ist also lexikalisch nicht vollstaendig loesbar.
    if (two(q, /erhol|recover|regenerier/, /\bwie\b|\bhow\b/)) {
      var rec = s.recovery || {};
      var mg = Object.keys(rec).filter(function (k) { return q.indexOf(norm(k)) >= 0; })[0];
      if (!mg) return null;
      return { intent: 'recovery', answer: mg + ' ist zu ' + rec[mg] + ' Prozent erholt.' };
    }

    // 5b) Letzter PR -- MUSS vor Intent 6 stehen: "wann hatte ich zuletzt einen
    // pr?" trifft dort auf "wann hatte ich"/"zuletzt", findet keinen
    // Uebungsnamen und wuerde die Frage mit null verschlucken. "pr" nur mit
    // Wortgrenzen (nicht in "prima", "pro"); "rekord" bleibt bewusst draussen,
    // das gehoert Intent 2 (Rekord EINER Uebung).
    if (/\bprs?\b|last pr|latest pr/.test(q)) {
      if (s.lastPrExName == null || s.lastPrKg == null || s.lastPrDaysAgo == null) return null;
      var pd = s.lastPrDaysAgo === 0 ? 'heute'
             : s.lastPrDaysAgo === 1 ? 'gestern'
             : 'vor ' + s.lastPrDaysAgo + ' Tagen';
      return { intent: 'lastPr',
               answer: 'Letzter Rekord: ' + s.lastPrExName + ' mit ' + num(s.lastPrKg) + ' kg, ' + pd + '.' };
    }

    // 6) Letzte Ausfuehrung
    if (/zuletzt|letztes mal|last time|wann hatte ich/.test(q)) {
      var ex2 = findExercise(q, s.exercises);
      if (!ex2) return null;
      var d = (s.lastDone || {})[ex2.id];
      if (!d) return null;
      return { intent: 'lastDone', answer: ex2.name + ' zuletzt am ' + datum(d) + '.' };
    }

    // 6b) Volumen EINER Muskelgruppe -- steht VOR Intent 7, sonst beantwortet
    // der Gesamt-Intent "wie viel volumen brust diese woche?" mit der
    // Gesamtzahl. Umgekehrt darf dieser Intent die allgemeine Frage nicht
    // schlucken: er verlangt zusaetzlich ein Muskelwort im Satz. Fehlt die
    // Zahl fuer genau diese Gruppe, endet die Frage hier mit null statt auf
    // das Gesamtvolumen durchzufallen (das waere eine falsche Auskunft).
    if (MUSCLE.test(q) && two(q, /volumen|volume|tonnage/, /woche|week|training|gesamt/)) {
      var mv = s.muscleVolume || {};
      var mk = Object.keys(mv).filter(function (k) { return q.indexOf(norm(k)) >= 0; })[0];
      if (!mk || mv[mk] == null) return null;
      return { intent: 'muscleVolume',
               answer: mk.charAt(0).toUpperCase() + mk.slice(1) + ' diese Woche ' + num(mv[mk]) + ' kg Volumen.' };
    }

    // 7) Wochenvolumen -- "volume" ist im Englischen zuerst Lautstaerke.
    // Gate: braucht zusaetzlich einen Zeit-/Trainingsbezug. Der Aufrufer
    // befuellt weekVolumeKg aus _weekStats().vol; fehlt das Feld (alter
    // Schnappschuss oder Fehler beim Bauen), geht die Frage ans Modell.
    if (two(q, /volumen|volume|tonnage/, /woche|week|training|gesamt/)) {
      if (s.weekVolumeKg == null) return null;
      return { intent: 'volume', answer: 'Diese Woche ' + num(s.weekVolumeKg) + ' kg Gesamtvolumen.' };
    }

    // 8) Was steht heute an -- die deutschen Wendungen sind ausserhalb des
    // Trainings praktisch unbenutzt. Die englische Phrase "whats on today"
    // bleibt gleichermassen bare: das hier ist der Chat eines Fitness-Coaches
    // in einer Trainings-App, kein allgemeiner Assistent -- eine bare Frage in
    // GENAU diesem Chat-Fenster ist so gut wie immer der Trainingstag, nicht
    // Kino-/TV-Programm (diese Lesart braucht einen anderen Chat-Kontext, nicht
    // diesen). Ein frueherer two()-Zwang auf workout/training/gym verlor damit
    // ohne einen in diesem Chat plausiblen Gegenfall echte, gewollte Treffer.
    if (/heute an|heute dran|was mache ich heute|what.?s on today/.test(q)) {
      if (!s.todayText) return null;
      return { intent: 'today', answer: s.todayText };
    }

    // --- Task 3: weitere lokal beantwortbare Fragen ------------------------
    // Alle nach demselben Muster: eindeutiges Muster UND vorhandene Daten.
    // Fehlt das Feld, ist die Antwort null (Frage geht ans Modell) -- nie ein
    // geratener Wert. Ein erfundener Wert waere eine Falschaussage des
    // Coaches und damit teurer als jeder Modellaufruf.

    // 9) Supersatz-Partner der AKTUELLEN Uebung -- der bare Wortstamm matchte
    // auch die Wissensfrage "was ist ein supersatz?" und beantwortete sie mit
    // dem Partner der laufenden Uebung. Gate: zusaetzlich ein Bezug auf den
    // eigenen, gerade laufenden Satz.
    // "habe ich"/"hab ich" gehoert dazu: "habe ich einen supersatz?" hat
    // ausserhalb eines laufenden Trainings keine Alltagslesart und wird
    // ohnehin durch das fehlende s.supersetText abgesichert. Die Wissensfrage
    // "was ist ein supersatz?" bleibt davon unberuehrt.
    if (two(q, /supersatz|supersaetze|superset/,
              /\bdazu\b|partner|\bmein|aktuell|gerade|jetzt|\bhier\b|\bmy\b|current|hab(e)? ich/)) {
      if (!s.supersetText) return null;
      return { intent: 'superset', answer: s.supersetText };
    }

    // 10) Wochenfortschritt -- "woche"/"week" allein ist ein Alltagswort
    // ("diese Woche war anstrengend"). Gate: zweites TRAININGS-Signal noetig.
    // "wie viele"/"how many" taugt dafuer nicht: das ist ein reiner
    // Mengenfrage-Marker ohne Trainingsbezug und hat "wie viele tage hat diese
    // woche?" mit "Diese Woche 3 von 4 Einheiten." beantwortet.
    // "trainier" muss neben "training" stehen: "trainiert" enthaelt "training"
    // NICHT als Teilstring, "wie viele male habe ich diese woche trainiert?"
    // ging deshalb unnoetig ans Modell. Die reinen Mengenfragen ("wie viele
    // tage hat diese woche?") bleiben ohne Trainings-Signal weiter draussen.
    if (two(q, /woche|week/, /trainier|training|einheit|workout|session|geschafft/)) {
      if (s.weekWorkouts == null || s.weekGoal == null) return null;
      return { intent: 'weekProgress',
               answer: 'Diese Woche ' + s.weekWorkouts + ' von ' + s.weekGoal + ' Einheiten.' };
    }

    // 11) Streak. Die App zaehlt sie in WOCHEN am Stueck (calcStreak().weeks),
    // nicht in Tagen -- Feldname und Text folgen der Anzeige im Heute-Tab.
    if (/streak|trainingsserie|serie in folge/.test(q)) {
      if (s.streakWeeks == null) return null;
      return { intent: 'streak',
               answer: s.streakWeeks === 1 ? 'Eine Woche in Folge trainiert.'
                                           : s.streakWeeks + ' Wochen in Folge trainiert.' };
    }

    // 12) Durchschnittliche Trainingsdauer -- "schnitt" allein ist mehrdeutig
    // (Schnitt/schneiden), deshalb zusaetzlich ein Trainings-Wort. Dauer-Woerter
    // taugen als zweites Signal NICHT: "lang" matchte als Teilstring in
    // "langhantel"/"langsam", und "dauer" liess die Frage nach der SATZdauer
    // ("wie lange sollte ein durchschnittlicher satz dauern?") mit der
    // Trainingsdauer beantworten. Beide Fragen gehen jetzt ans Modell.
    // "\bgym\b" ist als zweites Signal sicher (Ort des Trainings, keine
    // Alltagslesart) und holt "wie lange bin ich im schnitt im gym?" zurueck.
    // "dauer" bleibt bewusst DRAUSSEN: es wuerde die Frage nach der SATZdauer
    // ("was ist die durchschnittliche dauer eines satzes?") mit der
    // Trainingsdauer beantworten -- genau der Fehler, den W4 geschlossen hat.
    if (two(q, /schnitt|durchschnitt|average/, /trainier|training|workout|einheit|session|\bgym\b/)) {
      if (s.avgDurationMin == null) return null;
      return { intent: 'avgDuration',
               answer: 'Im Schnitt trainierst du ' + s.avgDurationMin + ' Minuten.' };
    }

    // 13) Gestrige Einheit -- "gestern" ist ein blankes Alltagswort und hat
    // "was war gestern im fernsehen?" mit der gestrigen Einheit beantwortet.
    // Gate: zweites Trainings-Signal noetig.
    // Zweiter Weg statt breiterem Signal: die bare Frage "was war gestern?"
    // hat kein zweites Wort, das man ergaenzen koennte, ohne "was war gestern
    // im fernsehen?" mitzunehmen. Also dieselbe Loesung wie bei den beiden
    // Vorab-Ausnahmen -- eine auf die ganze Frage verankerte Ganzform.
    if (two(q, /gestern|yesterday/, /training|trainiert|workout|einheit|session|gemacht|volumen|uebung|\bgym\b|satz|saetze/) ||
        /^(?:was|wie) war(?:s)? (?:es )?gestern$|^gestern$|^(?:what|how) was yesterday$/.test(q)) {
      if (!s.yesterdayText) return null;
      return { intent: 'yesterday', answer: s.yesterdayText };
    }

    // 14) Naechster Plantag -- bewusst NACH Intent 8 (heute), damit
    // "was steht heute an" dort bleibt. Das bare "what's next" ist hier eine
    // praezise Phrase zu wenig: es traf auch "whats next after this set?"
    // (Frage zum laufenden Training) und antwortete mit dem Plantag. Der
    // englische Zweig verlangt deshalb den Plan-/Trainingsbezug im Wortlaut.
    if (/als naechstes an|als naechstes dran|naechste[rs]? (trainingstag|plantag|einheit)|next (training|workout|plan) day|what.?s next (?:workout|training|session|day|on the plan)/.test(q)) {
      if (!s.nextPlanDayText) return null;
      return { intent: 'nextPlanDay', answer: s.nextPlanDayText };
    }

    // 15) Liste der eigenen Plaene. Englisch ("which plans do i have") faellt
    // in BLOCK (Wortstamm "plan") und geht ans Modell -- der Stamm bleibt dort
    // absichtlich stehen, weil er alle Plan-AENDERUNGSwuensche abfaengt.
    if (/welche plaene|meine plaene|plaene habe ich|planliste/.test(q)) {
      var pn = (s.planNames || []).filter(Boolean);
      if (!pn.length) return null;
      return { intent: 'planList', answer: 'Deine Pläne: ' + pn.join(', ') + '.' };
    }

    return null;
  }

  var API = { resolveIntent: resolveIntent };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachIntent = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
