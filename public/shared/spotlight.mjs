/**
 * The attention layer (013): one spotlight is a list of words — a Set of
 * "kind:id" keys — shown wherever they appear. The laws (§ 2.1): never a
 * muzzle (a dimmed word still speaks), never moves a cell, never changes
 * the board, never unmasks, gentle.
 *
 * This module owns the layer's semantics; renderers ask `spotlight()`
 * and mark cells. Nothing here writes to the database — a running
 * spotlight is session state (lists and sync arrive in slice 2).
 */

import { maskedSenseIds } from "./groups.mjs";

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
