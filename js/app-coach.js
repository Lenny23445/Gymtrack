function _rpeFlushTrend() {
  try {
    if (!Array.isArray(_rpeAnswers) || _rpeAnswers.length < 3) { _rpeAnswers = []; return; }
    const sum = window.CoachRpe.summarize(_rpeAnswers);
    _rpeAnswers = [];
    if (!sum || sum.trend === 'ok') return;
    const txt = sum.trend === 'hard'
      ? _cm('Die letzten Sätze fühlten sich schwer an.', 'Recent sets felt hard.')
      : _cm('Die letzten Sätze fühlten sich leicht an.', 'Recent sets felt easy.');
    const delta = { add: sum.trend === 'hard' ? { limits: [txt] } : { works: [txt] } };
    _dossierSet(window.CoachMemory.dossierApplyDelta(_dossier(), delta, Date.now()));
  } catch(e) { console.warn('[Coach] RPE-Trend:', e); }
}

// Dropsatz-Chance nach dem letzten Satz einer Übung. Rein lokal: keine Zahl
// hier stammt aus einem Modell, alles kommt aus dem eigenen Log. Gibt true
// zurück, wenn eine Karte gesetzt wurde — der Aufrufer hört dann auf.
function _coachDropChance(li, si, set, w, r, ex) {
  const log = wkLogs[li]; if (!log) return false;
  const sets = log.sets || [];
  if (si !== sets.length - 1) return false;              // nur NACH dem letzten Satz
  if (sets.some(s => !s.done)) return false;             // Übung noch nicht durch
  // "Es war noch Luft": oberes Ende des Wdh-Bereichs erreicht, oder der Satz
  // war ausdrücklich bis zum Versagen. Beides sind Angaben des Nutzers, keine
  // Schätzung.
  const { max } = repRange(ex);
  const bisVersagen = (set.type || 'normal') === 'fail';
  if (!bisVersagen && !(max && r >= max)) return false;
  const key = log.exerciseId + '|dropchance';
  if (_coachState.seen.indexOf(key) !== -1) return false;
  // Im Deload/Schonmodus keine Intensitätstechnik — dieselbe Regel, die auch
  // der Worker-Prompt dem Modell gibt (_ciReadiness steuert die Progression).
  try { const rd = _ciReadiness(); if (rd && (rd.mode === 'deload' || rd.mode === 'hold')) return false; } catch(_) {}
  // Wer Dropsätze wiederholt weggeklickt hat, bekommt sie nicht weiter angeboten.
  try { if (window.CoachLog.logStats(S.coachLog || []).muted.indexOf('dropSet') >= 0) return false; } catch(_) {}
  // Völlig platte Muskulatur: dann ist Schluss die bessere Antwort.
  let fatPct = 0;
  try { const rec = getMuscleGroupRecovery(); const mg = ex.muscleGroup || '';
        if (mg && rec[mg]) fatPct = rec[mg].fatPct || 0; } catch(_) {}
  if (fatPct >= 75) return false;

  const dropW = roundToStep(w * 0.75);                   // 25 % runter (SET_TYPE_DESC: 20–40 %)
  if (!(dropW > 0) || dropW >= w) return false;
  _coachState.seen.push(key);
  try { _saveActiveWk(); } catch(_) {}
  const grund = bisVersagen
    ? _cm('Letzter Satz bis zum Versagen', 'Last set taken to failure')
    : _cm('Letzter Satz am oberen Wiederholungsende (' + r + ')', 'Last set at the top of the rep range (' + r + ')');
  _coachCard = { exId: log.exerciseId, c: {
    title: _cm('Dropsatz-Chance', 'Drop-set opportunity'),
    text: grund + _cm('. Ohne Pause weiter mit ' + kgToDisp(dropW) + ' ' + unitLabel()
                      + ' bis es wieder nicht mehr geht — holt zusätzlichen Reiz, ohne die nächste Übung zu kosten.',
                      '. Keep going without a break at ' + kgToDisp(dropW) + ' ' + unitLabel()
                      + ' until you fail again — extra stimulus without costing you the next exercise.'),
    options: [
      { label: _cm('Dropsatz ', 'Drop set ') + kgToDisp(dropW) + ' ' + unitLabel(), action: { kind: 'dropSet', value: dropW } },
      { label: _cm('Fertig hier', 'Done here'), action: { kind: 'none' } },
    ],
  }, applied: false, baseW: w, timer: null };
  renderLogCards();
  try { _coachBarSet('msg', _cm('Dropsatz-Chance erkannt.', 'Drop-set opportunity detected.'), 6000); } catch(_) {}
  _coachCard.timer = setTimeout(() => {
    if (_coachCard && _coachCard.exId === log.exerciseId && !_coachCard.applied) { _coachClearCard(); renderLogCards(); }
  }, 45000);
  return true;
}
/* Andere Schreibweisen derselben Uebung. Die Zuordnung steht bereits im
   Anzeige-Woerterbuch (I18N_EN) — dort als "deutscher Eintrag -> englische
   Anzeige". Fuer den Namensriegel wird sie in BEIDE Richtungen gelesen: heisst
   die Uebung des Nutzers "Bench Press", ist "Bankdruecken" das Alias; heisst sie
   "Bankdruecken", ist es "Bench Press". */
function _exNameAliases(name) {
  const out = [];
  if (!name) return out;
  try {
    const en = I18N_EN[name];
    if (typeof en === 'string' && en) out.push(en);
    for (const k in I18N_EN) { if (I18N_EN[k] === name) out.push(k); }
  } catch(_) {}
  return out;
}
/* Der Riegel selbst: Titel, Text und Knopfbeschriftungen einer Coach-Karte
   tragen den Namen, unter dem die Uebung angelegt wurde — auch wenn das Modell
   sich nicht an den Prompt gehalten hat. Ein Prompt ist eine Bitte; das hier
   ist die Zusage. */
function _coachKeepExName(c, ex) {
  if (!c || !ex || !ex.name) return c;
  // Ziel ist der ANZEIGE-Name: derselbe, der auf der Uebungskarte steht. Im
  // deutschen Modus ist das der gespeicherte Name, im englischen der aus
  // I18N_EN — der gespeicherte wird dort selbst zum Alias.
  const ziel = _exDisp(ex.name);
  const al = _exNameAliases(ex.name).concat([ex.name])
    .filter(a => a && a.trim().toLowerCase() !== String(ziel).trim().toLowerCase());
  if (!al.length) return c;
  const fix = t => window.CoachCues.keepName(t, ziel, al);
  if (typeof c.title === 'string') c.title = fix(c.title);
  if (typeof c.text  === 'string') c.text  = fix(c.text);
  if (Array.isArray(c.options)) c.options.forEach(o => {
    if (o && typeof o.label === 'string') o.label = fix(o.label);
  });
  return c;
}

/* Derselbe Riegel, aber fuer JEDEN Modelltext statt nur fuer die Live-Karte.
   Der Live-Coach kennt die eine Uebung, um die es gerade geht; Chat, Analyse
   und Wochenbericht reden dagegen ueber die ganze Liste — dort war der Prompt
   bisher die einzige Absicherung, und die haelt nicht: heisst die Uebung des
   Nutzers "Deadlift", schrieb das Modell im deutschen Text zuverlaessig
   "Kreuzheben". Der laengste Name kommt zuerst dran, damit "Rumaenisches
   Kreuzheben" nicht vom kuerzeren "Kreuzheben" zerlegt wird. */
function _exNameGuardList() {
  const out = [];
  try {
    (S.exercises || []).forEach(ex => {
      const n = (ex && typeof ex.name === 'string') ? ex.name.trim() : '';
      if (!n) return;
      const ziel = String(_exDisp(n)).trim();
      const al = _exNameAliases(n).concat([n])
        .filter(a => a && a.trim().toLowerCase() !== ziel.toLowerCase());
      if (al.length) out.push({ name: ziel, aliases: al });
    });
  } catch(_) {}
  return out.sort((a, b) => b.name.length - a.name.length);
}
function _aiKeepExNames(text) {
  if (typeof text !== 'string' || !text) return text;
  try {
    if (!window.CoachCues || !window.CoachCues.keepName) return text;
    let out = text;
    _exNameGuardList().forEach(e => { out = window.CoachCues.keepName(out, e.name, e.aliases); });
    return out;
  } catch(e) { console.warn('[Coach] Namensriegel:', e); return text; }
}
/* Wochensaetze und Reiztage je Muskelgruppe — die Bruecke von S.sessions auf
   das reine Rechenmodul CoachVolume. Das Fenster steht auf vier Wochen: eine
   einzelne Woche schwankt zu stark (ein verschobener Termin macht aus 'zu
   wenig' ein 'passt'), vier Wochen sind der uebliche Beobachtungszeitraum.
   Aufwaermsaetze zaehlen nicht mit — _workSets filtert sie. */
function _volRows() {
  const rows = [];
  try {
    (S.sessions || []).forEach(s => {
      if (!s || !s.date) return;
      const ts = new Date(s.date).getTime();
      if (!isFinite(ts)) return;
      (s.logs || []).forEach(l => {
        const ex = exById(l && l.exerciseId);
        if (!ex || !ex.muscleGroup) return;
        const n = _workSets(l.sets || []).length;
        if (n > 0) rows.push({ ts, mg: ex.muscleGroup, sets: n });
      });
    });
  } catch(e) { console.warn('[Coach] Volumenzeilen:', e); }
  return rows;
}
function _volVerdict(weeks) {
  try {
    if (!window.CoachVolume) return [];
    return CoachVolume.verdict(CoachVolume.weekLoad(_volRows(), Date.now(), weeks || 4));
  } catch(e) { console.warn('[Coach] Volumenurteil:', e); return []; }
}
/* Fuer strukturierte Modellantworten (Analyse, Plan): jede Zeichenkette im
   Baum durchlaeuft den Riegel. Ein Feld einzeln aufzuzaehlen hiesse, ihn beim
   naechsten neuen Feld im Schema wieder zu vergessen. Ersetzt wird nur, was
   auf einen Alias einer echten Nutzer-Uebung passt — alles andere bleibt. */
function _aiKeepExNamesDeep(v) {
  try {
    if (typeof v === 'string') return _aiKeepExNames(v);
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) v[i] = _aiKeepExNamesDeep(v[i]); return v; }
    if (v && typeof v === 'object') { for (const k in v) v[k] = _aiKeepExNamesDeep(v[k]); return v; }
    return v;
  } catch(e) { console.warn('[Coach] Namensriegel:', e); return v; }
}

/* ── EINE Entscheidungsflaeche ───────────────────────────────────────────────
   Frueher gab es zwei Wege, auf denen dasselbe passieren konnte: die App senkte
   das Gewicht selbst (Satz-Einschaetzung), und kurz darauf bot die KI-Karte an,
   genau das noch einmal zu tun. Fuer den Nutzer kreuzte sich das — einmal war
   es schon geschehen, einmal wurde gefragt.

   Ab hier gilt: JEDE Aenderung am Plan ist ein Angebot mit Knopf. Angeboten
   wird auf derselben Karte wie Top- und Dropsatz, und es gibt immer nur EINE
   offene Karte (_coachCard). Solange sie offen ist, schlaegt niemand etwas
   Neues vor — auch die KI nicht (Riegel am Kopf von _coachEvalRun).           */
const COACH_CARD_MS = 45000;
function _coachOffer(exId, c, baseW) {
  _coachClearCard();
  _coachCard = { exId, c, applied: false, baseW: baseW || 0, timer: null };
  renderLogCards();
  try { _coachBarSet('msg', c.title || '', 6000); } catch(_) {}
  _coachCard.timer = setTimeout(() => {
    if (_coachCard && _coachCard.exId === exId && !_coachCard.applied) {
      _coachClearCard(); renderLogCards();
    }
  }, COACH_CARD_MS);
  return true;
}
// Eine offene, unbeantwortete Karte blockiert jeden weiteren Vorschlag.
function _coachCardOffen() { return !!(_coachCard && !_coachCard.applied); }

/* Relativer Progressionssprung je Muskelgruppe. Uebliche Praxis in der
   Kraftlehre: an den grossen Ketten (Beine, Ruecken) sind 5 Prozent ein
   normaler Schritt, an der Brust rund 3, an kleinen eingelenkigen Muskeln
   (Schultern, Arme, Rumpf) 2,5 — dort ist die absolute Last so klein, dass
   5 Prozent oft unter der kleinsten Scheibe liegen und der naechste moegliche
   Sprung schon ein Satz-Killer ist. */
function _coachProgPct(mg) {
  return ({ beine: 0.05, ruecken: 0.05, brust: 0.035 })[mg] || 0.025;
}

/* ── VOLUMEN: Satz raus / Satz dazu ───────────────────────────────────────────
   Rein lokal und ohne Modell-Aufruf, aus denselben Zahlen, die auch die
   Gewichtsvorschlaege tragen: Leistungsverlauf INNERHALB der Uebung, Ermuedung
   der Muskelgruppe (Erholungsmodell) und die Lage aus dem Check-in.

   Warum das ueberhaupt hier entschieden wird und nicht vom Modell: ein Satz
   mehr oder weniger ist eine Planaenderung. Sie muss erklaerbar und
   reproduzierbar sein ("zehn Prozent unter deinem besten Satz heute, 62 Prozent
   Ermuedung"), und sie darf nicht davon abhaengen, ob gerade Empfang da ist.

   Hoechstens EINE Volumenaenderung je Uebung und Einheit (_coachState.seen) —
   sonst schrumpfte eine schwere Uebung Satz fuer Satz auf null.               */
function _coachVolumeAdjust(li, si) {
  const log = wkLogs[li]; if (!log) return false;
  const ex = exById(log.exerciseId); if (!ex || ex.targetType === 'time') return false;
  const key = log.exerciseId + '|vol';
  if (_coachState.seen.indexOf(key) !== -1) return false;

  const done = _loggedWorkSets(log.sets);
  if (done.length < 2) return false;              // ein einzelner Satz ist kein Verlauf
  const offenIdx = [];
  (log.sets || []).forEach((s, i) => { if (!s.done && (s.type || 'normal') !== 'warmup') offenIdx.push(i); });

  let fatPct = 0;
  try {
    const mgRec = getMuscleGroupRecovery();
    if (ex.muscleGroup && mgRec[ex.muscleGroup]) fatPct = mgRec[ex.muscleGroup].fatPct || 0;
  } catch(_) {}
  let mode = null;
  try { const rd = _ciReadiness(); if (rd) mode = rd.mode; } catch(_) {}
  const gebremst = (mode === 'deload' || mode === 'hold' || mode === 'easy');

  // Leistungsabfall innerhalb der Uebung: bester Satz von heute gegen den
  // zuletzt gehobenen. Epley normiert Gewicht und Wiederholungen auf eine Zahl,
  // sonst waeren "5 kg mehr bei 3 Wdh weniger" nicht vergleichbar.
  const e1 = s => epley1RM(s.w, s.r);
  const best = Math.max.apply(null, done.map(e1));
  const letzt = e1(done[done.length - 1]);
  const abfall = best > 0 ? (best - letzt) / best : 0;
  const schwer = done.filter(s => s.rpeAnswer === 'hard').length;

  // Wochenvolumen der Muskelgruppe: der zweite Massstab neben dem Verlauf
  // innerhalb der Uebung. Eine Gruppe knapp ueber der Wirksamkeitsschwelle
  // verliert durch einen gestrichenen Satz mehr, als der Ermuedungsschutz
  // bringt — umgekehrt ist ein Satz mehr sinnlos, wenn die Woche ohnehin am
  // oberen Ende liegt.
  const woche = _weekSetsForMg(ex.muscleGroup || '');
  const wocheVoll  = woche >= MG_WEEK_MAX;
  const wocheDuenn = woche > 0 && woche < MG_WEEK_MIN;

  // SATZ RAUS: es muss noch mehr als ein Arbeitssatz offen sein — den letzten
  // offenen zu streichen waere kein Volumenschnitt, sondern ein Abbruch.
  // Unter der Wochen-Untergrenze nur bei deutlichem Einbruch: dort kostet ein
  // gestrichener Satz mehr Reiz, als er Erholung spart.
  if (offenIdx.length >= 2 &&
      (!wocheDuenn || abfall >= 0.15) &&
      (abfall >= 0.10 || schwer >= 2 || (fatPct >= 60 && abfall >= 0.05) ||
       (gebremst && fatPct >= 45 && abfall >= 0.05) ||
       (wocheVoll && (abfall >= 0.05 || fatPct >= 45)))) {
    _coachState.seen.push(key);
    let txt = ''; try { txt = _say('volCut', { pct: Math.round(fatPct) }) || ''; } catch(_) {}
    return _coachOffer(log.exerciseId, {
      title: _cm('Einen Satz streichen?', 'Drop a set?'),
      text: txt || _cm('Ermüdung ' + Math.round(fatPct) + ' Prozent.',
                       'Fatigue at ' + Math.round(fatPct) + ' percent.'),
      options: [
        { label: _cm('Satz raus', 'Drop it'), action: { kind: 'removeSet' } },
        { label: _cm('Behalten', 'Keep it'),  action: { kind: 'none' } },
      ],
    }, 0);
  }

  // SATZ DAZU: erst wenn die Uebung sonst zu Ende waere, und nur bei frischer
  // Muskulatur ohne Leistungsabfall. Im Deload/Hold gar nicht — dort hat der
  // Check-in bereits entschieden, dass heute weniger richtig ist.
  // Ueber der Wochen-Obergrenze gar nicht: dort ist mehr Volumen kein
  // zusaetzlicher Reiz mehr, sondern nur zusaetzliche Erholungslast.
  if (offenIdx.length === 0 && !gebremst && !wocheVoll && fatPct < 30 && abfall <= 0.02) {
    const { max } = repRange(ex);
    const amLimit = done.every(s => s.type === 'fail' || parseInt(s.r) >= max);
    // Unter der Wirksamkeitsschwelle genuegt ein sauberer Verlauf: dort fehlt
    // schlicht Volumen, und darauf zu warten, dass jeder Satz das obere
    // Wiederholungsende trifft, verschenkt Wochen.
    if (amLimit || wocheDuenn) {
      _coachState.seen.push(key);
      let txt = ''; try { txt = _say('volAdd', { pct: Math.round(fatPct) }) || ''; } catch(_) {}
      return _coachOffer(log.exerciseId, {
        title: _cm('Noch einen Satz?', 'One more set?'),
        text: txt || _cm('Ermüdung ' + Math.round(fatPct) + ' Prozent, Leistung stabil.',
                         'Fatigue at ' + Math.round(fatPct) + ' percent, output steady.'),
        options: [
          { label: _cm('Satz dazu', 'Add a set'), action: { kind: 'extraSet' } },
          { label: _cm('Fertig hier', 'Done here'), action: { kind: 'none' } },
        ],
      }, 0);
    }
  }
  return false;
}

/* ── WIEDERHOLUNGSBEREICH nachziehen ─────────────────────────────────────────
   Nur bei einem echten Missverhaeltnis, und zwar mit STRIKTER Ungleichung:
   "alle Saetze am oberen Ende" ist der Normalfall der Double Progression und
   bedeutet mehr GEWICHT, nicht einen anderen Bereich. Erst wenn ueber zwei
   Einheiten hinweg jeder Arbeitssatz ausserhalb des Bereichs landet, passt der
   Bereich selbst nicht. Verschoben wird um zwei Wiederholungen, die Spanne
   bleibt — der Nutzer hat sie gewaehlt.                                        */
function _coachRepRangeAdjust(li) {
  const log = wkLogs[li]; if (!log) return false;
  const ex = exById(log.exerciseId); if (!ex || ex.targetType === 'time') return false;
  const key = log.exerciseId + '|range';
  if (_coachState.seen.indexOf(key) !== -1) return false;
  const heute = _loggedWorkSets(log.sets);
  if (heute.length < 2) return false;
  const hist = exHistory(log.exerciseId);
  if (!hist.length) return false;
  const vorher = _workSets(hist[hist.length - 1].sets || []);
  if (vorher.length < 2) return false;

  const { min, max } = repRange(ex);
  const spanne = max - min;
  const alle = (list, f) => list.every(s => f(parseInt(s.r) || 0));
  let neuMin = null;
  if (alle(heute, r => r > max) && alle(vorher, r => r > max))      neuMin = min + 2;
  else if (alle(heute, r => r < min) && alle(vorher, r => r < min)) neuMin = min - 2;
  if (neuMin == null) return false;
  neuMin = Math.max(3, Math.min(22, neuMin));
  const neuMax = Math.max(neuMin, Math.min(25, neuMin + spanne));
  if (neuMin === min && neuMax === max) return false;

  _coachState.seen.push(key);
  const lbl = neuMin === neuMax ? String(neuMax) : (neuMin + '–' + neuMax);
  let txt = ''; try { txt = _say('repRange', { reps: lbl }) || ''; } catch(_) {}
  // Der Bereich gehoert zur Uebung und ueberdauert das Training — erst recht
  // eine Sache, die der Nutzer entscheidet und nicht die App.
  return _coachOffer(log.exerciseId, {
    title: _cm('Wiederholungsbereich anpassen?', 'Adjust the rep range?'),
    text: txt || _cm('Vorschlag: ' + lbl + ' Wiederholungen.', 'Suggestion: ' + lbl + ' reps.'),
    options: [
      { label: _cm('Auf ', 'To ') + lbl, action: { kind: 'repRange', min: neuMin, max: neuMax } },
      { label: _cm('Lassen', 'Leave it'), action: { kind: 'none' } },
    ],
  }, 0);
}

/* ── BACKOFF-ERKENNUNG ──────────────────────────────────────────────────────
   Ist der Satz an Position si ein geplanter Backoff-Satz?

   Drei Bedingungen, und jede einzelne davon trennt ihn von etwas anderem:

   1. Der VORIGE Satz war der schwerste der Uebung bis hierher. Ohne das waere
      jeder leichtere Satz irgendwo in der Mitte ein Backoff — der Backoff
      folgt aber dem Spitzensatz, das ist seine Definition.
   2. Das Gewicht liegt 8 bis 20 % darunter. Weniger als 8 % ist Rauschen
      (eine Hantelstufe), mehr als 20 % ist kein Backoff mehr, sondern ein
      Drop-Satz oder ein Einbruch.
   3. Die Wiederholungen sind GESTIEGEN. Das ist die eigentliche Unterschrift:
      weniger Gewicht bei mehr Wiederholungen ist eine Entscheidung. Weniger
      Gewicht bei gleichen oder weniger Wiederholungen ist ein Leistungsabfall,
      und dazu soll der Coach weiterhin etwas sagen duerfen.

   Bewusst ohne Zugriff auf S, wkLogs, Uhr oder Oberflaeche: hereingegeben wird
   der Uebungs-Log, die Position und die eingetragenen Zahlen, heraus kommt ja
   oder nein. Deshalb laesst sich die Regel nachrechnen statt nur nachsehen.

   Aufwaermsaetze zaehlen beim Spitzenwert NICHT mit — sonst wuerde ein
   schweres Aufwaermen (das es nicht geben sollte, aber gibt) den Vergleich
   verschieben. */
function _coachIsBackoff(log, si, w, r) {
  const sets = (log && log.sets) || [];
  if (!(si >= 1) || !(w > 0) || !(r > 0)) return false;

  const vor = sets[si - 1];
  if (!vor) return false;
  if ((vor.type || 'normal').toLowerCase() === 'warmup') return false;
  const vw = parseFloat(vor.w) || 0, vr = parseInt(vor.r) || 0;
  if (!(vw > 0) || !(vr > 0)) return false;

  // War der vorige Satz der schwerste der bisherigen Arbeitssaetze?
  let spitze = 0;
  for (let i = 0; i < si; i++) {
    const s = sets[i]; if (!s) continue;
    if ((s.type || 'normal').toLowerCase() === 'warmup') continue;
    const sw = parseFloat(s.w) || 0;
    if (sw > spitze) spitze = sw;
  }
  if (vw < spitze) return false;

  const anteil = w / vw;
  if (!(anteil >= 0.80 && anteil <= 0.92)) return false;

  return r > vr;
}

function _coachEvalRun(li, si) {
  if (!isPremium() || _coachLevel() === 'off') return;
  // Solange eine Karte offen und unbeantwortet ist, wird NICHTS Neues
  // vorgeschlagen — weder lokal noch von der KI. Genau hier kreuzten sich
  // frueher zwei Vorschlaege zur selben Sache.
  if (_coachCardOffen()) return;
  const log = wkLogs[li]; if (!log) return;
  const set = log.sets && log.sets[si]; if (!set) return;
  const ex = exById(log.exerciseId); if (!ex || ex.targetType === 'time') return;
  if ((set.type || 'normal') === 'warmup') return;
  const w = parseFloat(set.w), r = parseInt(set.r);
  if (!(w > 0) || !(r > 0)) return; // erst wenn BEIDES eingetragen ist

  if (!_coachState) _coachState = _coachDefaultState();

  /* ── GEPLANTER BACKOFF-SATZ: ganz vorne, weil er alles Weitere ausschaltet.
     Ein Satz mit weniger Gewicht und MEHR Wiederholungen direkt nach dem
     schwersten Satz der Uebung ist kein Leistungsabfall, sondern die Absicht.
     Liefe er weiter durch die Kette, meldete der Coach "Gewicht eingebrochen"
     zu genau dem Satz, den der Nutzer bewusst so gefahren hat — das ist nicht
     nur nutzlos, es widerspricht dem Plan.

     Rein lokal, kostet also keinen Call und braucht kein Netz — dieselbe
     Begruendung wie bei der Dropsatz-Chance direkt darunter.

     Geflaggt wird nur, was noch keinen eigenen Typ traegt: eine manuelle
     Auswahl des Nutzers ist die staerkere Aussage und bleibt stehen. */
  if (_coachIsBackoff(log, si, w, r)) {
    if ((set.type || 'normal').toLowerCase() === 'normal') {
      set.type = 'backoff';
      try { renderLogCards(); } catch(_) {}
      try { _saveActiveWk(); } catch(_) {}
    }
    return;
  }

  // ── DROPSATZ-CHANCE: lokal entschieden, deshalb VOR den Online-, Quota- und
  // Rate-Limits. Sie kostet keinen Call und funktioniert ohne Netz — dieselbe
  // Begründung wie bei der Top-Satz-Chance weiter unten, nur dass die hier
  // NACH dem letzten Satz greift statt davor.
  //
  // Die Lage ist eindeutig genug für eine lokale Entscheidung: der letzte Satz
  // der Übung ist gelaufen UND es war noch Luft (oberes Ende des Wdh-Bereichs
  // erreicht oder ausdrücklich bis zum Versagen gegangen). Genau dann ist eine
  // Intensitätstechnik am Ende der Übung Lehrbuch — Gewicht runter, ohne Pause
  // weiter. Prozentsatz aus der eigenen Erklärung in SET_TYPE_DESC (20–40 %),
  // genommen wird die Mitte.
  if (_coachDropChance(li, si, set, w, r, ex)) return;

  // Volumen und Wiederholungsbereich: ebenfalls lokal, ebenfalls kostenlos,
  // ebenfalls vor dem Netz-Check. Beides sind Planaenderungen aus eigenen
  // Zahlen — sie duerfen nicht davon abhaengen, ob gerade Empfang da ist.
  try { if (_coachVolumeAdjust(li, si)) return; } catch(e) { console.warn('[Coach] Volumen:', e); }
  try { if (_coachRepRangeAdjust(li))   return; } catch(e) { console.warn('[Coach] Wdh-Bereich:', e); }

  // Ab hier ist alles Weitere ein MODELL-Aufruf. Der Netz-Check stand früher ganz
  // oben und hat damit auch die lokalen, kostenlosen Auswertungen abgewürgt —
  // ohne Empfang gab es gar keinen Live-Coach mehr, obwohl Top- und Dropsatz-
  // Chance rein aus den eigenen Zahlen entschieden werden.
  if (navigator.onLine === false) return;

  // Client-seitige Rate-Limits — VOR jeder Auswertung prüfen (spart Rechenzeit/Calls)
  if (_coachState.calls >= 5) return;                                    // max. 5 Calls/Training
  if ((_coachState.perExercise[log.exerciseId] || 0) >= 2) return;       // max. 2 Calls/Übung/Training
  if (Date.now() - (_coachState.lastCallTs || 0) < 60 * 1000) return;    // 60s Cooldown
  if (_coachQuotaExhausted()) return;                                    // Monatslimit clientseitig schon voll

  // Vergleichs-Basis: letzte VERGANGENE Einheit mit dieser Übung. exHistory() liest
  // nur S.sessions — das laufende Training landet dort erst in finishWk(), zählt
  // hier also nie versehentlich mit.
  const hist = exHistory(log.exerciseId);
  if (!hist.length) return;
  // Arbeitssatz gegen Arbeitssatz (siehe _lastWorkBase) — der rohe Satz-Index
  // traf sonst Aufwaermsaetze der letzten Einheit. Basis ist der Median der
  // letzten drei Einheiten (_coachRefSets), nicht die letzte allein.
  const base = _lastWorkBase(_coachRefSets(log.exerciseId), _workPosOf(log.sets, si));
  if (!base) return;
  const lastW = parseFloat(base.w) || 0, lastR = parseInt(base.r) || 0;
  if (!(lastW > 0) || !(lastR > 0)) return;
  const lastE1RM = epley1RM(lastW, lastR);
  const curE1RM  = epley1RM(w, r);
  if (!(lastE1RM > 0) || !(curE1RM > 0)) return;

  const mg = ex.muscleGroup || '';
  let fatPct = 0;
  try { const mgRec = getMuscleGroupRecovery(); if (mg && mgRec[mg]) fatPct = mgRec[mg].fatPct || 0; } catch(_) {}

  // Trigger-Priorität — beim ersten Treffer stoppen (max. 1 Trigger-Typ pro Call).
  let type = null;
  if (fatPct >= 45 && curE1RM <= lastE1RM * 0.93) type = 'fatigue';
  else if (si >= 1 && curE1RM <= lastE1RM * 0.93) type = 'drop';
  else if (curE1RM >= lastE1RM * 1.05) type = 'jump';
  else if (_coachAllSetsAtRepMax(log, ex)) type = 'repmax';
  else if (_coachIsStalled(log.exerciseId, log)) type = 'stall';
  if (!type) return;

  const dedupeKey = log.exerciseId + '|' + type;
  if (_coachState.seen.indexOf(dedupeKey) !== -1) return; // Trigger-Typ für diese Übung schon mal gefeuert

  // Eindeutige Lage LOKAL entscheiden (Standard-Progressionslehre, kein KI-Call,
  // kein Quota-Verbrauch, sofortige Karte): Wdh-Bereich komplett am oberen Ende
  // + Muskulatur frisch → Top-Satz-Chance nach progressiver Überlastung.
  if (type === 'repmax' && fatPct < 30) {
    _coachState.seen.push(dedupeKey);
    try { _saveActiveWk(); } catch(_) {}
    // Progressionssprung relativ und nach Muskelgruppe. Pauschale 2,5 % waren
    // an der Kurzhantel-Seitheben-Schulter zu viel und beim Kreuzheben zu
    // wenig: grosse mehrgelenkige Ketten vertragen groessere relative Spruenge
    // als kleine eingelenkige Muskeln, deren absolute Last ohnehin klein ist.
    const sugW = roundToStep(w * (1 + _coachProgPct(mg)));
    // Kartentext traegt Zahlen und den Muskelgruppen-Namen — das Woerterbuch
    // (I18N_EN) greift nur bei exakten Phrasen, deshalb hier beide Sprachen.
    const mgL = muscleLabel(mg);
    _coachCard = { exId: log.exerciseId, c: {
      title: _cm('Top-Satz-Chance', 'Top-set opportunity'),
      text: _cm('Alle Arbeitssätze am oberen Wiederholungsende, ' + (mgL || 'deine Muskulatur') + ' ist frisch (' + Math.round(fatPct) + ' % Ermüdung). Jetzt progressiv überlasten: nächster Satz als Top-Satz mit ' + kgToDisp(sugW) + ' ' + unitLabel() + '.',
                'All working sets at the top of the rep range, ' + (mgL || 'your muscles') + ' is fresh (' + Math.round(fatPct) + '% fatigue). Time to overload: make the next set a top set with ' + kgToDisp(sugW) + ' ' + unitLabel() + '.'),
      options: [
        { label: _cm('Top-Satz ', 'Top set ') + kgToDisp(sugW) + ' ' + unitLabel(), action: { kind: 'topSet', value: sugW } },
        { label: _cm('Extra-Satz', 'Extra set'), action: { kind: 'extraSet' } },
        { label: _cm('Normal weiter', 'Continue as planned'), action: { kind: 'none' } },
      ],
    }, applied: false, baseW: w, timer: null };
    renderLogCards();
    try { _coachBarSet('msg', _cm('Top-Satz-Chance erkannt.', 'Top-set opportunity detected.'), 6000); } catch(_) {}
    _coachCard.timer = setTimeout(() => {
      if (_coachCard && _coachCard.exId === log.exerciseId && !_coachCard.applied) { _coachClearCard(); renderLogCards(); }
    }, 45000);
    return;
  }

  // Rate-Limits SOFORT buchen (nicht erst nach Antwort) — verhindert Doppel-Feuer,
  // während der Call noch läuft; wird per _saveActiveWk() gleich gesichert.
  _coachState.calls++;
  _coachState.perExercise[log.exerciseId] = (_coachState.perExercise[log.exerciseId] || 0) + 1;
  _coachState.seen.push(dedupeKey);
  _coachState.lastCallTs = Date.now();
  try { _saveActiveWk(); } catch(_) {}

  // limits VOR dem Objekt-Literal ermitteln und als erstes Feld (nach type,
  // vor ex) einsetzen: der Worker schneidet den /coach-Payload mit
  // JSON.stringify(t).slice(0, 2000) hart ab. Acht maximal lange
  // Einschraenkungen sind allein schon ~1000 Zeichen; mit langem Uebungsnamen
  // und ausfuehrlichem readiness.note ueberschreitet der Payload leicht die
  // 2000er-Grenze. Stand hinten in der Reihenfolge war limits (die
  // koerperlichen Einschraenkungen) das ERSTE, was der Slice stumm
  // abgeschnitten hat - genau die Sicherheitsdaten, die immer respektiert
  // werden sollen. Am Anfang ist limits vor jedem Feld sicher, dessen Laenge
  // schwankt (ex-Name, readiness.note, muted-Liste).
  let _coachPayloadLimits = [];
  try { _coachPayloadLimits = (_dossier().limits || []).map(e => e.t); } catch(_) {}
  const payload = {
    // Anzeige-Name statt gespeichertem Namen: das Modell soll die Uebung so
    // nennen, wie sie auf dem Bildschirm steht — dann muss der Riegel unten
    // im Regelfall gar nichts mehr richten.
    type, limits: _coachPayloadLimits, ex: _exDisp(ex.name), mg,
    goal: S.obGoal || null,
    set: { n: si + 1, of: (log.sets || []).length, w, r },
    last: { w: lastW, r: lastR, e1rm: Math.round(lastE1RM * 10) / 10 },
    cur: { e1rm: Math.round(curE1RM * 10) / 10 },
    fat: fatPct,
  };
  const volDelta = _coachVolDelta(log.exerciseId, li);
  if (volDelta != null) payload.volDelta = volDelta;
  // Check-in-Lage mitschicken: der Live-Coach darf im Deload nicht "steigere jetzt" rufen.
  try { const rd = _ciReadiness(); if (rd) payload.readiness = { state: rd.mode, note: rd.plain }; } catch(_) {}
  // muted mitschicken: der Worker-Prompt meidet Vorschlagstypen, die der
  // Nutzer wiederholt ignoriert hat. Bleibt bewusst HINTEN (anders als
  // limits oben) - faellt es dem 2000er-Slice zum Opfer, filtert die zweite
  // Verteidigungslinie im Response-Handler unten die gemuteten Kinds ohnehin
  // noch clientseitig raus.
  try { payload.muted = window.CoachLog.logStats(S.coachLog || []).muted; } catch(_) {}

  (async () => {
    try {
      try { _coachBarSet('thinking'); } catch(_) {}
      const res = await aiCall('coach', { t: payload }); // aiCall zeigt Fehler/Paywall/Quota-Toast bereits selbst
      if (!res || !res.c) { try { _coachBarSet('idle'); } catch(_) {} return; } // laut Vorgabe: fehlgeschlagener Call → still überspringen, kein Fehler-UI
      // Zweite Verteidigungslinie: haelt sich das Modell nicht an "muted",
      // greift dieser Filter.
      try {
        const mutedKinds = window.CoachLog.logStats(S.coachLog || []).muted;
        const c = res.c || {};
        if ((c.action || {}).kind && mutedKinds.indexOf(c.action.kind) >= 0) return;
        if (Array.isArray(c.options)) {
          c.options = c.options.filter(o => mutedKinds.indexOf((o.action || {}).kind) < 0);
          if (!c.options.length && !(c.action || {}).kind) return;
        }
      } catch(e) { console.warn('[Coach] Filter:', e); }
      // Uebungsname zurueckholen, falls das Modell ihn doch uebersetzt hat.
      try { _coachKeepExName(res.c, ex); } catch(e) { console.warn('[Coach] Name:', e); }
      _coachCard = { exId: log.exerciseId, c: res.c, applied:false, baseW: w, timer:null };
      renderLogCards();
      /* Waehrend des Calls (1-3 s Netzrunde) kann die Uebung aus dem Training
         geflogen sein — renderLogCards() raeumt die Karte dann selbst weg. Zu
         einer Uebung, die nicht mehr da ist, gehoert auch keine Nachricht. */
      if (!_coachCard) { try { _coachBarSet('idle'); } catch(_) {} return; }
      try { _coachBarSet('msg', res.c.title || res.c.text || '', 6000); } catch(_) {}
      // Auto-Dismiss nach 45s, wenn unangetastet
      _coachCard.timer = setTimeout(() => {
        if (_coachCard && _coachCard.exId === log.exerciseId && !_coachCard.applied) {
          _coachClearCard(); renderLogCards();
        }
      }, 45000);
    } catch(e) { console.warn('[Coach] call:', e); try { _coachBarSet('idle'); } catch(_) {} }
  })();
}

// ── Vorschlagskarte: Rendering + Annehmen/Ignorieren ──
function _coachDismiss() {
  // Zuerst loggen, dann aufraeumen: nach _coachClearCard() ist _coachCard leer.
  try {
    if (_coachCard) {
      S.coachLog = window.CoachLog.logAction(S.coachLog || [],
        { kind: ((_coachCard.c || {}).action || {}).kind, exId: _coachCard.exId, accepted: false }, Date.now());
      persist();
    }
  } catch(e) { console.warn('[Coach] Log:', e); }
  try { _coachClearCard(); renderLogCards(); } catch(e) { console.warn('[Coach] dismiss:', e); }
}
function _coachNextSetIdx(log) {
  const idx = log.sets.findIndex(s => !s.done);
  return idx >= 0 ? idx : log.sets.length - 1;
}
// Zielzeile für eine Satz-Aktion (Top-/Dropsatz). Ist KEIN Satz mehr offen —
// der Regelfall beim Dropsatz, der ja NACH dem letzten Satz kommt —, dann
// haengt diese Funktion einen an. Ohne sie schrieb _coachNextSetIdx() auf den
// letzten, bereits ABGEHAKTEN Satz: der Vorschlag hat dann rueckwirkend eine
// geloggte Leistung ueberschrieben statt einen neuen Satz anzubieten.
function _coachTargetSetIdx(li) {
  const log = wkLogs[li]; if (!log || !log.sets || !log.sets.length) return -1;
  const open = log.sets.findIndex(s => !s.done);
  if (open >= 0) return open;
  const before = log.sets.length;
  addSet(li);                                   // rendert selbst neu
  return log.sets.length > before ? log.sets.length - 1 : -1;
}
// Wendet res.c.action auf das nächste noch nicht abgehakte Set der Übung an.
function _coachApplyAction(li, action, baseW) {
  if (!action || !action.kind || action.kind === 'none') return;
  const log = wkLogs[li]; if (!log || !log.sets || !log.sets.length) return;
  const val = (typeof action.value === 'number' && isFinite(action.value)) ? action.value : null;
  switch (action.kind) {
    case 'weight': {
      const si = _coachNextSetIdx(log);
      if (si >= 0 && val != null) log.sets[si].w = String(roundToStep(val));
      break;
    }
    // Plateau-Reset: NICHT nur der naechste Satz, sondern jeder noch offene.
    // Ein Reset, der nach einem Satz wieder auf das Plateaugewicht springt,
    // waere kein Reset — die Entlastung traegt die ganze Uebung.
    case 'resetLoad': {
      if (val == null) break;
      const w = String(roundToStep(val));
      log.sets.forEach(s => { if (s && !s.done && (s.type || 'normal') !== 'warmup') s.w = w; });
      break;
    }
    case 'dropSet': {
      const si = _coachTargetSetIdx(li);         // haengt an, wenn nichts mehr offen ist
      if (si >= 0) {
        if (val != null) log.sets[si].w = String(roundToStep(val));
        log.sets[si].type = 'drop'; // visuell flaggen, auch ohne Gewichtswert
      }
      break;
    }
    case 'topSet': {
      const si = _coachTargetSetIdx(li);
      if (si >= 0) {
        if (val != null) log.sets[si].w = String(roundToStep(val));
        log.sets[si].type = 'top'; // gleiche Kennzeichnung wie manueller Top-Satz (SET_TYPE_LABEL)
      }
      break;
    }
    case 'deload': {
      const si = _coachNextSetIdx(log);
      if (si >= 0 && baseW > 0) log.sets[si].w = String(roundToStep(baseW * 0.9));
      break;
    }
    case 'sugWeight': {
      // Gegenstueck zu 'weight': nicht nur der naechste Satz, sondern ALLE noch
      // offenen Arbeitssaetze samt Vorschlagswert. Das ist die Anpassung, die
      // aus der Satz-Einschaetzung kommt — sie meint die restliche Uebung.
      if (val != null) _rpeSuggestNext(log.exerciseId, val);
      break;
    }
    case 'repRange': {
      const ex2 = exById(log.exerciseId);
      const mn = parseInt(action.min), mx = parseInt(action.max);
      if (ex2 && mn > 0 && mx >= mn) {
        // Dieselben drei Felder wie applyRepRange() in der Uebungs-Bearbeitung:
        // targetReps ist der Kompatibilitaetswert (oberes Ende).
        ex2.repMin = mn; ex2.repMax = mx; ex2.targetReps = mx;
        try { persist(); } catch(_) {}
      }
      break;
    }
    case 'extraSet':
      addSet(li); // bestehende Funktion — rendert bereits selbst neu
      break;
    case 'removeSet': {
      // Gegenstueck zu extraSet. Entfernt wird der LETZTE noch offene
      // Arbeitssatz — nie ein abgehakter (das waere eine geloeschte Leistung)
      // und nie der letzte verbliebene (delSet() riegelt das zusaetzlich ab).
      let ziel = -1;
      (log.sets || []).forEach((s, i) => { if (!s.done && (s.type || 'normal') !== 'warmup') ziel = i; });
      if (ziel >= 0) delSet(li, ziel);
      break;
    }
    case 'rest':
      // Nur wenn GERADE eine Pause läuft, sinnvoll verlängerbar. S.restTimerSecs ist
      // ein persistentes, globales Nutzer-Setting — das für einen einzelnen Coach-Tipp
      // zu verändern wäre ein zu großer Nebeneffekt. Ohne laufende Pause bleibt es beim
      // reinen Hinweistext der Karte (No-Op, siehe Deploy-Report).
      if (_restInt !== null) { try { adjustRest(30); } catch(_) {} }
      break;
  }
  try { _saveActiveWk(); } catch(_) {}
}
// Gemeinsamer Commit-Pfad für Einzel-Aktion (_coachAccept) und Options-Auswahl
// (_coachPickOption) — beide wenden am Ende dieselbe Aktion aufs nächste Set an.
function _coachCommitAction(action) {
  if (!_coachCard || _coachCard.applied) return;
  try {
    S.coachLog = window.CoachLog.logAction(S.coachLog || [],
      { kind: (action || {}).kind, exId: _coachCard.exId, accepted: true }, Date.now());
    persist();
  } catch(e) { console.warn('[Coach] Log:', e); }
  if (_coachCard.timer) { clearTimeout(_coachCard.timer); _coachCard.timer = null; }
  const li = wkLogs.findIndex(l => l.exerciseId === _coachCard.exId);
  // Rueckgaengig auch fuer eine BESTAETIGTE Aktion: ein Fehlgriff auf den
  // falschen Knopf ist genauso moeglich wie ein Sinneswandel, und die Aktion
  // aendert Saetze, Gewichte oder den Wiederholungsbereich.
  const kind = (action || {}).kind;
  if (li >= 0 && kind && kind !== 'none') {
    const zurueckSets = _coachSnapshot(li);
    const ex0 = exById(_coachCard.exId);
    const rMin = ex0 ? ex0.repMin : null, rMax = ex0 ? ex0.repMax : null, rZiel = ex0 ? ex0.targetReps : null;
    _coachUndoOffer(() => {
      if (zurueckSets) zurueckSets();
      const e = exById(_coachCard && _coachCard.exId) || ex0;
      if (e && kind === 'repRange') { e.repMin = rMin; e.repMax = rMax; e.targetReps = rZiel; }
      try { persist(); } catch(_) {}
    });
  }
  try { if (li >= 0) _coachApplyAction(li, action, _coachCard.baseW); } catch(e) { console.warn('[Coach] Aktion:', e); }
  _coachCard.applied = true;
  try { haptic(14); } catch(_) {}
  renderLogCards(); // zeigt kurz die Bestaetigung in der Coach-Leiste (cb-done)
  setTimeout(() => { _coachClearCard(); renderLogCards(); }, 1000);
}
function _coachAccept() {
  try { _coachCommitAction((_coachCard && _coachCard.c || {}).action); }
  catch(e) { console.warn('[Coach] accept:', e); try { _coachClearCard(); renderLogCards(); } catch(_) {} }
}
function _coachPickOption(idx) {
  try {
    const opts = (_coachCard && Array.isArray(_coachCard.c && _coachCard.c.options)) ? _coachCard.c.options : [];
    const opt = opts[idx]; if (!opt) return;
    _coachCommitAction(opt.action);
  } catch(e) { console.warn('[Coach] pickOption:', e); try { _coachClearCard(); renderLogCards(); } catch(_) {} }
}

// ── Paywall ────────────────────────────────────────────
let _pwPlan = 'yearly';
// StoreKit liefert lokalisierte Preise (andere Währung, Apple-Preisanpassung,
// Rabattaktion). Alles Abgeleitete — Monatspreis im Jahresabo und die Ersparnis —
// MUSS daraus gerechnet werden, sonst behauptet die Paywall Zahlen, die der
// App Store nicht berechnet. Ohne Produkte (Web/Simulator): deutsche Defaults.
const _PW_FALLBACK = { yearly:19.99, monthly:2.99 };
function _pwProd(plan){
  const id = plan === 'yearly' ? PREM_YEARLY : PREM_MONTHLY;
  return (_pwProducts||[]).find(x => x.id === id) || null;
}
function _pwPrice(plan){
  const p = _pwProd(plan);
  if (p && p.displayPrice) return p.displayPrice;
  return plan === 'yearly' ? '19,99 €' : '2,99 €';
}
function _pwPriceNum(plan){
  const p = _pwProd(plan);
  return (p && typeof p.price === 'number' && p.price > 0) ? p.price : _PW_FALLBACK[plan];
}
// Betrag im Format des Store-Preises ausgeben: Zahl im displayPrice ersetzen,
// damit Währungssymbol, Position und Trennzeichen exakt die des Stores bleiben.
function _pwFmtLike(plan, value){
  const num = new Intl.NumberFormat(GT_LOCALE, { minimumFractionDigits:2, maximumFractionDigits:2 }).format(value);
  const tpl = _pwPrice(plan);
  const out = tpl.replace(/\d[\d.,\s ]*\d|\d/, num);
  return out === tpl ? num : out;   // kein Zahlen-Treffer (exotisches Format) → nackte Zahl
}
// Ersparnis Jahres- ggü. Monatsabo in ganzen Prozent; null = nicht bewerbbar.
function _pwSavePct(){
  const y = _pwPriceNum('yearly'), m = _pwPriceNum('monthly');
  if (!(y > 0) || !(m > 0)) return null;
  const pct = Math.round((1 - y / (m * 12)) * 100);
  return pct >= 5 ? pct : null;
}
const _PW_FEATS = {
  chat:     { anim:'chat',     t:'KI-Chat & Trainingsplan', s:'Dein Coach kennt dein Training — Pläne, Technik und Fortschritt, jederzeit im Chat.' },
  coach:    { anim:'coach',    t:'Live-Coach im Training',  s:'Feedback nach jedem Satz und passende Empfehlungen in Echtzeit.' },
  scan:     { anim:'scan',     t:'Geräte-Scanner',          s:'Gerät fotografieren — Übungen und Ausführung sofort erklärt.' },
  analyze:  { anim:'analyze',  t:'Trainingsanalyse',        s:'KI bewertet Volumen, Balance und Technik-Trends mit klarem Score.' },
  insights: { anim:'insights', t:'Fortschritts-Insights',   s:'Automatische Auswertung deiner Statistik — du siehst sofort, was wirkt.' },
};
// Animierte Bühne pro Vorteil (nur Vektor/CSS — kein Emoji, UI-Regel)
function _pw2Stage(a){
  const sp = s => ICO.sparkle({s});
  if (a==='coach')    return `<div class="pw2-stage"><span class="pwa-ring"></span><span class="pwa-ring d2"></span><div class="pw2-orb">${ICO.bolt({s:48})}</div></div>`;
  if (a==='chat')     return `<div class="pw2-stage"><div class="pw2-orb">${ICO.chatBubble({s:46})}</div><span class="pwa-bub a"></span><span class="pwa-bub b"></span></div>`;
  if (a==='scan')     return `<div class="pw2-stage"><div class="pw2-orb pwa-scan">${ICO.camera({s:44})}<span class="pwa-scanline"></span></div></div>`;
  if (a==='analyze')  return `<div class="pw2-stage"><div class="pw2-orb pwa-bars"><span></span><span></span><span></span><span></span></div></div>`;
  return `<div class="pw2-stage"><div class="pw2-orb">${ICO.trendUp({s:46})}</div><span class="pwa-spk s1">${sp(16)}</span><span class="pwa-spk s2">${sp(12)}</span><span class="pwa-spk s3">${sp(10)}</span></div>`;
}
function _pw2CardsHTML(keys){
  return keys.map(k => { const f = _PW_FEATS[k]; if (!f) return '';
    return `<div class="pw2-card">${_pw2Stage(f.anim)}<div class="pw2-ct">${f.t}</div><div class="pw2-cs">${f.s}</div></div>`;
  }).join('');
}
function pwPickPlan(p){ _pwPlan = p; haptic(6); _pwRenderBot(); }
function _pwPlanCardsHTML(){
  const save  = _pwSavePct();
  const perMo = _pwFmtLike('yearly', _pwPriceNum('yearly') / 12);
  return `
    <div class="pw2-plan${_pwPlan==='yearly'?' on':''}" onclick="pwPickPlan('yearly')">
      ${save ? `<span class="pw2-plan-save">Spare ${save} %</span>` : ''}
      <span class="pw2-plan-check">${ICO.check({s:12})}</span>
      <div class="pw2-plan-name">Jährlich</div>
      <div class="pw2-plan-price">${_pwPrice('yearly')}</div>
      <div class="pw2-plan-per">pro Jahr · ${perMo}/Monat</div>
    </div>
    <div class="pw2-plan${_pwPlan==='monthly'?' on':''}" onclick="pwPickPlan('monthly')">
      <span class="pw2-plan-check">${ICO.check({s:12})}</span>
      <div class="pw2-plan-name">Monatlich</div>
      <div class="pw2-plan-price">${_pwPrice('monthly')}</div>
      <div class="pw2-plan-per">pro Monat</div>
    </div>`;
}
// Unterer Block (Pläne + CTA) — separat gerendert, damit ein Plan-Wechsel die
// wischbare Showcase oben NICHT zurücksetzt.
function _pwBotHTML(){
  const native = _isNative();
  const tk = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>`;
  const cta = _pwPlan==='yearly' ? 'Jahresplan freischalten' : 'Monatsplan freischalten';
  // App-Review 3.1.2 verlangt auf der Kaufseite: Abo-Länge, Preis pro Periode,
  // Hinweis auf automatische Verlängerung sowie Links zu EULA + Datenschutz.
  const abo = _pwPlan==='yearly'
    ? `${_pwPrice('yearly')} pro Jahr, verlängert sich automatisch. Jederzeit im App Store kündbar.`
    : `${_pwPrice('monthly')} pro Monat, verlängert sich automatisch. Jederzeit im App Store kündbar.`;
  return `
    <div class="pw2-plans">${_pwPlanCardsHTML()}</div>
    ${native
      ? `<button class="pw2-cta" id="pw-cta" onclick="premBuy(_pwPlan==='yearly'?PREM_YEARLY:PREM_MONTHLY)">${cta}</button>`
      : `<div class="pw2-webnote">Premium schließt du in der MyGymTrack iOS-App ab.</div>`}
    <div class="pw2-legal">
      <span class="tk">${tk} ${abo}</span>
      <span class="pw2-legal-links">
        <button onclick="_openExternal('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')">Nutzungsbedingungen</button>
        <button onclick="_openExternal(GT_WEB + '/privacy.html')">Datenschutz</button>
        <button onclick="premRestore()">Käufe wiederherstellen</button>
      </span>
    </div>`;
}
function _pwRenderBot(){
  const b = document.getElementById('pw2-bot'); if (b) b.innerHTML = _pwBotHTML();
  _pwRefRender();
}
/* Einladungs-Banner nachzeichnen. Eigene Funktion, weil sich der Zustand
   (Gratis-Woche aktiv, Deckel erreicht) ändern kann, während die Paywall offen
   ist — ohne das zeigte sie bis zum Neuöffnen den alten Stand. */
function _pwRefRender(){
  const r = document.getElementById('pw2-ref');
  if (r && typeof refBannerHTML === 'function') r.innerHTML = refBannerHTML();
}
function openPaywall(feature){
  _pwRender(feature);
  openOv('ov-paywall');
  if (_isNative() && !_pwProducts) _premLoadProducts().then(() => _pwRenderBot());
  // Stand der Gratis-Wochen frisch holen (legt beim ersten Mal auch den Code an)
  try { if (typeof refSync === 'function') refSync(false, true).then(_pwRefRender); } catch(_){}
}
// Aufrufer-Kürzel → Showcase-Slide. premGate/aiCall reichen ihre eigenen Namen
// durch ('ai', 'vision', …); ohne das Mapping startet die Paywall immer auf
// Slide 0 und der Nutzer sieht nicht das Feature, das er gerade wollte.
const _PW_FEAT_ALIAS = { ai:'chat', chat:'chat', coach:'coach', live:'coach',
  scan:'scan', vision:'scan', analyze:'analyze', report:'analyze', training:'analyze',
  plan:'chat', insights:'insights', stats:'insights' };
function _pwRender(feature){
  const el = document.getElementById('pw-body'); if (!el) return;
  const keys = ['chat','coach','scan','analyze','insights'];
  const start = Math.max(0, keys.indexOf(_PW_FEAT_ALIAS[feature] || feature));
  el.innerHTML = `
    <div class="pw2">
      <button class="pw2-close" onclick="closeOv('ov-paywall')" aria-label="Schließen">✕</button>
      <div class="pw2-brand">${ICO.sparkle({s:14})} MYGYMTRACK PREMIUM</div>
      <div class="pw2-show">
        <div class="pw2-track" id="pw2-track">${_pw2CardsHTML(keys)}</div>
        <div class="pw2-dots" id="pw2-dots">${keys.map((_,i)=>`<span class="pw2-dot${i===start?' on':''}" onclick="pwGo(${i})"></span>`).join('')}</div>
      </div>
      <div id="pw2-ref">${typeof refBannerHTML === 'function' ? refBannerHTML() : ''}</div>
      <div class="pw2-bot" id="pw2-bot">${_pwBotHTML()}</div>
    </div>`;
  _pwCarInit(start);
}
// ── Showcase-Carousel: Auto-Wechsel + Punkte, pausiert kurz nach Nutzer-Wisch ──
let _pwCarTimer = null, _pwCarIdx = 0, _pwCarPauseTs = 0;
function _pwCarDots(i){ document.querySelectorAll('#pw2-dots .pw2-dot').forEach((d,x)=>d.classList.toggle('on', x===i)); }
function pwGo(i){ const t = document.getElementById('pw2-track'); if (!t) return; _pwCarPauseTs = Date.now(); t.scrollTo({ left:i*t.clientWidth, behavior:'smooth' }); }
function _pwCarInit(start){
  const tr = document.getElementById('pw2-track'); if (!tr) return;
  _pwCarIdx = start|0; tr.scrollLeft = 0;
  // Startslide erst setzen, wenn das Sheet gelayoutet ist — direkt nach dem
  // innerHTML ist clientWidth im noch geschlossenen Overlay 0.
  if (_pwCarIdx > 0) {
    const jump = (tries) => {
      const w = tr.clientWidth;
      if (!w) { if (tries > 0) setTimeout(() => jump(tries-1), 60); return; }
      tr.scrollLeft = _pwCarIdx * w;
      _pwCarDots(_pwCarIdx);
    };
    requestAnimationFrame(() => jump(6));
  }
  tr.onscroll = () => { const w = tr.clientWidth||1; const i = Math.round(tr.scrollLeft / w);
    if (i !== _pwCarIdx){ _pwCarIdx = i; _pwCarDots(i); } };
  ['touchstart','pointerdown'].forEach(ev => tr.addEventListener(ev, () => { _pwCarPauseTs = Date.now(); }, { passive:true }));
  if (_pwCarTimer) clearInterval(_pwCarTimer);
  _pwCarTimer = setInterval(() => {
    const ov = document.getElementById('ov-paywall');
    const t  = document.getElementById('pw2-track');
    if (!ov || !ov.classList.contains('on') || !t){ clearInterval(_pwCarTimer); _pwCarTimer = null; return; }
    if (Date.now() - _pwCarPauseTs < 5000) return;          // nach Wisch kurz Ruhe
    const n = document.querySelectorAll('#pw2-track .pw2-card').length || 1;
    const next = (_pwCarIdx + 1) % n;
    t.scrollTo({ left: next * t.clientWidth, behavior:'smooth' });
  }, 3600);
}

// ── Settings-Sektion "MyGymTrack Premium" ─────────────
/* Untertitel der Premium-Zeile. Die Reihenfolge ist die der Wahrheit: erst das
   dauerhafte Founder-/Testkonto, dann die geschenkte Woche, dann das gekaufte
   Abo. Ohne die ersten beiden Zweige stand bei jedem gesetzten PREM.exp
   "Monatsabo · läuft ab am …" — beim Founder schlicht falsch, beim Trial
   verkaufte es die Gratis-Woche als Abo. */
function _premStatusSub(){
  try { if (_fbUser && TEST_UIDS.has(_fbUser.uid)) return 'Founder-Konto · unbegrenzt'; } catch(_){}
  if (PREM.src === 'trial' && PREM.exp) {
    const tage = Math.max(0, Math.ceil((PREM.exp - Date.now()) / 864e5));
    return 'Gratis-Woche · noch ' + tage + (tage === 1 ? ' Tag' : ' Tage');
  }
  if (PREM.exp) return (PREM.plan==='yearly'?'Jahresabo':'Monatsabo') + ' · läuft ab am ' + new Date(PREM.exp).toLocaleDateString(GT_LOCALE);
  return 'Premium aktiv';
}
function _premQuotaText(){
  let q = null; try { q = JSON.parse(localStorage.getItem('gt_aiQuota') || 'null'); } catch(_){}
  if (!q || typeof q.limit !== 'number') return null;
  const left = Math.max(0, (q.limit||0) - (q.used||0));
  // Gratis-Woche: der Unterschied zum Abo gehört in dieselbe Zeile, sonst liest
  // sich die kleine Zahl wie das, was Premium bietet.
  if (q.trial) {
    const abo = (typeof _AI_PREM_LIMIT === 'number') ? _AI_PREM_LIMIT : 50;
    return `Gratis-Test: noch ${left} von ${q.limit} Anfragen · mit Premium ${abo} jeden Monat`;
  }
  return `Noch ${left} von ${q.limit} KI-Anfragen diesen Monat`;
}
// Felder, die als Text gespeichert werden. Alles andere bleibt ein Boolean.
const _COACH_TEXT_KEYS = ['name','tone','voice','inTraining','pushLevel'];
// Nur diese Schalter setzt ein Profil — nur sie können es auf 'custom' kippen.
// Name, Ton und Stimme sind profilunabhängig.
const _COACH_PRESET_KEYS = ['inTraining','setFeedback','pushLevel','live'];
// Deckt der aktuelle Zustand das Profil noch? Verglichen wird gegen die
// PRESETS des Moduls, damit Profil und Vergleich nicht auseinanderlaufen.
function _coachPresetMatches(name){
  let P = null; try { P = CoachPersona.PRESETS[name] || null; } catch(_) {}
  if (!P) return false;
  const p = _persona();
  return p.inTraining === P.inTraining && p.setFeedback === P.setFeedback && p.pushLevel === P.pushLevel;
}
// Wer den Coach identifiziert hat, ist ab jetzt eine Person mit Namen.
function _scnByCoach(){
  const nm = _coachName();
  if (nm === 'Coach') return tr('Erkannt von deinem KI-Coach');
  return _cm('Erkannt von ' + esc(nm), 'Identified by ' + esc(nm));
}
function _coachOptRender(){
  try { if (typeof _coachBarRender === 'function') _coachBarRender(); } catch(_) {}
  try { const b = document.getElementById('ai-bubble'); if (b) b.setAttribute('aria-label', _coachName()); } catch(_) {}
  try { if (typeof _aicApplyName === 'function') _aicApplyName(); } catch(_) {}
  /* Der Chat-Verlauf selbst, nicht nur sein Kopf. Bisher deckte diese Funktion
     #aic-log nicht ab: nach der Datentrennung war _aicHist leer und gt_aiChat
     weg, auf dem Bildschirm stand die Unterhaltung des vorigen Kontos aber
     weiter — das Blatt bleibt beim Auth-Wechsel offen und niemand zeichnet es
     neu (Abschluss-Review Block 5, Wichtig 3). Beide Funktionen kehren sofort
     zurueck, wenn ihr Element nicht da ist. */
  try { if (typeof _aicRenderLog  === 'function') _aicRenderLog(); } catch(_) {}
  try { if (typeof _aicRenderSugg === 'function') _aicRenderSugg(); } catch(_) {}
  try { if (typeof renderCoachTodayCard === 'function') renderCoachTodayCard(); } catch(_) {}
  try { if (typeof renderCoachHub === 'function') renderCoachHub(); } catch(_) {}
  // Die Einrichtung (Task 10) hängt an derselben Leine: ohne diesen Aufruf
  // ändert ein Tipp auf eine Tonkarte den Wert, aber nicht das Bild — die
  // Markierung und der Beispielsatz blieben stehen. Beide Render-Funktionen
  // kehren früh zurück, solange ihr Overlay zu ist.
  try { if (typeof renderCoachSetup === 'function') renderCoachSetup(); } catch(_) {}
}
// Hält den Profilnamen an den drei Feldern statt nur in eine Richtung zu kippen:
// beschreiben sie ein Profil, trägt der Zustand dessen Namen; beschreiben sie
// keines, heißt er 'custom'. Vorher blieb 'custom' stehen, sobald es einmal
// gesetzt war — ein Profil, das der Nutzer nie verlassen hat, war damit nach
// einem verlustfreien Rundlauf trotzdem weg. Ein noch offenes preset (undefined)
// bleibt offen, sonst entfällt die Einrichtung.
function _coachPresetSync(){
  if (!S.aiCoach || S.aiCoach.preset === undefined) return;
  let namen = ['quiet','balanced','close'];
  try { if (window.CoachPersona && CoachPersona.PRESETS) namen = Object.keys(CoachPersona.PRESETS); } catch(_) {}
  for (let i = 0; i < namen.length; i++) {
    if (_coachPresetMatches(namen[i])) { S.aiCoach.preset = namen[i]; return; }
  }
  S.aiCoach.preset = 'custom';
}
function setAiCoachOpt(key, val){
  // Äußerer Deckel: die Funktion hängt direkt an inline onclick. Wirft persist()
  // (Speicherquote), propagierte der Fehler bisher aus dem Handler heraus und
  // _coachOptRender() lief nie — Wert geschrieben, Bild nicht.
  try {
  // Vorige Push-Stufe merken, BEVOR sie überschrieben wird: der Wechsel weg von
  // 'still' fragt die Berechtigung, und bei Verweigerung springt die Auswahl
  // genau hierauf zurück (Task 19).
  let _cnVor = 'still'; try { _cnVor = _cnLevel(); } catch(_) {}
  S.aiCoach = S.aiCoach || { live:true, insights:true };
  // Hier stand pauschal !!val. Das zerstörte jeden Textwert: 'key' → true,
  // 'sachlich' → true, der vergebene Name → true.
  if (_COACH_TEXT_KEYS.indexOf(key) >= 0) S.aiCoach[key] = (val == null ? '' : String(val));
  else S.aiCoach[key] = !!val;
  // Invariante in beide Richtungen halten: live !== false ⟺ inTraining !== 'off'.
  if (key === 'inTraining') {
    S.aiCoach.live = (S.aiCoach.inTraining !== 'off');
    // Eine bewusst gewählte Stufe ersetzt die gemerkte.
    if (S.aiCoach.inTraining !== 'off') delete S.aiCoach.liveWas;
  }
  else if (key === 'live') {
    if (S.aiCoach.live === false) {
      // Stufe merken, BEVOR sie auf 'off' fällt. "Live-Coach im Training" in den
      // Premium-Einstellungen ist ein reines Aus/Ein; vorher degradierte es
      // "Eng dabei" (full) beim Wiedereinschalten auf 'key' und das Profil auf
      // 'custom' — zwei Tipps, und aus einem Profil wurde ein Mischzustand,
      // den kein Profil beschreibt.
      if (S.aiCoach.inTraining !== 'off') S.aiCoach.liveWas = S.aiCoach.inTraining;
      S.aiCoach.inTraining = 'off';
    } else if (S.aiCoach.inTraining === 'off') {
      const zurueck = S.aiCoach.liveWas;
      S.aiCoach.inTraining = (zurueck === 'key' || zurueck === 'full') ? zurueck : 'key';
      delete S.aiCoach.liveWas;
    }
  }
  if (_COACH_PRESET_KEYS.indexOf(key) >= 0) _coachPresetSync();
  persist();
  _coachOptRender();
  // Die neue Stufe gilt sofort, nicht erst morgen. Bewusst nicht awaited: eine
  // Meldung ist ein Angebot, kein Dialog — der Schalter blockiert nichts.
  if (key === 'pushLevel') { try { _cnLevelChanged(_cnVor); } catch(e2) { console.warn('[Coach] Push-Stufe:', e2); } }
  } catch(e) {
    console.warn('[Coach] Schalter:', e);
    // Das Bild muss trotzdem nachziehen: der Wert steht schon im Zustand.
    try { _coachOptRender(); } catch(_) {}
  }
}
// Setzt die drei Profilschalter plus live in EINEM Zug. Bewusst nicht über
// setAiCoachOpt: der erste Schalter würde preset sofort auf 'custom' kippen,
// bevor die anderen beiden gesetzt sind.
function setCoachPreset(name){
  // Äußerer Deckel, gleiche Begründung wie bei setAiCoachOpt: inline onclick.
  try {
  let P = null; try { P = CoachPersona.PRESETS[name] || null; } catch(_) {}
  if (!P) return;
  // Ein Profil setzt pushLevel mit — derselbe Wechsel, dieselbe Berechtigung.
  let _cnVor = 'still'; try { _cnVor = _cnLevel(); } catch(_) {}
  S.aiCoach = S.aiCoach || { live:true, insights:true };
  S.aiCoach.inTraining  = P.inTraining;
  S.aiCoach.setFeedback = P.setFeedback;
  S.aiCoach.pushLevel   = P.pushLevel;
  S.aiCoach.live        = (P.inTraining !== 'off');
  S.aiCoach.preset      = name;
  // Eine frische Profilwahl setzt die gemerkte Stufe des live-Schalters außer
  // Kraft — sonst käme beim nächsten Ein die Stufe des alten Profils zurück.
  delete S.aiCoach.liveWas;
  persist();
  _coachOptRender();
  if (_cnLevel() !== _cnVor) { try { _cnLevelChanged(_cnVor); } catch(e2) { console.warn('[Coach] Push-Stufe:', e2); } }
  } catch(e) {
    console.warn('[Coach] Profil:', e);
    try { _coachOptRender(); } catch(_) {}
  }
}
// ═══ COACH-HUB: ein Blatt mit fünf aufklappenden Kacheln ═════════════════
// Das Zuhause des Coaches hinter der bestehenden .aic-Karte im Heute-Tab. Die
// Karte ist der EINZIGE Zugang (Gestaltungsregel 1) — keine zweite Fläche auf
// der Startseite, kein fünfter Tab.
//
// Vier Reiter (_CH_TABS/.ch-tabs) sind entfallen. Der Nutzer wollte wörtlich
// "alles auf einem Beleg": genau EINE Kachel ist offen, ein Tipp klappt sie an
// Ort und Stelle auf, die anderen rücken weich nach. Zugeklappt trägt jede
// Kachel Titel plus GENAU EINE Kennzahl — sonst sagt das Blatt zugeklappt
// nichts. Mit den Reitern verschwindet zugleich der seit Task 10 geparkte
// Gestaltungsregel-7-Verstoß: das Segmented Control war ein Bedienidiom, das
// die App sonst nirgends hat.
// kurz ist das Label IM RASTER, de der Titel im Blattkopf der Detailebene.
// "Umfang und Meldungen" passt als Großbuchstaben-Label in keine halbe Spalte
// und stünde dort abgeschnitten — der volle Titel steht dafür im Kopf, sobald
// die Kachel offen ist. Nur diese eine Kachel braucht die Kurzform.
// sub sagt, was hinter der Kachel PASSIERT. Ohne diese Zeile stand dort nur ein
// Großbuchstaben-Wort über einer Zahl — wer den Hub zum ersten Mal öffnet, konnte
// daraus nicht ablesen, was ein Tipp bewirkt ("gar nicht intuitiv"). Der Satz ist
// ein Versprechen in Verben, keine Kategorie.
// Das Sparkle-Symbol ist bewusst raus: es ist DAS Zeichen für "hier hat eine KI
// mitgeschrieben" und stand ausgerechnet auf der Kachel, die den Trainer
// menschlich machen soll. Persönlichkeit trägt jetzt das Mikrofon (Stimme, Ton).
const _CH_CARDS = [
  { k:'chat',    de:'Gespräch',             ico:'chatBubble', sub:['Frag alles zu deinem Training','Ask anything about your training'] },
  { k:'week',    de:'Woche',                ico:'chart2',     sub:['Volumen, Trend und Kraftziel','Volume, trend and strength goal'] },
  { k:'persona', de:'Persönlichkeit',       ico:'mic',        sub:['Name, Ton und Ansprache','Name, tone and wording'] },
  { k:'scope',   de:'Umfang und Meldungen', ico:'gear', kurz:'Umfang', sub:['Wann er sich meldet','When it speaks up'] },
  { k:'journal', de:'Journal',              ico:'book',       sub:['Was er über dich weiß','What it knows about you'] },
  /* Kein Feld im Raster: die Leistung hat unter dem Raster ihre eigene Leiste,
     und dort steht sie besser — sie fasst zusammen, was die Kacheln einzeln
     zeigen. In _CH_CARDS gehoert sie trotzdem, damit Oeffnen, Zurueck-Pfeil,
     Kopfzeile und der Zoom-Uebergang ohne Sonderweg funktionieren. */
  { k:'perf',    de:'Trainingsleistung',    ico:'chart2', versteckt:true, sub:['Woran es gerade liegt','What is driving it'] }
];
const _CH_CARD_IDS = _CH_CARDS.map(c => c.k);
// Welche Kachel offen ist. '' heißt: keine, also das Raster — der Normalfall
// beim Öffnen des Blattes. Wird beim Kontowechsel zurückgesetzt
// (s. _coachWipeLocal, Schritt "Hub").
let _chOpen = '';
// Wird von openCoachHub() gesetzt und von renderCoachHub() verbraucht: NUR das
// Öffnen des Blattes setzt die Scrollposition zurück. Jeder andere Rerender
// (Schalter über _coachOptRender()) lässt sie, wo sie ist — sonst nimmt ein
// Sprung an den Anfang den gerade getippten Chip aus dem Bild.
let _chResetScroll = true;
// Beispielsatz der Ton-Auswahl: EIN Satz in vier Tönen. Der Nutzer hört den
// Unterschied, statt vier Adjektive zu lesen.
// Die Beispielwerte laufen durch dieselbe Formatierung wie jeder echte
// Coach-Wert: der Satzkatalog traegt seit der Blockabschluss-Review keine feste
// Einheit mehr, die Einheit haengt am Wert. Ohne _csWeight() stuende in der
// Tonvorschau 'zuletzt 60 bei 8 Wiederholungen'.
function _chToneVars(){ return { ex: _cm('Bankdrücken','Bench press'), kg: _csWeight(60), reps: 8, sets: 3 }; }
// _lang() folgt seit dem Sprach-Fix GT_LANG, deckt sich also mit Reitern,
// Überschriften und dem Übungsnamen im Beispiel — kein eigener Sprach-Umweg
// mehr nötig, _chToneLine() nutzt darum direkt _lang().
function _chToneLine(tone){
  try { return CoachPersona.say('greet', _chToneVars(), CoachPersona.personaGet({ tone: tone }), _lang()); }
  catch(_) { return ''; }
}
function openCoachHub(tab){
  // Weiche auf die Einrichtung (Task 10). Bedingung ist '=== undefined', NICHT
  // '!preset': 'custom' ist ein gesetztes Profil und darf die Einrichtung nicht
  // erneut auslösen. Fehlt openCoachSetup (Task 10 noch nicht gebaut), öffnet
  // der Hub normal — die Weiche darf den Zugang nie verschlucken.
  try {
    const frisch = !S.aiCoach || S.aiCoach.preset === undefined;
    if (frisch && isPremium() && typeof openCoachSetup === 'function') { openCoachSetup(); return; }
  } catch(e) { console.warn('[Coach] Hub-Weiche:', e); }
  // Ohne Argument öffnet das RASTER, nicht eine Kachel: die Coach-Karte auf der
  // Startseite führt in den Hub, nicht direkt in den Chat. Ein ausdrücklich
  // übergebener Schlüssel (Meldung → 'week', Einrichtung → 'scope') springt
  // dagegen weiterhin sofort in die Detailebene.
  _chOpen = _CH_CARD_IDS.indexOf(tab) >= 0 ? tab : '';
  _chResetScroll = true;
  // Die Zieleingabe ist ein Zwischenschritt, kein Zustand: sie steht beim
  // Öffnen des Blattes nie halb offen da.
  _chGoalOpen = false; _chGoalHint = '';
  openOv('ov-coach-hub');
  // Leiser als auf der Karte (.62): hier liegen Kacheln darueber, und ein Feld,
  // das mit ihnen um Aufmerksamkeit ringt, macht das Blatt unruhig.
  try { _aicWaveAttach(document.getElementById('ch-wave'), .62); } catch(_) {}
  renderCoachHub();
}
/* Eine Kachel öffnen und wieder zurück. Zwei Ebenen, eine Bewegung.

   Anders als beim früheren Akkordeon wird hier NEU GERENDERT: Raster und Detail
   sind getrennte Ebenen, die Detailebene trägt immer nur ein Panel. Der
   Übergang hängt deshalb nicht mehr an einem CSS-Zustandswechsel am selben
   Knoten, sondern am Zoom zwischen den beiden Ebenen (_chZoom).

   Ein zweiter Tipp auf dieselbe Kachel tut nichts — geschlossen wird über den
   Zurück-Pfeil im Kopf. Ein Umschalter, der dieselbe Fläche öffnet und
   schließt, ist im Raster nicht mehr sichtbar: die Kachel liegt beim zweiten
   Tipp gar nicht mehr vor dem Nutzer. */
function coachHubOpen(name){
  try {
    if (_CH_CARD_IDS.indexOf(name) < 0 || _chOpen === name) return;
    try { if (typeof haptic === 'function') haptic(6); } catch(_) {}
    _chGo(name);
  } catch(e) { console.warn('[Coach] Kachel öffnen:', e); }
}
function coachHubBack(){
  try {
    if (!_chOpen) return;
    try { if (typeof haptic === 'function') haptic(4); } catch(_) {}
    _chGo('');
  } catch(e) { console.warn('[Coach] Zurück ins Raster:', e); }
}
/* Der Ursprung des Zooms ist die Mitte der betroffenen Kachel, in Prozent der
   Bühne. Gemessen wird am RASTER, das je nach Richtung vor oder nach dem
   Rendern existiert — deshalb steht der Aufruf in _chGo zweimal.
   Ohne messbare Bühne gibt es keinen Ursprung; _chZoom fällt dann auf die
   Vorgabe aus dem Stylesheet zurück. */
function _chOriginOf(k, stage){
  try {
    const el = stage && stage.querySelector('#ch-tile-' + k);
    if (!el) return null;
    const a = el.getBoundingClientRect(), b = stage.getBoundingClientRect();
    if (!b.width || !b.height) return null;
    return ((a.left + a.width / 2 - b.left) / b.width * 100).toFixed(1) + '% ' +
           ((a.top + a.height / 2 - b.top) / b.height * 100).toFixed(1) + '%';
  } catch(_) { return null; }
}
function _chGo(ziel){
  const von = _chOpen;
  // Vorwärts ist die Zielkachel JETZT sichtbar, nach dem Rendern nicht mehr.
  let urs = ziel ? _chOriginOf(ziel, document.getElementById('ch-stage')) : null;
  _chOpen = ziel;
  // Die Detailebene fängt oben an. Das ist kein Scrollsprung, sondern ein
  // Ebenenwechsel — eine mitgeschleppte Scrollposition der anderen Ebene wäre
  // hier sinnlos.
  _chResetScroll = true;
  // Diagramme leben nur, solange ihre Kachel offen ist: Chart.js hält seine
  // Instanzen an der Zeichenfläche fest, und ohne destroy() wächst der Speicher
  // bei jedem Öffnen. renderCoachHub() zeichnet sie bei Bedarf neu.
  if (ziel !== 'week') _chWeekDestroy();
  renderCoachHub();
  const stage = document.getElementById('ch-stage');
  // Zurück ist das Raster erst nach dem Rendern wieder messbar.
  if (!ziel) urs = _chOriginOf(von, stage);
  _chZoom(!!ziel, urs, stage);
}
/* Der Zoom selbst. vor = true heißt Raster → Detail.

   Die ankommende Ebene startet im Gegenzustand und läuft auf ihren Ruhezustand
   zu; die abgehende läuft in den Gegenzustand hinein und liegt dabei absolut
   über der Bühne (.ch-lift), damit sie die ankommende nicht nach unten schiebt.

   Bei reduzierter Bewegung passiert gar nichts: der Zustandswechsel hat dann
   schon im Rendern stattgefunden, und genau das ist die gewünschte Sofortigkeit. */
const _CH_ZOOM_MS = 300;
let _chZoomT = null;
function _chZoom(vor, urs, stage){
  try {
    if (!stage || _chReduceMotion()) return;
    const grid = stage.querySelector('.ch-grid');
    const pane = stage.querySelector('.ch-pane');
    if (!grid || !pane) return;
    // Ein noch laufender Wechsel wird zuerst sauber abgeräumt, sonst bleibt bei
    // schnellem Tippen eine Ebene absolut positioniert oder halb durchsichtig
    // stehen.
    if (_chZoomT) { clearTimeout(_chZoomT); _chZoomT = null; }
    stage.classList.remove('x');
    [grid, pane].forEach(el => el.classList.remove('ch-lift', 'ch-zin', 'ch-zout'));
    if (urs) { grid.style.transformOrigin = urs; pane.style.transformOrigin = urs; }
    const rein = vor ? pane : grid;
    const raus = vor ? grid : pane;
    stage.classList.add('x');
    raus.classList.add('ch-lift');
    rein.classList.add(vor ? 'ch-zin' : 'ch-zout');
    void stage.offsetWidth;                                  // Startzustand festschreiben
    rein.classList.remove('ch-zin', 'ch-zout');
    raus.classList.add(vor ? 'ch-zout' : 'ch-zin');
    _chZoomT = setTimeout(() => {
      _chZoomT = null;
      try {
        stage.classList.remove('x');
        [grid, pane].forEach(el => el.classList.remove('ch-lift', 'ch-zin', 'ch-zout'));
        grid.style.transformOrigin = ''; pane.style.transformOrigin = '';
      } catch(_) {}
    }, _CH_ZOOM_MS + 60);
  } catch(e) { console.warn('[Coach] Ebenenwechsel:', e); }
}
/* Eine Kachel des Rasters. k stammt aus _CH_CARDS und ist eigener Code, nie
   Fremdtext im onclick. Label und Wert gehen durch esc().
   cur ist der Wochen-Zwischenstand aus _crCurrent(): er wird EINMAL je
   Renderlauf gerechnet und durchgereicht, weil ihn sonst die Kennzahl und der
   Inhalt der Wochenkachel je zweimal über alle Einheiten rechnen würden — und
   gerendert wird bei jedem Schalter.

   Die Vorlesehilfe bekommt Titel, Sinnzeile und Wert als EINE Beschriftung:
   "Woche, Volumen, Trend und Kraftziel, 8.240 kg ↑ 12 %" ist die Aussage der
   Kachel, drei getrennte Fetzen wären es nicht. Symbol und Winkel sind rein
   dekorativ.

   Aufbau (Rückbau des Zahlenblocks): Symbol im getönten Feld, darunter der
   Titel im Klartext, darunter die Sinnzeile, unten die Kennzahl als Chip. Der
   Zahlenblock davor sagte nur "GESPRÄCH / noch kein Gespräch" — Kategorie plus
   Wiederholung, ohne einen Hinweis darauf, dass und wohin die Kachel führt.
   i ist die Position im Raster und steuert die gestaffelte Einblendung. */
function _chTileHTML(c, cur, i){
  let kz = '';
  try { kz = _chCardMetric(c.k, cur) || ''; }
  catch(e) { console.warn('[Coach] Kennzahl ' + c.k + ':', e); kz = ''; }
  const hero = c.k === 'chat';
  let ico = '';
  try { ico = (ICO[c.ico] || ICO.chatBubble)({ s: hero ? 20 : 18 }); } catch(_) { ico = ''; }
  let win = '';
  try { win = ICO.chevronRight({ s: 15 }); } catch(_) { win = ''; }
  const lbl = tr(c.kurz || c.de);
  const sub = Array.isArray(c.sub) ? _cm(c.sub[0], c.sub[1]) : '';
  // Die Kennzahl steht im Chip auf EINER Zeile. Lange Sätze ("diese Woche noch
  // nichts") bekommen die ruhigere Stufe, sonst drückt ein Satz in Zahlengröße
  // den Chip über die halbe Kachel.
  const lang = /\d/.test(kz) ? '' : ' lang';
  return `<button type="button" class="ch-tile${hero ? ' hero' : ''}" id="ch-tile-${c.k}" style="--i:${i || 0}"
      onclick="coachHubOpen('${c.k}')" aria-label="${esc(lbl + (sub ? ', ' + sub : '') + (kz ? ', ' + kz : ''))}">
      <span class="ch-tile-ic" aria-hidden="true">${ico}</span>
      <span class="ch-tile-go" aria-hidden="true">${win}</span>
      <span class="ch-tile-h">${esc(lbl)}</span>
      ${sub ? `<span class="ch-tile-s">${esc(sub)}</span>` : ''}
      ${kz ? `<span class="ch-tile-m${lang}">${esc(kz)}</span>` : ''}
    </button>`;
}
/* Das Panel der Detailebene. Immer nur eines, und nur wenn eine Kachel offen
   ist — der Titel steht im Blattkopf, deshalb trägt das Panel keinen. */
function _chPanelHTML(c, cur){
  let inner = '';
  try { inner = _chCardBody(c.k, cur) || ''; }
  catch(e) { console.warn('[Coach] Kachelinhalt ' + c.k + ':', e); inner = ''; }
  return `<section class="ch-panel" id="ch-panel-${c.k}"><div class="ch-in">${inner}</div></section>`;
}
/* ── Die Diagramme der Wochenkachel ──────────────────────────────────────
   Gerechnet wird in js/coach-charts.js (reine Funktionen, 57 eigene Tests),
   hier steht die Verdrahtung. Zwei Regeln, die diese Trennung tragen:

   - MARKUP IMMER, ZEICHNEN NUR BEI OFFENER KACHEL. Alle fünf Kachelinhalte
     stehen gleichzeitig im DOM, und renderCoachHub() baut sie bei jedem
     Schalter neu. Ohne die Trennung entstünden drei Chart-Instanzen pro
     Rerender, und Chart.js hält sie an der Zeichenfläche fest.
   - Die Konfigurationen entstehen BEIM RENDERN (dort liegt der Wochenstand
     ohnehin vor) und werden hier zwischengelagert; coachHubOpen() zeichnet
     nur noch. Das ist der Grund, warum coachHubOpen() weiterhin nicht
     rendert — täte es das, stürbe der CSS-Übergang der Kachel.

   Farben, Sprache, Einheit und die Bewegungsvorgabe kommen als opts herein:
   das Modul liest nichts davon selbst. */
let _chWeekCfg  = null;   // die drei Konfigurationen des letzten Renderlaufs
let _chWeekInst = [];     // die lebenden Chart-Instanzen der Kachel
// Der gedämpfte Balken ist das Neutralgrau der Diagrammraster (rgba(120,120,128,…))
// in kräftigerer Deckung — kein neuer Farbton, nur eine zweite Stufe davon.
const _CH_MUTED = 'rgba(120,120,128,.34)';
function _chReduceMotion(){
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  catch(_) { return false; }
}
function _chChartOpts(){
  let acc = '#007AFF';
  try { acc = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#007AFF'; } catch(_) {}
  return { accent: acc, muted: _CH_MUTED, lang: _lang(), unit: unitLabel(),
           reduceMotion: _chReduceMotion() };
}
// Zahl in der Schreibweise der Anzeigesprache, ohne Einheit.
function _chNum(v, digits){
  try {
    const n = Number(v);
    if (!isFinite(n)) return '0';
    return n.toLocaleString(_lang() === 'en' ? 'en-US' : 'de-DE',
      { maximumFractionDigits: digits || 0 });
  } catch(_) { return String(v); }
}
/* Die Balken der letzten Wochen — ZWEI Quellen, und die Rangfolge zwischen
   ihnen ist die ganze Regel:

   1. Liegt für eine Woche ein BERICHT im Archiv, gilt sein Wert. Immer.
      Aus derselben Quelle liest die Liste "Frühere Wochen" darunter; zwei
      Zahlen für dieselbe Woche im selben Blatt liefen auseinander, sobald
      jemand eine Einheit nachträglich ändert, und der Nutzer sähe im
      Diagramm etwas anderes als in der Liste.
   2. Für Wochen OHNE Bericht wird aus den Einheiten gerechnet
      (CoachReport.weekNumbers über CoachReport.weekStart) statt die Woche
      wegzulassen. Das Archiv füllt sich wöchentlich: wer die App heute
      installiert und acht Wochen trainiert, sähe sonst genau in diesen acht
      Wochen kein Volumendiagramm — also in der Zeit, in der er entscheidet,
      ob das Abo etwas taugt.

   In der Oberfläche wird das NICHT gekennzeichnet: für den Nutzer ist beides
   dasselbe, nämlich das Volumen dieser Woche. Der Unterschied gehört in den
   Code, nicht auf den Bildschirm.

   Wochen vor der allerersten Einheit entfallen (ein Balken auf 0, bevor es
   den Nutzer gab, wäre eine erfundene Pause); eine trainingsfreie Woche
   MITTENDRIN bleibt als 0 stehen — eine Pause ist eine Aussage.
   Werte gehen in der ANZEIGEEINHEIT hinein, das Modul rechnet nicht um. */
function _chWeekBarData(cur){
  const out = [];
  try {
    if (!window.CoachReport) return out;
    const arch = Object.create(null);
    (S.coachReports || []).forEach(r => {
      if (r && r.weekKey && !arch[r.weekKey]) arch[r.weekKey] = r;
    });
    /* Die laufende Woche kommt aus cur und ÜBERSCHREIBT einen Archiveintrag für
       genau diese Woche. Sie trägt die Zahlen aus den Einheiten (_crNowNumbers);
       der archivierte Bericht wurde am Termin gebaut und wäre für die laufende
       Woche ein eingefrorener Stand — der Balken stünde dann auf einem anderen
       Wert als die Kennzahl direkt darüber. Für ABGESCHLOSSENE Wochen bleibt das
       Archiv die Quelle. */
    if (cur && cur.rep && cur.rep.weekKey) arch[cur.rep.weekKey] = cur.rep;
    const ses = _crSessions();
    let erste = 0;
    ses.forEach(s => { if (s && isFinite(s.ts) && (!erste || s.ts < erste)) erste = s.ts; });
    const max = (window.CoachCharts && CoachCharts.MAX_BARS) || 8;
    /* Zurück gezählt wird über den KALENDER, nicht über i * 7 * 864e5: zwischen
       00:00 und 00:59 lokal rutschte die Millisekundenrechnung in den Wochen
       nach der Frühjahrsumstellung über eine Wochengrenze und übersprang eine
       Woche — acht Balken, die keine acht zusammenhängenden Wochen waren. */
    const jetzt = CoachReport.weekStart(Date.now());
    if (jetzt === null) return out;
    for (let i = max - 1; i >= 0; i--) {
      const ws = CoachReport.shiftWeeks(jetzt, -i);
      if (ws === null) continue;
      const key = _crWeekKey(ws);
      if (!key) continue;
      const rep = arch[key];
      let vol;
      if (rep) {
        vol = Math.round(Number((rep.numbers || {}).vol) || 0);
      } else {
        if (erste && CoachReport.shiftWeeks(ws, 1) <= erste) continue;   // ganz vor der ersten Einheit
        const n = CoachReport.weekNumbers(ses, ws);
        vol = Math.round(Number(n && n.vol) || 0);
      }
      if (!isFinite(vol) || vol < 0) vol = 0;
      out.push({ weekKey: key, vol: kgToDisp(vol) });
    }
  } catch(e) { console.warn('[Coach] Wochenbalken:', e); }
  return out;
}
function _chWeekBuildCfg(cur){
  const out = { vol: null, mus: null, rm: null };
  try {
    if (!window.CoachCharts) return out;
    const o = _chChartOpts();
    try { out.vol = CoachCharts.volumeBars(_chWeekBarData(cur), o); }
    catch(e) { console.warn('[Coach] Volumenbalken:', e); }
    try {
      const mus = (cur && cur.rep && cur.rep.numbers && cur.rep.numbers.muscles) || {};
      const liste = Object.keys(mus).map(k => ({
        id: k, label: muscleLabel(k) || '', vol: kgToDisp(Math.round(Number(mus[k]) || 0)) }));
      out.mus = CoachCharts.muscleBars(liste, o);
    } catch(e) { console.warn('[Coach] Muskelverteilung:', e); }
    try {
      const ziel = _crGoal();
      if (ziel) {
        const fc = CoachReport.goalForecast(ziel.history, ziel.kg, Date.now());
        if (fc) {
          const pts = ziel.history.map(h => ({
            weekIndex: CoachAnalyze.isoWeekIndex(h.ts),
            kg: kgToDisp(CoachReport.epley1rm(h.kg, h.reps))
          })).filter(p => p.weekIndex !== null);
          // goalForecast() liefert {weeks, goalKg, currentKg} — genau die Form,
          // die das Modul erwartet. Eine blanke Zahl ergäbe stillschweigend
          // eine Linie OHNE Prognose.
          out.rm = CoachCharts.oneRmLine(pts, { goalKg: kgToDisp(fc.goalKg), weeks: fc.weeks }, o);
        }
      }
    } catch(e) { console.warn('[Coach] Bestwert-Verlauf:', e); }
  } catch(e) { console.warn('[Coach] Diagramme bauen:', e); }
  return out;
}
/* Textfassung eines Diagramms für die Vorlesehilfe. Eine Zeichenfläche ist für
   sie stumm; ohne diese Zeile wäre die Verteilung für Screenreader-Nutzer
   nicht vorhanden. */
function _chChartAlt(titel, cfg, opts){
  try {
    if (!cfg) return titel;
    const labels = (cfg.data && cfg.data.labels) || [];
    const werte  = ((cfg.data && cfg.data.datasets && cfg.data.datasets[0]) || {}).data || [];
    const teile = [];
    for (let i = 0; i < labels.length; i++) {
      if (!labels[i] || werte[i] == null) continue;
      teile.push(labels[i] + ': ' + _chNum(werte[i], (opts && opts.digits) || 0) + ' ' + unitLabel());
    }
    return teile.length ? (titel + ' — ' + teile.join(', ')) : titel;
  } catch(_) { return titel; }
}
function _chWeekDestroy(){
  try { _chWeekInst.forEach(c => { try { c.destroy(); } catch(_) {} }); }
  catch(e) { console.warn('[Coach] Diagramme zerstören:', e); }
  _chWeekInst = [];
}
function _chWeekDraw(){
  try {
    _chWeekDestroy();
    if (typeof Chart !== 'function' || !_chWeekCfg) return;
    const mk = (id, cfg) => {
      if (!cfg) return;
      const cv = document.getElementById(id);
      if (!cv) return;
      // Die Konfiguration kommt aus js/coach-charts.js (eigene Tests). Statt das
      // Modul anzufassen, bekommt die FERTIGE Konfiguration hier denselben
      // Leuchtkurven-Stil wie alle anderen Liniendiagramme.
      try {
        if (cfg && cfg.type === 'line' && cfg.data && cfg.data.datasets && cfg.data.datasets[0]) {
          const _acc = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#007AFF';
          const _n = (cfg.data.datasets[0].data || []).length;
          Object.assign(cfg.data.datasets[0], _glowDs(cv, _acc, _n, false));
          cfg.options = cfg.options || {};
        }
        /* Dieselbe Behandlung fuer die Balken. Ohne sie stand in derselben
           Kachel eine leuchtende Linie ueber zwei matten Balkenreihen — der
           Bruch faellt genau deshalb auf, weil beide nebeneinander liegen. */
        if (cfg && cfg.type === 'bar') {
          const _accB = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#007AFF';
          cfg.plugins = (cfg.plugins || []).concat(_neonBarPlugin(_accB));
        }
      } catch(e) { console.warn('[Coach] Diagramm-Stil:', e); }
      try { _chWeekInst.push(new Chart(cv.getContext('2d'), cfg)); }
      catch(e) { console.warn('[Coach] Diagramm ' + id + ':', e); }
    };
    mk('chw-vol-cv', _chWeekCfg.vol);
    mk('chw-mus-cv', _chWeekCfg.mus);
    mk('chw-1rm-cv', _chWeekCfg.rm);
    /* Gezeichnet wird im Moment des Tipps — da läuft der Zoom der Detailebene
       noch, sie steht also auf scale(.93) und ist unter .ch-lift kurzzeitig
       absolut positioniert. Chart.js misst dabei eine Fläche, die es gleich
       nicht mehr gibt; sein Beobachter zieht zwar nach, aber nicht zuverlässig,
       während gleichzeitig eine Transformation läuft — nach dem Übergang
       deshalb EINMAL nachmessen lassen. Ohne diese Zeile stand das Diagramm mit
       Achsen, aber ohne Balken da (nachgesehen, nicht vermutet). */
    if (_chWeekInst.length) {
      setTimeout(() => {
        try { _chWeekInst.forEach(c => { try { c.resize(); } catch(_) {} }); }
        catch(e) { console.warn('[Coach] Diagramme nachmessen:', e); }
      }, _CH_ZOOM_MS + 60);
    }
    _chWeekCountUp();
  } catch(e) { console.warn('[Coach] Wochendiagramme:', e); }
}
/* Die Kennzahlen zählen beim Öffnen in 400 ms hoch. Der RUHEZUSTAND ist der
   Endwert (er steht im Markup) — die Animation überschreibt ihn nur
   vorübergehend. Startet sie nicht (Paint-Throttling, reduzierte Bewegung),
   steht trotzdem die richtige Zahl da; dieselbe Begründung wie beim Verzicht
   auf fill-mode in den Kachel-Keyframes. */
function _chWeekCountUp(){
  try {
    if (_chReduceMotion()) return;
    const els = [...document.querySelectorAll('#ch-panel-week .chw-n[data-n]')];
    els.forEach(el => {
      const ziel = parseFloat(el.getAttribute('data-n'));
      const ende = el.getAttribute('data-txt') || el.textContent;
      if (!isFinite(ziel) || ziel <= 0) return;
      const t0 = (window.performance && performance.now) ? performance.now() : Date.now();
      const schritt = (t) => {
        const p = Math.min(1, ((t || Date.now()) - t0) / 400);
        if (p >= 1) { el.textContent = ende; return; }
        el.textContent = _chNum(Math.round(ziel * (1 - Math.pow(1 - p, 3))), 0);
        requestAnimationFrame(schritt);
      };
      requestAnimationFrame(schritt);
    });
  } catch(e) { console.warn('[Coach] Zahlen hochzählen:', e); }
}

/* ── Das Kraftziel ───────────────────────────────────────────────────────
   ex.targetWeight existiert im Datenmodell, wird an jeder Anlagestelle mit 0
   beschrieben und war von keiner Oberfläche zu setzen — deshalb schwieg die
   fertig gebaute Prognose. Diese Zeile füllt genau dieses Feld: kein neues
   Feld, kein neuer Schreibpfad, kein Firestore. */
let _chGoalOpen = false;   // ist die Eingabe aufgeklappt?
let _chGoalEx   = '';      // welche Übung sie gerade meint
let _chGoalHint = '';      // Ablehnungshinweis, überlebt den Rerender
// Die Übung mit gesetztem Ziel — bewusst OHNE die Verlaufsbedingung aus
// _crGoal(): ein frisch gesetztes Ziel muss die Zeile auch dann tragen, wenn
// für eine Prognose noch Wochen fehlen.
function _chGoalCurrent(){
  try {
    const alle = (S.exercises || []).filter(e => e && e.targetType !== 'time' &&
      isFinite(parseFloat(e.targetWeight)) && parseFloat(e.targetWeight) > 0);
    return alle[0] || null;
  } catch(e) { console.warn('[Coach] Ziel lesen:', e); return null; }
}
// Das aktuell geschätzte Maximum dieser Übung, in kg.
function _chGoalIst(exId){
  try {
    if (!window.CoachReport || !exId) return 0;
    let best = 0;
    (S.sessions || []).forEach(s => (s.logs || []).forEach(l => {
      if (!l || l.exerciseId !== exId) return;
      (l.sets || []).forEach(x => {
        const v = CoachReport.epley1rm(parseFloat(x && x.w), parseInt(x && x.r, 10));
        if (isFinite(v) && v > best) best = v;
      });
    }));
    return best;
  } catch(e) { console.warn('[Coach] Ist-Maximum:', e); return 0; }
}
/* Die Übungen, aus denen gewählt werden kann: die mit den meisten
   Arbeitssätzen der letzten acht Wochen zuerst — daran arbeitet der Nutzer
   erkennbar. Aufwärmsätze zählen nicht mit; sie sagen nichts über den
   Schwerpunkt. Danach der Rest seiner Übungen, damit "eine andere wählen"
   nicht an einer Vorauswahl endet.

   Zur Wahl steht nur, was MIN_WEEKS Messwochen mit Gewicht hat. Zwei Gründe,
   und beide sind bindend:
   - ex.targetWeight ist NICHT nur das Kraftziel. getSuggestedWeight() gibt
     genau dieses Feld als ARBEITSGEWICHT zurück, solange die Übung keine
     Historie mit Gewicht hat. Ein Ziel auf so einer Übung wird im Training als
     Last angesagt und trägt die Aufwärmleiter — der Nutzer setzt sich ein Ziel
     und bekommt es als Vorgabe zurück.
   - Darunter liefert _crGoal() ohnehin nie eine Prognose (dieselbe Schwelle).
     Es geht also keine Funktion verloren, nur eine Zeile, die nichts könnte. */
function _chGoalCandidates(){
  try {
    if (!window.CoachReport) return [];
    const seit = Date.now() - 8 * 7 * 864e5;
    const zahl = Object.create(null);
    (S.sessions || []).forEach(s => {
      const ts = (s && s.date) ? new Date(s.date).getTime() : NaN;
      if (!isFinite(ts) || ts < seit) return;
      (s.logs || []).forEach(l => {
        if (!l || !l.exerciseId) return;
        (l.sets || []).forEach(x => {
          if (!x || (x.type || 'normal') === 'warmup') return;
          if (!(parseFloat(x.w) > 0) || !(parseInt(x.r, 10) > 0)) return;
          zahl[l.exerciseId] = (zahl[l.exerciseId] || 0) + 1;
        });
      });
    });
    const frei = (S.exercises || []).filter(e => e && e.id && e.targetType !== 'time' && e.name &&
      _crHistory(e.id).length >= CoachReport.MIN_WEEKS);
    return frei.slice().sort((a, b) => (zahl[b.id] || 0) - (zahl[a.id] || 0));
  } catch(e) { console.warn('[Coach] Zielkandidaten:', e); return []; }
}
function coachHubGoalEdit(){
  try {
    _chGoalOpen = !_chGoalOpen;
    _chGoalHint = '';
    if (_chGoalOpen && !_chGoalEx) {
      const k = _chGoalCandidates();
      const da = _chGoalCurrent();
      _chGoalEx = da ? da.id : (k[0] ? k[0].id : '');
    }
    try { if (typeof haptic === 'function') haptic(6); } catch(_) {}
    renderCoachHub();
  } catch(e) { console.warn('[Coach] Zieleingabe:', e); }
}
/* Gewählt wird über den INDEX in _chGoalCandidates(), nicht über die Kennung:
   die Kennung ist Fremdtext (sie kommt aus der Cloud oder aus einem Import),
   und Fremdtext gehört nicht in ein inline onclick — ein Apostroph darin würde
   den Aufruf verlassen. Dieselbe Bauart wie _chJrnRow(): eigene Liste, Zahl
   als Argument. */
function coachHubGoalPick(index){
  try {
    const i = Math.floor(Number(index));
    const ex = _chGoalCandidates()[i];
    if (!ex) return;
    _chGoalEx = ex.id;
    _chGoalHint = '';
    renderCoachHub();
  } catch(e) { console.warn('[Coach] Zielübung wählen:', e); }
}
function coachHubGoalSave(){
  try {
    const el = document.getElementById('chw-goal-in');
    coachSetGoal(_chGoalEx, el ? el.value : '');
  } catch(e) { console.warn('[Coach] Ziel speichern:', e); }
}
/* coachSetGoal(exId, kgDisp) — der einzige Schreibweg für ex.targetWeight.
   Der Wert kommt in der ANZEIGEEINHEIT herein und wird über dispToKg()
   gespeichert; ein lbs-Nutzer trägt lbs ein und liest lbs zurück.
   Untergrenze ist das erreichte geschätzte Maximum: ein Ziel darunter ist
   kein Ziel, und die Prognose schwiege dazu ohnehin. Abgelehnt wird mit einem
   Hinweis, der die Zahl NENNT — "zu klein" allein wäre keine Auskunft. */
function coachSetGoal(exId, kgDisp){
  try {
    const ex = exById(exId);
    if (!ex) { _chGoalHint = _cm('Wähl zuerst eine Übung.', 'Pick an exercise first.'); renderCoachHub(); return; }
    /* Ohne MIN_WEEKS Messwochen wird hier NICHTS geschrieben — derselbe Riegel
       wie in _chGoalCandidates(), aber am Schreibweg selbst: ex.targetWeight ist
       zugleich das Feld, aus dem getSuggestedWeight() ohne Historie das
       ARBEITSGEWICHT ansagt. Ein Ziel dort wäre im Training eine Last, keine
       Absicht. Der Riegel gehört an beide Stellen, weil die Auswahl nur die
       Oberfläche ist und dieser Weg der einzige Schreibpfad. */
    const min = (window.CoachReport && CoachReport.MIN_WEEKS) || 4;
    if (_crHistory(exId).length < min) {
      _chGoalHint = _cm(
        'Für ' + String(ex.name || '') + ' fehlt noch Verlauf: erst ab ' + min + ' Wochen mit Gewicht kann dein Coach rechnen.',
        'Not enough history for ' + String(ex.name || '') + ' yet: your coach needs ' + min + ' weeks logged with weight.');
      renderCoachHub(); return;
    }
    const roh = String(kgDisp == null ? '' : kgDisp).trim();
    if (!roh) {
      _chGoalHint = _cm('Trag ein Zielgewicht ein.', 'Enter a target weight.');
      renderCoachHub(); return;
    }
    /* Ziffern und HÖCHSTENS ein Trennzeichen. Ohne diese Prüfung wird "1.200"
       still zu 1,2 (parseFloat liest den Punkt als Dezimaltrenner), fällt unter
       das erreichte Maximum und wird mit "Du hebst rechnerisch schon …"
       abgelehnt — einer Auskunft über die falsche Sache. Der Eingabefehler wird
       jetzt benannt und die Eingabe zitiert, damit der Nutzer sieht, was
       angekommen ist. */
    if (!/^\d+([.,]\d{1,2})?$/.test(roh)) {
      _chGoalHint = _cm('„' + roh + '“ ist keine Zahl. Trag sie ohne Tausenderpunkt ein, zum Beispiel 102,5.',
                        '“' + roh + '” is not a number. Enter it without a thousands separator, for example 102.5.');
      renderCoachHub(); return;
    }
    const n = parseFloat(roh.replace(',', '.'));
    if (!isFinite(n) || n <= 0) {
      _chGoalHint = _cm('Trag ein Zielgewicht ein.', 'Enter a target weight.');
      renderCoachHub(); return;
    }
    const kg  = dispToKg(n);
    const ist = _chGoalIst(exId);
    if (ist > 0 && kg <= ist + 0.05) {
      const istTxt = _csWeight(ist) || '';
      _chGoalHint = _cm('Du hebst rechnerisch schon ' + istTxt + '. Setz dein Ziel darüber.',
                        'You are already at an estimated ' + istTxt + '. Set your target above that.');
      renderCoachHub(); return;
    }
    // Genau EINES gleichzeitig: die Kachel zeigt einen Verlauf, nicht fünf.
    // Die anderen Felder standen ohnehin auf 0 — es geht nichts verloren.
    (S.exercises || []).forEach(e => { if (e) e.targetWeight = 0; });
    ex.targetWeight = kg;
    _chGoalOpen = false;
    _chGoalHint = '';
    _chGoalEx = exId;
    persist();
    _coachOptRender();
  } catch(e) {
    console.warn('[Coach] Ziel setzen:', e);
    try { _coachOptRender(); } catch(_) {}
  }
}
function coachClearGoal(){
  try {
    (S.exercises || []).forEach(e => { if (e) e.targetWeight = 0; });
    _chGoalOpen = false;
    _chGoalHint = '';
    persist();
    _coachOptRender();
  } catch(e) {
    console.warn('[Coach] Ziel entfernen:', e);
    try { _coachOptRender(); } catch(_) {}
  }
}
function _chGoalHTML(){
  const out = [];
  try {
    const da = _chGoalCurrent();
    out.push(`<div class="ch-sec">${esc(tr('Kraftziel'))}<i>${esc(_cm(
      'Ein Zielgewicht macht aus dem Verlauf eine Prognose.',
      'A target weight turns the progress line into a forecast.'))}</i></div>`);
    if (da) {
      const zielTxt = _csWeight(parseFloat(da.targetWeight)) || '';
      out.push(`<button type="button" class="ch-preset on" id="chw-goal-cta" onclick="coachHubGoalEdit()">
        <b>${esc(tr('Ziel ändern'))}</b><span>${esc(String(da.name || '') + ' · ' + zielTxt)}</span></button>
        <div class="ch-row"><button type="button" class="pwz-chip" id="chw-goal-clear"
          onclick="coachClearGoal()">${esc(tr('Ziel entfernen'))}</button></div>`);
    } else {
      out.push(`<button type="button" class="ch-preset" id="chw-goal-cta" onclick="coachHubGoalEdit()">
        <b>${esc(tr('Ziel setzen'))}</b><span>${esc(_cm(
          'Sag, wohin du willst — dann rechnet dein Coach, wie lange es dauert.',
          'Say where you want to get to — your coach works out how long it takes.'))}</span></button>`);
    }
    if (_chGoalOpen && !_chGoalCandidates().length) {
      /* Noch keine Übung mit genug Messwochen: eine leere Chip-Reihe wäre eine
         Fläche, die nichts sagt. Der Grund steht stattdessen da — und was zu
         tun ist, damit die Zeile etwas kann. */
      const min = (window.CoachReport && CoachReport.MIN_WEEKS) || 4;
      out.push(`<div class="ch-jrn ghost" id="chw-goal-leer"><span>${esc(_cm(
        'Noch keine Übung mit genug Verlauf.', 'No exercise has enough history yet.'))}<i>${esc(_cm(
        'Ab ' + min + ' Wochen, in denen du eine Übung mit Gewicht loggst, rechnet dein Coach daraus eine Prognose.',
        'Once you have logged an exercise with weight in ' + min + ' weeks, your coach can turn it into a forecast.'))}</i></span></div>`);
    } else if (_chGoalOpen) {
      const kand = _chGoalCandidates();
      // Die gemerkte Übung muss noch in der Auswahl stehen — sonst zeigte die
      // Reihe keinen markierten Chip und der Speicherknopf liefe ins Leere.
      if (!kand.some(e => e.id === _chGoalEx)) _chGoalEx = kand[0].id;
      const chips = kand.map((e, i) =>
        `<button type="button" class="pwz-chip${e.id === _chGoalEx ? ' on' : ''}" ` +
        `onclick="coachHubGoalPick(${Number(i)})">${esc(String(e.name))}</button>`).join('');
      const ist = _chGoalIst(_chGoalEx);
      const vor = ist > 0 ? Math.ceil(kgToDisp(ist) + 2) : '';
      out.push(`<div class="ch-row"><span>${esc(_cm('Übung', 'Exercise'))}${ist > 0 ? `<i>${esc(_cm(
          'Aktuell geschätztes Maximum: ' + (_csWeight(ist) || ''),
          'Current estimated max: ' + (_csWeight(ist) || '')))}</i>` : ''}</span></div>
        <div class="chw-pick">${chips}</div>
        <div class="ch-row">
          <input type="text" class="pf-inp" id="chw-goal-in" inputmode="decimal" autocomplete="off"
            style="flex:1;min-width:96px" value="${esc(String(vor))}"
            aria-label="${esc(_cm('Zielgewicht in ' + unitLabel(), 'Target weight in ' + unitLabel()))}">
          <span class="chw-unit">${esc(unitLabel())}</span>
          <button type="button" class="pwz-chip on" id="chw-goal-save"
            onclick="coachHubGoalSave()">${esc(tr('Ziel setzen'))}</button>
        </div>`);
    }
    if (_chGoalHint) {
      out.push(`<div class="ch-jrn ghost" id="chw-goal-hint"><span>${esc(_chGoalHint)}</span></div>`);
    }
  } catch(e) { console.warn('[Coach] Kraftziel zeichnen:', e); }
  return `<div id="chw-goal">${out.join('')}</div>`;
}
function _chCardBody(k, cur){
  if (k === 'chat')    return _chChatHTML();
  if (k === 'week')    return _chReportHTML(cur);
  if (k === 'persona') return _chPersonaHTML();
  if (k === 'scope')   return _chScopeHTML();
  if (k === 'journal') return _chJournalHTML();
  if (k === 'perf')    return _chPerfHTML();
  return '';
}
function _chCardMetric(k, cur){
  if (k === 'chat')    return _chKzChat();
  if (k === 'week')    return _chKzWeek(cur);
  if (k === 'persona') return _chKzPersona();
  if (k === 'scope')   return _chKzScope();
  if (k === 'journal') return _chKzJournal();
  return '';
}
/* ── Die Kennzahlen ──────────────────────────────────────────────────────
   Jede Kachel trägt zugeklappt genau EINE Zahl, und jede davon ist etwas, das
   der Nutzer sonst nicht an einer Stelle sieht (Gestaltungsregel 8). Fehlt die
   Datenlage, steht dort ein Satz und kein leeres Feld. */
function _chKzChat(){
  try {
    const n = Array.isArray(_aicHist) ? _aicHist.length : 0;
    if (!n) return _cm('noch kein Gespräch', 'no conversation yet');
    return _cm(n + (n === 1 ? ' Nachricht' : ' Nachrichten'), n + (n === 1 ? ' message' : ' messages'));
  } catch(e) { console.warn('[Coach] Kennzahl Gespräch:', e); return ''; }
}
/* Volumen der laufenden Woche mit Pfeil zur Vorwoche. Die Einheit hängt am WERT
   (_csWeight), nie am Satz — ein lbs-Nutzer sieht lbs. Ohne Vorwoche gibt es
   keinen Vergleich und deshalb auch keinen Pfeil: eine Steigerung gegen nichts
   hat niemand erbracht. */
function _chKzWeek(cur){
  try {
    if (cur === undefined) cur = _crCurrent();   // null ist ein gültiges Ergebnis
    if (!cur || !cur.rep || !cur.rep.numbers) return _cm('diese Woche noch nichts', 'nothing this week yet');
    const n   = cur.rep.numbers;
    const vol = Math.round(Number(n.vol) || 0);
    const vor = Math.round(Number(n.prevVol) || 0);
    const txt = _csWeight(vol) || '';
    if (vor <= 0) return txt;
    const d = vol - vor;
    if (d === 0) return txt + ' → 0 %';
    return txt + ' ' + (d > 0 ? '↑' : '↓') + ' ' + Math.round(Math.abs(d) / vor * 100) + ' %';
  } catch(e) { console.warn('[Coach] Kennzahl Woche:', e); return ''; }
}
function _chKzPersona(){
  try {
    const p = _persona();
    const t = _CH_TONES.filter(x => x.k === p.tone)[0];
    return _coachName() + (t ? ' · ' + tr(t.de) : '');
  } catch(e) { console.warn('[Coach] Kennzahl Persönlichkeit:', e); return ''; }
}
function _chKzScope(){
  try {
    const p = _persona();
    const x = _CH_PRESETS.filter(y => y.k === p.preset)[0];
    return x ? tr(x.de) : tr('Angepasst');
  } catch(e) { console.warn('[Coach] Kennzahl Umfang:', e); return ''; }
}
function _chKzJournal(){
  try {
    let d = null;
    try { d = _dossier(); } catch(_) {}
    d = d || {};
    let n = d.goal ? 1 : 0;
    ['limits', 'prefs', 'works'].forEach(k => { if (Array.isArray(d[k])) n += d[k].length; });
    if (!n) return _cm('noch nichts notiert', 'nothing noted yet');
    return _cm(n + (n === 1 ? ' Eintrag' : ' Einträge'), n + (n === 1 ? ' entry' : ' entries'));
  } catch(e) { console.warn('[Coach] Kennzahl Journal:', e); return ''; }
}
function renderCoachHub(){
  const ov = document.getElementById('ov-coach-hub');
  // Früh zurück, wenn der Hub zu ist: der Aufruf kommt auch aus _coachOptRender()
  // heraus, also aus Kontexten ohne Hub (Live-Leiste, Heute-Karte, Chat-Kopf).
  if (!ov || !ov.classList.contains('on')) return;
  const body = document.getElementById('ch-body'); if (!body) return;
  try {
    // Kopf und Unterzeile per textContent — dieselbe Begründung wie in
    // _aicApplyName(): das ist die eine Stelle, an der der entschärfte Name
    // doch noch als Markup landen könnte. tr() greift dabei trotzdem.
    // Der Kopf trägt den Zustand: im Raster den Coach-Namen über "dein Coach",
    // in der Detailebene den Kachel-Titel über dem Coach-Namen. So bleibt
    // sichtbar, wessen Journal man liest, und der Zurück-Pfeil hat eine
    // Beschriftung, die zu ihm passt. Der Pfeil steht auf dem Platz des Orbs,
    // damit die Kopfbreite gleich bleibt.
    const karte = _CH_CARDS.filter(c => c.k === _chOpen)[0] || null;
    const h = document.getElementById('ch-title');
    if (h) h.textContent = karte ? tr(karte.de) : _coachName();
    const sub = document.getElementById('ch-sub');
    if (sub) sub.textContent = karte ? _coachName() : tr('dein Coach');
    const orb = document.getElementById('ch-orb'); if (orb) orb.hidden = !!karte;
    const bk = document.getElementById('ch-back');
    if (bk) {
      bk.hidden = !karte;
      // Das Symbol kommt aus ICO und muss deshalb aus JS ins Markup — der
      // Winkel zeigt per CSS-Drehung nach links.
      if (karte && !bk.firstChild) { try { bk.innerHTML = ICO.chevron({ s: 19 }); } catch(_) {} }
    }
    // Body NICHT ersetzen, solange eine Namensänderung läuft (s. coachHubSetName):
    // onchange feuert beim Blur, also zwischen pointerdown und pointerup des
    // nächsten Tipps — ein Rerender dazwischen nimmt die getippte Karte aus dem
    // DOM, der Klick landet auf dem Vorfahren und der erste Tipp ist verloren.
    if (_chHoldBody) return;
    // Aufgeklappte Feinjustierung überlebt den Rerender. Ohne diesen Griff klappt
    // sie bei jedem der vier Schalter zu und die Scrollposition springt. Bewusst
    // aus dem DOM gelesen statt aus einem ontoggle-Merker: das toggle-Ereignis
    // feuert erst als eigene Aufgabe, ein schneller Tipp käme ihm zuvor.
    const detOffen = !!(body.querySelector('#ch-panel-scope details') || {}).open;
    // #ch-body ist der Scroller, und ein innerHTML-Austausch wirft seine Position
    // weg. Bei einem SCHALTER muss sie stehen bleiben: _coachOptRender() rendert
    // bei jeder Option neu, und ein Sprung an den Anfang nimmt den gerade
    // getippten Chip aus dem Bild. Nur das ÖFFNEN des Blattes setzt sie zurück.
    const zurueck = _chResetScroll; _chResetScroll = false;
    const scrollVor = body.scrollTop;
    // Der Wochen-Zwischenstand EINMAL je Renderlauf — s. _chCardHTML.
    let cur = null; try { cur = _crCurrent(); } catch(e2) { console.warn('[Coach] Wochenstand:', e2); }
    // Die alten Zeichenflächen fliegen mit dem innerHTML raus; ihre Chart-
    // Instanzen bleiben sonst als Karteileichen im Register stehen.
    _chWeekDestroy();
    /* Beide Ebenen entstehen bei jedem Lauf, auch die unsichtbare: der Zoom
       zurück ins Raster braucht das Raster als messbaren Knoten, bevor es
       sichtbar wird. Teuer ist daran nichts — die Kacheln tragen nur fünf
       Kennzahlen, der Inhalt steckt im einen Panel. */
    /* Die Bereitschaft steht UNTER dem Raster und nur dort: sie fasst zusammen,
       was die Kacheln im Einzelnen zeigen — in der Detailebene waere sie eine
       Wiederholung neben dem Gegenstand, um den es gerade geht. */
    body.innerHTML = `<div class="ch-stage" id="ch-stage" data-v="${karte ? 'det' : 'grid'}">`
      + `<div class="ch-grid">${_CH_CARDS.filter(c => !c.versteckt).map((c, i) => _chTileHTML(c, cur, i)).join('')}</div>`
      + (karte ? '' : _chPerfBarHTML())
      + `<div class="ch-pane">${karte ? _chPanelHTML(karte, cur) : ''}</div></div>`;
    if (detOffen) { const d = body.querySelector('#ch-panel-scope details'); if (d) d.open = true; }
    body.scrollTop = zurueck ? 0 : scrollVor;
    // Nur die OFFENE Wochenkachel bekommt ihre Diagramme.
    if (_chOpen === 'week') _chWeekDraw();
  } catch(e) { console.warn('[Coach] Hub-Render:', e); }
}
/* Die Leistungs-Leiste unter dem Raster. Sie nennt die Zahl klein: die
   Striche tragen den Wert, die Prozentzahl steht daneben fuer alle, die es
   genau wissen wollen. Ein Tipp oeffnet die Aufschluesselung — die Leiste
   allein sagt WIE es laeuft, die Ebene dahinter WORAN es liegt. */
function _chPerfBarHTML() {
  const r = _perfScore();
  if (!r) return '';
  const f = _segFarbe(r.pct);
  return `<button type="button" class="ch-rdy" onclick="coachHubOpen('perf')">
    <div class="ch-rdy-head">
      <span class="ch-rdy-ico" style="color:${f.css}">${ICO.bolt({s:14})}</span>
      <span class="ch-rdy-lbl">${esc(_perfLabel(r.pct))}</span>
      <span class="ch-rdy-sub">${esc(_cm('Trainingsleistung','Training performance'))}</span>
      <span class="ch-rdy-pct" style="color:${f.css}">${r.pct}%</span>
      <span class="ch-rdy-chev">${ICO.chevron({s:15})}</span>
    </div>
    ${_segBarsHTML(r.pct, 16, { label: _cm('Trainingsleistung ','Training performance ') + r.pct + ' %' })}
  </button>`;
}
/* Die Aufschluesselung. Jedes Signal bekommt seine eigene Strichreihe, seinen
   Wert und einen Satz, der die Zahl BEGRUENDET statt sie zu wiederholen.
   Sortiert ist nach dem schwaechsten zuerst (siehe _perfScore): was am
   meisten kostet, steht oben, und die Vorschlaege dazu ebenfalls. */
function _chPerfHTML() {
  const r = _perfScore();
  if (!r) return `<div class="ch-empty">${esc(_cm('Noch zu wenig Training für eine Einschätzung.','Not enough training yet for an assessment.'))}</div>`;
  const f = _segFarbe(r.pct);
  const tipps = r.teile.filter(t => t.tipp);
  return `<div class="ch-perf">
    <div class="ch-perf-top">
      <div class="ch-perf-val" style="color:${f.css}">${r.pct}<i>%</i></div>
      <div class="ch-perf-lbl">${esc(_perfLabel(r.pct))}</div>
    </div>
    ${_segBarsHTML(r.pct, 16, { cls:'segbar-gross' })}
    <div class="ch-perf-rows">
      ${r.teile.map(t => {
        const tf = _segFarbe(t.w);
        return `<div class="ch-perf-row">
          <div class="ch-perf-row-head">
            <span class="ch-perf-row-lbl">${esc(t.lbl)}</span>
            <span class="ch-perf-row-g">${t.g} %</span>
            <span class="ch-perf-row-v" style="color:${tf.css}">${Math.round(t.w)}</span>
          </div>
          ${_segBarsHTML(t.w, 12, { flach:true, cls:'segbar-mini' })}
          <div class="ch-perf-row-txt">${esc(t.txt)}</div>
        </div>`;
      }).join('')}
    </div>
    ${tipps.length ? `<div class="ch-perf-tips">
      <div class="ch-perf-tips-h">${esc(_cm('Was jetzt am meisten bringt','What helps most right now'))}</div>
      ${tipps.map(t => `<div class="ch-perf-tip"><b>${esc(t.lbl)}</b><span>${esc(t.tipp)}</span></div>`).join('')}
    </div>` : `<div class="ch-perf-ok">${esc(_cm('Alle vier Signale liegen im grünen Bereich — weiter so.','All four signals are in good shape — keep going.'))}</div>`}
    <div class="ch-perf-foot">${esc(_cm('Gerechnet aus geloggten Sätzen: Kraftentwicklung, Zielerreichung, Volumen und Konstanz. Erholung steckt bewusst nicht darin — die steht als Akku-Liste in der Statistik.','Calculated from logged sets: strength trend, target hit rate, volume and consistency. Recovery is deliberately not part of it — that lives in the stats tab.'))}</div>
  </div>`;
}
// Der Name schreibt sich ohne Rerender des Bodys: Kopf, Eingabefeld und der
// Beispielsatz-Vorspann sind die einzigen Stellen im Hub, die ihn tragen.
let _chHoldBody = false;
function coachHubSetName(el){
  _chHoldBody = true;
  try { setAiCoachOpt('name', (el && el.value) || ''); }
  catch(e) { console.warn('[Coach] Name setzen:', e); }
  finally { _chHoldBody = false; }
  try {
    // Der Name steht in der Detailebene in der UNTERZEILE — im Titel steht der
    // Kachelname ("Persönlichkeit"). Ohne diese Unterscheidung überschriebe das
    // Tippen im Namensfeld die Überschrift des Blattes.
    const sub = document.getElementById('ch-sub'); if (sub) sub.textContent = _coachName();
    // Zeigt, was wirklich gespeichert wurde: safeName() kürzt und entschärft.
    if (el) el.value = _coachName();
    const ex = document.getElementById('ch-tone-ex'); if (ex) ex.innerHTML = _chToneExInner();
    // Die Kennzahl der Kachel trägt den Namen mit — sie wird ohne Rerender des
    // Bodys nicht nachgezogen. textContent, nie innerHTML.
    const kz = document.querySelector('#ch-tile-persona .ch-tile-m');
    if (kz) kz.textContent = _chKzPersona();
  } catch(e) { console.warn('[Coach] Name anwenden:', e); }
}
// ── Chat ─────────────────────────────────────────────────────────────────
// Der bestehende Chat zieht bewusst NICHT physisch um: aicSend(), das Diktat
// und der Verlauf hängen an ov-ai-chat, ein Umzug hätte alles davon angefasst,
// ohne dass der Nutzer etwas davon hätte. Der Hub zeigt den letzten Wortwechsel
// gekürzt und verlinkt das bestehende Overlay.
function _chChatHTML(){
  const nm = _coachName();
  const hist = Array.isArray(_aicHist) ? _aicHist.slice(-2) : [];
  const kurz = t => { const s = String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
                      return s.length > 180 ? s.slice(0, 180) + '…' : s; };
  const log = hist.length
    ? `<div style="display:flex;flex-direction:column;gap:8px">${hist.map(m =>
        `<div class="aic-msg ${m.role === 'user' ? 'aic-user' : 'aic-bot'}">${esc(kurz(m.content))}</div>`).join('')}</div>`
    : `<div class="ch-jrn ghost"><span>${esc(_cm(
        'Noch kein Gespräch. Frag ' + nm + ' nach Übungen, Technik oder deinem Plan.',
        'No conversation yet. Ask ' + nm + ' about exercises, technique or your plan.'))}</span></div>`;
  return `<div class="ch-sec">${esc(tr('Letzter Wortwechsel'))}</div>${log}
    <div class="aic-btns"><button type="button" class="aic-go" onclick="coachHubOpenChat()">${
      esc(_cm('Mit ' + nm + ' schreiben', 'Message ' + nm))}</button></div>`;
}
function coachHubOpenChat(){
  try { closeOv('ov-coach-hub'); } catch(_) {}
  try { openAiChat(); } catch(e) { console.warn('[Coach] Chat öffnen:', e); }
}
// ── Journal ──────────────────────────────────────────────────────────────
// "Was ich über dich weiß" — das stärkste Vertrauenssignal des Vorhabens.
// JEDER Eintrag ist Nutzer-/Modelltext ⇒ esc() zwingend, auch das Datum.
// GOALS in js/coach-memory.js sind deutsche Wörter und bleiben es auch — sie sind
// GESPEICHERTE Daten. Übersetzt wird nur die Anzeige, und nur hier: ein globaler
// I18N_EN-Schlüssel 'Kraft' würde jeden fremden Textknoten mitübersetzen, der
// zufällig genauso heißt. Ein unbekannter Wert geht unverändert durch, statt zu
// verschwinden.
const _CH_GOAL_EN = { 'Masse':'Mass', 'Kraft':'Strength', 'Abnehmen':'Weight loss', 'Fitness':'Fitness' };
function _chGoalLabel(g){
  const v = String(g == null ? '' : g);
  try { if (GT_LANG === 'en' && _CH_GOAL_EN[v]) return _CH_GOAL_EN[v]; } catch(_) {}
  return v;
}
const _CH_JRN_GROUPS = [
  { k:'goal',   de:'Dein Ziel',       en:'Your goal' },
  { k:'limits', de:'Einschränkungen', en:'Limits' },
  { k:'prefs',  de:'Vorlieben',       en:'Preferences' },
  { k:'works',  de:'Was funktioniert',en:'What works' }
];
// Ein 'until'-Feld gibt es im echten Dossier NICHT: js/coach-memory.js hält pro
// Eintrag ausschließlich {t, ts} (toEntry/sanitizeList werfen alles andere weg).
// Das Ablaufdatum wird deshalb aus ts + STALE_MS abgeleitet — und nur für
// 'limits', weil auch nur die verfallen (dossierLoad schneidet dort ab).
function _chEntryMeta(group, e){
  const ts = (e && typeof e.ts === 'number' && isFinite(e.ts)) ? e.ts : 0;
  let stale = 42 * 86400000;
  try { if (window.CoachMemory && CoachMemory.STALE_MS) stale = CoachMemory.STALE_MS; } catch(_) {}
  if (group === 'limits') {
    if (!ts) return tr('Bestätigung fällig');
    const d = new Date(ts + stale).toLocaleDateString(GT_LOCALE);
    return _cm('gilt bis ' + d, 'valid until ' + d);
  }
  if (!ts) return '';
  const d = new Date(ts).toLocaleDateString(GT_LOCALE);
  return _cm('notiert am ' + d, 'noted on ' + d);
}
function _chJrnEmpty(){
  return `<div class="ch-jrn ghost"><span>${esc(tr('Noch nichts notiert.'))}</span></div>`;
}
// group stammt aus _CH_JRN_GROUPS, index ist eine Zahl — beides eigener Code,
// nie Fremdtext im onclick. Text und Datum gehen durch esc().
function _chJrnRow(group, index, text, meta){
  return `<div class="ch-jrn"><span>${esc(text)}${meta ? `<i>${esc(meta)}</i>` : ''}</span>` +
    `<button type="button" onclick="_dossierRemove('${group}',${Number(index)})" ` +
    `aria-label="${esc(tr('Eintrag entfernen'))}">✕</button></div>`;
}
function _chJournalHTML(){
  let d = null;
  try { d = _dossier(); } catch(e) { console.warn('[Coach] Dossier lesen:', e); }
  d = d || {};
  const nm = _coachName();
  // Ohne Konto schreibt _dossierSet() nicht und _dossier() liefert leer: der
  // Nutzer sah vier Mal "Noch nichts notiert." und erfuhr nie, dass ein Konto
  // fehlt. Der Hinweis steht ZUERST, an der Stelle, an der die Erwartung
  // entsteht.
  let konto = true;
  try { konto = !!_coachUid(); } catch(_) {}
  const out = konto
    ? [`<div class="ch-jrn ghost"><span>${esc(_cm(
        nm + ' merkt sich nur, was du im Chat erzählst. Jede Zeile kannst du einzeln löschen.',
        nm + ' only remembers what you say in the chat. You can delete each line on its own.'))}</span></div>`]
    : [`<div class="ch-jrn ghost"><span>${esc(tr('Das Journal braucht ein Konto.'))}
        <i>${esc(_cm('Ohne Anmeldung merkt sich ' + nm + ' nichts über dich — angemeldet steht hier, was er weiß.',
                     'Without signing in ' + nm + ' remembers nothing about you — signed in, what he knows shows up here.'))}</i></span></div>`];
  _CH_JRN_GROUPS.forEach(g => {
    out.push(`<div class="ch-sec">${esc(tr(g.de))}</div>`);
    // 'goal' ist EIN Wert (Whitelist im Modul), keine Liste — Index 0, damit
    // _dossierRemove eine einheitliche Signatur behält.
    if (g.k === 'goal') { out.push(d.goal ? _chJrnRow('goal', 0, _chGoalLabel(d.goal), '') : _chJrnEmpty()); return; }
    const list = Array.isArray(d[g.k]) ? d[g.k] : [];
    if (!list.length) { out.push(_chJrnEmpty()); return; }
    list.forEach((e, i) => out.push(_chJrnRow(g.k, i, (e && e.t) || '', _chEntryMeta(g.k, e))));
  });
  return out.join('');
}
/* ── Woche: der Wochenbericht (Block 5, Task 21) ══════════════════════════
   js/coach-report.js rechnet, hier steht die Verdrahtung: die echten Zahlen
   aus S.sessions holen, den Bericht je Kalenderwoche EINMAL erzeugen, ihn
   höchstens acht Wochen lang aufheben und im Hub zeigen.

   Drei Grenzen, die dieser Abschnitt nicht überschreitet:
   - S.coachReports bleibt rein lokal. Kein zweiter Firestore-Schreibpfad;
     _pushToCloud() zählt seine Felder einzeln auf und kennt das Feld nicht.
   - Kein Änderungsvorschlag am Trainingsplan. Der Bericht beschreibt, was war,
     und schreibt nichts vor — das ist Block 6 und hat keine Spec.
   - Nichts wird erfunden. Fällt die Prognose aus oder der Modellaufruf, steht
     der Abschnitt gar nicht da statt mit einer Zahl, die niemand nachrechnen
     kann. Gespeichert wird mit persist(); ein save-Aufruf existiert in dieser
     App nicht, würfe einen ReferenceError und stürbe im try/catch daneben
     still — die vierte der fünf Stellen, an denen der Plan das festhält. */
const CR_MAX        = 8;                       // höchstens acht Wochen im Archiv
const CR_PREPARE_MS = 36 * 60 * 60 * 1000;     // so früh wird vorgezogen erzeugt
const CR_SAETZE     = 3;                       // genau drei Sätze Einordnung
const CR_TAGE_DE = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
const CR_TAGE_EN = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

/* Der Schlüssel der Woche, die bei ts liegt — ISO über CoachAnalyze, die
   EINZIGE Wochenrechnung des Vorhabens. getWeekKey() in dieser Datei bleibt
   unangetastet: es ist ein SPEICHERSCHLÜSSEL (S.trackerCounts[id][wk], mitsamt
   Cloud-Spiegel und Widget-Snapshot). Eine Umstellung würde jeden bestehenden
   Tracker-Ring auf null zurücksetzen.
   Und es ist kein Altformat, sondern ein ANDERER ALGORITHMUS:
   Math.ceil(((d - jan1)/86400000 + jan1.getDay() + 1)/7) zählt Wochen ab dem
   1. Januar, ISO zählt ab dem ersten Donnerstag. Beide Zahlen fallen an
   Jahresgrenzen auseinander (und getWeekKey kennt eine Woche 53, die ISO dort
   nicht hat). Wer die beiden je zusammenführen will, kommt deshalb mit einem
   padStart(2,'0') nicht hin — das machte die Schlüssel gleich lang und die
   Wochen trotzdem verschieden.
   Gerechnet wird über Donnerstag 12:00 der LOKALEN Woche und nicht über ts
   selbst: isoWeekKey rechnet in UTC, ein Montag 00:30 in UTC+2 fiele dort noch
   in die Vorwoche — und der Bericht der frischen Woche landete unter dem
   Schlüssel der alten. */
function _crWeekKey(ts) {
  try {
    if (!window.CoachReport || !window.CoachAnalyze) return null;
    const start = CoachReport.weekStart(ts);
    if (start === null) return null;
    return CoachAnalyze.isoWeekKey(start + 3 * 864e5 + 12 * 36e5);
  } catch(e) { console.warn('[Coach] Wochenschlüssel:', e); return null; }
}

/* Die Einheiten in der Form, die weekNumbers() erwartet: {ts, sets:[{ex,
   muscle, kg, reps, pr}]}. Gezählt werden ALLE Sätze mit Wiederholungen, auch
   Aufwärmsätze — genau wie sessionVolume()/setsVolume() im Rest der App. Eine
   eigene Regel hier hieße: der Bericht nennt ein anderes Volumen als die
   Statistik und als die Meldung, die ihn ankündigt.

   pr wird in EINEM Durchlauf über die chronologisch sortierten Einheiten
   gesetzt: ein Satz ist ein Bestwert, wenn sein Gewicht das bis dahin höchste
   dieser Übung ist. detectPRs() wäre die zweite Lesart und pro Einheit ein
   voller Scan über alle Sessions — beim App-Start der teuerste Weg zum selben
   Ergebnis. */
function _crSessions() {
  try {
    const alle = (S.sessions || []).map(s => {
      const ts = (s && s.date) ? new Date(s.date).getTime() : NaN;
      return isFinite(ts) ? { ts: ts, logs: (s.logs || []) } : null;
    }).filter(Boolean).sort((a, b) => a.ts - b.ts);
    const best = Object.create(null);   // exId -> höchstes Gewicht bis hierher
    return alle.map(s => {
      const sets = [];
      (s.logs || []).forEach(l => {
        if (!l) return;
        const ex   = exById(l.exerciseId);
        const name = ex ? String(ex.name || '') : '';
        const mg   = ex ? String(ex.muscleGroup || '') : '';
        const zeit = !!(ex && ex.targetType === 'time');   // Zeit-Übungen: keine PR-Logik
        (l.sets || []).forEach(x => {
          const reps = parseInt(x && x.r, 10);
          if (!isFinite(reps) || reps <= 0) return;
          const w  = parseFloat(x && x.w);
          const kg = (isFinite(w) && w > 0) ? w : 0;
          let pr = false;
          if (!zeit && kg > 0 && l.exerciseId) {
            const vor = best[l.exerciseId];
            if (vor === undefined || kg > vor) { pr = true; best[l.exerciseId] = kg; }
          }
          sets.push({ ex: name, muscle: mg, kg: kg, reps: reps, pr: pr });
        });
      });
      return { ts: s.ts, sets: sets };
    });
  } catch(e) { console.warn('[Coach] Einheiten für den Bericht:', e); return []; }
}

// Die Streak hält calcStreak() — dieselbe Zahl, die im Heute-Tab steht. Das
// Modul lässt streak deshalb bewusst auf 0 stehen und wartet auf diesen Wert.
function _crStreak() {
  try { return calcStreak().weeks || 0; } catch(e) { console.warn('[Coach] Streak:', e); return 0; }
}

/* Je Kalenderwoche der beste Satz dieser Übung als {ts, kg, reps} — nicht jeder
   Satz. Mit jedem Satz rechnete die Regression auf dem Rauschen innerhalb einer
   Einheit (vier Sätze mit fallender Last sehen aus wie ein Einbruch), das
   Bestimmtheitsmaß fiele unter MIN_R2 und die Prognose schwiege immer. */
function _crHistory(exId) {
  try {
    if (!window.CoachReport || !window.CoachAnalyze || !exId) return [];
    const proWoche = Object.create(null);
    (S.sessions || []).forEach(s => {
      const ts = (s && s.date) ? new Date(s.date).getTime() : NaN;
      if (!isFinite(ts)) return;
      const wk = CoachAnalyze.isoWeekIndex(ts);
      if (wk === null) return;
      (s.logs || []).forEach(l => {
        if (!l || l.exerciseId !== exId) return;
        (l.sets || []).forEach(x => {
          const kg = parseFloat(x && x.w), reps = parseInt(x && x.r, 10);
          if (!isFinite(kg) || kg <= 0 || !isFinite(reps) || reps <= 0) return;
          const e1 = CoachReport.epley1rm(kg, reps);
          const cur = proWoche[wk];
          if (!cur || e1 > cur.e) proWoche[wk] = { e: e1, ts: ts, kg: kg, reps: reps };
        });
      });
    });
    return Object.keys(proWoche)
      .map(k => ({ ts: proWoche[k].ts, kg: proWoche[k].kg, reps: proWoche[k].reps }))
      .sort((a, b) => a.ts - b.ts);
  } catch(e) { console.warn('[Coach] Übungsverlauf:', e); return []; }
}

/* Das Ziel, auf das die Prognose zeigt: ex.targetWeight, das EINZIGE Feld im
   Datenmodell, das ein Gewicht als Ziel einer Übung hält. Es ist heute nur
   programmatisch gesetzt (die Anlage schreibt 0) — eine Fläche zum Setzen wäre
   eine eigene Spec und steht in keiner Task dieses Plans. Solange keine da ist,
   schweigt die Prognose, und genau das verlangt der Brief für den Fall „kein
   Ziel gesetzt": der Abschnitt fehlt vollständig statt mit einer erfundenen
   Zahl dazustehen.
   Bei mehreren Zielen gewinnt die Übung mit den meisten Messwochen: sie trägt
   die Regression am besten. Ohne MIN_WEEKS Wochen Verlauf gibt es keinen
   Kandidaten — goalForecast() würde ohnehin null liefern. */
function _crGoal() {
  try {
    if (!window.CoachReport) return null;
    let best = null;
    (S.exercises || []).forEach(e => {
      if (!e || e.targetType === 'time') return;
      const kg = parseFloat(e.targetWeight);
      if (!isFinite(kg) || kg <= 0) return;
      const h = _crHistory(e.id);
      if (h.length < CoachReport.MIN_WEEKS) return;
      if (!best || h.length > best.history.length) {
        best = { exId: e.id, ex: String(e.name || ''), kg: kg, history: h };
      }
    });
    return best;
  } catch(e) { console.warn('[Coach] Ziel lesen:', e); return null; }
}

// 'KW 31 · 28. Juli – 3. Aug.' — die Woche, über die der Bericht spricht.
function _crLabel(ws) {
  try {
    if (!window.CoachReport) return '';
    const start = CoachReport.weekStart(ws);
    if (start === null) return '';
    const ende = new Date(start); ende.setDate(ende.getDate() + 6);
    const key = _crWeekKey(start);
    const nr  = key ? parseInt(String(key).split('-W')[1], 10) : NaN;
    const opt = { day: 'numeric', month: 'short' };
    const spanne = new Date(start).toLocaleDateString(GT_LOCALE, opt) + ' – ' + ende.toLocaleDateString(GT_LOCALE, opt);
    return isFinite(nr) ? (_cm('KW ' + nr, 'Week ' + nr) + ' · ' + spanne) : spanne;
  } catch(e) { console.warn('[Coach] Wochen-Beschriftung:', e); return ''; }
}

// Wann der Bericht fällig ist, als Satzteil — EINE Quelle (S.coachReportAt) für
// Termin und Ankündigung.
function _crTerminText() {
  try {
    const at = (S.coachReportAt && typeof S.coachReportAt === 'object') ? S.coachReportAt : {};
    let tag = Math.floor(Number(at.day));  if (!(tag >= 0 && tag <= 6))  tag = 0;
    let std = Math.floor(Number(at.hour)); if (!(std >= 0 && std <= 23)) std = 18;
    return _cm('am ' + CR_TAGE_DE[tag] + ' um ' + std + ' Uhr',
               'on ' + CR_TAGE_EN[tag] + ' at ' + std + ':00');
  } catch(_) { return _cm('am Sonntag', 'on Sunday'); }
}

/* Modelltext säubern. Der Prompt verlangt drei Sätze ohne Emojis; verlassen
   wird sich darauf NICHT — eine Vorgabe im Prompt ist eine Bitte, keine
   Zusicherung. Codeblöcke fliegen raus (der Chat-Endpunkt kennt ```gtplan und
   ```gtmem, beide gehören nicht in einen Bericht), Piktogramme und
   Steuerzeichen ebenso, und nach dem dritten Satz ist Schluss.

   Auch die Markdown-Auszeichnung (_mdPlain): das Modell setzt Zahlen gern fett,
   und dieser Text geht in zwei Flächen, die kein Markdown rendern — die Meldung
   und den Wochen-Reiter des Hubs. Zuerst die Codeblöcke, dann _mdPlain: sonst
   nähme dessen Backtick-Schritt einem ```-Block die Zäune und ließe den Inhalt
   im Bericht stehen. */
function _crClean(t) {
  try {
    let s = _mdPlain(String(t == null ? '' : t)
      .replace(/```[\s\S]*?```/g, ' '))
      .replace(/[\p{Extended_Pictographic}\u{FE00}-\u{FE0F}\u{1F3FB}-\u{1F3FF}\u{200D}]/gu, '')
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!s) return '';
    const teile = s.match(/[^.!?]+[.!?]+(\s|$)/g);
    if (teile && teile.length > CR_SAETZE) s = teile.slice(0, CR_SAETZE).join('').trim();
    return s;
  } catch(e) { console.warn('[Coach] Berichtstext säubern:', e); return ''; }
}

/* _crAskModel(n, forecast) — die Einordnung. Verschickt werden AUSSCHLIESSLICH
   die Zahlen: kein Dossier, keine Sätze, keine Übungsliste, keine Rohdaten.
   Der Weg ist der bestehende /chat-Endpunkt über aiCall(); ein zweiter Endpunkt
   wäre ein zweites System für dieselbe Sache.
   Der Cache aus Task 2 greift hier bewusst nicht: der Aufruf ist personenbezogen
   und würde vom Klassifikator korrekt abgelehnt. Deshalb steht hier weder
   cacheable noch cacheKey — er darf nie in den geteilten Cache.
   Jeder Grund, aus dem kein Aufruf zustande kommt, liefert '' und keinen Fehler:
   der Bericht steht auch ohne Einordnung. */
/* Ist überhaupt jemand angemeldet? aiCall() braucht ein idToken und zeigt ohne
   Anmeldung einen Hinweis-Toast — für einen Aufruf, den der Nutzer nie
   angefordert hat, wäre das eine Fehlermeldung ohne Fehler. Anonyme Anmeldung
   zählt mit: sie trägt ein idToken, und der Worker prüft den Kaufnachweis
   ohnehin selbst. Bewusst eine eigene Funktion und keine Bedingung inline —
   sie ist die Stelle, an der die Prüfung nachvollzogen werden kann. */
function _crSignedIn() {
  try { return !!(window.FB && window.FB.configured && _fbUser); } catch(_) { return false; }
}
async function _crAskModel(n, forecast) {
  try {
    if (!window.CoachPersona || !n) return '';
    let premium = false;
    try { premium = !!isPremium(); } catch(_) { premium = false; }
    if (!premium) return '';
    if (!_crSignedIn()) return '';
    if (navigator.onLine === false) return '';
    try { if (_coachQuotaExhausted()) return ''; } catch(_) {}
    const en = _lang() === 'en';
    /* Die EINHEIT hängt am WERT, nicht am Satz — dieselbe Regel wie in
       _coachSnap() und _cnText(). Vorher gingen vol/prevVol/volDelta/muscles
       und forecast.goalKg ROH in kg ans Modell und trugen das 'kg' im
       Schlüsselnamen: für einen lbs-Nutzer schrieb der Einordnungstext dann
       „12.345 kg", während die Zahlenzeile direkt darunter „27.216 lbs" zeigte
       — zwei Zahlen für dieselbe Sache auf demselben Bildschirm, und derselbe
       Satz ging über _crNotifBody() auf den Sperrbildschirm.
       Umgerechnet wird über kgToDisp(), genau hier an der Grenze; das Modul
       rechnet weiter rein in kg. Die Schlüssel heißen deshalb einheitenlos und
       die Einheit steht EINMAL im Feld 'unit' — ein Schlüssel 'volumeKg' mit
       einem lbs-Wert wäre die Lüge nur an einer anderen Stelle. */
    const einheit = unitLabel();
    const muskeln = {};
    try {
      const mus = (n.muscles && typeof n.muscles === 'object') ? n.muscles : {};
      Object.keys(mus).forEach(k => { muskeln[k] = kgToDisp(Number(mus[k]) || 0); });
    } catch(_) {}
    const zahlen = {
      workouts: n.workouts || 0, sets: n.sets || 0,
      unit: einheit,
      volume: kgToDisp(n.vol || 0), prevVolume: kgToDisp(n.prevVol || 0), volumeDelta: kgToDisp(n.volDelta || 0),
      prs: (n.prs || []).length, streakWeeks: n.streak || 0,
      muscleVolume: muskeln
    };
    if (forecast) { zahlen.goal = kgToDisp(forecast.goalKg); zahlen.goalInWeeks = forecast.weeks; }
    // Die EINE Muskelgruppe, die eine Handlung nach sich zieht — von der App
    // gerechnet und beurteilt, nicht vom Modell geschaetzt. Ist alles im
    // Bereich, steht hier nichts: ein Bericht, der jede Woche eine Baustelle
    // erfindet, wird nicht gelesen.
    try {
      const w = window.CoachVolume ? CoachVolume.worstFirst(_volVerdict(4)) : null;
      if (w) zahlen.volumeFocus = {
        muscleGroup: w.mg, setsPerWeek: w.sets, daysPerWeek: w.days,
        verdict: w.state, frequencyLow: w.freqLow, landmark: [w.mev, w.mav],
      };
    } catch(_) {}
    const auftrag = en
      ? 'Summarise this training week for the user. Exactly three sentences, no emojis, no promises about the future. Use only the numbers given and invent nothing. Every weight value is already in the unit named by the "unit" field — write that unit and convert nothing. Do not suggest any change to the training plan.'
      : 'Fasse diese Trainingswoche für den Nutzer zusammen. Genau drei Sätze, keine Emojis, keine Zusagen über die Zukunft. Nutze ausschließlich die genannten Zahlen und erfinde nichts. Alle Gewichtsangaben stehen bereits in der Einheit, die das Feld "unit" nennt — nenne genau diese Einheit und rechne nichts um. Mach keinen Vorschlag zur Änderung des Trainingsplans.';
    const inhalt = CoachPersona.personaLine(_persona(), _lang()) + '\n\n' + auftrag + '\n\n' + JSON.stringify(zahlen);
    const res = await aiCall('chat', { messages: [{ role: 'user', content: inhalt }] });
    // Namensriegel auch hier: der Wochentext nennt regelmaessig die Uebung
    // hinter einem Bestwert, und er landet ueber _crNotifBody() zusaetzlich auf
    // dem Sperrbildschirm — dort ist ein uebersetzter Name genauso falsch.
    return _aiKeepExNames(_crClean(res && res.text));
  } catch(e) { console.warn('[Coach] Bericht einordnen:', e); return ''; }
}

/* _crBuild() -> Promise<report|null>, idempotent je weekKey.

   Ein Lauf nach dem anderen. Zwei Einstiege können gleichzeitig ziehen (die
   vorgezogene Erzeugung beim Start und der Tipp auf die Meldung); ohne die
   Kette lesen beide S.coachReports, bevor einer schreibt, und die Woche
   bekäme zwei Einträge und zwei Modellaufrufe.
   Reihenfolge: Bericht ohne Modelltext ANLEGEN und sichern, erst danach fragen.
   Andersherum wäre der Bericht bei jedem Netzfehler ganz weg — der teure Teil
   ist die Zahlenlage, nicht der Satz darüber. */
let _crLauf = null;
function _crBuild() {
  try {
    const vorher = _crLauf || Promise.resolve(null);
    const lauf = vorher.catch(() => null).then(() => _crBuildRun());
    _crLauf = lauf;
    lauf.catch(() => {}).then(() => { if (_crLauf === lauf) _crLauf = null; });
    return lauf;
  } catch(e) { console.warn('[Coach] Bericht einreihen:', e); return Promise.resolve(null); }
}
async function _crBuildRun() {
  // Kontostand beim Start — dasselbe Merkmal wie in _cnSyncRun (s. _cnLauf).
  // Der Modellaufruf unten ist eine Netzrunde und damit ein langes Fenster.
  const gen = _coachGen;
  try {
    if (!window.CoachReport || !window.CoachAnalyze) return null;
    const now = Date.now();
    const ws  = CoachReport.weekStart(now);
    const wk  = _crWeekKey(now);
    if (ws === null || !wk) return null;
    if (!Array.isArray(S.coachReports)) S.coachReports = [];
    const da = S.coachReports.filter(r => r && r.weekKey === wk)[0];
    if (da) return da;                              // schon erzeugt: derselbe Bericht
    const nums = CoachReport.weekNumbers(_crSessions(), ws);
    // Eine Woche ohne Training braucht keinen Bericht. '0 Einheiten, 0 kg' ist
    // keine Auskunft, sondern eine Erinnerung daran, dass nichts passiert ist —
    // dafür gibt es den Rückkehr-Anstoß aus Block 4.
    if (!nums || nums.workouts <= 0) return null;
    nums.streak = _crStreak();
    let forecast = null;
    const ziel = _crGoal();
    if (ziel) {
      const fc = CoachReport.goalForecast(ziel.history, ziel.kg, now);
      // Der Übungsname MUSS mit: ohne ihn schweigt forecastSay() später, und
      // ein Ausblick ohne Satz wäre ein leerer Abschnitt.
      if (fc) forecast = { weeks: fc.weeks, goalKg: fc.goalKg, currentKg: fc.currentKg, ex: ziel.ex };
    }
    const rep = { weekKey: wk, label: _crLabel(ws), numbers: nums, text: '', forecast: forecast, ts: now };
    // Hat die Datentrennung inzwischen zugeschlagen, gehoert dieser Bericht dem
    // vorigen Konto und darf das gerade geleerte Archiv nicht wieder fuellen.
    if (_coachGen !== gen) return null;
    S.coachReports = [rep].concat(S.coachReports.filter(r => r && r.weekKey !== wk)).slice(0, CR_MAX);
    persist();
    const txt = await _crAskModel(nums, forecast);
    /* Zweite Pruefung nach der Netzrunde. Nur solange das Konto dasselbe ist,
       liegt rep als Referenz in S.coachReports und die Zuweisung landet im
       Archiv; nach einer Raeumung ist S.coachReports ein neues, leeres Array
       und rep haengt an nichts mehr — die Zuweisung waere dann ein persist()
       ohne Wirkung und der Modelltext von Konto A im Speicher von Konto B. */
    if (_coachGen !== gen) return null;
    if (txt) { rep.text = txt; persist(); }
    try { renderCoachHub(); } catch(_) {}
    return rep;
  } catch(e) { console.warn('[Coach] Bericht erzeugen:', e); return null; }
}

/* Der erste Satz des fertigen Textes als Meldungstext. Gibt es ihn nicht,
   liefert die Funktion '' und _cnSyncRun() fällt auf den Katalogsatz zurück.
   Geprüft wird der Schlüssel der Woche, in der der TERMIN liegt: steht der
   nächste Termin schon in der Folgewoche (Sonntag nach der Berichtsstunde),
   gehört der Text dieser Woche nicht in jene Meldung. */
function _crNotifBody(at) {
  try {
    const wk = _crWeekKey(typeof at === 'number' ? at : Date.now());
    if (!wk) return '';
    const rep = (S.coachReports || []).filter(r => r && r.weekKey === wk)[0];
    if (!rep || !rep.text) return '';
    const erster = (String(rep.text).match(/[^.!?]+[.!?]+/) || [String(rep.text)])[0];
    return _cnPlain(erster);
  } catch(e) { console.warn('[Coach] Berichtsmeldung:', e); return ''; }
}

/* Vorgezogene Erzeugung beim App-Start: liegt der Termin in den nächsten 36
   Stunden und fehlt der Text noch, wird jetzt erzeugt und die Meldung neu
   geplant — dann trägt sie die echte Zusammenfassung.
   Der Netzaufruf gehört NICHT in den Startpfad; die Aufrufstelle ruft deshalb
   mit 2,5 s Verzögerung und in try/catch. */
function _crMaybePrepare() {
  try {
    let premium = false;
    try { premium = !!isPremium(); } catch(_) { premium = false; }
    if (!premium) return;
    if (!window.CoachReport || !window.CoachAnalyze) return;
    const now = Date.now();
    const at  = _cnReportAt(now);
    if (at === null || (at - now) > CR_PREPARE_MS) return;
    const wk = _crWeekKey(at);
    if (!wk || wk !== _crWeekKey(now)) return;      // der Termin gehört zur nächsten Woche
    if ((S.coachReports || []).some(r => r && r.weekKey === wk && r.text)) return;
    _crBuild().then(rep => {
      // Neu planen, damit die Meldung den frischen Text bekommt. Ohne Bericht
      // (Woche ohne Training) bleibt alles, wie es war.
      if (rep) { try { _cnSync(); } catch(_) {} }
    }).catch(() => {});
  } catch(e) { console.warn('[Coach] Bericht vorbereiten:', e); }
}

/* Was der Reiter zeigt: der gespeicherte Bericht der laufenden Woche — und
   solange es ihn nicht gibt, der ZWISCHENSTAND aus denselben Zahlen, ohne
   Einordnung und als solcher benannt. Vor dem Termin existiert noch kein
   Bericht; eine leere Fläche wäre hier die schlechtere Auskunft als die Zahlen,
   die längst feststehen. Erzeugt wird dabei NICHTS — der Renderer läuft
   synchron und darf weder speichern noch ins Netz. */
/* Die Zahlen der LAUFENDEN Woche — die EINE Quelle für "diese Woche".
   Heute-Karte (_aicWeek) und Wochenkachel (_chKzWeek, _chWeekNumsHTML,
   _chWeekBarData) lesen ausschliesslich hier; sonst nennen zwei Flächen
   derselben App zwei Zahlen für dieselbe Woche. */
function _crNowNumbers() {
  try {
    if (!window.CoachReport) return null;
    const ws = CoachReport.weekStart(Date.now());
    if (ws === null) return null;
    const n = CoachReport.weekNumbers(_crSessions(), ws);
    if (!n) return null;
    n.streak = _crStreak();
    return n;
  } catch(e) { console.warn('[Coach] Zahlen der laufenden Woche:', e); return null; }
}
function _crCurrent() {
  try {
    if (!window.CoachReport || !window.CoachAnalyze) return null;
    const now = Date.now();
    const wk  = _crWeekKey(now);
    if (!wk) return null;
    const nums = _crNowNumbers();
    const da = (S.coachReports || []).filter(r => r && r.weekKey === wk)[0];
    /* Liegt für die laufende Woche schon ein Bericht im Archiv, trägt er weiter
       seinen TEXT und seine PROGNOSE — die sind am Termin geschrieben worden und
       werden hier nicht neu erfunden. Die ZAHLEN kommen trotzdem aus den
       Einheiten: der Bericht läuft Sonntag 18:00, und wer danach noch trainiert,
       sähe seine Einheit sonst in der Heute-Karte und nicht in der Kachel. Der
       eingefrorene Wert ist für die laufende Woche keine Auskunft, sondern ein
       veralteter Stand. Für ABGESCHLOSSENE Wochen bleibt der Archivwert
       massgeblich (_crArchivHTML, _chWeekBarData) — dort ist er das, was der
       Nutzer am Wochenende gelesen hat. Der gespeicherte Bericht wird dabei
       NICHT angefasst: der Renderer läuft synchron und schreibt nicht. */
    if (da) return { rep: nums ? Object.assign({}, da, { numbers: nums }) : da, fertig: true };
    if (!nums || nums.workouts <= 0) return null;
    const ws = CoachReport.weekStart(now);
    if (ws === null) return null;
    return { rep: { weekKey: wk, label: _crLabel(ws), numbers: nums, text: '', forecast: null, ts: now },
             fertig: false };
  } catch(e) { console.warn('[Coach] Wochenzahlen:', e); return null; }
}

// Eine Zahlenzeile. Beschriftung und Wert sind Text, beide durch esc().
function _crRow(titel, wert, unter) {
  return `<div class="ch-row"><span>${esc(titel)}${unter ? `<i>${esc(unter)}</i>` : ''}</span>` +
    `<b style="font-size:14.5px;font-weight:800;letter-spacing:-.2px;white-space:nowrap">${esc(wert)}</b></div>`;
}

/* Pfeil und Prozent zur Vorwoche. Ohne Vorwoche gibt es keinen Vergleich und
   deshalb auch keinen Pfeil: eine Steigerung gegenüber nichts hat niemand
   erbracht. Der Pfeil ist ein Zeichen, kein Piktogramm (U+2191/U+2193/U+2192)
   — dieselben Zeichen wie in der Gewichtskarte. */
function _chDeltaHTML(jetzt, vor) {
  try {
    const a = Number(jetzt) || 0, b = Number(vor) || 0;
    if (!(b > 0)) return '';
    const d = a - b;
    const pf  = d > 0 ? '↑' : d < 0 ? '↓' : '→';
    const cls = d > 0 ? ' up' : '';
    return `<div class="chw-d${cls}">${pf} ${esc(_chNum(Math.round(Math.abs(d) / b * 100), 0))} %</div>`;
  } catch(e) { console.warn('[Coach] Vergleich zur Vorwoche:', e); return ''; }
}
/* Die Kennzahlenzeile: Einheiten, Sätze, Volumen als große Ziffern, jede mit
   Pfeil und Prozent zur Vorwoche. Diese Zeile steht IMMER, auch ohne Verlauf —
   sie trägt die Kachel in den ersten Wochen, in denen für Diagramme nichts da
   ist. "Wochen in Folge" steht bewusst NICHT mehr hier: die Zahl steht schon
   im Heute-Tab und in der Streak-Kachel (Gestaltungsregel 8).
   Die Zahlen liegen in kg vor; angezeigt wird über kgToDisp(), die Einheit
   hängt als <small> am Wert und nie im Satz. */
function _chWeekNumsHTML(cur) {
  try {
    const n = (cur && cur.rep && cur.rep.numbers) || null;
    if (!n) return '';
    let vor = null;
    try {
      // Eine Woche zurück über den KALENDER (CoachReport.shiftWeeks), nicht über
      // 7 * 864e5: an der Frühjahrsumstellung ist eine Woche 167 Stunden lang,
      // und die Millisekunden landeten auf Sonntag 23:00 — also eine Woche zu
      // weit zurück. Volumen kommt aus n.prevVol, das intern denselben Weg geht;
      // Einheiten und Sätze der Vorwoche stehen dort nicht und werden hier
      // geholt.
      const ws = CoachReport.weekStart(Date.now());
      if (ws !== null) vor = CoachReport.weekNumbers(_crSessions(), CoachReport.shiftWeeks(ws, -1));
    } catch(e) { console.warn('[Coach] Vorwoche:', e); }
    const kachel = (roh, txt, einheit, label, vorWert) =>
      `<div class="aia-stat"><div class="aia-stat-v"><span class="chw-n" data-n="${esc(String(roh))}" ` +
      `data-txt="${esc(txt)}">${esc(txt)}</span>${einheit ? `<small> ${esc(einheit)}</small>` : ''}</div>` +
      `<div class="aia-stat-l">${esc(label)}</div>${_chDeltaHTML(roh, vorWert)}</div>`;
    const w  = Math.max(0, Math.floor(Number(n.workouts) || 0));
    const s  = Math.max(0, Math.floor(Number(n.sets) || 0));
    const v  = kgToDisp(Math.round(Number(n.vol) || 0));
    const vv = vor ? kgToDisp(Math.round(Number(vor.vol) || 0)) : 0;
    return `<div class="ch-sec">${esc(_cm('Diese Woche', 'This week'))}<i>${esc(_cm(
        'Pfeil und Prozent gegenüber der Vorwoche.', 'Arrow and percentage versus last week.'))}</i></div>
      <div class="aia-stats" id="chw-nums">
        ${kachel(w, _chNum(w, 0), '', _cm('Einheiten', 'Sessions'), vor ? vor.workouts : 0)}
        ${kachel(s, _chNum(s, 0), '', _cm('Sätze', 'Sets'), vor ? vor.sets : 0)}
        ${kachel(v, _chNum(v, 0), unitLabel(), _cm('Volumen', 'Volume'), vv)}
      </div>`;
  } catch(e) { console.warn('[Coach] Kennzahlen:', e); return ''; }
}

function _crLeerHTML() {
  return `<div class="ch-jrn ghost"><div class="ico">${ICO.chart2({s:22})}</div><span>${
    esc(_cm('Diese Woche steht noch keine Einheit.', 'No session logged this week yet.'))}
    <i>${esc(_cm('Sobald du trainierst, stehen hier deine Zahlen — der fertige Bericht kommt ' + _crTerminText() + '.',
                 'As soon as you train, your numbers show up here — the finished report arrives ' + _crTerminText() + '.'))}</i></span></div>`;
}

// Frühere Wochen: eine Zeile je Bericht, damit acht Wochen nicht acht
// Bildschirme füllen. Jede Zeile nennt Zahlen — eine reine Datumsliste wäre
// nach Gestaltungsregel 8 zu streichen.
function _crArchivHTML(list) {
  const out = [`<div class="ch-sec">${esc(_cm('Frühere Wochen', 'Earlier weeks'))}</div>`];
  list.slice(0, CR_MAX).forEach(r => {
    const n = (r && r.numbers) || {};
    const w = Math.max(0, Math.floor(Number(n.workouts) || 0));
    const zeile = [
      w + ' ' + (w === 1 ? _cm('Einheit', 'session') : _cm('Einheiten', 'sessions')),
      Math.max(0, Math.floor(Number(n.sets) || 0)) + ' ' + _cm('Sätze', 'sets'),
      _csWeight(Math.round(Number(n.vol) || 0)) || ''
    ].filter(Boolean).join(' · ');
    out.push(`<div class="ch-jrn"><span>${esc(String(r.label || r.weekKey || ''))}<i>${esc(zeile)}</i></span></div>`);
  });
  return out.join('');
}

/* cur ist der Zwischenstand aus _crCurrent(). Er kommt von der Aufrufstelle
   herein, weil ihn dort auch die Kennzahl der Kachel braucht — zweimal über
   alle Einheiten zu rechnen wäre bei jedem Schalter der doppelte Preis.
   Fehlt er (undefined), wird er hier geholt; null bleibt ein gültiges Ergebnis. */
function _chReportHTML(cur){
  const out = [];
  try {
    if (cur === undefined) cur = _crCurrent();
    const archiv = (S.coachReports || []).filter(r => r && (!cur || r.weekKey !== cur.rep.weekKey));
    const kopf   = (unter) => `<div class="ch-sec">${esc(tr('Wochenbericht'))}${unter ? `<i>${esc(unter)}</i>` : ''}</div>`;

    // Die Diagramm-Konfigurationen entstehen HIER, wo der Wochenstand ohnehin
    // vorliegt. Gezeichnet wird erst, wenn die Kachel offen ist (_chWeekDraw).
    _chWeekCfg = _chWeekBuildCfg(cur);

    // Keine Einheit in dieser Woche (auch: allererste Woche) — ehrliche Fläche,
    // keine leere Zeile und kein Bericht über nichts. Das Kraftziel steht
    // trotzdem: es ist kein Wochenwert, sondern eine Einstellung.
    if (!cur) {
      out.push(kopf(''));
      out.push(_crLeerHTML());
      out.push(_chGoalHTML());
      if (archiv.length) out.push(_crArchivHTML(archiv));
      return out.join('');
    }

    const r = cur.rep, n = r.numbers || {};
    out.push(kopf(r.label || ''));

    // Einordnung. Fehlt sie (kein Netz, kein Budget, noch nicht fällig), steht
    // hier kein leerer Rahmen, sondern die Auskunft, was noch aussteht.
    // _mdPlain auch hier, nicht nur in _crClean: Berichte, die vor dieser
    // Änderung entstanden sind, liegen mit ihren Sternchen im Archiv und
    // werden nie neu erzeugt — der Reiter zeigt sie sonst weiter roh.
    if (r.text) {
      out.push(`<div class="ch-jrn"><span>${esc(_mdPlain(r.text))}</span></div>`);
    } else if (!cur.fertig) {
      out.push(`<div class="ch-jrn ghost"><span>${esc(_cm(
        'Zwischenstand. Der fertige Bericht kommt ' + _crTerminText() + '.',
        'Interim numbers. The finished report arrives ' + _crTerminText() + '.'))}</span></div>`);
    }

    // Bereich 1: die Kennzahlen. Steht immer.
    out.push(_chWeekNumsHTML(cur));

    // Bereich 2: acht Wochen Volumen. Reicht die Datenlage nicht, liefert
    // CoachCharts null und der Bereich entfällt GANZ — kein leerer Rahmen,
    // keine Achse ohne Daten.
    if (_chWeekCfg.vol) {
      const titel = _cm('Volumen der letzten Wochen', 'Volume over recent weeks');
      out.push(`<div id="chw-vol"><div class="ch-sec">${esc(titel)}</div>
        <div class="chw-box"><canvas id="chw-vol-cv" role="img"
          aria-label="${esc(_chChartAlt(titel, _chWeekCfg.vol))}"></canvas></div></div>`);
    }

    // Bestwerte nur, wenn es welche gibt.
    const prs = Array.isArray(n.prs) ? n.prs.filter(p => p && p.ex) : [];
    if (prs.length) {
      out.push(`<div class="ch-sec">${esc(_cm('Bestwerte', 'Personal records'))}</div>`);
      prs.slice(0, 5).forEach(p => out.push(_crRow(String(p.ex), _csWeight(Number(p.kg) || 0) || '',
        _cm(Math.max(0, Math.floor(Number(p.reps) || 0)) + ' Wiederholungen',
            Math.max(0, Math.floor(Number(p.reps) || 0)) + ' reps'))));
    }

    /* Ausblick — nur mit Prognose UND Satz. Ein null aus goalForecast() ist ein
       gültiges Ergebnis (zu wenig Wochen, kein Trend, Ziel erreicht, mehr als
       ein Jahr Horizont) und bekommt deshalb keinen leeren Rahmen: der ganze
       Abschnitt entfällt. Der Satz kommt aus dem Katalog und trägt in allen
       vier Tönen eine Bedingung und nie eine Zusage. */
    if (r.forecast) {
      let satz = '';
      try {
        const say = CoachReport.forecastSay({ weeks: r.forecast.weeks, goalKg: r.forecast.goalKg }, r.forecast.ex);
        if (say) satz = _say(say.key, _csVars(say.vars)) || '';
      } catch(e) { console.warn('[Coach] Ausblick:', e); }
      if (satz) {
        out.push(`<div class="ch-sec">${esc(_cm('Ausblick', 'Outlook'))}</div>
          <div class="ch-jrn"><span>${esc(satz)}</span></div>`);
      }
    }

    /* Bereich 3: die Muskelverteilung als liegende Balken. Bewusst NICHT als
       vollständige Aufteilung und nicht in Prozent: muscles enthält nur Sätze
       MIT hinterlegter Muskelgruppe, die Summe kann unter dem Volumen liegen.
       Der Hinweis darauf ist PFLICHT — eine unvollständige Aufteilung, die
       vollständig aussieht, ist eine Lüge. Er steht INNERHALB des Bereichs,
       damit er mit ihm zusammen verschwindet. */
    if (_chWeekCfg.mus) {
      const titel = _cm('Schwerpunkte', 'Focus');
      out.push(`<div id="chw-mus"><div class="ch-sec">${esc(titel)}<i>${esc(_cm(
          'Nur Sätze mit hinterlegter Muskelgruppe — die Summe kann unter dem Volumen liegen.',
          'Only sets with a muscle group on file — the sum can be below the total volume.'))}</i></div>
        <div class="chw-box"><canvas id="chw-mus-cv" role="img"
          aria-label="${esc(_chChartAlt(titel, _chWeekCfg.mus))}"></canvas></div></div>`);
    }

    /* Bereich 4: der Bestwert-Verlauf mit Prognose. Er erscheint NUR mit
       gesetztem Kraftziel und gelieferter Prognose; sonst steht darunter die
       Zeile "Ziel setzen" und sonst nichts. */
    if (_chWeekCfg.rm) {
      const titel = _cm('Bestwert-Verlauf', 'Best-lift progress');
      const ziel = _chGoalCurrent();
      out.push(`<div id="chw-1rm"><div class="ch-sec">${esc(titel)}<i>${esc(_cm(
          'Geschätztes Maximum je Woche' + (ziel ? ' — ' + String(ziel.name || '') : '') +
            ', gestrichelt die Prognose bis zum Ziel.',
          'Estimated max per week' + (ziel ? ' — ' + String(ziel.name || '') : '') +
            ', dashed line is the forecast to your target.'))}</i></div>
        <div class="chw-box"><canvas id="chw-1rm-cv" role="img"
          aria-label="${esc(_chChartAlt(titel, _chWeekCfg.rm, { digits: 1 }))}"></canvas></div></div>`);
    }

    // Das Kraftziel: die Zeile, die ex.targetWeight füllt und damit die
    // schlafende Prognose weckt.
    out.push(_chGoalHTML());

    if (archiv.length) out.push(_crArchivHTML(archiv));
  } catch(e) {
    console.warn('[Coach] Wochenbericht anzeigen:', e);
    if (!out.length) return `<div class="ch-sec">${esc(tr('Wochenbericht'))}</div>` + _crLeerHTML();
  }
  return out.join('');
}
// ── Bausteine der Kacheln "Persönlichkeit" und "Umfang und Meldungen" ────
// Töne, Profile, Chip-Reihen, Schalter, Beispielsatz, Berichtstermin und die
// Berechtigungszeile. Die Coach-Einrichtung (Task 10) greift auf dieselben
// Bausteine zu — kein zweites Aussehen für dieselbe Sache.
const _CH_TONES = [
  { k:'ruhig',    de:'Ruhig' },
  { k:'sachlich', de:'Sachlich' },
  { k:'hart',     de:'Hart' },
  { k:'locker',   de:'Locker' }
];
const _CH_PRESETS = [
  { k:'quiet',    de:'Zurückhaltend', s:'Kein Live-Coach, keine Rückmeldung nach dem Satz, stille Nachrichten.' },
  { k:'balanced', de:'Ausgewogen',    s:'Live-Coach bei Schlüsselmomenten, Rückmeldung nach dem Satz, normale Nachrichten.' },
  { k:'close',    de:'Eng dabei',     s:'Live-Coach bei jedem Satz, Rückmeldung nach dem Satz, enge Nachrichten.' }
];
// Chip-Reihe für einen Textschalter. Schlüssel und Werte sind eigene Literale,
// kein Fremdtext im onclick.
function _chChips(key, cur, items){
  return `<div class="ch-row">${items.map(it =>
    `<button type="button" class="pwz-chip${it.k === cur ? ' on' : ''}" ` +
    `onclick="setAiCoachOpt('${key}','${it.k}')">${esc(it.lbl)}</button>`).join('')}</div>`;
}
function _chSwitch(key, on, title, sub){
  return `<div class="ch-row"><span>${esc(title)}<i>${esc(sub)}</i></span>
    <label class="tgl" onclick="event.stopPropagation()">
      <input type="checkbox" ${on ? 'checked' : ''} onchange="setAiCoachOpt('${key}', this.checked)">
      <span class="tgl-track"></span>
    </label></div>`;
}
// Zahlen für die zweite Beispielzeile — ECHTE, aus der letzten beendeten Einheit.
// Vorher stand hier _say('mid', {vol:4200, pct:104}): erfundene Werte, die auf der
// Vertrauensfläche wie eigene aussehen. 'debrief' statt 'mid' ist auch der
// ehrliche Schlüssel: 'mid' sagt "Halbzeit" und würde einen Zusammenhang
// behaupten, den es hier nicht gibt. Liegt keine Einheit vor, gibt es keine
// Zeile — kein Platzhalter, keine Erfindung.
function _chToneExVars(){
  try {
    const ses = (S.sessions || []).filter(x => x && Array.isArray(x.logs) && x.date);
    if (!ses.length) return null;
    const last = ses.slice().sort((a,b) => new Date(b.date) - new Date(a.date))[0];
    const vol = Math.round(sessionVolume(last));
    let sets = 0;
    (last.logs || []).forEach(l => (l.sets || []).forEach(x => {
      if (parseFloat(x.w) > 0 || parseInt(x.r) > 0) sets++;
    }));
    if (!(vol > 0) || !(sets > 0)) return null;
    // vol traegt seine Einheit selbst (s. _csWeight) — der Katalog kennt keine.
    return { sets: sets, vol: _csWeight(vol) };
  } catch(e) { console.warn('[Coach] Beispielzahlen:', e); return null; }
}
// Inhalt der Beispielsatz-Zeile — eigene Funktion, weil coachHubSetName() sie
// einzeln nachzieht, ohne den ganzen Body zu ersetzen. Leerer String heißt:
// keine Zeile (der Aufrufer rendert den Kasten dann gar nicht).
function _chToneExInner(){
  const v = _chToneExVars();
  if (!v) return '';
  const nm = _coachName();
  return `<span>${esc(_cm('So klingt ' + nm + ' nach deiner letzten Einheit:',
                          'This is how ' + nm + ' sums up your last session:'))}
    <i>${esc(_say('debrief', v))}</i></span>`;
}
/* Der einzige Ort, an dem ein Premium-Nutzer die Systemberechtigung erteilt —
   nicht beim App-Start, wo iOS sie einmal pro Installation erfragt und eine
   Ablehnung dauerhaft wäre. Verweigert er hier, ist das KEIN Fehler: ein ruhiger
   Hinweis, sonst bleibt alles, wie es war. Die Push-Stufe fasst diese Fläche
   bewusst nicht an — der Nutzer hat sie nicht geändert. */
async function coachHubAskPerm(){
  try {
    const ok = await _cnPermission();
    if (ok) { await _cnSync(); }
    else {
      try { _dndToast(_cm('Ohne Mitteilungen meldet sich dein Coach nur in der App.',
                          'Without notifications your coach only speaks inside the app.')); } catch(_) {}
    }
    try { _coachOptRender(); } catch(_) {}
  } catch(e) { console.warn('[Coach] Berechtigung im Hub:', e); }
}
/* Termin des Wochenberichts — die EINZIGE Bedienflaeche fuer S.coachReportAt.
   Sie steht im Hub und nicht im Heute-Tab: dort gibt es genau EINEN Einstieg
   zum Coach (Gestaltungsregel 1), und ein zweiter waere ein zweiter Ort fuer
   dieselbe Sache. Zwei Chip-Reihen statt eines Zeitfeldes, weil diese App
   nirgends ein <select> oder <input type="time"> kennt (kein neues Bedienmuster
   fuer eine Zeile) und der Wert ohnehin nur volle Stunden zulaesst — ein
   Zeitfeld verspraeche Minuten, die stillschweigend abgeschnitten wuerden.
   Die Zeile darunter zeigt den fertigen Satz aus DERSELBEN Quelle, die auch
   den Termin plant (_crTerminText -> S.coachReportAt). */
const _CH_STUNDEN = (() => { const a = []; for (let h = 0; h < 24; h++) a.push(h); return a; })();
function _chReportAtHTML(){
  try {
    const at  = (S.coachReportAt && typeof S.coachReportAt === 'object') ? S.coachReportAt : {};
    let tag = Math.floor(Number(at.day));  if (!(tag >= 0 && tag <= 6))  tag = 0;
    let std = Math.floor(Number(at.hour)); if (!(std >= 0 && std <= 23)) std = 18;
    const tage = (_lang() === 'en' ? CR_TAGE_EN : CR_TAGE_DE);
    const tagChips = tage.map((n, i) =>
      `<button type="button" class="pwz-chip${i === tag ? ' on' : ''}" aria-label="${esc(n)}"
        onclick="coachHubSetReportAt('day',${i})">${esc(String(n).slice(0, 2))}</button>`).join('');
    const stdChips = _CH_STUNDEN.map(h =>
      `<button type="button" class="pwz-chip${h === std ? ' on' : ''}"
        onclick="coachHubSetReportAt('hour',${h})">${h}</button>`).join('');
    return `<div class="ch-sec">${esc(_cm('Wochenbericht', 'Weekly report'))}<i>${esc(_cm(
        'Wann dein Coach die Woche zusammenfasst. Volle Stunde, Ortszeit.',
        'When your coach sums up the week. Full hour, local time.'))}</i></div>
      <div class="ch-row"><span>${esc(_cm('Tag', 'Day'))}</span></div>
      <div class="ch-row">${tagChips}</div>
      <div class="ch-row"><span>${esc(_cm('Uhrzeit', 'Time'))}</span></div>
      <div class="ch-row">${stdChips}</div>
      <div class="ch-jrn ghost"><span>${esc(_cm('Der Bericht kommt ' + _crTerminText() + '.',
                                                'The report arrives ' + _crTerminText() + '.'))}</span></div>`;
  } catch(e) { console.warn('[Coach] Berichtstermin zeichnen:', e); return ''; }
}
/* Der einzige Schreibweg fuer S.coachReportAt. Bewusst NICHT ueber
   setAiCoachOpt(): das Feld liegt nicht in S.aiCoach, und der Umweg dorthin
   kippte das Umfangs-Profil auf 'custom'. Nach der Aenderung wird sofort neu
   geplant — sonst laege der Termin bis zum naechsten App-Start noch auf der
   alten Stunde. _cnSync() bewusst nicht awaited: ein Chip ist ein Tipp, kein
   Dialog. Geschrieben wird mit persist(). */
function coachHubSetReportAt(feld, wert){
  try {
    const n = Math.floor(Number(wert));
    if (feld === 'day') { if (!(n >= 0 && n <= 6)) return; }
    else if (feld === 'hour') { if (!(n >= 0 && n <= 23)) return; }
    else return;
    if (!S.coachReportAt || typeof S.coachReportAt !== 'object' || Array.isArray(S.coachReportAt)) {
      S.coachReportAt = _coachReportAtDefault();
    }
    S.coachReportAt[feld] = n;
    persist();
    try { if (typeof haptic === 'function') haptic(6); } catch(_) {}
    _coachOptRender();
    try { _cnSync(); } catch(e2) { console.warn('[Coach] Berichtstermin planen:', e2); }
  } catch(e) {
    console.warn('[Coach] Berichtstermin:', e);
    try { _coachOptRender(); } catch(_) {}
  }
}
/* ── Der Ton-Regler ──────────────────────────────────────────────────────
   Vier Rastpunkte in der Reihenfolge aus CoachPersona.TONES. Zwischen den
   Punkten existiert KEIN Zustand: geschrieben wird immer einer der vier, und
   zwar über das bestehende setAiCoachOpt('tone', …) — kein zweiter
   Schreibweg für dieselbe Sache.

   Der Griff folgt dem Finger sofort (Klasse .drag schaltet den Übergang ab)
   und rastet beim Loslassen in 180 ms ein. Der Beispielsatz wechselt WÄHREND
   des Ziehens: das ist der Kern der Sache.

   Während der Geste hält _chHoldBody den Rerender auf — derselbe Wächter,
   der seit Task 9 den ersten Tipp nach dem Namensfeld rettet, und aus
   demselben Grund: ein Rerender mitten in der Geste nähme den Regler aus dem
   DOM und die Zeigererfassung liefe ins Leere. */
function _chToneIndex(tone){
  const i = _CH_TONES.findIndex(t => t.k === tone);
  return i >= 0 ? i : 1;                       // 'sachlich' ist die Vorgabe
}
/* Die Zahlen des Beispielsatzes sind ECHT: bestes Gewicht der letzten Einheit,
   dessen Wiederholungen und die Satzzahl dieser Einheit. Erfundene
   Beispielwerte auf einer Vertrauensfläche waren in diesem Projekt schon ein
   Befund (Block 3). Liegt keine Einheit vor, gibt es KEINEN Satz — dann steht
   dort der Hinweis, dass er nach dem ersten Training kommt. */
function _chToneSayVars(){
  try {
    const ses = (S.sessions || []).filter(x => x && Array.isArray(x.logs) && x.date);
    if (!ses.length) return null;
    const last = ses.slice().sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    let best = null, sets = 0;
    (last.logs || []).forEach(l => {
      const ex = exById(l && l.exerciseId);
      const nm = ex ? String(ex.name || '') : '';
      (l.sets || []).forEach(x => {
        const w = parseFloat(x && x.w), rp = parseInt(x && x.r, 10);
        if (!(rp > 0)) return;
        sets++;
        if (w > 0 && nm && (!best || w > best.w)) best = { w: w, r: rp, nm: nm };
      });
    });
    if (!best || !sets) return null;
    // Die Einheit hängt am WERT (_csWeight), nie im Satz.
    return { ex: best.nm, kg: _csWeight(best.w), reps: best.r, sets: sets };
  } catch(e) { console.warn('[Coach] Beispielzahlen des Reglers:', e); return null; }
}
function _chToneSayText(tone){
  try {
    const v = _chToneSayVars();
    if (!v) return '';
    return CoachPersona.say('greet', v, CoachPersona.personaGet({ tone: tone }), _lang()) || '';
  } catch(e) { console.warn('[Coach] Beispielsatz:', e); return ''; }
}
function _chToneSayHTML(tone){
  const s = _chToneSayText(tone);
  if (s) return `<div id="ch-tone-say">${esc(s)}</div>`;
  return `<div id="ch-tone-say" class="ghost">${esc(_cm(
    'Nach deiner ersten Einheit hörst du hier, wie jeder Ton mit deinen eigenen Zahlen klingt.',
    'After your first session you will hear here how each tone sounds with your own numbers.'))}</div>`;
}
function _chToneSliderHTML(tone){
  try {
    const i = _chToneIndex(tone);
    const pos = (n) => (n / (_CH_TONES.length - 1) * 100).toFixed(2) + '%';
    const dots = _CH_TONES.map((t, n) =>
      `<i class="cts-dot${n <= i ? ' on' : ''}" style="left:${pos(n)}"></i>`).join('');
    const lbls = _CH_TONES.map((t, n) =>
      `<span class="${n === i ? 'on' : ''}">${esc(tr(t.de))}</span>`).join('');
    return `<div class="cts" id="ch-tone-slider" role="slider" tabindex="0"
        aria-label="${esc(tr('Wie soll dein Coach klingen?'))}"
        aria-valuemin="0" aria-valuemax="${_CH_TONES.length - 1}" aria-valuenow="${i}"
        aria-valuetext="${esc(tr(_CH_TONES[i].de))}"
        onpointerdown="_chToneDown(event)" onkeydown="_chToneKey(event)">
        <div class="cts-track"><div class="cts-fill" style="width:${pos(i)}"></div></div>
        <div class="cts-dots">${dots}</div>
        <div class="cts-knob" style="left:calc(11px + (100% - 22px) * ${(i / (_CH_TONES.length - 1)).toFixed(4)})"></div>
      </div>
      <div class="cts-lbls">${lbls}</div>
      ${_chToneSayHTML(tone)}`;
  } catch(e) { console.warn('[Coach] Ton-Regler zeichnen:', e); return ''; }
}
/* Das Bild des Reglers ohne Rerender nachziehen: Griff, gefüllte Strecke,
   Rastpunkte, Beschriftungen, ARIA und der Beispielsatz. frei = die
   ungerundete Position des Fingers; ohne sie ruckelte der Griff von Rastpunkt
   zu Rastpunkt, statt zu folgen. */
function _chToneVisual(idx, frei){
  try {
    const el = document.getElementById('ch-tone-slider'); if (!el) return;
    const n = _CH_TONES.length - 1;
    const p = (frei == null ? idx : frei);
    const knob = el.querySelector('.cts-knob');
    const fill = el.querySelector('.cts-fill');
    if (knob) knob.style.left = 'calc(11px + (100% - 22px) * ' + (p / n).toFixed(4) + ')';
    if (fill) fill.style.width = (p / n * 100).toFixed(2) + '%';
    [...el.querySelectorAll('.cts-dot')].forEach((d, i) => d.classList.toggle('on', i <= idx));
    const lbls = el.parentElement ? el.parentElement.querySelectorAll('.cts-lbls span') : [];
    [...lbls].forEach((s, i) => s.classList.toggle('on', i === idx));
    el.setAttribute('aria-valuenow', String(idx));
    el.setAttribute('aria-valuetext', tr(_CH_TONES[idx].de));
    const say = document.getElementById('ch-tone-say');
    if (say) {
      const txt = _chToneSayText(_CH_TONES[idx].k);
      if (txt) { say.textContent = txt; say.classList.remove('ghost'); }
    }
  } catch(e) { console.warn('[Coach] Regler zeichnen:', e); }
}
function _chToneAt(el, clientX){
  try {
    const r = el.getBoundingClientRect();
    const n = _CH_TONES.length - 1;
    const roh = (clientX - r.left - 11) / Math.max(1, r.width - 22);
    const frei = Math.max(0, Math.min(n, roh * n));
    return { frei: frei, idx: Math.round(frei) };
  } catch(_) { return { frei: 1, idx: 1 }; }
}
let _chToneDrag = null;
function _chToneDown(ev){
  try {
    const el = ev.currentTarget || document.getElementById('ch-tone-slider');
    if (!el) return;
    ev.preventDefault();
    el.focus();
    el.classList.add('drag');
    _chHoldBody = true;                       // Rerender aussperren, s. oben
    _chToneDrag = { el: el, id: ev.pointerId, idx: _chToneIndex(_persona().tone) };
    try { el.setPointerCapture(ev.pointerId); } catch(_) {}
    el.onpointermove   = _chToneMove;
    el.onpointerup     = _chToneUp;
    el.onpointercancel = _chToneUp;
    /* Netz gegen einen haengenden Waechter: scheitert die Zeigererfassung
       (aeltere WebView-Fassungen), bekommt das Element kein pointerup, wenn
       der Finger daneben loslaesst — _chHoldBody bliebe true und der ganze
       Hub zeichnete bis zum naechsten Oeffnen nicht mehr neu. */
    window.addEventListener('pointerup', _chToneUp, true);
    window.addEventListener('pointercancel', _chToneUp, true);
    _chToneMove(ev);
  } catch(e) { console.warn('[Coach] Regler greifen:', e); _chToneRelease(); }
}
function _chToneMove(ev){
  try {
    if (!_chToneDrag) return;
    const { idx, frei } = _chToneAt(_chToneDrag.el, ev.clientX);
    _chToneVisual(idx, frei);
    // Geschrieben wird nur beim WECHSEL des Rastpunkts — und immer einer der
    // vier Werte, nie eine Zwischenstellung.
    if (idx !== _chToneDrag.idx) {
      _chToneDrag.idx = idx;
      try { if (typeof haptic === 'function') haptic(5); } catch(_) {}
      setAiCoachOpt('tone', _CH_TONES[idx].k);
    }
  } catch(e) { console.warn('[Coach] Regler ziehen:', e); }
}
function _chToneUp(){
  try {
    if (!_chToneDrag) return;
    const idx = _chToneDrag.idx;
    _chToneRelease();
    _chToneVisual(idx, null);                 // einrasten (180 ms per CSS)
    /* Der Zustand steht bereits: _chToneMove() schreibt bei JEDEM Wechsel des
       Rastpunkts, auch bei dem, der aus dem Zeigerdruck selbst folgt. Hier
       bleibt nur der Rerender — und der wartet, bis der Griff eingerastet ist.
       Sofort gerendert ersetzte er den Knoten, und die 180 ms waeren nie zu
       sehen. */
    setTimeout(() => {
      try {
        renderCoachHub();
        /* Der Rerender ersetzt den Knoten, und der Fokus fällt dabei auf BODY —
           danach war der Regler mit den Pfeiltasten nicht mehr zu bewegen,
           obwohl _chToneDown() ihn zu Beginn der Geste ausdrücklich fokussiert
           hat. Dieselbe Zeile wie am Ende von _chToneKey(), aus demselben
           Grund. */
        const el = document.getElementById('ch-tone-slider'); if (el) el.focus();
      } catch(_) {}
    }, 190);
  } catch(e) { console.warn('[Coach] Regler loslassen:', e); _chToneRelease(); }
}
/* Der Wächter muss auch dann fallen, wenn die Geste unsauber endet — sonst
   bliebe der ganze Hub bis zum nächsten Öffnen ungerendert. */
function _chToneRelease(){
  try {
    const d = _chToneDrag;
    _chToneDrag = null;
    _chHoldBody = false;
    try {
      window.removeEventListener('pointerup', _chToneUp, true);
      window.removeEventListener('pointercancel', _chToneUp, true);
    } catch(_) {}
    if (!d || !d.el) return;
    d.el.classList.remove('drag');
    d.el.onpointermove = null; d.el.onpointerup = null; d.el.onpointercancel = null;
    try { d.el.releasePointerCapture(d.id); } catch(_) {}
  } catch(_) { _chHoldBody = false; }
}
/* Tastatur: der Regler ist die EINZIGE Stelle, an der der Ton wählbar ist —
   ohne Pfeiltasten wäre er für einen Teil der Nutzer unerreichbar. Nach dem
   Schreiben rendert der Hub neu und ersetzt den Knoten; der Fokus muss
   deshalb ausdrücklich zurückgeholt werden. */
function _chToneKey(ev){
  try {
    const k = ev.key;
    let d = 0;
    if (k === 'ArrowRight' || k === 'ArrowUp') d = 1;
    else if (k === 'ArrowLeft' || k === 'ArrowDown') d = -1;
    else if (k === 'Home') d = -99;
    else if (k === 'End') d = 99;
    else return;
    ev.preventDefault();
    const n = _CH_TONES.length - 1;
    const idx = Math.max(0, Math.min(n, _chToneIndex(_persona().tone) + d));
    try { if (typeof haptic === 'function') haptic(5); } catch(_) {}
    setAiCoachOpt('tone', _CH_TONES[idx].k);
    const el = document.getElementById('ch-tone-slider'); if (el) el.focus();
  } catch(e) { console.warn('[Coach] Regler per Tastatur:', e); }
}

/* ── Persönlichkeit ──────────────────────────────────────────────────────
   Name und Ton. Fachlich unverändert gegenüber dem alten Einstellungs-Reiter,
   nur in die eigene Kachel einsortiert: der Nutzer fragt "wie heißt er und wie
   klingt er?" getrennt von "wie viel meldet er sich?". */
function _chPersonaHTML(){
  const p = _persona();
  const parts = [];
  // Name: onchange (nicht oninput) — bei jedem Tastendruck zu speichern würde den
  // Fokus kosten. coachHubSetName() statt setAiCoachOpt() direkt: der Schreibweg
  // darf den Body nicht ersetzen, sonst verschluckt er den nächsten Tipp.
  parts.push(`<div class="ch-sec">${esc(_cm('Name','Name'))}</div>
    <input type="text" class="pf-inp" id="ch-name" maxlength="20" autocomplete="off" spellcheck="false"
      value="${esc(p.name)}" placeholder="Coach" onchange="coachHubSetName(this)">`);
  // Ton: EIN Regler mit vier Rastpunkten statt vier Karten. Der Beispielsatz
  // wechselt beim Ziehen mit — der Nutzer hört den Unterschied, statt vier
  // Adjektive zu lesen.
  parts.push(`<div class="ch-sec">${esc(tr('Wie soll dein Coach klingen?'))}</div>`);
  parts.push(_chToneSliderHTML(p.tone));
  // Zweites Beispiel im GEWÄHLTEN Ton, über die echte Persona: wechselt beim
  // Antippen sichtbar und trägt den Namen, den die Demokarten oben nicht haben.
  const exInner = _chToneExInner();
  if (exInner) parts.push(`<div class="ch-jrn ghost" id="ch-tone-ex">${exInner}</div>`);
  return parts.join('');
}
/* ── Umfang und Meldungen ────────────────────────────────────────────────
   Die drei Profile, die Feinjustierung, der Berichtstermin und die
   Berechtigungszeile. Fachlich unverändert gegenüber dem alten
   Einstellungs-Reiter — nur in die Kachel einsortiert. */
function _chScopeHTML(){
  const p = _persona();
  const parts = [];
  /* Fehlt die Berechtigung, meldet sich der Coach nie — ohne Fehler und ohne
     Hinweis. Das steht deshalb ganz oben und nicht in der zugeklappten
     Feinjustierung: es ist kein Feinschliff, sondern die Bedingung dafür, dass
     die Nachrichten-Chips darunter überhaupt etwas bewirken. Die Zeile
     verschwindet, sobald die Berechtigung steht. */
  if (_cnNeedsPerm()) {
    const nm = _coachName();
    parts.push(`<div class="ch-sec">${esc(_cm('Mitteilungen','Notifications'))}</div>
      <button type="button" class="ch-preset" onclick="coachHubAskPerm()">
        <b>${esc(_cm('Mitteilungen erlauben','Allow notifications'))}</b>
        <span>${esc(_cm('Ohne Erlaubnis meldet sich ' + nm + ' nur in der App — keine Trainings-Erinnerung, kein Anstoß, kein Rückblick.',
                        'Without permission ' + nm + ' only speaks inside the app — no training reminder, no nudge, no look back.'))}</span>
      </button>`);
  }
  // Umfangs-Profil. Ist preset === 'custom', kommt eine vierte, deaktivierte
  // Karte dazu: der Zustand hat einen Namen, ist aber nicht anwählbar.
  parts.push(`<div class="ch-sec">${esc(tr('Wie viel Coach willst du?'))}</div>`);
  parts.push(_CH_PRESETS.map(x =>
    `<button type="button" class="ch-preset${x.k === p.preset ? ' on' : ''}" onclick="setCoachPreset('${x.k}')">
      <b>${esc(tr(x.de))}</b><span>${esc(tr(x.s))}</span></button>`).join(''));
  if (p.preset === 'custom') parts.push(
    `<button type="button" class="ch-preset on" disabled>
      <b>${esc(tr('Angepasst'))}</b><span>${esc(tr('Deine eigene Mischung aus der Feinjustierung.'))}</span></button>`);
  // Termin des Wochenberichts. Steht NICHT in der Feinjustierung: der
  // Blockabschluss verspricht "Die Uhrzeit kannst du selbst festlegen", und ein
  // Versprechen gehoert nicht hinter eine zugeklappte Klappe.
  parts.push(_chReportAtHTML());
  // Feinjustierung: zugeklappt, weil die vier Einzelschalter die Ausnahme sind.
  parts.push(`<details><summary>${esc(tr('Feinjustierung'))}</summary>
    <div class="ch-sec">${esc(tr('Live-Coach im Training'))}</div>
    <div class="ch-row"><span><i>${esc(tr('Wie präsent der Coach während einer Einheit ist.'))}</i></span></div>
    ${_chChips('inTraining', p.inTraining, [
        { k:'off',  lbl:_cm('Aus','Off') },
        { k:'key',  lbl:tr('Schlüsselmomente') },
        { k:'full', lbl:tr('Jeder Satz') }])}
    ${_chSwitch('setFeedback', p.setFeedback, tr('Rückmeldung nach dem Satz'), tr('Kurzer Kommentar, sobald ein Satz steht.'))}
    <div class="ch-sec">${esc(tr('Nachrichten'))}</div>
    <div class="ch-row"><span><i>${esc(tr('Wie oft der Coach dich außerhalb der App anspricht.'))}</i></span></div>
    ${_chChips('pushLevel', p.pushLevel, [
        { k:'still',  lbl:_cm('Still','Quiet') },
        { k:'normal', lbl:_cm('Normal','Normal') },
        { k:'eng',    lbl:_cm('Eng','Close') }])}
    ${_chSwitch('insights', p.insights, tr('Tagesempfehlung auf der Startseite'),
                tr('Trainingsvorschlag laut Erholung deiner Muskelgruppen'))}
  </details>`);
  return parts.join('');
}
// ═══ COACH-EINRICHTUNG (Task 10): der Umfang wird beim Abo-Abschluss gesetzt ══
// Ein Coach, der ungefragt redet, wird abgeschaltet und nie wieder eingeschaltet
// — ein Coach, dessen Umfang man beim Kauf selbst bestimmt hat, wird justiert
// statt gekündigt. Darum stellt genau dieser Moment die Frage.
//
// Darstellung, Klassen und Bausteine sind dieselben wie im Hub (_CH_TONES,
// _CH_PRESETS, _chToneLine, _chToneExInner, _chSwitch, .ch-preset/.ch-voice) —
// kein zweites Aussehen für dieselbe Sache. Die Schrittführung nimmt die
// bestehenden Wizard-Klassen (.pwz-dots/.pwz-q/.pwz-s/.pwz-nav).
const _CS_STEPS = 3;
// Erst 420 ms nach dem Schließen der Paywall erscheint die Einrichtung: zwei
// gleichzeitig laufende Overlay-Animationen sehen kaputt aus. Derselbe Versatz
// trägt die Übergabe an den Hub am Ende.
const _CS_DELAY = 420;
let _csStep = 1;
// Gleicher Wächter wie _chHoldBody im Hub, gleiche Begründung: das onchange des
// Namensfeldes feuert beim Blur, also zwischen pointerdown und pointerup des
// nächsten Tipps. Ein Rerender in diesem Fenster nimmt die getippte Tonkarte
// aus dem DOM, der Klick landet auf dem Vorfahren und der erste Tipp ist weg.
let _csHold = false;
function openCoachSetup(){
  _csStep = 1;
  try { openOv('ov-coach-setup'); }
  catch(e) { console.warn('[Coach] Einrichtung öffnen:', e); return; }
  renderCoachSetup();
}
function coachSetupStep(n){
  const s = Number(n);
  if (!(s >= 1 && s <= _CS_STEPS)) return;
  _csStep = s;
  try { if (typeof haptic === 'function') haptic(6); } catch(_) {}
  renderCoachSetup();
}
// Auch beim Überspringen wird ein Profil festgelegt. Bleibt preset offen, fragt
// der Hub beim nächsten Öffnen wieder — und genau das nervt. 'balanced' ist die
// mittlere Wahl, nicht die lauteste.
function _csSettlePreset(){
  S.aiCoach = S.aiCoach || { live:true, insights:true };
  if (S.aiCoach.preset !== undefined) return;
  setCoachPreset('balanced');
  if (S.aiCoach.preset !== undefined) return;
  // Rückfall auf direkte Feldschreibung. setCoachPreset() kehrt bei fehlendem
  // CoachPersona.PRESETS wirkungslos zurück ('if (!P) return;'). Ohne diesen
  // Deckel bliebe preset offen, coachSetupDone() übergäbe an openCoachHub(), und
  // dessen Weiche startete die Einrichtung erneut: der Nutzer käme nur über ✕
  // heraus und erreichte den Hub nie. Werte identisch zu PRESETS.balanced — der
  // übrige Coach-Code verteidigt sich gegen denselben Teilausfall (_persona()
  // mit doppeltem Rückfall, _chToneLine() im catch).
  S.aiCoach.inTraining  = 'key';
  S.aiCoach.setFeedback = true;
  S.aiCoach.pushLevel   = 'normal';
  S.aiCoach.live        = true;
  S.aiCoach.preset      = 'balanced';
  try { persist(); } catch(e) { console.warn('[Coach] Einrichtung sichern:', e); }
  try { _coachOptRender(); } catch(_) {}
}
