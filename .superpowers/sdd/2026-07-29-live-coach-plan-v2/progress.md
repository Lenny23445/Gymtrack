# SDD ledger — plan: docs/superpowers/plans/2026-07-29-live-coach-plan-v2.md

Rechner: Windows-PC (kein iOS-Simulator, kein Xcode). Simulator-Schritte des
Blockabschluss-Rituals sind hier nicht ausfuehrbar — Ersatz: Chromium/Puppeteer.
Branch: main (Plan-Constraint "Auto-Push nach origin/main", alle Vor-Tasks liegen dort).
Achtung: ein Autosync-Job committet und pusht im Hintergrund; er hat Task 8 als
"autosync: rechner 2026-07-30 12:08" (83e9c2b) eingefangen.

Task 1: complete (Vorsession, 24b380d, 7a84e13, 6d1063e) — Pro-Nutzer-Budget im Worker
Task 2: complete (Vorsession, 33c2c79, 9b7d667) — geteilter Antwort-Cache
Task 3: complete (Vorsession, 42f59b9, 7c92fd7, 27074de, 4a7a41b, 37792b4) — Router 8 -> 20 Fragen
Task 4: complete (Vorsession, b270009, da1d345) — Begruendungs-Intent "Warum 62,5?"
Task 5: complete (Vorsession, b591e43, 4c0c26b) — kontextabhaengige Frage-Chips
Blockabschluss 0: complete (Vorsession, 66a8196, 94507c9, cebe380, bf7f3f7)
Task 6: complete (Vorsession, 067664d) — js/coach-persona.js, 24 Schluessel x 4 Toene x 2 Sprachen
Task 7: complete (9a37cea) — Persona-Felder, Profile, live/inTraining-Invariante.
  Verifikation: 221 Tests gruen + 12/12 Chromium-Checks (Konsolentabelle des Plans).
Task 8: complete (83e9c2b, Message vom Autosync gekapert) — Name ersetzt "KI-Coach".
  Befund im Zug behoben: _aicSig-Cache enthielt den Namen nicht.
  Verifikation: 221 Tests gruen + 6/6 Chromium-Checks.

Task 9: implementiert (9605d2e, BASE 83e9c2b) — Coach-Hub, 341 Zeilen index.html.
Task 9: Review 1 (opus, read-only): Spec OK mit zwei begruendeten Abweichungen
  (until existiert im Dossier nicht -> aus ts+STALE_MS abgeleitet; Weiche auf
  Task 10 zusaetzlich mit typeof-Pruefung). Qualitaet NICHT approved:
  0 Critical, 4 Important, 5 Minor.
Task 9: Entscheidung des Nutzers zu Befund 1 (plan-mandated conflict:
  Gestaltungsregel 1 vs. insights-Schalter in der Feinjustierung):
  Karte bleibt Zugang — insights:false blendet nur den Empfehlungsinhalt aus,
  schmale Karte mit Coach-Namen bleibt als Eintritt stehen.
Task 9: minor (deferred): Chat-Vorschau im Hub rendert Markdown roh (esc() statt
  _aicMd(), index.html:23896) — im echten Chat fett, im Hub Sternchen-Text.
Task 9: minor (deferred): erfundene Beispielzahlen in _say('mid',{vol:4200,pct:104})
  (index.html:24017) sehen wie echte Nutzerwerte aus, nicht vom Brief verlangt.
Task 9: minor (deferred): Journal ist stumm ein Konto-Feature — ohne Anmeldung
  vier Mal "Noch nichts notiert.", kein Hinweis auf das fehlende Konto (:24425).
Task 9: minor (deferred): Tap-Ziel der Karte ohne role="button"/tabindex/Key-Handler
  (:10858); #ch-body role="tabpanel" ohne aria-labelledby, Reiter ohne aria-controls.
Task 9: minor (deferred): "Bestaetigung faellig" bei ts===0 ist eine Sackgasse —
  die App hat keinen Bestaetigungsweg (:23921).
Task 9: minor (deferred): YAGNI — zweite Live-Beispielzeile #ch-tone-ex (id von
  keinem JS gelesen), Journal-Intro-Zeile, "notiert am"-Meta, .ch-jrn.ghost.
Task 9: fix round 1/5 (4 addressed, 0 open — insights-Karte bleibt Zugang,
  Tipp nach Namensfeld zaehlt, GT_LANG im Hub, details bleibt offen;
  commits 9605d2e..2bd4265). Re-Review (sonnet): alle vier ADDRESSED, keine
  neuen Schaeden, alle fuenf neuen Checks fangen ihren Befund nachweislich.
Task 9: complete (commits 83e9c2b..2bd4265, review clean nach Runde 1)
  Testevidenz: Node 221/221, Chromium 20/20 (vorher 15/20 rot).

Querschnitt-Fix (6161d74, 38ba48a — Messages vom Autosync gekapert):
  _lang() folgt jetzt GT_LANG statt nur localStorage['gt_lang'], damit Coach-Saetze
  der angezeigten Sprache folgen (auch Geraetesprache bei Einstellung 'auto').
  Der Umweg _chLang/_chSay aus Task 9 wurde dabei entfernt (war 1:1 Duplikat).
  Einziger Aufrufer von _lang() ist _say(), nur zur Laufzeit — nie vor GT_LANG (:7466).
  Evidenz: lang-check 2/4 rot -> 4/4 gruen, Node 221/221, task-9-check 20/20.

Task 10: implementiert (49e9e59, 0a650ec, cd471f6, 6fdd834, 82be534 — alle Messages
  vom Autosync gekapert; BASE 38ba48a, +319/-33). Einrichtung ov-coach-setup,
  drei Schritte, Kaufpfad verdrahtet. Node 221/221, task-10-check 1/21 rot -> 21/21,
  task-9-check 20/20.
  Zwei echte Befunde beim Bauen gefunden und behoben: (1) die IDs cs-title/cs-name/
  cs-body gehoeren dem Eigener-Split-Editor — die Einrichtung schrieb ins fremde
  Formular; Praefix jetzt cst-. (2) Ein Sammel-Zuhoerer haengt closeOv an JEDES .ov,
  fehlendes onclick im Markup reicht nicht; jetzt dokumentierte Ausnahme.
  task-9-check.js musste angepasst werden (Pruefprofil ohne preset loeste die neue
  Weiche aus) — der Reviewer beurteilt, ob das die Aussagekraft senkt.

Unattribuierte Hub-Politur im selben Diff: feste Sheet-Hoehe + innerer Scroller,
  Segmented-Control-Reiter, .ch-voice-Sprechblasen, .aic-orb im Kopf, groessere
  Trefferflaeche am Loeschknopf. Lag beim Start von Task 10 unfertig im Arbeitsbaum,
  von keinem Brief gedeckt, ungereviewt mitgelaufen. Nutzer bestaetigt: kein zweiter
  Rechner, keine Mac-Session — also Rest eines abgeschlossenen Agenten dieser Session.
  Wird im Task-10-Review mitgeprueft.
Entscheidung des Nutzers: Autosync laeuft weiter, History wird NICHT umgeschrieben.
  Zuordnung Commit -> Task steht deshalb nur hier im Ledger.

Task 10: Review 1 (opus, read-only): Spec OK (jede Brief-Anforderung erfuellt, kein
  YAGNI im Task-10-Code). Qualitaet NICHT approved: 1 Critical, 2 Important, 3 Minor.
  Critical 1: bei 390x844 liegt "Weiter" in Schritt 1 35 px unter dem Rand (Inhalt
    936 px bei 775 px Sichthoehe) — Nutzer tippt ✕, preset faellt auf balanced,
    genau das Ergebnis, das die Task verhindern soll. Mitursache: Politur-Masse.
  Important 1: Endlosschleife, wenn setCoachPreset() still ausfaellt (ohne
    CoachPersona.PRESETS bleibt preset undefined -> Weiche startet Einrichtung neu,
    Hub unerreichbar). Empirisch reproduziert.
  Important 2: #ch-body ist seit der festen Sheet-Hoehe der Scroller, renderCoachHub()
    setzt scrollTop=0 bei JEDEM Rerender -> jeder Schalter springt an den Anfang.
    Regression aus der unattribuierten Politur.
Task 10: minor (deferred): coachSetupStep(2.5) passiert die Wache (Number statt
  Integer-Pruefung) -> Navigation tot; heute kein realer Aufrufer.
Task 10: minor (deferred): coachSetupDone() ohne Argument gilt als Ueberspringen
  (skipped === false ist strikt) — kuenftiger Aufrufer verliert die Hub-Uebergabe.
Task 10: minor (deferred): totes CSS .ch-sec i (:5225).
Task 10: minor (deferred, Testqualitaet): der Check "custom fragt nicht erneut"
  unterscheidet !preset und === undefined nicht (beide Werte wahrheitswertig);
  der Namens-Check belegt safeName() im Modul, nicht esc() an der Renderstelle.
Task 10: PARKIERT zur Entscheidung beim Blockabschluss: das Segmented Control
  (:5208) ist ein Bedienidiom, das die App sonst nirgends hat — dieselbe Sache
  ("eins von N waehlen") sieht im selben Sheet zweimal verschieden aus (oben
  Traeger-mit-Pillen, unten .pwz-chip-Reihe). Spannung mit Gestaltungsregel 7.
  Ebenso: feste Sheet-Hoehe 658 px auf allen vier Reitern laesst auf "Woche"
  (eine Zeile) und "Chat" (zwei Zeilen) den groesseren Teil leere Glasflaeche.
Task 10: fix round 1/5 (4 addressed, 0 open — klebende Fussleiste #cst-nav ausserhalb
  #cst-body statt der zwei vorgeschlagenen Wege, beide vom Implementer mit Messung
  verworfen; Doppel-Rueckfall + Schleifenwaechter gegen das Einsperren; Scrollposition
  wird gesichert und zurueckgeschrieben, Reset nur beim Reiterwechsel; .ch-voice auf
  --inp-bg/--gl-bdr; commit c8ddb0b).
  Re-Review (sonnet, Zahlen unabhaengig nachgefahren): alle ADDRESSED, keine neuen
  Schaeden. Messung nach dem Fix: 3 Schritte x 390x844 und 375x667, ganzImBild true,
  trefferIstAktion true (elementFromPoint auf Buttonmitte trifft den Button).
Task 10: complete (commits 38ba48a..c8ddb0b, review clean nach Runde 1)
  Testevidenz: Node 221/221, task-10-check 26/26 (vorher 22/26), task-9-check 20/20.

BLOCK 1 fertig gebaut (Tasks 6-10). Blockabschluss-Ritual laeuft:
  1. Testlauf komplett — OK (221/221 + 26/26 + 20/20)
  2. Nativer Durchlauf im Simulator — NICHT MOEGLICH auf Windows (Ersatz: Chromium)
  3. Screenshot — Puppeteer-Belege, werden nach der Block-Review neu gezogen
  4. Eigenstaendige Review-Runde ueber bf7f3f7..c8ddb0b — DURCH (opus):
     NICHT abnahmefaehig. Kein Critical, 2 Important, 4 Minor.
     Important 1: der live-Schalter in den Premium-Einstellungen (:24497) zerstoert
       Stufe und Profil. close -> live aus -> live ein ergibt
       {preset:'custom', inTraining:'key', pushLevel:'eng'} — Mischzustand, den kein
       Profil beschreibt. Vor dem Block war live ein reiner Boolean, aus/ein
       verlustfrei; die Invariante aus Task 7 hat daraus einen Datenverlust gemacht.
     Important 2: vier Schalter ohne Verbraucher — setFeedback (Einzeiler),
       inTraining key/full (Block 3), pushLevel (Block 4), voiceOn (Block 2 gestrichen).
     Minor: goal im Journal unuebersetzt; setAiCoachOpt/setCoachPreset ohne aeusseres
       try/catch (persist() ungedeckelt); Einrichtung kann laufendes Training
       verdraengen (Kauf mitten in der Einheit, Regel 2); Kommentar in
       coach-persona.js:86-88 behauptet einen Test fuer Regel 8, den es nicht gibt.
     Sauber geprueft: XSS an jeder innerHTML-Stelle, keine Emojis (ausser ✕),
       kein save(), kein neuer Firestore-Pfad, Zeitstempel, Modul-Bauart, _lang(),
       build.js und sw.js tragen coach-persona.js korrekt, Script-Tag an richtiger
       Stelle. Regel 1 mit Vor/Nach-Beleg: #pg-heute in bf7f3f7 und HEAD je 120 Tags,
       nach Abzug von style/onclick zeichenweise identisch; genau eine .aic-Karte,
       fuenf Tab-Knoepfe wie vorher. Die einzigen zwei Deltas: das Wort auf der
       Karte und cursor:pointer.
     Regel 4 nicht eingehalten (key und full sind ununterscheidbar, kein Zaehler —
       kommt laut Plan mit js/coach-session.js in Block 3).
     Regel 7 verletzt (.ch-tabs Segmented Control gegen .pwz-chip-Reihe im selben
       Sheet fuer dieselbe Bedienabsicht).
     GROESSTE TESTLUECKE: die Invariante und ihre Migration haben gar keinen Test —
       genau der Pfad, der beim Update ueber die Daten JEDES Bestandsnutzers laeuft,
       und genau die Luecke, durch die Important 1 gekommen ist.
  4b. Entscheidungen des Nutzers zur Review:
     - Schritt 2 der Einrichtung (Stimme) fliegt raus, Einrichtung wird zweistufig;
       Datenfeld voiceOn bleibt, nur unsichtbar, Block 2 haengt es spaeter wieder ein.
     - Nur setFeedback wird verdrahtet; key/full und pushLevel bleiben sichtbar,
       weil Block 3 und 4 direkt folgen.
  4c. EINE Fix-Welle laeuft (Important 1 + 2, Schritt-2-Entfernung, neun
     Triage-Punkte, plus die Migrations- und Invarianten-Checks). Danach eine
     eng gefasste Nachpruefung, keine zweite Welle.
  5. Version + Changelog (cl-2026-07-29-coach-persoenlich) — offen, danach
  6. Commit + Push — offen
  7. Abnahme durch den Nutzer — offen; vorzulegen inkl. der geparkten
     Segmented-Control-Entscheidung

(historisch) Task 10: fix round 1/5 Auftrag war (Critical 1, Important 1, Important 2, plus
  .ch-voice auf --inp-bg/--gl-bdr und fuenf Suite-Luecken: Viewport-Check fuer
  alle drei Schritte bei 390x844 und 375x667, PRESETS-Ausfall, Scrollposition,
  Emoji-Riegel auf \p{Extended_Pictographic} mit Ausnahme fuer ✕,
  Verhaltenstest am Hintergrund-Tipp eines fremden Overlays).

BLOCK 3 (Tasks 13-17) gebaut. Vorgehen auf Wunsch des Nutzers beschleunigt:
  Tasks 13-16 sind eigenstaendige Module unter js/ und beruehren index.html nicht —
  vier Implementer parallel, danach Task 17 (Verdrahtung) allein. Die Sequenz-Regel
  des Plans begruendet sich ausdruecklich mit Konflikten in index.html, greift also
  fuer reine Module nicht.
Task 13: complete (321c965) coach-session.js, 32 Tests — CAP off 0 / key 4 / full 8.
Task 14: complete (16a9bee) coach-warmup.js + coach-cues.js, 28 Tests —
  Scheiben paarweise, 54 Cue-Schluessel auf 28 Hinweise, DE und EN vollstaendig.
Task 15: complete (a33c290) coach-rpe.js, 29 Tests.
Task 16: complete (33a612f) coach-analyze.js, 39 Tests + eigene Mutationsprobe.
Modul-Review (opus, alle vier auf einmal): 1 Critical, 7 Important, 8 Minor.
  Critical: Platzhalter ohne Wert -> "zuletzt kg bei 8 Wiederholungen" bei JEDER
    erstmals gefahrenen Uebung. 28 Mutationen gefahren, 5 ueberlebten.
  Important u.a.: Obergrenze lebte nur im Arbeitsspeicher (Neuladen -> 15 statt 8
    Aeusserungen); emit(force) oeffentlich (13 statt 8); step bedeutete in zwei
    Modulen zwei verschiedene Dinge (nicht auflegbare Vorschlaege); setAckHard
    behauptete "Gewicht bleibt" waehrend die Rechnung senkt; plateauSay verschrieb.
Task 17: complete (678e3f5) Verdrahtung, 23/23 Browser-Checks, offline geprueft.
  Eigener Fund: der Erzaehlbogen brach in der Mitte ab (alle Feinheiten fallen beim
  Oeffnen einer Uebung an, mid/fatigue erst spaeter) -> Rueckhalt CS_RESERVE=2.
Fix-Welle Module: complete (2ef1fe9) — alle Befunde, 407/407 gruen, 14 Mutationen,
  0 ueberlebt. Neu: sessionResume(saved, wkTs), adjustNext(kg, answer, step, barKg),
  roundToPlate liefert null statt still das Stangengewicht.
Entscheidung des Controllers (einzeilig revidierbar): Boden von 1,25 kg je Seite fuer
  die Gewichtsanpassung, weil die kleinste Scheibe im Standardsatz 0,5 kg ist und
  "schwer" sonst 50 auf 49,5 kg bewegt. Feine Scheiben bleiben fuers Aufwaermrunden.
OFFEN fuer den Blockabschluss: der Satzkatalog schreibt "kg" fest — lbs-Nutzer hoeren
  in greet/exOpen/restNext/setAck die falsche Einheit. Block-uebergreifend.
Blockabschluss 3 laeuft: Review ueber 567bb69..2ef1fe9 (opus). Danach Version-Bump
  auf gymtrack-v202607300002, Changelog-Key cl-2026-07-29-coach-training.

Blockabschluss 3: complete (c52f8a3 Fix-Welle, 5728746 Version + Changelog).
  Alle Befunde der Abschluss-Review behoben, beide ueberlebenden Mutationen tot.
  Version gymtrack-v202607300002 in index.html und sw.js:2 identisch.
  Plan-Zusatzpruefung erfuellt: kein fetch/AI_WORKER_URL/XMLHttpRequest in den
  fuenf Block-3-Modulen — Block 3 kostet nichts pro Nutzer.
  Entscheidungen der Fix-Welle: Geraet aus showPlateCalc, sonst CoachCues.equipFor,
  im Zweifel keine Stange; Boden 1,25 kg je Seite; Bilanz steht im Check-in-Sheet;
  Quittung zaehlt nicht gegen CAP, eigener Deckel ACK_CAP=3; Pausen werden gemessen
  (set.rs), ohne Messung neuer Schluessel plateauPlain; Einheit aus dem Katalog
  heraus an den Wert (lbs-Nutzer sehen lbs).

BLOCK 4:
Task 18: complete (83bba21) js/coach-notify.js, 36 Tests, Gesamt 462.
  Mutationsprobe 26 Mutationen, 0 ueberlebt (nach zwei nachgezogenen Tests).
  Signaturen tragen optionales tzOffsetMin; ohne Durchreichen rechnet der
  Tagesdeckel in UTC und ein Nutzer auf UTC+9 bekaeme das doppelte Tagesbudget.
Task 19: gebaut und gepusht (f63f671, +466 Zeilen index.html, sw.js, build.js).
  task-19-check 18/18, task-17 23/23, block3-fix 21/21, task-10 41/41, task-9 20/20,
  Node 462/462 — vom Controller nachgefahren.
  ACHTUNG: der Agent wurde beim Committen gestoppt (Nutzer hat abgebrochen), bevor
  er seinen Report schrieb. Der Code ist vollstaendig und gruen, aber es gab
  KEINE Review von Task 19 und keinen Bericht ueber die getroffenen Entscheidungen.

=== HIER GEHT ES WEITER ===
1. Review von Task 19 (read-only, opus) ueber 83bba21..f63f671 — sie fehlt als
   einzige. Fokus laut Auftrag: kein zweiter Zustellweg neben sw.js:52, Deckel
   greift, Nachtfenster, Zeitzone durchgereicht, keine Emojis in Titel/Text,
   S.coachPush bleibt lokal, persist() statt save(), jeder Einstieg in try/catch.
2. Blockabschluss 4: Ritual, Version gymtrack-v202607300003, Changelog-Key steht
   im Plan unter "Blockabschluss 4".
3. Block 5 (Tasks 20, 21, 22): coach-report.js, Bericht erzeugen/planen/anzeigen,
   Datentrennung und Kontowechsel. Dabei zusammenfuehren: index.html getWeekKey()
   liefert 2026-W5 ohne fuehrende Null, der Plan und alle Coach-Module rechnen ISO
   2026-W05. Zwei Formate in einer App, gehoert laut Review vor Block 5 geklaert.

Offen aus frueheren Reviews, vor Block 5 zu beheben (Triage der Block-3-Review):
  - setAiCoachOpt/setCoachPreset ohne aeusseres try/catch (persist() ungedeckelt)
  - erfundene Beispielzahlen in _say('mid',{vol:4200,pct:104}) im Hub
  - Kommentar coach-persona.js:86-88 behauptet einen Test fuer Regel 8, den es
    nicht gibt
  - PARKIERT: Segmented Control der Hub-Reiter gegen die .pwz-chip-Reihe im selben
    Sheet (Gestaltungsregel 7); wird mit jedem Block teurer

BLOCK 2 (Tasks 11 + 12, Stimme) WIRD UEBERSPRUNGEN — Entscheidung des Nutzers
  2026-07-30: TtsPlugin.swift, Info.plist und AVSpeechSynthesizer gehen nur am Mac.
  Folge fuer Block 3: der Plan hatte Block 2 zuerst gestellt, weil Block 3 Saetze
  produziert, die vorgelesen werden koennen sollen. Block 3 darf speak() daher NICHT
  voraussetzen — jede Nutzung nur ueber typeof-Pruefung in try/catch, damit der Mac
  Block 2 spaeter nachschieben kann, ohne Block 3 anzufassen.
  Ebenso bleibt Schritt 2 der Einrichtung (Task 10) bei "nur Schalter, keine
  Stimmenliste"; der Aufruf _csRenderVoices(el) steht dort schon mit typeof-Pruefung.
  Die JS-Haelfte (Task 12, js/coach-voice.js + Sprech-Button) waere auf Windows
  baubar — bewusst nicht gebaut, bis der Nutzer es verlangt.

ERLEDIGT, war quer zu allen Bloecken (aufgedeckt in Task 9, Ursache in Task 7):
  _lang() prueft nur localStorage['gt_lang']==='en'. Bei gt_lang='auto' auf
  englischem Geraet liefert GT_LANG 'en', _lang() aber 'de' — Oberflaeche
  englisch, Coach-Saetze deutsch. Betrifft JEDE _say()-Stelle (Live-Leiste,
  Satz-Rueckmeldung, spaeter Stimme/Push/Bericht). Muss vor Blockabschluss 1
  weg, sonst baut Block 2-5 darauf auf.
