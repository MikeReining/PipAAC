/**
 * 014 slice 3 — adult moves (Motor_Grid § 1; 014 § 2 rulings 1–2). The
 *  app, prediction, and catalog updates never move a cell; a parent or
 *  SLP may, per profile, in Edit mode. A move is a `core_override` row
 *  keyed by (layout, sense): the catalog's `core_cell` rows are the
 *  default and are never rewritten, so regenerating the catalog cannot
 *  overwrite an adult placement. Synced like every other caregiver edit
 *  (`move_core` op — intent, recomputed on replay).
 */

import { recordOp } from "./ops.mjs";

/** The effective home board: catalog `core_cell` rows overlaid with the
 *  profile's `core_override` moves. Same row shape the renderer always
 *  drew: { slot_index, sense_id, label, fitzgerald_role }. A word whose
 *  catalog slot was claimed by a move but which has no override of its
 *  own (replay divergence, never a normal swap — swaps write both
 *  halves) takes the mover's vacated cell. */
export function coreCells(db, layout, locale) {
  const rows = db.prepare(
    `SELECT cc.slot_index, cc.sense_id, l.text AS label, s.fitzgerald_role
     FROM core_cell cc
     JOIN sense s ON s.id = cc.sense_id
     JOIN label l ON l.sense_id = cc.sense_id
       AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?
     WHERE cc.layout = ?`,
  ).all(locale, layout);
  const over = new Map(
    db.prepare("SELECT sense_id, slot_index FROM core_override WHERE layout = ?")
      .all(layout).map((o) => [o.sense_id, o.slot_index]),
  );
  if (!over.size) return rows;
  const claimed = new Set(over.values());
  const vacated = [];
  const moved = new Set();
  const out = [];
  for (const r of rows) {
    const o = over.get(r.sense_id);
    if (o === undefined) continue;
    vacated.push(r.slot_index);
    moved.add(r.sense_id);
    out.push({ ...r, slot_index: o });
  }
  for (const r of rows) {
    if (moved.has(r.sense_id)) continue;
    out.push(claimed.has(r.slot_index)
      ? { ...r, slot_index: vacated.shift() }
      : r);
  }
  return out.sort((a, b) => a.slot_index - b.slot_index);
}

/** Where `senseId` effectively sits: its override, else its catalog
 *  slot. `null` when the layout doesn't contain the sense. */
export function coreSlot(db, layout, senseId) {
  const o = db.prepare(
    "SELECT slot_index FROM core_override WHERE layout = ? AND sense_id = ?",
  ).all(layout, senseId)[0];
  if (o) return o.slot_index;
  return db.prepare(
    "SELECT slot_index FROM core_cell WHERE layout = ? AND sense_id = ?",
  ).all(layout, senseId)[0]?.slot_index ?? null;
}

/** The sense effectively occupying `slot`, or null. */
function occupant(db, layout, slot) {
  const over = db.prepare(
    "SELECT sense_id FROM core_override WHERE layout = ? AND slot_index = ?",
  ).all(layout, slot)[0];
  if (over) return over.sense_id;
  const cat = db.prepare(
    `SELECT cc.sense_id FROM core_cell cc
     WHERE cc.layout = ? AND cc.slot_index = ?
       AND NOT EXISTS (SELECT 1 FROM core_override o
         WHERE o.layout = cc.layout AND o.sense_id = cc.sense_id)`,
  ).all(layout, slot)[0];
  return cat?.sense_id ?? null;
}

function putOverride(db, layout, senseId, slot) {
  const cat = db.prepare(
    "SELECT slot_index FROM core_cell WHERE layout = ? AND sense_id = ?",
  ).all(layout, senseId)[0];
  if (cat && cat.slot_index === slot) {
    db.prepare(
      "DELETE FROM core_override WHERE layout = ? AND sense_id = ?",
    ).run(layout, senseId);
    return;
  }
  db.prepare(
    `INSERT INTO core_override (layout, sense_id, slot_index) VALUES (?, ?, ?)
     ON CONFLICT(layout, sense_id) DO UPDATE SET slot_index = excluded.slot_index`,
  ).run(layout, senseId, slot);
}

/** Move `senseId` to `toSlot`. The slot's occupant (if any) swaps into
 *  the vacated cell — never a reflow. Anchor and reserved slots refuse
 *  (`anchors` is the set of forbidden slot indexes; replay passes none —
 *  a recorded op was already legal). Returns {from} or null when the
 *  move is a no-op. */
export function moveCore(db, layout, senseId, toSlot, { anchors = new Set() } = {}) {
  if (anchors.has(toSlot)) return null;
  const from = coreSlot(db, layout, senseId);
  if (from === null || from === toSlot) return null;
  const other = occupant(db, layout, toSlot);
  putOverride(db, layout, senseId, toSlot);
  if (other && other !== senseId) putOverride(db, layout, other, from);
  recordOp(db, "move_core", { layout, senseId, toSlot });
  return { from, swapped: other ?? null };
}
