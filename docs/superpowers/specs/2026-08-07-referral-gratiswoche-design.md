# Referral: 1 Woche Premium gratis

**Datum:** 2026-08-07
**Status:** Design freigegeben, Umsetzung offen

## Ziel

Reichweite über Weiterempfehlung. Wer MyGymTrack an einen Freund weitergibt und
dessen Einlösung auslöst, bekommt 7 Tage Premium geschenkt — der geworbene Freund
ebenfalls. Einmalig pro Konto, nicht stapelbar.

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Auslöser | Freund löst den Code des Werbers ein (nicht: Antippen von „Teilen") |
| Belohnung | Beidseitig, je 7 Tage |
| Deckel | Einmalig pro Konto, lebenslang, für beide Rollen |
| Ort des Anspruchs | Cloudflare Worker `gymtrack-ai`, neuer KV-Namespace `gymtrack-ref` |

Bewusst offen gelassen: der Werber hat nach seiner einen Gratiswoche keinen
Anreiz mehr, weiter zu teilen. Bewusste Entscheidung des Auftraggebers; ein
Multiplikator (z. B. je Einlösung eine Woche bis max. 4) lässt sich später allein
im Worker nachziehen, ohne App-Update.

## Architektur

### Warum serverseitig

Premium ist heute rein lokal (`localStorage['gt_premium']`), Quelle der Wahrheit
ist StoreKit; der KI-Worker verifiziert Apples signierten Abo-Beweis (JWS) selbst.
Eine geschenkte Woche hat keinen JWS. Läge sie im Client oder in einem
client-beschreibbaren Firestore-Feld, könnte sich jeder Nutzer Premium und damit
das bezahlte KI-Kontingent selbst ausstellen. Cloud Functions existieren im
Projekt nicht, Firestore-Rules können den Fall nicht absichern.

Deshalb: neue Routen `/ref/*` im bestehenden `gymtrack-ai`-Worker. Der prüft
bereits Firebase-idTokens und nutzt KV — kein zweiter Deploy, kein neues Secret.

### KV-Schema (Namespace `gymtrack-ref`, Binding `REF`)

```
code:<CODE>  -> "<uid>"
u:<uid>      -> { code, trialExp, gotReward, usedCode, invited }
```

Beispiel mit erfundenen Werten:

```
code:A7K2QM          -> "uid_beispiel_123"
u:uid_beispiel_123   -> { "code":"A7K2QM", "trialExp":1786000000000,
                          "gotReward":true, "usedCode":null, "invited":2 }
```

- `code` — 6 Zeichen, Großbuchstaben und Ziffern
- `trialExp` — Millisekunden seit Epoch (gleiches Format wie `PREM.exp` im
  Bestand), 0 oder fehlend = kein Trial
- `gotReward` — true, sobald der Nutzer als Werber belohnt wurde
- `usedCode` — der eingelöste Code, sobald er als Geworbener eingelöst hat
- `invited` — Zähler eingelöster Einladungen (nur Anzeige)

### Routen

Alle Routen verlangen ein gültiges Firebase-idToken (bestehende Verifikation im
Worker wiederverwenden).

**`GET /ref/me`** → `{ code, trialExp, gotReward, usedCode, invited }`
Legt beim ersten Aufruf einen Code an. Bevorzugt den vom Client mitgeschickten
`friendCode` (6 Zeichen, existiert bereits im Nutzerdokument), falls
`code:<CODE>` noch frei ist — dann hat der Nutzer nur einen Code für Freunde und
Einladung. Sonst zufälliger Code mit Kollisionsprüfung.

**`POST /ref/redeem`** `{ code }` → `{ ok, trialExp, referrerRewarded }` oder
`{ ok:false, reason }`. Prüft in dieser Reihenfolge:

1. `code:<CODE>` existiert → sonst `reason:'unknown'`
2. Werber-uid ≠ eigene uid → sonst `reason:'self'`
3. eigener Datensatz hat kein `usedCode` → sonst `reason:'already_redeemed'`
4. Werber hat kein `gotReward` → sonst `ok:true, referrerRewarded:false`
   (Einlösung gilt trotzdem: der Geworbene bekommt seine Woche, nur der Werber
   nicht noch eine.)

Danach schreibt der Worker beiden Seiten `trialExp = now + 7*864e5`, setzt beim
Geworbenen `usedCode`, beim Werber `gotReward` und erhöht dessen `invited`.
Reihenfolge: erst `usedCode` des Geworbenen setzen (Sperre), dann gutschreiben —
so kann ein Doppelklick oder ein zweites Gerät nicht zweimal gutschreiben.

**`GET /ref/status`** → `{ trialExp, gotReward, usedCode, invited }`
Wird beim Login und beim App-Start geholt, höchstens einmal pro Stunde.

### KI-Worker

Die bestehende Premium-Prüfung bekommt einen zweiten Zweig: liegt kein gültiges
Apple-JWS vor, wird `REF` gelesen — ein `trialExp` in der Zukunft zählt als
Premium. Damit läuft der KI-Coach in der Gratiswoche wirklich, inklusive der
bestehenden Kontingent-Zählung.

### Client

`PREM` bekommt die Quelle `src:'trial'`:

```js
PREM = { active:true, plan:'trial', exp:trialExp, jws:null, src:'trial' }
```

`isPremium()` akzeptiert das, **ohne** die 3-Tage-Kulanz, die für echte Abos gilt
(sonst würden aus 7 Tagen 10). Der lokale Wert ist nur Anzeige; die teure Seite
(KI) prüft der Worker ohnehin selbst. `premRefreshUI()` wird nach Einlösung und
nach `/ref/status` aufgerufen.

`_premApply()` darf einen laufenden Trial nicht löschen: die StoreKit-Antwort
`status:'none'` setzt heute `PREM` komplett zurück. Künftig bleibt ein noch
gültiger Trial dabei erhalten.

## UI

### Paywall (`_pwRender` in `js/app-coach.js`)

Zwischen Showcase-Karussell (`pw2-show`) und Preisblock (`pw2-bot`) ein Banner,
drei Zustände:

| Zustand | Inhalt |
|---|---|
| Belohnung offen | „🎁 1 Woche Premium gratis — Freund einladen, beide bekommen sie" → öffnet `ov-invite` |
| Trial läuft | „Deine Gratis-Woche läuft noch X Tage" (Kauf-CTA bleibt sichtbar) |
| Belohnung verbraucht | Banner entfällt |

Der Banner wird in `_pwRender` und `_pwRenderBot` mitgezeichnet, damit er nach
einer Statusänderung ohne Neuöffnen stimmt.

### Sheet `ov-invite`

Aufbau nach dem Muster des Crew-Teilens (`js/app-crew.js`):

- Code groß dargestellt, Tap kopiert (wie `crewCopyCode`)
- Primärbutton „Einladung teilen" → `navigator.share({ text })` mit Text +
  `GT_WEB + '/?ref=' + code`, Fallback Zwischenablage + Toast
- QR-Toggle über den bestehenden Lazy-Loader für `qrcodejs`
- Drei-Schritte-Erklärung
- Statuszeile: Anzahl Einladungen, Ablaufdatum des Trials

### Einstiegspunkte

1. Paywall-Banner
2. Zeile im Freunde-/Community-Bereich
3. Zeile in den Premium-Einstellungen (`renderPremiumSettings`)

### Einlösen

**Weg 1 — Link.** `?ref=CODE` bzw. `gymtrack://ref/CODE` wird beim Boot gemerkt,
exakt wie `?crew=CODE` in `js/app-boot.js`, und nach dem Login automatisch an
`/ref/redeem` geschickt. Erfolg → Toast, Premium sofort aktiv.

**Weg 2 — Tippen.** Optionaler Onboarding-Schritt „Einladungscode? (optional)"
nach dem Login und vor der Soft-Paywall, mit Überspringen. Zusätzlich eine Zeile
„Code einlösen" in den Premium-Einstellungen für alle, die den Schritt
übersprungen haben.

Jede Ablehnung des Workers wird im Klartext angezeigt, nie still verworfen:
unbekannter Code, eigener Code, bereits eingelöst.

### Web (Cloudflare Pages)

`gymtrack-9q9.pages.dev/?ref=A7K2QM` erkennt den Parameter außerhalb der nativen
App und zeigt eine Karte: Code groß, Kopieren-Button, App-Store-Link, Hinweis
„App laden, Code beim ersten Start eingeben". iOS liefert keinen
Install-Referrer — der Code muss die Installation überleben, deshalb muss die
Landeseite ihn sichtbar machen statt nur weiterzuleiten.

## Randfälle

- **Werber hat ein aktives Abo:** Gutschrift läuft trotzdem 7 Tage ab jetzt und
  verpufft. Aufheben für später wäre zusätzlicher Zustand und ist nicht gebaut.
- **Geworbener hat ein aktives Abo:** Einlösung zählt für den Werber, der
  Geworbene sieht „Du hast bereits Premium".
- **Eigener Code:** Ablehnung mit `reason:'self'`.
- **Trial abgelaufen:** `isPremium()` liefert false; beim ersten Start danach
  einmalig ein Hinweis „Deine Gratis-Woche ist vorbei" mit Paywall-Zugang.
- **Offline:** der lokale Cache trägt den Trial bis `exp`.
- **Zweitgerät:** `/ref/status` beim Login holt den Trial nach, kein erneutes
  Einlösen nötig.

## Sicherheit

- Jede `/ref/*`-Route verlangt ein gültiges idToken.
- Der Client kann `trialExp` nicht setzen; der KI-Worker liest immer KV.
- Einlösen ist gegen Doppelausführung gesperrt (Sperrfeld vor Gutschrift).
- Der Deckel selbst ist der Missbrauchsschutz: eine Woche pro Konto, lebenslang.
  Fake-Accounts bringen dem Werber nach der ersten Woche nichts.
- App-Store-Regeln: geschenkter Serverzugang umgeht kein IAP; die Paywall
  verweist weiterhin auf keinen externen Kaufweg.

## Test

**Worker** (`curl` mit echtem idToken): `/ref/me` legt einen Code an und ist
idempotent; `/ref/redeem` mit unbekanntem Code, eigenem Code, zweimal
hintereinander, mit bereits belohntem Werber; `/ref/status` nach Ablauf.

**App** (zwei Konten im Simulator, `~/.claude/sim-native.sh gymtrack`):
Link-Weg und Tipp-Weg, Paywall-Banner in allen drei Zuständen, KI-Anfrage
während des Trials, Verhalten nach Ablauf.

## Einmaliges Setup (Lenny)

1. Cloudflare → Workers & Pages → KV → Namespace `gymtrack-ref` anlegen.
2. Am Worker `gymtrack-ai`: Settings → Bindings → KV-Namespace binden,
   Variablenname exakt `REF`.
3. Worker neu deployen.

Kein neues Secret, kein neuer Account. Nachtragen in `PREMIUM-SETUP.md`.
