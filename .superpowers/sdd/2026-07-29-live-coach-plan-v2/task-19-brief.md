### Task 19: Meldungen planen und ausliefern

**Absicht.** Der Nutzer bekommt eine Trainings-Erinnerung, die sagt, **was ansteht** („Heute Push — Bank 3 × 8 @ 62,5") statt „Zeit fürs Gym", eine PR-Gratulation am selben Tag, einen einzelnen Rückkehr-Nudge nach fünf Tagen und einmal im Jahr einen Rückblick — alles auf dem Gerät geplant, gedeckelt, ohne Server.

**Schnittstelle.**

| Funktion | Verhalten |
| --- | --- |
| `_cnSync()` | verwirft zuerst die **eigenen** alten Termine, plant dann alles neu, schreibt die Zähler fort |
| `_cnPermission()` | fragt die Berechtigung, **nur** vom Hub aus aufgerufen |
| `CN_ID_BASE` | `47000` — eigener Nummernraum, 47000–47999 |
| `_cnIdFor(id)` | stabile Zahl aus der Text-`id` (LocalNotifications verlangt Integer) |

**Der eigene Nummernraum ist nicht optional.** `@capacitor/local-notifications` wird bereits für die Trainings-Erinnerung und den Pausen-Timer benutzt; ein pauschales `cancel()` würde den laufenden Pausen-Timer mit abräumen. Bestehende ids sind `1000` und `1000+i` (verifiziert 2026-07-29) — 47000–47999 ist frei.

**Notification-Aufbau:** Titel = `_coachName()` (genau hier zahlt sich Block 1 aus), Body = `_say(key, vars)`, `extra: { coachKind }`.

**Aufrufe einhängen:**

| Wann | Warum |
| --- | --- |
| App-Start, nach dem Laden von `S` | setzt den Rückkehr-Nudge neu — wer die App öffnet, verschiebt ihn |
| Ende von `finishWk()` | neue Erinnerung, PR-Gratulation, Deload-Prüfung |
| nach `setAiCoachOpt('pushLevel', …)` | die neue Stufe gilt sofort, nicht erst morgen |

**Berechtigung.** Wird beim Wechsel der Push-Stufe **weg von** `'still'` erfragt — an der Stelle, an der der Nutzer versteht, wofür, **nicht** beim ersten App-Start. Verweigert er, springt die Auswahl auf den vorigen Wert zurück und ein ruhiger Hinweis erscheint („Ohne Mitteilungen meldet sich dein Coach nur in der App."). **Kein Fehler.** Ohne Berechtigung bleibt `_cnSync()` still.

**Berührte Stellen.**

- Skript-Tag `js/coach-notify.js`.
- `grep -n "LocalNotifications" index.html` — bestehende Nutzung ansehen, bevor etwas geplant wird.
- `grep -n "function finishWk" index.html`.
- Bestehende generische Erinnerung: `grep -n "Zeit fürs\|notifTime\|notifEnabled" index.html`. **Die alte Planung wird entfernt**, sonst laufen zwei Erinnerungen für denselben Termin auf.

**Fallstricke.**

- **`save()` → `persist()`** (dritte Stelle in diesem Plan).
- Sechs Hilfsfunktionen gegen den echten Code bauen, nicht erfinden: `_cnNextWorkout()`, `_cnLastWorkoutTs()`, `_cnReportAt()`, `_cnWeekVol()`, `_cnDeloadDue()`, `_cnAnniversary()`.
- Für `_cnDeloadDue()` die **vorhandene** Readiness-Logik `_ciReadiness()` benutzen — keine zweite Erholungsrechnung danebenstellen.
- `_cnAnniversary()` sucht in `S.sessions` nach einer Einheit vor 365 ± 3 Tagen und vergleicht das damalige Topgewicht mit dem heutigen. **Nur melden, wenn der Fortschritt vorzeigbar ist** — bei gleichem oder niedrigerem Gewicht `null`. Ein Jahresrückblick, der Stillstand feiert, ist schlimmer als keiner.
- `_dndToast(...)` existiert bereits für den Hinweistext — nicht neu bauen.

**Testfälle** (Simulator; kein Node-Test, Plugin-nah):

| Schritt | Erwartung | Fängt welchen Fehler |
| --- | --- | --- |
| Push-Stufe „Still" → „Normal" | Berechtigungsdialog erscheint | Berechtigung beim App-Start erfragt |
| Ablehnen | Auswahl springt zurück auf „Still", Hinweis erscheint, **kein** Fehler | harter Fehlerpfad |
| Annehmen, dann `LocalNotifications.getPending()` | Termine mit `id >= 47000`, Titel = Coach-Name, Body mit konkretem Inhalt | generischer Text geblieben |
| Pausen-Timer starten, dann `_cnSync()` aufrufen | **Pausen-Timer läuft weiter** | pauschales `cancel()` — die Prüfung des Nummernraums |
| Stufe „Still" wählen | in `getPending()` nur noch der Wochenbericht | `UNCAPPED` falsch angewandt |
| Termin auf `Date.now()+15000` vorziehen, App in den Hintergrund, 15 s warten | Mitteilung auf dem Sperrbildschirm, Coach-Name als Titel | Zustellung/Titel kaputt |
| App neu starten, `getPending()` | keine Dubletten | `id` nicht stabil |

**Verifikation.**

```bash
grep -n "LocalNotifications.schedule\|id: *[0-9]" index.html | head -20
xcrun simctl io "iPhone 17" screenshot /tmp/gymtrack-notify.png
```

Jede andere Notification-id muss außerhalb von 47000–47999 liegen.

Commit: `feat(coach): proaktive Meldungen auf dem Geraet geplant, gedeckelt`

---

## Blockabschluss 4

Ritual durchlaufen. Changelog-Key: `cl-2026-07-29-coach-meldet-sich`.

```js
  'cl-2026-07-29-coach-meldet-sich': {
    label: '29.07.2026 · Dein Coach meldet sich, auch wenn die App zu ist',
    items: [
      'Die Trainings-Erinnerung sagt jetzt, was ansteht: „Heute Push — Bank 3 × 8 @ 62,5" statt „Zeit fürs Gym"',
      'Nach einem neuen Bestwert gratuliert er dir noch am selben Tag',
      'Bleibst du fünf Tage weg, meldet er sich einmal. Öffnest du die App, verschiebt sich das von selbst',
      'Einmal im Jahr zeigt er dir, wo du vor zwölf Monaten standest',
      'Du bestimmst, wie oft: gar nicht, höchstens einmal am Tag oder bis zu zweimal',
    ]
  },
```

---
# Block 5 — Wochenbericht

**Warum zuletzt:** Er braucht den Persona-Ton aus Block 1 und den Notification-Kanal aus Block 4.

**Kosten: ein LLM-Aufruf pro Woche und Nutzer** — rund 0,0017 $, also 4–5 Aufrufe im Monat für unter einem Cent. Die Zahlen selbst sind algorithmisch; das Modell liefert nur drei Sätze Einordnung.

**Der Kniff:** Der Bericht wird **vorgezogen** erzeugt — beim letzten App-Öffnen vor dem Sonntagabend-Termin. Die Notification wird dann mit dem **fertigen Text** geplant, sodass auf dem Sperrbildschirm die echte Zusammenfassung steht und nicht „Dein Bericht ist fertig, tippe hier".

---

