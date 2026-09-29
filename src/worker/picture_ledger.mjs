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
  // The ONLY identity-keyed record on the picture path: the per-user
  // drawing allowance (§ 8). Everything else in this schema is anonymous.
  sql.exec(`CREATE TABLE IF NOT EXISTS pic_allowance (
    uid TEXT PRIMARY KEY,
    used INTEGER NOT NULL DEFAULT 0
  )`);
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
    detail TEXT,
    created_at INTEGER NOT NULL
  )`);
  // detail arrived after the first deploy: CREATE IF NOT EXISTS does
  // nothing for an older table, so backfill the column when missing.
  if (!all(sql, "SELECT name FROM pragma_table_info('pic_admin_log')")
    .some((c) => c.name === "detail")) {
    sql.exec("ALTER TABLE pic_admin_log ADD COLUMN detail TEXT");
  }
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

/** § 6.2 — the anonymous crowd signal. One row per (text_norm, image_id);
 *  text_norm is the § 3.3 signals key (description for personal scope),
 *  so a name can never be the row key. */
export function recordPick(sql, { textNorm, imageId }) {
  sql.exec(
    `INSERT INTO pic_pick (text_norm, image_id, count) VALUES (?, ?, 1)
     ON CONFLICT (text_norm, image_id) DO UPDATE SET count = count + 1`,
    textNorm, imageId);
}

/** § 6.1 — the drawing allowance, atomic in SQLite (a read-modify-write
 *  counter on R2 could be overspent by a burst of concurrent draws).
 *  Reserve before the vendor call; refund when the mint doesn't happen. */
export function reserveDraw(sql, { uid, cap }) {
  sql.exec(
    "INSERT OR IGNORE INTO pic_allowance (uid, used) VALUES (?, 0)", uid);
  sql.exec(
    "UPDATE pic_allowance SET used = used + 1 WHERE uid = ? AND used < ?",
    uid, cap);
  const applied = one(sql, "SELECT changes() AS c")?.c === 1;
  const used = one(sql,
    "SELECT used FROM pic_allowance WHERE uid = ?", [uid])?.used ?? 0;
  return { reserved: applied, used, left: Math.max(0, cap - used) };
}

export function refundDraw(sql, { uid }) {
  sql.exec(
    "UPDATE pic_allowance SET used = MAX(0, used - 1) WHERE uid = ?", uid);
}

export function drawAllowance(sql, { uid, cap }) {
  const used = one(sql,
    "SELECT used FROM pic_allowance WHERE uid = ?", [uid])?.used ?? 0;
  return { used, left: Math.max(0, cap - used) };
}

/** § 6.3 — an adult replaced our picture: demote it for everyone and keep
 *  one disagreement row for the § 5.5 review. `theirs` is null for a photo
 *  (counted, never seen); `description` is what the adult wrote. */
export function recordReject(sql, { textNorm, ours, action, theirs, description, scope, now }) {
  sql.exec(
    `INSERT INTO pic_reject (text_norm, image_id, count) VALUES (?, ?, 1)
     ON CONFLICT (text_norm, image_id) DO UPDATE SET count = count + 1`,
    textNorm, ours);
  sql.exec(
    `INSERT INTO pic_disagreement
       (text_norm, ours, action, theirs, description, scope, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    textNorm, ours, action, theirs ?? null, description ?? null,
    scope ?? "common", now);
}

/** § 5.5 — review rows: (text, our picture) groups, common scope only,
 *  dismissed rows hidden until fresh rejections arrive. Each group
 *  carries what families chose instead, descriptions included. */
export function listDisagreements(sql, { limit = 200 } = {}) {
  const groups = all(sql,
    `SELECT text_norm, ours, COUNT(*) AS rejects, MAX(created_at) AS latest
     FROM pic_disagreement
     WHERE (scope IS NULL OR scope = 'common') AND dismissed_at IS NULL
     GROUP BY text_norm, ours
     ORDER BY rejects DESC, latest DESC
     LIMIT ?`,
    [Math.min(Math.max(1, Number(limit) || 200), 500)]);
  for (const g of groups) {
    g.choices = all(sql,
      `SELECT action, theirs, description, COUNT(*) AS count
       FROM pic_disagreement
       WHERE text_norm = ? AND ours = ? AND dismissed_at IS NULL
       GROUP BY action, theirs, description
       ORDER BY count DESC`,
      [g.text_norm, g.ours]);
  }
  return groups;
}

export function dismissDisagreement(sql, { textNorm, ours, now }) {
  sql.exec(
    `UPDATE pic_disagreement SET dismissed_at = ?
     WHERE text_norm = ? AND ours = ? AND dismissed_at IS NULL`,
    now, textNorm, ours);
}

/* ------------------------------ pins/blocks ---------------------------- */

/** Founder rulings (§ 5.5). A pin makes their picture the auto default
 *  for that text for everyone; a block keeps ours listed but never
 *  auto-applied. Both are keyed by text_norm only; undo deletes the row. */
export function pin(sql, { textNorm, imageId, now }) {
  sql.exec(
    `INSERT INTO pic_pin (text_norm, image_id, created_at) VALUES (?, ?, ?)
     ON CONFLICT (text_norm) DO UPDATE SET image_id = excluded.image_id,
       created_at = excluded.created_at`,
    textNorm, imageId, now);
}
export function unpin(sql, textNorm) {
  sql.exec("DELETE FROM pic_pin WHERE text_norm = ?", textNorm);
}
export function block(sql, { textNorm, imageId, now }) {
  sql.exec(
    `INSERT OR IGNORE INTO pic_block (text_norm, image_id, created_at)
     VALUES (?, ?, ?)`,
    textNorm, imageId, now);
}
export function unblock(sql, { textNorm, imageId }) {
  sql.exec(
    "DELETE FROM pic_block WHERE text_norm = ? AND image_id = ?",
    textNorm, imageId);
}

export function adminLog(sql, { action, textNorm, ours, theirs, detail, now }) {
  sql.exec(
    `INSERT INTO pic_admin_log (action, text_norm, ours, theirs, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    action, textNorm ?? null, ours ?? null, theirs ?? null, detail ?? null, now);
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
