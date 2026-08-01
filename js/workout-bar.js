/* GymTrack — Zahlen der Trainings-Leiste (pure Logik, kein DOM)

   Zwei Helfer fuer #wk-bar in index.html:
   - setProgress: wie viele Saetze der Einheit sind abgehakt.
   - restFraction: welcher Anteil der Pause laeuft noch.
   Kein DOM und keine App-Globals — Eingaben kommen als Argumente herein,
   damit alles unter node --test pruefbar ist (Muster wie js/workout-focus.js). */
(function (root) {
  'use strict';

  /* Aufwaermsaetze zaehlen hier BEWUSST mit. Bei der Progression tun sie das
     nicht (siehe getSuggestedWeight), aber die Leiste zeigt Arbeit an, und
     ein Aufwaermsatz ist Arbeit. */
  function setProgress(logs) {
    let done = 0, total = 0;
    (Array.isArray(logs) ? logs : []).forEach(l => {
      const sets = l && Array.isArray(l.sets) ? l.sets : [];
      total += sets.length;
      sets.forEach(s => { if (s && s.done) done++; });
    });
    return { done: done, total: total };
  }

  /* Anteil der NOCH laufenden Pause: 1 am Anfang, 0 am Ende. Ohne sinnvolle
     Gesamtzeit lieber 0 als NaN — der Faden waere sonst unsinnig breit. */
  function restFraction(rest, total) {
    const t = Number(total), r = Number(rest);
    if (!isFinite(t) || t <= 0 || !isFinite(r)) return 0;
    return Math.min(1, Math.max(0, r / t));
  }

  /* Wie weit muss das Blatt nachruecken, damit ein Kasten GANZ im Bild steht?
     Positiv = nach unten scrollen. Bezug ist die Buehne des Blattes: oben
     verdeckt die klebende Leiste `pad` Pixel, unten ist bei `stage` Schluss.
     Passt der Kasten gar nicht hinein, gewinnt seine Oberkante — bei einem
     Angebot mit Knoepfen ist der Kopf wichtiger als der Fuss. */
  function revealDelta(top, bottom, stage, pad, rand) {
    const r = isFinite(rand) ? rand : 8;
    if (!isFinite(top) || !isFinite(bottom) || !isFinite(stage)) return 0;
    const p = isFinite(pad) ? pad : 0;
    let d = 0;
    if (bottom > stage - r) d = bottom - (stage - r);
    if (top - d < p + r) d = top - (p + r);
    return Math.abs(d) < 2 ? 0 : Math.round(d);
  }

  const API = { setProgress: setProgress, restFraction: restFraction,
                revealDelta: revealDelta };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.WorkoutBar = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
