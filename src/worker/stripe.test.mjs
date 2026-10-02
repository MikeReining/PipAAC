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

const te = new TextEncoder();
const UID = "11111111-2222-3333-4444-555555555555";
const WHSEC = "whsec_test";
const INTERNAL = "internal-secret";

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
});

test("checkout without Stripe config is a clean 503", async () => {
  const res = await worker.fetch(new Request("http://localhost/api/v1/checkout", {
    method: "POST", body: "{}" }), fakeEnv());
  assert.equal(res.status, 503);
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
