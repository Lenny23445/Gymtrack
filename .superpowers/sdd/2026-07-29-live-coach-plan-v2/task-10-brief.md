### Task 10: Einrichtung beim Abo-Abschluss

**Absicht, in einem Satz:** **Ein Coach, der ungefragt redet, wird abgeschaltet und nie wieder eingeschaltet — ein Coach, dessen Umfang man beim Kauf selbst bestimmt hat, wird justiert statt gekündigt.**

**Schnittstelle.**

| Funktion | Verhalten |
| --- | --- |
| `openCoachSetup()` | startet bei Schritt 1 |
| `coachSetupStep(n)` | `1\|2\|3` |
| `coachSetupDone(skipped)` | setzt `preset` (falls noch offen: `'balanced'`), schließt; bei `skipped=false` öffnet danach den Hub auf „Einstellungen" |

**Die drei Schritte.**

1. **Name und Ton.** Textfeld (`maxlength=20`, Platzhalter „Coach") plus die vier Tonkarten mit Beispielsatz — dieselbe Darstellung wie im Hub.
2. **Stimme.** An/Aus-Schalter plus Erklärsatz: „Er spricht nur, wenn du ihn über den Sprech-Button fragst — nie von selbst." Die Stimmenliste kommt erst in Block 2; solange sie fehlt, zeigt der Schritt **nur** den Schalter — kein leerer Listenrahmen. Der Aufruf des späteren `_csRenderVoices(el)` steht schon hier, in `try/catch` und mit `typeof … === 'function'`-Prüfung.
3. **Umfang.** Die drei Profile mit je einem Beschreibungssatz. Vorbelegt ist **die mittlere, nicht die lauteste.**

**Wichtige Verhaltensdetails.**

- **Kein `onclick` auf dem Overlay-Hintergrund** — anders als bei allen übrigen Overlays. Ein versehentlicher Tipp daneben soll die Einrichtung nicht abbrechen. Das ✕ überspringt bewusst und sichtbar.
- **Auch beim Überspringen wird `preset` gesetzt** (`'balanced'`) — sonst fragt die App beim nächsten Hub-Öffnen wieder, und genau das nervt.
- Nach dem Kauf: **420 ms Verzögerung** nach dem Schließen der Paywall, bevor die Einrichtung erscheint. Zwei gleichzeitig laufende Overlay-Animationen sehen kaputt aus.
- **Kein Aufruf beim App-Start.** Bestandsnutzer holen die Einrichtung beim ersten Öffnen des Hubs nach (Task 9) — eine Unterbrechung ohne Anlass wäre genau der Fehler, den diese Task verhindern soll.

**Berührte Stellen.**

- Markup direkt nach `ov-coach-hub`.
- Kaufpfad: `grep -n "async function premBuy" index.html`, Erfolgszweig — dort, wo die Paywall nach kurzer Verzögerung geschlossen wird.

**Fallstricke.**

- `save()` existiert nicht → `persist()` (siehe Task 7).
- `S.aiCoach.preset === undefined` ist die Bedingung, **nicht** `!S.aiCoach.preset` — `'custom'` und `'quiet'` sind gültige Werte, die keine erneute Einrichtung auslösen dürfen.

**Testfälle** (Simulator; im Simulator läuft kein echter Kauf, deshalb über den Bestandsnutzer-Pfad `delete S.aiCoach.preset; persist(); openCoachHub();`):

| Schritt | Erwartung | Fängt welchen Fehler |
| --- | --- | --- |
| Hub öffnen bei fehlendem `preset` | Einrichtung startet statt Hub | Weiche fehlt |
| Schritt 1: alle vier Töne antippen | Beispielsatz ändert sich jedes Mal | Persona wird nicht sofort geschrieben |
| Schritt 3: „Zurückhaltend", „Fertig" | `preset:'quiet'`, `inTraining:'off'`, `live:false`, `pushLevel:'still'` | Profil unvollständig angewandt |
| Hub erneut öffnen | Einrichtung startet **nicht** noch einmal | `preset` nicht gesetzt/nicht persistiert |
| Erneut zurücksetzen, sofort ✕ | `preset:'balanced'`, und beim nächsten Öffnen keine erneute Frage | Überspringen lässt `preset` offen |
| Nach jedem Schritt App neu starten | Werte überleben | `save()` statt `persist()` |

**Verifikation.** `xcrun simctl io "iPhone 17" screenshot /tmp/gymtrack-setup.png`

Commit: `feat(coach): Einrichtung beim Abo-Abschluss legt den Umfang fest`

---

## Blockabschluss 1

Ritual durchlaufen. Changelog-Key: `cl-2026-07-29-coach-persoenlich`.

```js
  'cl-2026-07-29-coach-persoenlich': {
    label: '29.07.2026 · Dein Coach bekommt einen Namen',
    items: [
      'Gib deinem Coach einen Namen und einen Ton — ruhig, sachlich, fordernd oder locker. Er redet ab sofort so mit dir',
      'Neu: das Coach-Menü. Ein Tipp auf die Coach-Karte auf der Startseite öffnet Chat, Journal, Wochenbericht und Einstellungen',
      'Im Journal siehst du zum ersten Mal, was der Coach über dich weiß — und kannst jeden einzelnen Eintrag löschen',
      'Beim Abschluss des Abos entscheidest du selbst, wie sehr sich der Coach einmischt: zurückhaltend, ausgewogen oder eng dabei',
    ]
  },
```

**Zusätzliche Prüfung, über das Ritual hinaus:** Der Heute-Tab muss vor und nach diesem Block **identisch aussehen**, bis auf das Wort auf der Coach-Karte. Kommt eine Fläche dazu, ist Gestaltungsregel 1 verletzt und der Block ist nicht abnahmefähig.

---
# Block 2 — Stimme

**Warum jetzt:** Die Sprachausgabe ist der Moment, in dem aus einer Textfläche eine Person wird. Sie braucht die Persona aus Block 1 (Name, Ton, Stimmwahl) und sie muss stehen, bevor Block 3 im Training Sätze produziert, die man sich vorlesen lassen können soll.

**Ergebnis:** Ein Sprech-Button im Training und im Chat. Drücken → Diktat → Antwort wird gesprochen **und** angezeigt. Der Coach schweigt, solange er nicht gefragt wird — ausnahmslos (Gestaltungsregel 6).

---

