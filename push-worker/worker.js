// ── GymTrack Push-Absender (Cloudflare Worker) ─────────────────────────────
// Nimmt {toUid, idToken, fromName} von der App entgegen, liest den APNs-Push-
// Token des Empfängers aus Firestore (mit dem Firebase-Login des ABSENDERS,
// darum kein Missbrauch möglich) und schickt eine Push über Apple APNs.
// Dein geheimer .p8-Schlüssel bleibt NUR hier als Worker-Secret. Kein Blaze,
// kein Firebase-SDK. Kosten: 0 €.
//
// Secrets (im Cloudflare-Dashboard setzen, NICHT hier eintippen):
//   APNS_KEY_P8   = kompletter Inhalt der .p8-Datei (mit BEGIN/END-Zeilen)
//   APNS_KEY_ID   = 10-stellige Key-ID vom Apple-Push-Key
//   APNS_TEAM_ID  = deine Apple Team-ID (10-stellig)

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
    const { toUid, idToken, fromName } = body || {};
    console.log("[PUSH] Anfrage rein: toUid=", toUid, "fromName=", fromName, "hatIdToken=", !!idToken);
    if (!toUid || !idToken) return json({ error: "toUid+idToken required" }, 400, cors);

    // 1) Empfänger-Profil aus Firestore lesen — MIT dem Login des Absenders.
    //    Ungültiger idToken => 401 hier => keine Push, kein Missbrauch.
    const fsUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}` +
                  `/databases/(default)/documents/profiles/${encodeURIComponent(toUid)}`;
    const fsRes = await fetch(fsUrl, { headers: { Authorization: `Bearer ${idToken}` } });
    if (!fsRes.ok) { console.log("[PUSH] FEHLER: Profil-Lesen/Auth fehlgeschlagen, status=", fsRes.status); return json({ error: "auth/profile read failed", status: fsRes.status }, 401, cors); }
    const doc   = await fsRes.json();
    const token = doc && doc.fields && doc.fields.pushToken && doc.fields.pushToken.stringValue;
    if (!token) { console.log("[PUSH] KEIN pushToken im Profil des Empfaengers", toUid, "-> Empfaenger hat nie registriert"); return json({ ok: true, skipped: "no pushToken" }, 200, cors); }
    console.log("[PUSH] Empfaenger-Token gefunden, laenge=", token.length);

    // 2) APNs-JWT signieren + 3) Push senden — beides abgesichert: ein kaputtes
    // APNS_KEY_P8-Secret (z.B. ungueltiges Base64) wuerde sonst als uncaught
    // Exception ohne CORS-Header rausgehen -> Client sieht nur "Load failed"
    // statt des echten Grunds.
    try {
      const jwt = await apnsJwt(env);

      const payload = JSON.stringify({
        aps: {
          alert: { title: "MyGymTrack",
                   body: `${sanitize(fromName) || "Jemand"} hat mit einer Flamme reagiert` },
          sound: "default",
          badge: 1,
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
