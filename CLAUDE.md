# GymTrack — Projektübersicht

**Was:** PWA, single HTML file, auf iPhone installiert.
**Live:** https://lenny23445.github.io/Gymtrack/ · **Repo:** https://github.com/Lenny23445/Gymtrack (`main`, GitHub Pages ~1 Min nach Push)

## Dateien
- `index.html` — gesamte App (HTML+CSS+JS)
- `sw.js` — Service Worker (Offline-Cache)
- `manifest.json` — PWA-Metadaten
- `GymTrack-Update.ps1` (`C:\Users\wolte\Desktop\`) — bumpt Version, git add/commit/push

## Deploy / Versionsbump
Manueller Bump — **immer .NET, NIE `Get-Content`/`Set-Content`** (BOM + Mojibake):
```powershell
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$html = [System.IO.File]::ReadAllText($path, $utf8NoBom)
$html = $html -replace "gymtrack-v\d+", "gymtrack-v$version"
[System.IO.File]::WriteAllText($path, $html, $utf8NoBom)
```
`APP_VERSION` in index.html muss immer mit `CACHE` in sw.js übereinstimmen.

## Architektur (index.html: CSS → HTML → JS)

**CSS:** Themes via `[data-theme="light|rosa|dark|blau"]`. Variablen: `--acc`, `--acc-rgb`, `--mesh`, `--gl-bg`. Neues Theme: CSS-Block + `[data-theme="X"] #tab-indicator` + Theme-Row im HTML + Name in `setTheme()`.

**HTML:** Seiten: `#pg-heute`, `#pg-uebungen`, `#pg-stats`, `#pg-settings`. Overlays = Bottom Sheets via `.ov`. `#dackel-lane` = animierter Dackel. **Tabs fix** (Heute/Übungen/Statistik/Einstellungen) — keine neuen hinzufügen.

**JS:** `APP_VERSION` · `S = {}` (Daten, localStorage `'ft4'`) · `persist()` · `setTheme(t)` · `applyCompanion()` · `checkForUpdate()` · `_doForceUpdate()` · `initSheetSwipe()`.

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

## Features
Übungen + Muskelgruppen-Filter · Training starten/loggen, Gewichtsvorschläge · 1RM (Epley) + Chart · Statistik Modus-Switcher (Muskeln/PPL/Ober-Unter) · Bottom Sheets Swipe-to-dismiss · 4 Themes · Dackel-Begleiter · Auto-Update (sw.js-Direktvergleich) · Changelog-Popup · Cardio-Timer + SW-Notification · Cloud-Sync Firebase.

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
`openOv('ov-X')` / `closeOv('ov-X')` · `initSheetSwipe()` macht alle `.sh-handle` swipeable.

**Settings-Toggle:**
```html
<div class="row">
  <div class="ico">🔔</div>
  <div class="row-body"><div class="row-title">Titel</div><div class="row-sub">Sub</div></div>
  <label class="tgl" onclick="event.stopPropagation()">
    <input type="checkbox" id="mein-toggle" onchange="fn(this.checked)">
    <span class="tgl-track"></span>
  </label>
</div>
```

## Eigenheiten
- **iOS Safari + PWA:** SW-Updates nur via sw.js-Direktlösung (kein SW-API)
- **Encoding:** UTF-8 ohne BOM. Edit-Tool OK. Niemals `Get-Content`/`Set-Content`.
- **Preview-Server:** Port 5500, `.claude/launch.json` (PowerShell HttpListener)

## Firebase / Cloud-Sync

**Einmaliges Setup:** Firebase-Projekt → Google Auth + Anonymous Auth + Firestore (Production, `eur3`) → Rules (s.u.) → Web-App registrieren → `firebaseConfig` in index.html nach `const FIREBASE_CONFIG = {` → `lenny23445.github.io` zu Authorized Domains.

**Datenmodell:** Collection `users` · Doc `{uid}` · Felder: `exercises[], sessions[], theme, companion, companionOn, exFilterMode, wkFilterMode, welcomeShown, updatedAt, _serverTime`.

**Sync:** Login: lokal+Cloud merge → Upload · `persist()`: auto-push (800ms debounced) · Live: `onSnapshot` · Logout: Daten lokal erhalten · Neues Gerät: anmelden → alles aus Cloud.

**Firestore Rules** (`ADMIN_UID` durch eigene UID ersetzen):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
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

**RTDB Rules** (`presence`, `ADMIN_UID` ersetzen):
```json
{"rules":{"presence":{".read":"auth != null && auth.uid === 'ADMIN_UID'","$uid":{".write":"auth != null && auth.uid === $uid"}}}}
```

## Analytics / Admin

**Datenmodell:**
- `analytics_users/{uid}` — `{uid, firstSeen, lastSeen, totalSessions, totalSec, isAnon}`
- `analytics_sessions/{auto}` — `{uid, start, lastBeat, duration, isAnon}` (Heartbeat alle 60 s)
- RTDB `presence/{uid}` — Live-Online-Count

**Admin aktivieren:** Einstellungen → 5× auf „Version"-Zeile tippen → bestätigen → UID in Rules einsetzen → `📊 App-Statistiken` erscheint (Live-Online, DAU/WAU/MAU, Ø Duration, Retention D1/D7/D30).

**Auto-Tracking:** App-Start: Auto-Login (anonym), Session-Doc + User-Update, Heartbeat alle 60 s. Ende: finaler Heartbeat bei `visibilitychange`/`pagehide`/`beforeunload`.
