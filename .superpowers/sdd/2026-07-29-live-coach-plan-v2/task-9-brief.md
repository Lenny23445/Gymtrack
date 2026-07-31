### Task 9: Coach-Hub

**Absicht.** Das Zuhause des Coaches. Nach dieser Task hat der Nutzer hinter der bestehenden Coach-Karte vier Bereiche: Chat, Journal („was ich über dich weiß", jeder Eintrag einzeln löschbar), Woche und Einstellungen. Das Journal ist das stärkste Vertrauenssignal des ganzen Vorhabens.

**Einstieg ist ausschließlich die bestehende `.aic`-Karte** — keine neue Fläche im Heute-Tab (Gestaltungsregel 1).

**Schnittstelle.**

| Funktion | Verhalten |
| --- | --- |
| `openCoachHub(tab)` | öffnet `ov-coach-hub`; ist der Nutzer Premium und `S.aiCoach.preset === undefined`, startet stattdessen die Einrichtung (Task 10) |
| `renderCoachHub()` | zeichnet den aktiven Bereich neu; **no-op**, wenn das Overlay nicht offen ist |
| `coachHubTab(name)` | `'chat'\|'journal'\|'report'\|'settings'` |
| `_dossierRemove(group, index)` | **neu** — entfernt einen Dossier-Eintrag, schreibt zurück, stößt den bestehenden gedrosselten Push an |

**Aufbau des Overlays.** Klassen und Struktur vom bestehenden `ov-ai-chat` übernehmen (Gestaltungsregel 7): `.ov > .sheet > .sh-handle + .sh-head + .ch-tabs + #ch-body`. Die vier Reiter-Beschriftungen werden in `renderCoachHub()` per `textContent` gesetzt, damit `tr()` greift — **nicht ins Markup schreiben**.

Neue CSS-Klassen (im Stil der bestehenden `.aic-*`-Regeln, Akzentfarbe über `--acc-rgb`): `.ch-tabs`, `.ch-tab`, `.ch-tab.on`, `.ch-sec`, `.ch-row`, `.ch-jrn`, `.ch-preset`.

**Die vier Bereiche.**

- **Chat.** Der bestehende Chat zieht **nicht** physisch um — das würde `aicSend()`, das Diktat und den Verlauf anfassen, ohne dass der Nutzer etwas davon hätte. Der Hub zeigt den letzten Wortwechsel gekürzt und verlinkt das bestehende Overlay.
- **Journal.** Vier Gruppen aus dem Dossier: `goal`, `limits`, `prefs`, `works`. Jeder Eintrag mit Löschknopf; `until`-Datum wird mitangezeigt. **Jeder Eintrag ist Nutzertext ⇒ `esc()` zwingend**, auch das Ablaufdatum.
- **Woche.** Bis Block 5 ein ehrlicher Platzhalter („Dein erster Wochenbericht kommt am Sonntag."), keine leere Fläche.
- **Einstellungen.** Name (Textfeld, `maxlength=20`), Ton, Umfangs-Profil, plus ein zugeklapptes `<details>` „Feinjustierung" mit den vier Einzelschaltern (`inTraining`, `setFeedback`, `pushLevel`, `insights`). Ist `preset === 'custom'`, erscheint eine vierte, deaktivierte Profilkarte „Angepasst".

**Die Ton-Auswahl zeigt denselben Satz in allen vier Tönen** — der Nutzer hört den Unterschied, statt vier Adjektive zu lesen. Das ist der Unterschied zwischen einer Einstellung und einer Entscheidung. Beispielsatz: `say('greet', {ex:'Bankdrücken', kg:60, reps:8, sets:3}, personaGet({tone:t}), lang)`.

**Berührte Stellen.**

- Markup direkt **vor** `grep -n 'id="ov-ai-chat"' index.html`.
- Styles neben den bestehenden `.aic-sugg`-Regeln.
- Tap-Ziel: `grep -n "function renderCoachTodayCard" index.html`.

**Fallstricke — verifiziert 2026-07-29.**

- **`CoachMemory.dossierGet` existiert nicht.** v1 ruft es auf. Die tatsächliche API ist `CoachMemory.dossierLoad(localStorage, uid)`, in `index.html` gekapselt als **`_dossier()`** (`grep -n "function _dossier("`), Gegenstück `_dossierSet(...)`. `_dossierRemove` wird darauf aufgebaut — **kein neuer Firestore-Zugriff**, der Schreibweg existiert bereits.
- **`openAiChat()` vor dem Verlinken prüfen:** `grep -n "ov-ai-chat'" index.html` und den echten Namen einsetzen.
- **Das Tap-Ziel auf der Karte darf den CTA nicht schlucken.** Die Karte trägt einen „Training starten"-Button. Ohne `if (ev.target.closest('button, a')) return;` verliert der Nutzer den Trainingsstart, den er bisher an dieser Stelle hatte. Klassenname der inneren Karte (`.aic`) und Existenz von `haptic()` vorher prüfen.
- `renderCoachHub()` muss früh zurückkehren, wenn das Overlay geschlossen ist — es wird aus `setAiCoachOpt` heraus aufgerufen, also auch aus Kontexten ohne Hub.

**Testfälle** (Simulator, Prüfliste — jeder Punkt fängt einen konkreten Fehler):

| Schritt | Erwartung | Fängt welchen Fehler |
| --- | --- | --- |
| Tipp auf die Coach-Karte | Hub öffnet sich | Handler nicht verdrahtet |
| Tipp auf „Training starten" in derselben Karte | Training startet, Hub öffnet **nicht** | `closest('button,a')`-Guard fehlt |
| Alle vier Reiter durchklicken | keiner ist leer | Platzhalter vergessen |
| Journal mit mindestens einem Dossier-Eintrag | Eintrag sichtbar, Löschknopf entfernt ihn dauerhaft (App-Neustart) | falsche Dossier-API / `persist()` fehlt |
| Dossier-Eintrag mit `<b>` im Text anlegen | erscheint als Text, nicht als Markup | `esc()` fehlt |
| Auf jeden der vier Töne tippen | Beispielsatz darunter ändert sich **sichtbar** | Töne doppeln sich |
| „Eng dabei" wählen, dann „Nachrichten" → „Still" | Profilanzeige wechselt auf „Angepasst" | `preset`-Logik aus Task 7 nicht angebunden |
| Heute-Tab ansehen | **keine** neue Karte, Zeile oder Kachel | Gestaltungsregel 1 verletzt ⇒ Block nicht abnahmefähig |

**Verifikation.** `xcrun simctl io "iPhone 17" screenshot /tmp/gymtrack-hub.png`

Commit: `feat(coach): Coach-Hub mit Chat, Journal, Woche und Einstellungen`

---

