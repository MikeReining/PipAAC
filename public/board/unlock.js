/**
 * ?unlock — the founder's one-tap link for testing a licensed user, and
 * early supporters' way in before payments land (015).
 *
 *   /?unlock=<PIP_UNLOCK_TOKEN>   any host: the worker mints this user's
 *                                 license (mint-only token)
 *   /?unlock                      localhost only: the dev-only endpoint
 *                                 mints it, so preview needs no token
 *
 * The license then activates exactly like a pasted key (devices-ui
 * activateLicense: relay first, device copy second). The param is
 * stripped at once so a token doesn't linger in the address bar.
 */
import { kv } from "../shared/platform.mjs";
const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];

/** ?unlicensed (localhost only) — the 040 trial preview: stops the
 *  dev-license self-mint so this session behaves like a real free
 *  install. Sticky per user until ?unlock or a real activation. */
export function unlicensedFromUrl({ me }) {
  const params = new URLSearchParams(location.search);
  if (!params.has("unlicensed")) return;
  params.delete("unlicensed");
  const qs = params.toString();
  history.replaceState(null, "", location.pathname + (qs ? `?${qs}` : ""));
  if (LOOPBACK.includes(location.hostname)) {
    kv.setItem(`pip-unlicensed:${me.id}`, "1");
  }
}
export const unlicensedPreview = (userId) =>
  LOOPBACK.includes(location.hostname)
  && kv.getItem(`pip-unlicensed:${userId}`) === "1";

export function unlockFromUrl({ me, activateLicense, toast }) {
  const params = new URLSearchParams(location.search);
  if (!params.has("unlock")) return;
  const token = params.get("unlock");
  params.delete("unlock");
  const qs = params.toString();
  history.replaceState(null, "", location.pathname + (qs ? `?${qs}` : ""));
  const [path, body] = !token && LOOPBACK.includes(location.hostname)
    ? ["/api/v1/voice/dev-license", { user_id: me.id }]
    : ["/api/v1/voice/unlock", { user_id: me.id, token }];
  fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => (r.ok ? r.json() : null))
    .then(async (d) => {
      if (!d?.license) { toast("That unlock link didn't work."); return; }
      await activateLicense(d.license, { quiet: true });
      toast(`Pip Lifetime is on for ${me.name || "this person"}.`);
    })
    .catch((e) => {
      console.warn("unlock failed", e);
      toast("Couldn't reach Pip to unlock — try again online.");
    });
}

/** ?purchased=<session-id> — back from Stripe Checkout (015 slice 6).
 *  The webhook usually lands within a second of the redirect, so poll
 *  the relay briefly for the license copy; if it hasn't arrived the
 *  purchase is still safe — the grant lands when Stripe confirms. */
export function purchasedFromUrl({ me, claimPurchasedLicense, toast }) {
  const params = new URLSearchParams(location.search);
  if (!params.has("purchased")) return;
  params.delete("purchased");
  const qs = params.toString();
  history.replaceState(null, "", location.pathname + (qs ? `?${qs}` : ""));
  const who = me.name || "this person";
  (async () => {
    for (let i = 0; i < 8; i++) {
      try {
        if (await claimPurchasedLicense()) return;
      } catch { /* relay or sync not ready yet — try again */ }
      await new Promise((r) => setTimeout(r, 1500));
    }
    toast(`Payment received — Pip Lifetime turns on for ${who} the next time this device is online.`);
  })();
}

/** ?buy — the "Send an unlock link" URL (040 § 8): whoever opens it
 *  lands straight in a hosted Stripe Checkout for one $49 license
 *  code — no account, nothing personal in the URL. After paying they
 *  see the code on the confirmation page and get it by email; the
 *  family redeems it for their person. The param is stripped at once. */
export function checkoutFromUrl({ toast }) {
  const params = new URLSearchParams(location.search);
  if (!params.has("buy")) return;
  params.delete("buy");
  const qs = params.toString();
  history.replaceState(null, "", location.pathname + (qs ? `?${qs}` : ""));
  fetch("/api/v1/checkout/codes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ count: 1 }),
  }).then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (d?.url) location.assign(d.url);
      else toast("Couldn't open checkout — try again online.");
    })
    .catch(() => toast("Couldn't open checkout — try again online."));
}

/** ?order=<session-id> — back from Stripe after the app's own Buy
 *  (redeem:"self", 040 § 8). The webhook mints the order's code within
 *  a second or two; poll it, redeem for this board, pick the license
 *  copy up from the relay — the buyer never pastes anything. */
export function orderFromUrl({ me, ensureUser, redeemLicense, claimPurchasedLicense, toast }) {
  const params = new URLSearchParams(location.search);
  const session = params.get("order");
  if (!session) return;
  params.delete("order");
  const qs = params.toString();
  history.replaceState(null, "", location.pathname + (qs ? `?${qs}` : ""));
  (async () => {
    await ensureUser?.({ quiet: true }).catch(() => {});
    for (let i = 0; i < 8; i++) {
      try {
        const { codes } = await fetch(
          `/api/v1/license/order?session=${encodeURIComponent(session)}`)
          .then((r) => r.json());
        if (codes?.length) {
          await redeemLicense(me.id, codes[0]);
          if (await claimPurchasedLicense()) return;
        }
      } catch { /* order not minted or relay not ready — try again */ }
      await new Promise((r) => setTimeout(r, 1500));
    }
    toast(`Payment received — your code is in the email too; paste it in Your account if it doesn't land.`);
  })();
}
