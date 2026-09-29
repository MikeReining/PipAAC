/**
 * 028 § 4.5 — the tile clip ledger: pure SQL over the minimal
 * `sql.exec(q, ...params).toArray()` surface a Durable Object exposes,
 * so light tests drive it with node:sqlite. No fetch/R2/vendor calls
 * live here — the TileLedger wrapper in tile.js owns those.
 *
 * Rows never carry a user, device, or license id (028 rule 2): the
 * ledger knows what was minted, never who asked.
 */
import { TILE_PROFILE } from "../shared/tile_recipe.mjs";

export const MINTING_STALE_MS = 60_000;
export const FAILED_RETRY_MS = 30_000;

/** Sources a client request may claim; `seed` is admin/tooling only. */
export const CLIENT_SOURCES = new Set(["user_typed", "user_keyboard", "catalog_lazy"]);
export const TILE_SOURCES = new Set([...CLIENT_SOURCES, "seed"]);

const te = new TextEncoder();

/** § 4.5 — sha256(voice_key | locale | TILE_PROFILE | normalizedText). */
export async function tileClipId(voiceKey, locale, text) {
  const buf = await crypto.subtle.digest(
    "SHA-256", te.encode(`${voiceKey}|${locale}|${TILE_PROFILE}|${text}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Client-cache eviction id: sha256 of the normalized text only — the
 *  replaced list returns these so devices can drop
 *  `voice.local/tile/<voice>/<textHash>` entries (§ 5.3). */
export async function tileTextHash(text) {
  const buf = await crypto.subtle.digest("SHA-256", te.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const one = (sql, q, p = []) => sql.exec(q, ...p).toArray()[0] ?? null;
const all = (sql, q, p = []) => sql.exec(q, ...p).toArray();

export function ensureSchema(sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS tile_clip (
    id TEXT PRIMARY KEY,
    voice_key TEXT NOT NULL,
    locale TEXT NOT NULL,
    text TEXT NOT NULL,
    mint_text TEXT NOT NULL,
    model TEXT NOT NULL,
    profile TEXT NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    r2_key TEXT,
    bytes INTEGER,
    duration_ms INTEGER,
    checks TEXT,
    review TEXT NOT NULL DEFAULT 'unreviewed',
    flagged INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    replaced_at INTEGER,
    claimed_at INTEGER,
    retry_after INTEGER,
    hits INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    minted_at INTEGER,
    reviewed_at INTEGER
  )`);
  sql.exec("CREATE INDEX IF NOT EXISTS tile_clip_created ON tile_clip (created_at DESC)");
  sql.exec("CREATE INDEX IF NOT EXISTS tile_clip_review ON tile_clip (review, source, created_at DESC)");
  sql.exec("CREATE INDEX IF NOT EXISTS tile_clip_replaced ON tile_clip (replaced_at)");
  sql.exec(`CREATE TABLE IF NOT EXISTS tile_held (
    locale TEXT NOT NULL,
    text TEXT NOT NULL,
    reason TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    PRIMARY KEY (locale, text, reason)
  )`);
  sql.exec(`CREATE TABLE IF NOT EXISTS tile_day (
    day TEXT PRIMARY KEY,
    mints INTEGER NOT NULL DEFAULT 0,
    alerted INTEGER NOT NULL DEFAULT 0
  )`);
}

export function getClip(sql, id) {
  return one(sql, "SELECT * FROM tile_clip WHERE id = ?", [id]);
}

/** What a request for this id would do — the route quota-checks mints only. */
export function clipDisposition(sql, id, now) {
  const row = getClip(sql, id);
  if (!row) return "mint";
  if (row.status === "ready") return "ready";
  if (row.status === "withheld") return "withheld";
  if (row.status === "failed") {
    return row.retry_after && row.retry_after > now ? "failed_wait" : "mint";
  }
  // minting: fresh claim may still resolve; stale is reclaimable
  return now - (row.claimed_at ?? row.created_at) >= MINTING_STALE_MS
    ? "mint" : "minting";
}

/** Claim the right to mint. Returns { claim, row } — when claim is
 *  false the row says why (ready/withheld/minting-in-flight/failed_wait). */
export function claimMint(sql, { id, voiceKey, locale, text, mintText, model, profile, source, now }) {
  const row = getClip(sql, id);
  if (row) {
    if (row.status === "ready" || row.status === "withheld") return { claim: false, row };
    if (row.status === "failed" && row.retry_after && row.retry_after > now) {
      return { claim: false, row };
    }
    if (row.status === "minting"
        && now - (row.claimed_at ?? row.created_at) < MINTING_STALE_MS) {
      return { claim: false, row };
    }
    // retryable failure or stale mint — reclaim in place
    sql.exec("UPDATE tile_clip SET status = 'minting', claimed_at = ?, mint_text = ?, source = ? WHERE id = ?", now, mintText, source, id);
    return { claim: true, row: getClip(sql, id) };
  }
  sql.exec(`INSERT INTO tile_clip
      (id, voice_key, locale, text, mint_text, model, profile, source,
       status, claimed_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'minting', ?, ?)`, id, voiceKey, locale, text, mintText, model, profile, source, now, now);
  return { claim: true, row: getClip(sql, id) };
}

export function completeMint(sql, { id, r2Key, bytes, durationMs, checks, now }) {
  sql.exec(`UPDATE tile_clip SET status = 'ready', r2_key = ?, bytes = ?,
      duration_ms = ?, checks = ?, minted_at = ?, retry_after = NULL
    WHERE id = ?`, r2Key, bytes, durationMs, JSON.stringify(checks), now, id);
}

export function failMint(sql, { id, now, retryMs = FAILED_RETRY_MS }) {
  sql.exec("UPDATE tile_clip SET status = 'failed', retry_after = ? WHERE id = ?", now + retryMs, id);
}

export function touchHit(sql, id) {
  sql.exec("UPDATE tile_clip SET hits = hits + 1 WHERE id = ?", id);
}

/** "Sounds wrong" — a review signal, never a takedown (§ 5.5). */
export function flagClip(sql, id) {
  const row = getClip(sql, id);
  if (!row) return false;
  sql.exec("UPDATE tile_clip SET flagged = 1 WHERE id = ?", id);
  return true;
}

/** § 4.3 — held words are anonymous (locale, text, reason, count): the
 *  demand signal for v2 locales. */
export function recordHeld(sql, { locale, text, reason, now }) {
  sql.exec(`INSERT INTO tile_held (locale, text, reason, count, first_seen, last_seen)
      VALUES (?, ?, ?, 1, ?, ?)
    ON CONFLICT (locale, text, reason)
    DO UPDATE SET count = count + 1, last_seen = excluded.last_seen`, locale, text, reason, now, now);
}

export function listHeld(sql, limit = 500) {
  return all(sql,
    "SELECT locale, text, reason, count, first_seen, last_seen FROM tile_held ORDER BY last_seen DESC LIMIT ?",
    [limit]);
}

/** Newest first; filters per § 7. `flagged` true → flagged rows only. */
export function listRecent(sql, { source, review, flagged, before, limit = 50 } = {}) {
  const where = [];
  const params = [];
  if (source && source !== "all") { where.push("source = ?"); params.push(source); }
  if (review && review !== "all") { where.push("review = ?"); params.push(review); }
  if (flagged) where.push("flagged = 1");
  if (before) { where.push("created_at < ?"); params.push(Number(before)); }
  const sqlQ = `SELECT * FROM tile_clip
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY created_at DESC LIMIT ?`;
  return all(sql, sqlQ, [...params, Math.min(Number(limit) || 50, 100)]);
}

/** Approve or reject; reject withholds the clip immediately (§ 7). */
export function applyReview(sql, ids, review, now) {
  let n = 0;
  for (const id of ids) {
    if (!getClip(sql, id)) continue;
    sql.exec(`UPDATE tile_clip
        SET review = ?, reviewed_at = ?,
            status = CASE WHEN ? = 'rejected' THEN 'withheld' ELSE status END
      WHERE id = ?`, review, now, review, id);
    n += 1;
  }
  return n;
}

/** Remint lands a new object: version bumps, replaced_at marks the
 *  eviction sweep for devices, review resets to unreviewed. */
export function applyRemint(sql, { id, r2Key, mintText, bytes, durationMs, checks, now }) {
  sql.exec(`UPDATE tile_clip SET
      r2_key = ?, mint_text = ?, bytes = ?, duration_ms = ?, checks = ?,
      status = 'ready', review = 'unreviewed', flagged = 0, reviewed_at = NULL,
      version = version + 1, replaced_at = ?, minted_at = ?, retry_after = NULL
    WHERE id = ?`, r2Key, mintText, bytes, durationMs, JSON.stringify(checks), now, now, id);
}

/** Text (not ids) of clips replaced or withheld since `since` for one
 *  voice — the client hashes these to evict its Cache Storage entries. */
export function listReplaced(sql, { since, voiceKey }) {
  return all(sql, `SELECT text FROM tile_clip
    WHERE voice_key = ? AND (
      (replaced_at IS NOT NULL AND replaced_at > ?) OR
      (status = 'withheld' AND reviewed_at IS NOT NULL AND reviewed_at > ?))`,
    [voiceKey, Number(since) || 0, Number(since) || 0]);
}

export const utcDay = (now) => new Date(now).toISOString().slice(0, 10);

export function dayRow(sql, day) {
  return one(sql, "SELECT * FROM tile_day WHERE day = ?", [day]);
}

export function dayMints(sql, day) {
  return dayRow(sql, day)?.mints ?? 0;
}

/** Count one fresh mint attempt against the UTC-day budget. */
export function bumpDayMints(sql, day) {
  sql.exec(`INSERT INTO tile_day (day, mints, alerted) VALUES (?, 1, 0)
    ON CONFLICT (day) DO UPDATE SET mints = mints + 1`, day);
  return dayMints(sql, day);
}

export function markDayAlerted(sql, day) {
  sql.exec("UPDATE tile_day SET alerted = 1 WHERE day = ?", day);
}
