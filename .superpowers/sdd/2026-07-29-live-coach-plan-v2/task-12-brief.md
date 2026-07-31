### Task 12: `coach-voice.js` und der Sprech-Button

**Absicht.** Der Nutzer drückt im Training einen Knopf, sagt seine Frage laut und bekommt die Antwort **gesprochen und angezeigt**. Ein reiner Sprachkanal wäre im Gym unbrauchbar — man will die Zahl auch sehen.

**Schnittstelle.**

| Funktion | Eingabe | Rückgabe |
| --- | --- | --- |
| `CoachVoice.available(caps)` | `{tts, stt, webTts, webStt}` | `{tts: boolean, stt: boolean}` — nativ **oder** Web zählt |
| `CoachVoice.pickVoice(voices, preferredId, lang)` | Liste `[{id, lang}]` | gewählte `id`, sonst erste passende Sprache, sonst `null` |
| `CoachVoice.speakable(text)` | Bildschirmtext | für Ohren aufbereiteter Text |
| in `index.html` | `coachSpeak(text)`, `coachStopSpeak()`, `coachAsk()` | — |

**`speakable` — die Ersetzungen sind die Anforderung:**

| von | nach | warum |
| --- | --- | --- |
| `**fett**` | `fett` | Markdown wird sonst mitgesprochen |
| Zeilenanfang `- ` / `• ` / `· ` | entfernt | „Punkt Punkt eins" |
| `×` | ` mal ` | wird sonst als „x" gelesen |
| `@` | ` bei ` | wird sonst als „at" gelesen |
| `kg` (Wortgrenze) | `Kilo` | „k g" |
| `Wdh` (Wortgrenze) | `Wiederholungen` | „wdh" |

Mehrfach-Leerzeichen zusammenziehen, trimmen. Normaler Text bleibt **unverändert** — auch der Schlusspunkt.

**Berührte Stellen.**

- Create `js/coach-voice.js`, `test/coach-voice.test.js`.
- Skript-Tag nach `coach-persona.js`.
- Sprech-Button: in `#wk-coach-bar`, als **einziges** Bedienelement des Coaches im Training (Gestaltungsregel 2). Er hängt **in** der Leiste, nicht daneben — also im Aufbau von `_coachBarRender`.
- Stimmenliste: `_csRenderVoices(el)` aus Task 10 Schritt 2 wird hier geschrieben. Höchstens acht Stimmen anzeigen.

**Fallstricke.**

- **Ist auf dieser Plattform kein Diktat verfügbar, verschwindet der Button** — kein ausgegrauter Knopf, der nichts tut. Die Verfügbarkeit kommt aus `CoachVoice.available(...)`, gefüttert aus `_cap('TtsPlugin')`, `_cap('SpeechPlugin')`, `typeof speechSynthesis`, `webkitSpeechRecognition || SpeechRecognition`.
- **`ICO.mic` existiert nicht** (verifiziert 2026-07-29, kein `mic:`-Eintrag in `ICO`). Der Eintrag wird ergänzt; das SVG aus dem bestehenden `.aic-mic`-Button übernehmen. **Kein Emoji als Ersatz.**
- **`_sttListenOnce`, `_aicAskOnce`, `_coachTryLocal` existieren nicht** (verifiziert, 0 Treffer). v1 ruft alle drei auf. Der vorhandene Diktat-Einstieg heißt `aicMicToggle` (`grep -n "aicMicToggle" index.html`). Fehlende Einstiegspunkte werden als **dünne Wrapper** um die vorhandenen Funktionen angelegt — die vorhandene Diktat-Logik wird **nicht** dupliziert.
- `_cap(name)` (`grep -n "const _cap = (name)"`) gibt auf Web `null` zurück. Der Web-Zweig über `speechSynthesis` ist deshalb kein Fallback für Fehler, sondern der reguläre Pfad im Browser.
- `coachSpeak` scheitert **stumm** (`console.warn`), nie mit einem sichtbaren Fehler — die Sprachausgabe darf den Ablauf nie stören.
- Der Vorhör-Satz beim Antippen einer Stimme ist bewusst **derselbe**, den der Coach später wirklich sagt (`say('greet', …)`) — kein „Dies ist eine Testansage".

**Testfälle** (`test/coach-voice.test.js`):

| Eingabe | Erwartete Ausgabe | Fängt welchen Fehler |
| --- | --- | --- |
| `available({tts:true,stt:true,webTts:false,webStt:false})` | `{tts:true,stt:true}` | — |
| `available({tts:false,stt:false,webTts:true,webStt:true})` | `{tts:true,stt:true}` | Web-Zweig vergessen |
| `available({alle:false})` | `{tts:false,stt:false}` | Button erscheint ohne Fähigkeit |
| `pickVoice([{id:'a',lang:'de-DE'},{id:'b',lang:'de-DE'}], 'b', 'de')` | `'b'` | Wunsch ignoriert |
| `pickVoice([{id:'en1',lang:'en-US'},{id:'de1',lang:'de-DE'}], 'weg', 'de')` | `'de1'` | fällt auf die **erste** Liste statt auf die **passende Sprache** zurück |
| `pickVoice([{id:'en1',lang:'en-US'}], null, 'de')` | `null` | englische Stimme für deutschen Text |
| `pickVoice([], 'x', 'de')` | `null` | wirft bei leerer Liste |
| `speakable('**Bank** 3 × 8 @ 62,5 kg')` | `'Bank 3 mal 8 bei 62,5 Kilo'` | einzelne Ersetzung fehlt — **exakter String**, nicht Teilprüfung |
| `speakable('· Punkt eins')` | `'Punkt eins'` | Listenzeichen bleibt |
| `speakable('Guter Satz.')` | `'Guter Satz.'` | Regex frisst normalen Text |
| `speakable('')` / `speakable(null)` | `''` | wirft |

**Verifikation.**

```bash
cd /Users/lennywolter/Desktop/Claude/gymtrack && node --test test/coach-voice.test.js
npx cap sync ios && ~/.claude/sim-native.sh gymtrack "iPhone 17"
```

Simulator-Prüfliste:

| Schritt | Erwartung | Fängt welchen Fehler |
| --- | --- | --- |
| Einrichtung Schritt 2 | Stimmenliste erscheint, Antippen spricht den Begrüßungssatz | `_csRenderVoices` nicht angebunden |
| „Sprachausgabe" aus | Liste verschwindet | Schalter wirkungslos |
| Training starten | Sprech-Button ist **in** der Coach-Leiste, sonst nirgends | Gestaltungsregel 2 verletzt |
| Button drücken, „Wie lang ist meine Streak?" sagen | Antwort **gesprochen und angezeigt** | einer der beiden Kanäle fehlt |
| Ganzes Training ohne Buttondruck | **kein Ton zu keinem Zeitpunkt** | Gestaltungsregel 6 verletzt |
| Mikrofon-Berechtigung entziehen | Button verschwindet, Tastatur-Chat unverändert | ausgegrauter Knopf |

`xcrun simctl io "iPhone 17" screenshot /tmp/gymtrack-voice.png`

Commit: `feat(coach): Sprachausgabe und Sprech-Button, nur auf Anfrage`

---

## Blockabschluss 2

Ritual durchlaufen. Changelog-Key: `cl-2026-07-29-coach-stimme`.

```js
  'cl-2026-07-29-coach-stimme': {
    label: '29.07.2026 · Dein Coach hat jetzt eine Stimme',
    items: [
      'Drück im Training auf den Sprech-Knopf und frag laut: „Wie führe ich die Übung aus?" — die Antwort kommt gesprochen und geschrieben',
      'Such dir bei der Einrichtung die Stimme aus, die dir gefällt, und hör sie dir vorher an',
      'Laufende Musik wird nur leiser, nicht unterbrochen',
      'Der Coach redet nie von selbst los — nur wenn du ihn fragst',
    ]
  },
```

**Offener Punkt für den Betreiber, nicht für den Agenten:** Nutrition Labels in App Store Connect prüfen, ob Spracherkennung eintragungspflichtig ist, auch wenn nichts gespeichert wird. Im Blockabschluss als offen melden.

---

# Block 3 — Tiefe im Training

**Warum jetzt:** Persona und Stimme stehen. Jetzt bekommt der Coach etwas zu sagen, das er heute nicht sagen kann — nicht mehr Einzeltrigger, sondern ein Bogen über die Einheit.

**Kosten: 0 $.** Dieser Block ist vollständig algorithmisch. Ein `fetch` gegen `AI_WORKER_URL` in einer Datei dieses Blocks ist ein Fehler.

**Ergebnis:** Zwölf Trigger, von denen dank der Obergrenze nie mehr als vier (`key`) beziehungsweise acht (`full`) durchkommen. Der Coach hat viel zu sagen und sagt wenig davon — das ist der Unterschied zwischen aufdringlich und aufmerksam.

---

