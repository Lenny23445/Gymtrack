// ── GymTrack KI-Worker (Cloudflare Worker) ─────────────────────────────────
// Proxy zwischen App und LLM-API. Kein Key in der App!
//
// Endpoints:
//   POST /chat     {idToken, jws, lang, messages[], context}   → {text, quota}
//   POST /coach    {idToken, jws, lang, t:{...}}                → {c:{...}, quota}
//   POST /analyze  {idToken, jws, lang, mode, data}             → {a:{...}, quota}
//   POST /vision   {idToken, jws, lang, img, mime}               → {v:{...}, quota}
//                  img = base64-JPEG (ohne data:-Präfix) eines Gerätefotos
//   GET  /stats    ?idToken=…  (nur Founder-UID)                 → {month, calls, inTok, outTok, costUsd, budgetUsd}
//   GET  /admin-stats ?idToken=…  (nur Founder-UID)               → {auth:{...}, appstore:{...}}
//                  Live-Ersatz für den alten Mac-Server-Cron (server.mjs schrieb das
//                  vorher alle 5 Min nach Firestore admin/{auth,appstore} — lief nur,
//                  solange der Mac wach war). Jetzt liefert der Worker live, kein Mac nötig.
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
//   FIREBASE_SERVICE_ACCOUNT_JSON = kompletter Inhalt von firebase-service-account.json
//                  (Firebase-Konsole → Projekteinstellungen → Dienstkonten → Neuen privaten Schlüssel generieren)
//                  — nur für /admin-stats (Auth-Zahlen)
//   APPSTORE_PRIVATE_KEY   = kompletter Inhalt der .p8-Datei (App Store Connect → Nutzer und Zugriff → Integrationen)
//   APPSTORE_KEY_ID        = Key-ID aus dem .p8-Dateinamen (AuthKey_XXXXXXXXXX.p8 → XXXXXXXXXX)
//   APPSTORE_ISSUER_ID     = Issuer-ID (App Store Connect → Integrationen, steht oben auf der Seite)
//   APPSTORE_VENDOR_NUMBER = 8-stellige Vendor-Nummer (App Store Connect → Zahlungen und Finanzberichte)
//                  — die vier APPSTORE_*-Secrets nur für /admin-stats (App-Store-Downloads)
// Optionale Vars (nicht geheim, normale Cloudflare-„Variables"):
//   OFFICIAL_DOWNLOADS / OFFICIAL_DOWNLOADS_AS_OF = Apples offizielle Gesamt-Downloads-Zahl als
//                  Anker (App Store Connect → App-Analytics → Total Downloads), Stand-Datum YYYY-MM-DD.
//                  Fehlt sie, rechnet /admin-stats nur aus der Sales-Report-Summe (etwas ungenauer).
//   PROVIDER      = "gemini" (Default) oder "claude" — Modellwechsel ohne Code-Änderung
//   MODEL         = Gemini-Modell (Default: gemini-2.5-flash)
//   CLAUDE_MODEL  = Claude-Modell falls PROVIDER=claude (Default: claude-haiku-4-5)
//   MONTHLY_LIMIT = KI-Anfragen/Monat pro Premium-Nutzer (Default 50; Coach-Trigger zählen 0.5)
//   CHAT_DAILY / COACH_DAILY / ANALYZE_DAILY = Tageslimits als Missbrauchsbremse
//   PRICE_IN_PER_M / PRICE_OUT_PER_M = USD pro 1 Mio. Input-/Output-Token für die Kostenschätzung
//                  (Default 0.30/2.50 ≈ Gemini 2.5 Flash) — rein für Anzeige + Spend-Cap-Berechnung
//   GLOBAL_MONTHLY_USD = harter Kostendeckel/Monat über ALLE Nutzer zusammen (leer = kein Deckel);
//                  bei Erreichen antworten /chat|/coach|/analyze mit 429, bis der Monat wechselt
// Bindings:
//   AI_QUOTA (KV Namespace) = führt Monatslimit (q:{uid}:{YYYY-MM}) UND globale Kosten-Stats (stats:{YYYY-MM}) fort

const FOUNDER_UID = "GMm3AlNn1pVRL6cc76opBgnM9sr1";
// Zusaetzliche Tester-UIDs: kommen wie Founder ohne Abo-Nachweis + ohne Monatslimit
// durch. Sicher, weil an echte Firebase-Identitaet gebunden (Auth via Google/Apple
// noetig) - nicht faelschbar wie ein localStorage-Flag im oeffentlichen JS-Quelltext.
const TEST_UIDS = new Set([FOUNDER_UID, "wbOGsL3zsyb1ylzEXPhgpqWdeOg1"]);
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
              : kind === "vision" ? (parseInt(env.VISION_DAILY) || 20)
              : (parseInt(env.ANALYZE_DAILY) || 10);
  if (q[kind] >= limit) return false;
  q[kind]++;
  return true;
}

// ── Monatslimit (autoritativ, Cloudflare KV) — Coach-Trigger zählen 0.5 ──
async function monthlyUse(uid, env, weight) {
  const limit = parseInt(env.MONTHLY_LIMIT) || 50;
  const month = new Date().toISOString().slice(0, 7);
  if (TEST_UIDS.has(uid)) return { ok: true, used: 0, limit, month };
  const kv = env.AI_QUOTA;
  if (!kv) return { ok: true, used: 0, limit, month }; // kein KV gebunden (z.B. lokaler Dev) → nicht blockieren
  const key = "q:" + uid + ":" + month;
  const used = parseFloat(await kv.get(key)) || 0;
  if (used >= limit) return { ok: false, used, limit, month };
  const next = used + weight;
  await kv.put(key, String(next), { expirationTtl: 45 * 86400 });
  return { ok: true, used: next, limit, month };
}

// ── Globales Monats-Aggregat (Tokens/Kosten über ALLE Nutzer) — Kostendeckel + Dashboard ──
function estCostUsd(env, inTok, outTok) {
  const priceIn  = parseFloat(env.PRICE_IN_PER_M)  || 0.30; // Gemini 2.5 Flash Default-Schätzpreise
  const priceOut = parseFloat(env.PRICE_OUT_PER_M) || 2.50;
  return (inTok / 1e6) * priceIn + (outTok / 1e6) * priceOut;
}
async function monthlyStats(env) {
  const month = new Date().toISOString().slice(0, 7);
  const kv = env.AI_QUOTA;
  const empty = { month, calls: 0, inTok: 0, outTok: 0 };
  if (!kv) return empty;
  try {
    const raw = await kv.get("stats:" + month);
    return raw ? { month, ...JSON.parse(raw) } : empty;
  } catch (_) { return empty; }
}
// Nach jedem erfolgreichen LLM-Call — bewusst separat von monthlyUse() (Call-Zähler
// pro User), das hier ist die Kosten-Summe über ALLE User für Spend-Cap + Dashboard.
// Zusätzlich pro-Nutzer-Verbrauch (utok:{uid}:{month}) fürs Kosten-pro-Kunde-Dashboard.
async function recordUsage(env, uid, usage) {
  const kv = env.AI_QUOTA;
  if (!kv || !usage) return;
  const month = new Date().toISOString().slice(0, 7);
  // 1) Global (Spend-Cap + Gesamtzahlen)
  const key = "stats:" + month;
  const raw = await kv.get(key);
  const s = raw ? JSON.parse(raw) : { calls: 0, inTok: 0, outTok: 0 };
  s.calls++;
  s.inTok  += usage.inTok  || 0;
  s.outTok += usage.outTok || 0;
  await kv.put(key, JSON.stringify(s), { expirationTtl: 400 * 86400 });
  // 2) Pro Nutzer (Tokens/Kosten je Account). Founder/Tester zählen NICHT mit
  //    (sie umgehen das Limit → würden das Dashboard verfälschen).
  if (uid && !TEST_UIDS.has(uid)) {
    const uk = "utok:" + uid + ":" + month;
    const ur = await kv.get(uk);
    const u = ur ? JSON.parse(ur) : { calls: 0, inTok: 0, outTok: 0 };
    u.calls++;
    u.inTok  += usage.inTok  || 0;
    u.outTok += usage.outTok || 0;
    await kv.put(uk, JSON.stringify(u), { expirationTtl: 400 * 86400 });
  }
}

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const url  = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");

    // ── GET /stats — Monats-Tokens/Kosten fürs Admin-Dashboard (nur Founder-UID) ──
    if (path === "/stats") {
      if (request.method !== "GET") return json({ error: "GET only" }, 405, cors);
      const idToken = url.searchParams.get("idToken");
      if (!idToken) return json({ error: "idToken fehlt" }, 401, cors);
      let uid;
      try { uid = await verifyFirebaseToken(idToken, env); }
      catch (e) { return json({ error: "Anmeldung ungültig" }, 401, cors); }
      if (uid !== FOUNDER_UID) return json({ error: "kein Zugriff" }, 403, cors);
      const stats = await monthlyStats(env);
      const costUsd = estCostUsd(env, stats.inTok, stats.outTok);
      const budgetUsd = parseFloat(env.GLOBAL_MONTHLY_USD) || null;
      // Alle KV-Monate (stats:YYYY-MM) fürs Dashboard: Historie + Ø-Kosten/Monat
      let history = [];
      try {
        const kv = env.AI_QUOTA;
        if (kv) {
          const list = await kv.list({ prefix: "stats:" });
          history = (await Promise.all(list.keys.map(async (k) => {
            const raw = await kv.get(k.name);
            if (!raw) return null;
            const s = JSON.parse(raw);
            return { month: k.name.slice(6), calls: s.calls || 0, inTok: s.inTok || 0, outTok: s.outTok || 0,
                     costUsd: estCostUsd(env, s.inTok || 0, s.outTok || 0) };
          }))).filter(Boolean).sort((a, b) => a.month < b.month ? -1 : 1);
        }
      } catch (e) { /* Historie optional — Hauptzahlen liefern trotzdem */ }
      // ── Pro-Nutzer-Verbrauch (aktueller Monat): Tokens, Kosten, Request-Zähler ──
      // utok:{uid}:{month} = {calls,inTok,outTok}; q:{uid}:{month} = Request-Zähler (Zahl).
      let users = [];
      try {
        const kv = env.AI_QUOTA;
        if (kv) {
          const month = new Date().toISOString().slice(0, 7);
          const suf = ":" + month;
          const ut = await kv.list({ prefix: "utok:" });
          const rows = await Promise.all(ut.keys
            .filter((k) => k.name.endsWith(suf))
            .map(async (k) => {
              const uid2 = k.name.slice(5, -(suf.length)); // "utok:".length = 5
              const raw = await kv.get(k.name);
              if (!raw) return null;
              const u = JSON.parse(raw);
              const reqRaw = await kv.get("q:" + uid2 + suf);
              return {
                uid: uid2,
                reqCount: Math.ceil(parseFloat(reqRaw) || 0),   // gezählte Anfragen (Limit-relevant)
                calls: u.calls || 0,                             // erfolgreiche LLM-Calls
                inTok: u.inTok || 0,
                outTok: u.outTok || 0,
                costUsd: estCostUsd(env, u.inTok || 0, u.outTok || 0),
              };
            }));
          users = rows.filter(Boolean).sort((a, b) => b.costUsd - a.costUsd);
        }
      } catch (e) { /* Pro-Nutzer optional */ }
      // Konfig-Selbstcheck: greift das Pro-Nutzer-Monatslimit wirklich?
      // kvBound=false ⇒ monthlyUse() fällt in den fail-open-Pfad (Zeile ~85),
      // dann ist das Limit für ECHTE Nutzer NICHT wirksam (jeder unbegrenzt).
      const cfg = {
        kvBound: !!env.AI_QUOTA,
        monthlyLimit: parseInt(env.MONTHLY_LIMIT) || 50,
        limitEnforced: !!env.AI_QUOTA,   // nur mit gebundenem KV echt durchgesetzt
        globalBudgetUsd: budgetUsd,
      };
      return json({ ...stats, costUsd, budgetUsd, history, cfg, users }, 200, cors);
    }

    // ── GET /admin-stats — Auth- + App-Store-Zahlen fürs Live-Dashboard (nur Founder-UID) ──
    if (path === "/admin-stats") {
      if (request.method !== "GET") return json({ error: "GET only" }, 405, cors);
      const idToken = url.searchParams.get("idToken");
      if (!idToken) return json({ error: "idToken fehlt" }, 401, cors);
      let uid;
      try { uid = await verifyFirebaseToken(idToken, env); }
      catch (e) { return json({ error: "Anmeldung ungültig" }, 401, cors); }
      if (uid !== FOUNDER_UID) return json({ error: "kein Zugriff" }, 403, cors);
      const wrap = async (fn) => {
        try { return { ok: true, ...(await fn()) }; }
        catch (e) { return { ok: false, error: String(e.message || e).slice(0, 250) }; }
      };
      let sa = null;
      try { sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON); } catch (_) { /* fehlt/kaputt */ }
      const [adminAuth, adminAppstore] = await Promise.all([
        sa ? wrap(() => getAuthStats(sa)) : Promise.resolve({ ok: false, error: "FIREBASE_SERVICE_ACCOUNT_JSON fehlt" }),
        wrap(() => getAppStoreStats(env)),
      ]);
      return json({ auth: adminAuth, appstore: adminAppstore }, 200, cors);
    }

    if (request.method !== "POST")    return json({ error: "POST only" }, 405, cors);
    if (path !== "/chat" && path !== "/coach" && path !== "/analyze" && path !== "/vision") return json({ error: "unknown endpoint" }, 404, cors);

    let body;
    try { body = await request.json(); } catch (_) { return json({ error: "bad json" }, 400, cors); }
    const { idToken, jws, lang } = body || {};
    if (!idToken) return json({ error: "idToken fehlt — bitte anmelden" }, 401, cors);

    // 1) Wer bist du? — Firebase-Token prüfen
    let uid;
    try { uid = await verifyFirebaseToken(idToken, env); }
    catch (e) { console.log("[AI] Auth fehlgeschlagen:", e.message); return json({ error: "Anmeldung ungültig — bitte neu einloggen" }, 401, cors); }

    // 2) Bist du Premium? — StoreKit-JWS prüfen (Founder darf ohne)
    if (!TEST_UIDS.has(uid)) {
      if (!jws) return json({ error: "Kein Abo-Nachweis" }, 402, cors);
      try { await verifyStoreKitJws(jws); }
      catch (e) { console.log("[AI] JWS abgelehnt:", e.message); return json({ error: "Abo-Nachweis ungültig: " + e.message }, 402, cors); }
    }

    // 3) Tageslimit (Missbrauchsbremse)
    const kind = path.slice(1); // "chat" | "coach" | "analyze" | "vision"
    if (!dailyOk(uid, kind, env)) return json({ error: "Tageslimit erreicht — morgen geht's weiter" }, 429, cors);

    // 4) Monatslimit (autoritativ, sichtbar für den Nutzer) — Coach-Trigger zählen halb
    const weight = kind === "coach" ? 0.5 : 1.0;
    const q = await monthlyUse(uid, env, weight);
    if (!q.ok) {
      return json({ error: "Du hast dein monatliches KI-Limit erreicht.", quota: { used: q.used, limit: q.limit, month: q.month } }, 429, cors);
    }
    const quota = { used: Math.ceil(q.used), limit: q.limit, month: q.month };

    // 5) Globales Monatsbudget (Kostendeckel über ALLE Nutzer zusammen, Hard-Stop) —
    // nur aktiv wenn GLOBAL_MONTHLY_USD gesetzt ist (Var, kein Secret; siehe Kopfkommentar).
    const budgetUsd = parseFloat(env.GLOBAL_MONTHLY_USD);
    if (budgetUsd > 0) {
      const stats = await monthlyStats(env);
      if (estCostUsd(env, stats.inTok, stats.outTok) >= budgetUsd) {
        return json({ error: "KI-Monatsbudget erreicht — bitte später erneut versuchen" }, 429, cors);
      }
    }

    // 6) LLM aufrufen
    try {
      let result;
      if (path === "/chat")    result = await runChat(body, lang, env);
      else if (path === "/coach")   result = await runCoach(body, lang, env);
      else if (path === "/vision")  result = await runVision(body, lang, env);
      else                           result = await runAnalyze(body, lang, env);
      try { await recordUsage(env, uid, result.usage); } catch (e) { console.log("[AI] Stats-Fehler:", e.message); }
      delete result.usage; // interne Kosten-Info, nicht an den Client
      result.quota = quota;
      return json(result, 200, cors);
    } catch (e) {
      console.log("[AI] LLM-Fehler:", e.message);
      // Founder-Konto bekommt den echten Grund im Klartext zurück (z. B.
      // "Gemini HTTP 400 …") — ohne den ist von außen nicht zu unterscheiden,
      // ob API-Key, Modellname oder Anbieter-Ausfall dahintersteckt.
      // Alle anderen Nutzer sehen weiterhin nur die neutrale Meldung.
      const detail = uid === FOUNDER_UID ? " [" + String((e && e.message) || e).slice(0, 300) + "]" : "";
      return json({ error: "KI gerade nicht erreichbar — versuch es gleich nochmal" + detail }, 502, cors);
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
  const model = env.MODEL || "gemini-3.5-flash-lite";
  // Optionales m.img = {mime, data(base64)} → multimodaler Part (Geräte-Scanner)
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: m.img
      ? [{ inline_data: { mime_type: m.img.mime, data: m.img.data } }, { text: m.content }]
      : [{ text: m.content }],
  }));
  const generationConfig = {
    maxOutputTokens: maxTokens,
    temperature: 0.6,
    // Gemini 3.x nutzt thinkingLevel statt thinkingBudget (2.5er-Feld) — beide
    // zusammen bzw. das falsche Feld gibt HTTP 400 INVALID_ARGUMENT.
    thinkingConfig: { thinkingLevel: "MINIMAL" },
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
  const text = parts.map((p) => p.text || "").join("");
  const um = data.usageMetadata || {};
  return { text, usage: { inTok: um.promptTokenCount || 0, outTok: um.candidatesTokenCount || 0 } };
}

async function llmClaude(env, { system, messages, maxTokens, schema }) {
  const msgs = messages.map((m) => m.img
    ? { role: m.role, content: [
        { type: "image", source: { type: "base64", media_type: m.img.mime, data: m.img.data } },
        { type: "text", text: m.content },
      ] }
    : m);
  const payload = { max_tokens: maxTokens, system, messages: msgs };
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
  const text = (data.content.find((b) => b.type === "text") || {}).text || "";
  const u = data.usage || {};
  return { text, usage: { inTok: u.input_tokens || 0, outTok: u.output_tokens || 0 } };
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
  const { text, usage } = await llm(env, { system: sys, messages: msgs, maxTokens: 1200 });
  return { text, usage };
}

// ═══════════════ /coach — Live-Trigger während des Trainings ═══════════════

const COACH_ACTION_SCHEMA = {
  type: "object",
  properties: {
    kind:  { type: "string" }, // weight | extraSet | dropSet | topSet | rest | deload | none
    value: { type: "number" },
  },
  required: ["kind"],
};
const COACH_SCHEMA = {
  type: "object",
  properties: {
    title:   { type: "string" },
    text:    { type: "string" },
    action:  COACH_ACTION_SCHEMA, // gesetzt bei eindeutiger Lage (options dann leer)
    options: {                     // gesetzt bei mehreren sinnvollen Wegen (2-3, action dann leer)
      type: "array",
      items: {
        type: "object",
        properties: { label: { type: "string" }, action: COACH_ACTION_SCHEMA },
        required: ["label", "action"],
      },
    },
  },
  required: ["title", "text"],
};

async function runCoach(body, lang, env) {
  const de = lang !== "en";
  const t = body.t || {};
  const sys = de
    ? `Du bist ein sportwissenschaftlich fundierter Fitness-Coach in der App MyGymTrack und gibst eine SEHR kurze Live-Einschätzung während eines laufenden Satzes. Du bekommst kompakte Trigger-Daten (aktueller Satz vs. letzte Session, Ermüdung, Ziel). Antworte mit maximal 2 kurzen Sätzen, duze, konkret, keine Floskeln, keine Begrüßung.
title: max. 4 Wörter Kurztitel (z. B. "Starke Leistung", "Achtung Ermüdung").
text: 1-2 Sätze Einschätzung + Empfehlung.
Gib ENTWEDER "action" ODER "options" zurück (nie beide, nie leer bei reinem Lob):
- Ist die Lage eindeutig (klar EIN sinnvoller nächster Schritt): "action" setzen.
- Gibt es mehrere sinnvolle Wege (z. B. Dropsatz ODER ein Satz mehr ODER normal weiter): "options" mit 2-3 Einträgen {label: kurzer Button-Text max. 3 Wörter, action}.
- Reines Lob ohne konkrete Aktion: "action":{"kind":"none"}, kein "options".
action.kind: "weight" (Gewicht anpassen, value=neues kg), "extraSet" (zusätzlicher Satz), "dropSet" (Dropsatz), "topSet" (nächster Satz = neuer Bestwert/Top-Satz), "rest" (mehr Pause), "deload" (Intensität reduzieren), "none" (keine Aktion).
Trigger-Typen: jump=deutliche Leistungssteigerung, drop=deutlicher Leistungsabfall, repmax=alle Sätze am oberen Wiederholungsende (Gewicht könnte steigen), fatigue=hohe Ermüdung erkannt, stall=Stagnation über mehrere Einheiten.`
    : `You are a sports-science-grounded fitness coach in the MyGymTrack app giving a VERY short live assessment during an active set. You get compact trigger data (current set vs last session, fatigue, goal). Reply in max 2 short sentences, concrete, no filler, no greeting.
title: max 4 words. text: 1-2 sentences assessment + recommendation.
Return EITHER "action" OR "options" (never both, never empty on pure praise):
- Clear situation (one obvious next step): set "action".
- Multiple sensible paths (e.g. drop set OR one more set OR continue as planned): set "options" with 2-3 entries {label: short button text max 3 words, action}.
- Pure praise, no concrete action: "action":{"kind":"none"}, no "options".
action.kind: "weight" (adjust weight, value=new kg), "extraSet", "dropSet", "topSet" (next set = new best/top set), "rest", "deload", "none".
Trigger types: jump=clear performance increase, drop=clear performance drop, repmax=all sets at top of rep range, fatigue=high fatigue detected, stall=stagnation across sessions.`;
  const { text, usage } = await llm(env, {
    system: sys,
    messages: [{ role: "user", content: JSON.stringify(t).slice(0, 2000) }],
    maxTokens: 300,
    schema: COACH_SCHEMA,
  });
  return { c: JSON.parse(text), usage };
}

// ═══════════════ /analyze — Trainingsanalyse / Workout-Optimierung / Fortschritt ═══════════════

const ANALYZE_SCHEMA = {
  type: "object",
  properties: {
    score:   { type: "integer" },
    summary: { type: "string" },
    points:  { type: "array", items: { type: "string" } },
    recos:   { type: "array", items: { type: "string" } },
    // Direkt umsetzbare Vorschläge — die App zeigt pro Action einen "Übernehmen"-
    // Button und schreibt die Änderung in die Übungs-Ziele des Nutzers.
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label:    { type: "string" },  // kurzer Button-Text
          kind:     { type: "string" },  // sets | reps | addEx
          exercise: { type: "string" },  // exakter Übungsname (bei addEx: neuer Name)
          muscleGroup: { type: "string" },
          sets:     { type: "integer" },
          repMin:   { type: "integer" },
          repMax:   { type: "integer" },
          why:      { type: "string" },  // 1 Satz Begründung
        },
        required: ["label", "kind", "exercise"],
      },
    },
  },
  required: ["summary", "points", "recos"],
};

async function runAnalyze(body, lang, env) {
  const de = lang !== "en";
  const mode = ["training", "workout", "progress"].includes(body.mode) ? body.mode : "training";
  const data = JSON.stringify(body.data || {}).slice(0, 8000);
  const focusDe = {
    training: "die gesamte Trainingsplanung/-struktur des Nutzers (Split, Frequenz, Balance der Muskelgruppen). WENN data.recentCheckins vorhanden: subjektives Gefühl/Energielevel der letzten Einheiten explizit einbeziehen — bei wiederholt 'Sehr schwer'/'Niedrig' aktiv Deload oder Frequenz-/Volumenreduktion empfehlen",
    workout:  "das zuletzt geloggte einzelne Workout (Ausführungsqualität, Sinnhaftigkeit der Satz-/Gewichtswahl). WENN data.scope='split': stattdessen den übergebenen Split (Übungsauswahl, Satz-/Wdh-Ziele, Muskelbalance, Reihenfolge, fehlende/überflüssige Übungen). WENN data.checkin vorhanden: gemeldetes Gefühl/Energielevel dieser Einheit in Bewertung und Empfehlungen einbeziehen",
    progress: "den langfristigen Fortschritt über die letzten Wochen (Volumen-Trend, PRs, Muskelgruppen-Entwicklung). WENN data.scope='exercise': GENAU diese eine Übung (e1RM-Verlauf, Stagnation, Wdh-Bereich, konkrete Progressions-/Techniktipps). WENN data.scope='split': nur diesen Split",
  }[mode];
  const focusEn = {
    training: "the user's overall training plan/structure (split, frequency, muscle group balance). IF data.recentCheckins is present: explicitly factor in subjective feel/energy of recent sessions — actively recommend a deload or reduced frequency/volume if repeatedly 'Very hard'/'Low'",
    workout:  "the single most recently logged workout (execution quality, set/weight choices). IF data.scope='split': the given split instead (exercise selection, set/rep targets, balance, order, missing/redundant exercises). IF data.checkin is present: factor the reported feel/energy of this session into the rating and recommendations",
    progress: "long-term progress over recent weeks (volume trend, PRs, muscle group development). IF data.scope='exercise': EXACTLY this one exercise (e1RM trend, stalls, rep range, concrete progression/technique tips). IF data.scope='split': only this split",
  }[mode];
  const sys = de
    ? `Du bist ein sportwissenschaftlich fundierter Personal Trainer in der App MyGymTrack. Analysiere ${focusDe} anhand der mitgelieferten aggregierten JSON-Daten. Duze den Nutzer, sei konkret, beziehe dich auf echte Zahlen/Übungsnamen aus den Daten.
Sei AUSFÜHRLICH und sportwissenschaftlich fundiert (Volumen-Richtwerte pro Muskelgruppe, progressive Überlastung, Erholung/Frequenz) — der Nutzer zahlt für eine echte Experten-Einschätzung, nicht für Allgemeinplätze.
score: 0-100 ehrliche Gesamtbewertung.
summary: 3-4 Sätze Gesamtfazit.
points: 3-5 konkrete Beobachtungen (positiv wie kritisch), jeweils mit Zahl aus den Daten.
recos: 3-6 konkrete, umsetzbare Empfehlungen mit kurzem sportwissenschaftlichem Warum.
actions: 0-3 DIREKT umsetzbare Änderungen (nur wenn die Daten sie wirklich hergeben, sonst leer). kind="sets": Ziel-Sätze einer Übung ändern (Feld sets, 1-8). kind="reps": Wiederholungsbereich ändern (repMin+repMax, 1-30). kind="addEx": fehlende Übung ergänzen (muscleGroup NUR aus brust/ruecken/beine/arme/schultern/core, plus sets/repMin/repMax). exercise = EXAKTER Übungsname aus den Daten (bei addEx der neue Name). label = kurzer Button-Text (max 5 Wörter, z.B. "Kniebeugen auf 4 Sätze"). why = 1 Satz Begründung mit Zahl aus den Daten.`
    : `You are a sports-science-grounded personal trainer in the MyGymTrack app. Analyze ${focusEn} using the provided aggregated JSON data. Be concrete, reference real numbers/exercise names.
Be THOROUGH and sports-science-grounded (volume landmarks per muscle group, progressive overload, recovery/frequency) — the user pays for a real expert assessment.
score: 0-100 honest overall rating.
summary: 3-4 sentences. points: 3-5 concrete observations, each with a number from the data. recos: 3-6 actionable recommendations with a short scientific why.
actions: 0-3 DIRECTLY applicable changes (only if the data truly supports them, else empty). kind="sets": change target sets (field sets, 1-8). kind="reps": change rep range (repMin+repMax, 1-30). kind="addEx": add a missing exercise (muscleGroup ONLY from brust/ruecken/beine/arme/schultern/core, plus sets/repMin/repMax). exercise = EXACT exercise name from the data (for addEx the new name). label = short button text (max 5 words). why = 1 sentence with a number from the data.`;
  const { text, usage } = await llm(env, {
    system: sys,
    messages: [{ role: "user", content: data }],
    maxTokens: 1500,
    schema: ANALYZE_SCHEMA,
  });
  return { a: JSON.parse(text), usage };
}

// ═══════════════ /vision — Geräte-Scanner (Foto → Gerät + Übungen) ═══════════════

const VISION_SCHEMA = {
  type: "object",
  properties: {
    isGym:   { type: "boolean" },  // false = kein Trainingsgerät erkennbar
    device:  { type: "string" },
    muscleGroups: { type: "array", items: { type: "string" } },
    exercises: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name:   { type: "string" },  // deutscher Übungsname
          nameEn: { type: "string" },  // englischer Datenbank-Name (z.B. "Lat Pulldown")
          muscleGroup: { type: "string" },
          tip:    { type: "string" },
        },
        required: ["name", "nameEn"],
      },
    },
    howTo:   { type: "array", items: { type: "string" } },
    caution: { type: "string" },
  },
  required: ["isGym", "device", "exercises"],
};

async function runVision(body, lang, env) {
  const de = lang !== "en";
  const img = String(body.img || "").replace(/^data:[^,]*,/, "");
  // ~1,3 MB base64 ≈ 1 MB JPEG — Client skaliert auf max. 1024px runter
  if (!img || img.length < 100 || img.length > 1400000) throw new Error("bad image");
  const mime = body.mime === "image/png" ? "image/png" : "image/jpeg";
  const sys = de
    ? `Du bist der Geräte-Scanner der Fitness-App MyGymTrack. Du bekommst ein Foto aus einem Fitnessstudio und erkennst das abgebildete Trainingsgerät (auch Freihantel-/Rack-Aufbauten).
isGym: false, wenn KEIN Trainingsgerät/Equipment erkennbar ist (dann alles andere leer lassen bzw. device kurz beschreiben, was zu sehen ist).
device: kurzer deutscher Gerätename (z.B. "Latzug", "Beinpresse", "Kabelzug-Turm").
muscleGroups: NUR aus brust, ruecken, beine, arme, schultern, core.
exercises: 1-3 sinnvolle Übungen an diesem Gerät, wichtigste zuerst. name = deutscher Name, nameEn = gebräuchlicher englischer Name wie in Übungsdatenbanken (z.B. "Lat Pulldown", "Leg Press", "Seated Cable Row"), muscleGroup aus der Liste oben, tip = 1 kurzer Technik-Tipp.
howTo: 3-5 kurze Schritte, wie man die WICHTIGSTE Übung sauber ausführt (duzen, je max. 12 Wörter).
caution: 1 Satz — häufigster Fehler an diesem Gerät.`
    : `You are the machine scanner of the MyGymTrack fitness app. You get a gym photo and identify the training machine/equipment (including free-weight/rack setups).
isGym: false if NO training equipment is visible (leave the rest empty, describe briefly in device).
device: short machine name (e.g. "Lat Pulldown", "Leg Press").
muscleGroups: ONLY from brust, ruecken, beine, arme, schultern, core.
exercises: 1-3 sensible exercises on this machine, most important first. name = display name, nameEn = common database name (e.g. "Lat Pulldown"), muscleGroup from the list above, tip = 1 short technique tip.
howTo: 3-5 short steps for the MAIN exercise (max 12 words each).
caution: 1 sentence — most common mistake on this machine.`;
  const { text, usage } = await llm(env, {
    system: sys,
    messages: [{
      role: "user",
      content: de ? "Welches Trainingsgerät ist das und welche Übungen macht man daran?" : "Which training machine is this and which exercises are done on it?",
      img: { mime, data: img },
    }],
    maxTokens: 700,
    schema: VISION_SCHEMA,
  });
  return { v: JSON.parse(text), usage };
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

// ═══════════════ Admin-Dashboard: Auth + App Store (live, ersetzt Mac-Server-Cron) ═══════════════
// Portiert aus analytics/server.mjs (lief vorher als Cron auf dem Mac) — Signaturen laufen
// hier über Web Crypto statt node:crypto, Gzip über DecompressionStream statt zlib.

const DAY = 86_400_000;

function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function seriesFromMap(map, days) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const iso = isoLocal(d);
    out.push({ date: iso, v: map.get(iso) || 0 });
  }
  return out;
}
function bytesToB64u(buf) {
  let bin = "";
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64uJson(obj) { return bytesToB64u(new TextEncoder().encode(JSON.stringify(obj))); }
function pemToDer(pem) {
  return b64ToBytes(pem.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, ""));
}

// ── Google-Service-Account → OAuth-Token (RS256-JWT) ──
let _gTok = null; // { token, exp } — best effort pro Isolate (wie _quota oben)
async function googleToken(sa) {
  if (_gTok && _gTok.exp > Date.now() + 60_000) return _gTok.token;
  const now = Math.floor(Date.now() / 1000);
  const header  = b64uJson({ alg: "RS256", typ: "JWT" });
  const payload = b64uJson({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/userinfo.email",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  });
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToDer(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${payload}`));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${header}.${payload}.${bytesToB64u(sig)}`,
  });
  if (!res.ok) throw new Error(`Google-Token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const tok = await res.json();
  _gTok = { token: tok.access_token, exp: Date.now() + (tok.expires_in - 300) * 1000 };
  return _gTok.token;
}

// ── 1) Firebase Auth: Accounts (identitytoolkit accounts:batchGet) ──
let _authStatsCache = { t: 0, data: null };
async function getAuthStats(sa) {
  if (_authStatsCache.data && Date.now() - _authStatsCache.t < 60_000) return _authStatsCache.data;
  const token = await googleToken(sa);
  const users = [];
  let nextPageToken = "";
  do {
    const apiUrl = `https://identitytoolkit.googleapis.com/v1/projects/${sa.project_id}/accounts:batchGet?maxResults=500${nextPageToken ? "&nextPageToken=" + encodeURIComponent(nextPageToken) : ""}`;
    const res = await fetch(apiUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Auth ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    users.push(...(data.users || []));
    nextPageToken = data.nextPageToken || "";
  } while (nextPageToken);

  const now = Date.now();
  let anon = 0, google = 0, apple = 0, other = 0, new7 = 0, new30 = 0;
  const byDay = new Map(), byDayReal = new Map(), byDayApple = new Map(), byDayGoogle = new Map();
  for (const u of users) {
    const created = Number(u.createdAt || 0);
    const providers = (u.providerUserInfo || []).map((p) => p.providerId);
    const isGoogle = providers.includes("google.com");
    const isApple = !isGoogle && providers.includes("apple.com");
    const isReal = isGoogle || isApple;
    if (isGoogle) google++;
    else if (isApple) apple++;
    else if (providers.length === 0) anon++;
    else other++;
    if (created) {
      if (now - created < 7 * DAY) new7++;
      if (now - created < 30 * DAY) new30++;
      const iso = isoLocal(new Date(created));
      byDay.set(iso, (byDay.get(iso) || 0) + 1);
      if (isReal) byDayReal.set(iso, (byDayReal.get(iso) || 0) + 1);
      if (isApple) byDayApple.set(iso, (byDayApple.get(iso) || 0) + 1);
      if (isGoogle) byDayGoogle.set(iso, (byDayGoogle.get(iso) || 0) + 1);
    }
  }
  const data = {
    total: users.length, anon, google, apple, other, new7, new30,
    signupsByDay: seriesFromMap(byDay, 60),
    signupsByDayReal: seriesFromMap(byDayReal, 180),
    signupsByDayApple: seriesFromMap(byDayApple, 60),
    signupsByDayGoogle: seriesFromMap(byDayGoogle, 60),
  };
  _authStatsCache = { t: Date.now(), data };
  return data;
}

// ── 2) App Store Connect: Sales Reports (ES256-JWT + Gzip via DecompressionStream) ──
function loadAscConfig(env) {
  const missing = [];
  if (!env.APPSTORE_PRIVATE_KEY)   missing.push("APPSTORE_PRIVATE_KEY (.p8-Inhalt)");
  if (!env.APPSTORE_KEY_ID)        missing.push("APPSTORE_KEY_ID");
  if (!env.APPSTORE_ISSUER_ID)     missing.push("APPSTORE_ISSUER_ID");
  if (!env.APPSTORE_VENDOR_NUMBER) missing.push("APPSTORE_VENDOR_NUMBER");
  if (missing.length) return { ok: false, missing, keyId: env.APPSTORE_KEY_ID || null };
  return { ok: true, cfg: {
    issuerId: env.APPSTORE_ISSUER_ID, vendorNumber: String(env.APPSTORE_VENDOR_NUMBER),
    keyId: env.APPSTORE_KEY_ID, privateKey: env.APPSTORE_PRIVATE_KEY,
  } };
}

async function ascToken(cfg) {
  const now = Math.floor(Date.now() / 1000);
  const header  = b64uJson({ alg: "ES256", kid: cfg.keyId, typ: "JWT" });
  const payload = b64uJson({ iss: cfg.issuerId, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" });
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToDer(cfg.privateKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${bytesToB64u(sig)}`;
}

async function gunzipText(buf) {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

async function ascReport(cfg, token, dateStr) {
  const reportUrl = new URL("https://api.appstoreconnect.apple.com/v1/salesReports");
  reportUrl.searchParams.set("filter[frequency]", "DAILY");
  reportUrl.searchParams.set("filter[reportDate]", dateStr);
  reportUrl.searchParams.set("filter[reportSubType]", "SUMMARY");
  reportUrl.searchParams.set("filter[reportType]", "SALES");
  reportUrl.searchParams.set("filter[vendorNumber]", cfg.vendorNumber);
  const res = await fetch(reportUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return "";
  if (!res.ok) throw new Error(`Apple API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return gunzipText(await res.arrayBuffer());
}

function loadOfficialAnchor(env) {
  const dl = Number(env.OFFICIAL_DOWNLOADS);
  const asOf = String(env.OFFICIAL_DOWNLOADS_AS_OF || "");
  if (dl > 0 && /^\d{4}-\d{2}-\d{2}$/.test(asOf)) return { downloads: dl, asOf };
  return null;
}

let _ascStatsCache = { t: 0, data: null };
async function getAppStoreStats(env, days = 60) {
  const official = loadOfficialAnchor(env);
  const loaded = loadAscConfig(env);
  if (!loaded.ok) return { configured: false, missing: loaded.missing, keyId: loaded.keyId, official };
  if (_ascStatsCache.data && Date.now() - _ascStatsCache.t < 30 * 60_000) return { ..._ascStatsCache.data, official };

  const token = await ascToken(loaded.cfg);
  const dates = [];
  for (let i = days; i >= 1; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    dates.push(isoLocal(d));
  }
  const apps = new Map();
  const queue = [...dates];
  async function worker() {
    while (queue.length) {
      const dateStr = queue.shift();
      const tsv = await ascReport(loaded.cfg, token, dateStr);
      const lines = tsv.split("\n").filter((l) => l.trim());
      if (lines.length < 2) continue;
      const cols = lines[0].split("\t").map((c) => c.trim());
      for (const line of lines.slice(1)) {
        const vals = line.split("\t");
        const row = {};
        cols.forEach((c, i) => { row[c] = (vals[i] || "").trim(); });
        const pt = row["Product Type Identifier"] || "";
        const kind = /^F?1/.test(pt) ? "downloads" : /^F?7/.test(pt) ? "updates" : null;
        if (!kind) continue;
        const title = row["Title"] || row["SKU"] || "?";
        if (!apps.has(title)) apps.set(title, new Map());
        const byDate = apps.get(title);
        const day = byDate.get(dateStr) || { downloads: 0, updates: 0 };
        day[kind] += Number(row["Units"] || 0);
        byDate.set(dateStr, day);
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);

  const data = {
    configured: true,
    note: 'Apple liefert Tageszahlen erst am Folgetag — „heute" fehlt immer.',
    apps: [...apps.entries()].map(([title, byDate]) => {
      const series = dates.map((d) => ({ date: d, ...(byDate.get(d) || { downloads: 0, updates: 0 }) }));
      const sum = (n, k) => series.slice(-n).reduce((s, x) => s + x[k], 0);
      return {
        title, series,
        downloads7: sum(7, "downloads"), downloads30: sum(30, "downloads"),
        downloadsTotal: series.reduce((s, x) => s + x.downloads, 0),
        updates7: sum(7, "updates"),
      };
    }),
  };
  _ascStatsCache = { t: Date.now(), data };
  return { ...data, official };
}
