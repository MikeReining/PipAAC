/**
 * The Nest grant (founder 2026-10-27, final): every student an SLP adds to
 * SLP Nest gets Pip Lifetime free; families never pay. A device that arrived
 * on a Nest link (?nest=<code>, public/shared/nest.mjs) redeems the code here
 * like a license code: the worker asks the Nest, then the relay holds the
 * grant with source "nest" and asks the Nest again daily (relay.js
 * nestRecheck). Only the code is sent to the Nest; its answer body (practice
 * targets) is never read.
 *
 * env.NEST_ORIGIN overrides the production Nest; env.NEST_FETCH is the test seam.
 */
import { grantLifetime } from "./stripe.js";

export const NEST_ORIGIN = "https://app.slpnest.com";
const CODE_RE = /^[2-9A-HJKMNP-Z]{6}$/;
const RECHECK_MS = 24 * 60 * 60 * 1000;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status, headers: { "content-type": "application/json; charset=utf-8" } });

/** "known" | "unknown" | "unreachable" — the Nest's code-only practice read:
 *  200 known, 404 unknown; a network error or a Nest 5xx is unreachable. */
export async function nestKnows(env, code) {
  if (!CODE_RE.test(String(code ?? ""))) return "unknown";
  try {
    const res = await (env.NEST_FETCH ?? fetch)(
      `${env.NEST_ORIGIN ?? NEST_ORIGIN}/api/students/${code}/practice`);
    if (res.ok) return "known";
    if (res.status === 404) return "unknown";
  } catch { /* offline or the Nest is down */ }
  return "unreachable";
}

/** POST /api/v1/nest/redeem {user_id, code}: bearer like a license code —
 *  the code the Nest knows is the authority. */
export async function handleNestRedeem(request, env) {
  const body = await request.json().catch(() => null);
  const userId = String(body?.user_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: "bad_user_id" }, 400);
  const state = await nestKnows(env, body?.code);
  if (state === "unreachable") return json({ error: "nest_unreachable" }, 503);
  if (state === "unknown") return json({ error: "unknown_code" }, 404);
  // Seat pays: billing is not built and every Nest seat is in early access, so the Nest knowing the code is the whole check.
  const g = await grantLifetime(env, userId, "nest", body.code);
  if (!g.ok) return json({ error: "grant_failed" }, 502);
  return json({ ok: true, entitlement: "lifetime" });
}

/** The relay's half (relay.js fetch, before any read of the plan): a Nest
 *  grant is asked about again at most daily. An unreachable Nest keeps it,
 *  so a child is never cut off by an outage; a forgotten code drops it the
 *  way a refund does, flagged nest_ended so a stored license copy stops
 *  unlocking (trial.mjs licenseHolds, the relay's POST entitlement). */
export async function nestRecheck(relay, now = Date.now()) {
  if (relay.metaGet("license_source") !== "nest") return;
  const last = Math.max(Number(relay.metaGet("nest_checked") ?? 0), Number(relay.metaGet("licensed_at") ?? 0));
  if (now - last < RECHECK_MS) return;
  relay.metaSet("nest_checked", now);
  if ((await nestKnows(relay.env, relay.metaGet("license_ref"))) !== "unknown") return;
  relay.metaSet("payment_issue", "nest_ended");
  relay.ctx.storage.sql.exec(
    "DELETE FROM meta WHERE k IN ('entitlement','license_source','license_ref','licensed_at','nest_checked')");
}
