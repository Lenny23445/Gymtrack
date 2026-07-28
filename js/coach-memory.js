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
        if (dup >= 0) {
          // Bekannt: auffrischen UND ans Ende verschieben, nicht nur den
          // Zeitstempel an der alten Position aendern. Reines ts-Update liess
          // die Array-Position unveraendert - beim Cap-Abschneiden weiter
          // unten (slice vom Kopf) flog dann ein GERADE bestaetigter Eintrag
          // vor einem nie wieder erwaehnten raus, weil er zufaellig weiter
          // vorne im Array stand. Ans Ende verschieben macht die Reihenfolge
          // wieder zu "letzte Erwaehnung", genau das, was der Cap voraussetzt.
          var existing = list[dup];
          existing.ts = now;
          list.splice(dup, 1);
          list.push(existing);
          return;
        }
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

  var STORE_PREFIX = 'gt_coachDossier:';

  // Der Schluessel traegt die uid, weil Abmelden lokale Daten bewusst stehen
  // laesst. Ohne uid im Schluessel wuerde das naechste Konto auf demselben
  // Geraet die Einschraenkungen des vorigen lesen — dieselbe Fehlerklasse wie
  // der bereits behobene pushToken-Bug in doSignOut().
  function dossierKey(uid) { return STORE_PREFIX + String(uid || ''); }

  // Alles, was aus dem Speicher kommt, ist fremd: Altschema, ein anderer
  // App-Stand, per XSS beschriebenes localStorage. Der Inhalt landet danach
  // unter "Einschraenkungen (immer respektieren)" im Coach-Prompt, also gilt
  // hier dieselbe Pruefung wie beim Schreiben (toEntry/Caps/Whitelisten).
  // Rohe Uebernahme hat Strings statt {t,ts} durchgelassen — die Zeile blieb
  // dann mit leerem Inhalt stehen und die Einschraenkung war stumm weg.
  function sanitizeList(raw) {
    var out = [];
    (Array.isArray(raw) ? raw : []).forEach(function (item) {
      var e = toEntry(item, 0);
      if (!e) return;
      var ts = (item && typeof item === 'object') ? item.ts : null;
      // Kein oder unbrauchbarer Zeitstempel => 0. Der Eintrag zaehlt weiter,
      // wird aber als faellig zur Bestaetigung gemeldet statt als frisch.
      e.ts = (typeof ts === 'number' && isFinite(ts) && ts > 0) ? ts : 0;
      // Gleiche Reihenfolge-Korrektur wie in dossierApplyDelta: ein spaeteres
      // Vorkommen im rohen Array ersetzt das fruehere UND wandert ans Ende,
      // statt an der Position des ERSTEN Vorkommens zu verschwinden - sonst
      // trifft der Cap unten (slice vom Kopf) den falschen Eintrag.
      var dup = out.findIndex(function (x) { return norm(x.t) === norm(e.t); });
      if (dup >= 0) out.splice(dup, 1);
      out.push(e);
    });
    return out.length > MAX_ITEMS ? out.slice(out.length - MAX_ITEMS) : out;
  }

  function toCount(n) { return (typeof n === 'number' && isFinite(n) && n > 0) ? n : 0; }

  function dossierLoad(store, uid, now) {
    if (!store || !uid) return dossierEmpty();
    now = now || Date.now();
    var raw;
    try { raw = store.getItem(dossierKey(uid)); } catch (_) { return dossierEmpty(); }
    if (!raw) return dossierEmpty();
    var parsed;
    try { parsed = JSON.parse(raw); } catch (_) { return dossierEmpty(); }
    if (!parsed || typeof parsed !== 'object') return dossierEmpty();
    var base = dossierEmpty();
    LIST_KEYS.forEach(function (k) { base[k] = sanitizeList(parsed[k]); });
    // 42-Tage-Verfall beim Laden statt nur im (bislang von nirgendwo
    // aufgerufenen) dossierStale/dossierRefresh-Paar: ohne diesen Schnitt
    // landet eine Einschraenkung von vor einem halben Jahr fuer immer unter
    // "Einschraenkungen (immer respektieren)" im Prompt, obwohl der 42-Tage-
    // Verfall genau das verhindern soll. Nur Eintraege mit ECHTEM (>0)
    // Zeitstempel gelten als sicher abgelaufen — ein fehlender Zeitstempel
    // (Alt-Schema/Migration, ts===0, s. sanitizeList oben) bleibt weiterhin
    // erhalten und zaehlt stattdessen als faellig zur Bestaetigung, nicht als
    // geloescht. NUR limits verfallen (prefs/works nicht, wie bei
    // dossierStale). Verlust ist STUMM — kein Bestaetigungsdialog existiert
    // bisher (bewusst nicht Teil dieser Aenderung), akzeptierter Kompromiss.
    base.limits = base.limits.filter(function (e) { return !(e.ts > 0 && (now - e.ts) > STALE_MS); });
    // Gleiche Whitelist wie in dossierApplyDelta — sonst kaeme ueber den
    // Lade-Pfad beliebiger Text in die Ziel-/Ton-Zeile des Prompts.
    if (typeof parsed.goal === 'string' && GOALS.indexOf(parsed.goal) >= 0) base.goal = parsed.goal;
    if (typeof parsed.tone === 'string' && TONES.indexOf(parsed.tone) >= 0) base.tone = parsed.tone;
    if (parsed.derived && typeof parsed.derived === 'object') base.derived = parsed.derived;
    if (parsed.coachStats && typeof parsed.coachStats === 'object') {
      base.coachStats = {
        accepted: toCount(parsed.coachStats.accepted),
        ignored:  toCount(parsed.coachStats.ignored),
        muted: Array.isArray(parsed.coachStats.muted)
          ? parsed.coachStats.muted.filter(function (m) { return typeof m === 'string' && m.trim(); })
                                   .slice(0, MAX_ITEMS)
          : []
      };
    }
    base.updatedAt = toCount(parsed.updatedAt);
    return base;
  }

  function dossierSave(store, uid, dossier) {
    if (!store || !uid) return false;
    try { store.setItem(dossierKey(uid), JSON.stringify(dossier || dossierEmpty())); return true; }
    catch (_) { return false; }
  }

  function dossierClear(store, uid) {
    if (!store || !uid) return false;
    try { store.removeItem(dossierKey(uid)); return true; } catch (_) { return false; }
  }

  var API = { dossierEmpty: dossierEmpty, dossierApplyDelta: dossierApplyDelta,
              dossierStale: dossierStale, dossierRefresh: dossierRefresh,
              dossierForPrompt: dossierForPrompt,
              dossierKey: dossierKey, dossierLoad: dossierLoad,
              dossierSave: dossierSave, dossierClear: dossierClear,
              LIST_KEYS: LIST_KEYS, MAX_ITEMS: MAX_ITEMS, MAX_LEN: MAX_LEN,
              TONES: TONES, GOALS: GOALS, STALE_MS: STALE_MS };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachMemory = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
