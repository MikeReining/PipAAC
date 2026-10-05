/**
 * 040 — the 7-day trial: TRIAL_DAYS of every paid feature, starting at
 * the first online boot (install in practice), one time per person.
 * Replaces 039's 10-tap pool — nothing is counted; one predicate,
 * entitled(), answers "paid feature, yes or no".
 *
 * The record is pure SQL over the minimal `sql.exec(q, ...p).toArray()`
 * surface, mounted in the shared ledger DO (tile.js's TileLedger — the
 * same DO tile_ledger and picture_ledger already share), so the start
 * write is atomic and idempotent without a new DO class or a wrangler
 * migration. No 039 speak grants: a trialing user IS entitled, so the
 * gates just say yes — no token, no echo, no R2 objects.
 *
 * Privacy: the trial row is one timestamp keyed by uid. The per-
 * connection day counter stores sha256(salt|ip), never the address —
 * a speed bump on profile farming, not a wall. An over-cap start is
 * refused but not recorded, so the next day's start can still win.
 */
import { checkLicense } from "./license.mjs";

export const TRIAL_DAYS = 7;        // one constant; founder may tune (040 § 2)
export const TRIAL_IP_DAY_CAP = 5;  // new trialing profiles per connection/day

const one = (sql, q, p = []) => sql.exec(q, ...p).toArray()[0] ?? null;

export function ensureSchema(sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS trial (
    uid TEXT PRIMARY KEY,
    started_at INTEGER NOT NULL
  )`);
  sql.exec(`CREATE TABLE IF NOT EXISTS trial_ip (
    day TEXT NOT NULL,
    ip_hash TEXT NOT NULL,
    profiles INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, ip_hash)
  )`);
}

/** Record the install. Insert-if-absent: the first successful call wins
 *  and later calls return the existing record (idempotent — clients may
 *  retry every boot). Over the per-connection day cap the call is
 *  refused without a row, so next day's start can still win (040 § 5.2). */
export function trialStart(sql, { uid, ipHash = null, day, now,
  trialDays = TRIAL_DAYS, ipCap = TRIAL_IP_DAY_CAP }) {
  const row = one(sql, "SELECT started_at FROM trial WHERE uid = ?", [uid]);
  if (row) return { endsAt: row.started_at > 0 ? row.started_at + trialDays * 86_400_000 : null, fresh: false };
  if (ipHash) {
    sql.exec(`INSERT INTO trial_ip (day, ip_hash, profiles) VALUES (?, ?, 1)
      ON CONFLICT (day, ip_hash) DO UPDATE SET profiles = profiles + 1`, day, ipHash);
    const profiles = one(sql,
      "SELECT profiles FROM trial_ip WHERE day = ? AND ip_hash = ?", [day, ipHash])?.profiles ?? 0;
    if (profiles > ipCap) return { endsAt: null, capped: true, fresh: false };
  }
  sql.exec("INSERT INTO trial (uid, started_at) VALUES (?, ?)", uid, now);
  return { endsAt: now + trialDays * 86_400_000, fresh: true };
}

/** The entitlement read: endsAt plus whether the trial is live right
 *  now. No row or a refused start → no trial. */
export function trialStatus(sql, { uid, now, trialDays = TRIAL_DAYS }) {
  const row = one(sql, "SELECT started_at FROM trial WHERE uid = ?", [uid]);
  const endsAt = row?.started_at > 0 ? row.started_at + trialDays * 86_400_000 : null;
  return { endsAt, active: endsAt !== null && now < endsAt };
}

/* ------------------------- worker-side helpers ------------------------ */

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });

const stub = (env) =>
  env.TILE_LEDGER?.get(env.TILE_LEDGER.idFromName("ledger"));

export async function trialStartFetch(env, { uid, ipHash }) {
  const res = await stub(env)?.fetch(new Request("https://do/trial/start", {
    method: "POST", body: JSON.stringify({ uid, ip_hash: ipHash }),
  }));
  return res?.ok ? res.json() : null;
}

export async function trialStatusFetch(env, uid) {
  const res = await stub(env)?.fetch(new Request(`https://do/trial/status?uid=${uid}`));
  return res?.ok ? res.json() : null;
}

/** The relay's payment flag for a presented license (043 K): a revoked
 *  account's still-valid token must stop unlocking. Null = unreachable
 *  or the user never linked — fall through to the crypto check. */
async function relayPaymentIssue(env, uid) {
  const secret = env.PIP_INTERNAL_SECRET ?? env.PIP_LICENSE_SECRET;
  if (!env.RELAY || !secret) return null;
  const res = await env.RELAY.get(env.RELAY.idFromName(uid)).fetch(
    new Request(`https://relay/users/${uid}/internal/entitlement`, {
      headers: { "x-pip-internal": secret } })).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json().catch(() => null))?.payment_issue ?? null;
}

/** The one predicate (040 § 5.1): a valid presented license wins unless
 *  the relay has it revoked (043 K — refund/dispute); a presented-but-bad
 *  one is forged — callers answer bad_license; nothing presented → the
 *  trial decides. */
export async function entitled(env, uid, presented) {
  if (await checkLicense(env.PIP_LICENSE_SECRET, uid, presented)) {
    const issue = await relayPaymentIssue(env, uid);
    return !(issue === "refunded" || issue === "dispute");
  }
  if (presented) return false;
  return (await trialStatusFetch(env, uid))?.active === true;
}

const te = new TextEncoder();
export const sha256Hex = async (s) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(s)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");

/** sha256(salt | ip) — the day counter stores the hash, never the
 *  address. Null without a header (wrangler dev, tests): the cap only
 *  guards a real connection. */
export const ipHashFor = async (env, request) => {
  const ip = request.headers.get("cf-connecting-ip");
  return ip ? sha256Hex(`trial-ip|${env.PIP_LICENSE_SECRET ?? "pip"}|${ip}`) : null;
};

/** POST /api/v1/trial/start + GET /api/v1/trial (040 § 5.2). Start is
 *  called on first online boot; the status read feeds the Settings
 *  countdown. Headers like /voice/tile/replaced: x-pip-user,
 *  x-pip-license. */
export async function handleTrial(request, env, url) {
  if (request.method === "POST" && url.pathname === "/api/v1/trial/start") {
    const body = await request.json().catch(() => null);
    const uid = String(body?.user_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(uid)) return json({ error: "bad_user_id" }, { status: 400 });
    const res = await trialStartFetch(env, { uid, ipHash: await ipHashFor(env, request) });
    if (!res) return json({ error: "trial_unavailable" }, { status: 503 });
    return json(res);
  }
  const uid = request.headers.get("x-pip-user");
  if (typeof uid !== "string" || !/^[0-9a-f-]{36}$/i.test(uid)) {
    return json({ error: "bad_user_id" }, { status: 400 });
  }
  if (await checkLicense(
    env.PIP_LICENSE_SECRET, uid, request.headers.get("x-pip-license"))) {
    return json({ licensed: true, endsAt: null });
  }
  const res = await trialStatusFetch(env, uid);
  if (!res) return json({ error: "trial_unavailable" }, { status: 503 });
  return json({ licensed: false, endsAt: res.endsAt });
}
