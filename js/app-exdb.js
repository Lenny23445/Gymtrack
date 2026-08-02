/* GymTrack — ÜBUNGS-DATENBANK
 *
 * Reines Datenmodul, keine Logik ausser der i18n-Registrierung ganz unten.
 * Laedt VOR app-streak.js (dort liegt die Bibliotheks-UI: openExLibrary/renderExLibrary).
 *
 * Schema pro Eintrag:
 *   n  Name (deutsch) — zugleich De-facto-ID: PLAN_TEMPLATES.libNames, Plan-Import und
 *      die "vorhanden"-Pruefung matchen ueber diesen String. NIE bestehende Namen aendern.
 *   e  Emoji
 *   mg Muskelgruppen-ID aus MUSCLE_GROUPS ('brust'|'ruecken'|'beine'|'arme'|'schultern'|'core')
 *      oder '' = ohne Muskelgruppe (Cardio/Kondition, eigener Bibliotheks-Filter "Cardio")
 *   s  Ziel-Saetze
 *   r  Ziel-Wiederholungen — bei t:'time' stattdessen Sekunden
 *   t  optional 'time' = Zeit-Uebung
 *   en optional englischer Name; wird unten in I18N_EN eingetragen (Display-Layer).
 *      Fehlt en, ist der Name bereits englisch/international.
 */
const EX_LIBRARY = [
  // ══ BRUST ══════════════════════════════════════════════
  {n:'Bankdrücken',            e:'🏋️', mg:'brust', s:3, r:8 },
  {n:'Schrägbankdrücken',      e:'📈', mg:'brust', s:3, r:10},
  {n:'Kurzhantel-Bankdrücken', e:'💪', mg:'brust', s:3, r:10},
  {n:'Fliegende',              e:'🦋', mg:'brust', s:3, r:12},
  {n:'Liegestütze',            e:'🤸', mg:'brust', s:3, r:15},
  {n:'Dips',                   e:'⬇️', mg:'brust', s:3, r:8 },
  {n:'Butterfly (Maschine)',   e:'🦋', mg:'brust', s:3, r:12},
  {n:'Kabelzug Brust',         e:'🪢', mg:'brust', s:3, r:12},
  {n:'Negativbankdrücken',        e:'📉', mg:'brust', s:3, r:10, en:'Decline Bench Press'},
  {n:'Bankdrücken (Multipresse)', e:'🏗️', mg:'brust', s:3, r:10, en:'Smith Machine Bench Press'},
  {n:'Schrägbankdrücken (Multipresse)', e:'🏗️', mg:'brust', s:3, r:10, en:'Smith Machine Incline Press'},
  {n:'Bankdrücken mit Pause',     e:'⏸️', mg:'brust', s:3, r:6,  en:'Paused Bench Press'},
  {n:'Bankdrücken (weiter Griff)',e:'↔️', mg:'brust', s:3, r:8,  en:'Wide-Grip Bench Press'},
  {n:'Bankdrücken (Untergriff)',  e:'🔄', mg:'brust', s:3, r:10, en:'Reverse-Grip Bench Press'},
  {n:'Bankdrücken (Bänder)',      e:'🎗️', mg:'brust', s:3, r:6,  en:'Banded Bench Press'},
  {n:'Bankdrücken (Ketten)',      e:'⛓️', mg:'brust', s:3, r:6,  en:'Chain Bench Press'},
  {n:'Board Press',               e:'🪵', mg:'brust', s:3, r:5 },
  {n:'Floor Press',               e:'⬛', mg:'brust', s:3, r:8 },
  {n:'Larsen Press',              e:'🦶', mg:'brust', s:3, r:8 },
  {n:'Spoto Press',               e:'⏱️', mg:'brust', s:3, r:6 },
  {n:'Einarmiges KH-Bankdrücken', e:'💪', mg:'brust', s:3, r:10, en:'Single-Arm Dumbbell Press'},
  {n:'Schrägbankdrücken (KH)',    e:'📈', mg:'brust', s:3, r:10, en:'Incline Dumbbell Press'},
  {n:'Negativbankdrücken (KH)',   e:'📉', mg:'brust', s:3, r:10, en:'Decline Dumbbell Press'},
  {n:'Fliegende (Schrägbank)',    e:'🦋', mg:'brust', s:3, r:12, en:'Incline Dumbbell Fly'},
  {n:'Fliegende (Negativbank)',   e:'🦋', mg:'brust', s:3, r:12, en:'Decline Dumbbell Fly'},
  {n:'Fliegende am Boden',        e:'⬛', mg:'brust', s:3, r:12, en:'Floor Fly'},
  {n:'Squeeze Press',             e:'🤏', mg:'brust', s:3, r:12},
  {n:'Svend Press',               e:'🥏', mg:'brust', s:3, r:15},
  {n:'KH-Überzüge',               e:'🛏️', mg:'brust', s:3, r:12, en:'Dumbbell Pullover'},
  {n:'Kabelzug Brust (hoch)',     e:'⬆️', mg:'brust', s:3, r:12, en:'High Cable Fly'},
  {n:'Kabelzug Brust (tief)',     e:'⬇️', mg:'brust', s:3, r:12, en:'Low Cable Fly'},
  {n:'Kabel-Crossover',           e:'✖️', mg:'brust', s:3, r:12, en:'Cable Crossover'},
  {n:'Kabel-Brustpresse',         e:'🪢', mg:'brust', s:3, r:12, en:'Cable Chest Press'},
  {n:'Einarmiger Kabelzug Brust', e:'🪢', mg:'brust', s:3, r:12, en:'Single-Arm Cable Fly'},
  {n:'Brustpresse (Maschine)',    e:'⚙️', mg:'brust', s:3, r:12, en:'Chest Press (Machine)'},
  {n:'Schräg-Brustpresse (Maschine)', e:'⚙️', mg:'brust', s:3, r:12, en:'Incline Chest Press (Machine)'},
  {n:'Hammer-Strength-Brustpresse',   e:'⚙️', mg:'brust', s:3, r:10, en:'Hammer Strength Chest Press'},
  {n:'Landmine-Drücken',          e:'🌋', mg:'brust', s:3, r:10, en:'Landmine Press'},
  {n:'Liegestütze (breit)',       e:'↔️', mg:'brust', s:3, r:15, en:'Wide Push-Ups'},
  {n:'Liegestütze (erhöht)',      e:'📦', mg:'brust', s:3, r:15, en:'Incline Push-Ups'},
  {n:'Liegestütze (Füße erhöht)', e:'📉', mg:'brust', s:3, r:12, en:'Decline Push-Ups'},
  {n:'Liegestütze (Ringe)',       e:'⭕', mg:'brust', s:3, r:10, en:'Ring Push-Ups'},
  {n:'Archer-Liegestütze',        e:'🏹', mg:'brust', s:3, r:8,  en:'Archer Push-Ups'},
  {n:'Plyo-Liegestütze',          e:'💥', mg:'brust', s:3, r:8,  en:'Plyometric Push-Ups'},
  {n:'Klatsch-Liegestütze',       e:'👏', mg:'brust', s:3, r:6,  en:'Clap Push-Ups'},
  {n:'Hindu-Liegestütze',         e:'🧘', mg:'brust', s:3, r:10, en:'Hindu Push-Ups'},
  {n:'Liegestütze (Bänder)',      e:'🎗️', mg:'brust', s:3, r:12, en:'Banded Push-Ups'},
  {n:'Dips (Ringe)',              e:'⭕', mg:'brust', s:3, r:8,  en:'Ring Dips'},
  {n:'Dips (breit)',              e:'↔️', mg:'brust', s:3, r:10, en:'Wide Dips'},
  {n:'Dips (Maschine)',           e:'⚙️', mg:'brust', s:3, r:10, en:'Assisted Dips (Machine)'},
  {n:'Medizinball-Wurf (Brust)',  e:'🏐', mg:'brust', s:3, r:10, en:'Med Ball Chest Pass'},
  {n:'Liegestütz-Halten',         e:'⏳', mg:'brust', s:3, r:30, t:'time', en:'Push-Up Hold'},
  {n:'Isometrische Brustpresse',  e:'⏳', mg:'brust', s:3, r:30, t:'time', en:'Isometric Chest Squeeze'},

  // ══ RÜCKEN ═════════════════════════════════════════════
  {n:'Klimmzüge',              e:'🆙', mg:'ruecken', s:3, r:8 },
  {n:'Latzug',                 e:'⬇️', mg:'ruecken', s:3, r:10},
  {n:'Rudern (Langhantel)',    e:'🚣', mg:'ruecken', s:3, r:8 },
  {n:'Kurzhantel-Rudern',      e:'🚣', mg:'ruecken', s:3, r:10},
  {n:'T-Bar Rudern',           e:'🅻', mg:'ruecken', s:3, r:10},
  {n:'Kreuzheben',             e:'🏋️', mg:'ruecken', s:3, r:5 },
  {n:'Rumänisches Kreuzheben', e:'🦵', mg:'ruecken', s:3, r:8 },
  {n:'Hyperextensions',        e:'🦴', mg:'ruecken', s:3, r:15},
  {n:'Face Pulls',             e:'😤', mg:'ruecken', s:3, r:15},
  {n:'Pullover',               e:'🛏️', mg:'ruecken', s:3, r:12},
  {n:'Klimmzüge (breit)',      e:'↔️', mg:'ruecken', s:3, r:8,  en:'Wide-Grip Pull-Ups'},
  {n:'Klimmzüge (eng)',        e:'🤏', mg:'ruecken', s:3, r:8,  en:'Close-Grip Pull-Ups'},
  {n:'Klimmzüge (neutral)',    e:'🤝', mg:'ruecken', s:3, r:8,  en:'Neutral-Grip Pull-Ups'},
  {n:'Chin-Ups (Untergriff)',  e:'🔄', mg:'ruecken', s:3, r:8,  en:'Chin-Ups'},
  {n:'Gewichtete Klimmzüge',   e:'⛓️', mg:'ruecken', s:4, r:5,  en:'Weighted Pull-Ups'},
  {n:'Klimmzüge (Maschine)',   e:'⚙️', mg:'ruecken', s:3, r:10, en:'Assisted Pull-Ups'},
  {n:'Klimmzüge (Band)',       e:'🎗️', mg:'ruecken', s:3, r:10, en:'Band-Assisted Pull-Ups'},
  {n:'Negativ-Klimmzüge',      e:'📉', mg:'ruecken', s:3, r:5,  en:'Negative Pull-Ups'},
  {n:'Kommando-Klimmzüge',     e:'🎖️', mg:'ruecken', s:3, r:8,  en:'Commando Pull-Ups'},
  {n:'Muscle-Up',              e:'🚀', mg:'ruecken', s:4, r:3 },
  {n:'Australische Klimmzüge', e:'🛌', mg:'ruecken', s:3, r:12, en:'Inverted Rows'},
  {n:'Ring-Rudern',            e:'⭕', mg:'ruecken', s:3, r:12, en:'Ring Rows'},
  {n:'Scapula Pull-Ups',       e:'🔺', mg:'ruecken', s:3, r:10, en:'Scapular Pull-Ups'},
  {n:'Latzug (eng)',           e:'🤏', mg:'ruecken', s:3, r:12, en:'Close-Grip Lat Pulldown'},
  {n:'Latzug (Untergriff)',    e:'🔄', mg:'ruecken', s:3, r:12, en:'Reverse-Grip Lat Pulldown'},
  {n:'Latzug (neutral)',       e:'🤝', mg:'ruecken', s:3, r:12, en:'Neutral-Grip Lat Pulldown'},
  {n:'Einarmiger Latzug',      e:'☝️', mg:'ruecken', s:3, r:12, en:'Single-Arm Lat Pulldown'},
  {n:'Latzug (Seil)',          e:'🪢', mg:'ruecken', s:3, r:12, en:'Rope Lat Pulldown'},
  {n:'Latzug hinter den Kopf', e:'🙇', mg:'ruecken', s:3, r:12, en:'Behind-the-Neck Pulldown'},
  {n:'Überzüge am Kabel',      e:'🪢', mg:'ruecken', s:3, r:12, en:'Straight-Arm Pulldown'},
  {n:'Kabel-Pullover',         e:'🪢', mg:'ruecken', s:3, r:12, en:'Cable Pullover'},
  {n:'Rudern (Untergriff)',    e:'🔄', mg:'ruecken', s:3, r:10, en:'Underhand Barbell Row'},
  {n:'Pendlay-Rudern',         e:'🚣', mg:'ruecken', s:4, r:6,  en:'Pendlay Row'},
  {n:'Kabelrudern sitzend',    e:'🪑', mg:'ruecken', s:3, r:12, en:'Seated Cable Row'},
  {n:'Kabelrudern (eng)',      e:'🤏', mg:'ruecken', s:3, r:12, en:'Close-Grip Cable Row'},
  {n:'Kabelrudern (breit)',    e:'↔️', mg:'ruecken', s:3, r:12, en:'Wide-Grip Cable Row'},
  {n:'Einarmiges Kabelrudern', e:'☝️', mg:'ruecken', s:3, r:12, en:'Single-Arm Cable Row'},
  {n:'Stehendes Kabelrudern',  e:'🧍', mg:'ruecken', s:3, r:12, en:'Standing Cable Row'},
  {n:'Maschinen-Rudern',       e:'⚙️', mg:'ruecken', s:3, r:12, en:'Machine Row'},
  {n:'Hammer-Strength-Rudern', e:'⚙️', mg:'ruecken', s:3, r:10, en:'Hammer Strength Row'},
  {n:'Brustgestütztes Rudern', e:'🪑', mg:'ruecken', s:3, r:12, en:'Chest-Supported Row'},
  {n:'Seal Row',               e:'🦭', mg:'ruecken', s:3, r:12},
  {n:'Landmine-Rudern',        e:'🌋', mg:'ruecken', s:3, r:10, en:'Landmine Row'},
  {n:'Meadows-Rudern',         e:'🌾', mg:'ruecken', s:3, r:10, en:'Meadows Row'},
  {n:'Renegade-Rudern',        e:'🏴', mg:'ruecken', s:3, r:10, en:'Renegade Row'},
  {n:'Kroc-Rudern',            e:'🚣', mg:'ruecken', s:3, r:15, en:'Kroc Row'},
  {n:'Gorilla-Rudern',         e:'🦍', mg:'ruecken', s:3, r:12, en:'Gorilla Row'},
  {n:'Rudern (Multipresse)',   e:'🏗️', mg:'ruecken', s:3, r:10, en:'Smith Machine Row'},
  {n:'Sumo-Kreuzheben',        e:'🤼', mg:'ruecken', s:3, r:5,  en:'Sumo Deadlift'},
  {n:'Trap-Bar-Kreuzheben',    e:'⬡',  mg:'ruecken', s:3, r:6,  en:'Trap Bar Deadlift'},
  {n:'Deficit-Kreuzheben',     e:'📦', mg:'ruecken', s:3, r:5,  en:'Deficit Deadlift'},
  {n:'Rack Pulls',             e:'🗄️', mg:'ruecken', s:3, r:6 },
  {n:'Kreuzheben mit Pause',   e:'⏸️', mg:'ruecken', s:3, r:4,  en:'Paused Deadlift'},
  {n:'Gestrecktes Kreuzheben', e:'📏', mg:'ruecken', s:3, r:8,  en:'Stiff-Leg Deadlift'},
  {n:'Snatch-Grip-Kreuzheben', e:'↔️', mg:'ruecken', s:3, r:6,  en:'Snatch-Grip Deadlift'},
  {n:'Rumänisches Kreuzheben (KH)', e:'💪', mg:'ruecken', s:3, r:10, en:'Dumbbell Romanian Deadlift'},
  {n:'Einbeiniges Kreuzheben', e:'🦩', mg:'ruecken', s:3, r:10, en:'Single-Leg Deadlift'},
  {n:'Good Mornings',          e:'🌅', mg:'ruecken', s:3, r:10},
  {n:'Reverse Hyperextensions',e:'🔃', mg:'ruecken', s:3, r:15},
  {n:'Rückenstrecker (Maschine)', e:'⚙️', mg:'ruecken', s:3, r:15, en:'Back Extension (Machine)'},
  {n:'Superman',               e:'🦸', mg:'ruecken', s:3, r:30, t:'time'},
  {n:'Face Pulls (Band)',      e:'🎗️', mg:'ruecken', s:3, r:20, en:'Band Face Pulls'},
  {n:'Toter Hang',             e:'🪝', mg:'ruecken', s:3, r:30, t:'time', en:'Dead Hang'},
// @@NEXT@@
];

/* ── i18n: englische Namen im Display-Layer registrieren ────────────────
 * app-i18n.js laeuft VOR dieser Datei, I18N_EN existiert also bereits.
 * Bestehende Eintraege gewinnen — handgepflegte Uebersetzungen bleiben. */
if (typeof I18N_EN === 'object' && I18N_EN) {
  for (let i = 0; i < EX_LIBRARY.length; i++) {
    const it = EX_LIBRARY[i];
    if (it.en && !I18N_EN[it.n]) I18N_EN[it.n] = it.en;
  }
}
