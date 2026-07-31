# Coach-Hub und Heute-Karte — Design

**Datum:** 2026-07-31
**Status:** vom Nutzer abgenommen (Entwurf im Gespräch bestätigt)
**Vorgänger:** `2026-07-28-live-coach-design.md` (Absichtsquelle des Live-Coach), Umsetzung in `../plans/2026-07-29-live-coach-plan-v2.md`

---

## Ziel

Der Coach hat seit Block 1 ein Zuhause: das Blatt `ov-coach-hub` hinter der Karte im Heute-Tab. Es funktioniert, aber es sieht aus wie eine Einstellungsseite — vier Reiter, zehn schlichte `.ch-*`-Klassen, kein Bild, keine Bewegung. Für die Funktion, die das Abo trägt, ist das zu wenig.

Nach diesem Vorhaben ist der Hub **ein Blatt mit fünf Kacheln**, die an Ort und Stelle aufklappen; die Wochenkachel trägt echte Diagramme; der Ton wird über einen Regler mit vier Rastpunkten gewählt, dessen Beispielsatz beim Ziehen mitwechselt. Die Karte im Heute-Tab bündelt drei Informationen statt einer und bleibt der einzige Zugang.

**Das Hochwertige kommt aus Bewegung, Dichte und echten Zahlen — nicht aus einer zweiten Designsprache.**

---

## Ausgangslage

| Was | Wo | Zustand |
| --- | --- | --- |
| Hub-Blatt | `ov-coach-hub`, `_CH_TABS = ['chat','journal','report','settings']` | vier Reiter als Segmented Control (`.ch-tabs`) |
| Kachel-Klassen | `.ch-fade`, `.ch-head`, `.ch-jrn`, `.ch-preset`, `.ch-row`, `.ch-sec`, `.ch-tab`, `.ch-tabs`, `.ch-voice` | rein funktional |
| Heute-Karte | `#coach-today-card`, Klassen `.aic-*` | ein Erholungsring, Kopfzeile, Unterzeile, Chips, CTA |
| Blase unten rechts | `#ai-bubble` + Radialmenü | Geräte-Scanner, Planoptimierung, Chat |
| Zahlen für die Woche | `js/coach-report.js` (`weekNumbers`, `goalForecast`), Archiv in `S.coachReports` | vollständig, getestet |
| Ziel-Prognose | `CoachReport.goalForecast` | gebaut, getestet, **schlafend** — die App erfasst kein Kraftziel |
| Diagramm-Bibliothek | Chart.js, bereits geladen | vorhanden |

Zwei offene Befunde aus früheren Reviews, die dieses Vorhaben mit auflöst:

- **Gestaltungsregel 7 verletzt (geparkt seit Task 10):** `.ch-tabs` ist ein Segmented Control, das die App sonst nirgends hat, und steht im selben Blatt gegen `.pwz-chip`-Reihen für dieselbe Bedienabsicht. Mit dem Wegfall der Reiter verschwindet der Verstoß ersatzlos.
- **Regel 8, „Wochen in Folge":** die Zahl steht bereits im Heute-Tab (`renderStreak`) und in der `hwStreak`-Kachel. Sie fliegt aus dem Bericht.

---

## Entscheidungen und ihre Begründung

| Frage | Entscheidung | Warum |
| --- | --- | --- |
| Bekommt der Coach eine eigene Bildsprache? | **Nein.** Glas-Stil, `--acc`, `--acc-rgb` und die bestehenden Abstände bleiben. | Zwei Designsprachen in einer App lassen den Coach wie eine Fremd-App wirken. Gestaltungsregel 7 bleibt in Kraft. |
| Wie fühlt sich ein Tipp auf eine Kachel an? | **Sie klappt an Ort und Stelle auf.** Kein Ebenenwechsel. | Der Nutzer wollte wörtlich „alles auf einem Beleg". Eine zweite Ebene widerspricht dem. |
| Welcher Zuschnitt? | **Fünf Kacheln:** Gespräch, Woche, Persönlichkeit, Umfang und Meldungen, Journal. | Jede Kachel beantwortet eine Frage, die der Nutzer wirklich stellt. Vier wäre eine überladene Einstellungskachel, sechs zwei dünne. |
| Was steht auf der Heute-Karte? | Erholung der nächsten Muskelgruppe, Woche gegen Vorwoche, was heute ansteht, ein Satz vom Coach. | Alle vier vom Nutzer gewählt. Jede Zahl außer der Tagesempfehlung ist sonst nirgends auf der Startseite zu sehen. |
| Wie heißt das Blatt? | **Der Coach-Name**, darunter klein „dein Coach". | „KI-Hub" wäre sachlich falsch: die KI-Werkzeuge wohnen in der Blase, hier wohnt der Trainingscoach. Und der vergebene Name aus Task 8 bliebe unsichtbar. |
| Wie wird der Ton gewählt? | **Ein Regler mit vier Rastpunkten**, Beispielsatz wechselt beim Ziehen live. | Der Ton hat im Modul genau vier Werte. Zwei Achsen als Kreuz würden eine Zwischenstufe suggerieren, die es nicht gibt. |
| Welche Diagramme? | Acht Wochen Volumen, Muskelverteilung, Bestwert-Verlauf mit Prognose, dazu Kennzahlen ohne Diagramm. | Alle vier vom Nutzer gewählt. Die Kennzahlen tragen die Kachel in den ersten Wochen, wenn für Verläufe nichts da ist. |

---

## Aufbau des Hubs

Der Sheet-Rahmen bleibt unverändert: `.ov > .sheet > .sh-handle + .sh-head`. Der Kopf trägt den Coach-Namen groß (per `textContent`, nie `innerHTML`), darunter klein „dein Coach" / „your coach".

`_CH_TABS` und `.ch-tabs` entfallen. An ihre Stelle tritt ein scrollbares Feld mit fünf Kacheln.

**Akkordeon-Verhalten**

- Genau **eine** Kachel ist offen. Ein Tipp auf eine geschlossene öffnet sie und schließt die vorige.
- Ein Tipp auf die offene schließt sie; dann ist keine offen. Das ist ein gültiger Zustand.
- Beim Öffnen wird die Kachel in Sicht gescrollt, falls ihr unterer Rand außerhalb liegt.
- Welche Kachel offen ist, lebt in einer Laufzeitvariablen (`_chOpen`) und wird beim Kontowechsel zurückgesetzt, genau wie `_chTab` heute.
- Geschlossene Kacheln zeigen **Titel plus genau eine Kennzahl**, damit das zugeklappte Blatt etwas sagt:

| Kachel | Kennzahl im geschlossenen Zustand |
| --- | --- |
| Gespräch | Anzahl Nachrichten im Verlauf, oder „noch kein Gespräch" |
| Woche | Volumen der laufenden Woche mit Pfeil zur Vorwoche |
| Persönlichkeit | Name und Ton, z. B. „Nina · fordernd" |
| Umfang und Meldungen | das gewählte Profil, z. B. „Ausgewogen" |
| Journal | Anzahl Einträge, oder „noch nichts notiert" |

---

## Die fünf Kacheln

### 1. Gespräch

Zeigt den letzten Wortwechsel gekürzt. Ein Tipp öffnet den bestehenden Chat (`ov-ai-chat`).

**Der Chat zieht nicht um.** Ein Umzug würde `aicSend()`, das Diktat und den Verlauf anfassen, ohne dass der Nutzer etwas davon hätte.

Die Vorschau rendert den Text mit `esc()`, nicht mit `_aicMd()` — im Hub steht eine Vorschau, keine zweite Chatfläche. Der offene Ledger-Punkt „Markdown roh in der Vorschau" wird damit zur bewussten Entscheidung; wer ihn später ändert, muss den XSS-Riegel an dieser Stelle mitdenken.

### 2. Woche

Vier Bereiche, von oben nach unten:

1. **Kennzahlen** — Einheiten, Sätze, Volumen als große Ziffern, jede mit Pfeil und Prozent zur Vorwoche. Diese Zeile steht immer, auch ohne Verlauf.
2. **Acht Wochen Volumen** als Balken. Die laufende Woche hebt sich über `--acc` ab. Beim Aufklappen wachsen die Balken von unten hoch, je Balken 30 ms versetzt.
3. **Muskelverteilung dieser Woche** als liegende Balken je Gruppe. **Pflicht:** ein Hinweis, dass Sätze ohne zugeordnete Muskelgruppe fehlen — die Summe kann unter dem Gesamtvolumen liegen, und eine unvollständige Aufteilung, die vollständig aussieht, ist eine Lüge.
4. **Bestwert-Verlauf mit Prognose** — geschätztes Maximum einer Übung über die Wochen, dazu die Trendlinie bis zum Ziel. Erscheint **nur**, wenn ein Kraftziel gesetzt ist und `CoachReport.goalForecast` etwas liefert. Sonst steht dort eine Zeile „Ziel setzen".

**Das Kraftziel.** `ex.targetWeight` existiert im Datenmodell, wird an jeder Anlagestelle mit `0` beschrieben und von keiner Oberfläche gesetzt. Die Zeile „Ziel setzen" füllt genau dieses Feld. Kein neues Feld, kein neuer Schreibpfad — die schlafende Prognose wacht damit auf.

Genauer, damit es nicht zwei Lesarten gibt:

- **Welche Übung?** Vorgeschlagen wird die Übung mit den meisten Arbeitssätzen der letzten acht Wochen — die, an der der Nutzer erkennbar arbeitet. Er kann eine andere aus seinen Übungen wählen.
- **Was wird eingegeben?** Ein Zielgewicht in der Anzeigeeinheit des Nutzers, umgerechnet gespeichert (`dispToKg()`), Untergrenze das aktuelle geschätzte Maximum — ein Ziel unterhalb des schon Erreichten ist kein Ziel.
- **Wie viele?** Genau **eines** gleichzeitig ist sichtbar. `ex.targetWeight` liegt zwar je Übung vor, aber die Kachel zeigt einen Verlauf, nicht fünf. Setzt der Nutzer ein zweites, ersetzt es das angezeigte.
- **Wo wird es wieder los?** Dieselbe Zeile trägt im gesetzten Zustand „Ziel ändern" und eine Möglichkeit, es zu entfernen (`targetWeight = 0`). Dann verschwindet der Verlauf wieder und die Zeile steht wie zuvor da.

**Diagramme werden erst gezeichnet, wenn die Kachel offen ist**, und beim Schließen wieder zerstört. Vier Diagramme im Voraus zu rendern ist Rendergewicht ohne Gegenwert. Verwendet wird Chart.js, das die App bereits lädt — keine neue Abhängigkeit, keine zweite Diagrammsprache.

Ist zu wenig Verlauf für ein Diagramm da, entfällt der jeweilige Bereich **ganz**. Kein leerer Rahmen, keine Achse ohne Daten.

### 3. Persönlichkeit

- **Name:** Textfeld, `maxlength=20`.
- **Ton:** ein Regler mit vier Rastpunkten (`ruhig`, `sachlich`, `hart`, `locker`). Der Griff fährt weich zum nächsten Rastpunkt; zwischen den Punkten gibt es keinen Zustand.
- **Beispielsatz:** wechselt **während** des Ziehens mit, nicht erst beim Loslassen. Quelle ist `CoachPersona.say('greet', …, personaGet({tone:t}), lang)` mit echten Zahlen der letzten Einheit — keine erfundenen Werte.

Der Regler ist bedienbar per Zeigergeste **und** per Tastatur (Pfeiltasten, `role="slider"`, `aria-valuenow` und `aria-valuetext` mit dem Tonnamen).

### 4. Umfang und Meldungen

Die drei Profile als Karten, darunter ein zugeklapptes „Feinjustierung" mit den Einzelschaltern, dazu die Trainings-Erinnerung, der Berichtstermin und die Zeile „Mitteilungen erlauben".

Fachlich unverändert gegenüber heute — nur in die Kachel einsortiert.

### 5. Journal

Vier Gruppen (`goal`, `limits`, `prefs`, `works`), jeder Eintrag einzeln löschbar, Ablaufdatum mit angezeigt. **Jeder Eintrag ist Nutzertext ⇒ `esc()` zwingend**, auch das Datum. Ohne Konto steht dort der bestehende Hinweis, dass ein Konto fehlt.

---

## Bewegung

Verbindlich, weil „animiert" sonst beliebig ist:

| Was | Wie |
| --- | --- |
| Aufklappen | `grid-template-rows: 0fr → 1fr`, 260 ms, `cubic-bezier(.22,.61,.36,1)`. **Nicht** über `max-height` — das rastet bei unbekannter Inhaltshöhe. |
| Inhalt | blendet ein und hebt sich 8 px, je Element 40 ms versetzt, höchstens fünf Stufen |
| Balken | wachsen von unten, je Balken 30 ms versetzt, 320 ms |
| Ton-Regler | Griff folgt dem Finger sofort, rastet in 180 ms ein |
| Kennzahlen | Zahl zählt beim Öffnen in 400 ms auf den Wert hoch |
| Kachelrand | beim Öffnen kurzer Lichtstreifen wie bei der `.aic`-Karte (`flash`), einmal, nicht wiederholt |

`@media (prefers-reduced-motion: reduce)` schaltet **alle** Übergänge auf 0 ms und lässt Zahlen sofort stehen.

---

## Die Heute-Karte

Ein Rahmen, drei Zonen:

- **Links:** der Ring — aber jetzt die **Erholung der nächsten fälligen Muskelgruppe** statt eines allgemeinen Werts, mit dem Namen der Gruppe darunter. Quelle ist die bestehende Erholungsrechnung (`_ciReadiness`).
- **Rechts:** zwei Zeilen. Erstens Volumen der laufenden Woche mit Pfeil und Prozent zur Vorwoche. Zweitens, was heute ansteht.
- **Darunter:** ein Satz vom Coach im gewählten Ton, aus der Sprachfabrik.
- **CTA** „Training starten" bleibt.

Ein Tipp irgendwo außer auf den CTA öffnet den Hub; der `closest('button, a')`-Wächter bleibt, sonst verliert der Nutzer den Trainingsstart. Karte und Kopfbereich behalten ihre Tastatur- und Vorlesehilfe-Rolle.

**Es bleibt bei genau einer Karte im Heute-Tab.** Keine zweite Fläche, keine neue Kachel, kein fünfter Tab.

---

## Nicht Teil dieses Vorhabens

- **Die Blase unten rechts bleibt unverändert.** Geräte-Scanner, Planoptimierung und die übrigen KI-Werkzeuge wohnen dort. Der Hub ist ausschließlich der Trainingscoach.
- Der Chat zieht nicht um.
- Keine neuen Farben, keine zweite Diagrammbibliothek, kein neuer Firestore-Schreibpfad, keine Änderung an `firestore.rules`.
- Kein Änderungsvorschlag am Trainingsplan — das ist Block 6 und hat keine Spec.

---

## Bindende Regeln

Aus dem Live-Coach-Plan, hier unverändert gültig:

1. **Ein Einstieg im Heute-Tab, kein zweiter.** Verletzung heißt: nicht abnahmefähig.
2. Im Training genau eine Fläche (`#wk-coach-bar`) — dieses Vorhaben fasst den Trainingspfad nicht an.
7. **Kein eigenes Aussehen:** `--acc`, `--acc-rgb`, Glas-Tokens, bestehende Abstände.
8. **Schlicht heißt nicht dünn:** jede Zahl muss etwas sein, das der Nutzer sonst nicht sieht. Deshalb fliegt „Wochen in Folge" aus dem Bericht.

Dazu die Projektregeln: keine Emojis in der Oberfläche (Symbole nur über `ICO.<name>({s})`, `✕` ist Bestand); jeder freie Text durch `esc()` vor `innerHTML`, reiner Text per `textContent`; jeder neue nutzersichtbare String mit englischem Gegenpart, Einheit gehört an den Wert statt in den Satz; `persist()` statt `save()`; jeder Einstiegspunkt in `try/catch`.

---

## Risiken

| Risiko | Umgang |
| --- | --- |
| Akkordeon plus vier Diagramme in einem Blatt ist Rendergewicht | Diagramme erst beim Öffnen zeichnen, beim Schließen zerstören |
| `grid-template-rows`-Animation wird nicht auf jeder WebView-Fassung unterstützt | Rückfall: ohne Übergang sofort offen — funktional identisch |
| Die Kachel „Woche" ist in den ersten Wochen fast leer | Kennzahlen stehen immer; leere Bereiche entfallen ganz statt leer zu rahmen |
| Das Kraftziel ist eine neue Oberfläche in einem Vorhaben, das sonst nur umbaut | Bewusst kleinster Eingriff: ein bestehendes Feld bekommt eine Eingabe, sonst nichts |
| Der Ton-Regler suggeriert Stufenlosigkeit | Rastpunkte sind fühlbar, zwischen den Punkten existiert kein Zustand, `aria-valuetext` nennt den Tonnamen |

---

## Prüfbarkeit

Auf dem Windows-Rechner gibt es keinen iOS-Simulator; geprüft wird in Chromium über Puppeteer, nach dem Muster der bestehenden Prüfskripte. Jede Zusicherung braucht einen Test, der bei ihrem Wegfall **rot** wird:

- Genau eine Kachel ist offen; ein Tipp auf die offene schließt sie.
- Jede der fünf Kacheln zeigt geschlossen ihre Kennzahl.
- Die Diagramme entstehen erst beim Öffnen (Zahl der Chart-Instanzen vor und nach dem Tipp) und verschwinden beim Schließen.
- Ohne Verlauf entfällt der jeweilige Diagrammbereich, statt leer zu rahmen.
- Der Ton-Regler rastet auf vier Werten ein und schreibt `S.aiCoach.tone` als **String**; der Beispielsatz ändert sich zwischen allen vier.
- Der Regler ist per Pfeiltaste bedienbar.
- Ein Journal-Eintrag mit Markup erscheint als Text.
- Der Heute-Tab hat vorher und nachher gleich viele Flächen; genau eine `.aic`-Karte; die Tableiste hat fünf Knöpfe.
- Ein Tipp auf „Training starten" startet das Training und öffnet **nicht** den Hub.
- Bei `S.unitMode = 'lbs'` steht auf Karte und in der Wochenkachel keine kg-Zahl.
- `prefers-reduced-motion` schaltet die Übergänge ab.
- Kein `\p{Extended_Pictographic}` in der Oberfläche.

Zusätzlich gilt die Mutationsprobe als Nachweis: jede tragende Regel einzeln zerstören und belegen, dass genau die zuständigen Tests fallen. In den Blöcken 3, 4 und 5 hat diese Methode je einen Fehler aufgedeckt, den grüne Suiten nicht gesehen haben.
