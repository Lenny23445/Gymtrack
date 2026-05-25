# GymTrack — Projektübersicht

**Was:** Progressive Web App (PWA), eine einzige HTML-Datei, auf iPhone installiert.
**Live:** https://lenny23445.github.io/Gymtrack/ · **Repo:** https://github.com/Lenny23445/Gymtrack (Branch `main`, GitHub Pages auto-deploy ~1 Min nach Push)

## Dateien
- `index.html` — gesamte App (HTML+CSS+JS)
- `sw.js` — Service Worker (Offline-Cache)
- `manifest.json` — PWA-Metadaten
- `GymTrack-Update.ps1` (in `C:\Users\wolte\Desktop\`) — Deploy: bumpt Version in `sw.js`+`index.html`, dann `git add/commit/push`

## Deploy / Versionsbump
Doppelklick auf `GymTrack-Update.ps1`. Bei manuellem Bump via PowerShell **immer .NET direkt nutzen, NIE `Get-Content`/`Set-Content`** (zerstört Encoding):
```powershell
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$html = [System.IO.File]::ReadAllText($path, $utf8NoBom)
$html = $html -replace "gymtrack-v\d+", "gymtrack-v$version"
[System.IO.File]::WriteAllText($path, $html, $utf8NoBom)
```
`APP_VERSION` in index.html muss immer mit `CACHE` in sw.js übereinstimmen.

## Architektur (index.html: CSS oben, HTML mitte, JS unten)

**CSS:** Themes via `[data-theme="light|rosa|dark|blau"]`. Variablen: `--acc`, `--acc-rgb`, `--mesh`, `--gl-bg`. Neues Theme braucht: CSS-Block + `[data-theme="X"] #tab-indicator` + Theme-Row im HTML + Name in `setTheme()`.

**HTML-Seiten:** `#pg-heute`, `#pg-uebungen`, `#pg-stats`, `#pg-settings`. Overlays = Bottom Sheets via `.ov`. `#dackel-lane` = animierter Dackel auf der Tab-Leiste. **Keine weiteren Tabs hinzufügen** — Tabs sind fix: Heute, Übungen, Statistik, Einstellungen.

**JS Kern:** `APP_VERSION` (muss = sw.js CACHE) · `S = {}` (alle Daten, localStorage `'ft4'`) · `persist()` · `setTheme(t)` · `applyCompanion()` · `checkForUpdate()` (holt sw.js vom Server, vergleicht Version) · `_doForceUpdate()` (deregistriert SW, leert Cache, lädt neu) · `initSheetSwipe()` (Swipe-to-dismiss für alle `.sh-handle`).

## Datenstruktur (`localStorage['ft4']`)
```js
S = {
  exercises:[],  // {id, name, emoji, muscleGroup, sets:[{reps,weight}]}
  sessions:[],   // {date, exercises:[{id, sets}]}
  theme:'light', companion:'dackel', companionOn:true,
  exFilterMode, wkFilterMode, statsFilterMode, // 'muskel'|'ppl'|'oberunter'
  welcomeShown, lastSeenVersion, updatedAt
}
```

## Features (implementiert)
Übungen mit Muskelgruppen (Brust/Rücken/Beine/Arme/Schultern/Core) · Muskelgruppen-Filter im Übungen-Tab und beim Training · Training starten, Sätze loggen, Progression mit Gewichtsvorschlägen · 1RM-Berechnung (Epley) inkl. Verlaufs-Chart · Statistik mit Modus-Switcher (Muskeln/PPL/Ober-Unter) · Bottom Sheets mit Swipe-to-dismiss · 4 Themes · Dackel-Begleiter (toggle + Picker) · Auto-Update (direkter sw.js-Vergleich, kein SW-API) · Silent Background-Check beim App-Start (nach 3 Sek.) · Changelog-Popup nach Updates · Cardio-Timer mit SW-Notification · Cloud-Sync via Firebase.

## Code-Muster

**Neues Bottom Sheet:**
```html
<div class="ov" id="ov-X" onclick="if(event.target===this)closeOv('ov-X')">
  <div class="sheet">
    <div class="sh-handle"></div>
    <div class="sh-head"><h2>Titel</h2><button class="x-btn" onclick="closeOv('ov-X')">✕</button></div>
    <!-- Inhalt -->
  </div>
</div>
```
Öffnen: `openOv('ov-X')` · Schließen: `closeOv('ov-X')` · `initSheetSwipe()` macht alle `.sh-handle` automatisch swipeable.

**Settings-Toggle:**
```html
<div class="row">
  <div class="ico">🔔</div>
  <div class="row-body"><div class="row-title">Titel</div><div class="row-sub">Beschreibung</div></div>
  <label class="tgl" onclick="event.stopPropagation()">
    <input type="checkbox" id="mein-toggle" onchange="fn(this.checked)">
    <span class="tgl-track"></span>
  </label>
</div>
```

## Eigenheiten
- **iOS Safari + PWA:** SW-Updates kommen ohne unsere sw.js-Direkt-Lösung nicht durch
- **Encoding:** Datei ist UTF-8 ohne BOM. Edit-Tool erhält das korrekt. Niemals `Get-Content`/`Set-Content` (BOM + Mojibake).
- **Preview-Server:** Port 5500, Config in `.claude/launch.json` (PowerShell HttpListener serviert direkt aus diesem Ordner)

## Firebase / Cloud-Sync

**Datenmodell Firestore:** Collection `users` · Document `{uid}` · Felder: `exercises[], sessions[], theme, companion, companionOn, exFilterMode, wkFilterMode, welcomeShown, updatedAt, _serverTime`.

**Sync-Verhalten:**
- Login: lokal + Cloud werden gemerged (verlustfrei), dann hochgeladen
- Speichern: `persist()` pusht automatisch (800ms debounced)
- Live-Sync: andere Geräte via `onSnapshot`
- Abmelden: lokale Daten bleiben, Verbindung getrennt
- Neues Gerät / nach App-Löschen: einfach wieder anmelden → alles aus Cloud

**Einmaliges Setup (5–10 Min)** falls neu eingerichtet werden muss:
1. https://console.firebase.google.com → **Projekt hinzufügen** (z.B. "GymTrack")
2. **Build → Authentication → Get Started → Google** aktivieren (Support-Email)
3. **Build → Firestore Database → Create database** → **Production** → Region z.B. `eur3`
4. **Firestore → Rules** — jeder User nur sein Dokument:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```
5. **Projektübersicht → Web-App hinzufügen (</>-Icon)** → registrieren → `firebaseConfig` kopieren
6. In `index.html` nach `const FIREBASE_CONFIG = {` suchen, Werte einsetzen
7. **Authentication → Settings → Authorized domains:** `lenny23445.github.io` hinzufügen (`localhost` ist schon drin)

## Analytics / Admin-Statistiken

**Aktivierung Anonymous-Auth (für vollständiges Tracking):** Firebase Console → **Authentication → Sign-in providers → Anonymous** aktivieren. Damit werden auch Besucher ohne Google-Login getrackt.

**Datenmodell (Firestore):**
- `analytics_users/{uid}` — `{uid, firstSeen, lastSeen, totalSessions, totalSec, isAnon}` (eine Doc pro Nutzer)
- `analytics_sessions/{auto}` — `{uid, start, lastBeat, duration, isAnon}` (eine Doc pro Session, Heartbeat alle 60 s)
- RTDB `presence/{uid}` (bestehend) — Live-Online-Count

**Firestore-Rules** (Rules-Tab erweitern, `ADMIN_UID` durch die eigene UID ersetzen):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    // Analytics: jeder Nutzer schreibt seine eigenen Daten, NUR Admin liest alles
    match /analytics_users/{userId} {
      allow read:  if request.auth != null && request.auth.uid == "ADMIN_UID";
      allow create, update: if request.auth != null && request.auth.uid == userId;
    }
    match /analytics_sessions/{sid} {
      allow read:   if request.auth != null && request.auth.uid == "ADMIN_UID";
      allow create: if request.auth != null && request.resource.data.uid == request.auth.uid;
      allow update: if request.auth != null && resource.data.uid == request.auth.uid;
    }
  }
}
```

**Realtime DB Rules** (für Admin Lesezugriff auf `presence`, `ADMIN_UID` ersetzen):
```
{
  "rules": {
    "presence": {
      ".read": "auth != null && auth.uid === 'ADMIN_UID'",
      "$uid": {
        ".write": "auth != null && auth.uid === $uid"
      }
    }
  }
}
```

**Admin-Modus aktivieren (einmalig pro Gerät):**
1. In der App anmelden (Google)
2. Einstellungen → 5× kurz auf die **„Version"**-Zeile tippen
3. Bestätigen → eigene UID wird gespeichert
4. UID kopieren aus „Meine UID kopieren" und in den Firestore-/RTDB-Rules (oben) einsetzen → publish
5. Nun erscheint **📊 App-Statistiken** in den Einstellungen mit Live-Online, DAU/WAU/MAU, Ø Session-Dauer, Retention D1/D7/D30

**Was die App automatisch macht:**
- Beim App-Start: Auto-Login (anonym, falls Anonymous-Auth aktiviert), sonst nur signed-in
- Pro Session: 1× Doc in `analytics_sessions` + 1× User-Update, Heartbeat alle 60 s
- Bei `visibilitychange`/`pagehide`/`beforeunload`: finaler Heartbeat (Duration genau)
