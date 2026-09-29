/**
 * 030 — the picture ledger: pure SQL over the minimal
 * `sql.exec(q, ...params).toArray()` surface a Durable Object exposes,
 * so light tests drive it with node:sqlite. Lives inside the shared
 * TileLedger DO (030 § 5.1 — one DO for both).
 *
 * Rows never carry a user, device, or license id (030 § 8): the ledger
 * knows what was drawn and what families picked, never who asked.
 */
const one = (sql, q, p = []) => sql.exec(q, ...p).toArray()[0] ?? null;
const all = (sql, q, p = []) => sql.exec(q, ...p).toArray();

export function ensureSchema(sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS pic_drawing (
    key TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    description TEXT NOT NULL,
    scope TEXT,
    lens TEXT,
    kind TEXT,
    r2_key TEXT,
    status TEXT NOT NULL,
    review TEXT NOT NULL DEFAULT 'unreviewed',
    claimed_at INTEGER,
    retry_after INTEGER,
    hits INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    minted_at INTEGER
  )`);
  sql.exec("CREATE INDEX IF NOT EXISTS pic_drawing_created ON pic_drawing (created_at DESC)");
  // Append-only mint events — the billing-truth instrument (WT11).
  sql.exec(`CREATE TABLE IF NOT EXISTS pic_mint (
    key TEXT NOT NULL,
    minted_at INTEGER NOT NULL
  )`);
  sql.exec("CREATE INDEX IF NOT EXISTS pic_mint_at ON pic_mint (minted_at)");
  // Anonymous crowd signal: (text or description) -> picture counts.
  sql.exec(`CREATE TABLE IF NOT EXISTS pic_pick (
    text_norm TEXT NOT NULL,
    image_id TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (text_norm, image_id)
  )`);
  sql.exec(`CREATE TABLE IF NOT EXISTS pic_reject (
    text_norm TEXT NOT NULL,
    image_id TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (text_norm, image_id)
  )`);
  // Founder rulings from the disagreement page (§ 5.5).
  sql.exec(`CREATE TABLE IF NOT EXISTS pic_pin (
    text_norm TEXT PRIMARY KEY,
    image_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  sql.exec(`CREATE TABLE IF NOT EXISTS pic_block (
    text_norm TEXT NOT NULL,
    image_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (text_norm, image_id)
  )`);
  sql.exec(`CREATE TABLE IF NOT EXISTS pic_disagreement (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text_norm TEXT NOT NULL,
    ours TEXT NOT NULL,
    action TEXT NOT NULL,
    theirs TEXT,
    description TEXT,
    scope TEXT,
    dismissed_at INTEGER,
    created_at INTEGER NOT NULL
  )`);
  sql.exec(`CREATE TABLE IF NOT EXISTS pic_admin_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    text_norm TEXT,
    ours TEXT,
    theirs TEXT,
    created_at INTEGER NOT NULL
  )`);
}

/** § 4.2 rank inputs for a find: the founder pin, blocked images, and
 *  pick/reject counts for the given (signals key -> candidates) pairs. */
export function rankSignals(sql, items) {
  const out = [];
  for (const item of items ?? []) {
    const text = String(item?.text_norm ?? "");
    const ids = Array.isArray(item?.image_ids) ? item.image_ids.map(String) : [];
    if (!text) {
      out.push({ pinned: null, blocked: [], counts: {} });
      continue;
    }
    const pinned = one(sql,
      "SELECT image_id FROM pic_pin WHERE text_norm = ?", [text])?.image_id ?? null;
    const blocked = all(sql,
      "SELECT image_id FROM pic_block WHERE text_norm = ?", [text])
      .map((r) => r.image_id);
    const counts = {};
    if (ids.length) {
      const marks = ids.map(() => "?").join(",");
      for (const r of all(sql,
        `SELECT image_id, count FROM pic_pick WHERE text_norm = ? AND image_id IN (${marks})`,
        [text, ...ids])) {
        (counts[r.image_id] ??= {}).picks = r.count;
      }
      for (const r of all(sql,
        `SELECT image_id, count FROM pic_reject WHERE text_norm = ? AND image_id IN (${marks})`,
        [text, ...ids])) {
        (counts[r.image_id] ??= {}).rejects = r.count;
      }
    }
    out.push({ pinned, blocked, counts });
  }
  return out;
}

/* ------------------------------ draws ------------------------------ */

export function getDraw(sql, key) {
  return one(sql, "SELECT * FROM pic_drawing WHERE key = ?", [String(key)]);
}

/** § 5.1 single flight: exactly one claimant mints; a `minting` row is
 *  reclaimable after STALE_MS (claimant died mid-synth). Returns
 *  hit | mint | minting | failed_wait. */
export const DRAW_STALE_MS = 10 * 60 * 1000;

export function claimDraw(sql, { key, text, description, scope, lens, kind, now }) {
  const row = getDraw(sql, key);
  if (row?.status === "ready" && row.r2_key) {
    sql.exec("UPDATE pic_drawing SET hits = hits + 1 WHERE key = ?", key);
    return { disposition: "hit", row };
  }
  if (row?.status === "withheld") return { disposition: "withheld", row };
  if (row?.status === "failed" && row.retry_after && row.retry_after > now) {
    return { disposition: "failed_wait", row };
  }
  if (row?.status === "minting" && now - (row.claimed_at ?? 0) < DRAW_STALE_MS) {
    return { disposition: "minting", row };
  }
  if (row) {
    sql.exec(
      "UPDATE pic_drawing SET status = 'minting', claimed_at = ? WHERE key = ?",
      now, key);
  } else {
    sql.exec(
      `INSERT INTO pic_drawing (key, text, description, scope, lens, kind,
        status, claimed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'minting', ?, ?)`,
      key, text, description, scope ?? null, lens ?? null, kind ?? null, now, now);
  }
  return { disposition: "mint" };
}

/** Mint events are append-only billing truth (WT11): one row per image
 *  call the ledger knows about — the count that must match OpenRouter. */
export function finishDraw(sql, { key, r2Key, now }) {
  sql.exec(
    `UPDATE pic_drawing SET status = 'ready', r2_key = ?, minted_at = ?,
       retry_after = NULL WHERE key = ?`,
    r2Key, now, key);
  sql.exec("INSERT INTO pic_mint (key, minted_at) VALUES (?, ?)", key, now);
}

export function failDraw(sql, { key, retryAfter, now }) {
  sql.exec(
    "UPDATE pic_drawing SET status = 'failed', retry_after = ? WHERE key = ?",
    retryAfter, key);
}

/** Founder view (§ 9 /admin/v1/pictures/recent): newest first, no identity
 *  columns exist to leak. `before` paginates on created_at. */
export function listDraws(sql, { before = null, limit = 50 } = {}) {
  const args = [];
  let where = "";
  if (before) { where = "WHERE created_at < ?"; args.push(Number(before)); }
  return all(sql,
    `SELECT key, text, description, scope, lens, kind, r2_key, status,
            review, hits, created_at, minted_at
     FROM pic_drawing ${where} ORDER BY created_at DESC LIMIT ?`,
    [...args, Math.min(Math.max(1, Number(limit) || 50), 200)]);
}
