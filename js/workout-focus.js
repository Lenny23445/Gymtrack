/* GymTrack — Fokus-Modus im aktiven Training (pure Logik, kein DOM)

   Drei Helfer fuer die Fokus-Schicht in index.html:
   - focusUnitOf: Superset-Gruppe (ssGroup) = EINE Fokus-Einheit.
   - nextOpenUnit: Ziel fuers Auto-Weiterscrollen nach dem letzten Satz.
   - pickFocused: welche Karte liegt unter der Mittellinie des Sichtbereichs.
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

  function pickFocused(rects, mid) {
    if (!Array.isArray(rects) || !rects.length) return -1;
    let best = -1, bestDist = Infinity;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (r.top <= mid && mid < r.bottom) return i;   // Ueberdeckung schlaegt alles
      const d = Math.abs((r.top + r.bottom) / 2 - mid);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  /* pickFocused allein waehlt bei JEDER Bewegung neu — und weil zwei Karten an
     der Mittellinie fast gleich weit weg liegen koennen, kippte der Fokus beim
     Scrollen mehrfach hin und her. Das ist die Unruhe, die als Flackern auffiel.

     pickFocusedStable gibt der bereits gewaehlten Karte einen Vorsprung:
       1. Beruehrt sie die Mittellinie noch, behaelt sie den Fokus.
       2. Sonst gewinnt der Herausforderer erst, wenn er um mehr als 'slack'
          Pixel naeher an der Mitte liegt.
     Damit wechselt der Fokus einmal sauber statt dreimal zittrig. 'cur' ist der
     INDEX in rects (nicht die Uebungsnummer); ein unbrauchbares cur faellt auf
     die schlichte Wahl zurueck, damit der erste Aufruf ohne Vorzustand
     funktioniert. */
  function pickFocusedStable(rects, mid, cur, slack) {
    const best = pickFocused(rects, mid);
    if (best < 0) return best;
    if (cur == null || cur < 0 || cur >= rects.length || cur === best) return best;
    const r = rects[cur];
    if (!r) return best;
    if (r.top <= mid && mid < r.bottom) return cur;
    const s = (typeof slack === 'number' && isFinite(slack) && slack > 0) ? slack : 0;
    const dist = x => Math.abs((x.top + x.bottom) / 2 - mid);
    return dist(r) <= dist(rects[best]) + s ? cur : best;
  }

  const API = { focusUnitOf: focusUnitOf, nextOpenUnit: nextOpenUnit,
                pickFocused: pickFocused, pickFocusedStable: pickFocusedStable };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.WorkoutFocus = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
