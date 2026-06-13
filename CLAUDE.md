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
Übungen + Muskelgruppen-Filter · Training starten/loggen, Gewichtsvorschläge · 1RM (Epley) + Chart · Statistik Modus-Switcher (Muskeln/PPL/Ober-Unter) · Bottom Sheets Swipe-to-dismiss · 4 Themes · Dackel-Begleiter · Auto-Update (sw.js-Direktvergleich) · Changelog-Popup · Cardio-Timer + SW-Notification · Cloud-Sync Firebase · Aktives Training überlebt App-Neustart (localStorage `gt_active_wk`, Restore via `_restoreActiveWk()` im INIT, 8h-TTL) · Supersätze (`log.ssGroup`, Pause erst wenn alle Partner Satz N fertig) · Plate Calculator im Gewichts-Wheel (`_renderPlateCalc`, Stange via `S.plateBar`, nur lokal) · Herzfrequenz im Training (HealthKitPlugin `getLatestHeartRate`, JS-Polling 15 s via `_startHrPolling`, nur nativ).

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

**Firestore Rules** (`REPLACE_WITH_ADMIN_UID` durch eigene UID ersetzen):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null
        && request.auth.uid == userId
        // Erlaubte Felder (kein unbekannter Payload)
        && request.resource.data.keys().hasOnly([
             'exercises','sessions','theme','companion','companionOn',
             'exFilterMode','wkFilterMode','statsFilterMode','welcomeShown',
             'lastSeenVersion','lastSeenBuild','updatedAt','_serverTime',
             'unitMode','weightHistory','trackerItems','trackerCounts',
             'customSplits','workoutPresets','planSplit','planMode','planGroups','planWeek',
             'streak','streakLastDate','notifEnabled','notifTime',
             'glass','adminUid','erfAchieved','weightGoal',
             'smartRestEnabled','smartRest',
             'heuteLayout','weekPlan','weightLog','weightStart','restTimerSecs'
           ])
        // Max. 5000 Sessions und 500 Übungen (Kostendeckel)
        && (!('sessions'  in request.resource.data) || request.resource.data.sessions.size()  <= 5000)
        && (!('exercises' in request.resource.data) || request.resource.data.exercises.size() <= 500);
    }
    match /analytics_users/{userId} {
      allow read: if request.auth != null && request.auth.uid == "GMm3AlNn1pVRL6cc76opBgnM9sr1";
      allow create, update: if request.auth != null
        && request.auth.uid == userId
        && request.resource.data.keys().hasOnly([
             'uid','firstSeen','lastSeen','totalSessions','totalSec','isAnon'
           ]);
    }
    match /analytics_sessions/{sid} {
      allow read:   if request.auth != null && request.auth.uid == "GMm3AlNn1pVRL6cc76opBgnM9sr1";
      allow create: if request.auth != null
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.keys().hasOnly([
             'uid','start','lastBeat','duration','isAnon'
           ]);
      allow update: if request.auth != null
        && resource.data.uid == request.auth.uid
        && request.resource.data.keys().hasOnly([
             'uid','start','lastBeat','duration','isAnon'
           ]);
    }
  }
}
```

**RTDB Rules** (`REPLACE_WITH_ADMIN_UID` ersetzen):
```json
{
  "rules": {
    "presence": {
      ".read": "auth != null && auth.uid === 'GMm3AlNn1pVRL6cc76opBgnM9sr1'",
      "$uid": {
        ".write": "auth != null && auth.uid === $uid",
        ".validate": "newData.hasChildren(['online','lastChanged'])"
      }
    }
  }
}
```

## iOS / Capacitor – Architektur & Crash-Schutz

### Architektur (WICHTIG)
- **Firebase Auth** → läuft über das **Firebase JavaScript Web SDK** (CDN in `index.html`). Es gibt KEIN natives Firebase iOS SDK im Projekt. Das ist Absicht.
- **Capacitor-Plugins** (in `ios/App/App/Plugins/`): AppleSignInPlugin, HealthKitPlugin, LiveActivityPlugin, SpotlightPlugin, WidgetDataPlugin. Alle custom, kein npm-Paket dafür.
- **SPM-Pakete** (`CapApp-SPM/Package.swift`): Nur Capacitor Core + `@capacitor/app` + `@capacitor/browser`. Wird von `npx cap sync ios` verwaltet.

### ⛔ NIEMALS – diese Dinge verursachen SIGABRT-Crash

| Was | Warum verboten |
|-----|---------------|
| `@capacitor-firebase/authentication` zu `package.json` hinzufügen | Zieht Firebase iOS SDK + Facebook SDK rein. FacebookCore crasht ohne korrekte AppDelegate-Initialisierung |
| `FirebaseApp.configure()` in `AppDelegate.swift` aufrufen | Nur nötig mit nativem Firebase SDK – das wir nicht haben |
| `import FirebaseCore` in `AppDelegate.swift` | Wie oben |
| `@capacitor-firebase/authentication` zu `package.json` hinzufügen (doppelte Zeile, nur zur Betonung) | Caucht immer den gleichen Facebook-SDK-Crash |

### ✅ MUSS so bleiben

**`AppDelegate.swift` – `didFinishLaunchingWithOptions`:**
```swift
return true   // Capacitor 8.x: kein ApplicationDelegateProxy hier (Methode existiert nicht!)
```
`ApplicationDelegateProxy` in Capacitor 8.x hat NUR `application(_:open:options:)` – das ist weiter unten korrekt eingebunden. `didFinishLaunchingWithOptions` gibt einfach `true` zurück.

**`GymTrackActivityAttributes`** muss in BEIDEN Dateien identisch sein:
- `ios/App/App/Plugins/LiveActivityPlugin.swift`
- `ios/App/GymTrackWidget/GymTrackLiveActivity.swift`

### Build-Reihenfolge (Codemagic)
1. `npm install` → 2. `npm run build` (root `index.html` → `www/`) → 3. `npx cap sync ios` (aktualisiert Package.swift) → 4. `ruby setup_ios_extensions.rb` (fügt Widget-Extension zum Xcode-Projekt hinzu) → 5. Build IPA

### Bekannte gute Konfiguration (crash-frei ab Build #43)
- `AppDelegate.swift`: ApplicationDelegateProxy ✓, kein FirebaseCore ✓
- `Package.swift`: Nur capacitor-swift-pm + CapacitorApp + CapacitorBrowser ✓
- `package.json`: Kein `@capacitor-firebase/authentication` ✓
- `setup_ios_extensions.rb`: Kein `exit 0` am Anfang ✓

## Analytics / Admin

**Datenmodell:**
- `analytics_users/{uid}` — `{uid, firstSeen, lastSeen, totalSessions, totalSec, isAnon}`
- `analytics_sessions/{auto}` — `{uid, start, lastBeat, duration, isAnon}` (Heartbeat alle 60 s)
- RTDB `presence/{uid}` — Live-Online-Count

**Admin aktivieren:** Einstellungen → 5× auf „Version"-Zeile tippen → bestätigen → UID in Rules einsetzen → `📊 App-Statistiken` erscheint (Live-Online, DAU/WAU/MAU, Ø Duration, Retention D1/D7/D30).

**Auto-Tracking:** App-Start: Auto-Login (anonym), Session-Doc + User-Update, Heartbeat alle 60 s. Ende: finaler Heartbeat bei `visibilitychange`/`pagehide`/`beforeunload`.
