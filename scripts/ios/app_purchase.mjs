/**
 * Pip Lifetime on the iPad (phase 044 F1) - PIPCORE.purchase. The web's
 * Lifetime page and entitlement reconciliation (public/board/lifetime-ui.js,
 * devices-ui.js reconcilePlan / claimLicense / the "Use code" handler),
 * minus the DOM and minus Stripe: the App Store sale itself is StoreKit
 * (Swift, Purchases.swift); this facade is everything that talks to the
 * Worker.
 *
 *   model(json)        pure render model: the web's words, owned vs for
 *                      sale, the trial line (lifetime-ui.js renderTrial).
 *   sync(...)          ensure the relay user, read the relay's entitlement
 *                      (the one answer), keep the device's license copy in
 *                      step with it, read the trial clock. -> "purchase"
 *                      {kind:"status"}
 *   redeem(...)        POST /api/v1/appstore/redeem with the signed
 *                      transaction, then sync. Swift finishes the
 *                      transaction only on {kind:"redeemed", ok:true}.
 *   redeemCode(...)    the "Have a code?" row (PU-5).
 *
 * The app reads entitlement ONLY from the Worker. Nothing here decides
 * whether a purchase is valid - the Worker verifies Apple's signature.
 * Results leave as host events (a JSC caller cannot await).
 */
import { PIP_LIFETIME_PRODUCT_ID } from "../../src/worker/appstore_product.mjs";
import { relayClient } from "../../public/shared/sync_client.mjs";
import { getDeviceIdentity, getUserKey, openKeyStore } from "./host/sync_crypto_host.mjs";
import { ensureRelayUser } from "./app_pair.mjs";
import { appSession } from "./app.mjs";

export const PRODUCT_ID = PIP_LIFETIME_PRODUCT_ID;

const parse = (x) => (typeof x === "string" ? JSON.parse(x) : x);
const emit = (payload) => globalThis.__pipHost.emit("purchase", JSON.stringify(payload));

/* ---------------- render model (index.html data-sec="lifetime") ---------------- */

const DAY = 86_400_000;
/** "What Lifetime adds" - index.html .life-feats, in order. */
const FEATURES = [
  ["A natural voice for the whole sentence", "Play reads the whole sentence the way a person would, not one word at a time."],
  ["The sentence buttons", "Fix it, Question, Past and Future turn their taps into proper sentences. Pip never adds a word they didn't tap."],
  ["Feeling faces", "Say it excited, sad or angry."],
  ["Choose a voice", "Pick the one that sounds like them."],
  ["A voice for the words you type", "New words speak in Pip's voice too."],
  ["Pictures drawn in Pip's style", "Add any word and Pip draws its picture to match the rest of the board. 300 drawings."],
  ["Progress and the report", "Weekly charts, goal words, and a PDF for school and therapy."],
  ["The whole team, no limits", "Unlimited words of your own, every supporter, every device."],
].map(([title, detail]) => ({ title, detail }));
/** index.html .life-checks ("Free forever"). */
const FREE = [
  "Tap a word and Pip says it out loud",
  "10 words of your own, with your photos",
  "One helper, plus backup if you switch devices",
  "5 pictures drawn for you",
];

/** lifetime-ui.js renderTrial's line, verbatim. */
export function trialLine(endsAt, now = Date.now()) {
  const days = endsAt ? Math.ceil((endsAt - now) / DAY) : 0;
  return days > 0
    ? `Free trial · ${days} day${days === 1 ? "" : "s"} left. Everything below is on.`
    : "Free trial ended. Buy to turn it all back on.";
}

/** devices-ui.js reconcilePlan's once-per-flag toast, verbatim. */
export const issueText = (issue) => issue === "failed"
  ? "Your payment didn't finish — Pip isn't unlocked yet."
  : issue ? "Your payment was refunded — Pip Lifetime is off for this user." : null;

/** { name, licensed, endsAt, issue, now? } -> everything the page draws.
 *  The App Store build never shows a web checkout, the unlock link, or the
 *  schools link (phase 044 § 2; PU-9 excluded). */
export function model(argsJson) {
  const a = parse(argsJson);
  const who = a.name || "this person";
  const owned = a.licensed === true;
  return {
    owned,
    ownedTitle: `${a.name || "This person"} has Pip Lifetime`,
    ownedSub: "Paid once. Nothing more to buy, ever. Everything below is on, on every device.",
    title: "Pip Lifetime",
    price: "$49",
    priceNote: "once",
    priceFine: "No subscription. Ever.",
    lede: "Pip speaks whole sentences in a natural voice, turns a few taps into a proper sentence or a question, and lets every parent, teacher and therapist help.",
    trialLine: owned ? null : trialLine(a.endsAt, a.now),
    buyFine: `Whoever pays, the license lands on ${who}'s board.`,
    featuresLabel: owned ? "What's on" : "What Lifetime adds",
    features: FEATURES,
    freeLabel: "Free forever",
    free: FREE,
    codeLabel: "Have a code?",
    codeHint: `From a school, a grant, or someone who bought Pip Lifetime for ${who}.`,
    issue: issueText(a.issue),
  };
}

/* ---------------- "Hear the difference" (board.js hearFree / sayClip) ---------------- */

/** The free side: the real word clips for "I want an apple", exactly what a
 *  free Play speaks. Slots Swift's speaker plays; words with no shipped
 *  clip are skipped, never spoken by device TTS. */
export function hearFree(appId) {
  const s = appSession(appId);
  const d = s.d;
  const slots = [];
  for (const text of ["I", "want", "an", "apple"]) {
    const sid = d.prepare(`SELECT sense_id AS id FROM label WHERE text = ? AND kind = 'lemma'
      AND status = 'approved' AND locale = ?`).all(text, s.locale)[0]?.id ?? null;
    const slot = globalThis.PIPCORE.voice.resolveSlot(d,
      { kind: sid ? "sense" : "typed", id: sid, text }, s.locale, s.voiceId);
    if (slot?.type === "clip" && slot.key) slots.push(slot);
  }
  return slots;
}

/** The Lifetime side: the shipped natural-sentence clip (never device TTS). */
export const hearLifetime = () => ({ type: "clip", key: "audio/onramp/demo-sentence.mp3" });

/* ---------------- Worker orchestration ---------------- */

const licenseKey = (id) => `user/${id}/license`;

/** The web's claimLicense: the relay says lifetime -> keep its license copy. */
async function claimLicense(client, store, id) {
  const { entitlement, license } = await client.entitlement();
  if (entitlement !== "lifetime" || !license) return null;
  await store.put(licenseKey(id), license);
  return license;
}

/** devices-ui.js reconcilePlan: one answer (the relay's), the device's
 *  license copy kept in step with it. */
async function reconcile(client, store, id, self) {
  const local = await store.get(licenseKey(id));
  if (self?.entitlement === "lifetime") {
    if (!local) await claimLicense(client, store, id).catch(() => null);
    return true;
  }
  if (!local) return false;
  try {
    await client.setEntitlement(local);
    return true;
  } catch (e) {
    if (e.message === "bad_license" || e.message === "payment_revoked") await store.del(licenseKey(id));
    return false;
  }
}

/** Everything the Lifetime page and the gates need, from the Worker. */
async function readStatus(appId, baseUrl, me, store) {
  const identity = await getDeviceIdentity(store);
  const userKey = await getUserKey(store, me.id, me.sync.epoch ?? 1);
  const client = relayClient({ userId: me.sync.userId, baseUrl, identity, userKey });
  const self = await client.selfKey();
  const licensed = await reconcile(client, store, me.id, self);
  let endsAt = null;
  if (!licensed) {
    const license = await store.get(licenseKey(me.id));
    const res = await fetch(`${baseUrl}/api/v1/trial`, {
      headers: { "x-pip-user": me.id, "x-pip-license": license ?? "" } }).catch(() => null);
    if (res?.ok) endsAt = (await res.json().catch(() => ({}))).endsAt ?? null;
  }
  // The one flag the library gates read (app_library ownLeft / countLine).
  try { appSession(appId).licensed = licensed; } catch { /* session closed */ }
  // 043 K: say a refund / failed payment once per flag value, as the web does.
  let issue = null;
  if (self?.payment_issue) {
    const key = `user/${me.id}/payment_issue`;
    if ((await store.get(key)) !== self.payment_issue) {
      await store.put(key, self.payment_issue);
      issue = self.payment_issue;
    }
  }
  return { userId: me.id, licensed, endsAt, issue, issueText: issueText(issue) };
}

/** Make sure the person is on the relay (the web does this before any
 *  purchase: the license lives on the user's relay). */
async function ensure(baseUrl, userRowJson, label) {
  const me = parse(userRowJson);
  const wasLinked = !!me.sync?.userId;
  const store = openKeyStore();
  await ensureRelayUser(baseUrl, me, label, store);
  return { me, store, newlyLinked: !wasLinked };
}

/** Every call carries a `ref` the host echoes, so Swift can await one answer. */
const reply = (ref, payload) => emit({ ref, ...payload });
const failed = (ref, kind, e) => reply(ref, { kind, ok: false, permanent: false, error: String(e?.message ?? e) });

/** The constant, for Swift (the .storekit file must carry the same id). */
export const productId = () => PRODUCT_ID;

/** Refresh the Lifetime state for a person. -> {kind:"status", status:{licensed, endsAt, issue, issueText}} */
export function sync(appId, baseUrl, userRowJson, label, ref = null) {
  (async () => {
    // A refresh must not link anyone: opening a person is not a purchase (the web's ensureUser runs on
    // a user action - a card, a first device, an invite, a purchase). Linking on open made every fresh
    // install a relay user before it could join a code, restore, or sign in (044 F2 found it in the C3/C5 E2E).
    const row = parse(userRowJson);
    if (!row.sync?.userId) {
      // Unlinked: nothing owned yet; only the trial clock (keyed by the person id, no relay user needed).
      const res = await fetch(`${baseUrl}/api/v1/trial`, {
        headers: { "x-pip-user": row.id, "x-pip-license": "" } }).catch(() => null);
      const endsAt = res?.ok ? ((await res.json().catch(() => ({}))).endsAt ?? null) : null;
      try { appSession(appId).licensed = false; } catch { /* session closed */ }
      reply(ref, { kind: "status", ok: true, newlyLinked: false,
        status: { userId: row.id, licensed: false, endsAt, issue: null, issueText: null } });
      return;
    }
    const { me, store, newlyLinked } = await ensure(baseUrl, userRowJson, label);
    reply(ref, { kind: "status", ok: true, newlyLinked, status: await readStatus(appId, baseUrl, me, store) });
  })().catch((e) => failed(ref, "status", e));
  return { accepted: true };
}

/**
 * Hand the Worker a signed App Store transaction for this person.
 * {kind:"redeemed", ok:true} -> Swift may finish the transaction.
 * ok:false + permanent:true is a refusal retrying cannot fix (revoked /
 * wrong user / not ours): Swift leaves it unfinished and says so.
 */
export function redeem(appId, baseUrl, userRowJson, jws, label, ref = null) {
  (async () => {
    const { me, store, newlyLinked } = await ensure(baseUrl, userRowJson, label);
    const res = await fetch(`${baseUrl}/api/v1/appstore/redeem`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jws, user_id: me.id }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      reply(ref, { kind: "redeemed", ok: false, httpStatus: res.status, error: body.error ?? null,
        permanent: res.status >= 400 && res.status < 500, newlyLinked,
        status: await readStatus(appId, baseUrl, me, store).catch(() => null) });
      return;
    }
    reply(ref, { kind: "redeemed", ok: true, duplicate: body.duplicate === true, newlyLinked,
      status: await readStatus(appId, baseUrl, me, store) });
  })().catch((e) => failed(ref, "redeemed", e));
  return { accepted: true };
}

/** PU-5: a school / grant / gift code, redeemed worker-side (devices-ui.js). */
export function redeemCode(appId, baseUrl, userRowJson, code, label, ref = null) {
  (async () => {
    const { me, store, newlyLinked } = await ensure(baseUrl, userRowJson, label);
    const res = await fetch(`${baseUrl}/api/v1/license/redeem`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: me.id, code: String(code ?? "").trim() }),
    });
    const wrong = "That code didn't work. Check it and try again.";
    if (!res.ok) { reply(ref, { kind: "code", ok: false, message: wrong, newlyLinked }); return; }
    const status = await readStatus(appId, baseUrl, me, store);
    reply(ref, { kind: "code", ok: status.licensed, newlyLinked, status,
      message: status.licensed ? `Pip Lifetime is on for ${me.name || "this person"}.` : wrong });
  })().catch((e) => failed(ref, "code", e));
  return { accepted: true };
}
