### Task 18: `coach-notify.js` — der Frequenz-Deckel

**Absicht.** Der Deckel ist der Grund, warum diese Funktion nicht nach zwei Wochen abgeschaltet wird. Er gilt **vor** der Planung: was nicht durchpasst, wird gar nicht erst eingeplant — nicht erst beim Ausliefern verworfen.

**Schnittstelle.**

| Funktion | Rückgabe |
| --- | --- |
| `notifyNew()` | `{sentTs:{}, dayCount:0, dayKey:'', weekCount:0, weekKey:''}` |
| `weekKey(ts)` | `'2026-W31'` — ISO-8601, zweistellig |
| `dayKey(ts)` | `'2026-07-29'` |
| `mayNotify(state, kind, level, now)` | `boolean` |
| `record(state, kind, now)` | neuer State |
| `planAll(ctx)` | `[{id, at, kind, key, vars}]`, nach Zeit sortiert, Deckel bereits angewandt |
| `CAPS` | `{still:{day:0,week:0}, normal:{day:1,week:4}, eng:{day:2,week:8}}` |
| `COOLDOWN` | Mindestabstand je Art |
| `UNCAPPED` | `['report']` |

**`COOLDOWN` — die Werte sind die Anforderung:** `prCongrats: 0` (ein PR ist ein Ereignis, kein Zustand), `deload: 7 Tage`, `returnNudge: 5 Tage`, `anniversary: 365 Tage`, `reminderPlan: 0`, `report: 6 Tage`.

**`UNCAPPED`:** Der Wochenbericht ist das eine Versprechen, das auch bei `'still'` gilt — deshalb steht er außerhalb des Deckels und zählt auch nicht mit.

**`planAll`-Kandidaten:** `report` (aus `reportAt`), `reminderPlan` (aus `nextWorkout.at`), `returnNudge` (`lastWorkoutTs + 5 Tage`; liegt der in der Vergangenheit, dann `now + 5 Tage` — wer die App öffnet, verschiebt ihn), `deload` (`now + 2 h`), `anniversary` (`now + 4 h`), `prCongrats` (`now + 60 s`).

**Der Kern von `planAll`:** Die Kandidaten laufen durch `mayNotify` mit einem **fortgeschriebenen** Zustand — die Planung zählt sich selbst mit. Ohne das kämen fünf Kandidaten am selben Tag alle durch, weil jeder gegen denselben leeren Zähler prüfte. Termine in der Vergangenheit werden übersprungen. Die `id` ist `kind + ':' + dayKey(at)` — **stabil**, damit ein erneuter Lauf keine Dubletten erzeugt.

**Testfälle** (`test/coach-notify.test.js`; `T0` = Mittwoch 2026-07-29 10:00 UTC):

| Eingabe | Erwartete Ausgabe | Fängt welchen Fehler |
| --- | --- | --- |
| `weekKey(Date.UTC(2026,0,5))` | `'2026-W02'` | führende Null / Off-by-one |
| `weekKey(Date.UTC(2027,0,1))` | passt auf `/^20(26\|27)-W\d{2}$/` | Jahreswechsel: der 1.1. gehört oft zur Vorjahreswoche |
| `dayKey(T0)` | `/^\d{4}-\d{2}-\d{2}$/` | — |
| `mayNotify(neu,'report','still',T0)` | `true` | Versprechen gebrochen |
| `mayNotify(neu, k, 'still', T0)` für `k ∈ {reminderPlan, prCongrats, deload, returnNudge, anniversary}` | jeweils `false` | „Still" ist nicht still |
| `record(neu,'prCongrats',T0)`, dann `mayNotify(…,'deload','normal',T0+1h)` | `false` | Tagesdeckel `normal` |
| bei `'eng'` dieselbe Folge | zweite `true`, dritte `false` | Tagesdeckel `eng` |
| nach `record(…,T0)`, `mayNotify(…,T0+1 Tag)` | `true` | Tageszähler läuft nicht zurück |
| vier verschiedene Arten an vier Tagen, dann fünfte bei `'normal'` | `false` | Wochengrenze greift nicht |
| dieselbe Folge, dann `T0 + 8 Tage` | `true` | Wochenzähler läuft nicht zurück |
| `record(…,'prCongrats',T0)`, dann `mayNotify(…,'report','normal',T0+1h)` | `true` | Bericht gegen den Deckel gerechnet |
| `record(…,'anniversary',T0)`, dann `+200 Tage` / `+370 Tage` | `false` / `true` | Cooldown 365 |
| `record(…,'returnNudge',T0)`, dann `+2 Tage` / `+6 Tage` | `false` / `true` | Cooldown 5 |
| `planAll({level:'still', …})` | `length===1`, `plan[0].kind==='report'` | Deckel wird erst beim Senden geprüft |
| `planAll({level:'normal', viele Kandidaten})` | pro Kalendertag **höchstens ein** Nicht-`report`-Eintrag | fortgeschriebener Zustand fehlt |
| `planAll(…)` | `at` monoton steigend | unsortiert ⇒ Deckel greift in falscher Reihenfolge |
| `planAll` mit `nextWorkout.at < now`, `reportAt < now` | **jedes** `p.at > now` | Termin in der Vergangenheit |
| `planAll(c)` zweimal mit gleichem `c` | gleiche `id`-Liste, alle `id` eindeutig | Dubletten bei erneutem Lauf |

**Verifikation.**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-notify.test.js
```

Commit: `feat(coach): Frequenz-Deckel fuer proaktive Meldungen`

---

