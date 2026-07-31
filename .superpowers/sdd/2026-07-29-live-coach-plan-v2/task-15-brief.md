### Task 15: Satz-Rückfrage — leicht / passend / schwer

**Absicht.** Die Stelle, an der der Coach zum ersten Mal **fragt**, statt nur zu sagen. Nach dem Abhaken eines Satzes erscheinen drei Chips; die Antwort steuert den nächsten Gewichtsvorschlag derselben Übung und wandert als Trend ins Dossier. Das ist RPE-Erfassung ohne Tipparbeit — und wer nicht antwortet, verliert nichts.

**Schnittstelle.**

| Funktion | Eingabe | Rückgabe |
| --- | --- | --- |
| `CoachRpe.toRpe(answer)` | `'leicht'\|'passend'\|'schwer'` (+ EN `easy`/`ok`/`hard`) | `6` / `8` / `9.5`, sonst `null` |
| `CoachRpe.adjustNext(kg, answer, step)` | | nächstes Gewicht |
| `CoachRpe.summarize(answers)` | `string[]` | `{easy, ok, hard, trend:'easy'\|'ok'\|'hard'}` |

**Die Werte sind bewusst grob** — 6 / 8 / 9,5 statt einer Zehnerskala, die niemand ehrlich ausfüllt.

**`adjustNext`-Regel:** genau **eine** Schrittweite rauf (`leicht`) oder runter (`schwer`), `passend` und unbekannt lassen stehen. Ergebnis bleibt ein Vielfaches der Schrittweite und fällt nie unter eine Schrittweite. Größere Sprünge wären aus einer einzelnen Gefühlsangabe nicht gedeckt — dafür gibt es die Double Progression und den Check-in.

**`summarize`-Trend:** `'hard'`, wenn `hard > easy` **und** `hard >= 2`; `'easy'` spiegelbildlich; sonst `'ok'`. Die Zwei-Schwelle verhindert, dass eine einzelne Antwort einen Trend behauptet.

**UI-Verhalten.** Die Chips erscheinen **unter** der Coach-Leiste, innerhalb derselben Fläche — keine neue Fläche (Gestaltungsregel 2), nichts Modales. Über den Chips steht `_say('setAsk')`. **Nach 8 Sekunden verschwinden sie unbeantwortet** (Gestaltungsregel 5). Eine Antwort erzeugt eine kurze Quittung (`setAckEasy` / `setAckHard`) mit dem neuen Gewicht, damit die Antwort nicht ins Leere geht. Neue Chip-Reihe entfernt zuerst die alte.

**Berührte Stellen.**

- Create `js/coach-rpe.js`, `test/coach-rpe.test.js`.
- `index.html`: Styles neben den bestehenden Coach-Bar-Regeln (`.cb-ask3`).
- Auslöser: `grep -n "function toggleSetDone" index.html`, im Zweig „Satz wurde als erledigt markiert", in `try/catch` — **ein Fehler hier darf nie das Abhaken kosten**.
- Trend ins Dossier: `grep -n "function finishWk" index.html`, nach dem Speichern, erst ab drei Antworten.
- Anbindung an die Progression: `grep -n "function _ciAdjustW" index.html`.

**Fallstricke.**

- `_rpeStoreOnLastSet(exId, rpe)` und `_rpeSuggestNext(exId, kg)` **existieren nicht** und werden gegen die echte Satz-Log-Datenstruktur gebaut, nicht erfunden. Vorher `toggleSetDone` und die Struktur der Logs lesen.
- Der Dossier-Trend läuft über den **bestehenden** Schreibweg (`_dossierSet` / `_dossier()`), **kein** neuer Firestore-Zugriff.
- Ist die Schrittweite an der Aufrufstelle nicht verfügbar, `2.5` als Vorgabe verwenden und im Kommentar festhalten, warum.
- `haptic()` existiert bereits — nicht neu schreiben.

**Testfälle** (`test/coach-rpe.test.js`):

| Eingabe | Erwartete Ausgabe | Fängt welchen Fehler |
| --- | --- | --- |
| `toRpe('leicht'/'passend'/'schwer')` | `6` / `8` / `9.5` | Zuordnung vertauscht |
| `toRpe('quatsch')` / `toRpe(null)` | `null` | stiller Default |
| `adjustNext(60,'schwer',2.5)` | `57.5` | Richtung vertauscht — **exakter Wert**, nicht nur `< 60` |
| `adjustNext(60,'leicht',2.5)` | `62.5` | dito |
| `adjustNext(60,'passend',2.5)` | `60` | Rauschen im Vorschlag |
| `adjustNext(80, a, step)` für `a∈{leicht,schwer}`, `step∈{1.25,2.5,5}` | `|Δ| === step` (nicht nur `<= step` und nicht `0`) | Sprung über eine Stufe / gar keine Bewegung |
| `adjustNext(62.5,'leicht'/'schwer',2.5) % 2.5` | `0` | krumme Gewichte |
| `adjustNext(2.5,'schwer',2.5)` | `>= 2.5` | Gewicht fällt auf 0 oder negativ |
| `adjustNext(60,'weissnicht',2.5)` | `60` | unbekannte Antwort bewegt etwas |
| `summarize(['schwer','schwer','schwer'])` | `{easy:0,ok:0,hard:3,trend:'hard'}` | — |
| `summarize(['leicht','leicht','passend'])` | `{easy:2,ok:1,hard:0,trend:'easy'}` | — |
| `summarize(['leicht','schwer','passend'])` | `{easy:1,ok:1,hard:1,trend:'ok'}` | Trend bei Gleichstand behauptet |
| `summarize(['schwer'])` | `trend:'ok'` | Zwei-Schwelle fehlt ⇒ eine Antwort macht einen Trend |
| `summarize([])` | `{easy:0,ok:0,hard:0,trend:'ok'}` | wirft |

**Verifikation.**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-rpe.test.js
~/.claude/sim-native.sh gymtrack "iPhone 17"
```

Simulator-Prüfliste:

| Schritt | Erwartung | Fängt welchen Fehler |
| --- | --- | --- |
| Satz abhaken | drei Chips **in** der Coach-Leiste, kein Overlay | Gestaltungsregel 2 |
| 8 Sekunden warten, nichts antippen | Chips verschwinden, Training läuft unverändert | Gestaltungsregel 5 |
| „schwer" antippen | Quittung; nächster Vorschlag derselben Übung eine Stufe **niedriger** | `_rpeSuggestNext` nicht verdrahtet |
| „leicht" antippen | eine Stufe **höher** | dito |
| „Satz-Rückfrage" ausschalten | keine Chips mehr | Schalter wirkungslos |
| Während die Chips stehen, weiter Sätze abhaken | **nichts blockiert** | modale Falle |

`xcrun simctl io "iPhone 17" screenshot /tmp/gymtrack-rpe.png`

Commit: `feat(coach): Satz-Rueckfrage leicht/passend/schwer steuert den naechsten Vorschlag`

---

