# Onboarding-Redesign — Design-Spec

**Datum:** 2026-07-31 · **Status:** vom Nutzer freigegeben (Visual-Companion-Session, v4 + Flow-Screens)

## Ziel

Das bestehende 7-Schritte-Onboarding wirkt unprofessionell und endet mit einer rohen
Template-Auswahl. Neu: Ein hochwertiger, App-konformer Einrichtungs-Flow, der aus den
Antworten einen **fertigen, personalisierten Trainingsplan** baut (inkl.
Muskelgruppen-Priorisierung), mit eigenem Pre-Prompt-Schritt sauber nach **Push-Erlaubnis** fragt und
vollständig **zweisprachig (DE/EN)** ist.

## Bestand (relevant)

- Onboarding: `index.html` ~20824–20998 (`_ob`, `renderOb`, `_obStepHTML`, `obNext`, `_obRecTpl`, `_applyTemplateCore`).
- Templates: `PLAN_TEMPLATES` (~20421) — bleiben für den Template-Picker im Plan-Tab unverändert erhalten.
- Übungsbibliothek: `EX_LIBRARY` (~20325), Muskelgruppen `brust/ruecken/beine/schultern/arme/core`; EN-Namen existieren in der Übersetzungstabelle (~7836).
- Push: `_pushRegister()` (~21121) — Capacitor `PushNotifications`, fragt nativ, registriert APNs.
- Start-Reihenfolge: Login-Gate → Onboarding → Soft-Paywall (`maybeStartOnboarding`, `_obClose`, `_postLoginFlow`) — **bleibt unverändert**.
- Design-Tokens: `--bg/--card/--acc/--acc-rgb/--text/--text2/--soft/--gl-bdr` (Zeile ~210 ff.), 5 Akzent-Themes, Light/Dark, Glass-Modus.

## Flow — 10 Schritte

| # | Screen | Pflicht | Inhalt |
|---|--------|---------|--------|
| 1 | Willkommen | – | Logo-Kachel, Titel, „Dauert unter 2 Minuten", CTA **Los geht's**, Ghost **Ohne Einrichtung starten** (= `skipOnboarding`). Kein Header. |
| 2 | Name | optional | Textfeld wie bisher (max 30, Vorbelegung `S.userName`). |
| 3 | Ziel | ja | Karten: Muskeln aufbauen / Stärker werden / Abnehmen / Fit bleiben. |
| 4 | Erfahrung | ja | Anfänger (<1 J) / Fortgeschritten (1–3 J) / Profi (>3 J). |
| 5 | Frequenz | ja | 2–6 Tage/Woche. |
| 6 | Muskel-Fokus | ja (Default „ausgewogen") | Volle Option **„Nein — ausgewogen trainieren"** oben, darunter 2-Spalten-Grid: Brust, Rücken, Schultern, Arme, Beine, Bauch (=`core`). **Max. 2** wählbar; Auswahl einer Gruppe deaktiviert „ausgewogen" und umgekehrt. |
| 7 | Dauer | ja | Kurz ~45 min / Normal ~60–75 min / Lang 90+ min. |
| 8 | Equipment | ja | Gym (alles) / Zuhause mit Hanteln / Nur Körpergewicht. |
| 9 | Benachrichtigungen | nur nativ | Pre-Prompt: Glocken-Icon, „Bleib am Ball", 3 Nutzen-Karten (Trainings-Erinnerungen, Neue Bestleistungen, Freunde-Aktivität). CTA **Aktivieren** → `_pushRegister()` (löst den nativen iOS-Dialog aus), Ghost **Jetzt nicht**. Beide Wege → weiter. Wird übersprungen, wenn Capacitor `PushNotifications` fehlt (Web/PWA); Segmentanzahl passt sich an. |
| 10 | Erstellung → Ergebnis | – | ~2 s Erstell-Animation (3 Häkchen-Zeilen nacheinander: Split gewählt · Fokus-Übungen ergänzt · Volumen angepasst), dann Ergebnis-Screen: Plan-Karte (Split-Name, Fokus-Zeile in Akzentfarbe, Meta „4×/Woche · ~60 min · Gym", Tages-Chips, Vorschau Tag 1 mit markierten Fokus-Übungen). CTA **Plan übernehmen & loslegen** → Plan anwenden + `_obClose`. Ghost **Details ansehen** → aufklappbare Tagesliste im selben Screen. Kopfzeile nur mit Zurück (kein „Später"): Wer keinen Plan will, geht zurück oder hat vorher übersprungen. |

**Navigation:** Kopfzeile ab Schritt 2: runder Zurück-Button links, Segment-Progress
mittig (flexible Segmente, Anzahl = sichtbare Frage-Schritte), **„Später"-Pill** rechts
(= gesamtes Onboarding überspringen, wie bisher `skipOnboarding`). Kein Auto-Weiter
nach Auswahl (bewusste Entscheidung aus dem Bestand, bleibt). Zurück ändert Antworten;
Schritt 10 rechnet den Plan bei jedem Eintritt neu.

## Design

Freigegebene Richtung: **Soft Clean im App-Design** (Mockups: `.superpowers/brainstorm/…/design-richtung-v4.html`, `flow-screens.html`).

- **Nur Tokens, keine Hex-Werte:** `var(--bg)`, `var(--card)`, `var(--acc)`, `var(--soft)`, `var(--text2)`, `var(--gl-bdr)` — Themes/Dark/Glass greifen automatisch.
- Karten: 16 px Radius, 1.5 px Border, ausgewählt = Akzent-Border + Häkchen-Badge (wie `.ob-opt`, gestrafft).
- Typo: Titel 25–26 px / 800 / −0.6 px Letter-Spacing, Untertitel `--text2`.
- **Keine Emojis** — ausschließlich SVG-Stroke-Icons im `_OB_SVG`-Stil (bestehendes Set erweitern: Glocke, Kalender, Pokal, Uhr, Hantel-Varianten, Muskelgruppen).
- Buttons: Primär `--acc`, 15 px Radius; Ghost-Aktionen als Textbutton.
- Alte `ob-dots` entfallen; CSS-Klassen `ob-*` werden ersetzt/erneuert.

## Plan-Generierung (Hybrid)

Neuer Builder `buildOnboardingPlan(answers)` → Plan-Objekt im `PLAN_TEMPLATES`-Tagesformat,
Anwendung über den bestehenden `_applyTemplateCore`-Pfad.

### 1. Basis-Split (Frequenz × Erfahrung)

| Frequenz | Anfänger | Fortgeschritten | Profi |
|----------|----------|-----------------|-------|
| 2 | Ganzkörper 2× (neu, Mo/Do) | Ganzkörper 2× | Ganzkörper 2× |
| 3 | Ganzkörper 3× (`fullbody3`) | PPL 3× (`ppl3`) | PPL 3× |
| 4 | Upper/Lower (`upperlower`) | Upper/Lower | Upper/Lower |
| 5 | PPL + Upper/Lower (neu, Mo–Fr) | PPL + Upper/Lower | PPL + Upper/Lower |
| 6 | PPL 6× (`ppl6`) | PPL 6× | Arnold (`arnold`) |

Neue Splits (Ganzkörper 2×, PPL+UL 5×) werden als interne Split-Definitionen ergänzt
(gleiches `days`/`libNames`-Format).

### 2. Muskel-Fokus (0–2 Gruppen)

- Pro Fokus-Gruppe **+1 Übung** an jedem Tag, der die Gruppe bereits trainiert (max. +2 Zusatzübungen pro Tag insgesamt), aus einem `PRIO_POOL` je Gruppe (nur Übungen aus `EX_LIBRARY`).
- Fokus-Übungen werden im Plan markiert (Ergebnis-Screen: Akzentfarbe; Datenmodell: Flag am Übungseintrag des Onboarding-Ergebnisses, nicht in `S.exercises`).
- Plan-Untertitel: „Fokus: Brust & Arme" / „Focus: chest & arms".

### 3. Dauer

Ziel-Übungszahl pro Trainingstag **nach** Fokus-Ergänzung: Kurz = 4 · Normal = 5 · Lang = 6–7.
Kürzen entfernt Isolationsübungen von hinten, **nie** Fokus-Übungen und nie die erste
Verbundübung. Auffüllen (Lang) nimmt zuerst aus den Fokus-Pools, sonst passende Isolation.

### 4. Equipment

- **Gym:** Splits unverändert.
- **Zuhause (Hanteln):** Ersatztabelle `HOME_SWAP`, u. a. Bankdrücken→Kurzhantel-Bankdrücken, Latzug→Klimmzüge, Rudern (LH)/T-Bar→Kurzhantel-Rudern, Beinpresse→Goblet Squat, Beinstrecker→Ausfallschritte, Beinbeuger→Rumänisches Kreuzheben, Trizepsdrücken (Kabel)→French Press, Butterfly/Kabelzug→Fliegende, Face Pulls→Reverse Flys, Cable Crunches→Crunches.
- **Körpergewicht:** Eigene Tagesdefinitionen aus dem Bodyweight-Pool (Liegestütze, Dips, Klimmzüge, Ausfallschritte, Bulgarian Split Squats, Hip Thrust, Plank, Seitlicher Plank, Crunches, Beinheben, Mountain Climbers, Hollow Hold …) im gewählten Split-Rhythmus.
- Defensiv: Übungsnamen, die nicht (mehr) in `EX_LIBRARY` existieren, fallen weg statt kaputte Einträge zu erzeugen.

### 5. Ziel-Einfluss

- **Stärker werden:** Verbundübungen stehen pro Tag vorn; Bibliotheks-Defaults (niedrige Wdh. bei Grundübungen) greifen.
- **Abnehmen / Fit bleiben:** letzte Isolationsübung des Tages wird durch einen Cardio-/Core-Slot ersetzt (Laufband, Seilspringen, Plank — equipmentabhängig).
- **Muskeln aufbauen:** Standard.
- Ziel erscheint im Ergebnis-Screen als Kontextzeile, beeinflusst sonst nichts weiter (bewusst schlank).

## i18n

- Alle neuen UI-Texte über die bestehende Sprachlogik (`GT_LANG`/`tr()`-Muster) mit DE- und EN-Fassung; keine hartkodierten deutschen Strings im Markup.
- Übungsnamen: deutsche Bibliotheksnamen, EN über vorhandene Übersetzungstabelle (Anzeige), unverändertes Verhalten.
- Mockup-Referenztexte EN: "What's your goal?", "Later", "Continue", "Build muscle" usw. (siehe `design-richtung-v4.html`).

## State & Persistenz

- Laufzeit: `_ob = { step, name, goal, exp, freq, prio: [], dur, equip, applied }`.
- Persistiert in `S`: bisher `userName/obGoal/obExp/obFreq` + neu `obPrio` (Array, max 2, z. B. `["brust","arme"]`), `obDur` (`kurz|normal|lang`), `obEquip` (`gym|home|body`), `obPushChoice` (`granted|denied|later|null`).
- `S.onboarded`/`S.welcomeShown`-Semantik unverändert; `maybeStartOnboarding`-Bedingungen unverändert (Bestandsnutzer mit Sessions/Übungen sehen nichts).

## Edge Cases

- **Web/PWA:** Schritt 9 entfällt komplett (kein toter Button); Progress-Segmente dynamisch.
- **Push abgelehnt im iOS-Dialog:** normal weiter; `_pushReg`-Reset-Logik des Bestands bleibt.
- **Skip mittendrin:** wie bisher `_obClose` → Auth-Gate-Sicherheitsnetz → Soft-Paywall.
- **Zurück aus Schritt 10:** Antworten änderbar, Plan wird neu gebaut (keine Doppel-Anwendung: Anwendung erst bei CTA).
- **„Ausgewogen" + Gruppe gleichzeitig:** gegenseitig exklusiv in der UI.
- **Cloud-Merge nach Login:** Reihenfolge unverändert — Onboarding startet erst nach Merge (Bestandslogik `_postLoginFlow`).

## Nicht-Ziele

- Kein KI-/Server-generierter Plan (rein lokale Regeln).
- Keine Körperdaten-Abfrage (Größe/Gewicht) im Onboarding.
- `PLAN_TEMPLATES` + Template-Picker im Plan-Tab bleiben unverändert.
- Kein Umbau von Login-Gate, Soft-Paywall oder Update-Kampagnen-Logik.
- Coach-Hub-Design bleibt unberührt (läuft separat nach Live-Coach-Plan v2).

## Akzeptanzkriterien

1. Neuer Nutzer (DE + EN, Light + Dark, mind. 1 Alternativ-Akzent-Theme) durchläuft den Flow ohne Layout-Brüche; keine Emojis, keine Hex-Farben im neuen Code.
2. Jede Frequenz×Erfahrung-Kombination liefert den Split laut Matrix.
3. 2 Fokus-Gruppen → sichtbar mehr Volumen für diese Gruppen, Fokus-Übungen markiert; „ausgewogen" → unveränderter Basis-Split.
4. Kurz/Normal/Lang → 4/5/6–7 Übungen pro Trainingstag.
5. Home/Body → keine Gym-only-Übungen im Ergebnis.
6. Push-Schritt erscheint nur nativ; „Aktivieren" löst genau einmal den iOS-Dialog aus; beide Antworten führen weiter.
7. „Plan übernehmen" erzeugt den Wochenplan im Heute-Tab (über `_applyTemplateCore`-Pfad), inkl. korrekter Tage.
8. Skip an jedem Punkt → App voll nutzbar, kein halb angewendeter Plan.
9. Bestandsnutzer und Nutzer mit vorhandenen Daten sehen das neue Onboarding nicht.
