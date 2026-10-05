/**
 * 015 slice 6 (web leg) Works Test — Stripe Checkout, the verified
 * webhook, and license codes all land the same relay-held entitlement.
 * UserRelay and SupporterAccounts are plain classes: the fakes below are
 * real node:sqlite storage and real DO code — only the bindings and the
 * Stripe API are stubbed.
 *
 * Run: scripts/test.sh src/worker/stripe.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import worker from "./index.js";
import { SupporterAccounts } from "./accounts.js";
import { UserRelay } from "./relay.js";
import { verifyStripeSignature } from "./stripe.js";
import { licenseFor } from "./license.mjs";
import { entitled } from "./trial.mjs";

const te = new TextEncoder();
const UID = "11111111-2222-3333-4444-555555555555";
const WHSEC = "whsec_test";
const INTERNAL = "internal-secret";
const SECRET = "test-license-secret";

function fakeCtx() {
  const db = new DatabaseSync(":memory:");
  return {
    storage: {
      sql: {
        exec: (q, ...params) => {
          const reads = /^\s*(SELECT|WITH)/i.test(q) || /RETURNING/i.test(q);
          if (reads || params.length) {
            const st = db.prepare(q);
            const rows = reads ? st.all(...params) : (st.run(...params), []);
            return { toArray: () => rows };
          }
          db.exec(q);
          return { toArray: () => [] };
        },
      },
      setAlarm: async () => {},
      getAlarm: async () => null,
    },
    blockConcurrencyWhile: (fn) => fn(),
    getWebSockets: () => [],
    _db: db,
  };
}

/** Real DO code behind fake bindings — keyed by idFromName, like prod. */
function fakeEnv(extra = {}) {
  const accounts = new Map();
  const relays = new Map();
  const env = {
    ACCOUNTS: {
      idFromName: (n) => n,
      get: (name) => {
        if (!accounts.has(name)) {
          accounts.set(name, new SupporterAccounts(fakeCtx(), env));
        }
        return { fetch: (r) => accounts.get(name).fetch(r) };
      },
    },
    RELAY: {
      idFromName: (n) => n,
      get: (name) => {
        if (!relays.has(name)) relays.set(name, new UserRelay(fakeCtx(), env));
        return { fetch: (r) => relays.get(name).fetch(r) };
      },
    },
    _relay: (userId) => relays.get(userId),
    ...extra,
  };
  return env;
}

const signEvent = async (obj, secret = WHSEC, t = Math.floor(Date.now() / 1000)) => {
  const payload = JSON.stringify(obj);
  const key = await crypto.subtle.importKey("raw", te.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = [...new Uint8Array(
    await crypto.subtle.sign("HMAC", key, te.encode(`${t}.${payload}`)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return { payload, header: `t=${t},v1=${sig}` };
};

const webhook = (env, payload, header) =>
  worker.fetch(new Request("http://localhost/api/v1/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": header },
    body: payload,
  }), env);

const relayEntitlement = async (env, userId) =>
  (await (await env.RELAY.get(env.RELAY.idFromName(userId)).fetch(
    new Request(`https://relay/users/${userId}/internal/entitlement`, {
      headers: { "x-pip-internal": INTERNAL } }))).json()).entitlement;

test("webhook signature: good passes, bad and stale fail", async () => {
  const { payload, header } = await signEvent({ type: "ping" });
  const now = Date.now();
  assert.equal(await verifyStripeSignature(payload, header, WHSEC, now), true);
  assert.equal(await verifyStripeSignature(payload, `t=1,v1=bad`, WHSEC, now), false);
  assert.equal(await verifyStripeSignature(payload, header, "wrong", now), false);
  assert.equal(await verifyStripeSignature(payload, header, WHSEC,
    now + 10 * 60 * 1000), false, "stale timestamp must fail");
});

test("checkout.session.completed grants lifetime on the user's relay", async () => {
  const env = fakeEnv({ STRIPE_WEBHOOK_SECRET: WHSEC, PIP_INTERNAL_SECRET: INTERNAL });
  const { payload, header } = await signEvent({
    type: "checkout.session.completed",
    data: { object: { id: "cs_test_1", payment_status: "paid",
      client_reference_id: UID, metadata: { user_id: UID, acct_id: "acct_a" } } },
  });
  const res = await webhook(env, payload, header);
  assert.equal(res.status, 200);
  assert.equal(await relayEntitlement(env, UID), "lifetime");
});

test("043 K — delayed-payment success grants; failure flags the account", async () => {
  const env = fakeEnv({ STRIPE_WEBHOOK_SECRET: WHSEC, PIP_INTERNAL_SECRET: INTERNAL });

  // Bank-debit path: completed arrives "unpaid" — no grant yet.
  let { payload, header } = await signEvent({
    type: "checkout.session.completed",
    data: { object: { id: "cs_delayed", payment_status: "unpaid",
      client_reference_id: UID } } });
  await webhook(env, payload, header);
  assert.equal(await relayEntitlement(env, UID), "free");

  // async_payment_failed flags the relay — devices/self carries it.
  ({ payload, header } = await signEvent({
    type: "checkout.session.async_payment_failed",
    data: { object: { id: "cs_delayed", payment_status: "unpaid",
      client_reference_id: UID } } }));
  const res = await webhook(env, payload, header);
  assert.equal(res.status, 200);
  assert.equal(env._relay(UID).metaGet("payment_issue"), "failed");
  assert.equal(await relayEntitlement(env, UID), "free");

  // The retry succeeds: async_payment_succeeded grants AND clears the flag.
  ({ payload, header } = await signEvent({
    type: "checkout.session.async_payment_succeeded",
    data: { object: { id: "cs_delayed", payment_status: "paid",
      client_reference_id: UID } } }));
  await webhook(env, payload, header);
  assert.equal(await relayEntitlement(env, UID), "lifetime");
  assert.equal(env._relay(UID).metaGet("payment_issue"), null);
});

test("043 K — refund and dispute flag AND revoke (founder ruling)", async () => {
  // The PI lookup resolves the user — checkout writes user_id into
  // payment_intent_data.metadata; the charge only carries the PI id.
  const env = fakeEnv({
    STRIPE_WEBHOOK_SECRET: WHSEC, PIP_INTERNAL_SECRET: INTERNAL,
    PIP_LICENSE_SECRET: SECRET,
    STRIPE_FETCH: async (url) => new Response(JSON.stringify({
      id: "pi_x", metadata: url.includes("/payment_intents/") ? { user_id: UID } : {},
    })),
  });

  let { payload, header } = await signEvent({
    type: "checkout.session.async_payment_succeeded",
    data: { object: { id: "cs_9", payment_status: "paid", client_reference_id: UID } } });
  await webhook(env, payload, header);
  assert.equal(await relayEntitlement(env, UID), "lifetime");

  ({ payload, header } = await signEvent({
    type: "charge.refunded",
    data: { object: { id: "ch_1", payment_intent: "pi_x" } } }));
  await webhook(env, payload, header);
  assert.equal(env._relay(UID).metaGet("payment_issue"), "refunded");
  // Revoke: a refunded buyer does not keep the product.
  assert.equal(await relayEntitlement(env, UID), "free");

  // A revoked account's still-valid token stops unlocking paid gates —
  // the relay flag, not the crypto, is the authority.
  const license = await licenseFor(SECRET, UID);
  assert.equal(await entitled(env, UID, license), false);

  // The worker-side grant (new purchase) reopens a revoked account.
  ({ payload, header } = await signEvent({
    type: "checkout.session.completed",
    data: { object: { id: "cs_10", payment_status: "paid", client_reference_id: UID } } }));
  await webhook(env, payload, header);
  assert.equal(await relayEntitlement(env, UID), "lifetime");
  assert.equal(env._relay(UID).metaGet("payment_issue"), null);
  assert.equal(await entitled(env, UID, license), true);

  ({ payload, header } = await signEvent({
    type: "charge.dispute.created",
    data: { object: { id: "dp_1", payment_intent: "pi_x" } } }));
  await webhook(env, payload, header);
  assert.equal(env._relay(UID).metaGet("payment_issue"), "dispute");
  assert.equal(await relayEntitlement(env, UID), "free");
});

test("webhook ignores other events, unpaid sessions, and unsigned calls", async () => {
  const env = fakeEnv({ STRIPE_WEBHOOK_SECRET: WHSEC, PIP_INTERNAL_SECRET: INTERNAL });

  let { payload, header } = await signEvent({ type: "invoice.paid", data: {} });
  let res = await webhook(env, payload, header);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ignored, "invoice.paid");

  ({ payload, header } = await signEvent({
    type: "checkout.session.completed",
    data: { object: { id: "cs_2", payment_status: "unpaid", client_reference_id: UID } } }));
  res = await webhook(env, payload, header);
  assert.equal(res.status, 200);
  assert.equal(await relayEntitlement(env, UID), "free");

  // A 100%-off coupon completes with no_payment_required — still grants.
  ({ payload, header } = await signEvent({
    type: "checkout.session.completed",
    data: { object: { id: "cs_3", payment_status: "no_payment_required",
      client_reference_id: UID } } }));
  res = await webhook(env, payload, header);
  assert.equal(res.status, 200);
  assert.equal(await relayEntitlement(env, UID), "lifetime");

  assert.equal((await webhook(env, payload, "t=1,v1=forged")).status, 403);
  // Missing secret = payments not configured — never a silent grant.
  res = await webhook(fakeEnv({ PIP_INTERNAL_SECRET: INTERNAL }), payload, header);
  assert.equal(res.status, 503);
});

test("checkout: session-gated, supporter-of-the-user only, opens a Stripe session", async () => {
  const calls = [];
  const env = fakeEnv({
    STRIPE_SECRET_KEY: "sk_test",
    STRIPE_PRICE_ID: "price_lifetime",
    STRIPE_FETCH: async (u, init) => {
      calls.push({ u, init });
      return new Response(JSON.stringify({ id: "cs_1", url: "https://checkout.stripe.com/x" }));
    },
  });
  const dir = env.ACCOUNTS.get("dir");
  // Seed an account that supports UID, plus a live session for it.
  await env.ACCOUNTS.get("acct:acct_a").fetch(new Request(
    "https://accounts/acct/users", { method: "POST",
      body: JSON.stringify({ user_id: UID, keys: [] }) }));
  const { session } = await (await dir.fetch(new Request(
    "https://accounts/dir/session", { method: "POST",
      body: JSON.stringify({ acct_id: "acct_a" }) }))).json();

  const checkout = (body) => worker.fetch(new Request(
    "http://localhost/api/v1/checkout", {
      method: "POST", body: JSON.stringify(body) }), env);

  assert.equal((await checkout({ session: "bad", acct_id: "acct_a", user_id: UID })).status, 403);
  const other = "99999999-8888-7777-6666-555555555555";
  let res = await checkout({ session, acct_id: "acct_a", user_id: other });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "not_your_user");

  res = await checkout({ session, acct_id: "acct_a", user_id: UID });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).url, "https://checkout.stripe.com/x");
  const sent = new URLSearchParams(calls[0].init.body);
  assert.equal(sent.get("mode"), "payment");
  assert.equal(sent.get("line_items[0][price]"), "price_lifetime");
  assert.equal(sent.get("client_reference_id"), UID);
  assert.equal(sent.get("allow_promotion_codes"), "true");
});

test("checkout without Stripe config is a clean 503", async () => {
  const res = await worker.fetch(new Request("http://localhost/api/v1/checkout", {
    method: "POST", body: "{}" }), fakeEnv());
  assert.equal(res.status, 503);
});

test("code checkout: 1–9 at $49, 10+ at half price, a form POST 303s", async () => {
  const calls = [];
  const env = fakeEnv({
    STRIPE_SECRET_KEY: "sk_test",
    STRIPE_FETCH: async (u, init) => {
      calls.push({ u, init });
      return new Response(JSON.stringify(
        { id: "cs_bulk", url: "https://checkout.stripe.com/bulk" }));
    },
  });
  const post = (body, headers = {}) => worker.fetch(new Request(
    "http://localhost/api/v1/checkout/codes",
    { method: "POST", headers, body }), env);

  /* 040 § 8 — under ten is the family's $49 purchase, no account: the
   * count is one code at the full price, and redeem:"self" is the
   * app's own Buy — it returns to the app, which claims the code. */
  assert.equal((await post(JSON.stringify({ count: 0 }),
    { "content-type": "application/json" })).status, 400);
  const single = await post(JSON.stringify({ count: 5 }),
    { "content-type": "application/json" });
  assert.equal(single.status, 200);
  const sent1 = new URLSearchParams(calls.at(-1).init.body);
  assert.equal(sent1.get("line_items[0][price_data][unit_amount]"), "4900");
  assert.equal(sent1.get("line_items[0][quantity]"), "5");

  const self = await post(JSON.stringify({ count: 1, redeem: "self" }),
    { "content-type": "application/json" });
  assert.equal(self.status, 200);
  const sentSelf = new URLSearchParams(calls.at(-1).init.body);
  assert.equal(sentSelf.get("line_items[0][price_data][unit_amount]"), "4900");
  assert.equal(sentSelf.get("success_url"),
    "http://localhost/?order={CHECKOUT_SESSION_ID}");

  const res = await post(JSON.stringify({ count: 15 }),
    { "content-type": "application/json" });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).url, "https://checkout.stripe.com/bulk");
  const sent = new URLSearchParams(calls.at(-1).init.body);
  assert.equal(sent.get("line_items[0][price_data][unit_amount]"), "2450");
  assert.equal(sent.get("line_items[0][quantity]"), "15");
  assert.equal(sent.get("metadata[kind]"), "license_codes");
  assert.equal(sent.get("success_url"),
    "http://localhost/codes.html?session={CHECKOUT_SESSION_ID}");

  // The schools page's plain form POST gets a 303 straight to Stripe.
  const form = await post("count=20",
    { "content-type": "application/x-www-form-urlencoded" });
  assert.equal(form.status, 303);
  assert.equal(form.headers.get("location"), "https://checkout.stripe.com/bulk");
});

test("code order: webhook mints once, order endpoint delivers, codes redeem", async () => {
  const env = fakeEnv({ STRIPE_WEBHOOK_SECRET: WHSEC, PIP_INTERNAL_SECRET: INTERNAL });
  const session = "cs_bulk_1";
  const { payload, header } = await signEvent({
    type: "checkout.session.completed",
    data: { object: { id: session, payment_status: "paid",
      customer_details: { email: "slp@school.edu" },
      metadata: { kind: "license_codes", count: "3" } } },
  });
  let res = await webhook(env, payload, header);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).codes, 3);

  const order = () => worker.fetch(new Request(
    `http://localhost/api/v1/license/order?session=${session}`), env);
  const d = await (await order()).json();
  assert.equal(d.codes.length, 3);
  assert.equal(d.email, "slp@school.edu");
  assert.match(d.codes[0], /^PIP-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);

  // A Stripe retry returns the same batch — never a second mint.
  res = await webhook(env, payload, header);
  assert.equal(res.status, 200);
  assert.deepEqual((await (await order()).json()).codes, d.codes);

  // Unknown session 404s; a delivered code redeems through the bearer path.
  assert.equal((await worker.fetch(new Request(
    "http://localhost/api/v1/license/order?session=cs_nope"), env)).status, 404);
  res = await worker.fetch(new Request("http://localhost/api/v1/license/redeem", {
    method: "POST", body: JSON.stringify({ code: d.codes[0], user_id: UID }) }), env);
  assert.equal(res.status, 200);
  assert.equal(await relayEntitlement(env, UID), "lifetime");
});

test("license codes: admin mints, bearer redeems once, release on grant failure", async () => {
  const env = fakeEnv({ PIP_ADMIN_TOKEN: "adm", PIP_INTERNAL_SECRET: INTERNAL });
  const mint = (tok = "adm") => worker.fetch(new Request(
    "http://localhost/admin/v1/license-codes", {
      method: "POST", headers: { authorization: `Bearer ${tok}` },
      body: JSON.stringify({ count: 2, batch: "school-x" }) }), env);

  assert.equal((await mint("wrong")).status, 401);
  const m = await mint();
  assert.equal(m.status, 200);
  const { codes } = await m.json();
  assert.equal(codes.length, 2);
  assert.match(codes[0], /^PIP-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);

  const redeem = (code, userId = UID) => worker.fetch(new Request(
    "http://localhost/api/v1/license/redeem", {
      method: "POST", body: JSON.stringify({ code, user_id: userId }) }), env);

  let res = await redeem("PIP-FAKE-FAKE-FAKE");
  assert.equal(res.status, 403);
  res = await redeem(codes[0]);
  assert.equal(res.status, 200);
  assert.equal(await relayEntitlement(env, UID), "lifetime");
  // Single-use — a spent code stays spent.
  res = await redeem(codes[0]);
  assert.equal(res.status, 409);

  // Grant failure releases the code: redeem with no internal secret →
  // 502, then the same code redeems cleanly once the secret is back.
  const UID2 = "22222222-2222-3333-4444-555555555555";
  const noRelay = fakeEnv({ PIP_ADMIN_TOKEN: "adm" });
  const g = await (await noRelay.ACCOUNTS.get("dir").fetch(new Request(
    "https://accounts/dir/license/grant", { method: "POST",
      body: JSON.stringify({ count: 1, batch: "b2" }) }))).json();
  res = await worker.fetch(new Request("http://localhost/api/v1/license/redeem", {
    method: "POST", body: JSON.stringify({ code: g.codes[0], user_id: UID2 }) }), noRelay);
  assert.equal(res.status, 502);
  noRelay.PIP_INTERNAL_SECRET = INTERNAL;
  res = await worker.fetch(new Request("http://localhost/api/v1/license/redeem", {
    method: "POST", body: JSON.stringify({ code: g.codes[0], user_id: UID2 }) }), noRelay);
  assert.equal(res.status, 200, "released code must redeem again after the outage");
});
