### Task 17: Verdrahtung im Training und die Offline-Prüfung

**Absicht.** Alle Module aus Block 3 gehen ans Training. Der Nutzer erlebt danach zum ersten Mal den vollständigen Bogen — und er erlebt ihn **ohne Netz**, weil Kellergyms keins haben.

**Genau eine Fläche**, `#wk-coach-bar` — es entsteht keine einzige neue.

**Schnittstelle** (in `index.html`):

| Funktion | Wann |
| --- | --- |
| `_csGet(wkTs)` / `_csPut(sess)` | Zustand holen/schreiben; `_csGet` gibt `null` bei fremdem `wkTs` |
| `_csEmit(out)` | **der einzige Weg** von einem Modul-`out` auf den Bildschirm |
| `_csStart()` | Trainingsstart |
| `_csExercise(ex)` | Übung geöffnet |
| `_csSet(log)` | Satz abgehakt |
| `_csRest(secs)` | Pausentimer abgelaufen |
| `_csEnd(summary)` | Training beendet |

**Einhängepunkte** (alle in `try/catch`):

| Einhängepunkt | Suchmuster |
| --- | --- |
| `_csStart()` | `grep -n "function startWk\|_saveActiveWk" index.html` |
| `_csExercise(ex)` | Öffnen einer Übung im Training |
| `_csSet(log)` | `function toggleSetDone`, direkt neben dem `_rpeAsk`-Aufruf aus Task 15 |
| `_csRest(secs)` | Ablauf des Pausentimers |
| `_csEnd(summary)` | `function finishWk` |
| `CoachSession.onTick` | bestehender Timer-Tick, **höchstens einmal pro Minute** |

**Verhaltensregeln.**

- `S.coachSession` lebt **rein lokal** (kein Firestore, keine Rules-Berührung) und wird bei fremdem `wkTs` verworfen.
- Neue Meldung verdrängt die vorige — sie stapeln sich nie (Gestaltungsregel 3). Haltezeit: `debrief` 14 s, sonst 9 s.
- Aufwärmschema und Technik-Cue hängen an `_csExercise`, laufen aber **über `CoachSession.emit()`**, damit sie derselben Obergrenze unterliegen. Kein zweiter Ausgabeweg.
- Der Rückblick auf einen eigenen Tipp (`recall`) nutzt das **bestehende** Aktions-Log aus dem Fundament, das bisher nie erzählt wurde.
- Am Ende wird `S.coachSession` auf `null` gesetzt und persistiert.

**Fallstricke.**

- **`save()` existiert nicht → `persist()`.** In dieser Task kommt der Aufruf viermal vor. Im `try/catch` schlägt der `ReferenceError` still fehl und der Sessionzustand wird nie geschrieben — der Coach fängt dann nach jedem Rendern von vorn an zu zählen und reißt die Obergrenze.
- **Fünf Hilfsfunktionen existieren nicht** und werden gegen den echten Code gebaut, nicht erfunden: `_csLastSame()` (letzte Einheit desselben Plantags aus `S.sessions`), `_csExpectedSets()` (Summe der Zielsätze des heutigen Tags), `_coachMutedKinds()` (aus `js/coach-log.js` — die Drosselung nach fünf Ignorierungen existiert bereits), `_coachLastAcceptedTip()` (aus demselben Log), sowie `WK.ts` / `WK.planName`. **`WK` als Zustandsobjekt konnte 2026-07-29 nicht bestätigt werden** (`WK.active` liefert 0 Treffer); die laufende Einheit wird über `isWorkoutActive()` und den Restore-Pfad `gt_active_wk` erkannt. Vor dem Schreiben `grep -n "isWorkoutActive\|gt_active_wk\|_restoreActiveWk" index.html` und die echten Feldnamen einsetzen. Wird kein stabiler `wkTs` gefunden, ist das ein Befund und wird gemeldet — `isStale()` verliert sonst seinen Sinn.

**Verifikation — die Offline-Prüfung ist der eigentliche Punkt dieser Task.**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && npm test
~/.claude/sim-native.sh gymtrack "iPhone 17"
```

Dann das Netz trennen (Simulator-Menü **Features → Network Link Conditioner → 100 % Loss**, oder WLAN am Mac ausschalten) und ein komplettes Training durchspielen:

| Schritt ohne Netz | Erwartung | Fängt welchen Fehler |
| --- | --- | --- |
| Trainingsstart | Begrüßung erscheint | Bogen hängt am Netz |
| Übung öffnen | Ansage **und** Aufwärmschema | `CoachWarmup` nicht verdrahtet |
| Sätze abhaken | Chips, Halbzeit, Ermüdungsmeldung | Trigger nicht verdrahtet |
| Training beenden | Abschluss erscheint | `force` verloren |
| Chat: „Wie lang ist meine Streak?" | Router antwortet sofort | Block 0 regressiert |
| Chat: „Was hältst du von meinem Plan?" | **ein klarer Satz**, dass dafür eine Verbindung nötig ist | roter Fehler / Stacktrace / hängender Ladepunkt |

**Punkt 6 fehlt am ehesten.** Fällt dort heute eine Fehlermeldung an, wird sie durch einen ruhigen Hinweis ersetzt („Dafür brauche ich kurz Internet. Deine Zahlen und Vorschläge laufen auch ohne weiter."), ausgelöst über `navigator.onLine === false`.

**Obergrenze in der echten App belegen:** Profil „Ausgewogen" (`key`), Training mit mindestens sechs Übungen und zwanzig Sätzen. **Mitzählen:** höchstens vier Coach-Äußerungen plus Abschluss. Dasselbe mit „Eng dabei" (`full`): höchstens acht plus Abschluss. Erscheinen mehr, wurde `emit()` irgendwo umgangen.

`xcrun simctl io "iPhone 17" screenshot /tmp/gymtrack-training.png`

Commit: `feat(coach): Erzaehlbogen im Training verdrahtet, offline geprueft`

---

## Blockabschluss 3

Ritual durchlaufen. Changelog-Key: `cl-2026-07-29-coach-training`.

```js
  'cl-2026-07-29-coach-training': {
    label: '29.07.2026 · Der Coach begleitet dein Training',
    items: [
      'Er begrüßt dich mit dem, was du beim letzten Mal geschafft hast, ordnet zur Halbzeit ein und zieht am Ende Bilanz',
      'Beim Öffnen einer Übung sagt er dir dein Aufwärmschema an — in Kilo, nicht in Prozent',
      'Nach jedem Satz kannst du mit einem Tipp sagen: leicht, passend oder schwer. Das nächste Gewicht richtet sich danach',
      'Er merkt, wenn deine Wiederholungen fallen und die Pausen länger werden — und sagt es, bevor du dich verausgabst',
      'Alles davon läuft ohne Internet. Auch im Keller-Gym',
      'Wie oft er sich meldet, bestimmst du: höchstens vier Mal pro Training, oder acht, oder gar nicht',
    ]
  },
```

**Zusätzliche Prüfung:** In den Block-3-Dateien darf kein Netzaufruf stehen.

```bash
grep -n "fetch\|AI_WORKER_URL\|XMLHttpRequest" js/coach-session.js js/coach-warmup.js js/coach-cues.js js/coach-rpe.js js/coach-analyze.js
```

Erwartung: **keine Treffer.** Ein Treffer bedeutet, dass Block 3 Geld kostet, und macht den Block nicht abnahmefähig.

---

# Block 4 — Proaktive Meldungen

**Warum jetzt:** Der Coach soll sich melden, wenn die App zu ist. Das ist der Kanal, den Block 5 für den Wochenbericht braucht.

**Warum ohne Server:** Ein Cloudflare-Cron hätte einen Service-Account mit Lesezugriff auf **fremde** Nutzerdokumente gebraucht, Gesundheitsangaben erstmals auf einem Server abgelegt, einen neuen APNs-Token-Pfad unabhängig von `S.socialOn` samt Rules-Erweiterung erfordert und für jeden Nutzer jeden Tag Firestore-Lesevorgänge gekostet. Die Geräte-Variante über `@capacitor/local-notifications` (Version 8, bereits installiert und in Benutzung) erreicht dasselbe Ergebnis. iOS hält den Termin auch bei beendeter App.

**Bekannte Grenze, bewusst akzeptiert:** Eine lokal geplante Notification kennt nur den Stand vom letzten App-Öffnen. Für Erinnerung und Rückkehr-Nudge reicht das genau.

---

