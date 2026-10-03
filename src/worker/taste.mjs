/**
 * 039 — the free taste: TASTE_POOL model-button taps per user, one time,
 * shared across ✨ ❓ ⏪ ⏩. Two halves:
 *
 * The pool is pure SQL over the minimal `sql.exec(q, ...p).toArray()`
 * surface, mounted in the shared ledger DO (tile.js's TileLedger — the
 * same DO tile_ledger and picture_ledger already share, 030 § 5.1), so a
 * spend is atomic without a new DO class or wrangler migration. An R2
 * read-modify-write counter like usageRecord's could be overspent by
 * two parallel presses.
 *
 * Speak grants live in the VOICE R2 bucket: a transform that spent a
 * taste tap writes taste-grant/<uid>/<sha256(norm(text))> so the next
 * /voice/speak for that exact output text runs the licensed path once.
 * R2 has no TTL — a grant older than GRANT_TTL_MS is refused and deleted
 * on read; there is no cron on this worker to sweep with.
 *
 * Privacy (039 § 6): the pool is two integers keyed by uid. The IP day
 * counter stores sha256(salt|ip), never the address — a speed bump on
 * profile farming, not a wall. Grants key by a text hash and are
 * consumed; no sentence text is stored.
 */
import { checkLicense } from "./license.mjs";

export const TASTE_POOL = 10;      // one constant; founder may tune (§ 4.1)
export const TASTE_IP_DAY_CAP = 5; // new tasting profiles per connection/day (§ 4.3 placeholder)
export const GRANT_TTL_MS = 10 * 60_000;

const one = (sql, q, p = []) => sql.exec(q, ...p).toArray()[0] ?? null;

export function ensureSchema(sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS taste_pool (
    uid TEXT PRIMARY KEY,
    remaining INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  sql.exec(`CREATE TABLE IF NOT EXISTS taste_ip (
    day TEXT NOT NULL,
    ip_hash TEXT NOT NULL,
    profiles INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, ip_hash)
  )`);
}

/** Reserve one tap before the model call; the caller refunds on failure
 *  so a press that produced no text costs nothing (§ 4.1). The first
 *  spend for a uid is also the "new tasting profile" moment — the only
 *  place the per-connection day cap bites (§ 4.3). */
export function reserveTaste(sql, { uid, ipHash = null, day, now,
  pool = TASTE_POOL, ipCap = TASTE_IP_DAY_CAP }) {
  const row = one(sql, "SELECT remaining FROM taste_pool WHERE uid = ?", [uid]);
  if (row) {
    if (row.remaining <= 0) return { ok: false, error: "empty", left: 0 };
    sql.exec("UPDATE taste_pool SET remaining = remaining - 1, updated_at = ? WHERE uid = ?",
      now, uid);
    return { ok: true, left: row.remaining - 1 };
  }
  if (ipHash) {
    sql.exec(`INSERT INTO taste_ip (day, ip_hash, profiles) VALUES (?, ?, 1)
      ON CONFLICT (day, ip_hash) DO UPDATE SET profiles = profiles + 1`, day, ipHash);
    const profiles = one(sql,
      "SELECT profiles FROM taste_ip WHERE day = ? AND ip_hash = ?", [day, ipHash])?.profiles ?? 0;
    if (profiles > ipCap) {
      sql.exec("INSERT INTO taste_pool (uid, remaining, created_at, updated_at) VALUES (?, 0, ?, ?)",
        uid, now, now);
      return { ok: false, error: "ip_cap", left: 0 };
    }
  }
  sql.exec("INSERT INTO taste_pool (uid, remaining, created_at, updated_at) VALUES (?, ?, ?, ?)",
    uid, pool - 1, now, now);
  return { ok: true, left: pool - 1 };
}

/** Give back a reserved tap — the model call never returned text. */
export function refundTaste(sql, { uid, now, pool = TASTE_POOL }) {
  sql.exec("UPDATE taste_pool SET remaining = MIN(?, remaining + 1), updated_at = ? WHERE uid = ?",
    pool, now, uid);
}

export function tasteLeft(sql, { uid, pool = TASTE_POOL }) {
  return one(sql, "SELECT remaining FROM taste_pool WHERE uid = ?", [uid])?.remaining ?? pool;
}

/* ------------------------- worker-side helpers ------------------------ */

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });

const stub = (env) =>
  env.TILE_LEDGER?.get(env.TILE_LEDGER.idFromName("ledger"));

export async function tasteReserve(env, { uid, ipHash }) {
  const res = await stub(env)?.fetch(new Request("https://do/taste/reserve", {
    method: "POST", body: JSON.stringify({ uid, ip_hash: ipHash }),
  }));
  return res?.ok ? res.json() : null;
}

export async function tasteRefund(env, uid) {
  await stub(env)?.fetch(new Request("https://do/taste/refund", {
    method: "POST", body: JSON.stringify({ uid }),
  })).catch(() => {});
}

const te = new TextEncoder();
export const sha256Hex = async (s) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(s)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");

/** sha256(salt | ip) — the day counter stores the hash, never the
 *  address (§ 4.3). Null without a header (wrangler dev, tests): the cap
 *  only guards a real connection. */
export const ipHashFor = async (env, request) => {
  const ip = request.headers.get("cf-connecting-ip");
  return ip ? sha256Hex(`taste-ip|${env.PIP_LICENSE_SECRET ?? "pip"}|${ip}`) : null;
};

/** GET /api/v1/taste — the quiet counter's read (Settings → Talking
 *  subtitle). Headers like /voice/tile/replaced: x-pip-user,
 *  x-pip-license. */
export async function handleTaste(request, env) {
  const uid = request.headers.get("x-pip-user");
  if (typeof uid !== "string" || !/^[0-9a-f-]{36}$/i.test(uid)) {
    return json({ error: "bad_user_id" }, { status: 400 });
  }
  if (await checkLicense(
    env.PIP_LICENSE_SECRET, uid, request.headers.get("x-pip-license"))) {
    return json({ licensed: true });
  }
  const res = await stub(env)?.fetch(new Request(`https://do/taste/left?uid=${uid}`));
  if (!res?.ok) return json({ error: "taste_unavailable" }, { status: 503 });
  return json(await res.json());
}

/* ------------------------------ grants ------------------------------ */

/** Same normalization the speak cache key uses (024 rule 2): punctuation
 *  kept, case and spaces normalized. Kept here so voice.js and
 *  transform.js share it without a module cycle. */
export const normalizeGrantText = (text) =>
  String(text).trim().toLowerCase().replace(/\s+/g, " ");

export const grantKey = async (uid, text) =>
  `taste-grant/${uid}/${await sha256Hex(normalizeGrantText(text))}`;

export async function writeSpeakGrant(env, uid, text, at = Date.now()) {
  await env.VOICE.put(await grantKey(uid, text), JSON.stringify({ ts: at }));
}

/** Valid and unexpired? A stale grant deletes itself and reads as
 *  absent — consumed only by consumeSpeakGrant once audio is served. */
export async function peekSpeakGrant(env, uid, text) {
  const key = await grantKey(uid, text);
  const obj = await env.VOICE.get(key).catch(() => null);
  if (!obj) return false;
  let ts = null;
  try { ts = JSON.parse(await obj.text()).ts; } catch { /* malformed reads as absent */ }
  if (typeof ts !== "number" || Date.now() - ts > GRANT_TTL_MS) {
    await env.VOICE.delete(key).catch(() => {});
    return false;
  }
  return true;
}

export async function consumeSpeakGrant(env, uid, text) {
  await env.VOICE.delete(await grantKey(uid, text)).catch(() => {});
}
