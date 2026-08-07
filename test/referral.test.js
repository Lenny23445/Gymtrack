/* GymTrack — Waechter fuer das Referral (Gratis-Premium durch Einladung).

   Geprueft wird gegen den ECHTEN Quelltext von ai-worker/worker.js, nicht gegen
   eine Kopie: der Referral-Abschnitt wird aus der Datei geschnitten und in einer
   Sandbox mit einem Fake-KV ausgefuehrt. Aendert jemand die Deckel, die
   Kontopruefung oder die Gutschrift, faellt genau dieser Test um.

   Vier Dinge sind hier heikel und deshalb einzeln abgesichert:
   - Der Deckel haengt am CODE, nicht am Werber. Ohne ihn verschafft ein einziger
     oeffentlich geposteter Code beliebig vielen Fremden Gratis-Premium samt KI.
   - Anonyme Konten duerfen NIE einloesen. Die App meldet automatisch anonym an;
     sonst waere "App-Daten loeschen" ein Ein-Klick-Weg zu einer neuen Woche.
   - Ist der Code aufgebraucht, darf AUCH DER GEWORBENE leer ausgehen. Bekaeme er
     trotzdem seine Woche, waere der Code-Deckel wirkungslos.
   - Das Trial-Kontingent ist ein eigener Topf. Landet Trial-Verbrauch in den
     Zaehlern der Zahler, essen Gratis-Nutzer deren Budget auf. */
const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

const WURZEL = path.join(__dirname, '..');
const QUELLE = fs.readFileSync(path.join(WURZEL, 'ai-worker', 'worker.js'), 'utf8');

/* Den kompletten Referral-Abschnitt schneiden (Marker bis export default) statt
   einzelner Funktionen: die Helfer rufen sich gegenseitig auf, einzeln
   geschnitten fehlten die Nachbarn. */
function referralQuelle() {
  const start = QUELLE.indexOf('// ═══════════════ REFERRAL');
  const ende  = QUELLE.indexOf('export default {');
  assert.ok(start > 0 && ende > start, 'Referral-Abschnitt nicht gefunden — umgebaut?');
  return QUELLE.slice(start, ende);
}

function sandbox() {
  const ctx = { crypto, Date, Math, JSON, console };
  vm.createContext(ctx);
  vm.runInContext(referralQuelle(), ctx);
  return ctx;
}

/* Fake-KV. Bewusst ohne Compare-and-Swap — genau wie das echte Cloudflare KV,
   damit der Test nicht mehr Garantien vortaeuscht als die Produktion hat. */
function fakeKV() {
  const m = new Map();
  return {
    get:    async (k) => (m.has(k) ? m.get(k) : null),
    put:    async (k, v) => { m.set(k, v); },
    delete: async (k) => { m.delete(k); },
    _map:   m,
  };
}
function env(extra) { return Object.assign({ REF: fakeKV() }, extra || {}); }
const GOOGLE = ['google.com'];
const APPLE  = ['apple.com'];
const TAG    = 864e5;

async function mitCode(S, e, uid) {
  const rec = await S.refRead(e, uid);
  return await S.refEnsureCode(e, uid, rec);
}

/* ── Kontopruefung ───────────────────────────────────────────────────────── */

test('Nur Google- und Apple-Konten gelten als echtes Konto', () => {
  const S = sandbox();
  assert.equal(S.refRealAccount(GOOGLE), true);
  assert.equal(S.refRealAccount(APPLE), true);
  assert.equal(S.refRealAccount(['apple.com', 'google.com']), true);
  // Anonyme Anmeldung liefert eine LEERE Providerliste — das ist der Angriffsweg.
  assert.equal(S.refRealAccount([]), false);
  assert.equal(S.refRealAccount(undefined), false);
  assert.equal(S.refRealAccount(null), false);
  // E-Mail/Passwort gibt es in der App nicht; taucht es je auf, bleibt es aussen vor.
  assert.equal(S.refRealAccount(['password']), false);
  assert.equal(S.refRealAccount('google.com'), false, 'String statt Liste darf nicht durchrutschen');
});

test('Anonymes Konto kann nicht einloesen', async () => {
  const S = sandbox(); const e = env();
  const a = await mitCode(S, e, 'uid_a');
  const r = await S.refRedeem(e, 'uid_anon', [], a.code);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'anonymous');
  const nach = await S.refRead(e, 'uid_a');
  assert.equal(nach.invited, 0, 'Ablehnung darf den Werber-Zaehler nicht bewegen');
  assert.equal(nach.trialExp, 0);
});

/* ── Codevergabe ─────────────────────────────────────────────────────────── */

test('Code ist 7-stellig, verwechslungsarm, eindeutig und idempotent', async () => {
  const S = sandbox(); const e = env();
  const a = await mitCode(S, e, 'uid_a');
  assert.match(a.code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{7}$/, 'Zeichensatz ohne I/O/0/1, 7 Stellen');
  assert.equal(await e.REF.get('code:' + a.code), 'uid_a');
  const nochmal = await mitCode(S, e, 'uid_a');
  assert.equal(nochmal.code, a.code, 'zweiter Aufruf darf keinen neuen Code vergeben');
  // 300 Codes: keine Kollision, alle im gleichen Format
  const gesehen = new Set();
  for (let i = 0; i < 300; i++) {
    const c = await mitCode(S, e, 'uid_' + i);
    assert.match(c.code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{7}$/);
    assert.equal(gesehen.has(c.code), false, 'Code doppelt vergeben');
    gesehen.add(c.code);
  }
});

/* ── Gutschrift ──────────────────────────────────────────────────────────── */

test('Einloesung schenkt BEIDEN Seiten sieben Tage', async () => {
  const S = sandbox(); const e = env();
  const a = await mitCode(S, e, 'uid_a');
  const vor = Date.now();
  const r = await S.refRedeem(e, 'uid_b', GOOGLE, a.code);
  assert.equal(r.ok, true);
  const A = await S.refRead(e, 'uid_a'), B = await S.refRead(e, 'uid_b');
  for (const [wer, rec] of [['Werber', A], ['Geworbener', B]]) {
    const tage = (rec.trialExp - vor) / TAG;
    assert.ok(tage > 6.9 && tage < 7.1, wer + ' bekam ' + tage.toFixed(2) + ' statt 7 Tage');
  }
  assert.equal(A.invited, 1);
  assert.equal(B.usedCode, a.code, 'Geworbener wird gesperrt');
  assert.equal(B.invited, 0, 'Einloesen ist kein Werben');
});

test('Code wird tolerant gelesen (klein, Leerzeichen, Bindestriche)', async () => {
  const S = sandbox(); const e = env();
  const a = await mitCode(S, e, 'uid_a');
  const getippt = ' ' + a.code.slice(0, 3).toLowerCase() + '-' + a.code.slice(3).toLowerCase() + ' ';
  const r = await S.refRedeem(e, 'uid_b', GOOGLE, getippt);
  assert.equal(r.ok, true, 'abgetippter Code muss durchgehen');
});

test('Zweite Einloesung stapelt auf die laufende Woche statt sie zu ueberschreiben', async () => {
  const S = sandbox(); const e = env();
  const a = await mitCode(S, e, 'uid_a');
  const start = Date.now();
  await S.refRedeem(e, 'uid_b', GOOGLE, a.code);
  await S.refRedeem(e, 'uid_c', APPLE, a.code);
  const A = await S.refRead(e, 'uid_a');
  const tage = (A.trialExp - start) / TAG;
  assert.ok(tage > 13.9 && tage < 14.1, 'Werber hat ' + tage.toFixed(2) + ' statt 14 Tage');
  assert.equal(A.invited, 2);
});

test('Nach Ablauf wird ab jetzt gerechnet, nicht ab dem alten Datum', async () => {
  const S = sandbox(); const e = env();
  const a = await mitCode(S, e, 'uid_a');
  // Werber hat eine LANGE abgelaufene Woche
  const alt = await S.refRead(e, 'uid_a');
  alt.trialExp = Date.now() - 90 * TAG;
  await S.refWrite(e, 'uid_a', alt);
  const vor = Date.now();
  await S.refRedeem(e, 'uid_b', GOOGLE, a.code);
  const A = await S.refRead(e, 'uid_a');
  const tage = (A.trialExp - vor) / TAG;
  assert.ok(tage > 6.9 && tage < 7.1, 'Ergebnis waere sonst Vergangenheit + 7 Tage');
});

/* ── Missbrauch ──────────────────────────────────────────────────────────── */

test('Eigener Code bringt nichts', async () => {
  const S = sandbox(); const e = env();
  const a = await mitCode(S, e, 'uid_a');
  const r = await S.refRedeem(e, 'uid_a', GOOGLE, a.code);
  assert.equal(r.reason, 'self');
  const A = await S.refRead(e, 'uid_a');
  assert.equal(A.trialExp, 0);
  assert.equal(A.invited, 0);
});

test('Unbekannter Code bringt nichts', async () => {
  const S = sandbox(); const e = env();
  for (const quatsch of ['ZZZZZZZ', '', 'ABC', 'ABCDEFGH', null, undefined, '   ']) {
    const r = await S.refRedeem(e, 'uid_b', GOOGLE, quatsch);
    assert.equal(r.ok, false, 'Code ' + JSON.stringify(quatsch) + ' wurde angenommen');
    assert.equal(r.reason, 'unknown');
  }
});

test('Ein Konto loest nur EINMAL im Leben ein — auch mit fremden Codes', async () => {
  const S = sandbox(); const e = env();
  const a = await mitCode(S, e, 'uid_a');
  const c = await mitCode(S, e, 'uid_c');
  assert.equal((await S.refRedeem(e, 'uid_b', GOOGLE, a.code)).ok, true);
  const zweit = await S.refRedeem(e, 'uid_b', GOOGLE, c.code);
  assert.equal(zweit.reason, 'already_redeemed');
  const B = await S.refRead(e, 'uid_b');
  const tage = (B.trialExp - Date.now()) / TAG;
  assert.ok(tage < 7.1, 'Geworbener hat sich eine zweite Woche geholt');
  assert.equal((await S.refRead(e, 'uid_c')).invited, 0, 'abgelehnte Einloesung darf nicht zaehlen');
});

test('Nach zwei Einloesungen ist der Code TOT — auch fuer Fremde, beide gehen leer aus', async () => {
  const S = sandbox(); const e = env();
  const a = await mitCode(S, e, 'uid_a');
  await S.refRedeem(e, 'uid_b', GOOGLE, a.code);
  await S.refRedeem(e, 'uid_c', GOOGLE, a.code);
  const vorA = (await S.refRead(e, 'uid_a')).trialExp;
  const dritt = await S.refRedeem(e, 'uid_d', GOOGLE, a.code);
  assert.equal(dritt.ok, false);
  assert.equal(dritt.reason, 'code_exhausted');
  const A = await S.refRead(e, 'uid_a'), D = await S.refRead(e, 'uid_d');
  assert.equal(A.trialExp, vorA, 'Werber bekam eine dritte Woche');
  assert.equal(A.invited, 2, 'Zaehler lief ueber den Deckel');
  assert.equal(D.trialExp, 0, 'Geworbener bekam trotz totem Code eine Woche — Deckel waere wirkungslos');
  assert.equal(D.usedCode, null, 'abgelehnter Versuch darf das Konto nicht verbrennen');
  // Auch 20 weitere Fremde holen sich nichts (das TikTok-Szenario)
  for (let i = 0; i < 20; i++) {
    const r = await S.refRedeem(e, 'fremd_' + i, GOOGLE, a.code);
    assert.equal(r.reason, 'code_exhausted');
    assert.equal((await S.refRead(e, 'fremd_' + i)).trialExp, 0);
  }
});

test('Deckel ist konfigurierbar und wird eingehalten', async () => {
  const S = sandbox();
  const e = env({ REF_MAX_REDEEMS: '1' });
  const a = await mitCode(S, e, 'uid_a');
  assert.equal((await S.refRedeem(e, 'uid_b', GOOGLE, a.code)).ok, true);
  assert.equal((await S.refRedeem(e, 'uid_c', GOOGLE, a.code)).reason, 'code_exhausted');
  assert.equal(S.refMaxRedeems(env()), 2, 'Default bleibt 2');
  assert.equal(S.refMaxRedeems(env({ REF_MAX_REDEEMS: 'quatsch' })), 2, 'kaputter Wert faellt auf 2 zurueck');
});

test('Doppelklick auf Einloesen schreibt nur einmal gut', async () => {
  const S = sandbox(); const e = env();
  const a = await mitCode(S, e, 'uid_a');
  const [r1, r2] = await Promise.all([
    S.refRedeem(e, 'uid_b', GOOGLE, a.code),
    S.refRedeem(e, 'uid_b', GOOGLE, a.code),
  ]);
  const erfolge = [r1, r2].filter(r => r.ok).length;
  const B = await S.refRead(e, 'uid_b');
  const tage = (B.trialExp - Date.now()) / TAG;
  assert.ok(tage < 7.2, 'Doppelklick brachte ' + tage.toFixed(2) + ' Tage');
  assert.ok(erfolge >= 1, 'mindestens eine Einloesung muss durchgehen');
  assert.ok((await S.refRead(e, 'uid_a')).invited <= 2, 'Werber-Zaehler ueber dem Deckel');
});

/* ── Fail-closed ─────────────────────────────────────────────────────────── */

test('Ohne REF-Binding gibt es keine Gratis-Woche', async () => {
  const S = sandbox();
  const r = await S.refRedeem({}, 'uid_b', GOOGLE, 'ABCDEFG');
  assert.equal(r.reason, 'unavailable');
  assert.equal(await S.refRead({}, 'uid_b'), null, 'ohne Binding darf kein Datensatz erfunden werden');
  assert.equal(S.refTrialOn(null), false, 'null-Datensatz darf nie Premium bedeuten');
});

test('KV-Stoerung schaltet Premium ab statt frei', async () => {
  const S = sandbox();
  const kaputt = { REF: { get: async () => { throw new Error('KV weg'); }, put: async () => {}, delete: async () => {} } };
  assert.equal(await S.refRead(kaputt, 'uid_a'), null);
  const nutzung = await S.refTrialUse(kaputt, 'uid_a', 1);
  assert.equal(nutzung.ok, false, 'bei KV-Stoerung darf keine KI-Anfrage durchgehen');
});

test('refTrialOn erkennt abgelaufen, fehlend und gueltig', () => {
  const S = sandbox();
  assert.equal(S.refTrialOn({ trialExp: Date.now() + TAG }), true);
  assert.equal(S.refTrialOn({ trialExp: Date.now() - 1000 }), false);
  assert.equal(S.refTrialOn({ trialExp: 0 }), false);
  assert.equal(S.refTrialOn({}), false);
  assert.equal(S.refTrialOn(undefined), false);
});

/* ── Trial-Kontingent und Kostentopf ─────────────────────────────────────── */

test('Trial hat 15 Anfragen fuer die GESAMTE Gratiszeit', async () => {
  const S = sandbox(); const e = env();
  await S.refWrite(e, 'uid_b', { ...S.refEmptyRec(), trialExp: Date.now() + 7 * TAG });
  for (let i = 1; i <= 15; i++) {
    const r = await S.refTrialUse(e, 'uid_b', 1);
    assert.equal(r.ok, true, 'Anfrage ' + i + ' wurde abgelehnt');
    assert.equal(r.limit, 15);
  }
  const zuviel = await S.refTrialUse(e, 'uid_b', 1);
  assert.equal(zuviel.ok, false, '16. Anfrage muss abgelehnt werden');
  assert.equal(zuviel.trial, true, 'App braucht das Kennzeichen fuer den eigenen Kopf im KI-Menue');
});

test('Coach-Trigger zaehlen halb, Erstattung gibt genau zurueck', async () => {
  const S = sandbox(); const e = env();
  await S.refWrite(e, 'uid_b', { ...S.refEmptyRec(), trialExp: Date.now() + TAG });
  await S.refTrialUse(e, 'uid_b', 0.5);
  await S.refTrialUse(e, 'uid_b', 0.5);
  assert.equal((await S.refRead(e, 'uid_b')).aiUsed, 1);
  await S.refTrialRefund(e, 'uid_b', 1);
  assert.equal((await S.refRead(e, 'uid_b')).aiUsed, 0);
  await S.refTrialRefund(e, 'uid_b', 5);
  assert.equal((await S.refRead(e, 'uid_b')).aiUsed, 0, 'Erstattung darf nicht ins Minus laufen');
  const peek = await S.refTrialPeek(e, 'uid_b');
  assert.equal(peek.trial, true);
  assert.equal(peek.limit, 15);
});

test('Trial-Verbrauch landet im EIGENEN Topf, nicht bei den Zahlern', async () => {
  const S = sandbox(); const e = env();
  await S.refTrialRecord(e, { inTok: 3000, outTok: 600 });
  await S.refTrialRecord(e, { inTok: 1000, outTok: 400 });
  const s = await S.refTrialStats(e);
  assert.equal(s.calls, 2);
  assert.equal(s.inTok, 4000);
  assert.equal(s.outTok, 1000);
  const schluessel = [...e.REF._map.keys()];
  assert.ok(schluessel.some(k => k.startsWith('tstats:')), 'eigener Topf fehlt');
  assert.ok(!schluessel.some(k => k.startsWith('stats:')), 'Trial schreibt in die Zahler-Statistik');
  assert.equal(S.refTrialBudgetUsd(env()), 20, 'Default-Topf');
  assert.equal(S.refTrialBudgetUsd(env({ TRIAL_MONTHLY_USD: '5' })), 5);
  assert.equal(S.refTrialBudgetUsd(env({ TRIAL_MONTHLY_USD: '0' })), 20, 'unsinniger Wert faellt auf Default zurueck');
});

test('Kosten einer Gratis-Woche bleiben im Cent-Bereich', () => {
  const S = sandbox();
  // Schlimmster Fall je Anfrage: 4000 Token rein, 2000 raus (Scanner-Deckel).
  const proAnfrage = (4000 / 1e6) * 0.30 + (2000 / 1e6) * 2.50;
  const proNutzer  = proAnfrage * S.refTrialLimit(env());
  assert.ok(proNutzer < 0.12, 'Trial kostet ' + proNutzer.toFixed(3) + ' USD je Nutzer');
  const nutzerProTopf = S.refTrialBudgetUsd(env()) / proNutzer;
  assert.ok(nutzerProTopf > 150, 'Topf reicht nur fuer ' + Math.floor(nutzerProTopf) + ' Trial-Nutzer');
});

/* ── Kontoloeschung ──────────────────────────────────────────────────────── */

test('Loeschen entfernt Datensatz UND Codezuordnung', async () => {
  const S = sandbox(); const e = env();
  const a = await mitCode(S, e, 'uid_a');
  // Nachbau der /ref/forget-Route (die Route selbst haengt am fetch-Handler)
  await e.REF.delete('code:' + a.code);
  await e.REF.delete('u:uid_a');
  assert.equal(await e.REF.get('code:' + a.code), null);
  assert.equal(await e.REF.get('u:uid_a'), null);
  const r = await S.refRedeem(e, 'uid_b', GOOGLE, a.code);
  assert.equal(r.reason, 'unknown', 'geloeschter Code darf nicht weiterlaufen');
});

test('Alle Schreibvorgaenge tragen eine Verfallszeit', async () => {
  const S = sandbox();
  const gesehen = [];
  const e = { REF: {
    get: async () => null,
    put: async (k, v, opt) => { gesehen.push({ k, ttl: opt && opt.expirationTtl }); },
    delete: async () => {},
  } };
  await S.refWrite(e, 'uid_a', S.refEmptyRec());
  await S.refTrialRecord(e, { inTok: 1, outTok: 1 });
  assert.ok(gesehen.length >= 2);
  for (const g of gesehen) {
    assert.equal(typeof g.ttl, 'number', 'Schluessel ' + g.k + ' ohne TTL — bleibt ewig liegen');
    assert.ok(g.ttl <= 400 * 86400, 'TTL laenger als 400 Tage');
  }
});
