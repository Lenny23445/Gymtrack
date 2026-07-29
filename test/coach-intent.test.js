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

test('Krankheitswort beendet den Router (Umkehr des BLOCK-Rueckbaus)', () => {
  // UMGEDREHT in Re-Review 3. Dieser Test erwartete bis dahin 'setsLeft': ein
  // Krankheitswort sollte einen fachfremden Intent NICHT blockieren, damit
  // eine harmlose Frage keinen Modellaufruf kostet. Diese Optimierung auf
  // Bequemlichkeit hat fuenf Reviewrunden lang dieselbe Fehlerklasse offen
  // gehalten -- irgendein Intent beantwortete eine Gesundheitsfrage lokal
  // ("darf ich diese woche mit fieber trainieren?" -> "Diese Woche 3 von 4
  // Einheiten."), und jede Runde schloss nur die Saetze, die zufaellig im
  // Bericht standen. Entscheidung des Nutzers: die Sicherheitseigenschaft
  // gewinnt gegen die Bequemlichkeit. Ab jetzt beendet JEDES Gesundheits-
  // signal den Router vor ALLEN Intents (globales Gate, siehe Kopf von
  // js/coach-intent.js).
  //
  // DER PREIS steht genau hier im Test: diese Frage ist harmlos, ihre
  // Satzzahl waere lokal beantwortbar -- sie kostet ab jetzt einen
  // Modellaufruf. Das ist gewollt und der einzige bekannte Preis. Wer den
  // Test spaeter zurueckdreht, oeffnet die Fehlerklasse wieder.
  assert.strictEqual(R.resolveIntent('Ich bin erkaeltet, wie viele Saetze noch?', SNAP), null);
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

// --- Re-Review 2: drei im selben Commit aufgeweichte Gates ------------------
// Derselbe Commit, der die beiden Vorab-Ausnahmen auf Erlaubnislisten
// umgestellt hat, hat gleichzeitig drei Intent-Gates geweitet, um Bequemlich-
// keits-Minors zu schliessen. Alle Saetze hier lieferten am Stand davor null
// und danach eine konfidente lokale Antwort -- dieselbe Schadensform, gegen
// die die ganze Runde lief, nur in anderen Intents.

test('Leck 1: Erlaubnis- und Krankheitsfragen sind kein Wochenfortschritt', () => {
  // "trainier" als zweites Signal bei Intent 10. krank/fieber/schwanger stehen
  // bewusst nicht in BLOCK, und medical() gilt nur fuer die zwei Vorab-
  // Ausnahmen -- hier greift also gar kein Schutz ausser dem Gate selbst.
  ['darf ich diese woche trainieren obwohl ich krank bin?',
   'kann ich mit fieber diese woche trainieren?',
   'ich bin schwanger, kann ich diese woche trainieren?',
   'ich bin schwanger, kann ich diese woche noch trainieren?',
   'ist es schlimm wenn ich diese woche nicht trainiere?',
   'wie oft muss man in der woche trainieren?'
  ].forEach(q => assert.strictEqual(R.resolveIntent(q, S20), null, 'nicht abgegeben: ' + q));
});

test('Leck 2: das Gym als ORT ist keine Frage nach der eigenen Trainingsdauer', () => {
  // "\bgym\b" als zweites Signal bei Intent 12. Das Gym ist als Ort Gegenstand
  // vieler Fragen, die mit der eigenen Trainingsdauer nichts zu tun haben --
  // exakt die W4-Fehlerklasse, die derselbe Kommentarblock geschlossen erklaert.
  ['wie lange ist das gym im schnitt geoeffnet?',
   'wie voll ist das gym im durchschnitt?',
   'wie weit ist der durchschnittliche weg zum gym?'
  ].forEach(q => assert.strictEqual(R.resolveIntent(q, S20), null, 'nicht abgegeben: ' + q));
});

test('Leck 3: "habe ich" ist kein Bezug auf den laufenden Supersatz', () => {
  // "hab(e)? ich" als zweites Signal bei Intent 9 -- ein Allerweltshilfsverb,
  // kein Besitzbezug. Beantwortet die Wissensfrage mit dem laufenden Partner,
  // also genau die W5-Fehlerklasse, fuer die das Gate gebaut wurde.
  ['welche nachteile habe ich bei supersaetzen?',
   'was habe ich davon wenn ich supersaetze mache?'
  ].forEach(q => assert.strictEqual(R.resolveIntent(q, S20), null, 'nicht abgegeben: ' + q));
});

test('die vier Minor-Treffer der Vorrunde bleiben trotz geschlossener Lecks lokal', () => {
  // Gegenprobe zu den drei Tests darueber: das Schliessen darf die vier
  // Fragen nicht mitnehmen, fuer die die Signale ueberhaupt geweitet wurden.
  assert.strictEqual(R.resolveIntent('wie viele male habe ich diese woche trainiert?', S20).intent, 'weekProgress');
  assert.strictEqual(R.resolveIntent('wie lange bin ich im schnitt im gym?', S20).intent, 'avgDuration');
  assert.strictEqual(R.resolveIntent('habe ich einen supersatz?', S20).intent, 'superset');
  assert.strictEqual(R.resolveIntent('was war gestern?', S20).intent, 'yesterday');
});

// --- Re-Review 2: Trefferquote der beiden Erlaubnislisten -------------------
// Die Verankerung ist der richtige Mechanismus, war aber zu eng geraten: von
// 40 natuerlichen Formulierungen loesten nur noch 12 aus (30 %). Ursachen:
// fehlende Fuellwoerter, gar keine fuehrende Interjektion, "kilo"/"kg" als
// eigenstaendiges Gewichts-Signal ersatzlos entfallen -- und beim Aufwaermen
// fehlte die im Deutschen haeufigste Form ueberhaupt, das trennbare Verb
// ("wie waerme ich mich auf?"), die in KEINEM Stand je griff.

test('Erlaubnisliste Aufwaermen: natuerliche Formulierungen loesen wieder aus', () => {
  ['wie soll ich mich aufwärmen?',
   'wie aufwärmen?',
   'wie soll ich mich am besten aufwärmen?',
   'wie soll ich mich vorher aufwärmen?',
   'womit soll ich mich aufwärmen?',
   'how do i warm up?',
   // ab hier die vom Re-Review verworfenen Formen
   'wie wärme ich mich auf?',
   'sag mal, wie wärme ich mich am besten auf?',
   'wie mache ich mich warm?',
   'wie wärm ich mich auf',
   'hey, wie soll ich mich aufwärmen?',
   'was soll ich zum aufwärmen machen?',
   'wie aufwärmen für bankdrücken?',
   'wie soll ich mich aufwärmn?',
   'aufwärmen?',
   'how to warm up?',
   'how should i warm up today?',
   'whats a good warm up?',
   'wie sieht mein aufwärmen aus?',
   'gib mir ein aufwärmen'
  ].forEach(q => {
    const r = R.resolveIntent(q, S20);
    assert.strictEqual(r && r.intent, 'warmup', 'nicht erkannt: ' + q);
    assert.ok(r.answer.includes('20 kg'), 'falsche Antwort fuer: ' + q);
  });
});

test('Erlaubnisliste Gewicht: natuerliche Formulierungen loesen wieder aus', () => {
  [['warum dieses gewicht?', S4],
   ['warum genau das gewicht?', S4],
   ['wieso 62,5 kg?', S4],
   ['wie kommst du auf das gewicht?', S4],
   ['why this weight?', S4],
   ['why 62.5 kg?', S4],
   // ab hier die vom Re-Review verworfenen Formen
   ['warum gerade dieses gewicht?', S4],
   ['warum ausgerechnet dieses gewicht?', S4],
   ['hey warum dieses gewicht?', S4],
   ['sag mal, warum dieses gewicht?', S4],
   ['und warum dieses gewicht?', S4],
   ['warum schlägst du das gewicht vor?', S4],
   ['wieso empfiehlst du 62,5?', S4],
   ['warum steht da 62,5?', S4],
   ['warum das gewicht heute?', S4],
   ['warum diese kilos?', S4],
   ['warum wieder das gleiche gewicht?', S4],
   ['warum ist das gewicht so hoch?', S4],
   ['warum nur 62,5?', S4],
   ['warum so viel gewicht?', S4]
  ].forEach(([q, snap]) => {
    const r = R.resolveIntent(q, snap);
    assert.strictEqual(r && r.intent, 'weightWhy', 'nicht erkannt: ' + q);
    assert.ok(r.answer.includes('62,5'), 'falsche Antwort fuer: ' + q);
  });
});

test('Weitung bricht die Verankerung nicht: die Angriffssaetze bleiben beim Modell', () => {
  // Zehn Aufwaerm- und neun Gewichtssaetze aus beiden Reviewberichten. Keins
  // der Woerter krampfanfall/betablocker/bandscheibenvorfall/trimester/
  // herzinfarkt steht in MED_HARD -- sie werden von der Verankerung gefangen,
  // nicht von Vokabular. Genau diese Ausfallrichtung darf die Weitung nicht
  // umdrehen.
  ['ich bin schwanger, wie soll ich mich aufwärmen?',
   'mir ist schwindelig, wie soll ich mich aufwärmen?',
   'nach meinem herzinfarkt, wie soll ich mich aufwärmen?',
   'ich hab asthma, wie aufwärmen?',
   'mein bizeps ist überdehnt, wie aufwärmen?',
   'meine schulter tut weh, wie soll ich mich aufwärmen?',
   'ich hatte gestern einen krampfanfall, wie soll ich mich aufwärmen?',
   'ich nehme betablocker, wie soll ich mich aufwärmen?',
   'mit meinem bandscheibenvorfall wie soll ich mich aufwärmen?',
   'ich bin im ersten trimester, wie soll ich mich aufwärmen?'
  ].forEach(q => assert.strictEqual(R.resolveIntent(q, S20), null, 'nicht abgegeben: ' + q));

  assert.strictEqual(R.resolveIntent('warum knackt es bei 60 kg?', S60), null);
  ['warum wird mir übel bei dem gewicht?',
   'warum ist das gewicht so ungesund?',
   'warum ist das gewicht bei meiner arthrose ok?',
   'warum ist das gewicht schlecht für mich?',
   'warum ist das gewicht gut für meinen rücken?',
   'warum ist das gewicht bei schwangerschaft ok?',
   'warum ist das gewicht trotz meiner herzschwäche ok?',
   'warum wird mir schwindelig bei dem gewicht?'
  ].forEach(q => assert.strictEqual(R.resolveIntent(q, S4), null, 'nicht abgegeben: ' + q));
});

test('Minor: die vorgeschlagene Zahl ohne Trennzeichen ist kein Gewichtssignal', () => {
  // numSig baute aus 62.5 das Muster "62 ?5" -- das Leerzeichen war optional,
  // also matchte auch "warum 625". norm() macht aus 62,5 und 62.5 IMMER "62 5",
  // das Leerzeichen ist deshalb Pflicht; vorne zusaetzlich eine Wortgrenze.
  assert.strictEqual(R.resolveIntent('warum 625?', S4), null);
  assert.strictEqual(R.resolveIntent('warum 605?', S60), null);
  // Gegenprobe: die echten Formen bleiben.
  assert.strictEqual(R.resolveIntent('warum 62,5?', S4).intent, 'weightWhy');
  assert.strictEqual(R.resolveIntent('warum 62.5 kg?', S4).intent, 'weightWhy');
});

// --- Fund bei Pruefung des letzten Commits: uebersehenes Alltagswort --------
// "training" stand im Zweitsignal von Intent 10 als BARES Wort (Teilstring-
// Match) -- anders als "trainiert"/"trainieren" (Leck 1 oben), die "training"
// gar nicht als Teilstring enthalten. "ins training"/"im training" treffen
// "training" trivial. Dieselbe Schadensform wie die drei Lecks oben, nur
// unentdeckt, weil kein bisheriger Testsatz "training" als eigenstaendiges
// Wort im Satz hatte. Der Befund liegt seit dem urspruenglichen Bau des
// Intents so vor, nicht erst seit dem letzten Commit.
test('Leck 4: Krankheits-/Erlaubnisfragen mit dem Wort "Training" sind kein Wochenfortschritt', () => {
  ['darf ich diese woche mit fieber ins training?',
   'darf ich mit fieber diese woche ins training?',
   'kann ich krank ins training diese woche?',
   'ich bin schwanger, darf ich diese woche ins training?'
  ].forEach(q => assert.strictEqual(R.resolveIntent(q, S20), null, 'nicht abgegeben: ' + q));
});

// --- Re-Review 3: EINE Stelle statt zwoelf ---------------------------------
// Fuenf Runden lang wurde dieselbe Fehlerklasse gefunden (eine Frage mit
// Gesundheitsbezug bekommt eine lokale Konservenantwort) und fuenf Mal
// punktuell geschlossen: ein Signalwort raus, eine Ganzform rein. Die naechste
// Formulierung fand die naechste Luecke. Ab hier steht ein GLOBALES
// Gesundheits-Gate vor ALLEN Intents -- traegt die Frage irgendwo ein
// Krankheits-, Beschwerde-, Schwangerschafts-, Medikamenten- oder
// Behandlungssignal, antwortet der Router gar nicht mehr.

test('Gesundheits-Gate: Krankheitsfragen bekommen in KEINEM Intent eine lokale Antwort', () => {
  // Alle neun standen im Reviewbericht mit ihrer falschen lokalen Antwort.
  // Sie verteilen sich auf drei verschiedene Intents (10, 12, 13) -- genau
  // deshalb reicht kein weiteres Signalwort weniger an einer Stelle.
  ['darf ich diese woche noch eine einheit machen wenn ich fieber habe?',
   'kann ich diese woche trotz grippe eine einheit machen?',
   'darf ich diese woche ein workout machen obwohl ich krank bin?',
   'ist es ok diese woche eine session zu machen wenn ich schwanger bin?',
   'ich hab diese woche nichts geschafft weil ich krank war',
   'ist es im schnitt gefaehrlich mit fieber zu trainieren?',
   'wie lange sollte man im schnitt mit einer erkaeltung trainieren?',
   'war ich gestern zu krank fuers training?',
   'durfte ich gestern mit fieber ins training?'
  ].forEach(q => assert.strictEqual(R.resolveIntent(q, S20), null, 'nicht abgegeben: ' + q));
});

test('Gesundheits-Gate: die Meldung im NACHSATZ zaehlt genauso wie im Vorsatz', () => {
  // Dieselben Meldungen wie in der bewachten 19er-Angriffsliste, nur hinter
  // der Aufwaermfrage statt davor. Die Testliste bewachte bisher
  // ausschliesslich die Praefix-Stellung, deshalb blieb das 13 Saetze lang
  // unentdeckt. herzinfarkt/schwanger/trimester/betablocker/krampfanfall/
  // asthma standen dafuer bis hierher in KEINER Liste.
  ['wie soll ich mich aufwaermen fuer die brust nach meinem herzinfarkt?',
   'wie soll ich mich aufwaermen fuer bankdruecken, ich bin schwanger?',
   'wie soll ich mich aufwaermen fuer die brust, ich bin schwanger',
   'wie aufwaermen fuer beine obwohl ich asthma habe?',
   'wie aufwaermen fuer kniebeuge waehrend ich betablocker nehme?',
   'wie soll ich mich aufwaermen fuer die beine, ich nehme betablocker',
   'wie aufwaermen fuer die brust wenn ich im ersten trimester bin?',
   'wie waerme ich mich auf fuer die brust, ich bin im ersten trimester',
   'wie aufwaermen fuer das bankdruecken nach meinem krampfanfall?',
   'wie aufwaermen fuer den ruecken, mir ist schwindelig?',
   'wie aufwaermen fuer meine steife schulter?',
   'wie aufwaermen fuer meine operierte schulter?',
   'how to warm up for chest after my heart attack?'
  ].forEach(q => assert.strictEqual(R.resolveIntent(q, S20), null, 'nicht abgegeben: ' + q));
});

test('Critical: der Nachsatz muss ein Ziel SEIN, nicht eines enthalten', () => {
  // warmupCore() prueft mit MUSCLE/findExercise nur, ob der Nachsatz ein
  // Zielwort ENTHAELT. Damit schnitt ein beliebig langer Nachsatz weg, sobald
  // irgendwo ein Muskel- oder Uebungsname darin stand -- die Verankerung war
  // nach hinten offen. Keiner dieser vier Saetze ist medizinisch: sie messen
  // die Verankerung selbst, nicht die Sperrliste dahinter (genau der Fehler
  // des vorigen Fixbelegs, der 'entzuendete schulter' als Beweis nahm und
  // damit MED_HARD gemessen hat).
  ['wie aufwaermen fuer die brust nach dem urlaub?',
   'wie aufwaermen fuer bankdruecken bei meinem kumpel im keller?',
   'wie aufwaermen fuer die beine und was mache ich danach?',
   'wie soll ich mich aufwaermen fuer die arme meiner freundin?'
  ].forEach(q => assert.strictEqual(R.resolveIntent(q, S20), null, 'nicht abgegeben: ' + q));
});

test('Critical-Gegenprobe: das echte Ziel am Satzende bleibt erkannt', () => {
  ['wie aufwaermen fuer bankdruecken?',
   'wie aufwaermen fuer die brust?',
   'wie aufwaermen fuer meine beine?',
   'wie soll ich mich aufwaermen fuer kniebeuge?'
  ].forEach(q => {
    const r = R.resolveIntent(q, S20);
    assert.strictEqual(r && r.intent, 'warmup', 'verloren: ' + q);
  });
});

test('Important: die Koerpergewicht-Lesart ist keine Begruendung des Hantelgewichts', () => {
  // "mein|my" in fill plus "hoch|high" in tail haben die Frage, gegen die
  // BODYWEIGHT ausdruecklich gebaut ist, wieder in die Ganzform gelassen --
  // der Coach erklaerte die Hantel-Progression auf eine Waage-Frage. Alle
  // drei waren am Stand 7c92fd7 noch null.
  assert.strictEqual(R.resolveIntent('warum ist mein gewicht so hoch?', S4), null);
  assert.strictEqual(R.resolveIntent('why is my weight so high?', S4), null);
  assert.strictEqual(R.resolveIntent('warum so viel kilos?', S4), null);
  // Gegenprobe: die drei benachbarten Formen aus der 40er-Liste bleiben.
  assert.strictEqual(R.resolveIntent('warum ist das gewicht so hoch?', S4).intent, 'weightWhy');
  assert.strictEqual(R.resolveIntent('warum so viel gewicht?', S4).intent, 'weightWhy');
  assert.strictEqual(R.resolveIntent('warum diese kilos?', S4).intent, 'weightWhy');
});

test('Important: das Gym als ORT ist auch keine Frage nach der gestrigen Einheit', () => {
  // "\bgym\b" wurde in Runde 2 aus Intent 12 entfernt, weil das Gym als ORT
  // Gegenstand vieler Fragen ist, die mit dem eigenen Training nichts zu tun
  // haben -- und stand in Intent 13 unveraendert weiter drin, mit exakt
  // demselben Effekt. Kein Gesundheitssignal, das Gate faengt es also nicht.
  ['wie lange war das gym gestern offen?',
   'wie voll war das gym gestern?',
   'wie war das wetter gestern beim training in der stadt?'
  ].forEach(q => assert.strictEqual(R.resolveIntent(q, S20), null, 'nicht abgegeben: ' + q));
});

test('Important-Gegenprobe: die eigene gestrige Einheit bleibt lokal', () => {
  ['was war gestern?',
   'was habe ich gestern gemacht?',
   'wie war mein training gestern?',
   'wie lange war ich gestern im gym?'
  ].forEach(q => assert.strictEqual(R.resolveIntent(q, S20) && R.resolveIntent(q, S20).intent,
                                    'yesterday', 'verloren: ' + q));
});

test('Minor: WEEK_COUNT kennt die sechs gelaeufigen Wochen-Zaehlformen wieder', () => {
  // Die Ganzform war enger als das Signal, das sie ersetzt hat: Praeteritum,
  // "hab ich" (inkonsistent zu WEEK_TRAINED, das "habe|hab" kennt), Nachlauf
  // "gemacht", "waren das", "in dieser woche" und "wie oft war ich ... im
  // training" fielen alle raus. Kein falscher Wert, nur Modellaufrufe.
  ['wie viele trainings hatte ich diese woche?',
   'wie viele trainings hab ich diese woche?',
   'wie viele trainings habe ich diese woche gemacht?',
   'wie viele trainings waren das diese woche?',
   'wie viele trainings in dieser woche?',
   'wie oft war ich diese woche im training?'
  ].forEach(q => assert.strictEqual(R.resolveIntent(q, S20) && R.resolveIntent(q, S20).intent,
                                    'weekProgress', 'nicht erkannt: ' + q));
  // Gegenprobe: die Weitung darf die Mengenfrage nicht wieder hereinholen.
  assert.strictEqual(R.resolveIntent('wie viele tage hat diese woche?', S20), null);
  assert.strictEqual(R.resolveIntent('wie viele kalorien habe ich diese woche verbrannt?', S20), null);
});

// --- Blockabschluss-Review Block 0, Befund 3: Einheiten-Bewusstsein --------
// snap.nextSetText war bisher das einzige einheitenbewusste Feld (gebaut mit
// kgToDisp()+unitLabel() in index.html) -- alle anderen Router-Antworten
// haengten ' kg' hart an, auch im lbs-Modus. Das Modul rechnet selbst NICHTS
// um (es kennt S/S.unitMode nicht): s.unit traegt schon die fertige
// Anzeigeeinheit ('kg'|'lbs'), die eigentliche kg->lbs-Umrechnung passiert in
// _coachSnap() (index.html), NICHT hier. Fehlt s.unit, gilt 'kg' -- deshalb
// duerfen SNAP/S20/S4 oben (kein unit-Feld) unveraendert gruen bleiben.

const SNAP_LBS = {
  ...SNAP,
  unit: 'lbs',
  active: { ...SNAP.active, nextW: 181.5 },
  bestSet: { ex1: { w: 176, r: 8, date: '2026-07-20' } },
};

test('naechstes Gewicht traegt im lbs-Modus die lbs-Beschriftung', () => {
  const r = R.resolveIntent('wie viel gewicht beim naechsten satz?', SNAP_LBS);
  assert.strictEqual(r && r.intent, 'nextWeight');
  assert.ok(r.answer.includes('181,5 lbs'), 'lbs-Zahl fehlt: ' + r.answer);
  assert.ok(!r.answer.includes('kg'), 'kg haengt noch dran: ' + r.answer);
});

test('Rekord traegt im lbs-Modus die lbs-Beschriftung', () => {
  const r = R.resolveIntent('was ist mein rekord bei bankdruecken?', SNAP_LBS);
  assert.strictEqual(r && r.intent, 'best');
  assert.ok(r.answer.includes('176 lbs'), 'lbs-Zahl fehlt: ' + r.answer);
  assert.ok(!r.answer.includes(' kg'), 'kg haengt noch dran: ' + r.answer);
});

const S20_LBS = {
  ...S20,
  unit: 'lbs',
  weekVolumeKg: 27500,
  muscleVolume: { brust: 10600, ruecken: 11500 },
  lastPrKg: 226,
};

test('Wochenvolumen traegt im lbs-Modus die lbs-Beschriftung', () => {
  const r = R.resolveIntent('wie viel volumen diese woche?', S20_LBS);
  assert.strictEqual(r && r.intent, 'volume');
  assert.ok(r.answer.includes('27.500 lbs'), 'lbs-Zahl fehlt: ' + r.answer);
  assert.ok(!r.answer.includes(' kg'), 'kg haengt noch dran: ' + r.answer);
});

test('Muskelvolumen traegt im lbs-Modus die lbs-Beschriftung', () => {
  const r = R.resolveIntent('wie viel volumen brust diese woche?', S20_LBS);
  assert.strictEqual(r && r.intent, 'muscleVolume');
  assert.ok(r.answer.includes('10.600 lbs'), 'lbs-Zahl fehlt: ' + r.answer);
  assert.ok(!r.answer.includes(' kg'), 'kg haengt noch dran: ' + r.answer);
});

test('letzter PR traegt im lbs-Modus die lbs-Beschriftung', () => {
  const r = R.resolveIntent('wann hatte ich zuletzt einen pr?', S20_LBS);
  assert.strictEqual(r && r.intent, 'lastPr');
  assert.ok(r.answer.includes('226 lbs'), 'lbs-Zahl fehlt: ' + r.answer);
  assert.ok(!r.answer.includes(' kg'), 'kg haengt noch dran: ' + r.answer);
});

const WR_LBS = {
  exName: 'Bankdrücken', fromKg: 132, toKg: 137.5, stepKg: 5,
  reason: 'repsHigh', lastReps: [8, 8, 8], repRange: [6, 8], ciFactor: 1,
};
const S4_LBS = { ...S20_LBS, weightReason: WR_LBS };

test('Gewichtsbegruendung traegt im lbs-Modus die lbs-Beschriftung', () => {
  const r = R.resolveIntent('warum 137,5?', S4_LBS);
  assert.strictEqual(r && r.intent, 'weightWhy');
  assert.ok(r.answer.includes('137,5 lbs'), 'Zielgewicht in lbs fehlt: ' + r.answer);
  assert.ok(r.answer.includes('5 lbs'), 'Schrittweite in lbs fehlt: ' + r.answer);
  assert.ok(!r.answer.includes(' kg'), 'kg haengt noch dran: ' + r.answer);
});

test('Gegenprobe: dieselben sechs Antworten bleiben ohne s.unit unveraendert kg', () => {
  // SNAP/S20/S4 tragen bewusst kein unit-Feld -- der bestehende kg-Fall darf
  // durch die neue Formatierung NICHT aufgeweicht werden.
  assert.ok(R.resolveIntent('wie viel gewicht beim naechsten satz?', SNAP).answer.includes('82,5 kg'));
  assert.ok(R.resolveIntent('was ist mein rekord bei bankdruecken?', SNAP).answer.includes('80 kg'));
  assert.ok(R.resolveIntent('wie viel volumen diese woche?', SNAP).answer.includes('12.500 kg'));
  assert.ok(R.resolveIntent('wie viel volumen brust diese woche?', S20).answer.includes('4.800 kg'));
  assert.ok(R.resolveIntent('wann hatte ich zuletzt einen pr?', S20).answer.includes('102,5 kg'));
  assert.ok(R.resolveIntent('warum 62,5?', S4).answer.includes('62,5 kg'));
  assert.ok(R.resolveIntent('warum 62,5?', S4).answer.includes('2,5 kg'));
});

// --- Router-i18n: Antworten in der Sprache des Nutzers ----------------------
// s.lang traegt die aufgeloeste Anzeigesprache ('de'|'en'), GENAU wie s.unit
// ('kg'|'lbs') zwei Reviewrunden vorher: index.html (_coachSnap()) setzt sie
// aus GT_LANG, das Modul liest niemals localStorage selbst. Fehlt s.lang
// (jeder Snapshot oben in dieser Datei), bleibt der bisherige deutsche Text
// exakt erhalten -- keiner der Tests oberhalb dieser Zeile wurde angefasst.
//
// Fragesprache und Antwortsprache sind ZWEI verschiedene Dinge: die Muster
// erkennen ohnehin schon beide Sprachen (das war schon vor diesem Task so),
// s.lang entscheidet ausschliesslich, in welcher Sprache geantwortet wird.
// Ein paar Tests nutzen deshalb bewusst eine deutsche Frage mit lang:'en' --
// genau der Fall eines Geraets auf Englisch, das trotzdem mal deutsch tippt,
// und bei Intent 15 (Planliste) der EINZIGE moegliche Fall: dafuer gibt es gar
// kein englisches Muster (siehe Kommentar am Intent), die Antwortsprache haengt
// dort ausschliesslich an s.lang, nie an der Fragesprache.

test('naechstes Gewicht antwortet englisch', () => {
  const r = R.resolveIntent("what's the weight for the next set?", { ...SNAP, lang: 'en' });
  assert.strictEqual(r && r.intent, 'nextWeight');
  assert.strictEqual(r.answer, 'Next set: 82.5 kg.');
});

test('Rekord antwortet englisch', () => {
  const r = R.resolveIntent("what's my personal best on bankdruecken?", { ...SNAP, lang: 'en' });
  assert.strictEqual(r && r.intent, 'best');
  assert.strictEqual(r.answer, 'Bankdruecken: 80 kg for 8 reps, on 20.07.2026.');
});

test('verbleibende Saetze antworten englisch, Singular und Plural', () => {
  const r = R.resolveIntent('how many sets are left in my workout?', { ...SNAP, lang: 'en' });
  assert.strictEqual(r && r.intent, 'setsLeft');
  assert.strictEqual(r.answer, '3 sets left.');

  const snapOne = { ...SNAP, lang: 'en', active: { ...SNAP.active, setsTotal: 3, setsDone: 2 } };
  const r1 = R.resolveIntent('how many sets are left in my workout?', snapOne);
  assert.strictEqual(r1.answer, '1 set left.', 'Singular "1 set left." falsch gebildet');
});

test('Restpause antwortet englisch', () => {
  const r = R.resolveIntent('how long is my rest?', { ...SNAP, lang: 'en' });
  assert.strictEqual(r && r.intent, 'rest');
  assert.strictEqual(r.answer, '45 seconds of rest left.');
});

test('Erholung antwortet englisch', () => {
  const r = R.resolveIntent('how recovered is my brust?', { ...SNAP, lang: 'en' });
  assert.strictEqual(r && r.intent, 'recovery');
  assert.strictEqual(r.answer, 'Brust is 92% recovered.');
});

test('letzter PR antwortet englisch, inklusive heute/gestern/vor-N-Tagen', () => {
  const r = R.resolveIntent('when was my last pr?', { ...S20, lang: 'en' });
  assert.strictEqual(r && r.intent, 'lastPr');
  assert.strictEqual(r.answer, 'Latest PR: Kniebeuge at 102.5 kg, 6 days ago.');

  const rToday = R.resolveIntent('when was my last pr?', { ...S20, lang: 'en', lastPrDaysAgo: 0 });
  assert.ok(rToday.answer.includes('today'), 'lastPrDaysAgo=0 muss "today" ergeben: ' + rToday.answer);
  const rYest = R.resolveIntent('when was my last pr?', { ...S20, lang: 'en', lastPrDaysAgo: 1 });
  assert.ok(rYest.answer.includes('yesterday'), 'lastPrDaysAgo=1 muss "yesterday" ergeben: ' + rYest.answer);
});

test('letzte Ausfuehrung antwortet englisch', () => {
  const r = R.resolveIntent('when was the last time i did bankdruecken?', { ...SNAP, lang: 'en' });
  assert.strictEqual(r && r.intent, 'lastDone');
  assert.strictEqual(r.answer, 'Bankdruecken last done on 20.07.2026.');
});

test('Volumen einer Muskelgruppe antwortet englisch', () => {
  const r = R.resolveIntent('how much volume for brust this week?', { ...S20, lang: 'en' });
  assert.strictEqual(r && r.intent, 'muscleVolume');
  assert.strictEqual(r.answer, 'Brust this week 4,800 kg of volume.');
});

test('Wochenvolumen antwortet englisch', () => {
  const r = R.resolveIntent('how much volume this week?', { ...SNAP, lang: 'en' });
  assert.strictEqual(r && r.intent, 'volume');
  assert.strictEqual(r.answer, 'This week 12,500 kg total volume.');
});

test('Wochenfortschritt antwortet englisch', () => {
  const r = R.resolveIntent('how many workouts this week?', { ...S20, lang: 'en' });
  assert.strictEqual(r && r.intent, 'weekProgress');
  assert.strictEqual(r.answer, 'This week 3 of 4 sessions.');
});

test('Streak antwortet englisch, Singular und Plural', () => {
  const r = R.resolveIntent("what's my streak?", { ...S20, lang: 'en' });
  assert.strictEqual(r && r.intent, 'streak');
  assert.strictEqual(r.answer, 'Trained 12 weeks in a row.');

  const r1 = R.resolveIntent("what's my streak?", { ...S20, lang: 'en', streakWeeks: 1 });
  assert.strictEqual(r1.answer, 'Trained 1 week in a row.', 'Singular falsch gebildet');
});

test('durchschnittliche Trainingsdauer antwortet englisch', () => {
  const r = R.resolveIntent("what's my average training duration?", { ...S20, lang: 'en' });
  assert.strictEqual(r && r.intent, 'avgDuration');
  assert.strictEqual(r.answer, 'On average you train 58 minutes.');
});

test('Planliste antwortet englisch (kein englisches Frage-Muster fuer diesen Intent -- s.lang entscheidet allein)', () => {
  // Intent 15 hat bewusst KEIN englisches Frage-Muster (Kommentar im Modul:
  // "plan" steht als Wortstamm absichtlich in BLOCK). Eine deutsche Frage mit
  // lang:'en' ist hier der einzig moegliche Weg, die englische Antwort
  // ueberhaupt zu erreichen -- und belegt zugleich, dass die Antwortsprache
  // wirklich an s.lang haengt, nicht an der Fragesprache.
  const r = R.resolveIntent('welche plaene habe ich?', { ...S20, lang: 'en' });
  assert.strictEqual(r && r.intent, 'planList');
  assert.strictEqual(r.answer, 'Your plans: Push, Pull, Beine.');
});

// --- Gewichtsbegruendung: alle fuenf Zweige englisch -------------------------

test('Gewichtsbegruendung repsHigh antwortet englisch', () => {
  const r = R.resolveIntent('warum 62,5?', { ...S4, lang: 'en' });
  assert.strictEqual(r && r.intent, 'weightWhy');
  assert.ok(r.answer.includes('8/8/8'), 'geschaffte Wiederholungen fehlen: ' + r.answer);
  assert.ok(r.answer.includes('62.5 kg'), 'Zielgewicht fehlt: ' + r.answer);
  assert.ok(r.answer.includes('2.5 kg'), 'Schrittweite fehlt: ' + r.answer);
  assert.ok(/goes up/.test(r.answer), 'Steigerungs-Regel fehlt: ' + r.answer);
  assert.ok(!/Regel|Gewicht|Wiederholungen/.test(r.answer), 'deutscher Rest im Text: ' + r.answer);
});

test('Gewichtsbegruendung repsLow antwortet englisch', () => {
  const s = { ...S4, lang: 'en', weightReason: { ...WR, reason: 'repsLow', toKg: 60, lastReps: [5, 5, 4] } };
  const r = R.resolveIntent('warum 60?', s);
  assert.strictEqual(r && r.intent, 'weightWhy');
  assert.ok(/stays at/.test(r.answer), 'Halte-Regel fehlt: ' + r.answer);
  assert.ok(r.answer.includes('5/5/4'), 'geschaffte Wiederholungen fehlen: ' + r.answer);
});

test('Gewichtsbegruendung checkinUp antwortet englisch', () => {
  const s = { ...S4, lang: 'en', weightReason: { ...WR, reason: 'checkinUp', toKg: 65 } };
  const r = R.resolveIntent('warum 65?', s);
  assert.strictEqual(r && r.intent, 'weightWhy');
  assert.ok(/good recovery/.test(r.answer), 'Check-in-Begruendung fehlt: ' + r.answer);
  assert.ok(r.answer.includes('65 kg'), 'Zielgewicht fehlt: ' + r.answer);
});

test('Gewichtsbegruendung checkinDown antwortet englisch, Prozent korrekt', () => {
  const s = { ...S4, lang: 'en', weightReason: { ...WR, reason: 'checkinDown', toKg: 55, ciFactor: 0.92 } };
  const r = R.resolveIntent('warum 55?', s);
  assert.strictEqual(r && r.intent, 'weightWhy');
  assert.ok(/drops by 8\s?%/.test(r.answer), 'Prozentwert falsch: ' + r.answer);
  assert.ok(!/-\s?8\s?%/.test(r.answer), 'Prozentwert mit gedrehtem Vorzeichen: ' + r.answer);
  assert.ok(/check-?in|recovery/i.test(r.answer), 'Ursache nicht benannt: ' + r.answer);
});

test('Gewichtsbegruendung hold antwortet englisch, behauptet Bereich nicht faelschlich', () => {
  const s = { ...S4, lang: 'en', weightReason: { ...WR, reason: 'hold', toKg: 60, lastReps: [5, 5, 4], repRange: [6, 8] } };
  const r = R.resolveIntent('warum 60?', s);
  assert.strictEqual(r && r.intent, 'weightWhy');
  assert.ok(!/within range/.test(r.answer), 'behauptet faelschlich, die Wdh. laegen im Bereich: ' + r.answer);
  assert.ok(r.answer.includes('5/5/4'), 'geschaffte Wiederholungen fehlen: ' + r.answer);
  assert.ok(r.answer.includes('6–8'), 'Bereich fehlt: ' + r.answer);
  assert.ok(/stays at/.test(r.answer), 'Haltefall nicht benannt: ' + r.answer);
});

test('Gewichtsbegruendung hold antwortet englisch mit "within range", wenn die Wdh. drin lagen', () => {
  const s = { ...S4, lang: 'en', weightReason: { ...WR, reason: 'hold', toKg: 60, lastReps: [7, 7, 6], repRange: [6, 8] } };
  const r = R.resolveIntent('warum 60?', s);
  assert.ok(/within range 6–8/.test(r.answer), 'korrekter Bereichsfall verloren: ' + r.answer);
});

// --- Vollstaendigkeitstest ---------------------------------------------------
// Zaehlt nicht Intents auf einer Liste nach, sondern prueft strukturell: fuer
// jeden textgenerierenden Intent des Moduls muss die englische Antwort (a)
// existieren, (b) nicht leer sein und (c) sich vom deutschen Text unterscheiden.
// Ein vergessener Intent waere hier NICHT einfach abwesend (das kann eine
// Aufzaehlung uebersehen) -- er würde stattdessen mit rEn.answer === rDe.answer
// auffallen, weil ohne Uebersetzung exakt derselbe String zurueckkommt. Genau
// das ist der Fehler, den Baustein 3 App-weit hatte: die Muster erkennen
// Englisch laengst, nur die Antwort blieb hart deutsch.
const WR_TR = { exName: 'Bankdrücken', fromKg: 60, toKg: 62.5, stepKg: 2.5,
                reason: 'repsHigh', lastReps: [8, 8, 8], repRange: [6, 8], ciFactor: 1 };
const S4_TR = { ...S20, weightReason: WR_TR };

const TRANSLATABLE_CASES = [
  ['nextWeight',    "what's the weight for the next set?",        SNAP],
  ['best',          "what's my personal best on bankdruecken?",   SNAP],
  ['setsLeft',      'how many sets are left in my workout?',      SNAP],
  ['rest',          'how long is my rest?',                       SNAP],
  ['recovery',      'how recovered is my brust?',                 SNAP],
  ['lastPr',        'when was my last pr?',                       S20],
  ['lastDone',      'when was the last time i did bankdruecken?', SNAP],
  ['muscleVolume',  'how much volume for brust this week?',       S20],
  ['volume',        'how much volume this week?',                 SNAP],
  ['weekProgress',  'how many workouts this week?',               S20],
  ['streak',        "what's my streak?",                          S20],
  ['avgDuration',   "what's my average training duration?",       S20],
  ['planList',      'welche plaene habe ich?',                    S20],
  ['weightWhy(repsHigh)',    'warum 62,5?', S4_TR],
  ['weightWhy(repsLow)',     'warum 60?',   { ...S4_TR, weightReason: { ...WR_TR, reason: 'repsLow', toKg: 60, lastReps: [5, 5, 4] } }],
  ['weightWhy(checkinUp)',   'warum 65?',   { ...S4_TR, weightReason: { ...WR_TR, reason: 'checkinUp', toKg: 65 } }],
  ['weightWhy(checkinDown)', 'warum 55?',   { ...S4_TR, weightReason: { ...WR_TR, reason: 'checkinDown', toKg: 55, ciFactor: 0.92 } }],
  ['weightWhy(hold)',        'warum 60?',   { ...S4_TR, weightReason: { ...WR_TR, reason: 'hold', toKg: 60, lastReps: [5, 5, 4], repRange: [6, 8] } }],
];

TRANSLATABLE_CASES.forEach(([label, q, snap]) => {
  test('Vollstaendigkeit: ' + label + ' hat eine eigenstaendige englische Antwort', () => {
    const rDe = R.resolveIntent(q, snap);
    const rEn = R.resolveIntent(q, { ...snap, lang: 'en' });
    assert.ok(rDe && rDe.answer, label + ': deutsche Antwort fehlt (Testfall selbst kaputt) fuer: ' + q);
    assert.ok(rEn && rEn.answer, label + ': englische Antwort fehlt (Frage nicht erkannt?) fuer: ' + q);
    assert.strictEqual(rEn.intent, rDe.intent, label + ': lang darf den erkannten Intent nicht aendern');
    assert.notStrictEqual(rEn.answer, rDe.answer,
      label + ': englische Antwort ist identisch mit der deutschen -- vergessene Uebersetzung');
  });
});

// --- Text-Passthrough-Felder: werden NICHT vom Modul uebersetzt -------------
// nextSetText/warmupText/supersetText/yesterdayText/nextPlanDayText/todayText
// kommen bereits fertig aus dem Schnappschuss (index.html baut sie). Das Modul
// reicht sie unveraendert durch, unabhaengig von s.lang -- Uebersetzung dieser
// sechs Felder ist NICHT Aufgabe des Routers, sondern eine eigene Runde in
// index.html.
test('Text-Passthrough-Felder bleiben unveraendert, auch bei lang:"en"', () => {
  const de = R.resolveIntent('was ist mein naechster satz?', S20);
  const en = R.resolveIntent('was ist mein naechster satz?', { ...S20, lang: 'en' });
  assert.strictEqual(en.answer, de.answer);
  assert.strictEqual(en.answer, S20.nextSetText);

  const deY = R.resolveIntent('was habe ich gestern gemacht?', S20);
  const enY = R.resolveIntent('was habe ich gestern gemacht?', { ...S20, lang: 'en' });
  assert.strictEqual(enY.answer, deY.answer);
  assert.strictEqual(enY.answer, S20.yesterdayText);

  const deT = R.resolveIntent('was steht heute an?', S20);
  const enT = R.resolveIntent('was steht heute an?', { ...S20, lang: 'en' });
  assert.strictEqual(enT.answer, deT.answer);
  assert.strictEqual(enT.answer, S20.todayText);
});

test('unbekannter lang-Wert faellt wie fehlendes Feld auf Deutsch zurueck', () => {
  const r = R.resolveIntent('wie viele saetze noch?', { ...SNAP, lang: 'fr' });
  assert.strictEqual(r.answer, 'Noch 3 Sätze.');
});
