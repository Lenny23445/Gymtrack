/* GymTrack — Fokus-Modus im aktiven Training (pure Logik, kein DOM)

   Zwei Helfer fuer das aktive Training in index.html:
   - focusUnitOf: Superset-Gruppe (ssGroup) = EINE Fokus-Einheit.
   - nextOpenUnit: Ziel fuers Auto-Weiterscrollen nach dem letzten Satz.
   Kein DOM und keine App-Globals — Eingaben kommen als Argumente herein,
   damit alles unter node --test pruefbar ist (Muster wie js/coach-*.js). */
(function (root) {
  'use strict';

  function focusUnitOf(logs, li) {
    if (!Array.isArray(logs) || li == null || li < 0 || li >= logs.length) return [];
    const g = logs[li] && logs[li].ssGroup;
    if (!g) return [li];
    const unit = [];
    for (let i = 0; i < logs.length; i++) if (logs[i] && logs[i].ssGroup === g) unit.push(i);
    return unit;
  }

  function _unitOpen(logs, unit) {
    return unit.some(i => ((logs[i] && logs[i].sets) || []).some(s => s && !s.done));
  }

  function nextOpenUnit(logs, fromLi) {
    if (!Array.isArray(logs) || !logs.length) return null;
    const own = focusUnitOf(logs, fromLi);
    // Vorwaerts ab fromLi+1, dann Wrap an den Anfang — jede Karte einmal.
    for (let k = 1; k <= logs.length; k++) {
      const i = (((fromLi + k) % logs.length) + logs.length) % logs.length;
      if (own.includes(i)) continue;
      const unit = focusUnitOf(logs, i);
      if (_unitOpen(logs, unit)) return unit[0];
    }
    return null;
  }

  const API = { focusUnitOf: focusUnitOf, nextOpenUnit: nextOpenUnit };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.WorkoutFocus = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
