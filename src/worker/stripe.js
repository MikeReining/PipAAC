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
// $49 × 50% (Pricing_And_Packaging § 4.5: 10+ codes, half price).
const CODE_UNIT_CENTS = 2450;    // 10+ — the half-price school tier
const SINGLE_CODE_CENTS = 4900;  // 1–9 — the family price (040 § 8)

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
 *  already in their account bundle (wrapped keys prove the relation).
 *  Everyone else buys a code through /checkout/codes and redeems it
 *  (040 § 8 — the app's Buy button uses that route too). */
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
    // 043 K — refunds/disputes arrive on the charge, which never sees
    // session metadata; the PaymentIntent carries the user through.
    "payment_intent_data[metadata][user_id]": userId,
    success_url: `${url.origin}/?purchased={CHECKOUT_SESSION_ID}`,
    cancel_url: `${url.origin}/`,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.url) return bad("stripe_error", 502);
  return json({ url: data.url });
}

/** POST /api/v1/checkout/codes — self-serve codes, no account (Pricing
 *  § 4.5 + 040 § 8). One to nine codes are $49 each — the family's
 *  in-app purchase and the unlock link; ten or more is the half-price
 *  school tier. The marketing site's plain form POSTs here and gets a
 *  303 to Stripe; a JSON caller gets {url}. No session needed — the
 *  codes are the deliverable, not a license on a user. `redeem:"self"`
 *  is the app's own Buy: the buyer returns to the app, where the code
 *  is claimed for the board on this device automatically. */
export async function handleCheckoutCodes(request, env, url) {
  if (!env.STRIPE_SECRET_KEY) return bad("payments_unavailable", 503);
  const ct = request.headers.get("content-type") ?? "";
  let count, redeem, asForm;
  if (ct.includes("application/x-www-form-urlencoded")) {
    const form = new URLSearchParams(await request.text());
    count = Number(form.get("count"));
    redeem = String(form.get("redeem") ?? "");
    asForm = true;
  } else {
    const body = await request.json().catch(() => null);
    count = Number(body?.count);
    redeem = String(body?.redeem ?? "");
    asForm = false;
  }
  if (!Number.isInteger(count) || count < 1 || count > 200) {
    return bad("bad_count");
  }
  // 040 § 8: the licence is per person — under ten is $49 a code, the
  // school tier's half price starts at ten. Never silently reprice.
  const unit = count >= 10 ? CODE_UNIT_CENTS : SINGLE_CODE_CENTS;
  const referer = request.headers.get("referer") ?? "";
  const res = await stripeApi(env, "/v1/checkout/sessions", {
    mode: "payment",
    allow_promotion_codes: "true",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(unit),
    "line_items[0][price_data][product_data][name]": "Pip Lifetime license code",
    "line_items[0][price_data][product_data][description]":
      "One code unlocks Pip Lifetime for one student, forever.",
    "line_items[0][quantity]": String(count),
    // Schools expense this — a Stripe receipt plus a proper invoice.
    "invoice_creation[enabled]": "true",
    "metadata[kind]": "license_codes",
    "metadata[count]": String(count),
    // redeem=self: back to the app, which claims the minted code for
    // this board (?order=). Anything else: the codes page hands the
    // buyer the code(s) to pass along.
    success_url: redeem === "self"
      ? `${url.origin}/?order={CHECKOUT_SESSION_ID}`
      : `${url.origin}/codes.html?session={CHECKOUT_SESSION_ID}`,
    cancel_url: referer.startsWith("http") ? referer : `${url.origin}/`,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.url) return bad("stripe_error", 502);
  if (asForm) return Response.redirect(data.url, 303);
  return json({ url: data.url });
}

/** GET /api/v1/license/order?session=cs_… — the success page polls this
 *  until the webhook has minted the order's codes. The Stripe session
 *  id is the bearer. */
export async function handleLicenseOrder(request, env, url) {
  if (!env.ACCOUNTS) return bad("accounts_unavailable", 503);
  const session = String(url.searchParams.get("session") ?? "");
  if (!session.startsWith("cs_")) return bad("bad_session");
  return acctDir(env).fetch(new Request(
    "https://accounts/dir/license/order/codes", {
      method: "POST", body: JSON.stringify({ session_id: session }) }));
}

/** Paid code order: mint the batch in the dir (idempotent on the Stripe
 *  session id), then email the buyer — best-effort; the codes page
 *  already shows them. */
async function fulfillCodeOrder(env, s) {
  if (!env.ACCOUNTS) return bad("accounts_unavailable", 503);
  const count = Math.min(Math.max(Number(s.metadata?.count) || 0, 1), 200);
  const email = s.customer_details?.email ?? s.customer_email ?? null;
  const r = await acctDir(env).fetch(new Request(
    "https://accounts/dir/license/order", {
      method: "POST",
      body: JSON.stringify({ session_id: String(s.id ?? ""), count, email }),
    }));
  if (!r.ok) return bad("order_failed", 502);
  const order = await r.json();
  if (env.EMAIL && email && order.codes?.length) {
    try {
      const { EmailMessage } = await import("cloudflare:email");
      const raw = [
        `From: Pip <accounts@pipaac.org>`,
        `To: ${email}`,
        `Subject: Your Pip license codes (${order.codes.length})`,
        `Content-Type: text/plain; charset=utf-8`,
        ``,
        `Thank you — each code below unlocks Pip Lifetime for one student,`,
        `forever. A code works once: in Pip, open the board's settings and`,
        `paste it into the license field.`,
        ``,
        ...order.codes,
        ``,
        `You can see this list again any time at:`,
        `https://app.pipaac.org/codes.html?session=${s.id}`,
      ].join("\r\n");
      await env.EMAIL.send(new EmailMessage("accounts@pipaac.org", email, raw));
    } catch { /* the codes page is the delivery of record */ }
  }
  return json({ ok: true, codes: order.codes?.length ?? 0 });
}

/** Stripe REST read — the refund/dispute path resolves the user from
 *  the PaymentIntent a charge belongs to. Same STRIPE_FETCH seam. */
async function stripeGet(env, path) {
  const f = env.STRIPE_FETCH ?? fetch;
  const res = await f(`${env.STRIPE_API_BASE ?? STRIPE_API}${path}`, {
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
  });
  return res.json().catch(() => null);
}

/** 043 K — flag a delayed-payment failure/refund/dispute on the user's
 *  relay; devices/self and the entitlement read carry it to the app.
 *  revoke: a refund or dispute drops the lifetime grant in the same DO
 *  op (founder ruling — a refunded buyer does not keep the product). */
async function paymentIssue(env, userId, issue, { revoke = false } = {}) {
  const secret = internalSecret(env);
  if (!env.RELAY || !secret) return;
  await env.RELAY.get(env.RELAY.idFromName(userId)).fetch(
    new Request(`https://relay/users/${userId}/internal/payment_issue`, {
      method: "POST",
      headers: { "x-pip-internal": secret },
      body: JSON.stringify({ issue, revoke }),
    })).catch(() => {});
}

const uuidOf = (o) => {
  const id = o?.client_reference_id || o?.metadata?.user_id;
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
};

/** POST /api/v1/stripe/webhook — signature-verified Stripe events.
 *  checkout.session.completed + async_payment_succeeded grant lifetime;
 *  a failed delayed payment, refund, or dispute flags the account;
 *  everything else is a 200 so Stripe stops retrying. */
export async function handleStripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) return bad("payments_unavailable", 503);
  const payload = await request.text();
  const ok = await verifyStripeSignature(
    payload, request.headers.get("stripe-signature"),
    env.STRIPE_WEBHOOK_SECRET, Date.now());
  if (!ok) return bad("bad_signature", 403);

  const event = JSON.parse(payload);
  const type = String(event.type ?? "");
  const s = event.data?.object ?? {};

  if (type === "checkout.session.completed"
      || type === "checkout.session.async_payment_succeeded") {
    // payment_status "unpaid" happens with delayed methods (e.g. bank
    // debits) — the grant waits for payment. "no_payment_required" is a
    // fully-discounted checkout (100%-off coupon): it IS complete.
    if (s.payment_status
      && !["paid", "no_payment_required"].includes(s.payment_status)) {
      return json({ ok: true, ignored: "unpaid" });
    }
    if (s.metadata?.kind === "license_codes") {
      return fulfillCodeOrder(env, s);
    }
    const userId = uuidOf(s);
    if (!userId) return bad("no_user", 400);
    return grantLifetime(env, userId, "stripe", String(s.id ?? ""));
  }

  // 043 K — a delayed payment that never landed (bank debit declined):
  // flag the account — the app says the purchase didn't finish instead
  // of leaving the family to wonder.
  if (type === "checkout.session.async_payment_failed") {
    const userId = uuidOf(s);
    if (userId) await paymentIssue(env, userId, "failed");
    return json({ ok: true });
  }

  // 043 K — refunds and disputes arrive on the charge; resolve the user
  // through the PaymentIntent (session metadata is on the PI from the
  // checkout's payment_intent_data) and revoke the grant.
  if (type === "charge.refunded" || type.startsWith("charge.dispute.")) {
    let userId = uuidOf(s);
    if (!userId && s.payment_intent) {
      const pi = await stripeGet(env, `/v1/payment_intents/${s.payment_intent}`);
      userId = uuidOf(pi);
    }
    if (userId) {
      await paymentIssue(env, userId,
        type === "charge.refunded" ? "refunded" : "dispute", { revoke: true });
    }
    return json({ ok: true });
  }

  return json({ ok: true, ignored: type || "unknown" });
}
