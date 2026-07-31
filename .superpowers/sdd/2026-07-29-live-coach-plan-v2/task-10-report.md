# Task 10 — Einrichtung beim Abo-Abschluss · Bericht

**Status:** DONE_WITH_CONCERNS (Arbeit vollständig und grün; Commits sind durch den
Autosync-Job gekapert worden, s. Abschnitt „Commits")

**Absicht:** Ein Coach, der ungefragt redet, wird abgeschaltet und nie wieder
eingeschaltet — ein Coach, dessen Umfang man beim Kauf selbst bestimmt hat, wird
justiert statt gekündigt.

---

## Was gebaut wurde

### 1. Overlay `ov-coach-setup` (Markup)

Direkt nach `ov-coach-hub`, vor `<!-- SHEET: KI-CHAT -->`. Struktur bewusst
identisch zum Hub: `.ov > .sheet > .sh-handle + .sh-head.ch-head + .px`, im Kopf
derselbe `.aic-orb` samt Name wie im Hub — der Coach soll sichtbar dasselbe
Objekt sein. Innen `#cst-dots` (`.pwz-dots`) und `#cst-body`.

**Kein `onclick` auf dem Hintergrund** — anders als bei jedem übrigen Overlay.
Das ✕ (`.x-btn`, `aria-label="Überspringen"`) ruft `coachSetupDone(true)`.

### 2. Funktionen (nach `_chSettingsHTML()`, vor `renderPremiumSettings()`)

| Name | Verhalten |
| --- | --- |
| `openCoachSetup()` | setzt `_csStep = 1`, `openOv('ov-coach-setup')`, rendert |
| `coachSetupStep(n)` | `1\|2\|3`, sonst no-op; `haptic(6)`; rendert |
| `coachSetupDone(skipped)` | `_csSettlePreset()` → `closeOv` → bei `skipped === false` nach 420 ms `openCoachHub('settings')` |
| `_csSettlePreset()` | setzt `setCoachPreset('balanced')` **nur** wenn `S.aiCoach.preset === undefined` — idempotent |
| `renderCoachSetup()` | früh zurück bei geschlossenem Overlay; Kopf per `textContent`, Punkte, Body + Navigation |
| `coachSetupSetName(el)` | `_csHold`-Wächter, dann Kopf/Feld/Beispielsatz nachziehen |
| `_csStep1HTML/2/3`, `_csNavHTML` | die drei Schritte plus Zurück/Weiter/Fertig |

Konstanten: `_CS_STEPS = 3`, `_CS_DELAY = 420`.

**Die drei Schritte**

1. **Name und Ton.** `#cst-name` (`.pf-inp`, `maxlength=20`, Platzhalter „Coach",
   `onchange="coachSetupSetName(this)"`) plus die vier Tonkarten
   `class="ch-preset ch-voice"` mit `onclick="setAiCoachOpt('tone','…')"` und
   `_chToneLine(t)` als Beispielsatz — **exakt die Darstellung des Hubs**,
   dieselben Konstanten (`_CH_TONES`), dieselben Klassen. Darunter
   `#cst-tone-ex` mit `_chToneExInner()`.
2. **Stimme.** `_chSwitch('voiceOn', …)` plus Erklärsatz „Er spricht nur, wenn du
   ihn über den Sprech-Button fragst — nie von selbst." Danach **nur** der leere
   Behälter `<div id="cst-voices"></div>` (keine Klasse, kein Rahmen, 0 px hoch).
   Der Aufruf `_csRenderVoices(el)` steht in `renderCoachSetup()` mit
   `typeof … === 'function'` in `try/catch` — Block 2 liefert nur die Funktion nach.
3. **Umfang.** Die drei Profilkarten (`_CH_PRESETS`, `setCoachPreset(…)`) mit je
   einem Beschreibungssatz. Vorbelegt ist **die mittlere**: `preset` ist noch
   `undefined`, die Markierung liegt trotzdem auf `'balanced'`, damit „Fertig"
   ohne Tipp dasselbe ergibt wie ein Tipp auf „Ausgewogen".

### 3. Verdrahtung an vier bestehenden Stellen

| Anker (per Inhalt gesucht) | Änderung | Begründung |
| --- | --- | --- |
| `function _coachOptRender()` | eine Zeile `renderCoachSetup()` in `try/catch` | ohne sie ändert ein Tipp auf eine Tonkarte den Wert, aber nicht das Bild — `renderCoachHub()` kehrt bei geschlossenem Hub früh zurück und die Einrichtung wurde nie neu gezeichnet |
| `function closeOv(id)` | Zweig `id === 'ov-coach-setup'` → `_csSettlePreset()` | Swipe-Dismiss (`initSheetSwipe`) ruft `closeOv` direkt; ohne dieses Netz bliebe `preset` offen und der Hub fragte beim nächsten Öffnen wieder. Muster identisch zum bestehenden `ov-checkin`-Zweig |
| `document.querySelectorAll('.ov').forEach(o => o.addEventListener('click', …))` | `if (o.id === 'ov-coach-setup') return;` | **Befund, s. unten** |
| `async function premBuy`, Erfolgszweig | zweiter `setTimeout(…, 700 + 420)` | 420 ms nach dem Schließen der Paywall (700 ms), eigener `try/catch`-Deckel |
| CSS `#ov-…{z-index:1080}` und `#ch-tone-ex…` | `#ov-coach-setup` bzw. `#cst-tone-ex` in die bestehenden Selektorlisten | kein eigenes Aussehen, eine Regel für dieselbe Sache |
| `I18N_EN` | vier neue Schlüssel | s. Zweisprachigkeit |

Kaufpfad im Wortlaut:

```js
      setTimeout(() => { try { closeOv('ov-paywall'); } catch(_){} }, 700);
      // … 420 ms NACH dem Schließen der Paywall … Eigener try/catch-Deckel:
      // wirft die Einrichtung, ist der Kauf trotzdem abgeschlossen …
      setTimeout(() => {
        try {
          const offen = !S.aiCoach || S.aiCoach.preset === undefined;
          if (offen && typeof openCoachSetup === 'function') openCoachSetup();
        } catch(e) { console.warn('[Coach] Einrichtung nach Kauf:', e); }
      }, 700 + 420);
```

Die Weiche in `openCoachHub()` war aus Task 9 bereits vorhanden und wurde **nicht
angefasst** — sie greift, seit `openCoachSetup` existiert.

---

## Befunde während der Umsetzung (beide echt, beide vom Prüfskript gefangen)

### Befund 1 — Id-Kollision `cs-*` mit dem Eigener-Split-Editor

Erste Fassung nutzte `cs-title`, `cs-name`, `cs-body`. Diese Ids gehören bereits
dem Split-Editor (`index.html`, `<h2 id="cs-title">Eigener Split</h2>`,
`<input id="cs-name" … maxlength="32">`). `getElementById` liefert das **erste**
Element im Dokument, also das des Split-Editors — die Einrichtung schrieb und las
ins fremde Formular. Beleg im Prüflauf: `max: "32"`, `ph: "z. B. Mein PPL+"`.
Behoben durch das Präfix `cst-` (`cst-title/dots/body/name/tone-ex/voices`), im
CSS kommentiert. Der Split-Editor blieb unberührt.

### Befund 2 — das fehlende `onclick` allein schließt den Hintergrund-Tipp nicht aus

Das Brief verlangt „kein `onclick` auf dem Overlay-Hintergrund". Das Markup hat
keines — trotzdem schloss ein echter Zeigerklick auf den Hintergrund die
Einrichtung. Ursache: ein Sammel-Zuhörer beim Start

```js
document.querySelectorAll('.ov').forEach(o => o.addEventListener('click', e => {
  if (e.target===o) { … closeOv(o.id); }
}));
```

hängt an **jedem** `.ov`, unabhängig vom Markup. Behoben durch genau eine
Ausnahme (`if (o.id === 'ov-coach-setup') return;`) mit Begründung im Kommentar.
Dieser Befund wäre bei einer Prüfung über synthetisches `.click()` auf dem
Overlay sichtbar geblieben, bei einer Prüfung nur des Attributs aber nicht — der
Check belegt zusätzlich per `document.elementFromPoint`, dass der Zeigerpunkt
tatsächlich auf dem Hintergrund lag und nicht ins Leere ging.

---

## Prüfliste — jeder Punkt mit Beleg

Skript: `.superpowers/sdd/2026-07-29-live-coach-plan-v2/task-10-check.js`, Port
8794, Chromium über Puppeteer, Viewport 390×844. Tipps über echte Zeigerfolgen
(`ElementHandle.click` nach `scrollIntoView({block:'center'})`), nicht über
synthetisches `.click()`. Bestandsnutzer-Pfad
(`delete S.aiCoach.preset; persist(); openCoachHub();`), weil im Browser kein
echter Kauf läuft.

Lauf **vor** der Änderung: **1/21 PASS** (der einzige grüne Punkt war eine zu
schwach formulierte Invariante und wurde daraufhin verschärft → danach 0/21
inhaltlich grün). Lauf **nach** der Änderung: **21/21 PASS**, keine Seitenfehler.

| Brief-Testfall | Check | vorher | nachher |
| --- | --- | --- | --- |
| Hub öffnen bei fehlendem `preset` ⇒ Einrichtung statt Hub | „Hub bei fehlendem preset: Einrichtung startet bei Schritt 1 …" | FAIL (`openCoachSetup` fehlt) | PASS |
| Schritt 1: alle vier Töne antippen, Beispielsatz ändert sich jedes Mal | „Schritt 1: erster Tipp nach dem Namensfeld zählt, alle vier Töne …" | FAIL | PASS (vier verschiedene Sätze, `ruhig+on,sachlich+on,hart+on,locker+on`) |
| Schritt 3 „Zurückhaltend", „Fertig" ⇒ `quiet/off/false/still` | „Schritt 3 ‚Zurückhaltend' + ‚Fertig' …" | FAIL | PASS (inkl. `setFeedback:false` und Hub danach auf „Einstellungen") |
| Hub erneut öffnen ⇒ keine zweite Einrichtung | „Hub erneut öffnen … auch preset ‚custom' fragt nicht erneut" | FAIL | PASS |
| Erneut zurücksetzen, sofort ✕ ⇒ `balanced`, keine erneute Frage | „Sofort ✕ …" | FAIL | PASS (auch `inTraining:'key'`, `live:true`, `pushLevel:'normal'`; Überspringen führt **nicht** in den Hub) |
| Nach jedem Schritt App neu starten ⇒ Werte überleben | „Werte überleben den App-Neustart … (persist(), nicht save())" | FAIL | PASS |

Zusätzlich geprüft (Verhaltensdetails und globale Regeln):

| Punkt | vorher | nachher |
| --- | --- | --- |
| Kein Aufruf beim App-Start (Funktion existiert, Overlay bleibt zu) | FAIL | PASS |
| Kein `onclick` auf dem Hintergrund, Trefferpunkt belegt | FAIL | PASS (s. Befund 2) |
| `preset` bleibt bis zum Abschluss offen | FAIL | PASS |
| Schritt 2: nur Schalter + Erklärsatz, kein leerer Listenrahmen (`#cst-voices`: 0 Kinder, keine Klasse, 0 px, 0 Kästen) | FAIL | PASS |
| `_csRenderVoices(el)`: Wurf bricht nichts, Inhalt landet im Behälter, Argument ist `#cst-voices` | FAIL | PASS |
| Schritt 3: drei Karten, drei verschiedene Sätze, vorbelegt die **mittlere** | FAIL | PASS |
| Stiller Schließweg (Swipe-Dismiss ⇒ `closeOv`) legt `balanced` fest | FAIL | PASS |
| Kaufpfad: Paywall zu bei 700 ms, Einrichtung erst nach 1120 ms | FAIL | PASS (Zeitspur: bei 800 ms und 1000 ms noch zu, am Ende offen) |
| Wirft die Einrichtung, bleibt der Kauf abgeschlossen und die Paywall zu | FAIL | PASS (`_premApply` + `_syncPremiumProfile` gelaufen, `res.active`) |
| Heute-Tab unverändert: 2 Kinder in `heute-pad`, eine `.aic`, fünf Tabs, kein zweiter Einstieg | FAIL | PASS |
| Kein Emoji; Name `<b>Nina</b>&"` erscheint als Text (`bNina/b`), nur die 7 Karten-`<b>` im DOM | FAIL | PASS |
| Zweisprachig: konkreter Schlüsselbestand in `I18N_EN` (19 Schlüssel geprüft) + `aria-label` = „Skip" | FAIL | PASS |
| Zweisprachig: alle drei Schritte englisch, kein deutscher Rest, Tonsätze identisch mit `CoachPersona.say(…, 'en')` | FAIL | PASS |
| Screenshot der offenen Einrichtung | FAIL | PASS → `task-10-setup.png` |
| Statisch: kein `save(`, `openCoachSetup` im Erfolgszweig mit `700 + 420` in `try/catch` | FAIL | PASS |

Der statische Check ist bewusst dabei: `save()` existiert nicht, wirft
`ReferenceError` und stirbt still im `try/catch` — zur Laufzeit fällt das nicht auf.

---

## Entscheidungen mit Begründung

1. **Präfix `cst-` statt `cs-`** — Kollision mit dem Split-Editor (Befund 1). Die
   JS-Namen bleiben bei `_cs…`, weil das Brief `_csRenderVoices` vorschreibt; der
   einzige bestehende `_cs`-Bezeichner ist `_csEdit` und kollidiert nicht.
2. **Namensfeld leer statt „Coach" vorbelegt.** Der Hub zeigt `_coachName()`,
   also immer „Coach"; beim ersten Mal müsste der Nutzer das Wort erst löschen.
   Die Einrichtung zeigt darum den gespeicherten Namen oder nichts — so wird der
   im Brief geforderte Platzhalter überhaupt sichtbar. Steht ein Name, zeigt das
   Feld den **wirksamen** (`safeName`), nicht den Rohwert.
3. **Sicherheitsnetz in `closeOv`.** `initSheetSwipe` hängt an jedem Sheet mit
   `.sh-handle` und ruft `closeOv` direkt; das ✕ ist nicht der einzige stille
   Schließweg. Alternative wäre gewesen, den `.sh-handle` weglassen — das hätte
   das Sheet optisch von allen anderen abweichen lassen. Beide Wege
   (`coachSetupDone` und `closeOv`) sind idempotent.
4. **`renderCoachSetup()` in `_coachOptRender()`** statt eigener Klick-Handler:
   die Einrichtung benutzt `setAiCoachOpt` / `setCoachPreset` unverändert (gleiche
   `onclick`-Zeichenketten wie im Hub), also muss sie an derselben Render-Leine
   hängen. Beide Render-Funktionen kehren bei geschlossenem Overlay früh zurück.
5. **`_csHold`-Wächter** analog `_chHoldBody`: das `onchange` des Namensfeldes
   feuert beim Blur, also zwischen `pointerdown` und `pointerup` des nächsten
   Tipps. Der Check prüft genau diese Folge mit echter Zeigereingabe.
6. **Sheet ohne feste Höhe.** Der Hub hat seit der Politur eine feste Höhe mit
   innerem Scroller, weil dort vier Reiter mit sehr verschiedenen Längen
   umgeschaltet werden. Die Einrichtung ist ein Schrittfluss wie
   `ov-plan-wizard` und wächst mit dem Inhalt — Schritt 2 ist kurz und stünde
   sonst in einer halb leeren Fläche.
7. **Kein Versions-Bump, kein Changelog-Eintrag** (macht der Controller beim
   Blockabschluss). `CHANGELOG`-Bestand unangetastet.

## Nebenwirkung: `task-9-check.js` musste angepasst werden

Nach dieser Task fiel die Task-9-Suite auf **11/20** — nicht weil der Hub
beschädigt ist, sondern weil ihr Prüfprofil kein `preset` hatte und die aus Task 9
selbst stammende Weiche jetzt greift: `openCoachHub()` startete in jedem Check die
Einrichtung statt des Hubs. Zwei minimale, kommentierte Änderungen an der Suite:

- `SETUP` setzt `S.aiCoach.preset = 'balanced'`, wenn es offen ist. Die Suite
  prüft den Hub, nicht die Einrichtung.
- Check 10 (die Weiche selbst) nimmt `window.openCoachSetup` für Teil a) kurz
  weg und legt es danach zurück. `delete` greift bei einer
  Funktionsdeklaration im globalen Gültigkeitsbereich nicht (nicht löschbar,
  aber beschreibbar) — das alte `delete window.openCoachSetup` war schon vorher
  ein stiller No-op, fiel aber nicht auf, solange die Funktion nicht existierte.

Danach: **20/20 PASS**, keine Seitenfehler.

## Testzahlen

| Lauf | vorher | nachher |
| --- | --- | --- |
| `node --test test/*.js` | 221/221 | **221/221** (keine neuen Node-Tests, App-Globals) |
| `task-10-check.js` | 1/21 (verschärft: 0/21 inhaltlich) | **21/21** |
| `task-9-check.js` | 20/20 | **20/20** (nach der Fixture-Anpassung oben) |

## Commits — Autosync hat gekapert

Die Arbeit liegt vollständig auf `origin/main`, aber **nicht** unter dem im Brief
vorgesehenen Text `feat(coach): Einrichtung beim Abo-Abschluss legt den Umfang
fest`. Der Autosync-Job hat während der Umsetzung viermal selbst committet und
gepusht:

| Commit | Inhalt |
| --- | --- |
| `49e9e59` „autosync: rechner 2026-07-30 13:57" | Markup `ov-coach-setup` + der komplette Funktionsblock |
| `0a650ec`, `cd471f6`, `6fdd834`, `82be534` | die Folgekorrekturen: Präfix `cst-`, Hintergrund-Ausnahme, Namensvorbelegung, `_coachOptRender`-Zeile, `closeOv`-Netz, Kaufpfad, `I18N_EN`, CSS |

`HEAD == origin/main == 82be534`, Arbeitsbaum sauber. Keine History
umgeschrieben, kein `amend`, kein `force-push` — wie vorgegeben.

Zwei weitere Hinweise zum Arbeitsbaum:

- Im Arbeitsbaum lag beim Beginn dieser Task eine **fremde, nicht committete
  Politur des Coach-Hubs** (feste Sheet-Höhe mit innerem Scroller, Segmented
  Control für die Reiter, `.ch-voice`-Sprechblasen, `.aic-orb` im Kopf,
  Lichtkanten, größere Trefferfläche des Löschknopfs). Sie ist über die
  Autosync-Commits mitgelaufen. Ich habe sie nicht angetastet, mich aber daran
  angepasst: die Tonkarten der Einrichtung tragen dasselbe `ch-voice`, der Kopf
  denselben Orb, `#cst-tone-ex` dieselbe Regel wie `#ch-tone-ex`.
- `.superpowers/` ist per `.gitignore` ausgenommen. Prüfskript, Screenshot und
  dieser Bericht liegen deshalb nur lokal, nicht im Repo.

## Dateien

- `C:\Users\Anwender\Desktop\Claude\gymtrack\index.html`
- `C:\Users\Anwender\Desktop\Claude\gymtrack\.superpowers\sdd\2026-07-29-live-coach-plan-v2\task-10-check.js`
- `C:\Users\Anwender\Desktop\Claude\gymtrack\.superpowers\sdd\2026-07-29-live-coach-plan-v2\task-10-setup.png`
- `C:\Users\Anwender\Desktop\Claude\gymtrack\.superpowers\sdd\2026-07-29-live-coach-plan-v2\task-9-check.js` (Fixture)

## Volle Ausgabe des Prüfskripts

```
-- Task 10 — Einrichtung beim Abo-Abschluss (Chromium statt Simulator) --
PASS  Einrichtung existiert, startet aber NICHT beim App-Start (fehlendes preset allein reicht nicht)
PASS  Hub bei fehlendem preset: Einrichtung startet bei Schritt 1 (Namensfeld maxlength=20, Platzhalter "Coach", vier Tonkarten)
PASS  Kein onclick auf dem Hintergrund: echter Tipp daneben bricht die Einrichtung nicht ab (Hub hat den Handler weiter)
PASS  Schritt 1: erster Tipp nach dem Namensfeld zaehlt, alle vier Toene setzen sich und der Beispielsatz wechselt jedes Mal
PASS  Name und Ton lassen preset offen und die Einrichtung auf Schritt 1 (sonst entfaellt die Frage nach dem Umfang)
PASS  Schritt 2: nur An/Aus-Schalter (voiceOn) plus Erklaersatz — kein leerer Listenrahmen, kein Platzhalterkasten
PASS  _csRenderVoices(el): Aufruf steht in try/catch mit typeof-Pruefung — Wurf bricht nichts, Inhalt landet im Behaelter
PASS  Schritt 3: drei Profile mit je einem Beschreibungssatz, vorbelegt die MITTLERE ("Ausgewogen"), nicht die lauteste
PASS  Schritt 3 "Zurueckhaltend" + "Fertig": preset quiet, inTraining off, live false, pushLevel still — danach Hub auf "Einstellungen"
PASS  Hub erneut oeffnen: keine zweite Einrichtung — auch preset "custom" fragt nicht erneut
PASS  Werte ueberleben den App-Neustart: Name, Ton und das ganze Profil sind noch da (persist(), nicht save())
PASS  Sofort ✕: preset "balanced" (ausgewogen, vollstaendig) und beim naechsten Hub-Oeffnen keine erneute Frage
PASS  Auch der stille Schliessweg (Swipe-Dismiss ⇒ closeOv) legt "balanced" fest, statt beim naechsten Mal wieder zu fragen
PASS  Kaufpfad: Erfolgszweig schliesst die Paywall und oeffnet die Einrichtung erst danach (420 ms Versatz, keine zwei Animationen)
PASS  Wirft die Einrichtung, ist der Kauf trotzdem abgeschlossen und die Paywall bleibt geschlossen
PASS  Heute-Tab unveraendert: keine neue Flaeche, kein fuenfter Tab, kein zweiter Einstieg in die Einrichtung
PASS  Kein Emoji in der Einrichtung, Name mit Markup landet als Text (safeName + esc), nur die Karten-<b> im DOM
PASS  Zweisprachig: jeder neue Schluessel liegt uebersetzt in I18N_EN, aria-label des ✕ inklusive
PASS  Zweisprachig: alle drei Schritte kommen auf Englisch, kein deutscher Oberflaechentext, Tonsaetze englisch
PASS  Screenshot der offenen Einrichtung geschrieben (Schritt 1 sichtbar)
PASS  Statisch: der Einrichtungs-Block nutzt persist() und nirgends save(); der Kaufpfad ruft openCoachSetup im Erfolgszweig mit 420 ms Versatz in try/catch

Seitenfehler (gefiltert): keine

Ergebnis: 21/21 PASS
```

### Task-9-Suite nach der Änderung

```
Seitenfehler (gefiltert): keine

Ergebnis: 20/20 PASS
```

---

# Fix-Runde 1 (Review: Spec ✅, Qualität nicht approved)

Ein Critical, zwei Important, dazu die Konsistenz-Korrektur an der Politur und
die fünf blinden Flecken der Suite. Nichts darüber hinaus; die im Review
ausdrücklich ausgenommenen Punkte (Segmented Control, feste Sheet-Höhe des Hubs,
`coachSetupStep(2.5)`, `coachSetupDone()` ohne Argument, totes `.ch-sec i`-CSS)
sind unberührt, ebenso `APP_VERSION`, `sw.js`, `CHANGELOG`, `firestore.rules`.

## Critical 1 — die primäre Aktion lag unter dem Bildschirmrand

**Bestätigt und reproduziert.** Roter Lauf, gemessen ohne jedes Scrollen
(`sheet.scrollTop === 0`), nach abgewarteter Einblendung:

```
  390x844:
    Schritt 1: "Weiter" Inhalt 936 px / Sicht 775 px / Aktion 825-879 px / Leiste endet 879 px / bei 844 px Viewport, scrollTop 0, ganz im Bild: false, tippbar: false
    Schritt 2: "Weiter" Inhalt 433 px / Sicht 433 px / Aktion 664-718 px / Leiste endet 718 px / bei 844 px Viewport, scrollTop 0, ganz im Bild: true,  tippbar: true
    Schritt 3: "Fertig" Inhalt 665 px / Sicht 665 px / Aktion 664-718 px / Leiste endet 718 px / bei 844 px Viewport, scrollTop 0, ganz im Bild: true,  tippbar: true
  375x667:
    Schritt 1: "Weiter" Inhalt 954 px / Sicht 613 px / Aktion 829-883 px / Leiste endet 883 px / bei 667 px Viewport, scrollTop 0, ganz im Bild: false, tippbar: false
    Schritt 2: "Weiter" Inhalt 433 px / Sicht 433 px / Aktion 487-541 px / Leiste endet 541 px / bei 667 px Viewport, scrollTop 0, ganz im Bild: true,  tippbar: true
    Schritt 3: "Fertig" Inhalt 683 px / Sicht 613 px / Aktion 557-611 px / Leiste endet 611 px / bei 667 px Viewport, scrollTop 0, ganz im Bild: true,  tippbar: true
```

Die Zahl des Reviewers ist exakt getroffen: Schritt 1 bei 390×844, Inhalt 936 px,
Sicht 775 px, Unterkante der Leiste **879 px** — 35 px unter dem Rand.

**Gewählter Weg: keiner der beiden vorgeschlagenen, sondern eine klebende
Fußleiste.** Begründung:

- **Weg (a), die Tonkarten-Maße zurücknehmen, hält bei 375×667 nicht.** Bei
  613 px Sichthöhe passen Namensfeld, vier Tonkarten, Beispielsatz und Leiste
  auch mit 81-px-Karten nicht in ein Bild (gemessen: Schritt 1 blieb nach der
  Änderung 847 px hoch). Der Review verlangt aber ausdrücklich beide Viewports.
- **Weg (b), feste Sheet-Höhe, erzeugt genau den Fehler, den derselbe Review am
  Hub bereits vermerkt hat**: leere Glasfläche, sobald ein Schritt kurz ist —
  Schritt 2 ist 314 px hoch, Schritt 3 554 px.
- Die klebende Leiste erfüllt beides: das Sheet bleibt **inhaltsgroß** (kein
  Leerraum bei Schritt 2 und 3), die Leiste steht **in jedem Schritt** im Bild.
  Und sie hält, wenn Block 2 die Stimmenliste in Schritt 2 einhängt — bei (a)
  wäre der Befund dann sofort zurück.

Änderung, drei Stellen:

1. Markup: die Leiste liegt in eigenem `<div id="cst-nav">` **außerhalb** von
   `#cst-body`; das inline `padding-bottom:26px` auf `.px` entfällt.
2. `renderCoachSetup()` schreibt `_csNavHTML()` nach `#cst-nav` statt es an
   `#cst-body` anzuhängen.
3. Stil: `#cst-nav{position:sticky;bottom:0;…}` mit Glasgrund, oberer Trennlinie
   und `calc(14px + var(--sab))` Sicherheitsabstand; `#ov-coach-setup .sheet`
   verliert das 100-px-Bodenpolster (es hält Platz für die schwebende Tableiste
   frei, die unter diesem Sheet — z 1080 über z 1000 — ohnehin verdeckt ist).
   Sticky ist kein neues Mittel: der `.sh-handle` desselben Sheets klebt oben
   nach genau derselben Regel. Im Dunkelmodus trägt `#cst-nav` denselben Grund
   wie `.sheet` (in dieselbe bestehende `[data-theme="dark"]`-Selektorliste
   aufgenommen) — mit dem hellen `--gl-bg-h` der Grundregel schien der Text
   darunter durch.

**Grüner Lauf:** alle drei Schritte, beide Viewports, `ganz im Bild: true`,
`tippbar: true`, `scrollTop 0` — Zahlen im Protokoll unten. Beleg zusätzlich als
Bild: `task-10-setup.png`.

**Check:** „Primaere Aktion der Schritte 1-3 liegt ohne Scrollen vollstaendig im
Bild und ist tippbar (390x844 / 375x667)". Er misst nicht nur die Geometrie,
sondern prüft per `document.elementFromPoint` auf dem Mittelpunkt der Aktion,
dass dort wirklich die Aktion liegt und nichts darüber — und dass
`sheet.scrollTop === 0` ist, also niemand vorher gescrollt hat. Vorher **FAIL**
für beide Viewports, nachher **PASS**.

## Important 1 — Endlosschleife, wenn `setCoachPreset()` still ausfällt

**Bestätigt.** Roter Lauf mit weggenommenem `CoachPersona.PRESETS`:
`{"offen":true,"inTraining":"key","live":true,"push":"normal","setupZu":false,"hubOffen":false}`
— `preset` fehlt in der Ausgabe, weil es `undefined` blieb; `setupZu:false` und
`hubOffen:false` zeigen die Schleife: „Fertig" schloss die Einrichtung und
`openCoachHub()` startete sie sofort wieder.

**Änderung:** `_csSettlePreset()` bekommt den Deckel, den der übrige Coach-Code
schon hat (`_persona()` mit doppeltem Rückfall, `_chToneLine()` im catch): bleibt
`preset` nach `setCoachPreset('balanced')` offen, schreibt die Funktion die vier
Felder direkt (`inTraining:'key'`, `setFeedback:true`, `pushLevel:'normal'`,
`live:true`, `preset:'balanced'` — identisch zu `PRESETS.balanced`) und ruft
`persist()` plus `_coachOptRender()`. Zusätzlich ein Schleifenwächter in
`coachSetupDone()`: ist `preset` selbst dann noch offen (etwa weil `S` nicht
beschreibbar ist), wird **nicht** an den Hub übergeben, statt den Nutzer in die
Einrichtung einzusperren; die Lage geht als `console.warn` heraus.

**Check:** „Modul-Teilausfall (CoachPersona.PRESETS weg): ‚Fertig' legt trotzdem
‚balanced' fest und der Nutzer landet im Hub, keine Schleife" — prüft
`preset/inTraining/live/pushLevel/setFeedback`, den Wert in `localStorage`,
`setupZu` und `hubOffen`. Vorher **FAIL**, nachher **PASS**.

## Important 2 — jeder Schalter im Hub sprang an den Anfang

**Bestätigt.** Roter Lauf: `{"vorher":908,"nachSchalter":0,"nachReiter":0}` — nach
dem Tipp auf „Live-Coach: Aus" stand `#ch-body` wieder bei 0.

**Änderung:** neuer Merker `_chResetScroll`, gesetzt **nur** von
`openCoachHub()` und `coachHubTab()`, verbraucht von `renderCoachHub()`. Der
Rerender liest `body.scrollTop` vor dem `innerHTML`-Austausch und setzt ihn
danach wieder — außer beim Reiterwechsel, dort auf 0. (Das bloße Weglassen von
`scrollTop = 0` hätte nicht gereicht: ein `innerHTML`-Austausch wirft die
Position selbst weg, sie muss aktiv gesichert und zurückgeschrieben werden.)
Dieselbe Bedingung trägt die Überblendung `ch-fade`: bei jedem Schalter erneut
anzulaufen ist Flackern, kein Übergang — das war Teil des gemessenen Symptoms.

**Check:** „Hub: Scrollposition ueberlebt einen Schalter (kein Sprung an den
Anfang) und wird erst beim Reiterwechsel zurueckgesetzt" — scrollt ans Ende
(908 px), tippt einen Chip in der Feinjustierung, prüft die Position, wechselt
den Reiter, prüft 0. Vorher **FAIL**, nachher **PASS**
(`{"vorher":908,"nachSchalter":908,"nachReiter":0,"level":"off"}`).

## Konsistenz-Korrektur an der Politur

`.ch-preset.ch-voice span` ist als „Formen der bestehenden `.aic-bot`-Blase"
kommentiert, benutzte aber `rgba(127,127,127,.10)`. Jetzt die Bausteine von dort:
`background:var(--inp-bg)` plus `border:1px solid var(--gl-bdr)`, abgeknickte
untere linke Ecke unverändert. Weil die Karte dieselbe Füllung trägt, übernimmt
der Rahmen die Trennung — die Blase bleibt als Blase lesbar (siehe
`task-10-setup.png`), ohne eigene Farbwerte. Der `on`-Zustand war mit
`rgba(var(--acc-rgb),.13)` schon token-basiert und ist unberührt.

## Die fünf blinden Flecken der Suite

| # | Lücke | Neu / geändert | Beleg |
| --- | --- | --- | --- |
| 1 | kein Check misst, ob die Hauptaktion im Bild liegt | neuer Check über Schritte 1–3 × 390×844 und 375×667, ohne Scrollen, mit `elementFromPoint` | vorher FAIL (beide Viewports), nachher PASS |
| 2 | Ausfall von `setCoachPreset()` ungedeckt | neuer Check mit weggenommenem `CoachPersona.PRESETS` | vorher FAIL, nachher PASS |
| 3 | Scrollposition des Hubs nach einem Schalter ungedeckt | neuer Check (Schalter **und** Reiterwechsel) | vorher FAIL, nachher PASS |
| 4 | Emoji-Riegel deckte nur `U+1F000–1FAFF` + `FE0F` | Riegel jetzt `\p{Extended_Pictographic}`; `U+2715 ✕` gezielt vorher entfernt, weil in dieser Codebasis erlaubtes Muster der `.x-btn` | der Check prüft den Riegel gegen: der Riegel muss `✅ ❌ ⭐ 😀 ⚡` fangen (`riegelFaengt`) und `✕` durchlassen (`riegelLaesstXDurch`) — sonst wäre er still kaputt und der Check grün aus dem falschen Grund |
| 5 | Hintergrund-Check belegte nur ein Attribut | neuer **Verhaltenstest** an `ov-plan` (ebenfalls ohne inline `onclick`): echter Zeigerklick auf dessen Hintergrund muss es schließen, während derselbe Klick die Einrichtung nicht schließt | **Gegenprobe gefahren:** Sammel-Zuhörer (`index.html`, `forEach` über alle `.ov`) testweise ganz entfernt → neuer Check **FAIL** (`{"treffer":"ov-plan","offen":true}` → `{"zu":false}`), Rest der Suite 25/26. Zuhörer wiederhergestellt, 26/26 |

Zwei Anpassungen an bestehenden Checks waren durch das neue Markup nötig: die
Leiste liegt nicht mehr in `#cst-body`, deshalb tippen die Schritt-Checks jetzt
`#cst-nav .btn`, und der Zweisprachigkeits-Scan liest `#cst-body` **und**
`#cst-nav`, damit „Weiter/Zurück/Fertig" weiter mitgeprüft werden. Zusätzlich
prüft der Schritt-2-Check jetzt `navAusserhalbBody` — die Leiste darf nicht in
den Scrollinhalt zurückwandern, sonst ist Critical 1 zurück.

## Testzahlen der Fix-Runde

| Lauf | rot (vor dem Fix) | grün (nach dem Fix) |
| --- | --- | --- |
| `node --test test/*.js` | 221/221 | **221/221** |
| `task-10-check.js` | 22/26 (die vier neuen Checks rot) | **26/26** |
| `task-9-check.js` | 20/20 | **20/20** |

Keine Seitenfehler in beiden Chromium-Läufen.

## Vollständige Ausgabe des Prüfskripts (grün)

```
-- Task 10 — Einrichtung beim Abo-Abschluss (Chromium statt Simulator) --
PASS  Einrichtung existiert, startet aber NICHT beim App-Start (fehlendes preset allein reicht nicht)
PASS  Hub bei fehlendem preset: Einrichtung startet bei Schritt 1 (Namensfeld maxlength=20, Platzhalter "Coach", vier Tonkarten)
PASS  Kein onclick auf dem Hintergrund: echter Tipp daneben bricht die Einrichtung nicht ab (Hub hat den Handler weiter)
PASS  Fremdes Overlay ohne inline onclick (ov-plan) schliesst per Hintergrund-Tipp weiter — nur die Einrichtung ist ausgenommen
PASS  Schritt 1: erster Tipp nach dem Namensfeld zaehlt, alle vier Toene setzen sich und der Beispielsatz wechselt jedes Mal
PASS  Name und Ton lassen preset offen und die Einrichtung auf Schritt 1 (sonst entfaellt die Frage nach dem Umfang)
PASS  Schritt 2: nur An/Aus-Schalter (voiceOn) plus Erklaersatz — kein leerer Listenrahmen, kein Platzhalterkasten
PASS  _csRenderVoices(el): Aufruf steht in try/catch mit typeof-Pruefung — Wurf bricht nichts, Inhalt landet im Behaelter
PASS  Schritt 3: drei Profile mit je einem Beschreibungssatz, vorbelegt die MITTLERE ("Ausgewogen"), nicht die lauteste
PASS  Schritt 3 "Zurueckhaltend" + "Fertig": preset quiet, inTraining off, live false, pushLevel still — danach Hub auf "Einstellungen"
PASS  Hub erneut oeffnen: keine zweite Einrichtung — auch preset "custom" fragt nicht erneut
PASS  Werte ueberleben den App-Neustart: Name, Ton und das ganze Profil sind noch da (persist(), nicht save())
PASS  Sofort ✕: preset "balanced" (ausgewogen, vollstaendig) und beim naechsten Hub-Oeffnen keine erneute Frage
PASS  Auch der stille Schliessweg (Swipe-Dismiss ⇒ closeOv) legt "balanced" fest, statt beim naechsten Mal wieder zu fragen
PASS  Modul-Teilausfall (CoachPersona.PRESETS weg): "Fertig" legt trotzdem "balanced" fest und der Nutzer landet im Hub, keine Schleife
PASS  Hub: Scrollposition ueberlebt einen Schalter (kein Sprung an den Anfang) und wird erst beim Reiterwechsel zurueckgesetzt
PASS  Kaufpfad: Erfolgszweig schliesst die Paywall und oeffnet die Einrichtung erst danach (420 ms Versatz, keine zwei Animationen)
PASS  Wirft die Einrichtung, ist der Kauf trotzdem abgeschlossen und die Paywall bleibt geschlossen
PASS  Heute-Tab unveraendert: keine neue Flaeche, kein fuenfter Tab, kein zweiter Einstieg in die Einrichtung
PASS  Kein Emoji in der Einrichtung (Riegel Extended_Pictographic, ✕ ausgenommen und Riegel gegengeprueft), Name mit Markup als Text
PASS  Zweisprachig: jeder neue Schluessel liegt uebersetzt in I18N_EN, aria-label des ✕ inklusive
PASS  Zweisprachig: alle drei Schritte kommen auf Englisch, kein deutscher Oberflaechentext, Tonsaetze englisch
PASS  Screenshot der offenen Einrichtung geschrieben (Schritt 1 sichtbar)
PASS  Primaere Aktion der Schritte 1-3 liegt ohne Scrollen vollstaendig im Bild und ist tippbar (390x844)
PASS  Primaere Aktion der Schritte 1-3 liegt ohne Scrollen vollstaendig im Bild und ist tippbar (375x667)
PASS  Statisch: der Einrichtungs-Block nutzt persist() und nirgends save(); der Kaufpfad ruft openCoachSetup im Erfolgszweig mit 420 ms Versatz in try/catch

Messung der primaeren Aktion (ohne Scrollen):
  390x844:
    Schritt 1: "Weiter" Inhalt 829 px / Sicht 775 px / Aktion 776-830 px / Leiste endet 830 px / bei 844 px Viewport, scrollTop 0, ganz im Bild: true, tippbar: true
    Schritt 2: "Weiter" Inhalt 314 px / Sicht 314 px / Aktion 776-830 px / Leiste endet 830 px / bei 844 px Viewport, scrollTop 0, ganz im Bild: true, tippbar: true
    Schritt 3: "Fertig" Inhalt 554 px / Sicht 554 px / Aktion 776-830 px / Leiste endet 830 px / bei 844 px Viewport, scrollTop 0, ganz im Bild: true, tippbar: true
  375x667:
    Schritt 1: "Weiter" Inhalt 847 px / Sicht 613 px / Aktion 599-653 px / Leiste endet 653 px / bei 667 px Viewport, scrollTop 0, ganz im Bild: true, tippbar: true
    Schritt 2: "Weiter" Inhalt 314 px / Sicht 314 px / Aktion 599-653 px / Leiste endet 653 px / bei 667 px Viewport, scrollTop 0, ganz im Bild: true, tippbar: true
    Schritt 3: "Fertig" Inhalt 572 px / Sicht 572 px / Aktion 599-653 px / Leiste endet 653 px / bei 667 px Viewport, scrollTop 0, ganz im Bild: true, tippbar: true

Seitenfehler (gefiltert): keine

Ergebnis: 26/26 PASS
```

---

# Fix-Welle Blockabschluss 1 (Review über Tasks 6–10)

Zwei Important, die Triage-Liste, die Streichung von Block 2 und die Testlücke um
die `live`-Invariante. Jeder Punkt hatte **zuerst** einen Check, der ihn rot
zeigte. Roter Lauf: **20/41 PASS, 21 FAIL**. Grüner Lauf: **41/41 PASS**.

Nicht angefasst, wie vorgegeben: `coachSetupStep(2.5)`-Wache, `coachSetupDone()`
ohne Argument, totes `.ch-sec i`-CSS, Markdown in der Chat-Vorschau, „Bestätigung
fällig", feste Sheet-Höhe des Hubs, `.aic-orb` im Kopf, Trefferfläche des
Löschknopfs, Segmented-Control-**Klassen** (nur ihr Aussehen), `CACHE` in
`sw.js`, `APP_VERSION`, `CHANGELOG`, `firestore.rules`.

## Important 1 — der `live`-Schalter zerstörte Stufe und Profil

**Rot:** `{"p":"close","vorher":{"preset":"close","inTraining":"full","pushLevel":"eng"},"nachher":{"preset":"custom","inTraining":"key","pushLevel":"eng"},"gleich":false}`
— genau der Befund der Review.

**Änderung** (`setAiCoachOpt`, plus neue Hilfe `_coachPresetSync`):

1. **Stufe merken.** Beim Abschalten wandert die bisherige Stufe nach
   `S.aiCoach.liveWas`, beim Einschalten kommt sie zurück (`'key'` nur als
   Rückfall, wenn nichts gemerkt ist). Eine bewusst gewählte Stufe
   (`setAiCoachOpt('inTraining', …)`) und jede Profilwahl (`setCoachPreset`)
   löschen den Merker — sonst käme die Stufe eines alten Profils zurück.
2. **Profilname wird neu bestimmt, nicht festgeschrieben.** `_coachPresetSync()`
   prüft die drei Felder nach jedem Profilschalter erneut gegen
   `CoachPersona.PRESETS`: passt ein Profil, trägt der Zustand dessen Namen;
   passt keines, heißt er `'custom'`. Vorher blieb `'custom'` stehen, sobald es
   einmal gesetzt war. Ein noch offenes `preset` (`undefined`) bleibt offen.
3. Die Invariante `live !== false` ⟺ `inTraining !== 'off'` bleibt in beide
   Richtungen erhalten (eigener Check, s. u.).

**Grenze, bewusst so:** Profil „Zurückhaltend" kann **nicht** exakt rundlaufen —
dort ist der Schalter von Haus aus aus, ein Tipp auf „aus" ist kein
Zustandswechsel und der Tipp auf „ein" ist eine Entscheidung des Nutzers (die
Invariante verbietet `live:true` bei Stufe `'off'`). Der Check fordert dort
stattdessen: kein Kollateralschaden, `setFeedback` und `pushLevel` unangetastet.

**Checks:** „Important 1: der Rundlauf … ist verlustfrei" (alle drei Profile plus
„Angepasst") und „Invariante … haelt in beide Richtungen, auch ohne gemerkte
Stufe". Beide vorher **FAIL**, nachher **PASS**.

## Important 2 — `setFeedback` war ein Schalter ohne Verbraucher

**Rot:** `{"an":1,"aus":1,...}` im ersten Entwurf; nach dem Schärfen des Checks
(s. Befund b unten) `{"an":0,...}` → nach dem Fix `{"an":1,"aus":0,"wiederAn":1,"stufeAus":0}`.

**Änderung:** `_coachMicroReact()` bekommt hinter der Stufen-Wache
`try { if (_persona().setFeedback === false) return; } catch(_) {}`.

**Entscheidung zu `_coachEvalRun`: bewusst NICHT mitgefangen.** Das Schalter-Label
sagt „Rückmeldung nach dem Satz — Kurzer Kommentar, sobald ein Satz steht"; das
ist die Sofort-Reaktion in der Leiste. `_coachEvalRun()` ist die
Vorschlagskarte des Live-Coaches (rate-limitiert, Netzpfad), und die steuert der
eigene Schalter „Live-Coach im Training" (`inTraining`). Wäre sie mitgefangen,
schaltete ein Schalter zwei Dinge ab und der andere wäre halb wirkungslos. Der
Check belegt beide Seiten: `setFeedback:false` schweigt, `inTraining:'off'`
schweigt weiter unabhängig davon.

## Schritt 2 der Einrichtung entfernt (Block 2 gestrichen)

Die Einrichtung ist zweistufig: **1. Name und Ton, 2. Umfang.** `_CS_STEPS = 2`,
die Punkte-Anzeige zeichnet zwei, `coachSetupStep()` weist 3 ab, die Navigation
zeigt in Schritt 2 „Fertig". Der Schalter „Soll <Name> sprechen?", der Erklärsatz,
`#cst-voices` und der Aufruf von `_csRenderVoices(el)` sind aus der Oberfläche
heraus; an der Stelle steht ein Kommentar, wo Block 2 den Schritt wieder einhängt
und dass dann `_CS_STEPS` auf 3 geht. Die beiden I18N-Schlüssel des Schritts sind
mit ihm gegangen.

**Das Datenfeld `voiceOn` bleibt** — in `S.aiCoach` wie in
`CoachPersona.personaGet`. Der Check schreibt es zur Laufzeit und liest es über
`_persona()` zurück, damit „nur unsichtbar, nicht weg" belegt ist.

**Check:** „Stimme aus der Oberflaeche entfernt (zwei Schritte, kein Schalter,
_csRenderVoices wird nie gerufen) — Datenfeld voiceOn lebt weiter", plus die
angezogenen Bestandschecks (Punkte 2 statt 3, Schritt 2 = Umfang, Zweisprachigkeit
und Viewport-Messung über zwei Schritte). Vorher **FAIL**, nachher **PASS**.

## Triage

| # | Änderung | Check | rot → grün |
| --- | --- | --- | --- |
| 1 | Die zweite Beispielzeile läuft über `_chToneExVars()`: **echte** Werte der letzten beendeten Einheit (`sessionVolume`), und über den Schlüssel `debrief` statt `mid` — `mid` sagt „Halbzeit" und hätte einen Zusammenhang behauptet, den es hier nicht gibt. Liegt keine Einheit vor, entfällt der Kasten ganz (Hub und Einrichtung rendern ihn nur bei Inhalt). | „Triage 1: die zweite Beispielzeile traegt echte Zahlen … und entfaellt ohne Verlauf" (prüft beide Lagen und sucht aktiv nach `4.200`/`104`) | FAIL → PASS |
| 2 | Journal ohne Konto sagt es: „Das Journal braucht ein Konto." plus eine Zeile mit dem Coach-Namen, statt vier Mal „Noch nichts notiert.". Über `_coachUid()`, zweisprachig (`tr` + `_cm`). | „Triage 2: ohne Konto sagt das Journal, dass es ein Konto braucht — mit Konto steht der Hinweis nicht da" | FAIL → PASS |
| 3 | `.aic`-Karte: `role="button"`, `tabindex="0"`, `aria-label` („Coach-Menü öffnen" / „Open coach menu") und `onkeydown` für Enter und Leertaste, mit demselben `closest('button, a')`-Wächter wie der Tipp. | „Triage 3: … role=button und tabindex=0 und oeffnet den Hub per Enter und Leertaste" (echte Tastendrücke über `page.keyboard`) | FAIL → PASS |
| 4 | `.ch-tabs`/`.ch-tab` tragen das Chip-Idiom: Träger ohne Hintergrund und Rahmen, Reiter mit `1.5px solid var(--gl-bdr)`, Radius 13 px, aktiv `border-color:var(--acc)` + `rgba(var(--acc-rgb),.10)` + `var(--acc)` — Zeichen für Zeichen die Werte von `.pwz-chip`. Nur Schriftgrad (13 px) und Polster sind knapper, damit vier Reiter in eine Zeile passen. Die Klassen bleiben. | „Triage 4: … Reiter und .pwz-chip-Reihe sehen im selben Sheet gleich aus" (vergleicht computed `background`, `border-width/style/color`, `radius` — aktiv gegen aktiv, inaktiv gegen inaktiv) | FAIL → PASS |
| 5 | `_chGoalLabel()` übersetzt die vier `GOALS`-Werte nur für die Anzeige (lokale Tabelle, **kein** globaler I18N-Schlüssel: „Kraft" hätte jeden fremden Textknoten mitübersetzt). Gespeichert bleibt deutsch; ein unbekannter Wert geht unverändert durch. | im Zweisprachigkeits-Check des Journals mitgeprüft (task-9-Suite, „Your goal" zeigt „Strength") | — |
| 6 | Äußeres `try/catch` um `setAiCoachOpt` und `setCoachPreset`; im Fehlerfall läuft `_coachOptRender()` trotzdem. | „Triage 6: wirft persist(), propagiert der Fehler NICHT aus dem onclick-Handler und _coachOptRender laeuft trotzdem" | FAIL → PASS |
| 7 | `isWorkoutActive()`-Wache im Kauf-Timeout. Die Einrichtung holt der Hub später nach, weil `preset` dann noch offen ist — genau das prüft der Check mit. | „Triage 7: Kauf im laufenden Training schiebt kein Overlay ueber die Einheit — … der Hub holt die Einrichtung danach nach" | FAIL → PASS |
| 8 | Kommentar in `js/coach-persona.js` korrigiert: er nennt jetzt die drei Regeln, die die Suite wirklich hält, und sagt, dass die vierte eine Schreibregel ist. **Dazu ein echter Teil-Riegel** in `test/coach-persona.test.js`: keine Zeile ist ein bloßer Lob-Ausruf, jede hat mindestens drei Wörter. | `node --test`: 221 → **222** | — |
| 9 | `sw.js`: Notification-Titel ohne Emoji („Zeit fürs Training"). `CACHE` unangetastet. | „Statisch: kein Emoji im Notification-Titel von sw.js (CACHE unangetastet)" — der Check friert den CACHE-Namen des Laufs ein und schlägt an, wenn diese Welle ihn anfasst | FAIL → PASS |

## Migration und Invariante — die Testlücke

Neu: fünf Migrationschecks. Geseedet wird `localStorage['ft4']` per
`page.evaluateOnNewDocument` **vor** dem Laden, dann geladen, dann `S.aiCoach`
geprüft — der Pfad, der beim Update über die Daten jedes bestehenden Nutzers
läuft und den die Skripte bisher nicht erreichten.

| Ausgangsstand | Erwartung | Ergebnis |
| --- | --- | --- |
| `{live:false, insights:true}` | `inTraining:'off'`, `live:false` | PASS (lief schon vorher) |
| `{live:true, insights:true}` | `inTraining:'key'`, `live:true` | PASS (lief schon vorher) |
| `{live:true, inTraining:'off'}` | beide Seiten konsistent | PASS (lief schon vorher) |
| `{live:false, inTraining:'full'}` | beide Seiten konsistent | PASS (lief schon vorher) |
| `{live:true, inTraining:'laut', pushLevel:'dauernd', tone:42}` | normalisiert | **FAIL → PASS** |

Der fünfte Stand war rot: `_persona()` normalisierte beim **Lesen**, die Felder
selbst blieben krumm — wer `S.aiCoach` direkt anfasst (die Invariante beim Start,
der `live`-Schalter, `_coachPresetMatches`), traf auf `'laut'`. Jetzt normalisiert
der Start `tone`, `inTraining` und `pushLevel` über `CoachPersona.personaGet` und
schreibt sie zurück, **vor** der Invariante. `name` und `preset` bleiben
absichtlich roh: `safeName('')` wäre `'Coach'` — ein Name, den der Nutzer nie
gewählt hat — und ein ungültiges `preset` soll die Einrichtung auslösen, nicht
stillschweigend zu einem Profil werden. Jeder Migrationscheck prüft zusätzlich,
dass die Invariante nach dem Start in beide Richtungen stimmt.

## Drei Befunde in der Suite selbst, die dabei aufgefallen sind

- **a) `window.persist = …` war wirkungslos.** `persist` ist ein top-level `let`
  und liegt nicht auf `window` — der erste Entwurf von Triage-6 lief leer grün.
  Jetzt wirft `localStorage.setItem`, also die Quelle, die `persist()` als erstes
  ruft.
- **b) `window.wkLogs = …` war wirkungslos**, gleiche Ursache; `exById` ist eine
  `const`-Arrow über `S.exercises` und ebenfalls nicht stubbar. Der Important-2-
  Check lief deshalb zuerst mit `{"an":0,"aus":0}` — grün wäre er nie geworden,
  aber er hätte auch nichts belegt. Jetzt füllt er `wkLogs` direkt und legt eine
  echte Übung in den Bestand.
- **c) Die Reiter tragen `transition:background-color .15s`.** Direkt nach dem
  Reiterwechsel liefert `getComputedStyle` den **interpolierten** Zwischenwert:
  der zuvor aktive Reiter las noch Akzent, der neue noch Grundfarbe — der
  Triage-4-Check verglich zwei Momentaufnahmen einer laufenden Blende und blieb
  rot, obwohl das CSS stimmte. Jetzt wartet er die Blende ab.

## Neuer Befund, NICHT in dieser Welle behoben (gemeldet statt geraten)

`index.html`, in `_coachMicroReact()`, Zweig „noch Sätze übrig":

```js
        _cm('Satz ' + doneWork + ' von ' + work.length + ' — noch ' + leftWork + '.',
            'Set ' + doneWork + ' of ' + work.length + ' — ' + leftWork + ' to go.')
```

`work` ist eine **Zahl** (`let work = 0; … work++`), `work.length` ist
`undefined`. Der Nutzer liest „Satz 1 von undefined — noch 2." Vorbestehend, in
derselben Funktion wie Important 2, aber nicht Teil der Triage-Liste — daher
nicht angefasst. Ein Zeichen Fix (`work` statt `work.length`).

## Testzahlen der Welle

| Lauf | rot (vor den Fixes) | grün (nach den Fixes) |
| --- | --- | --- |
| `node --test test/*.js` | 221/221 | **222/222** (neuer Teil-Riegel für Tonregel 4) |
| `task-10-check.js` | 20/41 (21 FAIL) | **41/41** |
| `task-9-check.js` | 20/20 | **20/20** |

Zwei Anpassungen an der task-9-Suite waren nötig, weil Triage 1 die Beispielzeile
an echte Daten bindet: ihr Prüfprofil bekommt eine Übung und eine beendete
Einheit, und ihre Erwartung für die Zeile läuft über `debrief` +
`_chToneExVars()` statt über `mid` mit `{vol:4200, pct:104}`.

## Messung der primären Aktion nach der Umstellung auf zwei Schritte

```
  390x844:
    Schritt 1: "Weiter" Inhalt 812 px / Sicht 775 px / Leiste endet 830 px / bei 844 px Viewport, scrollTop 0, ganz im Bild: true, tippbar: true
    Schritt 2: "Fertig" Inhalt 554 px / Sicht 554 px / Leiste endet 830 px / bei 844 px Viewport, scrollTop 0, ganz im Bild: true, tippbar: true
  375x667:
    Schritt 1: "Weiter" Inhalt 831 px / Sicht 613 px / Leiste endet 653 px / bei 667 px Viewport, scrollTop 0, ganz im Bild: true, tippbar: true
    Schritt 2: "Fertig" Inhalt 572 px / Sicht 572 px / Leiste endet 653 px / bei 667 px Viewport, scrollTop 0, ganz im Bild: true, tippbar: true
```

## Vollständige Ausgabe des Prüfskripts (grün)

```
-- Task 10 — Einrichtung beim Abo-Abschluss (Chromium statt Simulator) --
PASS  Einrichtung existiert, startet aber NICHT beim App-Start (fehlendes preset allein reicht nicht)
PASS  Hub bei fehlendem preset: Einrichtung startet bei Schritt 1 (Namensfeld maxlength=20, Platzhalter "Coach", vier Tonkarten)
PASS  Kein onclick auf dem Hintergrund: echter Tipp daneben bricht die Einrichtung nicht ab (Hub hat den Handler weiter)
PASS  Fremdes Overlay ohne inline onclick (ov-plan) schliesst per Hintergrund-Tipp weiter — nur die Einrichtung ist ausgenommen
PASS  Schritt 1: erster Tipp nach dem Namensfeld zaehlt, alle vier Toene setzen sich und der Beispielsatz wechselt jedes Mal
PASS  Name und Ton lassen preset offen und die Einrichtung auf Schritt 1 (sonst entfaellt die Frage nach dem Umfang)
PASS  Schritt 2 ist der Umfang: kein Stimmen-Schritt mehr (kein Schalter, kein Sprech-Satz, kein #cst-voices), Leiste ausserhalb des Scrollinhalts
PASS  Stimme aus der Oberflaeche entfernt (zwei Schritte, kein Schalter, _csRenderVoices wird nie gerufen) — Datenfeld voiceOn lebt weiter
PASS  Schritt 2 (Umfang): drei Profile mit je einem Beschreibungssatz, vorbelegt die MITTLERE ("Ausgewogen"), nicht die lauteste
PASS  Schritt 2 "Zurueckhaltend" + "Fertig": preset quiet, inTraining off, live false, pushLevel still — danach Hub auf "Einstellungen"
PASS  Hub erneut oeffnen: keine zweite Einrichtung — auch preset "custom" fragt nicht erneut
PASS  Werte ueberleben den App-Neustart: Name, Ton und das ganze Profil sind noch da (persist(), nicht save())
PASS  Sofort ✕: preset "balanced" (ausgewogen, vollstaendig) und beim naechsten Hub-Oeffnen keine erneute Frage
PASS  Auch der stille Schliessweg (Swipe-Dismiss ⇒ closeOv) legt "balanced" fest, statt beim naechsten Mal wieder zu fragen
PASS  Modul-Teilausfall (CoachPersona.PRESETS weg): "Fertig" legt trotzdem "balanced" fest und der Nutzer landet im Hub, keine Schleife
PASS  Hub: Scrollposition ueberlebt einen Schalter (kein Sprung an den Anfang) und wird erst beim Reiterwechsel zurueckgesetzt
PASS  Kaufpfad: Erfolgszweig schliesst die Paywall und oeffnet die Einrichtung erst danach (420 ms Versatz, keine zwei Animationen)
PASS  Wirft die Einrichtung, ist der Kauf trotzdem abgeschlossen und die Paywall bleibt geschlossen
PASS  Heute-Tab unveraendert: keine neue Flaeche, kein fuenfter Tab, kein zweiter Einstieg in die Einrichtung
PASS  Kein Emoji in der Einrichtung (Riegel Extended_Pictographic, ✕ ausgenommen und Riegel gegengeprueft), Name mit Markup als Text
PASS  Zweisprachig: jeder neue Schluessel liegt uebersetzt in I18N_EN, aria-label des ✕ inklusive
PASS  Zweisprachig: alle drei Schritte kommen auf Englisch, kein deutscher Oberflaechentext, Tonsaetze englisch
PASS  Screenshot der offenen Einrichtung geschrieben (Schritt 1 sichtbar)
PASS  Important 1: der Rundlauf "Live-Coach aus/ein" ist verlustfrei — Profil, Stufe, Rueckmeldung und Nachrichten kommen exakt zurueck
PASS  Invariante live !== false ⟺ inTraining !== "off" haelt in beide Richtungen, auch ohne gemerkte Stufe
PASS  Important 2: "Rueckmeldung nach dem Satz" aus laesst _coachMicroReact schweigen, ein laesst ihn wieder reden
PASS  Triage 1: die zweite Beispielzeile traegt echte Zahlen der letzten Einheit und entfaellt ohne Verlauf — nirgends erfundene 4.200 kg / 104 %
PASS  Triage 2: ohne Konto sagt das Journal, dass es ein Konto braucht — mit Konto steht der Hinweis nicht da
PASS  Triage 3: die Coach-Karte traegt role=button und tabindex=0 und oeffnet den Hub per Enter und Leertaste
PASS  Triage 4: .ch-tabs ist kein Segmented Control mehr — Reiter und .pwz-chip-Reihe sehen im selben Sheet gleich aus, Klassen bleiben
PASS  Triage 6: wirft persist(), propagiert der Fehler NICHT aus dem onclick-Handler und _coachOptRender laeuft trotzdem
PASS  Triage 7: Kauf im laufenden Training schiebt kein Overlay ueber die Einheit — preset bleibt offen und der Hub holt die Einrichtung danach nach
PASS  Primaere Aktion beider Schritte liegt ohne Scrollen vollstaendig im Bild und ist tippbar (390x844)
PASS  Primaere Aktion beider Schritte liegt ohne Scrollen vollstaendig im Bild und ist tippbar (375x667)
PASS  Migration: Bestandsnutzer hatte den Live-Coach aus ⇒ inTraining "off", live false, Invariante konsistent
PASS  Migration: Bestandsnutzer hatte ihn an ⇒ inTraining "key", live true, Invariante konsistent
PASS  Migration: widerspruechlich: live true, Stufe off ⇒ inTraining "off", live false, Invariante konsistent
PASS  Migration: widerspruechlich: live false, Stufe full ⇒ inTraining "off", live false, Invariante konsistent
PASS  Migration: ungueltige Werte werden normalisiert ⇒ inTraining "key", live true, Invariante konsistent
PASS  Statisch: kein Emoji im Notification-Titel von sw.js (CACHE unangetastet)
PASS  Statisch: der Einrichtungs-Block nutzt persist() und nirgends save(); der Kaufpfad ruft openCoachSetup im Erfolgszweig mit 420 ms Versatz in try/catch

Messung der primaeren Aktion (ohne Scrollen):
  390x844:
    Schritt 1: "Weiter" Inhalt 812 px / Sicht 775 px / Aktion 776-830 px / Leiste endet 830 px / bei 844 px Viewport, scrollTop 0, ganz im Bild: true, tippbar: true
    Schritt 2: "Fertig" Inhalt 554 px / Sicht 554 px / Aktion 776-830 px / Leiste endet 830 px / bei 844 px Viewport, scrollTop 0, ganz im Bild: true, tippbar: true
  375x667:
    Schritt 1: "Weiter" Inhalt 831 px / Sicht 613 px / Aktion 599-653 px / Leiste endet 653 px / bei 667 px Viewport, scrollTop 0, ganz im Bild: true, tippbar: true
    Schritt 2: "Fertig" Inhalt 572 px / Sicht 572 px / Aktion 599-653 px / Leiste endet 653 px / bei 667 px Viewport, scrollTop 0, ganz im Bild: true, tippbar: true

Seitenfehler (gefiltert): keine

Ergebnis: 41/41 PASS
```
