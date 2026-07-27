# KI-Coach-Fundament: Gedächtnis, Aktions-Log, Intent-Router

**Datum:** 2026-07-27
**Status:** Design, wartet auf Umsetzungsplan
**Bausteine:** 1 (Coach-Dossier), 2 (Aktions-Log), 3 (Intent-Router)

## Ziel

Der KI-Coach soll sich anfühlen, als wäre er dauerhaft dabei — nicht wie ein
Chatfenster, das bei jeder Öffnung bei null anfängt. Dafür braucht er drei
Dinge, die es heute nicht gibt: ein Gedächtnis, Rückmeldung darüber, ob seine
Ratschläge funktioniert haben, und die Fähigkeit, einfache Fragen sofort und
ohne LLM zu beantworten.

Dieses Dokument beschreibt nur das Fundament. Voice-Chat, proaktive Push,
Wochen-Debrief, HealthKit-Erholung und Live Activity setzen darauf auf und
bekommen eigene Specs.

## Ausgangslage im Code

| Fläche | Stand |
| --- | --- |
| `/chat` | Freitext-Antwort, Kontext-Cap 12k Zeichen, Historie 30 Nachrichten in `localStorage` unter `gt_aiChat` |
| `/coach` | Live-Trigger im Satz (`jump`, `drop`, `repmax`, `fatigue`, `stall`), liefert `action` oder `options` |
| Tagesbriefing | `_coachTodaySuggestion()`, vollständig regelbasiert, keine LLM-Kosten |
| Kontext-Aufbau | `_aicContext()`, `index.html:23755` |
| Vorschlagskarte | `_coachAccept()` / `_coachDismiss()`, `index.html:23202` |
| Cloud-Backup | `users/{uid}`, feste Feld-Whitelist, `setDoc(..., { merge: false })`, `index.html:25248` |
| Kostendeckel | `MONTHLY_LIMIT` 50 Anfragen/Monat, Coach-Trigger zählen 0.5 |

Der Coach hat heute kein Gedächtnis über die letzten 30 Nachrichten hinaus,
erfährt nie, ob eine Empfehlung angenommen wurde, und schickt jede Frage an das
Modell — auch solche, die vollständig aus lokalen Daten beantwortbar wären.

## Architektur

Drei Einheiten ohne Kenntnis voneinander. Verdrahtet werden sie ausschließlich
in der Chat- und Live-Coach-Schicht.

| Einheit | Aufgabe | Schnittstelle |
| --- | --- | --- |
| `coachMemory` | Dossier laden, mergen, speichern | `dossierGet()`, `dossierApplyDelta(d)`, `dossierDerive()`, `dossierForPrompt()`, `dossierClear()` |
| `coachLog` | Vorschläge und deren Ausgang protokollieren | `logAction(e)`, `logOutcome(id, res)`, `logStats()`, `isMuted(kind)` |
| `coachIntent` | Lokale Antwort statt LLM-Aufruf | `resolveIntent(text)` liefert `{ answer }` oder `null` |

`coachMemory` kennt weder Log noch Router. `coachIntent` liest nur aus `S` und
schreibt nichts. `coachLog` schreibt ausschließlich lokal und liefert Aggregate
nach oben.

## Datenmodell

### Dossier

Eigenes Firestore-Dokument `users/{uid}/coach/dossier`. Subcollection, damit das
`merge: false` des Eltern-Dokuments es nicht überschreiben kann und die strenge
Whitelist dort unangetastet bleibt.

```json
{
  "v": 1,
  "goal": "Masse",
  "limits": [{ "t": "Linke Schulter empfindlich bei Ueberkopf", "ts": 1753600000000 }],
  "prefs":  [{ "t": "Trainiert meist abends", "ts": 1753600000000 }],
  "works":  [{ "t": "Dropsaetze bei Bizeps wirken", "ts": 1753600000000 }],
  "derived": { "stall": ["Bankdruecken"], "usualTime": "19:00" },
  "coachStats": { "accepted": 23, "ignored": 9, "muted": ["extraSet"] },
  "tone": "ruhig",
  "updatedAt": 1753600000000
}
```

Grenzen, clientseitig erzwungen:

- `limits`, `prefs`, `works`: je höchstens 8 Einträge à 120 Zeichen
- Gesamtes Dossier höchstens 4000 Zeichen
- `tone` nur aus einer festen Menge
- Unbekannte Schlüssel werden verworfen

Ohne diese Deckel frisst das Dossier den Kontextvorteil des Routers wieder auf.

### Verfall von Einschränkungen

Jeder Eintrag trägt einen Zeitstempel. Ist ein `limits`-Eintrag älter als 42
Tage, wird er als `stale` markiert. Der Coach fragt beim nächsten Öffnen des
Chats genau einmal nach, ob die Einschränkung noch gilt: bei Bestätigung wird
`ts` erneuert, bei Verneinung fliegt der Eintrag raus, ohne Antwort bleibt er
unverändert bestehen und wird frühestens nach weiteren 42 Tagen erneut
angefragt. Solange ein Eintrag `stale` ist, gilt er weiter — im Zweifel wird
die Einschränkung respektiert.

Ohne diesen Mechanismus blockiert eine einmal erwähnte Schulterbeschwerde
dauerhaft alle Überkopfübungen — das Dossier würde verknöchern statt zu lernen.

### Aktions-Log

Rein lokal in `S.coachLog`, Ringpuffer über 50 Einträge:

```json
{ "ts": 1753600000000, "kind": "dropSet", "exId": "ex_123", "accepted": true, "outcomeW": 2.5 }
```

Nur die Aggregate wandern ins Dossier (`coachStats`). Der Worker braucht für den
Ton einer Nachricht keine Einzelzeilen.

### Drosselung

Zähler laufen je Aktionstyp getrennt. Wird derselbe `kind` fünfmal
hintereinander ignoriert, ohne dass er zwischendurch angenommen wurde, landet er
in `coachStats.muted`. Der Live-Coach schlägt ihn dann nicht mehr vor. Eine
spätere Annahme desselben Typs — etwa über einen `options`-Vorschlag — hebt die
Drosselung wieder auf und setzt den Zähler zurück.

Rein lokale Auswertung, keine Kosten, und für den Nutzer der erste spürbare
Beleg, dass der Coach zuhört.

## Datenschutz und Datentrennung

Diese Regeln sind bindend. Das Dossier enthält Angaben zu Verletzungen, also
Gesundheitsdaten.

1. **Firestore-Rule ohne Founder-Ausnahme.** Das Eltern-Dokument `users/{uid}`
   erlaubt der Founder-UID Lesezugriff auf jeden Nutzer (`firestore.rules:5`).
   Für das Dossier wird das nicht übernommen. Neue Rule, streng auf den
   Eigentümer beschränkt, mit Feld-Whitelist und Größenlimit. Rules kaskadieren
   nicht, die Subcollection braucht daher einen eigenen `match`-Block.

2. **Kein Dossier in `S`.** Abmelden lässt lokale Daten bewusst stehen
   (`index.html:26389`). Genau diese Fehlerklasse ist in diesem Projekt schon
   einmal aufgetreten: der Kommentar in `doSignOut()` beschreibt, wie der nächste
   Account auf demselben Gerät fälschlich Push-Nachrichten des vorigen Kontos
   erhielt. Ein Dossier in `S` hätte dasselbe Problem, nur mit
   Gesundheitsangaben. Speicher deshalb unter `gt_coachDossier:{uid}`, bei
   abweichender uid wird nicht geladen, und `dossierClear()` läuft bei
   Abmeldung und Kontowechsel.

3. **uid ausschließlich aus der Token-Prüfung.** `verifyFirebaseToken()`
   (`ai-worker/worker.js:781`) ermittelt die uid über Googles `accounts:lookup`,
   also aus Googles Antwort statt aus dem Request-Body — nicht fälschbar. Sobald
   der Worker in Baustein 5 selbst Dossiers liest, gilt: nur für die so
   verifizierte uid, niemals für eine uid aus dem Body.

4. **Kein Schreibpfad nach `profiles/`.** Dieses Dokument ist für jeden
   angemeldeten Nutzer lesbar (`firestore.rules:26`). `coachMemory` darf dorthin
   nicht schreiben. Ein Test sichert das ab.

5. **Keine Dossier-Inhalte in Logs.** Weder im Worker noch in der App. Erlaubt
   sind Metadaten wie Eintragszahl und Länge.

6. **Löschung.** `_runAccountDeletion()` (`index.html:26413`) löscht heute nur
   `userDocRef`. Firestore löscht Subcollections nicht mit, das Dossier würde
   die Kontolöschung überleben. Es muss vor dem Eltern-Dokument explizit
   gelöscht werden.

7. **Nutrition Labels.** Der Eintrag zu Gesundheitsdaten in App Store Connect
   muss die Einschränkungen im Dossier abdecken. Erledigt vor dem nächsten
   Release, der dieses Feature enthält.

## Datenfluss

1. `_aicContext()` hängt `dossierForPrompt()` an den Kontext an.
2. `runChat` stellt das Dossier in den System-Prompt und weist das Modell an,
   dauerhaft Gelerntes zusätzlich als Codeblock auszugeben:

   ```gtmem
   { "add": { "limits": ["Linke Schulter empfindlich bei Ueberkopf"] }, "goal": "Masse" }
   ```

   Gleicher Mechanismus wie der bestehende `gtplan`-Block. Kosten entstehen nur
   in Form weniger Ausgabe-Token, und nur wenn es etwas zu merken gibt. Kein
   zusätzlicher Request.

   Das Modell liefert im Delta ausschließlich reine Zeichenketten. Der
   Zeitstempel wird clientseitig in `dossierApplyDelta()` gesetzt — ein vom
   Modell geliefertes `ts` wird ignoriert, damit kein Eintrag sich selbst in die
   Zukunft datieren und so den Verfall aushebeln kann.
3. `aicSend()` schneidet den Block aus der Antwort, bevor sie angezeigt wird
   (analog `index.html:23786`), und übergibt ihn an `dossierApplyDelta()`. Der
   Cloud-Push läuft entprellt.
4. `runCoach` erhält `limits` und `muted`: keine Überkopfvorschläge bei
   gemeldeter Schulter, keine gedrosselten Aktionstypen. Beides reist im
   bestehenden `t`-Objekt des `/coach`-Requests mit, die App liest es vorher aus
   `dossierGet()` und `logStats()`. Der Worker holt in diesem Baustein nichts
   selbst aus Firestore — serverseitiger Dossier-Zugriff kommt erst mit
   Baustein 5 und braucht dann ein Service-Account.

   Zusätzlich filtert die App gedrosselte Typen ein zweites Mal aus der Antwort.
   Das Modell ist eine Empfehlung, keine Autorität: hält es sich nicht an
   `muted`, greift der lokale Filter.
5. `_coachAccept()` und `_coachDismiss()` rufen `logAction()`. Taucht dieselbe
   Übung in einer späteren Session wieder auf, ergänzt `logOutcome()` das
   Ergebnis.
6. `aicSend()` ruft vor jedem Netzaufruf `resolveIntent()`. Bei einem Treffer
   wird die Antwort lokal erzeugt und `aiCall` entfällt.

Lokal beantwortete Fragen werden wie normale Nachrichten in `_aicHist`
abgelegt. Andernfalls fehlt dem Modell beim nächsten echten Aufruf der
Gesprächsverlauf und es wiederholt sich.

## Intent-Router

Mustererkennung mit Konfidenzschwelle, Deutsch und Englisch. Kein Modell im
Bundle. Ein Treffer erfordert zusätzlich eine real existierende Entität, etwa
einen Übungsnamen aus `S.exercises`. Darunter geht die Frage an `/chat`.

Abgedeckte Fragen, alle aus lokalen Daten beantwortbar:

1. Vorschlag für die aktuelle Übung
2. Bestleistung bei einer Übung
3. Verbleibende Sätze
4. Restliche Pausenzeit
5. Erholungsgrad einer Muskelgruppe
6. Letzte Ausführung einer Übung
7. Wochenvolumen
8. Was heute ansteht (Tagesbriefing)

Das sind die Fragen, die im Gym gestellt werden, also genau die, die später per
Sprache kommen. Ein Treffer kostet nichts und antwortet ohne Latenz.

## Fehlerfälle

| Fall | Verhalten |
| --- | --- |
| Dossier nicht lesbar (offline, Rules) | leeres Dossier, Coach arbeitet wie heute, nie blockieren |
| `gtmem` mit kaputtem JSON | still verwerfen, wie `gtplan` es heute handhabt |
| Modell liefert unerwartete Schlüssel oder Überlängen | clientseitige Whitelist und Caps greifen, dem Modell wird nicht vertraut |
| Router trifft falsch | Treffer nur bei eindeutigem Muster mit existierender Entität, sonst LLM |
| Cloud-Push scheitert | lokal bleibt gültig, nächster Versuch beim nächsten Delta |
| uid wechselt | Dossier wird nicht geladen, lokaler Eintrag des Vorgängers bleibt unangetastet |

## Tests

- `dossierApplyDelta`: Caps greifen, Duplikate werden zusammengeführt, unbekannte
  Schlüssel verworfen, `v`-Migration bei altem oder fehlendem Feld
- Verfall: Eintrag älter als 42 Tage wird zur Nachfrage markiert
- `logStats`: Drosselung nach fünf Ignorierungen, Ringpuffer läuft sauber über
- `resolveIntent`: Tabelle Frage zu erwarteter Antwort, Deutsch und Englisch,
  einschließlich Fällen, die bewusst nicht matchen dürfen
- Datentrennung: kein Schreibpfad nach `profiles/`, `dossierClear()` bei
  Abmeldung, kein Laden bei abweichender uid
- Löschung: Kontolöschung entfernt das Dossier-Dokument

## Kosten

Das Dossier ergänzt rund 600 Eingabe-Token pro Chat-Aufruf. Mit den im Worker
hinterlegten Preisen (`PRICE_IN_PER_M` 0.30, `PRICE_OUT_PER_M` 2.50) steigt ein
Aufruf von etwa 0.001275 auf 0.001455 USD, also um rund 14 Prozent.

Der Router muss das über eingesparte Aufrufe hereinholen. Break-even liegt bei
etwa 13 Prozent abgefangener Chat-Anfragen. Bei den acht abgedeckten Fragen ist
mehr zu erwarten, garantiert ist es nicht.

Zusätzliche Requests entstehen keine. Das Monatslimit von 50 bleibt unberührt.

Hinweis aus dem Worker-Kopfkommentar: die Preis-Defaults gehören zu einem
größeren Modell als dem eingesetzten Lite-Modell. Die realen Kosten liegen
darunter, die obige Rechnung ist damit konservativ.

## Abgrenzung

Nicht Teil dieser Spec, jeweils eigene Spec:

- Voice-Chat samt TTS-Plugin
- Proaktive Push-Nachrichten und Wochen-Debrief
- HealthKit-gestützte Erholung
- Live Activity und Widget-Zeile des Coaches
- Wählbare Persona über `tone` hinaus
