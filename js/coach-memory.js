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

  var STALE_MS = 42 * 86400000;
  var PROMPT_MAX = 4000;

  // Nur Einschraenkungen verfallen. Vorlieben und was funktioniert hat altern
  // nicht — eine Schulterbeschwerde von vor einem halben Jahr blockiert sonst
  // dauerhaft alle Ueberkopfuebungen.
  function dossierStale(dossier, now) {
    now = now || Date.now();
    return ((dossier && dossier.limits) || [])
      .filter(function (e) { return (now - (e.ts || 0)) > STALE_MS; })
      .map(function (e) { return e.t; });
  }

  function dossierRefresh(dossier, text, stillValid, now) {
    var d = JSON.parse(JSON.stringify(dossier || dossierEmpty()));
    now = now || Date.now();
    var key = norm(text);
    if (stillValid) {
      (d.limits || []).forEach(function (e) { if (norm(e.t) === key) e.ts = now; });
    } else {
      d.limits = (d.limits || []).filter(function (e) { return norm(e.t) !== key; });
    }
    d.updatedAt = now;
    return d;
  }

  function dossierForPrompt(dossier) {
    var d = dossier || dossierEmpty();
    var out = [];
    if (d.goal) out.push('Ziel: ' + d.goal);
    if (d.tone) out.push('Bevorzugter Ton: ' + d.tone);
    if ((d.limits || []).length)
      out.push('Einschraenkungen (immer respektieren): ' + d.limits.map(function (e) { return e.t; }).join('; '));
    if ((d.prefs || []).length)
      out.push('Vorlieben: ' + d.prefs.map(function (e) { return e.t; }).join('; '));
    if ((d.works || []).length)
      out.push('Hat bei diesem Nutzer funktioniert: ' + d.works.map(function (e) { return e.t; }).join('; '));
    if (d.derived && Array.isArray(d.derived.stall) && d.derived.stall.length)
      out.push('Stagniert seit mehreren Einheiten: ' + d.derived.stall.join(', '));
    var muted = (d.coachStats && d.coachStats.muted) || [];
    if (muted.length)
      out.push('Diese Vorschlagstypen NICHT mehr vorschlagen: ' + muted.join(', '));
    // Hartes Abschneiden auf PROMPT_MAX. Dass die Einschraenkungs-Zeile dabei nie
    // mitten im Text landet, ist KEIN eigener Schutz hier, sondern haengt an der
    // Reihenfolge oben (Ziel/Ton/Einschraenkungen stehen frueh in 'out') und den
    // kleinen Caps (MAX_ITEMS/MAX_LEN) - siehe Test dazu in coach-memory.test.js.
    // Reihenfolge oder Caps NICHT aendern, ohne diese Annahme neu zu pruefen.
    return out.join('\n').slice(0, PROMPT_MAX);
  }

  var API = { dossierEmpty: dossierEmpty, dossierApplyDelta: dossierApplyDelta,
              dossierStale: dossierStale, dossierRefresh: dossierRefresh,
              dossierForPrompt: dossierForPrompt,
              LIST_KEYS: LIST_KEYS, MAX_ITEMS: MAX_ITEMS, MAX_LEN: MAX_LEN,
              TONES: TONES, GOALS: GOALS, STALE_MS: STALE_MS };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachMemory = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
