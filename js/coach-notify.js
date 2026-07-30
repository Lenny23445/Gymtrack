/* Platzhalter fuer den roten Lauf — wird durch die Umsetzung ersetzt. */
(function (root) {
  'use strict';
  var API = {
    notifyNew: function () { return {}; },
    weekKey: function () { return null; },
    dayKey: function () { return ''; },
    mayNotify: function () { return true; },
    record: function (s) { return s; },
    planAll: function () { return []; },
    CAPS: {},
    COOLDOWN: {},
    UNCAPPED: []
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CoachNotify = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
