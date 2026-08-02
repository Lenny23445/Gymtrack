/* GymTrack — Intent-Router (Baustein 3)
   Beantwortet haeufige Gym-Fragen aus lokalen Daten, ohne LLM-Aufruf.
   Bekommt einen fertigen Datenschnappschuss statt globaler App-Variablen —
   dadurch ohne Browser testbar und nicht an interne Strukturen gebunden. */
(function (root) {
  'use strict';

  // Ein Treffer verlangt ein eindeutiges Muster UND vorhandene Daten. Alles
  // Wertende, Planende oder Medizinische geht bewusst ans Modell.
  //
  // ======================================================================
  // GESUNDHEITSFRAGEN: UMGEKEHRTE ENTSCHEIDUNG, BITTE VOR DEM AENDERN LESEN
  // ======================================================================
  // ALTE ENTSCHEIDUNG (rueckgaengig gemacht): Krankheits-Woerter (krank/
  // erkaeltet/fieber/...) standen einmal hier in BLOCK und wurden entfernt.
  // Begruendung damals: BLOCK gilt fuer ALLE Intents, nicht nur fuer den
  // einen, den es schuetzen sollte, und blockierte deshalb auch fachfremde,
  // voellig harmlose Fragen -- "ich bin erkaeltet, wie viele saetze noch?"
  // bekam gar keine Antwort mehr, obwohl die Satzzahl mit der Erkaeltung
  // nichts zu tun hat. Das ist sachlich richtig beobachtet, optimiert aber
  // eine BEQUEMLICHKEIT (eine harmlose Frage kostet einen Modellaufruf) auf
  // Kosten einer SICHERHEITSEIGENSCHAFT.
  //
  // WAS DARAUS WURDE: fuenf Reviewrunden lang wurde immer dieselbe
  // Fehlerklasse gefunden -- eine Frage mit Gesundheitsbezug bekam irgendwo
  // im Router eine lokale Konservenantwort:
  //   "darf ich diese woche mit fieber trainieren?" -> "Diese Woche 3 von 4
  //   Einheiten."
  //   "wie soll ich mich aufwaermen fuer die brust nach meinem herzinfarkt?"
  //   -> Aufwaermschema.
  // Jede Runde schloss die Saetze, die zufaellig im Bericht standen (ein
  // Signalwort raus, eine Ganzform rein), die naechste Runde fand mit der
  // naechsten Formulierung die naechste Luecke -- in einem anderen Intent
  // oder in derselben Frage, nur mit der Meldung im Nachsatz statt im
  // Vorsatz. Der Grund ist strukturell: die Klasse wurde an zwoelf Stellen
  // bekaempft, an denen sie sich zeigt, statt an der einen, an der sie
  // entsteht.
  //
  // NEUE REGEL (Entscheidung des Nutzers): traegt die Frage IRGENDWO ein
  // Krankheits-, Beschwerde-, Schwangerschafts-, Medikamenten- oder
  // Behandlungssignal, antwortet der Router UEBERHAUPT nicht mehr, sondern
  // gibt die Frage ans Modell -- ein GLOBALES Gate vor ALLEN Intents, siehe
  // medical() weiter unten und der Aufruf am Kopf von resolveIntent().
  // Nicht in BLOCK, weil die beiden Vorab-Ausnahmen an BLOCK vorbeilaufen
  // duerfen -- am Gesundheits-Gate darf nichts vorbeilaufen.
  //
  // DER PREIS ist genau der oben beschriebene und wird bewusst bezahlt: eine
  // harmlose Frage mit einem Krankheitswort drin ("ich bin erkaeltet, wie
  // viele saetze noch?") kostet ab jetzt einen Modellaufruf. Ein Test haelt
  // diesen Preis ausdruecklich fest ("Krankheitswort beendet den Router").
  // Wer das Gate zurueckbaut, um den Modellaufruf zu sparen, oeffnet die
  // Fehlerklasse wieder -- vollstaendig, nicht teilweise, weil KEIN Intent
  // eigenen Gesundheitsschutz hat.
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

  // GESUNDHEITS-SIGNALE -- die Liste des globalen Gates (siehe Kopf der
  // Datei). Sie galt frueher nur fuer die zwei Vorab-Ausnahmen; seit der
  // Umkehr der BLOCK-Entscheidung laeuft medical() vor ALLEN Intents.
  //   MED_HARD  -- eindeutige Krankheits-/Beschwerde-/Schwangerschafts-/
  //                Medikamenten-/Behandlungswoerter, blocken allein;
  //   BODY + COMPLAIN -- ein Koerperteil zusammen mit einer Beschwerde- oder
  //                Risikoaussage ("knackt das knie", "gefaehrlich fuer mein
  //                knie"). Ein Koerperteil ALLEIN blockt bewusst nicht, sonst
  //                waere jede normale Frage mit Muskelnamen betroffen.
  //
  // DAS GATE IST BEWUSST EINE SPERRLISTE -- und anders als bei den beiden
  // Vorab-Ausnahmen ist das hier herum richtig. Die Ausnahmen sind
  // ERLAUBNISlisten, weil dort ein Durchlasser eine lokale Antwort auf eine
  // unbekannte Frage waere; das Gate dagegen entscheidet nur, ob der Router
  // schweigt. Ein Fehlalarm kostet einen Modellaufruf, ein Durchlasser waere
  // eine medizinische Falschauskunft -- die Ausfallrichtung stimmt also, und
  // eine unvollstaendige Liste macht das Gate schlechter, aber nie falsch.
  // Neue Signalwoerter gehoeren deshalb HIER dazu und nirgends sonst; ein
  // zweites Gate an einem einzelnen Intent ist genau der Fehler, den die
  // Umkehr behoben hat.
  var MED_HARD = /schmerz|weh|verletz|zwick|ziep|hurts|pain|injur|\bache|\bsore\b|krank|erkaelt|fieber|grippe|husten|schnupfen|entzuend|zerr|ueberdehn|riss|gerissen|frakt|verstauch|umgeknickt|\breha\b|arzt|aerzt|physio|\bop\b|operation|operier|narkose|meniskus|bandscheibe|kreuzband|\btaub\b|kribbel|prellung|kaputt|schwanger|trimester|stillzeit|wochenbett|asthma|allergi|infekt|corona|covid|impf|infarkt|schlaganfall|herzschwaech|herzfehler|herzrasen|herzstolper|kreislauf|ohnmacht|kollabier|blutdruck|blutung|diabet|epilep|krampf|migraene|arthrose|arthrit|osteoporose|skoliose|hernie|krebs|tumor|chemo|betablocker|medikament|tablette|antibiot|cortison|insulin|therapie|diagnos|symptom|attest|schwindel|uebelkeit|uebel|erbrech|atemnot|luftnot|panikattack|depress|burnout|essstoerung|magersucht|bulimie/;
  var BODY     = /knie|schulter|ruecken|nacken|huefte|handgelenk|ellenbogen|ellbogen|sprunggelenk|knoechel|wirbel|achilles|gelenk|sehne|knee|shoulder|wrist|elbow|ankle|joint|tendon/;
  var COMPLAIN = /knack|knirsch|ziep|stich|brenn|schwill|geschwoll|taub|kribbel|klemm|steif|verspann|gefaehrl|riskant|schaedl|schon(t|en)|blockiert|instabil|ueberlast/;
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
  //
  // AUFBAU: die Liste ist aus BAUSTEINEN gebaut, nicht aus einer Sammlung
  // fertiger Ganzformen. Weiten heisst deshalb "ein Wort mehr in einer Klasse"
  // statt "eine Ganzform mehr in der Aufzaehlung" -- die erste Fassung war so
  // eng, dass von 20 natuerlichen Aufwaermformulierungen nur 6 ausloesten.
  //   LEAD    -- Anrede/Interjektion am Satzanfang ("hey", "sag mal", "und").
  //              Ein einziges vorangestelltes Fuellwort brach vorher die
  //              ganze Form. LEAD kann nichts einschleusen: die Woerter tragen
  //              weder Beschwerde noch Wertung, dafuer braeuchte es ein Verb,
  //              ein Adjektiv oder ein Substantiv -- und jedes davon bricht
  //              die Form weiterhin am '$'.
  //   WU_FILL -- erlaubte Fuellwoerter zwischen Frage- und Sachwort.
  //   WU_WORD -- die Sachwoerter selbst, inkl. haeufigem Vertipper
  //              ("aufwaermn") ueber das optionale 'e'.
  // Beide Verbstellungen sind abgedeckt: die Verb-Endstellung ("wie soll ich
  // mich aufwaermen") UND die trennbare Form ("wie waerme ich mich auf"), die
  // im Deutschen die haeufigste ueberhaupt ist und in KEINEM Stand je griff --
  // "aufwaermen" als geschlossenes Wort kommt darin gar nicht vor.
  var LEAD = '(?:(?:hey|hi|hallo|moin|sag mal|sag|mal|ok|okay|also|und|bitte|du) )*';

  var WU_FILL = '(?:(?:am besten|richtig|gut|kurz|schnell|heute|jetzt|nochmal|noch|' +
                'vorher|davor|zuerst|denn|eigentlich|mich|mal) )*';
  var WU_WORD = '(?:aufwaerme?n|einwaerme?n|warm ?machen)';
  var EN_FILL = '(?:(?:best|properly|right|quickly|first|today|now) )*';

  var WARMUP_ONLY = new RegExp(
    '^' + LEAD + '(?:' +
      // Verb-Endstellung: "wie soll ich mich (am besten) aufwaermen"
      '(?:wie|womit|was)(?: (?:soll|sollte|muss|kann|mache|mach))?(?: ich)? ' + WU_FILL + WU_WORD +
    '|' +
      // Nominalisiert: "was soll ich zum aufwaermen machen"
      '(?:wie|womit|was)(?: (?:soll|sollte|muss|kann))?(?: ich)? ' + WU_FILL +
      'zum ' + WU_WORD + '(?: (?:machen|tun))?' +
    '|' +
      // Trennbares Verb: "wie waerme ich mich auf", "wie mache ich mich warm"
      '(?:wie|womit|was) (?:waerme|waerm|mache|mach|krieg|kriege|bekomme) ich ' +
      WU_FILL + '(?:auf|warm)' +
    '|' +
      // Blosse Nennung, Schau- und Bittform
      '(?:' + WU_WORD + '|warm ?up)' +
    '|' +
      '(?:wie sieht|was ist) mein(?:e|s)? ' + WU_WORD + '(?: aus)?' +
    '|' +
      'gib mir (?:ein|eine|einen) ' + WU_WORD +
    '|' +
      // Englisch -- Pronomen optional ("how to warm up"), Nachlauf begrenzt
      'how (?:should|do|can|shall|would|to)(?: (?:i|we|you))? ' + EN_FILL +
      'warm ?up(?: (?:today|now|properly|first))?' +
    '|' +
      'what ?s a (?:good|proper|solid|nice|quick|decent) warm ?up' +
    ')$'
  );

  // Optionales Ziel am Satzende ("wie aufwaermen fuer bankdruecken?"). Ein
  // BELIEBIGER Nachsatz darf hier nicht stehen -- damit waere die Verankerung
  // nach hinten wieder offen und "wie aufwaermen fuer die brust nach meinem
  // herzinfarkt" bekaeme ein Schema.
  //
  // ENTSCHEIDEND: der Nachsatz muss ein Ziel SEIN, nicht eines ENTHALTEN. Die
  // erste Fassung hat mit MUSCLE.test()/findExercise() nur gesucht, ob
  // irgendwo im Rest ein Muskel- oder Uebungsname vorkommt -- beides
  // unverankerte Teilstring-Tests. Damit schnitt ein beliebig langer Nachsatz
  // weg, sobald ein einziges Zielwort darin stand, und 13 von 19
  // medizinischen Nachsatz-Meldungen bekamen wieder ein Schema. Je kuerzer
  // ein Nutzer-Uebungsname ist (Nutzer duerfen sie frei vergeben, z.B. "Dip"),
  // desto beliebiger wurde der Nachsatz. Deshalb: Vergleich als GANZES gegen
  // MUSCLE_EXACT bzw. gegen den exakten Uebungsnamen; die kurze Artikelliste
  // im Muster ist die einzige zugelassene Umgebung. Alles andere bleibt
  // stehen, bricht die Ganzform und kostet hoechstens einen Modellaufruf --
  // auch eine an sich harmlose Variante ("fuer dips" bei der Uebung "Dip").
  // Das ist der gewollte Ausfall nach innen.
  function warmupTarget(t, s) {
    if (MUSCLE_EXACT.test(t)) return true;
    return (s.exercises || []).some(function (ex) { return norm(ex.name) === t; });
  }

  function warmupCore(q, s) {
    var m = /^(.+?) (?:fuer|for) (?:mein(?:e|en|em)? |das |die |den |der )?([a-z0-9 ]+)$/.exec(q);
    if (!m) return q;
    return warmupTarget(m[2], s) ? m[1] : q;
  }

  // "gewicht"/"weight" ist auch das KOERPERgewicht. Der Coach begruendet aber
  // ausschliesslich seinen eigenen Hantel-Vorschlag -- Waage-, Zu- und
  // Abnehmfragen gehoeren ans Modell, auch wenn die vorgeschlagene Zahl
  // zufaellig danebensteht ("wieso wiege ich 60 kilo?").
  // "viel kilos" ohne das Wort "gewicht" ist die Waage-Lesart ("warum so viel
  // kilos?"), waehrend "diese kilos"/"so viel gewicht" den Hantelvorschlag
  // meint und in der 40er-Erlaubnisliste steht. Diese eine Form laesst sich
  // nicht durch Verengen der Erlaubnisliste trennen -- "so" und "viel" werden
  // dort gebraucht --, deshalb steht sie hier.
  var BODYWEIGHT = /koerpergewicht|body ?weight|abnehm|zunehm|zugenommen|abgenommen|an gewicht|wiege ich|\bwaage\b|gewicht verloren|viele? kilos?/;

  // Muskelgruppen-Woerter als reines JA/NEIN, ob eine Volumenfrage ueberhaupt
  // muskelspezifisch gemeint ist. Die ZAHL kommt ausschliesslich aus
  // s.muscleVolume; diese Liste liefert nie einen Wert, nur die Unterscheidung
  // "Gesamtvolumen" vs. "Volumen einer Gruppe". Ohne sie wuerde eine
  // Brust-Frage bei fehlendem s.muscleVolume vom Gesamtvolumen-Intent mit
  // einer konfident falschen Zahl beantwortet.
  var MUSCLE = /brust|ruecken|beine|\bbein\b|schulter|\barme\b|\barm\b|bauch|bizeps|trizeps|waden|gesaess|\bpo\b|chest|\bback\b|\blegs\b|shoulder|\barms\b|\babs\b|biceps|triceps|glutes|calves/;

  // Verankerter Zwilling von MUSCLE fuer warmupCore(): "ist das GANZE Feld ein
  // Muskelname?" statt "kommt irgendwo einer vor?". Aus derselben Quelle
  // abgeleitet statt abgeschrieben -- eine zweite, handgepflegte Wortliste
  // waere beim naechsten neuen Muskelwort sofort auseinandergelaufen. Die
  // \b-Anker aus MUSCLE entfallen dabei, weil ^...$ strenger ist als jede
  // Wortgrenze.
  var MUSCLE_EXACT = new RegExp('^(?:' + MUSCLE.source.replace(/\\b/g, '') + ')$');

  // Drei Einzelfragen, die als BREITES zweites Signal je eine Fehlerklasse
  // wieder aufgemacht haetten. Die Signale ("trainier" bei Intent 10,
  // "\bgym\b" bei Intent 12, "hab(e)? ich" bei Intent 9) waren
  // Bequemlichkeits-Weitungen und liessen medizinische, wertende und
  // Wissensfragen mit einer konfidenten lokalen Antwort durch -- dieselbe
  // Schadensform, die die Verankerung der Vorab-Ausnahmen gerade geschlossen
  // hat, nur in anderen Intents. Zurueckgenommen; die jeweils EINE gemeldete
  // Frage steht stattdessen hier als auf die ganze Frage verankerte Ganzform,
  // dieselbe Loesung wie bei Intent 13. Der Preis einer nicht getroffenen
  // Formulierung ist ein Modellaufruf, der Preis eines Lecks eine
  // Konservenantwort auf "kann ich mit Fieber trainieren?".
  var SUPERSET_MINE = /^(?:habe|hab) ich (?:gerade |jetzt |grad |noch |schon )?(?:einen |ein |nen )?(?:supersatz|superset)$/;
  var WEEK_TRAINED  = /^wie (?:viele male|viel mal|oft) (?:(?:habe|hab) ich (?:diese|die) woche (?:schon |bereits )?trainiert|war ich (?:diese|die) woche (?:schon |bereits )?(?:im|beim) (?:training|gym))$/;
  var AVG_GYM       = /^wie lange bin ich (?:im schnitt |im durchschnitt |durchschnittlich )?im gym(?: (?:im schnitt|im durchschnitt|durchschnittlich))?$/;

  // Ganzform fuer die eigene gestrige Einheit (Intent 13). Ersetzt die beiden
  // baren Woerter "training" und "\bgym\b" aus dem Zweitsignal: "gestern" ist
  // ein Alltagswort, und "das gym" ist als ORT Gegenstand vieler Fragen, die
  // mit der eigenen Einheit nichts zu tun haben ("wie lange war das gym
  // gestern offen?" -> "Gestern: Push, 6 Uebungen, 5.400 kg Volumen."). Genau
  // diese Begruendung hat "\bgym\b" schon aus Intent 12 entfernt; in Intent 13
  // stand es unveraendert weiter drin. Der Besitzbezug ("ICH war", "MEIN
  // training") ist das, was die Ortsfrage von der eigenen Einheit trennt.
  var YEST_MINE     = /^(?:wie|was) war (?:mein|das) training gestern$|^wie war gestern (?:mein|das) training$|^wie lange war ich gestern (?:im|beim) (?:gym|training)$/;

  // Fund bei Pruefung des letzten Commits (Leck 4, siehe Intent 10 unten):
  // "training" stand dort als BARES Wort im Zweitsignal -- ein Teilstring-
  // Match, nicht nur eine eigene Vokabel. "trainiert"/"trainieren" enthalten
  // "training" NICHT als Teilstring (kein "ng" nach "raini"), deshalb blieb der
  // Fehler von den bestehenden Krankheits-/Erlaubnistests unentdeckt -- aber
  // "ins training"/"im training" treffen "training" trivial, und damit jede
  // Krankheits- oder Erlaubnisfrage, die "training" als eigenstaendiges Wort
  // nennt ("darf ich mit fieber ins training?"). Ganzform statt Wort, wie bei
  // WEEK_TRAINED direkt darueber: deckt die eine bekannte legitime Formulierung
  // ("wie viele trainings diese woche?") ab, ohne "training" als Teilstring
  // wieder freizugeben.
  // Die erste Fassung war deutlich enger als das Signal, das sie ersetzt hat,
  // und verlor sechs gelaeufige Formen (Praeteritum "hatte ich", das zu
  // WEEK_TRAINED inkonsistente "hab ich", der Nachlauf "gemacht", "waren das",
  // "in dieser woche"). Kein falscher Wert, nur unnoetige Modellaufrufe --
  // angeglichen an WEEK_TRAINED. Die Mengenfrage bleibt draussen, weil
  // "trainings|einheiten" Pflicht ist: "wie viele tage hat diese woche?"
  // passt weiterhin nicht.
  var WEEK_COUNT    = /^(?:wie viele|wieviele) (?:trainings|einheiten)(?: (?:habe|hab|hatte) ich| waren das)? (?:in )?(?:diese|dieser|die|der) woche(?: (?:schon|bereits))?(?: (?:gemacht|geschafft|absolviert))?$/;

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Sprachanzeige, GENAU dasselbe Muster wie s.unit direkt darunter: das
  // Modul kennt localStorage/GT_LANG NICHT und darf es nicht kennen -- s.lang
  // traegt schon die aufgeloeste Anzeigesprache ('de'|'en'), gesetzt von
  // _coachSnap() (index.html, dort liegt GT_LANG). Fehlt s.lang (jeder
  // Snapshot vor dieser Aenderung, alle Bestandstests), gilt 'de' -- das ist
  // die einzige Vorgabe, keine Erkennung aus dem Fragetext (der ist laengst
  // zweisprachig erkennbar, sagt aber nichts ueber die gewuenschte
  // Antwortsprache aus).
  function langOf(s) { return (s && s.lang === 'en') ? 'en' : 'de'; }

  function num(n, s) {
    var locale = langOf(s) === 'en' ? 'en-US' : 'de-DE';
    return Number(n).toLocaleString(locale, { maximumFractionDigits: 1 });
  }

  // Einheiten-Anzeige (Blockabschluss-Review Block 0, Befund 3): das Modul
  // kennt S/S.unitMode NICHT und darf es nicht kennen -- s.unit traegt schon
  // die fertige Anzeigeeinheit ('kg'|'lbs'), gesetzt von _coachSnap()
  // (index.html, dort liegen kgToDisp()/unitLabel()). Fehlt s.unit (jeder
  // Snapshot vor dieser Aenderung, alle Bestandstests), gilt 'kg' -- das ist
  // KEINE Umrechnung, nur eine Formatierung des bereits richtigen Werts.
  // Einziges Hilfsmittel fuer alle sechs betroffenen Antworten (naechstes
  // Gewicht, Rekord, Wochenvolumen, Muskelvolumen, letzter Rekord,
  // Gewichtsbegruendung) statt sechs eigenstaendiger hartcodierter ' kg'.
  function unitOf(s) { return (s && s.unit === 'lbs') ? 'lbs' : 'kg'; }
  function fmtW(n, s) { return num(n, s) + ' ' + unitOf(s); }

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
  function weightWhyAnswer(wr, s) {
    var reps  = (wr.lastReps || []).join('/');
    var range = (wr.repRange && wr.repRange.length === 2) ? wr.repRange[0] + '–' + wr.repRange[1] : '';
    var step  = fmtW(wr.stepKg, s);
    var to    = fmtW(wr.toKg, s);
    var name  = wr.exName ? wr.exName + ': ' : '';
    var pct   = wr.ciFactor != null ? Math.round((1 - wr.ciFactor) * 100) : 0;
    // Antwortsprache, gleiches Muster wie ueberall im Modul: s.lang statt
    // Fragetext, s.o. bei langOf(). Jeder der fuenf Zweige braucht seine
    // eigene englische Fassung -- eine gemeinsame Vorlage mit eingesetzten
    // Bruchstuecken wuerde in einer der beiden Sprachen falsch klingen.
    var en = langOf(s) === 'en';

    if (wr.reason === 'repsHigh') {
      return en
        ? name + 'Last time you hit ' + reps + ' reps (range ' + range +
          ') — rule: at the top of the range the weight goes up by the step ' + step +
          ', new weight ' + to + '.'
        : name + 'Zuletzt ' + reps + ' Wiederholungen geschafft (Bereich ' + range +
          ') — Regel: oben im Bereich steigt das Gewicht um die Schrittweite ' + step +
          ', neues Gewicht ' + to + '.';
    }
    if (wr.reason === 'repsLow') {
      return en
        ? name + 'Last time you hit ' + reps + ' reps (range ' + range +
          '), so the top of the range was not reached — rule: the weight stays at ' + to +
          ', the step ' + step + ' only kicks in once the top of the range works.'
        : name + 'Zuletzt ' + reps + ' Wiederholungen geschafft (Bereich ' + range +
          '), den Bereich oben also nicht erreicht — Regel: das Gewicht bleibt bei ' + to +
          ', die Schrittweite ' + step + ' greift erst, wenn der Bereich oben klappt.';
    }
    if (wr.reason === 'volumeUp') {
      // Der Volumenpfad: nicht jeder Satz lag oben, aber der erste, und in
      // Summe kamen mehr Wiederholungen zusammen als in der Einheit davor.
      return en
        ? name + 'Last time ' + reps + ' reps (range ' + range +
          ') — the first working set hit the top and your total reps went up versus the session before' +
          ' — rule: that counts as progression, the weight goes up by ' + step + ' to ' + to + '.'
        : name + 'Zuletzt ' + reps + ' Wiederholungen (Bereich ' + range +
          ') — der erste Arbeitssatz lag oben und in Summe kamen mehr Wiederholungen zusammen als in der Einheit davor' +
          ' — Regel: das zählt als Fortschritt, das Gewicht steigt um ' + step + ' auf ' + to + '.';
    }
    if (wr.reason === 'checkinUp') {
      return en
        ? name + 'Your check-in shows good recovery — rule: that already unlocks the bigger step ' +
          step + ', new weight ' + to + '.'
        : name + 'Dein Check-in zeigt gute Erholung — Regel: dadurch ist die größere Schrittweite ' +
          step + ' schon jetzt freigegeben, neues Gewicht ' + to + '.';
    }
    if (wr.reason === 'checkinDown') {
      return en
        ? name + 'Your check-in shows less recovery — rule: the weight drops by ' + pct +
          '% to ' + to + ' (base step ' + step + ').'
        : name + 'Dein Check-in zeigt weniger Erholung — Regel: das Gewicht sinkt deshalb um ' + pct +
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
    var rangeTxt = !range ? '' : en
      ? (inRange ? ' within range ' + range : ' (range ' + range + ')')
      : (inRange ? ' im Bereich ' + range : ' (Bereich ' + range + ')');
    return en
      ? name + 'Last time ' + reps + ' reps' + rangeTxt +
        ' — rule: recovery comes before progression, weight stays at ' + to + ', step ' + step + ' follows after that.'
      : name + 'Zuletzt ' + reps + ' Wiederholungen' + rangeTxt +
        ' — Regel: Erholung geht vor Steigerung, Gewicht bleibt bei ' + to + ', Schrittweite ' + step + ' folgt danach.';
  }

  function resolveIntent(text, snap) {
    var q = norm(text);
    if (!q) return null;
    var s = snap || {};

    // GLOBALES GESUNDHEITS-GATE -- steht vor ALLEM, auch vor den beiden
    // Vorab-Ausnahmen, die an BLOCK vorbeilaufen duerfen. Ausfuehrliche
    // Begruendung im Kopf der Datei (umgekehrte Entscheidung): jede Frage mit
    // Krankheits-, Beschwerde-, Schwangerschafts-, Medikamenten- oder
    // Behandlungssignal geht ans Modell, ohne dass irgendein Intent sie noch
    // sieht. Diese eine Zeile ersetzt den Versuch, dieselbe Fehlerklasse in
    // jedem Intent einzeln abzufangen -- ein Intent, der es nicht tut, reicht
    // sonst, und genau das ist fuenf Runden lang passiert.
    if (medical(q)) return null;

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
    if (WARMUP_ONLY.test(warmupCore(q, s)) && !medical(q) && !BLOCK_MINUS_SOLL.test(q) && s.warmupText) {
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
      // Das Leerzeichen ist PFLICHT, nicht optional: norm() ersetzt Komma UND
      // Punkt durch ein Leerzeichen, "62,5" und "62.5" werden also immer zu
      // "62 5". Mit optionalem Leerzeichen matchte auch "warum 625" und lieferte
      // die Begruendung fuer 62,5 kg. Vorne zusaetzlich eine Wortgrenze, damit
      // die Zahl nicht in einer groesseren steckt ("mein 1rm 160"). Hinten
      // braucht es keine: die Form ist verankert, hinter der Zahl darf nur noch
      // die Einheit oder ein aufgezaehltes Fuellwort stehen.
      var numSig  = '\\b' + (toParts.length === 2 ? toParts[0] + ' ' + toParts[1]
                                                  : String(Math.round(Number(wr.toKg))));
      // Fuellwoerter sind NAMENTLICH aufgezaehlt und stehen zwischen Warum-Wort
      // und Gewichts-Signal. Alles, was nicht in dieser Liste steht, bricht die
      // Form -- das ist der ganze Mechanismus. Die Liste darf ruhig lang sein,
      // solange sie ausschliesslich inhaltsleere Woerter enthaelt: Beschwerde
      // und Wertung brauchen ein Verb, ein Adjektiv oder ein Substantiv, und
      // jedes davon bricht die Form weiterhin. Die erste Fassung war zu kurz --
      // ein einziges "gerade"/"nur"/"wieder"/"so viel" kostete den Treffer.
      // "mein|meine|meinen|my" standen hier und haben die Koerpergewichts-
      // Lesart wieder hereingelassen, gegen die BODYWEIGHT ausdruecklich
      // gebaut ist: zusammen mit "hoch|high" im tail passte "warum ist mein
      // gewicht so hoch?" / "why is my weight so high?" in die Ganzform und
      // bekam die Hantel-Progression als Antwort. Der Coach begruendet
      // ausschliesslich SEINEN Vorschlag -- der heisst "das|dieses gewicht",
      // nie "mein gewicht". Keine der 40 natuerlichen Formulierungen braucht
      // den Possessivbegleiter, das Verengen kostet also nichts.
      var fill = '(?:(?:ist|sind|war|waren|es|das|dieses|dieser|diese|dies|den|dem|der|denn|' +
                 'eigentlich|genau|gerade|ausgerechnet|nur|wieder|schon|noch|so|viel|' +
                 'gleiche|gleichen|selbe|selben|steht|da|hier|' +
                 'heute|jetzt|nun|' +
                 'is|are|it|the|this|that|these|those|now|today|again|just|only|much) )*';
      // Gewichts-Signal: das Wort selbst -- inklusive "kilo"/"kg", die als
      // eigenstaendiges Signal ersatzlos entfallen waren und "warum diese
      // kilos?" toetlich getroffen haben --, oder die vorgeschlagene Zahl mit
      // optionaler Einheit. Koerpergewichts-Lesarten faengt BODYWEIGHT davor ab.
      var wSig = '(?:gewicht|gewichte|weight|kilos?|kgs?|' + numSig +
                 '(?: ?(?:kg|kilo|lbs|pfund))?)';
      // Hinter dem Gewichts-Signal darf nur noch Inhaltsleeres stehen ("warum
      // das gewicht heute?"), eine reine Mengen-Beurteilung ("so hoch") oder
      // die zweite Haelfte eines trennbaren Verbs ("warum schlaegst du das
      // gewicht vor?"). Wertendes und Medizinisches faellt weiter an '$':
      // "so ungesund", "gut fuer meinen ruecken", "bei meiner arthrose ok".
      var tail = '(?: (?:heute|jetzt|nun|noch|denn|eigentlich|hier|so|today|now))*' +
                 '(?: (?:hoch|niedrig|schwer|leicht|high|low|heavy|light))?(?: vor)?';
      // Frage-Einleitung. Die mehrwortigen Formen stehen vorn, damit sie vor
      // dem blossen "warum" greifen.
      var why  = '(?:wie kommst du (?:auf|darauf)|how come|how did you (?:get|pick|choose)|' +
                 'why (?:do|did) you (?:suggest|pick|choose|recommend)|' +
                 '(?:warum|wieso|weshalb) (?:schlaegst|empfiehlst|nimmst|waehlst|rechnest) du|' +
                 'warum|wieso|weshalb|why)';
      var whyRe = new RegExp('^' + LEAD + why + ' ' + fill + wSig + tail + '$');
      if (whyRe.test(q)) {
        return { intent: 'weightWhy', answer: weightWhyAnswer(wr, s) };
      }
    }

    if (BLOCK.test(q)) return null;

    // 1) Naechstes Gewicht -- "gewicht"/"weight" allein ist z.B. auch eine
    // Frage zum Koerpergewicht/Abnehmen. Gate: braucht zusaetzlich einen
    // "naechster Satz"-Bezug, sonst kein Treffer.
    if (two(q, /gewicht|weight/, /naechste[nsr]? satz|next set/)) {
      if (s.active && s.active.nextW != null) {
        return { intent: 'nextWeight', answer: (langOf(s) === 'en' ? 'Next set: ' : 'Nächster Satz: ') +
          fmtW(s.active.nextW, s) + '.' };
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
               answer: langOf(s) === 'en'
                 ? ex.name + ': ' + fmtW(b.w, s) + ' for ' + b.r + ' reps, on ' + datum(b.date) + '.'
                 : ex.name + ': ' + fmtW(b.w, s) + ' mal ' + b.r + ' Wiederholungen, am ' + datum(b.date) + '.' };
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
               answer: langOf(s) === 'en'
                 ? (left === 1 ? '1 set left.' : left + ' sets left.')
                 : (left === 1 ? 'Noch 1 Satz.' : 'Noch ' + left + ' Sätze.') };
    }

    // 4) Restpause -- "rest" allein ist ein normales englisches Wort
    // (Ruhetag "rest day", Pronomen "der Rest von meinen Freunden"). Gate:
    // "my rest" (Besitzbezug auf die eigene Pause) oder "rest ... left"
    // (Restdauer-Frage) sind eindeutig; "pause" (Deutsch) und "rest timer"
    // sind als feste Fachbegriffe ohne Alltagsbedeutung weiter bare genug.
    if (/pause|rest timer|my rest|rest[\s\S]*left/.test(q)) {
      if (!s.restLeftSec) return null;
      return { intent: 'rest', answer: langOf(s) === 'en'
        ? s.restLeftSec + ' seconds of rest left.'
        : 'Noch ' + s.restLeftSec + ' Sekunden Pause.' };
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
      return { intent: 'recovery', answer: langOf(s) === 'en'
        ? mg + ' is ' + rec[mg] + '% recovered.'
        : mg + ' ist zu ' + rec[mg] + ' Prozent erholt.' };
    }

    // 5b) Letzter PR -- MUSS vor Intent 6 stehen: "wann hatte ich zuletzt einen
    // pr?" trifft dort auf "wann hatte ich"/"zuletzt", findet keinen
    // Uebungsnamen und wuerde die Frage mit null verschlucken. "pr" nur mit
    // Wortgrenzen (nicht in "prima", "pro"); "rekord" bleibt bewusst draussen,
    // das gehoert Intent 2 (Rekord EINER Uebung).
    if (/\bprs?\b|last pr|latest pr/.test(q)) {
      if (s.lastPrExName == null || s.lastPrKg == null || s.lastPrDaysAgo == null) return null;
      var isEn = langOf(s) === 'en';
      var pd = isEn
        ? (s.lastPrDaysAgo === 0 ? 'today' : s.lastPrDaysAgo === 1 ? 'yesterday' : s.lastPrDaysAgo + ' days ago')
        : (s.lastPrDaysAgo === 0 ? 'heute' : s.lastPrDaysAgo === 1 ? 'gestern' : 'vor ' + s.lastPrDaysAgo + ' Tagen');
      return { intent: 'lastPr',
               answer: isEn
                 ? 'Latest PR: ' + s.lastPrExName + ' at ' + fmtW(s.lastPrKg, s) + ', ' + pd + '.'
                 : 'Letzter Rekord: ' + s.lastPrExName + ' mit ' + fmtW(s.lastPrKg, s) + ', ' + pd + '.' };
    }

    // 6) Letzte Ausfuehrung
    if (/zuletzt|letztes mal|last time|wann hatte ich/.test(q)) {
      var ex2 = findExercise(q, s.exercises);
      if (!ex2) return null;
      var d = (s.lastDone || {})[ex2.id];
      if (!d) return null;
      return { intent: 'lastDone', answer: langOf(s) === 'en'
        ? ex2.name + ' last done on ' + datum(d) + '.'
        : ex2.name + ' zuletzt am ' + datum(d) + '.' };
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
      var mkLbl = mk.charAt(0).toUpperCase() + mk.slice(1);
      return { intent: 'muscleVolume',
               answer: langOf(s) === 'en'
                 ? mkLbl + ' this week ' + fmtW(mv[mk], s) + ' of volume.'
                 : mkLbl + ' diese Woche ' + fmtW(mv[mk], s) + ' Volumen.' };
    }

    // 7) Wochenvolumen -- "volume" ist im Englischen zuerst Lautstaerke.
    // Gate: braucht zusaetzlich einen Zeit-/Trainingsbezug. Der Aufrufer
    // befuellt weekVolumeKg aus _weekStats().vol; fehlt das Feld (alter
    // Schnappschuss oder Fehler beim Bauen), geht die Frage ans Modell.
    if (two(q, /volumen|volume|tonnage/, /woche|week|training|gesamt/)) {
      if (s.weekVolumeKg == null) return null;
      return { intent: 'volume', answer: langOf(s) === 'en'
        ? 'This week ' + fmtW(s.weekVolumeKg, s) + ' total volume.'
        : 'Diese Woche ' + fmtW(s.weekVolumeKg, s) + ' Gesamtvolumen.' };
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
    // "hab(e)? ich" stand hier als zweites Signal und hat die Fehlerklasse
    // wieder geoeffnet, fuer die das Gate gebaut wurde: "welche nachteile habe
    // ich bei supersaetzen?" bekam den Partner der laufenden Uebung genannt.
    // "habe ich" ist kein Besitzbezug auf den laufenden Satz, sondern ein
    // Allerweltshilfsverb. Zurueckgenommen -- die eine gemeldete Frage kommt
    // als verankerte Ganzform durch (SUPERSET_MINE, siehe oben).
    if (two(q, /supersatz|supersaetze|superset/,
              /\bdazu\b|partner|\bmein|aktuell|gerade|jetzt|\bhier\b|\bmy\b|current/) ||
        SUPERSET_MINE.test(q)) {
      if (!s.supersetText) return null;
      return { intent: 'superset', answer: s.supersetText };
    }

    // 10) Wochenfortschritt -- "woche"/"week" allein ist ein Alltagswort
    // ("diese Woche war anstrengend"). Gate: zweites TRAININGS-Signal noetig.
    // "wie viele"/"how many" taugt dafuer nicht: das ist ein reiner
    // Mengenfrage-Marker ohne Trainingsbezug und hat "wie viele tage hat diese
    // woche?" mit "Diese Woche 3 von 4 Einheiten." beantwortet.
    // "trainier" stand hier als zweites Signal, damit "wie viele male habe ich
    // diese woche trainiert?" nicht unnoetig ans Modell geht ("trainiert"
    // enthaelt "training" nicht als Teilstring). Der Preis war zu hoch: der
    // Wortstamm holt JEDE Erlaubnis- und Krankheitsfrage herein ("darf ich
    // diese woche trainieren obwohl ich krank bin?" -> "Diese Woche 3 von 4
    // Einheiten."). krank/fieber/schwanger stehen bewusst nicht in BLOCK, und
    // medical() gilt nur fuer die zwei Vorab-Ausnahmen -- hier greift also gar
    // kein Schutz ausser diesem Gate. Zurueckgenommen; die Mengenfrage kommt
    // als verankerte Ganzform durch (WEEK_TRAINED, siehe oben).
    //
    // Leck 4 (Fund bei Pruefung des letzten Commits): "training" stand HIER
    // ebenfalls bare im Zweitsignal, exakt dieselbe Schadensform wie bei
    // "trainier" oben -- nur als Substantiv statt Verbstamm, deshalb kein
    // Teilstring von "trainiert"/"trainieren" und von den bisherigen Tests
    // nicht erfasst. "ins training"/"im training" treffen "training" trivial
    // und liessen dieselben Krankheits-/Erlaubnisfragen wieder durch ("darf
    // ich mit fieber ins training?" -> "Diese Woche 3 von 4 Einheiten.").
    // Ebenso zurueckgenommen; die eine bekannte legitime Formulierung ("wie
    // viele trainings diese woche?") kommt als verankerte Ganzform durch
    // (WEEK_COUNT, siehe oben).
    if (two(q, /woche|week/, /einheit|workout|session|geschafft/) ||
        WEEK_TRAINED.test(q) || WEEK_COUNT.test(q)) {
      if (s.weekWorkouts == null || s.weekGoal == null) return null;
      return { intent: 'weekProgress',
               answer: langOf(s) === 'en'
                 ? 'This week ' + s.weekWorkouts + ' of ' + s.weekGoal + ' sessions.'
                 : 'Diese Woche ' + s.weekWorkouts + ' von ' + s.weekGoal + ' Einheiten.' };
    }

    // 11) Streak. Die App zaehlt sie in WOCHEN am Stueck (calcStreak().weeks),
    // nicht in Tagen -- Feldname und Text folgen der Anzeige im Heute-Tab.
    if (/streak|trainingsserie|serie in folge/.test(q)) {
      if (s.streakWeeks == null) return null;
      return { intent: 'streak',
               answer: langOf(s) === 'en'
                 ? (s.streakWeeks === 1 ? 'Trained 1 week in a row.' : 'Trained ' + s.streakWeeks + ' weeks in a row.')
                 : (s.streakWeeks === 1 ? 'Eine Woche in Folge trainiert.' : s.streakWeeks + ' Wochen in Folge trainiert.') };
    }

    // 12) Durchschnittliche Trainingsdauer -- "schnitt" allein ist mehrdeutig
    // (Schnitt/schneiden), deshalb zusaetzlich ein Trainings-Wort. Dauer-Woerter
    // taugen als zweites Signal NICHT: "lang" matchte als Teilstring in
    // "langhantel"/"langsam", und "dauer" liess die Frage nach der SATZdauer
    // ("wie lange sollte ein durchschnittlicher satz dauern?") mit der
    // Trainingsdauer beantworten. Beide Fragen gehen jetzt ans Modell.
    // "\bgym\b" stand hier als zweites Signal, mit der Begruendung, das Gym sei
    // eindeutig der Ort des Trainings. Das haelt nicht: das Gym ist als ORT
    // Gegenstand vieler Fragen, die mit der eigenen Trainingsdauer nichts zu
    // tun haben ("wie lange ist das gym im schnitt geoeffnet?", "wie voll ist
    // das gym im durchschnitt?") -- exakt die W4-Fehlerklasse, die dieser
    // Kommentarblock direkt darueber fuer geschlossen erklaert. Zurueckgenommen;
    // die eigene Verweildauer kommt als verankerte Ganzform durch (AVG_GYM).
    // "dauer" bleibt bewusst DRAUSSEN: es wuerde die Frage nach der SATZdauer
    // ("was ist die durchschnittliche dauer eines satzes?") mit der
    // Trainingsdauer beantworten -- genau der Fehler, den W4 geschlossen hat.
    if (two(q, /schnitt|durchschnitt|average/, /trainier|training|workout|einheit|session/) ||
        AVG_GYM.test(q)) {
      if (s.avgDurationMin == null) return null;
      return { intent: 'avgDuration',
               answer: langOf(s) === 'en'
                 ? 'On average you train ' + s.avgDurationMin + ' minutes.'
                 : 'Im Schnitt trainierst du ' + s.avgDurationMin + ' Minuten.' };
    }

    // 13) Gestrige Einheit -- "gestern" ist ein blankes Alltagswort und hat
    // "was war gestern im fernsehen?" mit der gestrigen Einheit beantwortet.
    // Gate: zweites Trainings-Signal noetig.
    // Zweiter Weg statt breiterem Signal: die bare Frage "was war gestern?"
    // hat kein zweites Wort, das man ergaenzen koennte, ohne "was war gestern
    // im fernsehen?" mitzunehmen. Also dieselbe Loesung wie bei den beiden
    // Vorab-Ausnahmen -- eine auf die ganze Frage verankerte Ganzform.
    // "training" und "\bgym\b" sind hier zusaetzlich rausgeflogen: beide
    // standen bare im Zweitsignal und trugen dieselbe Last wie an den
    // Stellen, an denen sie schon zurueckgenommen wurden ("training" in
    // Intent 10, "\bgym\b" in Intent 12). Die eigene gestrige Einheit kommt
    // als verankerte Ganzform durch (YEST_MINE, siehe oben); "trainiert"
    // bleibt, weil es kein Ortswort ist.
    if (two(q, /gestern|yesterday/, /trainiert|workout|einheit|session|gemacht|volumen|uebung|satz|saetze/) ||
        /^(?:was|wie) war(?:s)? (?:es )?gestern$|^gestern$|^(?:what|how) was yesterday$/.test(q) ||
        YEST_MINE.test(q)) {
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
      return { intent: 'planList', answer: (langOf(s) === 'en' ? 'Your plans: ' : 'Deine Pläne: ') + pn.join(', ') + '.' };
    }

    return null;
  }

  var API = { resolveIntent: resolveIntent };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachIntent = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
