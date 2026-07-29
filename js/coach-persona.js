/* GymTrack — Coach-Persona (Baustein 4)
   Name, Ton und die EINE Sprachfabrik fuer alle Coach-Texte.

   Warum an einer Stelle: ohne diesen Punkt behandelte jede spaetere Textstelle
   den Ton selbst, und der Ton liefe je nach Stelle auseinander. Ab hier
   formuliert jeder Baustein ausschliesslich ueber say().

   Reine Logik, kein DOM, keine App-Globals: Persona und Sprache kommen als
   Argument herein. Die Spec schreibt say(key, vars) — den Wrapper _say(key,
   vars), der Persona und Sprache ergaenzt, stellt index.html bereit (Task 7). */
(function (root) {
  'use strict';

  var TONES  = ['ruhig', 'sachlich', 'hart', 'locker'];
  var LEVELS = ['off', 'key', 'full'];
  var PUSH   = ['still', 'normal', 'eng'];

  // Die drei Profile setzen drei Schalter auf einmal. Sie muessen VOLLSTAENDIG
  // sein: fehlt ein Feld, setzt die Verdrahtung das Profil und kippt es im
  // selben Zug auf 'custom', weil ein Wert abweicht.
  var PRESETS = {
    quiet:    { inTraining: 'off',  setFeedback: false, pushLevel: 'still'  },
    balanced: { inTraining: 'key',  setFeedback: true,  pushLevel: 'normal' },
    close:    { inTraining: 'full', setFeedback: true,  pushLevel: 'eng'    }
  };

  // Der Name wird HIER entschaerft, nicht erst an der Renderstelle: er geht
  // auch in Notification-Titel und in den System-Prompt — Stellen, an denen
  // kein esc() sitzt und auch keins hingehoert.
  function safeName(v) {
    var s = String(v == null ? '' : v)
      .replace(/[<>&"'`\\]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 20)
      .trim();
    return s || 'Coach';
  }

  function pick(v, allowed, fallback) {
    return (typeof v === 'string' && allowed.indexOf(v) >= 0) ? v : fallback;
  }

  function personaGet(aiCoach) {
    var a = aiCoach || {};
    return {
      name:        safeName(a.name),
      tone:        pick(a.tone, TONES, 'sachlich'),
      voice:       (typeof a.voice === 'string' && a.voice) ? a.voice : null,
      voiceOn:     a.voiceOn !== false,
      preset:      pick(a.preset, ['quiet', 'balanced', 'close', 'custom'], undefined),
      inTraining:  pick(a.inTraining, LEVELS, 'key'),
      setFeedback: a.setFeedback !== false,
      pushLevel:   pick(a.pushLevel, PUSH, 'normal'),
      insights:    a.insights !== false
    };
  }

  // Zahlformat folgt der Sprache: deutsch Komma, englisch Punkt; Tausender-
  // trennung erst ab vier Stellen. Gleiches Verhalten wie num() in
  // js/coach-intent.js — zwei Coach-Module duerfen nicht verschieden runden.
  function fmt(v, lang) {
    if (typeof v === 'number' && isFinite(v)) {
      return v.toLocaleString(lang === 'en' ? 'en-US' : 'de-DE', { maximumFractionDigits: 1 });
    }
    return String(v);
  }

  // Ein Platzhalter ohne Wert verschwindet SAMT vorangehendem Leerzeichen. Ein
  // sichtbares {kg} im Coach-Satz ist schlimmer als ein etwas duennerer Satz.
  function fill(tpl, vars, lang) {
    var out = String(tpl).replace(/\s*\{([a-z]+)\}/gi, function (m, k) {
      var v = vars ? vars[k] : undefined;
      if (v === undefined || v === null || v === '') return '';
      return ' ' + fmt(v, lang);
    });
    return out.replace(/\s{2,}/g, ' ').trim();
  }

  // ── Satzkatalog ────────────────────────────────────────────────────────
  // 24 Schluessel x 4 Toene x 2 Sprachen. Die Tondefinitionen sind bindend:
  //   ruhig    gelassen, nimmt Last raus, kurze Hauptsaetze, KEIN Ausrufezeichen
  //   sachlich neutraler Beobachter, Zahl vorn, keine Bewertung
  //   hart     fordernd, Imperativ, HOECHSTENS ACHT WOERTER
  //   locker   kumpelhaft, gern als Frage, nie Ironie ueber den Nutzer
  // Vier Toene heissen vier VERSCHIEDENE Saetze, nicht vier Umformulierungen
  // desselben Satzes. Und kein Satz lobt nur — jede Zeile traegt eine Zahl
  // oder eine Beobachtung. Alle vier Regeln sind in der Testsuite verankert.
  var TXT = {
    de: {
      greet: {
        ruhig:    'Letztes Mal {ex} mit {kg} kg, {sets} Sätze zu {reps}. Nimm dir Zeit.',
        sachlich: '{ex}: zuletzt {kg} kg, {sets} Sätze zu {reps} Wiederholungen.',
        hart:     '{ex}. {kg} Kilo. {sets} Sätze. Los.',
        locker:   '{ex} mit {kg} kg — dein altes Spiel, oder?'
      },
      greetFirst: {
        ruhig:    '{ex} steht heute zum ersten Mal an. Geh es ruhig an.',
        sachlich: 'Erste Einheit mit {ex}. Keine Vergleichswerte vorhanden.',
        hart:     '{ex}. Neu. Zeig, was geht.',
        locker:   '{ex} zum ersten Mal — mal sehen, was drin ist.'
      },
      mid: {
        ruhig:    'Halbzeit. Du liegst bei {vol} kg, etwa {pct} Prozent zur letzten Einheit.',
        sachlich: 'Halbzeit: {vol} kg, {pct} Prozent gegenüber der letzten Einheit.',
        hart:     'Halbzeit. {vol} Kilo. Nachlegen.',
        locker:   'Schon {vol} kg bewegt, {pct} Prozent mehr als sonst. Läuft.'
      },
      exOpen: {
        ruhig:    '{ex}: {sets} Sätze, zuletzt {kg} kg bei {reps} Wiederholungen.',
        sachlich: '{ex}: {sets} Sätze geplant, zuletzt {kg} kg zu {reps} Wiederholungen.',
        hart:     '{ex}. {kg} Kilo. {reps} Wiederholungen. Anfangen.',
        locker:   '{ex} wieder — {kg} kg, {reps} Wiederholungen, {sets} Sätze.'
      },
      warmupIntro: {
        ruhig:    'Zum Aufwärmen für {ex}: zwei leichte Sätze, dann steigern.',
        sachlich: 'Aufwärmschema für {ex}: drei Sätze mit steigendem Gewicht.',
        hart:     'Aufwärmen für {ex}. Zwei Sätze. Kurz.',
        locker:   'Kurz warm werden für {ex}, dann wird es ernst.'
      },
      setAsk: {
        ruhig:    'Wie hat sich der Satz angefühlt?',
        sachlich: 'Einschätzung zum Satz: leicht, passend oder schwer?',
        hart:     'Satz: leicht, passend, schwer?',
        locker:   'Und, wie war der? Leicht, passend oder schwer?'
      },
      setAckEasy: {
        ruhig:    'Gut. Beim nächsten Mal gehen wir auf {kg} kg.',
        sachlich: 'Notiert. Nächster Vorschlag: {kg} kg.',
        hart:     'Zu leicht. Nächstes Mal {kg} Kilo.',
        locker:   'War wohl zu leicht — nächstes Mal {kg} kg.'
      },
      setAckHard: {
        ruhig:    'Verstanden. Wir bleiben bei {kg} kg, bis es sitzt.',
        sachlich: 'Notiert. Gewicht bleibt bei {kg} kg.',
        hart:     'Schwer. {kg} Kilo bleiben stehen.',
        locker:   'Okay, das reicht erstmal — {kg} kg bleiben.'
      },
      restTip: {
        ruhig:    'Bei {ex} hilft es, die Schultern unten zu lassen.',
        sachlich: 'Technikpunkt {ex}: Schulterblätter fixieren, Bahn gleich halten.',
        hart:     '{ex}: Schultern runter. Bahn halten.',
        locker:   'Kleiner Tipp für {ex}: Schultern unten lassen, das spart Kraft.'
      },
      restNext: {
        ruhig:    'Als Nächstes {kg} kg mit {reps} Wiederholungen.',
        sachlich: 'Nächster Satz: {kg} kg, {reps} Wiederholungen.',
        hart:     'Nächster Satz. {kg} Kilo. {reps} Stück.',
        locker:   'Gleich weiter mit {kg} kg und {reps} Wiederholungen.'
      },
      fatigue: {
        ruhig:    'Die Wiederholungen werden weniger. Etwas mehr Pause hilft jetzt.',
        sachlich: 'Wiederholungen sinken über die letzten Sätze. Ermüdung erkennbar.',
        hart:     'Wiederholungen fallen. Pause verlängern.',
        locker:   'Da geht die Luft raus — gönn dir zwanzig Sekunden mehr.'
      },
      stall: {
        ruhig:    'Seit zwölf Minuten kein Satz. Alles in Ordnung?',
        sachlich: 'Zwölf Minuten ohne gespeicherten Satz.',
        hart:     'Zwölf Minuten Pause. Weitermachen.',
        locker:   'Zwölf Minuten Pause — noch dabei oder schon geduscht?'
      },
      debrief: {
        ruhig:    '{sets} Sätze, {vol} kg bewegt. Solide Einheit.',
        sachlich: 'Einheit beendet: {sets} Sätze, {vol} kg Gesamtvolumen.',
        hart:     '{sets} Sätze. {vol} Kilo. Erledigt.',
        locker:   '{sets} Sätze und {vol} kg später — Feierabend.'
      },
      recall: {
        ruhig:    'Bei {ex} hast du den Hinweis umgesetzt. Das zahlt sich aus.',
        sachlich: '{ex}: der Hinweis der letzten Einheit wurde umgesetzt.',
        hart:     '{ex}: Hinweis sitzt. Dranbleiben.',
        locker:   'Der Tipp bei {ex} hat gesessen, oder?'
      },
      plateau: {
        ruhig:    '{ex} steht seit {weeks} Wochen. Längere Pausen von {secs} Sekunden könnten helfen.',
        sachlich: '{ex}: {weeks} Wochen ohne Steigerung. Durchschnittliche Pause {secs} Sekunden.',
        hart:     '{ex} steht {weeks} Wochen. {secs} Sekunden Pause.',
        locker:   '{ex} klemmt seit {weeks} Wochen — mal {secs} Sekunden länger pausieren?'
      },
      timeBudget: {
        ruhig:    '{mins} Minuten reichen für {count} Übungen. Der Rest kann warten.',
        sachlich: 'Zeitbudget {mins} Minuten: {count} Übungen priorisiert.',
        hart:     '{mins} Minuten. {count} Übungen. Los.',
        locker:   'Nur {mins} Minuten? Dann nehmen wir die {count} wichtigsten Übungen.'
      },
      cue: {
        ruhig:    'Vor dem ersten schweren Satz bei {ex}: Rücken fest, Atem raus.',
        sachlich: '{ex}: Rumpf spannen, Bewegung kontrolliert führen.',
        hart:     '{ex}: Rumpf fest. Kontrolliert bewegen.',
        locker:   'Kurz vor {ex}: Rumpf fest machen, dann passt das.'
      },
      prCongrats: {
        ruhig:    'Neuer Bestwert bei {ex}: {kg} kg.',
        sachlich: 'Bestleistung {ex}: {kg} kg, alter Wert überboten.',
        hart:     '{ex}: {kg} Kilo. Neuer Bestwert.',
        locker:   '{kg} kg bei {ex} — das ist dein neuer Bestwert.'
      },
      deload: {
        ruhig:    'Mehrere schwere Einheiten bei wenig Energie. Eine leichtere Woche hilft.',
        sachlich: 'Belastung hoch, Erholung niedrig. Deload empfohlen.',
        hart:     'Zu viel Last. Eine Woche zurück.',
        locker:   'Der Akku ist leer — eine ruhige Woche schadet nicht.'
      },
      returnNudge: {
        ruhig:    'Seit {days} Tagen keine Einheit. Ein kurzes Training reicht schon.',
        sachlich: '{days} Tage ohne Training. Letzte Einheit liegt zurück.',
        hart:     '{days} Tage nichts. Rein ins Gym.',
        locker:   '{days} Tage Pause — die Hanteln vermissen dich langsam.'
      },
      anniversary: {
        ruhig:    'Vor einem Jahr waren es {kg} kg bei {ex}. Der Weg ist sichtbar.',
        sachlich: 'Vor zwölf Monaten: {ex} mit {kg} kg.',
        hart:     'Vor einem Jahr: {kg} Kilo. Heute mehr.',
        locker:   'Weißt du noch? {ex} mit {kg} kg, vor genau einem Jahr.'
      },
      reminderPlan: {
        ruhig:    'Heute steht {ex} an: {sets} Sätze zu {reps} bei {kg} kg.',
        sachlich: 'Trainingstag: {ex}, {sets} Sätze, {reps} Wiederholungen, {kg} kg.',
        hart:     '{ex} heute. {kg} Kilo. {sets} Sätze.',
        locker:   'Heute wartet {ex} mit {kg} kg auf dich, {sets} Sätze.'
      },
      reportReady: {
        ruhig:    'Dein Wochenbericht liegt bereit. {vol} kg in dieser Woche.',
        sachlich: 'Wochenbericht verfügbar: {vol} kg Gesamtvolumen.',
        hart:     'Wochenbericht da. {vol} Kilo.',
        locker:   'Wochenbericht ist da — {vol} kg stehen drin.'
      },
      // forecast traegt in ALLEN vier Toenen eine Bedingung und nie eine
      // Zusage. Eine Prognose ist keine Versprechung; ein Test haelt das fest.
      forecast: {
        ruhig:    'Wenn es so weiterläuft, sind {kg} kg bei {ex} in {weeks} Wochen erreichbar.',
        sachlich: 'Fortschreibung: {kg} kg bei {ex} in {weeks} Wochen, wenn das Tempo bleibt.',
        hart:     'Wenn du dranbleibst: {kg} Kilo in {weeks} Wochen.',
        locker:   'Wenn das so bleibt, siehst du {kg} kg bei {ex} in {weeks} Wochen.'
      }
    },
    en: {
      greet: {
        ruhig:    'Last time {ex} at {kg} kg, {sets} sets of {reps}. Take your time.',
        sachlich: '{ex}: last session {kg} kg, {sets} sets of {reps} reps.',
        hart:     '{ex}. {kg} kilos. {sets} sets. Go.',
        locker:   '{ex} at {kg} kg again? You know the drill.'
      },
      greetFirst: {
        ruhig:    '{ex} is on the plan for the first time. Ease into it.',
        sachlich: 'First session with {ex}. No previous data to compare.',
        hart:     '{ex}. New. Show me something.',
        locker:   'First time on {ex} — let us see what happens.'
      },
      mid: {
        ruhig:    'Halfway. You are at {vol} kg, about {pct} percent versus last time.',
        sachlich: 'Halfway: {vol} kg, {pct} percent versus the last session.',
        hart:     'Halfway. {vol} kilos. Push.',
        locker:   'Already {vol} kg moved, {pct} percent above usual. Not bad.'
      },
      exOpen: {
        ruhig:    '{ex}: {sets} sets, last time {kg} kg for {reps} reps.',
        sachlich: '{ex}: {sets} sets planned, last time {kg} kg for {reps} reps.',
        hart:     '{ex}. {kg} kilos. {reps} reps. Start.',
        locker:   '{ex} again — {kg} kg, {reps} reps, {sets} sets.'
      },
      warmupIntro: {
        ruhig:    'Warm up for {ex}: two light sets, then build.',
        sachlich: 'Warm-up scheme for {ex}: three sets, weight increasing.',
        hart:     'Warm up {ex}. Two sets. Quick.',
        locker:   'Quick warm-up for {ex}, then the real work.'
      },
      setAsk: {
        ruhig:    'How did that set feel?',
        sachlich: 'Rate that set: easy, right or hard?',
        hart:     'Set: easy, right, hard?',
        locker:   'So how was it? Easy, right or hard?'
      },
      setAckEasy: {
        ruhig:    'Good. Next time we go to {kg} kg.',
        sachlich: 'Noted. Next suggestion: {kg} kg.',
        hart:     'Too light. Next time {kg} kilos.',
        locker:   'Too easy then — {kg} kg next time.'
      },
      setAckHard: {
        ruhig:    'Understood. We stay at {kg} kg until it settles.',
        sachlich: 'Noted. Weight stays at {kg} kg.',
        hart:     'Hard. {kg} kilos stay.',
        locker:   'Fair enough — {kg} kg stays for now.'
      },
      restTip: {
        ruhig:    'On {ex} it helps to keep the shoulders down.',
        sachlich: 'Technique note on {ex}: fix the shoulder blades, keep the path.',
        hart:     '{ex}: shoulders down. Keep the path.',
        locker:   'Quick tip for {ex}: shoulders down, it saves energy.'
      },
      restNext: {
        ruhig:    'Next up {kg} kg for {reps} reps.',
        sachlich: 'Next set: {kg} kg, {reps} reps.',
        hart:     'Next set. {kg} kilos. {reps} reps.',
        locker:   'Up next: {kg} kg for {reps} reps.'
      },
      fatigue: {
        ruhig:    'Your reps are dropping. A little more rest helps now.',
        sachlich: 'Reps declining across recent sets. Fatigue is visible.',
        hart:     'Reps are falling. Rest longer.',
        locker:   'Running out of steam — take twenty seconds more.'
      },
      stall: {
        ruhig:    'No set for twelve minutes. Everything alright?',
        sachlich: 'Twelve minutes without a logged set.',
        hart:     'Twelve minutes idle. Get moving.',
        locker:   'Twelve minutes idle — still here or already showered?'
      },
      debrief: {
        ruhig:    '{sets} sets, {vol} kg moved. Solid session.',
        sachlich: 'Session complete: {sets} sets, {vol} kg total volume.',
        hart:     '{sets} sets. {vol} kilos. Done.',
        locker:   '{sets} sets and {vol} kg later — that is a wrap.'
      },
      recall: {
        ruhig:    'You applied the note on {ex}. It is paying off.',
        sachlich: '{ex}: the note from the last session was applied.',
        hart:     '{ex}: note stuck. Keep going.',
        locker:   'That tip on {ex} landed, right?'
      },
      plateau: {
        ruhig:    '{ex} has been flat for {weeks} weeks. Longer rests of {secs} seconds may help.',
        sachlich: '{ex}: {weeks} weeks without progress. Average rest {secs} seconds.',
        hart:     '{ex} flat {weeks} weeks. Rest {secs} seconds.',
        locker:   '{ex} stuck for {weeks} weeks — maybe rest {secs} seconds longer?'
      },
      timeBudget: {
        ruhig:    '{mins} minutes fit {count} exercises. The rest can wait.',
        sachlich: 'Time budget {mins} minutes: {count} exercises prioritised.',
        hart:     '{mins} minutes. {count} exercises. Go.',
        locker:   'Only {mins} minutes? Then we take the {count} that matter.'
      },
      cue: {
        ruhig:    'Before the first heavy set on {ex}: back tight, breathe out.',
        sachlich: '{ex}: brace the core, control the movement.',
        hart:     '{ex}: brace hard. Control it.',
        locker:   'Quick one before {ex}: brace up and it flows.'
      },
      prCongrats: {
        ruhig:    'New best on {ex}: {kg} kg.',
        sachlich: 'Personal best on {ex}: {kg} kg, previous mark beaten.',
        hart:     '{ex}: {kg} kilos. New best.',
        locker:   '{kg} kg on {ex} — that is a new best.'
      },
      deload: {
        ruhig:    'Several heavy sessions on low energy. A lighter week helps.',
        sachlich: 'Load high, recovery low. Deload recommended.',
        hart:     'Too much load. Back off one week.',
        locker:   'Battery is empty — one easy week will not hurt.'
      },
      returnNudge: {
        ruhig:    'No session for {days} days. A short workout is enough.',
        sachlich: '{days} days without training. Last session is behind you.',
        hart:     '{days} days off. Back to work.',
        locker:   '{days} days off — the weights are getting lonely.'
      },
      anniversary: {
        ruhig:    'A year ago it was {kg} kg on {ex}. The path shows.',
        sachlich: 'Twelve months ago: {ex} at {kg} kg.',
        hart:     'One year ago: {kg} kilos. More today.',
        locker:   'Remember? {ex} at {kg} kg, exactly one year ago.'
      },
      reminderPlan: {
        ruhig:    '{ex} is on today: {sets} sets of {reps} at {kg} kg.',
        sachlich: 'Training day: {ex}, {sets} sets, {reps} reps, {kg} kg.',
        hart:     '{ex} today. {kg} kilos. {sets} sets.',
        locker:   '{ex} is waiting today, {kg} kg, {sets} sets.'
      },
      reportReady: {
        ruhig:    'Your weekly report is ready. {vol} kg this week.',
        sachlich: 'Weekly report available: {vol} kg total volume.',
        hart:     'Weekly report ready. {vol} kilos.',
        locker:   'Weekly report is up — {vol} kg in there.'
      },
      forecast: {
        ruhig:    'If this keeps up, {kg} kg on {ex} is within reach in {weeks} weeks.',
        sachlich: 'Projection: {kg} kg on {ex} in {weeks} weeks if the pace holds.',
        hart:     'If you hold: {kg} kilos in {weeks} weeks.',
        locker:   'If it stays like this, {kg} kg on {ex} shows up in {weeks} weeks.'
      }
    }
  };

  // KEYS ist ABGELEITET, nicht von Hand gepflegt — eine handgepflegte Liste
  // laeuft irgendwann auseinander, und der Vollstaendigkeitstest prueft dann
  // gegen die falsche Menge.
  var KEYS = Object.keys(TXT.de);

  function say(key, vars, persona, lang) {
    var l = lang === 'en' ? 'en' : 'de';
    var p = personaGet(persona);
    var row = TXT[l] && TXT[l][key];
    if (!row) return '';
    var tpl = row[p.tone] || row.sachlich;
    if (!tpl) return '';
    return fill(tpl, vars, l);
  }

  // Eine Zeile fuer den System-Prompt. Bewusst kurz: sie wandert bei JEDER
  // Modellanfrage mit und kostet dort Tokens.
  var TONE_LINE = {
    de: {
      ruhig:    'gelassen und ohne Druck, in kurzen Hauptsätzen',
      sachlich: 'neutral und knapp, Zahlen zuerst, ohne Bewertung',
      hart:     'fordernd und sehr knapp, im Imperativ',
      locker:   'locker und umgangssprachlich, gern als Frage'
    },
    en: {
      ruhig:    'calm and unhurried, in short plain sentences',
      sachlich: 'neutral and brief, numbers first, no judgement',
      hart:     'demanding and very brief, in the imperative',
      locker:   'casual and colloquial, often as a question'
    }
  };

  function personaLine(persona, lang) {
    var l = lang === 'en' ? 'en' : 'de';
    var p = personaGet(persona);
    if (l === 'en') {
      return 'You are ' + p.name + ', the personal training coach of this user. '
           + 'Your tone is ' + TONE_LINE.en[p.tone] + '. '
           + 'Answer briefly and name concrete numbers whenever you have them.';
    }
    return 'Du bist ' + p.name + ', der persönliche Trainingscoach des Nutzers. '
         + 'Dein Ton ist ' + TONE_LINE.de[p.tone] + '. '
         + 'Antworte kurz und nenne konkrete Zahlen, wann immer du welche hast.';
  }

  var API = {
    personaGet: personaGet,
    personaLine: personaLine,
    say: say,
    KEYS: KEYS,
    TONES: TONES,
    LEVELS: LEVELS,
    PUSH: PUSH,
    PRESETS: PRESETS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachPersona = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
