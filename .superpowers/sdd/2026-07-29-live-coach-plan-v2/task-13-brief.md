### Task 13: `coach-session.js` — der Erzählbogen

**Absicht.** Heute reagiert der Live-Coach auf Einzelsätze und weiß nicht, wo in der Einheit man steht. Danach begrüßt er mit dem, was beim letzten Mal stand, ordnet zur Halbzeit ein, merkt Ermüdung und Stillstand und zieht am Ende Bilanz — und **hält dabei eine harte Obergrenze ein**.

**Schnittstelle.**

| Funktion | Eingabe | Rückgabe |
| --- | --- | --- |
| `sessionNew(ctx)` | `{wkTs, level, planName, lastSame, muted, expectedSets}` | `sess` |
| `isStale(sess, wkTs)` | | `boolean` |
| `onStart(sess, ctx)` | | `{sess, out}` |
| `onExerciseOpen(sess, ex)` | `{id, name, targetSets, targetReps, lastKg}` | `{sess, out}` |
| `onSet(sess, log)` | `{exId, reps, kg, ts}` | `{sess, out}` |
| `onRest(sess, secs)` | | `{sess, out}` |
| `onTick(sess, now)` | | `{sess, out}` |
| `sessionEnd(sess, summary)` | `{sets, vol, prs}` | `{sess, out}` |
| `emit(sess, kind, key, vars, force)` | | `{sess, out}` — **die einzige Ausgabestelle** |
| `CAP` | | `{off:0, key:4, full:8}` |

`out` ist `null` **oder** `{kind, key, vars}`.

**Abweichung von der Spec, bewusst:** Die Spec schreibt `→ {text, kind}`. Das Modul liefert den Satz**schlüssel**, nicht den fertigen Satz — sonst bräuchte es Persona und Sprache und wäre nicht mehr unabhängig testbar. `index.html` macht daraus `_say(out.key, out.vars)`. Ergebnis für den Nutzer identisch, Testbarkeit deutlich besser.

**Entscheidung, die die Spec offenlässt:** Die Satz-Rückfrage (`setAsk`, Task 15) zählt **nicht** gegen die Obergrenze. Sie ist eine Bedienfläche, keine Äußerung — mit einem Deckel von vier wären nach vier Sätzen vier Chip-Reihen verbraucht und der Coach hätte kein Budget mehr für seinen eigentlichen Bogen. Sie hängt allein am Schalter `setFeedback`.

**Die drei Regelwerke, die das Verhalten festlegen:**

- **`LEVEL_KINDS`** — was auf welcher Stufe überhaupt vorkommen darf. `key`: `greet`, `greetFirst`, `exOpen`, `warmupIntro`, `debrief`. `full`: zusätzlich `mid`, `restTip`, `restNext`, `fatigue`, `stall`, `recall`, `plateau`, `timeBudget`, `cue`. `off`: nichts.
- **`ONCE`** — Arten, die je Einheit höchstens einmal vorkommen: `greet`, `greetFirst`, `mid`, `fatigue`, `stall`, `debrief`, `recall`, `plateau`, `timeBudget`. **`exOpen` fehlt bewusst** — die Ansage gilt je Übung, nicht je Einheit.
- **`emit()`** prüft in dieser Reihenfolge: Stufe `off` → Art auf dieser Stufe erlaubt → nicht gemutet → `ONCE` noch frei → Budget (`spoken < CAP[level]`). Nur `force` überspringt Stufe, Erlaubnis und Budget — und `force` gibt es an genau einer Stelle: **der Abschluss fällt nie aus.** Ihn am Budget scheitern zu lassen wäre die eine Stelle, an der Sparsamkeit als Gleichgültigkeit ankommt.

**Auslöse-Schwellen:**

| Art | Bedingung |
| --- | --- |
| `greet` / `greetFirst` | Trainingsstart, je nachdem ob `ctx.lastSame` gesetzt ist |
| `mid` | `setCount` erreicht `ceil(expectedSets/2)`; ohne Erwartungswert ersatzweise beim sechsten Satz |
| `fatigue` | Wiederholungsabfall (letzter Satz ≤ erster − 2) **und** steigende Pausen (letzte > drittletzte × 1,25). Einzeln ist beides normal — zusammen ist es Reserve am Ende |
| `restNext` | Pause ≥ 60 s |
| `stall` | 12 Minuten seit dem letzten Satz; danach nie wieder (`ONCE`) |
| `debrief` | Trainingsende, `force` |

**`isStale`:** Ein Zustand aus einer anderen Einheit ist wertlos — nach einem App-Neustart mitten im Training würde er sonst falsche Zahlen erzählen. Vergleich über `wkTs`.

**Testfälle** (`test/coach-session.test.js`). Hilfsfunktion `fullRun(level)` spielt eine Einheit durch, die **jeden** Trigger auslösen würde (3 Übungen × 3 Sätze mit fallenden Wiederholungen und steigenden Pausen, ein Tick nach 40 Minuten, Abschluss):

| Eingabe | Erwartete Ausgabe | Fängt welchen Fehler |
| --- | --- | --- |
| `fullRun('off')` | `length === 0` | `off` redet trotzdem |
| `fullRun('key')` | `0 < length <= 4` | Obergrenze umgangen — **die wichtigste Zusicherung des Blocks** |
| `fullRun('full')` | `4 < length <= 8` | `full` sagt nicht mehr als `key`, bzw. Deckel gerissen |
| `fullRun('key')`, alle `kind` | nur aus `{greet,greetFirst,exOpen,warmupIntro,debrief}` | Stufenfilter fehlt |
| 30 × `onExerciseOpen` bei `key`, dann noch eins | `out === null` | nach dem Budget wird weitergeredet |
| `fullRun('full')`, `greet`+`greetFirst` gezählt | genau `1` | Begrüßung doppelt |
| `ctx.lastSame = null`, `onStart` | `out.kind === 'greetFirst'` | falsche Begrüßung bei der ersten Einheit |
| `muted:['fatigue','stall']`, voller Lauf | keine dieser Arten im Ergebnis | Mute-Liste ignoriert |
| Satz bei `T0`, `onTick(T0+11min)` | `null` | Schwelle zu früh |
| dito `onTick(T0+13min)` | `out.kind === 'stall'` | Schwelle zu spät |
| danach `onTick(T0+30min)` | `null` | Stillstand meldet sich zweimal |
| Halbzeit erreichen | `out.kind==='mid'`, `typeof out.vars.vol === 'number'` und `> 0` | Volumen nicht mitgeführt |
| 20 × `onExerciseOpen` bei `key` (Budget leer), dann `sessionEnd` | `out.kind === 'debrief'` | `force` fehlt ⇒ Einheit endet stumm |
| `isStale(sess, wkTs+999)` / `isStale(sess, wkTs)` | `true` / `false` | fremder Zustand wird weiterverwendet |
| `onStart(...).out` | `typeof key==='string'`, `typeof vars==='object'`, `out.text === undefined` | Modul liefert fertigen Text ⇒ Persona-Kopplung |

**Fallstricke.**

- `emit()` ist die **einzige** Ausgabestelle. Schlägt der Obergrenzen-Test fehl, wurde irgendwo ein `out` an `emit` vorbei gebaut. Das zuerst prüfen, nicht die Schwellen.
- Der Zustand ist **unveränderlich fortgeschrieben** (`Object.assign({}, s, …)`), nie in-place mutiert — sonst zählt ein verworfener Rückgabewert trotzdem gegen das Budget.

**Verifikation.**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-session.test.js
```

Commit: `feat(coach): Erzaehlbogen mit harter Obergrenze je Einheit`

---

