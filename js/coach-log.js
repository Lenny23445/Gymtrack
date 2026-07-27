/* GymTrack — Coach-Aktions-Log (Baustein 2)
   Reine Logik. Das Roh-Log bleibt lokal; nach oben gehen nur Aggregate. */
(function (root) {
  'use strict';

  var MAX_ENTRIES = 50;
  var MUTE_AFTER  = 5;

  function logEmpty() { return []; }

  function logAction(log, entry, now) {
    var out = (log || []).slice();
    if (!entry || !entry.kind) return out;
    out.push({
      ts: now || Date.now(),
      kind: String(entry.kind),
      exId: entry.exId ? String(entry.exId) : null,
      accepted: !!entry.accepted
    });
    if (out.length > MAX_ENTRIES) out = out.slice(out.length - MAX_ENTRIES);
    return out;
  }

  function logOutcome(log, exId, kind, outcomeW) {
    var out = (log || []).slice();
    for (var i = out.length - 1; i >= 0; i--) {
      if (out[i].exId === exId && out[i].kind === kind && out[i].accepted) {
        out[i] = Object.assign({}, out[i], { outcomeW: outcomeW });
        return out;
      }
    }
    return out;
  }

  // Zaehlt je Typ von hinten, wie viele Ignorierungen OHNE zwischenzeitliche
  // Annahme aufgelaufen sind. Eine spaetere Annahme hebt die Drosselung damit
  // automatisch wieder auf — der Coach bleibt lernfaehig statt dauerhaft still.
  function streakIgnored(log, kind) {
    var n = 0;
    for (var i = (log || []).length - 1; i >= 0; i--) {
      if (log[i].kind !== kind) continue;
      if (log[i].accepted) break;
      n++;
    }
    return n;
  }

  function isMuted(log, kind) { return streakIgnored(log, kind) >= MUTE_AFTER; }

  function logStats(log) {
    var l = log || [];
    var accepted = 0, ignored = 0, kinds = {};
    l.forEach(function (e) {
      if (e.accepted) accepted++; else ignored++;
      kinds[e.kind] = true;
    });
    var muted = Object.keys(kinds).filter(function (k) { return isMuted(l, k); });
    return { accepted: accepted, ignored: ignored, muted: muted };
  }

  var API = { logEmpty: logEmpty, logAction: logAction, logOutcome: logOutcome,
              logStats: logStats, isMuted: isMuted,
              MAX_ENTRIES: MAX_ENTRIES, MUTE_AFTER: MUTE_AFTER };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachLog = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
