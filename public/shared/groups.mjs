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

export const ITEMS_PER_PAGE = 57; // page slots 2..58

const FIRST_ITEM_SLOT = 2;
const LAST_ITEM_SLOT = 58;
const FIRST_INDEX_SLOT = 10;
const LAST_INDEX_SLOT = 59;

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

function lowestFreeIndexSlot(db) {
  const used = new Set(
    all(db, "SELECT index_slot FROM board_group").map((r) => r.index_slot),
  );
  for (let s = FIRST_INDEX_SLOT; s <= LAST_INDEX_SLOT; s++) {
    if (!used.has(s)) return s;
  }
  return null;
}

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
 * One page of a group: items at their stored slots, joined to label and
 * Fitzgerald role. Entities carry photo_key; senses resolve their approved
 * English lemma and their approved symbol key (art, null until art ships).
 */
export function groupPage(db, groupId, page = 0, locale) {
  requireLocale(locale);
  return all(
    db,
    `SELECT gc.item_kind, gc.item_id, gc.slot_index,
            COALESCE(l.text, e.spoken_name) AS label,
            COALESCE(s.fitzgerald_role, 'Yellow') AS fitzgerald_role,
            e.photo_key AS photo_key,
            (SELECT i.key FROM image i
              WHERE i.id = s.default_image_id AND i.status = 'approved') AS art
     FROM group_cell gc
     LEFT JOIN sense s ON gc.item_kind = 'sense' AND s.id = gc.item_id
     LEFT JOIN label l ON gc.item_kind = 'sense' AND l.sense_id = gc.item_id
       AND l.kind = 'lemma' AND l.status = 'approved' AND l.locale = ?
     LEFT JOIN personal_entity e ON gc.item_kind = 'entity' AND e.id = gc.item_id
     WHERE gc.group_id = ? AND gc.page = ?
       AND (gc.item_kind = 'sense' OR e.status = 'active')
     ORDER BY gc.slot_index`,
    [locale, groupId, page],
  );
}

export function pageCount(db, groupId) {
  const row = one(db, "SELECT MAX(page) AS m FROM group_cell WHERE group_id = ?", [groupId]);
  return (row?.m ?? 0) + 1;
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
            (SELECT i.key FROM image i
              WHERE i.id = s.default_image_id AND i.status = 'approved') AS art
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
export function placeItem(db, groupId, kind, id, cell = null) {
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
  insertCell(db, groupId, kind, id, target.page, target.slot_index, Date.now());
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
  });
}

/**
 * Remove an item from a group. A sense can leave a custom or My Words
 * group, never a built-in — built-in contents are the findability
 * guarantee (hiding is masking, docs/product/Vocabulary_Masking_And_Safety.md).
 * An entity removed from its last group lands in My Words, never orphaned.
 */
export function removeItem(db, groupId, kind, id) {
  const group = one(db, "SELECT kind FROM board_group WHERE id = ?", [groupId]);
  if (!group) throw new Error(`no group ${groupId}`);
  if (kind === "sense" && group.kind === "builtin") {
    throw new Error("a sense cannot be removed from a built-in group");
  }
  db.prepare(
    "DELETE FROM group_cell WHERE group_id = ? AND item_kind = ? AND item_id = ?",
  ).run(groupId, kind, id);
  if (kind === "entity") {
    const left = one(
      db,
      "SELECT COUNT(*) AS n FROM group_cell WHERE item_kind = 'entity' AND item_id = ?",
      [id],
    ).n;
    if (left === 0) placeItem(db, "grp_my_words", "entity", id);
  }
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
      if (kind === "entity" && !myWordsBefore) {
        db.prepare(
          "DELETE FROM group_cell WHERE group_id = 'grp_my_words' AND item_kind = 'entity' AND item_id = ?",
        ).run(id);
      }
      insertCell(db, groupId, kind, id, removed.page, removed.slot_index, removed.added_at);
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
  txn(db, () => {
    db.prepare("UPDATE personal_entity SET spoken_name = ? WHERE id = ?").run(name, id);
    db.prepare(
      "UPDATE clip_override SET status = 'superseded' WHERE entity_id = ? AND status = 'ready'",
    ).run(id);
    db.prepare(
      "UPDATE entity_enrichment SET status = 'superseded' WHERE entity_id = ? AND status = 'ready'",
    ).run(id);
  });
}

/** Retire, never delete: the entity renders nowhere until restored. */
export function retireEntity(db, id) {
  db.prepare("UPDATE personal_entity SET status = 'retired' WHERE id = ?").run(id);
}
export function restoreEntity(db, id) {
  db.prepare("UPDATE personal_entity SET status = 'active' WHERE id = ?").run(id);
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
export function createGroup(db, { name, photoKey = null }) {
  const slot = lowestFreeIndexSlot(db);
  if (slot === null) throw new Error("group index is full");
  const id = `grp_${crypto.randomUUID().replaceAll("-", "")}`;
  db.prepare(
    "INSERT INTO board_group (id, kind, name, glyph, photo_key, index_slot) VALUES (?, 'custom', ?, NULL, ?, ?)",
  ).run(id, name, photoKey, slot);
  return { id, index_slot: slot };
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
    "SELECT item_id FROM group_cell WHERE group_id = ? AND item_kind = 'entity'",
    [groupId],
  ).map((r) => r.item_id);
  db.prepare("DELETE FROM group_cell WHERE group_id = ?").run(groupId);
  db.prepare("DELETE FROM board_group WHERE id = ?").run(groupId);
  for (const id of orphans) {
    const left = one(
      db,
      "SELECT COUNT(*) AS n FROM group_cell WHERE item_kind = 'entity' AND item_id = ?",
      [id],
    ).n;
    if (left === 0) placeItem(db, "grp_my_words", "entity", id);
  }
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
  });
}
