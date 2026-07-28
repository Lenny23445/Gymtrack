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

  function resolveIntent(text, snap) {
    var q = norm(text);
    if (!q) return null;
    if (BLOCK.test(q)) return null;
    var s = snap || {};

    // 1) Naechstes Gewicht -- "gewicht"/"weight" allein ist z.B. auch eine
    // Frage zum Koerpergewicht/Abnehmen. Gate: braucht zusaetzlich einen
    // "naechster Satz"-Bezug, sonst kein Treffer.
    if (two(q, /gewicht|weight/, /naechste[nsr]? satz|next set/)) {
      if (s.active && s.active.nextW != null) {
        return { intent: 'nextWeight', answer: 'Nächster Satz: ' + num(s.active.nextW) + ' kg.' };
      }
      return null;
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

    // 6) Letzte Ausfuehrung
    if (/zuletzt|letztes mal|last time|wann hatte ich/.test(q)) {
      var ex2 = findExercise(q, s.exercises);
      if (!ex2) return null;
      var d = (s.lastDone || {})[ex2.id];
      if (!d) return null;
      return { intent: 'lastDone', answer: ex2.name + ' zuletzt am ' + datum(d) + '.' };
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

    return null;
  }

  var API = { resolveIntent: resolveIntent };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachIntent = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
