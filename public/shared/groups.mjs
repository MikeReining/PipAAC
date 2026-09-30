/**
 * Groups — the one container (docs/product/Motor_Grid_And_Art.md § Groups,
 * docs/phases/027_Occasion_Boards.md). board_group rows are the index
 * coordinate map (canonical slots from 10, no upper bound). A group holds
 * words — group_membership — and each member's position is stored per board
 * size in group_cell: a real cell of that size's grid, never one of the
 * reserved cells (top row, frame, Next). This module is the only code that
 * writes those tables and the only owner of the reserved-cell and placement
 * rules.
 *
 * Pure functions over the minimal db interface shared with import.mjs
 * ({ exec, prepare(sql).run/all }) — one body of logic for node:sqlite
 * tests and the sqlite-wasm browser adapter.
 */

import { normalizeV1 } from "./normalize.mjs";

const FIRST_INDEX_SLOT = 10;

/** Grammar bands in home-board order (018 D5) — the seed compiler fills
 *  topic groups in this order. */
export const BAND_ORDER = ["Yellow", "Green", "Pink", "Blue", "Purple", "Red"];

/* --- 027 § 3.2: reserved cells ---
 * On every page of every group the top row (row 0), the frame (the home
 * cells of yes/no/stop/help) and the last cell (Next) are reserved: they
 * belong to the page, never to group content. `shape` is a catalog
 * layout — { cols, rows, frame: [home slots of the frame words] } — so
 * the reserved set comes from the size's shipped home layout and never
 * moves. `content` lists the cells groups may use, row by row, left to
 * right — reading order is the one fill order the seed compiler and
 * runtime placement share (026 ruling 2026-09-28). */
export function groupGeometry(shape) {
  const { cols, rows } = shape;
  const cells = cols * rows;
  const frame = [...(shape.frame ?? [])].sort((a, b) => a - b);
  const frameSet = new Set(frame);
  const topRow = [...Array(cols).keys()].filter((s) => !frameSet.has(s));
  const next = cells - 1;
  const reserved = new Set([...topRow, ...frame, next]);
  const content = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const s = r * cols + c;
      if (!reserved.has(s)) content.push(s);
    }
  }
  return { cols, rows, cells, topRow, frame, next, reserved, content };
}

/** Senses a size's group pages already show: home cells (`{ sense_id,
 *  slot_index }`) in the reserved top row and frame. They get no group
 *  position at that size — they would render twice. Next replaces its
 *  home word. The seed compiler and runtime fill share this rule. */
export function shownByReserved(geom, homeCells) {
  const shown = new Set();
  for (const c of homeCells) {
    if (geom.topRow.includes(c.slot_index) || geom.frame.includes(c.slot_index)) shown.add(c.sense_id);
  }
  return shown;
}

/** Index coordinate → (page, slot) on a `cells`-cell index surface: the
 *  canonical slots from 10 wrap into pages of cells − 3 (the index keeps
 *  its pre-027 mapping; at 60 cells it is the identity below Next). */
export function indexVisual(indexSlot, cells) {
  const per = cells - 3;
  return { page: Math.floor((indexSlot - 2) / per), slot: 2 + ((indexSlot - 2) % per) };
}
/** Visual (page, slot) on the index → the canonical index_slot to store. */
export function indexSlotAt(page, slot, cells) {
  return page * (cells - 3) + slot;
}

const all = (db, sql, params = []) => db.prepare(sql).all(...params);
const one = (db, sql, params = []) => all(db, sql, params)[0];

/** Locale is a required parameter everywhere it appears — a missed caller
 *  fails loudly here instead of silently binding NULL on the wasm driver. */
function requireLocale(locale) {
  if (typeof locale !== "string" || locale.length === 0) {
    throw new Error("locale is a required parameter");
  }
}

// 011 slice 1: every adult edit records an op (Sync_And_Web_Editing § 4).
// Imported lazily-safe: ops.mjs imports this module for replay; the cycle
// resolves because recordOp is only called inside function bodies.
import { recordOp } from "./ops.mjs";
import { SENSE_ART_SQL } from "./images.mjs";

/**
 * Savepoint-scoped transaction: nests cleanly inside an outer savepoint
 * where a bare second BEGIN would throw.
 */
function txn(db, fn) {
  db.exec("SAVEPOINT groups_txn");
  try {
    const out = fn();
    db.exec("RELEASE groups_txn");
    return out;
  } catch (err) {
    db.exec("ROLLBACK TO groups_txn");
    db.exec("RELEASE groups_txn");
    throw err;
  }
}

/* --- geometry from the database --- */

/** A board size's group geometry, from the catalog's layout_shape rows.
 *  An unknown size fails loudly — a placement must never guess a grid. */
export function geometryOf(db, layout) {
  const row = one(db, "SELECT cols, rows, frame FROM layout_shape WHERE layout = ?", [layout]);
  if (!row) throw new Error(`no layout shape for ${layout}`);
  return groupGeometry({ cols: row.cols, rows: row.rows, frame: JSON.parse(row.frame) });
}

/** The size groups draw at: the profile's Cells setting when the catalog
 *  knows it, else grid60 (the board's own fallback). */
export function activeLayout(db) {
  const l = one(db, "SELECT board_layout AS l FROM learner_profile WHERE id = 'prf_local'")?.l;
  return l && one(db, "SELECT 1 AS x FROM layout_shape WHERE layout = ?", [l]) ? l : "grid60";
}

/** Senses the page itself shows on `layout`, from the shipped home cells. */
function shownByPage(db, layout) {
  return shownByReserved(geometryOf(db, layout),
    all(db, "SELECT sense_id, slot_index FROM core_cell WHERE layout = ?", [layout]));
}

/** Whether a group shows on a board size: catalog metadata for built-in
 *  groups (the four More groups are grid15-only); custom groups and My
 *  Words show everywhere. */
export function shownOn(db, groupId, layout) {
  const meta = one(db, "SELECT layouts FROM group_meta WHERE group_id = ?", [groupId]);
  return !meta?.layouts || JSON.parse(meta.layouts).includes(layout);
}

const isMember = (db, groupId, kind, id) =>
  !!one(db,
    "SELECT 1 AS x FROM group_membership WHERE group_id = ? AND item_kind = ? AND item_id = ?",
    [groupId, kind, id]);

const cellOf = (db, groupId, layout, kind, id) =>
  one(db,
    `SELECT page, slot_index FROM group_cell
     WHERE group_id = ? AND layout = ? AND item_kind = ? AND item_id = ?`,
    [groupId, layout, kind, id]) ?? null;

function occupiedCells(db, groupId, layout) {
  return new Set(
    all(db, "SELECT page, slot_index FROM group_cell WHERE group_id = ? AND layout = ?",
      [groupId, layout]).map((r) => `${r.page}:${r.slot_index}`),
  );
}

/** Lowest free (page, slot) in content order — a new page when every
 *  existing one is full. */
function lowestFree(geom, taken) {
  for (let page = 0; ; page++) {
    for (const slot of geom.content) {
      if (!taken.has(`${page}:${slot}`)) return { page, slot_index: slot };
    }
  }
}

/** The first free content cell of a group at a size — where a replayed
 *  write lands when its recorded cell was taken first. */
export function firstFreeCell(db, groupId, layout) {
  return lowestFree(geometryOf(db, layout), occupiedCells(db, groupId, layout));
}

const usable = (geom, taken, c) =>
  !!c && geom.content.includes(c.slot_index) && c.page >= 0 && !taken.has(`${c.page}:${c.slot_index}`);

/**
 * 027 § 3.4 — choosing a cell when no target was given: the word's
 * authored seed coordinate in this group, then its position in another
 * group at this size (index order, then group id) — a preference, never a
 * link — then the lowest free cell. `taken` lets a batch see its own
 * earlier choices.
 */
function chooseCell(db, groupId, layout, kind, id, taken = occupiedCells(db, groupId, layout)) {
  const geom = geometryOf(db, layout);
  const seed = one(db,
    `SELECT page, slot_index FROM group_seed_cell
     WHERE group_id = ? AND layout = ? AND item_kind = ? AND item_id = ?`,
    [groupId, layout, kind, id]);
  if (usable(geom, taken, seed)) return { page: seed.page, slot_index: seed.slot_index };
  const elsewhere = all(db,
    `SELECT gc.page, gc.slot_index FROM group_cell gc
     JOIN board_group g ON g.id = gc.group_id
     WHERE gc.layout = ? AND gc.item_kind = ? AND gc.item_id = ? AND gc.group_id != ?
     ORDER BY g.index_slot, g.id`,
    [layout, kind, id, groupId]);
  for (const c of elsewhere) {
    if (usable(geom, taken, c)) return { page: c.page, slot_index: c.slot_index };
  }
  return lowestFree(geom, taken);
}

/** Replay's cell: the recorded one when it is still a free content cell,
 *  else the first free — the earlier occupant always stays (§ 3.4). */
function landing(db, groupId, layout, c) {
  const geom = geometryOf(db, layout);
  const taken = occupiedCells(db, groupId, layout);
  return usable(geom, taken, c) ? { page: c.page, slot_index: c.slot_index } : lowestFree(geom, taken);
}

function insertMember(db, groupId, kind, id, addedAt) {
  db.prepare(
    "INSERT INTO group_membership (group_id, item_kind, item_id, added_at) VALUES (?, ?, ?, ?)",
  ).run(groupId, kind, id, addedAt);
}
function insertCell(db, groupId, layout, kind, id, c) {
  db.prepare(
    `INSERT INTO group_cell (group_id, layout, item_kind, item_id, page, slot_index)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(groupId, layout, kind, id, c.page, c.slot_index);
}

/* --- seed install (027 § 4) --- */

/**
 * Install every catalog group that has no install marker — once, as one
 * `seed_install` op carrying the memberships and positions, so replay and
 * restore never re-derive them from a newer catalog. Called after the
 * rebase baseline is taken (importCatalog owns that order).
 */
export function installSeedGroups(db, catalog) {
  const installed = new Set(all(db, "SELECT group_id FROM group_seed_install").map((r) => r.group_id));
  const groups = (catalog.groups ?? []).filter((g) => !installed.has(g.id)).map((g) => ({
    id: g.id,
    kind: g.kind,
    glyph: g.glyph ?? null,
    index_slot: g.index_slot,
    members: (catalog.groupMembers ?? []).filter((m) => m.group_id === g.id)
      .map((m) => [m.item_kind, m.item_id]),
    cells: (catalog.groupCells ?? []).filter((c) => c.group_id === g.id)
      .map((c) => [c.layout, c.item_kind, c.item_id, c.page, c.slot_index]),
  }));
  if (!groups.length) return;
  const args = { version: catalog.groupSeedVersion ?? "0", groups };
  applySeedInstall(db, args);
  recordOp(db, "seed_install", args);
}

/** Apply a seed install. A group that already has a marker is skipped —
 *  the first install the relay confirmed wins (027 § 4). */
export function applySeedInstall(db, { version, groups }) {
  txn(db, () => {
    for (const g of groups) {
      if (one(db, "SELECT 1 AS x FROM group_seed_install WHERE group_id = ?", [g.id])) continue;
      if (!one(db, "SELECT 1 AS x FROM board_group WHERE id = ?", [g.id])) {
        const taken = one(db, "SELECT 1 AS x FROM board_group WHERE index_slot = ?", [g.index_slot]);
        db.prepare(
          "INSERT INTO board_group (id, kind, name, glyph, photo_key, index_slot) VALUES (?, ?, NULL, ?, NULL, ?)",
        ).run(g.id, g.kind, g.glyph, taken ? lowestFreeIndexSlot(db) : g.index_slot);
      }
      for (const [kind, id] of g.members) insertMember(db, g.id, kind, id, null);
      for (const [layout, kind, id, page, slot] of g.cells) {
        insertCell(db, g.id, layout, kind, id, { page, slot_index: slot });
      }
      db.prepare("INSERT INTO group_seed_install (group_id, seed_version) VALUES (?, ?)").run(g.id, version);
    }
  });
}

/**
 * Forget every installed built-in seed group — markers, board rows,
 * memberships, cells — so the next installSeedGroups rebuilds them from
 * the shipped catalog. Local seed-iteration affordance (the `?reseed`
 * boot flag): a founder reviewing a seed change must see it, while real
 * devices keep § 4's first-install-wins. Custom groups, entities, and
 * My Words (kind != 'builtin') are untouched; a caregiver's edits inside
 * built-in groups go with them. Local only — records no op, so a reseed
 * never propagates to replicas.
 */
export function reseedBuiltinGroups(db) {
  const seeded = all(db,
    `SELECT g.id FROM group_seed_install s JOIN board_group g ON g.id = s.group_id
     WHERE g.kind = 'builtin'`).map((r) => r.id);
  txn(db, () => {
    for (const g of seeded) {
      db.prepare("DELETE FROM group_cell WHERE group_id = ?").run(g);
      db.prepare("DELETE FROM group_membership WHERE group_id = ?").run(g);
      db.prepare("DELETE FROM board_group WHERE id = ?").run(g);
      db.prepare("DELETE FROM group_seed_install WHERE group_id = ?").run(g);
    }
  });
  return seeded.length;
}

/* --- reads --- */

/**
 * The name a group shows: the caregiver's override when one is stored,
 * else the catalog label for the profile locale, else "" — a miss renders
 * glyph-only and never falls back to another locale (schema §7.2).
 */
export function groupDisplayName(db, row, locale) {
  requireLocale(locale);
  if (row.name) return row.name;
  return (
    one(db, "SELECT text FROM group_label WHERE group_id = ? AND locale = ?", [row.id, locale])
      ?.text ?? ""
  );
}

/** The group index: every group at its coordinate, in slot order —
 *  hidden ones included (they keep their slot; the renderer skips them). */
export function groupIndex(db) {
  return all(
    db,
    "SELECT id, kind, name, glyph, photo_key, index_slot, hidden FROM board_group ORDER BY index_slot",
  );
}

/**
 * One page of a group at a board size: the members positioned there, each
 * at its real cell (`slot_index`). Entities carry photo_key; senses
 * resolve their approved lemma and symbol key (art).
 */
export function groupPage(db, groupId, page = 0, locale, layout = activeLayout(db)) {
  requireLocale(locale);
  return all(
    db,
    `SELECT gc.item_kind, gc.item_id, gc.page, gc.slot_index,
            COALESCE(l.text, e.spoken_name) AS label,
            COALESCE(s.fitzgerald_role, e.fitzgerald_role, 'Yellow') AS fitzgerald_role,
            e.photo_key AS photo_key,
            ${SENSE_ART_SQL} AS art
     FROM group_cell gc
     LEFT JOIN sense s ON gc.item_kind = 'sense' AND s.id = gc.item_id
     LEFT JOIN label l ON gc.item_kind = 'sense' AND l.sense_id = gc.item_id
       AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?
     LEFT JOIN personal_entity e ON gc.item_kind = 'entity' AND e.id = gc.item_id
     WHERE gc.group_id = ? AND gc.layout = ? AND gc.page = ?
       AND (gc.item_kind = 'sense' OR e.status = 'active')
     ORDER BY gc.slot_index`,
    [locale, groupId, layout, page],
  );
}

/** Pages at a size: one plus the highest content page (minimum one).
 *  Empty pages in between remain; a removal never changes another
 *  word's page. */
export function pageCount(db, groupId, layout = activeLayout(db)) {
  const row = one(db, "SELECT MAX(page) AS m FROM group_cell WHERE group_id = ? AND layout = ?",
    [groupId, layout]);
  return row?.m == null ? 1 : row.m + 1;
}

/**
 * Add-flow matches: the family's own entities whose name starts with the
 * typed prefix, excluding records already in the target group (placing
 * one there would silently no-op on the PK). Each row carries the groups
 * the entity already sits in — the "(in Animals)" subtitle. The target
 * group's seed category ranks, never filters (Word_Library § 5.1).
 */
export function entityMatches(db, text, groupId, locale, seedCategory = null) {
  requireLocale(locale);
  const prefix = normalizeV1(text);
  if (!prefix) return [];
  const rows = all(
    db,
    `SELECT e.id, e.spoken_name, e.photo_key, e.category, e.fitzgerald_role,
            COALESCE(g.name, gl.text) AS gname
     FROM personal_entity e
     LEFT JOIN group_membership gm ON gm.item_kind = 'entity' AND gm.item_id = e.id
     LEFT JOIN board_group g ON g.id = gm.group_id
     LEFT JOIN group_label gl ON gl.group_id = g.id AND gl.locale = ?
     WHERE e.status = 'active'
       AND NOT EXISTS (
       SELECT 1 FROM group_membership x
       WHERE x.group_id = ? AND x.item_kind = 'entity' AND x.item_id = e.id
     )
     ORDER BY g.index_slot`,
    [locale, groupId],
  );
  const byId = new Map();
  for (const r of rows) {
    if (!byId.has(r.id)) {
      byId.set(r.id, {
        id: r.id,
        name: r.spoken_name,
        photo_key: r.photo_key,
        fitzgerald_role: r.fitzgerald_role,
        boost: seedCategory !== null && r.category === seedCategory ? 1 : 0,
        exact: normalizeV1(r.spoken_name) === prefix ? 1 : 0,
        groups: [],
      });
    }
    if (r.gname) byId.get(r.id).groups.push(r.gname);
  }
  return [...byId.values()]
    .filter((e) => normalizeV1(e.name).startsWith(prefix))
    .sort((a, b) => b.exact - a.exact || b.boost - a.boost || a.name.localeCompare(b.name))
    .slice(0, 4);
}

/**
 * Add-flow matches: up to 4 approved lemmas whose normalized text
 * starts with the typed prefix, excluding senses already in the target
 * group (placing one there would silently no-op on the PK). Rank: exact
 * match, then the target group's seed category (the group ranks, never
 * hides — Word_Library § 5.1), then default_for_text, then lexicon slot.
 */
export function catalogMatches(db, text, groupId, locale, seedCategory = null) {
  requireLocale(locale);
  const prefix = normalizeV1(text);
  if (!prefix) return [];
  const like =
    prefix.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_") + "%";
  return all(
    db,
    `SELECT s.id, l.text AS label, s.fitzgerald_role,
            ${SENSE_ART_SQL} AS art
     FROM label l JOIN sense s ON s.id = l.sense_id
     WHERE l.normalized_text LIKE ? ESCAPE '\\'
       AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?
       AND NOT EXISTS (
         SELECT 1 FROM group_membership gm
         WHERE gm.group_id = ? AND gm.item_kind = 'sense' AND gm.item_id = s.id
       )
     ORDER BY (l.normalized_text = ?) DESC,
              COALESCE(s.category = ?, 0) DESC,
              l.default_for_text DESC, s.id ASC
     LIMIT 4`,
    [like, locale, groupId, prefix, seedCategory],
  );
}

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

/* --- Cells changes (027 § 3.3) --- */

/**
 * The positions a size is missing: every member with no cell at `layout`
 * (and not shown by that size's reserved cells) in every group that shows
 * on that size, placed by the placement rule — groups in index order,
 * members oldest first. Computed at edit
 * time and carried by the Cells-switch op, so replay never recomputes it.
 */
export function missingPositions(db, layout) {
  const shown = shownByPage(db, layout);
  const out = [];
  for (const g of all(db, "SELECT id FROM board_group ORDER BY index_slot, id")) {
    if (!shownOn(db, g.id, layout)) continue;
    const taken = occupiedCells(db, g.id, layout);
    const todo = all(db,
      `SELECT gm.item_kind, gm.item_id FROM group_membership gm
       WHERE gm.group_id = ? AND NOT EXISTS (
         SELECT 1 FROM group_cell gc WHERE gc.group_id = gm.group_id AND gc.layout = ?
           AND gc.item_kind = gm.item_kind AND gc.item_id = gm.item_id)
       ORDER BY COALESCE(gm.added_at, 0), gm.rowid`,
      [g.id, layout]);
    for (const m of todo) {
      if (m.item_kind === "sense" && shown.has(m.item_id)) continue;
      const c = chooseCell(db, g.id, layout, m.item_kind, m.item_id, taken);
      taken.add(`${c.page}:${c.slot_index}`);
      out.push({ groupId: g.id, kind: m.item_kind, id: m.item_id, page: c.page, slot_index: c.slot_index });
    }
  }
  return out;
}

/** Write a size's missing positions (the Cells switch, and its replay):
 *  each lands where recorded when still free, else the first free cell;
 *  members removed meanwhile are skipped. */
export function writePositions(db, layout, cells) {
  txn(db, () => {
    for (const c of cells) {
      if (!isMember(db, c.groupId, c.kind, c.id)) continue;
      if (cellOf(db, c.groupId, layout, c.kind, c.id)) continue;
      insertCell(db, c.groupId, layout, c.kind, c.id, landing(db, c.groupId, layout, c));
    }
  });
}

/* --- word identity (Word_Library § 4) --- */

/**
 * The word card's edits (Word_Library § 4). Rename supersedes the ready
 * recording override and enrichment — the old name must not keep playing
 * (schema § 6.2). The rows stay; only their status moves.
 */
export function renameEntity(db, id, newName) {
  const name = newName.trim();
  if (!name) throw new Error("renameEntity: empty name");
  // The supersede triggers (entity_rename_supersedes_override,
  // entity_input_change_supersedes_enrichment) retire the ready override
  // and enrichment on UPDATE — the old name cannot keep playing.
  db.prepare("UPDATE personal_entity SET spoken_name = ? WHERE id = ?").run(name, id);
  recordOp(db, "rename_entity", { id, name });
}

/** The family's kind pick (018 D7) — the tile repaints in the new band
 *  everywhere the word surfaces. null keeps the Yellow default. */
export function setEntityRole(db, id, role) {
  db.prepare("UPDATE personal_entity SET fitzgerald_role = ? WHERE id = ?").run(role, id);
  recordOp(db, "set_entity_role", { id, role });
}

/** "Describe it" (029 § 4.1): what the picture should show — it steers
 *  a redraw and is the hint enrichment reads. Blank clears it. */
export function setEntityHint(db, id, hint) {
  const h = typeof hint === "string" && hint.trim() ? hint.trim() : null;
  db.prepare("UPDATE personal_entity SET hint = ? WHERE id = ?").run(h, id);
  recordOp(db, "set_entity_hint", { id, hint: h });
}

/** Retire, never delete: the entity renders nowhere until restored. */
export function retireEntity(db, id) {
  db.prepare("UPDATE personal_entity SET status = 'retired' WHERE id = ?").run(id);
  recordOp(db, "retire_entity", { id });
}
export function restoreEntity(db, id) {
  db.prepare("UPDATE personal_entity SET status = 'active' WHERE id = ?").run(id);
  recordOp(db, "restore_entity", { id });
}

/** The groups an entity sits in, index order — the card's chips. */
export function entityGroups(db, entityId, locale) {
  requireLocale(locale);
  return all(
    db,
    `SELECT g.id, g.kind, COALESCE(g.name, gl.text) AS name
     FROM group_membership gm
     JOIN board_group g ON g.id = gm.group_id
     LEFT JOIN group_label gl ON gl.group_id = g.id AND gl.locale = ?
     WHERE gm.item_kind = 'entity' AND gm.item_id = ?
     ORDER BY g.index_slot`,
    [locale, entityId],
  );
}

/** The groups a sense sits in — the card's chips for a catalog word. */
export function senseGroups(db, senseId, locale) {
  requireLocale(locale);
  return all(
    db,
    `SELECT g.id, g.kind, COALESCE(g.name, gl.text) AS name
     FROM group_membership gm
     JOIN board_group g ON g.id = gm.group_id
     LEFT JOIN group_label gl ON gl.group_id = g.id AND gl.locale = ?
     WHERE gm.item_kind = 'sense' AND gm.item_id = ?
     ORDER BY g.index_slot`,
    [locale, senseId],
  );
}

/** Create a personal entity (the + Add "New" path and op replay share
 *  this). `id`/`addedAt` are set by replay so replicas match byte-for-byte;
 *  a fresh save generates them. */
export function createEntity(db, { id = null, name, photoKey = null, category = null, hint = null, addedAt = null, role = null }) {
  const eid = id ?? `ent_${crypto.randomUUID().replaceAll("-", "")}`;
  const at = addedAt ?? Date.now();
  db.prepare(
    "INSERT INTO personal_entity (id, spoken_name, photo_key, category, hint, added_at, fitzgerald_role) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(eid, name, photoKey, category, hint, at, role);
  recordOp(db, "create_entity", { id: eid, name, photoKey, category, hint, addedAt: at, role });
  return { id: eid, added_at: at };
}

/** The card's photo change — the picture is the entity's face. */
export function setEntityPhoto(db, id, photoKey) {
  db.prepare("UPDATE personal_entity SET photo_key = ? WHERE id = ?").run(photoKey, id);
  recordOp(db, "set_entity_photo", { id, photoKey });
}

/** A synced profile setting (Sync_And_Web_Editing § 2). Allowlisted — an
 *  op cannot reach an arbitrary column. */
const SYNCED_SETTINGS = new Set([
  "preferred_voice_id",
  "keyboard_mode",
  "keyboard_order",
  "highlight_next",
  "board_layout",
  "spot_dim",
  "spot_pulse",
  "spot_minutes",
  "model_speaks",
  "share_research",
  "research_id",
  "presentation_mode",
  "speech_rate",
  "fresh_after_speak",
  "grammar_help",
  "expressive_voice",
  "group_top_row",
  "occasions_visible",
]);
export function setSetting(db, key, value) {
  if (!SYNCED_SETTINGS.has(key)) throw new Error(`setSetting: ${key} is not a synced setting`);
  db.prepare(`UPDATE learner_profile SET ${key} = ? WHERE id = 'prf_local'`).run(value);
  recordOp(db, "set_setting", { key, value });
}

/** Hide or show a catalog word (Masking § 2): a sense_mask row, synced
 *  like every other caregiver edit. The word keeps its core_cell and
 *  group positions — only the render and the funnel change. */
export function setMask(db, senseId, hidden) {
  db.prepare(
    `INSERT INTO sense_mask (sense_id, status) VALUES (?, ?)
     ON CONFLICT(sense_id) DO UPDATE SET status = excluded.status`,
  ).run(senseId, hidden ? "hidden" : "shown");
  recordOp(db, "set_mask", { senseId, hidden });
}

/** The hidden sense ids — renderers and the funnel consult this. */
export function maskedSenseIds(db) {
  return new Set(
    db.prepare("SELECT sense_id FROM sense_mask WHERE status = 'hidden'").all()
      .map((r) => r.sense_id),
  );
}

/* --- the index --- */

export function lowestFreeIndexSlot(db) {
  const used = new Set(all(db, "SELECT index_slot FROM board_group").map((r) => r.index_slot));
  let s = FIRST_INDEX_SLOT;
  while (used.has(s)) s++;
  return s;
}

/** Create a custom group at the lowest free index slot. It starts empty;
 *  its reserved cells show like any group's. */
export function createGroup(db, { name, photoKey = null, id = null, indexSlot = null }) {
  const slot = indexSlot ?? lowestFreeIndexSlot(db);
  const gid = id ?? `grp_${crypto.randomUUID().replaceAll("-", "")}`;
  db.prepare(
    "INSERT INTO board_group (id, kind, name, glyph, photo_key, index_slot) VALUES (?, 'custom', ?, NULL, ?, ?)",
  ).run(gid, name, photoKey, slot);
  recordOp(db, "create_group", { id: gid, name, photoKey, indexSlot: slot });
  return { id: gid, index_slot: slot };
}

/** Delete a custom group — its positions and memberships go with it; the
 *  words themselves stay in the Library. Built-in groups are hidden, not
 *  deleted. */
export function deleteGroup(db, groupId) {
  const group = one(db, "SELECT kind FROM board_group WHERE id = ?", [groupId]);
  if (!group) throw new Error(`no group ${groupId}`);
  if (group.kind !== "custom") throw new Error("only custom groups can be deleted");
  txn(db, () => {
    db.prepare("DELETE FROM group_cell WHERE group_id = ?").run(groupId);
    db.prepare("DELETE FROM group_membership WHERE group_id = ?").run(groupId);
    db.prepare("DELETE FROM board_group WHERE id = ?").run(groupId);
  });
  recordOp(db, "delete_group", { groupId });
}

/** Rename a group (031 § 7). A stored name is always the override — a
 *  built-in's shipped label stays in group_label, untouched. */
export function renameGroup(db, groupId, name) {
  const clean = String(name ?? "").trim().replace(/\s+/g, " ");
  if (!clean) throw new Error("renameGroup: empty name");
  if (!one(db, "SELECT 1 AS x FROM board_group WHERE id = ?", [groupId])) {
    throw new Error(`no group ${groupId}`);
  }
  db.prepare("UPDATE board_group SET name = ? WHERE id = ?").run(clean, groupId);
  recordOp(db, "rename_group", { groupId, name: clean });
}

/** A group's face from our ink icon set (031 § 7): `icon:<name>` names
 *  /icons/groups/<name>.svg; null goes back to the default face. */
export function setGroupGlyph(db, groupId, glyph) {
  if (glyph != null && !/^icon:[a-z0-9_]+$/.test(glyph)) {
    throw new Error(`setGroupGlyph: bad glyph ${glyph}`);
  }
  if (!one(db, "SELECT 1 AS x FROM board_group WHERE id = ?", [groupId])) {
    throw new Error(`no group ${groupId}`);
  }
  db.prepare("UPDATE board_group SET glyph = ? WHERE id = ?").run(glyph, groupId);
  recordOp(db, "set_group_glyph", { groupId, glyph });
}

/** Delete a family's own group with Undo (031 § 7): the words stay in the
 *  Library; undo brings the group back at its slot (when still free) with
 *  its words where they were at the current size. Other sizes re-derive
 *  their positions, as for any placement. */
export function deleteGroupUndoable(db, groupId) {
  const g = one(db, "SELECT * FROM board_group WHERE id = ?", [groupId]);
  if (!g) throw new Error(`no group ${groupId}`);
  const layout = activeLayout(db);
  const members = all(db,
    `SELECT gm.item_kind, gm.item_id, gm.added_at, gc.page, gc.slot_index
     FROM group_membership gm
     LEFT JOIN group_cell gc ON gc.group_id = gm.group_id AND gc.item_kind = gm.item_kind
       AND gc.item_id = gm.item_id AND gc.layout = ?
     WHERE gm.group_id = ? ORDER BY gm.added_at`,
    [layout, groupId]);
  deleteGroup(db, groupId);
  let done = false;
  return {
    undo() {
      if (done) return;
      done = true;
      const slotFree = !one(db, "SELECT 1 AS x FROM board_group WHERE index_slot = ?", [g.index_slot]);
      createGroup(db, { id: g.id, name: g.name, photoKey: g.photo_key, indexSlot: slotFree ? g.index_slot : null });
      if (g.glyph?.startsWith("icon:")) setGroupGlyph(db, g.id, g.glyph);
      if (g.hidden) setGroupHidden(db, g.id, true);
      for (const m of members) {
        const cell = m.page == null ? null : { page: m.page, slot_index: m.slot_index };
        try {
          placeItem(db, g.id, m.item_kind, m.item_id, cell, m.added_at);
        } catch {
          placeItem(db, g.id, m.item_kind, m.item_id, null, m.added_at); // its cell was taken
        }
      }
    },
  };
}

/** Hide or show a group: it keeps membership, positions and its index
 *  slot — nothing compacts (027 B8). */
export function setGroupHidden(db, groupId, hidden) {
  if (!one(db, "SELECT 1 AS x FROM board_group WHERE id = ?", [groupId])) {
    throw new Error(`no group ${groupId}`);
  }
  db.prepare("UPDATE board_group SET hidden = ? WHERE id = ?").run(hidden ? 1 : 0, groupId);
  recordOp(db, "set_group_hidden", { groupId, hidden: !!hidden });
}

/**
 * 014 slice 11 (§ 7a ruling 4): which active entity stands in for this
 * catalog sense — Mama for `mom`. The mapping is enrichment's
 * sense_suggestion (an enrichment judgment, never asked of the adult); the
 * latest ready row wins. Returns the entity row for a stand-in card,
 * or null. A retired entity never stands in, and the rename/photo
 * trigger supersedes stale suggestions on its own.
 */
export function entityForSense(db, senseId) {
  return one(
    db,
    `SELECT e.id, e.spoken_name, e.photo_key FROM entity_enrichment r
     JOIN personal_entity e ON e.id = r.entity_id
     WHERE r.sense_suggestion = ? AND r.status = 'ready' AND e.status = 'active'
     ORDER BY r.rowid DESC`,
    [senseId],
  ) ?? null;
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
