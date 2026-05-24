# GymTrack – Projektübersicht für Claude

## Was ist das?
GymTrack ist eine **Progressive Web App (PWA)** – eine einzelne HTML-Datei, die als App auf dem iPhone installiert ist.  
Live-URL: https://lenny23445.github.io/Gymtrack/

## Dateien
| Datei | Zweck |
|---|---|
| `index.html` | Die gesamte App (HTML + CSS + JS in einer Datei) |
| `sw.js` | Service Worker – cached die App für Offline-Nutzung |
| `manifest.json` | PWA-Metadaten (Name, Icons, Farbe) |
| `GymTrack-Update.ps1` | Deploy-Script – Doppelklick = hochladen |

## Deployen (App aktualisieren)
```
Doppelklick auf: C:\Users\wolte\Desktop\GymTrack-Update.ps1
```
Das Script:
1. Bumpt die Version in `sw.js` + `index.html` (wichtig für Auto-Updates)
2. Macht `git add . && git commit && git push`

**WICHTIG beim manuellen Versionsbump via PowerShell:**  
Immer `.NET` direkt benutzen, NICHT `Get-Content`/`Set-Content` – sonst wird das Encoding kaputt:
```powershell
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$html = [System.IO.File]::ReadAllText($path, $utf8NoBom)
$html = $html -replace "gymtrack-v\d+", "gymtrack-v$version"
[System.IO.File]::WriteAllText($path, $html, $utf8NoBom)
```

## Architektur – index.html
Die Datei ist in drei Blöcke aufgeteilt:

### CSS (oben)
- **Themes**: `[data-theme="light"]`, `[data-theme="rosa"]`, `[data-theme="dark"]`, `[data-theme="blau"]`
- **Variablen**: `--acc` (Akzentfarbe), `--acc-rgb`, `--mesh` (Hintergrund-Gradient), `--gl-bg` (Glass-Cards), etc.
- Neue Themes brauchen: CSS-Block + `[data-theme="X"] #tab-indicator` + Theme-Row im HTML + Name in `setTheme()`

### HTML (mitte)
Seitenstruktur:
- `#pg-heute` – Startseite
- `#pg-uebungen` – Übungsliste mit Muskelgruppen-Filter
- `#pg-einstellungen` – Einstellungen
- `.ov` Overlays = Bottom Sheets (z.B. `#ov-companion`, `#ov-icons`)
- `#dackel-lane` – Der Dackel, der auf der Tab-Leiste läuft

### JavaScript (unten)
Wichtige Bereiche:
```
APP_VERSION        – muss immer mit sw.js CACHE-String übereinstimmen
S = {}             – Alle App-Daten (localStorage key: 'ft4')
persist()          – Speichert S in localStorage
setTheme(t)        – Wechselt Theme (light/rosa/dark/blau)
applyCompanion()   – Zeigt/versteckt Dackel + setzt Toggle-Zustand
checkForUpdate()   – Holt sw.js direkt vom Server, vergleicht Version
_doForceUpdate()   – Deregistriert SW, leert Cache, lädt neu
initSheetSwipe()   – Swipe-to-dismiss für alle Bottom Sheets
```

## Datenstruktur (localStorage 'ft4')
```javascript
S = {
  exercises: [],      // { id, name, emoji, muscleGroup, sets: [{reps,weight}] }
  sessions: [],       // { date, exercises: [{id, sets}] }
  theme: 'light',     // 'light' | 'rosa' | 'dark' | 'blau'
  companion: 'dackel',// welcher Begleiter gewählt
  companionOn: true,  // Begleiter sichtbar?
}
```

## Features (bereits implementiert)
- ✅ Übungen mit Muskelgruppen (Brust/Rücken/Beine/Arme/Schultern/Core)
- ✅ Muskelgruppen-Filter in Übungen-Tab + beim Training starten
- ✅ Training starten, Sätze loggen, Progression (Gewichtsvorschläge)
- ✅ Bottom Sheets mit Swipe-to-dismiss (Handle ziehen)
- ✅ Themes: Hell, Rosa, Dunkel, Blau
- ✅ Dackel-Begleiter auf der Tab-Leiste (animiert, läuft hin und her)
- ✅ Begleiter ein/ausschalten per Toggle
- ✅ Begleiter-Picker (aktuell nur Dackel verfügbar, andere "Bald")
- ✅ Auto-Update: App prüft sw.js direkt vom Server (kein SW-API)
- ✅ Stille Hintergrundprüfung beim App-Start (nach 3 Sek.)

## Wichtige Code-Muster

### Neues Bottom Sheet hinzufügen
```html
<div class="ov" id="ov-meinsheet" onclick="if(event.target===this)closeOv('ov-meinsheet')">
  <div class="sheet">
    <div class="sh-handle"></div>
    <div class="sh-head">
      <h2>Titel</h2>
      <button class="x-btn" onclick="closeOv('ov-meinsheet')">✕</button>
    </div>
    <!-- Inhalt -->
  </div>
</div>
```
Öffnen: `openOv('ov-meinsheet')` — Schließen: `closeOv('ov-meinsheet')`  
`initSheetSwipe()` läuft automatisch beim Start und macht alle `.sh-handle` swipeable.

### Neuen Settings-Toggle hinzufügen
```html
<div class="row">
  <div class="ico">🔔</div>
  <div class="row-body">
    <div class="row-title">Mein Toggle</div>
    <div class="row-sub">Beschreibung</div>
  </div>
  <label class="tgl" onclick="event.stopPropagation()">
    <input type="checkbox" id="mein-toggle" onchange="meineFunktion(this.checked)">
    <span class="tgl-track"></span>
  </label>
</div>
```

### Neue Seite/Tab ist NICHT geplant
Tabs sind: Heute, Übungen, Einstellungen. Keine weiteren Tabs hinzufügen.

## Bekannte Eigenheiten
- **iOS Safari + PWA**: Service Worker Updates kommen ohne unsere Lösung nicht durch
- **Encoding**: Immer `.NET`-Methoden benutzen, nie `Get-Content`/`Set-Content` (fügt BOM + Mojibake ein)
- **Emojis im Code**: Die Datei ist UTF-8 ohne BOM. Edit-Tool erhält das korrekt.
- **Preview-Server**: Läuft auf Port 5500, Config in `.claude/launch.json`

## GitHub
- Repo: https://github.com/Lenny23445/Gymtrack
- Branch: `main`
- Pages: automatisch von `main` → live in ~1 Minute nach Push

## Firebase / Google Login (Cloud-Sync)
Die App hat einen Google-Login mit Cloud-Sync via Firebase Firestore. Bis die Config gesetzt ist, zeigt die App "noch nicht eingerichtet" in den Einstellungen → Konto.

### Einmaliges Setup (5–10 Min)
1. https://console.firebase.google.com → **Projekt hinzufügen** (Name: z.B. "GymTrack")
2. **Build → Authentication → Get Started → Google** aktivieren (Support-Email auswählen)
3. **Build → Firestore Database → Create database** → Modus: **Production** → Region z.B. `eur3`
4. In **Firestore → Rules** folgende Regeln einfügen (jeder User darf nur sein eigenes Dokument lesen/schreiben):
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
5. **Projektübersicht → Web-App hinzufügen (</>-Icon)** → Name eingeben → registrieren → die `firebaseConfig` kopieren
6. In `index.html` nach `const FIREBASE_CONFIG = {` suchen, die Werte einsetzen
7. **Authentication → Settings → Authorized domains**: `lenny23445.github.io` hinzufügen (für Live-Site) — `localhost` ist standardmäßig schon drin

### Datenmodell (Firestore)
- Collection: `users`
- Document: `{uid}` (Google-User-ID)
- Felder: `exercises[]`, `sessions[]`, `theme`, `companion`, `companionOn`, `updatedAt`, `_serverTime`

### Sync-Verhalten
- **Beim Login**: lokale + Cloud-Daten werden gemerged (nichts geht verloren), dann hochgeladen
- **Beim Speichern**: persist() pusht automatisch (800ms debounced) in die Cloud
- **Live-Sync**: Änderungen von anderen Geräten kommen via `onSnapshot` rein
- **Beim Abmelden**: lokale Daten bleiben, Cloud-Verbindung wird getrennt
- **Auf neuem Gerät / nach App-Löschen**: einfach wieder anmelden → alle Daten kommen aus der Cloud
