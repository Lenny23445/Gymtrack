/* GymTrack — Seiten-Pager im aktiven Training (pure Rechnung, kein DOM)

   Das Trainingsblatt blaettert seitenweise: eine Uebung (bzw. eine
   Supersatz-Gruppe) fuellt genau eine bildschirmhohe Seite, und ein Wisch
   bringt die naechste. Hier steht nur die Rechnung dahinter — Seiteneinteilung
   und die Umrechnung zwischen Scrollstand und Seitenindex. Kein DOM und keine
   App-Globals, damit alles unter node --test pruefbar ist (Muster wie
   js/workout-focus.js).

   Die Gruppierung der Supersaetze kommt bewusst aus WorkoutFocus.focusUnitOf:
   das ist dieselbe Einheit, die der Fokus und das Auto-Weiterscrollen schon
   benutzen. Zwei eigene Umsetzungen derselben Regel wuerden frueher oder
   spaeter auseinanderlaufen. */
(function (root) {
  'use strict';

  const Focus = (typeof module !== 'undefined' && module.exports)
    ? require('./workout-focus.js')
    : root.WorkoutFocus;

  /* Seiteneinteilung. Jede Uebung erscheint auf genau einer Seite; die Uebungen
     einer Supersatz-Gruppe teilen sich eine. Am Ende steht immer die
     Abschluss-Seite (Notiz, Uebung hinzufuegen, Beenden, Abbrechen) — auch bei
     leerem Training, damit man dort nie in einer Sackgasse steht.
     'key' ist der kleinste li der Einheit und dient dem Render-Diff als
     stabiler Bezeichner (data-unit). */
  function pagesOf(logs) {
    const pages = [];
    if (Array.isArray(logs) && Focus) {
      const vergeben = new Set();
      for (let li = 0; li < logs.length; li++) {
        if (vergeben.has(li)) continue;
        const unit = Focus.focusUnitOf(logs, li);
        const u = unit.length ? unit : [li];
        u.forEach(i => vergeben.add(i));
        pages.push({ unit: u, key: String(u[0]) });
      }
    }
    pages.push({ unit: [], key: 'end' });
    return pages;
  }

  /* Scrollstand → Seitenindex. Gerundet, weil waehrend der Bewegung jeder
     Zwischenwert vorkommt und die Anzeige (Punktleiste, Fokusrahmen) der
     naechstgelegenen Seite folgen soll.

     pageH kann 0 sein: waehrend die Coach-Leiste ihre Hoehe faehrt oder bevor
     das Blatt einmal gelayoutet wurde. Dann ist jede Antwort geraten — also die
     erste Seite, statt mit NaN in ein scrollTo zu laufen. */
  function pageIndexFor(scrollTop, pageH, count) {
    const n = Math.max(0, Math.floor(count || 0));
    if (n <= 0) return 0;
    if (!(pageH > 0) || !isFinite(pageH)) return 0;
    const t = isFinite(scrollTop) ? scrollTop : 0;
    const i = Math.round(t / pageH);
    return Math.min(n - 1, Math.max(0, i));
  }

  /* Seitenindex → Scrollstand. Umkehrung von pageIndexFor an den Rastpunkten:
     scrollTopFor(pageIndexFor(x)) trifft immer genau einen Rastpunkt, nie einen
     Zwischenwert. Genau darauf beruht, dass das programmgesteuerte Scrollen
     (Auto-Weiter, Punktleiste) nicht gegen das Einrasten arbeitet. */
  function scrollTopFor(index, pageH) {
    if (!(pageH > 0) || !isFinite(pageH)) return 0;
    const i = isFinite(index) ? Math.max(0, Math.round(index)) : 0;
    return i * pageH;
  }

  /* Auf welcher Seite liegt Uebung li? Beide Uebungen einer Supersatz-Gruppe
     liefern denselben Index. -1, wenn li auf keiner Seite liegt (etwa nachdem
     die Uebung geloescht wurde) — der Aufrufer entscheidet dann selbst, wohin
     er zurueckfaellt. */
  function pageOfLi(pages, li) {
    if (!Array.isArray(pages)) return -1;
    for (let i = 0; i < pages.length; i++) {
      const u = pages[i] && pages[i].unit;
      if (Array.isArray(u) && u.indexOf(li) >= 0) return i;
    }
    return -1;
  }

  const API = { pagesOf: pagesOf, pageIndexFor: pageIndexFor,
                scrollTopFor: scrollTopFor, pageOfLi: pageOfLi };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.WorkoutPager = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
