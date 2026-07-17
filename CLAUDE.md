# GymTrack — Projektübersicht

> **HARD-REGEL (UI): KEINE Emojis in der Oberfläche.** Neue Features, Buttons, Empty-States,
> Labels, Feed/Community, Share-Card usw. **immer** mit Vektor-Symbolen. In HTML: `ICO.<name>({s})`
> (SVG-Set bei den Share-Flow-Funktionen, stroke=currentColor) bzw. inline-`<svg>` im Header-Stil;
> Flamme = `_flameFillSVG(px)`. Auf dem Canvas: `_cvPin`/`_cvDumbbell` statt Emoji. Bestehende
> Emoji-**Daten** (Übungs-DB `e:'…'`, `ICON_CATS`/`EMOJIS`-Picker, Changelog-Strings, Streak-🔥 im
> Heute-Tab) bleiben unangetastet — die Regel gilt für **UI-Chrome**, nicht für Nutzer-Icon-Auswahl.
> `reactions[uid]='🔥'` ist ein Firestore-**Datenwert/Sentinel** (nicht anfassen), nur die Anzeige ist SVG.

**Was:** PWA, single HTML file, auf iPhone installiert.
**Live:** https://lenny23445.github.io/Gymtrack/ · **Repo:** https://github.com/Lenny23445/Gymtrack (`main`, GitHub Pages ~1 Min nach Push)

## Dateien
- `index.html` — gesamte App (HTML+CSS+JS)
- `sw.js` — Service Worker (Offline-Cache)
- `manifest.json` — PWA-Metadaten
- `GymTrack-Update.ps1` (`C:\Users\wolte\Desktop\`) — bumpt Version, git add/commit/push

## Deploy / Versionsbump

**Nach JEDER App-Änderung immer beides (Standard-Workflow, Mac):**
1. Version bumpen: `APP_VERSION` in index.html == `CACHE` in sw.js (`gymtrack-vJJJJMMTTNNNN`)
2. **Nativ lokal:** `npm run build && npx cap sync ios` → aktualisiert `www/` + `ios/App/App/public/` (Xcode/Codemagic bauen daraus)
3. **Web parallel:** `git add` (nur geänderte Dateien) + `git commit` auf `main`; `git push origin main` → GitHub Pages deployt ~1 Min. Falls Push-Auth fehlt: committen und User Bescheid geben.

`www/` ist gitignored — Codemagic baut es selbst (npm build → cap sync → setup_ios_extensions.rb).

### Trigger-Wort „Hochladen" (STANDING AUTHORIZATION)
Sagt der User **„Hochladen"** (o.ä., z.B. „lade hoch"), sofort **ohne Rückfrage** ausführen:
```
./BUILD-FUER-APPSTORE.command
```
Macht komplett automatisch: npm build → cap sync → Widget-Extension/Entitlements → Version+Build-Nummer hochzählen → Archiv bauen → mit Apple-Distribution-Zertifikat signieren → Upload zu App Store Connect/TestFlight. Dauert einige Minuten — im Hintergrund laufen lassen (`run_in_background`), Ergebnis (Version, Build-Nummer, ARCHIVE/EXPORT SUCCEEDED) danach melden.
Vorher kurz prüfen: `security find-identity -v -p codesigning` zeigt "Apple Distribution: ... (4XU2X547J2)" — wenn das fehlt, Upload wird scheitern, dann User Bescheid geben statt einfach zu starten.
Das ist etwas anderes als der normale Deploy-Workflow oben (der synct nur lokal für Xcode + pushed die Web-Version) — „Hochladen" löst den VOLLEN signierten Store-Upload aus, einmalig vom User autorisiert am 2026-07-05.

Legacy (Windows-PC): Bump **immer .NET, NIE `Get-Content`/`Set-Content`** (BOM + Mojibake):
```powershell
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$html = [System.IO.File]::ReadAllText($path, $utf8NoBom)
$html = $html -replace "gymtrack-v\d+", "gymtrack-v$version"
[System.IO.File]::WriteAllText($path, $html, $utf8NoBom)
```

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
  welcomeShown, lastSeenVersion, updatedAt,
  onboarded, userName, obGoal, obExp, obFreq,  // Onboarding ('muskel'|'kraft'|'abnehmen'|'fit', 'neu'|'mittel'|'profi', 2–6)
  socialOn, friendCode, friends:[uid],         // Community (Follow-Modell)
  gymName, gymLat, gymLng                      // eigenes Gym für die Karte
}
```

## Features
Übungen + Muskelgruppen-Filter · Training starten/loggen, Gewichtsvorschläge · 1RM (Epley) + Chart · Statistik Modus-Switcher (Muskeln/PPL/Ober-Unter) · Bottom Sheets Swipe-to-dismiss · 4 Themes · Dackel-Begleiter · Auto-Update (sw.js-Direktvergleich) · Changelog-Popup · Cardio-Timer + SW-Notification · Cloud-Sync Firebase · Aktives Training überlebt App-Neustart (localStorage `gt_active_wk`, Restore via `_restoreActiveWk()` im INIT, 8h-TTL) · Supersätze (`log.ssGroup`, Pause erst wenn alle Partner Satz N fertig) · Plate Calculator im Gewichts-Wheel (`_renderPlateCalc`, Stange via `S.plateBar`, nur lokal) · Herzfrequenz im Training (HealthKitPlugin `getLatestHeartRate`, JS-Polling 15 s via `_startHrPolling`, nur nativ) · Onboarding für neue User (`maybeStartOnboarding` im INIT, Fullscreen `#ob-screen`, JS-gerendert via `renderOb`, Plan-Empfehlung aus `PLAN_TEMPLATES` via `_applyTemplateCore`, Flag `S.onboarded`) · Community = eigener 5. Tab (`#pg-freunde`, `renderFriendsTab`). **Klare Trennung Privat vs. Community:** privater Block (Chips `friends/feed/board/map` in `#fr-seg`, Label „Privat · nur dein Freundeskreis") = Freunde-Liste + Freunde-Feed + Rangliste + Karte; darunter der abgesetzte `.soc-community-chip` (`data-t="community"`) = öffentlicher Feed ALLER Nutzer. `setSocTab('community')` → `_renderFeed` mit `_cpgMode='public'` (collectionGroup-Index nötig); `feed` → `friends`. Der alte `.cpg-mode`-Umschalter im Feed ist entfernt; Zone zeigt `.cpg-zone`-Header. **Share-Card:** 6 Layouts (`SHARE_LAYOUTS`: classic/bold/clean/minimal/frame/stats) + Farbpaletten (`SHF_PALETTES`, Index 0 = App-Theme, Swatch-Reihe `#shf-pal` im Editor, `_shfPalIdx`/`_shfSetPal`); Card-Icons via `_cvPin`/`_cvDumbbell` statt Emoji; Share-Overlay hat branded Hintergrund (Akzent-Glows + Punktraster) statt Schwarz. Segmente: Freundeskarten mit Live-Status („trainiert gerade", `profile.live` aus `isWorkoutActive()`+`timerTs`, Push-Hooks in `startActive`/`finishWk`/`cancelWk`), Online-Dot via RTDB-Presence (`FB.rtdbWatch`), onSnapshot-Live-Updates (`_frStartLive`/`_frStopLive` — Stop beim Tab-Wechsel!), Pull-to-Refresh; Freundesprofil-Sheet (`openFrProfile`: Level, Stats, Badges, Wochen-Vergleich, PRs); Activity-Feed (`profiles/{uid}/activities` Subcollection, Emoji-Reaktionen via reactions-Map, Rules erlauben Fremd-Update NUR auf `reactions`); Freundschaftsanfragen (`requests`-Collection: pending→accepted, Absender löst ein + löscht), Suche (Name-Präfix + Code), QR (`qrcodejs` lazy, Deep-Link `?add=CODE`), Blockieren (`S.blocked`, lokal); Privatsphäre `S.privacy` {gym,live,lastWk,stats,prs,feed} filtert `_pushSocialProfile`-Payload; Gamification: Monats-Ranking (`profile.month`), Challenge 12 Workouts/Monat, Badges. Opt-in via `S.socialOn`; Karte = Leaflet lazy + Carto + Nominatim; Heute-Widget `social`. **Wichtig:** Rules unten (profiles inkl. activities, requests, RTDB-presence-read) müssen in der Firebase-Konsole stehen + neue Keys im users-hasOnly — sonst permission-denied beim KOMPLETTEN users-Push.

## Zweisprachigkeit (DE/EN) — Display-Layer

**Konzept:** Interne Daten bleiben **deutsch** (Übungsnamen, Gruppen-IDs, Cloud-Felder, `PLAN_TEMPLATES`-Lookups, Firestore-`hasOnly`-Keys). Nur die **Anzeige** wird übersetzt — kein Lookup/keine Rule bricht.

**Sprachwahl:** `localStorage['gt_lang']` = `'auto'|'de'|'en'` (Toggle in Einstellungen → „Sprache · Language"). `'auto'` = Gerätesprache (`navigator.language`, nicht-deutsch → Englisch). Konstanten `GT_LANG`/`GT_LOCALE`/`GT_DEC` direkt nach `APP_VERSION`.

**Mechanik (I18N-Block direkt nach `APP_VERSION`):**
- `I18N_EN{}` = exakte Phrasen (getrimmter Textknoten → EN). `I18N_RX[]` = Regex für dynamische/zusammengesetzte Texte (Mengen, Fragmente, Inline-Icon-Buttons).
- `tr(s)`: normalisiert `&nbsp;`→Space, dann exakte Phrase → `·`-Segmente → Regex. Bei `GT_LANG!=='en'` unverändert.
- Boot-Pass `_trTree(document.body)` + `MutationObserver` übersetzen statische + per `innerHTML` gerenderte Texte/Attribute (`placeholder/title/aria-label/alt`) live. `alert/confirm/prompt` sind mit `tr()` gewrappt.
- Data-Arrays werden bei EN einmalig gemappt: `MUSCLE_GROUPS`, `ALL_MUSCLES`, `MUSCLES`, `GROUP_MODES`, `DAYS`, `_WD_LBL`, `MONATE`, `SET_TYPE_TITLE`. Dezimaltrenner via `GT_DEC`; Datum via `GT_LOCALE`.
- Widget-/Live-Activity-Payloads (`_pushWidgetData`, `_planLabelFor`, `_startLiveActivity`) laufen durch `tr()`. Native Swift-Strings: Helfer `GTL(de,en)` in `GymTrackWidget.swift`/`GymTrackLiveActivity.swift` (folgt `Locale.preferredLanguages`).

**REGEL bei jedem neuen User-Text:** deutschen String **zusätzlich in `I18N_EN`** eintragen (oder RX-Regel bei dynamischen Teilen). Fallstricke: Icon klebt oft im selben Textknoten (`▶ Training starten` → RX statt exakt); `<b>`/`<u>` zerteilen Sätze in mehrere Knoten (jedes Fragment einzeln eintragen); `·`-getrennte Teile brauchen die **bare** Wortform (nicht nur `„Wort ·"`).

## Sicherheit & wichtige Invarianten

- **XSS:** Alle frei eingegebenen Texte (Übungsnamen, Plan-/Split-Namen, Tracker-Labels, Notizen) MÜSSEN beim `innerHTML`-Rendern durch `esc()` (Function-Declaration nahe `maxW()`). Daten wandern per Cloud-Sync → sonst Stored XSS. Bei jedem neuen `innerHTML`-Template mit User-Text `esc(...)` verwenden.
- **Progression (Double Progression):** Aufwärmsätze zählen NICHT zum Satz-Soll. In `getSuggestedWeight` / `getSuggestion` / `getSuggestedReps` gilt `allSets = mainSets.length >= targetSets - warmups`. Gewichts-Erhöhung und Wdh-Reset auf Bereichsanfang passieren immer gemeinsam (sonst Rückschritt).
- **Overlay-Stacking im Training:** `WK_SUB_SHEETS` (in `openOv`/`closeOv`) verdrängt `ov-wk` statt zu stapeln (kein „Fenster in Fenster"); beim Schließen des letzten Untersheets kommt `ov-wk` zurück. `ov-wheel`/`ov-settype` sind bewusst NICHT drin — sie liegen als Picker ÜBER dem Training. `goTab` setzt `_suppressWkRestore`, damit beim Tab-Wechsel nichts aufpoppt.

## Widget-Sync (iOS)

- `_updateWidgetData(immediate)` → `_pushWidgetData()`: `immediate=true` bei `visibilitychange:hidden` + `pagehide` (iOS friert JS ein → 800ms-Debounce würde nie feuern). Zusätzlich Flush bei Kaltstart (`setTimeout 1500`) und beim Sichtbarwerden.
- App sendet 7-Tage-Pläne (`plansJson`) + `weekStartKey`. Das Widget (`GymTrackWidget.swift`, `fromDefaults()`) berechnet „Heute"-Index und Wochenzugehörigkeit LIVE — so springen Tagesplan/Kreise auch ohne App-Öffnung um Mitternacht um. Timeline reloadet 30-min + kurz nach Mitternacht. Neue Widget-Keys müssen in `WidgetDataPlugin.updateWidget` gespeichert werden.

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
      allow read: if request.auth != null && (request.auth.uid == userId || request.auth.uid == "GMm3AlNn1pVRL6cc76opBgnM9sr1"); // Admin liest fürs Dashboard
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
             'heuteLayout','weekPlan','weightLog','weightStart','restTimerSecs',
             'onboarded','userName','obGoal','obExp','obFreq',
             'socialOn','friendCode','friends','gymName','gymLat','gymLng'
           ])
        // Max. 5000 Sessions und 500 Übungen (Kostendeckel)
        && (!('sessions'  in request.resource.data) || request.resource.data.sessions.size()  <= 5000)
        && (!('exercises' in request.resource.data) || request.resource.data.exercises.size() <= 500);
    }
    // Community: öffentliches Opt-in-Profil (Rangliste/Freunde/Gym-Karte).
    // Lesen: jeder Angemeldete (nötig für Code-Lookup + Freunde-Ranglisten).
    match /profiles/{userId} {
      allow read: if request.auth != null;
      allow create, update: if request.auth != null
        && request.auth.uid == userId
        && request.resource.data.keys().hasOnly([
             'name','code','photo','gymName','gymLat','gymLng',
             'week','month','streak','lastWk','live','stats','friends','updatedAt'
           ])
        && request.resource.data.name is string
        && request.resource.data.name.size() <= 30
        && (!('friends' in request.resource.data) || request.resource.data.friends.size() <= 100);
      allow delete: if request.auth != null && request.auth.uid == userId;

      // Activity-Feed: jeder schreibt nur eigene Aktivitäten; Freunde dürfen
      // AUSSCHLIESSLICH das reactions-Feld ändern (Emoji-Reaktionen/Likes).
      match /activities/{aid} {
        allow read: if request.auth != null;
        allow create, delete: if request.auth != null && request.auth.uid == userId;
        allow update: if request.auth != null
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['reactions']);
      }

      // Foto-Posts (Workout-Share-Flow): Autor schreibt/löscht; 'friends'-Posts
      // liest nur, wen der Autor als Freund führt (get() aufs Profil); 'public'
      // liest jeder Angemeldete. Fremd-Update NUR aufs flames-Feld (Flammen-Reaction).
      match /posts/{pid} {
        allow read: if request.auth != null && (
          resource.data.visibility == 'public'
          || request.auth.uid == userId
          || get(/databases/$(database)/documents/profiles/$(userId)).data.friends.hasAny([request.auth.uid])
        );
        allow create: if request.auth != null && request.auth.uid == userId
          && request.resource.data.visibility in ['friends','public']
          && request.resource.data.keys().hasOnly([
               'ts','visibility','img','imgPath','layout','dayName','dur','mgs','gym','name','photo','flames'
             ])
          && request.resource.data.dayName is string && request.resource.data.dayName.size() <= 60;
        allow delete: if request.auth != null && request.auth.uid == userId;
        allow update: if request.auth != null
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['flames']);
      }
    }
    // Melden von Posts (Community-Moderation): create-only, nur Admin liest.
    match /reports/{rid} {
      allow create: if request.auth != null
        && request.resource.data.reporter == request.auth.uid
        && request.resource.data.keys().hasOnly(['reporter','authorUid','postId','kind','ts']);
      allow read: if request.auth != null && request.auth.uid == "GMm3AlNn1pVRL6cc76opBgnM9sr1";
    }
    // Freundschaftsanfragen (senden → annehmen/ablehnen; Absender räumt akzeptierte auf)
    match /requests/{rid} {
      allow read: if request.auth != null
        && (resource.data.from == request.auth.uid || resource.data.to == request.auth.uid
            || request.auth.uid == "GMm3AlNn1pVRL6cc76opBgnM9sr1"); // Admin zählt fürs Dashboard
      allow create: if request.auth != null
        && request.resource.data.from == request.auth.uid
        && request.resource.data.status == 'pending'
        && request.resource.data.keys().hasOnly(['from','to','fromName','fromCode','ts','status']);
      allow update: if request.auth != null
        && resource.data.to == request.auth.uid
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status']);
      allow delete: if request.auth != null
        && (resource.data.from == request.auth.uid || resource.data.to == request.auth.uid);
    }
    // Dashboard (nur Admin liest; geschrieben ausschliesslich vom Mac-Server via Service-Account)
    match /admin/{docId} {
      allow read: if request.auth != null && request.auth.uid == "GMm3AlNn1pVRL6cc76opBgnM9sr1";
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

**Storage: NICHT verwendet (Spark-Plan, keine Kosten).** Post-Fotos des Share-Flows werden als
komprimiertes base64-JPEG direkt im Firestore-Post-Doc (`img`-Feld) gespeichert — `_shfFeedJpeg()`
rendert 720×960 und drückt die Qualität notfalls, bis der data-URL < 0,9 MB liegt (Firestore-1-MB-Limit).
`imgPath` bleibt `null` (kein Storage-Delete). Kein Firebase Storage / Blaze-Plan / Kreditkarte nötig.
Die alte `FB.stUpload`/`stDelete`-Schnittstelle (getStorage) bleibt ungenutzt im Code — Storage-Rules
sind damit **nicht** erforderlich.

**Composite-Index: NICHT mehr nötig** (seit v202607170008). Der öffentliche Feed (`_cpgLoad`) fragt `collectionGroup('posts').where('visibility','==','public').limit(60)` **ohne** `orderBy('ts')` ab — braucht nur den automatischen Einzelfeld-Index, kein Composite. „Neueste zuerst" wird client-seitig sortiert. Früher (`where+orderBy`) warf die Abfrage ohne Index `failed-precondition` → fälschlich „offline". Nachteil: bei sehr vielen öffentlichen Posts holt `limit(60)` nicht garantiert die allerneuesten; falls der Feed mal riesig wird, wieder `orderBy('ts','desc')` rein + Composite-Index (visibility ASC, ts DESC) anlegen.

**RTDB Rules** (`REPLACE_WITH_ADMIN_UID` ersetzen):
```json
{
  "rules": {
    "presence": {
      ".read": "auth != null",
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
