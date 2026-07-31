### Task 22: Datentrennung und Kontowechsel

**Absicht.** Die Spec verlangt ausdrücklich: *„kein Schreibpfad nach `profiles/`; Kontowechsel setzt Persona und Session-Zustand zurück."* Dieses Vorhaben hat sechs neue Zustandsfelder eingeführt. Nach dieser Task begrüßt der Coach ein neues Konto nicht mit dem Namen und den Zahlen des vorigen.

Diese Prüfung steht bewusst **am Ende und an einer Stelle**, nicht sechsmal unterwegs.

**Schnittstelle.** Keine neue API.

**Was beim Abmelden wohin gehört:**

| Feld | Wo | Beim Abmelden |
| --- | --- | --- |
| `S.aiCoach` (Persona) | Firestore, whitelisted | **zurücksetzen** auf die Defaults, `preset: undefined` |
| `S.coachSession` | nur lokal | **löschen** |
| `S.coachPush` | nur lokal | **löschen** + geplante Notifications 47000–47999 verwerfen |
| `S.coachReports` | nur lokal | **löschen** — enthält die Zahlen des vorigen Kontos |
| `S.coachReportAt` | nur lokal | zurücksetzen auf `{day:0, hour:18}` |
| Dossier | uid-gekoppelt in `localStorage` | **bleibt** — bereits uid-gebunden, kein Handlungsbedarf |

`preset: undefined` ist Absicht: das nächste Konto durchläuft die Einrichtung neu und entscheidet selbst über den Umfang.

**Berührte Stellen.** `grep -n "signOut\|function logout\|_authLogout" index.html`

**Fallstricke.**

- **`save()` → `persist()`** (fünfte und letzte Stelle).
- Das Verwerfen der Notifications läuft über denselben Nummernraum-Filter wie `_cnSync()` — **kein pauschales `cancel()`**, sonst stirbt der Pausen-Timer.
- Der Abmelde-Pfad kann synchron sein; die Notification-Aufräumung ist asynchron. Sie darf das Abmelden nicht blockieren und läuft in `try/catch`.

**Verifikation — zwei Greps und eine Kontowechsel-Runde.**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack
grep -n "setDoc\|updateDoc\|addDoc\|deleteDoc" index.html | grep -i "profile\|coach\|persona\|report\|notify"
grep -n "firestore\|setDoc\|firebase" js/coach-*.js
```

Erwartung: erster Befehl **kein** Treffer außerhalb von `_pushSocialProfile()` und dem bestehenden Dossier-Push; zweiter Befehl **leer**. Jeder weitere Treffer ist ein neuer Schreibpfad und muss weg.

| Schritt | Erwartung | Fängt welchen Fehler |
| --- | --- | --- |
| Konto A: Coach „Nina", Ton „hart", Profil „Eng dabei", Training, Bericht | — | — |
| Abmelden, Konto B anmelden, Heute-Tab | Karte zeigt „Coach", **nicht** „Nina" | Persona nicht zurückgesetzt |
| Hub öffnen | Einrichtung startet | `preset` nicht auf `undefined` |
| Hub → „Woche" | leer, **nicht** die Zahlen von Konto A | Berichte nicht gelöscht |
| Konsole | `S.coachSession` und `S.coachPush` sind `null` | dito |
| `getPending()` | keine Termine 47000–47999 | Notifications überleben den Kontowechsel |
| zurück auf Konto A | Persona kommt per Cloud-Sync zurück („Nina", „hart"); lokale Felder bleiben leer | Sync gebrochen — die lokalen Felder sind bewusst nicht synchronisiert |

Commit: `fix(coach): Coach-Zustand beim Kontowechsel vollstaendig zuruecksetzen`

---

## Blockabschluss 5

Ritual durchlaufen. Changelog-Key: `cl-2026-07-29-coach-wochenbericht`.

```js
  'cl-2026-07-29-coach-wochenbericht': {
    label: '29.07.2026 · Jeden Sonntag: deine Woche',
    items: [
      'Sonntagabend fasst dein Coach die Woche zusammen — Volumen, Sätze, Einheiten, Bestwerte und der Vergleich zur Vorwoche',
      'Auf dem Sperrbildschirm steht die echte Zusammenfassung, nicht nur ein Hinweis',
      'Bei stabilem Fortschritt siehst du, wann du dein Ziel erreichst — mit ehrlicher Einschränkung, nie als Versprechen',
      'Die letzten acht Wochen bleiben im Coach-Menü nachlesbar',
      'Die Uhrzeit kannst du selbst festlegen',
    ]
  },
```

**Abschlussprüfung des gesamten Vorhabens** — nach Blockabschluss 5, vor der Übergabe:

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && npm test 2>&1 | tail -5
```

---

## Kostenmodell — korrigiert gegenüber v1

**v1 rechnete mit 0,30 $ je Nutzer und Monat, davon 0,30 $ von 2,75 $ Netto-Erlös, und setzte für den Antwort-Cache eine spürbare Ersparnis an. Diese Ersparnis ist so nicht eingetreten.**

Der Cache aus Task 2 ist bei der Umsetzung deutlich enger geworden, als v1 gerechnet hat, und zwar aus drei Gründen, die alle richtig sind:

1. **Nur der erste Turn eines Chats ist cachefähig.** Alles ab Turn 2 hängt an der Gesprächshistorie und darf nicht unter einem Schlüssel abgelegt werden, der sie nicht kennt. In einem Chat mit fünf Nachrichten ist also höchstens eine cachefähig.
2. **Der Klassifikator ist deutlich strenger geworden.** Zusätzlich zu Possessiv- und Zeitbezug schlagen jetzt Ich-plus-Modalverb, Körper- und Verletzungsbegriffe sowie alle Plan-Wortstämme an. Das war nötig — die v1-Fassung stufte 44 von 47 personenbezogenen Fragen fälschlich als cachebar ein — kostet aber Trefferquote.
3. **Cachefähige Anfragen laufen mit einem entkernten Prompt.** Ohne Dossier, ohne Sessions, ohne Übungsnamen. Das senkt zwar die Kosten *dieser* Anfrage zusätzlich, heißt aber auch: die Anfrage, die gecacht wird, war ohnehin die billigste. Die teuren, kontextreichen Anfragen sind genau die, die nie in den Cache kommen.

**Ehrliche Einordnung: Die Cache-Ersparnis ist ein Bonus, kein tragender Posten der Rechnung.** Wie groß sie ist, weiß niemand vor dem Betrieb — sie hängt davon ab, wie viele Nutzer wie oft eine sachliche Erstfrage stellen, die ein anderer schon gestellt hat. **Der Plan setzt sie mit „unbekannt, vermutlich klein" an und nicht mit einer Zahl.**

Was dagegen belastbar ist:

| Posten | Wert | Grundlage |
| --- | --- | --- |
| Netto-Erlös je Monatsabo | ≈ 2,75 $ | 2,99 € − 15 % Apple = 2,54 € |
| `USD_PER_USER` | 0,30 $ | 11 % des Netto-Erlöses |
| Ein Nutzer, der seine 150 Anfragen komplett ausreizt | ≈ 0,22 $ | Modellpreis × durchschnittliche Prompt-Größe |
| Deckel-Sockel `MIN_MONTHLY_USD` | 25 $ | entspricht dem alten festen Deckel; Break-even bei ~84 Köpfen |
| Block 3 | 0 $ | vollständig algorithmisch |
| Block 5 | ≈ 0,0017 $ je Woche und Nutzer | ein Aufruf, drei Sätze |

**Der tragende Kostenhebel ist der Router (Tasks 3 und 4), nicht der Cache.** Jede Frage, die lokal beantwortet wird, kostet garantiert nichts — unabhängig davon, ob ein anderer Nutzer sie schon gestellt hat.

**Nach zwei Wochen Betrieb ablesen, nicht behaupten:**

```bash
curl -s "https://gymtrack-ai.wolterlenny362.workers.dev/admin-stats?idToken=<FOUNDER_ID_TOKEN>" | head -c 800
```

Abzulesen: `premiumHeads`, `budgetUsd`, die tatsächlichen Kosten des Monats. Liegen die Kosten je Nutzer über 0,30 $, greift **zuerst der Router-Ausbau** (mehr Fragen lokal), dann die Cache-TTL — nicht das Modell wechseln.

---

## Was NICHT Teil dieses Plans ist

Jeweils eigene Spec, falls sie später kommen:

- ~~Vorschläge zur Änderung des Trainingsplans~~ — **2026-07-29 vom Nutzer wieder hineingeholt.** Siehe „Block 6 — Änderungsvorschläge am Trainingsplan" unten. Die frühere Streichung ist aufgehoben.
- HealthKit-gestützte Erholung (Schlaf, HRV)
- Formcheck per Videoaufnahme
- Ausbau des Maschinen-Scanners (Sitzhöhe, Griffposition)
- Coach-Zeile in Live Activity und Widget
- Wake-Word oder dauerhaftes Mithören
- Server-Cron mit Service-Account — nur, falls sich die Geräte-Variante im Betrieb als unzureichend erweist

---

## Übersicht: 22 Tasks in 6 Blöcken

| Block | Tasks | Neue Dateien | Neue Tests | Kosten |
| --- | --- | --- | --- | --- |
| 0 Kosten-Fundament | 1–5 (1 und 2 **erledigt**) | `coach-cache.js` ✓ | 14 gebaut, ~17 offen | senkt |
| 1 Persona + Hub + Einrichtung | 6–10 | `coach-persona.js` | ~15 | 0 |
| 2 Stimme | 11–12 | `coach-voice.js`, `TtsPlugin.swift` | ~11 | 0 |
| 3 Tiefe im Training | 13–17 | `coach-session.js`, `coach-warmup.js`, `coach-cues.js`, `coach-rpe.js`, `coach-analyze.js` | ~52 | **0** |
| 4 Proaktive Meldungen | 18–19 | `coach-notify.js` | ~18 | 0 |
| 5 Wochenbericht + Datentrennung | 20–22 | `coach-report.js` | ~17 | ~0,007 $/Monat |

Stand bei Planerstellung: **92 Tests grün** (Ausgangsstand vor Block 0 waren 78). Zielstand: rund 220.

**Die wichtigste Zahl im ganzen Plan** steht in Block 3: die Obergrenze von vier beziehungsweise acht Äußerungen je Trainingseinheit. Zwölf Trigger sind gebaut, höchstens acht kommen durch. Ein Coach, der alles sagt, was er weiß, wird abgeschaltet.

**Die zweitwichtigste Erkenntnis** steht in diesem Plan an fünf Stellen: `save()` gibt es in dieser Codebasis nicht. Sie heißt `persist()`. Jeder `save()`-Aufruf scheitert still in einem `try/catch` und der Zustand geht verloren.

---

# Block 6 — Änderungsvorschläge am Trainingsplan

**Nachträglich aufgenommen am 2026-07-29 auf ausdrücklichen Wunsch des Nutzers.** Dieser Block stand vorher unter „Was NICHT Teil dieses Plans ist" und war vom Nutzer selbst gestrichen worden. Die Streichung ist aufgehoben.

**SPEC STEHT NOCH AUS.** Dieser Abschnitt ist eine Absichtserklärung mit offenen Fragen, keine ausführbare Task-Liste. Er wird vor der Umsetzung zu einer Spec ausgearbeitet — nach dem Muster von `docs/superpowers/specs/2026-07-28-live-coach-design.md`. Ein Agent, der hier ohne Spec anfängt, erfindet die Hälfte.

**Absicht.** Der Coach beobachtet ohnehin schon, was stagniert (Block 3 liefert die Plateau-Diagnose) und wie sich das Volumen über die Muskelgruppen verteilt. Heute darf er das nur *beschreiben*. Nach diesem Block darf er einen konkreten Änderungsvorschlag am Trainingsplan machen — und der Nutzer nimmt ihn mit einem Tippen an oder verwirft ihn.

**Was schon da ist und wiederverwendet wird, statt es neu zu bauen:**

- Der KI-Plan-Import über den ` ```gtplan `-Block und `aicApplyPlan()` in `index.html` — ein vom Modell erzeugter Plan lässt sich bereits übernehmen. Suchmuster: `aicApplyPlan`.
- `S.weekPlan` (Tagesbelegung), `S.workoutPresets` (`[{id,name,exIds}]`) und `S.customSplits` als Ziel jeder Änderung.
- Die Plateau-Diagnose aus Task 16 (`js/coach-analyze.js`) als Auslöser.
- Der Wochenbericht aus Block 5 als naheliegender Ort, an dem ein Vorschlag erscheinen kann.

**Offene Fragen, die die Spec beantworten muss** — jede davon ändert den Zuschnitt erheblich:

1. **Auslöser:** Meldet der Coach sich von selbst (und wenn ja, wie selten?), oder nur auf die Frage „was soll ich ändern?"? Gestaltungsregel 3 und 4 aus diesem Plan gelten weiter — im Training hat er höchstens vier bis acht Äußerungen, und ein Planvorschlag mitten in der Einheit widerspricht Regel 2 („im Training steht das Training vorn").
2. **Eingriffstiefe:** Nur Übungen tauschen? Sätze und Wiederholungen anpassen? Trainingstage verschieben? Einen kompletten Plan ersetzen? Je tiefer, desto größer der Schaden bei einem schlechten Vorschlag.
3. **Umkehrbarkeit:** Ein angenommener Vorschlag muss rückgängig zu machen sein. Ohne Sicherung des vorherigen Plans ist die Funktion nicht auslieferbar — der Nutzer verliert sonst eine über Monate gewachsene Struktur mit einem Fehltipp.
4. **Rechnen oder fragen?** Algorithmisch (kostenlos, erklärbar, engstirnig) oder über das Modell (flexibel, kostet, kann halluzinieren)? Der Plan hält für Block 3 fest, dass Tiefe im Training vollständig algorithmisch ist; für Planvorschläge ist das nicht ausgemacht.
5. **Begründungspflicht:** Ein Vorschlag ohne Zahl ist wertlos (Gestaltungsregel 8). Woher kommt die Zahl — Plateau-Dauer, Volumenverteilung, Frequenz, verpasste Tage?
6. **Verhältnis zu den bestehenden Sicherungen:** Der Intent-Router blockt heute jede planende Frage bewusst (`BLOCK` enthält `plan`) und schickt sie ans Modell. Ein lokaler Planvorschlag muss sich in diese Ordnung einfügen, ohne die Sicherung aufzuweichen — die Erfahrung aus Block 0 ist eindeutig: jede Ausnahme an dieser Sicherung hat mehrere Reviewrunden gekostet.

**Reihenfolge.** Dieser Block läuft **nach** Block 5. Er braucht die Plateau-Diagnose (Block 3) und den Wochenbericht (Block 5) als Träger; vorher gezogen, müsste er sich seine Auslöser selbst bauen.
