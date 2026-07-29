/* GymTrack — Antwort-Cache-Klassifikator (Block 0)
   Entscheidet, ob eine Chat-Frage fuer ALLE Nutzer dieselbe Antwort hat.
   Nur solche Fragen duerfen in den geteilten KV-Cache. Die Regel ist bewusst
   streng: im Zweifel NICHT cachen. Eine faelschlich gecachte persoenliche
   Antwort waere ein Datenleck zwischen zwei Nutzern — eine faelschlich nicht
   gecachte Antwort kostet einen halben Cent. */
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

  // Possessiv- und Ich-Bezug in beiden Sprachen. "mein/meine/meiner/..." wird
  // ueber den Wortstamm erfasst. Bewusst OHNE bloss "ich"/"i": das waere jedes
  // "Wie fuehre ich X aus?"/"How do I perform X?" — die haeufigste Phrasierung
  // ueberhaupt fuer eine rein sachliche Technikfrage. Ein falscher Treffer hier
  // kostet nur einen Cache-Miss (Kosten), kein Datenleck — die echten
  // personenbezogenen Faelle in den Tests laufen alle zusaetzlich ueber
  // TIME/HIST oder ein echtes Possessivpronomen (mein/my), nicht ueber das
  // blosse Subjektpronomen.
  var SELF = /\b(mein|meine|meiner|meinem|meinen|meins|mir|mich|my|mine|me)\b/;

  // Zeitbezug: eine Frage mit Zeitfenster meint fast immer die eigene Historie.
  var TIME = /\b(gestern|heute|vorgestern|letzte|letzter|letztes|letzten|diese|dieser|woche|monat|jahr|zuletzt|bisher|seit|yesterday|today|last|this week|month|year|so far|recent)\b/;

  // Verlaufswoerter: zusammen mit einem Uebungsnamen bedeuten sie "meine Zahlen
  // zu dieser Uebung", nicht "was ist diese Uebung". Bewusst OHNE "trainiert":
  // das ist auch das normale Verb in einer rein sachlichen Frage ("Welche
  // Muskeln trainiert Latzug?") — echte Ich-Bezuege mit "trainiert" ("was habe
  // ich trainiert") lösen ohnehin schon über SELF ("mein"/"my") oder TIME
  // ("diese Woche"/"gestern") aus.
  var HIST = /\b(fortschritt|verlauf|entwicklung|rekord|pr|bestleistung|steigerung|plateau|stagnation|geschafft|gemacht|progress|history|record|best|improve|stalled)\b/;

  function isPersonal(question, exerciseNames) {
    var q = normalize(question);
    // Zu kurz, um sicher einzuordnen — der Zweifelsfall geht gegen den Cache.
    if (q.length < 8) return true;
    if (SELF.test(q)) return true;
    if (TIME.test(q)) return true;
    if (HIST.test(q)) {
      // Verlaufswort allein reicht schon: "Rekord" ohne Uebung meint trotzdem
      // den eigenen Rekord.
      return true;
    }
    var list = Array.isArray(exerciseNames) ? exerciseNames : [];
    for (var i = 0; i < list.length; i++) {
      var ex = normalize(list[i]);
      if (ex && q.indexOf(ex) >= 0 && (SELF.test(q) || HIST.test(q))) return true;
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
