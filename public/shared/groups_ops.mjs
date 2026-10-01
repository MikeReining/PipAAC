/** Group writes — placement (027 § 3.4) and index order. Every edit records
 *  an op (Sync_And_Web_Editing § 4); ops.mjs imports the barrel for replay.
 */
import {
  all, one, txn, activeLayout, geometryOf, isMember, cellOf, occupiedCells,
  chooseCell, landing, insertMember, insertCell, groupIndex,
} from "./groups_shared.mjs";
import { recordOp } from "./ops.mjs";
/* --- placement writes (027 § 3.4) --- */

/**
 * Add a word to a group at the active size — at `cell` when the adult
 * tapped an empty cell (the cell is the picker), else by the placement
 * rule. A stale occupied or reserved target refuses; an add never
 * overwrites or swaps. Already a member with a position here: returns it.
 * Writes only the active size (§ 3.3). Returns { page, slot_index }.
 */
export function placeItem(db, groupId, kind, id, cell = null, addedAt = null) {
  const layout = activeLayout(db);
  if (!one(db, "SELECT 1 AS x FROM board_group WHERE id = ?", [groupId])) {
    throw new Error(`no group ${groupId}`);
  }
  const existing = cellOf(db, groupId, layout, kind, id);
  if (existing) return existing;
  let target;
  if (cell) {
    const geom = geometryOf(db, layout);
    if (!geom.content.includes(cell.slot_index)) {
      throw new Error(`group ${groupId} slot ${cell.page}:${cell.slot_index} is reserved`);
    }
    if (occupiedCells(db, groupId, layout).has(`${cell.page}:${cell.slot_index}`)) {
      throw new Error(`group ${groupId} slot ${cell.page}:${cell.slot_index} is occupied`);
    }
    target = { page: cell.page, slot_index: cell.slot_index };
  } else {
    target = chooseCell(db, groupId, layout, kind, id);
  }
  const member = one(db,
    "SELECT added_at FROM group_membership WHERE group_id = ? AND item_kind = ? AND item_id = ?",
    [groupId, kind, id]);
  const at = member ? member.added_at : addedAt ?? Date.now();
  txn(db, () => {
    if (!member) insertMember(db, groupId, kind, id, at);
    insertCell(db, groupId, layout, kind, id, target);
  });
  recordOp(db, "place_item", {
    groupId, kind, id, added_at: at, cells: [{ layout, ...target }],
  });
  return target;
}

/**
 * Replay/Undo body of place_item: the membership (with its added_at) and
 * each recorded position — exactly where free, else the first free cell.
 * Returns true when any position had to move.
 */
export function applyPlace(db, { groupId, kind, id, added_at, cells }) {
  let moved = false;
  txn(db, () => {
    if (!isMember(db, groupId, kind, id)) insertMember(db, groupId, kind, id, added_at ?? null);
    for (const c of cells) {
      if (cellOf(db, groupId, c.layout, kind, id)) continue;
      const at = landing(db, groupId, c.layout, c);
      if (at.page !== c.page || at.slot_index !== c.slot_index) moved = true;
      insertCell(db, groupId, c.layout, kind, id, at);
    }
  });
  return moved;
}

/** Move a member to a free content cell of the same group, at one size. */
export function moveItem(db, groupId, kind, id, page, slot, layout = activeLayout(db)) {
  const geom = geometryOf(db, layout);
  if (!geom.content.includes(slot)) throw new Error(`group ${groupId} slot ${page}:${slot} is reserved`);
  if (occupiedCells(db, groupId, layout).has(`${page}:${slot}`)) {
    throw new Error(`group ${groupId} slot ${page}:${slot} is occupied`);
  }
  if (!cellOf(db, groupId, layout, kind, id)) throw new Error(`item ${id} is not in group ${groupId}`);
  db.prepare(
    `UPDATE group_cell SET page = ?, slot_index = ?
     WHERE group_id = ? AND layout = ? AND item_kind = ? AND item_id = ?`,
  ).run(page, slot, groupId, layout, kind, id);
  recordOp(db, "move_item", { groupId, kind, id, layout, page, slot_index: slot });
}

/**
 * Swap two members' cells at one size — a drag onto a word swaps just
 * those two. UNIQUE(group, layout, page, slot) forbids the two-step
 * UPDATE, so both rows are deleted and re-inserted swapped in one
 * transaction.
 */
export function swapItems(db, groupId, a, b, layout = activeLayout(db)) {
  txn(db, () => {
    const ca = cellOf(db, groupId, layout, a.item_kind, a.item_id);
    const cb = cellOf(db, groupId, layout, b.item_kind, b.item_id);
    if (!ca || !cb) throw new Error("swapItems: both items must be in the group");
    const del = db.prepare(
      "DELETE FROM group_cell WHERE group_id = ? AND layout = ? AND item_kind = ? AND item_id = ?",
    );
    del.run(groupId, layout, a.item_kind, a.item_id);
    del.run(groupId, layout, b.item_kind, b.item_id);
    insertCell(db, groupId, layout, a.item_kind, a.item_id, cb);
    insertCell(db, groupId, layout, b.item_kind, b.item_id, ca);
    recordOp(db, "swap_items", {
      groupId, layout,
      a: { item_kind: a.item_kind, item_id: a.item_id },
      b: { item_kind: b.item_kind, item_id: b.item_id },
    });
  });
}

/** Replace one group seat's occupant (031): `into` takes `out`'s exact
 *  cell at this size; `out` leaves the group (its record and other seats
 *  are untouched). A remove_item + place_item pair, so replay rebuilds
 *  the same state. Throws with nothing changed when the target refuses;
 *  the returned undo() puts `out` back and drops `into`. */
export function replaceGroupItem(db, groupId, out, into, cell) {
  const restore = removeItemUndoable(db, groupId, out.kind, out.id);
  try {
    placeItem(db, groupId, into.kind, into.id, cell);
  } catch (e) {
    restore.undo();
    throw e;
  }
  return {
    undo() {
      if (isMember(db, groupId, into.kind, into.id)) removeItem(db, groupId, into.kind, into.id);
      restore.undo();
    },
  };
}

/**
 * Remove a word from one group: its membership and its positions at every
 * size. Leaves a hole — nothing reflows, in built-in groups too. The word
 * record is untouched; a word with no placements stays in the Library and
 * the keyboard (Motor_Grid § Groups).
 */
export function removeItem(db, groupId, kind, id) {
  if (!one(db, "SELECT 1 AS x FROM board_group WHERE id = ?", [groupId])) {
    throw new Error(`no group ${groupId}`);
  }
  txn(db, () => {
    db.prepare("DELETE FROM group_cell WHERE group_id = ? AND item_kind = ? AND item_id = ?")
      .run(groupId, kind, id);
    db.prepare("DELETE FROM group_membership WHERE group_id = ? AND item_kind = ? AND item_id = ?")
      .run(groupId, kind, id);
  });
  recordOp(db, "remove_item", { groupId, kind, id, layout: activeLayout(db) });
}

/**
 * removeItem with a way back (Edit-mode × + Undo toast). undo() restores
 * the membership and every size's position — exactly where still free,
 * else the first free cell — and returns { moved } so the caller can say
 * the word moved. Undo never displaces a later edit.
 */
export function removeItemUndoable(db, groupId, kind, id) {
  const member = one(db,
    "SELECT added_at FROM group_membership WHERE group_id = ? AND item_kind = ? AND item_id = ?",
    [groupId, kind, id]);
  if (!member) throw new Error(`item ${id} is not in group ${groupId}`);
  const cells = all(db,
    `SELECT layout, page, slot_index FROM group_cell
     WHERE group_id = ? AND item_kind = ? AND item_id = ? ORDER BY layout`,
    [groupId, kind, id]);
  removeItem(db, groupId, kind, id);
  return {
    removed: { added_at: member.added_at, cells },
    undo() {
      if (!one(db, "SELECT 1 AS x FROM board_group WHERE id = ?", [groupId])) return { moved: false };
      const args = { groupId, kind, id, added_at: member.added_at, cells };
      const moved = applyPlace(db, args);
      const landed = all(db,
        `SELECT layout, page, slot_index FROM group_cell
         WHERE group_id = ? AND item_kind = ? AND item_id = ? ORDER BY layout`,
        [groupId, kind, id]);
      recordOp(db, "place_item", { ...args, cells: landed });
      return { moved };
    },
  };
}

/**
 * Add to other boards (027 B9): one transaction and one op for the named
 * destinations at the active size. Groups that already hold the word are
 * skipped, never moved; any failure rolls it all back. Returns the groups
 * added to and an undo() that removes only those.
 */
export function addToGroups(db, kind, id, groupIds, addedAt = null) {
  const layout = activeLayout(db);
  const at = addedAt ?? Date.now();
  const places = txn(db, () => {
    const out = [];
    for (const groupId of groupIds) {
      if (!one(db, "SELECT 1 AS x FROM board_group WHERE id = ?", [groupId])) {
        throw new Error(`no group ${groupId}`);
      }
      if (isMember(db, groupId, kind, id)) continue;
      const c = chooseCell(db, groupId, layout, kind, id);
      insertMember(db, groupId, kind, id, at);
      insertCell(db, groupId, layout, kind, id, c);
      out.push({ groupId, layout, page: c.page, slot_index: c.slot_index });
    }
    return out;
  });
  if (places.length) recordOp(db, "add_to_groups", { kind, id, added_at: at, places });
  return {
    added: places.map((p) => p.groupId),
    undo() {
      for (const p of places) {
        if (isMember(db, p.groupId, kind, id)) removeItem(db, p.groupId, kind, id);
      }
    },
  };
}

/** Replay body of add_to_groups: each place lands where free, else the
 *  first free cell; deleted groups and existing members are skipped. */
export function applyAddToGroups(db, { kind, id, added_at, places }) {
  for (const p of places) {
    if (!one(db, "SELECT 1 AS x FROM board_group WHERE id = ?", [p.groupId])) continue;
    if (isMember(db, p.groupId, kind, id)) continue;
    applyPlace(db, {
      groupId: p.groupId, kind, id, added_at,
      cells: [{ layout: p.layout, page: p.page, slot_index: p.slot_index }],
    });
  }
}



/** Move a group to a free index slot. */
export function moveGroup(db, groupId, slot) {
  const occupant = one(db, "SELECT id FROM board_group WHERE index_slot = ?", [slot]);
  if (occupant) throw new Error(`index slot ${slot} is occupied`);
  const row = one(db, "SELECT id FROM board_group WHERE id = ?", [groupId]);
  if (!row) throw new Error(`no group ${groupId}`);
  db.prepare("UPDATE board_group SET index_slot = ? WHERE id = ?").run(slot, groupId);
  recordOp(db, "move_group", { groupId, slot });
}

/**
 * Swap two groups' index slots. The UNIQUE index_slot constraint forbids
 * the two-step UPDATE, so both rows are deleted and re-inserted swapped in
 * one transaction; deferred FK enforcement keeps their membership rows
 * valid through the gap.
 */
export function swapGroups(db, a, b) {
  txn(db, () => {
    db.exec("PRAGMA defer_foreign_keys = ON");
    const ga = one(db, "SELECT * FROM board_group WHERE id = ?", [a]);
    const gb = one(db, "SELECT * FROM board_group WHERE id = ?", [b]);
    if (!ga || !gb) throw new Error("swapGroups: both groups must exist");
    db.prepare("DELETE FROM board_group WHERE id IN (?, ?)").run(a, b);
    const ins = db.prepare(
      "INSERT INTO board_group (id, kind, name, glyph, photo_key, index_slot, hidden) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    ins.run(ga.id, ga.kind, ga.name, ga.glyph, ga.photo_key, gb.index_slot, ga.hidden);
    ins.run(gb.id, gb.kind, gb.name, gb.glyph, gb.photo_key, ga.index_slot, gb.hidden);
    recordOp(db, "swap_groups", { a, b });
  });
}

/**
 * Give `ids` the index slots they already hold, in the order listed: the
 * first id takes the lowest of those slots, and so on. Other groups are
 * untouched, so a list drag shifts only the groups in between. The UNIQUE
 * index_slot forbids a swap by UPDATE, so the rows first park above every
 * used slot, then land — one transaction, one synced op. Unknown ids throw.
 */
export function reorderGroups(db, ids) {
  const rows = ids.map((id) => {
    const r = one(db, "SELECT id, index_slot FROM board_group WHERE id = ?", [id]);
    if (!r) throw new Error(`no group ${id}`);
    return r;
  });
  const slots = rows.map((r) => r.index_slot).sort((a, b) => a - b);
  if (new Set(ids).size !== ids.length) throw new Error("reorderGroups: duplicate group");
  const moves = rows.map((r, i) => ({ id: r.id, from: r.index_slot, to: slots[i] }))
    .filter((m) => m.from !== m.to);
  if (!moves.length) return;
  txn(db, () => {
    const top = one(db, "SELECT max(index_slot) AS m FROM board_group").m;
    const upd = db.prepare("UPDATE board_group SET index_slot = ? WHERE id = ?");
    moves.forEach((m, i) => upd.run(top + 1 + i, m.id));
    for (const m of moves) upd.run(m.to, m.id);
    recordOp(db, "reorder_groups", { order: ids });
  });
}

/**
 * Drag in a list: move the `ids` block (kept in its current order) to sit
 * just before group `beforeId`, or last when it is null. Groups between
 * the old and new place shift by one block; nothing else moves. Returns
 * { undo } — the same call back to the window's old order.
 */
export function moveGroupBlock(db, ids, beforeId = null) {
  const order = groupIndex(db).map((g) => g.id);
  const block = order.filter((id) => ids.includes(id));
  if (!block.length) throw new Error("moveGroupBlock: no such groups");
  if (beforeId !== null && block.includes(beforeId)) return { undo() {} };
  if (beforeId !== null && !order.includes(beforeId)) throw new Error(`no group ${beforeId}`);
  const rest = order.filter((id) => !block.includes(id));
  const at = beforeId === null ? rest.length : rest.indexOf(beforeId);
  const next = [...rest.slice(0, at), ...block, ...rest.slice(at)];
  let lo = 0;
  while (lo < order.length && order[lo] === next[lo]) lo++;
  let hi = order.length - 1;
  while (hi > lo && order[hi] === next[hi]) hi--;
  if (lo > hi) return { undo() {} };
  const before = order.slice(lo, hi + 1);
  reorderGroups(db, next.slice(lo, hi + 1));
  return { undo: () => reorderGroups(db, before) };
}
