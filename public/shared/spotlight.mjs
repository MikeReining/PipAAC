/**
 * The attention layer (013): one spotlight is a list of words — a Set of
 * "kind:id" keys — shown wherever they appear. The laws (§ 2.1): never a
 * muzzle (a dimmed word still speaks), never moves a cell, never changes
 * the board, never unmasks, gentle.
 *
 * This module owns the layer's semantics; renderers ask `spotlight()`
 * and mark cells. Slice 2 owns the persistence: saved lists and the
 * running session are synced profile data (§ 4 — "sync like any other
 * edit"), so the write owners here record ops like every other edit.
 */

import { maskedSenseIds } from "./groups.mjs";
import { recordOp } from "./ops.mjs";

let active = null; // { name, targets: Set<"kind:id"> }

/** Start a spotlight over `targets` (iterable of "kind:id"). Masked
 *  senses are skipped — the law is never unmask; the caller is told
 *  which. Returns { skipped } — an all-masked call leaves the layer off. */
export function startSpotlight(db, targets, name = "Spotlight") {
  const masked = maskedSenseIds(db);
  const set = new Set();
  const skipped = [];
  for (const key of targets) {
    const [kind, id] = key.split(":");
    if (kind === "sense" && masked.has(id)) skipped.push(key);
    else set.add(key);
  }
  active = set.size ? { name, targets: set } : null;
  return { skipped };
}

export function endSpotlight() {
  active = null;
}

/** The running spotlight, or null. Renderers consult this. */
export function spotlight() {
  return active;
}

/** The groups that contain at least one target — the tiles the route
 *  walk glows on the index (§ 3). */
export function spotlightGroups(db, targets) {
  if (!targets.size) return new Set();
  const kinds = [...targets].map((k) => k.split(":"));
  const ids = kinds.map(([, id]) => id);
  const marks = ids.map(() => "?").join(",");
  return new Set(
    db.prepare(
      `SELECT DISTINCT group_id FROM group_cell
       WHERE item_id IN (${marks})`,
    ).all(...ids).map((r) => r.group_id),
  );
}

/** Does any target need the route walk — i.e. sits inside a group but is
 *  not on the current board? `onBoard` is the Set of sense ids the grid
 *  just rendered. When true, the Groups anchor glows (§ 3). */
export function needsRouteWalk(targets, onBoard) {
  for (const key of targets) {
    const [kind, id] = key.split(":");
    if (kind === "entity") return true; // entities live only inside groups
    if (!onBoard.has(id)) return true;
  }
  return false;
}

/* --- saved lists and the running session (slice 2, §§ 3–4). A session
 *  is one row in spotlight_session; it survives a restart, ends when
 *  someone ends it, its timer runs out, or local midnight arrives —
 *  never silently permanent. --- */

export function spotLists(db) {
  return db.prepare(
    `SELECT l.id, l.name, COUNT(i.item_id) AS n
     FROM spotlight_list l LEFT JOIN spotlight_item i ON i.list_id = l.id
     GROUP BY l.id ORDER BY l.name`,
  ).all();
}

export function listTargets(db, id) {
  return new Set(
    db.prepare("SELECT kind, item_id FROM spotlight_item WHERE list_id = ?")
      .all(id).map((r) => `${r.kind}:${r.item_id}`),
  );
}

/** Save (or overwrite) a named list of "kind:id" targets. */
export function saveSpotList(db, id, name, targets, createdAt = Date.now()) {
  db.prepare(
    `INSERT INTO spotlight_list (id, name, created_at) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
  ).run(id, name, createdAt);
  db.prepare("DELETE FROM spotlight_item WHERE list_id = ?").run(id);
  for (const key of targets) {
    const [kind, item_id] = key.split(":");
    db.prepare(
      "INSERT OR IGNORE INTO spotlight_item (list_id, kind, item_id) VALUES (?, ?, ?)",
    ).run(id, kind, item_id);
  }
  recordOp(db, "spot_list_save", { id, name, targets: [...targets], created_at: createdAt });
}

export function deleteSpotList(db, id) {
  db.prepare("DELETE FROM spotlight_item WHERE list_id = ?").run(id);
  db.prepare("DELETE FROM spotlight_list WHERE id = ?").run(id);
  recordOp(db, "spot_list_del", { id });
}

/** The running session row, or null. */
export function spotSession(db) {
  return db.prepare("SELECT * FROM spotlight_session WHERE id = 1").all()[0] ?? null;
}

/** Local midnight after `now` — a session's latest possible end (§ 4). */
export function nextMidnight(now) {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/** Start a session: `{ name, targets, started_at, ends_at }` or
 *  `{ name, targets, minutes }` (this device computes the end). Writes
 *  the synced row, lights the layer, and records the op — skip the op
 *  when replaying (applyOp calls this too). */
export function startSession(db, s) {
  const started_at = s.started_at ?? Date.now();
  const timer = s.minutes ? started_at + s.minutes * 60000 : Infinity;
  const ends_at = s.ends_at ?? Math.min(timer, nextMidnight(started_at));
  const targets = [...s.targets];
  db.prepare(
    `INSERT INTO spotlight_session (id, name, targets, started_at, ends_at)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name,
       targets = excluded.targets, started_at = excluded.started_at,
       ends_at = excluded.ends_at`,
  ).run(s.name, JSON.stringify(targets), started_at, ends_at);
  recordOp(db, "spot_start", { name: s.name, targets, started_at, ends_at });
  return startSpotlight(db, targets, s.name);
}

/** End the session: delete the synced row, dim the board, record it. */
export function endSession(db) {
  db.exec("DELETE FROM spotlight_session WHERE id = 1");
  recordOp(db, "spot_end", {});
  endSpotlight();
}

/** Reconcile the layer with the synced row — boot and after each sync
 *  drain: a live row lights the glow (restart survival), an expired row
 *  ends it (timer or midnight passed while away), no row means off. */
export function resumeSession(db) {
  const row = spotSession(db);
  if (!row) {
    endSpotlight();
    return null;
  }
  if (row.ends_at <= Date.now()) {
    endSession(db);
    return null;
  }
  const r = startSpotlight(db, JSON.parse(row.targets), row.name);
  return { name: row.name, ends_at: row.ends_at, skipped: r.skipped };
}
