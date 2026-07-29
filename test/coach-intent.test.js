const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/coach-intent.js');

const SNAP = {
  exercises: [{ id: 'ex1', name: 'Bankdruecken', muscleGroup: 'brust' },
              { id: 'ex2', name: 'Kniebeuge', muscleGroup: 'beine' }],
  bestSet:  { ex1: { w: 80, r: 8, date: '2026-07-20' } },
  lastDone: { ex1: '2026-07-20' },
  // setsTotal/setsDone bewusst NICHT 4/2: die Differenz (links) darf keinen der
  // beiden Eingabewerte treffen, sonst wuerde ein Bug (z.B. links=setsDone statt
  // setsTotal-setsDone) denselben Text erzeugen und der Test wuerde nicht kippen.
  active:   { exId: 'ex1', setsTotal: 5, setsDone: 2, nextW: 82.5 },
  restLeftSec: 45,
  recovery: { Brust: 92, Beine: 40 },
  weekVolumeKg: 12500,
  todayText: 'Beine stehen heute an.'
};

test('naechstes Gewicht', () => {
  const r = R.resolveIntent('wie viel gewicht beim naechsten satz?', SNAP);
  assert.strictEqual(r.intent, 'nextWeight');
  assert.ok(r.answer.includes('82,5'));
});

test('Rekord bei einer Uebung', () => {
  const r = R.resolveIntent('was ist mein rekord bei bankdruecken?', SNAP);
  assert.strictEqual(r.intent, 'best');
  assert.ok(r.answer.includes('80 kg'));
  // Nicht bloss includes('8') pruefen: das waere durch '80' schon erfuellt und
  // haette nie testen koennen, ob die Wiederholungszahl ueberhaupt im Text steht.
  assert.ok(r.answer.includes('mal 8 Wiederholungen'));
});

test('verbleibende Saetze', () => {
  const r = R.resolveIntent('wie viele saetze noch?', SNAP);
  assert.strictEqual(r.intent, 'setsLeft');
  assert.ok(r.answer.includes('3'));
});

test('Restpause', () => {
  const r = R.resolveIntent('wie lange noch pause?', SNAP);
  assert.strictEqual(r.intent, 'rest');
  assert.ok(r.answer.includes('45'));
});

test('Frage zum Ruhetag ist keine Restpause-Frage (geht ans Modell)', () => {
  // "how long.*rest" allein hat kein Themen-Anker: "rest day" (Ruhetag) triggert
  // denselben Wildcard-Bug wie bei Intent 1/3 -- der Router wuerde konfident (aber
  // falsch) den laufenden Pausen-Timer nennen, obwohl nach einem Ruhetag gefragt wird.
  assert.strictEqual(
    R.resolveIntent('How long has it been since my last rest day?', SNAP),
    null
  );
});

test('"rest" als normales englisches Pronomen matcht nicht (geht ans Modell)', () => {
  // Hier ist "rest" gar kein Fitness-Wort, sondern das Pronomen "der Rest" (of my
  // friends). Ohne Themen-Anker matcht "how long.*rest" trotzdem.
  assert.strictEqual(
    R.resolveIntent('How long till the rest of my friends arrive?', SNAP),
    null
  );
});

test('echte Frage zum laufenden Pausen-Timer bleibt erkannt', () => {
  const r = R.resolveIntent('How long until my rest is over?', SNAP);
  assert.strictEqual(r.intent, 'rest');
  assert.ok(r.answer.includes('45'));
});

test('Erholung einer Muskelgruppe', () => {
  const r = R.resolveIntent('wie erholt ist meine brust?', SNAP);
  assert.strictEqual(r.intent, 'recovery');
  assert.ok(r.answer.includes('92'));
});

test('letzte Ausfuehrung', () => {
  const r = R.resolveIntent('wann hatte ich zuletzt bankdruecken?', SNAP);
  assert.strictEqual(r.intent, 'lastDone');
  assert.ok(r.answer.includes('20.07.2026'));
});

test('Wochenvolumen', () => {
  const r = R.resolveIntent('wie viel volumen diese woche?', SNAP);
  assert.strictEqual(r.intent, 'volume');
  assert.ok(r.answer.includes('12.500'));
});

test('was steht heute an', () => {
  const r = R.resolveIntent('was steht heute an?', SNAP);
  assert.strictEqual(r.intent, 'today');
  assert.strictEqual(r.answer, 'Beine stehen heute an.');
});

test('englische Frage wird erkannt', () => {
  const r = R.resolveIntent('what is my record on bench press?', {
    ...SNAP,
    exercises: [{ id: 'ex1', name: 'Bench Press', muscleGroup: 'brust' }]
  });
  assert.strictEqual(r.intent, 'best');
});

test('Rekord fuer unbekannte Uebung geht ans Modell', () => {
  assert.strictEqual(R.resolveIntent('was ist mein rekord bei nackenziehen?', SNAP), null);
});

test('offene Frage geht ans Modell', () => {
  assert.strictEqual(R.resolveIntent('soll ich heute lieber cardio machen oder beine?', SNAP), null);
});

test('Planwunsch geht ans Modell', () => {
  assert.strictEqual(R.resolveIntent('erstell mir einen trainingsplan fuer 4 tage', SNAP), null);
});

test('Schmerzmeldung geht ans Modell', () => {
  assert.strictEqual(R.resolveIntent('meine schulter tut beim bankdruecken weh', SNAP), null);
});

test('naechster Satz ohne Gewichtsbezug geht ans Modell (Uebungswahl)', () => {
  // "naechste[nsr]? satz" darf nicht als eigenstaendige Alternative ohne
  // Gewichtskontext feuern -- sonst antwortet der Router konfident falsch auf
  // Fragen zur Uebungswahl statt gar nicht zu antworten.
  assert.strictEqual(R.resolveIntent('was mache ich beim naechsten satz?', SNAP), null);
});

test('naechster Satz ohne Gewichtsbezug geht ans Modell (Wiederholungen)', () => {
  assert.strictEqual(
    R.resolveIntent('wie viele wiederholungen beim naechsten satz?', SNAP),
    null
  );
});

test('Gewichtsfrage mit "naechster Satz"-Phrasierung bleibt erkannt', () => {
  const r = R.resolveIntent('gewicht fuer den naechsten satz?', SNAP);
  assert.strictEqual(r.intent, 'nextWeight');
  assert.ok(r.answer.includes('82,5'));
});

test('fehlende Daten ergeben kein Ergebnis', () => {
  assert.strictEqual(R.resolveIntent('wie lange noch pause?', { restLeftSec: 0 }), null);
  assert.strictEqual(R.resolveIntent('wie viele saetze noch?', {}), null);
});

test('leere Eingabe ergibt null', () => {
  assert.strictEqual(R.resolveIntent('', SNAP), null);
  assert.strictEqual(R.resolveIntent(null, SNAP), null);
});

// --- Strukturelles Gate (Baustein 3, Nachaudit) ---------------------------
// "volume", "record" und "rest" sind ausserhalb des Trainingskontexts ganz
// normale Alltagswoerter. Das Gate verlangt fuer diese Ankerworte ein
// zweites, unabhaengiges Fitness-Wort im selben Satz -- ohne das bleibt der
// Treffer aus, auch wenn Snapshot-Daten (weekVolumeKg, bestSet) vorhanden
// waeren, die frueher trotzdem eine konfident falsche Antwort ausloesten.

test('Lautstaerke-Frage ist kein Trainingsvolumen (geht ans Modell)', () => {
  // Frueher matchte /volumen|volume|tonnage/ auf das nackte Wort "volume"
  // und beantwortete die Frage faelschlich mit dem Wochenvolumen.
  assert.strictEqual(R.resolveIntent('Can you turn up the volume?', SNAP), null);
});

test('"record" als Verb (Tagebuch fuehren) ist kein Rekord-Abruf (geht ans Modell)', () => {
  // Frueher matchte bare "record" plus der zufaellig im Satz enthaltene
  // Uebungsname "bankdruecken" -- der Router antwortete konfident mit dem
  // Bankdruecken-Rekord, obwohl der Nutzer sein Training nur protokollieren
  // (nicht abfragen) wollte.
  assert.strictEqual(
    R.resolveIntent('I want to record my bankdruecken workout in a journal', SNAP),
    null
  );
});

test('Restpause-Fragen ohne "rest timer"-Wortlaut bleiben lokal beantwortbar', () => {
  // Die vorherige Verschaerfung (nur noch "rest timer|rest is over|rest left"
  // nach "how long") hat diese vier echten Fragen zum laufenden Pausen-Timer
  // mitgetroffen und faelschlich null zurueckgegeben. Das Gate "my rest" /
  // "rest ... left" erkennt sie wieder, ohne die Ruhetag-/Freunde-Faelle
  // oben erneut durchzulassen.
  const phrasings = [
    'How long is my rest?',
    'how long left on my rest',
    'how long till my rest ends',
    'how much rest do i have left'
  ];
  phrasings.forEach((text) => {
    const r = R.resolveIntent(text, SNAP);
    assert.strictEqual(r && r.intent, 'rest', 'erwartet rest-Intent fuer: ' + text);
    assert.ok(r.answer.includes('45'), 'erwartet Pausenzeit im Text fuer: ' + text);
  });
});

// --- Review-Runde 4: BLOCK-Rueckbau + Intent 3/5/8 (dieser Task) -----------
// BLOCK wurde faelschlich um Krankheitsworte erweitert, um Intent 5 zu
// schuetzen -- das Gate wirkt aber auf ALLE acht Intents. Diese vier Tests
// belegen je eine der Korrekturen und diskriminieren (RED vor dem Fix, GREEN
// danach) -- siehe Report fuer die je vorher/nachher-Konsole-Ausgabe.

test('Krankheitswort blockiert keinen anderen Intent mehr (BLOCK-Rueckbau)', () => {
  // Vorher: BLOCK enthielt "erkaelt" und loeschte JEDE Frage mit diesem Wort,
  // auch eine, die nichts mit Erholung zu tun hat. Reviewer-Beispiel.
  const r = R.resolveIntent('Ich bin erkaeltet, wie viele Saetze noch?', SNAP);
  assert.strictEqual(r && r.intent, 'setsLeft');
  assert.ok(r.answer.includes('3'));
});

test('Erholungsurlaub-Erzaehlsatz wird nicht als Erholungsabfrage gelesen (geht ans Modell)', () => {
  // Der Fehltreffer, den die BLOCK-Erweiterung eigentlich schliessen sollte,
  // und den sie NICHT geschlossen hat (kein Krankheitswort enthalten). Intent
  // 5 verlangt jetzt zusaetzlich eine Frageform (wie/how) statt blossem
  // Wortstamm -- ein Erzaehlsatz wie dieser hat keine.
  assert.strictEqual(
    R.resolveIntent('Ich war im Erholungsurlaub, meine Brust hat sich ausgeruht', SNAP),
    null
  );
});

test('bare "Whats on today" antwortet wieder lokal (Gym-Coach-Chat, kein Kino-Kontext)', () => {
  // Die vorherige Verschaerfung (zusaetzlich workout/training/gym noetig) hat
  // eine im Coach-Chat voellig normale Frage ohne Beleg fuer einen echten
  // Fehltreffer in genau diesem Chat-Fenster blockiert.
  const r = R.resolveIntent("What's on today?", SNAP);
  assert.strictEqual(r && r.intent, 'today');
  assert.strictEqual(r.answer, 'Beine stehen heute an.');
});

test('"how many sets" ohne Trainingsbezug ist keine Satzfrage (geht ans Modell)', () => {
  // Reviewer-Beispiel: waehrend s.active befuellt ist (normaler Zustand im
  // laufenden Training) hat "how many sets" bisher auch auf trainingsfremde
  // Fragen (hier: Tennis) geantwortet.
  assert.strictEqual(
    R.resolveIntent('how many sets are there in a tennis match', SNAP),
    null
  );
});

// --- Task 3: elf weitere Fragen lokal beantworten -------------------------
// S20 erbt bewusst ALLE Felder von SNAP. Nur so faellt auf, wenn ein neuer
// Intent von einem bestehenden geschluckt wird (oder umgekehrt) -- mit einem
// leeren Schnappschuss waeren die Reihenfolge-Fehler unsichtbar geblieben.
const S20 = {
  ...SNAP,
  nextSetText:  '3 Sätze à 8 Wiederholungen bei 62,5 kg.',
  warmupText:   'Aufwärmen: 20 kg mal 10, 40 kg mal 5, 55 kg mal 3.',
  supersetText: 'Supersatz mit Rudern am Kabel.',
  weekWorkouts: 3,
  weekGoal:     4,
  streakWeeks:  12,
  lastPrExName: 'Kniebeuge',
  lastPrKg:     102.5,
  lastPrDaysAgo: 6,
  avgDurationMin: 58,
  yesterdayText: 'Gestern: Push, 6 Übungen, 5.400 kg Volumen.',
  muscleVolume: { brust: 4800, ruecken: 5200 },
  nextPlanDayText: 'Mittwoch: Beine.',
  planNames: ['Push', 'Pull', 'Beine']
};

test('naechster Satz wird lokal beantwortet', () => {
  const r = R.resolveIntent('was ist mein naechster satz?', S20);
  assert.strictEqual(r && r.intent, 'nextSet');
  assert.ok(r.answer.includes('62,5'));
});

test('"satz" allein loest keinen naechster-Satz-Intent aus (geht ans Modell)', () => {
  // Ohne Besitz-/Nominativbezug ("mein naechster satz") ist "satz" ein
  // Alltagswort. Faengt ein zu breites /satz/-Muster.
  assert.strictEqual(R.resolveIntent('ein satz mit vielen woertern', S20), null);
});

test('Aufwaermfrage wird lokal beantwortet (trotz "soll ich" in BLOCK)', () => {
  // Die natuerlichste Formulierung enthaelt "soll ich" und faellt damit in
  // BLOCK. Der Aufwaerm-Intent steht deshalb VOR der BLOCK-Pruefung -- aber
  // nur, wenn kein Schmerz-/Verletzungswort im Satz steht (Test weiter unten).
  const r = R.resolveIntent('wie soll ich mich aufwaermen?', S20);
  assert.strictEqual(r && r.intent, 'warmup');
  assert.ok(r.answer.includes('20 kg'));
});

test('Aufwaermfrage mit Schmerzmeldung geht ans Modell', () => {
  // Die Vorab-Ausnahme darf medizinische Fragen NICHT einfangen -- sonst
  // beantwortet der Router "meine Schulter tut weh, wie soll ich mich
  // aufwaermen?" mit einem Schema statt an das Modell abzugeben.
  assert.strictEqual(
    R.resolveIntent('meine schulter tut weh, wie soll ich mich aufwaermen?', S20),
    null
  );
});

test('Supersatz-Partner wird lokal beantwortet', () => {
  const r = R.resolveIntent('was passt als supersatz dazu?', S20);
  assert.strictEqual(r && r.intent, 'superset');
  assert.ok(r.answer.includes('Rudern'));
});

test('Wochenfortschritt nennt Ist UND Ziel in der richtigen Reihenfolge', () => {
  // Exakter String statt includes('3')+includes('4'): sonst bliebe der Test
  // gruen, obwohl Ist und Ziel vertauscht sind.
  const r = R.resolveIntent('wie viele trainings diese woche?', S20);
  assert.strictEqual(r && r.intent, 'weekProgress');
  assert.strictEqual(r.answer, 'Diese Woche 3 von 4 Einheiten.');
});

test('"woche" als Alltagswort loest keinen Wochenfortschritt aus (geht ans Modell)', () => {
  assert.strictEqual(R.resolveIntent('diese woche war anstrengend', S20), null);
});

test('Streak wird lokal beantwortet', () => {
  const r = R.resolveIntent('wie lang ist meine streak?', S20);
  assert.strictEqual(r && r.intent, 'streak');
  assert.ok(r.answer.includes('12'));
});

test('letzter PR nennt Uebung, Gewicht und Alter', () => {
  // Alle drei einzeln pruefen: nur der Name waere auch dann gruen, wenn
  // Gewicht oder Abstand im Satz fehlen. Prueft zugleich die Reihenfolge --
  // "wann hatte ich" gehoert dem alten lastDone-Intent, der hier ohne
  // Uebungsnamen null liefern und die Frage verschlucken wuerde.
  const r = R.resolveIntent('wann hatte ich zuletzt einen pr?', S20);
  assert.strictEqual(r && r.intent, 'lastPr');
  assert.ok(r.answer.includes('Kniebeuge'));
  assert.ok(r.answer.includes('102,5'));
  assert.ok(r.answer.includes('6'));
});

test('durchschnittliche Trainingsdauer wird lokal beantwortet', () => {
  const r = R.resolveIntent('wie lange trainiere ich im schnitt?', S20);
  assert.strictEqual(r && r.intent, 'avgDuration');
  assert.ok(r.answer.includes('58'));
});

test('gestrige Einheit wird lokal beantwortet', () => {
  const r = R.resolveIntent('was habe ich gestern gemacht?', S20);
  assert.strictEqual(r && r.intent, 'yesterday');
  assert.ok(r.answer.includes('Push'));
});

test('Volumen einer Muskelgruppe trifft die richtige Gruppe', () => {
  const r = R.resolveIntent('wie viel volumen brust diese woche?', S20);
  assert.strictEqual(r && r.intent, 'muscleVolume');
  assert.ok(r.answer.includes('4.800'));
  assert.ok(!r.answer.includes('5.200'), 'darf nicht die andere Muskelgruppe nennen');
});

test('allgemeine Volumenfrage bleibt beim Gesamtvolumen-Intent', () => {
  // Der Muskel-Intent steht VOR dem Gesamt-Intent und darf die allgemeine
  // Frage trotzdem nicht schlucken -- er verlangt einen Muskelnamen im Satz.
  const r = R.resolveIntent('wie viel volumen diese woche?', S20);
  assert.strictEqual(r && r.intent, 'volume');
});

test('naechster Plantag wird lokal beantwortet', () => {
  const r = R.resolveIntent('was steht als naechstes an?', S20);
  assert.strictEqual(r && r.intent, 'nextPlanDay');
  assert.ok(r.answer.includes('Mittwoch'));
});

test('heutiger Plan bleibt beim today-Intent', () => {
  const r = R.resolveIntent('was steht heute an?', S20);
  assert.strictEqual(r && r.intent, 'today');
});

test('Planliste verliert keinen Eintrag', () => {
  const r = R.resolveIntent('welche plaene habe ich?', S20);
  assert.strictEqual(r && r.intent, 'planList');
  ['Push', 'Pull', 'Beine'].forEach(n =>
    assert.ok(r.answer.includes(n), 'fehlender Plan im Text: ' + n));
});

test('fehlende Felder ergeben null statt eines erfundenen Werts', () => {
  // Der teuerste denkbare Fehler waere eine konfident falsche Zahl. Bei
  // fehlender Quelle muss die Frage ans Modell gehen.
  assert.strictEqual(R.resolveIntent('wie lang ist meine streak?', { ...S20, streakWeeks: null }), null);
  assert.strictEqual(R.resolveIntent('wie soll ich mich aufwaermen?', { ...S20, warmupText: null }), null);
  assert.strictEqual(R.resolveIntent('wie lange trainiere ich im schnitt?', { ...S20, avgDurationMin: null }), null);
  assert.strictEqual(R.resolveIntent('was ist mein naechster satz?', { ...S20, nextSetText: null }), null);
  assert.strictEqual(R.resolveIntent('was passt als supersatz dazu?', { ...S20, supersetText: null }), null);
  assert.strictEqual(R.resolveIntent('wie viele trainings diese woche?', { ...S20, weekGoal: null }), null);
  assert.strictEqual(R.resolveIntent('wann hatte ich zuletzt einen pr?', { ...S20, lastPrKg: null }), null);
  assert.strictEqual(R.resolveIntent('was habe ich gestern gemacht?', { ...S20, yesterdayText: null }), null);
  assert.strictEqual(R.resolveIntent('was steht als naechstes an?', { ...S20, nextPlanDayText: null }), null);
  assert.strictEqual(R.resolveIntent('welche plaene habe ich?', { ...S20, planNames: [] }), null);
  assert.strictEqual(R.resolveIntent('wie viel volumen brust diese woche?', { ...S20, muscleVolume: null }), null);
});

test('wertende Fragen bleiben trotz neuer Intents beim Modell', () => {
  // BLOCK darf durch Task 3 nicht durchloechert worden sein.
  assert.strictEqual(R.resolveIntent('soll ich lieber mehr volumen bei brust machen?', S20), null);
  assert.strictEqual(R.resolveIntent('warum ist mein naechster satz so schwer?', S20), null);
});

// --- Task 4: Begruendung des Gewichtsvorschlags ---------------------------
// Der Intent laeuft VOR BLOCK (dort steht "warum"), deshalb pruefen mehrere
// Tests ausdruecklich, dass die Ausnahme eng genug bleibt.
const WR = {
  exName: 'Bankdrücken', fromKg: 60, toKg: 62.5, stepKg: 2.5,
  reason: 'repsHigh', lastReps: [8, 8, 8], repRange: [6, 8], ciFactor: 1
};
const S4 = { ...S20, weightReason: WR };

test('Begruendung nennt Wiederholungen, Schrittweite und Zielgewicht', () => {
  const r = R.resolveIntent('warum 62,5?', S4);
  assert.strictEqual(r && r.intent, 'weightWhy');
  // 8/8/8 statt bloss "8": der Bereich 6-8 steht ohnehin im Satz, ein
  // includes('8') waere also auch dann gruen, wenn die tatsaechlich
  // geschafften Wiederholungen gar nicht genannt werden.
  assert.ok(r.answer.includes('8/8/8'), 'geschaffte Wiederholungen fehlen');
  assert.ok(r.answer.includes('62,5'), 'Zielgewicht fehlt');
  assert.ok(r.answer.includes('2,5 kg'), 'Schrittweite fehlt');
});

test('Begruendung auch ohne Zahl in der Frage', () => {
  ['warum dieses gewicht?', 'wie kommst du auf das gewicht?', 'why this weight?']
    .forEach(q => assert.strictEqual(R.resolveIntent(q, S4) && R.resolveIntent(q, S4).intent,
                                     'weightWhy', 'nicht erkannt: ' + q));
});

test('Check-in-Absenkung wird mit Prozent und Ursache begruendet', () => {
  const s = { ...S4, weightReason: { ...WR, reason: 'checkinDown', toKg: 55, ciFactor: 0.92 } };
  const r = R.resolveIntent('warum 55?', s);
  assert.strictEqual(r && r.intent, 'weightWhy');
  // W7: includes('8') war NICHT diskriminierend -- bei gedrehtem Vorzeichen
  // lautet der Text "um -8%" und enthaelt weiterhin eine '8'. Geprueft wird
  // deshalb der komplette Wortlaut inklusive Vorzeichenfreiheit.
  assert.ok(/sinkt deshalb um 8\s?%/.test(r.answer), 'Prozentwert falsch herum gerechnet');
  assert.ok(!/-\s?8\s?%/.test(r.answer), 'Prozentwert mit gedrehtem Vorzeichen');
  assert.ok(/Check-in|Erholung/.test(r.answer), 'Ursache nicht benannt');
});

test('bei nicht erreichtem Bereich sagt die Begruendung, dass das Gewicht bleibt', () => {
  const s = { ...S4, weightReason: { ...WR, reason: 'repsLow', toKg: 60, lastReps: [5, 5, 4] } };
  const r = R.resolveIntent('warum 60?', s);
  assert.strictEqual(r && r.intent, 'weightWhy');
  assert.ok(/bleibt/.test(r.answer), 'Auf- und Abstieg vertauscht');
});

test('ohne aktiven Vorschlag wird nichts begruendet', () => {
  assert.strictEqual(R.resolveIntent('warum 62,5?', { ...S4, weightReason: null }), null);
});

test('die Warum-Ausnahme bleibt eng', () => {
  // Medizinisch, wertend, und ein Warum weit weg von jedem Gewichtswort.
  assert.strictEqual(R.resolveIntent('warum tut mir die schulter weh?', S4), null);
  assert.strictEqual(R.resolveIntent('warum ist mein plan so aufgebaut?', S4), null);
  assert.strictEqual(R.resolveIntent('warum ist mein naechster satz so schwer?', S4), null);
  assert.strictEqual(
    R.resolveIntent('warum haben wir eigentlich nie darueber geredet, was ein gutes gewicht waere?', S4),
    null
  );
});

test('englische Varianten der neuen Intents werden erkannt', () => {
  assert.strictEqual(R.resolveIntent('whats my next set?', S20).intent, 'nextSet');
  assert.strictEqual(R.resolveIntent('how long is my streak?', S20).intent, 'streak');
  assert.strictEqual(R.resolveIntent('how should i warm up?', S20).intent, 'warmup');
});

// --- Review-Runde 5: die beiden Vorab-Ausnahmen und die Task-3-Gates --------
// Beide Ausnahmen (Aufwaermen, Gewichtsbegruendung) laufen VOR BLOCK. Sie
// haben BLOCK bisher komplett uebersprungen, statt nur das eine Wort
// auszuklammern, das sie brauchen ("soll ich" bzw. "warum"). Alle Saetze hier
// sind die im Reviewbericht ausgefuehrten Angriffssaetze.

const S60  = { ...S4, weightReason: { ...WR, toKg: 60 } };
const S100 = { ...S4, weightReason: { ...WR, toKg: 100 } };

test('K2: medizinische Fragen kommen nicht durch die Gewichts-Ausnahme', () => {
  // MED kannte nur sechs Wortstaemme -- Koerperteil plus Beschwerde ist die
  // Klasse, nicht das Einzelwort.
  assert.strictEqual(R.resolveIntent('warum knackt das knie bei 60 kg?', S60), null);
  assert.strictEqual(R.resolveIntent('warum ziept es bei dem gewicht?', S4), null);
  assert.strictEqual(R.resolveIntent('warum ist das gewicht so gefaehrlich fuer mein knie?', S4), null);
});

test('K2: Erlaubnis- und Planfragen kommen nicht durch die Gewichts-Ausnahme', () => {
  // Begruendet wird ausschliesslich die eigene Rechnung, nie eine Empfehlung:
  // "warum SOLL ICH das nehmen" ist eine Erlaubnisfrage und gehoert ans Modell.
  assert.strictEqual(R.resolveIntent('warum soll ich das gewicht nehmen?', S4), null);
  assert.strictEqual(R.resolveIntent('warum steht im plan 60 kg?', S4), null);
  assert.strictEqual(R.resolveIntent('warum ist mein plan auf kg statt lbs?', S4), null);
});

test('K2: Koerpergewicht ist nicht das Hantelgewicht', () => {
  assert.strictEqual(R.resolveIntent('wieso ist mein koerpergewicht gestiegen?', S4), null);
  assert.strictEqual(R.resolveIntent('warum nehme ich an gewicht zu?', S4), null);
  assert.strictEqual(R.resolveIntent('wieso wiege ich 60 kilo?', S60), null);
});

test('K2: Aufwaerm-Ausnahme laesst Medizinisches und Planendes nicht durch', () => {
  assert.strictEqual(R.resolveIntent('ich bin krank, wie soll ich mich aufwaermen?', S20), null);
  assert.strictEqual(R.resolveIntent('ich hatte eine zerrung im ruecken, wie aufwaermen?', S20), null);
  assert.strictEqual(R.resolveIntent('nach meiner knie-op, wie soll ich mich aufwaermen?', S20), null);
  assert.strictEqual(R.resolveIntent('welchen plan soll ich zum aufwaermen nehmen?', S20), null);
});

test('W1: eine Zahl ohne Gewichtsbezug begruendet nichts', () => {
  // numSig stand ohne Wortgrenze und ohne Einheiten-Anker im Muster.
  assert.strictEqual(R.resolveIntent('warum bin ich seit 60 tagen nicht besser geworden?', S60), null);
  assert.strictEqual(R.resolveIntent('warum trainiere ich 60 minuten?', S60), null);
  assert.strictEqual(R.resolveIntent('warum ist mein 1rm 160 gesunken?', S60), null);
  assert.strictEqual(R.resolveIntent('warum sind 100 wiederholungen zu viel?', S100), null);
  assert.strictEqual(R.resolveIntent('warum nur 100 kalorien?', S100), null);
});

test('W1: die Zahl mit Einheit oder am Satzende bleibt ein Gewichtssignal', () => {
  assert.strictEqual(R.resolveIntent('warum 60?', S60).intent, 'weightWhy');
  assert.strictEqual(R.resolveIntent('warum sind es heute 60 kg?', S60).intent, 'weightWhy');
});

test('W2: fehlender Aufwaermtext laesst die Frage zu den spaeteren Intents durch', () => {
  // snap.warmupText wird bis Block 3 nirgends gesetzt. Die Ausnahme brach die
  // Frage bisher mit null ab, statt sie durchfallen zu lassen.
  const r = R.resolveIntent('wie viele saetze noch nach dem aufwaermen?', { ...S20, warmupText: null });
  assert.strictEqual(r && r.intent, 'setsLeft');
  assert.ok(r.answer.includes('3'));
});

test('W3: reine Mengenfrage mit "woche" ist kein Wochenfortschritt', () => {
  assert.strictEqual(R.resolveIntent('wie viele tage hat diese woche?', S20), null);
  assert.strictEqual(R.resolveIntent('wie viele kalorien habe ich diese woche verbrannt?', S20), null);
});

test('W4: Satzdauer und "lang" als Teilwort sind keine Trainingsdauer', () => {
  assert.strictEqual(R.resolveIntent('wie lange sollte ein durchschnittlicher satz dauern?', S20), null);
  assert.strictEqual(R.resolveIntent('wie ist der durchschnitt bei langhantel uebungen?', S20), null);
});

test('W5: Alltagswoerter allein loesen Supersatz/gestern/Plantag nicht aus', () => {
  assert.strictEqual(R.resolveIntent('was ist ein supersatz?', S20), null);
  assert.strictEqual(R.resolveIntent('was war gestern im fernsehen?', S20), null);
  assert.strictEqual(R.resolveIntent('whats next after this set?', S20), null);
});

test('W6: hold-Begruendung behauptet den Bereich nicht, wenn er verfehlt wurde', () => {
  const s = { ...S4, weightReason: { ...WR, reason: 'hold', toKg: 60, lastReps: [5, 5, 4], repRange: [6, 8] } };
  const r = R.resolveIntent('warum 60?', s);
  assert.strictEqual(r && r.intent, 'weightWhy');
  assert.ok(!/im Bereich/.test(r.answer), 'behauptet faelschlich, die Wdh. laegen im Bereich');
  assert.ok(r.answer.includes('5/5/4'), 'geschaffte Wiederholungen fehlen');
  assert.ok(r.answer.includes('6–8'), 'Bereich fehlt');
  assert.ok(/bleibt/.test(r.answer), 'Haltefall nicht benannt');
});

test('W6: hold-Begruendung sagt "im Bereich", wenn die Wdh. drin lagen', () => {
  const s = { ...S4, weightReason: { ...WR, reason: 'hold', toKg: 60, lastReps: [7, 7, 6], repRange: [6, 8] } };
  const r = R.resolveIntent('warum 60?', s);
  assert.ok(/im Bereich 6–8/.test(r.answer), 'korrekter Bereichsfall verloren');
});

// --- Re-Review Runde 6: die Vorab-Ausnahmen als ERLAUBNISliste --------------
// Beide Vorab-Ausnahmen waren Sperrlisten: "irgendwo im Satz ein Aufwaerm-/
// Warum-Wort UND kein verbotenes Wort -> lokal antworten". Sperrlisten
// versagen nach aussen offen -- jede Beschwerdeform, die nicht auf der Liste
// steht, rutscht durch. Ab hier ist die Ausnahme auf die GANZE normalisierte
// Frage verankert: haengt ein Nebensatz dran (Beschwerde, Vorerkrankung,
// zweite Frage), passt die Form nicht mehr und die Frage laeuft wie jede
// andere durch BLOCK und die uebrigen Intents weiter.

test('W2: mit GESETZTEM Aufwaermtext verschluckt die Ausnahme keine fremden Fragen', () => {
  // Der bisherige W2-Test pinnt warmupText: null -- also den Ruhezustand, in
  // dem der Fehler gar nicht auftreten kann. Ab Block 3 ist das Feld gefuellt;
  // genau dieser Zustand gehoert bewacht, sonst bleibt der Test gruen,
  // waehrend der Verschlucker zurueckkommt. S20.warmupText IST gesetzt.
  const cases = [
    ['wie viele saetze noch nach dem aufwaermen?',              'setsLeft'],
    ['wie lange pause nach dem aufwaermen?',                    'rest'],
    ['was steht heute an nach dem aufwaermen?',                 'today'],
    ['whats my next set after the warm up?',                    'nextSet'],
    ['wie viel gewicht beim naechsten satz nach dem aufwaermen?', 'nextWeight'],
    ['nach dem aufwaermen, wie viel volumen diese woche?',      'volume'],
    ['nach dem aufwaermen, was steht heute an?',                'today'],
    ['nach dem aufwaermen, wie ist meine streak?',              'streak'],
    ['nach dem warm up, wie viele saetze noch?',                'setsLeft'],
    ['warm up done, whats my next set?',                        'nextSet']
  ];
  cases.forEach(([q, want]) => {
    const r = R.resolveIntent(q, S20);
    assert.strictEqual(r && r.intent, want, 'falscher Intent fuer: ' + q);
  });
});

test('K2-Rest: Aufwaerm-Ausnahme greift nicht, wenn eine Meldung davorsteht', () => {
  // Keins dieser Woerter steht in MED_HARD -- eine Aufzaehlung haette sie alle
  // durchgelassen. Die Ganzform-Verankerung faengt sie ohne neues Vokabular.
  ['meine schulter tut weh, wie soll ich mich aufwaermen?',
   'ich bin schwanger, wie soll ich mich aufwaermen?',
   'mir ist schwindelig, wie soll ich mich aufwaermen?',
   'nach meinem herzinfarkt, wie soll ich mich aufwaermen?',
   'ich hab asthma, wie aufwaermen?',
   'mein bizeps ist ueberdehnt, wie aufwaermen?'
  ].forEach(q => assert.strictEqual(R.resolveIntent(q, S20), null, 'nicht abgegeben: ' + q));
});

test('K2-Rest: Gewichts-Ausnahme greift nicht bei angehaengter Beschwerde/Wertung', () => {
  // Alle sechs ohne Koerperteilwort und ohne MED_HARD-Treffer -- die alte
  // Sperrliste hat sie mit der Progressionsregel beantwortet.
  assert.strictEqual(R.resolveIntent('warum knackt es bei 60 kg?', S60), null);
  assert.strictEqual(R.resolveIntent('warum wird mir uebel bei dem gewicht?', S4), null);
  assert.strictEqual(R.resolveIntent('warum ist das gewicht so ungesund?', S4), null);
  assert.strictEqual(R.resolveIntent('warum ist das gewicht bei meiner arthrose ok?', S4), null);
  assert.strictEqual(R.resolveIntent('warum ist das gewicht schlecht fuer mich?', S4), null);
  assert.strictEqual(R.resolveIntent('warum ist das gewicht gut fuer meinen ruecken?', S4), null);
});

test('Erlaubnisliste: die bekannten Ganzformen bleiben lokal beantwortet', () => {
  // Diese Liste IST die Spezifikation der beiden Ausnahmen. Faellt hier eine
  // Form weg, ist die Verengung zu weit gegangen.
  assert.strictEqual(R.resolveIntent('wie soll ich mich aufwaermen?', S20).intent, 'warmup');
  assert.strictEqual(R.resolveIntent('how should i warm up?', S20).intent, 'warmup');
  ['warum dieses gewicht?', 'wie kommst du auf das gewicht?', 'why this weight?']
    .forEach(q => assert.strictEqual(R.resolveIntent(q, S4) && R.resolveIntent(q, S4).intent,
                                     'weightWhy', 'verloren: ' + q));
  assert.strictEqual(R.resolveIntent('warum 62,5?', S4).intent, 'weightWhy');
  assert.strictEqual(R.resolveIntent('warum 60?', S60).intent, 'weightWhy');
  assert.strictEqual(R.resolveIntent('warum sind es heute 60 kg?', S60).intent, 'weightWhy');
});

test('Minor: vier legitime Fragen gehen nicht mehr unnoetig ans Modell', () => {
  // Fehlblocks aus der Task-3-Verschaerfung: je ein fehlendes Wort im zweiten
  // Signal bzw. eine Ganzform. Die zugehoerigen Negativfaelle stehen
  // unmittelbar danach und muessen weiter null liefern.
  assert.strictEqual(R.resolveIntent('wie viele male habe ich diese woche trainiert?', S20).intent, 'weekProgress');
  assert.strictEqual(R.resolveIntent('wie lange bin ich im schnitt im gym?', S20).intent, 'avgDuration');
  assert.strictEqual(R.resolveIntent('habe ich einen supersatz?', S20).intent, 'superset');
  assert.strictEqual(R.resolveIntent('was war gestern?', S20).intent, 'yesterday');
  // Gegenprobe: die Gates duerfen dadurch nicht aufweichen.
  assert.strictEqual(R.resolveIntent('wie viele tage hat diese woche?', S20), null);
  assert.strictEqual(R.resolveIntent('wie lange sollte ein durchschnittlicher satz dauern?', S20), null);
  assert.strictEqual(R.resolveIntent('was ist ein supersatz?', S20), null);
  assert.strictEqual(R.resolveIntent('was war gestern im fernsehen?', S20), null);
});
