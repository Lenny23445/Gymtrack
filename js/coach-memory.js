/* GymTrack — Coach-Dossier (Baustein 1)
   Reine Logik, kein DOM- und kein Firestore-Zugriff. Laeuft im Browser ueber
   window.CoachMemory und in Node-Tests ueber require(). */
(function (root) {
  'use strict';

  var LIST_KEYS = ['limits', 'prefs', 'works'];
  var MAX_ITEMS = 8;
  var MAX_LEN   = 120;
  var TONES     = ['ruhig', 'hart', 'analytisch'];
  var GOALS     = ['Masse', 'Kraft', 'Abnehmen', 'Fitness'];

  function dossierEmpty() {
    return {
      v: 1, goal: null,
      limits: [], prefs: [], works: [],
      derived: {},
      coachStats: { accepted: 0, ignored: 0, muted: [] },
      tone: null, updatedAt: 0
    };
  }

  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim(); }

  // Das Modell darf reine Strings ODER {t}-Objekte liefern. Der Zeitstempel
  // kommt IMMER von hier — ein vom Modell geliefertes ts wird verworfen, sonst
  // koennte sich ein Eintrag in die Zukunft datieren und den Verfall aushebeln.
  function toEntry(raw, now) {
    var text = (raw && typeof raw === 'object') ? raw.t : raw;
    text = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (!text) return null;
    return { t: text.slice(0, MAX_LEN), ts: now };
  }

  function dossierApplyDelta(dossier, delta, now) {
    var d = JSON.parse(JSON.stringify(dossier || dossierEmpty()));
    if (!delta || typeof delta !== 'object') return d;
    now = now || Date.now();

    var add = (delta.add && typeof delta.add === 'object') ? delta.add : {};
    LIST_KEYS.forEach(function (key) {
      var incoming = Array.isArray(add[key]) ? add[key] : [];
      var list = Array.isArray(d[key]) ? d[key] : [];
      incoming.forEach(function (raw) {
        var e = toEntry(raw, now);
        if (!e) return;
        var dup = list.findIndex(function (x) { return norm(x.t) === norm(e.t); });
        if (dup >= 0) { list[dup].ts = now; return; }   // bekannt: nur auffrischen
        list.push(e);
      });
      if (list.length > MAX_ITEMS) list = list.slice(list.length - MAX_ITEMS);
      d[key] = list;
    });

    var rm = (delta.remove && typeof delta.remove === 'object') ? delta.remove : {};
    LIST_KEYS.forEach(function (key) {
      var drop = Array.isArray(rm[key]) ? rm[key].map(norm) : [];
      if (!drop.length) return;
      d[key] = (d[key] || []).filter(function (x) { return drop.indexOf(norm(x.t)) < 0; });
    });

    if (typeof delta.goal === 'string' && GOALS.indexOf(delta.goal) >= 0) d.goal = delta.goal;
    if (typeof delta.tone === 'string' && TONES.indexOf(delta.tone) >= 0) d.tone = delta.tone;

    d.v = 1;
    d.updatedAt = now;
    return d;
  }

  var API = { dossierEmpty: dossierEmpty, dossierApplyDelta: dossierApplyDelta,
              LIST_KEYS: LIST_KEYS, MAX_ITEMS: MAX_ITEMS, MAX_LEN: MAX_LEN,
              TONES: TONES, GOALS: GOALS };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachMemory = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
