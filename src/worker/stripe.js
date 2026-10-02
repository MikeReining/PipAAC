/**
 * 015 slice 6 (web leg) — Stripe Checkout + webhook → relay license grant.
 *
 * Flow (Pricing_And_Packaging § 4.5):
 *   1. A signed-in supporter POSTs /api/v1/checkout {session, acct_id,
 *      user_id}; we open a Stripe Checkout Session for the $49 Pip
 *      Lifetime price and hand back the hosted-page URL. The supporter
 *      must be one of the user's supporters — the license belongs to the
 *      user, whoever pays.
 *   2. Stripe calls /api/v1/stripe/webhook. On a verified
 *      checkout.session.completed we write the entitlement on the user's
 *      relay through the internal route — the same lifetime the dev
 *      license and license codes produce.
 *
 * No Stripe SDK: the API is a form-encoded POST and the webhook check is
 * HMAC-SHA256 — both trivial on WebCrypto, and a dependency here would be
 * one more thing parsed by every isolate.
 *
 * Test seam: env.STRIPE_FETCH replaces global fetch (Stripe API calls);
 * prod never sets it.
 */
const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });
const bad = (error, status = 400) => json({ error }, { status });

const te = new TextEncoder();
const STRIPE_API = "https://api.stripe.com";
const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;

const hex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

const constEq = (a, b) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const acctDir = (env) => env.ACCOUNTS.get(env.ACCOUNTS.idFromName("dir"));
const acctStub = (env, id) => env.ACCOUNTS.get(env.ACCOUNTS.idFromName(`acct:${id}`));

const internalSecret = (env) => env.PIP_INTERNAL_SECRET ?? env.PIP_LICENSE_SECRET;

/** Write the license on the user's relay (015 slice 6). Shared by the
 *  Stripe webhook and code redemption — either grant lands the same
 *  lifetime entitlement with provenance. */
export async function grantLifetime(env, userId, source, ref) {
  const secret = internalSecret(env);
  if (!env.RELAY || !secret) return bad("internal_unavailable", 503);
  const res = await env.RELAY.get(env.RELAY.idFromName(userId)).fetch(
    new Request(`https://relay/users/${userId}/internal/entitlement`, {
      method: "POST",
      headers: { "x-pip-internal": secret },
      body: JSON.stringify({ source, ref }),
    }));
  if (!res.ok) return bad("grant_failed", 502);
  return json({ ok: true, entitlement: "lifetime" });
}

/** Stripe REST: form-encoded POST, Bearer key. STRIPE_FETCH is the test
 *  seam — inject a stub; unset in prod. */
async function stripeApi(env, path, params) {
  const f = env.STRIPE_FETCH ?? fetch;
  return f(`${env.STRIPE_API_BASE ?? STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
}

/** Stripe-Signature: "t=<unix>,v1=<hex>[,v1=<hex>…]". Signed payload is
 *  `${t}.${rawBody}` under the endpoint's whsec. Exported for tests. */
export async function verifyStripeSignature(payload, header, secret, nowMs,
  toleranceMs = WEBHOOK_TOLERANCE_MS) {
  if (!header || !secret) return false;
  let t = null;
  const sigs = [];
  for (const kv of header.split(",")) {
    const i = kv.indexOf("=");
    const k = kv.slice(0, i), v = kv.slice(i + 1);
    if (k === "t" && t === null) t = v;
    else if (k === "v1") sigs.push(v);
  }
  if (!t || !sigs.length) return false;
  if (Math.abs(nowMs - Number(t) * 1000) > toleranceMs) return false;
  const key = await crypto.subtle.importKey("raw", te.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = hex(await crypto.subtle.sign("HMAC", key, te.encode(`${t}.${payload}`)));
  return sigs.some((v) => constEq(v, want));
}

/** POST /api/v1/checkout — session-gated. The supporter buys for a user
 *  already in their account bundle (wrapped keys prove the relation). */
export async function handleCheckout(request, env, url) {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID) {
    return bad("payments_unavailable", 503);
  }
  if (!env.ACCOUNTS) return bad("accounts_unavailable", 503);
  const body = await request.json().catch(() => null);
  const acctId = String(body?.acct_id ?? "");
  const userId = String(body?.user_id ?? "");
  const session = String(body?.session ?? "");
  if (!acctId || !session || !/^[0-9a-f-]{36}$/i.test(userId)) {
    return bad("bad_request");
  }
  const chk = await acctDir(env).fetch(new Request(
    "https://accounts/dir/session/check", {
      method: "POST", body: JSON.stringify({ session, acct_id: acctId }),
    }));
  if (!chk.ok) return chk;
  // The account must actually support this user — checkout for a
  // stranger's user id would still pay us, but the license would land
  // on a user the buyer has no relation to.
  const users = await (await acctStub(env, acctId).fetch(
    new Request("https://accounts/acct/users/list"))).json();
  if (!users.user_ids?.includes(userId)) return bad("not_your_user", 403);

  const res = await stripeApi(env, "/v1/checkout/sessions", {
    mode: "payment",
    allow_promotion_codes: "true",
    "line_items[0][price]": env.STRIPE_PRICE_ID,
    "line_items[0][quantity]": "1",
    client_reference_id: userId,
    "metadata[user_id]": userId,
    "metadata[acct_id]": acctId,
    success_url: `${url.origin}/?purchased={CHECKOUT_SESSION_ID}`,
    cancel_url: `${url.origin}/`,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.url) return bad("stripe_error", 502);
  return json({ url: data.url });
}

/** POST /api/v1/stripe/webhook — signature-verified Stripe events.
 *  checkout.session.completed grants lifetime; everything else is a 200
 *  so Stripe stops retrying. */
export async function handleStripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) return bad("payments_unavailable", 503);
  const payload = await request.text();
  const ok = await verifyStripeSignature(
    payload, request.headers.get("stripe-signature"),
    env.STRIPE_WEBHOOK_SECRET, Date.now());
  if (!ok) return bad("bad_signature", 403);

  const event = JSON.parse(payload);
  if (event.type !== "checkout.session.completed") {
    return json({ ok: true, ignored: String(event.type ?? "unknown") });
  }
  const s = event.data?.object ?? {};
  // payment_status "unpaid" happens with delayed methods (e.g. bank
  // debits) — the grant waits for payment. "no_payment_required" is a
  // fully-discounted checkout (100%-off coupon): it IS complete.
  if (s.payment_status
    && !["paid", "no_payment_required"].includes(s.payment_status)) {
    return json({ ok: true, ignored: "unpaid" });
  }
  const userId = s.client_reference_id || s.metadata?.user_id;
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return bad("no_user", 400);
  return grantLifetime(env, userId, "stripe", String(s.id ?? ""));
}
