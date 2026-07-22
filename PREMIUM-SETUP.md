# MyGymTrack Premium — Einmaliges Setup (Lenny)

Code ist komplett fertig. Diese 3 Schritte kannst nur du machen (Accounts/Passwörter).

## 1. App Store Connect — Abo-Produkte anlegen (~10 Min)

appstoreconnect.apple.com → Meine Apps → MyGymTrack → **Monetarisierung → Abonnements**:

1. **Abogruppe erstellen**: Name `Premium` (Referenzname, egal).
2. In der Gruppe **zwei Abos anlegen** — die IDs müssen EXAKT so heißen (stehen so im Code):

| Referenzname | Produkt-ID | Dauer | Preis |
|---|---|---|---|
| Premium Monatlich | `gymtrack.premium.monthly` | 1 Monat | 2,99 € |
| Premium Jährlich | `gymtrack.premium.yearly` | 1 Jahr | 19,99 € |

3. Pro Abo: Anzeigename (z. B. „MyGymTrack Premium"), Beschreibung, 1 Screenshot fürs Review hochladen, Preis für Deutschland setzen (andere Länder automatisch).
4. **Kleinunternehmer-Programm** (15 % statt 30 % Apple-Anteil): App Store Connect → Vereinbarungen → App Store Small Business Program beantragen, falls noch nicht geschehen.
5. Beim nächsten App-Update im Review-Formular die neuen In-App-Käufe **zum Review mitschicken** (Checkbox beim Einreichen).

**Testen vor dem Release:** TestFlight-Build laden → Käufe laufen automatisch in der Sandbox (kostenlos, Abo verlängert sich im Zeitraffer). Sandbox-Tester unter Nutzer und Zugriff → Sandbox anlegen, damit auf dem Gerät einloggen (Einstellungen → App Store → Sandbox-Account).

## 2. Cloudflare — KI-Worker deployen (~10 Min)

Genau wie beim Push-Worker:

1. dash.cloudflare.com → Workers & Pages → **Create Worker** → Name: `gymtrack-ai` (Ergebnis-URL muss `https://gymtrack-ai.wolterlenny362.workers.dev` sein — steht so in index.html).
2. Quick Edit → kompletten Inhalt von `ai-worker/worker.js` reinkopieren → Deploy.
3. Settings → Variables and Secrets → **2 Secrets** anlegen:
   - `ANTHROPIC_API_KEY` → console.anthropic.com → API Keys → neuen Key erstellen (Kreditkarte hinterlegen; Kosten: grob 5–10 Cent pro aktivem Premium-Nutzer/Monat mit Haiku).
   - `FIREBASE_API_KEY` → derselbe `apiKey` wie in index.html im `FIREBASE_CONFIG`-Block.
4. Optional (Vars, kein Secret): `MODEL` (Default `claude-haiku-4-5`; für bessere Antworten z. B. `claude-sonnet-5` — kostet ~3× mehr), `CHAT_DAILY` (Default 100), `REPORT_DAILY` (Default 5).

**Test:** Mit deinem Founder-Account (du bist automatisch Premium, auch ohne Kauf) in der App → Heute → KI-Coach-Karte → Chat: Frage stellen. Kommt eine Antwort → Worker läuft.

## 3. Xcode einmalig (nur fürs Live-Simulator-Panel in Claude)

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

## Was ohne diese Schritte schon geht / nicht geht

| Feature | Ohne Setup | Nach Setup |
|---|---|---|
| Paywall, Onboarding-Schritt, Premium-UI | ✅ sichtbar | ✅ |
| Kauf/Restore | ❌ „Produkt nicht gefunden" | ✅ |
| KI-Chat + Wochenbericht | ❌ (Worker fehlt) | ✅ |
| Übungsdatenbank | ✅ (Founder/nach Kauf; freie Quellen, keine Kosten) | ✅ |
| Pro-Analyse, Körper-Tracking, Export, Themes, App-Icons | ✅ (Founder/nach Kauf) | ✅ |

## Sicherheit (Kurzfassung)

- Anthropic-Key liegt NUR im Cloudflare-Worker (wie APNs-Key beim Push-Worker).
- Worker prüft pro Anfrage: Firebase-Login **und** Apples signierten Abo-Beweis (StoreKit-2-JWS: Signatur + Zertifikatskette bis zur gepinnten Apple Root CA, Produkt-ID, Ablaufdatum). Ohne aktives Abo keine KI — auch nicht mit manipulierter App.
- Dein Founder-Account (Admin-UID) ist immer Premium, ohne Kauf.
