/* GymTrack — Intent-Router (Baustein 3)
   Beantwortet haeufige Gym-Fragen aus lokalen Daten, ohne LLM-Aufruf.
   Bekommt einen fertigen Datenschnappschuss statt globaler App-Variablen —
   dadurch ohne Browser testbar und nicht an interne Strukturen gebunden. */
(function (root) {
  'use strict';

  // Ein Treffer verlangt ein eindeutiges Muster UND vorhandene Daten. Alles
  // Wertende, Planende oder Medizinische geht bewusst ans Modell.
  var BLOCK = /(plan|programm|schmerz|weh|verletz|zwick|lieber|besser|sollte ich|soll ich|meinst du|warum|erklaer|hurts|pain|should i)/;

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

    // 1) Naechstes Gewicht
    // "naechste[nsr]? satz" darf nur zusammen mit einem Gewichtswort feuern —
    // sonst matchen auch Fragen zur Uebungswahl oder zu Wiederholungen, die
    // konfident (aber falsch) mit einem Gewicht beantwortet wuerden.
    if (/(wie viel|wieviel|welches) gewicht|gewicht.*naechste[nsr]? satz|naechste[nsr]? satz.*gewicht|how much weight/.test(q)) {
      if (s.active && s.active.nextW != null) {
        return { intent: 'nextWeight', answer: 'Nächster Satz: ' + num(s.active.nextW) + ' kg.' };
      }
      return null;
    }

    // 2) Rekord
    if (/rekord|bestleistung|bester satz|bestes satz|personal best|record/.test(q)) {
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

    // 4) Restpause
    if (/pause|rest timer|how long.*rest/.test(q)) {
      if (!s.restLeftSec) return null;
      return { intent: 'rest', answer: 'Noch ' + s.restLeftSec + ' Sekunden Pause.' };
    }

    // 5) Erholung
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

    // 7) Wochenvolumen
    if (/volumen|volume|tonnage/.test(q)) {
      if (s.weekVolumeKg == null) return null;
      return { intent: 'volume', answer: 'Diese Woche ' + num(s.weekVolumeKg) + ' kg Gesamtvolumen.' };
    }

    // 8) Was steht heute an
    if (/heute an|heute dran|was mache ich heute|whats on today/.test(q)) {
      if (!s.todayText) return null;
      return { intent: 'today', answer: s.todayText };
    }

    return null;
  }

  var API = { resolveIntent: resolveIntent };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachIntent = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
