/**
 * 043 I — the usage ledger: atomic spending reservations inside a
 *  Durable Object. The old R2 counters read and wrote separately —
 *  concurrent requests passed the same check and overwrote each
 *  other's increments, and a failed read counted as zero spend.
 *
 *  The SQL layer is pure (node:sqlite-testable, like tile_ledger.mjs):
 *  reserve() checks day+minute budgets and increments in the same
 *  serialized storage transaction — the DO's single-threaded storage
 *  makes the pair atomic. refund() returns a reservation when the
 *  provider call that followed it failed. Minute counters are attempt
 *  counts — a refund never lowers them, bursts are about requests
 *  made, not requests that worked.
 *
 *  One DO per namespace (idFromName(ns)); rows are keyed (ns, uid, …)
 *  anyway so a shared instance would also work — per-namespace keeps
 *  each object's storage small.
 */

const one = (sql, q, p = []) => sql.exec(q, ...p).toArray()[0] ?? null;

export const dayKey = (ts) => new Date(ts).toISOString().slice(0, 10);
export const minKey = (ts) => Math.floor(ts / 60000);

export function ensureSchema(sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS usage_day (
    ns TEXT NOT NULL, uid TEXT NOT NULL, day TEXT NOT NULL,
    chars INTEGER NOT NULL DEFAULT 0, reqs INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (ns, uid, day))`);
  sql.exec(`CREATE TABLE IF NOT EXISTS usage_min (
    ns TEXT NOT NULL, uid TEXT NOT NULL, minute INTEGER NOT NULL,
    reqs INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (ns, uid, minute))`);
  sql.exec(`CREATE TABLE IF NOT EXISTS usage_hit (
    ns TEXT NOT NULL, uid TEXT NOT NULL, at INTEGER NOT NULL,
    over TEXT NOT NULL)`);
  sql.exec("CREATE INDEX IF NOT EXISTS usage_hit_at ON usage_hit (at)");
}

const hit = (sql, ns, uid, at, over) =>
  sql.exec("INSERT INTO usage_hit (ns, uid, at, over) VALUES (?, ?, ?, ?)",
    ns, uid, at, over);

/** Unconditional metering (the metering-only paths — find/find-batch —
 *  count work done, they don't gate). */
export function add(sql, { ns, uid, chars = 0, now = Date.now(), over = null }) {
  sql.exec(`INSERT INTO usage_day (ns, uid, day, chars, reqs) VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(ns, uid, day) DO UPDATE SET chars = chars + ?, reqs = reqs + 1`,
    ns, uid, dayKey(now), chars, chars);
  sql.exec(`INSERT INTO usage_min (ns, uid, minute, reqs) VALUES (?, ?, ?, 1)
    ON CONFLICT(ns, uid, minute) DO UPDATE SET reqs = reqs + 1`,
    ns, uid, minKey(now));
  if (over) hit(sql, ns, uid, now, over);
}

/** Atomic check + count: {allowed:true} means this request's chars and
 *  request are already billed; {allowed:false, over} means nothing was
 *  billed and the denial is on the usage_hit trail. */
export function reserve(sql, { ns, uid, chars = 0, dayBudget, minBudget, now = Date.now() }) {
  const d = one(sql,
    "SELECT chars AS c FROM usage_day WHERE ns = ? AND uid = ? AND day = ?",
    [ns, uid, dayKey(now)]);
  if ((d?.c ?? 0) + chars > dayBudget) {
    hit(sql, ns, uid, now, "day");
    return { allowed: false, over: "day" };
  }
  const m = one(sql,
    "SELECT reqs AS r FROM usage_min WHERE ns = ? AND uid = ? AND minute = ?",
    [ns, uid, minKey(now)]);
  if ((m?.r ?? 0) + 1 > minBudget) {
    hit(sql, ns, uid, now, "minute");
    return { allowed: false, over: "minute" };
  }
  add(sql, { ns, uid, chars, now });
  return { allowed: true };
}

/** Give a reservation back when the provider call it paid for failed.
 *  Day chars+reqs return; the minute burst does not (attempts count). */
export function refund(sql, { ns, uid, chars = 0, now = Date.now() }) {
  sql.exec(`UPDATE usage_day SET chars = MAX(0, chars - ?), reqs = MAX(0, reqs - 1)
    WHERE ns = ? AND uid = ? AND day = ?`, chars, ns, uid, dayKey(now));
}

/* ------------------------------ the DO ------------------------------ */

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });

export class UsageLedger {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    ctx.blockConcurrencyWhile(() => ensureSchema(ctx.storage.sql));
  }

  async fetch(request) {
    const url = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const sql = this.ctx.storage.sql;
    if (url.pathname === "/reserve" && request.method === "POST") {
      return json(reserve(sql, body));
    }
    if (url.pathname === "/add" && request.method === "POST") {
      add(sql, body);
      return json({ ok: true });
    }
    if (url.pathname === "/refund" && request.method === "POST") {
      refund(sql, body);
      return json({ ok: true });
    }
    return json({ error: "not_found" }, { status: 404 });
  }
}
