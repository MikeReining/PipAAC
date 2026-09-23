/**
 * Groups — the one container (docs/product/Motor_Grid_And_Art.md § Groups).
 * board_group rows are the index coordinate map (slots 10–59); group_cell
 * rows place items (catalog senses or personal entities) at fixed
 * (page, slot_index) inside a group — slots 2–58, 57 per page. This module
 * is the only code that writes those tables.
 *
 * Pure functions over the minimal db interface shared with import.mjs
 * ({ exec, prepare(sql).run/all }) — one body of logic for node:sqlite
 * tests and the sqlite-wasm browser adapter.
 */

import { normalizeV1 } from "./normalize.mjs";

export const ITEMS_PER_PAGE = 57; // canonical page slots 2..58 (60-cell space)

const FIRST_ITEM_SLOT = 2;
const LAST_ITEM_SLOT = 58;
const FIRST_INDEX_SLOT = 10;
const LAST_INDEX_SLOT = 59;

/* --- any-shape geometry (014 slice 1) ---
 * Storage stays canonical: group_cell holds (page, slot_index) in the
 * 60-cell space (57 items per page) and board_group.index_slot is a
 * 60-space slot. The profile's cell count N only changes how those
 * coordinates are drawn: linear position is preserved, then re-wrapped
 * into pages of N-3 item slots (slot 0 = back, 1 = edit, N-1 = Next).
 * No rows are rewritten when Cells changes — the map is pure. */
export function pageGeom(cells) {
  return { first: FIRST_ITEM_SLOT, last: cells - 2, next: cells - 1, per: cells - 3 };
}
/** Stored (page, slot_index) → linear position in the canonical strip. */
export function canonPos(page, slotIndex) {
  return page * ITEMS_PER_PAGE + (slotIndex - FIRST_ITEM_SLOT);
}
/** Linear position → stored (page, slot_index). Inverse of canonPos. */
export function canonCell(pos) {
  return { page: Math.floor(pos / ITEMS_PER_PAGE), slot_index: FIRST_ITEM_SLOT + (pos % ITEMS_PER_PAGE) };
}
/** Linear position → where it lands on a `cells`-cell surface. */
export function visualCell(pos, cells) {
  const per = cells - 3;
  return { page: Math.floor(pos / per), slot: FIRST_ITEM_SLOT + (pos % per) };
}
/** Visual (page, slot) on a `cells`-cell surface → linear position.
 *  Inverse of visualCell. */
export function posAtVisual(page, slot, cells) {
  return page * (cells - 3) + (slot - FIRST_ITEM_SLOT);
}
/** Index coordinate → (page, slot) on a `cells`-cell index surface.
 *  The index keeps its canonical slots (10–59 seeded); at 60 cells this
 *  is the identity for every slot below the Next cell. */
export function indexVisual(indexSlot, cells) {
  return visualCell(indexSlot - FIRST_ITEM_SLOT, cells);
}
/** Visual (page, slot) on the index → the canonical index_slot to store. */
export function indexSlotAt(page, slot, cells) {
  return posAtVisual(page, slot, cells) + FIRST_ITEM_SLOT;
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

function hasTable(db, name) {
  return all(
    db,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [name],
  ).length > 0;
}

/** Category name → built-in group id, from the seed. Split groups keep
 *  the category on the larger half (Food, Actions), so e.g. 'Food &
 *  Drink' resolves to grp_food. */
function categoryGroupMap(catalog) {
  return new Map(
    (catalog.groups ?? []).filter((g) => g.category).map((g) => [g.category, g.id]),
  );
}

export function lowestFreeIndexSlot(db) {
  const used = new Set(
    all(db, "SELECT index_slot FROM board_group").map((r) => r.index_slot),
  );
  for (let s = FIRST_INDEX_SLOT; s <= LAST_INDEX_SLOT; s++) {
    if (!used.has(s)) return s;
  }
  return null;
}

// 011 slice 1: every adult edit records an op (Sync_And_Web_Editing § 4).
// Imported lazily-safe: ops.mjs imports this module for replay; the cycle
// resolves because recordOp is only called inside function bodies.
import { recordOp } from "./ops.mjs";
import { SENSE_ART_SQL } from "./images.mjs";

function insertCell(db, groupId, kind, id, page, slot, addedAt = null) {
  db.prepare(
    "INSERT INTO group_cell (group_id, item_kind, item_id, page, slot_index, added_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(groupId, kind, id, page, slot, addedAt);
}

/**
 * Savepoint-scoped transaction: nests cleanly inside an outer savepoint
 * (migrateLegacyGroups) where a bare second BEGIN would throw.
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

/**
 * Seed built-in groups and their cells from the catalog. Also the
 * reconcile: a caregiver's edits always win, and a seeded item is never
 * dropped — when its seeded slot is taken it lands at nextFreeCell.
 */
export function seedGroups(db, catalog) {
  txn(db, () => {
    // Catalog-owned display names: replaced wholesale on every import so
    // a renamed seed reaches existing devices — but only for groups whose
    // board_group.name is still NULL (a caregiver's rename always wins).
    for (const gl of catalog.groupLabels ?? []) {
      db.prepare(
        "INSERT OR REPLACE INTO group_label (group_id, locale, text) VALUES (?, ?, ?)",
      ).run(gl.group_id, gl.locale, gl.text);
    }
    for (const g of catalog.groups ?? []) {
      const exists = one(db, "SELECT id FROM board_group WHERE id = ?", [g.id]);
      if (exists) continue;
      const taken = one(db, "SELECT id FROM board_group WHERE index_slot = ?", [g.index_slot]);
      const slot = taken ? lowestFreeIndexSlot(db) : g.index_slot;
      if (slot === null) throw new Error(`group index full — cannot seed ${g.id}`);
      db.prepare(
        "INSERT INTO board_group (id, kind, name, glyph, photo_key, index_slot) VALUES (?, ?, NULL, ?, NULL, ?)",
      ).run(g.id, g.kind, g.glyph ?? null, slot);
    }
    for (const c of catalog.groupCells ?? []) {
      const present = one(
        db,
        "SELECT 1 AS x FROM group_cell WHERE group_id = ? AND item_kind = ? AND item_id = ?",
        [c.group_id, c.item_kind, c.item_id],
      );
      if (present) continue;
      const taken = one(
        db,
        "SELECT 1 AS x FROM group_cell WHERE group_id = ? AND page = ? AND slot_index = ?",
        [c.group_id, c.page, c.slot_index],
      );
      const cell = taken ? nextFreeCell(db, c.group_id) : c;
      insertCell(db, c.group_id, c.item_kind, c.item_id, cell.page, cell.slot_index);
    }
  });
}

/**
 * One-time migration for a device DB persisted under the pre-groups
 * schema. No-op when zone_slot is absent. Keeps a family's custom groups,
 * their entities, and the caregiver's index arrangement.
 */
export function migrateLegacyGroups(db, catalog) {
  if (!hasTable(db, "zone_slot")) return;
  const groupForCategory = categoryGroupMap(catalog);

  txn(db, () => {
    // Built-in (and My Words) positions: the legacy zone row's slot wins.
    for (const r of all(db, "SELECT zone_key, slot_index FROM zone_slot ORDER BY slot_index")) {
      if (r.zone_key.startsWith("grp_")) continue; // custom groups handled below
      const gid = r.zone_key === "my_words" ? "grp_my_words" : groupForCategory.get(r.zone_key);
      if (!gid) continue;
      const row = one(db, "SELECT index_slot FROM board_group WHERE id = ?", [gid]);
      if (!row || row.index_slot === r.slot_index) continue;
      const occupant = one(db, "SELECT id FROM board_group WHERE index_slot = ?", [r.slot_index]);
      if (occupant) swapGroups(db, gid, occupant.id);
      else moveGroup(db, gid, r.slot_index);
    }

    // Custom groups: same id, name, photo; index slot from their zone row.
    if (hasTable(db, "custom_group")) {
      for (const g of all(db, "SELECT id, name, photo_key FROM custom_group")) {
        if (one(db, "SELECT id FROM board_group WHERE id = ?", [g.id])) continue;
        const legacy = one(db, "SELECT slot_index FROM zone_slot WHERE zone_key = ?", [g.id]);
        let slot = legacy?.slot_index ?? null;
        if (slot === null || one(db, "SELECT id FROM board_group WHERE index_slot = ?", [slot])) {
          slot = lowestFreeIndexSlot(db);
        }
        if (slot === null) throw new Error(`group index full — cannot migrate ${g.id}`);
        db.prepare(
          "INSERT INTO board_group (id, kind, name, glyph, photo_key, index_slot) VALUES (?, 'custom', ?, NULL, ?, ?)",
        ).run(g.id, g.name, g.photo_key ?? null, slot);
      }
      for (const gi of all(db, "SELECT group_id, entity_id FROM group_item ORDER BY slot_index")) {
        placeItem(db, gi.group_id, "entity", gi.entity_id);
      }
    }

    // Entities: a recorded category files into the matching built-in group;
    // a null-category entity in no custom group lands in My Words.
    for (const e of all(db, "SELECT id, category FROM personal_entity")) {
      if (e.category && groupForCategory.has(e.category)) {
        placeItem(db, groupForCategory.get(e.category), "entity", e.id);
      } else if (!e.category) {
        const inCustom = one(
          db,
          `SELECT 1 AS x FROM group_cell gc JOIN board_group g ON g.id = gc.group_id
           WHERE gc.item_kind = 'entity' AND gc.item_id = ? AND g.kind = 'custom'`,
          [e.id],
        );
        if (!inCustom) placeItem(db, "grp_my_words", "entity", e.id);
      }
    }

    db.exec("DROP TABLE IF EXISTS group_item");
    db.exec("DROP TABLE IF EXISTS custom_group");
    db.exec("DROP TABLE IF EXISTS zone_slot");
  });
}

/**
 * One-time migration for devices seeded while built-in names were stored
 * as English text in board_group.name: NULL out the name where it equals
 * that group's en catalog label (it was the seed, not a caregiver
 * choice). Any other value is a rename and is kept. Idempotent — the
 * second run matches nothing.
 */
export function migrateBuiltinGroupNames(db, catalog) {
  const enName = new Map(
    (catalog.groupLabels ?? [])
      .filter((gl) => gl.locale === "en")
      .map((gl) => [gl.group_id, gl.text]),
  );
  txn(db, () => {
    for (const row of all(
      db,
      "SELECT id, name FROM board_group WHERE kind IN ('builtin', 'my_words') AND name IS NOT NULL",
    )) {
      if (enName.get(row.id) === row.name) {
        db.prepare("UPDATE board_group SET name = NULL WHERE id = ?").run(row.id);
      }
    }
  });
}

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

/** The group index: every group at its coordinate, in slot order. */
export function groupIndex(db) {
  return all(
    db,
    "SELECT id, kind, name, glyph, photo_key, index_slot FROM board_group ORDER BY index_slot",
  );
}

/**
 * One visual page of a group at `cells` cells: rows carry their stored
 * canonical (page, slot_index) plus `vpage`/`vslot` — where the cell
 * lands on the current surface. Renderers place by `vslot`; edit calls
 * keep using the canonical coordinates. Entities carry photo_key;
 * senses resolve their approved lemma and symbol key (art).
 */
export function groupPage(db, groupId, page = 0, locale, cells = 60) {
  requireLocale(locale);
  const rows = all(
    db,
    `SELECT gc.item_kind, gc.item_id, gc.page, gc.slot_index,
            COALESCE(l.text, e.spoken_name) AS label,
            COALESCE(s.fitzgerald_role, 'Yellow') AS fitzgerald_role,
            e.photo_key AS photo_key,
            ${SENSE_ART_SQL} AS art
     FROM group_cell gc
     LEFT JOIN sense s ON gc.item_kind = 'sense' AND s.id = gc.item_id
     LEFT JOIN label l ON gc.item_kind = 'sense' AND l.sense_id = gc.item_id
       AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?
     LEFT JOIN personal_entity e ON gc.item_kind = 'entity' AND e.id = gc.item_id
     WHERE gc.group_id = ?
       AND (gc.item_kind = 'sense' OR e.status = 'active')
     ORDER BY gc.page, gc.slot_index`,
    [locale, groupId],
  );
  for (const r of rows) {
    const v = visualCell(canonPos(r.page, r.slot_index), cells);
    r.vpage = v.page;
    r.vslot = v.slot;
  }
  return rows.filter((r) => r.vpage === page);
}

export function pageCount(db, groupId, cells = 60) {
  const row = one(
    db,
    "SELECT MAX(page * ? + slot_index) AS m FROM group_cell WHERE group_id = ?",
    [ITEMS_PER_PAGE, groupId],
  );
  if (row?.m == null) return 1;
  return Math.floor(canonPos(0, row.m) / (cells - 3)) + 1;
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
    `SELECT e.id, e.spoken_name, e.photo_key, e.category,
            COALESCE(g.name, gl.text) AS gname
     FROM personal_entity e
     LEFT JOIN group_cell gc ON gc.item_kind = 'entity' AND gc.item_id = e.id
     LEFT JOIN board_group g ON g.id = gc.group_id
     LEFT JOIN group_label gl ON gl.group_id = g.id AND gl.locale = ?
     WHERE e.status = 'active'
       AND NOT EXISTS (
       SELECT 1 FROM group_cell x
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
         SELECT 1 FROM group_cell gc
         WHERE gc.group_id = ? AND gc.item_kind = 'sense' AND gc.item_id = s.id
       )
     ORDER BY (l.normalized_text = ?) DESC,
              COALESCE(s.category = ?, 0) DESC,
              l.default_for_text DESC, s.id ASC
     LIMIT 4`,
    [like, locale, groupId, prefix, seedCategory],
  );
}

/** Lowest free (page, slot_index), page-major. Pages grow without bound. */
export function nextFreeCell(db, groupId) {
  const taken = new Set(
    all(db, "SELECT page, slot_index FROM group_cell WHERE group_id = ?", [groupId]).map(
      (r) => `${r.page}:${r.slot_index}`,
    ),
  );
  for (let page = 0; ; page++) {
    for (let slot = FIRST_ITEM_SLOT; slot <= LAST_ITEM_SLOT; slot++) {
      if (!taken.has(`${page}:${slot}`)) return { page, slot_index: slot };
    }
  }
}

/** Append an item at the next free cell — or at `cell` when the adult
 *  tapped an empty slot to add there (the slot is the picker). No-op when
 *  already present; an occupied target refuses. */
export function placeItem(db, groupId, kind, id, cell = null, addedAt = null) {
  const existing = one(
    db,
    "SELECT page, slot_index FROM group_cell WHERE group_id = ? AND item_kind = ? AND item_id = ?",
    [groupId, kind, id],
  );
  if (existing) return { page: existing.page, slot_index: existing.slot_index };
  if (cell) {
    const taken = one(
      db,
      "SELECT item_id FROM group_cell WHERE group_id = ? AND page = ? AND slot_index = ?",
      [groupId, cell.page, cell.slot_index],
    );
    if (taken) throw new Error(`group ${groupId} slot ${cell.page}:${cell.slot_index} is occupied`);
  }
  const target = cell ?? nextFreeCell(db, groupId);
  const at = addedAt ?? Date.now();
  insertCell(db, groupId, kind, id, target.page, target.slot_index, at);
  recordOp(db, "place_item", {
    groupId, kind, id, page: target.page, slot_index: target.slot_index, added_at: at,
  });
  return target;
}

/** Move an item to a free slot on any page of the same group. */
export function moveItem(db, groupId, kind, id, page, slot) {
  const taken = one(
    db,
    "SELECT item_id FROM group_cell WHERE group_id = ? AND page = ? AND slot_index = ?",
    [groupId, page, slot],
  );
  if (taken) throw new Error(`group ${groupId} slot ${page}:${slot} is occupied`);
  const row = one(
    db,
    "SELECT 1 AS x FROM group_cell WHERE group_id = ? AND item_kind = ? AND item_id = ?",
    [groupId, kind, id],
  );
  if (!row) throw new Error(`item ${id} is not in group ${groupId}`);
  db.prepare(
    "UPDATE group_cell SET page = ?, slot_index = ? WHERE group_id = ? AND item_kind = ? AND item_id = ?",
  ).run(page, slot, groupId, kind, id);
  recordOp(db, "move_item", { groupId, kind, id, page, slot_index: slot });
}

/**
 * Swap two items' cells. UNIQUE(group_id, page, slot_index) forbids the
 * two-step UPDATE, so this deletes both rows and re-inserts them swapped,
 * in one transaction.
 */
export function swapItems(db, groupId, a, b) {
  txn(db, () => {
    const cellOf = (it) =>
      one(
        db,
        "SELECT page, slot_index, added_at FROM group_cell WHERE group_id = ? AND item_kind = ? AND item_id = ?",
        [groupId, it.item_kind, it.item_id],
      );
    const ca = cellOf(a);
    const cb = cellOf(b);
    if (!ca || !cb) throw new Error("swapItems: both items must be in the group");
    db.prepare(
      "DELETE FROM group_cell WHERE group_id = ? AND item_kind IN (?, ?) AND item_id IN (?, ?)",
    ).run(groupId, a.item_kind, b.item_kind, a.item_id, b.item_id);
    insertCell(db, groupId, a.item_kind, a.item_id, cb.page, cb.slot_index, ca.added_at);
    insertCell(db, groupId, b.item_kind, b.item_id, ca.page, ca.slot_index, cb.added_at);
    recordOp(db, "swap_items", { groupId, a, b });
  });
}

/**
 * Remove an item from a group. A sense can leave a custom or My Words
 * group, never a built-in — built-in contents are the findability
 * guarantee (hiding is masking, docs/product/Vocabulary_Masking_And_Safety.md).
 * An entity removed from its last group lands in My Words, never orphaned.
 */
export function removeItem(db, groupId, kind, id, { allowOrphan = false } = {}) {
  const group = one(db, "SELECT kind FROM board_group WHERE id = ?", [groupId]);
  if (!group) throw new Error(`no group ${groupId}`);
  if (kind === "sense" && group.kind === "builtin") {
    throw new Error("a sense cannot be removed from a built-in group");
  }
  const removed = one(
    db,
    "SELECT added_at FROM group_cell WHERE group_id = ? AND item_kind = ? AND item_id = ?",
    [groupId, kind, id],
  );
  db.prepare(
    "DELETE FROM group_cell WHERE group_id = ? AND item_kind = ? AND item_id = ?",
  ).run(groupId, kind, id);
  if (kind === "entity" && !allowOrphan) {
    const left = one(
      db,
      "SELECT COUNT(*) AS n FROM group_cell WHERE item_kind = 'entity' AND item_id = ?",
      [id],
    ).n;
    // The landing in My Words is the same add re-filed, not a new one —
    // it keeps the removed placement's timestamp (and replay converges).
    if (left === 0) placeItem(db, "grp_my_words", "entity", id, null, removed?.added_at);
  }
  recordOp(db, "remove_item", { groupId, kind, id, allowOrphan });
}

/**
 * removeItem with a way back (Edit-mode × + Undo toast): returns the
 * removed row and an undo() that restores it byte-for-byte — including
 * reverting the never-orphan landing in My Words when it fired.
 */
export function removeItemUndoable(db, groupId, kind, id) {
  const removed = one(
    db,
    "SELECT page, slot_index, added_at FROM group_cell WHERE group_id = ? AND item_kind = ? AND item_id = ?",
    [groupId, kind, id],
  );
  if (!removed) throw new Error(`item ${id} is not in group ${groupId}`);
  const myWordsBefore = kind === "entity" &&
    one(
      db,
      "SELECT 1 AS x FROM group_cell WHERE group_id = 'grp_my_words' AND item_kind = 'entity' AND item_id = ?",
      [id],
    );
  removeItem(db, groupId, kind, id);
  return {
    removed,
    undo() {
      // Both writes go through the write owners so each lands in the op
      // log: drop the never-orphan landing (skips the catch-all it would
      // re-trigger), then restore the exact cell with its added_at.
      if (kind === "entity" && !myWordsBefore) {
        const mw = one(
          db,
          "SELECT 1 AS x FROM group_cell WHERE group_id = 'grp_my_words' AND item_kind = 'entity' AND item_id = ?",
          [id],
        );
        if (mw) removeItem(db, "grp_my_words", "entity", id, { allowOrphan: true });
      }
      placeItem(db, groupId, kind, id, removed, removed.added_at);
    },
  };
}

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
    `SELECT g.id, COALESCE(g.name, gl.text) AS name
     FROM group_cell gc
     JOIN board_group g ON g.id = gc.group_id
     LEFT JOIN group_label gl ON gl.group_id = g.id AND gl.locale = ?
     WHERE gc.item_kind = 'entity' AND gc.item_id = ?
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
     FROM group_cell gc
     JOIN board_group g ON g.id = gc.group_id
     LEFT JOIN group_label gl ON gl.group_id = g.id AND gl.locale = ?
     WHERE gc.item_kind = 'sense' AND gc.item_id = ?
     ORDER BY g.index_slot`,
    [locale, senseId],
  );
}

/** Create a custom group at the lowest free index slot. */
/** Create a personal entity (the + Add "New" path and op replay share
 *  this). `id`/`addedAt` are set by replay so replicas match byte-for-byte;
 *  a fresh save generates them. */
export function createEntity(db, { id = null, name, photoKey = null, category = null, hint = null, addedAt = null }) {
  const eid = id ?? `ent_${crypto.randomUUID().replaceAll("-", "")}`;
  const at = addedAt ?? Date.now();
  db.prepare(
    "INSERT INTO personal_entity (id, spoken_name, photo_key, category, hint, added_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(eid, name, photoKey, category, hint, at);
  recordOp(db, "create_entity", { id: eid, name, photoKey, category, hint, addedAt: at });
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
  "jev_sharing",
  "board_layout",
  "spot_dim",
  "spot_pulse",
  "spot_minutes",
  "spot_boost",
  "model_speaks",
]);
export function setSetting(db, key, value) {
  if (!SYNCED_SETTINGS.has(key)) throw new Error(`setSetting: ${key} is not a synced setting`);
  db.prepare(`UPDATE learner_profile SET ${key} = ? WHERE id = 'prf_local'`).run(value);
  recordOp(db, "set_setting", { key, value });
}

/** Hide or show a catalog word (Masking § 2): a sense_mask row, synced
 *  like every other caregiver edit. The word keeps its core_cell and
 *  group_cells — only the render and the funnel change. */
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

export function createGroup(db, { name, photoKey = null, id = null, indexSlot = null }) {
  const slot = indexSlot ?? lowestFreeIndexSlot(db);
  if (slot === null) throw new Error("group index is full");
  const gid = id ?? `grp_${crypto.randomUUID().replaceAll("-", "")}`;
  db.prepare(
    "INSERT INTO board_group (id, kind, name, glyph, photo_key, index_slot) VALUES (?, 'custom', ?, NULL, ?, ?)",
  ).run(gid, name, photoKey, slot);
  recordOp(db, "create_group", { id: gid, name, photoKey, indexSlot: slot });
  return { id: gid, index_slot: slot };
}

/**
 * Delete a custom group. Entities whose only group it was land in
 * My Words — an entity is never orphaned.
 */
export function deleteGroup(db, groupId) {
  const group = one(db, "SELECT kind FROM board_group WHERE id = ?", [groupId]);
  if (!group) throw new Error(`no group ${groupId}`);
  if (group.kind !== "custom") throw new Error("only custom groups can be deleted");
  const orphans = all(
    db,
    "SELECT item_id, added_at FROM group_cell WHERE group_id = ? AND item_kind = 'entity'",
    [groupId],
  );
  db.prepare("DELETE FROM group_cell WHERE group_id = ?").run(groupId);
  db.prepare("DELETE FROM board_group WHERE id = ?").run(groupId);
  for (const o of orphans) {
    const left = one(
      db,
      "SELECT COUNT(*) AS n FROM group_cell WHERE item_kind = 'entity' AND item_id = ?",
      [o.item_id],
    ).n;
    if (left === 0) placeItem(db, "grp_my_words", "entity", o.item_id, null, o.added_at);
  }
  recordOp(db, "delete_group", { groupId });
}

/**
 * Classifier placement (phase 003 slice 5): read the entity's latest
 * ready entity_enrichment row; when its category_suggestion maps to a
 * built-in group the entity is not already in, place a copy there.
 * Additive only — never removes, never moves, never touches My Words or
 * custom placements. abstained/superseded rows and unmappable categories
 * do nothing. Returns the group id placed into, or null.
 */
export function placeFromEnrichment(db, entityId, catalog) {
  const row = one(
    db,
    `SELECT category_suggestion FROM entity_enrichment
     WHERE entity_id = ? AND status = 'ready'
     ORDER BY rowid DESC`,
    [entityId],
  );
  const gid = row?.category_suggestion
    ? categoryGroupMap(catalog).get(row.category_suggestion)
    : null;
  if (!gid) return null;
  const present = one(
    db,
    "SELECT 1 AS x FROM group_cell WHERE group_id = ? AND item_kind = 'entity' AND item_id = ?",
    [gid, entityId],
  );
  if (present) return null;
  placeItem(db, gid, "entity", entityId);
  return gid;
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
 * one transaction; deferred FK enforcement keeps their group_cell rows
 * valid through the gap.
 */
export function swapGroups(db, a, b) {
  txn(db, () => {
    db.exec("PRAGMA defer_foreign_keys = ON");
    const ga = one(db, "SELECT * FROM board_group WHERE id = ?", [a]);
    const gb = one(db, "SELECT * FROM board_group WHERE id = ?", [b]);
    if (!ga || !gb) throw new Error("swapGroups: both groups must exist");
    db.prepare("DELETE FROM board_group WHERE id IN (?, ?)").run(a, b);
    db.prepare(
      "INSERT INTO board_group (id, kind, name, glyph, photo_key, index_slot) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(ga.id, ga.kind, ga.name, ga.glyph, ga.photo_key, gb.index_slot);
    db.prepare(
      "INSERT INTO board_group (id, kind, name, glyph, photo_key, index_slot) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(gb.id, gb.kind, gb.name, gb.glyph, gb.photo_key, ga.index_slot);
    recordOp(db, "swap_groups", { a, b });
  });
}
