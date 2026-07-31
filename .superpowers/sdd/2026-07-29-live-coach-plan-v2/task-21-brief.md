### Task 21: Bericht erzeugen, planen, anzeigen

**Absicht.** Sonntagabend liegt eine echte Zusammenfassung auf dem Sperrbildschirm — nicht eine Einladung, sie abzurufen. Antippen führt in die Langfassung im Hub; die letzten acht Wochen bleiben nachlesbar.

**Schnittstelle.**

| Funktion | Verhalten |
| --- | --- |
| `_crBuild()` | `Promise<report\|null>` — erzeugt den Bericht der laufenden Woche, idempotent je `weekKey` |
| `_crMaybePrepare()` | prüft beim App-Start, ob vorgezogen erzeugt werden muss |
| `S.coachReports` | `[{weekKey, label, numbers, text, forecast, ts}]`, **höchstens 8**, neueste zuerst |
| `S.coachReportAt` | `{day: 0, hour: 18}` — 0 = Sonntag |

**`_crBuild`-Regeln.** Existiert für die Woche schon ein Bericht, wird er zurückgegeben statt neu erzeugt. **Eine Woche ohne Training braucht keinen Bericht** → `null`. Die Prognose nur, wenn ein Ziel gesetzt ist **und** der Trend trägt. Fällt der Modellaufruf aus (kein Netz, Budget-Deckel), bleibt der Bericht trotzdem stehen — nur ohne Einordnung.

**`_crAskModel(n, forecast)` schickt ausschließlich die Zahlen** an den bestehenden `/chat`-Endpunkt — keine Dossier-Inhalte, keine Rohdaten. Der Prompt enthält `CoachPersona.personaLine()` und die Anweisung: **genau drei Sätze, keine Emojis, keine Zusagen über die Zukunft.**

**Vorgezogene Erzeugung.** Liegt der Berichtstermin in den nächsten **36 Stunden**, wird der Bericht jetzt erzeugt und die Notification mit dem **ersten Satz des fertigen Textes** als Body geplant. Wurde die App im Zeitfenster nie geöffnet, greift der Einladungstext aus `CoachNotify.planAll` und der Bericht entsteht beim Antippen — das ist der bewusst akzeptierte Rückfall.

**Antippen führt in den Hub:** im bestehenden Notification-Handler auf `extra.coachKind === 'report'` prüfen, `_crBuild()` nachholen (falls die App im Fenster nie offen war), dann `openCoachHub('report')`.

**Hub-Bereich „Woche".** Der Platzhalter aus Task 9 wird ersetzt durch: Label, Einordnungstext, Zeilen für Einheiten / Sätze / Volumen / Differenz zur Vorwoche / Streak, dann — nur falls vorhanden — Ausblick, Verteilung nach Muskelgruppen (absteigend sortiert) und die früheren Wochen. **Jeder leere Abschnitt entfällt vollständig**, kein leerer Rahmen.

**Der Prognose-Satz** kommt aus `_say('forecast', …)` und enthält in allen vier Tönen eine Bedingung („wenn es so weiterläuft") und **nie** eine Zusage. Das wird in Task 6 formuliert und hier geprüft.

**Berührte Stellen.**

- Skript-Tag `js/coach-report.js`.
- `grep -n "const AI_WORKER_URL" index.html` — der Berichtsaufruf läuft über den bestehenden Weg, kein neuer Endpunkt.
- Notification-Handler: `grep -n "localNotificationActionPerformed\|addListener" index.html`.
- App-Start: `_crMaybePrepare()` mit **2,5 s Verzögerung** in `try/catch` aufrufen — das hält den Netzaufruf aus dem Startpfad heraus.

**Fallstricke.**

- **`save()` → `persist()`** (vierte Stelle).
- `_crSessions()`, `_crStreak()`, `_crGoal()`, `_crHistory(ex)`, `_crLabel(ws)` gegen den echten Code bauen. **`_crHistory(ex)` liefert je Kalenderwoche das beste `{ts, kg, reps}` dieser Übung** — nicht jeden Satz, sonst rechnet die Regression auf Rauschen und `MIN_R2` schlägt immer zu.
- Der Cache aus Task 2 greift hier **nicht**: der Berichtsaufruf ist personenbezogen und wird vom Klassifikator korrekt abgelehnt. Das ist richtig so — er darf nie in den geteilten Cache.

**Testfälle** (Simulator-Konsole):

| Eingabe | Erwartete Ausgabe | Fängt welchen Fehler |
| --- | --- | --- |
| `await _crBuild()` | Objekt mit `numbers`; `text` hat **genau drei Sätze**, keine Emojis | Prompt-Vorgabe wirkungslos |
| `await _crBuild()` zweimal | zweiter Aufruf liefert dasselbe Objekt, `S.coachReports.length` unverändert | doppelter Modellaufruf pro Woche |
| Hub → „Woche" | Zahlen, Einordnung, Verteilung erscheinen | Renderer nicht ersetzt |
| Ziel gesetzt + stabiler Trend | Ausblick erscheint **und enthält eine Bedingung**, keine Zusage | Satzkatalog verspricht |
| ohne Ziel / unruhiger Verlauf | Ausblick **fehlt vollständig** | leerer Abschnitt |
| Netz trennen, `await _crBuild()` | Bericht entsteht, `text === ''`, **kein** Fehler | Modellaufruf ist Pflichtpfad |
| Woche ohne Training | `null`, kein Eintrag | leerer Bericht |
| `S.coachReportAt` auf „in einer Stunde", `_crMaybePrepare()`, dann `getPending()` | `body` trägt die **echte Zusammenfassung** | „Dein Bericht ist fertig" geblieben |
| neun Wochen künstlich anlegen | `S.coachReports.length === 8` | Archiv wächst unbegrenzt |
| Bericht-Notification antippen | Hub öffnet auf „Woche" | Handler nicht verdrahtet |

`xcrun simctl io "iPhone 17" screenshot /tmp/gymtrack-report.png`

Commit: `feat(coach): Wochenbericht vorgezogen erzeugt, Langfassung im Hub`

---

