# Crews — gemeinsames Wochenziel im Community-Tab

**Datum:** 2026-08-06
**Status:** Design abgestimmt, Umsetzung offen
**Betrifft:** Community-Tab (`#pg-freunde`), neues Modul `js/app-crew.js`, neue Firestore-Collection `crews`

---

## 1. Problem und Ziel

Der Community-Tab bietet heute Freundesliste, Feed, Monats-Rangliste und Gym-Karte.
Alles davon ist **Beobachtung** — man sieht, was andere getan haben. Es gibt keinen
Grund, morgen wieder zu trainieren, weil jemand anderes auf dich zählt.

Crews schließen diese Lücke: eine feste Gruppe von 5 bis 20 Leuten mit einem
**gemeinsamen Wochenziel**. Ein Balken für alle, jeder Beitrag sichtbar, und ein
Crew-Streak, der zählt, wie viele Wochen in Folge die Gruppe ihr Ziel erreicht hat.

**Erfolgskriterium:** Ein Nutzer in einer Crew trainiert häufiger als vorher, weil die
Gruppe das Ziel sonst verfehlt.

### Warum kooperativ statt kompetitiv

Eine crew-interne Rangliste würde genau die Nutzer vertreiben, für die das Feature
gedacht ist — wer dauerhaft Letzter ist, steigt aus. Die kompetitive Variante existiert
zudem bereits als Monats-Rangliste (`_renderSocBoard`). Das gemeinsame Ziel zieht
Schwächere mit, statt sie auszustellen.

### Getroffene Produktentscheidungen

| Frage | Entscheidung |
|---|---|
| Crew oder Challenge zuerst | Crew als Grundgerüst, Challenges später als Aufsatz darauf |
| Mechanik | Gemeinsames Wochenziel + Crew-Streak (kooperativ) |
| Beitritt | Nur per 6-Zeichen-Code / Deep-Link, max. 20 Mitglieder, nicht durchsuchbar |
| Zählweise | Workouts, Ziel vom Gründer gesetzt |
| Monetarisierung | Frei für alle — Crews sind ein Retention-Feature, jede Sperre bremst genau den Netzwerkeffekt |

---

## 2. Gewählter Ansatz

**Crew-Doc mit `wk`-Map.** Das Crew-Dokument trägt Metadaten *und* eine Map
`wk: {uid: anzahl}`. Jeder Client schreibt ausschließlich seinen eigenen Feldpfad
`wk.<uid>` als **absolute** Wochenzahl.

Das löst drei Probleme auf einmal:

- **Keine Schreibkonflikte.** Verschiedene Mitglieder schreiben disjunkte Feldpfade,
  Firestore merged sie ohne Transaktion.
- **Kein Doppelzählen.** Absolut statt inkrementell — ein wiederholter Write nach
  Netzwerkfehler ergibt denselben Zustand.
- **Ein Read pro Öffnen.** Der komplette Crew-Screen kommt aus einem Dokument, live
  über `onSnapshot`.

### Verworfene Alternativen

**Fortschritt aus Mitglieds-Profilen summieren.** `profiles/{uid}.week = {key, vol, ses}`
existiert bereits, der Balken wäre ohne einen einzigen neuen Write berechenbar. Scheitert
aber an der gewählten Mechanik: `week` hält **nur die laufende Woche**, vergangene Wochen
sind nicht rekonstruierbar. Crew-Streak und Historie wären damit unmöglich. Zusätzlich
20 Reads pro Öffnen statt einem.

**Zähler-Subcollection `crews/{cid}/members/{uid}`.** Feinste Historie, aber eine zweite
Wahrheitsquelle neben `profiles`, komplexere Rules und Drift-Risiko bei Offline-Nutzung.
Overkill für maximal 20 Mitglieder.

---

## 3. Datenmodell

### Firestore: `crews/{cid}`

Die Doc-ID **ist** der Beitrittscode (6 Zeichen aus `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`,
dieselbe Alphabet-Logik wie `_socCode()` — ohne O/0/I/1). Beitreten ist damit ein direkter
`getDoc`, keine Query und kein Index. Kollisionen fängt der Create ab: `exists()` prüfen,
bei Treffer neu würfeln.

```js
{
  name:     'Eisenpark Crew',   // <= 24 Zeichen
  owner:    'uid…',
  members:  ['uid…'],           // max 20
  goal:     20,                 // Workouts/Woche, 3–60, nur owner ändert
  weekKey:  '2026-W32',         // Format von getWeekKey()
  wk:       { 'uid…': 4 },      // absolute Wochenzahl je Mitglied, <= 7
  streak:   3,                  // geschaffte Wochen in Folge
  hist:     [{ key, total, goal, done }],  // letzte 8, ältere abgeschnitten
  createdAt, updatedAt
}
```

### Lokal: `S.crewId`

Ein neues Feld in `localStorage['ft4']`. **Muss zwingend in die `hasOnly`-Liste der
`users`-Rules eingetragen werden** — fehlt der Key, schlägt nicht nur der Crew-Sync fehl,
sondern der **komplette** `users`-Push mit permission-denied (dieser Fallstrick ist in
CLAUDE.md dokumentiert).

Ein Nutzer ist in v1 in **genau einer** Crew.

### Zählweise: `_crewWeekCount()`

Eine Session zählt, wenn sie **≥15 Minuten** dauerte **oder** **≥6 Sätze** enthält —
maximal eine pro Kalendertag. Ohne diesen Guard lässt sich der Balken mit
Zwei-Minuten-Sessions fluten.

Der Wert wird bei jedem Aufruf **absolut aus `S.sessions` neu berechnet**, nie
inkrementiert. Dadurch heilt der Zähler sich nach Offline-Phasen, Cloud-Merges und
nachträglich gelöschten Sessions selbst.

Wochengrenze ist Montag 00:00 lokaler Zeit, identisch zu `_weekStats()`.

### Wochen-Rollover

Sieht ein Client beim Rendern `crew.weekKey !== getWeekKey()`, führt er den Rollover in
einer **Transaktion** aus:

1. Abgelaufene Woche auswerten: `total = Summe(wk)`, `done = total >= goal`
2. An `hist` anhängen — **nur wenn der letzte Eintrag einen anderen `key` trägt**
   (schützt gegen doppeltes Anhängen bei parallelen Transaktionen)
3. `hist` auf die letzten 8 Einträge kürzen
4. `streak` = `done ? streak + 1 : 0`
5. `wk = {}`, `weekKey = getWeekKey()`

Der `weekKey`-Guard macht die Operation idempotent: egal wie viele Mitglieder gleichzeitig
die App öffnen, das Ergebnis ist dasselbe.

Verpasst eine Crew mehrere Wochen (niemand trainiert, niemand öffnet die App), wird beim
nächsten Öffnen die eine gespeicherte Woche ausgewertet und der Streak bricht. Das ist
korrekt — es hat ja tatsächlich niemand trainiert.

---

## 4. Modul-Aufteilung

**Neues Modul `js/app-crew.js`.** Der gesamte Community-Render liegt heute in
`js/app-streak.js` (3.038 Zeilen) — `renderFriendsTab`, `_renderSocBoard`,
`_renderSocMapTab`, `setSocTab`. Ein weiterer Anbau dort verschärft die
Parallelarbeits-Kollision, die der Modul-Split von 01.08. gerade aufgelöst hat.

> Nebenbefund: CLAUDE.md ordnet Freunde/Feed/Share-Card `js/app-community.js` zu.
> Tatsächlich liegt der Großteil des Community-Renderings in `js/app-streak.js`.
> Beim Umsetzen mitkorrigieren.

Registrierung des neuen Moduls an drei Stellen (Regel 5 in CLAUDE.md):

1. `<script src>`-Tag in `index.html` — **vor** `app-boot.js`
2. Eintrag in `build.js`
3. Eintrag in `sw.js` (`SHELL`)

Kein `type="module"`. Kein Top-Level-Code, der Funktionen aus späteren Dateien aufruft.

---

## 5. UI und Flows

### Platzierung

Neuer Chip `crew` in `#fr-seg` (Privat-Zone, neben `friends`/`feed`/`board`/`map`).
**Kein neuer Tab** — die vier Haupt-Tabs sind laut CLAUDE.md fix.
`setSocTab('crew')` ruft `_renderSocCrew(body)` aus `app-crew.js`.

### Ohne Crew

Empty-State mit zwei Aktionen:

- **Crew gründen** — Sheet mit Namensfeld (≤24 Zeichen) und Ziel-Stepper (3–60)
- **Beitreten** — Sheet mit 6-Zeichen-Code-Feld, Optik identisch zum Freundescode-Flow

### Mit Crew

```
Crew-Name                    [Code teilen]
━━━━━━━━━━━━━━━━░░░░  14 / 20
Noch 6 Workouts bis Sonntag

Crew-Streak  3 Wochen        Woche endet in 2 Tagen

Lenny      ████████  5
Max        ██████    4
Jonas      ████      3
Anna       ██        2
Tim        ·         0
────────────────────────
letzte 8 Wochen:  ✓✓✗✓✓✓✓·
```

Beitragsliste absteigend sortiert, Avatare über `_socInitials` bzw. `profile.photo` wie
in der Freundesliste. **Wer bei 0 steht, wird nicht rot markiert** — nur ein dezenter
Punkt. Kooperativ heißt: kein Pranger.

### Teilen und Beitritt

- Deep-Link `gymtrack://crew/ABC123`, https-Variante als klickbarer Träger mit Auto-Sprung
- QR über das bereits lazy geladene `qrcodejs`
- Cold-Start-Parameter `?crew=CODE`, behandelt wie das bestehende `?add=CODE`

### Schreib-Hook

`_crewPush()` läuft in `finishWk()` direkt nach dem bestehenden Profil-Push und schreibt
`wk.<uid>` plus `weekKey`. Zusätzlich beim App-Start, falls offline trainiert wurde.

`_crewPush()` bricht bei Demo-Modus / `DEMO_SEED` sofort ab — genau wie
`_pushSocialProfile()` es tut. Sonst landen Fake-Crews in der echten Datenbank.

### Live-Updates

`onSnapshot` auf das Crew-Doc, Start/Stop analog `_frStartLive`/`_frStopLive`.
**Listener beim Tab-Wechsel stoppen** — ein weiterlaufender Listener ist im Repo schon
einmal aufgetreten.

### Verlassen und Auflösen

- Mitglied entfernt die eigene uid aus `members`
- Owner verlässt die Crew → Crew wird gelöscht, mit Bestätigungstext, der die
  Mitgliederzahl nennt („Crew wird für alle 7 Mitglieder aufgelöst")
- Letztes verbleibendes Mitglied löscht das Doc mit (keine verwaisten Crews)
- Owner-Übergabe ist **nicht** Teil von v1

### Pflichtregeln der Oberfläche

- **Keine Emojis.** Alle Symbole als `ICO.*`-SVG bzw. inline-`<svg>` im Header-Stil.
- **Zweisprachigkeit.** Jeder neue deutsche String zusätzlich in `I18N_EN`, bei
  dynamischen Teilen als `I18N_RX`-Regel. `·`-getrennte Fragmente einzeln eintragen.
- **XSS.** Crew-Name und alle Nutzernamen laufen beim `innerHTML`-Rendern durch `esc()`.

---

## 6. Firestore Rules

```
match /crews/{cid} {
  function isMember() { return resource.data.members.hasAny([request.auth.uid]); }
  function ch()       { return request.resource.data.diff(resource.data).affectedKeys(); }

  allow read: if request.auth != null;

  allow create: if request.auth != null
    && request.resource.data.owner == request.auth.uid
    && request.resource.data.members == [request.auth.uid]
    && request.resource.data.keys().hasOnly([
         'name','owner','members','goal','weekKey','wk','streak','hist','createdAt','updatedAt'
       ])
    && request.resource.data.name is string && request.resource.data.name.size() <= 24
    && request.resource.data.goal is int
    && request.resource.data.goal >= 3 && request.resource.data.goal <= 60;

  allow update: if request.auth != null && (
    // beitreten: genau die eigene uid dazu, max 20
    (ch().hasOnly(['members','updatedAt'])
      && !isMember() && request.resource.data.members.hasAny([request.auth.uid])
      && request.resource.data.members.hasAll(resource.data.members)
      && request.resource.data.members.size() == resource.data.members.size() + 1
      && request.resource.data.members.size() <= 20)
    // verlassen: nur sich selbst raus
    || (ch().hasOnly(['members','wk','updatedAt'])
      && isMember() && !request.resource.data.members.hasAny([request.auth.uid])
      && resource.data.members.hasAll(request.resource.data.members))
    // zählen: nur der eigene wk-Feldpfad, hart gedeckelt
    || (ch().hasOnly(['wk','weekKey','updatedAt']) && isMember()
      && request.resource.data.wk.diff(resource.data.wk).affectedKeys().hasOnly([request.auth.uid])
      && request.resource.data.wk[request.auth.uid] is int
      && request.resource.data.wk[request.auth.uid] <= 7)
    // rollover: nur bei echtem Wochenwechsel
    || (ch().hasOnly(['wk','weekKey','streak','hist','updatedAt']) && isMember()
      && request.resource.data.weekKey != resource.data.weekKey
      && request.resource.data.hist.size() <= 8)
    // owner: Name, Ziel, Mitglied entfernen
    || (ch().hasOnly(['name','goal','members','updatedAt'])
      && resource.data.owner == request.auth.uid
      && request.resource.data.goal >= 3 && request.resource.data.goal <= 60)
  );

  allow delete: if request.auth != null
    && (resource.data.owner == request.auth.uid
        || (isMember() && resource.data.members.size() == 1));
}
```

Zusätzlich `'crewId'` in die `hasOnly`-Liste des `users`-Blocks.

**Deploy-Reihenfolge:** Beide Rules-Änderungen müssen in der Firebase-Konsole
veröffentlicht sein, **bevor** der Client-Code live geht. Sonst läuft nicht nur der
Crew-Sync auf permission-denied, sondern der gesamte `users`-Push.

Kein Index nötig — alle Zugriffe laufen über die Doc-ID.

---

## 7. Bewusst akzeptierte Risiken

**Der Rollover-Zweig ist bewusst lose.** Jedes Mitglied darf `streak` und `hist`
schreiben; Rules können eine Aggregation über bis zu 20 Fremdwerte nicht nachrechnen.
Die Vertrauensgrenze ist die eingeladene Crew: maximal 20 Personen, Code nicht auffindbar,
Beitritt nur über geteilten Link. Der Zähl-Zweig ist dagegen hart begrenzt (ausschließlich
eigener Feldpfad, Wert ≤7 — die Obergrenze folgt direkt aus „max. 1 Workout pro
Kalendertag").

**Wochenwechsel läuft in lokaler Zeitzone** (`getWeekKey()`, bestehend). Mitglieder in
verschiedenen Zeitzonen rollen versetzt. Für Freundeskreise irrelevant.

**Crews setzen `S.socialOn` voraus** — wie der gesamte Community-Tab.

---

## 8. Umfang v1

**Enthalten:** Crew gründen, beitreten per Code/Deep-Link/QR, Crew-Screen mit Balken und
Beitragsliste, Crew-Streak, Wochen-Historie (8 Wochen), Rollover, Verlassen und Auflösen,
Ziel und Name durch den Owner änderbar.

**Nicht enthalten:** Challenges, Crew-Chat, Push-Erinnerungen, mehrere Crews gleichzeitig,
öffentliche Crew-Suche, Heute-Widget, Owner-Übergabe.

Challenges bauen später auf demselben Crew-Doc auf — das Datenmodell trägt sie bereits.

---

## 9. Tests

Neue Unit-Tests:

- `_crewWeekCount` — 15-Minuten-Guard, 6-Sätze-Guard, max. 1 pro Kalendertag,
  Wochengrenze Montag 00:00
- Rollover — Streak +1 bei erreichtem Ziel, Reset bei verfehltem, `hist`-Cap bei 8,
  kein doppelter `hist`-Eintrag bei gleichem `key`
- Beitritt — Grenze bei 20 Mitgliedern

Vor dem Melden: `npm test` (670 grün) und `node smoke.js`.
