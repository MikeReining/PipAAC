/**
 * 014 slice 3 — adult moves (Motor_Grid § 1; 014 § 2 rulings 1–2) and
 * 014 slice 10 — any word or person in a home cell (014 § 9). The app,
 * prediction, and catalog updates never place a cell; a parent or SLP
 * may, per profile, in Edit mode. A placement is a `core_override` row
 * keyed by (layout, item_kind, item_id): the catalog's `core_cell`
 * rows are the default and are never rewritten, so regenerating the
 * catalog cannot overwrite an adult placement. Synced like every other
 * caregiver edit (`move_core` / `place_cell` ops — intent, recomputed
 * on replay).
 */

import { recordOp } from "./ops.mjs";
import { placeItem } from "./groups.mjs";

const KINDS = new Set(["sense", "entity"]);
const keyOf = (kind, id) => `${kind}:${id}`;

/** The effective slot map: `${kind}:${id}` → slot_index for everything
 *  the board shows on `layout`. Catalog rows hold their own slot unless
 *  an override moves them or another placement claims it — a claimed
 *  word with an override-free home takes a vacated cell, and with none
 *  free it leaves the board entirely: the app never chooses a slot for
 *  it, and it stays reachable in Groups, the Smart bar, and the
 *  keyboard (014 § 9 ruling 2). */
function slotMap(db, layout) {
  const cat = db.prepare(
    "SELECT slot_index, sense_id FROM core_cell WHERE layout = ?",
  ).all(layout);
  const over = db.prepare(
    `SELECT o.item_kind, o.item_id, o.slot_index FROM core_override o
     WHERE o.layout = ? AND (o.item_kind = 'sense'
       OR EXISTS (SELECT 1 FROM personal_entity e
         WHERE e.id = o.item_id AND e.status = 'active'))`,
  ).all(layout);
  const map = new Map();
  if (!over.length) {
    for (const r of cat) map.set(keyOf("sense", r.sense_id), r.slot_index);
    return map;
  }
  const byItem = new Map(over.map((o) => [keyOf(o.item_kind, o.item_id), o.slot_index]));
  const claimed = new Set(over.map((o) => o.slot_index));
  const vacated = [];
  for (const r of cat) {
    const o = byItem.get(keyOf("sense", r.sense_id));
    if (o === undefined) continue;
    vacated.push(r.slot_index);
    map.set(keyOf("sense", r.sense_id), o);
  }
  for (const r of cat) {
    const k = keyOf("sense", r.sense_id);
    if (map.has(k)) continue;
    if (!claimed.has(r.slot_index)) { map.set(k, r.slot_index); continue; }
    const v = vacated.shift();
    if (v !== undefined) map.set(k, v);
  }
  for (const o of over) {
    const k = keyOf(o.item_kind, o.item_id);
    if (!map.has(k)) map.set(k, o.slot_index);
  }
  return map;
}

/** The effective home board. Row shape: sense cells carry
 *  { kind:'sense', slot_index, sense_id, label, fitzgerald_role },
 *  entity cells { kind:'entity', slot_index, entity_id, label,
 *  fitzgerald_role } — the family's kind pick (018 D7), Yellow when
 *  unclassified. */
export function coreCells(db, layout, locale) {
  const slots = slotMap(db, layout);
  const out = [];
  for (const [k, slot] of slots) {
    const [kind, id] = k.split(/:(.*)/);
    if (kind === "sense") {
      const s = db.prepare(
        `SELECT l.text AS label, s.fitzgerald_role FROM sense s
         JOIN label l ON l.sense_id = s.id
           AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?
         WHERE s.id = ?`,
      ).all(locale, id)[0];
      if (s) out.push({ kind, slot_index: slot, sense_id: id, ...s });
    } else {
      const e = db.prepare(
        "SELECT id, spoken_name, fitzgerald_role FROM personal_entity WHERE id = ? AND status = 'active'",
      ).all(id)[0];
      if (e) {
        out.push({
          kind, slot_index: slot, entity_id: e.id,
          label: e.spoken_name, fitzgerald_role: e.fitzgerald_role ?? "Yellow",
        });
      }
    }
  }
  return out.sort((a, b) => a.slot_index - b.slot_index);
}

/** Where an item effectively sits on `layout`, or null when the board
 *  doesn't show it (off-board word, evicted by a placement, retired
 *  entity). `coreSlot` keeps the old (layout, senseId) call shape. */
export function cellSlot(db, layout, kind, id) {
  return slotMap(db, layout).get(keyOf(kind, id)) ?? null;
}
export function coreSlot(db, layout, senseId) {
  return cellSlot(db, layout, "sense", senseId);
}

/** The item effectively occupying `slot` — { kind, id } or null. */
function occupant(db, layout, slot) {
  for (const [k, s] of slotMap(db, layout)) {
    if (s !== slot) continue;
    const [kind, id] = k.split(/:(.*)/);
    return { kind, id };
  }
  return null;
}

function deleteOverride(db, layout, kind, id) {
  db.prepare(
    "DELETE FROM core_override WHERE layout = ? AND item_kind = ? AND item_id = ?",
  ).run(layout, kind, id);
}

function putOverride(db, layout, kind, id, slot) {
  const cat = kind === "sense" && db.prepare(
    "SELECT slot_index FROM core_cell WHERE layout = ? AND sense_id = ?",
  ).all(layout, id)[0];
  if (cat && cat.slot_index === slot) {
    deleteOverride(db, layout, kind, id);
    return;
  }
  db.prepare(
    `INSERT INTO core_override (layout, item_kind, item_id, slot_index) VALUES (?, ?, ?, ?)
     ON CONFLICT(layout, item_kind, item_id) DO UPDATE SET slot_index = excluded.slot_index`,
  ).run(layout, kind, id, slot);
}

/** Place any item — a catalog word, an off-board sense, or a person —
 *  on `toSlot` (014 § 9). The slot's occupant swaps into the vacated
 *  cell when the placed item had one, else returns to its own default:
 *  a catalog word goes back to its catalog slot (visible there unless
 *  that slot is itself claimed), a person leaves the board. Never a
 *  reflow. `toSlot` null clears the placement. Anchor and reserved
 *  slots refuse (`anchors` is the set of forbidden slot indexes;
 *  replay passes none — a recorded op was already legal). Returns
 *  {from, displaced} or null on a no-op. */
export function placeOnBoard(db, layout, kind, id, toSlot, { anchors = new Set(), op = "place_cell" } = {}) {
  if (!KINDS.has(kind)) return null;
  const from = cellSlot(db, layout, kind, id);
  if (toSlot === null) {
    if (from === null) return null;
    deleteOverride(db, layout, kind, id);
    recordOp(db, op, { layout, kind, id, toSlot: null });
    return { from, displaced: null };
  }
  if (anchors.has(toSlot) || from === toSlot) return null;
  const other = occupant(db, layout, toSlot);
  putOverride(db, layout, kind, id, toSlot);
  if (other && !(other.kind === kind && other.id === id)) {
    if (from !== null) {
      putOverride(db, layout, other.kind, other.id, from);
    } else {
      deleteOverride(db, layout, other.kind, other.id);
      // D10: the displaced word goes back to its group. An uncategorized
      // core word has none — My Words is the catch-all (no-op when a
      // group already holds it).
      const grouped = db.prepare(
        "SELECT 1 AS x FROM group_cell WHERE item_kind = ? AND item_id = ? LIMIT 1",
      ).all(other.kind, other.id)[0];
      if (!grouped) placeItem(db, "grp_my_words", other.kind, other.id);
    }
  }
  recordOp(db, op, { layout, kind, id, toSlot });
  return { from, displaced: other ?? null };
}

/** Move a core word — the slice-3 call shape, now a placement of kind
 *  'sense' recorded under the original op name. */
export function moveCore(db, layout, senseId, toSlot, opts = {}) {
  const mv = placeOnBoard(db, layout, "sense", senseId, toSlot, { ...opts, op: "move_core" });
  if (!mv) return null;
  return { from: mv.from, swapped: mv.displaced?.kind === "sense" ? mv.displaced.id : null };
}

/** 018 slice 3 (D1): seat the child's people. The first entity takes
 *  `mom`'s cell, the second `dad`'s — on every layout that has those
 *  cells (grid60, grid90; grid15 has neither). Further entities stay
 *  off-board, reachable through their group. Returns the seatings. */
export function seatSetupPeople(db, entityIds, locale) {
  const seats = db.prepare(
    `SELECT cc.layout, cc.slot_index FROM core_cell cc
     JOIN label l ON l.sense_id = cc.sense_id
       AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?
     WHERE l.text IN ('mom', 'dad') ORDER BY cc.layout, cc.slot_index`,
  ).all(locale);
  const byLayout = new Map();
  for (const s of seats) {
    if (!byLayout.has(s.layout)) byLayout.set(s.layout, []);
    byLayout.get(s.layout).push(s.slot_index);
  }
  const placed = [];
  entityIds.forEach((id, i) => {
    for (const [layout, slots] of byLayout) {
      if (i >= slots.length) continue;
      const mv = placeOnBoard(db, layout, "entity", id, slots[i]);
      if (mv) placed.push({ id, layout, slot: slots[i] });
    }
  });
  return placed;
}
