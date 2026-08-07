# Referral: Gratis-Premium durch Einladung

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
| Deckel Werber | 2 Einlösungen, zusammen 2 Wochen |
| Deckel Code | Nach 2 Einlösungen ist der Code tot — auch für Fremde |
| Deckel Geworbener | Einmalig 1 Woche, danach nie wieder |
| Stapeln | Läuft schon eine Gratiswoche, hängen die 7 Tage hinten dran |
| Anonyme Konten | Kein Trial. Einlösen nur mit Google- oder Apple-Konto |
| KI im Trial | Eigenes Kontingent von 15 Anfragen, eigener Kostentopf |
| Ort des Anspruchs | Cloudflare Worker `gymtrack-ai`, neuer KV-Namespace `gymtrack-ref` |

Der Code-Deckel ist die zentrale Missbrauchsbremse: ein öffentlich geposteter
Code bringt nach zwei Einlösungen niemandem mehr etwas. Ohne ihn könnte ein
einzelner Code auf TikTok beliebig vielen Fremden Gratis-Premium samt KI
verschaffen.

## Architektur

### Warum serverseitig

Premium ist heute rein lokal (`localStorage['gt_premium']`), Quelle der Wahrheit
ist StoreKit; der KI-Worker verifiziert Apples signierten Abo-Beweis (JWS) selbst
(`ai-worker/worker.js`, Schritt 2 im Haupt-Handler). Eine geschenkte Woche hat
keinen JWS. Läge sie im Client oder in einem client-beschreibbaren
Firestore-Feld, könnte sich jeder Nutzer Premium und damit das bezahlte
KI-Kontingent selbst ausstellen. Cloud Functions existieren im Projekt nicht,
Firestore-Rules können den Fall nicht absichern.

Deshalb: neue Routen `/ref/*` im bestehenden `gymtrack-ai`-Worker. Der prüft
bereits Firebase-idTokens und nutzt KV — kein zweiter Deploy, kein neues Secret.

### KV-Schema (Namespace `gymtrack-ref`, Binding `REF`)

```
code:<CODE>  -> "<uid>"
u:<uid>      -> { code, trialExp, invited, usedCode, aiUsed }
```

Beispiel mit erfundenen Werten:

```
code:K7M2QX9         -> "uid_beispiel_123"
u:uid_beispiel_123   -> { "code":"K7M2QX9", "trialExp":1786000000000,
                          "invited":1, "usedCode":null, "aiUsed":3 }
```

- `code` — 7 Zeichen, Großbuchstaben und Ziffern, **zufällig vergeben**
- `trialExp` — Millisekunden seit Epoch (gleiches Format wie `PREM.exp` im
  Bestand), 0 oder fehlend = kein Trial
- `invited` — Zähler eingelöster Einladungen. Deckel `REF_MAX_REDEEMS`
  (Worker-Variable, Default 2). Da jede Einlösung genau eine Woche gutschreibt,
  ist `invited` zugleich die Zahl der Belohnungen — kein zweiter Zähler nötig.
- `usedCode` — der eingelöste Code, sobald der Nutzer als Geworbener eingelöst
  hat. Gesetzt = nie wieder einlösbar.
- `aiUsed` — verbrauchte KI-Anfragen im Trial, Deckel `TRIAL_LIMIT` (Default 15)

Alle Werte bekommen eine TTL von 400 Tagen, damit nichts unbegrenzt liegen
bleibt.

**Codes sind zufällig, der `friendCode` wird bewusst nicht wiederverwendet.**
Nähme der Worker einen vom Client geschickten `friendCode` entgegen, könnte ein
Angreifer den Code eines anderen Nutzers reservieren, bevor dieser das
Einladen-Sheet zum ersten Mal öffnet — alle Einlösungen liefen dann auf das
Konto des Angreifers. Sieben Zeichen halten den Coderaum außerdem vom
sechsstelligen Freundescode getrennt.

### Routen

Alle Routen verlangen ein gültiges Firebase-idToken. `verifyFirebaseToken()`
liefert heute nur die uid; für die Referral-Routen wird zusätzlich
`providerUserInfo` aus derselben `accounts:lookup`-Antwort ausgewertet.

**`GET /ref/me`** → `{ code, trialExp, invited, maxRedeems, usedCode }`
Legt beim ersten Aufruf einen zufälligen Code an (Kollisionsprüfung gegen
`code:<CODE>`).

**`POST /ref/redeem`** `{ code }` → `{ ok, trialExp }` oder `{ ok:false, reason }`
Prüft in dieser Reihenfolge:

1. Konto ist **nicht anonym** — `providerUserInfo` enthält `google.com` oder
   `apple.com` → sonst `reason:'anonymous'`
2. `code:<CODE>` existiert → sonst `reason:'unknown'`
3. Werber-uid ≠ eigene uid → sonst `reason:'self'`
4. eigener Datensatz hat kein `usedCode` → sonst `reason:'already_redeemed'`
5. `invited < REF_MAX_REDEEMS` beim Werber → sonst `reason:'code_exhausted'`,
   **beide Seiten gehen leer aus**

Danach schreibt der Worker beiden Seiten sieben Tage gut, gestapelt an eine
eventuell noch laufende Gratiswoche:

```js
trialExp = Math.max(Date.now(), rec.trialExp || 0) + 7 * 864e5
```

Beim Geworbenen wird zusätzlich `usedCode` gesetzt, beim Werber `invited`
erhöht. Reihenfolge: erst `usedCode` des Geworbenen setzen (Sperre), dann
gutschreiben — so kann ein Doppelklick oder ein zweites Gerät nicht zweimal
gutschreiben.

**`GET /ref/status`** → `{ trialExp, invited, maxRedeems, usedCode, aiLeft }`
Wird beim Login und beim App-Start geholt, höchstens einmal pro Stunde.

**`POST /ref/forget`** → `{ ok }`
Löscht `u:<uid>` und den zugehörigen `code:<CODE>`-Eintrag. Wird von der
Konto-Löschung aufgerufen (siehe unten).

### Anonyme Konten

Die App meldet beim Start automatisch anonym an (`signInAnonymously`,
`index.html`), und `accounts:lookup` akzeptiert anonyme Tokens ebenso wie echte.
Ohne die Provider-Prüfung wäre „App-Daten löschen" ein Ein-Klick-Weg zu einer
neuen uid und damit zu einer neuen Gratiswoche — beliebig oft, ohne Apple- oder
Google-Konto. Deshalb Prüfung 1 oben, und zwar in `/ref/redeem` **und** im
Trial-Zweig der KI-Prüfung.

### KI-Worker

Die bestehende Premium-Prüfung bekommt einen zweiten Zweig: liegt kein gültiges
Apple-JWS vor, wird `REF` gelesen — ein `trialExp` in der Zukunft und ein
nicht-anonymes Konto zählen als Premium.

Für Trial-Nutzer gelten eigene Grenzen, getrennt von den zahlenden Nutzern:

- **`TRIAL_LIMIT`** (Default 15) — KI-Anfragen für die gesamte Gratiszeit, nicht
  pro Monat. Zähler ist `aiUsed`.
- **`TRIAL_MONTHLY_USD`** (Default 20) — gemeinsamer Monatstopf aller
  Trial-Nutzer. Ist er leer, liefert die KI für Trials `402` mit Kauf-Hinweis;
  zahlende Nutzer sind davon unberührt.
- **`premiumSeen()` wird im Trial-Zweig nie aufgerufen.** `budgetCapUsd()` bildet
  `max(MIN_MONTHLY_USD, premiumSeen × USD_PER_USER)` — der Ausgabendeckel hängt
  also an der Kopfzahl **zahlender** Nutzer. Zählten Trial-Köpfe mit, würde jeder
  Gratis-Nutzer dein Ausgabenlimit anheben, ohne einen Cent zu bringen. Der
  bestehende `TEST_UIDS`-Guard in `premiumSeen()` zeigt die Bauart.

Kostenschätzung mit den Worker-Preisen (0,30 USD/Mio. Input, 2,50 USD/Mio.
Output, Ausgabe auf 1200–2000 Token gedeckelt): Chat und Coach je rund 0,4 Cent,
Scanner rund 0,6–1 Cent. 15 Anfragen kosten im schlimmsten Fall 6–9 Cent pro
Trial-Nutzer; 20 USD Topf reichen damit für etwa 250–600 Trial-Nutzer im Monat.

**Fehlt das `REF`-Binding, gilt kein Trial** (fail-closed). Ein
Konfigurationsfehler darf die KI nicht für alle freischalten.

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
vier Zustände:

| Zustand | Inhalt |
|---|---|
| `invited == 0` | „🎁 1 Woche Premium gratis — Freund einladen, beide bekommen sie" → öffnet `ov-invite` |
| `invited == 1` | „Gratis-Premium noch X Tage — eine weitere Woche ist drin" → öffnet `ov-invite` |
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
- Statuszeile: „X von 2 Gratis-Wochen geholt · aktiv bis TT.MM."
- Hinweis, dass der Code nach zwei Einlösungen abläuft — sonst wirkt ein toter
  Code wie ein Fehler

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

| `reason` | Text |
|---|---|
| `anonymous` | „Melde dich mit Apple oder Google an, dann klappt es." |
| `unknown` | „Diesen Code gibt es nicht." |
| `self` | „Das ist dein eigener Code." |
| `already_redeemed` | „Du hast schon einen Einladungscode eingelöst." |
| `code_exhausted` | „Dieser Code wurde schon zweimal eingelöst." |

### Web (Cloudflare Pages)

`gymtrack-9q9.pages.dev/?ref=K7M2QX9` erkennt den Parameter außerhalb der nativen
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
- **Trial abgelaufen oder 15 KI-Anfragen verbraucht:** Paywall statt KI-Antwort,
  mit klarem Grund.
- **Offline:** der lokale Cache trägt den Trial bis `exp`.
- **Zweitgerät:** `/ref/status` beim Login holt den Trial nach, kein erneutes
  Einlösen nötig.

## Sicherheit und Datenschutz

- Jede `/ref/*`-Route verlangt ein gültiges idToken; Einlösen zusätzlich ein
  nicht-anonymes Konto.
- Der Client kann `trialExp` nicht setzen; der KI-Worker liest immer KV.
- Einlösen ist gegen Doppelausführung gesperrt (Sperrfeld vor Gutschrift).
- **Konto-Löschung:** `_runAccountDeletion()` in `js/app-update.js` löscht heute
  Firestore-Dokumente und den Auth-Nutzer, weiß aber nichts vom Worker. Ohne
  Ergänzung blieben uid und Werbebeziehung in KV liegen — Widerspruch zur
  eigenen Löschzusage und zu Apple 5.1.1(v). Deshalb `POST /ref/forget` **vor**
  `window.FB.deleteUser()` (danach gibt es kein gültiges idToken mehr), plus die
  400-Tage-TTL als zweite Sicherung.
- **Datenschutzerklärung:** `privacy.html` braucht einen Absatz über die neuen
  Daten bei Cloudflare (uid, Einladungsbeziehung, Ablaufdatum, KI-Zähler).
- **KV kennt kein Compare-and-Swap** und ist nur eventual consistent. Zwei
  zeitgleiche Einlösungen aus verschiedenen Regionen können theoretisch doppelt
  gutschreiben. Durable Objects wären der saubere Ausweg, sind hier aber eine
  neue Komponente — dieselbe Abwägung trifft der Worker bereits bei `pcount:*`.
  Maximaler Schaden: ein paar Extra-Wochen, durch den Code-Deckel begrenzt.
  Bewusst in Kauf genommen.
- **Lokale Fälschbarkeit:** wer `localStorage` manipuliert, schaltet die
  Premium-**Oberfläche** frei, aber keine KI — die prüft der Worker. Das gilt
  heute schon für `gt_premiumDev` und ändert sich nicht.
- **App Store:** Belohnungen für Empfehlungen sind zulässig, kein IAP wird
  umgangen, die Paywall verweist weiterhin auf keinen externen Kaufweg.

## Test

**Worker** (`curl` mit echtem idToken): `/ref/me` legt einen Code an und ist
idempotent; `/ref/redeem` mit anonymem Token, unbekanntem Code, eigenem Code,
zweimal hintereinander; zweite Einlösung bei laufendem Trial (Ergebnis muss 14
Tage ab Start sein, nicht 7); dritte Einlösung auf denselben Code
(`code_exhausted`, keine Seite bekommt etwas); 16. KI-Anfrage im Trial;
`/ref/forget` löscht beide Schlüssel; `/ref/status` nach Ablauf.

**Kostendeckel:** prüfen, dass `pcount:<Monat>` nach einer Trial-KI-Anfrage
unverändert bleibt — sonst hebt der Trial den Ausgabendeckel.

**App** (drei Konten im Simulator, `~/.claude/sim-native.sh gymtrack`):
Link-Weg und Tipp-Weg, Paywall-Banner in allen vier Zuständen, KI-Anfrage
während des Trials, Verhalten nach Ablauf, Konto-Löschung während laufendem
Trial.

## Einmaliges Setup (Lenny)

1. Cloudflare → Workers & Pages → KV → Namespace `gymtrack-ref` anlegen.
2. Am Worker `gymtrack-ai`: Settings → Bindings → KV-Namespace binden,
   Variablenname exakt `REF`.
3. Worker neu deployen.

Optionale Variablen am Worker, alle mit brauchbaren Defaults:
`REF_MAX_REDEEMS` (2), `TRIAL_LIMIT` (15), `TRIAL_MONTHLY_USD` (20).

Kein neues Secret, kein neuer Account. Nachtragen in `PREMIUM-SETUP.md`.
