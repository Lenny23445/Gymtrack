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
//   MODEL         = Gemini-Modell (Code-Default: gemini-3.5-flash-lite — siehe llmGemini)
//   CLAUDE_MODEL  = Claude-Modell falls PROVIDER=claude (Default: claude-haiku-4-5)
//   MONTHLY_LIMIT = KI-Anfragen/Monat pro Premium-Nutzer (Default 50; Coach-Trigger zählen 0.5)
//   CHAT_DAILY / COACH_DAILY / ANALYZE_DAILY = Tageslimits als Missbrauchsbremse
//   PRICE_IN_PER_M / PRICE_OUT_PER_M = USD pro 1 Mio. Input-/Output-Token für die Kostenschätzung
//                  (Default 0.30/2.50 ≈ Gemini 2.5 Flash) — rein für Anzeige + Spend-Cap-Berechnung
//                  ACHTUNG: bei einem Lite-Modell sind die Defaults zu hoch → Dashboard-Kosten und
//                  Spend-Cap greifen zu früh. Beim Modellwechsel BEIDE Werte mit umsetzen.
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

// ── Tageslimit pro Nutzer (Missbrauchsbremse) ──
// FRÜHER: Zähler in einer Map pro Isolate. Das war schlicht falsch — Cloudflare
// startet/verwirft Isolates ständig, also zählte JEDES Isolate seinen eigenen Tag
// mit. Für den Nutzer sah das so aus: "Tageslimit erreicht", zwei Stunden später
// ging es wieder. Jetzt liegt der Zähler wie das Monatslimit in KV (Tages-Key,
// TTL 2 Tage); ohne KV-Binding wird gar nicht getagesdeckelt (Monatslimit greift ohnehin).
function dailyLimit(kind, env) {
  return kind === "chat" ? (parseInt(env.CHAT_DAILY) || 100)
       : kind === "coach" ? (parseInt(env.COACH_DAILY) || 60)
       : kind === "vision" ? (parseInt(env.VISION_DAILY) || 20)
       : (parseInt(env.ANALYZE_DAILY) || 25);
}
function dailyKey(uid, kind) {
  return "d:" + uid + ":" + new Date().toISOString().slice(0, 10) + ":" + kind;
}
async function dailyUse(uid, kind, env) {
  const limit = dailyLimit(kind, env);
  if (TEST_UIDS.has(uid)) return { ok: true, used: 0, limit };
  const kv = env.AI_QUOTA;
  if (!kv) return { ok: true, used: 0, limit };
  const key = dailyKey(uid, kind);
  const used = parseFloat(await kv.get(key)) || 0;
  if (used >= limit) return { ok: false, used, limit };
  await kv.put(key, String(used + 1), { expirationTtl: 2 * 86400 });
  return { ok: true, used: used + 1, limit };
}
async function dailyRefund(uid, kind, env) {
  const kv = env.AI_QUOTA;
  if (!kv || TEST_UIDS.has(uid)) return;
  const key = dailyKey(uid, kind);
  const used = parseFloat(await kv.get(key)) || 0;
  await kv.put(key, String(Math.max(0, used - 1)), { expirationTtl: 2 * 86400 });
}

// ── Monatslimit (autoritativ, Cloudflare KV) — Coach-Trigger zählen 0.5 ──
function monthKey(uid) { return "q:" + uid + ":" + new Date().toISOString().slice(0, 7); }
async function monthlyUse(uid, env, weight) {
  const limit = parseInt(env.MONTHLY_LIMIT) || 50;
  const month = new Date().toISOString().slice(0, 7);
  if (TEST_UIDS.has(uid)) return { ok: true, used: 0, limit, month };
  const kv = env.AI_QUOTA;
  if (!kv) return { ok: true, used: 0, limit, month }; // kein KV gebunden (z.B. lokaler Dev) → nicht blockieren
  const key = monthKey(uid);
  const used = parseFloat(await kv.get(key)) || 0;
  if (used >= limit) return { ok: false, used, limit, month };
  const next = used + weight;
  await kv.put(key, String(next), { expirationTtl: 45 * 86400 });
  return { ok: true, used: next, limit, month };
}
// Der Zähler läuft VOR dem LLM-Aufruf hoch (sonst könnte man durch Abbrechen
// unbegrenzt Anfragen feuern). Scheitert der Aufruf danach, bekommt der Nutzer
// nichts geliefert — dann darf ihn das auch nichts kosten.
async function monthlyRefund(uid, env, weight) {
  const kv = env.AI_QUOTA;
  if (!kv || TEST_UIDS.has(uid)) return;
  const key = monthKey(uid);
  const used = parseFloat(await kv.get(key)) || 0;
  await kv.put(key, String(Math.max(0, used - weight)), { expirationTtl: 45 * 86400 });
}
// Reiner Kontostand-Abruf (verbraucht NICHTS) — die App zeigt damit im KI-Menü,
// wie viele Anfragen noch übrig sind, ohne dafür eine Anfrage zu opfern.
async function quotaPeek(uid, env) {
  const limit = parseInt(env.MONTHLY_LIMIT) || 50;
  const month = new Date().toISOString().slice(0, 7);
  if (TEST_UIDS.has(uid)) return { used: 0, limit, month, unlimited: true };
  const kv = env.AI_QUOTA;
  if (!kv) return { used: 0, limit, month, unlimited: true };
  const used = parseFloat(await kv.get(monthKey(uid))) || 0;
  return { used: Math.ceil(used), limit, month };
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
    if (path !== "/chat" && path !== "/coach" && path !== "/analyze" && path !== "/vision" && path !== "/quota") return json({ error: "unknown endpoint" }, 404, cors);

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

    // 2b) Reiner Kontostand — verbraucht nichts, zählt nichts hoch.
    if (path === "/quota") return json({ quota: await quotaPeek(uid, env) }, 200, cors);

    // 3) Tageslimit (Missbrauchsbremse)
    const kind = path.slice(1); // "chat" | "coach" | "analyze" | "vision"
    const d = await dailyUse(uid, kind, env);
    if (!d.ok) return json({ error: "Tageslimit erreicht — morgen geht's weiter" }, 429, cors);

    // 4) Monatslimit (autoritativ, sichtbar für den Nutzer) — Coach-Trigger zählen halb
    const weight = kind === "coach" ? 0.5 : 1.0;
    const q = await monthlyUse(uid, env, weight);
    if (!q.ok) {
      await dailyRefund(uid, kind, env);   // Tages-Zähler nicht für eine abgelehnte Anfrage verbrennen
      return json({ error: "Du hast dein monatliches KI-Limit erreicht.", quota: { used: q.used, limit: q.limit, month: q.month } }, 429, cors);
    }
    const quota = { used: Math.ceil(q.used), limit: q.limit, month: q.month };

    // 5) Globales Monatsbudget (Kostendeckel über ALLE Nutzer zusammen, Hard-Stop) —
    // nur aktiv wenn GLOBAL_MONTHLY_USD gesetzt ist (Var, kein Secret; siehe Kopfkommentar).
    const budgetUsd = parseFloat(env.GLOBAL_MONTHLY_USD);
    if (budgetUsd > 0) {
      const stats = await monthlyStats(env);
      if (estCostUsd(env, stats.inTok, stats.outTok) >= budgetUsd) {
        await dailyRefund(uid, kind, env);
        await monthlyRefund(uid, env, weight);
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
      result = stripEmojis(result); // No-Emoji-Garantie über ALLE Endpunkte
      result.quota = quota;
      return json(result, 200, cors);
    } catch (e) {
      console.log("[AI] LLM-Fehler:", e.message);
      // Fehlgeschlagene Anfrage = keine Leistung = kein Verbrauch. Ohne das hat
      // jeder kaputte Analyse-Aufruf (siehe abgeschnittenes JSON) sowohl Tages-
      // als auch Monatskontingent gefressen — genau das Muster "Tageslimit
      // erreicht, obwohl ich kaum was gemacht habe".
      try { await dailyRefund(uid, kind, env); await monthlyRefund(uid, env, weight); } catch (_) {}
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
  // MAX_TOKENS bei erzwungenem JSON = mitten im String abgeschnitten. Das muss
  // sichtbar sein, sonst knallt es später als "Unterminated string in JSON".
  return { text, truncated: cand.finishReason === "MAX_TOKENS",
           usage: { inTok: um.promptTokenCount || 0, outTok: um.candidatesTokenCount || 0 } };
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
  return { text, truncated: data.stop_reason === "max_tokens",
           usage: { inTok: u.input_tokens || 0, outTok: u.output_tokens || 0 } };
}

// JSON vom Modell robust lesen. Reines JSON.parse ist zu spröde: läuft die Antwort
// ins Token-Limit, bricht sie mitten in einem String ab und der Nutzer sieht
// "Unterminated string in JSON at position …" statt einer Analyse. Hier wird
// zuerst normal geparst und erst im Fehlerfall der letzte VOLLSTÄNDIGE Wert
// gesucht und die offenen Klammern geschlossen — lieber eine um zwei Punkte
// gekürzte Analyse als eine Fehlermeldung.
function parseJsonLoose(raw) {
  let t = String(raw == null ? "" : raw).trim();
  if (t.startsWith("```")) t = t.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(t); } catch (_) {}
  // Schnittkandidaten sammeln: Kommas und schließende Klammern außerhalb von Strings.
  const cuts = [];
  let inStr = false, esc = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "," ) cuts.push(i);        // vor dem Komma abschneiden
    else if (c === "}" || c === "]") cuts.push(i + 1);
  }
  for (let k = cuts.length - 1; k >= 0; k--) {
    const head = t.slice(0, cuts[k]);
    const stack = [];
    let s = false, e = false;
    for (let i = 0; i < head.length; i++) {
      const c = head[i];
      if (s) { if (e) e = false; else if (c === "\\") e = true; else if (c === '"') s = false; continue; }
      if (c === '"') s = true;
      else if (c === "{") stack.push("}");
      else if (c === "[") stack.push("]");
      else if (c === "}" || c === "]") stack.pop();
    }
    if (s) continue;                          // Schnitt läge in einem String
    try { return JSON.parse(head + stack.reverse().join("")); } catch (_) {}
  }
  return null;
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
  // Kontext-Cap: 12k Zeichen (~3k Token) statt 30k. Der Schwanz der Historie
  // trägt kaum zur Antwort bei, geht aber bei JEDER Nachricht erneut als Input
  // raus — der mit Abstand größte Kostenposten pro Chat-Aufruf.
  const ctx = JSON.stringify(body.context || {}).slice(0, 12000);
  const msgs = (body.messages || [])
    .slice(-10)
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") throw new Error("bad messages");
  const sys = (de
    ? `Du bist der persönliche KI-Coach in der Fitness-App MyGymTrack. Du kennst das komplette Training des Nutzers (unten als JSON: Profil, Wochenstatistiken, Übungsliste, letzte Einheiten mit Bestsätzen, Wochenplan-Belegung). Duze den Nutzer. STIL: kurz und knackig — 2-4 Sätze, höchstens 80 Wörter. Direkt mit der Antwort anfangen, keine Einleitung, keine Wiederholung der Frage, kein Nachklapp-Fazit. Lieber eine konkrete Zahl als ein erklärender Satz. Nutze **fett** sparsam für die Kernaussage. Nur bei einer Plan-Erstellung darfst du länger werden. Beziehe dich auf seine echten Daten und Übungsnamen. Bei Fragen zu Übungs-Alternativen: nenne 2-3 passende Alternativen für dieselbe Muskelgruppe mit kurzem Warum.
Wenn der Nutzer einen Trainingsplan möchte: Stelle höchstens EINE kurze Rückfrage falls nötig, sonst erstelle direkt einen Plan passend zu Ziel, Erfahrung und Frequenz aus dem Profil. Gib den Plan IMMER zusätzlich als Codeblock aus:
\`\`\`gtplan
{"name":"Planname","days":{"mon":{"label":"Push","exercises":[{"name":"Bankdrücken","muscleGroup":"brust","sets":3,"repMin":8,"repMax":12}]},"tue":{"rest":true},"wed":{"label":"…","exercises":[]},"thu":{"rest":true},"fri":{"label":"…","exercises":[]},"sat":{"rest":true},"sun":{"rest":true}}}
\`\`\`
muscleGroup nur aus: brust, ruecken, beine, arme, schultern, core. Nutze bevorzugt Übungen, die der Nutzer schon hat (exakte Namen aus der Übungsliste), ergänze sinnvoll. Alle 7 Tage (mon-sun) angeben, Ruhetage als {"rest":true}. Vor dem Codeblock den Plan kurz menschlich zusammenfassen.
Im Kontext steht unter "dossier" ein Gedaechtnis dieses Nutzers. Respektiere Einschraenkungen ausnahmslos: schlage keine Uebung vor, die eine genannte Einschraenkung belastet. Erwaehne das Dossier nicht von selbst.
Erfaehrst du in dieser Nachricht etwas dauerhaft Gueltiges ueber den Nutzer — eine koerperliche Einschraenkung, eine feste Vorliebe, ein geaendertes Ziel, oder dass etwas bei ihm nachweislich funktioniert — gib das ZUSAETZLICH als Codeblock aus:
\`\`\`gtmem
{"add":{"limits":["kurzer Satz"],"prefs":["kurzer Satz"],"works":["kurzer Satz"]},"goal":"Masse"}
\`\`\`
Nur Felder angeben, die wirklich neu sind. Hoechstens zwei Eintraege pro Nachricht. Kein "ts"-Feld und keine Zeitangaben — den Zeitstempel setzt die App. Nichts merken, was nur fuer diese eine Frage gilt.
Keine medizinischen Diagnosen — bei Schmerzen/Verletzungen zum Arzt raten. Bleib beim Thema Training, grobe Ernährungsfragen sind ok.
ABSOLUT VERBOTEN: Emojis und Symbol-Piktogramme jeder Art — weder im Antworttext noch im Plan (Planname, Tages-Labels, Übungsnamen). Die App stellt Symbole selbst dar; deine Ausgabe ist reiner Text.`
    : `You are the personal AI coach in the MyGymTrack fitness app. You know the user's complete training (JSON below: profile, weekly stats, exercise list, recent sessions with best sets, week plan). STYLE: short and punchy — 2-4 sentences, 80 words max. Start with the answer, no preamble, no restating the question, no closing summary. Prefer a concrete number over an explanatory sentence. Use **bold** sparingly for the key point. Only go longer when building a plan. Reference their real data and exercise names. For exercise alternatives: give 2-3 options for the same muscle group with a short why.
When the user wants a training plan: ask at most ONE short clarifying question if needed, otherwise build it directly matching goal, experience and frequency from the profile. ALWAYS also output the plan as a code block:
\`\`\`gtplan
{"name":"Plan name","days":{"mon":{"label":"Push","exercises":[{"name":"Bench Press","muscleGroup":"brust","sets":3,"repMin":8,"repMax":12}]},"tue":{"rest":true},"wed":{"label":"…","exercises":[]},"thu":{"rest":true},"fri":{"label":"…","exercises":[]},"sat":{"rest":true},"sun":{"rest":true}}}
\`\`\`
muscleGroup only from: brust, ruecken, beine, arme, schultern, core. Prefer exercises the user already has (exact names from the list). All 7 days mon-sun, rest days as {"rest":true}. Summarize the plan briefly before the code block.
The context contains a "dossier" — this user's memory. Respect limitations without exception: never suggest an exercise that loads a stated limitation. Do not mention the dossier unprompted.
If this message reveals something permanently true about the user — a physical limitation, a fixed preference, a changed goal, or something that demonstrably works for them — ALSO output it as a code block:
\`\`\`gtmem
{"add":{"limits":["short sentence"],"prefs":["short sentence"],"works":["short sentence"]},"goal":"Masse"}
\`\`\`
Only include fields that are genuinely new. At most two entries per message. No "ts" field and no dates — the app sets the timestamp. Do not memorise anything that only applies to this one question.
No medical diagnoses — advise seeing a doctor for pain/injuries. Stay on training topics.
STRICTLY FORBIDDEN: emojis and pictographic symbols of any kind — neither in the answer text nor in the plan (plan name, day labels, exercise names). The app renders its own icons; your output is plain text.`) +
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
Trigger-Typen: jump=deutliche Leistungssteigerung, drop=deutlicher Leistungsabfall, repmax=alle Sätze am oberen Wiederholungsende (Gewicht könnte steigen), fatigue=hohe Ermüdung erkannt, stall=Stagnation über mehrere Einheiten.
Steht "readiness" in den Daten, stammt sie aus dem Post-Workout-Check-in und die App hat die Vorschläge BEREITS angepasst. Respektiere sie: bei state "deload"/"hold"/"easy" niemals Gewicht erhöhen oder Zusatzsätze vorschlagen (eher "rest", "none", saubere Ausführung); bei "push" darfst du offensiv steigern.
Stehen in den Daten "limits", sind das koerperliche Einschraenkungen des Nutzers: schlage nichts vor, was sie belastet. Steht dort "muted", sind das Vorschlagstypen, die der Nutzer wiederholt ignoriert hat — verwende diese kinds nicht mehr.
Keine Emojis — nirgends, auch nicht in title oder Button-Labels.`
    : `You are a sports-science-grounded fitness coach in the MyGymTrack app giving a VERY short live assessment during an active set. You get compact trigger data (current set vs last session, fatigue, goal). Reply in max 2 short sentences, concrete, no filler, no greeting.
title: max 4 words. text: 1-2 sentences assessment + recommendation.
Return EITHER "action" OR "options" (never both, never empty on pure praise):
- Clear situation (one obvious next step): set "action".
- Multiple sensible paths (e.g. drop set OR one more set OR continue as planned): set "options" with 2-3 entries {label: short button text max 3 words, action}.
- Pure praise, no concrete action: "action":{"kind":"none"}, no "options".
action.kind: "weight" (adjust weight, value=new kg), "extraSet", "dropSet", "topSet" (next set = new best/top set), "rest", "deload", "none".
Trigger types: jump=clear performance increase, drop=clear performance drop, repmax=all sets at top of rep range, fatigue=high fatigue detected, stall=stagnation across sessions.
If the data contains "limits", these are the user's physical limitations: never suggest anything that loads them. If it contains "muted", those are suggestion kinds the user repeatedly ignored — do not use those kinds any more.
No emojis — anywhere, including title and button labels.`;
  const { text, usage } = await llm(env, {
    system: sys,
    messages: [{ role: "user", content: JSON.stringify(t).slice(0, 2000) }],
    maxTokens: 300,
    schema: COACH_SCHEMA,
  });
  const c = parseJsonLoose(text);
  if (!c) throw new Error("Coach-Antwort unlesbar (JSON kaputt)");
  return { c, usage };
}

// ═══════════════ /analyze — Trainingsanalyse / Workout-Optimierung / Fortschritt ═══════════════

const ANALYZE_SCHEMA = {
  type: "object",
  properties: {
    score:   { type: "integer" },
    summary: { type: "string" },
    // Kennzahlen-Kacheln: die App rendert sie als Zahlenraster mit Trendpfeil.
    // Sie tragen die Aussage, der Text bleibt bewusst kurz.
    metrics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },   // max. 3 Wörter
          value: { type: "string" },   // reine Zahl, z.B. "18" oder "-12"
          unit:  { type: "string" },   // "kg", "%", "Sätze/Wo", "" …
          trend: { type: "string" },   // "up" | "down" | "flat"
          good:  { type: "boolean" },  // true = positiv zu werten
        },
        required: ["label", "value"],
      },
    },
    // Balken-Vergleich: Ist gegen Soll je Zeile (z.B. Wochensätze pro Muskelgruppe).
    bars: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label:  { type: "string" },
          value:  { type: "number" },
          target: { type: "number" },
          unit:   { type: "string" },
        },
        required: ["label", "value"],
      },
    },
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
WENN data.readiness vorhanden: die App hat die Trainingsvorschläge aus dem Post-Workout-Check-in BEREITS angepasst (readiness.appliedByApp zeigt wie). Nimm darauf Bezug und widersprich nicht — bei state "deload"/"hold"/"easy" keine Steigerung empfehlen, sondern Erholung/Technik/Volumensteuerung; bei "push" darf offensiv gesteigert werden.
STIL: Zahlen statt Prosa. Die App zeigt deine Antwort als Kennzahlen-Raster und Balken — Fließtext ist nur die Klammer drumherum. Jede Aussage trägt eine Zahl aus den Daten. Keine Allgemeinplätze, keine Wiederholungen, keine Einleitungen wie "Insgesamt zeigt sich".
Sportwissenschaftlich fundiert bleiben (Volumen-Richtwerte pro Muskelgruppe, progressive Überlastung, Erholung/Frequenz) — aber verdichtet.
score: 0-100 ehrliche Gesamtbewertung.
summary: HÖCHSTENS 2 kurze Sätze (zusammen max. 30 Wörter) — das Fazit, nicht die Herleitung.
metrics: 3-4 Kennzahlen, die den Kern belegen. label max. 3 Wörter, value nur die Zahl (Vorzeichen erlaubt), unit die Einheit, trend up/down/flat, good ob der Wert positiv zu werten ist. Beispiel: {label:"Wochensätze Brust", value:"9", unit:"Sätze", trend:"down", good:false}.
bars: 0-6 Zeilen Ist-gegen-Soll, wenn die Daten das hergeben (z.B. Wochensätze je Muskelgruppe gegen den Richtwert 10-20). value = Ist, target = Richtwert.
points: 3-4 Beobachtungen, jeweils EIN Satz mit max. 12 Wörtern und mindestens einer Zahl.
recos: 2-3 Empfehlungen, jeweils max. 14 Wörter, konkret und mit Zahl ("Brust auf 14 Sätze/Woche, +5 pro Woche steigern").
actions: 0-3 DIREKT umsetzbare Änderungen (nur wenn die Daten sie wirklich hergeben, sonst leer). kind="sets": Ziel-Sätze einer Übung ändern (Feld sets, 1-8). kind="reps": Wiederholungsbereich ändern (repMin+repMax, 1-30). kind="addEx": fehlende Übung ergänzen (muscleGroup NUR aus brust/ruecken/beine/arme/schultern/core, plus sets/repMin/repMax). exercise = EXAKTER Übungsname aus den Daten (bei addEx der neue Name). label = kurzer Button-Text (max 5 Wörter, z.B. "Kniebeugen auf 4 Sätze"). why = 1 Satz Begründung mit Zahl aus den Daten.
Keine Emojis — in keinem Feld (summary, points, recos, labels).`
    : `You are a sports-science-grounded personal trainer in the MyGymTrack app. Analyze ${focusEn} using the provided aggregated JSON data. Be concrete, reference real numbers/exercise names.
IF data.readiness is present: the app has ALREADY adjusted the training suggestions from the post-workout check-in (see readiness.appliedByApp). Reference it and do not contradict it — for state "deload"/"hold"/"easy" never recommend adding load, focus on recovery/technique/volume management; for "push" you may push progression.
STYLE: numbers over prose. The app renders your answer as a metric grid and bars — text is only the frame. Every statement carries a number from the data. No filler, no repetition, no "overall we can see" openers.
Stay sports-science-grounded (volume landmarks per muscle group, progressive overload, recovery/frequency) but condensed.
score: 0-100 honest overall rating.
summary: AT MOST 2 short sentences (30 words total) — the verdict, not the derivation.
metrics: 3-4 key figures backing the verdict. label max 3 words, value the number only (sign allowed), unit the unit, trend up/down/flat, good whether the value is positive. Example: {label:"Weekly chest sets", value:"9", unit:"sets", trend:"down", good:false}.
bars: 0-6 actual-vs-target rows where the data supports it (e.g. weekly sets per muscle group against the 10-20 landmark). value = actual, target = landmark.
points: 3-4 observations, one sentence each, max 12 words, at least one number.
recos: 2-3 recommendations, max 14 words each, concrete and with a number.
actions: 0-3 DIRECTLY applicable changes (only if the data truly supports them, else empty). kind="sets": change target sets (field sets, 1-8). kind="reps": change rep range (repMin+repMax, 1-30). kind="addEx": add a missing exercise (muscleGroup ONLY from brust/ruecken/beine/arme/schultern/core, plus sets/repMin/repMax). exercise = EXACT exercise name from the data (for addEx the new name). label = short button text (max 5 words). why = 1 sentence with a number from the data.
No emojis — in any field (summary, points, recos, labels).`;
  const { text, usage } = await llm(env, {
    system: sys,
    messages: [{ role: "user", content: data }],
    // Kürzeres Zielformat (Kennzahlen statt Fließtext) braucht weniger Ausgabe,
    // aber score+summary+4 metrics+6 bars+4 points+3 recos+3 actions passen bei
    // 1100 knapp nicht rein — Gemini schnitt die Antwort mitten im String ab
    // ("Unterminated string in JSON"). 2000 lässt genug Luft ohne Textwände.
    maxTokens: 2000,
    schema: ANALYZE_SCHEMA,
  });
  const a = parseJsonLoose(text);
  if (!a) throw new Error("Analyse-Antwort unlesbar (JSON kaputt)");
  return { a, usage };
}

// ═══════════════ /vision — Geräte-Scanner (Foto → Gerät + Übungen) ═══════════════

const VISION_SCHEMA = {
  type: "object",
  properties: {
    isGym:   { type: "boolean" },  // false = kein Trainingsgerät erkennbar
    device:  { type: "string" },
    // 0..1 — wie sicher ist die Geräte-Bestimmung. Der Client zeigt unter 0.6
    // KEINE Ausführungs-Animation mehr, sondern nur die Schritt-Erklärung:
    // ein plausibel aussehendes, aber falsches Gerät ist schlimmer als keins.
    confidence: { type: "number" },
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
RATE NIE. Lieber ehrlich unsicher als ein falsches Gerät: eine erfundene oder „ähnliche" Zuordnung ist für den Nutzer schlechter als gar keine.
isGym: false, wenn KEIN Trainingsgerät/Equipment erkennbar ist (dann alles andere leer lassen bzw. device kurz beschreiben, was zu sehen ist).
confidence: 0..1, wie sicher du das konkrete Gerät bestimmst. Nur >0.8, wenn du die Bauart eindeutig siehst (Polster, Hebel, Zugweg, Beschriftung). Bei angeschnittenem/unscharfem Bild, mehreren Geräten oder generischem Rahmen: <=0.5.
device: kurzer deutscher Gerätename (z.B. "Latzug", "Beinpresse", "Kabelzug-Turm"). Bei confidence<=0.5 den Gerätetyp bewusst allgemein halten statt ein Modell zu erfinden.
muscleGroups: NUR aus brust, ruecken, beine, arme, schultern, core.
exercises: 1-3 Übungen, die WIRKLICH an genau diesem Gerät gemacht werden, wichtigste zuerst. Keine Übungen ergänzen, die nur „auch Sinn ergeben". Bei confidence<=0.5: höchstens 1 Eintrag oder leer.
nameEn: der gebräuchliche englische Standardname der Übung, so wie er in offenen Übungsdatenbanken steht — Grundform, kein Plural, keine Marken-/Herstellernamen, keine Zusätze wie "machine" oder "variation" (richtig: "Lat Pulldown", "Leg Press", "Seated Cable Row", "Chest Fly"). Der Client sucht damit exakt; ein ungenauer Name führt zu gar keiner Animation.
howTo: 3-5 kurze Schritte, wie man die WICHTIGSTE Übung sauber ausführt (duzen, je max. 12 Wörter). Diese Schritte sind der eigentliche Wert — sie müssen auch dann tragen, wenn keine Animation gefunden wird.
caution: 1 Satz — häufigster Fehler an diesem Gerät.
Keine Emojis — in keinem Feld.`
    : `You are the machine scanner of the MyGymTrack fitness app. You get a gym photo and identify the training machine/equipment (including free-weight/rack setups).
NEVER guess. An honest "unsure" beats a wrong or merely "similar" machine.
isGym: false if NO training equipment is visible (leave the rest empty, describe briefly in device).
confidence: 0..1 for how certain the machine identification is. Only >0.8 when the build is unambiguous (pads, levers, cable path, labels). Cropped/blurry shots, several machines or a generic frame: <=0.5.
device: short machine name (e.g. "Lat Pulldown", "Leg Press"). With confidence<=0.5 stay deliberately generic instead of inventing a model.
muscleGroups: ONLY from brust, ruecken, beine, arme, schultern, core.
exercises: 1-3 exercises actually performed on THIS machine, most important first. Do not add exercises that merely "would also make sense". With confidence<=0.5: at most 1 entry, or empty.
nameEn: the common English standard name as found in open exercise databases — base form, no plural, no brand names, no extras like "machine" or "variation" (correct: "Lat Pulldown", "Leg Press", "Seated Cable Row", "Chest Fly"). The client matches on it exactly; a loose name yields no animation at all.
howTo: 3-5 short steps for the MAIN exercise (max 12 words each). These steps are the real value — they must stand on their own when no animation is found.
caution: 1 sentence — most common mistake on this machine.
No emojis — in any field.`;
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
  const v = parseJsonLoose(text);
  if (!v) throw new Error("Scanner-Antwort unlesbar (JSON kaputt)");
  return { v, usage };
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
// Harte No-Emoji-Garantie (App-Regel: KEINE Emojis in der Oberfläche). Die
// Prompts verbieten Emojis zwar, aber Modelle rutschen trotzdem gelegentlich
// welche rein — deshalb wird JEDE Antwort (Text, Plan-JSON, Labels, Options)
// serverseitig gesäubert, bevor sie den Client erreicht.
const EMOJI_RE = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}]/gu;
function stripEmojis(v) {
  if (typeof v === "string") {
    return v.replace(EMOJI_RE, "")
            .replace(/[ \t]{2,}/g, " ")
            .replace(/[ \t]+$/gm, "").replace(/^[ \t]+(?=[.,!?:;])/gm, "")
            .replace(/^[ \t]+/, "");
  }
  if (Array.isArray(v)) return v.map(stripEmojis);
  if (v && typeof v === "object") { for (const k of Object.keys(v)) v[k] = stripEmojis(v[k]); return v; }
  return v;
}
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
