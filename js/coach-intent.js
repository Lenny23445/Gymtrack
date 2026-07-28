/* GymTrack — Intent-Router (Baustein 3)
   Beantwortet haeufige Gym-Fragen aus lokalen Daten, ohne LLM-Aufruf.
   Bekommt einen fertigen Datenschnappschuss statt globaler App-Variablen —
   dadurch ohne Browser testbar und nicht an interne Strukturen gebunden. */
(function (root) {
  'use strict';

  // Ein Treffer verlangt ein eindeutiges Muster UND vorhandene Daten. Alles
  // Wertende, Planende oder Medizinische geht bewusst ans Modell. Erweitert um
  // Krankheits-Woerter (siehe Intent 5 im Nachaudit-Report: "erhol" kollidiert
  // sonst mit "ich erhole mich von einer Erkaeltung").
  var BLOCK = /(plan|programm|schmerz|weh|verletz|zwick|krank|erkaelt|fieber|grippe|husten|infekt|sick|flu|lieber|besser|sollte ich|soll ich|meinst du|warum|erklaer|hurts|pain|should i)/;

  // STRUKTURELLES GATE gegen Fehltreffer durch Alltagswoerter: manche
  // Ankerworte sind ausserhalb des Trainingskontexts voellig normale Woerter
  // (gewicht/weight, record, rest/pause, volume, "whats on today"). So ein
  // Wort allein beweist keinen Fitnessbezug. Die Regel: ein doppeldeutiges
  // Ankerwort zaehlt nur zusammen mit einem zweiten, unabhaengigen
  // Fitness-Wort irgendwo im selben Satz (Reihenfolge egal). "two()" ist
  // diese eine Regel an einer Stelle -- jedes betroffene Pattern nutzt sie,
  // statt sich eine eigene Ad-hoc-Absicherung auszudenken. Eindeutige
  // mehrwortige Fachbegriffe (z.B. "wie viele saetze", "was steht heute an")
  // brauchen das Gate nicht, weil sie ausserhalb des Trainings praktisch nie
  // vorkommen.
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
    if (/(wie viele|wieviele)\s+(saetze|satz)|saetze noch|sets left|how many sets/.test(q)) {
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

    // 5) Erholung -- Gate hier ist der Muskelgruppen-Name selbst: er muss im
    // Snapshot vorkommen (echte Nutzerdaten als Beleg), kein zweites
    // Fitness-Wort noetig. Restrisiko siehe Nachaudit-Report ("Brust"/"Beine"
    // sind auch normale Koerperteile ausserhalb des Trainingskontexts).
    if (/erhol|recover|regenerier/.test(q)) {
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
    // Gate: braucht zusaetzlich einen Zeit-/Trainingsbezug. Hinweis: dieser
    // Zweig ist in Produktion aktuell tot, weil der Aufrufer weekVolumeKg nie
    // befuellt (siehe Nachaudit-Report) -- Gate bleibt trotzdem als
    // Verteidigung, falls sich das aendert.
    if (two(q, /volumen|volume|tonnage/, /woche|week|training|gesamt/)) {
      if (s.weekVolumeKg == null) return null;
      return { intent: 'volume', answer: 'Diese Woche ' + num(s.weekVolumeKg) + ' kg Gesamtvolumen.' };
    }

    // 8) Was steht heute an -- die deutschen Wendungen sind ausserhalb des
    // Trainings praktisch unbenutzt. Die generische englische Phrase
    // "whats on today" braucht dagegen zusaetzlich einen Trainingsbezug,
    // sonst z.B. Kino-/TV-Programm-Frage.
    if (/heute an|heute dran|was mache ich heute/.test(q) ||
        two(q, /what.?s on today/, /workout|training|gym/)) {
      if (!s.todayText) return null;
      return { intent: 'today', answer: s.todayText };
    }

    return null;
  }

  var API = { resolveIntent: resolveIntent };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachIntent = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
