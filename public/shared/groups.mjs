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
 *
 * Barrel + the reads/identity/group-metadata surface. Cell math and
 * plumbing: groups_shared.mjs. Seed install: groups_seed.mjs. Placement
 * and index-order writes: groups_ops.mjs. All public names are
 * re-exported below so importers keep one path.
 */

import { normalizeV1 } from "./normalize.mjs";

// 011 slice 1: every adult edit records an op (Sync_And_Web_Editing § 4).
// Imported lazily-safe: ops.mjs imports this module for replay; the cycle
// resolves because recordOp is only called inside function bodies.
import { recordOp } from "./ops.mjs";
import { SENSE_ART_SQL } from "./images.mjs";
import {
  all, one, requireLocale, txn, activeLayout, lowestFreeIndexSlot,
} from "./groups_shared.mjs";
import { placeItem } from "./groups_ops.mjs";
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
  "person_name",
  "bar_controls",
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
export {
  BAND_ORDER, groupGeometry, shownByReserved, indexVisual, indexSlotAt,
  geometryOf, activeLayout, shownOn, firstFreeCell, missingPositions,
  writePositions, lowestFreeIndexSlot, groupIndex,
} from "./groups_shared.mjs";
export {
  installSeedGroups, applySeedInstall, reseedBuiltinGroups,
} from "./groups_seed.mjs";
export {
  placeItem, applyPlace, moveItem, swapItems, replaceGroupItem, removeItem,
  removeItemUndoable, addToGroups, applyAddToGroups, moveGroup, swapGroups,
  reorderGroups, moveGroupBlock,
} from "./groups_ops.mjs";
