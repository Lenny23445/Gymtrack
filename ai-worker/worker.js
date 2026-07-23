// ── GymTrack KI-Worker (Cloudflare Worker) ─────────────────────────────────
// Proxy zwischen App und LLM-API. Kein Key in der App!
//
// Endpoints:
//   POST /chat     {idToken, jws, lang, messages[], context}   → {text, quota}
//   POST /coach    {idToken, jws, lang, t:{...}}                → {c:{...}, quota}
//   POST /analyze  {idToken, jws, lang, mode, data}             → {a:{...}, quota}
//
// Sicherheit (beides muss passen):
//   1. idToken   = Firebase-Login (wer bist du) — geprüft via accounts:lookup
//   2. jws       = StoreKit-2-Transaktion (bist du Premium) — ES256-Signatur
//                  + komplette x5c-Kette bis zur gepinnten Apple Root CA G3,
//                  bundleId, productId und Ablaufdatum werden geprüft.
//   Founder-UID darf ohne JWS durch (eigenes Konto).
//
// Secrets (Cloudflare-Dashboard → Settings → Variables, NICHT hier eintippen):
//   GEMINI_API_KEY    = Google-AI-Studio-Key (aistudio.google.com/apikey)
//   ANTHROPIC_API_KEY = Claude-API-Key (console.anthropic.com) — nur bei PROVIDER=claude
//   FIREBASE_API_KEY  = Web-API-Key des Firebase-Projekts (derselbe wie in index.html)
// Optionale Vars:
//   PROVIDER      = "gemini" (Default) oder "claude" — Modellwechsel ohne Code-Änderung
//   MODEL         = Gemini-Modell (Default: gemini-2.5-flash)
//   CLAUDE_MODEL  = Claude-Modell falls PROVIDER=claude (Default: claude-haiku-4-5)
//   MONTHLY_LIMIT = KI-Anfragen/Monat pro Premium-Nutzer (Default 50; Coach-Trigger zählen 0.5)
//   CHAT_DAILY / COACH_DAILY / ANALYZE_DAILY = Tageslimits als Missbrauchsbremse
// Bindings:
//   AI_QUOTA (KV Namespace) = führt das Monatslimit fort (Key q:{uid}:{YYYY-MM})

const FOUNDER_UID = "GMm3AlNn1pVRL6cc76opBgnM9sr1";
const BUNDLE_ID   = "com.wolter.gymtrack";
const PRODUCT_IDS = ["gymtrack.premium.monthly", "gymtrack.premium.yearly"];
const GRACE_MS    = 3 * 864e5; // 3 Tage Kulanz nach Ablauf (wie App-seitig)

// Apple Root CA - G3 (SHA-256-Fingerprint des DER-Zertifikats).
// Quelle: https://www.apple.com/certificateauthority/ — ändert sich praktisch nie.
const APPLE_ROOT_G3_SHA256 = "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179";

// ── Tageslimit pro Nutzer (pro Isolate, best effort — Missbrauchsbremse) ──
const _quota = new Map(); // uid → {day, chat, coach, analyze}
function dailyOk(uid, kind, env) {
  const day = new Date().toISOString().slice(0, 10);
  let q = _quota.get(uid);
  if (!q || q.day !== day) { q = { day, chat: 0, coach: 0, analyze: 0 }; _quota.set(uid, q); }
  const limit = kind === "chat" ? (parseInt(env.CHAT_DAILY) || 100)
              : kind === "coach" ? (parseInt(env.COACH_DAILY) || 60)
              : (parseInt(env.ANALYZE_DAILY) || 10);
  if (q[kind] >= limit) return false;
  q[kind]++;
  return true;
}

// ── Monatslimit (autoritativ, Cloudflare KV) — Coach-Trigger zählen 0.5 ──
async function monthlyUse(uid, env, weight) {
  const limit = parseInt(env.MONTHLY_LIMIT) || 50;
  const month = new Date().toISOString().slice(0, 7);
  if (uid === FOUNDER_UID) return { ok: true, used: 0, limit, month };
  const kv = env.AI_QUOTA;
  if (!kv) return { ok: true, used: 0, limit, month }; // kein KV gebunden (z.B. lokaler Dev) → nicht blockieren
  const key = "q:" + uid + ":" + month;
  const used = parseFloat(await kv.get(key)) || 0;
  if (used >= limit) return { ok: false, used, limit, month };
  const next = used + weight;
  await kv.put(key, String(next), { expirationTtl: 45 * 86400 });
  return { ok: true, used: next, limit, month };
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
    if (path !== "/chat" && path !== "/coach" && path !== "/analyze") return json({ error: "unknown endpoint" }, 404, cors);

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

    // 3) Tageslimit (Missbrauchsbremse)
    const kind = path.slice(1); // "chat" | "coach" | "analyze"
    if (!dailyOk(uid, kind, env)) return json({ error: "Tageslimit erreicht — morgen geht's weiter" }, 429, cors);

    // 4) Monatslimit (autoritativ, sichtbar für den Nutzer) — Coach-Trigger zählen halb
    const weight = kind === "coach" ? 0.5 : 1.0;
    const q = await monthlyUse(uid, env, weight);
    if (!q.ok) {
      return json({ error: "Du hast dein monatliches KI-Limit erreicht.", quota: { used: q.used, limit: q.limit, month: q.month } }, 429, cors);
    }
    const quota = { used: Math.ceil(q.used), limit: q.limit, month: q.month };

    // 5) LLM aufrufen
    try {
      let result;
      if (path === "/chat")    result = await runChat(body, lang, env);
      else if (path === "/coach")   result = await runCoach(body, lang, env);
      else                           result = await runAnalyze(body, lang, env);
      result.quota = quota;
      return json(result, 200, cors);
    } catch (e) {
      console.log("[AI] LLM-Fehler:", e.message);
      return json({ error: "KI gerade nicht erreichbar — versuch es gleich nochmal" }, 502, cors);
    }
  },
};

// ═══════════════ LLM-Provider-Abstraktion (Gemini Default, Claude als Fallback) ═══════════════

async function llm(env, { system, messages, maxTokens, schema }) {
  const provider = env.PROVIDER || "gemini";
  return provider === "claude"
    ? llmClaude(env, { system, messages, maxTokens, schema })
    : llmGemini(env, { system, messages, maxTokens, schema });
}

async function llmGemini(env, { system, messages, maxTokens, schema }) {
  const model = env.MODEL || "gemini-2.5-flash";
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const generationConfig = {
    maxOutputTokens: maxTokens,
    temperature: 0.6,
    thinkingConfig: { thinkingBudget: 0 },
  };
  if (schema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = stripAdditionalProps(schema);
  }
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent",
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents, generationConfig }),
    }
  );
  if (!res.ok) throw new Error("Gemini HTTP " + res.status + " " + (await res.text()).slice(0, 300));
  const data = await res.json();
  const cand = data.candidates && data.candidates[0];
  if (!cand) throw new Error("keine Antwort");
  if (cand.finishReason === "SAFETY" || cand.finishReason === "PROHIBITED_CONTENT") throw new Error("refusal");
  const parts = (cand.content && cand.content.parts) || [];
  return parts.map((p) => p.text || "").join("");
}

async function llmClaude(env, { system, messages, maxTokens, schema }) {
  const payload = { max_tokens: maxTokens, system, messages };
  if (schema) payload.output_config = { format: { type: "json_schema", schema } };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: env.CLAUDE_MODEL || "claude-haiku-4-5", ...payload }),
  });
  if (!res.ok) throw new Error("Claude HTTP " + res.status + " " + (await res.text()).slice(0, 300));
  const data = await res.json();
  if (data.stop_reason === "refusal") throw new Error("refusal");
  return (data.content.find((b) => b.type === "text") || {}).text || "";
}

// Gemini's responseSchema ist ein OpenAPI-Subset — additionalProperties wird nicht unterstützt.
function stripAdditionalProps(schema) {
  if (!schema || typeof schema !== "object") return schema;
  const { additionalProperties, ...rest } = schema;
  if (rest.properties) {
    const props = {};
    for (const k in rest.properties) props[k] = stripAdditionalProps(rest.properties[k]);
    rest.properties = props;
  }
  if (rest.items) rest.items = stripAdditionalProps(rest.items);
  return rest;
}

// ═══════════════ /chat — Coach-Chat inkl. Trainingsplan-Erstellung ═══════════════

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
  const text = await llm(env, { system: sys, messages: msgs, maxTokens: 1200 });
  return { text };
}

// ═══════════════ /coach — Live-Trigger während des Trainings ═══════════════

const COACH_SCHEMA = {
  type: "object",
  properties: {
    title:  { type: "string" },
    text:   { type: "string" },
    action: {
      type: "object",
      properties: {
        kind:  { type: "string" }, // weight | extraSet | dropSet | rest | deload | none
        value: { type: "number" },
      },
      required: ["kind"],
    },
  },
  required: ["title", "text", "action"],
};

async function runCoach(body, lang, env) {
  const de = lang !== "en";
  const t = body.t || {};
  const sys = de
    ? `Du bist ein sportwissenschaftlich fundierter Fitness-Coach in der App MyGymTrack und gibst eine SEHR kurze Live-Einschätzung während eines laufenden Satzes. Du bekommst kompakte Trigger-Daten (aktueller Satz vs. letzte Session, Ermüdung, Ziel). Antworte mit maximal 2 kurzen Sätzen, duze, konkret, keine Floskeln, keine Begrüßung.
title: max. 4 Wörter Kurztitel (z. B. "Starke Leistung", "Achtung Ermüdung").
text: 1-2 Sätze Einschätzung + Empfehlung.
action.kind: eine von "weight" (Gewicht anpassen, value=neues kg), "extraSet" (zusätzlicher Satz sinnvoll), "dropSet" (Dropsatz sinnvoll), "rest" (mehr Pause), "deload" (Intensität reduzieren), "none" (nur Kommentar, keine Aktion).
Trigger-Typen: jump=deutliche Leistungssteigerung, drop=deutlicher Leistungsabfall, repmax=alle Sätze am oberen Wiederholungsende (Gewicht könnte steigen), fatigue=hohe Ermüdung erkannt, stall=Stagnation über mehrere Einheiten.`
    : `You are a sports-science-grounded fitness coach in the MyGymTrack app giving a VERY short live assessment during an active set. You get compact trigger data (current set vs last session, fatigue, goal). Reply in max 2 short sentences, concrete, no filler, no greeting.
title: max 4 words. text: 1-2 sentences assessment + recommendation.
action.kind: one of "weight" (adjust weight, value=new kg), "extraSet", "dropSet", "rest", "deload", "none".
Trigger types: jump=clear performance increase, drop=clear performance drop, repmax=all sets at top of rep range, fatigue=high fatigue detected, stall=stagnation across sessions.`;
  const text = await llm(env, {
    system: sys,
    messages: [{ role: "user", content: JSON.stringify(t).slice(0, 2000) }],
    maxTokens: 250,
    schema: COACH_SCHEMA,
  });
  return { c: JSON.parse(text) };
}

// ═══════════════ /analyze — Trainingsanalyse / Workout-Optimierung / Fortschritt ═══════════════

const ANALYZE_SCHEMA = {
  type: "object",
  properties: {
    score:   { type: "integer" },
    summary: { type: "string" },
    points:  { type: "array", items: { type: "string" } },
    recos:   { type: "array", items: { type: "string" } },
  },
  required: ["summary", "points", "recos"],
};

async function runAnalyze(body, lang, env) {
  const de = lang !== "en";
  const mode = ["training", "workout", "progress"].includes(body.mode) ? body.mode : "training";
  const data = JSON.stringify(body.data || {}).slice(0, 8000);
  const focusDe = {
    training: "die gesamte Trainingsplanung/-struktur des Nutzers (Split, Frequenz, Balance der Muskelgruppen)",
    workout:  "das zuletzt geloggte einzelne Workout (Ausführungsqualität, Sinnhaftigkeit der Satz-/Gewichtswahl)",
    progress: "den langfristigen Fortschritt über die letzten Wochen (Volumen-Trend, PRs, Muskelgruppen-Entwicklung)",
  }[mode];
  const focusEn = {
    training: "the user's overall training plan/structure (split, frequency, muscle group balance)",
    workout:  "the single most recently logged workout (execution quality, set/weight choices)",
    progress: "long-term progress over recent weeks (volume trend, PRs, muscle group development)",
  }[mode];
  const sys = de
    ? `Du bist ein sportwissenschaftlich fundierter Personal Trainer in der App MyGymTrack. Analysiere ${focusDe} anhand der mitgelieferten aggregierten JSON-Daten. Duze den Nutzer, sei konkret, beziehe dich auf echte Zahlen/Übungsnamen aus den Daten.
score: 0-100 ehrliche Gesamtbewertung.
summary: 2-3 Sätze Gesamtfazit.
points: 2-4 konkrete Beobachtungen (positiv wie kritisch).
recos: 2-4 konkrete, umsetzbare Empfehlungen.`
    : `You are a sports-science-grounded personal trainer in the MyGymTrack app. Analyze ${focusEn} using the provided aggregated JSON data. Be concrete, reference real numbers/exercise names.
score: 0-100 honest overall rating.
summary: 2-3 sentences. points: 2-4 concrete observations. recos: 2-4 actionable recommendations.`;
  const text = await llm(env, {
    system: sys,
    messages: [{ role: "user", content: data }],
    maxTokens: 900,
    schema: ANALYZE_SCHEMA,
  });
  return { a: JSON.parse(text) };
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
