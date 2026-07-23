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
3. **KV-Namespace anlegen** (fürs monatliche 50er-Limit): Workers & Pages → KV → Create Namespace, Name `gymtrack-ai-quota`. Danach am Worker: Settings → Bindings → KV Namespace binden, Variablenname exakt `AI_QUOTA`, Namespace `gymtrack-ai-quota`. Ohne diese Bindung läuft der Worker trotzdem (Monatslimit wird dann nicht durchgesetzt — nur die Tageslimits greifen).
4. Settings → Variables and Secrets → Secrets anlegen:
   - `GEMINI_API_KEY` → aistudio.google.com/apikey → neuen Key erstellen (Standardmodell: Gemini 2.5 Flash, sehr günstig).
   - `FIREBASE_API_KEY` → derselbe `apiKey` wie in index.html im `FIREBASE_CONFIG`-Block.
   - Nur falls du auf Claude zurückwechseln willst: zusätzlich `ANTHROPIC_API_KEY` setzen und Var `PROVIDER=claude`.
5. Optional (Vars, kein Secret): `MODEL` (Gemini-Modell, Default `gemini-2.5-flash`), `MONTHLY_LIMIT` (Default 50), `CHAT_DAILY`/`COACH_DAILY`/`ANALYZE_DAILY` (Tageslimits als Missbrauchsbremse, Defaults 100/60/10).

**Test:** Mit deinem Founder-Account (du bist automatisch Premium, auch ohne Kauf) in der App → KI-Bubble → Chat: Frage stellen. Kommt eine Antwort → Worker läuft.

## 3. Xcode einmalig (nur fürs Live-Simulator-Panel in Claude)

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

## Was ohne diese Schritte schon geht / nicht geht

| Feature | Ohne Setup | Nach Setup |
|---|---|---|
| KI-Bubble, Paywall, Premium-Settings | ✅ sichtbar | ✅ |
| Kauf/Restore (App Store Connect) | ❌ „Produkt nicht gefunden" | ✅ |
| KI-Chat, Live-Coach, Trainingsanalyse, AI Insights (Cloudflare Worker) | ❌ (Worker fehlt) | ✅ |
| Monatslimit 50 KI-Anfragen (KV-Namespace) | ⚠️ nicht durchgesetzt (nur Tageslimits) | ✅ |
| Post-Workout-Check-In, Community-Premium-Badge | ✅ (unabhängig vom Worker) | ✅ |

## Sicherheit (Kurzfassung)

- Anthropic-Key liegt NUR im Cloudflare-Worker (wie APNs-Key beim Push-Worker).
- Worker prüft pro Anfrage: Firebase-Login **und** Apples signierten Abo-Beweis (StoreKit-2-JWS: Signatur + Zertifikatskette bis zur gepinnten Apple Root CA, Produkt-ID, Ablaufdatum). Ohne aktives Abo keine KI — auch nicht mit manipulierter App.
- Dein Founder-Account (Admin-UID) ist immer Premium, ohne Kauf.
