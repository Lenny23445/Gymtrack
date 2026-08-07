# Referral: 1 Woche Premium gratis

**Datum:** 2026-08-07
**Status:** Design freigegeben, Umsetzung offen

## Ziel

Reichweite über Weiterempfehlung. Wer MyGymTrack an einen Freund weitergibt und
dessen Einlösung auslöst, bekommt 7 Tage Premium geschenkt — der geworbene Freund
ebenfalls. Als Werber bis zu zweimal, also höchstens 2 Wochen insgesamt.

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Auslöser | Freund löst den Code des Werbers ein (nicht: Antippen von „Teilen") |
| Belohnung | Beidseitig, je 7 Tage |
| Deckel | Werber: 2 Einlösungen, zusammen 2 Wochen. Geworbener: einmalig 1 Woche |
| Stapeln | Läuft schon eine Gratiswoche, hängen die 7 Tage hinten dran |
| Ort des Anspruchs | Cloudflare Worker `gymtrack-ai`, neuer KV-Namespace `gymtrack-ref` |

Der Deckel steht allein im Worker (`REF_MAX_REWARDS`, Default 2) und lässt sich
später ohne App-Update verschieben.

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
u:<uid>      -> { code, trialExp, rewards, usedCode, invited }
```

Beispiel mit erfundenen Werten:

```
code:A7K2QM          -> "uid_beispiel_123"
u:uid_beispiel_123   -> { "code":"A7K2QM", "trialExp":1786000000000,
                          "rewards":1, "usedCode":null, "invited":1 }
```

- `code` — 6 Zeichen, Großbuchstaben und Ziffern
- `trialExp` — Millisekunden seit Epoch (gleiches Format wie `PREM.exp` im
  Bestand), 0 oder fehlend = kein Trial
- `rewards` — Anzahl bereits gutgeschriebener Gratiswochen als Werber, Deckel
  `REF_MAX_REWARDS` (Worker-Variable, Default 2)
- `usedCode` — der eingelöste Code, sobald er als Geworbener eingelöst hat
- `invited` — Zähler eingelöster Einladungen (nur Anzeige)

### Routen

Alle Routen verlangen ein gültiges Firebase-idToken (bestehende Verifikation im
Worker wiederverwenden).

**`GET /ref/me`** → `{ code, trialExp, rewards, maxRewards, usedCode, invited }`
Legt beim ersten Aufruf einen Code an. Bevorzugt den vom Client mitgeschickten
`friendCode` (6 Zeichen, existiert bereits im Nutzerdokument), falls
`code:<CODE>` noch frei ist — dann hat der Nutzer nur einen Code für Freunde und
Einladung. Sonst zufälliger Code mit Kollisionsprüfung.

**`POST /ref/redeem`** `{ code }` → `{ ok, trialExp, referrerRewarded }` oder
`{ ok:false, reason }`. Prüft in dieser Reihenfolge:

1. `code:<CODE>` existiert → sonst `reason:'unknown'`
2. Werber-uid ≠ eigene uid → sonst `reason:'self'`
3. eigener Datensatz hat kein `usedCode` → sonst `reason:'already_redeemed'`
4. `rewards < REF_MAX_REWARDS` beim Werber → sonst `ok:true,
   referrerRewarded:false` (Einlösung gilt trotzdem: der Geworbene bekommt seine
   Woche, nur der Werber ist am Deckel)

Danach schreibt der Worker beiden Seiten sieben Tage gut, gestapelt an eine
eventuell noch laufende Gratiswoche:

```js
trialExp = Math.max(Date.now(), rec.trialExp || 0) + 7 * 864e5
```

Beim Geworbenen wird zusätzlich `usedCode` gesetzt, beim Werber `rewards` und
`invited` erhöht. Reihenfolge: erst `usedCode` des Geworbenen setzen (Sperre),
dann gutschreiben — so kann ein Doppelklick oder ein zweites Gerät nicht zweimal
gutschreiben.

**`GET /ref/status`** → `{ trialExp, rewards, maxRewards, usedCode, invited }`
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
| `rewards == 0` | „🎁 1 Woche Premium gratis — Freund einladen, beide bekommen sie" → öffnet `ov-invite` |
| `rewards == 1`, Trial läuft | „Gratis-Premium noch X Tage — eine weitere Woche ist drin" → öffnet `ov-invite` |
| Deckel erreicht, Trial läuft | „Deine Gratis-Wochen laufen noch X Tage" (Kauf-CTA bleibt sichtbar) |
| Deckel erreicht, Trial vorbei | Banner entfällt |

Der Banner wird in `_pwRender` und `_pwRenderBot` mitgezeichnet, damit er nach
einer Statusänderung ohne Neuöffnen stimmt.

### Sheet `ov-invite`

Aufbau nach dem Muster des Crew-Teilens (`js/app-crew.js`):

- Code groß dargestellt, Tap kopiert (wie `crewCopyCode`)
- Primärbutton „Einladung teilen" → `navigator.share({ text })` mit Text +
  `GT_WEB + '/?ref=' + code`, Fallback Zwischenablage + Toast
- QR-Toggle über den bestehenden Lazy-Loader für `qrcodejs`
- Drei-Schritte-Erklärung
- Statuszeile: „X von 2 Gratis-Wochen geholt · aktiv bis TT.MM." plus Anzahl
  eingelöster Einladungen

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

- **Werber hat ein aktives Abo:** Gutschrift läuft trotzdem ab jetzt und
  verpufft. Aufheben für später wäre zusätzlicher Zustand und ist nicht gebaut.
- **Geworbener hat ein aktives Abo:** Einlösung zählt für den Werber, der
  Geworbene sieht „Du hast bereits Premium".
- **Eigener Code:** Ablehnung mit `reason:'self'`.
- **Zweite Einlösung während laufender Woche:** die 7 Tage hängen sich hinten an
  (`max(now, trialExp) + 7 Tage`), es geht keine Zeit verloren.
- **Zweite Einlösung nach Ablauf:** `trialExp` liegt in der Vergangenheit,
  gerechnet wird ab jetzt — daher `max(now, …)`.
- **Trial abgelaufen:** `isPremium()` liefert false; beim ersten Start danach
  einmalig ein Hinweis „Dein Gratis-Premium ist vorbei" mit Paywall-Zugang.
- **Offline:** der lokale Cache trägt den Trial bis `exp`.
- **Zweitgerät:** `/ref/status` beim Login holt den Trial nach, kein erneutes
  Einlösen nötig.

## Sicherheit

- Jede `/ref/*`-Route verlangt ein gültiges idToken.
- Der Client kann `trialExp` nicht setzen; der KI-Worker liest immer KV.
- Einlösen ist gegen Doppelausführung gesperrt (Sperrfeld vor Gutschrift).
- Der Deckel selbst ist der Missbrauchsschutz: höchstens 2 Wochen pro Konto,
  lebenslang. Wer Fake-Accounts anlegt, holt sich damit zwei Wochen und danach
  nichts mehr — der Aufwand lohnt nicht.
- App-Store-Regeln: geschenkter Serverzugang umgeht kein IAP; die Paywall
  verweist weiterhin auf keinen externen Kaufweg.

## Test

**Worker** (`curl` mit echtem idToken): `/ref/me` legt einen Code an und ist
idempotent; `/ref/redeem` mit unbekanntem Code, eigenem Code, zweimal
hintereinander; zweite Einlösung bei laufendem Trial (Ergebnis muss 14 Tage ab
Start sein, nicht 7); dritte Einlösung am Deckel (`referrerRewarded:false`,
`trialExp` unverändert); `/ref/status` nach Ablauf.

**App** (drei Konten im Simulator, `~/.claude/sim-native.sh gymtrack`):
Link-Weg und Tipp-Weg, Paywall-Banner in allen vier Zuständen, KI-Anfrage
während des Trials, Verhalten nach Ablauf.

## Einmaliges Setup (Lenny)

1. Cloudflare → Workers & Pages → KV → Namespace `gymtrack-ref` anlegen.
2. Am Worker `gymtrack-ai`: Settings → Bindings → KV-Namespace binden,
   Variablenname exakt `REF`.
3. Worker neu deployen.

Optional: Variable `REF_MAX_REWARDS` am Worker setzen, um den Deckel später ohne
App-Update zu verschieben (Default 2).

Kein neues Secret, kein neuer Account. Nachtragen in `PREMIUM-SETUP.md`.
