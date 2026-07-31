/* GymTrack — Sprachaufbereitung und Stimmwahl (Block 2, Task 12)

   Reine Logik. Dieses Modul spricht nichts aus und hoert nichts zu: es
   kennt weder das native TtsPlugin noch speechSynthesis, weder das DOM noch
   die Spracheinstellung. Faehigkeiten, Stimmenliste und Sprache kommen als
   Argument herein, heraus kommen ein Objekt, eine Kennung und ein String.

   Das ist kein Selbstzweck, sondern der Grund, warum der Teil hier auf
   jedem Rechner pruefbar ist, waehrend die Sprachausgabe selbst nur auf dem
   Geraet laeuft. Alles, was hier stillschweigend auf einen Sprachdienst
   zugriffe, waere in Node nicht mehr zu testen — und genau die
   Ersetzungstabelle unten faellt sonst erst im Ohr des Nutzers auf.

   Drei Grenzen, die dieses Modul bewusst NICHT ueberschreitet:
   - Es entscheidet nicht, WANN gesprochen wird. Der Coach redet nie von
     selbst los; ausgeloest wird ausschliesslich in index.html.
   - Es formuliert nichts. Der Wortlaut kommt aus dem Satzkatalog
     (CoachPersona.say); hier wird er nur fuer das Ohr aufbereitet.
   - Es liest keine Spracheinstellung. Welche Sprache gilt, weiss die
     Anzeige, nicht die Stimmwahl. */
(function (root) {
  'use strict';

  /* Lateinische Buchstaben einschliesslich Umlauten. Wird gebraucht, um
     "kg" und "Wdh" als eigenstaendiges Wort von einem Wortbestandteil zu
     unterscheiden: \b allein reicht nicht, weil \b nur ASCII kennt und
     "62,5kg" (Ziffer davor) faelschlich als Wortmitte einstuft. */
  var BUCHSTABE = 'A-Za-z\u00C0-\u024F';

  /* Bewusst KEIN Lookbehind ((?<!...)) in diesem Modul: aeltere WebKit-
     Versionen werfen daran schon beim LADEN des Skripts einen SyntaxError —
     nicht erst beim Aufruf. Das Modul waere dann komplett weg, samt der
     Faehigkeitspruefung, die den Sprech-Knopf ausblenden soll. Stattdessen
     faengt eine Gruppe das Zeichen davor ein und gibt es zurueck. */
  var FETT     = /\*\*([^*]+)\*\*/g;
  var AUFZAEHL = new RegExp('^[ \\t]*[-\u2022\u00B7][ \\t]+', 'gm');
  var MAL      = /\u00D7/g;
  var AT       = /@/g;
  var KG       = new RegExp('(^|[^' + BUCHSTABE + '])kg(?![' + BUCHSTABE + '0-9_])', 'g');
  var WDH      = new RegExp('(^|[^' + BUCHSTABE + '])Wdh(?![' + BUCHSTABE + '0-9_])', 'g');
  var HSPACE   = /[ \t]+/g;
  var UM_UMBRUCH = /[ \t]*\n[ \t]*/g;

  /* available(caps) -> {tts, stt}

     caps = {tts, stt, webTts, webStt}: nativ ODER Web zaehlt. Der Web-Zweig
     ist kein Notnagel, sondern der regulaere Pfad im Browser — _cap() gibt
     dort null zurueck, ein rein nativer Test waere im Web immer falsch und
     der Sprech-Knopf verschwaende dort fuer immer.

     Vorlesen und Diktat werden getrennt beantwortet: es sind zwei
     Berechtigungen, und ein entzogenes Mikrofon darf die Sprachausgabe
     nicht mit abschalten.

     Beide Werte sind echte Booleans, nicht die durchgereichten Eingaben:
     die Aufrufer liefern typeof-Ergebnisse und null, und der Rueckgabewert
     landet in einem "wenn nicht, dann Knopf weg"-Vergleich. */
  function available(caps) {
    var c = (caps && typeof caps === 'object') ? caps : {};
    return { tts: !!(c.tts || c.webTts), stt: !!(c.stt || c.webStt) };
  }

  // 'de-DE', 'de_AT', 'DE' und 'de' sind dieselbe Sprache. Verglichen wird
  // der Teil vor dem ersten Trennzeichen, gross/klein egal.
  function sprachTeil(v) {
    if (typeof v !== 'string') return '';
    return v.toLowerCase().split(/[-_]/)[0].trim();
  }

  /* pickVoice(voices, preferredId, lang) -> id | null

     voices = [{id, lang}]. Die Reihenfolge: gewuenschte Kennung, sonst
     erste Stimme der passenden Sprache, sonst null.

     Zwei Regeln, die zusammengehoeren:

     1. Die Sprache schlaegt den Wunsch. Eine gespeicherte englische Stimme
        darf einen deutschen Satz nicht vorlesen — das Ergebnis ist nicht
        unschoen, sondern unverstaendlich. Der Wunsch gilt also nur
        innerhalb der passenden Sprache.
     2. Lieber null als die falsche Sprache. null heisst fuer den Aufrufer
        "nimm die Systemstimme"; eine englische Stimme fuer deutschen Text
        waere die schlechtere Antwort als gar keine.

     Ohne brauchbare Sprache wird nicht geraten, sondern null geliefert:
     welche Sprache gilt, weiss die Anzeige, und ein Modul, das sich hier
     selbst etwas aussucht, spraeche irgendwann gegen die Einstellung. */
  function pickVoice(voices, preferredId, lang) {
    var ziel = sprachTeil(lang);
    if (!ziel) return null;
    if (!Array.isArray(voices)) return null;

    var wunsch = (typeof preferredId === 'string' && preferredId) ? preferredId : null;
    var ersteFallback = null;

    for (var i = 0; i < voices.length; i++) {
      var v = voices[i];
      if (!v || typeof v !== 'object') continue;
      if (typeof v.id !== 'string' || !v.id) continue;
      if (sprachTeil(v.lang) !== ziel) continue;
      if (wunsch !== null && v.id === wunsch) return v.id;
      if (ersteFallback === null) ersteFallback = v.id;
    }
    return ersteFallback;
  }

  /* speakable(text) -> String fuer das Ohr

     Bildschirmtext und Sprechtext sind nicht dasselbe: "**Bank** 3 × 8 @
     62,5 kg" liest jede Sprachausgabe als "Sternchen Sternchen Bank ... x
     ... at ... k g" vor. Die Ersetzungen unten sind darum die eigentliche
     Anforderung dieses Moduls.

     Die gefaehrlichere Haelfte ist aber das Gegenteil: eine Regel, die zu
     weit greift, zerlegt normalen Text. Darum steht neben jeder Ersetzung,
     was sie NICHT anfassen darf:

     - **fett** nur als PAAR und ohne Stern dazwischen ([^*]+). Ein gieriger
       Ausdruck (.+) verschluckt bei zwei fetten Stellen alles dazwischen;
       ein halbes Paar bleibt unangetastet stehen, statt Text mitzureissen.
     - Aufzaehlungszeichen nur am ZEILENANFANG (^ mit m-Flag). Ein
       Gedankenstrich mitten im Satz ist keine Liste und bleibt.
     - kg und Wdh nur als eigenstaendiges Wort. Sonst wird aus "Rueckgrat"
       ein "RuecKilorat" und aus "12 kgs" ein "12 Kilos". Eine Ziffer davor
       ist dagegen erlaubt, weil "62,5kg" der haeufigste Fall ueberhaupt
       ist; das eingefuegte Leerzeichen zieht der Schritt am Ende wieder
       zusammen.
     - @ wird IMMER ersetzt, auch in einer Adresse. Eine Ausnahme fuer
       wortumschlossene At-Zeichen wuerde "8@62,5kg" wieder kaputt machen,
       und Adressen liest der Coach ohnehin nicht vor.

     Zeilenumbrueche bleiben erhalten — sie sind die Atempausen der
     Sprachausgabe. Zusammengezogen wird nur waagerechter Leerraum; eine
     Liste, die zu einem einzigen Satz verschmilzt, wird in einem Zug
     heruntergelesen.

     Was kein String ist, ergibt einen leeren String und keinen Fehler: die
     Sprachausgabe darf den Ablauf nie stoeren, und String(null) waere das
     gesprochene Wort "null". */
  function speakable(text) {
    if (typeof text !== 'string' || !text) return '';
    return text
      .replace(/\r\n?/g, '\n')
      .replace(FETT, '$1')
      .replace(AUFZAEHL, '')
      .replace(MAL, ' mal ')
      .replace(AT, ' bei ')
      .replace(KG, '$1 Kilo')
      .replace(WDH, '$1 Wiederholungen')
      .replace(HSPACE, ' ')
      .replace(UM_UMBRUCH, '\n')
      .trim();
  }

  var API = { available: available, pickVoice: pickVoice, speakable: speakable };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachVoice = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
