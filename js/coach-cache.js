/* GymTrack — Antwort-Cache-Klassifikator (Block 0)
   Entscheidet, ob eine Chat-Frage fuer ALLE Nutzer dieselbe Antwort hat.
   Nur solche Fragen duerfen in den geteilten KV-Cache. Die Regel ist bewusst
   streng: im Zweifel NICHT cachen. Eine faelschlich gecachte persoenliche
   Antwort waere ein Datenleck zwischen zwei Nutzern — eine faelschlich nicht
   gecachte Antwort kostet einen halben Cent.

   SYNCHRON HALTEN: normalize(), hash16() und isPersonal() liegen woertlich
   noch einmal in ai-worker/worker.js (Abschnitt "Cache-Klassifikator —
   Spiegel von js/coach-cache.js"). Das Duplikat ist Absicht und kein
   Versehen: der Worker darf dem Client nicht glauben und rechnet Schluessel
   UND Cachefaehigkeit selbst nach (Review C5 — Cache-Vergiftung). Jede
   Aenderung hier muss dort mitgezogen werden, sonst weicht der serverseitig
   berechnete Schluessel vom gelieferten ab und es wird gar nicht mehr
   gecacht (fail-closed, kein Leck, aber auch keine Ersparnis). */
(function (root) {
  'use strict';

  // Umlaute vereinheitlichen, damit "fuehre" und "führe" denselben Schluessel
  // ergeben. Ohne das haette dieselbe Frage je nach Tastatur zwei Eintraege.
  function normalize(q) {
    return String(q || '')
      .toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ── Warum Substring statt Wortgrenze ──────────────────────────────────────
  // Deutsche Flexion bricht \b: /\bfortschritt\b/ trifft "Fortschritt", aber
  // NICHT "Fortschritte". Dasselbe bei rekord/rekorde, woche/wochen,
  // best/beste, letzte/letztens, schmerz/rueckenschmerzen. Genau ueber diese
  // Endungen sind personenbezogene Fragen bisher am Klassifikator vorbei in
  // den geteilten Cache gelaufen. Deutsche Stichwoerter werden deshalb als
  // STAMM per Substring geprueft. Fuer kurze/mehrdeutige Tokens (pr, ich, i,
  // am, weh) bleibt die Wortgrenze — dort waere Substring ein Dauerfehltreffer
  // ("pr" steckt in protein, programm, press).
  function hasStem(q, stems) {
    for (var i = 0; i < stems.length; i++) if (q.indexOf(stems[i]) >= 0) return true;
    return false;
  }

  // Possessiv- und Objektpronomen: immer Personenbezug. Alle Formen sind hier
  // ausgeschrieben, deshalb reicht die Wortgrenze.
  var SELF = /\b(mein|meine|meiner|meinem|meinen|meins|mir|mich|my|mine|me)\b/;

  // Subjektpronomen ALLEIN ist kein Personenbezug — "Wie fuehre ich X aus?" /
  // "How do I perform X?" ist die haeufigste Phrasierung fuer eine rein
  // sachliche Technikfrage. Zusammen mit einem Modal- oder Zustandsverb kippt
  // die Bedeutung aber immer ins Persoenliche: "kann ich", "soll ich", "bin
  // ich", "habe ich", "wiege ich", "can I", "should I", "I have", "I am".
  var SUBJ  = /\b(ich|i)\b/;
  var MODAL = /\b(soll|sollte|kann|koennte|darf|muss|will|moechte|bin|habe|hab|brauche|schaffe|wiege|should|can|could|am|have|need|want|must|weigh)\b/;

  // Zeitbezug: eine Frage mit Zeitfenster meint fast immer die eigene Historie.
  var TIME_DE = ['gestern', 'heute', 'vorgestern', 'letzt', 'diese', 'woche', 'monat', 'jahr', 'bisher', 'neulich', 'kuerzlich'];
  var TIME_EN = /\b(yesterday|today|last|this week|month|year|so far|recent|recently|ago)\b/;

  // Verlaufswoerter: sie fragen nach den eigenen Zahlen, nicht nach Sachwissen.
  // Bewusst OHNE "trainiert": das ist auch das normale Verb in einer rein
  // sachlichen Frage ("Welche Muskeln trainiert Latzug?").
  var HIST_DE = ['fortschritt', 'verlauf', 'entwicklung', 'rekord', 'best', 'steigerung', 'gesteigert', 'verbesser', 'plateau', 'stagnation', 'geschafft', 'gemacht'];
  var HIST_EN = /\b(progress|history|record|records|improve|improved|improving|stalled|streak)\b/;
  // Kurze Kuerzel, die als Substring ueberall falsch treffen wuerden.
  var SHORT   = /\b(pr|prs|pb|pbs|1rm|weh)\b/;

  // Koerper und Gesundheit. Antwort haengt am konkreten Koerper des Fragenden —
  // und Einschraenkungen/Schmerzen sind Gesundheitsangaben, die niemals bei
  // einem fremden Nutzer landen duerfen.
  var BODY_DE = ['wiege', 'wiegen', 'koerpergewicht', 'abnehm', 'zunehm', 'kalorien', 'verletz', 'schmerz', 'bandscheibe', 'reha', 'arthrose', 'entzuend', 'zerrung', 'prellung', 'krank', 'physio'];
  var BODY_EN = /\b(weigh|weighs|weight|injury|injuries|injured|pain|hurt|hurts|sore|calorie|calories|rehab)\b/;

  // Trainingsplan/Split/Programm: eine Planantwort wird immer aus Ziel,
  // Erfahrung, Frequenz und Uebungsliste DIESES Nutzers gebaut.
  // "plan" als Stamm deckt plan/plans/plaene(->plaen)/planung/trainingsplan ab.
  var PLAN_ST = ['plan', 'plaen', 'split', 'program', 'routine'];

  function isPersonal(question, exerciseNames) {
    var q = normalize(question);
    // Zu kurz, um sicher einzuordnen — der Zweifelsfall geht gegen den Cache.
    if (q.length < 8) return true;
    if (SELF.test(q)) return true;
    if (SUBJ.test(q) && MODAL.test(q)) return true;
    if (TIME_EN.test(q) || hasStem(q, TIME_DE)) return true;
    // Verlaufswort allein reicht schon: "Rekord" ohne Uebung meint trotzdem
    // den eigenen Rekord.
    if (HIST_EN.test(q) || SHORT.test(q) || hasStem(q, HIST_DE)) return true;
    if (BODY_EN.test(q) || hasStem(q, BODY_DE)) return true;
    if (hasStem(q, PLAN_ST)) return true;
    // Uebungsname + Selbst-/Verlaufsbezug. Heute bereits durch die Klassen
    // oben abgedeckt (beide Bedingungen haetten schon true geliefert) — bleibt
    // als Netz stehen, falls oben je gelockert wird.
    var list = Array.isArray(exerciseNames) ? exerciseNames : [];
    for (var i = 0; i < list.length; i++) {
      var ex = normalize(list[i]);
      if (ex && q.indexOf(ex) >= 0 && (SELF.test(q) || hasStem(q, HIST_DE) || HIST_EN.test(q))) return true;
    }
    return false;
  }

  // FNV-1a, 64 Bit als zwei 32-Bit-Haelften. Kein Krypto-Anspruch — der
  // Schluessel muss nur stabil und kollisionsarm sein, und der Worker soll ohne
  // WebCrypto-Await auskommen.
  function hash16(s) {
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 ^= c; h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 ^= c + i; h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
    }
    return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
  }

  function cacheKey(question, lang, model) {
    return 'c:' + (lang === 'en' ? 'en' : 'de') + ':' + String(model || 'default') + ':' + hash16(normalize(question));
  }

  var API = { normalize: normalize, isPersonal: isPersonal, cacheKey: cacheKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachCache = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
