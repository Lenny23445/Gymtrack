/* GymTrack — Technik-Hinweise je Uebung (Baustein 14, Block 3)

   Statische Tabelle, kein Modell und kein Netz. Die Hinweise sind Sachtexte,
   keine Tonfrage — sie laufen deshalb bewusst NICHT ueber
   CoachPersona.say(); der Ton entscheidet, WIE der Coach den Punkt einleitet,
   nicht welcher Punkt richtig ist.

   Reine Logik: kein DOM, keine App-Globals, die Sprache kommt als Argument
   herein (das Modul liest nie selbst localStorage).

   Ein Hinweis je Uebung, nicht eine Liste: ein Trainer sagt vor dem schweren
   Satz genau einen Punkt an. Drei Punkte hintereinander merkt sich niemand. */
(function (root) {
  'use strict';

  // Normalisierung: klein, Umlaute aufgeloest, alles ausser a-z0-9 entfernt.
  // Damit trifft 'Bankdrücken Kurzhantel' denselben Eintrag wie 'Bankdrücken'.
  //
  // Die Reihenfolge ist der ganze Punkt. Ein 'ü' gibt es als EIN Zeichen
  // (U+00FC) und als u + Trema (U+0075 U+0308); beides kommt aus echten
  // Eingaben und aus Importen. Wer die Umlaute VOR der Normalform aufloest,
  // trifft die zerlegte Schreibweise nicht und wirft das Trema danach weg —
  // aus 'Bankdrücken' wurde dann 'bankdrucken' und damit ein anderer
  // Schluessel als aus 'Bankdrücken'. Deshalb: erst NFC (zusammenziehen), dann
  // Umlaute, dann NFD ohne kombinierende Zeichen (fuer é, ñ und Verwandte).
  function fold(v, plain) {
    if (typeof v !== 'string') return '';
    var s = v.toLowerCase().normalize('NFC');
    s = plain
      ? s.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
      : s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
    return s.normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '');
  }

  function normalize(v) { return fold(v, false); }

  // Zweite Lesart derselben Eingabe: Umlaut auf den blanken Vokal. Auf einer
  // Tastatur ohne Umlaute und in vielen Importen steht 'Bankdrucken' oder
  // 'Klimmzuge'. Beide Lesarten werden gegen die entsprechend gefalteten
  // Schluessel geprueft, statt fuer jede Schreibweise einen Alias zu pflegen.
  function plainFold(v) { return fold(v, true); }

  // Ein Hinweis, mehrere Schluessel: derselbe Punkt gilt fuer den deutschen
  // und den englischen Uebungsnamen und fuer die Varianten. Deshalb liegen die
  // Texte in Variablen und die Tabelle verweist mehrfach darauf — eine Kopie
  // je Namensvariante liefe beim ersten Textfix auseinander.
  var BENCH = {
    de: 'Schulterblätter zusammenziehen und unten halten, dann die Stange zur Brustmitte führen.',
    en: 'Pull the shoulder blades together and down, then bring the bar to mid chest.'
  };
  var SQUAT = {
    de: 'Die Knie folgen den Zehen nach außen, die Brust bleibt bis in die Tiefe aufrecht.',
    en: 'Let the knees track out over the toes and keep the chest up all the way down.'
  };
  var SPLIT = {
    de: 'Das vordere Knie bleibt über dem Mittelfuß, der Rumpf senkrecht, das hintere Bein hält nur die Balance.',
    en: 'Keep the front knee over the mid foot and the torso upright, the rear leg only holds balance.'
  };
  var DEADLIFT = {
    de: 'Die Stange bleibt am Schienbein und der Rücken kommt vor dem Anheben unter Spannung.',
    en: 'Keep the bar against the shins and set the back tight before the weight leaves the floor.'
  };
  var RDL = {
    de: 'Die Hüfte nach hinten schieben, die Stange am Bein führen, die Knie bleiben nur leicht gebeugt.',
    en: 'Push the hips back and keep the bar on the legs, the knees stay only slightly bent.'
  };
  var OHP = {
    de: 'Den Rumpf fest machen und die Rippen unten halten, statt ins Hohlkreuz auszuweichen.',
    en: 'Brace the core and keep the ribs down instead of leaning back into the lower spine.'
  };
  var PULLUP = {
    de: 'Aus dem Schulterblatt starten und die Brust zur Stange ziehen, ohne zu schwingen.',
    en: 'Start from the shoulder blades and pull the chest toward the bar without swinging.'
  };
  var LATPULL = {
    de: 'Die Ellenbogen nach unten denken statt mit den Händen zu ziehen, der Oberkörper bleibt fast senkrecht.',
    en: 'Drive the elbows down instead of pulling with the hands, the torso stays almost upright.'
  };
  var ROW = {
    de: 'Den Rumpf ruhig halten und die Ellenbogen am Körper vorbei zur Hüfte ziehen.',
    en: 'Keep the torso still and pull the elbows past the body toward the hip.'
  };
  var UPRIGHT = {
    de: 'Die Ellenbogen führen die Bewegung und gehen nicht über Schulterhöhe hinaus.',
    en: 'The elbows lead the movement and never travel above shoulder height.'
  };
  var LEGPRESS = {
    de: 'Die Fersen bleiben flach auf der Platte und die Knie werden oben nicht durchgedrückt.',
    en: 'Heels stay flat on the platform and the knees never lock out at the top.'
  };
  var LEGCURL = {
    de: 'Die Hüfte bleibt auf der Auflage, die Bewegung passiert nur im Kniegelenk.',
    en: 'The hips stay down on the pad and the movement happens at the knee only.'
  };
  var LEGEXT = {
    de: 'Oben eine Sekunde halten und langsam ablassen, statt Schwung zu holen.',
    en: 'Hold for a second at the top and lower slowly instead of using momentum.'
  };
  var CALF = {
    de: 'Oben voll durchstrecken und die Ferse unten kontrolliert tief absenken.',
    en: 'Extend fully at the top and lower the heel deep under control.'
  };
  var HIPTHRUST = {
    de: 'Die Rippen unten halten und oben nur bis zur geraden Linie strecken.',
    en: 'Keep the ribs down and extend only to a straight line at the top.'
  };
  var BICEPS = {
    de: 'Die Ellenbogen bleiben am Rumpf, kein Schwung aus der Hüfte.',
    en: 'The elbows stay at the ribs and there is no swing from the hips.'
  };
  var HAMMER = {
    de: 'Das Handgelenk bleibt gerade und der Griff über die ganze Bewegung neutral.',
    en: 'Keep the wrist straight and the grip neutral through the whole movement.'
  };
  var TRICEPS = {
    de: 'Die Oberarme bleiben fixiert, nur der Unterarm bewegt sich.',
    en: 'The upper arms stay locked in place and only the forearms move.'
  };
  var DIPS = {
    de: 'Den Oberkörper leicht vorlehnen und die Schultern nicht unter die Ellenbogen sinken lassen.',
    en: 'Lean the torso slightly forward and do not let the shoulders drop below the elbows.'
  };
  var LATRAISE = {
    de: 'Nur bis Schulterhöhe heben und die Ellenbogen dabei leicht gebeugt lassen.',
    en: 'Raise only to shoulder height and keep a slight bend in the elbows.'
  };
  var FACEPULL = {
    de: 'Die Ellenbogen hoch und außen führen und am Ende die Schulterblätter zusammenziehen.',
    en: 'Lead with high wide elbows and squeeze the shoulder blades at the end.'
  };
  var FLY = {
    de: 'Eine leichte Beugung im Ellenbogen halten und die Brust vorne kurz zusammendrücken.',
    en: 'Keep a slight bend in the elbows and squeeze the chest at the front.'
  };
  var REVFLY = {
    de: 'Die Arme nur bis auf Schulterhöhe öffnen und die Schulterblätter zusammenführen.',
    en: 'Open the arms to shoulder height only and bring the shoulder blades together.'
  };
  var PLANK = {
    de: 'Das Gesäß leicht anspannen, die Hüfte nicht durchhängen lassen, ruhig weiteratmen.',
    en: 'Squeeze the glutes, do not let the hips sag, and keep breathing calmly.'
  };
  var PUSHUP = {
    de: 'Den Körper als eine Linie halten und die Ellenbogen nicht ganz nach außen kippen.',
    en: 'Hold the body in one straight line and do not flare the elbows fully out.'
  };
  var SHRUG = {
    de: 'Nur die Schultern heben, die Arme bleiben lang und der Kopf bleibt ruhig.',
    en: 'Lift with the shoulders only, the arms stay long and the head stays still.'
  };
  var CRUNCH = {
    de: 'Den Bauch einrollen statt am Hals zu ziehen und unten nicht komplett ablegen.',
    en: 'Curl the trunk instead of pulling on the neck and do not fully rest at the bottom.'
  };
  var LEGRAISE = {
    de: 'Den unteren Rücken flach auf der Auflage halten und die Beine langsam senken.',
    en: 'Keep the lower back flat on the pad and lower the legs slowly.'
  };

  // Schluessel sind normalisierte NAMENSBESTANDTEILE, keine ganzen Namen: die
  // Zuordnung laeuft ueber indexOf. Reihenfolge ist bewusst NICHT bedeutend —
  // der laengste Treffer gewinnt (siehe cueFor). Die allgemeinen Schluessel
  // stehen hier absichtlich VOR den spezielleren ('kreuzheben' vor
  // 'rumaenischeskreuzheben', 'squat' vor 'splitsquat'): waehlte cueFor den
  // ersten statt den laengsten Treffer, fiele das sofort auf.
  var CUES = {
    bankdruecken:           BENCH,
    benchpress:             BENCH,
    kniebeuge:              SQUAT,
    squat:                  SQUAT,
    splitsquat:             SPLIT,
    ausfallschritt:         SPLIT,
    lunge:                  SPLIT,
    kreuzheben:             DEADLIFT,
    deadlift:               DEADLIFT,
    rumaenischeskreuzheben: RDL,
    romaniandeadlift:       RDL,
    rdl:                    RDL,
    schulterdruecken:       OHP,
    nackendruecken:         OHP,
    overheadpress:          OHP,
    arnoldpress:            OHP,
    klimmzug:               PULLUP,
    pullup:                 PULLUP,
    chinup:                 PULLUP,
    latzug:                 LATPULL,
    latpulldown:            LATPULL,
    rudern:                 ROW,
    row:                    ROW,
    aufrechtesrudern:       UPRIGHT,
    uprightrow:             UPRIGHT,
    beinpresse:             LEGPRESS,
    legpress:               LEGPRESS,
    beinbeuger:             LEGCURL,
    beincurl:               LEGCURL,
    legcurl:                LEGCURL,
    beinstrecker:           LEGEXT,
    legextension:           LEGEXT,
    wadenheben:             CALF,
    calfraise:              CALF,
    hipthrust:              HIPTHRUST,
    bizeps:                 BICEPS,
    bicepscurl:             BICEPS,
    hammercurl:             HAMMER,
    trizepsdruecken:        TRICEPS,
    tricepspushdown:        TRICEPS,
    frenchpress:            TRICEPS,
    dips:                   DIPS,
    seitheben:              LATRAISE,
    lateralraise:           LATRAISE,
    facepull:               FACEPULL,
    fliegende:              FLY,
    butterfly:              FLY,
    chestfly:               FLY,
    reversefly:             REVFLY,
    plank:                  PLANK,
    liegestuetz:            PUSHUP,
    pushup:                 PUSHUP,
    shrug:                  SHRUG,
    crunch:                 CRUNCH,
    situp:                  CRUNCH,
    beinheben:              LEGRAISE,
    legraise:               LEGRAISE
  };

  // Ab dieser Laenge darf ein Schluessel MITTEN im Namen treffen. Darunter
  // waere der Treffer Zufall: 'row' steckt in 'narrowgrip', und cueFor('Narrow
  // Grip') sagte dann den Ruder-Hinweis an. Kurze Schluessel muessen deshalb
  // ein eigenes Wort sein — am Anfang, am Ende oder als ganzer Name.
  var MIN_SUB_LEN = 4;

  function hit(q, k) {
    if (!q || !k || q.length < k.length) return false;
    if (k.length >= MIN_SUB_LEN) return q.indexOf(k) >= 0;
    return q.indexOf(k) === 0 || q.lastIndexOf(k) === q.length - k.length;
  }

  // Die Schluessel stehen in der 'ue'-Schreibweise. Fuer die zweite Lesart der
  // Eingabe (Tastatur ohne Umlaute) wird derselbe Schluessel auf den blanken
  // Vokal gezogen: 'bankdruecken' -> 'bankdrucken'.
  function plainKey(k) {
    return k.replace(/ue/g, 'u').replace(/oe/g, 'o').replace(/ae/g, 'a');
  }

  // Der laengste passende Schluessel gewinnt: 'rumaenischeskreuzheben' enthaelt
  // 'kreuzheben', 'bulgariansplitsquats' enthaelt 'squat'. Der spezifische
  // Hinweis ist immer der richtige.
  // Kein Treffer heisst null, nicht Allgemeinplatz: 'Rumpf spannen und
  // kontrolliert bewegen' passt auf alles und hilft bei nichts.
  function cueFor(exerciseName, lang) {
    var q = normalize(exerciseName);
    if (!q) return null;
    var qp = plainFold(exerciseName);
    var best = null;
    Object.keys(CUES).forEach(function (k) {
      if (!hit(q, k) && !hit(qp, plainKey(k))) return;
      if (best === null || k.length > best.length) best = k;
    });
    if (best === null) return null;
    var row = CUES[best];
    return (lang === 'en' ? row.en : row.de) || null;
  }

  /* ── Geraet aus dem Uebungsnamen (Blockabschluss-Review C1) ──────────────
     Warum hier und nicht in coach-warmup.js: 'step' und 'barKg' sind Zahlen,
     aber die Frage "hat diese Uebung eine Stange?" ist eine NAMENSFRAGE, und
     die einzige Namensnormalisierung des Coach steht in dieser Datei
     (fold/plainFold/hit, beide Umlaut-Schreibweisen, kurze Schluessel nur als
     eigenes Wort). Ein zweiter Normalisierer waere bei der naechsten
     Umlaut-Frage auseinandergelaufen — dieselbe Begruendung, mit der die
     Zahlmodule ihr Format teilen.

     Warum ueberhaupt der Name: die App kennt keinen Geraetetyp. ex.showPlateCalc
     ist der einzige explizite Schalter, aber KEIN Import setzt ihn — weder
     pickExFromLibrary() noch die Plan-Vorlagen noch _planImportEx(); im
     Uebungsformular ist er auf false vorbelegt. Deshalb ist nur sein TRUE eine
     Aussage; sein false ist der Vorgabewert und wird hier nicht gelesen.

     ZWEI Tabellen und nicht eine mit Laengenregel: bei cueFor gewinnt der
     laengste Treffer, weil der spezifischere Bewegungsname den besseren
     Hinweis traegt. Beim Geraet ist es umgekehrt — 'kurzhantelbankdruecken'
     enthaelt 'bankdruecken' (12 Zeichen) und 'kurzhantel' (10), und die
     Geraeteangabe ist die Aussage, der Bewegungsname nur die uebliche
     Ausfuehrung. Also erst die Marker, dann die Bewegung. */

  var MARK = {
    langhantel: 'barbell', barbell: 'barbell', lh: 'barbell', szstange: 'barbell',
    kurzhantel: 'dumbbell', dumbbell: 'dumbbell', kh: 'dumbbell', kettlebell: 'dumbbell',
    maschine: 'machine', machine: 'machine', kabel: 'machine', cable: 'machine',
    seilzug: 'machine', geraet: 'machine'
  };

  // Nur Langhantel und Kurzhantel muessen hier stehen. Was uebrig bleibt, ist
  // 'keine Aussage' — und die Verdrahtung nimmt dann KEINE Stange an. Eine
  // erfundene Stange rundet auf Scheibenpaare, die es an einer Maschine nicht
  // gibt; das ist der teurere Fehler.
  var MOVE = {
    bankdruecken: 'barbell', benchpress: 'barbell',
    kniebeuge: 'barbell', squat: 'barbell', frontsquat: 'barbell',
    kreuzheben: 'barbell', deadlift: 'barbell',
    schulterdruecken: 'barbell', nackendruecken: 'barbell', overheadpress: 'barbell',
    rudern: 'barbell', row: 'barbell',
    hipthrust: 'barbell', shrug: 'barbell', frenchpress: 'barbell',
    preachercurl: 'barbell', pullover: 'barbell',

    splitsquat: 'dumbbell', gobletsquat: 'dumbbell',
    ausfallschritt: 'dumbbell', lunge: 'dumbbell',
    seitheben: 'dumbbell', lateralraise: 'dumbbell',
    frontheben: 'dumbbell', frontraise: 'dumbbell',
    reversefly: 'dumbbell', fliegende: 'dumbbell', chestfly: 'dumbbell',
    hammercurl: 'dumbbell', konzentrationscurl: 'dumbbell', concentrationcurl: 'dumbbell',
    bizepscurl: 'dumbbell', bicepscurl: 'dumbbell', arnoldpress: 'dumbbell',

    latzug: 'machine', latpulldown: 'machine',
    beinpresse: 'machine', legpress: 'machine',
    beinstrecker: 'machine', legextension: 'machine',
    beinbeuger: 'machine', beincurl: 'machine', legcurl: 'machine',
    butterfly: 'machine', facepull: 'machine', trizepsdruecken: 'machine',
    tricepspushdown: 'machine', hyperextension: 'machine'
  };

  function lookup(table, q, qp) {
    var best = null;
    Object.keys(table).forEach(function (k) {
      if (!hit(q, k) && !hit(qp, plainKey(k))) return;
      if (best === null || k.length > best.length) best = k;
    });
    return best === null ? null : table[best];
  }

  // 'barbell' | 'dumbbell' | 'machine' | null. null heisst ausdruecklich
  // 'keine Aussage' und nicht 'Maschine' — die Entscheidung, was daraus folgt,
  // gehoert an die Verdrahtungsstelle, die auch ex.showPlateCalc kennt.
  function equipFor(exerciseName) {
    var q = normalize(exerciseName);
    if (!q) return null;
    var qp = plainFold(exerciseName);
    return lookup(MARK, q, qp) || lookup(MOVE, q, qp) || null;
  }

  var API = { cueFor: cueFor, equipFor: equipFor, normalize: normalize, CUES: CUES,
              EQUIP_MARK: MARK, EQUIP_MOVE: MOVE, MIN_SUB_LEN: MIN_SUB_LEN };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachCues = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
