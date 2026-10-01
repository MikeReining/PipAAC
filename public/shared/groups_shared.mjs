/** Groups — cell math and shared db plumbing (docs/product/Motor_Grid_And_Art.md
 *  § Groups, docs/phases/027_Occasion_Boards.md). Owns the reserved-cell rules,
 *  the pure geometry, the db-backed layout reads, and the tiny helpers every
 *  group write stands on. Pure functions over the minimal db interface shared
 *  with import.mjs ({ exec, prepare(sql).run/all }).
 */
const FIRST_INDEX_SLOT = 10;

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

export const all = (db, sql, params = []) => db.prepare(sql).all(...params);
export const one = (db, sql, params = []) => all(db, sql, params)[0];

/** Locale is a required parameter everywhere it appears — a missed caller
 *  fails loudly here instead of silently binding NULL on the wasm driver. */
export function requireLocale(locale) {
  if (typeof locale !== "string" || locale.length === 0) {
    throw new Error("locale is a required parameter");
  }
}

/**
 * Savepoint-scoped transaction: nests cleanly inside an outer savepoint
 * where a bare second BEGIN would throw.
 */
export function txn(db, fn) {
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
export function shownByPage(db, layout) {
  return shownByReserved(geometryOf(db, layout),
    all(db, "SELECT sense_id, slot_index FROM core_cell WHERE layout = ?", [layout]));
}

/** Whether a group shows on a board size: catalog metadata for built-in
 *  groups (the More groups are grid15-only or grid30-only); custom groups and My
 *  Words show everywhere. */
export function shownOn(db, groupId, layout) {
  const meta = one(db, "SELECT layouts FROM group_meta WHERE group_id = ?", [groupId]);
  return !meta?.layouts || JSON.parse(meta.layouts).includes(layout);
}

export const isMember = (db, groupId, kind, id) =>
  !!one(db,
    "SELECT 1 AS x FROM group_membership WHERE group_id = ? AND item_kind = ? AND item_id = ?",
    [groupId, kind, id]);

export const cellOf = (db, groupId, layout, kind, id) =>
  one(db,
    `SELECT page, slot_index FROM group_cell
     WHERE group_id = ? AND layout = ? AND item_kind = ? AND item_id = ?`,
    [groupId, layout, kind, id]) ?? null;

export function occupiedCells(db, groupId, layout) {
  return new Set(
    all(db, "SELECT page, slot_index FROM group_cell WHERE group_id = ? AND layout = ?",
      [groupId, layout]).map((r) => `${r.page}:${r.slot_index}`),
  );
}

/** Lowest free (page, slot) in content order — a new page when every
 *  existing one is full. */
export function lowestFree(geom, taken) {
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

export const usable = (geom, taken, c) =>
  !!c && geom.content.includes(c.slot_index) && c.page >= 0 && !taken.has(`${c.page}:${c.slot_index}`);

/**
 * 027 § 3.4 — choosing a cell when no target was given: the word's
 * authored seed coordinate in this group, then its position in another
 * group at this size (index order, then group id) — a preference, never a
 * link — then the lowest free cell. `taken` lets a batch see its own
 * earlier choices.
 */
export function chooseCell(db, groupId, layout, kind, id, taken = occupiedCells(db, groupId, layout)) {
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
export function landing(db, groupId, layout, c) {
  const geom = geometryOf(db, layout);
  const taken = occupiedCells(db, groupId, layout);
  return usable(geom, taken, c) ? { page: c.page, slot_index: c.slot_index } : lowestFree(geom, taken);
}

export function insertMember(db, groupId, kind, id, addedAt) {
  db.prepare(
    "INSERT INTO group_membership (group_id, item_kind, item_id, added_at) VALUES (?, ?, ?, ?)",
  ).run(groupId, kind, id, addedAt);
}
export function insertCell(db, groupId, layout, kind, id, c) {
  db.prepare(
    `INSERT INTO group_cell (group_id, layout, item_kind, item_id, page, slot_index)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(groupId, layout, kind, id, c.page, c.slot_index);
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

/* --- the index --- */

export function lowestFreeIndexSlot(db) {
  const used = new Set(all(db, "SELECT index_slot FROM board_group").map((r) => r.index_slot));
  let s = FIRST_INDEX_SLOT;
  while (used.has(s)) s++;
  return s;
}

/** The group index: every group at its coordinate, in slot order —
 *  hidden ones included (they keep their slot; the renderer skips them). */
export function groupIndex(db) {
  return all(
    db,
    "SELECT id, kind, name, glyph, photo_key, index_slot, hidden FROM board_group ORDER BY index_slot",
  );
}

