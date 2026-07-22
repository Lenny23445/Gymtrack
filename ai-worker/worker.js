// ── GymTrack KI-Worker (Cloudflare Worker) ─────────────────────────────────
// Proxy zwischen App und Claude API. Kein Key in der App!
//
// Endpoints:
//   POST /report  {idToken, jws, lang, profile, weeks[]}          → {report:{…}}
//   POST /chat    {idToken, jws, lang, messages[], context}       → {text}
//
// Sicherheit (beides muss passen):
//   1. idToken   = Firebase-Login (wer bist du) — geprüft via accounts:lookup
//   2. jws       = StoreKit-2-Transaktion (bist du Premium) — ES256-Signatur
//                  + komplette x5c-Kette bis zur gepinnten Apple Root CA G3,
//                  bundleId, productId und Ablaufdatum werden geprüft.
//   Founder-UID darf ohne JWS durch (eigenes Konto).
//
// Secrets (Cloudflare-Dashboard → Settings → Variables, NICHT hier eintippen):
//   ANTHROPIC_API_KEY = Claude-API-Key (console.anthropic.com)
//   FIREBASE_API_KEY  = Web-API-Key des Firebase-Projekts (derselbe wie in index.html)
// Optionale Vars:
//   MODEL             = Claude-Modell (Default: claude-haiku-4-5)
//   CHAT_DAILY        = Chat-Limit pro Nutzer/Tag (Default 100)
//   REPORT_DAILY      = Berichte pro Nutzer/Tag (Default 5)

const FOUNDER_UID = "GMm3AlNn1pVRL6cc76opBgnM9sr1";
const BUNDLE_ID   = "com.wolter.gymtrack";
const PRODUCT_IDS = ["gymtrack.premium.monthly", "gymtrack.premium.yearly"];
const GRACE_MS    = 3 * 864e5; // 3 Tage Kulanz nach Ablauf (wie App-seitig)

// Apple Root CA - G3 (SHA-256-Fingerprint des DER-Zertifikats).
// Quelle: https://www.apple.com/certificateauthority/ — ändert sich praktisch nie.
const APPLE_ROOT_G3_SHA256 = "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179";

// ── sehr einfaches Tageslimit pro Nutzer (pro Isolate, best effort) ──
const _quota = new Map(); // uid → {day, chat, report}
function quotaOk(uid, kind, env) {
  const day = new Date().toISOString().slice(0, 10);
  let q = _quota.get(uid);
  if (!q || q.day !== day) { q = { day, chat: 0, report: 0, scan: 0 }; _quota.set(uid, q); }
  const limit = kind === "chat" ? (parseInt(env.CHAT_DAILY) || 100)
              : kind === "scan" ? (parseInt(env.SCAN_DAILY) || 40)
              : (parseInt(env.REPORT_DAILY) || 5);
  if (q[kind] >= limit) return false;
  q[kind]++;
  return true;
}

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST")    return json({ error: "POST only" }, 405, cors);

    const path = new URL(request.url).pathname.replace(/\/+$/, "");
    if (path !== "/report" && path !== "/chat" && path !== "/scan") return json({ error: "unknown endpoint" }, 404, cors);

    let body;
    try { body = await request.json(); } catch (_) { return json({ error: "bad json" }, 400, cors); }
    const { idToken, jws, lang } = body || {};
    if (!idToken) return json({ error: "idToken fehlt — bitte anmelden" }, 401, cors);

    // 1) Wer bist du? — Firebase-Token prüfen
    let uid;
    try { uid = await verifyFirebaseToken(idToken, env); }
    catch (e) { console.log("[AI] Auth fehlgeschlagen:", e.message); return json({ error: "Anmeldung ungültig — bitte neu einloggen" }, 401, cors); }

    // 2) Bist du Premium? — StoreKit-JWS prüfen (Founder darf ohne)
    if (uid !== FOUNDER_UID) {
      if (!jws) return json({ error: "Kein Abo-Nachweis" }, 402, cors);
      try { await verifyStoreKitJws(jws); }
      catch (e) { console.log("[AI] JWS abgelehnt:", e.message); return json({ error: "Abo-Nachweis ungültig: " + e.message }, 402, cors); }
    }

    // 3) Tageslimit
    const kind = path === "/chat" ? "chat" : path === "/scan" ? "scan" : "report";
    if (!quotaOk(uid, kind, env)) return json({ error: "Tageslimit erreicht — morgen geht's weiter" }, 429, cors);

    // 4) Claude aufrufen
    try {
      if (path === "/report") return json(await runReport(body, lang, env), 200, cors);
      if (path === "/scan")   return json(await runScan(body, lang, env), 200, cors);
      return json(await runChat(body, lang, env), 200, cors);
    } catch (e) {
      console.log("[AI] Claude-Fehler:", e.message);
      return json({ error: "KI gerade nicht erreichbar — versuch es gleich nochmal" }, 502, cors);
    }
  },
};

// ═══════════════ Claude ═══════════════

async function claude(env, payload) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: env.MODEL || "claude-haiku-4-5", ...payload }),
  });
  if (!res.ok) throw new Error("Claude HTTP " + res.status + " " + (await res.text()).slice(0, 300));
  const data = await res.json();
  if (data.stop_reason === "refusal") throw new Error("refusal");
  return data;
}

const REPORT_SCHEMA = {
  type: "object",
  properties: {
    score:           { type: "integer" },
    summary:         { type: "string" },
    highlights:      { type: "array", items: { type: "string" } },
    analyse:         { type: "array", items: { type: "string" } },
    warnings:        { type: "array", items: { type: "string" } },
    recommendations: { type: "array", items: { type: "string" } },
  },
  required: ["score", "summary", "highlights", "analyse", "warnings", "recommendations"],
  additionalProperties: false,
};

async function runReport(body, lang, env) {
  const de = lang !== "en";
  const weeks = (body.weeks || []).slice(0, 6);
  const profile = body.profile || {};
  const sys = de
    ? `Du bist ein erfahrener, motivierender Personal Trainer und analysierst die Trainingswoche eines Nutzers der Fitness-App MyGymTrack.
Du bekommst aggregierte Daten der aktuellen Woche (week:0) und der Vorwochen (week:1-4). Volumen = Summe reps×kg. Sei konkret und beziehe dich auf echte Zahlen und Übungsnamen aus den Daten. Duze den Nutzer.
- score: 0-100, ehrliche Gesamtbewertung der aktuellen Woche (Konstanz, Volumen-Trend, Balance, Frequenz vs. Ziel ${profile.freqPerWeek || "?"}×/Woche).
- summary: 2-3 Sätze Gesamtfazit.
- highlights: 2-4 konkrete Erfolge (PRs, Volumensteigerungen, Konstanz).
- analyse: 2-4 tiefere Beobachtungen (Muskelverteilung, Push/Pull, Trainingsdauer, Trends über die Wochen).
- warnings: 0-3 Punkte (vernachlässigte Muskeln, Überlastung, Rückgang). Leer wenn nichts auffällt.
- recommendations: 2-4 konkrete, umsetzbare Tipps für nächste Woche.`
    : `You are an experienced, motivating personal trainer analyzing a MyGymTrack user's training week.
You get aggregated data for the current week (week:0) and previous weeks (week:1-4). Volume = sum of reps×kg. Be concrete, reference real numbers and exercise names.
- score: 0-100 honest overall rating (consistency, volume trend, balance, frequency vs goal ${profile.freqPerWeek || "?"}×/week).
- summary: 2-3 sentences. - highlights: 2-4 concrete wins. - analyse: 2-4 deeper observations. - warnings: 0-3 items (empty if fine). - recommendations: 2-4 actionable tips for next week.`;
  const data = await claude(env, {
    max_tokens: 1500,
    system: sys,
    output_config: { format: { type: "json_schema", schema: REPORT_SCHEMA } },
    messages: [{ role: "user", content: JSON.stringify({ profile, weeks }) }],
  });
  const txt = (data.content.find((b) => b.type === "text") || {}).text || "{}";
  return { report: JSON.parse(txt) };
}

async function runChat(body, lang, env) {
  const de = lang !== "en";
  const ctx = JSON.stringify(body.context || {}).slice(0, 30000);
  const msgs = (body.messages || [])
    .slice(-16)
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") throw new Error("bad messages");
  const sys = (de
    ? `Du bist der persönliche KI-Coach in der Fitness-App MyGymTrack. Du kennst das komplette Training des Nutzers (unten als JSON: Profil, Wochenstatistiken, Übungsliste, letzte Einheiten mit Bestsätzen, Wochenplan-Belegung). Duze den Nutzer, antworte kompakt und konkret (meist unter 150 Wörter), nutze **fett** sparsam für Kernaussagen. Beziehe dich auf seine echten Daten und Übungsnamen. Bei Fragen zu Übungs-Alternativen: nenne 2-3 passende Alternativen für dieselbe Muskelgruppe mit kurzem Warum.
Wenn der Nutzer einen Trainingsplan möchte: Stelle höchstens EINE kurze Rückfrage falls nötig, sonst erstelle direkt einen Plan passend zu Ziel, Erfahrung und Frequenz aus dem Profil. Gib den Plan IMMER zusätzlich als Codeblock aus:
\`\`\`gtplan
{"name":"Planname","days":{"mon":{"label":"Push","exercises":[{"name":"Bankdrücken","muscleGroup":"brust","sets":3,"repMin":8,"repMax":12}]},"tue":{"rest":true},"wed":{"label":"…","exercises":[]},"thu":{"rest":true},"fri":{"label":"…","exercises":[]},"sat":{"rest":true},"sun":{"rest":true}}}
\`\`\`
muscleGroup nur aus: brust, ruecken, beine, arme, schultern, core. Nutze bevorzugt Übungen, die der Nutzer schon hat (exakte Namen aus der Übungsliste), ergänze sinnvoll. Alle 7 Tage (mon-sun) angeben, Ruhetage als {"rest":true}. Vor dem Codeblock den Plan kurz menschlich zusammenfassen.
Keine medizinischen Diagnosen — bei Schmerzen/Verletzungen zum Arzt raten. Bleib beim Thema Training, grobe Ernährungsfragen sind ok.`
    : `You are the personal AI coach in the MyGymTrack fitness app. You know the user's complete training (JSON below: profile, weekly stats, exercise list, recent sessions with best sets, week plan). Answer concisely and concretely (usually under 150 words), use **bold** sparingly. Reference their real data and exercise names. For exercise alternatives: give 2-3 options for the same muscle group with a short why.
When the user wants a training plan: ask at most ONE short clarifying question if needed, otherwise build it directly matching goal, experience and frequency from the profile. ALWAYS also output the plan as a code block:
\`\`\`gtplan
{"name":"Plan name","days":{"mon":{"label":"Push","exercises":[{"name":"Bench Press","muscleGroup":"brust","sets":3,"repMin":8,"repMax":12}]},"tue":{"rest":true},"wed":{"label":"…","exercises":[]},"thu":{"rest":true},"fri":{"label":"…","exercises":[]},"sat":{"rest":true},"sun":{"rest":true}}}
\`\`\`
muscleGroup only from: brust, ruecken, beine, arme, schultern, core. Prefer exercises the user already has (exact names from the list). All 7 days mon-sun, rest days as {"rest":true}. Summarize the plan briefly before the code block.
No medical diagnoses — advise seeing a doctor for pain/injuries. Stay on training topics.`) +
    "\n\n=== NUTZERDATEN ===\n" + ctx;
  const data = await claude(env, { max_tokens: 1200, system: sys, messages: msgs });
  return { text: (data.content.find((b) => b.type === "text") || {}).text || "" };
}

const SCAN_SCHEMA = {
  type: "object",
  properties: {
    device: { type: "string" },
    tip:    { type: "string" },
    exercises: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nameEn:      { type: "string" },
          nameDe:      { type: "string" },
          muscleGroup: { type: "string" },
          searchTerms: { type: "array", items: { type: "string" } },
        },
        required: ["nameEn", "nameDe", "muscleGroup", "searchTerms"],
        additionalProperties: false,
      },
    },
  },
  required: ["device", "tip", "exercises"],
  additionalProperties: false,
};

async function runScan(body, lang, env) {
  const de = lang !== "en";
  const img = String(body.image || "");
  if (!img || img.length < 1000 || img.length > 2500000) throw new Error("bad image");
  const sys = de
    ? `Du bekommst ein Foto aus einem Fitnessstudio. Erkenne das Trainingsgerät (oder die Hantel/Station) und nenne die 1-3 wichtigsten Übungen dafür.
- device: kurzer deutscher Gerätename (z. B. "Latzug-Maschine"). Wenn kein Gerät erkennbar: "Kein Gerät erkennbar".
- tip: EIN kurzer Satz zur Ausführung/Einstellung (Sitzhöhe, Griff o. ä.).
- exercises: 1-3 Übungen. nameEn = gebräuchlicher englischer Übungsname wie in Übungsdatenbanken (z. B. "lat pulldown", "seated cable row"). nameDe = deutscher Name. muscleGroup aus: brust, ruecken, beine, arme, schultern, core. searchTerms: 2-4 englische Alternativ-Namen/Schreibweisen für die Datenbanksuche (klein geschrieben).
Kein Gerät erkennbar → exercises leer.`
    : `You get a gym photo. Identify the machine (or free-weight station) and name the 1-3 main exercises for it.
- device: short machine name. If none recognizable: "No machine recognized".
- tip: ONE short setup/form sentence.
- exercises: 1-3 items. nameEn = common English exercise name as used in exercise databases. nameDe = same as nameEn. muscleGroup from: brust, ruecken, beine, arme, schultern, core. searchTerms: 2-4 lowercase English alternative names.
No machine → empty exercises.`;
  const data = await claude(env, {
    max_tokens: 700,
    system: sys,
    output_config: { format: { type: "json_schema", schema: SCAN_SCHEMA } },
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: img } },
        { type: "text", text: de ? "Welches Gerät ist das und welche Übungen macht man daran?" : "Which machine is this and which exercises are done on it?" },
      ],
    }],
  });
  const txt = (data.content.find((b) => b.type === "text") || {}).text || "{}";
  return { scan: JSON.parse(txt) };
}

// ═══════════════ Firebase-Token prüfen ═══════════════

async function verifyFirebaseToken(idToken, env) {
  const res = await fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + env.FIREBASE_API_KEY,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken }) }
  );
  if (!res.ok) throw new Error("lookup " + res.status);
  const data = await res.json();
  const uid = data.users && data.users[0] && data.users[0].localId;
  if (!uid) throw new Error("kein Nutzer");
  return uid;
}

// ═══════════════ StoreKit-2-JWS prüfen ═══════════════
// JWS = header.payload.signature (ES256). header.x5c = [leaf, intermediate, root].
// Prüfkette: Signatur mit Leaf-Key → jedes Zertifikat vom nächsten signiert →
// Root == gepinnte Apple Root CA G3 → Payload-Felder (Bundle, Produkt, Ablauf).

async function verifyStoreKitJws(jws) {
  const parts = String(jws).split(".");
  if (parts.length !== 3) throw new Error("kein JWS");
  const header  = JSON.parse(td(b64uToBytes(parts[0])));
  const payload = JSON.parse(td(b64uToBytes(parts[1])));
  const sig     = b64uToBytes(parts[2]);
  if (header.alg !== "ES256") throw new Error("alg");
  const x5c = (header.x5c || []).map((c) => b64ToBytes(c));
  if (x5c.length < 2) throw new Error("x5c fehlt");

  // Root pinnen
  const rootHash = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", x5c[x5c.length - 1])));
  if (rootHash !== APPLE_ROOT_G3_SHA256) throw new Error("Root nicht Apple");

  // Kette: cert[i] muss von cert[i+1] signiert sein
  for (let i = 0; i < x5c.length - 1; i++) {
    if (!(await certSignedBy(x5c[i], x5c[i + 1]))) throw new Error("Kette gebrochen");
  }

  // JWS-Signatur mit Leaf-Public-Key
  const leafKey = await importCertKey(x5c[0], "P-256");
  const signed  = new TextEncoder().encode(parts[0] + "." + parts[1]);
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, leafKey, sig, signed);
  if (!ok) throw new Error("Signatur falsch");

  // Inhalt
  if (payload.bundleId !== BUNDLE_ID) throw new Error("bundleId");
  if (!PRODUCT_IDS.includes(payload.productId)) throw new Error("productId");
  if (payload.revocationDate) throw new Error("widerrufen");
  const exp = payload.expiresDate || 0;
  if (!exp || exp + GRACE_MS < Date.now()) throw new Error("abgelaufen");
  return payload;
}

// ── Mini-DER/ASN.1 ──
function derRead(bytes, off) {
  const tag = bytes[off];
  let len = bytes[off + 1], hdr = 2;
  if (len & 0x80) {
    const n = len & 0x7f; len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | bytes[off + 2 + i];
    hdr = 2 + n;
  }
  return { tag, start: off, contentStart: off + hdr, contentEnd: off + hdr + len, end: off + hdr + len };
}
function derChildren(bytes, node) {
  const out = [];
  let off = node.contentStart;
  while (off < node.contentEnd) { const c = derRead(bytes, off); out.push(c); off = c.end; }
  return out;
}
// Zerlegt ein X.509-Zertifikat in {tbsRaw, algOid, sigDer, spkiRaw, curve}
function parseCert(der) {
  const cert = derRead(der, 0);
  const [tbs, sigAlg, sigVal] = derChildren(der, cert);
  const tbsKids = derChildren(der, tbs);
  let idx = 0;
  if (tbsKids[0].tag === 0xa0) idx = 1;            // [0] version
  const spki = tbsKids[idx + 5];                    // serial, sigAlg, issuer, validity, subject, SPKI
  const spkiRaw = der.slice(spki.start, spki.end);
  // Kurve aus SPKI-AlgorithmIdentifier (OID prime256v1 / secp384r1)
  const spkiHex = hex(spkiRaw);
  const curve = spkiHex.includes("2a8648ce3d030107") ? "P-256"
              : spkiHex.includes("2b81040022")       ? "P-384" : "P-256";
  const algOid = hex(der.slice(sigAlg.contentStart, sigAlg.contentEnd));
  const bits = derRead(der, sigVal.start);
  const sigDer = der.slice(bits.contentStart + 1, bits.contentEnd); // BIT STRING: 1 Byte unused-bits überspringen
  return { tbsRaw: der.slice(tbs.start, tbs.end), algOid, sigDer, spkiRaw, curve };
}
// DER-ECDSA-Signatur (SEQ{r,s}) → raw r||s für WebCrypto
function derSigToRaw(sigDer, size) {
  const seq = derRead(sigDer, 0);
  const [r, s] = derChildren(sigDer, seq);
  const trim = (n) => {
    let v = sigDer.slice(n.contentStart, n.contentEnd);
    while (v.length > size && v[0] === 0) v = v.slice(1);
    const out = new Uint8Array(size); out.set(v, size - v.length); return out;
  };
  const out = new Uint8Array(size * 2);
  out.set(trim(r), 0); out.set(trim(s), size);
  return out;
}
async function importCertKey(der, expectCurve) {
  const { spkiRaw, curve } = parseCert(der);
  return crypto.subtle.importKey("spki", spkiRaw, { name: "ECDSA", namedCurve: expectCurve || curve }, false, ["verify"]);
}
async function certSignedBy(childDer, parentDer) {
  try {
    const child = parseCert(childDer);
    const parent = parseCert(parentDer);
    // ecdsa-with-SHA256 = 2a8648ce3d040302 · ecdsa-with-SHA384 = 2a8648ce3d040303
    const hash = child.algOid.includes("2a8648ce3d040303") ? "SHA-384" : "SHA-256";
    const size = parent.curve === "P-384" ? 48 : 32;
    const key = await crypto.subtle.importKey("spki", parent.spkiRaw, { name: "ECDSA", namedCurve: parent.curve }, false, ["verify"]);
    return crypto.subtle.verify({ name: "ECDSA", hash }, key, derSigToRaw(child.sigDer, size), child.tbsRaw);
  } catch (e) { console.log("[AI] certSignedBy:", e.message); return false; }
}

// ── kleine Helfer ──
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...cors } });
}
function b64ToBytes(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64uToBytes(s) { return b64ToBytes(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)); }
function td(bytes) { return new TextDecoder().decode(bytes); }
function hex(bytes) { let s = ""; for (const b of bytes) s += b.toString(16).padStart(2, "0"); return s; }
