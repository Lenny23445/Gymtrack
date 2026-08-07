// ── GymTrack Push-Absender (Cloudflare Worker) ─────────────────────────────
// Nimmt {toUid, idToken} von der App entgegen, liest den APNs-Push-Token des
// Empfängers aus Firestore und schickt eine Push über Apple APNs.
// Dein geheimer .p8-Schlüssel bleibt NUR hier als Worker-Secret. Kein Blaze,
// kein Firebase-SDK. Kosten: 0 €.
//
// Sicherheit — ein gueltiges idToken allein reicht NICHT. Drei Huerden:
//   1. Identitaet: die UID kommt aus der idToken-Payload, die SIGNATUR prueft
//      Firestore beim Profil-Read (401 => raus). Ein gebasteltes Token kommt
//      also nicht durch, obwohl der Worker selbst nichts kryptografisch prueft.
//   2. Beziehung: Absender und Empfaenger muessen einander als Freund fuehren
//      (eine Richtung genuegt, Follow-Modell). Sonst 403 — vorher konnte jedes
//      angemeldete (auch anonyme) Konto jeden Nutzer zuspammen.
//   3. Menge: Tageslimit pro Absender-UID und pro Absender/Empfaenger-Paar (KV).
//   Der Anzeigename kommt aus dem Absender-Profil in Firestore, NICHT aus dem
//   Request-Body — sonst kann sich jeder als beliebige Person ausgeben.
//
// Secrets (im Cloudflare-Dashboard setzen, NICHT hier eintippen):
//   APNS_KEY_P8   = kompletter Inhalt der .p8-Datei (mit BEGIN/END-Zeilen)
//   APNS_KEY_ID   = 10-stellige Key-ID vom Apple-Push-Key
//   APNS_TEAM_ID  = deine Apple Team-ID (10-stellig)
//
// Bindings:
//   PUSH_QUOTA (KV Namespace) = Tageszaehler der Push-Absender (p:{uid}:{YYYY-MM-DD}).
//                  Ersatzweise wird ein als AI_QUOTA gebundener Namespace benutzt
//                  (anderes Praefix, kollidiert nicht mit dem KI-Worker).
//                  OHNE Binding gibt es KEIN Mengenlimit — die Beziehungspruefung
//                  greift trotzdem.
// Optionale Vars (nicht geheim):
//   PUSH_DAILY               = Pushes/Tag pro Absender insgesamt (Default 60)
//   PUSH_DAILY_PER_RECIPIENT = Pushes/Tag pro Absender an EINEN Empfaenger (Default 10)

const FIREBASE_PROJECT = "gymtrack-25d39";
const BUNDLE_ID        = "com.wolter.gymtrack";
const APNS_HOST         = "https://api.push.apple.com";         // Production (TestFlight + App Store)
const APNS_HOST_SANDBOX = "https://api.sandbox.push.apple.com"; // Xcode-Debug-Builds

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST")    return json({ error: "POST only" }, 405, cors);

    let body;
    try { body = await request.json(); } catch (e) { return json({ error: "bad json" }, 400, cors); }
    const { toUid, idToken, cid } = body || {};
    if (!toUid || !idToken || typeof toUid !== "string" || typeof idToken !== "string" || toUid.length > 128)
      return json({ error: "toUid+idToken required" }, 400, cors);
    /* Anlass. 'flame' ist der Altbestand (Reaktion auf einen Post) und bleibt
       der Standard, damit aeltere App-Staende ohne kind-Feld weiterlaufen.
       'live'/'crewlive' melden ein gerade gestartetes Training. */
    const kind = ["flame", "live", "crewlive"].includes(body && body.kind) ? body.kind : "flame";
    if (kind === "crewlive" && (typeof cid !== "string" || !/^[A-Z0-9]{6}$/.test(cid)))
      return json({ error: "cid required" }, 400, cors);

    // 1) Wer schickt? UID aus der Token-Payload; Gueltigkeit prueft Schritt 2.
    const fromUid = uidFromIdToken(idToken);
    if (!fromUid) { console.log("[PUSH] idToken unlesbar oder fremdes Projekt"); return json({ error: "bad idToken" }, 401, cors); }
    console.log("[PUSH] Anfrage rein: from=", fromUid, "toUid=", toUid);

    // 2) Absender-Profil lesen. Erfuellt zwei Zwecke: Firestore verifiziert dabei
    //    die Token-Signatur (ungueltig => 401), und wir bekommen Anzeigename +
    //    Freundesliste vom Server statt vom Client.
    const from = await fsProfile(fromUid, idToken);
    if (from.status === 401 || from.status === 403) { console.log("[PUSH] FEHLER: Auth fehlgeschlagen, status=", from.status); return json({ error: "auth failed", status: from.status }, 401, cors); }
    if (!from.doc) { console.log("[PUSH] Absender hat kein Community-Profil, status=", from.status); return json({ error: "sender profile required", status: from.status }, 403, cors); }
    const fromName = sanitize(fsString(from.doc, "name"));

    // 3) Mengenlimit pro Absender — auch fehlgeschlagene Zustellversuche zaehlen,
    //    damit Durchprobieren teuer bleibt.
    const quota = await pushQuota(env, fromUid, toUid);
    if (!quota.ok) { console.log("[PUSH] Rate-Limit", quota.scope, quota.used, "/", quota.limit, "fuer", fromUid); return json({ error: "rate limit", scope: quota.scope, limit: quota.limit }, 429, cors); }

    // 4) Empfaenger-Profil lesen und Beziehung pruefen. Follow-Modell: eine
    //    Richtung genuegt (Flamme auf einen oeffentlichen Post eines Fremden
    //    erzeugt bewusst KEINE Push mehr).
    const to = await fsProfile(toUid, idToken);
    if (!to.doc) { console.log("[PUSH] Empfaenger-Profil nicht lesbar, status=", to.status); return json({ error: "recipient unavailable", status: to.status }, 404, cors); }
    /* Nur die Liste des EMPFAENGERS zaehlt. Die eigene friends-Liste ist
       client-kontrolliert (jeder darf sein Profil schreiben) — wer sich selbst
       den Empfaenger eintraegt, haette sich sonst die Zustellung erlaubt.
       Wer Mitteilungen bekommt, entscheidet damit selbst, von wem. */
    let related = fromUid === toUid
               || fsStringArray(to.doc, "friends").includes(fromUid);
    /* Gruppen-Mitteilung: Gruppenleute muessen nicht befreundet sein. Die
       Berechtigung kommt dann aus dem Gruppendokument — und zwar SERVERSEITIG
       gelesen, nicht aus dem Client-Body: beide muessen dort in members stehen. */
    if (!related && kind === "crewlive") {
      const crew = await fsDoc(`crews/${cid}`, idToken);
      const mem  = crew.doc ? fsStringArray(crew.doc, "members") : [];
      related = mem.includes(fromUid) && mem.includes(toUid);
      if (!related) console.log("[PUSH] ABGELEHNT: ", fromUid, "und", toUid, "nicht in derselben Gruppe", cid);
    }
    if (!related) { console.log("[PUSH] ABGELEHNT: ", fromUid, "und", toUid, "sind nicht befreundet"); return json({ error: "not friends" }, 403, cors); }

    /* Der EMPFAENGER entscheidet, ob er Trainings-Meldungen will. Steht das
       Feld auf false, wird nicht zugestellt — die Flammen-Mitteilung bleibt
       davon unberuehrt, sie ist eine direkte Reaktion auf seinen eigenen Post. */
    if (kind !== "flame" && fsBool(to.doc, "notifLive") === false) {
      console.log("[PUSH] Empfaenger will keine Trainings-Mitteilungen:", toUid);
      return json({ ok: true, skipped: "opted out" }, 200, cors);
    }

    const token = fsString(to.doc, "pushToken");
    if (!token) { console.log("[PUSH] KEIN pushToken im Profil des Empfaengers", toUid, "-> Empfaenger hat nie registriert"); return json({ ok: true, skipped: "no pushToken" }, 200, cors); }
    console.log("[PUSH] Empfaenger-Token gefunden, laenge=", token.length);

    // 5) APNs-JWT signieren + 6) Push senden — beides abgesichert: ein kaputtes
    // APNS_KEY_P8-Secret (z.B. ungueltiges Base64) wuerde sonst als uncaught
    // Exception ohne CORS-Header rausgehen -> Client sieht nur "Load failed"
    // statt des echten Grunds.
    try {
      const jwt = await apnsJwt(env);

      const payload = JSON.stringify({
        aps: {
          alert: { title: "MyGymTrack", body: alertText(kind, fromName) },
          sound: "default",
          // Kein hardcodiertes badge:1 mehr — der Worker kennt die echte Unread-Zahl
          // nicht (stateless) und hätte bei jeder Push den Badge wieder auf 1 gesetzt,
          // selbst wenn die App ihn gerade erst auf 0 zurückgesetzt hatte. Badge wird
          // jetzt ausschließlich clientseitig verwaltet (AppDelegate: Reset bei App-Start).
        },
      });
      const send = (host) => fetch(`${host}/3/device/${token}`, {
        method: "POST",
        headers: {
          authorization: `bearer ${jwt}`,
          "apns-topic": BUNDLE_ID,
          "apns-push-type": "alert",
          "apns-priority": "10",
        },
        body: payload,
      });
      let apnsRes = await send(APNS_HOST);
      if (!apnsRes.ok) {
        let detail = await apnsRes.text();
        // Xcode-Debug-Builds registrieren SANDBOX-Device-Tokens; ein Sandbox-only-Key
        // wirft auf Production BadEnvironmentKeyInToken. In beiden Faellen: Sandbox probieren.
        if (/BadDeviceToken|BadEnvironmentKeyInToken/.test(detail)) {
          console.log("[PUSH] Production lehnt ab (", detail.trim(), ") -> versuche Sandbox");
          apnsRes = await send(APNS_HOST_SANDBOX);
          if (apnsRes.ok) { console.log("[PUSH] OK via SANDBOX"); return json({ ok: true, env: "sandbox" }, 200, cors); }
          detail = await apnsRes.text();
        }
        console.log("[PUSH] APNs LEHNT AB: status=", apnsRes.status, "detail=", detail);
        return json({ error: "apns failed", status: apnsRes.status, detail }, 502, cors);
      }
      console.log("[PUSH] OK -> APNs hat Push angenommen");
      return json({ ok: true }, 200, cors);
    } catch (e) {
      console.log("[PUSH] FEHLER beim Signieren/Senden:", e && e.message || e);
      return json({ error: "sign/send failed", detail: String(e && e.message || e) }, 500, cors);
    }
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj),
    { status, headers: { "Content-Type": "application/json", ...cors } });
}
function sanitize(s) {
  if (typeof s !== "string") return "";
  let out = "";
  for (const ch of s) { if (ch.charCodeAt(0) >= 32) out += ch; }
  return out.slice(0, 40);
}

// ── Absender-Identitaet ────────────────────────────────────────────────────
// Liest NUR die Payload (kein Signaturcheck) — das erledigt Firestore beim
// anschliessenden Profil-Read mit demselben Token. Der aud-Vergleich haelt
// Tokens fremder Firebase-Projekte fern.
function uidFromIdToken(tok) {
  try {
    const parts = String(tok).split(".");
    if (parts.length !== 3) return null;
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes));
    if (claims.aud !== FIREBASE_PROJECT) return null;
    const uid = claims.user_id || claims.sub;
    return typeof uid === "string" && uid ? uid : null;
  } catch (e) { return null; }
}

// ── Firestore-Profile (REST, mit dem Login des Absenders) ──────────────────
async function fsProfile(uid, idToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}` +
              `/databases/(default)/documents/profiles/${encodeURIComponent(uid)}`;
  let res;
  try { res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } }); }
  catch (e) { return { status: 0, doc: null }; }
  if (!res.ok) return { status: res.status, doc: null };
  try { return { status: 200, doc: await res.json() }; }
  catch (e) { return { status: 0, doc: null }; }
}
function fsString(doc, key) {
  const f = doc && doc.fields && doc.fields[key];
  return (f && typeof f.stringValue === "string") ? f.stringValue : "";
}
function fsBool(doc, key) {
  const f = doc && doc.fields && doc.fields[key];
  return (f && typeof f.booleanValue === "boolean") ? f.booleanValue : null;
}
/* Beliebiges Dokument mit dem Login des Absenders lesen. Die Rules entscheiden,
   ob er es sehen darf — der Worker umgeht nichts. */
async function fsDoc(pfad, idToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}` +
              `/databases/(default)/documents/${pfad}`;
  let res;
  try { res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } }); }
  catch (e) { return { status: 0, doc: null }; }
  if (!res.ok) return { status: res.status, doc: null };
  try { return { status: 200, doc: await res.json() }; }
  catch (e) { return { status: 0, doc: null }; }
}
/* Meldungstext je Anlass. Bewusst zweisprachig-neutral gehalten: der Worker
   kennt die Geraetesprache nicht, deshalb kurze deutsche Saetze wie bisher. */
function alertText(kind, fromName) {
  const wer = fromName || "Jemand";
  if (kind === "live")     return `${wer} trainiert gerade`;
  if (kind === "crewlive") return `${wer} trainiert gerade — zieh mit`;
  return `${wer} hat mit einer Flamme reagiert`;
}
function fsStringArray(doc, key) {
  const f = doc && doc.fields && doc.fields[key];
  const vals = (f && f.arrayValue && f.arrayValue.values) || [];
  return vals.map((v) => v && v.stringValue).filter((s) => typeof s === "string");
}

// ── Tageslimit pro Absender (Cloudflare KV) ────────────────────────────────
// Zwei Zaehler: Gesamtmenge pro Tag und Menge an EINEN Empfaenger pro Tag.
// Faellt bei fehlendem Binding oder KV-Stoerung offen aus (wie im ai-worker) —
// die Beziehungspruefung bleibt die eigentliche Sperre, das Limit ist die
// Spam-Bremse und darf den Normalbetrieb nicht abschiessen.
async function pushQuota(env, fromUid, toUid) {
  const kv = env.PUSH_QUOTA || env.AI_QUOTA;
  if (!kv) return { ok: true, counted: false };
  const dayLimit  = parseInt(env.PUSH_DAILY) || 60;
  const pairLimit = parseInt(env.PUSH_DAILY_PER_RECIPIENT) || 10;
  const day   = new Date().toISOString().slice(0, 10);
  const kDay  = `p:${fromUid}:${day}`;
  const kPair = `p:${fromUid}>${toUid}:${day}`;
  const ttl   = { expirationTtl: 2 * 86400 };
  try {
    const [dayRaw, pairRaw] = await Promise.all([kv.get(kDay), kv.get(kPair)]);
    const dayUsed  = parseFloat(dayRaw)  || 0;
    const pairUsed = parseFloat(pairRaw) || 0;
    if (dayUsed  >= dayLimit)  return { ok: false, scope: "day",  used: dayUsed,  limit: dayLimit };
    if (pairUsed >= pairLimit) return { ok: false, scope: "pair", used: pairUsed, limit: pairLimit };
    await Promise.all([
      kv.put(kDay,  String(dayUsed  + 1), ttl),
      kv.put(kPair, String(pairUsed + 1), ttl),
    ]);
    return { ok: true, counted: true };
  } catch (e) {
    console.log("[PUSH] KV-Stoerung, Limit uebersprungen:", e && e.message || e);
    return { ok: true, counted: false };
  }
}

// ── APNs JWT (ES256) ───────────────────────────────────────────────────────
let _cachedJwt = null, _cachedAt = 0;
async function apnsJwt(env) {
  const now = Math.floor(Date.now() / 1000);
  if (_cachedJwt && now - _cachedAt < 3000) return _cachedJwt; // <50min: APNs erlaubt Wiederverwendung
  const header = { alg: "ES256", kid: env.APNS_KEY_ID };
  const claims = { iss: env.APNS_TEAM_ID, iat: now };
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const signingInput = `${enc(header)}.${enc(claims)}`;
  const key = await importP8(env.APNS_KEY_P8);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${b64url(new Uint8Array(sig))}`;
  _cachedJwt = jwt; _cachedAt = now;
  return jwt;
}
async function importP8(pem) {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, "")
                 .replace(/-----END PRIVATE KEY-----/, "")
                 .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der,
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}
function b64url(bytes) {
  let s = btoa(String.fromCharCode.apply(null, bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
